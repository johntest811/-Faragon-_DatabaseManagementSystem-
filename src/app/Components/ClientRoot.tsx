"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import SplashScreen from "./SplashScreen";
import ToastProvider from "./ToastProvider";

type SplashReason = "startup" | "logout" | "login" | null;

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [startupSplashPending, setStartupSplashPending] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFadingOut, setSplashFadingOut] = useState(false);
  const [splashReason, setSplashReason] = useState<SplashReason>("startup");

  useEffect(() => {
    let logoutRequested = false;
    let loginRequested = false;
    try {
      logoutRequested = window.sessionStorage.getItem("showLogoutSplash") === "1";
      loginRequested = window.sessionStorage.getItem("showLoginSplash") === "1";
    } catch {
      logoutRequested = false;
      loginRequested = false;
    }

    const shouldShowLogoutSplash = pathname.startsWith("/Login") && logoutRequested;
    const shouldShowLoginSplash = pathname.startsWith("/Main_Modules") && loginRequested;

    if (shouldShowLogoutSplash) {
      setSplashReason("logout");
      setShowSplash(true);
      setSplashFadingOut(false);
      return;
    }

    if (shouldShowLoginSplash) {
      setSplashReason("login");
      setShowSplash(true);
      setSplashFadingOut(false);
      return;
    }

    if (startupSplashPending) {
      setSplashReason("startup");
      setShowSplash(true);
      return;
    }

    setShowSplash(false);
    setSplashReason(null);
    if (!startupSplashPending) {
      setSplashFadingOut(false);
    }
  }, [pathname, startupSplashPending]);

  function handleSplashFinish() {
    const reason = splashReason;
    setSplashFadingOut(true);
    window.setTimeout(() => {
      setShowSplash(false);
      setSplashFadingOut(false);

      if (startupSplashPending) {
        setStartupSplashPending(false);
      }

      try {
        if (reason === "logout") {
          window.sessionStorage.removeItem("showLogoutSplash");
        }
        if (reason === "login") {
          window.sessionStorage.removeItem("showLoginSplash");
        }
      } catch {
        // ignore
      }

      setSplashReason(null);
    }, 500);
  }

  return (
    <ToastProvider>
      <div className={`transition-opacity duration-500 ${showSplash ? "opacity-0" : "opacity-100"}`}>
        {children}
      </div>
      {showSplash ? (
        <SplashScreen
          fadingOut={splashFadingOut}
          onFinish={handleSplashFinish}
        />
      ) : null}
    </ToastProvider>
  );
}
