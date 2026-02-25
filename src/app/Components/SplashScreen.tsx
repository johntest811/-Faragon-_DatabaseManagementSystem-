"use client";

import { useEffect, useState } from "react";

type SplashScreenProps = {
  onFinish?: () => void;
  fadingOut?: boolean;
};

export default function SplashScreen({ onFinish, fadingOut = false }: SplashScreenProps) {
  const [bgBlack, setBgBlack] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const totalMs = 2300;
    const bgTimer = setTimeout(() => setBgBlack(true), 1200);

    const interval = setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
      setProgress(pct);
    }, 30);

    const finishTimer = setTimeout(() => onFinish?.(), totalMs);

    return () => {
      clearTimeout(bgTimer);
      clearTimeout(finishTimer);
      clearInterval(interval);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-500 ${
        bgBlack ? "bg-black" : "bg-white"
      } ${fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      <div className="mb-7 relative h-40 w-40 md:h-48 md:w-48 overflow-hidden">
        <img
          src="/logo.png"
          alt="Faragon Logo Base"
          className="absolute inset-0 h-full w-full object-contain opacity-20"
        />
        <div
          className="absolute inset-0 overflow-hidden transition-all duration-75"
          style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }}
        >
          <img
            src="/logo.png"
            alt="Faragon Logo"
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <h1
        className="text-center text-sm md:text-base uppercase tracking-[0.28em] font-faragon px-4"
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

      <div className="mt-5 w-64 max-w-[85vw] h-2 rounded-full bg-white/20 overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ${bgBlack ? "bg-white" : "bg-red-600"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <style jsx>{`
        :global(body) {
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
