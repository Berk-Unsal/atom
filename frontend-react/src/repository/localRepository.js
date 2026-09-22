import * as projectStore from "../utils/projectStore.js";
import { createEntityId, cloneDomainValue } from "../domain/identifiers.js";
import {
  applyOptimizationSolution,
  branchScenario as branchScenarioEntity,
  duplicateScenario as duplicateScenarioEntity,
  getCurrentScenarioRevision,
  scenarioRevisionFromLegacySnapshot,
  scenarioRevisionToWorkingSnapshot,
} from "../domain/scenario.js";
import { validateReportDefinition } from "../domain/report.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { workspaceToDomain, domainToWorkspace } from "./projectCompatibility.js";
import { implementsRepositoryContract } from "./contract.js";
import { normalizeRepositoryError, RepositoryError } from "./errors.js";

export class LocalRepository {
  constructor({ store = projectStore, datasetRef = null } = {}) {
    this.store = store;
    this.datasetRef = datasetRef;
    this.domain = null;
  }

  async loadWorkspace(datasetRef = this.datasetRef) {
    try {
      const workspace = await this.store.loadProjectWorkspace(datasetRef);
      this.domain = workspaceToDomain(workspace);
      return workspace;
    } catch (error) {
      throw normalizeRepositoryError(error, "persistence_failed");
    }
  }

  queueWorkspaceSave(workspace) {
    try {
      const queued = this.store.queueProjectWorkspaceSave(workspace);
      return {
        workspace: queued.workspace,
        saved: queued.saved.then((saved) => {
          this.domain = workspaceToDomain(saved);
          return saved;
        }).catch((error) => {
          throw normalizeRepositoryError(error, "persistence_failed");
        }),
      };
    } catch (error) {
      return { workspace, saved: Promise.reject(normalizeRepositoryError(error, "serialization_failed")) };
    }
  }

  async saveWorkspace(workspace) {
    const queued = this.queueWorkspaceSave(workspace);
    return queued.saved;
  }

  async loadDomain(datasetRef = this.datasetRef) {
    const workspace = await this.loadWorkspace(datasetRef);
    return this.domain ?? workspaceToDomain(workspace);
  }

  async saveDomain(domain) {
    const saved = await this.saveDomainWithWorkspace(domain);
    return saved.domain;
  }

  async saveDomainWithWorkspace(domain) {
    if (!domain || typeof domain !== "object") throw new RepositoryError("invalid_entity", "Domain workspace is required");
    const workspace = domainToWorkspace(domain, domain.compatibility_workspace);
    const savedWorkspace = await this.saveWorkspace(workspace);
    this.domain = workspaceToDomain(savedWorkspace);
    return { domain: this.domain, workspace: savedWorkspace };
  }

  async listProjects() {
    const domain = await this.loadDomain();
    return cloneDomainValue(domain.projects);
  }

  async getProject(projectId) {
    const project = (await this.listProjects()).find((candidate) => candidate.project_id === projectId);
    if (!project) throw new RepositoryError("not_found", `Project ${projectId} was not found`);
    return project;
  }

  async saveProject(project) {
    const domain = await this.loadDomain();
    const projects = [...domain.projects];
    const index = projects.findIndex((candidate) => candidate.project_id === project?.project_id);
    if (index < 0) projects.push(cloneDomainValue(project));
    else projects[index] = cloneDomainValue(project);
    return this.saveDomain({ ...domain, projects });
  }

  async listScenarios(projectId) {
    const domain = await this.loadDomain();
    return cloneDomainValue(domain.scenarios.filter((scenario) => scenario.project_id === projectId));
  }

  async getScenario(scenarioId) {
    const domain = await this.loadDomain();
    const scenario = domain.scenarios.find((candidate) => candidate.scenario_id === scenarioId);
    if (!scenario) throw new RepositoryError("not_found", `Scenario ${scenarioId} was not found`);
    return cloneDomainValue(scenario);
  }

  async saveScenario(scenario) {
    const domain = await this.loadDomain();
    const scenarios = [...domain.scenarios];
    const index = scenarios.findIndex((candidate) => candidate.scenario_id === scenario?.scenario_id);
    if (index < 0) scenarios.push(cloneDomainValue(scenario));
    else scenarios[index] = cloneDomainValue(scenario);
    return this.saveDomain({ ...domain, scenarios });
  }

