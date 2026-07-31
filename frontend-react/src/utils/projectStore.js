import { compactRecommendationResponse } from "./recommendations.js";

export const PROJECT_SCHEMA_VERSION = 2;
export const MAX_PROJECT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PROJECT_SCENARIOS = 100;
const MAX_PROJECT_JSON_DEPTH = 40;
const MAX_PROJECT_JSON_NODES = 250_000;
const MAX_PROJECT_OBJECT_KEYS = 2_000;
const MAX_PROJECT_ARRAY_ITEMS = 25_000;
const MAX_PROJECT_STRING_BYTES = 1 * 1024 * 1024;

/** @typedef {{ kind: string, resultsView: string, avgRxDBm: number|null, gapPct: number|null, networkScore: number|null, overlapBuildings: number|null, avgSINRDB: number|null, serviceablePct: number|null, affectedDemand: number|null, calibrationOffsetDB: number }} ScenarioSummary */
/** @typedef {{ kind: "robust_global_path_loss_bias"|"spatially_validated_robust_global_path_loss_bias", offsetDb: number, technology: "4g"|"5g", frequencyGHz: number, modelVersion: string, dataset: {id: string, version: string, hashes: object}, provenance?: object, expiresAt?: string, validation: object }} CalibrationProfile */
/** @typedef {{ id: string, name: string, createdAt: string, updatedAt: string, plan: object, request: object|null, meta: object|null, summary: ScenarioSummary, artifacts: object|null, calibrationProfile: CalibrationProfile|null, requiresRerun: boolean }} ScenarioSnapshot */
/** @typedef {{ id: string, name: string, datasetRef: object|null, createdAt: string, updatedAt: string, activeScenarioId: string|null, draft: object|null, scenarios: ScenarioSnapshot[] }} ProjectV2 */
/** @typedef {{ revision: number, committedAt: string|null }} WorkspacePersistence */
const DATABASE_NAME = "atom-planning-workspace";
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "current";
const FALLBACK_KEY = "atom.planning.workspace.v1";
const MAX_CACHED_SCENARIOS = 5;
let lastPersistenceRevision = 0;
let workspaceSaveQueue = Promise.resolve();

export function createProjectWorkspace(datasetRef = null) {
  const project = createProject("Ankara Plan", datasetRef);
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    persistence: { revision: 0, committedAt: null },
    activeProjectId: project.id,
    projects: [project],
  };
}

export function createProject(name = "Untitled Plan", datasetRef = null) {
  const timestamp = new Date().toISOString();
  return {
    id: createID("project"),
    name: String(name || "Untitled Plan").trim(),
    datasetRef,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeScenarioId: null,
    draft: null,
    scenarios: [],
  };
}

