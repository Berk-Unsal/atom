// Product audit pass 4: default-result quality per technology, inspector, inventory editor, layers menu.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.AUDIT_DIR;
const base = process.argv[2] ?? "http://127.0.0.1:18090";
const shots = join(dir, "screenshots");
const log = [];
const note = (step, data = {}) => { log.push({ step, ...data }); console.log(step, JSON.stringify(data).slice(0, 1200)); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
await page.goto(base);
await page.getByRole("button", { name: "Run Sector" }).waitFor();
await page.waitForTimeout(1000);

const readRF = async () => {
  const out = {};
  for (const row of await page.locator(".metric-row").all()) {
    const t = (await row.innerText()).split("\n");
    out[t[0]] = t.slice(1).join(" ");
  }
  return out;
};
for (const tech of ["4G LTE, 2.6 GHz", "5G mmWave, 28 GHz"]) {
  await page.getByRole("button", { name: "Plan workspace" }).click().catch(() => {});
  await page.locator("[data-stage-chooser]").getByRole("button", { name: /^Setup/ }).first().click({ force: true }).catch(() => {});
  await page.getByRole("button", { name: tech }).click();
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByText("Ready", { selector: ".run-state" }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.locator("[data-stage-chooser]").getByRole("button", { name: /^Results/ }).first().click({ force: true });
  await page.waitForTimeout(600);
  note(`default-${tech}`, await readRF());
}
await page.getByRole("button", { name: "Fit selected cells" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(shots, "80-4g-vs-5g-last-result-fitted.png") });

// Inspector on the active marker
const marker = page.locator(".leaflet-marker-icon").first();
await marker.click({ force: true });
await page.waitForTimeout(800);
await page.screenshot({ path: join(shots, "81-inspector-cell.png") });
note("inspector-cell", { aria: (await page.locator("dialog.tool-drawer").ariaSnapshot({ timeout: 3000 }).catch(() => "")).slice(0, 3500) });

// Layers menu and View menu
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Map layers" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(shots, "82-layers-menu.png") });
note("layers", { aria: (await page.locator(".map-layer-menu, [aria-label='Map layers'] + *").first().ariaSnapshot({ timeout: 3000 }).catch(() => "")).slice(0, 2500) });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Map view options" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(shots, "83-view-menu.png") });
await page.keyboard.press("Escape");

// Inventory editor for the active cell
await page.getByRole("button", { name: "Plan workspace" }).click();
await page.locator("[data-stage-chooser]").getByRole("button", { name: /^Inventory/ }).first().click({ force: true });
await page.waitForTimeout(600);
const search = page.getByRole("textbox", { name: "Search by Cell ID or record ID" });
await search.fill("26380");
await page.waitForTimeout(600);
await page.screenshot({ path: join(shots, "84-inventory-search.png") });
const firstResult = page.locator("dialog.tool-drawer").getByRole("button", { name: /26380/ }).first();
if (await firstResult.count()) { await firstResult.click(); await page.waitForTimeout(600); }
await page.screenshot({ path: join(shots, "85-inventory-editor.png") });
const body = page.locator("dialog.tool-drawer .tool-drawer-body");
note("inventory-editor", { metrics: await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })).catch(() => null), aria: (await page.locator("dialog.tool-drawer").ariaSnapshot({ timeout: 3000 }).catch(() => "")).slice(0, 5000) });
writeFileSync(join(dir, "traces", "defaults-walk.json"), JSON.stringify({ base, log }, null, 2));
await browser.close();
