"use client";

import { useRouter } from "next/navigation";

const MOCK = {
  detachment: "HQ",
  equipment: "Handheld Radio",
  control: "CTRL-001",
  serial: "SN-98321",
  model: "Motorola XPR 3300",
  assigned: "Juan Dela Cruz",
  status: "Active",
  issuedDate: "2025-01-12",
  remarks: "Working condition. Battery replaced recently.",
};

export default function InventoryDetailClient({ id }: { id: string }) {
  const router = useRouter();

  return (
    <section className="bg-white rounded-3xl border p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-lg font-semibold">Inventory Details</div>
          <div className="text-sm text-gray-500">Item ID: {id}</div>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-100"
        >
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          ["Detachment", MOCK.detachment],
          ["Equipment", MOCK.equipment],
          ["Control #", MOCK.control],
          ["Serial", MOCK.serial],
          ["Model", MOCK.model],
          ["Assigned To", MOCK.assigned],
          ["Status", MOCK.status],
          ["Issued Date", MOCK.issuedDate],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border rounded-2xl p-4 bg-gray-50 space-y-1"
          >
            <div className="text-xs text-gray-500">{label}</div>
            <div className="font-medium text-gray-900">{value}</div>
          </div>
        ))}

        <div className="sm:col-span-2 border rounded-2xl p-4 bg-gray-50">
          <div className="text-xs text-gray-500">Remarks</div>
          <div className="font-medium text-gray-900">{MOCK.remarks}</div>
        </div>
      </div>
    </section>
  );
}
