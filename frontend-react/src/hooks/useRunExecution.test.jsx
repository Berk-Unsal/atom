import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import golden from "../../../docs/concept-7j-run-snapshot-equivalence.json";
import useRunExecution from "./useRunExecution.js";
import { createRuntimeGuard } from "../platform/runtime.js";

const appMeta = {
  model_version: "rf-model-7j-golden",
  git_commit: "fixture-commit",
  dataset: { id: "dataset-ankara", version: "2026.09", sha256: { buildings: "bldg-hash", towers: "tower-hash" } },
};
const project = {
  id: "project-local-1",
  domain: { project_id: "project-domain-1", inventory_revision_id: "inventory-rev-1" },
  datasetRef: { id: "dataset-ankara", version: "2026.09", hashes: { buildings: "bldg-hash", towers: "tower-hash" } },
};
const scenario = {
  id: "scenario-local-1",
  domain: { scenario_id: "scenario-1", current_revision_id: "revision-1", scenario_fingerprint: "scenario-fingerprint-1", inventory_revision_id: "inventory-rev-1" },
  request: { scenario_fingerprint: "scenario-fingerprint-1", input_fingerprint: "input-fingerprint-1" },
};
const settings = {
  receiverSensitivityDbm: -115,
  noiseFigureDb: 7,
  requiredSnrDb: 5,
  interferenceBandwidthMHz: 100,
  cellLoadPct: 60,
  frequencyGHz: 28,
  txPowerDbm: 30,
  radiusMeters: 400,
  beamWidthDeg: 90,
};
const simulationRequest = {
  frequency_ghz: 28,
  tx_power_dbm: 30,
  radius_m: 400,
  towers: [{ id: "cell-1", azimuth_deg: 90 }],
};
const optimizationRequest = {
  frequency_ghz: 28,
  towers: [{ id: "cell-1", azimuth_deg: 90 }, { id: "cell-2", azimuth_deg: 270 }],
};
const optimizationResponse = {
  optimization_run_id: "optimizer-run-golden-1",
  baseline: { id: "baseline", score: 52, stats: { score: 52 }, towers: [{ id: "cell-1", optimal_azimuth: 90 }, { id: "cell-2", optimal_azimuth: 270 }] },
  pareto_frontier: [
    { id: "public-pareto-alpha", score: 84, stats: { score: 84 }, towers: [{ id: "cell-1", optimal_azimuth: 115 }, { id: "cell-2", optimal_azimuth: 250 }] },
    { id: "public-pareto-beta", score: 79, stats: { score: 79 }, towers: [{ id: "cell-1", optimal_azimuth: 130 }, { id: "cell-2", optimal_azimuth: 240 }] },
  ],
  optimization: {
    recommended_solution_id: "public-pareto-alpha",
    priorities: { demand: 70, coverage: 30 },
    objective_status: { demand: { available: true }, coverage: { available: true } },
    constraints: { max_overlap_ratio: 0.2 },
  },
};

function normalizeRun(value) {
  if (Array.isArray(value)) return value.map(normalizeRun);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["run_id", "created_at", "started_at", "completed_at", "optimization_solution_id"].includes(key))
    .map(([key, child]) => [key, normalizeRun(child)]));
}

function createHistory({ saveRun = async (run) => run, updateRunLifecycle = async () => null } = {}) {
  return {
    saveRun: vi.fn(saveRun),
    updateRunLifecycle: vi.fn(updateRunLifecycle),
  };
}