  async saveScenarioVersion({ projectId, scenarioId, snapshot = {}, changeSummary = "", originatingRunId = null, originatingSolutionId = null, provenance = "user_configured" } = {}) {
    const domain = await this.loadDomain();
    const project = domain.projects.find((candidate) => String(candidate.project_id) === String(projectId));
    const sourceScenario = domain.scenarios.find((candidate) => String(candidate.scenario_id) === String(scenarioId)
      || String(candidate.metadata?.compatibility_scenario_id) === String(scenarioId));
    if (!project || !sourceScenario) throw new RepositoryError("not_found", "The source Scenario was not found");
    const sourceRevision = domain.scenario_revisions.find((candidate) => candidate.scenario_revision_id === sourceScenario.current_revision_id)
      ?? getCurrentScenarioRevision(resolveLegacyScenarioSnapshot(domain, project, sourceScenario));
    if (!sourceRevision) throw new RepositoryError("run_input_stale", "The source Scenario version is unavailable");
    const now = new Date().toISOString();
    const legacySource = resolveLegacyScenarioSnapshot(domain, project, sourceScenario);
    const revision = scenarioRevisionFromLegacySnapshot({
      ...cloneDomainValue(legacySource),
      ...cloneDomainValue(snapshot),
      id: legacySource.id,
      datasetRef: snapshot.datasetRef ?? legacySource.datasetRef ?? project.dataset_references?.[0],
    }, {
      scenarioId: sourceScenario.scenario_id,
      scenarioRevisionId: undefined,
      inventoryRevisionId: sourceRevision.inventory_revision_id,
      parentRevisionId: sourceRevision.scenario_revision_id,
      revision: Number(sourceRevision.revision ?? 0) + 1,
      datasetReference: snapshot.datasetRef ?? legacySource.datasetRef ?? project.dataset_references?.[0],
      originatingRunId,
      originatingSolutionId,
      changeSummary: changeSummary || "Saved a new Scenario version",
      provenance,
    });
    const nextScenario = {
      ...sourceScenario,
      name: snapshot.name ?? sourceScenario.name,
      description: snapshot.description ?? sourceScenario.description ?? "",
      updated_at: now,
      current_revision_id: revision.scenario_revision_id,
      revision_ids: [...new Set([...(sourceScenario.revision_ids ?? []), revision.scenario_revision_id])],
    };
    const revisions = [...domain.scenario_revisions, revision]
      .filter((candidate, index, values) => values.findIndex((item) => item.scenario_revision_id === candidate.scenario_revision_id) === index);
    const nextDomain = {
      ...domain,
      scenarios: domain.scenarios.map((candidate) => candidate.scenario_id === sourceScenario.scenario_id ? nextScenario : candidate),
      scenario_revisions: revisions,
    };
    const workspace = domainToWorkspace(nextDomain, domain.compatibility_workspace);
    const nextWorkspace = replaceLegacyScenario(workspace, project, sourceScenario, {
      ...cloneDomainValue(legacySource),
      ...cloneDomainValue(snapshot),
      id: legacySource.id,
      name: snapshot.name ?? legacySource.name ?? sourceScenario.name,
      description: snapshot.description ?? legacySource.description ?? sourceScenario.description ?? "",
      createdAt: legacySource.createdAt ?? sourceScenario.created_at,
      updatedAt: now,
      requiresRerun: Boolean(snapshot.requiresRerun),
      sourceScenarioId: undefined,
      sourceRevisionId: undefined,
      domain: {
        ...(legacySource.domain ?? {}),
        scenario_id: sourceScenario.scenario_id,
        current_revision_id: revision.scenario_revision_id,
        revision: revision.revision,
        parent_revision_id: revision.parent_revision_id,
        originating_run_id: revision.originating_run_id,
        originating_solution_id: revision.originating_solution_id,
        revisions: revisions.filter((candidate) => candidate.scenario_id === sourceScenario.scenario_id).map(cloneDomainValue),
      },
    });
    const savedWorkspace = await this.saveWorkspace(nextWorkspace);
    const savedScenario = savedWorkspace.projects
      .find((candidate) => candidate.id === nextWorkspace.activeProjectId || String(candidate.domain?.project_id) === String(project.project_id))
      ?.scenarios?.find((candidate) => String(candidate.id) === String(legacySource.id));
    return { scenario: savedScenario ?? null, revision: cloneDomainValue(revision), workspace: savedWorkspace };
  }

