import { cloneDomainValue, createEntityId, deepFreeze } from "./identifiers.js";
import { createDatasetReference } from "./dataset.js";
import { inventoryCellToLegacy, resolveInventoryRevision } from "./inventory.js";
import { assertNoUIState, stripUIState } from "./serialization.js";

export const SCENARIO_REVISION_SCHEMA_VERSION = 1;

export function createScenarioEntity(input = {}) {
  const now = input.created_at ?? input.createdAt ?? new Date().toISOString();
  return {
    scenario_id: input.scenario_id ?? input.scenarioId ?? createEntityId(),
    project_id: input.project_id ?? input.projectId ?? null,
    name: String(input.name ?? "Planning scenario").trim() || "Planning scenario",
    description: input.description ?? "",
    created_at: now,
    updated_at: input.updated_at ?? input.updatedAt ?? now,
    current_revision_id: input.current_revision_id ?? input.currentRevisionId ?? null,
    parent_scenario_id: input.parent_scenario_id ?? input.parentScenarioId ?? null,
    revision_ids: [...(input.revision_ids ?? input.revisionIds ?? [])],
    run_ids: [...(input.run_ids ?? input.runIds ?? [])],
    report_ids: [...(input.report_ids ?? input.reportIds ?? [])],
    metadata: cloneDomainValue(input.metadata ?? {}),
  };
}

export function createScenarioRevision(input = {}) {
  const datasetInputs = input.dataset_references ?? input.datasetReferences ?? [];
  const revision = {
    schema_version: SCENARIO_REVISION_SCHEMA_VERSION,
    scenario_revision_id: input.scenario_revision_id ?? input.scenarioRevisionId ?? createEntityId(),
    scenario_id: input.scenario_id ?? input.scenarioId ?? null,
    revision: Number.isSafeInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    parent_revision_id: input.parent_revision_id ?? input.parentRevisionId ?? null,
    inventory_revision_id: input.inventory_revision_id ?? input.inventoryRevisionId ?? null,
    overrides: cloneDomainValue(input.overrides ?? {}),
    planning_mode: input.planning_mode ?? input.planningMode ?? null,
    selected_cell_id: input.selected_cell_id ?? input.selectedCellId ?? null,
    selected_cell_ids: [...(input.selected_cell_ids ?? input.selectedCellIds ?? [])].map(String),
    enabled_cell_ids: input.enabled_cell_ids === undefined && input.enabledCellIds === undefined
      ? null
      : [...(input.enabled_cell_ids ?? input.enabledCellIds ?? [])].map(String),
    selection_geometry: cloneDomainValue(input.selection_geometry ?? input.selectionGeometry ?? input.aoi ?? null),
    rf_affecting_settings: cloneDomainValue(input.rf_affecting_settings ?? input.rfAffectingSettings ?? input.settings ?? {}),
    receiver_assumptions: cloneDomainValue(input.receiver_assumptions ?? input.receiverAssumptions ?? {}),
    propagation_selection: cloneDomainValue(input.propagation_selection ?? input.propagationSelection ?? {}),
    interference_settings: cloneDomainValue(input.interference_settings ?? input.interferenceSettings ?? {}),
    objective_constraints: cloneDomainValue(input.objective_constraints ?? input.objectiveConstraints ?? {}),
    optimizer_configuration: cloneDomainValue(input.optimizer_configuration ?? input.optimizerConfiguration ?? {}),
    dataset_references: (Array.isArray(datasetInputs) ? datasetInputs : [datasetInputs])
      .filter(Boolean)
      .map((reference) => createDatasetReference(reference) ?? cloneDomainValue(reference)),
    resolved_fingerprints: cloneDomainValue(input.resolved_fingerprints ?? input.resolvedFingerprints ?? {}),
    originating_run_id: input.originating_run_id ?? input.originatingRunId ?? null,
    originating_solution_id: input.originating_solution_id ?? input.originatingSolutionId ?? null,
    calibration_profile: cloneDomainValue(input.calibration_profile ?? input.calibrationProfile ?? null),
    request_inputs: stripUIState(cloneDomainValue(input.request_inputs ?? input.requestInputs ?? null)),
    canonical_input_snapshot: stripUIState(cloneDomainValue(input.canonical_input_snapshot ?? input.canonicalInputSnapshot ?? null)),
    created_at: input.created_at ?? input.createdAt ?? new Date().toISOString(),
    change_summary: input.change_summary ?? input.changeSummary ?? "",
    provenance: cloneDomainValue(input.provenance ?? "user_configured"),
    metadata: cloneDomainValue(input.metadata ?? {}),
  };
  assertNoUIState(revision.request_inputs, "ScenarioRevision request inputs");
  assertNoUIState(revision.canonical_input_snapshot, "ScenarioRevision canonical input snapshot");
  return deepFreeze(revision);
}

