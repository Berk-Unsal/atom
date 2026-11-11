"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { changeSummary } = require("./surface-diagnostics.cjs");
test("native difference evidence hashes added inventories without copying their source records", () => {
  const source = { cells: Array.from({ length: 451 }, (_, id) => ({ id, private_fixture_value: "never upload source rows", coordinates: [1.23456789, 9.87654321] })) };
  const changed = changeSummary({ project: {} }, { project: { domain: source } }); const encoded = JSON.stringify(changed);
  assert.equal(changed.length, 1); assert.equal(changed[0].path, "/project/domain"); assert.equal(changed[0].before.type, "missing");
  assert.match(changed[0].after.sha256, /^[a-f0-9]{64}$/); assert.ok(encoded.length < 500);
  assert.doesNotMatch(encoded, /never upload|coordinates|1\.23456789|private_fixture_value/);
});
test("native change evidence bounds count/path size and distinguishes real content changes", () => {
  const before = { a: "old", b: 1, c: 2 }; const after = { a: "new", b: 2, c: 3 };
  const changed = changeSummary(before, after, 2); assert.equal(changed.length, 2); assert.notEqual(changed[0].before.sha256, changed[0].after.sha256);
  assert.equal(changeSummary(before, before).length, 0);
  assert.ok(changeSummary({}, { ["long".repeat(100)]: true })[0].path.length <= 300);
});
