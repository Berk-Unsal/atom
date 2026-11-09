import { _electron as electron } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { build } from "../../frontend-react/node_modules/vite/dist/node/index.js";
import { waitForRuntime } from "./runtime-wait.mjs";

const require = createRequire(import.meta.url);
const { nativePaths } = require("../lib/native-paths.cjs");
const desktop = path.resolve(import.meta.dirname, "..");
// Fixed executable path allows an exact Ubuntu AppArmor rule, never no-sandbox.
const packagedRoot = path.join(desktop, "build/storage-package");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-storage-"));
const home = path.join(scratch, "Native home — çığ space");
const xdg = { XDG_DATA_HOME: path.join(home, "data"), XDG_CONFIG_HOME: path.join(home, "config"),
  XDG_CACHE_HOME: path.join(home, "cache"), XDG_STATE_HOME: path.join(home, "state"), XDG_RUNTIME_DIR: "relative-ignored" };
const env = { ...process.env, ...xdg, HOME: home, ATOM_DESKTOP_TEST_PROFILE: path.join(scratch, "must-ignore-profile"), ATOM_DESKTOP_DEV_SERVER: "http://127.0.0.1:5173", ATOM_DESKTOP_DEV_CONTROL: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const paths = nativePaths({ packaged: true, home, env });
let application; let page; let portBlocker;
const result = { source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: desktop, encoding: "utf8" }).trim(),
  source_dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: desktop, encoding: "utf8" }).trim()),
  platform: process.platform, architecture: process.arch };
