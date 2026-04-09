"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import LoadingCircle from "../../Components/LoadingCircle";
import { AccessTabs } from "../Components/AccessTabs";
import {
	columnsForModule,
	formatPermissionColumnLabel,
	groupedCatalog,
	normalizeModuleKey,
	shouldHidePermissionColumn,
	visibleColumnsForModule,
} from "../Components/permissionCatalog";

type ModuleRow = { module_key: string; display_name: string };

type AdminRow = {
	id: string;
	username: string;
	role: string | null;
	full_name: string | null;
	is_active: boolean | null;
};

type RoleIdRow = { role_id: string };

type RoleModuleAccessRow = {
	module_key: string;
	can_read: boolean | null;
};

type RoleColumnAccessRow = {
	module_key: string;
	column_key: string;
	can_read: boolean | null;
};

type AdminModuleOverrideRow = {
	module_key: string;
	can_read: boolean | null;
};

type AdminColumnOverrideRow = {
	module_key: string;
	column_key: string;
	can_read: boolean | null;
};

function getErrorMessage(e: unknown) {
	return e instanceof Error ? e.message : "Something went wrong";
}

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

function PermissionsPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { role } = useAuthRole();
	const api = getElectronApi();
	const preselectedAdminId = String(searchParams?.get("admin") ?? "").trim();

	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	const [modules, setModules] = useState<ModuleRow[]>([]);
	const [moduleSearch, setModuleSearch] = useState("");

	const [admins, setAdmins] = useState<AdminRow[]>([]);
	const [selectedAdminId, setSelectedAdminId] = useState("");
	const [adminSearch, setAdminSearch] = useState("");
	const [loadingAdmins, setLoadingAdmins] = useState(false);
	const [loadingAccess, setLoadingAccess] = useState(false);

	const [roleModuleAccess, setRoleModuleAccess] = useState<Set<string>>(new Set());
	const [roleColumnAccess, setRoleColumnAccess] = useState<Record<string, Set<string>>>({});
	const [adminModuleAccess, setAdminModuleAccess] = useState<Set<string>>(new Set());
	const [adminColumnAccess, setAdminColumnAccess] = useState<Record<string, Set<string>>>({});
	const [savingIndividualKey, setSavingIndividualKey] = useState("");

	const canManage = role === "superadmin";

	async function logAudit(action: string, details?: unknown) {
		if (!api?.audit?.logEvent) return;
		try {
			const session = await supabase.auth.getSession();
			await api.audit.logEvent({
				actor_user_id: session.data.session?.user?.id ?? null,
				actor_email: session.data.session?.user?.email ?? null,
				action,
				page: "/Main_Modules/Permissions/",
				details: details && typeof details === "object" ? (details as Record<string, unknown>) : null,
			});
		} catch {
			// ignore
		}
	}

	const loadModules = useCallback(async () => {
		setError("");
		try {
			const { data, error: mErr } = await supabase.from("modules").select("module_key, display_name").order("module_key");
			if (mErr) return setError(mErr.message);
			const loadedModules = ((((data as ModuleRow[]) ?? []) || []) as ModuleRow[]).map((m) => ({
				...m,
				module_key: normalizeModuleKey(m.module_key),
			}));
			setModules(loadedModules);
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

	const selectedAdmin = useMemo(() => admins.find((a) => a.id === selectedAdminId) ?? null, [admins, selectedAdminId]);

	useEffect(() => {
		if (!preselectedAdminId) return;
		if (!admins.some((row) => row.id === preselectedAdminId)) return;
		setSelectedAdminId((prev) => (prev === preselectedAdminId ? prev : preselectedAdminId));
	}, [admins, preselectedAdminId]);

	const loadSelectedAdminAccess = useCallback(async (admin: AdminRow | null) => {
		if (!admin) {
			setRoleModuleAccess(new Set());
			setRoleColumnAccess({});
			setAdminModuleAccess(new Set());
			setAdminColumnAccess({});
			return;
		}

		setLoadingAccess(true);
		try {
			const roleName = String(admin.role ?? "").trim().toLowerCase();
			let roleId: string | null = null;
			if (roleName) {
				const { data: roleRow, error: roleErr } = await supabase
					.from("app_roles")
					.select("role_id")
					.eq("role_name", roleName)
					.single();
				if (!roleErr && (roleRow as RoleIdRow | null)?.role_id) {
					roleId = (roleRow as RoleIdRow).role_id;
				}
			}

			const roleModuleSet = new Set<string>();
			const roleColMap: Record<string, Set<string>> = {};

			if (roleId) {
				const [roleModulesRes, roleColsRes] = await Promise.all([
					supabase.from("role_module_access").select("module_key, can_read").eq("role_id", roleId),
					supabase.from("role_column_access").select("module_key, column_key, can_read").eq("role_id", roleId),
				]);
				if (roleModulesRes.error) throw roleModulesRes.error;
				if (roleColsRes.error) throw roleColsRes.error;

				const dbRoleModuleSet = new Set(
					(((roleModulesRes.data as RoleModuleAccessRow[]) ?? []) || [])
						.filter((r) => r.can_read !== false)
						.map((r) => normalizeModuleKey(r.module_key))
				);
				for (const key of dbRoleModuleSet) roleModuleSet.add(key);

				for (const row of ((roleColsRes.data as RoleColumnAccessRow[]) ?? []) || []) {
					if (row.can_read === false) continue;
					const key = normalizeModuleKey(row.module_key);
					const col = String(row.column_key ?? "").trim();
					if (!col) continue;
					if (!roleColMap[key]) roleColMap[key] = new Set<string>();
					roleColMap[key].add(col);
				}
			}

			if (roleName === "superadmin") {
				for (const moduleRow of modules) {
					const moduleKey = normalizeModuleKey(moduleRow.module_key);
					if (!moduleKey) continue;
					roleModuleSet.add(moduleKey);
					const cols = columnsForModule(moduleKey);
					if (!cols.length) continue;
					if (!roleColMap[moduleKey]) roleColMap[moduleKey] = new Set<string>();
					for (const col of cols) roleColMap[moduleKey].add(col);
				}
			}

			setRoleModuleAccess(roleModuleSet);
			setRoleColumnAccess(roleColMap);

			const [adminModulesRes, adminColsRes] = await Promise.all([
				supabase.from("admin_module_access_overrides").select("module_key, can_read").eq("admin_id", admin.id),
				supabase.from("admin_column_access_overrides").select("module_key, column_key, can_read").eq("admin_id", admin.id),
			]);
			if (adminModulesRes.error) throw adminModulesRes.error;
			if (adminColsRes.error) throw adminColsRes.error;

			const moduleSet = new Set(
				(((adminModulesRes.data as AdminModuleOverrideRow[]) ?? []) || [])
					.filter((r) => r.can_read !== false)
					.map((r) => normalizeModuleKey(r.module_key))
			);
			setAdminModuleAccess(moduleSet);

			const colMap: Record<string, Set<string>> = {};
			for (const row of ((adminColsRes.data as AdminColumnOverrideRow[]) ?? []) || []) {
				if (row.can_read === false) continue;
				const key = normalizeModuleKey(row.module_key);
				const col = String(row.column_key ?? "").trim();
				if (!col) continue;
				if (!colMap[key]) colMap[key] = new Set<string>();
				colMap[key].add(col);
			}
			setAdminColumnAccess(colMap);
		} catch (e: unknown) {
			setRoleModuleAccess(new Set());
			setRoleColumnAccess({});
			setAdminModuleAccess(new Set());
			setAdminColumnAccess({});
			setError(getErrorMessage(e));
		} finally {
			setLoadingAccess(false);
		}
	}, [modules]);

	useEffect(() => {
		loadModules();
		loadAdmins();

		const channel = supabase
			.channel("realtime:rbac-permissions")
			.on("postgres_changes", { event: "*", schema: "public", table: "modules" }, () => loadModules())
			.on("postgres_changes", { event: "*", schema: "public", table: "admins" }, () => loadAdmins())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [loadAdmins, loadModules]);

	useEffect(() => {
		if (!selectedAdminId) {
			void loadSelectedAdminAccess(null);
			return;
		}
		const admin = admins.find((row) => row.id === selectedAdminId) ?? null;
		void loadSelectedAdminAccess(admin);
	}, [admins, loadSelectedAdminAccess, selectedAdminId]);

	async function toggleAdminModule(moduleKey: string) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can change individual access.");
		if (!selectedAdminId) return setError("Please select an account.");
		if (normalizeModuleKey(selectedAdmin?.role) === "superadmin") {
			return setError("Superadmin already has full access by default.");
		}

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
					.upsert(
						{ admin_id: selectedAdminId, module_key: key, can_read: true },
						{ onConflict: "admin_id,module_key" }
					);
				if (insErr) throw insErr;
			}

			setSuccess("Individual page access updated.");
			logAudit("RBAC_TOGGLE_INDIVIDUAL_MODULE", {
				admin_id: selectedAdminId,
				module_key: key,
				enabled: !enabled,
			});
			if (selectedAdmin) loadSelectedAdminAccess(selectedAdmin);
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
		if (normalizeModuleKey(selectedAdmin?.role) === "superadmin") {
			return setError("Superadmin already has full access by default.");
		}

		const moduleKeyNormalized = normalizeModuleKey(moduleKey);
		const column = String(columnKey ?? "").trim();
		if (!column) return;
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
					.upsert(
						{ admin_id: selectedAdminId, module_key: moduleKeyNormalized, can_read: true },
						{ onConflict: "admin_id,module_key" }
					);
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
			if (selectedAdmin) loadSelectedAdminAccess(selectedAdmin);
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setSavingIndividualKey("");
		}
	}

	const moduleByKey = useMemo(() => {
		const map = new Map<string, ModuleRow>();
		for (const m of modules) map.set(normalizeModuleKey(m.module_key), m);
		return map;
	}, [modules]);

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

	const accessDenied = role !== null && role !== "superadmin" && role !== "admin";
	if (accessDenied) {
		return (
			<section className="bg-white rounded-2xl shadow-sm border p-5">
				<div className="text-lg font-semibold text-black">Permissions</div>
				<div className="mt-2 text-sm text-gray-600">Only Admin and Superadmin can access this page.</div>
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
					<div className="text-lg font-semibold text-black">Permissions</div>
					<div className="text-sm text-gray-500">Individual account access overrides.</div>
					<div className="mt-3">
						<AccessTabs />
					</div>
				</div>
				<button onClick={() => router.push("/Main_Modules/Dashboard/")} className="px-4 py-2 rounded-xl bg-white border">
					Back
				</button>
			</div>

			{role !== "superadmin" ? (
				<div className="mb-4 rounded-xl border bg-yellow-50 p-3 text-sm text-yellow-900">
					You are signed in as <span className="font-semibold">{role ?? "(unknown)"}</span>. Only Superadmin can
					 modify individual access.
				</div>
			) : null}

			{error ? <div className="mb-3 text-red-600 text-sm">{error}</div> : null}
			{success ? <div className="mb-3 text-emerald-700 text-sm">{success}</div> : null}

			<div className="rounded-2xl border p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-semibold text-black">Individual Account Access</div>
						<div className="mt-1 text-xs text-gray-500">
							Shows effective permissions (role defaults + individual overrides). Use the checkboxes to add/remove overrides.
						</div>
					</div>
					<div className="text-xs rounded-full border px-3 py-1 text-gray-600 bg-gray-50">Superadmin only</div>
				</div>

				<div className="mt-3">
					<input
						value={moduleSearch}
						onChange={(e) => setModuleSearch(e.target.value)}
						placeholder="Search page/module key or column"
						className="w-full md:w-96 border rounded-xl px-3 py-2 text-sm text-black"
					/>
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
						onChange={(e) => {
							const nextId = e.target.value;
							setSelectedAdminId(nextId);
							const query = nextId ? `?admin=${encodeURIComponent(nextId)}` : "";
							router.replace(`/Main_Modules/Permissions/${query}`);
						}}
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
						{loadingAccess ? " · loading access…" : ""}
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
					<div className="mt-4 text-sm text-gray-500">Select an account to review and manage overrides.</div>
				) : (
					<div className="mt-4 space-y-4">
						{groupedModules.map((group) => (
							<div key={`individual-${group.title}`} className="rounded-xl border p-3">
								<div className="text-sm font-semibold text-black">{group.title}</div>
								<div className="mt-3 space-y-2">
									{group.rows.map((m) => {
										const roleModuleOn = roleModuleAccess.has(m.module_key);
										const overrideModuleOn = adminModuleAccess.has(m.module_key);
										const effectiveModuleOn = roleModuleOn || overrideModuleOn;
										const moduleLockedByRole = roleModuleOn && !overrideModuleOn;
										const moduleBusy =
											savingIndividualKey === `admin-module:${selectedAdminId}:${m.module_key}`;

										const overrideCols = adminColumnAccess[m.module_key] ?? new Set<string>();
										const roleCols = roleColumnAccess[m.module_key] ?? new Set<string>();
										const effectiveRestricted = roleCols.size > 0 || overrideCols.size > 0;
										const effectiveVisibleCols = Array.from(
											new Set([...Array.from(roleCols), ...Array.from(overrideCols)])
										)
											.filter((col) => !shouldHidePermissionColumn(col))
											.map((col) => formatPermissionColumnLabel(col));
										const effectiveCols = effectiveRestricted
											? effectiveVisibleCols.length
												? effectiveVisibleCols.sort().join(", ")
												: "Internal columns only"
											: "All columns";

										return (
											<div
												key={`individual-${m.module_key}`}
												className={`rounded-xl border p-3 ${
													effectiveModuleOn ? "bg-[#FFF7CC] border-[#FFDA03]" : "bg-white"
												}`}
											>
												<div className="flex items-center justify-between gap-3">
													<div className="min-w-0">
														<div className="text-sm font-medium text-black">{m.display_name}</div>
														<div className="text-xs text-gray-500 font-mono">{m.module_key}</div>
														<div className="mt-1 text-xs text-gray-600">
															Effective: <span className="font-semibold">{effectiveModuleOn ? "Yes" : "No"}</span> · From role: {roleModuleOn ? "Yes" : "No"}
														</div>
														{moduleLockedByRole ? (
															<div className="mt-1 text-xs text-gray-500">This page permission is inherited from the role.</div>
														) : null}
														<div className="mt-1 text-xs text-gray-600">Effective columns: {effectiveCols || "(none)"}</div>
													</div>
													<div className="flex items-center gap-2">
														<label className="text-xs text-gray-700 flex items-center gap-2">
															<span className="text-gray-500">Permission</span>
															<input
																type="checkbox"
																checked={effectiveModuleOn}
																onChange={() => {
																	if (moduleLockedByRole) {
																		setError("This page access is inherited from role. Edit it in Roles tab.");
																		return;
																	}
																	void toggleAdminModule(m.module_key);
																}}
																disabled={!canManage || moduleBusy || moduleLockedByRole}
															/>
														</label>
													</div>
												</div>

												<div className="mt-2 flex flex-wrap gap-2">
													{m.columns.map((col) => {
														const colBusy =
															savingIndividualKey === `admin-column:${selectedAdminId}:${m.module_key}:${col}`;
														const roleColOn = roleCols.has(col);
														const overrideColOn = overrideCols.has(col);
														const colOn = roleColOn || overrideColOn;
														const colLockedByRole = roleColOn && !overrideColOn;
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
																onChange={() => {
																	if (colLockedByRole) {
																		setError("This column access is inherited from role. Edit it in Roles tab.");
																		return;
																	}
																	void toggleAdminColumn(m.module_key, col);
																}}
																disabled={!canManage || colBusy || colLockedByRole}
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
					</div>
				)}
			</div>
		</section>
	);
}

export default function PermissionsPage() {
	return (
		<Suspense
			fallback={
				<section className="bg-white rounded-2xl shadow-sm border p-5">
					<LoadingCircle label="Loading permissions..." />
				</section>
			}
		>
			<PermissionsPageContent />
		</Suspense>
	);
}
