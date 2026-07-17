import { describe, expect, it } from "vitest";
import { selectScenarioArtifacts } from "./scenarioSnapshot.js";

describe("selectScenarioArtifacts", () => {
  it("does not save stale layers after plan inputs change", () => {
    expect(selectScenarioArtifacts(true, {}, { simulation: { id: "old" } })).toBeNull();
  });

  it("preserves an explicit null override for input-only scenarios", () => {
    expect(selectScenarioArtifacts(false, { artifacts: null }, { simulation: { id: "old" } })).toBeNull();
  });

  it("stores current artifacts for a fresh completed analysis", () => {
    const artifacts = { simulation: { id: "current" } };
    expect(selectScenarioArtifacts(false, {}, artifacts)).toBe(artifacts);
  });
});
