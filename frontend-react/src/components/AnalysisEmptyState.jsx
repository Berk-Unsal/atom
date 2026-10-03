export default function AnalysisEmptyState({ actionDisabled = false, actionLabel, description, icon: Icon, onAction, title }) {
  return (
    <div className="analysis-empty-state" role="status">
      <Icon size={20} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
      {actionLabel && onAction ? <button type="button" className="panel-primary-action" disabled={actionDisabled} onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}
