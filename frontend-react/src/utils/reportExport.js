import { rxPowerColor } from "./geojson.js";
import {
  renderMarkdownInterferenceSection,
  renderPrintableInterferenceSection,
} from "./interferenceReport.js";
import {
  escapeHtml,
  formatCompactNumber,
  formatNumber,
  markdownValue,
  printTable,
} from "./reportFormatting.js";
import { resolveRFProfile } from "./rfProfile.js";

const SVG_WIDTH = 720;
const SVG_HEIGHT = 460;
const SVG_PADDING = 34;

export function buildPlanningReport({
  activeNetworkTech,
  appMeta,
  buildingSummary,
  calibrationProfile,
  comparison,
  coreLab,
  coreLabApplicable,
  coreLabEnabled,
  coverageGaps,
  diagnostics,
  interferenceAnalysis,
  measurementAnalysis,
  networkOptimization,
  project,
  recommendations,
  selectedTower,
	selectedNetworkTowers = [],
  settings,
  simulation,
  stats,
}) {
  const gapStats = coverageGaps?.stats ?? null;
  const generatedAt = new Date();
  const reportId = `atom-cell-${selectedTower?.cellId ?? "unselected"}-${formatDateSlug(generatedAt)}`;
  const mapSvg = buildMapSvg({
    activeNetworkTech,
    coverageGaps: coverageGaps?.geojson,
    interference: interferenceAnalysis?.geojson,
    selectedTower,
    settings,
    simulation: simulation?.geojson,
  });
  const topGaps = getTopCoverageGaps(coverageGaps?.geojson);
  const comparisonMetrics = getComparisonMetrics(comparison);
  const comparisonBarChartSvg = buildComparisonBarChartSvg(comparison);
  const comparisonSlopeChartSvg = buildComparisonSlopeChartSvg(comparison);
	const profileTowers = selectedNetworkTowers.length ? selectedNetworkTowers : [selectedTower].filter(Boolean);
	const rfProfiles = profileTowers.map((tower, index) => ({
		cellId: tower.cellId ?? tower.id,
		...resolveRFProfile(tower, settings, index),
	}));

  return {
    activeNetworkTech,
    appMeta,
    buildingSummary,
    calibrationProfile,
    comparison,
    comparisonBarChartSvg,
    comparisonMetrics,
    comparisonSlopeChartSvg,
    coreLab,
    coreLabApplicable,
    coreLabEnabled,
    diagnostics,
    gapStats,
    interferenceAnalysis,
    measurementAnalysis,
    generatedAt,
    mapSvg,
    networkOptimization,
    project,
    recommendations,
    reportId,
    selectedTower,
		rfProfiles,
    settings,
    stats,
    topGaps,
  };
}

export function downloadMarkdownReport(report) {
  const markdown = renderMarkdownReport(report);
  downloadBlob(`${report.reportId}.md`, markdown, "text/markdown;charset=utf-8");
}

export function openPdfReport(report) {
  const reportWindow = window.open("", "_blank", "width=980,height=1100");
  if (!reportWindow) {
    throw new Error("The report window was blocked. Please allow popups for this site.");
  }

  reportWindow.document.write(renderPrintableReport(report));
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.setTimeout(() => {
    reportWindow.print();
  }, 350);
}

export function renderMarkdownReport(report) {
  const towerCoordinates = report.selectedTower?.coordinates ?? [];
  const generatedAt = report.generatedAt.toLocaleString();

  return `# A.T.O.M Planning Report

Generated: ${generatedAt}

## Decision Context

| Field | Value |
|---|---:|
| Cell ID | ${markdownValue(report.selectedTower?.cellId)} |
| Active network | ${markdownValue(report.activeNetworkTech)} |
| Tower longitude | ${formatNumber(towerCoordinates[0], 6)} |
| Tower latitude | ${formatNumber(towerCoordinates[1], 6)} |
| Azimuth | ${formatNumber(report.settings.azimuthDeg, 0)} deg |
| Beam width | ${formatNumber(report.settings.beamWidthDeg, 0)} deg |
| Radius | ${formatNumber(report.settings.radiusMeters, 0)} m |
| Ray count | ${formatNumber(report.settings.rayCount, 0)} |
| Tx power | ${formatNumber(report.settings.txPowerDbm, 1)} dBm |
| Frequency | ${formatNumber(report.settings.frequencyGHz, 1)} GHz |
| Calibration offset | ${formatNumber(report.settings.calibrationOffsetDb ?? 0, 1)} dB |

## Per-cell RF Profiles

| Cell | Technology | Band / channel | Frequency | Bandwidth | TX / gain / loss | Antenna | Patterns | Load / reuse | PCI | Receiver |
|---|---|---|---:|---:|---:|---|---|---:|---:|---|
${(report.rfProfiles ?? []).map((profile) => `| ${markdownValue(profile.cellId)} | ${markdownValue(profile.networkTech?.toUpperCase())} | ${markdownValue(`${profile.band} / ${profile.channelId}`)} | ${formatNumber(profile.frequencyGHz, 3)} GHz | ${formatNumber(profile.bandwidthMHz, 1)} MHz | ${formatNumber(profile.txPowerDbm, 1)} / ${formatNumber(profile.antennaGainDbi, 1)} / ${formatNumber(profile.systemLossDb, 1)} dB | ${formatNumber(profile.antennaHeightM, 1)} m; ${formatNumber(profile.mechanicalDowntiltDeg + profile.electricalDowntiltDeg, 1)}° tilt; ${formatNumber(profile.orientationDeg, 1)}° orient | ${markdownValue(`${profile.horizontalPatternId} / ${profile.verticalPatternId}`)} | ${formatNumber(profile.loadFactor * 100, 0)}% / ${formatNumber(profile.reuseFactor, 0)} | ${markdownValue(profile.pci)} | ${formatNumber(profile.receiverHeightM, 1)} m / ${formatNumber(profile.receiverSensitivityDbm, 1)} dBm |`).join("\n") || "| n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |"}

## Simulation KPIs

| Metric | Value |
|---|---:|
| Average Rx | ${formatNumber(report.stats.avgPower, 1)} dBm |
| Max range | ${formatNumber(report.stats.maxRange, 1)} m |
| Min range | ${formatNumber(report.stats.minRange, 1)} m |
| Blocked | ${formatNumber(report.stats.blockedRatio, 1)}% |
| Rendered ray segments | ${formatNumber(report.stats.rayCount, 0)} |
| Underserved buildings | ${formatNumber(report.gapStats?.gap_buildings, 0)} |
| Gap ratio | ${formatNumber(report.gapStats?.gap_pct, 1)}% |
| Worst Rx | ${formatNumber(report.gapStats?.worst_rx_dbm, 1)} dBm |
| Unmet demand score | ${formatCompactNumber(report.gapStats?.total_gap_demand)} |

## Demand Optimization

| Signal | Value |
|---|---:|
| Data quality | ${markdownValue(report.diagnostics?.data_quality ?? report.buildingSummary?.data_quality)} |
| POI demand hits | ${formatNumber(report.diagnostics?.hit_demand_buildings, 0)} |
| Residential hits | ${formatNumber(report.diagnostics?.hit_residential_buildings, 0)} |
| Demand score | ${formatCompactNumber(report.diagnostics?.demand_score)} |
| Residential score | ${formatCompactNumber(report.diagnostics?.residential_score)} |
| Coverage tie-break | ${formatCompactNumber(report.diagnostics?.coverage_score)} |

${renderMarkdownComparisonSection(report)}

${renderMarkdownNetworkSection(report)}

${renderMarkdownInterferenceSection(report)}

${renderMarkdownCoreLabSection(report)}

${renderMarkdownMeasurementSection(report)}

${renderMarkdownRecommendationSection(report)}

${renderMarkdownSavedScenarioSection(report)}

## Dataset Context

| Field | Value |
|---|---:|
| Total buildings | ${formatNumber(report.buildingSummary?.total_buildings, 0)} |
| POI demand buildings | ${formatNumber(report.buildingSummary?.demand_weighted_buildings, 0)} |
| Residential demand buildings | ${formatNumber(report.buildingSummary?.residential_weighted_buildings, 0)} |
| Dataset | ${markdownValue(report.appMeta?.dataset?.name)} |
| Dataset version | ${markdownValue(report.appMeta?.dataset?.version)} |
| Manifest schema | ${markdownValue(report.appMeta?.dataset?.schema_version)} |
| Sources | ${markdownValue((report.appMeta?.dataset?.sources ?? []).join(", "))} |
| Licenses | ${markdownValue((report.appMeta?.dataset?.licenses ?? []).join(", "))} |
| Confidence | ${markdownValue(report.appMeta?.dataset?.confidence)} |
| Pack QA | ${markdownValue(report.appMeta?.dataset?.quality?.summary)} |
| Requested coverage | ${report.appMeta?.dataset?.quality?.coverage?.coverage_ratio === undefined ? "n/a" : `${formatNumber(report.appMeta.dataset.quality.coverage.coverage_ratio * 100, 1)}%`} |
| Layers | ${markdownValue(Object.keys(report.appMeta?.dataset?.layers ?? {}).join(", "))} |
| Hashed files | ${formatNumber(Object.keys(report.appMeta?.dataset?.sha256 ?? {}).length, 0)} |
| Model version | ${markdownValue(report.appMeta?.model_version)} |
| Application version | ${markdownValue(report.appMeta?.application_version)} |

## Planning Map

${report.mapSvg}

## Highest Priority Coverage Gaps

${renderMarkdownGapTable(report.topGaps)}

## Planning Note

This report is generated from local A.T.O.M simulation state. Results are deterministic planning estimates, not UE, drive-test, or PHY measurements. Any applied correction is a global path-loss bias and not full propagation calibration.
`;
}

