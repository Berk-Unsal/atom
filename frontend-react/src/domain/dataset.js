import { cloneDomainValue } from "./identifiers.js";
import { normalizeProvenance } from "./provenance.js";

export function createDatasetReference(input = {}) {
  const source = input.dataset ?? input;
  const datasetId = source.dataset_id ?? source.datasetId ?? source.id;
  if (!datasetId) return null;
  return {
    dataset_id: String(datasetId),
    version: String(source.version ?? source.dataset_version ?? source.datasetVersion ?? "unknown"),
    manifest_hash: source.manifest_hash ?? source.manifestHash ?? null,
    content_hashes: cloneDomainValue(source.content_hashes ?? source.contentHashes ?? source.hashes ?? source.sha256 ?? {}),
    crs: source.crs ?? null,
    provenance: cloneDomainValue(source.provenance ?? source.source ?? normalizeProvenance("default", "default")),
    compatibility: cloneDomainValue(source.compatibility ?? null),
  };
}

export function datasetReferenceFingerprintValue(reference) {
  if (!reference) return null;
  return {
    dataset_id: reference.dataset_id,
    version: reference.version,
    manifest_hash: reference.manifest_hash ?? null,
    content_hashes: reference.content_hashes ?? {},
    crs: reference.crs ?? null,
  };
}

export function datasetReferenceToLegacy(reference) {
  if (!reference) return null;
  return {
    id: reference.dataset_id,
    version: reference.version,
    hashes: cloneDomainValue(reference.content_hashes ?? {}),
    ...(reference.manifest_hash ? { manifestHash: reference.manifest_hash } : {}),
    ...(reference.crs ? { crs: reference.crs } : {}),
  };
}

export function validateDatasetReference(reference) {
  const errors = [];
  if (!reference || typeof reference !== "object") return ["dataset reference is required"];
  if (!String(reference.dataset_id ?? "").trim()) errors.push("dataset_id is required");
  if (!String(reference.version ?? "").trim()) errors.push("version is required");
  if (reference.content_hashes !== undefined && (!reference.content_hashes || typeof reference.content_hashes !== "object" || Array.isArray(reference.content_hashes))) {
    errors.push("content_hashes must be an object");
  }
  return errors;
}
