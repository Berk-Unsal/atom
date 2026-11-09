"use strict";
const { assertMainFrame } = require("./policy.cjs");
const { normalizeFileError } = require("./portable-file-io.cjs");
function registerReportFiles({ ipcMain, getWindow, files }) {
  for (const [channel, method] of [["atom:report-save", "save"], ["atom:report-output", "output"]]) ipcMain.handle(channel, async (event, request) => {
    assertMainFrame(event, getWindow());
    try { return { ok: true, value: await files[method](request) }; }
    catch (error) { const bounded = normalizeFileError(error); return { ok: false, error: { code: bounded.code, message: bounded.message } }; }
  });
}
module.exports = { registerReportFiles };
