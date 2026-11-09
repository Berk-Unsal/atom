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
const nativeCapabilities = vi.hoisted(() => ({ nativeReports: false }));
vi.mock("../platform/index.js", () => ({ platform: { capabilities: nativeCapabilities } }));

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
  nativeCapabilities.nativeReports = false;
  vi.clearAllMocks();
});

describe("useReportWorkflow", () => {
  it("keeps another native output from starting while the first destination is still pending", async () => {
    nativeCapabilities.nativeReports = true; let finish;
    reportModules.buildPlanningReport.mockReturnValue({ domainBinding: { project_id: "project-1" }, view: { title: "Captured" } });
    reportModules.buildReportArtifactOutput.mockReturnValue({ artifact: { artifact_id: "a" }, bytes: new Uint8Array([1]) });
    reportModules.downloadReportBytes.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useReportWorkflow({ activeProject: { id: "project-1" }, currentReportInputs: {}, planningMode: "single",
      saveReportDefinition: vi.fn(async () => ({})), saveArtifact: vi.fn(async () => ({ artifact_id: "a" })) }));
    let first; act(() => { first = result.current.actions.exportCurrentMarkdown(); });
    await waitFor(() => expect(finish).toBeTypeOf("function")); expect(result.current.state.outputBusy).toBe(true);
    await act(async () => { expect(await result.current.actions.exportCurrentHtml()).toEqual({ canceled: true, busy: true }); });
    expect(reportModules.buildPlanningReport).toHaveBeenCalledOnce();
    await act(async () => { finish({ canceled: true }); await first; }); expect(result.current.state.outputBusy).toBe(false);
  });
  it.each(["markdown", "html"])("a native %s output failure never regenerates or opens a second destination", async (format) => {
    nativeCapabilities.nativeReports = true;
    const report = { domainBinding: { project_id: "project-1" }, view: { title: "Captured source" } };
    const metadata = { artifact_id: "retained-original", format }; const bytes = new Uint8Array([1, 2, 3]);
    reportModules.buildPlanningReport.mockReturnValue(report); reportModules.buildReportArtifactOutput.mockReturnValue({ artifact: metadata, bytes });
    const download = format === "markdown" ? reportModules.downloadReportBytes : reportModules.openStoredHtmlReport;
    download.mockRejectedValueOnce(new Error("Destination full"));
    const error = vi.fn(); const saveArtifact = vi.fn(async () => metadata);
    const { result } = renderHook(() => useReportWorkflow({ activeProject: { id: "project-1" }, currentReportInputs: {},
      planningMode: "single", saveReportDefinition: vi.fn(async () => ({})), saveArtifact, setApplicationError: error }));
    await act(async () => result.current.actions[format === "markdown" ? "exportCurrentMarkdown" : "exportCurrentHtml"]());
    expect(error).toHaveBeenCalledWith("Destination full"); expect(reportModules.buildPlanningReport).toHaveBeenCalledOnce();
    expect(saveArtifact).toHaveBeenCalledOnce(); expect(download).toHaveBeenCalledOnce();
    expect(reportModules.downloadMarkdownReport).not.toHaveBeenCalled(); expect(reportModules.openPdfReport).not.toHaveBeenCalled();
  });
  it("native Print uses captured HTML bytes after failed retention without re-rendering the report", async () => {
    nativeCapabilities.nativeReports = true;
    reportModules.buildPlanningReport.mockReturnValue({ domainBinding: { project_id: "project-1" }, view: { title: "Original" } });
    const artifact = { artifact_id: "original", format: "html" }; const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 1]);
    reportModules.buildReportArtifactOutput.mockReturnValue({ artifact, bytes }); reportModules.openStoredHtmlReport.mockResolvedValueOnce({ canceled: true });
    const error = vi.fn();
    const { result } = renderHook(() => useReportWorkflow({ activeProject: { id: "project-1" }, currentReportInputs: {}, planningMode: "single",
      saveReportDefinition: vi.fn(async () => ({})), saveArtifact: vi.fn(async () => null), setApplicationError: error }));
    await act(async () => result.current.actions.exportCurrentPrint());
    expect(reportModules.openStoredHtmlReport).toHaveBeenCalledWith(artifact, bytes, { mode: "print" });
    expect(reportModules.buildPlanningReport).toHaveBeenCalledOnce(); expect(reportModules.openPdfReport).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it("missing retained bytes stay unavailable without generating substitute evidence", async () => {
    nativeCapabilities.nativeReports = true; const error = vi.fn();
    const { result } = renderHook(() => useReportWorkflow({ getArtifact: vi.fn(async () => { throw new Error("Retained bytes unavailable"); }), setApplicationError: error }));
    await act(async () => result.current.actions.downloadArtifact({ artifact_id: "missing" }));
    expect(error).toHaveBeenCalledWith("Retained bytes unavailable"); expect(reportModules.buildPlanningReport).not.toHaveBeenCalled(); expect(reportModules.downloadReportBytes).not.toHaveBeenCalled();
  });
  it("does not borrow an older optimization Run for the current network evaluation", () => {
    const { result } = renderHook(() => useReportWorkflow({
      activeProject: { id: "project-1", name: "Example" },
      activeScenario: { id: "scenario-1", domain: { current_revision_id: "revision-1", revisions: [{ scenario_revision_id: "revision-1", revision: 2 }] } },
      planningMode: "network", planDirty: false,
      currentReportInputs: { networkResultKind: "evaluation" },
      runHistoryRuns: [{ run_id: "older-optimizer", run_type: "optimization", status: "succeeded", scenario_revision_id: "revision-1" }],
    }));
    expect(result.current.state.currentReportSource).toMatchObject({ run_ids: [], runs: [], version_label: "Version 2" });
  });
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
    expect(reportModules.buildPlanningReport).toHaveBeenCalledWith(expect.objectContaining({ planningMode: "single", generatedAt: "2026-09-23T10:00:00.000Z", domainBinding: expect.objectContaining({ scenario_revision_id: "revision-1", run_ids: ["run-1"] }), sourceContext: expect.objectContaining({ run_ids: ["run-1"] }) }));
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
