const { app, BrowserWindow, protocol, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Load env vars for Electron main (dev + packaged). This keeps the service role key out of the renderer.
try {
  const dotenv = require('dotenv');
  const envLocalPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  } else {
    dotenv.config();
  }
} catch (e) {
  // dotenv is optional in runtime, but recommended.
  console.warn('[electron] dotenv not available:', e?.message ?? e);
}

function getAdminSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin operations.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeText(v) {
  return String(v ?? '').trim();
}

function clampInt(n, { min, max, fallback }) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  const i = Math.trunc(v);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function isMissingAuditLogTableMessage(msg) {
  const m = String(msg || '');
  if (!/audit_log/i.test(m)) return false;
  return (
    /relation\s+"?audit_log"?\s+does\s+not\s+exist/i.test(m) ||
    /could\s+not\s+find\s+the\s+table\s+'public\.audit_log'\s+in\s+the\s+schema\s+cache/i.test(m) ||
    /PGRST205/i.test(m)
  );
}

function isMissingTableMessage(msg, tableName) {
  const m = String(msg || '');
  const t = String(tableName || '').trim();
  if (!t) return false;
  const tl = t.toLowerCase();
  const ml = m.toLowerCase();
  if (!ml.includes(tl)) return false;
  return (
    /does\s+not\s+exist/i.test(m) ||
    /could\s+not\s+find\s+the\s+table/i.test(m) ||
    /schema\s+cache/i.test(m) ||
    /PGRST205/i.test(m)
  );
}

async function fetchAllRows(admin, tableName, { pageSize = 1000, maxRows = 200000 } = {}) {
  const rows = [];
  let offset = 0;

  while (true) {
    const res = await admin.from(tableName).select('*').range(offset, offset + pageSize - 1);
    if (res.error) {
      const msg = String(res.error?.message || res.error);
      if (isMissingTableMessage(msg, tableName)) {
        return { rows: [], missing: true };
      }
      throw res.error;
    }
    const batch = Array.isArray(res.data) ? res.data : [];
    if (!batch.length) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
    if (offset >= maxRows) {
      throw new Error(`Export aborted: ${tableName} exceeded ${maxRows} rows.`);
    }
  }

  return { rows, missing: false };
}

function makeSafeSheetName(name) {
  // Excel sheet name max 31 chars and cannot contain: : \ / ? * [ ]
  const cleaned = String(name || 'Sheet')
    .replace(/[:\\/?*\[\]]/g, ' ')
    .trim();
  const clipped = cleaned.slice(0, 31);
  return clipped || 'Sheet';
}

function computeColWidths(rows, columns) {
  const widths = columns.map((c) => ({ wch: Math.max(10, String(c).length) }));
  const sample = rows.slice(0, 200);
  for (const r of sample) {
    for (let i = 0; i < columns.length; i++) {
      const key = columns[i];
      const v = r?.[key];
      const s = v == null ? '' : String(v);
      widths[i].wch = Math.min(40, Math.max(widths[i].wch, s.length + 2));
    }
  }
  return widths;
}

function computeColWidthsFromAoa(aoa) {
  const maxCols = aoa.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  const widths = Array.from({ length: maxCols }, () => ({ wch: 10 }));
  const sample = aoa.slice(0, 200);
  for (const row of sample) {
    if (!Array.isArray(row)) continue;
    for (let i = 0; i < maxCols; i++) {
      const v = row[i];
      const s = v == null ? '' : String(v);
      widths[i].wch = Math.min(55, Math.max(widths[i].wch, s.length + 2));
    }
  }
  return widths;
}

function applyHeaderStyle(XLSX, ws, { headerBgRgb = '5B3F87', headerFontRgb = 'FFFFFF' } = {}) {
  if (!ws || !ws['!ref']) return;

  const range = XLSX.utils.decode_range(ws['!ref']);
  if (range.s.r > range.e.r) return;

  // Freeze the top row.
  ws['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: 'A2',
    activePane: 'bottomLeft',
    state: 'frozen',
  };

  // Make the header taller for wrapped labels.
  ws['!rows'] = ws['!rows'] || [];
  ws['!rows'][0] = Object.assign({}, ws['!rows'][0], { hpt: 42 });

  // Style row 1 cells.
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    if (!ws[addr]) continue;
    ws[addr].s = Object.assign({}, ws[addr].s, {
      fill: { patternType: 'solid', fgColor: { rgb: headerBgRgb } },
      font: { bold: true, color: { rgb: headerFontRgb } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    });
  }
}

