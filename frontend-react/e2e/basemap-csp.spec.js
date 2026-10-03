import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { env } from "node:process";
import { BASEMAPS } from "../src/components/basemaps.js";
import { basemapSnapshot, selectBasemap, waitForBasemap } from "./basemapHelpers.js";

test.describe("basemaps under the production CSP", () => {
  test.setTimeout(90_000);
  test.beforeEach(() => {
    test.skip(env.ATOM_REAL_E2E !== "1", "Use ATOM_REAL_E2E=1 for the Go-served production CSP");
  });

  test("permits both configured raster providers without changing map state", async ({ page }) => {
    // Exercise browser CSP enforcement with deterministic images at the real provider URLs.
    const tile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8VIAAAAASUVORK5CYII=", "base64");
    await page.route(/https:\/\/(tile\.openstreetmap\.org|tiles\.stadiamaps\.com)\//, (route) => route.fulfill({ body: tile, contentType: "image/png" }));
    await verifyProviders(page, false);
  });

  test("loads live Alidade Smooth and OpenStreetMap tiles without CSP violations", async ({ page }) => {
    test.skip(env.ATOM_LIVE_TILES !== "1", "Set ATOM_LIVE_TILES=1 for remote provider verification");
    await verifyProviders(page, true);
  });
});

async function verifyProviders(page, live) {
  const responses = [];
  const cspErrors = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) cspErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (BASEMAPS.some((provider) => response.url().startsWith(new URL(provider.url).origin + "/"))) {
      responses.push({ url: response.url(), status: response.status() });
    }
  });
  await page.addInitScript(() => {
    window.basemapCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.basemapCspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
  const response = await page.goto("/");
  const policy = response.headers()["content-security-policy"];
  expect(policy).toBeTruthy();
  const imageDirective = policy.split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("img-src "));
  expect(imageDirective.split(/\s+/)).toEqual([
    "img-src", "'self'", "data:", ...BASEMAPS.map((provider) => new URL(provider.url).origin),
  ]);
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  if (await page.getByRole("button", { name: "Close tool drawer" }).isVisible()) {
    await page.getByRole("button", { name: "Close tool drawer" }).click();
  }
  await waitForBasemap(page);
  const before = await basemapSnapshot(page);
  for (const [label, className, host] of [
    ["Alidade Smooth", "atom-basemap-alidade", "tiles.stadiamaps.com"],
    ["OpenStreetMap", "atom-basemap-osm", "tile.openstreetmap.org"],
    ["Alidade Smooth", "atom-basemap-alidade", "tiles.stadiamaps.com"],
  ]) {
    await selectBasemap(page, label);
    await waitForBasemap(page);
    await expect(page.locator(`.${className}`)).toHaveCount(1);
    await expect(page.locator(".map-basemap-status")).toHaveCount(0);
    const after = await basemapSnapshot(page);
    for (const field of ["mapTransform", "tileViewport", "overlayCanvasHashes", "selectedMarkers", "markerHTML", "overlayHTML", "context", "status", "primary"]) {
      expect(after[field], field).toEqual(before[field]);
    }
    expect(after.layerCount).toBe(1);
    const loaded = await page.locator(`.${className} .leaflet-tile-loaded`).evaluateAll((tiles) => tiles.map((tile) => ({ url: tile.src, width: tile.naturalWidth })));
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.every((tile) => new URL(tile.url).hostname === host && tile.width >= (live ? 256 : 1))).toBe(true);
    expect(responses.some((tile) => new URL(tile.url).hostname === host && tile.status === 200)).toBe(true);
  }
  expect(await page.evaluate(() => window.basemapCspViolations)).toEqual([]);
  expect(cspErrors).toEqual([]);
  if (live) console.log("Live basemap CSP verification", JSON.stringify({ policy, responses, cspErrors }));
}
