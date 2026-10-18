import { canonicalSerialize } from "../domain/serialization.js";
import { solutionMatchesDraft, sourceAzimuthsFromRequest } from "./optimizationSource.js";
import { buildNetworkOptimizationPayload, buildSimulationPayload } from "./requestPayloads.js";

// One binding rule, shared with applying a draft Pareto alternative (#101): a Run belongs to a plan only when the
// request rebuilt from that plan is canonically identical to the request the Run retained, on the same dataset and
// model version. Nothing here is fuzzy, and nothing here requests RF work.

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}

function sameRequest(left, right) {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

function solutionTowers(solution) {
  return (solution?.cell_configurations ?? solution?.towers ?? []).map((configuration) => ({
    id: String(configuration.id ?? configuration.cell_id ?? configuration.cellId),
    azimuth_deg: finite(configuration.azimuth_deg ?? configuration.optimal_azimuth ?? configuration.azimuth),
  }));
}

/** Strict identity: the Run must record the current dataset and model version; unknown never matches. */
export function runIdentityMatches(run, { datasetRef = null, modelVersion = null } = {}) {
  const recorded = run?.dataset_references?.[0];
  if (!recorded || !datasetRef?.id) return false;
  if (String(recorded.dataset_id) !== String(datasetRef.id) || String(recorded.version) !== String(datasetRef.version)) return false;
  if (!Object.entries(datasetRef.hashes ?? {}).every(([key, value]) => recorded.content_hashes?.[key] === value)) return false;
  const runModel = run?.engine?.version ?? null;
  return Boolean(modelVersion && runModel && String(runModel) === String(modelVersion));
}

/**
 * True when the plan is exactly what this Run computed: for a simulation, the same request; for an optimization,
 * the same inputs apart from the azimuths it searched, with the plan now on one of its retained solutions.
 */
export function runMatchesPlan(run, plan = {}) {
  if (!run || run.status !== "succeeded") return false;
  const request = run.canonical_input_snapshot?.request;
  if (!request) return false;
  const { planningMode, selectedTower = null, selectedNetworkTowers = [], settings = {}, networkAzimuths = {}, optimizationConfig = null } = plan;
  if (run.run_type === "simulation") {
    return planningMode === "single" && Boolean(selectedTower) && sameRequest(buildSimulationPayload(selectedTower, settings), request);
  }
  if (run.run_type !== "optimization") return false;
  const solutions = run.details?.public_pareto_solutions ?? [];
  if (Array.isArray(request.towers)) {
    if (planningMode !== "network" || selectedNetworkTowers.length === 0) return false;
    const startingAzimuths = sourceAzimuthsFromRequest(selectedNetworkTowers, request, networkAzimuths);
    if (!sameRequest(buildNetworkOptimizationPayload(selectedNetworkTowers, settings, startingAzimuths, optimizationConfig), request)) return false;
    return solutions.some((solution) => solutionMatchesDraft({ towers: solutionTowers(solution) }, selectedNetworkTowers, settings, networkAzimuths));
  }
  if (planningMode !== "single" || !selectedTower) return false;
  const startingAzimuth = finite(request.azimuth);
  if (startingAzimuth === null || !sameRequest(buildSimulationPayload(selectedTower, { ...settings, azimuthDeg: startingAzimuth }), request)) return false;
  const optimal = finite(solutionTowers(solutions[0])[0]?.azimuth_deg);
  return optimal !== null && Math.abs(Number(settings.azimuthDeg) - optimal) < 0.000001;
}

/**
 * The newest succeeded Run of this project that matches the restored plan exactly, or an explanation of why none
 * applies. Runs are never relabelled here; a caller presents a found Run as HISTORICAL.
 */
export function findRestorableRun({ runs = [], plan = {}, projectId = null, datasetRef = null, modelVersion = null } = {}) {
  const projectRuns = runs
    .filter((run) => run?.status === "succeeded" && ["simulation", "optimization"].includes(run.run_type))
    .filter((run) => !projectId || !run.project_id || String(run.project_id) === String(projectId))
    .sort((left, right) => String(right.completed_at ?? right.created_at ?? "").localeCompare(String(left.completed_at ?? left.created_at ?? "")));
  if (projectRuns.length === 0) return { run: null, reason: "" };
  const run = projectRuns.find((candidate) => runIdentityMatches(candidate, { datasetRef, modelVersion }) && runMatchesPlan(candidate, plan)) ?? null;
  if (run) return { run, reason: "" };
  return {
    run: null,
    reason: `None of the ${projectRuns.length} retained Run${projectRuns.length === 1 ? "" : "s"} for this project used exactly these inputs on the current dataset and model version, so no result is shown for this plan. Run it to create one.`,
  };
}

/** A view of the Run attributed to the Version whose metadata names it as its source Run; the Run is not changed. */
export function attributeRunToSourceVersion(run, scenarios = []) {
  if (!run || run.scenario_revision_id) return run;
  for (const scenario of scenarios ?? []) {
    const revision = (scenario.domain?.revisions ?? []).find((candidate) => String(candidate.metadata?.source_run_id ?? "") === String(run.run_id));
    if (revision) {
      return { ...run, scenario_id: scenario.domain?.scenario_id ?? scenario.id, scenario_revision_id: revision.scenario_revision_id };
    }
  }
  return run;
}
