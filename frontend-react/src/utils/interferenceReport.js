export function renderMarkdownInterferenceSection(report) {
  const analysis = report.interferenceAnalysis;
  if (!analysis?.stats || !analysis?.model) {
    return "";
  }
  const stats = analysis.stats;
  const model = analysis.model;
  const cellRows = (stats.per_serving_cell ?? []).map(
    (cell) =>
      `| ${markdownValue(cell.cell_id)} | ${markdownValue(cell.channel_id)} | ${formatNumber(cell.serving_samples, 0)} | ${formatNumber(cell.avg_sinr_db, 1)} dB | ${formatNumber(cell.avg_rsrp_dbm, 1)} dBm | ${formatNumber(cell.avg_rsrq_db, 1)} dB |`,
  );
  const demandRows = (analysis.demand_geojson?.features ?? []).slice(0, 10).map((feature) => {
    const properties = feature.properties ?? {};
    return `| ${markdownValue(properties.building_id)} | ${markdownValue(properties.serving_cell_id)} | ${formatNumber(properties.sinr_db, 1)} dB | ${formatNumber(properties.rsrp_dbm, 1)} dBm | ${formatCompactNumber(properties.total_demand)} |`;
  });
  return `## Interference and Radio Quality

| Metric | Value |
|---|---:|
| Model | ${markdownValue(model.type)} |
| Measurement family | ${markdownValue(model.measurement_family)} |
| Bandwidth / SCS | ${formatNumber(model.bandwidth_mhz, 0)} MHz / ${formatNumber(model.subcarrier_spacing_khz, 0)} kHz |
| Resource blocks | ${formatNumber(model.resource_blocks, 0)} |
| Noise figure | ${formatNumber(model.noise_figure_db, 1)} dB |
| Cell load / reuse | ${formatNumber(model.load_factor * 100, 0)}% / ${formatNumber(model.reuse_factor, 0)} |
| Effective grid | ${formatNumber(model.effective_sample_spacing_m, 1)} m |
| Average / P10 SINR | ${formatNumber(stats.avg_sinr_db, 1)} / ${formatNumber(stats.p10_sinr_db, 1)} dB |
| Average RSRP / RSRQ | ${formatNumber(stats.avg_rsrp_dbm, 1)} dBm / ${formatNumber(stats.avg_rsrq_db, 1)} dB |
| Serviceable surface | ${formatNumber(stats.serviceable_pct, 1)}% |
| Interference-limited surface | ${formatNumber(stats.interference_limited_pct, 1)}% |
| Affected demand buildings | ${formatNumber(stats.affected_demand_buildings, 0)} |
| Affected demand | ${formatCompactNumber(stats.affected_demand)} |

| Serving cell | Channel | Samples | Avg SINR | Avg RSRP | Avg RSRQ |
|---|---|---:|---:|---:|---:|
${cellRows.join("\n") || "| n/a | n/a | n/a | n/a | n/a | n/a |"}

| Affected building | Serving cell | SINR | RSRP | Demand |
|---|---|---:|---:|---:|
${demandRows.join("\n") || "| n/a | n/a | n/a | n/a | n/a |"}

Planning estimate only; values are not UE or protocol measurements.
`;
}

export function renderPrintableInterferenceSection(report) {
  const analysis = report.interferenceAnalysis;
  if (!analysis?.stats || !analysis?.model) {
    return "";
  }
  const stats = analysis.stats;
  const model = analysis.model;
  const cellRows = (stats.per_serving_cell ?? [])
    .map(
      (cell) =>
        `<tr><td>${escapeHtml(cell.cell_id)}</td><td>${escapeHtml(cell.channel_id)}</td><td>${formatNumber(cell.serving_samples, 0)}</td><td>${formatNumber(cell.avg_sinr_db, 1)} dB</td><td>${formatNumber(cell.avg_rsrp_dbm, 1)} dBm</td><td>${formatNumber(cell.avg_rsrq_db, 1)} dB</td></tr>`,
    )
    .join("");
  return `<section>
      <h2>Interference and Radio Quality</h2>
      <div class="grid">
        ${printTable("Radio Quality", [
          ["Average / P10 SINR", `${formatNumber(stats.avg_sinr_db, 1)} / ${formatNumber(stats.p10_sinr_db, 1)} dB`],
          ["Average RSRP", `${formatNumber(stats.avg_rsrp_dbm, 1)} dBm`],
          ["Average RSRQ", `${formatNumber(stats.avg_rsrq_db, 1)} dB`],
          ["Serviceable surface", `${formatNumber(stats.serviceable_pct, 1)}%`],
          ["Interference-limited", `${formatNumber(stats.interference_limited_pct, 1)}%`],
          ["Affected demand", formatCompactNumber(stats.affected_demand)],
        ])}
        ${printTable("Model Assumptions", [
          ["Measurement family", model.measurement_family ?? "n/a"],
          ["Bandwidth", `${formatNumber(model.bandwidth_mhz, 0)} MHz`],
          ["SCS / resource blocks", `${formatNumber(model.subcarrier_spacing_khz, 0)} kHz / ${formatNumber(model.resource_blocks, 0)}`],
          ["Noise figure", `${formatNumber(model.noise_figure_db, 1)} dB`],
          ["Cell load / reuse", `${formatNumber(model.load_factor * 100, 0)}% / ${formatNumber(model.reuse_factor, 0)}`],
          ["Effective grid", `${formatNumber(model.effective_sample_spacing_m, 1)} m`],
        ])}
      </div>
      <table><thead><tr><th>Serving cell</th><th>Channel</th><th>Samples</th><th>Avg SINR</th><th>Avg RSRP</th><th>Avg RSRQ</th></tr></thead><tbody>${cellRows || "<tr><td colspan=\"6\">n/a</td></tr>"}</tbody></table>
      <p>Deterministic planning estimate, not a UE or protocol measurement.</p>
    </section>`;
}

function printTable(title, rows) {
  return `<div><h2>${escapeHtml(title)}</h2><table><tbody>${rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value ?? "n/a")}</td></tr>`)
    .join("")}</tbody></table></div>`;
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "n/a";
  }
  return Number(value).toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatCompactNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "n/a";
  }
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

function markdownValue(value) {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }
  return String(value).replace(/\|/g, "\\|");
}

function escapeHtml(value) {
  return String(value ?? "n/a")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
