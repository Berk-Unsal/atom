import { expect, test } from "@playwright/test";

const towers = {
  type: "FeatureCollection",
  features: [
    point("tower-1", "cell-1", 32.8500, 39.9200),
    point("tower-2", "cell-2", 32.8540, 39.9220),
    point("tower-3", "cell-3", 32.8580, 39.9240),
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const payloads = {
      "/api/meta": {
        application_version: "e2e",
        build_commit: "test",
        model_version: "fspl-walls-cell-profiles-v2",
        supported_technologies: ["4g", "5g", "6g"],
        dataset: { id: "ankara-default", version: "1.0.0", sha256: {} },
      },
      "/api/towers": towers,
      "/api/buildings/summary": { total_buildings: 12, demand_buildings: 8, confidence: "sample" },
      "/api/analyze-sector": {
        simulation: {
          geojson: {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: { rx_dbm: -72 },
              geometry: { type: "LineString", coordinates: [[32.85, 39.92], [32.851, 39.921]] },
            }],
          },
          stats: { avg_rx_dbm: -72, max_distance_m: 400, total_rays: 120 },
        },
        coverage_gaps: {
          geojson: { type: "FeatureCollection", features: [] },
          stats: { gap_pct: 0, gap_buildings: 0, candidate_buildings: 8 },
        },
      },
      "/api/simulate": {
        geojson: {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { rx_dbm: -72 },
            geometry: { type: "LineString", coordinates: [[32.85, 39.92], [32.851, 39.921]] },
          }],
        },
        stats: { avg_rx_dbm: -72, max_distance_m: 400, total_rays: 120 },
      },
      "/api/coverage-gaps": {
        geojson: { type: "FeatureCollection", features: [] },
        stats: { gap_pct: 0, gap_buildings: 0, candidate_buildings: 8 },
      },
    };
    const body = payloads[url.pathname];
    if (!body) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not mocked" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
});

test("runs a sector and preserves a named scenario", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await expect(page.getByRole("dialog", { name: "Results" })).toContainText("-72.0 dBm");

  await page.getByRole("button", { name: "Open project menu" }).click();
  await page.getByRole("button", { name: "Save current" }).click();
  await expect(page.getByRole("dialog", { name: "Project and scenarios" })).toContainText("Sector plan 1");
  await expect(page.getByRole("dialog", { name: "Project and scenarios" }).getByRole("status")).toHaveText("Scenario saved");

  await page.reload();
  await page.getByRole("button", { name: "Open project menu" }).click();
  await expect(page.getByRole("dialog", { name: "Project and scenarios" })).toContainText("Sector plan 1");
});

test("keeps the focused workspace usable without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Ankara propagation map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await expect(page.getByRole("button", { name: "Interference" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "5G Core" })).toBeEnabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("keeps every workspace destination reachable in the mobile rail", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Mobile navigation regression");

  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Workspace stages" });
  const dimensions = await navigation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));

  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(390);

  for (const stage of ["Plan workspace", "Simulate workspace", "Analyze workspace", "Review workspace"]) {
    await expect(page.getByRole("button", { name: stage })).toBeInViewport();
  }

  await page.getByRole("button", { name: "Review workspace" }).click();

  for (const destination of ["Results", "Data", "Report"]) {
    const button = page.getByRole("button", { name: destination, exact: true });
    await expect(button).toBeInViewport();
    if (destination !== "Results") await button.click();
    await expect(page.getByRole("dialog", { name: destination })).toBeVisible();
  }
});

test("keeps propagation actions clear of the vertical path profile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate workspace" }).click();

  const toolNavigation = page.getByRole("navigation", { name: "Simulate tools" });
  const activeTool = page.getByRole("button", { name: "Propagation", exact: true });
  const optimizeButton = page.getByRole("button", { name: "Auto-Optimize Sector" });
  const pathProfile = page.getByRole("region", { name: "Vertical path profile" });
  await expect(toolNavigation).toBeVisible();
  await expect(activeTool).toBeVisible();
  await expect(optimizeButton).toBeVisible();
  await expect(pathProfile).toBeVisible();

  const [navigationBox, activeToolBox, optimizeBox, pathProfileBox] = await Promise.all([
    toolNavigation.boundingBox(),
    activeTool.boundingBox(),
    optimizeButton.boundingBox(),
    pathProfile.boundingBox(),
  ]);
  expect(navigationBox).not.toBeNull();
  expect(activeToolBox).not.toBeNull();
  expect(optimizeBox).not.toBeNull();
  expect(pathProfileBox).not.toBeNull();
  expect((navigationBox.y + navigationBox.height) - (activeToolBox.y + activeToolBox.height)).toBeGreaterThanOrEqual(6);
  expect(pathProfileBox.y - (optimizeBox.y + optimizeBox.height)).toBeGreaterThanOrEqual(8);
});

function point(id, cellID, longitude, latitude) {
  return {
    type: "Feature",
    id,
    properties: { cell_id: cellID, radio_type: "5G", is_simulated: false },
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  };
}
