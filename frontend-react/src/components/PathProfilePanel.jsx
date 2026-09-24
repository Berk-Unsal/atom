import { useMemo, useState } from "react";
import { Crosshair, Mountain, PlayCircle, X } from "lucide-react";
import { formatNumber } from "../utils/appWorkspace.js";
import { defaultPathModelProfile } from "../utils/requestPayloads.js";
import { profileChartGeometry } from "../utils/pathProfileChart.js";

const DEFAULT_OPTIONS = {
  buildingLossMode: "screen-diffraction",
  diffractionModel: "single-knife-edge",
  defaultWallMaterial: "concrete",
  sampleSpacingM: 10,
  clutterSpecificAttenuationDbPerKm: 0,
  vegetationDepthM: 0,
  vegetationSpecificAttenuationDbPerM: 0,
  gasSpecificAttenuationDbPerKm: 0,
  rainSpecificAttenuationDbPerKm: 0,
  shadowSigmaDb: 6,
};

export default function PathProfilePanel({
  endpoint,
  isAnalyzing,
  isSelectingEndpoint,
  onAnalyze,
  onCancelSelection,
  onEndpointChange,
  onStartSelection,
  profile,
  selectedTower,
  settings,
}) {
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const modelProfile = options.modelProfile ?? defaultPathModelProfile(settings.frequencyGHz);

  const canAnalyze = Boolean(selectedTower && endpoint && !isAnalyzing);
  const updateOption = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  const coordinate = (index) => Number.isFinite(Number(endpoint?.[index])) ? endpoint[index] : "";

  return (
    <section className="path-profile-panel" aria-label="Vertical path profile">
      <header className="panel-title"><Mountain size={16} /><span>Vertical path profile</span></header>
      <p className="data-note">Advanced diagnostic only: inspect terrain, roof screens, Fresnel clearance, and enabled loss terms along one selected path. It does not change canonical network RF.</p>
      <p className="path-profile-source">Transmitter cell: <strong>{selectedTower?.cellId ?? selectedTower?.id ?? "Unavailable"}</strong></p>

      <div className="path-endpoint-controls">
        <button type="button" className={isSelectingEndpoint ? "active" : ""} onClick={isSelectingEndpoint ? onCancelSelection : onStartSelection} disabled={!selectedTower}>
          {isSelectingEndpoint ? <X size={14} /> : <Crosshair size={14} />}
          {isSelectingEndpoint ? "Cancel map pick" : "Pick receiver on map"}
        </button>
        <div className="path-coordinate-grid">
          <label><span>Receiver longitude</span><input type="number" step="0.000001" value={coordinate(0)} onChange={(event) => onEndpointChange?.([Number(event.target.value), Number(coordinate(1))])} /></label>
          <label><span>Receiver latitude</span><input type="number" step="0.000001" value={coordinate(1)} onChange={(event) => onEndpointChange?.([Number(coordinate(0)), Number(event.target.value)])} /></label>
        </div>
      </div>

      <div className="path-profile-options">
        <label><span>Applicability profile</span><select value={modelProfile} onChange={(event) => updateOption("modelProfile", event.target.value)}>
          <option value="terrain-profile">Terrain · ITU-R P.1812 range</option>
          <option value="urban-short-range">Urban short range · P.1411 range</option>
          <option value="research-sub-thz">Sub-THz research</option>
        </select></label>
        <label><span>Building treatment</span><select value={options.buildingLossMode} onChange={(event) => updateOption("buildingLossMode", event.target.value)}>
          <option value="screen-diffraction">Roof screen diffraction</option>
          <option value="penetration">Material penetration</option>
          <option value="none">Classification only</option>
        </select></label>
        <label><span>Sample spacing <small>m</small></span><input type="number" min="2" max="100" step="1" value={options.sampleSpacingM} onChange={(event) => updateOption("sampleSpacingM", Number(event.target.value))} /></label>
        <label><span>Shadow sigma <small>dB</small></span><input type="number" min="0" max="30" step="0.5" value={options.shadowSigmaDb} onChange={(event) => updateOption("shadowSigmaDb", Number(event.target.value))} /></label>
      </div>

      <details className="path-fidelity-details">
        <summary>Environmental sensitivity</summary>
        <div className="path-profile-options">
          <label><span>Clutter <small>dB/km</small></span><input type="number" min="0" max="100" step="0.1" value={options.clutterSpecificAttenuationDbPerKm} onChange={(event) => updateOption("clutterSpecificAttenuationDbPerKm", Number(event.target.value))} /></label>
          <label><span>Vegetation depth <small>m</small></span><input type="number" min="0" max="5000" step="1" value={options.vegetationDepthM} onChange={(event) => updateOption("vegetationDepthM", Number(event.target.value))} /></label>
          <label><span>Vegetation <small>dB/m</small></span><input type="number" min="0" max="10" step="0.01" value={options.vegetationSpecificAttenuationDbPerM} onChange={(event) => updateOption("vegetationSpecificAttenuationDbPerM", Number(event.target.value))} /></label>
          <label><span>Atmospheric gas <small>dB/km</small></span><input type="number" min="0" max="100" step="0.01" value={options.gasSpecificAttenuationDbPerKm} onChange={(event) => updateOption("gasSpecificAttenuationDbPerKm", Number(event.target.value))} /></label>
          <label><span>Rain <small>dB/km</small></span><input type="number" min="0" max="100" step="0.01" value={options.rainSpecificAttenuationDbPerKm} onChange={(event) => updateOption("rainSpecificAttenuationDbPerKm", Number(event.target.value))} /></label>
        </div>
      </details>

      <button type="button" className="path-analyze-button" disabled={!canAnalyze} onClick={() => onAnalyze?.({ ...options, modelProfile })}>
        <PlayCircle size={15} />{isAnalyzing ? "Analyzing path…" : "Analyze selected path"}
      </button>
      {!selectedTower ? <p className="inventory-validation">Select a transmitter cell first.</p> : null}
      {selectedTower && !endpoint ? <p className="path-empty-state">Pick a receiver point on the map to create a cross section.</p> : null}
      {profile ? <PathProfileResult profile={profile} /> : null}
    </section>
  );
}