  async branchScenario({ projectId, scenarioId, revisionId = null, name, description = "" } = {}) {
    const domain = await this.loadDomain();
    const project = domain.projects.find((candidate) => String(candidate.project_id) === String(projectId));
    const sourceScenario = domain.scenarios.find((candidate) => String(candidate.scenario_id) === String(scenarioId)
      || String(candidate.metadata?.compatibility_scenario_id) === String(scenarioId));
    const sourceRevision = domain.scenario_revisions.find((candidate) => String(candidate.scenario_revision_id) === String(revisionId))
      ?? (sourceScenario ? domain.scenario_revisions.find((candidate) => candidate.scenario_revision_id === sourceScenario.current_revision_id) : null);
    if (!project || !sourceScenario || !sourceRevision) throw new RepositoryError("not_found", "The source Scenario version was not found");
    const result = branchScenarioEntity({
      sourceScenario,
      sourceRevision,
      name: String(name ?? "").trim() || `${sourceScenario.name} branch`,
      description,
      projectId: project.project_id,
    });
    const nextProject = {
      ...project,
      active_scenario_id: result.scenario.scenario_id,
      scenario_ids: [...new Set([...(project.scenario_ids ?? []), result.scenario.scenario_id])],
      updated_at: new Date().toISOString(),
    };
    const saved = await this.saveDomainWithWorkspace({
      ...domain,
      projects: domain.projects.map((candidate) => candidate.project_id === project.project_id ? nextProject : candidate),
      scenarios: [...domain.scenarios, result.scenario],
      scenario_revisions: [...domain.scenario_revisions, result.revision],
    });
    return { ...result, ...saved };
  }

  async duplicateScenario({ projectId, scenarioId, name, description = "" } = {}) {
    const domain = await this.loadDomain();
    const project = domain.projects.find((candidate) => String(candidate.project_id) === String(projectId));
    const sourceScenario = domain.scenarios.find((candidate) => String(candidate.scenario_id) === String(scenarioId)
      || String(candidate.metadata?.compatibility_scenario_id) === String(scenarioId));
    const sourceRevision = sourceScenario && domain.scenario_revisions.find((candidate) => candidate.scenario_revision_id === sourceScenario.current_revision_id);
    if (!project || !sourceScenario || !sourceRevision) throw new RepositoryError("not_found", "The source Scenario version was not found");
    const result = duplicateScenarioEntity({
      sourceScenario,
      sourceRevision,
      name: String(name ?? "").trim() || `${sourceScenario.name} copy`,
      description: description || sourceScenario.description || "",
      projectId: project.project_id,
    });
    const nextProject = {
      ...project,
      active_scenario_id: result.scenario.scenario_id,
      scenario_ids: [...new Set([...(project.scenario_ids ?? []), result.scenario.scenario_id])],
      updated_at: new Date().toISOString(),
    };
    const saved = await this.saveDomainWithWorkspace({
      ...domain,
      projects: domain.projects.map((candidate) => candidate.project_id === project.project_id ? nextProject : candidate),
      scenarios: [...domain.scenarios, result.scenario],
      scenario_revisions: [...domain.scenario_revisions, result.revision],
    });
    return { ...result, ...saved };
  }

