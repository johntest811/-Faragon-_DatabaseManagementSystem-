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

type LogRow = {
	id: string;
	created_at: string;
	applicant_id: string;
	license_type: string;
	expires_on: string;
	recipient_email: string | null;
	status: string;
	error_message: string | null;
};

type LicensureJoinRow = {
	applicant_id: string;
	driver_expiration: string | null;
	security_expiration: string | null;
	insurance_expiration: string | null;
	applicants?: {
		applicant_id: string;
		first_name: string | null;
		middle_name: string | null;
		last_name: string | null;
		extn_name: string | null;
		client_email: string | null;
		client_contact_num: string | null;
	} | null;
};

type ApplicantMiniRow = {
	applicant_id: string;
	first_name: string | null;
	middle_name: string | null;
	last_name: string | null;
	extn_name: string | null;
	client_email: string | null;
	client_contact_num: string | null;
};

type RunNowResult = {
	message?: string;
	summary?: { sent?: number; failed?: number; skipped?: number };
};

function getElectronAPI() {
	const w = globalThis as unknown as { window?: unknown };
	const anyWin = (w as unknown as { electronAPI?: unknown }).electronAPI as
		| {
			settings?: {
				loadNotificationConfig?: () => Promise<{
					email: EmailSettingsRow | null;
					preferences: PreferencesRow | null;
					env?: { hasGmailUser?: boolean; hasGmailPass?: boolean; hasGmailFrom?: boolean };
				}>;
				saveNotificationConfig?: (payload: unknown) => Promise<unknown>;
			};
			notifications?: {
				previewExpiring?: (payload?: unknown) => Promise<{ rows: ExpiringRow[] }>;
				getLog?: (payload?: unknown) => Promise<{ rows: LogRow[] }>;
				sendTestEmail?: (payload: unknown) => Promise<unknown>;
				runNow?: () => Promise<unknown>;
			};
		}
		| undefined;

	return anyWin;
}

function safeText(v: unknown) {
	return String(v ?? "").trim();
}

function errorMessage(e: unknown) {
	if (e instanceof Error) return e.message;
	if (e && typeof e === "object") {
		const anyErr = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
		const msg = typeof anyErr.message === "string" ? anyErr.message : "";
		const details = typeof anyErr.details === "string" ? anyErr.details : "";
		const hint = typeof anyErr.hint === "string" ? anyErr.hint : "";
		const code = typeof anyErr.code === "string" ? anyErr.code : "";
		const parts = [msg, details, hint, code ? `code=${code}` : ""].filter(Boolean);
		if (parts.length) return parts.join(" — ");
	}
	return "Failed to save settings";
}

function fullName(r: Pick<ExpiringRow, "first_name" | "middle_name" | "last_name" | "extn_name">) {
	const parts = [r.first_name, r.middle_name, r.last_name, r.extn_name].filter(Boolean);
	return parts.length ? parts.join(" ") : "(No name)";
}

