// Product audit pass 3: error/empty/loading states (request interception), responsive light/dark, keyboard focus.
// Usage (from frontend-react): AUDIT_DIR=../scripts/product-capability-ux-growth-audit node <copy>.mjs http://127.0.0.1:18090
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.AUDIT_DIR;
const base = process.argv[2] ?? "http://127.0.0.1:18090";
const shots = join(dir, "screenshots");
const log = [];
const note = (step, data = {}) => { log.push({ step, ...data }); console.log(step, JSON.stringify(data).slice(0, 700)); };
const browser = await chromium.launch();

async function fresh({ width = 1440, height = 900, scheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  return { ctx, page };
}
const visibleText = async (page) => (await page.locator("body").innerText()).slice(0, 2500);

// A. Backend unavailable at load
{
  const { ctx, page } = await fresh();
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
  await page.goto(base);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(shots, "60-backend-unavailable.png") });
  note("backend-unavailable", { primaryDisabled: await page.locator("[aria-label='Primary action'] button").isDisabled().catch(() => null), alerts: await page.locator("[role=alert], .run-history-message, .tool-error, [role=status]").allInnerTexts() });
  await ctx.close();
}
// B. Towers 500 only
{
  const { ctx, page } = await fresh();
  await page.route("**/api/towers", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "dataset load failed" }) }));
  await page.goto(base);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(shots, "61-towers-500.png") });
  note("towers-500", { alerts: await page.locator("[role=alert], [role=status]").allInnerTexts() });
  await ctx.close();
}
// C. RF 429 with Retry-After, RF 500, slow RF (loading state)
for (const [id, handler] of [
  ["62-rf-429", (route) => route.fulfill({ status: 429, headers: { "Retry-After": "17", "content-type": "application/json" }, body: JSON.stringify({ error: "RF request budget exceeded" }) })],
  ["63-rf-500", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal error" }) })],
  ["64-rf-slow", async (route) => { await new Promise((r) => setTimeout(r, 6000)); await route.continue(); }],
]) {
  const { ctx, page } = await fresh();
  await page.goto(base);
  await page.getByRole("button", { name: "Run Sector" }).waitFor();
  await page.waitForTimeout(1000);
  await page.route("**/api/analyze-sector", handler);
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.waitForTimeout(id === "64-rf-slow" ? 1500 : 2000);
  await page.screenshot({ path: join(shots, `${id}.png`) });
  note(id, { status: await page.locator("[aria-label='Status']").innerText().catch(() => ""), primary: await page.locator("[aria-label='Primary action']").innerText().catch(() => ""), alerts: await page.locator("[role=alert]").allInnerTexts(), drawerError: await page.locator("dialog.tool-drawer .tool-drawer-error, dialog.tool-drawer [role=alert]").allInnerTexts() });
  await ctx.close();
}
// D. Invalid RF input
{
  const { ctx, page } = await fresh();
  await page.goto(base);
  await page.getByRole("button", { name: "Run Sector" }).waitFor();
  const tx = page.getByRole("spinbutton", { name: /Conducted TX power/ });
  await tx.fill("99");
  await tx.blur();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, "65-invalid-tx-power.png") });
  note("invalid-tx", { value: await tx.inputValue(), primary: await page.locator("[aria-label='Primary action']").innerText(), primaryDisabled: await page.locator("[aria-label='Primary action'] button").isDisabled(), invalid: await tx.getAttribute("aria-invalid"), text: (await page.locator("dialog.tool-drawer").innerText()).slice(0, 900) });
  await ctx.close();
}
// E. Responsive & theme matrix with a network result visible
for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768]]) {
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await fresh({ width: w, height: h, scheme });
    await page.goto(base);
    await page.getByRole("button", { name: "Run Sector" }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(shots, `70-first-run-${w}x${h}-${scheme}.png`) });
    // Open Results with single run
    await page.getByRole("button", { name: "Run Sector" }).click();
    await page.getByText("Ready", { selector: ".run-state" }).waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Fit selected cells" }).click().catch(() => {});
    await page.waitForTimeout(1000);
    const review = page.getByRole("button", { name: "Review workspace" });
    await review.click();
    await page.locator("[data-stage-chooser]").getByRole("button", { name: /^Results/ }).first().click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(shots, `71-results-${w}x${h}-${scheme}.png`) });
    const overflow = await page.evaluate(() => ({ docW: document.documentElement.scrollWidth, winW: window.innerWidth, tabs: (() => { const t = document.querySelector("[role=tablist]"); return t ? { scrollW: t.scrollWidth, clientW: t.clientWidth } : null; })() }));
    note(`matrix-${w}x${h}-${scheme}`, overflow);
    await ctx.close();
  }
}
// F. Keyboard traversal from load: first 25 tab stops and focus visibility
{
  const { ctx, page } = await fresh();
  await page.goto(base);
  await page.getByRole("button", { name: "Run Sector" }).waitFor();
  await page.waitForTimeout(1000);
  await page.mouse.click(1000, 600); // focus body area of map not required; reset
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
  const stops = [];
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), name: el.getAttribute("aria-label") || el.innerText?.trim().slice(0, 40) || el.getAttribute("title") || "", outline: `${cs.outlineStyle} ${cs.outlineWidth}`, boxShadow: cs.boxShadow !== "none" };
    }));
    if (i === 6) await page.screenshot({ path: join(shots, "75-keyboard-focus-stop7.png") });
  }
  note("tab-stops", { stops });
  // Escape behavior on project menu
  await page.getByRole("button", { name: "Open project menu" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  note("project-menu-escape", { stillOpen: await page.locator(".project-menu").count(), triggerLabel: await page.getByRole("button", { name: "Open project menu" }).getAttribute("aria-expanded") });
  // Marker keyboard reachability
  note("marker-keyboard", { focusableMarkers: await page.locator(".leaflet-marker-icon[tabindex='0']").count(), canvasPresent: await page.locator(".leaflet-container canvas").count() });
  await ctx.close();
}
writeFileSync(join(dir, "traces", "states-walk.json"), JSON.stringify({ base, log }, null, 2));
await browser.close();
