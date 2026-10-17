// Product audit: first-run exploration against a running A.T.O.M build.
// Usage: node explore-first-run.mjs [baseURL]  (run with frontend-react/node_modules resolvable)
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://127.0.0.1:18090";
const shots = join(here, "screenshots");
const traces = join(here, "traces");

const browser = await chromium.launch();
const out = {};
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  const requests = [];
  const consoleMsgs = [];
  page.on("request", (r) => { if (r.url().includes("/api/")) requests.push({ t: Date.now(), method: r.method(), url: r.url().replace(base, "") }); });
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text()}`); });
  const t0 = Date.now();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const domReady = Date.now() - t0;
  await page.waitForLoadState("networkidle").catch(() => {});
  const idle = Date.now() - t0;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(shots, `01-first-run-1440-${scheme}.png`) });
  const aria = await page.locator("body").ariaSnapshot();
  out[scheme] = { domReady, idle, requests, consoleMsgs, aria };
  await ctx.close();
}
await browser.close();
writeFileSync(join(traces, "first-run.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ light: { domReady: out.light.domReady, idle: out.light.idle, requests: out.light.requests.map((r) => r.method + " " + r.url), console: out.light.consoleMsgs } }, null, 2));
console.log(out.light.aria);
