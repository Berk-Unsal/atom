import { AlertTriangle, Download, FileText } from "lucide-react";
import ReportArtifactsPanel from "../../components/ReportArtifactsPanel.jsx";
import ResultContextBadge from "../../components/ResultContextBadge.jsx";

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
  reportWarning,
  currentWorkspace,
  currentResultContext,
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
        Export the selected tower, beam direction, RF KPIs, demand hits, gap summary, and a portable map
        preview for stakeholder review.
      </p>
      <div className="report-source-summary" aria-label="Report source">
        <strong>Report source</strong>
        {currentWorkspace?.unsaved || !currentWorkspace?.scenario_revision_id ? (
          <p className="report-live-source"><b>Current unsaved plan</b><span>This Report will not be tied to a saved Version.</span></p>
        ) : currentResultContext?.freshness === "current" ? (
          <ResultContextBadge context={currentResultContext} />
        ) : (
          <p>{currentWorkspace.scenario_name} · {currentWorkspace.version_label}. A Report records its source Run when one is available.</p>
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
      </div>
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
