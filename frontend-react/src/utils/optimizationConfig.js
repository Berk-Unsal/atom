export const OPTIMIZATION_OBJECTIVES = [
  { id: "demand", label: "Demand", direction: "Maximize", description: "Prioritize covered points of interest and demand weights." },
  { id: "residential", label: "Residential", direction: "Maximize", description: "Prioritize covered residential buildings." },
  { id: "coverage", label: "Coverage", direction: "Maximize", description: "Prefer longer usable ray reach." },
  { id: "overlap", label: "Overlap", direction: "Minimize", description: "Penalize buildings reached by multiple selected cells." },
];

export function createDefaultOptimizationConfig() {
  return {
    objectives: OPTIMIZATION_OBJECTIVES.map(({ id }) => ({ id, weight: 1 })),
    constraints: {},
  };
}

export function normalizeOptimizationConfig(config) {
  const defaults = createDefaultOptimizationConfig();
  if (!config || !Array.isArray(config.objectives) || config.objectives.length === 0) return defaults;
  const known = new Set(OPTIMIZATION_OBJECTIVES.map(({ id }) => id));
  const seen = new Set();
  const objectives = config.objectives
    .filter((objective) => known.has(objective?.id) && !seen.has(objective.id) && seen.add(objective.id))
    .map((objective) => ({
      id: objective.id,
      weight: boundedNumber(objective.weight, 1, 0.01, 100),
    }));
  return {
    objectives: objectives.length > 0 ? objectives : defaults.objectives,
    constraints: cleanConstraints(config.constraints),
  };
}

export function optimizationConfigToPayload(config) {
  const normalized = normalizeOptimizationConfig(config);
  return {
    objectives: normalized.objectives,
    constraints: cleanConstraints(normalized.constraints),
  };
}

function cleanConstraints(constraints = {}) {
  const output = {};
  const coverage = optionalNumber(constraints.min_coverage_score, false);
  const demand = optionalNumber(constraints.min_unique_demand_buildings, true);
  const residential = optionalNumber(constraints.min_unique_residential_buildings, true);
  const overlap = optionalNumber(constraints.max_overlap_buildings, true);
  if (coverage !== undefined) output.min_coverage_score = coverage;
  if (demand !== undefined) output.min_unique_demand_buildings = demand;
  if (residential !== undefined) output.min_unique_residential_buildings = residential;
  if (overlap !== undefined) output.max_overlap_buildings = overlap;
  return output;
}

function optionalNumber(value, integer) {
  if (value === "" || value === null || value === undefined) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return integer ? Math.floor(numeric) : numeric;
}

function boundedNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
