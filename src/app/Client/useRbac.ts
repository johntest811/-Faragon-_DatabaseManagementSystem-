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

export type ColumnAccessResult = {
  allowedColumns: Set<string>;
  restricted: boolean;
  loading: boolean;
  error: string;
};

function normalizeModuleKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeColumnKey(value: unknown) {
  return String(value ?? "").trim();
}

export function useMyModules() {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");

      const legacySession = readAdminSession();
      if (legacySession) {
        try {
          const legacyRole = normalizeRoleName(legacySession.role);
          if (!legacyRole) {
            if (!cancelled) {
              setModules([]);
              setLoading(false);
            }
            return;
          }

          const { data: roleRow, error: roleErr } = await supabase
            .from("app_roles")
            .select("role_id")
            .eq("role_name", legacyRole)
            .single();

          if (roleErr || !roleRow?.role_id) {
            if (!cancelled) {
              setModules([]);
              setLoading(false);
            }
            return;
          }

          const { data: accessRows, error: accessErr } = await supabase
            .from("role_module_access")
            .select("module_key, can_read")
            .eq("role_id", roleRow.role_id);
          if (accessErr) throw accessErr;

          const keys = ((accessRows as Array<{ module_key: string; can_read: boolean }> | null) ?? [])
            .filter((r) => r && r.can_read)
            .map((r) => r.module_key);

          if (!keys.length) {
            if (!cancelled) {
              setModules([]);
              setLoading(false);
            }
            return;
          }

          const { data: modRows, error: modErr } = await supabase
            .from("modules")
            .select("module_key, display_name")
            .in("module_key", keys)
            .order("module_key");
          if (modErr) throw modErr;

          const { data: adminOverrideRows } = await supabase
            .from("admin_module_access_overrides")
            .select("module_key, can_read")
            .eq("admin_id", legacySession.id);

          const overrideKeys = (((adminOverrideRows as Array<{ module_key: string; can_read: boolean }> | null) ?? []) || [])
            .filter((row) => row && row.can_read)
            .map((row) => row.module_key);

          const allKeys = Array.from(new Set([...(keys || []), ...overrideKeys]));
          if (!allKeys.length) {
            if (!cancelled) {
              setModules([]);
              setLoading(false);
            }
            return;
          }

          const { data: mergedRows, error: mergedErr } = await supabase
            .from("modules")
            .select("module_key, display_name")
            .in("module_key", allKeys)
            .order("module_key");
          if (mergedErr) throw mergedErr;

          if (!cancelled) {
            setModules(((mergedRows as ModuleRow[]) ?? (modRows as ModuleRow[]) ?? []) || []);
            setLoading(false);
          }
        } catch (e: unknown) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to load modules");
            setModules([]);
            setLoading(false);
          }
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
          const roleModules = (data as ModuleRow[]) || [];

          const { data: sessionData2 } = await supabase.auth.getSession();
          const userId = sessionData2.session?.user?.id ?? null;

          if (!userId) {
            setModules(roleModules);
          } else {
            const { data: userOverrideRows } = await supabase
              .from("user_module_access_overrides")
              .select("module_key, can_read")
              .eq("user_id", userId);

            const overrideKeys = (((userOverrideRows as Array<{ module_key: string; can_read: boolean }> | null) ?? []) || [])
              .filter((row) => row && row.can_read)
              .map((row) => row.module_key);

            if (!overrideKeys.length) {
              setModules(roleModules);
            } else {
              const existing = new Set(roleModules.map((m) => m.module_key));
              const missing = overrideKeys.filter((k) => !existing.has(k));

              if (!missing.length) {
                setModules(roleModules);
              } else {
                const { data: extraRows } = await supabase
                  .from("modules")
                  .select("module_key, display_name")
                  .in("module_key", missing)
                  .order("module_key");

                setModules([...(roleModules || []), ...(((extraRows as ModuleRow[]) ?? []) || [])]);
              }
            }
          }
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

export function useMyColumnAccess(moduleKey: string): ColumnAccessResult {
  const [allowedColumns, setAllowedColumns] = useState<Set<string>>(new Set());
  const [restricted, setRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const key = normalizeModuleKey(moduleKey);

    async function run() {
      setLoading(true);
      setError("");

      if (!key) {
        if (!cancelled) {
          setAllowedColumns(new Set());
          setRestricted(false);
          setLoading(false);
        }
        return;
      }

      try {
        const legacySession = readAdminSession();

        if (legacySession) {
          const roleName = normalizeRoleName(legacySession.role);
          if (roleName === "superadmin") {
            if (!cancelled) {
              setAllowedColumns(new Set());
              setRestricted(false);
              setLoading(false);
            }
            return;
          }

          const { data, error: colErr } = await supabase
            .from("admin_column_access_overrides")
            .select("column_key, can_read")
            .eq("admin_id", legacySession.id)
            .eq("module_key", key);
          if (colErr) throw colErr;

          const rows =
            (((data as Array<{ column_key: string; can_read: boolean | null }> | null) ?? []) || []);
          const next = new Set(
            rows
              .filter((r) => r && r.can_read !== false)
              .map((r) => normalizeColumnKey(r.column_key))
              .filter(Boolean)
          );

          if (!cancelled) {
            setAllowedColumns(next);
            setRestricted(rows.length > 0);
            setLoading(false);
          }
          return;
        }

        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;
        const userId = sessionData.session?.user?.id ?? null;

        if (!userId) {
          if (!cancelled) {
            setAllowedColumns(new Set());
            setRestricted(false);
            setLoading(false);
          }
          return;
        }

        let roleName: RoleName = null;
        const { data: roleData } = await supabase.rpc("current_role_name");
        roleName = normalizeRoleName(roleData);
        if (roleName === "superadmin") {
          if (!cancelled) {
            setAllowedColumns(new Set());
            setRestricted(false);
            setLoading(false);
          }
          return;
        }

        const { data, error: colErr } = await supabase
          .from("user_column_access_overrides")
          .select("column_key, can_read")
          .eq("user_id", userId)
          .eq("module_key", key);
        if (colErr) throw colErr;

        const rows =
          (((data as Array<{ column_key: string; can_read: boolean | null }> | null) ?? []) || []);
        const next = new Set(
          rows
            .filter((r) => r && r.can_read !== false)
            .map((r) => normalizeColumnKey(r.column_key))
            .filter(Boolean)
        );

        if (!cancelled) {
          setAllowedColumns(next);
          setRestricted(rows.length > 0);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load column permissions");
          setAllowedColumns(new Set());
          setRestricted(false);
          setLoading(false);
        }
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
  }, [moduleKey]);

  return { allowedColumns, restricted, loading, error };
}
