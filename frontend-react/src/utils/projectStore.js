import { compactRecommendationResponse } from "./recommendations.js";
import { measureProjectRayExpansion, packProjectRays, unpackProjectRays } from "./projectRayColumns.js";
import { validateScenarioRevision } from "../domain/scenario.js";
import { validateRun } from "../domain/run.js";
import { validateInventoryRevision } from "../domain/inventory.js";
import { validateReportDefinition } from "../domain/report.js";

export const PROJECT_SCHEMA_VERSION = 2;
export const PROJECT_FILE_SCHEMA_VERSION = 3;
export const MAX_PROJECT_FILE_BYTES = 16 * 1024 * 1024;
// The parser's encoded-node limit stays at 250,000. Lossless column expansion
// has an additional preflight bound before any decoded features are allocated.
const MAX_PROJECT_EXPANDED_JSON_NODES = 1_000_000;
const MAX_PROJECT_EXPANDED_JSON_BYTES = 32 * 1024 * 1024;
export const PROJECT_DATABASE_NAME = "atom-planning-workspace";
export const PROJECT_OBJECT_STORE_NAME = "workspace";
export const PROJECT_WORKSPACE_KEY = "current";
export const PROJECT_FALLBACK_STORAGE_KEY = "atom.planning.workspace.v1";
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
const DATABASE_NAME = PROJECT_DATABASE_NAME;
const STORE_NAME = PROJECT_OBJECT_STORE_NAME;
const WORKSPACE_KEY = PROJECT_WORKSPACE_KEY;
const FALLBACK_KEY = PROJECT_FALLBACK_STORAGE_KEY;
const MAX_CACHED_SCENARIOS = 5;
let lastPersistenceRevision = 0;
let workspaceSaveQueue = Promise.resolve();
let workspaceDatabase = null;
let workspaceDatabaseProvider = null;

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
    activeScenario && equalPlanInputs(
      planInputsForScenarioIdentity(activeScenario.plan),
      planInputsForScenarioIdentity(draft?.plan),
    ),
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

function planInputsForScenarioIdentity(plan) {
  const inputs = { ...(plan ?? {}) };
  delete inputs.selectedMapCellId;
  delete inputs.rayScope;
  return inputs;
}

function equalPlanInputs(left, right) {
  return JSON.stringify(sortSerializableObjectKeys(left)) === JSON.stringify(sortSerializableObjectKeys(right));
}

function sortSerializableObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortSerializableObjectKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortSerializableObjectKeys(value[key])]));
  }
  return value;
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
  validateProjectResults(project);
  validateProjectDomain(project);
  const file = { schemaVersion: PROJECT_FILE_SCHEMA_VERSION, project: packProjectRays(project) };
  validateProjectJSONBudget(file);
  measureProjectRayExpansion(file.project, { maxBytes: MAX_PROJECT_EXPANDED_JSON_BYTES, maxNodes: MAX_PROJECT_EXPANDED_JSON_NODES });
  const text = JSON.stringify(file);
  assertProjectFileSize(text);
  return text;
}

function assertProjectFileSize(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES) {
    throw new Error(`Project file must be no larger than ${MAX_PROJECT_FILE_BYTES / (1024 * 1024)} MiB`);
  }
}

export function importProjectFile(text) {
  assertProjectFileSize(text);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Project file is not valid JSON");
  }
  const project = decodeProjectFile(parsed);
  return copyProjectWithNewIDs(project, `${project.name} (Imported)`, {
    preserveDomain: parsed.schemaVersion === PROJECT_FILE_SCHEMA_VERSION,
  });
}

