"use client";

import { useMemo, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";

type CategoryConfig = {
  key: "firearms" | "communications" | "furniture" | "office" | "sec" | "vehicle";
  label: string;
  nameField: keyof InventoryForm;
  qtyField: keyof InventoryForm;
  priceField: keyof InventoryForm;
  nameRowField: keyof InventoryRow;
  qtyRowField: keyof InventoryRow;
  priceRowField: keyof InventoryRow;
};

type InventoryRow = {
  id: string;
  date: string | null;
  particular: string | null;
  quanitity: number | null;
  amount: number | null;
  last_updated_at: string | null;
  remarks: string | null;
  firearms_name: string | null;
  firearms_qty: number | null;
  firearms_price: number | null;
  communications_name: string | null;
  communications_qty: number | null;
  communications_price: number | null;
  furniture_name: string | null;
  furniture_qty: number | null;
  furniture_price: number | null;
  office_name: string | null;
  office_qty: number | null;
  office_price: number | null;
  sec_name: string | null;
  sec_qty: number | null;
  sec_price: number | null;
  vehicle_name: string | null;
  vehicle_qty: number | null;
  vehicle_price: number | null;
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
  firearms_name: string;
  firearms_qty: string;
  firearms_price: string;
  communications_name: string;
  communications_qty: string;
  communications_price: string;
  furniture_name: string;
  furniture_qty: string;
  furniture_price: string;
  office_name: string;
  office_qty: string;
  office_price: string;
  sec_name: string;
  sec_qty: string;
  sec_price: string;
  vehicle_name: string;
  vehicle_qty: string;
  vehicle_price: string;
  remarks: string;
};

const EMPTY_FORM: InventoryForm = {
  date: "",
  particular: "",
  quanitity: "",
  firearms_name: "",
  firearms_qty: "",
  firearms_price: "",
  communications_name: "",
  communications_qty: "",
  communications_price: "",
  furniture_name: "",
  furniture_qty: "",
  furniture_price: "",
  office_name: "",
  office_qty: "",
  office_price: "",
  sec_name: "",
  sec_qty: "",
  sec_price: "",
  vehicle_name: "",
  vehicle_qty: "",
  vehicle_price: "",
  remarks: "",
};

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    key: "firearms",
    label: "Firearms & Ammunitions",
    nameField: "firearms_name",
    qtyField: "firearms_qty",
    priceField: "firearms_price",
    nameRowField: "firearms_name",
    qtyRowField: "firearms_qty",
    priceRowField: "firearms_price",
  },
  {
    key: "communications",
    label: "Communications Equipment",
    nameField: "communications_name",
    qtyField: "communications_qty",
    priceField: "communications_price",
    nameRowField: "communications_name",
    qtyRowField: "communications_qty",
    priceRowField: "communications_price",
  },
  {
    key: "furniture",
    label: "Furniture & Fixtures",
    nameField: "furniture_name",
    qtyField: "furniture_qty",
    priceField: "furniture_price",
    nameRowField: "furniture_name",
    qtyRowField: "furniture_qty",
    priceRowField: "furniture_price",
  },
  {
    key: "office",
    label: "Office Equip.",
    nameField: "office_name",
    qtyField: "office_qty",
    priceField: "office_price",
    nameRowField: "office_name",
    qtyRowField: "office_qty",
    priceRowField: "office_price",
  },
  {
    key: "sec",
    label: "Sec Equip.",
    nameField: "sec_name",
    qtyField: "sec_qty",
    priceField: "sec_price",
    nameRowField: "sec_name",
    qtyRowField: "sec_qty",
    priceRowField: "sec_price",
  },
  {
    key: "vehicle",
    label: "Vehicle & Motorcycle",
    nameField: "vehicle_name",
    qtyField: "vehicle_qty",
    priceField: "vehicle_price",
    nameRowField: "vehicle_name",
    qtyRowField: "vehicle_qty",
    priceRowField: "vehicle_price",
  },
];

