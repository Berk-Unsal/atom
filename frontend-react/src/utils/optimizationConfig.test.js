import { describe, expect, it } from "vitest";
import {
  buildCellExplanationCacheKey,
  buildCellMarginalEffectView,
  buildNetworkOptimizationComparison,
  buildParetoCellConfigurations,
  buildParetoSolutionComparison,
  calculateCompositeScore,
  createDefaultOptimizationConfig,
  getParetoSolutionId,
  getOptimizationRunKey,
  normalizeObjectiveUtilities,
  normalizeOptimizationConfig,
  normalizePriorityWeights,
  optimizationConfigToPayload,
  optimizationConfigValidationMessage,
  rankParetoSolutions,
  rankOptimizationResponse,
  resolveSelectedParetoSolutionId,
  scoreOptimizationStats,
  OPTIMIZATION_OBJECTIVES,
} from "./optimizationConfig.js";

describe("optimization configuration", () => {
  it("creates independent defaults for all supported objectives", () => {
    const first = createDefaultOptimizationConfig();
    const second = createDefaultOptimizationConfig();
    first.objectives[0].weight = 4;
    expect(second.objectives.map((objective) => objective.id)).toEqual(["demand", "residential", "coverage", "overlap", "radio_quality"]);
    expect(second.objectives.map((objective) => objective.weight)).toEqual([50, 50, 50, 50, 0]);
  });

  it("normalizes persisted values and omits empty constraints", () => {
    const normalized = normalizeOptimizationConfig({
      objectives: [{ id: "coverage", weight: 500 }, { id: "unknown", weight: 2 }],
      constraints: { min_coverage_score: "12.5", max_overlap_buildings: "" },
    });
    expect(normalized.objectives).toEqual([
      { id: "demand", weight: 0 },
      { id: "residential", weight: 0 },
      { id: "coverage", weight: 100 },
      { id: "overlap", weight: 0 },
      { id: "radio_quality", weight: 0 },
    ]);
    expect(normalized.constraints).toEqual({ min_coverage_score: 12.5 });
  });

  it("serializes non-negative integer constraints", () => {
    const payload = optimizationConfigToPayload({
      objectives: [{ id: "overlap", weight: 2 }],
      constraints: { max_overlap_buildings: 4.8, min_unique_demand_buildings: -2 },
    });
    expect(payload).toEqual({
      objectives: [
        { id: "demand", weight: 0 },
        { id: "residential", weight: 0 },
        { id: "coverage", weight: 0 },
        { id: "overlap", weight: 2 },
        { id: "radio_quality", weight: 0 },
      ],
      constraints: { max_overlap_buildings: 4 },
    });
  });

  it("normalizes priorities without requiring them to sum to 100", () => {
    const weights = normalizePriorityWeights({
      objectives: [
        { id: "demand", weight: 80 },
        { id: "residential", weight: 60 },
        { id: "coverage", weight: 70 },
        { id: "overlap", weight: 35 },
      ],
    });
    expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(weights.demand).toBeCloseTo(80 / 245);
  });

  it("rejects an all-zero priority configuration", () => {
    const config = { objectives: [
      { id: "demand", weight: 0 },
      { id: "residential", weight: 0 },
      { id: "coverage", weight: 0 },
      { id: "overlap", weight: 0 },
    ] };
    expect(optimizationConfigValidationMessage(config)).toMatch(/at least one/i);
    expect(normalizePriorityWeights(config)).toEqual({ demand: 0, residential: 0, coverage: 0, overlap: 0, radio_quality: 0 });
  });

  it("normalizes objective utilities and reverses overlap into positive utility", () => {
    const utilities = normalizeObjectiveUtilities({
      raw_metrics: {
        served_weighted_demand: 60,
        total_weighted_demand: 100,
        residential_covered: 3,
        residential_total: 4,
        coverage_reach_score: 90,
        coverage_reach_maximum: 100,
        covered_units: 10,
        overlap_buildings: 2,
      },
    });
    expect(utilities).toEqual({ demand: 0.6, residential: 0.75, coverage: 0.9, overlap: 0.8, radio_quality: null });
  });

  it("uses fixed-domain radio serviceability directly as a stable utility", () => {
    const stats = {
      raw_metrics: {
        radio_quality_total_samples: 8,
        radio_quality_serviceable_samples: 3,
        radio_quality_serviceable_fraction: 0.375,
      },
      objective_status: { radio_quality: { available: true } },
    };
    expect(normalizeObjectiveUtilities(stats).radio_quality).toBe(0.375);
    const scored = scoreOptimizationStats(stats, { objectives: [{ id: "radio_quality", weight: 100 }] });
    expect(scored.objectives.radio_quality).toBe(0.375);
    expect(scored.score).toBe(37.5);
    expect(scored.objective_breakdown.radio_quality).toEqual({ utility: 0.375, weight: 1, contribution: 0.375 });
  });

  it("uses relevant-domain aliases and represents unavailable objectives as N/A", () => {
    const utilities = normalizeObjectiveUtilities({
      raw_metrics: {
        served_demand_weight: 60,
        relevant_demand_weight: 100,
        residential_covered: 0,
        relevant_residential_total: 0,
        propagation_reach_score: 90,
        propagation_reach_maximum: 100,
        covered_units: 10,
        overlap_buildings: 2,
      },
      objective_status: {
        demand: { available: true },
        residential: { available: false, reason: "no_relevant_entities" },
        coverage: { available: true },
        overlap: { available: true },
      },
    });
    expect(utilities).toEqual({ demand: 0.6, residential: null, coverage: 0.9, overlap: 0.8, radio_quality: null });
  });

  it("does not turn incomplete legacy raw metrics into numeric utilities", () => {
    const utilities = normalizeObjectiveUtilities({
      raw_metrics: {
        served_demand_weight: 60,
        relevant_demand_weight: 100,
      },
    });
    expect(utilities).toEqual({ demand: 0.6, residential: null, coverage: null, overlap: null, radio_quality: null });
  });

  it("renormalizes effective weights without mutating configured priorities", () => {
    const config = { objectives: [
      { id: "demand", weight: 60 },
      { id: "residential", weight: 80 },
      { id: "coverage", weight: 50 },
      { id: "overlap", weight: 40 },
    ] };
    const status = { residential: { available: false, reason: "no_relevant_entities" } };
    const weights = normalizePriorityWeights(config, status);
    expect(weights).toEqual({ demand: 60 / 150, residential: 0, coverage: 50 / 150, overlap: 40 / 150, radio_quality: 0 });
    expect(config.objectives[1].weight).toBe(80);
  });

  it("uses propagation reach as the canonical objective label while retaining the coverage ID", () => {
    expect(OPTIMIZATION_OBJECTIVES.find((objective) => objective.id === "coverage")).toMatchObject({ label: "Propagation reach" });
  });

  it("calculates composite scores from normalized utilities", () => {
    const weights = normalizePriorityWeights({ objectives: [
      { id: "demand", weight: 80 },
      { id: "residential", weight: 60 },
      { id: "coverage", weight: 70 },
      { id: "overlap", weight: 35 },
    ] });
    const score = calculateCompositeScore({ demand: 0.87, residential: 0.787, coverage: 0.81, overlap: 0.91 }, weights);
    expect(score).toBeCloseTo(
      weights.demand * 0.87 + weights.residential * 0.787 + weights.coverage * 0.81 + weights.overlap * 0.91,
    );
    expect(score * 100).toBeGreaterThanOrEqual(0);
    expect(score * 100).toBeLessThanOrEqual(100);
  });

  it("re-ranks stored Pareto solutions when priorities change", () => {
    const response = {
      stats: {},
      pareto_frontier: [
        { towers: [{ id: "a", azimuth_deg: 0 }], stats: { objectives: { demand: 0.9, residential: 0.2, coverage: 0.5, overlap: 0.5 } } },
        { towers: [{ id: "a", azimuth_deg: 10 }], stats: { objectives: { demand: 0.2, residential: 0.9, coverage: 0.5, overlap: 0.5 } } },
      ],
      optimization: { recommended: true },
    };
    const demandFirst = rankOptimizationResponse(response, { objectives: [{ id: "demand", weight: 100 }] });
    const residentialFirst = rankOptimizationResponse(response, { objectives: [{ id: "residential", weight: 100 }] });
    expect(demandFirst.optimized_towers[0].optimal_azimuth).toBe(0);
    expect(residentialFirst.optimized_towers[0].optimal_azimuth).toBe(10);
    expect(demandFirst.stats.score).toBeGreaterThanOrEqual(0);
    expect(residentialFirst.stats.objective_breakdown.demand.weight).toBe(0);
  });

  it("re-ranks evaluated stored radio-quality metrics without another RF request", () => {
    const frontier = [
      {
        id: "propagation-first",
        towers: [{ id: "a", azimuth_deg: 0 }],
        stats: statsForComparison({ radio_quality_serviceable_fraction: 0.2, radio_quality_total_samples: 10 }),
      },
      {
        id: "radio-first",
        towers: [{ id: "a", azimuth_deg: 10 }],
        stats: statsForComparison({ radio_quality_serviceable_fraction: 0.8, radio_quality_total_samples: 10 }),
      },
    ];
    for (const solution of frontier) solution.stats.objective_status.radio_quality = { available: true };
    const ranked = rankParetoSolutions(frontier, { objectives: [{ id: "radio_quality", weight: 100 }] });
    expect(ranked[0].id).toBe("radio-first");
    expect(ranked[0].stats.objective_breakdown.radio_quality.contribution).toBe(0.8);
  });

  it("does not fabricate radio quality when a saved run lacks fixed-domain metrics", () => {
    const response = networkComparisonResponse();
    response.stats.objective_status.radio_quality = { available: false, reason: "disabled" };
    response.baseline.stats.objective_status.radio_quality = { available: false, reason: "disabled" };
    const ranked = rankOptimizationResponse(response, { objectives: [{ id: "radio_quality", weight: 100 }] });
    expect(ranked.stats.objectives.radio_quality).toBeNull();
    expect(ranked.stats.objective_status.radio_quality.available).toBe(false);
    expect(ranked.stats.objective_status.radio_quality.reason).toBe("not_evaluated");
    expect(ranked.optimization.effective_weights.radio_quality).toBe(0);
  });

  it("builds same-domain baseline and optimized comparison metrics", () => {
    const response = networkComparisonResponse();
    const comparison = buildNetworkOptimizationComparison(response, defaultComparisonConfig());
    expect(comparison.metrics.demand.denominator).toBe(1315);
    expect(comparison.metrics.residential.denominator).toBe(42);
    expect(comparison.metrics.propagation_reach.denominator).toBe(100);
    expect(comparison.metrics.demand.absolute_delta).toBe(220);
    expect(comparison.metrics.demand.relative_delta).toBeCloseTo(220 / 410);
    expect(comparison.metrics.residential.absolute_delta).toBe(5);
    expect(comparison.metrics.propagation_reach.absolute_delta).toBeCloseTo(0.055);
    expect(comparison.metrics.overlap.absolute_delta).toBeCloseTo(-0.077);
    expect(comparison.metrics.score.absolute_delta).toBeCloseTo(10.4587, 3);
    expect(comparison.baseline_solution.constraints_satisfied).toBe(false);
    expect(comparison.optimized_solution.constraints_satisfied).toBe(true);
  });

  it("classifies lower overlap as an improvement and preserves worsened trade-offs", () => {
    const response = networkComparisonResponse({
      optimizedRaw: {
        propagation_reach_score: 45,
        overlap_ratio: 0.075,
      },
    });
    const comparison = buildNetworkOptimizationComparison(response, defaultComparisonConfig());
    expect(comparison.metrics.overlap.preferred_direction).toBe("lower");
    expect(comparison.metrics.overlap.outcome).toBe("improved");
    expect(comparison.metrics.propagation_reach.outcome).toBe("worsened");
  });

  it("returns a null relative delta for zero baseline demand", () => {
    const response = networkComparisonResponse({
      baselineRaw: { served_demand_weight: 0 },
      optimizedRaw: { served_demand_weight: 12 },
    });
    const comparison = buildNetworkOptimizationComparison(response, defaultComparisonConfig());
    expect(comparison.metrics.demand.absolute_delta).toBe(12);
    expect(comparison.metrics.demand.relative_delta).toBeNull();
    expect(JSON.stringify(comparison)).not.toMatch(/NaN|Infinity/);
  });

  it("keeps unavailable objectives out of both comparison scores", () => {
    const response = networkComparisonResponse();
    response.baseline.stats.objective_status.residential = { available: false, reason: "no_relevant_entities" };
    response.stats.objective_status.residential = { available: false, reason: "no_relevant_entities" };
    const comparison = buildNetworkOptimizationComparison(response, defaultComparisonConfig());
    expect(comparison.metrics.residential.available).toBe(false);
    expect(comparison.metrics.residential.baseline).toBeNull();
    expect(comparison.metrics.residential.utility).toBeNull();
    expect(comparison.effective_weights.residential).toBe(0);
    expect(comparison.baseline_solution.stats.objective_status.residential.utility).toBeNull();
    expect(comparison.optimized_solution.stats.objective_status.residential.utility).toBeNull();
  });

  it("re-scores both sides and changes the optimized identity during local re-ranking", () => {
    const response = networkComparisonResponse({
      paretoFrontier: [
        {
          id: "solution-demand",
          towers: [{ id: "a", azimuth_deg: 0 }],
          stats: statsForComparison({ served_demand_weight: 630, residential_covered: 15, propagation_reach_score: 57.9, overlap_ratio: 0.075 }),
        },
        {
          id: "solution-residential",
          towers: [{ id: "a", azimuth_deg: 10 }],
          stats: statsForComparison({ served_demand_weight: 450, residential_covered: 25, propagation_reach_score: 50, overlap_ratio: 0.1 }),
        },
      ],
    });
    const demandConfig = { objectives: [{ id: "demand", weight: 100 }] };
    const residentialConfig = { objectives: [{ id: "residential", weight: 100 }] };
    const demandResponse = rankOptimizationResponse(response, demandConfig);
    const residentialResponse = rankOptimizationResponse(response, residentialConfig);
    const demandComparison = buildNetworkOptimizationComparison(demandResponse, demandConfig);
    const residentialComparison = buildNetworkOptimizationComparison(residentialResponse, residentialConfig);

    expect(demandComparison.optimized_solution_id).toBe("solution-demand");
    expect(residentialComparison.optimized_solution_id).toBe("solution-residential");
    expect(demandComparison.baseline_solution.stats.score).not.toBe(residentialComparison.baseline_solution.stats.score);
    expect(demandComparison.optimized_solution.stats.score).not.toBe(residentialComparison.optimized_solution.stats.score);
    expect(demandResponse.optimized_towers[0].optimal_azimuth).toBe(0);
    expect(residentialResponse.optimized_towers[0].optimal_azimuth).toBe(10);
  });

  it("does not fabricate comparison data for legacy results without a baseline", () => {
    expect(buildNetworkOptimizationComparison({ stats: statsForComparison({}) }, defaultComparisonConfig())).toBeNull();
  });

  it("is deterministic for identical retained optimization data", () => {
    const response = networkComparisonResponse();
    const config = defaultComparisonConfig();
    expect(buildNetworkOptimizationComparison(response, config)).toEqual(buildNetworkOptimizationComparison(response, config));
  });

  it("derives stable solution identity from cell configuration and reuses backend IDs", () => {
    const first = { towers: [{ id: "b", azimuth_deg: 10 }, { id: "a", azimuth_deg: 20 }] };
    const sameConfiguration = { towers: [{ id: "a", azimuth_deg: 20 }, { id: "b", azimuth_deg: 10 }] };
    expect(getParetoSolutionId(first)).toBe(getParetoSolutionId(sameConfiguration));
    expect(getParetoSolutionId({ ...first, id: "backend-solution-id" })).toBe("backend-solution-id");
  });

  it("keeps solution identity independent from rank", () => {
    const frontier = [
      { id: "demand-solution", towers: [{ id: "a", azimuth_deg: 0 }], stats: statsForComparison({ served_demand_weight: 630, residential_covered: 10 }) },
      { id: "residential-solution", towers: [{ id: "a", azimuth_deg: 10 }], stats: statsForComparison({ served_demand_weight: 450, residential_covered: 25 }) },
    ];
    const demandFirst = rankParetoSolutions(frontier, { objectives: [{ id: "demand", weight: 100 }] });
    const residentialFirst = rankParetoSolutions(frontier, { objectives: [{ id: "residential", weight: 100 }] });
    expect(demandFirst.map((solution) => solution.id)).toEqual(["demand-solution", "residential-solution"]);
    expect(residentialFirst.map((solution) => solution.id)).toEqual(["residential-solution", "demand-solution"]);
    expect(new Set([...demandFirst, ...residentialFirst].map((solution) => solution.id))).toEqual(new Set(["demand-solution", "residential-solution"]));
  });

  it("marks the highest current score as recommended while preserving selected identity", () => {
    const response = networkComparisonResponse({
      paretoFrontier: [
        { id: "lower-score", towers: [{ id: "a", azimuth_deg: 0 }], stats: statsForComparison({ served_demand_weight: 400 }) },
        { id: "higher-score", towers: [{ id: "a", azimuth_deg: 10 }], stats: statsForComparison({ served_demand_weight: 700 }) },
      ],
    });
    const ranked = rankOptimizationResponse(response, { objectives: [{ id: "demand", weight: 100 }] });
    expect(ranked.optimization.recommended_solution_id).toBe("higher-score");
    expect(resolveSelectedParetoSolutionId(ranked.pareto_frontier, "higher-score", "lower-score")).toBe("lower-score");
    expect(resolveSelectedParetoSolutionId(ranked.pareto_frontier, "higher-score", null)).toBe("higher-score");
    expect(resolveSelectedParetoSolutionId(ranked.pareto_frontier, "higher-score", "missing-solution")).toBe("higher-score");
  });

  it("compares selected against recommended in selected-minus-recommended direction", () => {
    const selected = {
      id: "selected-alternative",
      towers: [{ id: "a", azimuth_deg: 30 }],
      stats: statsForComparison({
        served_demand_weight: 685,
        residential_covered: 13,
        propagation_reach_score: 60,
        overlap_ratio: 0.11,
      }),
    };
    const recommended = {
      id: "recommended",
      towers: [{ id: "a", azimuth_deg: 0 }],
      stats: statsForComparison({
        served_demand_weight: 630,
        residential_covered: 15,
        propagation_reach_score: 57.9,
        overlap_ratio: 0.075,
      }),
    };
    const config = { objectives: [{ id: "demand", weight: 100 }] };
    const comparison = buildParetoSolutionComparison(selected, recommended, config);
    expect(comparison.selected_solution_id).toBe("selected-alternative");
    expect(comparison.recommended_solution_id).toBe("recommended");
    expect(comparison.metrics.demand.absolute_delta).toBeCloseTo((685 - 630) / 1315);
    expect(comparison.metrics.overlap.absolute_delta).toBeCloseTo(0.035);
    expect(comparison.metrics.overlap.outcome).toBe("worsened");
    expect(comparison.metrics.score.selected).toBeCloseTo((685 / 1315) * 100);
    expect(comparison.metrics.score.recommended).toBeCloseTo((630 / 1315) * 100);
  });

  it("keeps unavailable objectives as N/A in solution comparisons", () => {
    const selected = { id: "selected", towers: [{ id: "a", azimuth_deg: 30 }], stats: statsForComparison() };
    const recommended = { id: "recommended", towers: [{ id: "a", azimuth_deg: 0 }], stats: statsForComparison() };
    selected.stats.objective_status.residential = { available: false, reason: "no_relevant_entities" };
    recommended.stats.objective_status.residential = { available: false, reason: "no_relevant_entities" };
    const comparison = buildParetoSolutionComparison(selected, recommended, defaultComparisonConfig());
    expect(comparison.metrics.residential.available).toBe(false);
    expect(comparison.metrics.residential.selected).toBeNull();
    expect(comparison.metrics.residential.absolute_delta).toBeNull();
    expect(comparison.effective_weights.residential).toBe(0);
  });

  it("propagates run-level availability to frontier entries missing per-solution status", () => {
    const response = networkComparisonResponse();
    const runStatus = { ...response.stats.objective_status };
    delete response.pareto_frontier[0].stats.objective_status;
    runStatus.residential = { available: false, reason: "no_relevant_entities" };
    response.stats.objective_status = runStatus;
    const ranked = rankOptimizationResponse(response, defaultComparisonConfig());
    expect(ranked.pareto_frontier[0].stats.objective_status.residential.available).toBe(false);
    expect(ranked.pareto_frontier[0].stats.objective_status.residential.utility).toBeNull();
    expect(ranked.pareto_frontier[0].stats.objective_breakdown.residential.utility).toBeNull();
  });

  it("uses deterministic stable-ID order for equal scores", () => {
    const stats = { objectives: { demand: 0.5, residential: 0.5, coverage: 0.5, overlap: 0.5 } };
    const ranked = rankParetoSolutions([
      { id: "solution-z", towers: [{ id: "a", azimuth_deg: 0 }], stats },
      { id: "solution-a", towers: [{ id: "a", azimuth_deg: 10 }], stats },
    ], defaultComparisonConfig());
    expect(ranked.map((solution) => solution.id)).toEqual(["solution-a", "solution-z"]);
  });

  it("normalizes legacy frontier entries without stable IDs", () => {
    const legacy = rankParetoSolutions([
      { towers: [{ id: "a", azimuth_deg: 12.345 }], stats: statsForComparison() },
    ], defaultComparisonConfig());
    expect(legacy).toHaveLength(1);
    expect(legacy[0].id).toBe("a:12.3");
    expect(Number.isFinite(scoreOptimizationStats(legacy[0].stats, defaultComparisonConfig()).score)).toBe(true);
  });

  it("exposes changed and unchanged cell configurations against the retained baseline", () => {
    const baseline = {
      cell_configurations: [
        { id: "a", azimuth_deg: 0 },
        { id: "b", azimuth_deg: 180 },
      ],
    };
    const solution = { towers: [{ id: "a", azimuth_deg: 90 }, { id: "b", azimuth_deg: 180 }] };
    expect(buildParetoCellConfigurations(baseline, solution)).toEqual([
      { id: "a", available: true, baseline_azimuth_deg: 0, selected_azimuth_deg: 90, changed: true },
      { id: "b", available: true, baseline_azimuth_deg: 180, selected_azimuth_deg: 180, changed: false },
    ]);
    expect(buildParetoCellConfigurations(null, solution)[0].available).toBe(false);
  });

  it("keeps overlap direction-aware when an individual effect worsens the score", () => {
    const explanation = cellExplanationResponse({
      actualRaw: {
        served_demand_weight: 30,
        residential_covered: 1,
        propagation_reach_score: 40,
        overlap_buildings: 1,
        overlap_ratio: 0.1,
      },
      counterfactualRaw: {
        served_demand_weight: 90,
        residential_covered: 3,
        propagation_reach_score: 50,
        overlap_buildings: 2,
        overlap_ratio: 0.2,
      },
    });
    const effect = buildCellMarginalEffectView(explanation, {
      objectives: [{ id: "demand", weight: 60 }, { id: "overlap", weight: 40 }],
    });
    expect(effect.metrics.overlap.absolute_delta).toBeCloseTo(-0.1);
    expect(effect.metrics.overlap.outcome).toBe("improved");
    expect(effect.metrics.demand.outcome).toBe("worsened");
    expect(effect.metrics.score.outcome).toBe("worsened");
    expect(effect.metrics.score.absolute_delta).toBeLessThan(0);
    expect(effect.metrics.constraints.counterfactual).toBe(false);
  });

  it("recomputes only priority-sensitive scores while preserving raw marginal sides", () => {
    const explanation = cellExplanationResponse();
    const demandEffect = buildCellMarginalEffectView(explanation, { objectives: [{ id: "demand", weight: 100 }] });
    const overlapEffect = buildCellMarginalEffectView(explanation, { objectives: [{ id: "overlap", weight: 100 }] });
    expect(overlapEffect.actual.raw_metrics).toEqual(demandEffect.actual.raw_metrics);
    expect(overlapEffect.counterfactual.raw_metrics).toEqual(demandEffect.counterfactual.raw_metrics);
    expect(overlapEffect.effective_weights).not.toEqual(demandEffect.effective_weights);
    expect(overlapEffect.metrics.score.actual).not.toBe(demandEffect.metrics.score.actual);
  });

  it("labels unavailable marginal metrics as informational", () => {
    const explanation = cellExplanationResponse();
    explanation.objective_status.demand = { available: false, reason: "no_relevant_entities" };
    const effect = buildCellMarginalEffectView(explanation, { objectives: [{ id: "demand", weight: 100 }] });
    expect(effect.metrics.demand.available).toBe(false);
    expect(effect.metrics.demand.outcome).toBe("informational");
  });

  it("uses run, solution, and cell identity for explanation cache entries", () => {
    const response = { optimization_run_id: "run-1", baseline: { cell_configurations: [] } };
    expect(getOptimizationRunKey(response)).toBe("run-1");
    expect(buildCellExplanationCacheKey(response, "solution-a", "cell-1")).toBe("run-1::solution-a::cell-1");
    expect(buildCellExplanationCacheKey(response, "solution-b", "cell-1")).not.toBe("run-1::solution-a::cell-1");
    expect(buildCellExplanationCacheKey(response, "solution-a", "cell-2")).not.toBe("run-1::solution-a::cell-1");
  });
});

