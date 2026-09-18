import { useState } from "react";
import { Activity, CloudFog, CloudRain, PlayCircle, Radio } from "lucide-react";
import { formatNumber } from "../utils/appWorkspace.js";

function initialOptions(settings) {
  return {
    frequencyGHz: 140,
    txHeightM: Number(settings?.antennaHeightM ?? 25),
    rxHeightM: Number(settings?.receiverHeightM ?? 1.5),
    pressureHpa: 1013.25,
    temperatureK: 288.15,
    waterVapourDensityGm3: 7.5,
    rainEnabled: false,
    rainRateMmh: 25,
    rainPolarization: "circular",
    rainPolarizationTiltDeg: 45,
    localFogEnabled: false,
    localFogDensityGm3: 0.5,
    localFogTemperatureK: 288.15,
    linkBudgetEnabled: false,
    conductedTxPowerDbm: Number(settings?.txPowerDbm ?? 30),
    txGainDbi: 25,
    rxGainDbi: 0,
    txPatternAttenuationDb: 0,
    systemLossDb: 0,
    polarizationLossDb: 0,
    calibrationOffsetDb: 0,
  };
}

export default function SubTHZReferencePanel({ endpoint, isAnalyzing, onAnalyze, reference, selectedTower, settings }) {
  const [options, setOptions] = useState(() => initialOptions(settings));
  const update = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  const numberValue = (key) => Number.isFinite(Number(options[key])) ? options[key] : "";
  const canRun = Boolean(selectedTower && endpoint && !isAnalyzing);

  return (
    <section className="sub-thz-reference-panel" aria-label="Sub-THz atmospheric reference">
      <header className="panel-title"><Activity size={16} /><span>Sub-THz atmospheric reference</span></header>
      <p className="data-note">Opt-in, non-canonical ledger. It evaluates P.525 free space plus explicitly enabled atmosphere terms and never changes network RF, coverage, interference, or optimization.</p>

      <div className="sub-thz-reference-status">
        <span><strong>Model</strong><code>sub_thz_atmospheric_reference_v1</code></span>
        <span><strong>Path</strong>{endpoint ? "Selected map receiver" : "Choose a map receiver"}</span>
      </div>

      <div className="sub-thz-reference-options">
        <label><span>Frequency <small>GHz</small></span><input type="number" min="1" max="1000" step="1" value={numberValue("frequencyGHz")} onChange={(event) => update("frequencyGHz", Number(event.target.value))} /></label>
        <label><span>TX height <small>m</small></span><input type="number" min="0" max="10000" step="0.5" value={numberValue("txHeightM")} onChange={(event) => update("txHeightM", Number(event.target.value))} /></label>
        <label><span>RX height <small>m</small></span><input type="number" min="0" max="10000" step="0.5" value={numberValue("rxHeightM")} onChange={(event) => update("rxHeightM", Number(event.target.value))} /></label>
        <label><span>Pressure <small>hPa</small></span><input type="number" min="300" max="1100" step="0.25" value={numberValue("pressureHpa")} onChange={(event) => update("pressureHpa", Number(event.target.value))} /></label>
        <label><span>Temperature <small>K</small></span><input type="number" min="180" max="330" step="0.05" value={numberValue("temperatureK")} onChange={(event) => update("temperatureK", Number(event.target.value))} /></label>
        <label><span>Water vapour <small>g/m³</small></span><input type="number" min="0" max="100" step="0.1" value={numberValue("waterVapourDensityGm3")} onChange={(event) => update("waterVapourDensityGm3", Number(event.target.value))} /></label>
      </div>

      <div className="sub-thz-reference-toggles">
        <label className="sub-thz-reference-toggle"><input type="checkbox" checked={options.rainEnabled} onChange={(event) => update("rainEnabled", event.target.checked)} /><CloudRain size={15} /><span>Include P.838 rain</span></label>
        <label className="sub-thz-reference-toggle"><input type="checkbox" checked={options.localFogEnabled} onChange={(event) => update("localFogEnabled", event.target.checked)} /><CloudFog size={15} /><span>Include local P.840 fog</span></label>
      </div>

      {options.rainEnabled ? (
        <div className="sub-thz-reference-suboptions">
          <label><span>Rain rate <small>mm/h</small></span><input type="number" min="0" max="500" step="0.5" value={numberValue("rainRateMmh")} onChange={(event) => update("rainRateMmh", Number(event.target.value))} /></label>
          <label><span>Polarization</span><select value={options.rainPolarization} onChange={(event) => update("rainPolarization", event.target.value)}><option value="circular">Circular · 45°</option><option value="horizontal">Horizontal · 0°</option><option value="vertical">Vertical · 90°</option><option value="linear">Linear · custom tilt</option></select></label>
          {options.rainPolarization === "linear" ? <label><span>Tilt <small>deg</small></span><input type="number" min="0" max="90" step="1" value={numberValue("rainPolarizationTiltDeg")} onChange={(event) => update("rainPolarizationTiltDeg", Number(event.target.value))} /></label> : null}
        </div>
      ) : null}

      {options.localFogEnabled ? (
        <div className="sub-thz-reference-suboptions">
          <label><span>Liquid water density <small>g/m³</small></span><input type="number" min="0" max="5" step="0.05" value={numberValue("localFogDensityGm3")} onChange={(event) => update("localFogDensityGm3", Number(event.target.value))} /></label>
          <label><span>Fog temperature <small>K</small></span><input type="number" min="180" max="330" step="0.05" value={numberValue("localFogTemperatureK")} onChange={(event) => update("localFogTemperatureK", Number(event.target.value))} /></label>
        </div>
      ) : null}

      <details className="sub-thz-reference-link-details">
        <summary>Optional reference received-power ledger</summary>
        <label className="sub-thz-reference-toggle"><input type="checkbox" checked={options.linkBudgetEnabled} onChange={(event) => update("linkBudgetEnabled", event.target.checked)} /><Radio size={15} /><span>Include explicit link budget</span></label>
        {options.linkBudgetEnabled ? (
          <div className="sub-thz-reference-options">
            <label><span>Conducted TX <small>dBm</small></span><input type="number" step="0.5" value={numberValue("conductedTxPowerDbm")} onChange={(event) => update("conductedTxPowerDbm", Number(event.target.value))} /></label>
            <label><span>TX gain <small>dBi</small></span><input type="number" step="0.5" value={numberValue("txGainDbi")} onChange={(event) => update("txGainDbi", Number(event.target.value))} /></label>
            <label><span>RX gain <small>dBi</small></span><input type="number" step="0.5" value={numberValue("rxGainDbi")} onChange={(event) => update("rxGainDbi", Number(event.target.value))} /></label>
            <label><span>TX pattern <small>dB loss</small></span><input type="number" min="0" step="0.5" value={numberValue("txPatternAttenuationDb")} onChange={(event) => update("txPatternAttenuationDb", Number(event.target.value))} /></label>
            <label><span>System loss <small>dB</small></span><input type="number" min="0" step="0.5" value={numberValue("systemLossDb")} onChange={(event) => update("systemLossDb", Number(event.target.value))} /></label>
            <label><span>Polarization loss <small>dB</small></span><input type="number" min="0" step="0.5" value={numberValue("polarizationLossDb")} onChange={(event) => update("polarizationLossDb", Number(event.target.value))} /></label>
            <label><span>Calibration <small>dB</small></span><input type="number" step="0.5" value={numberValue("calibrationOffsetDb")} onChange={(event) => update("calibrationOffsetDb", Number(event.target.value))} /></label>
          </div>
        ) : <p className="data-note">No receiver power is calculated until this block is enabled. Thresholds and serviceability remain out of scope.</p>}
      </details>

      <button type="button" className="path-analyze-button" disabled={!canRun} onClick={() => onAnalyze?.(options)}><PlayCircle size={15} />{isAnalyzing ? "Evaluating reference…" : "Run atmospheric reference"}</button>
      {!selectedTower ? <p className="inventory-validation">Select a transmitter cell first.</p> : null}
      {selectedTower && !endpoint ? <p className="path-empty-state">Pick a receiver point above before running the reference ledger.</p> : null}
      {reference ? <SubTHZReferenceResult reference={reference} /> : null}
    </section>
  );
}

