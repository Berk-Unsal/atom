export const RESULT_FRESHNESS = Object.freeze({
  CURRENT: "current",
  HISTORICAL: "historical",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
  UNSUPPORTED: "unsupported",
});

const RESULT_STATE_ORDER = Object.freeze([
  RESULT_FRESHNESS.UNSUPPORTED,
  RESULT_FRESHNESS.UNAVAILABLE,
  RESULT_FRESHNESS.HISTORICAL,
  RESULT_FRESHNESS.STALE,
  RESULT_FRESHNESS.CURRENT,
]);

export function resolveRunFreshness({
  activeProjectId = null,
  activeScenarioId = null,
  activeRevisionId = null,
  currentInputFingerprint = null,
  currentScenarioFingerprint = null,
  draftChangedSinceRun = false,
  historical = false,
  run = null,
  resultType = null,
  unavailableReason = "",
  unsupportedReason = "",
} = {}) {
  if (unsupportedReason) return RESULT_FRESHNESS.UNSUPPORTED;
  if (unavailableReason) return RESULT_FRESHNESS.UNAVAILABLE;
  if (historical) return RESULT_FRESHNESS.HISTORICAL;
  if (!run) return historical && resultType === "report" ? RESULT_FRESHNESS.HISTORICAL : RESULT_FRESHNESS.UNAVAILABLE;
  if (run.status !== "succeeded") return RESULT_FRESHNESS.UNAVAILABLE;

  if (draftChangedSinceRun) return RESULT_FRESHNESS.STALE;
  if (sameKnownIdentity(run.project_id, activeProjectId) === false) return RESULT_FRESHNESS.STALE;
  if (sameKnownIdentity(run.scenario_id, activeScenarioId) === false) return RESULT_FRESHNESS.STALE;
  if (sameKnownIdentity(run.scenario_revision_id, activeRevisionId) === false) return RESULT_FRESHNESS.STALE;

  const runInputFingerprint = run.input_fingerprint;
  const runScenarioFingerprint = run.scenario_fingerprint;
  if (runInputFingerprint && currentInputFingerprint && runInputFingerprint !== currentInputFingerprint) {
    return RESULT_FRESHNESS.STALE;
  }
  if (!runInputFingerprint && runScenarioFingerprint && currentScenarioFingerprint && runScenarioFingerprint !== currentScenarioFingerprint) {
    return RESULT_FRESHNESS.STALE;
  }
  return RESULT_FRESHNESS.CURRENT;
}

export function buildResultContext({
  activeProjectId = null,
  activeScenarioId = null,
  activeRevisionId = null,
  currentInputFingerprint = null,
  currentScenarioFingerprint = null,
  draftChangedSinceRun = false,
  historical = false,
  project = null,
  run = null,
  resultType = null,
  sourceKind = null,
  sourceScenarioName = null,
  scenarios = [],
  unavailableReason = "",
  unsupportedReason = "",
} = {}) {
  const freshness = resolveRunFreshness({
    activeProjectId,
    activeScenarioId,
    activeRevisionId,
    currentInputFingerprint,
    currentScenarioFingerprint,
    draftChangedSinceRun,
    historical,
    run,
    resultType,
    unavailableReason,
    unsupportedReason,
  });
  if (!freshness) return null;

  const scenario = findScenario(scenarios, run?.scenario_id ?? activeScenarioId);
  const sourceRevisionId = run
    ? (run.scenario_revision_id ?? run.canonical_input_snapshot?.source_scenario_revision_id ?? null)
    : activeRevisionId;
  const revision = findRevision(scenario, sourceRevisionId);
  const datasetReference = run?.dataset_references?.[0]
    ?? project?.datasetRef
    ?? null;

  return {
    freshness,
    project_id: run?.project_id ?? activeProjectId ?? project?.domain?.project_id ?? project?.id ?? null,
    project_name: project?.name ?? "Project",
    scenario_id: run?.scenario_id ?? activeScenarioId ?? null,
    scenario_name: scenario?.name ?? run?.metadata?.scenario_name ?? sourceScenarioName ?? (run?.scenario_id ? "Scenario" : "Working draft"),
    scenario_revision_id: sourceRevisionId,
    version_label: revision?.revision ? `Version ${revision.revision}` : sourceRevisionId ? "Version unavailable" : "No saved Version",
    run_id: run?.run_id ?? null,
    run_label: run?.run_id ? `Run ${shortID(run.run_id)}` : resultType === "report" ? "No Run" : "Run unavailable",
    run_type: run?.run_type ?? resultType,
    run_created_at: run?.created_at ?? null,
    scenario_fingerprint: run?.scenario_fingerprint ?? null,
    input_fingerprint: run?.input_fingerprint ?? null,
    source_kind: sourceKind ?? run?.metadata?.source_kind ?? (sourceRevisionId ? "scenario_revision" : "draft"),
    draft_changed_since_run: Boolean(draftChangedSinceRun || freshness === RESULT_FRESHNESS.STALE),
    dataset_ref: datasetReference,
    historical: Boolean(historical),
    unavailable_reason: unavailableReason || (freshness === RESULT_FRESHNESS.UNAVAILABLE && !run ? "The restored result has no unambiguous retained Run." : ""),
    unsupported_reason: unsupportedReason,
    run,
  };
}

