"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; href: string };

const TABS: Tab[] = [
	{ label: "Admin Accounts", href: "/Main_Modules/AdminAccounts/" },
	{ label: "Roles", href: "/Main_Modules/Roles/" },
	{ label: "Permissions", href: "/Main_Modules/Permissions/" },
	{ label: "Requests", href: "/Main_Modules/Requests/" },
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
				const active = current === normalize(t.href) || current.startsWith(normalize(t.href) + "/");
				return (
					<Link
						key={t.href}
						href={t.href}
						className={
							"px-3 py-1.5 rounded-full border text-sm whitespace-nowrap " +
							(active ? "bg-[#FFDA03] text-black" : "bg-white text-gray-700")
						}
					>
						{t.label}
					</Link>
				);
			})}
		</div>
	);
}
