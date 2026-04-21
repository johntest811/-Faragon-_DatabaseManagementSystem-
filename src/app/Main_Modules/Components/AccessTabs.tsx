"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, KeyRound, ShieldCheck, UserCog, type LucideIcon } from "lucide-react";

type Tab = { label: string; href: string; deepMatch?: boolean; icon: LucideIcon };

const TABS: Tab[] = [
	{ label: "Admin Accounts", href: "/Main_Modules/AdminAccounts/", icon: UserCog },
	{ label: "Roles", href: "/Main_Modules/Roles/", icon: ShieldCheck },
	{ label: "Permissions", href: "/Main_Modules/Permissions/", icon: KeyRound },
	{ label: "Requests", href: "/Main_Modules/Requests/", deepMatch: false, icon: ClipboardList },
	{ label: "Reviewer Queue", href: "/Main_Modules/Requests/Queue/", icon: ClipboardList },
];

function normalize(path: string) {
	return (path || "/").replace(/\/+$/, "");
}

export function AccessTabs() {
	const pathname = usePathname() ?? "";
	const current = normalize(pathname);

	return (
		<div className="flex items-center gap-2 overflow-x-auto">
			{TABS.map((t) => {
				const target = normalize(t.href);
				const active = current === target || ((t.deepMatch ?? true) && current.startsWith(target + "/"));
				const Icon = t.icon;
				return (
					<Link
						key={t.href}
						href={t.href}
						className={
							"inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm whitespace-nowrap transition-colors " +
							(active ? "bg-[#FFDA03] text-black border-[#E2C100]" : "bg-white text-gray-700 border-slate-200 hover:bg-slate-50")
						}
					>
						<Icon className="h-4 w-4" />
						{t.label}
					</Link>
				);
			})}
		</div>
	);
}
