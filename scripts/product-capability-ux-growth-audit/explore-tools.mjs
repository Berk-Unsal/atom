// Product audit pass 2: every tool panel, Pareto, candidates, save/reload continuity, exports, inspector.
// Usage (from frontend-react): AUDIT_DIR=../scripts/product-capability-ux-growth-audit node <copy>.mjs http://127.0.0.1:18090
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.AUDIT_DIR;
const base = process.argv[2] ?? "http://127.0.0.1:18090";
const shots = join(dir, "screenshots");
const log = [];
const note = (step, data = {}) => { log.push({ step, ...data }); console.log(step, JSON.stringify(data).slice(0, 900)); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const api = [];
page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push({ t: Date.now(), p: `${r.method()} ${u.pathname}` }); });
const shot = (n) => page.screenshot({ path: join(shots, `${n}.png`) });
const drawer = () => page.locator("dialog.tool-drawer").first();
const drawerAria = async () => (await drawer().ariaSnapshot({ timeout: 3000 }).catch(() => "")).slice(0, 6000);
const openTool = async (stage, name) => {
  const trigger = page.getByRole("button", { name: `${stage} workspace` });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await page.locator(`[data-stage-chooser]`).getByRole("button", { name: new RegExp(`^${name}`) }).first().click({ force: true });
  await page.waitForTimeout(700);
};
const since = (t) => api.filter((r) => r.t >= t).map((r) => r.p);

await page.goto(base);
await page.getByRole("button", { name: "Run Sector" }).waitFor();
await page.waitForTimeout(1200);

// Tool tour before any run (empty states)
for (const [stage, tool, id] of [["Plan", "Inventory", "30-inventory"], ["Plan", "Scenarios", "31-scenarios-empty"], ["Simulate", "Experiments", "32-experiments"], ["Simulate", "Signal surface", "33-signal-surface-empty"], ["Analyze", "Interference", "34-interference-single-mode"], ["Analyze", "RF Diagnostics", "35-rf-diagnostics"], ["Analyze", "Building entry", "36-building-entry"], ["Analyze", "5G Core", "37-5g-core"], ["Review", "Results", "38-results-empty"], ["Review", "Run history", "39-history-empty"], ["Review", "Data", "40-data"], ["Review", "Report", "41-report-empty"]]) {
  const t = Date.now();
  await openTool(stage, tool);
  await shot(id);
  const body = drawer().locator(".tool-drawer-body");
  const metrics = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }), null, { timeout: 3000 }).catch(() => null);
  note(`tool:${tool}`, { metrics, api: since(t), aria: await drawerAria() });
}

// Stage chooser screenshot
await page.getByRole("button", { name: "Analyze workspace" }).click();
await page.waitForTimeout(300);
await shot("42-analyze-chooser-single-mode");
note("analyze-chooser", { aria: (await page.locator(".stage-tool-chooser-flyout").ariaSnapshot().catch(() => "")).slice(0, 3000) });
await page.keyboard.press("Escape");

// Inspector: click the active cell marker in the map center
await openTool("Plan", "Setup");
await page.getByRole("button", { name: "Fit selected cells" }).click();
await page.waitForTimeout(1200);
await shot("43-fit-selected-single");
const marker = page.locator(".leaflet-marker-icon.active, .leaflet-marker-icon").first();
note("marker-count", { markers: await page.locator(".leaflet-marker-icon").count(), interactive: await page.locator(".leaflet-interactive").count() });

// Run single then inspect a ray
let t = Date.now();
await page.getByRole("button", { name: "Run Sector" }).click();
await page.getByText("Ready", { selector: ".run-state" }).waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "Fit selected cells" }).click();
await page.waitForTimeout(1200);
await shot("44-single-result-fitted");
const rays = page.locator("path.leaflet-interactive");
note("ray-paths", { count: await rays.count() });
if (await rays.count()) {
  await rays.nth(Math.floor((await rays.count()) / 2)).click({ force: true });
  await page.waitForTimeout(700);
  await shot("45-inspector-ray");
  note("inspector-ray", { aria: await drawerAria() });
}

// Save version (accessible name "Save current"), then reload and check restoration
await page.getByRole("button", { name: "Open project menu" }).click();
await page.waitForTimeout(300);
const saveBtn = page.getByRole("button", { name: "Save current" });
note("save-button", { visibleText: await saveBtn.innerText(), accessibleName: "Save current" });
await saveBtn.click();
await page.waitForTimeout(1500);
await shot("46-after-save-version-menu");
note("after-save-menu", { aria: (await page.locator(".project-menu").ariaSnapshot().catch(() => "")).slice(0, 3000) });
await page.keyboard.press("Escape");
note("menu-open-after-escape", { open: await page.locator(".project-menu").count() });
await page.mouse.click(40, 20);
note("identity-after-save", { identity: await page.locator("[aria-label='Workspace']").innerText(), status: await page.locator("[aria-label='Status']").innerText() });

