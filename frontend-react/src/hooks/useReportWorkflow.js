import { useCallback, useMemo, useState } from "react";
import { createReportDefinition } from "../domain/report.js";

const loadReportExportModule = () => importDeferredModule(() => import("../utils/reportExport.js"));
const loadReportArtifactModule = () => importDeferredModule(() => import("../utils/reportArtifact.js"));
const loadReportArtifactDownloadModule = () => importDeferredModule(() => import("../utils/reportArtifactDownload.js"));

/** Coordinates report sources, on-demand renderers, retained artifact storage and downloads. */
export default function useReportWorkflow({
  activeProject,
  activeScenario,
  appMeta,
  currentReportInputs,
  deleteArtifact,
  getArtifact,
  onArtifactSelected = () => {},
  selectedArtifactId = null,
  planDirty,
  planningMode,
  runHistoryRuns = [],
  saveArtifact,
  saveReportDefinition,
  setApplicationError = () => {},
  setHistoryWarning = () => {},
  onHistoricalReportCreated = () => {},
} = {}) {
  const [reportWarning, setReportWarning] = useState("");

  const reportDefinitions = useMemo(
    () => activeProject?.domain?.report_definitions ?? [],
    [activeProject?.domain?.report_definitions],
  );
  const currentReportRuns = useMemo(() => {
    const revisionID = activeScenario?.domain?.current_revision_id;
    if (planDirty || !revisionID) return [];
    const compatible = runHistoryRuns.filter((run) => (
      String(run.scenario_revision_id) === String(revisionID) && run.status === "succeeded"
    ));
    const type = planningMode === "network" ? "optimization" : "simulation";
    return compatible.filter((run) => run.run_type === type).slice(0, 1);
  }, [activeScenario?.domain?.current_revision_id, planDirty, planningMode, runHistoryRuns]);

  const createPlanningReport = useCallback(async () => {
    const { buildPlanningReport } = await loadReportExportModule();
    return buildPlanningReport(currentReportInputs ?? {});
  }, [currentReportInputs]);

  const createCurrentReportDefinition = useCallback((report) => {
    const projectID = activeProject?.domain?.project_id ?? activeProject?.id ?? null;
    const scenarioID = activeScenario?.domain?.scenario_id ?? activeScenario?.id ?? null;
    const revisionID = planDirty ? null : activeScenario?.domain?.current_revision_id ?? null;
    return createReportDefinition({
      project_id: projectID,
      scenario_id: scenarioID,
      scenario_revision_id: revisionID,
      run_ids: planDirty ? [] : currentReportRuns.map((run) => run.run_id),
      title: report?.view?.title ?? (planningMode === "network" ? "Network planning report" : "Single-cell RF planning report"),
      sections: ["executive_summary", "evidence", "result", "configuration", "methodology"],
      presentation_options: { formats: ["markdown", "html"] },
      source_kind: revisionID ? "scenario_revision" : "live_compatibility",
      source_binding: {
        ...(report?.domainBinding ?? {}),
        project_id: projectID,
        scenario_id: scenarioID,
        scenario_revision_id: revisionID,
        run_ids: planDirty ? [] : currentReportRuns.map((run) => run.run_id),
        source_kind: revisionID ? "scenario_revision" : "live_compatibility",
      },
    });
  }, [activeProject, activeScenario, currentReportRuns, planDirty, planningMode]);

  const persistReportArtifact = useCallback(async ({ report, definition, format, download = true } = {}) => {
    const { buildReportArtifactOutput } = await loadReportArtifactModule();
    const output = buildReportArtifactOutput({ report, reportDefinition: definition, format });
    const saved = await saveArtifact(output.artifact, output.bytes);
    if (!saved) {
      setReportWarning("Report generated, but its artifact was not retained locally. The current output is still available for download.");
      if (download && format === "markdown") {
        const { downloadReportBytes } = await loadReportArtifactDownloadModule();
        downloadReportBytes(output.artifact, output.bytes);
      }
      if (download && format === "html") {
        const { openPdfReport } = await loadReportExportModule();
        openPdfReport(report);
      }
      return null;
    }
    setReportWarning("");
    onArtifactSelected(saved.artifact_id);
    if (download && format === "markdown") {
      const { downloadReportBytes } = await loadReportArtifactDownloadModule();
      downloadReportBytes(saved, output.bytes);
    }
    if (download && format === "html") {
      const { openStoredHtmlReport } = await loadReportArtifactDownloadModule();
      openStoredHtmlReport(saved, output.bytes);
    }
    return saved;
  }, [onArtifactSelected, saveArtifact]);

  const exportCurrentMarkdown = useCallback(async () => {
    try {
      const report = await createPlanningReport();
      const definition = createCurrentReportDefinition(report);
      await saveReportDefinition(definition);
      await persistReportArtifact({ report, definition, format: "markdown" });
    } catch (exportError) {
      if (isDeferredModuleLoadError(exportError)) {
        setReportWarning("Report tools could not be loaded. Reload the application to retry the export.");
      } else {
        setApplicationError(exportError.message);
        try {
          const report = await createPlanningReport();
          const { downloadMarkdownReport } = await loadReportExportModule();
          downloadMarkdownReport(report);
        } catch { /* Keep the original persistence error visible. */ }
      }
    }
  }, [createCurrentReportDefinition, createPlanningReport, persistReportArtifact, saveReportDefinition, setApplicationError]);

  const exportCurrentHtml = useCallback(async () => {
    try {
      const report = await createPlanningReport();
      const definition = createCurrentReportDefinition(report);
      await saveReportDefinition(definition);
      await persistReportArtifact({ report, definition, format: "html" });
    } catch (exportError) {
      if (isDeferredModuleLoadError(exportError)) {
        setReportWarning("Report tools could not be loaded. Reload the application to retry the export.");
      } else {
        setApplicationError(exportError.message);
        try {
          const report = await createPlanningReport();
          const { openPdfReport } = await loadReportExportModule();
          openPdfReport(report);
        } catch { /* Keep the original persistence error visible. */ }
      }
    }
  }, [createCurrentReportDefinition, createPlanningReport, persistReportArtifact, saveReportDefinition, setApplicationError]);

  const historicalReportContext = useCallback((run) => {
    const scenario = (activeProject?.scenarios ?? []).find((candidate) => (
      String(candidate.domain?.scenario_id ?? candidate.id) === String(run?.scenario_id)
    )) ?? activeScenario;
    const revision = scenario?.domain?.revisions?.find((candidate) => (
      String(candidate.scenario_revision_id) === String(run?.scenario_revision_id)
    )) ?? null;
    return { revision, scenario };
  }, [activeProject?.scenarios, activeScenario]);

  const generateHistoricalReport = useCallback(async (run) => {
    if (!run || run.status !== "succeeded") return;
    setHistoryWarning("");
    const { revision, scenario } = historicalReportContext(run);
    if (!revision || !scenario) {
      setApplicationError("The exact Scenario Version for this Run is unavailable; no report was generated.");
      return;
    }
    try {
      const { buildHistoricalPlanningReport } = await loadReportExportModule();
      const report = buildHistoricalPlanningReport({
        appMeta,
        project: activeProject,
        scenario,
        scenarioRevision: revision,
        runs: [run],
      });
      const definition = createReportDefinition({
        project_id: activeProject?.domain?.project_id ?? activeProject?.id,
        scenario_id: run.scenario_id,
        scenario_revision_id: run.scenario_revision_id,
        run_ids: [run.run_id],
        title: report.view?.title ?? "Historical planning report",
        sections: ["executive_summary", "evidence", "result", "configuration", "methodology"],
        presentation_options: { formats: ["markdown", "html"] },
        source_kind: "historical_run",
        source_binding: report.domainBinding,
      });
      await saveReportDefinition(definition);
      const saved = await persistReportArtifact({ report, definition, format: "markdown", download: false });
      if (saved) {
        setReportWarning("Historical report retained locally. Its source Run and Version are shown in Reports.");
        onHistoricalReportCreated();
      }
    } catch (reportError) {
      if (isDeferredModuleLoadError(reportError)) {
        setHistoryWarning("Report generation code could not be loaded. Reload the application, reopen this Run, and retry Generate report.");
      } else {
        setApplicationError(reportError.message);
      }
    }
  }, [activeProject, appMeta, historicalReportContext, onHistoricalReportCreated, persistReportArtifact, saveReportDefinition, setApplicationError, setHistoryWarning]);

  const regenerateArtifact = useCallback(async (artifact) => {
    const definition = reportDefinitions.find((candidate) => candidate.report_id === artifact.report_id);
    if (!definition) {
      setApplicationError("The Report definition for this artifact is no longer available; the historical bytes remain inspectable.");
      return;
    }
    try {
      let report;
      if (definition.run_ids?.length > 0) {
        const runs = runHistoryRuns.filter((run) => definition.run_ids.includes(run.run_id));
        const run = runs[0];
        const { revision, scenario } = historicalReportContext(run);
        if (!run || !revision || !scenario) throw new Error("The exact historical source Version for this report is unavailable; regeneration was not performed.");
        const { buildHistoricalPlanningReport } = await loadReportExportModule();
        report = buildHistoricalPlanningReport({ appMeta, project: activeProject, scenario, scenarioRevision: revision, runs });
      } else {
        report = await createPlanningReport();
      }
      const saved = await persistReportArtifact({ report, definition, format: artifact.format, download: false });
      if (saved) setReportWarning("A new artifact was generated. The previous artifact remains available.");
    } catch (regenerateError) {
      if (isDeferredModuleLoadError(regenerateError)) {
        setReportWarning("Report generation code could not be loaded. Reload the application and choose Regenerate again.");
      } else {
        setApplicationError(regenerateError.message);
      }
    }
  }, [activeProject, appMeta, createPlanningReport, historicalReportContext, persistReportArtifact, reportDefinitions, runHistoryRuns, setApplicationError]);

  const downloadArtifact = useCallback(async (artifact) => {
    try {
      const stored = await getArtifact(artifact.artifact_id);
      if (!stored) return;
      const { downloadReportBytes } = await loadReportArtifactDownloadModule();
      downloadReportBytes(stored.metadata, stored.bytes);
    } catch (downloadError) {
      if (isDeferredModuleLoadError(downloadError)) {
        setReportWarning("Report download code could not be loaded. Reload the application and choose Download again.");
      } else {
        setApplicationError(downloadError.message);
      }
    }
  }, [getArtifact, setApplicationError]);

  const deleteArtifactWithConfirmation = useCallback(async (artifact) => {
    if (!globalThis.confirm?.("Delete this retained report artifact? Its source Run and Version will remain.")) return;
    const deleted = await deleteArtifact(artifact.artifact_id);
    if (deleted && selectedArtifactId === artifact.artifact_id) onArtifactSelected(null);
  }, [deleteArtifact, onArtifactSelected, selectedArtifactId]);

  return {
    state: { reportDefinitions, reportWarning },
    actions: {
      createPlanningReport,
      deleteArtifact: deleteArtifactWithConfirmation,
      downloadArtifact,
      exportCurrentHtml,
      exportCurrentMarkdown,
      generateHistoricalReport,
      regenerateArtifact,
    },
  };
}

async function importDeferredModule(importer) {
  try {
    return await importer();
  } catch (error) {
    const loadError = error instanceof Error ? error : new Error(String(error));
    loadError.lazyFeatureLoad = true;
    throw loadError;
  }
}

function isDeferredModuleLoadError(error) {
  return error?.lazyFeatureLoad === true;
}
