"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/Main_Modules/Dashboard/");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1C1C]"></div>
        <p className="mt-4 text-gray-600">Redirecting to the dashboard...</p>
      </div>
    </div>
  );
}