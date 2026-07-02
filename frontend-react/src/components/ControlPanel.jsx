import { Compass, Eraser, Gauge, MousePointer2, Radar, Sparkles, SlidersHorizontal, Zap } from "lucide-react";
import { NETWORK_TECH_OPTIONS } from "../utils/networkTech.js";

export default function ControlPanel({
  settings,
  onChange,
  onRun,
  onCancelAreaSelection,
  onClearNetworkSelection,
  onDrawArea,
  onFinishAreaSelection,
  onOptimizeAzimuth,
  onOptimizeNetwork,
  onPlanningModeChange,
  isLoading,
  isDrawingSelection,
  isOptimizing,
  networkSelectionCount,
  planningMode,
  selectionCanFinish,
  selectionNotice,
}) {
  const update = (key, value) => {
    onChange((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <section className="control-panel" aria-label="Simulation controls">
      <div className="control-section">
        <div className="section-heading">
          <Radar size={16} />
          <span>Radio</span>
        </div>
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
          <label>Network Tech (Frequency)</label>
          <div className="segmented-control">
            {NETWORK_TECH_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={settings.frequencyGHz === option.frequencyGHz ? "active" : ""}
                onClick={() => update("frequencyGHz", option.frequencyGHz)}
              >
                <span>{option.label}</span>
                <small>{option.frequencyGHz} GHz</small>
              </button>
            ))}
          </div>
        </div>
        <NumberField
          icon={<Zap size={18} />}
          label="Tx power"
          suffix="dBm"
          min={0}
          max={60}
          step={1}
          value={settings.txPowerDbm}
          onChange={(value) => update("txPowerDbm", value)}
        />
        {planningMode === "network" ? (
          <div className="network-selection-tools">
            <div className="selection-toolbar">
              <button
                type="button"
                className={isDrawingSelection ? "active" : ""}
                onClick={onDrawArea}
                disabled={isLoading || isOptimizing}
              >
                <MousePointer2 size={15} />
                <span>Draw area</span>
              </button>
              {isDrawingSelection ? (
                <>
                  <button
                    type="button"
                    onClick={onFinishAreaSelection}
                    disabled={!selectionCanFinish || isLoading || isOptimizing}
                  >
                    <span>Finish area</span>
                  </button>
                  <button type="button" onClick={onCancelAreaSelection}>
                    <span>Cancel</span>
                  </button>
                </>
              ) : (
                <button type="button" onClick={onClearNetworkSelection}>
                  <Eraser size={15} />
                  <span>Clear cluster</span>
                </button>
              )}
              <span className="selection-count">{networkSelectionCount} / 6 selected</span>
            </div>
            {selectionNotice ? <p className="selection-note">{selectionNotice}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="control-section">
        <div className="section-heading">
          <SlidersHorizontal size={16} />
          <span>Beam</span>
        </div>
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
      </div>

      <div className="control-actions">
        <button type="button" className="apply-small" onClick={onRun} disabled={isLoading || isOptimizing}>
          {isLoading ? "Simulating..." : "Apply"}
        </button>
        <button
          type="button"
          className="optimize-button"
          onClick={onOptimizeAzimuth}
          disabled={isLoading || isOptimizing}
        >
          <Sparkles size={16} className={isOptimizing ? "spin" : ""} />
          <span>{isOptimizing ? "Optimizing..." : "Auto-Optimize"}</span>
        </button>
        {planningMode === "network" ? (
          <button
            type="button"
            className="optimize-button network"
            onClick={onOptimizeNetwork}
            disabled={isLoading || isOptimizing || networkSelectionCount < 2}
          >
            <Sparkles size={16} className={isOptimizing ? "spin" : ""} />
            <span>{isOptimizing ? "Optimizing..." : "Optimize Network"}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function NumberField({ icon, label, suffix, min, max, step, value, onChange }) {
  return (
    <label className="input-row">
      <span className="input-label">
        {icon}
        {label}
      </span>
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
      <span className="input-label">
        {icon}
        {label}
      </span>
      <span className="range-value">
        {value}
        {suffix ? ` ${suffix}` : ""}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
