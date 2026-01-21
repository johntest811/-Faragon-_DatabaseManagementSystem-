const { app, BrowserWindow, protocol, dialog, ipcMain } = require('electron');
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

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  app.quit();
});