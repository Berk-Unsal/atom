import { useEffect, useRef } from "react";

export default function GenerateRunReportDialog({ onClose, onConfirm, open = false, sourceContext = null }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (typeof dialog?.showModal === "function" && !dialog.open) dialog.showModal();
    else if (dialog && !dialog.open) dialog.setAttribute("open", "");
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
      else dialog?.removeAttribute("open");
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="apply-solution-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-run-report-title"
      onCancel={(event) => { event.preventDefault(); onClose?.(); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose?.(); }}
    >
      <h3 id="generate-run-report-title">Generate a Report from this Run?</h3>
      <dl className="apply-solution-lineage">
        <div>
          <dt>Report source</dt>
          <dd>{sourceContext?.scenario_name ?? "Scenario"} · {sourceContext?.version_label ?? "Version unavailable"}</dd>
          <dd>{sourceContext?.run_label ?? "Run unavailable"} · {formatTimestamp(sourceContext?.run_created_at)}</dd>
        </div>
        <div>
          <dt>Current workspace</dt>
          <dd>{sourceContext?.current_workspace_label ?? "The current draft stays unchanged."}</dd>
        </div>
      </dl>
      <p className="apply-solution-note">The Report will use this Run’s retained source Version. No RF rerun will be started.</p>
      <div className="apply-solution-actions">
        <button ref={cancelRef} type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" onClick={onConfirm}>Generate report from {sourceContext?.run_label ?? "Run"}</button>
      </div>
    </dialog>
  );
}

function formatTimestamp(value) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "time unavailable" : date.toLocaleString();
}
