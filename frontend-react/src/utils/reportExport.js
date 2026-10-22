import { areaOfInterestRows } from "./areaOfInterest.js";
import { reportFilename } from "./downloadNames.js";
import { formatMetricValue, getComparisonMetrics } from "./comparisonCharts.js";
import { normalizedNetworkScore } from "./appWorkspace.js";
import { buildCellMarginalEffectView, buildNetworkOptimizationComparison, isRadioQualityEvaluated } from "./optimizationConfig.js";
import {
  formatReportTimestamp,
  formatNumber,
} from "./reportFormatting.js";
import { resolveRFProfile } from "./rfProfile.js";
import { resolveReportSource } from "../domain/reportSource.js";

import { buildReportPresentationModel } from "./reportModel.js";
import { renderReportMarkdown } from "./reportMarkdown.js";
import { renderReportHtml } from "./reportHtml.js";
import { printReportHtml } from "./reportArtifactDownload.js";

export { buildComparisonBarChartSvg, buildComparisonSlopeChartSvg, getComparisonMetrics } from "./comparisonCharts.js";

const REPORT_NOT_AVAILABLE = "Not available";
const REPORT_NOT_CONFIGURED = "Not configured";
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
  domainBinding = null,
  sourceContext = null,
  generatorMeta = appMeta,
  simulationSource = null,
  evidence = null,
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
  spatialComparison = null,
  stats,
  selectedSolutionId = null,
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
    sourceContext,
    generatorMeta,
    simulationSource,
    domainBinding: domainBinding ?? buildReportDomainBinding(project),
    evidence,
    recommendations,
    reportMode,
    selectedTower,
    selectedNetworkTowers,
    networkTowers,
    settings: safeSettings,
    simulation,
    spatialComparison,
    stats,
    selectedSolutionId,
  };
  report.recommendedSolution = resolveRecommendedSolution(networkOptimization);
  report.recommendedConfigurations = buildRecommendedConfigurations({
    networkOptimization,
    networkTowers,
    recommendedSolution: report.recommendedSolution,
  });
  report.rfProfiles = buildReportRFProfiles({
    networkOptimization,
    sourceContext,
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
  report.view = buildReportPresentationModel(report, buildReportViewModel(report));
  report.mapSvg = report.view.mapSnapshot.svg;
  return report;
}

export function buildHistoricalPlanningReport({
  appMeta = null,
  generatedAt,
  project = null,
  scenario = null,
  scenarioRevision = null,
  runs = [],
} = {}) {
  const source = resolveReportSource({ project, scenario, scenarioRevision, runs });
  const revision = source.scenario_revision;
  const plan = historicalPlanFromRevision(revision, scenario);
  const inventory = historicalInventoryFromRevision(revision, scenario);
  const selectedNetworkTowers = historicalTowers(inventory, revision, plan.selectedNetworkTowerIds);
  const selectedTower = selectedNetworkTowers.find((tower) => String(tower.id ?? tower.cellId) === String(plan.selectedTowerId))
    ?? (plan.planningMode === "network" ? null : selectedNetworkTowers[0] ?? null);
  const optimizationRun = source.runs.find((run) => run.run_type === "optimization" && run.status === "succeeded") ?? null;
  const simulationRun = source.runs.find((run) => run.run_type === "simulation" && run.status === "succeeded") ?? null;
  const networkOptimization = optimizationRun ? historicalOptimizationResponse(optimizationRun) : null;
  const comparison = networkOptimization?.baseline && networkOptimization?.pareto_frontier?.length
    ? buildNetworkOptimizationComparison(networkOptimization, plan.optimizationConfig)
    : null;
  const simulation = simulationRun ? historicalSimulationResult(simulationRun) : null;
  const recordedMeta = revision.metadata?.app_meta ?? scenario?.meta ?? null;
  const recordedRun = optimizationRun ?? simulationRun;
  const datasetReference = source.binding.dataset_references?.[0];
  const sourceMeta = recordedMeta || recordedRun?.engine || datasetReference ? {
    ...recordedMeta,
    model_version: recordedRun?.engine?.version ?? recordedMeta?.model_version ?? null,
    ...(recordedMeta?.dataset ? {} : datasetReference ? { dataset: { id: datasetReference.dataset_id, version: datasetReference.version, name: datasetReference.name ?? datasetReference.dataset_id, sha256: datasetReference.content_hashes } } : {}),
  } : null;
  const reportSourceContext = {
    ...source.binding,
    project_name: project?.name ?? "Planning project",
    scenario_name: scenario?.name ?? "Historical scenario",
    version: revision.revision ?? null,
    version_label: revision.revision ? `Version ${revision.revision}` : "Version label not recorded",
    runs: source.runs,
  };
  const reportProject = {
    ...(project ?? {}),
    id: project?.id ?? project?.project_id ?? source.binding.project_id,
    name: project?.name ?? "Planning project",
    activeScenarioId: scenario?.id ?? scenario?.scenario_id ?? source.binding.scenario_id,
    scenarios: [scenario ?? { id: source.binding.scenario_id, name: "Historical scenario" }],
  };
  const report = buildPlanningReport({
    activeNetworkTech: plan.settings.networkTech ?? plan.settings.network_tech ?? null,
    appMeta: sourceMeta,
    generatorMeta: appMeta,
    buildingEntryAnalysis: null,
    buildingSummary: scenario?.summary ?? null,
    calibrationProfile: revision.calibration_profile ?? null,
    cellExplanations: [],
    comparison,
    coreLab: null,
    coreLabApplicable: false,
    coreLabEnabled: false,
    coverageGaps: simulation?.coverageGaps ?? null,
    diagnostics: null,
    domainBinding: source.binding,
    sourceContext: reportSourceContext,
    evidence: source.evidence,
    generatedAt,
    interferenceAnalysis: null,
    measurementAnalysis: null,
    networkOptimization,
    networkResultKind: networkOptimization ? "optimization" : null,
    optimizationConfig: plan.optimizationConfig,
    planningMode: plan.planningMode,
    project: reportProject,
    recommendations: null,
    selectedSolutionId: optimizationRun?.details?.selected_solution_id ?? null,
    selectedTower,
    selectedNetworkTowers: plan.planningMode === "network" ? selectedNetworkTowers : [],
    settings: plan.settings,
    simulation: simulation?.result ?? null,
    stats: simulation?.stats ?? { avgPower: null, maxRange: null, minRange: null, blockedRatio: null, rayCount: null },
  });
  report.historicalSource = source;
  return report;
}

export function downloadMarkdownReport(report) {
  const markdown = renderMarkdownReport(report);
  const view = getReportViewModel(report);
  downloadBlob(reportFilename({ project: view.identity.projectName, scenario: view.identity.scenarioName, version: view.identity.version, date: report.generatedAt, mode: view.identity.mode, extension: "md" }), markdown, "text/markdown;charset=utf-8");
}

export function openPdfReport(report) {
  return printReportHtml(renderPrintableReport(report));
}

export function renderMarkdownReport(report, options = {}) {
  return renderReportMarkdown(getReportViewModel(report), options);
}

export function renderPrintableReport(report, options = {}) {
  return renderReportHtml(getReportViewModel(report), options);
}

export function renderHtmlReport(report, options = {}) {
  return renderPrintableReport(report, options);
}

/** Rebind presentation metadata without recomputing or mutating source results or retained artifacts. */
export function bindReportPresentation(report, { sourceContext, domainBinding, generatedAt, generatorMeta } = {}) {
  const bound = {
    ...report,
    ...(sourceContext ? { sourceContext } : {}),
    ...(domainBinding ? { domainBinding } : {}),
    ...(generatedAt ? { generatedAt: generatedAt instanceof Date ? generatedAt : new Date(generatedAt) } : {}),
    ...(generatorMeta ? { generatorMeta } : {}),
  };
  bound.view = buildReportPresentationModel(bound, buildReportViewModel(bound));
  bound.mapSvg = bound.view.mapSnapshot.svg;
  return bound;
}

function getReportViewModel(report) {
  if (report?.view?.sections) return report.view;
  return buildReportPresentationModel(report ?? {}, buildReportViewModel(report ?? {}));
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
  const view = {
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
    domainBinding: report.domainBinding,
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
    evidence: report.evidence,
    selectedSolutionId: report.selectedSolutionId ?? null,
    subtitle,
    title,
    topGaps,
    optimizationRunID: optimization?.optimization_run_id ?? null,
    resultStats,
    areaOfInterestRows: areaOfInterestRows(resultStats),
    sourceContract: reportSourceContract(report),
  };
  view.domainRows = buildOptimizationDomainRows(view);
  view.paretoTable = { headers: buildParetoHeaders(view), rows: paretoSolutions.map((solution, index) => buildParetoRow(solution, view, index)) };
  view.cellExplanationTables = evaluatedCellExplanations.map((effect) => ({
    id: effect.cell?.id ?? REPORT_NOT_AVAILABLE,
    baseline: finiteOrNull(effect.cell?.baseline_azimuth_deg),
    selected: finiteOrNull(effect.cell?.selected_azimuth_deg),
    rows: buildCellExplanationRows(effect),
    actualConstraint: formatConstraintValue(effect.metrics?.constraints?.actual),
    revertedConstraint: formatConstraintValue(effect.metrics?.constraints?.counterfactual),
    limitations: (effect.limitations ?? []).filter(Boolean),
    violations: effect.metrics?.constraints?.counterfactual_violations ?? [],
  }));
  view.limitations = buildLimitations(view);
  return view;
}

// Headline metrics for the summary; the constraint row appears only when constraints were configured.
export function reportLimitations(report) {
  return getReportViewModel(report).limitations;
}

function buildLimitations(view) {
  const limitations = [
    "Results are deterministic planning estimates, not UE, drive-test, or PHY measurements.",
    "The propagation model does not establish deployment approval, rooftop access, ownership, permitting, cost, fiber, or backhaul feasibility.",
  ];
  if (view.calibrationProfile || (finiteOrNull(view.settings.calibrationOffsetDb) ?? 0) !== 0) limitations.push("Any applied correction is a global path-loss bias and not full propagation calibration.");
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
      { key: "covered_units", label: "Covered units", kind: "number", direction: "informational", deltaUnit: "building entities" },
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
    ["min_coverage_score", "Minimum propagation reach", (value) => `≥ ${formatNumber(value, 1)} reach-score units`],
    ["min_unique_demand_buildings", "Minimum demand buildings", (value) => `≥ ${formatCount(value)} buildings`],
    ["min_unique_residential_buildings", "Minimum residential buildings", (value) => `≥ ${formatCount(value)} buildings`],
    ["max_overlap_buildings", "Maximum overlap", (value) => `≤ ${formatCount(value)} buildings`],
  ];
  return definitions.map(([key, label, formatter]) => {
    const value = readNumeric(constraints, key);
    return value === null ? null : [label, formatter(value), status.label];
  }).filter(Boolean);
}

