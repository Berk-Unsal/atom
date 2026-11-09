import { launchNative } from "./native-launch.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { waitForRuntime } from "./runtime-wait.mjs";
import { importProjectFile } from "../../frontend-react/src/utils/projectStore.js";

const require = createRequire(import.meta.url);
const desktop = path.resolve(import.meta.dirname, "..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-datasets-native-"));
const profile = path.join(scratch, "profile");
const output = path.join(desktop, "test-results/datasets"); await fs.mkdir(output, { recursive: true });
const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
let application; let page; let phase = "startup";
const rfPosts = []; const tiles = [];
const result = { source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: desktop, encoding: "utf8" }).trim(),
  source_dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: desktop, encoding: "utf8" }).trim()), platform: process.platform, architecture: process.arch };
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  do { if (await predicate()) return; await sleep(20); } while (Date.now() < deadline);
  throw new Error(message);
}
async function pack(name, id) {
  const root = path.join(scratch, name);
  await fs.cp(path.join(desktop, "../backend-go/raytracer/testdata/sample-pack"), root, { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json")));
  manifest.id = id; manifest.name = `Çankaya ${name}`;
  await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, "unrelated-private.txt"), "do not copy");
  return { root, manifest, original: hash(await fs.readFile(path.join(root, "manifest.json"))) };
}
const registry = () => page.evaluate(async () => (await window.atomDesktop.getDatasetRegistry()).value);
const meta = () => page.evaluate(async () => {
  const runtime = await window.atomDesktop.getRuntime();
  const response = await fetch("/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": runtime.generation } });
  return response.ok ? response.json() : null;
});
const dialog = () => page.getByRole("dialog", { name: "Dataset packs", exact: true });
async function command(suffix) {
  await application.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).click(), `atom-dataset-${suffix}`);
}
async function choose(file, kind = "directory") {
  await application.evaluate((_electron, selected) => { globalThis.__datasetChoice = { canceled: false, filePaths: [selected] }; }, file);
  if (!await dialog().isVisible()) await command(kind === "directory" ? "add-directory" : "add-manifest");
  else await dialog().getByRole("button", { name: kind === "directory" ? "Choose pack folder…" : "Choose manifest…" }).click();
  await dialog().getByRole("region", { name: "Selected dataset pack" }).waitFor();
}
async function install(mode = "managed") {
  if (mode === "reference") await dialog().getByLabel("Reference this folder (advanced)").check();
  await dialog().getByRole("button", { name: mode === "managed" ? "Copy and register" : "Register reference" }).click();
  await dialog().getByText(/Dataset registered|exact pack is already bundled/).waitFor();
  await until(async () => !(await registry()).busy, "Dataset registration did not finish");
}
async function activate(id) {
  const row = dialog().locator(".native-dataset-entry").filter({ hasText: id });
  await row.getByRole("button").click();
  await until(async () => (await meta())?.dataset?.id === id, `Dataset ${id} did not activate`, 60_000);
  await until(async () => !(await registry()).busy && await dialog().getByRole("button", { name: "Close", exact: true }).isEnabled(), "Dataset activation did not finish");
  await dialog().getByText(/Dataset active|active for this session/).waitFor();
}
async function launch() {
  application = await launchNative({ executablePath: require("electron"), args: [desktop], env, chromiumSandbox: true, timeout: 60_000 });
  await application.context().route("https://tile.openstreetmap.org/**", async (route) => {
    const request = route.request(); tiles.push({ path: new URL(request.url()).pathname, headers: await request.allHeaders() });
    await route.abort("internetdisconnected");
  });
  page = await application.firstWindow();
  page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/") && !request.url().endsWith("/api/datasets/switch")) rfPosts.push(new URL(request.url()).pathname); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  await application.evaluate(({ dialog }) => {
    globalThis.__datasetChoice = { canceled: true, filePaths: [] };
    dialog.showOpenDialog = async () => globalThis.__datasetChoice;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: globalThis.__datasetExport });
    dialog.showMessageBox = async () => ({ response: 0 });
  });
}
async function close() {
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await application.close(); application = null;
}
async function exportProject(name) {
  const file = path.join(scratch, name);
  await application.evaluate(({ Menu }, destination) => {
    globalThis.__datasetExport = destination;
    Menu.getApplicationMenu().getMenuItemById("atom-project-export").click();
  }, file);
  await until(async () => Boolean(await fs.stat(file).catch(() => null)), "Native project export did not complete");
  return importProjectFile(await fs.readFile(file, "utf8"));
}
try {
  const managed = await pack("Managed Ü", "qualification-managed");
  const reference = await pack("Reference İ", "qualification-reference");
  await launch(); await waitForRuntime(page, (runtime) => runtime.state === "ready");
  const bundled = (await meta()).dataset.id;
  // Bind a real saved Version before switching: a brand-new unbound draft can
  // legitimately acquire its first dataset only when its first save completes.
  await until(async () => await page.getByRole("button", { name: "Run Sector", exact: true }).isEnabled(), "Initial project did not restore");
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  await page.getByRole("button", { name: "Save Version", exact: true }).click();
  await page.getByText("Version saved", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  const originalProject = await exportProject("before-dataset-change.atom-project.json");
  assert.equal(originalProject.datasetRef.id, bundled);
  result.native_user_agent = await page.evaluate(() => navigator.userAgent);
  const version = (await fs.readFile(path.join(desktop, "../VERSION"), "utf8")).trim();
  assert.equal(result.native_user_agent, `A.T.O.M/${version} (+https://github.com/Berk-Unsal/atom)`);
  const denied = await page.evaluate(async () => {
    const runtime = await window.atomDesktop.getRuntime();
    return (await fetch("/api/datasets/switch", { method: "POST", headers: { "content-type": "application/json", "x-atom-client": "1", "x-atom-runtime-generation": runtime.generation }, body: JSON.stringify({ id: "unapproved" }) })).status;
  });
  assert.equal(denied, 404);
  phase = "managed copy";
  await choose(managed.root);
  assert.equal(await dialog().getByLabel("Copy into A.T.O.M (recommended)").isChecked(), true);
  await page.screenshot({ path: path.join(output, "dataset-selection.png") });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 800, height: 900 }));
  await page.screenshot({ path: path.join(output, "dataset-selection-800.png") });
  assert.equal(await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await page.screenshot({ path: path.join(output, "dataset-selection-dark-800.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await install();
  const managedEntry = (await registry()).datasets.find((entry) => entry.id === managed.manifest.id);
  assert.equal(managedEntry.mode, "managed");
  await assert.rejects(fs.stat(path.join(managedEntry.location, "unrelated-private.txt")), { code: "ENOENT" });
  assert.equal(hash(await fs.readFile(path.join(managed.root, "manifest.json"))), managed.original);
  await fs.rm(managed.root, { recursive: true });
  await activate(managed.manifest.id);
  assert.deepEqual((await meta()).dataset.sha256, managed.manifest.sha256);
  result.managed_copy_declared_files_only_source_untouched_and_independent = true;
  phase = "reference registration and corruption";
  await choose(path.join(reference.root, "manifest.json"), "manifest"); await install("reference");
  const tower = path.join(reference.root, reference.manifest.files.towers); const original = await fs.readFile(tower);
  await fs.writeFile(tower, "corrupt");
  await dialog().locator(".native-dataset-entry").filter({ hasText: reference.manifest.id }).getByRole("button").click();
  await dialog().getByRole("alert").filter({ hasText: /missing, changed, or unreadable/ }).waitFor();
  assert.equal((await meta()).dataset.id, managed.manifest.id);
  await fs.writeFile(tower, original); await activate(reference.manifest.id);
  result.bad_reference_hash_preserved_active_pack = true;
  phase = "ambiguous duplicate";
  const duplicate = await pack("Conflicting duplicate", reference.manifest.id);
  await application.evaluate((_electron, selected) => { globalThis.__datasetChoice = { canceled: false, filePaths: [selected] }; }, duplicate.root);
  await dialog().getByRole("button", { name: "Choose pack folder…" }).click();
  await dialog().getByRole("alert").filter({ hasText: /already registered with different content/ }).waitFor();
  assert.equal((await meta()).dataset.id, reference.manifest.id);
  result.ambiguous_duplicate_did_not_change_active_pack = true;
  phase = "missing reference restart and explicit locate";
  await close(); const moved = reference.root + "-moved"; await fs.rename(reference.root, moved);
  await launch(); await waitForRuntime(page, (runtime) => runtime.state === "failed");
  const failedGeneration = (await page.evaluate(() => window.atomDesktop.getRuntime())).generation;
  await choose(path.join(moved, "manifest.json"), "manifest"); await install("reference"); await activate(reference.manifest.id);
  assert.notEqual((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, failedGeneration);
  result.missing_reference_kept_ui_and_required_explicit_same_identity_locate = true;
  phase = "managed selection restart";
  await activate(managed.manifest.id); await close(); await launch();
  await waitForRuntime(page, (runtime) => runtime.state === "ready");
  assert.equal((await meta()).dataset.id, managed.manifest.id);
  assert.deepEqual((await meta()).dataset.sha256, managed.manifest.sha256);
  result.selected_pack_persisted_across_real_relaunch = true;
  phase = "owned validation cancellation and Quit";
  await command("manage"); await dialog().waitFor();
  await application.evaluate((_electron, selected) => { globalThis.__datasetChoice = { canceled: false, filePaths: [selected] }; }, path.join(desktop, "build/resources/data-pipeline"));
  await dialog().getByRole("button", { name: "Choose pack folder…" }).click();
  let validatorPID;
  await until(async () => {
    const lines = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,args="], { encoding: "utf8" }).split("\n");
    const record = lines.map((line) => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)).find((match) => match && +match[2] === application.process().pid && match[3].includes("--validate-dataset-json"));
    validatorPID = record && +record[1]; return Boolean(validatorPID);
  }, "Owned canonical validator was not observed");
  const beforeQuit = await page.evaluate(() => window.atomDesktop.getRuntime());
  await application.evaluate(({ app }) => app.quit());
  assert.equal(application.process().exitCode, null);
  await dialog().getByRole("button", { name: "Cancel operation" }).click();
  await until(async () => !(await registry()).busy, "Canceled validator did not finish");
  assert.throws(() => process.kill(validatorPID, 0), { code: "ESRCH" });
  assert.equal((await meta()).dataset.id, managed.manifest.id);
  assert.equal((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, beforeQuit.generation);
  result.cancel_reaped_owned_validator_and_pending_quit_preserved_active_runtime = true;
  phase = "offline map and provider policy";
  await dialog().getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  await page.getByText("Dataset differs from this project.", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  result.existing_project_retained_original_dataset_identity = true;
  const retainedProject = await exportProject("after-dataset-change.atom-project.json");
  assert.deepEqual(retainedProject.datasetRef, originalProject.datasetRef);
  await page.locator(".map-basemap-status").filter({ hasText: /RF layers remain available/ }).waitFor();
  assert.ok(await page.locator(".leaflet-overlay-pane").count());
  assert.ok(await page.getByRole("link", { name: "OpenStreetMap contributors", exact: true }).isVisible());
  assert.ok(tiles.length > 0); assert.ok(tiles.every((tile) => /^\/\d+\/\d+\/\d+\.png$/.test(tile.path)));
  assert.ok(tiles.every((tile) => tile.headers["user-agent"] === result.native_user_agent));
  assert.ok(tiles.every((tile) => !tile.headers.referer?.includes("localhost") && !tile.headers["x-atom-desktop-token"]));
  const statusBox = await page.locator(".native-basemap-status").boundingBox();
  const legendBox = await page.locator(".focused-map-legend").boundingBox();
  assert.ok(legendBox.y + legendBox.height <= statusBox.y, "Offline status must not be occluded by the map key");
  await page.getByRole("button", { name: "Retry base map", exact: true }).click();
  await page.locator(".native-basemap-status").waitFor();
  await page.screenshot({ path: path.join(output, "offline-map-800.png") });
  result.synthetic_offline_tiles_kept_attribution_overlays_and_explicit_retry = true;
  assert.deepEqual(rfPosts, []); result.dataset_actions_did_not_request_rf = true;
  result.result = "PASS";
  await fs.writeFile(path.join(desktop, "test-results/datasets.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await close();
} catch (error) {
  await page?.screenshot({ path: path.join(output, "failed-datasets.png") }).catch(() => {});
  const failure = { ...result, result: "FAIL", phase, error: error.message };
  await fs.writeFile(path.join(desktop, "test-results/failed-datasets.json"), JSON.stringify(failure, null, 2)); console.error(JSON.stringify(failure)); throw error;
} finally {
  if (application) { await application.evaluate(({ app }) => app.exit()).catch(() => {}); await application.close(); }
  await fs.rm(scratch, { recursive: true, force: true });
}
