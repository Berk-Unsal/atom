import { describe, expect, it } from "vitest";
import {
  CORE_LAB_SCENARIOS,
  DEFAULT_RECOMMENDATION_RESULTS,
  DEFAULT_SIMULATION,
  NETWORK_TECH_OPTIONS,
  networkTechnologyForFrequency,
} from "../generated/policy.js";

describe("generated RF policy", () => {
  it("classifies frequencies at the canonical technology boundaries", () => {
    expect(networkTechnologyForFrequency(2.6)).toBe("4g");
    expect(networkTechnologyForFrequency(9.999)).toBe("4g");
    expect(networkTechnologyForFrequency(10)).toBe("5g");
    expect(networkTechnologyForFrequency(99.999)).toBe("5g");
    expect(networkTechnologyForFrequency(100)).toBe("6g");
  });

  it("provides UI defaults and unique scenario IDs from the generated binding", () => {
    expect(DEFAULT_SIMULATION).toMatchObject({
      frequencyGHz: 28,
      interferenceBandwidthMHz: 100,
      rayCount: 120,
    });
    expect(DEFAULT_RECOMMENDATION_RESULTS).toBe(5);
    expect(NETWORK_TECH_OPTIONS.find((technology) => technology.id === "4g")?.bandwidthsMHz)
      .toEqual([1.4, 3, 5, 10, 15, 20]);
    expect(new Set(CORE_LAB_SCENARIOS.map((scenario) => scenario.id)).size)
      .toBe(CORE_LAB_SCENARIOS.length);
  });
});
