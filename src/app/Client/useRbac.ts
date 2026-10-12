"use client";

import { useEffect, useState } from "react";
import { supabase } from "./SupabaseClients";

export type RoleName = string | null;

type AdminSession = {
  id: string;
  username: string;
  role: string;
  full_name?: string | null;
  position?: string | null;
  loginTime?: string;
};

async function readAdminSession(): Promise<AdminSession | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) return null;

  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("id, username, role, full_name, is_active")
    .eq("auth_user_id", sessionData.session.user.id)
    .maybeSingle();
  if (adminError || !admin || admin.is_active !== true) return null;

  const verified: AdminSession = {
    id: String(admin.id),
    username: String(admin.username),
    role: String(admin.role ?? "").trim().toLowerCase(),
    full_name: admin.full_name ?? null,
  };
  try {
    const raw = localStorage.getItem("adminSession");
    const cached = raw ? JSON.parse(raw) as Partial<AdminSession> : {};
    localStorage.setItem("adminSession", JSON.stringify({ ...cached, ...verified }));
  } catch {
    // The signed Supabase session and database row remain authoritative.
  }
  return verified;
}

export function normalizeRoleName(value: unknown): RoleName {
  const r = String(value ?? "").trim().toLowerCase();
  return r || null;
}

export function useAuthRole() {
  const [role, setRole] = useState<RoleName>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let verificationId = 0;

    async function run() {
      if (cancelled) return;
      const currentVerification = ++verificationId;
      const isCurrent = () => !cancelled && currentVerification === verificationId;
      setLoading(true);
      setError("");
      setRole(null);

      try {
        const verifiedSession = await readAdminSession();
        if (!isCurrent()) return;
        if (verifiedSession) {
          // readAdminSession already checked the Auth-linked row through RLS.
          setRole(normalizeRoleName(verifiedSession.role));
          return;
        }

        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (!isCurrent()) return;
        if (sessErr) throw new Error(sessErr.message);
        if (!sessionData.session) return;

        const { data, error: rpcErr } = await supabase.rpc("current_role_name");
        if (!isCurrent()) return;
        if (rpcErr) throw new Error(rpcErr.message);
        setRole(normalizeRoleName(data));
      } catch (authError) {
        if (isCurrent()) {
          setError(authError instanceof Error ? authError.message : "Unable to verify the active account.");
          setRole(null);
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }

    run();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      run();
    });
    const permissionChannel = supabase
      .channel(`my-modules-access-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admins" }, () => void run())
      .on("postgres_changes", { event: "*", schema: "public", table: "role_module_access" }, () => void run())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_module_access_overrides" }, () => void run())
      .subscribe();

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
      void supabase.removeChannel(permissionChannel);
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

export type ModuleDeleteAccessResult = {
  canDelete: boolean;
  loading: boolean;
  error: string;
};

export type ModuleEditAccessResult = {
  canEdit: boolean;
  loading: boolean;
  error: string;
};

export type ModuleAccessResult = {
  canAccess: boolean;
  loading: boolean;
  error: string;
};

export type ApplicantRowAccessResult = {
  hasAccess: boolean;
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

function buildWriteAccessSet(rows: Array<{ module_key: string; can_write: boolean | null }>) {
  return new Set(
    rows
      .filter((row) => row && row.can_write !== false)
      .map((row) => normalizeModuleKey(row.module_key))
      .filter(Boolean)
  );
}

function buildEditAccessSet(rows: Array<{ module_key: string; can_edit: boolean | null }>) {
  return new Set(
    rows
      .filter((row) => row && row.can_edit !== false)
      .map((row) => normalizeModuleKey(row.module_key))
      .filter(Boolean)
  );
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

      let legacySession: AdminSession | null;
      try {
        legacySession = await readAdminSession();
      } catch (authError) {
        if (!cancelled) {
          setError(authError instanceof Error ? authError.message : "Unable to verify the active account.");
          setModules([]);
          setLoading(false);
        }
        return;
      }
      if (legacySession) {
        try {
          const legacyRole = normalizeRoleName(legacySession.role);
          const roleRowPromise = legacyRole
            ? supabase
                .from("app_roles")
                .select("role_id")
                .eq("role_name", legacyRole)
                .single()
            : Promise.resolve({ data: null, error: null } as { data: { role_id?: string } | null; error: null });

          const { data: roleRow, error: roleErr } = await roleRowPromise;

          const [roleModulesRes, adminOverridesRes, assignmentRes] = await Promise.all([
            roleRow?.role_id
              ? supabase.from("role_module_access").select("module_key, can_read").eq("role_id", roleRow.role_id)
              : Promise.resolve({ data: [] as Array<{ module_key: string; can_read: boolean | null }>, error: null }),
            supabase
              .from("admin_module_access_overrides")
              .select("module_key, can_read")
              .eq("admin_id", legacySession.id),
            supabase
              .from("admins")
              .select("assigned_detachment")
              .eq("id", legacySession.id)
              .maybeSingle(),
          ]);

          if (roleErr && legacyRole) throw roleErr;
          if (roleModulesRes.error) throw roleModulesRes.error;
          if (adminOverridesRes.error) throw adminOverridesRes.error;

          const roleKeys = ((roleModulesRes.data as Array<{ module_key: string; can_read: boolean }> | null) ?? [])
            .filter((r) => r && r.can_read)
            .map((r) => r.module_key);

          const overrideKeys = ((adminOverridesRes.data as Array<{ module_key: string; can_read: boolean }> | null) ?? [])
            .filter((row) => row && row.can_read)
            .map((row) => row.module_key);

          const assignedDetachment = String(assignmentRes.data?.assigned_detachment ?? "").trim();
          const allKeys = Array.from(new Set([
            ...roleKeys,
            ...overrideKeys,
            ...(assignedDetachment ? ["paraphernalia"] : []),
          ]));
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
            setModules(((mergedRows as ModuleRow[]) ?? []) || []);
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

export function useMyModuleAccess(moduleKey: string): ModuleAccessResult {
  const { modules, loading, error } = useMyModules();
  const key = normalizeModuleKey(moduleKey);

  return {
    canAccess: Boolean(key) && modules.some((module) => normalizeModuleKey(module.module_key) === key),
    loading,
    error,
  };
}

export function useMyModuleDeleteAccess(moduleKey: string): ModuleDeleteAccessResult {
  const [canDelete, setCanDelete] = useState(false);
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
          setCanDelete(false);
          setLoading(false);
        }
        return;
      }

      try {
        const legacySession = await readAdminSession();
        if (legacySession) {
          const roleName = normalizeRoleName(legacySession.role);
          if (roleName === "superadmin") {
            if (!cancelled) {
              setCanDelete(true);
              setLoading(false);
            }
            return;
          }

          const roleRowPromise = roleName
            ? supabase
                .from("app_roles")
                .select("role_id")
                .eq("role_name", roleName)
                .single()
            : Promise.resolve({ data: null, error: null } as { data: { role_id?: string } | null; error: null });

          const { data: roleRow, error: roleErr } = await roleRowPromise;

          const [roleModulesRes, adminModulesRes] = await Promise.all([
            roleRow?.role_id
              ? supabase.from("role_module_access").select("module_key, can_write").eq("role_id", roleRow.role_id)
              : Promise.resolve({ data: [] as Array<{ module_key: string; can_write: boolean | null }>, error: null }),
            supabase
              .from("admin_module_access_overrides")
              .select("module_key, can_write")
              .eq("admin_id", legacySession.id),
          ]);
          if (roleErr && roleName) throw roleErr;
          if (roleModulesRes.error) throw roleModulesRes.error;
          if (adminModulesRes.error) throw adminModulesRes.error;

          const roleDeleteSet = buildWriteAccessSet((roleModulesRes.data as Array<{ module_key: string; can_write: boolean | null }> | null) ?? []);
          const adminDeleteSet = buildWriteAccessSet((adminModulesRes.data as Array<{ module_key: string; can_write: boolean | null }> | null) ?? []);

          if (!cancelled) {
            setCanDelete(roleDeleteSet.has(key) || adminDeleteSet.has(key));
            setLoading(false);
          }
          return;
        }

        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        const session = sessionData.session;
        if (!session) {
          if (!cancelled) {
            setCanDelete(false);
            setLoading(false);
          }
          return;
        }

        const { data: roleData, error: roleRpcErr } = await supabase.rpc("current_role_name");
        if (roleRpcErr) throw roleRpcErr;

        const roleName = normalizeRoleName(roleData);
        if (roleName === "superadmin") {
          if (!cancelled) {
            setCanDelete(true);
            setLoading(false);
          }
          return;
        }

          const roleRowPromise = roleName
            ? supabase
                .from("app_roles")
                .select("role_id")
                .eq("role_name", roleName)
                .single()
            : Promise.resolve({ data: null, error: null } as { data: { role_id?: string } | null; error: null });

          const { data: roleRow, error: roleErr } = await roleRowPromise;

          const [roleModulesRes, userModulesRes] = await Promise.all([
            roleRow?.role_id
              ? supabase.from("role_module_access").select("module_key, can_write").eq("role_id", roleRow.role_id)
              : Promise.resolve({ data: [] as Array<{ module_key: string; can_write: boolean | null }>, error: null }),
            supabase.from("user_module_access_overrides").select("module_key, can_write").eq("user_id", session.user.id),
          ]);
          if (roleErr && roleName) throw roleErr;
        if (roleModulesRes.error) throw roleModulesRes.error;
        if (userModulesRes.error) throw userModulesRes.error;

        const roleDeleteSet = buildWriteAccessSet((roleModulesRes.data as Array<{ module_key: string; can_write: boolean | null }> | null) ?? []);
        const userDeleteSet = buildWriteAccessSet((userModulesRes.data as Array<{ module_key: string; can_write: boolean | null }> | null) ?? []);

        if (!cancelled) {
          setCanDelete(roleDeleteSet.has(key) || userDeleteSet.has(key));
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCanDelete(false);
          setError(e instanceof Error ? e.message : "Failed to load delete access");
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
  }, [moduleKey]);

  return { canDelete, loading, error };
}

export function useMyModuleEditAccess(moduleKey: string): ModuleEditAccessResult {
  const [canEdit, setCanEdit] = useState(false);
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
          setCanEdit(false);
          setLoading(false);
        }
        return;
      }

      try {
        const legacySession = await readAdminSession();
        if (legacySession) {
          const roleName = normalizeRoleName(legacySession.role);
          if (roleName === "superadmin") {
            if (!cancelled) {
              setCanEdit(true);
              setLoading(false);
            }
            return;
          }

          const roleRowPromise = roleName
            ? supabase
                .from("app_roles")
                .select("role_id")
                .eq("role_name", roleName)
                .single()
            : Promise.resolve({ data: null, error: null } as { data: { role_id?: string } | null; error: null });

          const { data: roleRow, error: roleErr } = await roleRowPromise;

          const [roleModulesRes, adminModulesRes] = await Promise.all([
            roleRow?.role_id
              ? supabase.from("role_module_access").select("module_key, can_edit").eq("role_id", roleRow.role_id)
              : Promise.resolve({ data: [] as Array<{ module_key: string; can_edit: boolean | null }>, error: null }),
            supabase
              .from("admin_module_access_overrides")
              .select("module_key, can_edit")
              .eq("admin_id", legacySession.id),
          ]);
          if (roleErr && roleName) throw roleErr;
          if (roleModulesRes.error) throw roleModulesRes.error;
          if (adminModulesRes.error) throw adminModulesRes.error;

          const roleEditSet = buildEditAccessSet((roleModulesRes.data as Array<{ module_key: string; can_edit: boolean | null }> | null) ?? []);
          const adminEditSet = buildEditAccessSet((adminModulesRes.data as Array<{ module_key: string; can_edit: boolean | null }> | null) ?? []);

          if (!cancelled) {
            setCanEdit(roleEditSet.has(key) || adminEditSet.has(key));
            setLoading(false);
          }
          return;
        }

        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        const session = sessionData.session;
        if (!session) {
          if (!cancelled) {
            setCanEdit(false);
            setLoading(false);
          }
          return;
        }

        const { data: roleData, error: roleRpcErr } = await supabase.rpc("current_role_name");
        if (roleRpcErr) throw roleRpcErr;

        const roleName = normalizeRoleName(roleData);
        if (roleName === "superadmin") {
          if (!cancelled) {
            setCanEdit(true);
            setLoading(false);
          }
          return;
        }

        const { data: roleRow, error: roleErr } = await supabase
          .from("app_roles")
          .select("role_id")
          .eq("role_name", roleName ?? "")
          .single();

        if (roleErr || !roleRow?.role_id) {
          if (!cancelled) {
            setCanEdit(false);
            setLoading(false);
          }
          return;
        }

        const [roleModulesRes, userModulesRes] = await Promise.all([
          supabase.from("role_module_access").select("module_key, can_edit").eq("role_id", roleRow.role_id),
          supabase.from("user_module_access_overrides").select("module_key, can_edit").eq("user_id", session.user.id),
        ]);
        if (roleModulesRes.error) throw roleModulesRes.error;
        if (userModulesRes.error) throw userModulesRes.error;

        const roleEditSet = buildEditAccessSet((roleModulesRes.data as Array<{ module_key: string; can_edit: boolean | null }> | null) ?? []);
        const userEditSet = buildEditAccessSet((userModulesRes.data as Array<{ module_key: string; can_edit: boolean | null }> | null) ?? []);

        if (!cancelled) {
          setCanEdit(roleEditSet.has(key) || userEditSet.has(key));
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCanEdit(false);
          setError(e instanceof Error ? e.message : "Failed to load edit access");
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
  }, [moduleKey]);

  return { canEdit, loading, error };
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
        const legacySession = await readAdminSession();

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

          const [roleColsRes, overrideColsRes] = await Promise.all([
            roleName
              ? (async () => {
                  const { data: roleRow, error: roleErr } = await supabase
                    .from("app_roles")
                    .select("role_id")
                    .eq("role_name", roleName)
                    .single();
                  if (roleErr || !roleRow?.role_id) return [] as Array<{ column_key: string; can_read: boolean | null }>;

                  const { data: cols, error: colsErr } = await supabase
                    .from("role_column_access")
                    .select("column_key, can_read")
                    .eq("role_id", roleRow.role_id)
                    .eq("module_key", key);
                  if (colsErr) throw colsErr;
                  return (((cols as Array<{ column_key: string; can_read: boolean | null }> | null) ?? []) || []);
                })()
              : Promise.resolve([] as Array<{ column_key: string; can_read: boolean | null }>),
            (async () => {
              const { data, error: colErr } = await supabase
                .from("admin_column_access_overrides")
                .select("column_key, can_read")
                .eq("admin_id", legacySession.id)
                .eq("module_key", key);
              if (colErr) throw colErr;
              return (((data as Array<{ column_key: string; can_read: boolean | null }> | null) ?? []) || []);
            })(),
          ]);

          const roleRows = roleColsRes;
          const overrideRows = overrideColsRes;

          const roleAllowed = new Set(
            roleRows
              .filter((r) => r && r.can_read !== false)
              .map((r) => normalizeColumnKey(r.column_key))
              .filter(Boolean)
          );
          const overrideAllowed = new Set(
            overrideRows
              .filter((r) => r && r.can_read !== false)
              .map((r) => normalizeColumnKey(r.column_key))
              .filter(Boolean)
          );

          const roleRestricted = roleRows.length > 0;
          const overrideRestricted = overrideRows.length > 0;

          const next = roleRestricted
            ? new Set<string>([...Array.from(roleAllowed), ...Array.from(overrideAllowed)])
            : overrideRestricted
              ? overrideAllowed
              : new Set<string>();

          if (!cancelled) {
            setAllowedColumns(next);
            setRestricted(roleRestricted || overrideRestricted);
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

        const { data: roleData, error: roleRpcErr } = await supabase.rpc("current_role_name");
        if (roleRpcErr) throw roleRpcErr;

        const roleName = normalizeRoleName(roleData);
        if (roleName === "superadmin") {
          if (!cancelled) {
            setAllowedColumns(new Set());
            setRestricted(false);
            setLoading(false);
          }
          return;
        }

        const [roleColsRes, overrideColsRes] = await Promise.all([
          roleName
            ? (async () => {
                const { data: roleRow, error: roleErr } = await supabase
                  .from("app_roles")
                  .select("role_id")
                  .eq("role_name", roleName)
                  .single();
                if (roleErr || !roleRow?.role_id) return [] as Array<{ column_key: string; can_read: boolean | null }>;

                const { data: cols, error: colsErr } = await supabase
                  .from("role_column_access")
                  .select("column_key, can_read")
                  .eq("role_id", roleRow.role_id)
                  .eq("module_key", key);
                if (colsErr) throw colsErr;
                return (((cols as Array<{ column_key: string; can_read: boolean | null }> | null) ?? []) || []);
              })()
            : Promise.resolve([] as Array<{ column_key: string; can_read: boolean | null }>),
          (async () => {
            const { data: cols, error: colErr } = await supabase
              .from("user_column_access_overrides")
              .select("column_key, can_read")
              .eq("user_id", userId)
              .eq("module_key", key);
            if (colErr) throw colErr;
            return (((cols as Array<{ column_key: string; can_read: boolean | null }> | null) ?? []) || []);
          })(),
        ]);

        const roleRows = roleColsRes;
        const overrideRows = overrideColsRes;

        const roleAllowed = new Set(
          roleRows
            .filter((r) => r && r.can_read !== false)
            .map((r) => normalizeColumnKey(r.column_key))
            .filter(Boolean)
        );
        const overrideAllowed = new Set(
          overrideRows
            .filter((r) => r && r.can_read !== false)
            .map((r) => normalizeColumnKey(r.column_key))
            .filter(Boolean)
        );

        const roleRestricted = roleRows.length > 0;
        const overrideRestricted = overrideRows.length > 0;

        const next = roleRestricted
          ? new Set<string>([...Array.from(roleAllowed), ...Array.from(overrideAllowed)])
          : overrideRestricted
            ? overrideAllowed
            : new Set<string>();

        if (!cancelled) {
          setAllowedColumns(next);
          setRestricted(roleRestricted || overrideRestricted);
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

export function useMyApplicantColumnAccess(moduleKey: string, applicantId: string | null): ColumnAccessResult {
  const [allowedColumns, setAllowedColumns] = useState<Set<string>>(new Set());
  const [restricted, setRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const key = normalizeModuleKey(moduleKey);
    const applicantKey = String(applicantId ?? "").trim();

    async function run() {
      setLoading(true);
      setError("");

      if (!key || !applicantKey) {
        if (!cancelled) {
          setAllowedColumns(new Set());
          setRestricted(false);
          setLoading(false);
        }
        return;
      }

      try {
        const legacySession = await readAdminSession();

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
            .from("admin_applicant_column_access_overrides")
            .select("column_key, can_read")
            .eq("admin_id", legacySession.id)
            .eq("module_key", key)
            .eq("applicant_id", applicantKey);
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

        const { data: roleData } = await supabase.rpc("current_role_name");
        const roleName = normalizeRoleName(roleData);
        if (roleName === "superadmin") {
          if (!cancelled) {
            setAllowedColumns(new Set());
            setRestricted(false);
            setLoading(false);
          }
          return;
        }

        const { data, error: colErr } = await supabase
          .from("user_applicant_column_access_overrides")
          .select("column_key, can_read")
          .eq("user_id", userId)
          .eq("module_key", key)
          .eq("applicant_id", applicantKey);
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
          setError(e instanceof Error ? e.message : "Failed to load applicant column permissions");
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
  }, [moduleKey, applicantId]);

  return { allowedColumns, restricted, loading, error };
}

export function useMyApplicantRowAccess(moduleKey: string, applicantId: string | null): ApplicantRowAccessResult {
  const [hasAccess, setHasAccess] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const key = normalizeModuleKey(moduleKey);
    const applicantKey = String(applicantId ?? "").trim();

    async function run() {
      setLoading(true);
      setError("");

      if (!key || !applicantKey) {
        if (!cancelled) {
          setHasAccess(false);
          setRestricted(false);
          setLoading(false);
        }
        return;
      }

      try {
        const legacySession = await readAdminSession();

        if (legacySession) {
          const roleName = normalizeRoleName(legacySession.role);
          if (roleName === "superadmin") {
            if (!cancelled) {
              setHasAccess(true);
              setRestricted(false);
              setLoading(false);
            }
            return;
          }

          const { data, error: rowErr } = await supabase
            .from("admin_applicant_access_overrides")
            .select("applicant_id, can_read")
            .eq("admin_id", legacySession.id)
            .eq("module_key", key);
          if (rowErr) throw rowErr;

          const rows = (((data as Array<{ applicant_id: string; can_read: boolean | null }> | null) ?? []) || []);
          const allowed = new Set(rows.filter((r) => r && r.can_read !== false).map((r) => String(r.applicant_id)));

          if (!cancelled) {
            setRestricted(rows.length > 0);
            setHasAccess(rows.length === 0 ? true : allowed.has(applicantKey));
            setLoading(false);
          }
          return;
        }

        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;
        const userId = sessionData.session?.user?.id ?? null;

        if (!userId) {
          if (!cancelled) {
            setHasAccess(false);
            setRestricted(false);
            setLoading(false);
          }
          return;
        }

        const { data: roleData } = await supabase.rpc("current_role_name");
        const roleName = normalizeRoleName(roleData);
        if (roleName === "superadmin") {
          if (!cancelled) {
            setHasAccess(true);
            setRestricted(false);
            setLoading(false);
          }
          return;
        }

        const { data, error: rowErr } = await supabase
          .from("user_applicant_access_overrides")
          .select("applicant_id, can_read")
          .eq("user_id", userId)
          .eq("module_key", key);
        if (rowErr) throw rowErr;

        const rows = (((data as Array<{ applicant_id: string; can_read: boolean | null }> | null) ?? []) || []);
        const allowed = new Set(rows.filter((r) => r && r.can_read !== false).map((r) => String(r.applicant_id)));

        if (!cancelled) {
          setRestricted(rows.length > 0);
          setHasAccess(rows.length === 0 ? true : allowed.has(applicantKey));
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load applicant row permissions");
          setHasAccess(false);
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
  }, [moduleKey, applicantId]);

  return { hasAccess, restricted, loading, error };
}

export type ParaphernaliaDetachmentAccessResult = {
  allowedDetachments: Set<string>;
  restricted: boolean;
  canStockOut: boolean;
  faragonAccess: boolean;
  loading: boolean;
  error: string;
};

function normalizedAccessValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isMissingAccessTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("could not find the table");
}

export function useMyParaphernaliaDetachmentAccess(): ParaphernaliaDetachmentAccessResult {
  const [allowedDetachments, setAllowedDetachments] = useState<Set<string>>(new Set());
  const [restricted, setRestricted] = useState(false);
  const [canStockOut, setCanStockOut] = useState(false);
  const [faragonAccess, setFaragonAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");

      try {
        const legacySession = await readAdminSession();
        if (!legacySession) {
          if (!cancelled) {
            setAllowedDetachments(new Set());
            setRestricted(false);
            setCanStockOut(false);
            setFaragonAccess(false);
            setLoading(false);
          }
          return;
        }

        const roleKey = normalizedAccessValue(legacySession.role);
        if (roleKey === "superadmin") {
          if (!cancelled) {
            setAllowedDetachments(new Set());
            setRestricted(false);
            setCanStockOut(true);
            setFaragonAccess(true);
            setLoading(false);
          }
          return;
        }

        const [settingsRes, adminScopeRes, roleRes, adminRes] = await Promise.all([
          supabase
            .from("admin_paraphernalia_access_settings")
            .select("use_custom_detachments")
            .eq("admin_id", legacySession.id)
            .maybeSingle(),
          supabase
            .from("admin_paraphernalia_detachment_access")
            .select("detachment, can_stock_out")
            .eq("admin_id", legacySession.id),
          (async () => {
            const roleLookup = await supabase.from("app_roles").select("role_id").eq("role_name", roleKey).maybeSingle();
            if (roleLookup.error || !roleLookup.data?.role_id) return { data: [], error: roleLookup.error };
            return supabase
              .from("role_paraphernalia_detachment_access")
              .select("detachment, can_stock_out")
              .eq("role_id", roleLookup.data.role_id);
          })(),
          supabase
            .from("admins")
            .select("applicant_id, employee_number, full_name, username, assigned_detachment")
            .eq("id", legacySession.id)
            .maybeSingle(),
        ]);

        const scopeTablesMissing =
          isMissingAccessTableError(settingsRes.error) ||
          isMissingAccessTableError(adminScopeRes.error) ||
          isMissingAccessTableError(roleRes.error);
        if (settingsRes.error && !isMissingAccessTableError(settingsRes.error)) throw settingsRes.error;
        if (adminScopeRes.error && !isMissingAccessTableError(adminScopeRes.error)) throw adminScopeRes.error;
        if (roleRes.error && !isMissingAccessTableError(roleRes.error)) throw roleRes.error;

        const adminRow = adminRes.data as {
          applicant_id?: string | null;
          employee_number?: string | null;
          full_name?: string | null;
          username?: string | null;
          assigned_detachment?: string | null;
        } | null;
        const assignedDetachment = String(adminRow?.assigned_detachment ?? "").trim().replace(/\s+/g, " ");
        const assignedKey = normalizedAccessValue(assignedDetachment);
        const assignedToFaragon = assignedKey === "faragon" || assignedKey === "faragon main logistics";
        if (assignedToFaragon) {
          if (!cancelled) {
            setAllowedDetachments(new Set());
            setRestricted(false);
            setCanStockOut(true);
            setFaragonAccess(true);
            setError(scopeTablesMissing ? "Run the Paraphernalia access SQL migration to manage detachment scopes in Admin Accounts." : "");
            setLoading(false);
          }
          return;
        }

        const customScope = settingsRes.data?.use_custom_detachments === true;
        const adminRows = (adminScopeRes.data ?? []) as Array<{ detachment: string | null; can_stock_out: boolean | null }>;
        const roleRows = (roleRes.data ?? []) as Array<{ detachment: string | null; can_stock_out: boolean | null }>;
        let effectiveRows = assignedDetachment
          ? [{ detachment: assignedDetachment, can_stock_out: true }]
          : customScope
            ? adminRows
            : roleRows;
        let employeeFallback = false;
        const employeeLikeRole = roleKey === "employee" || roleKey.includes("guard") || roleKey.includes("security");

        if (!assignedDetachment && !customScope && effectiveRows.length === 0 && employeeLikeRole) {
          employeeFallback = true;
          const applicantsRes = await supabase
            .from("applicants")
            .select("applicant_id, custom_id, first_name, middle_name, last_name, extn_name, client_email, detachment, status, is_archived, is_trashed")
            .eq("is_archived", false)
            .eq("is_trashed", false)
            .limit(5000);
          if (applicantsRes.error) throw applicantsRes.error;

          const employeeNumber = normalizedAccessValue(adminRow?.employee_number);
          const linkedApplicantId = normalizedAccessValue(adminRow?.applicant_id);
          const fullName = normalizedAccessValue(adminRow?.full_name);
          const username = normalizedAccessValue(adminRow?.username || legacySession.username);
          const matchingRows = ((applicantsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => {
            if (normalizedAccessValue(row.status) !== "active") return false;
            const firstLast = normalizedAccessValue(`${row.first_name ?? ""} ${row.middle_name ?? ""} ${row.last_name ?? ""} ${row.extn_name ?? ""}`);
            const lastFirst = normalizedAccessValue(`${row.last_name ?? ""}, ${row.first_name ?? ""} ${row.middle_name ?? ""} ${row.extn_name ?? ""}`);
            return Boolean(
              (linkedApplicantId && normalizedAccessValue(row.applicant_id) === linkedApplicantId) ||
              (employeeNumber && normalizedAccessValue(row.custom_id) === employeeNumber) ||
              (username && normalizedAccessValue(row.client_email) === username) ||
              (fullName && (firstLast === fullName || lastFirst === fullName))
            );
          });
          effectiveRows = matchingRows.map((row) => ({ detachment: String(row.detachment ?? ""), can_stock_out: true }));
        }

        const effectiveFaragonAccess = effectiveRows.some((row) => {
          const key = normalizedAccessValue(row.detachment);
          return key === "faragon" || key === "faragon main logistics";
        });
        if (effectiveFaragonAccess) {
          if (!cancelled) {
            setAllowedDetachments(new Set());
            setRestricted(false);
            setCanStockOut(true);
            setFaragonAccess(true);
            setError(scopeTablesMissing ? "Run the Paraphernalia access SQL migration to manage detachment scopes in Admin Accounts." : "");
            setLoading(false);
          }
          return;
        }

        const nextDetachments = new Set(
          effectiveRows
            .map((row) => String(row.detachment ?? "").trim().replace(/\s+/g, " "))
            .filter(Boolean)
        );
        const nextRestricted = Boolean(assignedDetachment) || customScope || roleRows.length > 0 || employeeFallback;
        const nextCanStockOut = !nextRestricted || effectiveRows.some((row) => row.can_stock_out !== false);

        if (!cancelled) {
          setAllowedDetachments(nextDetachments);
          setRestricted(nextRestricted);
          setCanStockOut(nextCanStockOut);
          setFaragonAccess(false);
          setError(scopeTablesMissing ? "Run the Paraphernalia access SQL migration to manage detachment scopes in Admin Accounts." : "");
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setAllowedDetachments(new Set());
          setRestricted(true);
          setCanStockOut(false);
          setFaragonAccess(false);
          setError(e instanceof Error ? e.message : "Unable to load Paraphernalia detachment access.");
          setLoading(false);
        }
      }
    }

    void run();
    const channel = supabase
      .channel(`paraphernalia-detachment-access-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "role_paraphernalia_detachment_access" }, () => void run())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_paraphernalia_detachment_access" }, () => void run())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_paraphernalia_access_settings" }, () => void run())
      .on("postgres_changes", { event: "*", schema: "public", table: "admins" }, () => void run())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return { allowedDetachments, restricted, canStockOut, faragonAccess, loading, error };
}
