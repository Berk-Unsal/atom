import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProjectWorkspace,
  createScenario,
  duplicateProjectData,
  exportProjectFile,
  importProjectFile,
  isDatasetCompatible,
  migrateWorkspace,
  normalizeWorkspace,
  PROJECT_SCHEMA_VERSION,
  resolveWorkspaceData,
  saveProjectWorkspace,
  updateProjectDraft,
} from "./projectStore.js";

afterEach(() => vi.unstubAllGlobals());

describe("projectStore", () => {
  it("round-trips an exported project with a new imported id", () => {
    const workspace = createProjectWorkspace({ id: "ankara", version: "1", hashes: { towers: "abc" } });
    const project = workspace.projects[0];
    project.scenarios.push(createScenario("Baseline", { summary: { networkScore: 10 } }));
    const imported = importProjectFile(exportProjectFile(project));
    expect(imported.id).not.toBe(project.id);
    expect(imported.scenarios).toHaveLength(1);
    expect(imported.scenarios[0].id).not.toBe(project.scenarios[0].id);
    expect(imported.scenarios[0].summary.networkScore).toBe(10);
  });

  it("assigns fresh nested scenario ids when duplicating a project", () => {
    const project = createProjectWorkspace().projects[0];
    const scenario = createScenario("Baseline", { plan: { settings: { rays: 60 } } });
    project.scenarios.push(scenario);
    project.activeScenarioId = scenario.id;

    const duplicate = duplicateProjectData(project);

    expect(duplicate.id).not.toBe(project.id);
    expect(duplicate.scenarios[0].id).not.toBe(scenario.id);
    expect(duplicate.activeScenarioId).toBe(duplicate.scenarios[0].id);
  });

  it("keeps an active scenario only while the autosaved draft still matches it", () => {
    const project = createProjectWorkspace().projects[0];
    const scenario = createScenario("Baseline", { plan: { settings: { rays: 60 } } });
    project.scenarios.push(scenario);
    project.activeScenarioId = scenario.id;

    const matching = updateProjectDraft(project, { plan: { settings: { rays: 60 } } });
    const changed = updateProjectDraft(matching, { plan: { settings: { rays: 120 } } });

    expect(matching.activeScenarioId).toBe(scenario.id);
    expect(changed.activeScenarioId).toBeNull();
    expect(changed.draft.requiresRerun).toBe(true);
  });

  it("rejects unsupported future schemas", () => {
    expect(() => normalizeWorkspace({ schemaVersion: PROJECT_SCHEMA_VERSION + 1, projects: [] })).toThrow(/schema/i);
  });

  it("migrates the legacy single-project envelope", () => {
    const project = createProjectWorkspace().projects[0];
    const migrated = migrateWorkspace({ project });
    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.activeProjectId).toBe(project.id);
    expect(normalizeWorkspace({ project }).projects).toHaveLength(1);
  });

  it("detects dataset version and hash drift", () => {
    const project = { datasetRef: { id: "ankara", version: "1", hashes: { towers: "abc" } } };
    expect(isDatasetCompatible(project, { dataset: { id: "ankara", version: "1", sha256: { towers: "abc" } } })).toBe(true);
    expect(isDatasetCompatible(project, { dataset: { id: "ankara", version: "2", sha256: { towers: "abc" } } })).toBe(false);
  });

  it("compares dataset hashes independently of object key order", () => {
    const project = { datasetRef: { id: "ankara", version: "1", hashes: { towers: "abc", buildings: "def" } } };
    expect(isDatasetCompatible(project, {
      dataset: { id: "ankara", version: "1", sha256: { buildings: "def", towers: "abc" } },
    })).toBe(true);
  });

  it("restores the fallback when IndexedDB has no workspace record", () => {
    const fallback = createProjectWorkspace();
    fallback.projects[0].name = "Recovered plan";

    const resolved = resolveWorkspaceData(null, JSON.stringify(fallback));

    expect(resolved.projects[0].name).toBe("Recovered plan");
  });

  it("mirrors successful IndexedDB saves to local storage", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem });
    vi.stubGlobal("indexedDB", successfulIndexedDB());
    const workspace = createProjectWorkspace();

    await saveProjectWorkspace(workspace);

    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(setItem.mock.calls[0][1]).activeProjectId).toBe(workspace.activeProjectId);
  });
});

function successfulIndexedDB() {
  return {
    open() {
      const request = {};
      const database = {
        close: vi.fn(),
        objectStoreNames: { contains: () => true },
        transaction() {
          const transaction = {
            objectStore: () => ({
              put: () => queueMicrotask(() => transaction.oncomplete?.()),
            }),
          };
          return transaction;
        },
      };
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    },
  };
}
