"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
	const router = useRouter();

	return (
		<section className="bg-white rounded-2xl shadow-sm border p-5">
			<div className="flex items-center justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold">Settings</div>
					<div className="text-sm text-gray-500">Application settings (placeholder)</div>
				</div>
				<button
					onClick={() => router.push("/Main_Modules/Dashboard/")}
					className="px-4 py-2 rounded-xl bg-white border"
				>
					Back
				</button>
			</div>
			<div className="text-gray-600">
				Coming soon. Next step is adding settings storage (Supabase or local settings file).
			</div>
		</section>
	);
}
