"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";

export default function RolesPage() {
	const router = useRouter();
	const { role } = useAuthRole();
	const api = (globalThis as unknown as { electronAPI?: any }).electronAPI;

	type RoleRow = { role_id: string; role_name: string };
	type ModuleRow = { module_key: string; display_name: string };
	type AccessRow = { role_id: string; module_key: string };

	type AdminRow = {
		id: string;
		username: string;
		role: string;
		full_name: string | null;
		position: string | null;
		is_active: boolean;
		created_at: string | null;
		last_login: string | null;
	};

	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	const [roles, setRoles] = useState<RoleRow[]>([]);
	const [modules, setModules] = useState<ModuleRow[]>([]);
	const [access, setAccess] = useState<Record<string, Set<string>>>({});

	const [newRoleName, setNewRoleName] = useState("");
	const [creatingRole, setCreatingRole] = useState(false);

	const [accountUsername, setAccountUsername] = useState("");
	const [accountFullName, setAccountFullName] = useState("");
	const [accountPosition, setAccountPosition] = useState("");
	const [accountPassword, setAccountPassword] = useState("");
	const [accountRole, setAccountRole] = useState("admin");
	const [creatingAccount, setCreatingAccount] = useState(false);

	const [accountTab, setAccountTab] = useState<"employee" | "admin">("employee");
	const [admins, setAdmins] = useState<AdminRow[]>([]);

	const currentAdminId = useMemo(() => {
		try {
			const raw = localStorage.getItem("adminSession");
			if (!raw) return null;
			const parsed = JSON.parse(raw) as { id?: string };
			return parsed?.id ?? null;
		} catch {
			return null;
		}
	}, []);

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
				details: details && typeof details === "object" ? details : null,
			});
		} catch {
			// ignore
		}
	}

	const load = useCallback(async () => {
		setError("");
		setSuccess("");

		const [rRes, mRes, aRes] = await Promise.all([
			supabase.from("app_roles").select("role_id, role_name").order("role_name"),
			supabase.from("modules").select("module_key, display_name").order("module_key"),
			supabase.from("role_module_access").select("role_id, module_key"),
		]);

		if (rRes.error) return setError(rRes.error.message);
		if (mRes.error) return setError(mRes.error.message);
		if (aRes.error) return setError(aRes.error.message);

		setRoles(((rRes.data as RoleRow[]) ?? []) || []);
		setModules(((mRes.data as ModuleRow[]) ?? []) || []);

		const map: Record<string, Set<string>> = {};
		for (const row of ((aRes.data as AccessRow[]) ?? []) || []) {
			if (!map[row.role_id]) map[row.role_id] = new Set();
			map[row.role_id].add(row.module_key);
		}
		setAccess(map);
	}, []);

	const loadAccounts = useCallback(async () => {
		setError("");
		setSuccess("");

		const { data, error: fetchErr } = await supabase
			.from("admins")
			.select("id, username, role, full_name, position, is_active, created_at, last_login")
			.order("created_at", { ascending: false })
			.limit(500);

		if (fetchErr) return setError(fetchErr.message);
		setAdmins((data as AdminRow[]) || []);
	}, []);

	useEffect(() => {
		load();
		loadAccounts();

		const channel = supabase
			.channel("realtime:rbac-admin")
			.on("postgres_changes", { event: "*", schema: "public", table: "app_roles" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "role_module_access" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "admins" }, () => loadAccounts())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [load, loadAccounts]);

	const roleNames = useMemo(() => roles.map((r) => r.role_name), [roles]);

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

	async function toggleAccess(roleId: string, moduleKey: string) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can change module access.");
		const current = access[roleId]?.has(moduleKey) ?? false;

		if (current) {
			const { error: delErr } = await supabase
				.from("role_module_access")
				.delete()
				.eq("role_id", roleId)
				.eq("module_key", moduleKey);
			if (delErr) return setError(delErr.message);
		} else {
			const { error: insErr } = await supabase
				.from("role_module_access")
				.insert({ role_id: roleId, module_key: moduleKey });
			if (insErr) return setError(insErr.message);
		}

		setSuccess("Access updated.");
		logAudit("RBAC_TOGGLE_ACCESS", { role_id: roleId, module_key: moduleKey, enabled: !current });
		load();
	}

	async function createAccount() {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can create accounts.");
		if (!accountUsername.trim() || !accountPassword.trim()) {
			return setError("Username and password are required");
		}
		if (!accountRole.trim()) {
			return setError("Role is required");
		}

		setCreatingAccount(true);
		try {
			const { error: insErr } = await supabase.from("admins").insert({
				username: accountUsername.trim(),
				password: accountPassword,
				role: accountRole.trim().toLowerCase(),
				full_name: accountFullName.trim() || null,
				position: accountPosition.trim() || null,
				is_active: true,
			});
			if (insErr) {
				setError(insErr.message);
				return;
			}
			setSuccess("Account created.");
			setAccountUsername("");
			setAccountPassword("");
			setAccountFullName("");
			logAudit("ADMIN_CREATE_ACCOUNT", { username: accountUsername.trim(), role: accountRole.trim().toLowerCase() });
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to create account");
		} finally {
			setCreatingAccount(false);
		}
	}

	async function toggleActiveAccount(a: AdminRow) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can manage accounts.");
		if (currentAdminId && a.id === currentAdminId) return setError("You cannot deactivate your own account.");

		const { error: upErr } = await supabase
			.from("admins")
			.update({ is_active: !a.is_active })
			.eq("id", a.id);
		if (upErr) return setError(upErr.message);
		setSuccess("Account updated.");
		logAudit("ADMIN_TOGGLE_ACCOUNT_ACTIVE", { id: a.id, username: a.username, is_active: !a.is_active });
	}

	async function deleteAccount(a: AdminRow) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can delete accounts.");
		if (currentAdminId && a.id === currentAdminId) return setError("You cannot delete your own account.");

		const ok = window.confirm(`Permanently delete ${a.username}?`);
		if (!ok) return;
		const { error: delErr } = await supabase.from("admins").delete().eq("id", a.id);
		if (delErr) return setError(delErr.message);
		setSuccess("Account deleted.");
		logAudit("ADMIN_DELETE_ACCOUNT", { id: a.id, username: a.username });
	}

	return (
		<section className="bg-white rounded-2xl shadow-sm border p-5">
			<div className="flex items-center justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold text-black">Roles</div>
					<div className="text-sm text-gray-500">
						Superadmin controls module access + account creation.
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

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
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
					<div className="text-sm font-semibold text-black">Create Account</div>
					<div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
						<input
							value={accountUsername}
							onChange={(e) => setAccountUsername(e.target.value)}
							placeholder="username"
							className="border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>
						<input
							type="password"
							value={accountPassword}
							onChange={(e) => setAccountPassword(e.target.value)}
							placeholder="password"
							className="border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>
						<input
							value={accountFullName}
							onChange={(e) => setAccountFullName(e.target.value)}
							placeholder="full name (optional)"
							className="border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>
						<input
							value={accountPosition}
							onChange={(e) => setAccountPosition(e.target.value)}
							placeholder="position (optional)"
							className="border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>

						<input
							value={accountRole}
							onChange={(e) => setAccountRole(e.target.value)}
							list="role-list"
							placeholder="role (e.g. employee/admin/superadmin)"
							className="border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>
						<div className="md:col-span-2 text-xs text-gray-500">
							Uses <span className="font-mono">public.admins</span>. Note: your current schema restricts
							 <span className="font-mono">admins.role</span> to <span className="font-mono">superadmin/admin/employee</span>.
						</div>
					</div>
					<datalist id="role-list">
						{roleNames.map((r) => (
							<option key={r} value={r} />
						))}
					</datalist>
					<div className="mt-3 flex justify-end">
						<button
							onClick={createAccount}
							className={`px-4 py-2 rounded-xl font-semibold ${
								canManage ? "bg-[#FFDA03] text-black" : "bg-gray-100 text-gray-400"
							}`}
							disabled={!canManage || creatingAccount}
						>
							{creatingAccount ? "Creating..." : "Create Account"}
						</button>
					</div>
					<div className="mt-2 text-xs text-gray-500">
						Passwords are stored as plain text in <span className="font-mono">admins.password</span> per your SQL.
					</div>
				</div>
			</div>

			<div className="mt-5 rounded-2xl border p-4">
				<div className="text-sm font-semibold text-black">Module Access</div>
				<div className="mt-2 text-xs text-gray-500">
					Toggle which modules each role can access. (Superadmin only)
				</div>

				<div className="mt-4 overflow-x-auto">
					<table className="w-full table-auto">
						<thead>
							<tr className="text-left text-sm text-gray-600">
								<th className="px-3 py-2">Role</th>
								{modules.map((m) => (
									<th key={m.module_key} className="px-3 py-2 whitespace-nowrap">
										{m.display_name}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{roles.map((r) => (
								<tr key={r.role_id} className="border-t">
									<td className="px-3 py-2 text-black font-semibold whitespace-nowrap">{r.role_name}</td>
									{modules.map((m) => {
										const checked = access[r.role_id]?.has(m.module_key) ?? false;
										return (
											<td key={m.module_key} className="px-3 py-2">
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleAccess(r.role_id, m.module_key)}
													disabled={!canManage}
												/>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="mt-5 rounded-2xl border p-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-sm font-semibold text-black">Accounts</div>
						<div className="mt-1 text-xs text-gray-500">Employees are <span className="font-mono">role=employee</span>; admins include <span className="font-mono">role=admin/superadmin</span>.</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setAccountTab("employee")}
							className={`px-3 py-1.5 rounded-full border text-sm ${
								accountTab === "employee" ? "bg-[#FFDA03] text-black" : "bg-white text-gray-700"
							}`}
						>
							Employees
						</button>
						<button
							onClick={() => setAccountTab("admin")}
							className={`px-3 py-1.5 rounded-full border text-sm ${
								accountTab === "admin" ? "bg-[#FFDA03] text-black" : "bg-white text-gray-700"
							}`}
						>
							Admins
						</button>
					</div>
				</div>

				<div className="mt-4 overflow-x-auto">
					<table className="w-full table-auto">
						<thead>
							<tr className="text-left text-sm text-gray-600">
								<th className="px-3 py-2">Username</th>
								<th className="px-3 py-2">Name</th>
								<th className="px-3 py-2">Role</th>
								<th className="px-3 py-2">Active</th>
								<th className="px-3 py-2">Last login</th>
								<th className="px-3 py-2">Actions</th>
							</tr>
						</thead>
						<tbody>
							{admins
								.filter((a) => (accountTab === "employee" ? a.role === "employee" : a.role !== "employee"))
								.map((a) => {
									const self = currentAdminId ? a.id === currentAdminId : false;
									return (
										<tr key={a.id} className="border-t">
											<td className="px-3 py-2 text-black whitespace-nowrap">{a.username}</td>
											<td className="px-3 py-2 text-black">{a.full_name ?? "—"}</td>
											<td className="px-3 py-2 text-black">{a.role}</td>
											<td className="px-3 py-2 text-black">{a.is_active ? "Yes" : "No"}</td>
											<td className="px-3 py-2 text-black">{a.last_login ? new Date(a.last_login).toLocaleString() : "—"}</td>
											<td className="px-3 py-2">
												<div className="flex items-center gap-2">
													<button
														onClick={() => toggleActiveAccount(a)}
														disabled={!canManage || self}
														className={`px-3 py-1.5 rounded-xl text-sm border ${
															canManage && !self ? "bg-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"
														}`}
													>
														{a.is_active ? "Deactivate" : "Activate"}
													</button>
													<button
														onClick={() => deleteAccount(a)}
														disabled={!canManage || self}
														className={`px-3 py-1.5 rounded-xl text-sm border ${
															canManage && !self
																? "bg-red-600 text-white border-red-600"
																: "bg-gray-100 text-gray-400 cursor-not-allowed"
														}`}
													>
														Delete
													</button>
												</div>
											</td>
										</tr>
									);
								})}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}
