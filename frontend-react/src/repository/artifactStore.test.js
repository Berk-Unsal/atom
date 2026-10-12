import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeneratedReportArtifact } from "../domain/report.js";
import { LocalArtifactStore } from "./artifactStore.js";

afterEach(() => vi.unstubAllGlobals());

describe("LocalArtifactStore", () => {
  it("keeps metadata and bytes in a separate additive database and verifies SHA-256 on reload", async () => {
    const indexedDB = memoryIndexedDB();
    const first = new LocalArtifactStore({ indexedDB, databaseName: "artifacts-test" });
    const metadata = baseMetadata({ artifact_id: "artifact-a", project_id: "project-1" });
    const saved = await first.putArtifact(metadata, "report body");

    expect(saved.artifact_id).not.toBe(saved.content_hash);
    expect(saved.content_hash).toBe("fc54daf6865cec6354a8ada602faade2a408b3acbe4d2357274d21f7cd0cb9e1");
    expect(saved.byte_size).toBe(new TextEncoder().encode("report body").byteLength);
    expect(saved.storage_reference).toContain("indexeddb://artifacts-test/bytes/artifact-a");
    expect(saved.provenance.report_manifest.artifact_content_hash).toBe(saved.content_hash);

    const second = new LocalArtifactStore({ indexedDB, databaseName: "artifacts-test" });
    const loaded = await second.getArtifact("artifact-a");
    expect(new TextDecoder().decode(loaded.bytes)).toBe("report body");
    expect(loaded.metadata.content_hash).toBe(saved.content_hash);
  });

  it("lists metadata without hydrating artifact bytes", async () => {
    const indexedDB = memoryIndexedDB();
    const store = new LocalArtifactStore({ indexedDB });
    await store.putArtifact(baseMetadata({ artifact_id: "artifact-list" }), "large enough to retain");
    indexedDB.state.byteReads = 0;

    const listed = await store.listArtifacts({ project_id: "project-1" });

    expect(listed).toHaveLength(1);
    expect(listed[0].artifact_id).toBe("artifact-list");
    expect(indexedDB.state.byteReads).toBe(0);
  });

  it("isolates missing bytes and corruption without breaking metadata listing", async () => {
    const indexedDB = memoryIndexedDB();
    const store = new LocalArtifactStore({ indexedDB });
    await store.putArtifact(baseMetadata({ artifact_id: "missing" }), "missing bytes");
    await store.putArtifact(baseMetadata({ artifact_id: "corrupt" }), "corrupt bytes");
    indexedDB.state.stores.bytes.delete("missing");
    const corruptRecord = indexedDB.state.stores.bytes.get("corrupt");
    corruptRecord.bytes[0] ^= 0xff;

    await expect(store.getArtifact("missing")).rejects.toMatchObject({ code: "artifact_missing_bytes" });
    await expect(store.getArtifact("corrupt")).rejects.toMatchObject({ code: "artifact_corrupt" });
    expect((await store.getArtifactMetadata("missing")).availability).toBe("missing");
    expect((await store.getArtifactMetadata("corrupt")).availability).toBe("corrupt");
    expect((await store.listArtifacts()).map((artifact) => artifact.artifact_id)).toEqual(expect.arrayContaining(["missing", "corrupt"]));
  });

  it("deletes only artifact evidence and supports project cleanup", async () => {
    const indexedDB = memoryIndexedDB();
    const store = new LocalArtifactStore({ indexedDB });
    await store.putArtifact(baseMetadata({ artifact_id: "project-a", project_id: "project-a" }), "a");
    await store.putArtifact(baseMetadata({ artifact_id: "project-b", project_id: "project-b" }), "b");

    expect(await store.deleteProjectArtifacts("project-a")).toBe(1);
    expect(await store.hasArtifact("project-a")).toBe(false);
    expect(await store.hasArtifact("project-b")).toBe(true);
    await store.deleteArtifact("project-b");
    expect(await store.listArtifacts()).toHaveLength(0);
  });

  it("fails explicitly when local storage is unavailable", async () => {
    const store = new LocalArtifactStore({ indexedDB: undefined });
    await expect(store.putArtifact(baseMetadata(), "offline")).rejects.toMatchObject({ code: "artifact_storage_unavailable" });
  });
});

function baseMetadata(overrides = {}) {
  return createGeneratedReportArtifact({
    artifact_id: "artifact-default",
    report_id: "report-1",
    project_id: "project-1",
    scenario_id: "scenario-1",
    scenario_revision_id: "revision-1",
    run_ids: ["run-1"],
    format: "markdown",
    provenance: { report_manifest: { run_ids: ["run-1"] } },
    ...overrides,
  });
}

function memoryIndexedDB() {
  const state = {
    stores: { metadata: new Map(), bytes: new Map() },
    byteReads: 0,
  };
  const database = {
    close: vi.fn(),
    objectStoreNames: { contains: (name) => Boolean(state.stores[name]) },
    createObjectStore: (name) => {
      state.stores[name] ??= new Map();
      return {};
    },
    transaction: (_names) => {
      const transaction = { error: null, pending: 0, objectStore: (name) => createObjectStore(transaction, state, name) };
      return transaction;
    },
  };
  return {
    state,
    open: () => {
      const request = { result: database };
      if (!state.stores.metadata || !state.stores.bytes) queueMicrotask(() => request.onupgradeneeded?.());
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
}

function createObjectStore(transaction, state, name) {
  const store = state.stores[name] ?? (state.stores[name] = new Map());
  const complete = (callback) => {
    transaction.pending += 1;
    queueMicrotask(() => {
      callback();
      transaction.pending -= 1;
      if (transaction.pending === 0) transaction.oncomplete?.();
    });
  };
  return {
    delete: (key) => complete(() => store.delete(key)),
    get: (key) => {
      const request = { result: undefined };
      complete(() => {
        if (name === "bytes") state.byteReads += 1;
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
    put: (value, key) => complete(() => store.set(key, value)),
  };
}