const isMac = process.platform === "darwin";
let bundle = path.join(packagedRoot, isMac ? "A.T.O.M.app" : "atom");
const resourcesIn = (location) => path.join(location, isMac ? "Contents/Resources" : "resources");
const executableIn = (location) => path.join(location, isMac ? "Contents/MacOS/atom-storage-test" : "atom-storage-test");
const inspect = () => page.evaluate(async () => (await import("/assets/storage-contract.js")).inspect());
function privatePort() {
  const parent = application.process().pid;
  const line = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n").find((value) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(value); return match && +match[2] === parent && path.basename(match[3]) === "atom-api";
  });
  assert.ok(line, "The packaged app must own its Go child");
  const pid = line.trim().split(/\s+/)[0];
  const listener = execFileSync("lsof", ["-nP", "-a", "-p", pid, "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" });
  const port = /TCP 127\.0\.0\.1:(\d+) \(LISTEN\)/.exec(listener)?.[1]; assert.ok(port); return Number(port);
}
async function launch() {
  application = await electron.launch({ executablePath: executableIn(bundle), args: [], cwd: home, env, chromiumSandbox: true, timeout: 60_000 });
  application.process().stderr.on("data", (chunk) => {
    const text = chunk.toString(); if (text.includes("STORAGE_STARTUP_FAILURE")) result.startup_failure = text.slice(0, 1500);
  });
  page = await application.firstWindow();
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  await waitForRuntime(page, (runtime) => runtime.state === "ready");
  const actual = await application.evaluate(({ app, session }) => ({ packaged: app.isPackaged, profile: app.getPath("userData"),
    sessionPath: app.getPath("sessionData"), persistent: session.defaultSession.isPersistent() }));
  assert.deepEqual(actual, { packaged: true, profile: paths.profile, sessionPath: paths.profile, persistent: true });
  assert.equal(page.url(), "app://atom/");
}
async function close() { if (application) { await application.close(); application = null; page = null; } }
async function bundlePermissions(directory, writable) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink()) return;
  if (writable) await fs.chmod(directory, stat.mode | (stat.isDirectory() ? 0o700 : 0o200));
  if (stat.isDirectory()) for (const entry of await fs.readdir(directory)) await bundlePermissions(path.join(directory, entry), writable);
  if (!writable) await fs.chmod(directory, stat.mode & ~0o222);
}
try {
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  await fs.rm(packagedRoot, { recursive: true, force: true }); await fs.mkdir(packagedRoot, { recursive: true });
  const electronDistribution = path.dirname(require("electron"));
  await fs.cp(isMac ? path.resolve(electronDistribution, "../..") : electronDistribution, bundle, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  // Electron's native isPackaged check uses the executable name. Rename the
  // real fixture executable; do not mock the app property or force an env flag.
  await fs.rename(path.join(bundle, isMac ? "Contents/MacOS/Electron" : "electron"), executableIn(bundle));
  if (isMac) execFileSync("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleExecutable atom-storage-test", path.join(bundle, "Contents/Info.plist")]);
  const resources = resourcesIn(bundle);
  const appDirectory = path.join(resources, "app"); await fs.mkdir(appDirectory);
  for (const entry of ["main.cjs", "preload.cjs", "lib", "package.json"]) await fs.cp(path.join(desktop, entry), path.join(appDirectory, entry), { recursive: true });
  // Fail unattended qualification promptly if startup shows its recovery
  // dialog; do not leave a native modal waiting forever in test cleanup.
  await fs.writeFile(path.join(appDirectory, "storage-test-bootstrap.cjs"), 'const { dialog } = require("electron"); dialog.showMessageBox = async (options) => { if (process.env.ATOM_STORAGE_FAILURE_FILE) require("node:fs").writeFileSync(process.env.ATOM_STORAGE_FAILURE_FILE, JSON.stringify(options), { mode: 0o600 }); console.error("STORAGE_STARTUP_FAILURE", options.message, options.detail); return { response: 0 }; }; require("./main.cjs");\n');
  const manifest = JSON.parse(await fs.readFile(path.join(appDirectory, "package.json"), "utf8"));
  await fs.writeFile(path.join(appDirectory, "package.json"), JSON.stringify({ ...manifest, main: "storage-test-bootstrap.cjs" }));
  await fs.cp(path.join(desktop, "build/resources"), resources, { recursive: true });
  await build({ configFile: false, publicDir: false, logLevel: "warn", build: { emptyOutDir: false,
    outDir: path.join(resources, "dist/assets"), lib: { entry: path.join(desktop, "test/fixtures/storage-contract.js"), formats: ["es"], fileName: () => "storage-contract.js" }, minify: false } });
  await bundlePermissions(bundle, false);
  await launch();
  result.release_overrides_ignored = true;
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  await page.getByText(/Drafts autosave in this app’s recovery storage/).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await fs.stat(env.ATOM_DESKTOP_TEST_PROFILE).then(() => true, () => false), false);
  const firstRuntime = await page.evaluate(() => window.atomDesktop.getRuntime());
  const firstPort = privatePort();
  const seeded = await page.evaluate(async () => (await import("/assets/storage-contract.js")).seed());
  const first = await inspect(); assert.equal(first.hash, seeded.hash); assert.match(first.html, /Türkçe report/);
  await page.reload();
  await page.getByRole("button", { name: /^Project menu, Durable Ankara/ }).waitFor();
  await application.evaluate(async ({ session }) => { await session.defaultSession.clearCache(); session.defaultSession.flushStorageData(); });
  assert.deepEqual(await inspect(), first);
  await close();
  portBlocker = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => { portBlocker.once("error", reject); portBlocker.listen(firstPort, "127.0.0.1", resolve); });
  await fs.writeFile(path.join(paths.packs, "retained-pack-marker"), "pack bytes", { mode: 0o600 });
  // OS cache eviction touches only the advertised cache root, while the host
  // is stopped. No clearStorageData/reset or browser migration is involved.
  await fs.rm(paths.cache, { recursive: true, force: true });
  await launch(); assert.deepEqual(await inspect(), first);
  assert.notEqual(privatePort(), firstPort, "The stable origin must preserve data across actual sidecar port changes");
  await new Promise((resolve) => portBlocker.close(resolve));
  assert.notEqual((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, firstRuntime.generation);
  result.relaunch_and_cache_eviction_preserved_all_stores = true;
  await close();
  // Relocate the actual unpacked application with no change to the profile.
  // Ubuntu's exact executable policy stays stable by moving only Resources;
  // macOS moves the .app itself (installer/signing qualification is separate).
  await fs.chmod(bundle, 0o755);
  if (isMac) {
    const moved = path.join(packagedRoot, "Relocated — çığ A.T.O.M.app"); await fs.rename(bundle, moved); bundle = moved;
    await fs.chmod(bundle, 0o555);
  } else {
    // Linux also needs write permission on the directory being moved between
    // parents to update its '..' entry. This is a stopped installer operation.
    await fs.chmod(resourcesIn(bundle), 0o755);
    const relocated = path.join(packagedRoot, "Relocated — çığ resources"); await fs.rename(resourcesIn(bundle), relocated); await fs.symlink(relocated, resourcesIn(bundle));
    await fs.chmod(bundle, 0o555);
  }
  // Work on the installer-owned relocated tree, not its resource alias. The
  // recursive permission helper intentionally never follows symlink leaves.
  const upgradedResources = await fs.realpath(resourcesIn(bundle));
  await bundlePermissions(upgradedResources, true);
  const infoFile = path.join(upgradedResources, "build-info.json"); const info = JSON.parse(await fs.readFile(infoFile, "utf8"));
  const upgrade = "0.13.2-storage-test";
  execFileSync("go", ["build", "-trimpath", "-ldflags", `-X main.appVersion=${upgrade} -X main.buildCommit=${info.commit}`, "-o", path.join(upgradedResources, "atom-api"), "."], { cwd: path.join(desktop, "../backend-go"), stdio: "pipe" });
  await fs.writeFile(infoFile, JSON.stringify({ ...info, version: upgrade }));
  await bundlePermissions(upgradedResources, false);
  const before = JSON.parse(await fs.readFile(paths.settings, "utf8"));
  const chosen = path.join(home, "Chosen portable project.atom-project.json");
  await fs.writeFile(chosen, "chosen portable file bytes", { mode: 0o600 });
  before.recentFiles.push({ projectId: seeded.projectId, kind: "project", path: chosen });
  before.datasets.push({ id: "retained-test-pack", path: paths.packs });
  const { SettingsStore } = require("../lib/settings-store.cjs"); new SettingsStore(paths.settings).save(before);
  await launch(); assert.deepEqual(await inspect(), first);
  assert.equal((await page.evaluate(() => window.atomDesktop.getInfo())).version, upgrade);
  const after = JSON.parse(await fs.readFile(paths.settings, "utf8"));
  assert.equal(after.preferences.lastVersion, upgrade); assert.deepEqual(after.recentFiles, before.recentFiles); assert.deepEqual(after.datasets, before.datasets);
  assert.equal(await fs.readFile(path.join(paths.packs, "retained-pack-marker"), "utf8"), "pack bytes");
  assert.equal(await fs.readFile(chosen, "utf8"), "chosen portable file bytes");
  result.relocation_and_tested_version_upgrade_preserved_all_stores = true;
  await fs.mkdir(path.join(desktop, "test-results"), { recursive: true });
  await page.screenshot({ path: path.join(desktop, "test-results/durable-storage.png") });
  await close();
  const failureFile = path.join(home, "startup-recovery.json");
  async function recovery() {
    await fs.rm(failureFile, { force: true });
    const child = spawn(executableIn(bundle), [], { cwd: home, env: { ...env, ATOM_STORAGE_FAILURE_FILE: failureFile }, stdio: "ignore" });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Storage recovery did not exit boundedly")); }, 15_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    const dialog = JSON.parse(await fs.readFile(failureFile, "utf8"));
    assert.match(dialog.message, /storage/); assert.match(dialog.detail, /preserved/);
  }
  const savedSettings = await fs.readFile(paths.settings, "utf8");
  const futureSettings = JSON.stringify({ ...after, schema: 999 });
  await fs.writeFile(paths.settings, futureSettings); await recovery();
  assert.equal(await fs.readFile(paths.settings, "utf8"), futureSettings);
  await fs.writeFile(paths.settings, savedSettings);
  await fs.chmod(paths.config, 0o500); await recovery();
  assert.equal(await fs.readFile(paths.settings, "utf8"), savedSettings);
  assert.equal((await fs.stat(paths.config)).mode & 0o777, 0o500);
  await fs.chmod(paths.config, 0o700);
  await launch(); assert.deepEqual(await inspect(), first); await close();
  result.future_settings_and_unwritable_config_required_recovery_without_reset = true;
  for (const directory of [paths.profile, paths.data, paths.config, paths.cache, paths.state, paths.logs, paths.packs]) assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  for (const file of [paths.settings, paths.geometry]) assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  result.private_native_directories_and_settings = true; result.result = "PASS";
  result.read_only_bundle_and_independent_cwd = true;
  await fs.writeFile(path.join(desktop, "test-results/storage.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await fs.mkdir(path.join(desktop, "test-results"), { recursive: true });
  await page?.screenshot({ path: path.join(desktop, "test-results/failed-storage.png") }).catch(() => {});
  await fs.writeFile(path.join(desktop, "test-results/failed-storage.json"), JSON.stringify({ ...result, error: error.stack }, null, 2)); throw error;
} finally {
  await close(); await bundlePermissions(packagedRoot, true).catch(() => {});
  if (portBlocker?.listening) await new Promise((resolve) => portBlocker.close(resolve));
  await fs.rm(packagedRoot, { recursive: true, force: true }); await fs.rm(scratch, { recursive: true, force: true });
}
