import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import PanelHeader from "./PanelHeader.jsx";

export default function ContextualInspector({
  actions = [],
  children,
  entityID,
  entityLabel,
  focusOnOpen = false,
  freshness = null,
  onBack,
  onClose,
  provenance = null,
  summary = null,
  sourceLabel = "Source unavailable",
  sourceRun = null,
  onViewRun,
}) {
  const headingRef = useRef(null);

  useEffect(() => {
    if (focusOnOpen) headingRef.current?.focus({ preventScroll: true });
  }, [entityID, focusOnOpen]);

  return (
    <aside className="contextual-inspector" aria-label={`${entityLabel} inspector`}>
      <PanelHeader className="contextual-inspector-header" headingRef={headingRef} title={entityID ? `${entityLabel} ${entityID}` : entityLabel} subtitle="Inspect" onClose={onClose} closeLabel="Close inspector">
        {onBack ? (
          <button type="button" className="drawer-icon-button contextual-inspector-back" onClick={onBack} aria-label="Back to previous tool">
            <ChevronLeft size={18} />
          </button>
        ) : null}
      </PanelHeader>
      <div className="contextual-inspector-source" aria-label="Source context">
        {freshness ? <span className={`inspector-freshness ${freshness.toLowerCase()}`}>{freshness}</span> : null}
        <span className="inspector-source-label">{sourceLabel}</span>
        {sourceRun && onViewRun ? (
          <button type="button" className="inspector-source-link" onClick={() => onViewRun(sourceRun)}>
            View {sourceRun.run_id ? `Run ${String(sourceRun.run_id).slice(0, 8)}` : "Run"}
          </button>
        ) : null}
      </div>
      {actions.length ? (
        <div className="contextual-inspector-actions" role="group" aria-label="Inspector actions">
          {actions.map((action) => (
            <button type="button" key={action.id} onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {summary ? <div className="contextual-inspector-summary">{summary}</div> : null}
      <details className="contextual-inspector-provenance">
        <summary>Details and provenance</summary>
        <div className="contextual-inspector-body">{children}</div>
        <dl>
          <div><dt>Project</dt><dd>{provenance?.projectId ?? "Unavailable"}</dd></div>
          <div><dt>Scenario</dt><dd>{provenance?.scenarioId ?? "Unavailable"}</dd></div>
          <div><dt>Version</dt><dd>{provenance?.versionId ?? "Unavailable"}</dd></div>
          <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
          {sourceRun ? <div><dt>Run</dt><dd>{sourceRun.run_id ?? "Unavailable"}</dd></div> : null}
          {freshness ? <div><dt>Freshness</dt><dd>{freshness}</dd></div> : null}
        </dl>
      </details>
    </aside>
  );
}