function reportSourceContract(report) {
  return report.networkOptimization?.rf_contract
    ?? report.simulation?.rf_contract
    ?? report.coverageGaps?.rf_contract
    ?? report.interferenceAnalysis?.model?.rf_contract
    ?? report.appMeta?.rf_contract ?? {};
}

function buildDatasetRows(report) {
  const dataset = report.appMeta?.dataset ?? {};
  const contract = reportSourceContract(report);
  const summary = report.buildingSummary ?? {};
  const interferenceRsrp = finiteOrNull(contract.interference_rsrp_threshold_dbm);
  const interferenceSinr = finiteOrNull(contract.interference_sinr_threshold_db);
  const interferenceRsrq = finiteOrNull(contract.interference_rsrq_threshold_db);
  return [
    row("Dataset", dataset.name ?? dataset.id),
    row("Dataset ID", dataset.id),
    row("Dataset version", dataset.version),
    row("Manifest schema", dataset.schema_version),
    row("Total buildings", formatCount(summary.total_buildings)),
    row("Demand-weighted buildings", formatCount(summary.demand_weighted_buildings)),
    row("Residential buildings", formatCount(summary.residential_weighted_buildings)),
    row("Material metadata coverage", formatPercent(summary.material_metadata_coverage_pct, false)),
    row("Sources", Array.isArray(dataset.sources) && dataset.sources.length ? dataset.sources.join(", ") : null),
    row("Licenses", Array.isArray(dataset.licenses) && dataset.licenses.length ? dataset.licenses.join(", ") : null),
    row("Dataset confidence (recorded)", dataset.confidence),
    row("Pack QA", dataset.quality?.summary),
    row("Requested coverage", formatPercent(dataset.quality?.coverage?.coverage_ratio, false)),
    row("Layers", dataset.layers ? Object.keys(dataset.layers).join(", ") : null),
    row("Hashed files", dataset.sha256 ? formatCount(Object.keys(dataset.sha256).length) : null),
    row("Model version", report.appMeta?.model_version),
    row("RF model", contract.model_id ?? report.appMeta?.model_id),
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

function row(label, value) {
  return [label, value === null || value === undefined || value === "" ? null : value];
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

function buildReportRFProfiles({ networkTowers, reportMode, selectedTower, settings, networkOptimization, sourceContext }) {
  const towers = reportMode === "network" ? networkTowers : [selectedTower ?? networkTowers[0]].filter(Boolean);
  const recorded = new Map([
    ...(networkOptimization?.baseline?.cell_configurations ?? []),
    ...(networkOptimization?.effective_cell_profiles ?? []),
  ].filter((cell) => cell.rf_profile).map((cell) => [String(cell.id), cell]));
  const historical = ["historical_run", "comparison_runs"].includes(sourceContext?.source_kind);
  return towers.map((tower, index) => {
    const cellId = tower.cellId ?? tower.id;
    const snapshot = recorded.get(String(cellId));
    const profile = snapshot ? snapshotRFProfileToOverride(snapshot.rf_profile)
      : historical ? { ...snapshotRFProfileToOverride(settings), ...Object.fromEntries(Object.entries(tower.rfProfile ?? {}).filter(([, value]) => value !== undefined)) }
        : resolveRFProfile(tower, settings, index);
    return { cellId, ...profile, ...(snapshot?.receiver_threshold ? { effectiveSensitivityDbm: snapshot.receiver_threshold.sensitivity_dbm } : {}) };
  });
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

export function buildReportDomainBinding(project) {
  const active = project?.scenarios?.find((scenario) => scenario.id === project.activeScenarioId);
  const domain = active?.domain ?? {};
  return {
    scenario_id: domain.scenario_id ?? active?.id ?? null,
    scenario_revision_id: domain.current_revision_id ?? null,
    run_ids: Array.isArray(domain.runs) ? domain.runs.map((run) => run.run_id).filter(Boolean) : [],
    live_generated: true,
    report_definition_id: null,
  };
}

function historicalPlanFromRevision(revision, scenario) {
  const snapshot = revision?.canonical_input_snapshot ?? revision?.request_inputs ?? scenario?.plan ?? {};
  const settings = {
    ...(snapshot?.settings ?? {}),
    ...(revision?.rf_affecting_settings ?? {}),
  };
  const selectedNetworkTowerIds = [
    ...(revision?.enabled_cell_ids ?? snapshot?.selectedNetworkTowerIds ?? []),
    ...(revision?.selected_cell_ids ?? snapshot?.selectedNetworkTowerIds ?? []),
  ].filter((value, index, values) => value !== null && value !== undefined && values.findIndex((candidate) => String(candidate) === String(value)) === index).map(String);
  return {
    planningMode: revision?.planning_mode ?? snapshot?.planningMode ?? "single",
    selectedTowerId: revision?.selected_cell_id ?? snapshot?.selectedTowerId ?? selectedNetworkTowerIds[0] ?? null,
    selectedNetworkTowerIds,
    settings,
    optimizationConfig: revision?.optimizer_configuration ?? revision?.objective_constraints ?? snapshot?.optimizationConfig ?? {},
  };
}

function historicalInventoryFromRevision(revision, scenario) {
  const snapshot = revision?.canonical_input_snapshot ?? revision?.request_inputs ?? scenario?.plan ?? {};
  return snapshot?.inventory
    ?? scenario?.plan?.inventory
    ?? [];
}

function historicalTowers(inventory, revision, selectedIds) {
  const overrides = revision?.overrides ?? {};
  return (Array.isArray(inventory) ? inventory : []).map((tower) => {
    const id = tower.id ?? tower.cellId ?? tower.cell_id;
    const override = overrides[String(id)]?.fields ?? overrides[String(id)] ?? {};
    const profile = tower.rfProfile ?? tower.rf_profile ?? {};
    return {
      ...tower,
      id: tower.id ?? id,
      cellId: tower.cellId ?? tower.cell_id ?? id,
      azimuth: override.azimuth_deg ?? tower.azimuth ?? tower.azimuth_deg ?? tower.optimal_azimuth ?? 0,
      coordinates: tower.coordinates ?? [tower.lon ?? tower.longitude, tower.lat ?? tower.latitude].filter((value) => value !== undefined),
      rfProfile: { ...snapshotRFProfileToOverride(profile), ...tower.rfProfile },
    };
  }).filter((tower) => selectedIds.length === 0 || selectedIds.includes(String(tower.id)) || selectedIds.includes(String(tower.cellId)));
}

function historicalOptimizationResponse(run) {
  const details = run.details ?? {};
  const summary = run.summary ?? {};
  const normalizeSolution = (solution) => {
    if (!solution) return null;
    const towers = solution.cell_configurations ?? solution.cellConfigurations ?? solution.towers ?? [];
    return {
      ...solution,
      id: solution.id ?? solution.optimizer_solution_id ?? solution.optimization_solution_id,
      towers,
      cell_configurations: towers,
      stats: solution.stats ?? {},
    };
  };
  const baseline = normalizeSolution(details.baseline_solution);
  const pareto = (details.public_pareto_solutions ?? []).map(normalizeSolution).filter(Boolean);
  const recommended = pareto.find((solution) => String(solution.id) === String(details.recommended_solution_id)) ?? pareto[0] ?? null;
  const optimizationSummary = summary.optimization ?? {};
  const configuredPriorities = details.effective_priorities ?? {};
  const priorityTotal = Object.values(configuredPriorities).reduce((total, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? total + numeric : total;
  }, 0);
  const effectiveWeights = Object.fromEntries(Object.entries(configuredPriorities).map(([key, value]) => {
    const numeric = Number(value);
    return [key, Number.isFinite(numeric) && numeric > 1 && priorityTotal > 0 ? numeric / priorityTotal : value];
  }));
  return {
    baseline: baseline ? { ...baseline, cell_configurations: baseline.towers } : null,
    pareto_frontier: pareto,
    optimized_towers: recommended?.towers ?? [],
    optimization_run_id: details.optimization_run_id ?? summary.optimization_run_id ?? null,
    optimization_domain: details.optimization_domain ?? optimizationSummary.optimization_domain ?? null,
    optimization: {
      recommended: pareto.length > 0,
      recommended_solution_id: details.recommended_solution_id ?? recommended?.id ?? null,
      configured_priorities: configuredPriorities,
      effective_weights: effectiveWeights,
      objective_status: details.objective_availability ?? {},
      constraints: details.constraints ?? {},
      search_policy: details.search_policy ?? null,
      budgets: details.budgets ?? null,
      evaluated_count: details.evaluated_count ?? null,
      cache_summary: details.cache_summary ?? null,
      optimizer_identity: details.optimizer_identity ?? null,
      constraints_satisfied: baseline?.constraints_satisfied !== false && recommended?.constraints_satisfied !== false,
    },
    stats: summary.stats ?? optimizationSummary.stats ?? recommended?.stats ?? null,
    rf_contract: details.rf_contract ?? run.rf_contract ?? null,
  };
}

function historicalSimulationResult(run) {
  const summary = run.details?.result_summary ?? run.summary ?? {};
  const simulationStats = summary.simulation?.stats ?? summary.simulation ?? summary.stats ?? null;
  const coverageStats = summary.coverage_gaps?.stats ?? summary.coverage_gaps ?? null;
  const model = summary.simulation?.model ?? summary.model ?? null;
  const result = simulationStats || model
    ? { stats: simulationStats, model, rf_contract: run.rf_contract }
    : null;
  return {
    result,
    coverageGaps: coverageStats ? { stats: coverageStats, geojson: { type: "FeatureCollection", features: [] }, rf_contract: run.rf_contract } : null,
    stats: {
      avgPower: simulationStats?.avg_rx_dbm ?? null,
      maxRange: simulationStats?.max_range_m ?? null,
      minRange: simulationStats?.min_range_m ?? null,
      blockedRatio: simulationStats?.blocked_pct ?? null,
      rayCount: null,
    },
  };
}

function snapshotRFProfileToOverride(profile = {}) {
  if (!profile || typeof profile !== "object") return {};
  return {
    schemaVersion: profile.schema_version ?? profile.schemaVersion,
    propagationModelID: profile.propagation_model ?? profile.propagationModelID,
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

function getTopCoverageGaps(geojson) {
  return [...(geojson?.features ?? [])].map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates ?? [];
    return { demand: finiteOrNull(properties.total_demand) ?? 0, id: properties.building_id, lat: coordinates[1], lon: coordinates[0], reason: properties.reason ?? "demand", rx: finiteOrNull(properties.rx_dbm), severity: properties.severity ?? "weak" };
  }).filter((gap) => Number.isFinite(gap.lon) && Number.isFinite(gap.lat)).sort((left, right) => right.demand - left.demand).slice(0, 8);
}

function comparisonStatus(delta, direction) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.000001) return "unchanged";
  if (direction === "informational") return "informational";
  if (direction === "lower") return delta < 0 ? "improved" : "worsened";
  return delta > 0 ? "improved" : "worsened";
}

function definitionUnit(metric) {
  if (metric === "overlap_buildings") return "buildings";
  if (metric === "covered_units") return "building entities";
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

function formatDate(date) {
  return formatReportTimestamp(date);
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