function renderPrintableReport(report) {
  const title = `A.T.O.M Planning Report - Cell ${escapeHtml(report.selectedTower?.cellId ?? "unselected")}`;
  const towerCoordinates = report.selectedTower?.coordinates ?? [];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      color: #14201c;
      background: #eef3f1;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      padding: 28px;
      background: #eef3f1;
    }
    main {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d7e1dc;
      border-radius: 10px;
      overflow: hidden;
    }
    header {
      display: grid;
      gap: 10px;
      padding: 28px;
      border-bottom: 1px solid #d7e1dc;
      background: #f8fbfa;
    }
    h1, h2 {
      margin: 0;
      color: #14201c;
      line-height: 1.1;
    }
    h1 {
      font-size: 2rem;
    }
    h2 {
      margin-bottom: 12px;
      font-size: 1rem;
      text-transform: uppercase;
    }
    p {
      margin: 0;
      color: #52615a;
      line-height: 1.55;
    }
    section {
      padding: 22px 28px;
      border-bottom: 1px solid #e5ece8;
    }
    section:last-child {
      border-bottom: 0;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .metric {
      display: grid;
      gap: 4px;
      padding: 10px;
      border: 1px solid #d7e1dc;
      border-radius: 8px;
      background: #fbfdfc;
    }
    .metric span,
    th {
      color: #728078;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
    }
    .metric strong {
      color: #14201c;
      font-size: 1rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #d7e1dc;
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 9px 10px;
      border-bottom: 1px solid #e5ece8;
      text-align: left;
      vertical-align: top;
    }
    td:last-child {
      text-align: right;
      font-weight: 750;
    }
    tr:last-child th,
    tr:last-child td {
      border-bottom: 0;
    }
    .map-wrap {
      border: 1px solid #d7e1dc;
      border-radius: 8px;
      overflow: hidden;
      background: #e8eef1;
    }
    .map-wrap svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .chart-wrap {
      display: grid;
      gap: 14px;
    }
    .chart-wrap svg {
      display: block;
      width: 100%;
      height: auto;
      border: 1px solid #d7e1dc;
      border-radius: 8px;
      background: #ffffff;
    }
    .actions {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 28px;
      border-bottom: 1px solid #d7e1dc;
      background: rgba(255, 255, 255, 0.94);
    }
    .actions button {
      min-height: 38px;
      padding: 0 14px;
      border: 0;
      border-radius: 8px;
      color: #ffffff;
      background: #0f766e;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      main {
        max-width: none;
        border: 0;
        border-radius: 0;
      }
      .actions {
        display: none;
      }
      section {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="actions">
      <button type="button" onclick="window.print()">Save as PDF</button>
    </div>
    <header>
      <h1>A.T.O.M Planning Report</h1>
      <p>Ankara Telecom Optimization Model export for selected tower planning, stakeholder review, and municipal decision support.</p>
      <div class="meta">
        ${printMetric("Cell", report.selectedTower?.cellId)}
        ${printMetric("Network", report.activeNetworkTech)}
        ${printMetric("Azimuth", `${formatNumber(report.settings.azimuthDeg, 0)} deg`)}
        ${printMetric("Generated", report.generatedAt.toLocaleString())}
      </div>
    </header>
    <section>
      <h2>Planning Map</h2>
      <div class="map-wrap">${report.mapSvg}</div>
    </section>
    ${printComparisonSection(report)}
    ${printNetworkSection(report)}
    ${printRFProfileSection(report)}
    ${renderPrintableInterferenceSection(report)}
    ${printCoreLabSection(report)}
    ${printMeasurementSection(report)}
    ${printRecommendationSection(report)}
    ${printSavedScenarioSection(report)}
    <section class="grid">
      ${printTable("Decision Context", [
        ["Longitude", formatNumber(towerCoordinates[0], 6)],
        ["Latitude", formatNumber(towerCoordinates[1], 6)],
        ["Frequency", `${formatNumber(report.settings.frequencyGHz, 1)} GHz`],
        ["Tx power", `${formatNumber(report.settings.txPowerDbm, 1)} dBm`],
        ["Radius", `${formatNumber(report.settings.radiusMeters, 0)} m`],
        ["Beam width", `${formatNumber(report.settings.beamWidthDeg, 0)} deg`],
        ["Ray count", formatNumber(report.settings.rayCount, 0)],
        ["Calibration offset", `${formatNumber(report.settings.calibrationOffsetDb ?? 0, 1)} dB`],
      ])}
      ${printTable("Simulation KPIs", [
        ["Average Rx", `${formatNumber(report.stats.avgPower, 1)} dBm`],
        ["Max range", `${formatNumber(report.stats.maxRange, 1)} m`],
        ["Min range", `${formatNumber(report.stats.minRange, 1)} m`],
        ["Blocked", `${formatNumber(report.stats.blockedRatio, 1)}%`],
        ["Underserved buildings", formatNumber(report.gapStats?.gap_buildings, 0)],
        ["Gap ratio", `${formatNumber(report.gapStats?.gap_pct, 1)}%`],
      ])}
    </section>
    <section class="grid">
      ${printTable("Demand Hits", [
        ["Data quality", report.diagnostics?.data_quality ?? report.buildingSummary?.data_quality ?? "n/a"],
        ["POI hits", formatNumber(report.diagnostics?.hit_demand_buildings, 0)],
        ["Residential hits", formatNumber(report.diagnostics?.hit_residential_buildings, 0)],
        ["Demand score", formatCompactNumber(report.diagnostics?.demand_score)],
        ["Residential score", formatCompactNumber(report.diagnostics?.residential_score)],
        ["Coverage tie-break", formatCompactNumber(report.diagnostics?.coverage_score)],
      ])}
      ${printTable("Dataset Context", [
        ["Total buildings", formatNumber(report.buildingSummary?.total_buildings, 0)],
        ["POI demand buildings", formatNumber(report.buildingSummary?.demand_weighted_buildings, 0)],
        ["Residential demand buildings", formatNumber(report.buildingSummary?.residential_weighted_buildings, 0)],
        ["Worst Rx", `${formatNumber(report.gapStats?.worst_rx_dbm, 1)} dBm`],
        ["Unmet demand score", formatCompactNumber(report.gapStats?.total_gap_demand)],
        ["Dataset", report.appMeta?.dataset?.name ?? "n/a"],
        ["Dataset version", report.appMeta?.dataset?.version ?? "n/a"],
        ["Manifest schema", report.appMeta?.dataset?.schema_version ?? "n/a"],
        ["Sources", (report.appMeta?.dataset?.sources ?? []).join(", ") || "n/a"],
        ["Licenses", (report.appMeta?.dataset?.licenses ?? []).join(", ") || "n/a"],
        ["Confidence", report.appMeta?.dataset?.confidence ?? "n/a"],
        ["Pack QA", report.appMeta?.dataset?.quality?.summary ?? "n/a"],
        ["Requested coverage", report.appMeta?.dataset?.quality?.coverage?.coverage_ratio === undefined ? "n/a" : `${formatNumber(report.appMeta.dataset.quality.coverage.coverage_ratio * 100, 1)}%`],
        ["Layers", Object.keys(report.appMeta?.dataset?.layers ?? {}).join(", ") || "n/a"],
        ["Hashed files", formatNumber(Object.keys(report.appMeta?.dataset?.sha256 ?? {}).length, 0)],
        ["Model version", report.appMeta?.model_version ?? "n/a"],
      ])}
    </section>
    <section>
      <h2>Highest Priority Coverage Gaps</h2>
      ${printGapTable(report.topGaps)}
    </section>
  </main>
</body>
</html>`;
}

function printRFProfileSection(report) {
  const profiles = report.rfProfiles ?? [];
  if (!profiles.length) return "";
  return `<section>
    <h2>Per-cell RF Profiles</h2>
    <table>
      <thead><tr><th>Cell</th><th>Radio</th><th>RF</th><th>Antenna</th><th>Planning</th></tr></thead>
      <tbody>${profiles.map((profile) => `<tr>
        <td>${escapeHtml(profile.cellId)}</td>
        <td>${escapeHtml(`${profile.networkTech.toUpperCase()} · ${profile.band} · ${profile.channelId} · ${profile.duplexMode.toUpperCase()}`)}</td>
        <td>${escapeHtml(`${formatNumber(profile.frequencyGHz, 3)} GHz · ${formatNumber(profile.bandwidthMHz, 1)} MHz · ${formatNumber(profile.txPowerDbm, 1)} dBm TX · ${formatNumber(profile.antennaGainDbi, 1)} dBi · ${formatNumber(profile.systemLossDb, 1)} dB loss`)}</td>
        <td>${escapeHtml(`${formatNumber(profile.antennaHeightM, 1)} m · ${formatNumber(profile.mechanicalDowntiltDeg, 1)}° mechanical · ${formatNumber(profile.electricalDowntiltDeg, 1)}° electrical · ${formatNumber(profile.orientationDeg, 1)}° orientation · ${profile.horizontalPatternId}/${profile.verticalPatternId}`)}</td>
        <td>${escapeHtml(`${formatNumber(profile.radiusMeters, 0)} m radius · ${formatNumber(profile.beamWidthDeg, 0)}° beam · ${formatNumber(profile.loadFactor * 100, 0)}% load · reuse ${profile.reuseFactor} · PCI ${profile.pci ?? "n/a"} · UE ${formatNumber(profile.receiverHeightM, 1)} m/${formatNumber(profile.receiverSensitivityDbm, 1)} dBm`)}</td>
      </tr>`).join("")}</tbody>
    </table>
  </section>`;
}

function buildMapSvg({ activeNetworkTech, coverageGaps, interference, selectedTower, settings, simulation }) {
  const lineFeatures = (simulation?.features ?? []).filter(
    (feature) => feature.geometry?.type === "LineString" && feature.geometry.coordinates?.length >= 2,
  );
  const gapFeatures = (coverageGaps?.features ?? []).filter((feature) => feature.geometry?.type === "Point");
  const interferenceFeatures = (interference?.features ?? [])
    .filter((feature) => feature.geometry?.type === "Point")
    .filter((_, index, features) => index % Math.max(1, Math.ceil(features.length / 600)) === 0);
  const towerCoordinates = selectedTower?.coordinates;
  const allCoordinates = [];

  if (Array.isArray(towerCoordinates)) {
    allCoordinates.push(towerCoordinates);
  }
  lineFeatures.forEach((feature) => {
    feature.geometry.coordinates.forEach((coordinate) => allCoordinates.push(coordinate));
  });
  gapFeatures.forEach((feature) => {
    allCoordinates.push(feature.geometry.coordinates);
  });
  interferenceFeatures.forEach((feature) => allCoordinates.push(feature.geometry.coordinates));

  const bounds = getCoordinateBounds(allCoordinates, towerCoordinates);
  const project = ([lon, lat]) => {
    const x =
      SVG_PADDING +
      ((lon - bounds.minLon) / Math.max(bounds.maxLon - bounds.minLon, 0.000001)) *
        (SVG_WIDTH - SVG_PADDING * 2);
    const y =
      SVG_HEIGHT -
      SVG_PADDING -
      ((lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.000001)) *
        (SVG_HEIGHT - SVG_PADDING * 2);
    return [x, y];
  };

  const paths = lineFeatures
    .map((feature) => {
      const points = feature.geometry.coordinates.map(project);
      const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
      const signal = Number(feature.properties?.signal_dbm ?? -120);
      return `<path d="${path}" fill="none" stroke="${rxPowerColor(signal)}" stroke-width="4" stroke-linecap="round" opacity="0.78" />`;
    })
    .join("\n");

  const gaps = gapFeatures
    .slice(0, 260)
    .map((feature) => {
      const [x, y] = project(feature.geometry.coordinates);
      const isOutage = feature.properties?.severity === "outage";
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isOutage ? 4.6 : 4}" fill="${isOutage ? "#e11d48" : "#f59e0b"}" stroke="${isOutage ? "#881337" : "#92400e"}" stroke-width="1.4" opacity="0.82" />`;
    })
    .join("\n");

  const interferencePoints = interferenceFeatures
    .map((feature) => {
      const [x, y] = project(feature.geometry.coordinates);
      const rawSINR = feature.properties?.sinr_db;
      const sinr = rawSINR === null || rawSINR === undefined ? Number.NaN : Number(rawSINR);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${interferenceReportColor(sinr)}" opacity="0.5" />`;
    })
    .join("\n");

  const [towerX, towerY] = Array.isArray(towerCoordinates) ? project(towerCoordinates) : [SVG_WIDTH / 2, SVG_HEIGHT / 2];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="A.T.O.M RF planning map export">
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#e8eef1" />
  <path d="M 0 ${SVG_HEIGHT * 0.28} C ${SVG_WIDTH * 0.24} ${SVG_HEIGHT * 0.2}, ${SVG_WIDTH * 0.5} ${SVG_HEIGHT * 0.36}, ${SVG_WIDTH} ${SVG_HEIGHT * 0.24}" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.76" />
  <path d="M ${SVG_WIDTH * 0.18} 0 C ${SVG_WIDTH * 0.24} ${SVG_HEIGHT * 0.3}, ${SVG_WIDTH * 0.14} ${SVG_HEIGHT * 0.56}, ${SVG_WIDTH * 0.22} ${SVG_HEIGHT}" fill="none" stroke="#ffffff" stroke-width="14" opacity="0.7" />
  <g opacity="0.36" stroke="#9fb0a9" stroke-width="1">
    ${Array.from({ length: 8 }, (_, index) => `<line x1="${SVG_PADDING}" y1="${SVG_PADDING + index * 54}" x2="${SVG_WIDTH - SVG_PADDING}" y2="${SVG_PADDING + index * 54}" />`).join("")}
    ${Array.from({ length: 11 }, (_, index) => `<line x1="${SVG_PADDING + index * 64}" y1="${SVG_PADDING}" x2="${SVG_PADDING + index * 64}" y2="${SVG_HEIGHT - SVG_PADDING}" />`).join("")}
  </g>
  <g>${interferencePoints}</g>
  <g>${paths}</g>
  <g>${gaps}</g>
  <g>
    <circle cx="${towerX.toFixed(1)}" cy="${towerY.toFixed(1)}" r="10" fill="#ffffff" stroke="#0b4f49" stroke-width="4" />
    <circle cx="${towerX.toFixed(1)}" cy="${towerY.toFixed(1)}" r="4" fill="#0f766e" />
  </g>
  <g transform="translate(18 18)">
    <rect width="310" height="66" rx="8" fill="rgba(255,255,255,0.92)" stroke="#d7e1dc" />
    <text x="14" y="25" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="#14201c">Cell ${escapeSvgText(selectedTower?.cellId ?? "unselected")} · ${escapeSvgText(activeNetworkTech ?? "Network")}</text>
    <text x="14" y="47" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="#52615a">Azimuth ${formatNumber(settings.azimuthDeg, 0)}° · Beam ${formatNumber(settings.beamWidthDeg, 0)}° · Radius ${formatNumber(settings.radiusMeters, 0)} m</text>
  </g>
  <g transform="translate(${SVG_WIDTH - 204} ${SVG_HEIGHT - 70})">
    <rect width="186" height="52" rx="8" fill="rgba(255,255,255,0.9)" stroke="#d7e1dc" />
    <circle cx="18" cy="18" r="5" fill="#10b981" /><text x="31" y="22" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#52615a">strong</text>
    <circle cx="82" cy="18" r="5" fill="#f59e0b" /><text x="95" y="22" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#52615a">medium</text>
    <circle cx="18" cy="37" r="5" fill="#e11d48" /><text x="31" y="41" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#52615a">weak / gap</text>
  </g>