function toNumber(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toMoney(value: number) {
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function totalFromPrices(formData: InventoryForm) {
  return (
    toNumber(formData.firearms_price) +
    toNumber(formData.communications_price) +
    toNumber(formData.furniture_price) +
    toNumber(formData.office_price) +
    toNumber(formData.sec_price) +
    toNumber(formData.vehicle_price)
  );
}

function totalFromRowPrices(row: InventoryRow) {
  return (
    (Number(row.firearms_price ?? 0) || 0) +
    (Number(row.communications_price ?? 0) || 0) +
    (Number(row.furniture_price ?? 0) || 0) +
    (Number(row.office_price ?? 0) || 0) +
    (Number(row.sec_price ?? 0) || 0) +
    (Number(row.vehicle_price ?? 0) || 0)
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formData, setFormData] = useState<InventoryForm>(EMPTY_FORM);

  async function loadData() {
    setLoading(true);
    setError("");

    const res = await supabase
      .from("inventory_fixed_asset")
      .select("*")
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

  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + totalFromRowPrices(r), 0), [rows]);

  const totalQuantity = useMemo(
    () =>
      rows.reduce(
        (sum, r) =>
          sum +
          (Number(r.firearms_qty ?? 0) || 0) +
          (Number(r.communications_qty ?? 0) || 0) +
          (Number(r.furniture_qty ?? 0) || 0) +
          (Number(r.office_qty ?? 0) || 0) +
          (Number(r.sec_qty ?? 0) || 0) +
          (Number(r.vehicle_qty ?? 0) || 0),
        0
      ),
    [rows]
  );

  const totalsByCategory = useMemo(
    () =>
      CATEGORY_CONFIGS.map((cfg) => {
        const quantity = rows.reduce((sum, row) => sum + (Number(row[cfg.qtyRowField] ?? 0) || 0), 0);
        const value = rows.reduce(
          (sum, row) =>
            sum + (Number(row[cfg.priceRowField] ?? 0) || 0),
          0
        );
        return { key: cfg.key, label: cfg.label, quantity, value };
      }),
    [rows]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  function rowToForm(row: InventoryRow): InventoryForm {
    return {
      date: row.date ?? "",
      particular: row.particular ?? "",
      quanitity: String(Number(row.quanitity ?? 0) || 0),
      firearms_name: row.firearms_name ?? "",
      firearms_qty: String(Number(row.firearms_qty ?? 0) || 0),
      firearms_price: String(Number(row.firearms_price ?? 0) || 0),
      communications_name: row.communications_name ?? "",
      communications_qty: String(Number(row.communications_qty ?? 0) || 0),
      communications_price: String(Number(row.communications_price ?? 0) || 0),
      furniture_name: row.furniture_name ?? "",
      furniture_qty: String(Number(row.furniture_qty ?? 0) || 0),
      furniture_price: String(Number(row.furniture_price ?? 0) || 0),
      office_name: row.office_name ?? "",
      office_qty: String(Number(row.office_qty ?? 0) || 0),
      office_price: String(Number(row.office_price ?? 0) || 0),
      sec_name: row.sec_name ?? "",
      sec_qty: String(Number(row.sec_qty ?? 0) || 0),
      sec_price: String(Number(row.sec_price ?? 0) || 0),
      vehicle_name: row.vehicle_name ?? "",
      vehicle_qty: String(Number(row.vehicle_qty ?? 0) || 0),
      vehicle_price: String(Number(row.vehicle_price ?? 0) || 0),
      remarks: row.remarks ?? "",
    };
  }

  function openEditModal(row: InventoryRow) {
    setEditingRowId(row.id);
    setFormData(rowToForm(row));
    setShowEditModal(true);
    setShowAddModal(false);
    setError("");
    setSuccess("");
  }

  function closeModals() {
    setShowAddModal(false);
    setShowEditModal(false);
    setEditingRowId(null);
    setFormData(EMPTY_FORM);
  }

  async function addRow() {
    if (!isAdmin || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const totalAmount = totalFromPrices(formData);
    const totalQuantity = toNumber(formData.quanitity);
    const nextGrandTotal = grandTotal + totalAmount;

    if (!formData.date || !formData.particular.trim()) {
      setSaving(false);
      setError("Date and Particular are required.");
      return;
    }

    const payload = {
      date: formData.date,
      particular: formData.particular.trim(),
      quanitity: totalQuantity,
      amount: totalAmount,
      remarks: formData.remarks.trim() || null,
      firearms_name: formData.firearms_name.trim() || null,
      firearms_qty: toNumber(formData.firearms_qty),
      firearms_price: toNumber(formData.firearms_price),
      communications_name: formData.communications_name.trim() || null,
      communications_qty: toNumber(formData.communications_qty),
      communications_price: toNumber(formData.communications_price),
      furniture_name: formData.furniture_name.trim() || null,
      furniture_qty: toNumber(formData.furniture_qty),
      furniture_price: toNumber(formData.furniture_price),
      office_name: formData.office_name.trim() || null,
      office_qty: toNumber(formData.office_qty),
      office_price: toNumber(formData.office_price),
      sec_name: formData.sec_name.trim() || null,
      sec_qty: toNumber(formData.sec_qty),
      sec_price: toNumber(formData.sec_price),
      vehicle_name: formData.vehicle_name.trim() || null,
      vehicle_qty: toNumber(formData.vehicle_qty),
      vehicle_price: toNumber(formData.vehicle_price),
      firearms_ammunitions: formData.firearms_name.trim() || null,
      communications_equipment: formData.communications_name.trim() || null,
      furniture_and_fixtures: formData.furniture_name.trim() || null,
      office_equipments_sec_equipments: formData.office_name.trim() || null,
      sec_equipments: formData.sec_name.trim() || null,
      vehicle_and_motorcycle: formData.vehicle_name.trim() || null,
      total_amount: totalAmount,
      grand_total: nextGrandTotal,
      last_updated_at: null,
    };

    const res = await supabase.from("inventory_fixed_asset").insert(payload);

    setSaving(false);
    if (res.error) {
      setError(res.error.message || "Failed to save inventory record");
      return;
    }

    setSuccess("Inventory record saved.");
    closeModals();
    await loadData();
  }

  async function updateRow() {
    if (!isAdmin || saving || !editingRowId) return;
    setSaving(true);
    setError("");
    setSuccess("");

    if (!formData.date || !formData.particular.trim()) {
      setSaving(false);
      setError("Date and Particular are required.");
      return;
    }

    const totalAmount = totalFromPrices(formData);
    const totalQuantity = toNumber(formData.quanitity);

    const payload = {
      date: formData.date,
      particular: formData.particular.trim(),
      quanitity: totalQuantity,
      amount: totalAmount,
      remarks: formData.remarks.trim() || null,
      firearms_name: formData.firearms_name.trim() || null,
      firearms_qty: toNumber(formData.firearms_qty),
      firearms_price: toNumber(formData.firearms_price),
      communications_name: formData.communications_name.trim() || null,
      communications_qty: toNumber(formData.communications_qty),
      communications_price: toNumber(formData.communications_price),
      furniture_name: formData.furniture_name.trim() || null,
      furniture_qty: toNumber(formData.furniture_qty),
      furniture_price: toNumber(formData.furniture_price),
      office_name: formData.office_name.trim() || null,
      office_qty: toNumber(formData.office_qty),
      office_price: toNumber(formData.office_price),
      sec_name: formData.sec_name.trim() || null,
      sec_qty: toNumber(formData.sec_qty),
      sec_price: toNumber(formData.sec_price),
      vehicle_name: formData.vehicle_name.trim() || null,
      vehicle_qty: toNumber(formData.vehicle_qty),
      vehicle_price: toNumber(formData.vehicle_price),
      firearms_ammunitions: formData.firearms_name.trim() || null,
      communications_equipment: formData.communications_name.trim() || null,
      furniture_and_fixtures: formData.furniture_name.trim() || null,
      office_equipments_sec_equipments: formData.office_name.trim() || null,
      sec_equipments: formData.sec_name.trim() || null,
      vehicle_and_motorcycle: formData.vehicle_name.trim() || null,
      total_amount: totalAmount,
      last_updated_at: new Date().toISOString(),
    };

    const res = await supabase.from("inventory_fixed_asset").update(payload).eq("id", editingRowId);

    setSaving(false);
    if (res.error) {
      setError(res.error.message || "Failed to update inventory record");
      return;
    }

    setSuccess("Inventory record updated.");
    closeModals();
    await loadData();
  }

  return (
    <>
      <section className="bg-white rounded-3xl border p-6 space-y-5">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="text-lg font-semibold text-black">Logistics • Fixed Asset Inventory</div>
            <div className="text-sm text-gray-500">Per-category quantity and price tracking for all fixed assets.</div>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Total Quantity</div>
            <div className="text-xl font-semibold text-black">{totalQuantity.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Total Amount (Sum of Rows)</div>
            <div className="text-xl font-semibold text-black">₱ {toMoney(grandTotal)}</div>
          </div>
          <div className="rounded-2xl border bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Grand Total</div>
            <div className="text-xl font-semibold text-black">₱ {toMoney(grandTotal)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {totalsByCategory.map((item) => (
            <div key={item.key} className="rounded-2xl border bg-white p-4">
              <div className="text-sm font-medium text-gray-700">{item.label}</div>
              <div className="mt-2 text-xs text-gray-500">Qty: {item.quantity.toLocaleString()}</div>
              <div className="text-base font-semibold text-black">₱ {toMoney(item.value)}</div>
            </div>
          ))}
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

        <div className="relative overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm text-black min-w-[1500px] border-separate border-spacing-y-2">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#FFDA03]">
                <th className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap rounded-l-xl">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">Particular</th>
                {CATEGORY_CONFIGS.map((cfg) => (
                  <th key={cfg.key} className="px-4 py-3 text-left font-semibold text-black min-w-[190px] whitespace-nowrap">
                    {cfg.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold text-black whitespace-nowrap">Row Total</th>
                <th className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">Last Updated</th>
                <th className={`px-4 py-3 text-left font-semibold text-black whitespace-nowrap ${isAdmin ? "" : "rounded-r-xl"}`}>Remarks</th>
                {isAdmin ? <th className="px-4 py-3 text-center font-semibold text-black whitespace-nowrap rounded-r-xl">Action</th> : null}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 12 : 11} className="px-4 py-8 text-center text-gray-500">
                    <LoadingCircle label="Loading inventory..." className="py-2" />
                  </td>
                </tr>
              ) : paginated.length ? (
                paginated.map((row) => (
                  <tr key={row.id} className="bg-white shadow-sm transition hover:shadow-md">
                    <td className="px-4 py-3 whitespace-nowrap rounded-l-xl">{row.date || "—"}</td>
                    <td className="px-4 py-3">{row.particular || "—"}</td>
                    {CATEGORY_CONFIGS.map((cfg) => {
                      const name = (row[cfg.nameRowField] as string | null) ?? "";
                      const qty = Number(row[cfg.qtyRowField] ?? 0) || 0;
                      const price = Number(row[cfg.priceRowField] ?? 0) || 0;
                      return (
                        <td key={`${row.id}-${cfg.key}-cell`} className="px-4 py-3 align-top">
                          <div className="text-xs text-gray-500">Name</div>
                          <div className="font-medium text-black truncate" title={name || "—"}>{name || "—"}</div>
                          <div className="mt-1 text-xs text-gray-600">
                            Qty: <span className="font-semibold text-black">{qty.toLocaleString()}</span>
                          </div>
                          <div className="text-xs text-gray-600">
                            Price: <span className="font-semibold text-black">₱ {toMoney(price)}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">₱ {toMoney(totalFromRowPrices(row))}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatTimestamp(row.last_updated_at)}</td>
                    <td className={`px-4 py-3 ${isAdmin ? "" : "rounded-r-xl"}`}>{row.remarks || "—"}</td>
                    {isAdmin ? (
                      <td className="px-4 py-3 text-center rounded-r-xl">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50"
                          onClick={() => openEditModal(row)}
                        >
                          Edit
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 12 : 11} className="px-4 py-8 text-center text-gray-500">No records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border bg-gray-50 px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-700">Grand Total (Bottom)</div>
          <div className="text-lg font-semibold text-black">₱ {toMoney(grandTotal)}</div>
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

      {showAddModal || showEditModal ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={closeModals}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-5xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-black">
              {showEditModal ? "Edit Inventory Row" : "Insert Inventory Information"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="date" className="border rounded-xl px-3 py-2" value={formData.date} onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))} />
              <input placeholder="Particular" className="border rounded-xl px-3 py-2" value={formData.particular} onChange={(e) => setFormData((prev) => ({ ...prev, particular: e.target.value }))} />
              <input
                type="number"
                min="0"
                placeholder="Total Quantity"
                className="border rounded-xl px-3 py-2"
                value={formData.quanitity}
                onChange={(e) => setFormData((prev) => ({ ...prev, quanitity: e.target.value }))}
              />
              <div className="border rounded-xl px-3 py-2 bg-gray-50 text-sm text-gray-700">
                Row Total (sum of all prices):
                <span className="ml-2 font-semibold text-black">₱ {toMoney(totalFromPrices(formData))}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {CATEGORY_CONFIGS.map((cfg) => {
                return (
                  <div key={cfg.key} className="rounded-2xl border bg-gray-50 p-4 space-y-3">
                    <div className="font-medium text-gray-900">{cfg.label}</div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Kind / Name</label>
                      <input
                        type="text"
                        className="w-full border rounded-xl px-3 py-2"
                        value={formData[cfg.nameField]}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [cfg.nameField]: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full border rounded-xl px-3 py-2"
                          value={formData[cfg.qtyField]}
                          onChange={(e) => setFormData((prev) => ({ ...prev, [cfg.qtyField]: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Price</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full border rounded-xl px-3 py-2"
                          value={formData[cfg.priceField]}
                          onChange={(e) => setFormData((prev) => ({ ...prev, [cfg.priceField]: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <input placeholder="Remarks" className="border rounded-xl px-3 py-2 w-full" value={formData.remarks} onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))} />

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={closeModals} className="px-4 py-2 rounded-xl border">Cancel</button>
              <button
                onClick={showEditModal ? updateRow : addRow}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#FFDA03] font-semibold text-black disabled:opacity-60"
              >
                {saving ? "Saving..." : showEditModal ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}