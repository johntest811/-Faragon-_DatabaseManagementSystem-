import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.90.1";
import nodemailer from "npm:nodemailer@8.0.5";

type NotificationEmailSettingsRow = {
  id: string;
  provider: "gmail";
  gmail_user: string;
  from_email: string;
  gmail_app_password: string | null;
  is_active: boolean;
  notes: string | null;
};

type NotificationPreferencesRow = {
  id?: string;
  is_enabled?: boolean;
  send_to_employees?: boolean;
  use_supabase_email_sender?: boolean;
  include_expired?: boolean;
  expired_within_days?: number;
  days_before_expiry?: number;
  include_driver_license?: boolean;
  include_security_license?: boolean;
  include_insurance?: boolean;
  use_scheduled_send?: boolean;
  send_time_local?: string | null;
  timezone?: string | null;
};

type WorkerSettingsRow = {
  setting_key: string;
  worker_url: string;
  worker_secret: string;
  is_enabled: boolean;
  updated_at?: string | null;
};

type NotificationConfig = {
  email: NotificationEmailSettingsRow | null;
  preferences: NotificationPreferencesRow;
  recipients: string[];
};

type LicensureMailItem = {
  applicant_id: string;
  license_type: string;
  expires_on: string;
  days_until_expiry: number | null;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  extn_name?: string | null;
  client_email: string | null;
  client_contact_num?: string | null;
};

type OtherMailItem = {
  other_expiration_item_id: number;
  item_name: string;
  expiration_type: string;
  license_type: string;
  expires_on: string;
  days_until_expiry: number | null;
  days_before_expiry: number;
  recipient_email: string | null;
};

type MailRow = {
  record_name: string;
  license_type: string;
  expires_on: string;
  days_until_expiry: number | null;
};

type QueuedNotification =
  | { kind: "licensure"; item: LicensureMailItem }
  | { kind: "other"; item: OtherMailItem };

type RunSummary = {
  sent: number;
  failed: number;
  skipped: number;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_DAYS_BEFORE_EXPIRY = 30;
const DEFAULT_EXPIRED_WITHIN_DAYS = 7;
const DEFAULT_SEND_TIME = "08:00";
const DEFAULT_TIMEZONE = "Asia/Manila";
const DEFAULT_NOTICE_SUBJECT = "NOTICE: LICENSE EXPIRATION ALERT ({count})";
const DEFAULT_NOTICE_BODY =
  "<div><b>To all concerned,</b></div><div>This serves as a formal notice that the records listed below are nearing expiration.</div><div>Please review each item and coordinate the appropriate renewal action before the listed date.</div><div>If renewal has already been completed, you may disregard this message.</div>";
const PARALLEL_SUPABASE_QUERY_CONCURRENCY = 4;
const SMTP_SEND_CONCURRENCY = 3;

let adminClient: SupabaseClient | null = null;

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function clampInt(
  value: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number },
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const intValue = Math.trunc(numeric);
  if (intValue < min) return min;
  if (intValue > max) return max;
  return intValue;
}

