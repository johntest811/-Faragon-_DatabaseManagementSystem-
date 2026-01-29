"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/Client/SupabaseClients";

type EmailSettingsRow = {
	id: string;
	provider: "gmail";
	gmail_user: string;
	from_email: string;
	gmail_app_password: string | null;
	is_active: boolean;
	notes: string | null;
};

type PreferencesRow = {
	id: string;
	is_enabled: boolean;
	days_before_expiry: number;
	include_driver_license: boolean;
	include_security_license: boolean;
	include_insurance: boolean;
	send_time_local: string;
	timezone: string;
};

type ExpiringRow = {
	applicant_id: string;
	last_name: string | null;
	first_name: string | null;
	middle_name: string | null;
	extn_name: string | null;
	client_email: string | null;
	client_contact_num: string | null;
	expires_on: string;
	license_type: "DRIVER_LICENSE" | "SECURITY_LICENSE" | "INSURANCE";
	days_until_expiry: number;
};

function safeText(v: unknown) {
	return String(v ?? "").trim();
}

function fullName(r: Pick<ExpiringRow, "first_name" | "middle_name" | "last_name" | "extn_name">) {
	const parts = [r.first_name, r.middle_name, r.last_name, r.extn_name].filter(Boolean);
	return parts.length ? parts.join(" ") : "(No name)";
}

