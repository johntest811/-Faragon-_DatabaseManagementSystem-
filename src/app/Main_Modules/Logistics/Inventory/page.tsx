"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUpDown } from "lucide-react";

type InventoryRow = {
  id: string;
  detachment: string;
  equipment: string;
  control: string;
  serial: string;
  model: string;
  assigned: string;
  status: "Active" | "Available" | "Issued";
};

const DATA: InventoryRow[] = [
  {
    id: "1",
    detachment: "HQ",
    equipment: "Handheld Radio",
    control: "CTRL-001",
    serial: "SN-98321",
    model: "Motorola XPR 3300",
    assigned: "Juan Dela Cruz",
    status: "Active",
  },
  {
    id: "2",
    detachment: "Warehouse",
    equipment: "CCTV Camera",
    control: "CTRL-014",
    serial: "SN-55521",
    model: "Hikvision DS-2CD",
    assigned: "Unassigned",
    status: "Available",
  },
  {
    id: "3",
    detachment: "HQ",
    equipment: "Metal Detector",
    control: "CTRL-033",
    serial: "SN-77231",
    model: "Garrett Pro",
    assigned: "Pedro Santos",
    status: "Issued",
  },
  {
    id: "4",
    detachment: "Gate 1",
    equipment: "Flashlight",
    control: "CTRL-102",
    serial: "SN-33922",
    model: "Streamlight",
    assigned: "Maria Lopez",
    status: "Active",
  },
];

export default function LogisticsInventoryPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("name");
  const [sortKey, setSortKey] = useState<keyof InventoryRow>("equipment");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const pageSize = 4;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const filtered = DATA.filter((item) => {
    const matchesSearch = Object.values(item)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function applySortPreset(next: typeof sortBy) {
    if (next === "name") {
      setSortKey("equipment");
      setSortAsc(true);
      return;
    }
    if (next === "newest") {
      setSortKey("id");
      setSortAsc(false);
      return;
    }
    if (next === "expiring") {
      // No license concept in inventory; treat "Issued" as most urgent.
      setSortKey("status");
      setSortAsc(true);
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "expiring" && sortKey === "status") {
      const rank = (s: InventoryRow["status"]) => (s === "Issued" ? 0 : s === "Active" ? 1 : 2);
      const d = rank(a.status) - rank(b.status);
      if (d !== 0) return d;
      return a.equipment.localeCompare(b.equipment);
    }

    const valA = a[sortKey].toString().toLowerCase();
    const valB = b[sortKey].toString().toLowerCase();
    const d = valA.localeCompare(valB);
    return sortAsc ? d : -d;
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function handleSort(key: keyof InventoryRow) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-5">
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
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Available">Available</option>
            <option value="Issued">Issued</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FFDA03]">
              {[
                ["detachment", "Detachment"],
                ["equipment", "Equipment"],
                ["control", "Control #"],
                ["serial", "Serial"],
                ["model", "Model"],
                ["assigned", "Assigned To"],
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
              : paginated.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => router.push("/Main_Modules/Logistics/Inventory/" + item.id)}
                    className="bg-white shadow-sm hover:shadow-md cursor-pointer transition"
                  >
                    <td className="px-4 py-3 rounded-l-xl">{item.detachment}</td>
                    <td className="px-4 py-3 font-medium">{item.equipment}</td>
                    <td className="px-4 py-3">{item.control}</td>
                    <td className="px-4 py-3">{item.serial}</td>
                    <td className="px-4 py-3">{item.model}</td>
                    <td className="px-4 py-3">{item.assigned}</td>
                    <td className="px-4 py-3 rounded-r-xl">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.status === "Active"
                            ? "bg-green-100 text-green-700"
                            : item.status === "Issued"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-600"
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
          Page {page} of {totalPages}
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
