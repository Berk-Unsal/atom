import { useState } from "react";
import { Activity, BookOpen, GitCompare, PlayCircle } from "lucide-react";
import { formatNumber } from "../utils/appWorkspace.js";

function initialOptions(settings) {
  return {
    frequencyGHz: 140,
    txHeightM: Number(settings?.antennaHeightM ?? 25),
    rxHeightM: Number(settings?.receiverHeightM ?? 1.5),
    morphology: "urban_high_rise",
    rooftopRelation: "both_below_rooftop",
    losState: "los",
    candidateModelID: "all",
    includeAtmosphericComparison: false,
    pressureHpa: 1013.25,
    temperatureK: 288.15,
    waterVapourDensityGm3: 7.5,
    includeResearchComparison: false,
    researchWallEventCount: 0,
  };
}

export default function P1411CandidatePanel({ endpoint, isAnalyzing, onActivityChange, onAnalyze, reference, selectedTower, settings }) {
  const [options, setOptions] = useState(() => initialOptions(settings));
  const update = (key, value) => {
    onActivityChange?.();
    setOptions((current) => ({ ...current, [key]: value }));
  };
  const numberValue = (key) => Number.isFinite(Number(options[key])) ? options[key] : "";
  const canRun = Boolean(selectedTower && endpoint && !isAnalyzing);

  return (
    <section className="p1411-candidate-panel" aria-label="ITU-R P.1411 candidate reference">
      <header className="panel-title"><Activity size={16} /><span>ITU-R P.1411 candidate reference</span></header>
      <p className="p1411-callout"><strong>Reference candidate only — not used by network simulation.</strong> This isolated panel evaluates Table 4 rows side by side. It does not change coverage, interference, optimization, building entry, or canonical RF.</p>
      <p className="data-note">Source clause: ITU-R P.1411-13 (2025-09) §4.1.1, Table 4, equation (1). The 25 m TX / 1.5 m RX profile defaults are inputs only; they do not prove that both stations are below rooftops.</p>

      <div className="p1411-reference-status">
        <span><strong>Rows</strong><code>3 supported candidates</code></span>
        <span><strong>Path</strong>{endpoint ? "Selected map receiver" : "Choose a map receiver"}</span>
        <span><strong>Current model</strong><code>median + sigma metadata</code></span>
      </div>

      <div className="p1411-options">
        <label><span>Frequency <small>GHz</small></span><input aria-label="P.1411 frequency" type="number" min="0.45" max="300" step="0.1" value={numberValue("frequencyGHz")} onChange={(event) => update("frequencyGHz", Number(event.target.value))} /></label>
        <label><span>TX height <small>m</small></span><input aria-label="P.1411 TX height" type="number" min="0" max="10000" step="0.5" value={numberValue("txHeightM")} onChange={(event) => update("txHeightM", Number(event.target.value))} /></label>
        <label><span>RX height <small>m</small></span><input aria-label="P.1411 RX height" type="number" min="0" max="10000" step="0.5" value={numberValue("rxHeightM")} onChange={(event) => update("rxHeightM", Number(event.target.value))} /></label>
        <label><span>Candidate row</span><select aria-label="P.1411 candidate row" value={options.candidateModelID} onChange={(event) => update("candidateModelID", event.target.value)}><option value="all">All Table 4 candidates</option><option value="p1411_below_rooftop_los_v1">Below-rooftop LoS</option><option value="p1411_urban_highrise_nlos_v1">Urban high-rise NLoS</option><option value="p1411_urban_lowrise_nlos_v1">Urban low-rise/suburban NLoS</option></select></label>
        <label><span>Morphology</span><select aria-label="P.1411 morphology" value={options.morphology} onChange={(event) => update("morphology", event.target.value)}><option value="urban_high_rise">Urban high-rise</option><option value="urban_low_rise">Urban low-rise</option><option value="suburban">Suburban</option><option value="unknown">Unknown</option></select></label>
        <label><span>Rooftop relation</span><select aria-label="P.1411 rooftop relation" value={options.rooftopRelation} onChange={(event) => update("rooftopRelation", event.target.value)}><option value="both_below_rooftop">Both below rooftop</option><option value="one_above_one_below">One above / one below</option><option value="both_above_rooftop">Both above rooftop</option><option value="unknown">Unknown</option></select></label>
        <label><span>Path state</span><select aria-label="P.1411 path state" value={options.losState} onChange={(event) => update("losState", event.target.value)}><option value="los">LoS</option><option value="nlos">NLoS</option><option value="unknown">Unknown</option></select></label>
      </div>

      <div className="p1411-provenance-note"><BookOpen size={15} /><span>Scenario selections are sent as <code>user_declared</code>; distance is <code>geometry_derived</code>. Unknown scenario values remain inapplicable.</span></div>

      <details className="p1411-comparison-details">
        <summary><GitCompare size={14} />Optional side-by-side comparisons</summary>
        <label className="p1411-toggle"><input type="checkbox" checked={options.includeAtmosphericComparison} onChange={(event) => update("includeAtmosphericComparison", event.target.checked)} /><span>Request 4I.2A atmospheric comparison (not summed)</span></label>
        {options.includeAtmosphericComparison ? (
          <div className="p1411-comparison-options">
            <label><span>Pressure <small>hPa</small></span><input aria-label="Atmospheric comparison pressure" type="number" min="300" max="1100" step="0.25" value={numberValue("pressureHpa")} onChange={(event) => update("pressureHpa", Number(event.target.value))} /></label>
            <label><span>Temperature <small>K</small></span><input aria-label="Atmospheric comparison temperature" type="number" min="180" max="330" step="0.05" value={numberValue("temperatureK")} onChange={(event) => update("temperatureK", Number(event.target.value))} /></label>
            <label><span>Water vapour <small>g/m³</small></span><input aria-label="Atmospheric comparison water vapour" type="number" min="0" max="100" step="0.1" value={numberValue("waterVapourDensityGm3")} onChange={(event) => update("waterVapourDensityGm3", Number(event.target.value))} /></label>
          </div>
        ) : null}
        <label className="p1411-toggle"><input type="checkbox" checked={options.includeResearchComparison} onChange={(event) => update("includeResearchComparison", event.target.checked)} /><span>Compare current research_sub_thz wall events</span></label>
        {options.includeResearchComparison ? <label className="p1411-inline-number"><span>Wall-event count</span><input aria-label="Research wall-event count" type="number" min="0" max="1000" step="1" value={numberValue("researchWallEventCount")} onChange={(event) => update("researchWallEventCount", Number(event.target.value))} /></label> : null}
      </details>

      <button type="button" className="path-analyze-button" disabled={!canRun} onClick={() => onAnalyze?.(options)}><PlayCircle size={15} />{isAnalyzing ? "Evaluating candidates…" : "Run P.1411 candidate reference"}</button>
      {!selectedTower ? <p className="inventory-validation">Select a transmitter cell first.</p> : null}
      {selectedTower && !endpoint ? <p className="path-empty-state">Pick a receiver point above before running the candidate reference.</p> : null}
      {reference ? <P1411ReferenceResult reference={reference} /> : null}
    </section>
  );
}

