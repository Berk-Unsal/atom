import { exportProjectFile } from "../utils/projectStore.js";
import { projectFileRecoveryReason } from "../utils/projectFileRecovery.js";
import { downloadFilename, namingForSource } from "../utils/downloadNames.js";
import { sha256Hex } from "../utils/sha256.js";

function suggestedName(project, copy) {
  const scenario = project.scenarios?.find((candidate) => candidate.id === project.activeScenarioId);
  const naming = namingForSource(project, scenario?.domain?.scenario_id ?? scenario?.id, scenario?.domain?.current_revision_id);
  const name = downloadFilename({ ...naming, project: naming.project || "atom-project", date: new Date(), extension: "atom-project.json" });
  return `${name.replace(/\.atom-project\.json$/, "").slice(0, 170)}${copy ? "-copy" : ""}.atom-project.json`;
}

/** Shared path for native menus, keyboard commands and project-menu buttons. */
export function createProjectFileController({ files, getContext: externalContext, onState, serialize = exportProjectFile }) {
  let context;
  const getContext = () => externalContext ? externalContext() : context;
  let active = true; let busy = false; let statusEpoch = 0; let modelEpoch = 0; let notice = 0;
  const associated = new Set(); const hashes = new WeakMap();
  const publish = (change) => { if (active) onState(change); };
  const failure = (error, operation) => {
    const reason = projectFileRecoveryReason(error);
    publish({ message: error.message, error: true, recovery: reason ? { reason, operation: operation === "open" ? "import" : "export" } : null });
  };
  const status = async (projects) => {
    const epoch = ++statusEpoch;
    const rows = projects ? await files.sync(projects) : await files.status();
    if (!Array.isArray(rows)) throw new Error("Native project-file status is unavailable. Keep the chosen file path and retry.");
    for (const row of rows) if (row.path) associated.add(row.id);
    if (active && epoch === statusEpoch) publish({ statuses: rows });
    return rows;
  };
  const projectHash = async (project) => {
    const previous = hashes.get(project); if (previous) return previous.promise;
    const entry = {};
    entry.promise = sha256Hex(new TextEncoder().encode(serialize(project))).then((hash) => { entry.hash = hash; return hash; });
    hashes.set(project, entry);
    try { return await entry.promise; } catch (error) { hashes.delete(project); throw error; }
  };
  const synchronize = async (projects, current) => {
    if (!active) return false;
    const epoch = ++modelEpoch;
    const pending = (project) => project.id === current.activeProject?.id && current.fileRevision;
    // Mark a changed snapshot dirty before asynchronous hashing. Unchanged
    // project objects reuse a small cached hash, never retained file bytes.
    await status(projects.map((project) => ({ id: project.id,
      revision: pending(project) || hashes.get(project)?.hash || `unverified:${epoch}` })));
    if (!active || epoch !== modelEpoch) return false;
    const rows = await Promise.all(projects.map(async (project) => ({ id: project.id,
      revision: pending(project) || (associated.has(project.id)
        ? await projectHash(project).catch(() => `unexportable:${epoch}`) : project.updatedAt || project.createdAt || project.id) })));
    if (!active || epoch !== modelEpoch) return false;
    await status(rows);
    return epoch === modelEpoch;
  };
  async function saveOne(projectId, mode) {
    const context = getContext();
    const source = context.projects.find((project) => project.id === projectId);
    if (!source) throw new Error("The project is no longer available to save.");
    const project = context.prepareFileProject ? await context.prepareFileProject(projectId) : source;
    if (!active) return { canceled: true };
    const text = serialize(project);
    const revision = await sha256Hex(new TextEncoder().encode(text));
    hashes.set(project, { hash: revision, promise: Promise.resolve(revision) });
    if (!active) return { canceled: true };
    const result = await files.save({ projectId: project.id, revision,
      text, mode, name: suggestedName(project, mode === "export") });
    if (result.canceled) return result;
    if (result.associated !== false && mode !== "export") associated.add(project.id);
    publish({ message: result.warning || `${mode === "export" ? "Exported a copy to" : "Saved project to"} ${result.path}`,
      error: false, recovery: null });
    try { await status(); }
    catch {
      const warning = result.warning || "The project file was saved, but its status could not refresh. Keep the chosen path and retry status before quitting.";
      publish({ message: warning, error: false });
      return { ...result, warning };
    }
    return result;
  }
  async function execute(command, request = {}) {
    if (!active) return { canceled: true };
    if (busy) return { canceled: true, busy: true };
    if (!["open", "save", "saveAs", "export", "saveAll"].includes(command)) return { canceled: true };
    busy = true; publish({ busy: true, message: "", error: false, recovery: null, notice: ++notice });
    let receipt;
    try {
      if (command === "open") {
        const opened = await files.open();
        if (opened.canceled) return opened;
        receipt = opened.ticket;
        if (!active) return { canceled: true };
        // The existing importer validates synchronously before activation.
        const project = await getContext().onImportProject(opened.text);
        const accepted = await files.accept({ ticket: receipt, projectId: project.id }); receipt = null;
        associated.add(project.id);
        publish({ message: accepted.warning || `Opened ${opened.name}. Save writes the normalized project to its associated file.`, error: false });
        let warning = accepted.warning;
        try { await status(); } catch { warning ||= "The project opened, but native file status could not refresh. Keep the source path and retry."; publish({ message: warning, error: false }); }
        return { opened: true, projectId: project.id, warning };
      }
      if (command === "saveAll") {
        if (!Array.isArray(request.projectIds) || request.projectIds.length > 2000) return { canceled: true };
        for (const id of request.projectIds) {
          const result = await saveOne(id, "save");
          if (result.canceled || result.warning) return { canceled: true };
        }
        return { saved: true };
      }
      return await saveOne(request.projectId || getContext().activeProject?.id, command);
    } catch (error) { failure(error, command); return { failed: true, code: error.code }; }
    finally {
      if (receipt) await files.discard(receipt).catch(() => {});
      busy = false; publish({ busy: false });
    }
  }
  return {
    execute,
    setContext: (value) => { context = value; },
    activate: () => { active = true; },
    deactivate: () => { active = false; statusEpoch++; modelEpoch++; },
    sync: (projects, context) => synchronize(projects, context)
      .catch((error) => failure(error, "save")),
    onCommand: async (request) => {
      if (request?.command === "busy") { publish({ message: "Finish or cancel the native file operation before quitting.", error: true, notice: ++notice }); return; }
      if (request?.command === "refresh") { await status().catch((error) => failure(error, "save")); return; }
      const result = await execute(request?.command, request);
      if (request?.command === "saveAll" && request.id) {
        const context = getContext();
        const current = await synchronize(context.projects, context).catch((error) => { failure(error, "save"); return false; });
        if (!current) result.saved = false;
        await files.finishCommand({ id: request.id, success: result.saved === true }).catch((error) => failure(error, "save"));
      }
    },
  };
}
