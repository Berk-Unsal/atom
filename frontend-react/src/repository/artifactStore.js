import {
  ARTIFACT_AVAILABILITY,
  createGeneratedReportArtifact,
  validateGeneratedReportArtifact,
} from "../domain/report.js";
import { cloneDomainValue } from "../domain/identifiers.js";
import { sha256Hex, toUint8Array } from "../utils/sha256.js";

export const ARTIFACT_DATABASE_NAME = "atom-artifacts";
export const ARTIFACT_METADATA_STORE_NAME = "metadata";
export const ARTIFACT_BYTES_STORE_NAME = "bytes";
export const ARTIFACT_DATABASE_VERSION = 1;
export const ARTIFACT_STORAGE_SCHEMA_VERSION = 1;
export const ARTIFACT_SAFETY_CEILING_BYTES = 64 * 1024 * 1024;
export const ARTIFACT_USAGE_WARNING_RATIO = 0.8;

export class ArtifactStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ArtifactStoreError";
    this.code = code;
    this.details = options.details ?? null;
    this.cause = options.cause;
  }
}

export class LocalArtifactStore {
  constructor({
    databaseName = ARTIFACT_DATABASE_NAME,
    indexedDB = globalThis.indexedDB,
    metadataStoreName = ARTIFACT_METADATA_STORE_NAME,
    bytesStoreName = ARTIFACT_BYTES_STORE_NAME,
    now = () => new Date().toISOString(),
    safetyCeilingBytes = ARTIFACT_SAFETY_CEILING_BYTES,
  } = {}) {
    this.databaseName = databaseName;
    this.indexedDB = indexedDB;
    this.metadataStoreName = metadataStoreName;
    this.bytesStoreName = bytesStoreName;
    this.now = now;
    this.safetyCeilingBytes = safetyCeilingBytes;
    this.lastIssues = [];
  }

  async putArtifact(metadata, bytes) {
    const payload = await normalizeBytes(bytes);
    if (payload.byteLength > this.safetyCeilingBytes) {
      throw new ArtifactStoreError(
        "artifact_too_large",
        `Artifact exceeds the local safety ceiling of ${this.safetyCeilingBytes} bytes`,
        { details: { byte_size: payload.byteLength, safety_ceiling_bytes: this.safetyCeilingBytes } },
      );
    }
    const contentHash = await sha256Hex(payload);
    if (metadata?.content_hash && String(metadata.content_hash).toLowerCase() !== contentHash) {
      throw new ArtifactStoreError("artifact_integrity_failed", "Artifact content hash does not match the supplied bytes", {
        details: { expected: metadata.content_hash, actual: contentHash },
      });
    }
    if (metadata?.byte_size !== undefined && metadata?.byte_size !== null && Number(metadata.byte_size) !== payload.byteLength) {
      throw new ArtifactStoreError("artifact_integrity_failed", "Artifact byte size does not match the supplied bytes", {
        details: { expected: metadata.byte_size, actual: payload.byteLength },
      });
    }
    const artifactId = metadata?.artifact_id ?? metadata?.artifactId;
    if (!artifactId) throw new ArtifactStoreError("artifact_invalid", "artifact_id is required");
    const prepared = finalizeMetadata({
      ...metadata,
      artifact_id: artifactId,
      content_hash: contentHash,
      byte_size: payload.byteLength,
      availability: "available",
      storage_reference: `indexeddb://${this.databaseName}/${this.bytesStoreName}/${artifactId}`,
    }, this.now);
    const errors = validateGeneratedReportArtifact(prepared);
    if (errors.length > 0) throw new ArtifactStoreError("artifact_invalid", errors.join("; "), { details: { errors } });
    const quotaWarning = await this.getQuotaWarning(payload.byteLength);
    const withWarning = quotaWarning
      ? finalizeMetadata({ ...prepared, warnings: [...prepared.warnings, quotaWarning] }, this.now)
      : prepared;
    try {
      await this.writeArtifactRecords(withWarning, payload);
    } catch (error) {
      throw normalizeArtifactError(error, "artifact_persistence_failed", "Artifact could not be retained locally");
    }
    return cloneDomainValue(withWarning);
  }

