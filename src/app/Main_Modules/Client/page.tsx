"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileDown, FileText, Search, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";

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
  contracted_manpower: number | null;
  deployed_guards: number | null;
  remarks: string | null;
  employees: string[];
  employeeLinks: Array<{ applicant_id: string; name: string }>;
};

type ApplicantOption = {
  applicant_id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  extn_name: string | null;
  status: string | null;
};

type SaveState = {
  type: "" | "success" | "error";
  message: string;
};

type ContractForm = {
  contract_no: string;
  contract_no_date: string;
  client_name: string;
  project_name: string;
  specific_area: string;
  cluster: string;
  contract_start: string;
  contract_end: string;
  contracted_manpower: string;
  deployed_guards: string;
  status: string;
  created_at: string;
  remarks: string;
};

const EMPTY_FORM: ContractForm = {
  contract_no: "",
  contract_no_date: "",
  client_name: "",
  project_name: "",
  specific_area: "",
  cluster: "",
  contract_start: "",
  contract_end: "",
  contracted_manpower: "",
  deployed_guards: "",
  status: "ACTIVE",
  created_at: "",
  remarks: "",
};

const inputClass = "w-full rounded-xl border px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-[#FFDA03]";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1";

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

function toNullableText(value: string) {
  const clean = value.trim();
  return clean.length ? clean : null;
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

function formatApplicantName(a: Partial<ApplicantOption> | null): string {
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

export default function ClientsPage() {
  const { role } = useAuthRole();
  const { allowedColumns, restricted, loading: loadingColumnAccess } = useMyColumnAccess("client");

  const isAdmin = role === "admin" || role === "superadmin";
  const canViewColumnPermission = (columnKey: string) => !restricted || allowedColumns.has(columnKey);
  const canImportFile = isAdmin && canViewColumnPermission("import_file");
  const canDownloadTemplate = isAdmin && canViewColumnPermission("export_template");
  const canExportFile = isAdmin && canViewColumnPermission("export_file");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ type: "", message: "" });

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created_at" | "contract_no" | "client_name">("created_at");
  const [page, setPage] = useState(1);

  const [contractForm, setContractForm] = useState<ContractForm>(EMPTY_FORM);

  const [applicants, setApplicants] = useState<ApplicantOption[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [applicantsError, setApplicantsError] = useState("");
  const [applicantSearch, setApplicantSearch] = useState("");
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [detailsRow, setDetailsRow] = useState<ClientRow | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
  const [importSummaryOpen, setImportSummaryOpen] = useState(false);

  const pageSize = 10;

  function downloadTemplate(format: "xlsx" | "csv") {
    const sample = {
      contract_no: "CN-2026-001",
      contract_no_date: "2026-02-01",
      client_name: "Sample Client",
      project_name: "Project Alpha",
      specific_area: "Area 1",
      cluster: "Cluster A",
      contract_start: "2026-02-01",
      contract_end: "2027-02-01",
      contracted_manpower: 10,
      deployed_guards: 8,
      status: "ACTIVE",
      created_at: "2026-02-01T08:00",
      remarks: "Optional notes",
    };
    const ws = XLSX.utils.json_to_sheet([sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ClientTemplate");

    if (format === "xlsx") {
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob("client_import_template.xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      return;
    }

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
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) throw new Error("No sheet found in selected file.");
      const ws = wb.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (!rawRows.length) throw new Error("The selected file has no data rows.");

      const rowErrors: string[] = [];
      let skipped = 0;

      const importedPayloads = rawRows
        .map((row, idx) => {
          const payload = {
            contract_no: toNullableText(findValueByAliases(row, ["contract_no", "contract number", "contractno", "contract"])),
            contract_no_date: toNullableText(findValueByAliases(row, ["contract_no_date", "contract no date", "contract date"])),
            client_name: toNullableText(findValueByAliases(row, ["client_name", "client", "customer"])),
            project_name: toNullableText(findValueByAliases(row, ["project_name", "project"])),
            specific_area: toNullableText(findValueByAliases(row, ["specific_area", "area", "specific area"])),
            cluster: toNullableText(findValueByAliases(row, ["cluster"])),
            contract_start: toNullableText(findValueByAliases(row, ["contract_start", "start", "start_date", "contract start"])),
            contract_end: toNullableText(findValueByAliases(row, ["contract_end", "end", "end_date", "contract end"])),
            contracted_manpower: toNumberOrNull(findValueByAliases(row, ["contracted_manpower", "manpower", "contracted manpower"])),
            deployed_guards: toNumberOrNull(findValueByAliases(row, ["deployed_guards", "deployed guards", "guards"])),
            status: toNullableText(findValueByAliases(row, ["status"])),
            created_at: toNullableText(findValueByAliases(row, ["created_at", "created at", "created"])),
            remarks: toNullableText(findValueByAliases(row, ["remarks", "note", "notes", "comment"])),
          };

          const hasIdentity = Boolean(payload.contract_no || payload.client_name || payload.project_name);
          if (!hasIdentity) {
            skipped += 1;
            rowErrors.push(`Row ${idx + 2}: Missing identity fields (contract_no/client_name/project_name).`);
          }
          return hasIdentity ? payload : null;
        })
        .filter((v): v is {
          contract_no: string | null;
          contract_no_date: string | null;
          client_name: string | null;
          project_name: string | null;
          specific_area: string | null;
          cluster: string | null;
          contract_start: string | null;
          contract_end: string | null;
          contracted_manpower: number | null;
          deployed_guards: number | null;
          status: string | null;
          created_at: string | null;
          remarks: string | null;
        } => Boolean(v));

      if (!importedPayloads.length) throw new Error("No valid rows found. Ensure file has identifiable contract/client columns.");

      const { data: existingRows, error: existingErr } = await supabase
        .from("contracts")
        .select("contract_id, contract_no, client_name, project_name, contract_start")
        .limit(10000);
      if (existingErr) throw existingErr;

      const byContractNo = new Map<string, string>();
      const byComposite = new Map<string, string>();
      for (const row of ((existingRows ?? []) as Array<Record<string, unknown>>)) {
        const id = String(row.contract_id ?? "");
        if (!id) continue;
        const contractNo = String(row.contract_no ?? "").trim().toLowerCase();
        if (contractNo) byContractNo.set(contractNo, id);
        const comp = [
          String(row.client_name ?? "").trim().toLowerCase(),
          String(row.project_name ?? "").trim().toLowerCase(),
          String(row.contract_start ?? "").trim().toLowerCase(),
        ].join("|");
        if (comp !== "||") byComposite.set(comp, id);
      }

      const dedupedMap = new Map<string, (typeof importedPayloads)[number]>();
      for (const payload of importedPayloads) {
        const cno = String(payload.contract_no ?? "").trim().toLowerCase();
        const comp = [
          String(payload.client_name ?? "").trim().toLowerCase(),
          String(payload.project_name ?? "").trim().toLowerCase(),
          String(payload.contract_start ?? "").trim().toLowerCase(),
        ].join("|");
        const key = cno ? `cno:${cno}` : `cmp:${comp}`;
        if (dedupedMap.has(key)) skipped += 1;
        dedupedMap.set(key, payload);
      }

      let inserted = 0;
      let updated = 0;

      for (const payload of dedupedMap.values()) {
        const cno = String(payload.contract_no ?? "").trim().toLowerCase();
        const comp = [
          String(payload.client_name ?? "").trim().toLowerCase(),
          String(payload.project_name ?? "").trim().toLowerCase(),
          String(payload.contract_start ?? "").trim().toLowerCase(),
        ].join("|");

        const matchId = (cno ? byContractNo.get(cno) : null) ?? byComposite.get(comp) ?? null;
        if (matchId) {
          const upd = await supabase.from("contracts").update(payload).eq("contract_id", matchId);
          if (upd.error) {
            skipped += 1;
            rowErrors.push(`Update failed for contract ${payload.contract_no ?? payload.client_name ?? "(unknown)"}: ${upd.error.message}`);
            continue;
          }
          updated += 1;
          continue;
        }

        const ins = await supabase.from("contracts").insert(payload);
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
    } catch (e: unknown) {
      setSaveState({ type: "error", message: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadConnectedData() {
    setLoading(true);
    setError("");

    const wideSelect =
      "contract_id, applicant_id, contract_no, status, created_at, contract_no_date, cluster, client_name, specific_area, project_name, contract_start, contract_end, contracted_manpower, deployed_guards, remarks";

    const narrowSelect = "contract_id, applicant_id, contract_no, status, created_at";

    const applicantNameSelect = "first_name, middle_name, last_name, extn_name";
    const directApplicantEmbed = `applicants!contracts_applicant_id_fkey(${applicantNameSelect})`;
    const joinEmployeesEmbed = `contract_employees(applicant_id, applicants!contract_employees_applicant_id_fkey(${applicantNameSelect}))`;

    const joinEmployeesEmbedRelaxed = `contract_employees(applicant_id, applicants(${applicantNameSelect}))`;

    const selectShapes = [
      `${wideSelect}, ${directApplicantEmbed}, ${joinEmployeesEmbed}`,
      `${wideSelect}, ${joinEmployeesEmbed}`,
      `${wideSelect}, ${joinEmployeesEmbedRelaxed}`,
      `${wideSelect}`,
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

    const merged: ClientRow[] = ((data ?? []) as Record<string, unknown>[]).map((contract) => {
      const contractApplicantId = contract.applicant_id == null ? null : String(contract.applicant_id);
      const directApplicant = firstOrNull(
        contract.applicants as
          | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }
          | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }[]
          | null
      );

      const joinRows = (contract.contract_employees as Record<string, unknown>[] | null | undefined) ?? [];
      const joinEmployeeLinks = joinRows
        .map((jr) => {
          const applicantId = jr.applicant_id == null ? null : String(jr.applicant_id);
          const applicant = firstOrNull(
            jr.applicants as
              | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }
              | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }[]
              | null
          );
          const name = formatApplicantName({
            first_name: applicant?.first_name == null ? null : String(applicant.first_name),
            middle_name: applicant?.middle_name == null ? null : String(applicant.middle_name),
            last_name: applicant?.last_name == null ? null : String(applicant.last_name),
            extn_name: applicant?.extn_name == null ? null : String(applicant.extn_name),
          });
          if (!applicantId || !name || name === "—") return null;
          return { applicant_id: applicantId, name };
        })
        .filter((v): v is { applicant_id: string; name: string } => Boolean(v));

      const directName = directApplicant
        ? formatApplicantName({
            first_name: directApplicant.first_name == null ? null : String(directApplicant.first_name),
            middle_name: directApplicant.middle_name == null ? null : String(directApplicant.middle_name),
            last_name: directApplicant.last_name == null ? null : String(directApplicant.last_name),
            extn_name: directApplicant.extn_name == null ? null : String(directApplicant.extn_name),
          })
        : null;

        const employeeLinksMap = new Map<string, { applicant_id: string; name: string }>();
        for (const link of joinEmployeeLinks) {
          if (!employeeLinksMap.has(link.applicant_id)) employeeLinksMap.set(link.applicant_id, link);
        }
        if (contractApplicantId && directName && directName !== "—" && !employeeLinksMap.has(contractApplicantId)) {
          employeeLinksMap.set(contractApplicantId, { applicant_id: contractApplicantId, name: directName });
        }
        const employeeLinks = Array.from(employeeLinksMap.values());

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
        contracted_manpower:
          contract.contracted_manpower == null || contract.contracted_manpower === ""
            ? null
            : Number(contract.contracted_manpower),
        deployed_guards:
          contract.deployed_guards == null || contract.deployed_guards === ""
            ? null
            : Number(contract.deployed_guards),
        remarks: contract.remarks == null ? null : String(contract.remarks),
        employees: uniqueNames,
        employeeLinks,
      };
    });

    setRows(merged);
    setLoading(false);
  }

  async function loadApplicants() {
    setApplicantsLoading(true);
    setApplicantsError("");

    const all: ApplicantOption[] = [];
    const pageSizeInternal = 1000;
    const maxRows = 200000;
    let offset = 0;

    while (true) {
      const res = await supabase
        .from("applicants")
        .select("applicant_id, first_name, middle_name, last_name, extn_name, status")
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .order("last_name", { ascending: true })
        .range(offset, offset + pageSizeInternal - 1);

      if (res.error) {
        setApplicants([]);
        setApplicantsError(res.error.message || "Failed to load applicants");
        setApplicantsLoading(false);
        return;
      }

      const batch = (res.data ?? []).map((a) => ({
        applicant_id: String(a.applicant_id),
        first_name: a.first_name == null ? null : String(a.first_name),
        middle_name: a.middle_name == null ? null : String(a.middle_name),
        last_name: a.last_name == null ? null : String(a.last_name),
        extn_name: a.extn_name == null ? null : String(a.extn_name),
        status: a.status == null ? null : String(a.status),
      }));

      all.push(...batch);
      offset += batch.length;
      if (batch.length < pageSizeInternal) break;
      if (offset >= maxRows) break;
    }

    setApplicants(all);
    setApplicantsLoading(false);
  }

  async function submitContract(e: FormEvent) {
    e.preventDefault();
    setSavingKey("contract");
    setSaveState({ type: "", message: "" });

    const firstApplicantId = selectedApplicantIds[0] ?? null;

    const insertPayload = {
      applicant_id: firstApplicantId,
      contract_no: toNullableText(contractForm.contract_no),
      contract_no_date: toNullableText(contractForm.contract_no_date),
      client_name: toNullableText(contractForm.client_name),
      project_name: toNullableText(contractForm.project_name),
      specific_area: toNullableText(contractForm.specific_area),
      cluster: toNullableText(contractForm.cluster),
      contract_start: toNullableText(contractForm.contract_start),
      contract_end: toNullableText(contractForm.contract_end),
      contracted_manpower: toNumberOrNull(contractForm.contracted_manpower),
      deployed_guards: toNumberOrNull(contractForm.deployed_guards),
      status: toNullableText(contractForm.status) || "ACTIVE",
      created_at: toNullableText(contractForm.created_at),
      remarks: toNullableText(contractForm.remarks),
    };

    if (editorMode === "edit") {
      if (!editingContractId) {
        setSaveState({ type: "error", message: "Missing contract ID for edit." });
        setSavingKey(null);
        return;
      }

      const updRes = await supabase
        .from("contracts")
        .update(insertPayload)
        .eq("contract_id", editingContractId);

      if (updRes.error) {
        setSaveState({ type: "error", message: `Contract update failed: ${updRes.error.message}` });
        setSavingKey(null);
        return;
      }

      const delJoinRes = await supabase.from("contract_employees").delete().eq("contract_id", editingContractId);
      if (delJoinRes.error) {
        setSaveState({ type: "error", message: `Contract updated, but employee links cleanup failed: ${delJoinRes.error.message}` });
        await loadConnectedData();
        setSavingKey(null);
        return;
      }

      if (selectedApplicantIds.length) {
        const joinRes = await supabase.from("contract_employees").insert(
          selectedApplicantIds.map((applicant_id) => ({
            contract_id: editingContractId,
            applicant_id,
          }))
        );

        if (joinRes.error) {
          setSaveState({
            type: "error",
            message:
              `Contract updated, but assigning employees failed: ${joinRes.error.message}. ` +
              `If you haven't run the migration yet, run supabase_add_contract_employees.sql in Supabase.`,
          });
          await loadConnectedData();
          setSavingKey(null);
          return;
        }
      }

      setSaveState({ type: "success", message: "Contract updated." });
    } else {
      const insertRes = await supabase
        .from("contracts")
        .insert([insertPayload])
        .select("contract_id")
        .single();

      if (insertRes.error) {
        setSaveState({ type: "error", message: `Contracts insert failed: ${insertRes.error.message}` });
        setSavingKey(null);
        return;
      }

      const createdContractId = insertRes.data?.contract_id ? String(insertRes.data.contract_id) : null;
      if (createdContractId && selectedApplicantIds.length) {
        const joinRes = await supabase.from("contract_employees").insert(
          selectedApplicantIds.map((applicant_id) => ({
            contract_id: createdContractId,
            applicant_id,
          }))
        );

        if (joinRes.error) {
          setSaveState({
            type: "error",
            message:
              `Contract saved, but assigning employees failed: ${joinRes.error.message}. ` +
              `If you haven't run the migration yet, run supabase_add_contract_employees.sql in Supabase.`,
          });
          await loadConnectedData();
          setSavingKey(null);
          return;
        }
      }

      setSaveState({ type: "success", message: "Contract saved." });
    }

    setContractForm(EMPTY_FORM);
    setSelectedApplicantIds([]);
    setApplicantSearch("");
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
      contract_no_date: row.contract_no_date ?? "",
      client_name: row.client_name ?? "",
      project_name: row.project_name ?? "",
      specific_area: row.specific_area ?? "",
      cluster: row.cluster ?? "",
      contract_start: row.contract_start ?? "",
      contract_end: row.contract_end ?? "",
      contracted_manpower: row.contracted_manpower == null ? "" : String(row.contracted_manpower),
      deployed_guards: row.deployed_guards == null ? "" : String(row.deployed_guards),
      status: row.status ?? "ACTIVE",
      created_at: toDatetimeLocalValue(row.created_at),
      remarks: row.remarks ?? "",
    });
    setApplicantSearch("");
    setEditorOpen(true);

    const joinRes = await supabase.from("contract_employees").select("applicant_id").eq("contract_id", row.contract_id);
    if (joinRes.error) {
      setSelectedApplicantIds(row.applicant_id ? [row.applicant_id] : []);
      setSaveState({ type: "error", message: `Loaded contract, but failed to load linked employees: ${joinRes.error.message}` });
      return;
    }

    const joinIds = ((joinRes.data ?? []) as Array<{ applicant_id: string | null }>)
      .map((r) => (r.applicant_id == null ? null : String(r.applicant_id)))
      .filter((v): v is string => Boolean(v));
    const base = row.applicant_id ? [row.applicant_id] : [];
    setSelectedApplicantIds(Array.from(new Set([...base, ...joinIds])));
  }

  async function openDetails(row: ClientRow) {
    setDetailsRow(row);

    const contractId = row.contract_id;
    const idSet = new Set<string>();
    if (row.applicant_id) idSet.add(row.applicant_id);
    for (const link of row.employeeLinks) {
      if (link.applicant_id) idSet.add(link.applicant_id);
    }

    try {
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
        .select("applicant_id, first_name, middle_name, last_name, extn_name")
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
          return { applicant_id: applicantId, name };
        })
        .filter((v): v is { applicant_id: string; name: string } => Boolean(v))
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
      .on("postgres_changes", { event: "*", schema: "public", table: "contract_employees" }, loadConnectedData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!editorOpen) return;
    void loadApplicants();
  }, [editorOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;

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
  }, [rows, search, sortBy]);

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
      "Contract No.": fmt(r.contract_no),
      "Contract No Date": fmt(r.contract_no_date),
      "Client Name": fmt(r.client_name),
      "Project Name": fmt(r.project_name),
      "Specific Area": fmt(r.specific_area),
      Cluster: fmt(r.cluster),
      "Contract Start": fmt(r.contract_start),
      "Contract End": fmt(r.contract_end),
      "Contracted Manpower": fmt(r.contracted_manpower),
      "Deployed Guards": fmt(r.deployed_guards),
      Status: fmt(r.status),
      "Created At": fmt(r.created_at),
      Remarks: fmt(r.remarks),
    }));
  }

  function clientExportFileBase() {
    return `client_export_${new Date().toISOString().slice(0, 10)}`;
  }

  function exportClientXlsx() {
    const rowsForExport = clientExportRows();
    if (!rowsForExport.length) {
      setSaveState({ type: "error", message: "No rows available for export." });
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rowsForExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Client");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
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

    const ws = XLSX.utils.json_to_sheet(rowsForExport);
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(`${clientExportFileBase()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  function exportClientPdf() {
    const rowsForExport = clientExportRows();
    if (!rowsForExport.length) {
      setSaveState({ type: "error", message: "No rows available for export." });
      return;
    }

    const headers = Object.keys(rowsForExport[0]);
    const body = rowsForExport.map((row) => headers.map((h) => String(row[h as keyof typeof row] ?? "")));

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Client Export", 40, 40);
    autoTable(doc, {
      startY: 60,
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
            <option value="contract_no">Contract No</option>
            <option value="client_name">Client Name</option>
          </select>
        </div>
      </div>

      {saveState.message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            saveState.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {saveState.message}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold text-black">Create Contracts</div>
        <div className="text-sm text-gray-500">Create a connected contract record with full fields.</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setEditorMode("create");
              setEditingContractId(null);
              setContractForm(EMPTY_FORM);
              setSelectedApplicantIds([]);
              setApplicantSearch("");
              setEditorOpen(true);
            }}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
          >
            Create Contract
          </button>

          {canImportFile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || loadingColumnAccess}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-gray-50 disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              {importing ? "Importing..." : "Import Excel/CSV"}
            </button>
          ) : null}

          {canExportFile ? (
            <>
              <button
                type="button"
                onClick={exportClientPdf}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
              >
                <FileText className="w-4 h-4" />
                Export PDF
              </button>
              <button
                type="button"
                onClick={exportClientXlsx}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
              >
                <FileDown className="w-4 h-4" />
                Export XLSX
              </button>
              <button
                type="button"
                onClick={exportClientCsv}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
              >
                <FileDown className="w-4 h-4" />
                Export CSV
              </button>
            </>
          ) : null}

          {canDownloadTemplate ? (
            <>
              <button
                type="button"
                onClick={() => downloadTemplate("xlsx")}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                Template XLSX
              </button>
              <button
                type="button"
                onClick={() => downloadTemplate("csv")}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                Template CSV
              </button>
            </>
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

      <ModalShell
        open={editorOpen}
        title={editorMode === "edit" ? "Edit Contract" : "Create Contract"}
        onClose={() => {
          setEditorOpen(false);
          setEditorMode("create");
          setEditingContractId(null);
        }}
      >
        <form onSubmit={submitContract} className="space-y-4">
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="font-semibold text-black">Contract Information</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Contract No.</label>
                <input className={inputClass} value={contractForm.contract_no} onChange={(e) => setContractForm((p) => ({ ...p, contract_no: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Contract No Date</label>
                <input type="date" className={inputClass} value={contractForm.contract_no_date} onChange={(e) => setContractForm((p) => ({ ...p, contract_no_date: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <input className={inputClass} value={contractForm.status} onChange={(e) => setContractForm((p) => ({ ...p, status: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Client Name</label>
                <input className={inputClass} value={contractForm.client_name} onChange={(e) => setContractForm((p) => ({ ...p, client_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Project Name</label>
                <input className={inputClass} value={contractForm.project_name} onChange={(e) => setContractForm((p) => ({ ...p, project_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Specific Area</label>
                <input className={inputClass} value={contractForm.specific_area} onChange={(e) => setContractForm((p) => ({ ...p, specific_area: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Cluster</label>
                <input className={inputClass} value={contractForm.cluster} onChange={(e) => setContractForm((p) => ({ ...p, cluster: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Contracted Manpower</label>
                <input type="number" className={inputClass} value={contractForm.contracted_manpower} onChange={(e) => setContractForm((p) => ({ ...p, contracted_manpower: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Deployed Guards</label>
                <input type="number" className={inputClass} value={contractForm.deployed_guards} onChange={(e) => setContractForm((p) => ({ ...p, deployed_guards: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-3">
            <div className="font-semibold text-black">Date Fields</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Created At</label>
                <input type="datetime-local" className={inputClass} value={contractForm.created_at} onChange={(e) => setContractForm((p) => ({ ...p, created_at: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Contract Start</label>
                <input type="date" className={inputClass} value={contractForm.contract_start} onChange={(e) => setContractForm((p) => ({ ...p, contract_start: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Contract End</label>
                <input type="date" className={inputClass} value={contractForm.contract_end} onChange={(e) => setContractForm((p) => ({ ...p, contract_end: e.target.value }))} />
              </div>
              <div className="md:col-span-3">
                <label className={labelClass}>Remarks</label>
                <textarea className={inputClass} value={contractForm.remarks} onChange={(e) => setContractForm((p) => ({ ...p, remarks: e.target.value }))} rows={3} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-3">
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

      {error ? <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="relative overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm text-black border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#FFDA03]">
              {[
                "Contract No.",
                "Contract No Date",
                "Client Name",
                "Project Name",
                "Specific Area",
                "Cluster",
                "Contract Start",
                "Contract End",
                "Contracted Manpower",
                "Deployed Guards",
                "Status",
                "Created At",
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
                <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                  <LoadingCircle label="Loading contracts..." className="py-2" />
                </td>
              </tr>
            ) : paginated.length ? (
              paginated.map((row) => (
                <tr
                  key={row.contract_id}
                  onClick={() => void openDetails(row)}
                  className="bg-white shadow-sm transition hover:shadow-md cursor-pointer"
                >
                  <td className="px-4 py-3 rounded-l-xl">{fmt(row.contract_no)}</td>
                  <td className="px-4 py-3">{fmt(row.contract_no_date)}</td>
                  <td className="px-4 py-3">{fmt(row.client_name)}</td>
                  <td className="px-4 py-3">{fmt(row.project_name)}</td>
                  <td className="px-4 py-3">{fmt(row.specific_area)}</td>
                  <td className="px-4 py-3">{fmt(row.cluster)}</td>
                  <td className="px-4 py-3">{fmt(row.contract_start)}</td>
                  <td className="px-4 py-3">{fmt(row.contract_end)}</td>
                  <td className="px-4 py-3">{fmt(row.contracted_manpower)}</td>
                  <td className="px-4 py-3">{fmt(row.deployed_guards)}</td>
                  <td className="px-4 py-3">{fmt(row.status)}</td>
                  <td className="px-4 py-3">{fmt(row.created_at)}</td>
                  <td className="px-4 py-3 rounded-r-xl">{fmt(row.remarks)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-gray-500">No contracts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm">
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

      <ModalShell
        open={Boolean(detailsRow)}
        title="Contract Details"
        onClose={() => setDetailsRow(null)}
      >
        {detailsRow ? (
          <div className="space-y-4 text-sm text-black">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const row = detailsRow;
                  setDetailsRow(null);
                  if (row) void openEditModal(row);
                }}
                className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
              >
                Edit Contract
              </button>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Contract No", value: fmt(detailsRow.contract_no) },
                  { label: "Contract No Date", value: fmt(detailsRow.contract_no_date) },
                  { label: "Client Name", value: fmt(detailsRow.client_name) },
                  { label: "Project Name", value: fmt(detailsRow.project_name) },
                  { label: "Specific Area", value: fmt(detailsRow.specific_area) },
                  { label: "Cluster", value: fmt(detailsRow.cluster) },
                  { label: "Contract Start", value: fmt(detailsRow.contract_start) },
                  { label: "Contract End", value: fmt(detailsRow.contract_end) },
                  { label: "Contracted Manpower", value: fmt(detailsRow.contracted_manpower) },
                  { label: "Deployed Guards", value: fmt(detailsRow.deployed_guards) },
                  { label: "Status", value: fmt(detailsRow.status) },
                  { label: "Created At", value: fmt(detailsRow.created_at) },
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

            <div className="rounded-2xl border bg-white p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-black">Connected Employees</div>
                <div className="text-xs text-gray-500">Click a name to open the employee details page.</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Applicant ID</div>
                  <div className="mt-1 text-sm text-black font-mono break-all">{fmt(detailsRow.applicant_id)}</div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Employees</div>
                  <div className="mt-2">
                    {detailsRow.employeeLinks.length ? (
                      <div className="flex flex-wrap gap-2">
                        {detailsRow.employeeLinks.map((employee) => (
                          <Link
                            key={employee.applicant_id}
                            href={`/Main_Modules/Employees/details/?id=${encodeURIComponent(employee.applicant_id)}&from=${encodeURIComponent("/Main_Modules/Client/")}`}
                            className="inline-flex items-center rounded-full border bg-white px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                          >
                            {employee.name}
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

      <ImportSummaryModal
        open={importSummaryOpen}
        summary={importSummary}
        title="Client Import Summary"
        onClose={() => setImportSummaryOpen(false)}
      />
    </div>
  );
}
