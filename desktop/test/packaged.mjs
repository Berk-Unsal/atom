// The assembled production bundle, never a bootstrap/probe-injected copy.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { launchNative } from "./native-launch.mjs";
import { waitForRuntime } from "./runtime-wait.mjs";
import { sourceIdentity, processTree, assertExited, sleep, sha256 } from "./qualification-support.mjs";
const require = createRequire(import.meta.url);
const { nativePaths } = require("../lib/native-paths.cjs");
const { inventory } = require("../lib/package-contract.cjs");
const { exportProjectFile } = await import("../../frontend-react/src/utils/projectStore.js");
const desktop = path.resolve(import.meta.dirname, "..");
const root = path.dirname(desktop);
const result = { ...sourceIdentity(root), mode: "production packaged host; native Save responses supplied by test, actual Print surface not qualified", rf_posts: [] };
assert.equal(result.source_dirty, false);
const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
const packageRoot = path.join(desktop, "build/packages", `atom-${version}-${process.platform}-${process.arch}-internal-unsigned`);
const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
assert.equal(metadata.commit, result.source_commit); assert.equal(metadata.version, version);
result.package = metadata;
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-package-smoke-"));
const home = path.join(scratch, "Native home — çığ spaces");
const relocated = path.join(scratch, "Outside repository — çığ spaces", process.platform === "darwin" ? "A.T.O.M.app" : "A.T.O.M");
const executable = path.join(relocated, process.platform === "darwin" ? "Contents/MacOS/atom-desktop" : "atom-desktop");
const originalBundle = path.join(packageRoot, process.platform === "darwin" ? "A.T.O.M.app" : "A.T.O.M-linux-x64");
const output = path.join(desktop, "test-results/packaged.json");
const env = { ...process.env, HOME: home, PATH: "/usr/bin:/bin", XDG_DATA_HOME: path.join(home, "data"), XDG_CONFIG_HOME: path.join(home, "config"),
  XDG_CACHE_HOME: path.join(home, "cache"), XDG_STATE_HOME: path.join(home, "state"),
  ATOM_DESKTOP_TEST_PROFILE: path.join(scratch, "must-not-use"), ATOM_DESKTOP_TEST_RESOURCES: "/nonexistent", ATOM_DESKTOP_DEV_SERVER: "http://127.0.0.1:1" };
