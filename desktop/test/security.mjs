import { _electron as electron } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { waitForRuntime } from "./runtime-wait.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "atom-native-security-"));
const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
let application; let page;
const networkRequests = [];
const server = http.createServer((request, response) => {
  networkRequests.push(request.url);
  if (request.url === "/redirect") { response.writeHead(302, { location: "/redirected" }); response.end(); }
  else { response.writeHead(200, { "content-type": "text/html" }); response.end("<h1>Untrusted network content</h1>"); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const hostileOrigin = `http://127.0.0.1:${server.address().port}`;
try {
  application = await electron.launch({ executablePath: require("electron"), args: [root], env, chromiumSandbox: true, timeout: 60_000 });
  page = await application.firstWindow();
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  await waitForRuntime(page, (runtime) => runtime.state === "ready");
  await application.evaluate(({ shell }) => {
    globalThis.__securityExternal = [];
    shell.openExternal = async (url) => { globalThis.__securityExternal.push(url); };
  });
  const csp = await page.evaluate(async () => (await fetch("/")).headers.get("content-security-policy"));
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval|ws:|wss:|connect-src[^;]*\*/);
  await page.evaluate(() => {
    globalThis.__securityViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => globalThis.__securityViolations.push(event.effectiveDirective));
    const script = document.createElement("script");
    script.textContent = 'globalThis.__inlineExecuted=true;window.atomDesktop.openExternal("https://evil.invalid/")';
    document.body.append(script);
    const frame = document.createElement("iframe");
    frame.srcdoc = '<script>parent.__frameExecuted=true;parent.atomDesktop.openExternal("https://evil.invalid/")</script>';
    document.body.append(frame);
  });
  await page.waitForFunction(() => globalThis.__securityViolations.some((value) => value.startsWith("script-src")));
  assert.deepEqual(await page.evaluate(() => [Boolean(globalThis.__inlineExecuted), Boolean(globalThis.__frameExecuted)]), [false, false]);
  // Chromium can create srcdoc without a network/frame navigation. It inherits
  // the strict script CSP, receives no preload and cannot fetch app resources.
  for (const frame of page.frames().filter((candidate) => candidate !== page.mainFrame())) {
    assert.equal(await frame.evaluate(() => typeof window.atomDesktop), "undefined");
    assert.equal(await frame.evaluate(async () => { try { await fetch("app://atom/api/meta"); return true; } catch { return false; } }), false);
  }
  for (const url of ["file:///etc/passwd", "http://127.0.0.1:8080/api/meta", "https://evil.invalid/project"]) {
    assert.equal(await page.evaluate(async (target) => { try { await fetch(target); return true; } catch { return false; } }, url), false);
  }
  // Exercise the actual project importer. HTML-shaped user text remains text;
  // it cannot become a native-capable document or execute through React.
  const project = JSON.parse(await fs.readFile(path.join(root, "../examples/ankara-sample.atom-project.json"), "utf8"));
  project.project.name = '<img src=x onerror="window.__importExecuted=true">';
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  await page.locator('input[type="file"][accept=".json,.atom-project.json"]').setInputFiles({ name: "hostile.atom-project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await page.getByRole("button", { name: `Project menu, ${project.project.name} (Imported)`, exact: true }).waitFor();
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  assert.equal(await page.getByLabel("Project name", { exact: true }).inputValue(), `${project.project.name} (Imported)`);
  assert.equal(await page.evaluate(() => Boolean(globalThis.__importExecuted)), false);
  await page.keyboard.press("Escape");

  for (const target of ["file:///etc/passwd", "data:text/html,<script>opener.__popupExecuted=true</script>", "about:blank", "app://atom/api/meta"]) {
    assert.equal(await page.evaluate((url) => window.open(url, "_blank") === null, target), true);
  }
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  // Renderer navigation vectors go through native navigation/session policy,
  // regardless of application click handlers.
  await application.evaluate(({ BrowserWindow }) => {
    globalThis.__blockedNavigation = 0;
    BrowserWindow.getAllWindows()[0].webContents.on("will-navigate", () => { globalThis.__blockedNavigation++; });
  });
  for (const target of ["file:///etc/passwd", "data:text/html,<h1>untrusted</h1>", "app://atom/api/meta", "javascript:window.__navigationExecuted=true"]) {
    await page.evaluate((url) => { location.href = url; return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); }, target);
    assert.equal(page.url(), "app://atom/");
  }
  assert.ok(await application.evaluate(() => globalThis.__blockedNavigation) >= 1);
  assert.equal(await page.evaluate(() => Boolean(globalThis.__navigationExecuted)), false);
  const cdp = await page.context().newCDPSession(page);
  const drag = { items: [{ mimeType: "text/uri-list", data: "file:///etc/passwd" }], dragOperationsMask: 1 };
  for (const type of ["dragEnter", "dragOver", "drop"]) await cdp.send("Input.dispatchDragEvent", { type, x: 500, y: 200, data: drag });
  await cdp.detach();
  assert.equal(page.url(), "app://atom/");
  assert.deepEqual(await application.evaluate(() => globalThis.__securityExternal), []);
  await assert.rejects(page.evaluate(() => window.atomDesktop.openExternal({ path: "/etc/passwd" })), /HTTPS/);
  assert.equal(await page.evaluate(() => ["invoke", "readFile", "writeFile", "exec", "restart", "token", "address"].some((name) => name in window.atomDesktop)), false);

  // Force a foreign document from the test's main process. This deliberately
  // bypasses renderer navigation events; the preload still withholds authority.
  const foreign = await application.evaluate(async ({ BrowserWindow }, origin) => {
    const owner = BrowserWindow.getAllWindows()[0];
    const window = new BrowserWindow({ show: false, webPreferences: { preload: owner.webContents.getLastWebPreferences().preload,
      partition: "native-security-foreign", nodeIntegration: false, sandbox: true, contextIsolation: true } });
    try {
      await window.loadURL("data:text/html,<h1>foreign</h1>");
      const before = await window.webContents.executeJavaScript('({ foreign: location.protocol === "data:", bridge: typeof window.atomDesktop, node: typeof require, process: typeof process })');
      let redirected = false;
      window.webContents.once("will-redirect", () => { redirected = true; });
      await window.loadURL(`${origin}/redirect`).catch(() => {});
      return { ...before, redirectBlocked: redirected && window.webContents.getURL() !== `${origin}/redirected` };
    } finally { window.destroy(); }
  }, hostileOrigin);
  assert.deepEqual(foreign, { foreign: true, bridge: "undefined", node: "undefined", process: "undefined", redirectBlocked: true });
  assert.deepEqual(networkRequests, ["/redirect"]);
  const reportCreated = application.waitForEvent("window");
  await application.evaluate(async ({ app, BrowserWindow, session }) => {
    const require = process.getBuiltinModule("module").createRequire(`${app.getAppPath()}/main.cjs`);
    const { createReportSurface } = require("./lib/report-surface.cjs");
    globalThis.__securityReport = await createReportSurface({ BrowserWindow, session, parent: BrowserWindow.getAllWindows()[0],
      html: '<!doctype html><meta charset="utf-8"><h1>Türkçe report — çığ</h1><script>globalThis.__reportRan=true;opener.atomDesktop.openExternal("https://evil.invalid/")</script><iframe src="app://atom/"></iframe><a href="https://evil.invalid/report">Untrusted report link</a><img src="https://evil.invalid/secret"><style>h1{color:#123}</style>' });
    globalThis.__securityReport.show();
  });
  const report = await reportCreated;
  await report.getByRole("heading", { name: "Türkçe report — çığ" }).waitFor();
  assert.deepEqual(await report.evaluate(() => ({ bridge: typeof window.atomDesktop, node: typeof require, opener: window.opener,
    executed: Boolean(globalThis.__reportRan) })), { bridge: "undefined", node: "undefined", opener: null, executed: false });
  const reportURL = report.url();
  assert.equal(await report.evaluate(async (origin) => { try { await fetch(`${origin}/report-exfiltration`); return true; } catch { return false; } }, hostileOrigin), false);
  assert.deepEqual(networkRequests, ["/redirect"]);
  await report.getByRole("link", { name: "Untrusted report link" }).click({ noWaitAfter: true });
  assert.equal(report.url(), reportURL);
  assert.deepEqual(await application.evaluate(() => globalThis.__securityExternal), []);
  assert.deepEqual(await application.evaluate(() => {
    const contents = globalThis.__securityReport.webContents;
    const preferences = contents.getLastWebPreferences();
    return { javascript: preferences.javascript, node: preferences.nodeIntegration, sandbox: preferences.sandbox,
      preload: Boolean(preferences.preload), persistent: contents.session.isPersistent() };
  }), { javascript: false, node: false, sandbox: true, preload: false, persistent: false });
  await report.screenshot({ path: path.join(root, "test-results/isolated-report.png") });
  await application.evaluate(() => globalThis.__securityReport.destroy());
  await page.screenshot({ path: path.join(root, "test-results/security.png") });
  const evidence = { result: "PASS", productionCSP: true, untrustedFrameScriptsAndRequestsDenied: true, directNetworkDenied: true,
    importedProjectTextDidNotExecute: true, popupAndTopLevelNavigationDenied: true, foreignDocumentHadNoBridge: true,
    rendererHadNoFilesystemOrProcessCapabilities: true, nativeRedirectAndDragNavigationDenied: true,
    isolatedReportHadNoScriptsBridgeOpenerNetworkOrDurableSession: true };
  await fs.writeFile(path.join(root, "test-results/security.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(JSON.stringify(await page?.evaluate(() => ({ url: location.href, violations: globalThis.__securityViolations,
    inlineExecuted: Boolean(globalThis.__inlineExecuted), frameExecuted: Boolean(globalThis.__frameExecuted) })).catch(() => null)));
  await page?.screenshot({ path: path.join(root, "test-results/failed-security.png") }).catch(() => {});
  throw error;
} finally {
  await application?.close();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(profile, { recursive: true, force: true });
}
