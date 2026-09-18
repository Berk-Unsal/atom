import { useMemo, useState } from "react";
import { BookOpen, FlaskConical, PlayCircle } from "lucide-react";
import { formatNumber } from "../utils/appWorkspace.js";

const PRESETS = [
	["concrete_1_100", "Concrete · 1–100 GHz"],
  ["concrete_110_330", "Concrete · 110–330 GHz"],
	["brick_1_40", "Brick · 1–40 GHz"],
  ["brick_110_330", "Brick · 110–330 GHz"],
	["plasterboard_1_100", "Plasterboard · 1–100 GHz"],
	["plasterboard_110_330", "Plasterboard · 110–330 GHz"],
  ["plasterboard_100_400", "Plasterboard · 100–400 GHz"],
	["wood_0p001_100", "Wood · 0.001–100 GHz"],
  ["wood_110_330", "Wood · 110–330 GHz"],
	["wood_100_400", "Wood · 100–400 GHz"],
	["glass_0p1_100", "Glass · 0.1–100 GHz"],
	["glass_220_450", "Glass · 220–450 GHz"],
  ["glass_100_400", "Glass · 100–400 GHz"],
  ["clear_acrylic_110_330", "Clear acrylic · 110–330 GHz"],
	["ceiling_board_1_100", "Ceiling board · 1–100 GHz"],
	["ceiling_board_220_450", "Ceiling board · 220–450 GHz"],
  ["ceiling_board_100_400", "Ceiling board · 100–400 GHz"],
	["chipboard_1_100", "Chipboard · 1–100 GHz"],
  ["chipboard_100_200", "Chipboard · 100–200 GHz"],
	["plywood_1_40", "Plywood · 1–40 GHz"],
	["plywood_110_330", "Plywood · 110–330 GHz"],
  ["plywood_100_400", "Plywood · 100–400 GHz"],
];

const DEFAULT_OPTIONS = {
  frequencyGHz: 140,
  materialSource: "p2040_reference",
  materialID: "glass_100_400",
  thicknessM: 0.01,
  thicknessProvenance: "user_declared",
  incidenceAngleDeg: 0,
  polarization: "TE",
  userName: "User-declared slab",
  userPropertySource: "user_declared",
  userRelativePermittivity: 4,
  userConductivity: 0.15,
  userLossTangent: 0.03,
  userPropertyForm: "conductivity",
  userMinFrequency: 100,
  userMaxFrequency: 200,
};

const AIR_MEDIUM = {
  name: "air",
  relative_permittivity: 1,
  conductivity_s_per_m: 0,
  property_source: "user_declared",
};