  async continueFromScenarioRevision({ projectId, scenarioId, revisionId } = {}) {
    const domain = await this.loadDomain();
    const project = domain.projects.find((candidate) => String(candidate.project_id) === String(projectId));
    const sourceScenario = domain.scenarios.find((candidate) => String(candidate.scenario_id) === String(scenarioId)
      || String(candidate.metadata?.compatibility_scenario_id) === String(scenarioId));
    const revision = domain.scenario_revisions.find((candidate) => String(candidate.scenario_revision_id) === String(revisionId));
    if (!project || !sourceScenario || !revision) throw new RepositoryError("not_found", "The selected Scenario version was not found");
    const legacySource = resolveLegacyScenarioSnapshot(domain, project, sourceScenario);
    const draft = scenarioRevisionToWorkingSnapshot(revision, legacySource);
    draft.sourceScenarioId = legacySource.id;
    draft.sourceRevisionId = revision.scenario_revision_id;
    const workspace = cloneDomainValue(domain.compatibility_workspace);
    const legacyProject = workspace.projects.find((candidate) => String(candidate.domain?.project_id ?? candidate.id) === String(project.project_id));
    if (!legacyProject) throw new RepositoryError("not_found", "The source Project workspace was not found");
    legacyProject.activeScenarioId = null;
    legacyProject.draft = draft;
    const savedWorkspace = await this.saveWorkspace(workspace);
    return { draft, revision: cloneDomainValue(revision), workspace: savedWorkspace };
  }

  async getScenarioRevision(revisionId) {
    const domain = await this.loadDomain();
    const revision = domain.scenario_revisions.find((candidate) => candidate.scenario_revision_id === revisionId);
    if (!revision) throw new RepositoryError("not_found", `ScenarioRevision ${revisionId} was not found`);
    return cloneDomainValue(revision);
  }

  async saveScenarioRevision(revision) {
    const domain = await this.loadDomain();
    const revisions = [...domain.scenario_revisions];
    const index = revisions.findIndex((candidate) => candidate.scenario_revision_id === revision?.scenario_revision_id);
    if (index < 0) revisions.push(cloneDomainValue(revision));
    else if (canonicalSerialize(revisions[index]) !== canonicalSerialize(revision)) {
      throw new RepositoryError("invalid_entity", `ScenarioRevision ${revision.scenario_revision_id} is immutable`);
    }
    const scenarios = domain.scenarios.map((scenario) => scenario.scenario_id === revision.scenario_id
      ? { ...scenario, current_revision_id: revision.scenario_revision_id, revision_ids: [...new Set([...(scenario.revision_ids ?? []), revision.scenario_revision_id])] }
      : scenario);
    return this.saveDomain({ ...domain, scenario_revisions: revisions, scenarios });
  }

  async getInventory(inventoryId) {
    const domain = await this.loadDomain();
    const inventory = domain.inventories.find((candidate) => candidate.inventory_id === inventoryId);
    if (!inventory) throw new RepositoryError("not_found", `Inventory ${inventoryId} was not found`);
    return cloneDomainValue(inventory);
  }

  async getInventoryRevision(revisionId) {
    const domain = await this.loadDomain();
    const revision = domain.inventory_revisions.find((candidate) => candidate.inventory_revision_id === revisionId);
    if (!revision) throw new RepositoryError("not_found", `InventoryRevision ${revisionId} was not found`);
    return cloneDomainValue(revision);
  }

  async saveInventoryRevision(revision) {
    const domain = await this.loadDomain();
    const revisions = [...domain.inventory_revisions];
    const index = revisions.findIndex((candidate) => candidate.inventory_revision_id === revision?.inventory_revision_id);
    if (index < 0) revisions.push(cloneDomainValue(revision));
    else if (canonicalSerialize(revisions[index]) !== canonicalSerialize(revision)) {
      throw new RepositoryError("invalid_entity", `InventoryRevision ${revision.inventory_revision_id} is immutable`);
    }
    const inventories = domain.inventories.map((inventory) => inventory.inventory_id === revision.inventory_id
      ? { ...inventory, current_revision_id: revision.inventory_revision_id, updated_at: new Date().toISOString() }
      : inventory);
    return this.saveDomain({ ...domain, inventory_revisions: revisions, inventories });
  }

  async listRuns(scenarioRevisionId) {
    const domain = await this.loadDomain();
    return cloneDomainValue(domain.runs.filter((run) => !scenarioRevisionId || run.scenario_revision_id === scenarioRevisionId));
  }

  async getRun(runId) {
    const domain = await this.loadDomain();
    const run = domain.runs.find((candidate) => candidate.run_id === runId);
    if (!run) throw new RepositoryError("not_found", `Run ${runId} was not found`);
    return cloneDomainValue(run);
  }

