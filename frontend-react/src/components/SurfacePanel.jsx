import { Download, Layers3, PlayCircle } from "lucide-react";

const THRESHOLDS = [-120, -110, -100, -90, -80, -70];

export default function SurfacePanel({ disabled, isLoading, onExport, onOptionsChange, onRun, options, surface, surfaceCellId, surfaceError = "", surfaceState }) {
  const resolvedSurfaceState = surfaceState ?? (surface ? "ready" : "unavailable");
  const toggleThreshold = (threshold) => {
    const current = options.thresholdsDBm ?? [];
    const next = current.includes(threshold) ? current.filter((value) => value !== threshold) : [...current, threshold].sort((a, b) => a - b);
    if (next.length > 0) onOptionsChange({ ...options, thresholdsDBm: next });
  };
  return (
    <section className="surface-panel" aria-label="Received signal surface" aria-busy={resolvedSurfaceState === "loading" || undefined}>
      <div className="panel-title"><Layers3 size={16} /><span>Received signal surface</span></div>
      <p className="data-note">Generate a compact regular raster and unsmoothed isolines of raw single-cell received power. It is not aggregate network coverage; valid cells can be below receiver sensitivity, while NoData means radius or beam geometry exclusion.</p>
      {resolvedSurfaceState === "available" ? <p className="data-note surface-status" role="status">A current RF result is ready. Select Signal to load its surface.</p> : null}
      {resolvedSurfaceState === "loading" ? <p className="data-note surface-status" role="status">Loading the authoritative surface for the current RF result…</p> : null}
      {resolvedSurfaceState === "error" ? <p className="data-note surface-status" role="alert">{surfaceError || "Surface generation failed. Try again."}</p> : null}
      {surface ? <p className="surface-source-note">Rendered from Cell {surfaceCellId ?? "selected"}. Changing RF inputs clears this surface.</p> : null}
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
        <span className="input-label">Display floor <small>(visual only)</small></span>
        <span className="number-wrap"><select value={options.displayThresholdDBm} onChange={(event) => onOptionsChange({ ...options, displayThresholdDBm: Number(event.target.value) })}>{THRESHOLDS.map((value) => <option key={value} value={value}>{value} dBm</option>)}</select></span>
      </label>
      <button type="button" className="panel-primary-action" disabled={disabled || isLoading} onClick={() => onRun(options)}><PlayCircle size={15} />{isLoading ? "Generating surface..." : "Generate raster + contours"}</button>
      {disabled ? <p className="inventory-validation">Select a transmitter cell first.</p> : null}
      {surface?.stats ? (
        <div className="surface-summary">
          <span><small>Grid</small><strong>{surface.grid?.width} × {surface.grid?.height}</strong></span>
        <span><small>Valid raw cells</small><strong>{surface.stats.valid_cell_count?.toLocaleString()}</strong></span>
        <span><small>Below sensitivity</small><strong>{surface.stats.below_sensitivity_cell_count?.toLocaleString() ?? "—"}</strong></span>
          <span><small>Range</small><strong>{formatSurfacePower(surface.stats.min_dbm ?? surface.stats.minimum_dbm)}–{formatSurfacePower(surface.stats.max_dbm ?? surface.stats.maximum_dbm)} dBm</strong></span>
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

function formatSurfacePower(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(0).replace("-", "−") : "—";
}