describe("useRunExecution", () => {
  it("preserves normalized simulation and optimization Run snapshots", async () => {
    const history = createHistory();
    const { result } = renderHook(() => useRunExecution({
      activeProject: project,
      activeScenario: scenario,
      appMeta,
      runHistory: history,
      settings,
    }));

    await act(async () => {
      const simulation = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" });
      await result.current.actions.finishRun({
        request: simulationRequest,
        result: {
          simulation: {
            stats: { avg_rx_dbm: -88, max_range_m: 400, min_range_m: 45, blocked_pct: 10 },
            model: { scenario_fingerprint: "scenario-fingerprint-1", input_fingerprint: "input-fingerprint-1" },
          },
          coverage_gaps: { stats: { gap_buildings: 4, gap_pct: 2 } },
        },
        running: simulation.running,
      });
    });
    expect(normalizeRun(history.saveRun.mock.calls.at(-1)[0])).toEqual(golden.before.simulation);
    expect(result.current.state.currentResultRun.run_type).toBe("simulation");

    history.saveRun.mockClear();
    await act(async () => {
      const optimization = await result.current.actions.beginRun({
        optimizerContract: { kind: "network", objectives: [{ id: "demand", weight: 70 }, { id: "coverage", weight: 30 }], constraints: { max_overlap_ratio: 0.2 } },
        request: optimizationRequest,
        runType: "optimization",
      });
      await result.current.actions.finishRun({
        request: optimizationRequest,
        response: optimizationResponse,
        running: optimization.running,
      });
    });
    const finalOptimizationRun = history.saveRun.mock.calls.at(-1)[0];
    expect(normalizeRun(finalOptimizationRun)).toEqual(golden.before.optimization);
    expect(finalOptimizationRun.details.public_pareto_solutions.map((solution) => solution.id))
      .toEqual(["public-pareto-alpha", "public-pareto-beta"]);
    expect(result.current.state.currentResultRun.run_type).toBe("optimization");

    act(() => result.current.actions.selectParetoSolution("public-pareto-beta"));
    await waitFor(() => expect(history.updateRunLifecycle).toHaveBeenCalledWith(
      finalOptimizationRun.run_id,
      { details: expect.objectContaining({ selected_solution_id: "public-pareto-beta" }) },
    ));
  });

  it("keeps a successful result usable when Run-history persistence fails", async () => {
    const history = createHistory({ saveRun: async () => null });
    const { result } = renderHook(() => useRunExecution({ activeProject: project, activeScenario: scenario, appMeta, runHistory: history, settings }));
    let finalRun;

    await act(async () => {
      const started = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" });
      finalRun = await result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -90 } }, running: started.running });
    });

    expect(finalRun.status).toBe("succeeded");
    expect(result.current.state.currentResultRun).toEqual(finalRun);
    expect(result.current.state.runHistoryWarning).toMatch(/completed, but its local run history record could not be saved/);
  });

  it("does not replace the current association for a cancelled Run and clears it on workspace transition", async () => {
    const history = createHistory();
    const { result } = renderHook(() => useRunExecution({ activeProject: project, activeScenario: scenario, appMeta, runHistory: history, settings }));
    let successfulRun;

    await act(async () => {
      const started = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" });
      successfulRun = await result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -90 } }, running: started.running });
    });
    await act(async () => {
      const started = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" });
      await result.current.actions.finishRun({ request: simulationRequest, status: "cancelled", running: started.running });
    });
    expect(result.current.state.currentResultRun).toEqual(successfulRun);

    act(() => result.current.actions.clearCurrentResult());
    expect(result.current.state.currentResultRun).toBeNull();
  });

  it("retains a late database completion as history without replacing a newer runtime's result", async () => {
    let status = { sequence: 1, state: "ready", generation: "a".repeat(32) }; let notify;
    const runtime = createRuntimeGuard({ getRuntime: async () => status, onRuntimeChange: (callback) => { notify = callback; } });
    const boot = await runtime.begin(); boot.close();
    let heldID; let release; let saving;
    const blocked = new Promise((resolve) => { release = resolve; });
    const entered = new Promise((resolve) => { saving = resolve; });
    const history = createHistory({ saveRun: async (run) => { if (run.run_id === heldID && run.status === "succeeded") { saving(); await blocked; } return run; } });
    const { result } = renderHook(() => useRunExecution({ activeProject: project, activeScenario: scenario, appMeta, runHistory: history, settings, runtime }));
    let started; let oldCompletion; let newer;
    await act(async () => { started = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" }); });
    heldID = started.running.run_id;
    await act(async () => {
      oldCompletion = result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -90 } }, running: started.running });
      await entered;
    });
    status = { sequence: 2, state: "ready", generation: "b".repeat(32) }; notify(status);
    await act(async () => {
      const next = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" });
      newer = await result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -80 } }, running: next.running });
    });
    let historical;
    await act(async () => { release(); historical = await oldCompletion; });
    expect(historical.status).toBe("succeeded");
    expect(result.current.state.currentResultRun.run_id).toBe(newer.run_id);
    expect(result.current.state.currentResultRun.run_id).not.toBe(historical.run_id);
  });

  it("does not associate an old persisted result with a newly selected workspace", async () => {
    let release; let saving; let heldID;
    const blocked = new Promise((resolve) => { release = resolve; });
    const entered = new Promise((resolve) => { saving = resolve; });
    const history = createHistory({ saveRun: async (run) => { if (run.run_id === heldID && run.status === "succeeded") { saving(); await blocked; } return run; } });
    const { result, rerender } = renderHook(({ activeProject }) => useRunExecution({ activeProject, activeScenario: scenario, appMeta, runHistory: history, settings }), { initialProps: { activeProject: project } });
    let started; let finishing;
    await act(async () => { started = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" }); });
    heldID = started.running.run_id;
    await act(async () => { finishing = result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -90 } }, running: started.running }); await entered; });
    rerender({ activeProject: { ...project, id: "new-project" } });
    await act(async () => { release(); await finishing; });
    expect(result.current.state.currentResultRun).toBeNull();
  });

  it("keeps a cleared dataset result detached when its history write completes later", async () => {
    let release; let saving; let heldID;
    const blocked = new Promise((resolve) => { release = resolve; });
    const entered = new Promise((resolve) => { saving = resolve; });
    const history = createHistory({ saveRun: async (run) => {
      if (run.run_id === heldID && run.status === "succeeded") { saving(); await blocked; }
      return run;
    } });
    const { result } = renderHook(() => useRunExecution({ activeProject: project, activeScenario: scenario, appMeta, runHistory: history, settings }));
    let started; let finishing; let historical;
    await act(async () => { started = await result.current.actions.beginRun({ request: optimizationRequest, runType: "optimization" }); });
    heldID = started.running.run_id;
    await act(async () => { finishing = result.current.actions.finishRun({ request: optimizationRequest, response: optimizationResponse, running: started.running }); await entered; });
    act(() => result.current.actions.clearCurrentResult());
    await act(async () => { release(); historical = await finishing; });
    expect(historical.status).toBe("succeeded");
    expect(result.current.state.currentResultRun).toBeNull();
    act(() => result.current.actions.selectParetoSolution("public-pareto-beta"));
    expect(history.updateRunLifecycle).not.toHaveBeenCalled();
  });

  it("does not revive a cleared optimization from a late Pareto history update", async () => {
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    const history = createHistory({ updateRunLifecycle: async (id, changes) => {
      await blocked;
      return { run_id: id, run_type: "optimization", status: "succeeded", ...changes };
    } });
    const { result } = renderHook(() => useRunExecution({ activeProject: project, activeScenario: scenario, appMeta, runHistory: history, settings }));
    await act(async () => {
      const started = await result.current.actions.beginRun({ request: optimizationRequest, runType: "optimization" });
      await result.current.actions.finishRun({ request: optimizationRequest, response: optimizationResponse, running: started.running });
    });
    act(() => result.current.actions.selectParetoSolution("public-pareto-beta"));
    act(() => result.current.actions.clearCurrentResult());
    await act(async () => { release(); await blocked; });
    act(() => result.current.actions.selectParetoSolution("public-pareto-alpha"));
    expect(history.updateRunLifecycle).toHaveBeenCalledTimes(1);
    expect(result.current.state.currentResultRun).toBeNull();
  });

  it("does not let a duplicate old completion replace the latest result", async () => {
    const history = createHistory();
    const { result } = renderHook(() => useRunExecution({ activeProject: project, activeScenario: scenario, appMeta, runHistory: history, settings }));
    let old; let newer;
    await act(async () => {
      old = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" });
      await result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -90 } }, running: old.running });
      const next = await result.current.actions.beginRun({ request: simulationRequest, runType: "simulation" });
      newer = await result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -80 } }, running: next.running });
      await result.current.actions.finishRun({ request: simulationRequest, result: { stats: { avg_rx_dbm: -90 } }, running: old.running });
    });
    expect(result.current.state.currentResultRun.run_id).toBe(newer.run_id);
  });
});
