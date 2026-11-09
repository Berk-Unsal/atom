"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SettingsStore, emptySettings } = require("../lib/settings-store.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atom-settings-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, "space ç/settings.json");
}
test("settings keep host metadata only, survive upgrade and ignore interrupted sibling files", (t) => {
  const file = fixture(t); const store = new SettingsStore(file);
  const value = store.load(); assert.deepEqual(value, emptySettings());
  value.preferences.lastVersion = "0.13.1";
  value.datasets.push({ id: "ankara", path: "/Users/çağ user/packs/Ankara" });
  value.recentFiles.push({ path: "/tmp/çağ report.html", projectId: "project-1", kind: "report" });
  store.save(value); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.writeFileSync(`${file}.tmp`, "interrupted", { mode: 0o600 });
  const next = new SettingsStore(file).load(); assert.deepEqual(next, value);
  next.preferences.lastVersion = "0.13.2"; store.save(next);
  assert.equal(new SettingsStore(file).load().recentFiles[0].path, "/tmp/çağ report.html");
  assert.equal(fs.readFileSync(`${file}.tmp`, "utf8"), "interrupted");
});
test("failed disk/quota/rename writes preserve last good settings and remove only owned temporary files", (t) => {
  const file = fixture(t); new SettingsStore(file).save(emptySettings()); const before = fs.readFileSync(file);
  for (const [method, code] of [["writeFileSync", "ENOSPC"], ["fsyncSync", "EDQUOT"], ["renameSync", "EACCES"]]) {
    const io = { ...fs, [method]() { const error = new Error(code); error.code = code; throw error; } };
    const store = new SettingsStore(file, { io }); store.load();
    assert.throws(() => store.save({ ...emptySettings(), preferences: { changed: true } }), new RegExp(code));
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["settings.json"]);
  }
});
test("malformed, future, oversized and insecure settings fail without overwriting or resetting", (t) => {
  const file = fixture(t); fs.mkdirSync(path.dirname(file), { mode: 0o700 });
  for (const bytes of ["{broken", JSON.stringify({ ...emptySettings(), schema: 2 }), "x".repeat(256 * 1024 + 1)]) {
    fs.writeFileSync(file, bytes, { mode: 0o600 }); assert.throws(() => new SettingsStore(file).load()); assert.equal(fs.readFileSync(file, "utf8"), bytes);
  }
  fs.writeFileSync(file, JSON.stringify(emptySettings())); fs.chmodSync(file, 0o644); assert.throws(() => new SettingsStore(file).load(), /private/);
  fs.chmodSync(file, 0o600); const link = `${file}.link`; fs.symlinkSync(file, link); assert.throws(() => new SettingsStore(link).load(), /private/);
  assert.throws(() => new SettingsStore(file).save({ ...emptySettings(), recentFiles: [{ path: "relative", projectId: "p", kind: "project" }] }), /association/);
});
