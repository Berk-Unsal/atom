import { describe, expect, it } from "vitest";
import {
  applyOptimizationSolution,
  branchScenario,
  canonicalSerialize,
  containsUIOnlyState,
  createInventoryCell,
  createInventoryRevision,
  createOptimizationRun,
  captureOptimizationRun,
  captureSimulationRun,
  buildRunExecutionContext,
  createProjectEntity,
  createScenarioEntity,
  createScenarioRevision,
  resolveInventoryCell,
  resolveScenarioConfiguration,
} from "./index.js";

describe("Concept 7B domain model", () => {
  it("keeps durable entity ids separate from content and compute identities", () => {
    const project = createProjectEntity({ name: "Test" });
    const scenario = createScenarioEntity({ project_id: project.project_id });
    const revision = createScenarioRevision({ scenario_id: scenario.scenario_id });
    expect(project.project_id).not.toBe(scenario.scenario_id);
    expect(scenario.scenario_id).not.toBe(revision.scenario_revision_id);
    expect(revision.scenario_revision_id).not.toBe(revision.resolved_fingerprints.scenario_fingerprint);
  });

  it("resolves sparse overrides with inherit and explicit clear semantics", () => {
    const cell = createInventoryCell({
      id: "cell-1",
      coordinates: [32.85, 39.92],
      rfProfile: { antennaGainDbi: 25, receiverSensitivityDbm: -115, nested: { keep: true, clear: 1 } },
    });
    const resolved = resolveInventoryCell(cell, {
      fields: {
        rf_profile: {
          antennaGainDbi: 30,
          nested: { clear: { $clear: true } },
        },
      },
    }, { rf_profile: { receiverSensitivityDbm: -110 } });
    expect(resolved.rf_profile.antennaGainDbi).toBe(30);
    expect(resolved.rf_profile.receiverSensitivityDbm).toBe(-115);
    expect(resolved.rf_profile.nested.keep).toBe(true);
    expect(resolved.rf_profile.nested.clear).toBeUndefined();
    expect(resolved.cleared_fields).toContain("rf_profile.nested.clear");
  });

  it("keeps saved ScenarioRevision input-only", () => {
    const revision = createScenarioRevision({
      scenario_id: "scenario-1",
      request_inputs: {
        settings: { frequencyGHz: 28 },
        selectedMapCellId: "ui-cell",
        layerVisibility: { rays: true },
      },
      canonical_input_snapshot: { settings: { frequencyGHz: 28 }, mapViewport: { zoom: 14 } },
    });
    expect(containsUIOnlyState(revision.request_inputs)).toBe(false);
    expect(containsUIOnlyState(revision.canonical_input_snapshot)).toBe(false);
    expect(revision.request_inputs).toEqual({ settings: { frequencyGHz: 28 } });
    expect(revision.canonical_input_snapshot).toEqual({ settings: { frequencyGHz: 28 } });
  });

  it("resolves inventory and scenario input without performing RF calculations", () => {
    const inventoryRevision = createInventoryRevision({
      inventory_id: "inventory-1",
      cells: [createInventoryCell({ id: "cell-1", cellId: "cell-1", coordinates: [1, 2] })],
    });
    const scenarioRevision = createScenarioRevision({
      scenario_id: "scenario-1",
      inventory_revision_id: inventoryRevision.inventory_revision_id,
      selected_cell_ids: ["cell-1"],
      rf_affecting_settings: { frequencyGHz: 28 },
    });
    const resolved = resolveScenarioConfiguration(inventoryRevision, scenarioRevision);
    expect(resolved.selected_cells).toHaveLength(1);
    expect(resolved.settings.frequencyGHz).toBe(28);
  });

  it("branches and applies an optimization solution without mutating prior revisions", () => {
    const scenario = createScenarioEntity({ project_id: "project-1", name: "Baseline" });
    const revision = createScenarioRevision({
      scenario_id: scenario.scenario_id,
      selected_cell_ids: ["cell-1"],
      overrides: { "cell-1": { fields: { azimuth_deg: 90 } } },
    });
    const branch = branchScenario({ sourceScenario: scenario, sourceRevision: revision });
    expect(branch.scenario.parent_scenario_id).toBe(scenario.scenario_id);
    expect(branch.revision.parent_revision_id).toBe(revision.scenario_revision_id);

    const run = { run_id: "run-1", run_type: "optimization", status: "succeeded" };
    const solution = { id: "pareto-1", towers: [{ id: "cell-1", optimal_azimuth: 135 }] };
    const applied = applyOptimizationSolution({ scenario, scenarioRevision: revision, run, solution });
    expect(applied.revision.scenario_revision_id).not.toBe(revision.scenario_revision_id);
    expect(applied.revision.parent_revision_id).toBe(revision.scenario_revision_id);
    expect(applied.revision.overrides["cell-1"].fields.azimuth_deg).toBe(135);
    expect(revision.overrides["cell-1"].fields.azimuth_deg).toBe(90);
  });

  it("stores only public optimization solutions in typed run details", () => {
    const run = createOptimizationRun({
      response: {
        optimization_run_id: "compute-1",
        baseline: { stats: { score: 50 } },
        pareto_frontier: [{ id: "pareto-1", stats: { score: 80 }, towers: [] }],
        evaluations: [{ private: true }],
      },
    });
    expect(run.run_id).toBeTruthy();
    expect(run.details.optimization_run_id).toBe("compute-1");
    expect(run.details.public_pareto_solutions).toHaveLength(1);
    expect(JSON.stringify(run.details)).not.toContain("private");
  });

  it("canonicalizes object key order for new metadata without changing RF fingerprints", () => {
    expect(canonicalSerialize({ b: 2, a: 1 })).toBe(canonicalSerialize({ a: 1, b: 2 }));
  });

  it("captures compact terminal simulation and optimization records without visualization arrays", () => {
    const simulation = captureSimulationRun({
      context: { run_id: "simulation-run", project_id: "project-1" },
      request: { rays: 72, frequency_ghz: 28 },
      result: {
        simulation: { stats: { avg_rx_dbm: -88 }, geojson: { features: [{ geometry: "large" }] } },
        coverage_gaps: { stats: { gap_buildings: 4 }, geojson: { features: [{ geometry: "large" }] } },
      },
    });
    const optimization = captureOptimizationRun({
      context: { run_id: "optimization-run", project_id: "project-1" },
      request: { rays: 72 },
      response: {
        optimization_run_id: "compute-run",
        baseline: { stats: { score: 50 } },
        pareto_frontier: [{ id: "solution-1", towers: [{ id: "1", azimuth_deg: 90 }], stats: { score: 80 } }],
        evaluation_ledger: [{ private: true }],
      },
    });

    expect(simulation.status).toBe("succeeded");
    expect(simulation.details.result_summary.simulation.avg_rx_dbm).toBe(-88);
    expect(JSON.stringify(simulation)).not.toContain("geojson");
    expect(optimization.details.public_pareto_solutions[0].id).toBe("solution-1");
    expect(JSON.stringify(optimization.details)).not.toContain("evaluation_ledger");
  });

  it("records unsaved draft provenance and distinguishes cancellation from failure", () => {
    const context = buildRunExecutionContext({
      project: { id: "project-1", datasetRef: { id: "ankara", version: "1", hashes: {} } },
      request: { rays: 72 },
      runType: "simulation",
      source: "draft",
    });
    const cancelled = captureSimulationRun({
      context: { ...context, run_id: "cancelled-run" },
      request: { rays: 72 },
      error: { code: "run_cancelled", message: "user cancelled" },
    });
    const failed = captureSimulationRun({
      context: { ...context, run_id: "failed-run" },
      request: { rays: 72 },
      error: { code: "compute_failed", message: "capacity" },
    });

    expect(context.canonical_input_snapshot.draft_execution).toBe(true);
    expect(context.canonical_input_snapshot.request.rays).toBe(72);
    expect(cancelled.status).toBe("cancelled");
    expect(failed.status).toBe("failed");
  });

  it("keeps run identity and lifecycle timestamps out of the exact request snapshot", () => {
    const request = { rays: 72, frequency_ghz: 28, radius_m: 400 };
    const context = buildRunExecutionContext({ project: { id: "project-1" }, request });
    const run = captureSimulationRun({ context, request, result: { simulation: { stats: { avg_rx_dbm: -88 } } } });

    expect(run.canonical_input_snapshot.request).toEqual(request);
    expect(run.canonical_input_snapshot.request.run_id).toBeUndefined();
    expect(run.canonical_input_snapshot.request.created_at).toBeUndefined();
  });
});
