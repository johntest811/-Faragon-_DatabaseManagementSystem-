"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import LoadingCircle from "@/app/Components/LoadingCircle";

type ClientRow = {
  contract_id: string;
  applicant_id: string | null;
  contract_no: string | null;
  start_date: string | null;
  end_date: string | null;
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
  start_date: string;
  end_date: string;
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
  start_date: "",
  end_date: "",
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

  const pageSize = 10;

  async function loadConnectedData() {
    setLoading(true);
    setError("");

    const wideSelect =
      "contract_id, applicant_id, contract_no, start_date, end_date, status, created_at, contract_no_date, cluster, client_name, specific_area, project_name, contract_start, contract_end, contracted_manpower, deployed_guards, remarks";

    const narrowSelect = "contract_id, applicant_id, contract_no, start_date, end_date, status, created_at";

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
        start_date: contract.start_date == null ? null : String(contract.start_date),
        end_date: contract.end_date == null ? null : String(contract.end_date),
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
      start_date: toNullableText(contractForm.start_date),
      end_date: toNullableText(contractForm.end_date),
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
      start_date: row.start_date ?? "",
      end_date: row.end_date ?? "",
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
          r.start_date,
          r.end_date,
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
        <div className="font-semibold text-black">Create Logistics Records</div>
        <div className="text-sm text-gray-500">Create a connected contracts record with full logistics fields.</div>
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
          Open Create Popup
        </button>
      </div>

      <ModalShell
        open={editorOpen}
        title={editorMode === "edit" ? "Edit Logistics Record" : "Create Logistics Records"}
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
                <label className={labelClass}>Start Date</label>
                <input type="date" className={inputClass} value={contractForm.start_date} onChange={(e) => setContractForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>End Date</label>
                <input type="date" className={inputClass} value={contractForm.end_date} onChange={(e) => setContractForm((p) => ({ ...p, end_date: e.target.value }))} />
              </div>
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
                "Start Date",
                "End Date",
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
                <td colSpan={15} className="px-4 py-8 text-center text-gray-500">
                  <LoadingCircle label="Loading contracts..." className="py-2" />
                </td>
              </tr>
            ) : paginated.length ? (
              paginated.map((row) => (
                <tr
                  key={row.contract_id}
                  onClick={() => setDetailsRow(row)}
                  className="bg-white shadow-sm transition hover:shadow-md cursor-pointer"
                >
                  <td className="px-4 py-3 rounded-l-xl">{fmt(row.contract_no)}</td>
                  <td className="px-4 py-3">{fmt(row.contract_no_date)}</td>
                  <td className="px-4 py-3">{fmt(row.client_name)}</td>
                  <td className="px-4 py-3">{fmt(row.project_name)}</td>
                  <td className="px-4 py-3">{fmt(row.specific_area)}</td>
                  <td className="px-4 py-3">{fmt(row.cluster)}</td>
                  <td className="px-4 py-3">{fmt(row.start_date)}</td>
                  <td className="px-4 py-3">{fmt(row.end_date)}</td>
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
                <td colSpan={15} className="px-4 py-8 text-center text-gray-500">No contracts found.</td>
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
        title="Logistics Record Details"
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
            <div className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><span className="text-gray-500">Contract No:</span> {fmt(detailsRow.contract_no)}</div>
              <div><span className="text-gray-500">Contract No Date:</span> {fmt(detailsRow.contract_no_date)}</div>
              <div><span className="text-gray-500">Client Name:</span> {fmt(detailsRow.client_name)}</div>
              <div><span className="text-gray-500">Project Name:</span> {fmt(detailsRow.project_name)}</div>
              <div><span className="text-gray-500">Specific Area:</span> {fmt(detailsRow.specific_area)}</div>
              <div><span className="text-gray-500">Cluster:</span> {fmt(detailsRow.cluster)}</div>
              <div><span className="text-gray-500">Start Date:</span> {fmt(detailsRow.start_date)}</div>
              <div><span className="text-gray-500">End Date:</span> {fmt(detailsRow.end_date)}</div>
              <div><span className="text-gray-500">Contract Start:</span> {fmt(detailsRow.contract_start)}</div>
              <div><span className="text-gray-500">Contract End:</span> {fmt(detailsRow.contract_end)}</div>
              <div><span className="text-gray-500">Contracted Manpower:</span> {fmt(detailsRow.contracted_manpower)}</div>
              <div><span className="text-gray-500">Deployed Guards:</span> {fmt(detailsRow.deployed_guards)}</div>
              <div><span className="text-gray-500">Status:</span> {fmt(detailsRow.status)}</div>
              <div><span className="text-gray-500">Created At:</span> {fmt(detailsRow.created_at)}</div>
              <div className="md:col-span-2"><span className="text-gray-500">Remarks:</span> {fmt(detailsRow.remarks)}</div>
            </div>

            <div className="rounded-2xl border p-4 space-y-2">
              <div className="font-semibold">Connected Employees</div>
              <div><span className="text-gray-500">Applicant ID:</span> {fmt(detailsRow.applicant_id)}</div>
              <div>
                <span className="text-gray-500">Employees:</span>{" "}
                {detailsRow.employeeLinks.length ? (
                  <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
                    {detailsRow.employeeLinks.map((employee) => (
                      <Link
                        key={employee.applicant_id}
                        href={`/Main_Modules/Employees/details/?id=${encodeURIComponent(employee.applicant_id)}&from=${encodeURIComponent("/Main_Modules/Client/")}`}
                        className="text-blue-700 hover:text-blue-800 underline"
                      >
                        {employee.name}
                      </Link>
                    ))}
                  </span>
                ) : detailsRow.employees.length ? (
                  detailsRow.employees.join(", ")
                ) : "—"}
              </div>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}
