import { describe, expect, it } from "vitest";
import { buildInterferencePayload, buildNetworkOptimizationPayload, buildSimulationPayload } from "../utils/requestPayloads.js";
import { createInventoryRevision } from "./inventory.js";
import { createDefaultOptimizationConfig } from "../utils/optimizationConfig.js";
import { createScenarioRevision, resolveScenarioConfiguration, scenarioRevisionToLegacyPlan } from "./scenario.js";

const SETTINGS = {
  frequencyGHz: 28,
  propagationModelID: "urban_short_range",
  txPowerDbm: 30,
  rayCount: 120,
  radiusMeters: 400,
  azimuthDeg: 90,
  beamWidthDeg: 120,
  interferenceBandwidthMHz: 100,
  cellLoadPct: 70,
  reuseFactor: 1,
  noiseFigureDb: 7,
  sampleSpacingMeters: 40,
  calibrationOffsetDb: 0,
};

const TOWERS = [
  { id: "cell-1", cellId: "cell-1", radioType: "5g", coordinates: [32.85, 39.92], rfProfile: { networkTech: "5g", frequencyGHz: 28, antennaGainDbi: 25 } },
  { id: "cell-2", cellId: "cell-2", radioType: "5g", coordinates: [32.86, 39.93], rfProfile: { networkTech: "5g", frequencyGHz: 28, antennaGainDbi: 25 } },
];

function resolveLegacyInputs({ settings = SETTINGS, optimizationConfig = createDefaultOptimizationConfig(), planningMode = "network" } = {}) {
  const inventoryRevision = createInventoryRevision({ inventory_id: "inventory-1", cells: TOWERS });
  const revision = createScenarioRevision({
    scenario_id: "scenario-1",
    inventory_revision_id: inventoryRevision.inventory_revision_id,
    planning_mode: planningMode,
    selected_cell_id: TOWERS[0].id,
    selected_cell_ids: TOWERS.map((tower) => tower.id),
    enabled_cell_ids: TOWERS.map((tower) => tower.id),
    overrides: {
      "cell-1": { fields: { azimuth_deg: 10 } },
      "cell-2": { fields: { azimuth_deg: 190 } },
    },
    rf_affecting_settings: settings,
    objective_constraints: optimizationConfig,
    optimizer_configuration: optimizationConfig,
  });
  return { inventoryRevision, revision, resolved: resolveScenarioConfiguration(inventoryRevision, revision) };
}

describe("Concept 7B request equivalence", () => {
  it.each([
    ["canonical 2.6 GHz", { settings: { ...SETTINGS, frequencyGHz: 2.6 }, planningMode: "single" }],
    ["canonical 28 GHz", {}],
  ])("preserves simulation inputs for %s", (_label, options) => {
    const settings = options.settings ?? SETTINGS;
    const tower = TOWERS[0];
    const oldRequest = buildSimulationPayload(tower, settings);
    const { resolved } = resolveLegacyInputs({ ...options, settings, planningMode: "single" });
    const newRequest = buildSimulationPayload(resolved.selected_effective_cells[0], resolved.settings);
    expect(newRequest).toEqual(oldRequest);
  });

  it("preserves optimization and interference request inputs", () => {
    const { revision, resolved } = resolveLegacyInputs();
    const legacyPlan = scenarioRevisionToLegacyPlan(revision, { networkAzimuths: { "cell-1": 10, "cell-2": 190 } });
    const oldOptimization = buildNetworkOptimizationPayload(TOWERS, SETTINGS, legacyPlan.networkAzimuths, revision.optimizer_configuration);
    const newOptimization = buildNetworkOptimizationPayload(resolved.selected_effective_cells, resolved.settings, legacyPlan.networkAzimuths, resolved.optimizer_configuration);
    const oldInterference = buildInterferencePayload(TOWERS, SETTINGS, null, legacyPlan.networkAzimuths);
    const newInterference = buildInterferencePayload(resolved.selected_effective_cells, resolved.settings, null, legacyPlan.networkAzimuths);
    expect(newOptimization).toEqual(oldOptimization);
    expect(newInterference).toEqual(oldInterference);
  });
});
