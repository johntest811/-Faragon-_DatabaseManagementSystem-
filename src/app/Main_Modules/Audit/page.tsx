"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, RefreshCw, Clock3, Save } from "lucide-react";
import LoadingCircle from "../../Components/LoadingCircle";

type AuditRetentionResponse = {
  retentionDays?: number | null;
  retentionLabel?: string | null;
  missingTable?: boolean | null;
  unavailable?: boolean | null;
  error?: string | null;
};

type AuditPageResponse = {
  rows?: AuditRow[];
  count?: number | null;
  missingTable?: boolean | null;
  unavailable?: boolean | null;
  error?: string | null;
};

type ElectronApi = {
  audit?: {
    getPage?: (payload: { page: number; pageSize: number }) => Promise<AuditPageResponse>;
    loadRetentionConfig?: () => Promise<AuditRetentionResponse>;
    saveRetentionConfig?: (payload: { retentionDays: number }) => Promise<AuditRetentionResponse & { success?: boolean | null }>;
  };
};

type AuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_user_id: string | null;
  actor_name?: string | null;
  action: string;
  page: string | null;
  entity: string | null;
  details: unknown;
};

function safeText(v: unknown) {
  return String(v ?? "").trim();
}

function formatWhen(iso: string) {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString();
  } catch {
    return iso;
  }
}

function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "message" in e) {
    return safeText((e as { message?: unknown }).message) || "Failed to load audit log";
  }
  return safeText(e) || "Failed to load audit log";
}

const RETENTION_OPTIONS = [
  { label: "1 week", value: 7 },
  { label: "1 month", value: 30 },
  { label: "1 year", value: 365 },
] as const;

function normalizeRetentionDays(value: number | string | null | undefined) {
  const next = Number(value);
  if (next === 7 || next === 30 || next === 365) return next;
  return 30;
}

