"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { History } from "lucide-react";
import { supabase } from "../../Client/SupabaseClients";

export type DetachmentHistoryEntry = {
  detachment_history_id: string;
  previous_detachment: string | null;
  new_detachment: string | null;
  change_type: string | null;
  changed_at: string;
};

type DetachmentHistoryPopoverProps = {
  applicantId: string;
  currentDetachment: string | null;
  detailsHref?: string;
  textClassName?: string;
  buttonClassName?: string;
};

function safeDetachmentLabel(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || "Unassigned";
}

export function detachmentHistorySummary(entry: DetachmentHistoryEntry) {
  const previousLabel = safeDetachmentLabel(entry.previous_detachment);
  const nextLabel = safeDetachmentLabel(entry.new_detachment);
  const changeType = String(entry.change_type ?? "").trim().toUpperCase();

  if (changeType === "INITIAL") return `Initial assignment: ${nextLabel}`;
  if (changeType === "CLEARED") return `${previousLabel} -> Unassigned`;
  if (previousLabel === nextLabel) return nextLabel;
  return `${previousLabel} -> ${nextLabel}`;
}

function isMissingRelationError(error: unknown, relationName: string) {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return message.includes(relationName.toLowerCase()) && message.includes("does not exist");
}

export default function DetachmentHistoryPopover({
  applicantId,
  currentDetachment,
  detailsHref,
  textClassName = "",
  buttonClassName = "",
}: DetachmentHistoryPopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadedApplicantId, setLoadedApplicantId] = useState("");
  const [rows, setRows] = useState<DetachmentHistoryEntry[]>([]);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const currentLabel = useMemo(() => safeDetachmentLabel(currentDetachment), [currentDetachment]);
  const bodyMaxHeight = useMemo(() => {
    if (!menuPosition) return 160;
    return Math.max(160, menuPosition.maxHeight - (detailsHref ? 120 : 76));
  }, [detailsHref, menuPosition]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 120);
  }, [clearCloseTimer]);

  const updateMenuPosition = useCallback(() => {
    if (typeof window === "undefined" || !rootRef.current) return;

    const rect = rootRef.current.getBoundingClientRect();
    const safeMargin = 8;
    const gap = 8;
    const width = Math.min(340, Math.max(260, window.innerWidth - safeMargin * 2));
    const left = Math.max(safeMargin, Math.min(rect.left, window.innerWidth - width - safeMargin));
    const top = Math.min(rect.bottom + gap, Math.max(safeMargin, window.innerHeight - safeMargin - 180));
    const maxHeight = Math.max(180, window.innerHeight - top - safeMargin);

    setMenuPosition({ top, left, width, maxHeight });
  }, []);

  const loadHistory = useCallback(async () => {
    if (!applicantId.trim()) return;
    if (loadedApplicantId === applicantId) return;

    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase
        .from("applicant_detachment_history")
        .select("detachment_history_id, previous_detachment, new_detachment, change_type, changed_at")
        .eq("applicant_id", applicantId)
        .order("changed_at", { ascending: false });

      if (error) {
        if (isMissingRelationError(error, "applicant_detachment_history")) {
          setRows([]);
          setLoadError("Detachment history is not available until the database update is applied.");
          setLoadedApplicantId(applicantId);
          return;
        }
        throw error;
      }

      setRows((data as DetachmentHistoryEntry[]) ?? []);
      setLoadedApplicantId(applicantId);
    } catch (error: unknown) {
      setRows([]);
      setLoadError(error instanceof Error ? error.message : "Failed to load detachment history.");
    } finally {
      setLoading(false);
    }
  }, [applicantId, loadedApplicantId]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    void loadHistory();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [loadHistory, open, updateMenuPosition]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  return (
    <div
      ref={rootRef}
      className="inline-flex max-w-full min-w-0 items-center gap-2 align-middle"
      onMouseEnter={() => {
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (typeof window !== "undefined") scheduleClose();
      }}
    >
      <span className={`min-w-0 max-w-full truncate ${textClassName}`} title={currentLabel}>
        {currentLabel}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          clearCloseTimer();
          setOpen((value) => !value);
        }}
        onMouseEnter={(event) => {
          event.stopPropagation();
          clearCloseTimer();
          setOpen(true);
        }}
        onFocus={() => {
          clearCloseTimer();
          setOpen(true);
        }}
        className={`shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${buttonClassName}`}
      >
        <History className="h-3.5 w-3.5" />
        History
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, maxHeight: menuPosition.maxHeight }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Previous Detachment History</div>
                <div className="mt-1 text-xs text-slate-500">Current: {currentLabel}</div>
              </div>

              <div className="px-4 py-3">
                {loading ? <div className="text-sm text-slate-500">Loading history...</div> : null}

                {!loading && loadError ? <div className="text-sm text-amber-700">{loadError}</div> : null}

                {!loading && !loadError && rows.length === 0 ? (
                  <div className="text-sm text-slate-500">No detachment history recorded yet.</div>
                ) : null}

                {!loading && !loadError && rows.length > 0 ? (
                  <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: bodyMaxHeight }}>
                    {rows.map((row) => (
                      <div key={row.detachment_history_id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {new Date(row.changed_at).toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{detachmentHistorySummary(row)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {detailsHref ? (
                <div className="border-t border-slate-100 px-4 py-3">
                  <Link
                    href={detailsHref}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Open full details
                  </Link>
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
