"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./SupabaseClients";

export type StorageUrlRequest = {
  key: string;
  bucket: string;
  path: string | null | undefined;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const REFRESH_AFTER_MS = 50 * 60 * 1000;

function cleanStoragePath(bucket: string, value: string | null | undefined) {
  const path = String(value ?? "").trim();
  if (!path) return "";
  if (!/^https?:\/\//i.test(path)) return path.replace(/^\/+/, "");

  try {
    const url = new URL(path);
    const markers = [
      `/storage/v1/object/public/${encodeURIComponent(bucket)}/`,
      `/storage/v1/object/sign/${encodeURIComponent(bucket)}/`,
      `/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/`,
    ];
    for (const marker of markers) {
      const index = url.pathname.indexOf(marker);
      if (index >= 0) return decodeURIComponent(url.pathname.slice(index + marker.length));
    }
  } catch {
    return "";
  }
  return "";
}

export function useSignedStorageUrls(requests: StorageUrlRequest[]) {
  const requestKey = requests
    .map((request) => `${request.key}\u0000${request.bucket}\u0000${String(request.path ?? "")}`)
    .join("\u0001");
  const normalized = useMemo(
    () => requests.map((request) => {
      const path = cleanStoragePath(request.bucket, request.path);
      const original = String(request.path ?? "").trim();
      return {
        ...request,
        path,
        externalUrl: !path && /^https?:\/\//i.test(original) ? original : null,
      };
    }),
    // requestKey is a stable value-based dependency for caller-created arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestKey]
  );
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      const next: Record<string, string | null> = Object.fromEntries(
        normalized.map((item) => [item.key, item.externalUrl])
      );
      const byBucket = new Map<string, Array<{ key: string; path: string }>>();
      for (const item of normalized) {
        if (!item.path) continue;
        const group = byBucket.get(item.bucket) ?? [];
        group.push({ key: item.key, path: item.path });
        byBucket.set(item.bucket, group);
      }

      await Promise.all(Array.from(byBucket.entries()).map(async ([bucket, items]) => {
        const uniquePaths = Array.from(new Set(items.map((item) => item.path)));
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS);
        if (error || !data) return;
        const signedByPath = new Map(data.map((row) => [row.path, row.signedUrl ?? null]));
        for (const item of items) next[item.key] = signedByPath.get(item.path) ?? null;
      }));

      if (!cancelled) {
        setUrls(next);
        refreshTimer = setTimeout(() => void load(), REFRESH_AFTER_MS);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [normalized]);

  return urls;
}

export function useSignedStorageUrlMap(bucket: string, paths: Array<string | null | undefined>) {
  const requests = useMemo(
    () => Array.from(new Set(paths.map((path) => String(path ?? "").trim()).filter(Boolean)))
      .map((path) => ({ key: path, bucket, path })),
    [bucket, paths]
  );
  const urls = useSignedStorageUrls(requests);
  return useMemo(() => new Map(Object.entries(urls)), [urls]);
}
