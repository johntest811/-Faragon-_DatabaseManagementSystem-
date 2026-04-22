"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import { AccessTabs } from "../Components/AccessTabs";
import { RoleDialog } from "./RoleDialog";
import { PencilLine, Plus, Trash2, X } from "lucide-react";
import {
	columnsForModule,
	formatPermissionColumnLabel,
	groupedCatalog,
	normalizeModuleKey,
	shouldHidePermissionColumn,
	visibleColumnsForModule,
} from "../Components/permissionCatalog";

type RoleRow = { role_id: string; role_name: string };
type ModuleRow = { module_key: string; display_name: string };
type AccessRow = { role_id: string; module_key: string };
type RoleColumnAccessRow = {
	role_id: string;
	module_key: string;
	column_key: string;
	can_read: boolean | null;
};

function getErrorMessage(e: unknown) {
	if (e instanceof Error) return e.message;
	if (e && typeof e === "object" && "message" in e) {
		const message = String((e as { message?: unknown }).message ?? "").trim();
		if (message) return message;
	}
	return "Something went wrong";
}

function labelFromRole(roleName: string) {
	const raw = (roleName ?? "").trim();
	if (!raw) return "(unnamed role)";
	return raw
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function normalizeRoleName(roleName: string) {
	return String(roleName ?? "").trim().toLowerCase();
}

type RoleDialogMode = "create" | "edit";

export default function RolesPage() {
	const router = useRouter();
	const { role } = useAuthRole();

	type ElectronAuditEvent = {
		actor_user_id: string | null;
		actor_email: string | null;
		action: string;
		page: string;
		details: Record<string, unknown> | null;
	};

	type ElectronApi = {
		audit?: {
			logEvent?: (event: ElectronAuditEvent) => Promise<void> | void;
		};
	};

	function getElectronApi(): ElectronApi | null {
		const maybe = (globalThis as unknown as { electronAPI?: unknown }).electronAPI;
		if (!maybe || typeof maybe !== "object") return null;
		return maybe as ElectronApi;
	}

	const api = getElectronApi();

	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	const [roles, setRoles] = useState<RoleRow[]>([]);
	const [modules, setModules] = useState<ModuleRow[]>([]);
	const [access, setAccess] = useState<Record<string, Set<string>>>({});
	const [roleColumnAccess, setRoleColumnAccess] = useState<Record<string, Record<string, Set<string>>>>({});
	const [roleColumnRestrictedModules, setRoleColumnRestrictedModules] = useState<Record<string, Set<string>>>({});
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");
	const [savingKey, setSavingKey] = useState<string>("");
	const [roleSearch, setRoleSearch] = useState("");
	const [moduleSearch, setModuleSearch] = useState("");

	const [newRoleName, setNewRoleName] = useState("");
	const [creatingRole, setCreatingRole] = useState(false);
	const [roleDialogOpen, setRoleDialogOpen] = useState(false);
	const [roleDialogMode, setRoleDialogMode] = useState<RoleDialogMode>("create");
	const [roleDialogRoleId, setRoleDialogRoleId] = useState("");
	const [roleDialogOriginalName, setRoleDialogOriginalName] = useState("");
	const [roleDialogName, setRoleDialogName] = useState("");
	const [roleDialogBusy, setRoleDialogBusy] = useState(false);

	const canManage = role === "superadmin";

	async function logAudit(action: string, details?: unknown) {
		if (!api?.audit?.logEvent) return;
		try {
			const session = await supabase.auth.getSession();
			await api.audit.logEvent({
				actor_user_id: session.data.session?.user?.id ?? null,
				actor_email: session.data.session?.user?.email ?? null,
				action,
				page: "/Main_Modules/Roles/",
				details: details && typeof details === "object" ? (details as Record<string, unknown>) : null,
			});
		} catch {
			// ignore
		}
	}

	const load = useCallback(async () => {
		setError("");
		setSuccess("");
		try {
			const [rRes, mRes, aRes, cRes] = await Promise.all([
				supabase.from("app_roles").select("role_id, role_name").order("role_name"),
				supabase.from("modules").select("module_key, display_name").order("module_key"),
				supabase.from("role_module_access").select("role_id, module_key"),
				supabase.from("role_column_access").select("role_id, module_key, column_key, can_read"),
			]);

			if (rRes.error) return setError(rRes.error.message);
			if (mRes.error) return setError(mRes.error.message);
			if (aRes.error) return setError(aRes.error.message);
			if (cRes.error) return setError(cRes.error.message);

			const loadedRoles = ((((rRes.data as RoleRow[]) ?? []) || []) as RoleRow[]).map((r) => ({
				...r,
				role_name: String(r.role_name ?? "").trim().toLowerCase(),
			}));
			const loadedModules = ((((mRes.data as ModuleRow[]) ?? []) || []) as ModuleRow[]).map((m) => ({
				...m,
				module_key: normalizeModuleKey(m.module_key),
			}));

			setRoles(loadedRoles);
			setModules(loadedModules);

			const map: Record<string, Set<string>> = {};
			for (const row of ((aRes.data as AccessRow[]) ?? []) || []) {
				if (!map[row.role_id]) map[row.role_id] = new Set();
				map[row.role_id].add(normalizeModuleKey(row.module_key));
			}

			const colMap: Record<string, Record<string, Set<string>>> = {};
			const colRestrictedMap: Record<string, Set<string>> = {};
			for (const row of ((cRes.data as RoleColumnAccessRow[]) ?? []) || []) {
				const moduleKey = normalizeModuleKey(row.module_key);
				if (!colRestrictedMap[row.role_id]) colRestrictedMap[row.role_id] = new Set<string>();
				if (moduleKey) colRestrictedMap[row.role_id].add(moduleKey);
				if (row.can_read === false) continue;
				const col = String(row.column_key ?? "").trim();
				if (!col) continue;
				if (!colMap[row.role_id]) colMap[row.role_id] = {};
				if (!colMap[row.role_id][moduleKey]) colMap[row.role_id][moduleKey] = new Set<string>();
				colMap[row.role_id][moduleKey].add(col);
			}

			const superadminRoleId = loadedRoles.find((r) => r.role_name === "superadmin")?.role_id ?? null;
			if (superadminRoleId) {
				if (!map[superadminRoleId]) map[superadminRoleId] = new Set<string>();
				if (!colMap[superadminRoleId]) colMap[superadminRoleId] = {};

				for (const moduleRow of loadedModules) {
					const key = normalizeModuleKey(moduleRow.module_key);
					if (!key) continue;
					map[superadminRoleId].add(key);

					const cols = columnsForModule(key);
					if (!cols.length) continue;
					if (!colMap[superadminRoleId][key]) colMap[superadminRoleId][key] = new Set<string>();
					for (const col of cols) colMap[superadminRoleId][key].add(col);
				}
			}

			setAccess(map);
			setRoleColumnAccess(colMap);
			setRoleColumnRestrictedModules(colRestrictedMap);

			setSelectedRoleId((prev) => {
				if (prev && loadedRoles.some((r) => r.role_id === prev)) return prev;
				return loadedRoles[0]?.role_id ?? "";
			});
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		}
	}, []);

	useEffect(() => {
		load();

		const channel = supabase
			.channel("realtime:rbac-roles")
			.on("postgres_changes", { event: "*", schema: "public", table: "app_roles" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "role_module_access" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "role_column_access" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "modules" }, () => load())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [load]);

	useEffect(() => {
		if (!roleDialogOpen) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [roleDialogOpen]);

	const roleDialogRole = useMemo(
		() => roles.find((r) => r.role_id === roleDialogRoleId) ?? null,
		[roles, roleDialogRoleId]
	);

	async function createRole() {
		setError("");
		setSuccess("");
		const name = newRoleName.trim().toLowerCase();
		if (!name) return setError("Role name is required");
		setCreatingRole(true);
		const { error: insErr } = await supabase.from("app_roles").insert({ role_name: name });
		setCreatingRole(false);
		if (insErr) return setError(insErr.message);
		setNewRoleName("");
		setSuccess("Role created.");
		logAudit("RBAC_CREATE_ROLE", { role_name: name });
		load();
	}

	function openCreateRoleDialog() {
		if (!canManage) return;
		setError("");
		setSuccess("");
		setRoleDialogMode("create");
		setRoleDialogRoleId("");
		setRoleDialogOriginalName("");
		setRoleDialogName("");
		setRoleDialogOpen(true);
	}

	function openEditRoleDialog(roleRow: RoleRow) {
		if (!canManage || roleRow.role_name === "superadmin") return;
		setError("");
		setSuccess("");
		setRoleDialogMode("edit");
		setRoleDialogRoleId(roleRow.role_id);
		setRoleDialogOriginalName(roleRow.role_name);
		setRoleDialogName(roleRow.role_name);
		setRoleDialogOpen(true);
	}

	function closeRoleDialog() {
		if (roleDialogBusy) return;
		setRoleDialogOpen(false);
	}

	async function submitRoleDialog() {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can manage roles.");

		const nextName = normalizeRoleName(roleDialogName);
		if (!nextName) return setError("Role name is required");

		setRoleDialogBusy(true);
		try {
			if (roleDialogMode === "create") {
				const { data, error: insErr } = await supabase
					.from("app_roles")
					.insert({ role_name: nextName })
					.select("role_id, role_name")
					.single();
				if (insErr) return setError(insErr.message);

				setSuccess("Role created.");
				setRoleDialogOpen(false);
				setRoleDialogName("");
				setRoleDialogOriginalName("");
				setRoleDialogRoleId("");
				setSelectedRoleId((data as RoleRow | null)?.role_id ?? "");
				void logAudit("RBAC_CREATE_ROLE", { role_name: nextName });
				void load();
				return;
			}

			const currentRole = roleDialogRole;
			if (!currentRole) return setError("Role not found.");
			if (currentRole.role_name === "superadmin") return setError("Superadmin cannot be edited.");
			if (nextName === currentRole.role_name) {
				setSuccess("No changes made.");
				setRoleDialogOpen(false);
				return;
			}

			const { error: updateErr } = await supabase
				.from("app_roles")
				.update({ role_name: nextName })
				.eq("role_id", currentRole.role_id);
			if (updateErr) return setError(updateErr.message);

			const { error: adminErr } = await supabase.from("admins").update({ role: nextName }).eq("role", currentRole.role_name);
			if (adminErr) {
				await supabase.from("app_roles").update({ role_name: currentRole.role_name }).eq("role_id", currentRole.role_id);
				return setError(adminErr.message);
			}

			setSuccess("Role updated.");
			setRoleDialogOpen(false);
			void logAudit("RBAC_UPDATE_ROLE", {
				role_id: currentRole.role_id,
				from: currentRole.role_name,
				to: nextName,
			});
			void load();
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setRoleDialogBusy(false);
		}
	}

	async function deleteRole(roleRow: RoleRow) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can manage roles.");
		if (roleRow.role_name === "superadmin") return setError("Superadmin cannot be deleted.");

		const confirmMessage = `Delete the role "${roleRow.role_name}"? This removes its page and column permissions.`;
		if (!window.confirm(confirmMessage)) return;

		setRoleDialogBusy(true);
		try {
			const { count, error: countErr } = await supabase
				.from("admins")
				.select("id", { count: "exact", head: true })
				.eq("role", roleRow.role_name);
			if (countErr) return setError(countErr.message);
			if ((count ?? 0) > 0) {
				setError(`Cannot delete "${roleRow.role_name}" while ${count} admin account${count === 1 ? "" : "s"} still use it.`);
				return;
			}

			const { error: delErr } = await supabase.from("app_roles").delete().eq("role_id", roleRow.role_id);
			if (delErr) return setError(delErr.message);

			setSuccess("Role deleted.");
			setRoleDialogOpen(false);
			void logAudit("RBAC_DELETE_ROLE", { role_id: roleRow.role_id, role_name: roleRow.role_name });
			if (selectedRoleId === roleRow.role_id) {
				setSelectedRoleId("");
			}
			void load();
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setRoleDialogBusy(false);
		}
	}

	const moduleByKey = useMemo(() => {
		const map = new Map<string, ModuleRow>();
		for (const m of modules) map.set(normalizeModuleKey(m.module_key), m);
		return map;
	}, [modules]);

	const selectedRole = useMemo(
		() => roles.find((r) => r.role_id === selectedRoleId) ?? null,
		[roles, selectedRoleId]
	);

	const selectedRoleIsSuperadmin = selectedRole?.role_name === "superadmin";

	const filteredRoles = useMemo(() => {
		const q = roleSearch.trim().toLowerCase();
		if (!q) return roles;
		return roles.filter((r) => r.role_name.toLowerCase().includes(q));
	}, [roleSearch, roles]);

	const selectedAccess = useMemo(() => {
		if (!selectedRole) return new Set<string>();
		return access[selectedRole.role_id] ?? new Set<string>();
	}, [access, selectedRole]);

	const selectedColumnAccess = useMemo(() => {
		if (!selectedRole) return {} as Record<string, Set<string>>;
		return roleColumnAccess[selectedRole.role_id] ?? {};
	}, [roleColumnAccess, selectedRole]);

	const selectedColumnRestrictedModules = useMemo(() => {
		if (!selectedRole) return new Set<string>();
		return roleColumnRestrictedModules[selectedRole.role_id] ?? new Set<string>();
	}, [roleColumnRestrictedModules, selectedRole]);

	const groupedModules = useMemo(() => {
		return groupedCatalog(moduleSearch)
			.map((group) => ({
				title: group.title,
				rows: group.rows
					.map((row) => {
						const loaded = moduleByKey.get(normalizeModuleKey(row.moduleKey));
						if (!loaded) return null;
						return {
							module_key: normalizeModuleKey(loaded.module_key),
							display_name: loaded.display_name,
							columns: visibleColumnsForModule(row.moduleKey),
						};
					})
					.filter((v): v is { module_key: string; display_name: string; columns: string[] } => !!v),
			}))
			.filter((g) => g.rows.length > 0);
	}, [moduleByKey, moduleSearch]);

	async function toggleAccess(roleId: string, moduleKey: string) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can change module access.");
		const key = normalizeModuleKey(moduleKey);
		const opKey = `role-module:${roleId}:${key}`;
		setSavingKey(opKey);

		try {
			const current = access[roleId]?.has(key) ?? false;

			if (current) {
				const { error: delColsErr } = await supabase
					.from("role_column_access")
					.delete()
					.eq("role_id", roleId)
					.eq("module_key", key);
				if (delColsErr) throw delColsErr;

				const { error: delErr } = await supabase
					.from("role_module_access")
					.delete()
					.eq("role_id", roleId)
					.eq("module_key", key);
				if (delErr) throw delErr;
			} else {
				const { error: insErr } = await supabase
					.from("role_module_access")
					.insert({ role_id: roleId, module_key: key });
				if (insErr) throw insErr;
			}

			setSuccess("Access updated.");
			logAudit("RBAC_TOGGLE_ACCESS", { role_id: roleId, module_key: key, enabled: !current });
			load();
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setSavingKey("");
		}
	}

	async function toggleRoleColumn(roleId: string, moduleKey: string, columnKey: string, moduleColumns: string[]) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can change column access.");
		const key = normalizeModuleKey(moduleKey);
		const column = String(columnKey ?? "").trim();
		if (!key || !column) return;
		const normalizedModuleColumns = Array.from(
			new Set(moduleColumns.map((c) => String(c ?? "").trim()).filter(Boolean))
		);
		if (!normalizedModuleColumns.includes(column)) normalizedModuleColumns.push(column);

		const busyKey = `role-column:${roleId}:${key}:${column}`;
		setSavingKey(busyKey);
		try {
			const currentCols = roleColumnAccess[roleId]?.[key] ?? new Set<string>();
			const moduleEnabled = access[roleId]?.has(key) ?? false;
			const moduleRestricted = roleColumnRestrictedModules[roleId]?.has(key) ?? false;
			const sentinelColumn = normalizedModuleColumns[0] ?? column;
			let nextEnabled = false;

			if (!moduleEnabled) {
				const { error: insModuleErr } = await supabase
					.from("role_module_access")
					.insert({ role_id: roleId, module_key: key });
				if (insModuleErr) throw insModuleErr;

				const { error: insErr } = await supabase
					.from("role_column_access")
					.upsert(
						{ role_id: roleId, module_key: key, column_key: column, can_read: true },
						{ onConflict: "role_id,module_key,column_key" }
					);
				if (insErr) throw insErr;
				nextEnabled = true;
			} else if (!moduleRestricted) {
				// No explicit rows means "all columns allowed". Turning one column off creates
				// an explicit allow-list for the remaining columns.
				const keepColumns = normalizedModuleColumns.filter((c) => c !== column);
				const { error: resetErr } = await supabase
					.from("role_column_access")
					.delete()
					.eq("role_id", roleId)
					.eq("module_key", key);
				if (resetErr) throw resetErr;

				if (keepColumns.length > 0) {
					const rows = keepColumns.map((colKey) => ({
						role_id: roleId,
						module_key: key,
						column_key: colKey,
						can_read: true,
					}));
					const { error: insErr } = await supabase
						.from("role_column_access")
						.upsert(rows, { onConflict: "role_id,module_key,column_key" });
					if (insErr) throw insErr;
				} else {
					// Keep an explicit restricted marker when no columns remain allowed.
					const { error: denyErr } = await supabase
						.from("role_column_access")
						.upsert(
							{ role_id: roleId, module_key: key, column_key: sentinelColumn, can_read: false },
							{ onConflict: "role_id,module_key,column_key" }
						);
					if (denyErr) throw denyErr;
				}
				nextEnabled = false;
			} else {
				const enabled = currentCols.has(column);

				if (enabled) {
					const { error: delErr } = await supabase
						.from("role_column_access")
						.delete()
						.eq("role_id", roleId)
						.eq("module_key", key)
						.eq("column_key", column);
					if (delErr) throw delErr;

					const nextAllowed = new Set(currentCols);
					nextAllowed.delete(column);
					if (nextAllowed.size === 0) {
						const { error: denyErr } = await supabase
							.from("role_column_access")
							.upsert(
								{ role_id: roleId, module_key: key, column_key: sentinelColumn, can_read: false },
								{ onConflict: "role_id,module_key,column_key" }
							);
						if (denyErr) throw denyErr;
					}
				} else {
					const { error: clearDenyErr } = await supabase
						.from("role_column_access")
						.delete()
						.eq("role_id", roleId)
						.eq("module_key", key)
						.eq("can_read", false);
					if (clearDenyErr) throw clearDenyErr;

					const { error: insErr } = await supabase
						.from("role_column_access")
						.upsert(
							{ role_id: roleId, module_key: key, column_key: column, can_read: true },
							{ onConflict: "role_id,module_key,column_key" }
						);
					if (insErr) throw insErr;
				}

				const nextAllowed = new Set(currentCols);
				if (enabled) nextAllowed.delete(column);
				else nextAllowed.add(column);

				if (normalizedModuleColumns.length > 0 && nextAllowed.size >= normalizedModuleColumns.length) {
					const { error: clearErr } = await supabase
						.from("role_column_access")
						.delete()
						.eq("role_id", roleId)
						.eq("module_key", key);
					if (clearErr) throw clearErr;
				}

				nextEnabled = !enabled;
			}

			setSuccess("Column access updated.");
			logAudit("RBAC_TOGGLE_ROLE_COLUMN", {
				role_id: roleId,
				module_key: key,
				column_key: column,
				enabled: nextEnabled,
			});
			load();
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setSavingKey("");
		}
	}

	const accessDenied = role !== null && role !== "superadmin";
	if (accessDenied) {
		return (
			<section className="bg-white rounded-2xl shadow-sm border p-5">
				<div className="text-lg font-semibold text-black">Roles</div>
				<div className="mt-2 text-sm text-gray-600">Only Superadmin can access this page.</div>
				<div className="mt-4 flex gap-2">
					<button
						onClick={() => router.push("/Main_Modules/Dashboard/")}
						className="px-4 py-2 rounded-xl bg-white border"
					>
						Back
					</button>
					<button
						onClick={() => router.push("/Main_Modules/Requests/?module=access")}
						className="px-4 py-2 rounded-xl font-semibold bg-[#FFDA03] text-black"
					>
						Request Access
					</button>
				</div>
			</section>
		);
	}

	return (
		<section className="bg-white rounded-2xl shadow-sm border p-5">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold text-black">Roles</div>
					<div className="text-sm text-gray-500">Manage roles and review page permissions in one place.</div>
					<div className="mt-3">
						<AccessTabs />
					</div>
				</div>
				<button
					onClick={() => router.push("/Main_Modules/Dashboard/")}
					className="px-4 py-2 rounded-xl bg-white border"
				>
					Back
				</button>
			</div>

			{role !== "superadmin" ? (
				<div className="mb-4 rounded-xl border bg-yellow-50 p-3 text-sm text-yellow-900">
					You are signed in as <span className="font-semibold">{role ?? "(unknown)"}</span>. Only Superadmin can
					 modify roles/access and create accounts.
				</div>
			) : null}

			{error ? <div className="mb-3 text-red-600 text-sm">{error}</div> : null}
			{success ? <div className="mb-3 text-emerald-700 text-sm">{success}</div> : null}

			<div className="rounded-2xl border p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-semibold text-black">Role Access Profiles</div>
						<div className="mt-1 text-xs text-gray-500">
							Manage page and column permissions per role, similar to account permissions but role-scoped.
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="text-xs rounded-full border px-3 py-1 text-gray-600 bg-gray-50">Superadmin only</div>
						<button
							onClick={openCreateRoleDialog}
							disabled={!canManage}
							className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold border ${
								canManage ? "bg-[#FFDA03] text-black hover:brightness-95" : "bg-gray-100 text-gray-400 cursor-not-allowed"
							}`}
						>
							<Plus className="h-4 w-4" />
							Create Role
						</button>
					</div>
				</div>


				<div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
					<input
						value={roleSearch}
						onChange={(e) => setRoleSearch(e.target.value)}
						placeholder="Search role"
						className="border rounded-xl px-3 py-2 text-sm text-black"
					/>
					<select
						value={selectedRoleId}
						onChange={(e) => setSelectedRoleId(e.target.value)}
						className="border rounded-xl px-3 py-2 text-sm text-black bg-white"
					>
						<option value="">Select role...</option>
						{filteredRoles.map((r) => (
							<option key={r.role_id} value={r.role_id}>
								{labelFromRole(r.role_name)} ({r.role_name})
							</option>
						))}
						{selectedRole && !filteredRoles.some((r) => r.role_id === selectedRole.role_id) ? (
							<option value={selectedRole.role_id}>{labelFromRole(selectedRole.role_name)} ({selectedRole.role_name})</option>
						) : null}
					</select>
					<div className="text-xs text-gray-500 flex items-center px-2">
						{filteredRoles.length} role(s)
					</div>
				</div>

				{selectedRole ? (
					<div className="mt-4 rounded-xl border p-3 space-y-2">
						<div className="flex items-start justify-between gap-3">
							<div>
								<div className="text-sm font-semibold text-black">{labelFromRole(selectedRole.role_name)}</div>
								<div className="text-xs text-gray-500">Role key: {selectedRole.role_name}</div>
							</div>
							{canManage && !selectedRoleIsSuperadmin ? (
								<div className="flex flex-wrap justify-end gap-2">
									<button
										onClick={() => openEditRoleDialog(selectedRole)}
										className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-gray-50"
									>
										<PencilLine className="h-3.5 w-3.5" />
										Edit role
									</button>
									<button
										onClick={() => void deleteRole(selectedRole)}
										className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
									>
										<Trash2 className="h-3.5 w-3.5" />
										Delete role
									</button>
								</div>
							) : null}
						</div>
						<div className="text-xs text-gray-600">Enabled pages: {selectedAccess.size}</div>
						<div className="max-h-40 overflow-auto space-y-2">
							{Array.from(selectedAccess)
								.sort()
								.map((moduleKey) => {
									const cols = selectedColumnAccess[moduleKey] ?? new Set<string>();
									const restricted = selectedColumnRestrictedModules.has(moduleKey);
									const visibleCols = Array.from(cols)
										.filter((col) => !shouldHidePermissionColumn(col))
										.map((col) => formatPermissionColumnLabel(col));
									const label = moduleByKey.get(normalizeModuleKey(moduleKey))?.display_name ?? moduleKey;
									const colLabel = !restricted
										? "All columns"
										: visibleCols.length > 0
											? visibleCols.sort().join(", ")
											: cols.size > 0
												? "Internal columns only"
												: "No allowed columns";
									return (
										<div key={`summary-${moduleKey}`} className="text-xs">
											<div className="font-semibold text-black">{label}</div>
											<div className="text-gray-500 font-mono">{moduleKey}</div>
											<div className="text-gray-600">{colLabel}</div>
										</div>
									);
								})}
							{selectedAccess.size === 0 ? (
								<div className="text-xs text-gray-500">No permitted pages yet.</div>
							) : null}
						</div>
					</div>
				) : (
					<div className="mt-4 text-sm text-gray-500">Select a role to manage role-level permissions.</div>
				)}
			</div>

			<RoleDialog
				open={roleDialogOpen}
				mode={roleDialogMode}
				name={roleDialogName}
				originalName={roleDialogOriginalName}
				busy={roleDialogBusy}
				canManage={canManage}
				role={roleDialogRole}
				onClose={closeRoleDialog}
				onNameChange={setRoleDialogName}
				onSubmit={submitRoleDialog}
				onDelete={() => {
					if (roleDialogRole) void deleteRole(roleDialogRole);
					}}
			/>

			<div className="mt-5 rounded-2xl border p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-semibold text-black">Role Access Editor</div>
						<div className="mt-1 text-xs text-gray-500">
							Shows role-level page and column access. Use the checkboxes to add/remove role permissions.
						</div>
						{selectedRoleIsSuperadmin ? (
							<div className="mt-1 text-xs text-gray-500">Superadmin always has full page and column access by default.</div>
						) : null}
					</div>
					<div className="text-xs rounded-full border px-3 py-1 text-gray-600 bg-gray-50">
						{canManage ? "Superadmin controls enabled" : "Read-only"}
					</div>
				</div>

				<div className="mt-3">
					<input
						value={moduleSearch}
						onChange={(e) => setModuleSearch(e.target.value)}
						placeholder="Search page/module key or column"
						className="w-full md:w-96 border rounded-xl px-3 py-2 text-sm text-black"
					/>
				</div>

				{!selectedRole ? (
					<div className="mt-4 text-sm text-gray-500">Select a role above to edit role-level access.</div>
				) : (
					<div className="mt-4 space-y-4">
						{groupedModules.map((group) => (
							<div key={group.title} className="rounded-xl border p-3">
								<div className="text-sm font-semibold text-black">{group.title}</div>
								<div className="mt-3 space-y-2">
									{group.rows.map((m) => {
										const checked = selectedAccess.has(m.module_key);
										const opKey = `role-module:${selectedRole.role_id}:${m.module_key}`;
										const busy = savingKey === opKey;
										const selectedCols = selectedColumnAccess[m.module_key] ?? new Set<string>();
										const restricted = selectedColumnRestrictedModules.has(m.module_key);
										const selectedVisibleCols = Array.from(selectedCols)
											.filter((col) => !shouldHidePermissionColumn(col))
											.map((col) => formatPermissionColumnLabel(col));
										const effectiveCols = !checked
											? "(none)"
											: !restricted
												? "All columns"
												: selectedVisibleCols.length > 0
													? selectedVisibleCols.sort().join(", ")
													: selectedCols.size > 0
														? "Internal columns only"
														: "No allowed columns";

										return (
											<div
												key={m.module_key}
												className={`rounded-xl border p-3 ${
													checked ? "bg-[#FFF7CC] border-[#FFDA03]" : "bg-white"
												}`}
											>
															{/*
																<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onClick={closeRoleDialog}>
																	<div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
																		<div className="bg-gradient-to-r from-[#111827] via-[#8B1C1C] to-[#611313] px-6 py-5 text-white">
																			<div className="flex items-start justify-between gap-4">
																				<div>
																					<div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/75">
																						{roleDialogMode === "create" ? <Plus className="h-3.5 w-3.5 text-[#FFDA03]" /> : <PencilLine className="h-3.5 w-3.5 text-[#FFDA03]" />}
																						{roleDialogMode === "create" ? "New role" : "Edit role"}
																					</div>
																					<div className="mt-3 text-2xl font-semibold">
																						{roleDialogMode === "create" ? "Create Role" : `Edit ${labelFromRole(roleDialogOriginalName)}`}
																					</div>
																					<div className="mt-1 text-sm text-white/75">
																						{roleDialogMode === "create"
																							? "Create a new position key for accounts and permissions without leaving the Roles tab."
																							: "Rename the role key and keep existing admin accounts in sync automatically."}
																					</div>
																				</div>
																				<button
																					type="button"
																					onClick={closeRoleDialog}
																					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15"
																					disabled={roleDialogBusy}
																				>
																					<X className="h-4 w-4" />
																				</button>
																			</div>
																		</div>

																		<div className="p-6">
																			<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Role key</div>
																			<input
																				value={roleDialogName}
																				onChange={(e) => setRoleDialogName(e.target.value)}
																				placeholder="hr_manager"
																				className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
																				disabled={roleDialogBusy}
																			/>
																			<div className="mt-3 text-xs text-gray-500">
																				The role key is stored in lowercase. Editing a role updates any admin accounts using the old key.
																			</div>

																			{roleDialogMode === "edit" ? (
																				<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
																					Deletion is blocked while any admin account still uses this role.
																				</div>
																			) : null}

																			<div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
																				{roleDialogMode === "edit" ? (
																					<button
																						type="button"
																						onClick={() => {
																							if (roleDialogRole) void deleteRole(roleDialogRole);
																						}}
																						className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
																						disabled={roleDialogBusy || !roleDialogRole || roleDialogRole.role_name === "superadmin"}
																					>
																						<Trash2 className="h-4 w-4" />
																						Delete role
																					</button>
																				) : null}
																				<div className="flex items-center gap-2 sm:ml-auto">
																					<button
																						type="button"
																						onClick={closeRoleDialog}
																						className="rounded-xl border bg-white px-4 py-2.5 text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
																						disabled={roleDialogBusy}
																					>
																						Cancel
																					</button>
																					<button
																						onClick={submitRoleDialog}
																						className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold ${
																							canManage ? "bg-[#FFDA03] text-black hover:bg-[#EFCB00]" : "bg-[#FFDA03] text-black opacity-60"
																						}`}
																						disabled={!canManage || roleDialogBusy}
																					>
																						{roleDialogBusy ? "Saving..." : roleDialogMode === "create" ? "Create Role" : "Save Changes"}
																					</button>
																				</div>
																			</div>
																		</div>
																	</div>
																</div>
															*/}
												<div className="flex items-center justify-between gap-3">
													<div className="min-w-0">
														<div className="text-sm font-medium text-black">{m.display_name}</div>
														<div className="text-xs text-gray-500 font-mono">{m.module_key}</div>
														<div className="mt-1 text-xs text-gray-600">
															Effective: <span className="font-semibold">{checked ? "Yes" : "No"}</span>
														</div>
														<div className="mt-1 text-xs text-gray-600">Effective columns: {effectiveCols}</div>
													</div>
													<div className="flex items-center gap-2">
														<label className="text-xs text-gray-700 flex items-center gap-2">
															<span className="text-gray-500">Permission</span>
															<input
																type="checkbox"
																checked={checked}
																onChange={() => toggleAccess(selectedRole.role_id, m.module_key)}
																disabled={!canManage || busy || selectedRoleIsSuperadmin}
															/>
														</label>
													</div>
												</div>

												<div className="mt-2 flex flex-wrap gap-2">
													{m.columns.map((col) => {
														const colBusy =
															savingKey === `role-column:${selectedRole.role_id}:${m.module_key}:${col}`;
														const colOn = checked && (!restricted || selectedCols.has(col));
														return (
															<label
																key={`role-col-${m.module_key}-${col}`}
																className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
																	colOn ? "bg-[#FFF7CC] border-[#FFDA03] text-black" : "bg-white text-gray-700"
																}`}
															>
																<input
																	type="checkbox"
																	checked={colOn}
																	onChange={() =>
																		toggleRoleColumn(selectedRole.role_id, m.module_key, col, columnsForModule(m.module_key))
																	}
																	disabled={!canManage || colBusy || selectedRoleIsSuperadmin}
																/>
																<span>{formatPermissionColumnLabel(col)}</span>
															</label>
														);
													})}
												</div>
											</div>
										);
									})}
								</div>
							</div>
						))}

						{groupedModules.length === 0 ? (
							<div className="rounded-xl border p-3 text-sm text-gray-500">No pages match the current filter.</div>
						) : null}
					</div>
				)}
			</div>
		</section>
	);
}
