"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Pencil, SlidersHorizontal, Upload, LayoutGrid, Table, Search, FileDown, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuthRole, useMyColumnAccess, useMyModuleAccess, useMyModuleDeleteAccess, useMyModuleEditAccess } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";
import EmployeeExcelImportModal from "../../Components/EmployeeExcelImportModal";
import LoadingCircle from "../../Components/LoadingCircle";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import EmployeeStatusMenu from "../Components/EmployeeStatusMenu";
import { addBrandedPdfHeader, buildBrandedAoa, buildBrandedWorkbookBuffer } from "../Components/exportBranding";
import { buildEmployeeStatusUpdatePatch, loadLicensureMap } from "../employeeListData";

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
};

type LicensureRow = {
	applicant_id: string;
	driver_expiration: string | null;
	security_expiration: string | null;
	insurance_expiration: string | null;
};

type EmployeeExpiringSummaryRow = {
	applicant_id: string;
	expires_on: string;
	days_until_expiry: number;
};

type EmployeesElectronApi = {
	notifications?: {
		getExpiringSummary?: (payload?: { limit?: number }) => Promise<{ rows?: EmployeeExpiringSummaryRow[] } | null | undefined>;
	};
};

const EMPLOYEE_COLUMN_TO_DB_FIELDS: Record<string, string[]> = {
	first_name: ["first_name"],
	middle_name: ["middle_name"],
	last_name: ["last_name"],
	client_position: ["client_position"],
	detachment: ["detachment"],
	status: ["status"],
	date_hired_fsai: ["date_hired_fsai"],
	client_email: ["client_email"],
	client_contact_num: ["client_contact_num"],
	gender: ["gender"],
	birth_date: ["birth_date"],
	age: ["age"],
	profile_image_path: ["profile_image_path"],
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
	if (v === "ACTIVE" || v === "APPLICANT" || v === "INACTIVE" || v === "REASSIGN" || v === "RETIRED" || v === "RESIGNED") return v;
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

function weekOfMonth(date: Date) {
	const day = date.getDate();
	return Math.floor((day - 1) / 7) + 1; // 1..5
}

const HIRE_MONTH_OPTIONS = [
	{ value: "ALL", label: "All Months" },
	{ value: "01", label: "January" },
	{ value: "02", label: "February" },
	{ value: "03", label: "March" },
	{ value: "04", label: "April" },
	{ value: "05", label: "May" },
	{ value: "06", label: "June" },
	{ value: "07", label: "July" },
	{ value: "08", label: "August" },
	{ value: "09", label: "September" },
	{ value: "10", label: "October" },
	{ value: "11", label: "November" },
	{ value: "12", label: "December" },
];

export default function EmployeesPage() {
	const router = useRouter();
	const { role: sessionRole } = useAuthRole();
	const { canAccess: canAccessEmployees } = useMyModuleAccess("employees");
	const { canEdit: canEditEmployees } = useMyModuleEditAccess("employees");
	const {
		allowedColumns: allowedEmployeeColumns,
		restricted: employeeColumnsRestricted,
		loading: loadingEmployeeColumns,
		error: employeeColumnsError,
	} = useMyColumnAccess("employees");
	const { canDelete: canDeleteEmployees } = useMyModuleDeleteAccess("employees");
	const api = (globalThis as unknown as { electronAPI?: EmployeesElectronApi }).electronAPI;

	const canViewEmployeeColumn = (columnKey: string) =>
		!employeeColumnsRestricted || allowedEmployeeColumns.has(columnKey);
	const isAdmin = sessionRole === "admin" || sessionRole === "superadmin";
	const canExportEmployees = isAdmin && canViewEmployeeColumn("export_file");
	const canImportEmployees = isAdmin && canViewEmployeeColumn("import_file");
	const canDownloadEmployeeTemplate = isAdmin && canViewEmployeeColumn("export_template");

	const showPhotoColumn = canViewEmployeeColumn("profile_image_path");
	const showNameColumn =
		canViewEmployeeColumn("first_name") || canViewEmployeeColumn("middle_name") || canViewEmployeeColumn("last_name");
	const showPositionColumn = canViewEmployeeColumn("client_position");
	const showGenderColumn = canViewEmployeeColumn("gender");
	const showBirthDateColumn = canViewEmployeeColumn("birth_date");
	const showAgeColumn = canViewEmployeeColumn("age");
	const showHiredDateColumn = canViewEmployeeColumn("date_hired_fsai");
	const showYearsWithCompanyColumn = canViewEmployeeColumn("date_hired_fsai");
	const showDetachmentColumn = canViewEmployeeColumn("detachment");
	const showStatusColumn = canViewEmployeeColumn("status");
	const showEmailColumn = canViewEmployeeColumn("client_email");
	const showPhoneColumn = canViewEmployeeColumn("client_contact_num");

	const exportColumnDefs = useMemo(
		() => {
			const cols: Array<{ key: string; label: string; value: (e: Applicant, now: Date) => string }> = [];
			if (showNameColumn) cols.push({ key: "name", label: "Name", value: (e) => getFullName(e) });
			if (showPositionColumn) cols.push({ key: "job", label: "Job Title", value: (e) => e.client_position ?? "" });
			if (showDetachmentColumn) cols.push({ key: "detachment", label: "Detachment", value: (e) => e.detachment ?? "" });
			if (showGenderColumn) cols.push({ key: "gender", label: "Gender", value: (e) => (e.gender ?? "").trim() });
			if (showHiredDateColumn) {
				cols.push({
					key: "hire_date",
					label: "Hire Date",
					value: (e) => (e.date_hired_fsai ? new Date(e.date_hired_fsai).toLocaleDateString() : ""),
				});
			}
			if (showYearsWithCompanyColumn) {
				cols.push({
					key: "service",
					label: "Service Length",
					value: (e, now) => formatServiceLengthShort(e.date_hired_fsai, now),
				});
			}
			if (showEmailColumn) cols.push({ key: "email", label: "Email", value: (e) => (e.client_email ?? "").trim() });
			if (showPhoneColumn) {
				cols.push({ key: "phone", label: "Phone", value: (e) => (e.client_contact_num ?? "").trim() });
			}

			return cols;
		},
		[
			showNameColumn,
			showPositionColumn,
			showDetachmentColumn,
			showGenderColumn,
			showHiredDateColumn,
			showYearsWithCompanyColumn,
			showEmailColumn,
			showPhoneColumn,
		]
	);

	const employeeColumnsSignature = useMemo(
		() => Array.from(allowedEmployeeColumns).sort().join("|"),
		[allowedEmployeeColumns]
	);

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");
	const [employees, setEmployees] = useState<Applicant[]>([]);
	const [licensureByApplicantId, setLicensureByApplicantId] = useState<
		Record<string, { nextYmd: string | null; nextDays: number | null }>
	>({});
	const [expiringSummaryByApplicantId, setExpiringSummaryByApplicantId] = useState<
		Record<string, { nextYmd: string | null; nextDays: number | null }>
	>({});
	const [search, setSearch] = useState("");
	const [sortBy, setSortBy] = useState<"name" | "last_name" | "letter" | "created_at" | "category" | "expiring" | "service">("name");
	const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
  if (typeof window !== "undefined") {
    return (localStorage.getItem("employees:viewMode") as "grid" | "table") || "grid";
  }
  return "grid";
});



	const [filtersOpen, setFiltersOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "APPLICANT" | "INACTIVE" | "REASSIGN" | "RETIRED">("ALL");
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
	const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
	const [importSummaryOpen, setImportSummaryOpen] = useState(false);

	const [exportOpen, setExportOpen] = useState(false);
	const [exportMonth] = useState("ALL"); // MM
	const [exportWeek] = useState("ALL"); // 1..5
	const [exportTitle, setExportTitle] = useState("Employees Export");

	const [serviceExportOpen, setServiceExportOpen] = useState(false);
	const [serviceExportMonth, setServiceExportMonth] = useState("ALL");
	const [serviceExportTitle, setServiceExportTitle] = useState("Employees 1+ Year Export");
	const [serviceExportShowBirthday, setServiceExportShowBirthday] = useState(false);

	const [archiveOpen, setArchiveOpen] = useState(false);
	const [archiveEmployee, setArchiveEmployee] = useState<Applicant | null>(null);
	const fetchRunIdRef = useRef(0);

	const fetchEmployees = useCallback(async () => {
		const fetchRunId = ++fetchRunIdRef.current;
		if (loadingEmployeeColumns) {
			setLoading(true);
			return;
		}

		setLoading(true);
		setError(employeeColumnsError || "");
		try {
			const selectFields = new Set<string>(["applicant_id", "created_at", "is_archived", "is_trashed"]);
			for (const [columnKey, dbFields] of Object.entries(EMPLOYEE_COLUMN_TO_DB_FIELDS)) {
				const canViewColumn = !employeeColumnsRestricted || allowedEmployeeColumns.has(columnKey);
				if (!canViewColumn) continue;
				for (const field of dbFields) {
					selectFields.add(field);
				}
			}

			const { data, error: fetchError } = await supabase
				.from("applicants")
				.select(Array.from(selectFields).join(", "))
				.eq("is_archived", false)
				.eq("is_trashed", false)
				.order("created_at", { ascending: false })
				.limit(500);

			if (fetchError) {
				console.error(fetchError);
				setError(fetchError.message || "Failed to load employees");
				setEmployees([]);
				setLicensureByApplicantId({});
				setExpiringSummaryByApplicantId({});
			} else {
				const list = ((data ?? []) as unknown as Applicant[]);
				setEmployees(list);

				setLoading(false);

				void (async () => {
					const ids = list.map((x) => x.applicant_id).filter(Boolean);
					try {
						const [licMap, expiringRes] = await Promise.all([
							loadLicensureMap(ids),
							api?.notifications?.getExpiringSummary ? api.notifications.getExpiringSummary({ limit: 200 }) : Promise.resolve(null),
						]);

						if (fetchRunIdRef.current !== fetchRunId) return;
						setLicensureByApplicantId(licMap);

						if (api?.notifications?.getExpiringSummary) {
							const rows = ((expiringRes as { rows?: EmployeeExpiringSummaryRow[] } | null | undefined)?.rows ?? []);
							const map: Record<string, { nextYmd: string | null; nextDays: number | null }> = {};
							for (const r of rows) {
								const id = String(r.applicant_id || "");
								if (!id) continue;
								const expiresYmd = ymd(r.expires_on) ?? null;
								const days = Number.isFinite(Number(r.days_until_expiry)) ? Number(r.days_until_expiry) : null;
								const existing = map[id];
								const better = (cur: { nextYmd: string | null; nextDays: number | null } | undefined) => {
									if (!cur?.nextYmd) return true;
									if (!expiresYmd) return false;
									return expiresYmd < cur.nextYmd;
								};
								if (better(existing)) map[id] = { nextYmd: expiresYmd, nextDays: days };
							}
							setExpiringSummaryByApplicantId(map);
						}
					} catch {
						if (fetchRunIdRef.current === fetchRunId) {
							setLicensureByApplicantId({});
							setExpiringSummaryByApplicantId({});
						}
					}
				})();
			}
		} finally {
			if (fetchRunIdRef.current === fetchRunId) setLoading(false);
		}
	}, [
		loadingEmployeeColumns,
		employeeColumnsError,
		employeeColumnsRestricted,
		allowedEmployeeColumns,
		api,
	]);

	useEffect(() => {
  if (typeof window !== "undefined") {
    localStorage.setItem("employees:viewMode", viewMode);
  }
}, [viewMode]);


	useEffect(() => {
		if (loadingEmployeeColumns) return;

		void fetchEmployees();

		const channel = supabase
			.channel("realtime:applicants-employees")
			.on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => {
				void fetchEmployees();
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [loadingEmployeeColumns, employeeColumnsSignature, fetchEmployees]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		let list = employees;

				// By default Employees page shows Active/Inactive.
				// If the admin explicitly filters for REASSIGN/RETIRED/APPLICANT, allow it.
		if (statusFilter === "ALL") {
			list = list.filter((e) => {
				const s = normalizeStatus(e.status);
						return s !== "REASSIGN" && s !== "RETIRED" && s !== "RESIGNED" && s !== "APPLICANT";
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
			if (sortBy === "expiring") {
				const aDaysRaw = (expiringSummaryByApplicantId[a.applicant_id]?.nextDays ?? licensureByApplicantId[a.applicant_id]?.nextDays) ?? null;
				const bDaysRaw = (expiringSummaryByApplicantId[b.applicant_id]?.nextDays ?? licensureByApplicantId[b.applicant_id]?.nextDays) ?? null;
				const score = (days: number | null) => {
					if (days == null) return 1_000_000;
					// Put already-expired after upcoming expirations.
					return days < 0 ? 500_000 + Math.abs(days) : days;
				};
				const d = score(aDaysRaw) - score(bDaysRaw);
				return d !== 0 ? d : getFullName(a).localeCompare(getFullName(b));
			}
			if (sortBy === "service") {
				const ay = serviceYearsExact(a.date_hired_fsai, new Date());
				const by = serviceYearsExact(b.date_hired_fsai, new Date());
				// Longest service first; missing join dates last.
				const score = (v: number | null) => (v == null ? -1 : v);
				const d = score(by) - score(ay);
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
	expiringSummaryByApplicantId,
  statusFilter,
  genderFilter,
  detachmentFilter,
  positionFilter,
  hasPhotoFilter,
  hiredMonthFilter,
  yearsServiceFilter,
]);

	const exportCandidates = useMemo(() => {
		return filtered.filter((e) => {
			if (exportMonth !== "ALL" || exportWeek !== "ALL") {
				if (!e.date_hired_fsai) return false;
				const hired = new Date(e.date_hired_fsai);
				if (Number.isNaN(hired.getTime())) return false;
				if (exportMonth !== "ALL") {
					const m = String(hired.getMonth() + 1).padStart(2, "0");
					if (m !== exportMonth) return false;
				}
				if (exportWeek !== "ALL") {
					const w = String(weekOfMonth(hired));
					if (w !== exportWeek) return false;
				}
			}

			return true;
		});
	}, [filtered, exportMonth, exportWeek]);

	const exportExpiringRows = useMemo(() => {
		const items = filtered
			.map((e) => {
				const next = expiringSummaryByApplicantId[e.applicant_id] ?? licensureByApplicantId[e.applicant_id] ?? { nextYmd: null, nextDays: null };
				if (!next.nextYmd) return null;
				return {
					applicant_id: e.applicant_id,
					name: showNameColumn ? getFullName(e) : "Employee",
					job: showPositionColumn ? e.client_position ?? "—" : "—",
					detachment: showDetachmentColumn ? e.detachment ?? "—" : "—",
					expires_on: next.nextYmd,
					days: next.nextDays,
				};
			})
			.filter((v): v is { applicant_id: string; name: string; job: string; detachment: string; expires_on: string; days: number | null } => Boolean(v));

		items.sort((a, b) => {
			const ad = a.days == null ? Number.POSITIVE_INFINITY : a.days;
			const bd = b.days == null ? Number.POSITIVE_INFINITY : b.days;
			return ad - bd;
		});

		return items.slice(0, 200);
	}, [filtered, expiringSummaryByApplicantId, licensureByApplicantId, showNameColumn, showPositionColumn, showDetachmentColumn]);

	const exportServiceRows = useMemo(() => {
		const now = new Date();
		const items = filtered
			.map((e) => {
				const years = serviceYearsExact(e.date_hired_fsai, now);
				if (years == null || years < 1) return null;
				const hiredDate = e.date_hired_fsai ? new Date(e.date_hired_fsai) : null;
				const birthdayDate = e.birth_date ? new Date(e.birth_date) : null;
				const hasHiredDate = Boolean(hiredDate && !Number.isNaN(hiredDate.getTime()));
				const hasBirthdayDate = Boolean(birthdayDate && !Number.isNaN(birthdayDate.getTime()));
				return {
					applicant_id: e.applicant_id,
					name: showNameColumn ? getFullName(e) : "Employee",
					job: showPositionColumn ? e.client_position ?? "—" : "—",
					detachment: showDetachmentColumn ? e.detachment ?? "—" : "—",
					hired_on: hasHiredDate && hiredDate ? hiredDate.toLocaleDateString() : "—",
					birthday: hasBirthdayDate && birthdayDate ? birthdayDate.toLocaleDateString() : "—",
					hired_month: hasHiredDate && hiredDate ? String(hiredDate.getMonth() + 1).padStart(2, "0") : null,
					service: formatServiceLengthShort(e.date_hired_fsai, now),
					years,
				};
			})
			.filter(
				(v): v is {
					applicant_id: string;
					name: string;
					job: string;
					detachment: string;
					hired_on: string;
					birthday: string;
					hired_month: string | null;
					service: string;
					years: number;
				} => Boolean(v)
			)
			.sort((a, b) => b.years - a.years);

		return items.slice(0, 300);
	}, [filtered, showNameColumn, showPositionColumn, showDetachmentColumn]);

	const exportServiceRowsFiltered = useMemo(() => {
		if (serviceExportMonth === "ALL") return exportServiceRows;
		return exportServiceRows.filter((row) => row.hired_month === serviceExportMonth);
	}, [exportServiceRows, serviceExportMonth]);

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

	// Expiring list is handled in the top navigation dropdown (Main_Modules layout).

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
		if (!canImportEmployees) return;
		setExcelOpen(true);
	}

	function openEdit(employee: Applicant) {
		if (!canEditEmployees) {
			setError("Edit access is restricted.");
			return;
		}
		setEditorMode("edit");
		setEditorApplicantId(employee.applicant_id);
		setEditorOpen(true);
	}

	function openArchive(employee: Applicant) {
		if (!canEditEmployees) {
			setError("Edit access is restricted.");
			return;
		}
		setArchiveEmployee(employee);
		setArchiveOpen(true);
	}

	async function updateEmployeeStatus(employee: Applicant, nextStatus: string) {
		setError("");
		if (!canEditEmployees) {
			setError("Edit access is restricted.");
			return;
		}
		const { error: updateError } = await supabase
			.from("applicants")
			.update(buildEmployeeStatusUpdatePatch(nextStatus))
			.eq("applicant_id", employee.applicant_id);

		if (updateError) {
			console.error(updateError);
			setError(updateError.message || "Failed to update employee status");
			return;
		}

		await fetchEmployees();
	}

	async function deleteEmployee(employee: Applicant) {
		setError("");
		if (!canAccessEmployees) {
			setError("Access to Employees is restricted.");
			return;
		}
		if (!canDeleteEmployees) {
			setError("Delete access is restricted.");
			return;
		}
		const ok = window.confirm(`Delete ${getFullName(employee)}? This will move the employee to trash.`);
		if (!ok) return;

		const { error: deleteError } = await supabase
			.from("applicants")
			.update({
				is_trashed: true,
				trashed_at: new Date().toISOString(),
				trashed_by: null,
			})
			.eq("applicant_id", employee.applicant_id);

		if (deleteError) {
			console.error(deleteError);
			setError(deleteError.message || "Failed to delete employee");
			return;
		}

		await fetchEmployees();
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


	async function onSaved(applicantId: string, savedStatus: string) {
		await fetchEmployees();
		const normalized = normalizeStatus(savedStatus);
		if (normalized === "RESIGNED") {
			router.push("/Main_Modules/Resigned/");
			return;
		}
		if (editorMode === "create" && normalized !== "RETIRED" && normalized !== "REASSIGN") {
			router.push(
				`/Main_Modules/Employees/details/?id=${encodeURIComponent(applicantId)}&from=${encodeURIComponent(
					"/Main_Modules/Employees/"
				)}`
			);
		}
	}

	function exportFileBase() {
		const parts = ["employees"];
		if (exportMonth !== "ALL") parts.push(`m${exportMonth}`);
		if (exportWeek !== "ALL") parts.push(`w${exportWeek}`);
		parts.push(new Date().toISOString().slice(0, 10));
		return parts.join("_");
	}

	function exportEmployeesCsv() {
		setError("");
		const rows = exportCandidates;
		if (!rows.length) {
			setError("No employees match the export filters.");
			return;
		}
		if (!exportColumnDefs.length) {
			setError("No permitted columns are available for export.");
			return;
		}

		const now = new Date();
		const title = exportTitle.trim() || "Employees Export";
		const subtitle = `Generated: ${new Date().toLocaleString()}`;
		const exportRows = rows.map((e) =>
			Object.fromEntries(exportColumnDefs.map((c) => [c.label, c.value(e, now)]))
		) as Record<string, string>[];
		const ws = XLSX.utils.aoa_to_sheet(buildBrandedAoa(exportRows, title, subtitle));
		const csv = XLSX.utils.sheet_to_csv(ws);
		downloadBlob(`${exportFileBase()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
		setExportOpen(false);
	}

	async function exportEmployeesXlsx() {
		setError("");
		const rows = exportCandidates;
		if (!rows.length) {
			setError("No employees match the export filters.");
			return;
		}
		if (!exportColumnDefs.length) {
			setError("No permitted columns are available for export.");
			return;
		}
		const title = exportTitle.trim() || "Employees Export";

		const now = new Date();
		const subtitle = `Generated: ${new Date().toLocaleString()}`;
		const exportRows = rows.map((e) =>
			Object.fromEntries(exportColumnDefs.map((c) => [c.label, c.value(e, now)]))
		) as Record<string, string>[];

		const out = await buildBrandedWorkbookBuffer([
			{
				name: "Employees",
				title,
				subtitle,
				rows: exportRows,
			},
		]);
		downloadBlob(
			`${exportFileBase()}.xlsx`,
			new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
		);
		setExportOpen(false);
	}

	async function exportExpiringPdf() {
		setError("");
		const title = exportTitle.trim() || "Employees Export";
		const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

		if (!exportExpiringRows.length) {
			setError("No expiring license rows to export.");
			return;
		}

		const startY = await addBrandedPdfHeader(doc, title, "Expiring Licenses");
		autoTable(doc, {
			startY: startY + 10,
			head: [["Name", "Job Title", "Detachment", "Expiry Date", "Days Until Expiry"]],
			body: exportExpiringRows.map((r) => [
				r.name,
				r.job,
				r.detachment,
				r.expires_on,
				r.days == null ? "—" : String(r.days),
			]),
			styles: { fontSize: 8, cellPadding: 3 },
			headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
		});

		doc.save(`employees_expiring_${new Date().toISOString().slice(0, 10)}.pdf`);
		setExportOpen(false);
	}

	function serviceExportFileBase() {
		const parts = ["employees_service", serviceExportMonth === "ALL" ? "all-months" : `m${serviceExportMonth}`];
		if (serviceExportShowBirthday) parts.push("birthday");
		parts.push(new Date().toISOString().slice(0, 10));
		return parts.join("_");
	}

	async function exportServiceXlsx() {
		setError("");
		const rows = exportServiceRowsFiltered;
		if (!rows.length) {
			setError("No employees with one year or more in company for the selected month.");
			return;
		}

		const monthLabel =
			HIRE_MONTH_OPTIONS.find((opt) => opt.value === serviceExportMonth)?.label ?? "All Months";
		const title = serviceExportTitle.trim() || "Employees 1+ Year Export";
		const subtitle = `Generated: ${new Date().toLocaleString()} • Month Filter: ${monthLabel}`;
		const exportRows = rows.map((row) =>
			serviceExportShowBirthday
				? {
					Name: row.name,
					"Job Title": row.job,
					Detachment: row.detachment,
					"Hired Date": row.hired_on,
					Birthday: row.birthday,
					"Years w/ Company": row.service,
				}
				: {
					Name: row.name,
					"Job Title": row.job,
					Detachment: row.detachment,
					"Hired Date": row.hired_on,
					"Years w/ Company": row.service,
				}
		);
		const out = await buildBrandedWorkbookBuffer([
			{
				name: "1+ Year In Company",
				title,
				subtitle,
				rows: exportRows,
			},
		]);
		downloadBlob(
			`${serviceExportFileBase()}.xlsx`,
			new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
		);
		setServiceExportOpen(false);
	}

	async function exportServicePdf() {
		setError("");
		const rows = exportServiceRowsFiltered;
		if (!rows.length) {
			setError("No employees with one year or more in company for the selected month.");
			return;
		}

		const monthLabel =
			HIRE_MONTH_OPTIONS.find((opt) => opt.value === serviceExportMonth)?.label ?? "All Months";
		const title = serviceExportTitle.trim() || "Employees 1+ Year Export";
		const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
		const subtitle = `Month Filter: ${monthLabel}`;
		const head = serviceExportShowBirthday
			? [["Name", "Job Title", "Detachment", "Hired Date", "Birthday", "Years w/ Company"]]
			: [["Name", "Job Title", "Detachment", "Hired Date", "Years w/ Company"]];
		const body = rows.map((r) =>
			serviceExportShowBirthday
				? [r.name, r.job, r.detachment, r.hired_on, r.birthday, r.service]
				: [r.name, r.job, r.detachment, r.hired_on, r.service]
		);

		const startY = await addBrandedPdfHeader(doc, title, subtitle);
		autoTable(doc, {
			startY: startY + 10,
			head,
			body,
			styles: { fontSize: 8, cellPadding: 3 },
			headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
		});

		doc.save(`${serviceExportFileBase()}.pdf`);
		setServiceExportOpen(false);
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
							placeholder="Search name, email, phone, status, detachment, etc."
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
									e.target.value as "name" | "last_name" | "letter" | "created_at" | "category" | "expiring" | "service"
								)
							}
							className="px-4 py-2 rounded-full bg-white text-black font-medium border border-gray-300"
						>
							<option value="name">Name</option>
							<option value="last_name">Last Name</option>
							<option value="letter">Letter (A-Z)</option>
							<option value="created_at">Newest Date</option>
							<option value="category">Category</option>
							<option value="expiring">Expiring Licenses</option>
							<option value="service">Years of Service</option>
						</select>
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

						{canAccessEmployees ? (
						<div className="flex items-center gap-2">
							{canExportEmployees ? (
								<>
									<button
										type="button"
										onClick={() => setExportOpen(true)}
										className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center"
										aria-label="Export"
										title="Export"
									>
										<FileDown className="w-5 h-5 text-gray-800" />
									</button>
									<button
										type="button"
										onClick={() => setServiceExportOpen(true)}
										className="h-10 px-3 rounded-xl border bg-white flex items-center gap-2 text-xs font-semibold text-black"
										aria-label="1+ Year In Company Export"
										title="1+ Year In Company Export"
									>
										<FileText className="w-4 h-4 text-gray-800" />
										<span>1+ Year</span>
									</button>
								</>
							) : null}

							{canImportEmployees ? (
								<button
									onClick={openExcelImport}
									className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center"
									aria-label="Import Excel"
									title="Import Excel"
								>
									<Upload className="w-5 h-5 text-gray-800" />
								</button>
							) : null}
							<button onClick={openCreate} className="px-4 py-2 rounded-full bg-[#FFDA03] text-black font-semibold">
								New Employee
							</button>
						</div>
					) : null}
				</div>
			</div>

			{error ? <div className="text-red-600 text-sm">{error}</div> : null}

			{loading ? (
				<div className="glass-panel animate-slide-up rounded-2xl p-8">
					<LoadingCircle label="Loading employees..." />
				</div>
			) : filtered.length === 0 ? (
  <div className="glass-panel animate-slide-up rounded-2xl p-8 text-center text-gray-500">
    No employees found.
  </div>
) : viewMode === "grid" ? (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
					{filtered.map((e) => {
						const name = getFullName(e);
						const profileUrl = getProfileUrl(e.profile_image_path);
						const status = normalizeStatus(e.status);
						const canClick = canAccessEmployees;
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
								className={`glass-panel animate-slide-up rounded-3xl p-6 animated-row hover:shadow-xl ${
									canClick ? "cursor-pointer" : ""
								}`}
							>
								<div className="flex items-center gap-4">
									{showPhotoColumn ? (
										<div className="h-16 w-16 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
											{profileUrl ? (
												<img src={profileUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
											) : (
												<div className="text-xs text-gray-500">No Photo</div>
											)}
										</div>
									) : null}
									<div className="min-w-0">
										{showNameColumn ? <div className="text-sm font-bold text-gray-900 truncate">{name}</div> : null}
										<div className="text-xs text-gray-500 truncate">{shortCode(e.applicant_id)}</div>
										{showPositionColumn ? (
											<div className="mt-1 text-xs text-gray-500 truncate">
												<span className="text-gray-500">Job Title:</span>{" "}
												{e.client_position ?? "—"}
											</div>
										) : null}
										{showDetachmentColumn ? (
											<div className="text-xs text-gray-500 truncate">
												<span className="text-gray-500">Detachment:</span>{" "}
												{e.detachment ?? "—"}
											</div>
										) : null}
										{showYearsWithCompanyColumn ? (
											<div className="text-xs text-gray-500 truncate">
												<span className="text-gray-500">Years w/ Company:</span>{" "}
												{formatServiceLengthShort(e.date_hired_fsai)}
											</div>
										) : null}
									</div>
								</div>

								<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex items-center gap-2">
										{canEditEmployees ? (
											<EmployeeStatusMenu value={status} onChange={(nextStatus) => void updateEmployeeStatus(e, nextStatus)} />
										) : (
											<span
												className={`px-3 py-1 rounded-full text-xs font-bold ${
													status === "ACTIVE" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
												}`}
											>
												{status || "—"}
											</span>
										)}
									</div>

									<div className="flex flex-wrap items-center justify-end gap-2">
										{canAccessEmployees && canDeleteEmployees ? (
											<button
												onClick={(ev) => {
													ev.stopPropagation();
													void deleteEmployee(e);
												}}
												className="animated-btn h-9 px-3 rounded-xl border border-red-200 bg-white text-red-600 text-xs font-semibold"
												title="Delete"
												type="button"
											>
												Delete
											</button>
											) : null}

										{canEditEmployees ? (
											<button
												onClick={(ev) => {
													ev.stopPropagation();
													openArchive(e);
												}}
												className="animated-btn h-9 px-3 rounded-xl bg-[#FFDA03] text-black text-xs font-semibold"
												title="Archive"
												type="button"
											>
												Archive
											</button>
											) : null}

										{canEditEmployees ? (
											<button
												onClick={(ev) => {
													ev.stopPropagation();
													openEdit(e);
												}}
												className="animated-btn h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
												title="Edit"
											>
												<Pencil className="w-4 h-4" />
											</button>
											) : null}

									{/* Trash page removed */}
								</div>
							</div>
						</div>
					);
					})}
				</div>
) : (
	<TableZoomWrapper storageKey="employees">
	<div className="relative overflow-x-auto rounded-2xl glass-panel animate-slide-up">
		<table className="min-w-[1200px] w-full text-sm text-black border-separate border-spacing-y-2">
			<thead className="sticky top-0 z-10">
				<tr className="bg-[#FFDA03]">
					{showPhotoColumn ? <th className="px-4 py-3 text-left font-semibold text-black first:rounded-l-xl">Photo</th> : null}
					{showNameColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Name</th> : null}
					{showPositionColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Position</th> : null}
					{showGenderColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Gender</th> : null}
					{showBirthDateColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Birth Date</th> : null}
					{showAgeColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Age</th> : null}
					{showHiredDateColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Hired Date</th> : null}
					{showYearsWithCompanyColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Years w/ Company</th> : null}
					{showDetachmentColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Detachment</th> : null}
					<th className="px-4 py-3 text-left font-semibold text-black">Next License Expiry</th>
					{showStatusColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Status</th> : null}
					{canAccessEmployees ? (
						<th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Actions</th>
					) : null}
				</tr>
			</thead>
			<tbody>
				{filtered.map((e) => {
					const profileUrl = getProfileUrl(e.profile_image_path);
					const next = licensureByApplicantId[e.applicant_id] || { nextYmd: null, nextDays: null };
					const canClick = canAccessEmployees;
					const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(
						e.applicant_id
					)}&from=${encodeURIComponent("/Main_Modules/Employees/")}`;

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
							className={`animated-row border-b border-gray-100 ${canClick ? "cursor-pointer hover:shadow-md" : ""}`}
						>
							{showPhotoColumn ? (
								<td className="px-4 py-3 rounded-l-xl">
									<div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden">
										{profileUrl && (
											<img src={profileUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
										)}
									</div>
								</td>
							) : null}

							{showNameColumn ? <td className="px-4 py-3 font-semibold">{getFullName(e)}</td> : null}
							{showPositionColumn ? <td className="px-4 py-3">{e.client_position ?? "—"}</td> : null}
							{showGenderColumn ? <td className="px-4 py-3">{e.gender ?? "—"}</td> : null}
							{showBirthDateColumn ? <td className="px-4 py-3">{e.birth_date ?? "—"}</td> : null}
							{showAgeColumn ? <td className="px-4 py-3">{e.age ?? "—"}</td> : null}
							{showHiredDateColumn ? (
								<td className="px-4 py-3">{e.date_hired_fsai ? new Date(e.date_hired_fsai).toLocaleDateString() : "—"}</td>
							) : null}
							{showYearsWithCompanyColumn ? <td className="px-4 py-3">{formatServiceLengthShort(e.date_hired_fsai)}</td> : null}
							{showDetachmentColumn ? <td className="px-4 py-3">{e.detachment ?? "—"}</td> : null}
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
							{showStatusColumn ? (
								<td className="px-4 py-3">
									{canEditEmployees ? (
										<EmployeeStatusMenu value={normalizeStatus(e.status)} onChange={(nextStatus) => void updateEmployeeStatus(e, nextStatus)} />
									) : (
										<span
											className={`px-3 py-1 rounded-full text-xs font-bold ${
												normalizeStatus(e.status) === "ACTIVE" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
											}`}
										>
											{normalizeStatus(e.status)}
										</span>
									)}
								</td>
							) : null}
							{canAccessEmployees && (canDeleteEmployees || canEditEmployees) ? (
								<td className="px-4 py-3 text-center rounded-r-xl">
									<div className="inline-flex items-center gap-2">
										<button
											onClick={(ev) => {
												ev.stopPropagation();
												void deleteEmployee(e);
											}}
											className="px-3 py-1.5 text-xs rounded-lg border border-red-200 bg-white text-red-600 font-semibold hover:bg-red-50"
											title="Delete"
											type="button"
										>
											Delete
										</button>
										<button
											onClick={(ev) => {
												ev.stopPropagation();
												openArchive(e);
											}}
											className="px-3 py-1.5 text-xs rounded-lg bg-[#FFDA03] text-black font-semibold hover:brightness-95"
											title="Archive"
											type="button"
										>
											Archive
										</button>
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
										{/* Trash page removed */}
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
)}



			{exportOpen && canExportEmployees ? (
				<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
					<div className="glass-panel rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden animate-scale-in">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div className="text-lg font-bold text-black">Export</div>
							<div className="flex items-center gap-2">
								<button
									onClick={() => setExportOpen(false)}
									className="px-3 py-2 rounded-xl border bg-white text-black"
									type="button"
								>
									Close
								</button>
							</div>
						</div>

						<div className="p-6 space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Title</div>
									<input
										value={exportTitle}
										onChange={(e) => setExportTitle(e.target.value)}
										className="w-full border rounded-xl px-3 py-2 bg-white"
										placeholder="Employees Export"
									/>
								</label>

								<div className="flex items-end justify-end gap-2">
									<button
										type="button"
										onClick={exportEmployeesCsv}
										className="h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-white"
										title="Download CSV"
										aria-label="Download CSV"
									>
										CSV
									</button>
									<button
										type="button"
										onClick={exportEmployeesXlsx}
										className="h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-white"
										title="Download XLSX"
										aria-label="Download XLSX"
									>
										XLSX
									</button>
									<button
										type="button"
										onClick={exportExpiringPdf}
										className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center hover:bg-white"
										title="Download PDF"
										aria-label="Download PDF"
									>
										<FileText className="w-5 h-5 text-gray-800" />
									</button>
								</div>
							</div>

							<div className="rounded-2xl border overflow-hidden">
								<div className="px-4 py-2 border-b bg-[#FFDA03]/20 text-sm font-semibold text-black">
									Expiring Licenses ({exportExpiringRows.length})
								</div>

								<div className="max-h-[360px] overflow-auto">
									{exportExpiringRows.length ? (
										<table className="w-full text-sm text-black">
											<thead className="bg-white sticky top-0 z-10">
												<tr>
													<th className="px-3 py-2 text-left">Name</th>
													<th className="px-3 py-2 text-left">Job</th>
													<th className="px-3 py-2 text-left">Detachment</th>
													<th className="px-3 py-2 text-left">Expiry</th>
													<th className="px-3 py-2 text-left">Days</th>
												</tr>
											</thead>
											<tbody>
												{exportExpiringRows.map((r) => (
													<tr key={`${r.applicant_id}:${r.expires_on}`} className="border-t">
														<td className="px-3 py-2">{r.name}</td>
														<td className="px-3 py-2">{r.job}</td>
														<td className="px-3 py-2">{r.detachment}</td>
														<td className="px-3 py-2">{r.expires_on}</td>
														<td className="px-3 py-2">{r.days == null ? "—" : r.days}</td>
													</tr>
												))}
											</tbody>
										</table>
									) : (
										<div className="px-4 py-6 text-sm text-gray-500">No expiring licenses found.</div>
									)}
								</div>
							</div>

							<div className="rounded-2xl border bg-white px-4 py-3 text-sm text-gray-700">
								For 1+ year service exports, use the separate 1+ Year button beside the main export button.
							</div>
						</div>
					</div>
				</div>
			) : null}

			{serviceExportOpen && canExportEmployees ? (
				<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
					<div className="glass-panel rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden animate-scale-in">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div className="text-lg font-bold text-black">1+ Year In Company Export</div>
							<button
								onClick={() => setServiceExportOpen(false)}
								className="px-3 py-2 rounded-xl border bg-white text-black"
								type="button"
							>
								Close
							</button>
						</div>

						<div className="p-6 space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-[1fr_220px_220px_auto] gap-4">
								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Title</div>
									<input
										value={serviceExportTitle}
										onChange={(e) => setServiceExportTitle(e.target.value)}
										className="w-full border rounded-xl px-3 py-2 bg-white"
										placeholder="Employees 1+ Year Export"
									/>
								</label>

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Hired Month</div>
									<select
										value={serviceExportMonth}
										onChange={(e) => setServiceExportMonth(e.target.value)}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									>
										{HIRE_MONTH_OPTIONS.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
								</label>

								<label className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2 text-sm text-black">
									<input
										type="checkbox"
										checked={serviceExportShowBirthday}
										onChange={(e) => setServiceExportShowBirthday(e.target.checked)}
										className="h-4 w-4 accent-[#FFDA03]"
									/>
									<div>
										<div className="font-medium">Display birthday</div>
										<div className="text-xs text-gray-500">Adds a birthday column for 1+ year employees.</div>
									</div>
								</label>

								<div className="flex items-end justify-end gap-2">
									<button
										type="button"
										onClick={exportServiceXlsx}
										className="h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-white"
										title="Download XLSX"
										aria-label="Download XLSX"
									>
										XLSX
									</button>
									<button
										type="button"
										onClick={exportServicePdf}
										className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center hover:bg-white"
										title="Download PDF"
										aria-label="Download PDF"
									>
										<FileText className="w-5 h-5 text-gray-800" />
									</button>
								</div>
							</div>

							<div className="rounded-2xl border overflow-hidden">
								<div className="px-4 py-2 border-b bg-[#FFDA03]/20 text-sm font-semibold text-black">
									1+ Year In Company ({exportServiceRowsFiltered.length})
								</div>
								<div className="max-h-[360px] overflow-auto">
									{exportServiceRowsFiltered.length ? (
										<table className="w-full text-sm text-black">
											<thead className="bg-white sticky top-0 z-10">
												<tr>
													<th className="px-3 py-2 text-left">Name</th>
													<th className="px-3 py-2 text-left">Job</th>
													<th className="px-3 py-2 text-left">Detachment</th>
													<th className="px-3 py-2 text-left">Hired Date</th>
													{serviceExportShowBirthday ? <th className="px-3 py-2 text-left">Birthday</th> : null}
													<th className="px-3 py-2 text-left">Years w/ Company</th>
												</tr>
											</thead>
											<tbody>
												{exportServiceRowsFiltered.map((row) => (
													<tr key={row.applicant_id} className="border-t">
														<td className="px-3 py-2">{row.name}</td>
														<td className="px-3 py-2">{row.job}</td>
														<td className="px-3 py-2">{row.detachment}</td>
														<td className="px-3 py-2">{row.hired_on}</td>
														{serviceExportShowBirthday ? <td className="px-3 py-2">{row.birthday}</td> : null}
														<td className="px-3 py-2">{row.service}</td>
													</tr>
												))}
											</tbody>
										</table>
									) : (
										<div className="px-4 py-6 text-sm text-gray-500">
											No employees with one year or more in company for the selected month.
										</div>
									)}
								</div>
							</div>

							<div className="rounded-2xl border bg-white px-4 py-3 text-sm text-gray-700">
								Use Hired Month = All Months to list every employee with at least one year of service.
							</div>
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
				onDeleted={fetchEmployees}
			/>

			<EmployeeExcelImportModal
				open={excelOpen}
				onClose={() => setExcelOpen(false)}
				allowTemplateDownloads={canDownloadEmployeeTemplate}
				onImported={(summary) => {
					setImportSummary(summary);
					setImportSummaryOpen(true);
					fetchEmployees();
				}}
			/>

			<ImportSummaryModal
				open={importSummaryOpen}
				summary={importSummary}
				title="Employees Import Summary"
				onClose={() => setImportSummaryOpen(false)}
			/>

			{filtersOpen ? (
				<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
					<div className="glass-panel animate-scale-in rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div className="text-lg font-bold text-black">Filters</div>
							<button
								onClick={() => setFiltersOpen(false)}
								className="px-3 py-2 rounded-xl border bg-white text-black"
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
												e.target.value as "ALL" | "ACTIVE" | "APPLICANT" | "INACTIVE" | "REASSIGN" | "RETIRED"
											)
										}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									>
										<option value="ALL">All</option>
										<option value="ACTIVE">ACTIVE</option>
										<option value="APPLICANT">APPLICANT</option>
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
					<div className="w-full max-w-lg glass-panel animate-scale-in rounded-3xl shadow-xl overflow-hidden">
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