  async putArtifactMetadata(metadata) {
    const prepared = createGeneratedReportArtifact({
      ...cloneDomainValue(metadata),
      availability: metadata?.availability ?? "missing",
      storage_reference: metadata?.storage_reference ?? metadata?.storageReference ?? null,
    });
    const errors = validateGeneratedReportArtifact(prepared);
    if (errors.length > 0) throw new ArtifactStoreError("artifact_invalid", errors.join("; "), { details: { errors } });
    try {
      await this.writeMetadataRecord(prepared);
    } catch (error) {
      throw normalizeArtifactError(error, "artifact_persistence_failed", "Artifact metadata could not be retained locally");
    }
    return cloneDomainValue(prepared);
  }

  async getArtifact(artifactId) {
    const metadata = await this.getArtifactMetadata(artifactId);
    if (!metadata) throw new ArtifactStoreError("artifact_not_found", `Artifact ${artifactId} was not found`);
    const record = await this.readBytesRecord(artifactId);
    if (!record?.bytes) {
      const missing = await this.markAvailability(metadata, "missing");
      throw new ArtifactStoreError("artifact_missing_bytes", `Artifact ${artifactId} has no retained bytes`, { details: { metadata: missing } });
    }
    const bytes = await normalizeBytes(record.bytes);
    const actualHash = await sha256Hex(bytes);
    if (metadata.content_hash && actualHash !== String(metadata.content_hash).toLowerCase()) {
      const corrupt = await this.markAvailability(metadata, "corrupt", ["Stored bytes failed SHA-256 verification."]);
      throw new ArtifactStoreError("artifact_corrupt", `Artifact ${artifactId} failed content verification`, {
        details: { metadata: corrupt, expected: metadata.content_hash, actual: actualHash },
      });
    }
    if (Number(metadata.byte_size) !== bytes.byteLength) {
      const corrupt = await this.markAvailability(metadata, "corrupt", ["Stored bytes failed byte-size verification."]);
      throw new ArtifactStoreError("artifact_corrupt", `Artifact ${artifactId} failed byte-size verification`, {
        details: { metadata: corrupt, expected: metadata.byte_size, actual: bytes.byteLength },
      });
    }
    const available = metadata.availability === "available"
      ? metadata
      : await this.markAvailability(metadata, "available");
    return { metadata: available, bytes };
  }

  async getArtifactMetadata(artifactId) {
    const record = await this.readMetadataRecord(artifactId);
    if (!record) return null;
    try {
      const metadata = parseMetadataRecord(record);
      return cloneDomainValue(metadata);
    } catch (error) {
      const issue = issueForRecord(artifactId, error);
      this.lastIssues = [...this.lastIssues, issue];
      return null;
    }
  }

  async listArtifacts(query = {}) {
    const records = await this.readAllMetadataRecords();
    const artifacts = [];
    const issues = [];
    for (const record of records) {
      try {
        const metadata = parseMetadataRecord(record.value);
        if (matchesArtifactQuery(metadata, query)) artifacts.push(metadata);
      } catch (error) {
        issues.push(issueForRecord(record.key, error));
      }
    }
    this.lastIssues = issues;
    artifacts.sort(compareArtifactsNewestFirst);
    const offset = Math.max(0, Number(query.offset ?? 0) || 0);
    const limit = Number(query.limit);
    return artifacts.slice(offset, Number.isFinite(limit) && limit >= 0 ? offset + limit : undefined).map(cloneDomainValue);
  }

  async deleteArtifact(artifactId) {
    try {
      await this.deleteArtifactRecords(artifactId);
    } catch (error) {
      throw normalizeArtifactError(error, "artifact_persistence_failed", `Artifact ${artifactId} could not be deleted`);
    }
    return true;
  }

