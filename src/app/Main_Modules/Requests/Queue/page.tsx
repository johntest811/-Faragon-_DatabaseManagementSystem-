"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../Client/SupabaseClients";
import { useAuthRole } from "../../../Client/useRbac";
import { AccessTabs } from "../../Components/AccessTabs";
import LoadingCircle from "../../../Components/LoadingCircle";
import { useToast } from "../../../Components/ToastProvider";
import { formatPermissionColumnLabel } from "../../Components/permissionCatalog";

type ApplicantOption = {
  applicant_id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
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

function normalizeRoleNameLoose(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function moduleKeysForRequest(moduleKey: string): string[] {
  const key = String(moduleKey ?? "").trim().toLowerCase();
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

export default function RequestsQueuePage() {
  const router = useRouter();
  const { role } = useAuthRole();
  const toast = useToast();

  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [pendingRequests, setPendingRequests] = useState<AccessRequestRow[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<ApplicantOption[]>([]);

  const lastToastRef = useRef<{ error: string; success: string }>({ error: "", success: "" });

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

  const legacySession = useMemo(() => readLegacyAdminSession(), []);
  const legacyRole = normalizeRoleNameLoose(legacySession?.role);
  const reviewerAdminId = String(legacySession?.id ?? "").trim();
  const canReviewRequests = role === "superadmin" || legacyRole === "superadmin";

  const applicantLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of applicants) map.set(a.applicant_id, applicantLabel(a));
    return map;
  }, [applicants]);

  const loadApplicants = useCallback(async () => {
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
    }
  }, []);

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
    loadApplicants();
    loadPendingRequests();
  }, [loadApplicants, loadPendingRequests]);

  useEffect(() => {
    if (!canReviewRequests) return;

    const channel = supabase
      .channel("realtime:requests-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "access_requests" },
        () => {
          void loadPendingRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canReviewRequests, loadPendingRequests]);

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
        setError("This request is assigned to a different reviewer.");
        return;
      }
    }

    const requestedKey = String(req.requested_module_key ?? "").trim().toLowerCase();
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to resolve request");
    } finally {
      setResolvingId(null);
    }
  }

  if (!canReviewRequests) {
    return (
      <section className="glass-panel rounded-2xl shadow-sm p-5 animate-slide-up border-none">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-lg font-semibold text-black">Reviewer Queue</div>
            <div className="text-sm text-black">
              Only superadmin accounts can review pending requests.
            </div>
          </div>
          <button onClick={() => router.push("/Main_Modules/AdminAccounts/")} className="animated-btn px-4 py-2 rounded-xl bg-white border hover:bg-white">
            Back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel animate-slide-up rounded-2xl shadow-2xl p-5 border-none">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-lg font-semibold text-black">Pending Requests (Reviewer Queue)</div>
          <div className="text-sm text-black">
            Approve grants access based on selected scope (page, columns, and optional employee row scope).
          </div>
          <div className="mt-3">
            <AccessTabs />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPendingRequests}
            className="animated-btn px-4 py-2 rounded-xl bg-white border hover:bg-white"
          >
            Refresh
          </button>
          <button onClick={() => router.push("/Main_Modules/AdminAccounts/")} className="animated-btn px-4 py-2 rounded-xl bg-white border hover:bg-white">
            Back
          </button>
        </div>
      </div>

      {loadingPending ? (
        <div className="py-6">
          <LoadingCircle label="Loading pending requests..." />
        </div>
      ) : pendingRequests.length === 0 ? (
        <div className="mt-4 text-sm text-black">No pending requests.</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="text-left text-sm text-black">
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
                const personIds = requestApplicantIds(r);
                const personLabel = personIds.length > 0
                  ? personIds.map((id) => applicantLabelById.get(id) ?? id).join(", ")
                  : "—";
                const reviewerLabel = reviewerDisplayName(r);
                const scopeLabel = [
                  !r.request_scope_row && !r.request_scope_column ? "PAGE" : null,
                  r.request_scope_row ? "ROW" : null,
                  r.request_scope_column ? "COLUMN" : null,
                ]
                  .filter(Boolean)
                  .join(" + ") || "—";
                const columnsLabel = requestColumnKeys(r)
                  .map((columnKey) => formatPermissionColumnLabel(columnKey))
                  .join(", ");

                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-3 py-2 text-xs text-black whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-sm text-black whitespace-nowrap">{requesterLabel}</td>
                    <td className="px-3 py-2 text-sm text-black whitespace-nowrap">{r.requester_role ?? "—"}</td>
                    <td className="px-3 py-2 text-sm text-black whitespace-nowrap">{r.requested_module_key}</td>
                    <td className="px-3 py-2 text-xs text-black whitespace-nowrap">{scopeLabel}</td>
                    <td className="px-3 py-2 text-xs text-black whitespace-nowrap">{columnsLabel || "—"}</td>
                    <td className="px-3 py-2 text-xs text-black whitespace-nowrap">{personLabel}</td>
                    <td className="px-3 py-2 text-xs text-black whitespace-nowrap">{reviewerLabel}</td>
                    <td className="px-3 py-2 text-xs text-black">{r.reason ?? ""}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolveRequest(r, "APPROVED")}
                          disabled={busy}
                          className={`animated-btn px-3 py-1.5 rounded-xl text-sm font-semibold ${
                            busy ? "bg-[#FFDA03] text-black opacity-60 cursor-not-allowed" : "bg-[#FFDA03] text-black hover:bg-[#EFCB00]"
                          }`}
                        >
                          {busy ? "Working..." : "Approve"}
                        </button>
                        <button
                          onClick={() => resolveRequest(r, "REJECTED")}
                          disabled={busy}
                          className={`animated-btn px-3 py-1.5 rounded-xl text-sm font-semibold border ${
                            busy ? "bg-[#FFDA03] text-black opacity-60 cursor-not-allowed" : "bg-white text-black hover:bg-white"
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
    </section>
  );
}

