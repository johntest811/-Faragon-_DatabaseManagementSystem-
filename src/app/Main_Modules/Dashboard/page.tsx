'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../Client/SupabaseClients';
import { useAuthRole } from '../../Client/useRbac';
import LoadingCircle from '../../Components/LoadingCircle';
import { ArrowRight, Activity, ShieldCheck, Sparkles, Users } from 'lucide-react';

type AdminRow = {
  id: string;
  username: string;
  full_name?: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
};

type PositionCount = { position: string; count: number };

export default function DashboardPage() {
  const { role } = useAuthRole();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [employeeTotal, setEmployeeTotal] = useState<number>(0);
  const [positionCounts, setPositionCounts] = useState<PositionCount[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  const topPositions = useMemo(() => positionCounts.slice(0, 10), [positionCounts]);

  async function fetchAdmins() {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('admins')
        .select('id, username, full_name, role, is_active, created_at')
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
  }

  async function fetchEmployeeStats() {
    setEmployeesLoading(true);
    try {
      // Fast exact count.
      const countRes = await supabase
        .from('applicants')
        .select('applicant_id', { count: 'exact', head: true })
        .eq('is_archived', false)
        .eq('is_trashed', false);
      if (!countRes.error) {
        setEmployeeTotal(Number(countRes.count ?? 0));
      }

      // Position breakdown via pagination (works without SQL GROUP BY).
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
          .range(offset, offset + pageSize - 1);

        if (res.error) break;
        const rows = (res.data as Array<{ client_position: string | null }>) ?? [];
        if (!rows.length) break;

        for (const r of rows) {
          const raw = String(r?.client_position ?? '').trim();
          const key = raw || 'Unassigned';
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        offset += rows.length;
        if (rows.length < pageSize) break;
        if (offset >= maxRows) break;
      }

      const list = Array.from(counts.entries())
        .map(([position, count]) => ({ position, count }))
        .sort((a, b) => (b.count - a.count) || a.position.localeCompare(b.position));
      setPositionCounts(list);
    } finally {
      setEmployeesLoading(false);
    }
  }

  useEffect(() => {
    fetchAdmins();
    fetchEmployeeStats();

    const channel = supabase
      .channel('realtime:user_profiles-admins')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admins' },
        () => fetchAdmins()
      )
      .subscribe();

    const empChannel = supabase
      .channel('realtime:dashboard-applicants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applicants' }, () => {
        fetchEmployeeStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(empChannel);
    };
  }, []);

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
                Quickly see employee counts, position distribution, and current admin activity without leaving the page.
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

        <div className="grid gap-4 p-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white to-[#fff8db] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Total Employees</div>
                <div className="mt-1 text-3xl font-semibold text-black">{employeesLoading ? '…' : employeeTotal}</div>
                <div className="mt-2 text-xs text-gray-500">From public.applicants (not archived/trashed)</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8B1C1C]/10 text-[#8B1C1C]">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white to-[#f1f7ff] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Positions</div>
                <div className="mt-1 text-3xl font-semibold text-black">
                  {employeesLoading ? '…' : positionCounts.filter((p) => p.position !== 'Unassigned').length}
                </div>
                <div className="mt-2 text-xs text-gray-500">Distinct positions (client_position)</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white to-[#fff3e8] p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Top Positions</div>
                {employeesLoading ? (
                  <div className="mt-2 text-sm text-gray-500">Loading…</div>
                ) : topPositions.length === 0 ? (
                  <div className="mt-2 text-sm text-gray-500">No employee rows found.</div>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {topPositions.slice(0, 3).map((p) => (
                      <div key={p.position} className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm shadow-sm">
                        <div className="min-w-0 truncate text-black">{p.position}</div>
                        <div className="rounded-full bg-[#FFDA03]/20 px-2.5 py-1 text-xs font-semibold text-[#8B1C1C]">
                          {p.count}
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
          Signed-in role:{" "}
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
            <div className="text-sm text-gray-500">Overview of accounts from public.admins</div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            Real-time updates enabled
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-auto text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Full name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="animated-row border-t border-slate-100">
                    <td className="px-4 py-3 text-black">{a.username}</td>
                    <td className="px-4 py-3 text-black">{a.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-black">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {a.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-black">
                      <span
                        className={
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-medium ' +
                          (a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
                        }
                      >
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-black">
                      {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}