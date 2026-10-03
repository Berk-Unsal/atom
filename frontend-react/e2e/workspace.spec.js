import { createThemeCaptureWriter } from "./themeCaptureHelpers.js";
import { waitForBasemap, selectBasemap, basemapSnapshot } from "./basemapHelpers.js";
import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { cwd, env } from "node:process";

const towers = {
  type: "FeatureCollection",
  features: [
    point("tower-1", "cell-1", 32.8500, 39.9200),
    point("tower-2", "cell-2", 32.8540, 39.9220),
    point("tower-3", "cell-3", 32.8580, 39.9240),
  ],
};

const workspaceTools = {
  Setup: ["plan", "Plan", "setup"],
  Inventory: ["plan", "Plan", "inventory"],
  Scenarios: ["plan", "Plan", "scenarios"],
  Propagation: ["simulate", "Simulate", "propagation"],
  Experiments: ["simulate", "Simulate", "experiments"],
  "Signal surface": ["simulate", "Simulate", "surfaces"],
  Interference: ["analyze", "Analyze", "interference"],
  "RF Diagnostics": ["analyze", "Analyze", "validation"],
  "Building entry": ["analyze", "Analyze", "building-entry"],
  "5G Core": ["analyze", "Analyze", "core"],
  Results: ["review", "Review", "results"],
  "Run history": ["review", "Review", "history"],
  Data: ["review", "Review", "data"],
  Report: ["review", "Review", "report"],
};

async function selectWorkspaceTool(page, label) {
  const [stageID, stageLabel, toolID] = workspaceTools[label];
  const option = page.locator(`#stage-tool-${stageID}-${toolID}`);
  if (!await option.count()) {
    await page.getByRole("button", { name: `${stageLabel} workspace` }).click();
  }
  await expect(option).toBeVisible();
  await option.click();
}

async function selectTheme(page, label) {
  const trigger = page.getByRole("button", { name: "Map layers" });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await page.getByRole("group", { name: "Appearance" }).getByRole("radio", { name: label, exact: true }).check();
  await trigger.click();
}

async function selectMapInteraction(page, label) {
  const desktopOption = page.locator(".map-desktop-interaction").getByRole("button", { name: label, exact: true });
  if (await desktopOption.isVisible()) {
    await desktopOption.click();
    return;
  }
  const trigger = page.getByRole("button", { name: /^Map interaction:/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await page.locator(".map-interaction-popover").getByRole("button", { name: label, exact: true }).click();
}

async function openMapView(page) {
  const trigger = page.getByRole("button", { name: "Map view options" });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
}

async function selectMapFocus(page, cellID) {
  await openMapView(page);
  await page.getByRole("combobox", { name: "Map focus cell" }).selectOption(cellID);
}

async function inspectMapFocus(page) {
  await openMapView(page);
  await page.getByRole("button", { name: "Inspect focused cell" }).click();
}

async function clickMapPoint(page, longitude, latitude) {
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(longitude, latitude, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await map.click({ position: {
    x: mapBox.width / 2 + target.x - center.x,
    y: mapBox.height / 2 + target.y - center.y,
  } });
}

const optimizationObjectiveStatus = {
  demand: { available: true },
  residential: { available: true },
  coverage: { available: true },
  overlap: { available: true },
};

const networkOptimization = {
  optimization_run_id: "e2e-network-run",
  optimized_towers: [
    { id: "cell-1", optimal_azimuth: 20, rf_profile: {} },
    { id: "cell-2", optimal_azimuth: 140, rf_profile: {} },
  ],
  stats: {
    raw_metrics: {
      served_demand_weight: 600,
      relevant_demand_weight: 1000,
      residential_covered: 15,
      relevant_residential_total: 30,
      propagation_reach_score: 60,
      propagation_reach_maximum: 100,
      covered_units: 30,
      overlap_buildings: 2,
      overlap_ratio: 0.08,
    },
    objective_status: optimizationObjectiveStatus,
  },
  baseline: {
    cell_configurations: [
      { id: "cell-1", tower_lon: 32.85, tower_lat: 39.92, azimuth_deg: 0, rf_profile: {} },
      { id: "cell-2", tower_lon: 32.854, tower_lat: 39.922, azimuth_deg: 90, rf_profile: {} },
    ],
    parameters: { rays: 72, radius_m: 400, frequency_ghz: 28, tx_power_dbm: 30, beam_width: 120 },
    stats: {
      raw_metrics: {
        served_demand_weight: 400,
        relevant_demand_weight: 1000,
        residential_covered: 10,
        relevant_residential_total: 30,
        propagation_reach_score: 50,
        propagation_reach_maximum: 100,
        covered_units: 24,
        overlap_buildings: 5,
        overlap_ratio: 0.2,
      },
      objective_status: optimizationObjectiveStatus,
    },
    constraints_satisfied: false,
  },
  optimization: {
    recommended: true,
    constraints_satisfied: true,
    objective_status: optimizationObjectiveStatus,
    recommended_solution_id: "solution-a",
    violations: [],
  },
  pareto_frontier: [
    {
      id: "solution-a",
      towers: [{ id: "cell-1", azimuth_deg: 20 }, { id: "cell-2", azimuth_deg: 140 }],
      stats: {
        raw_metrics: {
          served_demand_weight: 600,
          relevant_demand_weight: 1000,
          residential_covered: 15,
          relevant_residential_total: 30,
          propagation_reach_score: 60,
          propagation_reach_maximum: 100,
          covered_units: 30,
          overlap_buildings: 2,
          overlap_ratio: 0.08,
        },
        objective_status: optimizationObjectiveStatus,
      },
    },
    {
      id: "solution-b",
      towers: [{ id: "cell-1", azimuth_deg: 30 }, { id: "cell-2", azimuth_deg: 150 }],
      stats: {
        raw_metrics: {
          served_demand_weight: 500,
          relevant_demand_weight: 1000,
          residential_covered: 22,
          relevant_residential_total: 30,
          propagation_reach_score: 52,
          propagation_reach_maximum: 100,
          covered_units: 28,
          overlap_buildings: 4,
          overlap_ratio: 0.14,
        },
        objective_status: optimizationObjectiveStatus,
      },
    },
  ],
};

const cellExplanation = {
  available: true,
  unchanged: false,
  run_id: "e2e-network-run",
  solution_id: "solution-a",
  cell: { id: "cell-1", baseline_azimuth_deg: 0, selected_azimuth_deg: 20 },
  actual: {
    raw_metrics: {
      served_demand_weight: 600,
      relevant_demand_weight: 1000,
      residential_covered: 15,
      relevant_residential_total: 30,
      propagation_reach_score: 60,
      propagation_reach_maximum: 100,
      covered_units: 30,
      overlap_buildings: 2,
      overlap_ratio: 0.08,
    },
    constraints_satisfied: true,
  },
  counterfactual: {
    raw_metrics: {
      served_demand_weight: 400,
      relevant_demand_weight: 1000,
      residential_covered: 10,
      relevant_residential_total: 30,
      propagation_reach_score: 50,
      propagation_reach_maximum: 100,
      covered_units: 24,
      overlap_buildings: 5,
      overlap_ratio: 0.2,
    },
    constraints_satisfied: false,
    violations: ["minimum propagation reach"],
  },
  objective_status: optimizationObjectiveStatus,
  limitations: [
    "Conditional marginal comparison: selected configuration versus the same network with this cell reverted to baseline.",
    "This is not causal attribution, an independent cell contribution, or an additive decomposition; cell interactions remain.",
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/tiles.stadiamaps.com/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const payloads = {
      "/api/meta": {
        application_version: "e2e",
        build_commit: "test",
        model_version: "fspl-walls-cell-profiles-v2",
        supported_technologies: ["4g", "5g", "6g"],
        dataset: {
          id: "ankara-default",
          name: "Ankara Open Planning Dataset",
          version: "2026.07",
          schema_version: 2,
          crs: "EPSG:4326",
          bounds: [32.45, 39.55, 33.25, 40.25],
          generated_at: "2026-07-17",
          sources: ["OpenStreetMap", "OpenCellID-derived planning records"],
          licenses: ["ODbL 1.0", "Review upstream OpenCellID terms before redistribution"],
          confidence: "Static planning dataset with synthetic demand enrichment; not an operator inventory.",
          layers: {
            towers: { kind: "cell_inventory", optional: false, confidence: "Planning inventory; not operator-verified." },
            buildings: { kind: "building_footprints", optional: false, confidence: "Static footprints with heuristic demand enrichment." },
          },
          quality: {
            summary: "Geometry and hashes validated; RF inventory and demand attributes remain planning-grade.",
            feature_counts: { towers: 3, buildings: 12 },
            geometry: {
              towers: { invalid_input: 0, repaired: 0, dropped: 0, output: 3 },
              buildings: { invalid_input: 0, repaired: 0, dropped: 0, output: 12 },
            },
            coverage: { coverage_ratio: 1 },
          },
          sha256: { "ankara_5g_nodes.geojson": "e2e-fixture-hash" },
        },
      },
      "/api/datasets": {
        active_id: "ankara-default",
        datasets: [{ id: "ankara-default", name: "Ankara Open Planning Dataset", version: "2026.07", schema_version: 2, active: true }],
        warnings: [],
      },
      "/api/towers": towers,
      "/api/buildings/summary": { total_buildings: 12, demand_weighted_buildings: 8, residential_weighted_buildings: 4, confidence: "sample" },
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
      "/api/sub-thz-material-reference": {
        schema_version: 1,
        model_id: "p2040_material_slab_reference_v1",
        model_version: "v1",
        status: "applicable",
        readiness: "reference_only",
        promoted: false,
        reference: { revision: "ITU-R P.2040-4 (2025-09)" },
        material: {
          material_id: "glass_100_400",
          name: "Glass",
          source: "p2040_reference",
          classification: "reference_material",
          property_source: "p2040_reference",
          frequency_range_ghz: [100, 400],
          relative_permittivity: 6.5767,
          conductivity_s_per_m: 1.7113767,
          loss_tangent: 0.0334,
          complex_relative_permittivity: { real: 6.5767, imaginary: -0.2198 },
          thickness_m: 0.01,
          thickness_provenance: "user_declared",
        },
        geometry: { frequency_ghz: 140, incidence_angle_deg: 0, polarization: "TE" },
        media: { incident: { name: "air" }, exit: { name: "air" } },
        applicability: { status: "applicable" },
        ledger: {
          reflection_coefficient: { real: -0.411, imaginary: 0.0147 },
          transmission_coefficient: { real: 0.230, imaginary: 0.035 },
          reflected_power_fraction: 0.169165,
          transmitted_power_fraction: 0.054365,
          absorbed_power_fraction: 0.77647,
          interface_reflection_power_fraction: 0.19281,
          transmission_loss_db: 12.646834,
          multiple_internal_reflections_included: true,
        },
        comparison: { historical_research_heuristic_db: 80, slab_transmission_loss_db: 12.646834, combined: false },
        property_provenance: { material_properties: "p2040_reference" },
        fingerprint: "material-reference-e2e",
        assumptions: [],
        limitations: [],
      },
      "/api/sub-thz-reflection-reference": {
        schema_version: 1,
        model: "single_bounce_specular_reflection_reference_v1",
        model_id: "single_bounce_specular_reflection_reference_v1",
        model_version: "v1",
        readiness: "reference_only",
        canonical: false,
        network_coupled: false,
        multipath_combined: false,
        coherent_multipath_combined: false,
        status: "qualified_reference",
        applicability: {
          status: "qualified_reference",
          reasons: [],
          qualifications: ["roughness_unknown", "antenna_far_field_unknown"],
        },
        geometry: {
          reflection_point_enu: { x: 0, y: 0, z: 10 },
          d1_m: 70.710678,
          d2_m: 70.710678,
          total_reflected_path_length_m: 141.421356,
          incidence_angle_deg: 45,
          reflection_angle_deg: 45,
        },
        material: {
          reflection_coefficient: { real: -0.451416, imaginary: 0, power_fraction: 0.203777 },
        },
        spreading: { fspl_reflected_path_db: 118.380644, two_leg_fspl_composition: false },
        link_budget: { reflected_path_reference_power_dbm: -95.2891 },
        antennas: {
          tx: { departure_azimuth_deg: 315, departure_elevation_deg: 0 },
          rx: { arrival_look_azimuth_deg: 225, arrival_look_elevation_deg: 0 },
        },
        visibility: { leg1_visibility: { status: "visible" }, leg2_visibility: { status: "visible" } },
        diffuse_scattering_modelled: false,
        atmosphere_composition_supported: false,
        direct_path_calculated: false,
        exclusions: [],
        assumptions: ["One explicit finite facade"],
        limitations: [],
        fingerprint: "specular-reflection-reference-e2e",
      },
      "/api/optimize-network": networkOptimization,
    };
    if (url.pathname === "/api/explain-network-cell") {
      const requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...cellExplanation,
          solution_id: requestBody.solution_id,
          cell: {
            ...cellExplanation.cell,
            id: requestBody.cell_id,
            selected_azimuth_deg: requestBody.solution?.towers?.find((tower) => String(tower.id) === String(requestBody.cell_id))?.azimuth_deg ?? cellExplanation.cell.selected_azimuth_deg,
          },
        }),
      });
      return;
    }
    const body = payloads[url.pathname];
    if (!body) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not mocked" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
});

