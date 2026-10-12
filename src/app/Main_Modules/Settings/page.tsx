"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import { useSignedStorageUrlMap } from "@/app/Client/useSignedStorageUrls";

type EmailSettingsRow = {
	id: string;
	provider: "gmail";
	gmail_user: string;
	from_email: string;
	gmail_app_password?: string | null;
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
	send_to_employees?: boolean;
	include_expired?: boolean;
	expired_within_days?: number;
	use_scheduled_send: boolean;
	send_time_local: string | null;
	timezone: string | null;
};

type LocalNotificationPrefs = {
	includeExpired: boolean;
	expiredWithinDays: number;
	notificationLogRetentionDays?: number;
};

type RecipientRow = {
	id: number;
	email: string;
	is_active: boolean;
	notes: string | null;
	created_at: string;
};

type OtherExpirationType = string;

const HIDDEN_OTHER_EXPIRATION_TYPES = new Set(["CAR_INSURANCE"]);

type OtherExpirationRow = {
	id: number;
	item_name: string;
	expiration_type: OtherExpirationType;
	expires_on: string;
	days_before_expiry?: number | null;
	recipient_email: string | null;
	notes: string | null;
	is_active: boolean;
	created_at: string;
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

type RunNowResult = {
	message?: string;
	summary?: { sent?: number; failed?: number; skipped?: number };
};

type NotificationLogRetentionConfig = {
	retentionDays: number;
	retentionLabel?: string;
	missingTable?: boolean;
	unavailable?: boolean;
	error?: string | null;
};

type NotificationLogClearResult = {
	success?: boolean;
	deleted?: number;
	clearedAll?: boolean;
};

type LegacyAdminSession = {
	id?: string;
	username?: string;
	role?: string;
	full_name?: string | null;
	profile_image_path?: string | null;
};

type AdminProfileRow = {
	id: string;
	username: string;
	full_name: string | null;
	profile_image_path?: string | null;
};

type NotificationConfigLike = {
	email?: EmailSettingsRow | null;
	preferences?: PreferencesRow | null;
	recipients?: string[];
	localPrefs?: LocalNotificationPrefs;
	env?: { hasGmailUser?: boolean; hasGmailPass?: boolean; gmailUser?: string | null };
	unavailable?: boolean;
	error?: string | null;
};

const PROFILE_BUCKET = "Profile";
const MAX_PROFILE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

function readLegacyAdminSession(): LegacyAdminSession | null {
	try {
		const raw = localStorage.getItem("adminSession");
		if (!raw) return null;
		const parsed = JSON.parse(raw) as LegacyAdminSession;
		if (!parsed?.id) return null;
		return parsed;
	} catch {
		return null;
	}
}

function getLegacyAdminDisplayName() {
	const legacy = readLegacyAdminSession();
	const fullName = String(legacy?.full_name ?? "").trim();
	const username = String(legacy?.username ?? "").trim();
	return fullName || username || null;
}

function writeLegacyAdminSessionPatch(patch: Partial<LegacyAdminSession>) {
	try {
		const raw = localStorage.getItem("adminSession");
		if (!raw) return;
		const parsed = JSON.parse(raw) as LegacyAdminSession;
		localStorage.setItem("adminSession", JSON.stringify({ ...parsed, ...patch }));
	} catch {
		// ignore
	}
}

function profileInitials(name: string, username: string) {
	const source = safeText(name) || safeText(username) || "Admin";
	const parts = source.split(/\s+/).filter(Boolean);
	if (!parts.length) return "AD";
	const first = parts[0]?.[0] ?? "A";
	const second = parts.length > 1 ? parts[1]?.[0] ?? "D" : parts[0]?.[1] ?? "D";
	return `${first}${second}`.toUpperCase();
}

function notifyAdminProfileUpdated() {
	try {
		window.dispatchEvent(new Event("admin-profile-updated"));
	} catch {
		// ignore
	}
}

function getElectronAPI() {
	const w = globalThis as unknown as { window?: unknown };
	const anyWin = (w as unknown as { electronAPI?: unknown }).electronAPI as
		| {
			admin?: {
				exportDatabaseExcel?: () => Promise<{
					cancelled: boolean;
					ok?: boolean;
					filePath?: string;
					exportedTables?: string[];
					skippedTables?: Array<{ table: string; reason: string }>;
				}>;
			};
			settings?: {
				loadNotificationConfig?: () => Promise<{
					email: EmailSettingsRow | null;
					preferences: PreferencesRow | null;
					recipients?: string[];
					localPrefs?: LocalNotificationPrefs;
					env?: { hasGmailUser?: boolean; hasGmailPass?: boolean; gmailUser?: string | null };
					unavailable?: boolean;
					error?: string | null;
				}>;
				saveNotificationConfig?: (payload: unknown) => Promise<unknown>;
				saveLocalNotificationPrefs?: (payload: unknown) => Promise<unknown>;
				getStoredGmailAppPassword?: () => Promise<{ password: string | null }>;
				clearStoredGmailAppPassword?: () => Promise<unknown>;
				removeGmailSender?: () => Promise<unknown>;
			};
			notifications?: {
				getLog?: (payload?: unknown) => Promise<{ rows: LogRow[] }>;
				loadLogRetentionConfig?: () => Promise<NotificationLogRetentionConfig>;
				saveLogRetentionConfig?: (payload: { retentionDays: number }) => Promise<NotificationLogRetentionConfig>;
				clearLog?: () => Promise<NotificationLogClearResult>;
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

function errorTextWithMessageFallback(value: unknown) {
	if (value && typeof value === "object") {
		const msg = (value as { message?: unknown }).message;
		if (msg != null) return safeText(msg);
	}
	return safeText(value);
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

const DEFAULT_NOTICE_SUBJECT = "Faragon Security: Expiring Record Alert ({count})";
const DEFAULT_NOTICE_BODY = `<div><strong>To all concerned,</strong></div><div>This is a formal reminder that the listed records are approaching expiration.</div><div>Please review each item, coordinate the required renewal action, and complete any updates before the stated expiration date.</div><div>If the renewal has already been processed, you may disregard this message.</div>`;
const LOG_RETENTION_OPTIONS = [
	{ value: 7, label: "1 week" },
	{ value: 30, label: "1 month" },
	{ value: 365, label: "1 year" },
] as const;

function normalizeLogRetentionDays(value: unknown) {
	const n = Number(value);
	if (!Number.isFinite(n)) return 30;
	if (n <= 7) return 7;
	if (n <= 30) return 30;
	return 365;
}

function labelForLogRetentionDays(value: unknown) {
	return LOG_RETENTION_OPTIONS.find((option) => option.value === normalizeLogRetentionDays(value))?.label ?? "1 month";
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
	const [hydrated, setHydrated] = useState(false);
	const isDesktop = hydrated && Boolean(electronAPI?.settings?.loadNotificationConfig);
	const { role: sessionRole } = useAuthRole();
	const canAdminExport = sessionRole === "admin" || sessionRole === "superadmin";

	useEffect(() => {
		setHydrated(true);
	}, []);

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");
	const profileFileInputRef = useRef<HTMLInputElement | null>(null);
	const [profileAdminId, setProfileAdminId] = useState("");
	const [profileUsername, setProfileUsername] = useState("");
	const [profileDisplayName, setProfileDisplayName] = useState("");
	const [profileImagePath, setProfileImagePath] = useState<string | null>(null);
	const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
	const profileImageUrls = useSignedStorageUrlMap(PROFILE_BUCKET, [profileImagePath]);
	const [profileSaving, setProfileSaving] = useState(false);
	const [profileUploading, setProfileUploading] = useState(false);
	const [profileRemoving, setProfileRemoving] = useState(false);

	useEffect(() => {
		const path = String(profileImagePath ?? "").trim();
		setProfileImageUrl(path ? profileImageUrls.get(path) ?? null : null);
	}, [profileImagePath, profileImageUrls]);

	// Auto updater state
	const [updaterState, setUpdaterState] = useState<"idle" | "checking" | "available" | "downloading" | "downloaded" | "no-update" | "error">("idle");
	const [updateVersion, setUpdateVersion] = useState<string | null>(null);
	const [currentVersion, setCurrentVersion] = useState<string | null>(null);
	const [downloadPercent, setDownloadPercent] = useState<number>(0);
	const [updaterError, setUpdaterError] = useState<string | null>(null);

	// Load current app version on mount
	useEffect(() => {
		async function fetchVersion() {
			const anyWin = typeof window !== "undefined" ? (window as any) : null;
			if (anyWin?.electronAPI?.app?.getVersion) {
				try {
					const ver = await anyWin.electronAPI.app.getVersion();
					setCurrentVersion(ver);
				} catch {
					// ignore web fallback
				}
			}
		}
		void fetchVersion();
	}, []);

	// Handle download progress and completion events from Electron
	useEffect(() => {
		const anyWin = typeof window !== "undefined" ? (window as any) : null;
		if (!anyWin?.electronAPI?.app?.onUpdateProgress) return;

		const unsubscribeProgress = anyWin.electronAPI.app.onUpdateProgress((progress: { percent: number }) => {
			setUpdaterState("downloading");
			setDownloadPercent(Math.round(progress?.percent ?? 0));
		});

		const unsubscribeDownloaded = anyWin.electronAPI.app.onUpdateDownloaded((info: { version: string }) => {
			setUpdaterState("downloaded");
			setUpdateVersion(info.version);
		});

		return () => {
			unsubscribeProgress();
			unsubscribeDownloaded();
		};
	}, []);

	async function handleCheckForUpdates() {
		const anyWin = typeof window !== "undefined" ? (window as any) : null;
		if (!anyWin?.electronAPI?.app?.checkForUpdates) return;
		setUpdaterState("checking");
		setUpdaterError(null);
		try {
			const res = await anyWin.electronAPI.app.checkForUpdates();
			if (res.success) {
				if (res.updateAvailable) {
					setUpdaterState("available");
					setUpdateVersion(res.version);
				} else {
					setUpdaterState("no-update");
				}
			} else {
				setUpdaterState("error");
				setUpdaterError(res.error || "Failed to check for updates.");
			}
		} catch (err: any) {
			setUpdaterState("error");
			setUpdaterError(err?.message || "Communication error with main process.");
		}
	}

	async function handleDownloadUpdate() {
		const anyWin = typeof window !== "undefined" ? (window as any) : null;
		if (!anyWin?.electronAPI?.app?.downloadUpdate) return;
		setUpdaterState("downloading");
		setDownloadPercent(0);
		setUpdaterError(null);
		try {
			const res = await anyWin.electronAPI.app.downloadUpdate();
			if (!res.success) {
				setUpdaterState("error");
				setUpdaterError(res.error || "Failed to start download.");
			}
		} catch (err: any) {
			setUpdaterState("error");
			setUpdaterError(err?.message || "Communication error during download.");
		}
	}

	async function handleInstallUpdate() {
		const anyWin = typeof window !== "undefined" ? (window as any) : null;
		if (!anyWin?.electronAPI?.app?.installUpdate) return;
		try {
			await anyWin.electronAPI.app.installUpdate();
		} catch (err: any) {
			setUpdaterState("error");
			setUpdaterError(err?.message || "Failed to execute installer.");
		}
	}

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
	const [sendToEmployees, setSendToEmployees] = useState(true);
	const [daysBeforeInput, setDaysBeforeInput] = useState("30");
	const [includeDriver, setIncludeDriver] = useState(false);
	const [includeSecurity, setIncludeSecurity] = useState(true);
	const [includeInsurance, setIncludeInsurance] = useState(false);
	const [useScheduledSend, setUseScheduledSend] = useState(true);
	const [sendTimeLocal, setSendTimeLocal] = useState("08:00");
	const [timezone, setTimezone] = useState("Asia/Manila");

	const daysBeforeNum = useMemo(() => Number(daysBeforeInput), [daysBeforeInput]);

	// Logs / send
	const [logStatus, setLogStatus] = useState<string>("SENT");
	const [logs, setLogs] = useState<LogRow[]>([]);
	const [logsLoading, setLogsLoading] = useState(false);
	const [logRetentionDays, setLogRetentionDays] = useState("30");
	const [logRetentionSaving, setLogRetentionSaving] = useState(false);
	const [logClearing, setLogClearing] = useState(false);
	const [runSending, setRunSending] = useState(false);
	const [runSummary, setRunSummary] = useState<string>("");
	const [envHasGmailUser, setEnvHasGmailUser] = useState<boolean | null>(null);
	const [envHasGmailPass, setEnvHasGmailPass] = useState<boolean | null>(null);
	const [recipientRows, setRecipientRows] = useState<RecipientRow[]>([]);
	const [recipientEmail, setRecipientEmail] = useState("");
	const [recipientNotes, setRecipientNotes] = useState("");
	const [recipientSaving, setRecipientSaving] = useState(false);
	const [addRecipientOpen, setAddRecipientOpen] = useState(false);
	const [editingRecipientId, setEditingRecipientId] = useState<number | null>(null);
	const [editRecipientEmail, setEditRecipientEmail] = useState("");
	const [editRecipientNotes, setEditRecipientNotes] = useState("");
	const [editRecipientActive, setEditRecipientActive] = useState(true);
	const [otherRows, setOtherRows] = useState<OtherExpirationRow[]>([]);
	const [otherSaving, setOtherSaving] = useState(false);
	const [addOtherOpen, setAddOtherOpen] = useState(false);
	const [editingOtherId, setEditingOtherId] = useState<number | null>(null);
	const [editOtherItemName, setEditOtherItemName] = useState("");
	const [editOtherType, setEditOtherType] = useState<OtherExpirationType>("Car OCR");
	const [editOtherDaysBeforeInput, setEditOtherDaysBeforeInput] = useState("30");
	const [editOtherExpiresOn, setEditOtherExpiresOn] = useState("");
	const [editOtherRecipientEmail, setEditOtherRecipientEmail] = useState("");
	const [editOtherNotes, setEditOtherNotes] = useState("");
	const [editOtherActive, setEditOtherActive] = useState(true);
	const [otherItemName, setOtherItemName] = useState("");
	const [otherType, setOtherType] = useState<OtherExpirationType>("Car OCR");
	const [otherDaysBeforeInput, setOtherDaysBeforeInput] = useState("30");
	const [otherExpiresOn, setOtherExpiresOn] = useState("");
	const [otherRecipientEmail, setOtherRecipientEmail] = useState("");
	const [otherNotes, setOtherNotes] = useState("");

	// Local-only notification prefs (desktop)
	const [includeExpired, setIncludeExpired] = useState(false);
	const [expiredWithinDays, setExpiredWithinDays] = useState(7);

	const profileDisplayLabel = useMemo(
		() => safeText(profileDisplayName) || safeText(profileUsername) || "Admin",
		[profileDisplayName, profileUsername]
	);
	const profileBadgeLabel = useMemo(
		() => profileInitials(profileDisplayName, profileUsername),
		[profileDisplayName, profileUsername]
	);
	const centeredModalOverlayClass =
		"fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto";
	const floatingModalCardClass =
		"w-full rounded-2xl glass-panel border-white/50 shadow-2xl p-5 animate-scale-in";
	const canUsePortal = typeof document !== "undefined";
	const isAnySettingsModalOpen =
		addRecipientOpen || editingRecipientId !== null || addOtherOpen || editingOtherId !== null;

	useEffect(() => {
		if (!canUsePortal || !isAnySettingsModalOpen) return;

		const previousOverflow = document.body.style.overflow;
		const previousPaddingRight = document.body.style.paddingRight;
		const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

		document.body.style.overflow = "hidden";
		if (scrollBarWidth > 0) {
			document.body.style.paddingRight = `${scrollBarWidth}px`;
		}

		return () => {
			document.body.style.overflow = previousOverflow;
			document.body.style.paddingRight = previousPaddingRight;
		};
	}, [canUsePortal, isAnySettingsModalOpen]);

	function applyLoadedConfig(cfg: unknown) {
		const loaded = ((cfg && typeof cfg === "object") ? (cfg as NotificationConfigLike) : {}) as NotificationConfigLike;
		const env = loaded.env;
		const localPrefs = loaded.localPrefs;

		setEnvHasGmailUser(Boolean(env?.hasGmailUser));
		setEnvHasGmailPass(Boolean(env?.hasGmailPass));
		setIncludeExpired(Boolean((loaded.preferences as PreferencesRow | null)?.include_expired ?? localPrefs?.includeExpired));
		setExpiredWithinDays(Number((loaded.preferences as PreferencesRow | null)?.expired_within_days ?? localPrefs?.expiredWithinDays ?? 7));
		setLogRetentionDays(String(normalizeLogRetentionDays(localPrefs?.notificationLogRetentionDays ?? 30)));

		const email = loaded.email ?? null;
		if (email) {
			setGmailUser(email.gmail_user ?? safeText(env?.gmailUser) ?? "");
			setIsActive(Boolean(email.is_active));
			const tpl = parseTemplateNotes(email.notes);
			setEmailSubject(tpl.subject || DEFAULT_NOTICE_SUBJECT);
			setEmailBodyHtml(tpl.bodyHtml || DEFAULT_NOTICE_BODY);
			setDbHasStoredPassword(Boolean(email.gmail_app_password));
			setDbStoredPasswordCache(email.gmail_app_password ?? "");
			setGmailAppPassword("");
			setStoreAppPassword(false);
			setLoadedStoredPassword(false);
		} else {
			setDbHasStoredPassword(false);
			setDbStoredPasswordCache("");
			setGmailUser(safeText(env?.gmailUser) || "");
			setEmailSubject(DEFAULT_NOTICE_SUBJECT);
			setEmailBodyHtml(DEFAULT_NOTICE_BODY);
		}

		const pref = loaded.preferences ?? null;
		if (pref) {
			setEnabled(Boolean(pref.is_enabled));
			setSendToEmployees(pref.send_to_employees !== false);
			setIncludeExpired(Boolean(pref.include_expired));
			setExpiredWithinDays(Number(pref.expired_within_days ?? 7));
			setDaysBeforeInput(String(pref.days_before_expiry ?? 30));
			setIncludeDriver(Boolean(pref.include_driver_license));
			setIncludeSecurity(Boolean(pref.include_security_license));
			setIncludeInsurance(Boolean(pref.include_insurance));
			setUseScheduledSend(pref.use_scheduled_send !== false);
			setSendTimeLocal(String(pref.send_time_local ?? "08:00").slice(0, 5));
			setTimezone(pref.timezone ?? "Asia/Manila");
		}
	}

	async function loadMyProfile() {
		const legacy = readLegacyAdminSession();
		if (!legacy?.id) {
			setProfileAdminId("");
			setProfileUsername("");
			setProfileDisplayName("");
			setProfileImagePath(null);
			setProfileImageUrl(null);
			return;
		}

		const legacyId = safeText(legacy.id);
		const legacyUsername = safeText(legacy.username);
		const legacyFullName = safeText(legacy.full_name);
		const legacyProfilePath = safeText(legacy.profile_image_path) || null;

		setProfileAdminId(legacyId);
		setProfileUsername(legacyUsername);
		setProfileDisplayName(legacyFullName || legacyUsername);
		setProfileImagePath(legacyProfilePath);
		setProfileImageUrl(null);

		try {
			const wideRes = await supabase
				.from("admins")
				.select("id, username, full_name, profile_image_path")
				.eq("id", legacyId)
				.maybeSingle();

			let row: AdminProfileRow | null = null;

			if (wideRes.error) {
				const msg = safeText((wideRes.error as { message?: unknown }).message ?? "").toLowerCase();
				if (!msg.includes("profile_image_path")) throw wideRes.error;

				const fallbackRes = await supabase
					.from("admins")
					.select("id, username, full_name")
					.eq("id", legacyId)
					.maybeSingle();
				if (fallbackRes.error) throw fallbackRes.error;
				row = (fallbackRes.data as AdminProfileRow | null) ?? null;
			} else {
				row = (wideRes.data as AdminProfileRow | null) ?? null;
			}

			if (!row) return;

			const nextId = safeText(row.id) || legacyId;
			const nextUsername = safeText(row.username) || legacyUsername;
			const nextFullName = safeText(row.full_name);
			const nextProfilePath = safeText(row.profile_image_path) || null;

			setProfileAdminId(nextId);
			setProfileUsername(nextUsername);
			setProfileDisplayName(nextFullName || nextUsername);
			setProfileImagePath(nextProfilePath);
			setProfileImageUrl(null);

			writeLegacyAdminSessionPatch({
				id: nextId,
				username: nextUsername,
				full_name: nextFullName || null,
				profile_image_path: nextProfilePath,
			});
		} catch {
			// ignore bootstrap errors for profile card
		}
	}

	async function saveProfileName() {
		const adminId = safeText(profileAdminId);
		const nextName = safeText(profileDisplayName);
		if (!adminId) {
			setError("No active admin session found.");
			return;
		}
		if (!nextName) {
			setError("Display name is required.");
			return;
		}

		setProfileSaving(true);
		setError("");
		setSuccess("");
		try {
			const upd = await supabase.from("admins").update({ full_name: nextName }).eq("id", adminId);
			if (upd.error) throw upd.error;

			setProfileDisplayName(nextName);
			writeLegacyAdminSessionPatch({ full_name: nextName });
			notifyAdminProfileUpdated();
			setSuccess("Profile name updated.");
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setProfileSaving(false);
		}
	}

	async function uploadProfileImage(file: File | null) {
		if (!file) return;

		const adminId = safeText(profileAdminId);
		if (!adminId) {
			setError("No active admin session found.");
			return;
		}

		if (!String(file.type || "").startsWith("image/")) {
			setError("Please upload an image file.");
			return;
		}

		if (file.size > MAX_PROFILE_IMAGE_SIZE_BYTES) {
			setError("Profile image must be 5MB or smaller.");
			return;
		}

		setProfileUploading(true);
		setError("");
		setSuccess("");

		try {
			const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
			const path = `${adminId}/profile-${Date.now()}-${safeName}`;

			const uploadRes = await supabase.storage.from(PROFILE_BUCKET).upload(path, file);
			if (uploadRes.error) {
				throw new Error(`Upload failed in bucket ${PROFILE_BUCKET}: ${uploadRes.error.message}`);
			}

			const upd = await supabase.from("admins").update({ profile_image_path: path }).eq("id", adminId);
			if (upd.error) {
				const msg = safeText((upd.error as { message?: unknown }).message ?? upd.error).toLowerCase();
				if (msg.includes("profile_image_path")) {
					throw new Error("Missing admins.profile_image_path column. Run SQL/supabase_add_admin_profile_image_path.sql first.");
				}
				throw upd.error;
			}

			const previousPath = profileImagePath;
			setProfileImagePath(path);
			setProfileImageUrl(null);
			writeLegacyAdminSessionPatch({ profile_image_path: path });
			notifyAdminProfileUpdated();
			setSuccess("Profile image updated.");

			if (previousPath && previousPath !== path) {
				void supabase.storage.from(PROFILE_BUCKET).remove([previousPath]);
			}
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setProfileUploading(false);
		}
	}

	async function removeProfileImage() {
		const adminId = safeText(profileAdminId);
		if (!adminId || !profileImagePath) return;

		setProfileRemoving(true);
		setError("");
		setSuccess("");
		try {
			const previousPath = profileImagePath;
			const upd = await supabase.from("admins").update({ profile_image_path: null }).eq("id", adminId);
			if (upd.error) throw upd.error;

			setProfileImagePath(null);
			setProfileImageUrl(null);
			writeLegacyAdminSessionPatch({ profile_image_path: null });
			notifyAdminProfileUpdated();
			setSuccess("Profile image removed.");

			if (previousPath) {
				void supabase.storage.from(PROFILE_BUCKET).remove([previousPath]);
			}
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setProfileRemoving(false);
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

	async function saveNotificationLogRetention(nextValue?: number) {
		if (!electronAPI?.notifications?.saveLogRetentionConfig) {
			throw new Error("Notification log retention is only available in the Electron desktop app.");
		}

		const retentionDays = normalizeLogRetentionDays(nextValue ?? logRetentionDays);
		setLogRetentionSaving(true);
		setError("");
		setSuccess("");
		try {
			const res = await electronAPI.notifications.saveLogRetentionConfig({ retentionDays });
			setLogRetentionDays(String(normalizeLogRetentionDays(res?.retentionDays ?? retentionDays)));
			setSuccess(`Sent Gmail log retention saved (${res?.retentionLabel ?? labelForLogRetentionDays(retentionDays)}).`);
			await refreshLogs();
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setLogRetentionSaving(false);
		}
	}

	async function clearNotificationLog() {
		if (!electronAPI?.notifications?.clearLog) {
			throw new Error("Clearing the Sent Gmail log is only available in the Electron desktop app.");
		}

		setLogClearing(true);
		setError("");
		setSuccess("");
		try {
			const ok = window.confirm("Clear all Sent Gmail log entries now?");
			if (!ok) return;
			const res = await electronAPI.notifications.clearLog();
			setLogs([]);
			setSuccess(`Cleared ${Number(res?.deleted ?? 0)} Sent Gmail log entr${Number(res?.deleted ?? 0) === 1 ? "y" : "ies"}.`);
			await refreshLogs();
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setLogClearing(false);
		}
	}

	async function loadRecipientRows() {
		try {
			const res = await supabase
				.from("notification_recipients")
				.select("id, email, is_active, notes, created_at")
				.order("created_at", { ascending: true });
			if (res.error) throw res.error;
			setRecipientRows((res.data as RecipientRow[]) ?? []);
		} catch (e: unknown) {
			setError(errorMessage(e));
		}
	}

	async function loadOtherExpirationRows() {
		try {
			const res = await supabase
				.from("other_expiration_items")
				.select("id, item_name, expiration_type, expires_on, days_before_expiry, recipient_email, notes, is_active, created_at")
				.order("expires_on", { ascending: true })
				.limit(300);

			if (res.error) {
				const msg = errorTextWithMessageFallback(res.error);
				if (!/days_before_expiry/i.test(msg)) throw res.error;

				const fallback = await supabase
					.from("other_expiration_items")
					.select("id, item_name, expiration_type, expires_on, recipient_email, notes, is_active, created_at")
					.order("expires_on", { ascending: true })
					.limit(300);
				if (fallback.error) throw fallback.error;

				const mapped = (((fallback.data as OtherExpirationRow[]) ?? []) || []).map((row) => ({
					...row,
					days_before_expiry: null,
				}));
				setOtherRows(mapped.filter((row) => !HIDDEN_OTHER_EXPIRATION_TYPES.has(String(row.expiration_type ?? "").trim().toUpperCase())));
				return;
			}

			setOtherRows(((res.data as OtherExpirationRow[]) ?? []).filter((row) => !HIDDEN_OTHER_EXPIRATION_TYPES.has(String(row.expiration_type ?? "").trim().toUpperCase())));
		} catch (e: unknown) {
			setError(errorMessage(e));
		}
	}

	async function addRecipient() {
		setRecipientSaving(true);
		setError("");
		setSuccess("");
		try {
			const email = safeText(recipientEmail).toLowerCase();
			if (!email) throw new Error("Recipient email is required.");
			const ins = await supabase.from("notification_recipients").insert({
				email,
				notes: safeText(recipientNotes) || null,
				is_active: true,
			});
			if (ins.error) throw ins.error;
			setRecipientEmail("");
			setRecipientNotes("");
			setAddRecipientOpen(false);
			setSuccess("Recipient added.");
			await loadRecipientRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setRecipientSaving(false);
		}
	}

	function openRecipientEditor(row: RecipientRow) {
		setEditingRecipientId(row.id);
		setEditRecipientEmail(row.email);
		setEditRecipientNotes(row.notes ?? "");
		setEditRecipientActive(Boolean(row.is_active));
		setError("");
		setSuccess("");
	}

	async function saveRecipientEdit() {
		if (!editingRecipientId) return;
		setRecipientSaving(true);
		setError("");
		setSuccess("");
		try {
			const email = safeText(editRecipientEmail).toLowerCase();
			if (!email) throw new Error("Recipient email is required.");
			const upd = await supabase
				.from("notification_recipients")
				.update({
					email,
					notes: safeText(editRecipientNotes) || null,
					is_active: Boolean(editRecipientActive),
				})
				.eq("id", editingRecipientId);
			if (upd.error) throw upd.error;
			setEditingRecipientId(null);
			setSuccess("Recipient updated.");
			await loadRecipientRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setRecipientSaving(false);
		}
	}

	async function toggleRecipient(id: number, isActive: boolean) {
		try {
			const upd = await supabase.from("notification_recipients").update({ is_active: isActive }).eq("id", id);
			if (upd.error) throw upd.error;
			await loadRecipientRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
		}
	}

	async function removeRecipient(id: number) {
		try {
			const ok = window.confirm("Remove this recipient email?");
			if (!ok) return;
			const del = await supabase.from("notification_recipients").delete().eq("id", id);
			if (del.error) throw del.error;
			await loadRecipientRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
		}
	}

	async function addOtherExpiration() {
		setOtherSaving(true);
		setError("");
		setSuccess("");
		try {
			const itemName = safeText(otherItemName);
			const typeName = safeText(otherType);
			const daysBeforeItem = Number(otherDaysBeforeInput);
			const expiresOn = safeText(otherExpiresOn);
			if (!itemName) throw new Error("Item name is required.");
			if (!typeName) throw new Error("Type is required.");
			if (!Number.isFinite(daysBeforeItem) || daysBeforeItem < 1 || daysBeforeItem > 365) {
				throw new Error("Days before expiry must be between 1 and 365.");
			}
			if (!expiresOn) throw new Error("Expiration date is required.");

			const insertPayload: Record<string, unknown> = {
				item_name: itemName,
				expiration_type: typeName,
				expires_on: expiresOn,
				days_before_expiry: Math.trunc(daysBeforeItem),
				recipient_email: safeText(otherRecipientEmail).toLowerCase() || null,
				notes: safeText(otherNotes) || null,
				is_active: true,
			};

			const ins = await supabase.from("other_expiration_items").insert(insertPayload);
			if (ins.error) {
				const msg = errorTextWithMessageFallback(ins.error);
				if (!/days_before_expiry/i.test(msg)) throw ins.error;

				const fallbackPayload = { ...insertPayload };
				delete fallbackPayload.days_before_expiry;
				const fallback = await supabase.from("other_expiration_items").insert(fallbackPayload);
				if (fallback.error) throw fallback.error;
				setSuccess("Other expiration item added. Run the days_before_expiry migration to persist per-item days.");
			} else {
				setSuccess("Other expiration item added.");
			}

			setOtherItemName("");
			setOtherType("Car OCR");
			setOtherDaysBeforeInput("30");
			setOtherExpiresOn("");
			setOtherRecipientEmail("");
			setOtherNotes("");
			setAddOtherOpen(false);
			await loadOtherExpirationRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setOtherSaving(false);
		}
	}

	function openOtherEditor(row: OtherExpirationRow) {
		setEditingOtherId(row.id);
		setEditOtherItemName(row.item_name);
		setEditOtherType(row.expiration_type);
		setEditOtherDaysBeforeInput(String(row.days_before_expiry ?? 30));
		setEditOtherExpiresOn(row.expires_on);
		setEditOtherRecipientEmail(row.recipient_email ?? "");
		setEditOtherNotes(row.notes ?? "");
		setEditOtherActive(Boolean(row.is_active));
		setError("");
		setSuccess("");
	}

	async function saveOtherEdit() {
		if (!editingOtherId) return;
		setOtherSaving(true);
		setError("");
		setSuccess("");
		try {
			const itemName = safeText(editOtherItemName);
			const typeName = safeText(editOtherType);
			const daysBeforeItem = Number(editOtherDaysBeforeInput);
			const expiresOn = safeText(editOtherExpiresOn);
			if (!itemName) throw new Error("Item name is required.");
			if (!typeName) throw new Error("Type is required.");
			if (!Number.isFinite(daysBeforeItem) || daysBeforeItem < 1 || daysBeforeItem > 365) {
				throw new Error("Days before expiry must be between 1 and 365.");
			}
			if (!expiresOn) throw new Error("Expiration date is required.");

			const updatePayload: Record<string, unknown> = {
				item_name: itemName,
				expiration_type: typeName,
				expires_on: expiresOn,
				days_before_expiry: Math.trunc(daysBeforeItem),
				recipient_email: safeText(editOtherRecipientEmail).toLowerCase() || null,
				notes: safeText(editOtherNotes) || null,
				is_active: Boolean(editOtherActive),
			};

			const upd = await supabase.from("other_expiration_items").update(updatePayload).eq("id", editingOtherId);
			if (upd.error) {
				const msg = errorTextWithMessageFallback(upd.error);
				if (!/days_before_expiry/i.test(msg)) throw upd.error;

				const fallbackPayload = { ...updatePayload };
				delete fallbackPayload.days_before_expiry;
				const fallback = await supabase
					.from("other_expiration_items")
					.update(fallbackPayload)
					.eq("id", editingOtherId);
				if (fallback.error) throw fallback.error;
				setSuccess("Expiration item updated. Run the days_before_expiry migration to persist per-item days.");
			} else {
				setSuccess("Expiration item updated.");
			}

			setEditingOtherId(null);
			await loadOtherExpirationRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
		} finally {
			setOtherSaving(false);
		}
	}

	async function toggleOtherExpiration(id: number, isActive: boolean) {
		try {
			const upd = await supabase.from("other_expiration_items").update({ is_active: isActive }).eq("id", id);
			if (upd.error) throw upd.error;
			await loadOtherExpirationRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
		}
	}

	async function removeOtherExpiration(id: number) {
		try {
			const ok = window.confirm("Remove this expiration record?");
			if (!ok) return;
			const del = await supabase.from("other_expiration_items").delete().eq("id", id);
			if (del.error) throw del.error;
			await loadOtherExpirationRows();
		} catch (e: unknown) {
			setError(errorMessage(e));
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
			setError("");
			setSuccess("");

			try {
				if (electronAPI?.settings?.loadNotificationConfig) {
					const cfg = await electronAPI.settings.loadNotificationConfig();
					if (cancelled) return;
					const loadedCfg = cfg as NotificationConfigLike;
					applyLoadedConfig(loadedCfg);
					if (loadedCfg.unavailable) {
						setError(
							safeText(loadedCfg.error) ||
							"Supabase is temporarily unreachable. Showing local/default settings until the connection recovers."
						);
					}
				} else {
					// Web fallback (anon key) – may be blocked by RLS depending on your policies.
					const [emailRes, prefRes] = await Promise.all([
						supabase
							.from("notification_email_settings")
							.select("id, provider, gmail_user, from_email, is_active, notes")
							.eq("provider", "gmail")
							.limit(1)
							.maybeSingle(),
						(async () => {
							// Backward-compatible: older DBs may not have send_to_employees yet.
							const wide = await supabase
								.from("notification_preferences")
								.select(
									"id, is_enabled, send_to_employees, include_expired, expired_within_days, days_before_expiry, include_driver_license, include_security_license, include_insurance, use_scheduled_send, send_time_local, timezone"
								)
								.limit(1)
								.maybeSingle();
							if (!wide.error) return wide;
							const msg = errorTextWithMessageFallback(wide.error);
							if (!/send_to_employees|include_expired|expired_within_days/i.test(msg)) return wide;
							return await supabase
								.from("notification_preferences")
								.select(
									"id, is_enabled, days_before_expiry, include_driver_license, include_security_license, include_insurance, use_scheduled_send, send_time_local, timezone"
								)
								.limit(1)
								.maybeSingle();
						})(),
					]);

					if (emailRes.error) throw emailRes.error;
					if (prefRes.error) throw prefRes.error;
					if (cancelled) return;

					const email = (emailRes.data as EmailSettingsRow | null) ?? null;
					if (email) {
						setGmailUser(email.gmail_user ?? "");
						setIsActive(Boolean(email.is_active));
						const tpl = parseTemplateNotes(email.notes);
						setEmailSubject(tpl.subject || DEFAULT_NOTICE_SUBJECT);
						setEmailBodyHtml(tpl.bodyHtml || DEFAULT_NOTICE_BODY);
						setDbHasStoredPassword(false);
						setDbStoredPasswordCache("");
						setGmailAppPassword("");
						setStoreAppPassword(false);
						setLoadedStoredPassword(false);
					} else {
						setDbHasStoredPassword(false);
						setDbStoredPasswordCache("");
						setEmailSubject(DEFAULT_NOTICE_SUBJECT);
						setEmailBodyHtml(DEFAULT_NOTICE_BODY);
					}

					const pref = (prefRes.data as PreferencesRow | null) ?? null;
					if (pref) {
						setEnabled(Boolean(pref.is_enabled));
						setSendToEmployees(pref.send_to_employees !== false);
						setDaysBeforeInput(String(pref.days_before_expiry ?? 30));
						setIncludeDriver(Boolean(pref.include_driver_license));
						setIncludeSecurity(Boolean(pref.include_security_license));
						setIncludeInsurance(Boolean(pref.include_insurance));
						setUseScheduledSend(pref.use_scheduled_send !== false);
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
	}, [electronAPI]);

	useEffect(() => {
		void (async () => {
			await loadMyProfile();
			await loadRecipientRows();
			await loadOtherExpirationRows();
			if (isDesktop && electronAPI?.notifications?.loadLogRetentionConfig) {
				try {
					const res = await electronAPI.notifications.loadLogRetentionConfig();
					setLogRetentionDays(String(normalizeLogRetentionDays(res?.retentionDays ?? 30)));
				} catch (e: unknown) {
					setError(errorMessage(e));
				}
			}
		})();
	}, [electronAPI, isDesktop]);

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
					name: getLegacyAdminDisplayName(),
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
						send_to_employees: Boolean(sendToEmployees),
						// Keep the server sender enabled so Vercel notifications continue
						// even when the Electron application is closed.
						use_supabase_email_sender: true,
						include_expired: Boolean(includeExpired),
						expired_within_days: Math.max(1, Math.min(365, Number(expiredWithinDays || 7))),
						days_before_expiry: daysBeforeValue,
						include_driver_license: Boolean(includeDriver),
						include_security_license: Boolean(includeSecurity),
						include_insurance: Boolean(includeInsurance),
						use_scheduled_send: Boolean(useScheduledSend),
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
						sendToEmployees: Boolean(sendToEmployees),
						notificationLogRetentionDays: normalizeLogRetentionDays(logRetentionDays),
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
							send_to_employees: Boolean(sendToEmployees),
							use_supabase_email_sender: true,
							include_expired: Boolean(includeExpired),
							expired_within_days: Math.max(1, Math.min(365, Number(expiredWithinDays || 7))),
							days_before_expiry: daysBeforeValue,
							include_driver_license: Boolean(includeDriver),
							include_security_license: Boolean(includeSecurity),
							include_insurance: Boolean(includeInsurance),
							use_scheduled_send: Boolean(useScheduledSend),
							send_time_local: safeText(sendTimeLocal) || "08:00",
							timezone: safeText(timezone) || "Asia/Manila",
						})
						.eq("id", existingPref.data.id);
					if (upd.error) throw upd.error;
				} else {
					const ins = await supabase.from("notification_preferences").insert({
						is_enabled: Boolean(enabled),
						send_to_employees: Boolean(sendToEmployees),
						use_supabase_email_sender: true,
						include_expired: Boolean(includeExpired),
						expired_within_days: Math.max(1, Math.min(365, Number(expiredWithinDays || 7))),
						days_before_expiry: daysBeforeValue,
						include_driver_license: Boolean(includeDriver),
						include_security_license: Boolean(includeSecurity),
						include_insurance: Boolean(includeInsurance),
						use_scheduled_send: Boolean(useScheduledSend),
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
					const loadedCfg = cfg as NotificationConfigLike;
					applyLoadedConfig(loadedCfg);
					if (loadedCfg.unavailable) {
						setError(
							safeText(loadedCfg.error) ||
							"Supabase is temporarily unreachable. Saved values may not be fully reloaded yet."
						);
					}
				} catch {
					// ignore reload errors
				}
			}

			// Refresh logs immediately.
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
		<section className="glass-panel animate-slide-up rounded-3xl shadow-xl p-6 space-y-6 border-none">
			<div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
				<div>
					<h1 className="text-2xl font-black tracking-tight text-slate-900">Settings & System Preferences</h1>
					<p className="text-xs font-medium text-slate-500 mt-1">Configure user profile, automated Gmail alerts, licensure expiry rules, and system updates.</p>
				</div>
				<div className="flex items-center gap-2">
					{canAdminExport ? (
						<button
							onClick={async () => {
								setExporting(true);
								setError("");
								setSuccess("");
								try {
									if (!electronAPI?.admin?.exportDatabaseExcel) {
										throw new Error("Export is only available in the Electron desktop app.");
									}
									const res = await electronAPI.admin.exportDatabaseExcel();
									if (res?.cancelled) {
										setSuccess("Export cancelled.");
										return;
									}
									if (!res?.ok || !res?.filePath) {
										throw new Error("Export failed.");
									}
									const skipped = Array.isArray(res.skippedTables) ? res.skippedTables.length : 0;
									setSuccess(
										`Exported to: ${res.filePath}${skipped ? ` (skipped ${skipped} missing tables)` : ""}`
									);
								} catch (e: unknown) {
									setError(errorMessage(e));
								} finally {
									setExporting(false);
								}
						}}
							disabled={exporting || !isDesktop}
							className="animated-btn px-4 py-2.5 rounded-xl bg-[#FFDA03] text-black font-bold text-sm disabled:opacity-50 hover:brightness-95 shadow-sm active:scale-95 transition-all"
						>
							{exporting ? "Exporting…" : "Export database"}
						</button>
					) : null}
					<button
						onClick={() => router.push("/Main_Modules/Dashboard/")}
						className="animated-btn px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
					>
						Back
					</button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2 text-xs shadow-sm">
					<span className="text-slate-500 font-semibold">Notifications:</span>
					<span className={enabled ? "text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" : "text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded"}>
						{enabled ? "Enabled" : "Disabled"}
					</span>
				</div>
				<div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2 text-xs shadow-sm">
					<span className="text-slate-500 font-semibold">Log Status:</span>
					<select
						value={logStatus}
						onChange={(e) => setLogStatus(e.target.value)}
						className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-800 font-bold bg-white focus:outline-none"
					>
						<option value="ALL" className="text-black">All</option>
						<option value="SENT" className="text-black">Sent</option>
						<option value="FAILED" className="text-black">Failed</option>
						<option value="SKIPPED" className="text-black">Skipped</option>
						<option value="QUEUED" className="text-black">Queued</option>
					</select>
				</div>
				{!hydrated ? (
					<div className="text-xs text-slate-400 font-medium">Checking desktop integration...</div>
				) : isDesktop ? (
					<div className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
						Gmail user in env: <span className="font-bold text-slate-800">{envHasGmailUser ? "yes" : envHasGmailUser === false ? "no" : "unknown"}</span> • Gmail pass in env:{" "}
						<span className="font-bold text-slate-800">{envHasGmailPass ? "yes" : envHasGmailPass === false ? "no" : "unknown"}</span>
					</div>
				) : (
					<div className="text-xs text-slate-500 font-medium bg-amber-50 text-amber-900 px-3 py-1.5 rounded-xl border border-amber-200">
						Sender setup is managed in the Electron app. Automatic emails only run while the desktop app is open.
					</div>
				)}
			</div>

			{loading ? (
				<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-12 shadow-sm flex items-center justify-center">
					<LoadingCircle label="Loading settings..." />
				</div>
			) : (
				<div className="space-y-6">
					{error ? (
						<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 shadow-sm flex items-center gap-2">
							<span>⚠️</span>
							<span>{error}</span>
						</div>
					) : null}
					{success ? (
						<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 shadow-sm flex items-center gap-2">
							<span>✓</span>
							<span>{success}</span>
						</div>
					) : null}

					{/* My Profile */}
					<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md transition-all duration-200 hover:shadow-md">
						<div className="flex flex-wrap items-start justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
							<div>
								<div className="text-base font-extrabold text-slate-900">My Profile</div>
								<div className="text-xs font-medium text-slate-500 mt-0.5">
									Shown in top navigation header. Images are saved in bucket <span className="font-mono text-slate-700 font-bold">{PROFILE_BUCKET}</span>.
								</div>
							</div>
							<div className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
								Account: {profileUsername || "-"}
							</div>
						</div>

						{profileAdminId ? (
							<div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-6 items-start">
								<div className="h-28 w-28 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0 shadow-inner">
									{profileImageUrl ? (
										<div
											role="img"
											aria-label={profileDisplayLabel}
											className="h-full w-full bg-cover bg-center"
											style={{ backgroundImage: `url("${profileImageUrl}")` }}
										/>
									) : (
										<span className="text-2xl font-black text-slate-400 tracking-wider">{profileBadgeLabel}</span>
									)}
								</div>

								<div className="space-y-4 min-w-0">
									<div>
										<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Display Name</label>
										<input
											value={profileDisplayName}
											onChange={(e) => setProfileDisplayName(e.target.value)}
											placeholder="Enter your display name"
											className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:border-[#8B1C1C] focus:outline-none focus:ring-4 focus:ring-[#8B1C1C]/10 transition-all"
										/>
									</div>

									<div className="text-xs font-medium text-slate-400 break-all">
										Current image path: <span className="font-mono text-slate-600">{profileImagePath || "Not uploaded"}</span>
									</div>

									<div className="flex flex-wrap items-center gap-2.5">
										<button
											type="button"
											onClick={() => void saveProfileName()}
											disabled={profileSaving || profileUploading || profileRemoving}
											className="animated-btn px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs disabled:opacity-50 hover:bg-slate-800 shadow-sm active:scale-95 transition-all"
										>
											{profileSaving ? "Saving..." : "Save Name"}
										</button>

										<button
											type="button"
											onClick={() => profileFileInputRef.current?.click()}
											disabled={profileUploading || profileSaving || profileRemoving}
											className="animated-btn px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-bold text-xs disabled:opacity-50 hover:brightness-95 shadow-sm active:scale-95 transition-all"
										>
											{profileUploading ? "Uploading..." : "Upload Image"}
										</button>

										{profileImagePath ? (
											<button
												type="button"
												onClick={() => void removeProfileImage()}
												disabled={profileRemoving || profileUploading || profileSaving}
												className="animated-btn px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs disabled:opacity-50 hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
											>
												{profileRemoving ? "Removing..." : "Remove Image"}
											</button>
										) : null}
									</div>

									<div className="text-[11px] text-slate-400 font-medium">Accepted image files up to 5MB.</div>
								</div>
							</div>
						) : (
							<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
								No active admin session found. Sign in again to edit your profile.
							</div>
						)}

						<input
							ref={profileFileInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0] ?? null;
								e.currentTarget.value = "";
								void uploadProfileImage(file);
							}}
						/>
					</div>

					{/* System Updates */}
					{isDesktop ? (
						<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md transition-all duration-200 hover:shadow-md">
							<div className="flex flex-wrap items-start justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
								<div>
									<div className="text-base font-extrabold text-slate-900">System Updates</div>
									<div className="text-xs font-medium text-slate-500 mt-0.5">
										Check for software updates and install them seamlessly without manual reinstalling.
									</div>
								</div>
								{currentVersion && (
									<div className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-extrabold text-slate-700">
										Current Version: v{currentVersion}
									</div>
								)}
							</div>

							<div className="mt-2 flex flex-col gap-4">
								{updaterState === "idle" && (
									<div>
										<p className="text-sm text-slate-600 font-medium">
											Keep your application up to date with the latest features, security patches, and database optimizations.
										</p>
										<button
											type="button"
											onClick={handleCheckForUpdates}
											className="mt-3 min-h-10 rounded-xl bg-[#FFDA03] px-5 py-2 text-xs font-extrabold text-black hover:brightness-95 active:scale-95 transition-all duration-200 shadow-sm"
										>
											Check for Updates
										</button>
									</div>
								)}

								{updaterState === "checking" && (
									<div className="flex items-center gap-3 py-2">
										<div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"></div>
										<span className="text-sm text-slate-700 font-bold">Checking GitHub for updates...</span>
									</div>
								)}

								{updaterState === "no-update" && (
									<div>
										<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-bold">
											✓ Your application is up to date! You are running the latest version.
										</div>
										<button
											type="button"
											onClick={handleCheckForUpdates}
											className="mt-3 min-h-10 rounded-xl bg-slate-100 border border-slate-200 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-all duration-200"
										>
											Check Again
										</button>
									</div>
								)}

								{updaterState === "available" && (
									<div>
										<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 font-medium">
											<div className="font-bold mb-1">New Version Available!</div>
											A new update (<span className="font-extrabold text-amber-950">v{updateVersion}</span>) is ready to download.
										</div>
										<div className="mt-3 flex gap-2">
											<button
												type="button"
												onClick={handleDownloadUpdate}
												className="min-h-10 rounded-xl bg-slate-900 px-5 py-2 text-xs font-extrabold text-white hover:bg-slate-800 active:scale-95 transition-all duration-200 shadow-sm"
											>
												Download Update
											</button>
											<button
												type="button"
												onClick={() => setUpdaterState("idle")}
												className="min-h-10 rounded-xl bg-white border border-slate-200 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all duration-200"
											>
												Later
											</button>
										</div>
									</div>
								)}

								{updaterState === "downloading" && (
									<div>
										<div className="flex justify-between text-xs text-slate-700 font-bold mb-1.5">
											<span>Downloading latest version...</span>
											<span>{downloadPercent}%</span>
										</div>
										<div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200 p-0.5">
											<div
												className="bg-gradient-to-r from-amber-400 to-amber-600 h-full rounded-full transition-all duration-300 shadow-sm"
												style={{ width: `${downloadPercent}%` }}
											></div>
										</div>
									</div>
								)}

								{updaterState === "downloaded" && (
									<div>
										<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 mb-3 font-medium">
											<div className="font-bold mb-1">Download Complete!</div>
											The update has been downloaded. Click below to restart and automatically apply the new version.
										</div>
										<button
											type="button"
											onClick={handleInstallUpdate}
											className="min-h-10 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700 active:scale-95 transition-all duration-200 shadow-md"
										>
											Restart and Install
										</button>
									</div>
								)}

								{updaterState === "error" && (
									<div>
										<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3 font-medium">
											<div className="font-bold mb-1">Update Failed</div>
											{updaterError || "An error occurred during update process."}
										</div>
										<button
											type="button"
											onClick={handleCheckForUpdates}
											className="min-h-10 rounded-xl bg-[#FFDA03] px-5 py-2 text-xs font-extrabold text-black hover:brightness-95 transition-all duration-200"
										>
											Try Again
										</button>
									</div>
								)}
							</div>
						</div>
					) : null}

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
						{/* Gmail Sender */}
						<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md transition-all duration-200 hover:shadow-md">
							<div className="font-extrabold mb-1 text-slate-900 text-base">Gmail Sender & Email Template</div>
							<div className="text-xs font-medium text-slate-500 mb-4">
								Used to send notification emails. The desktop app sends them with Gmail App Password auth while active.
							</div>

							{isDesktop ? (
								<div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-700 mb-4 space-y-2">
									<div className="flex flex-wrap items-center gap-1.5 leading-relaxed">
										<span className="font-bold">Sender Priority:</span>
										<span className="font-mono text-slate-900 bg-white px-1.5 py-0.5 rounded border">GMAIL_USER</span>
										<span className="text-slate-400">(env)</span>
										<span className="text-slate-400">→</span>
										<span className="font-semibold text-slate-800">Saved Gmail User</span>
										<span className="text-slate-400">(Settings)</span>
									</div>
									<div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
										<span>Env Pass: <strong className="text-slate-800">{envHasGmailPass ? "yes" : envHasGmailPass === false ? "no" : "unknown"}</strong></span>
										<span>•</span>
										<span>Stored Pass in DB: <strong className="text-slate-800">{dbHasStoredPassword ? "yes" : "no"}</strong></span>
									</div>
									<div className="pt-2 flex flex-wrap gap-2">
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
										className="animated-btn px-3 py-1.5 rounded-xl bg-white border border-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs hover:bg-slate-100 shadow-sm active:scale-95 transition-all"
									>
										Clear Stored App Password
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
										className="animated-btn px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 shadow-sm active:scale-95 transition-all"
									>
										Remove Sender
									</button>
								</div>
							</div>
						) : null}

							<div className="space-y-4">
								<div>
									<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Gmail User</label>
									<input
										value={gmailUser}
										onChange={(e) => setGmailUser(e.target.value)}
										placeholder="yourcompany.notifications@gmail.com"
										className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:border-[#8B1C1C] focus:outline-none focus:ring-4 focus:ring-[#8B1C1C]/10 transition-all"
									/>
								</div>

								<div className="flex items-center gap-2.5">
									<input
										id="isActive"
										type="checkbox"
										checked={isActive}
										onChange={(e) => setIsActive(e.target.checked)}
										className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C] focus:ring-[#8B1C1C]"
									/>
									<label htmlFor="isActive" className="text-sm font-bold text-slate-800 select-none">
										Active Gmail Sender
									</label>
								</div>

								<div className="flex items-center gap-2.5">
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

										if (!dbHasStoredPassword) return;
										if (safeText(dbStoredPasswordCache)) {
											setGmailAppPassword(dbStoredPasswordCache);
											setLoadedStoredPassword(true);
											return;
										}

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
									className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C] focus:ring-[#8B1C1C]"
									/>
									<label htmlFor="storePass" className="text-sm font-semibold text-slate-700 select-none">
										Store Gmail App Password in database
									</label>
								</div>

								{storeAppPassword ? (
									<div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
										<label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Gmail App Password</label>
										<input
											type={showAppPassword ? "text" : "password"}
											value={gmailAppPassword}
											onChange={(e) => {
												setLoadedStoredPassword(false);
												setGmailAppPassword(e.target.value);
											}}
											placeholder="xxxx xxxx xxxx xxxx"
											className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-mono"
										/>
										<label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium">
											<input
												type="checkbox"
												checked={showAppPassword}
												onChange={(e) => setShowAppPassword(e.target.checked)}
											/>
											Show app password
										</label>
									</div>
								) : null}

								<div>
									<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Email Subject</label>
									<input
										value={emailSubject}
										onChange={(e) => setEmailSubject(e.target.value)}
										placeholder="NOTICE: LICENSE EXPIRATION ALERT ({count})"
										className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:border-[#8B1C1C] focus:outline-none focus:ring-4 focus:ring-[#8B1C1C]/10 transition-all"
									/>
									<div className="text-[11px] text-slate-400 font-medium mt-1">
										Tip: use <span className="font-mono font-bold text-slate-700">{'{count}'}</span> to insert number of expiring items.
									</div>
								</div>

								<div>
									<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Email Body</label>
									<RichTextEditor value={emailBodyHtml} onChange={setEmailBodyHtml} />
									<div className="text-[11px] text-slate-400 font-medium mt-1">
										This content appears above the expiring licenses table in sent emails.
									</div>
								</div>
							</div>
						</div>

						{/* Expiring Licensure Preferences */}
						<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md transition-all duration-200 hover:shadow-md space-y-4">
							<div className="font-extrabold text-slate-900 text-base pb-3 border-b border-slate-100">Expiring Licensure Preferences</div>

							<div className="flex items-center gap-2.5">
								<input
									id="enabled"
									type="checkbox"
									checked={enabled}
									onChange={(e) => setEnabled(e.target.checked)}
									className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C] focus:ring-[#8B1C1C]"
								/>
								<label htmlFor="enabled" className="text-sm font-extrabold text-slate-900 select-none">
									Enable Automatic Notification Engine
								</label>
							</div>

							<div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
								<div className="flex items-center justify-between gap-3">
									<div>
										<div className="text-sm font-bold text-slate-900">Send Gmail to Employees</div>
										<div className="text-xs font-medium text-slate-500 mt-0.5">Controls sending to employee emails (<span className="font-mono">applicants.client_email</span>).</div>
									</div>
									<button
										type="button"
										onClick={() => setSendToEmployees((v) => !v)}
										className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${sendToEmployees ? "bg-slate-900 border-slate-900" : "bg-slate-300 border-slate-300"}`}
										aria-label="Toggle send Gmail to employees"
										aria-pressed={sendToEmployees}
									>
										<span
											className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${sendToEmployees ? "translate-x-6" : "translate-x-1"}`}
										/>
									</button>
								</div>

								{!sendToEmployees ? (
									<div className="text-xs text-amber-800 font-medium mt-2 pt-2 border-t border-slate-200/80">
										Employee sending is disabled. Notification Recipients will still receive the expiring list.
									</div>
								) : null}
							</div>

							<div>
								<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Default Days Before Expiry</label>
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
									className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:border-[#8B1C1C] focus:outline-none focus:ring-4 focus:ring-[#8B1C1C]/10 transition-all"
								/>
							</div>

							<div>
								<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Include License Types</label>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
									<label className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-200 select-none">
										<input
											type="checkbox"
											checked={includeDriver}
											onChange={(e) => setIncludeDriver(e.target.checked)}
											className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
										/>
										Driver License
									</label>
									<label className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-200 select-none">
										<input
											type="checkbox"
											checked={includeSecurity}
											onChange={(e) => setIncludeSecurity(e.target.checked)}
											className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
										/>
										Security License
									</label>
									<label className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-200 select-none">
										<input
											type="checkbox"
											checked={includeInsurance}
											onChange={(e) => setIncludeInsurance(e.target.checked)}
											className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
										/>
										Insurance
									</label>
								</div>
							</div>

							<div className="space-y-3 pt-2 border-t border-slate-100">
								<label className="flex items-center gap-2 text-sm font-bold text-slate-800 select-none">
									<input
										type="checkbox"
										checked={useScheduledSend}
										onChange={(e) => setUseScheduledSend(e.target.checked)}
										className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
									/>
									Use Scheduled Send Time & Timezone
								</label>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div>
										<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Send Time (Local)</label>
										<input
											type="time"
											value={sendTimeLocal}
											onChange={(e) => setSendTimeLocal(e.target.value)}
											disabled={!useScheduledSend}
											className={`w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium ${!useScheduledSend ? "bg-slate-100 text-slate-400" : ""}`}
										/>
									</div>
									<div>
										<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Timezone</label>
										<input
											value={timezone}
											onChange={(e) => setTimezone(e.target.value)}
											placeholder="Asia/Manila"
											disabled={!useScheduledSend}
											className={`w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium ${!useScheduledSend ? "bg-slate-100 text-slate-400" : ""}`}
										/>
									</div>
								</div>
							</div>

							<div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
								<div className="font-bold text-slate-900 text-xs uppercase tracking-wider">Already Expired Records Window</div>
								<div className="flex flex-wrap items-center gap-3">
									<label className="flex items-center gap-2 text-sm font-bold text-slate-800 select-none">
										<input
											type="checkbox"
											checked={includeExpired}
											onChange={(e) => setIncludeExpired(e.target.checked)}
											className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
										/>
										Include Expired
									</label>
									<div className="flex items-center gap-2">
										<span className="text-xs font-bold text-slate-700">Expired within</span>
										<input
											type="number"
											min={1}
											max={365}
											value={expiredWithinDays}
											onChange={(e) => setExpiredWithinDays(Number(e.target.value))}
											className="w-20 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-900 font-bold"
										/>
										<span className="text-xs font-bold text-slate-700">days</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3 pt-2">
						<button
							onClick={() => void saveAll()}
							disabled={saving}
							className="animated-btn px-6 py-3 rounded-2xl bg-slate-900 text-white font-extrabold text-sm disabled:opacity-50 hover:bg-slate-800 shadow-md active:scale-95 transition-all"
						>
							{saving ? "Saving Preferences…" : "Save All Settings"}
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
										"This will resend emails for ALL currently expiring license and other-expiration records. Continue?"
									);
									if (!ok) return;
									const r = (await electronAPI.notifications.resendAllExpiring()) as RunNowResult;
									const summary = r?.summary
										? `sent=${r.summary.sent ?? 0}, failed=${r.summary.failed ?? 0}, skipped=${r.summary.skipped ?? 0}`
										: "";
									setRunSummary(summary);
									setSuccess(r?.message || "Resend all finished.");
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
							className="animated-btn px-6 py-3 rounded-2xl bg-[#8B1C1C] text-white font-extrabold text-sm disabled:opacity-50 hover:bg-red-800 shadow-md active:scale-95 transition-all"
						>
							{runSending ? "Resending…" : "Resend All Records Now"}
						</button>
						{runSummary ? <div className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border">Last run: {runSummary}</div> : null}
					</div>

					<div className="grid grid-cols-1 gap-6">
						{/* Notification Recipients */}
						<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
								<div>
									<div className="font-extrabold text-slate-900 text-base">Notification Recipients</div>
									<div className="text-xs font-medium text-slate-500 mt-0.5">
										Automatic notifications include all expiring licenses sent to these emails.
									</div>
								</div>
								<button
									type="button"
									onClick={() => {
										setAddRecipientOpen(true);
										setError("");
										setSuccess("");
									}}
									className="animated-btn rounded-xl bg-[#FFDA03] px-4 py-2 text-black font-extrabold text-xs hover:brightness-95 shadow-sm active:scale-95 transition-all"
								>
									+ Add Recipient
								</button>
							</div>
							<div className="overflow-hidden rounded-2xl border border-slate-200">
								<table className="w-full text-sm text-slate-900">
									<thead>
										<tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-extrabold uppercase tracking-wider text-slate-600">
											<th className="py-3 px-4">Email</th>
											<th className="py-3 px-4">Active</th>
											<th className="py-3 px-4">Action</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{recipientRows.length ? (
											recipientRows.map((row) => (
												<tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
													<td className="py-3 px-4 font-semibold text-slate-800">{row.email}</td>
													<td className="py-3 px-4">
														<input
															type="checkbox"
															checked={row.is_active}
															onChange={(e) => void toggleRecipient(row.id, e.target.checked)}
															className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
														/>
													</td>
													<td className="py-3 px-4">
														<div className="flex items-center gap-2">
															<button
																onClick={() => openRecipientEditor(row)}
																className="animated-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
															>
																Edit
															</button>
															<button onClick={() => void removeRecipient(row.id)} className="animated-btn rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 shadow-sm">
																Remove
															</button>
														</div>
													</td>
												</tr>
											))
										) : (
											<tr>
												<td colSpan={3} className="py-4 px-4 text-center text-xs font-medium text-slate-400">No recipient emails configured yet.</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>

						{/* Other Expiration Records */}
						<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
								<div>
									<div className="font-extrabold text-slate-900 text-base">Other Expiration Records</div>
									<div className="text-xs font-medium text-slate-500 mt-0.5">Manage additional custom expiration items with lead reminder days.</div>
								</div>
								<button
									type="button"
									onClick={() => {
										setAddOtherOpen(true);
										setError("");
										setSuccess("");
									}}
									className="animated-btn rounded-xl bg-[#FFDA03] px-4 py-2 text-black font-extrabold text-xs hover:brightness-95 shadow-sm active:scale-95 transition-all"
								>
									+ Add Expiration Item
								</button>
							</div>
							<div className="overflow-hidden rounded-2xl border border-slate-200">
								<table className="w-full text-sm text-slate-900">
									<thead>
										<tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-extrabold uppercase tracking-wider text-slate-600">
											<th className="py-3 px-4">Item</th>
											<th className="py-3 px-4">Type</th>
											<th className="py-3 px-4">Days Before</th>
											<th className="py-3 px-4">Expires</th>
											<th className="py-3 px-4">Active</th>
											<th className="py-3 px-4">Action</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{otherRows.length ? (
											otherRows.map((row) => (
												<tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
													<td className="py-3 px-4 font-bold text-slate-900">{row.item_name}</td>
													<td className="py-3 px-4 font-semibold text-slate-700">{row.expiration_type}</td>
													<td className="py-3 px-4 font-semibold text-slate-700">{row.days_before_expiry ?? daysBeforeInput}</td>
													<td className="py-3 px-4 font-mono text-xs font-bold text-slate-800">{row.expires_on}</td>
													<td className="py-3 px-4">
														<input
															type="checkbox"
															checked={row.is_active}
															onChange={(e) => void toggleOtherExpiration(row.id, e.target.checked)}
															className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
														/>
													</td>
													<td className="py-3 px-4">
														<div className="flex items-center gap-2">
															<button
																onClick={() => openOtherEditor(row)}
																className="animated-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
															>
																Edit
															</button>
															<button onClick={() => void removeOtherExpiration(row.id)} className="animated-btn rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 shadow-sm">
																Remove
															</button>
														</div>
													</td>
												</tr>
											))
										) : (
											<tr>
												<td colSpan={6} className="py-4 px-4 text-center text-xs font-medium text-slate-400">No additional expiration items yet.</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>

						{/* Sent Gmail Log */}
						<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md space-y-4">
							<div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
								<div>
									<div className="font-extrabold text-slate-900 text-base">Sent Gmail Log</div>
									<div className="text-xs font-medium text-slate-500 mt-0.5">
										Shows recent emails sent for expiring licenses and custom expiration records.
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<select
										value={logRetentionDays}
										onChange={(e) => setLogRetentionDays(String(normalizeLogRetentionDays(e.target.value)))}
										disabled={!isDesktop || logRetentionSaving || logClearing}
										className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800 bg-white focus:outline-none"
									>
										{LOG_RETENTION_OPTIONS.map((option) => (
											<option key={option.value} value={option.value} className="text-black">
												Auto clear in {option.label}
											</option>
										))}
									</select>
									<button
										type="button"
										onClick={() => void saveNotificationLogRetention()}
										disabled={!isDesktop || logRetentionSaving || logClearing}
										className="animated-btn px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 shadow-sm"
									>
										{logRetentionSaving ? "Saving..." : "Save Retention"}
									</button>
									<button
										type="button"
										onClick={() => void clearNotificationLog()}
										disabled={!isDesktop || logsLoading || logRetentionSaving || logClearing}
										className="animated-btn px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 shadow-sm"
									>
										{logClearing ? "Clearing..." : "Clear Log"}
									</button>
									<button
										type="button"
										onClick={() => void refreshLogs()}
										disabled={!isDesktop || logsLoading || logRetentionSaving || logClearing}
										className="animated-btn px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 shadow-sm"
									>
										{logsLoading ? "Loading..." : "Refresh Log"}
									</button>
								</div>
							</div>
							<div className="text-xs font-semibold text-slate-500">
								Current automatic clear schedule: <span className="font-extrabold text-slate-800">{labelForLogRetentionDays(logRetentionDays)}</span>.
							</div>
							<div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200">
								{logs.length === 0 ? (
									<div className="px-4 py-6 text-center text-xs font-medium text-slate-400">No log entries loaded yet.</div>
								) : (
									<table className="w-full text-sm text-slate-900">
										<thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-600">
											<tr className="text-left">
												<th className="py-2.5 px-4">When</th>
												<th className="py-2.5 px-4">Status</th>
												<th className="py-2.5 px-4">Type</th>
												<th className="py-2.5 px-4">To</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-slate-100">
											{logs.map((r) => (
												<tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
													<td className="py-2.5 px-4 whitespace-nowrap font-mono text-xs font-semibold text-slate-700">{String(r.created_at).slice(0, 19)}</td>
													<td className="py-2.5 px-4 whitespace-nowrap">
														<span className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${r.status === "SENT" ? "bg-emerald-100 text-emerald-800" : r.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-800"}`}>
															{r.status}
														</span>
													</td>
													<td className="py-2.5 px-4 whitespace-nowrap font-bold text-slate-800">{r.license_type}</td>
													<td className="py-2.5 px-4 whitespace-nowrap font-semibold text-slate-700">{r.recipient_email ?? ""}</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</div>
						</div>

						{/* Modal Portal: Add Recipient */}
						{addRecipientOpen && canUsePortal
							? createPortal(
									<div className={centeredModalOverlayClass} onClick={() => setAddRecipientOpen(false)}>
										<div className={`${floatingModalCardClass} max-w-lg`} onClick={(e) => e.stopPropagation()}>
									<div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
										<div>
											<div className="text-lg font-extrabold text-slate-900">Add Recipient Email</div>
											<div className="text-xs font-medium text-slate-500">Receives all expiring-license and custom expiration alerts.</div>
										</div>
										<button type="button" className="animated-btn px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setAddRecipientOpen(false)}>
											Cancel
										</button>
									</div>

									<div className="space-y-3">
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Email Address</label>
											<input
												value={recipientEmail}
												onChange={(e) => setRecipientEmail(e.target.value)}
												placeholder="notify-team@example.com"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>

										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Notes (Optional)</label>
											<input
												value={recipientNotes}
												onChange={(e) => setRecipientNotes(e.target.value)}
												placeholder="Department / purpose"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
									</div>

									<div className="mt-5 flex items-center justify-end gap-2">
										<button type="button" className="animated-btn px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setAddRecipientOpen(false)}>
											Close
										</button>
										<button
											type="button"
											onClick={() => void addRecipient()}
											disabled={recipientSaving}
											className="animated-btn px-5 py-2 rounded-xl bg-slate-900 text-white font-extrabold text-xs disabled:opacity-50 hover:bg-slate-800 shadow-sm"
										>
											{recipientSaving ? "Adding…" : "Add Recipient"}
										</button>
									</div>
										</div>
									</div>,
									document.body
								)
							: null}

						{/* Modal Portal: Edit Recipient */}
						{editingRecipientId !== null && canUsePortal
							? createPortal(
									<div className={centeredModalOverlayClass} onClick={() => setEditingRecipientId(null)}>
										<div className={`${floatingModalCardClass} max-w-lg`} onClick={(e) => e.stopPropagation()}>
									<div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
										<div>
											<div className="text-lg font-extrabold text-slate-900">Edit Recipient</div>
											<div className="text-xs font-medium text-slate-500">Update recipient email and notification settings.</div>
										</div>
										<button type="button" className="animated-btn px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setEditingRecipientId(null)}>
											Cancel
										</button>
									</div>

									<div className="space-y-3">
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Email Address</label>
											<input
												value={editRecipientEmail}
												onChange={(e) => setEditRecipientEmail(e.target.value)}
												placeholder="notify-team@example.com"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>

										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Notes (Optional)</label>
											<input
												value={editRecipientNotes}
												onChange={(e) => setEditRecipientNotes(e.target.value)}
												placeholder="Department / purpose"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>

										<label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 pt-1">
											<input
												type="checkbox"
												checked={editRecipientActive}
												onChange={(e) => setEditRecipientActive(e.target.checked)}
												className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
											/>
											Active
										</label>
									</div>

									<div className="mt-5 flex items-center justify-end gap-2">
										<button type="button" className="animated-btn px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setEditingRecipientId(null)}>
											Close
										</button>
										<button
											type="button"
											onClick={() => void saveRecipientEdit()}
											disabled={recipientSaving}
											className="animated-btn px-5 py-2 rounded-xl bg-slate-900 text-white font-extrabold text-xs disabled:opacity-50 hover:bg-slate-800 shadow-sm"
										>
											{recipientSaving ? "Saving..." : "Save Changes"}
										</button>
									</div>
										</div>
									</div>,
									document.body
								)
							: null}

						{/* Modal Portal: Add Other Expiration */}
						{addOtherOpen && canUsePortal
							? createPortal(
									<div className={centeredModalOverlayClass} onClick={() => setAddOtherOpen(false)}>
										<div className={`${floatingModalCardClass} max-w-2xl`} onClick={(e) => e.stopPropagation()}>
									<div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
										<div>
											<div className="text-lg font-extrabold text-slate-900">Add Custom Expiration Item</div>
											<div className="text-xs font-medium text-slate-500">Tracks additional expiring records like OCR, contracts, and registration.</div>
										</div>
										<button type="button" className="animated-btn px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setAddOtherOpen(false)}>
											Cancel
									</button>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Item Name</label>
											<input value={otherItemName} onChange={(e) => setOtherItemName(e.target.value)} placeholder="Item name" className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium" />
										</div>
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Type</label>
											<input
												value={otherType}
												onChange={(e) => setOtherType(e.target.value)}
												placeholder="Enter a custom type"
												autoComplete="off"
												spellCheck={false}
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Days Before Expiry</label>
											<input
												type="text"
												inputMode="numeric"
												pattern="[0-9]*"
												value={otherDaysBeforeInput}
												onChange={(e) => {
													const next = e.target.value;
													if (next === "" || /^\d+$/.test(next)) setOtherDaysBeforeInput(next);
												}}
												onBlur={() => {
													const trimmed = otherDaysBeforeInput.trim();
													if (!trimmed) {
														setOtherDaysBeforeInput("30");
														return;
													}
													const n = Number(trimmed);
													if (!Number.isFinite(n)) {
														setOtherDaysBeforeInput("30");
														return;
													}
													const clamped = Math.min(365, Math.max(1, Math.trunc(n)));
													setOtherDaysBeforeInput(String(clamped));
												}}
												placeholder="30"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Expiration Date</label>
											<input type="date" value={otherExpiresOn} onChange={(e) => setOtherExpiresOn(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium" />
										</div>
										<div className="md:col-span-2">
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Recipient Email (Optional)</label>
											<input value={otherRecipientEmail} onChange={(e) => setOtherRecipientEmail(e.target.value)} placeholder="recipient@example.com" className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium" />
										</div>
									</div>

									<div className="mt-3">
										<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Notes (Optional)</label>
										<input value={otherNotes} onChange={(e) => setOtherNotes(e.target.value)} placeholder="Notes" className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium" />
									</div>

									<div className="mt-5 flex items-center justify-end gap-2">
										<button type="button" className="animated-btn px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setAddOtherOpen(false)}>
											Close
										</button>
										<button
											type="button"
											onClick={() => void addOtherExpiration()}
											disabled={otherSaving}
											className="animated-btn px-5 py-2 rounded-xl bg-slate-900 text-white font-extrabold text-xs disabled:opacity-50 hover:bg-slate-800 shadow-sm"
										>
											{otherSaving ? "Adding…" : "Add Expiration Item"}
										</button>
									</div>
										</div>
									</div>,
									document.body
								)
							: null}

						{/* Modal Portal: Edit Other Expiration */}
						{editingOtherId !== null && canUsePortal
							? createPortal(
									<div className={centeredModalOverlayClass} onClick={() => setEditingOtherId(null)}>
										<div className={`${floatingModalCardClass} max-w-2xl`} onClick={(e) => e.stopPropagation()}>
									<div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
										<div>
											<div className="text-lg font-extrabold text-slate-900">Edit Expiration Item</div>
											<div className="text-xs font-medium text-slate-500">Update item details, reminder lead days, and recipient.</div>
										</div>
										<button type="button" className="animated-btn px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setEditingOtherId(null)}>
											Cancel
										</button>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Item Name</label>
											<input
												value={editOtherItemName}
												onChange={(e) => setEditOtherItemName(e.target.value)}
												placeholder="Item name"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Type</label>
											<input
												value={editOtherType}
												onChange={(e) => setEditOtherType(e.target.value)}
												placeholder="Enter a custom type"
												autoComplete="off"
												spellCheck={false}
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Days Before Expiry</label>
											<input
												type="text"
												inputMode="numeric"
												pattern="[0-9]*"
												value={editOtherDaysBeforeInput}
												onChange={(e) => {
													const next = e.target.value;
													if (next === "" || /^\d+$/.test(next)) setEditOtherDaysBeforeInput(next);
												}}
												onBlur={() => {
													const trimmed = editOtherDaysBeforeInput.trim();
													if (!trimmed) {
														setEditOtherDaysBeforeInput("30");
														return;
													}
													const n = Number(trimmed);
													if (!Number.isFinite(n)) {
														setEditOtherDaysBeforeInput("30");
														return;
													}
													const clamped = Math.min(365, Math.max(1, Math.trunc(n)));
													setEditOtherDaysBeforeInput(String(clamped));
												}}
												placeholder="30"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
										<div>
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Expiration Date</label>
											<input
												type="date"
												value={editOtherExpiresOn}
												onChange={(e) => setEditOtherExpiresOn(e.target.value)}
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
										<div className="md:col-span-2">
											<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Recipient Email (Optional)</label>
											<input
												value={editOtherRecipientEmail}
												onChange={(e) => setEditOtherRecipientEmail(e.target.value)}
												placeholder="recipient@example.com"
												className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
											/>
										</div>
									</div>

									<div className="mt-3">
										<label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Notes (Optional)</label>
										<input
											value={editOtherNotes}
											onChange={(e) => setEditOtherNotes(e.target.value)}
											placeholder="Notes"
											className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 font-medium"
										/>
									</div>

									<label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 pt-2">
										<input
											type="checkbox"
											checked={editOtherActive}
											onChange={(e) => setEditOtherActive(e.target.checked)}
											className="h-4 w-4 rounded border-slate-300 text-[#8B1C1C]"
										/>
										Active
									</label>

									<div className="mt-5 flex items-center justify-end gap-2">
										<button type="button" className="animated-btn px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50" onClick={() => setEditingOtherId(null)}>
											Close
										</button>
										<button
											type="button"
											onClick={() => void saveOtherEdit()}
											disabled={otherSaving}
											className="animated-btn px-5 py-2 rounded-xl bg-slate-900 text-white font-extrabold text-xs disabled:opacity-50 hover:bg-slate-800 shadow-sm"
										>
											{otherSaving ? "Saving..." : "Save Changes"}
										</button>
									</div>
										</div>
									</div>,
									document.body
								)
							: null}
					</div>

				</div>
			)}
		</section>
	);
}

