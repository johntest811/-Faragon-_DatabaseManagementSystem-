"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Pencil, Search, SlidersHorizontal, Table } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole, useMyModuleAccess, useMyModuleDeleteAccess } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";
import LoadingCircle from "../../Components/LoadingCircle";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import DetachmentHistoryPopover from "../Components/DetachmentHistoryPopover";
import EmployeeStatusMenu from "../Components/EmployeeStatusMenu";
import { buildEmployeeStatusUpdatePatch } from "../employeeListData";

type Applicant = {
  applicant_id: string;
  created_at: string;
  custom_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  client_position: string | null;
  date_hired_fsai: string | null;
  detachment: string | null;
  status: string | null;
  gender: string | null;
  client_contact_num: string | null;
  client_email: string | null;
  profile_image_path: string | null;
  is_archived: boolean | null;
  is_trashed: boolean | null;
};

function fullName(employee: Applicant) {
  const parts = [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "(No name)";
}

function employeeCode(employee: Applicant) {
  return employee.custom_id?.trim() || `EMP-${employee.applicant_id.slice(0, 8).toUpperCase()}`;
}

function profileUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from("applicants").getPublicUrl(path).data.publicUrl || null;
}

function displayDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function FloatingPage() {
  const router = useRouter();
  const { role } = useAuthRole();
  const { canAccess } = useMyModuleAccess("floating");
  const { canDelete } = useMyModuleDeleteAccess("floating");
  const [employees, setEmployees] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "detachment">("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detachmentFilter, setDetachmentFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [editorApplicantId, setEditorApplicantId] = useState<string | null>(null);
  const fetchRunRef = useRef(0);

  const fetchEmployees = useCallback(async () => {
    const runId = ++fetchRunRef.current;
    setLoading(true);
    setError("");
    const result = await supabase
      .from("applicants")
      .select(
        "applicant_id, created_at, custom_id, first_name, middle_name, last_name, client_position, date_hired_fsai, detachment, status, gender, client_contact_num, client_email, profile_image_path, is_archived, is_trashed"
      )
      .eq("is_archived", false)
      .eq("is_trashed", false)
      .eq("status", "FLOATING")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (fetchRunRef.current !== runId) return;
    if (result.error) {
      setEmployees([]);
      setError(result.error.message || "Failed to load Floating employees.");
    } else {
      setEmployees((result.data as Applicant[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("floating:viewMode:v1");
      if (saved === "grid" || saved === "table") setViewMode(saved);
    } catch {
      // Use the table default when browser storage is unavailable.
    }

    void fetchEmployees();
    const channel = supabase
      .channel("realtime:applicants-floating")
      .on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => void fetchEmployees())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchEmployees]);

  useEffect(() => {
    try {
      localStorage.setItem("floating:viewMode:v1", viewMode);
    } catch {
      // Ignore browser storage failures.
    }
  }, [viewMode]);

  const filterOptions = useMemo(() => {
    const detachments = new Set<string>();
    const positions = new Set<string>();
    for (const employee of employees) {
      if (employee.detachment?.trim()) detachments.add(employee.detachment.trim());
      if (employee.client_position?.trim()) positions.add(employee.client_position.trim());
    }
    return {
      detachments: Array.from(detachments).sort((a, b) => a.localeCompare(b)),
      positions: Array.from(positions).sort((a, b) => a.localeCompare(b)),
    };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = employees.filter((employee) => {
      if (detachmentFilter !== "ALL" && employee.detachment !== detachmentFilter) return false;
      if (positionFilter !== "ALL" && employee.client_position !== positionFilter) return false;
      if (!query) return true;
      return [fullName(employee), employeeCode(employee), employee.client_position, employee.detachment, employee.client_email]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(query));
    });

    return [...rows].sort((a, b) => {
      if (sortBy === "newest") return String(b.created_at).localeCompare(String(a.created_at));
      if (sortBy === "detachment") return String(a.detachment ?? "").localeCompare(String(b.detachment ?? ""));
      return fullName(a).localeCompare(fullName(b));
    });
  }, [detachmentFilter, employees, positionFilter, search, sortBy]);

  async function updateStatus(employee: Applicant, status: string) {
    setError("");
    const result = await supabase
      .from("applicants")
      .update(buildEmployeeStatusUpdatePatch(status))
      .eq("applicant_id", employee.applicant_id);
    if (result.error) {
      setError(result.error.message || "Failed to update employee status.");
      return;
    }
    await fetchEmployees();
  }

  async function deleteEmployee(employee: Applicant) {
    if (!canDelete) {
      setError("Delete access is restricted.");
      return;
    }
    if (!window.confirm(`Delete ${fullName(employee)}? This will move the employee to trash.`)) return;
    const result = await supabase
      .from("applicants")
      .update({ is_trashed: true, trashed_at: new Date().toISOString(), trashed_by: null })
      .eq("applicant_id", employee.applicant_id);
    if (result.error) {
      setError(result.error.message || "Failed to delete employee.");
      return;
    }
    await fetchEmployees();
  }

  if (!canAccess) {
    return (
      <section className="glass-panel animate-fade-in rounded-3xl p-6 space-y-3">
        <div className="text-lg font-semibold text-black">Floating</div>
        <div className="text-sm text-gray-600">You do not have access to view this page.</div>
        <button
          type="button"
          onClick={() => router.push("/Main_Modules/Requests/?module=floating")}
          className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
        >
          Request Access
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-[360px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search floating employees"
              className="w-full rounded-full border bg-white py-2 pl-10 pr-4 shadow-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white"
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-5 w-5 text-gray-700" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-gray-500">Sort By:</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            className="rounded-full border bg-white px-4 py-2 font-medium text-black"
          >
            <option value="name">Name</option>
            <option value="newest">Newest Date</option>
            <option value="detachment">Detachment</option>
          </select>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${viewMode === "grid" ? "bg-[#FFDA03]" : "bg-white"}`}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${viewMode === "table" ? "bg-[#FFDA03]" : "bg-white"}`}
            aria-label="Table view"
          >
            <Table className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="glass-panel rounded-2xl p-8"><LoadingCircle label="Loading floating employees..." /></div>
      ) : filteredEmployees.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-gray-500">No employees in Floating.</div>
      ) : viewMode === "table" ? (
        <TableZoomWrapper storageKey="floating">
          <div className="overflow-x-auto rounded-2xl glass-panel animate-slide-up">
            <table className="min-w-[1050px] w-full text-sm text-black">
              <thead className="sticky top-0 z-10 bg-[#FFDA03]">
                <tr>
                  <th className="px-4 py-3 text-left">Photo</th>
                  <th className="px-4 py-3 text-left">ID Number Employee</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Position</th>
                  <th className="px-4 py-3 text-left">Detachment</th>
                  <th className="px-4 py-3 text-left">Date Hired</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  {role !== "employee" ? <th className="px-4 py-3 text-center">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(employee.applicant_id)}&from=${encodeURIComponent("/Main_Modules/Floating/")}`;
                  const imageUrl = profileUrl(employee.profile_image_path);
                  return (
                    <tr
                      key={employee.applicant_id}
                      className="border-b border-gray-100 bg-white/70 hover:bg-yellow-50"
                      onClick={() => role !== "employee" && router.push(detailsHref)}
                    >
                      <td className="px-4 py-3">
                        <div
                          className="h-10 w-10 rounded-full bg-gray-100 bg-cover bg-center"
                          style={imageUrl ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` } : undefined}
                          role={imageUrl ? "img" : undefined}
                          aria-label={imageUrl ? fullName(employee) : undefined}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{employeeCode(employee)}</td>
                      <td className="px-4 py-3 font-semibold">{fullName(employee)}</td>
                      <td className="px-4 py-3">{employee.client_position || "-"}</td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <DetachmentHistoryPopover applicantId={employee.applicant_id} currentDetachment={employee.detachment} detailsHref={detailsHref} />
                      </td>
                      <td className="px-4 py-3">{displayDate(employee.date_hired_fsai)}</td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        {role !== "employee" ? (
                          <EmployeeStatusMenu value="FLOATING" onChange={(status) => void updateStatus(employee, status)} />
                        ) : (
                          <span className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-bold text-white">FLOATING</span>
                        )}
                      </td>
                      {role !== "employee" ? (
                        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <div className="flex justify-center gap-2">
                            <button type="button" onClick={() => setEditorApplicantId(employee.applicant_id)} className="rounded-lg border bg-white p-2" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            {canDelete ? (
                              <button type="button" onClick={() => void deleteEmployee(employee)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TableZoomWrapper>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredEmployees.map((employee) => {
            const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(employee.applicant_id)}&from=${encodeURIComponent("/Main_Modules/Floating/")}`;
            const imageUrl = profileUrl(employee.profile_image_path);
            return (
              <article key={employee.applicant_id} className="glass-panel rounded-3xl p-5 shadow-sm">
                <button type="button" onClick={() => router.push(detailsHref)} className="flex w-full items-center gap-4 text-left">
                  <div className="h-16 w-16 shrink-0 rounded-2xl bg-gray-100 bg-cover bg-center" style={imageUrl ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` } : undefined} />
                  <div className="min-w-0">
                    <div className="truncate font-bold text-gray-900">{fullName(employee)}</div>
                    <div className="truncate text-xs text-gray-500">{employeeCode(employee)}</div>
                    <div className="mt-1 truncate text-xs text-gray-600">{employee.client_position || "No position"}</div>
                  </div>
                </button>
                <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4">
                  <div onClick={(event) => event.stopPropagation()}>
                    <EmployeeStatusMenu value="FLOATING" onChange={(status) => void updateStatus(employee, status)} disabled={role === "employee"} />
                  </div>
                  {role !== "employee" ? (
                    <button type="button" onClick={() => setEditorApplicantId(employee.applicant_id)} className="rounded-xl border bg-white p-2" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filtersOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="glass-panel w-full max-w-lg rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="text-lg font-bold text-black">Floating Filters</div>
              <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-xl border bg-white px-3 py-2">Close</button>
            </div>
            <div className="space-y-4 p-6">
              <label className="block text-sm text-black">
                <span className="mb-1 block text-gray-600">Detachment</span>
                <select value={detachmentFilter} onChange={(event) => setDetachmentFilter(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2">
                  <option value="ALL">All</option>
                  {filterOptions.detachments.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="block text-sm text-black">
                <span className="mb-1 block text-gray-600">Position</span>
                <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2">
                  <option value="ALL">All</option>
                  {filterOptions.positions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <div className="flex justify-between gap-3 pt-2">
                <button type="button" onClick={() => { setDetachmentFilter("ALL"); setPositionFilter("ALL"); }} className="rounded-xl border bg-white px-4 py-2">Reset</button>
                <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-xl bg-[#FFDA03] px-4 py-2 font-semibold text-black">Apply</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <EmployeeEditorModal
        open={Boolean(editorApplicantId)}
        mode="edit"
        applicantId={editorApplicantId}
        title="Edit Floating Employee"
        subtitle="Update employee information or change the workforce status."
        onClose={() => setEditorApplicantId(null)}
        onSaved={() => void fetchEmployees()}
        onDeleted={() => void fetchEmployees()}
      />
    </div>
  );
}
