"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
test("startup failure observation preserves hidden-window state and captures document evidence", async () => {
  const { startupDiagnostics } = await import("./startup-diagnostics.mjs"); let changes = 0;
  const window = { id: 1, isVisible: () => false, isMinimized: () => false, isFocused: () => false, getBounds: () => ({ width: 800, height: 600 }),
    show: () => { changes++; }, webContents: { getURL: () => "app://atom/", isLoading: () => false, isDestroyed: () => false } };
  const application = { evaluate: (callback) => callback({ BrowserWindow: { getAllWindows: () => [window] } }) };
  const document = { ready_state: "complete", text: "Synthetic failure fixture", buttons: [] };
  const result = await startupDiagnostics(application, { evaluate: async () => document });
  assert.equal(result.windows[0].visible, false); assert.deepEqual(result.document, document); assert.equal(changes, 0);
});
test("a destroyed or stalled diagnostic surface stays bounded and does not hide the original failure", async () => {
  const { startupDiagnostics } = await import("./startup-diagnostics.mjs");
  const result = await startupDiagnostics({ evaluate: async () => { throw new Error("Target closed"); } }, { evaluate: () => new Promise(() => {}) }, 20);
  assert.equal(result.windows.unavailable, "Target closed"); assert.equal(result.document.unavailable, "Diagnostic timed out");
});
