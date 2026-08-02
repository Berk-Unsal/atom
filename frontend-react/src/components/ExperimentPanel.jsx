import { useEffect, useMemo, useState } from "react";
import { Download, FlaskConical, PlayCircle, Square } from "lucide-react";
import { getJSON, postJSON, requestJSON } from "../utils/apiClient.js";
import { formatNumber } from "../utils/appWorkspace.js";
import { buildExperimentDefinition, EXPERIMENT_MATRIX_FIELDS, paretoGeometry } from "../utils/experimentMatrix.js";

export default function ExperimentPanel({ selectedTower, settings }) {
  const [name, setName] = useState("Planning matrix");
  const [matrixText, setMatrixText] = useState({ frequencies_ghz: "", tx_powers_dbm: "", beam_widths_deg: "", azimuths_deg: "", calibration_offsets_db: "" });
  const [definition, setDefinition] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const running = job?.status === "accepted" || job?.status === "running";

  useEffect(() => {
    if (!running || !job?.job_id) return undefined;
    let active = true;
    const controller = new AbortController();
    let timeoutID;
    const poll = async () => {
      try {
        const next = await getJSON(`/api/jobs/${job.job_id}`, "Experiment status could not be loaded", controller.signal);
        if (!active) return;
        setJob(next);
        if (next.status === "accepted" || next.status === "running") timeoutID = window.setTimeout(poll, 600);
      } catch (pollError) {
        if (active && pollError?.name !== "AbortError") setError(pollError.message);
      }
    };
    timeoutID = window.setTimeout(poll, 300);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutID);
    };
  }, [job?.job_id, running]);

  const start = async () => {
    if (!selectedTower) return;
    try {
      const nextDefinition = buildExperimentDefinition(name, selectedTower, settings, matrixText);
      setDefinition(nextDefinition);
      setError("");
      setJob(await postJSON("/api/processes/batch-experiment/execution", nextDefinition, "Experiment could not be queued"));
    } catch (startError) {
      setError(startError.message);
    }
  };

  const cancel = async () => {
    if (!job?.job_id) return;
    try {
      setJob(await requestJSON(`/api/jobs/${job.job_id}`, { method: "DELETE", fallbackMessage: "Experiment could not be cancelled" }));
    } catch (cancelError) {
      setError(cancelError.message);
    }
  };

  const exportDefinition = () => {
    if (!definition) return;
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(name)}.atom-experiment.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="experiment-panel" aria-label="Batch experiments">
      <header className="panel-title"><FlaskConical size={16} /><span>Scenario matrix</span></header>
      <p className="data-note">Sweep comma-separated values. Blank dimensions inherit the active plan. Jobs run asynchronously and identical dataset/model fingerprints reuse deterministic results.</p>
      <label className="experiment-name"><span>Experiment name</span><input value={name} maxLength={128} onChange={(event) => setName(event.target.value)} /></label>
      <div className="experiment-matrix-fields">
        {EXPERIMENT_MATRIX_FIELDS.map(([key, label, unit]) => (
          <label key={key}><span>{label}<small>{unit}</small></span><input value={matrixText[key]} placeholder="Use active value" onChange={(event) => setMatrixText((current) => ({ ...current, [key]: event.target.value }))} /></label>
        ))}
      </div>
      <div className="experiment-actions">
        <button type="button" className="primary" disabled={!selectedTower || running} onClick={start}><PlayCircle size={15} />Queue matrix</button>
        <button type="button" disabled={!running} onClick={cancel}><Square size={13} />Cancel</button>
        <button type="button" disabled={!definition} onClick={exportDefinition}><Download size={14} />Definition</button>
      </div>
      {!selectedTower ? <p className="inventory-validation">Select a base transmitter cell first.</p> : null}
      {error ? <p className="inventory-validation" role="alert">{error}</p> : null}
      {job ? <ExperimentJob job={job} /> : <p className="path-empty-state">No experiment queued. Add at least one sweep dimension to compare plans.</p>}
    </section>
  );
}

function ExperimentJob({ job }) {
  const runs = job.result?.runs ?? [];
  return (
    <section className="experiment-job" aria-live="polite">
      <div className="experiment-progress-heading"><span><strong>{formatLabel(job.status)}</strong><small>{job.completed_runs ?? 0} / {job.total_runs ?? 0} runs</small></span><b>{Math.round((job.progress ?? 0) * 100)}%</b></div>
      <progress max="1" value={job.progress ?? 0}>{Math.round((job.progress ?? 0) * 100)}%</progress>
      <p className="experiment-fingerprint">Fingerprint <code>{String(job.fingerprint ?? "").slice(0, 16)}</code>{job.cache_hit ? " · cache hit" : ""}</p>
      {runs.length ? <ExperimentResults runs={runs} /> : null}
      {job.message ? <p className="inventory-validation">{job.message}</p> : null}
    </section>
  );
}

function ExperimentResults({ runs }) {
  const chart = useMemo(() => paretoGeometry(runs), [runs]);
  return (
    <>
      <figure className="experiment-pareto-chart">
        <svg viewBox="0 0 620 250" role="img" aria-labelledby="experiment-pareto-title experiment-pareto-desc">
          <title id="experiment-pareto-title">Experiment Pareto view</title>
          <desc id="experiment-pareto-desc">Received power against coverage gap percentage. Filled points are non-dominated across received power, gaps, and blockage.</desc>
          <line x1="46" y1="210" x2="602" y2="210" /><line x1="46" y1="16" x2="46" y2="210" />
          {chart.points.map((point) => <circle key={point.key} cx={point.x} cy={point.y} r={point.nonDominated ? 6 : 4} className={point.nonDominated ? "non-dominated" : "dominated"}><title>{point.label}</title></circle>)}
          <text x="324" y="240" textAnchor="middle">Gap percentage →</text><text x="14" y="112" textAnchor="middle" transform="rotate(-90 14 112)">Average Rx dBm →</text>
        </svg>
        <figcaption>Non-dominated runs are larger and teal. Hover a point for its parameters.</figcaption>
      </figure>
      <div className="experiment-table-wrap">
        <table className="experiment-table">
          <thead><tr><th>Run</th><th>GHz</th><th>dBm</th><th>Azimuth</th><th>Avg Rx</th><th>Gaps</th><th>Frontier</th></tr></thead>
          <tbody>{runs.map((run) => <tr key={run.fingerprint}><td>{run.index + 1}</td><td>{formatNumber(run.parameters.frequency_ghz, 1)}</td><td>{formatNumber(run.parameters.tx_power_dbm, 0)}</td><td>{formatNumber(run.parameters.azimuth_deg, 0)}°</td><td>{formatNumber(run.avg_rx_dbm, 1)}</td><td>{formatNumber(run.gap_pct, 1)}%</td><td title={run.explanation}>{run.non_dominated ? "Pareto" : "Dominated"}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function formatLabel(value) { return String(value ?? "unknown").replaceAll("-", " "); }
function slug(value) { return String(value || "experiment").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "experiment"; }
