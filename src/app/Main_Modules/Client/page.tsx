"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";

type ClientRow = {
  contract_id: string;
  contract_no: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  employees: string[];
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
        className="w-full max-w-4xl bg-white rounded-3xl border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-black">{title}</div>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-black text-sm">
            Close
          </button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

function toNullableText(value: string) {
  const clean = value.trim();
  return clean.length ? clean : null;
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

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ type: "", message: "" });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [contractForm, setContractForm] = useState({
    contract_no: "",
    start_date: "",
    end_date: "",
    status: "ACTIVE",
  });

  const [applicants, setApplicants] = useState<ApplicantOption[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [applicantsError, setApplicantsError] = useState("");
  const [applicantSearch, setApplicantSearch] = useState("");
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const pageSize = 10;

  async function loadConnectedData() {
    setLoading(true);
    setError("");

    const withEmployeesRes = await supabase
      .from("contracts")
      .select(
        "contract_id, contract_no, start_date, end_date, status, created_at, applicant_id, applicants(first_name, middle_name, last_name, extn_name), contract_employees(applicant_id, applicants(first_name, middle_name, last_name, extn_name))"
      )
      .order("created_at", { ascending: false })
      .limit(2000);

    let data = withEmployeesRes.data as unknown;
    let loadError = withEmployeesRes.error;

    if (loadError) {
      const fallbackRes = await supabase
        .from("contracts")
        .select(
          "contract_id, contract_no, start_date, end_date, status, created_at, applicant_id, applicants(first_name, middle_name, last_name, extn_name)"
        )
        .order("created_at", { ascending: false })
        .limit(2000);

      data = fallbackRes.data as unknown;
      loadError = fallbackRes.error;
    }

    if (loadError) {
      setLoading(false);
      setError(loadError.message || "Failed to load contracts");
      setRows([]);
      return;
    }

    const merged: ClientRow[] = ((data ?? []) as Record<string, unknown>[]).map((contract) => {
      const directApplicant = firstOrNull(
        contract.applicants as
          | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }
          | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }[]
          | null
      );

      const joinRows = (contract.contract_employees as Record<string, unknown>[] | null | undefined) ?? [];
      const joinNames = joinRows
        .map((jr) =>
          firstOrNull(
            jr.applicants as
              | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }
              | { first_name?: unknown; middle_name?: unknown; last_name?: unknown; extn_name?: unknown }[]
              | null
          )
        )
        .filter(Boolean)
        .map((a) =>
          formatApplicantName({
            first_name: a?.first_name == null ? null : String(a.first_name),
            middle_name: a?.middle_name == null ? null : String(a.middle_name),
            last_name: a?.last_name == null ? null : String(a.last_name),
            extn_name: a?.extn_name == null ? null : String(a.extn_name),
          })
        );

      const directName = directApplicant
        ? formatApplicantName({
            first_name: directApplicant.first_name == null ? null : String(directApplicant.first_name),
            middle_name: directApplicant.middle_name == null ? null : String(directApplicant.middle_name),
            last_name: directApplicant.last_name == null ? null : String(directApplicant.last_name),
            extn_name: directApplicant.extn_name == null ? null : String(directApplicant.extn_name),
          })
        : null;

      const allNames = [directName, ...joinNames].filter((n): n is string => Boolean(n && n !== "—"));
      const uniqueNames = Array.from(new Set(allNames));

      return {
        contract_id: String(contract.contract_id),
        contract_no: contract.contract_no == null ? null : String(contract.contract_no),
        start_date: contract.start_date == null ? null : String(contract.start_date),
        end_date: contract.end_date == null ? null : String(contract.end_date),
        status: contract.status == null ? null : String(contract.status),
        employees: uniqueNames,
      };
    });

    setRows(merged);
    setLoading(false);
  }

  async function loadApplicants() {
    setApplicantsLoading(true);
    setApplicantsError("");

    const all: ApplicantOption[] = [];
    const pageSize = 1000;
    const maxRows = 200000;
    let offset = 0;

    while (true) {
      const res = await supabase
        .from("applicants")
        .select("applicant_id, first_name, middle_name, last_name, extn_name, status")
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .order("last_name", { ascending: true })
        .range(offset, offset + pageSize - 1);

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
      if (batch.length < pageSize) break;
      if (offset >= maxRows) break;
    }

    setApplicants(all);
    setApplicantsLoading(false);
  }

  async function submitContract(e: FormEvent) {
    e.preventDefault();
    setSavingKey("contract");
    setSaveState({ type: "", message: "" });

    const insertRes = await supabase
      .from("contracts")
      .insert([
        {
          contract_no: toNullableText(contractForm.contract_no),
          start_date: toNullableText(contractForm.start_date),
          end_date: toNullableText(contractForm.end_date),
          status: toNullableText(contractForm.status) || "ACTIVE",
        },
      ])
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

    setContractForm({
      contract_no: "",
      start_date: "",
      end_date: "",
      status: "ACTIVE",
    });
    setSelectedApplicantIds([]);
    setApplicantSearch("");
    setSaveState({ type: "success", message: "Contract saved." });
    await loadConnectedData();
    setSavingKey(null);
  }

  useEffect(() => {
    loadConnectedData();
    const channel = supabase
      .channel("realtime:client-connected-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, loadConnectedData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!createModalOpen) return;
    void loadApplicants();
  }, [createModalOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

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
    <section className="bg-white rounded-3xl border p-6 space-y-5">
      <div>
        <div className="text-lg font-semibold text-black">Logistics • Client Connections</div>
        <div className="text-sm text-gray-500 mt-1">
          Connected to Contracts table.
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

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="font-semibold text-black">Create Logistics Records</div>
        <div className="text-sm text-gray-500">Create a Contracts record.</div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
        >
          Open Create Popup
        </button>
      </div>

      <ModalShell open={createModalOpen} title="Create Logistics Records" onClose={() => setCreateModalOpen(false)}>
        <form onSubmit={submitContract} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Contract No.</label>
              <input
                className={inputClass}
                placeholder="contract_no"
                value={contractForm.contract_no}
                onChange={(e) => setContractForm((prev) => ({ ...prev, contract_no: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input
                type="date"
                className={inputClass}
                value={contractForm.start_date}
                onChange={(e) => setContractForm((prev) => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>End Date</label>
            <input
              type="date"
              className={inputClass}
              value={contractForm.end_date}
              onChange={(e) => setContractForm((prev) => ({ ...prev, end_date: e.target.value }))}
            />
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <input
              className={inputClass}
              placeholder="status"
              value={contractForm.status}
              onChange={(e) => setContractForm((prev) => ({ ...prev, status: e.target.value }))}
            />
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
                <div className="px-4 py-3 text-sm text-gray-500">Loading applicants...</div>
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

          <button
            type="submit"
            disabled={savingKey === "contract"}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {savingKey === "contract" ? "Saving..." : "Save Contract"}
          </button>
        </form>
      </ModalShell>

      <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl w-full">
        <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
          <Search className="w-5 h-5 text-black" />
        </div>
        <input
          placeholder="Search contracts..."
          className="flex-1 outline-none text-sm text-black placeholder:text-gray-400"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error ? <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="relative overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm text-black">
          <thead className="bg-gray-100 border-b">
            <tr>
              {[
                "Contract No.",
                "Start Date",
                "End Date",
                "Status",
                "Employees",
              ].map((label) => (
                <th key={label} className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">{label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading contracts...</td>
              </tr>
            ) : paginated.length ? (
              paginated.map((row) => (
                <tr key={row.contract_id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{row.contract_no || "—"}</td>
                  <td className="px-4 py-3">{row.start_date || "—"}</td>
                  <td className="px-4 py-3">{row.end_date || "—"}</td>
                  <td className="px-4 py-3">{row.status || "UNKNOWN"}</td>
                  <td className="px-4 py-3">{row.employees.length ? row.employees.join(", ") : "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No contracts found.</td>
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
    </section>
  );
}

