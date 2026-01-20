const { app, BrowserWindow, protocol, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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