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

  it("loads the newest revision instead of always preferring IndexedDB", () => {
    const indexed = createProjectWorkspace();
    indexed.persistence = { revision: 7, committedAt: "2026-07-29T08:00:00.000Z" };
    indexed.projects[0].name = "Indexed plan";
    const fallback = structuredClone(indexed);
    fallback.persistence = { revision: 8, committedAt: "2026-07-29T08:01:00.000Z" };
    fallback.projects[0].name = "Newer fallback plan";

    const resolved = resolveWorkspaceData(indexed, JSON.stringify(fallback));

    expect(resolved.projects[0].name).toBe("Newer fallback plan");
  });

  it("uses content timestamps to arbitrate legacy copies without revisions", () => {
    const indexed = createProjectWorkspace();
    delete indexed.persistence;
    indexed.projects[0].name = "Older legacy plan";
    indexed.projects[0].updatedAt = "2026-07-29T08:00:00.000Z";
    const fallback = structuredClone(indexed);
    fallback.projects[0].name = "Newer legacy plan";
    fallback.projects[0].updatedAt = "2026-07-29T08:01:00.000Z";

    const resolved = resolveWorkspaceData(indexed, JSON.stringify(fallback));

    expect(resolved.projects[0].name).toBe("Newer legacy plan");
  });

  it("writes successful saves only to IndexedDB and removes an older fallback", async () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    const fallback = createProjectWorkspace();
    fallback.persistence = { revision: 1, committedAt: "2026-07-29T08:00:00.000Z" };
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(fallback), removeItem, setItem });
    const indexedDB = controlledIndexedDB();
    vi.stubGlobal("indexedDB", indexedDB);
    const workspace = createProjectWorkspace();

    const saved = await saveProjectWorkspace(workspace);

    expect(indexedDB.state.writes).toHaveLength(1);
    expect(indexedDB.state.writes[0].persistence.revision).toBe(saved.persistence.revision);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledOnce();
  });

  it("does not remove a fallback that is newer than a successful IndexedDB save", async () => {
    const fallback = createProjectWorkspace();
    fallback.persistence = {
      revision: Number.MAX_SAFE_INTEGER,
      committedAt: "2026-07-29T08:02:00.000Z",
    };
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(fallback),
      removeItem,
      setItem: vi.fn(),
    });
    vi.stubGlobal("indexedDB", controlledIndexedDB());

    await saveProjectWorkspace(createProjectWorkspace());

    expect(removeItem).not.toHaveBeenCalled();
  });

  it("uses local storage only when the IndexedDB write fails", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), removeItem: vi.fn(), setItem });
    vi.stubGlobal("indexedDB", controlledIndexedDB({ failWrites: true }));

    const saved = await saveProjectWorkspace(createProjectWorkspace());

    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(setItem.mock.calls[0][1]).persistence.revision).toBe(saved.persistence.revision);
  });

  it("reports a save failure when neither storage backend accepts the payload", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: () => { throw new Error("quota exceeded"); },
    });
    vi.stubGlobal("indexedDB", controlledIndexedDB({ failWrites: true }));

    await expect(saveProjectWorkspace(createProjectWorkspace())).rejects.toThrow(/could not be saved/i);
  });

  it("serializes rapid saves and leaves the newest workspace in IndexedDB", async () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(), removeItem: vi.fn(), setItem: vi.fn() });
    const indexedDB = controlledIndexedDB({ writeDelay: 5 });
    vi.stubGlobal("indexedDB", indexedDB);
    const first = createProjectWorkspace();
    first.projects[0].name = "First edit";
    const second = structuredClone(first);
    second.projects[0].name = "Second edit";

    const [firstSaved, secondSaved] = await Promise.all([
      saveProjectWorkspace(first),
      saveProjectWorkspace(second),
    ]);

    expect(indexedDB.state.maxActiveWrites).toBe(1);
    expect(indexedDB.state.writes.map((workspace) => workspace.projects[0].name))
      .toEqual(["First edit", "Second edit"]);
    expect(secondSaved.persistence.revision).toBeGreaterThan(firstSaved.persistence.revision);
  });

  it("removes duplicate recommendation properties from persisted scenario artifacts", async () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(), removeItem: vi.fn(), setItem: vi.fn() });
    const indexedDB = controlledIndexedDB();
    vi.stubGlobal("indexedDB", indexedDB);
    const workspace = createProjectWorkspace();
    const recommendation = {
      id: "LTE-3",
      cell_id: 3,
      marginal_network_score: 120,
      reason: "adds demand",
    };
    workspace.projects[0].scenarios.push(createScenario("Candidates", {
      artifacts: {
        siteRecommendations: {
          recommendations: [recommendation],
          geojson: {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: recommendation,
              geometry: { type: "Point", coordinates: [32.85, 39.92] },
            }],
          },
        },
      },
    }));

    await saveProjectWorkspace(workspace);

    const persisted = indexedDB.state.writes[0].projects[0].scenarios[0]
      .artifacts.siteRecommendations;
    expect(persisted.geojson.features[0]).toMatchObject({ id: "LTE-3", properties: {} });
    expect(JSON.stringify(persisted).match(/marginal_network_score/g)).toHaveLength(1);
  });
});

function controlledIndexedDB({ failWrites = false, writeDelay = 0 } = {}) {
  const state = { activeWrites: 0, maxActiveWrites: 0, writes: [] };
  return {
    state,
    open() {
      const request = {};
      const database = {
        close: vi.fn(),
        objectStoreNames: { contains: () => true },
        transaction() {
          const transaction = {
            objectStore: () => ({
              put: (workspace) => {
                state.activeWrites += 1;
                state.maxActiveWrites = Math.max(state.maxActiveWrites, state.activeWrites);
                setTimeout(() => {
                  state.activeWrites -= 1;
                  if (failWrites) {
                    transaction.error = new Error("IndexedDB write failed");
                    transaction.onerror?.();
                    return;
                  }
                  state.writes.push(structuredClone(workspace));
                  transaction.oncomplete?.();
                }, writeDelay);
              },
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
