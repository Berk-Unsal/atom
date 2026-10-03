/* global process */
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

test("real RF budget: six-cell Evaluate, Interference, inspect, re-evaluate, then abuse", async ({ page }, testInfo) => {
  test.skip(process.env.ATOM_REAL_E2E !== "1", "Requires the isolated real backend");
  test.skip(testInfo.project.name !== "desktop-1440", "One isolated client/window");
  test.setTimeout(120_000);
  // Control selection only. Every RF request uses the real handlers and dataset.
  const towers = { type: "FeatureCollection", features: Array.from({ length: 6 }, (_, index) => ({
    type: "Feature", id: `budget-tower-${index + 1}`,
    properties: { cell_id: `budget-cell-${index + 1}`, radio_type: "NR" },
    geometry: { type: "Point", coordinates: [32.850 + index * 0.001, 39.920 + index * 0.001] },
  })) };
  await page.route("**/api/towers", (route) => route.fulfill({ json: towers }));
  await page.route(/https:\/\/(tiles\.stadiamaps\.com|tile\.openstreetmap\.org)\//, (route) => route.abort());
  const trace = [];
  const pending = [];
  const byRequest = new Map();
  let owner = "load/select";
  page.on("request", (request) => {
    const endpoint = new URL(request.url()).pathname;
    if (!/^\/api\/(evaluate-network|simulate|interference)$/.test(endpoint)) return;
    const row = { request_id: `audit-${trace.length + 1}`, timestamp: new Date().toISOString(), owner, endpoint,
      payload: request.postDataJSON(), status: null, completed: false, cancelled: false };
    trace.push(row);
    byRequest.set(request, row);
  });
  page.on("requestfinished", (request) => { const row = byRequest.get(request); if (row) row.completed = true; });
  page.on("requestfailed", (request) => { const row = byRequest.get(request); if (row) row.cancelled = true; });
  page.on("response", (response) => {
    const row = byRequest.get(response.request());
    if (!row) return;
    pending.push(Promise.all([response.allHeaders(), response.body()]).then(([headers, body]) => {
      row.status = response.status();
      row.remaining = Number(headers["ratelimit-remaining"]);
      row.limit = Number(headers["ratelimit-limit"]);
      row.reset_seconds = Number(headers["ratelimit-reset"]);
      row.retry_after = headers["retry-after"] ?? null;
      row.budget_after = row.limit - row.remaining;
      row.budget_before = row.status === 429 ? row.budget_after : row.budget_after - 1;
      row.response_sha256 = createHash("sha256").update(body).digest("hex");
    }));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await page.locator(".map-desktop-interaction").getByRole("button", { name: "Select cells", exact: true }).click();
  await page.getByRole("button", { name: "Draw selection area" }).click();
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  for (const position of [{ x: 580, y: 150 }, { x: box.width - 100, y: 150 },
    { x: box.width - 100, y: box.height - 180 }, { x: 580, y: box.height - 180 }]) {
    await map.click({ force: true, position });
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Network mode, 6 selected" })).toBeVisible();
  expect(trace).toHaveLength(0);
  owner = "Evaluate Network";
  await page.getByRole("button", { name: "Evaluate Network" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await Promise.all(pending);
  expect(trace.map((row) => row.endpoint)).toEqual(["/api/evaluate-network", ...Array(6).fill("/api/simulate")]);

  owner = "inspect/open Analyze";
  await selectTool(page, "review", "Review", "results");
  await selectTool(page, "analyze", "Analyze", "interference");
  expect(trace).toHaveLength(7);
  owner = "Analyze Interference";
  await page.getByRole("button", { name: "Analyze Interference", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analyze Interference", exact: true })).toBeEnabled();
  await Promise.all(pending);
  expect(trace).toHaveLength(8);
  expect(trace[7].endpoint).toBe("/api/interference");

  owner = "inspect/review/tool/drawer";
  await selectTool(page, "review", "Review", "results");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectTool(page, "simulate", "Simulate", "propagation");
  expect(trace).toHaveLength(8);
  owner = "Re-evaluate Network";
  await page.getByRole("button", { name: "Evaluate Network" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await Promise.all(pending);
  expect(trace).toHaveLength(15);
  expect(trace.map((row) => row.status)).toEqual(Array(15).fill(200));
  expect(trace.map((row) => row.remaining)).toEqual(Array.from({ length: 15 }, (_, index) => 19 - index));
  expect(trace.slice(8).map((row) => row.payload)).toEqual(trace.slice(0, 7).map((row) => row.payload));
  expect(trace.slice(8).map((row) => row.response_sha256)).toEqual(trace.slice(0, 7).map((row) => row.response_sha256));
  expect(trace.every((row) => !row.cancelled)).toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);

  owner = "deliberate rapid third evaluation";
  await page.getByRole("button", { name: "Evaluate Network" }).click();
  await expect(page.getByRole("alert")).toHaveText("RF analysis request budget exceeded; retry after the current rate-limit window");
  await Promise.all(pending);
  expect(trace).toHaveLength(21);
  expect(trace[20]).toMatchObject({ status: 429, budget_before: 20, budget_after: 20, remaining: 0 });
  expect(Number(trace[20].retry_after)).toBeGreaterThan(0);
  await selectTool(page, "review", "Review", "results");
  await selectTool(page, "simulate", "Simulate", "propagation");
  expect(trace).toHaveLength(21);
  const tracePath = testInfo.outputPath("rf-budget-trace.json");
  await writeFile(tracePath, JSON.stringify(trace, null, 2));
  await testInfo.attach("rf-budget-trace", { path: tracePath, contentType: "application/json" });
});

async function selectTool(page, stage, label, tool) {
  await page.getByRole("button", { name: `${label} workspace` }).click();
  await page.locator(`#stage-tool-${stage}-${tool}`).click();
}
