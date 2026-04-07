"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole, useMyModules } from "../../Client/useRbac";
import LoadingCircle from "../../Components/LoadingCircle";
import { useToast } from "../../Components/ToastProvider";
import {
  formatPermissionColumnLabel,
  normalizeModuleKey,
  visibleColumnsForModule,
} from "../Components/permissionCatalog";

type ModuleRow = { module_key: string; display_name: string; path: string };

type ApplicantOption = {
  applicant_id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
};

type ApproverRow = {
  id: string;
  username: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
};

type AccessRequestRow = {
  id: string;
  created_at: string;
  status: string | null;
  request_scope_row?: boolean | null;
  request_scope_column?: boolean | null;
  requested_module_key: string;
  requested_column_keys?: string[] | null;
  requested_column_key?: string | null;
  requested_applicant_ids?: string[] | null;
  requested_applicant_id?: string | null;
  requested_row_identifier_key?: string | null;
  requested_row_identifier_values?: string[] | null;
  requested_row_identifier_value?: string | null;
  requested_path: string | null;
  reason: string | null;
  requester_user_id?: string | null;
  requester_email?: string | null;
  requester_admin_id?: string | null;
  requester_username?: string | null;
  requester_role?: string | null;
  approver_admin_id?: string | null;
  approver_username?: string | null;
  approver_full_name?: string | null;
};

function normalizeRoleNameLoose(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function moduleKeysForRequest(moduleKey: string): string[] {
  const key = normalizeModuleKey(moduleKey);
  if (!key) return [];
  if (key === "logistics") {
    return ["client", "inventory", "paraphernalia", "reports", "logistics"];
  }
  return [key];
}

function extractMissingColumn(message: string): string {
  const msg = String(message ?? "");

  const pgMatch = msg.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];

  const cacheMatch = msg.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
  if (cacheMatch?.[1]) return cacheMatch[1];

  const relMatch = msg.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?[a-zA-Z0-9_]+"?\s+does not exist/i);
  if (relMatch?.[1]) return relMatch[1];

  return "";
}

async function runAccessRequestSelectWithFallback(
  columns: string[],
  runQuery: (selectClause: string) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>
) {
  const workingColumns = [...columns];
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < columns.length + 1; attempt += 1) {
    if (!workingColumns.length) {
      throw new Error("No selectable access request columns are available.");
    }

    const { data, error } = await runQuery(workingColumns.join(", "));
    if (!error) return (data ?? []) as unknown[];

    const missingColumn = extractMissingColumn(String(error.message ?? ""));
    if (!missingColumn || removedColumns.has(missingColumn)) throw error;

    const index = workingColumns.findIndex((col) => col.trim() === missingColumn);
    if (index < 0) throw error;

    removedColumns.add(missingColumn);
    workingColumns.splice(index, 1);
  }

  throw new Error("Failed to load access requests.");
}

const MY_REQUEST_COLUMNS = [
  "id",
  "created_at",
  "status",
  "request_scope_row",
  "request_scope_column",
  "requested_module_key",
  "requested_column_keys",
  "requested_column_key",
  "requested_applicant_ids",
  "requested_applicant_id",
  "requested_row_identifier_key",
  "requested_row_identifier_values",
  "requested_row_identifier_value",
  "requested_path",
  "reason",
  "requester_user_id",
  "requester_email",
  "requester_admin_id",
  "requester_username",
  "requester_role",
  "approver_admin_id",
  "approver_username",
  "approver_full_name",
] as const;

const PENDING_REQUEST_COLUMNS = [
  "id",
  "created_at",
  "status",
  "request_scope_row",
  "request_scope_column",
  "requested_module_key",
  "requested_column_keys",
  "requested_column_key",
  "requested_applicant_ids",
  "requested_applicant_id",
  "requested_row_identifier_key",
  "requested_row_identifier_values",
  "requested_row_identifier_value",
  "requested_path",
  "reason",
  "requester_user_id",
  "requester_email",
  "requester_admin_id",
  "requester_username",
  "requester_role",
  "approver_admin_id",
  "approver_username",
  "approver_full_name",
] as const;

type LegacyAdminSession = {
  id: string;
  username: string;
  role: string;
  full_name?: string | null;
  position?: string | null;
};

