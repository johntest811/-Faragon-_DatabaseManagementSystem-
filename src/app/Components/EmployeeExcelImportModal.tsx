"use client";

import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../Client/SupabaseClients";

export type EmployeeExcelImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported?: (result: { inserted: number; skipped: number; errors: string[] }) => void;
};

type RowObject = Record<string, unknown>;

type ApplicantInsert = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  extn_name?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  age?: number | null;
  client_contact_num?: string | null;
  client_email?: string | null;
  present_address?: string | null;
  province_address?: string | null;
  emergency_contact_person?: string | null;
  emergency_contact_num?: string | null;
  education_attainment?: string | null;
  date_hired_fsai?: string | null;
  client_position?: string | null;
  detachment?: string | null;
  status?: string | null;
  security_licensed_num?: string | null;
  sss_number?: string | null;
  pagibig_number?: string | null;
  philhealth_number?: string | null;
  tin_number?: string | null;
};

function normKey(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s/g, "");
}

function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toNullableText(v: unknown): string | null {
  const s = toText(v).trim();
  return s ? s : null;
}

function normalizeStatus(value: unknown) {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "INACTIVE") return "INACTIVE";
  if (v === "REASSIGN") return "REASSIGN";
  if (v === "RETIRED") return "RETIRED";
  if (v === "ACTIVE") return "ACTIVE";
  return "ACTIVE";
}

function excelNumberToYmd(n: number): string | null {
  try {
    const parsed = XLSX.SSF.parse_date_code(n);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
    const yyyy = String(parsed.y).padStart(4, "0");
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return null;
  }
}

function toDateYmd(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return excelNumberToYmd(v);

  const s = String(v).trim();
  if (!s) return null;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  // Accept yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return null;
}

