import { describe, expect, it } from "vitest";
import { createDefaultOptimizationConfig, normalizeOptimizationConfig, optimizationConfigToPayload } from "./optimizationConfig.js";

describe("optimization configuration", () => {
  it("creates independent defaults for all supported objectives", () => {
    const first = createDefaultOptimizationConfig();
    const second = createDefaultOptimizationConfig();
    first.objectives[0].weight = 4;
    expect(second.objectives.map((objective) => objective.id)).toEqual(["demand", "residential", "coverage", "overlap"]);
    expect(second.objectives[0].weight).toBe(1);
  });

  it("normalizes persisted values and omits empty constraints", () => {
    const normalized = normalizeOptimizationConfig({
      objectives: [{ id: "coverage", weight: 500 }, { id: "unknown", weight: 2 }],
      constraints: { min_coverage_score: "12.5", max_overlap_buildings: "" },
    });
    expect(normalized.objectives).toEqual([{ id: "coverage", weight: 100 }]);
    expect(normalized.constraints).toEqual({ min_coverage_score: 12.5 });
  });

  it("serializes non-negative integer constraints", () => {
    const payload = optimizationConfigToPayload({
      objectives: [{ id: "overlap", weight: 2 }],
      constraints: { max_overlap_buildings: 4.8, min_unique_demand_buildings: -2 },
    });
    expect(payload).toEqual({
      objectives: [{ id: "overlap", weight: 2 }],
      constraints: { max_overlap_buildings: 4 },
    });
  });
});
