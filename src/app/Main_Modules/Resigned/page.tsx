"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Pencil, LayoutGrid, Table, SlidersHorizontal, Search } from "lucide-react";
import { useAuthRole } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";
import LoadingCircle from "../../Components/LoadingCircle";

type Applicant = {
  applicant_id: string;
  created_at: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  client_position: string | null;
  date_hired_fsai: string | null;
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
  date_resigned: string | null;
  last_duty: string | null;
};

type LicensureRow = {
  applicant_id: string;
  driver_expiration: string | null;
  security_expiration: string | null;
  insurance_expiration: string | null;
};

const BUCKETS = {
  profile: "applicants",
};

function getFullName(a: Applicant) {
  const parts = [a.first_name, a.middle_name, a.last_name].filter(Boolean);
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
  if (v === "ACTIVE" || v === "INACTIVE" || v === "REASSIGN" || v === "RETIRED" || v === "RESIGNED") return v;
  return "ACTIVE";
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addYearsClamped(base: Date, years: number) {
  const y = base.getFullYear() + years;
  const m = base.getMonth();
  const day = base.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, lastDay), 0, 0, 0, 0);
}

function addMonthsClamped(base: Date, months: number) {
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const day = base.getDate();
  const first = new Date(y, m, 1, 0, 0, 0, 0);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay), 0, 0, 0, 0);
}

function diffYearsMonthsDays(from: Date, to: Date) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end.getTime() < start.getTime()) return { years: 0, months: 0, days: 0 };

  let years = end.getFullYear() - start.getFullYear();
  let cursor = addYearsClamped(start, years);
  if (cursor.getTime() > end.getTime()) {
    years -= 1;
    cursor = addYearsClamped(start, years);
  }

  let months = (end.getFullYear() - cursor.getFullYear()) * 12 + (end.getMonth() - cursor.getMonth());
  let cursor2 = addMonthsClamped(cursor, months);
  if (cursor2.getTime() > end.getTime()) {
    months -= 1;
    cursor2 = addMonthsClamped(cursor, months);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.round((end.getTime() - cursor2.getTime()) / msPerDay));
  return { years: Math.max(0, years), months: Math.max(0, months), days };
}

