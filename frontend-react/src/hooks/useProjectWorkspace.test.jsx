import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({ snapshots: [] }));

vi.mock("../utils/projectStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadProjectWorkspace: vi.fn(async (datasetRef) => actual.createProjectWorkspace(datasetRef)),
    queueProjectWorkspaceSave: vi.fn((workspace) => {
      persistence.snapshots.push(structuredClone(workspace));
      return { workspace, saved: Promise.resolve(workspace) };
    }),
  };
});

import useProjectWorkspace from "./useProjectWorkspace.js";

afterEach(() => {
  persistence.snapshots.length = 0;
});

describe("useProjectWorkspace", () => {
  it("applies rapid commits to the latest synchronous workspace", async () => {
    const { result } = renderHook(() => useProjectWorkspace(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      result.current.renameProject("First edit");
      result.current.renameProject("Second edit");
      await Promise.resolve();
    });

    expect(persistence.snapshots.map((workspace) => workspace.projects[0].name))
      .toEqual(["First edit", "Second edit"]);
    expect(result.current.activeProject.name).toBe("Second edit");
  });

  it("reports local persistence and restores an undone scenario in place", async () => {
    const { result } = renderHook(() => useProjectWorkspace(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.renameProject("Persistence check"));
    expect(result.current.persistenceState).toBe("saving");
    await waitFor(() => expect(result.current.persistenceState).toBe("saved"));

    let scenario;
    await act(async () => {
      scenario = await result.current.saveScenario("Baseline", { plan: {}, summary: {} });
    });
    expect(result.current.activeProject.scenarios).toHaveLength(1);

    act(() => result.current.deleteScenario(scenario.id));
    expect(result.current.activeProject.scenarios).toHaveLength(0);
    act(() => result.current.restoreScenario(scenario, 0, true));
    expect(result.current.activeProject.scenarios[0].name).toBe("Baseline");
    expect(result.current.activeProject.activeScenarioId).toBe(scenario.id);
  });
});
