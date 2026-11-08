import { _electron as electron } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "atom-native-lifecycle-"));
const resources = path.join(workspace, "resources");
await fs.mkdir(resources);
for (const name of ["atom-api", "data-pipeline", "atom.png", "build-info.json"]) await fs.symlink(path.join(root, "build/resources", name), path.join(resources, name));
const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: path.join(workspace, "profile"), ATOM_DESKTOP_TEST_RESOURCES: resources, ATOM_DESKTOP_DEV_SERVER: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const apiPID = (parent) => {
  const line = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n")
    .find((value) => { const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(value); return match && +match[2] === parent && path.basename(match[3]) === "atom-api"; });
  return line ? +line.trim().split(/\s+/)[0] : null;
};
const exited = (child, timeout = 10_000) => new Promise((resolve, reject) => {
  if (child.exitCode !== null || child.signalCode !== null) return resolve(child.exitCode);
  const timer = setTimeout(() => reject(new Error("Owned process did not exit")), timeout);
  child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
});
let application; let nativeProcess; let childPID; let vite;
try {
  vite = spawn(process.execPath, [path.join(root, "../frontend-react/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
    { cwd: path.join(root, "../frontend-react"), env: { ...process.env, ATOM_DESKTOP_DEV: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Owned Vite server did not start")), 15_000);
    vite.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4096); if (output.includes("http://127.0.0.1:5173")) { clearTimeout(timer); resolve(); } });
    vite.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4096); });
    vite.once("exit", () => { clearTimeout(timer); reject(new Error(`Owned Vite server exited: ${output}`)); });
    vite.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  application = await electron.launch({ executablePath: require("electron"), args: [root], env, chromiumSandbox: true, timeout: 60_000 });
  nativeProcess = application.process();
  const page = await application.firstWindow();
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  assert.equal(await fs.stat(path.join(resources, "dist")).then(() => true, () => false), false);
  assert.match(await page.evaluate(async () => (await fetch("/")).text()), /@vite\/client/);
  await page.getByRole("button", { name: "Run Sector", exact: true }).click();
  await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  const first = await page.evaluate(() => window.atomDesktop.getRuntime());
  assert.deepEqual(first.readiness, { listener: true, dataset: true, ui: true });
  childPID = apiPID(nativeProcess.pid); assert.ok(childPID);

  await application.evaluate(({ app }) => { globalThis.__secondLaunches = 0; app.on("second-instance", () => { globalThis.__secondLaunches++; }); });
  const second = spawn(require("electron"), [root], { env, stdio: "ignore" });
  assert.equal(await exited(second), 0);
  assert.equal(await application.evaluate(() => globalThis.__secondLaunches), 1);
  assert.deepEqual(await application.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    return { count: windows.length, visible: windows[0].isVisible(), minimized: windows[0].isMinimized(), focused: windows[0].isFocused() };
  }), { count: 1, visible: true, minimized: false, focused: true });
  assert.equal(apiPID(nativeProcess.pid), childPID);
  assert.equal((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, first.generation);

  process.kill(childPID, "SIGKILL");
  await page.waitForFunction(async () => (await window.atomDesktop.getRuntime()).state === "failed", null, { timeout: 10_000 });
  assert.equal(await page.evaluate(async () => { try { await (await import("/src/utils/apiClient.js")).getJSON("/api/meta"); return "unexpected success"; } catch (error) { return error.code; } }), "runtime_changed");
  assert.equal(apiPID(nativeProcess.pid), null);
  await application.evaluate(({ Menu, dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); Menu.getApplicationMenu().getMenuItemById("atom-restart-service").click(); });
  await page.waitForFunction(async (old) => { const runtime = await window.atomDesktop.getRuntime(); return runtime.state === "ready" && runtime.generation !== old; }, first.generation, { timeout: 60_000 });
  assert.ok(await page.evaluate(async () => (await (await import("/src/utils/apiClient.js")).getJSON("/api/meta")).application_version));
  childPID = apiPID(nativeProcess.pid); assert.ok(childPID);
  const listeners = execFileSync("lsof", ["-nP", "-a", "-p", String(childPID), "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" });
  const port = Number(/TCP 127\.0\.0\.1:(\d+) \(LISTEN\)/.exec(listeners)?.[1]); assert.ok(port);
  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  await page.screenshot({ path: path.join(root, "test-results/vite-runtime.png") });
  const killedAt = Date.now();
  nativeProcess.kill("SIGKILL"); await exited(nativeProcess);
  while (alive(childPID) && Date.now() - killedAt < 30_000) await sleep(50);
  assert.equal(alive(childPID), false, "API must exit on abrupt host death");
  childPID = null;
  await assert.rejects(new Promise((resolve, reject) => { const connection = net.connect(port, "127.0.0.1"); connection.once("connect", () => { connection.destroy(); resolve(); }); connection.once("error", reject); }));
  const deathMs = Date.now() - killedAt;
  // The same profile has a stale native lock after SIGKILL. Relaunch it with a
  // missing sidecar: the real UI must remain available with a bounded failure.
  await fs.unlink(path.join(resources, "atom-api"));
  await fs.symlink(path.join(workspace, "missing-atom-api"), path.join(resources, "atom-api"));
  application = await electron.launch({ executablePath: require("electron"), args: [root], env, chromiumSandbox: true, timeout: 60_000 });
  nativeProcess = application.process();
  const failedPage = await application.firstWindow();
  await failedPage.waitForFunction(() => Boolean(window.atomDesktop?.getRuntime), null, { timeout: 30_000 });
  await failedPage.waitForFunction(async () => (await window.atomDesktop.getRuntime()).state === "failed", null, { timeout: 10_000 });
  assert.match((await failedPage.evaluate(() => window.atomDesktop.getRuntime())).error, /ENOENT/);
  assert.equal((await failedPage.evaluate(() => window.atomDesktop.getInfo())).kind, "desktop");
  await failedPage.getByText("A.T.O.M", { exact: true }).first().waitFor({ timeout: 30_000 });
  assert.equal(apiPID(nativeProcess.pid), null);
  await failedPage.screenshot({ path: path.join(root, "test-results/missing-sidecar.png") });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await exited(nativeProcess, 35_000);
  const evidence = { result: "PASS", cleanViteWithoutDist: true, repeatedLaunchFocusedExistingHost: true, crashRequiredExplicitRecovery: true,
    generationRotated: true, sameProfileRelaunchAfterHostDeath: true, missingSidecarKeptUsableWindow: true, abruptHostDeath: { childExited: true, listenerClosed: true, milliseconds: deathMs } };
  await fs.writeFile(path.join(root, "test-results/lifecycle.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (application && nativeProcess?.exitCode === null && nativeProcess?.signalCode === null) await application.close();
  if (childPID && alive(childPID)) { process.kill(childPID, "SIGKILL"); }
  if (vite && vite.exitCode === null && vite.signalCode === null) { vite.kill("SIGTERM"); await exited(vite); }
  await fs.rm(workspace, { recursive: true, force: true });
}
