import { formatCompactNumber, formatNumber } from "./appWorkspace.js";

export function getComparisonMetrics(comparison) {
  if (comparison?.type === "optimization" && comparison?.metrics) return getNetworkOptimizationComparisonMetrics(comparison);
  const before = comparison?.before?.stats;
  const after = comparison?.after?.stats;
  if (!before || !after) return [];
  if (comparison?.kind === "network") {
    return [
      createComparisonMetric({ after: after.networkScore, before: before.networkScore, compact: true, digits: 1, higherIsBetter: true, key: "networkScore", label: "Optimization score", unit: "score" }),
      createComparisonMetric({ after: after.uniqueDemandBuildings, before: before.uniqueDemandBuildings, digits: 0, higherIsBetter: true, key: "uniqueDemandBuildings", label: "Unique POI", unit: "buildings" }),
      createComparisonMetric({ after: after.uniqueResidentialBuildings, before: before.uniqueResidentialBuildings, digits: 0, higherIsBetter: true, key: "uniqueResidentialBuildings", label: "Unique residential", unit: "buildings" }),
      createComparisonMetric({ after: after.overlapBuildings, before: before.overlapBuildings, digits: 0, higherIsBetter: false, key: "overlapBuildings", label: "Overlap", unit: "buildings" }),
      createComparisonMetric({ after: after.overlapPenalty, before: before.overlapPenalty, compact: true, digits: 1, higherIsBetter: false, key: "overlapPenalty", label: "Overlap penalty", unit: "score" }),
    ].filter(Boolean);
  }
  return [
    createComparisonMetric({ after: after.avgPower, before: before.avgPower, digits: 1, higherIsBetter: true, key: "avgPower", label: "Avg Rx", unit: "dBm" }),
    createComparisonMetric({ after: after.maxRange, before: before.maxRange, digits: 1, higherIsBetter: true, key: "maxRange", label: "Max range", unit: "m" }),
    createComparisonMetric({ after: after.gapBuildings, before: before.gapBuildings, digits: 0, higherIsBetter: false, key: "gapBuildings", label: "Underserved", unit: "buildings" }),
    createComparisonMetric({ after: after.gapRatio, before: before.gapRatio, digits: 1, higherIsBetter: false, key: "gapRatio", label: "Gap ratio", unit: "%" }),
    createComparisonMetric({ after: after.totalGapDemand, before: before.totalGapDemand, compact: true, digits: 1, higherIsBetter: false, key: "totalGapDemand", label: "Unmet demand", unit: "score" }),
  ].filter(Boolean);
}

function getNetworkOptimizationComparisonMetrics(comparison) {
  const metrics = comparison.metrics ?? {};
  return [
    createComparisonMetric({ after: metrics.demand?.optimized, before: metrics.demand?.baseline, digits: 1, higherIsBetter: true, key: "demand", label: "Demand served", unit: "weight" }),
    createComparisonMetric({ after: metrics.residential?.optimized, before: metrics.residential?.baseline, digits: 0, higherIsBetter: true, key: "residential", label: "Residential buildings", unit: "buildings" }),
    createComparisonMetric({ after: Number(metrics.propagation_reach?.optimized) * 100, before: Number(metrics.propagation_reach?.baseline) * 100, digits: 1, deltaUnit: "pp", higherIsBetter: true, key: "propagation_reach", label: "Propagation reach", unit: "%" }),
    createComparisonMetric({ after: Number(metrics.overlap?.optimized) * 100, before: Number(metrics.overlap?.baseline) * 100, digits: 1, deltaUnit: "pp", higherIsBetter: false, key: "overlap", label: "Overlap ratio", unit: "%" }),
    createComparisonMetric({ after: Number(metrics.radio_quality?.optimized) * 100, before: Number(metrics.radio_quality?.baseline) * 100, digits: 1, deltaUnit: "pp", higherIsBetter: true, key: "radio_quality", label: "Radio quality", unit: "%" }),
    createComparisonMetric({ after: metrics.overlap_buildings?.optimized, before: metrics.overlap_buildings?.baseline, digits: 0, higherIsBetter: false, key: "overlap_buildings", label: "Overlap buildings", unit: "buildings" }),
    createComparisonMetric({ after: metrics.covered_units?.optimized, before: metrics.covered_units?.baseline, digits: 0, higherIsBetter: undefined, key: "covered_units", label: "Covered units", unit: "units" }),
    createComparisonMetric({ after: metrics.score?.optimized, before: metrics.score?.baseline, digits: 1, higherIsBetter: true, key: "score", label: "Optimization score", unit: "score" }),
  ].filter((metric) => metric && metrics[metric.key]?.available !== false);
}