</svg>`;
}

function getCoordinateBounds(coordinates, fallbackCoordinate) {
  const validCoordinates = coordinates.filter(
    (coordinate) => Number.isFinite(coordinate?.[0]) && Number.isFinite(coordinate?.[1]),
  );
  if (validCoordinates.length === 0 && Array.isArray(fallbackCoordinate)) {
    validCoordinates.push(fallbackCoordinate);
  }
  if (validCoordinates.length === 0) {
    validCoordinates.push([32.8541, 39.9208]);
  }

  let minLon = Math.min(...validCoordinates.map((coordinate) => coordinate[0]));
  let maxLon = Math.max(...validCoordinates.map((coordinate) => coordinate[0]));
  let minLat = Math.min(...validCoordinates.map((coordinate) => coordinate[1]));
  let maxLat = Math.max(...validCoordinates.map((coordinate) => coordinate[1]));
  const lonPad = Math.max((maxLon - minLon) * 0.12, 0.0012);
  const latPad = Math.max((maxLat - minLat) * 0.12, 0.0012);
  minLon -= lonPad;
  maxLon += lonPad;
  minLat -= latPad;
  maxLat += latPad;
  return { minLon, maxLon, minLat, maxLat };
}

function interferenceReportColor(sinr) {
  if (!Number.isFinite(sinr)) return "#64748b";
  if (sinr < 0) return "#be123c";
  if (sinr < 13) return "#d97706";
  if (sinr < 20) return "#2563eb";
  return "#0f766e";
}

function getTopCoverageGaps(geojson) {
  return [...(geojson?.features ?? [])]
    .map((feature) => {
      const properties = feature.properties ?? {};
      const coordinates = feature.geometry?.coordinates ?? [];
      return {
        demand: Number(properties.total_demand ?? 0),
        id: properties.building_id ?? "n/a",
        lat: coordinates[1],
        lon: coordinates[0],
        reason: properties.reason ?? "demand",
        rx: Number(properties.rx_dbm),
        severity: properties.severity ?? "weak",
      };
    })
    .filter((gap) => Number.isFinite(gap.lon) && Number.isFinite(gap.lat))
    .sort((left, right) => right.demand - left.demand)
    .slice(0, 8);
}

function renderMarkdownGapTable(gaps) {
  if (gaps.length === 0) {
    return "No coverage gaps were returned for the current simulation.";
  }

  const rows = gaps.map(
    (gap) =>
      `| ${markdownValue(gap.id)} | ${markdownValue(gap.severity)} | ${formatNumber(gap.rx, 1)} dBm | ${formatNumber(gap.demand, 1)} | ${markdownValue(gap.reason)} | ${formatNumber(gap.lon, 6)}, ${formatNumber(gap.lat, 6)} |`,
  );
  return `| Building | Severity | Rx | Demand | Reason | Coordinate |
