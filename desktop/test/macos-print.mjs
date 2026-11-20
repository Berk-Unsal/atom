// Actual macOS Print UI on a disposable VM; never run printer setup locally.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { waitForRuntime } from "./runtime-wait.mjs";
import { startupDiagnostics } from "./startup-diagnostics.mjs";
import { sourceIdentity, processTree, assertExited, sha256, sleep } from "./qualification-support.mjs";
assert.equal(process.platform, "darwin", "Actual macOS Print requires Darwin"); assert.equal(process.env.GITHUB_ACTIONS, "true", "Printer setup requires disposable GitHub Actions"); assert.notEqual(process.getuid(), 0);
const { launchNative } = await import("./native-launch.mjs");
const run = promisify(execFile), require = createRequire(import.meta.url);
const { inventory } = require("../lib/package-contract.cjs");
const desktop = path.resolve(import.meta.dirname, ".."), root = path.dirname(desktop);
const result = { ...sourceIdentity(root), scope: "Actual production packaged macOS app, System Events native Print widgets and owned loopback IPP print-to-file queue on disposable CI. Not physical printer, signed/quarantined or clean minimum-OS acceptance.", dialogs: [], rf_posts: [] };
assert.equal(result.source_dirty, false);
const output = path.join(desktop, "test-results/macos-print.json"); await fs.mkdir(path.dirname(output), { recursive: true });
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-macos-print-")); await fs.chmod(scratch, 0o700);
const spool = path.join(scratch, "spool"), certificates = path.join(scratch, "certificates"), home = path.join(scratch, "Native home — çığ spaces");
for (const directory of [spool, certificates, home]) await fs.mkdir(directory, { mode: 0o700 });
const queue = "AtomQualification"; let queueCreated = false, server, app, page, serverError = "", serverStartError, bundle, previousDefault;
const command = (file, args, options = {}) => run(file, args, { timeout: 35_000, maxBuffer: 256 * 1024, ...options });
async function until(predicate, message, timeout = 40_000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await predicate()) return; await sleep(100); } throw new Error(message); }
async function port() { const listener = net.createServer(); await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); }); const value = listener.address().port; await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve())); return value; }
async function permissions(directory, writable) { const stat = await fs.lstat(directory); if (stat.isSymbolicLink()) return; if (stat.isDirectory()) { if (writable) await fs.chmod(directory, 0o755); for (const entry of await fs.readdir(directory)) await permissions(path.join(directory, entry), writable); await fs.chmod(directory, writable ? 0o755 : 0o555); } else await fs.chmod(directory, stat.mode & 0o111 ? writable ? 0o755 : 0o555 : writable ? 0o644 : 0o444); }
async function jobs(completed = false) { return (await command("/usr/bin/lpstat", ["-W", completed ? "completed" : "not-completed", "-o", queue])).stdout.trim().split("\n").filter(Boolean); }
async function artifacts() { return page.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open("atom-artifacts", 1); request.onupgradeneeded = () => request.transaction.abort(); request.onerror = () => reject(new Error("Artifact metadata unavailable")); request.onsuccess = () => { const database = request.result, read = database.transaction("metadata").objectStore("metadata").getAll(); read.onsuccess = () => { database.close(); resolve(read.result.map((row) => row.metadata)); }; read.onerror = () => { database.close(); reject(new Error("Artifact read failed")); }; }; })); }
async function action(operation) { const { stdout } = await command("/usr/bin/osascript", ["-l", "JavaScript", path.join(desktop, "test/macos-print-driver.cjs"), String(app.process().pid), operation], { timeout: 45_000 }); const receipt = JSON.parse(stdout.trim()); assert.equal(receipt.native_widgets_only, true); assert.equal(receipt.pid, app.process().pid); result.dialogs.push(receipt); }
async function usable() { await until(() => page.getByRole("button", { name: "Print", exact: true }).isEnabled(), "Actual Print did not return to the report UI"); assert.equal(await page.getByRole("alert").filter({ hasText: /native print operation failed/i }).count(), 0); }
try {
  // Refuse to reuse or replace a destination, even on the disposable VM.
  const existing = await command("/usr/bin/lpstat", ["-p", queue]).then(() => true, () => false); assert.equal(existing, false, "The qualification queue already exists");
  previousDefault = (await command("/usr/bin/lpstat", ["-d"]).catch(() => ({ stdout: "" }))).stdout.trim().match(/^system default destination: ([A-Za-z0-9_.-]{1,127})$/)?.[1];
  const printerPort = await port();
  server = spawn("/usr/bin/ippeveprinter", ["-n", "localhost", "-p", String(printerPort), "-K", certificates, "-d", spool, "-k", "-f", "application/pdf", "-s", "1000", queue], { stdio: ["ignore", "ignore", "pipe"] });
  server.once("error", (error) => { serverStartError = error; });
  server.stderr.on("data", (chunk) => { serverError = (serverError + chunk.toString()).slice(-4096); });
  await until(async () => { if (serverStartError) throw serverStartError; if (server.exitCode !== null) throw new Error("Owned IPP server exited: " + serverError); return fetch(`http://localhost:${printerPort}/`).then((response) => response.ok, () => false); }, "Owned loopback IPP server did not become ready");
  const listeners = (await command("/usr/sbin/lsof", ["-nP", "-a", "-p", String(server.pid), "-iTCP", "-sTCP:LISTEN", "-Fn"])).stdout.split("\n").filter((line) => line.startsWith("n"));
  assert.ok(listeners.length > 0); for (const address of listeners) assert.ok([`n127.0.0.1:${printerPort}`, `n[::1]:${printerPort}`].includes(address), "The test printer must listen only on loopback");
  result.printer_server = { executable: "/usr/bin/ippeveprinter", loopback_only: true, pid: server.pid };
  try {
    await command("sudo", ["/usr/sbin/lpadmin", "-p", queue, "-E", "-v", `ipp://localhost:${printerPort}/ipp/print`, "-m", "everywhere", "-o", "printer-is-shared=false", "-D", queue]); queueCreated = true;
  } catch (error) {
    queueCreated = await command("/usr/bin/lpstat", ["-p", queue]).then(() => true, () => false);
    throw error;
  }
  await command("sudo", ["/usr/sbin/lpadmin", "-d", queue]);
  assert.equal((await command("/usr/bin/lpstat", ["-d"])).stdout.trim(), "system default destination: " + queue);
  assert.deepEqual(await jobs(), []); assert.deepEqual(await jobs(true), []);
  const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
  const packageRoot = path.join(desktop, "build/packages", `atom-${version}-darwin-${process.arch}-internal-unsigned`);
  const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8")); assert.equal(metadata.commit, result.source_commit);
  bundle = path.join(scratch, "Outside repository — çığ spaces", "A.T.O.M.app"); await fs.mkdir(path.dirname(bundle));
  await fs.cp(path.join(packageRoot, "A.T.O.M.app"), bundle, { recursive: true, verbatimSymlinks: true }); await permissions(bundle, false);
  const before = inventory(bundle), executable = path.join(bundle, "Contents/MacOS/atom-desktop");
  const env = { ...process.env, HOME: home, PATH: "/usr/bin:/bin" }; delete env.ELECTRON_RUN_AS_NODE;
  app = await launchNative({ executablePath: executable, cwd: scratch, env, chromiumSandbox: true, timeout: 60_000 }); page = await app.firstWindow(); page.setDefaultTimeout(40_000);
  await page.waitForURL("app://atom/"); await page.waitForLoadState("domcontentloaded");
  page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) result.rf_posts.push(new URL(request.url()).pathname); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor(); await waitForRuntime(page, (runtime) => runtime.state === "ready");
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true); const info = await page.evaluate(() => window.atomDesktop.getInfo()); assert.equal(info.commit, result.source_commit); assert.equal(info.rendererSandboxed, true);
  await page.getByRole("button", { name: /^Project menu,/ }).click(); await until(() => page.getByRole("button", { name: "Save As", exact: true }).isEnabled(), "Initial working plan did not restore");
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Çankaya Ağ Planı — çığ"); await page.getByRole("button", { name: "Save project name", exact: true }).click(); await page.keyboard.press("Escape");
  const sector = page.waitForResponse((response) => response.url().endsWith("/api/analyze-sector") && response.request().method() === "POST"); await page.getByRole("button", { name: "Run Sector", exact: true }).click(); assert.equal((await sector).status(), 200); await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: /^Project menu,/ }).click(); await page.getByRole("button", { name: "Save Version", exact: true }).click(); await page.getByText("Version saved", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Review workspace", exact: true }).click(); await page.locator("#stage-tool-review-report").click(); await page.locator(".report-source-lineage").filter({ hasText: "Runs: Simulation Run" }).first().waitFor();
  const printers = await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getPrintersAsync()); assert.ok(printers.some((printer) => printer.name === queue)); result.printer = { name: queue, enumerated_by_production_app: true, system_default: true };
  await page.getByRole("button", { name: "Print", exact: true }).click();
  let retained; await until(async () => { retained = await artifacts().catch(() => []); return retained.some((artifact) => artifact.format === "html"); }, "Actual Print did not retain its generated report before opening the OS panel");
  await action("cancel"); await usable(); assert.deepEqual(await jobs(), []); assert.deepEqual(await jobs(true), []); assert.deepEqual(await fs.readdir(spool), []);
  const afterCancel = await artifacts(); for (const artifact of retained) assert.ok(afterCancel.some((row) => row.artifact_id === artifact.artifact_id && row.content_hash === artifact.content_hash));
  result.real_print_cancel_preserved_retained_bytes_and_empty_queue = true;
  await page.getByRole("button", { name: "Print", exact: true }).click(); await action("print"); await usable();
  await until(async () => (await jobs(true)).length === 1 && (await jobs()).length === 0, "CUPS did not complete exactly one real report job", 120_000);
  const files = (await fs.readdir(spool)).filter((name) => name.endsWith(".pdf")); assert.equal(files.length, 1); const printed = path.join(spool, files[0]); const bytes = await fs.readFile(printed); assert.equal(bytes.subarray(0, 5).toString(), "%PDF-"); assert.ok(bytes.length > 0 && bytes.length <= 64 * 1024 * 1024);
  const text = (await command("pdftotext", ["-layout", printed, "-"])).stdout; result.printed_text = { characters: text.length, sha256: sha256(text), project_label_recovered: text.includes("Çankaya Ağ Planı"), run_label_recovered: text.includes("Simulation Run") };
  const raster = path.join(desktop, "test-results/macos-print-output"); await command("pdftoppm", ["-f", "1", "-singlefile", "-r", "100", "-png", printed, raster]);
  const visual = (await command("tesseract", [raster + ".png", "stdout", "--psm", "3"])).stdout, folded = visual.normalize("NFKD").replace(/\p{M}/gu, "").replaceAll("ı", "i").toLowerCase().replace(/\s+/g, " ");
  result.printed_visual = { characters: visual.length, sha256: sha256(visual), project_label_recovered: folded.includes("cankaya ag plani"), run_label_recovered: folded.includes("simulation run"), report_title_recovered: folded.includes("planning report") };
  assert.ok(result.printed_visual.project_label_recovered && result.printed_visual.run_label_recovered && result.printed_visual.report_title_recovered);
  result.completed_job = { bytes: bytes.length, sha256: sha256(bytes), completed_jobs: 1, rendered_project_and_run_labels: true };
  for (const artifact of retained) assert.ok((await artifacts()).some((row) => row.artifact_id === artifact.artifact_id && row.content_hash === artifact.content_hash));
  const processes = await processTree(app.process().pid); await app.evaluate(({ app }) => app.quit()); let timer; try { await Promise.race([app.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Ordinary native Quit did not finish")), 15_000); })]); } finally { clearTimeout(timer); }
  app = null; await assertExited(processes.processes.map((row) => row.pid)); assert.deepEqual(inventory(bundle), before); assert.deepEqual(result.rf_posts, ["/api/analyze-sector"]);
  result.ordinary_quit_and_owned_process_cleanup = true; result.readonly_bundle_unchanged = true; result.result = "PASS";
} catch (error) {
  result.result = "FAIL"; result.failure = error.stack; result.printer_diagnostic = serverError;
  if (app && page) result.failure_diagnostics = await startupDiagnostics(app, page);
  await page?.screenshot({ path: path.join(desktop, "test-results/macos-print-failed.png"), timeout: 5000 }).catch(() => {}); throw error;
} finally {
  if (app) { await app.evaluate(({ BrowserWindow, app }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); app.exit(1); }).catch(() => {}); await app.close().catch(() => {}); }
  const cleanup = [];
  if (queueCreated) await command("sudo", ["/usr/sbin/lpadmin", "-x", queue]).catch((error) => cleanup.push("Owned queue cleanup failed: " + error.message));
  if (queueCreated && previousDefault) await command("sudo", ["/usr/sbin/lpadmin", "-d", previousDefault]).catch((error) => cleanup.push("Previous default restoration failed: " + error.message));
  if (server?.pid && server.exitCode === null) { server.kill("SIGTERM"); await until(() => server.exitCode !== null || server.signalCode !== null, "Owned IPP server did not exit", 5000).catch(() => { server.kill("SIGKILL"); }); }
  if (server?.pid) await assertExited([server.pid]).catch((error) => cleanup.push(error.message));
  if (bundle) await permissions(bundle, true).catch((error) => cleanup.push(error.message));
  if (!cleanup.length) await fs.rm(scratch, { recursive: true, force: true });
  result.cleanup_errors = cleanup; if (cleanup.length) { result.result = "FAIL"; process.exitCode = 1; }
  await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify(result, null, 2));
