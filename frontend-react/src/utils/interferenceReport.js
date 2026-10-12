import { escapeHtml, formatCompactNumber, formatNumber } from "./reportFormatting.js";

const REPORT_NOT_AVAILABLE = "Not available";

export function renderMarkdownInterferenceSection(report) {
  const analysis = report?.interferenceAnalysis;
  if (!analysis?.stats || !analysis?.model) return "";

  const statsRows = buildStatsRows(analysis.stats);
  const modelRows = buildModelRows(analysis.model);
  const cellRows = buildCellRows(analysis.stats.per_serving_cell);
  const demandRows = buildDemandRows(analysis.demand_geojson?.features);
  const sections = [
    statsRows.length > 0
      ? renderMarkdownTable(["Metric", "Value"], statsRows)
      : "No valid interference samples were retained for this report.",
    modelRows.length > 0
      ? `### Model assumptions\n\n${renderMarkdownTable(["Assumption", "Value"], modelRows)}`
      : "",
    cellRows.length > 0
      ? `### Per-serving-cell radio quality\n\n${renderMarkdownTable(["Serving cell", "Channel", "Samples", "Avg SINR", "Avg RSRP", "Avg RSRQ"], cellRows)}`
      : "",
    demandRows.length > 0
      ? `### Affected demand buildings\n\n${renderMarkdownTable(["Building", "Serving cell", "SINR", "RSRP", "Demand"], demandRows)}`
      : "",
    "Planning estimate only; values are not UE or protocol measurements.",
  ].filter(Boolean);

  return `## Interference and Radio Quality\n\n${sections.join("\n\n")}`;
}

export function renderPrintableInterferenceSection(report) {
  const analysis = report?.interferenceAnalysis;
  if (!analysis?.stats || !analysis?.model) return "";

  const statsRows = buildStatsRows(analysis.stats);
  const modelRows = buildModelRows(analysis.model);
  const cellRows = buildCellRows(analysis.stats.per_serving_cell);
  const demandRows = buildDemandRows(analysis.demand_geojson?.features);
  const blocks = [];
  blocks.push(statsRows.length > 0 ? renderHtmlTable(["Metric", "Value"], statsRows) : `<p>No valid interference samples were retained for this report.</p>`);
  if (modelRows.length > 0) blocks.push(`<h3>Model assumptions</h3>${renderHtmlTable(["Assumption", "Value"], modelRows)}`);
  if (cellRows.length > 0) blocks.push(`<h3>Per-serving-cell radio quality</h3>${renderHtmlTable(["Serving cell", "Channel", "Samples", "Avg SINR", "Avg RSRP", "Avg RSRQ"], cellRows, "small-table")}`);
  if (demandRows.length > 0) blocks.push(`<h3>Affected demand buildings</h3>${renderHtmlTable(["Building", "Serving cell", "SINR", "RSRP", "Demand"], demandRows, "small-table")}`);
  blocks.push(`<p class="report-note">Planning estimate only; values are not UE or protocol measurements.</p>`);
  return `<section data-report-section="interference"><h2>Interference and Radio Quality</h2>${blocks.join("")}</section>`;
}

function buildStatsRows(stats) {
  return [
    ["Average SINR", formatUnit(stats.avg_sinr_db, 1, "dB")],
    ["P10 SINR", formatUnit(stats.p10_sinr_db, 1, "dB")],
    ["Median SINR", formatUnit(stats.median_sinr_db, 1, "dB")],
    ["Average RSRP", formatUnit(stats.avg_rsrp_dbm, 1, "dBm")],
    ["Average RSRQ", formatUnit(stats.avg_rsrq_db, 1, "dB")],
    ["Serviceable surface", formatPercent(stats.serviceable_pct, true)],
    ["Serviceable of signal", formatPercent(stats.serviceable_fraction)],
    ["Interference-limited surface", formatPercent(stats.interference_limited_pct, true)],
    ["Affected demand buildings", formatCount(stats.affected_demand_buildings)],
    ["Affected demand", formatCompact(stats.affected_demand)],
  ].filter((row) => row[1] !== null);
}

