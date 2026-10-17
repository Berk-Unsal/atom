import { buildScenarioRevisionDiff } from "../domain/scenarioDiff.js";
import { getScenarioRevisionRecords } from "../domain/scenario.js";

// Comparison sources for Results → Compare. Everything here reads retained summaries; nothing requests RF work.

export const COMPARISON_METRICS = Object.freeze([
  { label: "Average Rx", key: "avgRxDBm", unit: "dBm" },
  { label: "Gap area", key: "gapPct", unit: "%" },
  { label: "Optimization score", key: "networkScore", unit: "/ 100" },
  { label: "Overlap", key: "overlapBuildings", unit: "buildings" },
  { label: "Average SINR", key: "avgSINRDB", unit: "dB" },
  { label: "Serviceable", key: "serviceablePct", unit: "%" },
  { label: "Affected demand", key: "affectedDemand", unit: "" },
]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreFromStats(stats) {
  const score = finite(stats?.score);
  if (score !== null) return score;
  const composite = finite(stats?.composite_score);
  return composite !== null ? composite * 100 : finite(stats?.network_score);
}

/** KPI summary in the Scenario summary shape from optimizer stats (baseline, recommended or a Pareto alternative). */
export function summaryFromOptimizationStats(stats) {
  if (!stats) return null;
  return { networkScore: scoreFromStats(stats), overlapBuildings: finite(stats.overlap_buildings) };
}

/** KPI summary from a retained succeeded Run's compact summary. */
export function summaryFromRun(run) {
  if (!run || run.status !== "succeeded") return null;
  const summary = run.summary ?? {};
  if (run.run_type === "optimization") return summaryFromOptimizationStats(summary.stats);
  return { avgRxDBm: finite(summary.simulation?.avg_rx_dbm), gapPct: finite(summary.coverage_gaps?.gap_pct) };
}

function datasetKey(reference) {
  const id = reference?.dataset_id ?? reference?.id ?? null;
  if (!id) return null;
  return `${id}@${reference.version ?? reference.dataset_version ?? "unknown"}`;
}

function scenarioID(scenario) {
  return String(scenario?.domain?.scenario_id ?? scenario?.id ?? "");
}

function newestRunFor(runs, scenario, revisionID) {
  return (runs ?? [])
    .filter((run) => run.status === "succeeded"
      && String(run.scenario_id) === scenarioID(scenario)
      && String(run.scenario_revision_id) === String(revisionID))
    .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")))[0] ?? null;
}

/**
 * Every state that can be compared, grouped for one <select>: the current result, the optimization baseline and
 * recommended solution, the inspected Pareto alternative, and each saved Version.
 */
export function buildComparisonSources({
  currentSummary = null,
  currentRevision = null,
  currentIdentity = {},
  optimization = null,
  hasOptimizationComparison = false,
  recommendedSolution = null,
  selectedSolution = null,
  scenarios = [],
  runs = [],
} = {}) {
  const sources = [];
  const identity = { dataset: datasetKey(currentIdentity.datasetRef), model: currentIdentity.modelVersion ?? null };
  if (hasOptimizationComparison && optimization?.baseline) {
    sources.push({ id: "baseline", group: "This result", kind: "baseline", label: "Optimization baseline", summary: summaryFromOptimizationStats(optimization.baseline.stats ?? optimization.baseline), identity });
    sources.push({ id: "recommended", group: "This result", kind: "recommended", label: "Recommended solution", summary: summaryFromOptimizationStats(recommendedSolution?.stats ?? optimization.stats), identity });
  } else if (currentSummary) {
    sources.push({ id: "current", group: "This result", kind: "current", label: "Current result", summary: currentSummary, revision: currentRevision, identity });
  }
  if (selectedSolution && recommendedSolution && String(selectedSolution.id) !== String(recommendedSolution.id)) {
    sources.push({ id: "alternative", group: "This result", kind: "alternative", label: `Inspected alternative · ${selectedSolution.id}`, summary: summaryFromOptimizationStats(selectedSolution.stats), identity });
  }
  for (const scenario of scenarios ?? []) {
    const records = getScenarioRevisionRecords(scenario);
    const currentRevisionID = scenario.domain?.current_revision_id ?? records[records.length - 1]?.scenario_revision_id ?? null;
    for (const revision of records) {
      const isCurrentRevision = String(revision.scenario_revision_id) === String(currentRevisionID);
      const run = newestRunFor(runs, scenario, revision.scenario_revision_id);
      sources.push({
        id: `version:${revision.scenario_revision_id}`,
        group: scenario.name ?? "Scenario",
        kind: "version",
        label: `${scenario.name ?? "Scenario"} · Version ${revision.revision}`,
        scenarioId: scenarioID(scenario),
        revisionId: revision.scenario_revision_id,
        revisionNumber: Number(revision.revision) || 0,
        createdAt: revision.created_at ?? null,
        revision,
        summary: isCurrentRevision && scenario.summary ? scenario.summary : summaryFromRun(run),
        identity: {
          dataset: datasetKey(revision.dataset_references?.[0] ?? scenario.datasetRef),
          model: isCurrentRevision ? scenario.meta?.model_version ?? null : run?.engine?.version ?? null,
        },
      });
    }
  }
  return sources;
}

/** Baseline vs Recommended after an optimization; otherwise the two newest Versions; otherwise current vs newest Version. */
export function defaultComparisonPair(sources) {
  const byID = (id) => sources.find((source) => source.id === id);
  if (byID("baseline") && byID("recommended")) return ["baseline", "recommended"];
  const versions = sources
    .filter((source) => source.kind === "version")
    .sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) || left.revisionNumber - right.revisionNumber);
  if (versions.length >= 2) return [versions[versions.length - 2].id, versions[versions.length - 1].id];
  if (byID("current") && versions.length) return [versions[versions.length - 1].id, "current"];
  return [sources[0]?.id ?? "", sources[1]?.id ?? ""];
}

/** Compatibility, KPI deltas and input differences for one A/B pair. Deltas are withheld for incompatible pairs. */
export function compareSources(first, second) {
  if (!first || !second) return null;
  const mismatch = ["dataset", "model"].find((field) => (
    first.identity?.[field] && second.identity?.[field] && first.identity[field] !== second.identity[field]
  ));
  const incompatibility = mismatch === "dataset"
    ? `A uses dataset ${first.identity.dataset} and B uses ${second.identity.dataset}. Results from different datasets are not comparable, so no deltas are shown.`
    : mismatch === "model"
      ? `A was computed with model ${first.identity.model} and B with ${second.identity.model}. Results from different model versions are not comparable, so no deltas are shown.`
      : "";
  const metrics = incompatibility ? [] : COMPARISON_METRICS.map((metric) => {
    const a = finite(first.summary?.[metric.key]);
    const b = finite(second.summary?.[metric.key]);
    return { ...metric, a, b, delta: a !== null && b !== null ? b - a : null };
  }).filter((metric) => metric.a !== null || metric.b !== null);
  const diff = first.revision && second.revision ? buildScenarioRevisionDiff(first.revision, second.revision) : null;
  return { compatible: !incompatibility, incompatibility, metrics, diff };
}
