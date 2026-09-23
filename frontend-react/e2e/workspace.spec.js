import { expect, test } from "@playwright/test";

const towers = {
  type: "FeatureCollection",
  features: [
    point("tower-1", "cell-1", 32.8500, 39.9200),
    point("tower-2", "cell-2", 32.8540, 39.9220),
    point("tower-3", "cell-3", 32.8580, 39.9240),
  ],
};

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

test("runs a sector and preserves a named scenario", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
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

test("switching Projects clears the live Run association and scopes Run History", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  const history = page.getByRole("region", { name: "Durable local run history" });
  await expect(history.getByRole("button", { name: /Simulation/ })).toBeVisible();

  await page.getByRole("button", { name: "Open project menu" }).click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  const projectSelect = projectMenu.getByRole("combobox", { name: "Project" });
  const sourceProjectID = await projectSelect.locator("option").first().getAttribute("value");
  await projectMenu.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Open project menu" }).click();
  await expect(projectSelect.locator("option")).toHaveCount(2);
  await page.getByRole("button", { name: "Open project menu" }).click();

  await expect(history.getByText("No saved Runs yet.")).toBeVisible();
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
  await expect(page.getByRole("dialog", { name: "Results" })).toContainText("-72.0 dBm");

  await page.getByRole("button", { name: "Plan workspace" }).click();
  await page.getByRole("button", { name: "Network mode, 0 selected" }).click();
  await expect(page.getByRole("button", { name: "Network mode, 1 selected" })).toBeVisible();
  const closeToolDrawer = page.getByRole("button", { name: "Close tool drawer" });
  if (await closeToolDrawer.isVisible()) await closeToolDrawer.click();
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
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.getByRole("tab", { name: "Solutions" }).click();
  await expect(page.getByRole("region", { name: "Pareto alternative solutions" })).toBeVisible();

  await page.getByRole("button", { name: "Run history", exact: true }).click();
  const history = page.getByRole("region", { name: "Durable local run history" });
  await expect(history).toBeVisible();
  const optimizationRow = history.locator(".run-history-row").filter({ hasText: "Optimization" }).first();
  await expect(optimizationRow.locator(".run-status")).toHaveText("Succeeded");
  await expect(optimizationRow).toContainText("Version 2");
  await optimizationRow.click();
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
  await expect(page.getByRole("button", { name: /Version 2/ })).toHaveAttribute("aria-pressed", "true");
  await expect(lineageSummary).toHaveAttribute("aria-label", activeLineageBeforeSourceInspection);

  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  const historicalReport = page.getByRole("button", { name: /Generate report from/ });
  await expect(historicalReport).toBeEnabled();
  await historicalReport.click();
  const confirmation = page.getByRole("dialog", { name: "Generate a Report from this Run?" });
  await confirmation.getByRole("button", { name: /Generate report from/ }).click();
  await expect(page.getByRole("region", { name: "Planning report export" })).toBeVisible();
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
  await expect(page.locator(".workspace-save-state")).toHaveText("Draft saved locally");
  const projectMenuButton = page.getByRole("button", { name: "Open project menu" });
  await projectMenuButton.click();
  const projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();

  await page.getByRole("button", { name: "Run Sector" }).click();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(page.getByRole("region", { name: "Durable local run history" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate report from/ })).toBeEnabled();
  expect(reportModules.some((path) => path.includes("ReportFeature"))).toBe(false);

  await page.getByRole("button", { name: /Generate report from/ }).click();
  const confirmation = page.getByRole("dialog", { name: "Generate a Report from this Run?" });
  await confirmation.getByRole("button", { name: /Generate report from/ }).click();
  const generationFailure = page.getByRole("alert").filter({ hasText: "Report generation code could not be loaded" });
  await expect(generationFailure).toBeVisible();
  await expect(generationFailure.getByRole("button", { name: "Reload application" })).toBeVisible();

  await generationFailure.getByRole("button", { name: "Reload application" }).click();
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(page.getByRole("region", { name: "Durable local run history" })).toBeVisible();
  await page.getByRole("button", { name: /Generate report from/ }).click();
  const retryConfirmation = page.getByRole("dialog", { name: "Generate a Report from this Run?" });
  await retryConfirmation.getByRole("button", { name: /Generate report from/ }).click();

  await expect(page.getByRole("region", { name: "Planning report export" })).toBeVisible();
  await expect.poll(() => reportModules.some((path) => path.includes("reportExport"))).toBe(true);
  await expect.poll(() => reportModules.some((path) => path.includes("reportArtifact"))).toBe(true);
  await expect.poll(() => reportModules.some((path) => path.includes("ReportFeature"))).toBe(true);
  expect(reportImportAttempts).toBe(2);
  expect(computeRequests).toHaveLength(1);
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

  await page.getByRole("button", { name: "Scenario workspace" }).click();
  await page.getByRole("button", { name: "Duplicate scenario" }).click();
  await expect(page.getByText("Independent Scenario duplicated")).toBeVisible();
  const lineageSummary = page.locator(".workspace-lineage-context > summary");
  await expect(page.getByText("2 saved")).toBeVisible();

  const txPower = page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" });
  await txPower.fill("31");
  await expect(lineageSummary).toContainText("Unsaved changes");

  await projectMenuButton.click();
  const savedScenario = page.getByRole("dialog", { name: "Project and scenarios" }).getByRole("button", { name: /Sector plan 1 Version/ }).first();
  await savedScenario.click();

  await expect(page.getByRole("alert")).toContainText("Save the current draft as a Version before opening another Scenario");
  await expect(lineageSummary).toContainText("Unsaved changes");
  await expect(page.getByText("2 saved")).toBeVisible();
  await expect(txPower).toHaveValue("31");
});

