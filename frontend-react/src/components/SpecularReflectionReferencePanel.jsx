import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, PlayCircle, Waves } from "lucide-react";
import { formatNumber } from "../utils/appWorkspace.js";
import ResearchReferenceBadge from "./ResearchReferenceBadge.jsx";

const INITIAL_OPTIONS = {
  frequencyGHz: 140,
  polarization: "TE",
  tx: { x: 50, y: -50, z: 10, gainDBi: 0, antennaMode: "isotropic", apertureM: "" },
  rx: { x: 50, y: 50, z: 10, gainDBi: 0, antennaMode: "isotropic", apertureM: "" },
  facade: {
    startX: 0, startY: -10, endX: 0, endY: 10, planeX: 0, planeY: 0,
    normalX: 1, normalY: 0, normalZ: 0, baseZ: 0, topZ: 20,
    geometryProvenance: "user_declared", normalProvenance: "user_declared", heightProvenance: "user_declared",
  },
  material: {
    mode: "interface", materialSource: "user_defined", name: "lossless epsilon 4",
    relativePermittivity: 4, conductivitySPerM: 0, materialID: "concrete_110_330", thicknessM: 0.1,
    phaseCoherence: "coherent_total_slab", propertySource: "user_declared",
  },
  terrainMode: "flat_ground_relative_datum",
  rmsRoughnessM: "",
  linkBudget: {
    ptConductedDbm: 30, txPatternAttenuationDB: 0, rxPatternAttenuationDB: 0,
    systemLossDB: 0, polarizationLossDB: 0, calibrationDB: 0,
  },
};

function numberInput(value) {
  return value === "" || value === null || value === undefined ? "" : value;
}

