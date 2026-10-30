import { downloadFilename, reportFilename } from "./downloadNames.js";
import { bindReportPresentation, reportLimitations, renderHtmlReport, renderMarkdownReport } from "./reportExport.js";
import { sha256Hex } from "./sha256.js";
import { createZip, readZip } from "./zipWriter.js";

// One local zip for a saved Version: both reports, the project file, the report map and a manifest that ties them
// to one Version, dataset and model identity. Everything is rendered from data already in the browser.

export const REVIEW_PACKAGE_SCHEMA = "atom.review-package.v1";

const MEDIA_TYPES = { html: "text/html;charset=utf-8", md: "text/markdown;charset=utf-8", json: "application/json", svg: "image/svg+xml" };

function mediaType(name) {
  return MEDIA_TYPES[name.split(".").pop()] ?? "application/octet-stream";
}

/** Why a package cannot be exported for this workspace, or "" when it can. */
export function reviewPackageRefusal({ source = null, planDirty = false, hasDraft = false } = {}) {
  if (!source?.scenario_revision_id || planDirty || hasDraft) {
    return "Save a Version first: a review package is exported only for a saved Version, so its lineage cannot change after it is shared.";
  }
  return "";
}

/**
 * Builds the package bytes. `naming` is { project, scenario, version }; `source` is the Report source lineage
 * ({ scenario_name, version_label, scenario_revision_id, runs }).
 */
export async function buildReviewPackage({ report, projectFileText, naming = {}, source = {}, appMeta = null, generatedAt = report?.generatedAt ?? new Date() } = {}) {
  const date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const reportSource = { ...report?.sourceContext, ...source,
    project_name: naming.project ?? source.project_name ?? report?.sourceContext?.project_name ?? report?.project?.name,
    scenario_name: naming.scenario ?? source.scenario_name ?? report?.sourceContext?.scenario_name ?? report?.view?.scenarioName,
    version: naming.version ?? source.version ?? report?.sourceContext?.version,
    version_label: naming.version ? `Version ${naming.version}` : source.version_label ?? report?.sourceContext?.version_label,
    run_ids: source.run_ids ?? source.runs?.map((run) => run.run_id) ?? report?.domainBinding?.run_ids ?? [], source_kind: report?.domainBinding?.source_kind ?? "scenario_revision" };
  const prepared = bindReportPresentation(report, { generatedAt: date, generatorMeta: appMeta, sourceContext: reportSource,
    domainBinding: { ...report?.domainBinding, project_id: source.project_id ?? report?.domainBinding?.project_id ?? null,
      scenario_id: source.scenario_id ?? report?.domainBinding?.scenario_id ?? null, scenario_revision_id: source.scenario_revision_id ?? report?.domainBinding?.scenario_revision_id ?? null,
      run_ids: reportSource.run_ids, source_kind: reportSource.source_kind } });
  const resolvedNaming = { project: prepared.view.identity.projectName, scenario: prepared.view.identity.scenarioName, version: prepared.view.identity.version };
  const name = (kind, extension) => reportFilename({ ...resolvedNaming, date, mode: prepared.view.identity.mode, kind, extension });
  const encoder = new TextEncoder();
  const contents = [
    { name: name("report", "html"), text: renderHtmlReport(prepared, { filename: name("report", "html") }) },
    { name: name("report", "md"), text: renderMarkdownReport(prepared, { assetLinks: { html: name("report", "html"), map: prepared.mapSvg ? name("map", "svg") : null } }) },
    { name: downloadFilename({ ...resolvedNaming, date, extension: "atom-project.json" }), text: projectFileText },
    ...(prepared.mapSvg ? [{ name: name("map", "svg"), text: prepared.mapSvg }] : []),
  ].map((file) => ({ name: file.name, bytes: encoder.encode(file.text ?? "") }));

  const files = [];
  for (const file of contents) {
    files.push({ name: file.name, media_type: mediaType(file.name), bytes: file.bytes.length, sha256: await sha256Hex(file.bytes) });
  }
  const binding = prepared.domainBinding ?? {};
  const dataset = report?.appMeta?.dataset ?? null;
  const manifest = {
    schema: REVIEW_PACKAGE_SCHEMA,
    generated_at: date.toISOString(),
    generated_locally: true,
    rf_requests: 0,
    lineage: {
      project: resolvedNaming.project,
      scenario: resolvedNaming.scenario,
      version: prepared.view.identity.versionLabel,
      scenario_revision_id: binding.scenario_revision_id ?? null,
      runs: reportSource.run_ids.map((id) => (reportSource.runs ?? []).find((run) => String(run.run_id) === String(id)) ?? { run_id: id }).map((run) => ({ run_id: run.run_id, run_type: run.run_type, created_at: run.created_at ?? null })),
    },
    identity: {
      dataset: dataset ? { id: dataset.id ?? null, version: dataset.version ?? null, sha256: dataset.sha256 ?? {} } : null,
      dataset_references: binding.dataset_references ?? [],
      model_version: report?.appMeta?.model_version ?? null,
      application_version: report?.appMeta?.application_version ?? null,
      scenario_fingerprint: binding.scenario_fingerprint ?? null,
    },
    files,
    limitations: reportLimitations(prepared),
  };
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const bytes = createZip([...contents, { name: "manifest.json", bytes: manifestBytes }], { modifiedAt: date });
  return { filename: name("review-package", "zip"), bytes, manifest };
}

/** Recomputes each contained file's hash against the manifest; used to check a package before handing it over. */
export async function verifyReviewPackage(bytes) {
  const entries = readZip(bytes);
  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  if (!manifestEntry) return { valid: false, problems: ["manifest.json is missing"] };
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.bytes));
  const problems = [];
  for (const file of manifest.files) {
    const entry = entries.find((candidate) => candidate.name === file.name);
    if (!entry) problems.push(`${file.name} is missing`);
    else if (await sha256Hex(entry.bytes) !== file.sha256) problems.push(`${file.name} does not match its SHA-256`);
  }
  const extra = entries.filter((entry) => entry.name !== "manifest.json" && !manifest.files.some((file) => file.name === entry.name));
  extra.forEach((entry) => problems.push(`${entry.name} is not listed in the manifest`));
  return { valid: problems.length === 0, problems, manifest };
}