function SubTHZReferenceResult({ reference }) {
  const total = reference.total ?? {};
  const applicability = reference.applicability ?? {};
  const obstruction = reference.obstruction ?? {};
  const budget = reference.reference_link_budget;
  return (
    <section className="sub-thz-reference-result" aria-live="polite">
      <div className="sub-thz-reference-summary">
        <span><small>FSPL</small><strong>{formatNumber(reference.fspl?.fspl_db, 2)} dB</strong></span>
        <span><small>Atmospheric</small><strong>+{formatNumber(total.atmospheric_db, 2)} dB</strong></span>
        <span><small>Total reference</small><strong>{formatNumber(total.total_path_loss_db, 2)} dB</strong></span>
        <span><small>Distance</small><strong>{formatNumber(reference.geometry?.slant_distance_m, 1)} m</strong></span>
      </div>
      <p className={`sub-thz-reference-applicability ${applicability.status === "partial" ? "warning" : "valid"}`}><strong>{applicability.status ?? "unknown"}</strong> · {formatComponentSummary(reference)}</p>
      <div className="sub-thz-reference-ledger" role="table" aria-label="Sub-THz atmospheric component ledger">
        <div role="row"><span role="cell">P.676 gas</span><strong role="cell">{formatNumber(reference.gas?.path_loss_db, 3)} dB</strong></div>
        <div role="row"><span role="cell">P.838 rain</span><strong role="cell">{formatNumber(reference.rain?.path_loss_db, 3)} dB</strong></div>
        <div role="row"><span role="cell">P.840 local fog</span><strong role="cell">{formatNumber(reference.local_fog?.path_loss_db, 3)} dB</strong></div>
      </div>
      <p className="data-note">Building status: {obstruction.building_intersection_present ? `${obstruction.building_intersection_count} footprint intersection flagged; no wall or diffraction loss applied.` : obstruction.building_dataset_available ? "No building intersection flagged." : "Building index unavailable; atmospheric terms are still evaluable."}</p>
      {budget ? <p className="sub-thz-reference-budget-note">Reference Rx: {formatNumber(budget.received_power_dbm, 2)} dBm · threshold/serviceability not evaluated.</p> : null}
      <details className="sub-thz-reference-audit-details">
        <summary>Inspect standards, assumptions, and fingerprint</summary>
        <div className="sub-thz-reference-audit-grid">
          <span><small>Model</small><code>{reference.reference_model_id}</code></span>
          <span><small>Fingerprint</small><code>{reference.experiment_fingerprint}</code></span>
          <span><small>Gas dry / water</small><strong>{formatNumber(reference.gas?.dry_air_db_per_km, 4)} / {formatNumber(reference.gas?.water_vapour_db_per_km, 4)} dB/km</strong></span>
          <span><small>Rain k / α</small><strong>{formatNumber(reference.rain?.k, 4)} / {formatNumber(reference.rain?.alpha, 4)}</strong></span>
        </div>
        <p className="data-note">{(reference.assumptions ?? []).join(" · ")}</p>
        <p className="data-note">{(reference.limitations ?? []).join(" · ")}</p>
      </details>
    </section>
  );
}

function formatComponentSummary(reference) {
  const enabled = (reference.applicability?.components ?? []).filter((component) => component.enabled);
  if (enabled.length === 0) return "P.525-only ledger";
  return enabled.map((component) => component.reference).join(" + ");
}
