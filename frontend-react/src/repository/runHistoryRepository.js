import { cloneDomainValue } from "../domain/identifiers.js";
import { parseRunEnvelope, prepareRunEnvelope, immutableRunEqual } from "../domain/runHistorySerialization.js";
import { transitionRun } from "../domain/run.js";
import { normalizeRepositoryError, RepositoryError } from "./errors.js";

export const RUN_HISTORY_DATABASE_NAME = "atom-run-history";
export const RUN_HISTORY_OBJECT_STORE_NAME = "runs";
export const RUN_HISTORY_DATABASE_VERSION = 1;

export class LocalRunHistoryRepository {
  constructor({
    databaseName = RUN_HISTORY_DATABASE_NAME,
    indexedDB = globalThis.indexedDB,
    now = () => new Date().toISOString(),
    objectStoreName = RUN_HISTORY_OBJECT_STORE_NAME,
  } = {}) {
    this.databaseName = databaseName;
    this.indexedDB = indexedDB;
    this.now = now;
    this.objectStoreName = objectStoreName;
    this.lastIssues = [];
    this.recoveryPromise = null;
  }

  async listRuns(query = {}) {
    await this.recoverInterruptedRuns();
    const records = await this.readAllRecords();
    const runs = [];
    const issues = [...this.lastIssues];
    for (const record of records) {
      try {
        const run = parseRunEnvelope(record.value);
        if (matchesRunQuery(run, query)) runs.push(run);
      } catch (error) {
        issues.push(issueForRecord(record.key, error));
      }
    }
    this.lastIssues = issues;
    runs.sort(compareRunsNewestFirst);
    const offset = Math.max(0, Number(query.offset ?? 0) || 0);
    const limit = Number(query.limit);
    return runs.slice(offset, Number.isFinite(limit) && limit >= 0 ? offset + limit : undefined).map(cloneDomainValue);
  }

  async getRun(runId) {
    await this.recoverInterruptedRuns();
    const record = await this.readRecord(runId);
    if (!record) throw new RepositoryError("run_not_found", `Run ${runId} was not found`);
    try {
      return parseRunEnvelope(record);
    } catch (error) {
      const issue = issueForRecord(runId, error);
      this.lastIssues = [...this.lastIssues, issue];
      throw new RepositoryError("run_invalid", issue.message, { cause: error, details: issue });
    }
  }

  async saveRun(run) {
    await this.recoverInterruptedRuns();
    let envelope;
    try {
      envelope = prepareRunEnvelope(run);
    } catch (error) {
      throw new RepositoryError("run_invalid", error.message, { cause: error });
    }
    const existingRecord = await this.readRecord(run.run_id);
    if (existingRecord) {
      let existing;
      try {
        existing = parseRunEnvelope(existingRecord);
      } catch (error) {
        throw new RepositoryError("run_invalid", `Run ${run.run_id} cannot be updated because its stored record is invalid`, { cause: error });
      }
      if (isTerminal(existing.status) && !immutableRunEqual(existing, run)) {
        throw new RepositoryError("run_invalid", `Terminal run ${run.run_id} inputs and identity are immutable`);
      }
    }
    try {
      await this.writeRecord(run.run_id, envelope);
    } catch (error) {
      throw new RepositoryError("run_persistence_failed", `Run ${run.run_id} could not be saved`, { cause: error });
    }
    return cloneDomainValue(run);
  }

  async updateRunLifecycle(runId, changes = {}) {
    const current = await this.getRun(runId);
    const next = changes.status && changes.status !== current.status
      ? transitionRun(current, changes.status, changes)
      : { ...current, ...cloneDomainValue(changes) };
    return this.saveRun(next);
  }

  async deleteRun(runId, { references = [] } = {}) {
    if (Array.isArray(references) && references.length > 0) {
      throw new RepositoryError("run_referenced", `Run ${runId} is referenced and cannot be deleted`, { details: { references } });
    }
    await this.recoverInterruptedRuns();
    const existing = await this.readRecord(runId);
    if (!existing) throw new RepositoryError("run_not_found", `Run ${runId} was not found`);
    try {
      await this.deleteRecord(runId);
    } catch (error) {
      throw new RepositoryError("run_persistence_failed", `Run ${runId} could not be deleted`, { cause: error });
    }
    return true;
  }

  async countRuns(query = {}) {
    return (await this.listRuns(query)).length;
  }

  async deleteUnreferencedRuns({ projectId = null, referencedRunIds = [] } = {}) {
    await this.recoverInterruptedRuns();
    const referenced = new Set(referencedRunIds.map(String));
    const runs = await this.listRuns(projectId ? { project_id: projectId } : {});
    const deletable = runs.filter((run) => !referenced.has(String(run.run_id)));
    if (deletable.length === 0) return 0;
    try {
      await this.deleteRecords(deletable.map((run) => run.run_id));
    } catch (error) {
      throw new RepositoryError("run_persistence_failed", "Unreferenced run history could not be deleted", { cause: error });
    }
    return deletable.length;
  }

  async clearRuns({ confirm = false, referencedRunIds = [] } = {}) {
    if (confirm !== true) throw new RepositoryError("invalid_entity", "Clearing run history requires explicit confirmation");
    await this.recoverInterruptedRuns();
    const referenced = new Set(referencedRunIds.map(String));
    const runs = await this.listRuns();
    const deletable = runs.filter((run) => !referenced.has(String(run.run_id)));
    if (deletable.length === 0) return 0;
    await this.deleteRecords(deletable.map((run) => run.run_id));
    return deletable.length;
  }

