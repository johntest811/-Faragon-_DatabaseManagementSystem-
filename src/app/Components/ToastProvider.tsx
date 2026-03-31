"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  timeoutMs: number;
};

type ToastPushOptions = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  timeoutMs?: number;
};

type ToastApi = {
  push: (opts: ToastPushOptions) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function createId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toastStyles(variant: ToastVariant) {
  if (variant === "error") return "border-red-200 bg-red-50 text-red-800";
  if (variant === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-gray-200 bg-white text-gray-900";
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-[9999] flex w-[360px] max-w-[calc(100vw-3rem)] flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-sm transition ${toastStyles(t.variant)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {t.title ? <div className="text-sm font-semibold">{t.title}</div> : null}
              <div className="text-sm break-words">{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="rounded-lg border bg-white/60 px-2 py-1 text-xs text-gray-700 hover:bg-white"
              aria-label="Dismiss"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle != null) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
    for (const handle of timers.current.values()) window.clearTimeout(handle);
    timers.current.clear();
  }, []);

  const push = useCallback(
    (opts: ToastPushOptions) => {
      const id = createId();
      const next: Toast = {
        id,
        title: opts.title,
        message: opts.message,
        variant: opts.variant ?? "info",
        timeoutMs: opts.timeoutMs ?? 4000,
      };

      setToasts((prev) => [next, ...prev].slice(0, 5));

      const handle = window.setTimeout(() => {
        dismiss(id);
      }, next.timeoutMs);
      timers.current.set(id, handle);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      clear,
      success: (message: string, title?: string) => push({ message, title, variant: "success" }),
      error: (message: string, title?: string) => push({ message, title, variant: "error" }),
      info: (message: string, title?: string) => push({ message, title, variant: "info" }),
    }),
    [push, dismiss, clear]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
