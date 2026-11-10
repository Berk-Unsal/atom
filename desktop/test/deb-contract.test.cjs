"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { assertUbuntu, linkedLibraries, dependencyFloor, control, runCommand } = require("../lib/deb-contract.cjs");
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
  assert.throws(() => control({ version: "0.13.1\nInjected: yes", dependencies: ["libc6"], installedBytes: 1 }), /Invalid/);
});
