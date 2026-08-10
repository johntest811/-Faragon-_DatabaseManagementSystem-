"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import { AccessTabs } from "../Components/AccessTabs";
import { SECURITY_ACCOUNT_PARAPHERNALIA_COLUMNS } from "../Components/permissionCatalog";
import { Pencil, Search, ShieldCheck, UserCheck, UserPlus, UserX, Users, X } from "lucide-react";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import PageLoading from "@/app/Components/PageLoading";

type RoleRow = { role_id: string; role_name: string };

type AdminRow = {
	id: string;
	username: string;
	role: string;
	full_name: string | null;
	is_active: boolean;
	created_at: string | null;
	last_login: string | null;
	assigned_detachment: string | null;
	applicant_id: string | null;
	employee_number: string | null;
};

type EmployeeAccountOption = {
	applicant_id: string;
	custom_id: string | null;
	first_name: string | null;
	middle_name: string | null;
	last_name: string | null;
	extn_name: string | null;
	client_email: string | null;
	detachment: string | null;
	client_position: string | null;
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
	actor_name?: string | null;
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

function getLegacyAdminDisplayName() {
	try {
		const raw = localStorage.getItem("adminSession");
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { full_name?: unknown; username?: unknown };
		const fullName = String(parsed?.full_name ?? "").trim();
		const username = String(parsed?.username ?? "").trim();
		return fullName || username || null;
	} catch {
		return null;
	}
}

function formatRoleLabel(value: string | null | undefined) {
	const raw = String(value ?? "").trim();
	if (!raw) return "Unassigned";
	return raw
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatEmployeeName(employee: EmployeeAccountOption) {
	return [employee.first_name, employee.middle_name, employee.last_name, employee.extn_name]
		.map((part) => String(part ?? "").trim())
		.filter(Boolean)
		.join(" ");
}

function suggestedEmployeeUsername(employee: EmployeeAccountOption) {
	const email = String(employee.client_email ?? "").trim().toLowerCase();
	if (email) return email;
	const employeeNumber = String(employee.custom_id ?? "").trim().toLowerCase();
	if (employeeNumber) return employeeNumber;
	return `${employee.last_name ?? "employee"}.${employee.first_name ?? "account"}`
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "")
		.replace(/^\.+|\.+$/g, "");
}

function employeePositionRole(employee: EmployeeAccountOption) {
	const position = String(employee.client_position ?? "").trim().toLowerCase();
	if (!position) return "employee";
	return position
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "") || "employee";
}