function chunkArray<T>(values: T[], chunkSize: number) {
  const size = Math.max(1, Number(chunkSize) || 1);
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 1,
) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [] as R[];

  const results = new Array<R>(list.length);
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      results[index] = await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function extractErrorMessageText(errorLike: unknown) {
  if (!errorLike) return "";
  if (typeof errorLike === "string") return errorLike;

  if (typeof errorLike === "object") {
    const err = errorLike as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      cause?: { message?: unknown } | unknown;
    };

    const cause =
      err.cause && typeof err.cause === "object"
        ? safeText((err.cause as { message?: unknown }).message)
        : safeText(err.cause);

    return [
      safeText(err.message),
      safeText(err.details),
      safeText(err.hint),
      safeText(err.code),
      cause,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  return safeText(errorLike);
}

function isMissingColumnMessage(message: string, columnName: string) {
  const text = safeText(message).toLowerCase();
  const column = safeText(columnName).toLowerCase();
  return Boolean(text) && Boolean(column) && text.includes(column) && text.includes("column");
}

function isMissingTableMessage(message: string, tableName: string) {
  const text = safeText(message).toLowerCase();
  const table = safeText(tableName).toLowerCase();
  return (
    Boolean(text) &&
    Boolean(table) &&
    text.includes(table) &&
    (text.includes("relation") || text.includes("table"))
  );
}

function isMissingFunctionMessage(message: string, functionName: string) {
  const text = safeText(message).toLowerCase();
  const fn = safeText(functionName).toLowerCase();
  return Boolean(text) && Boolean(fn) && text.includes(fn) && text.includes("function");
}

function getAdminClient() {
  if (adminClient) return adminClient;

  const url = safeText(Deno.env.get("SUPABASE_URL")) || safeText(Deno.env.get("NEXT_PUBLIC_SUPABASE_URL"));
  const serviceRoleKey = safeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

function parseYmd(value: unknown) {
  const raw = safeText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;

  const dayIndex = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  return { raw, year, month, day, dayIndex };
}

function ymd(value: unknown) {
  if (!value) return null;
  const parsed = parseYmd(value);
  if (parsed) return parsed.raw;

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getZonedNowParts(timeZone: string, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeText(timeZone) || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const partMap = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const year = Number(partMap.year);
  const month = Number(partMap.month);
  const day = Number(partMap.day);
  const hour = Number(partMap.hour);
  const minute = Number(partMap.minute);
  const second = Number(partMap.second);
  const ymdValue = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayIndex = Math.floor(Date.UTC(year, month - 1, day) / 86400000);

  return { year, month, day, hour, minute, second, ymd: ymdValue, dayIndex };
}

function daysUntil(dateYmd: string | null, timeZone = DEFAULT_TIMEZONE, now = new Date()) {
  const target = parseYmd(dateYmd);
  if (!target) return null;

  const current = getZonedNowParts(timeZone, now);
  return target.dayIndex - current.dayIndex;
}

function parseLocalSendTime(input: unknown, fallback = DEFAULT_SEND_TIME) {
  const raw = safeText(input).slice(0, 5) || fallback;
  const [hhRaw, mmRaw] = raw.split(":");
  const hh = clampInt(hhRaw, { min: 0, max: 23, fallback: 8 });
  const mm = clampInt(mmRaw, { min: 0, max: 59, fallback: 0 });
  return {
    hh,
    mm,
    raw: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
  };
}

function isEligibleToSendNow(args: {
  expiresOnYmd: string | null;
  daysBefore: number;
  sendTimeLocal: string | null;
  timeZone: string;
  includeExpired: boolean;
  expiredWithinDays: number;
  now?: Date;
}) {
  const target = parseYmd(args.expiresOnYmd);
  if (!target) return false;

  const now = args.now ?? new Date();
  const current = getZonedNowParts(args.timeZone || DEFAULT_TIMEZONE, now);
  const daysUntilExpiry = target.dayIndex - current.dayIndex;

  if (daysUntilExpiry > args.daysBefore) return false;

  if (daysUntilExpiry < 0) {
    return args.includeExpired && Math.abs(daysUntilExpiry) <= args.expiredWithinDays;
  }

  const dueDayIndex = target.dayIndex - args.daysBefore;
  if (current.dayIndex < dueDayIndex) return false;

  if (current.dayIndex === dueDayIndex && safeText(args.sendTimeLocal)) {
    const { hh, mm } = parseLocalSendTime(args.sendTimeLocal);
    if (current.hour < hh) return false;
    if (current.hour === hh && current.minute < mm) return false;
  }

  return true;
}

function escapeHtml(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeEmailBodyHtml(inputHtml: unknown) {
  let html = String(inputHtml ?? "");

  html = html.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  html = html.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "");
  html = html.replace(/<\s*(iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(iframe|object|embed)[^>]*\/\s*>/gi, "");
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"');
  html = html.replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");

  return html;
}

function parseEmailTemplateNotes(notes: unknown) {
  if (notes && typeof notes === "object") {
    const obj = notes as { subject?: unknown; bodyHtml?: unknown };
    return {
      subject: safeText(obj.subject) || null,
      bodyHtml: safeText(obj.bodyHtml) || null,
      legacyMessage: null as string | null,
    };
  }

  const raw = safeText(notes);
  if (!raw) {
    return {
      subject: DEFAULT_NOTICE_SUBJECT,
      bodyHtml: DEFAULT_NOTICE_BODY,
      legacyMessage: null,
    };
  }

  try {
    let parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed) as unknown;
      } catch {
        // ignore legacy double-stringified payloads
      }
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as { subject?: unknown; bodyHtml?: unknown };
      return {
        subject: safeText(obj.subject) || DEFAULT_NOTICE_SUBJECT,
        bodyHtml: safeText(obj.bodyHtml) || DEFAULT_NOTICE_BODY,
        legacyMessage: null as string | null,
      };
    }
  } catch {
    // legacy plain-text body
  }

  return {
    subject: DEFAULT_NOTICE_SUBJECT,
    bodyHtml: null,
    legacyMessage: raw,
  };
}

function computeEmailSubject(templateSubject: string | null | undefined, itemsCount: number) {
  const subject = safeText(templateSubject) || DEFAULT_NOTICE_SUBJECT;
  return subject.replaceAll("{count}", String(itemsCount));
}

function normalizeOtherExpirationType(value: unknown) {
  const raw = safeText(value);
  if (!raw) return "OTHER_RECORD";
  if (!/^[A-Z0-9]+(?:[_-][A-Z0-9]+)+$/.test(raw)) return raw;

  return (
    raw
      .replace(/[\s\-\/]+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase() || "OTHER_RECORD"
  );
}

function prettyExpirationType(value: unknown) {
  const raw = safeText(value);
  if (!raw) return "Other Record";
  if (raw === "CAR_INSURANCE_POLICY_TERM") return "Policy Term";
  if (raw === "CAR_INSURANCE_REGISTRATION") return "Car Registration Date";
  if (/^[A-Z0-9]+(?:[_-][A-Z0-9]+)+$/.test(raw)) return raw.replace(/[_-]+/g, " ");
  return raw;
}

function displayNameFromLicensureRow(row: Partial<LicensureMailItem>) {
  const parts = [row.first_name, row.middle_name, row.last_name, row.extn_name]
    .map((part) => safeText(part))
    .filter(Boolean);
  return parts.join(" ") || "Record";
}

function renderEmailHtml(args: {
  subject: string;
  recipientName: string | null;
  items: MailRow[];
  bodyHtml: string | null;
  legacyMessage: string | null;
}) {
  const companyName = "Faragon Security Agency Inc.";
  const heading = safeText(args.subject) || "NOTICE: LICENSE EXPIRATION ALERT";
  const recipientName = safeText(args.recipientName);
  const safeBody = safeText(args.bodyHtml) ? sanitizeEmailBodyHtml(args.bodyHtml) : "";
  const legacyMessage = safeText(args.legacyMessage);
  const itemCount = Array.isArray(args.items) ? args.items.length : 0;
  const itemSummary =
    itemCount === 1 ? "1 record requires immediate attention." : `${itemCount} records require immediate attention.`;

  function formatDays(value: number | null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "Review pending";
    if (numeric < 0) {
      const abs = Math.abs(numeric);
      return `Expired ${abs} day${abs === 1 ? "" : "s"} ago`;
    }
    if (numeric === 0) return "Due today";
    return `Due in ${numeric} day${numeric === 1 ? "" : "s"}`;
  }

  const rows = args.items
    .map((item) => {
      const statusLabel = formatDays(item.days_until_expiry);
      const numericDays = Number(item.days_until_expiry);
      const statusStyle =
        Number.isFinite(numericDays) && numericDays < 0
          ? "background:#fee2e2;color:#991b1b;"
          : Number.isFinite(numericDays) && numericDays <= 7
            ? "background:#fef3c7;color:#92400e;"
            : "background:#dcfce7;color:#166534;";

      return `
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(item.record_name)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;">${escapeHtml(item.license_type)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;">${escapeHtml(item.expires_on)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:120px;padding:6px 10px;border-radius:999px;font-weight:700;${statusStyle}">${escapeHtml(statusLabel)}</span></td>
        </tr>`;
    })
    .join("");

  const bodyMarkup = safeBody
    ? `<div style="color:#334155;font-size:14px;line-height:1.7;">${safeBody}</div>`
    : legacyMessage
      ? `<div style="color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(legacyMessage)}</div>`
      : `<div style="color:#334155;font-size:14px;line-height:1.7;">${DEFAULT_NOTICE_BODY}</div>`;

  const greeting = recipientName
    ? `<div style="margin-bottom:12px;color:#0f172a;font-size:14px;">Dear ${escapeHtml(recipientName)},</div>`
    : `<div style="margin-bottom:12px;color:#0f172a;font-size:14px;">To all concerned,</div>`;

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(heading)}</title>
    </head>
    <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.08);">
        <div style="padding:28px 28px 22px;background:linear-gradient(135deg,#8b1c1c 0%,#111827 100%);color:#ffffff;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,0.14);font-size:24px;font-weight:800;letter-spacing:0.08em;">F</div>
            <div>
              <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.75;">Automated Notification</div>
              <div style="margin-top:4px;font-size:24px;font-weight:800;line-height:1.2;">${escapeHtml(heading)}</div>
            </div>
          </div>
          <div style="margin-top:18px;font-size:14px;line-height:1.6;max-width:620px;opacity:0.92;">${escapeHtml(itemSummary)}</div>
        </div>

        <div style="padding:26px 28px 30px;">
          ${greeting}
          ${bodyMarkup}

          <div style="margin-top:20px;padding:14px 16px;border-radius:18px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-size:13px;line-height:1.6;">
            Reminder window generated by ${escapeHtml(companyName)}. Please coordinate renewals before the listed expiration dates.
          </div>

          <div style="margin-top:20px;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;">
            <div style="padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
              Records
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;">
              <thead>
                <tr style="background:#fff8cc;color:#0f172a;">
                  <th align="left" style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">Account / Record</th>
                  <th align="left" style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">Type</th>
                  <th align="left" style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">Expires On</th>
                  <th align="left" style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">Status</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="4" style="padding:16px 10px;color:#6b7280;">No records to display.</td></tr>`}</tbody>
            </table>
          </div>

          <div style="margin-top:18px;color:#64748b;font-size:12px;line-height:1.6;">This is an automated message from ${escapeHtml(companyName)}. Replies may not be monitored.</div>
        </div>
      </div>
    </body>
  </html>`;
}

function normalizeRecipients(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => safeText(value).toLowerCase())
        .filter(Boolean),
    ),
  );
}

async function loadConfiguredRecipientEmails(admin: SupabaseClient) {
  try {
    const res = await admin
      .from("notification_recipients")
      .select("email")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (res.error) throw res.error;
    return normalizeRecipients(((res.data ?? []) as Array<{ email?: string | null }>).map((row) => row.email ?? ""));
  } catch (errorLike) {
    const message = extractErrorMessageText(errorLike);
    if (isMissingTableMessage(message, "notification_recipients")) {
      return [];
    }
    throw errorLike;
  }
}

async function loadNotificationConfig(admin: SupabaseClient): Promise<NotificationConfig> {
  const [emailRes, recipients] = await Promise.all([
    admin
      .from("notification_email_settings")
      .select("id, provider, gmail_user, from_email, gmail_app_password, is_active, notes")
      .eq("provider", "gmail")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadConfiguredRecipientEmails(admin),
  ]);

  if (emailRes.error) throw emailRes.error;

  let prefRes = await admin
    .from("notification_preferences")
    .select(
      "id, is_enabled, send_to_employees, use_supabase_email_sender, include_expired, expired_within_days, days_before_expiry, include_driver_license, include_security_license, include_insurance, use_scheduled_send, send_time_local, timezone",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prefRes.error) {
    const message = extractErrorMessageText(prefRes.error);
    if (
      isMissingColumnMessage(message, "send_to_employees") ||
      isMissingColumnMessage(message, "use_supabase_email_sender") ||
      isMissingColumnMessage(message, "include_expired") ||
      isMissingColumnMessage(message, "expired_within_days")
    ) {
      prefRes = await admin
        .from("notification_preferences")
        .select(
          "id, is_enabled, days_before_expiry, include_driver_license, include_security_license, include_insurance, use_scheduled_send, send_time_local, timezone",
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }
  }

  if (prefRes.error) throw prefRes.error;

  const prefRow = {
    is_enabled: true,
    send_to_employees: true,
    use_supabase_email_sender: false,
    include_expired: false,
    expired_within_days: DEFAULT_EXPIRED_WITHIN_DAYS,
    days_before_expiry: DEFAULT_DAYS_BEFORE_EXPIRY,
    include_driver_license: false,
    include_security_license: true,
    include_insurance: false,
    use_scheduled_send: true,
    send_time_local: DEFAULT_SEND_TIME,
    timezone: DEFAULT_TIMEZONE,
    ...(prefRes.data ?? {}),
  } satisfies NotificationPreferencesRow;

  return {
    email: (emailRes.data as NotificationEmailSettingsRow | null) ?? null,
    preferences: prefRow,
    recipients,
  };
}

async function fetchExpiringRows(
  admin: SupabaseClient,
  preferences: NotificationPreferencesRow,
  limit?: number,
) {
  const daysBefore = clampInt(preferences.days_before_expiry, {
    min: 1,
    max: 365,
    fallback: DEFAULT_DAYS_BEFORE_EXPIRY,
  });
  const includeExpired = Boolean(preferences.include_expired);
  const expiredWithinDays = clampInt(preferences.expired_within_days, {
    min: 1,
    max: 365,
    fallback: DEFAULT_EXPIRED_WITHIN_DAYS,
  });
  const timeZone = safeText(preferences.timezone) || DEFAULT_TIMEZONE;

  const licensureRes = await admin
    .from("licensure")
    .select("applicant_id, driver_expiration, security_expiration, insurance_expiration")
    .limit(10000);
  if (licensureRes.error) throw licensureRes.error;

  const licensureRows = licensureRes.data ?? [];
  const applicantIds = Array.from(new Set(licensureRows.map((row) => row.applicant_id).filter(Boolean)));

  const applicantsById = new Map<string, JsonRecord>();
  const applicantChunks = chunkArray(applicantIds, 500);
  const applicantRowsByChunk = await mapWithConcurrency(
    applicantChunks,
    async (chunk) => {
      const applicantRes = await admin
        .from("applicants")
        .select("applicant_id, first_name, middle_name, last_name, extn_name, client_email, client_contact_num, status, is_archived")
        .in("applicant_id", chunk);
      if (applicantRes.error) throw applicantRes.error;
      return applicantRes.data ?? [];
    },
    PARALLEL_SUPABASE_QUERY_CONCURRENCY,
  );

  for (const rows of applicantRowsByChunk) {
    for (const applicant of rows ?? []) {
      applicantsById.set(String(applicant.applicant_id), applicant as JsonRecord);
    }
  }

  const includeDriver = Boolean(preferences.include_driver_license);
  const includeSecurity = Boolean(preferences.include_security_license);
  const includeInsurance = Boolean(preferences.include_insurance);
  const out: LicensureMailItem[] = [];

  for (const row of licensureRows) {
    const applicant = applicantsById.get(String(row.applicant_id));
    if (!applicant) continue;

    const normalizedStatus = safeText(applicant.status).toUpperCase();
    if (applicant.is_archived === true || normalizedStatus === "RETIRED") {
      continue;
    }

    const base = {
      applicant_id: String(row.applicant_id),
      first_name: (applicant.first_name as string | null) ?? null,
      middle_name: (applicant.middle_name as string | null) ?? null,
      last_name: (applicant.last_name as string | null) ?? null,
      extn_name: (applicant.extn_name as string | null) ?? null,
      client_email: ((applicant.client_email as string | null) ?? null),
      client_contact_num: ((applicant.client_contact_num as string | null) ?? null),
    };

    function pushIfEligible(licenseType: string, dateValue: unknown) {
      const expiresOn = ymd(dateValue);
      const until = daysUntil(expiresOn, timeZone);
      if (until === null) return;
      const isInWindow =
        (until >= 0 && until <= daysBefore) ||
        (includeExpired && until < 0 && Math.abs(until) <= expiredWithinDays);
      if (!expiresOn || !isInWindow) return;
      out.push({ ...base, expires_on: expiresOn, license_type: licenseType, days_until_expiry: until });
    }

    if (includeDriver) pushIfEligible("DRIVER_LICENSE", row.driver_expiration);
    if (includeSecurity) pushIfEligible("SECURITY_LICENSE", row.security_expiration);
    if (includeInsurance) pushIfEligible("INSURANCE", row.insurance_expiration);
  }

  out.sort((left, right) => (left.days_until_expiry ?? 9999) - (right.days_until_expiry ?? 9999));
  return typeof limit === "number" ? out.slice(0, limit) : out;
}

async function fetchOtherExpiringRows(
  admin: SupabaseClient,
  preferences: NotificationPreferencesRow,
  limit?: number,
) {
  const fallbackDaysBefore = clampInt(preferences.days_before_expiry, {
    min: 1,
    max: 365,
    fallback: DEFAULT_DAYS_BEFORE_EXPIRY,
  });
  const includeExpired = Boolean(preferences.include_expired);
  const expiredWithinDays = clampInt(preferences.expired_within_days, {
    min: 1,
    max: 365,
    fallback: DEFAULT_EXPIRED_WITHIN_DAYS,
  });
  const timeZone = safeText(preferences.timezone) || DEFAULT_TIMEZONE;

  let otherRes = await admin
    .from("other_expiration_items")
    .select("id, item_name, expiration_type, expires_on, car_registration_to_date, days_before_expiry, recipient_email, is_active")
    .eq("is_active", true)
    .limit(10000);

  if (otherRes.error) {
    const message = extractErrorMessageText(otherRes.error);
    if (isMissingTableMessage(message, "other_expiration_items")) {
      return [];
    }
    if (
      isMissingColumnMessage(message, "days_before_expiry") ||
      isMissingColumnMessage(message, "car_registration_to_date")
    ) {
      otherRes = await admin
        .from("other_expiration_items")
        .select("id, item_name, expiration_type, expires_on, recipient_email, is_active")
        .eq("is_active", true)
        .limit(10000);
    }
  }

  if (otherRes.error) throw otherRes.error;

  const out: OtherMailItem[] = [];

  for (const row of otherRes.data ?? []) {
    const daysBefore = clampInt((row as { days_before_expiry?: number | null }).days_before_expiry, {
      min: 1,
      max: 365,
      fallback: fallbackDaysBefore,
    });

    const normalizedType = normalizeOtherExpirationType(row.expiration_type);
    const expiryCandidates =
      normalizedType === "CAR_INSURANCE"
        ? [
            { expiration_type: "CAR_INSURANCE_POLICY_TERM", expires_on: ymd(row.expires_on) },
            {
              expiration_type: "CAR_INSURANCE_REGISTRATION",
              expires_on: ymd((row as { car_registration_to_date?: unknown }).car_registration_to_date),
            },
          ]
        : [{ expiration_type: normalizedType, expires_on: ymd(row.expires_on) }];

    for (const candidate of expiryCandidates) {
      const until = daysUntil(candidate.expires_on, timeZone);
      if (until === null) continue;

      const isInWindow =
        (until >= 0 && until <= daysBefore) ||
        (includeExpired && until < 0 && Math.abs(until) <= expiredWithinDays);

      if (!candidate.expires_on || !isInWindow) continue;

      out.push({
        other_expiration_item_id: Number(row.id),
        item_name: safeText(row.item_name) || "Other Record",
        expiration_type: candidate.expiration_type,
        license_type: `OTHER: ${prettyExpirationType(candidate.expiration_type)}`,
        expires_on: candidate.expires_on,
        days_until_expiry: until,
        days_before_expiry: daysBefore,
        recipient_email: safeText(row.recipient_email).toLowerCase() || null,
      });
    }
  }

  out.sort((left, right) => (left.days_until_expiry ?? 9999) - (right.days_until_expiry ?? 9999));
  return typeof limit === "number" ? out.slice(0, limit) : out;
}

function buildLicensureNoticeKey(item: Partial<LicensureMailItem>, recipientEmail: string | null = null) {
  return [
    safeText(item.applicant_id),
    safeText(item.license_type),
    safeText(item.expires_on),
    safeText(recipientEmail).toLowerCase(),
  ].join("|");
}

function buildOtherExpirationNoticeKey(item: Partial<OtherMailItem>, recipientEmail: string | null = null) {
  return [
    safeText(item.other_expiration_item_id),
    safeText(item.expiration_type),
    safeText(item.expires_on),
    safeText(recipientEmail).toLowerCase(),
  ].join("|");
}

type RangeQueryResult<T> = {
  data: T[] | null;
  error: unknown;
};

type RangeCapableQuery<T> = {
  range: (from: number, to: number) => Promise<RangeQueryResult<T>>;
};

async function fetchPagedRows<T>(
  buildQuery: () => RangeCapableQuery<T>,
  { pageSize = 1000, maxRows = 50000 }: { pageSize?: number; maxRows?: number } = {},
) {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const res = await buildQuery().range(offset, offset + pageSize - 1);
    if (res.error) throw res.error;

    const batch = Array.isArray(res.data) ? res.data : [];
    if (!batch.length) break;

    rows.push(...batch);
    offset += batch.length;

    if (batch.length < pageSize) break;
    if (offset >= maxRows) {
      throw new Error(`Query exceeded ${maxRows} rows while loading notification log history.`);
    }
  }

  return rows;
}

async function loadSentLicensureNoticeKeys(admin: SupabaseClient, items: LicensureMailItem[]) {
  const applicantIds = Array.from(new Set(items.map((item) => safeText(item.applicant_id)).filter(Boolean)));
  if (!applicantIds.length) return new Set<string>();

  try {
    const chunks = chunkArray(applicantIds, 200);
    const rowsByChunk = await mapWithConcurrency(
      chunks,
      async (chunk) =>
        fetchPagedRows<{ applicant_id: string; license_type: string; expires_on: string; recipient_email: string | null }>(
          () =>
            admin
              .from("licensure_notification_log")
              .select("applicant_id, license_type, expires_on, recipient_email")
              .eq("status", "SENT")
              .in("applicant_id", chunk) as unknown as RangeCapableQuery<{
                applicant_id: string;
                license_type: string;
                expires_on: string;
                recipient_email: string | null;
              }>,
        ),
      PARALLEL_SUPABASE_QUERY_CONCURRENCY,
    );

    const sentKeys = new Set<string>();
    for (const rows of rowsByChunk) {
      for (const row of rows ?? []) {
        sentKeys.add(
          buildLicensureNoticeKey(
            {
              applicant_id: row.applicant_id,
              license_type: row.license_type,
              expires_on: row.expires_on,
            },
            row.recipient_email,
          ),
        );
      }
    }

    return sentKeys;
  } catch (errorLike) {
    const message = extractErrorMessageText(errorLike);
    if (isMissingTableMessage(message, "licensure_notification_log")) {
      return new Set<string>();
    }
    console.error("[notification-worker] failed to load sent licensure keys:", message);
    return new Set<string>();
  }
}

async function loadSentOtherExpirationNoticeKeys(admin: SupabaseClient, items: OtherMailItem[]) {
  const itemIds = Array.from(
    new Set(items.map((item) => Number(item.other_expiration_item_id)).filter((value) => Number.isFinite(value))),
  );
  if (!itemIds.length) return new Set<string>();

  try {
    const chunks = chunkArray(itemIds, 200);
    const rowsByChunk = await mapWithConcurrency(
      chunks,
      async (chunk) =>
        fetchPagedRows<{ other_expiration_item_id: number; expiration_type: string; expires_on: string; recipient_email: string | null }>(
          () =>
            admin
              .from("other_expiration_notification_log")
              .select("other_expiration_item_id, expiration_type, expires_on, recipient_email")
              .eq("status", "SENT")
              .in("other_expiration_item_id", chunk) as unknown as RangeCapableQuery<{
                other_expiration_item_id: number;
                expiration_type: string;
                expires_on: string;
                recipient_email: string | null;
              }>,
        ),
      PARALLEL_SUPABASE_QUERY_CONCURRENCY,
    );

    const sentKeys = new Set<string>();
    for (const rows of rowsByChunk) {
      for (const row of rows ?? []) {
        sentKeys.add(
          buildOtherExpirationNoticeKey(
            {
              other_expiration_item_id: row.other_expiration_item_id,
              expiration_type: row.expiration_type,
              expires_on: row.expires_on,
            },
            row.recipient_email,
          ),
        );
      }
    }

    return sentKeys;
  } catch (errorLike) {
    const message = extractErrorMessageText(errorLike);
    if (isMissingTableMessage(message, "other_expiration_notification_log")) {
      return new Set<string>();
    }
    console.error("[notification-worker] failed to load sent other-expiration keys:", message);
    return new Set<string>();
  }
}

async function insertLicensureNotificationLog(
  admin: SupabaseClient,
  payload: {
    applicant_id: string;
    license_type: string;
    expires_on: string;
    recipient_email: string | null;
    status: string;
    error_message: string | null;
  },
) {
  const insertRes = await admin.from("licensure_notification_log").insert(payload);
  if (insertRes.error) {
    console.error("[notification-worker] failed to insert licensure log:", extractErrorMessageText(insertRes.error));
  }
}

async function insertOtherExpirationNotificationLog(
  admin: SupabaseClient,
  payload: {
    other_expiration_item_id: number;
    item_name: string;
    expiration_type: string;
    expires_on: string;
    recipient_email: string | null;
    status: string;
    error_message: string | null;
  },
) {
  const insertRes = await admin.from("other_expiration_notification_log").insert(payload);
  if (insertRes.error) {
    console.error("[notification-worker] failed to insert other-expiration log:", extractErrorMessageText(insertRes.error));
  }
}

async function logQueuedNotificationStatus(
  admin: SupabaseClient,
  queued: QueuedNotification,
  recipientEmail: string | null,
  status: "SENT" | "FAILED" | "SKIPPED",
  errorMessage: string | null,
) {
  if (queued.kind === "other") {
    await insertOtherExpirationNotificationLog(admin, {
      other_expiration_item_id: queued.item.other_expiration_item_id,
      item_name: queued.item.item_name,
      expiration_type: queued.item.expiration_type,
      expires_on: queued.item.expires_on,
      recipient_email: recipientEmail,
      status,
      error_message: errorMessage,
    });
    return;
  }

  await insertLicensureNotificationLog(admin, {
    applicant_id: queued.item.applicant_id,
    license_type: queued.item.license_type,
    expires_on: queued.item.expires_on,
    recipient_email: recipientEmail,
    status,
    error_message: errorMessage,
  });
}

function pushRecipientBucket(
  byRecipient: Map<string, { items: QueuedNotification[] }>,
  recipientEmail: string | null,
  nextItem: QueuedNotification,
) {
  const to = safeText(recipientEmail).toLowerCase();
  if (!to) return false;

  const existing = byRecipient.get(to);
  if (existing) {
    existing.items.push(nextItem);
    return true;
  }

  byRecipient.set(to, { items: [nextItem] });
  return true;
}

function toMailRowFromQueuedItem(queuedItem: QueuedNotification): MailRow {
  if (queuedItem.kind === "other") {
    return {
      record_name: safeText(queuedItem.item.item_name) || "Other Record",
      license_type: safeText(queuedItem.item.license_type) || "OTHER RECORD",
      expires_on: queuedItem.item.expires_on,
      days_until_expiry: queuedItem.item.days_until_expiry,
    };
  }

  return {
    record_name: displayNameFromLicensureRow(queuedItem.item),
    license_type: safeText(queuedItem.item.license_type) || "LICENSE",
    expires_on: queuedItem.item.expires_on,
    days_until_expiry: queuedItem.item.days_until_expiry,
  };
}

function buildTransport(emailSettingsRow: NotificationEmailSettingsRow | null) {
  const user = safeText(emailSettingsRow?.gmail_user) || safeText(Deno.env.get("GMAIL_USER"));
  const pass = safeText(emailSettingsRow?.gmail_app_password) || safeText(Deno.env.get("GMAIL_PASS"));
  const from = safeText(emailSettingsRow?.from_email) || user;

  if (!user) {
    throw new Error("Missing Gmail sender email. Set GMAIL_USER in Edge Function secrets or save Gmail User in Settings.");
  }

  if (!pass) {
    throw new Error("Missing Gmail App Password. Set GMAIL_PASS in Edge Function secrets or store an app password in notification_email_settings.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  return { transporter, from };
}

async function sendQueuedNotificationBuckets(
  admin: SupabaseClient,
  byRecipient: Map<string, { items: QueuedNotification[] }>,
  transporter: Awaited<ReturnType<typeof buildTransport>>["transporter"],
  from: string,
  template: { subject: string | null; bodyHtml: string | null; legacyMessage: string | null },
) {
  const recipientEntries = Array.from(byRecipient.entries()).filter(([, bucket]) => bucket.items.length > 0);
  if (!recipientEntries.length) {
    return { sent: 0, failed: 0 };
  }

  const results = await mapWithConcurrency(
    recipientEntries,
    async ([to, bucket]) => {
      const mailRows = bucket.items.map((queued) => toMailRowFromQueuedItem(queued));
      const subject = computeEmailSubject(template.subject, mailRows.length);
      const html = renderEmailHtml({
        subject,
        recipientName: null,
        items: mailRows,
        bodyHtml: template.bodyHtml,
        legacyMessage: template.legacyMessage,
      });

      try {
        await transporter.sendMail({ from, to, subject, html });
        await Promise.all(bucket.items.map((queued) => logQueuedNotificationStatus(admin, queued, to, "SENT", null)));
        return { sent: bucket.items.length, failed: 0 };
      } catch (errorLike) {
        const errorMessage = extractErrorMessageText(errorLike) || "Failed to send Gmail notification.";
        await Promise.all(
          bucket.items.map((queued) => logQueuedNotificationStatus(admin, queued, to, "FAILED", errorMessage)),
        );
        return { sent: 0, failed: bucket.items.length };
      }
    },
    SMTP_SEND_CONCURRENCY,
  );

  return results.reduce(
    (summary, result) => ({
      sent: summary.sent + Number(result?.sent ?? 0),
      failed: summary.failed + Number(result?.failed ?? 0),
    }),
    { sent: 0, failed: 0 },
  );
}

async function executeAutomaticNotificationRun(
  admin: SupabaseClient,
  args: {
    sendAllEligible: boolean;
    requireSupabaseMode: boolean;
    maxRecipients?: number | null;
  },
) {
  const { email, preferences, recipients } = await loadNotificationConfig(admin);
  if (args.requireSupabaseMode && !preferences.use_supabase_email_sender) {
    return {
      ok: true,
      message: "Supabase background sender is disabled in notification preferences.",
      summary: { sent: 0, failed: 0, skipped: 0 } satisfies RunSummary,
    };
  }

  if (!preferences.is_enabled) {
    return {
      ok: true,
      message: "Notifications are disabled.",
      summary: { sent: 0, failed: 0, skipped: 0 } satisfies RunSummary,
    };
  }

  if (email && email.is_active === false) {
    return {
      ok: true,
      message: "Gmail sender is not active.",
      summary: { sent: 0, failed: 0, skipped: 0 } satisfies RunSummary,
    };
  }

  const timeZone = safeText(preferences.timezone) || DEFAULT_TIMEZONE;
  const daysBefore = clampInt(preferences.days_before_expiry, {
    min: 1,
    max: 365,
    fallback: DEFAULT_DAYS_BEFORE_EXPIRY,
  });
  const expiredWithinDays = clampInt(preferences.expired_within_days, {
    min: 1,
    max: 365,
    fallback: DEFAULT_EXPIRED_WITHIN_DAYS,
  });
  const sendTimeLocal =
    preferences.use_scheduled_send === false ? null : safeText(preferences.send_time_local).slice(0, 5) || DEFAULT_SEND_TIME;
  const includeExpired = Boolean(preferences.include_expired);
  const now = new Date();

  const [expiringRows, otherExpiringRows] = await Promise.all([
    fetchExpiringRows(admin, preferences),
    fetchOtherExpiringRows(admin, preferences),
  ]);

  const licensureItems = args.sendAllEligible
    ? expiringRows
    : expiringRows.filter((item) =>
        isEligibleToSendNow({
          expiresOnYmd: item.expires_on,
          daysBefore,
          sendTimeLocal,
          timeZone,
          includeExpired,
          expiredWithinDays,
          now,
        })
      );

  const otherItems = args.sendAllEligible
    ? otherExpiringRows
    : otherExpiringRows.filter((item) =>
        isEligibleToSendNow({
          expiresOnYmd: item.expires_on,
          daysBefore: clampInt(item.days_before_expiry, {
            min: 1,
            max: 365,
            fallback: daysBefore,
          }),
          sendTimeLocal,
          timeZone,
          includeExpired,
          expiredWithinDays,
          now,
        })
      );

  const [sentLicensureKeys, sentOtherKeys] = args.sendAllEligible
    ? [new Set<string>(), new Set<string>()]
    : await Promise.all([
        loadSentLicensureNoticeKeys(admin, licensureItems),
        loadSentOtherExpirationNoticeKeys(admin, otherItems),
      ]);

  const configuredRecipients = normalizeRecipients(recipients);
  const useConfiguredRecipients = configuredRecipients.length > 0;
  const sendToEmployees = preferences.send_to_employees !== false;
  const maxRecipients = clampInt(args.maxRecipients, { min: 0, max: 2000, fallback: 0 });

  const byRecipient = new Map<string, { items: QueuedNotification[] }>();
  let skipped = 0;

  function enqueue(recipientEmail: string | null, queuedItem: QueuedNotification) {
    const to = safeText(recipientEmail).toLowerCase();
    if (!to) return false;
    if (maxRecipients > 0 && !byRecipient.has(to) && byRecipient.size >= maxRecipients) return false;
    return pushRecipientBucket(byRecipient, to, queuedItem);
  }

  for (const item of licensureItems) {
    if (useConfiguredRecipients) {
      for (const recipient of configuredRecipients) {
        if (!args.sendAllEligible && sentLicensureKeys.has(buildLicensureNoticeKey(item, recipient))) continue;
        enqueue(recipient, { kind: "licensure", item });
      }
      continue;
    }

    if (!sendToEmployees) {
      await insertLicensureNotificationLog(admin, {
        applicant_id: item.applicant_id,
        license_type: item.license_type,
        expires_on: item.expires_on,
        recipient_email: null,
        status: "SKIPPED",
        error_message:
          "Employee email sending is disabled (send_to_employees=false) and no active notification recipient is configured.",
      });
      skipped += 1;
      continue;
    }

    const recipient = safeText(item.client_email).toLowerCase();
    if (!recipient) {
      await insertLicensureNotificationLog(admin, {
        applicant_id: item.applicant_id,
        license_type: item.license_type,
        expires_on: item.expires_on,
        recipient_email: null,
        status: "SKIPPED",
        error_message: "Missing recipient email (client_email) and no active notification recipient is configured.",
      });
      skipped += 1;
      continue;
    }

    if (!args.sendAllEligible && sentLicensureKeys.has(buildLicensureNoticeKey(item, recipient))) continue;

    enqueue(recipient, { kind: "licensure", item });
  }

  for (const item of otherItems) {
    const targetEmails = new Set<string>();
    if (useConfiguredRecipients) {
      for (const recipient of configuredRecipients) targetEmails.add(recipient);
    }

    const itemRecipient = safeText(item.recipient_email).toLowerCase();
    if (itemRecipient) targetEmails.add(itemRecipient);

    if (!targetEmails.size) {
      await insertOtherExpirationNotificationLog(admin, {
        other_expiration_item_id: item.other_expiration_item_id,
        item_name: item.item_name,
        expiration_type: item.expiration_type,
        expires_on: item.expires_on,
        recipient_email: null,
        status: "SKIPPED",
        error_message: "Missing recipient_email and no active notification recipient is configured.",
      });
      skipped += 1;
      continue;
    }

    for (const recipient of targetEmails) {
      if (!args.sendAllEligible && sentOtherKeys.has(buildOtherExpirationNoticeKey(item, recipient))) continue;
      enqueue(recipient, { kind: "other", item });
    }
  }

  const { transporter, from } = buildTransport(email);
  const template = parseEmailTemplateNotes(email?.notes);
  const { sent, failed } = await sendQueuedNotificationBuckets(admin, byRecipient, transporter, from, template);

  return {
    ok: true,
    message: args.sendAllEligible ? "Resend all finished." : "Run complete.",
    summary: { sent, failed, skipped } satisfies RunSummary,
  };
}

async function sendTestEmail(admin: SupabaseClient, payload: JsonRecord) {
  const { email } = await loadNotificationConfig(admin);
  const { transporter, from } = buildTransport(email);
  const template = parseEmailTemplateNotes(email?.notes);
  const to = safeText(payload.to) || from;
  if (!to) throw new Error("Missing test recipient email.");

  const subject =
    safeText(payload.subject) || computeEmailSubject(template.subject, 1) || "Test: Expiring Licensure Notifications";
  const html = renderEmailHtml({
    subject,
    recipientName: "Test",
    items: [
      {
        record_name: "Sample Record",
        license_type: "TEST",
        expires_on: ymd(new Date()) || "",
        days_until_expiry: 0,
      },
    ],
    bodyHtml: template.bodyHtml,
    legacyMessage: template.legacyMessage,
  });

  await transporter.sendMail({ from, to, subject, html });
  return { success: true, mode: "test_email", to, subject };
}

async function resendSingleLicensureNotice(admin: SupabaseClient, payload: JsonRecord) {
  const applicantId = safeText(payload.applicant_id);
  const licenseType = safeText(payload.license_type);
  const expiresOn = ymd(payload.expires_on);

  if (!applicantId || !licenseType || !expiresOn) {
    throw new Error("Missing applicant_id, license_type, or expires_on.");
  }

  const { email, preferences } = await loadNotificationConfig(admin);
  if (!preferences.is_enabled) throw new Error("Notifications are disabled.");
  if (email && email.is_active === false) throw new Error("Gmail sender is not active.");
  if (preferences.send_to_employees === false) {
    throw new Error("Sending to employee emails is disabled in Settings.");
  }

  const applicantRes = await admin
    .from("applicants")
    .select("applicant_id, first_name, middle_name, last_name, extn_name, client_email")
    .eq("applicant_id", applicantId)
    .maybeSingle();
  if (applicantRes.error) throw applicantRes.error;

  const applicant = applicantRes.data;
  if (!applicant) throw new Error("Applicant not found.");

  const to = safeText(applicant.client_email);
  if (!to) throw new Error("Missing recipient email (client_email).");

  const { transporter, from } = buildTransport(email);
  const template = parseEmailTemplateNotes(email?.notes);
  const item: LicensureMailItem = {
    applicant_id: applicantId,
    license_type: licenseType,
    expires_on: expiresOn,
    days_until_expiry: daysUntil(expiresOn, safeText(preferences.timezone) || DEFAULT_TIMEZONE),
    first_name: applicant.first_name ?? null,
    middle_name: applicant.middle_name ?? null,
    last_name: applicant.last_name ?? null,
    extn_name: applicant.extn_name ?? null,
    client_email: to,
  };

  const subject = computeEmailSubject(template.subject, 1);
  const html = renderEmailHtml({
    subject,
    recipientName: displayNameFromLicensureRow(item),
    items: [toMailRowFromQueuedItem({ kind: "licensure", item })],
    bodyHtml: template.bodyHtml,
    legacyMessage: template.legacyMessage,
  });

  try {
    await transporter.sendMail({ from, to, subject, html });
    await insertLicensureNotificationLog(admin, {
      applicant_id: applicantId,
      license_type: licenseType,
      expires_on: expiresOn,
      recipient_email: to,
      status: "SENT",
      error_message: null,
    });
  } catch (errorLike) {
    const errorMessage = extractErrorMessageText(errorLike) || "Failed to resend licensure notice.";
    await insertLicensureNotificationLog(admin, {
      applicant_id: applicantId,
      license_type: licenseType,
      expires_on: expiresOn,
      recipient_email: to,
      status: "FAILED",
      error_message: errorMessage,
    });
    throw errorLike;
  }

  return {
    success: true,
    mode: "resend_licensure_notice",
    summary: { sent: 1, failed: 0, skipped: 0 } satisfies RunSummary,
  };
}

async function loadWorkerSettings(admin: SupabaseClient) {
  const rpcRes = await admin.rpc("get_notification_worker_runtime_config", { p_setting_key: "default" });
  if (rpcRes.error) throw rpcRes.error;

  const data = Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data;
  if (!data) {
    throw new Error("Notification worker settings were not found.");
  }

  return data as WorkerSettingsRow;
}

function buildJsonResponse(status: number, payload: JsonRecord) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authorizeRequest(req: Request, admin: SupabaseClient) {
  const expectedSecret = safeText(req.headers.get("x-notification-worker-secret"));
  if (!expectedSecret) {
    return { ok: false, response: buildJsonResponse(401, { error: "Missing x-notification-worker-secret header." }) };
  }

  let workerSettings: WorkerSettingsRow;
  try {
    workerSettings = await loadWorkerSettings(admin);
  } catch (errorLike) {
    const message = extractErrorMessageText(errorLike);
    if (isMissingFunctionMessage(message, "get_notification_worker_runtime_config")) {
      return {
        ok: false,
        response: buildJsonResponse(500, {
          error:
            "Supabase SQL helper is missing. Run SQL/supabase_add_notification_worker_runtime_config_rpc.sql first.",
        }),
      };
    }

    throw errorLike;
  }

  if (!workerSettings.is_enabled) {
    return { ok: false, response: buildJsonResponse(503, { error: "Supabase background sender is disabled." }) };
  }

  if (!safeText(workerSettings.worker_secret) || safeText(workerSettings.worker_secret) !== expectedSecret) {
    return { ok: false, response: buildJsonResponse(403, { error: "Invalid notification worker secret." }) };
  }

  return { ok: true, workerSettings };
}

function normalizeMode(payload: JsonRecord) {
  const rawMode = safeText(payload.mode) || safeText(payload.task) || "send_notifications";
  const normalized = rawMode.toLowerCase();

  if (normalized === "send_notifications") return "send_notifications";
  if (normalized === "run_now") return "run_now";
  if (normalized === "resend_all") return "resend_all";
  if (normalized === "test_email") return "test_email";
  if (normalized === "resend_licensure_notice") return "resend_licensure_notice";

  throw new Error(`Unsupported notification worker mode: ${rawMode}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return buildJsonResponse(405, { error: "Method not allowed." });
  }

  const admin = getAdminClient();
  let payload: JsonRecord = {};

  try {
    const text = await req.text();
    payload = text ? (JSON.parse(text) as JsonRecord) : {};
  } catch {
    return buildJsonResponse(400, { error: "Invalid JSON payload." });
  }

  try {
    const authResult = await authorizeRequest(req, admin);
    if (!authResult.ok) return authResult.response;

    const mode = normalizeMode(payload);

    if (mode === "test_email") {
      const result = await sendTestEmail(admin, payload);
      return buildJsonResponse(200, result);
    }

    if (mode === "resend_licensure_notice") {
      const result = await resendSingleLicensureNotice(admin, payload);
      return buildJsonResponse(200, result);
    }

    if (mode === "run_now") {
      const result = await executeAutomaticNotificationRun(admin, {
        sendAllEligible: false,
        requireSupabaseMode: true,
      });
      return buildJsonResponse(200, { success: true, mode, ...result });
    }

    if (mode === "resend_all") {
      const result = await executeAutomaticNotificationRun(admin, {
        sendAllEligible: true,
        requireSupabaseMode: true,
        maxRecipients: Number(payload.maxRecipients ?? 0),
      });
      return buildJsonResponse(200, { success: true, mode, ...result });
    }

    const result = await executeAutomaticNotificationRun(admin, {
      sendAllEligible: false,
      requireSupabaseMode: true,
    });
    return buildJsonResponse(200, { success: true, mode, ...result });
  } catch (errorLike) {
    const message = extractErrorMessageText(errorLike) || "Notification worker failed.";
    console.error("[notification-worker]", message);
    return buildJsonResponse(500, { error: message });
  }
});
