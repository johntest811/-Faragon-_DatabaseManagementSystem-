"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileText, LayoutGrid, Pencil, Search, Table, Upload, UserPlus } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../../Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess, useMyModuleAccess, useMyModuleEditAccess } from "../../Client/useRbac";
import EmployeeEditorModal from "../../Components/EmployeeEditorModal";
import EmployeeExcelImportModal from "../../Components/EmployeeExcelImportModal";
import LoadingCircle from "../../Components/LoadingCircle";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import EmployeeStatusMenu from "../Components/EmployeeStatusMenu";
import { buildEmployeeStatusUpdatePatch } from "../employeeListData";
import { addBrandedPdfHeader, buildBrandedWorkbookBuffer } from "../Components/exportBranding";

type ApplicantRow = {
	applicant_id: string;
	created_at: string;
	custom_id: string | null;
	first_name: string | null;
	middle_name: string | null;
	last_name: string | null;
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
	is_trashed: boolean | null;
};

const BUCKETS = {
	profile: "applicants",
};

const STATUS_FILTERS = ["ALL", "APPLICANT", "ACTIVE", "INACTIVE", "REASSIGN", "RESIGNED", "RETIRED"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];

function normalizeStatus(input: string | null) {
	const v = (input ?? "").trim().toUpperCase();
	if (!v) return "ACTIVE";
	if (v === "ACTIVE" || v === "APPLICANT" || v === "INACTIVE" || v === "REASSIGN" || v === "RETIRED" || v === "RESIGNED") {
		return v;
	}
	return "ACTIVE";
}

function getFullName(row: ApplicantRow) {
	return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ").trim() || "(No name)";
}

function shortCode(id: string) {
	return `APP-${id.slice(0, 2).toUpperCase()}-${id.slice(2, 5).toUpperCase()}`;
}

