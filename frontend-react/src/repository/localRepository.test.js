import { describe, expect, it } from "vitest";
import { createProjectWorkspace, createScenario, datasetReference, duplicateProjectData, exportProjectFile, importProjectFile, isDatasetCompatible, updateProjectDraft } from "../utils/projectStore.js";
import { createRun } from "../domain/run.js";
import { createReportDefinition } from "../domain/report.js";
import * as projectStore from "../utils/projectStore.js";
import { implementsRepositoryContract } from "./contract.js";
import LocalRepository from "./localRepository.js";
import sample from "../../../examples/ankara-sample.atom-project.json";

describe("LocalRepository", () => {
  it("does not discard an in-place domain edit as unchanged", async () => {
    let workspace = createProjectWorkspace(null);
    const repository = new LocalRepository({ store: { ...projectStore,
      loadProjectWorkspace: async () => structuredClone(workspace),
      queueProjectWorkspaceSave: (next) => { workspace = structuredClone(next); return { workspace: next, saved: Promise.resolve(next) }; },
    } });
    const domain = await repository.loadDomain();
    domain.projects[0].name = "Actual in-place edit";
    await repository.saveDomain(domain);
    expect(workspace.projects[0].name).toBe("Actual in-place edit");
  });

  it.each([1, 2, 3].flatMap((schema) => ["project", "report", "version"].map((operation) => [schema, operation])))("preserves a saved schema %s Project when another Project's %s is saved", async (schema, operation) => {
      const legacy = new LocalRepository().prepareProjectFile(importProjectFile(JSON.stringify({ ...sample, schemaVersion: schema })));
      let workspace = createProjectWorkspace(null);
      const otherId = workspace.activeProjectId;
      const otherScenario = createScenario("Other Scenario", { plan: { settings: { frequencyGHz: 28 } }, request: null, summary: {}, artifacts: null });
      workspace.projects[0].scenarios.push(otherScenario);
      workspace.projects[0].activeScenarioId = otherScenario.id;
      workspace.projects.unshift(legacy);
      const repository = new LocalRepository({ store: { ...projectStore,
        loadProjectWorkspace: async () => structuredClone(workspace),
        queueProjectWorkspaceSave: (next) => { workspace = structuredClone(next); return { workspace: next, saved: Promise.resolve(next) }; },
      } });
      const before = exportProjectFile(legacy);
      const domain = await repository.loadDomain();
      const other = domain.projects.find((project) => project.project_id === otherId);
      if (operation === "project") {
        await repository.saveProject({ ...other, name: "Actual change in another Project" });
        expect(workspace.projects.find((project) => project.id === otherId).name).toBe("Actual change in another Project");
      } else if (operation === "report") {
        const report = createReportDefinition({ project_id: otherId, source_kind: "live_compatibility" });
        await repository.saveReportDefinitionWithWorkspace(report);
        expect(workspace.projects.find((project) => project.id === otherId).domain.report_definitions.map((row) => row.report_id)).toEqual([report.report_id]);
      } else {
        await repository.saveScenarioVersion({ projectId: otherId, scenarioId: otherScenario.id,
          snapshot: { name: "Other Version edit", plan: { settings: { frequencyGHz: 28, txPowerDbm: 31 } } } });
        expect(workspace.projects.find((project) => project.id === otherId).scenarios[0].domain.revision).toBe(2);
      }
      const untouched = workspace.projects.find((project) => project.id === legacy.id);
      expect(exportProjectFile(untouched)).toBe(before);
      expect(untouched.scenarios).toEqual(legacy.scenarios);
      expect(workspace.activeProjectId).toBe(otherId);
      const current = await repository.loadDomain();
      const scenario = current.scenarios.find((row) => row.project_id === legacy.id);
      await repository.saveScenario({ ...scenario, name: "Actual legacy Scenario edit" });
      const edited = workspace.projects.find((project) => project.id === legacy.id);
      expect(edited.scenarios[0].name).toBe("Actual legacy Scenario edit");
      expect(exportProjectFile(edited)).not.toBe(before);
    });

  it.each([1, 2, 3])("prepares native metadata without rewriting schema %s scenario snapshots", (schemaVersion) => {
    const project = importProjectFile(JSON.stringify({ ...sample, schemaVersion }));
    const before = structuredClone(project);
    const repository = new LocalRepository();
    const prepared = repository.prepareProjectFile(project);
    expect(prepared.scenarios).toEqual(before.scenarios);
    expect(prepared.scenarios).toBe(project.scenarios);
    expect(prepared.draft).toBe(project.draft);
    expect(prepared.activeScenarioId).toBe(project.activeScenarioId);
    expect(prepared.datasetRef).toBe(project.datasetRef);
    expect(project).toEqual(before);
    expect(repository.prepareProjectFile(prepared)).toBe(prepared);
    expect(importProjectFile(exportProjectFile(prepared)).scenarios.map(({ plan, request }) => ({ plan, request })))
      .toEqual(before.scenarios.map(({ plan, request }) => ({ plan, request })));
  });

  it("implements the domain repository contract over ProjectV2 compatibility storage", async () => {
    let workspace = createProjectWorkspace({ id: "ankara", version: "2026.07", hashes: { towers: "abc" } });
    const project = workspace.projects[0];
    const scenario = createScenario("Baseline", {
      plan: { settings: { frequencyGHz: 28 }, inventory: [{ id: "cell-1", coordinates: [1, 2] }] },
      request: { frequency_ghz: 28 },
      summary: {},
      artifacts: null,
    });
    project.scenarios.push(scenario);
    project.activeScenarioId = scenario.id;

    const store = {
      createProjectWorkspace,
      createProject: (name, datasetRef) => ({ ...createProjectWorkspace(datasetRef).projects[0], name }),
      createScenario,
      datasetReference,
      duplicateProjectData,
      exportProjectFile,
      importProjectFile,
      isDatasetCompatible,
      updateProjectDraft,
      loadProjectWorkspace: async () => structuredClone(workspace),
      queueProjectWorkspaceSave: (nextWorkspace) => {
        workspace = structuredClone(nextWorkspace);
        return { workspace: nextWorkspace, saved: Promise.resolve(nextWorkspace) };
      },
    };
    const repository = new LocalRepository({ store });
    expect(implementsRepositoryContract(repository)).toBe(true);
    const domain = await repository.loadDomain();
    const run = createRun({
      run_type: "simulation",
      project_id: domain.projects[0].project_id,
      scenario_id: domain.scenarios[0].scenario_id,
      scenario_revision_id: domain.scenario_revisions[0].scenario_revision_id,
      status: "succeeded",
      summary: { avg_rx_dbm: -80 },
    });
    await repository.saveRun(run);
    const runs = await repository.listRuns(run.scenario_revision_id);
    expect(runs.some((candidate) => candidate.run_id === run.run_id)).toBe(true);
    expect(workspace.projects[0].scenarios[0].domain.runs).toHaveLength(1);
  });

  it("applies a historical public solution as a new ScenarioRevision without mutating the source", async () => {
    let workspace = createProjectWorkspace({ id: "ankara", version: "2026.07", hashes: { towers: "abc" } });
    const project = workspace.projects[0];
    const scenario = createScenario("Baseline", {
      plan: {
        settings: { frequencyGHz: 28 },
        inventory: [{ id: "cell-1", cellId: "cell-1", coordinates: [1, 2] }],
        selectedTowerId: "cell-1",
      },
      request: { frequency_ghz: 28 },
      summary: {},
      artifacts: null,
    });
    project.scenarios.push(scenario);
    project.activeScenarioId = scenario.id;
    const store = {
      createProjectWorkspace,
      createProject: (name, datasetRef) => ({ ...createProjectWorkspace(datasetRef).projects[0], name }),
      createScenario,
      datasetReference,
      duplicateProjectData,
      exportProjectFile,
      importProjectFile,
      isDatasetCompatible,
      updateProjectDraft,
      loadProjectWorkspace: async () => structuredClone(workspace),
      queueProjectWorkspaceSave: (nextWorkspace) => {
        workspace = structuredClone(nextWorkspace);
        return { workspace: nextWorkspace, saved: Promise.resolve(nextWorkspace) };
      },
    };
    const repository = new LocalRepository({ store });
    const domain = await repository.loadDomain();
    const sourceRevision = domain.scenario_revisions[0];
    const run = { run_id: "history-run", run_type: "optimization", status: "succeeded" };
    const applied = await repository.applyOptimizationSolution({
      projectId: domain.projects[0].project_id,
      scenarioId: domain.scenarios[0].scenario_id,
      run,
      solution: { id: "pareto-a", towers: [{ id: "cell-1", optimal_azimuth: 135 }] },
    });

    expect(applied.revision.scenario_revision_id).not.toBe(sourceRevision.scenario_revision_id);
    expect(applied.revision.originating_run_id).toBe("history-run");
    expect(applied.revision.originating_solution_id).toBe("pareto-a");
    expect(sourceRevision.overrides).not.toEqual(applied.revision.overrides);
  });

  it("keeps Versions immutable while supporting branch, duplicate, and continue actions", async () => {
    const fixture = createFixtureRepository();
    const domain = await fixture.repository.loadDomain();
    const sourceScenario = domain.scenarios[0];
    const firstRevision = domain.scenario_revisions.find((revision) => revision.scenario_revision_id === sourceScenario.current_revision_id);

    const saved = await fixture.repository.saveScenarioVersion({
      changeSummary: "Tune the sector azimuth",
      projectId: domain.projects[0].project_id,
      scenarioId: sourceScenario.scenario_id,
      snapshot: {
        ...fixture.workspace.projects[0].scenarios[0],
        plan: { ...fixture.workspace.projects[0].scenarios[0].plan, networkAzimuths: { "cell-1": 120 } },
        requiresRerun: true,
      },
    });
    expect(saved.revision.revision).toBe(firstRevision.revision + 1);
    expect(saved.revision.parent_revision_id).toBe(firstRevision.scenario_revision_id);
    expect(saved.revision.change_summary).toBe("Tune the sector azimuth");

    const afterSave = await fixture.repository.loadDomain();
    expect(afterSave.scenario_revisions.filter((revision) => revision.scenario_id === sourceScenario.scenario_id)).toHaveLength(2);
    expect(afterSave.scenario_revisions.find((revision) => revision.scenario_revision_id === firstRevision.scenario_revision_id).overrides).not.toEqual(saved.revision.overrides);

    const branch = await fixture.repository.branchScenario({
      name: "Azimuth experiment",
      projectId: domain.projects[0].project_id,
      revisionId: firstRevision.scenario_revision_id,
      scenarioId: sourceScenario.scenario_id,
    });
    expect(branch.scenario.parent_scenario_id).toBe(sourceScenario.scenario_id);
    expect(branch.revision.parent_revision_id).toBe(firstRevision.scenario_revision_id);
    const branchSnapshot = branch.workspace.projects
      .find((project) => project.id === branch.workspace.activeProjectId)
      ?.scenarios.find((scenario) => scenario.domain?.scenario_id === branch.scenario.scenario_id);
    expect(branchSnapshot.domain.parent_scenario_id).toBe(sourceScenario.scenario_id);
    expect(branchSnapshot.requiresRerun).toBe(true);

    const duplicate = await fixture.repository.duplicateScenario({
      name: "Independent copy",
      projectId: domain.projects[0].project_id,
      scenarioId: sourceScenario.scenario_id,
    });
    expect(duplicate.scenario.parent_scenario_id).toBeNull();
    expect(duplicate.revision.parent_revision_id).toBeNull();
    const duplicateSnapshot = duplicate.workspace.projects
      .find((project) => project.id === duplicate.workspace.activeProjectId)
      ?.scenarios.find((scenario) => scenario.domain?.scenario_id === duplicate.scenario.scenario_id);
    expect(duplicateSnapshot.domain.parent_scenario_id).toBeNull();
    expect(duplicateSnapshot.requiresRerun).toBe(true);

    const continued = await fixture.repository.continueFromScenarioRevision({
      projectId: domain.projects[0].project_id,
      revisionId: firstRevision.scenario_revision_id,
      scenarioId: sourceScenario.scenario_id,
    });
    const draftProject = continued.workspace.projects.find((project) => project.id === continued.workspace.activeProjectId);
    expect(draftProject.activeScenarioId).toBeNull();
    expect(draftProject.draft.sourceRevisionId).toBe(firstRevision.scenario_revision_id);
    expect(draftProject.scenarios.find((scenario) => scenario.id === fixture.workspace.projects[0].scenarios[0].id).domain.revisions).toHaveLength(2);
  });

  it("applies a historical solution to a new Version or a new branch", async () => {
    const fixture = createFixtureRepository();
    const domain = await fixture.repository.loadDomain();
    const source = domain.scenarios[0];
    const sourceRevision = domain.scenario_revisions[0];
    const run = { run_id: "history-branch-run", run_type: "optimization", scenario_id: source.scenario_id, scenario_revision_id: sourceRevision.scenario_revision_id, status: "succeeded" };
    const solution = { id: "pareto-branch", towers: [{ id: "cell-1", optimal_azimuth: 180 }] };

    const branch = await fixture.repository.applyOptimizationSolution({
      mode: "branch",
      projectId: domain.projects[0].project_id,
      revisionId: sourceRevision.scenario_revision_id,
      run,
      scenarioId: source.scenario_id,
      solution,
    });

    expect(branch.scenario.parent_scenario_id).toBe(source.scenario_id);
    expect(branch.branchRevision.parent_revision_id).toBe(sourceRevision.scenario_revision_id);
    expect(branch.revision.parent_revision_id).toBe(branch.branchRevision.scenario_revision_id);
    expect(branch.revision.originating_run_id).toBe(run.run_id);

    const version = await fixture.repository.applyOptimizationSolution({
      projectId: domain.projects[0].project_id,
      revisionId: sourceRevision.scenario_revision_id,
      run,
      scenarioId: source.scenario_id,
      solution: { id: "pareto-version", towers: [{ id: "cell-1", optimal_azimuth: 200 }] },
    });
    expect(version.scenario.scenario_id).toBe(source.scenario_id);
    expect(version.revision.parent_revision_id).toBe(sourceRevision.scenario_revision_id);
    expect(version.revision.originating_solution_id).toBe("pareto-version");
  });

  it("records a bound source Run in Version metadata without claiming it as the originating Run", async () => {
    const { repository } = createFixtureRepository();
    const snapshot = { plan: { settings: { frequencyGHz: 28 }, inventory: [{ id: "cell-1", coordinates: [1, 2] }] }, request: { frequency_ghz: 28 }, summary: {}, artifacts: null };
    const bound = repository.createScenario("Sector plan 1", snapshot, { sourceRunId: "draft-run-1" });
    expect(bound.domain.revisions[0].metadata.source_run_id).toBe("draft-run-1");
    expect(bound.domain.revisions[0].originating_run_id).toBeNull();
    expect(repository.createScenario("Sector plan 2", snapshot).domain.revisions[0].metadata.source_run_id).toBeUndefined();

    const domain = await repository.loadDomain();
    const saved = await repository.saveScenarioVersion({
      projectId: domain.projects[0].project_id,
      scenarioId: domain.scenarios[0].scenario_id,
      snapshot,
      sourceRunId: "draft-run-2",
    });
    expect(saved.revision.metadata.source_run_id).toBe("draft-run-2");
    expect(saved.revision.originating_run_id).toBeNull();
  });
});