  async saveRun(run) {
    const domain = await this.loadDomain();
    const runs = [...domain.runs];
    const index = runs.findIndex((candidate) => candidate.run_id === run?.run_id);
    if (index < 0) runs.push(cloneDomainValue(run));
    else runs[index] = cloneDomainValue(run);
    return this.saveDomain({ ...domain, runs });
  }

  async applyOptimizationSolution({ projectId, scenarioId, revisionId = null, run, solution, mode = "version", branchName = "" } = {}) {
    const domain = await this.loadDomain();
    const scenario = domain.scenarios.find((candidate) => (
      String(candidate.scenario_id) === String(scenarioId)
        || String(candidate.metadata?.compatibility_scenario_id) === String(scenarioId)
    ) && (!projectId || String(candidate.project_id) === String(projectId)));
    if (!scenario) throw new RepositoryError("run_input_stale", "The source ScenarioRevision for this run is no longer available");
    const revision = domain.scenario_revisions.find((candidate) => String(candidate.scenario_revision_id) === String(
      revisionId ?? run?.scenario_revision_id ?? scenario.current_revision_id,
    ));
    if (!revision) throw new RepositoryError("run_input_stale", "The source ScenarioRevision for this run is no longer available");
    let result;
    try {
      if (mode === "branch") {
        const branch = branchScenarioEntity({
          sourceScenario: scenario,
          sourceRevision: revision,
          name: String(branchName ?? "").trim() || `${scenario.name} optimized`,
          description: `Optimization branch from Version ${revision.revision}`,
          projectId: scenario.project_id,
        });
        const applied = applyOptimizationSolution({
          scenario: branch.scenario,
          scenarioRevision: branch.revision,
          run,
          solution,
          changeSummary: "Applied a public optimization solution to a branch",
        });
        result = {
          ...applied,
          branch,
          scenario: applied.scenario,
          revision: applied.revision,
          sourceRevision: revision,
          branchRevision: branch.revision,
        };
      } else {
        result = applyOptimizationSolution({
          scenario,
          scenarioRevision: revision,
          run,
          solution,
          changeSummary: "Applied a public optimization solution as a new Version",
        });
      }
    } catch (error) {
      throw new RepositoryError("run_input_stale", error.message, { cause: error });
    }
    const project = domain.projects.find((candidate) => String(candidate.project_id) === String(scenario.project_id));
    const nextProject = project && mode === "branch"
      ? {
          ...project,
          active_scenario_id: result.scenario.scenario_id,
          scenario_ids: [...new Set([...(project.scenario_ids ?? []), result.scenario.scenario_id])],
          updated_at: new Date().toISOString(),
        }
      : project;
    const addedScenarios = mode === "branch"
      ? [...domain.scenarios, result.scenario]
      : domain.scenarios.map((candidate) => (
        candidate.scenario_id === scenario.scenario_id ? result.scenario : candidate
      ));
    const addedRevisions = mode === "branch"
      ? [...domain.scenario_revisions, result.branchRevision, result.revision]
      : [...domain.scenario_revisions, result.revision];
    const saved = await this.saveDomainWithWorkspace({
      ...domain,
      projects: nextProject ? domain.projects.map((candidate) => candidate.project_id === project.project_id ? nextProject : candidate) : domain.projects,
      scenarios: addedScenarios,
      scenario_revisions: addedRevisions.filter((candidate, index, values) => values.findIndex((item) => item.scenario_revision_id === candidate.scenario_revision_id) === index),
    });
    return { ...result, ...saved };
  }

  async saveReportDefinition(report) {
    const saved = await this.saveReportDefinitionWithWorkspace(report);
    return saved.domain;
  }

  async saveReportDefinitionWithWorkspace(report) {
    const errors = validateReportDefinition(report);
    if (errors.length > 0) throw new RepositoryError("invalid_entity", errors.join("; "));
    const domain = await this.loadDomain();
    const reports = [...domain.report_definitions];
    const index = reports.findIndex((candidate) => candidate.report_id === report?.report_id);
    if (index < 0) reports.push(cloneDomainValue(report));
    else reports[index] = cloneDomainValue(report);
    const projects = domain.projects.map((project) => project.project_id === report?.project_id
      ? { ...project, report_ids: [...new Set([...(project.report_ids ?? []), report.report_id])] }
      : project);
    return this.saveDomainWithWorkspace({ ...domain, projects, report_definitions: reports });
  }