function P1411ReferenceResult({ reference }) {
  const scene = reference.scene_context ?? {};
  const obstruction = reference.obstruction ?? {};
  const candidates = reference.candidates ?? [];
  return (
    <section className="p1411-result" aria-live="polite">
      <div className="p1411-result-summary">
        <span><small>Applicable rows</small><strong>{(reference.applicable_candidates ?? []).length} / {candidates.length}</strong></span>
        <span><small>Frequency</small><strong>{formatNumber(scene.frequency_ghz, 1)} GHz</strong></span>
        <span><small>3D direct distance</small><strong>{formatNumber(scene.slant_distance_m, 1)} m</strong></span>
        <span><small>Scenario</small><strong>{formatScenario(scene)}</strong></span>
      </div>
      <p className="p1411-result-boundary"><strong>Median/reference output only.</strong> No random fading is sampled, no candidate is ranked, and no result is fed into network RF.</p>
      <div className="p1411-candidate-list">
        {candidates.map((candidate) => <P1411CandidateCard candidate={candidate} key={candidate.model_id} />)}
      </div>
      <details className="p1411-audit-details">
        <summary>Inspect geometry context, comparisons, and fingerprint</summary>
        <div className="p1411-audit-grid">
          <span><small>Fingerprint</small><code>{reference.fingerprint}</code></span>
          <span><small>Building intersections</small><strong>{obstruction.building_intersection_present ? obstruction.building_intersection_count : 0}</strong></span>
          <span><small>Known / unknown heights</small><strong>{obstruction.known_height_count ?? 0} / {obstruction.unknown_height_count ?? 0}</strong></span>
          <span><small>Canonical coupling</small><strong>False</strong></span>
        </div>
        <p className="data-note">{(reference.comparison_notes ?? []).join(" · ")}</p>
        <p className="data-note">{(reference.limitations ?? []).join(" · ")}</p>
      </details>
    </section>
  );
}

