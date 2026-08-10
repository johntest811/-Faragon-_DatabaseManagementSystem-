"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../Client/SupabaseClients";
import { useAuthRole, useMyModules } from "../Client/useRbac";
import {
  LayoutGrid,
  Users,
  Repeat2,
  UserMinus,
  UserX,
  Archive,
  Shield,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronDown,
  Truck,
  Power,
  ClipboardList,
  Activity,
  BadgeCheck,
  CreditCard,
  Package,
  ClipboardCheck,
  KeyRound,
  Sparkles,
  Download,
  Menu,
} from "lucide-react";

type LayoutProps = Readonly<{ children: React.ReactNode }>;

function canConsumeVerticalWheel(element: HTMLElement, deltaY: number) {
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  if (deltaY < 0) return element.scrollTop > 1;
  return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}

function routeTableWheelToPage(event: React.WheelEvent<HTMLElement>) {
  if (event.ctrlKey || event.shiftKey || event.deltaY === 0) return;
  if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

  const pageScroller = event.currentTarget;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;

  let nestedHorizontalScroller = false;
  let current: HTMLElement | null = target;
  while (current && current !== pageScroller) {
    const style = window.getComputedStyle(current);
    if (style.position === "fixed") return;
    const allowsHorizontalScroll = style.overflowX === "auto" || style.overflowX === "scroll";
    const allowsVerticalScroll = style.overflowY === "auto" || style.overflowY === "scroll";

    if (allowsVerticalScroll && canConsumeVerticalWheel(current, event.deltaY)) return;
    if (allowsHorizontalScroll && current.scrollWidth > current.clientWidth + 1) {
      nestedHorizontalScroller = true;
    }
    current = current.parentElement;
  }

  if (!nestedHorizontalScroller) return;

  const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageScroller.clientHeight : 1;
  const maxScrollTop = Math.max(0, pageScroller.scrollHeight - pageScroller.clientHeight);
  const nextScrollTop = Math.min(maxScrollTop, Math.max(0, pageScroller.scrollTop + event.deltaY * multiplier));
  if (Math.abs(nextScrollTop - pageScroller.scrollTop) < 0.5) return;

  event.preventDefault();
  pageScroller.scrollTop = nextScrollTop;
}

type LegacyAdminSession = {
  id?: string;
  username?: string;
  role?: string;
  full_name?: string | null;
  profile_image_path?: string | null;
};

type AdminProfileRow = {
  id: string;
  username: string;
  full_name: string | null;
  profile_image_path?: string | null;
};

type RecentActivityRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name?: string | null;
  action: string;
  page: string | null;
};

