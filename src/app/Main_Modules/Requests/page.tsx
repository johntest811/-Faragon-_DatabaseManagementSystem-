"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole } from "../../Client/useRbac";
import LoadingCircle from "../../Components/LoadingCircle";
import { columnsForModule, normalizeModuleKey } from "../Components/permissionCatalog";

type ModuleRow = { module_key: string; display_name: string; path: string };

type AccessRequestRow = {
  id: string;
  created_at: string;
  status: string | null;
  requested_module_key: string;
  requested_column_key?: string | null;
  requested_path: string | null;
  reason: string | null;
  requester_user_id?: string | null;
  requester_email?: string | null;
  requester_admin_id?: string | null;
  requester_username?: string | null;
  requester_role?: string | null;
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

export default function RequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useAuthRole();

  const preselectModule = normalizeModuleKey(searchParams?.get("module") ?? "");

  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const [requestedModuleKey, setRequestedModuleKey] = useState<string>(preselectModule);
  const [requestedColumnKey, setRequestedColumnKey] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [myRequests, setMyRequests] = useState<AccessRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [pendingRequests, setPendingRequests] = useState<AccessRequestRow[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

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

  const loadMyRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id ?? null;
      const email = session.data.session?.user?.email ?? null;
      const legacy = readLegacyAdminSession();

      let query = supabase
        .from("access_requests")
        .select("id, created_at, status, requested_module_key, requested_column_key, requested_path, reason")
        .order("created_at", { ascending: false })
        .limit(100);

      if (userId) {
        query = query.eq("requester_user_id", userId);
      } else if (legacy?.id) {
        query = query.eq("requester_admin_id", legacy.id);
      } else if (email) {
        query = query.eq("requester_email", email);
      } else {
        setMyRequests([]);
        return;
      }

      const { data, error: reqErr } = await query;
      if (reqErr) throw reqErr;
      setMyRequests((data as AccessRequestRow[]) || []);
    } catch {
      // Don't block the page if the table doesn't exist yet.
      setMyRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadPendingRequests = useCallback(async () => {
    if (role !== "superadmin") {
      setPendingRequests([]);
      return;
    }

    setLoadingPending(true);
    try {
      const { data, error: reqErr } = await supabase
        .from("access_requests")
        .select(
          "id, created_at, status, requested_module_key, requested_column_key, requested_path, reason, requester_user_id, requester_email, requester_admin_id, requester_username, requester_role"
        )
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(200);
      if (reqErr) throw reqErr;
      setPendingRequests((data as AccessRequestRow[]) || []);
    } catch {
      setPendingRequests([]);
    } finally {
      setLoadingPending(false);
    }
  }, [role]);

  useEffect(() => {
    loadModules();
    loadMyRequests();
    loadPendingRequests();
  }, [loadModules, loadMyRequests, loadPendingRequests]);

  const selectableModules = useMemo(() => {
    return modules.map((m) => ({
      ...m,
      module_key: normalizeModuleKey(m.module_key),
    }));
  }, [modules]);

  const selectedModule = useMemo(
    () => selectableModules.find((m) => normalizeModuleKey(m.module_key) === normalizeModuleKey(requestedModuleKey)) ?? null,
    [requestedModuleKey, selectableModules]
  );

  const selectableColumns = useMemo(() => {
    if (!requestedModuleKey) return [];
    return columnsForModule(requestedModuleKey);
  }, [requestedModuleKey]);

  const disabled = submitting || loadingModules;

  async function submitRequest() {
    setError("");
    setSuccess("");

    const moduleKey = normalizeModuleKey(requestedModuleKey);
    if (!moduleKey) return setError("Please choose a page/module to request.");

    setSubmitting(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id ?? null;
      const email = session.data.session?.user?.email ?? null;
      const legacy = readLegacyAdminSession();

      const requestedPath = selectedModule?.path ?? null;
      const cleanColumn = requestedColumnKey.trim() || null;

      const { error: insErr } = await supabase.from("access_requests").insert({
        requested_module_key: moduleKey,
        requested_column_key: cleanColumn,
        requested_path: requestedPath,
        reason: reason.trim() || null,
        requester_user_id: userId,
        requester_email: email,
        requester_admin_id: legacy?.id ?? null,
        requester_username: legacy?.username ?? null,
        requester_role: legacy?.role ?? role ?? null,
      });

      if (insErr) throw insErr;

      setSuccess("Request submitted.");
      setReason("");
      setRequestedColumnKey("");
      loadMyRequests();

      // Keep URL in sync so the page can be bookmarked.
      router.replace(`/Main_Modules/Requests/?module=${encodeURIComponent(moduleKey)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveRequest(req: AccessRequestRow, nextStatus: "APPROVED" | "REJECTED") {
    setError("");
    setSuccess("");
    if (role !== "superadmin") {
      setError("Only Superadmin can review requests.");
      return;
    }

    const requestedKey = normalizeModuleKey(req.requested_module_key);
    const requestedColumn = String(req.requested_column_key ?? "").trim();
    if (!requestedKey) {
      setError("Invalid requested module.");
      return;
    }

    if (requestedKey === "access") {
      setError("Admin Accounts / Roles / Permissions are Superadmin-only and cannot be granted by request.");
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

          if (requestedColumn) {
            const { error: adminColErr } = await supabase
              .from("admin_column_access_overrides")
              .upsert(
                {
                  admin_id: req.requester_admin_id,
                  module_key: requestedKey,
                  column_key: requestedColumn,
                  can_read: true,
                },
                { onConflict: "admin_id,module_key,column_key" }
              );
            if (adminColErr) throw adminColErr;
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

          if (requestedColumn) {
            const { error: userColErr } = await supabase
              .from("user_column_access_overrides")
              .upsert(
                {
                  user_id: req.requester_user_id,
                  module_key: requestedKey,
                  column_key: requestedColumn,
                  can_read: true,
                },
                { onConflict: "user_id,module_key,column_key" }
              );
            if (userColErr) throw userColErr;
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
        <button onClick={() => router.push("/Main_Modules/Dashboard/")} className="px-4 py-2 rounded-xl bg-white border">
          Back
        </button>
      </div>

      {error ? <div className="mb-3 text-red-600 text-sm">{error}</div> : null}
      {success ? <div className="mb-3 text-emerald-700 text-sm">{success}</div> : null}

      {role === "superadmin" ? (
        <div className="mb-5 rounded-2xl border p-4">
          <div className="text-sm font-semibold text-black">Pending Requests (Superadmin)</div>
          <div className="mt-2 text-xs text-gray-500">Approve grants access to the requester’s role via Permissions.</div>

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
                    <th className="px-3 py-2">Column</th>
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
                      (r.requester_admin_id ? `admin:${r.requester_admin_id}` : r.requester_user_id ? `user:${r.requester_user_id}` : "—");

                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-sm text-black whitespace-nowrap">{requesterLabel}</td>
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{r.requester_role ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-black whitespace-nowrap">{r.requested_module_key}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{r.requested_column_key ?? "—"}</td>
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
                    setRequestedColumnKey("");
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
                <div className="mt-2 text-xs text-gray-500">All pages are requestable. Superadmin approval is required.</div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Column (optional)</div>
                <select
                  value={requestedColumnKey}
                  onChange={(e) => setRequestedColumnKey(e.target.value)}
                  disabled={disabled || !requestedModuleKey}
                  className="w-full border rounded-xl px-3 py-2 text-black bg-white"
                >
                  <option value="">Page-level access only</option>
                  {selectableColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

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
                onClick={submitRequest}
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
                  {myRequests.map((r) => (
                    <li key={r.id} className="px-3 py-2 rounded-xl border">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-black">{r.requested_module_key}</div>
                        <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      {r.requested_column_key ? (
                        <div className="mt-1 text-xs text-gray-600">Column: {r.requested_column_key}</div>
                      ) : null}
                      <div className="mt-1 text-xs text-gray-600">Status: {r.status ?? "PENDING"}</div>
                      {r.reason ? <div className="mt-1 text-xs text-gray-600">Reason: {r.reason}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
