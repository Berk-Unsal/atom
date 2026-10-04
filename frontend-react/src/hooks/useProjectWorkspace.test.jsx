import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({ snapshots: [], ledger: [], revision: 0,
  queue: Promise.resolve(), durable: null, hold: null, failNext: false }));

vi.mock("../utils/projectStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadProjectWorkspace: vi.fn(async (datasetRef) => actual.createProjectWorkspace(datasetRef)),
    queueProjectWorkspaceSave: vi.fn((workspace) => {
      const next = structuredClone({ ...workspace, persistence: { revision: ++persistence.revision } });
      const hold = persistence.hold;
      persistence.hold = null;
      const fail = persistence.failNext;
      persistence.failNext = false;
      const event = (name) => persistence.ledger.push({ event: name, timestamp: Date.now(),
        revision: next.persistence.revision, scenarioId: next.projects[0].activeScenarioId });
      persistence.snapshots.push(next);
      event("queued");
      const saved = persistence.queue.catch(() => undefined).then(async () => {
        event("write-start");
        if (hold) await hold;
        if (fail) throw new Error("quota exceeded");
        persistence.durable = next;
        event("write-complete");
        return next;
      });
      persistence.queue = saved;
      return { workspace: next, saved };
    }),
  };
});

import useProjectWorkspace from "./useProjectWorkspace.js";
import LocalRepository from "../repository/localRepository.js";

