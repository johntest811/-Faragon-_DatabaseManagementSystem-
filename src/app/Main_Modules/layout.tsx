"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../Client/SupabaseClients";
import { useAuthRole, useMyModules } from "../Client/useRbac";
import {
  LayoutGrid,
  Users,
  Repeat2,
  UserX,
  Archive,
  Shield,
  Settings,
  Trash2,
  Bell,
  Search,
  ChevronLeft,
  Power,
} from "lucide-react";

type LayoutProps = Readonly<{ children: React.ReactNode }>;

const ALL_MENU = [
  { key: "dashboard", name: "Dashboard", href: "/Main_Modules/Dashboard/", icon: LayoutGrid },
  { key: "employees", name: "Employees", href: "/Main_Modules/Employees/", icon: Users },
  { key: "reassign", name: "Reassign", href: "/Main_Modules/Reassign/", icon: Repeat2 },
  { key: "retired", name: "Retired", href: "/Main_Modules/Retired/", icon: UserX },
  { key: "archive", name: "Archive", href: "/Main_Modules/Archive/", icon: Archive },
  { key: "trash", name: "Trash", href: "/Main_Modules/Trash/", icon: Trash2 },
  { key: "roles", name: "Roles", href: "/Main_Modules/Roles/", icon: Shield },
  { key: "settings", name: "Settings", href: "/Main_Modules/Settings/", icon: Settings },
] as const;

function titleFromPath(pathname: string) {
  const clean = (pathname || "/").replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "Dashboard";
  return last
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MainModulesLayout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const { role: sessionRole } = useAuthRole();
  const { modules: myModules } = useMyModules();

  function hasLegacySession() {
    try {
      return Boolean(localStorage.getItem("adminSession"));
    } catch {
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function ensureSession() {
      if (hasLegacySession()) return;

      const { data } = await supabase.auth.getSession();
      if (!cancelled && !data.session) window.location.href = "/Login/";
    }
    ensureSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session && !hasLegacySession()) window.location.href = "/Login/";
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "adminSession") ensureSession();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const pageTitle = useMemo(() => titleFromPath(pathname), [pathname]);

  const allowedKeys = useMemo(() => {
    const fromDb = new Set(myModules.map((m) => m.module_key));
    if (fromDb.size) {
      if (sessionRole === "superadmin" || sessionRole === "admin") {
        fromDb.add("reassign");
        fromDb.add("retired");
      }
      return fromDb;
    }

    // Fallback (before migration is applied): keep UI usable.
    if (!sessionRole) return new Set<string>();
    if (sessionRole === "superadmin") return new Set(ALL_MENU.map((m) => m.key));
    if (sessionRole === "admin") {
      return new Set(["dashboard", "employees", "reassign", "retired", "archive", "trash", "settings", "roles"]);
    }
    return new Set(["dashboard", "employees", "archive"]);
  }, [sessionRole, myModules]);

  const menu = useMemo(
    () => ALL_MENU.filter((m) => allowedKeys.has(m.key)),
    [allowedKeys]
  );

  useEffect(() => {
    if (!pathname || !sessionRole) return;
    const allowed = ALL_MENU
      .filter((m) => allowedKeys.has(m.key))
      .some((m) => pathname === m.href || pathname.startsWith(m.href));
    if (!allowed) {
      router.replace("/Main_Modules/Dashboard/");
    }
  }, [pathname, sessionRole, allowedKeys, router]);

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
                <div className="mt-1 text-[11px] text-gray-500">
                  Role: {sessionRole ?? "—"}
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {menu.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(item.href);

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
              try {
                localStorage.removeItem("adminSession");
              } catch {
                // ignore
              }

              supabase.auth.signOut().finally(() => {
                window.location.href = "/Login/";
              });
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

                {/* <button
                  type="button"
                  className="h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                  aria-label="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button> */}

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
