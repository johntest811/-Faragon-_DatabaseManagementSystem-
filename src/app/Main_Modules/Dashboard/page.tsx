'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../Client/SupabaseClients';
import { useAuthRole } from '../../Client/useRbac';

type AdminRow = {
  id: string;
  username: string;
  full_name?: string | null;
  role: string;
  position?: string | null;
  is_active: boolean;
  created_at: string | null;
};

export default function DashboardPage() {
  const { role } = useAuthRole();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

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

  useEffect(() => {
    fetchAdmins();

    const channel = supabase
      .channel('realtime:user_profiles-admins')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admins' },
        () => fetchAdmins()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function handleLogout() {
    try {
      localStorage.removeItem('adminSession');
    } catch {
      // ignore
    }
    router.push('/Login');
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-semibold text-black">Admins</div>
          <div className="text-sm text-gray-500">Overview of accounts from public.admins</div>
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

      {loading ? (
        <div className="py-10 text-center text-gray-500">Loading admins...</div>
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

      <div className="mt-4 text-xs text-gray-500">
        Signed-in role: <span className="font-semibold">{role ?? 'unknown'}</span>
      </div>
    </section>
  );
}