// D01 (#148) development-loop probe: the repository's own Vite config served
// on loopback, Electron loading it through the stable app://atom origin, and
// 20 warmed CSS and JS-module edits timed from file write to visible change.
// The edited files are spike-only and live under build/hmr/; no frontend
// source is modified.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { _electron as electron } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const frontend = resolve(root, "frontend-react");
const hmrDir = resolve(here, "build/hmr");
const evidence = resolve(here, "build/evidence");
mkdirSync(hmrDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const writeCSS = (value) => writeFileSync(resolve(hmrDir, "probe.css"), `:root { --atom-spike-hmr: "${value}"; }\n`);
const writeJS = (value) => writeFileSync(resolve(hmrDir, "stamp.js"), `export const stamp = "${value}";\n`);
writeCSS("css-0");
writeJS("js-0");
writeFileSync(resolve(hmrDir, "probe.js"), `import "./probe.css";
import { stamp } from "./stamp.js";
const state = window.__atomHmr || (window.__atomHmr = { session: Math.random().toString(36).slice(2), css: {}, js: {} });
const record = (kind, value) => { if (state[kind].value !== value) state[kind] = { value, at: Date.now() }; };
record("js", stamp);
const tick = () => { record("css", getComputedStyle(document.documentElement).getPropertyValue("--atom-spike-hmr").trim().replaceAll('"', "")); requestAnimationFrame(tick); };
requestAnimationFrame(tick);
if (import.meta.hot) import.meta.hot.accept("./stamp.js", (module) => record("js", module.stamp));
`);

const { createServer } = await import(pathToFileURL(resolve(frontend, "node_modules/vite/dist/node/index.js")).href);
const server = await createServer({
  configFile: resolve(frontend, "vite.config.js"),
  root: frontend,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 5173, strictPort: true, hmr: { protocol: "ws", host: "127.0.0.1", port: 5173, clientPort: 5173 }, fs: { allow: [frontend, here] } },
  plugins: [{ name: "atom-desktop-spike-hmr", transformIndexHtml: () => [{ tag: "script", attrs: { type: "module", src: `/@fs${resolve(hmrDir, "probe.js")}` }, injectTo: "body" }] }],
});
await server.listen();

const { ELECTRON_RUN_AS_NODE: _ignored, ...inherited } = process.env;
const app = await electron.launch({
  executablePath: process.env.ATOM_SPIKE_ELECTRON || (await import("electron")).default,
  args: [here, ...(process.env.ATOM_SPIKE_ELECTRON_ARGS || "").split(" ").filter(Boolean)],
  env: { ...inherited, ATOM_SPIKE_DEV_SERVER: "http://127.0.0.1:5173", ATOM_SPIKE_SIDECAR: resolve(here, "build/atom-api"), ATOM_SPIKE_DATASET_DIR: resolve(root, "data-pipeline"), ATOM_SPIKE_PROFILE: resolve(here, "build/profile-dev"), ATOM_SPIKE_NO_EXTERNAL: "1" },
});
const result = {};
try {
  const page = await app.firstWindow();
  const violations = [];
  page.on("console", (message) => { if (/Content Security Policy|WebSocket|hmr/i.test(message.text())) violations.push(message.text().slice(0, 200)); });
  const started = Date.now();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Run Sector" && !b.disabled), null, { timeout: 120_000 });
  result.dev_launch_to_plannable_ms = Date.now() - started;
  result.origin = await page.evaluate(() => location.origin);
  await page.waitForFunction(() => window.__atomHmr && window.__atomHmr.css.value === "css-0", null, { timeout: 30_000 });
  const session = await page.evaluate(() => window.__atomHmr.session);
  const measure = async (kind, write, count, warmup) => {
    const samples = [];
    for (let i = 1; i <= count + warmup; i += 1) {
      const value = `${kind}-${i}`;
      await new Promise((done) => setTimeout(done, 250));
      const writtenAt = Date.now();
      write(value);
      await page.waitForFunction(([k, v]) => window.__atomHmr[k].value === v, [kind, value], { timeout: 10_000, polling: 16 });
      const visibleAt = await page.evaluate((k) => window.__atomHmr[k].at, kind);
      if (i > warmup) samples.push(visibleAt - writtenAt);
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
    return { samples, p50_ms: percentile(50), p95_ms: percentile(95), max_ms: sorted.at(-1) };
  };
  result.css = await measure("css", writeCSS, 20, 3);
  result.js = await measure("js", writeJS, 20, 3);
  result.full_reloads = (await page.evaluate(() => window.__atomHmr.session)) === session ? 0 : "reloaded";
  result.console_hmr_or_csp_messages = violations;
  result.api_through_dev_origin = await page.evaluate(async () => (await fetch("/api/meta")).status);
} finally {
  await app.close();
  await server.close();
}
writeFileSync(resolve(evidence, "electron-hmr.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