function P1411CandidateCard({ candidate }) {
  const applicability = candidate.applicability ?? {};
  const model = candidate.model ?? {};
  const p525 = candidate.p525_comparison ?? {};
  const atmospheric = candidate.external_atmospheric_composition ?? {};
  const research = candidate.research_sub_thz_comparison ?? {};
  const applicable = applicability.applicable;
  return (
    <article className={`p1411-candidate-card ${applicable ? "applicable" : "inapplicable"}`}>
      <header className="p1411-candidate-header">
        <div><strong>{candidate.row}</strong></div>
        <span className={applicable ? "valid" : "warning"}>{applicable ? "Applicable" : "Inapplicable"}</span>
      </header>
      {!applicable ? <p className="p1411-reasons"><strong>Gates:</strong> {(applicability.reasons ?? []).map(formatReason).join(" · ")}</p> : null}
      <div className="p1411-candidate-metrics">
        <span><small>Effective envelope</small><strong>{formatDistanceRange(applicability.effective_distance_range_m)}</strong></span>
        <span><small>Table 4 general distance</small><strong>{formatDistanceRange(applicability.general_distance_range_m)}</strong></span>
        <span><small>Median path loss</small><strong>{model.median_path_loss_db === undefined ? "Not extrapolated" : `${formatNumber(model.median_path_loss_db, 2)} dB`}</strong></span>
        <span><small>Table 4 sigma</small><strong>±{formatNumber(candidate.uncertainty?.sigma_db, 2)} dB</strong></span>
        <span><small>P.525 FSPL</small><strong>{formatNumber(p525.fspl_db, 2)} dB</strong></span>
        <span><small>P.1411 − P.525</small><strong>{formatNumber(p525.excess_relative_to_fspl_db, 2)} dB</strong></span>
      </div>
      <p className="data-note">{candidate.uncertainty?.interpretation} Random sampling: {candidate.uncertainty?.random_sampling ? "enabled" : "disabled"}.</p>
      {atmospheric.status === "comparison_only" ? <p className="p1411-comparison-note"><strong>Alternative atmospheric calculation:</strong> {formatNumber(atmospheric.total_path_loss_db, 2)} dB total; difference to P.1411 {formatNumber(atmospheric.difference_to_p1411_median_db, 2)} dB. Not summed.</p> : null}
      {research.status === "comparison_only" ? <p className="p1411-comparison-note"><strong>Alternative research_sub_thz calculation:</strong> {formatNumber(research.total_path_loss_db, 2)} dB with {research.wall_event_count} wall event(s). Not summed.</p> : null}
      <details className="p1411-candidate-details">
        <summary>Inspect coefficients and source limits</summary>
        <div className="p1411-audit-grid">
          <span><small>Model ID</small><code>{candidate.model_id}</code></span>
          <span><small>Equation</small><code>{model.equation}</code></span>
          <span><small>α / β / γ</small><strong>{formatNumber(model.coefficients?.alpha, 2)} / {formatNumber(model.coefficients?.beta, 2)} / {formatNumber(model.coefficients?.gamma, 2)}</strong></span>
          <span><small>Rooftop / path state</small><strong>{candidate.applicability?.required_rooftop_relation} / {candidate.applicability?.required_los_state}</strong></span>
          <span><small>Source</small><a href="https://www.itu.int/rec/R-REC-P.1411-13-202509-I/en" target="_blank" rel="noreferrer">ITU-R P.1411-13 §4.1.1 Table 4</a></span>
        </div>
        <p className="data-note">{candidate.limitations?.join(" · ")}</p>
      </details>
    </article>
  );
}

function formatDistanceRange(range) {
  if (!Array.isArray(range) || range.length < 2) return "Not available";
  return `${formatNumber(range[0], 0)}–${formatNumber(range[1], 0)} m`;
}

function formatReason(reason) {
  return String(reason ?? "unknown").replaceAll("_", " ");
}

function formatScenario(scene) {
  const morphology = String(scene.morphology ?? "unknown").replaceAll("_", " ");
  const los = String(scene.los_state ?? "unknown").toUpperCase();
  return `${morphology} · ${los}`;
}
