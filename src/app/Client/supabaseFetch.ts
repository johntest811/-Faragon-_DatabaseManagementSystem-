type FetchOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
};

// Only concurrent, identical Data API reads are shared. No response or
// permission cache survives a completed request; different JWTs never share.
export function createSupabaseFetch(options: FetchOptions = {}): typeof fetch {
  const inFlight = new Map<string, Promise<Response>>();
  const cooldowns = new Map<string, number>();
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  return async (input, init) => {
    const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const url = new URL(request?.url ?? String(input));
    const headers = new Headers(request?.headers);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const signal = init?.signal ?? request?.signal;
    const read = method === "GET" || method === "HEAD";
    const dataRead = read && url.pathname.startsWith("/rest/v1/");
    const scope = `${url.origin}\n${headers.get("authorization") ?? ""}\n${headers.get("apikey") ?? ""}`;
    const key = dataRead && !signal
      ? JSON.stringify([method, url.href, Array.from(headers.entries()).sort(), init?.credentials, init?.cache])
      : null;
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    for (const [entry, expires] of cooldowns) if (expires <= now()) cooldowns.delete(entry);
    if (dataRead && (cooldowns.get(scope) ?? 0) > now()) {
      return new Response(JSON.stringify({ message: "Database temporarily unavailable. Please try again shortly.", code: "APP_READ_COOLDOWN" }), {
        status: 503, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((cooldowns.get(scope)! - now()) / 1000)) },
      });
    }
    if (key && inFlight.has(key)) return (await inFlight.get(key)!).clone();

    async function send(): Promise<Response> {
      const attempts = dataRead ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, read ? (options.readTimeoutMs ?? 30_000) : (options.writeTimeoutMs ?? 120_000));
        try {
          const response = await (options.fetch ?? globalThis.fetch).call(globalThis, input, { ...init, signal: controller.signal });
          if (!dataRead || ![408, 429, 502, 503, 504].includes(response.status)) return response;
          const retryHeader = response.headers.get("Retry-After");
          if (response.status === 429 || retryHeader || attempt === attempts - 1) {
            const seconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : 0;
            const until = seconds ? now() + seconds * 1000 : Date.parse(retryHeader ?? "");
            cooldowns.set(scope, Math.max(now() + 30_000, Number.isFinite(until) ? until : 0));
            return response;
          }
          await response.body?.cancel();
        } catch (error) {
          if (signal?.aborted || !dataRead) throw error;
          if (attempt === attempts - 1) {
            cooldowns.set(scope, now() + 30_000);
            throw error;
          }
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
        }
        await sleep(750 + Math.floor(Math.random() * 250));
      }
      throw new Error("Database request failed.");
    }

    const pending = send();
    if (key) inFlight.set(key, pending);
    try {
      const response = await pending;
      return key ? response.clone() : response;
    } finally {
      if (key && inFlight.get(key) === pending) inFlight.delete(key);
    }
  };
}
