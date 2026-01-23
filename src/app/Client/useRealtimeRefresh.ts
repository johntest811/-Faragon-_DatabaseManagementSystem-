"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./SupabaseClients";

export function useRealtimeRefresh(tables: string[]) {
  const router = useRouter();

  useEffect(() => {
    const channels = tables.map((table) =>
      supabase
        .channel(`realtime:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => router.refresh()
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [router, tables.join("|")]);
}