|---|---|---:|---:|---|---:|
${rows.join("\n")}`;
}

export function getComparisonMetrics(comparison) {
  const before = comparison?.before?.stats;
  const after = comparison?.after?.stats;
  if (!before || !after) {
    return [];
  }

  if (comparison?.kind === "network") {
    return [
      createComparisonMetric({
        after: after.networkScore,
        before: before.networkScore,
        compact: true,
        digits: 1,
        higherIsBetter: true,
        key: "networkScore",
        label: "Network score",
        unit: "score",
      }),
      createComparisonMetric({
        after: after.uniqueDemandBuildings,
        before: before.uniqueDemandBuildings,
        digits: 0,
        higherIsBetter: true,
        key: "uniqueDemandBuildings",
        label: "Unique POI",
        unit: "buildings",
      }),
      createComparisonMetric({
        after: after.uniqueResidentialBuildings,
        before: before.uniqueResidentialBuildings,
        digits: 0,
        higherIsBetter: true,
        key: "uniqueResidentialBuildings",
        label: "Unique residential",
        unit: "buildings",
      }),
      createComparisonMetric({
        after: after.overlapBuildings,
        before: before.overlapBuildings,
        digits: 0,
        higherIsBetter: false,
        key: "overlapBuildings",
        label: "Overlap",
        unit: "buildings",
      }),
      createComparisonMetric({
        after: after.overlapPenalty,
        before: before.overlapPenalty,
        compact: true,
        digits: 1,
        higherIsBetter: false,
        key: "overlapPenalty",
        label: "Overlap penalty",
        unit: "score",
      }),
    ].filter(Boolean);
  }

  return [
    createComparisonMetric({
      after: after.avgPower,
      before: before.avgPower,
      digits: 1,
      higherIsBetter: true,
      key: "avgPower",
      label: "Avg Rx",
      unit: "dBm",
    }),
    createComparisonMetric({
      after: after.maxRange,
      before: before.maxRange,
      digits: 1,
      higherIsBetter: true,
      key: "maxRange",
      label: "Max range",
      unit: "m",
    }),
    createComparisonMetric({
      after: after.gapBuildings,
      before: before.gapBuildings,
      digits: 0,
      higherIsBetter: false,
      key: "gapBuildings",
      label: "Underserved",
      unit: "buildings",
    }),
    createComparisonMetric({
      after: after.gapRatio,
      before: before.gapRatio,
      digits: 1,
      higherIsBetter: false,
      key: "gapRatio",
      label: "Gap ratio",
      unit: "%",
    }),
    createComparisonMetric({
      after: after.totalGapDemand,
      before: before.totalGapDemand,
      compact: true,
      digits: 1,
      higherIsBetter: false,
      key: "totalGapDemand",
      label: "Unmet demand",
      unit: "score",
    }),
  ].filter(Boolean);
}

export function buildComparisonBarChartSvg(comparison) {
  const metrics = getComparisonMetrics(comparison);
  if (metrics.length === 0) {
    return "";
  }

  const width = 720;
  const height = 300;
  const margin = { bottom: 58, left: 34, right: 24, top: 54 };
  const plotHeight = height - margin.top - margin.bottom;
  const panelWidth = (width - margin.left - margin.right) / metrics.length;
  const beforeColor = "#64748b";
  const afterColor = "#0f766e";

  const panels = metrics
    .map((metric, index) => {
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
      return `<g>
        <line x1="${x + 8}" y1="${baseline}" x2="${x + panelWidth - 8}" y2="${baseline}" stroke="#d7e1dc" />
        <rect x="${beforeX.toFixed(1)}" y="${(baseline - beforeHeight).toFixed(1)}" width="${barWidth}" height="${beforeHeight.toFixed(1)}" rx="4" fill="${beforeColor}" opacity="0.86" />
        <rect x="${afterX.toFixed(1)}" y="${(baseline - afterHeight).toFixed(1)}" width="${barWidth}" height="${afterHeight.toFixed(1)}" rx="4" fill="${afterColor}" opacity="0.92" />
        <text x="${(beforeX + barWidth / 2).toFixed(1)}" y="${(baseline - beforeHeight - 7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#475569">${escapeSvgText(formatMetricValue(metric, metric.before))}</text>
        <text x="${(afterX + barWidth / 2).toFixed(1)}" y="${(baseline - afterHeight - 7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#0b4f49">${escapeSvgText(formatMetricValue(metric, metric.after))}</text>
        <text x="${(x + panelWidth / 2).toFixed(1)}" y="${height - 30}" text-anchor="middle" font-size="12" font-weight="850" fill="#14201c">${escapeSvgText(metric.label)}</text>
        <text x="${(x + panelWidth / 2).toFixed(1)}" y="${height - 13}" text-anchor="middle" font-size="10" font-weight="700" fill="${metric.status === "improved" ? "#0f766e" : metric.status === "regressed" ? "#be123c" : "#64748b"}">${escapeSvgText(metric.deltaLabel)}</text>
      </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Before and after optimization grouped bar chart">
    <rect width="${width}" height="${height}" rx="8" fill="#ffffff" />
    <text x="24" y="30" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="850" fill="#14201c">KPI comparison</text>
    <circle cx="${width - 170}" cy="25" r="5" fill="${beforeColor}" /><text x="${width - 158}" y="29" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#52615a">Before</text>
    <circle cx="${width - 92}" cy="25" r="5" fill="${afterColor}" /><text x="${width - 80}" y="29" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#52615a">After</text>
    <g font-family="Inter, Arial, sans-serif">${panels}</g>
  </svg>`;
}

export function buildComparisonSlopeChartSvg(comparison) {
  const metrics = getComparisonMetrics(comparison);
  if (metrics.length === 0) {
    return "";
  }

  const width = 720;
  const rowHeight = 48;
  const height = 78 + metrics.length * rowHeight;
  const beforeX = 230;
  const afterX = 520;
  const top = 56;
  const rows = metrics
    .map((metric, index) => {
      const rowTop = top + index * rowHeight;
      const values = [metric.before, metric.after];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(max - min, 1);
      const beforeY = rowTop + 32 - ((metric.before - min) / range) * 24;
      const afterY = rowTop + 32 - ((metric.after - min) / range) * 24;
      const color =
        metric.status === "improved" ? "#0f766e" : metric.status === "regressed" ? "#be123c" : "#64748b";
      return `<g>
        <text x="24" y="${rowTop + 23}" font-size="12" font-weight="850" fill="#14201c">${escapeSvgText(metric.label)}</text>
        <line x1="${beforeX}" y1="${beforeY.toFixed(1)}" x2="${afterX}" y2="${afterY.toFixed(1)}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.86" />
        <circle cx="${beforeX}" cy="${beforeY.toFixed(1)}" r="5" fill="#ffffff" stroke="#64748b" stroke-width="3" />
        <circle cx="${afterX}" cy="${afterY.toFixed(1)}" r="5" fill="#ffffff" stroke="${color}" stroke-width="3" />
        <text x="${beforeX}" y="${rowTop + 44}" text-anchor="middle" font-size="10" font-weight="800" fill="#52615a">${escapeSvgText(formatMetricValue(metric, metric.before))}</text>
        <text x="${afterX}" y="${rowTop + 44}" text-anchor="middle" font-size="10" font-weight="800" fill="${color}">${escapeSvgText(formatMetricValue(metric, metric.after))}</text>
        <text x="${width - 24}" y="${rowTop + 23}" text-anchor="end" font-size="11" font-weight="850" fill="${color}">${escapeSvgText(metric.deltaLabel)}</text>
      </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Before and after optimization slope chart">
    <rect width="${width}" height="${height}" rx="8" fill="#ffffff" />
    <text x="24" y="30" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="850" fill="#14201c">Optimization movement</text>
    <text x="${beforeX}" y="31" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="850" fill="#64748b">Before</text>
    <text x="${afterX}" y="31" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="850" fill="#0f766e">After</text>
    <g font-family="Inter, Arial, sans-serif">${rows}</g>
  </svg>`;
}

function renderMarkdownComparisonSection(report) {
  if (!report.comparisonMetrics?.length) {
    return "";
  }

  const title = report.comparison?.kind === "network"
    ? "Network Before/After Optimization Results"
    : "Before/After Optimization Results";

  return `## ${title}

