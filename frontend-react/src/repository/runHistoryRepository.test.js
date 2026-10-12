import { afterEach, describe, expect, it, vi } from "vitest";
import { createRun, transitionRun } from "../domain/run.js";
import { prepareRunEnvelope, runRecordByteSize } from "../domain/runHistorySerialization.js";
import LocalRunHistoryRepository from "./runHistoryRepository.js";

afterEach(() => vi.unstubAllGlobals());

describe("LocalRunHistoryRepository", () => {
  it("persists an additive envelope and reloads it from a new repository instance", async () => {
    const indexedDB = memoryIndexedDB();
    const run = createRun({ run_id: "run-1", project_id: "project-1", created_at: "2026-09-21T10:00:00.000Z" });
    const first = new LocalRunHistoryRepository({ indexedDB });
    await first.saveRun(run);

    const second = new LocalRunHistoryRepository({ indexedDB });
    const loaded = await second.listRuns({ project_id: "project-1" });

    expect(loaded).toHaveLength(1);
    expect(loaded[0].run_id).toBe("run-1");
    expect(indexedDB.state.store.get("run-1")).toMatchObject({ storage_schema_version: 1, run: { run_id: "run-1" } });
  });

  it("filters by project, scenario, type, status, and returns newest first deterministically", async () => {
    const repository = new LocalRunHistoryRepository({ indexedDB: memoryIndexedDB() });
    await repository.saveRun(createRun({ run_id: "run-a", project_id: "p", scenario_id: "s", scenario_revision_id: "revision-a", run_type: "simulation", status: "succeeded", created_at: "2026-09-21T10:00:00.000Z" }));
    await repository.saveRun(createRun({ run_id: "run-b", project_id: "p", scenario_id: "s", run_type: "optimization", status: "failed", error: { code: "compute_failed", message: "fixture" }, created_at: "2026-09-21T11:00:00.000Z" }));
    await repository.saveRun(createRun({ run_id: "run-c", project_id: "other", scenario_id: "s", run_type: "simulation", status: "succeeded", created_at: "2026-09-21T12:00:00.000Z" }));

    const filtered = await repository.listRuns({ project_id: "p", scenario_id: "s", run_type: "optimization", status: "failed" });
    expect(filtered.map((run) => run.run_id)).toEqual(["run-b"]);
    expect((await repository.listRuns({ scenario_revision_id: "revision-a" })).map((run) => run.run_id)).toEqual(["run-a"]);
    expect((await repository.listRuns({ project_id: "p" })).map((run) => run.run_id)).toEqual(["run-b", "run-a"]);
  });

  it("keeps separate durable identities for repeated identical inputs", async () => {
    const repository = new LocalRunHistoryRepository({ indexedDB: memoryIndexedDB() });
    const input = { rays: 72, frequency_ghz: 28, radius_m: 400 };
    await repository.saveRun(createRun({ run_id: "repeat-1", project_id: "p", canonical_input_snapshot: { request: input } }));
    await repository.saveRun(createRun({ run_id: "repeat-2", project_id: "p", canonical_input_snapshot: { request: input } }));

    const runs = await repository.listRuns({ project_id: "p" });

    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((run) => run.run_id))).toEqual(new Set(["repeat-1", "repeat-2"]));
    expect(runs[0].canonical_input_snapshot.request).toEqual(runs[1].canonical_input_snapshot.request);
  });

  it("allows lifecycle updates but rejects terminal input and identity changes", async () => {
    const repository = new LocalRunHistoryRepository({ indexedDB: memoryIndexedDB() });
    const queued = createRun({ run_id: "run-immutable", project_id: "p", canonical_input_snapshot: { request: { rays: 72 } } });
    await repository.saveRun(queued);
    const running = transitionRun(queued, "running");
    await repository.saveRun(running);
    const succeeded = transitionRun(running, "succeeded", { summary: { score: 3 } });
    await repository.saveRun(succeeded);
    await expect(repository.updateRunLifecycle("run-immutable", { warnings: ["late warning"] })).resolves.toMatchObject({ status: "succeeded" });
    await expect(repository.saveRun({ ...succeeded, canonical_input_snapshot: { request: { rays: 120 } } })).rejects.toMatchObject({ code: "run_invalid" });
  });

  it("recovers queued and running records as interrupted failures", async () => {
    const repository = new LocalRunHistoryRepository({ indexedDB: memoryIndexedDB() });
    const queued = createRun({ run_id: "run-queued", status: "queued" });
    const running = transitionRun(createRun({ run_id: "run-running" }), "running");
    await repository.saveRun(queued);
    await repository.saveRun(running);

    const recovered = await new LocalRunHistoryRepository({ indexedDB: repository.indexedDB }).listRuns();

    expect(recovered.every((run) => run.status === "failed")).toBe(true);
    expect(recovered.map((run) => run.error.code).sort()).toEqual(["run_interrupted", "run_interrupted"]);
  });

  it("skips malformed records while loading valid records and exposes structured issues", async () => {
    const indexedDB = memoryIndexedDB();
    const repository = new LocalRunHistoryRepository({ indexedDB });
    await repository.saveRun(createRun({ run_id: "valid" }));
    indexedDB.state.store.set("bad", { storage_schema_version: 99, run: { run_id: "bad" } });

    const runs = await repository.listRuns();

    expect(runs.map((run) => run.run_id)).toEqual(["valid"]);
    expect(repository.getIssues()).toEqual(expect.arrayContaining([expect.objectContaining({ code: "run_invalid" })]));
  });

  it("strips forbidden large result fields but retains scalar RF request inputs", async () => {
    const repository = new LocalRunHistoryRepository({ indexedDB: memoryIndexedDB() });
    const run = createRun({
      run_id: "compact",
      canonical_input_snapshot: { request: { rays: 72, radius_m: 400 } },
      details: { result_summary: { geojson: { features: Array.from({ length: 100 }, () => ({ value: "large" })) }, stats: { score: 1 } } },
    });
    await repository.saveRun(run);
    const saved = await repository.getRun("compact");

    expect(saved.canonical_input_snapshot.request.rays).toBe(72);
    expect(saved.details.result_summary.geojson).toBeUndefined();
    expect(runRecordByteSize(saved)).toBeLessThan(512 * 1024);
  });

  it("requires explicit references to be absent before deletion and supports count", async () => {
    const repository = new LocalRunHistoryRepository({ indexedDB: memoryIndexedDB() });
    await repository.saveRun(createRun({ run_id: "delete-me", project_id: "p" }));
    await expect(repository.deleteRun("delete-me", { references: [{ type: "scenario_revision", id: "revision-1" }] })).rejects.toMatchObject({ code: "run_referenced" });
    expect(await repository.countRuns({ project_id: "p" })).toBe(1);
    await repository.deleteRun("delete-me");
    await expect(repository.getRun("delete-me")).rejects.toMatchObject({ code: "run_not_found" });
  });

  it("reports storage unavailability without touching localStorage", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    const repository = new LocalRunHistoryRepository({ indexedDB: undefined });

    await expect(repository.saveRun(createRun({ run_id: "offline" }))).rejects.toMatchObject({ code: "run_storage_unavailable" });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("lists a thousand compact records with deterministic ordering", async () => {
    const indexedDB = memoryIndexedDB();
    const repository = new LocalRunHistoryRepository({ indexedDB });
    for (let index = 0; index < 1000; index += 1) {
      const run = createRun({
        run_id: `bulk-${index}`,
        project_id: "bulk-project",
        created_at: `2026-09-21T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`,
      });
      indexedDB.state.store.set(run.run_id, prepareRunEnvelope(run));
    }
    const started = performance.now();
    const runs = await repository.listRuns({ project_id: "bulk-project", limit: 1000 });
    const elapsed = performance.now() - started;

    expect(runs).toHaveLength(1000);
    expect(runs[0].created_at >= runs.at(-1).created_at).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});

function memoryIndexedDB() {
  const state = { store: new Map() };
  const database = {
    close: vi.fn(),
    objectStoreNames: { contains: () => true },
    transaction: (_storeName, _mode) => {
      const transaction = { error: null, objectStore: () => createObjectStore(transaction, state.store) };
      return transaction;
    },
  };
  return {
    state,
    open: () => {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
}

function createObjectStore(transaction, store) {
  const complete = (callback) => queueMicrotask(() => {
    callback();
    transaction.oncomplete?.();
  });
  return {
    delete: (key) => complete(() => store.delete(key)),
    get: (key) => {
      const request = { result: undefined };
      complete(() => {
        request.result = store.get(key);
        request.onsuccess?.();
      });
      return request;
    },
    getAll: () => {
      const request = { result: [] };
      complete(() => {
        request.result = [...store.values()];
        request.onsuccess?.();
      });
      return request;
    },
    put: (value, key) => complete(() => store.set(key, structuredClone(value))),
  };
}
