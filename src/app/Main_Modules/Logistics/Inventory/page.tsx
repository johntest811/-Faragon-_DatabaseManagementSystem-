"use client";

import { useMemo, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";

type InventoryRow = {
  id: string;
  date: string;
  particular: string;
  quantity: number;
  amount: number;
  remarks: string;
  firearms_ammunitions: string;
  communications_equipment: string;
  furniture_and_fixtures: string;
  office_equipments_sec_equipments: string;
  sec_equipments: string;
  vehicle_and_motorcycle: string;
};

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
  const [sortKey, setSortKey] = useState<keyof InventoryRow>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const pageSize = 10;

  const [formData, setFormData] = useState<Omit<InventoryRow, "id">>({
    date: "",
    particular: "",
    quantity: 0,
    amount: 0,
    remarks: "",
    firearms_ammunitions: "",
    communications_equipment: "",
    furniture_and_fixtures: "",
    office_equipments_sec_equipments: "",
    sec_equipments: "",
    vehicle_and_motorcycle: "",
  });

  // ================= LOAD DATA =================
  async function loadData() {
    setLoading(true);
    setError("");

    const res = await supabase
      .from("inventory_fixed_asset")
      .select("*")
      .order("date", { ascending: false });

    if (res.error) {
      setError(res.error.message);
      setRows([]);
    } else {
      setRows((res.data as InventoryRow[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // ================= INSERT =================
  async function addRow() {
    if (!isAdmin) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const res = await supabase
      .from("inventory_fixed_asset")
      .insert([formData]);

    setSaving(false);

    if (res.error) {
      setError(res.error.message);
      return;
    }

    setSuccess("Inserted successfully.");
    setShowAddModal(false);
    await loadData();
  }

  // ================= SEARCH =================
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).join(" ").toLowerCase().includes(q)
    );
  }, [rows, search]);

  // ================= SORT (LOGIC KEPT) =================
  const sorted = [...filtered].sort((a, b) => {
    const dateKeys: (keyof InventoryRow)[] = ["date"];
    const numberKeys: (keyof InventoryRow)[] = ["quantity", "amount"];

    let result = 0;

    if (dateKeys.includes(sortKey)) {
      result =
        new Date(a[sortKey] as string).getTime() -
        new Date(b[sortKey] as string).getTime();
    } else if (numberKeys.includes(sortKey)) {
      result = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
    } else {
      result = String(a[sortKey] ?? "")
        .toLowerCase()
        .localeCompare(String(b[sortKey] ?? "").toLowerCase());
    }

    return sortAsc ? result : -result;
  });

  // ================= PAGINATION =================
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = sorted.slice(
    (pageClamped - 1) * pageSize,
    pageClamped * pageSize
  );


  return (
  <>
    <section className="bg-white rounded-3xl border p-6 space-y-5">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <div className="text-lg font-semibold text-black">
            Logistics • Fixed Asset Inventory
          </div>
          <div className="text-sm text-gray-500">
            Manage and track fixed assets.
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[#FFDA03] rounded-xl font-semibold"
          >
            Insert Information
          </button>
        )}
      </div>

      {/* SEARCH */}
      <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl">
        <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
          <Search className="w-5 h-5 text-black" />
        </div>
        <input
          placeholder="Search inventory..."
          className="flex-1 outline-none text-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* TABLE */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-2">
          <thead>
            <tr className="bg-[#FFDA03]">
              {[
                "Date",
                "Particular",
                "QTY",
                "Amount",
                "Remarks",
                "Firearms",
                "Communications",
                "Furniture",
                "Office Equip.",
                "Sec Equip.",
                "Vehicle",
              ].map((label, i, arr) => (
                <th
                  key={label}
                  className={`px-4 py-3 text-left font-semibold text-black
                  ${i === 0 ? "rounded-l-xl" : ""}
                  ${i === arr.length - 1 ? "rounded-r-xl" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="text-center py-8">
                  Loading...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-8">
                  No records found.
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr
                  key={row.id}
                  className="bg-white shadow-sm hover:shadow-md transition"
                >
                  <td className="px-4 py-3 rounded-l-xl">{row.date}</td>
                  <td className="px-4 py-3">{row.particular}</td>
                  <td className="px-4 py-3">{row.quantity}</td>
                  <td className="px-4 py-3">{row.amount}</td>
                  <td className="px-4 py-3">{row.remarks}</td>
                  <td className="px-4 py-3">{row.firearms_ammunitions}</td>
                  <td className="px-4 py-3">{row.communications_equipment}</td>
                  <td className="px-4 py-3">{row.furniture_and_fixtures}</td>
                  <td className="px-4 py-3">
                    {row.office_equipments_sec_equipments}
                  </td>
                  <td className="px-4 py-3">{row.sec_equipments}</td>
                  <td className="px-4 py-3 rounded-r-xl">
                    {row.vehicle_and_motorcycle}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="flex justify-between items-center text-sm">
        <span>
          Page {pageClamped} of {totalPages}
        </span>
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

    {/* INSERT MODAL (UNCHANGED) */}
    {showAddModal && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4">
          <h2 className="text-lg font-semibold">
            Insert Inventory Information
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              className="border rounded-xl px-3 py-2"
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
            />

            <input
              placeholder="Particular"
              className="border rounded-xl px-3 py-2"
              value={formData.particular}
              onChange={(e) =>
                setFormData({ ...formData, particular: e.target.value })
              }
            />

            <input
              type="number"
              placeholder="Quantity"
              className="border rounded-xl px-3 py-2"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  quantity: Number(e.target.value),
                })
              }
            />

            <input
              type="number"
              placeholder="Amount"
              className="border rounded-xl px-3 py-2"
              value={formData.amount}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  amount: Number(e.target.value),
                })
              }
            />

            <input
              placeholder="Remarks"
              className="border rounded-xl px-3 py-2 col-span-2"
              value={formData.remarks}
              onChange={(e) =>
                setFormData({ ...formData, remarks: e.target.value })
              }
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 rounded-xl border"
            >
              Cancel
            </button>

            <button
              onClick={addRow}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#FFDA03] font-semibold"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);

 
}