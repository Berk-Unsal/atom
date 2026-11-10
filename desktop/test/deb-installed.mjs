// Destructive system-package operations are confined to a disposable Actions VM.
// No personal system, real profile or public package upload participates.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { inventory, hash } = require("../lib/package-contract.cjs");
const { assertUbuntu } = require("../lib/deb-contract.cjs");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Installer tests require a disposable GitHub Actions VM");
assert.equal(process.platform, "linux"); assert.notEqual(process.getuid(), 0);
const desktop = path.resolve(import.meta.dirname, ".."); const root = path.dirname(desktop);
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: "utf8", ...options }).trim();
assertUbuntu({ platform: process.platform, arch: process.arch, dpkgArch: run("dpkg", ["--print-architecture"]), release: await fs.readFile("/etc/os-release", "utf8") });
const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
const packageRoot = path.join(desktop, "build/packages", `atom-${version}-linux-x64-internal-unsigned`);
const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "deb.json"), "utf8"));
const candidate = path.join(packageRoot, metadata.artifact.file);
assert.equal(hash(await fs.readFile(candidate)), metadata.artifact.sha256);
let existing = "";
try { existing = run("dpkg-query", ["-W", "-f=${db:Status-Status}", "atom-planner"], { stdio: ["ignore", "pipe", "ignore"] }); } catch { /* Not installed on a fresh VM. */ }
assert.notEqual(existing, "installed", "Do not replace a pre-existing installation");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-deb-install-"));
const home = path.join(scratch, "Native home — çığ spaces");
const output = path.join(desktop, "test-results/deb-installed.json");
const result = { source_commit: metadata.commit, platform: "linux", arch: "x64", display_session: process.env.ATOM_DEB_DISPLAY_SESSION,
  fixture: "Previous Debian package version only; app source/VERSION remain current. Tests apt upgrade dispatch, not a real historical product migration.", phases: [] };
const apt = (args) => run("sudo", ["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "-y", "--no-install-recommends", ...args], { stdio: "inherit" });
const durable = () => inventory(home).filter((row) => !row.path.includes("/cache/") && !row.path.includes("/Library/Caches/")).map(({ mode: _mode, ...row }) => row);
async function smoke(phase) {
  run(process.execPath, [path.join(desktop, "test/packaged.mjs"), "--installed"], { stdio: "inherit", env: { ...process.env, ATOM_DEB_QUALIFICATION_ROOT: scratch } });
  const native = JSON.parse(await fs.readFile(path.join(desktop, "test-results/packaged.json"), "utf8"));
  assert.equal(native.result, "PASS"); result.phases.push({ phase, native });
}
let installed = false;
try {
  // Exercise real dpkg upgrade maintainer-script dispatch without inventing an
  // older released desktop product. This fixture stays private to the VM.
  const fixtureRoot = path.join(scratch, "previous-package");
  run("dpkg-deb", ["--raw-extract", candidate, fixtureRoot]);
  const controlFile = path.join(fixtureRoot, "DEBIAN/control");
  await fs.writeFile(controlFile, (await fs.readFile(controlFile, "utf8")).replace(/^Version: .+$/m, `Version: ${version}~qualification.1`));
  const previous = path.join(scratch, "previous-qualification-only.deb");
  run("dpkg-deb", ["--root-owner-group", "--build", fixtureRoot, previous]);
  apt(["install", previous]); installed = true;
  assert.equal(run("dpkg-query", ["-W", "-f=${Version}", "atom-planner"]), `${version}~qualification.1`);
  assert.equal(await fs.stat("/opt/atom-planner/chrome-sandbox").then(() => true, () => false), false);
  assert.match(run("sudo", ["cat", "/sys/kernel/security/apparmor/profiles"]), /atom-planner \(unconfined\)/);
  await smoke("installed previous-package-version fixture");
  const beforeUpgrade = durable();
  apt(["install", candidate]);
  assert.equal(run("dpkg-query", ["-W", "-f=${Version}", "atom-planner"]), version);
  assert.deepEqual(durable(), beforeUpgrade, "apt upgrade must not touch native user data or files");
  await smoke("upgraded current candidate");
  const beforeRemoval = durable();
  apt(["remove", "atom-planner"]); installed = false;
  assert.deepEqual(durable(), beforeRemoval, "Removal must preserve native user data and files");
  assert.equal(await fs.stat("/opt/atom-planner/atom-desktop").then(() => true, () => false), false);
  apt(["purge", "atom-planner"]);
  assert.deepEqual(durable(), beforeRemoval, "Purge must preserve native user data and files");
  result.apt_upgrade_remove_purge_preserved_user_bytes = true; result.result = "PASS";
} catch (error) { result.result = "FAIL"; result.failure = error.message; throw error; }
finally {
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n");
  if (installed) { try { apt(["purge", "atom-planner"]); } catch { /* Disposable VM cleanup only. */ } }
  await fs.rm(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
