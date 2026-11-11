import { launchNative } from "./native-launch.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { waitForRuntime } from "./runtime-wait.mjs";

const require = createRequire(import.meta.url);
const desktop = path.resolve(import.meta.dirname, "..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-native-diagnostics-"));
const output = path.join(desktop, "test-results");
const result = { source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: desktop, encoding: "utf8" }).trim(),
  source_dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: desktop, encoding: "utf8" }).trim()), platform: process.platform, architecture: process.arch };
let application; let page;
const fallbackDirectories = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 15_000) {
  const end = Date.now() + timeout;
  do { if (await predicate()) return; await sleep(30); } while (Date.now() < end);
  throw new Error(message);
}
async function rows(directory, component) {
  return (await fs.readFile(path.join(directory, `${component}.log`), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
}
const profileAt = (name) => path.join(scratch, name);
async function launch(name, resources) {
  const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profileAt(name) }; delete env.ELECTRON_RUN_AS_NODE;
  delete env.ATOM_DESKTOP_DEV_SERVER; delete env.ATOM_DESKTOP_DEV_CONTROL;
  if (resources) env.ATOM_DESKTOP_TEST_RESOURCES = resources; else delete env.ATOM_DESKTOP_TEST_RESOURCES;
  application = await launchNative({ executablePath: require("electron"), args: [desktop], env, chromiumSandbox: true, timeout: 60_000 });
  page = await application.firstWindow();
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  return application.evaluate(({ app }) => app.getPath("logs"));
}
async function close() { if (application) { await application.close(); application = null; page = null; } }
async function openLogs(expected) {
  await application.evaluate(({ shell, Menu }) => {
    globalThis.__openedLogs = []; shell.openPath = async (directory) => { globalThis.__openedLogs.push(directory); return ""; };
    Menu.getApplicationMenu().getMenuItemById("atom-open-logs").click();
  });
  await until(() => application.evaluate(() => globalThis.__openedLogs.length === 1), "Open Logs did not invoke the file manager");
  const selected = await application.evaluate(() => globalThis.__openedLogs);
  if (expected) assert.deepEqual(await Promise.all(selected.map((directory) => fs.realpath(directory))), [await fs.realpath(expected)]);
  return selected[0];
}
try {
  const directory = await launch("healthy");
  const first = await waitForRuntime(page, (runtime) => runtime.state === "ready");
  await openLogs(directory);
  assert.ok((await rows(directory, "host")).some((row) => row.event === "build" && row.version !== "unknown"));
  assert.ok((await rows(directory, "backend")).some((row) => row.state === "ready" && row.generation === first.generation));
  const rfRequests = [];
  application.context().on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) rfRequests.push(request.url()); });
  const pid = Number(execFileSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n").find((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line); return match && +match[2] === application.process().pid && path.basename(match[3]) === "atom-api";
  })?.trim().split(/\s+/)[0]); assert.ok(pid); process.kill(pid, "SIGKILL");
  await waitForRuntime(page, (runtime) => runtime.state === "failed");
  assert.ok((await rows(directory, "backend")).some((row) => row.state === "failed" && ["control", "exit"].includes(row.reason)));
  await until(async () => (await rows(directory, "backend")).some((row) => row.event === "backend-exit"), "Child exit did not produce its structured diagnostic");
  await application.evaluate(({ dialog, Menu }) => { dialog.showMessageBox = async () => ({ response: 0 }); Menu.getApplicationMenu().getMenuItemById("atom-restart-service").click(); });
  const recovered = await waitForRuntime(page, (runtime) => runtime.state === "ready" && runtime.generation !== first.generation);
  const rendererPID = await application.evaluate(({ dialog, BrowserWindow }) => {
    globalThis.__rendererRecovery = []; dialog.showMessageBox = async (...args) => { globalThis.__rendererRecovery.push(args.at(-1)); return { response: 0 }; };
    globalThis.__rendererEvents = [];
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.on("render-process-gone", (_event, details) => globalThis.__rendererEvents.push({ event: "gone", reason: details.reason, exitCode: details.exitCode }));
    contents.on("did-finish-load", () => globalThis.__rendererEvents.push({ event: "loaded" }));
    return contents.getOSProcessId();
  });
  assert.ok(Number.isSafeInteger(rendererPID) && rendererPID > 0 && rendererPID !== application.process().pid);
  // The API crash helper emitted no process-gone event under the Ubuntu CI
  // debugger. Terminate only the renderer identified by our owned webContents.
  process.kill(rendererPID, "SIGKILL"); result.renderer_fault_injection = "owned-renderer-SIGKILL";
  await until(async () => (await rows(directory, "host")).some((row) => row.event === "renderer-reload"), "Renderer crash did not offer explicit recovery");
  // Playwright marks the deliberately crashed Page terminally crashed. Check
  // the recovered real webContents rather than reusing its stale CDP Page.
  await until(async () => {
    try { return await application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`Boolean(document.querySelector('[aria-label="Run Sector"]')) || [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Run Sector')`)); }
    catch { return false; }
  }, "Explicit reload did not restore the workspace", 60_000);
  await until(async () => {
    try { return await application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("window.atomDesktop.getRuntime().then(value => value.state === 'ready' && value.readiness.ui)")); }
    catch { return false; }
  }, "Reloaded renderer did not restore readiness");
  assert.equal(await application.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("window.atomDesktop.getRuntime().then(value => value.generation)")), recovered.generation);
  assert.equal(rfRequests.length, 0);
  assert.equal((await application.evaluate(() => globalThis.__rendererRecovery))[0].title, "Workspace display stopped");
  result.child_and_renderer_crashes_required_explicit_recovery_without_rf_replay = true;
  await fs.chmod(directory, 0o500);
  const changedSink = await openLogs(); fallbackDirectories.push(changedSink);
  assert.notEqual(await fs.realpath(changedSink), await fs.realpath(directory));
  assert.ok((await rows(changedSink, "host")).some((row) => row.event === "log-fallback"));
  result.open_logs_followed_a_runtime_sink_failure = true;
  await close(); await fs.chmod(directory, 0o700);
  const denied = path.join(profileAt("fallback"), "native-state/logs"); await fs.mkdir(denied, { recursive: true, mode: 0o700 }); await fs.chmod(denied, 0o500);
  const fallback = await launch("fallback"); fallbackDirectories.push(fallback);
  await waitForRuntime(page, (runtime) => runtime.state === "ready");
  assert.notEqual(fallback, denied); assert.match(path.basename(fallback), /^atom-support-logs-/);
  assert.equal((await fs.stat(fallback)).mode & 0o777, 0o700); assert.equal((await fs.stat(denied)).mode & 0o777, 0o500);
  await openLogs(fallback); await close(); await fs.chmod(denied, 0o700);
  result.unwritable_logs_used_private_fallback_and_opened_actual_directory = true;
  const resources = path.join(scratch, "missing-binary-resources"); await fs.mkdir(resources);
  for (const name of ["dist", "data-pipeline", "build-info.json", "atom.png"]) await fs.symlink(path.join(desktop, "build/resources", name), path.join(resources, name));
  const missingLogs = await launch("missing-binary", resources); await waitForRuntime(page, (runtime) => runtime.state === "failed");
  assert.match((await page.evaluate(() => window.atomDesktop.getRuntime())).error, /ENOENT/);
  assert.ok((await rows(missingLogs, "backend")).some((row) => row.reason === "ENOENT")); await openLogs(missingLogs); await close();
  result.missing_binary_left_useful_ui_and_discoverable_logs = true;
  const badPackResources = path.join(scratch, "invalid-pack-resources"); await fs.mkdir(badPackResources);
  for (const name of ["dist", "atom-api", "build-info.json", "atom.png"]) await fs.symlink(path.join(desktop, "build/resources", name), path.join(badPackResources, name));
  await fs.mkdir(path.join(badPackResources, "data-pipeline")); await fs.writeFile(path.join(badPackResources, "data-pipeline/manifest.json"), "{}");
  const badPackLogs = await launch("invalid-pack", badPackResources); await waitForRuntime(page, (runtime) => runtime.state === "failed");
  assert.match((await page.evaluate(() => window.atomDesktop.getRuntime())).error, /dataset/);
  assert.ok((await rows(badPackLogs, "backend")).some((row) => row.reason === "dataset")); await close();
  result.invalid_pack_exposed_dataset_failure_without_recording_manifest_or_paths = true;
  // A disposable bootstrap automates the actual main startup recovery dialog.
  const bootstrap = path.join(scratch, "startup-fixture"); await fs.mkdir(bootstrap);
  const captured = path.join(scratch, "startup-dialog.json");
  await fs.writeFile(path.join(bootstrap, "package.json"), JSON.stringify({ main: "main.cjs" }));
  await fs.writeFile(path.join(bootstrap, "main.cjs"), `const {dialog}=require('electron'); dialog.showMessageBox=async (...args)=>{require('node:fs').writeFileSync(${JSON.stringify(captured)},JSON.stringify(args.at(-1)));return {response:2};};require(${JSON.stringify(path.join(desktop, "main.cjs"))});`);
  const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profileAt("startup"), ATOM_DESKTOP_TEST_RESOURCES: path.join(scratch, "private-secret-missing") }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [bootstrap], { env, stdio: "ignore" });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Startup recovery did not quit boundedly")); }, 15_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); }); child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  const startup = JSON.parse(await fs.readFile(captured, "utf8")); assert.deepEqual(startup.buttons, ["Open Logs", "Retry", "Quit"]);
  assert.doesNotMatch(JSON.stringify(startup), /private-secret-missing|atom-native-diagnostics-|\/Users\/|\/home\//);
  result.startup_failure_exposed_repair_choices_without_raw_user_paths = true;
  for (const logDirectory of [directory, changedSink, fallback, missingLogs, badPackLogs, path.join(profileAt("startup"), "native-state/logs")]) {
    for (const file of await fs.readdir(logDirectory)) {
      const text = await fs.readFile(path.join(logDirectory, file), "utf8");
      assert.doesNotMatch(text, /private-secret-missing|atom-native-diagnostics-|Bearer|token|\/Users\/|\/home\//);
      assert.equal((await fs.stat(path.join(logDirectory, file))).mode & 0o777, 0o600);
    }
  }
  result.local_records_were_structured_private_and_redacted = true; result.result = "PASS";
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, "diagnostics.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) {
  let nativeState;
  try { nativeState = await application?.evaluate(({ BrowserWindow }) => ({ events: globalThis.__rendererEvents, dialogs: globalThis.__rendererRecovery,
    windows: BrowserWindow.getAllWindows().map((owner) => ({ destroyed: owner.isDestroyed(), loading: owner.webContents.isLoading(), url: owner.webContents.getURL() })) })); } catch { /* Main process may already have exited. */ }
  const lifecycle = {};
  for (const component of ["host", "backend"]) try { lifecycle[component] = await rows(path.join(profileAt("healthy"), "native-state/logs"), component); } catch { /* Failure may precede creation or follow fallback. */ }
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, "failed-diagnostics.json"), JSON.stringify({ ...result, error: error.stack, nativeState, lifecycle }, null, 2)); throw error;
} finally {
  await close(); await fs.chmod(path.join(profileAt("fallback"), "native-state/logs"), 0o700).catch(() => {});
  for (const directory of fallbackDirectories) await fs.rm(directory, { recursive: true, force: true });
  await fs.rm(scratch, { recursive: true, force: true });
}
