"use client";
import { useState } from "react";

const data = [
  {
    id: 1,
    name: "Gas Kitting",
    model: "G-7893",
    type: "IE Project Items",
    personnel: "22 House Store",
    amount: "1 pcs",
    detachment: "HQ",
    status: "Activated",
  },
  {
    id: 2,
    name: "Condet",
    model: "Co-7898",
    type: "IE Project Items",
    personnel: "HQ Main Store",
    amount: "3 pcs",
    detachment: "HQ",
    status: "Activated",
  },
  {
    id: 3,
    name: "Condet",
    model: "G-7893",
    type: "IE Project Items",
    personnel: "HQ Main Store",
    amount: "5 pcs",
    detachment: "HQ",
    status: "Invitation",
  },
];

export default function Logistics() {
  const [showFilter, setShowFilter] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-100">
      

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="bg-white rounded-xl shadow p-4">
          {/* Top Controls */}
          <div className="flex justify-between items-center mb-4">
            <div className="relative w-80">
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              <input
                placeholder="Search Item"
                className="pl-10 pr-3 py-2 border rounded-lg w-full"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
              >
                ➕ Add Item
              </button>
              <button
                onClick={() => setShowFilter(true)}
                className="flex items-center gap-2 border px-4 py-2 rounded-lg"
              >
                ⚙ Filter
              </button>
            </div>
          </div>

          {/* Table */}
          <table className="w-full border-separate border-spacing-y-2">
            <thead className="text-left text-sm text-gray-500">
              <tr>
                <th className="px-3"><input type="checkbox" /></th>
                <th className="px-3">Item Name</th>
                <th className="px-3">Image</th>
                <th className="px-3">Model</th>
                <th className="px-3">Type</th>
                <th className="px-3">Personnel</th>
                <th className="px-3">Amount</th>
                <th className="px-3">Detachment</th>
                <th className="px-3">Status</th>
                <th className="px-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {data.map(item => (
                <tr key={item.id} className="bg-white shadow-sm rounded-lg">
                  <td className="px-3 py-2"><input type="checkbox" /></td>
                  <td className="px-3 py-2">{item.name}</td>
                  <td className="px-3 py-2">
                    <img src="/laptop.png" className="w-10 h-10 rounded" />
                  </td>
                  <td className="px-3 py-2">{item.model}</td>
                  <td className="px-3 py-2">{item.type}</td>
                  <td className="px-3 py-2">{item.personnel}</td>
                  <td className="px-3 py-2">{item.amount}</td>
                  <td className="px-3 py-2">{item.detachment}</td>
                  <td className="px-3 py-2 text-xs text-green-600 break-all">
                    {item.status}
                  </td>
                  <td className="px-3 py-2 flex gap-2">
                    <button className="bg-yellow-500 text-white p-2 rounded">👁</button>
                    <button className="bg-blue-600 text-white p-2 rounded">✏</button>
                    <button className="bg-red-600 text-white p-2 rounded">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
            <div>
              Showing 
              <select className="border rounded px-2 py-1 mx-2">
                <option>10</option>
                <option>25</option>
              </select>
              entries
            </div>

            <div className="flex gap-2">
              <button className="border px-2 py-1 rounded">&lt;</button>
              <button className="border px-2 py-1 rounded bg-blue-600 text-white">1</button>
              <button className="border px-2 py-1 rounded">2</button>
              <button className="border px-2 py-1 rounded">3</button>
              <button className="border px-2 py-1 rounded">&gt;</button>
            </div>
          </div>
        </div>

        {/* FILTER MODAL */}
        {showFilter && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg w-80">
              <h3 className="font-semibold mb-4">Filter</h3>

              <label className="block text-sm mb-1">Detachment</label>
              <select className="w-full border rounded px-2 py-1 mb-3">
                <option>HQ Main Store</option>
                <option>22 House Store</option>
                <option>Tado House Store</option>
              </select>

              <label className="block text-sm mb-1">Category</label>
              <div className="flex gap-3 mb-4">
                <label><input type="radio" name="cat" /> Baton</label>
                <label><input type="radio" name="cat" /> Radio</label>
                <label><input type="radio" name="cat" /> Gun</label>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowFilter(false)} className="border px-3 py-1 rounded">Cancel</button>
                <button className="bg-blue-600 text-white px-3 py-1 rounded">Apply</button>
              </div>
            </div>
          </div>
        )}

        {/* ADD ITEM MODAL */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center overflow-auto">
            <div className="bg-white p-6 rounded-lg w-[560px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">Add New Item</h3>
                <button onClick={() => setShowAdd(false)}>✕</button>
              </div>

              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" /> Group Item</label>
                  <label className="flex items-center gap-1"><input type="checkbox" /> Consumable Item</label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs">Type *</label>
                    <select className="w-full border rounded p-2">
                      <option>Choose type</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs">Item Name *</label>
                    <input className="w-full border rounded p-2" placeholder="Enter item name" />
                  </div>

                  <div>
                    <label className="text-xs">Image *</label>
                    <input type="file" className="w-full border rounded p-2" />
                  </div>

                  <div>
                    <label className="text-xs">Status *</label>
                    <select className="w-full border rounded p-2">
                      <option>Choose Status</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs">Serial Number *</label>
                    <input className="w-full border rounded p-2" placeholder="Enter serial number" />
                  </div>

                  <div>
                    <label className="text-xs">Item Number *</label>
                    <input className="w-full border rounded p-2" placeholder="Enter item number" />
                  </div>

                  <div>
                    <label className="text-xs">Date of Purchased *</label>
                    <input type="date" className="w-full border rounded p-2" />
                  </div>

                  <div>
                    <label className="text-xs">Store *</label>
                    <select className="w-full border rounded p-2">
                      <option>Choose Store</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs">Department *</label>
                    <select className="w-full border rounded p-2">
                      <option>Choose department</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs">Category *</label>
                    <select className="w-full border rounded p-2">
                      <option>Choose category</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs">Warranty *</label>
                    <input type="file" className="w-full border rounded p-2" />
                  </div>

                  <div>
                    <label className="text-xs">Manufacturer *</label>
                    <select className="w-full border rounded p-2">
                      <option>Choose manufacturer</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs">Description *</label>
                  <textarea className="w-full border rounded p-2" placeholder="Input description"></textarea>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <input type="checkbox" />
                  <span>Fixed Asset</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => setShowAdd(false)} className="px-4 py-1 border rounded">Cancel</button>
                <button className="px-4 py-1 bg-blue-600 text-white rounded">Add</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