test("captures Concept 8H visual system evidence", async ({ page }, testInfo) => {
  const phase = env.ATOM_8H_CAPTURE;
  test.skip(!["before", "after"].includes(phase), "Set ATOM_8H_CAPTURE=before or after to refresh visual evidence");
  test.skip(testInfo.project.name !== "desktop-1440", "Capture the reference states once");
  test.setTimeout(120_000);
  const directory = resolve(cwd(), `../docs/assets/concept-8h/${phase}`);
  const tileDirectory = "/tmp/atom-basemap-tiles";
  await mkdir(directory, { recursive: true });
  await mkdir(tileDirectory, { recursive: true });
  const features = [
    point("tower-1", "cell-1", 32.850, 39.920),
    point("tower-2", "cell-2", 32.870, 39.920),
    point("tower-3", "cell-3", 32.890, 39.920),
    point("tower-4", "cell-4", 32.850, 39.940),
    point("tower-5", "cell-5", 32.870, 39.940),
    point("tower-6", "cell-6", 32.890, 39.940),
    ...Array.from({ length: 36 }, (_, index) => point(`dense-${index}`, `sogutozu-${index}`, 32.800 + (index % 6) * 0.0015, 39.911 + Math.floor(index / 6) * 0.0015)),
  ];
  await page.route("**/api/towers", (route) => route.fulfill({ json: { type: "FeatureCollection", features } }));
  // Cache successful provider tiles; RF fixtures remain local.
  await page.route(/https:\/\/(tile\.openstreetmap\.org|tiles\.stadiamaps\.com)\//, async (route) => {
    const file = resolve(tileDirectory, (new URL(route.request().url()).hostname + new URL(route.request().url()).pathname).replaceAll("/", "-"));
    try {
      let body;
      try { body = await readFile(file); } catch {
        const response = await route.fetch({ timeout: 15_000 });
        if (!response.ok()) throw new Error("Tile unavailable");
        body = await response.body();
        await writeFile(file, body);
      }
      await route.fulfill({ body, contentType: "image/png" });
    } catch { await route.abort(); }
  });
  const screenshots = [];
  const measurements = [];
  const capture = async (name) => {
    await waitForBasemap(page);
    await page.screenshot({ path: resolve(directory, `${name}.jpg`), type: "jpeg", quality: 70, animations: "disabled" });
    screenshots.push({ state: name, file: `docs/assets/concept-8h/${phase}/${name}.jpg` });
    measurements.push(await page.evaluate((state) => {
      const selectors = [".command-brand", ".workspace-lineage-context", ".rf-context-primary", ".run-state", ".command-run-button", ".rail-label", ".stage-tool-choice-name", ".stage-tool-choice-reason", ".tool-drawer-header h2", ".tool-drawer-header p", ".field-group label", ".selection-note", ".number-wrap input", ".number-wrap select", ".segmented-control button", ".selection-summary-row", ".result-view-tabs", ".analysis-empty-state", ".focused-map-toolbar button", ".focused-map-legend", ".contextual-inspector-header"];
      const primitives = selectors.flatMap((selector) => {
        const element = document.querySelector(selector);
        if (!element || !element.getClientRects().length) return [];
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return [{ selector, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, borderColor: style.borderColor, background: style.backgroundColor, height: rect.height, radius: style.borderRadius, padding: style.padding, gap: style.gap, iconSize: element.querySelector("svg")?.getAttribute("width") ?? null, x: rect.x, y: rect.y, width: rect.width }];
      });
      return { state, viewport: { width: innerWidth, height: innerHeight }, overflowX: document.documentElement.scrollWidth - innerWidth, primitives, tileCount: document.querySelectorAll(".leaflet-tile-loaded").length, mapTransform: document.querySelector(".leaflet-map-pane")?.style.transform, selectedMarkers: document.querySelectorAll(".tower-order-badge").length };
    }, name));
  };
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0 || document.querySelector(".map-basemap-status"));
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("default-map");
  await page.getByRole("button", { name: "Plan workspace" }).click();
  await capture("plan-menu");
  await selectWorkspaceTool(page, "Setup");
  await capture("setup");
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await capture("simulate-menu");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await capture("analyze-menu");
  await page.keyboard.press("Escape");
  await selectWorkspaceTool(page, "Results");
  await capture("review-empty-single");
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapInteraction(page, "Select cells");
  for (const feature of features.slice(1, 6)) await clickMapPoint(page, ...feature.geometry.coordinates);
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
  await capture("selected-network");
  await selectMapInteraction(page, "Inspect");
  await selectMapFocus(page, "cell-6");
  await inspectMapFocus(page);
  if (await page.getByRole("button", { name: "Map view options" }).getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: "Map view options" }).click();
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toBeVisible();
  await capture("active-selected-cell");
  await page.getByRole("button", { name: "Close inspector" }).click();
  const map = page.locator(".leaflet-container");
  await map.focus();
  for (let index = 0; index < 2; index++) {
    await map.press("ArrowLeft");
    await page.waitForFunction(() => !document.querySelector(".leaflet-pan-anim"));
  }
  for (let index = 0; index < 2; index++) {
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForFunction(() => !document.querySelector(".leaflet-zoom-anim"));
  }
  await capture("dense-sogutozu");
  for (let index = 0; index < 2; index++) {
    await page.locator(".leaflet-control-zoom-out").click();
    await page.waitForFunction(() => !document.querySelector(".leaflet-zoom-anim"));
  }
  for (let index = 0; index < 2; index++) {
    await map.press("ArrowRight");
    await page.waitForFunction(() => !document.querySelector(".leaflet-pan-anim"));
  }
  await selectMapInteraction(page, "Select cells");
  await page.getByRole("button", { name: "Draw selection area" }).click();
  const mapBox = await map.boundingBox();
  for (const [x, y] of [[0.35, 0.3], [0.6, 0.3], [0.5, 0.65]]) await map.click({ position: { x: mapBox.width * x, y: mapBox.height * y } });
  await capture("selection-polygon");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await selectWorkspaceTool(page, "Inventory");
  await capture("inventory");
  await selectWorkspaceTool(page, "Propagation");
  await capture("propagation");
  await selectWorkspaceTool(page, "RF Diagnostics");
  await capture("rf-diagnostics");
  await selectWorkspaceTool(page, "Setup");
  await capture("setup-network");
  await selectWorkspaceTool(page, "Results");
  await capture("review-empty-network");
  for (const [width, height] of [[1366, 768], [1512, 982], [1728, 1117], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await capture(`review-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Single sector mode" }).click();
  await page.locator(".command-primary-action").getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await selectWorkspaceTool(page, "Results");
  await capture("review-current");
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await selectWorkspaceTool(page, "Results");
  await capture("review-stale");
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "4G LTE, 2.6 GHz" }).click();
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await capture("analyze-disabled");
  await writeFile(resolve(directory, "evidence.json"), `${JSON.stringify({ concept: "8H", phase, screenshots, measurements }, null, 2)}\n`);
});

test("captures Concept 8B.1 workspace chrome evidence", async ({ page }, testInfo) => {
  const phase = env.ATOM_8B1_CAPTURE;
  test.skip(!["before", "after"].includes(phase), "Set ATOM_8B1_CAPTURE=before or after to refresh visual evidence");
  test.skip(testInfo.project.name !== "desktop-1440", "Capture all target viewport sizes from one deterministic browser context");

  const assetDirectory = resolve(cwd(), "../docs/assets/concept-8b1", phase);
  await mkdir(assetDirectory, { recursive: true });
  const screenshots = [];
  const measurements = [];
  const capture = async (name, label = name) => {
    const path = resolve(assetDirectory, `${name}.jpg`);
    await page.screenshot({ path, type: "jpeg", quality: 82, animations: "disabled" });
    screenshots.push({ label, file: `docs/assets/concept-8b1/${phase}/${name}.jpg` });
    measurements.push(await page.evaluate((measurementLabel) => {
      const box = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Math.round(rect[key] * 10) / 10]));
      };
      const intersects = (first, second) => Boolean(first && second
        && first.x < second.x + second.width && first.x + first.width > second.x
        && first.y < second.y + second.height && first.y + first.height > second.y);
      const chooser = document.querySelector(".stage-tool-chooser-flyout")
        ?? document.querySelector('.tool-drawer[data-stage-chooser="true"]');
      const chooserBox = box(chooser);
      const names = [...document.querySelectorAll("[data-stage-chooser] .stage-tool-choice-name")];
      const drawer = document.querySelector(".tool-drawer");
      const commandBar = document.querySelector(".command-bar");
      const commandGroups = [...document.querySelectorAll(".command-bar .command-group")];
      const controls = [
        ["Leaflet zoom", document.querySelector(".leaflet-control-zoom")],
        ["Map selection toolbar", document.querySelector(".focused-map-toolbar")],
        ["Layer control", document.querySelector(".layers-trigger")],
      ];
      const controlGeometry = Object.fromEntries(controls.map(([name, element]) => [name, box(element)]));
      return {
        label: measurementLabel,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        commandBar: box(commandBar),
        commandGroups: commandGroups.map((group) => ({ label: group.getAttribute("aria-label"), ...box(group) })),
        rfContextLayout: {
          group: box(document.querySelector(".command-rf-context")),
          primary: box(document.querySelector(".rf-context-primary")),
          disclosure: box(document.querySelector(".rf-context-details > summary")),
          overlap: intersects(
            box(document.querySelector(".rf-context-primary")),
            box(document.querySelector(".rf-context-details > summary")),
          ),
        },
        borderedCommandControls: [...(commandBar?.querySelectorAll("button, summary") ?? [])].filter((control) => {
          const style = getComputedStyle(control);
          return parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
        }).length,
        rail: box(document.querySelector(".workflow-rail")),
        drawer: box(drawer),
        drawerHeader: box(drawer?.querySelector(".tool-drawer-header")),
        phoneSheetContentStart: window.innerWidth <= 640 && drawer
          ? Math.round((drawer.querySelector(".tool-drawer-body")?.getBoundingClientRect().top - drawer.getBoundingClientRect().top) * 10) / 10
          : null,
        chooser: chooserBox ? {
          ...chooserBox,
          clientHeight: chooser.clientHeight,
          scrollHeight: chooser.scrollHeight,
          hasVerticalScroll: chooser.scrollHeight > chooser.clientHeight + 1,
          attachedToRail: Math.abs(chooserBox.x - (document.querySelector(".workflow-rail")?.getBoundingClientRect().right ?? 0)) <= 1,
          controlOverlaps: Object.fromEntries(controls.map(([name, element]) => [name, intersects(chooserBox, box(element))])),
        } : null,
        controlGeometry,
        toolChoiceCount: document.querySelectorAll("[data-stage-chooser] .stage-tool-choice").length,
        toolRows: [...document.querySelectorAll("[data-stage-chooser] .stage-tool-choice")].map((row) => ({
          name: row.querySelector(".stage-tool-choice-name")?.textContent.trim() ?? "",
          height: Math.round(row.getBoundingClientRect().height * 10) / 10,
          width: Math.round(row.getBoundingClientRect().width * 10) / 10,
          layout: getComputedStyle(row).display,
          icon: box(row.querySelector(".stage-tool-choice-icon")),
          label: box(row.querySelector(".stage-tool-choice-name")),
        })),
        truncatedToolNames: names.filter((name) => name.scrollWidth > name.clientWidth + 1).map((name) => name.textContent.trim()),
        persistentToolNavigationCount: document.querySelectorAll(".tool-subnav, .tool-tabs, [data-persistent-tool-nav]").length,
      };
    }, label));
    const measurement = measurements.at(-1);
    if (phase === "after") {
      expect(measurement.documentOverflowX).toBe(0);
      if (measurement.viewport.width > 640) expect(measurement.rfContextLayout.overlap).toBe(false);
      if (measurement.chooser && measurement.viewport.width > 640) {
        expect(measurement.chooser.hasVerticalScroll).toBe(false);
        expect(measurement.truncatedToolNames).toEqual([]);
        expect(measurement.toolRows.every((row) => row.layout === "grid" && row.width >= 200 && row.label.width >= 80)).toBe(true);
        expect(measurement.toolRows.every((row) => row.icon && row.label && row.label.x > row.icon.x)).toBe(true);
        expect(Object.values(measurement.chooser.controlOverlaps).every((overlap) => !overlap)).toBe(true);
      }
      if (measurement.viewport.width <= 640 && measurement.chooser) {
        expect(measurement.toolRows.every((row) => row.height >= 58)).toBe(true);
      }
    }
  };

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await capture("1440-setup", "1440 Setup");
  await page.locator(".rf-context-details > summary").click();
  await capture("1440-rf-details", "1440 RF details");
  await page.locator(".rf-context-details > summary").click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("1440-setup-closed", "1440 Setup drawer closed");

  for (const [stageID, stageLabel] of [["plan", "Plan"], ["simulate", "Simulate"], ["analyze", "Analyze"], ["review", "Review"]]) {
    await page.getByRole("button", { name: `${stageLabel} workspace` }).click();
    await expect(page.getByRole("dialog", { name: `${stageLabel} tools` })).toBeVisible();
    await capture(`1440-chooser-${stageID}`, `1440 ${stageLabel} chooser`);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Review tools" })).toHaveCount(0);

  await selectWorkspaceTool(page, "Propagation");
  await expect(page.getByRole("heading", { name: "Propagation" })).toBeVisible();
  await capture("1440-propagation", "1440 Propagation drawer");
  await selectWorkspaceTool(page, "RF Diagnostics");
  await expect(page.getByRole("heading", { name: "RF Diagnostics" })).toBeVisible();
  await capture("1440-rf-diagnostics", "1440 RF Diagnostics");
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  await page.locator(".rf-diagnostics-research").getByRole("button", { name: "Validation" }).click();
  await expect(page.getByRole("region", { name: "RF diagnostics and measurement validation" })).toBeVisible();
  await capture("1440-rf-diagnostics-validation", "1440 RF Diagnostics Validation");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".command-status .run-state")).toHaveText("Ready");
  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await capture("1440-results-current", "1440 current results");

  await page.setViewportSize({ width: 390, height: 844 });
  await capture("390-results-current", "390 current results");

  await page.setViewportSize({ width: 1440, height: 900 });
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeToolDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeToolDrawer.isVisible()) await closeToolDrawer.click();
  await selectMapInteraction(page, "Select cells");
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await map.click({ position: {
    x: mapBox.width / 2 + target.x - center.x,
    y: mapBox.height / 2 + target.y - center.y,
  } });
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.locator(".command-status .run-state")).toHaveText("Ready");
  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("tab", { name: "Optimization" })).toBeVisible();
  await page.getByRole("tab", { name: "Optimization" }).click();
  await capture("1440-results-optimization", "1440 Results optimization");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await selectWorkspaceTool(page, "Results");
  await expect(page.locator(".command-status .run-state")).toHaveText("Result out of date");
  await capture("1440-results-stale", "1440 stale results");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("390-results-stale", "390 stale results");
  await page.getByRole("button", { name: "Review workspace" }).click();
  await expect(page.locator('.tool-drawer[data-stage-chooser="true"]')).toBeVisible();
  await capture("390-chooser-review", "390 Review chooser");

  for (const [width, height] of [[1280, 900], [1024, 768], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await selectWorkspaceTool(page, "Setup");
    await capture(`${width}-setup`, `${width} Setup`);
    await page.getByRole("button", { name: "Plan workspace" }).click();
    await expect(page.getByRole("dialog", { name: "Plan tools" })).toBeVisible();
    await capture(`${width}-chooser-plan`, `${width} Plan chooser`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Close tool drawer" }).click();
  }

  const evidence = {
    concept: "8B.1",
    phase: phase === "before" ? "pre-change baseline" : "post-change comparison",
    capturedDate: new Date().toISOString().slice(0, 10),
    viewportSet: [1440, 1280, 1024, 768, 390],
    screenshots,
    measurements,
  };
  const evidencePath = resolve(cwd(), `../docs/concept-8b1-${phase === "before" ? "pre-change-baseline" : "post-change-comparison"}.json`);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
});

test("runs a sector and preserves a named scenario", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("dialog", { name: "Results" })).toContainText("-72.0 dBm");

  const projectMenuBox = await page.getByRole("button", { name: "Open project menu" }).boundingBox();
  const lineageBox = await page.locator(".workspace-lineage-context > summary").boundingBox();
  expect(projectMenuBox && lineageBox).toBeTruthy();
  expect(projectMenuBox.x + projectMenuBox.width).toBeLessThanOrEqual(lineageBox.x + 1);

  await page.getByRole("button", { name: "Open project menu" }).click();
  await page.getByRole("button", { name: "Save current" }).click();
  await expect(page.getByRole("dialog", { name: "Project and scenarios" })).toContainText("Sector plan 1");
  await expect(page.getByRole("dialog", { name: "Project and scenarios" }).getByRole("status")).toHaveText("Version saved");

  await page.reload();
  await page.getByRole("button", { name: "Open project menu" }).click();
  await expect(page.getByRole("dialog", { name: "Project and scenarios" })).toContainText("Sector plan 1");
});

test("inspects cells and opens Inventory without changing the plan", async ({ page }) => {
  const computeRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|simulate|optimize-network|interference)/.test(request.url())) computeRequests.push(request.url());
  });

  await page.goto("/");
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  const runState = page.locator(".command-status .run-state");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  const initialRunState = await runState.innerText();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await map.click({ position: {
    x: mapBox.width / 2 + target.x - center.x,
    y: mapBox.height / 2 + target.y - center.y,
  } });

  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Cell cell-2" })).not.toBeFocused();
  await expect(inspector).toContainText("Active transmitter");
  await expect(inspector).toContainText("No");
  await expect(inspector.locator(".contextual-inspector-summary")).toContainText("28.0 GHz");
  await expect(inspector.locator(".contextual-inspector-summary")).toContainText("TX power");
  await expect(inspector.locator(".contextual-inspector-summary")).toContainText("Beam width");
  await expect(inspector.locator(".contextual-inspector-summary")).toContainText("Selected cluster");
  await expect(inspector.locator(".contextual-inspector-summary")).toContainText("Map Focus");
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell cell-1");
  await expect(runState).toHaveText(initialRunState);
  expect(computeRequests).toHaveLength(0);

  await inspector.getByRole("button", { name: "Focus" }).click();
  await openMapView(page);
  await expect(page.getByRole("combobox", { name: "Map focus cell" })).toHaveValue("cell-2");
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell cell-1");
  await expect(runState).toHaveText(initialRunState);

  await inspector.getByRole("button", { name: "Edit in Inventory" }).click();
  await expect(page.getByRole("dialog", { name: "Inventory" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Edit Cell cell-2" })).toBeVisible();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell cell-1");
  expect(computeRequests).toHaveLength(0);
});

test("Inventory browsing opens a separate editor without changing RF or Map Focus", async ({ page }) => {
  const computeRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|evaluate-network|simulate|optimize-network|interference)/.test(request.url())) computeRequests.push(request.url());
  });
  await page.goto("/");
  const closeDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeDrawer.isVisible()) await closeDrawer.click();
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  await page.getByRole("complementary", { name: "Cell inspector" }).getByRole("button", { name: "Edit in Inventory" }).click();
  await expect(page.getByRole("region", { name: "Edit Cell cell-2" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Inventory" }).click();
  await page.getByRole("textbox", { name: "Search by Cell ID or record ID" }).fill("cell-3");
  await page.getByRole("button", { name: "Edit Cell cell-3" }).click();
  await expect(page.getByRole("region", { name: "Edit Cell cell-3" })).toBeVisible();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell cell-1");
  await openMapView(page);
  await expect(page.getByRole("combobox", { name: "Map focus cell" })).toHaveValue("cell-2");
  expect(computeRequests).toHaveLength(0);
});

test("Inventory Search, Map area, and empty Network remain bounded working sets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "The map-area workflow is exercised once at desktop size");
  const computeRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|evaluate-network|simulate|optimize-network|interference)/.test(request.url())) computeRequests.push(request.url());
  });
  await page.goto("/");
  await selectWorkspaceTool(page, "Inventory");
  await expect(page.getByRole("heading", { name: "Search the inventory" })).toBeVisible();
  await expect(page.locator(".inventory-list")).toHaveCount(0);

  const search = page.getByRole("textbox", { name: "Search by Cell ID or record ID" });
  await search.fill("cell-");
  await expect(page.locator(".inventory-results-count")).toContainText("3 matches");
  await expect(page.locator(".inventory-list > li")).toHaveCount(3);

  await page.getByRole("button", { name: /Map area/ }).click();
  await page.getByRole("button", { name: "Refresh area" }).waitFor({ state: "visible" });
  await expect(page.locator(".inventory-area-status")).toContainText("Cells in the captured map area");
  await expect(page.locator(".inventory-list > li")).toHaveCount(3);
  await page.locator(".leaflet-control-zoom-in").click();
  await expect(page.locator(".inventory-area-status")).toContainText("Map moved");
  await expect(page.locator(".inventory-list > li")).toHaveCount(3);
  await page.getByRole("button", { name: "Refresh area" }).click();
  await expect(page.locator(".inventory-area-status")).not.toContainText("Map moved");

  await page.locator(".inventory-scope-switch").getByRole("button", { name: /^Network/ }).click();
  await expect(page.getByRole("heading", { name: "No Cells in the current Network." })).toBeVisible();
  await page.getByRole("button", { name: "Select cells on map" }).click();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 0 cells");
  expect(computeRequests).toHaveLength(0);
});

test("Inventory multi-edit previews and applies only an enabled safe field", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "The batch edit workflow is exercised once at desktop size");
  const computeRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|evaluate-network|simulate|optimize-network|interference)/.test(request.url())) computeRequests.push(request.url());
  });

  await page.goto("/");
  await selectWorkspaceTool(page, "Inventory");
  const search = page.getByRole("textbox", { name: "Search by Cell ID or record ID" });
  await search.fill("cell-2");
  await page.getByRole("button", { name: "Edit Cell cell-2" }).click();
  await page.getByRole("spinbutton", { name: "Conducted TX power" }).fill("32");
  await page.getByRole("button", { name: "Back to Inventory" }).click();
  await search.fill("cell-");
  await page.getByRole("button", { name: "Edit multiple" }).click();
  await page.getByRole("checkbox", { name: "Select Cell cell-1 for editing" }).check();
  await page.getByRole("checkbox", { name: "Select Cell cell-2 for editing" }).check();
  await page.getByRole("button", { name: "Edit 2 Cells" }).click();

  await expect(page.getByRole("heading", { name: "Edit 2 Cells" })).toBeVisible();
  await expect(page.getByText("Only enabled fields will change.")).toBeVisible();
  await expect(page.getByText("Mixed across selected Cells")).toBeVisible();
  await expect(page.getByLabel("Conducted TX power batch value")).toBeDisabled();
  await expect(page.getByLabel("Conducted TX power batch value")).toHaveValue("");
  await page.getByRole("checkbox", { name: "Conducted TX power" }).check();
  await page.getByLabel("Conducted TX power batch value").fill("35");
  await page.getByRole("button", { name: "Review changes" }).click();
  await expect(page.getByRole("heading", { name: "Apply to 2 Cells" })).toBeVisible();
  await expect(page.getByText("→ 35 dBm")).toBeVisible();
  await page.getByRole("button", { name: "Apply changes" }).click();

  await expect(page.locator(".inventory-message")).toContainText("2 Cells updated");
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell cell-1");
  expect(computeRequests).toHaveLength(0);
});

test("Inventory editor returns keyboard focus to the exact browse row", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "The Inventory keyboard handoff is exercised once at desktop size");
  await page.goto("/");
  await selectWorkspaceTool(page, "Inventory");
  await page.getByRole("textbox", { name: "Search by Cell ID or record ID" }).fill("cell-2");
  const row = page.getByRole("button", { name: "Edit Cell cell-2" });
  await row.focus();
  await page.keyboard.press("Enter");

  const editor = page.getByRole("region", { name: "Edit Cell cell-2" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("heading", { name: "Cell cell-2" })).toBeFocused();
  await page.getByRole("button", { name: "Back to Inventory" }).click();
  await expect(row).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Search by Cell ID or record ID" })).toHaveValue("cell-2");
});

test("captures Concept 8G Inventory responsive and state evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Capture the Inventory viewport set from one deterministic browser context");
  test.setTimeout(120_000);
  const assetDirectory = resolve(cwd(), "../docs/assets/concept-8g/after");
  await mkdir(assetDirectory, { recursive: true });
  const screenshots = [];
  const measurements = [];
  const capture = async (name, label) => {
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(assetDirectory, file), type: "png", animations: "disabled" });
    screenshots.push({ label, file: `docs/assets/concept-8g/after/${file}` });
    const measurement = await page.evaluate((measurementLabel) => {
      const drawer = document.querySelector(".tool-drawer-body");
      const panel = document.querySelector(".inventory-panel");
      const list = document.querySelector(".inventory-list");
      return {
        label: measurementLabel,
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        drawer: drawer ? { clientWidth: drawer.clientWidth, scrollWidth: drawer.scrollWidth, clientHeight: drawer.clientHeight, scrollHeight: drawer.scrollHeight } : null,
        panel: panel ? { clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth, height: panel.clientHeight } : null,
        renderedRows: list?.querySelectorAll(":scope > li").length ?? 0,
        resultCount: panel?.querySelector(".inventory-results-count")?.textContent.trim() ?? null,
        list: list ? { clientHeight: list.clientHeight, scrollHeight: list.scrollHeight } : null,
        visiblePrimaryInventoryActions: panel ? [...panel.querySelectorAll(".inventory-actions button")].filter((button) => button.getClientRects().length).length : 0,
      };
    }, label);
    measurements.push(measurement);
    expect(measurement.documentOverflowX).toBeLessThanOrEqual(1);
    expect(measurement.drawer?.scrollWidth ?? 0).toBeLessThanOrEqual((measurement.drawer?.clientWidth ?? 0) + 1);
    expect(measurement.panel?.scrollWidth ?? 0).toBeLessThanOrEqual((measurement.panel?.clientWidth ?? 0) + 1);
    if (measurement.renderedRows) expect(measurement.renderedRows).toBeLessThanOrEqual(50);
  };

  const ankaraInventory = JSON.parse(await readFile(resolve(cwd(), "../data-pipeline/ankara_5g_nodes.geojson"), "utf8"));
  await page.route("**/api/towers", (route) => route.fulfill({ json: ankaraInventory }));
  await page.goto("/");
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await selectWorkspaceTool(page, "Inventory");
    const scopeSwitch = page.locator(".inventory-scope-switch");
    await scopeSwitch.getByRole("button", { name: /^Search/ }).click();
    await page.getByRole("textbox", { name: "Search by Cell ID or record ID" }).fill("");
    await page.getByRole("combobox", { name: "Filter by technology" }).selectOption("");
    await expect(page.getByRole("heading", { name: "Search the inventory" })).toBeVisible();
    await capture(`${width}-inventory-search-empty`, `${width}px empty Search / Filter state`);

    await page.getByRole("combobox", { name: "Filter by technology" }).selectOption("5g");
    await expect(page.locator(".inventory-results-count")).toContainText("451 matches");
    await expect(page.locator(".inventory-list > li")).toHaveCount(50);
    await capture(`${width}-inventory-search`, `${width}px Search / Filter (451 loaded Cells; 50 rendered)`);

    await scopeSwitch.getByRole("button", { name: /^Network/ }).click();
    await expect(page.getByRole("heading", { name: "No Cells in the current Network." })).toBeVisible();
    await capture(`${width}-inventory-network`, `${width}px Network working set empty state`);

    await scopeSwitch.getByRole("button", { name: /^Map area/ }).click();
    await page.getByRole("button", { name: "Refresh area" }).click();
    await expect(page.locator(".inventory-area-status")).toContainText("Cells");
    expect(await page.locator(".inventory-list > li").count()).toBeLessThanOrEqual(50);
    await capture(`${width}-inventory-map-area`, `${width}px captured Map area working set`);

    await scopeSwitch.getByRole("button", { name: /^Search/ }).click();
    await page.locator(".inventory-list .inventory-cell-open").first().click();
    await capture(`${width}-inventory-cell-detail`, `${width}px separate Cell detail editor`);
    await page.getByRole("button", { name: "Back to Inventory" }).click();

    await page.getByRole("button", { name: "Edit multiple" }).click();
    const batchSelection = page.locator(".inventory-bulk-checkbox input");
    await batchSelection.nth(0).check();
    await batchSelection.nth(1).check();
    await page.getByRole("button", { name: "Edit 2 Cells" }).click();
    await capture(`${width}-inventory-batch`, `${width}px reviewed multi-edit form`);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await selectMapFocus(page, "26380");
  await inspectMapFocus(page);
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Edit in Inventory" }).click();
  await expect(page.locator(".inventory-editor")).toBeVisible();
  await capture("1440-inventory-inspector-handoff", "1440px Inspector → exact Cell editor handoff");

  const evidence = {
    concept: "8G",
    capturedDate: new Date().toISOString().slice(0, 10),
    viewportSet: [1440, 1024, 768, 390],
    normalFixtureCells: 451,
    initialRowsPerSearchResult: 50,
    screenshots,
    measurements,
    keyboardEvidence: {
      coveredInSeparateE2E: "Inventory editor returns keyboard focus to the exact browse row",
      behavior: "Enter opens the focused exact Cell result; the editor heading receives focus; Back to Inventory restores focus to that Cell's result button and preserves the query.",
    },
  };
  await writeFile(resolve(cwd(), "../docs/concept-8g-responsive-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(resolve(cwd(), "../docs/concept-8g-accessibility-evidence.json"), `${JSON.stringify({
    concept: "8G",
    checks: [
      { check: "Named Inventory scope switch", evidence: "Role=group, aria-label=Inventory scope; scope buttons expose aria-pressed and counts." },
      { check: "Keyboard-only row open and return", result: "passed", test: "Inventory editor returns keyboard focus to the exact browse row" },
      { check: "Detail heading focus", result: "passed", behavior: "Cell editor heading receives programmatic focus when opened." },
      { check: "Stable map snapshot announcement", evidence: "Map area state uses role=status and refresh is a labelled button." },
      { check: "Batch selection labels", evidence: "Each Cell checkbox has a Cell-specific accessible name; inputs retain explicit field labels." },
      { check: "Responsive horizontal overflow", result: measurements.every((item) => item.documentOverflowX <= 1 && (item.drawer?.scrollWidth ?? 0) <= (item.drawer?.clientWidth ?? 0) + 1 && (item.panel?.scrollWidth ?? 0) <= (item.panel?.clientWidth ?? 0) + 1) ? "passed" : "failed", viewports: measurements.map(({ label, documentOverflowX, drawer, panel }) => ({ label, documentOverflowX, drawerOverflowX: drawer ? drawer.scrollWidth - drawer.clientWidth : null, panelOverflowX: panel ? panel.scrollWidth - panel.clientWidth : null })) },
    ],
  }, null, 2)}\n`);
});

test("map clicks change the plan only after Select cells is armed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  const cellTwoClick = {
    x: mapBox.width / 2 + target.x - center.x,
    y: mapBox.height / 2 + target.y - center.y,
  };
  await map.click({ position: cellTwoClick });
  await expect(inspector).toBeVisible();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell cell-1");
  await inspector.getByRole("button", { name: "Close inspector" }).click();

  await selectMapInteraction(page, "Select cells");
  await map.click({ position: cellTwoClick });
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell cell-2");
  await expect(inspector).toHaveCount(0);
});

test("Select cells changes cluster membership and Clear selected cluster reverses it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "The Network cluster interaction contract is exercised once at desktop size");
  const computeRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|evaluate-network|simulate|optimize-network|interference)/.test(request.url())) computeRequests.push(request.url());
  });

  await page.goto("/");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeDrawer.isVisible()) await closeDrawer.click();
  await selectMapInteraction(page, "Select cells");
  await clickMapPoint(page, 32.854, 39.922);

  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 2 cells");
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toHaveCount(0);
  expect(computeRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Clear selected cluster" }).click();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 0 cells");
  await selectWorkspaceTool(page, "Setup");
  await expect(page.locator(".selection-summary-row strong")).toHaveText("0 of 6 cells selected");
  expect(computeRequests).toHaveLength(0);
});

test("Setup selection entry frees the phone map and keeps its active state", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Mobile Setup sheet handoff is covered at the phone layout");
  await page.goto("/");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Select cells on map" }).click();

  await expect(page.getByRole("button", { name: "Map interaction: Select cells" })).toBeVisible();
  await expect(page.locator(".tool-drawer")).toBeHidden();
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  expect(mapBox).not.toBeNull();
  expect(mapBox.height).toBeGreaterThan(500);

  await selectWorkspaceTool(page, "Setup");
  await expect(page.getByText("Selecting cells on map…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Select cells on map" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close tool drawer" }).click();
});

test("opens the exact Cell path profile and gives endpoint picking priority over inspection", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1440", "Path profile context is covered at the desktop inspector layout");
  const pathRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/path-profile")) pathRequests.push(request.url());
  });

  await page.goto("/");
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  await page.getByRole("complementary", { name: "Cell inspector" }).getByRole("button", { name: "Open Path profile" }).click();

  const pathProfile = page.getByRole("region", { name: "Vertical path profile" });
  await expect(pathProfile).toBeVisible();
  await expect(pathProfile).toContainText("Transmitter cell: cell-2");
  await expect(pathProfile.getByRole("button", { name: "Analyze selected path" })).toBeDisabled();
  await expect(pathProfile.getByRole("button", { name: "Pick receiver on map" })).toBeEnabled();
  expect(pathRequests).toHaveLength(0);

  await page.getByRole("complementary", { name: "Cell inspector" }).getByRole("button", { name: "Close inspector" }).click();
  await pathProfile.getByRole("button", { name: "Pick receiver on map" }).click();
  await expect(pathProfile.getByRole("button", { name: "Cancel map pick" })).toBeVisible();
  await clickMapPoint(page, 32.854, 39.922);
  await expect(pathProfile.getByRole("button", { name: "Analyze selected path" })).toBeEnabled();
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toHaveCount(0);
  expect(pathRequests).toHaveLength(0);
});

test("area drawing consumes map clicks before entity inspection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Area draw priority is covered at the desktop map layout");
  await page.goto("/");
  const closeDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeDrawer.isVisible()) await closeDrawer.click();

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await selectMapInteraction(page, "Select cells");
  await page.getByRole("button", { name: "Draw selection area" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeDisabled();
  await clickMapPoint(page, 32.854, 39.922);
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toHaveCount(0);
  await clickMapPoint(page, 32.856, 39.920);
  await clickMapPoint(page, 32.857, 39.921);
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("cell placement consumes a tower click before entity inspection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Cell placement priority is covered at the desktop map layout");
  await page.goto("/");
  await selectWorkspaceTool(page, "Inventory");
  await page.getByRole("button", { name: "Place new Cell" }).click();
  await expect(page.locator(".inventory-placement")).toHaveText("Click the map to place the new Cell.");
  await clickMapPoint(page, 32.854, 39.922);

  await expect(page.getByRole("region", { name: "Edit Cell manual-4" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Single · Cell manual-4");
});

test("inspects viewport Buildings, ignores an older detail response, and reports unavailable evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Building evidence lifecycle is covered at the desktop map layout");
  const polygon = (id, longitude, latitude, height) => ({
    type: "Feature",
    id,
    properties: { building_id: id, height_m: height, height_source: "e2e-planning-record" },
    geometry: { type: "Polygon", coordinates: [[
      [longitude - 0.001, latitude - 0.0008],
      [longitude + 0.001, latitude - 0.0008],
      [longitude + 0.001, latitude + 0.0008],
      [longitude - 0.001, latitude + 0.0008],
      [longitude - 0.001, latitude - 0.0008],
    ]] },
  });
  await page.route("**/api/collections/buildings/items*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      type: "FeatureCollection",
      features: [
        polygon("building-a", 32.840, 39.918, 18),
        polygon("building-b", 32.860, 39.918, 22),
        polygon("building-c", 32.880, 39.918, 26),
      ],
    }),
  }));
  await page.route("**/api/spatial-evidence/buildings/**", async (route) => {
    const buildingID = new URL(route.request().url()).pathname.split("/").at(-1);
    if (buildingID === "building-a") await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    if (buildingID === "building-c") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "evidence source unavailable" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dataset_version: "e2e-dataset",
        height_ledger: {
          selected_height_agl_m: buildingID === "building-b" ? 22 : 18,
          selected_confidence: "surveyed",
          selected_provenance: { source: `evidence-${buildingID}`, source_version: "e2e-v1" },
          selected_roof_elevation: { roof_elevation_amsl_m: 122, compatibility: "compatible" },
          base_elevation: { ground_elevation_m: 100, ground_spread_m: 0.5 },
          conflict: { status: "none" },
        },
        terrain: { kind: "surveyed terrain", compatibility: "compatible" },
      }),
    }).catch(() => undefined);
  });

  await page.goto("/");
  const closeDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeDrawer.isVisible()) await closeDrawer.click();
  const collectionLoaded = page.waitForResponse((response) => response.url().includes("/api/collections/buildings/items"));
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("checkbox", { name: "Viewport buildings" }).check();
  expect((await collectionLoaded).status()).toBe(200);

  const firstDetailRequested = page.waitForRequest((request) => request.url().includes("/api/spatial-evidence/buildings/building-a"));
  await clickMapPoint(page, 32.840, 39.918);
  await firstDetailRequested;
  const inspector = page.getByRole("complementary", { name: "Building inspector" });
  await expect(inspector.getByRole("heading", { name: "Building building-a" })).toBeVisible();
  await clickMapPoint(page, 32.860, 39.918);
  await expect(inspector.getByRole("heading", { name: "Building building-b" })).toBeVisible();
  await expect(inspector).toContainText("evidence-building-b");
  await expect(inspector).toContainText("22.0 m");
  await page.waitForTimeout(350);
  await expect(inspector).toContainText("evidence-building-b");
  await expect(inspector).not.toContainText("evidence-building-a");

  await clickMapPoint(page, 32.880, 39.918);
  await expect(inspector.getByRole("heading", { name: "Building building-c" })).toBeVisible();
  await expect(inspector).toContainText("evidence source unavailable");
  await expect(inspector.getByRole("button", { name: "Open Building entry" })).toBeEnabled();
});

test("inspects an Interference sample from its exact retained analysis and marks it stale after editing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Interference sample lifecycle is covered at the desktop map layout");
  let interferenceRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/interference") interferenceRequests += 1;
  });
  await page.route("**/api/interference", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {
            sample_id: "interference-sample-7",
            serving_cell_id: "cell-2",
            channel_id: "channel-a",
            serving_received_carrier_power_dbm: -91.1,
            rsrp_dbm: -92.4,
            sinr_db: 2.1,
            rsrq_db: -11.5,
            strongest_interferer_id: "cell-1",
            strongest_interferer_dbm: -96.2,
            interferer_count: 1,
            wall_count: 0,
            quality_class: "serviceable",
            serviceability_status: "serviceable",
          },
          geometry: { type: "Point", coordinates: [32.846, 39.920] },
        }],
      },
      demand_geojson: { type: "FeatureCollection", features: [] },
      stats: { avg_sinr_db: 2.1, serviceable_pct: 88 },
      model: { measurement_family: "nr_ss", bandwidth_mhz: 100, load_factor: 0.5 },
    }),
  }));

  await page.goto("/");
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeDrawer.isVisible()) await closeDrawer.click();
  await selectMapInteraction(page, "Select cells");
  await clickMapPoint(page, 32.854, 39.922);
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();

  await selectWorkspaceTool(page, "Interference");
  await page.getByRole("button", { name: "Analyze Interference" }).click();
  await expect(page.locator(".command-status .run-state")).toHaveText("Ready");
  expect(interferenceRequests).toBe(1);
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Inspect", exact: true })).toHaveAttribute("aria-pressed", "true");
  const metric = page.getByRole("combobox", { name: "Radio-quality metric" });
  await expect(metric).toBeVisible();
  await metric.selectOption("rsrp");
  await expect(metric).toHaveValue("rsrp");
  expect(interferenceRequests).toBe(1);
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(page.getByRole("checkbox", { name: "Interference surface" })).toBeChecked();
  await page.getByRole("button", { name: "Map layers" }).click();
  await clickMapPoint(page, 32.846, 39.920);

  const inspector = page.getByRole("complementary", { name: "Interference sample inspector" });
  await expect(inspector.getByRole("heading", { name: "Interference sample interference-sample-7" })).toBeVisible();
  await expect(inspector.locator(".inspector-freshness")).toHaveText("CURRENT");
  await expect(inspector.locator(".inspector-source-label")).toContainText("Interference analysis interference-");
  await expect(inspector.locator(".inspector-source-label")).toContainText("no durable Run");
  await expect(inspector.getByRole("button", { name: /View Run/ })).toHaveCount(0);
  await expect(inspector.locator(".contextual-inspector-summary")).toContainText("cell-2");
  await expect(inspector.locator(".contextual-inspector-summary")).toContainText("-92.4 dBm");
  await inspector.locator(".contextual-inspector-provenance summary").click();
  await expect(inspector.locator(".mini-datum").filter({ hasText: "RSRQ" }).locator("strong")).toHaveText("-11.5 dB");
  await expect(inspector).toContainText("Modeled SS-RSRP / SS-RSRQ");
  await expect(inspector.locator(".mini-datum").filter({ hasText: "Thermal noise" }).locator("strong")).toHaveText("—");
  await expect(inspector.locator(".mini-datum").filter({ hasText: "RSSI" }).locator("strong")).toHaveText("—");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await expect(inspector.locator(".inspector-freshness")).toHaveText("STALE");
  await expect(inspector.locator(".inspector-source-label")).toContainText("no durable Run");
  expect(interferenceRequests).toBe(1);
});

test("keeps Propagation task state while inspecting a Cell and switching desktop tools", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Task continuity is covered at the supported desktop layout");
  await page.goto("/");
  await selectWorkspaceTool(page, "Propagation");
  const radius = page.getByRole("slider", { name: "Radius (m)" });
  const initialRadius = await radius.inputValue();
  await radius.focus();
  await radius.press("ArrowRight");
  const editedRadius = await radius.inputValue();
  expect(editedRadius).not.toBe(initialRadius);
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  await expect(inspector).toBeVisible();
  await selectWorkspaceTool(page, "Setup");
  await expect(inspector).toBeVisible();
  await selectWorkspaceTool(page, "Propagation");
  await expect(page.getByRole("slider", { name: "Radius (m)" })).toHaveValue(editedRadius);
  await expect(inspector).toBeVisible();
});

test("Back from the single-slot inspector restores the prior tool and draft", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Single-slot Back is covered from the desktop browser");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await selectWorkspaceTool(page, "Propagation");
  const radius = page.getByRole("slider", { name: "Radius (m)" });
  const initialRadius = await radius.inputValue();
  await radius.focus();
  await radius.press("ArrowRight");
  const editedRadius = await radius.inputValue();
  expect(editedRadius).not.toBe(initialRadius);
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Back to previous tool" }).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Propagation" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Radius (m)" })).toHaveValue(editedRadius);
});

test("supports keyboard map inspection and returns focus to the Map Focus control", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Keyboard inspection is covered at the desktop layout");
  await page.goto("/");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await openMapView(page);
  const focusCell = page.getByRole("combobox", { name: "Map focus cell" });
  await focusCell.selectOption("cell-2");
  const inspectFocusedCell = page.getByRole("button", { name: "Inspect focused cell" });
  await inspectFocusedCell.focus();
  await expect(inspectFocusedCell).toBeFocused();
  await page.keyboard.press("Enter");

  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Cell cell-2" })).toBeFocused();
  let focusEscapedInspector = false;
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    focusEscapedInspector = await page.evaluate(() => !document.activeElement?.closest(".contextual-inspector"));
    if (focusEscapedInspector) break;
  }
  expect(focusEscapedInspector).toBe(true);
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Map view options" })).toBeFocused();
});

test("retains the inspected Cell source Run and marks it stale after a plan edit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Stale-source editing is covered where the task drawer and inspector coexist");
  const followUpRequests = [];
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|simulate|optimize-network|interference)/.test(request.url())) followUpRequests.push(request.url());
  });
  await page.getByRole("button", { name: "Run Sector" }).click();
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  followUpRequests.length = 0;
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  await expect(inspector.locator(".inspector-freshness")).toHaveText("CURRENT");
  await expect(inspector.getByRole("button", { name: /View Run/ })).toBeVisible();
  const sourceRunLabel = await inspector.locator(".inspector-source-label").innerText();
  await expect(page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await expect(inspector.locator(".inspector-freshness")).toHaveText("STALE");
  await expect(inspector.locator(".inspector-source-label")).toHaveText(sourceRunLabel);
  expect(followUpRequests).toHaveLength(0);
});

test("keeps the inspector and map practical across the seven Concept 8E reference widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Run the complete width sweep once from the desktop project");
  await page.goto("/");
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);

  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  const drawer = page.locator(".tool-drawer");
  const widths = [1920, 1600, 1440, 1280, 1024, 768, 390];
  const evidence = [];
  const capture = env.ATOM_8E_CAPTURE === "after";
  const assetDirectory = resolve(cwd(), "../docs/assets/concept-8e");
  if (capture) await mkdir(assetDirectory, { recursive: true });

  for (const width of widths) {
    const height = width <= 390 ? 844 : width <= 768 ? 1024 : width <= 1024 ? 768 : 900;
    await page.setViewportSize({ width, height });
    await expect(inspector).toBeVisible();
    const inspectorBox = await inspector.boundingBox();
    const mapBox = await page.locator(".leaflet-container").boundingBox();
    await openMapView(page);
    const focusControlBox = await page.getByRole("combobox", { name: "Map focus cell" }).boundingBox();
    const viewControlBox = await page.getByRole("button", { name: "Map view options" }).boundingBox();
    const drawerVisible = await drawer.isVisible();
    expect(inspectorBox).not.toBeNull();
    expect(mapBox).not.toBeNull();
    expect(focusControlBox).not.toBeNull();
    expect(viewControlBox).not.toBeNull();
    await expect(page.getByRole("button", { name: "Inspect focused cell" })).toHaveCount(0);
    expect(focusControlBox.x).toBeGreaterThanOrEqual(0);
    expect(focusControlBox.x + focusControlBox.width).toBeLessThanOrEqual(width + 1);
    expect(viewControlBox.x).toBeGreaterThanOrEqual(0);
    expect(viewControlBox.x + viewControlBox.width).toBeLessThanOrEqual(width + 1);
    expect(mapBox.width).toBeGreaterThan(width <= 768 ? 250 : 600);
    expect(mapBox.height).toBeGreaterThan(240);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    expect(drawerVisible).toBe(width > 1360);
    if (width === 1440) {
      expect(focusControlBox.x + focusControlBox.width).toBeLessThanOrEqual(inspectorBox.x);
      expect(viewControlBox.x + viewControlBox.width).toBeLessThanOrEqual(inspectorBox.x);
    }
    if (width >= 1600) {
      const drawerBox = await drawer.boundingBox();
      expect(drawerBox).not.toBeNull();
      expect(drawerBox.x + drawerBox.width).toBeLessThan(inspectorBox.x);
    }
    if (width <= 1360) {
      const visibility = await drawer.evaluate((element) => getComputedStyle(element).visibility);
      expect(visibility).toBe("hidden");
    }
    evidence.push({
      width,
      height,
      drawerVisible,
      inspector: { x: Math.round(inspectorBox.x), y: Math.round(inspectorBox.y), width: Math.round(inspectorBox.width), height: Math.round(inspectorBox.height) },
      map: { x: Math.round(mapBox.x), y: Math.round(mapBox.y), width: Math.round(mapBox.width), height: Math.round(mapBox.height) },
      documentScrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
    });
    if (capture) {
      await page.screenshot({ path: resolve(assetDirectory, `inspector-${width}.png`), animations: "disabled" });
    }
  }

  if (capture) {
    await writeFile(
      resolve(cwd(), "../docs/concept-8e-responsive-evidence.json"),
      `${JSON.stringify({ concept: "8E", capturedAt: new Date().toISOString(), command: "cd frontend-react && ATOM_8E_CAPTURE=after npx playwright test e2e/workspace.spec.js --project=desktop-1440 --workers=1 --grep 'seven Concept 8E reference widths'", viewports: evidence }, null, 2)}\n`,
    );
  }
});

test("switching Projects clears the live Run association and scopes Run History", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Run history");
  const history = page.getByRole("region", { name: "Durable local run history" });
  await expect(history.getByRole("button", { name: /Simulation/ })).toBeVisible();
  const closeHistoryDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeHistoryDrawer.isVisible()) await closeHistoryDrawer.click();
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toBeVisible();

  await page.getByRole("button", { name: "Open project menu" }).click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  const projectSelect = projectMenu.getByRole("combobox", { name: "Project" });
  const sourceProjectID = await projectSelect.locator("option").first().getAttribute("value");
  await projectMenu.getByRole("button", { name: "New" }).click();
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open project menu" }).click();
  await expect(projectSelect.locator("option")).toHaveCount(2);
  await page.getByRole("button", { name: "Open project menu" }).click();

  await selectWorkspaceTool(page, "Run history");
  await expect(history.getByText("No saved Runs yet")).toBeVisible();
  await expect(history.getByRole("button", { name: /Simulation/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Open project menu" }).click();
  await page.getByRole("dialog", { name: "Project and scenarios" }).getByRole("combobox", { name: "Project" }).selectOption(sourceProjectID);
  await expect(history.getByRole("button", { name: /Simulation/ })).toBeVisible();
});

test("completes the Run, optimization, apply, Version, and historical Report journey", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "The complete planning journey runs once at desktop size");

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();

  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();

  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("dialog", { name: "Results" })).toContainText("-72.0 dBm");

  await page.getByRole("button", { name: "Plan workspace" }).click();
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeToolDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeToolDrawer.isVisible()) await closeToolDrawer.click();
  await selectMapInteraction(page, "Select cells");
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await map.click({
    position: {
      x: mapBox.width / 2 + target.x - center.x,
      y: mapBox.height / 2 + target.y - center.y,
    },
  });
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();

  await projectMenuButton.click();
  const updatedScenarioMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await updatedScenarioMenu.getByRole("button", { name: "Save current" }).click();
  await expect(updatedScenarioMenu.getByRole("status")).toHaveText("Version saved");
  await expect(page.locator(".workspace-lineage-context > summary")).toContainText("Version 2");
  await projectMenuButton.click();
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  await page.getByRole("tab", { name: "Solutions" }).click();
  await expect(page.getByRole("region", { name: "Pareto alternative solutions" })).toBeVisible();

  await selectWorkspaceTool(page, "Run history");
  const history = page.getByRole("region", { name: "Durable local run history" });
  await expect(history).toBeVisible();
  const optimizationRow = history.locator(".run-history-row").filter({ hasText: "Optimization" }).first();
  await expect(optimizationRow.locator(".run-status")).toHaveText("Succeeded");
  await expect(optimizationRow).toContainText("Version 2");
  await optimizationRow.click();
  await expect(history.locator(".run-history-row")).toHaveCount(0);
  await history.getByRole("button", { name: "Back to Run history" }).click();
  await expect(history.locator(".run-history-row")).toHaveCount(2);
  await history.getByRole("combobox", { name: "Run history type" }).selectOption("optimization");
  await expect(history.locator(".run-history-row")).toHaveCount(1);
  await expect(history.locator(".run-history-row").first()).toContainText("Optimization");
  await history.locator(".run-history-row").first().click();
  await expect(history.locator(".run-history-detail")).toBeVisible();
  const applyButton = history.getByRole("button", { name: /Apply solution from/ }).first();
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
  const applyDialog = page.getByRole("dialog", { name: "Apply optimization solution?" });
  await applyDialog.getByRole("button", { name: "Create new Version" }).click();

  const lineageSummary = page.locator(".workspace-lineage-context > summary");
  await projectMenuButton.click();
  const projectMenuAfterApply = page.getByRole("dialog", { name: "Project and scenarios" });
  await expect(projectMenuAfterApply).toContainText("Version 3");
  await projectMenuButton.click();
  const activeLineageBeforeSourceInspection = await lineageSummary.getAttribute("aria-label");
  expect(activeLineageBeforeSourceInspection).toMatch(/Version [23]/);
  await history.getByRole("button", { name: "Open source Version" }).click();
  await expect(page.locator(".scenario-version-row").filter({ hasText: "Version 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(lineageSummary).toHaveAttribute("aria-label", activeLineageBeforeSourceInspection);

  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Run history");
  const historyAfterSourceNavigation = page.getByRole("region", { name: "Durable local run history" });
  await expect(historyAfterSourceNavigation.locator(".run-history-row").filter({ hasText: "Optimization" })).toBeVisible();
  await historyAfterSourceNavigation.locator(".run-history-row").filter({ hasText: "Optimization" }).first().click();
  await expect(historyAfterSourceNavigation.locator(".run-history-detail")).toBeVisible();
  const historicalReport = historyAfterSourceNavigation.getByRole("button", { name: /Generate report from/ });
  await expect(historicalReport).toBeEnabled();
  await historicalReport.click();
  const confirmation = page.getByRole("dialog", { name: "Generate a Report from this Run?" });
  await confirmation.getByRole("button", { name: /Generate report from/ }).click();
  await expect(page.getByRole("region", { name: "Planning report export" })).toBeVisible();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Report");
  const reportList = page.getByRole("region", { name: "Reports" });
  const reportSource = reportList.getByRole("button", { name: "Open source Version" }).first();
  await expect(reportSource).toBeVisible();
  await reportSource.click();
  await expect(page.getByRole("dialog", { name: "Scenarios" })).toBeVisible();
  await expect(page.locator(".scenario-version-row").filter({ hasText: "Version 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(lineageSummary).toHaveAttribute("aria-label", activeLineageBeforeSourceInspection);
});

test("generates a historical Report from cold Run History without opening Report first", async ({ page }) => {
  const computeRequests = [];
  const reportModules = [];
  let reportImportAttempts = 0;
  const failFirstReportImport = async (route) => {
    reportImportAttempts += 1;
    if (reportImportAttempts === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  };
  await page.route("**/src/utils/reportExport.js*", failFirstReportImport);
  await page.route("**/assets/reportExport-*.js", failFirstReportImport);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/(analyze-sector|simulate|optimize)/.test(path)) computeRequests.push(path);
    if (/reportExport|reportArtifact|ReportFeature/.test(path)) reportModules.push(path);
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  const lineageSummary = page.locator(".workspace-lineage-context > summary");
  await expect(lineageSummary).toHaveAttribute("aria-label", /No saved Version/);
  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();

  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Run history");
  const history = page.getByRole("region", { name: "Durable local run history" });
  await expect(history).toBeVisible();
  await history.locator(".run-history-row").first().click();
  await expect(history.locator(".run-history-detail")).toBeVisible();
  await expect(history.getByRole("button", { name: /Generate report from/ })).toBeEnabled();
  expect(reportModules.some((path) => path.includes("ReportFeature"))).toBe(false);

  await history.getByRole("button", { name: /Generate report from/ }).click();
  const confirmation = page.getByRole("dialog", { name: "Generate a Report from this Run?" });
  await confirmation.getByRole("button", { name: /Generate report from/ }).click();
  const generationFailure = page.getByRole("alert").filter({ hasText: "Report generation code could not be loaded" });
  await expect(generationFailure).toBeVisible();
  await expect(generationFailure.getByRole("button", { name: "Reload application" })).toBeVisible();

  await generationFailure.getByRole("button", { name: "Reload application" }).click();
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Run history");
  await expect(history).toBeVisible();
  await history.locator(".run-history-row").first().click();
  await expect(history.locator(".run-history-detail")).toBeVisible();
  await history.getByRole("button", { name: /Generate report from/ }).click();
  const retryConfirmation = page.getByRole("dialog", { name: "Generate a Report from this Run?" });
  await retryConfirmation.getByRole("button", { name: /Generate report from/ }).click();

  await expect(page.getByRole("region", { name: "Planning report export" })).toBeVisible();
  await expect.poll(() => reportModules.some((path) => path.includes("reportExport"))).toBe(true);
  await expect.poll(() => reportModules.some((path) => path.includes("reportArtifact"))).toBe(true);
  await expect.poll(() => reportModules.some((path) => path.includes("ReportFeature"))).toBe(true);
  expect(reportImportAttempts).toBe(2);
  expect(computeRequests).toHaveLength(1);
});

test("Data hierarchy disclosures do not reload the active dataset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Data loading invariance is measured once at desktop size");
  const dataRequests = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (["/api/meta", "/api/datasets", "/api/towers", "/api/buildings/summary"].includes(path)) dataRequests.push(path);
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await selectWorkspaceTool(page, "Data");
  await expect(page.getByRole("heading", { name: "Demand surface" })).toBeVisible();
  await expect(page.getByText("Pack QA status")).toBeVisible();
  await expect(page.locator(".dataset-primary").getByText(/Geometry and hashes validated; RF inventory and demand attributes remain planning-grade/)).toBeVisible();
  await expect(page.locator(".dataset-primary-facts > div").nth(1).locator("dd")).toHaveText("8");
  await expect(page.locator(".dataset-primary-facts > div").nth(2).locator("dd")).toHaveText("4");
  const initialLoadCount = dataRequests.length;

  await page.getByText(/^Dataset details/).click();
  await expect(page.getByText("Pack QA", { exact: true })).toBeVisible();
  await page.getByText("Details / Provenance").click();
  await page.getByText("Developer details").click();
  await page.getByRole("button", { name: "Advanced model details" }).click();
  await page.getByRole("button", { name: "Research / reference" }).click();
  await selectWorkspaceTool(page, "Setup");
  await selectWorkspaceTool(page, "Data");
  await expect(page.getByRole("heading", { name: "Demand surface" })).toBeVisible();

  expect(dataRequests).toHaveLength(initialLoadCount);
});

test("keeps an unsaved draft when opening a different Scenario is blocked", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();

  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();

  await selectWorkspaceTool(page, "Scenarios");
  await page.getByText("More Scenario actions", { exact: true }).click();
  await page.getByRole("button", { name: "Duplicate scenario" }).click();
  await expect(page.getByText("Independent Scenario duplicated")).toBeVisible();
  const lineageSummary = page.locator(".workspace-lineage-context > summary");
  await expect(page.getByText("2 saved")).toBeVisible();

  await selectWorkspaceTool(page, "Setup");
  const txPower = page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" });
  await txPower.fill("31");
  await expect(lineageSummary).toContainText("Unsaved");

  await selectWorkspaceTool(page, "Scenarios");
  const currentScenarioRow = page.locator(".scenario-switch-row[aria-current='true']");
  await expect(currentScenarioRow).toHaveAttribute("aria-label", /working draft with unsaved changes/);
  await currentScenarioRow.click();
  await expect(page.getByText("Save the current draft as a Version before opening another Scenario")).toHaveCount(0);
  await expect(lineageSummary).toContainText("Unsaved");
  await expect(page.getByText("2 saved Scenarios", { exact: true })).toBeVisible();
  await selectWorkspaceTool(page, "Setup");
  await expect(txPower).toHaveValue("31");

  await projectMenuButton.click();
  const savedScenario = page.getByRole("dialog", { name: "Project and scenarios" }).getByRole("button", { name: /Sector plan 1 copy Version/ }).first();
  await savedScenario.click();

  await expect(page.getByRole("alert")).toContainText("Save the current draft as a Version before opening another Scenario");
  await expect(lineageSummary).toContainText("Unsaved");
  await expect(txPower).toHaveValue("31");
});

test("clears the inspected Cell when switching to another Scenario", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Scenario inspection lifecycle is covered at the desktop layout");
  await page.goto("/");
  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();

  await selectWorkspaceTool(page, "Scenarios");
  await page.getByText("More Scenario actions", { exact: true }).click();
  await page.getByRole("button", { name: "Duplicate scenario" }).click();
  await expect(page.getByText("Independent Scenario duplicated")).toBeVisible();
  await expect(page.getByText("2 saved Scenarios", { exact: true })).toBeVisible();

  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  await expect(inspector.getByRole("heading", { name: "Cell cell-2" })).toBeVisible();

  await projectMenuButton.click();
  const otherScenario = page.locator(".scenario-switch-row:not([aria-current='true'])").first();
  await expect(otherScenario).toBeVisible();
  await otherScenario.click();
  await expect(inspector).toHaveCount(0);
});

test("keeps a collapsed Advanced cell RF value through Version save and reload", async ({ page }) => {
  await page.goto("/");
  await selectWorkspaceTool(page, "Inventory");
  await page.getByRole("textbox", { name: "Search by Cell ID or record ID" }).fill("cell-1");
  await page.getByRole("button", { name: "Edit Cell cell-1" }).click();

  const advanced = page.getByRole("button", { name: /^Advanced/ });
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await advanced.click();
  await page.getByRole("spinbutton", { name: "TX boresight gain" }).fill("27");
  await advanced.click();
  await expect(advanced).toHaveAttribute("aria-expanded", "false");

  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await page.reload();

  await selectWorkspaceTool(page, "Inventory");
  await page.getByRole("textbox", { name: "Search by Cell ID or record ID" }).fill("cell-1");
  await page.getByRole("button", { name: "Edit Cell cell-1" }).click();
  const restoredAdvanced = page.getByRole("button", { name: /^Advanced/ });
  await expect(restoredAdvanced).toHaveAttribute("aria-expanded", "false");
  await restoredAdvanced.click();
  await expect(page.getByRole("spinbutton", { name: "TX boresight gain" })).toHaveValue("27");
});

test("opens the exact Run source Version while keeping the current Version active", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();

  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  let projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();
  await selectWorkspaceTool(page, "Scenarios");
  const savedScenario = page.getByRole("button", { name: /Sector plan 1.*Version 1/ });
  await savedScenario.click();
  await expect(savedScenario).toHaveAttribute("aria-current", "true");
  const lineageSummary = page.locator(".workspace-lineage-context > summary");
  await expect(lineageSummary).toContainText("Version 1");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Run Sector" }).click();
  await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible();
  await expect(lineageSummary).toContainText("Version 1");

  const txPower = page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" });
  await txPower.fill("31");
  await expect(lineageSummary).toContainText("Unsaved");
  await projectMenuButton.click();
  projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();
  await expect(lineageSummary).toContainText("Version 2");

  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Run history");
  const runHistory = page.getByRole("region", { name: "Durable local run history" });
  await runHistory.locator(".run-history-row").first().click();
  await expect(runHistory.getByRole("article", { name: /Run .* details/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "HISTORICAL context" })).toContainText("Version 1");
  await page.getByRole("button", { name: "Open source Version" }).click();

  await expect(page.getByRole("dialog", { name: "Scenarios" })).toBeVisible();
  await expect(page.locator(".scenario-version-row").filter({ hasText: "Version 1" })).toHaveAttribute("aria-pressed", "true");
  await selectWorkspaceTool(page, "Setup");
  await expect(lineageSummary).toContainText("Version 2");
  await expect(txPower).toHaveValue("31");
});

test("keeps the focused workspace usable without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Ankara propagation map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan workspace" })).toBeVisible();
  const lineageSummary = page.locator(".workspace-lineage-context > summary");
  await expect(lineageSummary).toBeVisible();
  const lineageBox = await lineageSummary.boundingBox();
  expect(lineageBox?.width).toBeGreaterThan(0);
  expect(lineageBox?.x).toBeGreaterThanOrEqual(0);
  expect(lineageBox?.x + lineageBox?.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await expect(page.getByRole("button", { name: "Interference" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "5G Core" })).toBeEnabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("keeps RF controls usable when basemap tiles fail", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".map-basemap-status")).toContainText("Base map unavailable. RF layers remain available", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
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

  const reviewStage = page.getByRole("button", { name: "Review workspace" });
  await reviewStage.click();
  const chooserSheet = page.locator('.tool-drawer[data-stage-chooser="true"]');
  await expect(chooserSheet).toBeVisible();
  const firstSheetBox = await chooserSheet.boundingBox();

  for (const destination of ["Results", "Data", "Report"]) {
    const option = page.locator(`#stage-tool-review-${workspaceTools[destination][2]}`);
    await expect(option).toBeVisible();
    await option.click();
    const drawer = page.getByRole("dialog", { name: destination });
    await expect(drawer).toBeVisible();
    const selectedSheetBox = await drawer.boundingBox();
    expect(selectedSheetBox?.height).toBeLessThanOrEqual(620);
    expect(Math.abs(selectedSheetBox.height - firstSheetBox.height)).toBeLessThan(0.1);
    expect(Math.abs(selectedSheetBox.y - firstSheetBox.y)).toBeLessThan(0.1);

    if (destination !== "Report") {
      await reviewStage.click();
      await expect(chooserSheet).toBeVisible();
      const reopenedSheetBox = await chooserSheet.boundingBox();
      expect(Math.abs(reopenedSheetBox.height - firstSheetBox.height)).toBeLessThan(0.1);
      expect(Math.abs(reopenedSheetBox.y - firstSheetBox.y)).toBeLessThan(0.1);
    }
  }
});

