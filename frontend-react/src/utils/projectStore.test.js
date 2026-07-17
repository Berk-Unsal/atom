import { describe, expect, it } from "vitest";
import {
  createProjectWorkspace,
  createScenario,
  exportProjectFile,
  importProjectFile,
  isDatasetCompatible,
  migrateWorkspace,
  normalizeWorkspace,
  PROJECT_SCHEMA_VERSION,
} from "./projectStore.js";

describe("projectStore", () => {
  it("round-trips an exported project with a new imported id", () => {
    const workspace = createProjectWorkspace({ id: "ankara", version: "1", hashes: { towers: "abc" } });
    const project = workspace.projects[0];
    project.scenarios.push(createScenario("Baseline", { summary: { networkScore: 10 } }));
    const imported = importProjectFile(exportProjectFile(project));
    expect(imported.id).not.toBe(project.id);
    expect(imported.scenarios).toHaveLength(1);
    expect(imported.scenarios[0].summary.networkScore).toBe(10);
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
});