function serviceYearsExact(fromIso: string | null, now = new Date()) {
  if (!fromIso) return null;
  const d = new Date(fromIso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = diffYearsMonthsDays(d, now);
  return diff.years + diff.months / 12 + diff.days / 365.25;
}

function ymd(d: string | null) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function displayMaybeDate(value: string | null) {
  if (!value) return "—";
  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString();
  return value;
}

function daysUntil(dateYmd: string | null) {
  if (!dateYmd) return null;
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dt = new Date(dateYmd);
  if (Number.isNaN(dt.getTime())) return null;
  const diff = dt.getTime() - t.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function nextLicenseExpiryFromLicensureRow(r: LicensureRow | null) {
  if (!r) return { ymd: null as string | null, days: null as number | null };
  const cands = [ymd(r.driver_expiration), ymd(r.security_expiration), ymd(r.insurance_expiration)].filter(Boolean) as string[];
  if (!cands.length) return { ymd: null, days: null };
  const sorted = [...cands].sort((a, b) => a.localeCompare(b));
  const next = sorted[0];
  return { ymd: next, days: daysUntil(next) };
}

export default function ResignedPage() {
  const router = useRouter();
  const { role: sessionRole } = useAuthRole();

  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("resigned:viewMode") as "grid" | "table") || "grid";
    }
    return "grid";
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [employees, setEmployees] = useState<Applicant[]>([]);
  const [licensureByApplicantId, setLicensureByApplicantId] = useState<
    Record<string, { nextYmd: string | null; nextDays: number | null }>
  >({});
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "last_name" | "letter" | "created_at" | "category" | "service">("name");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [genderFilter, setGenderFilter] = useState<string>("ALL");
  const [detachmentFilter, setDetachmentFilter] = useState<string>("ALL");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const [hasPhotoFilter, setHasPhotoFilter] = useState<"ALL" | "YES" | "NO">("ALL");
  const [hiredMonthFilter, setHiredMonthFilter] = useState("ALL"); // MM
  const [yearsServiceFilter, setYearsServiceFilter] = useState<"ALL" | "<1" | "1-5" | ">5">("ALL");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorApplicantId, setEditorApplicantId] = useState<string | null>(null);

  async function fetchEmployees() {
    setLoading(true);
    setError("");
    try {
      const { data, error: fetchError } = await supabase
        .from("applicants")
        .select(
          "applicant_id, created_at, date_hired_fsai, first_name, middle_name, last_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived, is_trashed, date_resigned, last_duty"
        )
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .order("created_at", { ascending: false })
        .limit(500);

      if (fetchError) {
        console.error(fetchError);
        setError(fetchError.message || "Failed to load Resigned list");
        setEmployees([]);
        setLicensureByApplicantId({});
      } else {
        const list = (data as Applicant[]) || [];
        setEmployees(list);

        try {
          const ids = list.map((x) => x.applicant_id).filter(Boolean);
          if (!ids.length) {
            setLicensureByApplicantId({});
          } else {
            const map: Record<string, { nextYmd: string | null; nextDays: number | null }> = {};
            const chunkSize = 500;
            for (let i = 0; i < ids.length; i += chunkSize) {
              const chunk = ids.slice(i, i + chunkSize);
              const licRes = await supabase
                .from("licensure")
                .select("applicant_id, driver_expiration, security_expiration, insurance_expiration")
                .in("applicant_id", chunk);
              if (licRes.error) break;
              for (const r of (licRes.data as LicensureRow[]) || []) {
                const next = nextLicenseExpiryFromLicensureRow(r);
                map[String(r.applicant_id)] = { nextYmd: next.ymd, nextDays: next.days };
              }
            }
            setLicensureByApplicantId(map);
          }
        } catch {
          setLicensureByApplicantId({});
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("resigned:viewMode");
      if (saved === "grid" || saved === "table") setViewMode(saved);
    } catch {
      // ignore
    }

    fetchEmployees();

    const channel = supabase
      .channel("realtime:applicants-resigned")
      .on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => fetchEmployees())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("resigned:viewMode", viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = employees.filter((e) => normalizeStatus(e.status) === "RESIGNED");

    if (genderFilter !== "ALL") {
      const gf = genderFilter.trim().toUpperCase();
      list = list.filter((e) => String(e.gender ?? "").toUpperCase() === gf);
    }

    if (detachmentFilter !== "ALL") {
      list = list.filter((e) => (e.detachment ?? "") === detachmentFilter);
    }

    if (positionFilter !== "ALL") {
      list = list.filter((e) => (e.client_position ?? "") === positionFilter);
    }

    if (hasPhotoFilter !== "ALL") {
      const wantPhoto = hasPhotoFilter === "YES";
      list = list.filter((e) => (e.profile_image_path ? true : false) === wantPhoto);
    }

    if (hiredMonthFilter !== "ALL") {
      list = list.filter((e) => {
        if (!e.date_hired_fsai) return false;
        const hired = new Date(e.date_hired_fsai);
        if (Number.isNaN(hired.getTime())) return false;
        const m = String(hired.getMonth() + 1).padStart(2, "0");
        return m === hiredMonthFilter;
      });
    }

    if (yearsServiceFilter !== "ALL") {
      list = list.filter((e) => {
        const years = serviceYearsExact(e.date_hired_fsai, new Date());
        if (years == null) return false;
        if (yearsServiceFilter === "<1") return years < 1;
        if (yearsServiceFilter === "1-5") return years >= 1 && years <= 5;
        if (yearsServiceFilter === ">5") return years > 5;
        return true;
      });
    }

    if (q) {
      list = list.filter((e) => {
        const name = getFullName(e).toLowerCase();
        const det = String(e.detachment ?? "").toLowerCase();
        const pos = String(e.client_position ?? "").toLowerCase();
        const code = shortCode(e.applicant_id).toLowerCase();
        return name.includes(q) || det.includes(q) || pos.includes(q) || code.includes(q);
      });
    }

    const sorted = [...list];
    if (sortBy === "name") {
      sorted.sort((a, b) => getFullName(a).localeCompare(getFullName(b)));
    } else if (sortBy === "last_name") {
      sorted.sort((a, b) => String(a.last_name ?? "").localeCompare(String(b.last_name ?? "")));
    } else if (sortBy === "letter") {
      sorted.sort((a, b) => getFullName(a).localeCompare(getFullName(b)));
    } else if (sortBy === "created_at") {
      sorted.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    } else if (sortBy === "category") {
      sorted.sort((a, b) => String(a.detachment ?? "").localeCompare(String(b.detachment ?? "")));
    } else if (sortBy === "service") {
      sorted.sort((a, b) => {
        const ay = serviceYearsExact(a.date_hired_fsai, new Date()) ?? -1;
        const by = serviceYearsExact(b.date_hired_fsai, new Date()) ?? -1;
        return by - ay;
      });
    }

    return sorted;
  }, [
    employees,
    search,
    sortBy,
    genderFilter,
    detachmentFilter,
    positionFilter,
    hasPhotoFilter,
    hiredMonthFilter,
    yearsServiceFilter,
  ]);

  const detachmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      const v = (e.detachment ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const positionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      const v = (e.client_position ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  function openEdit(e: Applicant) {
    setEditorApplicantId(e.applicant_id);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 text-black">
          <div className="relative w-full md:w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search resigned employees"
              className="bg-white border rounded-full pl-10 pr-4 py-2 shadow-sm w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center"
            aria-label="Filters"
          >
            <SlidersHorizontal className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <div className="flex items-center gap-3 justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">Sort By:</div>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as "name" | "last_name" | "letter" | "created_at" | "category" | "service"
                )
              }
              className="px-4 py-2 rounded-full bg-white text-black font-medium border border-gray-300"
            >
              <option value="name">Name</option>
              <option value="last_name">Last Name</option>
              <option value="letter">Letter (A-Z)</option>
              <option value="created_at">Newest Date</option>
              <option value="category">Category</option>
              <option value="service">Years of Service</option>
            </select>
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
        <div className="bg-white rounded-2xl border shadow-sm p-8">
          <LoadingCircle label="Loading employees..." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">No employees in Resigned.</div>
      ) : viewMode === "table" ? (
        <div className="relative overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm text-black border-separate border-spacing-y-2">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#FFDA03]">
                <th className="px-4 py-3 text-left font-semibold text-black first:rounded-l-xl">Photo</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Position</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Detachment</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Date Resigned</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Last Duty</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Next License Expiry</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Status</th>
                {sessionRole !== "employee" ? (
                  <th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const profileUrl = getProfileUrl(e.profile_image_path);
                const next = licensureByApplicantId[e.applicant_id] || { nextYmd: null, nextDays: null };
                const canClick = sessionRole !== "employee";
                const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(
                  e.applicant_id
                )}&from=${encodeURIComponent("/Main_Modules/Resigned/")}`;

                return (
                  <tr
                    key={e.applicant_id}
                    role={canClick ? "button" : undefined}
                    tabIndex={canClick ? 0 : -1}
                    onKeyDown={(ev) => {
                      if (!canClick) return;
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        router.push(detailsHref);
                      }
                    }}
                    onClick={() => {
                      if (!canClick) return;
                      router.push(detailsHref);
                    }}
                    className={`bg-white shadow-sm transition ${canClick ? "hover:shadow-md cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-3 rounded-l-xl">
                      <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden">
                        {profileUrl ? <img src={profileUrl} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{getFullName(e)}</td>
                    <td className="px-4 py-3">{e.client_position ?? "—"}</td>
                    <td className="px-4 py-3">{e.detachment ?? "—"}</td>
                    <td className="px-4 py-3">{e.date_resigned ? new Date(e.date_resigned).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">{displayMaybeDate(e.last_duty)}</td>
                    <td className="px-4 py-3">
                      {next.nextYmd ? (
                        <div className="leading-tight">
                          <div>{next.nextYmd}</div>
                          <div className="text-xs text-gray-500">{next.nextDays == null ? "—" : `${next.nextDays} day(s)`}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-700 text-white">RESIGNED</span>
                    </td>
                    {sessionRole !== "employee" ? (
                      <td className="px-4 py-3 text-center rounded-r-xl">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openEdit(e);
                          }}
                          className="p-2 rounded-lg hover:bg-gray-100"
                          title="Edit"
                        >
                          <Pencil className="w-5 h-5 text-gray-700" />
                        </button>
                      </td>
                    ) : null}
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
              "/Main_Modules/Resigned/"
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
                    <div className="text-xs text-gray-500 truncate">
                      <span className="text-gray-500">Date Resigned:</span> {e.date_resigned ? ymd(e.date_resigned) : "—"}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      <span className="text-gray-500">Last Duty:</span> {displayMaybeDate(e.last_duty)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-700 text-white">RESIGNED</span>

                  <div className="flex items-center gap-2">
                    {sessionRole !== "employee" ? (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                        className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
                        title="Edit"
                        type="button"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtersOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="text-lg font-bold text-black">Filters</div>
              <button onClick={() => setFiltersOpen(false)} className="px-3 py-2 rounded-xl border bg-white">
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <label className="text-sm text-black block">
                <div className="text-gray-600 mb-1">Gender</div>
                <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 bg-white">
                  <option value="ALL">All</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </label>

              <label className="text-sm text-black block">
                <div className="text-gray-600 mb-1">Detachment</div>
                <select value={detachmentFilter} onChange={(e) => setDetachmentFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 bg-white">
                  <option value="ALL">All</option>
                  {detachmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-black block">
                <div className="text-gray-600 mb-1">Job Title</div>
                <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 bg-white">
                  <option value="ALL">All</option>
                  {positionOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-black block">
                <div className="text-gray-600 mb-1">Has Photo</div>
                <select value={hasPhotoFilter} onChange={(e) => setHasPhotoFilter(e.target.value as any)} className="w-full border rounded-xl px-3 py-2 bg-white">
                  <option value="ALL">All</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                </select>
              </label>

              <label className="text-sm text-black block">
                <div className="text-gray-600 mb-1">Hire Month</div>
                <select value={hiredMonthFilter} onChange={(e) => setHiredMonthFilter(e.target.value)} className="w-full border rounded-xl px-3 py-2 bg-white">
                  <option value="ALL">All</option>
                  {Array.from({ length: 12 }).map((_, i) => {
                    const mm = String(i + 1).padStart(2, "0");
                    return (
                      <option key={mm} value={mm}>
                        {mm}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="text-sm text-black block">
                <div className="text-gray-600 mb-1">Years of Service</div>
                <select value={yearsServiceFilter} onChange={(e) => setYearsServiceFilter(e.target.value as any)} className="w-full border rounded-xl px-3 py-2 bg-white">
                  <option value="ALL">All</option>
                  <option value="<1">&lt; 1</option>
                  <option value="1-5">1 - 5</option>
                  <option value=">5">&gt; 5</option>
                </select>
              </label>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setGenderFilter("ALL");
                    setDetachmentFilter("ALL");
                    setPositionFilter("ALL");
                    setHasPhotoFilter("ALL");
                    setHiredMonthFilter("ALL");
                    setYearsServiceFilter("ALL");
                  }}
                  className="px-4 py-2 rounded-xl border bg-white"
                >
                  Reset
                </button>
                <button type="button" onClick={() => setFiltersOpen(false)} className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <EmployeeEditorModal
        open={editorOpen}
        mode="edit"
        applicantId={editorApplicantId}
        title="Edit Employee"
        subtitle="Update employee details, including Date Resigned and Last Duty."
        onClose={() => {
          setEditorOpen(false);
          setEditorApplicantId(null);
        }}
        onSaved={() => fetchEmployees()}
      />
    </div>
  );
}
