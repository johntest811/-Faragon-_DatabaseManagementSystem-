"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./SupabaseClients";

export function useRealtimeRefresh(tables: string[]) {
  const router = useRouter();
  const tablesKey = useMemo(() => tables.join("|"), [tables]);
  const stableTables = useMemo(() => tablesKey.split("|").filter(Boolean), [tablesKey]);

  useEffect(() => {
    const channels = stableTables.map((table) =>
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
  }, [router, stableTables]);
}