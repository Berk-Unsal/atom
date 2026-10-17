import { canonicalSerialize } from "../domain/serialization.js";
import { azimuthForTower, buildNetworkOptimizationPayload } from "./requestPayloads.js";

export const DRAFT_SOURCE_STATUS = Object.freeze({
  AVAILABLE: "available",
  BOUND: "bound",
  UNAVAILABLE: "unavailable",
});

const unavailable = (reason) => ({ status: DRAFT_SOURCE_STATUS.UNAVAILABLE, reason });

/** Azimuths each selected Cell started from, read back from an exact optimization request. */
export function sourceAzimuthsFromRequest(selectedTowers = [], request = null, existing = {}) {
  const requested = new Map((request?.towers ?? []).map((tower) => [String(tower.id), tower.azimuth]));
  return selectedTowers.reduce((azimuths, tower) => {
    const azimuth = requested.get(String(tower.cellId ?? tower.id));
    if (Number.isFinite(Number(azimuth))) azimuths[tower.id] = Number(azimuth);
    return azimuths;
  }, { ...existing });
}

/**
 * Decides whether a working-draft optimization Run's starting plan can be saved as a source Version.
 * The plan is rebuilt with the Run's starting azimuths and optimization priorities; it is eligible only
 * when the rebuilt request is canonically identical to the request the Run retained.
 */
export function resolveDraftOptimizationSource({ run, planningMode, selectedTowers = [], settings, networkAzimuths = {} } = {}) {
  if (!run || run.run_type !== "optimization" || run.status !== "succeeded") {
    return unavailable("This solution is not bound to a successful Optimization Run.");
  }
  if (run.scenario_id && run.scenario_revision_id) return { status: DRAFT_SOURCE_STATUS.BOUND };
  const request = run.canonical_input_snapshot?.request;
  if (!request) {
    return unavailable("This Run did not retain its exact input, so its starting plan cannot be saved. Run Optimize Network again to apply an alternative.");
  }
  if (planningMode !== "network") {
    return unavailable("Return to Network mode with the same Cells to save this Run's starting plan.");
  }
  const optimizationConfig = run.optimizer_contract ?? run.canonical_input_snapshot?.optimization ?? null;
  const sourceAzimuths = sourceAzimuthsFromRequest(selectedTowers, request, networkAzimuths);
  const rebuilt = buildNetworkOptimizationPayload(selectedTowers, settings, sourceAzimuths, optimizationConfig);
  if (canonicalSerialize(rebuilt) !== canonicalSerialize(request)) {
    return unavailable("The plan changed after this optimization (Cells, RF settings or inventory), so its starting plan cannot be saved exactly. Run Optimize Network again to apply an alternative.");
  }
  return {
    status: DRAFT_SOURCE_STATUS.AVAILABLE,
    networkAzimuths: sourceAzimuths,
    optimizationConfig,
    request,
  };
}

function normalizedDegrees(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return ((number % 360) + 360) % 360;
}

/** True when every selected Cell in the working draft already uses this Pareto solution's azimuth. */
export function solutionMatchesDraft(solution, selectedTowers = [], settings = {}, networkAzimuths = {}) {
  const solutionTowers = solution?.towers ?? [];
  if (!solutionTowers.length || solutionTowers.length !== selectedTowers.length) return false;
  const solutionAzimuths = new Map(solutionTowers.map((tower) => [String(tower.id), normalizedDegrees(tower.azimuth_deg)]));
  return selectedTowers.every((tower) => {
    const expected = solutionAzimuths.get(String(tower.cellId ?? tower.id));
    const current = normalizedDegrees(azimuthForTower(tower, settings, networkAzimuths));
    return expected !== null && expected !== undefined && current !== null && Math.abs(expected - current) < 0.000001;
  });
}
