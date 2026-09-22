import { cloneDomainValue, createEntityId, deepFreeze } from "./identifiers.js";

export const REPORT_DEFINITION_SCHEMA_VERSION = 1;
export const REPORT_SCHEMA_VERSION = "atom-report-v1";
export const REPORT_GENERATOR_VERSION = "atom-report-generator-v1";
export const GENERATED_ARTIFACT_SCHEMA_VERSION = 1;

export const REPORT_FORMATS = Object.freeze(["markdown", "html"]);
export const ARTIFACT_AVAILABILITY = Object.freeze(["available", "missing", "corrupt"]);
export const ARTIFACT_TYPES = Object.freeze([
  "report",
  "signal_surface",
  "ray_trace",
  "path_profile",
  "measurement_export",
  "validation_residuals",
  "coverage_export",
  "optimization_export",
]);

export function createReportDefinition(input = {}) {
  const now = input.updated_at ?? input.updatedAt ?? input.created_at ?? input.createdAt ?? new Date().toISOString();
  const runIds = input.run_ids ?? input.runIds ?? [];
  return {
    schema_version: input.schema_version ?? input.schemaVersion ?? REPORT_DEFINITION_SCHEMA_VERSION,
    report_id: input.report_id ?? input.reportId ?? createEntityId(),
    project_id: input.project_id ?? input.projectId ?? null,
    scenario_id: input.scenario_id ?? input.scenarioId ?? null,
    scenario_revision_id: input.scenario_revision_id ?? input.scenarioRevisionId ?? null,
    run_ids: [...new Set((Array.isArray(runIds) ? runIds : [runIds]).filter(Boolean).map(String))],
    title: String(input.title ?? "Planning report").trim() || "Planning report",
    sections: cloneDomainValue(input.sections ?? []),
    presentation_options: cloneDomainValue(
      input.presentation_options
        ?? input.presentationOptions
        ?? input.options
        ?? {},
    ),
    source_kind: input.source_kind ?? input.sourceKind ?? "scenario_revision",
    source_binding: cloneDomainValue(input.source_binding ?? input.sourceBinding ?? null),
    created_at: input.created_at ?? input.createdAt ?? new Date().toISOString(),
    updated_at: now,
  };
}

