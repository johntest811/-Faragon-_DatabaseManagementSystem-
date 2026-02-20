"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, ArrowUpDown } from "lucide-react";
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

  // ================= SORT =================
  const sorted = [...filtered].sort((a, b) => {
    const dateKeys: (keyof InventoryRow)[] = ["date"];
    const numberKeys: (keyof InventoryRow)[] = ["quantity", "amount"];

    let result = 0;

    if (dateKeys.includes(sortKey)) {
      result =
        new Date(a[sortKey] as string).getTime() -
        new Date(b[sortKey] as string).getTime();
    } else if (numberKeys.includes(sortKey)) {
      result =
        Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
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

  function handleSort(key: keyof InventoryRow) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
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

      {error && <div className="text-red-600">{error}</div>}
      {success && <div className="text-green-600">{success}</div>}

      {/* TABLE */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-2">
          <thead>
  <tr className="bg-[#FFDA03]">
    {[
      ["date", "Date"],
      ["particular", "Particular"],
      ["quantity", "QTY"],
      ["amount", "Amount"],
      ["remarks", "Remarks"],
      ["firearms_ammunitions", "Firearms"],
      ["communications_equipment", "Communications"],
      ["furniture_and_fixtures", "Furniture"],
      ["office_equipments_sec_equipments", "Office Equip."],
      ["sec_equipments", "Sec Equip."],
      ["vehicle_and_motorcycle", "Vehicle"],
    ].map(([key, label], index, arr) => (
      <th
        key={key}
        className={`px-4 py-3 text-left font-semibold text-black
        ${index === 0 ? "rounded-l-xl" : ""}
        ${index === arr.length - 1 ? "rounded-r-xl" : ""}`}
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
                  <td className="px-4 py-3">{row.office_equipments_sec_equipments}</td>
                  <td className="px-4 py-3">{row.sec_equipments}</td>
                  <td className="px-4 py-3 rounded-r-xl">{row.vehicle_and_motorcycle}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
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