  async getReportDefinition(reportId) {
    const domain = await this.loadDomain();
    const report = domain.report_definitions.find((candidate) => candidate.report_id === reportId);
    if (!report) throw new RepositoryError("not_found", `Report ${reportId} was not found`);
    return cloneDomainValue(report);
  }

  createProjectWorkspace(datasetRef) {
    return this.store.createProjectWorkspace(datasetRef);
  }

  createProject(name, datasetRef) {
    return this.store.createProject(name, datasetRef);
  }

  createScenario(name, snapshot, options = {}) {
    const scenario = this.store.createScenario(name, snapshot);
    const revisionId = createEntityId();
    const revision = scenarioRevisionFromLegacySnapshot({ ...scenario, domain: { revision: 1 } }, {
      scenarioId: scenario.id,
      scenarioRevisionId: revisionId,
      datasetReference: scenario.datasetRef,
      originatingRunId: options.originatingRunId ?? options.originating_run_id,
      originatingSolutionId: options.originatingSolutionId ?? options.originating_solution_id,
      changeSummary: options.changeSummary ?? options.change_summary,
      provenance: options.provenance,
    });
    return {
      ...scenario,
      domain: {
        ...(scenario.domain ?? {}),
        scenario_id: scenario.id,
        current_revision_id: revision.scenario_revision_id,
        revision: revision.revision,
        parent_revision_id: revision.parent_revision_id,
        originating_run_id: revision.originating_run_id,
        originating_solution_id: revision.originating_solution_id,
        revisions: [cloneDomainValue(revision)],
      },
    };
  }

  duplicateProjectData(project) {
    return this.store.duplicateProjectData(project);
  }

  exportProjectFile(project) {
    return this.store.exportProjectFile(project);
  }

  importProjectFile(text) {
    return this.store.importProjectFile(text);
  }

  datasetReference(meta) {
    return this.store.datasetReference(meta);
  }

  updateProjectDraft(project, draft) {
    return this.store.updateProjectDraft(project, draft);
  }

  isDatasetCompatible(project, meta) {
    return this.store.isDatasetCompatible(project, meta);
  }
}

export function createLocalRepository(options) {
  return new LocalRepository(options);
}

export function hasLocalRepositoryContract(repository) {
  return implementsRepositoryContract(repository);
}

function resolveLegacyScenarioSnapshot(domain, project, scenario) {
  const workspace = domain?.compatibility_workspace;
  const legacyProject = workspace?.projects?.find((candidate) => String(candidate.domain?.project_id ?? candidate.id) === String(project?.project_id));
  const legacyID = scenario?.metadata?.compatibility_scenario_id ?? scenario?.scenario_id;
  return legacyProject?.scenarios?.find((candidate) => String(candidate.id) === String(legacyID)
    || String(candidate.domain?.scenario_id) === String(scenario?.scenario_id))
    ?? {
      id: legacyID,
      name: scenario?.name ?? "Planning scenario",
      plan: {},
      domain: { scenario_id: scenario?.scenario_id ?? legacyID },
    };
}

function replaceLegacyScenario(workspace, project, sourceScenario, replacement) {
  const next = cloneDomainValue(workspace);
  const legacyProject = next.projects?.find((candidate) => String(candidate.domain?.project_id ?? candidate.id) === String(project?.project_id));
  if (!legacyProject) throw new RepositoryError("not_found", "The source Project workspace was not found");
  const legacyID = sourceScenario?.metadata?.compatibility_scenario_id ?? sourceScenario?.scenario_id;
  const index = legacyProject.scenarios.findIndex((candidate) => String(candidate.id) === String(legacyID)
    || String(candidate.domain?.scenario_id) === String(sourceScenario?.scenario_id));
  if (index < 0) legacyProject.scenarios.push(replacement);
  else legacyProject.scenarios[index] = replacement;
  legacyProject.activeScenarioId = replacement.id;
  legacyProject.draft = null;
  return next;
}

export default LocalRepository;
