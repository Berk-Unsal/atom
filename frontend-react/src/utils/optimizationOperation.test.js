import { describe, expect, it } from "vitest";
import { describeOptimizationScope } from "./optimizationOperation.js";

describe("submitted optimization scope", () => {
  it.each([[2, 146], [5, 362], [6, 434]])("describes %i cells as two passes and %i proposals", (cellCount, proposals) => {
    for (const search_policy of [undefined, "legacy_two_pass_coordinate"]) {
      expect(describeOptimizationScope({ towers: Array(cellCount).fill({}), search_policy })).toEqual({
        cellCount, passes: 2, proposals, label: `${cellCount} cells · 2 passes · ${proposals} proposals`,
      });
    }
  });

  it.each([
    ["deterministic_multistart_coordinate_v1", "multi-start bounded search"],
    ["deterministic_pareto_archive_search_v1", "Pareto archive search"],
    ["future_policy", "network search"],
  ])("omits exact work for %s", (search_policy, label) => {
    const scope = describeOptimizationScope({ towers: Array(6).fill({}), search_policy });
    expect(scope).toEqual({ cellCount: 6, label: `6 cells · ${label}` });
    expect(scope).not.toHaveProperty("proposals");
    expect(scope).not.toHaveProperty("passes");
  });

  it("reads the actual request without modifying it", () => {
    const request = { towers: [{ id: "a" }, { id: "b" }], optimization: { objectives: [] } };
    const before = JSON.stringify(request);
    describeOptimizationScope(request);
    expect(JSON.stringify(request)).toBe(before);
  });
});
