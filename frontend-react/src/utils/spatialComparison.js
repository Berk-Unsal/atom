// Spatial served-state comparison: which demand buildings become served or lost, and where overlap changes.
// Classes follow the categorical palette in fixed order (validated light and dark); identity also uses a distinct
// mark style and visible labels, never color alone.

export const COMPARISON_CLASSES = Object.freeze([
  { id: "newly_served", label: "Newly served", color: "#2a78d6", darkColor: "#3987e5", fillOpacity: 0.9, dashArray: null },
  { id: "newly_lost", label: "Newly lost", color: "#eb6834", darkColor: "#d95926", fillOpacity: 0.15, dashArray: null },
  { id: "overlap_gained", label: "Overlap gained", color: "#1baf7a", darkColor: "#199e70", fillOpacity: 0.85, dashArray: "3 2" },
  { id: "overlap_removed", label: "Overlap removed", color: "#eda100", darkColor: "#c98500", fillOpacity: 0.15, dashArray: "2 2" },
]);

export const COMPARISON_CLASS_BY_ID = Object.freeze(Object.fromEntries(COMPARISON_CLASSES.map((item) => [item.id, item])));

/** Outline for a class mark: hollow classes ("lost", "removed") draw a 2 px ring in their own color. */
export function comparisonOutline(item, theme = "light") {
  const hollow = item.fillOpacity < 0.5;
  const color = theme === "dark" ? item.darkColor : item.color;
  return hollow ? { color, width: 2.2 } : { color: theme === "dark" ? "#f0efec" : "#0f172a", width: 1.2 };
}

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}

function withAzimuths(request, solution) {
  const azimuths = new Map((solution?.towers ?? solution?.cell_configurations ?? []).map((tower) => [
    String(tower.id ?? tower.cell_id),
    finite(tower.azimuth_deg ?? tower.optimal_azimuth ?? tower.azimuth),
  ]));
  return {
    ...request,
    towers: request.towers.map((tower) => (azimuths.get(String(tower.id)) !== null && azimuths.has(String(tower.id))
      ? { ...tower, azimuth: azimuths.get(String(tower.id)) }
      : tower)),
  };
}

/**
 * The exact network request behind a comparison source, or null when it has none: a saved Version's request inputs,
 * the current network plan, or the optimization Run's retained request (baseline) with a solution's azimuths.
 */
export function networkRequestForSource(source, { currentNetworkRequest = null, optimizationRequest = null, recommendedSolution = null, selectedSolution = null } = {}) {
  const isNetwork = (request) => Array.isArray(request?.towers) && request.towers.length >= 2;
  switch (source?.kind) {
    case "version": {
      const request = source.revision?.request_inputs ?? null;
      return isNetwork(request) ? request : null;
    }
    case "current":
      return isNetwork(currentNetworkRequest) ? currentNetworkRequest : null;
    case "baseline":
      return isNetwork(optimizationRequest) ? optimizationRequest : null;
    case "recommended":
      return isNetwork(optimizationRequest) && recommendedSolution ? withAzimuths(optimizationRequest, recommendedSolution) : null;
    case "alternative":
      return isNetwork(optimizationRequest) && selectedSolution ? withAzimuths(optimizationRequest, selectedSolution) : null;
    default:
      return null;
  }
}

/**
 * Whether the pair can be compared spatially. The server evaluates both plans on its active dataset and model, so
 * each state must already record exactly that dataset and model; otherwise the comparison would not describe them.
 */
export function spatialComparisonAvailability(first, second, requests, { dataset = null, model = null } = {}) {
  if (!first || !second || first.id === second.id) return { available: false, reason: "Choose two different states." };
  if (!requests.a || !requests.b) return { available: false, reason: "Spatial comparison needs two network plans (2–8 Cells each): saved network Versions, the current network plan, or an optimization's baseline and solutions." };
  const sameAsCurrent = (source) => (
    (!source.identity?.dataset || !dataset || source.identity.dataset === dataset)
    && (!source.identity?.model || !model || source.identity.model === model)
  );
  if (!sameAsCurrent(first) || !sameAsCurrent(second)) {
    return { available: false, reason: "Spatial comparison needs both states on the current dataset and model; one of them was computed with a different identity." };
  }
  return { available: true, reason: "" };
}

/** Same served and overlap counts, as label/value rows for the Compare view and reports. */
export function spatialComparisonRows(result) {
  if (!result?.counts) return [];
  return COMPARISON_CLASSES.map((item) => [item.label, String(result.counts[item.id] ?? 0)]);
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

/** A static SVG of the changed buildings for reports, with a labeled legend; empty string when nothing changed. */
export function spatialComparisonSvg(result, { width = 640, height = 360 } = {}) {
  const buildings = result?.buildings ?? [];
  if (!buildings.length) return "";
  const lons = buildings.map((building) => building.lon);
  const lats = buildings.map((building) => building.lat);
  const pad = 0.0005;
  const minLon = Math.min(...lons) - pad;
  const maxLon = Math.max(...lons) + pad;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const inner = { left: 16, top: 16, right: width - 16, bottom: height - 64 };
  const x = (lon) => inner.left + ((lon - minLon) / (maxLon - minLon)) * (inner.right - inner.left);
  const y = (lat) => inner.bottom - ((lat - minLat) / (maxLat - minLat)) * (inner.bottom - inner.top);
  const marks = buildings.map((building) => {
    const style = COMPARISON_CLASS_BY_ID[building.class];
    if (!style) return "";
    const outline = comparisonOutline(style);
    return `<circle cx="${x(building.lon).toFixed(1)}" cy="${y(building.lat).toFixed(1)}" r="4.5" fill="${style.color}" fill-opacity="${style.fillOpacity}" stroke="${outline.color}" stroke-width="${outline.width}"${style.dashArray ? ` stroke-dasharray="${style.dashArray}"` : ""}><title>${escapeSvg(style.label)} · ${escapeSvg(building.id)}</title></circle>`;
  }).join("");
  const legend = COMPARISON_CLASSES.map((item, index) => `<g transform="translate(${16 + index * 156} ${height - 34})"><circle cx="6" cy="6" r="5" fill="${item.color}" fill-opacity="${item.fillOpacity}" stroke="${comparisonOutline(item).color}" stroke-width="${comparisonOutline(item).width}"${item.dashArray ? ` stroke-dasharray="${item.dashArray}"` : ""} /><text x="16" y="10" font-family="Inter, Arial, sans-serif" font-size="12" fill="#14201c">${escapeSvg(item.label)} (${result.counts?.[item.id] ?? 0})</text></g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Where the two plans differ: changed buildings by class"><rect width="${width}" height="${height}" fill="#f4f6f5" /><rect x="${inner.left}" y="${inner.top}" width="${inner.right - inner.left}" height="${inner.bottom - inner.top}" fill="#ffffff" stroke="#d7e1dc" />${marks}${legend}</svg>`;
}
