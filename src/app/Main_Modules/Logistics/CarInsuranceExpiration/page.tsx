"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, PencilLine, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/app/Client/SupabaseClients";
import { useMyColumnAccess, useMyModuleAccess, useMyModuleDeleteAccess, useMyModuleEditAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import SpreadsheetImportModal from "@/app/Components/SpreadsheetImportModal";
import { addBrandedPdfHeader, buildBrandedAoa, buildBrandedWorkbookBuffer } from "../../Components/exportBranding";
import * as XLSX from "xlsx";

type CarInsuranceRow = {
  id: number;
  item_name: string;
  expiration_type: string;
  record_no: number | null;
  patrol: string | null;
  post_distributions: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  plate_number: string | null;
  insurance_company: string | null;
  policy_from_date: string | null;
  expires_on: string;
  days_before_expiry: number | null;
  recipient_email: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type CarInsuranceForm = {
  recordNo: string;
  patrol: string;
  postDistributions: string;
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  insuranceCompany: string;
  policyFromDate: string;
  policyToDate: string;
  daysBeforeExpiry: string;
  remarks: string;
};

type CarInsuranceImportRow = {
  recordNo: string;
  patrol: string;
  postDistributions: string;
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  insuranceCompany: string;
  policyFromDate: string;
  policyToDate: string;
  daysBeforeExpiry: string;
  remarks: string;
};

type FormField = {
  key: keyof CarInsuranceForm;
  label: string;
  columnKey: string;
  type: "text" | "number" | "date" | "textarea";
  placeholder?: string;
  min?: number;
  max?: number;
  spanClassName?: string;
};

const MODULE_KEY = "car_insurance_expiration";
const EXPIRATION_TYPE = "CAR_INSURANCE";
const PAGE_TITLE = "Car Insurance Expiration";

const IMPORT_TEMPLATE_SAMPLE: CarInsuranceImportRow = {
  recordNo: "1",
  patrol: "Patrol Alpha",
  postDistributions: "North Sector",
  make: "Toyota",
  model: "Hilux",
  color: "White",
  plateNumber: "ABC-1234",
  insuranceCompany: "Faragon Insurance Co.",
  policyFromDate: "2026-01-01",
  policyToDate: "2026-12-31",
  daysBeforeExpiry: "30",
  remarks: "Sample row for the import template",
};

const FORM_FIELDS: FormField[] = [
  { key: "recordNo", label: "No.", columnKey: "record_no", type: "number", placeholder: "1", min: 1 },
  { key: "patrol", label: "Patrol", columnKey: "patrol", type: "text", placeholder: "Patrol unit" },
  { key: "postDistributions", label: "Post/s Distributions", columnKey: "post_distributions", type: "text", placeholder: "Post assignment" },
  { key: "make", label: "Make", columnKey: "make", type: "text", placeholder: "Vehicle make" },
  { key: "model", label: "Model", columnKey: "model", type: "text", placeholder: "Vehicle model" },
  { key: "color", label: "Color", columnKey: "color", type: "text", placeholder: "Vehicle color" },
  { key: "plateNumber", label: "Plate Number", columnKey: "plate_number", type: "text", placeholder: "ABC-1234" },
  { key: "insuranceCompany", label: "Insurance Company", columnKey: "insurance_company", type: "text", placeholder: "Insurance provider" },
  { key: "policyFromDate", label: "Policy From Date", columnKey: "policy_from_date", type: "date" },
  { key: "policyToDate", label: "Policy To Date Expiration", columnKey: "expires_on", type: "date" },
  { key: "daysBeforeExpiry", label: "Days Before Expiry", columnKey: "days_before_expiry", type: "number", placeholder: "30", min: 1, max: 365 },
  {
    key: "remarks",
    label: "Remarks",
    columnKey: "notes",
    type: "textarea",
    placeholder: "Optional remarks",
    spanClassName: "md:col-span-2 xl:col-span-3",
  },
];

function emptyForm(recordNo = ""): CarInsuranceForm {
  return {
    recordNo,
    patrol: "",
    postDistributions: "",
    make: "",
    model: "",
    color: "",
    plateNumber: "",
    insuranceCompany: "",
    policyFromDate: "",
    policyToDate: "",
    daysBeforeExpiry: "30",
    remarks: "",
  };
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: string | null) {
  const raw = cleanText(value);
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString();
}

function daysUntil(value: string | null) {
  const raw = cleanText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.round((parsed.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function formatDueLabel(days: number | null) {
  if (days === null) return "Review pending";
  if (days < 0) {
    const abs = Math.abs(days);
    return `Expired ${abs} day${abs === 1 ? "" : "s"} ago`;
  }
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

function dueClass(days: number | null) {
  if (days === null) return "text-gray-500";
  if (days < 0) return "text-red-700";
  if (days <= 7) return "text-amber-700";
  return "text-emerald-700";
}

function buildItemName(form: CarInsuranceForm) {
  const parts = [
    form.recordNo ? `No. ${cleanText(form.recordNo)}` : "Car Insurance",
    cleanText(form.plateNumber),
    [cleanText(form.make), cleanText(form.model)].filter(Boolean).join(" "),
  ].filter(Boolean);
  return parts.join(" • ") || "Car Insurance";
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickByAliases(row: Record<string, unknown>, aliases: string[]) {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) map.set(normalizeHeader(key), value);
  for (const alias of aliases) {
    const value = map.get(normalizeHeader(alias));
    if (value !== undefined && String(value ?? "").trim() !== "") return String(value);
  }
  return "";
}

function toNullableText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean.length ? clean : null;
}

function toNumberOrNull(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateValue(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return clean;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildExportRows(rows: CarInsuranceRow[]) {
  return rows.map((row) => ({
    "No.": row.record_no ?? "",
    Patrol: row.patrol ?? "",
    "Post/s Distributions": row.post_distributions ?? "",
    Make: row.make ?? "",
    Model: row.model ?? "",
    Color: row.color ?? "",
    "Plate Number": row.plate_number ?? "",
    "Insurance Company": row.insurance_company ?? "",
    "Policy From Date": row.policy_from_date ?? "",
    "Policy To Date Expiration": row.expires_on ?? "",
    "Days Before Expiry": row.days_before_expiry ?? "",
    Remarks: row.notes ?? "",
  }));
}

function parseSpreadsheetRow(row: Record<string, unknown>, idx: number) {
  const recordNo = toNumberOrNull(pickByAliases(row, ["record_no", "no", "record number", "number"]));
  const patrol = toNullableText(pickByAliases(row, ["patrol"]));
  const postDistributions = toNullableText(pickByAliases(row, ["post_distributions", "post distributions", "post/s distributions", "post"]));
  const make = toNullableText(pickByAliases(row, ["make"]));
  const model = toNullableText(pickByAliases(row, ["model"]));
  const color = toNullableText(pickByAliases(row, ["color"]));
  const plateNumber = toNullableText(pickByAliases(row, ["plate_number", "plate number", "plate"]));
  const insuranceCompany = toNullableText(pickByAliases(row, ["insurance_company", "insurance company", "insurer"]));
  const policyFromDate = normalizeDateValue(pickByAliases(row, ["policy_from_date", "policy from date", "from date"]));
  const policyToDate = normalizeDateValue(pickByAliases(row, ["expires_on", "policy to date expiration", "policy to date", "expiry date", "expiration date"]));
  const daysBeforeExpiry = toNumberOrNull(pickByAliases(row, ["days_before_expiry", "days before expiry", "days before expiration", "lead days"]));
  const remarks = toNullableText(pickByAliases(row, ["notes", "remarks", "remark"]));

  if (!plateNumber) {
    return {
      payload: null,
      displayName: `Row ${idx + 2}`,
      error: "Plate Number is required for import.",
    };
  }

  if (!patrol || !postDistributions || !make || !model || !color || !insuranceCompany || !policyFromDate || !policyToDate || !Number.isFinite(daysBeforeExpiry ?? Number.NaN)) {
    return {
      payload: null,
      displayName: `Row ${idx + 2}`,
      error: "Missing required car insurance fields.",
    };
  }

  const displayForm = {
    recordNo: recordNo ? String(recordNo) : "",
    patrol,
    postDistributions,
    make,
    model,
    color,
    plateNumber,
    insuranceCompany,
    policyFromDate,
    policyToDate,
    daysBeforeExpiry: String(daysBeforeExpiry ?? ""),
    remarks: remarks ?? "",
  } satisfies CarInsuranceForm;

  return {
    payload: {
      recordNo,
      patrol,
      postDistributions,
      make,
      model,
      color,
      plateNumber,
      insuranceCompany,
      policyFromDate,
      policyToDate,
      daysBeforeExpiry,
      remarks,
    },
    displayName: buildItemName(displayForm),
  };
}

function getNextRecordNo(rows: CarInsuranceRow[]) {
  const numbers = rows.map((row) => Number(row.record_no)).filter((value) => Number.isFinite(value) && value > 0);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function buildSearchIndex(row: CarInsuranceRow) {
  return [
    row.record_no,
    row.patrol,
    row.post_distributions,
    row.make,
    row.model,
    row.color,
    row.plate_number,
    row.insurance_company,
    row.policy_from_date,
    row.expires_on,
    row.days_before_expiry,
    row.notes,
    row.item_name,
  ]
    .map((value) => cleanText(value))
    .join(" ")
    .toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && cleanText(error.message)) return error.message;
  if (typeof error === "string" && cleanText(error)) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = cleanText((error as { message?: unknown }).message);
    if (message) return message;
  }
  return fallback;
}

export default function CarInsuranceExpirationPage() {
  const router = useRouter();
  const { canAccess, loading: accessLoading, error: accessError } = useMyModuleAccess(MODULE_KEY);
  const { canEdit: canEditRecords, loading: editLoading, error: editError } = useMyModuleEditAccess(MODULE_KEY);
  const { canDelete: canDeleteRecords, loading: deleteLoading, error: deleteError } = useMyModuleDeleteAccess(MODULE_KEY);
  const { loading: columnLoading, error: columnError } = useMyColumnAccess(MODULE_KEY);

  const [rows, setRows] = useState<CarInsuranceRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CarInsuranceForm>(emptyForm());
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const nextRecordNo = useMemo(() => getNextRecordNo(rows), [rows]);

  const visibleTableFields = useMemo(() => FORM_FIELDS, []);

  useEffect(() => {
    if (editingId !== null) return;
    if (cleanText(form.recordNo)) return;
    setForm((current) => ({ ...current, recordNo: String(nextRecordNo) }));
  }, [editingId, form.recordNo, nextRecordNo]);

  useEffect(() => {
    if (!formOpen && !importOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [formOpen, importOpen]);

  async function loadRows(options?: { showSpinner?: boolean }) {
    const showSpinner = options?.showSpinner !== false;
    if (showSpinner) {
      setLoadingRows(true);
    }
    setError("");
    try {
      const res = await supabase
        .from("other_expiration_items")
        .select(
          "id, item_name, expiration_type, record_no, patrol, post_distributions, make, model, color, plate_number, insurance_company, policy_from_date, expires_on, days_before_expiry, recipient_email, notes, is_active, created_at, updated_at"
        )
        .eq("expiration_type", EXPIRATION_TYPE)
        .order("expires_on", { ascending: true })
        .limit(500);

      if (res.error) throw res.error;
      setRows((res.data as CarInsuranceRow[]) ?? []);
    } catch (e: unknown) {
      setRows([]);
      setError(getErrorMessage(e, "Failed to load car insurance records."));
    } finally {
      if (showSpinner) {
        setLoadingRows(false);
      }
    }
  }

  useEffect(() => {
    if (accessLoading) return;
    if (!canAccess) {
      setLoadingRows(false);
      return;
    }
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, canAccess]);

  const filteredRows = useMemo(() => {
    const query = cleanText(search).toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => buildSearchIndex(row).includes(query));
  }, [rows, search]);

  const stats = useMemo(() => {
    let dueSoon = 0;
    let overdue = 0;

    for (const row of rows) {
      const days = daysUntil(row.expires_on);
      const reminderDays = Number(row.days_before_expiry ?? 30);

      if (days === null) continue;
      if (days < 0) {
        overdue += 1;
      } else if (days <= reminderDays) {
        dueSoon += 1;
      }
    }

    return {
      total: rows.length,
      dueSoon,
      overdue,
      next: rows[0] ?? null,
    };
  }, [rows]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm(String(nextRecordNo)));
    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function startEdit(row: CarInsuranceRow) {
    setEditingId(row.id);
    setForm({
      recordNo: String(row.record_no ?? ""),
      patrol: row.patrol ?? "",
      postDistributions: row.post_distributions ?? "",
      make: row.make ?? "",
      model: row.model ?? "",
      color: row.color ?? "",
      plateNumber: row.plate_number ?? "",
      insuranceCompany: row.insurance_company ?? "",
      policyFromDate: row.policy_from_date ?? "",
      policyToDate: row.expires_on ?? "",
      daysBeforeExpiry: String(row.days_before_expiry ?? 30),
      remarks: row.notes ?? "",
    });
    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm(String(nextRecordNo)));
    setError("");
    setSuccess("");
    setFormOpen(false);
  }

  async function saveRecord() {
    if (!canEditRecords || saving) return;

    const recordNo = Number(form.recordNo);
    const reminderDays = Number(form.daysBeforeExpiry);
    const policyToDate = cleanText(form.policyToDate);
    const policyFromDate = cleanText(form.policyFromDate);
    const plateNumber = cleanText(form.plateNumber);

    if (!Number.isFinite(recordNo) || recordNo <= 0) {
      setError("No. is required and must be a positive number.");
      return;
    }
    if (!cleanText(form.patrol)) {
      setError("Patrol is required.");
      return;
    }
    if (!cleanText(form.postDistributions)) {
      setError("Post/s Distributions is required.");
      return;
    }
    if (!cleanText(form.make)) {
      setError("Make is required.");
      return;
    }
    if (!cleanText(form.model)) {
      setError("Model is required.");
      return;
    }
    if (!cleanText(form.color)) {
      setError("Color is required.");
      return;
    }
    if (!plateNumber) {
      setError("Plate Number is required.");
      return;
    }
    if (!cleanText(form.insuranceCompany)) {
      setError("Insurance Company is required.");
      return;
    }
    if (!policyFromDate) {
      setError("Policy From Date is required.");
      return;
    }
    if (!policyToDate) {
      setError("Policy To Date Expiration is required.");
      return;
    }
    if (!Number.isFinite(reminderDays) || reminderDays < 1 || reminderDays > 365) {
      setError("Days Before Expiry must be between 1 and 365.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const existing = editingId === null ? null : rows.find((row) => row.id === editingId) ?? null;
      const payload = {
        item_name: buildItemName(form),
        expiration_type: EXPIRATION_TYPE,
        record_no: Math.trunc(recordNo),
        patrol: cleanText(form.patrol),
        post_distributions: cleanText(form.postDistributions),
        make: cleanText(form.make),
        model: cleanText(form.model),
        color: cleanText(form.color),
        plate_number: plateNumber,
        insurance_company: cleanText(form.insuranceCompany),
        policy_from_date: policyFromDate,
        expires_on: policyToDate,
        days_before_expiry: Math.trunc(reminderDays),
        recipient_email: existing?.recipient_email ?? null,
        notes: cleanText(form.remarks) || null,
        is_active: existing?.is_active ?? true,
      };

      if (editingId === null) {
        const ins = await supabase.from("other_expiration_items").insert(payload);
        if (ins.error) throw ins.error;
        setSuccess("Car insurance record added.");
      } else {
        const upd = await supabase.from("other_expiration_items").update(payload).eq("id", editingId);
        if (upd.error) throw upd.error;
        setSuccess("Car insurance record updated.");
      }

      setEditingId(null);
      setForm(emptyForm(String(getNextRecordNo(rows))));
      await loadRows({ showSpinner: false });
      setFormOpen(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e, editingId === null ? "Failed to add car insurance record." : "Failed to update car insurance record."));
    } finally {
      setSaving(false);
    }
  }

  async function importRows(rawRows: Record<string, unknown>[]) {
    if (!canEditRecords) {
      throw new Error("You do not have permission to import car insurance records.");
    }

    const existingByRecordNo = new Map<number, CarInsuranceRow>();
    const existingByPlate = new Map<string, CarInsuranceRow>();

    for (const row of rows) {
      if (Number.isFinite(Number(row.record_no)) && Number(row.record_no) > 0) {
        existingByRecordNo.set(Number(row.record_no), row);
      }
      const plateKey = cleanText(row.plate_number).toLowerCase();
      if (plateKey) existingByPlate.set(plateKey, row);
    }

    const seenKeys = new Set<string>();
    let nextGeneratedRecordNo = getNextRecordNo(rows);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let index = 0; index < rawRows.length; index += 1) {
      const parsed = parseSpreadsheetRow(rawRows[index] ?? {}, index);
      if (!parsed.payload) {
        skipped += 1;
        if (parsed.error) errors.push(`Row ${index + 2}: ${parsed.error}`);
        continue;
      }

      const payload = parsed.payload;
      const plateKey = cleanText(payload.plateNumber).toLowerCase();
      const recordKey = payload.recordNo ? `record:${payload.recordNo}` : `plate:${plateKey}`;

      if (seenKeys.has(recordKey)) {
        skipped += 1;
        errors.push(`Row ${index + 2}: Duplicate row identity in the import file.`);
        continue;
      }

      seenKeys.add(recordKey);

      const existing = payload.recordNo ? existingByRecordNo.get(payload.recordNo) ?? null : existingByPlate.get(plateKey) ?? null;
      const recordNo = payload.recordNo ?? nextGeneratedRecordNo++;

      const dbPayload = {
        item_name: buildItemName({
          recordNo: String(recordNo),
          patrol: payload.patrol,
          postDistributions: payload.postDistributions,
          make: payload.make,
          model: payload.model,
          color: payload.color,
          plateNumber: payload.plateNumber,
          insuranceCompany: payload.insuranceCompany,
          policyFromDate: payload.policyFromDate,
          policyToDate: payload.policyToDate,
          daysBeforeExpiry: String(payload.daysBeforeExpiry),
          remarks: payload.remarks ?? "",
        }),
        expiration_type: EXPIRATION_TYPE,
        record_no: recordNo,
        patrol: payload.patrol,
        post_distributions: payload.postDistributions,
        make: payload.make,
        model: payload.model,
        color: payload.color,
        plate_number: payload.plateNumber,
        insurance_company: payload.insuranceCompany,
        policy_from_date: payload.policyFromDate,
        expires_on: payload.policyToDate,
        days_before_expiry: payload.daysBeforeExpiry,
        recipient_email: existing?.recipient_email ?? null,
        notes: payload.remarks ?? null,
        is_active: existing?.is_active ?? true,
      };

      if (existing) {
        const upd = await supabase.from("other_expiration_items").update(dbPayload).eq("id", existing.id);
        if (upd.error) throw upd.error;
        updated += 1;
        continue;
      }

      const ins = await supabase.from("other_expiration_items").insert(dbPayload);
      if (ins.error) throw ins.error;
      inserted += 1;
    }

    await loadRows({ showSpinner: false });
    return { inserted, updated, skipped, errors };
  }

  async function downloadExport(format: "xlsx" | "csv" | "pdf") {
    const exportRows = buildExportRows(rows);
    const brandedRows = buildBrandedAoa(exportRows, "Car Insurance Expiration Export", "Vehicle policy tracking");
    const worksheet = XLSX.utils.aoa_to_sheet(brandedRows);

    if (format === "xlsx") {
      const output = await buildBrandedWorkbookBuffer([
        {
          name: "CarInsurance",
          title: "Car Insurance Expiration Export",
          subtitle: "Vehicle policy tracking",
          rows: exportRows,
        },
      ]);
      downloadBlob("car_insurance_expiration.xlsx", new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      return;
    }

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const startY = await addBrandedPdfHeader(doc, "Car Insurance Expiration Export", "Vehicle policy tracking");
      const headers = Object.keys(exportRows[0] ?? {});
      const body = exportRows.map((row) => headers.map((key) => String(row[key as keyof typeof row] ?? "")));

      autoTable(doc, {
        startY: startY + 10,
        head: [headers],
        body,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
      });

      doc.save("car_insurance_expiration.pdf");
      return;
    }

    const csv = XLSX.utils.sheet_to_csv(worksheet);
    downloadBlob("car_insurance_expiration.csv", new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  async function deleteRecord(row: CarInsuranceRow) {
    if (!canDeleteRecords) return;
    const ok = window.confirm(`Delete car insurance record No. ${row.record_no ?? row.id}?`);
    if (!ok) return;

    try {
      const del = await supabase.from("other_expiration_items").delete().eq("id", row.id);
      if (del.error) throw del.error;
      if (editingId === row.id) clearForm();
      setSuccess("Car insurance record deleted.");
      await loadRows({ showSpinner: false });
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to delete car insurance record."));
    }
  }

  function renderTableValue(row: CarInsuranceRow, field: FormField) {
    switch (field.key) {
      case "recordNo":
        return row.record_no ?? "—";
      case "patrol":
        return row.patrol || "—";
      case "postDistributions":
        return row.post_distributions || "—";
      case "make":
        return row.make || "—";
      case "model":
        return row.model || "—";
      case "color":
        return row.color || "—";
      case "plateNumber":
        return row.plate_number || "—";
      case "insuranceCompany":
        return row.insurance_company || "—";
      case "policyFromDate":
        return formatDate(row.policy_from_date);
      case "policyToDate": {
        const remaining = daysUntil(row.expires_on);
        return (
          <div className="space-y-1">
            <div className="whitespace-nowrap text-black">{formatDate(row.expires_on)}</div>
            <div className={`text-xs font-medium ${dueClass(remaining)}`}>{formatDueLabel(remaining)}</div>
          </div>
        );
      }
      case "daysBeforeExpiry":
        return row.days_before_expiry ?? "—";
      case "remarks":
        return row.notes ? <span className="block max-w-[280px] whitespace-normal text-gray-700">{row.notes}</span> : "—";
      default:
        return "—";
    }
  }

  if (accessLoading || editLoading || deleteLoading || columnLoading || loadingRows) {
    return (
      <TableZoomWrapper storageKey="car-insurance-expiration" defaultZoom={0.9}>
        <section className="glass-panel animate-slide-up rounded-2xl shadow-2xl p-5 border-none">
          <LoadingCircle label={`Loading ${PAGE_TITLE.toLowerCase()}...`} />
        </section>
      </TableZoomWrapper>
    );
  }

  if (!canAccess) {
    return (
      <TableZoomWrapper storageKey="car-insurance-expiration" defaultZoom={0.9}>
        <section className="glass-panel animate-slide-up rounded-2xl shadow-2xl p-5 border-none space-y-4">
          <div>
            <div className="text-2xl font-semibold text-black">{PAGE_TITLE}</div>
            <div className="text-sm text-gray-500">You do not have access to this module.</div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Request access to view and manage car insurance expiration records.
          </div>

          {(accessError || editError || deleteError || columnError) ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {accessError || editError || deleteError || columnError}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => router.push(`/Main_Modules/Requests/?module=${encodeURIComponent(MODULE_KEY)}`)}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
          >
            Request access
          </button>
        </section>
      </TableZoomWrapper>
    );
  }

  const editable = canEditRecords && !saving;
  const formTitle = editingId === null ? "Add car insurance record" : "Edit car insurance record";
  const saveLabel = editingId === null ? "Add Record" : "Update Record";

  return (
    <TableZoomWrapper storageKey="car-insurance-expiration" defaultZoom={0.9}>
      <section className="glass-panel animate-slide-up rounded-2xl shadow-2xl p-5 space-y-6 border-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-black">{PAGE_TITLE}</div>
            <div className="mt-1 max-w-4xl text-sm text-gray-500">
              Track patrol vehicles, insurance providers, and policy expiration dates. Reminder emails use the shared Gmail
              sender and the Days Before Expiry value on each record.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadRows()}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            {!canEditRecords ? (
              <button
                type="button"
                onClick={() => router.push(`/Main_Modules/Requests/?module=${encodeURIComponent(MODULE_KEY)}`)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
              >
                Request edit access
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Total records</div>
            <div className="mt-1 text-2xl font-semibold text-black">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Due soon</div>
            <div className="mt-1 text-2xl font-semibold text-amber-700">{stats.dueSoon}</div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Overdue</div>
            <div className="mt-1 text-2xl font-semibold text-red-700">{stats.overdue}</div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Next expiration</div>
            <div className="mt-1 text-sm font-semibold text-black">
              {stats.next ? `${formatDate(stats.next.expires_on)} • No. ${stats.next.record_no ?? stats.next.id}` : "—"}
            </div>
          </div>
        </div>

        {(accessError || editError || deleteError || columnError) ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {accessError || editError || deleteError || columnError}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          The reminders for this page use the same Gmail delivery pipeline as the rest of the expiration system.
        </div>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-black">Record actions</div>
              <div className="text-sm text-gray-500">
                Open the popup to add or edit records, import spreadsheets with a template, or export the current table.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canEditRecords ? (
                <button
                  type="button"
                  onClick={startCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                >
                  <Plus className="h-4 w-4" />
                  Add record
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push(`/Main_Modules/Requests/?module=${encodeURIComponent(MODULE_KEY)}`)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                >
                  Request edit access
                </button>
              )}

              {canEditRecords ? (
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
                >
                  <Upload className="h-4 w-4" />
                  Import Excel
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void downloadExport("csv")}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => void downloadExport("xlsx")}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
              >
                <Download className="h-4 w-4" />
                Export XLSX
              </button>

              <button
                type="button"
                onClick={() => void downloadExport("pdf")}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
              >
                <FileText className="h-4 w-4" />
                Export PDF
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Reminder emails use the shared Gmail sender and the notification recipients configured in Settings.
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-black">Records</div>
              <div className="text-sm text-gray-500">Search, edit, and delete car insurance expiration entries.</div>
            </div>

            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patrol, plate number, make, model, or insurer"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="min-w-[1500px] w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#FFDA03]">
                  {visibleTableFields.map((field) => (
                    <th
                      key={field.label}
                      className="border-b border-[#E2C100] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black whitespace-nowrap"
                    >
                      {field.label}
                    </th>
                  ))}
                  {(canEditRecords || canDeleteRecords) ? (
                    <th className="border-b border-[#E2C100] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black whitespace-nowrap">
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>

              <tbody>
                {filteredRows.length ? (
                  filteredRows.map((row, index) => (
                    <tr
                      key={row.id}
                      role={canEditRecords ? "button" : undefined}
                      tabIndex={canEditRecords ? 0 : -1}
                      onKeyDown={(event) => {
                        if (!canEditRecords) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          startEdit(row);
                        }
                      }}
                      onClick={() => {
                        if (!canEditRecords) return;
                        startEdit(row);
                      }}
                      className={`${index % 2 === 0 ? "bg-white" : "bg-gray-50/60"} ${canEditRecords ? "cursor-pointer hover:bg-[#FFF7CC]" : ""}`}
                    >
                      {visibleTableFields.map((field) => (
                        <td key={`${row.id}:${field.key}`} className="border-b border-gray-100 px-3 py-3 align-top text-black whitespace-nowrap">
                          {renderTableValue(row, field)}
                        </td>
                      ))}
                      {(canEditRecords || canDeleteRecords) ? (
                        <td className="border-b border-gray-100 px-3 py-3 align-top whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {canEditRecords ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEdit(row);
                                }}
                                className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-medium text-black hover:bg-white"
                              >
                                <PencilLine className="h-3.5 w-3.5" />
                                Edit
                              </button>
                            ) : null}

                            {canDeleteRecords ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteRecord(row);
                                }}
                                className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={visibleTableFields.length + (canEditRecords || canDeleteRecords ? 1 : 0)}
                      className="px-3 py-10 text-center text-sm text-gray-500"
                    >
                      {search.trim()
                        ? "No car insurance records match your search."
                        : "No car insurance records found. Use the form above to add one."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {formOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={clearForm}>
            <div className="w-full max-w-5xl rounded-3xl border border-white/60 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4">
                <div>
                  <div className="text-lg font-semibold text-black">{formTitle}</div>
                  <div className="text-sm text-gray-500">Fill the policy dates, then save to queue expiration reminders.</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm(String(nextRecordNo)));
                      setError("");
                      setSuccess("");
                    }}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
                  >
                    Reset form
                  </button>

                  <button
                    type="button"
                    onClick={clearForm}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              <form
                className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveRecord();
                }}
              >
                {FORM_FIELDS.map((field) => {
                  const commonInputClass = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-black placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-500";
                  const value = form[field.key];

                  return (
                    <label key={String(field.key)} className={`space-y-1 ${field.spanClassName ?? ""}`}>
                      <span className="block text-sm font-medium text-black">{field.label}</span>
                      {field.type === "textarea" ? (
                        <textarea
                          rows={3}
                          value={String(value)}
                          onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          disabled={!editable}
                          className={`${commonInputClass} min-h-[92px] resize-y`}
                        />
                      ) : (
                        <input
                          type={field.type}
                          value={String(value)}
                          onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          min={field.min}
                          max={field.max}
                          disabled={!editable}
                          className={commonInputClass}
                        />
                      )}
                    </label>
                  );
                })}

                <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-gray-500">
                    {canEditRecords
                      ? "Create and update actions are controlled by the module edit permission."
                      : "View-only access. Request edit access to add or update records."}
                  </div>

                  <button
                    type="submit"
                    disabled={!canEditRecords || saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-95"
                  >
                    {editingId === null ? <Plus className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                    {saving ? "Saving..." : saveLabel}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        <SpreadsheetImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="Import car insurance records"
          description="Upload Excel or CSV rows. Template downloads are included in the modal."
          templateFileName="car_insurance_expiration_template"
          templateSampleData={IMPORT_TEMPLATE_SAMPLE}
          parseRow={(row, idx) => parseSpreadsheetRow(row, idx)}
          onImport={importRows}
          previewColumns={[
            "No.",
            "Patrol",
            "Post/s Distributions",
            "Make",
            "Model",
            "Plate Number",
            "Insurance Company",
            "Policy To Date Expiration",
          ]}
        />
      </section>
    </TableZoomWrapper>
  );
}