${renderMarkdownComparisonTable(report.comparisonMetrics)}

${report.comparisonBarChartSvg}

${report.comparisonSlopeChartSvg}
`;
}

function renderMarkdownComparisonTable(metrics) {
  const rows = metrics.map(
    (metric) =>
      `| ${markdownValue(metric.label)} | ${markdownValue(formatMetricValue(metric, metric.before))} | ${markdownValue(formatMetricValue(metric, metric.after))} | ${markdownValue(metric.deltaLabel)} |`,
  );
  return `| Metric | Before | After | Change |
|---|---:|---:|---:|
${rows.join("\n")}`;
}

function printComparisonSection(report) {
  if (!report.comparisonMetrics?.length) {
    return "";
  }
  const title = report.comparison?.kind === "network"
    ? "Network Before/After Optimization Results"
    : "Before/After Optimization Results";

  return `<section>
      <h2>${escapeHtml(title)}</h2>
      <div class="chart-wrap">
        ${report.comparisonBarChartSvg}
        ${report.comparisonSlopeChartSvg}
      </div>
      ${printComparisonTable(report.comparisonMetrics)}
    </section>`;
}

function printComparisonTable(metrics) {
  return `<table><thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>${metrics
    .map(
      (metric) =>
        `<tr><td>${escapeHtml(metric.label)}</td><td>${escapeHtml(formatMetricValue(metric, metric.before))}</td><td>${escapeHtml(formatMetricValue(metric, metric.after))}</td><td>${escapeHtml(metric.deltaLabel)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function renderMarkdownNetworkSection(report) {
  const optimization = report.networkOptimization;
  if (!optimization?.stats) {
    return "";
  }
  const stats = optimization.stats;
  const towerRows = (optimization.optimized_towers ?? []).map(
    (tower) =>
      `| ${markdownValue(tower.id)} | ${formatNumber(tower.optimal_azimuth, 0)} deg | ${formatCompactNumber(tower.score)} |`,
  );
  return `## Multi-Tower Network Optimization

| Metric | Value |
|---|---:|
| Network score | ${formatCompactNumber(stats.network_score)} |
| Unique POI buildings | ${formatNumber(stats.unique_demand_buildings, 0)} |
| Unique residential buildings | ${formatNumber(stats.unique_residential_buildings, 0)} |
| Overlap buildings | ${formatNumber(stats.overlap_buildings, 0)} |
| Demand score | ${formatCompactNumber(stats.demand_score)} |
| Residential score | ${formatCompactNumber(stats.residential_score)} |
| Coverage score | ${formatCompactNumber(stats.coverage_score)} |
| Overlap penalty | ${formatCompactNumber(stats.overlap_penalty)} |
| Data quality | ${markdownValue(stats.data_quality)} |

| Cell | Optimized azimuth | Network score |
|---|---:|---:|
${towerRows.join("\n")}
`;
}

function printNetworkSection(report) {
  const optimization = report.networkOptimization;
  if (!optimization?.stats) {
    return "";
  }
  const stats = optimization.stats;
  const towerRows = (optimization.optimized_towers ?? [])
    .map(
      (tower) =>
        `<tr><td>${escapeHtml(tower.id)}</td><td>${formatNumber(tower.optimal_azimuth, 0)} deg</td><td>${formatCompactNumber(tower.score)}</td></tr>`,
    )
    .join("");
  return `<section class="grid">
      ${printTable("Network Optimization", [
        ["Network score", formatCompactNumber(stats.network_score)],
        ["Unique POI buildings", formatNumber(stats.unique_demand_buildings, 0)],
        ["Unique residential buildings", formatNumber(stats.unique_residential_buildings, 0)],
        ["Overlap buildings", formatNumber(stats.overlap_buildings, 0)],
        ["Overlap penalty", formatCompactNumber(stats.overlap_penalty)],
        ["Data quality", stats.data_quality ?? "n/a"],
      ])}
      <div>
        <h2>Optimized Sectors</h2>
        <table><thead><tr><th>Cell</th><th>Azimuth</th><th>Score</th></tr></thead><tbody>${towerRows}</tbody></table>
      </div>
    </section>`;
}

function renderMarkdownCoreLabSection(report) {
  const status = report.coreLab?.status;
  if (!report.coreLabEnabled || !report.coreLabApplicable || !status) {
    return "";
  }
  const functions = status.functions ?? [];
  const sessions = report.coreLab?.sessions?.sessions ?? [];
  const events = report.coreLab?.events?.events ?? [];
  const pathSummary = getCommunicationPathSummary(report.coreLab);
  const functionRows = functions.map(
    (fn) =>
      `| ${markdownValue(fn.name)} | ${markdownValue(fn.status)} | ${formatNumber(fn.latency_ms, 0)} ms | ${formatNumber(fn.load_pct, 0)}% | ${markdownValue(fn.message)} |`,
  );
  const eventRows = events.slice(0, 8).map(
    (event) =>
      `| ${markdownValue(event.stage)} | ${markdownValue(event.severity)} | ${markdownValue(event.source)} | ${markdownValue(event.message)} |`,
  );
  return `## Communication Path

| Field | Value |
|---|---:|
| Mode | ${markdownValue(status.mode)} |
| State | ${markdownValue(status.state)} |
| Source | ${markdownValue(status.source)} |
| Scenario | ${markdownValue(status.scenario ?? report.coreLab?.scenario)} |
| Selected cells | ${markdownValue(pathSummary.selectedCells)} |
| Xn availability | ${markdownValue(pathSummary.xnAvailability)} |
| Fallback route | ${markdownValue(pathSummary.fallbackRoute)} |
| Affected interfaces | ${markdownValue(pathSummary.affectedInterfaces)} |
| Session count | ${formatNumber(sessions.length, 0)} |

| Function | Status | Latency | Load | Message |
|---|---|---:|---:|---|
${functionRows.join("\n") || "| n/a | n/a | n/a | n/a | n/a |"}

| Stage | Severity | Source | Message |
|---|---|---|---|
${eventRows.join("\n") || "| n/a | n/a | n/a | n/a |"}
`;
}

function printCoreLabSection(report) {
  const status = report.coreLab?.status;
  if (!report.coreLabEnabled || !report.coreLabApplicable || !status) {
    return "";
  }
  const functions = status.functions ?? [];
  const events = report.coreLab?.events?.events ?? [];
  const pathSummary = getCommunicationPathSummary(report.coreLab);
  const functionRows = functions
    .map(
      (fn) =>
        `<tr><td>${escapeHtml(fn.name)}</td><td>${escapeHtml(fn.status)}</td><td>${formatNumber(fn.latency_ms, 0)} ms</td><td>${formatNumber(fn.load_pct, 0)}%</td></tr>`,
    )
    .join("");
  const eventRows = events
    .slice(0, 8)
    .map(
      (event) =>
        `<tr><td>${escapeHtml(event.stage)}</td><td>${escapeHtml(event.severity)}</td><td>${escapeHtml(event.source)}</td><td>${escapeHtml(event.message)}</td></tr>`,
    )
    .join("");
  return `<section>
      <h2>Communication Path</h2>
      <div class="grid">
        ${printTable("5G Communication Path", [
          ["Mode", status.mode ?? "n/a"],
          ["State", status.state ?? "n/a"],
          ["Source", status.source ?? "n/a"],
          ["Scenario", status.scenario ?? report.coreLab?.scenario ?? "n/a"],
          ["Selected cells", pathSummary.selectedCells],
          ["Xn availability", pathSummary.xnAvailability],
          ["Fallback route", pathSummary.fallbackRoute],
          ["Affected interfaces", pathSummary.affectedInterfaces],
          ["Sessions", formatNumber(report.coreLab?.sessions?.sessions?.length, 0)],
        ])}
        <div>
          <h2>Core Functions</h2>
          <table><thead><tr><th>Function</th><th>Status</th><th>Latency</th><th>Load</th></tr></thead><tbody>${functionRows || "<tr><td>n/a</td><td>n/a</td><td>n/a</td><td>n/a</td></tr>"}</tbody></table>
        </div>
      </div>
      <h2 style="margin-top:16px">Recent Core Events</h2>
      <table><thead><tr><th>Stage</th><th>Severity</th><th>Source</th><th>Message</th></tr></thead><tbody>${eventRows || "<tr><td>n/a</td><td>n/a</td><td>n/a</td><td>n/a</td></tr>"}</tbody></table>
    </section>`;
}

function getCommunicationPathSummary(coreLab) {
  const topology = coreLab?.topology ?? {};
  const nodes = topology.nodes ?? [];
  const edges = topology.edges ?? [];
  const routeDecisions = topology.route_decisions ?? [];
  const selectedCells = nodes
    .filter((node) => node.type === "gNB")
    .map((node) => node.id)
    .join(", ");
  const directRoutes = routeDecisions.filter((route) => route.route_type === "direct_xn");
  const fallbackRoutes = routeDecisions.filter((route) => route.route_type === "ng_fallback");
  const affectedInterfaces = [...new Set(edges
    .filter((edge) => edge.status === "degraded" || edge.status === "down" || edge.route_type === "ng_fallback")
    .map((edge) => edge.interface)
    .filter(Boolean))]
    .join(", ");
  return {
    affectedInterfaces: affectedInterfaces || "none",
    fallbackRoute: fallbackRoutes.length > 0 ? "AMF/N2 fallback active" : "none",
    selectedCells: selectedCells || "n/a",
    xnAvailability:
      routeDecisions.length === 0
        ? "n/a"
        : fallbackRoutes.length > 0
          ? `${fallbackRoutes.length} fallback, ${directRoutes.length} direct`
          : `${directRoutes.length} direct Xn`,
  };
}

function createComparisonMetric({ after, before, compact = false, digits, higherIsBetter, key, label, unit }) {
  const beforeNumber = Number(before);
  const afterNumber = Number(after);
  if (!Number.isFinite(beforeNumber) || !Number.isFinite(afterNumber)) {
    return null;
  }
  const delta = afterNumber - beforeNumber;
  const scoreDelta = higherIsBetter ? delta : -delta;
  const status = Math.abs(delta) < 0.000001 ? "flat" : scoreDelta > 0 ? "improved" : "regressed";
  return {
    after: afterNumber,
    before: beforeNumber,
    compact,
    delta,
    deltaLabel: formatMetricDelta({ compact, delta, digits, unit }),
    digits,
    higherIsBetter,
    improved: status === "improved",
    key,
    label,
    status,
    unit,
  };
}

function formatMetricValue(metric, value) {
  if (metric.compact) {
    return formatCompactNumber(value);
  }
  const formatted = formatNumber(value, metric.digits);
  if (metric.unit === "%") {
    return `${formatted}%`;
  }
  return metric.unit ? `${formatted} ${metric.unit}` : formatted;
}

function formatMetricDelta({ compact, delta, digits, unit }) {
  const prefix = delta > 0 ? "+" : "";
  if (compact) {
    return `${prefix}${formatCompactNumber(delta)}`;
  }
  const formatted = formatNumber(delta, digits);
  if (unit === "%") {
    return `${prefix}${formatted}%`;
  }
  return unit ? `${prefix}${formatted} ${unit}` : `${prefix}${formatted}`;
}

function renderMarkdownMeasurementSection(report) {
  const stats = report.measurementAnalysis?.stats;
  if (!stats) return "";
  const calibration = report.measurementAnalysis?.calibration ?? {};
  return `## Measurement Validation

| Metric | Value |
|---|---:|
| Imported samples | ${formatNumber(stats.sample_count, 0)} |
| Valid samples | ${formatNumber(stats.valid_sample_count, 0)} |
| No signal | ${formatNumber(stats.no_signal_count, 0)} |
| Cell mismatch | ${formatNumber(stats.cell_mismatch_count, 0)} |
| MAE | ${formatNumber(stats.mae_db, 1)} dB |
| RMSE | ${formatNumber(stats.rmse_db, 1)} dB |
| Median bias | ${formatNumber(stats.median_bias_db, 1)} dB |
| Suggested total offset | ${formatNumber(calibration.recommended_total_offset_db, 1)} dB |
| Holdout MAE before | ${formatNumber(calibration.holdout_mae_before_db, 1)} dB |
| Holdout MAE after | ${formatNumber(calibration.holdout_mae_after_db, 1)} dB |

The correction is a robust global path-loss bias, not full propagation calibration.`;
}

function renderMarkdownRecommendationSection(report) {
  const recommendations = report.recommendations?.recommendations ?? [];
  if (recommendations.length === 0) return "";
  const rows = recommendations.map((candidate, index) =>
    `| ${index + 1} | ${markdownValue(candidate.cell_id)} | ${formatNumber(candidate.optimal_azimuth, 0)} deg | ${formatCompactNumber(candidate.marginal_network_score)} | ${markdownValue(candidate.reason)} |`,
  ).join("\n");
  return `## Candidate Cell Recommendations

| Rank | Cell | Azimuth | Marginal score | Reason |
|---:|---:|---:|---:|---|
${rows}

Candidates are known planning records, not approved deployment sites. Interference is excluded from candidate scoring.`;
}

function renderMarkdownSavedScenarioSection(report) {
  const scenarios = report.project?.scenarios ?? [];
  if (scenarios.length < 2) return "";
  const [first, second] = scenarios.slice(-2);
  return `## Saved Scenario Comparison

| Metric | ${markdownValue(first.name)} | ${markdownValue(second.name)} |
|---|---:|---:|
| Average Rx | ${formatNumber(first.summary?.avgRxDBm, 1)} dBm | ${formatNumber(second.summary?.avgRxDBm, 1)} dBm |
| Gap ratio | ${formatNumber(first.summary?.gapPct, 1)}% | ${formatNumber(second.summary?.gapPct, 1)}% |
| Network score | ${formatCompactNumber(first.summary?.networkScore)} | ${formatCompactNumber(second.summary?.networkScore)} |
| Average SINR | ${formatNumber(first.summary?.avgSINRDB, 1)} dB | ${formatNumber(second.summary?.avgSINRDB, 1)} dB |
| Serviceable | ${formatNumber(first.summary?.serviceablePct, 1)}% | ${formatNumber(second.summary?.serviceablePct, 1)}% |`;
}

function printMeasurementSection(report) {
  const stats = report.measurementAnalysis?.stats;
  if (!stats) return "";
  const calibration = report.measurementAnalysis?.calibration ?? {};
  return `<section class="grid">
    ${printTable("Measurement Validation", [
      ["Imported samples", formatNumber(stats.sample_count, 0)],
      ["Valid samples", formatNumber(stats.valid_sample_count, 0)],
      ["No signal", formatNumber(stats.no_signal_count, 0)],
      ["Cell mismatch", formatNumber(stats.cell_mismatch_count, 0)],
      ["MAE", `${formatNumber(stats.mae_db, 1)} dB`],
      ["RMSE", `${formatNumber(stats.rmse_db, 1)} dB`],
      ["Median bias", `${formatNumber(stats.median_bias_db, 1)} dB`],
    ])}
    ${printTable("Bias Correction", [
      ["Eligible", calibration.eligible ? "Yes" : "No"],
      ["Suggested total offset", `${formatNumber(calibration.recommended_total_offset_db, 1)} dB`],
      ["Holdout MAE before", `${formatNumber(calibration.holdout_mae_before_db, 1)} dB`],
      ["Holdout MAE after", `${formatNumber(calibration.holdout_mae_after_db, 1)} dB`],
      ["Applied offset", `${formatNumber(report.calibrationProfile?.offsetDb ?? 0, 1)} dB`],
    ])}
    <p>Global path-loss bias only; this is not full propagation calibration.</p>
  </section>`;
}

function printRecommendationSection(report) {
  const recommendations = report.recommendations?.recommendations ?? [];
  if (recommendations.length === 0) return "";
  const rows = recommendations.map((candidate, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(candidate.cell_id)}</td><td>${formatNumber(candidate.optimal_azimuth, 0)} deg</td><td>${formatCompactNumber(candidate.marginal_network_score)}</td><td>${escapeHtml(candidate.reason)}</td></tr>`).join("");
  return `<section><h2>Candidate Cell Recommendations</h2><table><thead><tr><th>Rank</th><th>Cell</th><th>Azimuth</th><th>Gain</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table><p>Candidates are known planning records, not approved deployment sites.</p></section>`;
}

