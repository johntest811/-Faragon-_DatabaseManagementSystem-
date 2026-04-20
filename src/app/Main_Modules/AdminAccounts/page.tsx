"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import { AccessTabs } from "../Components/AccessTabs";

type RoleRow = { role_id: string; role_name: string };

type AdminRow = {
	id: string;
	username: string;
	role: string;
	full_name: string | null;
	is_active: boolean;
	created_at: string | null;
	last_login: string | null;
};

function getErrorMessage(e: unknown) {
	if (e instanceof Error) return e.message;
	if (e && typeof e === "object" && "message" in e) {
		const message = String((e as { message?: unknown }).message ?? "").trim();
		if (message) return message;
	}
	return "Something went wrong";
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

export default function AdminAccountsPage() {
	const router = useRouter();
	const { role } = useAuthRole();
	const api = getElectronApi();

	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	const [roles, setRoles] = useState<RoleRow[]>([]);
	const [admins, setAdmins] = useState<AdminRow[]>([]);

	const [accountUsername, setAccountUsername] = useState("");
	const [accountFullName, setAccountFullName] = useState("");
	const [accountPassword, setAccountPassword] = useState("");
	const [accountRole, setAccountRole] = useState("admin");
	const [creatingAccount, setCreatingAccount] = useState(false);
	const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);

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
				page: "/Main_Modules/AdminAccounts/",
				details: details && typeof details === "object" ? (details as Record<string, unknown>) : null,
			});
		} catch {
			// ignore
		}
	}

	const loadRoles = useCallback(async () => {
		const { data, error: fetchErr } = await supabase
			.from("app_roles")
			.select("role_id, role_name")
			.order("role_name");
		if (fetchErr) throw fetchErr;
		const rows = (((data as RoleRow[]) || []) as RoleRow[])
			.map((r) => ({ ...r, role_name: String(r.role_name ?? "").trim().toLowerCase() }))
			.filter((r) => r.role_name.length > 0);
		setRoles(rows);
		setAccountRole((prev) => {
			const current = String(prev ?? "").trim().toLowerCase();
			if (rows.some((r) => r.role_name === current)) return current;
			const adminRole = rows.find((r) => r.role_name === "admin")?.role_name;
			return adminRole ?? rows[0]?.role_name ?? (current || "admin");
		});
	}, []);

	const loadAccounts = useCallback(async () => {
		const { data, error: fetchErr } = await supabase
			.from("admins")
			.select("id, username, role, full_name, is_active, created_at, last_login")
			.order("created_at", { ascending: false })
			.limit(500);
		if (fetchErr) throw fetchErr;
		setAdmins((data as AdminRow[]) || []);
	}, []);

	const load = useCallback(async () => {
		setError("");
		setSuccess("");
		try {
			await Promise.all([loadRoles(), loadAccounts()]);
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		}
	}, [loadAccounts, loadRoles]);

	useEffect(() => {
		load();

		const channel = supabase
			.channel("realtime:rbac-admin-accounts")
			.on("postgres_changes", { event: "*", schema: "public", table: "app_roles" }, () => loadRoles())
			.on("postgres_changes", { event: "*", schema: "public", table: "admins" }, () => loadAccounts())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [load, loadAccounts, loadRoles]);

	const roleNames = useMemo(() => roles.map((r) => r.role_name), [roles]);

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
			const username = accountUsername.trim();
			const roleName = accountRole.trim().toLowerCase();
			const { error: roleUpsertErr } = await supabase
				.from("app_roles")
				.upsert({ role_name: roleName }, { onConflict: "role_name" });
			if (roleUpsertErr) return setError(roleUpsertErr.message);

			const { error: insErr } = await supabase.from("admins").insert({
				username,
				password: accountPassword,
				role: roleName,
				full_name: accountFullName.trim() || null,
				is_active: true,
			});
			if (insErr) return setError(insErr.message);

			setSuccess("Account created.");
			setAccountUsername("");
			setAccountPassword("");
			setAccountFullName("");
			setAccountRole(roleName);
			logAudit("ADMIN_CREATE_ACCOUNT", { username, role: roleName });
			loadAccounts();
			loadRoles();
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setCreatingAccount(false);
		}
	}

	async function toggleActiveAccount(a: AdminRow) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can manage accounts.");
		if (currentAdminId && a.id === currentAdminId) return setError("You cannot deactivate your own account.");

		setTogglingActiveId(a.id);
		try {
			const nextIsActive = !a.is_active;
			const { data, error: upErr } = await supabase
				.from("admins")
				.update({ is_active: nextIsActive })
				.eq("id", a.id)
				.select("id, is_active")
				.maybeSingle();
			if (upErr) return setError(upErr.message);
			if (!data) return setError("Account update did not apply. Please try again.");

			setAdmins((prev) =>
				prev.map((row) =>
					row.id === a.id
						? { ...row, is_active: Boolean((data as { is_active?: boolean | null }).is_active) }
						: row
				)
			);

			setSuccess(nextIsActive ? "Account activated." : "Account deactivated.");
			logAudit("ADMIN_TOGGLE_ACCOUNT_ACTIVE", { id: a.id, username: a.username, is_active: nextIsActive });
			void loadAccounts();
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setTogglingActiveId(null);
		}
	}

	async function updateAccountRole(a: AdminRow, nextRole: string) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can manage account roles.");
		if (!nextRole.trim()) return setError("Role is required");
		const roleName = nextRole.trim().toLowerCase();

		const { error: roleUpsertErr } = await supabase
			.from("app_roles")
			.upsert({ role_name: roleName }, { onConflict: "role_name" });
		if (roleUpsertErr) return setError(roleUpsertErr.message);

		const { error: upErr } = await supabase.from("admins").update({ role: roleName }).eq("id", a.id);
		if (upErr) return setError(upErr.message);
		setSuccess("Role updated.");
		logAudit("ADMIN_UPDATE_ACCOUNT_ROLE", { id: a.id, username: a.username, role: roleName });
		setAdmins((prev) => prev.map((row) => (row.id === a.id ? { ...row, role: roleName } : row)));
		loadRoles();
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

	const accessDenied = role !== null && role !== "superadmin";
	if (accessDenied) {
		return (
			<section className="glass-panel animate-slide-up rounded-2xl shadow-2xl p-5 border-none">
				<div className="text-lg font-semibold text-black">Admin Accounts</div>
				<div className="mt-2 text-sm text-black">Only Superadmin can access this page.</div>
				<div className="mt-4 flex gap-2">
			
					<button
						onClick={() => router.push("/Main_Modules/Requests/?module=access")}
						className="animated-btn px-4 py-2 rounded-xl font-semibold bg-[#FFDA03] text-black hover:brightness-95"
					>
						Request Access
					</button>
				</div>
			</section>
		);
	}

	return (
		<section className="glass-panel animate-slide-up rounded-2xl shadow-2xl p-5 border-none">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold text-black">Admin Accounts</div>
					<div className="text-sm text-black">Create accounts and assign roles.</div>
					<div className="mt-3">
						<AccessTabs />
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => router.push("/Main_Modules/Requests/Queue/")}
						className="animated-btn px-4 py-2 rounded-xl bg-white border hover:bg-white"
					>
						Reviewer Queue
					</button>
					<button onClick={() => router.push("/Main_Modules/Dashboard/")} className="animated-btn px-4 py-2 rounded-xl bg-white border hover:bg-white">
						Back
					</button>
				</div>
			</div>

			{role !== "superadmin" ? (
				<div className="mb-4 rounded-xl border border-[#FFDA03] bg-white p-3 text-sm text-[#FFDA03]">
					You are signed in as <span className="font-semibold">{role ?? "(unknown)"}</span>. Only Superadmin can
					 create or modify admin accounts.
				</div>
			) : null}

			{error ? <div className="mb-3 text-red-600 text-sm">{error}</div> : null}
			{success ? <div className="mb-3 text-emerald-700 text-sm">{success}</div> : null}

			<div className="glass-panel animate-scale-in rounded-2xl border-none p-4">
				<div className="text-sm font-semibold text-black">Create Account</div>
				<div className="mt-1 text-xs text-black">Create login accounts for your team. Internal IDs are hidden.</div>
				<div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
					<div>
						<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Username</div>
						<input
							value={accountUsername}
							onChange={(e) => setAccountUsername(e.target.value)}
							placeholder="username"
							className="w-full border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>
					</div>
					<div>
						<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Password</div>
						<input
							type="password"
							value={accountPassword}
							onChange={(e) => setAccountPassword(e.target.value)}
							placeholder="password"
							className="w-full border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>
					</div>
					<div>
						<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Full Name</div>
						<input
							value={accountFullName}
							onChange={(e) => setAccountFullName(e.target.value)}
							placeholder="full name (optional)"
							className="w-full border rounded-xl px-3 py-2 text-black"
							disabled={!canManage || creatingAccount}
						/>
					</div>
					<div>
						<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Role</div>
						<select
							value={accountRole}
							onChange={(e) => setAccountRole(e.target.value)}
							className="w-full border rounded-xl px-3 py-2 text-black bg-white"
							disabled={!canManage || creatingAccount}
						>
							{roleNames.length === 0 ? <option value="admin">admin</option> : null}
							{roleNames.map((r) => (
								<option key={r} value={r}>
									{r}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-3 flex justify-end">
					<button
						onClick={createAccount}
						className={`px-4 py-2 rounded-xl font-semibold ${
							canManage ? "animated-btn bg-[#FFDA03] text-black hover:bg-[#EFCB00]" : "animated-btn bg-[#FFDA03] text-black opacity-60"
						}`}
						disabled={!canManage || creatingAccount}
					>
						{creatingAccount ? "Creating..." : "Create Account"}
					</button>
				</div>
			</div>

			<div className="mt-5 glass-panel animate-scale-in rounded-2xl border-none p-4">
				<div>
					<div className="text-sm font-semibold text-black">Accounts</div>
					<div className="mt-1 text-xs text-black">
						All accounts are shown in one table. Open Permissions for account-only page/column access overrides.
					</div>
				</div>

				<div className="mt-4 overflow-x-auto">
					<table className="w-full table-auto">
						<thead>
							<tr className="text-left text-sm text-black">
								<th className="px-3 py-2">Username</th>
								<th className="px-3 py-2">Name</th>
								<th className="px-3 py-2">Role</th>
								<th className="px-3 py-2">Active</th>
								<th className="px-3 py-2">Last login</th>
								<th className="px-3 py-2">Actions</th>
							</tr>
						</thead>
						<tbody>
							{admins.map((a) => {
									const self = currentAdminId ? a.id === currentAdminId : false;
									const activeLabel = a.is_active ? "Active" : "Inactive";
									const activeClass = a.is_active
										? "text-emerald-700 bg-emerald-50 border-emerald-200"
										: "text-red-700 bg-red-50 border-red-200";
									const toggleBusy = togglingActiveId === a.id;
									return (
										<tr key={a.id} className="animated-row border-t border-gray-100">
											<td className="px-3 py-2 text-black whitespace-nowrap">{a.username}</td>
											<td className="px-3 py-2 text-black">{a.full_name ?? "—"}</td>
											<td className="px-3 py-2 text-black">
												<select
													value={a.role}
													onChange={(e) => updateAccountRole(a, e.target.value)}
													disabled={!canManage}
													className="border rounded-xl px-2 py-1 text-black bg-white"
												>
													{roleNames.map((r) => (
														<option key={r} value={r}>
															{r}
														</option>
													))}
													{roleNames.includes(a.role) ? null : <option value={a.role}>{a.role}</option>}
												</select>
											</td>
											<td className="px-3 py-2">
												<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${activeClass}`}>
													{activeLabel}
												</span>
											</td>
											<td className="px-3 py-2 text-black">
												{a.last_login ? new Date(a.last_login).toLocaleString() : "—"}
											</td>
											<td className="px-3 py-2">
												<div className="flex items-center gap-2">
													<button
														onClick={() =>
															router.push(`/Main_Modules/Permissions/?admin=${encodeURIComponent(a.id)}`)
														}
														disabled={!canManage}
														className={`animated-btn px-3 py-1.5 rounded-xl text-sm border ${
															canManage ? "bg-white text-black hover:bg-white" : "bg-[#FFDA03] text-black opacity-60 cursor-not-allowed"
														}`}
													>
														Permissions
													</button>
													<button
														onClick={() => toggleActiveAccount(a)}
														disabled={!canManage || self || toggleBusy}
													className={`animated-btn px-3 py-1.5 rounded-xl text-sm border ${
														canManage && !self && !toggleBusy
															? "bg-white text-black hover:bg-white"
															: "bg-[#FFDA03] text-black opacity-60 cursor-not-allowed"
													}`}
													>
														{toggleBusy ? "Saving..." : a.is_active ? "Deactivate" : "Activate"}
													</button>
													<button
														onClick={() => deleteAccount(a)}
														disabled={!canManage || self}
													className={`animated-btn px-3 py-1.5 rounded-xl text-sm border ${
														canManage && !self
															? "bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700"
															: "bg-red-600 text-white border-red-600 opacity-60 cursor-not-allowed"
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