export function buildWorkspaceLineage({ project = null, activeScenario = null, sourceScenario = null, draft = null, scenarios = [] } = {}) {
  const sourceScenarioId = activeScenario?.domain?.scenario_id
    ?? activeScenario?.id
    ?? draft?.sourceScenarioId
    ?? draft?.source_scenario_id
    ?? sourceScenario?.domain?.scenario_id
    ?? sourceScenario?.id
    ?? null;
  const scenario = activeScenario ?? sourceScenario ?? findScenario(scenarios, sourceScenarioId);
  const revisionId = activeScenario?.domain?.current_revision_id
    ?? draft?.sourceRevisionId
    ?? draft?.source_revision_id
    ?? sourceScenario?.domain?.current_revision_id
    ?? null;
  const revision = findRevision(scenario, revisionId);
  const unsaved = Boolean(draft && !activeScenario);

  return {
    project_id: project?.domain?.project_id ?? project?.id ?? null,
    project_name: project?.name ?? "Project",
    scenario_id: sourceScenarioId,
    scenario_name: scenario?.name ?? (draft ? "Working draft" : "No Scenario"),
    scenario_revision_id: revisionId,
    version_label: revision?.revision ? `Version ${revision.revision}` : revisionId ? "Version unavailable" : "No saved Version",
    draft_state: unsaved ? "Unsaved changes" : activeScenario ? "Saved Version" : "No saved Version",
    unsaved,
  };
}

export function formatRunType(runType) {
  if (runType === "optimization") return "Optimization";
  if (runType === "simulation") return "Simulation";
  if (!runType) return "Result";
  return String(runType).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resultStateLabel(freshness) {
  return RESULT_STATE_ORDER.includes(freshness) ? freshness.toUpperCase() : "UNAVAILABLE";
}

export function shortID(value) {
  const text = String(value ?? "");
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text || "—";
}

function findScenario(scenarios, scenarioId) {
  if (!scenarioId) return null;
  return (scenarios ?? []).find((candidate) => (
    String(candidate.domain?.scenario_id ?? candidate.id) === String(scenarioId)
  )) ?? null;
}

function findRevision(scenario, revisionId) {
  if (!scenario || !revisionId) return null;
  return (scenario.domain?.revisions ?? []).find((candidate) => (
    String(candidate.scenario_revision_id) === String(revisionId)
  )) ?? null;
}

function sameKnownIdentity(left, right) {
  if (left === null || left === undefined || right === null || right === undefined || left === "" || right === "") return null;
  return String(left) === String(right);
}
