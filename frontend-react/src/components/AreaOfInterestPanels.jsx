import { LassoSelect } from "lucide-react";
import { areaOfInterestRows } from "../utils/areaOfInterest.js";

export function AreaOfInterestControl({ enabled, hasArea, isDrawing = false, onChange, onDrawArea }) {
  return (
    <section className="area-of-interest-control" aria-label="Area of interest">
      <label className="area-of-interest-toggle">
        <input type="checkbox" checked={enabled && hasArea} disabled={!hasArea} onChange={(event) => onChange(event.target.checked)} />
        <span>Report KPIs inside the drawn area</span>
      </label>
      <p className="data-note">
        {hasArea
          ? "Network runs add demand, residential and overlap KPIs for buildings inside the area. Objectives, scores and the evaluated network are unchanged."
          : "Draw an area on the map first; your selected Cells stay as they are."}
      </p>
      <button type="button" className="selection-map-action" onClick={onDrawArea} disabled={isDrawing}>
        <LassoSelect size={15} aria-hidden="true" />
        <span>{isDrawing ? "Drawing area…" : hasArea ? "Redraw area" : "Draw area"}</span>
      </button>
    </section>
  );
}

export function AreaOfInterestKpis({ stats }) {
  const rows = areaOfInterestRows(stats);
  if (!rows.length) return null;
  return (
    <section className="area-of-interest-kpis" aria-label="Area of interest KPIs">
      <strong>Inside the area of interest</strong>
      <table>
        <thead><tr><th scope="col">KPI</th><th scope="col">Network</th><th scope="col">Inside area</th></tr></thead>
        <tbody>
          {rows.map(([label, network, inside]) => (
            <tr key={label}><th scope="row">{label}</th><td>{network}</td><td>{inside}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="data-note">Buildings count as inside when their footprint centroid is in the area. The area changes reporting only.</p>
    </section>
  );
}