function buildModelRows(model) {
  return [
    ["Model", display(model.type)],
    ["Measurement family", display(model.measurement_family ?? model.measurementFamily)],
    ["Bandwidth", formatUnit(model.bandwidth_mhz ?? model.bandwidthMHz, 0, "MHz")],
    ["Subcarrier spacing", formatUnit(model.subcarrier_spacing_khz ?? model.subcarrierSpacingKHz, 0, "kHz")],
    ["Resource blocks", formatCount(model.resource_blocks ?? model.resourceBlocks)],
    ["Noise figure", formatUnit(model.noise_figure_db ?? model.noiseFigureDb, 1, "dB")],
    ["Cell load", formatPercent(model.load_factor ?? model.loadFactor)],
    ["Reuse factor", formatCount(model.reuse_factor ?? model.reuseFactor)],
    ["Effective grid", formatUnit(model.effective_sample_spacing_m ?? model.effectiveSampleSpacingM, 1, "m")],
    ["Serving selection", display(model.serving_selection_mode ?? model.servingSelectionMode)],
    ["Power basis", display(model.resource_basis ?? model.resourceBasis)],
    ["RSRP conversion", display(model.rsrp_conversion_id ?? model.rsrpConversionID)],
    ["Noise bandwidth", formatUnit(model.interference_noise_bandwidth_hz ?? model.interferenceNoiseBandwidthHz, 0, "Hz")],
    ["Co-channel rule", display(model.co_channel_eligibility_rule ?? model.coChannelEligibilityRule)],
    ["Scenario fingerprint", display(model.scenario_fingerprint ?? model.scenarioFingerprint)],
  ].filter((row) => row[1] !== null);
}

function buildCellRows(cells) {
  return (Array.isArray(cells) ? cells : []).map((cell) => {
    const measurements = [
      cell.avg_sinr_db ?? cell.avgSinrDb,
      cell.avg_rsrp_dbm ?? cell.avgRsrpDbm,
      cell.avg_rsrq_db ?? cell.avgRsrqDb,
    ];
    if (!measurements.some((value) => finiteOrNull(value) !== null)) return null;
    return [
      display(cell.cell_id ?? cell.cellId),
      display(cell.channel_id ?? cell.channelId),
      formatCount(cell.serving_samples ?? cell.servingSamples),
      formatUnit(cell.avg_sinr_db ?? cell.avgSinrDb, 1, "dB"),
      formatUnit(cell.avg_rsrp_dbm ?? cell.avgRsrpDbm, 1, "dBm"),
      formatUnit(cell.avg_rsrq_db ?? cell.avgRsrqDb, 1, "dB"),
    ];
  }).filter(Boolean);
}

function buildDemandRows(features) {
  return (Array.isArray(features) ? features : []).slice(0, 10).map((feature) => {
    const properties = feature?.properties ?? {};
    const measurements = [properties.sinr_db ?? properties.sinrDb, properties.rsrp_dbm ?? properties.rsrpDbm, properties.total_demand ?? properties.totalDemand];
    if (!measurements.some((value) => finiteOrNull(value) !== null)) return null;
    return [
      display(properties.building_id ?? properties.buildingId),
      display(properties.serving_cell_id ?? properties.servingCellId),
      formatUnit(properties.sinr_db ?? properties.sinrDb, 1, "dB"),
      formatUnit(properties.rsrp_dbm ?? properties.rsrpDbm, 1, "dBm"),
      formatCompact(properties.total_demand ?? properties.totalDemand),
    ];
  }).filter(Boolean);
}

function formatUnit(value, digits, unit) {
  const numeric = finiteOrNull(value);
  return numeric === null ? null : `${formatNumber(numeric, digits)} ${unit}`;
}

function formatPercent(value, inputIsPercent = false) {
  const numeric = finiteOrNull(value);
  return numeric === null ? null : `${formatNumber(inputIsPercent ? numeric : numeric * 100, 1)}%`;
}

function formatCount(value) {
  const numeric = finiteOrNull(value);
  return numeric === null ? null : formatNumber(numeric, 0);
}

function formatCompact(value) {
  const numeric = finiteOrNull(value);
  return numeric === null ? null : formatCompactNumber(numeric);
}

function display(value) {
  return value === null || value === undefined || value === "" ? REPORT_NOT_AVAILABLE : String(value);
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(numeric) ? null : numeric;
}

function markdownText(value) {
  return String(value ?? REPORT_NOT_AVAILABLE).replace(/\|/g, "\\|");
}

function renderMarkdownTable(headers, rows) {
  return `| ${headers.map(markdownText).join(" | ")} |\n|${headers.map(() => "---").join("|")} |\n${rows.map((cells) => `| ${cells.map(markdownText).join(" | ")} |`).join("\n")}`;
}

function renderHtmlTable(headers, rows, className = "") {
  const headerHTML = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowHTML = rows.map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<div class="report-table-wrap"><table${className ? ` class="${escapeHtml(className)}"` : ""}><thead><tr>${headerHTML}</tr></thead><tbody>${rowHTML}</tbody></table></div>`;
}