export function PathProfileResult({ profile }) {
  const chart = useMemo(() => profileChartGeometry(profile?.samples ?? []), [profile]);
  const activeComponents = profile?.loss_budget?.components ?? [];
  const applicability = profile?.applicability ?? {};
  const diagnostic = profile?.diffraction_diagnostic ?? {};
  const geometry = diagnostic.geometry ?? {};
  const canonical = profile?.canonical_comparison ?? {};
  const candidates = geometry.candidates ?? profile?.obstruction_ledger ?? [];
  const selectedEdge = diagnostic.selected_edge;
  const diagnosticAvailable = diagnostic.available === true;
  const linkBudget = profile?.loss_budget?.link_budget ?? diagnostic.link_budget ?? {};
  const receiverThreshold = profile?.receiver_threshold ?? profile?.loss_budget?.receiver_threshold ?? {};
  const receiverMargin = profile?.loss_budget?.receiver_link_margin_db ?? linkBudget.receiver_link_margin_db;
  return (
    <section className="path-profile-result" aria-live="polite">
      <div className="path-profile-summary">
        <span><small>Geometric LOS</small><strong>{profile.geometric_los ? "Yes" : "No"}</strong></span>
        <span><small>Path</small><strong>{formatNumber(profile.distance_m, 0)} m</strong></span>
        <span><small>Fresnel ≥ 60%</small><strong>{profile.fresnel_clearance?.status === "concern" ? "Concern" : "Clear"}</strong></span>
        <span><small>Profile P50</small><strong>{formatNumber(profile.loss_budget?.rx_dbm_p50, 1)} dBm</strong></span>
      </div>
      <figure className="path-profile-chart">
        <svg viewBox="0 0 720 230" role="img" aria-labelledby="path-profile-chart-title path-profile-chart-desc">
          <title id="path-profile-chart-title">Vertical obstruction profile</title>
          <desc id="path-profile-chart-desc">Terrain and buildings compared with the direct line of sight and sixty percent of the first Fresnel zone.</desc>
          <path className="profile-fresnel" d={chart.fresnelPath} />
          <path className="profile-terrain" d={chart.terrainAreaPath} />
          <path className="profile-buildings" d={chart.buildingAreaPath} />
          <path className="profile-los" d={chart.losPath} />
          {chart.dominant ? <circle className="profile-obstruction" cx={chart.dominant.x} cy={chart.dominant.y} r="5" /> : null}
          <line className="profile-axis" x1="42" y1="202" x2="704" y2="202" />
          <text x="42" y="222">0 m</text><text x="704" y="222" textAnchor="end">{formatNumber(profile.distance_m, 0)} m</text>
        </svg>
        <figcaption>Classification: {formatLabel(profile.classification)}. Terrain {profile.terrain?.available ? `from ${profile.terrain.source}` : "unavailable · local zero datum"}. Heights with a “default-3-storey” source are planning assumptions only and are never diffraction evidence.</figcaption>
      </figure>

      <section className={`diffraction-diagnostic ${diagnosticAvailable ? "available" : "unavailable"}`} aria-label="Diffraction diagnostic">
        <div className="diagnostic-section-heading">
          <span>DIFFRACTION DIAGNOSTIC</span>
          <small>Diagnostic only — not applied to network simulation</small>
        </div>
        <p className="data-note">{diagnostic.method ?? "P.526-aligned single-edge diagnostic"}. Canonical UMa and FSPL plus explicit diffraction are alternative calculations; they are never summed.</p>
        <div className="diagnostic-metrics">
          <span><small>Reference</small><strong>{diagnostic.reference ?? "ITU-R P.526-16 §4.1"}</strong></span>
          <span><small>Availability</small><strong>{diagnosticAvailable ? "Available" : `Unavailable · ${formatLabel(diagnostic.reason)}`}</strong></span>
          <span><small>Selected edge</small><strong>{selectedEdge ? `${selectedEdge.obstruction_id} · ${formatLabel(selectedEdge.edge_position)}` : "None"}</strong></span>
          <span><small>v</small><strong>{formatNumber(selectedEdge?.v, 4)}</strong></span>
          <span><small>Explicit diffraction loss</small><strong>{formatNumber(diagnostic.diffraction_loss_db, 2)} dB</strong></span>
          <span><small>Diagnostic Rx</small><strong>{formatNumber(diagnostic.diagnostic_rx_dbm, 1)} dBm</strong></span>
          <span><small>Canonical UMa Rx</small><strong>{formatNumber(canonical.canonical_rx_dbm, 1)} dBm</strong></span>
          <span><small>Diagnostic − canonical</small><strong>{formatNumber(canonical.diagnostic_minus_canonical_db, 1)} dB</strong></span>
        </div>
        <p className="diagnostic-limitations">{(diagnostic.limitations ?? []).join(" · ")}</p>
        {candidates.length > 0 ? (
          <details className="diffraction-ledger">
            <summary>Inspect obstruction ledger ({candidates.length} edge{candidates.length === 1 ? "" : "s"})</summary>
            <div className="diffraction-ledger-table" role="table" aria-label="Diffraction obstruction ledger">
              <div className="diffraction-ledger-row heading" role="row"><span>Edge</span><span>Height source</span><span>Clearance</span><span>v / loss</span></div>
              {candidates.map((candidate) => (
                <div className="diffraction-ledger-row" role="row" key={candidate.id}>
                  <span><strong>{candidate.obstruction_id}</strong><small>{formatLabel(candidate.edge_position)}{candidate.selected_dominant_edge ? " · selected" : ""}</small></span>
                  <span>{formatLabel(candidate.height_source)}{candidate.height_available ? "" : " · unavailable"}</span>
                  <span>{formatNumber(candidate.clearance_m, 1)} m<small>{formatNumber(candidate.fresnel_clearance_ratio, 2)} F1</small></span>
                  <span>{formatNumber(candidate.v, 4)}<small>{formatNumber(candidate.diffraction_loss_db, 2)} dB</small></span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {Object.keys(linkBudget).length > 0 ? <LinkBudgetLedger ledger={linkBudget} /> : null}

      {receiverThreshold.mode ? (
        <section className="receiver-threshold-card" aria-label="Receiver sensitivity threshold">
          <div className="diagnostic-section-heading"><span>RECEIVER SENSITIVITY</span><small>{receiverThreshold.mode} mode · strict received power &gt; threshold</small></div>
          <div className="diagnostic-metrics">
            <span><small>Effective threshold</small><strong>{formatNumber(receiverThreshold.sensitivity_dbm, 1)} dBm</strong></span>
            <span><small>Link margin at P50</small><strong>{formatNumber(receiverMargin, 1)} dB</strong></span>
            {receiverThreshold.noise_bandwidth_hz !== undefined ? <span><small>Noise bandwidth</small><strong>{formatNumber(Number(receiverThreshold.noise_bandwidth_hz) / 1e6, 1)} MHz</strong></span> : null}
            {receiverThreshold.noise_figure_db !== undefined ? <span><small>Noise figure</small><strong>{formatNumber(receiverThreshold.noise_figure_db, 1)} dB</strong></span> : null}
            {receiverThreshold.required_snr_db !== undefined ? <span><small>Required SNR</small><strong>{formatNumber(receiverThreshold.required_snr_db, 1)} dB</strong></span> : null}
            {receiverThreshold.receiver_margin_db !== undefined ? <span><small>Receiver margin</small><strong>{formatNumber(receiverThreshold.receiver_margin_db, 1)} dB</strong></span> : null}
          </div>
          <p className="data-note">{(receiverThreshold.assumptions ?? []).join(" · ")}</p>
        </section>
      ) : null}

      <details className="profile-loss-details">
        <summary>Supplemental path-profile loss budget</summary>
        <div className="loss-budget" role="table" aria-label="Supplemental propagation loss budget">
        {activeComponents.map((component) => (
          <div key={component.id} className={!component.enabled ? "disabled" : ""} role="row">
            <span role="cell"><strong>{component.label}</strong><small>{component.method}{component.reference ? ` · ${component.reference}` : ""}</small></span>
            <b role="cell">{formatNumber(component.loss_db, 2)} dB</b>
          </div>
        ))}
        <div className="loss-total" role="row"><span role="cell"><strong>Total median loss</strong></span><b role="cell">{formatNumber(profile.loss_budget?.total_median_loss_db, 2)} dB</b></div>
        </div>
      </details>
      <p className={`path-applicability ${applicability.frequency_applicable ? "valid" : "warning"}`}>
        <strong>{applicability.reference}</strong> · {applicability.implementation}
      </p>
      <p className="data-note">Model scope: {profile.rf_contract?.model_id ?? "path-profile-diagnostic-v1"}. This diagnostic response is isolated from the canonical network model.</p>
    </section>
  );
}

function LinkBudgetLedger({ ledger }) {
  const rows = [
    ["Conducted TX power", ledger.tx_power_dbm, "dBm", "plain"],
    ["TX absolute boresight gain", ledger.tx_antenna_gain_dbi, "dBi", "gain"],
    ["Boresight EIRP", ledger.boresight_eirp_dbm, "dBm", "plain"],
    ["TX directional EIRP", ledger.directional_eirp_dbm, "dBm", "plain"],
    ["TX relative pattern", ledger.tx_pattern_attenuation_db, "dB loss", "loss"],
    ["Propagation loss", ledger.propagation_loss_db, "dB loss", "loss"],
    ["Building loss", ledger.building_loss_db, "dB loss", "loss"],
    ["System loss", ledger.system_loss_db, "dB loss", "loss"],
    ["Polarization loss", ledger.polarization_loss_db, "dB loss", "loss"],
    ["RX antenna gain", ledger.rx_antenna_gain_dbi, "dBi", "gain"],
    ["Calibration", ledger.calibration_offset_db, "dB", "offset"],
    ["Total signed loss", ledger.total_loss_db, "dB", "offset"],
  ];
  return (
    <details className="link-budget-details" open>
      <summary>Signed link-budget ledger</summary>
      <p className="data-note">Directional EIRP = boresight EIRP − TX pattern loss. Received power keeps conducted TX power, absolute gain, propagation/building loss, system loss, polarization loss, RX gain, and calibration separate.</p>
      <div className="link-budget-grid" role="table" aria-label="Signed link-budget ledger">
        {rows.map(([label, value, unit, sign]) => (
          <div key={label} role="row"><span role="cell">{label}</span><strong role="cell">{formatLedgerValue(value, unit, sign)}</strong></div>
        ))}
        <div className="link-budget-result" role="row"><span role="cell">Received power</span><strong role="cell">{formatValue(ledger.received_power_dbm, "dBm")}</strong></div>
      </div>
    </details>
  );
}

function formatValue(value, unit) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)} ${unit}` : "—";
}

function formatSigned(value, unit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)} ${unit}`;
}

function formatLedgerValue(value, unit, sign) {
  if (sign === "loss") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `−${Math.abs(numeric).toFixed(2)} ${unit}` : "—";
  }
  if (sign === "gain" || sign === "offset") return formatSigned(value, unit);
  return formatValue(value, unit);
}

function formatLabel(value) {
  return String(value ?? "unknown").replaceAll(/[-_]+/g, " ");
}