afterEach(() => {
  persistence.snapshots.length = 0;
  persistence.ledger.length = 0;
  persistence.durable = null;
  persistence.queue = Promise.resolve();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useProjectWorkspace", () => {
  it("preserves new Version history when a newer autosave queued the previous Scenario", async () => {
    const { result } = renderHook(() => useProjectWorkspace(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let scenario;
    const plan = { settings: { power: 30 } };
    await act(async () => { scenario = await result.current.saveScenario("Version race", { plan }); });
    const repositoryWorkspace = structuredClone(result.current.workspace);
    repositoryWorkspace.persistence.revision += 1;
    repositoryWorkspace.projects[0].scenarios[0].domain.revision = 2;
    repositoryWorkspace.projects[0].scenarios[0].domain.revisions.push({
      ...scenario.domain.revisions[0], scenario_revision_id: "version-2", revision: 2,
    });
    let release;
    vi.spyOn(LocalRepository.prototype, "saveScenarioVersion").mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ workspace: repositoryWorkspace });
    }));
    let savingVersion;
    act(() => { savingVersion = result.current.saveScenarioVersion({ scenarioId: scenario.id }); });
    // Reserve the repository's write revision, then queue an older Scenario
    // through autosave at a newer revision while the repository is pending.
    persistence.revision += 1;
    await act(async () => { result.current.saveDraft({ plan: { settings: { power: 31 } } }); await persistence.queue; });
    await act(async () => { release(); await savingVersion; });
    const durable = persistence.durable.projects[0];
    expect(durable.scenarios[0].domain.revisions).toHaveLength(2);
    expect(durable.draft.plan.settings.power).toBe(31);
    expect(durable.activeScenarioId).toBeNull();
    expect(result.current.activeProject.scenarios[0].domain.revisions).toHaveLength(2);
  });
  for (const delay of [0, 100, 750, "confirmed"]) {
    for (const autosave of ["none", "pending", "completed"]) {
      it(`durably restores captured Undo (${delay} ms, autosave ${autosave}) in write order`, async () => {
        const { result } = renderHook(() => useProjectWorkspace(null));
        await waitFor(() => expect(result.current.loaded).toBe(true));
        let scenario;
        const plan = { planningMode: "network", selectedNetworkTowerIds: ["6", "1", "5", "2", "4", "3"],
          selectedTowerId: "5", selectedMapCellId: "3" };
        await act(async () => { scenario = await result.current.saveScenario("Six", { plan, request: { scenario_fingerprint: "same" } }); });
        const undo = result.current.restoreScenario;
        vi.useFakeTimers();
        let release;
        if (autosave === "pending" || delay !== "confirmed") {
          persistence.hold = new Promise((resolve) => { release = resolve; });
        }
        if (autosave !== "none") {
          act(() => { result.current.saveDraft({ plan }); });
          if (autosave === "completed") await act(async () => { release?.(); await persistence.queue; });
        }
        act(() => { result.current.deleteScenario(scenario.id); });
        if (delay === "confirmed") await act(async () => { release?.(); await persistence.queue; });
        else await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
        let restored;
        act(() => { restored = undo(scenario, 0, true); });
        expect(result.current.activeProject.scenarios).toEqual([scenario]);
        await act(async () => { release?.(); await restored; });
        const durable = persistence.durable.projects[0];
        expect(durable.scenarios).toEqual([scenario]);
        expect(durable.activeScenarioId).toBe(scenario.id);
        expect(durable.draft).toBeNull();
        expect(durable.scenarios[0].domain).toEqual(scenario.domain);
        const writes = persistence.ledger.filter((entry) => entry.event === "write-complete");
        expect(writes.at(-1).scenarioId).toBe(scenario.id);
        expect(writes.map((entry) => entry.revision)).toEqual([...writes.map((entry) => entry.revision)].sort((a, b) => a - b));
        expect(result.current.persistenceState).toBe("saved");
      });
    }
  }

  it("keeps deletion durable without Undo and handles repeated captured restore without duplicates", async () => {
    const { result } = renderHook(() => useProjectWorkspace(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let scenario;
    await act(async () => { scenario = await result.current.saveScenario("Repeated", { plan: {} }); });
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const undo = result.current.restoreScenario;
      await act(async () => { result.current.deleteScenario(scenario.id); await persistence.queue; });
      expect(persistence.durable.projects[0].scenarios).toHaveLength(0);
      await act(async () => { await undo(scenario, 0, true); await undo(scenario, 0, true); });
      expect(persistence.durable.projects[0].scenarios).toEqual([scenario]);
    }
  });

  it("keeps the restored in-memory Scenario and reports failure when Undo storage is rejected", async () => {
    const { result } = renderHook(() => useProjectWorkspace(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let scenario;
    await act(async () => { scenario = await result.current.saveScenario("Quota", { plan: {} }); });
    const undo = result.current.restoreScenario;
    await act(async () => { result.current.deleteScenario(scenario.id); await persistence.queue; });
    persistence.failNext = true;
    await act(async () => { await expect(undo(scenario, 0, true)).rejects.toThrow(/quota/); });
    expect(result.current.activeProject.scenarios).toEqual([scenario]);
    expect(result.current.persistenceState).toBe("error");
    expect(result.current.error).toMatch(/quota/);
    expect(persistence.durable.projects[0].scenarios).toHaveLength(0);
  });

  it("rejects a malformed import before changing the existing workspace", async () => {
    const { result } = renderHook(() => useProjectWorkspace(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const before = result.current.workspace;
    expect(() => result.current.importProject("{")).toThrow(/valid JSON/i);
    expect(result.current.workspace).toBe(before);
    expect(persistence.snapshots).toHaveLength(0);
  });
  it("persists Undo through the callback captured before deleting the Scenario", async () => {
    const { result } = renderHook(() => useProjectWorkspace(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let scenario;
    await act(async () => {
      scenario = await result.current.saveScenario("Six Cells", {
        plan: { planningMode: "network", selectedNetworkTowerIds: ["1", "2", "3", "4", "5", "6"] },
      });
    });
    const undo = result.current.restoreScenario;
    act(() => result.current.deleteScenario(scenario.id));
    await act(async () => { await undo(scenario, 0, true); });
    expect(result.current.activeProject.scenarios).toEqual([scenario]);
    expect(persistence.snapshots.at(-1).projects[0].activeScenarioId).toBe(scenario.id);
  });
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
    await act(async () => { await result.current.restoreScenario(scenario, 0, true); });
    expect(result.current.activeProject.scenarios[0].name).toBe("Baseline");
    expect(result.current.activeProject.activeScenarioId).toBe(scenario.id);
  });
});
