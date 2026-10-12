import { describe, expect, it } from "vitest";
import { createReportDefinition } from "../domain/report.js";
import { buildPlanningReport } from "./reportExport.js";
import { buildReportArtifactOutput } from "./reportArtifact.js";

describe("report artifact output", () => {
  it("uses one report model for Markdown and HTML and regeneration creates a new artifact identity", () => {
    const generatedAt = new Date("2026-09-21T10:00:00.000Z");
    const report = buildPlanningReport({
      generatedAt,
      appMeta: { application_version: "0.8.0", dataset: { name: "Ankara", version: "2026.09" } },
      planningMode: "single",
      project: { id: "project-1", name: "Plan", activeScenarioId: "scenario-1", scenarios: [{ id: "scenario-1", name: "Baseline" }] },
      selectedTower: { id: "cell-1", cellId: "cell-1", coordinates: [32.85, 39.92], azimuth: 90, rfProfile: { frequencyGHz: 2.6 } },
      settings: { frequencyGHz: 2.6, radiusMeters: 400, txPowerDbm: 30 },
      simulation: { stats: { avg_rx_dbm: -88 }, geojson: { type: "FeatureCollection", features: [] } },
      stats: { avgPower: -88, maxRange: 400, minRange: 20, blockedRatio: 2, rayCount: 0 },
    });
    const definition = createReportDefinition({
      report_id: "report-1",
      project_id: "project-1",
      scenario_id: "scenario-1",
      scenario_revision_id: "revision-1",
      run_ids: ["run-1"],
      title: "Baseline report",
      sections: ["executive_summary"],
      source_kind: "historical_run",
    });

    const markdown = buildReportArtifactOutput({ report, reportDefinition: definition, format: "markdown" });
    const html = buildReportArtifactOutput({ report, reportDefinition: definition, format: "html" });
    const regenerated = buildReportArtifactOutput({ report, reportDefinition: definition, format: "markdown" });

    expect(markdown.artifact.artifact_id).not.toBe(regenerated.artifact.artifact_id);
    expect(markdown.artifact.report_id).toBe("report-1");
    expect(markdown.artifact.scenario_revision_id).toBe("revision-1");
    expect(markdown.artifact.run_ids).toEqual(["run-1"]);
    expect(new TextDecoder().decode(markdown.bytes)).toContain("# A.T.O.M Single-cell RF Planning Report");
    expect(html.artifact.media_type).toContain("text/html");
    expect(new TextDecoder().decode(html.bytes)).toContain("data-report-section=\"executive-summary\"");
    expect(new TextDecoder().decode(markdown.bytes)).toBe(new TextDecoder().decode(regenerated.bytes));
  });
});
