import { rxPowerColor } from "./geojson.js";
import { normalizedNetworkScore } from "./appWorkspace.js";
import { buildCellMarginalEffectView, isRadioQualityEvaluated } from "./optimizationConfig.js";
import {
  renderMarkdownInterferenceSection,
  renderPrintableInterferenceSection,
} from "./interferenceReport.js";
import {
  escapeHtml,
  formatCompactNumber,
  formatNumber,
} from "./reportFormatting.js";
import { effectiveReceiverSensitivityDbm, resolveRFProfile } from "./rfProfile.js";

const SVG_WIDTH = 720;
const SVG_HEIGHT = 460;
const SVG_PADDING = 34;
const REPORT_NOT_AVAILABLE = "Not available";
const REPORT_NOT_CONFIGURED = "Not configured";
const MAX_REPORT_MAP_RAYS = 600;
const MAX_REPORT_MAP_GAPS = 260;
const MAX_REPORT_MAP_INTERFERENCE_POINTS = 600;
const MAX_REPORT_PARETO_SOLUTIONS = 5;

const REPORT_OBJECTIVES = [
  { id: "demand", label: "Demand", direction: "Maximize" },
  { id: "residential", label: "Residential", direction: "Maximize" },
  { id: "coverage", label: "Propagation reach", direction: "Maximize" },
  { id: "overlap", label: "Reduce overlap", direction: "Maximize utility" },
  { id: "radio_quality", label: "Radio quality", direction: "Maximize serviceability" },
];

export function buildPlanningReport({
  activeNetworkTech,
  appMeta,
  buildingEntryAnalysis,
  buildingSummary,
  calibrationProfile,
  cellExplanations = [],
  comparison,
  coreLab,
  coreLabApplicable,
  coreLabEnabled,
  coverageGaps,
  diagnostics,
  generatedAt: generatedAtValue,
  interferenceAnalysis,
  measurementAnalysis,
  networkOptimization,
  networkResultKind,
  optimizationConfig,
  planningMode,
  project,
  recommendations,
  selectedTower,
  selectedNetworkTowers = [],
  settings,
  simulation,
  stats,
}) {
  const safeSettings = settings ?? {};
  const generatedAt = normalizeDate(generatedAtValue);
  const networkTowers = resolveReportNetworkTowers({
    networkOptimization,
    selectedNetworkTowers,
    selectedTower,
  });
  const reportMode = resolveReportMode({
    comparison,
    networkOptimization,
    networkTowers,
    planningMode,
  });
  const report = {
    activeNetworkTech,
    appMeta,
    buildingEntryAnalysis,
    buildingSummary,
    calibrationProfile,
    cellExplanations,
    comparison,
    comparisonMetrics: getComparisonMetrics(comparison),
    comparisonBarChartSvg: "",
    comparisonSlopeChartSvg: "",
    coreLab,
    coreLabApplicable,
    coreLabEnabled,
    coverageGaps,
    diagnostics,
    generatedAt,
    interferenceAnalysis,
    measurementAnalysis,
    networkOptimization,
    networkResultKind,
    optimizationConfig,
    planningMode,
    project,
    recommendations,
    reportMode,
    selectedTower,
    selectedNetworkTowers,
    networkTowers,
    settings: safeSettings,
    simulation,
    stats,
  };
  report.recommendedSolution = resolveRecommendedSolution(networkOptimization);
  report.recommendedConfigurations = buildRecommendedConfigurations({
    networkOptimization,
    networkTowers,
    recommendedSolution: report.recommendedSolution,
  });
  report.rfProfiles = buildReportRFProfiles({
    networkTowers,
    reportMode,
    selectedTower,
    settings: safeSettings,
  });
  report.evaluatedCellExplanations = normalizeCellExplanations(
    cellExplanations,
    optimizationConfig,
    report.recommendedSolution?.id,
  );
  report.reportId = buildReportId(report);
  const view = buildReportViewModel(report);
  report.mapSvg = buildMapSvg({
    activeNetworkTech,
    coverageGaps: coverageGaps?.geojson,
    interference: interferenceAnalysis?.geojson,
    networkTowers,
    recommendedConfigurations: report.recommendedConfigurations,
    selectedTower,
    settings: safeSettings,
    simulation: simulation?.geojson,
  });
  report.view = view;
  return report;
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
  const view = getReportViewModel(report);
  const sections = [
    renderMarkdownExecutiveSummary(view),
    renderMarkdownRecommendedSolution(view),
    renderMarkdownComparison(view),
    renderMarkdownPareto(view),
    renderMarkdownCellExplanations(view),
    renderMarkdownRFPerformance(view),
    renderMarkdownBuildingEntry(view),
    renderMarkdownInterferenceSection(report),
    renderMarkdownPlanningMap(report),
    renderMarkdownCoverageGaps(view),
    renderMarkdownRFConfiguration(view),
    renderMarkdownAdditionalEvidence(view),
    renderMarkdownDataMethodology(view),
  ].filter(Boolean);
  return `# ${view.title}

${view.subtitle}

Generated: ${view.generatedAt}

${sections.join("\n\n")}
`;
}

