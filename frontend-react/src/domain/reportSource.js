import { cloneDomainValue, deepFreeze } from "./identifiers.js";

export const REPORT_SOURCE_KINDS = Object.freeze([
  "scenario_revision",
  "historical_run",
  "comparison_runs",
  "live_compatibility",
]);

export function resolveReportSource({
  project = null,
  scenario = null,
  scenarioRevision = null,
  runs = [],
  runIds = null,
  sourceKind = null,
} = {}) {
  const revision = scenarioRevision ?? findScenarioRevision(scenario, runIds, runs);
  const normalizedRuns = (Array.isArray(runs) ? runs : [runs]).filter(Boolean).map(cloneDomainValue);
  const requestedRunIds = Array.isArray(runIds) ? runIds.map(String) : null;
  const selectedRuns = requestedRunIds
    ? normalizedRuns.filter((run) => requestedRunIds.includes(String(run.run_id)))
    : normalizedRuns;
  if (requestedRunIds && selectedRuns.length !== requestedRunIds.length) {
    const found = new Set(selectedRuns.map((run) => String(run.run_id)));
    const missing = requestedRunIds.filter((id) => !found.has(id));
    throw reportSourceError("report_source_missing", `Report source Run(s) are unavailable: ${missing.join(", ")}`);
  }
  if (!revision && selectedRuns.length > 0) {
    throw reportSourceError("report_source_missing", "The exact ScenarioRevision for the source Run is unavailable");
  }
  if (revision) {
    const projectId = getProjectId(project);
    const scenarioId = getScenarioId(scenario, revision);
    if (projectId && revision.project_id && String(projectId) !== String(revision.project_id)) {
      throw reportSourceError("report_source_incompatible", "ScenarioRevision belongs to another project");
    }
    if (scenarioId && revision.scenario_id && String(scenarioId) !== String(revision.scenario_id)) {
      throw reportSourceError("report_source_incompatible", "ScenarioRevision belongs to another scenario");
    }
    for (const run of selectedRuns) {
      if (run.project_id && projectId && String(run.project_id) !== String(projectId)) {
        throw reportSourceError("report_source_incompatible", `Run ${run.run_id} belongs to another project`);
      }
      if (run.scenario_id && scenarioId && String(run.scenario_id) !== String(scenarioId)) {
        throw reportSourceError("report_source_incompatible", `Run ${run.run_id} belongs to another scenario`);
      }
      if (run.scenario_revision_id && String(run.scenario_revision_id) !== String(revision.scenario_revision_id)) {
        throw reportSourceError("report_source_incompatible", `Run ${run.run_id} does not use the selected ScenarioRevision`);
      }
    }
  }
  const resolvedKind = sourceKind
    ?? (selectedRuns.length > 1 ? "comparison_runs" : selectedRuns.length === 1 ? "historical_run" : "scenario_revision");
  if (!REPORT_SOURCE_KINDS.includes(resolvedKind)) throw reportSourceError("report_source_invalid", `Unsupported report source kind: ${resolvedKind}`);
  if (resolvedKind !== "live_compatibility" && !revision) {
    throw reportSourceError("report_source_missing", "A durable ScenarioRevision is required for this report source");
  }
  if (resolvedKind !== "live_compatibility" && selectedRuns.some((run) => !run.scenario_revision_id)) {
    throw reportSourceError("report_source_missing", "Every historical source Run must identify its exact ScenarioRevision");
  }
  const binding = deepFreeze({
    source_kind: resolvedKind,
    project_id: getProjectId(project),
    scenario_id: getScenarioId(scenario, revision),
    scenario_revision_id: revision?.scenario_revision_id ?? null,
    run_ids: selectedRuns.map((run) => run.run_id).filter(Boolean),
    scenario_fingerprint: revision?.resolved_fingerprints?.scenario_fingerprint
      ?? selectedRuns.find((run) => run.scenario_fingerprint)?.scenario_fingerprint
      ?? null,
    input_fingerprints: selectedRuns.map((run) => run.input_fingerprint).filter(Boolean),
    dataset_references: cloneDomainValue(
      revision?.dataset_references
        ?? selectedRuns.flatMap((run) => run.dataset_references ?? []),
    ),
    run_fingerprints: selectedRuns.map((run) => ({
      run_id: run.run_id,
      scenario_fingerprint: run.scenario_fingerprint ?? null,
      input_fingerprint: run.input_fingerprint ?? null,
    })),
  });
  return {
    binding,
    project: cloneDomainValue(project),
    scenario: cloneDomainValue(scenario),
    scenario_revision: cloneDomainValue(revision),
    runs: selectedRuns,
    evidence: buildReportEvidence({ binding, runs: selectedRuns }),
  };
}

export function buildReportEvidence({ binding, runs = [], live = false } = {}) {
  const historical = !live && binding?.source_kind !== "live_compatibility";
  const sources = {
    scenario_inputs: historical ? "ScenarioRevision" : "live application state",
    run_results: runs.length > 0 ? "stored Run result" : "not bound",
    retained_artifacts: "none",
  };
  const unavailable = [];
  if (historical && runs.some((run) => run.run_type === "simulation")) {
    unavailable.push("Detailed signal surface and ray geometry were not retained for this historical Run.");
  }
  if (historical && runs.some((run) => run.run_type === "optimization")) {
    unavailable.push("Full optimizer evaluation ledger was not retained; this report uses the public baseline and Pareto summaries.");
  }
  return {
    historical,
    no_silent_recompute: historical,
    sources,
    unavailable,
    retained: runs.flatMap((run) => retainedEvidenceForRun(run)),
  };
}

export function findScenarioRevision(scenario, runIds = null, runs = []) {
  const revisions = scenario?.domain?.revisions ?? [];
  const requested = Array.isArray(runIds) ? runIds.map(String) : [];
  const sourceRun = (Array.isArray(runs) ? runs : [runs]).find((run) => requested.includes(String(run?.run_id)));
  const revisionId = sourceRun?.scenario_revision_id ?? scenario?.domain?.current_revision_id;
  return revisions.find((revision) => String(revision.scenario_revision_id) === String(revisionId))
    ?? (scenario?.domain?.revision && typeof scenario.domain.revision === "object"
      ? scenario.domain.revision
      : null)
    ?? null;
}

function retainedEvidenceForRun(run) {
  if (run?.run_type === "optimization") {
    return [
      "Optimization baseline summary",
      "Public Pareto solutions",
      "Recommendation and objective policy",
      ...(run.details?.selected_solution_id ? ["Selected solution identity"] : []),
    ];
  }
  if (run?.run_type === "simulation") return ["Compact RF and coverage summaries"];
  return ["Run metadata"];
}

function getProjectId(project) {
  return project?.domain?.project_id ?? project?.project_id ?? project?.id ?? null;
}

function getScenarioId(scenario, revision) {
  return revision?.scenario_id ?? scenario?.domain?.scenario_id ?? scenario?.scenario_id ?? scenario?.id ?? null;
}

function reportSourceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