function createFixtureRepository() {
  let workspace = createProjectWorkspace({ id: "ankara", version: "2026.07", hashes: { towers: "abc" } });
  const project = workspace.projects[0];
  const scenario = createScenario("Baseline", {
    plan: {
      settings: { frequencyGHz: 28 },
      inventory: [{ id: "cell-1", cellId: "cell-1", coordinates: [1, 2] }],
      selectedTowerId: "cell-1",
    },
    request: { frequency_ghz: 28 },
    summary: {},
    artifacts: null,
  });
  project.scenarios.push(scenario);
  project.activeScenarioId = scenario.id;
  const store = {
    createProjectWorkspace,
    createProject: (name, datasetRef) => ({ ...createProjectWorkspace(datasetRef).projects[0], name }),
    createScenario,
    datasetReference,
    duplicateProjectData,
    exportProjectFile,
    importProjectFile,
    isDatasetCompatible,
    updateProjectDraft,
    loadProjectWorkspace: async () => structuredClone(workspace),
    queueProjectWorkspaceSave: (nextWorkspace) => {
      workspace = structuredClone(nextWorkspace);
      return { workspace: nextWorkspace, saved: Promise.resolve(nextWorkspace) };
    },
  };
  return { get workspace() { return workspace; }, repository: new LocalRepository({ store }) };
}
