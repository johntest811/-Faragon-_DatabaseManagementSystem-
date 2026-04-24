"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export const EMPLOYEE_STATUS_OPTIONS = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "APPLICANT", label: "Applicant" },
	{ value: "INACTIVE", label: "Inactive" },
	{ value: "REASSIGN", label: "Reassign" },
	{ value: "RESIGNED", label: "Resigned" },
	{ value: "RETIRED", label: "Retired" },
] as const;

type EmployeeStatusValue = (typeof EMPLOYEE_STATUS_OPTIONS)[number]["value"];

type EmployeeStatusMenuProps = {
	value: string;
	onChange: (nextStatus: EmployeeStatusValue) => void;
	disabled?: boolean;
};

function normalizeStatus(value: string | null | undefined) {
	const normalized = String(value ?? "").trim().toUpperCase();
	return (EMPLOYEE_STATUS_OPTIONS.find((option) => option.value === normalized)?.value ?? "ACTIVE") as EmployeeStatusValue;
}

function statusTone(status: EmployeeStatusValue) {
	switch (status) {
		case "ACTIVE":
			return {
				trigger: "bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600",
				dot: "bg-white/90",
				menuSelected: "bg-emerald-50 text-emerald-800",
			};
		case "APPLICANT":
			return {
				trigger: "bg-sky-500 text-white border-sky-400 hover:bg-sky-600",
				dot: "bg-white/90",
				menuSelected: "bg-sky-50 text-sky-800",
			};
		case "INACTIVE":
			return {
				trigger: "bg-slate-600 text-white border-slate-500 hover:bg-slate-700",
				dot: "bg-white/90",
				menuSelected: "bg-slate-50 text-slate-800",
			};
		case "REASSIGN":
			return {
				trigger: "bg-amber-500 text-white border-amber-400 hover:bg-amber-600",
				dot: "bg-white/90",
				menuSelected: "bg-amber-50 text-amber-800",
			};
		case "RESIGNED":
			return {
				trigger: "bg-rose-500 text-white border-rose-400 hover:bg-rose-600",
				dot: "bg-white/90",
				menuSelected: "bg-rose-50 text-rose-800",
			};
		case "RETIRED":
			return {
				trigger: "bg-zinc-700 text-white border-zinc-600 hover:bg-zinc-800",
				dot: "bg-white/90",
				menuSelected: "bg-zinc-50 text-zinc-800",
			};
		default:
			return {
				trigger: "bg-slate-600 text-white border-slate-500 hover:bg-slate-700",
				dot: "bg-white/90",
				menuSelected: "bg-slate-50 text-slate-800",
			};
	}
}

export default function EmployeeStatusMenu({ value, onChange, disabled = false }: EmployeeStatusMenuProps) {
	const normalized = normalizeStatus(value);
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const currentOption = useMemo(
		() => EMPLOYEE_STATUS_OPTIONS.find((option) => option.value === normalized) ?? EMPLOYEE_STATUS_OPTIONS[0],
		[normalized]
	);
	const tone = statusTone(normalized);

	useEffect(() => {
		if (!open) return;

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target || !rootRef.current) return;
			if (!rootRef.current.contains(target)) setOpen(false);
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative inline-flex">
			<button
				type="button"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={(event) => {
					event.stopPropagation();
					if (disabled) return;
					setOpen((prev) => !prev);
				}}
				className={`inline-flex min-w-[8.5rem] items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm transition ${tone.trigger} ${
					disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
				}`}
				disabled={disabled}
			>
				<span className={`h-2 w-2 rounded-full ${tone.dot}`} />
				<span className="truncate">{currentOption.label}</span>
				<ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
			</button>

			{open ? (
				<div
					role="menu"
					onClick={(event) => event.stopPropagation()}
					className="absolute bottom-full left-0 z-30 mb-2 min-w-[12rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
				>
					<div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
						Change status
					</div>
					<div className="max-h-64 overflow-auto p-1">
						{EMPLOYEE_STATUS_OPTIONS.map((option) => {
							const selected = option.value === normalized;
							return (
								<button
									key={option.value}
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										setOpen(false);
										if (!selected) onChange(option.value);
									}}
									className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
										selected ? tone.menuSelected : "text-slate-700 hover:bg-slate-50"
									}`}
								>
									<span>{option.label}</span>
									{selected ? <Check className="h-4 w-4" /> : null}
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}