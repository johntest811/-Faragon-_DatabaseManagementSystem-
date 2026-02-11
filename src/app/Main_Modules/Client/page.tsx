"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUpDown } from "lucide-react";

type ClientRow = {
  id: string;
  contractNo: string;
  cluster: number;
  clientName: string;
  area: string;
  project: string;
  start: string;
  end: string;
  manpower: number;
  guards: number;
  status: "Active" | "Inactive";
};

const DATA: ClientRow[] = [
  {
    id: "1",
    contractNo: "2025-01-04",
    cluster: 1,
    clientName: "Beauty Elements Venture, Inc.",
    area: "BEVI Head Office",
    project: "Manufacture",
    start: "1/1/2026",
    end: "12/31/2026",
    manpower: 2,
    guards: 2,
    status: "Active",
  },
  {
    id: "2",
    contractNo: "2025-01-03",
    cluster: 3,
    clientName: "Beauty Elements Venture, Inc.",
    area: "One Standpoint",
    project: "Manufacture",
    start: "1/23/2026",
    end: "1/22/2027",
    manpower: 22,
    guards: 1,
    status: "Active",
  },
  {
    id: "3",
    contractNo: "2023-02-02",
    cluster: 1,
    clientName: "Broadway Centrum Commercial Center Admin, Inc.",
    area: "Broadway Centrum Mall",
    project: "Mall",
    start: "3/1/2024",
    end: "7/31/2027",
    manpower: 4,
    guards: 5,
    status: "Active",
  },
];

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("name");
  const [sortKey, setSortKey] = useState<keyof ClientRow>("clientName");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const pageSize = 4;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const filtered = DATA.filter((item) =>
    Object.values(item)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function parseMdY(value: string) {
    const [mRaw, dRaw, yRaw] = String(value || "").split("/");
    const m = Number(mRaw);
    const d = Number(dRaw);
    const y = Number(yRaw);
    if (!m || !d || !y) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  }

  function applySortPreset(next: typeof sortBy) {
    if (next === "name") {
      setSortKey("clientName");
      setSortAsc(true);
      return;
    }
    if (next === "newest") {
      setSortKey("start");
      setSortAsc(false);
      return;
    }
    if (next === "expiring") {
      setSortKey("end");
      setSortAsc(true);
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const numericKeys: (keyof ClientRow)[] = ["cluster", "manpower", "guards"];
    const dateKeys: (keyof ClientRow)[] = ["start", "end"];

    const av = a[sortKey];
    const bv = b[sortKey];

    let cmp = 0;
    if (numericKeys.includes(sortKey)) {
      cmp = Number(av) - Number(bv);
    } else if (dateKeys.includes(sortKey)) {
      const at = parseMdY(String(av)) ?? 0;
      const bt = parseMdY(String(bv)) ?? 0;
      cmp = at - bt;
    } else {
      const as = String(av ?? "").toLowerCase();
      const bs = String(bv ?? "").toLowerCase();
      cmp = as.localeCompare(bs);
    }

    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  function handleSort(key: keyof ClientRow) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-5">
      {/* Search + Sort */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl w-full">
          <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
            <Search className="w-5 h-5 text-black" />
          </div>
          <input
            placeholder="Search by contract, client, area, etc..."
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
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FFDA03]">
              {[
                ["contractNo", "Contract No."],
                ["cluster", "Cluster"],
                ["clientName", "Client Name"],
                ["area", "Specific Area"],
                ["project", "Project Name"],
                ["start", "Contract Start"],
                ["end", "Contract End"],
                ["manpower", "Contracted Manpower"],
                ["guards", "No. of Deployed Guards"],
                ["status", "Status"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key as keyof ClientRow)}
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
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td
                        key={j}
                        className={`px-4 py-4 ${j === 0 ? "rounded-l-xl" : ""} ${j === 9 ? "rounded-r-xl" : ""}`}
                      >
                        <div className="h-4 bg-gray-200 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : paginated.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => router.push("/Main_Modules/Clients/" + row.id)}
                    className="bg-white shadow-sm hover:shadow-md cursor-pointer transition"
                  >
                    <td className="px-4 py-3 rounded-l-xl">{row.contractNo}</td>
                    <td className="px-4 py-3">{row.cluster}</td>
                    <td className="px-4 py-3 font-medium">
                      {row.clientName}
                    </td>
                    <td className="px-4 py-3">{row.area}</td>
                    <td className="px-4 py-3">{row.project}</td>
                    <td className="px-4 py-3">{row.start}</td>
                    <td className="px-4 py-3">{row.end}</td>
                    <td className="px-4 py-3 text-center">
                      {row.manpower}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.guards}
                    </td>
                    <td className="px-4 py-3 rounded-r-xl">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          row.status === "Active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {row.status}
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
