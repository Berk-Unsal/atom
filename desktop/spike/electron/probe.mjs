// D01 (#148) Electron spike probe: drives the real app with Playwright's
// Electron automation and records observations under build/evidence/.
//
// Usage: node probe.mjs <run-name> [--lifecycle] [--print] [--memory]
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const evidence = resolve(here, "build/evidence");
mkdirSync(evidence, { recursive: true });
const [runName = "run", ...flags] = process.argv.slice(2);
const electronBinary = process.env.ATOM_SPIKE_ELECTRON || (await import("electron")).default;
// Extra Chromium switches, e.g. --ozone-platform=wayland for the Wayland run.
const extraArgs = (process.env.ATOM_SPIKE_ELECTRON_ARGS || "").split(" ").filter(Boolean);
// Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE to child
// processes, which would start this app as plain Node.
const { ELECTRON_RUN_AS_NODE: _ignored, ...inherited } = process.env;
const env = {
  ...inherited,
  ATOM_SPIKE_DIST: resolve(root, "frontend-react/dist"),
  ATOM_SPIKE_SIDECAR: resolve(here, "build/atom-api"),
  ATOM_SPIKE_DATASET_DIR: resolve(root, "data-pipeline"),
  ATOM_SPIKE_PROFILE: resolve(here, "build/profile-release"),
  ATOM_SPIKE_NO_EXTERNAL: "1",
};
const result = { run: runName, electron_version: null, chromium_version: null };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const spikeState = (app) => app.evaluate(() => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(global.__atomSpike).filter(([, v]) => typeof v !== "function")))));
const listening = (pid) => { try { return execFileSync("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" }).trim(); } catch { return ""; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitGone(pid, limitMs) {
  const started = Date.now();
  while (alive(pid) && Date.now() - started < limitMs) await sleep(50);
  return { exited: !alive(pid), after_ms: Date.now() - started, listener: listening(pid) };
}

const launchStarted = Date.now();
const app = await electron.launch({ chromiumSandbox: true, executablePath: electronBinary, args: [here, ...extraArgs], env, timeout: 60_000 });
const page = await app.firstWindow();
Object.assign(result, await app.evaluate(() => ({ electron_version: process.versions.electron, chromium_version: process.versions.chrome })));
result.platform = (await spikeState(app)).platform;
const runSector = page.getByRole("button", { name: "Run Sector" });
await runSector.waitFor({ state: "visible", timeout: 120_000 });
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Run Sector" && !b.disabled), null, { timeout: 120_000 });
result.launch_to_plannable_ms = Date.now() - launchStarted;
result.sidecar = (await spikeState(app)).sidecar;
result.environment = await page.evaluate(() => ({ href: location.href, origin: location.origin, secure_context: isSecureContext, user_agent: navigator.userAgent, theme_attribute: document.documentElement.getAttribute("data-theme") }));

result.api = await page.evaluate(async () => {
  const out = {};
  const meta = await (await fetch("/api/meta")).json();
  out.meta = { model_version: meta.model_version, supported_technologies: meta.supported_technologies, technology_statuses: (meta.technology_capabilities || []).map((c) => `${c.technology}@${c.endpoint}:${c.status}`), dataset: meta.dataset && `${meta.dataset.id}@${meta.dataset.version}` };
  const towersResponse = await fetch("/api/towers");
  const blob = await towersResponse.blob();
  const towers = JSON.parse(await blob.text()).features;
  out.towers_blob = { status: towersResponse.status, bytes: blob.size, type: blob.type, features: towers.length };
  const controller = new AbortController();
  const startedAbort = performance.now();
  const pending = fetch("/api/buildings", { signal: controller.signal }).then((r) => r.arrayBuffer());
  setTimeout(() => controller.abort(), 40);
  try { await pending; out.abort = { aborted: false }; } catch (error) { out.abort = { aborted: error.name === "AbortError", elapsed_ms: Math.round(performance.now() - startedAbort) }; }
  const coord = (f) => f.geometry.coordinates;
  const [lon0, lat0] = coord(towers[0]);
  const nearest = towers.slice().sort((a, b) => ((coord(a)[0] - lon0) ** 2 + (coord(a)[1] - lat0) ** 2) - ((coord(b)[0] - lon0) ** 2 + (coord(b)[1] - lat0) ** 2)).slice(0, 8);
  const body = JSON.stringify({ towers: nearest.map((f, i) => ({ id: String(f.properties?.id || f.properties?.cell_id || `spike-${i}`), tower_lon: coord(f)[0], tower_lat: coord(f)[1] })) });
  const startedEval = performance.now();
  const evaluation = await fetch("/api/evaluate-network", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const evaluationJSON = await evaluation.json();
  out.evaluate_8_cells = { status: evaluation.status, elapsed_ms: Math.round(performance.now() - startedEval), scenario_fingerprint: evaluationJSON.scenario_fingerprint, towers: (evaluationJSON.optimized_towers || []).length };
  return out;
});

// Real user input from here on.
const startedSector = Date.now();
await runSector.click();
await page.locator(".run-state", { hasText: "Ready" }).waitFor({ timeout: 120_000 });
result.run_sector_ui_ms = Date.now() - startedSector;
await page.getByRole("button", { name: "Propagation rays layer" }).click().catch(() => {});
await sleep(3000);
result.map = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll("img.leaflet-tile")];
  return { leaflet_container: !!document.querySelector(".leaflet-container"), tiles_total: tiles.length, tiles_loaded: tiles.filter((t) => t.complete && t.naturalWidth > 0).length,
    tile_hosts: [...new Set(tiles.map((t) => new URL(t.src).host))], svg_paths: document.querySelectorAll(".leaflet-overlay-pane svg path").length, canvases: document.querySelectorAll("canvas").length };
});
await page.screenshot({ path: resolve(evidence, `${runName}-map.png`) });
result.keyboard_focus = [];
await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
for (let i = 0; i < 6; i += 1) {
  await page.keyboard.press("Tab");
  result.keyboard_focus.push(await page.evaluate(() => { const el = document.activeElement; return el ? `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}` : null; }));
}
for (const scheme of ["light", "dark"]) {
  await page.emulateMedia({ colorScheme: scheme });
  await sleep(300);
  result[`theme_${scheme}`] = await page.evaluate(() => ({ attribute: document.documentElement.getAttribute("data-theme"), background: getComputedStyle(document.body).backgroundColor }));
}

