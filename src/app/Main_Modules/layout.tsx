"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  Mail,
  Calendar,
  Users,
  Clock,
  BarChart3,
  Wallet,
  FileText,
  Search,
  ChevronLeft,
  Power,
} from "lucide-react";

/**
 * Collapsible Sidebar Component (Router-safe)
 * Theme color: #FFDA03
 *
 * FIX:
 * - Removed usePathname() to avoid runtime crash in environments
 *   where Next.js App Router hooks are unavailable or misconfigured.
 * - Active tab is resolved safely via window.location.pathname (client-only).
 *
 * Behavior:
 * - Tabs are clickable via next/link
 * - Active tab highlights based on current URL
 * - Logo hidden when collapsed
 * - Smooth Tailwind-based collapse animation
 * - Collapse toggle above Logout
 */
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>("");

  // Safely determine current path on client only
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  const menu = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutGrid },
    { name: "Inbox", href: "/dashboard/inbox", icon: Mail },
    { name: "Calendar", href: "/dashboard/calendar", icon: Calendar },
    { name: "Employees", href: "/dashboard/employees", icon: Users },
    { name: "Attendance", href: "/dashboard/attendance", icon: Clock },
    { name: "Performance", href: "/dashboard/performance", icon: BarChart3 },
    { name: "Payroll", href: "/dashboard/payroll", icon: Wallet },
    { name: "Leave Management", href: "/dashboard/leave", icon: FileText },
    { name: "Recruitment", href: "/dashboard/recruitment", icon: Search },
  ];

  return (
    <aside
      className={`h-screen bg-white border-r flex flex-col overflow-hidden
        transition-[width] duration-500 ease-in-out
        ${collapsed ? "w-20" : "w-64"}`}
    >
      {/* Logo (hidden when collapsed) */}
      <div
        className={`px-4 pt-6 pb-4 transition-all duration-300
          ${collapsed ? "opacity-0 -translate-x-4 h-0" : "opacity-100 translate-x-0"}`}
      >
        {!collapsed && (
          <img
            src="/logo.svg"
            alt="TeamHub"
            width={120}
            height={32}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-1">
        {menu.map((item) => {
          const active =
            currentPath === item.href ||
            (item.href !== "/" && currentPath.startsWith(item.href + "/"));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl
                transition-all duration-200
                ${active
                  ? "bg-[#FFDA03] text-black"
                  : "text-gray-600 hover:bg-gray-100"}`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span
                className={`text-sm whitespace-nowrap transition-all duration-300
                  ${collapsed ? "hidden opacity-0" : "block opacity-100"}`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="px-2 pb-4 space-y-2">
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
            text-gray-600 hover:bg-gray-100 transition-all"
        >
          <ChevronLeft
            className={`w-5 h-5 transition-transform duration-300
              ${collapsed ? "rotate-180" : ""}`}
          />
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>

        <div className="h-px bg-gray-200" />

        {/* Logout */}
        <button
          onClick={() => console.log("Logout")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
            text-red-600 hover:bg-red-50 transition-all"
        >
          <Power className="w-5 h-5" />
          {!collapsed && <span className="text-sm font-medium">Log Out</span>}
        </button>
      </div>
    </aside>
  );
}
