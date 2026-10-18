import { AlertTriangle, Archive, Download, FileText } from "lucide-react";
import ReportArtifactsPanel from "../../components/ReportArtifactsPanel.jsx";
import { reportLineageLine } from "../../utils/reportLineage.js";

export default function ReportFeature(props) {
  return <ReportExportPanel {...props} />;
}

function ReportExportPanel({
  artifacts,
  definitions,
  error,
  issues,
  loading,
  onDeleteArtifact,
  onDownloadArtifact,
  onInspectArtifact,
  onOpenSource,
  onRegenerateArtifact,
  onExportMarkdown,
  onExportPdf,
  onExportReviewPackage,
  reportWarning,
  currentWorkspace,
  currentReportSource = null,
  runs,
  scenarios,
  selectedArtifactId,
}) {
  const reportModuleLoadFailed = reportWarning?.includes("could not be loaded");

  return (
    <section className="report-card" aria-label="Planning report export">
      <div className="panel-title">
        <FileText size={16} />
        <span>Report</span>
      </div>
      <p className="empty-note">
        Export the selected Cell, beam direction, RF KPIs, demand hits, gap summary, and a portable map
        preview for stakeholder review.
      </p>
      <div className="report-source-summary" aria-label="Report source">
        <strong>Report source</strong>
        {/* The same lineage the generated Report stores and lists under Reports. */}
        <p className="report-source-lineage">{reportLineageLine({
          scenarioName: currentReportSource?.scenario_name,
          versionLabel: currentReportSource?.version_label,
          runIds: currentReportSource?.run_ids,
          runs: currentReportSource?.runs ?? runs,
        })}</p>
        {currentReportSource?.scenario_revision_id ? null : (
          <p className="report-live-source"><b>Current unsaved plan</b><span>This Report will not be tied to a saved Version.</span></p>
        )}
      </div>
      {reportWarning ? (
        <div className="run-history-message warning" role={reportModuleLoadFailed ? "alert" : "status"}>
          <AlertTriangle size={14} />
          <span>{reportWarning}</span>
          {reportModuleLoadFailed ? <button type="button" className="run-history-message-reload" onClick={() => window.location.reload()}>Reload application</button> : null}
        </div>
      ) : null}
      <div className="report-actions">
        <button type="button" className="report-button primary" onClick={onExportPdf}>
          <FileText size={15} />
          <span>PDF / Print</span>
        </button>
        <button type="button" className="report-button" onClick={onExportMarkdown}>
          <Download size={15} />
          <span>Markdown</span>
        </button>
        <button type="button" className="report-button" onClick={onExportReviewPackage} disabled={!onExportReviewPackage}>
          <Archive size={15} />
          <span>Review package</span>
        </button>
      </div>
      <p className="data-note report-package-note">
        Review package: one local .zip for the saved Version with both reports, the project file, the map and a manifest of file hashes, dataset and model identity and lineage. No RF request is made.
      </p>
      <ReportArtifactsPanel
        artifacts={artifacts}
        definitions={definitions}
        error={error}
        issues={issues}
        loading={loading}
        onDelete={onDeleteArtifact}
        onDownload={onDownloadArtifact}
        onInspect={onInspectArtifact}
        onOpenSource={onOpenSource}
        onRegenerate={onRegenerateArtifact}
        currentWorkspace={currentWorkspace}
        runs={runs}
        scenarios={scenarios}
        selectedArtifactId={selectedArtifactId}
      />
    </section>
  );
}
