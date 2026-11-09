"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { nativePaths, privateDirectory, prepareNativePaths } = require("../lib/native-paths.cjs");

test("release directories use absolute XDG values and keep cache separate from durable stores", () => {
  const paths = nativePaths({ platform: "linux", packaged: true, home: "/home/çağ user", temporary: "/tmp", env: {
    XDG_DATA_HOME: "/data/space ç", XDG_CONFIG_HOME: "relative/config", XDG_CACHE_HOME: "/cache", XDG_STATE_HOME: "relative/state", XDG_RUNTIME_DIR: "relative/run" } });
  assert.equal(paths.data, "/data/space ç/atom");
  assert.equal(paths.profile, "/data/space ç/atom/webview");
  assert.equal(paths.config, "/home/çağ user/.config/atom");
  assert.equal(paths.state, "/home/çağ user/.local/state/atom");
  assert.equal(paths.cache, "/cache/atom"); assert.equal(paths.runtimeBase, "");
  assert.ok(!paths.profile.startsWith(paths.cache)); assert.ok(!paths.packs.startsWith(paths.cache));
  assert.equal(nativePaths({ platform: "linux", packaged: true, home: "/home/test", env: { XDG_RUNTIME_DIR: "/run/user/1000" } }).runtimeBase, "/run/user/1000");
  assert.throws(() => nativePaths({ platform: "linux", packaged: true, home: "/home/test", env: { XDG_DATA_HOME: "/same", XDG_CACHE_HOME: "/same" } }), /cache must not contain/);
});

test("macOS and isolated local profiles are stable across version, cwd and resources changes", () => {
  const paths = nativePaths({ platform: "darwin", packaged: true, home: "/Users/çağ user", env: { XDG_DATA_HOME: "/ignored" } });
  assert.equal(paths.profile, "/Users/çağ user/Library/Application Support/A.T.O.M/webview");
  assert.equal(paths.logs, "/Users/çağ user/Library/Logs/A.T.O.M");
  assert.equal(paths.cache, "/Users/çağ user/Library/Caches/A.T.O.M");
  const local = nativePaths({ platform: "darwin", localProfile: "/tmp/dev profile" });
  for (const key of ["profile", "data", "config", "cache", "state", "logs", "runtimeBase"]) assert.ok(local[key].startsWith("/tmp/dev profile"));
  assert.throws(() => nativePaths({ localProfile: "relative" }), /absolute/);
});

test("native directories are private, reject symlinks/shared permissions and leave failed paths intact", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atom-paths-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = prepareNativePaths(nativePaths({ localProfile: path.join(root, "space ç") }));
  for (const directory of [paths.profile, paths.data, paths.config, paths.cache, paths.state, paths.logs, paths.packs, paths.runtime]) assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  const shared = path.join(root, "shared"); fs.mkdirSync(shared); fs.chmodSync(shared, 0o755);
  assert.throws(() => privateDirectory(shared), /0700/); assert.equal(fs.statSync(shared).mode & 0o777, 0o755);
  const link = path.join(root, "link"); fs.symlinkSync(paths.data, link); assert.throws(() => privateDirectory(link), /0700/);
  const file = path.join(root, "file"); fs.writeFileSync(file, "keep"); assert.throws(() => privateDirectory(file)); assert.equal(fs.readFileSync(file, "utf8"), "keep");
  assert.throws(() => privateDirectory(path.join(root, "denied"), { ...fs, mkdirSync() { const error = new Error("denied"); error.code = "EACCES"; throw error; } }), /denied/);
});
