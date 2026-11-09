"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { registerProjectFiles } = require("../lib/project-file-bridge.cjs");

test("every typed file operation checks the exact owned main frame before invoking native authority", async () => {
  const handlers = new Map(); const calls = [];
  const frame = { url: "app://atom/" }; const contents = { mainFrame: frame };
  const window = { webContents: contents, isDestroyed: () => false };
  const files = Object.fromEntries(["open", "acceptOpen", "discardOpen", "save", "setProjects", "status"].map((name) => [name, (value) => { calls.push({ name, value }); return { name }; }]));
  const unregister = registerProjectFiles({ ipcMain: { handle: (key, callback) => handlers.set(key, callback), removeHandler: (key) => handlers.delete(key) }, getWindow: () => window, files });
  assert.equal(handlers.size, 7);
  for (const handler of handlers.values()) {
    await assert.rejects(handler({ sender: contents, senderFrame: { url: frame.url } }, {}));
    await assert.rejects(handler({ sender: {}, senderFrame: frame }, {}));
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await handlers.get("atom:project-save")({ sender: contents, senderFrame: frame }, { projectId: "p" }), { ok: true, value: { name: "save" } });
  frame.url = "app://atom/assets/report.html";
  await assert.rejects(handlers.get("atom:project-open")({ sender: contents, senderFrame: frame }));
  assert.equal(calls.length, 1); unregister(); assert.equal(handlers.size, 0);
});

test("native filesystem errors become typed bounded messages without leaking raw paths or stacks", async () => {
  const handlers = new Map(); const frame = { url: "app://atom/" }; const contents = { mainFrame: frame };
  const error = new Error("permission denied: /private/unrelated/secret"); error.code = "EACCES";
  registerProjectFiles({ ipcMain: { handle: (key, callback) => handlers.set(key, callback) }, getWindow: () => ({ webContents: contents, isDestroyed: () => false }), files: { open: () => { throw error; } } });
  const response = await handlers.get("atom:project-open")({ sender: contents, senderFrame: frame });
  assert.equal(response.ok, false); assert.equal(response.error.code, "file_permission");
  assert.doesNotMatch(JSON.stringify(response), /secret|\/private|stack/);
});
