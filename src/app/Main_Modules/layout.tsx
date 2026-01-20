"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  Users,
  Shield,
  Settings,
  Bell,
  Search,
  ChevronLeft,
  Power,
} from "lucide-react";

type LayoutProps = Readonly<{ children: React.ReactNode }>;

function titleFromPath(pathname: string) {
  const clean = (pathname || "/").replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "Dashboard";
  return last
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MainModulesLayout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  const pageTitle = useMemo(() => titleFromPath(currentPath), [currentPath]);

  const menu = [
    { name: "Dashboard", href: "/Main_Modules/Dashboard/", icon: LayoutGrid },
    { name: "Employees", href: "/Main_Modules/Employees/", icon: Users },
    { name: "Roles", href: "/Main_Modules/Roles/", icon: Shield },
    { name: "Settings", href: "/Main_Modules/Settings/", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside
        className={`bg-white border-r flex flex-col overflow-hidden
          transition-[width] duration-500 ease-in-out
          ${collapsed ? "w-20" : "w-72"}`}
      >
        <div className="px-5 pt-6 pb-4">
          <div
            className={`transition-all duration-300
              ${collapsed ? "opacity-0 -translate-x-4 h-0" : "opacity-100 translate-x-0"}`}
          >
            {!collapsed && (
              <div className="leading-tight">
                <div className="text-sm font-semibold text-gray-900">Faragon Security</div>
                <div className="text-sm font-semibold text-gray-900">Agency, Inc.</div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {menu.map((item) => {
            const active =
              currentPath === item.href ||
              (item.href !== "/" && currentPath.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl
                  transition-all duration-200
                  ${active ? "bg-[#FFDA03] text-black" : "text-gray-700 hover:bg-yellow-100"}`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span
                  className={`text-sm font-medium whitespace-nowrap transition-all duration-300
                    ${collapsed ? "hidden opacity-0" : "block opacity-100"}`}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4 space-y-2">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
              text-gray-700 hover:bg-gray-100 transition-all"
          >
            <ChevronLeft
              className={`w-5 h-5 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
            />
            {!collapsed && <span className="text-sm">Collapse</span>}
          </button>

          <div className="h-px bg-gray-200" />

          <button
            onClick={() => {
              localStorage.removeItem("adminSession");
              window.location.href = "/Login/";
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
              text-red-600 hover:bg-red-50 transition-all"
          >
            <Power className="w-5 h-5" />
            {!collapsed && <span className="text-sm font-medium">Log Out</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Navigation */}
        <header className="bg-gray-50 sticky top-0 z-10">
          <div className="px-6 pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-gray-900">{pageTitle}</div>
                <div className="text-xs text-gray-500">
                  Dashboard / {pageTitle}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2 bg-white border rounded-full px-4 py-2 shadow-sm">
                  <Search className="w-4 h-4 text-gray-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search Anything"
                    className="outline-none text-sm w-64"
                  />
                </div>

                <button
                  type="button"
                  className="h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                  aria-label="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  className="h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
                </button>

                <div className="h-10 w-10 rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center">
                  <span className="text-xs font-semibold text-gray-600">AD</span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 pb-4 pt-4 md:hidden">
            <div className="flex items-center gap-2 bg-white border rounded-full px-4 py-2 shadow-sm">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Anything"
                className="outline-none text-sm w-full"
              />
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 pb-10 pt-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
