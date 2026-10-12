import { createOptimizationRun, createOptimizationRunDetails, createSimulationRun, transitionRun } from "./run.js";
import { cloneDomainValue } from "./identifiers.js";

export function captureSimulationRun({ context = {}, request, result, warnings = [], error = null, status = null } = {}) {
  const queued = createSimulationRun({
    ...context,
    status: "queued",
    canonical_input_snapshot: context.canonical_input_snapshot ?? cloneDomainValue(request ?? null),
    warnings,
  });
  const running = transitionRun(queued, "running");
  if (error) {
    return transitionRun(running, error?.code === "run_cancelled" ? "cancelled" : "failed", {
      error: normalizeRunError(error),
      warnings,
    });
  }
  if (status === "cancelled") {
    return transitionRun(running, "cancelled", { warnings });
  }
  return transitionRun(running, "succeeded", {
    summary: compactSimulationSummary(result),
    details: { result_summary: compactSimulationSummary(result) },
    warnings,
  });
}

export function captureOptimizationRun({ context = {}, request, response, warnings = [], error = null, status = null, details = null } = {}) {
  const queued = createOptimizationRun({
    ...context,
    status: "queued",
    canonical_input_snapshot: context.canonical_input_snapshot ?? cloneDomainValue(request ?? null),
    warnings,
  });
  const running = transitionRun(queued, "running");
  if (error) {
    return transitionRun(running, error?.code === "run_cancelled" ? "cancelled" : "failed", {
      error: normalizeRunError(error),
      warnings,
    });
  }
  if (status === "cancelled") {
    return transitionRun(running, "cancelled", { warnings });
  }
  const completed = createOptimizationRun({
    ...running,
    response,
    details: details ?? createOptimizationRunDetails({ response, run_id: running.run_id }),
    status: "running",
    summary: compactOptimizationSummary(response),
    warnings,
  });
  return transitionRun(completed, "succeeded", {
    details: completed.details,
    summary: completed.summary,
    warnings,
  });
}

export function buildRunExecutionContext({
  appMeta = null,
  datasetRef = null,
  optimizerContract = null,
  project = null,
  request = null,
  rfContract = null,
  scenario = null,
  runType = "simulation",
  source = "draft",
} = {}) {
  const sourceRevisionID = scenario?.domain?.current_revision_id ?? scenario?.domain?.scenario_revision_id ?? null;
  const projectID = project?.domain?.project_id ?? project?.id ?? null;
  const scenarioID = scenario?.domain?.scenario_id ?? scenario?.id ?? null;
  const datasetReferences = [datasetRef, project?.datasetRef, appMeta?.dataset]
    .filter(Boolean)
    .map(normalizeDatasetReference)
    .filter(Boolean)
    .filter((reference, index, references) => references.findIndex((candidate) => (
      candidate.dataset_id === reference.dataset_id && candidate.version === reference.version
    )) === index);
  const requestSnapshot = cloneDomainValue(request ?? null);
  const canonicalInputSnapshot = {
    schema_version: 1,
    request_schema: runType === "optimization" ? "atom.optimization.request.v1" : "atom.rf.request.v1",
    request: requestSnapshot,
    source_scenario_revision_id: sourceRevisionID,
    source_kind: sourceRevisionID ? "scenario_revision" : source,
    draft_execution: !sourceRevisionID,
    draft_differs_from_source: !sourceRevisionID || source === "draft",
    inventory_revision_id: scenario?.domain?.inventory_revision_id
      ?? project?.domain?.inventory_revision_id
      ?? null,
    dataset_references: datasetReferences,
    receiver_assumptions: cloneDomainValue(rfContract?.receiver ?? rfContract?.receiver_assumptions ?? null),
    interference: cloneDomainValue(rfContract?.interference ?? null),
    optimization: cloneDomainValue(optimizerContract),
    applied_defaults: cloneDomainValue(rfContract?.applied_defaults ?? null),
  };
  return {
    run_type: runType,
    project_id: projectID,
    scenario_id: scenarioID,
    scenario_revision_id: sourceRevisionID,
    scenario_fingerprint: scenario?.request?.scenario_fingerprint
      ?? scenario?.domain?.scenario_fingerprint
      ?? null,
    input_fingerprint: scenario?.request?.input_fingerprint ?? null,
    dataset_references: datasetReferences,
    engine: {
      name: "A.T.O.M",
      version: appMeta?.model_version ?? appMeta?.version ?? null,
      commit: appMeta?.git_commit ?? appMeta?.commit ?? null,
    },
    rf_contract: cloneDomainValue(rfContract),
    optimizer_contract: cloneDomainValue(optimizerContract),
    canonical_input_snapshot: canonicalInputSnapshot,
    metadata: {
      source_kind: sourceRevisionID ? "scenario_revision" : source,
      exact_request_retained: true,
    },
  };
}

export function identitiesFromResult(result) {
  const model = result?.model ?? result?.simulation?.model ?? {};
  const optimization = result?.optimization ?? {};
  return {
    ...(model.scenario_fingerprint || result?.scenario_fingerprint ? { scenario_fingerprint: model.scenario_fingerprint ?? result.scenario_fingerprint } : {}),
    ...(model.input_fingerprint || result?.input_fingerprint ? { input_fingerprint: model.input_fingerprint ?? result.input_fingerprint } : {}),
    ...(result?.optimization_run_id || result?.optimizationRunId ? { optimization_run_id: result.optimization_run_id ?? result.optimizationRunId } : {}),
    ...(optimization.scenario_fingerprint ? { scenario_fingerprint: optimization.scenario_fingerprint } : {}),
  };
}

export function compactSimulationSummary(result) {
  if (!result || typeof result !== "object") return {};
  const simulation = result.simulation ?? result;
  const gaps = result.coverage_gaps ?? result.coverageGaps;
  return {
    ...(simulation.stats ? { simulation: cloneDomainValue(simulation.stats) } : {}),
    ...(gaps?.stats ? { coverage_gaps: cloneDomainValue(gaps.stats) } : {}),
    ...(simulation.model?.scenario_fingerprint ? { scenario_fingerprint: simulation.model.scenario_fingerprint } : {}),
    ...(result.summary ? { summary: cloneDomainValue(result.summary) } : {}),
  };
}

export function compactOptimizationSummary(response) {
  if (!response || typeof response !== "object") return {};
  return {
    ...(response.stats ? { stats: cloneDomainValue(response.stats) } : {}),
    ...(response.optimization ? { optimization: cloneDomainValue(response.optimization) } : {}),
    ...(response.optimization_run_id ? { optimization_run_id: response.optimization_run_id } : {}),
    ...(response.scenario_fingerprint ? { scenario_fingerprint: response.scenario_fingerprint } : {}),
    pareto_solution_count: Array.isArray(response.pareto_frontier) ? response.pareto_frontier.length : 0,
  };
}

function normalizeDatasetReference(reference) {
  const id = reference.dataset_id ?? reference.datasetId ?? reference.id;
  if (!id) return null;
  return {
    dataset_id: String(id),
    version: String(reference.version ?? reference.dataset_version ?? "unknown"),
    manifest_hash: reference.manifest_hash ?? reference.manifestHash ?? null,
    content_hashes: cloneDomainValue(reference.content_hashes ?? reference.contentHashes ?? reference.hashes ?? reference.sha256 ?? {}),
    crs: reference.crs ?? null,
  };
}

function normalizeRunError(error) {
  return {
    code: error?.code ?? "run_failed",
    message: error?.message ?? String(error),
    ...(error?.details ? { details: cloneDomainValue(error.details) } : {}),
  };
}
