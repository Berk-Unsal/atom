"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProjectFileClose } = require("../lib/project-file-close.cjs");

function fixture(response, timeout = 1000) {
  let dirty = [{ id: "p", name: "Ankara" }]; const requests = []; const dialogs = [];
  const owner = { isDestroyed: () => false };
  const files = { busy: false, dirtyFiles: () => dirty };
  const close = createProjectFileClose({ files, getWindow: () => owner, timeout,
    showMessageBox: async (...args) => { dialogs.push(args); return { response }; }, sendCommand: (request) => requests.push(request) });
  return { close, files, requests, dialogs, clean: () => { dirty = []; } };
}
test("dirty-file cancel keeps the app running; explicit recovery-only quit is separate", async () => {
  const cancel = fixture(0); assert.equal(await cancel.close.decide(), false); assert.equal(cancel.requests.length, 0);
  const discard = fixture(1); assert.equal(await discard.close.decide(), true); assert.equal(discard.requests.length, 0);
  assert.match(discard.dialogs[0][1].detail, /does not create Versions/);
});
test("Save and Quit uses a single opaque receipt and independently requires all files clean", async () => {
  const f = fixture(2); const deciding = f.close.decide(); assert.equal(f.close.decide(), deciding);
  await new Promise(setImmediate); assert.equal(f.requests.length, 1); assert.equal(f.dialogs.length, 1);
  const request = f.requests[0]; assert.deepEqual(request.projectIds, ["p"]);
  assert.equal(f.close.finish({ id: "0".repeat(32), success: true }), false);
  f.clean(); assert.equal(f.close.finish({ id: request.id, success: true }), true);
  assert.equal(await deciding, true); assert.equal(f.close.finish({ id: request.id, success: true }), false);
});
test("newer edits or cancelled saves keep the app open even after a command completes", async () => {
  for (const success of [true, false]) {
    const f = fixture(2); const deciding = f.close.decide(); await new Promise(setImmediate);
    f.close.finish({ id: f.requests[0].id, success }); assert.equal(await deciding, false);
  }
});
test("busy file operations do not open another native sheet or grant a quit", async () => {
  const f = fixture(2); f.files.busy = true; assert.equal(await f.close.decide(), false);
  assert.equal(f.dialogs.length, 0); assert.deepEqual(f.requests, [{ command: "busy" }]);
});
test("recovery-only projects need no portable-file prompt and lost replies cancel boundedly", async () => {
  const clean = fixture(0); clean.clean(); assert.equal(await clean.close.decide(), true); assert.equal(clean.dialogs.length, 0);
  const timed = fixture(2, 10); assert.equal(await timed.close.decide(), false);
});
