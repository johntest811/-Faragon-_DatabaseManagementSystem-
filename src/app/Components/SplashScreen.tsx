"use client";

import { useEffect, useRef, useState } from "react";

type SplashScreenProps = {
  onFinish?: () => void;
  fadingOut?: boolean;
};

type SplashScreenElectronApi = {
  app?: {
    onWindowShown?: (callback: () => void) => () => void;
  };
};

export default function SplashScreen({
  onFinish,
  fadingOut = false,
}: SplashScreenProps) {
  const [bgBlack, setBgBlack] = useState(false);
  const [progress, setProgress] = useState(0);
  const finishRef = useRef(onFinish);

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    let bgTimer: NodeJS.Timeout | null = null;
    let finishTimer: NodeJS.Timeout | null = null;
    let interval: NodeJS.Timeout | null = null;

    function startAnimation() {
      if (bgTimer) clearTimeout(bgTimer);
      if (finishTimer) clearTimeout(finishTimer);
      if (interval) clearInterval(interval);

      setBgBlack(false);
      setProgress(0);

      const started = Date.now();
      const totalMs = 4200;

      bgTimer = setTimeout(() => setBgBlack(true), 1500);

      interval = setInterval(() => {
        const elapsed = Date.now() - started;
        const pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
        setProgress(pct);
      }, 30);

      finishTimer = setTimeout(() => finishRef.current?.(), totalMs);
    }

    startAnimation();

    const electronAPI = (globalThis as { electronAPI?: SplashScreenElectronApi }).electronAPI;
    const unsub = electronAPI?.app?.onWindowShown?.(() => {
      startAnimation();
    });

    return () => {
      if (bgTimer) clearTimeout(bgTimer);
      if (finishTimer) clearTimeout(finishTimer);
      if (interval) clearInterval(interval);
      unsub?.();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-500 ${
        bgBlack ? "bg-black" : "bg-white"
      } ${fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      <div className="mb-7 relative h-40 w-40 md:h-48 md:w-48 overflow-hidden">
        <img
          src="/Logo2.png"
          alt="Faragon Logo Base"
          className="absolute inset-0 h-full w-full object-contain opacity-20"
        />
        <div
          className="absolute inset-0 overflow-hidden transition-all duration-75"
          style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }}
        >
          <img
            src="/Logo2.png"
            alt="Faragon Logo"
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <h1
        className="font-brand-serif px-4 text-center text-lg font-black uppercase tracking-[0.2em] drop-shadow-[0_3px_10px_rgba(0,0,0,0.35)] md:text-2xl"
        style={{
          backgroundImage: bgBlack
            ? `linear-gradient(to right, #ffffff ${progress}%, rgba(255,255,255,0.25) ${progress}%)`
            : `linear-gradient(to right, #b91c1c ${progress}%, rgba(185,28,28,0.30) ${progress}%)`,
          WebkitBackgroundClip: "text",
          color: "transparent",
          transition: "background-image 120ms linear",
        }}
      >
        FARAGON SECURITY AGENCY INC.
      </h1>

      <style jsx>{`
        :global(body) {
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
