import {
  REPORT_GENERATOR_VERSION,
  REPORT_SCHEMA_VERSION,
  createGeneratedReportArtifact,
} from "../domain/report.js";
import { createEntityId } from "../domain/identifiers.js";
import { downloadFilename } from "./downloadNames.js";
import { renderHtmlReport, renderMarkdownReport } from "./reportExport.js";

export { downloadReportBytes, openStoredHtmlReport } from "./reportArtifactDownload.js";

export function buildReportArtifactOutput({ report, reportDefinition, format = "markdown", naming = {} } = {}) {
  const normalizedFormat = format === "html" ? "html" : "markdown";
  const content = normalizedFormat === "html" ? renderHtmlReport(report) : renderMarkdownReport(report);
  const bytes = new TextEncoder().encode(content);
  const binding = report?.domainBinding ?? reportDefinition?.source_binding ?? {};
  const generatedAt = report?.generatedAt instanceof Date
    ? report.generatedAt.toISOString()
    : new Date(report?.generatedAt ?? Date.now()).toISOString();
  const title = reportDefinition?.title ?? report?.view?.title ?? "Planning report";
  const artifact = createGeneratedReportArtifact({
    artifact_id: createEntityId(),
    artifact_type: "report",
    report_id: reportDefinition?.report_id ?? null,
    project_id: reportDefinition?.project_id ?? binding.project_id ?? null,
    scenario_id: reportDefinition?.scenario_id ?? binding.scenario_id ?? null,
    scenario_revision_id: reportDefinition?.scenario_revision_id ?? binding.scenario_revision_id ?? null,
    run_ids: reportDefinition?.run_ids ?? binding.run_ids ?? [],
    title,
    scenario_name: report?.view?.scenarioName ?? null,
    format: normalizedFormat,
    media_type: normalizedFormat === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8",
    // Named for people, not storage: the report ID stays in report_id and artifact metadata.
    filename: downloadFilename({
      project: naming.project,
      scenario: naming.scenario ?? report?.view?.scenarioName,
      version: naming.version,
      date: generatedAt,
      kind: "report",
      extension: normalizedFormat === "html" ? "html" : "md",
    }),
    report_schema_version: REPORT_SCHEMA_VERSION,
    generator_version: REPORT_GENERATOR_VERSION,
    generated_at: generatedAt,
    provenance: {
      source_kind: reportDefinition?.source_kind ?? binding.source_kind ?? "live_compatibility",
      report_manifest: {
        report_schema_version: REPORT_SCHEMA_VERSION,
        generator_version: REPORT_GENERATOR_VERSION,
        scenario_fingerprint: binding.scenario_fingerprint ?? null,
        run_ids: [...(reportDefinition?.run_ids ?? binding.run_ids ?? [])],
        input_fingerprints: [...(binding.input_fingerprints ?? [])],
        dataset_references: binding.dataset_references ?? [],
        artifact_content_hash: null,
        generated_at: generatedAt,
      },
    },
    warnings: report?.evidence?.unavailable ?? [],
  });
  return { artifact, bytes, content };
}
