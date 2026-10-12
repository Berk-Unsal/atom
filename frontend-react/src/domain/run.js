import { cloneDomainValue, createEntityId, deepFreeze } from "./identifiers.js";

export const RUN_TYPES = Object.freeze([
  "simulation",
  "optimization",
  "validation",
  "batch_experiment",
  "diagnostic",
  "reference_evaluation",
]);

export const RUN_STATUSES = Object.freeze(["queued", "running", "succeeded", "failed", "cancelled"]);

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export function createRun(input = {}) {
  const createdAt = input.created_at ?? input.createdAt ?? new Date().toISOString();
  const runType = input.run_type ?? input.runType ?? "simulation";
  const status = input.status ?? "queued";
  if (!RUN_TYPES.includes(runType)) throw new Error(`Unsupported run type: ${runType}`);
  if (!RUN_STATUSES.includes(status)) throw new Error(`Unsupported run status: ${status}`);
  return {
    run_id: input.run_id ?? input.runId ?? createEntityId(),
    run_type: runType,
    project_id: input.project_id ?? input.projectId ?? null,
    scenario_id: input.scenario_id ?? input.scenarioId ?? null,
    scenario_revision_id: input.scenario_revision_id ?? input.scenarioRevisionId ?? null,
    scenario_fingerprint: input.scenario_fingerprint ?? input.scenarioFingerprint ?? null,
    input_fingerprint: input.input_fingerprint ?? input.inputFingerprint ?? null,
    dataset_references: cloneDomainValue(input.dataset_references ?? input.datasetReferences ?? []),
    engine: cloneDomainValue(input.engine ?? { name: "A.T.O.M", version: null, commit: null }),
    rf_contract: cloneDomainValue(input.rf_contract ?? input.rfContract ?? null),
    optimizer_contract: cloneDomainValue(input.optimizer_contract ?? input.optimizerContract ?? null),
    canonical_input_snapshot: cloneDomainValue(input.canonical_input_snapshot ?? input.canonicalInputSnapshot ?? null),
    status,
    created_at: createdAt,
    started_at: input.started_at ?? input.startedAt ?? null,
    completed_at: input.completed_at ?? input.completedAt ?? null,
    warnings: cloneDomainValue(input.warnings ?? []),
    error: cloneDomainValue(input.error ?? null),
    summary: cloneDomainValue(input.summary ?? {}),
    artifact_references: cloneDomainValue(input.artifact_references ?? input.artifactReferences ?? []),
    details: cloneDomainValue(input.details ?? null),
    metadata: cloneDomainValue(input.metadata ?? {}),
  };
}

export function transitionRun(run, status, changes = {}) {
  if (!RUN_STATUSES.includes(status)) throw new Error(`Unsupported run status: ${status}`);
  const current = run?.status ?? "queued";
  if (TERMINAL_STATUSES.has(current) && status !== current) throw new Error(`Terminal run cannot transition from ${current}`);
  if (current === "queued" && !["running", "cancelled", "failed"].includes(status)) throw new Error(`Invalid run transition ${current} -> ${status}`);
  if (current === "running" && !TERMINAL_STATUSES.has(status)) throw new Error(`Invalid run transition ${current} -> ${status}`);
  const now = new Date().toISOString();
  return createRun({
    ...cloneDomainValue(run),
    ...cloneDomainValue(changes),
    run_id: run.run_id,
    run_type: run.run_type,
    status,
    started_at: changes.started_at ?? changes.startedAt ?? (status === "running" ? now : run.started_at),
    completed_at: changes.completed_at ?? changes.completedAt ?? (TERMINAL_STATUSES.has(status) ? now : run.completed_at),
  });
}

export function createOptimizationSolution(input = {}) {
  const source = input.solution ?? input;
  return deepFreeze({
    optimization_solution_id: input.optimization_solution_id ?? input.optimizationSolutionId ?? createEntityId(),
    run_id: input.run_id ?? input.runId ?? null,
    optimizer_solution_id: String(input.optimizer_solution_id ?? input.optimizerSolutionId ?? source.id ?? ""),
    id: String(source.id ?? input.optimizer_solution_id ?? input.optimizerSolutionId ?? ""),
    cell_configurations: compactCellConfigurations(source.cell_configurations ?? source.cellConfigurations ?? source.towers ?? []),
    objectives: compactValue(source.objectives ?? source.stats?.objectives ?? {}),
    stats: compactValue(source.stats ?? {}),
    score: source.score ?? source.stats?.score ?? null,
    constraints_satisfied: source.constraints_satisfied !== false,
    violations: compactValue(source.violations ?? []),
    explanation_summary: compactValue(source.explanation_summary ?? source.explanationSummary ?? null),
    metadata: compactValue(input.metadata ?? {}),
  });
}

