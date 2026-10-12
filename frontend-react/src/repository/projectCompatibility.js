import {
  createInventory,
  createInventoryCell,
  createInventoryRevision,
  inventoryCellToLegacy,
} from "../domain/inventory.js";
import { createDatasetReference, datasetReferenceToLegacy } from "../domain/dataset.js";
import { deriveCompatibilityIdentifier, cloneDomainValue } from "../domain/identifiers.js";
import { createProjectEntity } from "../domain/project.js";
import {
  createScenarioEntity,
  createScenarioRevision,
  scenarioRevisionFromLegacySnapshot,
  scenarioRevisionToLegacyPlan,
} from "../domain/scenario.js";
import { createRun } from "../domain/run.js";

export function workspaceToDomain(workspace) {
  const domain = {
    schema_version: 1,
    active_project_id: workspace?.activeProjectId ?? null,
    projects: [],
    inventories: [],
    inventory_revisions: [],
    scenarios: [],
    scenario_revisions: [],
    runs: [],
    report_definitions: [],
    generated_artifacts: [],
    compatibility_workspace: cloneDomainValue(workspace),
  };

  for (const project of workspace?.projects ?? []) {
    const projectMetadata = project.domain ?? {};
    const projectId = projectMetadata.project_id ?? project.id;
    const datasetReferences = [project.datasetRef].filter(Boolean).map((reference) => createDatasetReference(reference)).filter(Boolean);
    const inventoryId = projectMetadata.inventory_id ?? deriveCompatibilityIdentifier("inventory", projectId);
    const inventoryCells = inventoryCellsFromProject(project);
    const inventoryRevisionId = projectMetadata.inventory_revision_id ?? deriveCompatibilityIdentifier("inventory-revision", inventoryId);
    const inventory = createInventory({
      inventory_id: inventoryId,
      project_id: projectId,
      name: `${project.name} inventory`,
      current_revision_id: inventoryRevisionId,
      source_type: "project-v2-compatibility",
      source_reference: project.datasetRef ?? null,
      metadata: { compatibility_project_id: project.id },
    });
    const currentInventoryRevision = createInventoryRevision({
      inventory_revision_id: inventoryRevisionId,
      inventory_id: inventoryId,
      revision: Number(projectMetadata.inventory_revision ?? 1),
      cells: inventoryCells,
      provenance: "imported",
      source_references: datasetReferences,
      change_summary: "Normalized from ProjectV2 inventory snapshot",
    });
    domain.inventories.push(inventory);
    const storedInventoryRevisions = Array.isArray(projectMetadata.inventory_revisions)
      ? projectMetadata.inventory_revisions.map((revision) => createInventoryRevision(revision))
      : [];
    const inventoryRevisions = [...storedInventoryRevisions, currentInventoryRevision]
      .filter((revision, index, revisions) => revisions.findIndex((candidate) => candidate.inventory_revision_id === revision.inventory_revision_id) === index);
    domain.inventory_revisions.push(...inventoryRevisions);

    const projectEntity = createProjectEntity({
      project_id: projectId,
      name: project.name,
      description: project.description ?? "",
      tags: project.tags ?? [],
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      active_scenario_id: project.scenarios?.find((scenario) => scenario.id === project.activeScenarioId)?.domain?.scenario_id
        ?? project.activeScenarioId
        ?? null,
      inventory_ids: [inventoryId],
      dataset_references: datasetReferences,
      report_ids: (projectMetadata.report_definitions ?? []).map((report) => report.report_id).filter(Boolean),
      metadata: { compatibility_project_id: project.id },
    });
    domain.projects.push(projectEntity);
    domain.report_definitions.push(...(projectMetadata.report_definitions ?? []).map(cloneDomainValue));

    for (const snapshot of project.scenarios ?? []) {
      const snapshotMetadata = snapshot.domain ?? {};
      const scenarioId = snapshotMetadata.scenario_id ?? snapshot.id;
      const scenarioRevisionId = snapshotMetadata.current_revision_id ?? deriveCompatibilityIdentifier("scenario-revision", snapshot.id);
      const currentRevision = scenarioRevisionFromLegacySnapshot(snapshot, {
        scenarioId,
        scenarioRevisionId,
        inventoryRevisionId,
        originatingRunId: snapshotMetadata.originating_run_id ?? snapshotMetadata.originatingRunId,
        originatingSolutionId: snapshotMetadata.originating_solution_id ?? snapshotMetadata.originatingSolutionId,
        revision: snapshotMetadata.revision ?? 1,
        datasetReference: project.datasetRef,
      });
      const storedRevisions = Array.isArray(snapshotMetadata.revisions)
        ? snapshotMetadata.revisions.map((revision) => createScenarioRevision(revision))
        : [];
      const revisionRecords = [...storedRevisions, currentRevision]
        .filter((revision, index, revisions) => revisions.findIndex((candidate) => candidate.scenario_revision_id === revision.scenario_revision_id) === index);
      const scenario = createScenarioEntity({
        scenario_id: scenarioId,
        project_id: projectId,
        name: snapshot.name,
        description: snapshot.description ?? "",
        created_at: snapshot.createdAt,
        updated_at: snapshot.updatedAt,
        current_revision_id: scenarioRevisionId,
        parent_scenario_id: snapshotMetadata.parent_scenario_id ?? null,
        revision_ids: revisionRecords.map((revision) => revision.scenario_revision_id),
        run_ids: (snapshotMetadata.runs ?? []).map((run) => run.run_id).filter(Boolean),
        metadata: { compatibility_scenario_id: snapshot.id },
      });
      domain.scenarios.push(scenario);
      domain.scenario_revisions.push(...revisionRecords);
      appendCachedRuns(domain, projectEntity, scenario, currentRevision, snapshot);
      domain.runs.push(...(snapshotMetadata.runs ?? []).map((run) => createRun(run)));
    }
  }
  domain.runs = domain.runs.filter((run, index, runs) => runs.findIndex((candidate) => candidate.run_id === run.run_id) === index);
  domain.active_project_id = domain.projects.find((project) => project.metadata?.compatibility_project_id === workspace?.activeProjectId)?.project_id
    ?? workspace?.activeProjectId
    ?? null;
  return domain;
}

