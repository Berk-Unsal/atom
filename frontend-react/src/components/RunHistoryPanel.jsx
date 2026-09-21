import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

export default function RunHistoryPanel({
  currentScenarioId = null,
  datasetUnavailable = false,
  error = "",
  issues = [],
  loading = false,
  onApplySolution,
  onClearUnreferenced,
  onDeleteRun,
  onRefresh,
  onRunAgain,
  runs = [],
  warning = "",
}) {
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [scope, setScope] = useState("project");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const visibleRuns = useMemo(() => runs.filter((run) => (
    (scope === "project" || String(run.scenario_id) === String(currentScenarioId))
      && (typeFilter === "all" || run.run_type === typeFilter)
      && (statusFilter === "all" || run.status === statusFilter)
  )), [currentScenarioId, runs, scope, statusFilter, typeFilter]);
  const selectedRun = useMemo(
    () => visibleRuns.find((run) => run.run_id === selectedRunId) ?? visibleRuns[0] ?? null,
    [selectedRunId, visibleRuns],
  );

  return (
    <section className="run-history-panel" aria-label="Durable local run history">
      <div className="run-history-intro">
        <div>
          <strong>Local run history</strong>
          <p>Compact execution records stay on this browser. Full rays, samples, and map overlays are not retained.</p>
        </div>
        <button type="button" className="icon-button" onClick={() => onRefresh?.()} disabled={loading} aria-label="Refresh run history" title="Refresh run history">
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </div>
      {runs.length > 0 ? <button type="button" className="run-history-clear" onClick={() => onClearUnreferenced?.()}>Clear unreferenced records</button> : null}

      {error ? <div className="run-history-message error" role="alert"><AlertTriangle size={15} />{error}</div> : null}
      {warning ? <div className="run-history-message warning" role="status"><AlertTriangle size={15} />{warning}</div> : null}
      {issues.length > 0 ? <div className="run-history-message warning" role="status"><AlertTriangle size={15} />{issues.length} invalid history record{issues.length === 1 ? "" : "s"} skipped.</div> : null}
      {datasetUnavailable ? <div className="run-history-message warning" role="status"><AlertTriangle size={15} />The recorded dataset is unavailable. Historical results remain inspectable; rerun is disabled.</div> : null}

      <div className="run-history-filters" aria-label="Run history filters">
        <label><span>Scope</span><select aria-label="Run history scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="project">All project runs</option><option value="scenario" disabled={!currentScenarioId}>Current scenario</option></select></label>
        <label><span>Type</span><select aria-label="Run history type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="simulation">Simulation</option><option value="optimization">Optimization</option></select></label>
        <label><span>Status</span><select aria-label="Run history status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="running">Running</option></select></label>
      </div>

      <div className="run-history-layout">
        <div className="run-history-list" role="list" aria-label="Saved runs">
          {runs.length === 0 && !loading ? <p className="run-history-empty">No durable runs for this project yet.</p> : null}
          {runs.length > 0 && visibleRuns.length === 0 ? <p className="run-history-empty">No runs match these filters.</p> : null}
          {visibleRuns.map((run) => (
            <button
              type="button"
              key={run.run_id}
              className={`run-history-row ${selectedRun?.run_id === run.run_id ? "selected" : ""}`.trim()}
              onClick={() => setSelectedRunId(run.run_id)}
              aria-pressed={selectedRun?.run_id === run.run_id}
            >
              <RunStatusIcon run={run} />
              <span>
                <strong>{run.run_type === "optimization" ? "Optimization" : "Simulation"}</strong>
                <small>{formatTimestamp(run.created_at)} · {run.scenario_revision_id ? "ScenarioRevision" : "Draft"}</small>
              </span>
              <em className={`run-status ${run.status}`}>{displayStatus(run)}</em>
            </button>
          ))}
        </div>

        {selectedRun ? (
          <RunDetails
            datasetUnavailable={datasetUnavailable}
            onApplySolution={onApplySolution}
            onDeleteRun={onDeleteRun}
            onRunAgain={onRunAgain}
            run={selectedRun}
          />
        ) : <div className="run-history-detail empty-detail">Select a run to inspect its retained identity and compact result.</div>}
      </div>
    </section>
  );
}

