import { describe, expect, it } from "vitest";
import {
  buildPlanningReport,
  getComparisonMetrics,
  renderHtmlReport,
  renderMarkdownReport,
} from "./reportExport.js";
import { buildNetworkOptimizationComparison } from "./optimizationConfig.js";

const OBJECTIVE_STATUS = {
  demand: { available: true },
  residential: { available: true },
  coverage: { available: true },
  overlap: { available: true },
};

const OPTIMIZATION_CONFIG = {
  objectives: [
    { id: "demand", weight: 25 },
    { id: "residential", weight: 25 },
    { id: "coverage", weight: 25 },
    { id: "overlap", weight: 25 },
  ],
  constraints: {
    min_coverage_score: 200,
    max_overlap_buildings: 10,
  },
};

const BASELINE_RAW = {
  served_demand_weight: 410,
  relevant_demand_weight: 1315,
  residential_covered: 10,
  relevant_residential_total: 42,
  propagation_reach_score: 209.6,
  propagation_reach_maximum: 400,
  overlap_ratio: 0.152,
  overlap_buildings: 8,
  covered_units: 30,
};

const RECOMMENDED_RAW = {
  served_demand_weight: 630,
  relevant_demand_weight: 1315,
  residential_covered: 15,
  relevant_residential_total: 42,
  propagation_reach_score: 231.6,
  propagation_reach_maximum: 400,
  overlap_ratio: 0.075,
  overlap_buildings: 4,
  covered_units: 40,
};

function makeStats(rawMetrics, score = null) {
  const demand = rawMetrics.served_demand_weight / rawMetrics.relevant_demand_weight;
  const residential = rawMetrics.residential_covered / rawMetrics.relevant_residential_total;
  const coverage = rawMetrics.propagation_reach_score / rawMetrics.propagation_reach_maximum;
  const overlap = 1 - rawMetrics.overlap_ratio;
  return {
    score: score ?? ((demand + residential + coverage + overlap) / 4) * 100,
    objective_status: OBJECTIVE_STATUS,
    raw_metrics: rawMetrics,
    constraints_satisfied: true,
  };
}

function makeSolution(id, rawMetrics, towers = [
  { id: "8414746", azimuth_deg: 20 },
  { id: "8414743", azimuth_deg: 240 },
]) {
  return {
    id,
    towers,
    stats: makeStats(rawMetrics),
    constraints_satisfied: true,
  };
}