export default function MaterialReferencePanel({ analysis, isAnalyzing, onRun }) {
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [message, setMessage] = useState("");
  const update = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  const canRun = !isAnalyzing;
  const inputValue = (key) => (Number.isFinite(Number(options[key])) ? options[key] : "");

  const request = useMemo(() => {
    const next = {
      schema_version: 1,
      frequency_ghz: Number(options.frequencyGHz),
      material_source: options.materialSource,
      thickness_m: Number(options.thicknessM),
      thickness_provenance: options.thicknessProvenance,
      incidence_angle_deg: Number(options.incidenceAngleDeg),
      polarization: options.polarization,
      incident_medium: AIR_MEDIUM,
      exit_medium: AIR_MEDIUM,
    };
    if (options.materialSource === "p2040_reference") {
      next.material_id = options.materialID;
    } else {
      next.user_material = {
        name: options.userName,
        property_source: options.userPropertySource,
        frequency_range_ghz: [Number(options.userMinFrequency), Number(options.userMaxFrequency)],
        relative_permittivity: Number(options.userRelativePermittivity),
        ...(options.userPropertyForm === "loss_tangent"
          ? { loss_tangent: Number(options.userLossTangent) }
          : { conductivity_s_per_m: Number(options.userConductivity) }),
      };
    }
    return next;
  }, [options]);

  const run = () => {
    const numericValues = [options.frequencyGHz, options.thicknessM, options.incidenceAngleDeg];
    if (numericValues.some((value) => !Number.isFinite(Number(value)))) {
      setMessage("Frequency, thickness, and incidence angle must be finite numbers.");
      return;
    }
    if (Number(options.thicknessM) < 0 || Number(options.incidenceAngleDeg) >= 90 || Number(options.incidenceAngleDeg) < 0) {
      setMessage("Use a non-negative thickness and an incidence angle from 0° up to, but not including, 90°.");
      return;
    }
    if (options.materialSource === "user_defined" && (!options.userName.trim() || Number(options.userRelativePermittivity) <= 0)) {
      setMessage("User-defined materials need a name and positive relative permittivity.");
      return;
    }
    setMessage("");
    onRun?.(request);
  };

  return (
    <section className="material-reference-panel" aria-label="Material and facade interaction reference">
      <header className="panel-title"><FlaskConical size={16} /><span>Material & facade reference</span><span className="panel-title-badge">4I.4 · isolated</span></header>
      <p className="material-reference-callout"><strong>Material reference only — not used by network simulation.</strong> This is a declared homogeneous slab ledger for P.2040-4 comparison. It does not estimate whole-building entry loss, indoor coverage, or an urban reflected path.</p>

      <div className="material-reference-status">
        <span><strong>Model</strong><code>p2040_material_slab_reference_v1</code></span>
        <span><strong>Reference</strong><span>ITU-R P.2040-4 · Table 3</span></span>
      </div>

      <div className="material-reference-options">
        <label><span>Frequency <small>GHz</small></span><input aria-label="Material reference frequency" type="number" min="0.001" max="450" step="1" value={inputValue("frequencyGHz")} onChange={(event) => update("frequencyGHz", Number(event.target.value))} /></label>
        <label><span>Material source</span><select aria-label="Material source" value={options.materialSource} onChange={(event) => update("materialSource", event.target.value)}><option value="p2040_reference">P.2040 Table 3 row</option><option value="user_defined">User-defined assumption</option></select></label>
        {options.materialSource === "p2040_reference" ? (
          <label><span>Material row</span><select aria-label="P.2040 material row" value={options.materialID} onChange={(event) => update("materialID", event.target.value)}>{PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        ) : (
          <label><span>Material name</span><input aria-label="User material name" value={options.userName} onChange={(event) => update("userName", event.target.value)} /></label>
        )}
        <label><span>Thickness <small>m</small></span><input aria-label="Slab thickness" type="number" min="0" max="1000" step="0.001" value={inputValue("thicknessM")} onChange={(event) => update("thicknessM", Number(event.target.value))} /></label>
        <label><span>Thickness provenance</span><select aria-label="Thickness provenance" value={options.thicknessProvenance} onChange={(event) => update("thicknessProvenance", event.target.value)}><option value="user_declared">User declared</option><option value="controlled_reference_fixture">Controlled fixture</option></select></label>
        <label><span>Incidence angle <small>deg from normal</small></span><input aria-label="Incidence angle" type="number" min="0" max="89.999" step="1" value={inputValue("incidenceAngleDeg")} onChange={(event) => update("incidenceAngleDeg", Number(event.target.value))} /></label>
        <label><span>Polarization</span><select aria-label="Slab polarization" value={options.polarization} onChange={(event) => update("polarization", event.target.value)}><option value="TE">TE · electric field ⟂ incidence plane</option><option value="TM">TM · electric field ∥ incidence plane</option></select></label>
      </div>

      {options.materialSource === "user_defined" ? (
        <div className="material-reference-user-options">
          <div className="material-reference-section-label">User property contract</div>
          <div className="material-reference-options">
            <label><span>Property provenance</span><select aria-label="User property provenance" value={options.userPropertySource} onChange={(event) => update("userPropertySource", event.target.value)}><option value="user_declared">User declared</option><option value="measured">Measured</option><option value="manufacturer">Manufacturer</option><option value="inferred">Inferred</option><option value="unknown">Unknown</option></select></label>
            <label><span>Relative permittivity <small>εr′</small></span><input aria-label="User relative permittivity" type="number" min="0.000001" step="0.01" value={inputValue("userRelativePermittivity")} onChange={(event) => update("userRelativePermittivity", Number(event.target.value))} /></label>
            <label><span>Loss form</span><select aria-label="User loss form" value={options.userPropertyForm} onChange={(event) => update("userPropertyForm", event.target.value)}><option value="conductivity">Conductivity · S/m</option><option value="loss_tangent">Loss tangent · tanδ</option></select></label>
            {options.userPropertyForm === "loss_tangent" ? <label><span>Loss tangent <small>tanδ</small></span><input aria-label="User loss tangent" type="number" min="0" step="0.001" value={inputValue("userLossTangent")} onChange={(event) => update("userLossTangent", Number(event.target.value))} /></label> : <label><span>Conductivity <small>S/m</small></span><input aria-label="User conductivity" type="number" min="0" step="0.01" value={inputValue("userConductivity")} onChange={(event) => update("userConductivity", Number(event.target.value))} /></label>}
            <label><span>Valid from <small>GHz</small></span><input aria-label="User minimum frequency" type="number" min="0.001" max="450" value={inputValue("userMinFrequency")} onChange={(event) => update("userMinFrequency", Number(event.target.value))} /></label>
            <label><span>Valid to <small>GHz</small></span><input aria-label="User maximum frequency" type="number" min="0.001" max="450" value={inputValue("userMaxFrequency")} onChange={(event) => update("userMaxFrequency", Number(event.target.value))} /></label>
          </div>
          <p className="data-note">The request sends exactly one electrical-property form. The evaluator derives the other ledger values with P.2040 equations and labels this branch user_assumption.</p>
        </div>
      ) : null}

      <p className="material-reference-geometry-note"><BookOpen size={14} /><span>Angle is user-declared in this panel. Reliable facade-normal and ray-intersection integration is intentionally deferred; no OSM material physics is inferred.</span></p>
      {message ? <p className="inventory-validation">{message}</p> : null}
      <button type="button" className="path-analyze-button" disabled={!canRun} onClick={run}><PlayCircle size={15} />{isAnalyzing ? "Evaluating slab reference…" : "Run material reference"}</button>
      {analysis ? <MaterialReferenceResult analysis={analysis} /> : <p className="path-empty-state">Run one declared slab to inspect complex coefficients, power fractions, internal reflections, and the separate 80 dB comparison.</p>}
    </section>
  );
}

function MaterialReferenceResult({ analysis }) {
  const material = analysis.material ?? {};
  const geometry = analysis.geometry ?? {};
  const ledger = analysis.ledger;
  const comparison = analysis.comparison ?? {};
  const applicability = analysis.applicability ?? {};
  const comparisonSlabLoss = comparison.slab_transmission_loss_db ?? comparison.slab_lower_bound_transmission_loss_db;
  const formatComplex = (value) => value ? String(formatNumber(value.real, 4)) + (value.imaginary >= 0 ? " + j" : " − j") + formatNumber(Math.abs(value.imaginary), 4) : "—";
  const formatRange = (value) => Array.isArray(value) ? formatNumber(value[0], 3) + "–" + formatNumber(value[1], 3) + " GHz" : "—";
  return (
    <section className="material-reference-result" aria-live="polite">
      <div className="material-reference-summary">
        <span><small>Status</small><strong>{analysis.status ?? "unknown"}</strong></span>
        <span><small>Readiness</small><strong>{analysis.readiness ?? "reference_only"}</strong></span>
        <span><small>Material</small><strong>{material.name ?? "—"}</strong></span>
        <span><small>Slab loss</small><strong>{formatNumber(ledger?.transmission_loss_db ?? ledger?.lower_bound_transmission_loss_db, 3)} dB{ledger?.lower_bound_transmission_loss_db !== undefined && ledger?.transmission_loss_db === undefined ? " lower bound" : ""}</strong></span>
      </div>
      <p className={"material-reference-applicability " + (analysis.status === "applicable" ? "valid" : "warning")}><strong>{applicability.status ?? analysis.status}</strong> · {applicability.reasons?.join(" ") ?? "P.2040 row and declared slab inputs accepted."}</p>

      <div className="material-reference-ledger-grid">
        <div><small>Property source</small><strong>{material.property_source ?? "—"}</strong></div>
        <div><small>Applicability range</small><strong>{formatRange(material.frequency_range_ghz)}</strong></div>
        <div><small>εr′</small><strong>{formatNumber(material.relative_permittivity, 5)}</strong></div>
        <div><small>σ</small><strong>{formatNumber(material.conductivity_s_per_m, 5)} S/m</strong></div>
        <div><small>tanδ</small><strong>{formatNumber(material.loss_tangent, 5)}</strong></div>
        <div><small>Thickness</small><strong>{formatNumber(material.thickness_m, 4)} m · {material.thickness_provenance ?? "—"}</strong></div>
        <div><small>Complex εr</small><code>{formatComplex(material.complex_relative_permittivity)}</code></div>
        <div><small>Geometry</small><strong>{formatNumber(geometry.frequency_ghz, 1)} GHz · {formatNumber(geometry.incidence_angle_deg, 1)}° · {geometry.polarization ?? "—"}</strong></div>
      </div>

      {ledger ? (
        <>
          <div className="material-reference-power-ledger" role="table" aria-label="Material slab power ledger">
            <div role="row"><span role="cell">Reflection coefficient R</span><strong role="cell">{formatComplex(ledger.reflection_coefficient)}</strong></div>
            <div role="row"><span role="cell">Transmission coefficient T</span><strong role="cell">{formatComplex(ledger.transmission_coefficient)}</strong></div>
            <div role="row"><span role="cell">Reflected power</span><strong role="cell">{formatNumber(ledger.reflected_power_fraction, 6)}</strong></div>
            <div role="row"><span role="cell">Transmitted power</span><strong role="cell">{formatNumber(ledger.transmitted_power_fraction, 6)}</strong></div>
            <div role="row"><span role="cell">Absorbed power</span><strong role="cell">{formatNumber(ledger.absorbed_power_fraction, 6)}</strong></div>
            <div role="row"><span role="cell">First-interface reflection</span><strong role="cell">{formatNumber(ledger.interface_reflection_power_fraction, 6)}</strong></div>
          </div>
          <p className="material-reference-boundary">Multiple internal reflections: {ledger.multiple_internal_reflections_included ? "included" : "not included"}. Power fields are distinct from complex field coefficients; no reflected/absorbed terms are added to network loss.</p>
        </>
      ) : null}

      <div className="material-reference-comparison" aria-label="Separate heuristic comparison">
        <div><small>Historical research_sub_thz heuristic</small><strong>{formatNumber(comparison.historical_research_heuristic_db, 1)} dB/event</strong></div>
        <div><small>Declared slab transmission</small><strong>{formatNumber(comparisonSlabLoss, 3)} dB{comparison.slab_lower_bound_transmission_loss_db !== undefined && comparison.slab_transmission_loss_db === undefined ? " lower bound" : ""}</strong></div>
        <div><small>Combined</small><strong>{comparison.combined ? "Yes" : "No — side by side"}</strong></div>
      </div>

      <details className="material-reference-audit-details">
        <summary>Inspect provenance, assumptions, limitations, and fingerprint</summary>
        <div className="material-reference-audit-grid"><span><small>Model</small><code>{analysis.model_id ?? "—"}</code></span><span><small>Revision</small><strong>{analysis.reference?.revision ?? "—"}</strong></span><span><small>Fingerprint</small><code>{analysis.fingerprint ?? "—"}</code></span><span><small>Media</small><strong>{analysis.media?.incident?.name ?? "—"} → {analysis.media?.exit?.name ?? "—"}</strong></span></div>
        <p className="data-note">{(analysis.assumptions ?? []).join(" · ")}</p>
        <p className="data-note">{(analysis.limitations ?? []).join(" · ")}</p>
      </details>
    </section>
  );
}
