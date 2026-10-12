// Offline geometry tests using production CSS and the actual shared layout classes.
// These do not log in or access production data.
const electron = require('electron');
const { app, BrowserWindow } = electron;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
if (!app) {
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [__filename], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} else {
app.disableHardwareAcceleration();
app.setPath('userData', path.join(root, '.next', 'responsive-test-profile'));

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  });
}

function classFrom(source, prefix) {
  const result = source.match(new RegExp(`className="(${prefix}[^\"]*)"`));
  assert.ok(result, `Missing production class ${prefix}`);
  return result[1];
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, useContentSize: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    const css = filesIn(path.join(root, 'out', '_next', 'static'))
      .filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(name, 'utf8')).join('\n');
    const layout = fs.readFileSync(path.join(root, 'src/app/Main_Modules/layout.tsx'), 'utf8');
    const editor = fs.readFileSync(path.join(root, 'src/app/Components/EmployeeEditorModal.tsx'), 'utf8');
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>
      <div class="${classFrom(layout, 'app-shell')}" style="--app-header-height:128px">
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="${classFrom(layout, 'app-header')}" style="height:128px">
            <div class="${classFrom(layout, 'app-notification-actions')}"><div class="relative">
              <button>Notifications</button>
              <div id="popover" class="absolute right-0 mt-3 w-[420px] max-w-[92vw] rounded-2xl bg-white p-4">Expiration notifications</div>
            </div></div>
          </header>
          <main id="main" class="${classFrom(layout, 'app-page-scroll')}">
            <div class="app-page-content"><div id="table-scroll" class="overflow-x-auto"><table style="width:1400px"><tbody><tr><td>Wide inventory table</td></tr></tbody></table></div>
              <div style="height:1600px">Scrollable page content</div>
            </div>
          </main>
        </div>
      </div>
      <div id="overlay" class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-3">
        <div id="dialog" class="${classFrom(editor, 'employee-editor-dialog')}">
          <header class="shrink-0 border-b p-4">Employee form <button>Close</button></header>
          <nav class="shrink-0 overflow-x-auto flex gap-2 p-4"><button>Personal</button><button>Education</button><button>Social Welfare</button><button>Employment</button><button>Documents</button></nav>
          <div id="form-content" class="${classFrom(editor, 'employee-editor-uppercase')}"><div style="height:1600px"><label>Job Title <select><option>SECURITY GUARD</option></select></label></div></div>
          <footer id="footer" class="shrink-0 border-t px-4 py-3 flex flex-wrap items-center justify-between gap-2"><button>Back</button><button>Save</button></footer>
        </div>
      </div></body></html>`;
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1024, 768], [1366, 768], [844, 390]]) {
      window.setContentSize(width, height);
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const geometry = await window.webContents.executeJavaScript(`(() => {
        const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom }; };
        const main = document.getElementById('main');
        const form = document.getElementById('form-content');
        const table = document.getElementById('table-scroll');
        table.scrollLeft = 100; main.scrollTop = 100; form.scrollTop = 100;
        return { width:innerWidth, height:innerHeight, dialog:rect('dialog'), footer:rect('footer'), popover:rect('popover'),
          mainScroll:main.scrollTop, formScroll:form.scrollTop, tableScroll:table.scrollLeft, touch:getComputedStyle(main).touchAction,
          pageWidth:document.documentElement.scrollWidth };
      })()`);
      assert.equal(geometry.width, width);
      assert.ok(geometry.dialog.top >= 0 && geometry.dialog.bottom <= height + 1, `Dialog clipped at ${width}x${height}`);
      assert.ok(geometry.footer.bottom <= height, 'Save footer must remain visible');
      assert.ok(geometry.mainScroll > 0 && geometry.formScroll > 0, 'Page and form must scroll independently');
      assert.ok(geometry.tableScroll > 0, 'Tables must pan horizontally');
      assert.match(geometry.touch, /pan-x|auto|manipulation/, 'Ancestor must allow horizontal touch panning');
      assert.ok(geometry.pageWidth <= width, 'Page must not overflow horizontally');
      if (width < 1024) assert.ok(geometry.popover.left >= 0 && geometry.popover.right <= width, 'Mobile notification panel must fit');
      console.log(`PASS responsive shared layout ${width}x${height}`);
    }
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error.message?.slice(0, 600) ?? error);
    window.destroy();
    app.exit(1);
  }
});
}