function makeNetworkOptimization({ zeroDelta = false, includeBaseline = true, includePareto = true } = {}) {
  const baselineRaw = zeroDelta ? RECOMMENDED_RAW : BASELINE_RAW;
  const frontier = includePareto
    ? [
      makeSolution("solution-1", RECOMMENDED_RAW, [
        { id: "8414746", azimuth_deg: zeroDelta ? 20 : 100 },
        { id: "8414743", azimuth_deg: 240 },
      ]),
      makeSolution("solution-2", {
        ...RECOMMENDED_RAW,
        served_demand_weight: 671,
        residential_covered: 14,
        propagation_reach_score: 237.2,
        overlap_ratio: 0.12,
      }, [
        { id: "8414746", azimuth_deg: 35 },
        { id: "8414743", azimuth_deg: 225 },
      ]),
      makeSolution("solution-3", {
        ...RECOMMENDED_RAW,
        propagation_reach_score: 246.4,
        overlap_ratio: 0.132,
      }),
      makeSolution("solution-4", RECOMMENDED_RAW),
      makeSolution("solution-5", RECOMMENDED_RAW),
      makeSolution("solution-6", RECOMMENDED_RAW),
    ]
    : [];
  return {
    baseline: includeBaseline
      ? {
        cell_configurations: [
          {
            id: "8414746",
            azimuth_deg: 20,
            tower_lon: 32.85,
            tower_lat: 39.92,
            rf_profile: {
              network_tech: "5g",
              band: "n257",
              channel_id: "C-17",
              frequency_ghz: 28,
              tx_power_dbm: 30,
            },
          },
          {
            id: "8414743",
            azimuth_deg: 240,
            tower_lon: 32.86,
            tower_lat: 39.925,
            rf_profile: {
              network_tech: "5g",
              band: "n257",
              channel_id: "C-18",
              frequency_ghz: 28,
              tx_power_dbm: 30,
            },
          },
        ],
        parameters: {
          frequency_ghz: 28,
          tx_power_dbm: 30,
          radius_m: 400,
          rays: 120,
        },
        stats: makeStats(baselineRaw),
        constraints_satisfied: true,
      }
      : undefined,
    optimized_towers: [
      { id: "8414746", optimal_azimuth: zeroDelta ? 20 : 100 },
      { id: "8414743", optimal_azimuth: 240 },
    ],
    optimization_domain: {
      source: "selected_cell_envelope",
      selected_cell_count: 2,
      radius_policy: "per-cell profile radius",
      relevant_building_entities: 1315,
      relevant_demand_entities: 1315,
      relevant_residential_entities: 42,
    },
    optimization: {
      recommended: includePareto,
      recommended_solution_id: "solution-1",
      configured_priorities: { demand: 25, residential: 25, coverage: 25, overlap: 25 },
      normalized_weights: { demand: 0.25, residential: 0.25, coverage: 0.25, overlap: 0.25 },
      effective_weights: { demand: 0.25, residential: 0.25, coverage: 0.25, overlap: 0.25 },
      objective_status: OBJECTIVE_STATUS,
      constraints: OPTIMIZATION_CONFIG.constraints,
      constraints_satisfied: true,
      violations: [],
    },
    pareto_frontier: frontier,
    optimization_run_id: "network-run-1",
    stats: makeStats(RECOMMENDED_RAW),
  };
}

function makeInterferenceAnalysis() {
  return {
    geojson: { type: "FeatureCollection", features: [] },
    demand_geojson: {
      type: "FeatureCollection",
      features: [{ properties: { building_id: "b-17", serving_cell_id: "8414746", sinr_db: 11.2, rsrp_dbm: -88.4, total_demand: 42 } }],
    },
    stats: {
      avg_sinr_db: 19.4,
      p10_sinr_db: 8.1,
      avg_rsrp_dbm: -82.2,
      avg_rsrq_db: -10.4,
      serviceable_pct: 34,
      interference_limited_pct: 9,
      affected_demand_buildings: 1,
      affected_demand: 42,
      per_serving_cell: [{ cell_id: "8414746", channel_id: "C-17", serving_samples: 120, avg_sinr_db: 19.4, avg_rsrp_dbm: -82.2, avg_rsrq_db: -10.4 }],
    },
    model: {
      type: "deterministic_planning_estimate",
      measurement_family: "nr_ss",
      bandwidth_mhz: 100,
      subcarrier_spacing_khz: 120,
      resource_blocks: 66,
      noise_figure_db: 7,
      load_factor: 0.7,
      reuse_factor: 1,
      effective_sample_spacing_m: 40,
    },
  };
}

