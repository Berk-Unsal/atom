import { networkTechnologyForFrequency } from "../generated/policy.js";
import { isDatasetCompatible } from "./projectStore.js";

export function formatCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

export function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return number.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function formatMetric(value, unit) {
  if (value === null || value === undefined) return "n/a";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} ${unit}` : "n/a";
}

export function formatCoreLabState(state) {
  return ({
    scenario_running: "Scenario running",
    connected: "Connected",
    disconnected: "Disconnected",
    disabled: "Disabled",
    not_applicable: "Not applicable",
  })[state] ?? state ?? "Off";
}

export function formatScenario(value) {
  return String(value ?? "normal").split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function isCalibrationProfileCompatible(profile, settings, meta) {
  if (!profile || !meta) return true;
  return profile.kind === "robust_global_path_loss_bias"
    && profile.technology === networkTechnologyForFrequency(settings.frequencyGHz)
    && Number(profile.frequencyGHz) === Number(settings.frequencyGHz)
    && profile.modelVersion === meta.model_version
    && isDatasetCompatible({ datasetRef: profile.dataset }, meta);
}

export function networkAzimuthFor(tower, azimuths, fallback) {
  const value = azimuths[tower.id] ?? azimuths[String(tower.id)] ?? azimuths[String(tower.cellId ?? "")];
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function networkAzimuthMap(towers, optimization, existing = {}) {
  const optimizedByID = new Map(
    (optimization?.optimized_towers ?? []).map((tower) => [String(tower.id), tower.optimal_azimuth]),
  );
  return towers.reduce((azimuths, tower) => {
    const optimized = optimizedByID.get(String(tower.cellId ?? tower.id));
    if (Number.isFinite(Number(optimized))) azimuths[tower.id] = Number(optimized);
    return azimuths;
  }, { ...existing });
}

export function buildComparisonSnapshot({ coverageGaps, diagnostics, label, settings, simulation, tower }) {
  return {
    coverageGaps,
    diagnostics,
    kind: "single",
    label,
    settings: { ...settings },
    stats: normalizeSimulationStats(simulation, coverageGaps),
    timestamp: new Date().toISOString(),
    tower,
  };
}

export function buildNetworkComparisonSnapshot({ label, optimization, settings, towers }) {
  return {
    kind: "network",
    label,
    optimization,
    settings: { ...settings },
    stats: normalizeNetworkStats(optimization),
    timestamp: new Date().toISOString(),
    towers,
  };
}

export function combineNetworkSimulations(simulations) {
  const features = simulations.flatMap((payload, simulationIndex) =>
    (payload?.geojson?.features ?? []).map((feature) => ({
      ...feature,
      properties: { ...(feature.properties ?? {}), network_tower_index: simulationIndex },
    })));
  const stats = simulations.map((payload) => payload?.stats).filter(Boolean);
  return {
    geojson: { type: "FeatureCollection", features },
    stats: {
      avg_rx_dbm: average(stats.map((item) => item.avg_rx_dbm)),
      blocked_pct: average(stats.map((item) => item.blocked_pct)),
      max_range_m: Math.max(...stats.map((item) => Number(item.max_range_m ?? 0)), 0),
      min_range_m: minFinite(stats.map((item) => item.min_range_m)),
    },
  };
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length === 0 ? 0 : numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function minFinite(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length === 0 ? 0 : Math.min(...numbers);
}

export function normalizeSimulationStats(simulation, coverageGaps) {
  return {
    avgPower: simulation?.stats?.avg_rx_dbm ?? null,
    blockedRatio: simulation?.stats?.blocked_pct ?? null,
    gapBuildings: coverageGaps?.stats?.gap_buildings ?? null,
    gapRatio: coverageGaps?.stats?.gap_pct ?? null,
    maxRange: simulation?.stats?.max_range_m ?? null,
    minRange: simulation?.stats?.min_range_m ?? null,
    rayCount: simulation?.geojson?.features?.length ?? 0,
    totalGapDemand: coverageGaps?.stats?.total_gap_demand ?? null,
    worstRx: coverageGaps?.stats?.worst_rx_dbm ?? null,
  };
}

export function normalizeNetworkStats(optimization) {
  const stats = optimization?.stats ?? {};
  return {
    coverageScore: stats.coverage_score ?? null,
    demandScore: stats.demand_score ?? null,
    networkScore: stats.network_score ?? null,
    overlapBuildings: stats.overlap_buildings ?? null,
    overlapPenalty: stats.overlap_penalty ?? null,
    residentialScore: stats.residential_score ?? null,
    uniqueDemandBuildings: stats.unique_demand_buildings ?? null,
    uniqueResidentialBuildings: stats.unique_residential_buildings ?? null,
  };
}