test("smokes sibling navigation across all four stages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Run the complete tool-switching smoke once at desktop size");

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();

  await selectWorkspaceTool(page, "Inventory");
  await expect(page.getByRole("dialog", { name: "Inventory" })).toBeVisible();
  await selectWorkspaceTool(page, "Propagation");
  await expect(page.getByRole("dialog", { name: "Propagation" })).toBeVisible();
  await selectWorkspaceTool(page, "Experiments");
  await expect(page.getByRole("dialog", { name: "Experiments" })).toBeVisible();

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeToolDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeToolDrawer.isVisible()) await closeToolDrawer.click();
  await selectMapInteraction(page, "Select cells");
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await map.click({ position: {
    x: mapBox.width / 2 + target.x - center.x,
    y: mapBox.height / 2 + target.y - center.y,
  } });
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();

  await selectWorkspaceTool(page, "Propagation");
  await selectWorkspaceTool(page, "Interference");
  await expect(page.getByRole("dialog", { name: "Interference" })).toBeVisible();
  await selectWorkspaceTool(page, "RF Diagnostics");
  await expect(page.getByRole("dialog", { name: "RF Diagnostics" })).toBeVisible();
  await selectWorkspaceTool(page, "Building entry");
  await expect(page.getByRole("dialog", { name: "Building entry" })).toBeVisible();

  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("dialog", { name: "Results" })).toBeVisible();
  await selectWorkspaceTool(page, "Run history");
  await expect(page.getByRole("dialog", { name: "Run history" })).toBeVisible();
  await selectWorkspaceTool(page, "Report");
  await expect(page.getByRole("dialog", { name: "Report" })).toBeVisible();
});

