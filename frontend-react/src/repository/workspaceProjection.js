import { cloneDomainValue } from "../domain/identifiers.js";
import { canonicalSerialize } from "../domain/serialization.js";

const legacyProjects = (domain) => new Map((domain.compatibility_workspace?.projects ?? [])
  .map((project) => [project.domain?.project_id ?? project.id, project]));

// Capture exact canonical values, not references or a collision-prone digest.
// Callers can mutate returned domain records before saving them; such edits
// must never be mistaken for an unchanged Project.
export function captureProjectStates(domain) {
  const legacy = legacyProjects(domain);
  return new Map((domain.projects ?? []).map((project) => {
    const id = project.project_id;
    const inventoryIds = new Set(project.inventory_ids ?? []);
    const scenarios = (domain.scenarios ?? []).filter((scenario) => scenario.project_id === id);
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.scenario_id));
    return [id, canonicalSerialize({
      project,
      legacy_project: legacy.get(id) ?? null,
      inventories: (domain.inventories ?? []).filter((inventory) => inventoryIds.has(inventory.inventory_id)),
      inventory_revisions: (domain.inventory_revisions ?? []).filter((revision) => inventoryIds.has(revision.inventory_id)),
      scenarios,
      scenario_revisions: (domain.scenario_revisions ?? []).filter((revision) => scenarioIds.has(revision.scenario_id)),
      runs: (domain.runs ?? []).filter((run) => run.project_id === id || scenarioIds.has(run.scenario_id)),
      report_definitions: (domain.report_definitions ?? []).filter((report) => report.project_id === id),
      generated_artifacts: (domain.generated_artifacts ?? []).filter((artifact) => artifact.project_id === id),
    })];
  }));
}

export function preserveUnchangedProjects(projected, domain, previousStates) {
  if (!previousStates) return projected;
  const currentStates = captureProjectStates(domain);
  const legacy = legacyProjects(domain);
  projected.projects = projected.projects.map((project) => {
    const id = project.domain?.project_id ?? project.id;
    return legacy.has(id) && previousStates.has(id) && currentStates.has(id)
      && previousStates.get(id) === currentStates.get(id)
      ? cloneDomainValue(legacy.get(id)) : project;
  });
  return projected;
}
