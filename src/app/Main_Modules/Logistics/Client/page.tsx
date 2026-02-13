"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";

type ClientRow = {
  contract_id: string;
  contractNo: string;
  clientName: string;
  detachment: string;
  position: string;
  start: string;
  end: string;
  status: string;
};

function normalizeContractStatus(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "ACTIVE" || v === "ENDED" || v === "CANCELLED") return v;
  return "ACTIVE";
}

export default function ClientsPage() {
  const { role } = useAuthRole();
  const isAdmin = role === "admin" || role === "superadmin";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const [formContractNo, setFormContractNo] = useState("");
  const [formClientName, setFormClientName] = useState("");
  const [formDetachment, setFormDetachment] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "ENDED" | "CANCELLED">("ACTIVE");
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("name");
  const [sortKey, setSortKey] = useState<keyof ClientRow>("clientName");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const pageSize = 8;

  useEffect(() => {
    let cancelled = false;

    async function loadContracts() {
      setLoading(true);
      setError("");

      const res = await supabase
        .from("contracts")
        .select("contract_id, employee_number, full_name, detachment, position, start_date, end_date, status")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (cancelled) return;
      if (res.error) {
        setRows([]);
        setError(res.error.message || "Failed to load contracts");
        setLoading(false);
        return;
      }

      const mapped = ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        contract_id: String(r.contract_id ?? ""),
        contractNo: String(r.employee_number ?? "").trim() || String(r.contract_id ?? "").slice(0, 8),
        clientName: String(r.full_name ?? "").trim() || "(No name)",
        detachment: String(r.detachment ?? "").trim(),
        position: String(r.position ?? "").trim(),
        start: String(r.start_date ?? "").trim(),
        end: String(r.end_date ?? "").trim(),
        status: normalizeContractStatus(r.status as string | null | undefined),
      }));

      setRows(mapped);
      setLoading(false);
    }

    loadContracts();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadContracts() {
    const res = await supabase
      .from("contracts")
      .select("contract_id, employee_number, full_name, detachment, position, start_date, end_date, status")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (res.error) {
      setError(res.error.message || "Failed to reload contracts");
      return;
    }

    const mapped = ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      contract_id: String(r.contract_id ?? ""),
      contractNo: String(r.employee_number ?? "").trim() || String(r.contract_id ?? "").slice(0, 8),
      clientName: String(r.full_name ?? "").trim() || "(No name)",
      detachment: String(r.detachment ?? "").trim(),
      position: String(r.position ?? "").trim(),
      start: String(r.start_date ?? "").trim(),
      end: String(r.end_date ?? "").trim(),
      status: normalizeContractStatus(r.status as string | null | undefined),
    }));
    setRows(mapped);
  }

  async function createContract() {
    if (!isAdmin) return;
    setError("");
    setSuccess("");

    const name = formClientName.trim();
    if (!name) {
      setError("Client Name is required.");
      return;
    }

    setSaving(true);
    const payload = {
      employee_number: formContractNo.trim() || null,
      full_name: name,
      detachment: formDetachment.trim() || null,
      position: formPosition.trim() || null,
      start_date: formStartDate || null,
      end_date: formEndDate || null,
      status: formStatus,
    };

    const res = await supabase.from("contracts").insert(payload);
    setSaving(false);

    if (res.error) {
      setError(res.error.message || "Failed to create client contract");
      return;
    }

    setSuccess("Client contract added.");
    setFormContractNo("");
    setFormClientName("");
    setFormDetachment("");
    setFormPosition("");
    setFormStartDate("");
    setFormEndDate("");
    setFormStatus("ACTIVE");
    setShowAddModal(false);
    await reloadContracts();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) =>
      [item.contractNo, item.clientName, item.detachment, item.position, item.start, item.end, item.status]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  function parseYmd(value: string) {
    const v = String(value || "").trim();
    if (!v) return 0;
    const d = new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function applySortPreset(next: typeof sortBy) {
    if (next === "name") {
      setSortKey("clientName");
      setSortAsc(true);
      return;
    }
    if (next === "newest") {
      setSortKey("start");
      setSortAsc(false);
      return;
    }
    if (next === "expiring") {
      setSortKey("end");
      setSortAsc(true);
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const dateKeys: (keyof ClientRow)[] = ["start", "end"];

    const av = a[sortKey];
    const bv = b[sortKey];

    let cmp = 0;
    if (dateKeys.includes(sortKey)) {
      const at = parseYmd(String(av));
      const bt = parseYmd(String(bv));
      cmp = at - bt;
    } else {
      const as = String(av ?? "").toLowerCase();
      const bs = String(bv ?? "").toLowerCase();
      cmp = as.localeCompare(bs);
    }

    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = sorted.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  function handleSort(key: keyof ClientRow) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-5">
      <div>
        <div className="text-lg font-semibold text-black">Logistics • Client Contracts</div>
        <div className="text-sm text-gray-500 mt-1">Manage and track client contracts from Supabase.</div>
      </div>

      {isAdmin ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
          >
            Insert Information
          </button>
        </div>
      ) : null}

      {isAdmin && showAddModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-black">Add Client Contract</div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg border text-sm text-black"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={formContractNo} onChange={(e) => setFormContractNo(e.target.value)} placeholder="Contract No." className="w-full rounded-xl border px-3 py-2 text-black" />
              <input value={formClientName} onChange={(e) => setFormClientName(e.target.value)} placeholder="Client Name" className="w-full rounded-xl border px-3 py-2 text-black md:col-span-2" />
              <input value={formDetachment} onChange={(e) => setFormDetachment(e.target.value)} placeholder="Detachment" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} placeholder="Position" className="w-full rounded-xl border px-3 py-2 text-black" />
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as "ACTIVE" | "ENDED" | "CANCELLED")} className="w-full rounded-xl border px-3 py-2 text-black bg-white">
                <option value="ACTIVE">ACTIVE</option>
                <option value="ENDED">ENDED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
              <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-black" />
              <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-black" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl border text-black font-medium">Cancel</button>
              <button onClick={() => void createContract()} disabled={saving} className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${saving ? "opacity-60" : ""}`}>
                {saving ? "Saving..." : "Add Contract"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Search + Sort */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl w-full">
          <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
            <Search className="w-5 h-5 text-black" />
          </div>
          <input
            placeholder="Search by contract, client, area, etc..."
            className="flex-1 outline-none text-sm text-black placeholder:text-gray-400"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex items-center gap-2 justify-end">
          <div className="text-xs text-gray-500">Sort By:</div>
          <select
            value={sortBy}
            onChange={(e) => {
              const next = e.target.value as typeof sortBy;
              setSortBy(next);
              applySortPreset(next);
              setPage(1);
            }}
            className="px-4 py-2 rounded-full bg-black text-white font-medium border border-black"
          >
            <option value="name">Name</option>
            <option value="newest">Newest Date</option>
            <option value="expiring">Expiring Licenses</option>
          </select>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {success ? <div className="text-sm text-green-700">{success}</div> : null}

      {/* Table */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FFDA03]">
              {[
                ["contractNo", "Contract No."],
                ["clientName", "Client Name"],
                ["detachment", "Detachment"],
                ["position", "Position"],
                ["start", "Contract Start"],
                ["end", "Contract End"],
                ["status", "Status"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key as keyof ClientRow)}
                  className="px-4 py-3 text-left font-semibold text-black cursor-pointer select-none first:rounded-l-xl last:rounded-r-xl"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={i} className="animate-pulse bg-white shadow-sm">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td
                        key={j}
                        className={`px-4 py-4 ${j === 0 ? "rounded-l-xl" : ""} ${j === 6 ? "rounded-r-xl" : ""}`}
                      >
                        <div className="h-4 bg-gray-200 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : paginated.map((row) => (
                  <tr
                    key={row.contract_id}
                    className="bg-white shadow-sm hover:shadow-md transition"
                  >
                    <td className="px-4 py-3 rounded-l-xl">{row.contractNo}</td>
                    <td className="px-4 py-3 font-medium">
                      {row.clientName}
                    </td>
                    <td className="px-4 py-3">{row.detachment || "—"}</td>
                    <td className="px-4 py-3">{row.position || "—"}</td>
                    <td className="px-4 py-3">{row.start}</td>
                    <td className="px-4 py-3">{row.end}</td>
                    <td className="px-4 py-3 rounded-r-xl">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          row.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : row.status === "ENDED"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-sm">
        <span>
          Page {pageClamped} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded-lg disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded-lg disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
