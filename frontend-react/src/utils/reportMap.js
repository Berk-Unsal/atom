import { rxPowerColor } from "./geojson.js";
import { escapeHtml } from "./reportFormatting.js";
import { compareReportIds } from "./reportRFConfiguration.js";

export const REPORT_MAP_SEGMENT_LIMIT = 300;
const WIDTH = 720;
const HEIGHT = 460;
const PLOT = { left: 32, right: 688, top: 28, bottom: 392 };
const GAP_LIMIT = 260;
const INTERFERENCE_LIMIT = 600;

export function isReportCoordinate(coordinate) {
  return Array.isArray(coordinate) && coordinate.length >= 2 && coordinate.slice(0, 2).every((value) => value !== null && value !== "" && Number.isFinite(Number(value)));
}

function segmentKey(feature) {
  const p = feature.properties ?? {};
  return `${String(p.ray_index ?? "").padStart(8, "0")}:${String(p.segment_index ?? "").padStart(8, "0")}:${JSON.stringify(feature.geometry.coordinates)}`;
}

/** Cell-stratified presentation only. Neither geometry nor RF statistics are modified. */
export function sampleReportSegments(features, maximum = REPORT_MAP_SEGMENT_LIMIT) {
  const budget = Math.max(0, Math.floor(maximum));
  if (!budget) return [];
  const groups = new Map();
  for (const feature of features) {
    const id = String(feature.properties?.cell_id ?? feature.properties?.network_tower_id ?? "unassigned");
    const group = groups.get(id) ?? [];
    group.push(feature);
    groups.set(id, group);
  }
  const entries = [...groups].sort(([a], [b]) => compareReportIds(a, b)).map(([id, items]) => ({
    id, items: [...items].sort((a, b) => compareReportIds(segmentKey(a), segmentKey(b))), quota: 0,
  }));
  if (features.length <= budget) return entries.flatMap(({ items }) => items);
  let remaining = budget;
  for (const entry of entries) {
    if (remaining > 0) { entry.quota = 1; remaining--; }
  }
  while (remaining > 0) {
    // Allocate proportionally to unrepresented segments; stable ID breaks equal remainders.
    const eligible = entries.filter((entry) => entry.quota < entry.items.length);
    if (!eligible.length) break;
    const total = eligible.reduce((sum, entry) => sum + entry.items.length - entry.quota, 0);
    const shares = eligible.map((entry) => ({ entry, share: remaining * (entry.items.length - entry.quota) / total }));
    let assigned = 0;
    for (const { entry, share } of shares) {
      const count = Math.min(entry.items.length - entry.quota, Math.floor(share));
      entry.quota += count; assigned += count;
    }
    remaining -= assigned;
    if (remaining && !assigned) {
      shares.sort((a, b) => b.share - a.share || compareReportIds(a.entry.id, b.entry.id));
      for (const { entry } of shares) {
        if (!remaining) break;
        entry.quota++; remaining--;
      }
    }
  }
  return entries.flatMap(({ items, quota }) => Array.from({ length: quota }, (_, i) => items[Math.floor(i * items.length / quota)]));
}

function projection(cells, lines, gaps, interference) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const include = (coordinate) => {
    if (!isReportCoordinate(coordinate)) return;
    minLon = Math.min(minLon, Number(coordinate[0])); maxLon = Math.max(maxLon, Number(coordinate[0]));
    minLat = Math.min(minLat, Number(coordinate[1])); maxLat = Math.max(maxLat, Number(coordinate[1]));
  };
  cells.forEach((cell) => include(cell.coordinates));
  lines.forEach((feature) => feature.geometry.coordinates.forEach(include));
  [...gaps, ...interference].forEach((feature) => include(feature.geometry.coordinates));
  if (!Number.isFinite(minLon)) return null;
  const center = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  const longitudeScale = Math.max(Math.cos(center[1] * Math.PI / 180), 0.01);
  const dx = Math.max((maxLon - minLon) * longitudeScale * 1.24, 0.0015);
  const dy = Math.max((maxLat - minLat) * 1.24, 0.0015);
  const scale = Math.min((PLOT.right - PLOT.left) / dx, (PLOT.bottom - PLOT.top) / dy);
  return {
    bounds: { minLon, maxLon, minLat, maxLat },
    project: ([lon, lat]) => [WIDTH / 2 + (Number(lon) - center[0]) * longitudeScale * scale, (PLOT.top + PLOT.bottom) / 2 - (Number(lat) - center[1]) * scale],
  };
}

