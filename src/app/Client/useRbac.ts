"use client";

import { useEffect, useState } from "react";
import { supabase } from "./SupabaseClients";

export type RoleName = "superadmin" | "admin" | "employee" | null;

type AdminSession = {
  id: string;
  username: string;
  role: string;
  full_name?: string | null;
  position?: string | null;
  loginTime?: string;
};

function readAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem("adminSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.id || !parsed.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeRoleName(value: unknown): RoleName {
  const r = String(value ?? "").trim().toLowerCase();
  if (r === "superadmin" || r === "admin" || r === "employee") return r;
  return null;
}

export function useAuthRole() {
  const [role, setRole] = useState<RoleName>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");

      // Legacy mode: username login via public.admins + localStorage session.
      const legacySession = readAdminSession();
      if (legacySession) {
        try {
          const { data: adminRow, error: adminErr } = await supabase
            .from("admins")
            .select("role, is_active")
            .eq("id", legacySession.id)
            .single();

          if (!cancelled) {
            if (adminErr) {
              // Fall back to whatever is currently in the local session.
              setRole(normalizeRoleName(legacySession.role));
              setLoading(false);
              return;
            }

            if (adminRow && adminRow.is_active === false) {
              localStorage.removeItem("adminSession");
              setRole(null);
              setLoading(false);
              return;
            }

            const dbRole = normalizeRoleName(adminRow?.role);
            const sessionRole = normalizeRoleName(legacySession.role);

            // Keep role in sync if DB was changed after login.
            if (dbRole && dbRole !== sessionRole) {
              const merged = { ...legacySession, role: dbRole };
              localStorage.setItem("adminSession", JSON.stringify(merged));
            }

            setRole(dbRole ?? sessionRole);
            setLoading(false);
          }
        } catch {
          if (!cancelled) {
            setRole(normalizeRoleName(legacySession.role));
            setLoading(false);
          }
        }
        return;
      }

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) {
        if (!cancelled) {
          setError(sessErr.message);
          setRole(null);
          setLoading(false);
        }
        return;
      }

      if (!sessionData.session) {
        if (!cancelled) {
          setRole(null);
          setLoading(false);
        }
        return;
      }

      const { data, error: rpcErr } = await supabase.rpc("current_role_name");
      if (!cancelled) {
        if (rpcErr) {
          setError(rpcErr.message);
          setRole(null);
        } else {
          setRole(normalizeRoleName(data));
        }
        setLoading(false);
      }
    }

    run();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      run();
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "adminSession") run();
    };
    window.addEventListener("storage", onStorage);

    const onFocus = () => {
      run();
    };
    window.addEventListener("focus", onFocus);

    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { role, loading, error };
}

export type ModuleRow = { module_key: string; display_name: string };

export function useMyModules() {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");

      // Legacy mode: no DB-backed module list; layout will use role fallback.
      const legacySession = readAdminSession();
      if (legacySession) {
        if (!cancelled) {
          setModules([]);
          setLoading(false);
        }
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) {
          setModules([]);
          setLoading(false);
        }
        return;
      }

      const { data, error: rpcErr } = await supabase.rpc("my_modules");
      if (!cancelled) {
        if (rpcErr) {
          setError(rpcErr.message);
          setModules([]);
        } else {
          setModules((data as ModuleRow[]) || []);
        }
        setLoading(false);
      }
    }

    run();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      run();
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "adminSession") run();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { modules, loading, error };
}