export function domainToWorkspace(domain, fallbackWorkspace = domain?.compatibility_workspace) {
  const workspace = cloneDomainValue(fallbackWorkspace ?? {
    schemaVersion: 2,
    persistence: { revision: 0, committedAt: null },
    activeProjectId: null,
    projects: [],
  });
  const projectsById = new Map((domain?.projects ?? []).map((project) => [project.project_id, project]));
  const scenariosByProject = new Map();
  for (const scenario of domain?.scenarios ?? []) {
    const list = scenariosByProject.get(scenario.project_id) ?? [];
    list.push(scenario);
    scenariosByProject.set(scenario.project_id, list);
  }
  const revisionsById = new Map((domain?.scenario_revisions ?? []).map((revision) => [revision.scenario_revision_id, revision]));
  const inventoryRevisionsById = new Map((domain?.inventory_revisions ?? []).map((revision) => [revision.inventory_revision_id, revision]));

  workspace.projects = (workspace.projects ?? []).map((legacyProject) => {
    const project = findProjectEntity(projectsById, legacyProject);
    if (!project) return legacyProject;
    const inventory = (domain?.inventories ?? []).find((candidate) => (
      project.inventory_ids ?? []
    ).includes(candidate.inventory_id));
    const inventoryRevision = inventoryRevisionsById.get(inventory?.current_revision_id)
      ?? (domain?.inventory_revisions ?? []).find((revision) => revision.inventory_id === inventory?.inventory_id);
    const scenarios = scenariosByProject.get(project.project_id) ?? [];
    const legacyScenarioByDomainId = new Map((legacyProject.scenarios ?? []).map((scenario) => [scenario.domain?.scenario_id ?? scenario.id, scenario]));
    return {
      ...legacyProject,
      name: project.name,
      ...(project.description !== undefined ? { description: project.description } : {}),
      ...(project.tags !== undefined ? { tags: cloneDomainValue(project.tags) } : {}),
      datasetRef: datasetReferenceToLegacy(project.dataset_references?.[0]) ?? legacyProject.datasetRef ?? null,
      activeScenarioId: resolveLegacyScenarioId(project.active_scenario_id, scenarios, legacyProject),
      domain: {
        ...(legacyProject.domain ?? {}),
        project_id: project.project_id,
        inventory_id: inventory?.inventory_id ?? legacyProject.domain?.inventory_id ?? null,
        inventory_revision_id: inventoryRevision?.inventory_revision_id ?? legacyProject.domain?.inventory_revision_id ?? null,
        inventory_revisions: (domain?.inventory_revisions ?? [])
          .filter((revision) => revision.inventory_id === inventory?.inventory_id)
          .map(cloneDomainValue),
        report_definitions: (domain?.report_definitions ?? [])
          .filter((report) => report.project_id === project.project_id)
          .map(cloneDomainValue),
      },
      scenarios: scenarios.length === 0
        ? legacyProject.scenarios
        : scenarios.map((scenario) => {
          const revision = revisionsById.get(scenario.current_revision_id)
            ?? (domain?.scenario_revisions ?? []).find((candidate) => candidate.scenario_id === scenario.scenario_id);
          const scenarioInventoryRevision = inventoryRevisionsById.get(revision?.inventory_revision_id) ?? inventoryRevision;
          const legacyScenario = legacyScenarioByDomainId.get(scenario.scenario_id)
            ?? (legacyProject.scenarios ?? []).find((candidate) => candidate.id === scenario.scenario_id);
          return scenarioToLegacySnapshot(
            scenario,
            revision,
            legacyScenario,
            scenarioInventoryRevision,
            (domain?.scenario_revisions ?? []).filter((candidate) => candidate.scenario_id === scenario.scenario_id),
            (domain?.runs ?? []).filter((run) => run.scenario_id === scenario.scenario_id),
          );
        }),
    };
  });
  const existingProjectIds = new Set(workspace.projects.map((project) => project.domain?.project_id ?? project.id));
  for (const project of domain?.projects ?? []) {
    if (existingProjectIds.has(project.project_id)) continue;
    const inventory = (domain?.inventories ?? []).find((candidate) => (project.inventory_ids ?? []).includes(candidate.inventory_id));
    const inventoryRevision = inventoryRevisionsById.get(inventory?.current_revision_id)
      ?? (domain?.inventory_revisions ?? []).find((revision) => revision.inventory_id === inventory?.inventory_id);
    const scenarios = scenariosByProject.get(project.project_id) ?? [];
    const legacyScenarios = scenarios.map((scenario) => {
      const revision = revisionsById.get(scenario.current_revision_id)
        ?? (domain?.scenario_revisions ?? []).find((candidate) => candidate.scenario_id === scenario.scenario_id);
      const scenarioInventoryRevision = inventoryRevisionsById.get(revision?.inventory_revision_id) ?? inventoryRevision;
      return scenarioToLegacySnapshot(
        scenario,
        revision,
        null,
        scenarioInventoryRevision,
        (domain?.scenario_revisions ?? []).filter((candidate) => candidate.scenario_id === scenario.scenario_id),
        (domain?.runs ?? []).filter((run) => run.scenario_id === scenario.scenario_id),
      );
    });
    const legacyProjectId = project.metadata?.compatibility_project_id ?? project.project_id;
    workspace.projects.push({
      id: legacyProjectId,
      name: project.name,
      description: project.description ?? "",
      tags: cloneDomainValue(project.tags ?? []),
      datasetRef: datasetReferenceToLegacy(project.dataset_references?.[0]),
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      activeScenarioId: resolveLegacyScenarioId(project.active_scenario_id, scenarios, { scenarios: legacyScenarios }),
      draft: null,
      scenarios: legacyScenarios,
      domain: {
        project_id: project.project_id,
        inventory_id: inventory?.inventory_id ?? null,
        inventory_revision_id: inventoryRevision?.inventory_revision_id ?? null,
        inventory_revisions: (domain?.inventory_revisions ?? [])
          .filter((revision) => revision.inventory_id === inventory?.inventory_id)
          .map(cloneDomainValue),
        report_definitions: (domain?.report_definitions ?? [])
          .filter((report) => report.project_id === project.project_id)
          .map(cloneDomainValue),
      },
    });
    existingProjectIds.add(project.project_id);
  }
  const activeProject = (domain?.projects ?? []).find((project) => project.project_id === domain?.active_project_id);
  if (activeProject) {
    const legacyProject = workspace.projects.find((project) => (project.domain?.project_id ?? project.id) === activeProject.project_id);
    if (legacyProject) workspace.activeProjectId = legacyProject.id;
  }
  return workspace;
}