function printSavedScenarioSection(report) {
  const scenarios = report.project?.scenarios ?? [];
  if (scenarios.length < 2) return "";
  const [first, second] = scenarios.slice(-2);
  return `<section class="grid">${printTable(first.name, [
    ["Average Rx", `${formatNumber(first.summary?.avgRxDBm, 1)} dBm`],
    ["Gap ratio", `${formatNumber(first.summary?.gapPct, 1)}%`],
    ["Network score", formatCompactNumber(first.summary?.networkScore)],
    ["Average SINR", `${formatNumber(first.summary?.avgSINRDB, 1)} dB`],
  ])}${printTable(second.name, [
    ["Average Rx", `${formatNumber(second.summary?.avgRxDBm, 1)} dBm`],
    ["Gap ratio", `${formatNumber(second.summary?.gapPct, 1)}%`],
    ["Network score", formatCompactNumber(second.summary?.networkScore)],
    ["Average SINR", `${formatNumber(second.summary?.avgSINRDB, 1)} dB`],
  ])}</section>`;
}

function printMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "n/a")}</strong></div>`;
}

function printGapTable(gaps) {
  if (gaps.length === 0) {
    return `<p>No coverage gaps were returned for the current simulation.</p>`;
  }

  return `<table><thead><tr><th>Building</th><th>Severity</th><th>Rx</th><th>Demand</th><th>Reason</th></tr></thead><tbody>${gaps
    .map(
      (gap) =>
        `<tr><td>${escapeHtml(gap.id)}</td><td>${escapeHtml(gap.severity)}</td><td>${formatNumber(gap.rx, 1)} dBm</td><td>${formatNumber(gap.demand, 1)}</td><td>${escapeHtml(gap.reason)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDateSlug(date) {
  return date.toISOString().slice(0, 19).replace(/[-:T]/g, "");
}

function escapeSvgText(value) {
  return escapeHtml(value);
}
