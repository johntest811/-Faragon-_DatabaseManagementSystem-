'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { supabase } from '../../Client/SupabaseClients';
import { useAuthRole } from '../../Client/useRbac';
import LoadingCircle from '../../Components/LoadingCircle';
import { ArrowRight, Activity, Building2, ShieldCheck, Sparkles, Users } from 'lucide-react';

type AdminRow = {
  id: string;
  username: string;
  full_name?: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
};

type PositionCount = { position: string; count: number };

type AdminLoginHistoryRow = {
  id: string;
  admin_id: string | null;
  username: string | null;
  full_name: string | null;
  role: string | null;
  logged_in_at: string;
  created_at: string | null;
};

type PopupState = {
  adminId: string;
  top: number;
  left: number;
};

type DashboardElectronApi = {
  admin?: {
    getLoginHistory?: (payload: {
      limit?: number;
    }) => Promise<{
      rows?: AdminLoginHistoryRow[];
      missingTable?: boolean;
      unavailable?: boolean;
      error?: string;
    }>;
  };
};

function normalizeDistinctValue(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function adminHistoryKey(adminId: string | null | undefined, username: string | null | undefined) {
  const id = String(adminId ?? '').trim();
  if (id) return `id:${id}`;
  const user = normalizeDistinctValue(username);
  return user ? `username:${user}` : '';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function isMissingLoginHistoryTableError(error: unknown) {
  const text = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  return (
    text.includes('admin_login_history') &&
    (text.includes('does not exist') ||
      text.includes('schema cache') ||
      text.includes('relation') ||
      text.includes('could not find the table'))
  );
}

function isLoginHistoryPermissionError(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? '').trim();
  const text = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  return code === '42501' || text.includes('row-level security policy');
}

export default function DashboardPage() {
  const { role } = useAuthRole();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [employeeTotal, setEmployeeTotal] = useState<number>(0);
  const [positionCounts, setPositionCounts] = useState<PositionCount[]>([]);
  const [clientTotal, setClientTotal] = useState<number>(0);
  const [clientDetachmentTotal, setClientDetachmentTotal] = useState<number>(0);
  const [loginHistoryByAdminKey, setLoginHistoryByAdminKey] = useState<Record<string, AdminLoginHistoryRow[]>>({});
  const [employeesLoading, setEmployeesLoading] = useState<boolean>(true);
  const [contractsLoading, setContractsLoading] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyPopup, setHistoryPopup] = useState<PopupState | null>(null);
  const closePopupTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const electronAPI = (globalThis as { electronAPI?: DashboardElectronApi }).electronAPI;

  const topPositions = useMemo(() => positionCounts.slice(0, 10), [positionCounts]);
  const employeeScopeFilter = 'status.is.null,status.eq.ACTIVE,status.eq.INACTIVE';
  const canUsePortal = typeof document !== 'undefined';

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('admins')
        .select('id, username, full_name, role, is_active, created_at, last_login')
        .order('last_login', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) {
        setError('Failed to load admins');
        console.error(fetchError);
      } else {
        setAdmins(data || []);
      }
    } catch (err) {
      console.error(err);
      setError('Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployeeStats = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const countRes = await supabase
        .from('applicants')
        .select('applicant_id', { count: 'exact', head: true })
        .eq('is_archived', false)
        .eq('is_trashed', false)
        .or(employeeScopeFilter);
      if (!countRes.error) {
        setEmployeeTotal(Number(countRes.count ?? 0));
      }

      const counts = new Map<string, number>();
      const pageSize = 1000;
      const maxRows = 200000;
      let offset = 0;

      while (true) {
        const res = await supabase
          .from('applicants')
          .select('client_position')
          .eq('is_archived', false)
          .eq('is_trashed', false)
          .or(employeeScopeFilter)
          .range(offset, offset + pageSize - 1);

        if (res.error) break;
        const rows = (res.data as Array<{ client_position: string | null }>) ?? [];
        if (!rows.length) break;

        for (const row of rows) {
          const raw = String(row?.client_position ?? '').trim();
          const key = raw || 'Unassigned';
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        offset += rows.length;
        if (rows.length < pageSize || offset >= maxRows) break;
      }

      const list = Array.from(counts.entries())
        .map(([position, count]) => ({ position, count }))
        .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position));
      setPositionCounts(list);
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  const fetchContractStats = useCallback(async () => {
    setContractsLoading(true);
    try {
      const clientKeys = new Set<string>();
      const detachmentKeys = new Set<string>();
      const pageSize = 1000;
      const maxRows = 200000;
      let offset = 0;

      while (true) {
        const res = await supabase
          .from('contracts')
          .select('client_name, project_name, specific_area, cluster')
          .range(offset, offset + pageSize - 1);

        if (res.error) {
          console.error(res.error);
          break;
        }

        const rows =
          (res.data as Array<{
            client_name: string | null;
            project_name: string | null;
            specific_area: string | null;
            cluster: string | null;
          }>) ?? [];
        if (!rows.length) break;

        for (const row of rows) {
          const client = normalizeDistinctValue(row.client_name);
          const project = normalizeDistinctValue(row.project_name);
          const area = normalizeDistinctValue(row.specific_area);
          const cluster = normalizeDistinctValue(row.cluster);

          if (client) clientKeys.add(client);

          const fingerprint = [client, project, area, cluster].join('|');
          if (fingerprint.replace(/\|/g, '').trim()) {
            detachmentKeys.add(fingerprint);
          }
        }

        offset += rows.length;
        if (rows.length < pageSize || offset >= maxRows) break;
      }

      setClientTotal(clientKeys.size);
      setClientDetachmentTotal(detachmentKeys.size);
    } finally {
      setContractsLoading(false);
    }
  }, []);

  const fetchLoginHistory = useCallback(async () => {
    try {
      let rows: AdminLoginHistoryRow[] = [];

      if (electronAPI?.admin?.getLoginHistory) {
        const result = await electronAPI.admin.getLoginHistory({ limit: 2000 });
        rows = (result?.rows as AdminLoginHistoryRow[] | undefined) ?? [];
      } else {
        const { data, error: fetchError } = await supabase
          .from('admin_login_history')
          .select('id, admin_id, username, full_name, role, logged_in_at, created_at')
          .order('logged_in_at', { ascending: false })
          .limit(2000);

        if (fetchError) {
          if (!isMissingLoginHistoryTableError(fetchError) && !isLoginHistoryPermissionError(fetchError)) {
            console.error(fetchError);
          }
          setLoginHistoryByAdminKey({});
          return;
        }

        rows = (data as AdminLoginHistoryRow[] | undefined) ?? [];
      }

      const grouped: Record<string, AdminLoginHistoryRow[]> = {};
      for (const row of rows) {
        const key = adminHistoryKey(row.admin_id, row.username);
        if (!key) continue;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      }
      setLoginHistoryByAdminKey(grouped);
    } catch (err) {
      if (!isMissingLoginHistoryTableError(err) && !isLoginHistoryPermissionError(err)) {
        console.error(err);
      }
      setLoginHistoryByAdminKey({});
    }
  }, [electronAPI]);

  useEffect(() => {
    void fetchAdmins();
    void fetchEmployeeStats();
    void fetchContractStats();
    void fetchLoginHistory();

    const channel = supabase
      .channel('realtime:dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admins' }, () => {
        void fetchAdmins();
        void fetchLoginHistory();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applicants' }, () => {
        void fetchEmployeeStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => {
        void fetchContractStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAdmins, fetchContractStats, fetchEmployeeStats, fetchLoginHistory]);

  useEffect(() => {
    return () => {
      if (closePopupTimerRef.current != null) {
        window.clearTimeout(closePopupTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!historyPopup) return undefined;

    const close = () => setHistoryPopup(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [historyPopup]);

  function clearPopupCloseTimer() {
    if (closePopupTimerRef.current != null) {
      window.clearTimeout(closePopupTimerRef.current);
      closePopupTimerRef.current = null;
    }
  }

  function schedulePopupClose() {
    clearPopupCloseTimer();
    closePopupTimerRef.current = window.setTimeout(() => {
      setHistoryPopup(null);
      closePopupTimerRef.current = null;
    }, 120);
  }

  function openHistoryPopup(adminId: string, trigger: HTMLElement) {
    if (typeof window === 'undefined') return;
    clearPopupCloseTimer();
    const rect = trigger.getBoundingClientRect();
    const popupWidth = 360;
    const safeMargin = 16;
    const left = Math.max(safeMargin, Math.min(rect.left, window.innerWidth - popupWidth - safeMargin));
    const top = Math.min(rect.bottom + 10, window.innerHeight - 260);
    setHistoryPopup({ adminId, top, left });
  }

  function historyRowsForAdmin(admin: AdminRow | null) {
    if (!admin) return [];
    const key = adminHistoryKey(admin.id, admin.username);
    const rows = key ? loginHistoryByAdminKey[key] ?? [] : [];
    if (rows.length) return rows;
    if (!admin.last_login) return [];
    return [
      {
        id: `fallback:${admin.id}`,
        admin_id: admin.id,
        username: admin.username,
        full_name: admin.full_name ?? null,
        role: admin.role,
        logged_in_at: admin.last_login,
        created_at: admin.last_login,
      },
    ];
  }

  const popupAdmin = useMemo(
    () => admins.find((admin) => admin.id === historyPopup?.adminId) ?? null,
    [admins, historyPopup?.adminId]
  );
  const popupRows = useMemo(() => {
    if (!popupAdmin) return [];
    const key = adminHistoryKey(popupAdmin.id, popupAdmin.username);
    const rows = key ? loginHistoryByAdminKey[key] ?? [] : [];
    if (rows.length) return rows.slice(0, 50);
    if (!popupAdmin.last_login) return [];
    return [
      {
        id: `fallback:${popupAdmin.id}`,
        admin_id: popupAdmin.id,
        username: popupAdmin.username,
        full_name: popupAdmin.full_name ?? null,
        role: popupAdmin.role,
        logged_in_at: popupAdmin.last_login,
        created_at: popupAdmin.last_login,
      },
    ];
  }, [loginHistoryByAdminKey, popupAdmin]);

  function handleLogout() {
    try {
      localStorage.removeItem('adminSession');
    } catch {
      // ignore
    }

    try {
      sessionStorage.setItem('showLogoutSplash', '1');
    } catch {
      // ignore
    }

    if (typeof window !== 'undefined') {
      window.location.replace('/Login/');
      return;
    }

    router.replace('/Login/');
  }

  return (
    <div className="space-y-6 pb-6">
      <section className="glass-panel animate-fade-in overflow-hidden rounded-[28px] border-white/70">
        <div className="bg-gradient-to-br from-[#111827] via-[#8B1C1C] to-[#611313] px-6 py-6 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80">
                <Sparkles className="h-3.5 w-3.5 text-[#FFDA03]" />
                Live overview
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
                Quickly see employee totals, client coverage, position distribution, and current admin activity without leaving the page.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/Main_Modules/Employees/')}
                className="animated-btn inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2.5 font-semibold text-black hover:brightness-95"
              >
                View Employees
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleLogout}
                className="animated-btn inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-medium text-white hover:bg-white/15"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 lg:grid-cols-4">
          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white to-[#fff8db] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Total Employees</div>
                <div className="mt-1 text-3xl font-semibold text-black">{employeesLoading ? '...' : employeeTotal}</div>
                <div className="mt-2 text-xs text-gray-500">From public.applicants (active/inactive only, not archived/trashed)</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8B1C1C]/10 text-[#8B1C1C]">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white to-[#f1f7ff] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Client Total No.</div>
                <div className="mt-1 text-3xl font-semibold text-black">{contractsLoading ? '...' : clientTotal}</div>
                <div className="mt-2 text-xs text-gray-500">Distinct client names from the Client page</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white to-[#ecfff6] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Detachment (Client) Total No.</div>
                <div className="mt-1 text-3xl font-semibold text-black">{contractsLoading ? '...' : clientDetachmentTotal}</div>
                <div className="mt-2 text-xs text-gray-500">Distinct client page site entries from public.contracts</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white to-[#fff3e8] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Top Positions</div>
                {employeesLoading ? (
                  <div className="mt-2 text-sm text-gray-500">Loading...</div>
                ) : topPositions.length === 0 ? (
                  <div className="mt-2 text-sm text-gray-500">No employee rows found.</div>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {topPositions.slice(0, 3).map((positionRow) => (
                      <div key={positionRow.position} className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm shadow-sm">
                        <div className="min-w-0 truncate text-black">{positionRow.position}</div>
                        <div className="rounded-full bg-[#FFDA03]/20 px-2.5 py-1 text-xs font-semibold text-[#8B1C1C]">
                          {positionRow.count}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFDA03]/20 text-[#8B1C1C]">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/60 bg-white/70 px-6 py-4 text-xs text-slate-500 backdrop-blur">
          Signed-in role:{' '}
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            {role ?? 'unknown'}
          </span>
        </div>
      </section>

      <section className="glass-panel animate-slide-up rounded-[28px] border-white/70 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-black">Admins</div>
            <div className="text-sm text-gray-500">Overview of accounts from public.admins with recent login activity</div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            Hover login time to view scrollable history
          </div>
        </div>

        {loading ? (
          <div className="py-10">
            <LoadingCircle label="Loading admins..." />
          </div>
        ) : error ? (
          <div className="py-4 text-red-600">{error}</div>
        ) : admins.length === 0 ? (
          <div className="py-6 text-gray-600">No admins found.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-auto text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Full name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Login time</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => {
                  const rows = historyRowsForAdmin(admin);
                  return (
                    <tr key={admin.id} className="animated-row border-t border-slate-100">
                      <td className="px-4 py-3 text-black">{admin.username}</td>
                      <td className="px-4 py-3 text-black">{admin.full_name ?? '-'}</td>
                      <td className="px-4 py-3 text-black">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {admin.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-black">
                        <span
                          className={
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium ' +
                            (admin.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
                          }
                        >
                          {admin.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-black">
                        {admin.last_login ? (
                          <button
                            type="button"
                            onMouseEnter={(event) => openHistoryPopup(admin.id, event.currentTarget)}
                            onMouseLeave={schedulePopupClose}
                            onFocus={(event) => openHistoryPopup(admin.id, event.currentTarget)}
                            onBlur={schedulePopupClose}
                            onClick={(event) => openHistoryPopup(admin.id, event.currentTarget)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-black transition hover:border-[#8B1C1C]/30 hover:bg-white"
                          >
                            <span className="whitespace-nowrap">{formatDateTime(admin.last_login)}</span>
                            <span className="text-xs text-slate-500">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">Never</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canUsePortal && historyPopup && popupAdmin
        ? createPortal(
            <div
              className="fixed z-[120] w-[360px] rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ top: historyPopup.top, left: historyPopup.left }}
              onMouseEnter={clearPopupCloseTimer}
              onMouseLeave={schedulePopupClose}
            >
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Login history</div>
                <div className="text-xs text-slate-500">
                  {popupAdmin.full_name ?? popupAdmin.username}
                </div>
              </div>

              <div className="max-h-[260px] overflow-y-auto px-2 py-2">
                {popupRows.length ? (
                  popupRows.map((row, index) => (
                    <div key={`${row.id}-${index}`} className="rounded-xl px-3 py-2 text-sm hover:bg-slate-50">
                      <div className="font-medium text-slate-900">{formatDateTime(row.logged_in_at)}</div>
                      <div className="text-xs text-slate-500">Recorded sign-in #{index + 1}</div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-sm text-slate-500">No recorded login history yet.</div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