type ExpiringSummaryRow = {
  applicant_id: string;
  first_name: string | null;
  last_name: string | null;
  record_name?: string | null;
  recipient_email?: string | null;
  source_kind?: "licensure" | "other" | "contract";
  license_type: string;
  expires_on: string;
  days_until_expiry: number;
  sent_count?: number;
  last_sent_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NotificationConfigResponse = {
  preferences?: {
    send_to_employees?: boolean | null;
  } | null;
};

type WebNotificationPreferences = {
  days_before_expiry?: number | null;
  include_driver_license?: boolean | null;
  include_security_license?: boolean | null;
  include_insurance?: boolean | null;
  include_expired?: boolean | null;
  expired_within_days?: number | null;
  send_to_employees?: boolean | null;
};

type PageMeta = {
  title: string;
  description: string;
  badge: string;
  icon: typeof LayoutGrid;
};

type AuditGetRecentResponse = {
  rows?: RecentActivityRow[];
  count?: number | null;
  missingTable?: boolean | null;
};

type ResendLicensureNoticePayload = {
  applicant_id: string;
  license_type: string;
  expires_on: string;
};

type ExpiringSummaryResponse = {
  rows?: ExpiringSummaryRow[];
  count?: number | null;
  pendingCount?: number | null;
};

type ElectronLayoutApi = {
  settings?: {
    loadNotificationConfig?: () => Promise<NotificationConfigResponse>;
  };
  audit?: {
    logEvent?: (payload: {
      actor_user_id: string | null;
      actor_email: string | null;
      actor_name?: string | null;
      action: string;
      page: string;
    }) => Promise<unknown>;
    getRecent?: (payload: { limit: number; sinceIso?: string }) => Promise<AuditGetRecentResponse>;
  };
  notifications?: {
    getExpiringSummary?: (payload: { limit: number }) => Promise<ExpiringSummaryResponse>;
    resendLicensureNotice?: (payload: ResendLicensureNoticePayload) => Promise<unknown>;
  };
};

const PROFILE_BUCKET = "Profile";
const EXPIRING_DISMISSED_KEYS_STORAGE = "expiringDismissedNotificationKeys";

function getExpiringSummaryRowKey(row: ExpiringSummaryRow) {
  const applicantId = String(row?.applicant_id ?? "").trim();
  const licenseType = String(row?.license_type ?? "").trim();
  const expiresOn = String(row?.expires_on ?? "").trim();
  const isOtherRow = row?.source_kind === "other" || applicantId.startsWith("other:");
  return isOtherRow ? `${applicantId}:${expiresOn}` : `${applicantId}:${licenseType}:${expiresOn}`;
}

function isCarInsuranceExpiringRow(row: ExpiringSummaryRow) {
  const applicantId = String(row?.applicant_id ?? "").trim();
  const licenseType = String(row?.license_type ?? "").trim().toUpperCase();
  if (!(row?.source_kind === "other" || applicantId.startsWith("other:"))) return false;
  return licenseType === "OTHER: POLICY TERM" || licenseType === "OTHER: CAR REGISTRATION DATE";
}

function isContractExpiringRow(row: ExpiringSummaryRow) {
  const applicantId = String(row?.applicant_id ?? "").trim();
  const licenseType = String(row?.license_type ?? "").trim().toUpperCase();
  if (!(row?.source_kind === "contract" || applicantId.startsWith("contract:"))) return false;
  return licenseType === "CONTRACT EXPIRATION";
}

function clampNotificationDays(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(365, Math.max(1, Math.trunc(numeric)));
}

function daysUntilDateOnly(value: unknown, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return null;
  const targetDay = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const difference = Math.round((targetDay - today) / 86_400_000);
  return Number.isFinite(difference) ? difference : null;
}

function isWithinExpirationWindow(
  daysUntilExpiry: number | null,
  daysBeforeExpiry: number,
  includeExpired: boolean,
  expiredWithinDays: number
) {
  if (daysUntilExpiry === null) return false;
  if (daysUntilExpiry >= 0 && daysUntilExpiry <= daysBeforeExpiry) return true;
  return includeExpired && daysUntilExpiry < 0 && Math.abs(daysUntilExpiry) <= expiredWithinDays;
}

function readDismissedExpiringSummaryKeys() {
  try {
    const raw = localStorage.getItem(EXPIRING_DISMISSED_KEYS_STORAGE);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((value) => String(value ?? "").trim()).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

function writeDismissedExpiringSummaryKeys(keys: Set<string>) {
  try {
    const values = Array.from(keys).map((value) => String(value ?? "").trim()).filter(Boolean);
    if (!values.length) {
      localStorage.removeItem(EXPIRING_DISMISSED_KEYS_STORAGE);
      return;
    }
    localStorage.setItem(EXPIRING_DISMISSED_KEYS_STORAGE, JSON.stringify(values));
  } catch {
    // ignore
  }
}

function readLegacyAdminSession(): LegacyAdminSession | null {
  try {
    const raw = localStorage.getItem("adminSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyAdminSession;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLegacyAdminSessionPatch(patch: Partial<LegacyAdminSession>) {
  try {
    const raw = localStorage.getItem("adminSession");
    if (!raw) return;
    const parsed = JSON.parse(raw) as LegacyAdminSession;
    localStorage.setItem("adminSession", JSON.stringify({ ...parsed, ...patch }));
  } catch {
    // ignore
  }
}

function profileImageUrl(profilePath: string | null, cacheBust?: number) {
  if (!profilePath) return null;
  const { data } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(profilePath);
  const url = data.publicUrl || null;
  if (!url) return null;
  if (!cacheBust) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}v=${cacheBust}`;
}

function displayAdminName(fullName: string, username: string) {
  const n = String(fullName ?? "").trim();
  if (n) return n;
  const u = String(username ?? "").trim();
  if (u) return u;
  return "Admin";
}

function initialsFromLabel(value: string) {
  const parts = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "AD";
  const first = parts[0]?.[0] ?? "A";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "D" : parts[0]?.[1] ?? "D";
  return `${first}${second}`.toUpperCase();
}

function emailBadge(email: string | null) {
  const value = (email ?? "").trim();
  if (!value) return { label: "No Email", className: "bg-red-100 text-red-700" };
  if (value.toLowerCase().endsWith("@gmail.com")) return { label: "Gmail", className: "bg-emerald-100 text-emerald-800" };
  return { label: "Email", className: "bg-blue-100 text-blue-800" };
}

function pageMetaForPath(pathname: string): PageMeta {
  const cleanPath = String(pathname ?? "").replace(/\/+$/, "") || "/Main_Modules/Dashboard";

  const entries: Array<{ test: (value: string) => boolean; meta: PageMeta }> = [
    {
      test: (value) => value.startsWith("/Main_Modules/Requests/Queue"),
      meta: {
        title: "Reviewer Queue",
        description: "Review queued requests and notification items with quick approval cues.",
        badge: "Approvals",
        icon: ClipboardCheck,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Requests"),
      meta: {
        title: "Requests",
        description: "Track access requests, queue status, and ongoing workflow items.",
        badge: "Workflow",
        icon: ClipboardList,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/AdminAccounts"),
      meta: {
        title: "Admin Accounts",
        description: "Manage privileged users, access, and desktop sign-in accounts.",
        badge: "Superadmin",
        icon: Shield,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Roles"),
      meta: {
        title: "Roles",
        description: "Define how administrators and staff move through the system.",
        badge: "Access map",
        icon: KeyRound,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Permissions"),
      meta: {
        title: "Permissions",
        description: "Fine-tune access controls and column-level visibility.",
        badge: "Security",
        icon: BadgeCheck,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Audit"),
      meta: {
        title: "Audit",
        description: "Monitor recent activity and review system actions at a glance.",
        badge: "Traceable",
        icon: ClipboardList,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Archive"),
      meta: {
        title: "Archive",
        description: "Browse archived records and older operational data safely.",
        badge: "History",
        icon: Archive,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Employees/details"),
      meta: {
        title: "Employee Details",
        description: "Inspect an employee profile, history, and record-specific fields.",
        badge: "Profile",
        icon: Users,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Applicants"),
      meta: {
        title: "Applicant",
        description: "Review applicant records before they move into the workforce.",
        badge: "Workforce",
        icon: Users,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Employees"),
      meta: {
        title: "Employees",
        description: "Manage workforce records and keep employee information current.",
        badge: "Workforce",
        icon: Users,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Inventory/InventoryDetailClient"),
      meta: {
        title: "Inventory Details",
        description: "Review item-level inventory information with a clean detail view.",
        badge: "Asset detail",
        icon: Package,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Inventory/"),
      meta: {
        title: "Inventory",
        description: "Track assets, categories, and stock records in one workspace.",
        badge: "Assets",
        icon: Package,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Paraphernalia"),
      meta: {
        title: "Paraphernalia",
        description: "Keep auxiliary inventory items organized and easy to review.",
        badge: "Tools",
        icon: Package,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/AWOL") || value.startsWith("/Main_Modules/Reassign"),
      meta: {
        title: "AWOL",
        description: "Track personnel marked AWOL and manage follow-up actions from one workspace.",
        badge: "Attendance",
        icon: Repeat2,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Logistics/CarInsuranceExpiration"),
      meta: {
        title: "Car Insurance Expiration",
        description: "Track patrol vehicle insurance policies and expiration reminders.",
        badge: "Logistics",
        icon: ShieldCheck,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Resigned"),
      meta: {
        title: "Resigned",
        description: "Review resigned employee records with a focused archive view.",
        badge: "Offboarded",
        icon: UserMinus,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Retired"),
      meta: {
        title: "Retired",
        description: "Review retired employee records in a clean, readable layout.",
        badge: "Completed",
        icon: UserX,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Floating"),
      meta: {
        title: "Floating",
        description: "Review employees who are temporarily awaiting a permanent detachment assignment.",
        badge: "Available",
        icon: Users,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Client"),
      meta: {
        title: "Client",
        description: "Track client-facing data, profiles, and related workflow items.",
        badge: "Client view",
        icon: CreditCard,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Settings"),
      meta: {
        title: "Settings",
        description: "Configure notifications, recipients, and operational preferences.",
        badge: "System",
        icon: Settings,
      },
    },
    {
      test: (value) => value.startsWith("/Main_Modules/Dashboard") || value === "/Main_Modules",
      meta: {
        title: "Dashboard",
        description: "Monitor employee totals, admin activity, and high-level system health.",
        badge: "Live",
        icon: LayoutGrid,
      },
    },
  ];

  return entries.find((entry) => entry.test(cleanPath))?.meta ?? {
    title: "Dashboard",
    description: "Monitor employee totals, admin activity, and high-level system health.",
    badge: "Live",
    icon: LayoutGrid,
  };
}

const ALL_MENU = [
  { key: "dashboard", name: "Dashboard", href: "/Main_Modules/Dashboard/", icon: LayoutGrid },
  { key: "client", name: "Client", href: "/Main_Modules/Client/", icon: CreditCard },
  { key: "applicants", name: "Applicant", href: "/Main_Modules/Applicants/", icon: Users },
  { key: "employees", name: "Employees", href: "/Main_Modules/Employees/", icon: Users },
  { key: "reassign", name: "AWOL", href: "/Main_Modules/AWOL/", icon: Repeat2 },
  { key: "resigned", name: "Resigned", href: "/Main_Modules/Resigned/", icon: UserMinus },
  { key: "retired", name: "Retired", href: "/Main_Modules/Retired/", icon: UserX },
  { key: "floating", name: "Floating", href: "/Main_Modules/Floating/", icon: Users },
  { key: "archive", name: "Archive", href: "/Main_Modules/Archive/", icon: Archive },
  { key: "logistics", name: "Logistics", href: "/Main_Modules/Logistics/", icon: Truck },
  { key: "requests", name: "Requests", href: "/Main_Modules/Requests/", icon: ClipboardCheck },
  { key: "access_reviewer_queue", name: "Reviewer Queue", href: "/Main_Modules/Requests/Queue/", icon: ClipboardCheck },
  { key: "access", name: "Admin Accounts", href: "/Main_Modules/AdminAccounts/", icon: Shield },
  { key: "audit", name: "Audit", href: "/Main_Modules/Audit/", icon: ClipboardList },
  { key: "settings", name: "Settings", href: "/Main_Modules/Settings/", icon: Settings },
] as const;

type ModuleKey =
  | "dashboard"
  | "applicants"
  | "employees"
  | "reassign"
  | "resigned"
  | "retired"
  | "floating"
  | "archive"
  | "client"
  | "inventory"
  | "paraphernalia"
  | "requests"
  | "access_reviewer_queue"
  | "audit"
  | "settings"
  | "access"
  | "logistics"
  | "car_insurance_expiration"
  | "recent_activities"
  | "preview_service_anniversary"
  | "expiring_licenses_records";

type AccessRequirement =
  | { kind: "module"; moduleKey: ModuleKey }
  | { kind: "superadmin" };

function accessRequirementForPath(pathname: string): AccessRequirement | null {
  if (!pathname) return null;
  const p = pathname;

  // Access-management section is Superadmin-only.
  if (
    p.startsWith("/Main_Modules/AdminAccounts/") ||
    p.startsWith("/Main_Modules/Roles/") ||
    p.startsWith("/Main_Modules/Permissions/") ||
    p.startsWith("/Main_Modules/Requests/Queue/")
  ) {
    if (p.startsWith("/Main_Modules/Requests/Queue/")) {
      return { kind: "module", moduleKey: "access_reviewer_queue" };
    }
    return { kind: "superadmin" };
  }

  if (p.startsWith("/Main_Modules/Dashboard/")) return { kind: "module", moduleKey: "dashboard" };
  if (p.startsWith("/Main_Modules/Applicants/")) return { kind: "module", moduleKey: "applicants" };
  if (p.startsWith("/Main_Modules/Employees/")) return { kind: "module", moduleKey: "employees" };
  if (p.startsWith("/Main_Modules/AWOL/") || p.startsWith("/Main_Modules/Reassign/")) {
    return { kind: "module", moduleKey: "reassign" };
  }
  if (p.startsWith("/Main_Modules/Resigned/")) return { kind: "module", moduleKey: "resigned" };
  if (p.startsWith("/Main_Modules/Retired/")) return { kind: "module", moduleKey: "retired" };
  if (p.startsWith("/Main_Modules/Floating/")) return { kind: "module", moduleKey: "floating" };
  if (p.startsWith("/Main_Modules/Archive/")) return { kind: "module", moduleKey: "archive" };
  if (p.startsWith("/Main_Modules/Client/")) return { kind: "module", moduleKey: "client" };
  if (p.startsWith("/Main_Modules/Inventory/")) return { kind: "module", moduleKey: "inventory" };
  if (p.startsWith("/Main_Modules/Paraphernalia/")) return { kind: "module", moduleKey: "paraphernalia" };
  if (p.startsWith("/Main_Modules/Requests/")) return { kind: "module", moduleKey: "requests" };
  if (p.startsWith("/Main_Modules/Audit/")) return { kind: "module", moduleKey: "audit" };
  if (p.startsWith("/Main_Modules/Settings/")) return { kind: "module", moduleKey: "settings" };

  if (p.startsWith("/Main_Modules/Logistics/CarInsuranceExpiration")) {
    return { kind: "module", moduleKey: "car_insurance_expiration" };
  }

  // If the user lands on /Main_Modules/Logistics/ (group route), treat it as logistics.
  if (p === "/Main_Modules/Logistics/" || p === "/Main_Modules/Logistics") return { kind: "module", moduleKey: "logistics" };

  // Unknown route inside Main_Modules: let the existing behavior handle it.
  return null;
}

function normalizeMenuPath(pathname: string) {
  if (pathname.startsWith("/Main_Modules/Reassign/")) {
    return pathname.replace("/Main_Modules/Reassign/", "/Main_Modules/AWOL/");
  }
  return pathname;
}

function titleFromPath(pathname: string) {
  const clean = (pathname || "/").replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "Dashboard";
  return last
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCollapsedFlyoutPosition(button: HTMLElement | null) {
  if (!button || typeof window === "undefined") return null;

  const rect = button.getBoundingClientRect();
  const panelWidth = 248;
  const panelHeight = 320;
  const safeMargin = 8;

  const top = Math.max(
    safeMargin,
    Math.min(rect.top, window.innerHeight - panelHeight - safeMargin)
  );

  const left = Math.max(
    safeMargin,
    Math.min(rect.right + 10, window.innerWidth - panelWidth - safeMargin)
  );

  return { top, left };
}

function MainModulesLayoutInner({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [currentAdmin, setCurrentAdmin] = useState<{
    id: string | null;
    username: string;
    fullName: string;
    profileImagePath: string | null;
    profileImageUrl: string | null;
  }>({
    id: null,
    username: "",
    fullName: "",
    profileImagePath: null,
    profileImageUrl: null,
  });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [workforceOpen, setWorkforceOpen] = useState(false);
  const [workforceFlyoutOpen, setWorkforceFlyoutOpen] = useState(false);
  const [workforceFlyoutPosition, setWorkforceFlyoutPosition] = useState<{ top: number; left: number } | null>(null);
  const [logisticsOpen, setLogisticsOpen] = useState(false);
  const [logisticsFlyoutOpen, setLogisticsFlyoutOpen] = useState(false);
  const [logisticsFlyoutPosition, setLogisticsFlyoutPosition] = useState<{ top: number; left: number } | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessFlyoutOpen, setAccessFlyoutOpen] = useState(false);
  const [accessFlyoutPosition, setAccessFlyoutPosition] = useState<{ top: number; left: number } | null>(null);
  const workforceGroupRef = useRef<HTMLDivElement | null>(null);
  const logisticsGroupRef = useRef<HTMLDivElement | null>(null);
  const accessGroupRef = useRef<HTMLDivElement | null>(null);
  const workforceButtonRef = useRef<HTMLButtonElement | null>(null);
  const logisticsButtonRef = useRef<HTMLButtonElement | null>(null);
  const accessButtonRef = useRef<HTMLButtonElement | null>(null);
  const workforceFlyoutRef = useRef<HTMLDivElement | null>(null);
  const logisticsFlyoutRef = useRef<HTMLDivElement | null>(null);
  const accessFlyoutRef = useRef<HTMLDivElement | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expiringOpen, setExpiringOpen] = useState(false);
  const [carInsuranceExpiringOpen, setCarInsuranceExpiringOpen] = useState(false);
  const [contractExpiringOpen, setContractExpiringOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ percent: number } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ updateAvailable: boolean; version?: string | null; currentVersion?: string | null } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [currentAppVersion, setCurrentAppVersion] = useState<string>("0.1.1");
  const [, setAdminAlertOpen] = useState(false);

  useEffect(() => {
    const electronAPI = (globalThis as any).electronAPI;
    if (!electronAPI?.app) return;

    electronAPI.app.getVersion?.().then((v: string) => {
      if (v) setCurrentAppVersion(v);
    });

    const unsubProgress = electronAPI.app.onUpdateProgress?.((p: { percent: number }) => {
      setUpdateDownloading(true);
      setUpdateError(null);
      setUpdateProgress(p);
    });

    const unsubDownloaded = electronAPI.app.onUpdateDownloaded?.((info: { version: string }) => {
      setUpdateDownloading(false);
      setUpdateDownloaded(true);
      setUpdateError(null);
      setUpdateInfo((prev) => ({ ...prev, updateAvailable: true, version: info?.version }));
    });

    const unsubError = electronAPI.app.onUpdateError?.((err: { error: string }) => {
      setUpdateDownloading(false);
      setUpdateProgress(null);
      setUpdateError(err?.error || "Download error occurred.");
    });

    // Automatically check GitHub for latest updates on login / app load
    if (electronAPI?.app?.checkForUpdates) {
      setUpdateChecking(true);
      electronAPI.app.checkForUpdates().then((res: any) => {
        if (res && res.success) {
          setUpdateInfo({
            updateAvailable: Boolean(res.updateAvailable),
            version: res.version,
            currentVersion: res.currentVersion,
          });
        }
      }).catch(() => {}).finally(() => {
        setUpdateChecking(false);
      });
    }

    return () => {
      unsubProgress?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    const electronAPI = (globalThis as any).electronAPI;
    if (!electronAPI?.app?.checkForUpdates) return;
    setUpdateChecking(true);
    setUpdateError(null);
    try {
      const res = await electronAPI.app.checkForUpdates();
      if (res && res.success) {
        setUpdateInfo({
          updateAvailable: Boolean(res.updateAvailable),
          version: res.version,
          currentVersion: res.currentVersion,
        });
      }
    } catch {
      // ignore
    } finally {
      setUpdateChecking(false);
    }
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    const electronAPI = (globalThis as any).electronAPI;
    if (!electronAPI?.app?.downloadUpdate) return;
    setUpdateDownloading(true);
    setUpdateError(null);
    try {
      const res = await electronAPI.app.downloadUpdate();
      if (res && !res.success && res.error) {
        setUpdateDownloading(false);
        setUpdateError(res.error);
      }
    } catch (e: any) {
      setUpdateDownloading(false);
      setUpdateError(e?.message || String(e));
    }
  }, []);

  const handleCancelDownload = useCallback(async () => {
    const electronAPI = (globalThis as any).electronAPI;
    if (electronAPI?.app?.cancelDownload) {
      try {
        await electronAPI.app.cancelDownload();
      } catch {
        // ignore
      }
    }
    setUpdateDownloading(false);
    setUpdateProgress(null);
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    const electronAPI = (globalThis as any).electronAPI;
    if (!electronAPI?.app?.installUpdate) return;
    try {
      await electronAPI.app.installUpdate();
    } catch {
      // ignore
    }
  }, []);
  const [activityCount, setActivityCount] = useState(0);
  const [activityMissingTable, setActivityMissingTable] = useState(false);
  const [resendingKey, setResendingKey] = useState<string | null>(null);
  const [clearingAllExpiring, setClearingAllExpiring] = useState(false);
  const [sendToEmployees, setSendToEmployees] = useState(true);
  const [recentActivity, setRecentActivity] = useState<RecentActivityRow[]>([]);
  const [expiringCount, setExpiringCount] = useState(0);
  const [carInsuranceExpiringCount, setCarInsuranceExpiringCount] = useState(0);
  const [contractExpiringCount, setContractExpiringCount] = useState(0);
  const [previewCount, setPreviewCount] = useState(0);
  function badgeText(n: number) {
    if (!Number.isFinite(n) || n <= 0) return "";
    return n > 9 ? "9+" : String(n);
  }
  function badgeTextWide(n: number) {
    if (!Number.isFinite(n) || n <= 0) return "";
    return n > 99 ? "99+" : String(n);
  }

  function fullName(first: string | null, last: string | null) {
    const value = `${first ?? ""} ${last ?? ""}`.trim();
    return value || "—";
  }

  function serviceYearsExact(hiredAt: string | null, now: Date) {
    if (!hiredAt) return null;
    const hired = new Date(hiredAt);
    const h = hired.getTime();
    if (!Number.isFinite(h)) return null;
    const diffMs = now.getTime() - h;
    if (!Number.isFinite(diffMs) || diffMs < 0) return null;
    const yearMs = 365.25 * 24 * 60 * 60 * 1000;
    return diffMs / yearMs;
  }

  function formatServiceLengthShort(hiredAt: string | null) {
    const now = new Date();
    const years = serviceYearsExact(hiredAt, now);
    if (years == null) return "—";
    const wholeYears = Math.floor(years);
    const months = Math.floor((years - wholeYears) * 12);
    if (wholeYears <= 0) return `${Math.max(0, months)}m`;
    if (months <= 0) return `${wholeYears}y`;
    return `${wholeYears}y ${months}m`;
  }

  const pageMeta = useMemo(() => pageMetaForPath(pathname), [pathname]);
  const PageIcon = pageMeta.icon;

  const [previewRows, setPreviewRows] = useState<
    Array<{
      applicant_id: string;
      first_name: string | null;
      last_name: string | null;
      client_position: string | null;
      detachment: string | null;
      date_hired_fsai: string | null;
    }>
  >([]);

  type ApplicantPreviewDbRow = {
    applicant_id: string;
    first_name: string | null;
    last_name: string | null;
    client_position: string | null;
    detachment: string | null;
    date_hired_fsai: string | null;
    status: string | null;
    is_archived: boolean | null;
    is_trashed: boolean | null;
  };
  const [expiringRows, setExpiringRows] = useState<ExpiringSummaryRow[]>([]);
  const [expiringEmailByApplicantId, setExpiringEmailByApplicantId] = useState<Record<string, string | null>>({});
  const generalExpiringRows = useMemo(
    () => expiringRows.filter((row) => !isCarInsuranceExpiringRow(row) && !isContractExpiringRow(row)),
    [expiringRows]
  );
  const carInsuranceExpiringRows = useMemo(
    () => expiringRows.filter((row) => isCarInsuranceExpiringRow(row)),
    [expiringRows]
  );
  const contractExpiringRows = useMemo(
    () => expiringRows.filter((row) => isContractExpiringRow(row)),
    [expiringRows]
  );
  const { role: sessionRole } = useAuthRole();
  const { modules: myModules } = useMyModules();
  const grantedModuleKeys = useMemo(
    () => new Set(myModules.map((module) => String(module.module_key ?? "").trim().toLowerCase()).filter(Boolean)),
    [myModules]
  );
  const canViewPreviewWidget = sessionRole === "superadmin" || grantedModuleKeys.has("preview_service_anniversary");
  const canViewRecentActivitiesWidget = sessionRole === "superadmin" || grantedModuleKeys.has("recent_activities");
  const canViewExpiringWidget = sessionRole === "superadmin" || grantedModuleKeys.has("expiring_licenses_records");
  const canViewCarInsuranceWidget = sessionRole === "superadmin" || grantedModuleKeys.has("car_insurance_expiration");
  const canViewContractExpiringWidget = sessionRole === "superadmin" || grantedModuleKeys.has("expiring_contracts");

  const applyVisibleExpiringRows = useCallback((rows: ExpiringSummaryRow[]) => {
    setExpiringRows(rows);
    setExpiringCount(
      rows.filter((row) => !isCarInsuranceExpiringRow(row) && !isContractExpiringRow(row)).length
    );
    setCarInsuranceExpiringCount(
      rows.filter((row) => isCarInsuranceExpiringRow(row)).length
    );
    setContractExpiringCount(
      rows.filter((row) => isContractExpiringRow(row)).length
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyFromLegacySession = () => {
      const legacy = readLegacyAdminSession();
      if (!legacy) {
        setCurrentAdmin({
          id: null,
          username: "",
          fullName: "",
          profileImagePath: null,
          profileImageUrl: null,
        });
        return null;
      }

      const nextId = String(legacy.id ?? "").trim() || null;
      const nextUsername = String(legacy.username ?? "").trim();
      const nextFullName = String(legacy.full_name ?? "").trim();
      const nextProfilePath = String(legacy.profile_image_path ?? "").trim() || null;

      setCurrentAdmin({
        id: nextId,
        username: nextUsername,
        fullName: nextFullName,
        profileImagePath: nextProfilePath,
        profileImageUrl: profileImageUrl(nextProfilePath),
      });

      return {
        id: nextId,
        username: nextUsername,
        fullName: nextFullName,
        profileImagePath: nextProfilePath,
      };
    };

    async function loadFromDatabase(adminId: string | null) {
      if (!adminId) return;
      try {
        const wideRes = await supabase
          .from("admins")
          .select("id, username, full_name, profile_image_path")
          .eq("id", adminId)
          .maybeSingle();

        let row: AdminProfileRow | null = null;

        if (wideRes.error) {
          const msg = String((wideRes.error as { message?: unknown }).message ?? "").toLowerCase();
          if (!msg.includes("profile_image_path")) throw wideRes.error;

          const fallbackRes = await supabase
            .from("admins")
            .select("id, username, full_name")
            .eq("id", adminId)
            .maybeSingle();
          if (fallbackRes.error) throw fallbackRes.error;
          row = (fallbackRes.data as AdminProfileRow | null) ?? null;
        } else {
          row = (wideRes.data as AdminProfileRow | null) ?? null;
        }

        if (cancelled || !row) return;

        const nextId = String(row.id ?? "").trim() || null;
        const nextUsername = String(row.username ?? "").trim();
        const nextFullName = String(row.full_name ?? "").trim();
        const nextProfilePath = String(row.profile_image_path ?? "").trim() || null;

        setCurrentAdmin({
          id: nextId,
          username: nextUsername,
          fullName: nextFullName,
          profileImagePath: nextProfilePath,
          profileImageUrl: profileImageUrl(nextProfilePath, Date.now()),
        });

        writeLegacyAdminSessionPatch({
          id: nextId ?? undefined,
          username: nextUsername || undefined,
          full_name: nextFullName || null,
          profile_image_path: nextProfilePath,
        });
      } catch {
        // ignore
      }
    }

    const fromLegacy = applyFromLegacySession();
    void loadFromDatabase(fromLegacy?.id ?? null);

    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "adminSession") return;
      const refreshed = applyFromLegacySession();
      void loadFromDatabase(refreshed?.id ?? null);
    };

    const onProfileUpdated = () => {
      const refreshed = applyFromLegacySession();
      void loadFromDatabase(refreshed?.id ?? null);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("admin-profile-updated", onProfileUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("admin-profile-updated", onProfileUpdated);
    };
  }, []);

  useEffect(() => {
    // Next static export + Electron can open routes without trailing slash.
    // Canonicalize to trailing-slash paths so route guards and menu state stay consistent.
    if (!pathname) return;
    if (!pathname.startsWith("/Main_Modules")) return;
    if (pathname.endsWith("/")) return;

    let search = "";
    try {
      search = window.location.search ?? "";
    } catch {
      // ignore
    }

    router.replace(`${pathname}/${search}`);
  }, [pathname, router]);

  const api = (globalThis as { electronAPI?: ElectronLayoutApi }).electronAPI;
  const adminDisplayName = useMemo(
    () => displayAdminName(currentAdmin.fullName, currentAdmin.username),
    [currentAdmin.fullName, currentAdmin.username]
  );
  const adminInitials = useMemo(() => initialsFromLabel(adminDisplayName), [adminDisplayName]);

  const refreshNotificationPrefs = useCallback(async () => {
    try {
      if (!api?.settings?.loadNotificationConfig) {
        const { data } = await supabase
          .from("notification_preferences")
          .select("send_to_employees")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setSendToEmployees((data as WebNotificationPreferences | null)?.send_to_employees !== false);
        return;
      }
      const cfg = await api.settings.loadNotificationConfig();
      const pref = cfg?.preferences;
      setSendToEmployees(pref?.send_to_employees !== false);
    } catch {
      setSendToEmployees(true);
    }
  }, [api]);

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
    // Log navigation events to audit (desktop and web/vercel).
    let cancelled = false;
    async function logNav() {
      try {
        const session = await supabase.auth.getSession();
        if (cancelled) return;
        const payload = {
          actor_user_id: session.data.session?.user?.id ?? null,
          actor_email: session.data.session?.user?.email ?? null,
          actor_name: adminDisplayName,
          action: "NAVIGATE",
          page: pathname,
        };

        if (api?.audit?.logEvent) {
          await api.audit.logEvent(payload);
        } else {
          await supabase.from("audit_log").insert(payload);
        }
      } catch {
        // ignore
      }
    }
    if (pathname) logNav();
    return () => {
      cancelled = true;
    };
  }, [adminDisplayName, api, pathname]);

  useEffect(() => {
    // Close dropdowns when clicking outside.
    function onDocDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (
        t.closest?.("[data-activity-menu]") ||
        t.closest?.("[data-preview-menu]") ||
        t.closest?.("[data-expiring-menu]") ||
        t.closest?.("[data-car-insurance-expiring-menu]") ||
        t.closest?.("[data-contract-expiring-menu]") ||
        t.closest?.("[data-admin-alert-menu]")
      ) return;
      setActivityOpen(false);
      setPreviewOpen(false);
      setExpiringOpen(false);
      setCarInsuranceExpiringOpen(false);
      setContractExpiringOpen(false);
      setAdminAlertOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    if (!canViewRecentActivitiesWidget) setActivityOpen(false);
    if (!canViewExpiringWidget) setExpiringOpen(false);
    if (!canViewCarInsuranceWidget) setCarInsuranceExpiringOpen(false);
    if (!canViewContractExpiringWidget) setContractExpiringOpen(false);
    if (!canViewPreviewWidget) setPreviewOpen(false);
  }, [canViewCarInsuranceWidget, canViewExpiringWidget, canViewContractExpiringWidget, canViewPreviewWidget, canViewRecentActivitiesWidget]);

  const refreshPreview = useCallback(async () => {
    if (!canViewPreviewWidget) {
      setPreviewRows([]);
      setPreviewCount(0);
      return;
    }

    try {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setFullYear(threshold.getFullYear() - 1);

      const res = await supabase
        .from("applicants")
        .select(
          "applicant_id, first_name, last_name, client_position, detachment, date_hired_fsai, status, is_archived, is_trashed",
          { count: "exact" }
        )
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .lte("date_hired_fsai", threshold.toISOString())
        .order("date_hired_fsai", { ascending: true })
        .limit(200);

      if (res.error) {
        setPreviewRows([]);
        setPreviewCount(0);
        return;
      }

      const data = ((res.data ?? []) as unknown) as ApplicantPreviewDbRow[];
      const rows: Array<{
        applicant_id: string;
        first_name: string | null;
        last_name: string | null;
        client_position: string | null;
        detachment: string | null;
        date_hired_fsai: string | null;
      }> = [];

      for (const r of data) {
        const years = serviceYearsExact(r.date_hired_fsai, now);
        const s = String(r.status ?? "").trim().toUpperCase();
        const excluded = s === "AWOL" || s === "REASSIGN" || s === "RETIRED" || s === "RESIGNED" || s === "FLOATING";
        if (excluded) continue;
        if (years == null || years < 1) continue;
        rows.push({
          applicant_id: String(r.applicant_id ?? ""),
          first_name: r.first_name ?? null,
          last_name: r.last_name ?? null,
          client_position: r.client_position ?? null,
          detachment: r.detachment ?? null,
          date_hired_fsai: r.date_hired_fsai ?? null,
        });
      }

      setPreviewRows(rows);
      setPreviewCount(Number.isFinite(Number(res.count)) ? Number(res.count) : rows.length);
    } catch {
      setPreviewRows([]);
      setPreviewCount(0);
    }
  }, [canViewPreviewWidget]);

  const refreshActivity = useCallback(async () => {
    if (!canViewRecentActivitiesWidget) {
      setRecentActivity([]);
      setActivityCount(0);
      return;
    }

    try {
      const key = "auditLastSeenAt";
      const sinceIso = (() => {
        try {
          return localStorage.getItem(key) || "";
        } catch {
          return "";
        }
      })();

      if (api?.audit?.getRecent) {
        const res = await api.audit.getRecent({ limit: 8, sinceIso });
        setActivityMissingTable(Boolean(res?.missingTable));
        setActivityCount(Number(res?.count ?? 0));

        const recentRes = await api.audit.getRecent({ limit: 8 });
        setRecentActivity(recentRes?.rows ?? []);
        return;
      }

      // Web/Vercel Fallback (Direct Supabase query)
      let countQuery = supabase.from("audit_log").select("*", { count: "exact", head: true });
      if (sinceIso) {
        countQuery = countQuery.gt("created_at", sinceIso);
      }
      const countRes = await countQuery;
      if (countRes.error) {
        const isMissing = countRes.error.code === "42P01" || countRes.error.message.includes("relation \"audit_log\" does not exist");
        setActivityMissingTable(isMissing);
        setActivityCount(0);
      } else {
        setActivityMissingTable(false);
        setActivityCount(Number(countRes.count ?? 0));
      }

      const { data, error } = await supabase
        .from("audit_log")
        .select("id, created_at, actor_user_id, actor_email, actor_name, action, page")
        .order("created_at", { ascending: false })
        .limit(8);

      if (!error && data) {
        setRecentActivity(
          (data as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id ?? ""),
            created_at: String(r.created_at ?? new Date().toISOString()),
            actor_user_id: r.actor_user_id == null ? null : String(r.actor_user_id),
            actor_email: r.actor_email == null ? null : String(r.actor_email),
            actor_name: r.actor_name == null ? null : String(r.actor_name),
            action: String(r.action ?? "ACTIVITY"),
            page: r.page == null ? null : String(r.page),
          }))
        );
      } else {
        setRecentActivity([]);
      }
    } catch {
      // ignore
    }
  }, [api, canViewRecentActivitiesWidget]);

  const refreshExpiring = useCallback(async () => {
    if (!canViewExpiringWidget && !canViewCarInsuranceWidget && !canViewContractExpiringWidget) {
      applyVisibleExpiringRows([]);
      setExpiringEmailByApplicantId({});
      return;
    }

    if (!api?.notifications?.getExpiringSummary) {
      try {
        await refreshNotificationPrefs();
        const rows: ExpiringSummaryRow[] = [];
        const emailByApplicantId: Record<string, string | null> = {};
        const now = new Date();
        const preferencesResult = await supabase
          .from("notification_preferences")
          .select("days_before_expiry, include_driver_license, include_security_license, include_insurance, include_expired, expired_within_days, send_to_employees")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const preferences = (preferencesResult.data as WebNotificationPreferences | null) ?? {};
        const daysBeforeExpiry = clampNotificationDays(preferences.days_before_expiry, 30);
        const includeExpired = preferences.include_expired === true;
        const expiredWithinDays = clampNotificationDays(preferences.expired_within_days, 7);
        let defaultCarInsuranceRecipient: string | null = null;
        let defaultContractRecipient: string | null = null;

        if (canViewCarInsuranceWidget) {
          const recipientResult = await supabase
            .from("car_insurance_notification_recipients")
            .select("email")
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1);
          defaultCarInsuranceRecipient = String(recipientResult.data?.[0]?.email ?? "").trim().toLowerCase() || null;
        }

        if (canViewContractExpiringWidget) {
          const recipientResult = await supabase
            .from("contract_notification_recipients")
            .select("email")
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1);
          defaultContractRecipient = String(recipientResult.data?.[0]?.email ?? "").trim().toLowerCase() || null;
        }

        if (canViewExpiringWidget) {
          const { data: licData, error: licensureError } = await supabase
            .from("licensure")
            .select("applicant_id, driver_expiration, security_expiration, insurance_expiration")
            .limit(10000);

          if (!licensureError && licData?.length) {
            const applicantIds = Array.from(
              new Set((licData as Array<Record<string, unknown>>).map((row) => String(row.applicant_id ?? "")).filter(Boolean))
            );
            const applicantsResult = await supabase
              .from("applicants")
              .select("applicant_id, first_name, last_name, client_email, status, is_archived, is_trashed")
              .in("applicant_id", applicantIds);
            const applicantsById = new Map(
              ((applicantsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.applicant_id ?? ""), row])
            );

            const licenseDefinitions = [
              { key: "driver_expiration", type: "DRIVER_LICENSE", enabled: preferences.include_driver_license === true },
              { key: "security_expiration", type: "SECURITY_LICENSE", enabled: preferences.include_security_license !== false },
              { key: "insurance_expiration", type: "INSURANCE", enabled: preferences.include_insurance === true },
            ] as const;

            for (const licenseRow of licData as Array<Record<string, unknown>>) {
              const applicantId = String(licenseRow.applicant_id ?? "");
              const applicant = applicantsById.get(applicantId);
              if (!applicant) continue;
              if (String(applicant.status ?? "").trim().toUpperCase() !== "ACTIVE") continue;
              if (applicant.is_archived === true || applicant.is_trashed === true) continue;
              emailByApplicantId[applicantId] = String(applicant.client_email ?? "").trim() || null;

              for (const definition of licenseDefinitions) {
                if (!definition.enabled) continue;
                const expiresOn = String(licenseRow[definition.key] ?? "").slice(0, 10);
                const diffDays = daysUntilDateOnly(expiresOn, now);
                if (!expiresOn || !isWithinExpirationWindow(diffDays, daysBeforeExpiry, includeExpired, expiredWithinDays)) continue;
                rows.push({
                  applicant_id: applicantId,
                  first_name: applicant.first_name == null ? null : String(applicant.first_name),
                  last_name: applicant.last_name == null ? null : String(applicant.last_name),
                  recipient_email: emailByApplicantId[applicantId],
                  license_type: definition.type,
                  expires_on: expiresOn,
                  days_until_expiry: diffDays ?? 0,
                  source_kind: "licensure",
                });
              }
            }
          }
        }

        if (canViewCarInsuranceWidget) {
          const { data: othData, error: otherExpirationError } = await supabase
            .from("other_expiration_items")
            .select("id, item_name, expiration_type, make, model, plate_number, recipient_email, expires_on, car_registration_to_date, days_before_expiry, is_active, created_at, updated_at")
            .eq("expiration_type", "CAR_INSURANCE")
            .eq("is_active", true)
            .limit(10000);

          if (!otherExpirationError && othData) {
            for (const r of othData as Array<Record<string, unknown>>) {
              const title = String(r.item_name ?? "").trim() || [r.make, r.model, r.plate_number ? `(${r.plate_number})` : ""].filter(Boolean).join(" ") || "Vehicle Policy";
              const recipientEmail = String(r.recipient_email ?? "").trim().toLowerCase() || defaultCarInsuranceRecipient;
              const baseCreatedAt = r.created_at ? String(r.created_at) : null;
              const baseUpdatedAt = r.updated_at ? String(r.updated_at) : null;
              const rowDaysBefore = clampNotificationDays(r.days_before_expiry, daysBeforeExpiry);

              const policyExpStr = String(r.expires_on || "");
              if (policyExpStr) {
                const diffDays = daysUntilDateOnly(policyExpStr, now);
                if (isWithinExpirationWindow(diffDays, rowDaysBefore, includeExpired, expiredWithinDays)) {
                  rows.push({
                    applicant_id: `other:${r.id}`,
                    first_name: null,
                    last_name: null,
                    record_name: title,
                    recipient_email: recipientEmail,
                    license_type: "Other: Policy Term",
                    expires_on: policyExpStr,
                    days_until_expiry: diffDays ?? 0,
                    source_kind: "other",
                    created_at: baseCreatedAt,
                    updated_at: baseUpdatedAt,
                  });
                }
              }

              const regExpStr = String(r.car_registration_to_date || "");
              if (regExpStr) {
                const diffDays = daysUntilDateOnly(regExpStr, now);
                if (isWithinExpirationWindow(diffDays, rowDaysBefore, includeExpired, expiredWithinDays)) {
                  rows.push({
                    applicant_id: `other:${r.id}:reg`,
                    first_name: null,
                    last_name: null,
                    record_name: title,
                    recipient_email: recipientEmail,
                    license_type: "Other: Car Registration Date",
                    expires_on: regExpStr,
                    days_until_expiry: diffDays ?? 0,
                    source_kind: "other",
                    created_at: baseCreatedAt,
                    updated_at: baseUpdatedAt,
                  });
                }
              }
            }
          }
        }

        if (canViewContractExpiringWidget) {
          const { data: conData, error: contractError } = await supabase
            .from("contracts")
            .select("contract_id, contract_no, client_name, specific_area, project_name, contract_end, status, notification_recipient_email, created_at")
            .not("contract_end", "is", null)
            .limit(10000);

          if (!contractError && conData) {
            for (const r of conData as Array<Record<string, unknown>>) {
              if (!r.contract_end) continue;
              const status = String(r.status ?? "").trim().toUpperCase();
              if (status && status !== "ACTIVE") continue;
              const expiresOn = String(r.contract_end).slice(0, 10);
              const diffDays = daysUntilDateOnly(expiresOn, now);
              if (isWithinExpirationWindow(diffDays, daysBeforeExpiry, includeExpired, expiredWithinDays)) {
                const contractId = String(r.contract_id ?? "");
                const recordName = [
                  r.contract_no ? `Contract ${r.contract_no}` : "",
                  r.client_name,
                  r.specific_area,
                  r.project_name,
                ].map((value) => String(value ?? "").trim()).filter(Boolean).join(" - ") || "Contract";
                rows.push({
                  applicant_id: `contract:${contractId}`,
                  first_name: null,
                  last_name: null,
                  record_name: recordName,
                  recipient_email:
                    defaultContractRecipient ||
                    String(r.notification_recipient_email ?? "").trim().toLowerCase() ||
                    null,
                  license_type: "Contract Expiration",
                  expires_on: expiresOn,
                  days_until_expiry: diffDays ?? 0,
                  source_kind: "contract",
                  created_at: r.created_at ? String(r.created_at) : null,
                });
              }
            }
          }
        }

        const sentStats = new Map<string, { sent_count: number; last_sent_at: string | null; recipient_email: string | null }>();
        const dateKey = (value: unknown) => String(value ?? "").slice(0, 10);
        const summaryKey = (row: ExpiringSummaryRow) => {
          const applicantId = String(row.applicant_id ?? "");
          if (row.source_kind === "contract" || applicantId.startsWith("contract:")) {
            return `${applicantId}:${dateKey(row.expires_on)}`;
          }
          if (row.source_kind === "other" || applicantId.startsWith("other:")) {
            const itemId = applicantId.split(":")[1] ?? "";
            return `other:${itemId}:${dateKey(row.expires_on)}`;
          }
          return `${applicantId}:${row.license_type}:${dateKey(row.expires_on)}`;
        };
        const recordSentDelivery = (key: string, createdAt: unknown, recipientEmail: unknown) => {
          const previous = sentStats.get(key) ?? { sent_count: 0, last_sent_at: null, recipient_email: null };
          const timestamp = String(createdAt ?? "").trim() || null;
          const email = String(recipientEmail ?? "").trim().toLowerCase() || null;
          previous.sent_count += 1;
          if (timestamp && (!previous.last_sent_at || Date.parse(timestamp) > Date.parse(previous.last_sent_at))) {
            previous.last_sent_at = timestamp;
          }
          if (!previous.recipient_email && email) previous.recipient_email = email;
          sentStats.set(key, previous);
        };

        const licensureApplicantIds = Array.from(
          new Set(
            rows
              .filter((row) => row.source_kind === "licensure")
              .map((row) => String(row.applicant_id ?? ""))
              .filter(Boolean)
          )
        );
        if (licensureApplicantIds.length) {
          const logResult = await supabase
            .from("licensure_notification_log")
            .select("applicant_id, license_type, expires_on, recipient_email, created_at")
            .eq("status", "SENT")
            .in("applicant_id", licensureApplicantIds)
            .order("created_at", { ascending: false })
            .limit(5000);
          if (!logResult.error) {
            for (const entry of logResult.data ?? []) {
              recordSentDelivery(
                `${entry.applicant_id}:${entry.license_type}:${dateKey(entry.expires_on)}`,
                entry.created_at,
                entry.recipient_email
              );
            }
          }
        }

        const otherItemIds = Array.from(
          new Set(
            rows
              .filter((row) => row.source_kind === "other")
              .map((row) => Number(String(row.applicant_id ?? "").split(":")[1]))
              .filter((value) => Number.isFinite(value))
          )
        );
        if (otherItemIds.length) {
          const logResult = await supabase
            .from("other_expiration_notification_log")
            .select("other_expiration_item_id, expires_on, recipient_email, created_at")
            .eq("status", "SENT")
            .in("other_expiration_item_id", otherItemIds)
            .order("created_at", { ascending: false })
            .limit(5000);
          if (!logResult.error) {
            for (const entry of logResult.data ?? []) {
              recordSentDelivery(
                `other:${entry.other_expiration_item_id}:${dateKey(entry.expires_on)}`,
                entry.created_at,
                entry.recipient_email
              );
            }
          }
        }

        const contractIds = Array.from(
          new Set(
            rows
              .filter((row) => row.source_kind === "contract")
              .map((row) => String(row.applicant_id ?? "").replace(/^contract:/, ""))
              .filter(Boolean)
          )
        );
        if (contractIds.length) {
          const logResult = await supabase
            .from("contract_expiration_notification_log")
            .select("contract_id, expires_on, recipient_email, created_at")
            .eq("status", "SENT")
            .in("contract_id", contractIds)
            .order("created_at", { ascending: false })
            .limit(5000);
          if (!logResult.error) {
            for (const entry of logResult.data ?? []) {
              recordSentDelivery(
                `contract:${entry.contract_id}:${dateKey(entry.expires_on)}`,
                entry.created_at,
                entry.recipient_email
              );
            }
          }
        }

        for (const row of rows) {
          const stats = sentStats.get(summaryKey(row));
          row.sent_count = stats?.sent_count ?? 0;
          row.last_sent_at = stats?.last_sent_at ?? null;
          if (!row.recipient_email && stats?.recipient_email) row.recipient_email = stats.recipient_email;
        }

        const sortedRows = rows.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
        const dismissedKeys = readDismissedExpiringSummaryKeys();
        const visibleRows = sortedRows.filter((row) => !dismissedKeys.has(getExpiringSummaryRowKey(row))).slice(0, 100);
        for (const row of visibleRows) {
          if (row.source_kind === "other" || row.source_kind === "contract") {
            emailByApplicantId[row.applicant_id] = String(row.recipient_email ?? "").trim() || null;
          }
        }
        setExpiringEmailByApplicantId(emailByApplicantId);
        applyVisibleExpiringRows(visibleRows);
      } catch {
        applyVisibleExpiringRows([]);
        setExpiringEmailByApplicantId({});
      }
      return;
    }
    try {
      await refreshNotificationPrefs();
      const res = await api.notifications.getExpiringSummary({ limit: 100 });
      const permittedRows = [...(res?.rows ?? [])].filter((row) => {
        if (isContractExpiringRow(row)) return canViewContractExpiringWidget;
        if (isCarInsuranceExpiringRow(row)) return canViewCarInsuranceWidget;
        return canViewExpiringWidget;
      });
      const sortedRows = permittedRows.sort((a, b) => {
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
      const dismissedKeys = readDismissedExpiringSummaryKeys();
      const visibleRows = sortedRows.filter((row) => !dismissedKeys.has(getExpiringSummaryRowKey(row)));
      applyVisibleExpiringRows(visibleRows);

      try {
        const allRows = permittedRows;
        const map: Record<string, string | null> = {};

        for (const row of allRows) {
          const key = String(row?.applicant_id || "");
          if (key.startsWith("other:") || key.startsWith("contract:")) {
            const recipient = String(row?.recipient_email ?? "").trim();
            map[key] = recipient || null;
          }
        }

        const ids = Array.from(
          new Set(
            allRows
              .map((r) => String(r.applicant_id || ""))
              .filter(Boolean)
              .filter((id) => !id.startsWith("other:") && !id.startsWith("contract:"))
          )
        );

        if (!ids.length) {
          setExpiringEmailByApplicantId(map);
        } else {
          const { data, error } = await supabase
            .from("applicants")
            .select("applicant_id, client_email")
            .in("applicant_id", ids);
          if (error) {
            setExpiringEmailByApplicantId(map);
          } else {
            for (const row of ((data ?? []) as Array<{ applicant_id: string; client_email: string | null }>)) {
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
  }, [api, applyVisibleExpiringRows, canViewCarInsuranceWidget, canViewContractExpiringWidget, canViewExpiringWidget, refreshNotificationPrefs]);

  const clearExpiringNotifications = useCallback(async (rowsToClear: ExpiringSummaryRow[], label: string) => {
    if (!rowsToClear.length) return;

    const ok = window.confirm(`Clear all ${label} from this list?`);
    if (!ok) return;

    try {
      setClearingAllExpiring(true);
      const dismissedKeys = readDismissedExpiringSummaryKeys();
      for (const row of rowsToClear) {
        const key = getExpiringSummaryRowKey(row);
        if (key) dismissedKeys.add(key);
      }
      writeDismissedExpiringSummaryKeys(dismissedKeys);
      applyVisibleExpiringRows(
        expiringRows.filter((row) => !dismissedKeys.has(getExpiringSummaryRowKey(row)))
      );
      await refreshExpiring();
    } catch {
      // ignore
    } finally {
      setClearingAllExpiring(false);
    }
  }, [applyVisibleExpiringRows, expiringRows, refreshExpiring]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (cancelled) return;
        void refreshActivity();
        void refreshExpiring();
        void refreshPreview();
      }, 600);
    };

    const tables = [
      "applicants",
      "licensure",
      "other_expiration_items",
      "notification_preferences",
      "notification_email_settings",
      "notification_recipients",
      "car_insurance_notification_recipients",
      "contract_notification_recipients",
      "contracts",
      "licensure_notification_log",
      "other_expiration_notification_log",
      "contract_expiration_notification_log",
      "audit_log",
    ];

    const channels = tables.map((table) =>
      supabase
        .channel(`realtime:topnav:${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh)
        .subscribe()
    );

    const intervalId = window.setInterval(() => {
      scheduleRefresh();
    }, 15 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [refreshActivity, refreshExpiring, refreshPreview]);

  useEffect(() => {
    refreshActivity();
    refreshExpiring();
    refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    if (canViewRecentActivitiesWidget) {
      void refreshActivity();
    }
  }, [canViewRecentActivitiesWidget, refreshActivity]);

  useEffect(() => {
    if (canViewExpiringWidget || canViewCarInsuranceWidget || canViewContractExpiringWidget) {
      void refreshExpiring();
    }
  }, [canViewExpiringWidget, canViewCarInsuranceWidget, canViewContractExpiringWidget, refreshExpiring]);

  useEffect(() => {
    if (canViewPreviewWidget) {
      void refreshPreview();
    }
  }, [canViewPreviewWidget, refreshPreview]);

  const fromParam = searchParams?.get("from") ?? null;

  const menuActivePath = useMemo(() => {
    const isDetails = pathname.startsWith("/Main_Modules/Employees/details");
    if (!isDetails) return normalizeMenuPath(pathname);

    const from = fromParam;
    if (from && from.startsWith("/Main_Modules/")) return normalizeMenuPath(from);

    try {
      const last = sessionStorage.getItem("lastModulePath");
      if (last && last.startsWith("/Main_Modules/")) return normalizeMenuPath(last);
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
      sessionStorage.setItem("lastModulePath", normalizeMenuPath(pathname));
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

    if (typeof window !== "undefined") {
      window.location.replace("/Login/");
      return;
    }

    router.replace("/Login/");
  }

  function requestLogout() {
    setLogoutConfirmOpen(true);
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
    // Always allow reaching the Requests page so users can request access.
    fromDb.add("requests");

    if (sessionRole === "superadmin") {
      // Superadmin owns every registered navigation item. Building this from
      // ALL_MENU prevents newly added modules from silently disappearing.
      return new Set<ModuleKey>(ALL_MENU.map((item) => item.key as ModuleKey));
    }

    if (fromDb.size) {
      // Backwards-compatibility: older deployments used the `reassign` module key
      // to grant access to the Resigned page.
      if (fromDb.has("reassign") && !fromDb.has("resigned")) fromDb.add("resigned");

      // Treat the Logistics group as allowed if ANY logistics child module is allowed.
      if (fromDb.has("inventory") || fromDb.has("paraphernalia") || fromDb.has("car_insurance_expiration")) {
        fromDb.add("logistics");
      }

      return fromDb;
    }

    // Fallback (before RBAC modules are populated): keep UI usable.
    if (!sessionRole) return new Set<ModuleKey>(["requests"]);
    if (sessionRole === "admin") {
      return new Set<ModuleKey>([
        "dashboard",
        "applicants",
        "employees",
        "reassign",
        "resigned",
        "retired",
        "floating",
        "archive",
        "client",
        "inventory",
        "paraphernalia",
        "logistics",
        "settings",
        "audit",
        "requests",
        "recent_activities",
      ]);
    }
    return new Set<ModuleKey>(["dashboard", "applicants", "employees", "archive", "requests"]);
  }, [sessionRole, myModules]);

  const menu = useMemo(
    () => ALL_MENU.filter((m) => allowedKeys.has(m.key)),
    [allowedKeys]
  );

  useEffect(() => {
    if (!pathname || !sessionRole) return;
    if (!pathname.startsWith("/Main_Modules/")) return;

    const req = accessRequirementForPath(pathname);
    if (!req) return;

    if (req.kind === "superadmin") {
      if (sessionRole !== "superadmin") {
        router.replace("/Main_Modules/Requests/?module=access");
      }
      return;
    }

    if (sessionRole === "superadmin") return;

    const ok = allowedKeys.has(req.moduleKey);
    if (!ok) {
      router.replace(`/Main_Modules/Requests/?module=${encodeURIComponent(req.moduleKey)}`);
    }
  }, [pathname, sessionRole, allowedKeys, router]);

  const WORKFORCE_KEYS = useMemo(
    () => new Set(["applicants", "employees", "reassign", "resigned", "retired", "floating", "archive"]),
    []
  );

  const LOGISTICS_ITEMS = useMemo(
    () =>
      [
        { key: "logistics_inventory", moduleKey: "inventory" as const, name: "Inventory", href: "/Main_Modules/Inventory/", icon: Package },
        { key: "logistics_paraphernalia", moduleKey: "paraphernalia" as const, name: "Paraphernalia", href: "/Main_Modules/Paraphernalia/", icon: Package },
        { key: "logistics_car_insurance", moduleKey: "car_insurance_expiration" as const, name: "Car Insurance Expiration", href: "/Main_Modules/Logistics/CarInsuranceExpiration/", icon: ShieldCheck },
      ] as const,
    []
  );

  const ACCESS_ITEMS = useMemo(
    () =>
      [
        { key: "access_accounts", moduleKey: "access" as const, name: "Admin Accounts", href: "/Main_Modules/AdminAccounts/", icon: Shield },
        {
          key: "access_reviewer_queue",
          moduleKey: "access_reviewer_queue" as const,
          name: "Reviewer Queue",
          href: "/Main_Modules/Requests/Queue/",
          icon: ClipboardCheck,
        },
      ] as const,
    []
  );

  const accessItemsVisible = useMemo(
    () =>
      sessionRole === "superadmin"
        ? ACCESS_ITEMS
        : ACCESS_ITEMS.filter((item) => item.moduleKey === "access_reviewer_queue" && allowedKeys.has(item.moduleKey)),
    [ACCESS_ITEMS, allowedKeys, sessionRole]
  );

  const firstAccessKey = useMemo(
    () => menu.find((item) => item.key === "access" || item.key === "access_reviewer_queue")?.key ?? null,
    [menu]
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
    if (!collapsed) setAccessFlyoutOpen(false);
  }, [collapsed]);

  useEffect(() => {
    // Keep collapsed flyouts predictable after navigation.
    setWorkforceFlyoutOpen(false);
    setLogisticsFlyoutOpen(false);
    setAccessFlyoutOpen(false);
  }, [pathname]);

  const closeAllTopDropdowns = useCallback(() => {
    setUpdateOpen(false);
    setActivityOpen(false);
    setPreviewOpen(false);
    setExpiringOpen(false);
    setCarInsuranceExpiringOpen(false);
    setContractExpiringOpen(false);
    setAdminAlertOpen(false);
  }, []);

  useEffect(() => {
    function onDocClick(e: PointerEvent | MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      const isInsideDropdown =
        Boolean(document.querySelector("[data-update-menu]")?.contains(target)) ||
        Boolean(document.querySelector("[data-activity-menu]")?.contains(target)) ||
        Boolean(document.querySelector("[data-preview-menu]")?.contains(target)) ||
        Boolean(document.querySelector("[data-expiring-menu]")?.contains(target)) ||
        Boolean(document.querySelector("[data-car-insurance-expiring-menu]")?.contains(target)) ||
        Boolean(document.querySelector("[data-contract-expiring-menu]")?.contains(target)) ||
        Boolean(document.querySelector("[data-admin-alert-menu]")?.contains(target));

      if (!isInsideDropdown) {
        closeAllTopDropdowns();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAllTopDropdowns();
      }
    }

    document.addEventListener("pointerdown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeAllTopDropdowns]);

  useEffect(() => {
    if (!collapsed) return;

    function onDocDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      const clickedWorkforce =
        (workforceGroupRef.current?.contains(target) ?? false) ||
        (workforceFlyoutRef.current?.contains(target) ?? false);
      const clickedLogistics =
        (logisticsGroupRef.current?.contains(target) ?? false) ||
        (logisticsFlyoutRef.current?.contains(target) ?? false);
      const clickedAccess =
        (accessGroupRef.current?.contains(target) ?? false) ||
        (accessFlyoutRef.current?.contains(target) ?? false);
      if (clickedWorkforce || clickedLogistics || clickedAccess) return;

      setWorkforceFlyoutOpen(false);
      setLogisticsFlyoutOpen(false);
      setAccessFlyoutOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setWorkforceFlyoutOpen(false);
      setLogisticsFlyoutOpen(false);
      setAccessFlyoutOpen(false);
    }

    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed || !workforceFlyoutOpen) return;

    const update = () => {
      setWorkforceFlyoutPosition(getCollapsedFlyoutPosition(workforceButtonRef.current));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [collapsed, workforceFlyoutOpen]);

  useEffect(() => {
    if (!collapsed || !logisticsFlyoutOpen) return;

    const update = () => {
      setLogisticsFlyoutPosition(getCollapsedFlyoutPosition(logisticsButtonRef.current));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [collapsed, logisticsFlyoutOpen]);

  useEffect(() => {
    if (!collapsed || !accessFlyoutOpen) return;

    const update = () => {
      setAccessFlyoutPosition(getCollapsedFlyoutPosition(accessButtonRef.current));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [collapsed, accessFlyoutOpen]);

  useEffect(() => {
    if (!collapsed && workforceActive) setWorkforceOpen(true);
  }, [collapsed, workforceActive]);

  const logisticsAllowed = useMemo(() => {
    if (sessionRole === "superadmin") return true;
    return LOGISTICS_ITEMS.some((i) => allowedKeys.has(i.moduleKey));
  }, [LOGISTICS_ITEMS, allowedKeys, sessionRole]);

  const logisticsItemsVisible = useMemo(
    () =>
      sessionRole === "superadmin"
        ? LOGISTICS_ITEMS
        : LOGISTICS_ITEMS.filter((l) => allowedKeys.has(l.moduleKey)),
    [LOGISTICS_ITEMS, allowedKeys, sessionRole]
  );

  const logisticsActive = useMemo(() => {
    if (!logisticsAllowed) return false;
    return [
      "/Main_Modules/Logistics/",
      "/Main_Modules/Logistics/CarInsuranceExpiration/",
      "/Main_Modules/Inventory/",
      "/Main_Modules/Paraphernalia/",
    ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  }, [logisticsAllowed, pathname]);

  useEffect(() => {
    if (!collapsed && logisticsActive) setLogisticsOpen(true);
  }, [collapsed, logisticsActive]);

  const accessActive = useMemo(() => {
    if (!accessItemsVisible.length) return false;
    const childRouteActive = accessItemsVisible.some((item) => pathname === item.href || pathname.startsWith(item.href));
    const accountToolsActive =
      accessItemsVisible.some((item) => item.key === "access_accounts") &&
      ["/Main_Modules/Roles/", "/Main_Modules/Permissions/"].some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix)
      );
    return childRouteActive || accountToolsActive;
  }, [accessItemsVisible, pathname]);

  useEffect(() => {
    if (!collapsed && accessActive) setAccessOpen(true);
  }, [collapsed, accessActive]);

  function navLinkClass(active: boolean) {
    return `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active ? "bg-[#FFDA03] text-black" : "text-black hover:bg-yellow-100"
    }`;
  }

  const canUsePortal = typeof document !== "undefined";

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setCollapsed(true);
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
      {/* Mobile Sidebar Backdrop */}
      {!collapsed ? (
        <div
          onClick={() => setCollapsed(true)}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden animate-fade-in"
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={`bg-white border-r flex flex-col min-h-0 z-50
          transition-all duration-300 ease-in-out
          fixed inset-y-0 left-0 md:static
          ${collapsed ? "-translate-x-full md:translate-x-0 md:w-20" : "translate-x-0 w-72"}`}
      >
        <div className="px-5 pt-6 pb-4">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <Image src="/Logo-ui.png" alt="Faragon logo" width={40} height={40} className="h-10 w-10 shrink-0" priority />

            {!collapsed ? (
              <div className="leading-tight">
                <div className="font-brand-serif text-lg font-semibold text-gray-900">Faragon</div>
                <div className="font-brand-serif text-sm font-semibold text-gray-900">Security Agency, Inc.</div>
                <div className="mt-1 text-[11px] text-gray-500">Role: {sessionRole ?? "—"}</div>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-2 pb-3">
          {menu.map((item) => {
            // Render the workforce group once at the first workforce item.
            const isFirstWorkforce = firstWorkforceKey && item.key === firstWorkforceKey;
            if (isFirstWorkforce) {
              if (!workforceItems.length) return null;

              return (
                <div key="workforce" ref={workforceGroupRef} className="relative mb-1">
                  <button
                    ref={workforceButtonRef}
                    type="button"
                    onClick={() => {
                      if (collapsed) {
                        setWorkforceFlyoutPosition(getCollapsedFlyoutPosition(workforceButtonRef.current));
                        setWorkforceFlyoutOpen((v) => !v);
                        setLogisticsFlyoutOpen(false);
                        setAccessFlyoutOpen(false);
                        return;
                      }
                      setWorkforceOpen((v) => !v);
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

                  {!collapsed && workforceOpen ? (
                    <div className="mt-1 ml-4 pl-3 border-l border-gray-200 space-y-1">
                      {workforceItems.map((w) => {
                        const active =
                          menuActivePath === w.href || menuActivePath.startsWith(w.href);
                        return (
                          <Link
                            key={w.key}
                            href={w.href}
                            prefetch={false}
                            className={navLinkClass(active)}
                          >
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
                <div key="logistics" ref={logisticsGroupRef} className="relative mb-1">
                  <button
                    ref={logisticsButtonRef}
                    type="button"
                    onClick={() => {
                      if (collapsed) {
                        setLogisticsFlyoutPosition(getCollapsedFlyoutPosition(logisticsButtonRef.current));
                        setLogisticsFlyoutOpen((v) => !v);
                        setWorkforceFlyoutOpen(false);
                        setAccessFlyoutOpen(false);
                        return;
                      }
                      setLogisticsOpen((v) => !v);
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

                  {!collapsed && logisticsOpen ? (
                    <div className="mt-1 ml-4 pl-3 border-l border-gray-200 space-y-1">
                      {logisticsItemsVisible.map((l) => {
                        const active = pathname === l.href || pathname.startsWith(l.href);
                        return (
                          <Link
                            key={l.key}
                            href={l.href}
                            prefetch={false}
                            className={navLinkClass(active)}
                          >
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

            const isFirstAccess = firstAccessKey && item.key === firstAccessKey;
            if (isFirstAccess) {
              if (!accessItemsVisible.length) return null;

              return (
                <div key="access" ref={accessGroupRef} className="relative mb-1">
                  <button
                    ref={accessButtonRef}
                    type="button"
                    onClick={() => {
                      if (collapsed) {
                        setAccessFlyoutPosition(getCollapsedFlyoutPosition(accessButtonRef.current));
                        setAccessFlyoutOpen((v) => !v);
                        setWorkforceFlyoutOpen(false);
                        setLogisticsFlyoutOpen(false);
                        return;
                      }
                      setAccessOpen((v) => !v);
                    }}
                    className={navLinkClass(accessActive)}
                    aria-expanded={collapsed ? accessFlyoutOpen : accessOpen}
                  >
                    <Shield className="w-5 h-5 shrink-0" />
                    {!collapsed ? (
                      <span className="text-sm font-medium whitespace-nowrap">Admin Accounts</span>
                    ) : null}
                    {!collapsed ? (
                      <ChevronDown
                        className={`ml-auto w-4 h-4 transition-transform ${
                          accessOpen ? "rotate-180" : ""
                        }`}
                      />
                    ) : null}
                  </button>

                  {!collapsed && accessOpen ? (
                    <div className="mt-1 ml-4 pl-3 border-l border-gray-200 space-y-1">
                      {accessItemsVisible.map((a) => {
                        const active = pathname === a.href || pathname.startsWith(a.href);
                        return (
                          <Link
                            key={a.key}
                            href={a.href}
                            prefetch={false}
                            className={navLinkClass(active)}
                          >
                            <a.icon className="w-5 h-5 shrink-0" />
                            <span className="text-sm font-medium whitespace-nowrap">{a.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            if (item.key === "access" || item.key === "access_reviewer_queue") return null;

            const active =
              (menuActivePath === item.href || menuActivePath.startsWith(item.href)) &&
              !(item.key === "requests" && pathname.startsWith("/Main_Modules/Requests/Queue/"));

            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={false}
                className={navLinkClass(active)}
              >
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
        <header className="bg-white sticky top-0 z-40">
          <div className="px-4 sm:px-6 pt-4 sm:pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCollapsed((v) => !v)}
                  className="md:hidden p-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
                  aria-label="Toggle navigation menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div>
                  <div className="text-xl sm:text-2xl font-semibold text-gray-900">{pageTitle}</div>
                  <div className="text-xs text-gray-500">
                    Dashboard / {pageTitle}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Desktop App Updater Dropdown */}
                {typeof window !== "undefined" && Boolean((globalThis as any).electronAPI?.app) ? (
                  <div className="relative" data-update-menu>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !updateOpen;
                        closeAllTopDropdowns();
                        if (next) {
                          setUpdateOpen(true);
                          void handleCheckForUpdates();
                        }
                      }}
                      className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center hover:bg-[#ffe552] active:scale-95 transition-all duration-200 shadow-sm"
                      aria-label="Application Updates"
                      title="Check for Desktop Updates"
                    >
                      <Download className="w-5 h-5" />
                      {updateInfo?.updateAvailable || updateDownloaded ? (
                        <span
                          className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black inline-flex items-center justify-center shadow-md animate-pulse border-2 border-white leading-none select-none"
                          aria-label="Update available"
                        >
                          1
                        </span>
                      ) : null}
                    </button>

                    {updateOpen ? (
                      <div className="absolute right-0 mt-3 w-[360px] max-w-[90vw] rounded-2xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50 animate-slide-up">
                        <div className="px-5 py-3.5 border-b bg-gradient-to-r from-amber-50 to-orange-50/40 flex items-center justify-between">
                          <div className="text-sm font-black text-slate-900 tracking-wide">Desktop App Updates</div>
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">v{currentAppVersion}</span>
                        </div>

                        <div className="p-5 space-y-4 text-slate-800">
                          {updateChecking ? (
                            <div className="flex items-center gap-3 text-sm text-slate-600 font-semibold py-2">
                              <div className="h-4 w-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                              <span>Checking GitHub for updates...</span>
                            </div>
                          ) : updateDownloaded ? (
                            <div className="space-y-3">
                              <div className="text-sm font-bold text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                                ✓ Update Ready! Click below to restart and automatically apply the update.
                              </div>
                              <button
                                type="button"
                                onClick={handleInstallUpdate}
                                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 active:scale-95 transition-all shadow-md"
                              >
                                Restart & Install Now
                              </button>
                            </div>
                           ) : updateDownloading ? (
                            <div className="space-y-3">
                              <div className="flex justify-between text-xs font-bold text-slate-700">
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                                  Downloading update...
                                </span>
                                <span className="font-extrabold text-amber-700">{Math.round(updateProgress?.percent ?? 0)}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200 p-0.5">
                                <div
                                  className="bg-gradient-to-r from-amber-400 to-amber-600 h-full rounded-full transition-all duration-300 shadow-sm"
                                  style={{ width: `${Math.min(100, Math.max(2, updateProgress?.percent ?? 0))}%` }}
                                />
                              </div>
                              <div className="pt-1 flex items-center justify-between text-xs">
                                <span className="text-slate-400 text-[11px]">Please keep the app open</span>
                                <button
                                  type="button"
                                  onClick={handleCancelDownload}
                                  className="text-red-600 hover:text-red-800 font-extrabold text-xs underline transition-all"
                                >
                                  Cancel Download
                                </button>
                              </div>
                            </div>
                          ) : updateError ? (
                            <div className="space-y-3">
                              <div className="text-xs font-semibold text-red-700 bg-red-50 p-3 rounded-xl border border-red-200 leading-snug">
                                <div className="font-bold text-red-800 mb-1">Download Error</div>
                                {updateError}
                              </div>
                              <button
                                type="button"
                                onClick={handleDownloadUpdate}
                                className="w-full py-2.5 px-4 rounded-xl bg-[#8B1C1C] text-white font-bold text-sm hover:bg-[#a62323] active:scale-95 transition-all shadow-md"
                              >
                                Try Again
                              </button>
                            </div>
                          ) : updateInfo?.updateAvailable ? (
                            <div className="space-y-3">
                              <div className="text-sm font-semibold text-slate-700">
                                New version <span className="font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">v{updateInfo.version}</span> is available!
                              </div>
                              <button
                                type="button"
                                onClick={handleDownloadUpdate}
                                className="w-full py-2.5 px-4 rounded-xl bg-[#8B1C1C] text-white font-bold text-sm hover:bg-[#a62323] active:scale-95 transition-all shadow-md"
                              >
                                Download & Install Update
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="text-sm text-slate-600 font-medium">You are using the latest version of Faragon Database.</div>
                              <button
                                type="button"
                                onClick={handleCheckForUpdates}
                                className="w-full py-2 px-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-all"
                              >
                                Check for Updates Again
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {canViewRecentActivitiesWidget ? (
                <div className="relative" data-activity-menu>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !activityOpen;
                      closeAllTopDropdowns();
                      if (next) {
                        setActivityOpen(true);
                        refreshActivity();
                      }
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center hover:bg-[#ffe552] active:scale-95 transition-all duration-200 shadow-sm"
                    aria-label="Recent Activities"
                    title="Recent Activities"
                  >
                    <Activity className="w-5 h-5" />
                    {activityCount > 0 ? (
                      <span
                        className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black inline-flex items-center justify-center shadow-md animate-pulse border-2 border-white leading-none select-none"
                        aria-label={`Activity count ${activityCount}`}
                      >
                        {badgeText(activityCount)}
                      </span>
                    ) : null}
                  </button>

                  {activityOpen ? (
                    <div className="absolute right-0 mt-3 w-[380px] max-w-[90vw] rounded-2xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50 animate-slide-up">
                      <div className="px-5 py-3.5 border-b bg-gradient-to-r from-amber-50 to-orange-50/40 flex items-center justify-between">
                        <div className="text-sm font-black text-slate-900 tracking-wide">Recent Activities</div>
                        <Link
                          href="/Main_Modules/Audit/"
                          prefetch={false}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                          onClick={() => setActivityOpen(false)}
                        >
                          View all logs
                        </Link>
                      </div>

                      {activityMissingTable ? (
                        <div className="px-5 py-3 text-xs font-bold text-amber-800 bg-amber-50 border-b border-amber-100">
                          Please install the audit table (Supabase_database.sql).
                        </div>
                      ) : null}

                      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                        {recentActivity.length ? (
                          recentActivity.map((r) => (
                            <div key={r.id} className="px-5 py-3.5 hover:bg-slate-50/60 transition-all duration-200 flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] font-extrabold text-slate-400">{new Date(r.created_at).toLocaleString()}</div>
                                <div className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase border border-slate-200/60 truncate max-w-[120px]">{r.page || "System"}</div>
                              </div>
                              <div className="text-sm text-slate-900 font-bold leading-tight">{r.action}</div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                Actor: <span className="text-slate-700">{r.actor_name || r.actor_email || r.actor_user_id || "—"}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-5 py-8 text-center text-slate-400 font-semibold">No recent activity logs.</div>
                        )}
                      </div>

                      <div className="px-5 py-3 border-t bg-slate-50/60 flex items-center justify-between">
                        <button
                          type="button"
                          className="text-xs font-bold text-slate-600 hover:text-slate-800 hover:underline transition-all"
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
                          ✓ Mark all as seen
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {canViewExpiringWidget ? (
                <div className="relative" data-expiring-menu>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !expiringOpen;
                      closeAllTopDropdowns();
                      if (next) {
                        setExpiringOpen(true);
                        refreshExpiring();
                      }
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center hover:bg-[#ffe552] active:scale-95 transition-all duration-200 shadow-sm"
                    aria-label="Expiring Licenses and Records"
                    title="Expiring Licenses and Records"
                  >
                    <CreditCard className="w-5 h-5" />
                    {expiringCount > 0 ? (
                      <span
                        className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black inline-flex items-center justify-center shadow-md animate-pulse border-2 border-white leading-none select-none"
                        aria-label={`Expiring licenses and records count ${expiringCount}`}
                      >
                        {badgeText(expiringCount)}
                      </span>
                    ) : null}
                  </button>

                  {expiringOpen ? (
                    <div className="absolute right-0 mt-3 w-[420px] max-w-[92vw] rounded-2xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50 animate-slide-up">
                      <div className="px-5 py-3.5 border-b bg-gradient-to-r from-amber-50 to-orange-50/40 flex items-center justify-between">
                        <div className="text-sm font-black text-slate-900 tracking-wide">Expiring Licenses</div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                            disabled={!generalExpiringRows.length || clearingAllExpiring}
                            onClick={() => {
                              void clearExpiringNotifications(generalExpiringRows, "expiring licenses and records");
                            }}
                          >
                            {clearingAllExpiring ? "Clearing..." : "Clear all"}
                          </button>
                          <Link
                            href="/Main_Modules/Settings/"
                            prefetch={false}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                            onClick={() => setExpiringOpen(false)}
                          >
                            Settings
                          </Link>
                        </div>
                      </div>

                      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                        {generalExpiringRows.length ? (
                          generalExpiringRows.map((r, idx) => {
                            const isOtherRow = r.source_kind === "other" || String(r.applicant_id).startsWith("other:");
                            const canOpenDetails = !isOtherRow && Boolean(r.applicant_id);
                            const displayName = isOtherRow
                              ? (String(r.record_name ?? "").trim() || "Other Record")
                              : ((r.first_name || r.last_name)
                                ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()
                                : r.applicant_id);

                            return (
                              <div
                                key={`${r.applicant_id}:${r.license_type}:${idx}`}
                                role={canOpenDetails ? "button" : undefined}
                                tabIndex={canOpenDetails ? 0 : -1}
                                onKeyDown={(ev) => {
                                  if (!canOpenDetails) return;
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
                                  if (!canOpenDetails) return;
                                  router.push(
                                    `/Main_Modules/Employees/details/?id=${encodeURIComponent(
                                      r.applicant_id
                                    )}&from=${encodeURIComponent("/Main_Modules/Employees/")}`
                                  );
                                  setExpiringOpen(false);
                                }}
                                className={`px-5 py-3.5 hover:bg-[#fffbf0] hover:scale-[1.005] transition-all duration-200 flex flex-col gap-1.5 ${canOpenDetails ? "cursor-pointer" : "cursor-default"}`}
                                title={canOpenDetails ? "Open employee details" : "Other expiration record"}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-extrabold text-slate-900">{r.license_type}</div>
                                  <div className="text-xs font-bold text-slate-500">{r.expires_on}</div>
                                </div>
                                <div className="text-xs font-semibold text-slate-600">{displayName}</div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <div className="text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">Days: {r.days_until_expiry}</div>
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const badge = emailBadge(expiringEmailByApplicantId[String(r.applicant_id)] ?? null);
                                      const isSent = Number(r.sent_count ?? 0) > 0;
                                      const badgeClassName = isSent
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                        : `${badge.className} border-slate-200`;
                                      return (
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeClassName}`}>
                                          {badge.label}
                                        </span>
                                      );
                                    })()}
                                    <span
                                      className={
                                        (Number(r.sent_count ?? 0) > 0)
                                          ? "text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : "text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200"
                                      }
                                    >
                                      {(Number(r.sent_count ?? 0) > 0) ? `Sent ${r.sent_count}x` : "Not sent"}
                                    </span>

                                    {sendToEmployees && !isOtherRow ? (
                                      <button
                                        type="button"
                                        disabled={!api?.notifications?.resendLicensureNotice || resendingKey === `${r.applicant_id}:${r.license_type}:${r.expires_on}`}
                                        className="text-[11px] font-bold px-2.5 py-0.5 rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:scale-95 disabled:opacity-50 transition-all"
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
                                            // ignore
                                          } finally {
                                            setResendingKey(null);
                                          }
                                        }}
                                      >
                                        Resend
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                {r.last_sent_at ? (
                                  <div className="text-[11px] font-medium text-slate-400 mt-1">Last sent: {new Date(r.last_sent_at).toLocaleString()}</div>
                                ) : null}
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-5 py-8 text-center text-slate-400 font-semibold">No expiring licenses.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {canViewCarInsuranceWidget ? (
                <div className="relative" data-car-insurance-expiring-menu>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !carInsuranceExpiringOpen;
                      closeAllTopDropdowns();
                      if (next) {
                        setCarInsuranceExpiringOpen(true);
                        refreshExpiring();
                      }
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center hover:bg-[#ffe552] active:scale-95 transition-all duration-200 shadow-sm"
                    aria-label="Car Insurance Expiration"
                    title="Car Insurance Expiration"
                  >
                    <Truck className="w-5 h-5" />
                    {carInsuranceExpiringCount > 0 ? (
                      <span
                        className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black inline-flex items-center justify-center shadow-md animate-pulse border-2 border-white leading-none select-none"
                        aria-label={`Car insurance expiration count ${carInsuranceExpiringCount}`}
                      >
                        {badgeText(carInsuranceExpiringCount)}
                      </span>
                    ) : null}
                  </button>

                  {carInsuranceExpiringOpen ? (
                    <div className="absolute right-0 mt-3 w-[420px] max-w-[92vw] rounded-2xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50 animate-slide-up">
                      <div className="px-5 py-3.5 border-b bg-gradient-to-r from-amber-50 to-orange-50/40 flex items-center justify-between">
                        <div className="text-sm font-black text-slate-900 tracking-wide">Car Insurance Expiration</div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                            disabled={!carInsuranceExpiringRows.length || clearingAllExpiring}
                            onClick={() => {
                              void clearExpiringNotifications(carInsuranceExpiringRows, "car insurance expiration records");
                            }}
                          >
                            {clearingAllExpiring ? "Clearing..." : "Clear all"}
                          </button>
                          <Link
                            href="/Main_Modules/Logistics/CarInsuranceExpiration/"
                            prefetch={false}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                            onClick={() => setCarInsuranceExpiringOpen(false)}
                          >
                            Open module
                          </Link>
                        </div>
                      </div>

                      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                        {carInsuranceExpiringRows.length ? (
                          carInsuranceExpiringRows.map((r, idx) => {
                            const displayName = String(r.record_name ?? "").trim() || "Car Insurance Record";
                            return (
                              <div
                                key={`${r.applicant_id}:${r.license_type}:${idx}`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(ev) => {
                                  if (ev.key !== "Enter" && ev.key !== " ") return;
                                  ev.preventDefault();
                                  router.push("/Main_Modules/Logistics/CarInsuranceExpiration/");
                                  setCarInsuranceExpiringOpen(false);
                                }}
                                onClick={() => {
                                  router.push("/Main_Modules/Logistics/CarInsuranceExpiration/");
                                  setCarInsuranceExpiringOpen(false);
                                }}
                                className="px-5 py-3.5 hover:bg-[#fffbf0] hover:scale-[1.005] transition-all duration-200 flex flex-col gap-1.5 cursor-pointer"
                                title="Open car insurance expiration module"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-extrabold text-slate-900">{r.license_type}</div>
                                  <div className="text-xs font-bold text-slate-500">{r.expires_on}</div>
                                </div>
                                <div className="text-xs font-semibold text-slate-600">{displayName}</div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <div className="text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">Days: {r.days_until_expiry}</div>
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const badge = emailBadge(expiringEmailByApplicantId[String(r.applicant_id)] ?? null);
                                      const isSent = Number(r.sent_count ?? 0) > 0;
                                      const badgeClassName = isSent
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                        : `${badge.className} border-slate-200`;
                                      return (
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeClassName}`}>
                                          {badge.label}
                                        </span>
                                      );
                                    })()}
                                    <span
                                      className={
                                        (Number(r.sent_count ?? 0) > 0)
                                          ? "text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : "text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200"
                                      }
                                    >
                                      {(Number(r.sent_count ?? 0) > 0) ? `Sent ${r.sent_count}x` : "Not sent"}
                                    </span>
                                  </div>
                                </div>
                                {r.last_sent_at ? (
                                  <div className="text-[11px] font-medium text-slate-400 mt-1">Last sent: {new Date(r.last_sent_at).toLocaleString()}</div>
                                ) : null}
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-5 py-8 text-center text-slate-400 font-semibold">No expiring car insurance records.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {canViewContractExpiringWidget ? (
                <div className="relative" data-contract-expiring-menu>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !contractExpiringOpen;
                      closeAllTopDropdowns();
                      if (next) {
                        setContractExpiringOpen(true);
                        refreshExpiring();
                      }
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center hover:bg-[#ffe552] active:scale-95 transition-all duration-200 shadow-sm"
                    aria-label="Expiring Contracts"
                    title="Expiring Contracts"
                  >
                    <ClipboardCheck className="w-5 h-5" />
                    {contractExpiringCount > 0 ? (
                      <span
                        className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black inline-flex items-center justify-center shadow-md animate-pulse border-2 border-white leading-none select-none"
                        aria-label={`Expiring contracts count ${contractExpiringCount}`}
                      >
                        {badgeText(contractExpiringCount)}
                      </span>
                    ) : null}
                  </button>

                  {contractExpiringOpen ? (
                    <div className="absolute right-0 mt-3 w-[420px] max-w-[92vw] rounded-2xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50 animate-slide-up">
                      <div className="px-5 py-3.5 border-b bg-gradient-to-r from-amber-50 to-orange-50/40 flex items-center justify-between">
                        <div className="text-sm font-black text-slate-900 tracking-wide">Expiring Contracts</div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                            disabled={!contractExpiringRows.length || clearingAllExpiring}
                            onClick={() => {
                              void clearExpiringNotifications(contractExpiringRows, "expiring contracts");
                            }}
                          >
                            {clearingAllExpiring ? "Clearing..." : "Clear all"}
                          </button>
                          <Link
                            href="/Main_Modules/Client/"
                            prefetch={false}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                            onClick={() => setContractExpiringOpen(false)}
                          >
                            Open Client
                          </Link>
                        </div>
                      </div>

                      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                        {contractExpiringRows.length ? (
                          contractExpiringRows.map((r, idx) => {
                            const displayName = String(r.record_name ?? "").trim() || "Contract";
                            const isUrgent = Number(r.days_until_expiry) <= 10;
                            return (
                              <div
                                key={`${r.applicant_id}:${r.expires_on}:${idx}`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(ev) => {
                                  if (ev.key !== "Enter" && ev.key !== " ") return;
                                  ev.preventDefault();
                                  router.push("/Main_Modules/Client/");
                                  setContractExpiringOpen(false);
                                }}
                                onClick={() => {
                                  router.push("/Main_Modules/Client/");
                                  setContractExpiringOpen(false);
                                }}
                                className="px-5 py-3.5 hover:bg-[#fffbf0] hover:scale-[1.005] transition-all duration-200 flex flex-col gap-1.5 cursor-pointer"
                                title="Open Client module"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-extrabold text-slate-900">{r.license_type}</div>
                                  <div className="text-xs font-bold text-slate-500">{r.expires_on}</div>
                                </div>
                                <div className="text-xs font-semibold text-slate-600">{displayName}</div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <div className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md border ${
                                    isUrgent
                                      ? "bg-red-50 text-red-700 border-red-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                                  }`}>
                                    Days: {r.days_until_expiry}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const badge = emailBadge(expiringEmailByApplicantId[String(r.applicant_id)] ?? null);
                                      const isSent = Number(r.sent_count ?? 0) > 0;
                                      const badgeClassName = isSent
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                        : `${badge.className} border-slate-200`;
                                      return (
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeClassName}`}>
                                          {badge.label}
                                        </span>
                                      );
                                    })()}
                                    <span
                                      className={
                                        (Number(r.sent_count ?? 0) > 0)
                                          ? "text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : "text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200"
                                      }
                                    >
                                      {(Number(r.sent_count ?? 0) > 0) ? `Sent ${r.sent_count}x` : "Not sent"}
                                    </span>
                                  </div>
                                </div>
                                {r.last_sent_at ? (
                                  <div className="text-[11px] font-medium text-slate-400 mt-1">Last sent: {new Date(r.last_sent_at).toLocaleString()}</div>
                                ) : null}
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-5 py-8 text-center text-slate-400 font-semibold">No expiring contracts.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {canViewPreviewWidget ? (
                <div className="relative" data-preview-menu>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !previewOpen;
                      closeAllTopDropdowns();
                      if (next) {
                        setPreviewOpen(true);
                        refreshPreview();
                      }
                    }}
                    className="relative h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center hover:bg-[#ffe552] active:scale-95 transition-all duration-200 shadow-sm"
                    aria-label="Preview (1+ year of service)"
                    title="Preview (1+ year of service)"
                  >
                    <Users className="w-5 h-5" />
                    {previewCount > 0 ? (
                      <span
                        className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black inline-flex items-center justify-center shadow-md animate-pulse border-2 border-white leading-none select-none"
                        aria-label={`Preview employees count ${previewCount}`}
                      >
                        {badgeTextWide(previewCount)}
                      </span>
                    ) : null}
                  </button>

                  {previewOpen ? (
                    <div className="absolute right-0 mt-3 w-[520px] max-w-[92vw] rounded-2xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50 animate-slide-up">
                      <div className="px-5 py-3.5 border-b bg-gradient-to-r from-amber-50 to-orange-50/40 flex items-center justify-between">
                        <div className="text-sm font-black text-slate-900 tracking-wide">Preview (1+ year of service)</div>
                        <div className="text-xs font-bold text-slate-500">Hire date-based</div>
                      </div>

                      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                        {previewRows.length ? (
                          previewRows.map((e) => (
                            <div
                              key={e.applicant_id}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(ev) => {
                                if (ev.key !== "Enter" && ev.key !== " ") return;
                                ev.preventDefault();
                                router.push(
                                  `/Main_Modules/Employees/details/?id=${encodeURIComponent(
                                    e.applicant_id
                                  )}&from=${encodeURIComponent("/Main_Modules/Employees/")}`
                                );
                                setPreviewOpen(false);
                              }}
                              onClick={() => {
                                router.push(
                                  `/Main_Modules/Employees/details/?id=${encodeURIComponent(
                                    e.applicant_id
                                  )}&from=${encodeURIComponent("/Main_Modules/Employees/")}`
                                );
                                setPreviewOpen(false);
                              }}
                              className="px-5 py-3.5 hover:bg-[#fffbf0] hover:scale-[1.005] transition-all duration-200 flex flex-col gap-1 cursor-pointer"
                              title="Open employee details"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-extrabold text-slate-900 truncate">
                                  {fullName(e.first_name, e.last_name)}
                                </div>
                                <div className="text-xs font-bold text-slate-500 whitespace-nowrap">
                                  {e.date_hired_fsai ? new Date(e.date_hired_fsai).toLocaleDateString() : "—"}
                                </div>
                              </div>
                              <div className="text-xs font-semibold text-slate-600 truncate">
                                {(e.client_position ?? "—")} • {(e.detachment ?? "—")}
                              </div>
                              <div className="mt-1 text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 w-fit">Service: {formatServiceLengthShort(e.date_hired_fsai)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="px-5 py-8 text-center text-slate-400 font-semibold">No employees match the 1+ year of service criteria.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {/* <button
                  type="button"
                  className="h-10 w-10 rounded-xl bg-[#FFDA03] text-black flex items-center justify-center"
                  aria-label="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button> */}

                <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-1.5 flex items-center gap-2">
                  <div className="h-10 w-10 rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center shrink-0">
                    {currentAdmin.profileImageUrl ? (
                      <div
                        role="img"
                        aria-label={adminDisplayName}
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url("${currentAdmin.profileImageUrl}")` }}
                      />
                    ) : (
                      <span className="text-xs font-semibold text-gray-600">{adminInitials}</span>
                    )}
                  </div>
                  <div className="hidden sm:block min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{adminDisplayName}</div>
                    <div className="text-[11px] text-gray-500 truncate">{currentAdmin.username || (sessionRole ?? "Admin")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,244,236,0.76)_40%,rgba(236,242,249,0.84)_100%)]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-[#FFDA03]/15 blur-3xl" />
            <div className="absolute bottom-8 left-6 h-72 w-72 rounded-full bg-[#8B1C1C]/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/80 to-transparent" />
          </div>

          <div className="relative border-b border-white/70 bg-white/75 px-6 py-4 backdrop-blur-xl animate-fade-in">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8B1C1C] text-white shadow-lg shadow-[#8B1C1C]/20">
                  <PageIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B1C1C]">Current module</div>
                  <div className="text-xl font-semibold text-slate-900">{pageMeta.title}</div>
                </div>
              </div>
              <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                {pageMeta.badge}
              </div>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">{pageMeta.description}</p>
          </div>

          <main
            className="app-page-scroll relative flex-1 min-h-0 overflow-x-hidden px-4 pb-10 pt-6 sm:px-6 lg:px-8"
            data-app-scroll-container
            onWheelCapture={routeTableWheelToPage}
          >
            <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">{children}</div>
          </main>
        </div>
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
                className="px-4 py-2 rounded-xl border text-sm text-black hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {collapsed && workforceFlyoutOpen && workforceFlyoutPosition && canUsePortal
        ? createPortal(
            <div
              ref={workforceFlyoutRef}
              className="fixed z-[85] w-60 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl"
              style={{ top: workforceFlyoutPosition.top, left: workforceFlyoutPosition.left }}
            >
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Workforce</div>
              <div className="mt-1 space-y-1 max-h-[62vh] overflow-y-auto">
                {workforceItems.map((w) => {
                  const active = menuActivePath === w.href || menuActivePath.startsWith(w.href);
                  return (
                    <Link
                      key={w.key}
                      href={w.href}
                      prefetch={false}
                      title={w.name}
                      aria-label={w.name}
                      onClick={() => setWorkforceFlyoutOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
                        active ? "bg-[#FFDA03] text-black" : "text-gray-700 hover:bg-yellow-100"
                      }`}
                    >
                      <w.icon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium whitespace-nowrap">{w.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}

      {collapsed && logisticsFlyoutOpen && logisticsFlyoutPosition && canUsePortal
        ? createPortal(
            <div
              ref={logisticsFlyoutRef}
              className="fixed z-[85] w-60 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl"
              style={{ top: logisticsFlyoutPosition.top, left: logisticsFlyoutPosition.left }}
            >
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Logistics</div>
              <div className="mt-1 space-y-1 max-h-[62vh] overflow-y-auto">
                {logisticsItemsVisible.map((l) => {
                  const active = pathname === l.href || pathname.startsWith(l.href);
                  return (
                    <Link
                      key={l.key}
                      href={l.href}
                      prefetch={false}
                      title={l.name}
                      aria-label={l.name}
                      onClick={() => setLogisticsFlyoutOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
                        active ? "bg-[#FFDA03] text-black" : "text-gray-700 hover:bg-yellow-100"
                      }`}
                    >
                      <l.icon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium whitespace-nowrap">{l.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}

      {accessItemsVisible.length > 0 && collapsed && accessFlyoutOpen && accessFlyoutPosition && canUsePortal
        ? createPortal(
            <div
              ref={accessFlyoutRef}
              className="fixed z-[85] w-60 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl"
              style={{ top: accessFlyoutPosition.top, left: accessFlyoutPosition.left }}
            >
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Admin Accounts</div>
              <div className="mt-1 space-y-1 max-h-[62vh] overflow-y-auto">
                {accessItemsVisible.map((a) => {
                  const active = pathname === a.href || pathname.startsWith(a.href);
                  return (
                    <Link
                      key={a.key}
                      href={a.href}
                      prefetch={false}
                      title={a.name}
                      aria-label={a.name}
                      onClick={() => setAccessFlyoutOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
                        active ? "bg-[#FFDA03] text-black" : "text-gray-700 hover:bg-yellow-100"
                      }`}
                    >
                      <a.icon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium whitespace-nowrap">{a.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default function MainModulesLayout({ children }: LayoutProps) {
  return (
    <Suspense fallback={<section className="min-h-screen w-full bg-[#F5F6F8]" />}>
      <MainModulesLayoutInner>{children}</MainModulesLayoutInner>
    </Suspense>
  );
}

