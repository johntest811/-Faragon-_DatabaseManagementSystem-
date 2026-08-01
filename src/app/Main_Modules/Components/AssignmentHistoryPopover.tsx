"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { History } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";

type SupportedHistory =
  | {
      table: "inventory_detachment_history";
      recordColumn: "inventory_id";
      previousColumn: "previous_detachment";
      newColumn: "new_detachment";
      legacyColumn: "detachment";
    }
  | {
      table: "car_insurance_post_distribution_history";
      recordColumn: "other_expiration_item_id";
      previousColumn: "previous_post_distributions";
      newColumn: "new_post_distributions";
      legacyColumn: "post_distributions";
    };

type HistoryRow = {
  id: string | number;
  previousValue: string | null;
  newValue: string | null;
  changeType: string;
  changedAt: string;
};

type AssignmentHistoryPopoverProps = {
  config: SupportedHistory;
  recordId: string | number;
  currentValue: string | null;
  title: string;
  currentLabel: string;
  onCurrentValueClick?: () => void;
};

function displayValue(value: string | null | undefined) {
  return String(value ?? "").trim() || "Unassigned";
}

function historySummary(row: HistoryRow) {
  const previous = displayValue(row.previousValue);
  const next = displayValue(row.newValue);
  const type = row.changeType.trim().toUpperCase();

  if (type === "INITIAL") return `Initial assignment: ${next}`;
  if (type === "CLEARED") return `${previous} -> Unassigned`;
  if (previous === next) return next;
  return `${previous} -> ${next}`;
}

function errorMessage(error: unknown) {
  return String((error as { message?: unknown })?.message ?? error ?? "");
}

export default function AssignmentHistoryPopover({
  config,
  recordId,
  currentValue,
  title,
  currentLabel,
  onCurrentValueClick,
}: AssignmentHistoryPopoverProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 340, maxHeight: 360 });

  const valueLabel = useMemo(() => displayValue(currentValue), [currentValue]);
  const recordKey = `${config.table}:${recordId}`;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 160);
  }, [clearCloseTimer]);

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(360, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const roomBelow = window.innerHeight - rect.bottom - margin;
    const desiredHeight = Math.min(390, Math.max(220, window.innerHeight - margin * 2));
    const showAbove = roomBelow < 220 && rect.top > roomBelow;
    const top = showAbove
      ? Math.max(margin, rect.top - desiredHeight - 8)
      : Math.min(rect.bottom + 8, window.innerHeight - margin - 180);
    setPosition({ top, left, width, maxHeight: Math.max(180, window.innerHeight - top - margin) });
  }, []);

  const loadHistory = useCallback(async () => {
    if (loadedKey === recordKey) return;
    setLoading(true);
    setLoadError("");

    const modern = await supabase
      .from(config.table)
      .select(`id, ${config.previousColumn}, ${config.newColumn}, change_type, changed_at`)
      .eq(config.recordColumn, recordId)
      .order("changed_at", { ascending: false })
      .limit(100);

    if (!modern.error) {
      setRows(
        ((modern.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: row.id as string | number,
          previousValue: (row[config.previousColumn] as string | null) ?? null,
          newValue: (row[config.newColumn] as string | null) ?? null,
          changeType: String(row.change_type ?? "UPDATED"),
          changedAt: String(row.changed_at ?? ""),
        }))
      );
      setLoadedKey(recordKey);
      setLoading(false);
      return;
    }

    const legacy = await supabase
      .from(config.table)
      .select(`id, ${config.legacyColumn}, changed_at`)
      .eq(config.recordColumn, recordId)
      .order("changed_at", { ascending: false })
      .limit(100);

    if (!legacy.error) {
      setRows(
        ((legacy.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: row.id as string | number,
          previousValue: null,
          newValue: (row[config.legacyColumn] as string | null) ?? null,
          changeType: "UPDATED",
          changedAt: String(row.changed_at ?? ""),
        }))
      );
      setLoadedKey(recordKey);
    } else {
      const message = errorMessage(legacy.error || modern.error);
      setRows([]);
      setLoadError(
        /does not exist|schema cache|could not find/i.test(message)
          ? "Run SQL/supabase_separate_inventory_catalog_and_assignment_history.sql to enable history."
          : message || "Unable to load assignment history."
      );
    }
    setLoading(false);
  }, [config, loadedKey, recordId, recordKey]);

  useEffect(() => {
    setLoadedKey("");
    setRows([]);
    setLoadError("");
  }, [currentValue, recordKey]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    void loadHistory();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [loadHistory, open, updatePosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <div
      ref={anchorRef}
      className="inline-flex max-w-full items-center gap-2"
      onMouseEnter={() => {
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (onCurrentValueClick) onCurrentValueClick();
          else setOpen((value) => !value);
        }}
        className="max-w-[240px] truncate rounded-full border border-amber-300 bg-[#fff9e6] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#FFDA03]"
        title={valueLabel}
      >
        {valueLabel}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          clearCloseTimer();
          setOpen((value) => !value);
        }}
        onFocus={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        aria-label={`View ${title}`}
      >
        <History className="h-3.5 w-3.5" />
        History
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[120] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-sm font-bold text-slate-900">{title}</div>
                <div className="mt-1 text-xs text-slate-500">{currentLabel}: {valueLabel}</div>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-3">
                {loading ? <div className="px-1 py-3 text-sm text-slate-500">Loading history...</div> : null}
                {!loading && loadError ? <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{loadError}</div> : null}
                {!loading && !loadError && rows.length === 0 ? (
                  <div className="px-1 py-3 text-sm text-slate-500">No assignment changes have been recorded yet.</div>
                ) : null}
                {!loading && !loadError && rows.length > 0 ? (
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div key={String(row.id)} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {row.changedAt ? new Date(row.changedAt).toLocaleString() : "Date unavailable"}
                        </div>
                        <div className="mt-1 whitespace-normal text-sm font-semibold text-slate-900">{historySummary(row)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
