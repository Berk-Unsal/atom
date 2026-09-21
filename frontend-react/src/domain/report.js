import { cloneDomainValue, createEntityId, deepFreeze } from "./identifiers.js";

export function createReportDefinition(input = {}) {
  return {
    report_id: input.report_id ?? input.reportId ?? createEntityId(),
    project_id: input.project_id ?? input.projectId ?? null,
    scenario_id: input.scenario_id ?? input.scenarioId ?? null,
    scenario_revision_id: input.scenario_revision_id ?? input.scenarioRevisionId ?? null,
    run_ids: [...(input.run_ids ?? input.runIds ?? [])],
    sections: cloneDomainValue(input.sections ?? []),
    options: cloneDomainValue(input.options ?? {}),
    created_at: input.created_at ?? input.createdAt ?? new Date().toISOString(),
    updated_at: input.updated_at ?? input.updatedAt ?? new Date().toISOString(),
  };
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
  if (!Array.isArray(report.run_ids)) errors.push("run_ids must be an array");
  return errors;
}