function makeNetworkReport(overrides = {}) {
  const networkOptimization = overrides.networkOptimization ?? makeNetworkOptimization();
  return buildPlanningReport({
    activeNetworkTech: "5G mmWave",
    appMeta: {
      application_version: "0.6.0",
      model_version: "fspl-walls-cell-profiles-v2",
      dataset: {
        name: "Ankara Planning Pack",
        version: "2",
        schema_version: 2,
        sources: ["Municipality"],
        licenses: ["Open data"],
        confidence: "Planning-grade fixture",
        layers: { towers: {}, buildings: {}, demand: {} },
        quality: { summary: "Geometry checked", coverage: { coverage_ratio: 0.95 } },
        sha256: { "towers.geojson": "a", "buildings.geojson": "b" },
      },
    },
    buildingSummary: { total_buildings: 1315, demand_weighted_buildings: 1315, residential_weighted_buildings: 42 },
    cellExplanations: [],
    calibrationProfile: null,
    comparison: overrides.comparison ?? buildNetworkOptimizationComparison(networkOptimization, OPTIMIZATION_CONFIG),
    coreLab: null,
    coreLabApplicable: false,
    coreLabEnabled: false,
    coverageGaps: { geojson: { type: "FeatureCollection", features: [] }, stats: { gap_buildings: 0, returned_gaps: 0 } },
    diagnostics: null,
    interferenceAnalysis: overrides.interferenceAnalysis ?? null,
    measurementAnalysis: null,
    networkOptimization,
    networkResultKind: overrides.networkResultKind ?? "optimization",
    optimizationConfig: OPTIMIZATION_CONFIG,
    planningMode: "network",
    project: { name: "Ankara Plan", activeScenarioId: "scenario-1", scenarios: [{ id: "scenario-1", name: "Ankara Plan" }] },
    recommendations: null,
    selectedNetworkTowers: [
      { id: "tower-a", cellId: "8414746", azimuth: 90, coordinates: [32.85, 39.92], rfProfile: { networkTech: "5g", band: "n257", channelId: "C-17", frequencyGHz: 28, txPowerDbm: 30 } },
      { id: "tower-b", cellId: "8414743", azimuth: 240, coordinates: [32.86, 39.925], rfProfile: { networkTech: "5g", band: "n257", channelId: "C-18", frequencyGHz: 28, txPowerDbm: 30 } },
    ],
    selectedTower: null,
    settings: { frequencyGHz: 28, txPowerDbm: 30, radiusMeters: 400, beamWidthDeg: 120, rayCount: 120 },
    simulation: { geojson: { type: "FeatureCollection", features: [] }, stats: null },
    stats: { avgPower: null, maxRange: null, minRange: null, blockedRatio: 0, rayCount: 0 },
    ...overrides,
  });
}

function makeCellExplanation({ unchanged = false } = {}) {
  return {
    available: true,
    unchanged,
    run_id: "network-run-1",
    solution_id: "solution-1",
    cell: {
      id: unchanged ? "8414743" : "8414746",
      baseline_azimuth_deg: unchanged ? 240 : 20,
      selected_azimuth_deg: unchanged ? 240 : 100,
    },
    actual: {
      constraints_satisfied: true,
      raw_metrics: RECOMMENDED_RAW,
      violations: [],
    },
    counterfactual: {
      constraints_satisfied: false,
      raw_metrics: BASELINE_RAW,
      violations: ["minimum propagation reach"],
    },
    objective_status: OBJECTIVE_STATUS,
    limitations: ["Retained fixture limitation"],
  };
}

