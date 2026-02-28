"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import { AccessTabs } from "../Components/AccessTabs";
import { groupedCatalog, normalizeModuleKey } from "../Components/permissionCatalog";

type RoleRow = { role_id: string; role_name: string };
type ModuleRow = { module_key: string; display_name: string };
type AccessRow = { role_id: string; module_key: string };
type AdminRow = {
	id: string;
	username: string;
	role: string | null;
	full_name: string | null;
	is_active: boolean | null;
};

type AdminModuleOverrideRow = {
	admin_id: string;
	module_key: string;
	can_read: boolean | null;
};

type AdminColumnOverrideRow = {
	admin_id: string;
	module_key: string;
	column_key: string;
	can_read: boolean | null;
};

function getErrorMessage(e: unknown) {
	return e instanceof Error ? e.message : "Something went wrong";
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
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");
	const [savingKey, setSavingKey] = useState<string>("");
	const [roleSearch, setRoleSearch] = useState("");
	const [moduleSearch, setModuleSearch] = useState("");

	const [admins, setAdmins] = useState<AdminRow[]>([]);
	const [selectedAdminId, setSelectedAdminId] = useState<string>("");
	const [adminSearch, setAdminSearch] = useState("");
	const [loadingAdmins, setLoadingAdmins] = useState(false);
	const [adminModuleAccess, setAdminModuleAccess] = useState<Set<string>>(new Set());
	const [adminColumnAccess, setAdminColumnAccess] = useState<Record<string, Set<string>>>({});
	const [savingIndividualKey, setSavingIndividualKey] = useState("");

	const [newRoleName, setNewRoleName] = useState("");
	const [creatingRole, setCreatingRole] = useState(false);

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
			const [rRes, mRes, aRes] = await Promise.all([
				supabase.from("app_roles").select("role_id, role_name").order("role_name"),
				supabase.from("modules").select("module_key, display_name").order("module_key"),
				supabase.from("role_module_access").select("role_id, module_key"),
			]);

			if (rRes.error) return setError(rRes.error.message);
			if (mRes.error) return setError(mRes.error.message);
			if (aRes.error) return setError(aRes.error.message);

			const loadedRoles = ((rRes.data as RoleRow[]) ?? []) || [];
			const loadedModules = ((mRes.data as ModuleRow[]) ?? []) || [];

			setRoles(loadedRoles);
			setModules(loadedModules);

			const map: Record<string, Set<string>> = {};
			for (const row of ((aRes.data as AccessRow[]) ?? []) || []) {
				if (!map[row.role_id]) map[row.role_id] = new Set();
				map[row.role_id].add(row.module_key);
			}
			setAccess(map);

			setSelectedRoleId((prev) => {
				if (prev && loadedRoles.some((r) => r.role_id === prev)) return prev;
				return loadedRoles[0]?.role_id ?? "";
			});
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		}
	}, []);

	const loadAdmins = useCallback(async () => {
		setLoadingAdmins(true);
		try {
			const { data, error: adminErr } = await supabase
				.from("admins")
				.select("id, username, role, full_name, is_active")
				.order("username");
			if (adminErr) throw adminErr;

			const rows = ((data as AdminRow[]) ?? []) || [];
			setAdmins(rows);
			setSelectedAdminId((prev) => {
				if (prev && rows.some((r) => r.id === prev)) return prev;
				return rows[0]?.id ?? "";
			});
		} catch {
			setAdmins([]);
		} finally {
			setLoadingAdmins(false);
		}
	}, []);

	const loadAdminOverrides = useCallback(async (adminId: string) => {
		if (!adminId) {
			setAdminModuleAccess(new Set());
			setAdminColumnAccess({});
			return;
		}

		try {
			const [moduleRes, columnRes] = await Promise.all([
				supabase
					.from("admin_module_access_overrides")
					.select("admin_id, module_key, can_read")
					.eq("admin_id", adminId),
				supabase
					.from("admin_column_access_overrides")
					.select("admin_id, module_key, column_key, can_read")
					.eq("admin_id", adminId),
			]);

			if (moduleRes.error) throw moduleRes.error;
			if (columnRes.error) throw columnRes.error;

			const moduleSet = new Set(
				(((moduleRes.data as AdminModuleOverrideRow[]) ?? []) || [])
					.filter((r) => r.can_read !== false)
					.map((r) => normalizeModuleKey(r.module_key))
			);
			setAdminModuleAccess(moduleSet);

			const colMap: Record<string, Set<string>> = {};
			for (const row of ((columnRes.data as AdminColumnOverrideRow[]) ?? []) || []) {
				if (row.can_read === false) continue;
				const key = normalizeModuleKey(row.module_key);
				if (!colMap[key]) colMap[key] = new Set<string>();
				colMap[key].add(String(row.column_key));
			}
			setAdminColumnAccess(colMap);
		} catch {
			setAdminModuleAccess(new Set());
			setAdminColumnAccess({});
		}
	}, []);

	useEffect(() => {
		load();
		loadAdmins();

		const channel = supabase
			.channel("realtime:rbac-roles")
			.on("postgres_changes", { event: "*", schema: "public", table: "app_roles" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "role_module_access" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "modules" }, () => load())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [load, loadAdmins]);

	useEffect(() => {
		loadAdminOverrides(selectedAdminId);
	}, [loadAdminOverrides, selectedAdminId]);

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

	const moduleByKey = useMemo(() => {
		const map = new Map<string, ModuleRow>();
		for (const m of modules) map.set(m.module_key, m);
		return map;
	}, [modules]);

	const selectedRole = useMemo(
		() => roles.find((r) => r.role_id === selectedRoleId) ?? null,
		[roles, selectedRoleId]
	);

	const selectedAdmin = useMemo(() => admins.find((a) => a.id === selectedAdminId) ?? null, [admins, selectedAdminId]);

	const filteredRoles = useMemo(() => {
		const q = roleSearch.trim().toLowerCase();
		if (!q) return roles;
		return roles.filter((r) => r.role_name.toLowerCase().includes(q));
	}, [roleSearch, roles]);

	const filteredAdmins = useMemo(() => {
		const q = adminSearch.trim().toLowerCase();
		if (!q) return admins;
		return admins.filter(
			(a) =>
				a.username.toLowerCase().includes(q) ||
				(a.full_name ?? "").toLowerCase().includes(q) ||
				(a.role ?? "").toLowerCase().includes(q)
		);
	}, [adminSearch, admins]);

	const selectedAccess = useMemo(() => {
		if (!selectedRole) return new Set<string>();
		return access[selectedRole.role_id] ?? new Set<string>();
	}, [access, selectedRole]);

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
							columns: row.columns,
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

		const opKey = `${roleId}:${moduleKey}`;
		setSavingKey(opKey);

		try {
			const current = access[roleId]?.has(moduleKey) ?? false;

			if (current) {
				const { error: delErr } = await supabase
					.from("role_module_access")
					.delete()
					.eq("role_id", roleId)
					.eq("module_key", moduleKey);
				if (delErr) throw delErr;
			} else {
				const { error: insErr } = await supabase
					.from("role_module_access")
					.insert({ role_id: roleId, module_key: moduleKey });
				if (insErr) throw insErr;
			}

			setSuccess("Access updated.");
			logAudit("RBAC_TOGGLE_ACCESS", { role_id: roleId, module_key: moduleKey, enabled: !current });
			load();
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setSavingKey("");
		}
	}

	async function toggleAdminModule(moduleKey: string) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can change individual access.");
		if (!selectedAdminId) return setError("Please select an account.");

		const key = normalizeModuleKey(moduleKey);
		const busyKey = `admin-module:${selectedAdminId}:${key}`;
		setSavingIndividualKey(busyKey);

		try {
			const enabled = adminModuleAccess.has(key);
			if (enabled) {
				const { error: delErr } = await supabase
					.from("admin_module_access_overrides")
					.delete()
					.eq("admin_id", selectedAdminId)
					.eq("module_key", key);
				if (delErr) throw delErr;

				const { error: delColsErr } = await supabase
					.from("admin_column_access_overrides")
					.delete()
					.eq("admin_id", selectedAdminId)
					.eq("module_key", key);
				if (delColsErr) throw delColsErr;
			} else {
				const { error: insErr } = await supabase
					.from("admin_module_access_overrides")
					.upsert({ admin_id: selectedAdminId, module_key: key, can_read: true }, { onConflict: "admin_id,module_key" });
				if (insErr) throw insErr;
			}

			setSuccess("Individual page access updated.");
			logAudit("RBAC_TOGGLE_INDIVIDUAL_MODULE", {
				admin_id: selectedAdminId,
				module_key: key,
				enabled: !enabled,
			});
			loadAdminOverrides(selectedAdminId);
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setSavingIndividualKey("");
		}
	}

	async function toggleAdminColumn(moduleKey: string, columnKey: string) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can change individual access.");
		if (!selectedAdminId) return setError("Please select an account.");

		const moduleKeyNormalized = normalizeModuleKey(moduleKey);
		const column = String(columnKey);
		const busyKey = `admin-column:${selectedAdminId}:${moduleKeyNormalized}:${column}`;
		setSavingIndividualKey(busyKey);

		try {
			const enabled = adminColumnAccess[moduleKeyNormalized]?.has(column) ?? false;

			if (enabled) {
				const { error: delErr } = await supabase
					.from("admin_column_access_overrides")
					.delete()
					.eq("admin_id", selectedAdminId)
					.eq("module_key", moduleKeyNormalized)
					.eq("column_key", column);
				if (delErr) throw delErr;
			} else {
				const { error: moduleUpsertErr } = await supabase
					.from("admin_module_access_overrides")
					.upsert({ admin_id: selectedAdminId, module_key: moduleKeyNormalized, can_read: true }, { onConflict: "admin_id,module_key" });
				if (moduleUpsertErr) throw moduleUpsertErr;

				const { error: insErr } = await supabase
					.from("admin_column_access_overrides")
					.upsert(
						{ admin_id: selectedAdminId, module_key: moduleKeyNormalized, column_key: column, can_read: true },
						{ onConflict: "admin_id,module_key,column_key" }
					);
				if (insErr) throw insErr;
			}

			setSuccess("Individual column access updated.");
			logAudit("RBAC_TOGGLE_INDIVIDUAL_COLUMN", {
				admin_id: selectedAdminId,
				module_key: moduleKeyNormalized,
				column_key: column,
				enabled: !enabled,
			});
			loadAdminOverrides(selectedAdminId);
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setSavingIndividualKey("");
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

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
				<div className="rounded-2xl border p-4">
					<div className="text-sm font-semibold text-black">Create Role</div>
					<div className="mt-3 flex gap-2">
						<input
							value={newRoleName}
							onChange={(e) => setNewRoleName(e.target.value)}
							placeholder="e.g. hr_manager"
							className="flex-1 border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingRole}
						/>
						<button
							onClick={createRole}
							className={`px-4 py-2 rounded-xl font-semibold ${
								canManage ? "bg-[#FFDA03] text-black" : "bg-gray-100 text-gray-400"
							}`}
							disabled={!canManage || creatingRole}
						>
							{creatingRole ? "Creating..." : "Create"}
						</button>
					</div>
					<div className="mt-2 text-xs text-gray-500">
						Roles are stored in <span className="font-mono">app_roles</span>.
					</div>
				</div>

				<div className="rounded-2xl border p-4">
					<div className="text-sm font-semibold text-black">Role Directory</div>
					<div className="mt-2">
						<input
							value={roleSearch}
							onChange={(e) => setRoleSearch(e.target.value)}
							placeholder="Search role name"
							className="w-full border rounded-xl px-3 py-2 text-sm text-black"
						/>
					</div>
					<div className="mt-2 text-xs text-gray-500">{roles.length} total</div>
					<div className="mt-3 max-h-72 overflow-auto">
						<ul className="space-y-2">
							{filteredRoles.map((r) => (
								<li
									key={r.role_id}
									className={`px-3 py-2 rounded-xl border text-black cursor-pointer ${
										selectedRoleId === r.role_id ? "bg-[#FFF7CC] border-[#FFDA03]" : "bg-white"
									}`}
									onClick={() => setSelectedRoleId(r.role_id)}
								>
									<div className="font-semibold">{labelFromRole(r.role_name)}</div>
									<div className="text-xs text-gray-500">{r.role_name}</div>
								</li>
							))}
							{filteredRoles.length === 0 ? (
								<li className="px-3 py-2 rounded-xl border text-sm text-gray-500">No roles found.</li>
							) : null}
						</ul>
					</div>
				</div>

				<div className="rounded-2xl border p-4">
					<div className="text-sm font-semibold text-black">Role Summary</div>
					<div className="mt-2 text-xs text-gray-500">Quick visibility of role and permission counts.</div>

					{selectedRole ? (
						<div className="mt-4 space-y-3 text-sm text-gray-700">
							<div className="rounded-xl border p-3">
								<div className="text-xs text-gray-500">Selected Role</div>
								<div className="font-semibold text-black">{labelFromRole(selectedRole.role_name)}</div>
								<div className="text-xs text-gray-500">{selectedRole.role_name}</div>
							</div>

							<div className="rounded-xl border p-3">
								<div className="text-xs text-gray-500">Enabled Page Access</div>
								<div className="text-xl font-semibold text-black">{selectedAccess.size}</div>
								<div className="text-xs text-gray-500">Across all grouped pages/modules</div>
							</div>
						</div>
					) : (
						<div className="mt-4 text-sm text-gray-500">No role selected.</div>
					)}
				</div>
			</div>

			<div className="mt-5 rounded-2xl border p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-semibold text-black">Role Access Editor</div>
						<div className="mt-1 text-xs text-gray-500">
							Grant page access by role. Columns are grouped by page sections for easier review.
						</div>
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
					<div className="mt-4 text-sm text-gray-500">Select a role from the Role Directory to edit access.</div>
				) : (
					<div className="mt-4 space-y-4">
						{groupedModules.map((group) => (
							<div key={group.title} className="rounded-xl border p-3">
								<div className="text-sm font-semibold text-black">{group.title}</div>
								<div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
									{group.rows.map((m) => {
										const checked = selectedAccess.has(m.module_key);
										const opKey = `${selectedRole.role_id}:${m.module_key}`;
										const busy = savingKey === opKey;

										return (
											<div
												key={m.module_key}
												className={`rounded-xl border px-3 py-2 flex items-center gap-3 ${
													checked ? "bg-[#FFF7CC] border-[#FFDA03]" : "bg-white"
												}`}
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleAccess(selectedRole.role_id, m.module_key)}
													disabled={!canManage || busy}
												/>
												<div className="min-w-0">
													<div className="text-sm text-black font-medium truncate">{m.display_name}</div>
													<div className="text-xs text-gray-500 font-mono">{m.module_key}</div>
													<div className="mt-1 text-[11px] text-gray-500 truncate">
														Columns: {m.columns.join(", ")}
													</div>
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

			<div className="mt-5 rounded-2xl border p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-semibold text-black">Individual Access Overrides</div>
						<div className="mt-1 text-xs text-gray-500">
							Superadmin can grant/revoke individual page and column access for specific admin accounts.
						</div>
					</div>
					<div className="text-xs rounded-full border px-3 py-1 text-gray-600 bg-gray-50">Connected with Requests approval</div>
				</div>

				<div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
					<input
						value={adminSearch}
						onChange={(e) => setAdminSearch(e.target.value)}
						placeholder="Search account (username/full name/role)"
						className="border rounded-xl px-3 py-2 text-sm text-black"
					/>
					<select
						value={selectedAdminId}
						onChange={(e) => setSelectedAdminId(e.target.value)}
						className="border rounded-xl px-3 py-2 text-sm text-black bg-white"
					>
						<option value="">Select account…</option>
						{filteredAdmins.map((a) => (
							<option key={a.id} value={a.id}>
								{a.username} ({a.role ?? "no-role"})
							</option>
						))}
					</select>
					<div className="text-xs text-gray-500 flex items-center px-2">
						{loadingAdmins ? "Loading accounts…" : `${filteredAdmins.length} account(s)`}
					</div>
				</div>

				{selectedAdmin ? (
					<div className="mt-4 rounded-xl border p-3">
						<div className="text-sm font-semibold text-black">{selectedAdmin.username}</div>
						<div className="text-xs text-gray-500">
							{selectedAdmin.full_name || "(No full name)"} · role: {selectedAdmin.role ?? "(none)"}
						</div>
					</div>
				) : null}

				{!selectedAdminId ? (
					<div className="mt-4 text-sm text-gray-500">Select an account to manage individual overrides.</div>
				) : (
					<div className="mt-4 space-y-4">
						{groupedModules.map((group) => (
							<div key={`individual-${group.title}`} className="rounded-xl border p-3">
								<div className="text-sm font-semibold text-black">{group.title}</div>
								<div className="mt-3 space-y-2">
									{group.rows.map((m) => {
										const moduleOn = adminModuleAccess.has(m.module_key);
										const moduleBusy = savingIndividualKey === `admin-module:${selectedAdminId}:${m.module_key}`;
										const selectedCols = adminColumnAccess[m.module_key] ?? new Set<string>();

										return (
											<div key={`individual-${m.module_key}`} className="rounded-xl border p-3 bg-white">
												<div className="flex items-center gap-3">
													<input
														type="checkbox"
														checked={moduleOn}
														onChange={() => toggleAdminModule(m.module_key)}
														disabled={!canManage || moduleBusy}
													/>
													<div>
														<div className="text-sm font-medium text-black">{m.display_name}</div>
														<div className="text-xs text-gray-500 font-mono">{m.module_key}</div>
													</div>
												</div>

												<div className="mt-2 flex flex-wrap gap-2">
													{m.columns.map((col) => {
														const colBusy =
															savingIndividualKey === `admin-column:${selectedAdminId}:${m.module_key}:${col}`;
														const colOn = selectedCols.has(col);
														return (
															<label
																key={`col-${m.module_key}-${col}`}
																className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
																	colOn ? "bg-[#FFF7CC] border-[#FFDA03] text-black" : "bg-white text-gray-700"
																}`}
															>
																<input
																	type="checkbox"
																	checked={colOn}
																	onChange={() => toggleAdminColumn(m.module_key, col)}
																	disabled={!canManage || colBusy}
																/>
																<span>{col}</span>
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
					</div>
				)}
			</div>
		</section>
	);
}
