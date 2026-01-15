const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isDev = !app.isPackaged || process.env.ELECTRON_DEV === '1';
let nextProcess;

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

  if (isDev) win.webContents.openDevTools();
}

async function startApp() {
  // DEV: always load Next dev server
  if (isDev) {
    createWindow('http://localhost:3000');
    return;
  }

  // PROD: prefer static export
  const outIndex = path.join(__dirname, '..', 'out', 'index.html');
  if (fs.existsSync(outIndex)) {
    const ok = await new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    }).loadFile(outIndex).then(() => true).catch(() => false);

    if (ok) {
      createWindow(`file://${outIndex}`);
      return;
    }
  }

  // PROD fallback: start Next server (SSR/API mode)
  nextProcess = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', '3000'],
    { cwd: path.join(__dirname, '..'), env: { ...process.env }, stdio: 'inherit' }
  );

  const waitOn = require('wait-on');
  await waitOn({ resources: ['http://localhost:3000'], timeout: 30000 });
  createWindow('http://localhost:3000');
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  if (nextProcess) nextProcess.kill();
  app.quit();
});