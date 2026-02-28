"use client";

export type ImportSummaryData = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type ImportSummaryModalProps = {
  open: boolean;
  title?: string;
  summary: ImportSummaryData | null;
  onClose: () => void;
};

export default function ImportSummaryModal({
  open,
  title = "Import Summary",
  summary,
  onClose,
}: ImportSummaryModalProps) {
  if (!open || !summary) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
          <div className="text-base font-semibold text-black">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border text-sm text-black hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl border bg-emerald-50 px-3 py-2">
              <div className="text-xs text-emerald-700">Inserted</div>
              <div className="text-base font-semibold text-emerald-800">{summary.inserted}</div>
            </div>
            <div className="rounded-xl border bg-blue-50 px-3 py-2">
              <div className="text-xs text-blue-700">Updated</div>
              <div className="text-base font-semibold text-blue-800">{summary.updated}</div>
            </div>
            <div className="rounded-xl border bg-amber-50 px-3 py-2">
              <div className="text-xs text-amber-700">Skipped</div>
              <div className="text-base font-semibold text-amber-800">{summary.skipped}</div>
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-sm font-medium text-black">Row-level errors</div>
            {summary.errors.length ? (
              <div className="mt-2 max-h-52 overflow-auto space-y-1 text-xs text-red-700">
                {summary.errors.map((err, idx) => (
                  <div key={`${idx}-${err.slice(0, 30)}`}>{err}</div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No row-level errors.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