test("explores and dismisses stage choices without replacing the active workspace tool", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Desktop stage chooser focus regression");

  await page.goto("/");
  const setup = page.getByRole("dialog", { name: "Setup" });
  const planStage = page.getByRole("button", { name: "Plan workspace" });
  await expect(setup).toBeVisible();

  await planStage.click();
  const chooser = page.getByRole("dialog", { name: "Plan tools" });
  await expect(chooser).toBeVisible();
  await expect(setup).toBeVisible();
  await expect(chooser.getByRole("button", { name: "Setup", exact: true })).toHaveAttribute("aria-current", "page");

  await page.keyboard.press("Escape");
  await expect(chooser).toBeHidden();
  await expect(planStage).toBeFocused();
  await expect(setup).toBeVisible();

  await planStage.click();
  await expect(chooser).toBeVisible();
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  expect(mapBox).not.toBeNull();
  await page.locator(".leaflet-container").click({ position: { x: mapBox.width * 0.8, y: mapBox.height * 0.7 } });
  await expect(chooser).toBeHidden();
  await expect(setup).toBeVisible();

  await planStage.focus();
  await page.keyboard.press("Enter");
  await expect(chooser).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(chooser.getByRole("button", { name: "Setup", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  const inventoryChoice = chooser.getByRole("button", { name: "Inventory", exact: true });
  await expect(inventoryChoice).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Inventory" })).toBeVisible();
});

test("keeps propagation actions clear of the vertical path profile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");

  const drawer = page.getByRole("dialog", { name: "Propagation" });
  await expect(page.getByRole("button", { name: /^Advanced analysis/ })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /^Advanced analysis/ }).click();
  const optimizeButton = page.getByRole("button", { name: "Auto-Optimize Sector" });
  const pathProfile = page.getByRole("region", { name: "Vertical path profile" });
  await expect(drawer).toBeVisible();
  await expect(optimizeButton).toBeVisible();
  await expect(pathProfile).toBeVisible();

  const [drawerBox, optimizeBox, pathProfileBox] = await Promise.all([
    drawer.boundingBox(),
    optimizeButton.boundingBox(),
    pathProfile.boundingBox(),
  ]);
  expect(drawerBox).not.toBeNull();
  expect(optimizeBox).not.toBeNull();
  expect(pathProfileBox).not.toBeNull();
  expect(pathProfileBox.y - (optimizeBox.y + optimizeBox.height)).toBeGreaterThanOrEqual(8);
});

test("opens the collapsed path-profile section from its RF Diagnostics action", async ({ page }) => {
  const rfRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|path-profile)/.test(request.url())) rfRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await selectWorkspaceTool(page, "RF Diagnostics");
  await page.getByRole("button", { name: "Open vertical path profile" }).click();

  await expect(page.getByRole("dialog", { name: "Propagation" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Advanced analysis/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: "Vertical path profile" })).toBeVisible();
  expect(rfRequests).toHaveLength(0);
});

test("runs the isolated material reference from RF Diagnostics", async ({ page }) => {
  const materialRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/sub-thz-material-reference")) materialRequests.push(request);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await selectWorkspaceTool(page, "RF Diagnostics");
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  await page.locator(".rf-diagnostics-research").getByRole("button", { name: "Materials" }).click();
  const materialReference = page.getByRole("region", { name: "Material and facade interaction reference" });
  await expect(materialReference).toBeVisible();
  await expect(page.getByText(/Material reference only — not used by network simulation/i)).toBeVisible();
  await materialReference.getByRole("button", { name: "Run material reference" }).click();
  await expect(materialReference.getByText("No — side by side")).toBeVisible();
  await expect(materialReference.getByText("reference_only", { exact: true })).toBeVisible();
  expect(materialRequests).toHaveLength(1);
  expect(materialRequests[0].postDataJSON()).toMatchObject({
    schema_version: 1,
    material_source: "p2040_reference",
    material_id: "glass_100_400",
    frequency_ghz: 140,
  });
});

test("runs the isolated specular reflection reference from RF Diagnostics", async ({ page }) => {
  const reflectionRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/sub-thz-reflection-reference")) reflectionRequests.push(request);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await selectWorkspaceTool(page, "RF Diagnostics");
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  await page.locator(".rf-diagnostics-research").getByRole("button", { name: "Reflection" }).click();
  const reflectionReference = page.getByRole("region", { name: "Specular reflection reference" });
  await expect(reflectionReference).toBeVisible();
  await expect(reflectionReference.getByText(/reference-only one-bounce diagnostic/i)).toBeVisible();
  await expect(reflectionReference.getByText(/not used by network simulation/i)).toBeVisible();
  await reflectionReference.getByRole("button", { name: "Evaluate reflected path" }).click();
  await expect(reflectionReference.getByText("qualified_reference", { exact: true })).toBeVisible();
  await expect(reflectionReference.getByText("118.381 dB")).toBeVisible();
  await reflectionReference.getByText("Details / Provenance: assumptions and visibility").click();
  await expect(reflectionReference.getByText(/single_bounce_specular_reflection_reference_v1/i)).toBeVisible();
  expect(reflectionRequests).toHaveLength(1);
  expect(reflectionRequests[0].postDataJSON()).toMatchObject({
    schema_version: 1,
    frequency_ghz: 140,
    polarization: "TE",
    coordinate_frame: { mode: "local_enu" },
  });
});

test("explores a retained Pareto alternative without another RF request", async ({ page }) => {
  const rfRequests = [];
  page.on("request", (request) => {
    if (["/api/optimize-network", "/api/simulate"].some((path) => request.url().includes(path))) {
      rfRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeToolDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeToolDrawer.isVisible()) await closeToolDrawer.click();
  await selectMapInteraction(page, "Select cells");
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await page.locator(".leaflet-container").click({
    position: {
      x: mapBox.width / 2 + target.x - center.x,
      y: mapBox.height / 2 + target.y - center.y,
    },
  });
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();

  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByRole("button", { name: "Optimize Network" })).toBeEnabled();
  await expect.poll(() => rfRequests.filter((url) => url.includes("/api/optimize-network")).length).toBe(1);

  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  await page.getByRole("tab", { name: "Solutions" }).click();
  await expect(page.getByRole("region", { name: "Pareto alternative solutions" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Inspect Pareto solution 1, recommended/i })).toBeVisible();
  const requestCount = rfRequests.length;
  await page.getByRole("button", { name: /Inspect Pareto solution 2/i }).click();
  await expect(page.getByText("Compared with recommended")).toBeVisible();
  expect(rfRequests).toHaveLength(requestCount);
});

test("lazily explains a selected cell and reuses it after priority-only changes", async ({ page }) => {
  const explanationRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/explain-network-cell")) explanationRequests.push(request);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeToolDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeToolDrawer.isVisible()) await closeToolDrawer.click();
  await selectMapInteraction(page, "Select cells");
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await page.locator(".leaflet-container").click({
    position: {
      x: mapBox.width / 2 + target.x - center.x,
      y: mapBox.height / 2 + target.y - center.y,
    },
  });
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();

  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByRole("button", { name: "Optimize Network" })).toBeEnabled();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  await page.getByRole("tab", { name: "Solutions" }).click();

  await page.getByRole("button", { name: "Explain Cell cell-1 marginal effect" }).click();
  await expect(page.getByRole("region", { name: "Marginal effect for Cell cell-1" })).toBeVisible();
  await expect(page.getByText("Selected solution − cell reverted to baseline")).toBeVisible();
  expect(explanationRequests).toHaveLength(1);
  expect(explanationRequests[0].postDataJSON()).toMatchObject({ solution_id: "solution-a", cell_id: "cell-1" });

  await page.getByRole("button", { name: /Inspect Pareto solution 2/i }).click();
  await expect(page.getByText("Compared with recommended")).toBeVisible();
  await page.getByRole("button", { name: "Explain Cell cell-1 marginal effect" }).click();
  await expect(page.getByRole("region", { name: "Marginal effect for Cell cell-1" })).toBeVisible();
  expect(explanationRequests).toHaveLength(2);
  expect(explanationRequests[1].postDataJSON()).toMatchObject({ solution_id: "solution-b", cell_id: "cell-1" });

  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: /^Advanced analysis/ }).click();
  await page.getByRole("slider", { name: "Demand importance" }).fill("100");
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  await page.getByRole("tab", { name: "Solutions" }).click();
  await page.getByRole("button", { name: "Explain Cell cell-1 marginal effect" }).click();
  expect(explanationRequests).toHaveLength(2);
});

test("supports keyboard disclosure navigation without starting RF work", async ({ page }) => {
  const analysisRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|simulate|sub-thz-reference|sub-thz-p1411-reference)/.test(request.url())) analysisRequests.push(request.url());
  });
  await page.goto("/");
  const planning = page.getByRole("button", { name: "Planning", exact: true });
  await expect(planning).toHaveAttribute("aria-expanded", "true");
  await planning.focus();
  await planning.press("Enter");
  await expect(planning).toHaveAttribute("aria-expanded", "false");
  await planning.press("Space");
  await expect(planning).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  const advanced = page.getByRole("button", { name: /^Advanced analysis/ });
  const research = page.getByRole("button", { name: /^Research \/ reference/ });
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await expect(research).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "Vertical path profile" })).toBeHidden();
  await research.focus();
  await research.press("Enter");
  await expect(page.getByRole("region", { name: "Sub-THz atmospheric reference" })).toBeVisible();
  const subThz = page.getByRole("region", { name: "Sub-THz atmospheric reference" });
  const frequency = subThz.getByRole("spinbutton").first();
  await frequency.fill("145");
  await research.press("Space");
  await expect(research).toHaveAttribute("aria-expanded", "false");
  await research.click();
  await expect(subThz.getByRole("spinbutton").first()).toHaveValue("145");
  expect(analysisRequests).toHaveLength(0);
});

test("supports keyboard navigation through Scenarios, RF evidence, Results, and Run History", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Cross-tool keyboard flow is covered once at desktop size");
  await page.goto("/");

  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  const saveCurrent = projectMenu.getByRole("button", { name: "Save current" });
  await saveCurrent.focus();
  await saveCurrent.press("Enter");
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await projectMenuButton.click();
  await projectMenu.getByRole("button", { name: "Save current" }).focus();
  await projectMenu.getByRole("button", { name: "Save current" }).press("Enter");
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();

  await selectWorkspaceTool(page, "Scenarios");
  const firstVersion = page.locator(".scenario-version-row").filter({ hasText: "Version 1" });
  await firstVersion.focus();
  await firstVersion.press("Enter");
  await expect(firstVersion).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Version 1 details" })).toBeVisible();

  await selectWorkspaceTool(page, "RF Diagnostics");
  const research = page.getByRole("button", { name: /^Research \/ reference/ });
  await research.focus();
  await research.press("Enter");
  const researchViews = page.locator(".rf-diagnostics-research");
  const materials = researchViews.getByRole("button", { name: "Materials" });
  await materials.focus();
  await materials.press("Enter");
  const materialPanel = page.getByRole("region", { name: "Material and facade interaction reference" });
  await expect(materials).toHaveAttribute("aria-pressed", "true");
  await expect(materialPanel).toBeVisible();
  const reflection = researchViews.getByRole("button", { name: "Reflection" });
  await reflection.focus();
  await reflection.press("Enter");
  await expect(reflection).toHaveAttribute("aria-pressed", "true");
  await expect(materialPanel).toBeHidden();
  await expect(page.getByRole("region", { name: "Specular reflection reference" })).toBeVisible();

  await selectWorkspaceTool(page, "Setup");
  const runSector = page.getByRole("button", { name: "Run Sector" });
  await runSector.focus();
  await runSector.press("Enter");
  await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible();

  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  const optimizationTab = page.getByRole("tab", { name: "Optimization" });
  await optimizationTab.focus();
  await optimizationTab.press("Enter");
  await expect(optimizationTab).toHaveAttribute("aria-selected", "true");

  await selectWorkspaceTool(page, "Run history");
  const runHistory = page.getByRole("region", { name: "Durable local run history" });
  const runRow = runHistory.locator(".run-history-row").first();
  await expect(runRow).toBeVisible();
  await runRow.focus();
  await runRow.press("Enter");
  await expect(runHistory.locator(".run-history-detail")).toBeVisible();
  const back = runHistory.getByRole("button", { name: "Back to Run history" });
  await expect(back).toBeFocused();
  await back.press("Enter");
  await expect(runRow).toBeFocused();
});