/** Offset labels in screen space only. Anchors remain the true projected Cell coordinates. */
export function placeReportMarkers(anchors) {
  const placed = [];
  for (const anchor of anchors) {
    const candidates = [[anchor.x, anchor.y]];
    for (const radius of [28, 48, 70, 96]) {
      for (let i = 0; i < 16; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 8;
        candidates.push([anchor.x + radius * Math.cos(angle), anchor.y + radius * Math.sin(angle)]);
      }
    }
    // Bounded fallback for edge/corner clusters; choose the closest free plot position.
    const fallback = [];
    for (let x = 18; x <= WIDTH - 18; x += 28) {
      for (let y = 18; y <= PLOT.bottom + 8; y += 28) fallback.push([x, y]);
    }
    fallback.sort((a, b) => Math.hypot(a[0] - anchor.x, a[1] - anchor.y) - Math.hypot(b[0] - anchor.x, b[1] - anchor.y) || a[0] - b[0] || a[1] - b[1]);
    const [x, y] = [...candidates, ...fallback].find(([cx, cy]) => cx >= 14 && cx <= WIDTH - 14 && cy >= 14 && cy <= PLOT.bottom + 10 && placed.every((other) => Math.hypot(cx - other.labelX, cy - other.labelY) >= 27)) ?? [anchor.x, anchor.y];
    placed.push({ ...anchor, labelX: x, labelY: y });
  }
  return placed;
}

function samplePoints(features, limit) {
  return features.length <= limit ? features : Array.from({ length: limit }, (_, i) => features[Math.floor(i * features.length / limit)]);
}

function sinrColor(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "#64748b";
  return value < 0 ? "#be123c" : value < 13 ? "#d97706" : value < 20 ? "#2563eb" : "#0f766e";
}