delete env.ELECTRON_RUN_AS_NODE;
const expectedPaths = nativePaths({ packaged: true, home, env });
const projectFile = path.join(scratch, "Türkçe package.atom-project.json");
const pdfFile = path.join(scratch, "Package report — çığ.pdf");
let app; let page;
async function permissions(directory, writable) {
  const stat = await fs.lstat(directory); if (stat.isSymbolicLink()) return;
  if (writable) await fs.chmod(directory, stat.mode | 0o700);
  if (stat.isDirectory()) for (const name of await fs.readdir(directory)) await permissions(path.join(directory, name), writable);
  if (!writable) await fs.chmod(directory, stat.mode & ~0o222);
}
async function until(predicate, message) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(50); }
  throw new Error(message);
}
async function cleanAssociation() {
  const expected = await fs.stat(projectFile).catch(() => null);
  if (!expected) return false;
  const states = await page.evaluate(async () => (await window.atomDesktop.getProjectFileState()).value);
  for (const state of states) {
    if (!state.path || state.dirty) continue;
    const actual = await fs.stat(state.path).catch(() => null);
    if (actual && actual.dev === expected.dev && actual.ino === expected.ino) return true;
  }
  return false;
}
async function launch() {
  app = await launchNative({ executablePath: executable, cwd: home, args: [], env, chromiumSandbox: true, timeout: 60_000 });
  page = await app.firstWindow(); await page.waitForLoadState("domcontentloaded");
  page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) result.rf_posts.push(new URL(request.url()).pathname); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Run Sector" && !button.disabled));
  await waitForRuntime(page, (runtime) => runtime.state === "ready");
  assert.equal(page.url(), "app://atom/");
  assert.deepEqual(await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), profile: app.getPath("userData") })),
    { packaged: true, version, profile: expectedPaths.profile });
  const info = await page.evaluate(() => window.atomDesktop.getInfo());
  assert.equal(info.commit, result.source_commit); assert.equal(info.rendererSandboxed, true);
  result.reference.electron = info.shellVersion;
  assert.equal(await fs.stat(env.ATOM_DESKTOP_TEST_PROFILE).then(() => true, () => false), false);
}
async function ordinaryQuit() {
  const processes = await processTree(app.process().pid);
  assert.equal(processes.processes.filter((row) => row.executable === "atom-api").length, 1);
  // Detect an unexpected dirty prompt without leaving unattended CI blocked
  // in an OS sheet. Keep Editing is safe; failure cleanup retains recovery.
  await app.evaluate(({ app, dialog }) => {
    globalThis.__packageQuitPrompt = false;
    dialog.showMessageBox = async () => { globalThis.__packageQuitPrompt = true; return { response: 0 }; };
    app.quit();
  });
  await until(async () => {
    if (app.process().exitCode !== null) return true;
    assert.equal(await app.evaluate(() => globalThis.__packageQuitPrompt), false, "Clean ordinary Quit unexpectedly asked about unsaved files");
    return false;
  }, "Ordinary Quit did not exit");
  await app.close(); app = null;
  await assertExited(processes.processes.map((row) => row.pid));
}
try {
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.dirname(relocated), { recursive: true });
  await fs.cp(originalBundle, relocated, { recursive: true, verbatimSymlinks: true });
  const before = inventory(relocated).map(({ mode: _mode, ...row }) => row);
  await permissions(relocated, false);
  await launch(); result.readonly_relocated_production_bundle_launched = true;
  const sector = page.waitForResponse((response) => response.url().endsWith("/api/analyze-sector") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Run Sector", exact: true }).click(); assert.equal((await sector).status(), 200);
  await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: /^Project menu,/ }).click(); await page.getByRole("button", { name: "Save Version", exact: true }).click();
  await page.getByText("Version saved", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Review workspace", exact: true }).click(); await page.locator("#stage-tool-review-report").click();
  await page.locator(".report-source-lineage").filter({ hasText: "Runs: Simulation Run" }).first().waitFor();
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, pdfFile);
  await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  await until(async () => Boolean(await fs.stat(pdfFile).catch(() => null)), "Packaged report PDF was not saved");
  const pdf = await fs.readFile(pdfFile); assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  result.pdf = { bytes: pdf.length, sha256: sha256(pdf) };
  await app.evaluate(({ dialog, Menu }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); Menu.getApplicationMenu().getMenuItemById("atom-project-save-as").click(); }, projectFile);
  await until(cleanAssociation, "Portable Save did not establish a clean association");
  assert.equal(JSON.parse(await fs.readFile(projectFile, "utf8")).schemaVersion, 3);
  await ordinaryQuit();
  await launch();
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  const savedProject = JSON.parse(await fs.readFile(projectFile, "utf8"));
  const restored = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("atom-planning-workspace", 1);
    request.onerror = () => reject(new Error("Cannot inspect private qualification workspace"));
    request.onsuccess = () => {
      const db = request.result; const read = db.transaction("workspace").objectStore("workspace").get("current");
      read.onsuccess = () => { const workspace = read.result; db.close(); resolve(workspace.projects.find((project) => project.id === workspace.activeProjectId)); };
      read.onerror = () => { db.close(); reject(new Error("Cannot read qualification workspace")); };
    };
  }));
  const restoredProject = JSON.parse(exportProjectFile(restored));
  const changed = [];
  function differences(before, after, key = "") {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (before && after && typeof before === "object" && typeof after === "object") {
      for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) differences(before[name], after[name], key + "/" + name);
    } else changed.push({ path: key, before, after });
  }
  differences(savedProject, restoredProject); result.restored_project_differences = changed.slice(0, 30);
  await page.getByText(/Saved to Türkçe package.atom-project.json/).waitFor();
  assert.ok(await cleanAssociation());
  await page.keyboard.press("Escape");
  await ordinaryQuit();
  assert.deepEqual(inventory(relocated).map(({ mode: _mode, ...row }) => row), before);
  assert.deepEqual(result.rf_posts, ["/api/analyze-sector"]);
  result.relaunch_preserved_version_file_association_and_profile = true;
  result.bundle_bytes_and_links_unchanged = true;
  result.owned_processes_exited = true; result.result = "PASS";
} catch (error) {
  result.result = "FAIL"; result.failure = error.message;
  await page?.screenshot({ path: path.join(desktop, "test-results/package-failed.png") }).catch(() => {});
  throw error;
} finally {
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n");
  if (app) {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
    await app.close().catch(() => {});
  }
  await permissions(relocated, true).catch(() => {}); await fs.rm(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
