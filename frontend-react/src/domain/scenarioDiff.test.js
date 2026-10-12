import { describe, expect, it } from "vitest";
import { buildScenarioRevisionDiff } from "./scenarioDiff.js";
import { createScenarioRevision } from "./scenario.js";

describe("ScenarioRevision diff model", () => {
  it("reports input changes by RF, cells, optimization, dataset, and AOI sections", () => {
    const before = createScenarioRevision({
      scenario_id: "scenario-1",
      scenario_revision_id: "version-1",
      revision: 1,
      selected_cell_ids: ["cell-1"],
      enabled_cell_ids: ["cell-1"],
      overrides: { "cell-1": { fields: { azimuth_deg: 30 } } },
      rf_affecting_settings: { frequencyGHz: 28 },
      dataset_references: [{ dataset_id: "ankara", version: "1" }],
    });
    const after = createScenarioRevision({
      ...before,
      scenario_revision_id: "version-2",
      revision: 2,
      parent_revision_id: "version-1",
      selected_cell_ids: ["cell-1", "cell-2"],
      enabled_cell_ids: ["cell-1", "cell-2"],
      overrides: { "cell-1": { fields: { azimuth_deg: 90 } } },
      rf_affecting_settings: { frequencyGHz: 39 },
      objective_constraints: { minCoverage: 0.9 },
      selection_geometry: [[32.8, 39.9]],
    });

    const diff = buildScenarioRevisionDiff(before, after);

    expect(diff.changed).toBe(true);
    expect(diff.sections.find((section) => section.id === "cells").changed).toBe(true);
    expect(diff.sections.find((section) => section.id === "rf").changed).toBe(true);
    expect(diff.sections.find((section) => section.id === "optimization").changed).toBe(true);
    expect(diff.sections.find((section) => section.id === "domain").changed).toBe(true);
    expect(diff.changed_fields).toContain("cells.cell-1");
    expect(diff.changed_fields).toContain("selected_cell_ids");
  });

  it("is deterministic and ignores revision identity metadata", () => {
    const first = createScenarioRevision({ scenario_id: "s", scenario_revision_id: "v1", revision: 1, rf_affecting_settings: { frequencyGHz: 28 } });
    const second = createScenarioRevision({ ...first, scenario_revision_id: "v2", revision: 2, parent_revision_id: "v1", change_summary: "Saved" });
    expect(buildScenarioRevisionDiff(first, first).changed).toBe(false);
    expect(buildScenarioRevisionDiff(first, second).sections.find((section) => section.id === "rf").changed).toBe(false);
  });
});
