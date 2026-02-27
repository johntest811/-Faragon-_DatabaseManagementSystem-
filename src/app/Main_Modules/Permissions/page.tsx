"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import { AccessTabs } from "../Components/AccessTabs";

type RoleRow = { role_id: string; role_name: string };

type ModuleRow = { module_key: string; display_name: string };

type AccessRow = { role_id: string; module_key: string };

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

export default function PermissionsPage() {
	const router = useRouter();
	const { role } = useAuthRole();
	const api = getElectronApi();

	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	const [roles, setRoles] = useState<RoleRow[]>([]);
	const [modules, setModules] = useState<ModuleRow[]>([]);
	const [access, setAccess] = useState<Record<string, Set<string>>>({});

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

			setRoles(((rRes.data as RoleRow[]) ?? []) || []);
			setModules(((mRes.data as ModuleRow[]) ?? []) || []);

			const map: Record<string, Set<string>> = {};
			for (const row of ((aRes.data as AccessRow[]) ?? []) || []) {
				if (!map[row.role_id]) map[row.role_id] = new Set();
				map[row.role_id].add(row.module_key);
			}
			setAccess(map);
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		}
	}, []);

	useEffect(() => {
		load();

		const channel = supabase
			.channel("realtime:rbac-permissions")
			.on("postgres_changes", { event: "*", schema: "public", table: "app_roles" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "role_module_access" }, () => load())
			.on("postgres_changes", { event: "*", schema: "public", table: "modules" }, () => load())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [load]);

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
			const { error: insErr } = await supabase.from("role_module_access").insert({ role_id: roleId, module_key: moduleKey });
			if (insErr) return setError(insErr.message);
		}

		setSuccess("Access updated.");
		logAudit("RBAC_TOGGLE_ACCESS", { role_id: roleId, module_key: moduleKey, enabled: !current });
		load();
	}

	return (
		<section className="bg-white rounded-2xl shadow-sm border p-5">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold text-black">Permissions</div>
					<div className="text-sm text-gray-500">Toggle module access per role.</div>
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
					 change permissions.
				</div>
			) : null}

			{error ? <div className="mb-3 text-red-600 text-sm">{error}</div> : null}
			{success ? <div className="mb-3 text-emerald-700 text-sm">{success}</div> : null}

			<div className="rounded-2xl border p-4">
				<div className="text-sm font-semibold text-black">Module Access</div>
				<div className="mt-2 text-xs text-gray-500">Toggle which modules each role can access. (Superadmin only)</div>

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
		</section>
	);
}