export function createOptimizationRunDetails(input = {}) {
  const response = input.response ?? {};
  const publicSource = Array.isArray(input.public_solutions)
    ? input.public_solutions
    : (response.pareto_frontier ?? response.paretoFrontier ?? []);
  const publicSolutions = publicSource.map((solution) => createOptimizationSolution({
    solution,
    run_id: input.run_id ?? input.runId,
  }));
  const optimization = response.optimization ?? {};
  const baseline = input.baseline_solution ?? response.baseline ?? null;
  return {
    kind: "optimization",
    baseline_solution: baseline ? createOptimizationSolution({ solution: baseline, run_id: input.run_id ?? input.runId, optimizer_solution_id: "baseline" }) : null,
    public_pareto_solutions: publicSolutions,
    recommended_solution_id: input.recommended_solution_id ?? input.recommendedSolutionId ?? optimization.recommended_solution_id ?? publicSolutions[0]?.id ?? null,
    selected_solution_id: input.selected_solution_id ?? input.selectedSolutionId ?? null,
    effective_priorities: compactValue(input.effective_priorities ?? input.effectivePriorities ?? optimization.priority_vector ?? optimization.priorities ?? {}),
    objective_availability: compactValue(input.objective_availability ?? input.objectiveAvailability ?? optimization.objective_status ?? response.objective_status ?? {}),
    constraints: compactValue(input.constraints ?? optimization.constraints ?? {}),
    search_policy: compactValue(input.search_policy ?? input.searchPolicy ?? optimization.search ?? null),
    budgets: compactValue(input.budgets ?? optimization.budgets ?? null),
    evaluated_count: input.evaluated_count ?? input.evaluatedCount ?? optimization.evaluated_count ?? optimization.evaluations ?? null,
    cache_summary: compactValue(input.cache_summary ?? input.cacheSummary ?? optimization.cache ?? null),
    optimizer_identity: compactValue(input.optimizer_identity ?? input.optimizerIdentity ?? optimization.algorithm ?? response.optimizer ?? null),
    rf_contract: compactValue(input.rf_contract ?? input.rfContract ?? response.rf_contract ?? null),
    optimization_run_id: input.optimization_run_id ?? input.optimizationRunId ?? response.optimization_run_id ?? response.optimizationRunId ?? null,
  };
}

export function createSimulationRun(input = {}) {
  return createRun({
    ...input,
    run_type: "simulation",
    details: input.details ?? { result_summary: compactSimulationResult(input.result) },
  });
}

export function createOptimizationRun(input = {}) {
  return createRun({
    ...input,
    run_type: "optimization",
    details: input.details ?? createOptimizationRunDetails(input),
  });
}

export function validateRun(run) {
  const errors = [];
  if (!run || typeof run !== "object") return ["run is required"];
  if (!String(run.run_id ?? "").trim()) errors.push("run_id is required");
  if (!RUN_TYPES.includes(run.run_type)) errors.push("run_type is invalid");
  if (!RUN_STATUSES.includes(run.status)) errors.push("status is invalid");
  if (run.status === "failed" && !run.error && !(run.warnings ?? []).length) errors.push("failed runs should carry error or warning provenance");
  return errors;
}

function compactSimulationResult(result) {
  if (!result || typeof result !== "object") return result ?? null;
  const simulation = result.simulation ?? result;
  const coverageGaps = result.coverage_gaps ?? result.coverageGaps;
  return {
    ...(simulation.stats ? { stats: compactValue(simulation.stats) } : {}),
    ...(coverageGaps?.stats ? { coverage_gaps: { stats: compactValue(coverageGaps.stats) } } : {}),
    ...(simulation.model ? { model: compactValue(simulation.model) } : {}),
    ...(result.summary ? { summary: compactValue(result.summary) } : {}),
    ...(result.scenario_fingerprint || result.input_fingerprint ? {
      scenario_fingerprint: result.scenario_fingerprint ?? null,
      input_fingerprint: result.input_fingerprint ?? null,
    } : {}),
  };
}

function compactCellConfigurations(configurations) {
  if (!Array.isArray(configurations)) return [];
  return configurations.map((configuration) => {
    if (!configuration || typeof configuration !== "object") return configuration;
    const allowedKeys = [
      "id", "cell_id", "cellId", "tower_lon", "tower_lat", "azimuth_deg", "optimal_azimuth", "azimuth",
      "rf_profile", "rfProfile", "available", "changed", "height_m", "beam_width", "beam_width_deg",
    ];
    return Object.fromEntries(
      allowedKeys
        .filter((key) => configuration[key] !== undefined)
        .map((key) => [key, compactValue(configuration[key])]),
    );
  });
}

function compactValue(value, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => compactValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["geojson", "full_rays", "samples", "ray_paths", "terrain_grid", "surface_grid", "evaluation_ledger", "private_evaluations", "archive"].includes(key.toLowerCase()))
      .slice(0, 500)
      .map(([key, child]) => [key, compactValue(child, depth + 1)]),
  );
}
