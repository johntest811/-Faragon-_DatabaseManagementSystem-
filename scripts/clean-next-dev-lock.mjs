import fs from "node:fs";
import path from "node:path";

const lockPath = path.join(process.cwd(), ".next", "dev", "lock");

try {
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
    // eslint-disable-next-line no-console
    console.log(`[dev] Removed stale Next dev lock: ${lockPath}`);
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn(`[dev] Could not remove Next dev lock: ${lockPath}`, err);
}
