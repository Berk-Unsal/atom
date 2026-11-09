import { launchNative } from "./native-launch.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { build } from "../../frontend-react/node_modules/vite/dist/node/index.js";
import { getDocument } from "../../frontend-react/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { verifyReviewPackage } from "../../frontend-react/src/utils/reviewPackage.js";
import { REPORT_CASES, fixtureOutput, fixtureReport } from "./fixtures/report-contract.mjs";
import { waitForRuntime } from "./runtime-wait.mjs";

const require = createRequire(import.meta.url);
const desktop = path.resolve(import.meta.dirname, "..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-report-native-"));
const resources = path.join(scratch, "resources"); const output = path.join(desktop, "test-results/reports");
const profile = path.join(scratch, "profile"); const posts = []; const requests = [];
let application; let page;
const result = { source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: desktop, encoding: "utf8" }).trim(),
  source_dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: desktop, encoding: "utf8" }).trim()), platform: process.platform, architecture: process.arch, pdf_cases: [] };
const server = http.createServer((request, response) => { requests.push(request.url); response.end("Unexpected report network request"); });
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
async function until(predicate, message, timeout = 15_000) {
  const end = Date.now() + timeout;
  do { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 25)); } while (Date.now() < end);
  throw new Error(message);
}
async function choose(filePath) {
  await application.evaluate((_electron, filePath) => { globalThis.__reportChoices.push(filePath ? { canceled: false, filePath } : { canceled: true }); }, filePath);
}
const fixture = (method, ...args) => page.evaluate(async ({ method, args }) => (await import("/assets/report-contract.js"))[method](...args), { method, args });
async function drawerFits() {
  const clipped = await page.evaluate(() => [...document.querySelectorAll(".tool-drawer-body, .report-card, .report-actions, .report-artifacts, .report-artifact-list, .report-artifact-row")]
    .filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => ({ class: element.className, width: element.clientWidth, content: element.scrollWidth })));
  assert.deepEqual(clipped, [], "Report content must fit its drawer, not only the outer viewport");
}
async function inspectPdf(file, entry) {
  const bytes = await fs.readFile(file); assert.ok(bytes.includes(Buffer.from("/StructTreeRoot")));
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }); const pdf = await loading.promise;
  const texts = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number); const viewport = page.getViewport({ scale: 1 });
      assert.ok(Math.abs(viewport.width - 595.28) < 1 && Math.abs(viewport.height - 841.89) < 1, "Native PDF must be A4 portrait");
      const items = (await page.getTextContent()).items.filter((item) => item.str?.trim()); const text = items.map((item) => item.str).join(" "); texts.push(text);
      if (entry) {
        assert.ok(text.includes(`Page ${number} of ${pdf.numPages}`)); assert.ok(text.includes("Generated 2026-10-19 08:36 UTC"));
        for (const item of items) assert.ok(item.transform[4] >= 41 && item.transform[4] + item.width <= 555, `Clipped PDF evidence: ${item.str}`);
      }
      assert.doesNotMatch(text, /about:blank|127\.0\.0\.1|file:\/\//);
    }
    const all = texts.join(" ");
    if (entry) {
      assert.ok(texts[0].includes("Decision summary")); assert.ok(all.includes("Engineering appendix")); assert.ok(all.includes("Çankaya İş Ağı Şebeke Öğrenim Üssü"));
      if (entry.options.optimized) assert.ok(all.includes("Baseline vs Recommended"));
      if (entry.options.heterogeneous) assert.ok(all.includes("7 of 8 Cells match"));
      if (entry.options.longIds) for (const cell of fixtureReport(entry.name).view.cells) assert.ok(all.includes(cell.id), `Missing complete Cell identity: ${cell.id}`);
      if (entry.options.extendedAppendix) assert.ok(all.includes("fixture-layer-39.geojson"));
    }
    return { pages: pdf.numPages, sha256: hash(bytes), bytes: bytes.length, text: all };
  } finally { await loading.destroy(); }
}
try {
  await fs.mkdir(resources); await fs.mkdir(output, { recursive: true });
  for (const name of [...REPORT_CASES.map((entry) => entry.name), "hostile-retained", "current-ui-report"]) await fs.rm(path.join(output, `${name}.pdf`), { force: true });
  for (const name of ["atom-api", "data-pipeline", "atom.png", "build-info.json"]) await fs.symlink(path.join(desktop, "build/resources", name), path.join(resources, name));
  await fs.cp(path.join(desktop, "build/resources/dist"), path.join(resources, "dist"), { recursive: true });
  await build({ configFile: false, publicDir: false, logLevel: "warn", build: { emptyOutDir: false, minify: false,
    outDir: path.join(resources, "dist/assets"), lib: { entry: path.join(desktop, "test/fixtures/report-contract.mjs"), formats: ["es"], fileName: () => "report-contract.js" } } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profile, ATOM_DESKTOP_TEST_RESOURCES: resources }; delete env.ELECTRON_RUN_AS_NODE;
  delete env.ATOM_DESKTOP_DEV_SERVER; delete env.ATOM_DESKTOP_DEV_CONTROL;
  application = await launchNative({ executablePath: require("electron"), args: [desktop], env, chromiumSandbox: true, timeout: 60_000 });
  page = await application.firstWindow();
  page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) posts.push(request.url()); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 }); await waitForRuntime(page, (runtime) => runtime.state === "ready");
  await application.evaluate(({ app, dialog }) => {
    globalThis.__reportChoices = []; globalThis.__reportDialogs = []; globalThis.__reportSurfaces = [];
    dialog.showSaveDialog = async (_owner, options) => { globalThis.__reportDialogs.push(options); return globalThis.__reportChoices.shift() ?? { canceled: true }; };
    app.on("web-contents-created", (_event, contents) => {
      const pdf = contents.printToPDF.bind(contents);
      contents.printToPDF = async (options) => {
        const preferences = contents.getLastWebPreferences();
        globalThis.__reportSurfaces.push({ javascript: preferences.javascript, node: preferences.nodeIntegration, sandbox: preferences.sandbox,
          preload: Boolean(preferences.preload), persistent: contents.session.isPersistent() });
        if (globalThis.__holdReport) { globalThis.__heldContents = contents; await new Promise((resolve) => { globalThis.__releaseReport = resolve; }); }
        return pdf(options);
      };
      // Qualifies the real isolated Print operation and cancellation path;
      // external OS printer dialog appearance is outside this automation.
      contents.print = (_options, callback) => callback(false, "Print job canceled");
    });
  });
  const denied = await page.evaluate(() => window.atomDesktop.saveReportFile({ format: "html", bytes: new Uint8Array([1]), sha256: "a".repeat(64), name: "x.html", path: "/unapproved/file" }));
  assert.equal(denied.error.code, "report_invalid_request"); assert.equal(await application.evaluate(() => globalThis.__reportDialogs.length), 0);
  assert.deepEqual(await fixture("saveFixture", "html"), { canceled: true });
  assert.deepEqual(await fixture("pdfFixture", "eight-cells"), { canceled: true });
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  for (const format of ["html", "markdown", "svg"]) {
    const expected = fixtureOutput(format); const file = path.join(scratch, expected.metadata.filename); await choose(file);
    const saved = await fixture("saveFixture", format); assert.equal(saved.sha256, hash(expected.bytes)); assert.deepEqual(await fs.readFile(file), Buffer.from(expected.bytes));
  }
  result.fixed_shared_html_markdown_svg_bytes_and_hashes_matched = true;
  for (const entry of REPORT_CASES) {
    const file = path.join(output, `${entry.name}.pdf`); await choose(file); await fixture("pdfFixture", entry.name);
    const { text: _text, ...record } = await inspectPdf(file, entry); result.pdf_cases.push({ name: entry.name, ...record });
  }
  const hostile = `<!doctype html><meta charset="utf-8"><h1>Türkçe retained report</h1><script>globalThis.__reportRan=true;opener.atomDesktop.openExternal('https://evil.invalid')</script><img src="${origin}/image"><style>@import url('${origin}/style');</style><iframe src="app://atom/"></iframe>`;
  const hostileFile = path.join(output, "hostile-retained.pdf"); await choose(hostileFile); await application.evaluate(() => { globalThis.__holdReport = true; });
  const rendering = fixture("outputHtml", hostile);
  await until(() => application.evaluate(() => Boolean(globalThis.__releaseReport)), "The isolated report did not reach native PDF rendering");
  const isolated = application.windows().find((window) => window.url().startsWith("atom-report:")); assert.ok(isolated);
  assert.deepEqual(await isolated.evaluate(() => ({ bridge: typeof window.atomDesktop, node: typeof require, opener: window.opener, executed: Boolean(globalThis.__reportRan) })), { bridge: "undefined", node: "undefined", opener: null, executed: false });
  assert.equal(await isolated.evaluate(async (origin) => { try { await fetch(origin); return true; } catch { return false; } }, origin), false);
  const heldGeneration = await page.evaluate(async () => (await window.atomDesktop.getRuntime()).generation);
  await application.evaluate(({ app }) => app.quit());
  await page.getByText("Finish or cancel the native file operation before quitting.", { exact: true }).waitFor();
  assert.equal(application.process().exitCode, null); assert.equal((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, heldGeneration);
  result.quit_during_native_output_preserved_window_and_runtime = true;
  await application.evaluate(() => { globalThis.__holdReport = false; globalThis.__releaseReport(); globalThis.__releaseReport = null; }); await rendering;
  await inspectPdf(hostileFile); assert.deepEqual(requests, []);
  assert.ok((await application.evaluate(() => globalThis.__reportSurfaces)).every((surface) => surface.javascript === false && surface.node === false && surface.sandbox === true && surface.preload === false && surface.persistent === false));
  result.hostile_retained_html_had_no_scripts_bridge_opener_or_network = true;
  const dialogs = await application.evaluate(() => globalThis.__reportDialogs.length); assert.deepEqual(await fixture("outputHtml", hostile, "print"), { canceled: true });
  assert.equal(await application.evaluate(() => globalThis.__reportDialogs.length), dialogs); result.native_print_cancellation_preserved_evidence = true;
  assert.equal(posts.length, 0); result.fixture_exports_did_not_request_rf = true;
  // Exercise the normal product controls after one explicit real-engine Run.
  const sector = page.waitForResponse((response) => response.url().endsWith("/api/analyze-sector") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Run Sector", exact: true }).click(); assert.equal((await sector).status(), 200);
  await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: /^Project menu,/ }).click(); await page.getByRole("button", { name: "Save Version", exact: true }).click();
  await page.getByText("Version saved", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Review workspace" }).click(); await page.locator("#stage-tool-review-report").click();
  const beforeExports = posts.length; const markdown = path.join(scratch, "UI report — çığ.md"); await choose(markdown);
  await page.getByRole("button", { name: "Markdown", exact: true }).click(); await until(async () => Boolean(await fs.stat(markdown).catch(() => null)), "Markdown did not reach native Save");
  await until(async () => (await fixture("retained")).some((entry) => entry.metadata.format === "markdown"), "Report bytes were not retained");
  const stored = (await fixture("retained")).find((entry) => entry.metadata.format === "markdown"); assert.deepEqual(await fs.readFile(markdown), Buffer.from(stored.bytes)); assert.equal(hash(await fs.readFile(markdown)), stored.metadata.content_hash);
  await until(async () => !await page.getByRole("button", { name: "Save PDF", exact: true }).isDisabled(), "Markdown Save did not finish");
  const uiPdf = path.join(output, "current-ui-report.pdf"); await choose(uiPdf); await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  await until(async () => Boolean(await fs.stat(uiPdf).catch(() => null)), "Save PDF did not commit", 30_000); await inspectPdf(uiPdf);
  await until(async () => !await page.getByRole("button", { name: "Save PDF", exact: true }).isDisabled(), "PDF Save did not finish");
  const zip = path.join(scratch, "UI review package — çığ.zip"); await choose(zip); await page.getByRole("button", { name: "Review package", exact: true }).click();
  await until(async () => Boolean(await fs.stat(zip).catch(() => null)), "Review package did not reach native Save"); assert.equal((await verifyReviewPackage(await fs.readFile(zip))).valid, true);
  assert.equal(posts.length, beforeExports); result.normal_ui_saved_retained_markdown_pdf_and_verified_review_zip_without_rf = true;
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await drawerFits();
  await page.screenshot({ path: path.join(output, "native-report-actions.png") });
  await page.setViewportSize({ width: 800, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await drawerFits();
  await page.screenshot({ path: path.join(output, "native-report-actions-800.png") });
  result.report_controls_fit_wide_and_minimum_width = true;
  const deniedDirectory = path.join(scratch, "Read only report destination"); await fs.mkdir(deniedDirectory);
  const preserved = path.join(deniedDirectory, "Last good.md"); await fs.writeFile(preserved, "last good report bytes"); await fs.chmod(deniedDirectory, 0o500);
  try {
    const beforeFailure = await application.evaluate(() => globalThis.__reportDialogs.length); await choose(preserved);
    await page.getByRole("button", { name: "Markdown", exact: true }).click(); await page.getByRole("alert").filter({ hasText: /permissions/ }).waitFor();
    await until(async () => !await page.getByRole("button", { name: "Save PDF", exact: true }).isDisabled(), "Failed output did not release its UI state");
    assert.equal(await fs.readFile(preserved, "utf8"), "last good report bytes"); assert.equal(await application.evaluate(() => globalThis.__reportDialogs.length), beforeFailure + 1);
    const unchanged = (await fixture("retained")).find((entry) => entry.metadata.artifact_id === stored.metadata.artifact_id);
    assert.equal(unchanged.metadata.content_hash, stored.metadata.content_hash); assert.equal(unchanged.metadata.generated_at, stored.metadata.generated_at); assert.deepEqual(unchanged.bytes, stored.bytes);
    assert.equal(posts.length, beforeExports); result.failed_save_preserved_file_retained_artifact_and_timestamp_without_second_dialog = true;
  } finally { await fs.chmod(deniedDirectory, 0o700); }
  result.result = "PASS"; await fs.writeFile(path.join(desktop, "test-results/reports.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await fs.mkdir(output, { recursive: true }); await page?.screenshot({ path: path.join(output, "failed-reports.png") }).catch(() => {});
  const workspace = await fixture("workspaceDiffs").catch(() => null);
  const notices = await page?.locator('[role="alert"], [role="status"], .report-source-lineage').allTextContents().catch(() => []);
  await fs.writeFile(path.join(desktop, "test-results/failed-reports.json"), JSON.stringify({ ...result, error: error.stack, workspace, notices }, null, 2)); throw error;
} finally {
  if (application && result.result !== "PASS") await application.evaluate(({ app }) => app.exit(1)).catch(() => {});
  await application?.close(); await new Promise((resolve) => server.close(resolve)); await fs.rm(scratch, { recursive: true, force: true });
}
