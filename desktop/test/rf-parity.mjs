// External native qualification; no production probes or admission overrides.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { launchNative } from "./native-launch.mjs";
import { waitForRuntime } from "./runtime-wait.mjs";
import { startupDiagnostics } from "./startup-diagnostics.mjs";
import { sourceIdentity, distribution, processTree, assertExited, sha256, sleep } from "./qualification-support.mjs";
import { DEFAULT_SIMULATION } from "../../frontend-react/src/generated/policy.js";
import { createDefaultOptimizationConfig } from "../../frontend-react/src/utils/optimizationConfig.js";
import { buildSimulationPayload, buildNetworkOptimizationPayload } from "../../frontend-react/src/utils/requestPayloads.js";
import { createProjectWorkspace, updateProjectDraft, exportProjectFile, datasetReference } from "../../frontend-react/src/utils/projectStore.js";

const require = createRequire(import.meta.url);
const { observeAdmission, admissionWait } = require("./rf-admission.cjs");
const desktop = path.resolve(import.meta.dirname, ".."); const root = path.dirname(desktop);
const resources = path.join(desktop, "build/resources"); const evidence = path.join(desktop, "test-results");
const result = { ...sourceIdentity(root), comparisons: [], timings: {}, ui: {}, admission_waits: [],
  sampling: { warmup_pairs_per_endpoint: 1, timed_pairs_per_endpoint: 20, transport_order: "alternating; sequential RF requests" } };
