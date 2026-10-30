import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env, version as nodeVersion } from "node:process";
import { basemapSnapshot, selectBasemap, waitForBasemap } from "./basemapHelpers.js";

// Explicit authoring workflow: never replace committed captures in normal CI.
test("capture a matched real-app documentation hero pair", async ({ page, browser }, info) => {
  test.skip(env.ATOM_DOCS_HERO_CAPTURE !== "1", "Run with the dedicated documentation capture config and flag");
  expect(info.project.name).toBe("desktop-1440");
  const directory = resolve("../docs/assets/current-workspace");
  const fixturePath = resolve("../examples/ankara-two-cell-walkthrough.atom-project.json");
  const fixtureBytes = await readFile(fixturePath);
  const metaResponse = await page.request.get("/api/meta");
  expect(metaResponse.ok()).toBe(true);
  const meta = await metaResponse.json();
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  expect(meta.build_commit).toBe(sourceCommit);
  expect(meta.application_version).toBe((await readFile("../VERSION", "utf8")).trim());
  const calls = [];
  const tileStatuses = new Map();
  page.on("response", (response) => {
    if (/\/\d+\/\d+\/\d+(?:@2x)?\.png$/.test(new URL(response.url()).pathname)) tileStatuses.set(response.url(), response.status());
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) calls.push(new URL(request.url()).pathname);
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector", exact: true })).toBeEnabled();
  const menuTrigger = page.getByRole("button", { name: /^Project menu/ });
  await menuTrigger.click();
  await page.getByRole("dialog", { name: "Project and scenarios" }).locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByRole("button", { name: "Network mode, 2 selected", exact: true })).toBeVisible();
  const evaluated = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/evaluate-network" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Evaluate Network", exact: true }).click();
  const resultResponse = await evaluated;
  expect(resultResponse.ok()).toBe(true);
  const result = await resultResponse.json();
  const request = resultResponse.request().postDataJSON();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Review workspace", exact: true }).click();
  await page.locator("#stage-tool-review-results").click();
  await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();
  await waitForBasemap(page);
  const rfCalls = calls.length;
  const captures = [];
  await mkdir(directory, { recursive: true });
  for (const theme of ["Light", "Dark"]) {
    const layers = page.getByRole("button", { name: "Map layers", exact: true });
    await layers.click();
    await page.getByRole("group", { name: "Appearance" }).getByRole("radio", { name: theme, exact: true }).check();
    await layers.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
    await selectBasemap(page, theme === "Light" ? "Alidade Smooth" : "Alidade Smooth Dark");
    await waitForBasemap(page);
    await page.evaluate(() => document.fonts.ready);
    const state = await basemapSnapshot(page);
    const tileUrls = await page.locator(".atom-basemap .leaflet-tile").evaluateAll((tiles) => tiles.map((tile) => tile.src));
    await expect.poll(() => tileUrls.every((url) => tileStatuses.get(url) === 200)).toBe(true);
    const scientificState = { tileViewport: state.tileViewport, tiles: state.tiles.map((path) => path.match(/\/\d+\/\d+\/\d+\.png$/)?.[0]).sort(), selectedMarkers: state.selectedMarkers, mapTransform: state.mapTransform, context: state.context, status: state.status, primary: state.primary, scientificPalette: state.scientificPalette };
    expect(state.layerCount).toBe(1);
    expect(state.tileViewport).not.toBeNull();
    expect(state.selectedMarkers).toHaveLength(2);
    expect(calls).toHaveLength(rfCalls);
    if (captures.length) expect(scientificState).toEqual(captures[0].state);
    const filename = `${theme.toLowerCase()}.png`;
    const bytes = await page.screenshot({ path: resolve(directory, filename), animations: "disabled" });
    captures.push({ theme: theme.toLowerCase(), file: filename, sha256: createHash("sha256").update(bytes).digest("hex"), basemap: theme === "Light" ? "alidade-smooth" : "alidade-smooth-dark", tileHttpStatus: 200, overlayCanvasHashes: state.overlayCanvasHashes, state: scientificState });
  }
  const manifest = {
    schema: "atom.documentation-hero.v1", capturedAt: new Date().toISOString(),
    sourceCommit, applicationVersion: meta.application_version, modelVersion: meta.model_version,
    viewport: info.project.use.viewport, browser: browser.version(), toolchain: { node: nodeVersion, go: "go1.26.10" },
    dataset: { id: meta.dataset.id, version: meta.dataset.version, hashes: meta.dataset.sha256 },
    fixture: "examples/ankara-two-cell-walkthrough.atom-project.json", fixtureSha256: createHash("sha256").update(fixtureBytes).digest("hex"),
    request, scenarioFingerprint: result.scenario_fingerprint,
    result: { score: result.stats.score, servedDemandWeight: result.stats.raw_metrics.served_weighted_demand, residentialBuildings: result.stats.unique_residential_buildings, overlapBuildings: result.stats.overlap_buildings },
    rfRequests: calls, captures,
    scope: "Actual UI and real local Go API on the public planning pack; same execution, selected Cells and map viewport in both themes. Planning estimates, not field measurements.",
    command: "cd frontend-react && ATOM_DOCS_HERO_CAPTURE=1 npm exec --yes --package=node@24 -- node node_modules/@playwright/test/cli.js test --config playwright.docs-hero.config.js",
  };
  await writeFile(resolve(directory, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
});
