'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../Client/SupabaseClients';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function logActivity(payload: {
    admin_id: string;
    admin_name: string;
    action: string;
    details?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await supabase.from('activity_logs').insert({
        admin_id: payload.admin_id,
        admin_name: payload.admin_name,
        action: payload.action,
        details: payload.details ?? null,
        metadata: payload.metadata ?? null,
        created_at: new Date().toISOString(),
      });
      return { success: true };
    } catch (e) {
      console.warn('Activity log failed', e);
      return { success: false, error: e };
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username || !password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    try {
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('id, username, password, position, role, is_active, full_name')
        .eq('username', username)
        .single();

      if (adminError || !adminData) {
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      if (!adminData.is_active) {
        setError('Account deactivated. Contact administrator.');
        setIsLoading(false);
        return;
      }

      // NOTE: Plain-text check — replace with hashed compare in production
      if (adminData.password !== password) {
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      await supabase
        .from('admins')
        .update({ last_login: new Date().toISOString() })
        .eq('id', adminData.id);

      const sessionData = {
        id: String(adminData.id),
        username: adminData.username,
        full_name: adminData.full_name ?? null,
        position: adminData.position,
        role: adminData.role,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem('adminSession', JSON.stringify(sessionData));

      // non-blocking activity log
      logActivity({
        admin_id: String(adminData.id),
        admin_name: adminData.username,
        action: 'login',
        details: `Logged in`,
        metadata: { role: adminData.role, position: adminData.position },
      });

      router.push('/Main_Modules/Dashboard');
    } catch (err: any) {
      console.error('Login error', err);
      setError('An unexpected error occurred. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">Admin Login</h1>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded">
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="block w-full px-3 py-2 border rounded-md text-black"
              placeholder="Enter your username"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full px-3 py-2 border rounded-md text-black"
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-2 px-4 rounded-md text-white bg-yellow-500 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-xs text-gray-500 text-center">Authorized access only</p>
      </div>

      <p className="mt-8 text-center text-sm text-gray-600">
        &copy; {new Date().getFullYear()} Database Management. All rights reserved.
      </p>
    </div>
  );
}
