// Actual production macOS Open/Save/Cancel widgets; no supplied dialog responses.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { waitForRuntime } from "./runtime-wait.mjs";
import { startupDiagnostics } from "./startup-diagnostics.mjs";
import { sourceIdentity, processTree, assertExited, sha256, sleep } from "./qualification-support.mjs";
assert.equal(process.platform, "darwin", "Actual macOS files require Darwin");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Native file qualification requires disposable GitHub Actions"); assert.notEqual(process.getuid(), 0);
const { launchNative } = await import("./native-launch.mjs");
const { createScenario, exportProjectFile } = await import("../../frontend-react/src/utils/projectStore.js");
const require = createRequire(import.meta.url), run = promisify(execFile);
const { inventory } = require("../lib/package-contract.cjs");
const { changeSummary } = require("./surface-diagnostics.cjs");
const { observeFileAssociation } = require("./file-association-observation.cjs");
const desktop = path.resolve(import.meta.dirname, ".."), root = path.dirname(desktop);
const output = path.join(desktop, "test-results/macos-files.json");
const result = { ...sourceIdentity(root), scope: "Read-only relocated production app on disposable hosted macOS, actual System Events Open/Save/Cancel widgets, private native HOME and exact retained file/PDF checks. Not clean minimum-OS or signed/quarantined qualification.", dialogs: [], rf_posts: [] };
assert.equal(result.source_dirty, false);
const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
const packageRoot = path.join(desktop, "build/packages", `atom-${version}-darwin-${process.arch}-internal-unsigned`);
const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8")); assert.equal(metadata.commit, result.source_commit); assert.equal(metadata.version, version);
const scratch = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "atom-macos-files-"))); await fs.chmod(scratch, 0o700);
const home = path.join(scratch, "Native home — çığ spaces"), documents = path.join(home, "Documents — çığ");
const bundle = path.join(scratch, "Outside repository — çığ spaces", "A.T.O.M.app");
async function permissions(directory, writable) { const stat = await fs.lstat(directory); if (stat.isSymbolicLink()) return; if (stat.isDirectory()) { if (writable) await fs.chmod(directory, 0o755); for (const entry of await fs.readdir(directory)) await permissions(path.join(directory, entry), writable); await fs.chmod(directory, writable ? 0o755 : 0o555); } else await fs.chmod(directory, stat.mode & 0o111 ? writable ? 0o755 : 0o555 : writable ? 0o644 : 0o444); }
let before; const executable = path.join(bundle, "Contents/MacOS/atom-desktop");
let application; let page;
const projectFile = path.join(documents, "Çankaya Ağ Planı — çığ.atom-project.json");
const markdownFile = path.join(documents, "Türkçe retained report — çığ.md"), pdfFile = path.join(documents, "Türkçe report — çığ.pdf");
async function until(predicate, message, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(50); }
  throw new Error(message);
}
async function drive(action, title, target) {
  const operation = action === "cancel" ? title === "Open A.T.O.M project" ? "cancel-open" : "cancel-save" : action;
  const { stdout } = await run("/usr/bin/osascript", ["-l", "JavaScript", path.join(desktop, "test/macos-file-driver.cjs"),
    String(application.process().pid), operation, title, target, scratch], { timeout: 100_000, maxBuffer: 128 * 1024 });
  const trace = JSON.parse(stdout.trim()); assert.equal(trace.native_widgets_only, true); assert.equal(trace.pid, application.process().pid); result.dialogs.push(trace);
}
async function command(id) { await application.evaluate(({ Menu }, commandId) => Menu.getApplicationMenu().getMenuItemById(commandId).click(), id); }
async function fileState() { const receipt = await page.evaluate(() => window.atomDesktop.getProjectFileState()); assert.equal(receipt.ok, true); return receipt.value; }
async function project(all = false) {
  return page.evaluate((all) => new Promise((resolve, reject) => {
    const request = indexedDB.open("atom-planning-workspace", 1);
    request.onupgradeneeded = () => request.transaction.abort(); request.onerror = () => reject(new Error("Workspace unavailable"));
    request.onsuccess = () => { const database = request.result; const read = database.transaction("workspace").objectStore("workspace").get("current");
      read.onsuccess = () => { database.close(); resolve(all ? read.result.projects : read.result.projects.find((project) => project.id === read.result.activeProjectId)); }; read.onerror = () => { database.close(); reject(new Error("Workspace read failed")); }; };
  }), all);
}
async function artifacts() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("atom-artifacts", 1);
    request.onupgradeneeded = () => request.transaction.abort(); request.onerror = () => reject(new Error("Artifact store unavailable"));
    request.onsuccess = () => { const database = request.result; const read = database.transaction("metadata").objectStore("metadata").getAll();
      read.onsuccess = () => { database.close(); resolve(read.result.map((row) => row.metadata)); }; read.onerror = () => { database.close(); reject(new Error("Artifact read failed")); }; };
  }));
}
async function cleanSaved() {
  const active = await project(), row = (await fileState()).find((entry) => entry.id === active.id);
  result.last_association_observation = await observeFileAssociation(row, projectFile);
  return result.last_association_observation.valid;
}
async function completeProjectDialog() {
  await until(() => page.getByRole("button", { name: "Save As", exact: true }).isEnabled(), "Project chooser operation did not finish");
  await page.keyboard.press("Escape");
}
try {
  await fs.mkdir(documents, { recursive: true, mode: 0o700 }); await fs.mkdir(path.dirname(bundle));
  await fs.cp(path.join(packageRoot, "A.T.O.M.app"), bundle, { recursive: true, verbatimSymlinks: true }); await permissions(bundle, false); before = inventory(bundle);
  const env = { ...process.env, HOME: home, PATH: "/usr/bin:/bin" }; delete env.ELECTRON_RUN_AS_NODE;
  application = await launchNative({ executablePath: executable, cwd: documents,
    args: [], env, chromiumSandbox: true, timeout: 60_000 });
  page = await application.firstWindow(); page.setDefaultTimeout(30_000); await page.waitForLoadState("domcontentloaded");
  page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) result.rf_posts.push(new URL(request.url()).pathname); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor(); await waitForRuntime(page, (status) => status.state === "ready");
  const info = await page.evaluate(() => window.atomDesktop.getInfo()); assert.equal(info.commit, result.source_commit); assert.equal(info.rendererSandboxed, true);
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), true);
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  await until(() => page.getByRole("button", { name: "Save As", exact: true }).isEnabled(), "Initial project working plan did not finish restoring");
  await page.keyboard.press("Escape");
  // Capture actual current inputs through Export Copy, then open a supported
  // legacy file whose saved Scenario has no shared-domain metadata. Later
  // report/Version persistence in its imported copy must not dirty this file.
  const seedFile = path.join(documents, "Current planning inputs.atom-project.json");
  await command("atom-project-export"); await drive("save", "Export project copy", seedFile); await completeProjectDialog();
  const seed = JSON.parse(await fs.readFile(seedFile, "utf8"));
  assert.ok(seed.project.draft?.plan);
  const legacyScenario = createScenario("Legacy portable Scenario", { plan: seed.project.draft.plan, request: null, summary: {}, artifacts: null });
  delete legacyScenario.domain;
  const legacyProject = { ...seed.project, scenarios: [legacyScenario], activeScenarioId: legacyScenario.id };
  delete legacyProject.domain;
  const legacyFile = path.join(documents, "Legacy Scenario — çığ.atom-project.json");
  await fs.writeFile(legacyFile, JSON.stringify({ schemaVersion: 2, project: legacyProject }));
  await command("atom-project-open"); await drive("open", "Open A.T.O.M project", legacyFile); await completeProjectDialog();
  await until(async () => (await project()).scenarios.length === 1, "Real legacy Open did not persist its Scenario");
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Çankaya Ağ Planı — çığ");
  await page.getByRole("button", { name: "Save project name", exact: true }).click(); await page.keyboard.press("Escape");
  await command("atom-project-save-as"); await drive("save", "Save A.T.O.M project", projectFile); await completeProjectDialog();
  await until(cleanSaved, "Native Save did not establish a clean portable association");
  const saved = await fs.readFile(projectFile); assert.equal(JSON.parse(saved).schemaVersion, 3); const savedIdentity = await fs.stat(projectFile);
  assert.ok(savedIdentity.size > 0); result.saved_project = { bytes: saved.length, sha256: sha256(saved), path_characters: projectFile.length };
  const stateBeforeCancel = await fileState(); const projectBeforeCancel = await project();
  result.initial_save_workspace_changes = changeSummary(JSON.parse(saved), JSON.parse(exportProjectFile(projectBeforeCancel)));
  assert.equal(sha256(Buffer.from(exportProjectFile(projectBeforeCancel))), sha256(saved), "The saved file must match the persisted original snapshot");
  assert.ok(projectBeforeCancel.scenarios.some((scenario) => !scenario.domain), "The original file must retain an unexpanded legacy Scenario for the unrelated-save regression");
  result.original_file_contains_legacy_scenario_without_domain_metadata = true;
  const canceledProject = path.join(documents, "Cancelled — must not exist.atom-project.json");
  await command("atom-project-save-as"); await drive("cancel", "Save A.T.O.M project", canceledProject); await completeProjectDialog();
  await command("atom-project-open"); await drive("cancel", "Open A.T.O.M project", projectFile); await completeProjectDialog();
  assert.deepEqual(await fileState(), stateBeforeCancel); assert.deepEqual(await project(), projectBeforeCancel);
  assert.equal(await fs.stat(canceledProject).then(() => true, () => false), false); assert.equal(sha256(await fs.readFile(projectFile)), sha256(saved));
  result.project_save_open_cancellation_preserved_workspace_bytes_and_association = true;
  await command("atom-project-open"); await drive("open", "Open A.T.O.M project", projectFile); await completeProjectDialog();
  await until(async () => (await project()).id !== projectBeforeCancel.id, "Accepted Open did not persist the imported project");
  const imported = await project(); const opened = (await fileState()).find((row) => row.id === imported.id);
  assert.ok(opened?.path); const openedIdentity = await fs.stat(opened.path);
  assert.equal(openedIdentity.ino, savedIdentity.ino); assert.equal(openedIdentity.dev, savedIdentity.dev); assert.equal(sha256(await fs.readFile(opened.path)), sha256(saved));
  result.opened_same_file_identity_and_bytes = true;
  // One explicitly requested RF Run prepares shared report provenance.
  const sector = page.waitForResponse((response) => response.url().endsWith("/api/analyze-sector") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Run Sector", exact: true }).click(); assert.equal((await sector).status(), 200);
  await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: /^Project menu,/ }).click(); await page.getByRole("button", { name: "Save Version", exact: true }).click();
  await page.getByText("Version saved", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Review workspace", exact: true }).click(); await page.locator("#stage-tool-review-report").click();
  await page.locator(".report-source-lineage").filter({ hasText: "Runs: Simulation Run" }).first().waitFor();
  await page.getByRole("button", { name: "Markdown", exact: true }).click(); await drive("save", "Save A.T.O.M report", markdownFile);
  await until(() => page.getByRole("button", { name: "Markdown", exact: true }).isEnabled(), "Markdown export did not finish");
  const markdown = await fs.readFile(markdownFile); const retained = await artifacts();
  assert.ok(retained.some((artifact) => artifact.format === "markdown" && artifact.content_hash === sha256(markdown) && artifact.byte_size === markdown.length));
  result.markdown_saved_exact_retained_hash = { bytes: markdown.length, sha256: sha256(markdown) };
  await page.getByRole("button", { name: "Save PDF", exact: true }).click(); await drive("save", "Save A.T.O.M report", pdfFile);
  await until(() => page.getByRole("button", { name: "Save PDF", exact: true }).isEnabled(), "PDF export did not finish");
  const pdf = await fs.readFile(pdfFile); assert.equal(pdf.subarray(0, 5).toString(), "%PDF-"); result.pdf = { bytes: pdf.length, sha256: sha256(pdf) };
  const savedPDFText = (await run("pdftotext", [pdfFile, "-"])).stdout;
  assert.ok(savedPDFText.includes("Çankaya Ağ Planı") && savedPDFText.includes("Simulation Run"), "Native Save PDF must retain Unicode Project and Run text");
  result.saved_pdf_unicode_text_preserved = true;
  const retainedBeforeCancel = await artifacts(); const canceledPDF = path.join(documents, "Cancelled — must not exist.pdf");
  await page.getByRole("button", { name: "Save PDF", exact: true }).click(); await drive("cancel", "Save A.T.O.M report", canceledPDF);
  await until(() => page.getByRole("button", { name: "Save PDF", exact: true }).isEnabled(), "PDF cancellation did not finish");
  const afterCancel = await artifacts(); for (const artifact of retainedBeforeCancel) assert.ok(afterCancel.some((row) => row.artifact_id === artifact.artifact_id && row.content_hash === artifact.content_hash));
  assert.equal(await fs.stat(canceledPDF).then(() => true, () => false), false); assert.equal(sha256(await fs.readFile(pdfFile)), sha256(pdf));
  result.report_cancellation_preserved_retained_artifacts_and_saved_pdf = true;
  // Imported files remain a copy until explicit Save; use the established path.
  await command("atom-project-save"); await completeProjectDialog(); await until(cleanSaved, "Final Save did not leave a clean association");
  // Sync first marks uncached snapshots unverified, then hashes all associated
  // Projects asynchronously. The active cached hash can settle before legacy
  // inactive Projects; observe completion without changing or saving them.
  await until(async () => (await fileState()).filter((row) => row.path).every((row) => !row.dirty), "Every associated project must finish hashing clean before ordinary Quit");
  result.file_status_before_quit = await fileState();
  const originalAfterImport = (await project(true)).find((row) => row.id === projectBeforeCancel.id);
  assert.equal(exportProjectFile(originalAfterImport), exportProjectFile(projectBeforeCancel), "Unrelated saves must preserve the exact original portable bytes, including key order");
  const oldFile = JSON.parse(exportProjectFile(projectBeforeCancel)); const currentFile = JSON.parse(exportProjectFile(originalAfterImport));
  result.original_project_changes = changeSummary(oldFile, currentFile);
  assert.deepEqual(result.original_project_changes, [], "Unrelated Version/report persistence must preserve the original portable Project exactly");
  assert.ok(result.file_status_before_quit.filter((row) => row.path).every((row) => !row.dirty), "Every associated project must be clean before ordinary Quit");
  const processes = await processTree(application.process().pid); await application.evaluate(({ app }) => app.quit());
  let timer; try { await Promise.race([application.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Ordinary native Quit did not finish")), 15_000); })]); } finally { clearTimeout(timer); }
  application = null; await assertExited(processes.processes.map((row) => row.pid));
  assert.deepEqual(inventory(bundle), before); assert.deepEqual(result.rf_posts, ["/api/analyze-sector"]);
  assert.equal(result.dialogs.length, 9);
  result.ordinary_quit_and_owned_process_cleanup = true; result.readonly_bundle_unchanged = true; result.result = "PASS";
} catch (error) {
  result.result = "FAIL"; result.failure = error.stack;
  if (application && page) result.failure_diagnostics = await startupDiagnostics(application, page);
  await page?.screenshot({ path: path.join(desktop, "test-results/macos-files-failed.png"), timeout: 5000 }).catch(() => {});
  throw error;
} finally {
  const cleanup = [];
  if (application) {
    const owned = await processTree(application.process().pid).catch(() => ({ processes: [] }));
    await application.evaluate(({ BrowserWindow, app }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); app.exit(1); }).catch(() => {});
    await application.close().catch(() => {});
    await assertExited(owned.processes.map((row) => row.pid)).catch((error) => cleanup.push(error.message));
  }
  await permissions(bundle, true).catch((error) => { if (error.code !== "ENOENT") cleanup.push(error.message); });
  if (!cleanup.length) await fs.rm(scratch, { recursive: true, force: true });
  result.cleanup_errors = cleanup; if (cleanup.length) { result.result = "FAIL"; process.exitCode = 1; }
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify(result, null, 2));