function toNullableInt(v: unknown): number | null {
  const s = toText(v).trim();
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function pick(row: RowObject, keys: string[]): unknown {
  for (const k of keys) {
    const nk = normKey(k);
    for (const rawKey of Object.keys(row)) {
      if (normKey(rawKey) === nk) return row[rawKey];
    }
  }
  return undefined;
}

function rowToApplicant(row: RowObject): { payload: ApplicantInsert | null; error?: string } {
  const firstName = toNullableText(pick(row, ["first_name", "first name", "firstname"]));
  const lastName = toNullableText(pick(row, ["last_name", "last name", "lastname"]));

  if (!firstName || !lastName) {
    return { payload: null, error: "Missing first_name/last_name" };
  }

  const payload: ApplicantInsert = {
    first_name: firstName,
    middle_name: toNullableText(pick(row, ["middle_name", "middle name", "middlename"])),
    last_name: lastName,
    extn_name: toNullableText(pick(row, ["extn_name", "extn", "suffix"])),

    gender: toNullableText(pick(row, ["gender", "sex"])),
    birth_date: toDateYmd(pick(row, ["birth_date", "birthdate", "date of birth", "dob"])),
    age: toNullableInt(pick(row, ["age"])),

    client_contact_num: toNullableText(pick(row, ["client_contact_num", "contact", "contact number", "phone"])),
    client_email: toNullableText(pick(row, ["client_email", "email"])),

    present_address: toNullableText(pick(row, ["present_address", "present address", "address"])),
    province_address: toNullableText(pick(row, ["province_address", "province address"])),

    emergency_contact_person: toNullableText(pick(row, ["emergency_contact_person", "emergency contact person"])),
    emergency_contact_num: toNullableText(pick(row, ["emergency_contact_num", "emergency contact num", "emergency contact number"])),

    education_attainment: toNullableText(pick(row, ["education_attainment", "education", "educational attainment"])),
    date_hired_fsai: toDateYmd(pick(row, ["date_hired_fsai", "date hired", "date hired fsai"])),

    client_position: toNullableText(pick(row, ["client_position", "position"])),
    detachment: toNullableText(pick(row, ["detachment"])),
    status: normalizeStatus(pick(row, ["status"])),

    security_licensed_num: toNullableText(pick(row, ["security_licensed_num", "security licensed num", "security licensed number"])),
    sss_number: toNullableText(pick(row, ["sss_number", "sss no", "sss"])),
    pagibig_number: toNullableText(pick(row, ["pagibig_number", "pag ibig", "pagibig"])),
    philhealth_number: toNullableText(pick(row, ["philhealth_number", "philhealth", "phil health"])),
    tin_number: toNullableText(pick(row, ["tin_number", "tin"])),
  };

  return { payload };
}

export default function EmployeeExcelImportModal({ open, onClose, onImported }: EmployeeExcelImportModalProps) {
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<RowObject[]>([]);
  const [parsingError, setParsingError] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string>("");

  const preview = useMemo(() => {
    const converted = rows.map((r, idx) => {
      const { payload, error } = rowToApplicant(r);
      return {
        idx: idx + 2, // header row assumed
        name: payload ? `${payload.first_name ?? ""} ${payload.last_name ?? ""}`.trim() : "—",
        status: payload?.status ?? "—",
        ok: Boolean(payload),
        error: error ?? "",
      };
    });

    return {
      total: rows.length,
      ok: converted.filter((x) => x.ok).length,
      bad: converted.filter((x) => !x.ok).length,
      head: converted.slice(0, 10),
    };
  }, [rows]);

  async function onPick(file?: File | null) {
    if (!file) return;
    setParsingError("");
    setResultMsg("");
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("No sheets found in Excel file");
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<RowObject>(sheet, { defval: "" });
      setRows(json);
    } catch (e: unknown) {
      setRows([]);
      setParsingError(e instanceof Error ? e.message : "Failed to parse Excel file");
    }
  }

  async function importNow() {
    setImporting(true);
    setResultMsg("");

    const errors: string[] = [];
    const payloads: ApplicantInsert[] = [];

    rows.forEach((r, i) => {
      const { payload, error } = rowToApplicant(r);
      if (!payload) {
        errors.push(`Row ${i + 2}: ${error || "Invalid row"}`);
        return;
      }
      payloads.push(payload);
    });

    let inserted = 0;
    try {
      const chunkSize = 100;
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const chunk = payloads.slice(i, i + chunkSize);
        const res = await supabase.from("applicants").insert(chunk);
        if (res.error) {
          errors.push(`Insert failed at batch starting row ${i + 2}: ${res.error.message}`);
          break;
        }
        inserted += chunk.length;
      }
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : "Import failed");
    } finally {
      const skipped = rows.length - inserted;
      const msg = `Imported ${inserted} employee(s). Skipped ${skipped}.`;
      setResultMsg(msg);
      onImported?.({ inserted, skipped, errors });
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl bg-white rounded-3xl border shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-black">Import Employees (Excel)</div>
            <div className="text-xs text-gray-500 truncate">
              Upload an Excel file (.xlsx/.xls) with headers like First Name, Last Name, Status, etc.
            </div>
          </div>
          <button onClick={onClose} className="px-3 py-2 rounded-xl border bg-white text-black">
            Close
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-black">Excel file</div>
                <div className="text-xs text-gray-500">{fileName || "No file selected"}</div>
              </div>

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

            {parsingError ? <div className="mt-3 text-sm text-red-600">{parsingError}</div> : null}
            {resultMsg ? <div className="mt-3 text-sm text-green-700">{resultMsg}</div> : null}
          </div>

          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-black">Preview</div>
                <div className="text-xs text-gray-500">
                  Total rows: {preview.total} • Ready: {preview.ok} • Skipped: {preview.bad}
                </div>
              </div>

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

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-3">Row</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">OK</th>
                    <th className="py-2 pr-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.head.map((r) => (
                    <tr key={r.idx} className="border-t">
                      <td className="py-2 pr-3">{r.idx}</td>
                      <td className="py-2 pr-3">{r.name}</td>
                      <td className="py-2 pr-3">{r.status}</td>
                      <td className="py-2 pr-3">{r.ok ? "Yes" : "No"}</td>
                      <td className="py-2 pr-3 text-red-600">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Tip: Make sure the first row contains headers. Required headers: First Name and Last Name.
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-black">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