result.storage = await page.evaluate(async (marker) => {
  const databases = (await indexedDB.databases()).map((d) => d.name);
  const previous = await new Promise((done, fail) => {
    const open = indexedDB.open("atom-desktop-spike", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("runs");
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("runs", "readwrite");
      const read = tx.objectStore("runs").get("last");
      read.onsuccess = () => { tx.objectStore("runs").put(marker, "last"); tx.oncomplete = () => { open.result.close(); done(read.result || null); }; };
    };
  });
  return { databases, previous_marker: previous };
}, { address: result.sidecar.address, generation: result.sidecar.generation, at: new Date().toISOString() });

// Navigation enforcement through reachable UI, scripts and frames.
const attribution = page.locator('.leaflet-control-attribution a[href^="https://"]:not([target])').first();
result.navigation = {};
if (await attribution.count()) {
  result.navigation.attribution_href = await attribution.getAttribute("href");
  await attribution.click({ noWaitAfter: true });
  await sleep(800);
  result.navigation.after_attribution_click = page.url();
}
const blankLink = page.locator('a[target="_blank"][href^="https://"]').first();
if (await blankLink.count() && await blankLink.isVisible()) {
  result.navigation.blank_href = await blankLink.getAttribute("href");
  await blankLink.click({ noWaitAfter: true });
  await sleep(500);
}
await page.evaluate(() => { location.assign("https://example.com/"); }).catch(() => {});
await sleep(800);
result.navigation.after_scripted_assign = page.url();
result.navigation.window_open = await page.evaluate(() => String(window.open("https://example.com/")));
result.navigation.iframe = await page.evaluate(async () => {
  const violations = [];
  document.addEventListener("securitypolicyviolation", (event) => violations.push(`${event.effectiveDirective} ${event.blockedURI}`));
  const frame = document.createElement("iframe");
  frame.src = "https://example.com/";
  document.body.appendChild(frame);
  await new Promise((done) => setTimeout(done, 1000));
  let reachable = "blocked";
  try { reachable = frame.contentWindow.location.href; } catch { reachable = "cross-origin-loaded"; }
  frame.remove();
  return { reachable, csp_violations: violations };
});
result.navigation.windows = app.windows().length;
await app.evaluate(async ({ BrowserWindow }) => {
  const probe = new BrowserWindow({ show: false });
  await probe.loadURL('data:text/html,<img src="app://atom/api/meta"><script>fetch("app://atom/api/meta",{method:"POST",mode:"no-cors",body:"{}"}).catch(()=>{})</script>');
  await new Promise((done) => setTimeout(done, 800));
  probe.destroy();
});
const state = await spikeState(app);
result.navigation.blocked = state.blockedNavigations;
result.navigation.external_requests = state.externalRequests;
result.cross_origin_rejections = state.rejectedRequests;
result.api_request_headers_sample = state.apiRequests.slice(0, 3).map(({ origin, site }) => ({ origin, site }));
result.api_requests = state.apiRequests;

