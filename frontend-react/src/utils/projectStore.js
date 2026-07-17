export const PROJECT_SCHEMA_VERSION = 1;

/** @typedef {{ kind: string, resultsView: string, avgRxDBm: number|null, gapPct: number|null, networkScore: number|null, overlapBuildings: number|null, avgSINRDB: number|null, serviceablePct: number|null, affectedDemand: number|null, calibrationOffsetDB: number }} ScenarioSummary */
/** @typedef {{ kind: "robust_global_path_loss_bias", offsetDb: number, technology: "4g"|"5g", frequencyGHz: number, modelVersion: string, dataset: {id: string, version: string, hashes: object}, validation: object }} CalibrationProfile */
/** @typedef {{ id: string, name: string, createdAt: string, updatedAt: string, plan: object, request: object|null, meta: object|null, summary: ScenarioSummary, artifacts: object|null, calibrationProfile: CalibrationProfile|null, requiresRerun: boolean }} ScenarioSnapshot */
/** @typedef {{ id: string, name: string, datasetRef: object|null, createdAt: string, updatedAt: string, activeScenarioId: string|null, draft: object|null, scenarios: ScenarioSnapshot[] }} ProjectV1 */
const DATABASE_NAME = "atom-planning-workspace";
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "current";
const FALLBACK_KEY = "atom.planning.workspace.v1";
const MAX_CACHED_SCENARIOS = 5;

export function createProjectWorkspace(datasetRef = null) {
  const project = createProject("Ankara Plan", datasetRef);
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
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
  return compactWorkspace({ ...migrated, projects, activeProjectId });
}

export function migrateWorkspace(candidate) {
  if (candidate.schemaVersion === PROJECT_SCHEMA_VERSION) return candidate;
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
  if (indexedWorkspace !== null && indexedWorkspace !== undefined) {
    return normalizeWorkspace(indexedWorkspace, datasetRef);
  }
  if (fallbackJSON) {
    return normalizeWorkspace(JSON.parse(fallbackJSON), datasetRef);
  }
  return createProjectWorkspace(datasetRef);
}

export async function saveProjectWorkspace(workspace) {
  const normalized = compactWorkspace(normalizeWorkspace(workspace));
  let indexedDBError = null;
  try {
    await writeIndexedDB(normalized);
  } catch (error) {
    indexedDBError = error;
  }
  try {
    globalThis.localStorage?.setItem(FALLBACK_KEY, JSON.stringify(normalized));
  } catch (fallbackError) {
    if (indexedDBError) {
      throw new AggregateError(
        [indexedDBError, fallbackError],
        "Project workspace could not be saved",
        { cause: fallbackError },
      );
    }
  }
  return normalized;
}

export function exportProjectFile(project) {
  if (!isValidProject(project)) {
    throw new Error("No valid project is available to export");
  }
  return JSON.stringify({ schemaVersion: PROJECT_SCHEMA_VERSION, project }, null, 2);
}

export function importProjectFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Project file is not valid JSON");
  }
  if (parsed?.schemaVersion !== PROJECT_SCHEMA_VERSION || !isValidProject(parsed.project)) {
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
        ? scenario
        : { ...scenario, artifacts: null, requiresRerun: Boolean(scenario.artifacts) }),
    })),
  };
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

function isValidProject(project) {
  return Boolean(project && typeof project.id === "string" && typeof project.name === "string");
}

function isValidScenario(scenario) {
  return Boolean(scenario && typeof scenario.id === "string" && typeof scenario.name === "string");
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
    transaction.onerror = () => reject(transaction.error ?? new Error("Workspace could not be saved"));
  });
}
