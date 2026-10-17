// Product audit: end-to-end workflow walk against a running A.T.O.M build.
// Usage (from frontend-react so @playwright/test resolves):
//   AUDIT_DIR=../scripts/product-capability-ux-growth-audit node <copy>.mjs http://127.0.0.1:18090
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.AUDIT_DIR;
const base = process.argv[2] ?? "http://127.0.0.1:18090";
const shots = join(dir, "screenshots");
const log = [];
const note = (step, data = {}) => { log.push({ step, at: new Date().toISOString(), ...data }); console.log(step, JSON.stringify(data)); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", acceptDownloads: true });
const page = await ctx.newPage();
const api = [];
page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push({ t: Date.now(), m: r.method(), p: u.pathname }); });
page.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && r.status() >= 400) note("http-error", { path: u.pathname, status: r.status() }); });
const shot = async (name) => page.screenshot({ path: join(shots, `${name}.png`) });
const apiSince = (t) => api.filter((r) => r.t >= t).map((r) => `${r.m} ${r.p}`);
const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => "")).slice(0, 600);

await page.goto(base);
await page.getByRole("button", { name: "Run Sector" }).waitFor();
await page.waitForTimeout(1200);

// 1. Single-sector run
let t = Date.now();
await page.getByRole("button", { name: "Run Sector" }).click();
await page.getByText("Ready", { selector: ".run-state" }).waitFor({ timeout: 120000 });
note("single-run", { ms: Date.now() - t, api: apiSince(t), status: await text(".run-state") });
await page.waitForTimeout(800);
await shot("02-single-run-result-1440-light");
note("after-single-run-aria", { aria: (await page.locator("main").ariaSnapshot()).slice(0, 5000) });

// 2. Results tool after single run
await page.getByRole("button", { name: "Review workspace" }).click();
await page.waitForTimeout(300);
await shot("03-review-stage-chooser");
await page.getByRole("button", { name: /^Results/ }).first().click();
await page.waitForTimeout(800);
await shot("04-results-single-1440-light");
note("results-single-aria", { aria: (await page.locator("dialog.tool-drawer").first().ariaSnapshot()).slice(0, 6000) });

// 3. Auto-optimize sector
await page.getByRole("button", { name: "Simulate workspace" }).click();
await page.getByRole("button", { name: /^Propagation/ }).first().click();
await page.waitForTimeout(400);
await shot("05-propagation-single");
t = Date.now();
await page.getByRole("button", { name: "Auto-Optimize Sector" }).click();
await page.getByRole("button", { name: "Auto-Optimize Sector" }).waitFor({ timeout: 120000 });
await page.waitForTimeout(1000);
note("single-optimize", { ms: Date.now() - t, api: apiSince(t), status: await text(".run-state") });
await shot("06-single-optimize-result");

// 4. Network: select dense area via polygon
await page.getByRole("button", { name: "Plan workspace" }).click();
await page.getByRole("button", { name: /^Setup/ }).first().click();
await page.getByRole("button", { name: /^Network mode,/ }).click();
await page.waitForTimeout(300);
note("network-mode-switch", { status: await text(".run-state"), primary: await text("[aria-label='Primary action']") });
await shot("07-network-mode-empty");
await page.getByLabel("Map controls").getByRole("button", { name: "Select cells", exact: true }).click();
await page.waitForTimeout(300);
await shot("08-select-cells-mode");
// Zoom into dense cluster first so cells are separable
await page.getByRole("button", { name: "Draw selection area" }).click();
const map = page.locator(".leaflet-container");
const box = await map.boundingBox();
// Same dense-area polygon as e2e/real-backend.spec.js selectDenseNetworkArea (container-relative).
{
  const left = Math.min(box.width - 240, Math.max(460, box.width * 0.4));
  const right = box.width - 100;
  const top = 150;
  const bottom = Math.max(top + 120, box.height - 180);
  for (const position of [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]) await map.click({ force: true, position });
}
await shot("09-drawing-polygon");
await page.getByRole("button", { name: "Finish" }).click();
await page.waitForTimeout(600);
note("polygon-selection", { setupLabel: await page.getByRole("button", { name: /^Network mode,/ }).getAttribute("aria-label"), notice: await text(".map-selection-feedback"), mapBox: box });
await shot("10-network-selected");

// 5. Evaluate network
t = Date.now();
const primary = page.locator("[aria-label='Primary action'] button");
note("primary-before-eval", { label: await primary.innerText(), disabled: await primary.isDisabled() });
if (!(await primary.isDisabled()) && (await primary.innerText()).includes("Evaluate")) {
  await primary.click();
  await page.getByText("Ready", { selector: ".run-state" }).waitFor({ timeout: 120000 });
  note("network-evaluate", { ms: Date.now() - t, api: apiSince(t) });
  await page.waitForTimeout(1000);
  await shot("11-network-evaluated");
}

