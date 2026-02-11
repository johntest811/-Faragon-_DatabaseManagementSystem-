"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Pencil, Eye, ChevronDown, LayoutGrid, Table } from "lucide-react";
import { useAuthRole } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";

type Applicant = {
  applicant_id: string;
  created_at: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  extn_name: string | null;
  client_position: string | null;
  detachment: string | null;
  status: string | null;
  gender: string | null;
  birth_date: string | null;
  age: number | null;
  client_contact_num: string | null;
  client_email: string | null;
  profile_image_path: string | null;
  is_archived: boolean | null;
  is_trashed?: boolean | null;
};

const BUCKETS = {
  profile: "applicants",
};

function getFullName(a: Applicant) {
  const parts = [a.first_name, a.middle_name, a.last_name, a.extn_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "(No name)";
}

function getProfileUrl(profilePath: string | null) {
  if (!profilePath) return null;
  const { data } = supabase.storage.from(BUCKETS.profile).getPublicUrl(profilePath);
  return data.publicUrl || null;
}

function shortCode(id: string) {
  return `EMP-${id.slice(0, 2).toUpperCase()}-${id.slice(2, 5).toUpperCase()}`;
}

function normalizeStatus(input: string | null) {
  const v = (input ?? "").trim().toUpperCase();
  if (!v) return "ACTIVE";
  if (v === "ACTIVE" || v === "INACTIVE" || v === "REASSIGN" || v === "RETIRED") return v;
  return "ACTIVE";
}

export default function ReassignPage() {
  const router = useRouter();
  const { role: sessionRole } = useAuthRole();

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [employees, setEmployees] = useState<Applicant[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "created_at">("name");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorApplicantId, setEditorApplicantId] = useState<string | null>(null);

  async function fetchEmployees() {
    setLoading(true);
    setError("");
    try {
      const { data, error: fetchError } = await supabase
        .from("applicants")
        .select(
          "applicant_id, created_at, first_name, middle_name, last_name, extn_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived, is_trashed"
        )
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .order("created_at", { ascending: false })
        .limit(500);

      if (fetchError) {
        console.error(fetchError);
        setError(fetchError.message || "Failed to load Reassign list");
        setEmployees([]);
      } else {
        setEmployees((data as Applicant[]) || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("reassign:viewMode");
      if (saved === "grid" || saved === "table") setViewMode(saved);
    } catch {
      // ignore
    }

    fetchEmployees();

    const channel = supabase
      .channel("realtime:applicants-reassign")
      .on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => fetchEmployees())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("reassign:viewMode", viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = employees.filter((e) => normalizeStatus(e.status) === "REASSIGN");

    if (q) {
      list = list.filter((e) => {
        const haystack = [
          e.applicant_id,
          shortCode(e.applicant_id),
          getFullName(e),
          e.client_position,
          e.detachment,
          normalizeStatus(e.status),
          e.gender,
          e.client_contact_num,
          e.client_email,
          e.birth_date,
          e.age != null ? String(e.age) : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (sortBy === "created_at") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return getFullName(a).localeCompare(getFullName(b));
    });

    return sorted;
  }, [employees, search, sortBy]);

  function openEdit(employee: Applicant) {
    setEditorApplicantId(employee.applicant_id);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 text-black">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reassign employees"
            className="bg-white border rounded-full px-4 py-2 shadow-sm w-full md:w-[360px]"
          />
        </div>

        <div className="flex items-center gap-3 justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">Sort By:</div>
            <button
              onClick={() => setSortBy((v) => (v === "name" ? "created_at" : "name"))}
              className="px-4 py-2 rounded-full bg-black text-white font-medium flex items-center gap-2"
            >
              {sortBy === "name" ? "Name" : "Newest"}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={() => setViewMode("grid")}
              className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
                viewMode === "grid" ? "bg-[#FFDA03]" : "bg-white"
              }`}
              aria-label="Grid view"
              type="button"
            >
              <LayoutGrid className="w-5 h-5 text-black" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
                viewMode === "table" ? "bg-[#FFDA03]" : "bg-white"
              }`}
              aria-label="Table view"
              type="button"
            >
              <Table className="w-5 h-5 text-black" />
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="text-red-600 text-sm">{error}</div> : null}

      {loading ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">No employees in Reassign.</div>
      ) : viewMode === "table" ? (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm text-black border-separate border-spacing-y-2">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#FFDA03]">
                <th className="px-4 py-3 text-left font-semibold text-black first:rounded-l-xl">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Job Title</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Detachment</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-black">View</th>
                <th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((e) => {
                const name = getFullName(e);
                const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(e.applicant_id)}&from=${encodeURIComponent(
                  "/Main_Modules/Reassign/"
                )}`;

                return (
                  <tr key={e.applicant_id} className="bg-white shadow-sm hover:shadow-md transition">
                    <td className="px-4 py-3 rounded-l-xl font-medium">{name}</td>
                    <td className="px-4 py-3">{e.client_position ?? "—"}</td>
                    <td className="px-4 py-3">{e.detachment ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">REASSIGN</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => router.push(detailsHref)}
                        className="h-9 w-9 rounded-xl border bg-white inline-flex items-center justify-center hover:bg-gray-50"
                        title="View"
                        type="button"
                      >
                        <Eye className="w-4 h-4 text-gray-800" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center rounded-r-xl">
                      {sessionRole !== "employee" ? (
                        <button
                          onClick={() => openEdit(e)}
                          className="px-4 py-2 text-xs rounded-xl bg-black text-white hover:bg-gray-800"
                          type="button"
                        >
                          Edit
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((e) => {
            const name = getFullName(e);
            const profileUrl = getProfileUrl(e.profile_image_path);
            const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(e.applicant_id)}&from=${encodeURIComponent(
              "/Main_Modules/Reassign/"
            )}`;

            return (
              <div
                key={e.applicant_id}
                role={sessionRole !== "employee" ? "button" : undefined}
                tabIndex={sessionRole !== "employee" ? 0 : -1}
                onKeyDown={(ev) => {
                  if (sessionRole === "employee") return;
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    router.push(detailsHref);
                  }
                }}
                onClick={() => {
                  if (sessionRole === "employee") return;
                  router.push(detailsHref);
                }}
                className={`bg-white rounded-3xl border shadow-sm p-6 ${
                  sessionRole !== "employee" ? "cursor-pointer hover:shadow-md transition" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
                    {profileUrl ? (
                      <img src={profileUrl} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-xs text-gray-500">No Photo</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">{name}</div>
                    <div className="text-xs text-gray-500 truncate">{shortCode(e.applicant_id)}</div>
                    <div className="mt-1 text-xs text-gray-500 truncate">
                      <span className="text-gray-500">Job Title:</span> {e.client_position ?? "—"}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      <span className="text-gray-500">Detachment:</span> {e.detachment ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">REASSIGN</span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        router.push(detailsHref);
                      }}
                      className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {sessionRole !== "employee" && (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                        className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EmployeeEditorModal
        open={editorOpen}
        mode="edit"
        applicantId={editorApplicantId}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          // realtime subscription will refresh
        }}
      />
    </div>
  );
}
