"use client";

import { useMemo, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";

type ReportRow = {
  id_paraphernalia: string;
  timestamp: string;
  action: string;
  item: string;
  quantity: number;
  price: number;
  names: string;
};

function toNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function LogisticsReportsPage() {
  const { role } = useAuthRole();
  const isAdmin = role === "admin" || role === "superadmin";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("name");
  const [showAddModal, setShowAddModal] = useState(false);

  const [formAction, setFormAction] = useState<"ISSUE" | "RETURN" | "ADJUSTMENT">("ISSUE");
  const [formItem, setFormItem] = useState("");
  const [formQuantity, setFormQuantity] = useState("0");
  const [formPrice, setFormPrice] = useState("0");
  const [formBy, setFormBy] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      setError("");
      const res = await supabase
        .from("paraphernalia")
        .select("id_paraphernalia, timestamp, action, items, quantity, price, names")
        .order("timestamp", { ascending: false })
        .limit(1000);

      if (cancelled) return;
      if (res.error) {
        setRows([]);
        setError(res.error.message || "Failed to load logistics reports");
        setLoading(false);
        return;
      }

      const mapped = ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id_paraphernalia: String(r.id_paraphernalia ?? ""),
        timestamp: String(r.timestamp ?? "").trim(),
        action: String(r.action ?? "").trim() || "ISSUE",
        item: String(r.items ?? "").trim() || "(No item)",
        quantity: toNumber(r.quantity),
        price: toNumber(r.price),
        names: String(r.names ?? "").trim(),
      }));

      setRows(mapped);
      setLoading(false);
    }

    loadReports();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadReports() {
    const res = await supabase
      .from("paraphernalia")
      .select("id_paraphernalia, timestamp, action, items, quantity, price, names")
      .order("timestamp", { ascending: false })
      .limit(1000);

    if (res.error) {
      setError(res.error.message || "Failed to reload logistics reports");
      return;
    }

    const mapped = ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id_paraphernalia: String(r.id_paraphernalia ?? ""),
      timestamp: String(r.timestamp ?? "").trim(),
      action: String(r.action ?? "").trim() || "ISSUE",
      item: String(r.items ?? "").trim() || "(No item)",
      quantity: toNumber(r.quantity),
      price: toNumber(r.price),
      names: String(r.names ?? "").trim(),
    }));
    setRows(mapped);
  }

  async function addReportRow() {
    if (!isAdmin) return;
    setError("");
    setSuccess("");

    const item = formItem.trim();
    if (!item) {
      setError("Item is required.");
      return;
    }

    setSaving(true);
    const res = await supabase.from("paraphernalia").insert({
      action: formAction,
      items: item,
      quantity: toNumber(formQuantity),
      price: toNumber(formPrice),
      names: formBy.trim() || null,
    });
    setSaving(false);

    if (res.error) {
      setError(res.error.message || "Failed to add logistics report row");
      return;
    }

    setSuccess("Logistics report entry added.");
    setFormAction("ISSUE");
    setFormItem("");
    setFormQuantity("0");
    setFormPrice("0");
    setFormBy("");
    setShowAddModal(false);
    await reloadReports();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.action, r.item, r.names, String(r.quantity), String(r.price), r.timestamp].join(" ").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortBy === "newest") {
      list.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      return list;
    }
    if (sortBy === "expiring") {
      list.sort((a, b) => a.quantity - b.quantity);
      return list;
    }
    list.sort((a, b) => a.item.localeCompare(b.item));
    return list;
  }, [filtered, sortBy]);

  return (
    <div className="rounded-3xl bg-white border p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-black">Logistics • Reports</div>
          <div className="text-sm text-gray-500 mt-1">Connected to paraphernalia transactions.</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
            >
              Insert Information
            </button>
          ) : null}
          <div className="flex items-center gap-2 border rounded-2xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports..."
              className="outline-none text-sm text-black placeholder:text-gray-400"
            />
          </div>
          <div className="text-xs text-gray-500">Sort By:</div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2 rounded-full bg-black text-white font-medium border border-black"
          >
            <option value="name">Name</option>
            <option value="newest">Newest Date</option>
            <option value="expiring">Expiring Licenses</option>
          </select>
        </div>
      </div>

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
              <div className="text-sm font-semibold text-black">Add Report Transaction</div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg border text-sm text-black"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <select value={formAction} onChange={(e) => setFormAction(e.target.value as "ISSUE" | "RETURN" | "ADJUSTMENT")} className="w-full rounded-xl border px-3 py-2 text-black bg-white">
                <option value="ISSUE">ISSUE</option>
                <option value="RETURN">RETURN</option>
                <option value="ADJUSTMENT">ADJUSTMENT</option>
              </select>
              <input value={formItem} onChange={(e) => setFormItem(e.target.value)} placeholder="Item" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input type="number" value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} placeholder="Quantity" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="Price" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input value={formBy} onChange={(e) => setFormBy(e.target.value)} placeholder="Recorded by" className="w-full rounded-xl border px-3 py-2 text-black" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl border text-black font-medium">Cancel</button>
              <button onClick={() => void addReportRow()} disabled={saving} className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${saving ? "opacity-60" : ""}`}>
                {saving ? "Saving..." : "Add Transaction"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {success ? <div className="text-sm text-green-700">{success}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead>
            <tr className="bg-[#FFDA03]">
              <th className="px-4 py-3 text-left font-semibold first:rounded-l-xl">When</th>
              <th className="px-4 py-3 text-left font-semibold">Action</th>
              <th className="px-4 py-3 text-left font-semibold">Item</th>
              <th className="px-4 py-3 text-left font-semibold">Quantity</th>
              <th className="px-4 py-3 text-left font-semibold">Price</th>
              <th className="px-4 py-3 text-left font-semibold last:rounded-r-xl">By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">Loading reports...</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">No report rows found.</td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.id_paraphernalia} className="bg-white shadow-sm">
                  <td className="px-4 py-3 rounded-l-xl whitespace-nowrap">{r.timestamp ? r.timestamp.slice(0, 19) : "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.action}</td>
                  <td className="px-4 py-3">{r.item}</td>
                  <td className="px-4 py-3">{r.quantity}</td>
                  <td className="px-4 py-3">{r.price}</td>
                  <td className="px-4 py-3 rounded-r-xl">{r.names || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
