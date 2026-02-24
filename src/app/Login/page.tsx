'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../Client/SupabaseClients';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setUsername('');
    setPassword('');
    setError('');
    setIsLoading(false);

    // Ensure legacy session is cleared when visiting Login.
    // (Logout clears it too, but this keeps Login resilient.)
    try {
      localStorage.removeItem('adminSession');
    } catch {
      // ignore
    }
  }, [router]);

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
      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('id, username, password, role, position, full_name, is_active')
        .eq('username', username)
        .single();

      if (adminError || !admin) {
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      if (!admin.is_active) {
        setError('Account deactivated. Contact administrator.');
        setIsLoading(false);
        return;
      }

      // NOTE: This matches your current SQL schema (plain-text password column).
      // If you later migrate to Supabase Auth, this should be removed.
      if (String(admin.password ?? '') !== password) {
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      await supabase
        .from('admins')
        .update({ last_login: new Date().toISOString() })
        .eq('id', admin.id);

      const sessionData = {
        id: String(admin.id),
        username: admin.username,
        full_name: admin.full_name ?? null,
        position: admin.position ?? null,
        role: String(admin.role ?? "").trim().toLowerCase(),
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem('adminSession', JSON.stringify(sessionData));

      router.replace('/Main_Modules/Dashboard/');
    } catch (err: unknown) {
      console.error('Login error', err);
      setError('An unexpected error occurred. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-3 animate-pulse">
          <span className="h-3 w-3 rounded-full bg-[#FFDA03]" />
          <span className="text-sm font-medium text-gray-600">Secure Admin Access</span>
        </div>

        <div className="bg-white p-8 rounded-2xl border shadow-sm">
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Admin Login</h1>
          <p className="text-sm text-gray-500 text-center mb-6">Sign in to continue to the dashboard.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 mb-6 rounded-lg">
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full px-3 py-2.5 border rounded-lg text-black outline-none focus:ring-2 focus:ring-[#FFDA03]"
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
                className="block w-full px-3 py-2.5 border rounded-lg text-black outline-none focus:ring-2 focus:ring-[#FFDA03]"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-2.5 px-4 rounded-lg text-black font-semibold bg-[#FFDA03] transition-opacity ${
                  isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'
                }`}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>

          <p className="mt-6 text-xs text-gray-500 text-center">Authorized access only</p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Database Management
        </p>
      </div>
    </div>
  );
}
