import {
  REPORT_GENERATOR_VERSION,
  REPORT_SCHEMA_VERSION,
  createGeneratedReportArtifact,
} from "../domain/report.js";
import { createEntityId } from "../domain/identifiers.js";
import { reportFilename } from "./downloadNames.js";
import { bindReportPresentation, renderHtmlReport, renderMarkdownReport } from "./reportExport.js";

export { downloadReportBytes, openStoredHtmlReport } from "./reportArtifactDownload.js";

export function buildReportArtifactOutput({ report, reportDefinition, format = "markdown", naming = {} } = {}) {
  const normalizedFormat = format === "html" ? "html" : "markdown";
  const binding = {
    ...(report?.domainBinding ?? {}),
    ...(reportDefinition?.source_binding ?? {}),
    ...Object.fromEntries(["project_id", "scenario_id", "scenario_revision_id", "run_ids", "source_kind"].filter((key) => reportDefinition?.[key] !== undefined).map((key) => [key, reportDefinition[key]])),
  };
  const source = report?.sourceContext ?? {};
  const boundReport = bindReportPresentation(report, { domainBinding: binding, sourceContext: {
    ...source,
    ...binding,
    project_name: naming.project ?? source.project_name ?? report?.project?.name,
    scenario_name: naming.scenario ?? source.scenario_name ?? report?.view?.scenarioName,
    version: naming.version ?? source.version,
    version_label: naming.version ? `Version ${naming.version}` : source.version_label,
  } });
  const filename = reportFilename({ project: naming.project ?? boundReport.view.identity.projectName, scenario: naming.scenario ?? boundReport.view.identity.scenarioName,
    version: naming.version ?? boundReport.view.identity.version, date: report.generatedAt, mode: boundReport.view.identity.mode,
    extension: normalizedFormat === "html" ? "html" : "md" });
  const content = normalizedFormat === "html" ? renderHtmlReport(boundReport, { filename }) : renderMarkdownReport(boundReport);
  const bytes = new TextEncoder().encode(content);
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
    scenario_name: boundReport.view.identity.scenarioName,
    format: normalizedFormat,
    media_type: normalizedFormat === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8",
    // Named for people, not storage: the report ID stays in report_id and artifact metadata.
    filename,
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
  return { artifact, bytes, content, report: boundReport };
}
