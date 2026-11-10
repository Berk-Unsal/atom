"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
const { assertUbuntu, linkedLibraries, dependencyFloor, control, runCommand, normalizeInstalledModes } = require("../lib/deb-contract.cjs");
test("root-owned installed software is traversable/readable without retaining setuid bits or following links", (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "atom-deb-modes-")); t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const root = path.join(scratch, "payload"); fs.mkdirSync(root, { mode: 0o700 });
  fs.writeFileSync(path.join(root, "data"), "fixture", { mode: 0o600 });
  fs.writeFileSync(path.join(root, "binary"), "fixture", { mode: 0o755 }); fs.chmodSync(path.join(root, "binary"), 0o4755);
  const outside = path.join(scratch, "outside"); fs.writeFileSync(outside, "untouched", { mode: 0o600 });
  fs.symlinkSync("../outside", path.join(root, "link"));
  normalizeInstalledModes(root);
  assert.equal(fs.statSync(root).mode & 0o7777, 0o755);
  assert.equal(fs.statSync(path.join(root, "data")).mode & 0o7777, 0o644);
  assert.equal(fs.statSync(path.join(root, "binary")).mode & 0o7777, 0o755);
  assert.equal(fs.statSync(outside).mode & 0o7777, 0o600);
});
test("native command runner supports inherited output and propagates real failures", () => {
  assert.equal(runCommand(process.execPath, ["-e", "process.stdout.write(' result \\n')"]), "result");
  assert.equal(runCommand(process.execPath, ["-e", "process.exit(0)"], { stdio: "inherit" }), "");
  assert.throws(() => runCommand(process.execPath, ["-e", "process.exit(7)"], { stdio: "ignore" }), (error) => error.status === 7);
});
test("Ubuntu package baseline rejects another distro, release, host or architecture", () => {
  const target = { platform: "linux", arch: "x64", dpkgArch: "amd64", release: 'ID=ubuntu\nVERSION_ID="24.04"\n' };
  assert.equal(assertUbuntu(target).VERSION_ID, "24.04");
  for (const patch of [{ platform: "darwin" }, { arch: "arm64" }, { dpkgArch: "arm64" }, { release: "ID=debian\nVERSION_ID=24.04" }, { release: "ID=ubuntu\nVERSION_ID=22.04" }]) assert.throws(() => assertUbuntu({ ...target, ...patch }), /Ubuntu/);
});
test("ELF dependency inspection records real paths and fails unresolved libraries", () => {
  assert.deepEqual(linkedLibraries("linux-vdso.so.1 (0xabc)\nlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0xabc)\n /lib64/ld-linux-x86-64.so.2 (0xabc)\n"), ["/lib/x86_64-linux-gnu/libc.so.6", "/lib64/ld-linux-x86-64.so.2"]);
  assert.throws(() => linkedLibraries("libgtk.so => not found"), /unresolved/);
  assert.equal(dependencyFloor("libc6:amd64", "2.39-0ubuntu8.10"), "libc6 (>= 2.39-0ubuntu8.10)");
  assert.throws(() => dependencyFloor("libc6\nInjected", "2.39"), /Invalid/);
});
test("Debian control has runtime dependencies and canonical version without dev tool requirements", () => {
  const value = control({ version: "0.13.1", dependencies: ["libc6 (>= 2.39)"], installedBytes: 2049 });
  assert.match(value, /Version: 0.13.1\n/); assert.match(value, /Installed-Size: 3\n/); assert.match(value, /Architecture: amd64/);
  assert.match(value, /xdg-desktop-portal-gnome/); assert.match(value, /apparmor \(>= 4.0\)/);
  assert.doesNotMatch(value, /nodejs|golang|docker|build-essential/);
  const candidate = control({ version: "0.13.1", dependencies: ["libc6 (>= 2.39)"], installedBytes: 2049, candidate: true });
  assert.match(candidate, /Description: A.T.O.M telecom planning\n/); assert.doesNotMatch(candidate, /internal unsigned/);
  assert.throws(() => control({ version: "0.13.1\nInjected: yes", dependencies: ["libc6"], installedBytes: 1 }), /Invalid/);
});
