import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseFetch } from './supabaseFetch';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const resilientFetch = createSupabaseFetch();

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
  SUPABASE_ANON_KEY ?? 'missing-anon-key',
  {
    global: {
      fetch: resilientFetch,
    },
  }
);

//Checks for connectivity to Supabase
export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.auth.getSession(); // lightweight request
  if (error) {
    console.error("Supabase connection failed:", error.message);
    return false;
  }
  // A local auth session is not proof that the database is reachable.
  return Boolean(data.session);
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