test("keeps a collapsed Advanced cell RF value through Version save and reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const cells = page.getByRole("listbox", { name: "Available cells" });
  await cells.getByRole("option", { name: /cell-1/ }).click();

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

  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("listbox", { name: "Available cells" }).getByRole("option", { name: /cell-1/ }).click();
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
  await page.getByRole("button", { name: "Scenario workspace" }).click();
  const savedScenario = page.getByRole("button", { name: /Sector plan 1.*Version 1/ });
  await savedScenario.click();
  await expect(savedScenario).toHaveAttribute("aria-current", "true");
  const lineageSummary = page.locator(".workspace-lineage-context > summary");
  await expect(lineageSummary).toContainText("Version 1");

  await page.getByRole("button", { name: "Run Sector" }).click();
  await expect(page.getByText("Ready", { selector: ".run-state" })).toBeVisible();
  await expect(lineageSummary).toContainText("Version 1");

  const txPower = page.getByRole("spinbutton", { name: "Conducted TX power (dBm)" });
  await txPower.fill("31");
  await expect(lineageSummary).toContainText("Unsaved changes");
  await projectMenuButton.click();
  projectMenu = page.getByRole("dialog", { name: "Project and scenarios" });
  await projectMenu.getByRole("button", { name: "Save current" }).click();
  await expect(projectMenu.getByRole("status")).toHaveText("Version saved");
  await projectMenuButton.click();
  await expect(lineageSummary).toContainText("Version 2");

  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.getByRole("button", { name: "Run history" }).click();
  await expect(page.getByRole("article", { name: /Run .* details/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "HISTORICAL context" })).toContainText("Version 1");
  await page.getByRole("button", { name: "Open source Version" }).click();

  await expect(page.getByRole("button", { name: "Scenario workspace" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Version 1/ })).toHaveAttribute("aria-pressed", "true");
  await expect(lineageSummary).toContainText("Version 2");
  await expect(txPower).toHaveValue("31");
});

