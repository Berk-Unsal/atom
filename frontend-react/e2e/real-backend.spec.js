/* global process */

import { expect, test } from "@playwright/test";

const runRealBackend = process.env.ATOM_REAL_E2E === "1";

test.describe("Concept 3 RF surface with the real backend", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }, testInfo) => {
    void page;
    test.skip(!runRealBackend, "Run with ATOM_REAL_E2E=1 to exercise the local backend");
    test.skip(testInfo.project.name !== "desktop-1440", "The real-backend acceptance flow runs once at desktop size");
  });

  test("loads a single-cell surface from Signal without rerunning RF", async ({ page }) => {
    const observation = observeNetwork(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled({ timeout: 120_000 });

    await page.getByRole("button", { name: "Run Sector" }).click();
    await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible({ timeout: 120_000 });

    const signal = page.getByRole("button", { name: "Toggle received signal surface" });
    await expect(signal).toBeEnabled();
    await expect(signal).toHaveAttribute("data-surface-state", "available");
    const rfRequestCount = observation.rfRequests();

    await signal.click();
    await expect(signal).toHaveAttribute("data-surface-state", "ready", { timeout: 120_000 });
    await expect(page.locator(".leaflet-image-layer")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Toggle propagation rays" })).toHaveAttribute("aria-pressed", "false");
    expect(observation.rfRequests()).toBe(rfRequestCount);
    expect(observation.surfaceRequests()).toBe(1);

    await page.getByRole("button", { name: "Toggle propagation rays" }).click();
    await expect(page.getByRole("button", { name: "Toggle propagation rays" })).toHaveAttribute("aria-pressed", "true");
    expect(observation.rfRequests()).toBe(rfRequestCount);

    await assertTileRequestsSettled(page, observation);
  });

  test("evaluates six cells and keeps Signal, ray scope, and priority inspection local", async ({ page }) => {
    const observation = observeNetwork(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled({ timeout: 120_000 });

    await selectDenseNetworkArea(page);
    await expect(page.getByRole("button", { name: "Network mode, 6 selected" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Evaluate Network" })).toBeEnabled();

    await page.getByRole("button", { name: "Evaluate Network" }).click();
    await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible({ timeout: 120_000 });
    const rfRequestCount = observation.rfRequests();
    const signal = page.getByRole("button", { name: "Toggle received signal surface" });
    await expect(signal).toBeEnabled();
    await expect(signal).toHaveAttribute("data-surface-state", "available");

    await signal.click();
    await expect(signal).toHaveAttribute("data-surface-state", "ready", { timeout: 120_000 });
    await expect(page.locator(".leaflet-image-layer")).toBeVisible({ timeout: 30_000 });
    expect(observation.rfRequests()).toBe(rfRequestCount);
    expect(observation.surfaceRequests()).toBe(1);
    expect(observation.lastSurfacePayload()).toEqual(expect.objectContaining({
      rf_profile: expect.any(Object),
      tower_lat: expect.any(Number),
      tower_lon: expect.any(Number),
    }));

    const rays = page.getByRole("button", { name: "Toggle propagation rays" });
    await expect(rays).toHaveAttribute("aria-pressed", "false");
    await rays.click();
    await expect(rays).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("combobox", { name: "Ray scope" }).selectOption("selected");
    await expect(page.getByRole("combobox", { name: "Ray scope" })).toHaveValue("selected");
    await page.getByRole("combobox", { name: "Ray scope" }).selectOption("all");
    await expect(page.getByRole("combobox", { name: "Ray scope" })).toHaveValue("all");
    expect(observation.rfRequests()).toBe(rfRequestCount);

    await page.getByRole("button", { name: "Simulate workspace" }).click();
    await page.getByRole("button", { name: "Propagation", exact: true }).click();
    await page.getByRole("slider", { name: "Demand importance" }).fill("100");
    await expect(signal).toHaveAttribute("data-surface-state", "ready");
    expect(observation.rfRequests()).toBe(rfRequestCount);

    await assertTileRequestsSettled(page, observation);
  });
});

function observeNetwork(page) {
  const apiRequests = [];
  const requests = [];
  const tileResponses = [];
  const surfaces = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(url.pathname);
    if (url.hostname === "tile.openstreetmap.org") {
      void request.allHeaders().then((headers) => {
        requests.push({
          cacheControl: headers["cache-control"] ?? "",
          pragma: headers.pragma ?? "",
          referer: headers.referer ?? "",
          url: request.url(),
        });
      });
    }
    if (url.pathname === "/api/coverage-surface") {
      surfaces.push(request.postDataJSON());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname === "tile.openstreetmap.org") {
      void response.allHeaders().then((headers) => {
        tileResponses.push({
          cacheControl: headers["cache-control"] ?? "",
          status: response.status(),
          url: response.url(),
        });
      });
    }
  });

  return {
    rfRequests: () => apiRequests.filter((path) => ["/api/analyze-sector", "/api/evaluate-network", "/api/simulate"].includes(path)).length,
    surfaceRequests: () => surfaces.length,
    lastSurfacePayload: () => surfaces.at(-1),
    tileRequests: requests,
    tileResponses,
  };
}

async function assertTileRequestsSettled(page, observation) {
  await page.waitForTimeout(1200);
  const tileRequests = observation.tileRequests;
  const tileResponses = observation.tileResponses;
  console.log("OSM tile observation", JSON.stringify({
    requestCount: tileRequests.length,
    responseCount: tileResponses.length,
    uniqueRequestCount: new Set(tileRequests.map((request) => request.url)).size,
    firstRequest: tileRequests[0],
    firstResponse: tileResponses[0],
  }));
  expect(tileRequests.length).toBeGreaterThan(0);
  expect(tileRequests.length).toBeLessThan(100);
  expect(new Set(tileRequests.map((request) => request.url)).size).toBeGreaterThan(0);
  for (const request of tileRequests) {
    expect(request.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png(?:\?.*)?$/);
    expect(request.cacheControl.toLowerCase()).not.toContain("no-cache");
    expect(request.pragma.toLowerCase()).not.toContain("no-cache");
  }
  expect(tileRequests.some((request) => request.referer)).toBe(true);
  expect(observation.tileResponses.length).toBeGreaterThan(0);
}

async function selectDenseNetworkArea(page) {
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await page.getByRole("button", { name: "Draw selection area" }).click();
  const left = Math.min(box.width - 240, Math.max(460, box.width * 0.4));
  const right = box.width - 100;
  const top = 150;
  const bottom = Math.max(top + 120, box.height - 180);
  for (const position of [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]) {
    await map.click({ force: true, position });
  }
  await expect(page.getByRole("button", { name: "Finish" })).toBeEnabled();
  await page.getByRole("button", { name: "Finish" }).click();
}
