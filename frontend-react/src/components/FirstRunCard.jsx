import { FolderOpen, Play, X } from "lucide-react";

// Dismissible first-run orientation. It appears only before any project work exists and never starts a tour.

export default function FirstRunCard({ onDismiss, onOpenSample, onRunSector, runDisabled = false, sampleBusy = false }) {
  return (
    <section className="first-run-card" aria-labelledby="first-run-card-title">
      <div className="first-run-card-heading">
        <h3 id="first-run-card-title">Plan an urban 4G/5G network</h3>
        <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss getting started" title="Dismiss"><X size={15} /></button>
      </div>
      <p>A.T.O.M estimates coverage, interference and network trade-offs for Cells in a local city dataset. Results are deterministic planning estimates, not measurements.</p>
      <div className="first-run-card-actions">
        <button type="button" className="panel-primary-action" onClick={onRunSector} disabled={runDisabled}><Play size={15} aria-hidden="true" /> Run the pre-selected sector</button>
        <button type="button" className="selection-map-action" onClick={onOpenSample} disabled={sampleBusy}><FolderOpen size={15} aria-hidden="true" /> {sampleBusy ? "Opening sample…" : "Open sample network project"}</button>
      </div>
      <p className="data-note">The sample opens as a new project; your current project is not changed. <a href="https://berk-unsal.github.io/atom/terminology.html" target="_blank" rel="noreferrer">Planning glossary</a></p>
    </section>
  );
}
