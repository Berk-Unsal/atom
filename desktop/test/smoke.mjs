import { _electron as electron } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "atom-native-"));
const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
let application;
let nativeProcess;
try {
  application = await electron.launch({ executablePath: require("electron"), args: [root], env, chromiumSandbox: true, timeout: 60_000 });
  nativeProcess = application.process();
  const page = await application.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  const info = await page.evaluate(() => window.atomDesktop.getInfo());
  assert.equal(info.version, (await fs.readFile(path.join(root, "../VERSION"), "utf8")).trim());
  assert.equal(info.shell, "electron");
  assert.equal(info.rendererSandboxed, true);
  assert.equal(info.commit, JSON.parse(await fs.readFile(path.join(root, "build/resources/build-info.json"), "utf8")).commit);
  const bridge = await page.evaluate(() => ({ keys: Object.keys(window.atomDesktop).sort(), node: typeof window.require, process: typeof window.process }));
  assert.deepEqual(bridge, { keys: ["getInfo", "openExternal", "protocol"], node: "undefined", process: "undefined" });
  const status = await page.evaluate(async () => {
    const response = await fetch("/readyz", { headers: { "x-atom-client": "1" } });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(status.status, 200, JSON.stringify(status));
  assert.equal(await page.evaluate(async () => (await fetch("/api/meta")).status), 403);
  const sectorResponse = page.waitForResponse((response) => response.url().includes("/api/") && response.request().method() === "POST" && !response.url().includes("/export"));
  await page.getByRole("button", { name: "Run Sector", exact: true }).click();
  const sector = await sectorResponse;
  assert.equal(sector.status(), 200, `Run Sector returned HTTP ${sector.status()}`);
  await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  // Exercise the existing multi-request RF workflow through the real shared UI;
  // HTTP 200 alone would miss a stripped workflow capability or failed follow-up.
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  const selectCells = page.getByRole("button", { name: "Select cells", exact: true });
  if (await selectCells.isVisible()) await selectCells.click();
  else {
    await page.getByRole("button", { name: /^Map interaction:/ }).click();
    await page.locator(".map-interaction-popover").getByRole("button", { name: "Select cells", exact: true }).click();
  }
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  await page.getByRole("button", { name: "Draw selection area", exact: true }).click();
  const left = Math.min(box.width - 240, Math.max(460, box.width * 0.4));
  for (const position of [{ x: left, y: 150 }, { x: box.width - 100, y: 150 }, { x: box.width - 100, y: Math.max(270, box.height - 180) }, { x: left, y: Math.max(270, box.height - 180) }]) await map.click({ force: true, position });
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Evaluate Network", exact: true }).click();
  await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "Review workspace", exact: true }).click();
  await page.locator("#stage-tool-review-results").click();
  await page.locator(".network-card").first().waitFor({ state: "visible", timeout: 15_000 });
  await assert.rejects(page.evaluate(() => window.atomDesktop.openExternal("file:///etc/passwd")), /HTTPS/);
  await application.evaluate(({ shell }) => {
    globalThis.__externalLinks = [];
    shell.openExternal = async (url) => { globalThis.__externalLinks.push(url); };
  });
  await page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "https://example.com/docs"; anchor.textContent = "Native test external link";
    document.body.append(anchor);
  });
  await page.getByRole("link", { name: "Native test external link", exact: true }).click({ noWaitAfter: true });
  await page.waitForTimeout(250);
  assert.deepEqual(await application.evaluate(() => globalThis.__externalLinks), ["https://example.com/docs"]);
  assert.equal(page.url(), "app://atom/");
  await page.evaluate(() => document.querySelector('a[href="https://example.com/docs"]').remove());
  const menu = await application.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((item) => item.label));
  assert.ok(menu.includes("File") && menu.includes("Edit") && menu.includes("View"));
  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  await page.screenshot({ path: path.join(root, "test-results/shell.png") });
  // Real navigation attempt must not replace the shared app or create a window.
  await page.evaluate(() => { location.href = "file:///etc/passwd"; });
  await page.waitForTimeout(250);
  assert.equal(page.url(), "app://atom/");
  const metrics = await application.evaluate(({ app }) => app.getAppMetrics().filter((metric) => metric.type === "Tab").map((metric) => ({ sandboxed: metric.sandboxed })));
  // ProcessMetric.sandboxed is macOS/Windows-only. The sandboxed preload's
  // process.sandboxed flag above is supported on both targets. On Linux also
  // assert actual renderer kernel enforcement, never substitute --no-sandbox.
  assert.ok(metrics.length > 0);
  for (const metric of metrics) if (typeof metric.sandboxed === "boolean") assert.equal(metric.sandboxed, true);
  let linuxSandbox;
  if (process.platform === "linux") {
    const rendererPID = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getOSProcessId());
    const processStatus = await fs.readFile(`/proc/${rendererPID}/status`, "utf8");
    linuxSandbox = { noNewPrivileges: Number(/^NoNewPrivs:\s*(\d+)$/m.exec(processStatus)?.[1]), seccomp: Number(/^Seccomp:\s*(\d+)$/m.exec(processStatus)?.[1]) };
    assert.deepEqual(linuxSandbox, { noNewPrivileges: 1, seccomp: 2 });
  }
  // Observe the real sidecar PID before closing the only normal window.
  const parentPID = nativeProcess.pid;
  const childLine = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n")
    .find((line) => { const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line); return match && +match[2] === parentPID && match[3].endsWith("/atom-api"); });
  assert.ok(childLine, "The real API must be an owned child of Electron");
  const sidecarPID = +childLine.trim().split(/\s+/)[0];
  const closed = new Promise((resolve) => nativeProcess.once("exit", resolve));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Closing the only window did not quit")), 35_000); timer.unref(); })]);
  assert.throws(() => process.kill(sidecarPID, 0), { code: "ESRCH" });
  const evidence = { result: "PASS", info, status: status.status, sector: { url: sector.url(), status: sector.status() }, networkWorkflow: "ready with Results", menu, renderer: bridge, rendererSandbox: metrics, linuxSandbox, sidecarReaped: true };
  await fs.writeFile(path.join(root, "test-results/smoke.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (application && nativeProcess?.exitCode === null && nativeProcess?.signalCode === null) await application.close();
  await fs.rm(profile, { recursive: true, force: true });
}
