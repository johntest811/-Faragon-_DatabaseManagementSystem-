"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import { AccessTabs } from "../Components/AccessTabs";

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

	type RoleRow = { role_id: string; role_name: string };

	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	const [roles, setRoles] = useState<RoleRow[]>([]);

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

		const rRes = await supabase.from("app_roles").select("role_id, role_name").order("role_name");
		if (rRes.error) return setError(rRes.error.message);
		setRoles(((rRes.data as RoleRow[]) ?? []) || []);
	}, []);

	useEffect(() => {
		load();

		const channel = supabase
			.channel("realtime:rbac-roles")
			.on("postgres_changes", { event: "*", schema: "public", table: "app_roles" }, () => load())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [load]);

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

	return (
		<section className="bg-white rounded-2xl shadow-sm border p-5">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold text-black">Roles</div>
					<div className="text-sm text-gray-500">Create and view roles.</div>
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
					<div className="text-sm font-semibold text-black">Existing Roles</div>
					<div className="mt-2 text-xs text-gray-500">{roles.length} total</div>
					<div className="mt-3 max-h-72 overflow-auto">
						<ul className="space-y-2">
							{roles.map((r) => (
								<li key={r.role_id} className="px-3 py-2 rounded-xl border text-black">
									{r.role_name}
								</li>
							))}
						</ul>
					</div>
				</div>
			</div>
		</section>
	);
}
