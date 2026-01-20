"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function EmployeesPage() {
	const router = useRouter();

	return (
		<div className="min-h-screen bg-gray-50 p-6">
			<header className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-2xl font-bold">Employees</h1>
					<p className="text-sm text-gray-600">Manage employees (placeholder)</p>
				</div>
				<div className="flex items-center gap-3">
					<button
						onClick={() => router.push("/Main_Modules/Dashboard")}
						className="px-4 py-2 bg-white border rounded shadow-sm"
					>
						Back
					</button>
				</div>
			</header>

			<main>
				<section className="bg-white rounded shadow p-4">
					<h2 className="text-lg font-medium mb-2">Coming soon</h2>
					<p className="text-gray-600">
						This page is a placeholder so the exported build works. Next step is wiring your employee
						table and CRUD.
					</p>
				</section>
			</main>
		</div>
	);
}
