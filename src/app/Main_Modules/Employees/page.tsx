"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { useSignedStorageUrlMap } from "../../Client/useSignedStorageUrls";
import { Pencil, SlidersHorizontal, Upload, LayoutGrid, Table, Search, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuthRole, useMyColumnAccess, useMyModuleAccess, useMyModuleDeleteAccess, useMyModuleEditAccess } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";
import EmployeeExcelImportModal from "../../Components/EmployeeExcelImportModal";
import LoadingCircle from "../../Components/LoadingCircle";
import PageLoading from "../../Components/PageLoading";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import EmployeeStatusMenu from "../Components/EmployeeStatusMenu";
import DetachmentHistoryPopover from "../Components/DetachmentHistoryPopover";
import { addBrandedPdfHeader, buildBrandedWorkbookBuffer } from "../Components/exportBranding";
import { buildEmployeeStatusUpdatePatch, loadLicensureMap } from "../employeeListData";
import { useLiveNow } from "../../Client/useLiveNow";
import { downloadBlob, downloadPdf } from "@/app/Components/fileDownload";

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
	birth_date: string | null;
	age: number | null;
	client_contact_num: string | null;
	client_email: string | null;
	profile_image_path: string | null;
	is_archived: boolean | null;
	is_trashed?: boolean | null;
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
	custom_id: ["custom_id"],
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

function shortCode(id: string) {
	return `EMP-${id.slice(0, 2).toUpperCase()}-${id.slice(2, 5).toUpperCase()}`;
}

