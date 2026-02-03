'use client';

import { useState } from 'react';
import { Search, MoreVertical } from 'lucide-react';

const mockData = [
  {
    detachment: 'HQ',
    equipment: 'Handheld Radio',
    control: 'CTRL-001',
    serial: 'SN-98321',
    model: 'Motorola XPR 3300',
    assigned: 'Juan Dela Cruz',
    remarks: 'Active',
  },
  {
    detachment: 'Warehouse',
    equipment: 'CCTV Camera',
    control: 'CTRL-014',
    serial: 'SN-55521',
    model: 'Hikvision DS-2CD',
    assigned: 'Unassigned',
    remarks: 'Available',
  },
  {
    detachment: 'HQ',
    equipment: 'Metal Detector',
    control: 'CTRL-033',
    serial: 'SN-77231',
    model: 'Garrett Pro',
    assigned: 'Pedro Santos',
    remarks: 'Issued',
  },
  {
    detachment: 'Gate 1',
    equipment: 'Flashlight',
    control: 'CTRL-102',
    serial: 'SN-33922',
    model: 'Streamlight',
    assigned: 'Maria Lopez',
    remarks: 'Active',
  },
];

export default function ItemsPage() {
  const [search, setSearch] = useState('');

  const filteredData = mockData.filter((row) =>
    Object.values(row).some((val) =>
      val.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold">All Items</h1>
            <p className="text-sm text-gray-500">Logistics Inventory</p>
          </div>
          <button className="px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800">
            + Add Item
          </button>
        </div>

        {/* Search Card */}
        <div className="mb-4">
          <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-xl border">
            <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center shrink-0">
              <Search className="w-5 h-5 text-black" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500">Search Inventory</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by equipment, serial, assigned, etc..."
                className="w-full bg-transparent outline-none text-sm font-semibold text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2">Detachment</th>
                <th className="px-3 py-2">Equipment</th>
                <th className="px-3 py-2">Control #</th>
                <th className="px-3 py-2">Serial</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Assigned To</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredData.map((row, index) => (
                <tr
                  key={index}
                  className="border-b hover:bg-gray-50 transition"
                >
                  <td className="px-3 py-2">{row.detachment}</td>
                  <td className="px-3 py-2 font-medium">
                    {row.equipment}
                  </td>
                  <td className="px-3 py-2">{row.control}</td>
                  <td className="px-3 py-2">{row.serial}</td>
                  <td className="px-3 py-2">{row.model}</td>
                  <td className="px-3 py-2">{row.assigned}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        row.remarks === 'Active'
                          ? 'bg-green-100 text-green-700'
                          : row.remarks === 'Issued'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {row.remarks}
                    </span>
                  </td>

                  <td className="px-3 py-2 text-center">
                    <button className="px-3 py-1 text-xs rounded-lg bg-black text-white hover:bg-gray-800 flex items-center gap-1 justify-center">
                      <MoreVertical className="w-4 h-4" />
                      Action
                    </button>
                  </td>
                </tr>
              ))}

              {filteredData.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-6 text-gray-400"
                  >
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
