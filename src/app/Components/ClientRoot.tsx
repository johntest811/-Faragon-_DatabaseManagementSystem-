"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import SplashScreen from "./SplashScreen";

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [logoutSplashRequested, setLogoutSplashRequested] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("showLogoutSplash") === "1";
  });
  const shouldSkipSplash = pathname.startsWith("/Login") && !logoutSplashRequested;
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return true;
    const requested = window.sessionStorage.getItem("showLogoutSplash") === "1";
    if (requested) return true;
    return !window.location.pathname.startsWith("/Login");
  });
  const [splashFadingOut, setSplashFadingOut] = useState(false);

  useEffect(() => {
    if (shouldSkipSplash) {
      setShowSplash(false);
      setSplashFadingOut(false);
    }
  }, [shouldSkipSplash]);

  useEffect(() => {
    // If some page (Dashboard/sidebar logout) requested a logout splash, ensure we
    // show it even though ClientRoot stays mounted across route changes.
    if (!pathname.startsWith("/Login")) return;
    let requested = false;
    try {
      requested = window.sessionStorage.getItem("showLogoutSplash") === "1";
    } catch {
      requested = false;
    }
    if (!requested) return;

    setLogoutSplashRequested(true);
    setShowSplash(true);
    setSplashFadingOut(false);
  }, [pathname]);

  function handleSplashFinish() {
    setSplashFadingOut(true);
    window.setTimeout(() => {
      const wasLogoutSplash = logoutSplashRequested;
      setShowSplash(false);
      setSplashFadingOut(false);
      try {
        window.sessionStorage.removeItem("showLogoutSplash");
      } catch {
        // ignore
      }
      setLogoutSplashRequested(false);

      // If this splash was triggered by logout, force a full refresh on the Login page.
      // This avoids stale UI state and improves Electron focus/typing reliability.
      if (wasLogoutSplash && window.location.pathname.startsWith("/Login")) {
        window.setTimeout(() => {
          try {
            window.location.reload();
          } catch {
            // ignore
          }
        }, 50);
      }
    }, 500);
  }

  return (
    <>
      <div className={`transition-opacity duration-500 ${showSplash && !shouldSkipSplash ? "opacity-0" : "opacity-100"}`}>
        {children}
      </div>
      {showSplash && !shouldSkipSplash ? (
        <SplashScreen fadingOut={splashFadingOut} onFinish={handleSplashFinish} />
      ) : null}
    </>
  );
}