function getProfileUrl(profilePath: string | null) {
	if (!profilePath) return null;
	const { data } = supabase.storage.from(BUCKETS.profile).getPublicUrl(profilePath);
	return data.publicUrl || null;
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

function safeText(value: unknown) {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return String(value);
}

function badgeClass(status: string) {
	switch (status) {
		case "ACTIVE":
			return "bg-emerald-500 text-white";
		case "APPLICANT":
			return "bg-sky-500 text-white";
		case "INACTIVE":
			return "bg-slate-700 text-white";
		case "REASSIGN":
			return "bg-amber-500 text-white";
		case "RESIGNED":
			return "bg-rose-500 text-white";
		case "RETIRED":
			return "bg-zinc-700 text-white";
		default:
			return "bg-gray-700 text-white";
	}
}

export default function ApplicantsPage() {
	const router = useRouter();
	const { role: sessionRole } = useAuthRole();
	const { canAccess: canAccessApplicants, loading: accessLoading, error: accessError } = useMyModuleAccess("applicants");
	const { canEdit: canEditApplicants, loading: editLoading, error: editError } = useMyModuleEditAccess("applicants");
	const {
		allowedColumns: allowedApplicantColumns,
		restricted: applicantColumnsRestricted,
		loading: columnLoading,
		error: columnError,
	} = useMyColumnAccess("applicants");

	const isAdmin = sessionRole === "admin" || sessionRole === "superadmin";
	const canViewApplicantColumn = (columnKey: string) => !applicantColumnsRestricted || allowedApplicantColumns.has(columnKey);
	const canImportApplicants = isAdmin && canViewApplicantColumn("import_file");
	const canExportApplicants = isAdmin && canViewApplicantColumn("export_file");

	const [applicants, setApplicants] = useState<ApplicantRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [search, setSearch] = useState("");
	const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
		if (typeof window !== "undefined") {
			return (window.localStorage.getItem("applicants:viewMode") as "grid" | "table") || "grid";
		}
		return "grid";
	});
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("APPLICANT");
	const [editorOpen, setEditorOpen] = useState(false);
	const [editorApplicantId, setEditorApplicantId] = useState<string | null>(null);
	const [importOpen, setImportOpen] = useState(false);
	const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
	const [importSummaryOpen, setImportSummaryOpen] = useState(false);

	const fetchApplicants = useCallback(async () => {
		setLoading(true);
		setError("");

		const { data, error: fetchError } = await supabase
			.from("applicants")
			.select(
				"applicant_id, created_at, custom_id, first_name, middle_name, last_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived, is_trashed"
			)
			.eq("is_archived", false)
			.eq("is_trashed", false)
			.order("created_at", { ascending: false })
			.limit(2000);

		if (fetchError) {
			console.error(fetchError);
			setError(fetchError.message || "Failed to load applicants.");
			setApplicants([]);
			setLoading(false);
			return;
		}

		setApplicants(((data ?? []) as ApplicantRow[]) || []);
		setLoading(false);
	}, []);

	useEffect(() => {
		void fetchApplicants();

		const channel = supabase
			.channel("realtime:applicants-page")
			.on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => {
				void fetchApplicants();
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [fetchApplicants]);

	useEffect(() => {
		try {
			window.localStorage.setItem("applicants:viewMode", viewMode);
		} catch {
			// ignore
		}
	}, [viewMode]);

	const summary = useMemo(() => {
		const counts = { total: 0, applicant: 0, active: 0, inactive: 0, other: 0 };
		counts.total = applicants.length;
		for (const row of applicants) {
			switch (normalizeStatus(row.status)) {
				case "APPLICANT":
					counts.applicant += 1;
					break;
				case "ACTIVE":
					counts.active += 1;
					break;
				case "INACTIVE":
					counts.inactive += 1;
					break;
				default:
					counts.other += 1;
			}
		}
		return counts;
	}, [applicants]);

	const filteredApplicants = useMemo(() => {
		const q = search.trim().toLowerCase();
		const list = [...applicants].filter((row) => {
			const status = normalizeStatus(row.status);
			if (statusFilter !== "ALL" && status !== statusFilter) return false;

			if (!q) return true;

			const haystack = [
				row.applicant_id,
				shortCode(row.applicant_id),
				getFullName(row),
				row.client_position,
				row.detachment,
				status,
				row.gender,
				row.client_contact_num,
				row.client_email,
				row.birth_date,
				row.age != null ? String(row.age) : "",
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();

			return haystack.includes(q);
		});

		return list.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
	}, [applicants, search, statusFilter]);

	const exportRows = useMemo(
		() =>
			filteredApplicants.map((row) => ({
				"Applicant ID": row.applicant_id,
				"Applicant Code": shortCode(row.applicant_id),
				Name: getFullName(row),
				Position: safeText(row.client_position),
				Detachment: safeText(row.detachment),
				Status: normalizeStatus(row.status),
				Gender: safeText(row.gender),
				"Birth Date": safeText(row.birth_date),
				Age: safeText(row.age),
				"Contact Number": safeText(row.client_contact_num),
				Email: safeText(row.client_email),
				"Created At": safeText(row.created_at),
			})),
		[filteredApplicants]
	);

	const totalLoading = loading || accessLoading || editLoading || columnLoading;
	const canOpenApplicantDetails = canAccessApplicants;

	function openCreate() {
		setEditorApplicantId(null);
		setEditorOpen(true);
	}

	function openEdit(row: ApplicantRow) {
		setEditorApplicantId(row.applicant_id);
		setEditorOpen(true);
	}

	function closeEditor() {
		setEditorOpen(false);
		setEditorApplicantId(null);
	}

	async function updateApplicantStatus(row: ApplicantRow, nextStatus: string) {
		setError("");
		const patch = buildEmployeeStatusUpdatePatch(nextStatus);
		const { error: updateError } = await supabase.from("applicants").update(patch).eq("applicant_id", row.applicant_id);

		if (updateError) {
			console.error(updateError);
			setError(updateError.message || "Failed to update applicant status.");
			return;
		}

		setApplicants((prev) => prev.map((item) => (item.applicant_id === row.applicant_id ? { ...item, status: patch.status } : item)));
	}

	async function onSaved() {
		closeEditor();
		await fetchApplicants();
	}

	async function onDeleted() {
		closeEditor();
		await fetchApplicants();
	}

	function exportFileBase() {
		return `applicants_export_${new Date().toISOString().slice(0, 10)}`;
	}

	async function exportApplicantsXlsx() {
		if (!canExportApplicants) return;
		if (!exportRows.length) {
			setError("No rows available for export.");
			return;
		}

		const out = await buildBrandedWorkbookBuffer([
			{
				name: "Applicants",
				title: "Applicants Export",
				subtitle: "Applicant pipeline records",
				rows: exportRows,
			},
		]);
		downloadBlob(
			`${exportFileBase()}.xlsx`,
			new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
		);
	}

	async function exportApplicantsPdf() {
		if (!canExportApplicants) return;
		if (!exportRows.length) {
			setError("No rows available for export.");
			return;
		}

		const headers = Object.keys(exportRows[0]);
		const body = exportRows.map((row) => headers.map((key) => String(row[key as keyof typeof row] ?? "")));
		const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
		const startY = await addBrandedPdfHeader(doc, "Applicants Export", "Applicant pipeline records");
		autoTable(doc, {
			startY: startY + 10,
			head: [headers],
			body,
			styles: { fontSize: 7, cellPadding: 2 },
			headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
		});
		doc.save(`${exportFileBase()}.pdf`);
	}

	if (totalLoading) {
		return (
			<section className="glass-panel animate-fade-in rounded-3xl p-6">
				<div className="py-12 flex justify-center">
					<LoadingCircle />
				</div>
			</section>
		);
	}

	if (!canAccessApplicants) {
		return (
			<section className="glass-panel animate-fade-in rounded-3xl p-6 space-y-2">
				<div className="text-lg font-semibold text-black">Applicant</div>
				<div className="text-sm text-gray-600">You do not have access to this page.</div>
				{accessError ? <div className="text-xs text-red-600">{accessError}</div> : null}
			</section>
		);
	}

	return (
		<section className="space-y-5 pb-6">
			<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
				<div className="flex items-center gap-3 text-black">
					<div className="relative w-full md:w-[360px]">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search applicants"
							className="bg-white border rounded-full pl-10 pr-4 py-2 shadow-sm w-full"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
					<div className="flex items-center gap-2">
						<div className="text-xs text-gray-500">Status:</div>
						<select
							value={statusFilter}
							onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
							className="px-4 py-2 rounded-full bg-white text-black font-medium border border-gray-300"
						>
							{STATUS_FILTERS.map((status) => (
								<option key={status} value={status}>
									{status === "ALL" ? "All" : status}
								</option>
							))}
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

					<div className="flex items-center gap-2">
						{canExportApplicants ? (
							<>
								<button
									type="button"
									onClick={exportApplicantsXlsx}
									className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center"
									aria-label="Export XLSX"
									title="Export XLSX"
								>
									<FileDown className="w-5 h-5 text-gray-800" />
								</button>
								<button
									type="button"
									onClick={exportApplicantsPdf}
									className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center"
									aria-label="Export PDF"
									title="Export PDF"
								>
									<FileText className="w-5 h-5 text-gray-800" />
								</button>
							</>
						) : null}

						{canImportApplicants ? (
							<button
								onClick={() => setImportOpen(true)}
								className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center"
								aria-label="Import Excel"
								title="Import Excel"
							>
								<Upload className="w-5 h-5 text-gray-800" />
							</button>
						) : null}

						{canEditApplicants ? (
							<button onClick={openCreate} className="px-4 py-2 rounded-full bg-[#FFDA03] text-black font-semibold" type="button">
								New Applicant
							</button>
						) : null}
					</div>
				</div>
			</div>

			{error ? <div className="text-red-600 text-sm">{error}</div> : null}
			{accessError ? <div className="text-amber-700 text-sm">{accessError}</div> : null}
			{columnError ? <div className="text-amber-700 text-sm">{columnError}</div> : null}
			{editError ? <div className="text-amber-700 text-sm">{editError}</div> : null}

			{loading ? (
				<div className="glass-panel animate-slide-up rounded-2xl p-8">
					<LoadingCircle label="Loading applicants..." />
				</div>
			) : filteredApplicants.length === 0 ? (
				<div className="glass-panel animate-slide-up rounded-2xl p-8 text-center text-gray-500">No applicants found.</div>
			) : viewMode === "grid" ? (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
					{filteredApplicants.map((row) => {
						const name = getFullName(row);
						const profileUrl = getProfileUrl(row.profile_image_path);
						const status = normalizeStatus(row.status);
						const detailsHref = `/Main_Modules/Applicants/details/?id=${encodeURIComponent(row.applicant_id)}&from=${encodeURIComponent(
							"/Main_Modules/Applicants/"
						)}`;

						return (
							<div
								key={row.applicant_id}
								role={canOpenApplicantDetails ? "button" : undefined}
								tabIndex={canOpenApplicantDetails ? 0 : -1}
								onKeyDown={(event) => {
									if (!canOpenApplicantDetails) return;
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										router.push(detailsHref);
									}
								}}
								onClick={() => {
									if (!canOpenApplicantDetails) return;
									router.push(detailsHref);
								}}
								className={`glass-panel animate-slide-up rounded-3xl p-6 animated-row hover:shadow-xl ${
									canOpenApplicantDetails ? "cursor-pointer" : ""
								}`}
							>
								<div className="flex items-center gap-4">
									<div className="h-16 w-16 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
										{profileUrl ? (
											<img src={profileUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
										) : (
											<div className="text-xs text-gray-500">No Photo</div>
										)}
									</div>
									<div className="min-w-0">
										<div className="text-sm font-bold text-gray-900 truncate">{name}</div>
										<div className="text-xs text-gray-500 truncate">{shortCode(row.applicant_id)}</div>
										<div className="mt-1 text-xs text-gray-500 truncate">
											<span className="text-gray-500">Position:</span> {row.client_position ?? "—"}
										</div>
										<div className="text-xs text-gray-500 truncate">
											<span className="text-gray-500">Detachment:</span> {row.detachment ?? "—"}
										</div>
									</div>
								</div>

								<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex items-center gap-2">
										{canEditApplicants ? (
											<EmployeeStatusMenu value={status} onChange={(nextStatus) => void updateApplicantStatus(row, nextStatus)} />
										) : (
											<span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeClass(status)}`}>{status}</span>
										)}
									</div>

									<div className="flex flex-wrap items-center justify-end gap-2">
										{canEditApplicants ? (
											<button
												onClick={(event) => {
													event.stopPropagation();
													openEdit(row);
												}}
												className="animated-btn h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
												title="Edit"
												type="button"
											>
												<Pencil className="h-4 w-4" />
											</button>
										) : null}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<TableZoomWrapper storageKey="applicants" defaultZoom={0.9}>
					<div className="relative overflow-x-auto rounded-2xl glass-panel animate-slide-up">
						<table className="min-w-[1200px] w-full text-sm text-black border-separate border-spacing-y-2">
							<thead className="sticky top-0 z-10">
								<tr className="bg-[#FFDA03]">
									<th className="px-4 py-3 text-left font-semibold text-black first:rounded-l-xl">Photo</th>
									<th className="px-4 py-3 text-left font-semibold text-black">Name</th>
									<th className="px-4 py-3 text-left font-semibold text-black">Position</th>
									<th className="px-4 py-3 text-left font-semibold text-black">Detachment</th>
									<th className="px-4 py-3 text-left font-semibold text-black">Status</th>
									<th className="px-4 py-3 text-left font-semibold text-black">Contact</th>
									<th className="px-4 py-3 text-left font-semibold text-black">Email</th>
									<th className="px-4 py-3 text-center font-semibold text-black last:rounded-r-xl">Actions</th>
								</tr>
							</thead>
							<tbody>
								{filteredApplicants.map((row) => {
									const profileUrl = getProfileUrl(row.profile_image_path);
									const name = getFullName(row);
									const status = normalizeStatus(row.status);
									const detailsHref = `/Main_Modules/Applicants/details/?id=${encodeURIComponent(row.applicant_id)}&from=${encodeURIComponent(
										"/Main_Modules/Applicants/"
									)}`;

									return (
										<tr
											key={row.applicant_id}
											role={canOpenApplicantDetails ? "button" : undefined}
											tabIndex={canOpenApplicantDetails ? 0 : -1}
											onKeyDown={(event) => {
												if (!canOpenApplicantDetails) return;
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													router.push(detailsHref);
												}
											}}
											onClick={() => {
												if (!canOpenApplicantDetails) return;
												router.push(detailsHref);
											}}
											className={`animated-row border-b border-gray-100 transition hover:shadow-md ${
												canOpenApplicantDetails ? "cursor-pointer" : ""
											}`}
										>
											<td className="px-4 py-3 rounded-l-xl">
												<div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden">
													{profileUrl ? <img src={profileUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
												</div>
											</td>
											<td className="px-4 py-3 font-semibold">{name}</td>
											<td className="px-4 py-3">{row.client_position ?? "—"}</td>
											<td className="px-4 py-3">{row.detachment ?? "—"}</td>
											<td className="px-4 py-3">
												{canEditApplicants ? (
													<EmployeeStatusMenu
														value={status}
														onChange={(nextStatus) => void updateApplicantStatus(row, nextStatus)}
														disabled={!canEditApplicants}
													/>
												) : (
													<span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeClass(status)}`}>{status}</span>
												)}
											</td>
											<td className="px-4 py-3 whitespace-nowrap">{row.client_contact_num ?? "—"}</td>
											<td className="px-4 py-3 whitespace-nowrap">{row.client_email ?? "—"}</td>
											<td className="px-4 py-3 text-center rounded-r-xl">
												<div className="inline-flex items-center gap-2">
													{canEditApplicants ? (
														<button
															onClick={(event) => {
																event.stopPropagation();
																openEdit(row);
															}}
															className="p-2 rounded-lg hover:bg-gray-100"
															title="Edit"
															type="button"
														>
															<Pencil className="w-5 h-5 text-gray-700" />
														</button>
													) : null}
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</TableZoomWrapper>
			)}

			<EmployeeEditorModal
				open={editorOpen}
				mode={editorApplicantId ? "edit" : "create"}
				applicantId={editorApplicantId}
				defaultStatus="APPLICANT"
				title={editorApplicantId ? "Edit Applicant" : "New Applicant"}
				subtitle={editorApplicantId ? "Update an applicant record." : "Create a new applicant record."}
				onClose={closeEditor}
				onSaved={() => void onSaved()}
				onDeleted={() => void onDeleted()}
			/>

			<EmployeeExcelImportModal
				open={importOpen}
				onClose={() => setImportOpen(false)}
				allowTemplateDownloads={canImportApplicants}
				defaultStatus="APPLICANT"
				onImported={(result) => {
					setImportSummary(result);
					setImportSummaryOpen(true);
					void fetchApplicants();
				}}
			/>

			<ImportSummaryModal
				open={importSummaryOpen}
				title="Applicant Import Summary"
				summary={importSummary}
				onClose={() => setImportSummaryOpen(false)}
			/>

		</section>
	);
}