test("loads specialized feature modules only after their workspace action", async ({ page }) => {
  const scriptRequests = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scriptRequests.push(new URL(request.url()).pathname);
  });
  const featurePaths = {
    propagation: "PropagationResearchFeature",
    diagnostics: "RFDiagnosticsResearchFeature",
    validation: "MeasurementValidationPanel",
    materials: "MaterialReferencePanel",
    reflection: "SpecularReflectionReferencePanel",
    experiments: "ExperimentPanel",
    coreLab: "CoreLabFeature",
    history: "RunHistoryPanel",
    reports: "ReportFeature",
  };
  const wasRequested = (featurePath) => scriptRequests.some((path) => path.includes(featurePath));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ankara propagation map" })).toBeVisible();
  expect(Object.values(featurePaths).some(wasRequested)).toBe(false);

  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  const propagationResearch = page.getByRole("button", { name: /^Research \/ reference/ });
  await expect(propagationResearch).toHaveAttribute("aria-expanded", "false");
  expect(wasRequested(featurePaths.propagation)).toBe(false);
  await propagationResearch.focus();
  await propagationResearch.press("Enter");
  const subThz = page.getByRole("region", { name: "Sub-THz atmospheric reference" });
  await expect(subThz).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.propagation)).toBe(true);
  await subThz.getByRole("spinbutton").first().fill("145");
  await propagationResearch.press("Space");
  await expect(propagationResearch).toHaveAttribute("aria-expanded", "false");
  await propagationResearch.click();
  await expect(subThz.getByRole("spinbutton").first()).toHaveValue("145");

  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await selectWorkspaceTool(page, "RF Diagnostics");
  const diagnosticsResearch = page.getByRole("button", { name: /^Research \/ reference/ });
  expect(wasRequested(featurePaths.diagnostics)).toBe(false);
  await diagnosticsResearch.click();
  const researchViews = page.locator(".rf-diagnostics-research");
  await expect(researchViews.getByRole("button", { name: "Validation" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Choose an evidence workflow")).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.diagnostics)).toBe(true);
  expect(wasRequested(featurePaths.validation)).toBe(false);
  const computeRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|simulate|optimize-network|interference)/.test(request.url())) computeRequests.push(request.url());
  });
  await researchViews.getByRole("button", { name: "Validation" }).click();
  const validationPanel = page.getByRole("region", { name: "RF diagnostics and measurement validation" });
  await expect(validationPanel).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.validation)).toBe(true);
  await researchViews.getByRole("button", { name: "Materials" }).click();
  const materialPanel = page.getByRole("region", { name: "Material and facade interaction reference" });
  await expect(materialPanel).toBeVisible();
  await expect(validationPanel).toBeHidden();
  await expect.poll(() => wasRequested(featurePaths.materials)).toBe(true);
  const frequency = materialPanel.getByRole("spinbutton", { name: "Material reference frequency" });
  await frequency.fill("137");
  await researchViews.getByRole("button", { name: "Reflection" }).click();
  const reflectionPanel = page.getByRole("region", { name: "Specular reflection reference" });
  await expect(reflectionPanel).toBeVisible();
  await expect(materialPanel).toBeHidden();
  await expect.poll(() => wasRequested(featurePaths.reflection)).toBe(true);
  await researchViews.getByRole("button", { name: "Materials" }).click();
  await expect(frequency).toHaveValue("137");
  expect(computeRequests).toHaveLength(0);

  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Experiments");
  await expect(page.getByRole("region", { name: "Experiments" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.experiments)).toBe(true);

  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await selectWorkspaceTool(page, "5G Core");
  await expect(page.getByRole("region", { name: "5G Core Lab" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.coreLab)).toBe(true);

  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Run history");
  await expect(page.getByRole("region", { name: "Durable local run history" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.history)).toBe(true);
  await selectWorkspaceTool(page, "Report");
  await expect(page.getByRole("region", { name: "Planning report export" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.reports)).toBe(true);
  await expect(page.getByRole("region", { name: "Ankara propagation map" })).toBeVisible();
});

test("recovers from a failed research import by reloading the application", async ({ page }) => {
  let importRequests = 0;
  let failedFirstImport = false;
  const failOnce = async (route) => {
    importRequests += 1;
    if (!failedFirstImport) {
      failedFirstImport = true;
      await route.abort();
      return;
    }
    await route.continue();
  };
  await page.route("**/src/features/propagation-research/PropagationResearchFeature.jsx*", failOnce);
  await page.route("**/assets/PropagationResearchFeature-*.js", failOnce);
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();

  const failure = page.getByRole("alert", { name: "Propagation Research could not be loaded" });
  await expect(failure).toBeVisible();
  await expect(failure.getByRole("button", { name: "Reload application" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ankara propagation map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeVisible();

  await failure.getByRole("button", { name: "Reload application" }).click();
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  await expect(page.getByRole("region", { name: "Sub-THz atmospheric reference" })).toBeVisible();
  expect(importRequests).toBe(2);
});

test("keeps disclosure headers and the propagation drawer usable at target widths", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await selectWorkspaceTool(page, "Propagation");

  const planning = page.getByRole("button", { name: "Planning", exact: true });
  const advanced = page.getByRole("button", { name: /^Advanced analysis/ });
  const research = page.getByRole("button", { name: /^Research \/ reference/ });
  const drawerBody = page.locator(".tool-drawer-body");
  const evidence = [];
  for (const width of [1440, 1280, 1024, 640, 390]) {
    await page.setViewportSize({ width, height: width <= 640 ? 844 : 900 });
    await expect(planning).toBeVisible();
    await expect(advanced).toBeVisible();
    await expect(research).toBeVisible();
    await expect(advanced).toHaveAttribute("aria-expanded", "false");
    await expect(research).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Run Sector" })).toBeVisible();
    const dimensions = await drawerBody.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    const headerBox = await research.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox.x).toBeGreaterThanOrEqual(0);
    expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(width + 1);
    evidence.push({ width, ...dimensions });
  }
  expect(evidence).toHaveLength(5);
});

test("captures post-change Concept 8B chrome and responsive evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Capture the evidence set once from the desktop project");
  const responsiveMeasurements = [];
  const screenshot = (name) => page.screenshot({
    path: `../docs/assets/concept-8b/${name}.jpg`,
    type: "jpeg",
    quality: 78,
    animations: "disabled",
  });
  const measureLayout = (viewportLabel) => page.evaluate((label) => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: Math.round(box.x * 10) / 10, y: Math.round(box.y * 10) / 10, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 };
    };
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    const commandGroups = [...document.querySelectorAll(".command-bar .command-group")].filter(visible);
    const drawer = document.querySelector(".tool-drawer");
    const header = drawer?.querySelector(".tool-drawer-header");
    const body = drawer?.querySelector(".tool-drawer-body");
    const firstContent = body?.firstElementChild;
    return {
      label,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      commandBar: rect(".command-bar"),
      commandGrid: getComputedStyle(document.querySelector(".command-bar")).gridTemplateAreas,
      visibleCommandGroups: commandGroups.map((group) => group.getAttribute("aria-label")),
      commandWorkspace: rect(".command-workspace"),
      commandRFContext: rect(".command-rf-context"),
      commandStatus: rect(".command-status"),
      commandPrimaryAction: rect(".command-primary-action"),
      runState: rect(".command-status .run-state"),
      runStateStyle: (() => {
        const state = document.querySelector(".command-status .run-state");
        const style = getComputedStyle(state);
        return { display: style.display, width: style.width, minWidth: style.minWidth, color: style.color, overflow: style.overflow, fontSize: style.fontSize, gridColumn: style.gridColumn, gridRow: style.gridRow };
      })(),
      resultContext: rect(".command-status .result-context-compact"),
      runStateText: document.querySelector(".command-status .run-state")?.textContent.trim() ?? null,
      resultContextText: document.querySelector(".command-status .result-context-compact")?.textContent.trim() ?? null,
      stageRail: rect(".workflow-rail"),
      map: rect(".leaflet-container"),
      drawer: rect(".tool-drawer"),
      drawerHeader: rect(".tool-drawer-header"),
      firstToolContentOffsetFromDrawer: header && firstContent
        ? Math.round((firstContent.getBoundingClientRect().top - drawer.getBoundingClientRect().top) * 10) / 10
        : null,
      persistentToolNavigationCount: document.querySelectorAll(".tool-subnav, .tool-tabs, [data-persistent-tool-nav]").length,
      chooser: rect(".stage-tool-chooser-flyout") ?? rect('.tool-drawer[data-stage-chooser="true"]'),
      toolChoiceCount: document.querySelectorAll("[data-stage-chooser] .stage-tool-choice").length,
      drawerFirstContent: firstContent?.className ?? null,
    };
  }, viewportLabel);

  await page.route("**/api/interference", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { interference_dbm: -96, sinr_db: 12.3 },
          geometry: { type: "Point", coordinates: [32.852, 39.921] },
        }],
      },
      demand_geojson: { type: "FeatureCollection", features: [] },
      stats: {
        avg_sinr_db: 12.3,
        p10_sinr_db: 1.2,
        median_sinr_db: 10.5,
        avg_rsrp_dbm: -91,
        avg_rsrq_db: -12,
        serviceable_pct: 50,
        serviceable_fraction: 0.8,
        interference_limited_pct: 10,
        no_signal_count: 2,
        affected_demand: 240,
        per_serving_cell: [
          { cell_id: "cell-1", channel_id: "channel-a", serving_samples: 120, avg_sinr_db: 12.3, avg_rsrp_dbm: -91, avg_rsrq_db: -12 },
          { cell_id: "cell-2", channel_id: "channel-b", serving_samples: 90, avg_sinr_db: 9.6, avg_rsrp_dbm: -94, avg_rsrq_db: -14 },
        ],
      },
      model: {
        rsrp_threshold_dbm: -110,
        sinr_threshold_db: 0,
        rsrq_threshold_db: -20,
        resource_basis: "one occupied frequency resource element",
        co_channel_eligibility_rule: "exact configured channel",
        effective_cell_profiles: [],
      },
    }),
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await screenshot("1440-setup");
  const beforeFlyout = await measureLayout("1440 flyout closed");
  await page.getByRole("button", { name: "Plan workspace" }).click();
  await expect(page.getByRole("dialog", { name: "Plan tools" })).toBeVisible();
  await screenshot("1440-desktop-flyout");
  const afterFlyout = await measureLayout("1440 flyout open");
  responsiveMeasurements.push(beforeFlyout, afterFlyout);
  expect(afterFlyout.map?.width).toBe(beforeFlyout.map?.width);
  expect(afterFlyout.drawer?.width).toBe(beforeFlyout.drawer?.width);
  expect(afterFlyout.stageRail?.width).toBe(beforeFlyout.stageRail?.width);

  await selectWorkspaceTool(page, "Inventory");
  await expect(page.getByRole("dialog", { name: "Inventory" })).toBeVisible();
  await screenshot("1440-inventory");
  await selectWorkspaceTool(page, "Propagation");
  await expect(page.getByRole("dialog", { name: "Propagation" })).toBeVisible();
  await screenshot("1440-propagation");
  await selectWorkspaceTool(page, "RF Diagnostics");
  await expect(page.getByRole("button", { name: /^Research \/ reference/ })).toHaveAttribute("aria-expanded", "false");
  await screenshot("1440-rf-diagnostics-collapsed");
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  await page.locator(".rf-diagnostics-research").getByRole("button", { name: "Validation" }).click();
  await expect(page.getByRole("region", { name: "RF diagnostics and measurement validation" })).toBeVisible();
  await screenshot("1440-rf-diagnostics-validation");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeToolDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeToolDrawer.isVisible()) await closeToolDrawer.click();
  await selectMapInteraction(page, "Select cells");
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const target = projectMapPoint(32.854, 39.922, 12);
  const center = projectMapPoint(32.8541, 39.9208, 12);
  await map.click({ position: {
    x: mapBox.width / 2 + target.x - center.x,
    y: mapBox.height / 2 + target.y - center.y,
  } });
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();

  await selectWorkspaceTool(page, "Interference");
  await page.getByRole("button", { name: "Analyze Interference" }).click();
  await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("tab", { name: "Interference" })).toHaveAttribute("aria-selected", "true");
  await screenshot("1440-interference-result");

  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible();
  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("tab", { name: "Optimization" })).toBeVisible();
  await page.getByRole("tab", { name: "Optimization" }).click();
  await screenshot("1440-results-optimization");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await selectWorkspaceTool(page, "Results");
  await expect(page.locator(".command-status .run-state")).toHaveText("Result out of date");
  await screenshot("1440-results-stale");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".command-status .run-state")).toHaveText("Result out of date");
  await expect(page.locator(".result-context-compact .result-context-state")).toBeVisible();
  await expect(page.locator(".workspace-lineage-context > summary")).toBeVisible();
  await expect(page.locator(".workspace-lineage-context > summary")).toHaveAttribute(
    "aria-label",
    /Workspace: .*?, .*?, .*?, .*/,
  );
  await screenshot("390-results-stale");
  const mobileStale = await measureLayout("390 stale result");
  responsiveMeasurements.push(mobileStale);
  const runStateBox = await page.locator(".command-status .run-state").boundingBox();
  const resultContextBox = await page.locator(".command-status .result-context-compact").boundingBox();
  expect(runStateBox).not.toBeNull();
  expect(resultContextBox).not.toBeNull();
  expect(runStateBox.x + runStateBox.width).toBeLessThanOrEqual(resultContextBox.x + 1);

  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const databases = await indexedDB.databases?.() ?? [];
    await Promise.all(databases.map(({ name }) => new Promise((resolveDelete) => {
      if (!name) return resolveDelete();
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = resolveDelete;
    })));
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await expect(page.locator(".command-status .run-state")).toHaveText("Run needed");
  await selectWorkspaceTool(page, "Setup");
  for (const width of [1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : width === 768 ? 1024 : 900 });
    await page.waitForTimeout(100);
    await screenshot(`${width}-setup`);
    responsiveMeasurements.push(await measureLayout(`${width} setup`));
  }
  await page.getByRole("button", { name: "Review workspace" }).click();
  await expect(page.locator('.tool-drawer[data-stage-chooser="true"]')).toBeVisible();
  await screenshot("390-mobile-chooser");
  const mobileChooser = await measureLayout("390 Review chooser");
  responsiveMeasurements.push(mobileChooser);
  expect(mobileChooser.chooser?.height).toBeLessThanOrEqual(620);

  await writeFile(
    resolve(cwd(), "../docs/concept-8b-responsive-evidence.json"),
    `${JSON.stringify({
      concept: "8B",
      screenshotFiles: [
        "1440-setup.jpg",
        "1440-desktop-flyout.jpg",
        "1440-inventory.jpg",
        "1440-propagation.jpg",
        "1440-rf-diagnostics-collapsed.jpg",
        "1440-rf-diagnostics-research.jpg",
        "1440-interference-result.jpg",
        "1440-results-optimization.jpg",
        "1440-results-stale.jpg",
        "390-results-stale.jpg",
        "1280-setup.jpg",
        "1024-setup.jpg",
        "768-setup.jpg",
        "390-setup.jpg",
        "390-mobile-chooser.jpg",
      ],
      screenshots: responsiveMeasurements.map(({ label }) => label),
      measurements: responsiveMeasurements,
    }, null, 2)}\n`,
  );
});

