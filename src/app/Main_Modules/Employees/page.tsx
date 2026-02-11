"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Pencil, Eye, SlidersHorizontal, Trash2, Upload, LayoutGrid, Table } from "lucide-react";
import { useAuthRole } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";
import EmployeeExcelImportModal from "../../Components/EmployeeExcelImportModal";

type Applicant = {
	applicant_id: string;
	created_at: string;
	first_name: string | null;
	middle_name: string | null;
	last_name: string | null;
	extn_name: string | null;
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

function ymd(d: string | null) {
	if (!d) return null;
	const dt = new Date(d);
	if (Number.isNaN(dt.getTime())) return null;
	const yyyy = dt.getFullYear();
	const mm = String(dt.getMonth() + 1).padStart(2, "0");
	const dd = String(dt.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function daysUntil(dateYmd: string | null) {
	if (!dateYmd) return null;
	const [y, m, d] = String(dateYmd).split("-").map((n) => Number(n));
	if (!y || !m || !d) return null;
	const target = new Date(y, m - 1, d, 0, 0, 0, 0);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
	return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function nextLicenseExpiryFromLicensureRow(r: LicensureRow | null) {
	const candidates = [ymd(r?.driver_expiration ?? null), ymd(r?.security_expiration ?? null), ymd(r?.insurance_expiration ?? null)].filter(
		Boolean
	) as string[];
	if (!candidates.length) return { ymd: null as string | null, days: null as number | null };
	const min = candidates.reduce((acc, cur) => (cur < acc ? cur : acc));
	return { ymd: min, days: daysUntil(min) };
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

function formatServiceLengthShort(fromIso: string | null, now = new Date()) {
	if (!fromIso) return "—";
	const d = new Date(fromIso);
	if (Number.isNaN(d.getTime())) return "—";
	const diff = diffYearsMonthsDays(d, now);
	return `${diff.years}y ${diff.months}m ${diff.days}d`;
}

function serviceYearsExact(fromIso: string | null, now = new Date()) {
	if (!fromIso) return null;
	const d = new Date(fromIso);
	if (Number.isNaN(d.getTime())) return null;
	const diff = diffYearsMonthsDays(d, now);
	return diff.years + diff.months / 12 + diff.days / 365.25;
}

function emailBadge(email: string | null) {
	const value = (email ?? "").trim();
	if (!value) return { label: "No Email", className: "bg-red-100 text-red-700" };
	if (value.toLowerCase().endsWith("@gmail.com")) return { label: "Gmail", className: "bg-emerald-100 text-emerald-800" };
	return { label: "Email", className: "bg-blue-100 text-blue-800" };
}

export default function EmployeesPage() {
	const router = useRouter();
	const { role: sessionRole } = useAuthRole();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");
	const [employees, setEmployees] = useState<Applicant[]>([]);
	const [licensureByApplicantId, setLicensureByApplicantId] = useState<
		Record<string, { nextYmd: string | null; nextDays: number | null }>
	>({});
	const [search, setSearch] = useState("");
	const [sortBy, setSortBy] = useState<"name" | "created_at" | "category" | "expiring">("name");
	const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
  if (typeof window !== "undefined") {
    return (localStorage.getItem("employees:viewMode") as "grid" | "table") || "grid";
  }
  return "grid";
});
	const [expiringOpen, setExpiringOpen] = useState(false);



	const [filtersOpen, setFiltersOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "REASSIGN" | "RETIRED">("ALL");
	const [genderFilter, setGenderFilter] = useState<string>("ALL");
	const [detachmentFilter, setDetachmentFilter] = useState<string>("ALL");
	const [positionFilter, setPositionFilter] = useState<string>("ALL");
	const [hasPhotoFilter, setHasPhotoFilter] = useState<"ALL" | "YES" | "NO">("ALL");
	const [hiredMonthFilter, setHiredMonthFilter] = useState("ALL"); // YYYY-MM
    const [yearsServiceFilter, setYearsServiceFilter] = useState<"ALL" | "<1" | "1-5" | ">5">("ALL");


	const [editorOpen, setEditorOpen] = useState(false);
	const [editorMode, setEditorMode] = useState<"create" | "edit">("edit");
	const [editorApplicantId, setEditorApplicantId] = useState<string | null>(null);
	const [excelOpen, setExcelOpen] = useState(false);

	const [archiveOpen, setArchiveOpen] = useState(false);
	const [archiveEmployee, setArchiveEmployee] = useState<Applicant | null>(null);

	const [trashOpen, setTrashOpen] = useState(false);
	const [trashEmployee, setTrashEmployee] = useState<Applicant | null>(null);

	async function fetchEmployees() {
		setLoading(true);
		setError("");
		try {
			const { data, error: fetchError } = await supabase
				.from("applicants")
				.select(
					"applicant_id, created_at, date_hired_fsai, first_name, middle_name, last_name, extn_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived, is_trashed"
				)
				.eq("is_archived", false)
				.eq("is_trashed", false)
				.order("created_at", { ascending: false })
				.limit(500);

			if (fetchError) {
				console.error(fetchError);
				setError(fetchError.message || "Failed to load employees");
				setEmployees([]);
				setLicensureByApplicantId({});
			} else {
				const list = (data as Applicant[]) || [];
				setEmployees(list);

				// Optional: load licensure expirations for "Sort by expiring licenses".
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
							if (licRes.error) {
								// Table may not exist yet; don't break Employees page.
								break;
							}
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
  if (typeof window !== "undefined") {
    localStorage.setItem("employees:viewMode", viewMode);
  }
}, [viewMode]);


	useEffect(() => {
		fetchEmployees();

		const channel = supabase
			.channel("realtime:applicants-employees")
			.on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => fetchEmployees())
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, []);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		let list = employees;

		// By default Employees page shows Active/Inactive.
		// If the admin explicitly filters for REASSIGN/RETIRED, allow it.
		if (statusFilter === "ALL") {
			list = list.filter((e) => {
				const s = normalizeStatus(e.status);
				return s !== "REASSIGN" && s !== "RETIRED";
			});
		}

		const normalizedStatusFilter = statusFilter;
		if (normalizedStatusFilter !== "ALL") {
			list = list.filter((e) => normalizeStatus(e.status) === normalizedStatusFilter);
		}

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
    const month = String(hired.getMonth() + 1).padStart(2, "0"); // 01–12
    return month === hiredMonthFilter;
  });
}



        if (yearsServiceFilter !== "ALL") {
             list = list.filter((e) => {
        if (!e.date_hired_fsai) return false;
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
			if (sortBy === "category") {
				const ac = (a.client_position ?? "").toLowerCase();
				const bc = (b.client_position ?? "").toLowerCase();
				const d = ac.localeCompare(bc);
				return d !== 0 ? d : getFullName(a).localeCompare(getFullName(b));
			}
			if (sortBy === "expiring") {
				const aDaysRaw = licensureByApplicantId[a.applicant_id]?.nextDays ?? null;
				const bDaysRaw = licensureByApplicantId[b.applicant_id]?.nextDays ?? null;
				const score = (days: number | null) => {
					if (days == null) return 1_000_000;
					// Put already-expired after upcoming expirations.
					return days < 0 ? 500_000 + Math.abs(days) : days;
				};
				const d = score(aDaysRaw) - score(bDaysRaw);
				return d !== 0 ? d : getFullName(a).localeCompare(getFullName(b));
			}
			return getFullName(a).localeCompare(getFullName(b));
		});

		return sorted;
	}, [
  employees,
  search,
  sortBy,
	licensureByApplicantId,
  statusFilter,
  genderFilter,
  detachmentFilter,
  positionFilter,
  hasPhotoFilter,
  hiredMonthFilter,
  yearsServiceFilter,
]);

	const filterOptions = useMemo(() => {
		const det = new Set<string>();
		const pos = new Set<string>();
		const gen = new Set<string>();
		for (const e of employees) {
			if (e.detachment) det.add(e.detachment);
			if (e.client_position) pos.add(e.client_position);
			if (e.gender) gen.add(e.gender.trim().toUpperCase());
		}
		return {
			detachments: Array.from(det).sort((a, b) => a.localeCompare(b)),
			positions: Array.from(pos).sort((a, b) => a.localeCompare(b)),
			genders: Array.from(gen).sort((a, b) => a.localeCompare(b)),
		};
	}, [employees]);

	const expiringItems = useMemo(() => {
		const score = (days: number | null) => {
			if (days == null) return 1_000_000;
			return days < 0 ? 500_000 + Math.abs(days) : days;
		};
		const items = employees
			.map((e) => {
				const next = licensureByApplicantId[e.applicant_id] || { nextYmd: null, nextDays: null };
				if (!next.nextYmd) return null;
				return {
					employee: e,
					nextYmd: next.nextYmd,
					nextDays: next.nextDays,
					score: score(next.nextDays),
				};
			})
			.filter(Boolean) as Array<{ employee: Applicant; nextYmd: string; nextDays: number | null; score: number }>;

		items.sort((a, b) => {
			const d = a.score - b.score;
			return d !== 0 ? d : getFullName(a.employee).localeCompare(getFullName(b.employee));
		});
		return items;
	}, [employees, licensureByApplicantId]);

	const expiringUpcoming = useMemo(
		() => expiringItems.filter((x) => x.nextDays != null && x.nextDays >= 0),
		[expiringItems]
	);
	const expiringExpired = useMemo(
		() => expiringItems.filter((x) => x.nextDays != null && x.nextDays < 0),
		[expiringItems]
	);

	function clearFilters() {
		setStatusFilter("ALL");
		setGenderFilter("ALL");
		setDetachmentFilter("ALL");
		setPositionFilter("ALL");
		setHasPhotoFilter("ALL");
		setHasPhotoFilter("ALL");
        setHiredMonthFilter("ALL");
        setYearsServiceFilter("ALL");
	}

	function openCreate() {
		setEditorMode("create");
		setEditorApplicantId(null);
		setEditorOpen(true);
	}

	function openExcelImport() {
		setExcelOpen(true);
	}

	function openEdit(employee: Applicant) {
		setEditorMode("edit");
		setEditorApplicantId(employee.applicant_id);
		setEditorOpen(true);
	}

	function openArchive(employee: Applicant) {
		setArchiveEmployee(employee);
		setArchiveOpen(true);
	}

	async function confirmArchive() {
		if (!archiveEmployee) return;
		setError("");
		const normalizedStatus = normalizeStatus(archiveEmployee.status);

		const { error: updateError } = await supabase
			.from("applicants")
			.update({
				is_archived: true,
				archived_at: new Date().toISOString(),
				archived_by: null,
				status: normalizedStatus,
			})
			.eq("applicant_id", archiveEmployee.applicant_id);

		if (updateError) {
			console.error(updateError);
			setError(updateError.message || "Failed to archive employee");
			return;
		}

		setEmployees((prev) => prev.filter((e) => e.applicant_id !== archiveEmployee.applicant_id));
		setArchiveOpen(false);
		setArchiveEmployee(null);
	}

	function openTrash(employee: Applicant) {
		setTrashEmployee(employee);
		setTrashOpen(true);
	}

	async function confirmTrash() {
		if (!trashEmployee) return;
		setError("");
		const normalizedStatus = normalizeStatus(trashEmployee.status);

		const { error: updateError } = await supabase
			.from("applicants")
			.update({
				is_trashed: true,
				trashed_at: new Date().toISOString(),
				trashed_by: null,
				is_archived: false,
				archived_at: null,
				archived_by: null,
				status: normalizedStatus,
			})
			.eq("applicant_id", trashEmployee.applicant_id);

		if (updateError) {
			console.error(updateError);
			setError(updateError.message || "Failed to move employee to Trash");
			return;
		}

		setEmployees((prev) => prev.filter((e) => e.applicant_id !== trashEmployee.applicant_id));
		setTrashOpen(false);
		setTrashEmployee(null);
	}

	async function onSaved(applicantId: string) {
		await fetchEmployees();
		if (editorMode === "create") {
			router.push(
				`/Main_Modules/Employees/details/?id=${encodeURIComponent(applicantId)}&from=${encodeURIComponent(
					"/Main_Modules/Employees/"
				)}`
			);
		}
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
				<div className="flex items-center gap-3 text-black">
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search name, email, phone, status, detachment, etc."
						className="bg-white border rounded-full px-4 py-2 shadow-sm w-full md:w-[360px]"
					/>
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
								setSortBy(e.target.value as "name" | "created_at" | "category" | "expiring")
							}
							className="px-4 py-2 rounded-full bg-black text-white font-medium border border-black"
						>
							<option value="name">Name</option>
							<option value="created_at">Newest Date</option>
							<option value="category">Category</option>
							<option value="expiring">Expiring Licenses</option>
						</select>
					</div>
					<div className="relative">
						<button
							type="button"
							onClick={() => setExpiringOpen((v) => !v)}
							className="px-4 py-2 rounded-full bg-black text-white font-medium border border-black"
							title="View employees with license expirations"
						>
							Expiring Licenses ({expiringUpcoming.length})
						</button>

						{expiringOpen ? (
							<div className="absolute right-0 mt-2 w-[420px] max-w-[90vw] rounded-2xl border bg-white shadow-xl z-20">
								<div className="px-4 py-3 border-b flex items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="text-sm font-bold text-black truncate">Expiring Licenses</div>
										<div className="text-xs text-gray-500">
											Upcoming: {expiringUpcoming.length} · Expired: {expiringExpired.length}
										</div>
									</div>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => {
												setSortBy("expiring");
												setExpiringOpen(false);
											}}
											className="px-3 py-1.5 rounded-xl border bg-white text-xs text-black"
										>
											Sort List
										</button>
										<button
											type="button"
											onClick={() => setExpiringOpen(false)}
											className="px-3 py-1.5 rounded-xl border bg-white text-xs text-black"
										>
											Close
										</button>
									</div>
								</div>

								<div className="max-h-[420px] overflow-auto p-2">
									{expiringItems.length === 0 ? (
										<div className="px-3 py-8 text-center text-sm text-gray-500">
											No license expirations found.
										</div>
									) : (
										<div className="space-y-2">
											<div className="px-2 pt-1 text-xs font-semibold text-gray-700">Upcoming</div>
											{expiringUpcoming.slice(0, 12).map((x) => {
												const e = x.employee;
												const badge = emailBadge(e.client_email);
												const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(
													e.applicant_id
												)}&from=${encodeURIComponent("/Main_Modules/Employees/")}`;
												return (
													<button
														key={e.applicant_id}
														type="button"
														onClick={() => {
															router.push(detailsHref);
															setExpiringOpen(false);
														}}
														className="w-full text-left rounded-2xl border bg-white px-3 py-2 hover:bg-gray-50"
													>
														<div className="flex items-center justify-between gap-3">
															<div className="min-w-0">
																<div className="text-sm font-semibold text-black truncate">{getFullName(e)}</div>
																<div className="text-xs text-gray-500 truncate">{x.nextYmd}</div>
															</div>
															<div className="shrink-0 text-right">
																<div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
																	{badge.label}
																</div>
																<div className="mt-1 text-xs text-gray-500">
																	{x.nextDays == null ? "—" : `${x.nextDays} day(s)`}
																</div>
															</div>
														</div>
													</button>
												);
											})}

											{expiringExpired.length ? (
												<>
													<div className="px-2 pt-3 text-xs font-semibold text-gray-700">Expired</div>
													{expiringExpired.slice(0, 6).map((x) => {
														const e = x.employee;
														const badge = emailBadge(e.client_email);
														const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(
															e.applicant_id
														)}&from=${encodeURIComponent("/Main_Modules/Employees/")}`;
														return (
															<button
																key={`${e.applicant_id}-expired`}
																type="button"
																onClick={() => {
																	router.push(detailsHref);
																	setExpiringOpen(false);
																}}
																className="w-full text-left rounded-2xl border bg-white px-3 py-2 hover:bg-gray-50"
															>
																<div className="flex items-center justify-between gap-3">
																	<div className="min-w-0">
																		<div className="text-sm font-semibold text-black truncate">{getFullName(e)}</div>
																		<div className="text-xs text-gray-500 truncate">{x.nextYmd}</div>
																	</div>
																	<div className="shrink-0 text-right">
																		<div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
																		{badge.label}
																	</div>
																	<div className="mt-1 text-xs text-gray-500">
																		{x.nextDays == null ? "—" : `${x.nextDays} day(s)`}
																	</div>
																</div>
															</div>
														</button>
													);
												})}
												</>
											) : null}
										</div>
									)}
								</div>
							</div>
						) : null}
					</div>
					<div className="flex items-center gap-2 ml-2">
						<button
                        onClick={() => setViewMode("grid")}
                        className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
                         viewMode === "grid" ? "bg-[#FFDA03]" : "bg-white"
                              }`}
                             >
                       <LayoutGrid className="w-5 h-5 text-black" />
                    </button>

                     <button
                        onClick={() => setViewMode("table")}
                        className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
                        viewMode === "table" ? "bg-[#FFDA03]" : "bg-white"
                           }`}
                           >
                     <Table className="w-5 h-5 text-black" />
						</button>
					</div>

					{sessionRole !== "employee" ? (
						<div className="flex items-center gap-2">
							<button
								onClick={openExcelImport}
								className="px-4 py-2 rounded-full bg-white border text-black font-semibold flex items-center gap-2"
							>
								<Upload className="w-4 h-4" />
								Import Excel
							</button>
							<button onClick={openCreate} className="px-4 py-2 rounded-full bg-[#FFDA03] text-black font-semibold">
								New Employee
							</button>
						</div>
					) : null}
				</div>
			</div>

			{error ? <div className="text-red-600 text-sm">{error}</div> : null}

			{loading ? (
  <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">
    Loading employees...
  </div>
			) : filtered.length === 0 ? (
  <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">
    No employees found.
  </div>
) : viewMode === "grid" ? (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
					{filtered.map((e) => {
						const name = getFullName(e);
						const profileUrl = getProfileUrl(e.profile_image_path);
						const status = (e.status ?? "").trim().toUpperCase();
						const isActive = status === "ACTIVE";
						const canClick = sessionRole !== "employee";
      const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(
        e.applicant_id
      )}&from=${encodeURIComponent("/Main_Modules/Employees/")}`;

						return (
							<div
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
								className={`bg-white rounded-3xl border shadow-sm p-6 ${
									canClick ? "cursor-pointer hover:shadow-md transition" : ""
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
                <span className="text-gray-500">Job Title:</span>{" "}
                {e.client_position ?? "—"}
										</div>
										<div className="text-xs text-gray-500 truncate">
                <span className="text-gray-500">Detachment:</span>{" "}
                {e.detachment ?? "—"}
										</div>
									</div>
								</div>

								<div className="mt-4 flex items-center justify-between gap-3">
									<span
										className={`px-3 py-1 rounded-full text-xs font-bold ${
											isActive ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
										}`}
									>
										{status || "—"}
									</span>

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

									{sessionRole !== "employee" && (
										<button
											onClick={(ev) => {
												ev.stopPropagation();
											openArchive(e);
										}}
										className="h-9 px-3 rounded-xl bg-[#FFDA03] text-black text-xs font-semibold"
										title="Archive"
									>
										Archive
									</button>
									)}

									{sessionRole === "superadmin" && (
										<button
											onClick={(ev) => {
												ev.stopPropagation();
											openTrash(e);
										}}
										className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-red-600"
										title="Move to Trash"
									>
										<Trash2 className="w-4 h-4" />
									</button>
									)}
								</div>
							</div>
						</div>
					);
					})}
				</div>
) : (
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
					<th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">View</th>
					{sessionRole !== "employee" ? (
						<th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Actions</th>
					) : null}
				</tr>
			</thead>
			<tbody>
				{filtered.map((e) => {
					const profileUrl = getProfileUrl(e.profile_image_path);
					const next = licensureByApplicantId[e.applicant_id] || { nextYmd: null, nextDays: null };
					const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(
						e.applicant_id
					)}&from=${encodeURIComponent("/Main_Modules/Employees/")}`;

					return (
						<tr
							key={e.applicant_id}
							onClick={() => router.push(detailsHref)}
							className="bg-white shadow-sm hover:shadow-md cursor-pointer transition"
						>
							<td className="px-4 py-3 rounded-l-xl">
								<div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden">
									{profileUrl && (
										<img src={profileUrl} alt="" className="h-full w-full object-cover" />
									)}
								</div>
							</td>

							<td className="px-4 py-3 font-semibold">{getFullName(e)}</td>
							<td className="px-4 py-3">{e.client_position ?? "—"}</td>
							<td className="px-4 py-3">{e.gender ?? "—"}</td>
							<td className="px-4 py-3">{e.birth_date ?? "—"}</td>
							<td className="px-4 py-3">{e.age ?? "—"}</td>
							<td className="px-4 py-3">
								{e.date_hired_fsai ? (
									<div className="leading-tight">
										<div>{new Date(e.date_hired_fsai).toLocaleDateString()}</div>
										<div className="text-xs text-gray-500">{formatServiceLengthShort(e.date_hired_fsai)}</div>
									</div>
								) : (
									"—"
								)}
							</td>
							<td className="px-4 py-3">{e.detachment ?? "—"}</td>
							<td className="px-4 py-3">
								{next.nextYmd ? (
									<div className="leading-tight">
										<div>{next.nextYmd}</div>
										<div className="text-xs text-gray-500">
											{next.nextDays == null ? "—" : `${next.nextDays} day(s)`}
										</div>
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
							<td
								className={`px-4 py-3 text-center ${sessionRole === "employee" ? "rounded-r-xl" : ""}`}
							>
								<button
									onClick={(ev) => {
										ev.stopPropagation();
										router.push(detailsHref);
									}}
									className="p-2 rounded-lg hover:bg-gray-100"
									title="View"
								>
									<Eye className="w-5 h-5 text-gray-600" />
								</button>
							</td>
							{sessionRole !== "employee" ? (
								<td className="px-4 py-3 text-center rounded-r-xl">
									<div className="inline-flex items-center gap-2">
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
										<button
											onClick={(ev) => {
												ev.stopPropagation();
												openArchive(e);
											}}
											className="px-3 py-1.5 text-xs rounded-lg bg-[#FFDA03] text-black font-semibold hover:brightness-95"
											title="Archive"
										>
											Archive
										</button>
										{sessionRole === "superadmin" ? (
											<button
												onClick={(ev) => {
													ev.stopPropagation();
													openTrash(e);
												}}
												className="p-2 rounded-lg hover:bg-gray-100"
												title="Move to Trash"
											>
												<Trash2 className="w-5 h-5 text-red-600" />
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
)}


			{trashOpen ? (
				<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
					<div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
						<div className="text-lg font-bold text-black">Move to Trash?</div>
						<div className="mt-2 text-sm text-gray-600">
							This will hide the employee from Employees/Archive. You can restore it from Trash.
						</div>
						<div className="mt-5 flex items-center justify-end gap-2">
							<button
								onClick={() => {
									setTrashOpen(false);
									setTrashEmployee(null);
								}}
								className="px-4 py-2 rounded-xl bg-white border"
							>
								Cancel
							</button>
							<button onClick={confirmTrash} className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold">
								Move to Trash
							</button>
						</div>
					</div>
				</div>
			) : null}

			<EmployeeEditorModal
				open={editorOpen}
				mode={editorMode}
				applicantId={editorApplicantId}
				onClose={() => setEditorOpen(false)}
				onSaved={onSaved}
			/>

			<EmployeeExcelImportModal
				open={excelOpen}
				onClose={() => setExcelOpen(false)}
				onImported={() => {
					fetchEmployees();
				}}
			/>

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
									<div className="text-gray-600 mb-1">Status</div>
									<select
										value={statusFilter}
										onChange={(e) =>
											setStatusFilter(
												e.target.value as "ALL" | "ACTIVE" | "INACTIVE" | "REASSIGN" | "RETIRED"
											)
										}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									>
										<option value="ALL">All</option>
										<option value="ACTIVE">ACTIVE</option>
										<option value="INACTIVE">INACTIVE</option>
										<option value="REASSIGN">REASSIGN</option>
										<option value="RETIRED">RETIRED</option>
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
										onChange={(e) =>
											setYearsServiceFilter(e.target.value as "ALL" | "<1" | "1-5" | ">5")
										}
                                        className="w-full border rounded-xl px-3 py-2 bg-white"
                                   >
                                        <option value="ALL">All</option>
                                        <option value="<1">&lt; 1 year</option>
                                        <option value="1-5">1 – 5 years</option>
                                        <option value=">5">&gt; 5 years</option>
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

								<label className="text-sm text-black md:col-span-2">
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
							</div>
						</div>

						<div className="px-6 pb-6 flex items-center justify-between gap-2">
							<button
								onClick={clearFilters}
								className="px-4 py-2 rounded-xl border bg-white"
							>
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

			{archiveOpen && archiveEmployee ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
					<div className="w-full max-w-lg bg-white rounded-3xl border shadow-xl overflow-hidden">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div>
								<div className="text-lg font-semibold text-black">Archive Employee</div>
								<div className="text-xs text-gray-500">{getFullName(archiveEmployee)}</div>
							</div>
							{/* <button onClick={() => setArchiveOpen(false)} className="px-3 py-2 rounded-xl border bg-white">
								Close
							</button> */}
						</div>

						<div className="p-6 text-sm text-gray-700">This will move the employee to the Archive page.</div>

						<div className="px-6 pb-6 flex items-center justify-end gap-2">
							<button onClick={() => setArchiveOpen(false)} className="px-4 py-2 rounded-xl border bg-white text-black">
								Cancel
							</button>
							<button onClick={confirmArchive} className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
								Archive
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}