"use client";

import { useMemo, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";

type InventoryRow = {
  id: string;
  date: string | null;
  particular: string | null;
  quanitity: number | null;
  amount: number | null;
  remarks: string | null;
  firearms_ammunitions: string | null;
  communications_equipment: string | null;
  furniture_and_fixtures: string | null;
  office_equipments_sec_equipments: string | null;
  sec_equipments: string | null;
  vehicle_and_motorcycle: string | null;
  total_amount: number | null;
  grand_total: number | null;
};

type InventoryForm = {
  date: string;
  particular: string;
  quanitity: string;
  amount: string;
  remarks: string;
  firearms_ammunitions: string;
  communications_equipment: string;
  furniture_and_fixtures: string;
  office_equipments_sec_equipments: string;
  sec_equipments: string;
  vehicle_and_motorcycle: string;
};

const EMPTY_FORM: InventoryForm = {
  date: "",
  particular: "",
  quanitity: "",
  amount: "",
  remarks: "",
  firearms_ammunitions: "",
  communications_equipment: "",
  furniture_and_fixtures: "",
  office_equipments_sec_equipments: "",
  sec_equipments: "",
  vehicle_and_motorcycle: "",
};

function toNumber(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function LogisticsInventoryPage() {
  const { role } = useAuthRole();
  const isAdmin = role === "admin" || role === "superadmin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formData, setFormData] = useState<InventoryForm>(EMPTY_FORM);

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await supabase
      .from("inventory_fixed_asset")
      .select(
        "id, date, particular, quanitity, amount, remarks, firearms_ammunitions, communications_equipment, furniture_and_fixtures, office_equipments_sec_equipments, sec_equipments, vehicle_and_motorcycle, total_amount, grand_total"
      )
      .order("date", { ascending: false })
      .limit(1000);

    if (res.error) {
      setError(res.error.message || "Failed to load inventory");
      setRows([]);
    } else {
      setRows((res.data as InventoryRow[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("realtime:inventory-fixed-asset-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_fixed_asset" }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const grandTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.total_amount ?? 0) || 0), 0),
    [rows]
  );

  const totalQuantity = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.quanitity ?? 0) || 0), 0),
    [rows]
  );

  const totalAmountPreview = useMemo(() => {
    const qty = toNumber(formData.quanitity);
    const amount = toNumber(formData.amount);
    return qty * amount;
  }, [formData.quanitity, formData.amount]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  async function addRow() {
    if (!isAdmin || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const qty = toNumber(formData.quanitity);
    const amount = toNumber(formData.amount);
    const totalAmount = qty * amount;
    const nextGrandTotal = grandTotal + totalAmount;

    if (!formData.date || !formData.particular.trim()) {
      setSaving(false);
      setError("Date and Particular are required.");
      return;
    }

    const payload = {
      date: formData.date,
      particular: formData.particular.trim(),
      quanitity: qty,
      amount,
      remarks: formData.remarks.trim() || null,
      firearms_ammunitions: formData.firearms_ammunitions.trim() || null,
      communications_equipment: formData.communications_equipment.trim() || null,
      furniture_and_fixtures: formData.furniture_and_fixtures.trim() || null,
      office_equipments_sec_equipments: formData.office_equipments_sec_equipments.trim() || null,
      sec_equipments: formData.sec_equipments.trim() || null,
      vehicle_and_motorcycle: formData.vehicle_and_motorcycle.trim() || null,
      total_amount: totalAmount,
      grand_total: nextGrandTotal,
    };

    const res = await supabase.from("inventory_fixed_asset").insert(payload);

    setSaving(false);
    if (res.error) {
      setError(res.error.message || "Failed to save inventory record");
      return;
    }

    setSuccess("Inventory record saved.");
    setShowAddModal(false);
    setFormData(EMPTY_FORM);
    await loadData();
  }

  return (
    <>
      <section className="bg-white rounded-3xl border p-6 space-y-5">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="text-lg font-semibold text-black">Logistics • Fixed Asset Inventory</div>
            <div className="text-sm text-gray-500">Connected to inventory_fixed_asset table in Supabase.</div>
          </div>

          {isAdmin ? (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
            >
              Insert Information
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Total Quantity</div>
            <div className="text-xl font-semibold text-black">{totalQuantity.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Total Amount (Sum of Rows)</div>
            <div className="text-xl font-semibold text-black">{grandTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Grand Total</div>
            <div className="text-xl font-semibold text-black">{grandTotal.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl">
          <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
            <Search className="w-5 h-5 text-black" />
          </div>
          <input
            placeholder="Search inventory..."
            className="flex-1 outline-none text-sm text-black"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {error ? <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-2xl border bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        <div className="relative overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm text-black">
            <thead className="bg-gray-100 border-b">
              <tr>
                {["Date", "Particular", "QTY", "Amount", "Total Amount", "Remarks", "Firearms Ammunitions", "Communications Equipment", "Furniture & Fixtures", "Office Equip.", "Sec Equip.", "Vehicle & Motorcycle"].map((label) => (
                  <th key={label} className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">{label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                </tr>
              ) : paginated.length ? (
                paginated.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">{row.date || "—"}</td>
                    <td className="px-4 py-3">{row.particular || "—"}</td>
                    <td className="px-4 py-3">{row.quanitity ?? 0}</td>
                    <td className="px-4 py-3">{row.amount ?? 0}</td>
                    <td className="px-4 py-3 font-medium">{row.total_amount ?? 0}</td>
                    <td className="px-4 py-3">{row.remarks || "—"}</td>
                    <td className="px-4 py-3">{row.firearms_ammunitions || "—"}</td>
                    <td className="px-4 py-3">{row.communications_equipment || "—"}</td>
                    <td className="px-4 py-3">{row.furniture_and_fixtures || "—"}</td>
                    <td className="px-4 py-3">{row.office_equipments_sec_equipments || "—"}</td>
                    <td className="px-4 py-3">{row.sec_equipments || "—"}</td>
                    <td className="px-4 py-3">{row.vehicle_and_motorcycle || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">No records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border bg-gray-50 px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-700">Grand Total (Bottom)</div>
          <div className="text-lg font-semibold text-black">{grandTotal.toLocaleString()}</div>
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

      {showAddModal ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-4xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-black">Insert Inventory Information</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="date" className="border rounded-xl px-3 py-2" value={formData.date} onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))} />
              <input placeholder="Particular" className="border rounded-xl px-3 py-2" value={formData.particular} onChange={(e) => setFormData((prev) => ({ ...prev, particular: e.target.value }))} />

              <input type="number" placeholder="QTY" className="border rounded-xl px-3 py-2" value={formData.quanitity} onChange={(e) => setFormData((prev) => ({ ...prev, quanitity: e.target.value }))} />
              <input type="number" placeholder="Amount" className="border rounded-xl px-3 py-2" value={formData.amount} onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))} />

              <input placeholder="Firearms Ammunitions" className="border rounded-xl px-3 py-2" value={formData.firearms_ammunitions} onChange={(e) => setFormData((prev) => ({ ...prev, firearms_ammunitions: e.target.value }))} />
              <input placeholder="Communications Equipment" className="border rounded-xl px-3 py-2" value={formData.communications_equipment} onChange={(e) => setFormData((prev) => ({ ...prev, communications_equipment: e.target.value }))} />

              <input placeholder="Furniture & Fixtures" className="border rounded-xl px-3 py-2" value={formData.furniture_and_fixtures} onChange={(e) => setFormData((prev) => ({ ...prev, furniture_and_fixtures: e.target.value }))} />
              <input placeholder="Office Equip." className="border rounded-xl px-3 py-2" value={formData.office_equipments_sec_equipments} onChange={(e) => setFormData((prev) => ({ ...prev, office_equipments_sec_equipments: e.target.value }))} />

              <input placeholder="Sec Equip." className="border rounded-xl px-3 py-2" value={formData.sec_equipments} onChange={(e) => setFormData((prev) => ({ ...prev, sec_equipments: e.target.value }))} />
              <input placeholder="Vehicle & Motorcycle" className="border rounded-xl px-3 py-2" value={formData.vehicle_and_motorcycle} onChange={(e) => setFormData((prev) => ({ ...prev, vehicle_and_motorcycle: e.target.value }))} />

              <input placeholder="Remarks" className="border rounded-xl px-3 py-2 md:col-span-2" value={formData.remarks} onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))} />
            </div>

            <div className="rounded-xl border bg-gray-50 px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-gray-600">Auto Total Amount (QTY × Amount)</div>
              <div className="font-semibold text-black">{totalAmountPreview.toLocaleString()}</div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl border">Cancel</button>
              <button onClick={addRow} disabled={saving} className="px-4 py-2 rounded-xl bg-[#FFDA03] font-semibold text-black disabled:opacity-60">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}