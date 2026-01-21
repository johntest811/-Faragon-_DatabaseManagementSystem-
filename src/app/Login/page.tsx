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
        role: admin.role,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem('adminSession', JSON.stringify(sessionData));

      router.push('/Main_Modules/Dashboard/');
    } catch (err: unknown) {
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
              className={`w-full py-2 px-4 rounded-md text-white bg-yellow-500 ${
                isLoading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
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
