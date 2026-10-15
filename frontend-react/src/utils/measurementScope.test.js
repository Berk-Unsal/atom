import { describe, expect, it } from "vitest";
import { MAX_MEASUREMENT_CELLS, measurementCellLimitMessage } from "./measurementScope.js";
import { MAX_NETWORK_CELLS, MAX_RECOMMENDATION_CELLS } from "./networkSelection.js";

describe("independent Measurement Validation scope", () => {
  it("keeps normal network8, Recommendation5 and Measurement6 independent", () => {
    expect([MAX_NETWORK_CELLS, MAX_RECOMMENDATION_CELLS, MAX_MEASUREMENT_CELLS]).toEqual([8, 5, 6]);
    expect(measurementCellLimitMessage(6)).toBe("");
  });

  it.each([7, 8])("explains the measurement limit for %i selected Cells", (count) => {
    expect(measurementCellLimitMessage(count)).toMatch(/accepts up to 6 Cells.*Select 6 or fewer/);
  });
});
