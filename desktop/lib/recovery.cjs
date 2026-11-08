"use strict";

// Only a native menu action can initiate recovery. The renderer has read-only
// runtime capabilities and cannot restart a child through a binding.
function createRecoveryAction({ backend, getWindow, showMessageBox }) {
  let active;
  return () => {
    if (active) return active;
    active = (async () => {
      const window = getWindow();
      if (!window || window.isDestroyed() || backend.stopping) return;
      const { response } = await showMessageBox(window, { type: "question", title: "Restart planning service?", message: "Restart the planning service?",
        detail: "Running calculations will stop. Your projects and completed results stay in the workspace. Run the action again when the service is ready.",
        buttons: ["Restart", "Cancel"], defaultId: 1, cancelId: 1, noLink: true });
      if (response !== 0 || window.isDestroyed() || backend.stopping) return;
      try { await backend.restart(); }
      catch {
        if (!window.isDestroyed() && !backend.stopping) await showMessageBox(window, { type: "error", title: "Planning service could not restart",
          message: backend.lastError || "The planning service could not restart.", detail: "Your workspace is preserved. Check the local application resources, then choose Restart planning service again." });
      }
    })().finally(() => { active = null; });
    return active;
  };
}

module.exports = { createRecoveryAction };
