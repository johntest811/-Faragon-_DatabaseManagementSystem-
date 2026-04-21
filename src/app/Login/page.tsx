'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../Client/SupabaseClients';
import { ArrowRight, Activity, BadgeCheck, ShieldCheck, Sparkles } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const usernameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!pathname.startsWith('/Login')) return;

    setUsername('');
    setPassword('');
    setError('');
    setIsLoading(false);

    try {
      localStorage.removeItem('adminSession');
    } catch {
      // ignore
    }

    try {
      sessionStorage.removeItem('showLoginSplash');
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

    const refocusOnWindowFocus = () => {
      usernameRef.current?.focus();
    };

    window.addEventListener('focus', refocusOnWindowFocus);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('focus', refocusOnWindowFocus);
    };
  }, [pathname]);

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
        .select('id, username, password, role, full_name, is_active')
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
        role: String(admin.role ?? "").trim().toLowerCase(),
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem('adminSession', JSON.stringify(sessionData));

      try {
        sessionStorage.setItem('showLoginSplash', '1');
      } catch {
        // ignore
      }

      router.replace('/Main_Modules/Dashboard/');
    } catch (err: unknown) {
      console.error('Login error', err);
      setError('An unexpected error occurred. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 right-8 h-72 w-72 rounded-full bg-[#8B1C1C]/10 blur-3xl" />
        <div className="absolute bottom-[-5rem] left-[-5rem] h-96 w-96 rounded-full bg-[#FFDA03]/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-[32px] border border-white/70 bg-white/75 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <aside className="relative overflow-hidden bg-gradient-to-br from-[#111827] via-[#8B1C1C] to-[#5c1212] p-8 text-white sm:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,218,3,0.18),_transparent_36%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80">
                <Sparkles className="h-3.5 w-3.5 text-[#FFDA03]" />
                Secure Admin Access
              </div>

              <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="animate-float flex h-24 w-24 items-center justify-center rounded-[28px] bg-white/90 p-3 shadow-2xl shadow-black/20">
                  <Image src="/Logo.png" alt="Faragon Security Agency logo" width={96} height={96} className="h-full w-full object-contain" priority />
                </div>
                <div className="max-w-md">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Faragon Database</h1>
                  <p className="mt-3 text-sm leading-6 text-white/80">
                    A focused workspace for employee records, inventory, requests, and notification workflows.
                  </p>
                </div>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-[#FFDA03]">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Protected access</div>
                      <div className="text-xs text-white/70">Role-based admin sign-in</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-[#FFDA03]">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Live notifications</div>
                      <div className="text-xs text-white/70">Automatic Gmail sends stay branded</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 sm:col-span-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-[#FFDA03]">
                      <BadgeCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Clean workflow</div>
                      <div className="text-xs text-white/70">Fast access to employees, requests, settings, and reports</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section className="p-6 sm:p-8 lg:p-10">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#8B1C1C]/10 bg-[#FFDA03]/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-[#8B1C1C]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Sign In
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
                Desktop ready
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-slate-200/80 bg-white/90 p-7 shadow-sm sm:p-8">
              <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to continue to the dashboard.</p>

              {error ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">Username</label>
                  <input
                    id="username"
                    ref={usernameRef}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-black outline-none transition-shadow focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
                    placeholder="Enter username"
                    autoComplete="username"
                    autoFocus
                    disabled={isLoading}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-black outline-none transition-shadow focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
                    placeholder="Enter password"
                    autoComplete="current-password"
                    disabled={isLoading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`animated-btn inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FFDA03] px-4 py-3 font-semibold text-black ${
                    isLoading ? 'cursor-not-allowed opacity-60' : 'hover:brightness-95'
                  }`}
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <p className="mt-5 text-center text-xs text-slate-500">Authorized access only</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
