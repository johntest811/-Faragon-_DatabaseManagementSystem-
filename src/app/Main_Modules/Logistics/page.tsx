"use client";

import Link from "next/link";

export default function LogisticsPage() {
  const cards = [
    {
      title: "Inventory",
      description: "Track issued items, supplies, and stocks.",
      href: "/Main_Modules/Logistics/Inventory/",
    },
    {
      title: "Requests",
      description: "Manage logistics requests and approvals.",
      href: "/Main_Modules/Logistics/Requests/",
    },
    {
      title: "Reports",
      description: "Coming soon.",
      href: "/Main_Modules/Logistics/Reports/",
    },
    {
      title: "Clients",
      description: "Manage client information and details.",
      href: "/Main_Modules/Logistics/Client/",
    },
    {
      title: "Permission",
      description: "Manage user permissions and access control.",
      href: "/Main_Modules/Logistics/Permission/",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white border p-6">
        <div className="text-lg font-semibold text-gray-900">Logistics</div>
        <div className="text-sm text-gray-500 mt-1">
          New module scaffolding — choose a section to continue.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="rounded-3xl border bg-white p-5 hover:bg-gray-50 transition-colors"
          >
            <div className="text-sm font-semibold text-gray-900">{c.title}</div>
            <div className="text-xs text-gray-500 mt-1">{c.description}</div>
            <div className="text-xs text-blue-600 mt-4">Open</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
