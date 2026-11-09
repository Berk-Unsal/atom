"use strict";
const { assertMainFrame } = require("./policy.cjs");
const { normalizeFileError } = require("./project-file-io.cjs");

function registerProjectFiles({ ipcMain, getWindow, files }) {
  const operations = {
    "atom:project-open": () => files.open(),
    "atom:project-accept": (request) => files.acceptOpen(request),
    "atom:project-discard": (ticket) => files.discardOpen(ticket),
    "atom:project-save": (request) => files.save(request),
    "atom:project-state": (projects) => files.setProjects(projects),
  };
  for (const [channel, action] of Object.entries(operations)) ipcMain.handle(channel, async (event, request) => {
    // Check authority before evaluating an operation or opening a native dialog.
    assertMainFrame(event, getWindow());
    try { return { ok: true, value: await action(request) }; }
    catch (error) { const bounded = normalizeFileError(error); return { ok: false, error: { code: bounded.code, message: bounded.message } }; }
  });
  return () => { for (const channel of Object.keys(operations)) ipcMain.removeHandler(channel); };
}
module.exports = { registerProjectFiles };
