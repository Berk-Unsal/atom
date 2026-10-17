import { describe, expect, it } from "vitest";
import { buildComparisonSources, compareSources, defaultComparisonPair, summaryFromRun } from "./comparisonSources.js";

const dataset = { dataset_id: "ankara", version: "2026.07" };

function scenario(id, name, revisions, extra = {}) {
  return {
    id,
    name,
    datasetRef: { id: "ankara", version: "2026.07" },
    domain: {
      scenario_id: id,
      current_revision_id: revisions[revisions.length - 1].scenario_revision_id,
      revisions: revisions.map((revision) => ({ dataset_references: [dataset], rf_affecting_settings: {}, ...revision })),
    },
    ...extra,
  };
}

const planA = scenario("scenario-a", "Sector plan 1", [
  { scenario_revision_id: "a-1", revision: 1, created_at: "2026-10-17T10:00:00Z", rf_affecting_settings: { txPowerDbm: 30 } },
  { scenario_revision_id: "a-2", revision: 2, created_at: "2026-10-17T11:00:00Z", rf_affecting_settings: { txPowerDbm: 33 } },
], { summary: { avgRxDBm: -70, gapPct: 4 }, meta: { model_version: "m1" } });

const optimization = {
  baseline: { stats: { score: 52, overlap_buildings: 9 } },
  stats: { score: 65.5, overlap_buildings: 4 },
};

describe("comparison sources", () => {
  it("offers baseline, recommended, the inspected alternative and every saved Version", () => {
    const sources = buildComparisonSources({
      optimization,
      hasOptimizationComparison: true,
      recommendedSolution: { id: "sol-1", stats: { score: 65.5 } },
      selectedSolution: { id: "sol-2", stats: { score: 61 } },
      scenarios: [planA],
    });
    expect(sources.map((source) => source.id)).toEqual(["baseline", "recommended", "alternative", "version:a-1", "version:a-2"]);
    expect(sources.find((source) => source.id === "alternative").label).toBe("Inspected alternative · sol-2");
    expect(sources.find((source) => source.id === "version:a-2").label).toBe("Sector plan 1 · Version 2");
  });

  it("keeps Baseline vs Recommended as the default pair after an optimization", () => {
    const sources = buildComparisonSources({ optimization, hasOptimizationComparison: true, scenarios: [planA] });
    expect(defaultComparisonPair(sources)).toEqual(["baseline", "recommended"]);
  });

  it("defaults to the two newest Versions without an optimization, then to current vs newest Version", () => {
    expect(defaultComparisonPair(buildComparisonSources({ currentSummary: { avgRxDBm: -72 }, scenarios: [planA] }))).toEqual(["version:a-1", "version:a-2"]);
    const single = scenario("scenario-b", "Sector plan 2", [{ scenario_revision_id: "b-1", revision: 1, created_at: "2026-10-17T12:00:00Z" }]);
    expect(defaultComparisonPair(buildComparisonSources({ currentSummary: { avgRxDBm: -72 }, scenarios: [single] }))).toEqual(["version:b-1", "current"]);
  });

  it("uses the Scenario summary for its current Version and a retained Run for older Versions", () => {
    const run = { status: "succeeded", run_type: "simulation", scenario_id: "scenario-a", scenario_revision_id: "a-1", created_at: "2026-10-17T10:05:00Z", summary: { simulation: { avg_rx_dbm: -75 }, coverage_gaps: { gap_pct: 6 } } };
    const sources = buildComparisonSources({ scenarios: [planA], runs: [run] });
    expect(sources.find((source) => source.id === "version:a-2").summary).toEqual({ avgRxDBm: -70, gapPct: 4 });
    expect(sources.find((source) => source.id === "version:a-1").summary).toEqual({ avgRxDBm: -75, gapPct: 6 });
    expect(summaryFromRun({ ...run, status: "failed" })).toBeNull();
  });

  it("shows KPI deltas and the input diff for two Versions", () => {
    const sources = buildComparisonSources({ scenarios: [planA], runs: [{ status: "succeeded", run_type: "simulation", scenario_id: "scenario-a", scenario_revision_id: "a-1", summary: { simulation: { avg_rx_dbm: -75 }, coverage_gaps: { gap_pct: 6 } } }] });
    const result = compareSources(sources[0], sources[1]);
    expect(result.compatible).toBe(true);
    expect(result.metrics.find((metric) => metric.key === "avgRxDBm")).toMatchObject({ a: -75, b: -70, delta: 5 });
    expect(result.diff.changed).toBe(true);
    expect(result.diff.sections.find((section) => section.id === "rf").changed).toBe(true);
  });

  it.each([
    ["dataset", { dataset: "ankara@2026.07", model: "m1" }, { dataset: "istanbul@2026.01", model: "m1" }, /different datasets/],
    ["model", { dataset: "ankara@2026.07", model: "m1" }, { dataset: "ankara@2026.07", model: "m2" }, /different model versions/],
  ])("withholds deltas for a %s mismatch", (_label, first, second, message) => {
    const result = compareSources({ identity: first, summary: { avgRxDBm: -70 } }, { identity: second, summary: { avgRxDBm: -60 } });
    expect(result.compatible).toBe(false);
    expect(result.incompatibility).toMatch(message);
    expect(result.metrics).toEqual([]);
  });

  it("does not treat an unknown identity as incompatible", () => {
    const result = compareSources({ identity: { dataset: "ankara@2026.07", model: null }, summary: { avgRxDBm: -70 } }, { identity: { dataset: "ankara@2026.07", model: "m1" }, summary: { avgRxDBm: -60 } });
    expect(result.compatible).toBe(true);
  });
});
