import { REPORT_GENERATOR_VERSION } from "../domain/report.js";
import { normalizedNetworkScore } from "./appWorkspace.js";
import { isRadioQualityEvaluated } from "./optimizationConfig.js";
import { buildInterferenceReportContent } from "./interferenceReport.js";
import { formatNumber, formatReportTimestamp } from "./reportFormatting.js";
import { reportLineageLine } from "./reportLineage.js";
import { reportFilename } from "./downloadNames.js";
import { groupReportRFProfiles, formatReportRFValue, compareReportIds } from "./reportRFConfiguration.js";
import { buildReportMap } from "./reportMap.js";
import { spatialComparisonRows, spatialComparisonSvg } from "./spatialComparison.js";

export const REPORT_SCORE_MEANING = "The /100 score is normalized preference-weighted planning utility under the current priorities. It is not percentage coverage, measured accuracy, probability, or confidence. Unavailable objectives are excluded from scoring.";
export const REPORT_RAY_DIAGNOSTIC_NOTE = "These diagnostics describe ray endpoints, not the typical received power at served buildings. Rays terminate at receiver sensitivity or the planning radius; wall loss can place an endpoint below sensitivity. Building service uses each entity's best modeled building power against the separate building-service threshold. Low endpoint Rx and high building service can therefore coexist. Network Rx and obstructed percentages retain the existing mean of the per-Cell summaries; they are not spatial or linear-power averages.";

