"use strict";
const { assertMainFrame } = require("./policy.cjs");
const { DatasetError } = require("./dataset-source.cjs");
function registerDatasets({ ipcMain, getWindow, registry }) {
  const operations = { "atom:dataset-status": () => registry.status(), "atom:dataset-choose": (kind) => registry.choose(kind),
    "atom:dataset-install": (request) => registry.install(request), "atom:dataset-activate": (id) => registry.activateID(id), "atom:dataset-cancel": () => registry.cancel() };
  for (const [channel, action] of Object.entries(operations)) ipcMain.handle(channel, async (event, request) => {
    assertMainFrame(event, getWindow());
    try { return { ok: true, value: await action(request) }; }
    catch (error) { return { ok: false, error: error instanceof DatasetError ? { code: error.code, message: error.message } : { code: "dataset_failed", message: "The dataset operation could not complete. Check pack files, permissions, and disk space; existing files were preserved." } }; }
  });
}
module.exports = { registerDatasets };