function updateGroup(setOptions, group, key, value) {
  setOptions((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
}

function statusTone(status) {
  if (status === "applicable_reference") return "valid";
  if (status === "qualified_reference") return "warning";
  return "invalid";
}

export default function SpecularReflectionReferencePanel({ analysis, isAnalyzing, onActivityChange, onRun }) {
  const [options, setOptions] = useState(INITIAL_OPTIONS);
  const update = (key, value) => {
    onActivityChange?.();
    setOptions((current) => ({ ...current, [key]: value }));
  };
  const updateNested = (group, key, value) => {
    onActivityChange?.();
    updateGroup(setOptions, group, key, value);
  };
  const updateNumber = (group, key) => (event) => updateNested(group, key, event.target.value === "" ? "" : Number(event.target.value));
  const updateTopNumber = (key) => (event) => update(key, event.target.value === "" ? "" : Number(event.target.value));

  return (
    <section className="specular-reflection-panel" aria-label="Specular reflection reference">
      <header className="specular-reflection-heading">
        <div className="panel-title"><Waves size={16} /><span>Specular Reflection Reference</span><ResearchReferenceBadge /></div>
        <span className="specular-reference-chip">Opt-in diagnostic</span>
      </header>
      <p className="specular-reference-subtitle">Isolated one-bounce reference — not used by network simulation.</p>
      <div className="specular-reference-identity">
        <code>single_bounce_specular_reflection_reference_v1</code>
        <span>reference_only · canonical false · network coupled false</span>
      </div>

      <div className="specular-reference-section">
        <div className="specular-reference-section-title"><span>Geometry in local ENU metres</span><small>Explicit coordinates only</small></div>
        <label className="specular-reference-wide-field"><span>Frequency <small>GHz</small></span><input type="number" min="0.001" max="450" step="0.1" value={numberInput(options.frequencyGHz)} onChange={updateTopNumber("frequencyGHz")} /></label>
        <div className="specular-reference-endpoints">
          <EndpointFields label="Tx" value={options.tx} onChange={updateNumber} />
          <EndpointFields label="Rx" value={options.rx} onChange={updateNumber} />
        </div>
      </div>

      <div className="specular-reference-section">
        <div className="specular-reference-section-title"><span>Finite vertical facade</span><small>One horizontal segment</small></div>
        <div className="specular-reference-grid four-up">
          <NumberField label="Start X" value={options.facade.startX} onChange={updateNumber("facade", "startX")} />
          <NumberField label="Start Y" value={options.facade.startY} onChange={updateNumber("facade", "startY")} />
          <NumberField label="End X" value={options.facade.endX} onChange={updateNumber("facade", "endX")} />
          <NumberField label="End Y" value={options.facade.endY} onChange={updateNumber("facade", "endY")} />
          <NumberField label="Plane X" value={options.facade.planeX} onChange={updateNumber("facade", "planeX")} />
          <NumberField label="Plane Y" value={options.facade.planeY} onChange={updateNumber("facade", "planeY")} />
          <NumberField label="Base Z" value={options.facade.baseZ} onChange={updateNumber("facade", "baseZ")} />
          <NumberField label="Top Z" value={options.facade.topZ} onChange={updateNumber("facade", "topZ")} />
        </div>
        <div className="specular-reference-grid three-up">
          <NumberField label="Normal X" value={options.facade.normalX} onChange={updateNumber("facade", "normalX")} />
          <NumberField label="Normal Y" value={options.facade.normalY} onChange={updateNumber("facade", "normalY")} />
          <NumberField label="Normal Z" value={options.facade.normalZ} onChange={updateNumber("facade", "normalZ")} />
        </div>
        <p className="specular-reference-hint">The outward normal is declared, not inferred from a building label. Missing top height makes the candidate unavailable.</p>
      </div>

      <div className="specular-reference-section">
        <div className="specular-reference-section-title"><span>Interface and polarization</span><small>P.2040 coefficient</small></div>
        <div className="specular-reference-toggle-row" role="group" aria-label="Reflection mode">
          <button type="button" className={options.material.mode === "interface" ? "active" : ""} onClick={() => updateNested("material", "mode", "interface")}>Interface<small>Semi-infinite</small></button>
          <button type="button" className={options.material.mode === "finite_slab" ? "active" : ""} onClick={() => updateNested("material", "mode", "finite_slab")}>Finite slab<small>Coherent total</small></button>
        </div>
        <div className="specular-reference-grid three-up">
          <label><span>Material source</span><select value={options.material.materialSource} onChange={(event) => updateNested("material", "materialSource", event.target.value)}><option value="user_defined">User-defined ε/σ</option><option value="p2040_reference">P.2040 Table 3</option></select></label>
          <label><span>Polarization</span><select value={options.polarization} onChange={(event) => update("polarization", event.target.value)}><option value="TE">TE · s basis</option><option value="TM">TM · p basis</option></select></label>
          {options.material.materialSource === "p2040_reference" ? (
            <label><span>P.2040 material</span><select value={options.material.materialID} onChange={(event) => updateNested("material", "materialID", event.target.value)}><option value="concrete_110_330">Concrete · 110–330 GHz</option><option value="brick_110_330">Brick · 110–330 GHz</option><option value="glass_100_400">Glass · 100–400 GHz</option><option value="wood_110_330">Wood · 110–330 GHz</option></select></label>
          ) : <NumberField label="Relative εr" value={options.material.relativePermittivity} onChange={updateNumber("material", "relativePermittivity")} />}
        </div>
        {options.material.materialSource === "user_defined" ? <div className="specular-reference-grid three-up"><NumberField label="Conductivity σ <small>S/m</small>" value={options.material.conductivitySPerM} onChange={updateNumber("material", "conductivitySPerM")} /><label><span>Property provenance</span><select value={options.material.propertySource} onChange={(event) => updateNested("material", "propertySource", event.target.value)}><option value="user_declared">User-declared</option><option value="measured">Measured</option><option value="manufacturer">Manufacturer</option></select></label></div> : null}
        {options.material.mode === "finite_slab" ? <div className="specular-reference-grid three-up"><NumberField label="Thickness <small>m</small>" value={options.material.thicknessM} onChange={updateNumber("material", "thicknessM")} /></div> : null}
        {options.material.mode === "finite_slab" ? <p className="specular-reference-hint">Finite-slab mode requires an explicit thickness, exit medium, and coherent phase interpretation; it is never selected automatically.</p> : null}
        <p className="specular-reference-hint">Incident and exit media are explicit air references in the controlled form (εr 1, σ 0, user-declared); the API preserves both declarations.</p>
      </div>

      <details className="specular-reference-details">
        <summary>Evidence and link-budget assumptions</summary>
        <div className="specular-reference-grid three-up">
          <label><span>Terrain / datum</span><select value={options.terrainMode} onChange={(event) => update("terrainMode", event.target.value)}><option value="flat_ground_relative_datum">Flat ground · declared datum</option><option value="surveyed_or_dataset_terrain">Surveyed / dataset terrain</option></select></label>
          <NumberField label="RMS roughness <small>m · optional</small>" value={options.rmsRoughnessM} onChange={updateTopNumber("rmsRoughnessM")} />
          <NumberField label="Conducted Tx <small>dBm</small>" value={options.linkBudget.ptConductedDbm} onChange={updateNumber("linkBudget", "ptConductedDbm")} />
          <NumberField label="Tx gain <small>dBi</small>" value={options.tx.gainDBi} onChange={updateNumber("tx", "gainDBi")} />
          <NumberField label="Rx gain <small>dBi</small>" value={options.rx.gainDBi} onChange={updateNumber("rx", "gainDBi")} />
          <NumberField label="System loss <small>dB</small>" value={options.linkBudget.systemLossDB} onChange={updateNumber("linkBudget", "systemLossDB")} />
          <NumberField label="Polarization loss <small>dB</small>" value={options.linkBudget.polarizationLossDB} onChange={updateNumber("linkBudget", "polarizationLossDB")} />
          <NumberField label="Calibration <small>dB</small>" value={options.linkBudget.calibrationDB} onChange={updateNumber("linkBudget", "calibrationDB")} />
        </div>
        <p className="specular-reference-hint">Aperture is intentionally not inferred from gain. Unknown roughness and far-field evidence qualify the result; diffuse power is not invented.</p>
      </details>

      <button type="button" className="specular-reference-run" disabled={isAnalyzing} onClick={() => onRun?.(options)}><PlayCircle size={15} />{isAnalyzing ? "Evaluating reference…" : "Evaluate reflected path"}</button>
      {analysis ? <SpecularReflectionResult analysis={analysis} /> : <p className="specular-reference-empty"><CircleHelp size={15} />Start with the controlled 140 GHz fixture, then change one declared assumption at a time.</p>}
    </section>
  );
}

function EndpointFields({ label, value, onChange }) {
  return <div className="specular-reference-endpoint"><strong>{label}</strong><div className="specular-reference-grid three-up"><NumberField label="X" value={value.x} onChange={onChange(label === "Tx" ? "tx" : "rx", "x")} /><NumberField label="Y" value={value.y} onChange={onChange(label === "Tx" ? "tx" : "rx", "y")} /><NumberField label="Z" value={value.z} onChange={onChange(label === "Tx" ? "tx" : "rx", "z")} /></div></div>;
}

function NumberField({ label, value, onChange }) {
  return <label><span dangerouslySetInnerHTML={{ __html: label }} /><input type="number" step="any" value={numberInput(value)} onChange={onChange} /></label>;
}

function SpecularReflectionResult({ analysis }) {
  const applicability = analysis.applicability ?? {};
  const geometry = analysis.geometry ?? {};
  const material = analysis.material ?? {};
  const coefficient = material.reflection_coefficient ?? {};
  const power = analysis.link_budget?.reflected_path_reference_power_dbm;
  const tone = statusTone(analysis.status);
  const reasons = [...(applicability.reasons ?? []), ...(applicability.qualifications ?? [])];
  return (
    <section className="specular-reference-result" aria-live="polite">
      <div className={`specular-reference-result-status ${tone}`}><span>{tone === "valid" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><strong>{analysis.status ?? "unknown"}</strong><small>{analysis.readiness ?? "reference_only"}</small></div>
      <div className="specular-reference-summary"><span><small>Reflection point</small><strong>{formatPoint(geometry.reflection_point_enu)}</strong></span><span><small>Reference power</small><strong>{power === null || power === undefined ? "Unavailable" : `${formatNumber(power, 2)} dBm`}</strong></span></div>
      <div className="specular-reference-ledger" role="table" aria-label="Reflected path diagnostic ledger">
        <Metric label="d1" value={`${formatNumber(geometry.d1_m, 3)} m`} /><Metric label="d2" value={`${formatNumber(geometry.d2_m, 3)} m`} /><Metric label="L=d1+d2" value={`${formatNumber(geometry.total_reflected_path_length_m, 3)} m`} /><Metric label="Incidence" value={`${formatNumber(geometry.incidence_angle_deg, 2)}°`} /><Metric label="Reflection" value={`${formatNumber(geometry.reflection_angle_deg, 2)}°`} /><Metric label="FSPL(L)" value={`${formatNumber(analysis.spreading?.fspl_reflected_path_db, 3)} dB`} /><Metric label="Γ" value={formatComplex(coefficient)} /><Metric label="|Γ|²" value={formatNumber(coefficient.power_fraction, 6)} />
      </div>
      <div className="specular-reference-directions"><span><small>Tx departure</small><strong>{formatDirection(analysis.antennas?.tx, "departure")}</strong></span><span><small>Rx look / arrival</small><strong>{formatDirection(analysis.antennas?.rx, "arrival")}</strong></span></div>
      {reasons.length > 0 ? <div className="specular-reference-warnings"><strong>Evidence and gates</strong>{reasons.map((reason) => <span key={reason}><AlertTriangle size={13} />{reason}</span>)}</div> : null}
      <details className="specular-reference-details"><summary>Inspect assumptions, visibility, and fingerprint</summary><p className="data-note">Leg 1: {analysis.visibility?.leg1_visibility?.status ?? "unknown"} · Leg 2: {analysis.visibility?.leg2_visibility?.status ?? "unknown"} · diffuse modelled: {analysis.diffuse_scattering_modelled ? "yes" : "no"}</p><p className="data-note">{(analysis.assumptions ?? []).join(" · ")}</p><p className="data-note">Fingerprint <code>{analysis.fingerprint ?? "—"}</code></p></details>
    </section>
  );
}

function Metric({ label, value }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function formatPoint(point) {
  if (!point) return "Unavailable";
  return `(${formatNumber(point.x, 2)}, ${formatNumber(point.y, 2)}, ${formatNumber(point.z, 2)})`;
}

function formatDirection(antenna, kind) {
  if (!antenna) return "Unavailable";
  const azimuth = kind === "departure" ? antenna.departure_azimuth_deg : antenna.arrival_look_azimuth_deg;
  const elevation = kind === "departure" ? antenna.departure_elevation_deg : antenna.arrival_look_elevation_deg;
  return `${formatNumber(azimuth, 1)}° az · ${formatNumber(elevation, 1)}° el`;
}

function formatComplex(value) {
  if (!value || !Number.isFinite(Number(value.real))) return "Unavailable";
  return `${formatNumber(value.real, 4)} ${Number(value.imaginary) >= 0 ? "+" : "−"} j${formatNumber(Math.abs(Number(value.imaginary)), 4)}`;
}
