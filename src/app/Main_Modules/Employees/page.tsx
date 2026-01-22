"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Pencil, Eye, SlidersHorizontal, ChevronDown, Trash2 } from "lucide-react";
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

export default function EmployeesPage() {
	const router = useRouter();
	const { role: sessionRole } = useAuthRole();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");
	const [employees, setEmployees] = useState<Applicant[]>([]);
	const [search, setSearch] = useState("");
	const [sortBy, setSortBy] = useState<"name" | "created_at">("name");

	const [filtersOpen, setFiltersOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "REASSIGN" | "RETIRED">("ALL");
	const [genderFilter, setGenderFilter] = useState<string>("ALL");
	const [detachmentFilter, setDetachmentFilter] = useState<string>("ALL");
	const [positionFilter, setPositionFilter] = useState<string>("ALL");
	const [hasPhotoFilter, setHasPhotoFilter] = useState<"ALL" | "YES" | "NO">("ALL");

	const [editorOpen, setEditorOpen] = useState(false);
	const [editorMode, setEditorMode] = useState<"create" | "edit">("edit");
	const [editorApplicantId, setEditorApplicantId] = useState<string | null>(null);

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
					"applicant_id, created_at, first_name, middle_name, last_name, extn_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived, is_trashed"
				)
				.eq("is_archived", false)
				.eq("is_trashed", false)
				.order("created_at", { ascending: false })
				.limit(500);

			if (fetchError) {
				console.error(fetchError);
				setError(fetchError.message || "Failed to load employees");
				setEmployees([]);
			} else {
				setEmployees((data as Applicant[]) || []);
			}
		} finally {
			setLoading(false);
		}
	}

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
	}, [employees, search, sortBy, statusFilter, genderFilter, detachmentFilter, positionFilter, hasPhotoFilter]);

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

	function clearFilters() {
		setStatusFilter("ALL");
		setGenderFilter("ALL");
		setDetachmentFilter("ALL");
		setPositionFilter("ALL");
		setHasPhotoFilter("ALL");
	}

	function openCreate() {
		setEditorMode("create");
		setEditorApplicantId(null);
		setEditorOpen(true);
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
			router.push(`/Main_Modules/Employees/details/?id=${encodeURIComponent(applicantId)}`);
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
						<button
							onClick={() => setSortBy((v) => (v === "name" ? "created_at" : "name"))}
							className="px-4 py-2 rounded-full bg-[#FFDA03] text-black font-medium flex items-center gap-2"
						>
							{sortBy === "name" ? "Name" : "Newest"}
							<ChevronDown className="w-4 h-4" />
						</button>
					</div>
					{sessionRole !== "employee" ? (
						<button onClick={openCreate} className="px-4 py-2 rounded-full bg-[#FFDA03] text-black font-semibold">
							New Employee
						</button>
					) : null}
				</div>
			</div>

			{error ? <div className="text-red-600 text-sm">{error}</div> : null}

			{loading ? (
				<div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">Loading employees...</div>
			) : filtered.length === 0 ? (
				<div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">No employees found.</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
					{filtered.map((e) => {
						const name = getFullName(e);
						const profileUrl = getProfileUrl(e.profile_image_path);
						const status = (e.status ?? "").trim().toUpperCase();
						const isActive = status === "ACTIVE";
						const canClick = sessionRole !== "employee";
						const detailsHref = `/Main_Modules/Employees/details/?id=${encodeURIComponent(e.applicant_id)}`;

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
											<span className="text-gray-500">Job Title:</span> {e.client_position ?? "—"}
										</div>
										<div className="text-xs text-gray-500 truncate">
											<span className="text-gray-500">Detachment:</span> {e.detachment ?? "—"}
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
								<div className="text-lg font-semibold">Archive Employee</div>
								<div className="text-xs text-gray-500">{getFullName(archiveEmployee)}</div>
							</div>
							<button onClick={() => setArchiveOpen(false)} className="px-3 py-2 rounded-xl border bg-white">
								Close
							</button>
						</div>

						<div className="p-6 text-sm text-gray-700">This will move the employee to the Archive page.</div>

						<div className="px-6 pb-6 flex items-center justify-end gap-2">
							<button onClick={() => setArchiveOpen(false)} className="px-4 py-2 rounded-xl border bg-white">
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
