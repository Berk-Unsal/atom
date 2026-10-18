import sampleProjectText from "../samples/ankara-sample.atom-project.json?raw";

// The bundled first-use sample is a byte-for-byte copy of examples/ankara-sample.atom-project.json.
export const SAMPLE_PROJECT_TEXT = sampleProjectText;

export const FIRST_RUN_CARD_STORAGE_KEY = "atom.firstRunCard.dismissed.v1";

const SUMMARY_METRICS = ["avgRxDBm", "gapPct", "networkScore", "overlapBuildings", "avgSINRDB", "serviceablePct", "affectedDemand"];

/** A draft holds work once it retains any result; the automatic draft of an untouched plan does not. */
export function draftHasResults(draft) {
  const summary = draft?.summary ?? {};
  if (SUMMARY_METRICS.some((key) => summary[key] !== null && summary[key] !== undefined && Number.isFinite(Number(summary[key])))) return true;
  const artifacts = draft?.artifacts ?? {};
  return Boolean(artifacts.simulation?.stats || artifacts.networkOptimization?.stats || artifacts.interferenceAnalysis?.stats
    || artifacts.siteRecommendations || artifacts.measurementAnalysis || artifacts.buildingEntryAnalysis);
}

/**
 * True only before any project work exists: one project with no Scenarios, no retained Runs and no draft results.
 * The workspace autosaves a draft of the untouched default plan, so a draft alone is not saved work.
 */
export function isFirstRunWorkspace(workspace, runCount = 0) {
  const projects = workspace?.projects ?? [];
  return projects.length === 1
    && (projects[0].scenarios ?? []).length === 0
    && runCount === 0
    && !draftHasResults(projects[0].draft);
}

function planarDistanceSquared(left, right) {
  const latitude = ((left[1] + right[1]) / 2) * (Math.PI / 180);
  const dx = (left[0] - right[0]) * Math.cos(latitude);
  const dy = left[1] - right[1];
  return dx * dx + dy * dy;
}

/**
 * The settings-only sample has no selected Cells. Select the anchor Cell and its nearest dataset neighbours so the
 * network can be evaluated at once. Ties break by Cell order, so the choice is deterministic.
 */
export function sampleNetworkSelection(towers, anchor, count = 2) {
  const candidates = (towers ?? []).filter((tower) => Array.isArray(tower?.coordinates));
  const origin = anchor && Array.isArray(anchor.coordinates) ? anchor : candidates[0];
  if (!origin) return [];
  return candidates
    .map((tower, index) => ({ tower, index, distance: planarDistanceSquared(tower.coordinates, origin.coordinates) }))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .slice(0, count)
    .map(({ tower }) => tower);
}

export function readFirstRunDismissed(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(FIRST_RUN_CARD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFirstRunDismissed(storage = globalThis.localStorage) {
  try {
    storage?.setItem(FIRST_RUN_CARD_STORAGE_KEY, "1");
  } catch {
    // Dismissal is a per-browser convenience; the card simply returns if storage is unavailable.
  }
}
