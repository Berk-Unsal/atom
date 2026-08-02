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
      <p className="data-note">Inspect terrain, roof screens, Fresnel clearance, and every enabled loss term along one selected path.</p>

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
  return (
    <section className="path-profile-result" aria-live="polite">
      <div className="path-profile-summary">
        <span><small>Classification</small><strong>{formatLabel(profile.classification)}</strong></span>
        <span><small>Path</small><strong>{formatNumber(profile.distance_m, 0)} m</strong></span>
        <span><small>P50</small><strong>{formatNumber(profile.loss_budget?.rx_dbm_p50, 1)} dBm</strong></span>
        <span><small>P90 reliability</small><strong>{formatNumber(profile.loss_budget?.rx_dbm_p90_reliability, 1)} dBm</strong></span>
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
        <figcaption>Terrain {profile.terrain?.available ? `from ${profile.terrain.source}` : "unavailable · local zero datum"}. Heights with a “default-3-storey” source are planning assumptions.</figcaption>
      </figure>

      <div className="loss-budget" role="table" aria-label="Propagation loss budget">
        {activeComponents.map((component) => (
          <div key={component.id} className={!component.enabled ? "disabled" : ""} role="row">
            <span role="cell"><strong>{component.label}</strong><small>{component.method}{component.reference ? ` · ${component.reference}` : ""}</small></span>
            <b role="cell">{formatNumber(component.loss_db, 2)} dB</b>
          </div>
        ))}
        <div className="loss-total" role="row"><span role="cell"><strong>Total median loss</strong></span><b role="cell">{formatNumber(profile.loss_budget?.total_median_loss_db, 2)} dB</b></div>
      </div>
      <p className={`path-applicability ${applicability.frequency_applicable ? "valid" : "warning"}`}>
        <strong>{applicability.reference}</strong> · {applicability.implementation}
      </p>
    </section>
  );
}

function formatLabel(value) {
  return String(value ?? "unknown").replaceAll("-", " ");
}