export function buildReportMap({ cells = [], simulation, coverageGaps, interference, source = null, recommendedSolutionId = null }) {
  const lines = (simulation?.geojson?.features ?? []).filter((feature) => feature.geometry?.type === "LineString" && feature.geometry.coordinates?.length >= 2 && feature.geometry.coordinates.every(isReportCoordinate));
  const points = (geojson) => (geojson?.features ?? []).filter((feature) => feature.geometry?.type === "Point" && isReportCoordinate(feature.geometry.coordinates));
  const allGaps = points(coverageGaps?.geojson), allInterference = points(interference?.geojson);
  const sampled = sampleReportSegments(lines);
  const gaps = allGaps.slice(0, GAP_LIMIT), interferencePoints = samplePoints(allInterference, INTERFERENCE_LIMIT);
  const view = projection(cells, lines, allGaps, allInterference);
  const hasRFGeometry = lines.length + allGaps.length + allInterference.length > 0;
  const relationship = !lines.length ? "layers_only" : source?.solution_id && recommendedSolutionId
    ? String(source.solution_id) === String(recommendedSolutionId) ? "matches" : "different_solution"
    : source?.kind === "evaluation" ? "evaluated" : "not_recorded";
  const caption = [
    lines.length ? `${sampled.length} of ${lines.length} RF segments shown. Geometry is sampled for presentation only; underlying RF results and all reported KPIs are unchanged.` : "No RF segment geometry was retained. This snapshot shows the returned analysis layers only; reported KPIs are unchanged.",
    relationship === "layers_only" ? "The alignment of these analysis layers with the current network KPI configuration is not recorded."
      : relationship === "different_solution" ? `Map geometry is from the last simulation (${source.solution_id}); the current priority-ranked recommendation is ${recommendedSolutionId}. The map was not recomputed.`
      : relationship === "matches" ? `Map geometry represents simulated solution ${source.solution_id}.`
        : relationship === "evaluated" ? "Map geometry is from the evaluated network configuration."
          : "Map geometry is from the last available simulation; its alignment with the current KPI solution is not recorded.",
    allGaps.length ? `${gaps.length} of ${allGaps.length} returned gap records shown.` : "",
    allInterference.length ? `${interferencePoints.length} of ${allInterference.length} interference grid samples shown; these have a separate sampling domain.` : "",
    allGaps.length ? "Squares show returned gaps (rose: outage; amber: weak)." : "",
    allInterference.length ? "Circles show SINR (rose: < 0 dB; amber: 0–<13 dB; blue: 13–<20 dB; teal: ≥20 dB; gray: unavailable)." : "",
  ].filter(Boolean).join(" ");
  const base = { state: hasRFGeometry ? "available" : cells.length ? "configuration_only" : "not_retained", totalSegments: lines.length, shownSegments: sampled.length, relationship, caption, bounds: view?.bounds ?? null, markers: [], svg: "" };
  if (!view || !hasRFGeometry) return { ...base, caption: "Ray/map geometry is not available in this report. The Cell registry records configuration only; no coverage map was reconstructed." };
  const { project } = view;
  const markers = placeReportMarkers(cells.filter((cell) => isReportCoordinate(cell.coordinates)).map((cell) => {
    const [x, y] = project(cell.coordinates);
    return { id: cell.id, number: cell.number, x, y };
  }));
  const paths = sampled.map((feature) => {
    const d = feature.geometry.coordinates.map(project).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${rxPowerColor(Number(feature.properties?.signal_dbm ?? -120))}" stroke-width="1.25" opacity="0.55"/>`;
  }).join("");
  const gapShapes = gaps.map((feature) => {
    const [x, y] = project(feature.geometry.coordinates);
    return `<rect x="${(x - 3).toFixed(2)}" y="${(y - 3).toFixed(2)}" width="6" height="6" fill="${feature.properties?.severity === "outage" ? "#be123c" : "#b45309"}" stroke="#fff" stroke-width="0.6"/>`;
  }).join("");
  const gridShapes = interferencePoints.map((feature) => {
    const [x, y] = project(feature.geometry.coordinates);
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.3" fill="${sinrColor(feature.properties?.sinr_db)}" opacity="0.45"/>`;
  }).join("");
  const leaders = `<g class="cell-leaders">${markers.map(({ x, y, labelX, labelY }) => `<line x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${labelX.toFixed(2)}" y2="${labelY.toFixed(2)}" stroke="#334b44" stroke-width="1"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2" fill="#142d25"/>`).join("")}</g>`;
  const markerShapes = markers.map(({ id, number, labelX, labelY }) => `<g data-cell-number="${number}" aria-label="${escapeHtml(`${number}: Cell ${id}`)}"><circle cx="${labelX.toFixed(2)}" cy="${labelY.toFixed(2)}" r="11" fill="#fff" stroke="#174b3c" stroke-width="1.5"/><text x="${labelX.toFixed(2)}" y="${(labelY + 4).toFixed(2)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#142d25">${number}</text></g>`).join("");
  const legend = `<g font-family="Arial,sans-serif" font-size="10" fill="#263c34"><line x1="22" y1="423" x2="40" y2="423" stroke="#10b981" stroke-width="3"/><text x="46" y="427">Rx ≥ -85 dBm</text><line x1="168" y1="423" x2="186" y2="423" stroke="#f59e0b" stroke-width="3"/><text x="192" y="427">-105 ≤ Rx &lt; -85 dBm</text><line x1="365" y1="423" x2="383" y2="423" stroke="#e11d48" stroke-width="3"/><text x="389" y="427">Rx &lt; -105 dBm</text><text x="22" y="446">Schematic geographic snapshot · numbered labels may be offset; leader lines show true Cell locations.</text></g>`;
  const overlays = allGaps.length || allInterference.length ? `<text x="535" y="427" font-family="Arial,sans-serif" font-size="10" fill="#263c34">${[allGaps.length ? "Squares: gaps" : "", allInterference.length ? "Circles: SINR" : ""].filter(Boolean).join(" · ")}</text>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="A.T.O.M RF planning map export" aria-describedby="report-map-description"><title>Planning map and numbered Cells</title><desc id="report-map-description">${escapeHtml(caption)} Lines show modeled received-power segments; squares show returned gaps and circles show sampled interference when available. Numbered callouts connect to true Cell locations.</desc><rect width="${WIDTH}" height="${HEIGHT}" fill="#f8faf9"/>${gridShapes}${paths}${gapShapes}${leaders}${markerShapes}${legend}${overlays}</svg>`;
  return { ...base, markers, svg };
}
