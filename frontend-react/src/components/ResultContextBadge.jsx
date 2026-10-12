import { formatRunType, resultStateLabel, shortID } from "../domain/resultContext.js";

const STATE_LABELS = Object.freeze({
  current: "Current result",
  stale: "Result out of date",
  historical: "Historical result",
  unavailable: "Result unavailable",
  unsupported: "Unsupported",
});

export default function ResultContextBadge({
  context,
  compact = false,
  sourceRunOnly = false,
  interactive = false,
  currentWorkspace = null,
  onPrimaryAction,
  primaryLabel = "",
  onSecondaryAction,
  secondaryLabel = "",
  technicalDetails = true,
}) {
  if (!context) return null;
  const stateLabel = resultStateLabel(context.freshness);
  const humanStateLabel = STATE_LABELS[context.freshness] ?? stateLabel;
  const typeLabel = formatRunType(context.run_type);
  const sourceLine = `${context.scenario_name} · ${context.version_label}`;
  const runLine = context.run_id
    ? `${context.run_label} · ${formatTimestamp(context.run_created_at)}`
    : context.run_label ?? "Run unavailable";

  if (compact) {
    const compactRunLine = context.run_id ? context.run_label : context.run_label ?? "Run unavailable";
    const compactCopy = sourceRunOnly
      ? compactRunLine
      : `${sourceLine}${context.run_id ? ` · ${context.run_label}` : ""}`;
    const content = (
      <>
        <span className={`result-context-state state-${context.freshness}`}>{stateLabel}</span>
        <span className="result-context-compact-copy">{compactCopy}</span>
      </>
    );
    return interactive ? (
      <button
        type="button"
        className={`result-context-compact state-${context.freshness}`}
        aria-label={`Open ${humanStateLabel} details for ${sourceLine} · ${runLine}`}
        title={`${humanStateLabel} · ${sourceLine} · ${runLine}`}
        onClick={onPrimaryAction}
        disabled={!onPrimaryAction}
      >
        {content}
      </button>
    ) : (
      <div className={`result-context-compact state-${context.freshness}`} aria-label={`${stateLabel} · ${sourceLine} · ${runLine}`} title={`${humanStateLabel} · ${sourceLine} · ${runLine}`} role="status" aria-live="polite">
        {content}
      </div>
    );
  }

  return (
    <section className={`result-context-badge state-${context.freshness}`} aria-label={`${stateLabel} context`}>
      <div className="result-context-main">
        <span className={`result-context-state state-${context.freshness}`}>{stateLabel}</span>
        <strong className="result-context-heading">{humanStateLabel} · {typeLabel}</strong>
        <strong>{sourceLine}</strong>
        <span className="result-context-run">{typeLabel} {runLine}</span>
      </div>
      {context.freshness === "stale" ? (
        <p className="result-context-message">This result came from {context.version_label} · {context.run_label}. The current plan has changed.</p>
      ) : null}
      {context.freshness === "unavailable" && context.unavailable_reason ? <p className="result-context-message">{context.unavailable_reason}</p> : null}
      {context.freshness === "unsupported" && context.unsupported_reason ? <p className="result-context-message">{context.unsupported_reason}</p> : null}
      {context.historical && currentWorkspace && isDifferentWorkspace(context, currentWorkspace) ? (
        <p className="result-context-current-workspace">
          <strong>Current workspace:</strong> {currentWorkspace.scenario_name} · {currentWorkspace.version_label}{currentWorkspace.unsaved ? " · Unsaved changes" : ""}
        </p>
      ) : null}
      {(primaryLabel || secondaryLabel) ? (
        <div className="result-context-actions">
          {primaryLabel ? <button type="button" className="primary" onClick={onPrimaryAction} disabled={!onPrimaryAction}>{primaryLabel}</button> : null}
          {secondaryLabel ? <button type="button" onClick={onSecondaryAction} disabled={!onSecondaryAction}>{secondaryLabel}</button> : null}
        </div>
      ) : null}
      {technicalDetails ? (
        <details className="result-context-provenance">
          <summary>Details / Provenance</summary>
          <dl>
            <div><dt>Project</dt><dd>{context.project_name} · {shortID(context.project_id)}</dd></div>
            <div><dt>Scenario</dt><dd>{context.scenario_name} · {shortID(context.scenario_id)}</dd></div>
            <div><dt>Version identity</dt><dd>{shortID(context.scenario_revision_id)}</dd></div>
            <div><dt>Run ID</dt><dd>{context.run_id ?? "Unavailable"}</dd></div>
            <div><dt>Scenario fingerprint</dt><dd>{context.scenario_fingerprint ?? "Not recorded"}</dd></div>
            <div><dt>Input fingerprint</dt><dd>{context.input_fingerprint ?? "Not recorded"}</dd></div>
            <div><dt>Dataset</dt><dd>{datasetLabel(context.dataset_ref)}</dd></div>
          </dl>
        </details>
      ) : null}
    </section>
  );
}

function formatTimestamp(value) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "time unavailable" : date.toLocaleString();
}

function datasetLabel(reference) {
  if (!reference) return "Not recorded";
  const id = reference.dataset_id ?? reference.id ?? "Dataset";
  const version = reference.version ?? reference.dataset_version;
  return version ? `${id} · ${version}` : String(id);
}

function isDifferentWorkspace(context, currentWorkspace) {
  return String(context.scenario_id ?? "") !== String(currentWorkspace.scenario_id ?? "")
    || String(context.scenario_revision_id ?? "") !== String(currentWorkspace.scenario_revision_id ?? "");
}
