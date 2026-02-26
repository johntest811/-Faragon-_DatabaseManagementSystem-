"use client";

import { useState, useMemo } from "react";
import { Bell, Menu } from "lucide-react";

type RecordType = {
  id: number;
  name: string;
  age: number;
  birthdate: string;
  licensure: string;
  address: string;
  phone: string;
  email: string;
};

export default function PermissionPage() {
  const adminName = "John the Admin";
  const managingUser = "Jay the Biller";

  // Mock Database Records
  const allRecords: RecordType[] = [
    {
      id: 1,
      name: "Alice Smith",
      age: 34,
      birthdate: "05/15/1987",
      licensure: "LN-123456",
      address: "123 Main St",
      phone: "09123456789",
      email: "alice@email.com",
    },
    {
      id: 2,
      name: "John Davis",
      age: 41,
      birthdate: "08/22/1980",
      licensure: "LN-987654",
      address: "456 Oak St",
      phone: "09987654321",
      email: "john@email.com",
    },
    {
      id: 3,
      name: "Emily Brown",
      age: 29,
      birthdate: "12/10/1992",
      licensure: "LN-456789",
      address: "789 Pine St",
      phone: "09876543211",
      email: "emily@email.com",
    },
  ];

  // ================= STATE =================

  const [restrictRows, setRestrictRows] = useState(true);
  const [allowedRecords, setAllowedRecords] = useState<number[]>([1, 2, 3]);

  const [restrictColumns, setRestrictColumns] = useState(true);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    "name",
    "age",
    "birthdate",
    "licensure",
  ]);

  // ================= FILTER LOGIC =================

  const filteredRecords = useMemo(() => {
    if (!restrictRows) return allRecords;
    return allRecords.filter((r) => allowedRecords.includes(r.id));
  }, [restrictRows, allowedRecords]);

  function toggleColumn(col: string) {
    if (visibleColumns.includes(col)) {
      setVisibleColumns(visibleColumns.filter((c) => c !== col));
    } else {
      setVisibleColumns([...visibleColumns, col]);
    }
  }

  function toggleRecord(id: number) {
    if (allowedRecords.includes(id)) {
      setAllowedRecords(allowedRecords.filter((r) => r !== id));
    } else {
      setAllowedRecords([...allowedRecords, id]);
    }
  }

  function saveChanges() {
    alert("Permissions saved (static demo)");
  }

  // ================= UI =================

  return (
    <div className="min-h-screen bg-gray-100 flex">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r p-5 space-y-6">
        <div className="font-semibold text-lg">
          Faragon Security Agency, Inc.
        </div>

        <nav className="space-y-3 text-sm">
          <div>Dashboard</div>
          <div className="bg-yellow-400 px-3 py-2 rounded-lg font-medium">
            Employees
          </div>
          <div>Recruitment</div>
          <div>Performance</div>
          <div>Payroll</div>
          <div>Attendance</div>
          <div>Management</div>
          <div>Settings</div>
        </nav>

        <div className="text-red-500 text-sm pt-10">Log Out</div>
      </aside>

      {/* MAIN */}
      <div className="flex-1">

        {/* HEADER */}
        <div className="flex justify-between items-center bg-white px-6 py-4 border-b">
          <div>
            <div className="text-sm text-gray-500">Access Permission</div>
            <div className="font-semibold">Admin Access</div>
          </div>

          <div className="flex items-center gap-4">
            <Bell className="w-5 h-5" />
            <Menu className="w-5 h-5" />
            <div className="text-sm font-medium">{adminName}</div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-6 grid grid-cols-3 gap-6">

          {/* LEFT PANEL */}
          <div className="col-span-2 space-y-6">

            <div>
              <h2 className="text-lg font-semibold">
                Edit Permissions for {managingUser}
              </h2>
              <div className="mt-2 bg-gray-200 px-3 py-2 rounded">
                🔒 Restricted Access Permissions
              </div>
            </div>

            {/* ROW LEVEL */}
            <div className="bg-white p-5 rounded-xl border space-y-4">
              <div className="font-semibold">Row-Level Security</div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={restrictRows}
                  onChange={() => setRestrictRows(!restrictRows)}
                />
                Restrict viewing to specific records only
              </label>

              <div className="text-sm font-medium">Allowed Records:</div>

              <div className="space-y-2">
                {allRecords.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedRecords.includes(r.id)}
                      onChange={() => toggleRecord(r.id)}
                    />
                    {r.name}
                  </label>
                ))}
              </div>

              <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
                Assign Records
              </button>
            </div>

            {/* COLUMN LEVEL */}
            <div className="bg-white p-5 rounded-xl border space-y-4">
              <div className="font-semibold">Column-Level Security</div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={restrictColumns}
                  onChange={() => setRestrictColumns(!restrictColumns)}
                />
                Restrict viewing to selected columns only
              </label>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  "name",
                  "age",
                  "birthdate",
                  "licensure",
                  "address",
                  "phone",
                  "email",
                ].map((col) => (
                  <label key={col} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col)}
                      onChange={() => toggleColumn(col)}
                    />
                    {col.replace("_", " ")}
                  </label>
                ))}
              </div>

              <div className="text-xs text-orange-600">
                Permissions will limit access to selected columns only.
              </div>
            </div>
          </div>

          {/* PREVIEW PANEL */}
          <div className="bg-white p-5 rounded-xl border space-y-4">
            <div className="font-semibold">
              Preview of Limited Table View
            </div>

            <table className="w-full text-sm border">
              <thead>
                <tr className="bg-gray-100">
                  {visibleColumns.map((col) => (
                    <th key={col} className="border px-2 py-1 text-left">
                      {col.replace("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.id}>
                    {visibleColumns.map((col) => (
                      <td key={col} className="border px-2 py-1">
                        {(r as any)[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="text-xs text-gray-500">
              Showing {filteredRecords.length} of {filteredRecords.length} records
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button className="px-4 py-2 border rounded-lg text-sm">
                Cancel
              </button>
              <button
                onClick={saveChanges}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
              >
                Save Changes
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}