function tryComputeAgeFromBirthDate(birthDate) {
  const bd = birthDate ? new Date(birthDate) : null;
  if (!bd || Number.isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function buildApplicantsExportAoa(applicantRows, licensureByApplicantId) {
  const headers = [
    'Timestamp',
    'Last Name',
    'First Name',
    'Middle Name',
    'Date of Birth',
    'Age',
    'Gender',
    'Educational Attainment',
    'Date Hired in FSAI',
    'Security Licensed Number',
    'LESP Expired Date',
    'POSITION',
    'SSS Number',
    'Pag-Ibig Fund Number',
    'Philhealth Number',
    'TIN',
    'DETACHMENT',
    'Your Contact Number',
    'Your Email Address',
    'COMPLETE PRESENT ADDRESS (House # Street Barangay City)',
    'COMPLETE PROVINCE ADDRESS (House # Street Barangay City)',
    'Contact Person Incase of Emergency',
    'Contact Number',
    'STATUS',
  ];

  const aoa = [headers];
  for (const r of applicantRows) {
    const lic = licensureByApplicantId?.get?.(r?.applicant_id) || null;
    const birth = r?.birth_date ?? null;
    const age = r?.age ?? tryComputeAgeFromBirthDate(birth);
    const securityNum = r?.security_licensed_num ?? lic?.security_license_number ?? null;
    const securityExp = lic?.security_expiration ?? null;

    aoa.push([
      r?.created_at ?? null,
      r?.last_name ?? null,
      r?.first_name ?? null,
      r?.middle_name ?? null,
      birth,
      age,
      r?.gender ?? null,
      r?.education_attainment ?? null,
      r?.date_hired_fsai ?? null,
      securityNum,
      securityExp,
      r?.client_position ?? null,
      r?.sss_number ?? null,
      r?.pagibig_number ?? null,
      r?.philhealth_number ?? null,
      r?.tin_number ?? null,
      r?.detachment ?? null,
      r?.client_contact_num ?? null,
      r?.client_email ?? null,
      r?.present_address ?? null,
      r?.province_address ?? null,
      r?.emergency_contact_person ?? null,
      r?.emergency_contact_num ?? null,
      r?.status ?? null,
    ]);
  }

  return aoa;
}

async function insertAuditEvent(admin, payload) {
  try {
    const actorUserId = payload?.actor_user_id ? String(payload.actor_user_id) : null;
    const actorEmail = safeText(payload?.actor_email) || null;
    const action = safeText(payload?.action);
    if (!action) return;

    const page = safeText(payload?.page) || null;
    const entity = safeText(payload?.entity) || null;
    const details = payload?.details && typeof payload.details === 'object' ? payload.details : null;

    const ins = await admin.from('audit_log').insert({
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      action,
      page,
      entity,
      details,
    });

    if (ins.error) {
      const msg = String(ins.error?.message || ins.error);
      if (isMissingAuditLogTableMessage(msg)) {
        // Table not installed yet; don't break the app.
        return;
      }
      console.warn('[audit] insert failed:', ins.error);
    }
  } catch (e) {
    console.warn('[audit] insert exception:', e?.message ?? e);
  }
}

function readEncryptedJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const text = safeStorage?.isEncryptionAvailable?.()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeEncryptedJson(filePath, value) {
  const text = JSON.stringify(value ?? null);
  const buf = safeStorage?.isEncryptionAvailable?.()
    ? safeStorage.encryptString(text)
    : Buffer.from(text, 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

function getLocalNotificationPrefsFilePath() {
  return path.join(app.getPath('userData'), 'notification_prefs_local.enc');
}

function loadLocalNotificationPrefs() {
  const raw = readEncryptedJson(getLocalNotificationPrefsFilePath()) || {};
  return {
    includeExpired: Boolean(raw.includeExpired),
    expiredWithinDays: clampInt(raw.expiredWithinDays, { min: 1, max: 365, fallback: 7 }),
  };
}

function saveLocalNotificationPrefs(payload) {
  const next = {
    includeExpired: Boolean(payload?.includeExpired),
    expiredWithinDays: clampInt(payload?.expiredWithinDays, { min: 1, max: 365, fallback: 7 }),
  };

  writeEncryptedJson(getLocalNotificationPrefsFilePath(), next);
  return next;
}

function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function daysUntil(dateYmd) {
  if (!dateYmd) return null;
  const [y, m, d] = String(dateYmd).split('-').map((n) => Number(n));
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d, 0, 0, 0, 0);
  const today = startOfTodayLocal();
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

async function loadConfiguredRecipientEmails(admin) {
  try {
    const res = await admin
      .from('notification_recipients')
      .select('email')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(500);
    if (res.error) throw res.error;
    const emails = (res.data ?? [])
      .map((r) => safeText(r.email).toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(emails));
  } catch (e) {
    // Backward compatibility: older DBs may not have this table yet.
    console.warn('[notifications] loadConfiguredRecipientEmails skipped:', e?.message ?? e);
    return [];
  }
}

async function loadNotificationConfig(admin) {
  const localPrefs = loadLocalNotificationPrefs();
  const [emailRes, prefRes, recipientEmails] = await Promise.all([
    admin
      .from('notification_email_settings')
      .select('id, provider, gmail_user, from_email, gmail_app_password, is_active, notes')
      .eq('provider', 'gmail')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('notification_preferences')
      .select(
        'id, is_enabled, days_before_expiry, include_driver_license, include_security_license, include_insurance, use_scheduled_send, send_time_local, timezone'
      )
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadConfiguredRecipientEmails(admin),
  ]);

  if (emailRes.error) throw emailRes.error;
  if (prefRes.error) throw prefRes.error;

  return {
    email: emailRes.data ?? null,
    preferences: prefRes.data ?? null,
    recipients: recipientEmails,
    localPrefs,
    env: {
      hasGmailUser: Boolean(process.env.GMAIL_USER),
      hasGmailPass: Boolean(process.env.GMAIL_PASS),
      gmailUser: safeText(process.env.GMAIL_USER) || null,
    },
  };
}

function buildTransport(emailSettingsRow) {
  const nodemailer = require('nodemailer');

  // App-password auth only (no Google OAuth in this app).
  const user = safeText(process.env.GMAIL_USER) || safeText(emailSettingsRow?.gmail_user);
  const pass = safeText(process.env.GMAIL_PASS) || safeText(emailSettingsRow?.gmail_app_password);
  const from = user;
  if (!user) {
    throw new Error('Missing Gmail sender email. Set GMAIL_USER in .env.local or set Gmail User in Settings.');
  }
  if (!pass) {
    throw new Error(
      'Missing Gmail App Password. Set GMAIL_PASS in .env.local (recommended) or enable “store app password” in Settings.'
    );
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return { transporter, user, from };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseEmailTemplateNotes(notes) {
  // Support notes stored as jsonb (object) or as JSON-encoded text.
  if (notes && typeof notes === 'object') {
    const subject = safeText(notes.subject);
    const bodyHtml = safeText(notes.bodyHtml);
    return {
      subject: subject || null,
      bodyHtml: bodyHtml || null,
      legacyMessage: null,
    };
  }

  const raw = safeText(notes);
  if (!raw) return { subject: null, bodyHtml: null, legacyMessage: null };

  function tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  let parsed = tryParseJson(raw);
  // Handle double-stringified JSON (e.g. "{\"subject\":...}").
  if (typeof parsed === 'string') {
    const nested = tryParseJson(parsed);
    parsed = nested ?? parsed;
  }

  if (parsed && typeof parsed === 'object') {
    const subject = safeText(parsed.subject);
    const bodyHtml = safeText(parsed.bodyHtml);
    return {
      subject: subject || null,
      bodyHtml: bodyHtml || null,
      legacyMessage: null,
    };
  }

  return { subject: null, bodyHtml: null, legacyMessage: raw };
}

ipcMain.handle('admin:exportDatabaseExcel', async () => {
  const admin = getAdminSupabase();
  const XLSX = require('xlsx');

  const tables = [
    // Core app data
    'admins',
    'applicants',
    'licensure',
    'certificates',
    'biodata',
    'employment_history',
    'employment_record',

    // Notifications/audit
    'notification_email_settings',
    'notification_preferences',
    'licensure_notification_log',
    'audit_log',

    // RBAC tables (if installed)
    'app_roles',
    'modules',
    'role_module_access',
    'profiles',
  ];

  const defaultName = `database-export-${new Date().toISOString().replace(/[:]/g, '-').slice(0, 19)}.xlsx`;
  const save = await dialog.showSaveDialog({
    title: 'Export database (Excel)',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (save.canceled || !save.filePath) {
    return { cancelled: true };
  }

  const wb = XLSX.utils.book_new();
  const skipped = [];
  const exported = [];

  // Cache for joined exports.
  let licensureByApplicantId = null;

  // Cover sheet
  const cover = XLSX.utils.aoa_to_sheet([
    ['Database Export'],
    ['Generated at', new Date().toLocaleString()],
    ['Tables included', String(tables.length)],
    [''],
    ['Notes'],
    ['- Each sheet corresponds to a table'],
    ['- Some tables may be skipped if not installed'],
  ]);
  XLSX.utils.book_append_sheet(wb, cover, 'README');

  for (const t of tables) {
    try {
      const { rows, missing } = await fetchAllRows(admin, t);
      if (missing) {
        skipped.push({ table: t, reason: 'missing' });
        continue;
      }

      let sheet;
      if (!rows.length) {
        sheet = XLSX.utils.aoa_to_sheet([['No rows']]);
      } else {
        if (t === 'applicants') {
          if (!licensureByApplicantId) {
            try {
              const licRes = await fetchAllRows(admin, 'licensure');
              const map = new Map();
              for (const lr of licRes.rows || []) {
                if (!lr?.applicant_id) continue;
                map.set(lr.applicant_id, lr);
              }
              licensureByApplicantId = map;
            } catch {
              licensureByApplicantId = new Map();
            }
          }
          const aoa = buildApplicantsExportAoa(rows, licensureByApplicantId);
          sheet = XLSX.utils.aoa_to_sheet(aoa);
          sheet['!cols'] = computeColWidthsFromAoa(aoa);
        } else {
          const columnSet = new Set();
          for (const r of rows.slice(0, 500)) {
            for (const k of Object.keys(r || {})) columnSet.add(k);
          }
          const columns = Array.from(columnSet);
          sheet = XLSX.utils.json_to_sheet(rows, { header: columns });
          sheet['!cols'] = computeColWidths(rows, columns);
        }

        if (sheet['!ref']) {
          sheet['!autofilter'] = { ref: sheet['!ref'] };
        }

        // Apply screenshot-like header formatting (purple, bold white, wrapped) and freeze.
        applyHeaderStyle(XLSX, sheet, { headerBgRgb: '5B3F87', headerFontRgb: 'FFFFFF' });
      }

      const sheetName = makeSafeSheetName(t);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
      exported.push(t);
    } catch (e) {
      skipped.push({ table: t, reason: String(e?.message || e) });
    }
  }

  XLSX.writeFile(wb, save.filePath, { compression: true, cellStyles: true });
  return {
    cancelled: false,
    ok: true,
    filePath: save.filePath,
    exportedTables: exported,
    skippedTables: skipped,
  };
});

function sanitizeEmailBodyHtml(inputHtml) {
  let html = String(inputHtml ?? '');

  // Remove scripts/styles and embedded content.
  html = html.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  html = html.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '');
  html = html.replace(/<\s*(iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(iframe|object|embed)[^>]*\/\s*>/gi, '');

  // Remove inline event handlers (onclick, onload, etc.)
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, '');

  // Neutralize javascript: URLs
  html = html.replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"');
  html = html.replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");

  return html;
}

function computeEmailSubject(templateSubject, itemsCount) {
  const sub = safeText(templateSubject);
  if (!sub) return `Expiring Licensure Warning (${itemsCount})`;
  return sub.replace(/\{count\}/g, String(itemsCount));
}

function renderEmailHtml({ subject, recipientName, items, daysBefore, bodyHtml, legacyMessage }) {
  const msg = safeText(legacyMessage);
  const safeBody = safeText(bodyHtml) ? sanitizeEmailBodyHtml(bodyHtml) : '';
  const heading = safeText(subject) || 'NOTICE: LICENSE EXPIRATION ALERT';

  function fmtDays(d) {
    const n = Number(d);
    if (!Number.isFinite(n)) return '';
    if (n >= 0) return String(n);
    const abs = Math.abs(n);
    return `Expired ${abs} day${abs === 1 ? '' : 's'} ago`;
  }

  const rows = items
    .map((it) => {
      return `
        <tr>
          <td style="padding:8px 6px;border-bottom:1px solid #eee;">${escapeHtml(it.license_type)}</td>
          <td style="padding:8px 6px;border-bottom:1px solid #eee;">${escapeHtml(it.expires_on)}</td>
          <td style="padding:8px 6px;border-bottom:1px solid #eee;">${escapeHtml(fmtDays(it.days_until_expiry))}</td>
        </tr>`;
    })
    .join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111;background:#f7f7f7;padding:20px;">
    <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#facc15;color:#111;padding:14px 18px;font-weight:700;font-size:16px;">${escapeHtml(heading)}</div>
      <div style="padding:18px;">
        <div style="margin:0 0 10px 0;">Dear Sir/Ma'am${recipientName ? ` (${escapeHtml(recipientName)})` : ''},</div>
        <div style="margin:0 0 12px 0;color:#374151;">This is to formally notify you of licenses and related records nearing expiration within ${escapeHtml(
          String(daysBefore)
        )} days.</div>
        ${safeBody ? `<div style="margin:0 0 12px 0;">${safeBody}</div>` : ''}
        ${!safeBody && msg ? `<div style="margin:0 0 12px 0;padding:10px 12px;border:1px solid #eee;background:#fafafa;border-radius:8px;">${escapeHtml(msg)}</div>` : ''}
        <table style="border-collapse:collapse;width:100%;max-width:100%;font-size:13px;">
          <thead>
            <tr>
              <th align="left" style="padding:10px 8px;border-bottom:2px solid #ddd;background:#fafafa;">Type</th>
              <th align="left" style="padding:10px 8px;border-bottom:2px solid #ddd;background:#fafafa;">Expires On</th>
              <th align="left" style="padding:10px 8px;border-bottom:2px solid #ddd;background:#fafafa;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div style="margin-top:14px;color:#374151;">Please process the renewal before expiration to avoid service disruptions.</div>
        <div style="margin-top:16px;color:#6b7280;font-size:12px;">This is a system-generated notice from Database Management App.</div>
      </div>
    </div>
  </div>`;
}

async function fetchExpiringRows(admin, preferences, localPrefs, limit) {
  const daysBefore = Number(preferences?.days_before_expiry ?? 30);
  const includeExpired = Boolean(localPrefs?.includeExpired);
  const expiredWithinDays = clampInt(localPrefs?.expiredWithinDays, { min: 1, max: 365, fallback: 7 });

  // Pull licensure first, then applicants in chunks.
  const res = await admin
    .from('licensure')
    .select('applicant_id, driver_expiration, security_expiration, insurance_expiration')
    .limit(10000);
  if (res.error) throw res.error;

  const licRows = res.data ?? [];
  const ids = Array.from(new Set(licRows.map((r) => r.applicant_id).filter(Boolean)));

  const applicantsById = new Map();
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const aRes = await admin
      .from('applicants')
      .select('applicant_id, first_name, middle_name, last_name, extn_name, client_email, client_contact_num, status, is_archived')
      .in('applicant_id', chunk);
    if (aRes.error) throw aRes.error;
    for (const a of aRes.data ?? []) {
      applicantsById.set(a.applicant_id, a);
    }
  }

  const includeDriver = Boolean(preferences?.include_driver_license);
  const includeSecurity = Boolean(preferences?.include_security_license);
  const includeInsurance = Boolean(preferences?.include_insurance);

  const out = [];
  for (const row of licRows) {
    const applicant = applicantsById.get(row.applicant_id);
    if (!applicant) continue;
    const normalizedStatus = safeText(applicant.status).toUpperCase();
    const isArchived = applicant.is_archived === true;
    if (isArchived || normalizedStatus === 'RETIRED') continue;

    const base = {
      applicant_id: row.applicant_id,
      last_name: applicant.last_name ?? null,
      first_name: applicant.first_name ?? null,
      middle_name: applicant.middle_name ?? null,
      extn_name: applicant.extn_name ?? null,
      client_email: applicant.client_email ?? null,
      client_contact_num: applicant.client_contact_num ?? null,
    };

    if (includeDriver) {
      const exp = ymd(row.driver_expiration);
      const du = daysUntil(exp);
      if (
        exp &&
        du !== null &&
        ((du >= 1 && du <= daysBefore) || (includeExpired && du < 0 && Math.abs(du) <= expiredWithinDays))
      ) {
        out.push({ ...base, expires_on: exp, license_type: 'DRIVER_LICENSE', days_until_expiry: du });
      }
    }
    if (includeSecurity) {
      const exp = ymd(row.security_expiration);
      const du = daysUntil(exp);
      if (
        exp &&
        du !== null &&
        ((du >= 1 && du <= daysBefore) || (includeExpired && du < 0 && Math.abs(du) <= expiredWithinDays))
      ) {
        out.push({ ...base, expires_on: exp, license_type: 'SECURITY_LICENSE', days_until_expiry: du });
      }
    }
    if (includeInsurance) {
      const exp = ymd(row.insurance_expiration);
      const du = daysUntil(exp);
      if (
        exp &&
        du !== null &&
        ((du >= 1 && du <= daysBefore) || (includeExpired && du < 0 && Math.abs(du) <= expiredWithinDays))
      ) {
        out.push({ ...base, expires_on: exp, license_type: 'INSURANCE', days_until_expiry: du });
      }
    }
  }

  out.sort((a, b) => (a.days_until_expiry ?? 9999) - (b.days_until_expiry ?? 9999));
  return typeof limit === 'number' ? out.slice(0, limit) : out;
}

function displayNameFromRow(r) {
  const parts = [r.first_name, r.middle_name, r.last_name, r.extn_name].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Employee';
}

function parseLocalSendTimeHHmm(input, fallback = '08:00') {
  const raw = safeText(input).slice(0, 5) || fallback;
  const [hhRaw, mmRaw] = raw.split(':');
  const hh = clampInt(hhRaw, { min: 0, max: 23, fallback: 8 });
  const mm = clampInt(mmRaw, { min: 0, max: 59, fallback: 0 });
  return { hh, mm, raw: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

function isDueToSendNow(expiresOnYmd, daysBefore, sendTimeLocal) {
  const exp = ymd(expiresOnYmd);
  if (!exp) return false;

  const du = daysUntil(exp);
  // Never send on the day of expiration or after.
  if (du === null || du <= 0) return false;
  if (du > Number(daysBefore)) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const expDt = new Date(exp);
  const dueDt = new Date(expDt.getFullYear(), expDt.getMonth(), expDt.getDate(), 0, 0, 0, 0);
  dueDt.setDate(dueDt.getDate() - Number(daysBefore));

  if (today.getTime() < dueDt.getTime()) return false;

  // If today is the due date, wait until the configured local send time
  // only when scheduling is enabled.
  if (today.getTime() === dueDt.getTime()) {
    if (safeText(sendTimeLocal)) {
      const { hh, mm } = parseLocalSendTimeHHmm(sendTimeLocal);
      const dueTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
      if (now.getTime() < dueTime.getTime()) return false;
    }
  }

  // Catch-up: if app was closed on the due date, send as soon as possible
  // on the next run (still before expiration).
  return true;
}

async function hasSentLicensureNotice(admin, item, recipientEmail = null) {
  try {
    let q = admin
      .from('licensure_notification_log')
      .select('id')
      .eq('status', 'SENT')
      .eq('applicant_id', item.applicant_id)
      .eq('license_type', item.license_type)
      .eq('expires_on', item.expires_on);

    if (safeText(recipientEmail)) {
      q = q.eq('recipient_email', safeText(recipientEmail));
    }

    const res = await q.limit(1).maybeSingle();
    if (res.error) throw res.error;
    return Boolean(res.data?.id);
  } catch (e) {
    // If log table is missing/misconfigured, fail open to avoid blocking sends.
    console.warn('[notifications] hasSentLicensureNotice failed:', e?.message ?? e);
    return false;
  }
}

async function runNotificationSend(admin) {
  const { email, preferences, recipients } = await loadNotificationConfig(admin);
  if (!preferences?.is_enabled) {
    return { ok: true, summary: { sent: 0, failed: 0, skipped: 0 }, message: 'Notifications are disabled.' };
  }
  if (email && !email.is_active) {
    return { ok: true, summary: { sent: 0, failed: 0, skipped: 0 }, message: 'Gmail sender is not active.' };
  }

  const { transporter, from } = buildTransport(email);
  const localPrefs = loadLocalNotificationPrefs();
  const expiring = await fetchExpiringRows(admin, preferences, localPrefs);

  const daysBefore = Number(preferences.days_before_expiry ?? 30);
  const useScheduledSend = preferences?.use_scheduled_send !== false;
  const sendTimeLocal = useScheduledSend ? preferences.send_time_local : null;
  const configuredRecipients = Array.isArray(recipients) ? recipients.map((x) => safeText(x).toLowerCase()).filter(Boolean) : [];
  const useConfiguredRecipients = configuredRecipients.length > 0;

  // Group email by recipient to reduce spam.
  const byRecipient = new Map();
  for (const item of expiring) {
    if (!isDueToSendNow(item.expires_on, daysBefore, sendTimeLocal)) continue;

    if (useConfiguredRecipients) {
      for (const to of configuredRecipients) {
        const alreadySent = await hasSentLicensureNotice(admin, item, to);
        if (alreadySent) continue;
        const arr = byRecipient.get(to) || [];
        arr.push(item);
        byRecipient.set(to, arr);
      }
      continue;
    }

    const to = safeText(item.client_email);
    if (!to) {
      await admin.from('licensure_notification_log').insert({
        applicant_id: item.applicant_id,
        license_type: item.license_type,
        expires_on: item.expires_on,
        recipient_email: null,
        status: 'SKIPPED',
        error_message: 'Missing recipient email (client_email) and no active notification recipient configured.',
      });
      continue;
    }

    const alreadySent = await hasSentLicensureNotice(admin, item, to);
    if (alreadySent) continue;

    const arr = byRecipient.get(to) || [];
    arr.push(item);
    byRecipient.set(to, arr);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const [to, items] of byRecipient.entries()) {
    const recipientName = displayNameFromRow(items[0]);
    const tpl = parseEmailTemplateNotes(email?.notes);
    const subject = computeEmailSubject(tpl.subject, items.length);
    const html = renderEmailHtml({
      subject,
      recipientName,
      items,
      daysBefore: preferences.days_before_expiry,
      bodyHtml: tpl.bodyHtml,
      legacyMessage: tpl.legacyMessage,
    });

    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      for (const item of items) {
        const ins = await admin.from('licensure_notification_log').insert({
          applicant_id: item.applicant_id,
          license_type: item.license_type,
          expires_on: item.expires_on,
          recipient_email: to,
          status: 'SENT',
          error_message: null,
        });
        if (ins.error) {
          // logging failure shouldn't crash the whole run
          console.warn('[notifications] log insert failed:', ins.error);
        }
        sent += 1;
      }
    } catch (err) {
      for (const item of items) {
        const ins = await admin.from('licensure_notification_log').insert({
          applicant_id: item.applicant_id,
          license_type: item.license_type,
          expires_on: item.expires_on,
          recipient_email: to,
          status: 'FAILED',
          error_message: safeText(err?.message || err),
        });
        if (ins.error) {
          console.warn('[notifications] log insert failed:', ins.error);
        }
        failed += 1;
      }
    }
  }

  // Count how many were skipped in this run by comparing totals.
  // Note: expiring includes preview window rows, but we only attempt sends for "due" rows.
  const dueCount = Array.from(byRecipient.values()).reduce((acc, v) => acc + v.length, 0);
  skipped = Math.max(0, dueCount - sent - failed);
  return { ok: true, summary: { sent, failed, skipped }, message: 'Run complete.' };
}

async function ensureRoleId(admin, roleName) {
  const name = String(roleName || '').trim().toLowerCase();
  if (!name) throw new Error('roleName is required');

  const { data: existing, error: existingErr } = await admin
    .from('app_roles')
    .select('role_id')
    .eq('role_name', name)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.role_id) return existing.role_id;

  const { data: created, error: createErr } = await admin
    .from('app_roles')
    .insert({ role_name: name })
    .select('role_id')
    .single();
  if (createErr) throw createErr;
  return created.role_id;
}

ipcMain.handle('admin:createUser', async (_event, payload) => {
  const admin = getAdminSupabase();

  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '').trim();
  const fullName = payload?.full_name ? String(payload.full_name) : null;
  const kind = String(payload?.kind || 'employee').toLowerCase();
  const roleName = String(payload?.role_name || '').toLowerCase();
  const applicantId = payload?.applicant_id ? String(payload.applicant_id) : null;

  if (!email || !password) throw new Error('email and password are required');
  if (!roleName) throw new Error('role_name is required');
  if (kind !== 'admin' && kind !== 'employee') throw new Error('kind must be admin or employee');

  const { data: created, error: createUserErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, kind },
  });
  if (createUserErr) throw createUserErr;
  const user = created?.user;
  if (!user?.id) throw new Error('Failed to create user');

  const roleId = await ensureRoleId(admin, roleName);

  const ops = [];
  ops.push(
    admin.from('user_profiles').upsert({
      user_id: user.id,
      email,
      full_name: fullName,
      kind,
      is_active: true,
    })
  );
  ops.push(admin.from('user_role_memberships').upsert({ user_id: user.id, role_id: roleId }));
  if (kind === 'employee') {
    ops.push(
      admin.from('employee_profiles').upsert({
        user_id: user.id,
        applicant_id: applicantId,
      })
    );
  }

  const results = await Promise.all(ops);
  const failed = results.find((r) => r?.error);
  if (failed?.error) {
    throw failed.error;
  }

  await insertAuditEvent(admin, {
    actor_user_id: payload?.actor?.user_id ?? null,
    actor_email: payload?.actor?.email ?? null,
    action: 'ADMIN_CREATE_USER',
    entity: user.id,
    details: { created_email: email, kind, role_name: roleName },
  });

  return { user_id: user.id };
});

ipcMain.handle('admin:deleteUserPermanently', async (_event, payload) => {
  const admin = getAdminSupabase();
  const userId = String(payload?.user_id || '').trim();
  if (!userId) throw new Error('user_id is required');

  // Clean public tables first (best-effort)
  await admin.from('account_trash').delete().eq('user_id', userId);
  await admin.from('employee_profiles').delete().eq('user_id', userId);
  await admin.from('user_role_memberships').delete().eq('user_id', userId);
  await admin.from('user_profiles').delete().eq('user_id', userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;

  return { success: true };
});

// Notification settings + email sending (Electron main process)
ipcMain.handle('settings:loadNotificationConfig', async () => {
  const admin = getAdminSupabase();
  return await loadNotificationConfig(admin);
});

ipcMain.handle('settings:saveLocalNotificationPrefs', async (_event, payload) => {
  const next = saveLocalNotificationPrefs(payload);
  return { success: true, localPrefs: next };
});

ipcMain.handle('settings:clearStoredGmailAppPassword', async () => {
  const admin = getAdminSupabase();
  const existingEmail = await admin
    .from('notification_email_settings')
    .select('id')
    .eq('provider', 'gmail')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingEmail.error) throw existingEmail.error;
  if (!existingEmail.data?.id) return { success: true };

  const upd = await admin
    .from('notification_email_settings')
    .update({ gmail_app_password: null })
    .eq('id', existingEmail.data.id);
  if (upd.error) throw upd.error;
  return { success: true };
});

ipcMain.handle('settings:getStoredGmailAppPassword', async () => {
  const admin = getAdminSupabase();
  const existingEmail = await admin
    .from('notification_email_settings')
    .select('gmail_app_password')
    .eq('provider', 'gmail')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingEmail.error) throw existingEmail.error;
  return { password: safeText(existingEmail.data?.gmail_app_password) || null };
});

// Dev diagnostic: helps confirm IPC handlers are registered.
try {
  if (process.env.ELECTRON_DEV === '1') {
    const has = ipcMain?._invokeHandlers?.has?.('settings:getStoredGmailAppPassword');
    console.log('[electron] IPC registered settings:getStoredGmailAppPassword:', Boolean(has));
  }
} catch {
  // ignore
}

ipcMain.handle('settings:removeGmailSender', async () => {
  const admin = getAdminSupabase();
  const del = await admin.from('notification_email_settings').delete().eq('provider', 'gmail');
  if (del.error) throw del.error;
  return { success: true };
});

ipcMain.handle('settings:saveNotificationConfig', async (_event, payload) => {
  const admin = getAdminSupabase();
  const email = payload?.email ?? {};
  const preferences = payload?.preferences ?? {};

  const senderEmail = safeText(process.env.GMAIL_USER) || safeText(email.gmail_user);
  if (!senderEmail) {
    throw new Error('Missing Gmail sender email. Set GMAIL_USER in .env.local or input Gmail User in Settings.');
  }
  const daysBefore = Number(preferences.days_before_expiry ?? 30);
  if (!Number.isFinite(daysBefore) || daysBefore < 1 || daysBefore > 365) {
    throw new Error('Days before expiry must be between 1 and 365.');
  }

  const existingEmail = await admin
    .from('notification_email_settings')
    .select('id')
    .eq('provider', 'gmail')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingEmail.error) throw existingEmail.error;

  const baseEmailPayload = {
    provider: 'gmail',
    gmail_user: senderEmail,
    from_email: senderEmail,
    is_active: Boolean(email.is_active ?? true),
    notes: safeText(email.notes) || null,
  };
  const passwordPayload = payload?.storeAppPassword
    ? { gmail_app_password: safeText(email.gmail_app_password) || null }
    : {};

  if (existingEmail.data?.id) {
    const upd = await admin
      .from('notification_email_settings')
      .update({ ...baseEmailPayload, ...passwordPayload })
      .eq('id', existingEmail.data.id);
    if (upd.error) throw upd.error;
  } else {
    const ins = await admin.from('notification_email_settings').insert({ ...baseEmailPayload, ...passwordPayload });
    if (ins.error) throw ins.error;
  }

  const existingPref = await admin.from('notification_preferences').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (existingPref.error) throw existingPref.error;

  const prefPayload = {
    is_enabled: Boolean(preferences.is_enabled ?? true),
    days_before_expiry: daysBefore,
    include_driver_license: Boolean(preferences.include_driver_license ?? false),
    include_security_license: Boolean(preferences.include_security_license ?? true),
    include_insurance: Boolean(preferences.include_insurance ?? false),
    use_scheduled_send: Boolean(preferences.use_scheduled_send ?? true),
    send_time_local: safeText(preferences.send_time_local) || '08:00',
    timezone: safeText(preferences.timezone) || 'Asia/Manila',
  };

  if (existingPref.data?.id) {
    const upd = await admin.from('notification_preferences').update(prefPayload).eq('id', existingPref.data.id);
    if (upd.error) throw upd.error;
  } else {
    const ins = await admin.from('notification_preferences').insert(prefPayload);
    if (ins.error) throw ins.error;
  }

  await insertAuditEvent(admin, {
    actor_user_id: payload?.actor?.user_id ?? null,
    actor_email: payload?.actor?.email ?? null,
    action: 'SETTINGS_SAVE_NOTIFICATION_CONFIG',
    page: '/Main_Modules/Settings/',
    details: {
      gmail_user: senderEmail,
      is_enabled: Boolean(prefPayload.is_enabled),
      days_before_expiry: daysBefore,
      include_driver_license: Boolean(prefPayload.include_driver_license),
      include_security_license: Boolean(prefPayload.include_security_license),
      include_insurance: Boolean(prefPayload.include_insurance),
    },
  });

  // Allow the auto-scheduler to re-run today using the new config.
  lastAutoRunKey = null;

  return { success: true };
});

ipcMain.handle('notifications:previewExpiring', async (_event, payload) => {
  const admin = getAdminSupabase();
  const { preferences } = await loadNotificationConfig(admin);
  const localPrefs = loadLocalNotificationPrefs();
  const limit = Number(payload?.limit ?? 25);
  const rows = await fetchExpiringRows(admin, preferences ?? {}, localPrefs, limit);
  return { rows };
});

ipcMain.handle('notifications:getExpiringSummary', async (_event, payload) => {
  const admin = getAdminSupabase();
  const { preferences } = await loadNotificationConfig(admin);
  const localPrefs = loadLocalNotificationPrefs();
  const limit = Math.max(1, Math.min(50, Number(payload?.limit ?? 8)));
  const all = await fetchExpiringRows(admin, preferences ?? {}, localPrefs);

  const rows = all.slice(0, limit);
  const applicantIds = Array.from(new Set(all.map((r) => r.applicant_id).filter(Boolean)));
  const keys = new Set(all.map((r) => `${r.applicant_id}:${r.license_type}:${String(r.expires_on)}`));

  const sentStats = new Map();
  if (applicantIds.length) {
    try {
      const logRes = await admin
        .from('licensure_notification_log')
        .select('applicant_id, license_type, expires_on, created_at, status')
        .eq('status', 'SENT')
        .in('applicant_id', applicantIds)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (logRes.error) throw logRes.error;

      for (const x of logRes.data ?? []) {
        const k = `${x.applicant_id}:${x.license_type}:${String(x.expires_on)}`;
        if (!keys.has(k)) continue;
        const prev = sentStats.get(k) || { sent_count: 0, last_sent_at: null };
        prev.sent_count += 1;
        if (!prev.last_sent_at) prev.last_sent_at = x.created_at;
        sentStats.set(k, prev);
      }
    } catch (e) {
      console.warn('[notifications] getExpiringSummary log lookup failed:', e?.message ?? e);
    }
  }

  const enriched = rows.map((r) => {
    const k = `${r.applicant_id}:${r.license_type}:${String(r.expires_on)}`;
    const st = sentStats.get(k) || { sent_count: 0, last_sent_at: null };
    return { ...r, sent_count: st.sent_count, last_sent_at: st.last_sent_at };
  });

  let pendingCount = 0;
  let sentCount = 0;
  for (const r of all) {
    const k = `${r.applicant_id}:${r.license_type}:${String(r.expires_on)}`;
    const st = sentStats.get(k);
    if (st?.sent_count) sentCount += 1;
    else pendingCount += 1;
  }

  // `count` is used for the red badge in the UI: only show items that have NOT been sent yet.
  return { count: pendingCount, total: all.length, pendingCount, sentCount, rows: enriched };
});

ipcMain.handle('notifications:resendLicensureNotice', async (_event, payload) => {
  const admin = getAdminSupabase();
  const applicantId = payload?.applicant_id;
  const licenseType = safeText(payload?.license_type);
  const expiresOn = ymd(payload?.expires_on);
  if (!applicantId || !licenseType || !expiresOn) {
    throw new Error('Missing applicant_id, license_type, or expires_on');
  }

  const { email, preferences } = await loadNotificationConfig(admin);
  if (!preferences?.is_enabled) throw new Error('Notifications are disabled.');
  if (email && !email.is_active) throw new Error('Gmail sender is not active.');

  const aRes = await admin
    .from('applicants')
    .select('applicant_id, first_name, middle_name, last_name, extn_name, client_email')
    .eq('applicant_id', applicantId)
    .maybeSingle();
  if (aRes.error) throw aRes.error;
  const applicant = aRes.data;
  if (!applicant) throw new Error('Applicant not found.');
  const to = safeText(applicant.client_email);
  if (!to) throw new Error('Missing recipient email (client_email).');

  const { transporter, from } = buildTransport(email);

  const item = {
    applicant_id: applicantId,
    license_type: licenseType,
    expires_on: expiresOn,
    days_until_expiry: daysUntil(expiresOn),
    first_name: applicant.first_name ?? null,
    middle_name: applicant.middle_name ?? null,
    last_name: applicant.last_name ?? null,
    extn_name: applicant.extn_name ?? null,
    client_email: to,
  };

  const recipientName = displayNameFromRow(item);
  const tpl = parseEmailTemplateNotes(email?.notes);
  const subject = computeEmailSubject(tpl.subject, 1);
  const html = renderEmailHtml({
    subject,
    recipientName,
    items: [item],
    daysBefore: preferences.days_before_expiry,
    bodyHtml: tpl.bodyHtml,
    legacyMessage: tpl.legacyMessage,
  });

  try {
    await transporter.sendMail({ from, to, subject, html });
    await admin.from('licensure_notification_log').insert({
      applicant_id: applicantId,
      license_type: licenseType,
      expires_on: expiresOn,
      recipient_email: to,
      status: 'SENT',
      error_message: null,
    });
    return { ok: true };
  } catch (err) {
    await admin.from('licensure_notification_log').insert({
      applicant_id: applicantId,
      license_type: licenseType,
      expires_on: expiresOn,
      recipient_email: to,
      status: 'FAILED',
      error_message: safeText(err?.message || err),
    });
    throw err;
  }
});

ipcMain.handle('audit:logEvent', async (_event, payload) => {
  const admin = getAdminSupabase();
  await insertAuditEvent(admin, payload);
  return { success: true };
});

ipcMain.handle('audit:getRecent', async (_event, payload) => {
  const admin = getAdminSupabase();
  const limit = Math.max(1, Math.min(50, Number(payload?.limit ?? 10)));
  const sinceIso = safeText(payload?.sinceIso);

  try {
    let q = admin
      .from('audit_log')
      .select('id, created_at, actor_email, actor_user_id, action, page, entity, details', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (sinceIso) q = q.gte('created_at', sinceIso);

    const res = await q;
    if (res.error) throw res.error;
    return { rows: res.data ?? [], count: res.count ?? 0, missingTable: false };
  } catch (e) {
    const msg = safeText(e?.message || e);
    if (isMissingAuditLogTableMessage(msg)) {
      return { rows: [], count: 0, missingTable: true };
    }
    throw e;
  }
});

ipcMain.handle('audit:getPage', async (_event, payload) => {
  const admin = getAdminSupabase();
  const pageSize = Math.max(5, Math.min(100, Number(payload?.pageSize ?? 25)));
  const page = Math.max(1, Number(payload?.page ?? 1));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const res = await admin
      .from('audit_log')
      .select('id, created_at, actor_email, actor_user_id, action, page, entity, details', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (res.error) throw res.error;
    return { rows: res.data ?? [], count: res.count ?? 0, missingTable: false };
  } catch (e) {
    const msg = safeText(e?.message || e);
    if (isMissingAuditLogTableMessage(msg)) {
      return { rows: [], count: 0, missingTable: true };
    }
    throw e;
  }
});

ipcMain.handle('notifications:getLog', async (_event, payload) => {
  const admin = getAdminSupabase();
  const status = safeText(payload?.status);
  const limit = Math.max(1, Math.min(200, Number(payload?.limit ?? 25)));

  let q = admin
    .from('licensure_notification_log')
    .select('id, created_at, applicant_id, license_type, expires_on, recipient_email, status, error_message')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status && status !== 'ALL') q = q.eq('status', status);
  const res = await q;
  if (res.error) throw res.error;

  // UI wants an email-level log, but the table stores one row per license item.
  // Collapse rows into a single entry per recipient+status+minute bucket.
  const rawRows = res.data ?? [];
  const grouped = new Map();

  for (const r of rawRows) {
    const recipient = safeText(r.recipient_email) || '';
    const st = safeText(r.status) || '';
    const ms = Date.parse(String(r.created_at));
    const minuteBucket = Number.isFinite(ms) ? String(Math.floor(ms / 60000)) : String(r.created_at).slice(0, 16);
    const key = `${recipient}|${st}|${minuteBucket}`;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...r,
        _types: new Set([safeText(r.license_type) || '']),
      });
      continue;
    }
    existing._types.add(safeText(r.license_type) || '');
  }

  const rows = Array.from(grouped.values()).map((r) => {
    const types = Array.from(r._types).filter(Boolean);
    const licenseType = types.length ? types.join(', ') : safeText(r.license_type);
    // remove internal field
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _types, ...rest } = r;
    return { ...rest, license_type: licenseType };
  });

  return { rows };
});

ipcMain.handle('notifications:sendTestEmail', async (_event, payload) => {
  const admin = getAdminSupabase();
  const { email, preferences } = await loadNotificationConfig(admin);

  const { transporter, from } = buildTransport(email);
  const to = safeText(payload?.to) || from;
  if (!to) throw new Error('Missing test recipient email.');

  const tpl = parseEmailTemplateNotes(email?.notes);
  const subject = safeText(payload?.subject) || computeEmailSubject(tpl.subject, 1) || 'Test: Expiring Licensure Notifications';
  const html = renderEmailHtml({
    subject,
    recipientName: 'Test',
    items: [
      {
        license_type: 'TEST',
        expires_on: ymd(new Date()) || '',
        days_until_expiry: 0,
      },
    ],
    daysBefore: preferences?.days_before_expiry ?? 30,
    bodyHtml: tpl.bodyHtml,
    legacyMessage: tpl.legacyMessage,
  });

  await transporter.sendMail({ from, to, subject, html });
  return { success: true };
});

ipcMain.handle('notifications:runNow', async () => {
  const admin = getAdminSupabase();
  return await runNotificationSend(admin);
});

ipcMain.handle('notifications:resendAllExpiring', async (_event, payload) => {
  const admin = getAdminSupabase();
  const { email, preferences, recipients } = await loadNotificationConfig(admin);

  if (!preferences?.is_enabled) throw new Error('Notifications are disabled.');
  if (email && !email.is_active) throw new Error('Gmail sender is not active.');

  const localPrefs = loadLocalNotificationPrefs();
  const expiring = await fetchExpiringRows(admin, preferences ?? {}, localPrefs);
  const configuredRecipients = Array.isArray(recipients) ? recipients.map((x) => safeText(x).toLowerCase()).filter(Boolean) : [];
  const useConfiguredRecipients = configuredRecipients.length > 0;

  const maxRecipients = clampInt(payload?.maxRecipients, { min: 1, max: 2000, fallback: 0 });

  const { transporter, from } = buildTransport(email);

  const byRecipient = new Map();
  let skipped = 0;

  for (const item of expiring) {
    if (useConfiguredRecipients) {
      for (const to of configuredRecipients) {
        if (maxRecipients && !byRecipient.has(to) && byRecipient.size >= maxRecipients) {
          continue;
        }
        const arr = byRecipient.get(to) || [];
        arr.push(item);
        byRecipient.set(to, arr);
      }
      continue;
    }

    const to = safeText(item.client_email);
    if (!to) {
      await admin.from('licensure_notification_log').insert({
        applicant_id: item.applicant_id,
        license_type: item.license_type,
        expires_on: item.expires_on,
        recipient_email: null,
        status: 'SKIPPED',
        error_message: 'Missing recipient email (client_email) and no active notification recipient configured.',
      });
      skipped += 1;
      continue;
    }

    if (maxRecipients && !byRecipient.has(to) && byRecipient.size >= maxRecipients) {
      continue;
    }

    const arr = byRecipient.get(to) || [];
    arr.push(item);
    byRecipient.set(to, arr);
  }

  let sent = 0;
  let failed = 0;

  for (const [to, items] of byRecipient.entries()) {
    const recipientName = displayNameFromRow(items[0]);
    const tpl = parseEmailTemplateNotes(email?.notes);
    const subject = computeEmailSubject(tpl.subject, items.length);
    const html = renderEmailHtml({
      subject,
      recipientName,
      items,
      daysBefore: preferences?.days_before_expiry ?? 30,
      bodyHtml: tpl.bodyHtml,
      legacyMessage: tpl.legacyMessage,
    });

    try {
      await transporter.sendMail({ from, to, subject, html });
      for (const item of items) {
        const ins = await admin.from('licensure_notification_log').insert({
          applicant_id: item.applicant_id,
          license_type: item.license_type,
          expires_on: item.expires_on,
          recipient_email: to,
          status: 'SENT',
          error_message: null,
        });
        if (ins.error) console.warn('[notifications] log insert failed:', ins.error);
        sent += 1;
      }
    } catch (err) {
      for (const item of items) {
        const ins = await admin.from('licensure_notification_log').insert({
          applicant_id: item.applicant_id,
          license_type: item.license_type,
          expires_on: item.expires_on,
          recipient_email: to,
          status: 'FAILED',
          error_message: safeText(err?.message || err),
        });
        if (ins.error) console.warn('[notifications] log insert failed:', ins.error);
        failed += 1;
      }
    }
  }

  return {
    ok: true,
    summary: { sent, failed, skipped },
    message: 'Resend all complete.',
  };
});

// Register a custom protocol so Next export can fetch absolute paths like
// /_next/*, /Main_Modules.txt, etc. This avoids file:// origin issues in production.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const isDev = (!app.isPackaged && process.env.ELECTRON_FORCE_PROD !== '1') || process.env.ELECTRON_DEV === '1';

let mainWindow = null;

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.once('ready-to-show', () => {
    try {
      win.show();
      win.focus();
    } catch {
      // ignore
    }
  });

  win.on('show', () => {
    try {
      win.focus();
    } catch {
      // ignore
    }
  });

  console.log('[electron] isDev:', isDev, 'url:', url);
  win.loadURL(url);

  win.webContents.on('did-finish-load', () => {
    try {
      win.focus();
    } catch {
      // ignore
    }
  });

  // if (isDev) win.webContents.openDevTools(); //It runs with Inspect Element opened if enabled.

  return win;
}

function registerAppProtocol() {
  const outDir = path.join(__dirname, '..', 'out');
  const fallback404 = path.join(outDir, '404.html');
  const fallbackIndex = path.join(outDir, 'index.html');

  protocol.registerFileProtocol('app', (request, callback) => {
    try {
      const url = new URL(request.url);
      let requestPath = decodeURIComponent(url.pathname);

      if (!requestPath || requestPath === '/') {
        callback({ path: fallbackIndex });
        return;
      }

      // Strip leading slash for safe join
      requestPath = requestPath.replace(/^\//, '');

      // Resolve candidates.
      const candidates = [];
      const direct = path.join(outDir, requestPath);
      const ext = path.extname(direct);

      candidates.push(direct);

      // If path has no extension, Next export may have produced either:
      // - /route.html
      // - /route/index.html (trailingSlash)
      if (!ext) {
        candidates.push(`${direct}.html`);
        candidates.push(path.join(direct, 'index.html'));
      } else {
        // Next export (app router) often writes /route/index.txt and /route/index.html,
        // while runtime may request /route.txt or /route.html.
        const baseName = path.basename(direct, ext);
        const dirName = path.dirname(direct);
        candidates.push(path.join(dirName, baseName, `index${ext}`));
      }

      // If it ends with a slash, treat as directory
      if (request.url.endsWith('/')) {
        candidates.push(path.join(direct, 'index.html'));
      }

      const found = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (found) {
        callback({ path: found });
        return;
      }

      // For unknown routes, prefer a real 404 if present.
      if (fs.existsSync(fallback404)) {
        callback({ path: fallback404 });
        return;
      }

      callback({ path: fallbackIndex });
    } catch (err) {
      console.error('[electron] protocol handler error:', err);
      callback({ error: -2 }); // FAILED
    }
  });
}

async function startApp() {
  // DEV: always load Next dev server
  if (isDev) {
    createWindow('http://localhost:3000');
    return;
  }

  // PROD: load static export through a custom protocol.
  const outIndex = path.join(__dirname, '..', 'out', 'index.html');
  if (!fs.existsSync(outIndex)) {
    dialog.showErrorBox(
      'Build Missing',
      'Could not find out/index.html. Run `npm run build` to generate the static export before packaging.'
    );
    createWindow('about:blank');
    return;
  }

  registerAppProtocol();
  createWindow('app://-/index.html');
}

let notificationTimer = null;
let lastAutoRunKey = null;

function computeAutoRunKey(todayKey, email, preferences) {
  const useScheduledSend = preferences?.use_scheduled_send !== false;
  const sendTime = useScheduledSend ? (safeText(preferences?.send_time_local).slice(0, 5) || '08:00') : 'instant';
  const daysBefore = clampInt(preferences?.days_before_expiry, { min: 1, max: 365, fallback: 30 });
  const flags = [
    preferences?.include_driver_license ? 'D1' : 'D0',
    preferences?.include_security_license ? 'S1' : 'S0',
    preferences?.include_insurance ? 'I1' : 'I0',
    useScheduledSend ? 'T1' : 'T0',
    preferences?.is_enabled ? 'E1' : 'E0',
    email?.is_active === false ? 'A0' : 'A1',
  ].join('');

  return [todayKey, sendTime, String(daysBefore), flags, safeText(email?.gmail_user)].join('|');
}

async function maybeAutoSendNotifications() {
  try {
    const admin = getAdminSupabase();
    const { email, preferences } = await loadNotificationConfig(admin);
    if (!preferences?.is_enabled) return;
    if (email && !email.is_active) return;

    const now = new Date();
    const todayKey = ymd(now);
    if (!todayKey) return;

    const runKey = computeAutoRunKey(todayKey, email, preferences);
    if (lastAutoRunKey === runKey) return;

    const useScheduledSend = preferences?.use_scheduled_send !== false;
    if (useScheduledSend) {
      const sendTime = safeText(preferences.send_time_local).slice(0, 5) || '08:00';
      const [hhRaw, mmRaw] = sendTime.split(':');
      const hh = Number(hhRaw ?? 8);
      const mm = Number(mmRaw ?? 0);
      const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
      if (now.getTime() < due.getTime()) return;
    }

    const result = await runNotificationSend(admin);
    if (result?.ok) {
      lastAutoRunKey = runKey;
      console.log('[notifications] auto-run:', result?.summary ?? {});
    }
  } catch (e) {
    console.warn('[notifications] auto-run failed:', e?.message ?? e);
  }
}

app.whenReady().then(startApp);

app.whenReady().then(() => {
  // Scheduler: checks once per minute while app is open.
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = setInterval(() => {
    void maybeAutoSendNotifications();
  }, 60 * 1000);
  void maybeAutoSendNotifications();
});

app.on('window-all-closed', () => {
  app.quit();
});