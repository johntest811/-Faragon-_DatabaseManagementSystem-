'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../Client/SupabaseClients';
import { useAuthRole } from '../../Client/useRbac';
import LoadingCircle from '../../Components/LoadingCircle';

type AdminRow = {
  id: string;
  username: string;
  full_name?: string | null;
  role: string;
  position?: string | null;
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
        .select('id, username, full_name, role, position, is_active, created_at')
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

    router.replace('/Login/');
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-lg font-semibold text-black">Dashboard</div>
            <div className="text-sm text-gray-500">Quick overview</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/Main_Modules/Employees/')}
              className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-medium"
            >
              View Employees
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-white border text-red-600 font-medium"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500">Total Employees</div>
            <div className="mt-1 text-3xl font-semibold text-black">
              {employeesLoading ? '…' : employeeTotal}
            </div>
            <div className="mt-2 text-xs text-gray-500">From public.applicants (not archived/trashed)</div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500">Positions</div>
            <div className="mt-1 text-3xl font-semibold text-black">
              {employeesLoading ? '…' : positionCounts.filter((p) => p.position !== 'Unassigned').length}
            </div>
            <div className="mt-2 text-xs text-gray-500">Distinct positions (client_position)</div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500">Top Positions</div>
            {employeesLoading ? (
              <div className="mt-2 text-sm text-gray-500">Loading…</div>
            ) : topPositions.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">No employee rows found.</div>
            ) : (
              <div className="mt-2 space-y-1">
                {topPositions.map((p) => (
                  <div key={p.position} className="flex items-center justify-between gap-3 text-sm">
                    <div className="text-black truncate">{p.position}</div>
                    <div className="text-gray-600 font-medium">{p.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Signed-in role: <span className="font-semibold">{role ?? 'unknown'}</span>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-lg font-semibold text-black">Admins</div>
            <div className="text-sm text-gray-500">Overview of accounts from public.admins</div>
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
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left text-sm text-gray-600">
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Full name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 text-black">{a.username}</td>
                    <td className="px-3 py-2 text-black">{a.full_name ?? '—'}</td>
                    <td className="px-3 py-2 text-black">{a.role}</td>
                    <td className="px-3 py-2 text-black">{a.is_active ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 text-black">
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