export default function AdminAccountsPage() {
	const router = useRouter();
	const { role, loading: roleLoading } = useAuthRole();
	const api = getElectronApi();

	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");
	const [initialLoading, setInitialLoading] = useState(true);

	const [roles, setRoles] = useState<RoleRow[]>([]);
	const [admins, setAdmins] = useState<AdminRow[]>([]);
	const [employees, setEmployees] = useState<EmployeeAccountOption[]>([]);
	const [detachmentOptions, setDetachmentOptions] = useState<string[]>(["FARAGON"]);

	const [accountUsername, setAccountUsername] = useState("");
	const [accountFullName, setAccountFullName] = useState("");
	const [accountPassword, setAccountPassword] = useState("");
	const [accountRole, setAccountRole] = useState("admin");
	const [accountDetachment, setAccountDetachment] = useState("");
	const [accountSearch, setAccountSearch] = useState("");
	const [accountViewer, setAccountViewer] = useState<"administrative" | "security">("administrative");
	const [creatingAccount, setCreatingAccount] = useState(false);
	const [createAccountOpen, setCreateAccountOpen] = useState(false);
	const [employeeAccountOpen, setEmployeeAccountOpen] = useState(false);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
	const [employeeUsername, setEmployeeUsername] = useState("");
	const [employeePassword, setEmployeePassword] = useState("");
	const [creatingEmployeeAccount, setCreatingEmployeeAccount] = useState(false);
	const [editingAccount, setEditingAccount] = useState<AdminRow | null>(null);
	const [editUsername, setEditUsername] = useState("");
	const [editFullName, setEditFullName] = useState("");
	const [editPassword, setEditPassword] = useState("");
	const [savingAccountEdit, setSavingAccountEdit] = useState(false);
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
	const canUsePortal = typeof document !== "undefined";

	useEffect(() => {
		if ((!createAccountOpen && !employeeAccountOpen && !editingAccount) || !canUsePortal) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [createAccountOpen, editingAccount, employeeAccountOpen, canUsePortal]);

	async function logAudit(action: string, details?: unknown) {
		if (!api?.audit?.logEvent) return;
		try {
			const session = await supabase.auth.getSession();
			await api.audit.logEvent({
				actor_user_id: session.data.session?.user?.id ?? null,
				actor_email: session.data.session?.user?.email ?? null,
				actor_name: getLegacyAdminDisplayName(),
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
		const wideResult = await supabase
			.from("admins")
			.select("id, username, role, full_name, is_active, created_at, last_login, assigned_detachment, applicant_id, employee_number")
			.order("created_at", { ascending: false })
			.limit(500);
		if (!wideResult.error) {
			setAdmins((wideResult.data as AdminRow[]) || []);
			return;
		}

		const fallback = await supabase
			.from("admins")
			.select("id, username, role, full_name, is_active, created_at, last_login")
			.order("created_at", { ascending: false })
			.limit(500);
		if (fallback.error) throw fallback.error;
		setAdmins((((fallback.data as Array<Omit<AdminRow, "assigned_detachment" | "applicant_id" | "employee_number">>) || [])).map((row) => ({
			...row,
			assigned_detachment: null,
			applicant_id: null,
			employee_number: null,
		})));
		setError("Run SQL/supabase_paraphernalia_main_inventory_and_access.sql to enable account detachment assignments.");
	}, []);

	const loadEmployees = useCallback(async () => {
		const { data, error: employeeError } = await supabase
			.from("applicants")
			.select("applicant_id, custom_id, first_name, middle_name, last_name, extn_name, client_email, detachment, client_position, status, is_archived, is_trashed")
			.eq("is_archived", false)
			.eq("is_trashed", false)
			.order("last_name")
			.limit(5000);
		if (employeeError) throw employeeError;
		setEmployees(
			((data ?? []) as Array<Record<string, unknown>>)
				.filter((row) => String(row.status ?? "").trim().toUpperCase() === "ACTIVE")
				.map((row) => ({
					applicant_id: String(row.applicant_id ?? ""),
					custom_id: row.custom_id == null ? null : String(row.custom_id),
					first_name: row.first_name == null ? null : String(row.first_name),
					middle_name: row.middle_name == null ? null : String(row.middle_name),
					last_name: row.last_name == null ? null : String(row.last_name),
					extn_name: row.extn_name == null ? null : String(row.extn_name),
					client_email: row.client_email == null ? null : String(row.client_email),
					detachment: row.detachment == null ? null : String(row.detachment),
					client_position: row.client_position == null ? null : String(row.client_position),
				}))
				.filter((row) => row.applicant_id && formatEmployeeName(row))
		);
	}, []);

	const loadDetachments = useCallback(async () => {
		const [contractsResult, savedResult] = await Promise.all([
			supabase.from("contracts").select("specific_area").order("specific_area").limit(5000),
			supabase.from("paraphernalia_detachment_tables").select("detachment").eq("is_active", true).order("detachment"),
		]);
		const values = new Map<string, string>([["faragon", "FARAGON"]]);
		for (const row of (contractsResult.data ?? []) as Array<{ specific_area?: string | null }>) {
			const value = String(row.specific_area ?? "").trim().replace(/\s+/g, " ");
			if (value) values.set(value.toLowerCase(), value);
		}
		for (const row of (savedResult.data ?? []) as Array<{ detachment?: string | null }>) {
			const value = String(row.detachment ?? "").trim().replace(/\s+/g, " ");
			if (value) values.set(value.toLowerCase(), value);
		}
		setDetachmentOptions(Array.from(values.values()).sort((a, b) => a === "FARAGON" ? -1 : b === "FARAGON" ? 1 : a.localeCompare(b)));
	}, []);

	const load = useCallback(async () => {
		setError("");
		setSuccess("");
		try {
			await Promise.all([loadRoles(), loadAccounts(), loadDetachments(), loadEmployees()]);
		} catch (e: unknown) {
			setError(getErrorMessage(e));
		} finally {
			setInitialLoading(false);
		}
	}, [loadAccounts, loadDetachments, loadEmployees, loadRoles]);

	useEffect(() => {
		load();

		const channel = supabase
			.channel("realtime:rbac-admin-accounts")
			.on("postgres_changes", { event: "*", schema: "public", table: "app_roles" }, () => loadRoles())
			.on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => loadDetachments())
			.on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia_detachment_tables" }, () => loadDetachments())
			.on("postgres_changes", { event: "*", schema: "public", table: "admins" }, () => loadAccounts())
			.on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => loadEmployees())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [load, loadAccounts, loadDetachments, loadEmployees, loadRoles]);

	const roleNames = useMemo(() => roles.map((r) => r.role_name), [roles]);
	const activeAdminCount = useMemo(() => admins.filter((row) => row.is_active).length, [admins]);
	const inactiveAdminCount = useMemo(() => admins.filter((row) => !row.is_active).length, [admins]);
	const filteredAdmins = useMemo(() => {
		const q = accountSearch.trim().toLowerCase();
		if (!q) return admins;
		return admins.filter((row) => {
			const username = String(row.username ?? "").toLowerCase();
			const fullName = String(row.full_name ?? "").toLowerCase();
			const roleName = String(row.role ?? "").toLowerCase();
			const detachment = String(row.assigned_detachment ?? "").toLowerCase();
			return username.includes(q) || fullName.includes(q) || roleName.includes(q) || detachment.includes(q);
		});
	}, [accountSearch, admins]);
	const filteredAdministrativeAccounts = useMemo(
		() => filteredAdmins.filter((admin) => !admin.applicant_id),
		[filteredAdmins]
	);
	const filteredSecurityAccounts = useMemo(
		() => filteredAdmins.filter((admin) => Boolean(admin.applicant_id)),
		[filteredAdmins]
	);
	const visibleAccounts = accountViewer === "security" ? filteredSecurityAccounts : filteredAdministrativeAccounts;
	const selectedEmployee = useMemo(
		() => employees.find((employee) => employee.applicant_id === selectedEmployeeId) ?? null,
		[employees, selectedEmployeeId]
	);
	const employeeAccountIds = useMemo(
		() => new Set(admins.map((admin) => admin.applicant_id).filter((value): value is string => Boolean(value))),
		[admins]
	);

	function openEmployeeAccountDialog() {
		setError("");
		setSuccess("");
		const firstAvailable = employees.find((employee) => !employeeAccountIds.has(employee.applicant_id)) ?? null;
		setSelectedEmployeeId(firstAvailable?.applicant_id ?? "");
		setEmployeeUsername(firstAvailable ? suggestedEmployeeUsername(firstAvailable) : "");
		setEmployeePassword("");
		setEmployeeAccountOpen(true);
	}

	function selectEmployeeForAccount(applicantId: string) {
		setSelectedEmployeeId(applicantId);
		const employee = employees.find((row) => row.applicant_id === applicantId);
		setEmployeeUsername(employee ? suggestedEmployeeUsername(employee) : "");
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
				assigned_detachment: accountDetachment.trim() || null,
				is_active: true,
			});
			if (insErr) return setError(insErr.message);

			setSuccess("Account created.");
			setAccountUsername("");
			setAccountPassword("");
			setAccountFullName("");
			setAccountDetachment("");
			setAccountRole(roleName);
			setCreateAccountOpen(false);
			logAudit("ADMIN_CREATE_ACCOUNT", { username, role: roleName, assigned_detachment: accountDetachment.trim() || null });
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

	function openAccountEditor(account: AdminRow) {
		setError("");
		setSuccess("");
		setEditingAccount(account);
		setEditUsername(account.username);
		setEditFullName(account.full_name ?? "");
		setEditPassword("");
	}

	async function saveAccountEdit() {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can edit accounts.");
		if (!editingAccount) return;
		const username = editUsername.trim();
		if (!username) return setError("Username is required.");

		setSavingAccountEdit(true);
		try {
			const updates: { username: string; full_name: string | null; password?: string } = {
				username,
				full_name: editFullName.trim() || null,
			};
			if (editPassword.trim()) updates.password = editPassword;

			const { data, error: updateError } = await supabase
				.from("admins")
				.update(updates)
				.eq("id", editingAccount.id)
				.select("id, username, full_name")
				.maybeSingle();
			if (updateError) throw updateError;
			if (!data) throw new Error("Account update did not apply. Please try again.");

			setAdmins((previous) => previous.map((account) => (
				account.id === editingAccount.id
					? { ...account, username, full_name: updates.full_name }
					: account
			)));

			if (currentAdminId === editingAccount.id) {
				try {
					const rawSession = localStorage.getItem("adminSession");
					if (rawSession) {
						const currentSession = JSON.parse(rawSession) as Record<string, unknown>;
						localStorage.setItem("adminSession", JSON.stringify({
							...currentSession,
							username,
							full_name: updates.full_name,
						}));
					}
				} catch {
					// The database update succeeded; a fresh login will restore the session details.
				}
			}

			void logAudit("ADMIN_EDIT_ACCOUNT", {
				id: editingAccount.id,
				previous_username: editingAccount.username,
				username,
				full_name: updates.full_name,
				password_changed: Boolean(updates.password),
			});
			setEditingAccount(null);
			setEditPassword("");
			setSuccess("Account details updated.");
		} catch (e: unknown) {
			const message = getErrorMessage(e);
			setError(
				message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")
					? "That username is already being used by another account."
					: message
			);
		} finally {
			setSavingAccountEdit(false);
		}
	}

	async function deleteAccount(a: AdminRow) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can delete accounts.");
		if (currentAdminId && a.id === currentAdminId) return setError("You cannot delete your own account.");

		const ok = window.confirm(`Permanently delete ${a.username}?`);
		if (!ok) return;

		const { error: clearRequesterErr } = await supabase
			.from("access_requests")
			.update({ requester_admin_id: null })
			.eq("requester_admin_id", a.id);
		if (clearRequesterErr) return setError(clearRequesterErr.message);

		const { error: clearApproverErr } = await supabase
			.from("access_requests")
			.update({ approver_admin_id: null })
			.eq("approver_admin_id", a.id);
		if (clearApproverErr) return setError(clearApproverErr.message);

		const { error: delErr } = await supabase.from("admins").delete().eq("id", a.id);
		if (delErr) return setError(delErr.message);
		setSuccess("Account deleted.");
		logAudit("ADMIN_DELETE_ACCOUNT", { id: a.id, username: a.username });
		void loadAccounts();
	}

	async function createEmployeeAccount() {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can create security accounts.");
		if (!selectedEmployee) return setError("Select an active employee first.");
		if (employeeAccountIds.has(selectedEmployee.applicant_id)) return setError("This employee already has an account.");
		if (!employeeUsername.trim() || !employeePassword.trim()) return setError("Username and password are required.");

		setCreatingEmployeeAccount(true);
		try {
			const roleName = employeePositionRole(selectedEmployee);
			if (roleName === "superadmin") {
				throw new Error("Superadmin is reserved and cannot be assigned through Create Security Account.");
			}
			const { data: employeeRole, error: roleError } = await supabase
				.from("app_roles")
				.upsert({ role_name: roleName }, { onConflict: "role_name" })
				.select("role_id")
				.single();
			if (roleError) throw roleError;

			const roleId = String(employeeRole?.role_id ?? "");
			if (roleId) {
				const clearColumns = await supabase.from("role_column_access").delete().eq("role_id", roleId);
				if (clearColumns.error) throw clearColumns.error;
				const [clearModules, clearDetachmentScope] = await Promise.all([
					supabase.from("role_module_access").delete().eq("role_id", roleId),
					supabase.from("role_paraphernalia_detachment_access").delete().eq("role_id", roleId),
				]);
				if (clearModules.error) throw clearModules.error;
				if (clearDetachmentScope.error) throw clearDetachmentScope.error;

				const { error: moduleError } = await supabase.from("role_module_access").upsert(
					{ role_id: roleId, module_key: "paraphernalia", can_read: true, can_write: false, can_edit: false },
					{ onConflict: "role_id,module_key" }
				);
				if (moduleError) throw moduleError;

				const { error: columnsError } = await supabase.from("role_column_access").upsert(
					SECURITY_ACCOUNT_PARAPHERNALIA_COLUMNS.map((columnKey) => ({
						role_id: roleId,
						module_key: "paraphernalia",
						column_key: columnKey,
						can_read: true,
					})),
					{ onConflict: "role_id,module_key,column_key" }
				);
				if (columnsError) throw columnsError;
			}

			const username = employeeUsername.trim();
			const { error: insertError } = await supabase.from("admins").insert({
				username,
				password: employeePassword,
				role: roleName,
				full_name: formatEmployeeName(selectedEmployee),
				employee_number: selectedEmployee.custom_id?.trim() || null,
				applicant_id: selectedEmployee.applicant_id,
				assigned_detachment: selectedEmployee.detachment?.trim() || null,
				is_active: true,
			});
			if (insertError) throw insertError;

			setSuccess(`Security account created for ${formatEmployeeName(selectedEmployee)} with the ${formatRoleLabel(roleName)} role.`);
			setEmployeeAccountOpen(false);
			setSelectedEmployeeId("");
			setEmployeeUsername("");
			setEmployeePassword("");
			void logAudit("ADMIN_CREATE_EMPLOYEE_ACCOUNT", {
				applicant_id: selectedEmployee.applicant_id,
				username,
				role: roleName,
				assigned_detachment: selectedEmployee.detachment?.trim() || null,
			});
			await Promise.all([loadAccounts(), loadRoles()]);
		} catch (e: unknown) {
			const message = getErrorMessage(e);
			setError(
				message.includes("duplicate") || message.includes("unique")
					? "That employee or username already has an account."
					: `${message} Run SQL/supabase_paraphernalia_main_inventory_and_access.sql if applicant_id is missing.`
			);
		} finally {
			setCreatingEmployeeAccount(false);
		}
	}

	async function updateAccountDetachment(a: AdminRow, nextDetachment: string) {
		setError("");
		setSuccess("");
		if (!canManage) return setError("Only Superadmin can manage account detachments.");
		const assignedDetachment = nextDetachment.trim() || null;
		const { error: updateError } = await supabase
			.from("admins")
			.update({ assigned_detachment: assignedDetachment })
			.eq("id", a.id);
		if (updateError) return setError(updateError.message);
		setAdmins((prev) => prev.map((row) => row.id === a.id ? { ...row, assigned_detachment: assignedDetachment } : row));
		setSuccess(assignedDetachment ? "Assigned detachment updated." : "Account detachment assignment cleared.");
		logAudit("ADMIN_UPDATE_ACCOUNT_DETACHMENT", {
			id: a.id,
			username: a.username,
			assigned_detachment: assignedDetachment,
		});
	}

	if (initialLoading || roleLoading) {
		return <PageLoading label="Loading admin accounts..." />;
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
				<div className="flex flex-wrap items-center justify-end gap-2">
					<button
						onClick={openEmployeeAccountDialog}
						disabled={!canManage}
						className={`animated-btn inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-semibold ${
							canManage ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-500 cursor-not-allowed"
						}`}
					>
						<UserCheck className="h-4 w-4" />
						Create Security Account
					</button>
					<button
						onClick={() => {
							setError("");
							setSuccess("");
							setCreateAccountOpen(true);
						}}
						disabled={!canManage}
						className={`animated-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold border ${
							canManage
								? "bg-[#FFDA03] text-black hover:bg-[#EFCB00]"
								: "bg-[#FFDA03] text-black opacity-60 cursor-not-allowed"
						}`}
					>
						<UserPlus className="h-4 w-4" />
						Create Account
					</button>
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

			{error ? (
				<div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			) : null}
			{success ? (
				<div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
			) : null}

			<div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
							<Users className="h-5 w-5" />
						</div>
						<div>
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Accounts</div>
							<div className="text-2xl font-semibold text-black">{admins.length}</div>
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
							<UserCheck className="h-5 w-5" />
						</div>
						<div>
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active</div>
							<div className="text-2xl font-semibold text-black">{activeAdminCount}</div>
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white">
							<UserX className="h-5 w-5" />
						</div>
						<div>
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inactive</div>
							<div className="text-2xl font-semibold text-black">{inactiveAdminCount}</div>
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-black">
							<ShieldCheck className="h-5 w-5" />
						</div>
						<div>
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Roles</div>
							<div className="text-2xl font-semibold text-black">{roles.length}</div>
						</div>
					</div>
				</div>
			</div>

			{createAccountOpen && canUsePortal
				? createPortal(
						<div className="fixed inset-0 z-[190] flex items-center justify-center overflow-hidden bg-black/45 p-4" onClick={() => setCreateAccountOpen(false)}>
							<div
								className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl"
								onClick={(e) => e.stopPropagation()}
							>
								<div className="shrink-0 bg-gradient-to-r from-[#111827] via-[#8B1C1C] to-[#611313] px-6 py-5 text-white">
									<div className="flex items-start justify-between gap-4">
										<div>
											<div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/75">
												<UserPlus className="h-3.5 w-3.5 text-[#FFDA03]" />
												New account
											</div>
											<div className="mt-3 text-2xl font-semibold">Create Admin Account</div>
											<div className="mt-1 text-sm text-white/75">Add a login account and assign the initial role without leaving the page.</div>
										</div>
										<button
											type="button"
											onClick={() => setCreateAccountOpen(false)}
											className="animated-btn inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15"
										>
											<X className="h-4 w-4" />
										</button>
									</div>
								</div>

								<div className="min-h-0 overflow-y-auto overscroll-contain p-6">
									<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
										<div>
											<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Username</div>
											<input
												value={accountUsername}
												onChange={(e) => setAccountUsername(e.target.value)}
												placeholder="username"
												className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
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
												className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
												disabled={!canManage || creatingAccount}
											/>
										</div>
										<div>
											<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Full Name</div>
											<input
												value={accountFullName}
												onChange={(e) => setAccountFullName(e.target.value)}
												placeholder="full name (optional)"
												className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
												disabled={!canManage || creatingAccount}
											/>
										</div>
										<div>
											<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Role</div>
											<select
												value={accountRole}
												onChange={(e) => setAccountRole(e.target.value)}
												className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
												disabled={!canManage || creatingAccount}
											>
												{roleNames.length === 0 ? <option value="admin">admin</option> : null}
												{roleNames.map((r) => (
													<option key={r} value={r}>
														{formatRoleLabel(r)}
													</option>
												))}
											</select>
										</div>
										<div className="md:col-span-2">
											<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Assigned Detachment (Optional)</div>
											<select
												value={accountDetachment}
												onChange={(e) => setAccountDetachment(e.target.value)}
												className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
												disabled={!canManage || creatingAccount}
											>
												<option value="">Unassigned</option>
												{detachmentOptions.map((detachment) => (
													<option key={detachment} value={detachment}>{detachment}</option>
												))}
											</select>
											<div className="mt-2 text-xs text-slate-500">
												FARAGON gives full Paraphernalia access. Another detachment limits the account to that detachment&apos;s Stock Out table and Add Stock Out.
											</div>
										</div>
									</div>

									<div className="mt-6 flex items-center justify-end gap-2">
										<button
											type="button"
											onClick={() => setCreateAccountOpen(false)}
											className="animated-btn rounded-xl border bg-white px-4 py-2.5 text-black hover:bg-white"
											disabled={creatingAccount}
										>
											Cancel
										</button>
										<button
											onClick={createAccount}
											className={`animated-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold ${
												canManage ? "bg-[#FFDA03] text-black hover:bg-[#EFCB00]" : "bg-[#FFDA03] text-black opacity-60"
											}`}
											disabled={!canManage || creatingAccount}
										>
											{creatingAccount ? "Creating..." : "Create Account"}
										</button>
									</div>
								</div>
							</div>
						</div>,
						document.body
					)
				: null}

			{employeeAccountOpen && canUsePortal
				? createPortal(
				<div
					className="fixed inset-0 z-[195] flex items-center justify-center overflow-hidden bg-black/45 p-4"
					onClick={() => {
						if (!creatingEmployeeAccount) setEmployeeAccountOpen(false);
					}}
				>
					<div
						className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="shrink-0 bg-gradient-to-r from-slate-950 via-slate-800 to-[#8B1C1C] px-6 py-5 text-white">
							<div className="flex items-start justify-between gap-4">
								<div>
									<div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFDA03]">Security Personnel Directory</div>
									<div className="mt-2 text-2xl font-semibold">Create Existing Security Account</div>
									<div className="mt-1 text-sm text-white/75">Use an active Employees record and inherit its ID, position role, and detachment.</div>
								</div>
								<button
									type="button"
									onClick={() => setEmployeeAccountOpen(false)}
									disabled={creatingEmployeeAccount}
									className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white disabled:opacity-50"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
						</div>

						<div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-6">
							{error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
							<label className="block">
								<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Active Employee</span>
								<select
									value={selectedEmployeeId}
									onChange={(event) => selectEmployeeForAccount(event.target.value)}
									disabled={creatingEmployeeAccount}
									className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
								>
									<option value="">Select employee...</option>
									{employees.map((employee) => {
										const hasAccount = employeeAccountIds.has(employee.applicant_id);
										return (
											<option key={employee.applicant_id} value={employee.applicant_id} disabled={hasAccount}>
											{formatEmployeeName(employee)}{employee.custom_id ? ` - ${employee.custom_id}` : ""}{hasAccount ? " - Account exists" : ""}
											</option>
										);
									})}
								</select>
							</label>

							{selectedEmployee ? (
								<div className="grid gap-3 rounded-2xl border border-amber-200 bg-[#fffdf5] p-4 text-sm sm:grid-cols-3">
									<div><div className="text-xs uppercase text-slate-500">ID Number</div><div className="font-semibold text-black">{selectedEmployee.custom_id || "Not set"}</div></div>
									<div><div className="text-xs uppercase text-slate-500">Position / Role</div><div className="font-semibold text-black">{formatRoleLabel(employeePositionRole(selectedEmployee))}</div></div>
									<div><div className="text-xs uppercase text-slate-500">Detachment</div><div className="font-semibold text-black">{selectedEmployee.detachment || "Unassigned"}</div></div>
								</div>
							) : null}

							<div className="grid gap-4 md:grid-cols-2">
								<label>
									<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Username</span>
									<input
										value={employeeUsername}
										onChange={(event) => setEmployeeUsername(event.target.value)}
										disabled={creatingEmployeeAccount}
										className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
										placeholder="Employee email or ID"
									/>
								</label>
								<label>
									<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Temporary Password</span>
									<input
										type="password"
										value={employeePassword}
										onChange={(event) => setEmployeePassword(event.target.value)}
										disabled={creatingEmployeeAccount}
										className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
										placeholder="Set initial password"
									/>
								</label>
							</div>

							<div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
								Security accounts can view only their assigned detachment&apos;s Paraphernalia Stock Out table and use Add Stock Out. FARAGON assignments receive full inventory access.
							</div>
							<div className="flex justify-end gap-2">
								<button type="button" onClick={() => setEmployeeAccountOpen(false)} disabled={creatingEmployeeAccount} className="rounded-xl border bg-white px-4 py-2.5 text-black disabled:opacity-50">Cancel</button>
								<button type="button" onClick={() => void createEmployeeAccount()} disabled={creatingEmployeeAccount || !selectedEmployee} className="rounded-xl bg-[#FFDA03] px-4 py-2.5 font-semibold text-black disabled:opacity-50">
									{creatingEmployeeAccount ? "Creating..." : "Create Security Account"}
								</button>
							</div>
						</div>
					</div>
				</div>,
				document.body
				)
				: null}

			{editingAccount && canUsePortal ? (
				<div
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
					onClick={() => {
						if (!savingAccountEdit) setEditingAccount(null);
					}}
				>
					<div
						className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-white/70 bg-white shadow-2xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="bg-gradient-to-r from-slate-950 via-slate-800 to-[#8B1C1C] px-6 py-5 text-white">
							<div className="flex items-start justify-between gap-4">
								<div>
									<div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFDA03]">Superadmin Control</div>
									<div className="mt-2 text-2xl font-semibold">Edit Account</div>
									<div className="mt-1 text-sm text-white/75">Update the account name, username, or login password.</div>
								</div>
								<button
									type="button"
									onClick={() => setEditingAccount(null)}
									disabled={savingAccountEdit}
									className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white disabled:opacity-50"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
						</div>

						<div className="space-y-4 p-6">
							{error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
							<label className="block">
								<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Username</span>
								<input value={editUsername} onChange={(event) => setEditUsername(event.target.value)} disabled={savingAccountEdit} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10" />
							</label>
							<label className="block">
								<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Account Name</span>
								<input value={editFullName} onChange={(event) => setEditFullName(event.target.value)} disabled={savingAccountEdit} placeholder="Full name" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10" />
							</label>
							<label className="block">
								<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">New Password</span>
								<input type="password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} disabled={savingAccountEdit} placeholder="Leave blank to keep the current password" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10" />
								<span className="mt-2 block text-xs text-slate-500">The current password is never displayed. Enter a new one only when it needs to change.</span>
							</label>
							<div className="flex justify-end gap-2 pt-2">
								<button type="button" onClick={() => setEditingAccount(null)} disabled={savingAccountEdit} className="rounded-xl border bg-white px-5 py-2.5 font-semibold text-black disabled:opacity-50">Cancel</button>
								<button type="button" onClick={() => void saveAccountEdit()} disabled={savingAccountEdit || !editUsername.trim()} className="rounded-xl bg-[#FFDA03] px-5 py-2.5 font-semibold text-black disabled:opacity-50">
									{savingAccountEdit ? "Saving..." : "Save Changes"}
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}

			<div className="mt-5 animate-scale-in rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-xl">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
					<div>
						<div className="text-sm font-semibold text-black">Accounts</div>
						<div className="mt-1 text-xs text-black">
							Administrative and employee-linked security accounts have separate viewers. Open Permissions for account-only access overrides.
						</div>
					</div>
					<div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
						<label className="relative block min-w-[280px]">
							<Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
							<input
								value={accountSearch}
								onChange={(e) => setAccountSearch(e.target.value)}
								placeholder="Search username, full name, or role"
								className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-black outline-none transition focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
							/>
						</label>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
							Showing <span className="font-semibold text-slate-900">{filteredAdmins.length}</span> of{" "}
							<span className="font-semibold text-slate-900">{admins.length}</span>
						</div>
					</div>
				</div>

				<div className="mt-4 grid gap-3 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => setAccountViewer("administrative")}
						className={`rounded-2xl border px-4 py-3 text-left transition ${
							accountViewer === "administrative"
								? "border-slate-900 bg-slate-900 text-white shadow-lg"
								: "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
						}`}
					>
						<div className="text-sm font-semibold">Administrative Accounts</div>
						<div className={`mt-1 text-xs ${accountViewer === "administrative" ? "text-white/70" : "text-slate-500"}`}>
							{filteredAdministrativeAccounts.length} account{filteredAdministrativeAccounts.length === 1 ? "" : "s"} in this view
						</div>
					</button>
					<button
						type="button"
						onClick={() => setAccountViewer("security")}
						className={`rounded-2xl border px-4 py-3 text-left transition ${
							accountViewer === "security"
								? "border-[#8B1C1C] bg-[#8B1C1C] text-white shadow-lg"
								: "border-slate-200 bg-white text-slate-700 hover:border-[#8B1C1C]/50"
						}`}
					>
						<div className="text-sm font-semibold">Security Accounts</div>
						<div className={`mt-1 text-xs ${accountViewer === "security" ? "text-white/75" : "text-slate-500"}`}>
							{filteredSecurityAccounts.length} employee-linked account{filteredSecurityAccounts.length === 1 ? "" : "s"}
						</div>
					</button>
				</div>

				<div className="mt-4 min-h-[50px]">
					{accountViewer === "security" ? (
						<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
							Security accounts inherit Stock Out-only Paraphernalia access and are limited to their assigned detachment.
						</div>
					) : (
						<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
							Administrative accounts use their assigned roles and individual permission overrides across the application.
						</div>
					)}
				</div>

				<TableZoomWrapper storageKey={`admin-accounts-${accountViewer}`} defaultZoom={0.7}>
				<div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
					<div className="overflow-x-auto">
					<table className="w-full min-w-[1160px] table-auto">
						<thead className="bg-slate-50">
							<tr className="text-left text-sm text-black">
								<th className="px-3 py-2">Username</th>
								<th className="px-3 py-2">Name</th>
								<th className="px-3 py-2">Role</th>
								<th className="px-3 py-2">Assigned Detachment</th>
								<th className="px-3 py-2">Active</th>
								<th className="px-3 py-2">Last login</th>
								<th className="px-3 py-2">Actions</th>
							</tr>
						</thead>
						<tbody>
							{visibleAccounts.length === 0 ? (
								<tr className="border-t border-gray-100">
									<td colSpan={7} className="px-3 py-10 text-center">
										<div className="text-sm font-semibold text-black">No accounts matched your search.</div>
										<div className="mt-1 text-xs text-slate-500">Try a different username, name, or role filter.</div>
									</td>
								</tr>
							) : null}
							{visibleAccounts.map((a) => {
									const self = currentAdminId ? a.id === currentAdminId : false;
									const activeLabel = a.is_active ? "Active" : "Inactive";
									const activeClass = a.is_active
										? "text-emerald-700 bg-emerald-50 border-emerald-200"
										: "text-red-700 bg-red-50 border-red-200";
									const toggleBusy = togglingActiveId === a.id;
									return (
										<tr key={a.id} className={`animated-row border-t border-gray-100 ${self ? "bg-amber-50/40" : "bg-white"}`}>
											<td className="px-3 py-2 text-black whitespace-nowrap">
												<div className="flex items-center gap-2">
													<span className="font-semibold">{a.username}</span>
													{self ? (
														<span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
															You
														</span>
													) : null}
												</div>
											</td>
											<td className="px-3 py-2 text-black">{a.full_name?.trim() || "Not provided"}</td>
											<td className="px-3 py-2 text-black">
												<select
													value={a.role}
													onChange={(e) => updateAccountRole(a, e.target.value)}
													disabled={!canManage}
													className="border rounded-xl px-2 py-1 text-black bg-white"
												>
													{roleNames.map((r) => (
														<option key={r} value={r}>
															{formatRoleLabel(r)}
														</option>
													))}
													{roleNames.includes(a.role) ? null : <option value={a.role}>{formatRoleLabel(a.role)}</option>}
												</select>
											</td>
											<td className="px-3 py-2 text-black">
												<select
													value={a.assigned_detachment ?? ""}
													onChange={(e) => void updateAccountDetachment(a, e.target.value)}
													disabled={!canManage}
													className="max-w-[220px] rounded-xl border bg-white px-2 py-1 text-black"
												>
													<option value="">Unassigned</option>
													{detachmentOptions.map((detachment) => (
														<option key={detachment} value={detachment}>{detachment}</option>
													))}
													{a.assigned_detachment && !detachmentOptions.includes(a.assigned_detachment) ? (
														<option value={a.assigned_detachment}>{a.assigned_detachment}</option>
													) : null}
												</select>
											</td>
											<td className="px-3 py-2">
												<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${activeClass}`}>
													{activeLabel}
												</span>
											</td>
											<td className="px-3 py-2 text-black">
												{a.last_login ? new Date(a.last_login).toLocaleString() : "Never"}
											</td>
										<td className="px-3 py-2">
											<div className="flex items-center gap-2">
												<button
													onClick={() => openAccountEditor(a)}
													disabled={!canManage}
													className={`animated-btn inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm ${
														canManage ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-500 cursor-not-allowed"
													}`}
												>
													<Pencil className="h-3.5 w-3.5" />
													Edit
												</button>
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
				</TableZoomWrapper>
			</div>
		</section>
	);
}

