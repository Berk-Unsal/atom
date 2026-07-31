import { Download, Layers3, PlayCircle } from "lucide-react";

const THRESHOLDS = [-120, -110, -100, -90, -80, -70];

export default function SurfacePanel({ disabled, isLoading, onExport, onOptionsChange, onRun, options, surface }) {
  const toggleThreshold = (threshold) => {
    const current = options.thresholdsDBm ?? [];
    const next = current.includes(threshold) ? current.filter((value) => value !== threshold) : [...current, threshold].sort((a, b) => a - b);
    if (next.length > 0) onOptionsChange({ ...options, thresholdsDBm: next });
  };
  return (
    <section className="surface-panel" aria-label="Analytical coverage surfaces">
      <div className="panel-title"><Layers3 size={16} /><span>Coverage surface</span></div>
      <p className="data-note">Generate a compact regular raster and unsmoothed isolines from the selected cell. The grid uses the current deterministic FSPL, antenna, calibration, and wall model.</p>
      <label className="input-row select-row">
        <span className="input-label">Raster cell size</span>
        <span className="number-wrap"><select value={options.cellSizeMeters} onChange={(event) => onOptionsChange({ ...options, cellSizeMeters: Number(event.target.value) })}>{[10, 25, 50, 100, 250].map((value) => <option key={value} value={value}>{value} m</option>)}</select></span>
      </label>
      <div className="field-group"><label>Contour thresholds</label><div className="surface-thresholds">{THRESHOLDS.map((threshold) => <button key={threshold} type="button" className={options.thresholdsDBm.includes(threshold) ? "active" : ""} aria-pressed={options.thresholdsDBm.includes(threshold)} onClick={() => toggleThreshold(threshold)}>{threshold}</button>)}</div></div>
      <label className="range-row">
        <span className="range-heading"><span>Layer opacity</span><strong>{Math.round(options.opacity * 100)}%</strong></span>
        <input type="range" min="0.1" max="1" step="0.05" value={options.opacity} onChange={(event) => onOptionsChange({ ...options, opacity: Number(event.target.value) })} />
      </label>
      <label className="input-row select-row">
        <span className="input-label">Display floor</span>
        <span className="number-wrap"><select value={options.displayThresholdDBm} onChange={(event) => onOptionsChange({ ...options, displayThresholdDBm: Number(event.target.value) })}>{THRESHOLDS.map((value) => <option key={value} value={value}>{value} dBm</option>)}</select></span>
      </label>
      <button type="button" className="panel-primary-action" disabled={disabled || isLoading} onClick={() => onRun(options)}><PlayCircle size={15} />{isLoading ? "Generating surface..." : "Generate raster + contours"}</button>
      {disabled ? <p className="inventory-validation">Select a transmitter cell first.</p> : null}
      {surface?.stats ? (
        <div className="surface-summary">
          <span><small>Grid</small><strong>{surface.grid?.width} × {surface.grid?.height}</strong></span>
          <span><small>Valid cells</small><strong>{surface.stats.valid_cell_count?.toLocaleString()}</strong></span>
          <span><small>Range</small><strong>{Number(surface.stats.minimum_dbm).toFixed(0)}–{Number(surface.stats.maximum_dbm).toFixed(0)} dBm</strong></span>
          <span><small>Isolines</small><strong>{surface.contours?.features?.length?.toLocaleString() ?? 0}</strong></span>
        </div>
      ) : null}
      <div className="surface-exports">
        <button type="button" disabled={!surface} onClick={() => onExport("geotiff")}><Download size={14} />GeoTIFF</button>
        <button type="button" disabled={!surface} onClick={() => onExport("geojson")}><Download size={14} />Contours</button>
        <button type="button" disabled={!surface} onClick={() => onExport("csv")}><Download size={14} />CSV</button>
      </div>
      {surface?.model?.assumptions?.map((assumption) => <p className="data-note" key={assumption}>{assumption}</p>)}
    </section>
  );
}
