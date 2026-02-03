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

async function loadNotificationConfig(admin) {
  const localPrefs = loadLocalNotificationPrefs();
  const [emailRes, prefRes] = await Promise.all([
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
        'id, is_enabled, days_before_expiry, include_driver_license, include_security_license, include_insurance, send_time_local, timezone'
      )
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (emailRes.error) throw emailRes.error;
  if (prefRes.error) throw prefRes.error;

  return {
    email: emailRes.data ?? null,
    preferences: prefRes.data ?? null,
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
  const raw = safeText(notes);
  if (!raw) return { subject: null, bodyHtml: null, legacyMessage: null };

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const subject = safeText(parsed.subject);
      const bodyHtml = safeText(parsed.bodyHtml);
      return {
        subject: subject || null,
        bodyHtml: bodyHtml || null,
        legacyMessage: null,
      };
    }
  } catch {
    // ignore
  }

  return { subject: null, bodyHtml: null, legacyMessage: raw };
}

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

function renderEmailHtml({ recipientName, items, daysBefore, bodyHtml, legacyMessage }) {
  const msg = safeText(legacyMessage);
  const safeBody = safeText(bodyHtml) ? sanitizeEmailBodyHtml(bodyHtml) : '';

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
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;color:#111">
    <h2 style="margin:0 0 8px 0;">Licensure Expiration Warning</h2>
    <div style="color:#444;margin-bottom:16px;">This is an automated reminder for licensures expiring within ${escapeHtml(
      String(daysBefore)
    )} days.</div>
    <div style="margin-bottom:12px;">Hello ${escapeHtml(recipientName || 'there')},</div>
    ${safeBody ? `<div style="margin:0 0 12px 0;">${safeBody}</div>` : ''}
    ${!safeBody && msg ? `<div style="margin:0 0 12px 0;padding:10px 12px;border:1px solid #eee;background:#fafafa;border-radius:8px;">${escapeHtml(msg)}</div>` : ''}
    <table style="border-collapse:collapse;width:100%;max-width:640px;">
      <thead>
        <tr>
          <th align="left" style="padding:8px 6px;border-bottom:2px solid #ddd;">Type</th>
          <th align="left" style="padding:8px 6px;border-bottom:2px solid #ddd;">Expires On</th>
          <th align="left" style="padding:8px 6px;border-bottom:2px solid #ddd;">Days</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div style="margin-top:16px;color:#666;font-size:12px;">Please coordinate renewal as soon as possible.</div>
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
      .select('applicant_id, first_name, middle_name, last_name, extn_name, client_email, client_contact_num')
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
        ((du >= 0 && du <= daysBefore) || (includeExpired && du < 0 && Math.abs(du) <= expiredWithinDays))
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
        ((du >= 0 && du <= daysBefore) || (includeExpired && du < 0 && Math.abs(du) <= expiredWithinDays))
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
        ((du >= 0 && du <= daysBefore) || (includeExpired && du < 0 && Math.abs(du) <= expiredWithinDays))
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

async function runNotificationSend(admin) {
  const { email, preferences } = await loadNotificationConfig(admin);
  if (!preferences?.is_enabled) {
    return { ok: true, summary: { sent: 0, failed: 0, skipped: 0 }, message: 'Notifications are disabled.' };
  }
  if (email && !email.is_active) {
    return { ok: true, summary: { sent: 0, failed: 0, skipped: 0 }, message: 'Gmail sender is not active.' };
  }

  const { transporter, from } = buildTransport(email);
  const localPrefs = loadLocalNotificationPrefs();
  const expiring = await fetchExpiringRows(admin, preferences, localPrefs);

  // Avoid re-sending the same applicant/type/expires_on within today.
  const todayIso = startOfTodayLocal().toISOString();
  const sentTodayRes = await admin
    .from('licensure_notification_log')
    .select('applicant_id, license_type, expires_on, status')
    .gte('created_at', todayIso)
    .eq('status', 'SENT');
  if (sentTodayRes.error) throw sentTodayRes.error;
  const sentKey = new Set(
    (sentTodayRes.data ?? []).map((x) => `${x.applicant_id}:${x.license_type}:${String(x.expires_on)}`)
  );

  // Group email by recipient (client_email) to reduce spam.
  const byRecipient = new Map();
  for (const item of expiring) {
    const k = `${item.applicant_id}:${item.license_type}:${item.expires_on}`;
    if (sentKey.has(k)) continue;
    const to = safeText(item.client_email);
    if (!to) {
      // Log skipped.
      await admin.from('licensure_notification_log').insert({
        applicant_id: item.applicant_id,
        license_type: item.license_type,
        expires_on: item.expires_on,
        recipient_email: null,
        status: 'SKIPPED',
        error_message: 'Missing recipient email (client_email).',
      });
      continue;
    }
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
  skipped = Math.max(0, expiring.length - sent - failed);
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
  return { rows: res.data ?? [] };
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

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  console.log('[electron] isDev:', isDev, 'url:', url);
  win.loadURL(url);

  // if (isDev) win.webContents.openDevTools(); //It runs with Inspect Element opened if enabled.
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
let lastAutoRunYmd = null;

async function maybeAutoSendNotifications() {
  try {
    const admin = getAdminSupabase();
    const { email, preferences } = await loadNotificationConfig(admin);
    if (!preferences?.is_enabled) return;
    if (!email?.is_active) return;

    const now = new Date();
    const todayKey = ymd(now);
    if (!todayKey) return;
    if (lastAutoRunYmd === todayKey) return;

    const sendTime = safeText(preferences.send_time_local).slice(0, 5) || '08:00';
    const [hhRaw, mmRaw] = sendTime.split(':');
    const hh = Number(hhRaw ?? 8);
    const mm = Number(mmRaw ?? 0);
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (now.getTime() < due.getTime()) return;

    const result = await runNotificationSend(admin);
    if (result?.ok) {
      lastAutoRunYmd = todayKey;
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