test("captures Concept 8C map chrome and responsive evidence", async ({ page }, testInfo) => {
  test.skip(env.ATOM_8C_CAPTURE !== "after", "Set ATOM_8C_CAPTURE=after to refresh Concept 8C visual evidence");
  test.skip(testInfo.project.name !== "desktop-1440", "Capture every reference width from one deterministic browser context");
  test.setTimeout(90_000);

  const assetDirectory = resolve(cwd(), "../docs/assets/concept-8c/after");
  await mkdir(assetDirectory, { recursive: true });
  const screenshots = [];
  const measurements = [];
  const capture = async (name, label = name) => {
    const file = `${name}.png`;
    const path = resolve(assetDirectory, file);
    await page.screenshot({ path, type: "png", animations: "disabled" });
    screenshots.push({ label, file: `docs/assets/concept-8c/after/${file}` });
    const measurement = await page.evaluate((viewportLabel) => {
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return Object.fromEntries(["x", "y", "width", "height", "right", "bottom"].map((key) => [key, Math.round(box[key] * 10) / 10]));
      };
      const intersects = (first, second) => Boolean(first && second
        && first.x < second.right && first.right > second.x
        && first.y < second.bottom && first.bottom > second.y);
      const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
      const mapToolbar = document.querySelector(".focused-map-toolbar");
      const viewMenu = document.querySelector(".map-view-menu");
      const inspector = document.querySelector(".contextual-inspector");
      const legend = document.querySelector(".focused-map-legend");
      const interactionTrigger = document.querySelector(".map-interaction-trigger");
      const viewTrigger = document.querySelector(".view-trigger");
      const layersTrigger = document.querySelector(".layers-trigger");
      const zoomControl = document.querySelector(".leaflet-control-zoom");
      const map = document.querySelector(".leaflet-container");
      const toolbarBox = rect(mapToolbar);
      const inspectorBox = visible(inspector) ? rect(inspector) : null;
      const legendBox = visible(legend) ? rect(legend) : null;
      return {
        label: viewportLabel,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        map: rect(map),
        mapToolbar: toolbarBox,
        mapToolbarHeight: Math.round(mapToolbar.getBoundingClientRect().height * 10) / 10,
        interactionTrigger: rect(interactionTrigger),
        viewTrigger: rect(viewTrigger),
        layersTrigger: rect(layersTrigger),
        zoomControl: visible(zoomControl) ? rect(zoomControl) : null,
        interactionExpanded: interactionTrigger?.getAttribute("aria-expanded") === "true",
        viewExpanded: viewTrigger?.getAttribute("aria-expanded") === "true",
        layersExpanded: layersTrigger?.getAttribute("aria-expanded") === "true",
        viewMenu: visible(viewMenu) ? rect(viewMenu) : null,
        viewMenuWithinViewport: visible(viewMenu) ? (() => {
          const box = viewMenu.getBoundingClientRect();
          return box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1;
        })() : null,
        inspector: inspectorBox,
        legend: legendBox,
        legendExpanded: legend?.querySelector("button")?.getAttribute("aria-expanded") === "true",
        toolbarInspectorOverlap: intersects(toolbarBox, inspectorBox),
        legendInspectorOverlap: intersects(legendBox, inspectorBox),
        viewMenuLegendOverlap: visible(viewMenu) && intersects(rect(viewMenu), legendBox),
        viewMenuZoomOverlap: visible(viewMenu) && intersects(rect(viewMenu), visible(zoomControl) ? rect(zoomControl) : null),
        specialMode: document.querySelector(".map-special-mode-label strong")?.textContent.trim() ?? null,
        setupSelectionStatus: document.querySelector(".selection-map-mode")?.textContent.trim() ?? null,
      };
    }, label);
    measurements.push(measurement);
    expect(measurement.documentOverflowX).toBeLessThanOrEqual(1);
    if (measurement.viewMenu) expect(measurement.viewMenuWithinViewport).toBe(true);
    if (measurement.inspector) expect(measurement.toolbarInspectorOverlap).toBe(false);
    if (measurement.inspector) expect(measurement.legendInspectorOverlap).toBe(false);
    expect(measurement.viewMenuLegendOverlap).toBe(false);
    expect(measurement.viewMenuZoomOverlap).toBe(false);
    return measurement;
  };

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await capture("1440-setup-inspect", "1440px Inspect and Setup");

  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await openMapView(page);
  await expect(page.getByRole("combobox", { name: "Map focus cell" })).toBeVisible();
  await capture("1440-view-context", "1440px View context");
  await page.getByRole("button", { name: "Map view options" }).click();
  await page.getByRole("button", { name: "Map layers" }).click();
  await capture("1440-layers", "1440px Layers disclosure");
  await page.getByRole("button", { name: "Map layers" }).click();

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Select cells on map" }).click();
  await expect(page.getByText("Selecting cells on map…")).toBeVisible();
  await expect(page.locator(".command-primary-action").getByRole("button", { name: "Select cells" })).toHaveCount(0);
  await capture("1440-select-cells", "1440px Network cell selection");
  await page.getByRole("button", { name: "Draw selection area" }).click();
  await expect(page.getByRole("group", { name: "Map controls" }).getByRole("status")).toContainText("Draw area");
  await expect(page.locator(".command-primary-action").getByRole("button", { name: "Select cells" })).toHaveCount(0);
  await capture("1440-area-draw", "1440px Draw area special mode");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  for (const [width, height] of [[1920, 1080], [1600, 1000], [1440, 900], [1280, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    if (width === 390) {
      await selectWorkspaceTool(page, "Setup");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Select cells on map" })).toBeVisible();
      await page.getByRole("button", { name: "Select cells on map" }).click();
      await expect(page.locator(".tool-drawer")).toBeHidden();
      await expect(page.getByRole("button", { name: "Map interaction: Select cells" })).toBeVisible();
    } else if (width === 768) {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Select cells on map" })).toBeVisible();
      await page.getByRole("button", { name: "Select cells on map" }).click();
      await expect(page.locator(".tool-drawer")).toBeHidden();
      await expect(page.locator(".map-desktop-interaction").getByRole("button", { name: "Select cells", exact: true })).toHaveAttribute("aria-pressed", "true");
    } else {
      await expect(page.locator(".map-desktop-interaction").getByRole("button", { name: "Select cells", exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    await capture(`${width}-select-cells-mode`, `${width}px Select cells interaction`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  const inspector = page.getByRole("complementary", { name: "Cell inspector" });
  await expect(inspector.getByRole("heading", { name: "Cell cell-2" })).toBeVisible();
  const widthEvidence = [];
  for (const [width, height] of [[1920, 1080], [1600, 1000], [1440, 900], [1280, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(inspector).toBeVisible();
    await openMapView(page);
    const measurement = await capture(`${width}-inspector-view`, `${width}px inspected Map Focus`);
    widthEvidence.push({ width, height, ...measurement });
    await expect(page.getByRole("button", { name: "Inspect focused cell" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Map focus cell" })).toBeVisible();
    if (width <= 900) await expect(page.locator(".focused-map-legend > button")).toHaveAttribute("aria-expanded", "false");
    if (width <= 520) await expect(page.locator(".focused-map-legend")).toHaveCSS("visibility", "hidden");
    if (width <= 520) await expect(page.locator(".leaflet-control-zoom")).toHaveCSS("visibility", "hidden");
  }

  await page.getByRole("button", { name: "Map view options" }).click();
  await expect(page.locator(".focused-map-legend")).toHaveCSS("visibility", "visible");
  await expect(page.locator(".leaflet-control-zoom")).toHaveCSS("visibility", "visible");
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const closeMobileDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeMobileDrawer.isVisible()) await closeMobileDrawer.click();
  const interactionTrigger = page.getByRole("button", { name: /^Map interaction:/ });
  await interactionTrigger.click();
  await expect(page.locator(".map-interaction-popover")).toBeVisible();
  await capture("390-interaction-menu", "390px map interaction disclosure");
  await page.locator(".map-interaction-popover").getByRole("button", { name: "Select cells", exact: true }).click();
  await expect(interactionTrigger).toHaveAccessibleName("Map interaction: Select cells");
  await capture("390-select-cells", "390px Select cells mode");
  await interactionTrigger.click();
  await page.locator(".map-interaction-popover").getByRole("button", { name: "Draw area", exact: true }).click();
  await expect(page.getByRole("group", { name: "Map controls" }).getByRole("status")).toContainText("Draw area");
  await capture("390-special-mode", "390px special map mode");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await interactionTrigger.click();
  await expect(page.locator(".map-interaction-popover").getByRole("button", { name: "Clear selected cluster" })).toBeVisible();
  await capture("390-network-edit-actions", "390px immediate cluster edit actions (no Erase mode)");
  await page.getByRole("button", { name: "Select cells", exact: true }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await selectWorkspaceTool(page, "Inventory");
  await page.getByRole("button", { name: "Place new Cell" }).click();
  await expect(page.getByRole("group", { name: "Map controls" }).getByRole("status")).toContainText("Place cell");
  await capture("1440-place-cell", "1440px Inventory-owned Place cell mode");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/");
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  await page.getByRole("complementary", { name: "Cell inspector" }).getByRole("button", { name: "Open Path profile" }).click();
  const pathProfile = page.getByRole("region", { name: "Vertical path profile" });
  await expect(pathProfile).toBeVisible();
  await page.getByRole("complementary", { name: "Cell inspector" }).getByRole("button", { name: "Close inspector" }).click();
  await pathProfile.getByRole("button", { name: "Pick receiver on map" }).click();
  await expect(page.getByRole("group", { name: "Map controls" }).getByRole("status")).toContainText("Pick receiver");
  await capture("1440-pick-receiver", "1440px Path Profile-owned Pick receiver mode");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await writeFile(
    resolve(cwd(), "../docs/concept-8c-responsive-evidence.json"),
    `${JSON.stringify({ concept: "8C", phase: "post-change", capturedAt: new Date().toISOString(), viewportSet: [1920, 1600, 1440, 1280, 1024, 768, 390], screenshots, measurements, inspectorWidths: widthEvidence }, null, 2)}\n`,
  );
});

test("captures Concept 8F hierarchy, density, and responsive evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Capture the responsive evidence set from one deterministic browser context");
  test.setTimeout(120_000);
  const assetDirectory = resolve(cwd(), "../docs/assets/concept-8f/after");
  await mkdir(assetDirectory, { recursive: true });
  const screenshots = [];
  const measurements = [];
  const capture = async (name, label = name) => {
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(assetDirectory, file), type: "png", animations: "disabled" });
    screenshots.push({ label, file: `docs/assets/concept-8f/after/${file}` });
    measurements.push(await page.evaluate((measurementLabel) => {
      const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
      const body = document.querySelector(".tool-drawer-body");
      const cardSelectors = [".scenario-panel", ".network-card", ".interference-card", ".comparison-card", ".dataset-panel", ".run-history-panel", ".run-history-detail", ".experiment-panel", ".core-tool", ".building-entry-panel", ".recommendation-panel", ".report-card"];
      return {
        label: measurementLabel,
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        drawerBody: body ? { clientWidth: body.clientWidth, scrollWidth: body.scrollWidth, clientHeight: body.clientHeight, scrollHeight: body.scrollHeight } : null,
        visiblePersistentSections: body ? [...body.querySelectorAll(".disclosure-section")].filter(visible).map((section) => section.querySelector(".disclosure-title")?.textContent.trim()).filter(Boolean) : [],
        primaryActionCount: body ? [...body.querySelectorAll("button.panel-primary-action")].filter(visible).length : 0,
        topLevelContentCardCount: body ? [...body.children].filter((child) => cardSelectors.some((selector) => child.matches(selector))).length : 0,
        visibleEmptyStateCount: body ? [...body.querySelectorAll(".tool-empty-state, .analysis-empty-state")].filter(visible).length : 0,
        openTechnicalDetailCount: body ? [...body.querySelectorAll(".tool-technical-details[open]")].filter(visible).length : 0,
      };
    }, label));
  };

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await capture("1440-setup");
  await page.getByRole("button", { name: "Open project menu" }).click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await page.getByRole("button", { name: "Open project menu" }).click();
  await selectWorkspaceTool(page, "Scenarios");
  await expect(page.getByRole("region", { name: "Scenarios" })).toBeVisible();
  await capture("1440-scenarios-list");
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await page.getByRole("button", { name: "Open project menu" }).click();
  const updatedProjectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await updatedProjectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(updatedProjectMenu.getByRole("status")).toHaveText("Version saved");
  await page.getByRole("button", { name: "Open project menu" }).click();
  await selectWorkspaceTool(page, "Scenarios");
  const versionRow = page.locator(".scenario-version-row").filter({ hasText: "Version 1" });
  await expect(versionRow).toHaveAttribute("aria-pressed", "false");
  await versionRow.click();
  await expect(versionRow).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".workspace-lineage-context > summary")).toContainText("Version 2");
  await capture("1440-scenarios-selected-version");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  const closeDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeDrawer.isVisible()) await closeDrawer.click();
  await selectMapInteraction(page, "Select cells");
  await clickMapPoint(page, 32.854, 39.922);
  await expect(page.getByText(/Network · 2 cells/)).toBeVisible();
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: /^Advanced analysis/ }).click();
  await expect(page.getByRole("heading", { name: "Optimization priorities" })).toBeVisible();
  await capture("1440-optimization-priorities");

  await selectWorkspaceTool(page, "Experiments");
  const experimentPanel = page.getByRole("region", { name: "Experiments" });
  await expect(experimentPanel.getByRole("button", { name: "Queue matrix" })).toBeVisible();
  await expect(experimentPanel.getByRole("button", { name: /Cancel experiment/ })).toHaveCount(0);
  await expect(experimentPanel.getByRole("button", { name: /Download definition/ })).toHaveCount(0);
  await capture("1440-experiments-idle");
  let jobPollCount = 0;
  await page.route("**/api/processes/batch-experiment/execution", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ job_id: "e2e-8f-experiment", status: "accepted", progress: 0, completed_runs: 0, total_runs: 2, fingerprint: "e2e-8f-fingerprint" }),
  }));
  await page.route("**/api/jobs/e2e-8f-experiment", async (route) => {
    jobPollCount += 1;
    if (jobPollCount === 1) await new Promise((resolveWait) => setTimeout(resolveWait, 900));
    const completed = jobPollCount > 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      job_id: "e2e-8f-experiment",
      status: completed ? "completed" : "running",
      progress: completed ? 1 : 0.5,
      completed_runs: completed ? 2 : 1,
      total_runs: 2,
      fingerprint: "e2e-8f-fingerprint",
      result: { runs: [] },
    }) });
  });
  await experimentPanel.getByRole("textbox", { name: "Experiment name" }).fill("8F evidence matrix");
  await experimentPanel.getByRole("textbox", { name: /Frequency/ }).fill("28,39");
  await experimentPanel.getByRole("button", { name: "Queue matrix" }).click();
  await expect(experimentPanel.locator(".experiment-state")).toHaveText("Queued");
  await capture("1440-experiments-queued");
  await expect(experimentPanel.locator(".experiment-state")).toHaveText("Running");
  await capture("1440-experiments-running");
  await expect(experimentPanel.locator(".experiment-state")).toHaveText("Completed");
  await expect(experimentPanel.getByRole("button", { name: "Download definition" })).toBeVisible();
  await capture("1440-experiments-completed");

  await selectWorkspaceTool(page, "RF Diagnostics");
  await capture("1440-rf-diagnostics-canonical");
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  const researchViews = page.locator(".rf-diagnostics-research");
  await researchViews.getByRole("button", { name: "Validation" }).click();
  await expect(page.getByRole("region", { name: "RF diagnostics and measurement validation" })).toBeVisible();
  await capture("1440-rf-diagnostics-validation");
  await researchViews.getByRole("button", { name: "Materials" }).click();
  await expect(page.getByRole("region", { name: "Material and facade interaction reference" })).toBeVisible();
  await capture("1440-rf-diagnostics-materials");
  await researchViews.getByRole("button", { name: "Reflection" }).click();
  await expect(page.getByRole("region", { name: "Specular reflection reference" })).toBeVisible();
  await capture("1440-rf-diagnostics-reflection");
  await selectWorkspaceTool(page, "Building entry");
  await expect(page.getByRole("region", { name: "Building entry analysis" })).toBeVisible();
  await capture("1440-building-entry");
  await selectWorkspaceTool(page, "5G Core");
  await expect(page.getByRole("region", { name: "5G Core Lab" })).toBeVisible();
  await capture("1440-core-lab");

  await selectWorkspaceTool(page, "Results");
  await expect(page.getByRole("tab", { name: "RF", exact: true })).toHaveAttribute("aria-selected", "true");
  await capture("1440-results-rf-unavailable");
  await page.getByRole("tab", { name: "Candidates" }).click();
  await capture("1440-results-candidates");
  await selectWorkspaceTool(page, "Propagation");
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByRole("button", { name: "Optimize Network" })).toBeEnabled();
  await selectWorkspaceTool(page, "Results");
  await page.getByRole("tab", { name: "Optimization" }).click();
  await expect(page.getByRole("region", { name: "Network optimization summary" })).toBeVisible();
  await capture("1440-results-optimization");
  await page.getByText("Configuration changes").click();
  await capture("1440-results-configuration-details");
  await page.getByRole("tab", { name: "Solutions" }).click();
  await expect(page.getByRole("region", { name: "Pareto alternative solutions" })).toBeVisible();
  await capture("1440-results-pareto");

  await selectWorkspaceTool(page, "Run history");
  const runHistory = page.getByRole("region", { name: "Durable local run history" });
  await expect(runHistory.locator(".run-history-row").first()).toBeVisible();
  await capture("1440-run-history-list");
  await runHistory.locator(".run-history-row").first().click();
  await expect(runHistory.locator(".run-history-detail")).toBeVisible();
  await capture("1440-run-history-detail");

  await selectWorkspaceTool(page, "Data");
  await expect(page.getByRole("heading", { name: "Demand surface" })).toBeVisible();
  await capture("1440-data-primary");
  await page.getByText(/^Dataset details/).click();
  await capture("1440-data-dataset-details");
  await page.getByText("Details / Provenance").click();
  await capture("1440-data-provenance");
  await page.getByText("Developer details").click();
  await capture("1440-data-developer-details");
  await page.getByRole("button", { name: "Advanced model details" }).click();
  await capture("1440-data-advanced-model-details");
  await page.getByRole("button", { name: "Research / reference" }).click();
  await capture("1440-data-research-reference");
  await selectWorkspaceTool(page, "Report");
  await expect(page.getByRole("region", { name: "Planning report export" })).toBeVisible();
  await capture("1440-report");

  for (const [width, height] of [[1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const tool of ["Scenarios", "RF Diagnostics", "Results", "Run history", "Data"]) {
      await selectWorkspaceTool(page, tool);
      if (tool === "RF Diagnostics") {
        const research = page.getByRole("button", { name: /^Research \/ reference/ });
        if (await research.isVisible() && await research.getAttribute("aria-expanded") !== "true") await research.click();
        const switcher = page.locator(".rf-diagnostics-research");
        if (await switcher.count()) await switcher.getByRole("button", { name: "Validation" }).click();
      }
      if (tool === "Results") await page.getByRole("tab", { name: "Optimization" }).click();
      const name = tool.toLowerCase().replaceAll(" ", "-");
      await capture(`${width}-${name}`);
      const measurement = measurements.at(-1);
      expect(measurement.documentOverflowX).toBeLessThanOrEqual(1);
      if (measurement.drawerBody) expect(measurement.drawerBody.scrollWidth).toBeLessThanOrEqual(measurement.drawerBody.clientWidth + 1);
    }
  }

  await writeFile(resolve(cwd(), "../docs/concept-8f-responsive-evidence.json"), `${JSON.stringify({ concept: "8F", viewports: [1440, 1024, 768, 390], screenshots, measurements }, null, 2)}\n`);
  await writeFile(resolve(cwd(), "../docs/concept-8f-density-evidence.json"), `${JSON.stringify({ concept: "8F", captureMethod: "Playwright DOM measurements from the visible workspace drawer", measures: ["persistent visible sections", "drawer client/scroll height", "primary actions", "top-level content cards", "visible empty states", "open technical details"], measurements }, null, 2)}\n`);
});

function point(id, cellID, longitude, latitude) {
  return {
    type: "Feature",
    id,
    properties: { cell_id: cellID, radio_type: "5G", is_simulated: false },
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  };
}

function projectMapPoint(longitude, latitude, zoom) {
  const scale = 256 * 2 ** zoom;
  const x = ((longitude + 180) / 360) * scale;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) * scale;
  return { x, y };
}

// Concept 8H regressions exercise presentation ownership against the existing RF fixtures.
test("Concept 8H keeps the primary action through every stage and runs the empty-state sector action", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|evaluate-network|simulate|optimize-network|interference)/.test(request.url())) requests.push(request);
  });
  await page.goto("/");
  const action = page.locator(".command-primary-action").getByRole("button", { name: "Run Sector" });
  await expect(action).toBeEnabled();
  const initial = await action.boundingBox();
  for (const tool of ["Inventory", "Propagation", "RF Diagnostics", "Results"]) {
    await selectWorkspaceTool(page, tool);
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(Math.abs(box.x - initial.x)).toBeLessThan(1);
    expect(Math.abs(box.y - initial.y)).toBeLessThan(1);
  }
  expect(requests).toHaveLength(0);
  const tabs = page.getByRole("tablist", { name: "Result views" });
  const positions = await tabs.getByRole("tab").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().y));
  expect(new Set(positions).size).toBe(1);
  const viewportWidth = page.viewportSize().width;
  if (viewportWidth > 640 && viewportWidth <= 900) {
    const spatial = await page.locator(".focused-map-toolbar .spatial-tools").boundingBox();
    const display = await page.locator(".focused-map-toolbar .map-display-tools").boundingBox();
    const zoom = await page.locator(".leaflet-control-zoom").boundingBox();
    expect(display.y).toBeGreaterThanOrEqual(spatial.y + spatial.height);
    expect(zoom.y).toBeGreaterThanOrEqual(display.y + display.height);
    expect(zoom.x).toBeGreaterThanOrEqual(spatial.x - 4);
  }
  await tabs.getByRole("tab", { name: "RF", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Candidates" })).toBeFocused();
  await page.keyboard.press("Home");
  await page.locator(".analysis-empty-state").getByRole("button", { name: "Run Sector" }).click();
  await expect(page.getByRole("dialog", { name: "Results" })).toContainText("-72.0 dBm");
  expect(requests.filter((request) => request.url().includes("/api/analyze-sector"))).toHaveLength(1);
});

test("Concept 8H keeps Network evaluation accessible from Review and integrates selected Cell numbers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Marker center geometry is measured once on desktop");
  await page.route("**/api/evaluate-network", (route) => route.fulfill({ json: networkOptimization }));
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/evaluate-network")) requests.push(request);
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapInteraction(page, "Select cells");
  await clickMapPoint(page, 32.854, 39.922);
  await expect(page.locator(".tower-order-badge")).toHaveCount(2);
  const markers = await page.locator(".tower-order-badge").evaluateAll((elements) => elements.map((element) => {
    const icon = element.getBoundingClientRect();
    const number = element.firstElementChild.getBoundingClientRect();
    return { text: element.textContent.trim(), centerOffsetX: Math.abs(icon.x + icon.width / 2 - number.x - number.width / 2), centerOffsetY: Math.abs(icon.y + icon.height / 2 - number.y - number.height / 2), active: element.classList.contains("active-selected") };
  }));
  expect(markers.map(({ text }) => text)).toEqual(["1", "2"]);
  expect(markers.every(({ centerOffsetX, centerOffsetY }) => centerOffsetX < 1 && centerOffsetY < 1)).toBe(true);
  expect(markers.filter(({ active }) => active)).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Clear selected cluster" })).toHaveAttribute("title");
  await expect(page.getByRole("button", { name: "Fit selected cells" })).toHaveAttribute("title");
  await selectWorkspaceTool(page, "Results");
  await expect(page.locator(".analysis-empty-state")).toContainText("Evaluate the current 2-cell network");
  await expect(page.locator(".command-primary-action").getByRole("button", { name: "Evaluate Network" })).toBeEnabled();
  await page.locator(".analysis-empty-state").getByRole("button", { name: "Evaluate Network" }).click();
  await expect(page.getByRole("dialog", { name: "Results" })).toContainText("Single configuration evaluation");
  expect(requests).toHaveLength(1);
  expect(requests[0].postDataJSON().towers.map((tower) => tower.id)).toEqual(["cell-1", "cell-2"]);
});

test("Concept 8H stage menus close consistently and preserve the plan, viewport, freshness and Run", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Desktop flyout and persisted plan invariance");
  const computeRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|evaluate-network|simulate|optimize-network|interference)/.test(request.url())) computeRequests.push(request.url());
  });
  const exportProject = async () => {
    await page.getByRole("button", { name: "Open project menu" }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("dialog", { name: "Project and scenarios" }).getByRole("button", { name: "Export", exact: true }).click();
    const download = await pending;
    const content = JSON.parse(await readFile(await download.path(), "utf8"));
    await page.getByRole("button", { name: "Open project menu" }).click();
    return content;
  };
  await page.goto("/");
  await page.getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await page.waitForFunction(() => new Promise((resolveReady) => {
    const request = indexedDB.open("atom-planning-workspace");
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("workspace", "readonly").objectStore("workspace").get("current");
      read.onsuccess = () => { resolveReady(read.result?.projects?.some((project) => project.draft?.plan?.selectedTowerId && project.datasetRef)); database.close(); };
    };
  }));
  await expect.poll(async () => Boolean((await exportProject()).project?.draft?.plan?.selectedTowerId)).toBe(true);
  const before = await exportProject();
  const requestCount = computeRequests.length;
  const transform = await page.locator(".leaflet-map-pane").getAttribute("style");
  const context = await page.locator(".rf-context-primary").textContent();
  const resultSource = await page.locator(".command-status").textContent();
  const placements = [];
  for (const stage of ["Plan", "Simulate", "Analyze", "Review"]) {
    const trigger = page.getByRole("button", { name: `${stage} workspace` });
    await trigger.click();
    const menu = page.getByRole("dialog", { name: `${stage} tools` });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS("transform", "none");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute("title");
    const box = await menu.boundingBox();
    placements.push([box.x, box.y]);
    const zoom = await page.locator(".leaflet-control-zoom").boundingBox();
    expect(box.x + box.width <= zoom.x || box.y + box.height <= zoom.y || box.x >= zoom.x + zoom.width).toBe(true);
    await trigger.click();
    await expect(menu).toBeHidden();
    await trigger.focus();
    await trigger.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.locator(".command-brand").click();
    await expect(menu).toBeHidden();
  }
  expect(new Set(placements.map(([x, y]) => `${x},${y}`)).size).toBe(1);
  expect(await exportProject()).toEqual(before);
  expect(computeRequests.length).toBe(requestCount);
  await expect(page.locator(".leaflet-map-pane")).toHaveAttribute("style", transform);
  expect(await page.locator(".rf-context-primary").textContent()).toBe(context);
  expect(await page.locator(".command-status").textContent()).toBe(resultSource);
  expect(await page.locator(".rail-badge").count()).toBe(0);
});

