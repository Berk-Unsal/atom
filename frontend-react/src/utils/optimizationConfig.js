export const OPTIMIZATION_OBJECTIVES = [
  { id: "demand", label: "Demand", direction: "Maximize", description: "Prioritize served demand weight." },
  { id: "residential", label: "Residential", direction: "Maximize", description: "Prioritize covered residential buildings." },
  { id: "coverage", label: "Propagation reach", direction: "Maximize", description: "Maximize usable propagation distance." },
  { id: "overlap", label: "Reduce overlap", direction: "Maximize utility", description: "Prefer coverage without duplicate service." },
];

const DEFAULT_OPTIMIZATION_PRIORITY = 50;

export function createDefaultOptimizationConfig() {
  return {
    objectives: OPTIMIZATION_OBJECTIVES.map(({ id }) => ({ id, weight: DEFAULT_OPTIMIZATION_PRIORITY })),
    constraints: {},
  };
}

export function normalizeOptimizationConfig(config) {
  const defaults = createDefaultOptimizationConfig();
  if (!config || !Array.isArray(config.objectives) || config.objectives.length === 0) return defaults;
  const known = new Set(OPTIMIZATION_OBJECTIVES.map(({ id }) => id));
  const byID = new Map();
  for (const objective of config.objectives) {
    if (!known.has(objective?.id) || byID.has(objective.id)) continue;
    byID.set(objective.id, {
      id: objective.id,
      weight: boundedNumber(objective.weight, DEFAULT_OPTIMIZATION_PRIORITY, 0, 100),
    });
  }
  if (byID.size === 0) return defaults;
  return {
    // Missing objectives represent goals that were previously disabled. They remain
    // visible as zero-priority sliders after the checkbox UI migration.
    objectives: OPTIMIZATION_OBJECTIVES.map(({ id }) => byID.get(id) ?? { id, weight: 0 }),
    constraints: cleanConstraints(config.constraints),
  };
}

export function optimizationPriorityTotal(config) {
  return normalizeOptimizationConfig(config).objectives.reduce((total, objective) => total + Number(objective.weight || 0), 0);
}

export function optimizationConfigValidationMessage(config) {
  return optimizationPriorityTotal(config) > 0
    ? ""
    : "Set at least one optimization priority above 0 to run optimization.";
}

export function normalizePriorityWeights(config, objectiveStatus = null) {
  const normalized = normalizeOptimizationConfig(config);
  const total = normalized.objectives.reduce((sum, objective) => (
    objectiveStatus?.[objective.id]?.available === false
      ? sum
      : sum + Number(objective.weight || 0)
  ), 0);
  return Object.fromEntries(OPTIMIZATION_OBJECTIVES.map(({ id }) => [
    id,
    objectiveStatus?.[id]?.available === false || total <= 0
      ? 0
      : Number(normalized.objectives.find((objective) => objective.id === id)?.weight ?? 0) / total,
  ]));
}

export function optimizationConfigToPayload(config) {
  const normalized = normalizeOptimizationConfig(config);
  return {
    objectives: normalized.objectives,
    constraints: cleanConstraints(normalized.constraints),
  };
}

export function normalizeObjectiveUtilities(stats = {}) {
  const objectiveStatus = stats.objective_status ?? stats.objectiveStatus ?? {};
  const responseUtilities = stats.objectives ?? stats.objectives_normalized;
  if (responseUtilities && OPTIMIZATION_OBJECTIVES.every(({ id }) => (
    objectiveStatus?.[id]?.available === false || Number.isFinite(Number(responseUtilities[id]))
  ))) {
    return Object.fromEntries(OPTIMIZATION_OBJECTIVES.map(({ id }) => [
      id,
      objectiveStatus?.[id]?.available === false ? null : clamp01(Number(responseUtilities[id])),
    ]));
  }

  const raw = stats.raw_metrics ?? stats.rawMetrics ?? {};
  const servedDemand = readMetric(raw, "served_demand_weight", "servedDemandWeight")
    ?? readMetric(raw, "served_weighted_demand", "servedWeightedDemand");
  const totalDemand = readMetric(raw, "relevant_demand_weight", "relevantDemandWeight")
    ?? readMetric(raw, "total_weighted_demand", "totalWeightedDemand");
  const residentialCovered = readMetric(raw, "residential_covered", "residentialCovered");
  const residentialTotal = readMetric(raw, "relevant_residential_total", "relevantResidentialTotal")
    ?? readMetric(raw, "residential_total", "residentialTotal");
  const coverageScore = readMetric(raw, "propagation_reach_score", "propagationReachScore")
    ?? readMetric(raw, "coverage_reach_score", "coverageReachScore");
  const coverageMaximum = readMetric(raw, "propagation_reach_maximum", "propagationReachMaximum")
    ?? readMetric(raw, "coverage_reach_maximum", "coverageReachMaximum");
  const overlapRatio = readMetric(raw, "overlap_ratio", "overlapRatio");
  const coveredUnits = readMetric(raw, "covered_units", "coveredUnits");
  const overlapBuildings = readMetric(raw, "overlap_buildings", "overlapBuildings")
    ?? Number(stats.overlap_buildings ?? stats.overlapBuildings);

  return {
    demand: objectiveStatus?.demand?.available === false ? null : ratio01(servedDemand, totalDemand),
    residential: objectiveStatus?.residential?.available === false ? null : ratio01(residentialCovered, residentialTotal),
    coverage: objectiveStatus?.coverage?.available === false ? null : ratio01(coverageScore, coverageMaximum),
    overlap: objectiveStatus?.overlap?.available === false
      ? null
      : clamp01(1 - (overlapRatio ?? ratio01(overlapBuildings, coveredUnits))),
  };
}

