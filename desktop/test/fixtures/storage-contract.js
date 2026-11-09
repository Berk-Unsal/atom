// Bundled only by the native storage test into its disposable packaged fixture.
// Exercise the shared production repositories in a real Chromium IndexedDB.
import { loadProjectWorkspace, saveProjectWorkspace } from "../../../frontend-react/src/utils/projectStore.js";
import { createLocalRepository } from "../../../frontend-react/src/repository/localRepository.js";
import { LocalRunHistoryRepository } from "../../../frontend-react/src/repository/runHistoryRepository.js";
import { LocalArtifactStore } from "../../../frontend-react/src/repository/artifactStore.js";
import { createRun } from "../../../frontend-react/src/domain/run.js";
import { createGeneratedReportArtifact } from "../../../frontend-react/src/domain/report.js";

export async function seed() {
  const workspace = await loadProjectWorkspace();
  workspace.projects[0].name = "Durable Ankara — çığ workspace";
  await saveProjectWorkspace(workspace);
  const projectId = workspace.projects[0].id;
  const run = createRun({ run_id: "native-storage-run", project_id: projectId, status: "succeeded", summary: { note: "durable native evidence fixture" } });
  await new LocalRunHistoryRepository().saveRun(run);
  const artifact = await new LocalArtifactStore().putArtifact(createGeneratedReportArtifact({ artifact_id: "native-storage-report", report_id: "native-storage-definition",
    project_id: projectId, run_ids: [run.run_id], format: "html", provenance: { report_manifest: { run_ids: [run.run_id] } } }),
  new TextEncoder().encode('<!doctype html><h1>Retained Türkçe report — çığ</h1>'));
  localStorage.setItem("native-storage-fallback-marker", "retained localStorage");
  return { projectId, hash: artifact.content_hash };
}

export async function inspect() {
  const workspace = await createLocalRepository().loadWorkspace();
  const run = await new LocalRunHistoryRepository().getRun("native-storage-run");
  const artifact = await new LocalArtifactStore().getArtifact("native-storage-report");
  return { name: workspace.projects[0].name, runId: run.run_id, status: run.status, hash: artifact.metadata.content_hash,
    html: new TextDecoder().decode(artifact.bytes), marker: localStorage.getItem("native-storage-fallback-marker") };
}
