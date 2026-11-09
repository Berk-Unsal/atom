"use strict";
const { safeReason } = require("./diagnostic-logs.cjs");

function notifyRuntime(owner, status) {
  try {
    if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed()) return false;
    owner.webContents.send("atom:runtime-status", status); return true;
  } catch { return false; } // A disconnected/crashed renderer cannot stop native recovery.
}

function createDiagnosticActions({ logs, openPath, showMessageBox, getWindow, relaunch, quit }) {
  let rendererDecision;
  async function openLogs() {
    logs.record("host", "open-logs");
    const { directory } = logs.status();
    let failed = !directory;
    if (directory) try { failed = Boolean(await openPath(directory)); } catch { failed = true; }
    if (failed) {
      logs.record("host", "open-logs-failed");
      await showMessageBox({ type: "error", title: "Logs could not be opened", message: "The local log directory is unavailable.",
        detail: "Check disk space, native directory permissions and the system file manager, then retry Help → Open Logs. No support data was uploaded.", buttons: ["OK"] });
    }
    return !failed;
  }
  async function startup(error, storageFailure) {
    const reason = safeReason(error?.code);
    logs.record("host", "startup-failed", { reason: reason === "unknown" ? storageFailure ? "storage" : "resources" : reason });
    while (true) {
      const { response } = await showMessageBox({ type: "error", title: "A.T.O.M could not start",
        message: storageFailure ? "Desktop storage or resources could not be opened safely." : "Local desktop resources are missing or invalid.",
        detail: `Existing projects are preserved. Reason: ${reason}. ${storageFailure
          ? "Check private native directory permissions and disk space. Back up corrupt or newer settings and repair them explicitly; no store is reset."
          : "Repair the local desktop resources or reinstall a verified build. Source checkouts can run npm run build in desktop."} ${logs.status().fallback ? "Logs use a private temporary fallback; the operating system may remove them later." : "Logs stay local."} Retry restarts the application; calculations are not replayed.`,
        buttons: ["Open Logs", "Retry", "Quit"], defaultId: 2, cancelId: 2, noLink: true });
      if (response === 0) { await openLogs(); continue; }
      if (response === 1) relaunch();
      quit(); return;
    }
  }
  function renderer(reason) {
    if (rendererDecision) return rendererDecision;
    rendererDecision = (async () => {
      const owner = getWindow(); if (!owner || owner.isDestroyed()) return;
      while (getWindow() === owner && !owner.isDestroyed()) {
        const { response } = await showMessageBox(owner, { type: "error", title: "Workspace display stopped",
          message: "The application display could not continue.",
          detail: `Reason: ${safeReason(reason)}. Recovery autosave and completed retained records remain available. Reload restores the workspace; unsaved in-memory edits may be lost. Calculations are not replayed.`,
          buttons: ["Reload Workspace", "Open Logs", "Quit"], defaultId: 2, cancelId: 2, noLink: true });
        if (getWindow() !== owner || owner.isDestroyed()) return;
        if (response === 1) { await openLogs(); continue; }
        if (response === 0) { logs.record("host", "renderer-reload"); owner.reload(); }
        else quit();
        return;
      }
    })().finally(() => { rendererDecision = null; });
    return rendererDecision;
  }
  return { openLogs, startup, renderer };
}
module.exports = { createDiagnosticActions, notifyRuntime };
