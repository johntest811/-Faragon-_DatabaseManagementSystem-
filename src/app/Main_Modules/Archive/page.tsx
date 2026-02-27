"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { RotateCcw, LayoutGrid, Table, SlidersHorizontal, Search } from "lucide-react";
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
  profile_image_path: string | null;
  is_archived: boolean | null;
  archived_at: string | null;
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

export default function ArchivePage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("archive:viewMode") as "grid" | "table") || "grid";
    }
    return "grid";
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [items, setItems] = useState<Applicant[]>([]);
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

  function normalizeStatus(input: string | null) {
    const v = (input ?? "").trim().toUpperCase();
    if (!v) return "ACTIVE";
    if (v === "ACTIVE" || v === "INACTIVE" || v === "REASSIGN" || v === "RETIRED" || v === "RESIGNED") return v;
    return "ACTIVE";
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("archive:viewMode");
      if (saved === "grid" || saved === "table") setViewMode(saved);
    } catch {
      // ignore
    }

    const run = async () => {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("applicants")
        .select(
          "applicant_id, created_at, date_hired_fsai, first_name, middle_name, last_name, client_position, detachment, status, gender, birth_date, age, profile_image_path, is_archived, archived_at"
        )
        .eq("is_archived", true)
        .eq("is_trashed", false)
        .order("archived_at", { ascending: false })
        .limit(200);

      if (fetchError) {
        console.error(fetchError);
        setError(fetchError.message || "Failed to load archive");
        setItems([]);
        setLicensureByApplicantId({});
      } else {
        const list = (data as Applicant[]) || [];
        setItems(list);

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
      setLoading(false);
    };

    run();

    const channel = supabase
      .channel("realtime:applicants-archive")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applicants" },
        () => run()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("archive:viewMode", viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;

    if (genderFilter !== "ALL") {
      const gf = genderFilter.trim().toUpperCase();
      list = list.filter((e) => (e.gender ?? "").trim().toUpperCase() === gf);
    }

    if (detachmentFilter !== "ALL") {
      list = list.filter((e) => (e.detachment ?? "") === detachmentFilter);
    }

    if (positionFilter !== "ALL") {
      list = list.filter((e) => (e.client_position ?? "") === positionFilter);
    }

    if (hasPhotoFilter !== "ALL") {
      list = list.filter((e) => {
        const has = Boolean((e.profile_image_path ?? "").trim());
        return hasPhotoFilter === "YES" ? has : !has;
      });
    }

    if (hiredMonthFilter !== "ALL") {
      list = list.filter((e) => {
        if (!e.date_hired_fsai) return false;
        const hired = new Date(e.date_hired_fsai);
        if (Number.isNaN(hired.getTime())) return false;
        const month = String(hired.getMonth() + 1).padStart(2, "0");
        return month === hiredMonthFilter;
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
        return (
          name.includes(q) ||
          (e.client_position || "").toLowerCase().includes(q) ||
          (e.detachment || "").toLowerCase().includes(q) ||
          (e.status || "").toLowerCase().includes(q)
        );
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (sortBy === "last_name") {
        const al = (a.last_name ?? "").trim().toLowerCase();
        const bl = (b.last_name ?? "").trim().toLowerCase();
        const d = al.localeCompare(bl);
        return d !== 0 ? d : getFullName(a).localeCompare(getFullName(b));
      }
      if (sortBy === "letter") {
        const al = (a.last_name ?? "").trim().toLowerCase();
        const bl = (b.last_name ?? "").trim().toLowerCase();
        const ai = al ? al[0] : "~";
        const bi = bl ? bl[0] : "~";
        const d = ai.localeCompare(bi);
        return d !== 0 ? d : getFullName(a).localeCompare(getFullName(b));
      }
      if (sortBy === "created_at") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "category") {
        const ac = (a.client_position ?? "").toLowerCase();
        const bc = (b.client_position ?? "").toLowerCase();
        const d = ac.localeCompare(bc);
        return d !== 0 ? d : getFullName(a).localeCompare(getFullName(b));
      }
      if (sortBy === "service") {
        const ay = serviceYearsExact(a.date_hired_fsai, new Date());
        const by = serviceYearsExact(b.date_hired_fsai, new Date());
        const score = (v: number | null) => (v == null ? -1 : v);
        const d = score(by) - score(ay);
        return d !== 0 ? d : getFullName(a).localeCompare(getFullName(b));
      }
      return getFullName(a).localeCompare(getFullName(b));
    });

    return sorted;
  }, [items, search, sortBy, genderFilter, detachmentFilter, positionFilter, hasPhotoFilter, hiredMonthFilter, yearsServiceFilter]);

  const filterOptions = useMemo(() => {
    const det = new Set<string>();
    const pos = new Set<string>();
    const gen = new Set<string>();
    for (const e of items) {
      if (e.detachment) det.add(e.detachment);
      if (e.client_position) pos.add(e.client_position);
      if (e.gender) gen.add(e.gender.trim().toUpperCase());
    }
    return {
      detachments: Array.from(det).sort((a, b) => a.localeCompare(b)),
      positions: Array.from(pos).sort((a, b) => a.localeCompare(b)),
			genders: Array.from(gen).sort((a, b) => a.localeCompare(b)),
    };
  }, [items]);

  function clearFilters() {
		setGenderFilter("ALL");
    setDetachmentFilter("ALL");
    setPositionFilter("ALL");
    setHasPhotoFilter("ALL");
		setHiredMonthFilter("ALL");
		setYearsServiceFilter("ALL");
  }

  async function restore(employee: Applicant) {
    setError("");
		const normalizedStatus = normalizeStatus(employee.status);
    const { error: updateError } = await supabase
      .from("applicants")
      .update({ is_archived: false, archived_at: null, archived_by: null, status: normalizedStatus })
      .eq("applicant_id", employee.applicant_id);

    if (updateError) {
      console.error(updateError);
      setError(updateError.message || "Failed to restore");
      return;
    }

    setItems((prev) => prev.filter((x) => x.applicant_id !== employee.applicant_id));
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
          placeholder="Search archived employees"
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
        onChange={(e) => setSortBy(e.target.value as "name" | "last_name" | "letter" | "created_at" | "category" | "service")}
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
          <LoadingCircle label="Loading archive..." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">No archived employees.</div>
      ) : viewMode === "table" ? (
    <div className="relative overflow-x-auto rounded-2xl border bg-white">
      <table className="w-full text-sm text-black border-separate border-spacing-y-2">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#FFDA03]">
            <th className="px-4 py-3 text-left font-semibold text-black first:rounded-l-xl">Photo</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Name</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Position</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Gender</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Birth Date</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Age</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Hired Date</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Detachment</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Next License Expiry</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Status</th>
            <th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => {
            const profileUrl = getProfileUrl(e.profile_image_path);
            const next = licensureByApplicantId[e.applicant_id] || { nextYmd: null, nextDays: null };
            const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(
              e.applicant_id
            )}&from=${encodeURIComponent("/Main_Modules/Archive/")}`;

            return (
              <tr
                key={e.applicant_id}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    router.push(detailsHref);
                  }
                }}
                onClick={() => router.push(detailsHref)}
                className="bg-white shadow-sm transition hover:shadow-md cursor-pointer"
              >
                <td className="px-4 py-3 rounded-l-xl">
                  <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden">
                    {profileUrl ? <img src={profileUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold">{getFullName(e)}</td>
                <td className="px-4 py-3">{e.client_position ?? "—"}</td>
                <td className="px-4 py-3">{e.gender ?? "—"}</td>
                <td className="px-4 py-3">{e.birth_date ?? "—"}</td>
                <td className="px-4 py-3">{e.age ?? "—"}</td>
                <td className="px-4 py-3">
                  {e.date_hired_fsai ? (
                    <div className="leading-tight">{new Date(e.date_hired_fsai).toLocaleDateString()}</div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">{e.detachment ?? "—"}</td>
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
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      normalizeStatus(e.status) === "ACTIVE" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                    }`}
                  >
                    {normalizeStatus(e.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center rounded-r-xl">
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      restore(e);
                    }}
                    className="px-4 py-2 text-xs rounded-xl bg-black text-white hover:bg-gray-800 inline-flex items-center gap-2"
                    title="Restore"
                    type="button"
                  >
                    <RotateCcw className="w-4 h-4" /> Restore
                  </button>
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
              "/Main_Modules/Archive/"
            )}`;
            return (
              <div
                key={e.applicant_id}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    router.push(detailsHref);
                  }
                }}
                onClick={() => router.push(detailsHref)}
                className="bg-white rounded-3xl border shadow-sm p-6 cursor-pointer hover:shadow-md transition"
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
                    <div className="text-xs text-gray-500 truncate">{e.client_position ?? "—"}</div>
                    <div className="text-xs text-gray-500 truncate">{e.detachment ?? "—"}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Archived: {e.archived_at ? new Date(e.archived_at).toLocaleString() : "—"}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        restore(e);
                      }}
                      className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-2"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" /> Restore
                    </button>
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
            <button
              onClick={() => setFiltersOpen(false)}
              className="px-3 py-2 rounded-xl border bg-white"
            >
              Close
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Gender</div>
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="ALL">All</option>
                  {filterOptions.genders.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Has Photo</div>
                <select
                  value={hasPhotoFilter}
                  onChange={(e) => setHasPhotoFilter(e.target.value as "ALL" | "YES" | "NO")}
                  className="w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="ALL">All</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                </select>
              </label>

              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Detachment</div>
                <select
                  value={detachmentFilter}
                  onChange={(e) => setDetachmentFilter(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="ALL">All</option>
                  {filterOptions.detachments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Hired Month</div>
                <select
                  value={hiredMonthFilter}
                  onChange={(e) => setHiredMonthFilter(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="ALL">All</option>
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </label>

              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Years of Service</div>
                <select
                  value={yearsServiceFilter}
                  onChange={(e) => setYearsServiceFilter(e.target.value as "ALL" | "<1" | "1-5" | ">5")}
                  className="w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="ALL">All</option>
                  <option value="&lt;1">Less than 1 year</option>
                  <option value="1-5">1 to 5 years</option>
                  <option value=">5">More than 5 years</option>
                </select>
              </label>

              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Job Title</div>
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 bg-white"
                >
                  <option value="ALL">All</option>
                  {filterOptions.positions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="px-6 pb-6 flex items-center justify-between gap-2">
            <button onClick={clearFilters} className="px-4 py-2 rounded-xl border bg-white">
              Clear
            </button>
            <button
              onClick={() => setFiltersOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </div>
  );
}