export default function SettingsPage() {
	const router = useRouter();
	const electronAPI = useMemo(() => getElectronAPI(), []);
	const isDesktop = Boolean(electronAPI?.settings?.loadNotificationConfig);

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

	// Logs / send
	const [logStatus, setLogStatus] = useState<string>("SENT");
	const [logs, setLogs] = useState<LogRow[]>([]);
	const [logsLoading, setLogsLoading] = useState(false);
	const [testToEmail, setTestToEmail] = useState("");
	const [testSending, setTestSending] = useState(false);
	const [runSending, setRunSending] = useState(false);
	const [runSummary, setRunSummary] = useState<string>("");
	const [envHasGmailPass, setEnvHasGmailPass] = useState<boolean | null>(null);

	const canPreview = useMemo(() => enabled && daysBefore >= 1 && daysBefore <= 365, [enabled, daysBefore]);

	useEffect(() => {
		let cancelled = false;
		async function loadLogs() {
			if (!electronAPI?.notifications?.getLog) return;
			setLogsLoading(true);
			try {
				const res = await electronAPI.notifications.getLog({ status: logStatus, limit: 25 });
				if (cancelled) return;
				setLogs(res?.rows ?? []);
			} catch {
				// Don't surface background log fetch errors; the user can click Refresh Log.
			} finally {
				if (cancelled) return;
				setLogsLoading(false);
			}
		}

		if (isDesktop) void loadLogs();
		return () => {
			cancelled = true;
		};
	}, [electronAPI, isDesktop, logStatus]);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError("");
			setSuccess("");

			try {
				if (electronAPI?.settings?.loadNotificationConfig) {
					const cfg = await electronAPI.settings.loadNotificationConfig();
					if (cancelled) return;

					setEnvHasGmailPass(Boolean(cfg?.env?.hasGmailPass));
					const email = (cfg.email as EmailSettingsRow | null) ?? null;
					if (email) {
						setGmailUser(email.gmail_user ?? "");
						setFromEmail(email.from_email ?? "");
						setIsActive(Boolean(email.is_active));
						setNotes(email.notes ?? "");
						setGmailAppPassword("");
						setStoreAppPassword(false);
						setTestToEmail(email.gmail_user ?? "");
					}

					const pref = (cfg.preferences as PreferencesRow | null) ?? null;
					if (pref) {
						setEnabled(Boolean(pref.is_enabled));
						setDaysBefore(Number(pref.days_before_expiry ?? 30));
						setIncludeDriver(Boolean(pref.include_driver_license));
						setIncludeSecurity(Boolean(pref.include_security_license));
						setIncludeInsurance(Boolean(pref.include_insurance));
						setSendTimeLocal(String(pref.send_time_local ?? "08:00").slice(0, 5));
						setTimezone(pref.timezone ?? "Asia/Manila");
					}
				} else {
					// Web fallback (anon key) – may be blocked by RLS depending on your policies.
					const [emailRes, prefRes] = await Promise.all([
						supabase
							.from("notification_email_settings")
							.select("id, provider, gmail_user, from_email, gmail_app_password, is_active, notes")
							.eq("provider", "gmail")
							.limit(1)
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
						setGmailAppPassword("");
						setStoreAppPassword(false);
						setTestToEmail(email.gmail_user ?? "");
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
				}
			} catch (e: unknown) {
				if (cancelled) return;
				setError(errorMessage(e));
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
			if (electronAPI?.notifications?.previewExpiring) {
				const r = await electronAPI.notifications.previewExpiring({ limit: 25 });
				setPreview((r?.rows as ExpiringRow[]) ?? []);
				return;
			}

			// Web fallback (compute from base tables; avoids needing v_expiring_licensures view)
			const lic = await supabase
				.from("licensure")
				.select("applicant_id, driver_expiration, security_expiration, insurance_expiration")
				.limit(10000);
			if (lic.error) throw lic.error;

			const licRows = ((lic.data as unknown) as LicensureJoinRow[]) ?? [];
			const ids = Array.from(new Set(licRows.map((r) => r.applicant_id).filter(Boolean)));

			const applicantsById = new Map<string, ApplicantMiniRow>();
			const chunkSize = 500;
			for (let i = 0; i < ids.length; i += chunkSize) {
				const chunk = ids.slice(i, i + chunkSize);
				const aRes = await supabase
					.from("applicants")
					.select("applicant_id, first_name, middle_name, last_name, extn_name, client_email, client_contact_num")
					.in("applicant_id", chunk);
				if (aRes.error) throw aRes.error;
				for (const a of ((aRes.data as unknown) as ApplicantMiniRow[]) ?? []) {
					applicantsById.set(a.applicant_id, a);
				}
			}

			const daysBeforeExpiry = Number(daysBefore);
			const include = {
				driver: Boolean(includeDriver),
				security: Boolean(includeSecurity),
				insurance: Boolean(includeInsurance),
			};

			function toYmd(v: unknown) {
				const s = safeText(v);
				if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
				return "";
			}

			function daysUntilYmd(ymd: string) {
				if (!ymd) return null;
				const [y, m, d] = ymd.split("-").map((n) => Number(n));
				const target = new Date(y, m - 1, d, 0, 0, 0, 0);
				const today = new Date();
				const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
				return Math.round((target.getTime() - t0.getTime()) / (24 * 60 * 60 * 1000));
			}

			const out: ExpiringRow[] = [];
			for (const row of licRows) {
				const a = applicantsById.get(row.applicant_id);
				const base = {
					applicant_id: String(row.applicant_id),
					last_name: a?.last_name ?? null,
					first_name: a?.first_name ?? null,
					middle_name: a?.middle_name ?? null,
					extn_name: a?.extn_name ?? null,
					client_email: a?.client_email ?? null,
					client_contact_num: a?.client_contact_num ?? null,
				};

				if (include.driver) {
					const exp = toYmd(row.driver_expiration);
					const du = exp ? daysUntilYmd(exp) : null;
					if (exp && du !== null && du >= 0 && du <= daysBeforeExpiry) {
						out.push({ ...base, expires_on: exp, license_type: "DRIVER_LICENSE", days_until_expiry: du });
					}
				}
				if (include.security) {
					const exp = toYmd(row.security_expiration);
					const du = exp ? daysUntilYmd(exp) : null;
					if (exp && du !== null && du >= 0 && du <= daysBeforeExpiry) {
						out.push({ ...base, expires_on: exp, license_type: "SECURITY_LICENSE", days_until_expiry: du });
					}
				}
				if (include.insurance) {
					const exp = toYmd(row.insurance_expiration);
					const du = exp ? daysUntilYmd(exp) : null;
					if (exp && du !== null && du >= 0 && du <= daysBeforeExpiry) {
						out.push({ ...base, expires_on: exp, license_type: "INSURANCE", days_until_expiry: du });
					}
				}
			}

			out.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
			setPreview(out.slice(0, 25));
		} catch (e: unknown) {
			setError(errorMessage(e));
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

			if (electronAPI?.settings?.saveNotificationConfig) {
				await electronAPI.settings.saveNotificationConfig({
					email: {
						gmail_user: cleanGmailUser,
						from_email: cleanFromEmail,
						is_active: Boolean(isActive),
						notes: safeText(notes) || null,
						gmail_app_password: safeText(gmailAppPassword) || null,
					},
					preferences: {
						is_enabled: Boolean(enabled),
						days_before_expiry: Number(daysBefore),
						include_driver_license: Boolean(includeDriver),
						include_security_license: Boolean(includeSecurity),
						include_insurance: Boolean(includeInsurance),
						send_time_local: safeText(sendTimeLocal) || "08:00",
						timezone: safeText(timezone) || "Asia/Manila",
					},
					storeAppPassword: Boolean(storeAppPassword),
				});
			} else {
				// Web fallback (anon key) – may be blocked by RLS.
				const existingEmail = await supabase
					.from("notification_email_settings")
					.select("id")
					.eq("provider", "gmail")
					.limit(1)
					.maybeSingle();
				if (existingEmail.error) throw existingEmail.error;

				const baseEmailPayload: Partial<EmailSettingsRow> & {
					provider: "gmail";
					gmail_user: string;
					from_email: string;
					is_active: boolean;
					notes: string | null;
				} = {
					provider: "gmail",
					gmail_user: cleanGmailUser,
					from_email: cleanFromEmail,
					is_active: Boolean(isActive),
					notes: safeText(notes) || null,
				};

				const passwordPayload = storeAppPassword ? { gmail_app_password: safeText(gmailAppPassword) || null } : {};

				if (existingEmail.data?.id) {
					const updEmail = await supabase
						.from("notification_email_settings")
						.update({ ...baseEmailPayload, ...passwordPayload })
						.eq("id", existingEmail.data.id);
					if (updEmail.error) throw updEmail.error;
				} else {
					const insEmail = await supabase
						.from("notification_email_settings")
						.insert({ ...baseEmailPayload, ...passwordPayload });
					if (insEmail.error) throw insEmail.error;
				}

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
			}

			setSuccess("Saved notification settings.");
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="bg-white rounded-2xl shadow-sm border p-5">
			<div className="flex items-center justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-semibold text-black">Settings</div>
					<div className="text-sm text-gray-500">Email notifications for expiring licensures</div>
				</div>
				<button
					onClick={() => router.push("/Main_Modules/Dashboard/")}
					className="px-4 py-2 rounded-xl bg-white border"
				>
					Back
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-3 mb-4">
				<div className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
					<span className="text-gray-600">Notifications:</span>
					<span className={enabled ? "text-green-700 font-semibold" : "text-gray-600 font-semibold"}>
						{enabled ? "Enabled" : "Disabled"}
					</span>
				</div>
				<div className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
					<span className="text-gray-600">Log:</span>
					<select
						value={logStatus}
						onChange={(e) => setLogStatus(e.target.value)}
						className="rounded-lg border px-2 py-1 text-black"
					>
						<option value="ALL">All</option>
						<option value="SENT">Sent</option>
						<option value="FAILED">Failed</option>
						<option value="SKIPPED">Skipped</option>
						<option value="QUEUED">Queued</option>
					</select>
				</div>
				{isDesktop ? (
					<div className="text-xs text-gray-500">
						Gmail pass in env: {envHasGmailPass ? "yes" : envHasGmailPass === false ? "no" : "unknown"}
					</div>
				) : (
					<div className="text-xs text-gray-500">
						Desktop email sending is only available in the Electron app.
					</div>
				)}
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
							<div className="font-semibold mb-2 text-black">Gmail Sender</div>
							<div className="text-xs text-gray-500 mb-4">
								Used to send notification emails. Recommended: keep the Gmail App Password in a server/secret, not in
								the client.
							</div>

							<label className="block text-sm mb-1 text-black">Gmail User</label>
							<input
								value={gmailUser}
								onChange={(e) => setGmailUser(e.target.value)}
								placeholder="yourcompany.notifications@gmail.com"
								className="w-full rounded-xl border px-3 py-2 text-black"
							/>

							<label className="block text-sm mt-3 mb-1 text-black">From Email</label>
							<input
								value={fromEmail}
								onChange={(e) => setFromEmail(e.target.value)}
								placeholder="yourcompany.notifications@gmail.com"
								className="w-full rounded-xl border px-3 py-2 text-black"
							/>

							<div className="flex items-center gap-2 mt-3">
								<input
									id="isActive"
									type="checkbox"
									checked={isActive}
									onChange={(e) => setIsActive(e.target.checked)}
								/>
								<label htmlFor="isActive" className="text-sm text-black">
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
								<label htmlFor="storePass" className="text-sm text-black">
									Store Gmail App Password in database (not recommended)
								</label>
							</div>

							{storeAppPassword ? (
								<div className="mt-3">
									<label className="block text-sm mb-1 text-black">Gmail App Password</label>
									<input
										type="password"
										value={gmailAppPassword}
										onChange={(e) => setGmailAppPassword(e.target.value)}
										placeholder="xxxx xxxx xxxx xxxx"
										className="w-full rounded-xl border px-3 py-2 text-black"
									/>
									<div className="text-xs text-gray-500 mt-1">
										If you leave this blank, the saved password will be cleared.
									</div>
								</div>
							) : null}

							<label className="block text-sm mt-3 mb-1 text-black">Notes</label>
							<textarea
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Optional"
								className="w-full rounded-xl border px-3 py-2 min-h-[88px] text-black"
							/>
						</div>

						<div className="rounded-2xl border p-4">
							<div className="font-semibold mb-2 text-black">Expiring Licensure Preferences</div>

							<div className="flex items-center gap-2 text-black">
								<input
									id="enabled"
									type="checkbox"
									checked={enabled}
									onChange={(e) => setEnabled(e.target.checked)}
								/>
								<label htmlFor="enabled" className="text-sm text-black">
									Enable notifications
								</label>
							</div>

							<label className="block text-sm mt-3 mb-1 text-black">Days before expiry</label>
							<input
								type="number"
								min={1}
								max={365}
								value={daysBefore}
								onChange={(e) => setDaysBefore(Number(e.target.value))}
								className="w-full rounded-xl border px-3 py-2 text-black"
							/>

							<div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
								<label className="flex items-center gap-2 text-sm text-black">
									<input
										type="checkbox"
										checked={includeDriver}
										onChange={(e) => setIncludeDriver(e.target.checked)}
									/>
									Driver License
								</label>
								<label className="flex items-center gap-2 text-sm text-black">
									<input
										type="checkbox"
										checked={includeSecurity}
										onChange={(e) => setIncludeSecurity(e.target.checked)}
									/>
									Security License
								</label>
								<label className="flex items-center gap-2 text-sm text-black">
									<input
										type="checkbox"
										checked={includeInsurance}
										onChange={(e) => setIncludeInsurance(e.target.checked)}
									/>
									Insurance
								</label>
							</div>

							<label className="block text-sm mt-3 mb-1 text-black">Send time (local)</label>
							<input
								type="time"
								value={sendTimeLocal}
								onChange={(e) => setSendTimeLocal(e.target.value)}
								className="w-full rounded-xl border px-3 py-2 text-black"
							/>

							<label className="block text-sm mt-3 mb-1 text-black">Timezone</label>
							<input
								value={timezone}
								onChange={(e) => setTimezone(e.target.value)}
								placeholder="Asia/Manila"
								className="w-full rounded-xl border px-3 py-2 text-black"
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
							onClick={async () => {
								setTestSending(true);
								setError("");
								setSuccess("");
								try {
									if (!electronAPI?.notifications?.sendTestEmail) {
										throw new Error("Test run is only available in the Electron desktop app.");
									}
									await electronAPI.notifications.sendTestEmail({ to: safeText(testToEmail) || safeText(gmailUser) });
									setSuccess("Test email sent. Check the inbox/spam folder.");
								} catch (e: unknown) {
									setError(errorMessage(e));
								} finally {
									setTestSending(false);
								}
							}}
							disabled={testSending}
							className="px-4 py-2 rounded-xl bg-white border disabled:opacity-50 text-black"
						>
							{testSending ? "Sending test…" : "Test run"}
						</button>
						<button
							onClick={async () => {
								setRunSending(true);
								setError("");
								setSuccess("");
								setRunSummary("");
								try {
									if (!electronAPI?.notifications?.runNow) {
										throw new Error("Run now is only available in the Electron desktop app.");
									}
									const r = (await electronAPI.notifications.runNow()) as RunNowResult;
									const summary = r?.summary
										? `sent=${r.summary.sent ?? 0}, failed=${r.summary.failed ?? 0}, skipped=${r.summary.skipped ?? 0}`
										: "";
									setRunSummary(summary);
									setSuccess(r?.message || "Notification run finished.");
									// refresh logs after running
									void (async () => {
										try {
											if (electronAPI?.notifications?.getLog) {
												setLogsLoading(true);
												const res = await electronAPI.notifications.getLog({ status: logStatus, limit: 25 });
												setLogs(res?.rows ?? []);
											}
										} finally {
											setLogsLoading(false);
										}
									})();
								} catch (e: unknown) {
									setError(errorMessage(e));
								} finally {
									setRunSending(false);
								}
							}}
							disabled={runSending}
							className="px-4 py-2 rounded-xl bg-[#8B1C1C] text-white disabled:opacity-50"
						>
							{runSending ? "Running…" : "Run now"}
						</button>
						<button
							onClick={() => void loadPreview()}
							disabled={previewLoading || !canPreview}
							className="px-4 py-2 rounded-xl bg-white border disabled:opacity-50 text-black"
						>
							{previewLoading ? "Loading preview…" : "Preview expiring licensures"}
						</button>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<div className="rounded-2xl border p-4">
							<div className="font-semibold mb-2 text-black">Test recipient</div>
							<div className="text-xs text-gray-500 mb-3">
								Used for the “Test run” button. This does not send to employees.
							</div>
							<label className="block text-sm mb-1 text-black">Send test email to</label>
							<input
								value={testToEmail}
								onChange={(e) => setTestToEmail(e.target.value)}
								placeholder="admin@example.com"
								className="w-full rounded-xl border px-3 py-2 text-black"
							/>
							{runSummary ? <div className="text-xs text-gray-600 mt-2">Last run: {runSummary}</div> : null}
						</div>

						<div className="rounded-2xl border p-4">
							<div className="font-semibold mb-2 text-black">Sent Gmail log</div>
							<div className="text-xs text-gray-500 mb-3">
								Shows recent emails sent to employees (from licensure_notification_log).
							</div>
							<button
								onClick={async () => {
								setLogsLoading(true);
								setError("");
								try {
									if (!electronAPI?.notifications?.getLog) {
										throw new Error("Logs are only available in the Electron desktop app.");
									}
									const res = await electronAPI.notifications.getLog({ status: logStatus, limit: 25 });
									setLogs(res?.rows ?? []);
								} catch (e: unknown) {
									setError(errorMessage(e));
								} finally {
									setLogsLoading(false);
								}
							}}
								disabled={!isDesktop || logsLoading}
								className="px-3 py-2 rounded-xl bg-white border disabled:opacity-50 text-black"
							>
								{logsLoading ? "Loading…" : "Refresh log"}
							</button>
							<div className="mt-3 overflow-auto">
								{logs.length === 0 ? (
									<div className="text-sm text-gray-600">No log entries loaded yet.</div>
								) : (
									<table className="w-full text-sm">
										<thead>
											<tr className="text-left border-b">
												<th className="py-2 pr-3 text-black">When</th>
												<th className="py-2 pr-3 text-black">Status</th>
												<th className="py-2 pr-3 text-black">Type</th>
												<th className="py-2 pr-3 text-black">To</th>
											</tr>
										</thead>
										<tbody>
											{logs.map((r) => (
												<tr key={r.id} className="border-b">
													<td className="py-2 pr-3 whitespace-nowrap">{String(r.created_at).slice(0, 19)}</td>
													<td className="py-2 pr-3 whitespace-nowrap">{r.status}</td>
													<td className="py-2 pr-3 whitespace-nowrap">{r.license_type}</td>
													<td className="py-2 pr-3 whitespace-nowrap">{r.recipient_email ?? ""}</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</div>
						</div>
					</div>

					<div className="rounded-2xl border p-4">
						<div className="font-semibold mb-2 text-black">Preview (next 25)</div>
						{preview.length === 0 ? (
							<div className="text-sm text-gray-600">No preview loaded yet.</div>
						) : (
							<div className="overflow-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left border-b">
											<th className="py-2 pr-3 text-black">Employee</th>
											<th className="py-2 pr-3 text-black">Type</th>
											<th className="py-2 pr-3 text-black">Expires</th>
											<th className="py-2 pr-3 text-black">Days</th>
											<th className="py-2 pr-3 text-black">Email</th>
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
