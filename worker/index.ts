import fs from "node:fs";
import path from "node:path";

// load .env BEFORE importing modules that read process.env at module init
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] == null) process.env[k] = v.replace(/^['"]|['"]$/g, "");
  }
}

console.log("[worker] env loaded; cookie len:", (process.env.RPOW_SESSION_COOKIE ?? "").length);

async function main() {
  const { tick } = await import("../lib/market");
  console.log("[worker] starting");
  while (true) {
    const t0 = Date.now();
    try {
      await tick();
    } catch (e) {
      console.error("[worker] tick error", e);
    }
    const elapsed = Date.now() - t0;
    await new Promise((r) => setTimeout(r, Math.max(0, 5000 - elapsed)));
  }
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
