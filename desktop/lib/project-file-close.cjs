"use strict";
const crypto = require("node:crypto");

function createProjectFileClose({ files, getWindow, showMessageBox, sendCommand, timeout = 120_000 }) {
  let decision; let pending;
  async function choose() {
    const owner = getWindow();
    if (!owner || owner.isDestroyed()) return false;
    if (files.busy) { sendCommand({ command: "busy" }); return false; }
    const dirty = files.dirtyFiles();
    if (!dirty.length) return true;
    const answer = await showMessageBox(owner, { type: "warning", title: "Project files have unsaved changes",
      message: `${dirty.length} associated project ${dirty.length === 1 ? "file has" : "files have"} unsaved changes.`,
      detail: "Recovery autosave is separate from portable files. Save Files writes current project snapshots; it does not create Versions or run calculations. Independent Run History and retained report bytes are not complete portable-project backups.",
      buttons: ["Keep Editing", "Quit with Recovery", "Save Files and Quit"], defaultId: 0, cancelId: 0, noLink: true });
    if (getWindow() !== owner || owner.isDestroyed()) return false;
    if (answer.response === 1) return true;
    if (answer.response !== 2) return false;
    const id = crypto.randomBytes(16).toString("hex");
    const success = await new Promise((resolve) => {
      const timer = setTimeout(() => { pending = null; resolve(false); }, timeout);
      pending = { id, resolve: (value) => { clearTimeout(timer); pending = null; resolve(value); } };
      try { sendCommand({ command: "saveAll", id, projectIds: dirty.map((project) => project.id) }); }
      catch { pending?.resolve(false); }
    });
    return success && getWindow() === owner && !owner.isDestroyed() && !files.busy && files.dirtyFiles().length === 0;
  }
  return {
    decide() { if (!decision) decision = choose().finally(() => { decision = null; }); return decision; },
    finish(request) {
      if (!request || typeof request !== "object" || Array.isArray(request) || Object.keys(request).some((key) => !["id", "success"].includes(key))
        || typeof request.id !== "string" || !/^[a-f0-9]{32}$/.test(request.id) || typeof request.success !== "boolean" || pending?.id !== request.id) return false;
      pending.resolve(request.success); return true;
    },
  };
}
module.exports = { createProjectFileClose };
