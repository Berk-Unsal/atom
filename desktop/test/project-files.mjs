import { _electron as electron } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { importProjectFile } from "../../frontend-react/src/utils/projectStore.js";
import { waitForRuntime } from "./runtime-wait.mjs";

const require = createRequire(import.meta.url);
const menuOnly = process.argv.slice(2).includes("--menu-only");
const desktop = path.resolve(import.meta.dirname, "..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-project-native-"));
const profile = path.join(scratch, "profile"); const output = path.join(desktop, "test-results");
const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
let application; let page; let apiPID;
const posts = [];
const result = { source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: desktop, encoding: "utf8" }).trim(),
  source_dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: desktop, encoding: "utf8" }).trim()), platform: process.platform, architecture: process.arch };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ownedAPI = (parent) => Number(execFileSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n").find((line) => {
  const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line); return match && +match[2] === parent && path.basename(match[3]) === "atom-api";
})?.trim().split(/\s+/)[0]);
async function until(predicate, message, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  do { if (await predicate()) return; await sleep(20); } while (Date.now() < deadline);
  throw new Error(message);
}
const state = () => page.evaluate(async () => (await window.atomDesktop.getProjectFileState()).value);
async function command(name) {
  await application.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).click(), `atom-project-${name}`);
}
async function choice(kind, value) {
  await application.evaluate((_electron, { kind, value }) => { globalThis.__nativeFiles[kind] = value; }, { kind, value });
}
async function fileSaved(file, predicate = () => true) {
  await until(async () => { try { return predicate(JSON.parse(await fs.readFile(file, "utf8"))); } catch { return false; } }, "Native project file did not commit");
  await until(async () => !await page.getByRole("button", { name: "Save Project", exact: true }).isDisabled(), "Project file operation did not finish");
}
async function readyMenu() {
  if (!await page.getByRole("button", { name: "Save Project", exact: true }).isVisible()) await page.getByRole("button", { name: /^Project menu,/ }).click();
  await until(async () => !await page.getByRole("button", { name: "Save Project", exact: true }).isDisabled(), "Project working plan did not restore");
}
try {
  application = await electron.launch({ executablePath: require("electron"), args: [desktop], env, chromiumSandbox: true, timeout: 60_000 });
  page = await application.firstWindow();
  page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) posts.push(new URL(request.url()).pathname); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  await waitForRuntime(page, (runtime) => runtime.state === "ready");
  await until(async () => (await state()).length > 0, "Native project metadata did not initialize");
  apiPID = ownedAPI(application.process().pid); assert.ok(apiPID);
  await application.evaluate(({ dialog }) => {
    globalThis.__nativeFiles = { open: { canceled: true, filePaths: [] }, save: { canceled: true }, quitResponse: 0, calls: [] };
    dialog.showOpenDialog = async (_window, options) => { globalThis.__nativeFiles.calls.push({ kind: "open", options }); return globalThis.__nativeFiles.open; };
    dialog.showSaveDialog = async (_window, options) => { globalThis.__nativeFiles.calls.push({ kind: "save", options }); return globalThis.__nativeFiles.save; };
    dialog.showMessageBox = async (_window, options) => { globalThis.__nativeFiles.calls.push({ kind: "quit", options }); return { response: globalThis.__nativeFiles.quitResponse }; };
  });
  const before = await state(); const originalId = before[0].id;
  const denied = await page.evaluate(() => window.atomDesktop.saveProjectFile({ projectId: "p", revision: "r", text: "{}", mode: "save", name: "x.json", path: "/unapproved/file" }));
  assert.equal(denied.error.code, "file_invalid_request");
  assert.equal(await application.evaluate(() => globalThis.__nativeFiles.calls.length), 0);
  await command("open"); await until(async () => await application.evaluate(() => globalThis.__nativeFiles.calls.length) === 1, "Open command did not reach native dialog");
  assert.equal((await state())[0].id, originalId);
  const sector = page.waitForResponse((response) => response.url().endsWith("/api/analyze-sector") && response.request().method() === "POST");
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Run Sector", exact: true }).click();
  assert.equal((await sector).status(), 200); await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  const invalid = path.join(scratch, "invalid.json"); await fs.writeFile(invalid, "{invalid");
  await choice("open", { canceled: false, filePaths: [invalid] }); await command("open");
  await page.getByRole("alert").filter({ hasText: /not valid JSON/ }).waitFor();
  assert.equal((await state())[0].id, originalId); assert.equal(await page.locator(".run-state").innerText(), "Ready");
  const oversized = path.join(scratch, "oversized.json"); await fs.writeFile(oversized, Buffer.alloc(16 * 1024 * 1024 + 1));
  await choice("open", { canceled: false, filePaths: [oversized] }); await command("open");
  await page.getByText("Project file must be no larger than 16 MiB", { exact: true }).waitFor();
  assert.equal((await state())[0].id, originalId); result.cancel_invalid_and_oversized_open_preserved_workspace_and_result = true;
  const first = path.join(scratch, "Türkçe space.atom-project.json");
  await page.keyboard.press("Escape"); await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)", exact: true }).fill("31");
  const beforeFiles = posts.length;
  await choice("save", { canceled: false, filePath: first }); await command("save-as");
  await fileSaved(first, (file) => file.project.draft?.plan?.settings?.txPowerDbm === 31);
  let portable = JSON.parse(await fs.readFile(first, "utf8")); assert.equal(portable.schemaVersion, 3); assert.equal(portable.project.scenarios.length, 0);
  assert.equal((await state()).find((row) => row.id === originalId).path, await fs.realpath(first));
  assert.equal(posts.length, beforeFiles); result.save_captured_current_inputs_without_rf_or_version = true;
  const previous = await fs.readFile(first, "utf8"); await fs.writeFile(first, `${previous}\n `);
  await command("save"); await page.getByRole("alert").filter({ hasText: /changed outside/ }).waitFor();
  assert.equal(await fs.readFile(first, "utf8"), `${previous}\n `);
  await choice("save", { canceled: true }); await command("save-as"); await until(async () => !await page.getByRole("button", { name: "Save As", exact: true }).isDisabled(), "Cancelled Save As remained busy");
  assert.equal((await state()).find((row) => row.id === originalId).path, await fs.realpath(first));
  const deniedDirectory = path.join(scratch, "Read only destination"); await fs.mkdir(deniedDirectory);
  const deniedFile = path.join(deniedDirectory, "Preserved.json"); await fs.writeFile(deniedFile, previous); await fs.chmod(deniedDirectory, 0o500);
  try {
    await choice("save", { canceled: false, filePath: deniedFile }); await command("save-as");
    await page.getByRole("alert").filter({ hasText: /permission/i }).waitFor();
    assert.equal(await fs.readFile(deniedFile, "utf8"), previous);
    assert.equal((await state()).find((row) => row.id === originalId).path, await fs.realpath(first));
  } finally { await fs.chmod(deniedDirectory, 0o700); }
  result.failed_native_write_preserved_destination_and_association = true;
  const second = path.join(scratch, "Second destination.atom-project.json");
  await choice("save", { canceled: false, filePath: second }); await command("save-as"); await fileSaved(second);
  const copy = path.join(scratch, "Export copy.atom-project.json"); await choice("save", { canceled: false, filePath: copy }); await command("export"); await fileSaved(copy);
  assert.equal((await state()).find((row) => row.id === originalId).path, await fs.realpath(second));
  assert.equal(await fs.readFile(copy, "utf8"), await fs.readFile(second, "utf8"));
  result.conflict_cancel_save_as_and_export_preserved_file_identity = true;
  await page.getByRole("button", { name: "Save Version", exact: true }).click();
  await page.getByText("Version saved", { exact: true }).waitFor();
  await application.evaluate(({ BrowserWindow }) => {
    globalThis.__fileShortcutEvents = [];
    BrowserWindow.getAllWindows()[0].webContents.on("before-input-event", (_event, input) => {
      if (["s", "meta", "control"].includes(String(input.key).toLowerCase())) globalThis.__fileShortcutEvents.push({ type: input.type, key: input.key, meta: input.meta, control: input.control, shift: input.shift, alt: input.alt });
    });
  });
  if (menuOnly) await command("save");
  else {
    await application.evaluate(({ app, BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; if (process.platform === "darwin") { app.show(); app.focus({ steal: true }); } window.show(); window.focus(); });
    await until(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused()), "Native shortcut qualification requires actual window focus", 5000);
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      const modifiers = [process.platform === "darwin" ? "meta" : "control"];
      contents.sendInputEvent({ type: "keyDown", keyCode: "S", modifiers });
      contents.sendInputEvent({ type: "keyUp", keyCode: "S", modifiers });
    });
  }
  await fileSaved(second, (file) => file.project.scenarios.length === 1);
  assert.equal(posts.length, beforeFiles); result.save_version_remained_distinct = true;
  result.native_save_shortcut_used_the_same_operation_path = !menuOnly;
  result.qualification_mode = menuOnly ? "menu-only-local-scope" : "native-input-with-real-focus";
  const sample = JSON.parse(await fs.readFile(path.join(desktop, "../examples/ankara-sample.atom-project.json"), "utf8"));
  for (const version of [1, 2]) {
    const text = JSON.stringify({ ...sample, schemaVersion: version }); const file = path.join(scratch, `Legacy ${version} — çığ.json`); await fs.writeFile(file, text);
    const browser = importProjectFile(text);
    await choice("open", { canceled: false, filePaths: [file] }); await command("open");
    await page.getByText(new RegExp(`Opened Legacy ${version}`)).waitFor(); await readyMenu();
    await command("save"); await fileSaved(file, (saved) => saved.schemaVersion === 3);
    portable = importProjectFile(await fs.readFile(file, "utf8"));
    assert.deepEqual(portable.scenarios.map((scenario) => scenario.plan), browser.scenarios.map((scenario) => scenario.plan));
    assert.deepEqual(portable.scenarios.map((scenario) => scenario.request), browser.scenarios.map((scenario) => scenario.request));
  }
  result.legacy_browser_desktop_roundtrips_preserved_scenario_contracts = true;
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Unsaved portable name");
  await page.getByRole("button", { name: "Save project name", exact: true }).click();
  await until(async () => (await state()).some((row) => row.path && row.dirty), "Dirty file state was not reported");
  const runtime = await page.evaluate(() => window.atomDesktop.getRuntime());
  await application.evaluate(({ app }) => { app.quit(); });
  await until(async () => await application.evaluate(() => globalThis.__nativeFiles.calls.some((call) => call.kind === "quit")), "Dirty quit did not ask");
  assert.equal((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, runtime.generation);
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDestroyed()), false);
  await fs.mkdir(output, { recursive: true });
  for (const [width, height, filename] of [[1440, 900, "project-files.png"], [800, 700, "project-files-800.png"]]) {
    await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
    await page.getByRole("dialog", { name: "Project and scenarios", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Project and scenarios", exact: true }).evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, "Native menu must wrap long chosen paths without horizontal overflow");
    await page.screenshot({ path: path.join(output, filename) });
  }
  result.cancelled_dirty_quit_preserved_window_and_runtime = true;
  const closed = application.waitForEvent("close", { timeout: 35_000 });
  await choice("quitResponse", 2); await application.evaluate(({ app }) => { app.quit(); }); await closed; application = null; page = null;
  const last = JSON.parse(await fs.readFile(path.join(scratch, "Legacy 2 — çığ.json"), "utf8")); assert.equal(last.project.name, "Unsaved portable name");
  await until(() => { try { process.kill(apiPID, 0); return false; } catch { return true; } }, "Quit left an owned API child");
  result.save_files_and_quit_committed_and_reaped_child = true;
  application = await electron.launch({ executablePath: require("electron"), args: [desktop], env, chromiumSandbox: true, timeout: 60_000 });
  page = await application.firstWindow();
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  await waitForRuntime(page, (runtime) => runtime.state === "ready");
  apiPID = ownedAPI(application.process().pid); assert.ok(apiPID);
  const destroyed = application.waitForEvent("close", { timeout: 35_000 });
  await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].destroy(); });
  await destroyed; application = null; page = null;
  await until(() => { try { process.kill(apiPID, 0); return false; } catch { return true; } }, "A destroyed window left an owned API child");
  result.destroyed_window_still_drained_its_owned_child = true; result.result = "PASS";
  await fs.writeFile(path.join(output, "project-files.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await fs.mkdir(output, { recursive: true }); await page?.screenshot({ path: path.join(output, "failed-project-files.png") }).catch(() => {});
  const shortcuts = await application?.evaluate(() => globalThis.__fileShortcutEvents || []).catch(() => []);
  await fs.writeFile(path.join(output, "failed-project-files.json"), JSON.stringify({ ...result, error: error.stack, shortcut_events: shortcuts, posts }, null, 2)); throw error;
} finally {
  if (application) { await application.evaluate(({ app }) => { app.exit(1); }).catch(() => {}); await application.close().catch(() => {}); }
  await fs.rm(scratch, { recursive: true, force: true });
}