function inventoryCellsFromProject(project) {
  const inventory = project.draft?.plan?.inventory
    ?? project.scenarios?.find((scenario) => Array.isArray(scenario.plan?.inventory))?.plan?.inventory
    ?? [];
  return inventory.map((cell) => createInventoryCell(cell));
}

function appendCachedRuns(domain, project, scenario, revision, snapshot) {
  const artifacts = snapshot.artifacts ?? {};
  if (artifacts.simulation?.stats) {
    domain.runs.push(createRun({
      run_id: deriveCompatibilityIdentifier("simulation-run", snapshot.id),
      run_type: "simulation",
      project_id: project.project_id,
      scenario_id: scenario.scenario_id,
      scenario_revision_id: revision.scenario_revision_id,
      status: "succeeded",
      summary: cloneDomainValue(artifacts.simulation.stats),
      details: { compatibility_cache: true },
    }));
  }
  if (artifacts.networkOptimization?.stats || artifacts.networkOptimization?.optimization) {
    domain.runs.push(createRun({
      run_id: deriveCompatibilityIdentifier("optimization-run", snapshot.id),
      run_type: "optimization",
      project_id: project.project_id,
      scenario_id: scenario.scenario_id,
      scenario_revision_id: revision.scenario_revision_id,
      status: "succeeded",
      summary: cloneDomainValue(artifacts.networkOptimization.stats ?? {}),
      details: { compatibility_cache: true, public_response: summarizeOptimizationResponse(artifacts.networkOptimization) },
    }));
  }
}

