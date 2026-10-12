import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const reportModules = vi.hoisted(() => ({
  buildPlanningReport: vi.fn(),
  buildHistoricalPlanningReport: vi.fn(),
  downloadMarkdownReport: vi.fn(),
  openPdfReport: vi.fn(),
  buildReportArtifactOutput: vi.fn(),
  downloadReportBytes: vi.fn(),
  openStoredHtmlReport: vi.fn(),
}));

vi.mock("../utils/reportExport.js", () => ({
  buildPlanningReport: reportModules.buildPlanningReport,
  buildHistoricalPlanningReport: reportModules.buildHistoricalPlanningReport,
  downloadMarkdownReport: reportModules.downloadMarkdownReport,
  openPdfReport: reportModules.openPdfReport,
}));
vi.mock("../utils/reportArtifact.js", () => ({
  buildReportArtifactOutput: reportModules.buildReportArtifactOutput,
}));
vi.mock("../utils/reportArtifactDownload.js", () => ({
  downloadReportBytes: reportModules.downloadReportBytes,
  openStoredHtmlReport: reportModules.openStoredHtmlReport,
}));

import useReportWorkflow from "./useReportWorkflow.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("useReportWorkflow", () => {
  it("loads report code only on export and keeps generated output usable when artifact retention fails", async () => {
    const report = { domainBinding: { project_id: "project-1" }, view: { title: "Current planning report" } };
    const appError = vi.fn();
    const historyWarning = vi.fn();
    const saveReportDefinition = vi.fn(async (definition) => definition);
    const saveArtifact = vi.fn(async () => null);
    reportModules.buildPlanningReport.mockReturnValue(report);
    reportModules.buildReportArtifactOutput.mockReturnValue({
      artifact: { artifact_id: "artifact-1", media_type: "text/markdown" },
      bytes: new Uint8Array([1, 2, 3]),
    });

    const { result } = renderHook(() => useReportWorkflow({
      activeProject: { id: "project-1", domain: { project_id: "project-1" } },
      activeScenario: { id: "scenario-1", domain: { scenario_id: "scenario-1", current_revision_id: "revision-1" } },
      appMeta: { model_version: "model-1" },
      currentReportInputs: { planningMode: "single", generatedAt: "2026-09-23T10:00:00.000Z" },
      deleteArtifact: vi.fn(async () => true),
      getArtifact: vi.fn(async () => null),
      onArtifactSelected: vi.fn(),
      planDirty: false,
      planningMode: "single",
      runHistoryRuns: [{ run_id: "run-1", run_type: "simulation", status: "succeeded", scenario_revision_id: "revision-1" }],
      saveArtifact,
      saveReportDefinition,
      setApplicationError: appError,
      setHistoryWarning: historyWarning,
    }));

    expect(reportModules.buildPlanningReport).not.toHaveBeenCalled();
    expect(reportModules.buildReportArtifactOutput).not.toHaveBeenCalled();

    await act(async () => result.current.actions.exportCurrentMarkdown());

    const definition = saveReportDefinition.mock.calls[0][0];
    expect(definition).toMatchObject({
      project_id: "project-1",
      scenario_id: "scenario-1",
      scenario_revision_id: "revision-1",
      run_ids: ["run-1"],
      source_kind: "scenario_revision",
    });
    expect(reportModules.buildPlanningReport).toHaveBeenCalledWith({ planningMode: "single", generatedAt: "2026-09-23T10:00:00.000Z" });
    expect(saveArtifact).toHaveBeenCalledWith({ artifact_id: "artifact-1", media_type: "text/markdown" }, new Uint8Array([1, 2, 3]));
    expect(reportModules.downloadReportBytes).toHaveBeenCalled();
    expect(result.current.state.reportWarning).toMatch(/still available for download/);
    expect(appError).not.toHaveBeenCalled();
    expect(historyWarning).not.toHaveBeenCalled();
  });

  it("uses the retained source Run and exact Version for a historical report", async () => {
    const revision = { scenario_revision_id: "revision-1" };
    const scenario = { id: "scenario-1", domain: { scenario_id: "scenario-1", revisions: [revision] } };
    const project = { id: "project-1", domain: { project_id: "project-1" }, scenarios: [scenario] };
    const run = { run_id: "historical-run-1", status: "succeeded", scenario_id: "scenario-1", scenario_revision_id: "revision-1" };
    const report = { domainBinding: { project_id: "project-1", scenario_revision_id: "revision-1" }, view: { title: "Historical report" } };
    const selectedArtifact = vi.fn();
    const openReports = vi.fn();
    reportModules.buildHistoricalPlanningReport.mockReturnValue(report);
    reportModules.buildReportArtifactOutput.mockReturnValue({ artifact: { artifact_id: "historical-artifact" }, bytes: new Uint8Array([4, 5]) });

    const { result } = renderHook(() => useReportWorkflow({
      activeProject: project,
      activeScenario: scenario,
      appMeta: { model_version: "model-1" },
      currentReportInputs: {},
      deleteArtifact: vi.fn(),
      getArtifact: vi.fn(),
      onArtifactSelected: selectedArtifact,
      onHistoricalReportCreated: openReports,
      planDirty: true,
      planningMode: "single",
      runHistoryRuns: [run],
      saveArtifact: vi.fn(async () => ({ artifact_id: "historical-artifact" })),
      saveReportDefinition: vi.fn(async (definition) => definition),
      setApplicationError: vi.fn(),
      setHistoryWarning: vi.fn(),
    }));

    await act(async () => result.current.actions.generateHistoricalReport(run));

    expect(reportModules.buildHistoricalPlanningReport).toHaveBeenCalledWith({
      appMeta: { model_version: "model-1" },
      project,
      scenario,
      scenarioRevision: revision,
      runs: [run],
    });
    expect(reportModules.buildReportArtifactOutput).toHaveBeenCalledWith(expect.objectContaining({
      report,
      reportDefinition: expect.objectContaining({ source_kind: "historical_run", run_ids: ["historical-run-1"] }),
      format: "markdown",
    }));
    expect(selectedArtifact).toHaveBeenCalledWith("historical-artifact");
    expect(openReports).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.state.reportWarning).toMatch(/source Run and Version/));
  });
});
