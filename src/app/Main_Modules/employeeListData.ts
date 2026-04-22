import { supabase } from "../Client/SupabaseClients";

type LicensureRow = {
	applicant_id: string;
	driver_expiration: string | null;
	security_expiration: string | null;
	insurance_expiration: string | null;
};

export type EmployeeLicensureMap = Record<string, { nextYmd: string | null; nextDays: number | null }>;

type LegacyAdminSession = {
	id: string;
};

export type EmployeeStatusUpdatePatch = {
	status: string;
	retired_date: string | null;
	retired_reason: string | null;
	retired_at: string | null;
	retired_by: string | null;
};

function ymd(d: string | null) {
	if (!d) return null;
	const dt = new Date(d);
	if (Number.isNaN(dt.getTime())) return null;
	return dt.toISOString().slice(0, 10);
}

function daysUntil(dateYmd: string | null) {
	if (!dateYmd) return null;
	const today = new Date();
	const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const dt = new Date(dateYmd);
	if (Number.isNaN(dt.getTime())) return null;
	return Math.ceil((dt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function nextLicenseExpiryFromLicensureRow(r: LicensureRow | null) {
	if (!r) return { ymd: null as string | null, days: null as number | null };
	const candidates = [ymd(r.driver_expiration), ymd(r.security_expiration), ymd(r.insurance_expiration)].filter(Boolean) as string[];
	if (!candidates.length) return { ymd: null, days: null };
	const sorted = [...candidates].sort((a, b) => a.localeCompare(b));
	const next = sorted[0];
	return { ymd: next, days: daysUntil(next) };
}

function normalizeEmployeeStatus(value: string | null | undefined) {
	const normalized = String(value ?? "").trim().toUpperCase();
	if (normalized === "ACTIVE" || normalized === "INACTIVE" || normalized === "REASSIGN" || normalized === "RETIRED" || normalized === "RESIGNED") {
		return normalized;
	}
	return "ACTIVE";
}

export function getLegacyAdminId() {
	try {
		const raw = localStorage.getItem("adminSession");
		if (!raw) return null;
		const parsed = JSON.parse(raw) as LegacyAdminSession;
		const id = String(parsed?.id ?? "").trim();
		return id || null;
	} catch {
		return null;
	}
}

export function buildEmployeeStatusUpdatePatch(nextStatus: string): EmployeeStatusUpdatePatch {
	const normalized = normalizeEmployeeStatus(nextStatus);
	const isRetired = normalized === "RETIRED";
	const now = new Date();

	return {
		status: normalized,
		retired_date: isRetired ? now.toISOString().slice(0, 10) : null,
		retired_reason: isRetired ? "N/A" : null,
		retired_at: isRetired ? now.toISOString() : null,
		retired_by: isRetired ? getLegacyAdminId() : null,
	};
}

export async function loadLicensureMap(applicantIds: string[], chunkSize = 500): Promise<EmployeeLicensureMap> {
	const uniqueIds = Array.from(new Set(applicantIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
	if (!uniqueIds.length) return {};

	const chunks: string[][] = [];
	for (let index = 0; index < uniqueIds.length; index += chunkSize) {
		chunks.push(uniqueIds.slice(index, index + chunkSize));
	}

	const results = await Promise.all(
		chunks.map((chunk) =>
			supabase
				.from("licensure")
				.select("applicant_id, driver_expiration, security_expiration, insurance_expiration")
				.in("applicant_id", chunk)
		)
	);

	const map: EmployeeLicensureMap = {};
	for (const result of results) {
		if (result.error) continue;
		for (const row of (result.data as LicensureRow[]) || []) {
			const next = nextLicenseExpiryFromLicensureRow(row);
			map[String(row.applicant_id)] = { nextYmd: next.ymd, nextDays: next.days };
		}
	}

	return map;
}

