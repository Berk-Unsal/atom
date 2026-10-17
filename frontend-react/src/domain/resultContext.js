import { planningModeLabel, readableRunLabel, runPlanningMode } from "./runLabel.js";

export const RESULT_FRESHNESS = Object.freeze({
  CURRENT: "current",
  HISTORICAL: "historical",
  // Only the planning mode changed since the Run; its inputs did not. Shown neutrally, never as STALE.
  OTHER_MODE: "other_mode",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
  UNSUPPORTED: "unsupported",
});

const RESULT_STATE_ORDER = Object.freeze([
  RESULT_FRESHNESS.UNSUPPORTED,
  RESULT_FRESHNESS.UNAVAILABLE,
  RESULT_FRESHNESS.HISTORICAL,
  RESULT_FRESHNESS.OTHER_MODE,
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
  planChange = null,
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
  // Identity and fingerprint mismatches above always win; only a mode-only change is presented neutrally.
  if (draftChangedSinceRun) return classifyPlanChange(planChange) === "mode" ? RESULT_FRESHNESS.OTHER_MODE : RESULT_FRESHNESS.STALE;
  return RESULT_FRESHNESS.CURRENT;
}

/** "mode" only when every change since the Run was a planning-mode switch; anything else (or unknown) is "input". */
export function classifyPlanChange(planChange) {
  return planChange === "mode" ? "mode" : "input";
}

/** Combine a new plan change with the pending one: an input change is never downgraded by a later mode switch. */
export function nextPlanChange(previous, change) {
  if (change === null) return null;
  if (change === "mode" && (previous === null || previous === "mode")) return "mode";
  return "input";
}

/** One wording for a Version state everywhere: "No saved Version", "Version N" or "Version N · Unsaved changes". */
export function versionStateLabel({ revision = null, unsavedChanges = false } = {}) {
  if (!revision) return "No saved Version";
  return unsavedChanges ? `Version ${revision} · Unsaved changes` : `Version ${revision}`;
}

export function buildResultContext({
  activeProjectId = null,
  activeScenarioId = null,
  activeRevisionId = null,
  currentInputFingerprint = null,
  currentScenarioFingerprint = null,
  currentPlanningMode = null,
  draftChangedSinceRun = false,
  historical = false,
  planChange = null,
  project = null,
  run = null,
  resultType = null,
  sourceKind = null,
  sourceScenarioName = null,
  scenarios = [],
  unavailableReason = "",
  unsupportedReason = "",
  workspace = null,
} = {}) {
  const freshness = resolveRunFreshness({
    activeProjectId,
    activeScenarioId,
    activeRevisionId,
    currentInputFingerprint,
    currentScenarioFingerprint,
    draftChangedSinceRun,
    historical,
    planChange,
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
  const runMode = runPlanningMode(run);
  // A current Run made from the working draft describes the workspace itself, so it uses the workspace wording.
  const describesWorkspace = Boolean(workspace && run && !sourceRevisionId && freshness === RESULT_FRESHNESS.CURRENT);
  const versionState = describesWorkspace
    ? workspace.version_state
    : versionStateLabel({ revision: revision?.revision ?? null });

  return {
    freshness,
    project_id: run?.project_id ?? activeProjectId ?? project?.domain?.project_id ?? project?.id ?? null,
    project_name: project?.name ?? "Project",
    scenario_id: run?.scenario_id ?? activeScenarioId ?? null,
    scenario_name: describesWorkspace
      ? workspace.scenario_name
      : scenario?.name ?? run?.metadata?.scenario_name ?? sourceScenarioName ?? (run?.scenario_id ? "Scenario" : "Working draft"),
    scenario_revision_id: sourceRevisionId,
    version_label: revision?.revision ? `Version ${revision.revision}` : sourceRevisionId ? "Version unavailable" : "No saved Version",
    version_state: sourceRevisionId && !revision ? "Version unavailable" : versionState,
    run_id: run?.run_id ?? null,
    run_label: run?.run_id ? readableRunLabel(run) : resultType === "report" ? "No Run" : "Run unavailable",
    run_planning_mode: runMode,
    mode_message: freshness === RESULT_FRESHNESS.OTHER_MODE ? planModeMessage(runMode, currentPlanningMode) : "",
    run_type: run?.run_type ?? resultType,
    run_created_at: run?.created_at ?? null,
    scenario_fingerprint: run?.scenario_fingerprint ?? null,
    input_fingerprint: run?.input_fingerprint ?? null,
    source_kind: sourceKind ?? run?.metadata?.source_kind ?? (sourceRevisionId ? "scenario_revision" : "draft"),
    draft_changed_since_run: freshness === RESULT_FRESHNESS.STALE || (Boolean(draftChangedSinceRun) && freshness !== RESULT_FRESHNESS.OTHER_MODE),
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
    version_state: versionStateLabel({ revision: revision?.revision ?? null, unsavedChanges: unsaved }),
    unsaved,
  };
}

/** Neutral copy for a Run whose inputs still match but whose planning mode is no longer active. */
export function planModeMessage(runMode, currentMode) {
  const runModeLabel = planningModeLabel(runMode);
  if (!runMode || runMode === currentMode) {
    return "The planning mode changed since this Run; its inputs did not. Run again to show it on the map.";
  }
  return `Result belongs to ${runModeLabel} mode. Switch back to ${runModeLabel} or run the current plan.`;
}

export function formatRunType(runType) {
  if (runType === "optimization") return "Optimization";
  if (runType === "simulation") return "Simulation";
  if (!runType) return "Result";
  return String(runType).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resultStateLabel(freshness) {
  if (freshness === RESULT_FRESHNESS.OTHER_MODE) return "OTHER MODE";
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
