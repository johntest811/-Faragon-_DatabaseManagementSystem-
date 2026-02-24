"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import SplashScreen from "./SplashScreen";

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const shouldSkipSplash = pathname.startsWith("/Login");
  const [showSplash, setShowSplash] = useState(true);
  const [splashFadingOut, setSplashFadingOut] = useState(false);

  function handleSplashFinish() {
    setSplashFadingOut(true);
    window.setTimeout(() => {
      setShowSplash(false);
      setSplashFadingOut(false);
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
