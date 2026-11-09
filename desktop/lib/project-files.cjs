"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { MAX_PROJECT_BYTES, ProjectFileError, normalizeFileError, approvedPath, readProjectFile, writeProjectFile } = require("./project-file-io.cjs");

const identifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("\0");
const strictKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
const invalid = () => new ProjectFileError("file_invalid_request", "The native project request is invalid.");

// No method accepts a renderer-provided path. Only native dialogs and previously
// committed user associations can create a filesystem capability.
class ProjectFiles {
  constructor({ settings, selectOpen, selectSave, io, now = Date.now, isBusy = () => false }) {
    Object.assign(this, { settings, selectOpen, selectSave, io, now, isBusy });
    this.associations = new Map(); this.tickets = new Map(); this.projects = new Map(); this.busy = false;
    for (const record of settings.load().recentFiles.filter((entry) => entry.kind === "project")) {
      if (identifier(record.projectId) && !this.associations.has(record.projectId)) this.associations.set(record.projectId, record);
    }
  }

  setProjects(projects) {
    if (!Array.isArray(projects) || projects.length > 2000 || projects.some((project) => !strictKeys(project, ["id", "revision"]) || !identifier(project.id) || !identifier(project.revision))) throw invalid();
    this.projects = new Map(projects.map((project) => [project.id, project.revision]));
    return this.status();
  }
  status() {
    return [...this.projects].map(([id, revision]) => {
      const record = this.associations.get(id);
      return { id, path: record?.path || null, name: record ? path.basename(record.path) : null,
        dirty: !record || !record.revision || revision !== record.revision };
    });
  }
  dirtyFiles() { return this.status().filter((row) => row.dirty && /^[a-f0-9]{64}$/.test(this.associations.get(row.id)?.fingerprint?.sha256 || "")); }
  async single(action) {
    if (this.busy || this.isBusy()) throw new ProjectFileError("file_busy", "Finish the current native file operation first.");
    this.busy = true;
    try { return await action(); } catch (error) { throw normalizeFileError(error); }
    finally { this.busy = false; }
  }
  persist(record) {
    this.associations.set(record.projectId, record);
    try {
      const value = this.settings.load();
      const records = [...this.associations.values()];
      records.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      this.settings.save({ ...value, recentFiles: [...records, ...value.recentFiles.filter((entry) => entry.kind !== "project")].slice(0, 20) });
      return null;
    } catch {
      // Portable bytes already committed successfully. Do not falsely report
      // that the old file survived or try an unsafe rollback over a user file.
      return "The file operation succeeded, but its native association could not be retained for the next launch. Keep the chosen path and check native settings permissions/disk space.";
    }
  }
  async open() {
    return this.single(async () => {
      const choice = await this.selectOpen();
      if (choice.canceled || choice.filePaths?.length !== 1) return { canceled: true };
      const file = await approvedPath(choice.filePaths[0], this.io);
      const loaded = await readProjectFile(file, { io: this.io });
      for (const [ticket, record] of this.tickets) if (this.now() - record.createdAt > 120_000) this.tickets.delete(ticket);
      while (this.tickets.size >= 10) this.tickets.delete(this.tickets.keys().next().value);
      const ticket = crypto.randomBytes(16).toString("hex");
      this.tickets.set(ticket, { path: file, fingerprint: loaded.fingerprint, createdAt: this.now() });
      return { canceled: false, ticket, text: loaded.text, name: path.basename(file), path: file };
    });
  }
  acceptOpen(request) {
    if (this.busy || this.isBusy()) throw new ProjectFileError("file_busy", "Finish the current native file operation first.");
    if (!strictKeys(request, ["ticket", "projectId"]) || !identifier(request.projectId)) throw invalid();
    const record = this.tickets.get(request.ticket); this.tickets.delete(request.ticket);
    if (!record || this.now() - record.createdAt > 120_000) throw new ProjectFileError("file_receipt_expired", "Reopen the native project dialog; its read receipt is no longer available.");
    // The shared importer creates lineage/new identities. Its normalized export
    // can differ from the source, so Open alone never promises a clean file.
    const warning = this.persist({ kind: "project", projectId: request.projectId, path: record.path,
      fingerprint: record.fingerprint, revision: null, savedAt: this.now() });
    if (!this.projects.has(request.projectId)) this.projects.set(request.projectId, "import-pending");
    return { associated: true, path: record.path, warning };
  }
  discardOpen(ticket) { this.tickets.delete(ticket); }

  async save(request) {
    if (!strictKeys(request, ["projectId", "revision", "text", "mode", "name"]) || !identifier(request.projectId) || !identifier(request.revision)
      || !["save", "saveAs", "export"].includes(request.mode) || typeof request.text !== "string"
      || typeof request.name !== "string" || !request.name || request.name.length > 200 || /[/\\\0]/.test(request.name)) throw invalid();
    if (Buffer.byteLength(request.text, "utf8") > MAX_PROJECT_BYTES) throw new ProjectFileError("file_too_large", "Project file must be no larger than 16 MiB");
    // Full structural/expanded/domain validation remains the shared serializer's
    // job. This boundary additionally rejects non-project/non-current envelopes.
    let envelope;
    try { envelope = JSON.parse(request.text); } catch { throw invalid(); }
    if (envelope?.schemaVersion !== 3 || !envelope.project || typeof envelope.project !== "object" || Array.isArray(envelope.project) || envelope.project.id !== request.projectId) throw invalid();
    return this.single(async () => {
      const previous = this.associations.get(request.projectId);
      let file; let expected;
      if (request.mode === "save" && previous) {
        if (!previous.fingerprint) throw new ProjectFileError("file_unverified_association", "Use Save As to confirm the destination before overwriting this older association.");
        file = previous.path; expected = previous.fingerprint;
      } else {
        const choice = await this.selectSave({ mode: request.mode, defaultPath: request.mode === "saveAs" && previous ? previous.path : request.name });
        if (choice.canceled || !choice.filePath) return { canceled: true };
        file = await approvedPath(choice.filePath, this.io);
        if (request.mode === "export" && file === previous?.path) throw new ProjectFileError("file_export_destination", "Export writes a copy. Choose a destination different from the associated project file.");
        expected = (await readProjectFile(file, { io: this.io, missing: true }))?.fingerprint || null;
      }
      const written = await writeProjectFile(file, request.text, expected, { io: this.io });
      const associated = request.mode !== "export";
      const warning = associated ? this.persist({ kind: "project", projectId: request.projectId, path: file, fingerprint: written,
        revision: request.revision, savedAt: this.now() }) : null;
      return { canceled: false, saved: true, associated, path: file, name: path.basename(file), warning, status: this.status() };
    });
  }
}

module.exports = { ProjectFiles };