const build = JSON.parse(await fs.readFile(path.join(resources, "build-info.json"), "utf8"));
assert.equal(build.commit, result.source_commit, "Rebuild resources for the measured source");
assert.equal(result.source_dirty, false, "Qualify committed clean source");
result.resource_build_commit = build.commit; result.binary_sha256 = sha256(await fs.readFile(path.join(resources, "atom-api")));
result.manifest_sha256 = sha256(await fs.readFile(path.join(resources, "data-pipeline/manifest.json")));
await fs.mkdir(evidence, { recursive: true });
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-rf-parity-"));
let application; let standalone; let page; let base; let lastReset = 0;
const admission = { native: null, standalone: null };
const checkpoint = () => fs.writeFile(path.join(evidence, "rf-parity.json"), JSON.stringify(result, null, 2) + "\n");
const nativeRequest = (endpoint, payload, headers = {}, method) => page.evaluate(async ({ endpoint, payload, extra, method }) => {
  const runtime = await window.atomDesktop.getRuntime();
  const started = performance.now();
  const response = await fetch(endpoint, { method: method || (payload ? "POST" : "GET"),
    headers: { "x-atom-client": "1", "x-atom-runtime-generation": runtime.generation, ...(payload ? { "Content-Type": "application/json" } : {}), ...extra },
    body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(90_000) });
  const text = await response.text();
  return { status: response.status, text, milliseconds: performance.now() - started,
    workflow: response.headers.get("RF-Workflow-ID"), reset: Number(response.headers.get("RateLimit-Reset")), limit: Number(response.headers.get("RateLimit-Limit")),
    remaining: response.headers.get("RateLimit-Remaining"), followupRemaining: response.headers.get("RF-Followup-Remaining") };
}, { endpoint, payload, extra: headers, method });
async function standaloneRequest(endpoint, payload, headers = {}, method) {
  const started = performance.now();
  const response = await fetch(new URL(endpoint, base), { method: method || (payload ? "POST" : "GET"),
    headers: { ...(payload ? { "Content-Type": "application/json" } : {}), ...headers }, body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(90_000), redirect: "error" });
  const text = await response.text();
  return { status: response.status, text, milliseconds: performance.now() - started,
    workflow: response.headers.get("RF-Workflow-ID"), reset: Number(response.headers.get("RateLimit-Reset")), limit: Number(response.headers.get("RateLimit-Limit")),
    remaining: response.headers.get("RateLimit-Remaining"), followupRemaining: response.headers.get("RF-Followup-Remaining") };
}
async function compare(endpoint, payload, index, expectedStatus = 200) {
  const headers = /\/(evaluate|optimize)-network$/.test(endpoint) ? { "RF-Workflow": "network-maps-v1" } : {};
  // Alternate which transport executes first; never overlap RF work.
  const replies = {};
  for (const kind of index % 2 ? ["native", "standalone"] : ["standalone", "native"]) {
    const request = kind === "native" ? nativeRequest : standaloneRequest;
    const children = headers["RF-Workflow"] ? payload.towers.length : 0;
    const waiting = admissionWait(admission[kind], children, Date.now());
    if (waiting > 0) {
      result.admission_waits.push({ transport: kind, endpoint, milliseconds: waiting });
      console.log(`Waiting ${waiting} ms for observed ${kind} RF admission before ${endpoint}`);
      const until = Date.now() + waiting;
      while (Date.now() < until) await sleep(Math.min(1000, until - Date.now()));
    }
    const response = await request(endpoint, payload, headers); replies[kind] = response;
    assert.equal(response.status, expectedStatus, `${kind} ${endpoint}: ${response.text.slice(0, 200)}`);
    admission[kind] = observeAdmission(response, Date.now());
    if (response.workflow) {
      const cleanup = await request("/api/rf-workflows", null, { "RF-Workflow-ID": response.workflow }, "DELETE");
      assert.ok(cleanup.status === 200 || cleanup.status === 204, "Release unused ordinary workflow reservation");
      admission[kind] = observeAdmission(cleanup, Date.now());
    }
  }
  assert.deepEqual(JSON.parse(replies.native.text), JSON.parse(replies.standalone.text), `${endpoint}: exact deterministic output/order mismatch`);
  assert.equal(replies.native.limit, 20); assert.equal(replies.standalone.limit, 20);
  lastReset = Math.max(admission.native.resetAt, admission.standalone.resetAt);
  result.comparisons.push({ endpoint, request_sha256: sha256(JSON.stringify(payload)), native_response_sha256: sha256(replies.native.text),
    standalone_response_sha256: sha256(replies.standalone.text), status: expectedStatus, exact_json_equal: true, index,
    native_ms: replies.native.milliseconds, standalone_ms: replies.standalone.milliseconds });
  await checkpoint(); return replies;
}
try {
  const standaloneEnv = { GIN_MODE: "release", BIND_ADDRESS: "127.0.0.1", PORT: "0", ATOM_DATASET_DIR: path.join(resources, "data-pipeline"), FRONTEND_DIST_PATH: path.join(resources, "dist") };
  for (const key of ["HOME", "TMPDIR", "LANG", "LC_ALL"]) if (process.env[key]) standaloneEnv[key] = process.env[key];
  standalone = spawn(path.join(resources, "atom-api"), [], { cwd: resources, env: standaloneEnv, stdio: "ignore" });
  const deadline = Date.now() + 30_000;
  while (!base && Date.now() < deadline) {
    if (standalone.exitCode !== null) throw new Error("Standalone Go process exited before readiness");
    try {
      const sockets = execFileSync("lsof", ["-nP", "-a", "-p", String(standalone.pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const address = /^n(127\.0\.0\.1:\d+)$/m.exec(sockets)?.[1]; if (address) base = `http://${address}`;
    } catch { /* Not listening yet. */ }
    if (!base) await sleep(50);
  }
  assert.ok(base, "Owned standalone process must bind loopback");
  const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: path.join(scratch, "profile") }; delete env.ELECTRON_RUN_AS_NODE;
  application = await launchNative({ executablePath: require("electron"), args: [desktop], env, chromiumSandbox: true, timeout: 60_000 });
  const viewport = process.argv.includes("--compact") ? [1024, 768] : [1440, 900];
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), viewport);
  page = await application.firstWindow();
  // The preload can answer runtime IPC before the initial document transition
  // has settled. Observe the actual app UI before evaluating renderer state.
  await page.waitForURL("app://atom/", { timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await waitForRuntime(page, (state) => state.state === "ready");
  result.reference.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio }));
  result.reference.work_area = await application.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await page.waitForFunction(([width, height]) => innerWidth === width && innerHeight === height, viewport);
  result.reference.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, device_pixel_ratio: devicePixelRatio }));
  assert.deepEqual([result.reference.viewport.width, result.reference.viewport.height], viewport, "Measure the requested content viewport, excluding native window chrome");
  const nativeMeta = await nativeRequest("/api/meta"); const standaloneMeta = await standaloneRequest("/api/meta");
  assert.equal(nativeMeta.status, 200); assert.equal(standaloneMeta.status, 200);
  assert.deepEqual(JSON.parse(nativeMeta.text), JSON.parse(standaloneMeta.text));
  result.metadata_exact_equal = true; const meta = JSON.parse(nativeMeta.text);
  result.dataset = datasetReference(meta); result.capabilities = meta.technology_capabilities;
  result.reference.electron = (await page.evaluate(() => window.atomDesktop.getInfo())).shellVersion;
  const geojson = JSON.parse((await nativeRequest("/api/towers")).text);
  const cells = geojson.features.map((feature) => ({ id: String(feature.id ?? `${feature.properties?.radio_type}-${feature.properties?.cell_id}`),
    cellId: feature.properties?.cell_id, coordinates: feature.geometry.coordinates, radioType: feature.properties?.radio_type,
    isSimulated: Boolean(feature.properties?.is_simulated), inventorySource: "dataset", editable: true }))
    .sort((a, b) => ((a.coordinates[0] - 32.85) ** 2 + (a.coordinates[1] - 39.92) ** 2) - ((b.coordinates[0] - 32.85) ** 2 + (b.coordinates[1] - 39.92) ** 2) || a.id.localeCompare(b.id)).slice(0, 8);
  assert.equal(cells.length, 8);
  const settings = { ...DEFAULT_SIMULATION }; const optimization = createDefaultOptimizationConfig();
  const network = buildNetworkOptimizationPayload(cells, settings, {}, optimization);
  const simulation = buildSimulationPayload(cells[0], settings);
  result.fixture = { cell_ids: cells.map((cell) => cell.id), selection: "Eight dataset towers nearest 32.85,39.92 by squared geographic distance, then ID; defaults unchanged", settings, optimization, network_request_sha256: sha256(JSON.stringify(network)) };
  // One warm-up and 20 timed pairs per endpoint, as required by D11. Every
  // unused workflow reservation is closed; observed quota exhaustion is paced
  // before the next RF request. No limit override or failed-request retry.
  for (const [endpoint, payload] of [["/api/simulate", simulation], ["/api/evaluate-network", network], ["/api/optimize-network", network]]) {
    const native = []; const standalone = [];
    for (let index = 0; index <= 20; index++) {
      const replies = await compare(endpoint, payload, index);
      if (index > 0) { native.push(replies.native.milliseconds); standalone.push(replies.standalone.milliseconds); }
    }
    assert.equal(native.length, 20); assert.equal(standalone.length, 20);
    const nativeStats = distribution(native); const standaloneStats = distribution(standalone);
    const difference = Math.abs(nativeStats.median / standaloneStats.median - 1);
    result.timings[endpoint] = { native_ms: nativeStats, standalone_ms: standaloneStats, absolute_median_difference_fraction: difference, within_5_percent: difference <= 0.05 };
  }
  // Identical 4G/5G/6G planning availability and full simulation output. This
  // compares software contracts; it supplies no physical RF accuracy evidence.
  for (const frequencyGHz of [2.6, 28, 140]) await compare("/api/simulate", buildSimulationPayload(cells[0], { ...settings, frequencyGHz }), 0);
  result.technology_simulation_parity = true;
  // Preserve ordinary production admission for the separate full UI workflows.
  console.log("Waiting for the observed production RF budget window before native UI evaluate/optimize");
  while (Date.now() <= lastReset + 1000) await sleep(Math.min(1000, lastReset + 1001 - Date.now()));
  const workspace = createProjectWorkspace(datasetReference(meta));
  workspace.projects[0] = updateProjectDraft({ ...workspace.projects[0], name: "Native eight-Cell qualification" }, { plan: { settings, inventory: cells,
    planningMode: "network", selectedTowerId: cells[0].id, selectedNetworkTowerIds: cells.map((cell) => cell.id), networkAzimuths: {}, optimizationConfig: optimization }, requiresRerun: true });
  const fixture = path.join(scratch, "Eight Cells.atom-project.json"); await fs.writeFile(fixture, exportProjectFile(workspace.projects[0]));
  await application.evaluate(({ Menu, dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async (...args) => { const options = args.at(-1); const recovery = options.buttons?.indexOf("Quit with Recovery") ?? -1; return { response: recovery >= 0 ? recovery : options.cancelId ?? 0 }; };
    Menu.getApplicationMenu().getMenuItemById("atom-project-open").click(); }, fixture);
  await page.getByRole("button", { name: "Network mode, 8 selected", exact: true }).waitFor({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  const uiPosts = []; page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) uiPosts.push(new URL(request.url()).pathname); });
  for (const [button, endpoint] of [["Evaluate Network", "/api/evaluate-network"], ["Optimize Network", "/api/optimize-network"]]) {
    await page.getByRole("button", { name: "Simulate workspace", exact: true }).click();
    await page.locator("#stage-tool-simulate-propagation").click();
    const before = uiPosts.length;
    const [response] = await Promise.all([
      page.waitForResponse((response) => response.url() === `app://atom${endpoint}` && response.request().method() === "POST", { timeout: 90_000 }),
      page.getByRole("button", { name: button, exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
    assert.deepEqual(uiPosts.slice(before), [endpoint, ...Array(8).fill("/api/simulate")]); result.ui[button] = true;
  }
  const view = page.getByRole("button", { name: "Map view options", exact: true });
  const rayControl = async () => {
    const quick = page.locator(".map-visualization-quick-controls").getByRole("button", { name: "Propagation rays layer", exact: true });
    if (await quick.isVisible()) return quick;
    if (await view.getAttribute("aria-expanded") !== "true") await view.click();
    return page.locator("#map-view-menu").getByRole("button", { name: "Propagation rays layer", exact: true });
  };
  let rays = await rayControl();
  if (await rays.getAttribute("aria-pressed") !== "true") await rays.click();
  if (await view.getAttribute("aria-expanded") !== "true") await view.click();
  await page.getByRole("combobox", { name: "Ray scope", exact: true }).selectOption("all"); await page.keyboard.press("Escape");
  const drawer = page.getByRole("button", { name: "Close tool drawer", exact: true }); if (await drawer.isVisible()) await drawer.click();
  assert.equal(await page.locator(".tower-order-badge").count(), 8);
  await page.evaluate(() => {
    const state = globalThis.__qualificationFrames = { frames: [], input_to_second_frame_ms: [], active: true };
    function frame(time) { state.frames.push(time); if (state.active) requestAnimationFrame(frame); } requestAnimationFrame(frame);
    document.querySelector(".leaflet-container").addEventListener("pointerdown", (event) => {
      const started = event.timeStamp; requestAnimationFrame(() => requestAnimationFrame((time) => state.input_to_second_frame_ms.push(time - started)));
    }, { capture: true });
  });
  const box = await page.locator(".leaflet-container").boundingBox();
  for (let index = 0; index < 20; index++) {
    const x = box.x + box.width * 0.7; const y = box.y + box.height * 0.5;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + (index % 2 ? -50 : 50), y + (index % 2 ? -20 : 20), { steps: 8 }); await page.mouse.up(); await sleep(50);
  }
  await sleep(100);
  const frames = await page.evaluate(() => { globalThis.__qualificationFrames.active = false; return globalThis.__qualificationFrames; });
  assert.equal(frames.input_to_second_frame_ms.length, 20);
  const gaps = frames.frames.slice(1).map((time, index) => time - frames.frames[index]);
  result.map = { method: "20 real pointer pan gestures with all eight result-ray layers; animation-frame cadence is a render-scheduling proxy, not a physical-display presentation count; event timestamp to second animation frame is a presentation-latency proxy, not INP", frames: frames.frames.length,
    elapsed_ms: frames.frames.at(-1) - frames.frames[0], observed_fps: (frames.frames.length - 1) * 1000 / (frames.frames.at(-1) - frames.frames[0]), frame_gap_ms: distribution(gaps),
    input_to_second_frame_ms: distribution(frames.input_to_second_frame_ms), overlay_paths: await page.locator(".leaflet-overlay-pane path").count() };
  // Leaflet's production renderer uses Canvas. Read back only AFTER the timed
  // interval, so frequent-read heuristics cannot change its measured renderer.
  const raster = () => page.evaluate(async () => Promise.all([...document.querySelectorAll(".leaflet-overlay-pane canvas")].map(async (canvas) => {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0; for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) painted++;
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    return { width: canvas.width, height: canvas.height, painted_pixels: painted, sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") };
  })));
  const paint = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  rays = await rayControl();
  assert.equal(await rays.getAttribute("aria-pressed"), "true");
  result.map.rays_on_canvas = await raster();
  assert.ok(result.map.rays_on_canvas.some((canvas) => canvas.painted_pixels > 0), "The timed map must contain rendered vector overlays");
  await rays.click(); await paint();
  result.map.rays_off_canvas = await raster();
  assert.notDeepEqual(result.map.rays_on_canvas, result.map.rays_off_canvas, "Turning off all result rays must change the actual Canvas drawing");
  result.map.ray_drawing_verified_after_timing = true;
  rays = await rayControl(); await rays.click(); await page.keyboard.press("Escape"); await paint();
  await page.screenshot({ path: path.join(evidence, "qualification-eight-cell-map.png") });
  result.post_rf_process_tree = await processTree(application.process().pid);
  result.budgets = { rf_medians_within_5_percent: Object.values(result.timings).every((timing) => timing.within_5_percent),
    eight_cell_map_30fps: result.map.observed_fps >= 30, input_p95_100ms: result.map.input_to_second_frame_ms.p95 <= 100 };
  result.result = Object.values(result.budgets).every(Boolean) ? "PASS" : "BUDGET_REVIEW_REQUIRED";
  const owned = (await processTree(application.process().pid)).processes.map((row) => row.pid);
  await application.evaluate(({ app }) => app.quit()); await application.close(); application = null; await assertExited(owned);
} catch (error) {
  result.result = "FAIL"; result.failure = error.message;
  if (application && page) result.failure_diagnostics = await startupDiagnostics(application, page);
  await page?.screenshot({ path: path.join(evidence, "qualification-failed.png") }).catch(() => {});
  result.failure_notices = await page?.locator('[role="alert"], .run-state').allTextContents().catch(() => []);
  throw error;
}
finally {
  await checkpoint(); if (application) await application.close().catch(() => {});
  if (standalone && standalone.exitCode === null && standalone.signalCode === null) {
    const exited = once(standalone, "exit"); standalone.kill("SIGTERM"); await Promise.race([exited, sleep(35_000)]);
    if (standalone.exitCode === null && standalone.signalCode === null) { standalone.kill("SIGKILL"); await exited; }
  }
  if (standalone) await assertExited([standalone.pid]); await fs.rm(scratch, { recursive: true, force: true });
}
assert.equal(result.result, "PASS", JSON.stringify(result.budgets));
