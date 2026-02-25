'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../Client/SupabaseClients';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUsername('');
    setPassword('');
    setError('');

    try {
      localStorage.removeItem('adminSession');
    } catch {
      // ignore
    }

    const focusTimer = window.setTimeout(() => {
      try {
        window.focus();
      } catch {
        // ignore
      }

      // Electron can occasionally start unfocused after route changes/logout.
      // Explicitly focus the first input so typing works immediately.
      usernameRef.current?.focus();
      usernameRef.current?.select();
    }, 60);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username.trim() || !password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    try {
      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('id, username, password, role, position, full_name, is_active')
        .eq('username', username.trim())
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md transition-all duration-500 opacity-100 translate-y-0">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFDA03] animate-pulse" />
          <span className="text-xs tracking-wide text-gray-600 uppercase">Secure Admin Access</span>
        </div>

        <div className="rounded-2xl border bg-white p-7 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900 text-center">Admin Login</h1>
          <p className="text-sm text-gray-500 text-center mt-1 mb-6">Sign in to continue</p>

          {error ? (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                id="username"
                ref={usernameRef}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-black bg-white outline-none focus:ring-2 focus:ring-[#FFDA03]"
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-black bg-white outline-none focus:ring-2 focus:ring-[#FFDA03]"
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={isLoading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full rounded-xl py-2.5 font-semibold text-black bg-[#FFDA03] transition-opacity ${
                isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
              }`}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-500">Authorized access only</p>
        </div>
      </div>
    </div>
  );
}
