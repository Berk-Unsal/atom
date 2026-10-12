import { AlertTriangle, Clock3, Download, FileText, RefreshCw, Trash2 } from "lucide-react";
import { buildResultContext, shortID } from "../domain/resultContext.js";
import ResultContextBadge from "./ResultContextBadge.jsx";

export default function ReportArtifactsPanel({
  artifacts = [],
  currentWorkspace = null,
  definitions = [],
  error = "",
  issues = [],
  loading = false,
  onDelete,
  onDownload,
  onInspect,
  onOpenSource,
  onRegenerate,
  runs = [],
  scenarios = [],
  selectedArtifactId = null,
}) {
  const selected = artifacts.find((artifact) => artifact.artifact_id === selectedArtifactId) ?? null;
  const titleFor = (artifact) => definitions.find((definition) => definition.report_id === artifact.report_id)?.title ?? artifact.title ?? "Planning report";
  const selectedRun = selected?.run_ids?.length
    ? runs.find((run) => run.run_id === selected.run_ids[0]) ?? null
    : null;
  const selectedRunForContext = selectedRun ?? (selected?.run_ids?.[0] ? {
    run_id: selected.run_ids[0],
    run_type: "report",
    status: "succeeded",
    scenario_id: selected.scenario_id,
    scenario_revision_id: selected.scenario_revision_id,
  } : null);
  const selectedContext = selected ? buildResultContext({
    activeProjectId: selected.project_id,
    activeScenarioId: selected.scenario_id,
    activeRevisionId: selected.scenario_revision_id,
    historical: true,
    project: { id: selected.project_id, name: selected.project_name },
    run: selectedRunForContext,
    resultType: "report",
    sourceKind: selected.provenance?.source_kind ?? selected.source_kind ?? null,
    sourceScenarioName: selected.scenario_name ?? null,
    scenarios,
    unavailableReason: selected.availability === "available"
      ? ""
      : "Report bytes are missing or unreadable. Regenerate explicitly to create a new Report.",
  }) : null;

  return (
    <section className="report-artifacts" aria-label="Reports">
      <div className="report-artifacts-heading">
        <div>
          <div className="panel-title"><FileText size={16} /><span>Reports</span></div>
          <p className="empty-note">Reports keep their source Scenario, Version, and Runs. Downloading stored bytes does not rerun RF compute.</p>
        </div>
        <span className="report-artifact-count">{artifacts.length} {artifacts.length === 1 ? "Report" : "Reports"}</span>
      </div>

      {loading ? <p className="report-artifact-empty"><Clock3 size={14} /> Loading Reports…</p> : null}
      {error ? <p className="run-history-message error"><AlertTriangle size={14} /> {error}</p> : null}
      {issues.length > 0 ? <p className="run-history-message warning"><AlertTriangle size={14} /> Some Report metadata could not be read; available Reports remain inspectable.</p> : null}
      {!loading && artifacts.length === 0 ? <p className="report-artifact-empty">No Reports yet. Generate a Report to keep its Scenario and Run source.</p> : null}

      {artifacts.length > 0 ? (
        <div className="report-artifact-list" role="list" aria-label="Reports">
          {artifacts.map((artifact) => (
            <article className={`report-artifact-row ${selected?.artifact_id === artifact.artifact_id ? "selected" : ""}`.trim()} key={artifact.artifact_id} role="listitem">
              <button type="button" className="report-artifact-main" onClick={() => onInspect?.(artifact)} aria-pressed={selected?.artifact_id === artifact.artifact_id}>
                <span className="report-artifact-icon"><FileText size={15} /></span>
                <span className="report-artifact-copy">
                  <strong>{titleFor(artifact)}</strong>
                  <small>{scenarioVersionLabel(artifact, scenarios)} · Runs: {runLabels(artifact, runs)}</small>
                  <small>{formatTimestamp(artifact.generated_at)} · {availabilityLabel(artifact.availability)}</small>
                </span>
              </button>
              <div className="report-artifact-actions">
                <button type="button" className="icon-button" onClick={() => onDownload?.(artifact)} disabled={artifact.availability !== "available"} aria-label={`Download ${titleFor(artifact)}`} title="Download Report"><Download size={14} /></button>
                <button type="button" className="icon-button" onClick={() => onRegenerate?.(artifact)} aria-label={`Regenerate ${titleFor(artifact)}`} title="Regenerate as a new Report"><RefreshCw size={14} /></button>
                <button type="button" className="icon-button danger" onClick={() => onDelete?.(artifact)} aria-label={`Delete ${titleFor(artifact)}`} title="Delete Report"><Trash2 size={14} /></button>
              </div>
              {artifact.scenario_revision_id && hasSourceVersion(artifact, scenarios) ? <button type="button" className="report-artifact-source" onClick={() => onOpenSource?.(artifact)}>Open source Version</button> : null}
            </article>
          ))}
        </div>
      ) : null}

      {selected ? (
        <section className="report-source-summary" aria-label="Report source">
          <strong>Report source</strong>
          <ResultContextBadge context={selectedContext} currentWorkspace={currentWorkspace} />
          {selected.provenance?.source_kind === "live_compatibility" ? (
            <p className="report-live-source"><b>Current unsaved plan at generation</b><span>This Report was not tied to a saved Version.</span></p>
          ) : null}
          <p><b>Scenario:</b> {scenarioName(selected, scenarios)}</p>
          <p><b>Version:</b> {versionLabel(selected, scenarios)}</p>
          <p><b>Runs:</b> {runLabels(selected, runs)}</p>
          {selected.scenario_revision_id && hasSourceVersion(selected, scenarios)
            ? <button type="button" className="run-history-source-button" onClick={() => onOpenSource?.(selected)}>Open source Version</button>
            : selected.scenario_revision_id
              ? <p className="report-unavailable-state">UNAVAILABLE · The exact source Version is not retained, so it cannot be opened.</p>
              : null}
          {selected.availability !== "available" ? <p className="report-unavailable-state">UNAVAILABLE · Report bytes are missing or unreadable. Regenerate explicitly to create a new Report.</p> : null}
          <details className="report-artifact-provenance">
            <summary>Details / Provenance</summary>
            <dl>
              <div><dt>Artifact identity</dt><dd>{shortID(selected.artifact_id)}</dd></div>
              <div><dt>Source type</dt><dd>{selected.provenance?.source_kind ?? "Not recorded"}</dd></div>
              <div><dt>SHA-256</dt><dd>{selected.content_hash ?? "Not available"}</dd></div>
              <div><dt>Generator version</dt><dd>{selected.generator_version ?? "Not recorded"}</dd></div>
              <div><dt>Evidence status</dt><dd>{availabilityLabel(selected.availability)}</dd></div>
              <div><dt>Stored size</dt><dd>{formatBytes(selected.byte_size)}</dd></div>
            </dl>
          </details>
        </section>
      ) : null}
    </section>
  );
}

