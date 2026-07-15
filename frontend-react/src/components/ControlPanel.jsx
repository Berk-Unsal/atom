import { Activity, Compass, Gauge, Sparkles, SlidersHorizontal, Zap } from "lucide-react";
import { NETWORK_TECH_OPTIONS } from "../utils/networkTech.js";

export default function ControlPanel({
  activeTool,
  settings,
  onChange,
  onOptimizeAzimuth,
  onOptimizeNetwork,
  onAnalyzeInterference,
  onPlanningModeChange,
  isLoading,
  isOptimizing,
  isAnalyzingInterference,
  interferenceApplicable,
  networkSelectionCount,
  planningMode,
  selectionNotice,
}) {
  const update = (key, value) => {
    onChange((current) => ({ ...current, [key]: value }));
  };

  const updateNetworkTech = (option) => {
    onChange((current) => ({
      ...current,
      frequencyGHz: option.frequencyGHz,
      interferenceBandwidthMHz:
        option.frequencyGHz === 2.6 ? 20 : option.frequencyGHz === 28 ? 100 : current.interferenceBandwidthMHz,
    }));
  };

  const bandwidthOptions = settings.frequencyGHz === 2.6 ? [1.4, 3, 5, 10, 15, 20] : [50, 100, 200, 400];

  if (activeTool === "setup") {
    return (
      <section className="control-panel focused-control-panel" aria-label="Plan setup controls">
        <div className="field-group">
          <label>Planning mode</label>
          <div className="segmented-control two-up">
            <button
              type="button"
              className={planningMode === "single" ? "active" : ""}
              onClick={() => onPlanningModeChange("single")}
            >
              <span>Single</span>
              <small>one sector</small>
            </button>
            <button
              type="button"
              className={planningMode === "network" ? "active" : ""}
              onClick={() => onPlanningModeChange("network")}
            >
              <span>Network</span>
              <small>{networkSelectionCount} selected</small>
            </button>
          </div>
        </div>

        <div className="field-group">
          <label>Network technology</label>
          <div className="segmented-control">
            {NETWORK_TECH_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={settings.frequencyGHz === option.frequencyGHz ? "active" : ""}
                onClick={() => updateNetworkTech(option)}
              >
                <span>{option.label}</span>
                <small>{option.frequencyGHz} GHz</small>
              </button>
            ))}
          </div>
        </div>

        <NumberField
          icon={<Zap size={18} />}
          label="Transmit power"
          suffix="dBm"
          min={0}
          max={60}
          step={1}
          value={settings.txPowerDbm}
          onChange={(value) => update("txPowerDbm", value)}
        />

        {planningMode === "network" ? (
          <div className="network-selection-tools">
            <div className="selection-summary-row">
              <span>Selected cluster</span>
              <strong>{networkSelectionCount} / 6 cells</strong>
            </div>
            {selectionNotice ? <p className="selection-note">{selectionNotice}</p> : null}
            <p className="selection-note">Select cells directly on the map or use the area tool.</p>
          </div>
        ) : null}
      </section>
    );
  }

  if (activeTool === "propagation") {
    return (
      <section className="control-panel focused-control-panel" aria-label="Propagation controls">
        <RangeField
          icon={<Gauge size={18} />}
          label="Ray count"
          suffix=""
          min={24}
          max={360}
          step={12}
          value={settings.rayCount}
          onChange={(value) => update("rayCount", value)}
        />
        <RangeField
          icon={<SlidersHorizontal size={18} />}
          label="Radius"
          suffix="m"
          min={100}
          max={1500}
          step={50}
          value={settings.radiusMeters}
          onChange={(value) => update("radiusMeters", value)}
        />
        <RangeField
          icon={<Compass size={18} />}
          label="Azimuth"
          suffix="deg"
          min={0}
          max={360}
          step={1}
          value={settings.azimuthDeg}
          onChange={(value) => update("azimuthDeg", value)}
        />
        <RangeField
          icon={<SlidersHorizontal size={18} />}
          label="Beam width"
          suffix="deg"
          min={10}
          max={360}
          step={10}
          value={settings.beamWidthDeg}
          onChange={(value) => update("beamWidthDeg", value)}
        />

        <div className="control-actions focused-tool-actions">
          {planningMode === "single" ? (
            <button
              type="button"
              className="optimize-button"
              onClick={onOptimizeAzimuth}
              disabled={isLoading || isOptimizing || isAnalyzingInterference}
            >
              <Sparkles size={16} className={isOptimizing ? "spin" : ""} />
              <span>{isOptimizing ? "Optimizing..." : "Auto-Optimize Sector"}</span>
            </button>
          ) : (
            <button
              type="button"
              className="optimize-button network"
              onClick={onOptimizeNetwork}
              disabled={isLoading || isOptimizing || isAnalyzingInterference || networkSelectionCount < 2}
            >
              <Sparkles size={16} className={isOptimizing ? "spin" : ""} />
              <span>{isOptimizing ? "Optimizing..." : "Optimize Network"}</span>
            </button>
          )}
          {planningMode === "network" && networkSelectionCount < 2 ? (
            <p className="selection-note">Select at least two cells before optimization.</p>
          ) : null}
        </div>
      </section>
    );
  }

  if (activeTool === "interference") {
    return (
      <section className={`control-panel focused-control-panel interference-control ${interferenceApplicable ? "" : "not-applicable"}`} aria-label="Interference controls">
        {interferenceApplicable ? (
          <>
            <label className="input-row select-row">
              <span className="input-label">Bandwidth</span>
              <span className="number-wrap">
                <select
                  value={settings.interferenceBandwidthMHz}
                  onChange={(event) => update("interferenceBandwidthMHz", Number(event.target.value))}
                >
                  {bandwidthOptions.map((bandwidth) => (
                    <option key={bandwidth} value={bandwidth}>{bandwidth} MHz</option>
                  ))}
                </select>
              </span>
            </label>
            <RangeField
              icon={<Gauge size={18} />}
              label="Cell load"
              suffix="%"
              min={10}
              max={100}
              step={5}
              value={settings.cellLoadPct}
              onChange={(value) => update("cellLoadPct", value)}
            />
            <div className="field-group compact-field">
              <label>Frequency reuse</label>
              <div className="segmented-control two-option">
                {[1, 3].map((reuseFactor) => (
                  <button
                    key={reuseFactor}
                    type="button"
                    className={settings.reuseFactor === reuseFactor ? "active" : ""}
                    onClick={() => update("reuseFactor", reuseFactor)}
                  >
                    <span>Reuse {reuseFactor}</span>
                    <small>{reuseFactor === 1 ? "co-channel" : "3 channels"}</small>
                  </button>
                ))}
              </div>
            </div>
            <details className="advanced-settings">
              <summary>Advanced assumptions</summary>
              <NumberField
                icon={<Activity size={18} />}
                label="Noise figure"
                suffix="dB"
                min={0}
                max={20}
                step={0.5}
                value={settings.noiseFigureDb}
                onChange={(value) => update("noiseFigureDb", value)}
              />
              <NumberField
                icon={<SlidersHorizontal size={18} />}
                label="Grid spacing"
                suffix="m"
                min={20}
                max={200}
                step={10}
                value={settings.sampleSpacingMeters}
                onChange={(value) => update("sampleSpacingMeters", value)}
              />
            </details>
            <div className="control-actions focused-tool-actions">
              <button
                type="button"
                className="analyze-button"
                onClick={onAnalyzeInterference}
                disabled={isLoading || isOptimizing || isAnalyzingInterference || networkSelectionCount < 2}
              >
                <Activity size={16} className={isAnalyzingInterference ? "spin" : ""} />
                <span>{isAnalyzingInterference ? "Analyzing..." : "Analyze Interference"}</span>
              </button>
              {networkSelectionCount < 2 ? <p className="selection-note">Requires at least two selected cells.</p> : null}
            </div>
          </>
        ) : (
          <p className="selection-note">Interference analysis is not applicable to the 6G research mode.</p>
        )}
      </section>
    );
  }

  return null;
}

function NumberField({ icon, label, suffix, min, max, step, value, onChange }) {
  return (
    <label className="input-row">
      <span className="input-label">{icon}{label}</span>
      <span className="number-wrap">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <small>{suffix}</small>
      </span>
    </label>
  );
}

function RangeField({ icon, label, suffix, min, max, step, value, onChange }) {
  return (
    <label className="range-row">
      <span className="input-label">{icon}{label}<strong>{value}{suffix ? ` ${suffix}` : ""}</strong></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} ${value}${suffix ? ` ${suffix}` : ""}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