export default function SettingsPage() {
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	// Email settings (gmail)
	const [gmailUser, setGmailUser] = useState("");
	const [fromEmail, setFromEmail] = useState("");
	const [isActive, setIsActive] = useState(true);
	const [notes, setNotes] = useState("");
	const [storeAppPassword, setStoreAppPassword] = useState(false);
	const [gmailAppPassword, setGmailAppPassword] = useState("");

	// Preferences
	const [enabled, setEnabled] = useState(true);
	const [daysBefore, setDaysBefore] = useState(30);
	const [includeDriver, setIncludeDriver] = useState(false);
	const [includeSecurity, setIncludeSecurity] = useState(true);
	const [includeInsurance, setIncludeInsurance] = useState(false);
	const [sendTimeLocal, setSendTimeLocal] = useState("08:00");
	const [timezone, setTimezone] = useState("Asia/Manila");

	// Preview
	const [preview, setPreview] = useState<ExpiringRow[]>([]);
	const [previewLoading, setPreviewLoading] = useState(false);

	const canPreview = useMemo(() => enabled && daysBefore >= 1 && daysBefore <= 365, [enabled, daysBefore]);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError("");
			setSuccess("");

			try {
				const [emailRes, prefRes] = await Promise.all([
					supabase
						.from("notification_email_settings")
						.select("id, provider, gmail_user, from_email, gmail_app_password, is_active, notes")
						.eq("provider", "gmail")
						.maybeSingle(),
					supabase
						.from("notification_preferences")
						.select(
							"id, is_enabled, days_before_expiry, include_driver_license, include_security_license, include_insurance, send_time_local, timezone"
						)
						.limit(1)
						.maybeSingle(),
				]);

				if (emailRes.error) throw emailRes.error;
				if (prefRes.error) throw prefRes.error;
				if (cancelled) return;

				const email = (emailRes.data as EmailSettingsRow | null) ?? null;
				if (email) {
					setGmailUser(email.gmail_user ?? "");
					setFromEmail(email.from_email ?? "");
					setIsActive(Boolean(email.is_active));
					setNotes(email.notes ?? "");
					// Don’t auto-fill password into the UI; keep it blank.
					setGmailAppPassword("");
					setStoreAppPassword(false);
				}

				const pref = (prefRes.data as PreferencesRow | null) ?? null;
				if (pref) {
					setEnabled(Boolean(pref.is_enabled));
					setDaysBefore(Number(pref.days_before_expiry ?? 30));
					setIncludeDriver(Boolean(pref.include_driver_license));
					setIncludeSecurity(Boolean(pref.include_security_license));
					setIncludeInsurance(Boolean(pref.include_insurance));
					setSendTimeLocal(String(pref.send_time_local ?? "08:00").slice(0, 5));
					setTimezone(pref.timezone ?? "Asia/Manila");
				}
			} catch (e: unknown) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : "Failed to load settings");
			} finally {
				if (cancelled) return;
				setLoading(false);
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	async function loadPreview() {
		setPreviewLoading(true);
		setError("");
		try {
			const res = await supabase
				.from("v_expiring_licensures")
				.select(
					"applicant_id, last_name, first_name, middle_name, extn_name, client_email, client_contact_num, expires_on, license_type, days_until_expiry"
				)
				.order("days_until_expiry", { ascending: true })
				.limit(25);
			if (res.error) throw res.error;
			setPreview((res.data as ExpiringRow[]) ?? []);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to load preview");
		} finally {
			setPreviewLoading(false);
		}
	}

	async function saveAll() {
		setSaving(true);
		setError("");
		setSuccess("");

		try {
			const cleanGmailUser = safeText(gmailUser);
			const cleanFromEmail = safeText(fromEmail);
			if (!cleanGmailUser || !cleanFromEmail) {
				throw new Error("Gmail User and From Email are required.");
			}
			if (daysBefore < 1 || daysBefore > 365) {
				throw new Error("Days before expiry must be between 1 and 365.");
			}

			const emailUpsert = await supabase
				.from("notification_email_settings")
				.upsert(
					{
						provider: "gmail",
						gmail_user: cleanGmailUser,
						from_email: cleanFromEmail,
						is_active: Boolean(isActive),
						notes: safeText(notes) || null,
						gmail_app_password: storeAppPassword ? (safeText(gmailAppPassword) || null) : null,
					},
					{ onConflict: "provider" }
				);
			if (emailUpsert.error) throw emailUpsert.error;

			// Preferences singleton: update existing row if any; otherwise insert.
			const existingPref = await supabase
				.from("notification_preferences")
				.select("id")
				.limit(1)
				.maybeSingle();
			if (existingPref.error) throw existingPref.error;

			if (existingPref.data?.id) {
				const upd = await supabase
					.from("notification_preferences")
					.update({
						is_enabled: Boolean(enabled),
						days_before_expiry: Number(daysBefore),
						include_driver_license: Boolean(includeDriver),
						include_security_license: Boolean(includeSecurity),
						include_insurance: Boolean(includeInsurance),
						send_time_local: safeText(sendTimeLocal) || "08:00",
						timezone: safeText(timezone) || "Asia/Manila",
					})
					.eq("id", existingPref.data.id);
				if (upd.error) throw upd.error;
			} else {
				const ins = await supabase.from("notification_preferences").insert({
					is_enabled: Boolean(enabled),
					days_before_expiry: Number(daysBefore),
					include_driver_license: Boolean(includeDriver),
					include_security_license: Boolean(includeSecurity),
					include_insurance: Boolean(includeInsurance),
					send_time_local: safeText(sendTimeLocal) || "08:00",
					timezone: safeText(timezone) || "Asia/Manila",
				});
				if (ins.error) throw ins.error;
			}

			setSuccess("Saved notification settings.");
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to save settings");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="bg-white rounded-2xl shadow-sm border p-5">
			<div className="flex items-center justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold">Settings</div>
					<div className="text-sm text-gray-500">Email notifications for expiring licensures</div>
				</div>
				<button
					onClick={() => router.push("/Main_Modules/Dashboard/")}
					className="px-4 py-2 rounded-xl bg-white border"
				>
					Back
				</button>
			</div>

			{loading ? (
				<div className="text-gray-600">Loading settings…</div>
			) : (
				<div className="space-y-6">
					{error ? (
						<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							{error}
						</div>
					) : null}
					{success ? (
						<div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
							{success}
						</div>
					) : null}

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<div className="rounded-2xl border p-4">
							<div className="font-semibold mb-2">Gmail Sender</div>
							<div className="text-xs text-gray-500 mb-4">
								Used to send notification emails. Recommended: keep the Gmail App Password in a server/secret, not in
								the client.
							</div>

							<label className="block text-sm mb-1">Gmail User</label>
							<input
								value={gmailUser}
								onChange={(e) => setGmailUser(e.target.value)}
								placeholder="yourcompany.notifications@gmail.com"
								className="w-full rounded-xl border px-3 py-2"
							/>

							<label className="block text-sm mt-3 mb-1">From Email</label>
							<input
								value={fromEmail}
								onChange={(e) => setFromEmail(e.target.value)}
								placeholder="yourcompany.notifications@gmail.com"
								className="w-full rounded-xl border px-3 py-2"
							/>

							<div className="flex items-center gap-2 mt-3">
								<input
									id="isActive"
									type="checkbox"
									checked={isActive}
									onChange={(e) => setIsActive(e.target.checked)}
								/>
								<label htmlFor="isActive" className="text-sm">
									Active
								</label>
							</div>

							<div className="flex items-center gap-2 mt-3">
								<input
									id="storePass"
									type="checkbox"
									checked={storeAppPassword}
									onChange={(e) => setStoreAppPassword(e.target.checked)}
								/>
								<label htmlFor="storePass" className="text-sm">
									Store Gmail App Password in database (not recommended)
								</label>
							</div>

							{storeAppPassword ? (
								<div className="mt-3">
									<label className="block text-sm mb-1">Gmail App Password</label>
									<input
										type="password"
										value={gmailAppPassword}
										onChange={(e) => setGmailAppPassword(e.target.value)}
										placeholder="xxxx xxxx xxxx xxxx"
										className="w-full rounded-xl border px-3 py-2"
									/>
									<div className="text-xs text-gray-500 mt-1">
										If you leave this blank, the saved password will be cleared.
									</div>
								</div>
							) : null}

							<label className="block text-sm mt-3 mb-1">Notes</label>
							<textarea
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Optional"
								className="w-full rounded-xl border px-3 py-2 min-h-[88px]"
							/>
						</div>

						<div className="rounded-2xl border p-4">
							<div className="font-semibold mb-2">Expiring Licensure Preferences</div>

							<div className="flex items-center gap-2">
								<input
									id="enabled"
									type="checkbox"
									checked={enabled}
									onChange={(e) => setEnabled(e.target.checked)}
								/>
								<label htmlFor="enabled" className="text-sm">
									Enable notifications
								</label>
							</div>

							<label className="block text-sm mt-3 mb-1">Days before expiry</label>
							<input
								type="number"
								min={1}
								max={365}
								value={daysBefore}
								onChange={(e) => setDaysBefore(Number(e.target.value))}
								className="w-full rounded-xl border px-3 py-2"
							/>

							<div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={includeDriver}
										onChange={(e) => setIncludeDriver(e.target.checked)}
									/>
									Driver License
								</label>
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={includeSecurity}
										onChange={(e) => setIncludeSecurity(e.target.checked)}
									/>
									Security License
								</label>
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={includeInsurance}
										onChange={(e) => setIncludeInsurance(e.target.checked)}
									/>
									Insurance
								</label>
							</div>

							<label className="block text-sm mt-3 mb-1">Send time (local)</label>
							<input
								type="time"
								value={sendTimeLocal}
								onChange={(e) => setSendTimeLocal(e.target.value)}
								className="w-full rounded-xl border px-3 py-2"
							/>

							<label className="block text-sm mt-3 mb-1">Timezone</label>
							<input
								value={timezone}
								onChange={(e) => setTimezone(e.target.value)}
								placeholder="Asia/Manila"
								className="w-full rounded-xl border px-3 py-2"
							/>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<button
							onClick={() => void saveAll()}
							disabled={saving}
							className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
						>
							{saving ? "Saving…" : "Save"}
						</button>
						<button
							onClick={() => void loadPreview()}
							disabled={previewLoading || !canPreview}
							className="px-4 py-2 rounded-xl bg-white border disabled:opacity-50"
						>
							{previewLoading ? "Loading preview…" : "Preview expiring licensures"}
						</button>
					</div>

					<div className="rounded-2xl border p-4">
						<div className="font-semibold mb-2">Preview (next 25)</div>
						{preview.length === 0 ? (
							<div className="text-sm text-gray-600">No preview loaded yet.</div>
						) : (
							<div className="overflow-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left border-b">
											<th className="py-2 pr-3">Employee</th>
											<th className="py-2 pr-3">Type</th>
											<th className="py-2 pr-3">Expires</th>
											<th className="py-2 pr-3">Days</th>
											<th className="py-2 pr-3">Email</th>
										</tr>
									</thead>
									<tbody>
										{preview.map((r) => (
											<tr key={`${r.applicant_id}:${r.license_type}:${r.expires_on}`} className="border-b">
												<td className="py-2 pr-3 whitespace-nowrap">{fullName(r)}</td>
												<td className="py-2 pr-3 whitespace-nowrap">{r.license_type}</td>
												<td className="py-2 pr-3 whitespace-nowrap">{r.expires_on}</td>
												<td className="py-2 pr-3 whitespace-nowrap">{r.days_until_expiry}</td>
												<td className="py-2 pr-3 whitespace-nowrap">{r.client_email ?? ""}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
