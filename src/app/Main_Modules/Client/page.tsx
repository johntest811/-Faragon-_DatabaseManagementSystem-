"use client";

import { useMemo, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";

type ClientRow = {
  contract_id: string;
  contract_no: string | null;
  applicant_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  restock_count: number;
  paraphernalia_count: number;
  paraphernalia_inventory_count: number;
  resigned_count: number;
};

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function loadConnectedData() {
    setLoading(true);
    setError("");

    const [contractsRes, applicantsRes, restockRes, paraphernaliaRes, inventoryRes, resignedRes] = await Promise.all([
      supabase.from("contracts").select("contract_id, applicant_id, contract_no, start_date, end_date, status").order("created_at", { ascending: false }).limit(1000),
      supabase.from("applicants").select("applicant_id, first_name, middle_name, last_name").limit(5000),
      supabase.from("restock").select("contract_id").limit(5000),
      supabase.from("paraphernalia").select("id_paraphernalia").limit(5000),
      supabase.from("paraphernalia_inventory").select("contract_id").limit(5000),
      supabase.from("resigned").select("contract_id").limit(5000),
    ]);

    if (contractsRes.error) {
      setLoading(false);
      setError(contractsRes.error.message || "Failed to load contracts");
      setRows([]);
      return;
    }

    const applicantsById = new Map<string, string>();
    for (const a of (applicantsRes.data as any[]) || []) {
      const fullName = [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(" ").trim();
      applicantsById.set(String(a.applicant_id), fullName || "Unknown Applicant");
    }

    const restockByContract = new Map<string, number>();
    for (const row of (restockRes.data as any[]) || []) {
      const key = String(row.contract_id || "").trim();
      if (!key) continue;
      restockByContract.set(key, (restockByContract.get(key) || 0) + 1);
    }

    const inventoryByContract = new Map<string, number>();
    for (const row of (inventoryRes.data as any[]) || []) {
      const key = String(row.contract_id || "").trim();
      if (!key) continue;
      inventoryByContract.set(key, (inventoryByContract.get(key) || 0) + 1);
    }

    const resignedByContract = new Map<string, number>();
    for (const row of (resignedRes.data as any[]) || []) {
      const key = String(row.contract_id || "").trim();
      if (!key) continue;
      resignedByContract.set(key, (resignedByContract.get(key) || 0) + 1);
    }

    const paraphernaliaCount = ((paraphernaliaRes.data as any[]) || []).length;

    const merged: ClientRow[] = ((contractsRes.data as any[]) || []).map((contract) => {
      const contractId = String(contract.contract_id);
      return {
        contract_id: contractId,
        contract_no: contract.contract_no ?? null,
        applicant_name: applicantsById.get(String(contract.applicant_id || "")) || "Unknown Applicant",
        start_date: contract.start_date ?? null,
        end_date: contract.end_date ?? null,
        status: contract.status ?? null,
        restock_count: restockByContract.get(contractId) || 0,
        paraphernalia_count: paraphernaliaCount,
        paraphernalia_inventory_count: inventoryByContract.get(contractId) || 0,
        resigned_count: resignedByContract.get(contractId) || 0,
      };
    });

    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadConnectedData();
    const channel = supabase
      .channel("realtime:client-connected-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "restock" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia_inventory" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "resigned" }, loadConnectedData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-5">
      <div>
        <div className="text-lg font-semibold text-black">Logistics • Client Connections</div>
        <div className="text-sm text-gray-500 mt-1">
          Connected to Contracts, Restock, Paraphernalia, Paraphernalia_Inventory, and Resigned tables.
        </div>
      </div>

      <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl w-full">
        <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
          <Search className="w-5 h-5 text-black" />
        </div>
        <input
          placeholder="Search contract/applicant..."
          className="flex-1 outline-none text-sm text-black placeholder:text-gray-400"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error ? <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="relative overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm text-black">
          <thead className="bg-gray-100 border-b">
            <tr>
              {["Contract No.", "Applicant", "Start", "End", "Status", "Restock", "Paraphernalia", "Paraphernalia Inventory", "Resigned"].map((label) => (
                <th key={label} className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">{label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading connected client records...</td>
              </tr>
            ) : paginated.length ? (
              paginated.map((row) => (
                <tr key={row.contract_id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{row.contract_no || "—"}</td>
                  <td className="px-4 py-3 font-medium">{row.applicant_name}</td>
                  <td className="px-4 py-3">{row.start_date || "—"}</td>
                  <td className="px-4 py-3">{row.end_date || "—"}</td>
                  <td className="px-4 py-3">{row.status || "UNKNOWN"}</td>
                  <td className="px-4 py-3 text-center">{row.restock_count}</td>
                  <td className="px-4 py-3 text-center">{row.paraphernalia_count}</td>
                  <td className="px-4 py-3 text-center">{row.paraphernalia_inventory_count}</td>
                  <td className="px-4 py-3 text-center">{row.resigned_count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No client records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm">
        <span>Page {pageClamped} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            disabled={pageClamped === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded-lg disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={pageClamped === totalPages}
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