// 6. Optimize network
await page.getByRole("button", { name: "Simulate workspace" }).click();
await page.getByRole("button", { name: /^Propagation/ }).first().click();
await page.waitForTimeout(400);
await shot("12-propagation-network");
note("propagation-network-aria", { aria: (await page.locator("dialog.tool-drawer").first().ariaSnapshot()).slice(0, 5000) });
t = Date.now();
const opt = page.getByRole("button", { name: /Optimize Network/ });
if (await opt.isEnabled()) {
  await opt.click();
  await page.waitForTimeout(1500);
  await shot("13-optimizing-in-progress");
  await page.getByRole("button", { name: "Optimize Network" }).waitFor({ timeout: 180000 });
  await page.waitForTimeout(1200);
  note("network-optimize", { ms: Date.now() - t, api: apiSince(t), status: await text(".run-state") });
  await shot("14-network-optimized");
}

// 7. Results (optimization)
await page.getByRole("button", { name: "Review workspace" }).click();
await page.getByRole("button", { name: /^Results/ }).first().click();
await page.waitForTimeout(800);
await shot("15-results-optimization");
note("results-optimization-aria", { aria: (await page.locator("dialog.tool-drawer").first().ariaSnapshot()).slice(0, 9000) });
const drawerBody = page.locator(".tool-drawer-body").first();
await drawerBody.evaluate((el) => el.scrollTo(0, el.scrollHeight / 2)).catch(() => {});
await page.waitForTimeout(300);
await shot("16-results-optimization-mid");
await drawerBody.evaluate((el) => el.scrollTo(0, el.scrollHeight)).catch(() => {});
await page.waitForTimeout(300);
await shot("17-results-optimization-bottom");
note("results-scroll", { scrollHeight: await drawerBody.evaluate((el) => el.scrollHeight).catch(() => null), clientHeight: await drawerBody.evaluate((el) => el.clientHeight).catch(() => null) });

// 8. Interference
await page.getByRole("button", { name: "Analyze workspace" }).click();
const intfTool = page.getByRole("button", { name: /^Interference/ }).first();
note("interference-tool-state", { ariaDisabled: await intfTool.getAttribute("aria-disabled"), reason: await text("#stage-tool-analyze-interference-reason") });
await intfTool.click({ force: true });
await page.waitForTimeout(400);
await shot("18-interference-panel");
t = Date.now();
const ai = page.getByRole("button", { name: /Analyze Interference/ });
if (await ai.isEnabled().catch(() => false)) {
  await ai.click();
  await page.getByRole("button", { name: "Analyze Interference" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  note("interference", { ms: Date.now() - t, api: apiSince(t) });
  await shot("19-interference-result");
  note("interference-aria", { aria: (await page.locator("dialog.tool-drawer").first().ariaSnapshot()).slice(0, 5000) });
}

// 9. Run history
await page.getByRole("button", { name: "Review workspace" }).click();
await page.getByRole("button", { name: /^Run history/ }).first().click();
await page.waitForTimeout(600);
await shot("20-run-history");
note("history-aria", { aria: (await page.locator("dialog.tool-drawer").first().ariaSnapshot()).slice(0, 5000) });

// 10. Project menu + Save version
await page.getByRole("button", { name: "Open project menu" }).click();
await page.waitForTimeout(300);
await shot("21-project-menu");
note("project-menu-aria", { aria: (await page.locator(".project-menu, [role=menu], [role=dialog]").first().ariaSnapshot().catch(() => "")).slice(0, 4000) });
const save = page.getByRole("button", { name: /Save version/i }).first();
if (await save.isEnabled().catch(() => false)) {
  await save.click();
  await page.waitForTimeout(1500);
  await shot("22-after-save-version");
  note("after-save", { identity: await text("[aria-label='Workspace']") });
}
await page.keyboard.press("Escape");

// 11. Report
await page.getByRole("button", { name: "Review workspace" }).click();
await page.getByRole("button", { name: /^Report/ }).first().click();
await page.waitForTimeout(800);
await shot("23-report-panel");
note("report-aria", { aria: (await page.locator("dialog.tool-drawer").first().ariaSnapshot()).slice(0, 5000) });

// 12. Reload: continuity
t = Date.now();
await page.reload();
await page.locator("[aria-label='Primary action'] button").waitFor();
await page.waitForTimeout(2500);
note("after-reload", { ms: Date.now() - t, identity: await text("[aria-label='Workspace']"), status: await text("[aria-label='Status']"), rf: await text("[aria-label='RF context']"), api: apiSince(t) });
await shot("24-after-reload");

writeFileSync(join(dir, "traces", "workflow-walk.json"), JSON.stringify({ base, log, api }, null, 2));
await browser.close();
