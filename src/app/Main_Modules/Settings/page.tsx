"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

type LocalNotificationPrefs = {
	includeExpired: boolean;
	expiredWithinDays: number;
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
					localPrefs?: LocalNotificationPrefs;
					env?: { hasGmailUser?: boolean; hasGmailPass?: boolean; gmailUser?: string | null };
				}>;
				saveNotificationConfig?: (payload: unknown) => Promise<unknown>;
				saveLocalNotificationPrefs?: (payload: unknown) => Promise<unknown>;
				getStoredGmailAppPassword?: () => Promise<{ password: string | null }>;
				clearStoredGmailAppPassword?: () => Promise<unknown>;
				removeGmailSender?: () => Promise<unknown>;
			};
			notifications?: {
				previewExpiring?: (payload?: unknown) => Promise<{ rows: ExpiringRow[] }>;
				getLog?: (payload?: unknown) => Promise<{ rows: LogRow[] }>;
				sendTestEmail?: (payload: unknown) => Promise<unknown>;
				resendAllExpiring?: (payload?: unknown) => Promise<unknown>;
				runNow?: () => Promise<unknown>;
			};
		}
		| undefined;

	return anyWin;
}

function safeText(v: unknown) {
	return String(v ?? "").trim();
}

function escapeHtml(s: string) {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function textToSimpleHtml(text: string) {
	const safe = escapeHtml(text);
	return safe ? `<div>${safe.replace(/\n/g, "<br/>")}</div>` : "";
}

function parseTemplateNotes(notesRaw: string | null | undefined): { subject: string; bodyHtml: string } {
	const raw = safeText(notesRaw);
	if (!raw) return { subject: "", bodyHtml: "" };
	try {
		let parsed = JSON.parse(raw) as unknown;
		if (typeof parsed === "string") {
			try {
				parsed = JSON.parse(parsed) as unknown;
			} catch {
				// ignore
			}
		}
		if (parsed && typeof parsed === "object") {
			const p = parsed as { subject?: unknown; bodyHtml?: unknown };
			return { subject: safeText(p.subject), bodyHtml: safeText(p.bodyHtml) };
		}
	} catch {
		// legacy plain-text notes
	}
	return { subject: "", bodyHtml: textToSimpleHtml(raw) };
}

function buildTemplateNotes(subject: string, bodyHtml: string) {
	const sub = safeText(subject);
	const body = safeText(bodyHtml);
	if (!sub && !body) return null;
	return JSON.stringify({ subject: sub || null, bodyHtml: body || null });
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

function RichTextEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [state, setState] = useState({
		bold: false,
		italic: false,
		underline: false,
		ul: false,
		ol: false,
		canUndo: true,
		canRedo: true,
	});

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (el.innerHTML !== value) el.innerHTML = value;
	}, [value]);

	function refreshToolbar() {
		try {
			setState({
				bold: Boolean(document.queryCommandState("bold")),
				italic: Boolean(document.queryCommandState("italic")),
				underline: Boolean(document.queryCommandState("underline")),
				ul: Boolean(document.queryCommandState("insertUnorderedList")),
				ol: Boolean(document.queryCommandState("insertOrderedList")),
				canUndo: Boolean(document.queryCommandEnabled("undo")),
				canRedo: Boolean(document.queryCommandEnabled("redo")),
			});
		} catch {
			// ignore
		}
	}

	function placeCaretAtEnd(el: HTMLDivElement) {
		const sel = window.getSelection?.();
		if (!sel) return;
		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		sel.removeAllRanges();
		sel.addRange(range);
	}

	function ensureSelectionInEditor() {
		const el = ref.current;
		if (!el) return;
		el.focus();
		const sel = window.getSelection?.();
		if (!sel || sel.rangeCount === 0) {
			placeCaretAtEnd(el);
			return;
		}
		const range = sel.getRangeAt(0);
		const startOk = el.contains(range.startContainer);
		const endOk = el.contains(range.endContainer);
		if (!startOk || !endOk) placeCaretAtEnd(el);
	}

	useEffect(() => {
		const onSel = () => {
			// Only refresh when this editor is active.
			const el = ref.current;
			if (!el) return;
			const active = document.activeElement;
			if (active !== el && !el.contains(active)) return;
			refreshToolbar();
		};
		document.addEventListener("selectionchange", onSel);
		return () => document.removeEventListener("selectionchange", onSel);
	}, []);

	function exec(cmd: string, arg?: string) {
		try {
			ensureSelectionInEditor();
			document.execCommand(cmd, false, arg);
			const el = ref.current;
			if (el) onChange(el.innerHTML);
			setTimeout(() => refreshToolbar(), 0);
		} catch {
			// ignore
		}
	}

	function btnClass(active: boolean) {
		return [
			"px-2 py-1 rounded-lg border text-sm text-black",
			active ? "bg-gray-200" : "bg-white",
		].join(" ");
	}

	return (
		<div className="rounded-xl border bg-white">
			<div className="flex flex-wrap gap-2 border-b px-2 py-2">
				<button
					type="button"
					onMouseDown={(e) => {
						e.preventDefault();
						exec("bold");
					}}
					className={btnClass(state.bold)}
					aria-pressed={state.bold}
				>
					B
				</button>
				<button
					type="button"
					onMouseDown={(e) => {
						e.preventDefault();
						exec("italic");
					}}
					className={[btnClass(state.italic), "italic"].join(" ")}
					aria-pressed={state.italic}
				>
					I
				</button>
				<button
					type="button"
					onMouseDown={(e) => {
						e.preventDefault();
						exec("underline");
					}}
					className={[btnClass(state.underline), "underline"].join(" ")}
					aria-pressed={state.underline}
				>
					U
				</button>
				<button
					type="button"
					onMouseDown={(e) => {
						e.preventDefault();
						exec("insertUnorderedList");
					}}
					className={btnClass(state.ul)}
					aria-pressed={state.ul}
				>
					• List
				</button>
				<button
					type="button"
					onMouseDown={(e) => {
						e.preventDefault();
						exec("insertOrderedList");
					}}
					className={btnClass(state.ol)}
					aria-pressed={state.ol}
				>
					1. List
				</button>
				<button
					type="button"
					disabled={!state.canUndo}
					onMouseDown={(e) => {
						e.preventDefault();
						exec("undo");
					}}
					className={["px-2 py-1 rounded-lg border text-sm text-black", !state.canUndo ? "opacity-50" : ""].join(
						" "
					)}
				>
					Undo
				</button>
				<button
					type="button"
					disabled={!state.canRedo}
					onMouseDown={(e) => {
						e.preventDefault();
						exec("redo");
					}}
					className={["px-2 py-1 rounded-lg border text-sm text-black", !state.canRedo ? "opacity-50" : ""].join(
						" "
					)}
				>
					Redo
				</button>
			</div>
			<div
				ref={ref}
				className="min-h-[140px] px-3 py-2 text-black outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1"
				contentEditable
				onFocus={() => refreshToolbar()}
				onKeyUp={() => refreshToolbar()}
				onMouseUp={() => refreshToolbar()}
				onInput={() => {
					const el = ref.current;
					if (!el) return;
					onChange(el.innerHTML);
					refreshToolbar();
				}}
				suppressContentEditableWarning
			/>
		</div>
	);
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
	const [isActive, setIsActive] = useState(true);
	const [emailSubject, setEmailSubject] = useState("");
	const [emailBodyHtml, setEmailBodyHtml] = useState("");
	const [storeAppPassword, setStoreAppPassword] = useState(false);
	const [gmailAppPassword, setGmailAppPassword] = useState("");
	const [dbHasStoredPassword, setDbHasStoredPassword] = useState(false);
	const [dbStoredPasswordCache, setDbStoredPasswordCache] = useState("");
	const [showAppPassword, setShowAppPassword] = useState(false);
	const [loadedStoredPassword, setLoadedStoredPassword] = useState(false);

	// Preferences
	const [enabled, setEnabled] = useState(true);
	const [daysBeforeInput, setDaysBeforeInput] = useState("30");
	const [includeDriver, setIncludeDriver] = useState(false);
	const [includeSecurity, setIncludeSecurity] = useState(true);
	const [includeInsurance, setIncludeInsurance] = useState(false);
	const [sendTimeLocal, setSendTimeLocal] = useState("08:00");
	const [timezone, setTimezone] = useState("Asia/Manila");

	const daysBeforeNum = useMemo(() => Number(daysBeforeInput), [daysBeforeInput]);

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
	const [envHasGmailUser, setEnvHasGmailUser] = useState<boolean | null>(null);
	const [envHasGmailPass, setEnvHasGmailPass] = useState<boolean | null>(null);

	// Local-only notification prefs (desktop)
	const [includeExpired, setIncludeExpired] = useState(false);
	const [expiredWithinDays, setExpiredWithinDays] = useState(7);

	const canPreview = useMemo(
		() => enabled && Number.isFinite(daysBeforeNum) && daysBeforeNum >= 1 && daysBeforeNum <= 365,
		[enabled, daysBeforeNum]
	);

	function applyLoadedConfig(cfg: unknown) {
		setEnvHasGmailUser(Boolean((cfg as any)?.env?.hasGmailUser));
		setEnvHasGmailPass(Boolean((cfg as any)?.env?.hasGmailPass));
		setIncludeExpired(Boolean((cfg as any)?.localPrefs?.includeExpired));
		setExpiredWithinDays(Number((cfg as any)?.localPrefs?.expiredWithinDays ?? 7));

		const email = (((cfg as any)?.email as EmailSettingsRow) || null) as EmailSettingsRow | null;
		if (email) {
			setGmailUser(email.gmail_user ?? safeText((cfg as any)?.env?.gmailUser) ?? "");
			setIsActive(Boolean(email.is_active));
			const tpl = parseTemplateNotes(email.notes);
			setEmailSubject(tpl.subject);
			setEmailBodyHtml(tpl.bodyHtml);
			setDbHasStoredPassword(Boolean(email.gmail_app_password));
			setDbStoredPasswordCache(email.gmail_app_password ?? "");
			setGmailAppPassword("");
			setStoreAppPassword(false);
			setLoadedStoredPassword(false);
			setTestToEmail(email.gmail_user ?? safeText((cfg as any)?.env?.gmailUser) ?? "");
		} else {
			setDbHasStoredPassword(false);
			setDbStoredPasswordCache("");
			setGmailUser(safeText((cfg as any)?.env?.gmailUser) || "");
			setEmailSubject("");
			setEmailBodyHtml("");
			setTestToEmail(safeText((cfg as any)?.env?.gmailUser) || "");
		}

		const pref = (((cfg as any)?.preferences as PreferencesRow) || null) as PreferencesRow | null;
		if (pref) {
			setEnabled(Boolean(pref.is_enabled));
			setDaysBeforeInput(String(pref.days_before_expiry ?? 30));
			setIncludeDriver(Boolean(pref.include_driver_license));
			setIncludeSecurity(Boolean(pref.include_security_license));
			setIncludeInsurance(Boolean(pref.include_insurance));
			setSendTimeLocal(String(pref.send_time_local ?? "08:00").slice(0, 5));
			setTimezone(pref.timezone ?? "Asia/Manila");
		}
	}

	async function refreshLogs() {
		if (!electronAPI?.notifications?.getLog) return;
		setLogsLoading(true);
		try {
			const res = await electronAPI.notifications.getLog({ status: logStatus, limit: 25 });
			setLogs(res?.rows ?? []);
		} finally {
			setLogsLoading(false);
		}
	}

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
					applyLoadedConfig(cfg);
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
						setIsActive(Boolean(email.is_active));
						const tpl = parseTemplateNotes(email.notes);
						setEmailSubject(tpl.subject);
						setEmailBodyHtml(tpl.bodyHtml);
						setDbHasStoredPassword(Boolean(email.gmail_app_password));
						setDbStoredPasswordCache(email.gmail_app_password ?? "");
						setGmailAppPassword("");
						setStoreAppPassword(false);
						setLoadedStoredPassword(false);
					} else {
						setDbHasStoredPassword(false);
						setDbStoredPasswordCache("");
						setEmailSubject("");
						setEmailBodyHtml("");
					}

					const pref = (prefRes.data as PreferencesRow | null) ?? null;
					if (pref) {
						setEnabled(Boolean(pref.is_enabled));
						setDaysBeforeInput(String(pref.days_before_expiry ?? 30));
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

			const daysBeforeExpiry = Number(daysBeforeNum);
			if (!Number.isFinite(daysBeforeExpiry)) throw new Error("Days before expiry must be a number.");
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
			const allowExpired = Boolean(includeExpired);
			const expiredWindow = Math.max(1, Math.min(365, Number(expiredWithinDays || 7)));
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
					if (
						exp &&
						du !== null &&
						((du >= 0 && du <= daysBeforeExpiry) || (allowExpired && du < 0 && Math.abs(du) <= expiredWindow))
					) {
						out.push({ ...base, expires_on: exp, license_type: "DRIVER_LICENSE", days_until_expiry: du });
					}
				}
				if (include.security) {
					const exp = toYmd(row.security_expiration);
					const du = exp ? daysUntilYmd(exp) : null;
					if (
						exp &&
						du !== null &&
						((du >= 0 && du <= daysBeforeExpiry) || (allowExpired && du < 0 && Math.abs(du) <= expiredWindow))
					) {
						out.push({ ...base, expires_on: exp, license_type: "SECURITY_LICENSE", days_until_expiry: du });
					}
				}
				if (include.insurance) {
					const exp = toYmd(row.insurance_expiration);
					const du = exp ? daysUntilYmd(exp) : null;
					if (
						exp &&
						du !== null &&
						((du >= 0 && du <= daysBeforeExpiry) || (allowExpired && du < 0 && Math.abs(du) <= expiredWindow))
					) {
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
			if (storeAppPassword && dbHasStoredPassword && !safeText(gmailAppPassword) && !loadedStoredPassword) {
				throw new Error(
					"A stored app password exists in the database. Load it (enable the checkbox) or paste a new app password before saving to avoid clearing it."
				);
			}
			const templateNotes = buildTemplateNotes(emailSubject, emailBodyHtml);
			const daysBeforeValue = Number(daysBeforeNum);
			if (!cleanGmailUser) {
				throw new Error("Gmail User is required.");
			}
			if (!Number.isFinite(daysBeforeValue) || daysBeforeValue < 1 || daysBeforeValue > 365) {
				throw new Error("Days before expiry must be between 1 and 365.");
			}

			if (electronAPI?.settings?.saveNotificationConfig) {
				const session = await supabase.auth.getSession();
				const actor = {
					user_id: session.data.session?.user?.id ?? null,
					email: session.data.session?.user?.email ?? null,
				};
				await electronAPI.settings.saveNotificationConfig({
					email: {
						gmail_user: cleanGmailUser,
						is_active: Boolean(isActive),
						notes: templateNotes,
						gmail_app_password: safeText(gmailAppPassword) || null,
					},
					preferences: {
						is_enabled: Boolean(enabled),
						days_before_expiry: daysBeforeValue,
						include_driver_license: Boolean(includeDriver),
						include_security_license: Boolean(includeSecurity),
						include_insurance: Boolean(includeInsurance),
						send_time_local: safeText(sendTimeLocal) || "08:00",
						timezone: safeText(timezone) || "Asia/Manila",
					},
					storeAppPassword: Boolean(storeAppPassword),
					actor,
				});

				if (electronAPI?.settings?.saveLocalNotificationPrefs) {
					await electronAPI.settings.saveLocalNotificationPrefs({
						includeExpired: Boolean(includeExpired),
						expiredWithinDays: Math.max(1, Math.min(365, Number(expiredWithinDays || 7))),
					});
				}
			} else {
				// Web fallback (anon key) – saving sender credentials is desktop-only.
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
							days_before_expiry: daysBeforeValue,
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
						days_before_expiry: daysBeforeValue,
						include_driver_license: Boolean(includeDriver),
						include_security_license: Boolean(includeSecurity),
						include_insurance: Boolean(includeInsurance),
						send_time_local: safeText(sendTimeLocal) || "08:00",
						timezone: safeText(timezone) || "Asia/Manila",
					});
					if (ins.error) throw ins.error;
				}
			}

			if (storeAppPassword) {
				setDbHasStoredPassword(Boolean(safeText(gmailAppPassword)));
			}

			// Reload what was actually saved (ensures the UI reflects DB immediately)
			if (electronAPI?.settings?.loadNotificationConfig) {
				try {
					const cfg = await electronAPI.settings.loadNotificationConfig();
					applyLoadedConfig(cfg);
				} catch {
					// ignore reload errors
				}
			}

			// Refresh preview and logs immediately.
			void loadPreview();
			void refreshLogs();

			// Do NOT auto-send on Save; sending remains a manual action via "Run now".
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
						Gmail user in env: {envHasGmailUser ? "yes" : envHasGmailUser === false ? "no" : "unknown"} • Gmail pass in env:{" "}
						{envHasGmailPass ? "yes" : envHasGmailPass === false ? "no" : "unknown"}
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
								Used to send notification emails. This app uses Gmail App Password auth only.
								The sender address is read from <span className="font-mono">GMAIL_USER</span> in <span className="font-mono">.env.local</span>.
							</div>

							{isDesktop ? (
								<div className="rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-700 mb-3">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-semibold">Sender priority:</span>
										<span className="font-mono">GMAIL_USER</span>
										<span className="text-gray-500">(env)</span>
										<span className="text-gray-500">→</span>
										<span>this saved Gmail User</span>
										<span className="text-gray-500">(Settings)</span>
										<span className="text-gray-500">•</span>
										<span>Env app password: {envHasGmailPass ? "yes" : envHasGmailPass === false ? "no" : "unknown"}</span>
										<span className="text-gray-500">•</span>
										<span>Stored app password in DB: {dbHasStoredPassword ? "yes" : "no"}</span>
									</div>
									<div className="mt-2 flex flex-wrap gap-2">
										<button
											onClick={async () => {
												setError("");
												setSuccess("");
												try {
													if (!electronAPI?.settings?.clearStoredGmailAppPassword) {
														throw new Error("This action is only available in the Electron desktop app.");
													}
													await electronAPI.settings.clearStoredGmailAppPassword();
													setDbHasStoredPassword(false);
													setDbStoredPasswordCache("");
													setGmailAppPassword("");
													setLoadedStoredPassword(false);
													setSuccess("Stored Gmail App Password cleared from database.");
												} catch (e: unknown) {
													setError(errorMessage(e));
												}
										}}
										disabled={!dbHasStoredPassword}
										className="px-3 py-2 rounded-xl bg-white border disabled:opacity-50 text-black"
									>
										Clear stored app password
									</button>
									<button
											onClick={async () => {
												setError("");
												setSuccess("");
												try {
													if (!electronAPI?.settings?.removeGmailSender) {
														throw new Error("This action is only available in the Electron desktop app.");
													}
												const ok = window.confirm(
													"Remove the Gmail sender settings? This cannot be undone."
												);
												if (!ok) return;
													await electronAPI.settings.removeGmailSender();
													setGmailUser("");
													setEmailSubject("");
													setEmailBodyHtml("");
													setIsActive(true);
													setDbHasStoredPassword(false);
													setDbStoredPasswordCache("");
													setLoadedStoredPassword(false);
													setSuccess("Gmail sender settings removed.");
												} catch (e: unknown) {
													setError(errorMessage(e));
												}
										}}
										className="px-3 py-2 rounded-xl bg-red-600 text-white"
									>
										Remove sender
									</button>
								</div>
							</div>
						) : null}

							<label className="block text-sm mb-1 text-black">Gmail User</label>
							<input
								value={gmailUser}
								onChange={(e) => setGmailUser(e.target.value)}
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
									onChange={async (e) => {
									const next = e.target.checked;
									setStoreAppPassword(next);
									setError("");
									setSuccess("");

									if (!next) {
										setGmailAppPassword("");
										setLoadedStoredPassword(false);
										return;
									}

									// If DB already has one, auto-load it (we already received it via loadNotificationConfig).
									if (!dbHasStoredPassword) return;
									if (safeText(dbStoredPasswordCache)) {
										setGmailAppPassword(dbStoredPasswordCache);
										setLoadedStoredPassword(true);
										return;
									}

									// Fallback for older/partial configs: try fetching via IPC if available.
									if (!electronAPI?.settings?.getStoredGmailAppPassword) return;
									try {
										const res = await electronAPI.settings.getStoredGmailAppPassword();
										setGmailAppPassword(res?.password ?? "");
										setLoadedStoredPassword(true);
									} catch (err: unknown) {
										setError(errorMessage(err));
										setStoreAppPassword(false);
										setLoadedStoredPassword(false);
									}
								}}
								/>
								<label htmlFor="storePass" className="text-sm text-black">
									Store Gmail App Password in database (not recommended)
								</label>
							</div>

							{storeAppPassword ? (
								<div className="mt-3">
									<label className="block text-sm mb-1 text-black">Gmail App Password</label>
									<input
										type={showAppPassword ? "text" : "password"}
										value={gmailAppPassword}
										onChange={(e) => {
											setLoadedStoredPassword(false);
											setGmailAppPassword(e.target.value);
										}}
										placeholder="xxxx xxxx xxxx xxxx"
										className="w-full rounded-xl border px-3 py-2 text-black"
									/>
									<label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-700">
										<input
											type="checkbox"
											checked={showAppPassword}
											onChange={(e) => setShowAppPassword(e.target.checked)}
										/>
										Show app password
									</label>
									<div className="text-xs text-gray-500 mt-1">
										If a stored password exists, it will auto-fill when you enable the checkbox.
									</div>
								</div>
							) : null}

							<label className="block text-sm mt-4 mb-1 text-black">Email Subject</label>
							<input
								value={emailSubject}
								onChange={(e) => setEmailSubject(e.target.value)}
								placeholder="Expiring Licensure Warning ({count})"
								className="w-full rounded-xl border px-3 py-2 text-black"
							/>
							<div className="text-xs text-gray-500 mt-1">
								Tip: use <span className="font-mono">{'{count}'}</span> to insert number of expiring items.
							</div>

							<label className="block text-sm mt-4 mb-1 text-black">Email Body</label>
							<RichTextEditor value={emailBodyHtml} onChange={setEmailBodyHtml} />
							<div className="text-xs text-gray-500 mt-1">
								This content appears above the expiring licenses table.
							</div>
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
								type="text"
								inputMode="numeric"
								pattern="[0-9]*"
								value={daysBeforeInput}
								onChange={(e) => {
									const next = e.target.value;
									if (next === "" || /^\d+$/.test(next)) setDaysBeforeInput(next);
								}}
								onBlur={() => {
									const trimmed = daysBeforeInput.trim();
									if (!trimmed) {
										setDaysBeforeInput("30");
										return;
									}
									const n = Number(trimmed);
									if (!Number.isFinite(n)) {
										setDaysBeforeInput("30");
										return;
									}
									const clamped = Math.min(365, Math.max(1, Math.trunc(n)));
									setDaysBeforeInput(String(clamped));
								}}
								placeholder="30"
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

						<div className="mt-4 rounded-xl border p-3">
							<div className="font-semibold text-black text-sm mb-2">Expired licenses</div>
							<div className="text-xs text-gray-500 mb-2">
								If enabled, reminders will also include licenses that already expired (within the chosen window).
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<label className="flex items-center gap-2 text-sm text-black">
									<input
										type="checkbox"
										checked={includeExpired}
										onChange={(e) => setIncludeExpired(e.target.checked)}
									/>
									Include expired
								</label>
								<div className="flex items-center gap-2">
									<span className="text-sm text-black">Expired within</span>
									<input
										type="number"
										min={1}
										max={365}
										value={expiredWithinDays}
										onChange={(e) => setExpiredWithinDays(Number(e.target.value))}
										className="w-24 rounded-xl border px-3 py-2 text-black"
									/>
									<span className="text-sm text-black">days</span>
								</div>
							</div>
							{!isDesktop ? (
								<div className="text-xs text-gray-500 mt-2">
									This setting affects Preview only on the web; sending runs in the desktop app.
								</div>
							) : null}
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
									if (!electronAPI?.notifications?.resendAllExpiring) {
										throw new Error("Resend all is only available in the Electron desktop app.");
									}
									const ok = window.confirm(
										"This will resend emails for ALL currently expiring licenses. Continue?"
									);
									if (!ok) return;
									const r = (await electronAPI.notifications.resendAllExpiring()) as RunNowResult;
									const summary = r?.summary
										? `sent=${r.summary.sent ?? 0}, failed=${r.summary.failed ?? 0}, skipped=${r.summary.skipped ?? 0}`
										: "";
									setRunSummary(summary);
									setSuccess(r?.message || "Resend all finished.");
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
							{runSending ? "Resending…" : "Resend all"}
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
									<table className="w-full text-sm text-black">
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
													<td className="py-2 pr-3 whitespace-nowrap text-black">{String(r.created_at).slice(0, 19)}</td>
													<td className="py-2 pr-3 whitespace-nowrap text-black">{r.status}</td>
													<td className="py-2 pr-3 whitespace-nowrap text-black">{r.license_type}</td>
													<td className="py-2 pr-3 whitespace-nowrap text-black">{r.recipient_email ?? ""}</td>
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
