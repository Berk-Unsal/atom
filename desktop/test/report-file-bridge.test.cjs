"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { registerReportFiles } = require("../lib/report-file-bridge.cjs");
test("both report operations require the exact privileged main document before native effects", async () => {
  const handlers = new Map(); const calls = [];
  const frame = { url: "app://atom/" }; const contents = { mainFrame: frame };
  const owner = { webContents: contents, isDestroyed: () => false };
  registerReportFiles({ ipcMain: { handle: (name, action) => handlers.set(name, action) }, getWindow: () => owner,
    files: { save: (request) => { calls.push(request); return { saved: true }; }, output: (request) => { calls.push(request); return { printed: true }; } } });
  assert.equal(handlers.size, 2);
  for (const action of handlers.values()) {
    await assert.rejects(action({ sender: contents, senderFrame: { url: frame.url } }, {}));
    await assert.rejects(action({ sender: {}, senderFrame: frame }, {}));
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await handlers.get("atom:report-save")({ sender: contents, senderFrame: frame }, { format: "html" }), { ok: true, value: { saved: true } });
  frame.url = "app://atom/assets/stored-report.html";
  await assert.rejects(handlers.get("atom:report-output")({ sender: contents, senderFrame: frame }, {})); assert.equal(calls.length, 1);
});
test("report filesystem exceptions become bounded typed errors without raw path disclosure", async () => {
  const handlers = new Map(); const frame = { url: "app://atom/" }; const contents = { mainFrame: frame };
  registerReportFiles({ ipcMain: { handle: (name, action) => handlers.set(name, action) }, getWindow: () => ({ webContents: contents, isDestroyed: () => false }),
    files: { save: () => { throw Object.assign(new Error("write /private/user/provider-key"), { code: "EACCES" }); } } });
  const response = await handlers.get("atom:report-save")({ sender: contents, senderFrame: frame }, {});
  assert.equal(response.error.code, "file_permission"); assert.doesNotMatch(JSON.stringify(response), /private|provider-key|stack/);
});
