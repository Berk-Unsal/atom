// D01 (#148) / D03 regression: a sidecar that is missing or exits at once
// must leave the shell responsive, record a startup failure and answer API
// calls with an error, never block on a native error dialog.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const { ELECTRON_RUN_AS_NODE: _ignored, ...inherited } = process.env;
const results = [];
for (const [name, sidecar] of [["exits-immediately", process.platform === "darwin" ? "/usr/bin/false" : "/bin/false"], ["missing-binary", resolve(here, "build/does-not-exist")]]) {
  const app = await electron.launch({ chromiumSandbox: true, executablePath: process.env.ATOM_SPIKE_ELECTRON || (await import("electron")).default,
    args: [here, ...(process.env.ATOM_SPIKE_ELECTRON_ARGS || "").split(" ").filter(Boolean)], timeout: 60_000,
    env: { ...inherited, ATOM_SPIKE_DIST: process.env.ATOM_SPIKE_DIST || resolve(root, "frontend-react/dist"), ATOM_SPIKE_SIDECAR: sidecar, ATOM_SPIKE_PROFILE: resolve(here, `build/profile-missing-${name}`), ATOM_SPIKE_NO_EXTERNAL: "1" } });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const status = await page.evaluate(async () => (await fetch("/api/meta")).status);
  const events = await app.evaluate(() => global.__atomSpike.events.map((e) => e.event));
  results.push({ name, window_url: page.url(), api_status: status, events, ok: page.url() === "app://atom/" && status >= 500 && events.includes("startup-failed") });
  await app.close();
}
mkdirSync(resolve(here, "build/evidence"), { recursive: true });
writeFileSync(resolve(here, "build/evidence/missing-sidecar.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
