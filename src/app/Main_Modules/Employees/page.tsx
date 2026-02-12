"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Pencil, SlidersHorizontal, Trash2, Upload, LayoutGrid, Table, Search, FileDown, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuthRole } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";
import EmployeeExcelImportModal from "../../Components/EmployeeExcelImportModal";

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
	return `${diff.years}y ${diff.months}m`;
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

export default function EmployeesPage() {
	const router = useRouter();
	const { role: sessionRole } = useAuthRole();
	const api = (globalThis as unknown as { electronAPI?: any }).electronAPI;

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
	const [sortBy, setSortBy] = useState<"name" | "created_at" | "category" | "expiring" | "service">("name");
	const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
  if (typeof window !== "undefined") {
    return (localStorage.getItem("employees:viewMode") as "grid" | "table") || "grid";
  }
  return "grid";
});



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

	const [exportOpen, setExportOpen] = useState(false);
	const [exportMonth, setExportMonth] = useState("ALL"); // MM
	const [exportWeek, setExportWeek] = useState("ALL"); // 1..5
	const [exportTitle, setExportTitle] = useState("Employees (1+ year of service)");

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
					"applicant_id, created_at, date_hired_fsai, first_name, middle_name, last_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived, is_trashed"
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

				// Merge: prefer Electron expiring summary (same source as top-nav popup) when available.
				try {
					if (api?.notifications?.getExpiringSummary) {
						const res = await api.notifications.getExpiringSummary({ limit: 200 });
						const rows = ((res as any)?.rows ?? []) as Array<{ applicant_id: string; expires_on: string; days_until_expiry: number }>;
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
					} else {
						setExpiringSummaryByApplicantId({});
					}
				} catch {
					setExpiringSummaryByApplicantId({});
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

	function getExportCandidates() {
		const now = new Date();
		return filtered
			.filter((e) => {
				const years = serviceYearsExact(e.date_hired_fsai, now);
				if (years == null || years < 1) return false;

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
	}

	function exportFileBase() {
		const parts = ["employees", "min1yr"];
		if (exportMonth !== "ALL") parts.push(`m${exportMonth}`);
		if (exportWeek !== "ALL") parts.push(`w${exportWeek}`);
		parts.push(new Date().toISOString().slice(0, 10));
		return parts.join("_");
	}

	function exportEmployeesXlsx() {
		setError("");
		const rows = getExportCandidates();
		if (!rows.length) {
			setError("No employees match the export criteria (must be 1+ year of service).");
			return;
		}
		const title = exportTitle.trim() || "Employees (1+ year of service)";

		const now = new Date();
		const data = rows.map((e) => {
			return {
				Name: getFullName(e),
				"Job Title": e.client_position ?? "",
				Detachment: e.detachment ?? "",
				Gender: (e.gender ?? "").trim(),
				"Hire Date": e.date_hired_fsai ? new Date(e.date_hired_fsai).toLocaleDateString() : "",
				"Service Length": formatServiceLengthShort(e.date_hired_fsai, now),
				Email: (e.client_email ?? "").trim(),
				Phone: (e.client_contact_num ?? "").trim(),
			};
		});

		const headers = ["Name", "Job Title", "Detachment", "Gender", "Hire Date", "Service Length", "Email", "Phone"];
		const body = data.map((row) => [
			row.Name,
			row["Job Title"],
			row.Detachment,
			row.Gender,
			row["Hire Date"],
			row["Service Length"],
			row.Email,
			row.Phone,
		]);
		const ws = XLSX.utils.aoa_to_sheet([
			[title],
			[`Generated: ${new Date().toLocaleString()}`],
			[],
			headers,
			...body,
		]);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, "Employees");
		const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
		downloadBlob(
			`${exportFileBase()}.xlsx`,
			new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
		);
		setExportOpen(false);
	}

	function exportEmployeesPdf() {
		setError("");
		const rows = getExportCandidates();
		if (!rows.length) {
			setError("No employees match the export criteria (must be 1+ year of service).");
			return;
		}
		const title = exportTitle.trim() || "Employees (1+ year of service)";

		const now = new Date();
		const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
		doc.setFontSize(14);
		doc.text(title, 40, 40);

		const head = [["Name", "Job Title", "Detachment", "Gender", "Hire Date", "Service", "Email", "Phone"]];
		const body = rows.map((e) => {
			return [
				getFullName(e),
				e.client_position ?? "",
				e.detachment ?? "",
				(e.gender ?? "").trim(),
				e.date_hired_fsai ? new Date(e.date_hired_fsai).toLocaleDateString() : "",
				formatServiceLengthShort(e.date_hired_fsai, now),
				(e.client_email ?? "").trim(),
				(e.client_contact_num ?? "").trim(),
			];
		});

		autoTable(doc, {
			startY: 60,
			head,
			body,
			styles: { fontSize: 8, cellPadding: 3 },
			headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
		});

		doc.save(`${exportFileBase()}.pdf`);
		setExportOpen(false);
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
								setSortBy(e.target.value as "name" | "created_at" | "category" | "expiring" | "service")
							}
							className="px-4 py-2 rounded-full bg-white text-black font-medium border border-gray-300"
						>
							<option value="name">Name</option>
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

					{sessionRole !== "employee" ? (
						<div className="flex items-center gap-2">
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
										<div className="text-xs text-gray-500 truncate">
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
							className={`bg-white shadow-sm transition ${canClick ? "hover:shadow-md cursor-pointer" : ""}`}
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

			{exportOpen && sessionRole !== "employee" ? (
				<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
					<div className="bg-white rounded-3xl shadow-xl max-w-4xl w-full overflow-hidden">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div className="text-lg font-bold text-black">Export</div>
							<button
								onClick={() => setExportOpen(false)}
								className="px-3 py-2 rounded-xl border bg-white"
								type="button"
							>
								Close
							</button>
						</div>

						<div className="p-6 space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<label className="text-sm text-black md:col-span-3">
									<div className="text-gray-600 mb-1">Title</div>
									<input
										value={exportTitle}
										onChange={(e) => setExportTitle(e.target.value)}
										className="w-full border rounded-xl px-3 py-2 bg-white"
										placeholder="Employees (1+ year of service)"
									/>
								</label>

								<label className="text-sm text-black">
									<div className="text-gray-600 mb-1">Month (Hire Date)</div>
									<select
										value={exportMonth}
										onChange={(e) => setExportMonth(e.target.value)}
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
									<div className="text-gray-600 mb-1">Week (Hire Date)</div>
									<select
										value={exportWeek}
										onChange={(e) => setExportWeek(e.target.value)}
										className="w-full border rounded-xl px-3 py-2 bg-white"
									>
										<option value="ALL">All</option>
										<option value="1">Week 1 (1-7)</option>
										<option value="2">Week 2 (8-14)</option>
										<option value="3">Week 3 (15-21)</option>
										<option value="4">Week 4 (22-28)</option>
										<option value="5">Week 5 (29-31)</option>
									</select>
								</label>

								<div className="flex items-end justify-end gap-2">
									<button
										type="button"
										onClick={exportEmployeesPdf}
										className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center hover:bg-gray-50"
										title="Download PDF"
										aria-label="Download PDF"
									>
										<FileText className="w-5 h-5 text-gray-800" />
									</button>
									<button
										type="button"
										onClick={exportEmployeesXlsx}
										className="h-10 px-4 rounded-xl bg-black text-white text-xs font-semibold hover:bg-gray-800"
										title="Download XLSX"
										aria-label="Download XLSX"
									>
										XLSX
									</button>
								</div>
							</div>

							<div className="rounded-2xl border overflow-hidden">
								<div className="px-4 py-2 bg-gray-50 text-sm text-gray-700 flex items-center justify-between">
									<div>Preview (1+ year of service)</div>
									<div className="text-xs text-gray-500">{getExportCandidates().length} employee(s)</div>
								</div>
								<div className="max-h-[360px] overflow-auto">
									<table className="w-full text-sm">
										<thead className="sticky top-0 bg-white">
											<tr className="border-b">
												<th className="px-4 py-2 text-left font-semibold">Name</th>
												<th className="px-4 py-2 text-left font-semibold">Job Title</th>
												<th className="px-4 py-2 text-left font-semibold">Detachment</th>
												<th className="px-4 py-2 text-left font-semibold">Hire Date</th>
												<th className="px-4 py-2 text-left font-semibold">Service</th>
											</tr>
										</thead>
										<tbody>
											{getExportCandidates().map((e) => (
												<tr key={e.applicant_id} className="border-b last:border-b-0">
													<td className="px-4 py-2">{getFullName(e)}</td>
													<td className="px-4 py-2">{e.client_position ?? "—"}</td>
													<td className="px-4 py-2">{e.detachment ?? "—"}</td>
													<td className="px-4 py-2">{e.date_hired_fsai ? new Date(e.date_hired_fsai).toLocaleDateString() : "—"}</td>
													<td className="px-4 py-2">{formatServiceLengthShort(e.date_hired_fsai)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
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