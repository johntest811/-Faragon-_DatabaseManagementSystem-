import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const READ_TIMEOUT_MS = 75_000;
const WRITE_TIMEOUT_MS = 120_000;
const READ_RETRY_DELAYS_MS = [700, 1_500];

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function methodForFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function canSafelyRetry(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function timeoutForMethod(method: string) {
  return canSafelyRetry(method) ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
}

function mergeAbortSignals(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let cleanupSignalListener = () => {};

  if (signal) {
    const abortFromCaller = () => controller.abort(signal.reason);
    if (signal.aborted) {
      abortFromCaller();
    } else {
      signal.addEventListener('abort', abortFromCaller, { once: true });
      cleanupSignalListener = () => signal.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      cleanupSignalListener();
    },
  };
}

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = methodForFetch(input, init);
  const retryable = canSafelyRetry(method);
  const maxAttempts = retryable ? READ_RETRY_DELAYS_MS.length + 1 : 1;
  const nativeFetch = globalThis.fetch.bind(globalThis);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { signal, cleanup } = mergeAbortSignals(init?.signal, timeoutForMethod(method));

    try {
      const response = await nativeFetch(input, {
        ...init,
        signal,
      });

      cleanup();

      if (!retryable || !shouldRetryStatus(response.status) || attempt === maxAttempts - 1) {
        return response;
      }
    } catch (error) {
      cleanup();
      if (!retryable || attempt === maxAttempts - 1 || init?.signal?.aborted) {
        throw error;
      }
    }

    await delay(READ_RETRY_DELAYS_MS[attempt] ?? 0);
  }

  return nativeFetch(input, init);
}