export function decodeProjectFile(parsed) {
  validateProjectJSONBudget(parsed);
	if (![1, PROJECT_SCHEMA_VERSION, PROJECT_FILE_SCHEMA_VERSION].includes(parsed?.schemaVersion) || !isValidProject(parsed.project)) {
    throw new Error("Project file does not use the supported A.T.O.M schema");
  }
  if (parsed.schemaVersion === PROJECT_FILE_SCHEMA_VERSION) {
    validateProjectDomain(parsed.project);
    unpackProjectRays(parsed.project, { maxBytes: MAX_PROJECT_EXPANDED_JSON_BYTES, maxNodes: MAX_PROJECT_EXPANDED_JSON_NODES });
    validateProjectJSONBudget(parsed, MAX_PROJECT_EXPANDED_JSON_NODES);
  }
  validateProjectResults(parsed.project);
  return parsed.project;
}

function validateProjectDomain(project) {
  const invalid = () => { throw new Error("Project file contains invalid Version or Run metadata"); };
  const lists = (record, fields) => {
    for (const field of fields) {
      if (record[field] !== undefined && record[field] !== null && !Array.isArray(record[field])) invalid();
    }
  };
  const metadata = (domain) => {
    if (domain === null || domain === undefined) return;
    if (!isPlainObject(domain)) invalid();
    for (const key of ["project_id", "scenario_id", "inventory_id", "inventory_revision_id", "current_revision_id"]) {
      if (domain[key] !== undefined && domain[key] !== null && !isBoundedString(domain[key], 200)) invalid();
    }
  };
  const records = (domain, key, validator, arrayFields) => {
    const values = domain?.[key];
    if (values === undefined || values === null) return;
    if (!Array.isArray(values)) invalid();
    for (const value of values) {
      if (!isPlainObject(value) || validator(value).length > 0) invalid();
      lists(value, arrayFields);
    }
  };
  metadata(project.domain);
  records(project.domain, "inventory_revisions", validateInventoryRevision, ["cells", "source_references"]);
  records(project.domain, "report_definitions", validateReportDefinition, ["sections", "run_ids"]);
  for (const scenario of project.scenarios) {
    metadata(scenario.domain);
    records(scenario.domain, "revisions", validateScenarioRevision, ["selected_cell_ids", "enabled_cell_ids", "dataset_references"]);
    records(scenario.domain, "runs", validateRun, ["warnings", "artifact_references", "dataset_references"]);
  }
}

function validateProjectResults(project) {
  for (const scenario of project.scenarios) {
    for (const key of ["simulation", "coverageGaps", "interferenceAnalysis", "networkOptimization"]) {
      const result = scenario.artifacts?.[key];
      if (result !== undefined && result !== null && !isPlainObject(result)) {
        throw new Error("Project file contains an invalid result object");
      }
    }
    const geojson = scenario.artifacts?.simulation?.geojson;
    if (geojson && (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)
      || geojson.features.some((feature) => !isPlainObject(feature) || feature.type !== "Feature"
        || !isPlainObject(feature.geometry) || !Array.isArray(feature.geometry.coordinates)
        || (feature.properties !== null && !isPlainObject(feature.properties))))) {
      throw new Error("Project file contains invalid ray features");
    }
  }
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

export function compactProjectWorkspace(workspace) {
  return compactWorkspace(normalizeWorkspace(workspace));
}

function compactScenarioArtifacts(artifacts) {
  if (!artifacts?.siteRecommendations) return artifacts;
  const siteRecommendations = compactRecommendationResponse(artifacts.siteRecommendations);
  if (siteRecommendations === artifacts.siteRecommendations) return artifacts;
  return { ...artifacts, siteRecommendations };
}

function copyProjectWithNewIDs(project, name, { preserveDomain = false } = {}) {
  const timestamp = new Date().toISOString();
  const scenarioIDs = new Map();
  const scenarios = (project.scenarios ?? []).map((scenario) => {
    const id = createID("scenario");
    scenarioIDs.set(scenario.id, id);
    const clonedScenario = structuredClone(scenario);
    delete clonedScenario.domain;
    return { ...clonedScenario, id, createdAt: timestamp, updatedAt: timestamp };
  });
  const clonedProject = structuredClone(project);
  delete clonedProject.domain;
  const copy = {
    ...clonedProject,
    id: createID("project"),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeScenarioId: scenarioIDs.get(project.activeScenarioId) ?? null,
    scenarios,
  };
  if (preserveDomain) retainImportedDomain(project, copy);
  return copy;
}