export function createGeneratedReportArtifact(input = {}) {
  const runIds = input.run_ids ?? input.runIds ?? [];
  const artifactId = input.artifact_id ?? input.artifactId ?? createEntityId();
  const format = input.format ?? "markdown";
  return deepFreeze({
    artifact_schema_version: input.artifact_schema_version ?? input.artifactSchemaVersion ?? GENERATED_ARTIFACT_SCHEMA_VERSION,
    artifact_type: input.artifact_type ?? input.artifactType ?? "report",
    artifact_id: artifactId,
    report_id: input.report_id ?? input.reportId ?? null,
    project_id: input.project_id ?? input.projectId ?? null,
    scenario_id: input.scenario_id ?? input.scenarioId ?? null,
    scenario_revision_id: input.scenario_revision_id ?? input.scenarioRevisionId ?? null,
    run_ids: [...new Set((Array.isArray(runIds) ? runIds : [runIds]).filter(Boolean).map(String))],
    title: String(input.title ?? "Planning report").trim() || "Planning report",
    scenario_name: input.scenario_name ?? input.scenarioName ?? null,
    format,
    media_type: input.media_type ?? input.mediaType ?? (format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8"),
    filename: input.filename ?? `${artifactId}.${format === "html" ? "html" : "md"}`,
    report_schema_version: input.report_schema_version ?? input.reportSchemaVersion ?? REPORT_SCHEMA_VERSION,
    generator_version: input.generator_version ?? input.generatorVersion ?? REPORT_GENERATOR_VERSION,
    generated_at: input.generated_at ?? input.generatedAt ?? new Date().toISOString(),
    content_hash: input.content_hash ?? input.contentHash ?? null,
    byte_size: input.byte_size === undefined && input.byteSize === undefined
      ? null
      : (Number.isFinite(Number(input.byte_size ?? input.byteSize)) ? Number(input.byte_size ?? input.byteSize) : null),
    storage_reference: cloneDomainValue(input.storage_reference ?? input.storageReference ?? null),
    availability: input.availability ?? "available",
    provenance: cloneDomainValue(input.provenance ?? {}),
    warnings: cloneDomainValue(input.warnings ?? []),
  });
}

export function createGeneratedReportArtifactReference(input = {}) {
  return deepFreeze({
    report_id: input.report_id ?? input.reportId ?? null,
    artifact_id: input.artifact_id ?? input.artifactId ?? createEntityId(),
    project_id: input.project_id ?? input.projectId ?? null,
    scenario_revision_id: input.scenario_revision_id ?? input.scenarioRevisionId ?? null,
    run_ids: [...(input.run_ids ?? input.runIds ?? [])],
    content_hash: input.content_hash ?? input.contentHash ?? null,
    format: input.format ?? "live",
    generator_version: input.generator_version ?? input.generatorVersion ?? null,
    generated_at: input.generated_at ?? input.generatedAt ?? new Date().toISOString(),
    live_generated: input.live_generated ?? input.liveGenerated ?? input.format === "live",
    artifact_reference: cloneDomainValue(input.artifact_reference ?? input.artifactReference ?? null),
  });
}

export const createGeneratedArtifactReference = createGeneratedReportArtifactReference;

export function validateReportDefinition(report) {
  const errors = [];
  if (!report || typeof report !== "object") return ["report definition is required"];
  if (!String(report.report_id ?? "").trim()) errors.push("report_id is required");
  if (!Number.isInteger(Number(report.schema_version)) || Number(report.schema_version) < 1) errors.push("schema_version must be a positive integer");
  if (!String(report.title ?? "").trim()) errors.push("title is required");
  if (report.project_id !== null && report.project_id !== undefined && !String(report.project_id).trim()) errors.push("project_id must be non-empty when present");
  if (report.scenario_id !== null && report.scenario_id !== undefined && !String(report.scenario_id).trim()) errors.push("scenario_id must be non-empty when present");
  if (!Array.isArray(report.run_ids)) errors.push("run_ids must be an array");
  if (!Array.isArray(report.sections)) errors.push("sections must be an array");
  if (!report.scenario_revision_id && !(report.run_ids ?? []).length && report.source_kind !== "live_compatibility") {
    errors.push("a durable ScenarioRevision or source Run is required");
  }
  return errors;
}

export function validateGeneratedReportArtifact(artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== "object") return ["generated report artifact is required"];
  if (!String(artifact.artifact_id ?? "").trim()) errors.push("artifact_id is required");
  if (!String(artifact.report_id ?? "").trim()) errors.push("report_id is required");
  if (!ARTIFACT_TYPES.includes(artifact.artifact_type)) errors.push("artifact_type is invalid");
  if (!REPORT_FORMATS.includes(artifact.format)) errors.push("format is invalid");
  if (!ARTIFACT_AVAILABILITY.includes(artifact.availability)) errors.push("availability is invalid");
  if (artifact.byte_size !== null && artifact.byte_size !== undefined && (!Number.isFinite(Number(artifact.byte_size)) || Number(artifact.byte_size) < 0)) errors.push("byte_size must be a non-negative number");
  if (artifact.content_hash !== null && artifact.content_hash !== undefined && !/^[a-f0-9]{64}$/i.test(String(artifact.content_hash))) {
    errors.push("content_hash must be a SHA-256 hex digest when present");
  }
  return errors;
}

export function createRunArtifactReference(input = {}) {
  return deepFreeze({
    reference_id: input.reference_id ?? input.referenceId ?? createEntityId(),
    run_id: input.run_id ?? input.runId ?? null,
    artifact_id: input.artifact_id ?? input.artifactId ?? null,
    artifact_type: input.artifact_type ?? input.artifactType ?? "report",
    created_at: input.created_at ?? input.createdAt ?? new Date().toISOString(),
  });
}