  async deleteProjectArtifacts(projectId) {
    if (!projectId) return 0;
    const artifacts = await this.listArtifacts({ project_id: projectId });
    for (const artifact of artifacts) await this.deleteArtifact(artifact.artifact_id);
    return artifacts.length;
  }

  async hasArtifact(artifactId) {
    return Boolean(await this.getArtifactMetadata(artifactId));
  }

  getIssues() {
    return cloneDomainValue(this.lastIssues);
  }

  async getStorageEstimate() {
    try {
      if (typeof globalThis.navigator?.storage?.estimate !== "function") return null;
      return await globalThis.navigator.storage.estimate();
    } catch {
      return null;
    }
  }

  async getQuotaWarning(nextBytes = 0) {
    const estimate = await this.getStorageEstimate();
    if (!estimate?.quota) return null;
    const projected = Number(estimate.usage ?? 0) + Number(nextBytes ?? 0);
    if (projected >= Number(estimate.quota)) {
      throw new ArtifactStoreError("artifact_quota_exceeded", "Browser storage quota would be exceeded by this artifact", {
        details: { usage: estimate.usage ?? null, quota: estimate.quota, next_bytes: nextBytes },
      });
    }
    if (projected / Number(estimate.quota) >= ARTIFACT_USAGE_WARNING_RATIO) {
      return "Browser storage is near capacity; retained report evidence may need manual cleanup.";
    }
    return null;
  }

  async writeArtifactRecords(metadata, bytes) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.metadataStoreName, this.bytesStoreName], "readwrite");
      transaction.objectStore(this.metadataStoreName).put({
        storage_schema_version: ARTIFACT_STORAGE_SCHEMA_VERSION,
        metadata,
      }, metadata.artifact_id);
      transaction.objectStore(this.bytesStoreName).put({
        storage_schema_version: ARTIFACT_STORAGE_SCHEMA_VERSION,
        artifact_id: metadata.artifact_id,
        bytes: bytesForStorage(bytes),
      }, metadata.artifact_id);
      transaction.oncomplete = () => { database.close(); resolve(); };
      const fail = () => { database.close(); reject(transaction.error ?? new Error("Artifact could not be saved")); };
      transaction.onerror = fail;
      transaction.onabort = fail;
    });
  }

  async writeMetadataRecord(metadata) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.metadataStoreName, "readwrite");
      transaction.objectStore(this.metadataStoreName).put({
        storage_schema_version: ARTIFACT_STORAGE_SCHEMA_VERSION,
        metadata,
      }, metadata.artifact_id);
      transaction.oncomplete = () => { database.close(); resolve(); };
      const fail = () => { database.close(); reject(transaction.error ?? new Error("Artifact metadata could not be saved")); };
      transaction.onerror = fail;
      transaction.onabort = fail;
    });
  }

  async readMetadataRecord(artifactId) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.metadataStoreName, "readonly");
      const request = transaction.objectStore(this.metadataStoreName).get(artifactId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("Artifact metadata could not be read"));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Artifact metadata could not be read")); };
    });
  }

  async readAllMetadataRecords() {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.metadataStoreName, "readonly");
      const request = transaction.objectStore(this.metadataStoreName).getAll();
      request.onsuccess = () => resolve((request.result ?? []).map((value) => ({
        key: value?.metadata?.artifact_id ?? null,
        value,
      })));
      request.onerror = () => reject(request.error ?? new Error("Artifact metadata could not be read"));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Artifact metadata could not be read")); };
    });
  }

  async readBytesRecord(artifactId) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.bytesStoreName, "readonly");
      const request = transaction.objectStore(this.bytesStoreName).get(artifactId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("Artifact bytes could not be read"));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Artifact bytes could not be read")); };
    });
  }

  async deleteArtifactRecords(artifactId) {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.metadataStoreName, this.bytesStoreName], "readwrite");
      transaction.objectStore(this.metadataStoreName).delete(artifactId);
      transaction.objectStore(this.bytesStoreName).delete(artifactId);
      transaction.oncomplete = () => { database.close(); resolve(); };
      const fail = () => { database.close(); reject(transaction.error ?? new Error("Artifact could not be deleted")); };
      transaction.onerror = fail;
      transaction.onabort = fail;
    });
  }

  async markAvailability(metadata, availability, warnings = []) {
    if (!ARTIFACT_AVAILABILITY.includes(availability)) return metadata;
    const updated = createGeneratedReportArtifact({
      ...metadata,
      availability,
      warnings: [...new Set([...(metadata.warnings ?? []), ...warnings])],
    });
    try {
      await this.writeMetadataRecord(updated);
    } catch (error) {
      this.lastIssues = [...this.lastIssues, issueForRecord(metadata.artifact_id, error)];
    }
    return updated;
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      if (!this.indexedDB) {
        reject(new ArtifactStoreError("artifact_storage_unavailable", "Local artifact storage is unavailable"));
        return;
      }
      const request = this.indexedDB.open(this.databaseName, ARTIFACT_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.metadataStoreName)) database.createObjectStore(this.metadataStoreName);
        if (!database.objectStoreNames.contains(this.bytesStoreName)) database.createObjectStore(this.bytesStoreName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new ArtifactStoreError("artifact_storage_unavailable", "Local artifact storage could not be opened", { cause: request.error }));
    });
  }
}