export function calculateCompositeScore(utilities, weights) {
  return clamp01(OPTIMIZATION_OBJECTIVES.reduce(
    (score, { id }) => score + Number(weights?.[id] ?? 0) * (utilities?.[id] === null ? 0 : Number(utilities?.[id] ?? 0)),
    0,
  ));
}

export function scoreOptimizationStats(stats = {}, config) {
  const utilities = normalizeObjectiveUtilities(stats);
  const objectiveStatus = stats.objective_status ?? stats.objectiveStatus ?? {};
  const weights = normalizePriorityWeights(config, objectiveStatus);
  const compositeScore = calculateCompositeScore(utilities, weights);
  const objectiveBreakdown = Object.fromEntries(OPTIMIZATION_OBJECTIVES.map(({ id }) => [id, {
    utility: utilities[id],
    weight: weights[id],
    contribution: utilities[id] === null ? null : utilities[id] * weights[id],
  }]));
  const nextStatus = Object.fromEntries(OPTIMIZATION_OBJECTIVES.map(({ id }) => {
    const configuredPriority = Number(normalizeOptimizationConfig(config).objectives.find((objective) => objective.id === id)?.weight ?? 0);
    const existing = objectiveStatus?.[id] ?? { available: true };
    return [id, {
      ...existing,
      configured_priority: configuredPriority,
      effective_weight: weights[id],
      utility: existing.available === false ? null : utilities[id],
      contribution: existing.available === false ? null : utilities[id] * weights[id],
    }];
  }));
  return {
    ...stats,
    objectives: utilities,
    composite_score: compositeScore,
    score: compositeScore * 100,
    objective_breakdown: objectiveBreakdown,
    objective_status: nextStatus,
  };
}

export function rankParetoSolutions(frontier, config) {
  return (frontier ?? [])
    .map((solution) => {
      const stats = scoreOptimizationStats(solution.stats ?? {}, config);
      return {
        ...solution,
        stats,
        composite_score: stats.composite_score,
        score: stats.score,
      };
    })
    .sort((left, right) => {
      const scoreDelta = Number(right.score ?? 0) - Number(left.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return paretoSolutionKey(left).localeCompare(paretoSolutionKey(right));
    });
}

// Re-ranks the already evaluated frontier locally. No RF request is needed because
// each current backend solution carries stable objective utilities/raw metrics.
export function rankOptimizationResponse(response, config) {
  if (!response) return response;
  const responseStatus = response.stats?.objective_status ?? response.optimization?.objective_status ?? {};
  const weights = normalizePriorityWeights(config, responseStatus);
  const frontier = rankParetoSolutions(response.pareto_frontier, config);
  if (frontier.length === 0) {
    const stats = scoreOptimizationStats(response.stats ?? {}, config);
    return {
      ...response,
      stats,
      optimization: {
        ...(response.optimization ?? {}),
        normalized_weights: weights,
        effective_weights: weights,
        composite_score: stats.composite_score,
        score: stats.score,
      },
    };
  }

  const recommendation = frontier[0];
  const existingTowers = new Map((response.optimized_towers ?? []).map((tower) => [String(tower.id), tower]));
  const optimizedTowers = (recommendation.towers ?? []).map((tower) => ({
    ...(existingTowers.get(String(tower.id)) ?? {}),
    id: tower.id,
    optimal_azimuth: tower.azimuth_deg,
  }));
  return {
    ...response,
    stats: recommendation.stats,
    optimized_towers: optimizedTowers,
    pareto_frontier: frontier,
    optimization: {
      ...(response.optimization ?? {}),
      objectives: normalizeOptimizationConfig(config).objectives,
      normalized_weights: weights,
      effective_weights: weights,
      composite_score: recommendation.composite_score,
      score: recommendation.score,
      constraints_satisfied: true,
      violations: [],
    },
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

function readMetric(object, snakeKey, camelKey) {
  const value = object?.[snakeKey] ?? object?.[camelKey];
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function ratio01(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return clamp01(numerator / denominator);
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

function paretoSolutionKey(solution) {
  return (solution.towers ?? []).map((tower) => `${tower.id}:${Number(tower.azimuth_deg ?? 0).toFixed(1)}`).join(",");
}
