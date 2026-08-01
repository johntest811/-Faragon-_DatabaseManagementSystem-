"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtimeRefresh } from "../Client/useRealtimeRefresh";
import SplashScreen from "./SplashScreen";
import ToastProvider from "./ToastProvider";

type SplashReason = "startup" | "logout" | "login" | null;
type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
    addEventListener?: (type: "change", listener: () => void) => void;
    removeEventListener?: (type: "change", listener: () => void) => void;
  };
};

const APP_REFRESH_TABLES = [
  "admins",
  "app_roles",
  "role_module_access",
  "role_column_access",
  "modules",
  "applicants",
  "applicant_other_documents",
  "access_requests",
  "contracts",
  "contract_employees",
  "inventory_fixed_asset",
  "paraphernalia",
  "paraphernalia_inventory",
  "restock",
  "notification_preferences",
  "notification_email_settings",
  "notification_recipients",
  "car_insurance_notification_recipients",
  "contract_notification_recipients",
  "other_expiration_items",
  "licensure",
  "audit_log",
];

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const isLoginRoute = pathname.startsWith("/Login");
  const [startupSplashPending, setStartupSplashPending] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFadingOut, setSplashFadingOut] = useState(false);
  const [splashReason, setSplashReason] = useState<SplashReason>("startup");
  const [isOnline, setIsOnline] = useState(true);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const wasOnlineRef = useRef(true);
  const splashFinishTimerRef = useRef<number | null>(null);
  const splashFinishingRef = useRef(false);
  const nonStartupSplashShownRef = useRef(false);

  useRealtimeRefresh(APP_REFRESH_TABLES, {
    debounceMs: isSlowConnection ? 1800 : 900,
    disabled: !isOnline || isLoginRoute,
  });

  useEffect(() => {
    const updateNetworkState = () => {
      const nav = navigator as NavigatorWithConnection;
      const connection = nav.connection;
      const effectiveType = String(connection?.effectiveType ?? "").toLowerCase();

      setIsOnline(nav.onLine !== false);
      setIsSlowConnection(Boolean(connection?.saveData) || effectiveType === "slow-2g" || effectiveType === "2g");
    };

    updateNetworkState();
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);

    const connection = (navigator as NavigatorWithConnection).connection;
    connection?.addEventListener?.("change", updateNetworkState);

    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
      connection?.removeEventListener?.("change", updateNetworkState);
    };
  }, []);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    if (!isOnline || wasOnline || isLoginRoute) return;
    const refreshTimer = window.setTimeout(() => {
      router.refresh();
    }, 600);

    return () => window.clearTimeout(refreshTimer);
  }, [isLoginRoute, isOnline, router]);

  useLayoutEffect(() => {
    let logoutRequested = false;
    let loginRequested = false;
    try {
      logoutRequested = window.sessionStorage.getItem("showLogoutSplash") === "1";
      loginRequested = window.sessionStorage.getItem("showLoginSplash") === "1";
    } catch {
      logoutRequested = false;
      loginRequested = false;
    }

    const requestedReason: SplashReason =
      pathname.startsWith("/Login") && logoutRequested
        ? "logout"
        : pathname.startsWith("/Main_Modules") && loginRequested
          ? "login"
          : startupSplashPending && !nonStartupSplashShownRef.current
            ? "startup"
            : null;

    if (requestedReason) {
      if (splashFinishTimerRef.current !== null) {
        window.clearTimeout(splashFinishTimerRef.current);
        splashFinishTimerRef.current = null;
      }
      splashFinishingRef.current = false;

      try {
        if (requestedReason === "logout") window.sessionStorage.removeItem("showLogoutSplash");
        if (requestedReason === "login") window.sessionStorage.removeItem("showLoginSplash");
      } catch {
        // ignore
      }

      if (requestedReason === "logout" || requestedReason === "login") {
        nonStartupSplashShownRef.current = true;
      }

      setSplashReason(requestedReason);
      setShowSplash(true);
      setSplashFadingOut(false);
      return;
    }

    if (nonStartupSplashShownRef.current || startupSplashPending) return;

    setShowSplash(false);
    setSplashReason(null);
    setSplashFadingOut(false);
  }, [pathname, startupSplashPending]);

  useEffect(() => {
    return () => {
      if (splashFinishTimerRef.current !== null) {
        window.clearTimeout(splashFinishTimerRef.current);
      }
    };
  }, []);

  function handleSplashFinish() {
    if (splashFinishingRef.current) return;
    splashFinishingRef.current = true;
    setSplashFadingOut(true);
    splashFinishTimerRef.current = window.setTimeout(() => {
      splashFinishTimerRef.current = null;
      setShowSplash(false);
      setSplashFadingOut(false);
      setStartupSplashPending(false);
      setSplashReason(null);
      splashFinishingRef.current = false;
    }, 500);
  }

  return (
    <ToastProvider>
      {!isOnline || isSlowConnection ? (
        <div className="fixed left-1/2 top-3 z-[120] w-[min(92vw,720px)] -translate-x-1/2 rounded-2xl border border-black/10 bg-black px-4 py-3 text-center text-sm font-medium text-white shadow-2xl">
          {!isOnline
            ? "You are offline. The app will pause live refreshes and reconnect automatically when internet returns."
            : "Slow internet detected. The app is reducing live refresh frequency and allowing longer database requests."}
        </div>
      ) : null}
      <div className={`transition-opacity duration-500 ${showSplash ? "opacity-0" : "opacity-100"}`}>
        {children}
      </div>
      {showSplash ? (
        <SplashScreen
          key={splashReason ?? "splash"}
          fadingOut={splashFadingOut}
          onFinish={handleSplashFinish}
        />
      ) : null}
    </ToastProvider>
  );
}
