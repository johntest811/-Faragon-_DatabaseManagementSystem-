"use client";

import { useEffect, useState } from "react";

type SplashScreenProps = {
  onFinish?: () => void;
};

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [bgBlack, setBgBlack] = useState(false);

  useEffect(() => {
    const bgTimer = setTimeout(() => setBgBlack(true), 2500);
    const finishTimer = setTimeout(() => onFinish?.(), 5000);

    return () => {
      clearTimeout(bgTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center justify-center transition-all duration-1000 ${
        bgBlack ? "bg-black" : "bg-white"
      }`}
    >
      {/* LOGO */}
      <img
        src="/logo.png"
        alt="Faragon Logo"
        className={`w-44 mb-8 transition-transform duration-700 ease-out ${
          bgBlack ? "animate-logo-bounce" : "scale-95"
        }`}
      />

      {/* APP NAME */}
      <h1
        className={`text-1xl uppercase tracking-[0.3em] mb-4 font-faragon transition-colors duration-700 ${
          bgBlack ? "text-white" : "text-red-600"
        }`}
      >
        FARAGON SECURITY AGENCY INC.
      </h1>
    
      {/* DOT LOADER */}
      <div className="flex gap-3 mt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full transition-colors duration-700 ${
              bgBlack ? "bg-white" : "bg-red-500"
            } animate-pulse`}
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes logo-bounce {
          0% {
            transform: scale(0.9);
          }
          60% {
            transform: scale(1.18);
          }
          80% {
            transform: scale(0.98);
          }
          100% {
            transform: scale(1);
          }
        }

        .animate-logo-bounce {
          animation: logo-bounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
          filter: drop-shadow(0 0 30px rgba(255, 255, 255, 0.6));
        }
      `}</style>
    </div>
  );
}
