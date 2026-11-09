"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiagnosticLogs } = require("../lib/diagnostic-logs.cjs");

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atom-log-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "Native logs — çığ");
  const logs = new DiagnosticLogs({ directory, temporary: root, ...options });
  return { root, directory, logs };
}
const read = (directory, file = "host.log") => fs.readFileSync(path.join(directory, file), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);

test("release records omit arbitrary secrets, bodies, paths and unknown metadata at the schema boundary", (t) => {
  const { directory, logs } = fixture(t, { metadata: { version: "0.13.1", commit: "a".repeat(40), platform: "darwin", arch: "arm64", token: "do-not-store" } });
  const secret = "/Users/private/provider-key=secret project/report/request-content";
  assert.equal(logs.record("host", "startup-failed", { reason: secret, message: secret, stack: secret, token: secret, url: secret, body: { secret }, generation: "b".repeat(32) }), true);
  assert.equal(logs.record("backend", "backend-stderr", { bytes: 9000, message: secret }), false);
  assert.equal(logs.record("host", secret), false);
  const text = fs.readFileSync(path.join(directory, "host.log"), "utf8");
  assert.doesNotMatch(text, /Users|private|provider|request-content|do-not-store|message|stack|token|body|url/);
  const [record] = read(directory); assert.equal(record.reason, "unknown"); assert.equal(record.version, "0.13.1"); assert.equal(record.generation, "b".repeat(32));
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  for (const file of ["host.log", "backend.log"]) assert.equal(fs.statSync(path.join(directory, file)).mode & 0o777, 0o600);
});

test("debug summaries expose counts rather than stderr; untrusted build fields cannot become logs", (t) => {
  const { directory, logs } = fixture(t, { debug: true, metadata: { version: "/secret", commit: "token=secret", arch: "secret", platform: "secret" } });
  logs.record("backend", "backend-stderr", { bytes: Number.MAX_SAFE_INTEGER, truncated: true, message: "raw secret stderr" });
  const [record] = read(directory, "backend.log"); assert.equal(record.level, "debug"); assert.equal(record.bytes, 1_000_000_000);
  assert.equal(record.version, "unknown"); assert.equal(record.commit, "unknown");
  assert.doesNotMatch(JSON.stringify(record), /secret|raw/);
  logs.setBuild({ version: "0.13.2-storage-test", commit: "c".repeat(40) }); logs.record("host", "build");
  assert.equal(read(directory)[0].version, "0.13.2-storage-test");
});

test("rotation keeps independent ordered bounded sets and survives relaunch", (t) => {
  const { directory, root, logs } = fixture(t, { limit: 1024, count: 3 });
  for (let sequence = 0; sequence < 60; sequence++) {
    logs.record("host", "runtime", { state: "ready", sequence });
    logs.record("backend", "runtime", { state: "ready", sequence });
  }
  assert.equal(fs.readdirSync(directory).length, 6);
  for (const component of ["host", "backend"]) {
    const rows = [2, 1, 0].flatMap((index) => read(directory, `${component}${index ? `.${index}` : ""}.log`));
    assert.ok(rows[0].sequence > 0); assert.equal(rows.at(-1).sequence, 59);
    for (let index = 1; index < rows.length; index++) assert.equal(rows[index].sequence, rows[index - 1].sequence + 1);
  }
  for (const file of fs.readdirSync(directory)) assert.ok(fs.statSync(path.join(directory, file)).size <= 1024);
  const next = new DiagnosticLogs({ directory, temporary: root, limit: 1024, count: 3 }); next.record("host", "host-start");
  assert.equal(next.status().fallback, false); assert.equal(read(directory).at(-1).event, "host-start");
});

test("symlinks, hardlinks and shared permissions are preserved while logging switches to private fallback", (t) => {
  for (const kind of ["symlink", "hardlink", "permissions", "directory"]) {
    const { directory, root, logs } = fixture(t);
    const original = path.join(root, `unrelated-${kind}`); fs.writeFileSync(original, "keep", { mode: 0o600 });
    const target = path.join(directory, "host.log"); fs.unlinkSync(target);
    if (kind === "symlink") fs.symlinkSync(original, target);
    if (kind === "hardlink") fs.linkSync(original, target);
    if (kind === "permissions") { fs.writeFileSync(target, "shared"); fs.chmodSync(target, 0o644); }
    if (kind === "directory") fs.mkdirSync(target);
    assert.equal(logs.record("host", "host-start"), true);
    assert.equal(logs.status().fallback, true); assert.notEqual(logs.status().directory, directory);
    assert.equal(fs.readFileSync(original, "utf8"), "keep");
    if (kind === "permissions") assert.equal(fs.statSync(target).mode & 0o777, 0o644);
    assert.equal(read(logs.status().directory).at(-1).event, "host-start");
  }
});

test("write and fallback failures are bounded and cannot throw into application work", (t) => {
  let fail = false; let writes = 0;
  const io = { ...fs, writeFileSync(...args) { writes++; if (fail) { const error = new Error("ENOSPC /secret"); error.code = "ENOSPC"; throw error; } return fs.writeFileSync(...args); } };
  const { root, logs } = fixture(t, { io });
  fail = true; assert.equal(logs.record("host", "host-start"), false);
  assert.deepEqual(logs.status(), { directory: null, fallback: true, disabled: true });
  const before = writes;
  for (let index = 0; index < 50; index++) assert.equal(logs.record("backend", "runtime", { state: "failed" }), false);
  assert.equal(writes, before); assert.equal(fs.readdirSync(root).filter((file) => file.startsWith("atom-support-logs-")).length, 1);
});

test("a failed rotation never removes an unsafe target or mutates unrelated bytes", (t) => {
  const { directory, logs } = fixture(t, { limit: 1024 });
  fs.writeFileSync(path.join(directory, "host.log"), "x".repeat(1000), { mode: 0o600 });
  const original = path.join(directory, "keep"); fs.writeFileSync(original, "preserve", { mode: 0o600 });
  fs.symlinkSync(original, path.join(directory, "host.2.log"));
  assert.equal(logs.record("host", "host-start"), true); assert.equal(logs.status().fallback, true);
  assert.equal(fs.readFileSync(original, "utf8"), "preserve"); assert.equal(fs.statSync(path.join(directory, "host.log")).size, 1000);
  assert.ok(fs.lstatSync(path.join(directory, "host.2.log")).isSymbolicLink());
});