export default function AuditPage() {
  const api = (globalThis as { electronAPI?: ElectronApi }).electronAPI;

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [missingTable, setMissingTable] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionMissingTable, setRetentionMissingTable] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState<string>("");

  const totalPages = useMemo(() => {
    if (!count) return 1;
    return Math.max(1, Math.ceil(count / pageSize));
  }, [count, pageSize]);

  const retentionLabel = useMemo(() => {
    return RETENTION_OPTIONS.find((option) => option.value === normalizeRetentionDays(retentionDays))?.label ?? "1 month";
  }, [retentionDays]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        if (!api?.audit?.getPage) {
          setError("Audit is available in the desktop app only.");
          setRows([]);
          setCount(0);
          return;
        }

        const res = await api.audit.getPage({ page, pageSize });
        if (cancelled) return;

        if (Boolean(res?.unavailable)) {
          setError(safeText(res?.error) || "Supabase is temporarily unreachable. Try again shortly.");
        }

        setMissingTable(Boolean(res?.missingTable));
        setRows((res?.rows ?? []) as AuditRow[]);
        setCount(Number(res?.count ?? 0));
      } catch (e: unknown) {
        if (cancelled) return;
        setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [api, page, pageSize]);

  useEffect(() => {
    let cancelled = false;

    async function loadRetention() {
      try {
        if (!api?.audit?.loadRetentionConfig) {
          return;
        }

        const res = await api.audit.loadRetentionConfig();
        if (cancelled) return;

        setRetentionDays(normalizeRetentionDays(res?.retentionDays));
        setRetentionMissingTable(Boolean(res?.missingTable));
        if (res?.unavailable) {
          setRetentionMessage(safeText(res?.error) || "Supabase is temporarily unreachable. Try again shortly.");
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setRetentionMessage(errorMessage(e));
      }
    }

    loadRetention();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const latestWhen = useMemo(() => {
    if (!rows.length) return "—";
    return formatWhen(rows[0].created_at);
  }, [rows]);

  const uniqueActors = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      const actor = safeText(row.actor_name || row.actor_email || row.actor_user_id);
      if (actor) ids.add(actor);
    }
    return ids.size;
  }, [rows]);

  function actionBadge(action: string) {
    const key = safeText(action).toUpperCase();
    if (key.includes("DELETE") || key.includes("TRASH")) return "bg-red-50 text-red-700 border-red-200";
    if (key.includes("CREATE") || key.includes("INSERT")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (key.includes("UPDATE") || key.includes("EDIT")) return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-white text-gray-700 border-gray-200";
  }

  async function refreshCurrentPage() {
    setLoading(true);
    setError("");
    try {
      if (!api?.audit?.getPage) {
        setError("Audit is available in the desktop app only.");
        setRows([]);
        setCount(0);
        return;
      }
      const res = await api.audit.getPage({ page, pageSize });
      if (Boolean(res?.unavailable)) {
        setError(safeText(res?.error) || "Supabase is temporarily unreachable. Try again shortly.");
      }
      setMissingTable(Boolean(res?.missingTable));
      setRows((res?.rows ?? []) as AuditRow[]);
      setCount(Number(res?.count ?? 0));
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveRetention() {
    setRetentionSaving(true);
    setRetentionMessage("");

    try {
      if (!api?.audit?.saveRetentionConfig) {
        setRetentionMessage("Audit retention is available in the desktop app only.");
        return;
      }

      const res = await api.audit.saveRetentionConfig({ retentionDays: normalizeRetentionDays(retentionDays) });
      if (res?.missingTable) {
        setRetentionMissingTable(true);
        setRetentionMessage("Audit retention settings table is not installed yet. Run SQL/supabase_audit_log_retention.sql.");
        return;
      }

      if (res?.unavailable) {
        setRetentionMessage(safeText(res?.error) || "Supabase is temporarily unreachable. Try again shortly.");
        return;
      }

      setRetentionDays(normalizeRetentionDays(res?.retentionDays ?? retentionDays));
      setRetentionMissingTable(false);
      setRetentionMessage(`Auto deletion updated to ${res?.retentionLabel ?? retentionLabel}. Old audit logs were cleaned up immediately.`);
      await refreshCurrentPage();
    } catch (e: unknown) {
      setRetentionMessage(errorMessage(e));
    } finally {
      setRetentionSaving(false);
    }
  }

  return (
    <section className="space-y-4 animate-slide-up">
      <div className="glass-panel rounded-3xl border-none p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-black">Audit Log</div>
            <div className="text-sm text-gray-500">
              Clean event trail for admin actions in the desktop app.
            </div>
          </div>

          <button
            type="button"
            onClick={refreshCurrentPage}
            className="animated-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white text-sm text-gray-800 hover:bg-white"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
          <div className="glass-panel animate-scale-in rounded-2xl border-none p-4">
            <div className="text-xs text-gray-500">Total Events</div>
            <div className="mt-1 text-2xl font-semibold text-black">{count}</div>
          </div>
          <div className="glass-panel animate-scale-in rounded-2xl border-none p-4">
            <div className="text-xs text-gray-500">Actors (This Page)</div>
            <div className="mt-1 text-2xl font-semibold text-black">{uniqueActors}</div>
          </div>
          <div className="glass-panel animate-scale-in rounded-2xl border-none p-4">
            <div className="text-xs text-gray-500">Most Recent Event</div>
            <div className="mt-1 text-sm font-medium text-black break-words">{latestWhen}</div>
          </div>
          <div className="glass-panel animate-scale-in rounded-2xl border-none p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock3 className="w-3.5 h-3.5" />
              Auto Delete
            </div>
            <div className="mt-2 text-xs text-gray-500">Delete audit logs older than:</div>
            <select
              value={retentionDays}
              onChange={(event) => setRetentionDays(normalizeRetentionDays(event.target.value))}
              disabled={retentionSaving || retentionMissingTable}
              className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm text-black disabled:opacity-60"
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={saveRetention}
              disabled={retentionSaving || retentionMissingTable}
              className="animated-btn mt-3 inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {retentionSaving ? "Saving…" : "Save"}
            </button>
            <div className="mt-2 text-[11px] text-gray-500">Current setting: {retentionLabel}</div>
          </div>
        </div>
      </div>

      {retentionMissingTable ? (
        <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-yellow-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Audit retention settings are not installed yet. Run the SQL in
            <span className="font-semibold"> SQL/supabase_audit_log_retention.sql</span>.
          </div>
        </div>
      ) : null}

      {retentionMessage ? (
        <div className="rounded-2xl border bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>{retentionMessage}</div>
        </div>
      ) : null}

      {missingTable ? (
        <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-yellow-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Audit table is not installed yet. Run the SQL in
            <span className="font-semibold"> Supabase_database.sql</span>.
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      ) : null}

      <div className="relative overflow-auto max-h-[70vh] glass-panel rounded-2xl border-none animate-slide-up">
        <table className="min-w-[1100px] w-full text-sm text-black">
          <thead className="bg-white border-b border-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left">When</th>
              <th className="px-4 py-3 text-left">Actor</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Page</th>
              <th className="px-4 py-3 text-left">Entity</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  <LoadingCircle label="Loading audit log..." />
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="animated-row border-b border-gray-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatWhen(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {r.actor_name || r.actor_email || r.actor_user_id || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${actionBadge(r.action)}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.page || "—"}</td>
                  <td className="px-4 py-3">{r.entity || "—"}</td>
                  <td className="px-4 py-3 max-w-[420px]">
                    {r.details ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          className="animated-btn text-xs px-2 py-1 rounded-lg border bg-white hover:bg-white"
                          onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                        >
                          {expandedId === r.id ? "Hide details" : "Show details"}
                        </button>
                        {expandedId === r.id ? (
                          <pre className="whitespace-pre-wrap break-words text-xs bg-white border-none rounded-xl px-3 py-2 overflow-auto">
                            {JSON.stringify(r.details, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  No audit events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-gray-600 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Page <span className="text-black font-medium">{page}</span> of{" "}
          <span className="text-black font-medium">{totalPages}</span>
        </div>

        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="animated-btn px-3 py-1.5 border bg-white rounded-lg disabled:opacity-40 hover:bg-white"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="animated-btn px-3 py-1.5 border bg-white rounded-lg disabled:opacity-40 hover:bg-white"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

