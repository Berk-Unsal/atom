import { resolveRFProfile, rfProfileToPayload } from "../../utils/rfProfile.js";
import { buildNetworkOptimizationComparison } from "../../utils/optimizationConfig.js";

// Illustrative retained responses for presentation regressions, not new RF/validation evidence.
export function reportInputs({ cells = 8, optimized = false, heterogeneous = false, longIds = false, longScenario = false, extendedAppendix = false, geometry = true, segments = 8748, tech = "5g" } = {}) {
  const frequencyGHz = tech === "4g" ? 2.6 : tech === "6g" ? 140 : 28;
  const settings = { networkTech: tech, frequencyGHz, radiusMeters: 400, txPowerDbm: 30, beamWidthDeg: 120, rayCount: 120, calibrationOffsetDb: 0 };
  const towers = Array.from({ length: cells }, (_, i) => ({
    id: `record-${i + 1}`, cellId: longIds ? `cell-${String(i + 1).padStart(40, "0")}` : String(8414701 + i),
    coordinates: [32.854 + Math.floor(i / 3) * 0.0007, 39.921 + Math.floor(i / 3) * 0.0004], azimuth: i * 45,
    rfProfile: { networkTech: tech, frequencyGHz, channelId: "CH-1", receiverSensitivityMode: "manual", receiverSensitivityDbm: -115,
      ...(heterogeneous && i === cells - 1 ? { bandwidthMHz: 200, antennaGainDbi: 23.5, antennaHeightM: 28, loadFactor: 0.55,
        horizontalPatternId: "cosine-sector", receiverSensitivityMode: "derived", receiverNoiseBandwidthHz: 200e6, receiverNoiseBandwidthSource: "explicit_receiver_noise_bandwidth_hz", receiverNoiseFigureDb: 6, receiverRequiredSnrDb: 4, receiverMarginDb: 2 } : {}) },
  }));
  const raw = { served_demand_weight: 260, relevant_demand_weight: 260, residential_covered: 89, relevant_residential_total: 99,
    propagation_reach_score: 22683.5 * cells / 8, propagation_reach_maximum: cells * 120 * 100,
    covered_units: 523, overlap_buildings: 246, overlap_ratio: 246 / 523 };
  const stats = { score: 66.6228, composite_score: 0.666228, network_score: 9876543, raw_metrics: raw,
    objectives: { demand: 1, residential: 89 / 99, coverage: raw.propagation_reach_score / raw.propagation_reach_maximum, overlap: 1 - 246 / 523 },
    objective_status: { demand: { available: true }, residential: { available: true }, coverage: { available: true }, overlap: { available: true }, radio_quality: { available: false, reason: "not_evaluated" } } };
  const profiles = towers.map((tower, i) => ({ id: tower.cellId, tower_lon: tower.coordinates[0], tower_lat: tower.coordinates[1], azimuth_deg: tower.azimuth, rf_profile: rfProfileToPayload(resolveRFProfile(tower, settings, i)) }));
  const solution = { id: "solution-1", towers: profiles, stats };
  const sourceName = longScenario ? "Ankara report layout fixture with a long scenario name for engineering review and reproducibility across portrait pages" : "Ankara report layout fixture";
  const binding = { project_id: "project-fixture", scenario_id: "scenario-fixture", scenario_revision_id: "revision-fixture",
    run_ids: optimized ? ["run-fixture"] : [], source_kind: "scenario_revision", scenario_fingerprint: "a".repeat(64), input_fingerprints: ["b".repeat(64)], dataset_references: [{ dataset_id: "ankara-fixture", version: "2026.10" }] };
  const geojson = { type: "FeatureCollection", features: !geometry ? [] : Array.from({ length: segments }, (_, i) => {
    const cell = towers[i % cells];
    const ray = Math.floor(i / cells) % 120;
    const step = Math.floor(i / (cells * 120));
    const direction = (cell.azimuth + ray - 60) * Math.PI / 180;
    const start = [(cell.coordinates[0] + Math.cos(direction) * step * 0.00018), cell.coordinates[1] + Math.sin(direction) * step * 0.00014];
    const end = [cell.coordinates[0] + Math.cos(direction) * (step + 1) * 0.00018, cell.coordinates[1] + Math.sin(direction) * (step + 1) * 0.00014];
    return { type: "Feature", properties: { cell_id: cell.cellId, ray_index: ray, segment_index: step, signal_dbm: -75 - step * 4 }, geometry: { type: "LineString", coordinates: [start, end] } };
  }) };
  const inputs = {
    generatedAt: new Date("2026-10-19T08:36:12.000Z"), activeNetworkTech: tech === "4g" ? "4G LTE" : tech === "6g" ? "6G research" : "5G mmWave",
    planningMode: "network", networkResultKind: optimized ? "optimization" : "evaluation", settings, selectedNetworkTowers: towers,
    project: { id: "project-fixture", name: "Ankara engineering review", activeScenarioId: "scenario-fixture", scenarios: [{ id: "scenario-fixture", name: sourceName }] },
    domainBinding: binding, sourceContext: { ...binding, scenario_name: sourceName, project_name: "Ankara engineering review", version: 2, version_label: "Version 2", runs: optimized ? [{ run_id: "run-fixture", run_type: "optimization" }] : [] },
    appMeta: { application_version: "0.12.3", model_version: "fixture-model-v1", dataset: { id: "ankara-fixture", name: "Illustrative layout fixture (not physical validation evidence)", version: "2026.10", sources: ["Synthetic report regression data"], licenses: ["Repository test fixture"], sha256: { "buildings.geojson": "c".repeat(64) }, quality: { summary: "Layout test data only" } },
      rf_contract: { model_id: "urban_short_range", applied_model_id: "urban_short_range", model_description: "Deterministic planning profile; fixture metadata", applicability: "Fixture scope only", building_service_threshold_dbm: -100,
        receiver_sensitivity_scope: "Per-Cell ray termination", receiver_sensitivity_equation: "-174 + 10 log10(B_Hz) + NF + SNR_required + margin", receiver_noise_semantics: "Receiver noise bandwidth is distinct from interference sample domain", interference_rsrp_threshold_dbm: -110, interference_sinr_threshold_db: 0, interference_rsrq_threshold_db: -17 } },
    buildingSummary: { total_buildings: 1500, demand_weighted_buildings: 20, residential_weighted_buildings: 150 },
    networkOptimization: { stats, effective_cell_profiles: profiles, optimized_towers: profiles.map((profile) => ({ ...profile, optimal_azimuth: profile.azimuth_deg })),
      optimization_domain: { source: "selected_cell_radius_union", selected_cell_count: cells, radius_policy: "cell_rf_profile_radius_m_else_request_radius_m", relevant_building_entities: 600, relevant_demand_entities: 6, relevant_residential_entities: 99 },
      optimization: { recommended: optimized, recommended_solution_id: optimized ? "solution-1" : null, configured_priorities: { demand: 25, residential: 25, coverage: 25, overlap: 25 }, effective_weights: { demand: 0.25, residential: 0.25, coverage: 0.25, overlap: 0.25 }, objective_status: stats.objective_status, constraints: {}, radio_quality: { enabled: false, available: false, reason: "not_evaluated" } },
      ...(optimized ? { baseline: { cell_configurations: profiles.map((profile) => ({ ...profile, azimuth_deg: (profile.azimuth_deg + 10) % 360 })), stats: { ...stats, score: 55.2, raw_metrics: { ...raw, served_demand_weight: 210 } }, parameters: { rays: 120, radius_m: 400, frequency_ghz: frequencyGHz, tx_power_dbm: 30 } }, pareto_frontier: [solution, { ...solution, id: "solution-2" }], optimization_run_id: "compute-fixture" } : {}) },
    optimizationConfig: { objectives: ["demand", "residential", "coverage", "overlap"].map((id) => ({ id, weight: 25 })), constraints: {} },
    simulation: { geojson, stats: { avg_rx_dbm: -202.2, blocked_pct: 99.3, max_range_m: 400, min_range_m: 5 } },
    simulationSource: { kind: optimized ? "optimization" : "evaluation", solution_id: optimized ? "solution-1" : null },
    coverageGaps: { geojson: { type: "FeatureCollection", features: [] }, stats: { gap_buildings: 0, returned_gaps: 0, building_service_threshold_dbm: -100 } },
  };
  if (optimized) inputs.comparison = buildNetworkOptimizationComparison(inputs.networkOptimization, inputs.optimizationConfig);
  if (extendedAppendix) Object.assign(inputs.appMeta.dataset.sha256, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`fixture-layer-${String(i).padStart(2, "0")}.geojson`, "d".repeat(64)])));
  return inputs;
}
