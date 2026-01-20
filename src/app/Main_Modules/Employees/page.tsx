"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Pencil, Eye, SlidersHorizontal, ChevronDown } from "lucide-react";

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
};

const BUCKETS = {
  profile: "Profile_Images",
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

type EditDraft = {
  detachment: string;
  client_position: string;
  status: string;
  client_contact_num: string;
  client_email: string;
};

type CreateDraft = {
	first_name: string;
	last_name: string;
	client_position: string;
	detachment: string;
	status: string;
};

export default function EmployeesPage() {
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");
	const [employees, setEmployees] = useState<Applicant[]>([]);
	const [search, setSearch] = useState("");
	const [sortBy, setSortBy] = useState<"name" | "created_at">("name");

	const [editOpen, setEditOpen] = useState(false);
	const [editEmployee, setEditEmployee] = useState<Applicant | null>(null);
	const [editDraft, setEditDraft] = useState<EditDraft>({
		detachment: "",
		client_position: "",
		status: "",
		client_contact_num: "",
		client_email: "",
	});

	const [createOpen, setCreateOpen] = useState(false);
	const [createDraft, setCreateDraft] = useState<CreateDraft>({
		first_name: "",
		last_name: "",
		client_position: "",
		detachment: "",
		status: "ACTIVE",
	});

	const [archiveOpen, setArchiveOpen] = useState(false);
	const [archiveEmployee, setArchiveEmployee] = useState<Applicant | null>(null);

	const [sessionRole, setSessionRole] = useState<"superadmin" | "admin" | "employee" | null>(null);
	useEffect(() => {
		const raw = localStorage.getItem("adminSession");
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw);
			const r = String(parsed?.role || "").toLowerCase();
			if (r === "superadmin" || r === "admin" || r === "employee") {
				setSessionRole(r);
			}
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		const fetchEmployees = async () => {
			setLoading(true);
			setError("");
			try {
				const { data, error: fetchError } = await supabase
					.from("applicants")
					.select(
						"applicant_id, created_at, first_name, middle_name, last_name, extn_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived"
					)
					.eq("is_archived", false)
					.order("created_at", { ascending: false })
					.limit(200);

				if (fetchError) {
					console.error(fetchError);
					setError(fetchError.message || "Failed to load employees");
					setEmployees([]);
				} else {
					setEmployees((data as Applicant[]) || []);
				}
			} catch (e) {
				console.error(e);
				setError("Unexpected error while loading employees");
				setEmployees([]);
			} finally {
				setLoading(false);
			}
		};

		fetchEmployees();
	}, []);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		let list = employees;
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
			if (sortBy === "created_at") {
				return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			}
			return getFullName(a).localeCompare(getFullName(b));
		});
		return sorted;
	}, [employees, search, sortBy]);

	function openEdit(employee: Applicant) {
		setEditEmployee(employee);
		setEditDraft({
			detachment: employee.detachment ?? "",
			client_position: employee.client_position ?? "",
			status: employee.status ?? "",
			client_contact_num: employee.client_contact_num ?? "",
			client_email: employee.client_email ?? "",
		});
		setEditOpen(true);
	}

	function openArchive(employee: Applicant) {
		setArchiveEmployee(employee);
		setArchiveOpen(true);
	}

	async function confirmArchive() {
		if (!archiveEmployee) return;
		setError("");
		const { error: updateError } = await supabase
			.from("applicants")
			.update({ is_archived: true, archived_at: new Date().toISOString() })
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

	async function saveEdit() {
		if (!editEmployee) return;
		setError("");
		const { error: updateError } = await supabase
			.from("applicants")
			.update({
				detachment: editDraft.detachment || null,
				client_position: editDraft.client_position || null,
				status: editDraft.status || null,
				client_contact_num: editDraft.client_contact_num || null,
				client_email: editDraft.client_email || null,
			})
			.eq("applicant_id", editEmployee.applicant_id);

		if (updateError) {
			console.error(updateError);
			setError(updateError.message || "Failed to update employee");
			return;
		}

		setEmployees((prev) =>
			prev.map((e) =>
				e.applicant_id === editEmployee.applicant_id
					? {
						...e,
						detachment: editDraft.detachment || null,
						client_position: editDraft.client_position || null,
						status: editDraft.status || null,
						client_contact_num: editDraft.client_contact_num || null,
						client_email: editDraft.client_email || null,
					}
					: e
			)
		);

		setEditOpen(false);
		setEditEmployee(null);
	}

	async function createEmployee() {
		setError("");
		const payload = {
			first_name: createDraft.first_name || null,
			last_name: createDraft.last_name || null,
			client_position: createDraft.client_position || null,
			detachment: createDraft.detachment || null,
			status: createDraft.status || null,
		};

		const { data, error: insertError } = await supabase
			.from("applicants")
			.insert(payload)
			.select(
				"applicant_id, created_at, first_name, middle_name, last_name, extn_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, profile_image_path, is_archived"
			)
			.single();

		if (insertError) {
			console.error(insertError);
			setError(insertError.message || "Failed to create employee");
			return;
		}

		setEmployees((prev) => [data as Applicant, ...prev]);
		setCreateOpen(false);
		setCreateDraft({
			first_name: "",
			last_name: "",
			client_position: "",
			detachment: "",
			status: "ACTIVE",
		});

		router.push(`/Main_Modules/Employees/details/?id=${encodeURIComponent((data as any).applicant_id)}`);
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2 bg-white border rounded-full px-4 py-2 shadow-sm w-full lg:w-[360px]">
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search Anything"
							className="outline-none text-sm w-full text-black"
						/>
					</div>
					<button
						type="button"
						className="h-10 w-10 rounded-xl border bg-white flex items-center justify-center"
						aria-label="Filters"
					>
						<SlidersHorizontal className="w-5 h-5 text-gray-700" />
					</button>
				</div>

				<div className="flex items-center gap-3 justify-between lg:justify-end">
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
						<button
							onClick={() => setCreateOpen(true)}
							className="px-4 py-2 rounded-full bg-[#FFDA03] text-black font-semibold"
						>
							New Employee
						</button>
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
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
					{filtered.map((e) => {
						const name = getFullName(e);
						const profileUrl = getProfileUrl(e.profile_image_path);
						return (
							<div
								key={e.applicant_id}
								className="bg-white rounded-3xl border shadow-sm p-6 hover:shadow-md transition-shadow"
							>
								<Link
									href={`/Main_Modules/Employees/details/?id=${encodeURIComponent(e.applicant_id)}`}
									className="block"
								>
									<div className="flex flex-col items-center text-center">
										<div className="h-28 w-28 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
											{profileUrl ? (
												<img
													src={profileUrl}
													alt={name}
													className="h-full w-full object-cover"
												/>
											) : (
												<div className="text-xs text-gray-500">No Photo</div>
											)}
										</div>

										<div className="mt-3 text-xs text-gray-500 font-semibold">
											{shortCode(e.applicant_id)}
										</div>
										<div className="mt-1 text-lg font-extrabold tracking-wide text-gray-900 uppercase">
											{name}
										</div>
									</div>
								</Link>

								<div className="mt-4 border rounded-2xl overflow-hidden">
									<div className="grid grid-cols-2 text-sm">
										<div className="px-4 py-3 text-gray-700">Job Title</div>
										<div className="px-4 py-3 font-semibold text-gray-900 text-right">
											{e.client_position ?? "—"}
										</div>
									</div>
									<div className="h-px bg-gray-100" />
									<div className="grid grid-cols-2 text-sm">
										<div className="px-4 py-3 text-gray-700">Detachment</div>
										<div className="px-4 py-3 font-semibold text-gray-900 text-right">
											{e.detachment ?? "—"}
										</div>
									</div>
								</div>

								<div className="mt-4 flex items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
											{e.status ?? "—"}
										</span>
									</div>

									<div className="flex items-center gap-2">
										<button
											onClick={() => router.push(`/Main_Modules/Employees/details/?id=${encodeURIComponent(e.applicant_id)}`)}
											className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
											title="View"
										>
											<Eye className="w-4 h-4" />
										</button>
										{sessionRole !== "employee" ? (
											<>
												<button
													onClick={() => openEdit(e)}
													className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
													title="Edit"
												>
													<Pencil className="w-4 h-4" />
												</button>
												<button
													onClick={() => openArchive(e)}
													className="h-9 px-3 rounded-xl bg-gray-900 text-white text-xs font-semibold"
													title="Archive"
												>
													Archive
												</button>
											</>
										) : null}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Edit Modal */}
			{editOpen && editEmployee ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
					<div className="w-full max-w-xl bg-white rounded-3xl border shadow-xl overflow-hidden">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div>
								<div className="text-lg font-semibold text-black">Edit Employee</div>
								<div className="text-xs text-gray-500">{getFullName(editEmployee)}</div>
							</div>
							<button
								onClick={() => setEditOpen(false)}
								className="px-3 py-2 rounded-xl border bg-white"
							>
								Close
							</button>
						</div>

						<div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
							<label className="text-sm text-black">
								<div className="text-gray-600 mb-1">Job Title</div>
								<input
									value={editDraft.client_position}
									onChange={(e) => setEditDraft((d) => ({ ...d, client_position: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm text-black">
								<div className="text-gray-700 mb-1">Detachment</div>
								<input
									value={editDraft.detachment}
									onChange={(e) => setEditDraft((d) => ({ ...d, detachment: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm text-black">
								<div className="text-gray-700 mb-1">Status</div>
								<input
									value={editDraft.status}
									onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm text-black">
								<div className="text-gray-700 mb-1">Phone Number</div>
								<input
									value={editDraft.client_contact_num}
									onChange={(e) => setEditDraft((d) => ({ ...d, client_contact_num: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm md:col-span-2 text-black">
								<div className="text-gray-700 mb-1">Email Address</div>
								<input
									value={editDraft.client_email}
									onChange={(e) => setEditDraft((d) => ({ ...d, client_email: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
						</div>

						<div className="px-6 pb-6 flex items-center justify-end gap-2 text-black">
							<button
								onClick={() => setEditOpen(false)}
								className="px-4 py-2 rounded-xl border bg-white"
							>
								Cancel
							</button>
							<button
								onClick={saveEdit}
								className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
							>
								Save
							</button>
						</div>
					</div>
				</div>
			) : null}

			{/* Create Modal */}
			{createOpen ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
					<div className="w-full max-w-xl bg-white rounded-3xl border shadow-xl overflow-hidden">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div>
								<div className="text-lg font-semibold text-black">New Employee</div>
								<div className="text-xs text-gray-500">Creates a record in Supabase `applicants`</div>
							</div>
							<button
								onClick={() => setCreateOpen(false)}
								className="px-3 py-2 rounded-xl border bg-white"
							>
								Close
							</button>
						</div>

						<div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
							<label className="text-sm text-black">
								<div className="text-gray-600 mb-1">First Name</div>
								<input
									value={createDraft.first_name}
									onChange={(e) => setCreateDraft((d) => ({ ...d, first_name: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm text-sm text-black">
								<div className="text-gray-600 mb-1">Last Name</div>
								<input
									value={createDraft.last_name}
									onChange={(e) => setCreateDraft((d) => ({ ...d, last_name: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm text-sm text-black">
								<div className="text-gray-600 mb-1">Job Title</div>
								<input
									value={createDraft.client_position}
									onChange={(e) => setCreateDraft((d) => ({ ...d, client_position: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm text-sm text-black">
								<div className="text-gray-600 mb-1">Detachment</div>
								<input
									value={createDraft.detachment}
									onChange={(e) => setCreateDraft((d) => ({ ...d, detachment: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
							<label className="text-sm md:col-span-2 text-sm text-black">
								<div className="text-gray-600 mb-1">Status</div>
								<input
									value={createDraft.status}
									onChange={(e) => setCreateDraft((d) => ({ ...d, status: e.target.value }))}
									className="w-full border rounded-xl px-3 py-2"
								/>
							</label>
						</div>

						<div className="px-6 pb-6 flex items-center justify-end gap-2">
							<button
								onClick={() => setCreateOpen(false)}
								className="px-4 py-2 rounded-xl border bg-white text-sm text-black"
							>
								Cancel
							</button>
							<button
								onClick={createEmployee}
								className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
							>
								Create
							</button>
						</div>
					</div>
				</div>
			) : null}

			{/* Archive Modal */}
			{archiveOpen && archiveEmployee ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
					<div className="w-full max-w-lg bg-white rounded-3xl border shadow-xl overflow-hidden">
						<div className="px-6 py-4 border-b flex items-center justify-between">
							<div>
								<div className="text-lg font-semibold">Archive Employee</div>
								<div className="text-xs text-gray-500">{getFullName(archiveEmployee)}</div>
							</div>
							<button
								onClick={() => setArchiveOpen(false)}
								className="px-3 py-2 rounded-xl border bg-white"
							>
								Close
							</button>
						</div>

						<div className="p-6 text-sm text-gray-700">
							This will move the employee to the Archive page.
						</div>

						<div className="px-6 pb-6 flex items-center justify-end gap-2">
							<button
								onClick={() => setArchiveOpen(false)}
								className="px-4 py-2 rounded-xl border bg-white"
							>
								Cancel
							</button>
							<button
								onClick={confirmArchive}
								className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold"
							>
								Archive
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