function availabilityLabel(value) {
  return value === "available" ? "Available" : "UNAVAILABLE";
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function scenarioName(artifact, scenarios) {
  return scenarios.find((candidate) => (
    String(candidate.domain?.scenario_id ?? candidate.id) === String(artifact?.scenario_id)
  ))?.name ?? artifact?.scenario_name ?? "Scenario";
}

function scenarioVersionLabel(artifact, scenarios) {
  return `${scenarioName(artifact, scenarios)} · ${versionLabel(artifact, scenarios)}`;
}

function versionLabel(artifact, scenarios) {
  if (!artifact?.scenario_revision_id) return "No saved Version";
  const scenario = scenarios.find((candidate) => (
    String(candidate.domain?.scenario_id ?? candidate.id) === String(artifact.scenario_id)
  ));
  const revision = scenario?.domain?.revisions?.find((candidate) => String(candidate.scenario_revision_id) === String(artifact.scenario_revision_id));
  return revision ? `Version ${revision.revision}` : "Version unavailable";
}

function hasSourceVersion(artifact, scenarios) {
  if (!artifact?.scenario_id || !artifact?.scenario_revision_id) return false;
  const scenario = scenarios.find((candidate) => (
    String(candidate.domain?.scenario_id ?? candidate.id) === String(artifact.scenario_id)
  ));
  return Boolean(scenario?.domain?.revisions?.some((revision) => (
    String(revision.scenario_revision_id) === String(artifact.scenario_revision_id)
  )));
}

function runLabels(artifact, runs) {
  if (!artifact?.run_ids?.length) return "None";
  return artifact.run_ids.map((runId) => {
    const run = runs.find((candidate) => candidate.run_id === runId);
    return run ? `${formatRunType(run.run_type)} ${shortID(runId)}` : `Run ${shortID(runId)}`;
  }).join(", ");
}

function formatRunType(value) {
  return value === "optimization" ? "Optimization Run" : value === "simulation" ? "Simulation Run" : "Run";
}