function summarizeOptimizationResponse(response) {
  return {
    optimization_run_id: response.optimization_run_id ?? response.optimizationRunId ?? null,
    recommended_solution_id: response.optimization?.recommended_solution_id ?? null,
    pareto_frontier: cloneDomainValue(response.pareto_frontier ?? []),
    baseline: cloneDomainValue(response.baseline ?? null),
  };
}

function findProjectEntity(projectsById, legacyProject) {
  return projectsById.get(legacyProject.domain?.project_id ?? legacyProject.id)
    ?? [...projectsById.values()].find((project) => project.metadata?.compatibility_project_id === legacyProject.id);
}

function resolveLegacyScenarioId(domainScenarioId, scenarios, legacyProject) {
  const scenario = scenarios.find((candidate) => candidate.scenario_id === domainScenarioId);
  return scenario?.metadata?.compatibility_scenario_id
    ?? (legacyProject.scenarios ?? []).find((candidate) => candidate.id === domainScenarioId)?.id
    ?? legacyProject.activeScenarioId
    ?? null;
}

function scenarioToLegacySnapshot(scenario, revision, legacyScenario, inventoryRevision, revisions = [], runs = []) {
  const original = legacyScenario ?? {};
  const plan = scenarioRevisionToLegacyPlan(revision, original.plan ?? {});
  if (inventoryRevision) plan.inventory = inventoryRevision.cells.map(inventoryCellToLegacy);
  return {
    ...original,
    id: original.id ?? scenario.metadata?.compatibility_scenario_id ?? scenario.scenario_id,
    name: scenario.name,
    description: scenario.description ?? original.description ?? "",
    createdAt: scenario.created_at ?? original.createdAt,
    updatedAt: scenario.updated_at ?? original.updatedAt,
    datasetRef: datasetReferenceToLegacy(revision?.dataset_references?.[0]) ?? original.datasetRef ?? null,
    plan,
    request: cloneDomainValue(revision?.request_inputs ?? original.request ?? null),
    requiresRerun: Boolean(
      original.requiresRerun
        || scenario.parent_scenario_id
        || revision?.originating_solution_id
        || revision?.provenance === "duplicated",
    ),
    domain: {
      ...(original.domain ?? {}),
      scenario_id: scenario.scenario_id,
      parent_scenario_id: scenario.parent_scenario_id ?? original.domain?.parent_scenario_id ?? null,
      current_revision_id: revision?.scenario_revision_id ?? scenario.current_revision_id,
      revision: revision?.revision ?? 1,
      inventory_revision_id: revision?.inventory_revision_id ?? null,
      revisions: revisions.map(cloneDomainValue),
      runs: runs.map(cloneDomainValue),
    },
  };
}