function retainImportedDomain(source, copy) {
  // Import still creates an independent editable project. Preserve Versions and
  // embedded Runs, remapping only local identity/linkage fields. RF requests,
  // fingerprints, solution IDs and scientific responses are copied verbatim.
  const ids = new Map([[source.id, copy.id]]);
  if (source.domain?.project_id) ids.set(source.domain.project_id, copy.id);
  source.scenarios.forEach((scenario, index) => {
    ids.set(scenario.id, copy.scenarios[index].id);
    if (scenario.domain?.scenario_id) ids.set(scenario.domain.scenario_id, copy.scenarios[index].id);
  });
  const localFields = new Set([
    "project_id", "scenario_id", "scenario_revision_id", "inventory_id", "inventory_revision_id",
    "run_id", "report_id", "parent_scenario_id", "parent_revision_id", "current_revision_id",
    "originating_run_id", "scenario_ids", "revision_ids", "run_ids", "inventory_ids",
    "compatibility_project_id", "compatibility_scenario_id", "sourceScenarioId", "source_scenario_id",
  ]);
  const opaqueFields = new Set(["request_inputs", "canonical_input_snapshot", "resolved_fingerprints", "public_response"]);
  const allocate = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (opaqueFields.has(key)) continue;
      if (["scenario_revision_id", "inventory_id", "inventory_revision_id", "run_id", "report_id"].includes(key)
        && typeof child === "string" && !ids.has(child)) ids.set(child, createID("imported"));
      allocate(child);
    }
  };
  allocate(source.domain);
  source.scenarios.forEach((scenario) => allocate(scenario.domain));
  const remap = (value) => {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
      opaqueFields.has(key) ? structuredClone(child)
        : localFields.has(key) && typeof child === "string" ? ids.get(child) ?? child
          : localFields.has(key) && Array.isArray(child) ? child.map((id) => ids.get(id) ?? id)
            : remap(child),
    ]));
  };
  if (source.domain) copy.domain = remap(source.domain);
  source.scenarios.forEach((scenario, index) => {
    if (scenario.domain) copy.scenarios[index].domain = remap(scenario.domain);
  });
  if (copy.draft) {
    for (const key of ["sourceScenarioId", "source_scenario_id"]) {
      if (copy.draft[key]) copy.draft[key] = ids.get(copy.draft[key]) ?? copy.draft[key];
    }
  }
  copy.importProvenance = { sourceProjectId: source.id, identityMap: Object.fromEntries(ids) };
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

function validateProjectJSONBudget(root, maxNodes = MAX_PROJECT_JSON_NODES) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > maxNodes) {
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
  if (workspaceDatabase && workspaceDatabaseProvider === globalThis.indexedDB) {
    return Promise.resolve(workspaceDatabase);
  }
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
    request.onsuccess = () => {
      const database = request.result;
      workspaceDatabase = database;
      workspaceDatabaseProvider = globalThis.indexedDB;
      const release = () => {
        if (workspaceDatabase === database) workspaceDatabase = null;
      };
      database.onversionchange = () => { database.close(); release(); };
      database.onclose = release;
      resolve(database);
    };
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
  });
}

async function writeIndexedDB(workspace) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
    transaction.oncomplete = () => {
      resolve();
    };
    const rejectTransaction = () => {
      reject(transaction.error ?? new Error("Workspace could not be saved"));
    };
    transaction.onerror = rejectTransaction;
    transaction.onabort = rejectTransaction;
    // Start committing as soon as the one-record write is queued. Waiting for
    // auto-commit leaves a reload-after-Undo window after the click has ended.
    transaction.commit?.();
  });
}
