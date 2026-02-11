"use client";

import { useState } from "react";

export default function ReportsPage() {
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("name");

  return (
    <div className="rounded-3xl bg-white border p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-black">Reports</div>
          <div className="text-sm text-gray-500 mt-1">Coming soon.</div>
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
      </div>
    </div>
  );
}
