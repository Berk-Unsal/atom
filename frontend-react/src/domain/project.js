import { cloneDomainValue, createEntityId, deepFreeze } from "./identifiers.js";
import { createDatasetReference } from "./dataset.js";

export function createProjectEntity(input = {}) {
  const now = input.created_at ?? input.createdAt ?? new Date().toISOString();
  const datasetInputs = input.dataset_references ?? input.datasetReferences ?? (input.datasetRef ? [input.datasetRef] : []);
  return {
    project_id: input.project_id ?? input.projectId ?? createEntityId(),
    name: String(input.name ?? "Untitled Plan").trim() || "Untitled Plan",
    description: input.description ?? "",
    tags: cloneDomainValue(input.tags ?? []),
    created_at: now,
    updated_at: input.updated_at ?? input.updatedAt ?? now,
    active_scenario_id: input.active_scenario_id ?? input.activeScenarioId ?? null,
    scenario_ids: [...(input.scenario_ids ?? input.scenarioIds ?? [])],
    inventory_ids: [...(input.inventory_ids ?? input.inventoryIds ?? [])],
    dataset_references: (Array.isArray(datasetInputs) ? datasetInputs : [datasetInputs])
      .filter(Boolean)
      .map((reference) => createDatasetReference(reference) ?? cloneDomainValue(reference)),
    report_ids: [...(input.report_ids ?? input.reportIds ?? [])],
    metadata: cloneDomainValue(input.metadata ?? {}),
  };
}

export function updateProjectEntity(project, changes = {}) {
  return createProjectEntity({
    ...project,
    ...changes,
    project_id: project.project_id,
    created_at: project.created_at,
    updated_at: changes.updated_at ?? new Date().toISOString(),
  });
}

export function addProjectReference(project, field, id) {
  const values = new Set(project?.[field] ?? []);
  if (id) values.add(id);
  return updateProjectEntity(project, { [field]: [...values] });
}

export function validateProjectEntity(project) {
  const errors = [];
  if (!project || typeof project !== "object") return ["project is required"];
  if (!String(project.project_id ?? "").trim()) errors.push("project_id is required");
  if (!String(project.name ?? "").trim()) errors.push("name is required");
  if (!Array.isArray(project.scenario_ids)) errors.push("scenario_ids must be an array");
  if (!Array.isArray(project.inventory_ids)) errors.push("inventory_ids must be an array");
  return errors;
}

export function freezeProjectEntity(project) {
  return deepFreeze(cloneDomainValue(project));
}

export const createProject = createProjectEntity;