function readLegacyAdminSession(): LegacyAdminSession | null {
  try {
    const raw = localStorage.getItem("adminSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyAdminSession;
    if (!parsed?.id || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

type RequestIdentityColumn = "requester_user_id" | "requester_admin_id" | "requester_email" | "requester_username";

function toEpochMs(value: string | null | undefined) {
  const t = new Date(String(value ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

type RequestIdentitySnapshot = {
  userId: string;
  adminId: string;
  email: string;
  username: string;
};

function normalizeIdentityValue(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRequestStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "PENDING";
}

function isResolvedRequestStatus(value: string | null | undefined) {
  const normalized = normalizeRequestStatus(value);
  return normalized === "APPROVED" || normalized === "REJECTED";
}

function requestBelongsToIdentity(row: AccessRequestRow, identity: RequestIdentitySnapshot) {
  const requesterUserId = normalizeIdentityValue(row.requester_user_id);
  const requesterAdminId = normalizeIdentityValue(row.requester_admin_id);
  const requesterEmail = normalizeIdentityValue(row.requester_email);
  const requesterUsername = normalizeIdentityValue(row.requester_username);

  if (identity.userId && requesterUserId === identity.userId) return true;
  if (identity.adminId && requesterAdminId === identity.adminId) return true;
  if (identity.email && requesterEmail === identity.email) return true;
  if (identity.username && requesterUsername === identity.username) return true;
  return false;
}

function applicantLabel(a: ApplicantOption) {
  const parts = [a.first_name, a.middle_name, a.last_name].filter(Boolean);
  const name = parts.length ? parts.join(" ") : "(No name)";
  return `${name} — ${a.applicant_id.slice(0, 8).toUpperCase()}`;
}

function requestColumnKeys(row: AccessRequestRow) {
  return Array.from(
    new Set([...(row.requested_column_keys ?? []), String(row.requested_column_key ?? "").trim()].filter(Boolean))
  );
}

function requestApplicantIds(row: AccessRequestRow) {
  return Array.from(
    new Set([...(row.requested_applicant_ids ?? []), String(row.requested_applicant_id ?? "").trim()].filter(Boolean))
  );
}

function reviewerDisplayName(row: AccessRequestRow) {
  return (row.approver_full_name ?? "").trim() || (row.approver_username ?? "").trim() || "Assigned reviewer";
}

function RequestsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useAuthRole();
  const { modules: myModules, loading: loadingMyModules } = useMyModules();
  const toast = useToast();
  const lastToastRef = useRef<{ error: string; success: string }>({ error: "", success: "" });
  const notifiedResolvedStatusByRequestIdRef = useRef<Map<string, "APPROVED" | "REJECTED">>(new Map());
  const initializedResolvedTrackingRef = useRef(false);

  const preselectModule = normalizeModuleKey(searchParams?.get("module") ?? "");

  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  useEffect(() => {
    if (!error) return;
    if (lastToastRef.current.error === error) return;
    lastToastRef.current.error = error;
    toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (!success) return;
    if (lastToastRef.current.success === success) return;
    lastToastRef.current.success = success;
    toast.success(success);
  }, [success, toast]);

  const [requestedModuleKey, setRequestedModuleKey] = useState<string>(preselectModule);
  const [scopeRow, setScopeRow] = useState(false);
  const [scopeColumn, setScopeColumn] = useState(false);
  const [requestedColumnKeys, setRequestedColumnKeys] = useState<string[]>([]);
  const [requestedApplicantIds, setRequestedApplicantIds] = useState<string[]>([]);
  const [personnelSearch, setPersonnelSearch] = useState<string>("");
  const [approverAdminId, setApproverAdminId] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [applicants, setApplicants] = useState<ApplicantOption[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [approvers, setApprovers] = useState<ApproverRow[]>([]);
  const [loadingApprovers, setLoadingApprovers] = useState(false);

  const [myRequests, setMyRequests] = useState<AccessRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<AccessRequestRow[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const legacySession = useMemo(() => readLegacyAdminSession(), []);
  const legacyRole = normalizeRoleNameLoose(legacySession?.role);
  const reviewerAdminId = legacySession?.id ?? "";
  const canReviewRequests = role === "superadmin" || legacyRole === "superadmin";

  useEffect(() => {
    // Keep selection in sync with query string.
    if (preselectModule) setRequestedModuleKey(preselectModule);
  }, [preselectModule]);

  const loadModules = useCallback(async () => {
    setLoadingModules(true);
    try {
      const { data, error: modErr } = await supabase
        .from("modules")
        .select("module_key, display_name, path")
        .order("module_key");
      if (modErr) throw modErr;
      setModules((data as ModuleRow[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load modules");
      setModules([]);
    } finally {
      setLoadingModules(false);
    }
  }, []);

  const loadApplicants = useCallback(async () => {
    setLoadingApplicants(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from("applicants")
        .select("applicant_id, first_name, middle_name, last_name")
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .order("last_name", { ascending: true })
        .limit(2000);
      if (fetchErr) throw fetchErr;
      setApplicants((data as ApplicantOption[]) || []);
    } catch {
      setApplicants([]);
    } finally {
      setLoadingApplicants(false);
    }
  }, []);

  const loadApprovers = useCallback(async () => {
    setLoadingApprovers(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from("admins")
        .select("id, username, full_name, role, is_active")
        .eq("is_active", true)
        .order("username", { ascending: true });
      if (fetchErr) throw fetchErr;

      const rows = (((data as ApproverRow[]) || []) || []).filter(
        (adminRow) => normalizeRoleNameLoose(adminRow.role) === "superadmin"
      );

      setApprovers(rows);
      setApproverAdminId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id ?? "";
      });
    } catch {
      setApprovers([]);
      setApproverAdminId("");
    } finally {
      setLoadingApprovers(false);
    }
  }, []);

  const loadMyRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = String(session.data.session?.user?.id ?? "").trim();
      const email = String(session.data.session?.user?.email ?? "").trim();
      const legacy = readLegacyAdminSession();
      const adminId = String(legacy?.id ?? "").trim();

      const username = String(legacy?.username ?? "").trim();
      const identities: Array<{ column: RequestIdentityColumn; value: string }> = [];
      if (userId) identities.push({ column: "requester_user_id", value: userId });
      if (adminId) identities.push({ column: "requester_admin_id", value: adminId });
      if (email) identities.push({ column: "requester_email", value: email });
      if (username) identities.push({ column: "requester_username", value: username });

      if (!identities.length) {
        setMyRequests([]);
        return;
      }

      for (const identity of identities) {
        try {
          const purge = await supabase
            .from("access_requests")
            .delete()
            .eq(identity.column, identity.value)
            .or("status.eq.CANCELLED,status.eq.cancelled");
          if (purge.error) {
            const missingColumn = extractMissingColumn(String(purge.error.message ?? ""));
            if (!missingColumn || missingColumn !== identity.column) {
              // Ignore purge failures to avoid blocking requests UI.
            }
          }
        } catch {
          // ignore
        }
      }

      const identitySnapshot: RequestIdentitySnapshot = {
        userId: normalizeIdentityValue(userId),
        adminId: normalizeIdentityValue(adminId),
        email: normalizeIdentityValue(email),
        username: normalizeIdentityValue(username),
      };

      const rowsById = new Map<string, AccessRequestRow>();

      for (const identity of identities) {
        try {
          const data = await runAccessRequestSelectWithFallback([...MY_REQUEST_COLUMNS], async (selectClause) => {
            const result = await supabase
              .from("access_requests")
              .select(selectClause)
              .eq(identity.column, identity.value)
              .order("created_at", { ascending: false })
              .limit(100);
            return { data: (result.data as unknown[] | null) ?? null, error: result.error };
          });

          for (const row of (data as AccessRequestRow[]) || []) {
            const rowId = String(row.id ?? "").trim();
            if (!rowId) continue;

            const existing = rowsById.get(rowId);
            if (!existing || toEpochMs(row.created_at) >= toEpochMs(existing.created_at)) {
              rowsById.set(rowId, row);
            }
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "";
          const missingColumn = extractMissingColumn(message);
          if (missingColumn && missingColumn === identity.column) {
            // Older deployments can miss newer identity columns.
            continue;
          }
          throw e;
        }
      }

      if (!rowsById.size) {
        const broadData = await runAccessRequestSelectWithFallback([...MY_REQUEST_COLUMNS], async (selectClause) => {
          const result = await supabase
            .from("access_requests")
            .select(selectClause)
            .order("created_at", { ascending: false })
            .limit(300);
          return { data: (result.data as unknown[] | null) ?? null, error: result.error };
        });

        for (const row of (broadData as AccessRequestRow[]) || []) {
          if (!requestBelongsToIdentity(row, identitySnapshot)) continue;
          const rowId = String(row.id ?? "").trim();
          if (!rowId) continue;

          const existing = rowsById.get(rowId);
          if (!existing || toEpochMs(row.created_at) >= toEpochMs(existing.created_at)) {
            rowsById.set(rowId, row);
          }
        }
      }

      const rows = Array.from(rowsById.values())
        .filter((row) => normalizeRequestStatus(row.status) !== "CANCELLED")
        .sort((a, b) => toEpochMs(b.created_at) - toEpochMs(a.created_at))
        .slice(0, 100);

      setMyRequests(rows);

      const resolvedRows = rows.filter((r) => isResolvedRequestStatus(r.status));
      if (!initializedResolvedTrackingRef.current) {
        for (const row of resolvedRows) {
          const rowId = String(row.id ?? "").trim();
          if (!rowId) continue;
          const status = normalizeRequestStatus(row.status);
          if (status === "APPROVED" || status === "REJECTED") {
            notifiedResolvedStatusByRequestIdRef.current.set(rowId, status);
          }
        }
        initializedResolvedTrackingRef.current = true;
      } else {
        for (const row of resolvedRows) {
          const rowId = String(row.id ?? "").trim();
          if (!rowId) continue;
          const status = normalizeRequestStatus(row.status);
          if (status !== "APPROVED" && status !== "REJECTED") continue;

          const previousStatus = notifiedResolvedStatusByRequestIdRef.current.get(rowId);
          if (previousStatus === status) continue;

          notifiedResolvedStatusByRequestIdRef.current.set(rowId, status);
          const moduleLabel = String(row.requested_module_key ?? "requested page").replace(/_/g, " ");
          if (status === "APPROVED") {
            toast.success(`Your request for ${moduleLabel} was approved.`);
          } else {
            toast.error(`Your request for ${moduleLabel} was rejected.`);
          }
        }
      }
    } catch {
      // Don't block the page if the table doesn't exist yet.
      setMyRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [toast]);

  const loadPendingRequests = useCallback(async () => {
    if (!canReviewRequests) {
      setPendingRequests([]);
      return;
    }

    setLoadingPending(true);
    try {
      const data = await runAccessRequestSelectWithFallback([...PENDING_REQUEST_COLUMNS], async (selectClause) => {
        const result = await supabase
          .from("access_requests")
          .select(selectClause)
          .or("status.eq.PENDING,status.eq.pending,status.is.null")
          .order("created_at", { ascending: false })
          .limit(200);
        return { data: (result.data as unknown[] | null) ?? null, error: result.error };
      });

      setPendingRequests((data as AccessRequestRow[]) || []);
    } catch {
      setPendingRequests([]);
    } finally {
      setLoadingPending(false);
    }
  }, [canReviewRequests]);

  useEffect(() => {
    loadModules();
    loadApplicants();
    loadApprovers();
    loadMyRequests();
  }, [loadModules, loadApplicants, loadApprovers, loadMyRequests]);

  useEffect(() => {
    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    async function subscribeToMyRequestUpdates() {
      const legacy = readLegacyAdminSession();
      const session = await supabase.auth.getSession();
      const userId = String(session.data.session?.user?.id ?? "").trim();
      const adminId = String(legacy?.id ?? "").trim();
      const username = String(legacy?.username ?? "").trim();
      const encodedUsername = encodeURIComponent(username);

      const registerChannel = (filter: string, name: string) => {
        const channel = supabase
          .channel(name)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "access_requests", filter },
            (payload) => {
              const row = (payload.new ?? {}) as Partial<AccessRequestRow>;
              const rowId = String(row.id ?? "").trim();
              const status = normalizeRequestStatus(row.status);

              if (status === "APPROVED" && rowId) {
                const previousStatus = notifiedResolvedStatusByRequestIdRef.current.get(rowId);
                if (previousStatus !== "APPROVED") {
                  notifiedResolvedStatusByRequestIdRef.current.set(rowId, "APPROVED");
                  const moduleLabel = String(row.requested_module_key ?? "requested page").replace(/_/g, " ");
                  toast.success(`Your request for ${moduleLabel} was approved.`);
                }
              }

              if (status === "REJECTED" && rowId) {
                const previousStatus = notifiedResolvedStatusByRequestIdRef.current.get(rowId);
                if (previousStatus !== "REJECTED") {
                  notifiedResolvedStatusByRequestIdRef.current.set(rowId, "REJECTED");
                  const moduleLabel = String(row.requested_module_key ?? "requested page").replace(/_/g, " ");
                  toast.error(`Your request for ${moduleLabel} was rejected.`);
                }
              }

              if (status === "CANCELLED" && rowId) {
                notifiedResolvedStatusByRequestIdRef.current.delete(rowId);
              }

              if (status !== "APPROVED" && status !== "REJECTED" && rowId) {
                notifiedResolvedStatusByRequestIdRef.current.delete(rowId);
              }

              void loadMyRequests();
            }
          )
          .subscribe();

        channels.push(channel);
      };

      if (userId) {
        registerChannel(`requester_user_id=eq.${userId}`, `realtime:my-requests:user:${userId}`);
      }
      if (adminId) {
        registerChannel(`requester_admin_id=eq.${adminId}`, `realtime:my-requests:admin:${adminId}`);
      }
      if (username) {
        registerChannel(
          `requester_username=eq.${username}`,
          `realtime:my-requests:username:${encodedUsername}`
        );
      }
    }

    void subscribeToMyRequestUpdates();

    return () => {
      for (const channel of channels) {
        supabase.removeChannel(channel);
      }
    };
  }, [loadMyRequests, toast]);

  const selectableModules = useMemo(() => {
    return modules.map((m) => ({
      ...m,
      module_key: normalizeModuleKey(m.module_key),
    }));
  }, [modules]);

  const myModuleKeySet = useMemo(() => {
    return new Set(myModules.map((m) => normalizeModuleKey(m.module_key)).filter(Boolean));
  }, [myModules]);

  const selectedModule = useMemo(
    () => selectableModules.find((m) => normalizeModuleKey(m.module_key) === normalizeModuleKey(requestedModuleKey)) ?? null,
    [requestedModuleKey, selectableModules]
  );

  const moduleLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const moduleRow of selectableModules) {
      map.set(normalizeModuleKey(moduleRow.module_key), moduleRow.display_name);
    }
    return map;
  }, [selectableModules]);

  const selectableColumns = useMemo(() => {
    if (!requestedModuleKey) return [];
    return visibleColumnsForModule(requestedModuleKey);
  }, [requestedModuleKey]);

  const isEmployeesModule = normalizeModuleKey(requestedModuleKey) === "employees";

  const applicantLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of applicants) map.set(a.applicant_id, applicantLabel(a));
    return map;
  }, [applicants]);

  const filteredApplicants = useMemo(() => {
    const q = personnelSearch.trim().toLowerCase();
    if (!q) return applicants;
    return applicants.filter((a) => {
      const label = applicantLabel(a).toLowerCase();
      return label.includes(q);
    });
  }, [applicants, personnelSearch]);

  const disabled = submitting || loadingModules || loadingApprovers || loadingMyModules;

  function toggleRequestedColumn(columnKey: string) {
    const key = String(columnKey ?? "").trim();
    if (!key) return;
    setRequestedColumnKeys((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  }

  function toggleRequestedApplicant(applicantId: string) {
    const id = String(applicantId ?? "").trim();
    if (!id) return;
    setRequestedApplicantIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  }

  async function submitRequest() {
    setError("");
    setSuccess("");

    const moduleKey = normalizeModuleKey(requestedModuleKey);
    if (!moduleKey) return setError("Please choose a page/module to request.");

    const applicantIds = Array.from(
      new Set(
        requestedApplicantIds
          .map((id) => String(id ?? "").trim())
          .filter(Boolean)
      )
    );
    if (applicantIds.length > 0 && moduleKey !== "employees") {
      return setError("Specific personnel access is only available for the Employees module.");
    }

    const cleanColumns = Array.from(
      new Set(
        requestedColumnKeys
          .map((c) => String(c ?? "").trim())
          .filter(Boolean)
      )
    );
    if (scopeColumn && !cleanColumns.length) {
      return setError("Please choose a specific column for column-level access.");
    }

    if (scopeRow) {
      if (moduleKey !== "employees") {
        return setError("Row-level requests are only available for Employees using personnel checkboxes.");
      }
      if (applicantIds.length === 0) {
        return setError("Select at least one employee when requesting row-level access.");
      }
    }

    const requestGrantKeys = moduleKeysForRequest(moduleKey);
    if (
      !scopeRow &&
      !scopeColumn &&
      requestGrantKeys.length > 0 &&
      requestGrantKeys.every((k) => myModuleKeySet.has(k))
    ) {
      const moduleLabel = selectedModule?.display_name?.trim() || moduleKey;
      return setError(`You already have permission for ${moduleLabel}.`);
    }

    const approverId = String(approverAdminId ?? "").trim() || null;
    if (!approverId) {
      return setError("Please choose a superadmin reviewer.");
    }

    setSubmitting(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id ?? null;
      const email = session.data.session?.user?.email ?? null;
      const legacy = readLegacyAdminSession();

      const requestedPath = selectedModule?.path ?? null;

      const insertPayload: Record<string, unknown> = {
        status: "PENDING",
        request_scope_row: scopeRow,
        request_scope_column: scopeColumn,
        requested_module_key: moduleKey,
        requested_column_keys: scopeColumn ? cleanColumns : null,
        requested_column_key: scopeColumn ? cleanColumns[0] ?? null : null,
        requested_applicant_ids: applicantIds.length > 0 ? applicantIds : null,
        requested_applicant_id: applicantIds[0] ?? null,
        requested_row_identifier_key: null,
        requested_row_identifier_values: null,
        requested_row_identifier_value: null,
        requested_path: requestedPath,
        reason: reason.trim() || null,
        requester_user_id: userId,
        requester_email: email,
        requester_admin_id: legacy?.id ?? null,
        requester_username: legacy?.username ?? null,
        requester_role: legacy?.role ?? role ?? null,
        approver_admin_id: approverId,
        approver_username: approvers.find((a) => a.id === approverId)?.username ?? null,
        approver_full_name: approvers.find((a) => a.id === approverId)?.full_name ?? null,
      };

      async function insertAccessRequestWithFallback(payload: Record<string, unknown>) {
        const workingPayload: Record<string, unknown> = { ...payload };
        const triedMissingColumns = new Set<string>();

        for (let attempt = 0; attempt < 12; attempt += 1) {
          const { error } = await supabase.from("access_requests").insert(workingPayload);
          if (!error) return;

          const message = String(error.message ?? "");
          const missingColumn = extractMissingColumn(message);

          if (!missingColumn) throw error;
          if (triedMissingColumns.has(missingColumn)) throw error;
          if (!(missingColumn in workingPayload)) throw error;

          triedMissingColumns.add(missingColumn);
          delete workingPayload[missingColumn];
        }

        throw new Error("Failed to submit request: schema mismatch");
      }

      await insertAccessRequestWithFallback(insertPayload);

      setSuccess("Request submitted.");
      setReason("");
      setScopeRow(false);
      setScopeColumn(false);
      setRequestedColumnKeys([]);
      setRequestedApplicantIds([]);
      setPersonnelSearch("");
      loadMyRequests();

      // Keep URL in sync so the page can be bookmarked.
      router.replace(`/Main_Modules/Requests/?module=${encodeURIComponent(moduleKey)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelMyRequest(req: AccessRequestRow) {
    setError("");
    setSuccess("");

    const currentStatus = normalizeRequestStatus(req.status);
    if (currentStatus !== "PENDING") {
      setError("Only pending requests can be cancelled.");
      return;
    }

    const rowId = String(req.id ?? "").trim();
    if (!rowId) {
      setError("Invalid request id.");
      return;
    }

    setCancellingId(rowId);
    try {
      const session = await supabase.auth.getSession();
      const legacy = readLegacyAdminSession();
      const identitySnapshot: RequestIdentitySnapshot = {
        userId: normalizeIdentityValue(session.data.session?.user?.id ?? ""),
        adminId: normalizeIdentityValue(legacy?.id ?? ""),
        email: normalizeIdentityValue(session.data.session?.user?.email ?? ""),
        username: normalizeIdentityValue(legacy?.username ?? ""),
      };

      if (!requestBelongsToIdentity(req, identitySnapshot)) {
        setError("You can only cancel your own requests.");
        return;
      }

      const { error: cancelErr } = await supabase
        .from("access_requests")
        .delete()
        .eq("id", rowId)
        .or("status.eq.PENDING,status.eq.pending,status.is.null");

      if (cancelErr) throw cancelErr;

      notifiedResolvedStatusByRequestIdRef.current.delete(rowId);
      setSuccess("Request cancelled and removed.");
      await loadMyRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to cancel request");
    } finally {
      setCancellingId(null);
    }
  }

  async function removeMyRequest(req: AccessRequestRow) {
    setError("");
    setSuccess("");

    const currentStatus = normalizeRequestStatus(req.status);
    if (currentStatus === "PENDING") {
      setError("Only resolved requests can be removed.");
      return;
    }

    const rowId = String(req.id ?? "").trim();
    if (!rowId) {
      setError("Invalid request id.");
      return;
    }

    const ok = window.confirm("Remove this request from your request history?");
    if (!ok) return;

    setRemovingId(rowId);
    try {
      const session = await supabase.auth.getSession();
      const legacy = readLegacyAdminSession();
      const identitySnapshot: RequestIdentitySnapshot = {
        userId: normalizeIdentityValue(session.data.session?.user?.id ?? ""),
        adminId: normalizeIdentityValue(legacy?.id ?? ""),
        email: normalizeIdentityValue(session.data.session?.user?.email ?? ""),
        username: normalizeIdentityValue(legacy?.username ?? ""),
      };

      if (!requestBelongsToIdentity(req, identitySnapshot)) {
        setError("You can only remove your own requests.");
        return;
      }

      const { error: removeErr } = await supabase
        .from("access_requests")
        .delete()
        .eq("id", rowId);

      if (removeErr) throw removeErr;

      notifiedResolvedStatusByRequestIdRef.current.delete(rowId);
      setSuccess("Request removed.");
      await loadMyRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove request");
    } finally {
      setRemovingId(null);
    }
  }

  async function resolveRequest(req: AccessRequestRow, nextStatus: "APPROVED" | "REJECTED") {
    setError("");
    setSuccess("");
    if (!canReviewRequests) {
      setError("Only superadmin reviewers can review requests.");
      return;
    }
    const assignedReviewerId = String(req.approver_admin_id ?? "").trim();
    if (assignedReviewerId) {
      if (!reviewerAdminId) {
        setError("Unable to verify reviewer assignment for this account.");
        return;
      }
      if (assignedReviewerId !== reviewerAdminId) {
        setError("This request is not assigned to your reviewer account.");
        return;
      }
    }

    const requestedKey = normalizeModuleKey(req.requested_module_key);
    const requestedColumns = Array.from(
      new Set(
        [
          ...((req.requested_column_keys ?? []) as string[]),
          String(req.requested_column_key ?? "").trim(),
        ]
          .map((c) => String(c ?? "").trim())
          .filter(Boolean)
      )
    );
    const columnScope = req.request_scope_column !== false && (Boolean(req.request_scope_column) || requestedColumns.length > 0);
    const requestedApplicantIds = Array.from(
      new Set(
        [
          ...((req.requested_applicant_ids ?? []) as string[]),
          String(req.requested_applicant_id ?? "").trim(),
        ]
          .map((id) => String(id ?? "").trim())
          .filter(Boolean)
      )
    );
    const rowScope = Boolean(req.request_scope_row) || requestedApplicantIds.length > 0;
    const requestedRowIdentifierKey = String(req.requested_row_identifier_key ?? "").trim();
    const requestedRowIdentifierValues = Array.from(
      new Set(
        [
          ...((req.requested_row_identifier_values ?? []) as string[]),
          String(req.requested_row_identifier_value ?? "").trim(),
        ]
          .map((v) => String(v ?? "").trim())
          .filter(Boolean)
      )
    );
    const isPersonnelColumnRequest =
      requestedKey === "employees" && requestedApplicantIds.length > 0 && requestedColumns.length > 0;

    if (requestedApplicantIds.length > 0 && requestedKey !== "employees") {
      setError("Invalid request: personnel-level access is only valid for Employees.");
      return;
    }

    if (rowScope && requestedKey !== "employees" && (!requestedRowIdentifierKey || requestedRowIdentifierValues.length === 0)) {
      setError("Row-level request is missing row identifier details.");
      return;
    }

    if (!requestedKey) {
      setError("Invalid requested module.");
      return;
    }

    setResolvingId(req.id);
    try {
      const session = await supabase.auth.getSession();
      const resolverUserId = session.data.session?.user?.id ?? null;

      if (nextStatus === "APPROVED") {
        const keysToGrant = moduleKeysForRequest(requestedKey);
        if (!keysToGrant.length) {
          throw new Error("Nothing to grant.");
        }

        if (req.requester_admin_id) {
          const adminRows = keysToGrant.map((k) => ({
            admin_id: req.requester_admin_id,
            module_key: k,
            can_read: true,
          }));

          const { error: adminGrantErr } = await supabase
            .from("admin_module_access_overrides")
            .upsert(adminRows, { onConflict: "admin_id,module_key" });
          if (adminGrantErr) throw adminGrantErr;

          if (rowScope && requestedApplicantIds.length > 0) {
            const adminApplicantRows = requestedApplicantIds.map((applicantId) => ({
              admin_id: req.requester_admin_id,
              module_key: requestedKey,
              applicant_id: applicantId,
              can_read: true,
            }));
            const { error: adminApplicantRowErr } = await supabase
              .from("admin_applicant_access_overrides")
              .upsert(adminApplicantRows, { onConflict: "admin_id,module_key,applicant_id" });
            if (adminApplicantRowErr) throw adminApplicantRowErr;
          }

          if (columnScope && requestedColumns.length > 0 && !isPersonnelColumnRequest) {
            const adminColRows = requestedColumns.map((columnKey) => ({
              admin_id: req.requester_admin_id,
              module_key: requestedKey,
              column_key: columnKey,
              can_read: true,
            }));
            const { error: adminColErr } = await supabase
              .from("admin_column_access_overrides")
              .upsert(adminColRows, { onConflict: "admin_id,module_key,column_key" });
            if (adminColErr) throw adminColErr;
          }

          if (columnScope && isPersonnelColumnRequest) {
            const adminApplicantColRows = requestedApplicantIds.flatMap((applicantId) =>
              requestedColumns.map((columnKey) => ({
                admin_id: req.requester_admin_id,
                module_key: requestedKey,
                applicant_id: applicantId,
                column_key: columnKey,
                can_read: true,
              }))
            );
            const { error: adminApplicantColErr } = await supabase
              .from("admin_applicant_column_access_overrides")
              .upsert(adminApplicantColRows, { onConflict: "admin_id,module_key,applicant_id,column_key" });
            if (adminApplicantColErr) throw adminApplicantColErr;
          }

          if (rowScope && requestedKey !== "employees" && requestedRowIdentifierKey && requestedRowIdentifierValues.length > 0) {
            const cols = columnScope && requestedColumns.length > 0 ? requestedColumns : ["*"];
            const adminRowColumnRows = requestedRowIdentifierValues.flatMap((identifierValue) =>
              cols.map((columnKey) => ({
                admin_id: req.requester_admin_id,
                module_key: requestedKey,
                row_identifier_key: requestedRowIdentifierKey,
                row_identifier_value: identifierValue,
                column_key: columnKey,
                can_read: true,
              }))
            );
            const { error: adminRowColumnErr } = await supabase
              .from("admin_row_identifier_column_access_overrides")
              .upsert(adminRowColumnRows, {
                onConflict: "admin_id,module_key,row_identifier_key,row_identifier_value,column_key",
              });
            if (adminRowColumnErr) throw adminRowColumnErr;
          }
        } else if (req.requester_user_id) {
          const userRows = keysToGrant.map((k) => ({
            user_id: req.requester_user_id,
            module_key: k,
            can_read: true,
          }));

          const { error: userGrantErr } = await supabase
            .from("user_module_access_overrides")
            .upsert(userRows, { onConflict: "user_id,module_key" });
          if (userGrantErr) throw userGrantErr;

          if (rowScope && requestedApplicantIds.length > 0) {
            const userApplicantRows = requestedApplicantIds.map((applicantId) => ({
              user_id: req.requester_user_id,
              module_key: requestedKey,
              applicant_id: applicantId,
              can_read: true,
            }));
            const { error: userApplicantRowErr } = await supabase
              .from("user_applicant_access_overrides")
              .upsert(userApplicantRows, { onConflict: "user_id,module_key,applicant_id" });
            if (userApplicantRowErr) throw userApplicantRowErr;
          }

          if (columnScope && requestedColumns.length > 0 && !isPersonnelColumnRequest) {
            const userColRows = requestedColumns.map((columnKey) => ({
              user_id: req.requester_user_id,
              module_key: requestedKey,
              column_key: columnKey,
              can_read: true,
            }));
            const { error: userColErr } = await supabase
              .from("user_column_access_overrides")
              .upsert(userColRows, { onConflict: "user_id,module_key,column_key" });
            if (userColErr) throw userColErr;
          }

          if (columnScope && isPersonnelColumnRequest) {
            const userApplicantColRows = requestedApplicantIds.flatMap((applicantId) =>
              requestedColumns.map((columnKey) => ({
                user_id: req.requester_user_id,
                module_key: requestedKey,
                applicant_id: applicantId,
                column_key: columnKey,
                can_read: true,
              }))
            );
            const { error: userApplicantColErr } = await supabase
              .from("user_applicant_column_access_overrides")
              .upsert(userApplicantColRows, { onConflict: "user_id,module_key,applicant_id,column_key" });
            if (userApplicantColErr) throw userApplicantColErr;
          }

          if (rowScope && requestedKey !== "employees" && requestedRowIdentifierKey && requestedRowIdentifierValues.length > 0) {
            const cols = columnScope && requestedColumns.length > 0 ? requestedColumns : ["*"];
            const userRowColumnRows = requestedRowIdentifierValues.flatMap((identifierValue) =>
              cols.map((columnKey) => ({
                user_id: req.requester_user_id,
                module_key: requestedKey,
                row_identifier_key: requestedRowIdentifierKey,
                row_identifier_value: identifierValue,
                column_key: columnKey,
                can_read: true,
              }))
            );
            const { error: userRowColumnErr } = await supabase
              .from("user_row_identifier_column_access_overrides")
              .upsert(userRowColumnRows, {
                onConflict: "user_id,module_key,row_identifier_key,row_identifier_value,column_key",
              });
            if (userRowColumnErr) throw userRowColumnErr;
          }
        } else {
          const requesterRoleName = normalizeRoleNameLoose(req.requester_role);
          if (!requesterRoleName) {
            throw new Error("Request does not include a requester role.");
          }

          const { data: roleRow, error: roleErr } = await supabase
            .from("app_roles")
            .select("role_id")
            .eq("role_name", requesterRoleName)
            .single();
          if (roleErr || !roleRow?.role_id) {
            throw new Error(`Role not found: ${requesterRoleName}`);
          }

          const upsertRows = keysToGrant.map((k) => ({
            role_id: roleRow.role_id,
            module_key: k,
            can_read: true,
            can_write: false,
          }));

          const { error: grantErr } = await supabase
            .from("role_module_access")
            .upsert(upsertRows, { onConflict: "role_id,module_key" });
          if (grantErr) throw grantErr;
        }
      }

      const { error: upErr } = await supabase
        .from("access_requests")
        .update({
          status: nextStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: resolverUserId,
        })
        .eq("id", req.id);
      if (upErr) throw upErr;

      setSuccess(nextStatus === "APPROVED" ? "Request approved and access granted." : "Request rejected.");
      loadPendingRequests();
      loadMyRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to resolve request");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-lg font-semibold text-black">Request Access</div>
          <div className="text-sm text-gray-500">Request access to pages you can’t open yet.</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/Main_Modules/Dashboard/")} className="px-4 py-2 rounded-xl bg-white border">
            Back
          </button>
        </div>
      </div>

      {canReviewRequests ? (
        <div className="mb-5 rounded-2xl border p-4 bg-gray-50">
          <div className="text-sm font-semibold text-black">Pending Requests are in Admin Accounts.</div>
          <div className="mt-1 text-xs text-gray-600">
            Open Reviewer Queue from the left sidebar under Admin Accounts.
          </div>
          <button
            type="button"
            onClick={() => router.push("/Main_Modules/Requests/Queue/")}
            className="mt-3 px-3 py-1.5 rounded-xl text-sm border bg-white"
          >
            Open Reviewer Queue
          </button>
        </div>
      ) : null}

      {false ? (
        <div className="mb-5 rounded-2xl border p-4">
          <div className="text-sm font-semibold text-black">Pending Requests (Reviewer Queue)</div>
          <div className="mt-2 text-xs text-gray-500">
            Approve grants access based on selected scope (page, columns, and optional employee row scope).
          </div>

          {loadingPending ? (
            <div className="py-6">
              <LoadingCircle label="Loading pending requests…" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="mt-4 text-sm text-gray-500">No pending requests.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="text-left text-sm text-gray-600">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Requester</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Module</th>
                    <th className="px-3 py-2">Scope</th>
                    <th className="px-3 py-2">Column</th>
                    <th className="px-3 py-2">Personnel</th>
                    <th className="px-3 py-2">Reviewer</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((r) => {
                    const busy = resolvingId === r.id;
                    const requesterLabel =
                      (r.requester_username ?? "").trim() ||
                      (r.requester_email ?? "").trim() ||
                      "Unknown requester";
                    const personIds = Array.from(
                      new Set([...(r.requested_applicant_ids ?? []), String(r.requested_applicant_id ?? "").trim()].filter(Boolean))
                    );
                    const personLabel = personIds.length > 0
                      ? personIds.map((id) => applicantLabelById.get(id) ?? id).join(", ")
                      : "—";
                    const reviewerLabel =
                      (r.approver_full_name ?? "").trim() ||
                      (r.approver_username ?? "").trim() ||
                      "Unassigned reviewer";
                    const scopeLabel = [
                      !r.request_scope_row && !r.request_scope_column ? "PAGE" : null,
                      r.request_scope_row ? "ROW" : null,
                      r.request_scope_column ? "COLUMN" : null,
                    ]
                      .filter(Boolean)
                      .join(" + ") || "—";
                    const columnsLabel = Array.from(
                      new Set([...(r.requested_column_keys ?? []), String(r.requested_column_key ?? "").trim()].filter(Boolean))
                    ).join(", ");

                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-sm text-black whitespace-nowrap">{requesterLabel}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{r.requester_role ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-black whitespace-nowrap">{r.requested_module_key}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{scopeLabel}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{columnsLabel || "—"}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{personLabel}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{reviewerLabel}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{r.reason ?? ""}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => resolveRequest(r, "APPROVED")}
                              disabled={busy}
                              className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${
                                busy ? "bg-gray-100 text-gray-400" : "bg-[#FFDA03] text-black"
                              }`}
                            >
                              {busy ? "Working…" : "Approve"}
                            </button>
                            <button
                              onClick={() => resolveRequest(r, "REJECTED")}
                              disabled={busy}
                              className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${
                                busy ? "bg-gray-100 text-gray-400" : "bg-white text-gray-700"
                              }`}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {loadingModules && !modules.length ? (
        <div className="py-10">
          <LoadingCircle label="Loading…" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-semibold text-black">New Request</div>
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Page / Module</div>
                <select
                  value={requestedModuleKey}
                  onChange={(e) => {
                    setRequestedModuleKey(e.target.value);
                    setRequestedColumnKeys([]);
                    setPersonnelSearch("");
                    if (normalizeModuleKey(e.target.value) !== "employees") {
                      setRequestedApplicantIds([]);
                      setScopeRow(false);
                    }
                  }}
                  disabled={disabled}
                  className="w-full border rounded-xl px-3 py-2 text-black bg-white"
                >
                  <option value="">Select…</option>
                  {selectableModules.map((m) => (
                    <option key={m.module_key} value={m.module_key}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-gray-500">
                  All pages are requestable. Superadmin reviewer approval is required.
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Superadmin Reviewer</div>
                <select
                  value={approverAdminId}
                  onChange={(e) => setApproverAdminId(e.target.value)}
                  disabled={disabled || loadingApprovers}
                  className="w-full border rounded-xl px-3 py-2 text-black bg-white"
                >
                  <option value="">Select reviewer…</option>
                  {approvers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name?.trim() || a.username} ({a.role ?? "admin"})
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-gray-500">
                  Only superadmin accounts with Admin Accounts permission can review and approve requests.
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Fine-grained Scope</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="inline-flex items-center gap-2 border rounded-xl px-3 py-2 text-sm text-black bg-white">
                    <input
                      type="checkbox"
                      checked={scopeRow}
                      onChange={(e) => setScopeRow(e.target.checked)}
                      disabled={disabled || !isEmployeesModule}
                    />
                    Employee row access (Employees only)
                  </label>
                  <label className="inline-flex items-center gap-2 border rounded-xl px-3 py-2 text-sm text-black bg-white">
                    <input
                      type="checkbox"
                      checked={scopeColumn}
                      onChange={(e) => setScopeColumn(e.target.checked)}
                      disabled={disabled}
                    />
                    Column-level access
                  </label>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Leave both unchecked to request full page access only.
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Columns (checkboxes)</div>
                <div className={`rounded-xl border p-3 ${scopeColumn ? "bg-white" : "bg-gray-50"}`}>
                  {!scopeColumn ? (
                    <div className="text-xs text-gray-500">Enable Column-level access above to choose columns.</div>
                  ) : selectableColumns.length === 0 ? (
                    <div className="text-xs text-gray-500">No columns defined for this module.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-auto">
                      {selectableColumns.map((col) => (
                        <label key={col} className="inline-flex items-center gap-2 text-sm text-black">
                          <input
                            type="checkbox"
                            checked={requestedColumnKeys.includes(col)}
                            onChange={() => toggleRequestedColumn(col)}
                            disabled={disabled || !requestedModuleKey || !scopeColumn}
                          />
                          {formatPermissionColumnLabel(col)}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {scopeRow && isEmployeesModule ? (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Specific Personnel (checkboxes)</div>
                  <input
                    value={personnelSearch}
                    onChange={(e) => setPersonnelSearch(e.target.value)}
                    placeholder="Search personnel by name or ID"
                    disabled={disabled || loadingApplicants}
                    className="mb-2 w-full border rounded-xl px-3 py-2 text-black bg-white"
                  />
                  <div className="rounded-xl border p-3 bg-white max-h-56 overflow-auto">
                    {loadingApplicants ? (
                      <div className="text-xs text-gray-500">Loading personnel...</div>
                    ) : filteredApplicants.length === 0 ? (
                      <div className="text-xs text-gray-500">No personnel found.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {filteredApplicants.map((a) => (
                          <label key={a.applicant_id} className="inline-flex items-center gap-2 text-sm text-black">
                            <input
                              type="checkbox"
                              checked={requestedApplicantIds.includes(a.applicant_id)}
                              onChange={() => toggleRequestedApplicant(a.applicant_id)}
                              disabled={disabled || loadingApplicants}
                            />
                            {applicantLabel(a)}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Selected personnel are used as row-identifier values for Employees.
                  </div>
                  <div className="mt-2 rounded-xl border p-3 bg-gray-50">
                    <div className="text-xs font-semibold text-gray-700">Preview: Selected Personnel</div>
                    {requestedApplicantIds.length === 0 ? (
                      <div className="mt-1 text-xs text-gray-500">No personnel selected.</div>
                    ) : (
                      <ul className="mt-1 text-xs text-gray-700 list-disc pl-4 space-y-0.5">
                        {requestedApplicantIds.map((id) => (
                          <li key={id}>{applicantLabelById.get(id) ?? id}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="text-xs text-gray-500 mb-1">Reason (optional)</div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={disabled}
                  rows={4}
                  className="w-full border rounded-xl px-3 py-2 text-black"
                  placeholder="e.g. Need access for daily tasks"
                />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  void submitRequest();
                }}
                disabled={disabled}
                className={`px-4 py-2 rounded-xl font-semibold ${
                  disabled ? "bg-gray-100 text-gray-400" : "bg-[#FFDA03] text-black"
                }`}
              >
                {submitting ? "Submitting…" : "Submit Request"}
              </button>

              <div className="text-xs text-gray-500">
                Your role: <span className="font-semibold text-gray-700">{role ?? "(unknown)"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="text-sm font-semibold text-black">My Requests</div>
            <div className="mt-2 text-xs text-gray-500">Last 100 requests</div>

            {loadingRequests ? (
              <div className="py-6">
                <LoadingCircle label="Loading requests…" />
              </div>
            ) : myRequests.length === 0 ? (
              <div className="mt-4 text-sm text-gray-500">No requests yet.</div>
            ) : (
              <div className="mt-4 max-h-72 overflow-auto">
                <ul className="space-y-2">
                  {myRequests.map((r) => {
                    const normalizedStatus = normalizeRequestStatus(r.status);
                    const canCancel = normalizedStatus === "PENDING";
                    const canRemove = isResolvedRequestStatus(normalizedStatus);
                    const cancelBusy = cancellingId === r.id;
                    const removeBusy = removingId === r.id;
                    const statusClass =
                      normalizedStatus === "APPROVED"
                        ? "text-emerald-700 font-semibold"
                        : normalizedStatus === "REJECTED"
                          ? "text-red-700 font-semibold"
                          : "text-gray-600";
                    const rowClass =
                      normalizedStatus === "APPROVED"
                        ? "bg-emerald-50 border-emerald-200"
                        : normalizedStatus === "REJECTED"
                          ? "bg-red-50 border-red-200"
                          : "bg-white border-gray-200";
                    const requestedColumns = requestColumnKeys(r);
                    const requestedApplicants = requestApplicantIds(r);
                    const moduleKey = normalizeModuleKey(r.requested_module_key);
                    const moduleLabel = moduleLabelByKey.get(moduleKey) ?? r.requested_module_key;

                    return (
                      <li key={r.id} className={`px-3 py-2 rounded-xl border ${rowClass}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-black">{moduleLabel}</div>
                          <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</div>
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          Scope: {[!r.request_scope_row && !r.request_scope_column ? "PAGE" : null, r.request_scope_row ? "ROW" : null, r.request_scope_column ? "COLUMN" : null].filter(Boolean).join(" + ") || "—"}
                        </div>
                        {requestedColumns.length > 0 ? (
                          <div className="mt-1 text-xs text-gray-600">
                            Columns: {requestedColumns.map((columnKey) => formatPermissionColumnLabel(columnKey)).join(", ")}
                          </div>
                        ) : null}
                        {requestedApplicants.length > 0 ? (
                          <div className="mt-1 text-xs text-gray-600">
                            Personnel: {requestedApplicants
                              .map((id) => applicantLabelById.get(id) ?? id)
                              .join(", ")}
                          </div>
                        ) : null}
                        {(r.approver_full_name || r.approver_username || r.approver_admin_id) ? (
                          <div className="mt-1 text-xs text-gray-600">
                            Reviewer: {reviewerDisplayName(r)}
                          </div>
                        ) : null}
                        <div className={`mt-1 text-xs ${statusClass}`}>Status: {normalizedStatus}</div>
                        {r.reason ? <div className="mt-1 text-xs text-gray-600">Reason: {r.reason}</div> : null}
                        {canCancel || canRemove ? (
                          <div className="mt-2 flex items-center gap-2">
                            {canCancel ? (
                              <button
                                type="button"
                                onClick={() => void cancelMyRequest(r)}
                                disabled={cancelBusy}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                                  cancelBusy ? "bg-gray-100 text-gray-400" : "bg-white text-gray-700"
                                }`}
                              >
                                {cancelBusy ? "Cancelling..." : "Cancel Request"}
                              </button>
                            ) : null}

                            {canRemove ? (
                              <button
                                type="button"
                                onClick={() => void removeMyRequest(r)}
                                disabled={removeBusy}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                                  removeBusy ? "bg-gray-100 text-gray-400" : "bg-white text-gray-700"
                                }`}
                              >
                                {removeBusy ? "Removing..." : "Remove"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <section className="bg-white rounded-2xl shadow-sm border p-5">
          <LoadingCircle label="Loading requests..." />
        </section>
      }
    >
      <RequestsPageContent />
    </Suspense>
  );
}