if (flags.includes("--print")) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const textOf = async (bytes) => {
    const document = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const pages = [];
    for (let i = 1; i <= document.numPages; i += 1) pages.push((await (await document.getPage(i)).getTextContent()).items.map((item) => item.str).join(" "));
    return { pages: document.numPages, text: pages.join("\n") };
  };
  const reference = await chromium.launch();
  result.print = {};
  const reportsDir = resolve(here, "build/reports");
  const names = existsSync(reportsDir) ? readdirSync(reportsDir).filter((file) => file.endsWith(".html")).map((file) => file.slice(0, -5)) : [];
  if (!names.length) throw new Error("--print needs report HTML in build/reports (run workflows.mjs or render-report.mjs first)");
  const turkish = "Çankaya İş Ağı Şebeke Öğrenim Üssü";
  for (const name of names) {
    const html = readFileSync(resolve(reportsDir, `${name}.html`), "utf8");
    const electronPDF = Buffer.from(await app.evaluate(async (_electron, value) => Buffer.from(await global.__atomSpike.printHtmlToPDF(value)).toString("base64"), html), "base64");
    writeFileSync(resolve(evidence, `${runName}-${name}.pdf`), electronPDF);
    const referencePage = await reference.newPage();
    await referencePage.setContent(html);
    await referencePage.evaluate(() => document.fonts.ready);
    const referencePDF = await referencePage.pdf({ format: "A4", preferCSSPageSize: true, displayHeaderFooter: false, printBackground: true, tagged: true, outline: true });
    await referencePage.close();
    writeFileSync(resolve(evidence, `${runName}-${name}.chromium-reference.pdf`), referencePDF);
    const [ours, theirs] = [await textOf(electronPDF), await textOf(referencePDF)];
    // Chromium versions split text runs differently (letter-spacing, number
    // grouping), so compare against the Electron text with whitespace removed.
    const compact = ours.text.replace(/\s+/g, "");
    const reference_words = new Set(theirs.text.split(/\s+/).filter(Boolean));
    const missing = [...reference_words].filter((w) => !compact.includes(w));
    result.print[name] = {
      electron_pages: ours.pages, chromium_reference_pages: theirs.pages, bytes: electronPDF.length,
      tagged: electronPDF.toString("latin1").includes("/StructTreeRoot"),
      has_decision_summary: html.includes("Decision summary") ? ours.text.includes("Decision summary") : "not-in-source", has_turkish_project: html.includes(turkish) ? ours.text.includes(turkish) : "not-in-source",
      reference_words: reference_words.size, missing_reference_words: missing.length, missing_sample: missing.slice(0, 12),
    };
  }
  await reference.close();
}

if (flags.includes("--memory")) {
  await sleep(60_000);
  const mainPid = app.process().pid;
  const table = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss=,comm="], { encoding: "utf8" }).trim().split("\n").map((line) => line.trim().split(/\s+/, 4));
  const children = new Map();
  for (const [pid, ppid] of table) children.set(ppid, [...(children.get(ppid) || []), pid]);
  const tree = new Set([String(mainPid)]);
  for (const pid of tree) for (const child of children.get(pid) || []) tree.add(child);
  // Linux also reports PSS, which splits shared pages across the tree.
  const pss = (pid) => { try { return Math.round(Number(/^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"))[1]) / 1024); } catch { return null; } };
  const rows = table.filter(([pid]) => tree.has(pid)).map(([pid, , rss, comm]) => ({ pid, rss_mib: Math.round(Number(rss) / 1024), pss_mib: pss(pid), comm: comm.split("/").pop() }));
  const total = (key) => (rows.every((r) => r[key] !== null) ? rows.reduce((sum, r) => sum + r[key], 0) : null);
  const sidecar = rows.find((r) => r.comm === "atom-api");
  result.memory_after_60s_idle = { total_rss_mib: total("rss_mib"), total_pss_mib: total("pss_mib"), sidecar_rss_mib: sidecar?.rss_mib, sidecar_pss_mib: sidecar?.pss_mib, processes: rows };
}

if (flags.includes("--lifecycle")) {
  // Second launch focuses the first instance and spawns no sidecar.
  const startedSecond = Date.now();
  const second = spawn(electronBinary, [here, ...extraArgs], { env, stdio: "ignore" });
  const secondExit = await new Promise((done) => second.once("exit", (code) => done({ code, after_ms: Date.now() - startedSecond })));
  await sleep(300);
  result.second_instance = { ...secondExit, focused_first: (await spikeState(app)).secondInstance, sidecars: execFileSync("pgrep", ["-f", "atom-api --desktop-control"], { encoding: "utf8" }).trim().split("\n").length };
  // A sidecar crash must surface as an error, never as a silent replay.
  const sidecarPid = result.sidecar.pid;
  process.kill(sidecarPid, "SIGKILL");
  await waitGone(sidecarPid, 5000);
  result.after_sidecar_crash = await page.evaluate(async () => { const r = await fetch("/api/meta"); return { status: r.status }; });
  result.crash_events = (await spikeState(app)).events.filter((e) => e.event === "sidecar-exit");
  await app.close();
} else {
  const sidecarPid = result.sidecar.pid;
  const startedQuit = Date.now();
  await app.close();
  result.quit = { app_closed_ms: Date.now() - startedQuit, ...(await waitGone(sidecarPid, 35_000)) };
}

writeFileSync(resolve(evidence, `${runName}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