  async recoverInterruptedRuns() {
    if (this.recoveryPromise) return this.recoveryPromise;
    this.recoveryPromise = (async () => {
      const records = await this.readAllRecords();
      const replacements = [];
      const issues = [];
      for (const record of records) {
        try {
          const run = parseRunEnvelope(record.value);
          if (!isRecoverable(run.status)) continue;
          const recovered = transitionRun(run, "failed", {
            error: {
              code: "run_interrupted",
              message: "Run interrupted by a browser restart before completion.",
            },
            warnings: [...(run.warnings ?? []), "The browser session ended before this run completed."],
            metadata: {
              ...(run.metadata ?? {}),
              interrupted_from_status: run.status,
              interrupted_at: this.now(),
            },
          });
          replacements.push([run.run_id, prepareRunEnvelope(recovered)]);
        } catch (error) {
          issues.push(issueForRecord(record.key, error));
        }
      }
      if (replacements.length > 0) await this.writeRecords(replacements);
      this.lastIssues = issues;
    })().catch((error) => {
      this.recoveryPromise = null;
      throw normalizeRunStorageError(error);
    });
    return this.recoveryPromise;
  }

  getIssues() {
    return cloneDomainValue(this.lastIssues);
  }

  async readAllRecords() {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.objectStoreName, "readonly");
      const request = transaction.objectStore(this.objectStoreName).getAll();
      let values = [];
      request.onsuccess = () => { values = request.result ?? []; };
      request.onerror = () => reject(request.error ?? new Error("Run history could not be read"));
      transaction.oncomplete = () => {
        database.close();
        resolve(values.map((value) => ({ key: value?.run?.run_id ?? null, value })));
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("Run history could not be read"));
      };
    }).catch((error) => { throw normalizeRunStorageError(error); });
  }

  async readRecord(runId) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.objectStoreName, "readonly");
      const request = transaction.objectStore(this.objectStoreName).get(runId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("Run history record could not be read"));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("Run history record could not be read"));
      };
    }).catch((error) => { throw normalizeRunStorageError(error); });
  }

  async writeRecord(runId, envelope) {
    return this.writeRecords([[runId, envelope]]);
  }

  async writeRecords(records) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.objectStoreName, "readwrite");
      const store = transaction.objectStore(this.objectStoreName);
      records.forEach(([key, value]) => store.put(value, key));
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      const fail = () => {
        database.close();
        reject(transaction.error ?? new Error("Run history could not be saved"));
      };
      transaction.onerror = fail;
      transaction.onabort = fail;
    }).catch((error) => { throw normalizeRunStorageError(error); });
  }

  async deleteRecord(runId) {
    return this.deleteRecords([runId]);
  }

  async deleteRecords(runIds) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.objectStoreName, "readwrite");
      const store = transaction.objectStore(this.objectStoreName);
      runIds.forEach((runId) => store.delete(runId));
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      const fail = () => {
        database.close();
        reject(transaction.error ?? new Error("Run history could not be deleted"));
      };
      transaction.onerror = fail;
      transaction.onabort = fail;
    }).catch((error) => { throw normalizeRunStorageError(error); });
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      if (!this.indexedDB) {
        reject(new RepositoryError("run_storage_unavailable", "Local run history storage is unavailable"));
        return;
      }
      const request = this.indexedDB.open(this.databaseName, RUN_HISTORY_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.objectStoreName)) {
          request.result.createObjectStore(this.objectStoreName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new RepositoryError("run_storage_unavailable", "Local run history storage could not be opened", { cause: request.error }));
    });
  }
}

function matchesRunQuery(run, query) {
  const projectID = query.project_id ?? query.projectId;
  const scenarioID = query.scenario_id ?? query.scenarioId;
  const revisionID = query.scenario_revision_id ?? query.scenarioRevisionId;
  const runType = query.run_type ?? query.runType;
  const status = query.status;
  if (projectID && String(run.project_id) !== String(projectID)) return false;
  if (scenarioID && String(run.scenario_id) !== String(scenarioID)) return false;
  if (revisionID && String(run.scenario_revision_id) !== String(revisionID)) return false;
  if (runType && (Array.isArray(runType) ? !runType.includes(run.run_type) : run.run_type !== runType)) return false;
  if (status && (Array.isArray(status) ? !status.includes(run.status) : run.status !== status)) return false;
  const after = query.created_after ?? query.createdAfter;
  const before = query.created_before ?? query.createdBefore;
  if (after && Date.parse(run.created_at) < Date.parse(after)) return false;
  if (before && Date.parse(run.created_at) > Date.parse(before)) return false;
  return true;
}

function compareRunsNewestFirst(left, right) {
  const timestampDifference = Date.parse(right.created_at) - Date.parse(left.created_at);
  if (Number.isFinite(timestampDifference) && timestampDifference !== 0) return timestampDifference;
  return String(right.run_id).localeCompare(String(left.run_id));
}

function isTerminal(status) {
  return ["succeeded", "failed", "cancelled"].includes(status);
}

function isRecoverable(status) {
  return ["queued", "running"].includes(status);
}

function issueForRecord(key, error) {
  return {
    code: "run_invalid",
    record_key: key,
    message: error?.message ?? "Run history record is invalid",
  };
}

function normalizeRunStorageError(error) {
  if (error instanceof RepositoryError) return error;
  return normalizeRepositoryError(error, "run_storage_unavailable");
}

export function createLocalRunHistoryRepository(options) {
  return new LocalRunHistoryRepository(options);
}

export default LocalRunHistoryRepository;