test("keeps the focused workspace usable without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Ankara propagation map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: /^Advanced analysis/ })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /^Advanced analysis/ }).click();
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

test("opens the collapsed path-profile section from its RF Diagnostics action", async ({ page }) => {
  const rfRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(analyze-sector|path-profile)/.test(request.url())) rfRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await page.getByRole("button", { name: "RF Diagnostics", exact: true }).click();
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
  await page.getByRole("button", { name: "RF Diagnostics", exact: true }).click();
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
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
  await page.getByRole("button", { name: "RF Diagnostics", exact: true }).click();
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  const reflectionReference = page.getByRole("region", { name: "Specular reflection reference" });
  await expect(reflectionReference).toBeVisible();
  await expect(reflectionReference.getByText(/single_bounce_specular_reflection_reference_v1/i)).toBeVisible();
  await expect(reflectionReference.getByText(/not used by network simulation/i)).toBeVisible();
  await reflectionReference.getByRole("button", { name: "Evaluate reflected path" }).click();
  await expect(reflectionReference.getByText("qualified_reference", { exact: true })).toBeVisible();
  await expect(reflectionReference.getByText("118.381 dB")).toBeVisible();
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
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByRole("button", { name: "Optimize Network" })).toBeEnabled();
  await expect.poll(() => rfRequests.filter((url) => url.includes("/api/optimize-network")).length).toBe(1);

  await page.getByRole("button", { name: "Review workspace" }).click();
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
  await page.getByRole("button", { name: "Optimize Network" }).click();
  await expect(page.getByRole("button", { name: "Optimize Network" })).toBeEnabled();
  await page.getByRole("button", { name: "Review workspace" }).click();
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
  await page.getByRole("button", { name: "Propagation", exact: true }).click();
  await page.getByRole("button", { name: /^Advanced analysis/ }).click();
  await page.getByRole("slider", { name: "Demand importance" }).fill("100");
  await page.getByRole("button", { name: "Review workspace" }).click();
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
  await page.getByRole("button", { name: "Propagation", exact: true }).click();
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

test("loads specialized feature modules only after their workspace action", async ({ page }) => {
  const scriptRequests = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scriptRequests.push(new URL(request.url()).pathname);
  });
  const featurePaths = {
    propagation: "PropagationResearchFeature",
    diagnostics: "RFDiagnosticsResearchFeature",
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
  await page.getByRole("button", { name: "Propagation", exact: true }).click();
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
  await page.getByRole("button", { name: "RF Diagnostics", exact: true }).click();
  const diagnosticsResearch = page.getByRole("button", { name: /^Research \/ reference/ });
  expect(wasRequested(featurePaths.diagnostics)).toBe(false);
  await diagnosticsResearch.click();
  await expect(page.getByRole("region", { name: "RF diagnostics and measurement validation" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.diagnostics)).toBe(true);

  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await expect(page.getByRole("region", { name: "Batch experiments" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.experiments)).toBe(true);

  await page.getByRole("button", { name: "Analyze workspace" }).click();
  await page.getByRole("button", { name: "5G Core", exact: true }).click();
  await expect(page.getByRole("region", { name: "5G Core Lab controls" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.coreLab)).toBe(true);

  await page.getByRole("button", { name: "Review workspace" }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(page.getByRole("region", { name: "Durable local run history" })).toBeVisible();
  await expect.poll(() => wasRequested(featurePaths.history)).toBe(true);
  await page.getByRole("button", { name: "Report", exact: true }).click();
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
  await page.getByRole("button", { name: "Propagation", exact: true }).click();
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();

  const failure = page.getByRole("alert", { name: "Propagation Research could not be loaded" });
  await expect(failure).toBeVisible();
  await expect(failure.getByRole("button", { name: "Reload application" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ankara propagation map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Sector" })).toBeVisible();

  await failure.getByRole("button", { name: "Reload application" }).click();
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await page.getByRole("button", { name: "Propagation", exact: true }).click();
  await page.getByRole("button", { name: /^Research \/ reference/ }).click();
  await expect(page.getByRole("region", { name: "Sub-THz atmospheric reference" })).toBeVisible();
  expect(importRequests).toBe(2);
});

test("keeps disclosure headers and the propagation drawer usable at target widths", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate workspace" }).click();
  await page.getByRole("button", { name: "Propagation", exact: true }).click();

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