// Export project (download name)
await page.getByRole("button", { name: "Open project menu" }).click();
const [projDl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }).catch(() => null), page.getByRole("button", { name: "Export" }).click()]);
note("project-export", { filename: projDl?.suggestedFilename() ?? null });
if (projDl) await projDl.saveAs(join(dir, "traces", "sample-export.atom-project.json"));
await page.mouse.click(40, 20);

// Markdown report download
await openTool("Review", "Report");
const [mdDl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }).catch(() => null), page.getByRole("button", { name: "Markdown" }).click()]);
await page.waitForTimeout(800);
note("report-md", { filename: mdDl?.suggestedFilename() ?? null });
if (mdDl) await mdDl.saveAs(join(dir, "traces", "sample-report.md"));
await shot("47-report-after-markdown");
note("report-after", { aria: await drawerAria() });

// Reload continuity after save
t = Date.now();
await page.reload();
await page.locator("[aria-label='Primary action'] button").waitFor();
await page.waitForTimeout(2500);
note("reload-after-save", { identity: await page.locator("[aria-label='Workspace']").innerText(), status: await page.locator("[aria-label='Status']").innerText(), api: since(t) });
await shot("48-reload-after-save");

// Network: select, optimize, Pareto, Candidates, Compare
await openTool("Plan", "Setup");
await page.getByRole("button", { name: /^Network mode,/ }).click();
await page.getByLabel("Map controls").getByRole("button", { name: "Select cells", exact: true }).click();
await page.getByRole("button", { name: "Draw selection area" }).click();
const map = page.locator(".leaflet-container");
const box = await map.boundingBox();
const left = Math.min(box.width - 240, Math.max(460, box.width * 0.4));
for (const position of [{ x: left, y: 150 }, { x: box.width - 260, y: 150 }, { x: box.width - 260, y: box.height - 180 }, { x: left, y: box.height - 180 }]) await map.click({ force: true, position });
await page.getByRole("button", { name: "Finish" }).click();
await page.waitForTimeout(500);
await openTool("Simulate", "Propagation");
t = Date.now();
await page.getByRole("button", { name: "Optimize Network" }).click();
await page.waitForTimeout(1200);
await shot("49-optimizing-feedback");
note("optimizing-feedback", { aria: await drawerAria() });
await page.getByRole("button", { name: "Optimize Network" }).waitFor({ timeout: 180000 });
note("optimize-done", { ms: Date.now() - t });
await page.getByRole("button", { name: "Fit selected cells" }).click();
await page.waitForTimeout(1200);
await shot("50-optimized-fitted");
await openTool("Review", "Results");
await page.getByRole("button", { name: "Explore solutions" }).click().catch(() => {});
await page.waitForTimeout(800);
await shot("51-solutions-pareto");
note("solutions", { aria: await drawerAria() });
await drawer().locator(".tool-drawer-body").evaluate((el) => el.scrollTo(0, el.scrollHeight)).catch(() => {});
await page.waitForTimeout(300);
await shot("52-solutions-bottom");
await page.getByRole("tab", { name: "Compare" }).click().catch(() => {});
await page.waitForTimeout(500);
await shot("53-compare-tab");
note("compare", { aria: await drawerAria() });
await page.getByRole("tab", { name: "Interference" }).click().catch(() => {});
await page.waitForTimeout(500);
await shot("54-results-interference-tab-empty");
note("results-interference-empty", { aria: await drawerAria() });
// Candidates live where? try tab names
for (const name of ["Candidates", "Solutions"]) note(`tab-${name}`, { exists: await page.getByRole("tab", { name }).count() });

// Apply a solution
await page.getByRole("tab", { name: "Solutions" }).click().catch(() => {});
await page.waitForTimeout(400);
const applyBtn = drawer().getByRole("button", { name: /Apply|Use/ }).first();
note("apply-button", { count: await drawer().getByRole("button", { name: /Apply|Use/ }).count(), label: await applyBtn.innerText().catch(() => null) });
if (await applyBtn.count()) {
  await applyBtn.click();
  await page.waitForTimeout(700);
  await shot("55-apply-solution-dialog");
  note("apply-dialog", { aria: (await page.locator("dialog[open], [role=dialog]").last().ariaSnapshot().catch(() => "")).slice(0, 3000) });
  await page.keyboard.press("Escape");
}

writeFileSync(join(dir, "traces", "tools-walk.json"), JSON.stringify({ base, log }, null, 2));
await browser.close();
