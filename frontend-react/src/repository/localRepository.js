import * as projectStore from "../utils/projectStore.js";
import { createEntityId, cloneDomainValue } from "../domain/identifiers.js";
import { applyOptimizationSolution, scenarioRevisionFromLegacySnapshot } from "../domain/scenario.js";
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

  async applyOptimizationSolution({ projectId, scenarioId, run, solution } = {}) {
    const domain = await this.loadDomain();
    const scenario = domain.scenarios.find((candidate) => candidate.scenario_id === scenarioId
      && (!projectId || candidate.project_id === projectId));
    if (!scenario) throw new RepositoryError("run_input_stale", "The source ScenarioRevision for this run is no longer available");
    const revision = domain.scenario_revisions.find((candidate) => candidate.scenario_revision_id === scenario.current_revision_id);
    if (!revision) throw new RepositoryError("run_input_stale", "The source ScenarioRevision for this run is no longer available");
    let result;
    try {
      result = applyOptimizationSolution({ scenario, scenarioRevision: revision, run, solution });
    } catch (error) {
      throw new RepositoryError("run_input_stale", error.message, { cause: error });
    }
    const nextScenarios = domain.scenarios.map((candidate) => (
      candidate.scenario_id === scenario.scenario_id ? result.scenario : candidate
    ));
    const saved = await this.saveDomainWithWorkspace({
      ...domain,
      scenarios: nextScenarios,
      scenario_revisions: [...domain.scenario_revisions, result.revision],
    });
    return { ...result, ...saved };
  }

  async saveReportDefinition(report) {
    const domain = await this.loadDomain();
    const reports = [...domain.report_definitions];
    const index = reports.findIndex((candidate) => candidate.report_id === report?.report_id);
    if (index < 0) reports.push(cloneDomainValue(report));
    else reports[index] = cloneDomainValue(report);
    return this.saveDomain({ ...domain, report_definitions: reports });
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
        originating_run_id: revision.originating_run_id,
        originating_solution_id: revision.originating_solution_id,
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

export default LocalRepository;
