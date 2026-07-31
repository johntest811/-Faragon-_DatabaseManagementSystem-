import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const port = Number.parseInt(String(process.env.NEXT_DEV_PORT || "3001"), 10) || 3001;
const devUrl = `http://localhost:${port}`;
const loginUrl = `${devUrl}/Login/`;
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const electronStarter = path.join(projectRoot, "scripts", "start-electron-dev.cjs");
const staleLockPath = path.join(projectRoot, ".next", "dev", "lock");

let nextChild = null;
let electronChild = null;
let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortListening() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (listening) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(listening);
    };

    socket.setTimeout(700);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function inspectDevServer() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);

  try {
    const response = await fetch(loginUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await response.text();
    const isNext = html.includes("/_next/");
    return {
      reachable: true,
      isNext,
      isFaragon: response.ok && html.includes("Faragon") && isNext,
      status: response.status,
    };
  } catch {
    return { reachable: false, isNext: false, isFaragon: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForFaragonServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inspection = await inspectDevServer();
    if (inspection.isFaragon) return true;
    if (nextChild && nextChild.exitCode !== null) return false;
    await wait(500);
  }
  return false;
}

function removeStaleNextLock() {
  try {
    if (!fs.existsSync(staleLockPath)) return;
    fs.unlinkSync(staleLockPath);
    console.log(`[dev] Removed stale Next lock: ${staleLockPath}`);
  } catch (error) {
    console.warn(`[dev] Could not remove stale Next lock: ${error?.message || error}`);
  }
}

function spawnElectron() {
  return spawn(process.execPath, [electronStarter], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: false,
    env: {
      ...process.env,
      NEXT_DEV_PORT: String(port),
      ELECTRON_DEV: "1",
      NODE_ENV: "development",
    },
  });
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // The process already exited.
    }
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopProcessTree(electronChild);
  stopProcessTree(nextChild);
  process.exit(exitCode);
}

function exitResult(child, source) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ source, code: 1, error }));
    child.once("exit", (code, signal) => resolve({ source, code: code ?? (signal ? 1 : 0), signal }));
  });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => shutdown(0));
}

async function main() {
  const initialInspection = await inspectDevServer();
  if (initialInspection.isFaragon) {
    console.log(`[dev] Faragon is already running at ${devUrl}. Focusing the existing application.`);
    electronChild = spawnElectron();
    const result = await exitResult(electronChild, "electron");
    if (result.error) console.error(`[dev] Electron failed: ${result.error.message}`);
    process.exit(result.code);
  }

  if (await isPortListening()) {
    if (!initialInspection.reachable || initialInspection.isNext) {
      console.log(`[dev] Port ${port} is opening. Waiting for the existing server...`);
      if (await waitForFaragonServer(15_000)) {
        console.log(`[dev] Reusing the Faragon server at ${devUrl}.`);
        electronChild = spawnElectron();
        const result = await exitResult(electronChild, "electron");
        process.exit(result.code);
      }
    }

    throw new Error(
      `Port ${port} is already used by another application. Close that application or set NEXT_DEV_PORT to a free port.`
    );
  }

  removeStaleNextLock();

  nextChild = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: projectRoot,
    stdio: "inherit",
    detached: process.platform !== "win32",
    windowsHide: false,
    env: {
      ...process.env,
      NEXT_DEV_PORT: String(port),
      NODE_ENV: "development",
    },
  });

  console.log(`[dev] Starting Next.js at ${devUrl}...`);
  if (!(await waitForFaragonServer(90_000))) {
    throw new Error(`Next.js did not become ready at ${loginUrl}.`);
  }

  console.log("[dev] Next.js is ready. Starting Electron...");
  electronChild = spawnElectron();

  const result = await Promise.race([
    exitResult(nextChild, "next"),
    exitResult(electronChild, "electron"),
  ]);

  if (result.error) {
    console.error(`[dev] ${result.source} failed: ${result.error.message}`);
  } else if (result.code !== 0) {
    console.error(`[dev] ${result.source} exited with code ${result.code}.`);
  }

  shutdown(result.code);
}

main().catch((error) => {
  console.error(`[dev] ${error?.message || error}`);
  shutdown(1);
});