function defaultComparisonConfig() {
  return { objectives: [
    { id: "demand", weight: 50 },
    { id: "residential", weight: 50 },
    { id: "coverage", weight: 50 },
    { id: "overlap", weight: 50 },
  ] };
}

function statsForComparison(overrides = {}) {
  const raw = {
    served_demand_weight: 630,
    relevant_demand_weight: 1315,
    residential_covered: 15,
    relevant_residential_total: 42,
    propagation_reach_score: 57.9,
    propagation_reach_maximum: 100,
    covered_units: 40,
    overlap_buildings: 4,
    overlap_ratio: 0.075,
    ...overrides,
  };
  return {
    raw_metrics: raw,
    objective_status: {
      demand: { available: true },
      residential: { available: true },
      coverage: { available: true },
      overlap: { available: true },
    },
  };
}

function networkComparisonResponse({ baselineRaw = {}, optimizedRaw = {}, paretoFrontier } = {}) {
  const baselineStats = statsForComparison({
    served_demand_weight: 410,
    residential_covered: 10,
    propagation_reach_score: 52.4,
    covered_units: 30,
    overlap_buildings: 8,
    overlap_ratio: 0.152,
    ...baselineRaw,
  });
  const optimizedStats = statsForComparison(optimizedRaw);
  const frontier = paretoFrontier ?? [{ id: "solution-optimized", towers: [{ id: "a", azimuth_deg: 20 }], stats: optimizedStats }];
  return {
    baseline: {
      cell_configurations: [{ id: "a", tower_lon: 32, tower_lat: 39, azimuth_deg: 17, rf_profile: {} }],
      parameters: { rays: 72, radius_m: 400, frequency_ghz: 28, tx_power_dbm: 30, beam_width: 120 },
      stats: baselineStats,
      constraints_satisfied: false,
      violations: ["baseline constraint violation"],
    },
    stats: optimizedStats,
    optimized_towers: [{ id: "a", optimal_azimuth: frontier[0].towers[0].azimuth_deg, rf_profile: {} }],
    optimization_domain: {
      source: "selected_cell_radius_union",
      relevant_demand_entities: 42,
      relevant_residential_entities: 42,
    },
    optimization: {
      recommended: true,
      constraints_satisfied: true,
      recommended_solution_id: frontier[0].id,
      violations: [],
    },
    pareto_frontier: frontier,
  };
}

