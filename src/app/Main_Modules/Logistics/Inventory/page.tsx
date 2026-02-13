"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";

type InventoryRow = {
  id_paraphernalia_inventory: string;
  item: string;
  stock_balance: number;
  stock_in: number;
  stock_out: number;
  updated_at: string;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
};

function toNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function stockStatus(balance: number): InventoryRow["status"] {
  if (balance <= 0) return "OUT_OF_STOCK";
  if (balance <= 5) return "LOW_STOCK";
  return "IN_STOCK";
}

export default function LogisticsInventoryPage() {
  const { role } = useAuthRole();
  const isAdmin = role === "admin" || role === "superadmin";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const [formItem, setFormItem] = useState("");
  const [formStockBalance, setFormStockBalance] = useState("0");
  const [formStockIn, setFormStockIn] = useState("0");
  const [formStockOut, setFormStockOut] = useState("0");
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | InventoryRow["status"]>("All");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("name");
  const [sortKey, setSortKey] = useState<keyof InventoryRow>("item");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;

    async function loadInventory() {
      setLoading(true);
      setError("");

      const res = await supabase
        .from("paraphernalia_inventory")
        .select("id_paraphernalia_inventory, items, stock_balance, stock_in, stock_out, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1000);

      if (cancelled) return;

      if (res.error) {
        setRows([]);
        setError(res.error.message || "Failed to load inventory");
        setLoading(false);
        return;
      }

      const mapped = ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const balance = toNumber(r.stock_balance);
        return {
          id_paraphernalia_inventory: String(r.id_paraphernalia_inventory ?? ""),
          item: String(r.items ?? "").trim() || "(Unnamed item)",
          stock_balance: balance,
          stock_in: toNumber(r.stock_in),
          stock_out: toNumber(r.stock_out),
          updated_at: String(r.updated_at ?? "").trim(),
          status: stockStatus(balance),
        };
      });

      setRows(mapped);
      setLoading(false);
    }

    loadInventory();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadInventory() {
    const res = await supabase
      .from("paraphernalia_inventory")
      .select("id_paraphernalia_inventory, items, stock_balance, stock_in, stock_out, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (res.error) {
      setError(res.error.message || "Failed to reload inventory");
      return;
    }

    const mapped = ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const balance = toNumber(r.stock_balance);
      return {
        id_paraphernalia_inventory: String(r.id_paraphernalia_inventory ?? ""),
        item: String(r.items ?? "").trim() || "(Unnamed item)",
        stock_balance: balance,
        stock_in: toNumber(r.stock_in),
        stock_out: toNumber(r.stock_out),
        updated_at: String(r.updated_at ?? "").trim(),
        status: stockStatus(balance),
      };
    });
    setRows(mapped);
  }

  function generateUuidV4() {
    const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function addInventoryRow() {
    if (!isAdmin) return;
    setError("");
    setSuccess("");

    const itemName = formItem.trim();
    if (!itemName) {
      setError("Item name is required.");
      return;
    }

    setSaving(true);
    const res = await supabase.from("paraphernalia_inventory").insert({
      id_paraphernalia_inventory: generateUuidV4(),
      items: itemName,
      stock_balance: toNumber(formStockBalance),
      stock_in: toNumber(formStockIn),
      stock_out: toNumber(formStockOut),
    });
    setSaving(false);

    if (res.error) {
      setError(res.error.message || "Failed to add inventory item");
      return;
    }

    setSuccess("Inventory item added.");
    setFormItem("");
    setFormStockBalance("0");
    setFormStockIn("0");
    setFormStockOut("0");
    setShowAddModal(false);
    await reloadInventory();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesSearch = [item.item, item.status, String(item.stock_balance), String(item.stock_in), String(item.stock_out)]
        .join(" ")
        .toLowerCase()
        .includes(q);
      const matchesStatus = statusFilter === "All" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  function applySortPreset(next: typeof sortBy) {
    if (next === "name") {
      setSortKey("item");
      setSortAsc(true);
      return;
    }
    if (next === "newest") {
      setSortKey("updated_at");
      setSortAsc(false);
      return;
    }
    if (next === "expiring") {
      // Treat low/out stock as urgent.
      setSortKey("status");
      setSortAsc(true);
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "expiring" && sortKey === "status") {
      const rank = (s: InventoryRow["status"]) => (s === "OUT_OF_STOCK" ? 0 : s === "LOW_STOCK" ? 1 : 2);
      const d = rank(a.status) - rank(b.status);
      if (d !== 0) return d;
      return a.item.localeCompare(b.item);
    }

    const valA = a[sortKey].toString().toLowerCase();
    const valB = b[sortKey].toString().toLowerCase();
    const d = valA.localeCompare(valB);
    return sortAsc ? d : -d;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = sorted.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  function handleSort(key: keyof InventoryRow) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-5">
      <div>
        <div className="text-lg font-semibold text-black">Logistics • Inventory</div>
        <div className="text-sm text-gray-500 mt-1">Track stock levels from paraphernalia inventory.</div>
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
              <div className="text-sm font-semibold text-black">Add Inventory Item</div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg border text-sm text-black"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input value={formItem} onChange={(e) => setFormItem(e.target.value)} placeholder="Item name" className="w-full rounded-xl border px-3 py-2 text-black md:col-span-2" />
              <input type="number" value={formStockBalance} onChange={(e) => setFormStockBalance(e.target.value)} placeholder="Stock balance" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input type="number" value={formStockIn} onChange={(e) => setFormStockIn(e.target.value)} placeholder="Stock in" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input type="number" value={formStockOut} onChange={(e) => setFormStockOut(e.target.value)} placeholder="Stock out" className="w-full rounded-xl border px-3 py-2 text-black" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl border text-black font-medium">Cancel</button>
              <button onClick={() => void addInventoryRow()} disabled={saving} className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${saving ? "opacity-60" : ""}`}>
                {saving ? "Saving..." : "Add Inventory"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl w-full">
          <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
            <Search className="w-5 h-5 text-black" />
          </div>
          <input
            placeholder="Search by equipment, serial, assigned, etc..."
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

          <select
            className="border rounded-xl px-4 py-2 text-sm text-black"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "All" | InventoryRow["status"]);
              setPage(1);
            }}
          >
            <option value="All">All Status</option>
            <option value="IN_STOCK">IN_STOCK</option>
            <option value="LOW_STOCK">LOW_STOCK</option>
            <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {success ? <div className="text-sm text-green-700">{success}</div> : null}

      <div className="relative overflow-x-auto">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FFDA03]">
              {[
                ["item", "Item"],
                ["stock_balance", "Stock Balance"],
                ["stock_in", "Stock In"],
                ["stock_out", "Stock Out"],
                ["updated_at", "Last Updated"],
                ["status", "Status"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key as keyof InventoryRow)}
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
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td
                        key={j}
                        className={`px-4 py-4 ${j === 0 ? "rounded-l-xl" : ""} ${j === 5 ? "rounded-r-xl" : ""}`}
                      >
                        <div className="h-4 bg-gray-200 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : paginated.map((item) => (
                  <tr
                    key={item.id_paraphernalia_inventory}
                    className="bg-white shadow-sm hover:shadow-md transition"
                  >
                    <td className="px-4 py-3 rounded-l-xl font-medium">{item.item}</td>
                    <td className="px-4 py-3">{item.stock_balance}</td>
                    <td className="px-4 py-3">{item.stock_in}</td>
                    <td className="px-4 py-3">{item.stock_out}</td>
                    <td className="px-4 py-3">{item.updated_at ? item.updated_at.slice(0, 10) : "—"}</td>
                    <td className="px-4 py-3 rounded-r-xl">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.status === "IN_STOCK"
                            ? "bg-green-100 text-green-700"
                            : item.status === "LOW_STOCK"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {item.status}
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