describe("planning report network workflow", () => {
  it("is network-first and uses achieved objective performance", () => {
    const report = makeNetworkReport({ interferenceAnalysis: makeInterferenceAnalysis() });
    const markdown = renderMarkdownReport(report);

    expect(markdown.startsWith("# A.T.O.M Network Planning Report")).toBe(true);
    expect(markdown).toContain("Ankara Plan · Network planning");
    expect(markdown).toContain("| Selected cells | 2 |");
    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("## Recommended Network Solution");
    expect(markdown).toContain("630.0 / 1,315.0 (47.9%)");
    expect(markdown).toContain("15 / 42.0 (35.7%)");
    expect(markdown).toContain("231.6 / 400.0 (57.9%)");
    expect(markdown).toContain("7.5%");
    expect(markdown).toContain("## RF Configuration & Assumptions");
    expect(markdown.indexOf("## RF Configuration & Assumptions")).toBeGreaterThan(markdown.indexOf("## RF Propagation Performance"));
    expect(markdown).not.toContain("## Demand Optimization");
    expect(markdown).not.toContain("## Per-cell RF Profiles");
    expect(markdown).toContain("| Demand | 25 / 100 | 25.0% | Available |");
    expect(markdown).toContain("Configured priorities are relative importance values on a 0–100 scale; effective weights are normalized percentages.");
    expect(markdown).toContain("| Load / reuse | Receiver / sensitivity |");
    expect(markdown).not.toContain("PCI Not available");
    expect(markdown).toContain("Selected-cell service-radius envelope");
    expect(markdown).toContain("Minimum propagation reach");
    expect(markdown).toContain("Satisfied");
    expect(markdown).toContain("## Interference and Radio Quality");
    expect(markdown).toContain("19.4 dB");
    expect(markdown).toContain("34.0%");
  });

  it("renders one compact baseline comparison with direction-aware changes", () => {
    const report = makeNetworkReport();
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("## Baseline vs Recommended");
    expect(markdown).toContain("+220.0 weight (+16.7 pp) · improved");
    expect(markdown).toContain("+5.5 pp · improved");
    expect(markdown).toContain("-7.7 pp · improved");
    expect(markdown).not.toContain("KPI comparison");
    expect(markdown).not.toContain("Optimization movement");
    expect(report.comparisonBarChartSvg).toBe("");
    expect(report.comparisonSlopeChartSvg).toBe("");
  });

  it("summarizes only the top Pareto alternatives and keeps recommendation authoritative", () => {
    const report = makeNetworkReport();
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("## Optimization Trade-offs");
    expect(markdown).toContain("6 feasible non-dominated solutions were evaluated");
    expect(markdown).toContain("#1 Recommended");
    expect(markdown).toContain("#5");
    expect(markdown).not.toContain("#6");
    expect(markdown).toContain("Non-dominated alternatives represent different valid objective trade-offs");
    expect(markdown).not.toContain("#1 objectively best");
  });

  it("includes retained changed-cell explanations without evaluating new cells", () => {
    const report = makeNetworkReport({ cellExplanations: [makeCellExplanation(), makeCellExplanation({ unchanged: true })] });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("## Evaluated Cell Changes");
    expect(markdown).toContain("### Cell 8414746");
    expect(markdown).toContain("Baseline: 20° · Selected/recommended: 100°");
    expect(markdown).toContain("Marginal effect is measured by restoring only this cell to its baseline configuration while all other cells remain fixed.");
    expect(markdown).toContain("This is a conditional marginal comparison, not causal attribution or an additive decomposition.");
    expect(markdown).not.toContain("### Cell 8414743");
    expect(markdown).toContain("Retained fixture limitation");
  });

  it("does not attach an inspected alternative's explanation to the recommendation", () => {
    const alternateExplanation = { ...makeCellExplanation(), solution_id: "solution-2" };
    const report = makeNetworkReport({ cellExplanations: [alternateExplanation] });
    const markdown = renderMarkdownReport(report);

    expect(markdown).not.toContain("## Evaluated Cell Changes");
    expect(markdown).toContain("#1 Recommended");
  });
});