export function createScenario(name, snapshot) {
  const timestamp = new Date().toISOString();
  return {
    ...snapshot,
    id: createID("scenario"),
    name: String(name || "Planning scenario").trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function datasetReference(meta) {
  const dataset = meta?.dataset;
  if (!dataset) {
    return null;
  }
  return {
    id: dataset.id,
    version: dataset.version,
    hashes: dataset.sha256 ?? {},
  };
}

export function isDatasetCompatible(project, meta) {
  const expected = project?.datasetRef;
  const active = datasetReference(meta);
  if (!expected || !active) {
    return true;
  }
  return expected.id === active.id && expected.version === active.version
    && equalStringMaps(expected.hashes, active.hashes);
}

export function updateProjectDraft(project, draft) {
  const activeScenario = project.scenarios.find((scenario) => scenario.id === project.activeScenarioId);
  const stillMatchesActiveScenario = Boolean(
    activeScenario && equalSerializableValues(activeScenario.plan, draft?.plan),
  );
  return {
    ...project,
    activeScenarioId: stillMatchesActiveScenario ? project.activeScenarioId : null,
    draft: {
      ...draft,
      requiresRerun: true,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function normalizeWorkspace(candidate, datasetRef = null) {
  if (!candidate || typeof candidate !== "object") {
    return createProjectWorkspace(datasetRef);
  }
  const migrated = migrateWorkspace(candidate);
  if (migrated.schemaVersion !== PROJECT_SCHEMA_VERSION || !Array.isArray(migrated.projects)) {
    throw new Error("Unsupported A.T.O.M project schema");
  }
  const projects = migrated.projects.filter(isValidProject).map((project) => ({
    ...project,
    scenarios: Array.isArray(project.scenarios) ? project.scenarios.filter(isValidScenario) : [],
  }));
  if (projects.length === 0) {
    return createProjectWorkspace(datasetRef);
  }
  const activeProjectId = projects.some((project) => project.id === migrated.activeProjectId)
    ? migrated.activeProjectId
    : projects[0].id;
  return compactWorkspace({
    ...migrated,
    persistence: normalizeWorkspacePersistence(migrated.persistence),
    projects,
    activeProjectId,
  });
}

export function migrateWorkspace(candidate) {
  if (candidate.schemaVersion === PROJECT_SCHEMA_VERSION) return candidate;
	if (candidate.schemaVersion === 1 && Array.isArray(candidate.projects)) {
		return { ...candidate, schemaVersion: PROJECT_SCHEMA_VERSION };
	}
  if ((candidate.schemaVersion === 0 || candidate.schemaVersion === undefined) && isValidProject(candidate.project)) {
    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      activeProjectId: candidate.project.id,
      projects: [candidate.project],
    };
  }
  return candidate;
}

export async function loadProjectWorkspace(datasetRef = null) {
  let stored = null;
  let indexedDBError = null;
  try {
    stored = await readIndexedDB();
  } catch (error) {
    indexedDBError = error;
  }
  const fallback = readFallbackWorkspace();
  if (stored !== null && stored !== undefined || fallback) {
    return resolveWorkspaceData(stored, fallback, datasetRef);
  }
  if (indexedDBError?.name === "DataError") {
    throw indexedDBError;
  }
  return createProjectWorkspace(datasetRef);
}

export function resolveWorkspaceData(indexedWorkspace, fallbackJSON, datasetRef = null) {
  const indexedCandidate = parseWorkspaceCandidate(indexedWorkspace, datasetRef);
  const fallbackCandidate = parseFallbackCandidate(fallbackJSON, datasetRef);
  const candidates = [indexedCandidate.workspace, fallbackCandidate.workspace].filter(Boolean);
  if (candidates.length === 0) {
    const errors = [indexedCandidate.error, fallbackCandidate.error].filter(Boolean);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Stored project workspaces could not be read");
    }
    return createProjectWorkspace(datasetRef);
  }
  const selected = candidates.reduce((newest, candidate) => (
    compareWorkspaceFreshness(candidate, newest) > 0 ? candidate : newest
  ));
  lastPersistenceRevision = Math.max(lastPersistenceRevision, selected.persistence.revision);
  return selected;
}

export async function saveProjectWorkspace(workspace) {
  return queueProjectWorkspaceSave(workspace).saved;
}

export function queueProjectWorkspaceSave(workspace) {
  const normalized = compactWorkspace(normalizeWorkspace(workspace));
  const persistence = {
    revision: Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.max(lastPersistenceRevision, normalized.persistence.revision) + 1,
    ),
    committedAt: new Date().toISOString(),
  };
  const preparedWorkspace = { ...workspace, persistence };
  const persistedWorkspace = { ...normalized, persistence };
  lastPersistenceRevision = persistence.revision;
  const saved = workspaceSaveQueue
    .catch(() => undefined)
    .then(() => persistProjectWorkspace(persistedWorkspace));
  workspaceSaveQueue = saved;
  return { workspace: preparedWorkspace, saved };
}

async function persistProjectWorkspace(workspace) {
  let indexedDBError = null;
  try {
    await writeIndexedDB(workspace);
  } catch (error) {
    indexedDBError = error;
  }
  if (!indexedDBError) {
    removeFallbackWorkspaceIfNotNewer(workspace);
    return workspace;
  }
  try {
    writeFallbackWorkspace(workspace);
  } catch (fallbackError) {
    throw new AggregateError(
      [indexedDBError, fallbackError],
      "Project workspace could not be saved",
      { cause: fallbackError },
    );
  }
  return workspace;
}

export function exportProjectFile(project) {
  if (!isValidProject(project)) {
    throw new Error("No valid project is available to export");
  }
  return JSON.stringify({ schemaVersion: PROJECT_SCHEMA_VERSION, project }, null, 2);
}

export function importProjectFile(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES) {
    throw new Error(`Project file must be no larger than ${MAX_PROJECT_FILE_BYTES / (1024 * 1024)} MiB`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Project file is not valid JSON");
  }
  validateProjectJSONBudget(parsed);
	if (![1, PROJECT_SCHEMA_VERSION].includes(parsed?.schemaVersion) || !isValidProject(parsed.project)) {
    throw new Error("Project file does not use the supported A.T.O.M schema");
  }
  return copyProjectWithNewIDs(parsed.project, `${parsed.project.name} (Imported)`);
}

export function duplicateProjectData(project) {
  if (!isValidProject(project)) {
    throw new Error("No valid project is available to duplicate");
  }
  return copyProjectWithNewIDs(project, `${project.name} Copy`);
}

function compactWorkspace(workspace) {
  const cached = workspace.projects
    .flatMap((project) => project.scenarios.map((scenario) => ({ projectID: project.id, scenario })))
    .filter(({ scenario }) => scenario.artifacts)
    .sort((left, right) => String(right.scenario.updatedAt).localeCompare(String(left.scenario.updatedAt)));
  const retained = new Set(cached.slice(0, MAX_CACHED_SCENARIOS)
    .map(({ projectID, scenario }) => `${projectID}:${scenario.id}`));
  return {
    ...workspace,
    projects: workspace.projects.map((project) => ({
      ...project,
      scenarios: project.scenarios.map((scenario) => retained.has(`${project.id}:${scenario.id}`)
        ? { ...scenario, artifacts: compactScenarioArtifacts(scenario.artifacts) }
        : { ...scenario, artifacts: null, requiresRerun: Boolean(scenario.artifacts) }),
    })),
  };
}

function compactScenarioArtifacts(artifacts) {
  if (!artifacts?.siteRecommendations) return artifacts;
  const siteRecommendations = compactRecommendationResponse(artifacts.siteRecommendations);
  if (siteRecommendations === artifacts.siteRecommendations) return artifacts;
  return { ...artifacts, siteRecommendations };
}

function copyProjectWithNewIDs(project, name) {
  const timestamp = new Date().toISOString();
  const scenarioIDs = new Map();
  const scenarios = (project.scenarios ?? []).map((scenario) => {
    const id = createID("scenario");
    scenarioIDs.set(scenario.id, id);
    return { ...structuredClone(scenario), id, createdAt: timestamp, updatedAt: timestamp };
  });
  return {
    ...structuredClone(project),
    id: createID("project"),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeScenarioId: scenarioIDs.get(project.activeScenarioId) ?? null,
    scenarios,
  };
}

function equalSerializableValues(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function equalStringMaps(left = {}, right = {}) {
  const leftEntries = Object.entries(left ?? {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(right ?? {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return equalSerializableValues(leftEntries, rightEntries);
}

function readFallbackWorkspace() {
  try {
    return globalThis.localStorage?.getItem(FALLBACK_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeFallbackWorkspace(workspace) {
  if (typeof globalThis.localStorage?.setItem !== "function") {
    throw new Error("Local storage is unavailable");
  }
  globalThis.localStorage.setItem(FALLBACK_KEY, JSON.stringify(workspace));
}

function removeFallbackWorkspaceIfNotNewer(workspace) {
  const fallbackJSON = readFallbackWorkspace();
  if (!fallbackJSON || typeof globalThis.localStorage?.removeItem !== "function") return;
  const fallbackCandidate = parseFallbackCandidate(fallbackJSON);
  if (!fallbackCandidate.workspace || compareWorkspaceFreshness(fallbackCandidate.workspace, workspace) <= 0) {
    try {
      globalThis.localStorage.removeItem(FALLBACK_KEY);
    } catch {
      // IndexedDB is authoritative; an inaccessible stale fallback is harmless.
    }
  }
}

function parseWorkspaceCandidate(candidate, datasetRef = null) {
  if (candidate === null || candidate === undefined) return { workspace: null, error: null };
  try {
    return { workspace: normalizeWorkspace(candidate, datasetRef), error: null };
  } catch (error) {
    return { workspace: null, error };
  }
}

function parseFallbackCandidate(fallbackJSON, datasetRef = null) {
  if (!fallbackJSON) return { workspace: null, error: null };
  try {
    const parsed = JSON.parse(fallbackJSON);
    return parseWorkspaceCandidate(parsed, datasetRef);
  } catch (error) {
    return { workspace: null, error };
  }
}

function normalizeWorkspacePersistence(candidate) {
  const revision = Number.isSafeInteger(candidate?.revision) && candidate.revision >= 0
    ? candidate.revision
    : 0;
  const committedAt = typeof candidate?.committedAt === "string" && Number.isFinite(Date.parse(candidate.committedAt))
    ? candidate.committedAt
    : null;
  return { revision, committedAt };
}

function compareWorkspaceFreshness(left, right) {
  const revisionDifference = left.persistence.revision - right.persistence.revision;
  if (revisionDifference !== 0) return revisionDifference;
  return workspaceTimestamp(left) - workspaceTimestamp(right);
}

function workspaceTimestamp(workspace) {
  const timestamps = [workspace.persistence.committedAt]
    .concat(workspace.projects.flatMap((project) => [
      project.updatedAt,
      project.draft?.updatedAt,
      ...(project.scenarios ?? []).map((scenario) => scenario.updatedAt),
    ]))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function isValidProject(project) {
  return Boolean(
    isPlainObject(project)
    && isBoundedString(project.id, 200)
    && isBoundedString(project.name, 200)
    && (project.datasetRef === null || project.datasetRef === undefined || isPlainObject(project.datasetRef))
    && (project.draft === null || project.draft === undefined || isValidSnapshot(project.draft))
    && Array.isArray(project.scenarios)
    && project.scenarios.length <= MAX_PROJECT_SCENARIOS
    && project.scenarios.every(isValidScenario)
    && (project.activeScenarioId === null || project.activeScenarioId === undefined
      || project.scenarios.some((scenario) => scenario.id === project.activeScenarioId))
  );
}

function isValidScenario(scenario) {
  return Boolean(
    isPlainObject(scenario)
    && isBoundedString(scenario.id, 200)
    && isBoundedString(scenario.name, 200)
    && isValidSnapshot(scenario)
  );
}

function isValidSnapshot(snapshot) {
  return Boolean(
    isPlainObject(snapshot)
    && (snapshot.plan === undefined || isPlainObject(snapshot.plan))
    && (snapshot.request === null || snapshot.request === undefined || isPlainObject(snapshot.request))
    && (snapshot.meta === null || snapshot.meta === undefined || isPlainObject(snapshot.meta))
    && (snapshot.summary === undefined || isPlainObject(snapshot.summary))
    && (snapshot.artifacts === null || snapshot.artifacts === undefined || isPlainObject(snapshot.artifacts))
    && (snapshot.calibrationProfile === null || snapshot.calibrationProfile === undefined
      || isPlainObject(snapshot.calibrationProfile))
    && (snapshot.requiresRerun === undefined || typeof snapshot.requiresRerun === "boolean")
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isBoundedString(value, maxBytes) {
  return typeof value === "string" && value.trim().length > 0
    && new TextEncoder().encode(value).byteLength <= maxBytes;
}

function validateProjectJSONBudget(root) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > MAX_PROJECT_JSON_NODES) {
      throw new Error("Project file contains too many nested values");
    }
    if (depth > MAX_PROJECT_JSON_DEPTH) {
      throw new Error("Project file is nested too deeply");
    }
    if (typeof value === "string") {
      if (new TextEncoder().encode(value).byteLength > MAX_PROJECT_STRING_BYTES) {
        throw new Error("Project file contains an oversized string value");
      }
      continue;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") continue;
    if (Array.isArray(value)) {
      if (value.length > MAX_PROJECT_ARRAY_ITEMS) {
        throw new Error("Project file contains an oversized array");
      }
      for (const item of value) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (!isPlainObject(value)) throw new Error("Project file contains an unsupported value");
    const entries = Object.entries(value);
    if (entries.length > MAX_PROJECT_OBJECT_KEYS) {
      throw new Error("Project file contains an object with too many fields");
    }
    for (const [key, item] of entries) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new Error("Project file contains an unsafe object field");
      }
      stack.push({ value: item, depth: depth + 1 });
    }
  }
}

function createID(prefix) {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = globalThis.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
  });
}

async function readIndexedDB() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Workspace could not be read"));
    transaction.oncomplete = () => database.close();
  });
}

async function writeIndexedDB(workspace) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    const rejectTransaction = () => {
      database.close();
      reject(transaction.error ?? new Error("Workspace could not be saved"));
    };
    transaction.onerror = rejectTransaction;
    transaction.onabort = rejectTransaction;
  });
}