test("basemap switching preserves viewport, selection, inspection, result and exported identity", async ({ page }) => {
  test.setTimeout(60_000);
  // Remote pixels are irrelevant to contracts; real raster evidence has a separate capture gate.
  const tile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8VIAAAAASUVORK5CYII=", "base64");
  await page.route(/https:\/\/(tile\.openstreetmap\.org|tiles\.stadiamaps\.com)\//, (route) => route.fulfill({ body: tile, contentType: "image/png" }));
  const requests = [];
  page.on("request", (request) => { if (request.url().includes("/api/")) requests.push([request.url(), request.postData()]); });
  await page.goto("/");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapInteraction(page, "Select cells");
  await clickMapPoint(page, 32.854, 39.922);
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 2 cells");
  await selectMapInteraction(page, "Inspect");
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  await page.getByRole("button", { name: "Close inspector" }).click();
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Single sector mode" }).click();
  await page.getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  if (await page.getByRole("button", { name: "Close tool drawer" }).isVisible()) await page.getByRole("button", { name: "Close tool drawer" }).click();
  await waitForBasemap(page);
  const exportProject = async () => {
    await page.getByRole("button", { name: "Open project menu" }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("dialog", { name: "Project and scenarios" }).getByRole("button", { name: "Export", exact: true }).click();
    const download = await pending;
    const data = JSON.parse(await readFile(await download.path(), "utf8"));
    await page.getByRole("button", { name: "Open project menu" }).click();
    return data;
  };
  await expect.poll(async () => (await exportProject()).project?.draft?.plan?.planningMode).toBe("single");
  await page.locator(".leaflet-control-zoom-in").click();
  await waitForBasemap(page);
  await page.locator(".leaflet-container").press("ArrowLeft");
  await waitForBasemap(page);
  const exported = await exportProject();
  await selectBasemap(page, "OpenStreetMap");
  await waitForBasemap(page);
  const before = await basemapSnapshot(page);
  const count = requests.length;
  for (const [label, css] of [["Alidade Smooth", "atom-basemap-alidade"], ["OpenStreetMap", "atom-basemap-osm"]]) {
    await selectBasemap(page, label);
    await waitForBasemap(page);
    await expect(page.locator(`.${css}`)).toHaveCount(1);
    const after = await basemapSnapshot(page);
    for (const field of ["mapTransform", "tileViewport", "tiles", "overlayCanvasHashes", "palette", "selectedMarkers", "overlayHTML", "markerHTML", "context", "status", "primary"]) expect(after[field], field).toEqual(before[field]);
    expect(after.paneFilters.every((filter) => filter === "none")).toBe(true);
    expect(after.layerCount).toBe(1);
    expect(after.filter).toBe(label === "OpenStreetMap" ? "saturate(0.62) contrast(0.94) brightness(1.03)" : "none");
    expect(after.attribution.includes("Stadia Maps")).toBe(label === "Alidade Smooth");
    expect(after.attribution.includes("OpenMapTiles")).toBe(label === "Alidade Smooth");
    expect(after.attribution).toContain("OpenStreetMap");
    expect(await exportProject()).toEqual(exported);
    expect(requests.length).toBe(count);
  }
  for (const theme of ["Dark", "Light", "System"]) {
    await selectTheme(page, theme);
    await waitForBasemap(page);
    const after = await basemapSnapshot(page);
    for (const field of ["mapTransform", "tileViewport", "selectedMarkers", "scientificPalette", "signalImages", "context", "status", "primary"]) expect(after[field], `theme ${theme}: ${field}`).toEqual(before[field]);
    expect(after.paneFilters.every((filter) => filter === "none")).toBe(true);
    expect(after.layerCount).toBe(1);
    expect(await exportProject()).toEqual(exported);
    expect(requests.length).toBe(count);
  }
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 2 cells");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapFocus(page, "cell-2");
  await inspectMapFocus(page);
  const inspected = await basemapSnapshot(page);
  for (const theme of ["Dark", "Light"]) {
    await selectTheme(page, theme);
    await waitForBasemap(page);
    const after = await basemapSnapshot(page);
    expect(after.selectedMarkers).toEqual(inspected.selectedMarkers);
    expect(after.mapTransform).toEqual(inspected.mapTransform);
    expect(after.tileViewport).toEqual(inspected.tileViewport);
    await expect(page.getByRole("complementary", { name: "Cell inspector" })).toBeVisible();
    await openMapView(page);
    await expect(page.getByRole("combobox", { name: "Map focus cell" })).toHaveValue("cell-2");
    await page.getByRole("button", { name: "Map view options" }).click();
  }
  for (const label of ["Alidade Smooth", "OpenStreetMap"]) {
    await selectBasemap(page, label);
    await waitForBasemap(page);
    const after = await basemapSnapshot(page);
    expect(after.overlayHTML).toEqual(inspected.overlayHTML);
    expect(after.markerHTML).toEqual(inspected.markerHTML);
    await expect(page.getByRole("complementary", { name: "Cell inspector" })).toBeVisible();
  }
});

test("captures Alidade basemap comparison evidence", async ({ page }, testInfo) => {
  const phase = env.ATOM_BASEMAP_CAPTURE;
  test.skip(phase !== "1", "Set ATOM_BASEMAP_CAPTURE=1 to capture real raster comparisons");
  test.skip(testInfo.project.name !== "desktop-1440", "Capture the reference states once");
  test.setTimeout(300_000);
  const directory = resolve(cwd(), "../docs/assets/basemap-alidade");
  const tileDirectory = "/tmp/atom-basemap-tiles";
  await mkdir(directory, { recursive: true });
  await mkdir(tileDirectory, { recursive: true });
  const features = [
    point("tower-1", "cell-1", 32.850, 39.920),
    point("tower-2", "cell-2", 32.870, 39.920),
    point("tower-3", "cell-3", 32.890, 39.920),
    point("tower-4", "cell-4", 32.850, 39.940),
    point("tower-5", "cell-5", 32.870, 39.940),
    point("tower-6", "cell-6", 32.890, 39.940),
    ...Array.from({ length: 36 }, (_, index) => point(`dense-${index}`, `sogutozu-${index}`, 32.800 + (index % 6) * 0.0015, 39.911 + Math.floor(index / 6) * 0.0015)),
  ];
  await page.route("**/api/towers", (route) => route.fulfill({ json: { type: "FeatureCollection", features } }));
  // Bound remote fetch concurrency; cache only successful real PNG responses.
  const fetchSlots = Array.from({ length: 4 }, () => Promise.resolve());
  let fetchSlot = 0;
  // The same cached OSM tiles are used for both phases; RF fixtures remain local.
  await page.route(/https:\/\/(tile\.openstreetmap\.org|tiles\.stadiamaps\.com)\//, async (route) => {
    const file = resolve(tileDirectory, (new URL(route.request().url()).hostname + new URL(route.request().url()).pathname).replaceAll("/", "-"));
    try {
      let body;
      try { body = await readFile(file); } catch {
        const slot = fetchSlot++ % fetchSlots.length;
        const pending = fetchSlots[slot].then(async () => {
          const response = await route.fetch({ timeout: 30_000 });
          if (!response.ok()) throw new Error(`Tile unavailable: HTTP ${response.status()}`);
          const bytes = await response.body();
          await writeFile(file, bytes);
          return bytes;
        });
        fetchSlots[slot] = pending.catch(() => {});
        body = await pending;
      }
      await route.fulfill({ body, contentType: "image/png" });
    } catch (error) { console.warn("Raster capture fetch failed", route.request().url(), error.message); await route.abort(); }
  });
  const screenshots = [];
  const measurements = [];
  const capture = async (name) => {
    console.log("Capture pair", name);
    const pair = [];
    for (const [id, label] of [["osm-standard", "OpenStreetMap"], ["alidade-smooth", "Alidade Smooth"]]) {
      await selectBasemap(page, label);
      const start = Date.now();
      await waitForBasemap(page).catch(async (error) => { console.warn("Incomplete raster", name, id, await page.evaluate(() => ({ status: document.querySelector(".map-basemap-status")?.textContent, tiles: [...document.querySelectorAll(".leaflet-tile")].map((t) => ({ url: t.src, complete: t.complete, width: t.naturalWidth, opacity: getComputedStyle(t).opacity, bounds: t.getBoundingClientRect().toJSON() })), map: document.querySelector(".leaflet-container").getBoundingClientRect().toJSON(), animations: [...document.querySelectorAll(".leaflet-zoom-anim, .leaflet-pan-anim")].map((e) => e.className) }))); throw error; });
      if (name === "plan-menu") await page.getByRole("button", { name: "Plan workspace" }).click();
      const snapshot = await basemapSnapshot(page);
      const layout = await page.evaluate(() => {
        const a = document.querySelector(".leaflet-control-attribution").getBoundingClientRect();
        const k = document.querySelector(".focused-map-legend").getBoundingClientRect();
        return { viewport: [innerWidth, innerHeight], overflowX: document.documentElement.scrollWidth - innerWidth, keyAttributionOverlap: a.left < k.right && a.right > k.left && a.top < k.bottom && a.bottom > k.top };
      });
      expect(layout.keyAttributionOverlap).toBe(false);
      expect(layout.overflowX).toBe(0);
      expect(snapshot.paneFilters.every((filter) => filter === "none")).toBe(true);
      await page.screenshot({ path: resolve(directory, `${name}-${id}.jpg`), type: "jpeg", quality: 80, animations: "disabled" });
      screenshots.push({ state: name, provider: id, file: `docs/assets/basemap-alidade/${name}-${id}.jpg` });
      measurements.push({ state: name, provider: id, loadedWaitMs: Date.now() - start, tileCount: snapshot.tiles.length, ...layout, ...snapshot });
      pair.push(snapshot);
    }
    for (const field of ["mapTransform", "tileViewport", "palette", "selectedMarkers", "overlayHTML", "markerHTML", "context", "status", "primary"]) expect(pair[1][field], `${name}: ${field}`).toEqual(pair[0][field]);
    await selectBasemap(page, "OpenStreetMap");
    await waitForBasemap(page);
  };
  const polygon = (id, lon, lat, height) => ({ type: "Feature", id, properties: { height_m: height, material: "concrete" }, geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001], [lon, lat]]] } });
  await page.route("**/api/collections/buildings/items*", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [polygon("b1", 32.865, 39.932, 18), polygon("b2", 32.875, 39.932, 24), polygon("b3", 32.885, 39.932, 32)] } }));
  await page.route("**/api/analyze-sector", (route) => route.fulfill({ json: {
    simulation: { geojson: { type: "FeatureCollection", features: Array.from({ length: 24 }, (_, i) => ({ type: "Feature", geometry: { type: "LineString", coordinates: [[32.85, 39.92], [32.85 + Math.cos(i / 24 * Math.PI * 2) * 0.006, 39.92 + Math.sin(i / 24 * Math.PI * 2) * 0.004]] }, properties: { signal_dbm: [-72, -95, -119][i % 3] } })) }, stats: { avg_rx_dbm: -95, max_distance_m: 500, total_rays: 24 } },
    coverage_gaps: { geojson: { type: "FeatureCollection", features: [] }, stats: { gap_pct: 0, gap_buildings: 0, candidate_buildings: 8 } },
  } }));
  await page.route("**/api/coverage-surface", (route) => route.fulfill({ json: {
    grid: { width: 20, height: 20, bounds: [32.84, 39.91, 32.90, 39.945], nodata: -9999, values: Array.from({ length: 400 }, (_, i) => -80 - Math.hypot(i % 20 - 10, Math.floor(i / 20) - 10) * 3) },
    contours: { type: "FeatureCollection", features: [] }, stats: { min_dbm: -120, max_dbm: -80, valid_cell_count: 400 }, model: { assumptions: ["Deterministic visual fixture; not a new RF validation"] },
  } }));
  await page.route("**/api/interference", (route) => route.fulfill({ json: {
    geojson: { type: "FeatureCollection", features: Array.from({ length: 100 }, (_, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [32.839 + i % 10 * 0.006, 39.907 + Math.floor(i / 10) * 0.004] }, properties: { sinr_db: [-5, 7, 16, 25, null][i % 5], rsrp_dbm: -90, serviceability_status: i % 5 === 4 ? "no_signal" : "serviceable" } })) },
    demand_geojson: { type: "FeatureCollection", features: [] }, stats: { avg_sinr_db: 10, serviceable_pct: 60, no_signal_count: 20 }, model: {},
  } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0 || document.querySelector(".map-basemap-status"));
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("default-map");
  await page.getByRole("button", { name: "Plan workspace" }).click();
  await capture("plan-menu");
  await selectWorkspaceTool(page, "Setup");
  await capture("setup");
  await page.getByRole("button", { name: "Simulate workspace" }).click();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Analyze workspace" }).click();

  await page.keyboard.press("Escape");
  await selectWorkspaceTool(page, "Results");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapInteraction(page, "Select cells");
  for (const feature of features.slice(1, 6)) await clickMapPoint(page, ...feature.geometry.coordinates);
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
  await capture("selected-network");
  await selectMapInteraction(page, "Inspect");
  await selectMapFocus(page, "cell-6");
  await inspectMapFocus(page);
  if (await page.getByRole("button", { name: "Map view options" }).getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: "Map view options" }).click();
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toBeVisible();
  await capture("active-selected-cell");
  await page.getByRole("button", { name: "Close inspector" }).click();
  const map = page.locator(".leaflet-container");
  await map.focus();
  for (let index = 0; index < 2; index++) {
    await map.press("ArrowLeft");
    await waitForBasemap(page);
  }
  for (let index = 0; index < 2; index++) {
    await page.locator(".leaflet-control-zoom-in").click();
    await waitForBasemap(page);
  }
  await capture("dense-sogutozu");
  await openMapView(page);
  await page.getByRole("button", { name: "Fit selected cells" }).click();
  await waitForBasemap(page);
  if (await page.getByRole("button", { name: "Map view options" }).getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: "Map view options" }).click();
  await selectMapInteraction(page, "Select cells");
  await page.getByRole("button", { name: "Draw selection area" }).click();
  const mapBox = await map.boundingBox();
  for (const [x, y] of [[0.35, 0.3], [0.6, 0.3], [0.5, 0.65]]) await map.click({ position: { x: mapBox.width * x, y: mapBox.height * y } });
  await capture("selection-polygon");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await selectWorkspaceTool(page, "Inventory");

  await selectWorkspaceTool(page, "Propagation");

  await page.getByRole("button", { name: "Map layers" }).click();
  const buildingsLoaded = page.waitForResponse((response) => response.url().includes("/api/collections/buildings/items"));
  await page.getByRole("checkbox", { name: "Viewport buildings" }).check();
  await buildingsLoaded;
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(page.getByRole("checkbox", { name: "Viewport buildings" })).not.toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane canvas")).toBeVisible();
  await capture("building-overlay");
  await selectWorkspaceTool(page, "Interference");
  await page.getByRole("button", { name: "Analyze Interference" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("sinr");
  await selectWorkspaceTool(page, "RF Diagnostics");
  await capture("rf-diagnostics");
  await selectWorkspaceTool(page, "Setup");

  await selectWorkspaceTool(page, "Results");

  for (const [width, height] of [[1366, 768], [1512, 982], [390, 844]]) {
    await page.setViewportSize({ width, height });
    if (width === 390 && await page.getByRole("button", { name: "Close tool drawer" }).isVisible()) await page.getByRole("button", { name: "Close tool drawer" }).click();
    const keyToggle = page.getByRole("region", { name: "Map key" }).getByRole("button");
    if (await keyToggle.getAttribute("aria-expanded") === "false") await keyToggle.click();
    await capture(`review-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Single sector mode" }).click();
  await page.locator(".command-primary-action").getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await selectWorkspaceTool(page, "Results");
  await capture("review-current");
  await page.getByRole("button", { name: "Signal layer" }).click();
  await expect(page.getByRole("button", { name: "Signal layer" })).toHaveAttribute("data-surface-state", "ready");
  await page.getByRole("button", { name: "Propagation rays layer" }).click();
  await expect(page.getByRole("button", { name: "Propagation rays layer" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("signal-rays");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await selectWorkspaceTool(page, "Results");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "4G LTE, 2.6 GHz" }).click();
  await page.getByRole("button", { name: "Analyze workspace" }).click();

  await writeFile(resolve(directory, "evidence.json"), `${JSON.stringify({ task: "basemap-alidade", capturedAt: new Date().toISOString(), fixtures: "42 Cells including 36 dense Söğütözü positions; deterministic RF/building fixtures; real provider raster tiles", screenshots, measurements }, null, 2)}\n`);
});

test("captures matched theme comparison evidence", async ({ page }, testInfo) => {
  const phase = env.ATOM_THEME_CAPTURE;
  test.skip(phase !== "1", "Set ATOM_THEME_CAPTURE=1 to capture real raster comparisons");
  test.skip(testInfo.project.name !== "desktop-1440", "Capture the reference states once");
  test.setTimeout(300_000);
  const directory = resolve(cwd(), "../docs/assets/dark-mode");
  const tileDirectory = "/tmp/atom-basemap-tiles";
  await mkdir(directory, { recursive: true });
  await mkdir(tileDirectory, { recursive: true });
  const features = [
    point("tower-1", "cell-1", 32.850, 39.920),
    point("tower-2", "cell-2", 32.870, 39.920),
    point("tower-3", "cell-3", 32.890, 39.920),
    point("tower-4", "cell-4", 32.850, 39.940),
    point("tower-5", "cell-5", 32.870, 39.940),
    point("tower-6", "cell-6", 32.890, 39.940),
    ...Array.from({ length: 36 }, (_, index) => point(`dense-${index}`, `sogutozu-${index}`, 32.800 + (index % 6) * 0.0015, 39.911 + Math.floor(index / 6) * 0.0015)),
  ];
  await page.route("**/api/towers", (route) => route.fulfill({ json: { type: "FeatureCollection", features } }));
  // Bound remote fetch concurrency; cache only successful real PNG responses.
  const fetchSlots = Array.from({ length: 4 }, () => Promise.resolve());
  let fetchSlot = 0;
  // The same cached OSM tiles are used for both phases; RF fixtures remain local.
  await page.route(/https:\/\/(tile\.openstreetmap\.org|tiles\.stadiamaps\.com)\//, async (route) => {
    const file = resolve(tileDirectory, (new URL(route.request().url()).hostname + new URL(route.request().url()).pathname).replaceAll("/", "-"));
    try {
      let body;
      try { body = await readFile(file); } catch {
        const slot = fetchSlot++ % fetchSlots.length;
        const pending = fetchSlots[slot].then(async () => {
          const response = await route.fetch({ timeout: 30_000 });
          if (!response.ok()) throw new Error(`Tile unavailable: HTTP ${response.status()}`);
          const bytes = await response.body();
          await writeFile(file, bytes);
          return bytes;
        });
        fetchSlots[slot] = pending.catch(() => {});
        body = await pending;
      }
      await route.fulfill({ body, contentType: "image/png" });
    } catch (error) { console.warn("Raster capture fetch failed", route.request().url(), error.message); await route.abort(); }
  });
  const writeCapture = await createThemeCaptureWriter(resolve(cwd(), ".."), directory);
  const incumbentCSS = execFileSync("git", ["show", "7765e62:frontend-react/src/styles.css"], { encoding: "utf8" });
  const lightBaselineChecks = [];
  const refreshState = env.ATOM_THEME_CAPTURE_STATE;
  const screenshots = [];
  const measurements = [];
  const capture = async (name) => {
    if (refreshState && name !== refreshState) return;
    console.log("Capture pair", name);
    const pair = [];
    for (const [id, label] of [["light", "Light"], ["dark", "Dark"]]) {
      await selectTheme(page, label);
      const start = Date.now();
      await waitForBasemap(page).catch(async (error) => { console.warn("Incomplete raster", name, id, await page.evaluate(() => ({ status: document.querySelector(".map-basemap-status")?.textContent, tiles: [...document.querySelectorAll(".leaflet-tile")].map((t) => ({ url: t.src, complete: t.complete, width: t.naturalWidth, opacity: getComputedStyle(t).opacity, bounds: t.getBoundingClientRect().toJSON() })), map: document.querySelector(".leaflet-container").getBoundingClientRect().toJSON(), animations: [...document.querySelectorAll(".leaflet-zoom-anim, .leaflet-pan-anim")].map((e) => e.className) }))); throw error; });
      if (name === "map-view-popover") await openMapView(page);
      if (name.startsWith("appearance-and-layers")) await page.getByRole("button", { name: "Map layers" }).click();
      if (name === "plan-menu") await page.getByRole("button", { name: "Plan workspace" }).click();
      const snapshot = await basemapSnapshot(page);
      const layout = await page.evaluate(() => {
        const a = document.querySelector(".leaflet-control-attribution").getBoundingClientRect();
        const k = document.querySelector(".focused-map-legend").getBoundingClientRect();
        return { viewport: [innerWidth, innerHeight], overflowX: document.documentElement.scrollWidth - innerWidth, keyAttributionOverlap: a.left < k.right && a.right > k.left && a.top < k.bottom && a.bottom > k.top };
      });
      expect(layout.keyAttributionOverlap).toBe(false);
      expect(layout.overflowX).toBe(0);
      expect(snapshot.paneFilters.every((filter) => filter === "none")).toBe(true);
      if (id === "light" && !name.startsWith("appearance-and-layers")) {
        // Compare the current light shell against the pre-theme basemap commit in place.
        const styleSignature = () => page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getClientRects().length && !e.closest(".leaflet-tile-pane")).map((e) => {
          const css = getComputedStyle(e);
          return [...css].map((property) => [property, css.getPropertyValue(property)]);
        }));
        const settleStyles = () => page.waitForFunction(() => !document.getAnimations().some((animation) => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity));
        await settleStyles();
        const currentStyles = await styleSignature();
        const current = await page.screenshot({ animations: "disabled" });
        await page.evaluate((css) => {
          const style = document.createElement("style");
          style.id = "incumbent-light-baseline";
          style.textContent = css;
          document.head.append(style);
        }, incumbentCSS);
        await settleStyles();
        const incumbent = await page.screenshot({ animations: "disabled" });
        const oldStyles = await styleSignature();
        await page.locator("#incumbent-light-baseline").evaluate((element) => element.remove());
        expect(JSON.stringify(currentStyles) === JSON.stringify(oldStyles), `${name}: unchanged computed light styles`).toBe(true);
        const difference = await page.evaluate(async (sources) => {
          const pixels = await Promise.all(sources.map(async (src) => {
            const img = new Image(); img.src = src; await img.decode();
            const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, img.width, img.height).data;
          }));
          let changedPixels = 0; let maxChannelDelta = 0;
          for (let i = 0; i < pixels[0].length; i += 4) {
            const delta = Math.max(...[0, 1, 2].map((channel) => Math.abs(pixels[0][i + channel] - pixels[1][i + channel])));
            if (delta) changedPixels++;
            maxChannelDelta = Math.max(maxChannelDelta, delta);
          }
          return { changedPixels, maxChannelDelta };
        }, [current, incumbent].map((bytes) => `data:image/png;base64,${bytes.toString("base64")}`));
        // Chromium can round a few composited corner pixels by up to two 8-bit values.
        expect(difference.maxChannelDelta, `${name}: unchanged light pixels`).toBeLessThanOrEqual(2);
        const viewport = page.viewportSize();
        expect(difference.changedPixels / (viewport.width * viewport.height), `${name}: only negligible corner rounding`).toBeLessThan(0.002);
        lightBaselineChecks.push({ state: name, computedStylesIdentical: true, ...difference, baseline: "7765e62" });
      }
      const file = await writeCapture(`${name}-${id}`, await page.screenshot({ type: "jpeg", quality: 80, animations: "disabled" }));
      screenshots.push({ state: name, theme: id, provider: id === "dark" ? "alidade-smooth-dark" : "alidade-smooth", file });
      measurements.push({ state: name, provider: id, loadedWaitMs: Date.now() - start, tileCount: snapshot.tiles.length, ...layout, ...snapshot });
      pair.push(snapshot);
      if (name.startsWith("appearance-and-layers")) await page.getByRole("button", { name: "Map layers" }).click();
    }
    for (const field of ["mapTransform", "tileViewport", "selectedMarkers", "scientificPalette", "signalImages", "context", "status", "primary"]) expect(pair[1][field], `${name}: ${field}`).toEqual(pair[0][field]);
    await selectTheme(page, "Light");
    await waitForBasemap(page);
  };
  const polygon = (id, lon, lat, height) => ({ type: "Feature", id, properties: { height_m: height, material: "concrete" }, geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001], [lon, lat]]] } });
  await page.route("**/api/collections/buildings/items*", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [polygon("b1", 32.865, 39.932, 18), polygon("b2", 32.875, 39.932, 24), polygon("b3", 32.885, 39.932, 32)] } }));
  await page.route("**/api/analyze-sector", (route) => route.fulfill({ json: {
    simulation: { geojson: { type: "FeatureCollection", features: Array.from({ length: 24 }, (_, i) => ({ type: "Feature", geometry: { type: "LineString", coordinates: [[32.85, 39.92], [32.85 + Math.cos(i / 24 * Math.PI * 2) * 0.006, 39.92 + Math.sin(i / 24 * Math.PI * 2) * 0.004]] }, properties: { signal_dbm: [-72, -95, -119][i % 3] } })) }, stats: { avg_rx_dbm: -95, max_distance_m: 500, total_rays: 24 } },
    coverage_gaps: { geojson: { type: "FeatureCollection", features: [] }, stats: { gap_pct: 0, gap_buildings: 0, candidate_buildings: 8 } },
  } }));
  await page.route("**/api/coverage-surface", (route) => route.fulfill({ json: {
    grid: { width: 20, height: 20, bounds: [32.84, 39.91, 32.90, 39.945], nodata: -9999, values: Array.from({ length: 400 }, (_, i) => -80 - Math.hypot(i % 20 - 10, Math.floor(i / 20) - 10) * 3) },
    contours: { type: "FeatureCollection", features: [] }, stats: { min_dbm: -120, max_dbm: -80, valid_cell_count: 400 }, model: { assumptions: ["Deterministic visual fixture; not a new RF validation"] },
  } }));
  await page.route("**/api/interference", (route) => route.fulfill({ json: {
    geojson: { type: "FeatureCollection", features: Array.from({ length: 100 }, (_, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [32.839 + i % 10 * 0.006, 39.907 + Math.floor(i / 10) * 0.004] }, properties: { sinr_db: [-5, 7, 16, 25, null][i % 5], rsrp_dbm: [-105, -95, -85, -75, null][i % 5], rsrq_db: [-23, -18, -13, -8, null][i % 5], serviceability_status: i % 5 === 4 ? "no_signal" : "serviceable" } })) },
    demand_geojson: { type: "FeatureCollection", features: [] }, stats: { avg_sinr_db: 10, serviceable_pct: 60, no_signal_count: 20 }, model: {},
  } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0 || document.querySelector(".map-basemap-status"));
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("default-map");
  await page.getByRole("button", { name: "Plan workspace" }).click();
  await capture("plan-menu");
  await selectWorkspaceTool(page, "Setup");
  await capture("setup");
  const layers = page.getByRole("button", { name: "Map layers" });
  await capture("appearance-and-layers");
  if (await layers.getAttribute("aria-expanded") === "true") await layers.click();
  await page.getByRole("button", { name: "Simulate workspace" }).click();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Analyze workspace" }).click();

  await page.keyboard.press("Escape");
  await selectWorkspaceTool(page, "Results");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapInteraction(page, "Select cells");
  for (const feature of features.slice(1, 6)) await clickMapPoint(page, ...feature.geometry.coordinates);
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
  await capture("selected-network");
  await selectMapInteraction(page, "Inspect");
  await selectMapFocus(page, "cell-6");
  await inspectMapFocus(page);
  if (await page.getByRole("button", { name: "Map view options" }).getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: "Map view options" }).click();
  await expect(page.getByRole("complementary", { name: "Cell inspector" })).toBeVisible();
  await capture("active-selected-cell");
  await page.getByRole("button", { name: "Close inspector" }).click();
  const map = page.locator(".leaflet-container");
  await map.focus();
  for (let index = 0; index < 2; index++) {
    await map.press("ArrowLeft");
    await waitForBasemap(page);
  }
  for (let index = 0; index < 2; index++) {
    await page.locator(".leaflet-control-zoom-in").click();
    await waitForBasemap(page);
  }
  await capture("dense-sogutozu");
  await openMapView(page);
  await page.getByRole("button", { name: "Fit selected cells" }).click();
  await waitForBasemap(page);
  if (await page.getByRole("button", { name: "Map view options" }).getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: "Map view options" }).click();
  await selectMapInteraction(page, "Select cells");
  await page.getByRole("button", { name: "Draw selection area" }).click();
  const mapBox = await map.boundingBox();
  for (const [x, y] of [[0.35, 0.3], [0.6, 0.3], [0.5, 0.65]]) await map.click({ position: { x: mapBox.width * x, y: mapBox.height * y } });
  await capture("selection-polygon");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await selectWorkspaceTool(page, "Inventory");

  await selectWorkspaceTool(page, "Propagation");

  await page.getByRole("button", { name: "Map layers" }).click();
  const buildingsLoaded = page.waitForResponse((response) => response.url().includes("/api/collections/buildings/items"));
  await page.getByRole("checkbox", { name: "Viewport buildings" }).check();
  await buildingsLoaded;
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(page.getByRole("checkbox", { name: "Viewport buildings" })).not.toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane canvas")).toBeVisible();
  await capture("building-overlay");
  await selectWorkspaceTool(page, "Interference");
  await page.getByRole("button", { name: "Analyze Interference" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("sinr");
  for (const [metric, label] of [["rsrp", "RSRP"], ["rsrq", "RSRQ"]]) {
    await openMapView(page);
    await page.getByRole("combobox", { name: "Radio-quality metric" }).selectOption(metric);
    await page.getByRole("button", { name: "Map view options" }).click();
    await capture(label.toLowerCase());
  }
  await openMapView(page);
  await capture("map-view-popover");
  await page.getByRole("button", { name: "Map view options" }).click();
  await selectWorkspaceTool(page, "RF Diagnostics");
  await capture("rf-diagnostics");
  await selectWorkspaceTool(page, "Setup");

  await selectWorkspaceTool(page, "Results");

  for (const [width, height] of [[1366, 768], [1512, 982], [390, 844]]) {
    await page.setViewportSize({ width, height });
    if (width === 390 && await page.getByRole("button", { name: "Close tool drawer" }).isVisible()) await page.getByRole("button", { name: "Close tool drawer" }).click();
    const keyToggle = page.getByRole("region", { name: "Map key" }).getByRole("button");
    if (await keyToggle.getAttribute("aria-expanded") === "false") await keyToggle.click();
    await capture(`review-${width}`);
    if (width === 390) {
      await selectWorkspaceTool(page, "Setup");
      await capture("mobile-setup");
      await page.getByRole("button", { name: "Close tool drawer" }).click();
      await capture("appearance-and-layers-mobile");
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Single sector mode" }).click();
  await page.locator(".command-primary-action").getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await selectWorkspaceTool(page, "Results");
  await capture("review-current");
  await page.getByRole("button", { name: "Signal layer" }).click();
  await expect(page.getByRole("button", { name: "Signal layer" })).toHaveAttribute("data-surface-state", "ready");
  await page.getByRole("button", { name: "Propagation rays layer" }).click();
  await expect(page.getByRole("button", { name: "Propagation rays layer" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await capture("signal-rays");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }).fill("31");
  await selectWorkspaceTool(page, "Results");

  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "4G LTE, 2.6 GHz" }).click();
  await page.getByRole("button", { name: "Analyze workspace" }).click();

  const previous = refreshState ? JSON.parse(await readFile(resolve(directory, "evidence.json"), "utf8")) : null;
  const merged = (field, values) => previous ? [...previous[field].filter((record) => record.state !== refreshState), ...values] : values;
  await writeFile(resolve(directory, "evidence.json"), `${JSON.stringify({ task: "dark-mode", capturedAt: new Date().toISOString(), fixtures: "42 Cells including 36 dense Söğütözü positions; deterministic RF/building fixtures; real provider raster tiles", screenshots: merged("screenshots", screenshots), measurements: merged("measurements", measurements), lightBaselineChecks: merged("lightBaselineChecks", lightBaselineChecks) }, null, 2)}\n`);
});

test("failed Alidade tiles stay observable and OSM remains selectable", async ({ page }) => {
  await page.route("**/tiles.stadiamaps.com/**", (route) => route.fulfill({ status: 401, body: "Provider authentication required" }));
  await page.goto("/");
  await selectBasemap(page, "Alidade Smooth");
  await expect(page.locator(".map-basemap-status")).toContainText("Alidade Smooth: Base map unavailable");
  await expect(page.locator(".map-basemap-status")).toContainText("choose OpenStreetMap in Layers");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await expect(page.locator(".atom-basemap-alidade")).toHaveCount(1);
  await selectBasemap(page, "OpenStreetMap");
  await expect(page.locator(".atom-basemap-osm")).toHaveCount(1);
  await expect(page.locator(".atom-basemap-alidade")).toHaveCount(0);
  await expect(page.locator(".leaflet-control-attribution")).not.toContainText("Stadia Maps");
});


test("theme persistence and system changes select the matching provider without resetting presentation", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".atom-basemap-dark")).toHaveCount(1);
  await selectTheme(page, "Light");
  await selectBasemap(page, "OpenStreetMap");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await selectTheme(page, "Dark");
  await expect(page.locator(".atom-basemap-dark")).toHaveCount(1);
  await selectBasemap(page, "OpenStreetMap");
  await selectTheme(page, "Light");
  await expect(page.locator(".atom-basemap-osm")).toHaveCount(1);
  await selectTheme(page, "Dark");
  await expect(page.locator(".atom-basemap-osm")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".atom-basemap-dark")).toHaveCount(1);
  await selectTheme(page, "System");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".atom-basemap-alidade")).toHaveCount(1);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".atom-basemap-dark")).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("atom.theme"))).toBe("system");
});


test("theme controls stay reachable above an open phone drawer with keyboard and pointer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Phone drawer stacking regression");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();
  await selectTheme(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Map layers" });
  await trigger.click();
  const dark = page.getByRole("group", { name: "Appearance" }).getByRole("radio", { name: "Dark", exact: true });
  await dark.focus();
  await dark.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "System", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.locator(".layer-menu")).toHaveCount(0);
});

test("dark shell text and control contrast meet the practical WCAG targets", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const inspectContrast = async () => page.evaluate(() => {
    const rgb = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = (color) => rgb(color).map((c) => c / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); };
    const backdrop = (e) => {
      for (let node = e; node; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        if (!bg.startsWith("rgba") && bg !== "transparent") return bg;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const selectors = [".command-brand strong", ".command-brand small", ".rf-context-primary", ".run-state", ".command-run-button", ".tool-drawer-header h2", ".tool-drawer-header p", ".field-group label", ".selection-note", ".number-wrap input", ".segmented-control button", ".focused-map-legend", ".layer-menu label"];
    const text = selectors.flatMap((selector) => [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => ({ selector, color: getComputedStyle(e).color, background: backdrop(e), contrast: ratio(getComputedStyle(e).color, backdrop(e)) })));
    const input = document.querySelector('.number-wrap input');
    const css = getComputedStyle(input);
    return { text, inputBorder: ratio(css.borderTopColor, backdrop(input)), focus: ratio(css.outlineColor, backdrop(input)) };
  });
  await page.getByRole("button", { name: "Map layers" }).click();
  for (const sample of (await inspectContrast()).text) expect(sample.contrast, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.locator(".number-wrap input").first().focus();
  const contrast = await inspectContrast();
  expect(contrast.inputBorder).toBeGreaterThanOrEqual(3);
  expect(contrast.focus).toBeGreaterThanOrEqual(3);
  await openMapView(page);
  const scope = page.getByRole("combobox", { name: "Ray scope" });
  await expect(scope).toBeDisabled();
  await expect(scope).toHaveCSS("background-image", "none");
  await page.getByRole("button", { name: "Map view options" }).click();
  await page.getByRole("button", { name: "Run Sector" }).hover();
  for (const sample of (await inspectContrast()).text) expect(sample.contrast, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
});

test("ray and action presentation follow-up evidence", async ({ page }, testInfo) => {
  test.skip(env.ATOM_PRESENTATION_CAPTURE !== "1" && env.ATOM_PRESENTATION_BEFORE !== "1", "Set ATOM_PRESENTATION_CAPTURE=1 for matched real-tile evidence");
  test.skip(testInfo.project.name !== "desktop-1440", "Matched desktop presentation evidence");
  test.setTimeout(120_000);
  const before = env.ATOM_PRESENTATION_BEFORE === "1";
  const phase = before ? "before" : "after";
  const directory = resolve(cwd(), "../docs/assets/dark-mode-follow-up");
  await mkdir(directory, { recursive: true });
  // Capture actual Leaflet canvas stroke paths, without inspecting private map state.
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const original = {};
    for (const method of ["beginPath", "moveTo", "lineTo", "stroke", "clearRect"]) original[method] = proto[method];
    proto.beginPath = function (...args) { this.atomPath = []; return original.beginPath.apply(this, args); };
    for (const method of ["moveTo", "lineTo"]) proto[method] = function (...args) { this.atomPath?.push([method, ...args]); return original[method].apply(this, args); };
    proto.clearRect = function (...args) { this.canvas.atomStrokes = []; return original.clearRect.apply(this, args); };
    proto.stroke = function (...args) {
      if (["#10b981", "#f59e0b", "#e11d48"].includes(this.strokeStyle) && this.atomPath?.length === 2) {
        (this.canvas.atomStrokes ??= []).push({ color: this.strokeStyle, width: this.lineWidth, opacity: this.globalAlpha, path: this.atomPath });
      }
      return original.stroke.apply(this, args);
    };
  });
  await page.route(/https:\/\/(tile\.openstreetmap\.org|tiles\.stadiamaps\.com)\//, async (route) => {
    const url = new URL(route.request().url());
    const file = resolve("/tmp/atom-basemap-tiles", (url.hostname + url.pathname).replaceAll("/", "-"));
    try { await route.fulfill({ body: await readFile(file), contentType: "image/png" }); }
    catch { const response = await route.fetch(); await route.fulfill({ response }); }
  });
  const polygon = (lon, lat) => ({ type: "Feature", properties: { height_m: 24 }, geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001], [lon, lat]]] } });
  await page.route("**/api/collections/buildings/items*", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [polygon(32.843, 39.924), polygon(32.859, 39.916), polygon(32.851, 39.923)] } }));
  let rayCount = 720;
  const requests = [];
  await page.route("**/api/analyze-sector", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: {
      simulation: { geojson: { type: "FeatureCollection", features: Array.from({ length: rayCount }, (_, i) => ({ type: "Feature", properties: { signal_dbm: i % 10 < 8 ? -72 : i % 10 === 8 ? -95 : -119, propagation_class: "fixture" }, geometry: { type: "LineString", coordinates: [[32.85, 39.92], [32.85 + Math.cos(i / rayCount * Math.PI * 2) * 0.020, 39.92 + Math.sin(i / rayCount * Math.PI * 2) * 0.014]] } })) }, stats: { total_rays: rayCount, avg_rx_dbm: -80, max_distance_m: 1800 } },
      coverage_gaps: { geojson: { type: "FeatureCollection", features: [] }, stats: { gap_pct: 0 } },
    } });
  });
  await page.route("**/api/evaluate-network", (route) => route.fulfill({ json: networkOptimization }));
  await page.route("**/api/simulate", (route) => {
    const request = route.request().postDataJSON(); requests.push(request);
    const lon = request.tower_lon; const lat = request.tower_lat;
    return route.fulfill({ json: { geojson: { type: "FeatureCollection", features: Array.from({ length: 360 }, (_, i) => ({ type: "Feature", properties: { signal_dbm: i % 10 < 8 ? -72 : i % 10 === 8 ? -95 : -119 }, geometry: { type: "LineString", coordinates: [[lon, lat], [lon + Math.cos(i / 360 * Math.PI * 2) * 0.020, lat + Math.sin(i / 360 * Math.PI * 2) * 0.014]] } })) }, stats: { total_rays: 360, avg_rx_dbm: -80, max_distance_m: 1800 } } });
  });
  let finishInterference;
  const interferenceGate = new Promise((resolveGate) => { finishInterference = resolveGate; });
  await page.route("**/api/interference", async (route) => { await interferenceGate; return route.fulfill({ json: {
    geojson: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [32.856, 39.925] }, properties: { sinr_db: 16, rsrp_dbm: -85, rsrq_db: -13, serviceability_status: "serviceable" } }] }, stats: { avg_sinr_db: 16 }, model: {},
  } }); });
  await page.goto("/");
  await selectTheme(page, "Light");
  await waitForBasemap(page);
  const evidence = { phase, fixtures: "720/24 deterministic rays, unchanged semantic colors; real cached Alidade tiles; viewport buildings; selected/active Cells", screenshots: [], rays: {}, actions: {}, requests };
  const capture = async (name) => {
    const file = `${name}-${phase}.jpg`;
    await page.screenshot({ path: resolve(directory, file), type: "jpeg", quality: 85, animations: "disabled" });
    evidence.screenshots.push(file);
  };
  const raySnapshot = () => page.evaluate(() => [...document.querySelectorAll(".leaflet-overlay-pane canvas")].flatMap((canvas) => canvas.atomStrokes ?? []));
  const actionSnapshot = (button) => button.evaluate((element) => {
    const css = getComputedStyle(element); const icon = getComputedStyle(element.querySelector("svg"));
    return { disabled: element.disabled, background: css.backgroundColor, color: css.color, opacity: css.opacity, cursor: css.cursor, outline: css.outlineStyle, outlineWidth: css.outlineWidth, outlineColor: css.outlineColor, icon: icon.color };
  });
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("checkbox", { name: "Viewport buildings" }).check();
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.locator(".command-primary-action").getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  if (await page.getByRole("button", { name: "Propagation rays layer" }).getAttribute("aria-pressed") !== "true") await page.getByRole("button", { name: "Propagation rays layer" }).click();
  await expect.poll(async () => (await raySnapshot()).length).toBe(720);
  // Network selection and RSRP overlay leave the sector rays available for inspection.
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapInteraction(page, "Select cells");
  await clickMapPoint(page, 32.854, 39.922);
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await waitForBasemap(page);
  await page.locator(".command-primary-action").getByRole("button", { name: "Evaluate Network" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await selectWorkspaceTool(page, "Interference");
  const action = page.locator(".analyze-button");
  for (const theme of ["Light", "Dark"]) {
    await selectTheme(page, theme); await waitForBasemap(page);
    await expect(action).toBeEnabled();
    await page.keyboard.press("Tab"); await action.focus();
    expect(await action.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    evidence.actions[`${theme}-enabled`] = await actionSnapshot(action);
    await capture(`interference-${theme.toLowerCase()}-enabled`);
    await action.hover(); evidence.actions[`${theme}-hover`] = await actionSnapshot(action);
  }
  await action.click();
  for (const theme of ["Light", "Dark"]) {
    await selectTheme(page, theme); await waitForBasemap(page);
    await expect(action).toBeDisabled();
    evidence.actions[`${theme}-disabled`] = await actionSnapshot(action);
    await capture(`interference-${theme.toLowerCase()}-disabled`);
  }
  finishInterference();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await openMapView(page);
  await page.getByRole("combobox", { name: "Radio-quality metric" }).selectOption("rsrp");
  await page.getByRole("button", { name: "Map view options" }).click();
  for (const theme of ["Light", "Dark"]) {
    await selectTheme(page, theme); await waitForBasemap(page);
    evidence.rays[`dense-${theme}`] = await raySnapshot();
    expect(evidence.rays[`dense-${theme}`]).toHaveLength(720);
    await capture(`dense-rsrp-${theme.toLowerCase()}`);
  }
  rayCount = 24;
  await selectWorkspaceTool(page, "Setup");
  await page.getByRole("button", { name: "Single sector mode" }).click();
  await page.locator(".command-primary-action").getByRole("button", { name: "Run Sector" }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  for (const theme of ["Light", "Dark"]) {
    await selectTheme(page, theme); await waitForBasemap(page);
    evidence.rays[`sparse-${theme}`] = await raySnapshot();
    expect(evidence.rays[`sparse-${theme}`]).toHaveLength(24);
    await capture(`sparse-sector-${theme.toLowerCase()}`);
  }
  if (!before) {
    const baseline = JSON.parse(await readFile(resolve(directory, "before.json"), "utf8"));
    const geometry = (rays) => rays.map(({ color, path }) => ({ color, path }));
    for (const name of Object.keys(evidence.rays)) {
      expect(geometry(evidence.rays[name]), name).toEqual(geometry(baseline.rays[name]));
      expect(evidence.rays[name].every((ray) => ray.width === 1.25 && ray.opacity === 0.45)).toBe(true);
    }
    expect(requests).toEqual(baseline.requests);
    for (const state of ["enabled", "disabled", "hover"]) expect(evidence.actions[`Light-${state}`]).toEqual(baseline.actions[`Light-${state}`]);
    expect(evidence.actions["Dark-enabled"]).toMatchObject({ disabled: false, background: "rgb(35, 107, 99)", color: "rgb(255, 255, 255)", outline: "solid", outlineWidth: "2px", icon: "rgb(255, 255, 255)" });
    expect(evidence.actions["Dark-disabled"]).toMatchObject({ disabled: true, background: "rgb(38, 49, 57)", color: "rgb(141, 157, 150)", opacity: "1", cursor: "not-allowed" });
    expect(evidence.actions["Dark-hover"].background).not.toBe(evidence.actions["Dark-enabled"].background);
  }
  await writeFile(resolve(directory, `${phase}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
});

test("shared dark actions preserve readiness, focus and visible RF budget errors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  await page.getByRole("button", { name: "Close tool drawer" }).click();
  await selectMapInteraction(page, "Select cells");
  await clickMapPoint(page, 32.854, 39.922);
  await selectWorkspaceTool(page, "Interference");
  const button = page.locator(".analyze-button");
  const style = (locator) => locator.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, color: css.color, outline: css.outlineStyle, icon: getComputedStyle(el.querySelector("svg")).color };
  });
  await selectTheme(page, "Dark");
  await expect(button).toBeEnabled();
  await page.keyboard.press("Tab"); await button.focus();
  const enabled = await style(button);
  expect(enabled).toMatchObject({ background: "rgb(35, 107, 99)", color: "rgb(255, 255, 255)", outline: "solid", icon: "rgb(255, 255, 255)" });
  expect((await style(page.locator(".command-run-button"))).background).toBe(enabled.background);
  await button.hover();
  expect((await style(button)).background).toBe("rgb(43, 122, 112)");
  let finish;
  const gate = new Promise((resolveGate) => { finish = resolveGate; });
  let requestCount = 0;
  const message = "RF analysis request budget exceeded; retry after the current rate-limit window";
  await page.route("**/api/interference", async (route) => {
    requestCount++;
    await gate;
    await route.fulfill({ status: 429, json: { error: message } });
  });
  await button.click();
  await expect(button).toBeDisabled();
  await button.hover();
  await button.evaluate((el) => el.focus());
  expect(await button.evaluate((el) => el === document.activeElement)).toBe(false);
  expect((await style(button)).background).toBe("rgb(38, 49, 57)");
  await expect(page.locator(".command-run-button")).toBeDisabled();
  expect((await style(page.locator(".command-run-button"))).background).toBe("rgb(38, 49, 57)");
  finish();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
  for (const theme of ["Light", "Dark"]) {
    await selectTheme(page, theme);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
  }
  expect(requestCount).toBe(1);
});
