"use client";

import { useMemo, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";

type ClientRow = {
  contract_id: string;
  contractNo: string;
  clientName: string;
  cluster: string;
  project_name: string;
  contracted_number: string;
  deployed: string;
  detachment: string; // will now display as Specific Area
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
        .select("*")
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
        contractNo: String(r.employee_number ?? ""),
        clientName: String(r.full_name ?? ""),
        cluster: String(r.detachment ?? ""), // using detachment backend
        project_name: String(r.detachment ?? ""), // same backend for now
        contracted_number: String(r.detachment ?? ""), // same backend
        deployed: String(r.detachment ?? ""), // same backend
        detachment: String(r.detachment ?? ""), // will show as Specific Area
        position: String(r.position ?? ""),
        start: String(r.start_date ?? ""),
        end: String(r.end_date ?? ""),
        status: normalizeContractStatus(r.status as string),
      }));

      setRows(mapped);
      setLoading(false);
    }

    loadContracts();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) =>
      Object.values(item).join(" ").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = [...filtered].sort((a, b) => {
    const av = String(a[sortKey] ?? "").toLowerCase();
    const bv = String(b[sortKey] ?? "").toLowerCase();
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
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

  async function createContract() {
  if (!isAdmin || saving) return;

  setError("");
  setSuccess("");

  const name = formClientName.trim();
  if (!name) {
    setError("Client Name is required.");
    return;
  }

  try {
    setSaving(true);

    const { data, error } = await supabase
      .from("contracts")
      .insert({
        employee_number: formContractNo.trim() || null,
        full_name: name,
        detachment: formDetachment.trim() || null,
        position: formPosition.trim() || null,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
        status: formStatus,
      })
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Insert failed.");

    const newRow: ClientRow = {
      contract_id: String(data.contract_id ?? ""),
      contractNo:
        String(data.employee_number ?? "").trim() ||
        String(data.contract_id ?? "").slice(0, 8),
      clientName: String(data.full_name ?? "").trim() || "(No name)",

      // 👇 Because your table uses detachment for multiple columns
      cluster: String(data.detachment ?? ""),
      project_name: String(data.detachment ?? ""),
      contracted_number: String(data.detachment ?? ""),
      deployed: String(data.detachment ?? ""),
      detachment: String(data.detachment ?? ""),

      position: String(data.position ?? ""),
      start: String(data.start_date ?? ""),
      end: String(data.end_date ?? ""),
      status: normalizeContractStatus(data.status),
    };

    // Add instantly to top (no reload)
    setRows((prev) => [newRow, ...prev]);

    // Reset form
    setFormContractNo("");
    setFormClientName("");
    setFormDetachment("");
    setFormPosition("");
    setFormStartDate("");
    setFormEndDate("");
    setFormStatus("ACTIVE");

    setShowAddModal(false);
    setSuccess("Client contract added successfully.");
  } catch (err: any) {
    setError(err.message || "Failed to create client contract.");
  } finally {
    setSaving(false);
  }
}



  

return (
  <>
    <section className="bg-white rounded-3xl border p-6 space-y-5">

      {/* HEADER */}
      <div>
        <div className="text-lg font-semibold text-black">
          Logistics • Client Contracts
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Manage and track client contracts from Supabase.
        </div>
      </div>

      {/* INSERT BUTTON */}
      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
          >
            Insert Information
          </button>
        </div>
      )}

      {/* SEARCH + SORT */}
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
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 rounded-full bg-black text-white font-medium border border-black"
          >
            <option value="name">Name</option>
            <option value="newest">Newest Date</option>
            <option value="expiring">Expiring Licenses</option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FFDA03]">
              {[
                ["contractNo", "Contract No."],
                ["cluster", "Cluster"],
                ["clientName", "Client Name"],
                ["detachment", "Specific Area"],
                ["project_name", "Project Name"],
                ["start", "Contract Start"],
                ["end", "Contract End"],
                ["contracted_number", "Contracted Manpower"],
                ["deployed", "No. of Deployed Guards"],
                ["status", "Status"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key as keyof ClientRow)}
                  className="px-4 py-3 text-left font-semibold text-black cursor-pointer select-none first:rounded-l-xl last:rounded-r-xl"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {paginated.map((row) => (
              <tr
                key={row.contract_id}
                className="bg-white shadow-sm hover:shadow-md transition"
              >
                <td className="px-4 py-3">{row.contractNo}</td>
                <td className="px-4 py-3">{row.clientName}</td>
                <td className="px-4 py-3">{row.cluster}</td>
                <td className="px-4 py-3">{row.project_name}</td>
                <td className="px-4 py-3">{row.contracted_number}</td>
                <td className="px-4 py-3">{row.deployed}</td>
                <td className="px-4 py-3">{row.detachment}</td>
                <td className="px-4 py-3">{row.start}</td>
                <td className="px-4 py-3">{row.end}</td>
                <td className="px-4 py-3">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>

    {/* MODAL */}
    {isAdmin && showAddModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={() => setShowAddModal(false)}
      >
        <div
          className="w-full max-w-3xl rounded-2xl bg-white border p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-black">
              Add Client Contract
            </div>
            <button
              onClick={() => setShowAddModal(false)}
              className="px-3 py-1.5 rounded-lg border text-sm text-black"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={formContractNo}
              onChange={(e) => setFormContractNo(e.target.value)}
              placeholder="Contract No."
              className="w-full rounded-xl border px-3 py-2 text-black"
            />

            <input
              value={formClientName}
              onChange={(e) => setFormClientName(e.target.value)}
              placeholder="Client Name"
              className="w-full rounded-xl border px-3 py-2 text-black md:col-span-2"
            />

            <input
              value={formDetachment}
              onChange={(e) => setFormDetachment(e.target.value)}
              placeholder="Detachment"
              className="w-full rounded-xl border px-3 py-2 text-black"
            />

            <input
              value={formPosition}
              onChange={(e) => setFormPosition(e.target.value)}
              placeholder="Position"
              className="w-full rounded-xl border px-3 py-2 text-black"
            />

            <select
              value={formStatus}
              onChange={(e) =>
                setFormStatus(
                  e.target.value as "ACTIVE" | "ENDED" | "CANCELLED"
                )
              }
              className="w-full rounded-xl border px-3 py-2 text-black bg-white"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="ENDED">ENDED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>

            <input
              type="date"
              value={formStartDate}
              onChange={(e) => setFormStartDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-black"
            />

            <input
              type="date"
              value={formEndDate}
              onChange={(e) => setFormEndDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-black"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 rounded-xl border text-black"
            >
              Cancel
            </button>

            <button
              onClick={() => void createContract()}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#FFDA03] font-semibold"
            >
              {saving ? "Saving..." : "Add Contract"}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);


  

  
}