export function reportNumeric(source, ...keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

const count = (value) => value === null || value === undefined ? "Not recorded" : formatNumber(value, 0);
const unit = (value, suffix, digits = 1) => value === null || value === undefined ? "Not recorded" : `${formatNumber(value, digits)}${suffix ? ` ${suffix}` : ""}`;
const percent = (value) => value === null || value === undefined ? "Not recorded" : `${formatNumber(value * 100, 1)}%`;
const angle = (value) => unit(value, "°", 0).replace(" °", "°");
const paragraph = (text, kind) => ({ type: "paragraph", text, kind });
const heading = (text) => ({ type: "heading", text });
const list = (items) => ({ type: "list", items: items.filter(Boolean) });
const table = (headers, rows, caption = "", kind = "") => ({ type: "table", headers, rows: rows.filter((row) => row.some((value) => value !== null && value !== undefined)), caption, kind });
const presentRows = (rows) => rows.filter(([, value]) => value !== null && value !== undefined && value !== "");

/** Typed quantities retain source values. Ratios here are display projections of existing metrics only. */
export function buildReportMetrics(stats, objectiveStatus = {}) {
  if (!stats) return [];
  const raw = stats.raw_metrics ?? stats.rawMetrics ?? {};
  const values = [];
  const add = ({ id, objective = id, label, value, denominator = null, ratio = null, unit: metricUnit, population, source }) => {
    const unavailable = objectiveStatus[objective]?.available === false || denominator === 0;
    const availability = unavailable ? "unavailable" : value !== null || ratio !== null ? "available" : "not_recorded";
    values.push({ id, label, value, denominator, ratio: denominator > 0 && value !== null && (["demand", "residential", "coverage"].includes(id) || ratio === null) ? value / denominator : ratio,
      unit: metricUnit, population, source, availability, reason: objectiveStatus[objective]?.reason ?? (denominator === 0 ? "No relevant denominator" : "Raw quantity not recorded") });
  };
  const score = reportNumeric(stats, "score", "composite_score") === null ? null : normalizedNetworkScore({ ...stats, score: reportNumeric(stats, "score") ?? undefined });
  if (score !== null) add({ id: "score", label: "Optimization score", value: score, unit: "points / 100", population: "Available objectives under the current priorities", source: "stats.score / composite_score" });
  add({ id: "demand", label: "Modeled demand weight served", value: reportNumeric(raw, "served_demand_weight", "servedDemandWeight", "served_weighted_demand", "servedWeightedDemand"),
    denominator: reportNumeric(raw, "relevant_demand_weight", "relevantDemandWeight", "total_weighted_demand", "totalWeightedDemand"), ratio: reportNumeric(stats.objectives, "demand"), unit: "demand-weight units", population: "Relevant positive-weight building entities with centroids inside the selected-Cell radius union", source: "raw_metrics.served_demand_weight / relevant_demand_weight" });
  add({ id: "residential", label: "Residential building entities served", value: reportNumeric(raw, "residential_covered", "residentialCovered") ?? reportNumeric(stats, "unique_residential_buildings", "uniqueResidentialBuildings"),
    denominator: reportNumeric(raw, "relevant_residential_total", "relevantResidentialTotal", "residential_total", "residentialTotal"), ratio: reportNumeric(stats.objectives, "residential"), unit: "building entities", population: "Positive-residential entities whose footprints intersect the selected-Cell radius union", source: "raw_metrics.residential_covered / relevant_residential_total" });
  add({ id: "coverage", label: "Normalized propagation reach", value: reportNumeric(raw, "propagation_reach_score", "propagationReachScore", "coverage_reach_score", "coverageReachScore"),
    denominator: reportNumeric(raw, "propagation_reach_maximum", "propagationReachMaximum", "coverage_reach_maximum", "coverageReachMaximum"), ratio: reportNumeric(stats.objectives, "coverage"), unit: "reach-score units", population: "Configured rays across selected Cells; each ray contributes up to 100 distance-normalized units, capped at the lesser of its radius and 500 m", source: "raw_metrics.propagation_reach_score / propagation_reach_maximum" });
  const covered = reportNumeric(raw, "covered_units", "coveredUnits");
  const overlapRatio = reportNumeric(raw, "overlap_ratio", "overlapRatio") ?? (reportNumeric(stats.objectives, "overlap") === null ? null : 1 - Number(stats.objectives.overlap));
  add({ id: "overlap", label: "Multi-Cell overlap", value: reportNumeric(raw, "overlap_buildings", "overlapBuildings") ?? reportNumeric(stats, "overlap_buildings"), denominator: covered,
    ratio: overlapRatio, unit: "served building entities", population: "Entities served by more than one selected Cell, divided by all served building entities; not an interference measurement", source: "raw_metrics.overlap_ratio; overlap_buildings / covered_units" });
  if (covered !== null) add({ id: "covered_units", label: "Served building entities", value: covered, unit: "building entities", population: "Distinct relevant footprint entities served by at least one Cell strictly above the building-service threshold; not dwellings or subscribers", source: "raw_metrics.covered_units" });
  if (isRadioQualityEvaluated(stats)) add({ id: "radio_quality", label: "Radio-quality serviceability", value: reportNumeric(raw, "radio_quality_serviceable_samples", "radioQualityServiceableSamples"), denominator: reportNumeric(raw, "radio_quality_total_samples", "radioQualityTotalSamples"), ratio: reportNumeric(raw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction"), unit: "fixed-domain samples", population: "Candidate-independent sampled union domain, including no-carrier failures in the denominator", source: "raw_metrics.radio_quality_serviceable_fraction" });
  if (reportNumeric(raw, "served_demand_weight", "served_weighted_demand") === null && reportNumeric(stats, "unique_demand_buildings") !== null) add({ id: "demand_entities", label: "Served demand building entities (retained count)", value: reportNumeric(stats, "unique_demand_buildings"), unit: "building entities", population: "Legacy retained entity count; not demand-weight units", source: "stats.unique_demand_buildings" });
  return values;
}

function metricHeadline(metric) {
  if (metric.id === "score") return `${formatNumber(metric.value, 1)} / 100`;
  if (metric.ratio !== null) return percent(metric.ratio);
  return unit(metric.value, metric.unit, metric.id === "demand" ? 1 : 0);
}

function metricDetail(metric) {
  if (metric.value === null) return metric.ratio === null ? "Not recorded" : `${percent(metric.ratio)} (raw quantity not recorded)`;
  const digits = ["demand", "coverage", "score"].includes(metric.id) ? 1 : 0;
  return `${formatNumber(metric.value, digits)}${metric.denominator !== null ? ` / ${formatNumber(metric.denominator, digits)}` : ""}`;
}

function buildCompleteness(report, view, metrics) {
  const historical = report.evidence?.historical === true;
  const radio = report.networkOptimization?.optimization?.radio_quality;
  const radioEvaluated = metrics.some((metric) => metric.id === "radio_quality" && metric.availability === "available");
  const optimizationRan = report.networkResultKind !== "evaluation" && (report.networkResultKind === "optimization" || view.isOptimizationRecommendation || report.sourceContext?.runs?.some((run) => run.run_type === "optimization"));
  const absent = historical ? "not_retained" : "not_evaluated";
  return [
    { id: "result", label: view.isNetworkReport ? "Network evaluation" : "Ray simulation", state: view.resultStats || report.simulation?.stats ? "available" : "not_recorded" },
    ...(view.isNetworkReport ? [{ id: "optimization", label: "Optimization search", state: optimizationRan ? "available" : historical ? "not_recorded" : "not_evaluated" }] : []),
    { id: "interference", label: "Standalone interference", state: view.hasInterference ? "available" : report.interferenceAnalysis?.unavailable_reason ? "unavailable" : absent, reason: report.interferenceAnalysis?.unavailable_reason },
    ...(view.isNetworkReport ? [{ id: "radio_quality", label: "Optimization radio quality", state: radioEvaluated ? "available" : radio?.enabled && radio?.available === false ? "unavailable" : historical ? "not_retained" : "not_evaluated", reason: radio?.reason ?? view.objectiveStatus?.radio_quality?.reason }] : []),
  ].map((entry) => ({ ...entry, status: ({ available: "Evaluated", not_evaluated: "Not evaluated", not_retained: "Not retained in source", not_recorded: "Not recorded", unavailable: "Unavailable" })[entry.state] }));
}

function buildInterpretation(view, metrics, completeness) {
  if (!view.resultStats && !view.simulation?.stats) return ["This report records configuration only; no evaluated result is retained for this source."];
  const statements = [];
  const get = (id) => metrics.find((metric) => metric.id === id && metric.availability === "available");
  const demand = get("demand"), residential = get("residential"), overlap = get("overlap");
  const context = view.isOptimizationRecommendation ? "Under the current priority-ranked recommendation" : "Under the evaluated planning configuration";
  if (demand?.ratio !== null && demand?.ratio !== undefined) statements.push(demand.denominator > 0 && demand.value === demand.denominator
    ? `${context}, all modeled demand weight is served.` : `${context}, ${percent(demand.ratio)} of modeled demand weight is served.`);
  if (residential?.ratio !== null && residential?.ratio !== undefined) statements.push(`${percent(residential.ratio)} of relevant residential building entities are served.`);
  if (overlap?.ratio !== null && overlap?.ratio !== undefined) statements.push(`Multi-Cell overlap affects ${percent(overlap.ratio)} of served building entities.`);
  const interference = completeness.find((entry) => entry.id === "interference"), radio = completeness.find((entry) => entry.id === "radio_quality");
  if (interference?.state !== "available" && radio?.state !== "available") statements.push(interference?.state === "not_evaluated" && (!radio || radio.state === "not_evaluated")
    ? "Interference was not evaluated, so this report does not establish radio-quality performance."
    : "Radio-quality evidence is unavailable or not retained in this source; this report does not establish radio-quality performance.");
  else if (interference?.state !== "available" && radio?.state === "available") statements.push("Radio quality was evaluated on the optimizer's fixed sampled domain; a separate standalone interference analysis is not available in this report.");
  if (!view.isNetworkReport) statements.unshift("The retained RF result describes sampled ray endpoints and building-service evidence where available; it is not measured sector-wide radio performance.");
  return statements;
}

function buildIdentity(report, view) {
  const source = report.sourceContext ?? {};
  const binding = report.domainBinding ?? {};
  const scenarioName = source.scenario_name ?? view.scenarioName ?? "Scenario";
  const version = source.version ?? (source.version_label?.match(/^Version ([1-9]\d*)$/)?.[1] ? Number(source.version_label.match(/^Version ([1-9]\d*)$/)[1]) : null);
  const versionLabel = source.version_label ?? (version ? `Version ${version}` : binding.scenario_revision_id ? "Version label not recorded" : "No saved Version");
  const runIds = source.run_ids ?? binding.run_ids ?? [];
  const mode = !view.isNetworkReport ? "single-cell" : view.isOptimizationRecommendation || report.networkResultKind === "optimization" ? "network-optimization" : view.resultStats ? "network-evaluation" : "network-configuration";
  const projectName = source.project_name ?? report.project?.name ?? "Planning project";
  const context = binding.source_kind === "live_compatibility" || !binding.scenario_revision_id ? "Current unsaved plan at generation" : report.evidence?.historical ? "Historical source evidence" : "Saved source Version";
  return {
    title: view.title, projectName, scenarioName, version, versionLabel, runIds: [...runIds], mode, context,
    lineage: reportLineageLine({ scenarioName, versionLabel, runIds, runs: source.runs ?? [] }),
    generatedAt: formatReportTimestamp(report.generatedAt), generatedInstant: report.generatedAt instanceof Date ? report.generatedAt.toISOString() : report.generatedAt,
    generatorVersion: REPORT_GENERATOR_VERSION, generatorApplicationVersion: report.generatorMeta?.application_version ?? report.appMeta?.application_version ?? "Not recorded",
    filename: reportFilename({ project: projectName, scenario: scenarioName, version, date: report.generatedAt, mode, extension: "html" }),
  };
}

function buildCells(view) {
  const configurations = new Map(view.recommendedConfigurations.map((cell) => [String(cell.id), cell]));
  return view.networkTowers.map((cell, requestIndex) => {
    const id = String(cell.cellId ?? cell.id);
    const configuration = configurations.get(id);
    return { id, requestIndex, coordinates: cell.coordinates ?? (configuration ? [configuration.tower_lon, configuration.tower_lat] : null),
      azimuth: reportNumeric(configuration, "azimuth_deg") ?? reportNumeric(cell, "azimuth", "azimuth_deg", "optimal_azimuth"),
      baselineAzimuth: reportNumeric(configuration, "baseline_azimuth_deg") };
  }).sort((a, b) => compareReportIds(a.id, b.id)).map((cell, i) => ({ ...cell, number: i + 1 }));
}

export function buildReportPresentationModel(report, view) {
  const identity = buildIdentity(report, view);
  const metrics = buildReportMetrics(view.resultStats, view.objectiveStatus);
  const cells = buildCells(view);
  const rfConfiguration = groupReportRFProfiles(view.rfProfiles);
  const mapSnapshot = buildReportMap({ cells, simulation: report.simulation, coverageGaps: report.coverageGaps, interference: view.hasInterference ? report.interferenceAnalysis : null, source: report.simulationSource, recommendedSolutionId: view.isOptimizationRecommendation ? view.recommendedSolution?.id : null });
  const completeness = buildCompleteness(report, view, metrics);
  const interpretation = buildInterpretation(view, metrics, completeness);
  const model = { ...view, identity, metrics, cells, rfConfiguration, mapSnapshot, completeness, interpretation,
    headlines: metrics.filter((metric) => metric.availability === "available" && ["score", "demand", "residential", "coverage", "overlap", "radio_quality"].includes(metric.id)).map((metric) => ({ ...metric, display: metricHeadline(metric), qualifier: metric.id === "overlap" ? "of served building entities" : metric.id === "radio_quality" ? "of fixed-domain samples" : "" })),
    limitations: view.limitations, sections: [] };
  model.sections = buildSections(report, model);
  return Object.freeze(model);
}

function buildSections(report, model) {
  const sections = [];
  const add = (id, title, blocks, options = {}) => {
    const content = blocks.filter(Boolean).filter((block) => block.type !== "table" || block.rows.length).filter((block) => block.type !== "list" || block.items.length);
    if (content.length) sections.push({ id, title, blocks: content, ...options });
  };
  const profileFrequency = model.rfConfiguration.common.find(({ key }) => key === "frequencyGHz");
  const spectrum = profileFrequency ? `${profileFrequency.value} GHz` : model.rfProfiles.length ? "Mixed or partially recorded RF profiles" : "RF profile not recorded";
  const decisionBlocks = [
    paragraph(`${model.cells.length} selected ${model.cells.length === 1 ? "Cell" : "Cells"} · ${model.activeNetworkTech ?? "Technology not recorded"} · ${spectrum}`),
    { type: "completeness", entries: model.completeness },
    model.headlines.length ? { type: "kpis", metrics: model.headlines } : !model.isNetworkReport ? singleCellHeadlines(report) : null,
    paragraph(model.interpretation.join(" "), "interpretation"),
    model.metrics.some(({ id, availability }) => id === "score" && availability === "available") ? paragraph(REPORT_SCORE_MEANING, "score-meaning") : null,
    ...(report.evidence?.unavailable ?? []).map((note) => paragraph(note, "evidence-note")),
    model.constraintStatus.configured && model.constraintStatus.value === false ? paragraph("The recorded configuration does not satisfy its configured constraints. See Network evaluation.", "constraint-failed") : null,
    model.sourceContract?.model_id && model.sourceContract?.applied_model_id && model.sourceContract.model_id !== model.sourceContract.applied_model_id
      ? paragraph(`Recorded RF model: requested ${model.sourceContract.model_id}; applied ${model.sourceContract.applied_model_id}. See Dataset, model & provenance for the recorded applicability and fallback policy.`, "evidence-note") : null,
    paragraph(model.limitations[0], "planning-note"),
  ];
  add("executive-summary", "Decision summary", decisionBlocks);

  if (model.cells.length || model.mapSnapshot.svg) {
    add("planning-map", "Planning map & Cells", [
      { type: "figure", kind: "planning-map", svg: model.mapSnapshot.svg, caption: model.mapSnapshot.caption,
        markdownNote: "The planning map is included in the HTML/PDF report and omitted here to keep this Markdown readable." },
      table(["#", "Cell", model.isOptimizationRecommendation ? "Recommended azimuth" : "Evaluated / configured azimuth"], model.cells.map((cell) => [cell.number, cell.id, angle(cell.azimuth)]), "Numbering is stable across the map, Cell registry and RF configuration. Azimuths describe the reported configuration; the map caption identifies its simulation source.", "cells"),
    ], { pageStart: Boolean(model.mapSnapshot.svg) });
  }

  if (model.isNetworkReport && model.resultStats) {
    const resultLabel = model.isOptimizationRecommendation ? "Recommended Network Solution" : "Evaluated Network Configuration";
    const domain = report.networkOptimization?.optimization_domain ?? model.comparison?.optimization_domain;
    const blocks = [
      paragraph(`${resultLabel}${model.recommendedSolution?.id && model.isOptimizationRecommendation ? ` · ${model.recommendedSolution.id}` : ""}.`),
      table(["Quantity", "Recorded value", "Unit / denominator"], model.metrics.filter((metric) => metric.id !== "score" && metric.availability === "available").map((metric) => [metric.label, metricDetail(metric), metric.unit]), "These quantities expand the headline fractions; they are not percentages of the whole dataset. Multipart footprint records can be separate building entities."),
      model.metrics.some((metric) => metric.availability !== "available") ? list(model.metrics.filter((metric) => metric.availability !== "available").map((metric) => `${metric.label}: ${metric.availability === "unavailable" ? "Unavailable" : "Not recorded"} · ${metric.reason}`)) : null,
      ...(model.domainRows.length ? [heading("Evaluation domain"), table(["Field", "Value"], model.domainRows.map(([label, value]) => [label === "Relevant demand entities" ? "Relevant demand building entities" : label === "Relevant residential entities" ? "Relevant residential building entities" : label, value])), paragraph("Demand denominators sum weights of positive-demand entities with centroids inside the selected-Cell service-radius union. Residential denominators count positive-residential entities whose footprints intersect that union. Overlap is a share of served building entities, not an interference result.")] : []),
      ...(!domain ? [paragraph("The detailed evaluation domain was not retained; no dataset-wide denominator has been substituted.")] : []),
      ...(model.priorityRows.length ? [heading("Evaluation priorities"), table(["Objective", "Configured priority (0–100)", "Effective weight", "Status"], model.priorityRows), paragraph("Configured priorities are relative importance values on a 0–100 scale; effective weights are normalized percentages. Scoring an evaluated plan does not imply an optimization search was run.")] : []),
      ...(model.constraintRows.length ? [heading("Configured constraints"), table(["Constraint", "Threshold", "Recorded status"], model.constraintRows)] : []),
      ...(model.areaOfInterestRows.length ? [heading("Inside the area of interest"), table(["KPI", "Network", "Inside area"], model.areaOfInterestRows), paragraph("Buildings count as inside when their footprint centroid is in the area. The area changes reporting only; objectives and scores are network-wide.")] : []),
      ...(!model.isOptimizationRecommendation ? [paragraph(model.completeness.find((entry) => entry.id === "optimization")?.state === "not_evaluated" ? "Optimization was not run for this evaluated configuration. No baseline or Pareto search is implied." : "Alternative-solution and baseline metadata are not available for this saved network result.")] : []),
    ];
    add("network-evaluation", "Network evaluation", blocks);
  }

  if (model.comparisonRows.length) {
    const rows = model.comparisonRows.filter((entry) => entry.label !== "Constraints" || model.constraintStatus.configured);
    const noChange = rows.every((entry) => ["unchanged", "flat", "informational"].includes(entry.status));
    add("baseline-comparison", model.comparison?.type === "optimization" ? "Baseline vs Recommended" : "Baseline vs Optimized", [
      table(["Metric", "Baseline", model.comparison?.type === "optimization" ? "Recommended" : "Optimized", "Change"], rows.map((entry) => [clarifyLabel(entry.label), entry.baseline, entry.optimized, entry.change])),
      noChange ? paragraph("No aggregate KPI change was observed between baseline and the currently recommended configuration.") : null,
    ]);
  }
  if (model.paretoSolutions.length) {
    add("optimization-tradeoffs", "Optimization trade-offs", [
      table(model.paretoTable.headers, model.paretoTable.rows),
      paragraph(`${model.paretoSolutions.length} of ${model.networkOptimization.pareto_frontier.length} retained feasible non-dominated solutions shown. Non-dominated alternatives represent different valid objective trade-offs; the recommendation reflects the current priorities, not an objectively best solution.`),
      paragraph("Network optimization varies Cell azimuths; other configured RF and site inputs stay fixed for that search. Inspecting or reranking retained solutions does not run RF; applying a solution and running it are separate actions."),
    ]);
  }
  const spatial = report.spatialComparison;
  if (spatial?.result) add("spatial-comparison", "Where the Plans Differ", [
    paragraph(`${spatial.labels?.a ?? "A"} → ${spatial.labels?.b ?? "B"}`),
    table(["Change", "Buildings"], spatialComparisonRows(spatial.result)),
    { type: "figure", kind: "spatial-comparison", svg: spatialComparisonSvg(spatial.result), caption: `Both plans were evaluated on the same dataset and model. Newly served/lost counts demand buildings above the building service threshold in one plan only; overlap counts relevant buildings served by more than one Cell. No SINR deltas are included.${spatial.result.buildings_truncated ? " The map shows the first changed buildings by ID; the counts are complete." : ""}`, markdownNote: "The map of changed buildings is included in the HTML report." },
  ]);
  const interference = buildInterferenceReportContent(model.interferenceAnalysis);
  if (interference) add("interference", "Interference and Radio Quality", [
    interference.statsRows.length ? table(["Metric", "Value"], interference.statsRows) : paragraph("No valid interference samples were retained for this report."),
    paragraph(interference.note),
    paragraph("Standalone grid statistics and the optimizer's fixed-domain radio-quality objective are separate analyses. Their sample domains and serviceability denominators must not be combined."),
  ]);
  if (model.metrics.some(({ id, availability }) => id === "radio_quality" && availability === "available")) {
    const radioRows = model.performanceRows.filter(([label]) => label.startsWith("Radio-quality") && label !== "Radio-quality serviceability");
    add("optimization-radio-quality", "Optimization radio quality", [table(["Metric", "Recorded value"], radioRows), paragraph("Serviceability uses the fixed sampled union domain, including no-carrier samples as denominator failures. SINR/RSRP/RSRQ summaries use retained valid signal samples. The declared interference horizon is finite; these are planning policies, not UE measurements.")]);
  }

  if (report.simulation?.stats || report.simulation?.geojson?.features?.length) add("rf-performance", "Ray / propagation diagnostics", [
    model.isNetworkReport ? table(["Diagnostic", "Recorded value"], diagnosticRows(report)) : null,
    paragraph(REPORT_RAY_DIAGNOSTIC_NOTE),
    !model.isNetworkReport && report.simulation?.geojson?.features ? paragraph(`${report.simulation.geojson.features.length} RF segments retained in this live result; segment count is not ray count.`) : null,
  ]);
  if (model.topGaps.length) add("coverage-gaps", "Coverage gaps", [table(["Building", "Severity", "Demand weight", "Rx", "Reason"], model.topGaps.map((gap) => [gap.id, gap.severity, unit(gap.demand, "", 1), unit(gap.rx, "dBm"), gap.reason])), paragraph("Returned gap records are a bounded list, not the entire evaluated building population.")]);
  else if (reportNumeric(report.coverageGaps?.stats, "gap_buildings") === 0) add("coverage-gaps", "Coverage gaps", [paragraph("Coverage gaps: None identified.")]);
  else if (reportNumeric(report.coverageGaps?.stats, "returned_gaps") === 0) add("coverage-gaps", "Coverage gaps", [paragraph("Coverage gaps: None identified in the returned records.")]);

  buildRFSection(report, model, add);
  buildProvenanceSections(report, model, interference, add);
  return sections;
}

function singleCellHeadlines(report) {
  const stats = report.simulation?.stats;
  if (!stats) return null;
  const metrics = [
    ["ray_rx", "Mean ray-endpoint Rx", reportNumeric(stats, "avg_rx_dbm"), "dBm"],
    ["ray_blocked", "Obstructed ray endpoints", reportNumeric(stats, "blocked_pct"), "%"],
    ["ray_max", "Longest ray termination distance", reportNumeric(stats, "max_range_m"), "m"],
    ["ray_min", "Shortest ray termination distance", reportNumeric(stats, "min_range_m"), "m"],
  ].filter(([, , value]) => value !== null).map(([id, label, value, suffix]) => ({ id, label, value, unit: suffix, display: suffix === "%" ? `${formatNumber(value, 1)}%` : unit(value, suffix) }));
  return metrics.length ? { type: "kpis", metrics } : null;
}

function diagnosticRows(report) {
  const stats = report.simulation?.stats;
  return presentRows([
    ["Mean ray-endpoint Rx", reportNumeric(stats, "avg_rx_dbm") === null ? null : unit(reportNumeric(stats, "avg_rx_dbm"), "dBm")],
    ["Obstructed ray endpoints", reportNumeric(stats, "blocked_pct") === null ? null : `${formatNumber(stats.blocked_pct, 1)}%`],
    ["Longest ray termination distance", reportNumeric(stats, "max_range_m") === null ? null : unit(stats.max_range_m, "m")],
    ["Shortest ray termination distance", reportNumeric(stats, "min_range_m") === null ? null : unit(stats.min_range_m, "m")],
    ["Retained RF segments", report.simulation?.geojson?.features ? count(report.simulation.geojson.features.length) : "Not retained"],
  ]);
}

function clarifyLabel(label) {
  return ({ "Demand served": "Modeled demand weight served", Residential: "Residential building entities served", "Propagation reach": "Normalized propagation reach", "Overlap ratio": "Multi-Cell overlap", "Covered units": "Served building entities" })[label] ?? label;
}

function buildRFSection(report, model, add) {
  const rf = model.rfConfiguration;
  if (!rf.cells.length) return;
  const title = rf.kind === "unknown" ? "RF profile inputs were not recorded" : rf.kind === "single" ? "Cell RF profile" : rf.kind === "common" ? `${rf.partial ? "Recorded common RF fields" : "Common RF profile"} — applies to all ${rf.cells.length} selected Cells`
    : rf.kind === "reference" ? `Reference RF profile — ${rf.referenceCount} of ${rf.cells.length} Cells match; exceptions below` : "Common fields and Cell-specific configuration";
  const blocks = [paragraph(title, "profile-scope"), { type: "profileGroups", groups: rf.groups.map((group) => ({ title: group.title, rows: group.fields.map((field) => [field.label, formatReportRFValue(field, field.value), rf.kind === "reference" ? field.common ? "All Cells" : "Reference" : ""]) })), showScope: rf.kind === "reference" }];
  if (["reference", "mixed"].includes(rf.kind)) {
    blocks.push(heading("Cell-specific configuration / deviations"));
    const numbers = new Map(model.cells.map((cell) => [cell.id, cell.number]));
    blocks.push(table(["#", "Cell", "Parameter", rf.reference ? "Value instead of reference" : "Cell-specific value"], rf.deviations.flatMap((cell) => cell.fields.length
      ? cell.fields.map((field) => [numbers.get(cell.id), cell.id, field.label, formatReportRFValue(field, field.value)])
      : rf.reference ? [] : [[numbers.get(cell.id), cell.id, "Profile", "No additional recorded fields"]]), `${rf.reference ? "Cells and parameters not listed match the explicitly stated reference." : "Common fields apply to all Cells; per-Cell rows retain other recorded fields. Remaining inputs are not recorded."} Values are compared before display rounding; unknown historical inputs are never filled from current defaults.`, "deviations"));
  } else if (rf.kind === "common") blocks.push(paragraph("No Cell-specific RF deviations. Azimuths are listed in the Cell registry."));
  const threshold = reportNumeric(report.coverageGaps?.stats, "building_service_threshold_dbm", "threshold_dbm") ?? reportNumeric(model.sourceContract, "building_service_threshold_dbm");
  blocks.push(paragraph(`Building service${threshold !== null ? ` requires modeled Rx strictly above ${unit(threshold, "dBm")}` : " uses its separately recorded threshold"}; ray termination uses each Cell's receiver sensitivity. Interference serviceability uses its own radio-quality thresholds. Configured manual sensitivity is inactive when derived mode is selected.`));
  const parameters = presentRows([
    ["Configured rays per Cell", reportNumeric(model.parameters, "rays", "rayCount") ?? reportNumeric(model.settings, "rayCount")],
    ["Calibration offset (dB)", reportNumeric(model.parameters, "calibration_offset_db") ?? reportNumeric(model.settings, "calibrationOffsetDb")],
  ]);
  if (parameters.length) blocks.push(table(["Request assumption", "Recorded value"], parameters));
  add("rf-configuration", "RF configuration & receiver assumptions", blocks);
}

function buildProvenanceSections(report, model, interference, add) {
  const bodyLabels = new Set(["Dataset", "Dataset version", "Sources", "Licenses", "Pack QA", "Model version", "RF model", "RF model scope", "Applied RF model", "RF applicability", "RF fallback", "Application version"]);
  const bodyRows = model.datasetRows.filter(([label]) => bodyLabels.has(label));
  add("data-provenance", "Dataset, model & provenance", [
    bodyRows.length ? table(["Source computation", "Recorded value"], bodyRows) : paragraph("Dataset and source computation metadata: Not recorded."),
    table(["Report generation", "Value"], [["Application version", model.identity.generatorApplicationVersion], ["Report generator", model.identity.generatorVersion], ["Generated", model.identity.generatedAt]]),
    paragraph("Dataset-wide counts and QA describe the data pack, not the evaluated network domain. Requested/applied model and fallback describe the recorded source; report-generation identity is shown separately."),
  ]);
  add("limitations", "Limitations", [list(model.limitations)]);
  const binding = report.domainBinding ?? {};
  const exactRows = presentRows([
    ["Project ID", binding.project_id], ["Scenario ID", binding.scenario_id], ["ScenarioRevision", binding.scenario_revision_id],
    ["Source Run(s)", binding.run_ids?.length ? binding.run_ids.join(", ") : "None bound"],
    ["Source kind", binding.source_kind ?? "live_compatibility"], ["Scenario fingerprint", binding.scenario_fingerprint],
    ["Input fingerprint(s)", binding.input_fingerprints?.length ? binding.input_fingerprints.join(", ") : null],
    ["Selected solution", model.selectedSolutionId], ["Recommended solution", model.isOptimizationRecommendation ? model.recommendedSolution?.id : null],
    ["Optimization run", model.optimizationRunID], ["Source boundary", report.evidence?.sources?.run_results],
    ["Silent recomputation", report.evidence?.no_silent_recompute ? "Not performed" : "Not performed by report generation"],
  ]);
  const technicalRows = model.datasetRows.filter(([label]) => !bodyLabels.has(label));
  const appendix = [
    heading("Metric definitions and populations"), table(["Metric", "Unit", "Population / meaning"], model.metrics.length ? model.metrics.map((metric) => [metric.label, metric.unit, metric.population]) : [
      ["Mean ray-endpoint Rx", "dBm", "Arithmetic mean of modeled terminal powers in dBm, not a spatial average"],
      ["Obstructed ray endpoints", "% of rays", "Terminal obstruction classification, not demand failures"],
      ["Ray termination distance", "m", "Distance to receiver termination or planning radius"],
    ]),
    heading("Exact source references"), table(["Field", "Recorded value"], exactRows, "Fingerprints and SHA-256 hashes establish identity or byte integrity, not physical accuracy.", "provenance"),
    ...(report.evidence?.retained?.length ? [heading("Retained evidence"), list(report.evidence.retained)] : []),
    ...(report.evidence?.unavailable?.length ? [heading("Unavailable detail"), list(report.evidence.unavailable)] : []),
    ...(technicalRows.length ? [heading("Dataset and receiver detail"), table(["Field", "Recorded value"], technicalRows)] : []),
    ...(binding.dataset_references?.length ? [heading("Source dataset references"), table(["Field", "Recorded value"], flattenMetadata(binding.dataset_references), "", "provenance")] : []),
    ...(report.appMeta?.dataset?.sha256 ? [heading("Dataset file hashes"), table(["File", "SHA-256"], Object.entries(report.appMeta.dataset.sha256), "", "provenance")] : []),
    ...(model.cells.length ? [heading("Cell location and source configuration"), table(["#", "Cell", "Longitude / latitude", "Azimuth"], model.cells.map((cell) => [cell.number, cell.id, cell.coordinates ? cell.coordinates.join(", ") : "Not recorded", angle(cell.azimuth)]), "Full effective RF values are preserved by the profile and deviations in RF configuration.", "cells")] : []),
    ...(model.isOptimizationRecommendation ? [heading("Optimization provenance"), table(["Field", "Recorded value"], flattenMetadata(Object.fromEntries(["search_policy", "budgets", "evaluated_count", "cache_summary", "optimizer_identity", "radio_quality"].map((key) => [key, model.networkOptimization?.optimization?.[key]]))))] : []),
    ...(model.sourceContract && Object.keys(model.sourceContract).length ? [heading("RF model, applicability and receiver contract"), table(["Contract field", "Recorded value"], flattenMetadata(model.sourceContract), "Existing contract equations and policy terms are reproduced from the source; no report-specific RF calculation is introduced.", "provenance")] : []),
    ...(model.topGaps.length ? [heading("Returned gap locations"), table(["Building", "Longitude", "Latitude"], model.topGaps.map((gap) => [gap.id, unit(gap.lon, "", 6), unit(gap.lat, "", 6)]))] : []),
    ...buildSupportingBlocks(report, model, interference),
  ];
  // Remove headings for unavailable groups before either renderer sees the section plan.
  const cleaned = appendix.filter((block, i) => block?.type !== "heading" || (appendix[i + 1] && (appendix[i + 1].type !== "table" || appendix[i + 1].rows.length)));
  add("engineering-appendix", "Engineering appendix", cleaned, { appendix: true });
}

function flattenMetadata(value, prefix = "") {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value !== "object") return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([key, item]) => flattenMetadata(item, prefix ? `${prefix}.${key}` : key));
}

function buildSupportingBlocks(report, model, interference) {
  const blocks = [];
  for (const effect of model.cellExplanationTables) {
    blocks.push(heading(`Evaluated Cell changes · Cell ${effect.id}`), paragraph(`Baseline: ${angle(effect.baseline)} · Selected/recommended: ${angle(effect.selected)}`),
      effect.rows.length ? table(["Metric", "Selected", "Cell reverted", "Delta"], effect.rows.map(([label, ...values]) => [clarifyLabel(label), ...values])) : paragraph("No comparable metrics were retained for this explanation."),
      paragraph(`Feasibility: Selected ${effect.actualConstraint} · Cell reverted ${effect.revertedConstraint}`),
      list(["Marginal effect is measured by restoring only this cell to its baseline configuration while all other cells remain fixed.", "This is a conditional marginal comparison, not causal attribution or an additive decomposition.", ...effect.limitations, ...effect.violations]));
  }
  if (interference) {
    if (interference.modelRows.length) blocks.push(heading("Standalone interference assumptions"), table(["Assumption", "Value"], interference.modelRows));
    if (interference.cellRows.length) blocks.push(heading("Per-serving-cell radio quality"), table(["Serving Cell", "Channel", "Samples", "Avg SINR", "Avg RSRP", "Avg RSRQ"], interference.cellRows));
    if (interference.demandRows.length) blocks.push(heading("Affected demand building entities"), table(["Building", "Serving Cell", "SINR", "RSRP", "Demand weight"], interference.demandRows));
  }
  const entry = model.buildingEntryAnalysis;
  if (entry) {
    const stats = entry.summary ?? {};
    const rows = [["Applicability", entry.applicability?.applicable ? "Applicable" : entry.applicability?.reason ?? "Not recorded"],
      ...[["Relevant buildings", "relevant_buildings"], ["Relevant residential buildings", "relevant_residential_buildings"], ["Outdoor building service", "outdoor_serviceable_buildings"], ["Low-loss entry service", "low_loss_serviceable_buildings"], ["High-loss entry service", "high_loss_serviceable_buildings"]].filter(([, key]) => reportNumeric(stats, key) !== null).map(([label, key]) => [label, count(stats[key])]),
      ["Material metadata", stats.material_metadata_coverage_pct === undefined ? null : `${unit(stats.material_metadata_coverage_pct, "", 1)}% known`], ["Analysis runtime", entry.diagnostics?.elapsed_ms === undefined ? null : unit(entry.diagnostics.elapsed_ms, "ms", 0)]];
    blocks.push(heading("Building-entry analysis"), table(["Metric", "Recorded value"], presentRows(rows)), paragraph(`Model: ${entry.model?.reference ?? "Not recorded"}. Outdoor facade power uses the ${entry.model?.outdoor_baseline_model ?? "recorded"} baseline; entry values are deterministic low-loss/high-loss scenarios at zero indoor depth. This is estimated service just inside a representative facade, not indoor or whole-building coverage.`));
  }
  const measurement = model.measurementAnalysis?.stats;
  if (measurement) {
    const definitions = [["Imported samples", "sample_count", "", 0], ["Valid samples", "valid_sample_count", "", 0], ["No signal", "no_signal_count", "", 0], ["Cell mismatch", "cell_mismatch_count", "", 0], ["MAE", "mae_db", "dB", 1], ["RMSE", "rmse_db", "dB", 1], ["Median bias", "median_bias_db", "dB", 1]];
    const rows = definitions.filter(([, key]) => reportNumeric(measurement, key) !== null).map(([label, key, suffix, digits]) => [label, unit(measurement[key], suffix, digits)]);
    if (rows.length) blocks.push(heading("Measurement validation"), table(["Metric", "Recorded value"], rows), paragraph("The correction is a robust global path-loss bias, not full propagation calibration."));
  }
  const candidates = model.recommendations?.recommendations ?? [];
  if (candidates.length) blocks.push(heading("Candidate Cell recommendations"), table(["Rank", "Cell", "Azimuth", "Raw marginal Δ", "Reason"], candidates.map((candidate, i) => [i + 1, candidate.cell_id, angle(candidate.optimal_azimuth), unit(candidate.marginal_network_score, "", 1), candidate.reason])), paragraph("Candidates are known planning records, not approved deployment sites. The raw marginal delta is a legacy compatibility aggregate, not the normalized optimization score; interference is excluded from candidate scoring."));
  const status = model.coreLab?.status;
  if (model.coreLabEnabled && model.coreLabApplicable && status) {
    const routes = model.coreLab?.topology?.route_decisions ?? [];
    blocks.push(heading("Communication path / Core Lab"), table(["Field", "Value"], presentRows([["Mode", status.mode], ["State", status.state], ["Source", status.source], ["Scenario", status.scenario ?? model.coreLab?.scenario], ["Xn availability", routes.length ? `${routes.filter((route) => route.route_type === "ng_fallback").length} fallback, ${routes.filter((route) => route.route_type === "direct_xn").length} direct` : null], ["Sessions", model.coreLab?.sessions?.sessions?.length]])));
    if (status.functions?.length) blocks.push(table(["Function", "Status", "Latency", "Load"], status.functions.map((fn) => [fn.name, fn.status, unit(fn.latency_ms, "ms", 0), fn.load_pct === undefined ? "Not recorded" : `${formatNumber(fn.load_pct, 1)}%`])));
  }
  const scenarios = report.project?.scenarios ?? [];
  if (scenarios.length >= 2) {
    const [a, b] = scenarios.slice(-2);
    const definitions = [["Recorded ray-endpoint Rx", "avgRxDBm", "dBm"], ["Recorded gap ratio (%)", "gapPct", ""], ["Recorded scenario score", "networkScore", ""], ["Recorded SINR", "avgSINRDB", "dB"]];
    const rows = definitions.filter(([, key]) => reportNumeric(a.summary, key) !== null || reportNumeric(b.summary, key) !== null).map(([label, key, suffix]) => [label, unit(reportNumeric(a.summary, key), suffix), unit(reportNumeric(b.summary, key), suffix)]);
    if (rows.length) blocks.push(heading("Other saved-scenario summaries"), table(["Recorded summary", a.name ?? "Scenario 1", b.name ?? "Scenario 2"], rows), paragraph("These saved summaries may have different inputs, datasets or models. They are secondary context, not a compatible baseline comparison; the legacy scenario score is not relabeled as normalized /100 utility."));
  }
  return blocks;
}
