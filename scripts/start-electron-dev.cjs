const { spawn } = require('child_process');

const electronBinary = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ['.'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: false,
  env,
});

child.on('close', (code, signal) => {
  if (code === null) {
    console.error(`Electron exited with signal ${signal}`);
    process.exit(1);
    return;
  }
  process.exit(code);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