export function createWorkingScenarioDraft(revision, changes = {}) {
  return {
    ...(revision ? cloneDomainValue(revision) : {}),
    ...cloneDomainValue(changes),
    working: true,
    saved_revision_id: revision?.scenario_revision_id ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function saveWorkingScenarioDraft(draft, options = {}) {
  const source = draft ?? {};
  return createScenarioRevision({
    ...source,
    ...options,
    scenario_revision_id: options.scenario_revision_id ?? options.scenarioRevisionId,
    parent_revision_id: options.parent_revision_id ?? options.parentRevisionId ?? source.saved_revision_id ?? source.scenario_revision_id ?? null,
    revision: options.revision ?? (Number(source.revision) || 0) + 1,
    created_at: options.created_at ?? new Date().toISOString(),
  });
}

export function scenarioRevisionFromLegacySnapshot(snapshot, options = {}) {
  const plan = snapshot?.plan ?? {};
  const settings = plan.settings ?? {};
  const networkAzimuths = plan.networkAzimuths ?? {};
  const overrides = {};
  for (const [cellId, azimuth] of Object.entries(networkAzimuths)) {
    overrides[String(cellId)] = { fields: { azimuth_deg: azimuth } };
  }
  const selectedCellIds = [
    ...(Array.isArray(plan.selectedNetworkTowerIds) ? plan.selectedNetworkTowerIds : []),
    ...(plan.selectedTowerId ? [plan.selectedTowerId] : []),
  ].filter((value, index, values) => value !== null && value !== undefined && values.indexOf(value) === index).map(String);
  const optimization = cloneDomainValue(plan.optimizationConfig ?? {});
  const revision = createScenarioRevision({
    scenario_revision_id: options.scenarioRevisionId,
    scenario_id: options.scenarioId ?? snapshot?.id,
    revision: options.revision ?? snapshot?.domain?.revision ?? 1,
    parent_revision_id: options.parentRevisionId ?? snapshot?.domain?.parent_revision_id ?? null,
    inventory_revision_id: options.inventoryRevisionId,
    overrides,
    planning_mode: plan.planningMode ?? null,
    selected_cell_id: plan.selectedTowerId ?? null,
    selected_cell_ids: selectedCellIds,
    enabled_cell_ids: Array.isArray(plan.selectedNetworkTowerIds) ? plan.selectedNetworkTowerIds : null,
    selection_geometry: plan.selectionPolygon ?? null,
    rf_affecting_settings: settings,
    receiver_assumptions: pickReceiverAssumptions(settings, plan.inventory),
    propagation_selection: { model_id: settings.propagationModelID ?? null },
    interference_settings: pickInterferenceSettings(settings),
    objective_constraints: optimization,
    optimizer_configuration: optimization,
    dataset_references: [snapshot?.datasetRef, options.datasetReference].filter(Boolean),
    resolved_fingerprints: {
      scenario_fingerprint: snapshot?.request?.scenario_fingerprint ?? snapshot?.meta?.scenario_fingerprint ?? null,
      input_fingerprint: snapshot?.request?.input_fingerprint ?? null,
    },
    originating_run_id: options.originatingRunId,
    originating_solution_id: options.originatingSolutionId,
    calibration_profile: snapshot?.calibrationProfile ?? null,
    request_inputs: snapshot?.request ?? null,
    canonical_input_snapshot: stripUIState({
      settings,
      inventory: plan.inventory ?? null,
      planningMode: plan.planningMode ?? null,
      selectedTowerId: plan.selectedTowerId ?? null,
      selectedNetworkTowerIds: plan.selectedNetworkTowerIds ?? [],
      networkAzimuths,
      selectionPolygon: plan.selectionPolygon ?? null,
      optimizationConfig: optimization,
    }),
    metadata: { app_meta: stripUIState(snapshot?.meta ?? null) },
    change_summary: options.changeSummary ?? "Imported from ProjectV2 compatibility snapshot",
    provenance: options.provenance ?? "user_configured",
  });
  return revision;
}

export function scenarioRevisionToLegacyPlan(revision, originalPlan = {}) {
  const overrides = revision?.overrides ?? {};
  const networkAzimuths = { ...(originalPlan.networkAzimuths ?? {}) };
  for (const [cellId, override] of Object.entries(overrides)) {
    const azimuth = override?.fields?.azimuth_deg ?? override?.azimuth_deg;
    if (azimuth !== undefined) networkAzimuths[cellId] = azimuth;
  }
  const selectedCellIds = revision?.selected_cell_ids ?? [];
  const selectedTowerId = revision?.selected_cell_id ?? originalPlan.selectedTowerId ?? selectedCellIds[0] ?? null;
  return {
    ...cloneDomainValue(originalPlan),
    settings: cloneDomainValue(revision?.rf_affecting_settings ?? originalPlan.settings ?? {}),
    planningMode: revision?.planning_mode ?? originalPlan.planningMode ?? "single",
    selectedTowerId,
    selectedNetworkTowerIds: [...(revision?.enabled_cell_ids ?? originalPlan.selectedNetworkTowerIds ?? [])],
    networkAzimuths,
    selectionPolygon: cloneDomainValue(revision?.selection_geometry ?? originalPlan.selectionPolygon ?? []),
    optimizationConfig: cloneDomainValue(revision?.optimizer_configuration ?? revision?.objective_constraints ?? originalPlan.optimizationConfig ?? {}),
  };
}

export function resolveScenarioConfiguration(inventoryRevision, scenarioRevision, defaults = {}) {
  const cells = resolveInventoryRevision(
    inventoryRevision,
    scenarioRevision?.overrides ?? {},
    defaults.inventory_cell ?? defaults.inventoryCell ?? {},
  );
  const selected = new Set((scenarioRevision?.selected_cell_ids ?? []).map(String));
  const selectedCells = selected.size === 0 ? cells : cells.filter((cell) => selected.has(String(cell.inventory_cell_id)) || selected.has(String(cell.cell_id)));
  return {
    cells,
    effective_cells: cells.map((cell) => inventoryCellToLegacy(cell)),
    selected_cells: selectedCells,
    selected_effective_cells: selectedCells.map((cell) => inventoryCellToLegacy(cell)),
    settings: cloneDomainValue(scenarioRevision?.rf_affecting_settings ?? defaults.settings ?? {}),
    propagation: cloneDomainValue(scenarioRevision?.propagation_selection ?? {}),
    receiver_assumptions: cloneDomainValue(scenarioRevision?.receiver_assumptions ?? {}),
    interference: cloneDomainValue(scenarioRevision?.interference_settings ?? {}),
    objective_constraints: cloneDomainValue(scenarioRevision?.objective_constraints ?? {}),
    optimizer_configuration: cloneDomainValue(scenarioRevision?.optimizer_configuration ?? {}),
    selection_geometry: cloneDomainValue(scenarioRevision?.selection_geometry ?? null),
    request_inputs: cloneDomainValue(scenarioRevision?.request_inputs ?? null),
  };
}

export const resolveScenarioInputs = resolveScenarioConfiguration;
export const resolveScenarioRevision = resolveScenarioConfiguration;

export function branchScenario({ sourceScenario, sourceRevision, name, description = "", projectId } = {}) {
  const scenario = createScenarioEntity({
    project_id: projectId ?? sourceScenario?.project_id,
    name: name ?? `${sourceScenario?.name ?? "Scenario"} branch`,
    description,
    parent_scenario_id: sourceScenario?.scenario_id ?? null,
  });
  const revision = createScenarioRevision({
    ...cloneDomainValue(sourceRevision ?? {}),
    scenario_revision_id: undefined,
    scenario_id: scenario.scenario_id,
    revision: 1,
    parent_revision_id: sourceRevision?.scenario_revision_id ?? null,
    change_summary: "Branched from an existing ScenarioRevision",
  });
  return {
    scenario: { ...scenario, current_revision_id: revision.scenario_revision_id, revision_ids: [revision.scenario_revision_id] },
    revision,
  };
}

export function applyOptimizationSolution({ scenario, scenarioRevision, run, solution, changeSummary } = {}) {
  if (!scenarioRevision) throw new Error("A ScenarioRevision is required to apply an optimization solution");
  if (!solution) throw new Error("An OptimizationSolution is required to apply");
  const nextOverrides = cloneDomainValue(scenarioRevision.overrides ?? {});
  const configurations = solution.cell_configurations ?? solution.cellConfigurations ?? solution.towers ?? [];
  for (const configuration of configurations) {
    const cellId = configuration.id ?? configuration.cell_id ?? configuration.cellId;
    const azimuth = configuration.optimal_azimuth ?? configuration.azimuth_deg ?? configuration.azimuth;
    if (cellId === undefined || azimuth === undefined) continue;
    nextOverrides[String(cellId)] = {
      ...(nextOverrides[String(cellId)] ?? {}),
      fields: {
        ...(nextOverrides[String(cellId)]?.fields ?? {}),
        azimuth_deg: Number(azimuth),
      },
    };
  }
  const nextRevision = createScenarioRevision({
    ...cloneDomainValue(scenarioRevision),
    scenario_revision_id: undefined,
    revision: Number(scenarioRevision.revision ?? 0) + 1,
    parent_revision_id: scenarioRevision.scenario_revision_id,
    overrides: nextOverrides,
    originating_run_id: run?.run_id ?? run?.id ?? null,
    originating_solution_id: solution.optimization_solution_id ?? solution.optimizer_solution_id ?? solution.id ?? null,
    change_summary: changeSummary ?? "Applied a public optimization solution",
  });
  const nextScenario = scenario
    ? { ...cloneDomainValue(scenario), current_revision_id: nextRevision.scenario_revision_id, revision_ids: [...new Set([...(scenario.revision_ids ?? []), nextRevision.scenario_revision_id])] }
    : null;
  return { scenario: nextScenario, revision: nextRevision, scenarioRevision: nextRevision };
}

function pickReceiverAssumptions(settings, inventory) {
  const profile = inventory?.[0]?.rfProfile ?? inventory?.[0]?.rf_profile ?? {};
  return {
    receiverHeightM: profile.receiverHeightM ?? profile.receiver_height_m ?? null,
    sensitivityDbm: profile.receiverSensitivityDbm ?? profile.receiver_sensitivity_dbm ?? null,
    sensitivityMode: profile.receiverSensitivityMode ?? profile.receiver_sensitivity_mode ?? null,
    noiseBandwidthHz: profile.receiverNoiseBandwidthHz ?? profile.receiver_noise_bandwidth_hz ?? null,
    noiseFigureDb: settings.noiseFigureDb ?? profile.receiverNoiseFigureDb ?? profile.receiver_noise_figure_db ?? null,
    requiredSnrDb: profile.receiverRequiredSnrDb ?? profile.receiver_required_snr_db ?? null,
    marginDb: profile.receiverMarginDb ?? profile.receiver_margin_db ?? null,
  };
}

function pickInterferenceSettings(settings) {
  return {
    bandwidthMHz: settings.interferenceBandwidthMHz ?? null,
    loadPct: settings.cellLoadPct ?? null,
    reuseFactor: settings.reuseFactor ?? null,
    noiseFigureDb: settings.noiseFigureDb ?? null,
    sampleSpacingMeters: settings.sampleSpacingMeters ?? null,
    calibrationOffsetDb: settings.calibrationOffsetDb ?? 0,
  };
}

export function validateScenarioRevision(revision) {
  const errors = [];
  if (!revision || typeof revision !== "object") return ["scenario revision is required"];
  if (!String(revision.scenario_revision_id ?? "").trim()) errors.push("scenario_revision_id is required");
  if (!String(revision.scenario_id ?? "").trim()) errors.push("scenario_id is required");
  if (!Number.isInteger(revision.revision) || revision.revision < 1) errors.push("revision must be a positive integer");
  if (!Array.isArray(revision.selected_cell_ids)) errors.push("selected_cell_ids must be an array");
  if (revision.request_inputs && typeof revision.request_inputs !== "object") errors.push("request_inputs must be an object or null");
  return errors;
}

export const createScenario = createScenarioEntity;
