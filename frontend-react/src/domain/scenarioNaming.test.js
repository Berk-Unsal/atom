import { describe, expect, it } from "vitest";
import { defaultScenarioName } from "./scenario.js";

describe("default Scenario names", () => {
  it.each([
    ["single", [], "Sector plan 1"],
    ["network", [], "Network plan 1"],
    ["network", [{ name: "Sector plan 1" }], "Network plan 2"],
    ["single", [{ name: "Sector plan 2" }], "Sector plan 3"],
    ["network", [{ name: "Custom" }, { name: "Network plan 3" }], "Network plan 4"],
  ])("names a first save in %s mode after %j as %s", (planningMode, scenarios, expected) => {
    expect(defaultScenarioName({ planningMode, scenarios })).toBe(expected);
  });

  it("does not change existing Scenario names", () => {
    const scenarios = [{ name: "Sector plan 1" }];
    defaultScenarioName({ planningMode: "network", scenarios });
    expect(scenarios).toEqual([{ name: "Sector plan 1" }]);
  });
});
