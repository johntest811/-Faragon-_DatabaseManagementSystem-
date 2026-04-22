"use client";

import { PencilLine, Plus, Trash2, X } from "lucide-react";

type RoleDialogMode = "create" | "edit";

type RoleRow = {
	role_id: string;
	role_name: string;
};

type RoleDialogProps = {
	open: boolean;
	mode: RoleDialogMode;
	name: string;
	originalName: string;
	busy: boolean;
	canManage: boolean;
	role: RoleRow | null;
	onClose: () => void;
	onNameChange: (value: string) => void;
	onSubmit: () => void;
	onDelete: () => void;
};

function labelFromRole(roleName: string) {
	const raw = (roleName ?? "").trim();
	if (!raw) return "(unnamed role)";
	return raw
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function RoleDialog({
	open,
	mode,
	name,
	originalName,
	busy,
	canManage,
	role,
	onClose,
	onNameChange,
	onSubmit,
	onDelete,
}: RoleDialogProps) {
	if (!open) return null;

	const canDelete = Boolean(role && role.role_name !== "superadmin");

	return (
		<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
			<div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
				<div className="bg-gradient-to-r from-[#111827] via-[#8B1C1C] to-[#611313] px-6 py-5 text-white">
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/75">
								{mode === "create" ? <Plus className="h-3.5 w-3.5 text-[#FFDA03]" /> : <PencilLine className="h-3.5 w-3.5 text-[#FFDA03]" />}
								{mode === "create" ? "New role" : "Edit role"}
							</div>
							<div className="mt-3 text-2xl font-semibold">
								{mode === "create" ? "Create Role" : `Edit ${labelFromRole(originalName)}`}
							</div>
							<div className="mt-1 text-sm text-white/75">
								{mode === "create"
									? "Create a new position key for accounts and permissions without leaving the Roles tab."
									: "Rename the role key and keep existing admin accounts in sync automatically."}
							</div>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15"
							disabled={busy}
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				<div className="p-6">
					<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">Role key</div>
					<input
						value={name}
						onChange={(e) => onNameChange(e.target.value)}
						placeholder="hr_manager"
						className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-black outline-none focus:border-[#8B1C1C] focus:ring-4 focus:ring-[#8B1C1C]/10"
						disabled={busy}
					/>
					<div className="mt-3 text-xs text-gray-500">
						The role key is stored in lowercase. Editing a role updates any admin accounts using the old key.
					</div>

					{mode === "edit" ? (
						<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
							Deletion is blocked while any admin account still uses this role.
						</div>
					) : null}

					<div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
						{mode === "edit" ? (
							<button
								type="button"
								onClick={onDelete}
								className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
								disabled={busy || !canDelete}
							>
								<Trash2 className="h-4 w-4" />
								Delete role
							</button>
						) : null}
						<div className="flex items-center gap-2 sm:ml-auto">
							<button
								type="button"
								onClick={onClose}
								className="rounded-xl border bg-white px-4 py-2.5 text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
								disabled={busy}
							>
								Cancel
							</button>
							<button
								onClick={onSubmit}
								className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold ${
									canManage ? "bg-[#FFDA03] text-black hover:bg-[#EFCB00]" : "bg-[#FFDA03] text-black opacity-60"
								}`}
								disabled={!canManage || busy}
							>
								{busy ? "Saving..." : mode === "create" ? "Create Role" : "Save Changes"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