export function renderPrintableReport(report) {
  const view = getReportViewModel(report);
  const sections = [
    renderPrintableExecutiveSummary(view),
    renderPrintableRecommendedSolution(view),
    renderPrintableComparison(view),
    renderPrintablePareto(view),
    renderPrintableCellExplanations(view),
    renderPrintableRFPerformance(view),
    renderPrintableBuildingEntry(view),
    renderPrintableInterferenceSection(report),
    renderPrintablePlanningMap(report),
    renderPrintableCoverageGaps(view),
    renderPrintableRFConfiguration(view),
    renderPrintableAdditionalEvidence(view),
    renderPrintableDataMethodology(view),
  ].filter(Boolean);

  const title = escapeHtml(view.title);
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
    body { margin: 0; padding: 28px; background: #eef3f1; }
    main { max-width: 960px; margin: 0 auto; background: #ffffff; border: 1px solid #d7e1dc; border-radius: 10px; overflow: hidden; }
    header { display: grid; gap: 10px; padding: 28px; border-bottom: 1px solid #d7e1dc; background: #f8fbfa; }
    h1, h2, h3 { margin: 0; color: #14201c; line-height: 1.1; }
    h1 { font-size: 2rem; }
    h2 { margin-bottom: 12px; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.04em; }
    h3 { margin: 18px 0 9px; font-size: 0.92rem; }
    p { margin: 0; color: #52615a; line-height: 1.55; }
    ul { margin: 8px 0 0; padding-left: 20px; color: #52615a; line-height: 1.55; }
    section { padding: 22px 28px; border-bottom: 1px solid #e5ece8; }
    section:last-child { border-bottom: 0; }
    .report-subtitle { color: #52615a; }
    .report-generated { color: #728078; font-size: 0.82rem; }
    .report-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .report-callout { padding: 14px 16px; border: 1px solid #b9d9cf; border-left: 4px solid #0f766e; border-radius: 8px; background: #f2faf7; }
    .report-table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #d7e1dc; border-radius: 8px; overflow: hidden; font-size: 0.88rem; }
    th, td { padding: 9px 10px; border-bottom: 1px solid #e5ece8; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: #728078; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; background: #fbfdfc; }
    tr:last-child th, tr:last-child td { border-bottom: 0; }
    .status { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px; color: #0b4f49; background: #d9f2e8; font-size: 0.78rem; font-weight: 800; }
    .status.failed { color: #9f1239; background: #ffe0e7; }
    .report-note { margin-top: 10px; font-size: 0.84rem; }
    .map-wrap { border: 1px solid #d7e1dc; border-radius: 8px; overflow: hidden; background: #e8eef1; }
    .map-wrap svg { display: block; width: 100%; height: auto; }
    .cell-explanation { margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5ece8; }
    .cell-explanation:first-of-type { margin-top: 0; padding-top: 0; border-top: 0; }
    .small-table { font-size: 0.8rem; }
    .small-table th, .small-table td { padding: 7px 8px; }
    .actions { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; gap: 10px; padding: 12px 28px; border-bottom: 1px solid #d7e1dc; background: rgba(255, 255, 255, 0.94); }
    .actions button { min-height: 38px; padding: 0 14px; border: 0; border-radius: 8px; color: #ffffff; background: #0f766e; font: inherit; font-weight: 800; cursor: pointer; }
    @media print { body { padding: 0; background: #ffffff; } main { max-width: none; border: 0; border-radius: 0; } .actions { display: none; } section { break-inside: avoid; } .report-table-wrap { overflow: visible; } }
    @media (max-width: 720px) { body { padding: 0; } main { border: 0; border-radius: 0; } .report-grid { grid-template-columns: minmax(0, 1fr); } }
  </style>
</head>
<body>
  <main>
    <div class="actions"><button type="button" onclick="window.print()">Save as PDF</button></div>
    <header>
      <h1>${title}</h1>
      <p class="report-subtitle">${escapeHtml(view.subtitle)}</p>
      <p class="report-generated">Generated ${escapeHtml(view.generatedAt)}</p>
    </header>
    ${sections.join("\n")}
  </main>
</body>
</html>`;
}

export function renderHtmlReport(report) {
  return renderPrintableReport(report);
}

function getReportViewModel(report) {
  if (report?.view) return report.view;
  return buildReportViewModel(report ?? {});
}

function buildReportViewModel(report) {
  const networkReport = report.reportMode === "network"
    || resolveReportMode({
      comparison: report.comparison,
      networkOptimization: report.networkOptimization,
      networkTowers: report.networkTowers ?? [],
      planningMode: report.planningMode,
    }) === "network";
  const optimization = report.networkOptimization;
  const outcome = optimization?.optimization ?? {};
  const recommendedSolution = report.recommendedSolution ?? resolveRecommendedSolution(optimization);
  const comparison = report.comparison;
  const isOptimizationRecommendation = networkReport
    && report.networkResultKind !== "evaluation"
    && outcome.recommended !== false
    && Boolean(recommendedSolution || comparison?.type === "optimization");
  const resultStats = comparison?.type === "optimization"
    ? comparison.optimized_solution?.stats
    : recommendedSolution?.stats ?? optimization?.stats;
  const baselineStats = comparison?.type === "optimization"
    ? comparison.baseline_solution?.stats
    : optimization?.baseline?.stats;
  const objectiveStatus = mergeObjectiveStatus(
    outcome.objective_status,
    resultStats?.objective_status,
    comparison?.objective_status,
  );
  const networkTowers = report.networkTowers ?? report.selectedNetworkTowers ?? [];
  const constraints = outcome.constraints ?? report.optimizationConfig?.constraints ?? {};
  const constraintStatus = getConstraintStatus({
    constraints,
    comparison,
    hasResult: Boolean(resultStats),
    outcome,
    resultStats,
  });
  const comparisonRows = buildReportComparisonRows(comparison);
  const frontier = Array.isArray(optimization?.pareto_frontier) ? optimization.pareto_frontier : [];
  const paretoSolutions = isOptimizationRecommendation ? frontier.slice(0, MAX_REPORT_PARETO_SOLUTIONS) : [];
  const scenarioName = getScenarioName(report.project);
  const title = networkReport ? "A.T.O.M Network Planning Report" : "A.T.O.M Single-cell RF Planning Report";
  const subtitle = scenarioName
    ? `${scenarioName} · ${networkReport ? "Network planning" : "Single-cell RF planning"}`
    : networkReport ? "Network planning" : "Single-cell RF planning";
  const parameters = optimization?.baseline?.parameters ?? report.settings ?? {};
  const performanceRows = resultStats ? buildNetworkPerformanceRows(resultStats, objectiveStatus) : [];
  const rfPerformanceRows = buildRFPerformanceRows(report);
  const topGaps = getTopCoverageGaps(report.coverageGaps?.geojson);
  const datasetRows = buildDatasetRows(report);
  const priorityRows = buildPriorityRows({ config: report.optimizationConfig, objectiveStatus, outcome });
  const constraintRows = buildConstraintRows({ constraints, status: constraintStatus });
  const evaluatedCellExplanations = report.evaluatedCellExplanations ?? normalizeCellExplanations(
    report.cellExplanations,
    report.optimizationConfig,
    recommendedSolution?.id,
  );
  return {
    activeNetworkTech: report.activeNetworkTech,
    appMeta: report.appMeta,
    baselineStats,
    buildingEntryAnalysis: report.buildingEntryAnalysis,
    buildingSummary: report.buildingSummary,
    calibrationProfile: report.calibrationProfile,
    comparison,
    comparisonRows,
    constraintRows,
    constraintStatus,
    coreLab: report.coreLab,
    coreLabApplicable: report.coreLabApplicable,
    coreLabEnabled: report.coreLabEnabled,
    coverageGaps: report.coverageGaps,
    datasetRows,
    diagnostics: report.diagnostics,
    evaluatedCellExplanations,
    generatedAt: formatDate(report.generatedAt),
    hasInterference: Boolean(report.interferenceAnalysis?.stats && report.interferenceAnalysis?.model),
    interferenceAnalysis: report.interferenceAnalysis,
    isOptimizationRecommendation,
    isNetworkReport: networkReport,
    measurementAnalysis: report.measurementAnalysis,
    networkOptimization: optimization,
    networkTowers,
    objectiveStatus,
    parameters,
    paretoSolutions,
    performanceRows,
    priorityRows,
    project: report.project,
    recommendations: report.recommendations,
    recommendedConfigurations: report.recommendedConfigurations ?? [],
    recommendedSolution,
    reportMode: report.reportMode,
    rfPerformanceRows,
    rfProfiles: report.rfProfiles ?? [],
    scenarioName,
    settings: report.settings ?? {},
    simulation: report.simulation,
    subtitle,
    title,
    topGaps,
    optimizationRunID: optimization?.optimization_run_id ?? null,
    resultStats,
  };
}

function renderMarkdownExecutiveSummary(view) {
  const scopeLabel = view.isNetworkReport ? "Network" : "Cell / RF context";
  const networkRows = view.isNetworkReport
    ? [
      row("Scenario / plan", view.scenarioName),
      row("Technology", view.activeNetworkTech),
      row("Selected cells", formatCount(view.networkTowers.length || view.parameters.selected_cell_count)),
      row("Frequency", formatUnit(view.parameters.frequency_ghz ?? view.parameters.frequencyGHz, 3, "GHz")),
      row("Conducted TX power", formatUnit(view.parameters.tx_power_dbm ?? view.parameters.txPowerDbm, 1, "dBm")),
      row("Planning radius", formatUnit(view.parameters.radius_m ?? view.parameters.radiusMeters, 0, "m")),
    ]
    : [
      row("Scenario / plan", view.scenarioName),
      row("Cell", view.networkTowers[0]?.cellId ?? view.networkTowers[0]?.id),
      row("Technology", view.activeNetworkTech),
      row("Frequency", formatUnit(view.settings.frequencyGHz, 3, "GHz")),
      row("Conducted TX power", formatUnit(view.settings.tx_power_dbm ?? view.settings.txPowerDbm, 1, "dBm")),
      row("Planning radius", formatUnit(view.settings.radiusMeters ?? view.settings.radius_m, 0, "m")),
    ];
  const summaryPerformance = view.performanceRows.filter((item) => ["Optimization score", "Demand served", "Residential", "Propagation reach", "Overlap ratio"].includes(item[0]));
  const resultLabel = view.isOptimizationRecommendation ? "Recommended solution" : view.isNetworkReport ? "Evaluated network configuration" : "RF result";
  const interferenceStatus = view.hasInterference ? "Evaluated" : view.isNetworkReport ? "Not evaluated" : null;
  const statusLine = view.isOptimizationRecommendation
    ? "Status: current priority-ranked feasible recommendation."
    : view.isNetworkReport
      ? "Status: evaluated network configuration."
      : "Status: current single-cell RF result.";
  return `## Executive Summary

### ${scopeLabel}

${renderMarkdownTable(["Field", "Value"], networkRows)}

### ${resultLabel}

${renderMarkdownTable(["Metric", "Achieved"], [...summaryPerformance, row("Constraints", view.constraintStatus.label)])}
${interferenceStatus ? `
Interference analysis: ${interferenceStatus}.` : ""}

${statusLine}`;
}

function renderPrintableExecutiveSummary(view) {
  const scopeLabel = view.isNetworkReport ? "Network" : "Cell / RF context";
  const networkRows = view.isNetworkReport
    ? [
      row("Scenario / plan", view.scenarioName),
      row("Technology", view.activeNetworkTech),
      row("Selected cells", formatCount(view.networkTowers.length || view.parameters.selected_cell_count)),
      row("Frequency", formatUnit(view.parameters.frequency_ghz ?? view.parameters.frequencyGHz, 3, "GHz")),
      row("Conducted TX power", formatUnit(view.parameters.tx_power_dbm ?? view.parameters.txPowerDbm, 1, "dBm")),
      row("Planning radius", formatUnit(view.parameters.radius_m ?? view.parameters.radiusMeters, 0, "m")),
    ]
    : [
      row("Scenario / plan", view.scenarioName),
      row("Cell", view.networkTowers[0]?.cellId ?? view.networkTowers[0]?.id),
      row("Technology", view.activeNetworkTech),
      row("Frequency", formatUnit(view.settings.frequencyGHz, 3, "GHz")),
      row("Conducted TX power", formatUnit(view.settings.tx_power_dbm ?? view.settings.txPowerDbm, 1, "dBm")),
      row("Planning radius", formatUnit(view.settings.radiusMeters ?? view.settings.radius_m, 0, "m")),
    ];
  const summaryPerformance = view.performanceRows.filter((item) => ["Optimization score", "Demand served", "Residential", "Propagation reach", "Overlap ratio"].includes(item[0]));
  const resultLabel = view.isOptimizationRecommendation ? "Recommended solution" : view.isNetworkReport ? "Evaluated network configuration" : "RF result";
  const interferenceStatus = view.hasInterference ? "Evaluated" : view.isNetworkReport ? "Not evaluated" : null;
  const statusLine = view.isOptimizationRecommendation
    ? "Status: current priority-ranked feasible recommendation."
    : view.isNetworkReport
      ? "Status: evaluated network configuration."
      : "Status: current single-cell RF result.";
  return `<section data-report-section="executive-summary"><h2>Executive Summary</h2><div class="report-grid"><div><h3>${escapeHtml(scopeLabel)}</h3>${renderHtmlTable(["Field", "Value"], networkRows)}</div><div><h3>${escapeHtml(resultLabel)}</h3>${renderHtmlTable(["Metric", "Achieved"], [...summaryPerformance, row("Constraints", view.constraintStatus.label)])}${interferenceStatus ? `<p class="report-note">Interference analysis: ${escapeHtml(interferenceStatus)}.</p>` : ""}<p class="report-note">${escapeHtml(statusLine)}</p></div></div></section>`;
}

function renderMarkdownRecommendedSolution(view) {
  if (!view.isNetworkReport) {
    if (view.rfPerformanceRows.length === 0) return "";
    return `## RF Result

${renderMarkdownTable(["Metric", "Value"], view.rfPerformanceRows)}`;
  }
  const heading = view.isOptimizationRecommendation ? "Recommended Network Solution" : view.resultStats ? "Evaluated Network Configuration" : "Network Result";
  const body = [];
  body.push(view.performanceRows.length > 0 ? renderMarkdownTable(["Metric", "Achieved"], view.performanceRows) : "Network performance metrics: Not available.");
  if (view.recommendedConfigurations.length > 0) {
    body.push("### Cell configuration");
    body.push(renderMarkdownCellConfigurationTable(view));
  }
  const domainRows = buildOptimizationDomainRows(view);
  if (domainRows.length > 0) {
    body.push("### Optimization domain");
    body.push(renderMarkdownTable(["Field", "Value"], domainRows));
  }
  if (view.priorityRows.length > 0 || view.constraintRows.length > 0) {
    body.push("### Priorities and feasibility");
    if (view.priorityRows.length > 0) {
      body.push(renderMarkdownTable(["Objective", "Configured priority (0–100)", "Effective weight", "Status"], view.priorityRows));
      body.push("Configured priorities are relative importance values on a 0–100 scale; effective weights are normalized percentages.");
    }
    if (view.constraintRows.length > 0) body.push(renderMarkdownTable(["Constraint", "Configured threshold", "Status"], view.constraintRows));
  }
  if (!view.isOptimizationRecommendation && view.networkOptimization && !view.comparisonRows.length) body.push("Alternative-solution and baseline metadata are not available for this saved network result.");
  return `## ${heading}

${body.join("\n\n")}`;
}

function renderPrintableRecommendedSolution(view) {
  if (!view.isNetworkReport) {
    if (view.rfPerformanceRows.length === 0) return "";
    return `<section data-report-section="rf-result"><h2>RF Result</h2>${renderHtmlTable(["Metric", "Value"], view.rfPerformanceRows)}</section>`;
  }
  const heading = view.isOptimizationRecommendation ? "Recommended Network Solution" : view.resultStats ? "Evaluated Network Configuration" : "Network Result";
  const domainRows = buildOptimizationDomainRows(view);
  const priorityContent = [];
  if (view.priorityRows.length > 0) {
    priorityContent.push(renderHtmlTable(["Objective", "Configured priority (0–100)", "Effective weight", "Status"], view.priorityRows));
    priorityContent.push('<p class="report-note">Configured priorities are relative importance values on a 0–100 scale; effective weights are normalized percentages.</p>');
  }
  if (view.constraintRows.length > 0) priorityContent.push(renderHtmlTable(["Constraint", "Configured threshold", "Status"], view.constraintRows));
  return `<section data-report-section="recommended-solution"><h2>${escapeHtml(heading)}</h2>${view.performanceRows.length > 0 ? renderHtmlTable(["Metric", "Achieved"], view.performanceRows) : `<p>Network performance metrics: ${REPORT_NOT_AVAILABLE}.</p>`}${view.recommendedConfigurations.length > 0 ? `<h3>Cell configuration</h3>${renderHtmlCellConfigurationTable(view)}` : ""}${domainRows.length > 0 ? `<h3>Optimization domain</h3>${renderHtmlTable(["Field", "Value"], domainRows)}` : ""}${priorityContent.length > 0 ? `<h3>Priorities and feasibility</h3>${priorityContent.join("\n")}` : ""}${!view.isOptimizationRecommendation && view.networkOptimization && !view.comparisonRows.length ? `<p class="report-note">Alternative-solution and baseline metadata are not available for this saved network result.</p>` : ""}</section>`;
}

function renderMarkdownComparison(view) {
  if (!view.comparisonRows.length) return "";
  const title = view.comparison?.type === "optimization" || view.isNetworkReport ? "Baseline vs Recommended" : "Baseline vs Optimized";
  const noChange = view.comparisonRows.every((item) => ["unchanged", "flat", "informational"].includes(item.status));
  return `## ${title}

${renderMarkdownTable(["Metric", "Baseline", view.comparison?.type === "optimization" ? "Recommended" : "Optimized", "Change"], view.comparisonRows.map((item) => [item.label, item.baseline, item.optimized, item.change]))}${noChange ? "\n\nNo aggregate KPI change was observed between baseline and the currently recommended configuration." : ""}`;
}

function renderPrintableComparison(view) {
  if (!view.comparisonRows.length) return "";
  const title = view.comparison?.type === "optimization" || view.isNetworkReport ? "Baseline vs Recommended" : "Baseline vs Optimized";
  const noChange = view.comparisonRows.every((item) => ["unchanged", "flat", "informational"].includes(item.status));
  return `<section data-report-section="baseline-comparison"><h2>${escapeHtml(title)}</h2>${renderHtmlTable(["Metric", "Baseline", view.comparison?.type === "optimization" ? "Recommended" : "Optimized", "Change"], view.comparisonRows.map((item) => [item.label, item.baseline, item.optimized, item.change]))}${noChange ? `<p class="report-note">No aggregate KPI change was observed between baseline and the currently recommended configuration.</p>` : ""}</section>`;
}

function renderMarkdownPareto(view) {
  if (!view.paretoSolutions.length) return "";
  return `## Optimization Trade-offs

${renderMarkdownTable(buildParetoHeaders(view), view.paretoSolutions.map((solution, index) => buildParetoRow(solution, view, index)))}

${view.networkOptimization.pareto_frontier.length} feasible non-dominated solutions were evaluated. Non-dominated alternatives represent different valid objective trade-offs; the recommendation reflects the current priorities, not an objectively best solution.`;
}

function renderPrintablePareto(view) {
  if (!view.paretoSolutions.length) return "";
  return `<section data-report-section="optimization-tradeoffs"><h2>Optimization Trade-offs</h2>${renderHtmlTable(buildParetoHeaders(view), view.paretoSolutions.map((solution, index) => buildParetoRow(solution, view, index)))}<p class="report-note">${view.networkOptimization.pareto_frontier.length} feasible non-dominated solutions were evaluated. Non-dominated alternatives represent different valid objective trade-offs; the recommendation reflects the current priorities, not an objectively best solution.</p></section>`;
}

function renderMarkdownCellExplanations(view) {
  if (!view.evaluatedCellExplanations.length) return "";
  return `## Evaluated Cell Changes

${view.evaluatedCellExplanations.map(renderMarkdownCellExplanation).join("\n\n")}`;
}

function renderPrintableCellExplanations(view) {
  if (!view.evaluatedCellExplanations.length) return "";
  return `<section data-report-section="evaluated-cell-changes"><h2>Evaluated Cell Changes</h2>${view.evaluatedCellExplanations.map(renderPrintableCellExplanation).join("\n")}</section>`;
}

function renderMarkdownRFPerformance(view) {
  if (!view.rfPerformanceRows.length) return "";
  return `## RF Propagation Performance

${renderMarkdownTable(["Metric", "Value"], view.rfPerformanceRows)}`;
}

function renderPrintableRFPerformance(view) {
  if (!view.rfPerformanceRows.length) return "";
  return `<section data-report-section="rf-performance"><h2>RF Propagation Performance</h2>${renderHtmlTable(["Metric", "Value"], view.rfPerformanceRows)}</section>`;
}

function renderMarkdownBuildingEntry(view) {
  const analysis = view.buildingEntryAnalysis;
  if (!analysis) return "";
  const summary = analysis.summary ?? {};
  const rows = [
    ["Applicability", analysis.applicability?.applicable ? "Applicable" : analysis.applicability?.reason ?? REPORT_NOT_AVAILABLE],
    ["Relevant buildings", formatCount(summary.relevant_buildings)],
    ["Relevant residential buildings", formatCount(summary.relevant_residential_buildings)],
    ["Outdoor building service", `${formatCount(summary.outdoor_serviceable_buildings)} / ${formatCount(summary.relevant_buildings)}`],
    ["Low-loss entry service", `${formatCount(summary.low_loss_serviceable_buildings)} / ${formatCount(summary.relevant_buildings)}`],
    ["High-loss entry service", `${formatCount(summary.high_loss_serviceable_buildings)} / ${formatCount(summary.relevant_buildings)}`],
    ["Material metadata", `${formatNumber(summary.material_metadata_coverage_pct, 1)}% known`],
    ["Analysis runtime", formatUnit(analysis.diagnostics?.elapsed_ms, 0, "ms")],
  ].filter((item) => item[1] !== null);
  return `## Building-entry analysis

${renderMarkdownTable(["Metric", "Value"], rows)}

Model: ${markdownText(analysis.model?.reference ?? REPORT_NOT_AVAILABLE)}. Outdoor facade power uses the ${markdownText(analysis.model?.outdoor_baseline_model ?? REPORT_NOT_AVAILABLE)} baseline; entry values are deterministic low-loss/high-loss scenarios at zero indoor depth. This is estimated service just inside a representative facade, not indoor or whole-building coverage.`;
}

function renderPrintableBuildingEntry(view) {
  const analysis = view.buildingEntryAnalysis;
  if (!analysis) return "";
  const summary = analysis.summary ?? {};
  const rows = [
    ["Applicability", analysis.applicability?.applicable ? "Applicable" : analysis.applicability?.reason ?? REPORT_NOT_AVAILABLE],
    ["Relevant buildings", formatCount(summary.relevant_buildings)],
    ["Relevant residential buildings", formatCount(summary.relevant_residential_buildings)],
    ["Outdoor building service", `${formatCount(summary.outdoor_serviceable_buildings)} / ${formatCount(summary.relevant_buildings)}`],
    ["Low-loss entry service", `${formatCount(summary.low_loss_serviceable_buildings)} / ${formatCount(summary.relevant_buildings)}`],
    ["High-loss entry service", `${formatCount(summary.high_loss_serviceable_buildings)} / ${formatCount(summary.relevant_buildings)}`],
    ["Material metadata", `${formatNumber(summary.material_metadata_coverage_pct, 1)}% known`],
    ["Analysis runtime", formatUnit(analysis.diagnostics?.elapsed_ms, 0, "ms")],
  ].filter((item) => item[1] !== null);
  return `<section data-report-section="building-entry"><h2>Building-entry analysis</h2>${renderHtmlTable(["Metric", "Value"], rows)}<p class="report-note">Model: ${escapeHtml(analysis.model?.reference ?? REPORT_NOT_AVAILABLE)}. Outdoor facade power uses the ${escapeHtml(analysis.model?.outdoor_baseline_model ?? REPORT_NOT_AVAILABLE)} baseline; entry values are deterministic low-loss/high-loss scenarios at zero indoor depth. This is estimated service just inside a representative facade, not indoor or whole-building coverage.</p></section>`;
}

function renderMarkdownPlanningMap(report) {
  if (!report.mapSvg) return "";
  return `## Planning Map

${report.mapSvg}

The report map is a concise export snapshot. When ray paths exceed the report limit, paths are sampled for readability; the underlying runtime RF result is unchanged.`;
}

function renderPrintablePlanningMap(report) {
  if (!report.mapSvg) return "";
  return `<section data-report-section="planning-map"><h2>Planning Map</h2><div class="map-wrap">${report.mapSvg}</div><p class="report-note">The report map is a concise export snapshot. When ray paths exceed the report limit, paths are sampled for readability; the underlying runtime RF result is unchanged.</p></section>`;
}

function renderMarkdownCoverageGaps(view) {
  if (view.topGaps.length > 0) return `## Coverage Gaps

${renderMarkdownGapTable(view.topGaps)}`;
  const gapStats = view.coverageGaps?.stats;
  if (Number.isFinite(Number(gapStats?.gap_buildings)) && Number(gapStats.gap_buildings) === 0) return "## Coverage Gaps\n\nCoverage gaps: None identified.";
  if (Number.isFinite(Number(gapStats?.returned_gaps)) && Number(gapStats.returned_gaps) === 0) return "## Coverage Gaps\n\nCoverage gaps: None identified in the returned records.";
  return "";
}

function renderPrintableCoverageGaps(view) {
  if (view.topGaps.length > 0) return `<section data-report-section="coverage-gaps"><h2>Coverage Gaps</h2>${renderHtmlGapTable(view.topGaps)}</section>`;
  const gapStats = view.coverageGaps?.stats;
  if (Number.isFinite(Number(gapStats?.gap_buildings)) && Number(gapStats.gap_buildings) === 0) return `<section data-report-section="coverage-gaps"><h2>Coverage Gaps</h2><p>Coverage gaps: None identified.</p></section>`;
  if (Number.isFinite(Number(gapStats?.returned_gaps)) && Number(gapStats.returned_gaps) === 0) return `<section data-report-section="coverage-gaps"><h2>Coverage Gaps</h2><p>Coverage gaps: None identified in the returned records.</p></section>`;
  return "";
}

function renderMarkdownRFConfiguration(view) {
  if (!view.rfProfiles.length && !view.isNetworkReport) return "";
  const parameterRows = buildRFParameterRows(view);
  const profileTable = buildRFProfileTable(view);
  const blocks = [];
  if (parameterRows.length > 0) blocks.push(renderMarkdownTable(["Assumption", "Value"], parameterRows));
  if (profileTable.rows.length > 0) {
    blocks.push("### Per-cell RF profiles");
    blocks.push(renderMarkdownTable(profileTable.headers, profileTable.rows));
  }
  return blocks.length > 0 ? `## RF Configuration & Assumptions\n\n${blocks.join("\n\n")}` : "";
}

function renderPrintableRFConfiguration(view) {
  if (!view.rfProfiles.length && !view.isNetworkReport) return "";
  const parameterRows = buildRFParameterRows(view);
  const profileTable = buildRFProfileTable(view);
  const blocks = [];
  if (parameterRows.length > 0) blocks.push(renderHtmlTable(["Assumption", "Value"], parameterRows));
  if (profileTable.rows.length > 0) {
    blocks.push("<h3>Per-cell RF profiles</h3>");
    blocks.push(renderHtmlTable(profileTable.headers, profileTable.rows, "small-table"));
  }
  return blocks.length > 0 ? `<section data-report-section="rf-configuration"><h2>RF Configuration &amp; Assumptions</h2>${blocks.join("\n")}</section>` : "";
}

function buildRFParameterRows(view) {
  const firstProfile = view.rfProfiles[0];
  const derivedReceiverRows = firstProfile?.receiverSensitivityMode === "derived"
    ? [
      row("Receiver noise bandwidth (first effective cell)", formatUnit(Number(firstProfile.receiverNoiseBandwidthHz) / 1e6, 1, "MHz")),
      row("Receiver noise bandwidth source (first effective cell)", formatText(firstProfile.receiverNoiseBandwidthSource)),
      row("Receiver noise figure (first effective cell)", formatUnit(firstProfile.receiverNoiseFigureDb, 1, "dB")),
      row("Receiver required SNR (first effective cell)", formatUnit(firstProfile.receiverRequiredSnrDb, 1, "dB")),
      row("Receiver margin (first effective cell)", formatUnit(firstProfile.receiverMarginDb, 1, "dB")),
    ]
    : [];
  return [
    row("Technology", view.activeNetworkTech),
    row("Frequency", formatUnit(view.parameters.frequency_ghz ?? view.settings.frequencyGHz, 3, "GHz")),
    row("Bandwidth", formatUnit(firstProfile?.bandwidthMHz ?? view.settings.interferenceBandwidthMHz, 1, "MHz")),
    row("Conducted TX power", formatUnit(view.parameters.tx_power_dbm ?? view.settings.txPowerDbm, 1, "dBm")),
    row("TX absolute boresight gain", formatUnit(firstProfile?.antennaGainDbi, 1, "dBi")),
    row("RX antenna gain", formatUnit(firstProfile?.rxAntennaGainDbi, 1, "dBi")),
    row("System loss", formatUnit(firstProfile?.systemLossDb, 1, "dB")),
    row("Polarization loss", formatUnit(firstProfile?.polarizationLossDb, 1, "dB")),
    row("Antenna height", formatUnit(firstProfile?.antennaHeightM, 1, "m")),
    row("Receiver threshold mode (first effective cell)", formatText(firstProfile?.receiverSensitivityMode)),
    row("Receiver sensitivity (first effective cell)", formatUnit(effectiveReceiverSensitivityDbm(firstProfile), 1, "dBm")),
    row("Building service threshold", formatUnit(view.coverageGaps?.stats?.building_service_threshold_dbm ?? view.coverageGaps?.stats?.threshold_dbm ?? view.appMeta?.rf_contract?.building_service_threshold_dbm, 1, "dBm")),
    row("Ray count", formatCount(view.parameters.rays ?? view.settings.rayCount)),
    row("Calibration offset", formatUnit(view.parameters.calibration_offset_db ?? view.settings.calibrationOffsetDb, 1, "dB")),
    ...derivedReceiverRows,
  ].filter((item) => item[1] !== null);
}

function buildRFProfileTable(view) {
  const includePCI = view.rfProfiles.some((profile) => finiteOrNull(profile.pci) !== null);
  return {
    headers: ["Cell", "Band / channel", "Frequency / bandwidth", "Signed link terms", "Antenna", "Patterns", includePCI ? "Load / reuse / PCI" : "Load / reuse", "Receiver / sensitivity"],
    rows: buildRFProfileRows(view, includePCI),
  };
}

function buildRFProfileRows(view, includePCI = view.rfProfiles.some((profile) => finiteOrNull(profile.pci) !== null)) {
  return view.rfProfiles.map((profile) => [
    profile.cellId,
    `${formatText(profile.band)} / ${formatText(profile.channelId)}`,
    `${formatUnit(profile.frequencyGHz, 3, "GHz")} · ${formatUnit(profile.bandwidthMHz, 1, "MHz")}`,
    `TX ${formatUnit(profile.txPowerDbm, 1, "dBm")} · G_TX ${formatUnit(profile.antennaGainDbi, 1, "dBi")} · G_RX ${formatUnit(profile.rxAntennaGainDbi, 1, "dBi")} · L_sys ${formatUnit(profile.systemLossDb, 1, "dB")} · L_pol ${formatUnit(profile.polarizationLossDb, 1, "dB")}`,
    `${formatUnit(profile.antennaHeightM, 1, "m")} · ${formatUnit(totalTilt(profile), 1, "°")} tilt · ${formatUnit(profile.orientationDeg, 1, "°")} orientation`,
    `${formatText(profile.horizontalPatternId)} / ${formatText(profile.verticalPatternId)}`,
    `${formatPercent(profile.loadFactor)} load · reuse ${formatCount(profile.reuseFactor)}${includePCI ? ` · PCI ${formatText(profile.pci)}` : ""}`,
    `${formatUnit(profile.receiverHeightM, 1, "m")} · ${formatText(profile.receiverSensitivityMode)} · ${formatUnit(effectiveReceiverSensitivityDbm(profile), 1, "dBm")} threshold${profile.receiverSensitivityMode === "derived" ? ` · B ${formatUnit(Number(profile.receiverNoiseBandwidthHz) / 1e6, 1, "MHz")} · NF ${formatUnit(profile.receiverNoiseFigureDb, 1, "dB")} · SNR ${formatUnit(profile.receiverRequiredSnrDb, 1, "dB")} · margin ${formatUnit(profile.receiverMarginDb, 1, "dB")}` : ""}`,
  ]);
}

function renderMarkdownAdditionalEvidence(view) {
  return [renderMarkdownMeasurement(view), renderMarkdownCoreLab(view), renderMarkdownRecommendations(view), renderMarkdownSavedScenarios(view)].filter(Boolean).join("\n\n");
}

function renderPrintableAdditionalEvidence(view) {
  return [renderPrintableMeasurement(view), renderPrintableCoreLab(view), renderPrintableRecommendations(view), renderPrintableSavedScenarios(view)].filter(Boolean).join("\n");
}

function renderMarkdownDataMethodology(view) {
  const limitations = buildLimitations(view);
  return `## Data, Methodology & Limitations

${view.datasetRows.length > 0 ? renderMarkdownTable(["Field", "Value"], view.datasetRows) : "Dataset and application metadata: Not available."}

Methodology and limitations:

${limitations.map((item) => `- ${item}`).join("\n")}`;
}

function renderPrintableDataMethodology(view) {
  const limitations = buildLimitations(view);
  return `<section data-report-section="data-methodology"><h2>Data, Methodology &amp; Limitations</h2>${view.datasetRows.length > 0 ? renderHtmlTable(["Field", "Value"], view.datasetRows) : `<p>Dataset and application metadata: ${REPORT_NOT_AVAILABLE}.</p>`}<h3>Methodology and limitations</h3><ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
}

function buildLimitations(view) {
  const limitations = [
    "Results are deterministic planning estimates, not UE, drive-test, or PHY measurements.",
    "The propagation model does not establish deployment approval, rooftop access, ownership, permitting, cost, fiber, or backhaul feasibility.",
  ];
  if (view.calibrationProfile || Number(view.settings.calibrationOffsetDb) !== 0) limitations.push("Any applied correction is a global path-loss bias and not full propagation calibration.");
  const radio = view.networkOptimization?.optimization?.radio_quality;
  if (radio?.enabled && radio?.available) {
    limitations.push("Radio-quality optimization is a soft serviceability objective over a deterministic sampled union domain; no-carrier samples remain denominator failures.");
    limitations.push(`Interference is horizon-bounded to the ${radio.interference_horizon_mode ?? radio.horizon_mode ?? "declared per-cell compatibility"} compatibility horizon and is not a claim of network-wide physical RF completeness.`);
    limitations.push("Radio-quality planning thresholds are deterministic policy inputs, not UE or standards-conformance testing.");
  } else if (radio?.enabled && radio?.available === false) {
    limitations.push(`Radio-quality optimization was unavailable: ${radio.reason ?? REPORT_NOT_AVAILABLE}.`);
  }
  return limitations;
}

function renderMarkdownCellExplanation(effect) {
  const cellID = effect.cell?.id ?? REPORT_NOT_AVAILABLE;
  const baseline = formatAngle(effect.cell?.baseline_azimuth_deg);
  const selected = formatAngle(effect.cell?.selected_azimuth_deg);
  const rows = buildCellExplanationRows(effect);
  const constraints = effect.metrics?.constraints;
  const limitations = Array.isArray(effect.limitations) ? effect.limitations.filter(Boolean) : [];
  return `### Cell ${markdownText(cellID)}

Baseline: ${baseline ?? REPORT_NOT_AVAILABLE} · Selected/recommended: ${selected ?? REPORT_NOT_AVAILABLE}

${rows.length > 0 ? renderMarkdownTable(["Metric", "Selected", "Cell reverted", "Delta"], rows) : "No comparable metrics were retained for this explanation."}

Feasibility: Selected ${formatConstraintValue(constraints?.actual)} · Cell reverted ${formatConstraintValue(constraints?.counterfactual)}${constraints?.counterfactual_violations?.length ? `\n\nCounterfactual violations: ${constraints.counterfactual_violations.map(markdownText).join("; ")}` : ""}

_Marginal effect is measured by restoring only this cell to its baseline configuration while all other cells remain fixed._

_This is a conditional marginal comparison, not causal attribution or an additive decomposition._${limitations.length > 0 ? `

Limitations:

${limitations.map((item) => `- ${markdownText(item)}`).join("\n")}` : ""}`;
}

function renderPrintableCellExplanation(effect) {
  const cellID = effect.cell?.id ?? REPORT_NOT_AVAILABLE;
  const baseline = formatAngle(effect.cell?.baseline_azimuth_deg);
  const selected = formatAngle(effect.cell?.selected_azimuth_deg);
  const constraints = effect.metrics?.constraints;
  const limitations = Array.isArray(effect.limitations) ? effect.limitations.filter(Boolean) : [];
  return `<div class="cell-explanation"><h3>Cell ${escapeHtml(cellID)}</h3><p>Baseline: ${escapeHtml(baseline ?? REPORT_NOT_AVAILABLE)} · Selected/recommended: ${escapeHtml(selected ?? REPORT_NOT_AVAILABLE)}</p>${buildCellExplanationRows(effect).length > 0 ? renderHtmlTable(["Metric", "Selected", "Cell reverted", "Delta"], buildCellExplanationRows(effect)) : `<p class="report-note">No comparable metrics were retained for this explanation.</p>`}<p class="report-note">Feasibility: Selected <span class="status ${constraints?.actual ? "" : "failed"}">${escapeHtml(formatConstraintValue(constraints?.actual))}</span> · Cell reverted <span class="status ${constraints?.counterfactual ? "" : "failed"}">${escapeHtml(formatConstraintValue(constraints?.counterfactual))}</span></p>${constraints?.counterfactual_violations?.length ? `<p class="report-note">Counterfactual violations: ${escapeHtml(constraints.counterfactual_violations.join("; "))}</p>` : ""}<ul><li>Marginal effect is measured by restoring only this cell to its baseline configuration while all other cells remain fixed.</li><li>This is a conditional marginal comparison, not causal attribution or an additive decomposition.</li>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
}

function renderMarkdownMeasurement(view) {
  const stats = view.measurementAnalysis?.stats;
  if (!stats) return "";
  const rows = [
    row("Imported samples", formatCount(stats.sample_count)),
    row("Valid samples", formatCount(stats.valid_sample_count)),
    row("No signal", formatCount(stats.no_signal_count)),
    row("Cell mismatch", formatCount(stats.cell_mismatch_count)),
    row("MAE", formatUnit(stats.mae_db, 1, "dB")),
    row("RMSE", formatUnit(stats.rmse_db, 1, "dB")),
    row("Median bias", formatUnit(stats.median_bias_db, 1, "dB")),
  ].filter((item) => item[1] !== null);
  if (rows.length === 0) return "";
  return `## Measurement Validation

${rows.length > 0 ? renderMarkdownTable(["Metric", "Value"], rows) : "Measurement metrics: Not available."}

The correction is a robust global path-loss bias, not full propagation calibration.`;
}

function renderPrintableMeasurement(view) {
  const stats = view.measurementAnalysis?.stats;
  if (!stats) return "";
  const rows = [
    row("Imported samples", formatCount(stats.sample_count)),
    row("Valid samples", formatCount(stats.valid_sample_count)),
    row("No signal", formatCount(stats.no_signal_count)),
    row("Cell mismatch", formatCount(stats.cell_mismatch_count)),
    row("MAE", formatUnit(stats.mae_db, 1, "dB")),
    row("RMSE", formatUnit(stats.rmse_db, 1, "dB")),
    row("Median bias", formatUnit(stats.median_bias_db, 1, "dB")),
  ].filter((item) => item[1] !== null);
  if (rows.length === 0) return "";
  return `<section data-report-section="measurement-validation"><h2>Measurement Validation</h2>${rows.length > 0 ? renderHtmlTable(["Metric", "Value"], rows) : `<p>Measurement metrics: ${REPORT_NOT_AVAILABLE}.</p>`}<p class="report-note">The correction is a robust global path-loss bias, not full propagation calibration.</p></section>`;
}

function renderMarkdownCoreLab(view) {
  const status = view.coreLab?.status;
  if (!view.coreLabEnabled || !view.coreLabApplicable || !status) return "";
  const topology = view.coreLab?.topology ?? {};
  const routeDecisions = topology.route_decisions ?? [];
  const directRoutes = routeDecisions.filter((route) => route.route_type === "direct_xn");
  const fallbackRoutes = routeDecisions.filter((route) => route.route_type === "ng_fallback");
  const rows = [
    row("Mode", status.mode),
    row("State", status.state),
    row("Source", status.source),
    row("Scenario", status.scenario ?? view.coreLab?.scenario),
    row("Xn availability", routeDecisions.length === 0 ? null : `${fallbackRoutes.length} fallback, ${directRoutes.length} direct`),
    row("Sessions", formatCount(view.coreLab?.sessions?.sessions?.length)),
  ].filter((item) => item[1] !== null);
  const functions = (status.functions ?? []).map((fn) => [fn.name, fn.status, formatUnit(fn.latency_ms, 0, "ms"), formatPercent(fn.load_pct, true)]);
  return `## Communication Path

${renderMarkdownTable(["Field", "Value"], rows)}${functions.length > 0 ? `\n\n${renderMarkdownTable(["Function", "Status", "Latency", "Load"], functions)}` : ""}`;
}

function renderPrintableCoreLab(view) {
  const status = view.coreLab?.status;
  if (!view.coreLabEnabled || !view.coreLabApplicable || !status) return "";
  const topology = view.coreLab?.topology ?? {};
  const routeDecisions = topology.route_decisions ?? [];
  const directRoutes = routeDecisions.filter((route) => route.route_type === "direct_xn");
  const fallbackRoutes = routeDecisions.filter((route) => route.route_type === "ng_fallback");
  const rows = [
    row("Mode", status.mode),
    row("State", status.state),
    row("Source", status.source),
    row("Scenario", status.scenario ?? view.coreLab?.scenario),
    row("Xn availability", routeDecisions.length === 0 ? null : `${fallbackRoutes.length} fallback, ${directRoutes.length} direct`),
    row("Sessions", formatCount(view.coreLab?.sessions?.sessions?.length)),
  ].filter((item) => item[1] !== null);
  const functions = (status.functions ?? []).map((fn) => [fn.name, fn.status, formatUnit(fn.latency_ms, 0, "ms"), formatPercent(fn.load_pct, true)]);
  return `<section data-report-section="communication-path"><h2>Communication Path</h2>${renderHtmlTable(["Field", "Value"], rows)}${functions.length > 0 ? `<h3>Core functions</h3>${renderHtmlTable(["Function", "Status", "Latency", "Load"], functions)}` : ""}</section>`;
}

function renderMarkdownRecommendations(view) {
  const recommendations = view.recommendations?.recommendations ?? [];
  if (recommendations.length === 0) return "";
  const rows = recommendations.map((candidate, index) => [index + 1, candidate.cell_id, formatAngle(candidate.optimal_azimuth), formatSigned(candidate.marginal_network_score, 1), candidate.reason]);
  return `## Candidate Cell Recommendations

${renderMarkdownTable(["Rank", "Cell", "Azimuth", "Raw marginal Δ", "Reason"], rows)}

Candidates are known planning records, not approved deployment sites. Interference is excluded from candidate scoring.`;
}

function renderPrintableRecommendations(view) {
  const recommendations = view.recommendations?.recommendations ?? [];
  if (recommendations.length === 0) return "";
  const rows = recommendations.map((candidate, index) => [index + 1, candidate.cell_id, formatAngle(candidate.optimal_azimuth), formatSigned(candidate.marginal_network_score, 1), candidate.reason]);
  return `<section data-report-section="candidate-recommendations"><h2>Candidate Cell Recommendations</h2>${renderHtmlTable(["Rank", "Cell", "Azimuth", "Raw marginal Δ", "Reason"], rows)}<p class="report-note">Candidates are known planning records, not approved deployment sites. The raw marginal delta is a legacy compatibility aggregate, not the normalized optimization score; interference is excluded from candidate scoring.</p></section>`;
}

function renderMarkdownSavedScenarios(view) {
  const scenarios = view.project?.scenarios ?? [];
  if (scenarios.length < 2) return "";
  const [first, second] = scenarios.slice(-2);
  const rows = [
    ["Average Rx", formatUnit(first.summary?.avgRxDBm, 1, "dBm"), formatUnit(second.summary?.avgRxDBm, 1, "dBm")],
    ["Gap ratio", formatPercent(first.summary?.gapPct, true), formatPercent(second.summary?.gapPct, true)],
    ["Optimization score", formatScore(first.summary?.networkScore), formatScore(second.summary?.networkScore)],
    ["Average SINR", formatUnit(first.summary?.avgSINRDB, 1, "dB"), formatUnit(second.summary?.avgSINRDB, 1, "dB")],
  ].filter((cells) => cells[1] !== null || cells[2] !== null);
  return rows.length > 0 ? `## Saved Scenario Comparison

${renderMarkdownTable(["Metric", first.name ?? "Scenario 1", second.name ?? "Scenario 2"], rows)}` : "";
}

function renderPrintableSavedScenarios(view) {
  const scenarios = view.project?.scenarios ?? [];
  if (scenarios.length < 2) return "";
  const [first, second] = scenarios.slice(-2);
  const rows = [
    ["Average Rx", formatUnit(first.summary?.avgRxDBm, 1, "dBm"), formatUnit(second.summary?.avgRxDBm, 1, "dBm")],
    ["Gap ratio", formatPercent(first.summary?.gapPct, true), formatPercent(second.summary?.gapPct, true)],
    ["Optimization score", formatScore(first.summary?.networkScore), formatScore(second.summary?.networkScore)],
    ["Average SINR", formatUnit(first.summary?.avgSINRDB, 1, "dB"), formatUnit(second.summary?.avgSINRDB, 1, "dB")],
  ].filter((cells) => cells[1] !== null || cells[2] !== null);
  return rows.length > 0 ? `<section data-report-section="saved-scenarios"><h2>Saved Scenario Comparison</h2>${renderHtmlTable(["Metric", first.name ?? "Scenario 1", second.name ?? "Scenario 2"], rows)}</section>` : "";
}

function buildReportComparisonRows(comparison) {
  if (!comparison) return [];
  if (comparison.type === "optimization" && comparison.metrics) {
    const definitions = [
      { key: "demand", label: "Demand served", kind: "ratio-count", direction: "higher", deltaUnit: "weight" },
      { key: "residential", label: "Residential", kind: "ratio-count", direction: "higher", deltaUnit: "buildings" },
      { key: "propagation_reach", label: "Propagation reach", kind: "ratio", direction: "higher", deltaUnit: "pp" },
      { key: "overlap", label: "Overlap ratio", kind: "ratio", direction: "lower", deltaUnit: "pp" },
      { key: "radio_quality", label: "Radio-quality serviceability", kind: "ratio", direction: "higher", deltaUnit: "pp" },
      { key: "overlap_buildings", label: "Overlap buildings", kind: "number", direction: "lower", deltaUnit: "buildings" },
      { key: "covered_units", label: "Covered units", kind: "number", direction: "informational", deltaUnit: "units" },
      { key: "score", label: "Optimization score", kind: "score", direction: "higher", deltaUnit: "points" },
    ];
    const rows = definitions.map((definition) => buildComparisonRow(definition, comparison.metrics[definition.key])).filter(Boolean);
    const constraints = comparison.metrics.constraints;
    if (constraints?.configured === false || (!constraints && comparison.type === "optimization")) {
      rows.push({ label: "Constraints", baseline: REPORT_NOT_CONFIGURED, optimized: REPORT_NOT_CONFIGURED, change: REPORT_NOT_CONFIGURED, status: "informational" });
    } else if (constraints?.available !== false && (constraints?.baseline !== undefined || constraints?.optimized !== undefined)) {
      const status = constraints.optimized === constraints.baseline ? "unchanged" : constraints.optimized ? "improved" : "worsened";
      rows.push({ label: "Constraints", baseline: formatConstraintValue(constraints.baseline, constraints.configured !== false), optimized: formatConstraintValue(constraints.optimized, constraints.configured !== false), change: formatStatusChange(status), status });
    }
    return rows;
  }
  return getComparisonMetrics(comparison).map((metric) => ({ label: metric.label, baseline: formatMetricValue(metric, metric.before), optimized: formatMetricValue(metric, metric.after), change: `${metric.deltaLabel} · ${formatStatusChange(metric.status)}`, status: metric.status }));
}

function buildComparisonRow(definition, metric) {
  if (!metric || metric.available === false) return null;
  const baseline = finiteOrNull(metric.baseline);
  const optimized = finiteOrNull(metric.optimized);
  if (baseline === null || optimized === null) return null;
  return { label: definition.label, baseline: formatComparisonValue(metric, definition.kind, baseline), optimized: formatComparisonValue(metric, definition.kind, optimized), change: formatComparisonChange(metric, definition), status: comparisonStatus(optimized - baseline, definition.direction) };
}

function formatComparisonValue(metric, kind, value) {
  if (kind === "ratio") return formatPercent(value, false) ?? REPORT_NOT_AVAILABLE;
  if (kind === "score") return formatNumberOrText(value, 1, " / 100");
  if (kind === "ratio-count") {
    const denominator = finiteOrNull(metric.denominator);
    if (denominator !== null && denominator > 0) return `${formatNumber(value, metric.metric === "residential" ? 0 : 1)} / ${formatNumber(denominator, metric.metric === "residential" ? 0 : 1)} (${formatPercent(value / denominator)})`;
    return formatNumberOrText(value, metric.metric === "residential" ? 0 : 1);
  }
  return formatNumberOrText(value, ["overlap_buildings", "covered_units"].includes(metric.metric) ? 0 : 1, ` ${definitionUnit(metric.metric)}`);
}

function formatComparisonChange(metric, definition) {
  const baseline = finiteOrNull(metric.baseline);
  const optimized = finiteOrNull(metric.optimized);
  if (baseline === null || optimized === null) return REPORT_NOT_AVAILABLE;
  const delta = optimized - baseline;
  let value;
  if (definition.kind === "ratio") value = `${formatSigned(delta * 100, 1)} pp`;
  else if (definition.kind === "ratio-count" && finiteOrNull(metric.denominator) !== null && Number(metric.denominator) > 0) value = `${formatSigned(delta, metric.metric === "residential" ? 0 : 1)} ${definition.deltaUnit} (${formatSigned(delta / Number(metric.denominator) * 100, 1)} pp)`;
  else if (definition.kind === "score") value = `${formatSigned(delta, 1)} points`;
  else value = `${formatSigned(delta, ["overlap_buildings", "covered_units", "residential"].includes(metric.metric) ? 0 : 1)} ${definition.deltaUnit}`;
  return `${value} · ${formatStatusChange(comparisonStatus(delta, definition.direction))}`;
}

function buildNetworkPerformanceRows(stats, objectiveStatus) {
  const raw = stats?.raw_metrics ?? stats?.rawMetrics ?? {};
  const rows = [];
  const score = normalizedNetworkScore(stats);
  if (score !== null) rows.push(["Optimization score", `${formatNumber(score, 1)} / 100`]);
  if (objectiveAvailable(objectiveStatus, "demand")) {
    const served = readNumeric(raw, "served_demand_weight", "servedDemandWeight", "served_weighted_demand", "servedWeightedDemand") ?? readNumeric(stats, "unique_demand_buildings", "uniqueDemandBuildings");
    const denominator = readNumeric(raw, "relevant_demand_weight", "relevantDemandWeight", "total_weighted_demand", "totalWeightedDemand");
    const value = formatRatioMetric(served, denominator, readNumeric(stats?.objectives, "demand"), 1, 1);
    if (value !== null) rows.push(["Demand served", value]);
  }
  if (objectiveAvailable(objectiveStatus, "residential")) {
    const covered = readNumeric(raw, "residential_covered", "residentialCovered") ?? readNumeric(stats, "unique_residential_buildings", "uniqueResidentialBuildings");
    const denominator = readNumeric(raw, "relevant_residential_total", "relevantResidentialTotal", "residential_total", "residentialTotal");
    const value = formatRatioMetric(covered, denominator, readNumeric(stats?.objectives, "residential"), 0, 1);
    if (value !== null) rows.push(["Residential", value]);
  }
  if (objectiveAvailable(objectiveStatus, "coverage")) {
    const reach = readNumeric(raw, "propagation_reach_score", "propagationReachScore", "coverage_reach_score", "coverageReachScore");
    const maximum = readNumeric(raw, "propagation_reach_maximum", "propagationReachMaximum", "coverage_reach_maximum", "coverageReachMaximum");
    const value = formatRatioMetric(reach, maximum, readNumeric(stats?.objectives, "coverage"), 1, 1);
    if (value !== null) rows.push(["Propagation reach", value]);
  }
  if (objectiveAvailable(objectiveStatus, "overlap")) {
    const ratio = readNumeric(raw, "overlap_ratio", "overlapRatio");
    const utility = readNumeric(stats?.objectives, "overlap");
    const value = ratio !== null ? formatPercent(ratio, false) : utility === null ? null : formatPercent(1 - utility, false);
    if (value !== null) rows.push(["Overlap ratio", value]);
  }
  if (isRadioQualityEvaluated(stats)) {
    const serviceable = readNumeric(raw, "radio_quality_serviceable_samples", "radioQualityServiceableSamples");
    const total = readNumeric(raw, "radio_quality_total_samples", "radioQualityTotalSamples");
    const fraction = readNumeric(raw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
    if (serviceable !== null && total !== null) {
      rows.push(["Radio-quality serviceability", `${formatCount(serviceable)} / ${formatCount(total)} (${formatPercent(fraction ?? (serviceable / total))})`]);
    }
    const p10Sinr = readNumeric(raw, "radio_quality_p10_sinr_db", "radioQualityP10SINRDB");
    const medianSinr = readNumeric(raw, "radio_quality_median_sinr_db", "radioQualityMedianSINRDB");
    if (p10Sinr !== null || medianSinr !== null) rows.push(["Radio-quality SINR", `p10 ${formatUnit(p10Sinr, 1, "dB")} · median ${formatUnit(medianSinr, 1, "dB")}`]);
    const p10Rsrp = readNumeric(raw, "radio_quality_p10_rsrp_dbm", "radioQualityP10RSRPDBm");
    const medianRsrp = readNumeric(raw, "radio_quality_median_rsrp_dbm", "radioQualityMedianRSRPDBm");
    if (p10Rsrp !== null || medianRsrp !== null) rows.push(["Radio-quality RSRP", `p10 ${formatUnit(p10Rsrp, 1, "dBm")} · median ${formatUnit(medianRsrp, 1, "dBm")}`]);
    const p10Rsrq = readNumeric(raw, "radio_quality_p10_rsrq_db", "radioQualityP10RSRQDB");
    const medianRsrq = readNumeric(raw, "radio_quality_median_rsrq_db", "radioQualityMedianRSRQDB");
    if (p10Rsrq !== null || medianRsrq !== null) rows.push(["Radio-quality RSRQ", `p10 ${formatUnit(p10Rsrq, 1, "dB")} · median ${formatUnit(medianRsrq, 1, "dB")}`]);
    const outage = raw.radio_quality_outage_by_reason ?? raw.radioQualityOutageByReason;
    if (outage && typeof outage === "object") rows.push(["Radio-quality outage reasons", formatCountMap(outage)]);
  }
  const coveredUnits = readNumeric(raw, "covered_units", "coveredUnits");
  if (coveredUnits !== null) rows.push(["Covered units", formatCount(coveredUnits)]);
  const overlapBuildings = readNumeric(raw, "overlap_buildings", "overlapBuildings") ?? readNumeric(stats, "overlap_buildings", "OverlapBuildings");
  if (overlapBuildings !== null) rows.push(["Overlap buildings", formatCount(overlapBuildings)]);
  return rows;
}

function formatRatioMetric(numerator, denominator, utility, numeratorDigits, denominatorDigits) {
  if (numerator !== null && denominator !== null && denominator > 0) return `${formatNumber(numerator, numeratorDigits)} / ${formatNumber(denominator, denominatorDigits)} (${formatPercent(numerator / denominator)})`;
  if (utility !== null) return formatPercent(utility, false);
  if (numerator !== null && denominator !== null) return `${formatNumber(numerator, numeratorDigits)} / ${formatNumber(denominator, denominatorDigits)}`;
  if (numerator !== null) return formatNumber(numerator, numeratorDigits);
  return null;
}

function buildRFPerformanceRows(report) {
  const simulationStats = report.simulation?.stats;
  if (!simulationStats && !report.simulation?.geojson?.features?.length) return [];
  return [
    ["Average received power", formatUnit(simulationStats?.avg_rx_dbm, 1, "dBm")],
    ["Maximum usable range", formatUnit(simulationStats?.max_range_m, 1, "m")],
    ["Minimum usable range", formatUnit(simulationStats?.min_range_m, 1, "m")],
    ["Blocked rays", formatPercent(simulationStats?.blocked_pct, true)],
    ["Rendered ray segments", formatCount(report.simulation?.geojson?.features?.length)],
  ].filter((item) => item[1] !== null);
}

function buildOptimizationDomainRows(view) {
  const domain = view.networkOptimization?.optimization_domain ?? view.comparison?.optimization_domain;
  const radio = view.networkOptimization?.optimization?.radio_quality ?? {};
  if (!domain) return [];
  return [
    row("Scope", humanizeOptimizationDomainValue(domain.source)),
    row("Selected cell count", formatCount(domain.selected_cell_count ?? domain.selectedCellCount)),
    row("Radius policy", humanizeOptimizationDomainValue(domain.radius_policy ?? domain.radiusPolicy)),
    row("Relevant buildings", formatCount(domain.relevant_building_entities ?? domain.relevantBuildingEntities)),
    row("Relevant demand entities", formatCount(domain.relevant_demand_entities ?? domain.relevantDemandEntities)),
    row("Relevant residential entities", formatCount(domain.relevant_residential_entities ?? domain.relevantResidentialEntities)),
    row("Radio-quality domain", humanizeOptimizationDomainValue(domain.radio_quality_domain_description ?? domain.radioQualityDomainDescription)),
    row("Radio-quality samples", formatCount(domain.radio_quality_sample_count ?? domain.radioQualitySampleCount)),
    row("Radio-quality spacing", formatUnit(domain.radio_quality_sample_spacing_m ?? domain.radioQualitySampleSpacingM, 1, "m")),
    row("Interference horizon", humanizeOptimizationDomainValue(domain.interference_horizon_description ?? domain.interferenceHorizonDescription)),
    row("Radio-quality policy", radio.policy_id ?? radio.radio_quality_policy_id),
    row("Radio-quality thresholds", radio.serviceability_rule ?? radio.radio_quality_serviceability_rule),
    row("Radio-quality horizon", radio.horizon_description ?? radio.interference_horizon_description),
  ].filter((item) => item[1] !== null);
}

function humanizeOptimizationDomainValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const knownLabels = {
    selected_cell_radius_union: "Selected-cell service-radius union",
    selected_cell_envelope: "Selected-cell service-radius envelope",
    cell_rf_profile_radius_m_else_request_radius_m: "Per-cell RF-profile radius, falling back to request radius",
    "per-cell profile radius": "Per-cell RF-profile radius",
  };
  if (knownLabels[normalized]) return knownLabels[normalized];
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildPriorityRows({ config, objectiveStatus, outcome }) {
  const configured = outcome?.configured_priorities ?? {};
  const configByID = new Map((config?.objectives ?? []).map((objective) => [objective.id, Number(objective.weight)]));
  const configuredTotal = REPORT_OBJECTIVES.reduce((sum, objective) => {
    const value = finiteOrNull(configured[objective.id]) ?? finiteOrNull(configByID.get(objective.id));
    return objectiveStatus?.[objective.id]?.available === false ? sum : sum + (value ?? 0);
  }, 0);
  const effective = outcome?.effective_weights ?? outcome?.normalized_weights ?? {};
  return REPORT_OBJECTIVES.map((objective) => {
    const configuredValue = finiteOrNull(configured[objective.id]) ?? finiteOrNull(configByID.get(objective.id));
    const effectiveValue = finiteOrNull(effective[objective.id]) ?? (configuredTotal > 0 && configuredValue !== null && objectiveStatus?.[objective.id]?.available !== false ? configuredValue / configuredTotal : null);
    if (configuredValue === null && effectiveValue === null && !objectiveStatus?.[objective.id]) return null;
    const status = objectiveStatus?.[objective.id];
    return [objective.label, configuredValue === null ? REPORT_NOT_AVAILABLE : `${formatNumber(configuredValue, 0)} / 100`, effectiveValue === null ? REPORT_NOT_AVAILABLE : `${formatNumber(effectiveValue * 100, 1)}%`, status?.available === false ? `Unavailable${status.reason ? `: ${status.reason}` : ""}` : "Available"];
  }).filter(Boolean);
}

function buildConstraintRows({ constraints, status }) {
  const definitions = [
    ["min_coverage_score", "Minimum propagation reach", (value) => `≥ ${formatNumber(value, 1)} score`],
    ["min_unique_demand_buildings", "Minimum demand buildings", (value) => `≥ ${formatCount(value)} buildings`],
    ["min_unique_residential_buildings", "Minimum residential buildings", (value) => `≥ ${formatCount(value)} buildings`],
    ["max_overlap_buildings", "Maximum overlap", (value) => `≤ ${formatCount(value)} buildings`],
  ];
  return definitions.map(([key, label, formatter]) => {
    const value = readNumeric(constraints, key);
    return value === null ? null : [label, formatter(value), status.label];
  }).filter(Boolean);
}

function buildDatasetRows(report) {
  const dataset = report.appMeta?.dataset ?? {};
  const contract = report.appMeta?.rf_contract
    ?? report.networkOptimization?.rf_contract
    ?? report.simulation?.rf_contract
    ?? report.coverageGaps?.rf_contract
    ?? report.interferenceAnalysis?.model?.rf_contract
    ?? {};
  const summary = report.buildingSummary ?? {};
  const interferenceRsrp = finiteOrNull(contract.interference_rsrp_threshold_dbm);
  const interferenceSinr = finiteOrNull(contract.interference_sinr_threshold_db);
  const interferenceRsrq = finiteOrNull(contract.interference_rsrq_threshold_db);
  return [
    row("Dataset", dataset.name),
    row("Dataset version", dataset.version),
    row("Manifest schema", dataset.schema_version),
    row("Total buildings", formatCount(summary.total_buildings)),
    row("Demand-weighted buildings", formatCount(summary.demand_weighted_buildings)),
    row("Residential buildings", formatCount(summary.residential_weighted_buildings)),
    row("Material metadata coverage", formatPercent(summary.material_metadata_coverage_pct, false)),
    row("Sources", Array.isArray(dataset.sources) && dataset.sources.length ? dataset.sources.join(", ") : null),
    row("Licenses", Array.isArray(dataset.licenses) && dataset.licenses.length ? dataset.licenses.join(", ") : null),
    row("Confidence", dataset.confidence),
    row("Pack QA", dataset.quality?.summary),
    row("Requested coverage", formatPercent(dataset.quality?.coverage?.coverage_ratio, false)),
    row("Layers", dataset.layers ? Object.keys(dataset.layers).join(", ") : null),
    row("Hashed files", dataset.sha256 ? formatCount(Object.keys(dataset.sha256).length) : null),
    row("Model version", report.appMeta?.model_version),
    row("RF model", report.appMeta?.model_id ?? contract.model_id),
    row("RF model scope", report.appMeta?.model_description ?? contract.model_description),
    row("Applied RF model", contract.applied_model_id),
    row("RF applicability", contract.applicability),
    row("RF fallback", contract.fallback_model_id ? `${contract.fallback_model_id} · ${contract.fallback_policy ?? "explicit fallback"}` : null),
    row("Building service threshold", formatUnit(contract.building_service_threshold_dbm, 1, "dBm")),
    row("Receiver sensitivity scope", contract.receiver_sensitivity_scope),
    row("Receiver sensitivity equation", contract.receiver_sensitivity_equation),
    row("Receiver noise semantics", contract.receiver_noise_semantics),
    row("Interference serviceability", interferenceRsrp !== null && interferenceSinr !== null && interferenceRsrq !== null
      ? `RSRP ≥ ${formatUnit(interferenceRsrp, 1, "dBm")} · SINR ≥ ${formatUnit(interferenceSinr, 1, "dB")} · RSRQ ≥ ${formatUnit(interferenceRsrq, 1, "dB")}`
      : null),
    row("Application version", report.appMeta?.application_version),
    row("Optimization run", report.networkOptimization?.optimization_run_id),
  ].filter((item) => item[1] !== null);
}

function buildCellExplanationRows(effect) {
  const definitions = [["demand", "Demand served", "weight"], ["residential", "Residential", "count"], ["propagation_reach", "Propagation reach", "ratio"], ["overlap", "Overlap ratio", "ratio"], ["radio_quality", "Radio quality", "ratio"], ["overlap_buildings", "Overlap buildings", "count"], ["covered_units", "Covered units", "count"], ["score", "Optimization score", "score"]];
  return definitions.map(([key, label, kind]) => {
    const metric = effect.metrics?.[key];
    if (!metric || metric.available === false) return null;
    const selected = formatCellMetricValue(metric, kind, "actual");
    const reverted = formatCellMetricValue(metric, kind, "counterfactual");
    return selected === null || reverted === null ? null : [label, selected, reverted, `${formatCellMetricDelta(metric, kind)} · ${formatStatusChange(metric.outcome)}`];
  }).filter(Boolean);
}

function formatCellMetricValue(metric, kind, side) {
  const value = finiteOrNull(metric?.[side]);
  if (value === null) return null;
  if (kind === "ratio") return formatPercent(value, false);
  if (kind === "score") return formatNumber(value, 1);
  const denominator = finiteOrNull(metric.denominator);
  if (denominator !== null && denominator > 0) return `${formatNumber(value, kind === "weight" ? 1 : 0)} / ${formatNumber(denominator, kind === "weight" ? 1 : 0)} (${formatPercent(value / denominator)})`;
  return kind === "weight" ? formatNumber(value, 1) : formatCount(value);
}

function formatCellMetricDelta(metric, kind) {
  const delta = finiteOrNull(metric?.absolute_delta);
  if (delta === null) return REPORT_NOT_AVAILABLE;
  if (kind === "ratio") return `${formatSigned(delta * 100, 1)} pp`;
  if (kind === "score") return `${formatSigned(delta, 1)} points`;
  return formatSigned(delta, kind === "weight" ? 1 : 0);
}

function buildParetoHeaders(view) {
  const headers = ["Rank", "Score"];
  for (const [id, label] of [["demand", "Demand"], ["residential", "Residential"], ["coverage", "Propagation reach"], ["overlap", "Overlap"], ["radio_quality", "Radio quality"]]) {
    if (view.paretoSolutions.some((solution) => formatSolutionMetric(solution.stats, id, view.objectiveStatus) !== null)) headers.push(label);
  }
  return headers;
}

function buildParetoRow(solution, view, index) {
  const id = String(solution.id ?? "");
  const recommendedID = String(view.networkOptimization?.optimization?.recommended_solution_id ?? view.recommendedSolution?.id ?? "");
  const rowValues = [id && id === recommendedID ? `#${index + 1} Recommended` : `#${index + 1}`, formatScore(solution.stats ?? solution)];
  for (const [idKey] of [["demand"], ["residential"], ["coverage"], ["overlap"], ["radio_quality"]]) {
    const hasColumn = view.paretoSolutions.some((candidate) => formatSolutionMetric(candidate.stats, idKey, view.objectiveStatus) !== null);
    if (hasColumn) rowValues.push(formatSolutionMetric(solution.stats, idKey, view.objectiveStatus) ?? REPORT_NOT_AVAILABLE);
  }
  return rowValues;
}

function formatSolutionMetric(stats, id, objectiveStatus) {
  if (objectiveStatus?.[id]?.available === false) return null;
  const raw = stats?.raw_metrics ?? stats?.rawMetrics ?? {};
  const utilities = stats?.objectives ?? stats?.objectives_normalized ?? {};
  if (id === "demand") {
    const served = readNumeric(raw, "served_demand_weight", "servedDemandWeight", "served_weighted_demand", "servedWeightedDemand");
    const total = readNumeric(raw, "relevant_demand_weight", "relevantDemandWeight", "total_weighted_demand", "totalWeightedDemand");
    return served !== null && total !== null && total > 0 ? formatPercent(served / total, false) : finiteOrNull(utilities.demand) === null ? null : formatPercent(utilities.demand, false);
  }
  if (id === "residential") {
    const covered = readNumeric(raw, "residential_covered", "residentialCovered");
    const total = readNumeric(raw, "relevant_residential_total", "relevantResidentialTotal", "residential_total", "residentialTotal");
    return covered !== null && total !== null && total > 0 ? formatPercent(covered / total, false) : finiteOrNull(utilities.residential) === null ? null : formatPercent(utilities.residential, false);
  }
  if (id === "coverage") {
    const reach = readNumeric(raw, "propagation_reach_score", "propagationReachScore", "coverage_reach_score", "coverageReachScore");
    const maximum = readNumeric(raw, "propagation_reach_maximum", "propagationReachMaximum", "coverage_reach_maximum", "coverageReachMaximum");
    return reach !== null && maximum !== null && maximum > 0 ? formatPercent(reach / maximum, false) : finiteOrNull(utilities.coverage) === null ? null : formatPercent(utilities.coverage, false);
  }
  if (id === "radio_quality") {
    const fraction = readNumeric(raw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
    return fraction !== null ? formatPercent(fraction, false) : finiteOrNull(utilities.radio_quality) === null ? null : formatPercent(utilities.radio_quality, false);
  }
  const ratio = readNumeric(raw, "overlap_ratio", "overlapRatio");
  return ratio !== null ? formatPercent(ratio, false) : finiteOrNull(utilities.overlap) === null ? null : formatPercent(1 - Number(utilities.overlap), false);
}

function renderMarkdownCellConfigurationTable(view) {
  const baselineByID = new Map((view.networkOptimization?.baseline?.cell_configurations ?? []).map((configuration) => [String(configuration.id), configuration]));
  const hasBaseline = baselineByID.size > 0;
  const rows = view.recommendedConfigurations.map((configuration) => {
    const baseline = baselineByID.get(String(configuration.id));
    const recommended = finiteOrNull(configuration.azimuth_deg);
    const baselineAzimuth = finiteOrNull(baseline?.azimuth_deg);
    return hasBaseline
      ? [configuration.id, baselineAzimuth === null ? REPORT_NOT_AVAILABLE : `${formatNumber(baselineAzimuth, 0)}°`, recommended === null ? REPORT_NOT_AVAILABLE : `${formatNumber(recommended, 0)}°`, baselineAzimuth === null || recommended === null ? REPORT_NOT_AVAILABLE : angleChanged(baselineAzimuth, recommended) ? "Changed" : "Unchanged"]
      : [configuration.id, recommended === null ? REPORT_NOT_AVAILABLE : `${formatNumber(recommended, 0)}°`];
  });
  return hasBaseline ? renderMarkdownTable(["Cell", "Baseline", "Recommended", "Status"], rows) : renderMarkdownTable(["Cell", "Selected azimuth"], rows);
}

function renderHtmlCellConfigurationTable(view) {
  const baselineByID = new Map((view.networkOptimization?.baseline?.cell_configurations ?? []).map((configuration) => [String(configuration.id), configuration]));
  const hasBaseline = baselineByID.size > 0;
  const rows = view.recommendedConfigurations.map((configuration) => {
    const baseline = baselineByID.get(String(configuration.id));
    const recommended = finiteOrNull(configuration.azimuth_deg);
    const baselineAzimuth = finiteOrNull(baseline?.azimuth_deg);
    return hasBaseline
      ? [configuration.id, baselineAzimuth === null ? REPORT_NOT_AVAILABLE : `${formatNumber(baselineAzimuth, 0)}°`, recommended === null ? REPORT_NOT_AVAILABLE : `${formatNumber(recommended, 0)}°`, baselineAzimuth === null || recommended === null ? REPORT_NOT_AVAILABLE : angleChanged(baselineAzimuth, recommended) ? "Changed" : "Unchanged"]
      : [configuration.id, recommended === null ? REPORT_NOT_AVAILABLE : `${formatNumber(recommended, 0)}°`];
  });
  return hasBaseline ? renderHtmlTable(["Cell", "Baseline", "Recommended", "Status"], rows) : renderHtmlTable(["Cell", "Selected azimuth"], rows);
}

function renderMarkdownTable(headers, rows) {
  const safeRows = (rows ?? []).map(normalizeTableRow).filter(Boolean);
  if (!safeRows.length) return "";
  return `| ${headers.map(markdownText).join(" | ")} |\n|${headers.map(() => "---").join("|")} |\n${safeRows.map((cells) => `| ${cells.map(markdownText).join(" | ")} |`).join("\n")}`;
}

function renderHtmlTable(headers, rows, className = "") {
  const safeRows = (rows ?? []).map(normalizeTableRow).filter(Boolean);
  if (!safeRows.length) return "";
  const headerHTML = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowHTML = safeRows.map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<div class="report-table-wrap"><table${className ? ` class="${escapeHtml(className)}"` : ""}><thead><tr>${headerHTML}</tr></thead><tbody>${rowHTML}</tbody></table></div>`;
}

function normalizeTableRow(cells) {
  if (!Array.isArray(cells)) return null;
  return cells.map((cell) => cell === null || cell === undefined || cell === "" ? REPORT_NOT_AVAILABLE : String(cell));
}

function row(label, value) {
  return [label, value === null || value === undefined || value === "" ? null : value];
}

function markdownText(value) {
  return String(value ?? REPORT_NOT_AVAILABLE).replace(/\|/g, "\\|");
}

function formatText(value) {
  return value === null || value === undefined || value === "" ? REPORT_NOT_AVAILABLE : String(value);
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

function formatCountMap(values) {
  if (!values || typeof values !== "object") return REPORT_NOT_AVAILABLE;
  const entries = Object.entries(values)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([key, value]) => `${key}: ${formatCount(value)}`).join(" · ") : REPORT_NOT_AVAILABLE;
}

function formatScore(value) {
  const numeric = normalizedNetworkScore(value);
  return numeric === null ? null : `${formatNumber(numeric, 1)} / 100`;
}

function formatAngle(value) {
  const numeric = finiteOrNull(value);
  return numeric === null ? null : `${formatNumber(normalizeDegrees(numeric), 0)}°`;
}

function formatNumberOrText(value, digits, suffix = "") {
  const numeric = finiteOrNull(value);
  return numeric === null ? null : `${formatNumber(numeric, digits)}${suffix}`;
}

function formatSigned(value, digits) {
  const numeric = finiteOrNull(value);
  if (numeric === null) return REPORT_NOT_AVAILABLE;
  return `${numeric > 0 ? "+" : ""}${formatNumber(numeric, digits)}`;
}

function formatStatusChange(status) {
  return ({ improved: "improved", worsened: "worsened", unchanged: "unchanged", flat: "unchanged", informational: "informational" })[status] ?? "informational";
}

function formatConstraintValue(value, configured = true) {
  if (!configured) return REPORT_NOT_CONFIGURED;
  if (value === true) return "Satisfied";
  if (value === false) return "Not satisfied";
  return REPORT_NOT_AVAILABLE;
}

function getConstraintStatus({ constraints, comparison, hasResult, outcome, resultStats }) {
  if (Object.keys(constraints ?? {}).length === 0) return { label: REPORT_NOT_CONFIGURED, value: null, configured: false };
  const candidate = comparison?.type === "optimization" ? comparison.optimized_solution?.constraints_satisfied : outcome?.constraints_satisfied ?? resultStats?.constraints_satisfied;
  if (candidate === true) return { label: "Satisfied", value: true, configured: true };
  if (candidate === false) return { label: "Not satisfied", value: false, configured: true };
  return { label: hasResult ? REPORT_NOT_AVAILABLE : REPORT_NOT_AVAILABLE, value: null, configured: true };
}

function objectiveAvailable(status, id) {
  return status?.[id]?.available !== false;
}

function mergeObjectiveStatus(...statusMaps) {
  const merged = {};
  for (const map of statusMaps) {
    for (const [id, value] of Object.entries(map ?? {})) {
      if (!value || typeof value !== "object") continue;
      if (value.available === false) merged[id] = { ...merged[id], ...value, available: false };
      else if (!merged[id]) merged[id] = { ...value };
    }
  }
  return merged;
}

function resolveReportMode({ comparison, networkOptimization, networkTowers, planningMode }) {
  if (planningMode === "network") return "network";
  if (comparison?.kind === "network" || comparison?.type === "optimization") return "network";
  if ((networkTowers?.length ?? 0) > 1) return "network";
  if ((networkOptimization?.optimized_towers?.length ?? 0) > 1) return "network";
  if (networkOptimization?.optimization_domain?.selected_cell_count > 1) return "network";
  return "single-cell";
}

function resolveReportNetworkTowers({ networkOptimization, selectedNetworkTowers, selectedTower }) {
  if (Array.isArray(selectedNetworkTowers) && selectedNetworkTowers.length > 0) return selectedNetworkTowers;
  const baseline = networkOptimization?.baseline?.cell_configurations ?? [];
  if (baseline.length > 0) {
    return baseline.map((configuration) => ({ ...configuration, id: configuration.id, cellId: configuration.id, coordinates: [configuration.tower_lon, configuration.tower_lat], rfProfile: snapshotRFProfileToOverride(configuration.rf_profile) }));
  }
  if (Array.isArray(networkOptimization?.optimized_towers) && networkOptimization.optimized_towers.length > 0) {
    return networkOptimization.optimized_towers.map((tower) => ({ ...tower, id: tower.id, cellId: tower.id, rfProfile: snapshotRFProfileToOverride(tower.rf_profile) }));
  }
  return selectedTower ? [selectedTower] : [];
}

function buildReportRFProfiles({ networkTowers, reportMode, selectedTower, settings }) {
  const towers = reportMode === "network" ? networkTowers : [selectedTower ?? networkTowers[0]].filter(Boolean);
  return towers.map((tower, index) => ({ cellId: tower.cellId ?? tower.id, ...resolveRFProfile(tower, settings, index) }));
}

function resolveRecommendedSolution(networkOptimization) {
  const frontier = Array.isArray(networkOptimization?.pareto_frontier) ? networkOptimization.pareto_frontier : [];
  if (frontier.length === 0) return null;
  const requestedID = networkOptimization?.optimization?.recommended_solution_id;
  return frontier.find((solution) => String(solution.id) === String(requestedID)) ?? frontier[0];
}

function buildRecommendedConfigurations({ networkOptimization, networkTowers, recommendedSolution }) {
  const baseline = networkOptimization?.baseline?.cell_configurations ?? [];
  const baselineByID = new Map(baseline.map((configuration) => [String(configuration.id), configuration]));
  const optimizedByID = new Map((networkOptimization?.optimized_towers ?? []).map((tower) => [String(tower.id), tower]));
  const solutionByID = new Map((recommendedSolution?.towers ?? []).map((tower) => [String(tower.id), tower]));
  const ids = [...new Set([...networkTowers.map((tower) => String(tower.cellId ?? tower.id)), ...baseline.map((configuration) => String(configuration.id)), ...solutionByID.keys()])];
  return ids.map((id) => {
    const baselineConfiguration = baselineByID.get(id);
    const optimizedTower = optimizedByID.get(id);
    const solutionTower = solutionByID.get(id);
    const tower = networkTowers.find((candidate) => String(candidate.cellId ?? candidate.id) === id);
    return {
      id,
      azimuth_deg: finiteOrNull(solutionTower?.azimuth_deg) ?? finiteOrNull(optimizedTower?.optimal_azimuth) ?? finiteOrNull(tower?.azimuth),
      baseline_azimuth_deg: finiteOrNull(baselineConfiguration?.azimuth_deg),
      tower_lon: finiteOrNull(baselineConfiguration?.tower_lon) ?? finiteOrNull(tower?.coordinates?.[0]),
      tower_lat: finiteOrNull(baselineConfiguration?.tower_lat) ?? finiteOrNull(tower?.coordinates?.[1]),
    };
  });
}

function normalizeCellExplanations(explanations, config, recommendedSolutionID = null) {
  const candidates = explanations instanceof Map ? [...explanations.values()] : Array.isArray(explanations) ? explanations : [];
  const unique = new Map();
  for (const candidate of candidates) {
    const input = candidate?.result ?? candidate;
    const effect = candidate?.view?.metrics ? candidate.view : buildCellMarginalEffectView(input, config);
    if (!effect || effect.available === false || effect.unchanged || !angleChanged(effect.cell?.baseline_azimuth_deg, effect.cell?.selected_azimuth_deg)) continue;
    if (recommendedSolutionID !== null && recommendedSolutionID !== undefined && String(effect.solution_id) !== String(recommendedSolutionID)) continue;
    const key = `${effect.run_id ?? ""}::${effect.solution_id ?? ""}::${effect.cell?.id ?? ""}`;
    unique.set(key, effect);
  }
  return [...unique.values()];
}

function buildReportId(report) {
  const prefix = report.reportMode === "network" ? "atom-network" : "atom-cell";
  const identity = report.reportMode === "network" ? report.project?.name ?? "planning" : report.selectedTower?.cellId ?? report.networkTowers[0]?.cellId ?? "unselected";
  return `${prefix}-${slugify(identity)}-${formatDateSlug(report.generatedAt)}`;
}

function getScenarioName(project) {
  const active = project?.scenarios?.find((scenario) => scenario.id === project.activeScenarioId);
  return active?.name ?? project?.name ?? null;
}

function snapshotRFProfileToOverride(profile = {}) {
  if (!profile || typeof profile !== "object") return {};
  return {
    networkTech: profile.network_tech ?? profile.networkTech,
    frequencyGHz: profile.frequency_ghz ?? profile.frequencyGHz,
    band: profile.band,
    bandwidthMHz: profile.bandwidth_mhz ?? profile.bandwidthMHz,
    channelId: profile.channel_id ?? profile.channelId,
    duplexMode: profile.duplex_mode ?? profile.duplexMode,
    txPowerDbm: profile.tx_power_dbm ?? profile.txPowerDbm,
    antennaGainDbi: profile.tx_antenna_gain_dbi ?? profile.txAntennaGainDbi ?? profile.antenna_gain_dbi ?? profile.antennaGainDbi,
    rxAntennaGainDbi: profile.rx_antenna_gain_dbi ?? profile.rxAntennaGainDbi,
    systemLossDb: profile.system_loss_db ?? profile.systemLossDb,
    polarizationLossDb: profile.polarization_loss_db ?? profile.polarizationLossDb,
    radiusMeters: profile.radius_m ?? profile.radiusMeters,
    beamWidthDeg: profile.beam_width ?? profile.beamWidthDeg,
    antennaHeightM: profile.antenna_height_m ?? profile.antennaHeightM,
    mechanicalDowntiltDeg: profile.mechanical_downtilt_deg ?? profile.mechanicalDowntiltDeg,
    electricalDowntiltDeg: profile.electrical_downtilt_deg ?? profile.electricalDowntiltDeg,
    orientationDeg: profile.orientation_deg ?? profile.orientationDeg,
    horizontalPatternId: profile.horizontal_pattern_id ?? profile.horizontalPatternId,
    verticalPatternId: profile.vertical_pattern_id ?? profile.verticalPatternId,
    loadFactor: profile.load_factor ?? profile.loadFactor,
    reuseFactor: profile.reuse_factor ?? profile.reuseFactor,
    pci: profile.pci,
    receiverHeightM: profile.receiver_height_m ?? profile.receiverHeightM,
    receiverSensitivityDbm: profile.receiver_sensitivity_dbm ?? profile.receiverSensitivityDbm,
    receiverSensitivityMode: profile.receiver_sensitivity_mode ?? profile.receiverSensitivityMode,
    receiverNoiseBandwidthHz: profile.receiver_noise_bandwidth_hz ?? profile.receiverNoiseBandwidthHz,
    receiverNoiseBandwidthSource: profile.receiver_noise_bandwidth_source ?? profile.receiverNoiseBandwidthSource,
    receiverNoiseFigureDb: profile.receiver_noise_figure_db ?? profile.receiverNoiseFigureDb,
    receiverRequiredSnrDb: profile.receiver_required_snr_db ?? profile.receiverRequiredSnrDb,
    receiverMarginDb: profile.receiver_margin_db ?? profile.receiverMarginDb,
  };
}

function buildMapSvg({ activeNetworkTech, coverageGaps, interference, networkTowers = [], recommendedConfigurations = [], selectedTower, settings = {}, simulation }) {
  const allLineFeatures = (simulation?.features ?? []).filter((feature) => feature.geometry?.type === "LineString" && feature.geometry.coordinates?.length >= 2 && feature.geometry.coordinates.every(isCoordinate));
  const lineFeatures = sampleFeatures(allLineFeatures, MAX_REPORT_MAP_RAYS);
  const gapFeatures = (coverageGaps?.features ?? []).filter((feature) => feature.geometry?.type === "Point" && isCoordinate(feature.geometry.coordinates)).slice(0, MAX_REPORT_MAP_GAPS);
  const allInterferenceFeatures = (interference?.features ?? []).filter((feature) => feature.geometry?.type === "Point");
  const interferenceFeatures = sampleFeatures(allInterferenceFeatures.filter((feature) => isCoordinate(feature.geometry.coordinates)), MAX_REPORT_MAP_INTERFERENCE_POINTS);
  const mapTowers = networkTowers.length > 0 ? networkTowers : [selectedTower].filter(Boolean);
  const hasMapGeometry = mapTowers.some((tower) => isCoordinate(tower.coordinates))
    || allLineFeatures.length > 0
    || gapFeatures.length > 0
    || interferenceFeatures.length > 0;
  if (!hasMapGeometry) return "";
  const fallbackCoordinate = mapTowers.find((tower) => isCoordinate(tower.coordinates))?.coordinates;
  const allCoordinates = [];
  mapTowers.forEach((tower) => { if (isCoordinate(tower.coordinates)) allCoordinates.push(tower.coordinates); });
  lineFeatures.forEach((feature) => feature.geometry.coordinates.forEach((coordinate) => allCoordinates.push(coordinate)));
  gapFeatures.forEach((feature) => allCoordinates.push(feature.geometry.coordinates));
  interferenceFeatures.forEach((feature) => allCoordinates.push(feature.geometry.coordinates));
  const bounds = getCoordinateBounds(allCoordinates, fallbackCoordinate);
  const project = ([lon, lat]) => [SVG_PADDING + ((lon - bounds.minLon) / Math.max(bounds.maxLon - bounds.minLon, 0.000001)) * (SVG_WIDTH - SVG_PADDING * 2), SVG_HEIGHT - SVG_PADDING - ((lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.000001)) * (SVG_HEIGHT - SVG_PADDING * 2)];
  const paths = lineFeatures.map((feature) => {
    const points = feature.geometry.coordinates.map(project);
    const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const signal = Number(feature.properties?.signal_dbm ?? -120);
    return `<path d="${path}" fill="none" stroke="${rxPowerColor(signal)}" stroke-width="4" stroke-linecap="round" opacity="0.78" />`;
  }).join("\n");
  const gaps = gapFeatures.map((feature) => {
    const [x, y] = project(feature.geometry.coordinates);
    const isOutage = feature.properties?.severity === "outage";
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isOutage ? 4.6 : 4}" fill="${isOutage ? "#e11d48" : "#f59e0b"}" stroke="${isOutage ? "#881337" : "#92400e"}" stroke-width="1.4" opacity="0.82" />`;
  }).join("\n");
  const interferencePoints = interferenceFeatures.map((feature) => {
    const [x, y] = project(feature.geometry.coordinates);
    const rawSINR = feature.properties?.sinr_db;
    const sinr = rawSINR === null || rawSINR === undefined ? Number.NaN : Number(rawSINR);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${interferenceReportColor(sinr)}" opacity="0.5" />`;
  }).join("\n");
  const configurationByID = new Map(recommendedConfigurations.map((configuration) => [String(configuration.id), configuration]));
  const towerMarkers = mapTowers.map((tower, index) => {
    if (!isCoordinate(tower.coordinates)) return "";
    const [x, y] = project(tower.coordinates);
    const id = String(tower.cellId ?? tower.id ?? index + 1);
    const configuration = configurationByID.get(id);
    const azimuth = configuration?.azimuth_deg ?? tower.azimuth;
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="#ffffff" stroke="#0b4f49" stroke-width="3" /><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#0f766e" /><text x="${(x + 12).toFixed(1)}" y="${(y - 10).toFixed(1)}" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#14201c">${escapeSvgText(`Cell ${id}`)}</text><text x="${(x + 12).toFixed(1)}" y="${(y + 5).toFixed(1)}" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="700" fill="#52615a">${escapeSvgText(formatAngle(azimuth) ?? "Azimuth not available")}</text></g>`;
  }).join("\n");
  const title = mapTowers.length > 1 ? `Network · ${mapTowers.length} cells · ${activeNetworkTech ?? "Network"}` : `Cell ${mapTowers[0]?.cellId ?? selectedTower?.cellId ?? "unselected"} · ${activeNetworkTech ?? "Network"}`;
  const detail = mapTowers.length > 1 ? `${lineFeatures.length} of ${allLineFeatures.length} RF paths · ${formatUnit(settings.radiusMeters, 0, "m") ?? "Radius not available"} radius` : `${formatAngle(settings.azimuthDeg) ?? "Azimuth not available"} azimuth · ${formatUnit(settings.beamWidthDeg, 0, "°") ?? "Beam not available"} beam · ${formatUnit(settings.radiusMeters, 0, "m") ?? "Radius not available"} radius`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="A.T.O.M RF planning map export"><rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#e8eef1" /><path d="M 0 ${SVG_HEIGHT * 0.28} C ${SVG_WIDTH * 0.24} ${SVG_HEIGHT * 0.2}, ${SVG_WIDTH * 0.5} ${SVG_HEIGHT * 0.36}, ${SVG_WIDTH} ${SVG_HEIGHT * 0.24}" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.76" /><path d="M ${SVG_WIDTH * 0.18} 0 C ${SVG_WIDTH * 0.24} ${SVG_HEIGHT * 0.3}, ${SVG_WIDTH * 0.14} ${SVG_HEIGHT * 0.56}, ${SVG_WIDTH * 0.22} ${SVG_HEIGHT}" fill="none" stroke="#ffffff" stroke-width="14" opacity="0.7" /><g opacity="0.36" stroke="#9fb0a9" stroke-width="1">${Array.from({ length: 8 }, (_, index) => `<line x1="${SVG_PADDING}" y1="${SVG_PADDING + index * 54}" x2="${SVG_WIDTH - SVG_PADDING}" y2="${SVG_PADDING + index * 54}" />`).join("")}${Array.from({ length: 11 }, (_, index) => `<line x1="${SVG_PADDING + index * 64}" y1="${SVG_PADDING}" x2="${SVG_PADDING + index * 64}" y2="${SVG_HEIGHT - SVG_PADDING}" />`).join("")}</g><g>${interferencePoints}</g><g>${paths}</g><g>${gaps}</g><g>${towerMarkers}</g><g transform="translate(18 18)"><rect width="340" height="66" rx="8" fill="rgba(255,255,255,0.92)" stroke="#d7e1dc" /><text x="14" y="25" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="#14201c">${escapeSvgText(title)}</text><text x="14" y="47" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="#52615a">${escapeSvgText(detail)}</text></g><g transform="translate(${SVG_WIDTH - 204} ${SVG_HEIGHT - 70})"><rect width="186" height="52" rx="8" fill="rgba(255,255,255,0.9)" stroke="#d7e1dc" /><circle cx="18" cy="18" r="5" fill="#10b981" /><text x="31" y="22" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#52615a">strong</text><circle cx="82" cy="18" r="5" fill="#f59e0b" /><text x="95" y="22" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#52615a">medium</text><circle cx="18" cy="37" r="5" fill="#e11d48" /><text x="31" y="41" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#52615a">weak / gap</text></g></svg>`;
}

function sampleFeatures(features, maximum) {
  if (features.length <= maximum) return features;
  const stride = features.length / maximum;
  return Array.from({ length: maximum }, (_, index) => features[Math.min(features.length - 1, Math.floor(index * stride))]);
}

function getCoordinateBounds(coordinates, fallbackCoordinate) {
  const validCoordinates = coordinates.filter(isCoordinate);
  if (validCoordinates.length === 0 && isCoordinate(fallbackCoordinate)) validCoordinates.push(fallbackCoordinate);
  if (validCoordinates.length === 0) validCoordinates.push([32.8541, 39.9208]);
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

function isCoordinate(coordinate) {
  return Array.isArray(coordinate) && Number.isFinite(Number(coordinate[0])) && Number.isFinite(Number(coordinate[1]));
}

function interferenceReportColor(sinr) {
  if (!Number.isFinite(sinr)) return "#64748b";
  if (sinr < 0) return "#be123c";
  if (sinr < 13) return "#d97706";
  if (sinr < 20) return "#2563eb";
  return "#0f766e";
}

function getTopCoverageGaps(geojson) {
  return [...(geojson?.features ?? [])].map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates ?? [];
    return { demand: finiteOrNull(properties.total_demand) ?? 0, id: properties.building_id, lat: coordinates[1], lon: coordinates[0], reason: properties.reason ?? "demand", rx: finiteOrNull(properties.rx_dbm), severity: properties.severity ?? "weak" };
  }).filter((gap) => Number.isFinite(gap.lon) && Number.isFinite(gap.lat)).sort((left, right) => right.demand - left.demand).slice(0, 8);
}

function renderMarkdownGapTable(gaps) {
  return renderMarkdownTable(["Building", "Severity", "Rx", "Demand", "Reason", "Coordinate"], gaps.map((gap) => [gap.id, gap.severity, formatUnit(gap.rx, 1, "dBm"), formatNumberOrText(gap.demand, 1), gap.reason, `${formatNumber(gap.lon, 6)}, ${formatNumber(gap.lat, 6)}`]));
}

function renderHtmlGapTable(gaps) {
  return renderHtmlTable(["Building", "Severity", "Rx", "Demand", "Reason", "Coordinate"], gaps.map((gap) => [gap.id, gap.severity, formatUnit(gap.rx, 1, "dBm"), formatNumberOrText(gap.demand, 1), gap.reason, `${formatNumber(gap.lon, 6)}, ${formatNumber(gap.lat, 6)}`]));
}

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

function formatMetricValue(metric, value) {
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

function comparisonStatus(delta, direction) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.000001) return "unchanged";
  if (direction === "informational") return "informational";
  if (direction === "lower") return delta < 0 ? "improved" : "worsened";
  return delta > 0 ? "improved" : "worsened";
}

function definitionUnit(metric) {
  if (metric === "overlap_buildings") return "buildings";
  if (metric === "covered_units") return "units";
  return "value";
}

function readNumeric(source, ...keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(numeric) ? null : numeric;
}

function angleChanged(left, right) {
  const delta = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(delta, 360 - delta) > 0.000001;
}

function normalizeDegrees(value) {
  return ((Number(value) % 360) + 360) % 360;
}

function totalTilt(profile) {
  return (finiteOrNull(profile?.mechanicalDowntiltDeg) ?? 0) + (finiteOrNull(profile?.electricalDowntiltDeg) ?? 0);
}

function formatDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : REPORT_NOT_AVAILABLE;
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDateSlug(date) {
  return date.toISOString().slice(0, 19).replace(/[-:T]/g, "");
}

function slugify(value) {
  const slug = String(value ?? "planning").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "planning";
}

function escapeSvgText(value) {
  return escapeHtml(value);
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
