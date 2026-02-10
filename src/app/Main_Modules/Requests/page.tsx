"use client";

import { useState } from "react";
import { Eye, Search } from "lucide-react";

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

  const filtered = mockRequests.filter((row) => {
    const matchesSearch =
      row.equipment.toLowerCase().includes(search.toLowerCase()) ||
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.jobId.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || row.status === statusFilter;

    return matchesSearch && matchesStatus;
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

      {/* Table */}
      <div className="relative overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm text-black">
          <thead className="bg-gray-50 border-b text-black">
            <tr>
              <th className="px-4 py-3 text-left">Timestamp & Date</th>
              <th className="px-4 py-3 text-left">Equipment</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Job ID</th>
              <th className="px-4 py-3 text-left">Detachment</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-center">View</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3 font-medium">{row.equipment}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{row.jobId}</td>
                <td className="px-4 py-3">{row.detachment}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-center">
                  <button className="p-2 rounded-lg hover:bg-gray-100">
                    <Eye className="w-5 h-5 text-gray-600" />
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <button className="px-4 py-1.5 text-xs rounded-lg bg-black text-white hover:bg-gray-800">
                    Manage
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  No matching requests found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
