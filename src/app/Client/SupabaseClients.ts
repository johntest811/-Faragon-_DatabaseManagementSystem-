import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
if (!isSupabaseConfigured) {
  // Avoid crashing the renderer at import-time; show a clear console error instead.
  // Missing env at build-time will break all client-side JS if we throw here.
  console.error(
    '[supabase] Missing env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before building.'
  );
}

/**
 * Browser (renderer) client - safe to use in Next/Electron renderer because it uses the anon key.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'http://localhost',
  SUPABASE_ANON_KEY ?? 'missing-anon-key'
);

/**
 * Server/admin client factory - only use on the server or Electron main process where env is private.
 * Requires SUPABASE_SERVICE_ROLE_KEY (do NOT expose this to the renderer).
 */
export function createServerSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serverUrl = process.env.SUPABASE_URL ?? SUPABASE_URL;
  if (!serviceRoleKey || !serverUrl) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL in environment for server client.');
  }
  return createClient(serverUrl, serviceRoleKey);
}

//Checks for connectivity to Supabase
export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.auth.getSession(); // lightweight request
  if (error) {
    console.error("Supabase connection failed:", error.message);
    return false;
  }
  console.log("Supabase reachable. Session:", data.session);
  return true;
}

export async function checkDbQuery() {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Query failed:", error.message, error.details);
    return false;
  }

  console.log("Query OK. Rows:", data?.length ?? 0);
  return true;
}