function RunDetails({ datasetUnavailable, onApplySolution, onDeleteRun, onRunAgain, run }) {
  const solutions = run.details?.public_pareto_solutions ?? [];
  const sourceLabel = run.scenario_revision_id ? `Revision ${shortID(run.scenario_revision_id)}` : "Unsaved draft";
  return (
    <article className="run-history-detail" aria-label={`Run ${run.run_id} details`}>
      <div className="run-history-detail-header">
        <div>
          <span className={`run-status ${run.status}`}>{displayStatus(run)}</span>
          <h3>{run.run_type === "optimization" ? "Optimization run" : "Simulation run"}</h3>
        </div>
        <button type="button" className="icon-button danger" onClick={() => onDeleteRun?.(run)} aria-label="Delete run" title="Delete run"><Trash2 size={15} /></button>
      </div>
      <dl className="run-history-facts">
        <div><dt>Run identity</dt><dd>{shortID(run.run_id)}</dd></div>
        <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
        <div><dt>Created</dt><dd>{formatTimestamp(run.created_at)}</dd></div>
        <div><dt>Scenario fingerprint</dt><dd>{run.scenario_fingerprint ?? "Not returned"}</dd></div>
        <div><dt>Dataset</dt><dd>{run.dataset_references?.[0]?.dataset_id ?? "Not recorded"} {run.dataset_references?.[0]?.version ?? ""}</dd></div>
        <div><dt>Engine</dt><dd>{run.engine?.name ?? "A.T.O.M"} {run.engine?.version ?? ""}</dd></div>
        <div><dt>RF contract</dt><dd>{run.rf_contract?.model_version ?? run.rf_contract?.model ?? "Recorded"}</dd></div>
      </dl>

      {run.error ? <div className="run-history-error"><strong>{run.error.code ?? "run_failed"}</strong><span>{run.error.message}</span></div> : null}
      {run.warnings?.length ? <p className="run-history-warning">{run.warnings.join(" ")}</p> : null}

      {run.run_type === "optimization" ? (
        <section className="run-history-solutions" aria-label="Historical optimization solutions">
          <strong>Public solutions</strong>
          {run.details?.baseline_solution ? <p>Baseline retained: {formatScore(run.details.baseline_solution)}</p> : null}
          {solutions.length === 0 ? <p>No public Pareto solution was retained.</p> : solutions.map((solution, index) => {
            const recommended = solution.id === run.details?.recommended_solution_id;
            return (
              <div className="run-history-solution" key={solution.optimization_solution_id ?? solution.id ?? index}>
                <span><b>{recommended ? "Recommended" : `Alternative ${index + 1}`}</b><small>{solution.id || solution.optimizer_solution_id || "unnamed"}</small></span>
                <button type="button" onClick={() => onApplySolution?.(run, solution)} disabled={run.status !== "succeeded" || datasetUnavailable}>
                  <RotateCcw size={13} /> Apply to new revision
                </button>
              </div>
            );
          })}
        </section>
      ) : (
        <div className="run-history-retained-result">
          <strong>Compact result retained</strong>
          <p>Detailed visualization was not retained. Run again to regenerate the map layers.</p>
          <pre>{JSON.stringify(run.summary ?? {}, null, 2)}</pre>
        </div>
      )}

      {run.status === "succeeded" || run.status === "failed" || run.status === "cancelled" ? (
        <button type="button" className="run-history-rerun" onClick={() => onRunAgain?.(run)} disabled={datasetUnavailable}>
          <RotateCcw size={14} /> Run again as a new run
        </button>
      ) : null}
    </article>
  );
}

function formatScore(solution) {
  const score = solution?.score ?? solution?.stats?.score;
  return Number.isFinite(Number(score)) ? `score ${Number(score).toFixed(1)}` : "compact metrics retained";
}

function RunStatusIcon({ run }) {
  if (run.status === "succeeded") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (run.status === "failed") return <XCircle size={15} aria-hidden="true" />;
  return <Clock3 size={15} aria-hidden="true" />;
}

function displayStatus(run) {
  if (run.error?.code === "run_interrupted") return "Interrupted";
  return run.status.charAt(0).toUpperCase() + run.status.slice(1);
}

function shortID(value) {
  const text = String(value ?? "");
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text || "—";
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}
