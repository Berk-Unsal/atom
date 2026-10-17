import { describe, expect, it } from "vitest";
import { createDefaultOptimizationConfig } from "./optimizationConfig.js";
import { buildNetworkOptimizationPayload } from "./requestPayloads.js";
import {
  DRAFT_SOURCE_STATUS,
  resolveDraftOptimizationSource,
  solutionMatchesDraft,
  sourceAzimuthsFromRequest,
} from "./optimizationSource.js";

const towers = [
  { id: "lte-1", cellId: 1, coordinates: [32.85, 39.92] },
  { id: "lte-2", cellId: 2, coordinates: [32.86, 39.93] },
];

const settings = {
  frequencyGHz: 2.6,
  txPowerDbm: 30,
  radiusMeters: 400,
  rayCount: 72,
  azimuthDeg: 90,
  beamWidthDeg: 120,
};

const priorities = createDefaultOptimizationConfig();
const startingAzimuths = { "lte-1": 10, "lte-2": 200 };
const request = buildNetworkOptimizationPayload(towers, settings, startingAzimuths, priorities);

function draftRun(overrides = {}) {
  return {
    run_id: "run-7",
    run_type: "optimization",
    status: "succeeded",
    scenario_id: null,
    scenario_revision_id: null,
    optimizer_contract: structuredClone(priorities),
    canonical_input_snapshot: { request: structuredClone(request) },
    ...overrides,
  };
}

// After a completed optimization the draft holds the recommended azimuths, not the starting ones.
const optimizedDraftAzimuths = { "lte-1": 40, "lte-2": 170 };

describe("draft optimization source", () => {
  it("reads each selected Cell's starting azimuth back from the exact request", () => {
    expect(sourceAzimuthsFromRequest(towers, request, { other: 5 })).toEqual({ other: 5, "lte-1": 10, "lte-2": 200 });
  });

  it("is bound when the Run already belongs to a saved Version", () => {
    const run = draftRun({ scenario_id: "scenario-1", scenario_revision_id: "revision-1" });
    expect(resolveDraftOptimizationSource({ run, planningMode: "network", selectedTowers: towers, settings }))
      .toEqual({ status: DRAFT_SOURCE_STATUS.BOUND });
  });

  it("rebuilds the Run's starting plan when its request matches exactly", () => {
    const source = resolveDraftOptimizationSource({
      run: draftRun(), planningMode: "network", selectedTowers: towers, settings, networkAzimuths: optimizedDraftAzimuths,
    });
    expect(source.status).toBe(DRAFT_SOURCE_STATUS.AVAILABLE);
    expect(source.networkAzimuths).toEqual(startingAzimuths);
    expect(buildNetworkOptimizationPayload(towers, settings, source.networkAzimuths, source.optimizationConfig)).toEqual(request);
  });

  it("rebuilds with the Run's own priorities, independent of later local reranking", () => {
    const runPriorities = { ...priorities, objectives: priorities.objectives.map((objective) => ({ ...objective, weight: objective.id === "overlap" ? 80 : 20 })) };
    const runRequest = buildNetworkOptimizationPayload(towers, settings, startingAzimuths, runPriorities);
    const run = draftRun({ optimizer_contract: runPriorities, canonical_input_snapshot: { request: runRequest } });
    const source = resolveDraftOptimizationSource({ run, planningMode: "network", selectedTowers: towers, settings, networkAzimuths: optimizedDraftAzimuths });
    expect(source.status).toBe(DRAFT_SOURCE_STATUS.AVAILABLE);
    expect(source.optimizationConfig).toEqual(runPriorities);
  });

  it("refuses when the Run did not retain the priorities it ran with", () => {
    const source = resolveDraftOptimizationSource({
      run: draftRun({ optimizer_contract: null }), planningMode: "network", selectedTowers: towers, settings, networkAzimuths: optimizedDraftAzimuths,
    });
    expect(source.status).toBe(DRAFT_SOURCE_STATUS.UNAVAILABLE);
  });

  it("refuses when an RF input changed after the Run", () => {
    const source = resolveDraftOptimizationSource({
      run: draftRun(), planningMode: "network", selectedTowers: towers, settings: { ...settings, txPowerDbm: 33 }, networkAzimuths: optimizedDraftAzimuths,
    });
    expect(source.status).toBe(DRAFT_SOURCE_STATUS.UNAVAILABLE);
    expect(source.reason).toMatch(/plan changed after this optimization/i);
  });

  it("refuses when the selected Cells changed after the Run", () => {
    const source = resolveDraftOptimizationSource({ run: draftRun(), planningMode: "network", selectedTowers: towers.slice(0, 1), settings });
    expect(source.status).toBe(DRAFT_SOURCE_STATUS.UNAVAILABLE);
  });

  it.each([
    ["no retained request", draftRun({ canonical_input_snapshot: null }), "network", /did not retain its exact input/i],
    ["single-sector mode", draftRun(), "single", /Return to Network mode/i],
    ["a failed Run", draftRun({ status: "failed" }), "network", /successful Optimization Run/i],
    ["a simulation Run", draftRun({ run_type: "simulation" }), "network", /successful Optimization Run/i],
  ])("refuses %s", (_label, run, planningMode, reason) => {
    const source = resolveDraftOptimizationSource({ run, planningMode, selectedTowers: towers, settings });
    expect(source.status).toBe(DRAFT_SOURCE_STATUS.UNAVAILABLE);
    expect(source.reason).toMatch(reason);
  });
});

describe("solutionMatchesDraft", () => {
  const solution = { id: "solution-a", towers: [{ id: "1", azimuth_deg: 40 }, { id: "2", azimuth_deg: 530 }] };

  it("matches when every selected Cell uses the solution azimuth, normalizing degrees", () => {
    expect(solutionMatchesDraft(solution, towers, settings, optimizedDraftAzimuths)).toBe(true);
  });

  it("does not match a different or partial configuration", () => {
    expect(solutionMatchesDraft(solution, towers, settings, startingAzimuths)).toBe(false);
    expect(solutionMatchesDraft({ towers: [{ id: "1", azimuth_deg: 40 }] }, towers, settings, optimizedDraftAzimuths)).toBe(false);
    expect(solutionMatchesDraft(null, towers, settings, optimizedDraftAzimuths)).toBe(false);
  });
});
