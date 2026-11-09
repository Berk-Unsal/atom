"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { projectShortcut, registerProjectShortcuts } = require("../lib/project-file-shortcuts.cjs");

test("native file shortcuts use platform modifiers and preserve ordinary text/input commands", () => {
  const input = { type: "keyDown", key: "s", meta: true };
  assert.equal(projectShortcut(input, "darwin"), "save");
  assert.equal(projectShortcut({ ...input, shift: true }, "darwin"), "saveAs");
  assert.equal(projectShortcut({ ...input, key: "E", shift: true }, "darwin"), "export");
  assert.equal(projectShortcut({ type: "keyDown", key: "o", control: true }, "linux"), "open");
  for (const change of [{ type: "keyUp" }, { meta: false }, { alt: true }, { control: true }, { isComposing: true }, { key: "p" }]) assert.equal(projectShortcut({ ...input, ...change }, "darwin"), null);
});
test("one trusted key dispatch prevents duplicate menu handling; repeats/foreign documents do not dispatch", () => {
  const contents = new EventEmitter(); let url = "app://atom/"; contents.getURL = () => url;
  const commands = []; let prevented = 0;
  const unregister = registerProjectShortcuts(contents, (command) => commands.push(command), "darwin");
  const event = { preventDefault: () => prevented++ }; const input = { type: "keyDown", key: "s", meta: true };
  contents.emit("before-input-event", event, input);
  contents.emit("before-input-event", event, { ...input, isAutoRepeat: true });
  url = "data:text/html,foreign"; contents.emit("before-input-event", event, input);
  assert.deepEqual(commands, ["save"]); assert.equal(prevented, 2);
  unregister(); assert.equal(contents.listenerCount("before-input-event"), 0);
});
