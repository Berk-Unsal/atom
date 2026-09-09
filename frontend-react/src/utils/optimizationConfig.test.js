import { describe, expect, it } from "vitest";
import {
  calculateCompositeScore,
  createDefaultOptimizationConfig,
  normalizeObjectiveUtilities,
  normalizeOptimizationConfig,
  normalizePriorityWeights,
  optimizationConfigToPayload,
  optimizationConfigValidationMessage,
  rankOptimizationResponse,
  OPTIMIZATION_OBJECTIVES,
} from "./optimizationConfig.js";

describe("optimization configuration", () => {
  it("creates independent defaults for all supported objectives", () => {
    const first = createDefaultOptimizationConfig();
    const second = createDefaultOptimizationConfig();
    first.objectives[0].weight = 4;
    expect(second.objectives.map((objective) => objective.id)).toEqual(["demand", "residential", "coverage", "overlap"]);
    expect(second.objectives.map((objective) => objective.weight)).toEqual([50, 50, 50, 50]);
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
    expect(normalizePriorityWeights(config)).toEqual({ demand: 0, residential: 0, coverage: 0, overlap: 0 });
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
    expect(utilities).toEqual({ demand: 0.6, residential: 0.75, coverage: 0.9, overlap: 0.8 });
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
    expect(utilities).toEqual({ demand: 0.6, residential: null, coverage: 0.9, overlap: 0.8 });
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
    expect(weights).toEqual({ demand: 60 / 150, residential: 0, coverage: 50 / 150, overlap: 40 / 150 });
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
});