function finalizeMetadata(input, now) {
  const manifest = input.provenance?.report_manifest ?? input.provenance?.reportManifest;
  const provenance = {
    ...cloneDomainValue(input.provenance ?? {}),
    ...(manifest ? {
      report_manifest: {
        ...cloneDomainValue(manifest),
        artifact_content_hash: input.content_hash ?? input.contentHash ?? null,
        generated_at: input.generated_at ?? input.generatedAt ?? now(),
      },
    } : {}),
  };
  return createGeneratedReportArtifact({ ...input, provenance });
}

function parseMetadataRecord(record) {
  if (record?.storage_schema_version !== ARTIFACT_STORAGE_SCHEMA_VERSION || !record?.metadata) {
    throw new Error("Unsupported artifact metadata envelope");
  }
  const metadata = createGeneratedReportArtifact(record.metadata);
  const errors = validateGeneratedReportArtifact(metadata);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return metadata;
}

async function normalizeBytes(value) {
  if (typeof Blob !== "undefined" && value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  return toUint8Array(value);
}

function bytesForStorage(bytes) {
  if (typeof Blob !== "undefined" && bytes instanceof Blob) return bytes;
  return new Uint8Array(bytes);
}

function matchesArtifactQuery(artifact, query) {
  const pairs = [
    ["project_id", query.project_id ?? query.projectId],
    ["scenario_id", query.scenario_id ?? query.scenarioId],
    ["scenario_revision_id", query.scenario_revision_id ?? query.scenarioRevisionId],
    ["report_id", query.report_id ?? query.reportId],
    ["format", query.format],
    ["media_type", query.media_type ?? query.mediaType],
    ["artifact_type", query.artifact_type ?? query.artifactType],
    ["availability", query.availability],
  ];
  return pairs.every(([key, value]) => value === undefined || value === null || String(artifact[key] ?? "") === String(value))
    && (query.run_id === undefined && query.runId === undefined
      || (artifact.run_ids ?? []).map(String).includes(String(query.run_id ?? query.runId)));
}

function compareArtifactsNewestFirst(left, right) {
  const time = String(right.generated_at ?? "").localeCompare(String(left.generated_at ?? ""));
  return time || String(right.artifact_id).localeCompare(String(left.artifact_id));
}

function issueForRecord(key, error) {
  return { key, code: "artifact_invalid", message: error?.message ?? String(error) };
}

function normalizeArtifactError(error, fallbackCode, fallbackMessage) {
  if (error instanceof ArtifactStoreError) return error;
  return new ArtifactStoreError(fallbackCode, fallbackMessage, { cause: error });
}

export default LocalArtifactStore;