function cellExplanationResponse({ actualRaw = {}, counterfactualRaw = {} } = {}) {
  const actual = {
    served_demand_weight: 60,
    relevant_demand_weight: 100,
    residential_covered: 2,
    relevant_residential_total: 4,
    propagation_reach_score: 60,
    propagation_reach_maximum: 100,
    covered_units: 10,
    overlap_buildings: 1,
    overlap_ratio: 0.1,
    ...actualRaw,
  };
  const counterfactual = {
    served_demand_weight: 50,
    relevant_demand_weight: 100,
    residential_covered: 2,
    relevant_residential_total: 4,
    propagation_reach_score: 50,
    propagation_reach_maximum: 100,
    covered_units: 10,
    overlap_buildings: 2,
    overlap_ratio: 0.2,
    ...counterfactualRaw,
  };
  return {
    available: true,
    unchanged: false,
    run_id: "run-1",
    solution_id: "solution-a",
    cell: { id: "cell-1", baseline_azimuth_deg: 0, selected_azimuth_deg: 90 },
    actual: { raw_metrics: actual, constraints_satisfied: true, violations: [] },
    counterfactual: { raw_metrics: counterfactual, constraints_satisfied: false, violations: ["minimum demand"] },
    objective_status: {
      demand: { available: true },
      residential: { available: true },
      coverage: { available: true },
      overlap: { available: true },
    },
  };
}