function normalizeStatus(input: string | null) {
	const v = (input ?? "").trim().toUpperCase();
	if (!v) return "ACTIVE";
	if (v === "ACTIVE" || v === "APPLICANT" || v === "INACTIVE" || v === "AWOL" || v === "RETIRED" || v === "RESIGNED" || v === "FLOATING") return v;
	if (v === "REASSIGN") return "AWOL";
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

function serviceYearsCompleted(fromIso: string | null, now = new Date()) {
	if (!fromIso) return null;
	const d = new Date(fromIso);
	if (Number.isNaN(d.getTime())) return null;
	return diffYearsMonthsDays(d, now).years;
}

function ymd(value: string | null) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10);
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
	const { canAccess: canAccessEmployees, loading: accessLoading } = useMyModuleAccess("employees");
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
	const liveNow = useLiveNow();

	const showPhotoColumn = canViewEmployeeColumn("profile_image_path");
	const showNameColumn =
		canViewEmployeeColumn("first_name") || canViewEmployeeColumn("middle_name") || canViewEmployeeColumn("last_name");
	const showPositionColumn = canViewEmployeeColumn("client_position");
	const showHiredDateColumn = canViewEmployeeColumn("date_hired_fsai");
	const showDetachmentColumn = canViewEmployeeColumn("detachment");
	const showStatusColumn = canViewEmployeeColumn("status");

	const employeeColumnsSignature = useMemo(
		() => Array.from(allowedEmployeeColumns).sort().join("|"),
		[allowedEmployeeColumns]
	);

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");
	const [employees, setEmployees] = useState<Applicant[]>([]);
	const profileUrls = useSignedStorageUrlMap(BUCKETS.profile, employees.map((row) => row.profile_image_path));
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
    return (localStorage.getItem("employees:viewMode:v2") as "grid" | "table") || "table";
  }
  return "table";
});



	const [filtersOpen, setFiltersOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "APPLICANT" | "AWOL" | "RETIRED" | "FLOATING">("ALL");
	const [genderFilter, setGenderFilter] = useState<string>("ALL");
	const [detachmentFilter, setDetachmentFilter] = useState<string>("ALL");
	const [positionFilter, setPositionFilter] = useState<string>("ALL");
	const [hasPhotoFilter, setHasPhotoFilter] = useState<"ALL" | "YES" | "NO">("ALL");
	const [hiredMonthFilter, setHiredMonthFilter] = useState("ALL"); // YYYY-MM
	const [hiredFromFilter, setHiredFromFilter] = useState("");
	const [hiredToFilter, setHiredToFilter] = useState("");
	const [yearsServiceFilter, setYearsServiceFilter] = useState("ALL");


	const [editorOpen, setEditorOpen] = useState(false);
	const [editorMode, setEditorMode] = useState<"create" | "edit">("edit");
	const [editorApplicantId, setEditorApplicantId] = useState<string | null>(null);
	const [excelOpen, setExcelOpen] = useState(false);
	const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
	const [importSummaryOpen, setImportSummaryOpen] = useState(false);

	const [serviceExportOpen, setServiceExportOpen] = useState(false);
	const [serviceExportMonth, setServiceExportMonth] = useState("ALL");
	const [serviceExportYears, setServiceExportYears] = useState("ALL");
	const [serviceExportFromFilter, setServiceExportFromFilter] = useState("");
	const [serviceExportToFilter, setServiceExportToFilter] = useState("");
	const [serviceExportTitle, setServiceExportTitle] = useState("Employees 1+ Year Export");
	const [serviceExportShowBirthday, setServiceExportShowBirthday] = useState(false);

	const [archiveOpen, setArchiveOpen] = useState(false);
	const [archiveEmployee, setArchiveEmployee] = useState<Applicant | null>(null);
	const fetchRunIdRef = useRef(0);

	const fetchEmployees = useCallback(async () => {
		const fetchRunId = ++fetchRunIdRef.current;
		if (loadingEmployeeColumns) {
			return;
		}

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
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to load employees");
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
    localStorage.setItem("employees:viewMode:v2", viewMode);
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

				// By default Employees page shows active personnel.
				// If the admin explicitly filters for AWOL/RETIRED/APPLICANT, allow it.
		if (statusFilter === "ALL") {
			list = list.filter((e) => {
				const s = normalizeStatus(e.status);
						return s !== "AWOL" && s !== "RETIRED" && s !== "RESIGNED" && s !== "FLOATING" && s !== "APPLICANT";
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
				const years = serviceYearsExact(e.date_hired_fsai, liveNow);
				if (years == null) return false;

				if (yearsServiceFilter === "<1") return years < 1;
				if (yearsServiceFilter === "1-5") return years >= 1 && years <= 5;
				if (yearsServiceFilter === ">5") return years > 5;
				return true;
			});
        }


		if (hiredFromFilter || hiredToFilter) {
			list = list.filter((e) => {
				const hiredYmd = ymd(e.date_hired_fsai);
				if (!hiredYmd) return false;
				if (hiredFromFilter && hiredYmd < hiredFromFilter) return false;
				if (hiredToFilter && hiredYmd > hiredToFilter) return false;
				return true;
			});
		}

		if (yearsServiceFilter !== "ALL") {
			list = list.filter((e) => {
				const completedYears = serviceYearsCompleted(e.date_hired_fsai, liveNow);
				if (completedYears == null) return false;
				if (yearsServiceFilter === "LT1") return completedYears < 1;

				const targetYears = Number(yearsServiceFilter);
				if (!Number.isFinite(targetYears)) return true;
				return completedYears === targetYears;
			});
		}

		if (q) {
			list = list.filter((e) => {
				const haystack = [
					e.applicant_id,
					(e.custom_id ?? "").trim(),
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
				const ay = serviceYearsExact(a.date_hired_fsai, liveNow);
				const by = serviceYearsExact(b.date_hired_fsai, liveNow);
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
		hiredFromFilter,
		hiredToFilter,
		hiredMonthFilter,
		yearsServiceFilter,
		liveNow,
	]);

	const exportSourceEmployees = useMemo(() => {
		return employees.filter((e) => {
			const status = normalizeStatus(e.status);
			return status !== "AWOL" && status !== "RETIRED" && status !== "RESIGNED" && status !== "FLOATING" && status !== "APPLICANT";
		});
	}, [employees]);

	const exportServiceRows = useMemo(() => {
		const now = liveNow;
		const items = exportSourceEmployees
			.map((e) => {
				const years = serviceYearsExact(e.date_hired_fsai, now);
				const completedYears = serviceYearsCompleted(e.date_hired_fsai, now);
				if (years == null || years < 1 || completedYears == null) return null;
				const hiredDate = e.date_hired_fsai ? new Date(e.date_hired_fsai) : null;
				const birthdayDate = e.birth_date ? new Date(e.birth_date) : null;
				const hasHiredDate = Boolean(hiredDate && !Number.isNaN(hiredDate.getTime()));
				const hasBirthdayDate = Boolean(birthdayDate && !Number.isNaN(birthdayDate.getTime()));
				const hiredYmd = ymd(e.date_hired_fsai) ?? "";
				return {
					applicant_id: e.applicant_id,
					name: showNameColumn ? getFullName(e) : "Employee",
					job: showPositionColumn ? e.client_position ?? "—" : "—",
					detachment: showDetachmentColumn ? e.detachment ?? "—" : "—",
					hired_on: hasHiredDate && hiredDate ? hiredDate.toLocaleDateString() : "—",
					hired_ymd: hiredYmd,
					birthday: hasBirthdayDate && birthdayDate ? birthdayDate.toLocaleDateString() : "—",
					hired_month: hasHiredDate && hiredDate ? String(hiredDate.getMonth() + 1).padStart(2, "0") : null,
					service: formatServiceLengthShort(e.date_hired_fsai, now),
					years,
					completed_years: completedYears,
				};
			})
			.filter(
				(v): v is {
					applicant_id: string;
					name: string;
					job: string;
					detachment: string;
					hired_on: string;
					hired_ymd: string;
					birthday: string;
					hired_month: string | null;
					service: string;
					years: number;
					completed_years: number;
				} => Boolean(v)
			)
			.sort((a, b) => b.years - a.years);

		return items;
	}, [exportSourceEmployees, showNameColumn, showPositionColumn, showDetachmentColumn, liveNow]);

	const serviceExportYearOptions = useMemo(
		() => Array.from(new Set(exportServiceRows.map((row) => row.completed_years))).sort((a, b) => a - b),
		[exportServiceRows]
	);

	const exportServiceRowsFiltered = useMemo(() => {
		let rows = exportServiceRows;

		if (serviceExportMonth !== "ALL") {
			rows = rows.filter((row) => row.hired_month === serviceExportMonth);
		}

		if (serviceExportYears !== "ALL") {
			const completedYears = Number(serviceExportYears);
			rows = rows.filter((row) => row.completed_years === completedYears);
		}

		if (serviceExportFromFilter || serviceExportToFilter) {
			rows = rows.filter((row) => {
				if (!row.hired_ymd) return false;
				if (serviceExportFromFilter && row.hired_ymd < serviceExportFromFilter) return false;
				if (serviceExportToFilter && row.hired_ymd > serviceExportToFilter) return false;
				return true;
			});
		}

		return rows;
	}, [exportServiceRows, serviceExportFromFilter, serviceExportMonth, serviceExportToFilter, serviceExportYears]);

	const serviceExportDataRows = useMemo(
		() =>
			exportServiceRowsFiltered.map((row) =>
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
			),
		[exportServiceRowsFiltered, serviceExportShowBirthday]
	);

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

	const yearsServiceOptions = useMemo(() => {
		let maxYears = 0;
		for (const employee of employees) {
			const completedYears = serviceYearsCompleted(employee.date_hired_fsai, liveNow);
			if (completedYears != null) {
				maxYears = Math.max(maxYears, completedYears);
			}
		}

		const optionCount = Math.max(10, maxYears);
		return Array.from({ length: optionCount }, (_, index) => String(index + 1));
	}, [employees, liveNow]);

	// Expiring list is handled in the top navigation dropdown (Main_Modules layout).

	function clearFilters() {
		setStatusFilter("ALL");
		setGenderFilter("ALL");
		setDetachmentFilter("ALL");
		setPositionFilter("ALL");
		setHasPhotoFilter("ALL");
		setHiredFromFilter("");
		setHiredToFilter("");
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

		const { error: updateError } = await supabase
			.from("applicants")
			.update({
				is_archived: true,
				archived_at: new Date().toISOString(),
				archived_by: null,
				status: "INACTIVE",
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
		if (normalized === "AWOL") {
			router.push("/Main_Modules/AWOL/");
			return;
		}
		if (normalized === "RESIGNED") {
			router.push("/Main_Modules/Resigned/");
			return;
		}
		if (normalized === "FLOATING") {
			router.push("/Main_Modules/Floating/");
			return;
		}
		if (editorMode === "create" && normalized !== "RETIRED") {
			router.push(
				`/Main_Modules/Employees/details/?id=${encodeURIComponent(applicantId)}&from=${encodeURIComponent(
					"/Main_Modules/Employees/"
				)}`
			);
		}
	}

	function serviceExportDateRangeLabel() {
		if (!serviceExportFromFilter && !serviceExportToFilter) return "All Hired Dates";
		return `${serviceExportFromFilter || "Start"} to ${serviceExportToFilter || "Today"}`;
	}

	function serviceExportYearsLabel() {
		if (serviceExportYears === "ALL") return "All 1+ Years";
		return `${serviceExportYears} Completed Year${serviceExportYears === "1" ? "" : "s"}`;
	}

	function serviceExportFileBase() {
		const parts = ["employees_service", serviceExportMonth === "ALL" ? "all-months" : `m${serviceExportMonth}`];
		parts.push(serviceExportYears === "ALL" ? "all-years" : `${serviceExportYears}-years`);
		if (serviceExportFromFilter || serviceExportToFilter) {
			parts.push(`${serviceExportFromFilter || "start"}-to-${serviceExportToFilter || "today"}`);
		}
		if (serviceExportShowBirthday) parts.push("birthday");
		parts.push(new Date().toISOString().slice(0, 10));
		return parts.join("_");
	}

	function serviceExportSubtitle() {
		const monthLabel =
			HIRE_MONTH_OPTIONS.find((opt) => opt.value === serviceExportMonth)?.label ?? "All Months";
		return `Generated: ${new Date().toLocaleString()} | Hired Month: ${monthLabel} | Years w/ Company: ${serviceExportYearsLabel()} | Hired Date: ${serviceExportDateRangeLabel()}`;
	}

	async function exportServiceXlsx() {
		setError("");
		if (!serviceExportDataRows.length) {
			setError("No employees with one year or more in company for the selected filters.");
			return;
		}

		const title = serviceExportTitle.trim() || "Employees 1+ Year Export";
		const out = await buildBrandedWorkbookBuffer([
			{
				name: "1+ Year In Company",
				title,
				subtitle: serviceExportSubtitle(),
				rows: serviceExportDataRows,
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
			setError("No employees with one year or more in company for the selected filters.");
			return;
		}

		const title = serviceExportTitle.trim() || "Employees 1+ Year Export";
		const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
		const subtitle = serviceExportSubtitle();
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

		downloadPdf(doc, `${serviceExportFileBase()}.pdf`);
		setServiceExportOpen(false);
	}

	if (accessLoading || loadingEmployeeColumns) return <PageLoading label="Loading employees..." />;
	if (employeeColumnsError) return <section role="alert">Unable to verify employee permissions.</section>;

	if (!canAccessEmployees) {
		return (
			<section className="glass-panel animate-fade-in rounded-3xl p-6 space-y-3">
				<div className="text-lg font-semibold text-black">Employees</div>
				<div className="text-sm text-gray-600">You do not have access to view this page.</div>
				<div className="pt-2">
					<button
						onClick={() => router.push("/Main_Modules/Requests/?module=employees")}
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
			<div className="flex flex-col xl:flex-row xl:flex-wrap xl:items-center xl:justify-between gap-3">
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
				<div className="flex flex-wrap items-center gap-3 justify-between xl:justify-end">
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
						<div className="flex flex-wrap items-center gap-2">
							{canExportEmployees ? (
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
						const profileUrl = profileUrls.get(String(e.profile_image_path ?? "").trim()) ?? null;
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
										<div className="text-xs text-gray-500 truncate">{(e.custom_id ?? "").trim() || shortCode(e.applicant_id)}</div>
										{showPositionColumn ? (
											<div className="mt-1 text-xs text-gray-500 truncate">
												<span className="text-gray-500">Job Title:</span>{" "}
												{e.client_position ?? "—"}
											</div>
										) : null}
										{showDetachmentColumn ? (
											<div className="text-xs text-gray-500 truncate">
												<span className="text-gray-500">Detachment:</span>{" "}
												<DetachmentHistoryPopover
													applicantId={e.applicant_id}
													currentDetachment={e.detachment}
													detailsHref={detailsHref}
													textClassName="text-xs text-gray-500"
													buttonClassName="text-[10px]"
												/>
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
					{showHiredDateColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Hired Date</th> : null}
					{showDetachmentColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Detachment</th> : null}
					{showStatusColumn ? <th className="px-4 py-3 text-left font-semibold text-black">Status</th> : null}
					{canAccessEmployees ? (
						<th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Actions</th>
					) : null}
				</tr>
			</thead>
			<tbody>
				{filtered.map((e) => {
					const profileUrl = profileUrls.get(String(e.profile_image_path ?? "").trim()) ?? null;
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
							{showHiredDateColumn ? (
								<td className="px-4 py-3">{e.date_hired_fsai ? new Date(e.date_hired_fsai).toLocaleDateString() : "—"}</td>
							) : null}
							{showDetachmentColumn ? (
								<td className="px-4 py-3">
									<DetachmentHistoryPopover
										applicantId={e.applicant_id}
										currentDetachment={e.detachment}
										detailsHref={detailsHref}
										textClassName="text-sm text-black"
									/>
								</td>
							) : null}
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



			{serviceExportOpen && canExportEmployees ? (
				<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
					<div className="glass-panel rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden animate-scale-in flex flex-col">
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

						<div className="p-6 space-y-4 overflow-y-auto">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
								<label className="text-sm text-black sm:col-span-2 xl:col-span-2">
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

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Years w/ Company</div>
									<select
										value={serviceExportYears}
										onChange={(e) => setServiceExportYears(e.target.value)}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									>
										<option value="ALL">All 1+ Years</option>
										{serviceExportYearOptions.map((years) => (
											<option key={years} value={String(years)}>
												{years} Completed Year{years === 1 ? "" : "s"}
											</option>
										))}
									</select>
								</label>

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Hired From</div>
									<input
										type="date"
										value={serviceExportFromFilter}
										onChange={(e) => setServiceExportFromFilter(e.target.value)}
										max={serviceExportToFilter || undefined}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									/>
								</label>

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Hired To</div>
									<input
										type="date"
										value={serviceExportToFilter}
										onChange={(e) => setServiceExportToFilter(e.target.value)}
										min={serviceExportFromFilter || undefined}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									/>
								</label>

								<label className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2 text-sm text-black sm:col-span-2 xl:col-span-3">
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

								<div className="flex items-end justify-start gap-2 sm:col-span-2 xl:col-span-3 xl:justify-end">
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
										className="h-10 px-4 rounded-xl border bg-white flex items-center gap-2 text-xs font-semibold hover:bg-gray-50"
										title="Download PDF"
										aria-label="Download PDF"
									>
										<FileText className="w-5 h-5 text-gray-800" />
										PDF
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
											No employees with one year or more in company for the selected filters.
										</div>
									)}
								</div>
							</div>

							<div className="rounded-2xl border bg-white px-4 py-3 text-sm text-gray-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div>
									Use All Months, All 1+ Years, and clear From/To to list every employee with at least one year of service.
								</div>
								{serviceExportMonth !== "ALL" || serviceExportYears !== "ALL" || serviceExportFromFilter || serviceExportToFilter ? (
									<button
										type="button"
										onClick={() => {
											setServiceExportMonth("ALL");
											setServiceExportYears("ALL");
											setServiceExportFromFilter("");
											setServiceExportToFilter("");
										}}
										className="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-black sm:w-auto"
									>
										Clear export filters
									</button>
								) : null}
							</div>
						</div>
					</div>
				</div>
			) : null}

			<EmployeeEditorModal
				open={editorOpen}
				mode={editorMode}
				applicantId={editorApplicantId}
				idNumberLabel="ID Number Employee"
				showIdGenerate={false}
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
											setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "APPLICANT" | "AWOL" | "RETIRED" | "FLOATING")
										}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									>
										<option value="ALL">All</option>
										<option value="ACTIVE">ACTIVE</option>
										<option value="APPLICANT">APPLICANT</option>
										<option value="AWOL">AWOL</option>
										<option value="RETIRED">RETIRED</option>
										<option value="FLOATING">FLOATING</option>
									</select>
								</label>

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Hired From</div>
									<input
										type="date"
										value={hiredFromFilter}
										onChange={(e) => setHiredFromFilter(e.target.value)}
										max={hiredToFilter || undefined}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									/>
								</label>

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Hired To</div>
									<input
										type="date"
										value={hiredToFilter}
										onChange={(e) => setHiredToFilter(e.target.value)}
										min={hiredFromFilter || undefined}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									/>
								</label>

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Years of Service</div>
									<select
										value={yearsServiceFilter}
										onChange={(e) => setYearsServiceFilter(e.target.value)}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									>
										<option value="ALL">All</option>
										<option value="LT1">Less than 1 year</option>
										{yearsServiceOptions.map((option) => (
											<option key={option} value={option}>
												{option} year{option === "1" ? "" : "s"}
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
  {HIRE_MONTH_OPTIONS.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))}
</select>

                                 </label>

                                <label className="hidden">
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
