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

type PresetDef = {
	id: string;
	label: string;
	description: string;
	getKeys: (available: string[]) => string[];
};

const PRESETS: PresetDef[] = [
	{
		id: "minimal",
		label: "Minimal",
		description: "Dashboard + Requests only",
		getKeys: (available) => ["dashboard", "requests"].filter((k) => available.includes(k)),
	},
	{
		id: "operations",
		label: "Operations",
		description: "Core workforce + logistics pages",
		getKeys: (available) =>
			[
				"dashboard",
				"employees",
				"reassign",
				"resigned",
				"retired",
				"archive",
				"client",
				"inventory",
				"paraphernalia",
				"reports",
				"requests",
			]
				.filter((k) => available.includes(k)),
	},
	{
		id: "full",
		label: "Full Access",
		description: "All available modules",
		getKeys: (available) => available,
	},
];

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
	const [savingKey, setSavingKey] = useState<string>("");
	const [roleSearch, setRoleSearch] = useState("");
	const [moduleSearch, setModuleSearch] = useState("");
	const [presetRoleId, setPresetRoleId] = useState("");
	const [presetId, setPresetId] = useState("operations");
	const [applyingPreset, setApplyingPreset] = useState(false);

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
			setPresetRoleId((prev) => {
				const loaded = ((rRes.data as RoleRow[]) ?? []) || [];
				if (prev && loaded.some((r) => r.role_id === prev)) return prev;
				return loaded[0]?.role_id ?? "";
			});

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
		setSavingKey(`${roleId}:${moduleKey}`);

		try {
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
		} finally {
			setSavingKey("");
		}
	}

	async function applyPresetDefaults() {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can set default permissions.");

		const roleRow = roles.find((r) => r.role_id === presetRoleId);
		if (!roleRow) return setError("Please select a role.");

		const preset = PRESETS.find((p) => p.id === presetId);
		if (!preset) return setError("Please select a preset.");

		const available = modules.map((m) => normalizeModuleKey(m.module_key));
		const selectedKeys = Array.from(new Set(preset.getKeys(available)));

		setApplyingPreset(true);
		try {
			const { error: delErr } = await supabase.from("role_module_access").delete().eq("role_id", roleRow.role_id);
			if (delErr) return setError(delErr.message);

			if (selectedKeys.length > 0) {
				const rows = selectedKeys.map((moduleKey) => ({
					role_id: roleRow.role_id,
					module_key: moduleKey,
					can_read: true,
					can_write: roleRow.role_name === "superadmin",
				}));
				const { error: insErr } = await supabase.from("role_module_access").insert(rows);
				if (insErr) return setError(insErr.message);
			}

			setSuccess(`Default permissions updated for ${roleRow.role_name}.`);
			logAudit("RBAC_APPLY_DEFAULT_PRESET", {
				role_id: roleRow.role_id,
				role_name: roleRow.role_name,
				preset_id: preset.id,
				module_keys: selectedKeys,
			});
			load();
		} finally {
			setApplyingPreset(false);
		}
	}

	const moduleByKey = useMemo(() => {
		const map = new Map<string, ModuleRow>();
		for (const m of modules) map.set(m.module_key, m);
		return map;
	}, [modules]);

	const filteredRoles = useMemo(() => {
		const q = roleSearch.trim().toLowerCase();
		if (!q) return roles;
		return roles.filter((r) => r.role_name.toLowerCase().includes(q));
	}, [roleSearch, roles]);

	const groupedModules = useMemo(() => {
		return groupedCatalog(moduleSearch)
			.map((group) => ({
				title: group.title,
				rows: group.rows
					.map((row) => moduleByKey.get(row.moduleKey))
					.filter((v): v is ModuleRow => !!v),
			}))
			.filter((g) => g.rows.length > 0);
	}, [moduleByKey, moduleSearch]);

	const accessDenied = role !== null && role !== "superadmin";
	if (accessDenied) {
		return (
			<section className="bg-white rounded-2xl shadow-sm border p-5">
				<div className="text-lg font-semibold text-black">Permissions</div>
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

			<div className="mb-5 rounded-2xl border p-4">
				<div className="text-sm font-semibold text-black">Default Permission Presets</div>
				<div className="mt-2 text-xs text-gray-500">
					Set role defaults used whenever an account is assigned that role.
				</div>

				<div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
					<input
						value={roleSearch}
						onChange={(e) => setRoleSearch(e.target.value)}
						placeholder="Search role name"
						className="border rounded-xl px-3 py-2 text-sm text-black"
					/>
					<input
						value={moduleSearch}
						onChange={(e) => setModuleSearch(e.target.value)}
						placeholder="Search page/module key"
						className="border rounded-xl px-3 py-2 text-sm text-black"
					/>
					<select
						value={presetRoleId}
						onChange={(e) => setPresetRoleId(e.target.value)}
						className="border rounded-xl px-3 py-2 text-sm text-black bg-white"
					>
						<option value="">Select role…</option>
						{roles.map((r) => (
							<option key={r.role_id} value={r.role_id}>
								{r.role_name}
							</option>
						))}
					</select>
					<select
						value={presetId}
						onChange={(e) => setPresetId(e.target.value)}
						className="border rounded-xl px-3 py-2 text-sm text-black bg-white"
					>
						{PRESETS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label}
							</option>
						))}
					</select>
				</div>

				<div className="mt-3 flex items-center justify-between gap-3">
					<div className="text-xs text-gray-500">
						{PRESETS.find((p) => p.id === presetId)?.description ?? ""}
					</div>
					<button
						onClick={applyPresetDefaults}
						disabled={!canManage || applyingPreset}
						className={`px-4 py-2 rounded-xl text-sm font-semibold ${
							!canManage || applyingPreset ? "bg-gray-100 text-gray-400" : "bg-[#FFDA03] text-black"
						}`}
					>
						{applyingPreset ? "Applying…" : "Apply as Default"}
					</button>
				</div>
			</div>

			<div className="rounded-2xl border p-4">
				<div className="text-sm font-semibold text-black">Role Permission Matrix</div>
				<div className="mt-2 text-xs text-gray-500">
					Pages are grouped by module section so role differences are easier to review.
				</div>

				<div className="mt-4 space-y-4">
					{groupedModules.map((group) => (
						<div key={group.title} className="rounded-xl border p-3">
							<div className="text-sm font-semibold text-black">{group.title}</div>
							<div className="mt-3 overflow-x-auto">
								<table className="w-full table-auto min-w-[640px]">
									<thead>
										<tr className="text-left text-sm text-gray-600">
											<th className="px-3 py-2">Page</th>
											{filteredRoles.map((r) => (
												<th key={r.role_id} className="px-3 py-2 whitespace-nowrap">
													{r.role_name}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{group.rows.map((m) => (
											<tr key={m.module_key} className="border-t align-top">
												<td className="px-3 py-2">
													<div className="text-sm font-medium text-black">
														{moduleByKey.get(normalizeModuleKey(m.module_key))?.display_name ?? m.display_name}
													</div>
													<div className="text-xs text-gray-500 font-mono">{m.module_key}</div>
												</td>
												{filteredRoles.map((r) => {
													const checked = access[r.role_id]?.has(m.module_key) ?? false;
													const busy = savingKey === `${r.role_id}:${m.module_key}`;
													return (
														<td key={r.role_id} className="px-3 py-2 text-center">
															<input
																type="checkbox"
																checked={checked}
																onChange={() => toggleAccess(r.role_id, m.module_key)}
																disabled={!canManage || busy}
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
					))}

					{groupedModules.length === 0 ? (
						<div className="rounded-xl border p-3 text-sm text-gray-500">No pages match the current filter.</div>
					) : null}

					{filteredRoles.length === 0 ? (
						<div className="rounded-xl border p-3 text-sm text-gray-500">No roles match the current filter.</div>
					) : null}
				</div>
			</div>
		</section>
	);
}
