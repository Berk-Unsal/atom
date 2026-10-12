import { describe, expect, it } from "vitest";
import {
  explainInterferenceSample,
  interferenceCountLabel,
  interferenceMeasurementFamilyLabel,
  interferenceServingCellLabel,
  interferenceStrongestInterfererLabel,
  resolveInterferenceSampleFreshness,
} from "./interferenceInspector.js";

describe("interference inspector evidence", () => {
  it("does not infer no-signal, zero-interferer, or LTE facts from absent fields", () => {
    const properties = {};
    expect(interferenceServingCellLabel(properties)).toBe("—");
    expect(interferenceStrongestInterfererLabel(properties)).toBe("—");
    expect(interferenceCountLabel(properties.interferer_count)).toBe("—");
    expect(interferenceCountLabel(properties.wall_count)).toBe("—");
    expect(interferenceMeasurementFamilyLabel({})).toBe("Measurement family unavailable");
    expect(explainInterferenceSample(properties)).toContain("UNAVAILABLE");
  });

  it("labels explicit no-signal and zero-interferer evidence", () => {
    expect(interferenceServingCellLabel({ quality_class: "no_signal" })).toBe("No signal");
    expect(interferenceStrongestInterfererLabel({ quality_class: "no_signal" })).toBe("No signal");
    expect(interferenceStrongestInterfererLabel({ interferer_count: 0, rsrp_dbm: -90, quality_class: "good" })).toBe("Noise-limited");
    expect(interferenceCountLabel(0)).toBe("0");
    expect(interferenceMeasurementFamilyLabel({ measurement_family: "nr_ss" })).toBe("Modeled SS-RSRP / SS-RSRQ");
  });

  it("associates a retained sample with the exact local result context and marks edits stale", () => {
    const context = {
      analysis_id: "interference-3",
      project_id: "project-1",
      scenario_id: "scenario-1",
      scenario_revision_id: "revision-4",
      sample_ids: ["sample-2"],
    };
    const lineage = { project_id: "project-1", scenario_id: "scenario-1", scenario_revision_id: "revision-4" };
    expect(resolveInterferenceSampleFreshness(context, "sample-2", lineage, false)).toBe("current");
    expect(resolveInterferenceSampleFreshness(context, "sample-2", lineage, true)).toBe("stale");
    expect(resolveInterferenceSampleFreshness(context, "sample-2", { ...lineage, scenario_revision_id: "revision-5" }, false)).toBe("stale");
    expect(resolveInterferenceSampleFreshness(null, "sample-2", lineage, false)).toBe("unavailable");
    expect(resolveInterferenceSampleFreshness(context, "missing", lineage, false)).toBe("unavailable");
  });
});
