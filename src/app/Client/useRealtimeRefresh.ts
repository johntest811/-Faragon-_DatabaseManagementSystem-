"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./SupabaseClients";

type UseRealtimeRefreshOptions = {
  debounceMs?: number;
  disabled?: boolean;
};

export function useRealtimeRefresh(tables: string[], options?: UseRealtimeRefreshOptions) {
  const router = useRouter();
  const debounceMs = Math.max(100, options?.debounceMs ?? 500);
  const disabled = options?.disabled ?? false;
  const tablesKey = useMemo(
    () => Array.from(new Set(tables.map((t) => String(t || "").trim()).filter(Boolean))).sort().join("|"),
    [tables]
  );
  const stableTables = useMemo(() => tablesKey.split("|").filter(Boolean), [tablesKey]);

  useEffect(() => {
    if (disabled || !stableTables.length) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, debounceMs);
    };

    const channels = stableTables.map((table) =>
      supabase
        .channel(`realtime:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          scheduleRefresh
        )
        .subscribe()
    );

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [router, stableTables, debounceMs, disabled]);
}