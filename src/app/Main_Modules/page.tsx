"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PageLoading from "../Components/PageLoading";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/Main_Modules/Dashboard/");
  }, [router]);

  return <PageLoading label="Opening dashboard..." />;
}
