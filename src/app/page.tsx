"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PageLoading from "./Components/PageLoading";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/Login/");
  }, [router]);

  return <PageLoading label="Opening login..." fullScreen />;
}
