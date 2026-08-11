"use client";

import type jsPDF from "jspdf";

const DOWNLOAD_URL_LIFETIME_MS = 60_000;

function safeFileName(fileName: string) {
  const cleaned = String(fileName ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();
  return cleaned || "download";
}

/**
 * Uses the same object-URL flow in browsers and Electron. Delayed cleanup is
 * important because immediate URL revocation can cancel larger downloads.
 */
export function downloadBlob(fileName: string, blob: Blob) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Downloads are only available after the page has loaded.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFileName(fileName);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}

export function downloadPdf(doc: jsPDF, fileName: string) {
  downloadBlob(fileName, doc.output("blob"));
}

export function downloadCsv(fileName: string, csv: string) {
  downloadBlob(fileName, new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
}
