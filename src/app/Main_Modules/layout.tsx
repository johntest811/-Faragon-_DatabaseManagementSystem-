"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../Client/SupabaseClients";
import { useAuthRole, useMyModules } from "../Client/useRbac";
import { useRealtimeRefresh } from "../Client/useRealtimeRefresh";
import {
  LayoutGrid,
  Users,
  Repeat2,
  UserMinus,
  UserX,
  Archive,
  Shield,
  Settings,
  Trash2,
  ChevronLeft,
  ChevronDown,
  Truck,
  Power,
  ClipboardList,
  Activity,
  CreditCard,
  Package,
  FileText,
  ClipboardCheck,
  CircleAlert,
} from "lucide-react";

type LayoutProps = Readonly<{ children: React.ReactNode }>;

function emailBadge(email: string | null) {
  const value = (email ?? "").trim();
  if (!value) return { label: "No Email", className: "bg-red-100 text-red-700" };
  if (value.toLowerCase().endsWith("@gmail.com")) return { label: "Gmail", className: "bg-emerald-100 text-emerald-800" };
  return { label: "Email", className: "bg-blue-100 text-blue-800" };
}

const ALL_MENU = [
  { key: "dashboard", name: "Dashboard", href: "/Main_Modules/Dashboard/", icon: LayoutGrid },
  { key: "employees", name: "Employees", href: "/Main_Modules/Employees/", icon: Users },
  { key: "reassign", name: "Reassigned", href: "/Main_Modules/Reassign/", icon: Repeat2 },
  { key: "resigned", name: "Resigned", href: "/Main_Modules/Resigned/", icon: UserMinus },
  { key: "retired", name: "Retired", href: "/Main_Modules/Retired/", icon: UserX },
  { key: "archive", name: "Archive", href: "/Main_Modules/Archive/", icon: Archive },
  { key: "logistics", name: "Logistics", href: "/Main_Modules/Logistics/", icon: Truck },
  { key: "trash", name: "Trash", href: "/Main_Modules/Trash/", icon: Trash2 },
  { key: "roles", name: "Roles", href: "/Main_Modules/Roles/", icon: Shield },
  { key: "audit", name: "Audit", href: "/Main_Modules/Audit/", icon: ClipboardList },
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
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [workforceOpen, setWorkforceOpen] = useState(false);
  const [workforceFlyoutOpen, setWorkforceFlyoutOpen] = useState(false);
  const [logisticsOpen, setLogisticsOpen] = useState(false);
  const [logisticsFlyoutOpen, setLogisticsFlyoutOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [expiringOpen, setExpiringOpen] = useState(false);
  const [adminAlertOpen, setAdminAlertOpen] = useState(false);
  const [activityCount, setActivityCount] = useState(0);
  const [activityMissingTable, setActivityMissingTable] = useState(false);
  const [resendingKey, setResendingKey] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<
    Array<{ id: string; created_at: string; actor_email: string | null; action: string; page: string | null }>
  >([]);
  const [expiringCount, setExpiringCount] = useState(0);
  function badgeText(n: number) {
    if (!Number.isFinite(n) || n <= 0) return "";
    return n > 9 ? "9+" : String(n);
  }
  const [expiringRows, setExpiringRows] = useState<
    Array<{
      applicant_id: string;
      first_name: string | null;
      last_name: string | null;
      license_type: string;
      expires_on: string;
      days_until_expiry: number;
      sent_count?: number;
      last_sent_at?: string | null;
    }>
  >([]);
  const [expiringEmailByApplicantId, setExpiringEmailByApplicantId] = useState<Record<string, string | null>>({});
  const { role: sessionRole } = useAuthRole();
  const { modules: myModules } = useMyModules();
  useRealtimeRefresh(["applicants"]);

  const api = (globalThis as unknown as { electronAPI?: any }).electronAPI;

  useEffect(() => {
    // Initialize "last seen" timestamp for activity notifications.
    try {
      const key = "auditLastSeenAt";
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Log navigation events to audit (desktop only).
    let cancelled = false;
    async function logNav() {
      if (!api?.audit?.logEvent) return;
      try {
        const session = await supabase.auth.getSession();
        if (cancelled) return;
        await api.audit.logEvent({
          actor_user_id: session.data.session?.user?.id ?? null,
          actor_email: session.data.session?.user?.email ?? null,
          action: "NAVIGATE",
          page: pathname,
        });
      } catch {
        // ignore
      }
    }
    if (pathname) logNav();
    return () => {
      cancelled = true;
    };
  }, [api, pathname]);

  useEffect(() => {
    // Close dropdowns when clicking outside.
    function onDocDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest?.("[data-activity-menu]") || t.closest?.("[data-expiring-menu]") || t.closest?.("[data-admin-alert-menu]")) return;
      setActivityOpen(false);
      setExpiringOpen(false);
      setAdminAlertOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  async function refreshActivity() {
    if (!api?.audit?.getRecent) return;
    try {
      const key = "auditLastSeenAt";
      const sinceIso = (() => {
        try {
          return localStorage.getItem(key) || "";
        } catch {
          return "";
        }
      })();

      const res = await api.audit.getRecent({ limit: 8, sinceIso });
      setActivityMissingTable(Boolean(res?.missingTable));
      setActivityCount(Number(res?.count ?? 0));

      const recentRes = await api.audit.getRecent({ limit: 8 });
      setRecentActivity((recentRes?.rows ?? []) as any);
    } catch {
      // ignore
    }
  }

  async function refreshExpiring() {
    if (!api?.notifications?.getExpiringSummary) return;
    try {
      const res = await api.notifications.getExpiringSummary({ limit: 50 });
      setExpiringCount(Number((res as any)?.pendingCount ?? res?.count ?? 0));
      const sortedRows = ([...((res?.rows ?? []) as any[])]).sort((a, b) => {
        const toMs = (value: unknown) => {
          const d = new Date(String(value ?? ""));
          const t = d.getTime();
          return Number.isFinite(t) ? t : 0;
        };

        const aTime =
          toMs(a?.last_sent_at) ||
          toMs(a?.created_at) ||
          toMs(a?.updated_at) ||
          toMs(a?.expires_on);
        const bTime =
          toMs(b?.last_sent_at) ||
          toMs(b?.created_at) ||
          toMs(b?.updated_at) ||
          toMs(b?.expires_on);

        return bTime - aTime;
      });
      setExpiringRows(sortedRows as any);

      try {
        const ids = Array.from(new Set((res?.rows ?? []).map((r: any) => String(r.applicant_id || "")).filter(Boolean)));
        if (!ids.length) {
          setExpiringEmailByApplicantId({});
        } else {
          const { data, error } = await supabase
            .from("applicants")
            .select("applicant_id, client_email")
            .in("applicant_id", ids);
          if (error) {
            setExpiringEmailByApplicantId({});
          } else {
            const map: Record<string, string | null> = {};
            for (const row of (data as any[]) || []) {
              map[String(row.applicant_id)] = (row.client_email ?? null) as string | null;
            }
            setExpiringEmailByApplicantId(map);
          }
        }
      } catch {
        setExpiringEmailByApplicantId({});
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshActivity();
    refreshExpiring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const fromParam = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return new URLSearchParams(window.location.search).get("from");
    } catch {
      return null;
    }
  }, [pathname]);

  const menuActivePath = useMemo(() => {
    const isDetails = pathname.startsWith("/Main_Modules/Employees/details");
    if (!isDetails) return pathname;

    const from = fromParam;
    if (from && from.startsWith("/Main_Modules/")) return from;

    try {
      const last = sessionStorage.getItem("lastModulePath");
      if (last && last.startsWith("/Main_Modules/")) return last;
    } catch {
      // ignore
    }

    return "/Main_Modules/Employees/";
  }, [pathname, fromParam]);

  useEffect(() => {
    // Track the last non-details page so we can keep the sidebar highlight stable
    // when opening the shared /Employees/details view.
    if (!pathname) return;
    if (pathname.startsWith("/Main_Modules/Employees/details")) return;
    try {
      sessionStorage.setItem("lastModulePath", pathname);
    } catch {
      // ignore
    }
  }, [pathname]);

  function hasLegacySession() {
    try {
      return Boolean(localStorage.getItem("adminSession"));
    } catch {
      return false;
    }
  }

  function handleLogout() {
    try {
      localStorage.removeItem("adminSession");
    } catch {
      // ignore
    }

    try {
      sessionStorage.setItem("showLogoutSplash", "1");
    } catch {
      // ignore
    }

    router.replace("/Login/");
  }

  function requestLogout() {
    if (logoutBusy) return;
    setLogoutConfirmOpen(true);
  }

  function confirmLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutConfirmOpen(false);
    handleLogout();
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
      // Backwards-compatibility: older deployments used the `reassign` module key
      // to grant access to the Resigned page.
      if (fromDb.has("reassign") && !fromDb.has("resigned")) fromDb.add("resigned");

      if (sessionRole === "superadmin" || sessionRole === "admin") {
        fromDb.add("reassign");
        fromDb.add("resigned");
        fromDb.add("retired");
        fromDb.add("audit");
      }
      return fromDb;
    }

    // Fallback (before migration is applied): keep UI usable.
    if (!sessionRole) return new Set<string>();
    if (sessionRole === "superadmin") return new Set(ALL_MENU.map((m) => m.key));
    if (sessionRole === "admin") {
      return new Set(["dashboard", "employees", "reassign", "resigned", "retired", "archive", "logistics", "trash", "settings", "roles", "audit"]);
    }
    return new Set(["dashboard", "employees", "archive"]);
  }, [sessionRole, myModules]);

  const menu = useMemo(
    () => ALL_MENU.filter((m) => allowedKeys.has(m.key)),
    [allowedKeys]
  );

  useEffect(() => {
    if (!pathname || !sessionRole) return;
    const baseAllowed = ALL_MENU
      .filter((m) => allowedKeys.has(m.key))
      .some((m) => pathname === m.href || pathname.startsWith(m.href));
    const logisticsChildAllowed =
      allowedKeys.has("logistics") &&
      [
        "/Main_Modules/Client/",
        "/Main_Modules/Inventory/",
        "/Main_Modules/Paraphernalia/",
        "/Main_Modules/Reports/",
        "/Main_Modules/Requests/",
      ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
    const allowed = baseAllowed || logisticsChildAllowed;
    if (!allowed) {
      router.replace("/Main_Modules/Dashboard/");
    }
  }, [pathname, sessionRole, allowedKeys, router]);

  const WORKFORCE_KEYS = useMemo(
    () => new Set(["employees", "reassign", "resigned", "retired", "archive"]),
    []
  );

  const LOGISTICS_ITEMS = useMemo(
    () =>
      [
        { key: "logistics_client", name: "Client", href: "/Main_Modules/Client/", icon: CreditCard },
        { key: "logistics_inventory", name: "Inventory", href: "/Main_Modules/Inventory/", icon: Package },
        { key: "logistics_paraphernalia", name: "Paraphernalia", href: "/Main_Modules/Paraphernalia/", icon: Package },
        { key: "logistics_reports", name: "Reports", href: "/Main_Modules/Reports/", icon: FileText },
        { key: "logistics_requests", name: "Requests", href: "/Main_Modules/Requests/", icon: ClipboardCheck },
      ] as const,
    []
  );

  const workforceItems = useMemo(
    () => menu.filter((m) => WORKFORCE_KEYS.has(m.key)),
    [menu, WORKFORCE_KEYS]
  );

  const firstWorkforceKey = useMemo(
    () => menu.find((m) => WORKFORCE_KEYS.has(m.key))?.key ?? null,
    [menu, WORKFORCE_KEYS]
  );

  const workforceActive = useMemo(
    () =>
      workforceItems.some(
        (item) => menuActivePath === item.href || menuActivePath.startsWith(item.href)
      ),
    [menuActivePath, workforceItems]
  );

  useEffect(() => {
    if (!collapsed) setWorkforceFlyoutOpen(false);
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed) setLogisticsFlyoutOpen(false);
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed && workforceActive) setWorkforceOpen(true);
  }, [collapsed, workforceActive]);

  const logisticsAllowed = useMemo(() => allowedKeys.has("logistics"), [allowedKeys]);

  const logisticsActive = useMemo(() => {
    if (!logisticsAllowed) return false;
    return [
      "/Main_Modules/Logistics/",
      "/Main_Modules/Client/",
      "/Main_Modules/Inventory/",
      "/Main_Modules/Paraphernalia/",
      "/Main_Modules/Reports/",
      "/Main_Modules/Requests/",
    ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  }, [logisticsAllowed, pathname]);

  useEffect(() => {
    if (!collapsed && logisticsActive) setLogisticsOpen(true);
  }, [collapsed, logisticsActive]);

  function navLinkClass(active: boolean) {
    return `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active ? "bg-[#FFDA03] text-black" : "text-gray-700 hover:bg-yellow-100"
    }`;
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      <aside
        className={`bg-white border-r flex flex-col min-h-0
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

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-2 pb-3">
          {menu.map((item) => {
            // Render the workforce group once at the first workforce item.
            const isFirstWorkforce = firstWorkforceKey && item.key === firstWorkforceKey;
            if (isFirstWorkforce) {
              if (!workforceItems.length) return null;

              return (
                <div key="workforce" className="relative mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (collapsed) setWorkforceFlyoutOpen((v) => !v);
                      else setWorkforceOpen((v) => !v);
                    }}
                    className={navLinkClass(workforceActive)}
                    aria-expanded={collapsed ? workforceFlyoutOpen : workforceOpen}
                  >
                    <Users className="w-5 h-5 shrink-0" />
                    {!collapsed ? (
                      <span className="text-sm font-medium whitespace-nowrap">Workforce</span>
                    ) : null}
                    {!collapsed ? (
                      <ChevronDown
                        className={`ml-auto w-4 h-4 transition-transform ${
                          workforceOpen ? "rotate-180" : ""
                        }`}
                      />
                    ) : null}
                  </button>

                  {collapsed && workforceFlyoutOpen ? (
                    <div className="mt-1 space-y-1">
                      {workforceItems.map((w) => {
                        const active =
                          menuActivePath === w.href || menuActivePath.startsWith(w.href);
                        return (
                          <Link
                            key={w.key}
                            href={w.href}
                            title={w.name}
                            aria-label={w.name}
                            className={`flex items-center justify-center px-4 py-3 rounded-xl transition-all duration-200 ${
                              active
                                ? "bg-[#FFDA03] text-black"
                                : "text-gray-700 hover:bg-yellow-100"
                            }`}
                          >
                            <w.icon className="w-5 h-5 shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}

                  {!collapsed && workforceOpen ? (
                    <div className="mt-1 ml-4 pl-3 border-l border-gray-200 space-y-1">
                      {workforceItems.map((w) => {
                        const active =
                          menuActivePath === w.href || menuActivePath.startsWith(w.href);
                        return (
                          <Link key={w.key} href={w.href} className={navLinkClass(active)}>
                            <w.icon className="w-5 h-5 shrink-0" />
                            <span className="text-sm font-medium whitespace-nowrap">{w.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            // Skip items that belong to workforce; they are rendered inside the group.
            if (WORKFORCE_KEYS.has(item.key)) return null;

            // Render the Logistics group in place of the single Logistics item.
            if (item.key === "logistics") {
              if (!logisticsAllowed) return null;

              return (
                <div key="logistics" className="relative mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (collapsed) setLogisticsFlyoutOpen((v) => !v);
                      else setLogisticsOpen((v) => !v);
                    }}
                    className={navLinkClass(logisticsActive)}
                    aria-expanded={collapsed ? logisticsFlyoutOpen : logisticsOpen}
                  >
                    <Truck className="w-5 h-5 shrink-0" />
                    {!collapsed ? (
                      <span className="text-sm font-medium whitespace-nowrap">Logistics</span>
                    ) : null}
                    {!collapsed ? (
                      <ChevronDown
                        className={`ml-auto w-4 h-4 transition-transform ${
                          logisticsOpen ? "rotate-180" : ""
                        }`}
                      />
                    ) : null}
                  </button>

                  {collapsed && logisticsFlyoutOpen ? (
                    <div className="mt-1 space-y-1">
                      {LOGISTICS_ITEMS.map((l) => {
                        const active = pathname === l.href || pathname.startsWith(l.href);
                        return (
                          <Link
                            key={l.key}
                            href={l.href}
                            title={l.name}
                            aria-label={l.name}
                            className={`flex items-center justify-center px-4 py-3 rounded-xl transition-all duration-200 ${
                              active
                                ? "bg-[#FFDA03] text-black"
                                : "text-gray-700 hover:bg-yellow-100"
                            }`}
                          >
                            <l.icon className="w-5 h-5 shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}

                  {!collapsed && logisticsOpen ? (
                    <div className="mt-1 ml-4 pl-3 border-l border-gray-200 space-y-1">
                      {LOGISTICS_ITEMS.map((l) => {
                        const active = pathname === l.href || pathname.startsWith(l.href);
                        return (
                          <Link key={l.key} href={l.href} className={navLinkClass(active)}>
                            <l.icon className="w-5 h-5 shrink-0" />
                            <span className="text-sm font-medium whitespace-nowrap">{l.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            const active =
              menuActivePath === item.href || menuActivePath.startsWith(item.href);

            return (
              <Link key={item.name} href={item.href} className={navLinkClass(active)}>
                <item.icon className="w-5 h-5 shrink-0" />
                <span
                  className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                    collapsed ? "hidden opacity-0" : "block opacity-100"
                  }`}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 px-3 pb-4 pt-3 space-y-2 border-t bg-white">
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
            onClick={requestLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
              text-red-600 hover:bg-red-50 transition-all"
          >
            <Power className="w-5 h-5" />
            {!collapsed && <span className="text-sm font-medium">Log Out</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Top Navigation */}
        <header className="bg-gray-50 sticky top-0 z-40">
          <div className="px-6 pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-gray-900">{pageTitle}</div>
                <div className="text-xs text-gray-500">
                  Dashboard / {pageTitle}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative" data-activity-menu>
                  <button
                    type="button"
                    onClick={() => {
                      setActivityOpen((v) => !v);
                      setExpiringOpen(false);
                      setAdminAlertOpen(false);
                      refreshActivity();
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                    aria-label="Activity"
                  >
                    <Activity className="w-5 h-5" />
						{activityCount > 0 ? (
							<span
								className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center shadow"
								aria-label={`Activity count ${activityCount}`}
							>
								{badgeText(activityCount)}
							</span>
						) : null}
                  </button>

                  {activityOpen ? (
                    <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl border bg-white shadow-lg overflow-hidden z-50">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <div className="text-sm font-semibold text-black">Recent Activity</div>
                        <Link
                          href="/Main_Modules/Audit/"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => setActivityOpen(false)}
                        >
                          View all
                        </Link>
                      </div>

                      {activityMissingTable ? (
                        <div className="px-4 py-3 text-sm text-yellow-800 bg-yellow-50">
                          Install the audit table (Supabase_audit_log.sql).
                        </div>
                      ) : null}

                      <div className="max-h-[320px] overflow-auto">
                        {recentActivity.length ? (
                          recentActivity.map((r) => (
                            <div key={r.id} className="px-4 py-3 border-b last:border-b-0">
                              <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</div>
                              <div className="text-sm text-black font-medium">{r.action}</div>
                              <div className="text-xs text-gray-600">{r.page || "—"}</div>
                              <div className="text-[11px] text-gray-500">{r.actor_email || "—"}</div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-sm text-gray-500">No activity yet.</div>
                        )}
                      </div>

                      <div className="px-4 py-3 border-t bg-gray-50">
                        <button
                          type="button"
                          className="text-xs text-gray-700 hover:underline"
                          onClick={() => {
                            try {
                              localStorage.setItem("auditLastSeenAt", new Date().toISOString());
                            } catch {
                              // ignore
                            }
                            setActivityCount(0);
                            setActivityOpen(false);
                          }}
                        >
                          Mark as seen
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="relative" data-expiring-menu>
                  <button
                    type="button"
                    onClick={() => {
                      setExpiringOpen((v) => !v);
                      setActivityOpen(false);
                      setAdminAlertOpen(false);
                      refreshExpiring();
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                    aria-label="Expiring Licenses"
                  >
                    <CreditCard className="w-5 h-5" />
						{expiringCount > 0 ? (
							<span
								className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center shadow"
								aria-label={`Expiring licenses count ${expiringCount}`}
							>
								{badgeText(expiringCount)}
							</span>
						) : null}
                  </button>

                  {expiringOpen ? (
                    <div className="absolute right-0 mt-2 w-[420px] max-w-[92vw] rounded-2xl border bg-white shadow-lg overflow-hidden z-50">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <div className="text-sm font-semibold text-black">Expiring Licenses</div>
                        <Link
                          href="/Main_Modules/Settings/"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => setExpiringOpen(false)}
                        >
                          Settings
                        </Link>
                      </div>

                      <div className="max-h-[360px] overflow-auto">
                        {expiringRows.length ? (
                          expiringRows.map((r, idx) => (
                            <div
                              key={`${r.applicant_id}:${r.license_type}:${idx}`}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(ev) => {
                                if (ev.key !== "Enter" && ev.key !== " ") return;
                                ev.preventDefault();
                                router.push(
                                  `/Main_Modules/Employees/details/?id=${encodeURIComponent(
                                    r.applicant_id
                                  )}&from=${encodeURIComponent("/Main_Modules/Employees/")}`
                                );
                                setExpiringOpen(false);
                              }}
                              onClick={() => {
                                router.push(
                                  `/Main_Modules/Employees/details/?id=${encodeURIComponent(
                                    r.applicant_id
                                  )}&from=${encodeURIComponent("/Main_Modules/Employees/")}`
                                );
                                setExpiringOpen(false);
                              }}
                              className="px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50"
                              title="Open employee details"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium text-black">{r.license_type}</div>
                                <div className="text-xs text-gray-600 whitespace-nowrap">{r.expires_on}</div>
                              </div>
                              <div className="text-xs text-gray-600">
                                {(r.first_name || r.last_name)
                                  ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()
                                  : r.applicant_id}
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-3">
                                <div className="text-[11px] text-gray-500">Days: {r.days_until_expiry}</div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const badge = emailBadge(expiringEmailByApplicantId[String(r.applicant_id)] ?? null);
                                    return (
                                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.className}`}>
                                        {badge.label}
                                      </span>
                                    );
                                  })()}
                                  <span
                                    className={
                                      (Number(r.sent_count ?? 0) > 0)
                                        ? "text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200"
                                        : "text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border"
                                    }
                                  >
                                    {(Number(r.sent_count ?? 0) > 0) ? `Sent ${r.sent_count}x` : "Not sent"}
                                  </span>

                                  <button
                                    type="button"
                                    disabled={!api?.notifications?.resendLicensureNotice || resendingKey === `${r.applicant_id}:${r.license_type}:${r.expires_on}`}
                                    className="text-[11px] px-2 py-0.5 rounded-full border bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                                    onClick={async (ev) => {
                                      ev.stopPropagation();
                                      const k = `${r.applicant_id}:${r.license_type}:${r.expires_on}`;
                                      if (!api?.notifications?.resendLicensureNotice) return;
                                      try {
                                        setResendingKey(k);
                                        await api.notifications.resendLicensureNotice({
                                          applicant_id: r.applicant_id,
                                          license_type: r.license_type,
                                          expires_on: r.expires_on,
                                        });
                                        await refreshExpiring();
                                      } catch {
                                        // ignore (Electron main logs failures)
                                      } finally {
                                        setResendingKey(null);
                                      }
                                    }}
                                  >
                                    Resend
                                  </button>
                                </div>
                              </div>
                              {r.last_sent_at ? (
                                <div className="text-[11px] text-gray-400 mt-1">Last sent: {new Date(r.last_sent_at).toLocaleString()}</div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-sm text-gray-500">No expiring licenses found.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* <button
                  type="button"
                  className="h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                  aria-label="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button> */}

                <div className="relative" data-admin-alert-menu>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminAlertOpen((v) => !v);
                      setActivityOpen(false);
                      setExpiringOpen(false);
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                    aria-label="Admin Alerts"
                  >
                    <CircleAlert className="w-5 h-5" />
                    {(activityCount + expiringCount) > 0 ? (
                      <span
                        className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center shadow"
                        aria-label={`Admin alerts count ${activityCount + expiringCount}`}
                      >
                        {badgeText(activityCount + expiringCount)}
                      </span>
                    ) : null}
                  </button>

                  {adminAlertOpen ? (
                    <div className="absolute right-0 mt-2 w-[340px] max-w-[90vw] rounded-2xl border bg-white shadow-lg overflow-hidden z-50">
                      <div className="px-4 py-3 border-b">
                        <div className="text-sm font-semibold text-black">Admin Alert Center</div>
                        <div className="text-xs text-gray-500">Quick actions for pending admin work.</div>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="rounded-xl border bg-gray-50 px-3 py-2 flex items-center justify-between">
                          <div>
                            <div className="text-xs text-gray-500">Unread Activity</div>
                            <div className="text-sm font-semibold text-black">{activityCount}</div>
                          </div>
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
                            onClick={() => {
                              setAdminAlertOpen(false);
                              router.push("/Main_Modules/Audit/");
                            }}
                          >
                            Open Audit
                          </button>
                        </div>

                        <div className="rounded-xl border bg-gray-50 px-3 py-2 flex items-center justify-between">
                          <div>
                            <div className="text-xs text-gray-500">Pending License Notices</div>
                            <div className="text-sm font-semibold text-black">{expiringCount}</div>
                          </div>
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
                            onClick={() => {
                              setAdminAlertOpen(false);
                              router.push("/Main_Modules/Settings/");
                            }}
                          >
                            Notification Settings
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="text-xs px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                            onClick={() => {
                              setAdminAlertOpen(false);
                              router.push("/Main_Modules/Inventory/");
                            }}
                          >
                            Inventory
                          </button>
                          <button
                            type="button"
                            className="text-xs px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                            onClick={() => {
                              setAdminAlertOpen(false);
                              router.push("/Main_Modules/Requests/");
                            }}
                          >
                            Requests
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="h-10 w-10 rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center">
                  <span className="text-xs font-semibold text-gray-600">AD</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 px-6 pb-10 pt-6 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>

      {logoutConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-xl">
            <div className="px-5 py-4 border-b">
              <div className="text-base font-semibold text-black">Confirm Logout</div>
              <div className="mt-1 text-sm text-gray-600">Are you sure you want to log out?</div>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                disabled={logoutBusy}
                className="px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                disabled={logoutBusy}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
              >
                {logoutBusy ? "Logging out..." : "Log Out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