export function buildComparisonBarChartSvg(comparison) {
  const metrics = getComparisonMetrics(comparison);
  if (metrics.length === 0) return "";
  const width = 720;
  const height = 300;
  const margin = { bottom: 58, left: 34, right: 24, top: 54 };
  const plotHeight = height - margin.top - margin.bottom;
  const panelWidth = (width - margin.left - margin.right) / metrics.length;
  const beforeColor = "#64748b";
  const afterColor = "#0f766e";
  const panels = metrics.map((metric, index) => {
    const values = [metric.before, metric.after];
    const usesZeroBaseline = values.every((value) => value >= 0);
    const min = usesZeroBaseline ? 0 : Math.min(...values);
    const max = usesZeroBaseline ? Math.max(...values, 1) : Math.max(...values);
    const range = Math.max(max - min, 1);
    const x = margin.left + index * panelWidth;
    const barWidth = Math.min(32, panelWidth * 0.22);
    const beforeHeight = Math.max(6, ((metric.before - min) / range) * plotHeight);
    const afterHeight = Math.max(6, ((metric.after - min) / range) * plotHeight);
    const beforeX = x + panelWidth * 0.5 - barWidth - 4;
    const afterX = x + panelWidth * 0.5 + 4;
    const baseline = margin.top + plotHeight;
    return `<g><line x1="${x + 8}" y1="${baseline}" x2="${x + panelWidth - 8}" y2="${baseline}" stroke="#d7e1dc" /><rect x="${beforeX.toFixed(1)}" y="${(baseline - beforeHeight).toFixed(1)}" width="${barWidth}" height="${beforeHeight.toFixed(1)}" rx="4" fill="${beforeColor}" opacity="0.86" /><rect x="${afterX.toFixed(1)}" y="${(baseline - afterHeight).toFixed(1)}" width="${barWidth}" height="${afterHeight.toFixed(1)}" rx="4" fill="${afterColor}" opacity="0.92" /><text x="${(beforeX + barWidth / 2).toFixed(1)}" y="${(baseline - beforeHeight - 7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#475569">${escapeSvgText(formatMetricValue(metric, metric.before))}</text><text x="${(afterX + barWidth / 2).toFixed(1)}" y="${(baseline - afterHeight - 7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#0b4f49">${escapeSvgText(formatMetricValue(metric, metric.after))}</text><text x="${(x + panelWidth / 2).toFixed(1)}" y="${height - 30}" text-anchor="middle" font-size="12" font-weight="850" fill="#14201c">${escapeSvgText(metric.label)}</text><text x="${(x + panelWidth / 2).toFixed(1)}" y="${height - 13}" text-anchor="middle" font-size="10" font-weight="700" fill="${metric.status === "improved" ? "#0f766e" : metric.status === "regressed" ? "#be123c" : "#64748b"}">${escapeSvgText(metric.deltaLabel)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Before and after optimization grouped bar chart"><rect width="${width}" height="${height}" rx="8" fill="#ffffff" /><text x="24" y="30" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="850" fill="#14201c">KPI comparison</text><circle cx="${width - 170}" cy="25" r="5" fill="${beforeColor}" /><text x="${width - 158}" y="29" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#52615a">Before</text><circle cx="${width - 92}" cy="25" r="5" fill="${afterColor}" /><text x="${width - 80}" y="29" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#52615a">After</text><g font-family="Inter, Arial, sans-serif">${panels}</g></svg>`;
}

export function buildComparisonSlopeChartSvg(comparison) {
  const metrics = getComparisonMetrics(comparison);
  if (metrics.length === 0) return "";
  const width = 720;
  const rowHeight = 48;
  const height = 78 + metrics.length * rowHeight;
  const beforeX = 230;
  const afterX = 520;
  const top = 56;
  const rows = metrics.map((metric, index) => {
    const rowTop = top + index * rowHeight;
    const values = [metric.before, metric.after];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const beforeY = rowTop + 32 - ((metric.before - min) / range) * 24;
    const afterY = rowTop + 32 - ((metric.after - min) / range) * 24;
    const color = metric.status === "improved" ? "#0f766e" : metric.status === "regressed" ? "#be123c" : "#64748b";
    return `<g><text x="24" y="${rowTop + 23}" font-size="12" font-weight="850" fill="#14201c">${escapeSvgText(metric.label)}</text><line x1="${beforeX}" y1="${beforeY.toFixed(1)}" x2="${afterX}" y2="${afterY.toFixed(1)}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.86" /><circle cx="${beforeX}" cy="${beforeY.toFixed(1)}" r="5" fill="#ffffff" stroke="#64748b" stroke-width="3" /><circle cx="${afterX}" cy="${afterY.toFixed(1)}" r="5" fill="#ffffff" stroke="${color}" stroke-width="3" /><text x="${beforeX}" y="${rowTop + 44}" text-anchor="middle" font-size="10" font-weight="800" fill="#52615a">${escapeSvgText(formatMetricValue(metric, metric.before))}</text><text x="${afterX}" y="${rowTop + 44}" text-anchor="middle" font-size="10" font-weight="800" fill="${color}">${escapeSvgText(formatMetricValue(metric, metric.after))}</text><text x="${width - 24}" y="${rowTop + 23}" text-anchor="end" font-size="11" font-weight="850" fill="${color}">${escapeSvgText(metric.deltaLabel)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Before and after optimization slope chart"><rect width="${width}" height="${height}" rx="8" fill="#ffffff" /><text x="24" y="30" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="850" fill="#14201c">Optimization movement</text><text x="${beforeX}" y="31" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="850" fill="#64748b">Before</text><text x="${afterX}" y="31" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="850" fill="#0f766e">After</text><g font-family="Inter, Arial, sans-serif">${rows}</g></svg>`;
}

function createComparisonMetric({ after, before, compact = false, deltaUnit, digits, higherIsBetter, key, label, unit }) {
  const beforeNumber = Number(before);
  const afterNumber = Number(after);
  if (!Number.isFinite(beforeNumber) || !Number.isFinite(afterNumber)) return null;
  const delta = afterNumber - beforeNumber;
  const scoreDelta = higherIsBetter === false ? -delta : delta;
  const resolvedDeltaUnit = deltaUnit ?? unit;
  const status = higherIsBetter === undefined ? "informational" : Math.abs(delta) < 0.000001 ? "flat" : scoreDelta > 0 ? "improved" : "regressed";
  return { after: afterNumber, before: beforeNumber, compact, delta, deltaLabel: formatMetricDelta({ compact, delta, digits, unit: resolvedDeltaUnit }), digits, higherIsBetter, improved: status === "improved", key, label, status, unit };
}

export function formatMetricValue(metric, value) {
  if (metric.compact) return formatCompactNumber(value);
  const formatted = formatNumber(value, metric.digits);
  return metric.unit ? `${formatted} ${metric.unit}` : formatted;
}

function formatMetricDelta({ compact, delta, digits, unit }) {
  const prefix = delta > 0 ? "+" : "";
  if (compact) return `${prefix}${formatCompactNumber(delta)}`;
  const formatted = formatNumber(delta, digits);
  return unit ? `${prefix}${formatted} ${unit}` : `${prefix}${formatted}`;
}

function escapeSvgText(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}
