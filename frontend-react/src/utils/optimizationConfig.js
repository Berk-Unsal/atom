export const OPTIMIZATION_OBJECTIVES = [
  { id: "demand", label: "Demand", direction: "Maximize", description: "Prioritize served demand weight." },
  { id: "residential", label: "Residential", direction: "Maximize", description: "Prioritize covered residential buildings." },
  { id: "coverage", label: "Propagation reach", direction: "Maximize", description: "Maximize usable propagation distance." },
  { id: "overlap", label: "Reduce overlap", direction: "Maximize utility", description: "Prefer coverage without duplicate service." },
  { id: "radio_quality", label: "Radio quality", direction: "Maximize", description: "Reward the fixed-domain fraction meeting RSRP, SINR, and RSRQ planning thresholds.", defaultWeight: 0 },
];

const DEFAULT_OPTIMIZATION_PRIORITY = 50;

export function createDefaultOptimizationConfig() {
  return {
    objectives: OPTIMIZATION_OBJECTIVES.map(({ id, defaultWeight }) => ({ id, weight: defaultWeight ?? DEFAULT_OPTIMIZATION_PRIORITY })),
    constraints: {},
  };
}

export function normalizeOptimizationConfig(config) {
  const defaults = createDefaultOptimizationConfig();
  if (!config || !Array.isArray(config.objectives) || config.objectives.length === 0) return defaults;
  const known = new Set(OPTIMIZATION_OBJECTIVES.map(({ id }) => id));
  const byID = new Map();
  for (const objective of config.objectives) {
    const id = String(objective?.id ?? "").trim().toLowerCase();
    if (!known.has(id) || byID.has(id)) continue;
    byID.set(id, {
      id,
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
    objectiveStatus?.[id]?.available === false || hasNumericValue(responseUtilities[id])
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
  const overlapFraction = overlapRatio ?? ratio01(overlapBuildings, coveredUnits);
  const radioQualityFraction = readMetric(raw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
  const radioQualityEvaluated = radioQualityFraction !== undefined
    || readMetric(raw, "radio_quality_total_samples", "radioQualityTotalSamples") !== undefined;

  return {
    demand: objectiveStatus?.demand?.available === false ? null : ratio01(servedDemand, totalDemand),
    residential: objectiveStatus?.residential?.available === false ? null : ratio01(residentialCovered, residentialTotal),
    coverage: objectiveStatus?.coverage?.available === false ? null : ratio01(coverageScore, coverageMaximum),
    overlap: objectiveStatus?.overlap?.available === false
      ? null
      : overlapFraction === null ? null : clamp01(1 - overlapFraction),
    radio_quality: objectiveStatus?.radio_quality?.available === false
      ? null
      : radioQualityEvaluated ? clamp01(radioQualityFraction ?? 0) : null,
  };
}

export function calculateCompositeScore(utilities, weights) {
  return clamp01(OPTIMIZATION_OBJECTIVES.reduce(
    (score, { id }) => score + Number(weights?.[id] ?? 0) * (utilities?.[id] === null ? 0 : Number(utilities?.[id] ?? 0)),
    0,
  ));
}

export function scoreOptimizationStats(stats = {}, config) {
  const objectiveStatus = ensureRadioQualityRerankStatus(
    stats.objective_status ?? stats.objectiveStatus ?? {},
    stats,
  );
  const utilities = normalizeObjectiveUtilities({ ...stats, objective_status: objectiveStatus });
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
    const available = existing.available !== false && utilities[id] !== null && utilities[id] !== undefined;
    return [id, {
      ...existing,
      configured_priority: configuredPriority,
      effective_weight: weights[id],
      utility: available ? utilities[id] : null,
      contribution: available ? utilities[id] * weights[id] : null,
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

export function rankParetoSolutions(frontier, config, objectiveStatus = null) {
  const candidates = Array.isArray(frontier) ? frontier : [];
  return candidates
    .map((solution) => {
      const stats = scoreOptimizationStats(withObjectiveStatus(solution.stats ?? {}, objectiveStatus), config);
      const id = getParetoSolutionId(solution);
      return {
        ...solution,
        id,
        stats,
        composite_score: stats.composite_score,
        score: stats.score,
      };
    })
    .sort((left, right) => {
      const scoreDelta = Number(right.score ?? 0) - Number(left.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return getParetoSolutionId(left).localeCompare(getParetoSolutionId(right));
    });
}

export function getParetoSolutionId(solution) {
  const provided = solution?.id;
  if (provided !== null && provided !== undefined && String(provided).trim() !== "") {
    return String(provided);
  }
  return paretoSolutionKey(solution);
}

export function resolveSelectedParetoSolutionId(solutions, recommendedSolutionId, selectedSolutionId) {
  const candidates = Array.isArray(solutions) ? solutions : [];
  const availableIDs = new Set(candidates.map((solution) => getParetoSolutionId(solution)));
  const selectedID = selectedSolutionId === null || selectedSolutionId === undefined
    ? ""
    : String(selectedSolutionId);
  if (selectedID && availableIDs.has(selectedID)) return selectedID;
  const recommendedID = recommendedSolutionId === null || recommendedSolutionId === undefined
    ? ""
    : String(recommendedSolutionId);
  if (recommendedID && availableIDs.has(recommendedID)) return recommendedID;
  return candidates.length > 0 ? getParetoSolutionId(candidates[0]) : null;
}

// Re-ranks the already evaluated frontier locally. No RF request is needed because
// each current backend solution carries stable objective utilities/raw metrics.
export function rankOptimizationResponse(response, config) {
  if (!response) return response;
  const responseStatus = ensureRadioQualityRerankStatus(objectiveStatusFromResponse(response), response);
  const weights = normalizePriorityWeights(config, responseStatus);
  const frontier = rankParetoSolutions(response.pareto_frontier, config, responseStatus);
  if (frontier.length === 0) {
    const stats = scoreOptimizationStats(withObjectiveStatus(response.stats ?? {}, responseStatus), config);
    const normalizedConfig = normalizeOptimizationConfig(config);
    return {
      ...response,
      stats,
      optimization: {
        ...(response.optimization ?? {}),
        objectives: normalizedConfig.objectives,
        configured_priorities: Object.fromEntries(normalizedConfig.objectives.map((objective) => [objective.id, objective.weight])),
        normalized_weights: weights,
        effective_weights: weights,
        composite_score: stats.composite_score,
        score: stats.score,
        objective_status: stats.objective_status,
      },
    };
  }

  const recommendation = frontier[0];
  const normalizedConfig = normalizeOptimizationConfig(config);
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
      objectives: normalizedConfig.objectives,
      configured_priorities: Object.fromEntries(normalizedConfig.objectives.map((objective) => [objective.id, objective.weight])),
      normalized_weights: weights,
      effective_weights: weights,
      composite_score: recommendation.composite_score,
      score: recommendation.score,
      recommended_solution_id: getParetoSolutionId(recommendation),
      objective_status: recommendation.stats.objective_status,
      constraints_satisfied: true,
      violations: [],
    },
  };
}

// Compares one inspected frontier solution with the current recommendation.
// Values are intentionally named selected/recommended so the delta direction
// cannot be confused with Concept 2A's baseline/optimized comparison.
export function buildParetoSolutionComparison(selectedSolution, recommendedSolution, config) {
  if (!selectedSolution || !recommendedSolution) return null;
  const selectedID = getParetoSolutionId(selectedSolution);
  const recommendedID = getParetoSolutionId(recommendedSolution);
  if (selectedID === recommendedID) return null;

  const objectiveStatus = mergeObjectiveStatuses(
    selectedSolution.stats?.objective_status ?? selectedSolution.stats?.objectiveStatus,
    recommendedSolution.stats?.objective_status ?? recommendedSolution.stats?.objectiveStatus,
  );
  const selectedStats = scoreOptimizationStats(withObjectiveStatus(selectedSolution.stats ?? {}, objectiveStatus), config);
  const recommendedStats = scoreOptimizationStats(withObjectiveStatus(recommendedSolution.stats ?? {}, objectiveStatus), config);
  const hasHardConstraints = Object.keys(cleanConstraints(config?.constraints ?? {})).length > 0;
  const selectedRaw = selectedStats.raw_metrics ?? {};
  const recommendedRaw = recommendedStats.raw_metrics ?? {};
  const selectedReachMaximum = readMetric(selectedRaw, "propagation_reach_maximum", "propagationReachMaximum")
    ?? readMetric(selectedRaw, "coverage_reach_maximum", "coverageReachMaximum");
  const recommendedReachMaximum = readMetric(recommendedRaw, "propagation_reach_maximum", "propagationReachMaximum")
    ?? readMetric(recommendedRaw, "coverage_reach_maximum", "coverageReachMaximum");
  const sharedReachMaximum = sharedValue(selectedReachMaximum, recommendedReachMaximum);
  const selectedOverlapRatio = readMetric(selectedRaw, "overlap_ratio", "overlapRatio")
    ?? inverseUtility(selectedStats.objectives?.overlap);
  const recommendedOverlapRatio = readMetric(recommendedRaw, "overlap_ratio", "overlapRatio")
    ?? inverseUtility(recommendedStats.objectives?.overlap);

  return {
    selected_solution_id: selectedID,
    recommended_solution_id: recommendedID,
    effective_weights: normalizePriorityWeights(config, objectiveStatus),
    objective_status: selectedStats.objective_status ?? objectiveStatus,
    metrics: {
      demand: solutionComparisonMetric({
        available: objectiveAvailable(objectiveStatus, "demand", selectedStats, recommendedStats),
        key: "demand",
        preferredDirection: "higher",
        recommended: recommendedStats.objectives?.demand,
        selected: selectedStats.objectives?.demand,
        unit: "ratio",
        denominator: sharedValue(
          readMetric(selectedRaw, "relevant_demand_weight", "relevantDemandWeight")
            ?? readMetric(selectedRaw, "total_weighted_demand", "totalWeightedDemand"),
          readMetric(recommendedRaw, "relevant_demand_weight", "relevantDemandWeight")
            ?? readMetric(recommendedRaw, "total_weighted_demand", "totalWeightedDemand"),
        ),
      }),
      residential: solutionComparisonMetric({
        available: objectiveAvailable(objectiveStatus, "residential", selectedStats, recommendedStats),
        key: "residential",
        preferredDirection: "higher",
        recommended: recommendedStats.objectives?.residential,
        selected: selectedStats.objectives?.residential,
        unit: "ratio",
        denominator: sharedValue(
          readMetric(selectedRaw, "relevant_residential_total", "relevantResidentialTotal")
            ?? readMetric(selectedRaw, "residential_total", "residentialTotal"),
          readMetric(recommendedRaw, "relevant_residential_total", "relevantResidentialTotal")
            ?? readMetric(recommendedRaw, "residential_total", "residentialTotal"),
        ),
      }),
      propagation_reach: solutionComparisonMetric({
        available: objectiveAvailable(objectiveStatus, "coverage", selectedStats, recommendedStats),
        key: "propagation_reach",
        preferredDirection: "higher",
        recommended: recommendedStats.objectives?.coverage,
        selected: selectedStats.objectives?.coverage,
        unit: "ratio",
        denominator: sharedReachMaximum,
      }),
      overlap: solutionComparisonMetric({
        available: objectiveAvailable(objectiveStatus, "overlap", selectedStats, recommendedStats)
          && Number.isFinite(selectedOverlapRatio)
          && Number.isFinite(recommendedOverlapRatio),
        key: "overlap",
        preferredDirection: "lower",
        recommended: recommendedOverlapRatio,
        selected: selectedOverlapRatio,
        unit: "ratio",
        utilityRecommended: recommendedStats.objectives?.overlap,
        utilitySelected: selectedStats.objectives?.overlap,
      }),
      radio_quality: solutionComparisonMetric({
        available: objectiveAvailable(objectiveStatus, "radio_quality", selectedStats, recommendedStats)
          && isRadioQualityEvaluated(selectedStats)
          && isRadioQualityEvaluated(recommendedStats),
        key: "radio_quality",
        preferredDirection: "higher",
        recommended: recommendedStats.objectives?.radio_quality,
        selected: selectedStats.objectives?.radio_quality,
        unit: "ratio",
        denominator: sharedValue(
          readMetric(selectedRaw, "radio_quality_total_samples", "radioQualityTotalSamples"),
          readMetric(recommendedRaw, "radio_quality_total_samples", "radioQualityTotalSamples"),
        ),
      }),
      score: solutionComparisonMetric({
        available: Number.isFinite(Number(selectedStats.score)) && Number.isFinite(Number(recommendedStats.score)),
        key: "score",
        preferredDirection: "higher",
        recommended: recommendedStats.score,
        selected: selectedStats.score,
        unit: "score",
        includeUtility: false,
      }),
      constraints: solutionComparisonConstraintMetric(
        selectedSolution.constraints_satisfied !== false,
        recommendedSolution.constraints_satisfied !== false,
        hasHardConstraints,
      ),
    },
  };
}

// Builds the reusable baseline-vs-optimized model from one optimization
// execution. The baseline snapshot is authoritative backend data; the
// optimized side is the currently ranked feasible Pareto solution.
export function buildNetworkOptimizationComparison(response, config) {
  const baseline = response?.baseline;
  if (!baseline?.stats || !response?.stats) return null;

  const frontier = Array.isArray(response.pareto_frontier) ? response.pareto_frontier : [];
  const hasRecommendation = frontier.length > 0
    && response.optimization?.recommended !== false
    && (response.optimized_towers?.length > 0 || frontier[0]?.towers?.length > 0);
  if (!hasRecommendation) return null;

  const baselineStats = scoreOptimizationStats(ensureObjectiveStatus(baseline.stats, response), config);
  const recommendedID = response.optimization?.recommended_solution_id;
  const optimizedSolution = frontier.find((solution) => (
    recommendedID !== null
      && recommendedID !== undefined
      && getParetoSolutionId(solution) === String(recommendedID)
  )) ?? frontier[0];
  const optimizedStats = scoreOptimizationStats(
    ensureObjectiveStatus(optimizedSolution?.stats ?? response.stats, response),
    config,
  );
  const optimizedSolutionID = getParetoSolutionId(optimizedSolution);
  const optimizedConfigurations = buildOptimizedConfigurations(
    baseline.cell_configurations,
    response.optimized_towers,
    optimizedSolution,
  );
  const baselineRaw = baselineStats.raw_metrics ?? {};
  const optimizedRaw = optimizedStats.raw_metrics ?? {};
  const objectiveStatus = optimizedStats.objective_status ?? baselineStats.objective_status ?? {};
  const sharedDemandDenominator = sharedValue(
    readMetric(baselineRaw, "relevant_demand_weight", "relevantDemandWeight")
      ?? readMetric(baselineRaw, "total_weighted_demand", "totalWeightedDemand"),
    readMetric(optimizedRaw, "relevant_demand_weight", "relevantDemandWeight")
      ?? readMetric(optimizedRaw, "total_weighted_demand", "totalWeightedDemand"),
  );
  const sharedResidentialDenominator = sharedValue(
    readMetric(baselineRaw, "relevant_residential_total", "relevantResidentialTotal")
      ?? readMetric(baselineRaw, "residential_total", "residentialTotal"),
    readMetric(optimizedRaw, "relevant_residential_total", "relevantResidentialTotal")
      ?? readMetric(optimizedRaw, "residential_total", "residentialTotal"),
  );
  const sharedReachMaximum = sharedValue(
    readMetric(baselineRaw, "propagation_reach_maximum", "propagationReachMaximum")
      ?? readMetric(baselineRaw, "coverage_reach_maximum", "coverageReachMaximum"),
    readMetric(optimizedRaw, "propagation_reach_maximum", "propagationReachMaximum")
      ?? readMetric(optimizedRaw, "coverage_reach_maximum", "coverageReachMaximum"),
  );
  const demandAvailable = objectiveStatus.demand?.available !== false;
  const residentialAvailable = objectiveStatus.residential?.available !== false;
  const reachAvailable = objectiveStatus.coverage?.available !== false;
  const overlapAvailable = objectiveStatus.overlap?.available !== false;
  const radioQualityAvailable = objectiveStatus.radio_quality?.available !== false
    && isRadioQualityEvaluated(baselineStats)
    && isRadioQualityEvaluated(optimizedStats);

  const baselineDemand = readMetric(baselineRaw, "served_demand_weight", "servedDemandWeight")
    ?? readMetric(baselineRaw, "served_weighted_demand", "servedWeightedDemand");
  const optimizedDemand = readMetric(optimizedRaw, "served_demand_weight", "servedDemandWeight")
    ?? readMetric(optimizedRaw, "served_weighted_demand", "servedWeightedDemand");
  const baselineResidential = readMetric(baselineRaw, "residential_covered", "residentialCovered");
  const optimizedResidential = readMetric(optimizedRaw, "residential_covered", "residentialCovered");
  const baselineReachScore = readMetric(baselineRaw, "propagation_reach_score", "propagationReachScore")
    ?? readMetric(baselineRaw, "coverage_reach_score", "coverageReachScore");
  const optimizedReachScore = readMetric(optimizedRaw, "propagation_reach_score", "propagationReachScore")
    ?? readMetric(optimizedRaw, "coverage_reach_score", "coverageReachScore");
  const baselineReachRatio = ratio01(baselineReachScore, sharedReachMaximum);
  const optimizedReachRatio = ratio01(optimizedReachScore, sharedReachMaximum);
  const baselineOverlapRatio = readMetric(baselineRaw, "overlap_ratio", "overlapRatio");
  const optimizedOverlapRatio = readMetric(optimizedRaw, "overlap_ratio", "overlapRatio");
  const baselineOverlapBuildings = readMetric(baselineRaw, "overlap_buildings", "overlapBuildings")
    ?? readMetric(baselineStats, "overlap_buildings", "overlapBuildings");
  const optimizedOverlapBuildings = readMetric(optimizedRaw, "overlap_buildings", "overlapBuildings")
    ?? readMetric(optimizedStats, "overlap_buildings", "overlapBuildings");
  const baselineCoveredUnits = readMetric(baselineRaw, "covered_units", "coveredUnits");
  const optimizedCoveredUnits = readMetric(optimizedRaw, "covered_units", "coveredUnits");
  const baselineRadioQuality = readMetric(baselineRaw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
  const optimizedRadioQuality = readMetric(optimizedRaw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
  const sharedRadioQualitySampleCount = sharedValue(
    readMetric(baselineRaw, "radio_quality_total_samples", "radioQualityTotalSamples"),
    readMetric(optimizedRaw, "radio_quality_total_samples", "radioQualityTotalSamples"),
  );
  const baselineScore = readMetric(baselineStats, "score");
  const optimizedScore = readMetric(optimizedStats, "score");
  const configuredConstraints = response.optimization?.constraints ?? config?.constraints ?? {};
  const hasHardConstraints = Object.keys(cleanConstraints(configuredConstraints)).length > 0;
  const baselineSatisfied = baseline.constraints_satisfied !== false;
  const optimizedSatisfied = response.optimization?.constraints_satisfied !== false;

  return {
    kind: "network",
    type: "optimization",
    optimization_domain: response.optimization_domain ?? null,
    radio_quality: response.optimization?.radio_quality ?? null,
    baseline_solution: {
      ...baseline,
      stats: baselineStats,
      constraints_satisfied: baselineSatisfied,
    },
    optimized_solution_id: optimizedSolutionID,
    optimized_solution: {
      id: optimizedSolutionID,
      cell_configurations: optimizedConfigurations,
      stats: optimizedStats,
      constraints_satisfied: optimizedSatisfied,
      violations: response.optimization?.violations ?? [],
    },
    effective_weights: normalizePriorityWeights(config, objectiveStatus),
    objective_status: objectiveStatus,
    metrics: {
      demand: comparisonMetric({
        available: demandAvailable,
        baseline: baselineDemand,
        denominator: sharedDemandDenominator,
        key: "demand",
        preferredDirection: "higher",
        optimized: optimizedDemand,
        utilityBaseline: baselineStats.objectives?.demand,
        utilityOptimized: optimizedStats.objectives?.demand,
      }),
      residential: comparisonMetric({
        available: residentialAvailable,
        baseline: baselineResidential,
        denominator: sharedResidentialDenominator,
        key: "residential",
        preferredDirection: "higher",
        optimized: optimizedResidential,
        utilityBaseline: baselineStats.objectives?.residential,
        utilityOptimized: optimizedStats.objectives?.residential,
      }),
      propagation_reach: comparisonMetric({
        available: reachAvailable,
        baseline: baselineReachRatio,
        denominator: sharedReachMaximum,
        key: "propagation_reach",
        preferredDirection: "higher",
        optimized: optimizedReachRatio,
        unit: "ratio",
        utilityBaseline: baselineStats.objectives?.coverage,
        utilityOptimized: optimizedStats.objectives?.coverage,
        extra: {
          baseline_score: baselineReachScore,
          optimized_score: optimizedReachScore,
        },
      }),
      overlap: comparisonMetric({
        available: overlapAvailable,
        baseline: baselineOverlapRatio,
        key: "overlap",
        preferredDirection: "lower",
        optimized: optimizedOverlapRatio,
        unit: "ratio",
        utilityBaseline: baselineStats.objectives?.overlap,
        utilityOptimized: optimizedStats.objectives?.overlap,
      }),
      radio_quality: comparisonMetric({
        available: radioQualityAvailable,
        baseline: baselineRadioQuality,
        key: "radio_quality",
        preferredDirection: "higher",
        optimized: optimizedRadioQuality,
        unit: "ratio",
        denominator: sharedRadioQualitySampleCount,
        utilityBaseline: baselineStats.objectives?.radio_quality,
        utilityOptimized: optimizedStats.objectives?.radio_quality,
      }),
      overlap_buildings: comparisonMetric({
        available: overlapAvailable,
        baseline: baselineOverlapBuildings,
        key: "overlap_buildings",
        preferredDirection: "lower",
        optimized: optimizedOverlapBuildings,
      }),
      covered_units: comparisonMetric({
        baseline: baselineCoveredUnits,
        key: "covered_units",
        preferredDirection: "informational",
        optimized: optimizedCoveredUnits,
      }),
      score: comparisonMetric({
        baseline: baselineScore,
        key: "score",
        preferredDirection: "higher",
        optimized: optimizedScore,
      }),
      constraints: comparisonConstraintMetric(baselineSatisfied, optimizedSatisfied, hasHardConstraints),
    },
  };
}

// The run key is deliberately independent of objective priorities. Raw RF
// sides can therefore survive a slider-only update while RF-affecting edits
// produce a new identity.
export function getOptimizationRunKey(response) {
  const provided = response?.optimization_run_id ?? response?.optimizationRunId;
  if (provided !== null && provided !== undefined && String(provided).trim() !== "") {
    return String(provided);
  }
  const baseline = response?.baseline;
  if (!baseline) return null;
  return `legacy-network-opt-${stableSerialize({
    baseline: {
      cell_configurations: baseline.cell_configurations ?? baseline.cellConfigurations ?? [],
      parameters: baseline.parameters ?? {},
      raw_metrics: baseline.stats?.raw_metrics ?? baseline.stats?.rawMetrics ?? {},
    },
    constraints: response?.optimization?.constraints ?? {},
    optimization_domain: response?.optimization_domain ?? response?.optimizationDomain ?? {},
  })}`;
}

export function buildCellExplanationCacheKey(response, solutionID, cellID) {
  const runKey = getOptimizationRunKey(response);
  const normalizedSolutionID = solutionID === null || solutionID === undefined ? "" : String(solutionID).trim();
  const normalizedCellID = cellID === null || cellID === undefined ? "" : String(cellID).trim();
  if (!runKey || !normalizedSolutionID || !normalizedCellID) return null;
  return `${runKey}::${normalizedSolutionID}::${normalizedCellID}`;
}

export function buildParetoCellConfigurations(baseline, solution) {
  const baselineConfigurations = Array.isArray(baseline?.cell_configurations)
    ? baseline.cell_configurations
    : [];
  const solutionTowers = Array.isArray(solution?.towers) ? solution.towers : [];
  const selectedByID = new Map(solutionTowers.map((tower) => [String(tower.id), tower]));
  const seen = new Set();
  const configurations = baselineConfigurations.map((configuration) => {
    const id = String(configuration.id);
    const selected = selectedByID.get(id);
    seen.add(id);
    const baselineAzimuth = normalizedDegrees(configuration.azimuth_deg);
    const selectedAzimuth = normalizedDegrees(selected?.azimuth_deg);
    return {
      id: configuration.id ?? id,
      available: Boolean(selected && baselineAzimuth !== null && selectedAzimuth !== null),
      baseline_azimuth_deg: baselineAzimuth,
      selected_azimuth_deg: selectedAzimuth,
      changed: baselineAzimuth !== null && selectedAzimuth !== null
        ? Math.abs(baselineAzimuth - selectedAzimuth) > 0.000001
        : false,
    };
  });
  for (const tower of solutionTowers) {
    const id = String(tower.id);
    if (seen.has(id)) continue;
    configurations.push({
      id: tower.id ?? id,
      available: false,
      baseline_azimuth_deg: null,
      selected_azimuth_deg: normalizedDegrees(tower.azimuth_deg),
      changed: false,
    });
  }
  return configurations;
}

// Converts the backend's raw actual/counterfactual sides into the small model
// rendered beside the selected Pareto solution. Score is recomputed locally so
// priority-only changes never trigger another RF request.
export function buildCellMarginalEffectView(explanation, config) {
  if (!explanation || explanation.available === false) return null;
  const actualRaw = explanation.actual?.raw_metrics ?? explanation.actual?.rawMetrics ?? {};
  const counterfactualRaw = explanation.counterfactual?.raw_metrics
    ?? explanation.counterfactual?.rawMetrics
    ?? {};
  const objectiveStatus = explanation.objective_status ?? explanation.objectiveStatus ?? {};
  const actualStats = scoreOptimizationStats({ raw_metrics: actualRaw, objective_status: objectiveStatus }, config);
  const counterfactualStats = scoreOptimizationStats({ raw_metrics: counterfactualRaw, objective_status: objectiveStatus }, config);
  const actualDemand = readMetric(actualRaw, "served_demand_weight", "servedDemandWeight")
    ?? readMetric(actualRaw, "served_weighted_demand", "servedWeightedDemand");
  const counterfactualDemand = readMetric(counterfactualRaw, "served_demand_weight", "servedDemandWeight")
    ?? readMetric(counterfactualRaw, "served_weighted_demand", "servedWeightedDemand");
  const demandDenominator = sharedValue(
    readMetric(actualRaw, "relevant_demand_weight", "relevantDemandWeight")
      ?? readMetric(actualRaw, "total_weighted_demand", "totalWeightedDemand"),
    readMetric(counterfactualRaw, "relevant_demand_weight", "relevantDemandWeight")
      ?? readMetric(counterfactualRaw, "total_weighted_demand", "totalWeightedDemand"),
  );
  const actualResidential = readMetric(actualRaw, "residential_covered", "residentialCovered");
  const counterfactualResidential = readMetric(counterfactualRaw, "residential_covered", "residentialCovered");
  const residentialDenominator = sharedValue(
    readMetric(actualRaw, "relevant_residential_total", "relevantResidentialTotal")
      ?? readMetric(actualRaw, "residential_total", "residentialTotal"),
    readMetric(counterfactualRaw, "relevant_residential_total", "relevantResidentialTotal")
      ?? readMetric(counterfactualRaw, "residential_total", "residentialTotal"),
  );
  const actualReachScore = readMetric(actualRaw, "propagation_reach_score", "propagationReachScore")
    ?? readMetric(actualRaw, "coverage_reach_score", "coverageReachScore");
  const counterfactualReachScore = readMetric(counterfactualRaw, "propagation_reach_score", "propagationReachScore")
    ?? readMetric(counterfactualRaw, "coverage_reach_score", "coverageReachScore");
  const reachDenominator = sharedValue(
    readMetric(actualRaw, "propagation_reach_maximum", "propagationReachMaximum")
      ?? readMetric(actualRaw, "coverage_reach_maximum", "coverageReachMaximum"),
    readMetric(counterfactualRaw, "propagation_reach_maximum", "propagationReachMaximum")
      ?? readMetric(counterfactualRaw, "coverage_reach_maximum", "coverageReachMaximum"),
  );
  const actualOverlapRatio = readMetric(actualRaw, "overlap_ratio", "overlapRatio")
    ?? inverseUtility(actualStats.objectives?.overlap);
  const counterfactualOverlapRatio = readMetric(counterfactualRaw, "overlap_ratio", "overlapRatio")
    ?? inverseUtility(counterfactualStats.objectives?.overlap);
  const actualOverlapBuildings = readMetric(actualRaw, "overlap_buildings", "overlapBuildings")
    ?? readMetric(actualStats, "overlap_buildings", "overlapBuildings");
  const counterfactualOverlapBuildings = readMetric(counterfactualRaw, "overlap_buildings", "overlapBuildings")
    ?? readMetric(counterfactualStats, "overlap_buildings", "overlapBuildings");
  const actualCoveredUnits = readMetric(actualRaw, "covered_units", "coveredUnits");
  const counterfactualCoveredUnits = readMetric(counterfactualRaw, "covered_units", "coveredUnits");
  const actualRadioQuality = readMetric(actualRaw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
  const counterfactualRadioQuality = readMetric(counterfactualRaw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
  const radioQualitySampleCount = sharedValue(
    readMetric(actualRaw, "radio_quality_total_samples", "radioQualityTotalSamples"),
    readMetric(counterfactualRaw, "radio_quality_total_samples", "radioQualityTotalSamples"),
  );

  return {
    available: true,
    unchanged: Boolean(explanation.unchanged),
    run_id: explanation.run_id ?? explanation.runID ?? "",
    solution_id: explanation.solution_id ?? explanation.solutionID ?? "",
    cell: explanation.cell ?? {},
    objective_status: actualStats.objective_status,
    effective_weights: normalizePriorityWeights(config, objectiveStatus),
    actual: actualStats,
    counterfactual: counterfactualStats,
    metrics: {
      demand: cellMarginalMetric({
        actual: actualDemand,
        counterfactual: counterfactualDemand,
        denominator: demandDenominator,
        available: objectiveStatus?.demand?.available !== false && Number(demandDenominator) > 0,
        key: "demand",
        preferredDirection: "higher",
        utilityActual: actualStats.objectives?.demand,
        utilityCounterfactual: counterfactualStats.objectives?.demand,
        unit: "weight",
      }),
      residential: cellMarginalMetric({
        actual: actualResidential,
        counterfactual: counterfactualResidential,
        denominator: residentialDenominator,
        available: objectiveStatus?.residential?.available !== false && Number(residentialDenominator) > 0,
        key: "residential",
        preferredDirection: "higher",
        utilityActual: actualStats.objectives?.residential,
        utilityCounterfactual: counterfactualStats.objectives?.residential,
        unit: "count",
      }),
      propagation_reach: cellMarginalMetric({
        actual: actualStats.objectives?.coverage ?? ratio01(actualReachScore, reachDenominator),
        counterfactual: counterfactualStats.objectives?.coverage ?? ratio01(counterfactualReachScore, reachDenominator),
        denominator: reachDenominator,
        available: objectiveStatus?.coverage?.available !== false && Number(reachDenominator) > 0,
        extra: { actual_score: actualReachScore, counterfactual_score: counterfactualReachScore },
        key: "propagation_reach",
        preferredDirection: "higher",
        utilityActual: actualStats.objectives?.coverage,
        utilityCounterfactual: counterfactualStats.objectives?.coverage,
        unit: "ratio",
      }),
      overlap: cellMarginalMetric({
        actual: actualOverlapRatio,
        counterfactual: counterfactualOverlapRatio,
        available: objectiveStatus?.overlap?.available !== false,
        key: "overlap",
        preferredDirection: "lower",
        utilityActual: actualStats.objectives?.overlap,
        utilityCounterfactual: counterfactualStats.objectives?.overlap,
        unit: "ratio",
      }),
      overlap_buildings: cellMarginalMetric({
        actual: actualOverlapBuildings,
        counterfactual: counterfactualOverlapBuildings,
        key: "overlap_buildings",
        preferredDirection: "lower",
        unit: "count",
      }),
      covered_units: cellMarginalMetric({
        actual: actualCoveredUnits,
        counterfactual: counterfactualCoveredUnits,
        key: "covered_units",
        preferredDirection: "informational",
        unit: "count",
      }),
      radio_quality: cellMarginalMetric({
        actual: actualRadioQuality,
        counterfactual: counterfactualRadioQuality,
        denominator: radioQualitySampleCount,
        available: objectiveStatus?.radio_quality?.available !== false
          && actualRadioQuality !== undefined
          && counterfactualRadioQuality !== undefined,
        key: "radio_quality",
        preferredDirection: "higher",
        utilityActual: actualStats.objectives?.radio_quality,
        utilityCounterfactual: counterfactualStats.objectives?.radio_quality,
        unit: "ratio",
      }),
      score: cellMarginalMetric({
        actual: actualStats.score,
        counterfactual: counterfactualStats.score,
        key: "score",
        preferredDirection: "higher",
        unit: "score",
      }),
      constraints: cellMarginalConstraintMetric(
        explanation.actual?.constraints_satisfied !== false,
        explanation.counterfactual?.constraints_satisfied !== false,
        explanation.actual?.violations,
        explanation.counterfactual?.violations,
      ),
    },
    limitations: Array.isArray(explanation.limitations) && explanation.limitations.length > 0
      ? explanation.limitations
      : [
        "Conditional marginal comparison: only this cell is restored to baseline; the rest of the selected solution stays unchanged.",
        "This is not causal attribution or an additive cell contribution; cell interactions remain.",
      ],
  };
}

function cellMarginalMetric({
  actual,
  available: availableFlag = true,
  counterfactual,
  denominator = null,
  extra = {},
  key,
  preferredDirection,
  unit = "number",
  utilityActual,
  utilityCounterfactual,
}) {
  const normalizedActual = finiteOrNull(actual);
  const normalizedCounterfactual = finiteOrNull(counterfactual);
  const available = availableFlag && normalizedActual !== null && normalizedCounterfactual !== null;
  const delta = available ? normalizedActual - normalizedCounterfactual : null;
  return {
    metric: key,
    available,
    actual: normalizedActual,
    counterfactual: normalizedCounterfactual,
    denominator: finiteOrNull(denominator),
    preferred_direction: preferredDirection,
    unit,
    absolute_delta: delta,
    outcome: available ? comparisonOutcome(delta, preferredDirection) : "informational",
    utility_actual: finiteOrNull(utilityActual),
    utility_counterfactual: finiteOrNull(utilityCounterfactual),
    utility_delta: safeDelta(utilityActual, utilityCounterfactual),
    ...extra,
  };
}

function cellMarginalConstraintMetric(actual, counterfactual, actualViolations = [], counterfactualViolations = []) {
  let outcome = "unchanged";
  if (actual !== counterfactual) outcome = actual ? "improved" : "worsened";
  return {
    metric: "constraints",
    available: true,
    actual,
    counterfactual,
    preferred_direction: "feasible",
    outcome,
    actual_violations: Array.isArray(actualViolations) ? actualViolations : [],
    counterfactual_violations: Array.isArray(counterfactualViolations) ? counterfactualViolations : [],
  };
}

function ensureObjectiveStatus(stats, response) {
  const existing = stats?.objective_status ?? stats?.objectiveStatus ?? {};
  const objectiveStatus = ensureRadioQualityRerankStatus(objectiveStatusFromResponse(response), response);
  if (Object.keys(objectiveStatus).length === 0) return stats;
  return { ...stats, objective_status: { ...objectiveStatus, ...existing } };
}

// Radio-quality raw metrics are candidate data, not a presentation fallback.
// A priority-only rerank may use them when present, but it must surface an
// unevaluated state when the saved run predates the opt-in objective.
export function ensureRadioQualityRerankStatus(status = {}, source = {}) {
  const raw = source?.raw_metrics ?? source?.rawMetrics ?? source?.stats?.raw_metrics ?? source?.stats?.rawMetrics ?? {};
  const total = readMetric(raw, "radio_quality_total_samples", "radioQualityTotalSamples");
  const existing = status?.radio_quality;
  if (existing?.available === false && existing.reason && existing.reason !== "disabled" && existing.reason !== "not_evaluated") {
    return status;
  }
  if (Number.isFinite(total) && total > 0) {
    return { ...status, radio_quality: { ...(existing ?? {}), available: true, reason: "" } };
  }
  return {
    ...status,
    radio_quality: {
      ...(existing ?? {}),
      available: false,
      reason: existing?.reason === "disabled" ? "not_evaluated" : (existing?.reason ?? "not_evaluated"),
    },
  };
}

export function isRadioQualityEvaluated(stats = {}) {
  const raw = stats?.raw_metrics ?? stats?.rawMetrics ?? {};
  const total = readMetric(raw, "radio_quality_total_samples", "radioQualityTotalSamples");
  return Number.isFinite(total) && total > 0;
}

function objectiveStatusFromResponse(response) {
  const frontier = Array.isArray(response?.pareto_frontier) ? response.pareto_frontier : [];
  const candidates = [
    response?.stats?.objective_status,
    response?.stats?.objectiveStatus,
    response?.optimization?.objective_status,
    ...frontier.map((solution) => solution?.stats?.objective_status),
  ];
  return candidates
    .filter((status) => status && Object.keys(status).length > 0)
    .reduce((merged, status) => ({ ...merged, ...status }), {});
}

function mergeObjectiveStatuses(...statusMaps) {
  const merged = {};
  for (const statusMap of statusMaps) {
    for (const [id, status] of Object.entries(statusMap ?? {})) {
      if (!status || typeof status !== "object") continue;
      if (status.available === false) {
        merged[id] = { ...merged[id], ...status, available: false };
      } else if (!merged[id]) {
        merged[id] = { ...status };
      }
    }
  }
  return merged;
}

function buildOptimizedConfigurations(baselineConfigurations = [], optimizedTowers = [], solution) {
  const baselineByID = new Map((baselineConfigurations ?? []).map((configuration) => [String(configuration.id), configuration]));
  const optimizedByID = new Map((optimizedTowers ?? []).map((tower) => [String(tower.id), tower]));
  const solutionByID = new Map((solution?.towers ?? []).map((tower) => [String(tower.id), tower]));
  const solutionTowers = solution?.towers?.length > 0 ? solution.towers : optimizedTowers ?? [];
  const towers = solutionTowers.map((tower) => {
    const id = String(tower.id);
    const baseline = baselineByID.get(id) ?? {};
    const optimized = optimizedByID.get(id) ?? {};
    return {
      ...baseline,
      id: tower.id,
      azimuth_deg: Number(tower.azimuth_deg ?? optimized.optimal_azimuth),
      rf_profile: tower.rf_profile ?? optimized.rf_profile ?? baseline.rf_profile,
    };
  });
  if (towers.length > 0) return towers;
  return (baselineConfigurations ?? []).map((configuration) => ({
    ...configuration,
    azimuth_deg: Number(solutionByID.get(String(configuration.id))?.azimuth_deg ?? configuration.azimuth_deg),
  }));
}

function comparisonMetric({
  available = true,
  baseline,
  denominator = null,
  extra = {},
  key,
  optimized,
  preferredDirection,
  unit = "number",
  utilityBaseline,
  utilityOptimized,
}) {
  const base = {
    metric: key,
    available,
    baseline: available ? finiteOrNull(baseline) : null,
    optimized: available ? finiteOrNull(optimized) : null,
    denominator: available ? finiteOrNull(denominator) : null,
    preferred_direction: preferredDirection,
    unit,
    ...extra,
  };
  if (!available) {
    return {
      ...base,
      absolute_delta: null,
      relative_delta: null,
      outcome: "informational",
      utility: null,
    };
  }
  const delta = safeDelta(base.optimized, base.baseline);
  return {
    ...base,
    absolute_delta: delta,
    relative_delta: safeRelativeDelta(delta, base.baseline),
    outcome: comparisonOutcome(delta, preferredDirection),
    utility: comparisonMetricUtility(utilityBaseline, utilityOptimized, preferredDirection),
  };
}

function comparisonMetricUtility(baseline, optimized, preferredDirection) {
  if (!Number.isFinite(Number(baseline)) || !Number.isFinite(Number(optimized))) return null;
  const delta = safeDelta(optimized, baseline);
  return {
    baseline: finiteOrNull(baseline),
    optimized: finiteOrNull(optimized),
    absolute_delta: delta,
    relative_delta: safeRelativeDelta(delta, baseline),
    preferred_direction: preferredDirection === "lower" ? "higher" : preferredDirection,
    outcome: comparisonOutcome(delta, preferredDirection === "lower" ? "higher" : preferredDirection),
  };
}

function objectiveAvailable(status, id, selectedStats, recommendedStats) {
  return status?.[id]?.available !== false
    && Number.isFinite(Number(selectedStats.objectives?.[id]))
    && Number.isFinite(Number(recommendedStats.objectives?.[id]));
}

function inverseUtility(value) {
  if (!Number.isFinite(Number(value))) return undefined;
  return clamp01(1 - Number(value));
}

function solutionComparisonMetric({
  available = true,
  denominator = null,
  includeUtility = true,
  key,
  preferredDirection,
  recommended,
  selected,
  unit = "number",
  utilityRecommended,
  utilitySelected,
}) {
  const base = {
    metric: key,
    available,
    selected: available ? finiteOrNull(selected) : null,
    recommended: available ? finiteOrNull(recommended) : null,
    denominator: available ? finiteOrNull(denominator) : null,
    preferred_direction: preferredDirection,
    unit,
  };
  if (!available) {
    return {
      ...base,
      absolute_delta: null,
      relative_delta: null,
      outcome: "informational",
      utility: null,
    };
  }
  const delta = safeDelta(base.selected, base.recommended);
  const utility = includeUtility
    ? solutionComparisonUtility(
      utilitySelected ?? base.selected,
      utilityRecommended ?? base.recommended,
      preferredDirection === "lower" ? "higher" : preferredDirection,
    )
    : null;
  return {
    ...base,
    absolute_delta: delta,
    relative_delta: safeRelativeDelta(delta, base.recommended),
    outcome: comparisonOutcome(delta, preferredDirection),
    utility,
  };
}

function solutionComparisonUtility(selected, recommended, preferredDirection) {
  if (!Number.isFinite(Number(selected)) || !Number.isFinite(Number(recommended))) return null;
  const delta = safeDelta(Number(selected), Number(recommended));
  return {
    selected: finiteOrNull(selected),
    recommended: finiteOrNull(recommended),
    absolute_delta: delta,
    relative_delta: safeRelativeDelta(delta, recommended),
    preferred_direction: preferredDirection,
    outcome: comparisonOutcome(delta, preferredDirection),
  };
}

function solutionComparisonConstraintMetric(selected, recommended, configured = true) {
  if (!configured) {
    return {
      metric: "constraints",
      available: true,
      configured: false,
      selected: null,
      recommended: null,
      absolute_delta: null,
      relative_delta: null,
      preferred_direction: "informational",
      outcome: "informational",
    };
  }
  let outcome = "unchanged";
  if (selected !== recommended) outcome = selected ? "improved" : "worsened";
  return {
    metric: "constraints",
    available: true,
    configured: true,
    selected,
    recommended,
    absolute_delta: null,
    relative_delta: null,
    preferred_direction: "feasible",
    outcome,
  };
}

function comparisonConstraintMetric(baseline, optimized, configured = true) {
  if (!configured) {
    return {
      metric: "constraints",
      available: true,
      configured: false,
      baseline: null,
      optimized: null,
      absolute_delta: null,
      relative_delta: null,
      preferred_direction: "informational",
      outcome: "informational",
    };
  }
  let outcome = "unchanged";
  if (baseline !== optimized) outcome = optimized ? "improved" : "worsened";
  return {
    metric: "constraints",
    available: true,
    configured: true,
    baseline,
    optimized,
    absolute_delta: null,
    relative_delta: null,
    preferred_direction: "feasible",
    outcome,
  };
}

function comparisonOutcome(delta, preferredDirection) {
  if (preferredDirection === "informational") return "informational";
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.000001) return "unchanged";
  if (preferredDirection === "lower") return delta < 0 ? "improved" : "worsened";
  return delta > 0 ? "improved" : "worsened";
}

function safeDelta(optimized, baseline) {
  if (!Number.isFinite(optimized) || !Number.isFinite(baseline)) return null;
  return optimized - baseline;
}

function safeRelativeDelta(delta, baseline) {
  if (!Number.isFinite(delta) || !Number.isFinite(baseline) || baseline === 0) return null;
  return delta / baseline;
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sharedValue(left, right) {
  if (Number.isFinite(left)) return left;
  return Number.isFinite(right) ? right : null;
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
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return clamp01(numerator / denominator);
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

function paretoSolutionKey(solution) {
  return (solution?.towers ?? [])
    .map((tower) => `${tower.id}:${Number(tower.azimuth_deg ?? 0).toFixed(1)}`)
    .sort((left, right) => left.localeCompare(right))
    .join(",");
}

function normalizedDegrees(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = numeric % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function withObjectiveStatus(stats, objectiveStatus) {
  if (!objectiveStatus || Object.keys(objectiveStatus).length === 0) return stats;
  const existing = stats.objective_status ?? stats.objectiveStatus ?? {};
  const merged = { ...objectiveStatus, ...existing };
  return { ...stats, objective_status: merged };
}
