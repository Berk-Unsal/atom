import { useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, PlayCircle, Upload } from "lucide-react";
import { MAX_MEASUREMENT_VALIDATION_FILE_BYTES, parseMeasurementValidationJSON, syntheticP525Campaign } from "../utils/measurementValidation.js";
import { formatNumber } from "../utils/appWorkspace.js";

const MODEL_OPTIONS = [
  ["p525_fspl", "P.525 FSPL"],
  ["sub_thz_atmospheric_reference_v1", "Atmospheric reference"],
  ["p1411_below_rooftop_los_v1", "P.1411 below-rooftop LoS"],
  ["p1411_urban_highrise_nlos_v1", "P.1411 high-rise NLoS"],
  ["p1411_urban_lowrise_nlos_v1", "P.1411 low-rise NLoS"],
  ["research_sub_thz", "Research profile comparison"],
  ["p526-single-edge-v1", "P.526 diagnostic"],
];

const DEFAULT_OPTIONS = {
  operation: "compare_models",
  modelIDs: ["p525_fspl"],
  method: "all_samples",
  groupBy: "site_id",
  cellSize: 100,
  separation: 100,
  includePredictions: true,
};

export default function MeasurementValidationPanel({ analysis, isAnalyzing, onRun }) {
  const [campaigns, setCampaigns] = useState([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);

  const update = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  const toggleModel = (modelID) => setOptions((current) => ({
    ...current,
    modelIDs: current.modelIDs.includes(modelID) ? current.modelIDs.filter((id) => id !== modelID) : [...current.modelIDs, modelID],
  }));

  const importCampaign = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_MEASUREMENT_VALIDATION_FILE_BYTES) throw new Error("Validation JSON must be no larger than 1 MiB");
      const bundle = parseMeasurementValidationJSON(await file.text());
      setCampaigns(bundle.campaigns);
      setMessage(`${bundle.campaigns.length} campaign${bundle.campaigns.length === 1 ? "" : "s"} loaded`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const loadSynthetic = () => {
    setCampaigns([syntheticP525Campaign()]);
    setMessage("Synthetic P.525 control loaded");
  };

  const run = () => {
    if (campaigns.length === 0) {
      setMessage("Load a campaign JSON file or the synthetic control first");
      return;
    }
    if (options.modelIDs.length === 0) {
      setMessage("Select at least one reference model");
      return;
    }
    onRun?.({
      campaigns,
      operation: options.operation,
      modelIDs: options.modelIDs,
      strategy: {
        method: options.method,
        group_by: options.groupBy,
        spatial_cell_size_m: Number(options.cellSize),
        minimum_separation_m: Number(options.separation),
      },
      include_predictions: options.includePredictions,
    });
  };

  const totalMeasurements = useMemo(() => campaigns.reduce((total, campaign) => total + (campaign.measurements?.length ?? 0), 0), [campaigns]);

  return (
    <section className="measurement-validation-panel" aria-label="RF diagnostics and measurement validation">
      <header className="panel-title"><Activity size={16} /><span>RF Diagnostics</span></header>
      <p className="measurement-validation-callout"><strong>Evidence ledger only.</strong> This workflow does not alter canonical propagation, coverage, building entry, diffraction, interference, radio quality, or optimization. Residual is measured path loss minus predicted path loss.</p>

      <div className="measurement-validation-import-row">
        <button type="button" className="secondary-action-button" onClick={() => inputRef.current?.click()}><Upload size={14} /> Load campaign JSON</button>
        <button type="button" className="secondary-action-button" onClick={loadSynthetic}>Load synthetic control</button>
        <input ref={inputRef} hidden type="file" accept=".json,application/json" onChange={importCampaign} />
      </div>
      <div className="measurement-validation-file-state" role="status">
        <span><strong>{campaigns.length}</strong> campaign{campaigns.length === 1 ? "" : "s"}</span>
        <span><strong>{totalMeasurements}</strong> records</span>
        {message ? <span>{message}</span> : <span>Metadata and numeric evidence are validated by the backend.</span>}
      </div>

      <div className="measurement-validation-options">
        <label><span>Operation</span><select value={options.operation} onChange={(event) => update("operation", event.target.value)}><option value="compare_models">Compare models</option><option value="validate_campaign">Validate campaign</option><option value="calibrate_bias">Calibrate constant bias</option><option value="spatial_holdout">Spatial holdout</option></select></label>
        <label><span>Split strategy</span><select value={options.method} onChange={(event) => update("method", event.target.value)}><option value="all_samples">All samples · diagnostic</option><option value="spatial_grid">Deterministic spatial grid</option><option value="leave_one_site_out">Leave one site out</option><option value="leave_one_campaign_out">Leave one campaign out</option></select></label>
        <label><span>Group key</span><select value={options.groupBy} onChange={(event) => update("groupBy", event.target.value)}><option value="site_id">Site</option><option value="location_pair_id">Location pair</option><option value="campaign_id">Campaign</option></select></label>
        <label><span>Cell size <small>m</small></span><input type="number" min="1" max="10000" value={options.cellSize} onChange={(event) => update("cellSize", event.target.value)} /></label>
        <label><span>Min separation <small>m</small></span><input type="number" min="1" max="10000" value={options.separation} onChange={(event) => update("separation", event.target.value)} /></label>
      </div>

      <fieldset className="measurement-validation-models">
        <legend>Reference adapters</legend>
        {MODEL_OPTIONS.map(([modelID, label]) => (
          <label key={modelID}><input type="checkbox" checked={options.modelIDs.includes(modelID)} onChange={() => toggleModel(modelID)} /><span>{label}</span></label>
        ))}
      </fieldset>
      <label className="measurement-validation-toggle"><input type="checkbox" checked={options.includePredictions} onChange={(event) => update("includePredictions", event.target.checked)} /><span>Include per-sample predictions for audit and charting</span></label>

      <button type="button" className="path-analyze-button" disabled={isAnalyzing || campaigns.length === 0} onClick={run}><PlayCircle size={15} />{isAnalyzing ? "Running evidence diagnostics…" : "Run RF diagnostics"}</button>
      {campaigns.length === 0 ? <p className="path-empty-state">Load a versioned campaign file to begin. External literature registrations in the docs are metadata-only and contain no numeric samples.</p> : null}
      {message && campaigns.length === 0 ? <p className="inventory-validation"><AlertTriangle size={14} />{message}</p> : null}
      {analysis ? <ValidationResult analysis={analysis} /> : null}
    </section>
  );
}

function ValidationResult({ analysis }) {
  const readiness = analysis.readiness ?? {};
  return (
    <section className="measurement-validation-result" aria-live="polite">
      <div className="measurement-validation-summary">
        <span><small>Readiness</small><strong>{formatLabel(readiness.classification)}</strong></span>
        <span><small>Production candidate</small><strong>{readiness.production_candidate ? "Yes" : "No"}</strong></span>
        <span><small>Fingerprint</small><code>{analysis.validation_fingerprint}</code></span>
      </div>
      <p className="measurement-validation-boundary"><CheckCircle2 size={15} /><span>Applicability is evaluated before residuals. No model is promoted by this endpoint.</span></p>
      <div className="measurement-validation-model-list">
        {(analysis.models ?? []).map((model) => <ValidationModelCard key={model.model_id} model={model} />)}
      </div>
      {analysis.holdout ? <HoldoutSummary holdout={analysis.holdout} /> : null}
      {(readiness.required_gates ?? []).length > 0 ? <details className="measurement-validation-gates"><summary>Promotion gates</summary><ul>{readiness.required_gates.map((gate) => <li key={gate}>{gate}</li>)}</ul></details> : null}
    </section>
  );
}

function ValidationModelCard({ model }) {
  const metric = model.metric ?? {};
  const statuses = model.status_counts ?? {};
  const calibration = model.calibration;
  const modelLabel = MODEL_OPTIONS.find(([modelID]) => modelID === model.model_id)?.[1] ?? "Reference model";
  const points = (model.predictions ?? []).filter((prediction) => prediction.residual_db !== undefined && prediction.residual_db !== null);
  return (
    <article className="measurement-validation-model-card">
      <header><div><strong>{modelLabel}</strong></div><span>{metric.count ?? 0} applicable</span></header>
      <div className="measurement-validation-statuses">{Object.entries(statuses).map(([status, count]) => <span key={status}><small>{formatLabel(status)}</small><strong>{count}</strong></span>)}</div>
      <div className="measurement-validation-metrics"><Metric label="Bias" value={metric.mean_bias_db} /><Metric label="Median" value={metric.median_bias_db} /><Metric label="MAE" value={metric.mae_db} /><Metric label="RMSE" value={metric.rmse_db} /><Metric label="Std" value={metric.std_db} /><Metric label="P10 / P90" value={`${formatNumber(metric.p10_db, 2)} / ${formatNumber(metric.p90_db, 2)}`} /></div>
      {model.p1411_sigma_comparison ? <p className="data-note">P.1411 source σ {formatNumber(model.p1411_sigma_comparison.source_sigma_db, 2)} dB · observed residual σ {formatNumber(model.p1411_sigma_comparison.observed_residual_std_db, 2)} dB.</p> : null}
      {model.atmospheric_comparison ? <p className="data-note">Atmospheric comparison: {formatLabel(model.atmospheric_comparison.status)}{model.atmospheric_comparison.reason ? ` · ${model.atmospheric_comparison.reason}` : ""}.</p> : null}
      {calibration ? <p className={`measurement-validation-calibration ${calibration.status === "stable" ? "valid" : "warning"}`}><strong>{formatLabel(calibration.status)}</strong> · fitted constant bias {formatNumber(calibration.fitted_bias_db, 2)} dB · validation n={calibration.validation_count} · promoted: no</p> : null}
      {points.length > 1 ? <ResidualChart points={points} /> : null}
      <details className="measurement-validation-model-provenance"><summary>Details / Provenance</summary><p className="data-note">Model ID <code>{model.model_id}</code> · version {model.model_version ?? "not supplied"}.</p></details>
      {(model.stratified_metrics ?? []).length > 0 ? <details className="measurement-validation-strata"><summary>Scenario and distance strata</summary><div>{model.stratified_metrics.slice(0, 18).map((row) => <span key={`${row.dimension}-${row.value}`}><small>{formatLabel(row.dimension)} · {row.value}</small><strong>{formatNumber(row.metric.mean_bias_db, 2)} dB / n={row.metric.count}</strong></span>)}</div></details> : null}
    </article>
  );
}

function Metric({ label, value }) {
  return <span><small>{label}</small><strong>{typeof value === "string" ? value : `${formatNumber(value, 2)} dB`}</strong></span>;
}

function ResidualChart({ points }) {
  const width = 320;
  const height = 92;
  const values = points.map((point) => point.residual_db);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const circles = points.map((point, index) => {
    const x = 12 + (index / Math.max(1, points.length - 1)) * (width - 24);
    const y = 12 + (1 - (point.residual_db - min) / span) * (height - 24);
    return <circle cx={x} cy={y} r="3" key={`${point.campaign_id}-${point.measurement_id}`}><title>{point.measurement_id}: {formatNumber(point.residual_db, 2)} dB</title></circle>;
  });
  return <div className="measurement-validation-chart"><div><small>Applicable residual sequence · dB</small><span>{formatNumber(min, 1)} … {formatNumber(max, 1)}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Applicable residual diagnostic chart"><line x1="12" x2={width - 12} y1={height / 2} y2={height / 2} /><polyline points={points.map((point, index) => `${12 + (index / Math.max(1, points.length - 1)) * (width - 24)},${12 + (1 - (point.residual_db - min) / span) * (height - 24)}`).join(" ")} /><g>{circles}</g></svg></div>;
}

function HoldoutSummary({ holdout }) {
  return <details className="measurement-validation-holdout" open><summary>{formatLabel(holdout.method)} · {holdout.folds?.length ?? 0} folds</summary><p className="data-note">{holdout.no_leak_evidence}</p><div>{(holdout.folds ?? []).slice(0, 12).map((fold) => <span key={fold.fold_id}><small>{fold.fold_id}</small><strong>cal {fold.calibration_count} · val {fold.validation_count}</strong></span>)}</div></details>;
}

function formatLabel(value) {
  return String(value ?? "unknown").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
