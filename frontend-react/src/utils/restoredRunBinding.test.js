import { describe, expect, it } from "vitest";
import { attributeRunToSourceVersion, findRestorableRun, runIdentityMatches, runMatchesPlan } from "./restoredRunBinding.js";
import { buildNetworkOptimizationPayload, buildSimulationPayload } from "./requestPayloads.js";

const settings = { frequencyGHz: 28, txPowerDbm: 30, rayCount: 120, radiusMeters: 400, azimuthDeg: 90, beamWidthDeg: 120, calibrationOffsetDb: 0 };
const tower = { id: "tower-1", cellId: "101", coordinates: [32.85, 39.92] };
const second = { id: "tower-2", cellId: "102", coordinates: [32.854, 39.922] };
const datasetRef = { id: "ankara-default", version: "2026.07", hashes: { "ankara_5g_nodes.geojson": "hash-a" } };
const identity = {
  dataset_references: [{ dataset_id: "ankara-default", version: "2026.07", content_hashes: { "ankara_5g_nodes.geojson": "hash-a" } }],
  engine: { version: "model-v2" },
};

const simulationRun = (overrides = {}) => ({
  run_id: "run-sim",
  run_type: "simulation",
  status: "succeeded",
  project_id: "project-1",
  completed_at: "2026-10-18T10:00:00Z",
  canonical_input_snapshot: { request: buildSimulationPayload(tower, settings) },
  ...identity,
  ...overrides,
});

const singlePlan = { planningMode: "single", selectedTower: tower, settings };
const optimizationConfig = { objectives: [{ id: "demand", weight: 50 }], constraints: {} };
const networkRun = {
  run_id: "run-opt",
  run_type: "optimization",
  status: "succeeded",
  project_id: "project-1",
  completed_at: "2026-10-18T11:00:00Z",
  canonical_input_snapshot: { request: buildNetworkOptimizationPayload([tower, second], settings, { "tower-1": 0, "tower-2": 90 }, optimizationConfig) },
  details: { public_pareto_solutions: [{ cell_configurations: [{ id: "101", optimal_azimuth: 20 }, { id: "102", optimal_azimuth: 140 }] }] },
  ...identity,
};
const networkPlan = { planningMode: "network", selectedNetworkTowers: [tower, second], settings, networkAzimuths: { "tower-1": 20, "tower-2": 140 }, optimizationConfig };

describe("restored Run binding", () => {
  it("binds a simulation only to exactly the same request", () => {
    expect(runMatchesPlan(simulationRun(), singlePlan)).toBe(true);
    expect(runMatchesPlan(simulationRun(), { ...singlePlan, settings: { ...settings, txPowerDbm: 31 } })).toBe(false);
    expect(runMatchesPlan(simulationRun(), { ...singlePlan, selectedTower: second })).toBe(false);
    expect(runMatchesPlan(simulationRun(), { ...singlePlan, planningMode: "network" })).toBe(false);
    expect(runMatchesPlan(simulationRun({ canonical_input_snapshot: null }), singlePlan)).toBe(false);
    expect(runMatchesPlan(simulationRun({ status: "failed" }), singlePlan)).toBe(false);
  });

  it("binds a network optimization when inputs match and the plan sits on one of its retained solutions", () => {
    expect(runMatchesPlan(networkRun, networkPlan)).toBe(true);
    expect(runMatchesPlan(networkRun, { ...networkPlan, networkAzimuths: { "tower-1": 25, "tower-2": 140 } })).toBe(false);
    expect(runMatchesPlan(networkRun, { ...networkPlan, optimizationConfig: { objectives: [{ id: "demand", weight: 80 }], constraints: {} } })).toBe(false);
    expect(runMatchesPlan(networkRun, { ...networkPlan, settings: { ...settings, radiusMeters: 500 } })).toBe(false);
  });

  it("binds a single-cell azimuth optimization to its optimal azimuth only", () => {
    const run = {
      ...simulationRun(),
      run_id: "run-azimuth",
      run_type: "optimization",
      details: { public_pareto_solutions: [{ cell_configurations: [{ id: "101", optimal_azimuth: 135 }] }] },
    };
    expect(runMatchesPlan(run, { ...singlePlan, settings: { ...settings, azimuthDeg: 135 } })).toBe(true);
    expect(runMatchesPlan(run, { ...singlePlan, settings: { ...settings, azimuthDeg: 90 } })).toBe(false);
  });

  it.each([
    ["an unknown current dataset", simulationRun(), { datasetRef: null, modelVersion: "model-v2" }],
    ["a different dataset version", simulationRun({ dataset_references: [{ ...identity.dataset_references[0], version: "2026.01" }] }), { datasetRef, modelVersion: "model-v2" }],
    ["a different content hash", simulationRun({ dataset_references: [{ ...identity.dataset_references[0], content_hashes: { "ankara_5g_nodes.geojson": "hash-b" } }] }), { datasetRef, modelVersion: "model-v2" }],
    ["a different model version", simulationRun(), { datasetRef, modelVersion: "model-v3" }],
    ["an unrecorded model version", simulationRun({ engine: {} }), { datasetRef, modelVersion: "model-v2" }],
  ])("never matches identity with %s", (_label, run, current) => {
    expect(runIdentityMatches(run, current)).toBe(false);
  });

  it("finds the newest exact match, ignores other projects, and explains when none applies", () => {
    const older = simulationRun({ run_id: "older", completed_at: "2026-10-18T09:00:00Z" });
    const otherProject = simulationRun({ run_id: "other", project_id: "project-2", completed_at: "2026-10-18T12:00:00Z" });
    const changed = simulationRun({ run_id: "changed", completed_at: "2026-10-18T13:00:00Z", canonical_input_snapshot: { request: buildSimulationPayload(tower, { ...settings, txPowerDbm: 33 }) } });
    const found = findRestorableRun({ runs: [older, otherProject, changed, simulationRun()], plan: singlePlan, projectId: "project-1", datasetRef, modelVersion: "model-v2" });
    expect(found.run.run_id).toBe("run-sim");
    const none = findRestorableRun({ runs: [changed], plan: singlePlan, projectId: "project-1", datasetRef, modelVersion: "model-v2" });
    expect(none.run).toBeNull();
    expect(none.reason).toMatch(/None of the 1 retained Run for this project used exactly these inputs/);
    expect(findRestorableRun({ runs: [], plan: singlePlan })).toEqual({ run: null, reason: "" });
  });

  it("attributes a draft Run to the Version that recorded it as its source, without changing the Run", () => {
    const run = simulationRun();
    const scenarios = [{ id: "s", domain: { scenario_id: "scenario-1", revisions: [{ scenario_revision_id: "rev-1", metadata: { source_run_id: "run-sim" } }] } }];
    expect(attributeRunToSourceVersion(run, scenarios)).toMatchObject({ run_id: "run-sim", scenario_id: "scenario-1", scenario_revision_id: "rev-1" });
    expect(run.scenario_revision_id).toBeUndefined();
    expect(attributeRunToSourceVersion(run, [])).toBe(run);
  });
});
