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
  custom_id?: string | null;
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

type LicensureUpsert = {
  applicant_id: string;
  security_license_number?: string | null;
  security_expiration?: string | null;
};

const TEMPLATE_HEADERS = [
  "Timestamp",
  "Last Name",
  "First Name",
  "Middle Name",
  "Date of Birth",
  "Age",
  "Gender",
  "Educational Attainment",
  "Date Hired in FSAI",
  "Security Licensed Number",
  "LESP Expired Date",
  "POSITION",
  "SSS Number",
  "Pag-Ibig Fund Number",
  "Philhealth Number",
  "TIN",
  "DETACHMENT",
  "Your Contact Number",
  "Your Email Address",
  "COMPLETE PRESENT ADDRESS (House # Street Barangay City)",
  "COMPLETE PROVINCE ADDRESS (House # Street Barangay City)",
  "Contact Person Incase of Emergency",
  "Contact Number",
  "STATUS",
] as const;

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsvLine(cells: (string | number | null | undefined)[]) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    const needs = /[\n\r,\"]/g.test(s);
    const out = s.replace(/\"/g, '""');
    return needs ? `"${out}"` : out;
  };
  return cells.map(esc).join(",");
}

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

function isRowEffectivelyEmpty(row: RowObject) {
  return Object.values(row).every((v) => !toText(v).trim());
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
  const rawKeys = Object.keys(row);
  const normalizedToRaw = new Map<string, string>();
  for (const rawKey of rawKeys) {
    const nk = normKey(rawKey);
    if (nk && !normalizedToRaw.has(nk)) normalizedToRaw.set(nk, rawKey);
  }

  // First pass: exact normalized header match.
  for (const k of keys) {
    const nk = normKey(k);
    const raw = normalizedToRaw.get(nk);
    if (raw != null) return row[raw];
  }

  // Second pass: loose match for near-misses (e.g. "securitylicense#" vs "securitylicensenumber").
  // Only accept if it matches exactly one header to avoid accidental mapping.
  const candidates = keys
    .map((k) => normKey(k))
    .filter((k) => k && k.length >= 4);
  if (!candidates.length) return undefined;

  for (const cand of candidates) {
    const matches: string[] = [];
    for (const [nk, raw] of normalizedToRaw.entries()) {
      if (nk === cand) continue;
      if (nk.includes(cand) || cand.includes(nk)) matches.push(raw);
      if (matches.length > 1) break;
    }
    if (matches.length === 1) return row[matches[0]];
  }

  return undefined;
}

function hasHeader(row: RowObject, header: string) {
  const target = normKey(header);
  return Object.keys(row).some((k) => normKey(k) === target);
}

