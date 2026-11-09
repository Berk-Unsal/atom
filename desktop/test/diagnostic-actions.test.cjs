"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDiagnosticActions } = require("../lib/diagnostic-actions.cjs");

function fixture(responses, { directory = "/owned/current-logs", error = "", fallback = false } = {}) {
  const dialogs = []; const opened = []; const records = []; const actions = [];
  const owner = { isDestroyed: () => false, reload: () => actions.push("reload") };
  const controller = createDiagnosticActions({ logs: { record: (...args) => records.push(args), status: () => ({ directory, fallback }) },
    openPath: async (value) => { opened.push(value); return error; }, getWindow: () => owner,
    showMessageBox: async (...args) => { dialogs.push(args.at(-1)); return { response: responses.shift() }; },
    relaunch: () => actions.push("relaunch"), quit: () => actions.push("quit") });
  return { controller, dialogs, opened, records, actions, owner };
}
test("Open Logs opens only the actual native sink, including fallback; errors never reveal OS messages", async () => {
  const f = fixture([], { directory: "/owned/private-temporary-fallback", fallback: true });
  assert.equal(await f.controller.openLogs(), true); assert.deepEqual(f.opened, ["/owned/private-temporary-fallback"]);
  const denied = fixture([], { error: "file manager failed: /secret/token" });
  assert.equal(await denied.controller.openLogs(), false);
  assert.doesNotMatch(JSON.stringify(denied.dialogs), /secret|token|\/owned/);
  const disabled = fixture([], { directory: null }); assert.equal(await disabled.controller.openLogs(), false); assert.equal(disabled.opened.length, 0);
});
test("startup preserves explicit repair, Open Logs and Retry/Quit choices without raw error content", async () => {
  const f = fixture([0, 1], { fallback: true });
  await f.controller.startup({ code: "EACCES", message: "/secret/key=user-project", stack: "secret report" }, true);
  assert.deepEqual(f.actions, ["relaunch", "quit"]); assert.equal(f.opened.length, 1);
  const text = JSON.stringify(f.dialogs); assert.match(text, /EACCES/); assert.match(text, /private temporary fallback/); assert.match(text, /no store is reset/);
  assert.doesNotMatch(text, /\/secret|user-project|secret report/);
  const closed = fixture([2]); await closed.controller.startup(new Error("/secret"), false); assert.deepEqual(closed.actions, ["quit"]);
});
test("renderer recovery is single-flight, explicit and does not reload a destroyed owner", async () => {
  const f = fixture([1, 0]); const first = f.controller.renderer("crashed"); assert.equal(f.controller.renderer("oom"), first);
  await first; assert.deepEqual(f.actions, ["reload"]); assert.equal(f.opened.length, 1);
  const closed = fixture([2]); await closed.controller.renderer("/secret"); assert.deepEqual(closed.actions, ["quit"]);
  assert.doesNotMatch(JSON.stringify(closed.dialogs), /\/secret/);
  const destroyed = fixture([0]); destroyed.owner.isDestroyed = () => true; await destroyed.controller.renderer("crashed"); assert.equal(destroyed.dialogs.length, 0);
});
