import { useEffect, useRef } from "react";

export default function ApplySolutionDialog({
  destinationBaseName = "Scenario",
  onApply,
  onClose,
  open = false,
  solution = null,
  sourceContext = null,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const canApply = Boolean(sourceContext?.run_id && sourceContext?.scenario_revision_id && solution);

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

  const solutionLabel = solution?.id ?? solution?.optimization_solution_id ?? "Selected solution";
  const runType = sourceContext?.run_type === "optimization" ? "Optimization" : "Run";

  return (
    <dialog
      ref={dialogRef}
      className="apply-solution-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-solution-title"
      onCancel={(event) => { event.preventDefault(); onClose?.(); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose?.(); }}
    >
      <h3 id="apply-solution-title">Apply optimization solution?</h3>
      <dl className="apply-solution-lineage">
        <div>
          <dt>Source</dt>
          <dd>{sourceContext?.scenario_name ?? "Scenario"} · {sourceContext?.version_label ?? "Version unavailable"}</dd>
          <dd>{runType} {sourceContext?.run_label ?? "unavailable"} · {solutionLabel}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{destinationBaseName} · new Version</dd>
          <dd>{destinationBaseName} optimized · new branch</dd>
        </div>
      </dl>
      {!canApply ? <p className="apply-solution-unavailable">This solution is not bound to a retained source Version, so it cannot be applied safely.</p> : null}
      <p className="apply-solution-note">The source Run and Version stay unchanged. The new plan needs a fresh RF run.</p>
      <div className="apply-solution-actions">
        <button ref={cancelRef} type="button" onClick={onClose}>Cancel</button>
        <button type="button" onClick={() => onApply?.("version")} disabled={!canApply}>Create new Version</button>
        <button type="button" className="primary" onClick={() => onApply?.("branch")} disabled={!canApply}>Create branch</button>
      </div>
    </dialog>
  );
}