function rowToApplicant(row: RowObject): { payload: ApplicantInsert | null; error?: string } {
  if (isRowEffectivelyEmpty(row)) {
    return { payload: null, error: "Empty row" };
  }

  // Keep imports tolerant: if required identity columns are missing, fill with N/A
  // so the record can still be inserted.
  const firstName =
    toText(pick(row, ["first_name", "first name", "firstname", "given name", "givenname"])).trim() || "N/A";
  const lastName =
    toText(pick(row, ["last_name", "last name", "lastname", "surname", "family name", "familyname"])).trim() ||
    "N/A";

  // Disambiguate "Contact Number": if the sheet has "Your Contact Number",
  // assume plain "Contact Number" belongs to the emergency contact section.
  const hasYourContactHeader =
    hasHeader(row, "Your Contact Number") ||
    hasHeader(row, "Your Contact Number ") ||
    hasHeader(row, "Your Contact No") ||
    hasHeader(row, "Your Contact No.");

  const payload: ApplicantInsert = {
    custom_id: toNullableText(
      pick(row, [
        "custom id",
        "custom_id",
        "employee number",
        "employee_number",
        "employee id",
        "employee_id",
        "personnel id",
        "personnel_id",
        "id number",
        "id no",
        "id no.",
      ])
    ),
    first_name: firstName,
    middle_name: toNullableText(pick(row, ["middle_name", "middle name", "middlename"])),
    last_name: lastName,
    extn_name: toNullableText(pick(row, ["extn_name", "extn", "suffix"])),

    gender: toNullableText(pick(row, ["gender", "sex"])),
    birth_date: toDateYmd(pick(row, ["birth_date", "birthdate", "date of birth", "dob"])),
    age: toNullableInt(pick(row, ["age"])),

    client_contact_num: toNullableText(
      pick(row, [
        "client_contact_num",
        "your contact number",
        "your contact no",
        "your contact no.",
        "contact",
        "phone",
        "phone number",
        "mobile",
        "mobile number",
        "contact no",
        "contact no.",
        // Keep "contact number" last to reduce ambiguity with emergency contact.
        ...(hasYourContactHeader ? [] : ["contact number"]),
      ])
    ),
    client_email: toNullableText(
      pick(row, [
        "client_email",
        "your email address",
        "email address",
        "email",
        "e-mail",
        "email add",
      ])
    ),

    present_address: toNullableText(
      pick(row, [
        "present_address",
        "present address",
        "complete present address (house # street barangay city)",
        "complete present address",
        "address",
      ])
    ),
    province_address: toNullableText(
      pick(row, [
        "province_address",
        "province address",
        "complete province address (house # street barangay city)",
        "complete province address",
      ])
    ),

    emergency_contact_person: toNullableText(
      pick(row, [
        "emergency_contact_person",
        "emergency contact person",
        "contact person incase of emergency",
        "contact person in case of emergency",
      ])
    ),
    emergency_contact_num: toNullableText(
      pick(row, [
        "emergency_contact_num",
        "emergency contact num",
        "emergency contact number",
        "contact number incase of emergency",
        "contact number in case of emergency",
        ...(hasYourContactHeader ? ["contact number"] : []),
      ])
    ),

    education_attainment: toNullableText(
      pick(row, [
        "education_attainment",
        "education",
        "educational attainment",
        "education level",
        "highest education",
      ])
    ),
    date_hired_fsai: toDateYmd(
      pick(row, [
        "date_hired_fsai",
        "date hired",
        "date hired fsai",
        "date hired in fsai",
        "hire date",
        "join date",
        "start date",
      ])
    ),

    client_position: toNullableText(
      pick(row, ["client_position", "position", "job title", "designation", "role"])
    ),
    detachment: toNullableText(
      pick(row, ["detachment", "deployment", "assignment", "post", "site", "location"])
    ),
    status: normalizeStatus(pick(row, ["status"])),

    security_licensed_num: toNullableText(
      pick(row, [
        "security_licensed_num",
        "security licensed num",
        "security licensed number",
        "security licensed number ",
        "security license no",
        "security license no.",
        "security license #",
        "security license number",
        "security license",
        "lesp no",
        "lesp number",
      ])
    ),
    sss_number: toNullableText(pick(row, ["sss_number", "sss number", "sss no", "sss"])),
    pagibig_number: toNullableText(pick(row, ["pagibig_number", "pag ibig fund number", "pag ibig", "pagibig"])),
    philhealth_number: toNullableText(pick(row, ["philhealth_number", "philhealth number", "philhealth", "phil health"])),
    tin_number: toNullableText(pick(row, ["tin_number", "tin", "tin "])),
  };

  return { payload };
}

function rowToLicensure(row: RowObject) {
  const securityLicenseNumber = toNullableText(
    pick(row, [
      "security licensed number",
      "security licensed num",
      "security license number",
      "security license no",
      "security license no.",
      "security license #",
      "security license",
      "security_licensed_num",
      "security_licensed_number",
      "lesp no",
      "lesp number",
    ])
  );

  const securityExpiration = toDateYmd(
    pick(row, [
      "lesp expired date",
      "lesp expiry date",
      "lesp expiration",
      "lesp expiration date",
      "lesp expiry",
      "lesp expiration dt",
      "license expiration",
      "license expiry",
      "expiry date",
      "expiration date",
      "security expiration",
      "security expiry date",
      "security expired date",
    ])
  );

  return {
    security_license_number: securityLicenseNumber,
    security_expiration: securityExpiration,
  } as Omit<LicensureUpsert, "applicant_id">;
}