describe("planning report conditional and fallback behavior", () => {
  it("handles zero aggregate movement with one table and no comparison charts", () => {
    const report = makeNetworkReport({ networkOptimization: makeNetworkOptimization({ zeroDelta: true }) });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("No aggregate KPI change was observed between baseline and the currently recommended configuration.");
    expect(markdown).not.toContain("KPI comparison");
    expect(markdown).not.toContain("Optimization movement");
    expect(markdown.match(/## Baseline vs Recommended/g)).toHaveLength(1);
  });

  it("omits interference output when the analysis was not evaluated", () => {
    const report = makeNetworkReport({ interferenceAnalysis: null });
    const markdown = renderMarkdownReport(report);
    const html = renderHtmlReport(report);

    expect(markdown).not.toContain("## Interference and Radio Quality");
    expect(markdown).toContain("Interference analysis: Not evaluated.");
    expect(html).not.toContain('data-report-section="interference"');
  });

  it("uses an evaluated network result without fabricating baseline or Pareto metadata", () => {
    const report = makeNetworkReport({
      networkOptimization: makeNetworkOptimization({ includeBaseline: false, includePareto: false }),
      networkResultKind: "evaluation",
    });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("# A.T.O.M Network Planning Report");
    expect(markdown).toContain("## Evaluated Network Configuration");
    expect(markdown).toContain("Alternative-solution and baseline metadata are not available for this saved network result.");
    expect(markdown).not.toContain("## Baseline vs Recommended");
    expect(markdown).not.toContain("## Optimization Trade-offs");
  });

  it("keeps a single-cell RF-only report useful and scoped", () => {
    const report = buildPlanningReport({
      activeNetworkTech: "5G mmWave",
      appMeta: { dataset: { name: "Single-cell Pack", version: "1" } },
      buildingSummary: null,
      comparison: null,
      coreLab: null,
      coreLabApplicable: false,
      coreLabEnabled: false,
      coverageGaps: { geojson: { type: "FeatureCollection", features: [] }, stats: { gap_buildings: 0 } },
      diagnostics: null,
      interferenceAnalysis: null,
      measurementAnalysis: null,
      networkOptimization: null,
      planningMode: "single",
      project: { name: "Single Cell Plan", activeScenarioId: "single", scenarios: [{ id: "single", name: "Single Cell Plan" }] },
      recommendations: null,
      selectedNetworkTowers: [],
      selectedTower: { cellId: "8414746", azimuth: 90, coordinates: [32.85, 39.92], rfProfile: { networkTech: "5g", band: "n257", channelId: "C-17", frequencyGHz: 28, txPowerDbm: 30 } },
      settings: { frequencyGHz: 28, txPowerDbm: 30, radiusMeters: 400, beamWidthDeg: 120, rayCount: 120 },
      simulation: { geojson: { type: "FeatureCollection", features: [{ geometry: { type: "LineString", coordinates: [[32.85, 39.92], [32.851, 39.921]] }, properties: { signal_dbm: -84 } }] }, stats: { avg_rx_dbm: -84, min_range_m: 80, max_range_m: 400, blocked_pct: 12 } },
      stats: { avgPower: -84, minRange: 80, maxRange: 400, blockedRatio: 12, rayCount: 1 },
    });
    const markdown = renderMarkdownReport(report);

    expect(markdown.startsWith("# A.T.O.M Single-cell RF Planning Report")).toBe(true);
    expect(markdown).toContain("| Cell | 8414746 |");
    expect(markdown).toContain("## RF Result");
    expect(markdown).toContain("## RF Configuration & Assumptions");
    expect(markdown).toContain("## Planning Map");
    expect(markdown).toContain("## Coverage Gaps");
    expect(markdown).toContain("Coverage gaps: None identified");
    expect(markdown).not.toContain("## Optimization Trade-offs");
    expect(markdown).not.toContain("## Baseline vs Recommended");
    expect(markdown).not.toContain("Interference analysis: Not evaluated.");
  });
});

describe("planning report values", () => {
  it("does not format a raw compatibility aggregate as a normalized score", () => {
    const networkOptimization = makeNetworkOptimization();
    networkOptimization.stats = {
      ...networkOptimization.stats,
      score: undefined,
      composite_score: undefined,
      network_score: 6567105.4,
    };
    const markdown = renderMarkdownReport(makeNetworkReport({ networkOptimization }));

    expect(markdown).not.toContain("6567105.4 / 100");
  });

  it("does not emit broken unavailable-unit placeholders", () => {
    const report = buildPlanningReport({
      activeNetworkTech: "5G mmWave",
      appMeta: null,
      buildingSummary: null,
      comparison: null,
      coreLab: null,
      coreLabApplicable: false,
      coreLabEnabled: false,
      coverageGaps: { geojson: { type: "FeatureCollection", features: [] }, stats: null },
      diagnostics: null,
      interferenceAnalysis: {
        stats: { avg_sinr_db: null, p10_sinr_db: null, avg_rsrp_dbm: null, avg_rsrq_db: null, serviceable_pct: null, interference_limited_pct: null, affected_demand_buildings: null, affected_demand: null, per_serving_cell: [] },
        model: { type: "deterministic_planning_estimate", measurement_family: "nr_ss" },
      },
      measurementAnalysis: null,
      networkOptimization: null,
      planningMode: "single",
      project: null,
      recommendations: null,
      selectedNetworkTowers: [],
      selectedTower: { cellId: 1, coordinates: [32.85, 39.92] },
      settings: {},
      simulation: { geojson: { features: [] }, stats: null },
      stats: {},
    });
    const markdown = renderMarkdownReport(report);

    expect(markdown).not.toMatch(/—(?:%| dBm| score)/);
    expect(markdown).toContain("No valid interference samples were retained for this report.");
    expect(markdown).toContain("Measurement family");
  });

  it("keeps Markdown and HTML aligned on core report semantics", () => {
    const report = makeNetworkReport({ interferenceAnalysis: makeInterferenceAnalysis(), cellExplanations: [makeCellExplanation()] });
    const markdown = renderMarkdownReport(report);
    const html = renderHtmlReport(report);
    for (const section of ["Executive Summary", "Recommended Network Solution", "Baseline vs Recommended", "Optimization Trade-offs", "Evaluated Cell Changes", "Interference and Radio Quality", "RF Configuration & Assumptions", "Data, Methodology & Limitations"]) {
      expect(markdown).toContain(section);
      expect(html.replaceAll("&amp;", "&")).toContain(section);
    }
    expect(html.indexOf('data-report-section="executive-summary"')).toBeLessThan(html.indexOf('data-report-section="recommended-solution"'));
    expect(html.indexOf('data-report-section="recommended-solution"')).toBeLessThan(html.indexOf('data-report-section="baseline-comparison"'));
  });

  it("retains the comparison helper's percentage-point semantics", () => {
    const metrics = getComparisonMetrics({
      kind: "network",
      type: "optimization",
      metrics: {
        demand: { available: true, baseline: 410, optimized: 630 },
        residential: { available: true, baseline: 10, optimized: 15 },
        propagation_reach: { available: true, baseline: 0.524, optimized: 0.579 },
        overlap: { available: true, baseline: 0.152, optimized: 0.075 },
        overlap_buildings: { available: true, baseline: 8, optimized: 4 },
        covered_units: { available: true, baseline: 30, optimized: 40 },
        score: { available: true, baseline: 42.8, optimized: 51 },
      },
    });
    expect(metrics.find((metric) => metric.key === "propagation_reach").deltaLabel).toBe("+5.5 pp");
    expect(metrics.find((metric) => metric.key === "overlap").deltaLabel).toBe("-7.7 pp");
    expect(metrics.find((metric) => metric.key === "score").deltaLabel).toBe("+8.2 score");
  });

  it("labels an unconstrained network result without claiming feasibility", () => {
    const networkOptimization = makeNetworkOptimization();
    networkOptimization.optimization = { ...networkOptimization.optimization, constraints: {} };
    const optimizationConfig = { ...OPTIMIZATION_CONFIG, constraints: {} };
    const report = makeNetworkReport({
      networkOptimization,
      optimizationConfig,
      comparison: buildNetworkOptimizationComparison(networkOptimization, optimizationConfig),
    });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("| Constraints | Not configured | Not configured | Not configured |");
    expect(markdown).not.toContain("| Constraints | Satisfied | Satisfied |");
    expect(markdown).toContain("| Constraints | Not configured |");
  });
});
