"use client";

import { useEffect, useState } from "react";
import { Eye, Search, LayoutGrid, Table } from "lucide-react";

type RequestRow = {
  date: string;
  equipment: string;
  type: string;
  name: string;
  jobId: string;
  detachment: string;
  status: string;
};

const mockRequests: RequestRow[] = [
  {
    date: "1/16/2026 - 12:25:36",
    equipment: "Handheld Radio",
    type: "Electronics",
    name: "Juan Dela Cruz",
    jobId: "JOB-1001",
    detachment: "HQ",
    status: "Pending",
  },
  {
    date: "1/17/2026 - 09:40:12",
    equipment: "Flashlight",
    type: "Utility",
    name: "Maria Santos",
    jobId: "JOB-1002",
    detachment: "Gate 1",
    status: "In Progress",
  },
  {
    date: "1/17/2026 - 11:15:02",
    equipment: "Metal Detector",
    type: "Security",
    name: "Pedro Cruz",
    jobId: "JOB-1003",
    detachment: "Warehouse",
    status: "Reserved",
  },
  {
    date: "1/18/2026 - 08:10:55",
    equipment: "CCTV Camera",
    type: "Surveillance",
    name: "Ana Lopez",
    jobId: "JOB-1004",
    detachment: "HQ",
    status: "Completed",
  },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pending: "bg-yellow-100 text-yellow-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Reserved: "bg-purple-100 text-purple-700",
    Completed: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`px-3 py-1 text-xs rounded-full font-medium ${
        styles[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

export default function LogisticsRequestsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("newest");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("logistics:requests:viewMode");
      if (saved === "table" || saved === "grid") setViewMode(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("logistics:requests:viewMode", viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  function parseRequestDateMs(value: string) {
    const [datePart, timePart] = value.split(" - ").map((s) => s.trim());
    if (!datePart) return 0;

    const [mStr, dStr, yStr] = datePart.split("/");
    const m = Number(mStr);
    const d = Number(dStr);
    const y = Number(yStr);

    let hh = 0;
    let mm = 0;
    let ss = 0;
    if (timePart) {
      const [hhStr, mmStr, ssStr] = timePart.split(":");
      hh = Number(hhStr);
      mm = Number(mmStr);
      ss = Number(ssStr);
    }

    const dt = new Date(y, m - 1, d, hh, mm, ss);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  const filtered = mockRequests.filter((row) => {
    const matchesSearch =
      row.equipment.toLowerCase().includes(search.toLowerCase()) ||
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.jobId.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || row.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "newest") {
      return parseRequestDateMs(b.date) - parseRequestDateMs(a.date);
    }

    // "Expiring Licenses" doesn't exist for requests; treat status urgency as a proxy.
    const rank = (s: string) =>
      s === "Pending" ? 0 : s === "In Progress" ? 1 : s === "Reserved" ? 2 : 3;
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return parseRequestDateMs(b.date) - parseRequestDateMs(a.date);
  });

  return (
    <div className="rounded-3xl bg-white border p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="text-lg font-semibold text-gray-900">
          Logistics • Requests
        </div>
        <div className="text-sm text-gray-500">
          Track and manage logistics requests
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment, name or Job ID..."
            className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
        </div>

        <div className="flex items-center gap-2">
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
              viewMode === "grid" ? "bg-[#FFDA03]" : "bg-white"
            }`}
            aria-label="Grid view"
            type="button"
          >
            <LayoutGrid className="w-5 h-5 text-black" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
              viewMode === "table" ? "bg-[#FFDA03]" : "bg-white"
            }`}
            aria-label="Table view"
            type="button"
          >
            <Table className="w-5 h-5 text-black" />
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm text-black"
        >
          <option value="All">All Status</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Reserved">Reserved</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((row, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-black truncate">{row.equipment}</div>
                  <div className="text-xs text-gray-500 truncate">{row.type} • {row.detachment}</div>
                  <div className="mt-2 text-xs text-gray-500">{row.date}</div>
                </div>
                <StatusBadge status={row.status} />
              </div>

              <div className="mt-4 text-sm text-black">
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-gray-500">Job ID: {row.jobId}</div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center" title="View">
                  <Eye className="w-5 h-5 text-gray-700" />
                </button>
                <button className="px-4 py-2 text-xs rounded-xl bg-black text-white hover:bg-gray-800">Manage</button>
              </div>
            </div>
          ))}

          {sorted.length === 0 && (
            <div className="col-span-full py-10 text-center text-gray-400">No matching requests found</div>
          )}
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm text-black border-separate border-spacing-y-2">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#FFDA03]">
                <th className="px-4 py-3 text-left font-semibold text-black first:rounded-l-xl">Timestamp & Date</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Equipment</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Job ID</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Detachment</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-black">View</th>
                <th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Action</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} className="bg-white shadow-sm hover:shadow-md transition">
                  <td className="px-4 py-3 rounded-l-xl">{row.date}</td>
                  <td className="px-4 py-3 font-medium">{row.equipment}</td>
                  <td className="px-4 py-3">{row.type}</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">{row.jobId}</td>
                  <td className="px-4 py-3">{row.detachment}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button className="h-9 w-9 rounded-xl border bg-white inline-flex items-center justify-center hover:bg-gray-50">
                      <Eye className="w-5 h-5 text-gray-700" />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center rounded-r-xl">
                    <button className="px-4 py-2 text-xs rounded-xl bg-black text-white hover:bg-gray-800">Manage</button>
                  </td>
                </tr>
              ))}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-400">
                    No matching requests found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