export default function EmployeeExcelImportModal({ open, onClose, onImported }: EmployeeExcelImportModalProps) {
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<RowObject[]>([]);
  const [parsingError, setParsingError] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string>("");
  const [overwriteExisting, setOverwriteExisting] = useState(true);

  function normalizeMatchKey(v: unknown) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function updatePayloadFromApplicantInsert(payload: ApplicantInsert) {
    // For overwrites, avoid wiping existing DB values when the sheet has blanks.
    // Only update fields that have a non-empty value.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v == null) continue;
      if (typeof v === "string" && !v.trim()) continue;
      // The importer uses "N/A" when identity columns are missing. Don't overwrite DB with that.
      if ((k === "first_name" || k === "last_name") && String(v).trim().toUpperCase() === "N/A") continue;
      out[k] = v;
    }
    return out;
  }

  function downloadCsvTemplate() {
    const lines = [toCsvLine([...TEMPLATE_HEADERS]), toCsvLine(new Array(TEMPLATE_HEADERS.length).fill(""))];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob("employee_import_template.csv", blob);
  }

  function downloadXlsxTemplate() {
    const aoa = [[...TEMPLATE_HEADERS], new Array(TEMPLATE_HEADERS.length).fill("")];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob("employee_import_template.xlsx", blob);
  }

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
      head: converted.slice(0, 50),
    };
  }, [rows]);

  async function onPick(file?: File | null) {
    if (!file) return;
    setParsingError("");
    setResultMsg("");
    setFileName(file.name);

    try {
      const lower = file.name.toLowerCase();
      const isCsv = lower.endsWith(".csv") || file.type === "text/csv";

      const wb = isCsv
        ? XLSX.read(await file.text(), { type: "string", cellDates: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("No sheets found in Excel file");
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<RowObject>(sheet, {
        defval: "",
        // Use formatted cell text where possible to preserve values like IDs that
        // Excel may otherwise parse as numbers (and display in scientific notation).
        raw: false,
      });
      setRows(json);
    } catch (e: unknown) {
      setRows([]);
      setParsingError(e instanceof Error ? e.message : "Failed to parse file");
    }
  }

  async function importNow() {
    setImporting(true);
    setResultMsg("");

    const errors: string[] = [];
    const prepared: { applicant: ApplicantInsert; licensure: Omit<LicensureUpsert, "applicant_id"> }[] = [];

    rows.forEach((r, i) => {
      const { payload, error } = rowToApplicant(r);
      if (!payload) {
        errors.push(`Row ${i + 2}: ${error || "Invalid row"}`);
        return;
      }
		prepared.push({ applicant: payload, licensure: rowToLicensure(r) });
    });

    let inserted = 0;
    let updated = 0;
    try {
      const chunkSize = 100;
      for (let i = 0; i < prepared.length; i += chunkSize) {
        const slice = prepared.slice(i, i + chunkSize);

        // If overwrite is enabled, try to match existing applicants in this batch.
        const secNums = overwriteExisting
          ? Array.from(
              new Set(
                slice
                  .map((x) => normalizeMatchKey(x.applicant.security_licensed_num))
                  .filter(Boolean)
              )
            )
          : [];
        const emails = overwriteExisting
          ? Array.from(
              new Set(
                slice
                  .map((x) => normalizeMatchKey(x.applicant.client_email))
                  .filter(Boolean)
              )
            )
          : [];

        const existingBySec = new Map<string, string>();
        const existingByEmail = new Map<string, string>();
        if (overwriteExisting && (secNums.length || emails.length)) {
          if (secNums.length) {
            const ex = await supabase
              .from("applicants")
              .select("applicant_id, security_licensed_num")
              .in("security_licensed_num", secNums);
            if (!ex.error) {
              for (const r of (ex.data as any[]) ?? []) {
                const k = normalizeMatchKey(r?.security_licensed_num);
                const id = String(r?.applicant_id ?? "").trim();
                if (k && id) existingBySec.set(k, id);
              }
            }
          }
          if (emails.length) {
            const ex = await supabase
              .from("applicants")
              .select("applicant_id, client_email")
              .in("client_email", emails);
            if (!ex.error) {
              for (const r of (ex.data as any[]) ?? []) {
                const k = normalizeMatchKey(r?.client_email);
                const id = String(r?.applicant_id ?? "").trim();
                if (k && id) existingByEmail.set(k, id);
              }
            }
          }
        }

        const toInsert: ApplicantInsert[] = [];
        const toInsertIdx: number[] = [];
        const licRows: LicensureUpsert[] = [];

        for (let j = 0; j < slice.length; j++) {
          const item = slice[j];
          const secKey = normalizeMatchKey(item.applicant.security_licensed_num);
          const emailKey = normalizeMatchKey(item.applicant.client_email);
          const existingId = overwriteExisting
            ? (secKey && existingBySec.get(secKey)) || (emailKey && existingByEmail.get(emailKey)) || null
            : null;

          if (existingId) {
            const updPayload = updatePayloadFromApplicantInsert(item.applicant);
            if (Object.keys(updPayload).length) {
              const updRes = await supabase.from("applicants").update(updPayload).eq("applicant_id", existingId);
              if (updRes.error) {
                errors.push(`Row ${i + j + 2}: Update failed: ${updRes.error.message}`);
                continue;
              }
            }
            updated += 1;

            const lic = item.licensure;
            const hasAny = Boolean(lic?.security_license_number || lic?.security_expiration);
            if (hasAny) licRows.push({ applicant_id: existingId, ...lic });
          } else {
            toInsert.push(item.applicant);
            toInsertIdx.push(j);
          }
        }

        if (toInsert.length) {
          const insRes = await supabase.from("applicants").insert(toInsert).select("applicant_id");
          if (insRes.error) {
            errors.push(`Insert failed at batch starting row ${i + 2}: ${insRes.error.message}`);
            break;
          }

          const insertedRows = ((insRes.data as unknown) as { applicant_id: string }[]) ?? [];
          inserted += insertedRows.length;

          // Best-effort licensure upsert (security license number + expiry)
          for (let k = 0; k < insertedRows.length; k++) {
            const applicant_id = String(insertedRows[k]?.applicant_id || "").trim();
            if (!applicant_id) continue;
            const sliceIndex = toInsertIdx[k];
            const lic = slice[sliceIndex]?.licensure;
            const hasAny = Boolean(lic?.security_license_number || lic?.security_expiration);
            if (!hasAny) continue;
            licRows.push({ applicant_id, ...lic });
          }
        }

        if (licRows.length) {
          const licRes = await supabase.from("licensure").upsert(licRows);
          if (licRes.error) {
            errors.push(`Licensure upsert failed for batch starting row ${i + 2}: ${licRes.error.message}`);
          }
        }
      }
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : "Import failed");
    } finally {
      const processed = inserted + updated;
      const skipped = Math.max(0, rows.length - processed);
      const msg = overwriteExisting
        ? `Imported ${inserted} • Updated ${updated} • Skipped ${skipped}.`
        : `Imported ${inserted} • Skipped ${skipped}.`;
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
            <div className="text-lg font-semibold text-black">Import Employees (Excel/CSV)</div>
            <div className="text-xs text-gray-500 truncate">
              Upload an Excel (.xlsx/.xls) or CSV (.csv) file with headers like Last Name, First Name, Status, etc.
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
                <div className="text-sm font-semibold text-black">Excel/CSV file</div>
                <div className="text-xs text-gray-500">{fileName || "No file selected"}</div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={downloadCsvTemplate}
                    className="px-3 py-2 rounded-xl border bg-white text-black text-sm font-semibold"
                  >
                    Template CSV
                  </button>
                  <button
                    type="button"
                    onClick={downloadXlsxTemplate}
                    className="px-3 py-2 rounded-xl border bg-white text-black text-sm font-semibold"
                  >
                    Template XLSX
                  </button>
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
            </div>

            {parsingError ? <div className="mt-3 text-sm text-red-600">{parsingError}</div> : null}
            {resultMsg ? <div className="mt-3 text-sm text-green-700">{resultMsg}</div> : null}

            <div className="mt-3 flex items-center gap-2 text-sm text-black">
              <input
                id="overwriteExisting"
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
              />
              <label htmlFor="overwriteExisting" className="select-none">
                Overwrite existing employees (match by Security Licensed Number or Email)
              </label>
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
              <div className="max-h-[260px] overflow-y-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-2 px-3">Row</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">OK</th>
                      <th className="py-2 px-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.head.map((r) => (
                      <tr key={r.idx} className="border-b last:border-b-0">
                        <td className="py-1.5 px-3 whitespace-nowrap">{r.idx}</td>
                        <td className="py-1.5 px-3">{r.name}</td>
                        <td className="py-1.5 px-3 whitespace-nowrap">{r.status}</td>
                        <td className="py-1.5 px-3 whitespace-nowrap">{r.ok ? "Yes" : "No"}</td>
                        <td className="py-1.5 px-3 text-red-600">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
