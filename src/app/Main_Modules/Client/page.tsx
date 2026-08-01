"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileDown, FileText, PencilLine, Plus, Search, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess, useMyModuleAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import { useToast } from "@/app/Components/ToastProvider";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import SpreadsheetImportModal from "@/app/Components/SpreadsheetImportModal";
import { readSpreadsheetRows } from "@/app/Components/spreadsheetImportUtils";
import { addBrandedPdfHeader, buildBrandedAoa, buildBrandedWorkbookBuffer } from "../Components/exportBranding";



/* --- types and helpers (kept from your original file) --- */

type ClientRow = {
  contract_id: string;
  applicant_id: string | null;
  contract_no: string | null;
  status: string | null;
  created_at: string | null;
  contract_no_date: string | null;
  cluster: string | null;
  client_name: string | null;
  specific_area: string | null;
  project_name: string | null;
  contract_start: string | null;
  contract_end: string | null;
  notification_recipient_email: string | null;
  contracted_manpower: number | null;
  deployed_guards: number | null;
  remarks: string | null;
  employees: string[];
  employeeLinks: EmployeeLink[];
};

type AssignedEmployeeRow = {
  applicant_id: string;
  custom_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  extn_name: string | null;
  detachment: string | null;
  status: string | null;
};

type SaveState = {
  type: "" | "success" | "error";
  message: string;
};

type EmployeeLink = {
  applicant_id: string;
  custom_id: string | null;
  name: string;
};

type ContractNotificationRecipientRow = {
  id: number;
  email: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

type ContractForm = {
  contract_no: string;
  client_name: string;
  project_name: string;
  specific_area: string;
  cluster: string;
  contract_start: string;
  contract_end: string;
  notification_recipient_email: string;
  contracted_manpower: string;
  status: string;
  created_at: string;
  remarks: string;
};

const EMPTY_FORM: ContractForm = {
  contract_no: "",
  client_name: "",
  project_name: "",
  specific_area: "",
  cluster: "",
  contract_start: "",
  contract_end: "",
  notification_recipient_email: "",
  contracted_manpower: "",
  status: "ACTIVE",
  created_at: "",
  remarks: "",
};

const inputClass = "w-full rounded-xl border px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-[#FFDA03]";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1";
const CLIENT_SECTORS = [
  { value: "Metro Manila", label: "1 Metro Manila" },
  { value: "Northern Luzon", label: "2 Northern Luzon" },
  { value: "Southern Visayas", label: "3 Southern Visayas" },
  { value: "Visayas", label: "4 Visayas" },
  { value: "Mindanao", label: "5 Mindanao" },
] as const;

type ClientSectorValue = (typeof CLIENT_SECTORS)[number]["value"];
type ClientSectorFilter = "ALL" | ClientSectorValue;

function ModalShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl bg-white rounded-3xl border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-black">{title}</div>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-black text-sm">
            Close
          </button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/* --- utility helpers (kept) --- */

function toNullableText(value: string) {
  const clean = value.trim();
  return clean.length ? clean : null;
}

function normalizeRecipientEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function toNullableRecipientEmail(value: unknown) {
  const email = normalizeRecipientEmail(value);
  return email || null;
}

function isValidRecipientEmail(value: unknown) {
  const email = normalizeRecipientEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function contractMutationError(action: "insert" | "update", error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? error ?? "Unknown database error");
  if (/contracts_notification_recipient_email_check|notification_recipient_email.*check/i.test(message)) {
    return "Contract notification Gmail must be blank or a valid Gmail/email address.";
  }
  if (message.toLowerCase().includes("notification_recipient_email")) {
    return "Run SQL/supabase_contract_expiration_notifications.sql in the Supabase SQL Editor, then try again.";
  }
  return `Contract ${action} failed: ${message}`;
}

function contractRecipientError(error: unknown, fallback: string) {
  const message = String((error as { message?: unknown })?.message ?? error ?? fallback);
  const code = String((error as { code?: unknown })?.code ?? "");
  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "Client recipient access is blocked by Supabase RLS. Run SQL/supabase_fix_contract_notification_recipients_rls.sql in the Supabase SQL Editor, then try again.";
  }
  if (/contract_notification_recipients|relation .* does not exist/i.test(message)) {
    return "Run SQL/supabase_contract_expiration_notifications.sql in the Supabase SQL Editor, then try again.";
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return "That Gmail address is already in the Client notification recipient list.";
  }
  return message || fallback;
}

function toNumberOrNull(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findValueByAliases(row: Record<string, unknown>, aliases: string[]) {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) map.set(normalizeHeader(k), v);
  for (const a of aliases) {
    const v = map.get(normalizeHeader(a));
    if (v !== undefined && String(v ?? "").trim() !== "") return String(v);
  }
  return "";
}

function normalizeImportKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSectorKey(value: unknown) {
  return normalizeImportKey(value).replace(/^\d+\s+/, "");
}

function clusterMatchesSector(cluster: unknown, sector: ClientSectorValue) {
  return normalizeSectorKey(cluster) === normalizeSectorKey(sector);
}

function normalizeAreaKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").trim().toUpperCase();
  if (!status) return "ACTIVE";
  if (status === "REASSIGN") return "AWOL";
  return status;
}

