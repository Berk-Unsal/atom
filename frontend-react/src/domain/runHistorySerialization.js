import { cloneDomainValue } from "./identifiers.js";
import { assertNoUIState, canonicalSerialize } from "./serialization.js";
import { validateRun } from "./run.js";

export const RUN_HISTORY_STORAGE_SCHEMA_VERSION = 1;
export const MAX_RUN_RECORD_BYTES = 512 * 1024;

const FORBIDDEN_KEYS = new Set([
  "archive",
  "evaluation_ledger",
  "evaluation_ledger_entries",
  "full_rays",
  "geojson",
  "grid_values",
  "path_arrays",
  "private_cache",
  "private_evaluations",
  "raw_measurements",
  "ray_paths",
  "samples",
  "surface_grid",
  "terrain_grid",
]);

export function prepareRunEnvelope(run) {
  const errors = validateRun(run);
  if (errors.length > 0) throw new Error(`Invalid run: ${errors.join(", ")}`);
  assertRunPayloadHasNoUIState(run);
  const sanitizedRun = stripForbiddenRunFields(run);
  const envelope = {
    storage_schema_version: RUN_HISTORY_STORAGE_SCHEMA_VERSION,
    run: cloneDomainValue(sanitizedRun),
  };
  const bytes = byteLength(envelope);
  if (bytes > MAX_RUN_RECORD_BYTES) {
    throw new Error(`Run record exceeds the ${MAX_RUN_RECORD_BYTES} byte local history limit`);
  }
  return envelope;
}

export function parseRunEnvelope(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Run history record must be an object");
  }
  if (record.storage_schema_version !== RUN_HISTORY_STORAGE_SCHEMA_VERSION) {
    throw new Error("Unsupported run history storage schema");
  }
  const errors = validateRun(record.run);
  if (errors.length > 0) throw new Error(`Invalid run: ${errors.join(", ")}`);
  assertRunPayloadHasNoUIState(record.run);
  return cloneDomainValue(stripForbiddenRunFields(record.run));
}

export function stripForbiddenRunFields(value) {
  if (Array.isArray(value)) return value.map((item) => stripForbiddenRunFields(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase()))
      .map(([key, child]) => [key, stripForbiddenRunFields(child)]),
  );
}

export function runRecordByteSize(run) {
  return byteLength(prepareRunEnvelope(run));
}

export function immutableRunProjection(run) {
  return {
    run_id: run?.run_id ?? null,
    run_type: run?.run_type ?? null,
    project_id: run?.project_id ?? null,
    scenario_id: run?.scenario_id ?? null,
    scenario_revision_id: run?.scenario_revision_id ?? null,
    scenario_fingerprint: run?.scenario_fingerprint ?? null,
    input_fingerprint: run?.input_fingerprint ?? null,
    dataset_references: run?.dataset_references ?? [],
    engine: run?.engine ?? null,
    rf_contract: run?.rf_contract ?? null,
    optimizer_contract: run?.optimizer_contract ?? null,
    canonical_input_snapshot: run?.canonical_input_snapshot ?? null,
    created_at: run?.created_at ?? null,
  };
}

export function immutableRunEqual(left, right) {
  return canonicalSerialize(immutableRunProjection(left)) === canonicalSerialize(immutableRunProjection(right));
}

function assertRunPayloadHasNoUIState(run) {
  assertNoUIState(run?.canonical_input_snapshot, "Run input snapshot");
  assertNoUIState(run?.summary, "Run summary");
  assertNoUIState(run?.details, "Run details");
  assertNoUIState(run?.metadata, "Run metadata");
}

function byteLength(value) {
  const serialized = JSON.stringify(value);
  return new TextEncoder().encode(serialized).byteLength;
}
