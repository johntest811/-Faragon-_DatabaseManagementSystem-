"use client";

import { useEffect, useMemo, useState } from "react";

type AuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_user_id: string | null;
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

export default function AuditPage() {
  const api = (globalThis as unknown as { electronAPI?: any }).electronAPI;

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [missingTable, setMissingTable] = useState(false);

  const totalPages = useMemo(() => {
    if (!count) return 1;
    return Math.max(1, Math.ceil(count / pageSize));
  }, [count, pageSize]);

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

        setMissingTable(Boolean(res?.missingTable));
        setRows((res?.rows ?? []) as AuditRow[]);
        setCount(Number(res?.count ?? 0));
      } catch (e: any) {
        if (cancelled) return;
        setError(safeText(e?.message || e) || "Failed to load audit log");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [api, page, pageSize]);

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-4">
      <div>
        <div className="text-xl font-semibold text-black">Audit Log</div>
        <div className="text-sm text-gray-500">
          Tracks admin activities performed inside the desktop app.
        </div>
      </div>

      {missingTable ? (
        <div className="rounded-2xl border bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Audit table is not installed yet. Run the SQL in
          <span className="font-semibold"> Supabase_audit_log.sql</span>.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="relative overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm text-black">
          <thead className="bg-gray-50 border-b">
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
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse border-b">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatWhen(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {r.actor_email || r.actor_user_id || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{r.action}</td>
                  <td className="px-4 py-3">{r.page || "—"}</td>
                  <td className="px-4 py-3">{r.entity || "—"}</td>
                  <td className="px-4 py-3 max-w-[420px]">
                    <pre className="whitespace-pre-wrap break-words text-xs bg-gray-50 border rounded-xl px-3 py-2 overflow-auto">
                      {r.details ? JSON.stringify(r.details, null, 2) : "—"}
                    </pre>
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
        <div className="text-gray-600">
          Page <span className="text-black font-medium">{page}</span> of{" "}
          <span className="text-black font-medium">{totalPages}</span>
        </div>

        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
