type RefreshTasks = Record<string, () => Promise<unknown>>;

// Coalesce realtime bursts without losing changes received during a fetch.
// The queue never caches results or retries failed writes.
export function createRefreshQueue<T extends RefreshTasks>(
  tasks: T,
  options: { delayMs?: number; isActive?: () => boolean; onError?: (error: unknown) => void } = {},
) {
  const pending = new Set<keyof T>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let disposed = false;

  function schedule() {
    if (disposed || running || timer !== null || !pending.size || options.isActive?.() === false) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, options.delayMs ?? 500);
  }

  async function run() {
    if (disposed || running || options.isActive?.() === false) return;
    const batch = [...pending];
    pending.clear();
    running = true;
    try {
      const results = await Promise.allSettled(batch.map((key) => Promise.resolve().then(tasks[key])));
      if (!disposed) {
        for (const result of results) {
          if (result.status === "rejected") options.onError?.(result.reason);
        }
      }
    } finally {
      running = false;
      schedule();
    }
  }

  return {
    request(...keys: (keyof T)[]) {
      if (disposed) return;
      keys.forEach((key) => pending.add(key));
      schedule();
    },
    resume: schedule,
    dispose() {
      disposed = true;
      pending.clear();
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
