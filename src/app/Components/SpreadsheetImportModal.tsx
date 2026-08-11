"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { readSpreadsheetRows } from "./spreadsheetImportUtils";
import { downloadBlob, downloadCsv } from "./fileDownload";

export type SpreadsheetImportModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  allowTemplateDownloads?: boolean;
  templateFileName?: string;
  templateSampleData?: Record<string, unknown>;
  onDownloadTemplateCsv?: () => void;
  onDownloadTemplateXlsx?: () => void;
  parseRow: (row: Record<string, unknown>, idx: number) => { payload: Record<string, unknown> | null; displayName: string; error?: string };
  onImport: (rows: Record<string, unknown>[]) => Promise<{ inserted: number; updated: number; skipped: number; errors: string[] }>;
  previewColumns?: string[];
};

type RowObject = Record<string, unknown>;

type PreviewItem = {
  idx: number;
  displayName: string;
  ok: boolean;
  error: string;
  payload: Record<string, unknown> | null;
};

export default function SpreadsheetImportModal({
  open,
  onClose,
  title,
  description,
  allowTemplateDownloads = true,
  templateFileName = "import_template",
  templateSampleData,
  onDownloadTemplateCsv,
  onDownloadTemplateXlsx,
  parseRow,
  onImport,
  previewColumns = ["Name"],
}: SpreadsheetImportModalProps) {
  const [mounted, setMounted] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<RowObject[]>([]);
  const [parsingError, setParsingError] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string>("");
  const [resultErrors, setResultErrors] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const canDownloadTemplate =
    allowTemplateDownloads &&
    (Boolean(onDownloadTemplateCsv) || Boolean(onDownloadTemplateXlsx) || Boolean(templateSampleData));

  function downloadTemplateCsvInternal() {
    if (onDownloadTemplateCsv) {
      onDownloadTemplateCsv();
      return;
    }
    if (!templateSampleData) return;
    const ws = XLSX.utils.json_to_sheet([templateSampleData]);
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadCsv(`${templateFileName}.csv`, csv);
  }

  function downloadTemplateXlsxInternal() {
    if (onDownloadTemplateXlsx) {
      onDownloadTemplateXlsx();
      return;
    }
    if (!templateSampleData) return;
    const ws = XLSX.utils.json_to_sheet([templateSampleData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(`${templateFileName}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  const preview = useMemo(() => {
    const converted: PreviewItem[] = rows.map((r, idx) => {
      const { payload, displayName, error } = parseRow(r, idx);
      return {
        idx: idx + 2, // header row assumed
        displayName: displayName || "—",
        ok: Boolean(payload),
        error: error ?? "",
        payload,
      };
    });

    return {
      total: rows.length,
      ok: converted.filter((x) => x.ok).length,
      bad: converted.filter((x) => !x.ok).length,
      head: converted.slice(0, 50),
      all: converted,
    };
  }, [rows, parseRow]);

  async function onPick(file?: File | null) {
    if (!file) return;
    setParsingError("");
    setResultMsg("");
    setResultErrors([]);
    setFileName(file.name);

    try {
      setRows(await readSpreadsheetRows(file));
    } catch (e: unknown) {
      setRows([]);
      setParsingError(e instanceof Error ? e.message : "Failed to parse file");
    }
  }

  async function importNow() {
    if (importing || preview.ok === 0) return;
    setImporting(true);
    setResultMsg("");
    setResultErrors([]);

    try {
      const result = await onImport(rows);
      const msg = `Imported ${result.inserted} • Updated ${result.updated} • Skipped ${result.skipped}.`;
      setResultMsg(msg);
      setResultErrors(result.errors);
    } catch (e: unknown) {
      setResultMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function clearTable() {
    setRows([]);
    setFileName("");
    setParsingError("");
    setResultMsg("");
    setResultErrors([]);
  }

  function handleClose() {
    clearTable();
    onClose();
  }

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl bg-white rounded-3xl border shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-black">{title}</div>
            <div className="text-xs text-gray-500 truncate">{description}</div>
          </div>
          <button onClick={handleClose} className="px-3 py-2 rounded-xl border bg-white text-black">
            Close
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-black">Excel or CSV file</div>
                <div className="text-xs text-gray-500">{fileName || "No file selected"}</div>
              </div>

              <div className="flex items-center gap-2">
                {canDownloadTemplate ? (
                  <>
                    <button
                      type="button"
                      onClick={downloadTemplateCsvInternal}
                      className="px-3 py-2 rounded-xl border bg-white text-black text-sm font-semibold"
                    >
                      Template CSV
                    </button>
                    <button
                      type="button"
                      onClick={downloadTemplateXlsxInternal}
                      className="px-3 py-2 rounded-xl border bg-white text-black text-sm font-semibold"
                    >
                      Template XLSX
                    </button>
                  </>
                ) : null}
                <label className="px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold cursor-pointer">
                  Choose File
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => onPick(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            {parsingError ? <div className="mt-3 text-sm text-red-600">{parsingError}</div> : null}
            {resultMsg ? (
              <div className={`mt-3 text-sm ${resultErrors.length ? "text-amber-700" : "text-green-700"}`}>
                {resultMsg}
              </div>
            ) : null}
            {resultErrors.length ? (
              <div className="mt-2 max-h-28 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {resultErrors.slice(0, 50).map((message, index) => (
                  <div key={`${index}-${message}`}>{message}</div>
                ))}
                {resultErrors.length > 50 ? <div>And {resultErrors.length - 50} more issue(s).</div> : null}
              </div>
            ) : null}

            <div className="mt-3 text-sm text-black">
              Duplicate-safe import is enabled: existing records are matched and updated, new records are inserted.
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-black">Preview</div>
                <div className="text-xs text-gray-500">
                  Total rows: {preview.total} • Ready: {preview.ok} • Skipped: {preview.bad}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={importing || rows.length === 0}
                  onClick={clearTable}
                  className={`px-4 py-2 rounded-xl border bg-white text-black font-semibold ${
                    importing || rows.length === 0 ? "opacity-60" : ""
                  }`}
                >
                  Clear Table
                </button>
                <button
                  type="button"
                  disabled={importing || preview.ok === 0}
                  onClick={importNow}
                  className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${
                    importing || preview.ok === 0 ? "opacity-60" : ""
                  }`}
                >
                  {importing ? "Importing…" : "Import"}
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <div className="max-h-[260px] overflow-y-auto rounded-xl border">
                <table className="w-full text-xs text-black">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-black border-b">
                      <th className="py-2 px-3">Row</th>
                      {previewColumns.map((col) => (
                        <th key={col} className="py-2 px-3">{col}</th>
                      ))}
                      <th className="py-2 px-3">OK</th>
                      <th className="py-2 px-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.head.map((r) => (
                      <tr key={r.idx} className="border-b last:border-b-0">
                        <td className="py-1.5 px-3 whitespace-nowrap">{r.idx}</td>
                        <td className="py-1.5 px-3">{r.displayName}</td>
                        <td className="py-1.5 px-3 whitespace-nowrap">{r.ok ? "Yes" : "No"}</td>
                        <td className="py-1.5 px-3 text-red-600">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Tip: Keep the template column names unchanged. Branded title rows are detected automatically.
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-2">
          <button onClick={handleClose} className="px-4 py-2 rounded-xl border bg-white text-black">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
