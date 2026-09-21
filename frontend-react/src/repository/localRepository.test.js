import { describe, expect, it } from "vitest";
import { createProjectWorkspace, createScenario, datasetReference, duplicateProjectData, exportProjectFile, importProjectFile, isDatasetCompatible, updateProjectDraft } from "../utils/projectStore.js";
import { createRun } from "../domain/run.js";
import { implementsRepositoryContract } from "./contract.js";
import LocalRepository from "./localRepository.js";

describe("LocalRepository", () => {
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
});
