"use strict";
const { assertMainFrame } = require("./policy.cjs");
const { normalizeFileError } = require("./project-file-io.cjs");

function registerProjectFiles({ ipcMain, getWindow, files, finishCommand = () => false, notifyChange = () => {} }) {
  const operations = {
    "atom:project-open": () => files.open(),
    "atom:project-accept": (request) => files.acceptOpen(request),
    "atom:project-discard": (ticket) => files.discardOpen(ticket),
    "atom:project-save": (request) => files.save(request),
    "atom:project-state": (projects) => files.setProjects(projects),
    "atom:project-status": () => files.status(),
    "atom:project-command-result": (request) => finishCommand(request),
  };
  for (const [channel, action] of Object.entries(operations)) ipcMain.handle(channel, async (event, request) => {
    // Check authority before evaluating an operation or opening a native dialog.
    assertMainFrame(event, getWindow());
    try {
      const value = await action(request);
      if (["atom:project-save", "atom:project-accept"].includes(channel)) try { notifyChange(); } catch { /* A closed renderer cannot undo a successful file commit. */ }
      return { ok: true, value };
    }
    catch (error) { const bounded = normalizeFileError(error); return { ok: false, error: { code: bounded.code, message: bounded.message } }; }
  });
  return () => { for (const channel of Object.keys(operations)) ipcMain.removeHandler(channel); };
}
module.exports = { registerProjectFiles };