function isActiveEmployeeStatus(value: unknown) {
  return normalizeStatus(value) === "ACTIVE";
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatApplicantName(a: Partial<AssignedEmployeeRow> | null): string {
  if (!a) return "—";
  const last = String(a.last_name ?? "").trim();
  const first = String(a.first_name ?? "").trim();
  const middle = String(a.middle_name ?? "").trim();
  const ext = String(a.extn_name ?? "").trim();

  const left = last ? `${last},` : "";
  const right = [first, middle, ext].filter((p) => p.length).join(" ");
  const full = `${left} ${right}`.trim();
  return full.length ? full : "—";
}

function formatEmployeeIdNumber(applicantId: string, customId: string | null | undefined) {
  const clean = String(customId ?? "").trim();
  if (clean) return clean;
  return `EMP-${applicantId.slice(0, 2).toUpperCase()}-${applicantId.slice(2, 5).toUpperCase()}`;
}

function fmt(v: string | number | null | undefined) {
  if (v == null) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

function toDatetimeLocalValue(v: string | null) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function omitBlankCreatedAt<T extends Record<string, unknown>>(payload: T) {
  const next: Record<string, unknown> = { ...payload };
  if (String(next.created_at ?? "").trim() === "") delete next.created_at;
  return next;
}

/* ------------------- Main Page Component ------------------- */

export default function ClientsPage() {
  const { role } = useAuthRole();
  const { canAccess: canAccessClient } = useMyModuleAccess("client");
  const { allowedColumns, restricted } = useMyColumnAccess("client");
  const toast = useToast();
  const lastToastRef = useRef<{ error: string; save: string }>({ error: "", save: "" });

  const isAdmin = role === "admin" || role === "superadmin";
  const canViewColumnPermission = (columnKey: string) => !restricted || allowedColumns.has(columnKey);
  const canImportFile = isAdmin && canViewColumnPermission("import_file");
  const canDownloadTemplate = isAdmin && canViewColumnPermission("export_template");
  const canExportFile = isAdmin && canViewColumnPermission("export_file");
  const canViewNotificationRecipients = canViewColumnPermission("notification_recipient_email");
  const canEditNotificationRecipients = isAdmin && canViewNotificationRecipients;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ type: "", message: "" });

  useEffect(() => {
    if (!error) return;
    if (lastToastRef.current.error === error) return;
    lastToastRef.current.error = error;
    toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (!saveState.message) return;
    const key = `${saveState.type}:${saveState.message}`;
    if (lastToastRef.current.save === key) return;
    lastToastRef.current.save = key;
    if (saveState.type === "error") toast.error(saveState.message);
    else toast.success(saveState.message);
  }, [saveState, toast]);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created_at" | "contract_no" | "client_name">("created_at");
  const [sectorFilter, setSectorFilter] = useState<ClientSectorFilter>("ALL");
  const [page, setPage] = useState(1);

  const [contractForm, setContractForm] = useState<ContractForm>(EMPTY_FORM);

  const [employeeLinksByArea, setEmployeeLinksByArea] = useState<Map<string, EmployeeLink[]>>(new Map());
  const [applicants] = useState<AssignedEmployeeRow[]>([]);
  const [applicantsLoading] = useState(false);
  const [applicantsError] = useState("");
  const [applicantSearch, setApplicantSearch] = useState("");
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [detailsRow, setDetailsRow] = useState<ClientRow | null>(null);
  const [, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
  const [importSummaryOpen, setImportSummaryOpen] = useState(false);
  const [recipientRows, setRecipientRows] = useState<ContractNotificationRecipientRow[]>([]);
  const [recipientSaving, setRecipientSaving] = useState(false);
  const [addRecipientOpen, setAddRecipientOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientNotes, setRecipientNotes] = useState("");
  const [editingRecipientId, setEditingRecipientId] = useState<number | null>(null);
  const [editRecipientEmail, setEditRecipientEmail] = useState("");
  const [editRecipientNotes, setEditRecipientNotes] = useState("");
  const [editRecipientActive, setEditRecipientActive] = useState(true);

  /* NEW: Modal state for exports/templates */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const pageSize = 10;

  /* --- downloadTemplate, handleImportFile, loadConnectedData, loadApplicants, submitContract etc.
     kept unchanged from your original file. I will include your existing implementations here  --- */

  async function downloadTemplate(format: "xlsx" | "csv") {
    const sample = {
      contract_no: "2026 SERIES 001",
      cluster: "Metro Manila",
      client_name: "Sample Client",
      specific_area: "Area 1",
      project_name: "Project Alpha",
      contract_start: "2026-02-01",
      contract_end: "2027-02-01",
      contracted_manpower: 10,
      status: "ACTIVE",
      remarks: "Optional notes",
    };

    if (format === "xlsx") {
      const out = await buildBrandedWorkbookBuffer([
        {
          name: "ClientTemplate",
          title: "Client Import Template",
          subtitle: "Sample contract data for import",
          rows: [sample],
        },
      ]);
      downloadBlob("client_import_template.xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(buildBrandedAoa([sample], "Client Import Template", "Sample contract data for import"));
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob("client_import_template.csv", new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  async function handleImportFile(file: File) {
    setSaveState({ type: "", message: "" });
    setError("");
    setImportSummary(null);
    if (!canImportFile) {
      setSaveState({ type: "error", message: "You do not have permission to import files in Client page." });
      return;
    }

    setImporting(true);
    try {
      await handleClientImport(await readSpreadsheetRows(file));
    } catch (e: unknown) {
      setSaveState({ type: "error", message: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const parseClientImportRow = useCallback((row: Record<string, unknown>) => {
    const payload = {
      contract_no: toNullableText(findValueByAliases(row, ["contract_no", "contract series", "contract date", "contract number", "contractno", "contract"])),
      client_name: toNullableText(findValueByAliases(row, ["client_name", "client", "customer"])),
      project_name: toNullableText(findValueByAliases(row, ["project_name", "project"])),
      specific_area: toNullableText(findValueByAliases(row, ["specific_area", "area", "specific area"])),
      cluster: toNullableText(findValueByAliases(row, ["cluster"])),
      contract_start: toNullableText(findValueByAliases(row, ["contract_start", "start", "start_date", "contract start"])),
      contract_end: toNullableText(findValueByAliases(row, ["contract_end", "end", "end_date", "contract end"])),
      notification_recipient_email: toNullableRecipientEmail(findValueByAliases(row, ["notification_recipient_email", "notification recipient gmail", "notification email", "recipient email", "gmail"])),
      contracted_manpower: toNumberOrNull(findValueByAliases(row, ["contracted_manpower", "manpower", "contracted manpower"])),
      status: toNullableText(findValueByAliases(row, ["status"])),
      created_at: toNullableText(findValueByAliases(row, ["created_at", "created at", "created"])),
      remarks: toNullableText(findValueByAliases(row, ["remarks", "note", "notes", "comment"])),
    };

    const hasIdentity = Boolean(payload.contract_no || payload.client_name || payload.project_name);
    const displayName = payload.contract_no || payload.client_name || payload.project_name || "—";

    if (!hasIdentity) {
      return { payload: null, displayName, error: "Missing identity fields (contract_no/client_name/project_name)" };
    }

    return { payload, displayName };
  }, []);

  const handleClientImport = useCallback(async (rawRows: Record<string, unknown>[]) => {
    if (!canImportFile) {
      throw new Error("You do not have permission to import files in Client page.");
    }

    const rowErrors: string[] = [];
    let skipped = 0;

    const importedPayloads = rawRows
      .map((row, idx) => {
        const { payload, error } = parseClientImportRow(row);
        if (!payload) {
          skipped += 1;
          if (error) rowErrors.push(`Row ${idx + 2}: ${error}`);
        }
        return payload;
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v));

    if (!importedPayloads.length) throw new Error("No valid rows found. Ensure file has identifiable contract/client columns.");

    const { data: existingRows, error: existingErr } = await supabase
      .from("contracts")
      .select("contract_id, contract_no, client_name, project_name, contract_start")
      .limit(10000);
    if (existingErr) throw existingErr;

    const byContractNo = new Map<string, string>();
    const byComposite = new Map<string, string>();
    const byClientProject = new Map<string, string>();
    const clientProjectCounts = new Map<string, number>();
    for (const row of ((existingRows ?? []) as Array<Record<string, unknown>>)) {
      const id = String(row.contract_id ?? "");
      if (!id) continue;
      const contractNo = normalizeImportKey(row.contract_no);
      if (contractNo) byContractNo.set(contractNo, id);
      const comp = [
        normalizeImportKey(row.client_name),
        normalizeImportKey(row.project_name),
        normalizeImportKey(row.contract_start),
      ].join("|");
      if (comp !== "||") byComposite.set(comp, id);

      const cp = [normalizeImportKey(row.client_name), normalizeImportKey(row.project_name)].join("|");
      if (cp !== "|") {
        clientProjectCounts.set(cp, (clientProjectCounts.get(cp) ?? 0) + 1);
        if (!byClientProject.has(cp)) byClientProject.set(cp, id);
      }
    }

    for (const [cp, count] of clientProjectCounts.entries()) {
      if (count > 1) byClientProject.delete(cp);
    }

    const dedupedMap = new Map<string, (typeof importedPayloads)[number]>();
    for (const payload of importedPayloads) {
      const cno = normalizeImportKey(payload.contract_no);
      const comp = [
        normalizeImportKey(payload.client_name),
        normalizeImportKey(payload.project_name),
        normalizeImportKey(payload.contract_start),
      ].join("|");
      const cp = [normalizeImportKey(payload.client_name), normalizeImportKey(payload.project_name)].join("|");
      const key = cno ? `cno:${cno}` : comp !== "||" ? `cmp:${comp}` : `cp:${cp}`;
      if (dedupedMap.has(key)) skipped += 1;
      dedupedMap.set(key, payload);
    }

    let inserted = 0;
    let updated = 0;

    for (const payload of dedupedMap.values()) {
      const safePayload = omitBlankCreatedAt(payload);
      const cno = normalizeImportKey(payload.contract_no);
      const comp = [
        normalizeImportKey(payload.client_name),
        normalizeImportKey(payload.project_name),
        normalizeImportKey(payload.contract_start),
      ].join("|");
      const cp = [normalizeImportKey(payload.client_name), normalizeImportKey(payload.project_name)].join("|");

      const matchId =
        (cno ? byContractNo.get(cno) : null) ??
        byComposite.get(comp) ??
        (cp !== "|" ? byClientProject.get(cp) : null) ??
        null;
      if (matchId) {
        const upd = await supabase.from("contracts").update(safePayload).eq("contract_id", matchId);
        if (upd.error) {
          skipped += 1;
          rowErrors.push(`Update failed for contract ${payload.contract_no ?? payload.client_name ?? "(unknown)"}: ${upd.error.message}`);
          continue;
        }
        updated += 1;
        continue;
      }

      const ins = await supabase.from("contracts").insert(safePayload);
      if (ins.error) {
        skipped += 1;
        rowErrors.push(`Insert failed for contract ${payload.contract_no ?? payload.client_name ?? "(unknown)"}: ${ins.error.message}`);
        continue;
      }
      inserted += 1;
    }

    setImportSummary({ inserted, updated, skipped, errors: rowErrors });
    setImportSummaryOpen(true);
    setSaveState({ type: "success", message: `Import complete. Inserted: ${inserted}, Updated (overwritten): ${updated}, Skipped: ${skipped}.` });
    await loadConnectedData();

    return { inserted, updated, skipped, errors: rowErrors };
  }, [canImportFile, parseClientImportRow]);

  /* --- loadConnectedData, loadApplicants, submitContract, openEditModal, openDetails etc.
         unchanged — include them as in your original file. For brevity here I keep the original implementations. --- */

  const loadContractRecipientRows = useCallback(async () => {
    if (!canViewNotificationRecipients) {
      setRecipientRows([]);
      return;
    }

    const result = await supabase
      .from("contract_notification_recipients")
      .select("id, email, is_active, notes, created_at")
      .order("created_at", { ascending: true });

    if (result.error) {
      setRecipientRows([]);
      setError(contractRecipientError(result.error, "Failed to load Client notification recipients."));
      return;
    }

    setRecipientRows((result.data as ContractNotificationRecipientRow[]) ?? []);
  }, [canViewNotificationRecipients]);

  function resetRecipientForm() {
    setRecipientEmail("");
    setRecipientNotes("");
    setAddRecipientOpen(false);
  }

  function openRecipientEditor(row: ContractNotificationRecipientRow) {
    setEditingRecipientId(row.id);
    setEditRecipientEmail(row.email);
    setEditRecipientNotes(row.notes ?? "");
    setEditRecipientActive(Boolean(row.is_active));
    setError("");
    setSaveState({ type: "", message: "" });
  }

  function closeRecipientEditor() {
    setEditingRecipientId(null);
    setEditRecipientEmail("");
    setEditRecipientNotes("");
    setEditRecipientActive(true);
  }

  async function addContractRecipient() {
    if (!canEditNotificationRecipients || recipientSaving) return;
    const email = normalizeRecipientEmail(recipientEmail);
    if (!isValidRecipientEmail(email)) {
      setSaveState({ type: "error", message: "Enter a valid Gmail or email address." });
      return;
    }

    setRecipientSaving(true);
    setError("");
    setSaveState({ type: "", message: "" });
    try {
      const result = await supabase
        .from("contract_notification_recipients")
        .insert({
          email,
          notes: toNullableText(recipientNotes),
          is_active: true,
        })
        .select("id, email, is_active, notes, created_at")
        .single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Supabase did not return the saved Client notification recipient.");
      resetRecipientForm();
      setSaveState({ type: "success", message: "Client notification recipient added." });
      await loadContractRecipientRows();
    } catch (recipientError: unknown) {
      setSaveState({ type: "error", message: contractRecipientError(recipientError, "Failed to add Client notification recipient.") });
    } finally {
      setRecipientSaving(false);
    }
  }

  async function saveContractRecipient() {
    if (!canEditNotificationRecipients || !editingRecipientId || recipientSaving) return;
    const email = normalizeRecipientEmail(editRecipientEmail);
    if (!isValidRecipientEmail(email)) {
      setSaveState({ type: "error", message: "Enter a valid Gmail or email address." });
      return;
    }

    setRecipientSaving(true);
    setError("");
    setSaveState({ type: "", message: "" });
    try {
      const result = await supabase
        .from("contract_notification_recipients")
        .update({
          email,
          notes: toNullableText(editRecipientNotes),
          is_active: editRecipientActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingRecipientId);
      if (result.error) throw result.error;
      closeRecipientEditor();
      setSaveState({ type: "success", message: "Client notification recipient updated." });
      await loadContractRecipientRows();
    } catch (recipientError: unknown) {
      setSaveState({ type: "error", message: contractRecipientError(recipientError, "Failed to update Client notification recipient.") });
    } finally {
      setRecipientSaving(false);
    }
  }

  async function toggleContractRecipient(id: number, isActive: boolean) {
    if (!canEditNotificationRecipients) return;
    const result = await supabase
      .from("contract_notification_recipients")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (result.error) {
      setSaveState({ type: "error", message: contractRecipientError(result.error, "Failed to update recipient status.") });
      return;
    }
    await loadContractRecipientRows();
  }

  async function removeContractRecipient(id: number) {
    if (!canEditNotificationRecipients) return;
    if (!window.confirm("Remove this Client contract notification recipient?")) return;

    const result = await supabase.from("contract_notification_recipients").delete().eq("id", id);
    if (result.error) {
      setSaveState({ type: "error", message: contractRecipientError(result.error, "Failed to remove Client notification recipient.") });
      return;
    }
    if (editingRecipientId === id) closeRecipientEditor();
    setSaveState({ type: "success", message: "Client notification recipient removed." });
    await loadContractRecipientRows();
  }

  async function loadConnectedData() {
    setLoading(true);
    setError("");

    const wideSelect =
      "contract_id, applicant_id, contract_no, status, created_at, contract_no_date, cluster, client_name, specific_area, project_name, contract_start, contract_end, notification_recipient_email, contracted_manpower, deployed_guards, remarks";

    const legacyWideSelect =
      "contract_id, applicant_id, contract_no, status, created_at, contract_no_date, cluster, client_name, specific_area, project_name, contract_start, contract_end, contracted_manpower, deployed_guards, remarks";

    const narrowSelect = "contract_id, applicant_id, contract_no, status, created_at";

    const applicantNameSelect = "custom_id, first_name, middle_name, last_name, extn_name";
    const directApplicantEmbed = `applicants!contracts_applicant_id_fkey(${applicantNameSelect})`;
    const joinEmployeesEmbed = `contract_employees(applicant_id, applicants!contract_employees_applicant_id_fkey(${applicantNameSelect}))`;

    const joinEmployeesEmbedRelaxed = `contract_employees(applicant_id, applicants(${applicantNameSelect}))`;

    const selectShapes = [
      `${wideSelect}, ${directApplicantEmbed}, ${joinEmployeesEmbed}`,
      `${wideSelect}, ${joinEmployeesEmbed}`,
      `${wideSelect}, ${joinEmployeesEmbedRelaxed}`,
      `${wideSelect}`,
      `${legacyWideSelect}, ${directApplicantEmbed}, ${joinEmployeesEmbed}`,
      `${legacyWideSelect}, ${joinEmployeesEmbed}`,
      `${legacyWideSelect}, ${joinEmployeesEmbedRelaxed}`,
      `${legacyWideSelect}`,
      `${narrowSelect}, ${directApplicantEmbed}, ${joinEmployeesEmbed}`,
      `${narrowSelect}, ${joinEmployeesEmbed}`,
      `${narrowSelect}, ${joinEmployeesEmbedRelaxed}`,
      `${narrowSelect}`,
    ];

    let data: unknown = null;
    let loadError: unknown = null;

    for (const shape of selectShapes) {
      const res = await supabase
        .from("contracts")
        .select(shape)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (!res.error) {
        data = res.data as unknown;
        loadError = null;
        break;
      }

      loadError = res.error;
    }

    if (loadError) {
      const msg = (loadError as { message?: string })?.message ?? "Failed to load contracts";
      setLoading(false);
      setError(msg);
      setRows([]);
      return;
    }

    const employeeRes = await supabase
      .from("applicants")
      .select("applicant_id, custom_id, first_name, middle_name, last_name, extn_name, detachment, status, is_archived, is_trashed")
      .eq("is_archived", false)
      .eq("is_trashed", false)
      .not("detachment", "is", null)
      .limit(10000);

    const assignedByArea = new Map<string, EmployeeLink[]>();
    if (!employeeRes.error) {
      for (const applicant of ((employeeRes.data ?? []) as unknown as AssignedEmployeeRow[])) {
        if (!isActiveEmployeeStatus(applicant.status)) continue;
        const areaKey = normalizeAreaKey(applicant.detachment);
        if (!areaKey) continue;
        const name = formatApplicantName(applicant);
        if (!name || name === "—") continue;
        const next = assignedByArea.get(areaKey) ?? [];
        next.push({
          applicant_id: String(applicant.applicant_id),
          custom_id: applicant.custom_id,
          name,
        });
        assignedByArea.set(areaKey, next);
      }

      for (const [key, links] of assignedByArea.entries()) {
        assignedByArea.set(
          key,
          links
            .filter((link, index, list) => list.findIndex((candidate) => candidate.applicant_id === link.applicant_id) === index)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
    } else {
      console.warn(employeeRes.error);
    }

    setEmployeeLinksByArea(new Map(assignedByArea));

    const merged: ClientRow[] = ((data ?? []) as Record<string, unknown>[]).map((contract) => {
      const contractApplicantId = contract.applicant_id == null ? null : String(contract.applicant_id);
      const directApplicant = firstOrNull(
        contract.applicants as
          | { custom_id?: unknown; first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }
          | { custom_id?: unknown; first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }[]
          | null
      );

      const joinRows = (contract.contract_employees as Record<string, unknown>[] | null | undefined) ?? [];
      const joinEmployeeLinks = joinRows
        .map((jr) => {
          const applicantId = jr.applicant_id == null ? null : String(jr.applicant_id);
          const applicant = firstOrNull(
            jr.applicants as
              | { custom_id?: unknown; first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }
              | { custom_id?: unknown; first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }[]
              | null
          );
          const name = formatApplicantName({
            first_name: applicant?.first_name == null ? null : String(applicant.first_name),
            middle_name: applicant?.middle_name == null ? null : String(applicant.middle_name),
            last_name: applicant?.last_name == null ? null : String(applicant.last_name),
            extn_name: applicant?.extn_name == null ? null : String(applicant.extn_name),
          });
          if (!applicantId || !name || name === "—") return null;
          return {
            applicant_id: applicantId,
            custom_id: applicant?.custom_id == null ? null : String(applicant.custom_id),
            name,
          };
        })
        .filter((v): v is EmployeeLink => Boolean(v));

      const directName = directApplicant
        ? formatApplicantName({
            first_name: directApplicant.first_name == null ? null : String(directApplicant.first_name),
            middle_name: directApplicant.middle_name == null ? null : String(directApplicant.middle_name),
            last_name: directApplicant.last_name == null ? null : String(directApplicant.last_name),
            extn_name: directApplicant.extn_name == null ? null : String(directApplicant.extn_name),
          })
        : null;

        const employeeLinksMap = new Map<string, EmployeeLink>();
        for (const link of joinEmployeeLinks) {
          if (!employeeLinksMap.has(link.applicant_id)) employeeLinksMap.set(link.applicant_id, link);
        }
        if (contractApplicantId && directName && directName !== "—" && !employeeLinksMap.has(contractApplicantId)) {
          employeeLinksMap.set(contractApplicantId, {
            applicant_id: contractApplicantId,
            custom_id: directApplicant?.custom_id == null ? null : String(directApplicant.custom_id),
            name: directName,
          });
        }
        const employeeLinksFromJoin = Array.from(employeeLinksMap.values());
        const areaKey = normalizeAreaKey(contract.specific_area);
        const areaEmployeeLinks = areaKey ? assignedByArea.get(areaKey) ?? [] : [];
        const employeeLinks = areaKey ? areaEmployeeLinks : employeeLinksFromJoin;

        const allNames = [
          ...employeeLinks.map((x) => x.name),
          ...(directName && directName !== "—" ? [directName] : []),
        ].filter((n): n is string => Boolean(n && n !== "—"));
      const uniqueNames = Array.from(new Set(allNames));

      return {
        contract_id: String(contract.contract_id),
        applicant_id: contractApplicantId,
        contract_no: contract.contract_no == null ? null : String(contract.contract_no),
        status: contract.status == null ? null : String(contract.status),
        created_at: contract.created_at == null ? null : String(contract.created_at),
        contract_no_date: contract.contract_no_date == null ? null : String(contract.contract_no_date),
        cluster: contract.cluster == null ? null : String(contract.cluster),
        client_name: contract.client_name == null ? null : String(contract.client_name),
        specific_area: contract.specific_area == null ? null : String(contract.specific_area),
        project_name: contract.project_name == null ? null : String(contract.project_name),
        contract_start: contract.contract_start == null ? null : String(contract.contract_start),
        contract_end: contract.contract_end == null ? null : String(contract.contract_end),
        notification_recipient_email:
          contract.notification_recipient_email == null ? null : String(contract.notification_recipient_email),
        contracted_manpower:
          contract.contracted_manpower == null || contract.contracted_manpower === ""
            ? null
            : Number(contract.contracted_manpower),
        deployed_guards: employeeRes.error
          ? contract.deployed_guards == null || contract.deployed_guards === ""
            ? null
            : Number(contract.deployed_guards)
          : areaEmployeeLinks.length,
        remarks: contract.remarks == null ? null : String(contract.remarks),
        employees: uniqueNames,
        employeeLinks,
      };
    });

    setRows(merged);
    setLoading(false);
  }

  async function deleteContract(contractId: string) {
    if (!isAdmin) {
      setSaveState({ type: "error", message: "Only admins can delete contracts." });
      return;
    }

    const id = String(contractId ?? "").trim();
    if (!id) {
      setSaveState({ type: "error", message: "Missing contract ID for delete." });
      return;
    }

    const ok = confirm("Delete this contract? This cannot be undone.");
    if (!ok) return;

    setError("");
    setSaveState({ type: "", message: "" });
    setSavingKey("delete-contract");
    try {
      // Best-effort cleanup: the join table has ON DELETE CASCADE in the migration,
      // but some DBs may not have it yet.
      await supabase.from("contract_employees").delete().eq("contract_id", id);

      const delRes = await supabase.from("contracts").delete().eq("contract_id", id);
      if (delRes.error) {
        setSaveState({ type: "error", message: `Contract delete failed: ${delRes.error.message}` });
        return;
      }

      setSaveState({ type: "success", message: "Contract deleted." });
      setEditorOpen(false);
      setDetailsRow(null);
      await loadConnectedData();
    } finally {
      setSavingKey(null);
    }
  }

  async function countActiveEmployeesForSpecificArea(specificArea: string | null) {
    const areaKey = normalizeAreaKey(specificArea);
    if (!areaKey) return 0;

    const res = await supabase
      .from("applicants")
      .select("applicant_id, detachment, status")
      .eq("is_archived", false)
      .eq("is_trashed", false)
      .not("detachment", "is", null)
      .limit(10000);

    if (res.error) {
      console.warn(res.error);
      return employeeLinksByArea.get(areaKey)?.length ?? 0;
    }

    return ((res.data ?? []) as Array<Record<string, unknown>>).filter(
      (row) => isActiveEmployeeStatus(row.status) && normalizeAreaKey(row.detachment) === areaKey
    ).length;
  }

  async function submitContract(e: FormEvent) {
    e.preventDefault();

    if (!isAdmin) {
      setSaveState({ type: "error", message: "Only admins can create or edit contracts." });
      return;
    }

    setSavingKey("contract");
    setSaveState({ type: "", message: "" });

    const specificArea = toNullableText(contractForm.specific_area);
    const deployedGuards = await countActiveEmployeesForSpecificArea(specificArea);
    const notificationRecipientEmail = toNullableRecipientEmail(contractForm.notification_recipient_email);

    const createdAt = toNullableText(contractForm.created_at);
    const insertPayload: Record<string, string | number | null> = {
      applicant_id: null,
      contract_no: toNullableText(contractForm.contract_no),
      client_name: toNullableText(contractForm.client_name),
      project_name: toNullableText(contractForm.project_name),
      specific_area: specificArea,
      cluster: toNullableText(contractForm.cluster),
      contract_start: toNullableText(contractForm.contract_start),
      contract_end: toNullableText(contractForm.contract_end),
      notification_recipient_email: notificationRecipientEmail,
      contracted_manpower: toNumberOrNull(contractForm.contracted_manpower),
      deployed_guards: deployedGuards,
      status: toNullableText(contractForm.status) || "ACTIVE",
      remarks: toNullableText(contractForm.remarks),
    };
    if (createdAt) insertPayload.created_at = createdAt;
    const safePayload = omitBlankCreatedAt(insertPayload);

    if (editorMode === "edit") {
      if (!editingContractId) {
        setSaveState({ type: "error", message: "Missing contract ID for edit." });
        setSavingKey(null);
        return;
      }

      const updRes = await supabase
        .from("contracts")
        .update(safePayload)
        .eq("contract_id", editingContractId);

      if (updRes.error) {
        setSaveState({ type: "error", message: contractMutationError("update", updRes.error) });
        setSavingKey(null);
        return;
      }

      setSaveState({ type: "success", message: "Contract updated." });
    } else {
      const insertRes = await supabase
        .from("contracts")
        .insert([safePayload])
        .select("contract_id")
        .single();

      if (insertRes.error) {
        setSaveState({ type: "error", message: contractMutationError("insert", insertRes.error) });
        setSavingKey(null);
        return;
      }

      setSaveState({ type: "success", message: "Contract saved." });
    }

    setContractForm(EMPTY_FORM);
    setEditingContractId(null);
    setEditorMode("create");
    await loadConnectedData();
    setSavingKey(null);
    setEditorOpen(false);
  }

  async function openEditModal(row: ClientRow) {
    setEditorMode("edit");
    setEditingContractId(row.contract_id);
    setContractForm({
      contract_no: row.contract_no ?? "",
      client_name: row.client_name ?? "",
      project_name: row.project_name ?? "",
      specific_area: row.specific_area ?? "",
      cluster: row.cluster ?? "",
      contract_start: row.contract_start ?? "",
      contract_end: row.contract_end ?? "",
      notification_recipient_email: row.notification_recipient_email ?? "",
      contracted_manpower: row.contracted_manpower == null ? "" : String(row.contracted_manpower),
      status: row.status ?? "ACTIVE",
      created_at: toDatetimeLocalValue(row.created_at),
      remarks: row.remarks ?? "",
    });
    setEditorOpen(true);
  }

  async function openDetails(row: ClientRow) {
    setDetailsRow(row);

    const contractId = row.contract_id;
    const areaKey = normalizeAreaKey(row.specific_area);
    if (!areaKey) return;
    const idSet = new Set<string>();
    if (row.applicant_id) idSet.add(row.applicant_id);
    for (const link of row.employeeLinks) {
      if (link.applicant_id) idSet.add(link.applicant_id);
    }

    try {
      const areaRes = await supabase
        .from("applicants")
        .select("applicant_id, custom_id, first_name, middle_name, last_name, extn_name, detachment, status")
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .not("detachment", "is", null)
        .limit(10000);

      if (!areaRes.error) {
        const links = ((areaRes.data ?? []) as unknown as AssignedEmployeeRow[])
          .filter((applicant) => isActiveEmployeeStatus(applicant.status) && normalizeAreaKey(applicant.detachment) === areaKey)
          .map((applicant) => {
            const applicantId = applicant.applicant_id == null ? null : String(applicant.applicant_id);
            const name = formatApplicantName(applicant);
            if (!applicantId || !name || name === fmt(null)) return null;
            return { applicant_id: applicantId, custom_id: applicant.custom_id, name };
          })
          .filter((value): value is EmployeeLink => Boolean(value))
          .sort((a, b) => a.name.localeCompare(b.name));

        setDetailsRow((prev) => {
          if (!prev) return prev;
          if (prev.contract_id !== contractId) return prev;
          return {
            ...prev,
            deployed_guards: links.length,
            employeeLinks: links,
            employees: links.map((employee) => employee.name),
          };
        });
        return;
      }

      const joinRes = await supabase
        .from("contract_employees")
        .select("applicant_id")
        .eq("contract_id", contractId);

      if (!joinRes.error) {
        for (const jr of ((joinRes.data ?? []) as Array<{ applicant_id: string | null }>)) {
          if (jr.applicant_id) idSet.add(String(jr.applicant_id));
        }
      }

      const ids = Array.from(idSet);
      if (!ids.length) return;

      const appRes = await supabase
        .from("applicants")
        .select("applicant_id, custom_id, first_name, middle_name, last_name, extn_name")
        .in("applicant_id", ids);

      if (appRes.error) return;

      const links = ((appRes.data ?? []) as Array<Record<string, unknown>>)
        .map((a) => {
          const applicantId = a.applicant_id == null ? null : String(a.applicant_id);
          const name = formatApplicantName({
            first_name: a.first_name == null ? null : String(a.first_name),
            middle_name: a.middle_name == null ? null : String(a.middle_name),
            last_name: a.last_name == null ? null : String(a.last_name),
            extn_name: a.extn_name == null ? null : String(a.extn_name),
          });
          if (!applicantId || !name || name === "—") return null;
          return {
            applicant_id: applicantId,
            custom_id: a.custom_id == null ? null : String(a.custom_id),
            name,
          };
        })
        .filter((v): v is EmployeeLink => Boolean(v))
        .sort((a, b) => a.name.localeCompare(b.name));

      setDetailsRow((prev) => {
        if (!prev) return prev;
        if (prev.contract_id !== contractId) return prev;
        if (!links.length) return prev;
        return {
          ...prev,
          employeeLinks: links,
          employees: links.map((x) => x.name),
        };
      });
    } catch {
      // Ignore details hydration errors to avoid blocking the modal.
    }
  }

  useEffect(() => {
    void loadConnectedData();
    const channel = supabase
      .channel("realtime:client-connected-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "contract_employees" }, loadConnectedData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    void loadContractRecipientRows();
    const recipientChannel = supabase
      .channel("realtime:client-contract-notification-recipients")
      .on("postgres_changes", { event: "*", schema: "public", table: "contract_notification_recipients" }, loadContractRecipientRows)
      .subscribe();

    return () => {
      supabase.removeChannel(recipientChannel);
    };
  }, [loadContractRecipientRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;

    if (sectorFilter !== "ALL") {
      list = list.filter((r) => clusterMatchesSector(r.cluster, sectorFilter));
    }

    if (q) {
      list = list.filter((r) =>
        [
          r.contract_no,
          r.contract_no_date,
          r.client_name,
          r.project_name,
          r.specific_area,
          r.cluster,
          r.contract_start,
          r.contract_end,
          r.notification_recipient_email,
          r.status,
          r.created_at,
          r.remarks,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    const sorted = [...list].sort((a, b) => {
      if (sortBy === "contract_no") return String(a.contract_no ?? "").localeCompare(String(b.contract_no ?? ""));
      if (sortBy === "client_name") return String(a.client_name ?? "").localeCompare(String(b.client_name ?? ""));
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });

    return sorted;
  }, [rows, search, sectorFilter, sortBy]);

  const filteredApplicants = useMemo(() => {
    const q = applicantSearch.trim().toLowerCase();
    if (!q) return applicants;
    return applicants.filter((a) => {
      const hay = [a.first_name, a.middle_name, a.last_name, a.extn_name, a.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [applicants, applicantSearch]);

  function clientExportRows() {
    return filtered.map((r) => ({
      "Contract Series": fmt(r.contract_no),
      Cluster: fmt(r.cluster),
      "Client Name": fmt(r.client_name),
      "Specific Area": fmt(r.specific_area),
      "Project Name": fmt(r.project_name),
      "Contract Start": fmt(r.contract_start),
      "Contract End": fmt(r.contract_end),
      "Contracted Manpower": fmt(r.contracted_manpower),
      "No. Deployed Guards": fmt(r.deployed_guards),
      Status: fmt(r.status),
      Remarks: fmt(r.remarks),
    }));
  }

  function clientExportFileBase() {
    return `client_export_${new Date().toISOString().slice(0, 10)}`;
  }

  async function exportClientXlsx() {
    const rowsForExport = clientExportRows();
    if (!rowsForExport.length) {
      setSaveState({ type: "error", message: "No rows available for export." });
      return;
    }

    const out = await buildBrandedWorkbookBuffer([
      {
        name: "Client",
        title: "Client Export",
        subtitle: "Contracts, clients, and project details",
        rows: rowsForExport,
      },
    ]);
    downloadBlob(
      `${clientExportFileBase()}.xlsx`,
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
  }

  function exportClientCsv() {
    const rowsForExport = clientExportRows();
    if (!rowsForExport.length) {
      setSaveState({ type: "error", message: "No rows available for export." });
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(buildBrandedAoa(rowsForExport, "Client Export", "Contracts, clients, and project details"));
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(`${clientExportFileBase()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  async function exportClientPdf() {
    const rowsForExport = clientExportRows();
    if (!rowsForExport.length) {
      setSaveState({ type: "error", message: "No rows available for export." });
      return;
    }


    const headers = Object.keys(rowsForExport[0]);
    const body = rowsForExport.map((row) => headers.map((h) => String(row[h as keyof typeof row] ?? "")));

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const startY = await addBrandedPdfHeader(doc, "Client Export", "Contracts, clients, and project details");
    autoTable(doc, {
      startY: startY + 10,
      head: [headers],
      body,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
    });
    doc.save(`${clientExportFileBase()}.pdf`);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);
  const deployedGuardsForForm = employeeLinksByArea.get(normalizeAreaKey(contractForm.specific_area))?.length ?? 0;
  const sectorCounts = useMemo(() => {
    const counts: Record<ClientSectorValue, number> = {
      "Metro Manila": 0,
      "Northern Luzon": 0,
      "Southern Visayas": 0,
      Visayas: 0,
      Mindanao: 0,
    };

    for (const row of rows) {
      for (const sector of CLIENT_SECTORS) {
        if (clusterMatchesSector(row.cluster, sector.value)) counts[sector.value] += 1;
      }
    }

    return counts;
  }, [rows]);
  const clusterOptions = useMemo(() => {
    const current = contractForm.cluster.trim();
    const hasCurrent = current && CLIENT_SECTORS.some((sector) => clusterMatchesSector(current, sector.value));
    return hasCurrent || !current ? CLIENT_SECTORS : [{ value: current, label: `Current: ${current}` }, ...CLIENT_SECTORS];
  }, [contractForm.cluster]);

  if (!canAccessClient) {
    return (
      <section className="glass-panel animate-fade-in rounded-3xl p-6 space-y-3">
        <div className="text-lg font-semibold text-black">Client & Contracts</div>
        <div className="text-sm text-gray-600">You do not have access to view this page.</div>
        <div className="pt-2">
          <button
            onClick={() => window.location.href = "/Main_Modules/Requests/?module=client"}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:bg-[#EFCB00]"
          >
            Request Access
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 text-black">
          <div className="relative w-full md:w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search client contracts"
              className="bg-white border rounded-full pl-10 pr-4 py-2 shadow-sm w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500">Sort By:</div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "created_at" | "contract_no" | "client_name")}
            className="px-4 py-2 rounded-full bg-white text-black font-medium border border-gray-300"
          >
            <option value="created_at">Newest Date</option>
            <option value="contract_no">Contract Series</option>
            <option value="client_name">Client Name</option>
          </select>
        </div>
      </div>

      <div className="glass-panel animate-slide-up rounded-2xl p-4 space-y-3">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold text-black">Sectors</div>
            <div className="text-xs text-gray-500">Filter contracts by assigned cluster sector.</div>
          </div>
          <div className="text-xs text-gray-500">
            Showing {filtered.length} of {rows.length} contracts
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSectorFilter("ALL");
              setPage(1);
            }}
            className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
              sectorFilter === "ALL"
                ? "border-[#FFDA03] bg-[#FFDA03] text-black shadow-sm"
                : "border-gray-200 bg-white text-gray-700 hover:border-[#FFDA03]"
            }`}
          >
            All Sectors
            <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{rows.length}</span>
          </button>
          {CLIENT_SECTORS.map((sector) => {
            const selected = sectorFilter === sector.value;
            return (
              <button
                key={sector.value}
                type="button"
                onClick={() => {
                  setSectorFilter(sector.value);
                  setPage(1);
                }}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  selected
                    ? "border-[#FFDA03] bg-[#FFDA03] text-black shadow-sm"
                    : "border-gray-200 bg-white text-gray-700 hover:border-[#FFDA03]"
                }`}
              >
                {sector.label}
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{sectorCounts[sector.value]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {canViewNotificationRecipients ? (
        <section className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-black">Contract notification recipients</div>
              <div className="text-sm text-gray-500">
                Separate from Settings and Car Insurance. Expiring contract reminders are sent only to active inboxes listed here.
              </div>
            </div>

            {canEditNotificationRecipients ? (
              <button
                type="button"
                onClick={() => {
                  setAddRecipientOpen(true);
                  setError("");
                  setSaveState({ type: "", message: "" });
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
              >
                <Plus className="h-4 w-4" />
                Add recipient
              </button>
            ) : null}
          </div>

          <div className="overflow-auto rounded-2xl border border-gray-100">
            <table className="min-w-[640px] w-full text-sm text-black">
              <thead className="bg-[#FFDA03]">
                <tr>
                  <th className="border-b border-[#E2C100] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black">Email</th>
                  <th className="border-b border-[#E2C100] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black">Active</th>
                  <th className="border-b border-[#E2C100] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black">Notes</th>
                  <th className="border-b border-[#E2C100] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-black">Action</th>
                </tr>
              </thead>
              <tbody>
                {recipientRows.length ? (
                  recipientRows.map((recipient, index) => (
                    <tr key={recipient.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                      <td className="border-b border-gray-100 px-3 py-3 font-medium">{recipient.email}</td>
                      <td className="border-b border-gray-100 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={recipient.is_active}
                          disabled={!canEditNotificationRecipients}
                          onChange={(event) => void toggleContractRecipient(recipient.id, event.target.checked)}
                          aria-label={`${recipient.email} active`}
                        />
                      </td>
                      <td className="border-b border-gray-100 px-3 py-3 text-gray-700">{recipient.notes || "-"}</td>
                      <td className="border-b border-gray-100 px-3 py-3">
                        {canEditNotificationRecipients ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openRecipientEditor(recipient)}
                              className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-50"
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeContractRecipient(recipient.id)}
                              className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">View only</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                      No Client notification recipients configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="glass-panel animate-slide-up rounded-2xl p-4 space-y-3">
        <div className="font-semibold text-black">Create Contracts</div>
        <div className="text-sm text-gray-500">Create a connected contract record with full fields.</div>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setEditorMode("create");
                setEditingContractId(null);
                setContractForm({
                  ...EMPTY_FORM,
                  cluster: sectorFilter === "ALL" ? "" : sectorFilter,
                });
                setEditorOpen(true);
              }}
              className="animated-btn rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
            >
              Create Contract
            </button>
          ) : (
            <div className="text-sm text-gray-500">Only admins can create/edit/delete contracts.</div>
          )}

          <div className="flex items-start justify-between gap-4">



          {canImportFile ? (
  <button
    type="button"
    onClick={() => setImportModalOpen(true)}
    className="animated-btn flex items-center gap-3 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
  >
    <Upload className="w-4 h-4" />
    Import
  </button>
) : null}






          {canExportFile ? (
  <button
    type="button"
    onClick={() => setExportModalOpen(true)}
    className="animated-btn flex items-center gap-3 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
  >
    <FileText className="w-4 h-4" />
    Export
  </button>
) : null}

{canDownloadTemplate ? (
  <button
    type="button"
    onClick={() => setTemplateModalOpen(true)}
    className="animated-btn flex items-center gap-3 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
  >
    <Download className="w-4 h-4" />
    Download Templates
  </button>
) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />

          </div>
        </div>
      </div>



<SpreadsheetImportModal
  open={importModalOpen}
  onClose={() => setImportModalOpen(false)}
  title="Import Contracts"
  description="Upload an Excel (.xlsx/.xls) or CSV (.csv) file with contract data."
  allowTemplateDownloads={canDownloadTemplate}
  templateFileName="client_import_template"
  templateSampleData={{
    contract_no: "2026 SERIES 001",
    cluster: "Metro Manila",
    client_name: "Sample Client",
    specific_area: "Area 1",
    project_name: "Project Alpha",
    contract_start: "2026-02-01",
    contract_end: "2027-02-01",
    contracted_manpower: 10,
    status: "ACTIVE",
    remarks: "Optional notes",
  }}
  previewColumns={["Contract/Client"]}
  parseRow={parseClientImportRow}
  onImport={handleClientImport}
/>
      
<ModalShell
  open={exportModalOpen}
  title="Export Contracts"
  onClose={() => setExportModalOpen(false)}
>
  <div className="space-y-4">

    <div className="text-sm text-gray-700">
      Export the currently filtered contracts.
    </div>

    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={exportClientPdf}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white"
      >
        <FileText className="w-4 h-4" />
        Export PDF
      </button>

      <button
        type="button"
        onClick={exportClientXlsx}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white"
      >
        <FileDown className="w-4 h-4" />
        Export XLSX
      </button>

      <button
        type="button"
        onClick={exportClientCsv}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white"
      >
        <FileDown className="w-4 h-4" />
        Export CSV
      </button>
    </div>

  </div>
</ModalShell>

<ModalShell
  open={templateModalOpen}
  title="Download Templates"
  onClose={() => setTemplateModalOpen(false)}
>
  <div className="space-y-4">

    <div className="text-sm text-gray-700">
      Download a template file for importing client contracts.
    </div>

    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => downloadTemplate("xlsx")}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black"
      >
        <Download className="w-4 h-4" />
        Template XLSX
      </button>

      <button
        type="button"
        onClick={() => downloadTemplate("csv")}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black"
      >
        <Download className="w-4 h-4" />
        Template CSV
      </button>
    </div>

  </div>
</ModalShell>

      {/* ---------- Editor modal & details modal and table (kept unchanged) ---------- */}

      <ModalShell
        open={editorOpen}
        title={editorMode === "edit" ? "Edit Contract" : "Create Contract"}
        onClose={() => {
          setEditorOpen(false);
          setEditorMode("create");
          setEditingContractId(null);
        }}
      >
        {/* Editor form — unchanged (omitted in this snippet for brevity but present earlier) */}
        {/* ... keep exactly the same form code you already had ... */}
        <form onSubmit={submitContract} className="space-y-4">
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="font-semibold text-black">Contract Information</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Contract Series</label>
                <input
                  type="text"
                  className={inputClass}
                  value={contractForm.contract_no}
                  placeholder="Enter contract series"
                  onChange={(e) => setContractForm((p) => ({ ...p, contract_no: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Cluster</label>
                <select
                  className={`${inputClass} bg-white`}
                  value={contractForm.cluster}
                  onChange={(e) => setContractForm((p) => ({ ...p, cluster: e.target.value }))}
                >
                  <option value="">-- Select Sector --</option>
                  {clusterOptions.map((sector) => (
                    <option key={sector.value} value={sector.value}>
                      {sector.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Client Name</label>
                <input className={inputClass} value={contractForm.client_name} onChange={(e) => setContractForm((p) => ({ ...p, client_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Specific Area</label>
                <input className={inputClass} value={contractForm.specific_area} onChange={(e) => setContractForm((p) => ({ ...p, specific_area: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Project Name</label>
                <input className={inputClass} value={contractForm.project_name} onChange={(e) => setContractForm((p) => ({ ...p, project_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Contract Start</label>
                <input type="date" className={inputClass} value={contractForm.contract_start} onChange={(e) => setContractForm((p) => ({ ...p, contract_start: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Contract End</label>
                <input type="date" className={inputClass} value={contractForm.contract_end} onChange={(e) => setContractForm((p) => ({ ...p, contract_end: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Contracted Manpower</label>
                <input type="number" className={inputClass} value={contractForm.contracted_manpower} onChange={(e) => setContractForm((p) => ({ ...p, contracted_manpower: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>No. Deployed Guards</label>
                <input type="number" className={`${inputClass} bg-gray-100 cursor-not-allowed`} value={deployedGuardsForForm} readOnly />
                <div className="mt-1 text-xs text-gray-500">Auto-counted from active employees assigned to this Specific Area.</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-3">
            <div className="font-semibold text-black">Status and Remarks</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Status</label>
                <select
                  className={`${inputClass} bg-white`}
                  value={(contractForm.status || "ACTIVE").trim().toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE"}
                  onChange={(e) => setContractForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div className="hidden">
                <label className={labelClass}>Contract Start</label>
                <input type="date" className={inputClass} value={contractForm.contract_start} onChange={(e) => setContractForm((p) => ({ ...p, contract_start: e.target.value }))} />
              </div>
              <div className="hidden">
                <label className={labelClass}>Contract End</label>
                <input type="date" className={inputClass} value={contractForm.contract_end} onChange={(e) => setContractForm((p) => ({ ...p, contract_end: e.target.value }))} />
              </div>
              <div className="md:col-span-3">
                <label className={labelClass}>Remarks</label>
                <textarea className={inputClass} value={contractForm.remarks} onChange={(e) => setContractForm((p) => ({ ...p, remarks: e.target.value }))} rows={3} />
              </div>
            </div>
          </div>

          <div className="hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-black">Assign Employees (Applicants)</div>
              <div className="text-sm text-gray-500">Selected: {selectedApplicantIds.length}</div>
            </div>

            <input
              className={inputClass}
              placeholder="Search applicants..."
              value={applicantSearch}
              onChange={(e) => setApplicantSearch(e.target.value)}
            />

            {applicantsError ? (
              <div className="rounded-xl border bg-red-50 px-3 py-2 text-sm text-red-700">{applicantsError}</div>
            ) : null}

            <div className="max-h-56 overflow-auto rounded-xl border">
              {applicantsLoading ? (
                <div className="px-4 py-3">
                  <LoadingCircle label="Loading applicants..." sizeClassName="h-6 w-6" className="py-2" />
                </div>
              ) : filteredApplicants.length ? (
                filteredApplicants.map((a) => {
                  const id = a.applicant_id;
                  const checked = selectedApplicantIds.includes(id);
                  return (
                    <label key={id} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedApplicantIds((prev) =>
                            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                          );
                        }}
                      />
                      <div className="flex-1">
                        <div className="text-sm text-black font-medium">{formatApplicantName(a)}</div>
                        <div className="text-xs text-gray-500">{a.status || "—"}</div>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500">No applicants found.</div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingKey === "contract"}
              className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {savingKey === "contract" ? "Saving..." : editorMode === "edit" ? "Update Contract" : "Save Contract"}
            </button>
          </div>
        </form>
      </ModalShell>

      <TableZoomWrapper storageKey="client">
      <div className="relative overflow-x-auto rounded-2xl glass-panel animate-slide-up">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FFDA03]">
              {[
                "Contract Series",
                "Cluster",
                "Client Name",
                "Specific Area",
                "Project Name",
                "Contract Start",
                "Contract End",
                "Contracted Manpower",
                "No. Deployed Guards",
                "Status",
                "Remarks",
              ].map((label, idx, arr) => (
                <th
                  key={label}
                  className={`px-4 py-3 text-left font-semibold text-black whitespace-nowrap ${idx === 0 ? "rounded-l-xl" : ""} ${idx === arr.length - 1 ? "rounded-r-xl" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                  <LoadingCircle label="Loading contracts..." className="py-2" />
                </td>
              </tr>
            ) : paginated.length ? (
              paginated.map((row) => (
                <tr
                  key={row.contract_id}
                  onClick={() => void openDetails(row)}
                  className="animated-row border-b border-gray-100 transition hover:shadow-md cursor-pointer"
                >
                  <td className="px-4 py-3 rounded-l-xl">{fmt(row.contract_no)}</td>
                  <td className="px-4 py-3">{fmt(row.cluster)}</td>
                  <td className="px-4 py-3">{fmt(row.client_name)}</td>
                  <td className="px-4 py-3">{fmt(row.specific_area)}</td>
                  <td className="px-4 py-3">{fmt(row.project_name)}</td>
                  <td className="px-4 py-3">{fmt(row.contract_start)}</td>
                  <td className="px-4 py-3">{fmt(row.contract_end)}</td>
                  <td className="px-4 py-3">{fmt(row.contracted_manpower)}</td>
                  <td className="px-4 py-3">{fmt(row.deployed_guards)}</td>
                  <td className="px-4 py-3">{fmt(row.status)}</td>
                  <td className="px-4 py-3 rounded-r-xl">{fmt(row.remarks)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-500">No contracts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-between items-center text-sm">
        <span>Page {pageClamped} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            disabled={pageClamped === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded-lg disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={pageClamped === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded-lg disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
      </TableZoomWrapper>

      <ModalShell
        open={Boolean(detailsRow)}
        title="Contract Details"
        onClose={() => setDetailsRow(null)}
      >
        {detailsRow ? (
          <div className="space-y-4 text-sm text-black">
            <div className="flex justify-end">
              {isAdmin ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const row = detailsRow;
                      setDetailsRow(null);
                      if (row) void openEditModal(row);
                    }}
                    className="animated-btn rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
                  >
                    Edit Contract
                  </button>

                  <button
                    type="button"
                    onClick={() => void deleteContract(detailsRow.contract_id)}
                    disabled={savingKey === "delete-contract"}
                    className="animated-btn inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold text-red-600 bg-white disabled:opacity-60"
                    title="Delete contract"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              ) : null}
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Contract Series", value: fmt(detailsRow.contract_no) },
                  { label: "Cluster", value: fmt(detailsRow.cluster) },
                  { label: "Client Name", value: fmt(detailsRow.client_name) },
                  { label: "Specific Area", value: fmt(detailsRow.specific_area) },
                  { label: "Project Name", value: fmt(detailsRow.project_name) },
                  { label: "Contract Start", value: fmt(detailsRow.contract_start) },
                  { label: "Contract End", value: fmt(detailsRow.contract_end) },
                  { label: "Contracted Manpower", value: fmt(detailsRow.contracted_manpower) },
                  { label: "No. Deployed Guards", value: fmt(detailsRow.deployed_guards) },
                  { label: "Status", value: fmt(detailsRow.status) },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{item.label}</div>
                    <div className="mt-1 text-sm text-black truncate" title={item.value}>{item.value}</div>
                  </div>
                ))}
                <div className="md:col-span-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Remarks</div>
                  <div className="mt-1 text-sm text-black whitespace-pre-wrap break-words">{fmt(detailsRow.remarks)}</div>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-black">Connected Employees</div>
                <div className="text-xs text-gray-500">Click a name to open the employee details page.</div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Employees</div>
                  <div className="mt-2">
                    {detailsRow.employeeLinks.length ? (
                      <div className="flex flex-wrap gap-2">
                        {detailsRow.employeeLinks.map((employee) => (
                          <Link
                            key={employee.applicant_id}
                            href={`/Main_Modules/Employees/details/?id=${encodeURIComponent(employee.applicant_id)}&from=${encodeURIComponent("/Main_Modules/Client/")}`}
                            className="animated-btn inline-flex flex-col items-start rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                          >
                            <span>{employee.name}</span>
                            <span className="text-[11px] font-mono text-gray-500">
                              ID Number Employee: {formatEmployeeIdNumber(employee.applicant_id, employee.custom_id)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : detailsRow.employees.length ? (
                      <div className="text-sm text-gray-700">{detailsRow.employees.join(", ")}</div>
                    ) : (
                      <div className="text-sm text-gray-500">—</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </ModalShell>

      {addRecipientOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={resetRecipientForm}>
          <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
              <div>
                <div className="text-lg font-semibold text-black">Add contract recipient</div>
                <div className="text-sm text-gray-500">Add an inbox that should receive expiring contract reminders.</div>
              </div>
              <button type="button" onClick={resetRecipientForm} className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50">
                Close
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-black">Recipient email</span>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="name@example.com"
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-black">Notes</span>
                <textarea
                  rows={3}
                  value={recipientNotes}
                  onChange={(event) => setRecipientNotes(event.target.value)}
                  placeholder="Optional notes"
                  className={inputClass}
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">This list is used for every expiring Client contract.</div>
                <button
                  type="button"
                  onClick={() => void addContractRecipient()}
                  disabled={recipientSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:brightness-95"
                >
                  {recipientSaving ? "Saving..." : "Add recipient"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingRecipientId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeRecipientEditor}>
          <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
              <div>
                <div className="text-lg font-semibold text-black">Edit contract recipient</div>
                <div className="text-sm text-gray-500">Update the inbox, status, or notes for contract reminders.</div>
              </div>
              <button type="button" onClick={closeRecipientEditor} className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50">
                Close
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-black">Recipient email</span>
                <input
                  type="email"
                  value={editRecipientEmail}
                  onChange={(event) => setEditRecipientEmail(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-black">Notes</span>
                <textarea
                  rows={3}
                  value={editRecipientNotes}
                  onChange={(event) => setEditRecipientNotes(event.target.value)}
                  placeholder="Optional notes"
                  className={inputClass}
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-black">
                <input
                  type="checkbox"
                  checked={editRecipientActive}
                  onChange={(event) => setEditRecipientActive(event.target.checked)}
                />
                Active recipient
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveContractRecipient()}
                  disabled={recipientSaving}
                  className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:brightness-95"
                >
                  {recipientSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ImportSummaryModal
        open={importSummaryOpen}
        summary={importSummary}
        title="Client Import Summary"
        onClose={() => setImportSummaryOpen(false)}
      />
    </div>
  );
}
