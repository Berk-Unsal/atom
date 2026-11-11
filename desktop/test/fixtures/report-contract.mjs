// Test-only bundle of the unchanged shared report presentation/transport code.
import { reportInputs } from "../../../frontend-react/src/test/fixtures/reportFixtures.js";
import { buildPlanningReport, renderHtmlReport, renderMarkdownReport } from "../../../frontend-react/src/utils/reportExport.js";
import { downloadReportBytes, printReportHtml } from "../../../frontend-react/src/utils/reportArtifactDownload.js";
import LocalArtifactStore from "../../../frontend-react/src/repository/artifactStore.js";
import LocalRepository from "../../../frontend-react/src/repository/localRepository.js";
import LocalRunHistoryRepository from "../../../frontend-react/src/repository/runHistoryRepository.js";
import { canonicalSerialize } from "../../../frontend-react/src/domain/serialization.js";
import { sha256Hex } from "../../../frontend-react/src/utils/sha256.js";

export const REPORT_CASES = [
  { name: "single-cell", options: { cells: 1, segments: 1000 }, single: true },
  { name: "two-cells-optimized", options: { cells: 2, optimized: true, segments: 2000 } },
  { name: "eight-cells", options: {} },
  { name: "eight-cells-heterogeneous", options: { heterogeneous: true } },
  { name: "eight-cells-long-identities", options: { longIds: true, longScenario: true, extendedAppendix: true } },
];
export function fixtureReport(name = "eight-cells") {
  const entry = REPORT_CASES.find((candidate) => candidate.name === name);
  if (!entry) throw new Error("Unknown report qualification fixture");
  const inputs = reportInputs(entry.options);
  if (entry.single) Object.assign(inputs, { planningMode: "single", selectedTower: inputs.selectedNetworkTowers[0], selectedNetworkTowers: [], networkOptimization: null });
  inputs.project = { ...inputs.project, name: "Çankaya İş Ağı Şebeke Öğrenim Üssü" };
  inputs.sourceContext = { ...inputs.sourceContext, project_name: inputs.project.name };
  return buildPlanningReport(inputs);
}
export function fixtureOutput(format, name = "eight-cells") {
  const report = fixtureReport(name);
  const content = format === "html" ? renderHtmlReport(report) : format === "markdown" ? renderMarkdownReport(report) : report.mapSvg;
  return { metadata: { filename: `${name} — çığ.${format === "markdown" ? "md" : format}`,
    media_type: { html: "text/html;charset=utf-8", markdown: "text/markdown;charset=utf-8", svg: "image/svg+xml" }[format] }, bytes: new TextEncoder().encode(content) };
}
export async function saveFixture(format) {
  const { metadata, bytes } = fixtureOutput(format);
  return downloadReportBytes({ ...metadata, content_hash: await sha256Hex(bytes) }, bytes);
}
export function pdfFixture(name) {
  return printReportHtml(renderHtmlReport(fixtureReport(name)), { filename: `${name}.pdf` });
}
export function outputHtml(html, mode = "pdf") { return printReportHtml(html, { filename: "untrusted-retained.pdf", mode }); }
export async function retained() {
  const store = new LocalArtifactStore();
  const metadata = await store.listArtifacts({ artifact_type: "report" });
  return Promise.all(metadata.map(async (entry) => {
    const stored = await store.getArtifact(entry.artifact_id);
    return { metadata: stored.metadata, bytes: Array.from(stored.bytes) };
  }));
}
export function rawRuns() { return new LocalRunHistoryRepository().listRuns(); }
export async function workspaceDiffs() {
  const workspace = await new LocalRepository().loadWorkspace();
  const project = workspace.projects.find((candidate) => candidate.id === workspace.activeProjectId);
  const saved = project?.scenarios?.at(-1)?.plan ?? {}; const draft = project?.draft?.plan ?? {};
  const differences = Object.fromEntries([...new Set([...Object.keys(saved), ...Object.keys(draft)])]
    .filter((key) => canonicalSerialize(saved[key]) !== canonicalSerialize(draft[key]))
    .map((key) => [key, { saved: saved[key], draft: draft[key] }]));
  const bounded = Object.fromEntries(Object.entries(differences).map(([key, values]) => [key, Array.isArray(values.saved) || Array.isArray(values.draft)
    ? { savedLength: values.saved?.length, draftLength: values.draft?.length, savedSample: values.saved?.slice(0, 2), draftSample: values.draft?.slice(0, 2) }
    : values]));
  return { activeScenarioId: project?.activeScenarioId, differences: bounded };
}
