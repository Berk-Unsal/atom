"use strict";
const test = require("node:test"); const assert = require("node:assert/strict"); const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
const { collectNotices, moduleIdentity, componentSlug, runtimeBOM, stableSerial, selectRuntimeNpm } = require("../lib/license-inventory.cjs");
test("production closure retains shared dev/peer runtime packages and excludes build tools", () => {
  const lock = { lockfileVersion: 3, packages: { "": { dependencies: { ui: "1" }, devDependencies: { tool: "1" } }, "node_modules/ui": { version: "1", peerDependencies: { react: "1" } }, "node_modules/react": { version: "1", dev: true }, "node_modules/tool": { version: "1" } } };
  const full = { metadata: { component: { "bom-ref": "root" } }, components: ["ui", "react", "tool"].map((name) => ({ name, version: "1", "bom-ref": name })), dependencies: [{ ref: "root", dependsOn: ["ui", "tool"] }, { ref: "ui", dependsOn: ["react"] }] };
  const selected = selectRuntimeNpm(lock, full); assert.deepEqual(selected.bom.components.map((item) => item.name), ["react", "ui"]);
  assert.deepEqual(selected.bom.dependencies[0].dependsOn, ["ui"]); assert.equal(selected.rows[0].location, "node_modules/react");
  delete lock.packages["node_modules/react"]; assert.throws(() => selectRuntimeNpm(lock, full), /Missing runtime/);
});
test("notice collection preserves original text, nested license sets and hashes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atom-notices-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source"); const target = path.join(root, "target"); fs.mkdirSync(path.join(source, "LICENSES"), { recursive: true });
  fs.writeFileSync(path.join(source, "LICENSES/MIT.txt"), "Exact upstream text\n"); fs.writeFileSync(path.join(source, "NOTICE"), "Upstream attribution\n"); fs.writeFileSync(path.join(source, ".env"), "must never copy");
  const rows = collectNotices(source, target); assert.equal(rows.length, 2);
  assert.equal(fs.readFileSync(path.join(target, "LICENSES/MIT.txt"), "utf8"), "Exact upstream text\n"); assert.match(rows[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(target, ".env")), false);
});
test("notice links cannot copy files from outside a dependency", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atom-notices-link-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "source")); fs.writeFileSync(path.join(root, "outside"), "private fixture"); fs.symlinkSync("../outside", path.join(root, "source/LICENSE"));
  assert.throws(() => collectNotices(path.join(root, "source"), path.join(root, "target")), /links require review/);
  assert.doesNotMatch(componentSlug("../../module", "v1"), /\//);
});
test("linked Go license sources must have the exact version/checksum and no local replacement", () => {
  const module = { Path: "github.com/example/module", Version: "v1.2.3", Sum: "h1:YWJjZA==" }; assert.equal(moduleIdentity(module), module);
  assert.throws(() => moduleIdentity({ ...module, Replace: { Path: "../local" } }), /versioned/);
  assert.throws(() => moduleIdentity({ ...module, Sum: "" }), /checksummed/);
});
test("runtime SBOM preserves npm graph and exact linked Go versions with stable identity", () => {
  const npmBOM = { metadata: { component: { type: "library", name: "frontend", version: "0.13.1", "bom-ref": "frontend" }, tools: [] }, components: [{ type: "library", name: "react", version: "18.3.1", "bom-ref": "react" }], dependencies: [{ ref: "frontend", dependsOn: ["react"] }] };
  const build = { version: "0.13.1", commit: "a".repeat(40), platform: "darwin", arch: "arm64" };
  const input = { npmBOM, goInfo: { GoVersion: "go1.26.10", Deps: [{ Path: "github.com/example/module", Version: "v1.2.3", Sum: "h1:YWJjZA==" }] }, build, binarySHA256: "b".repeat(64), noticeIndex: { notices_complete: false }, timestamp: "2026-11-10T00:00:00Z", electronVersion: "44.10.2" };
  const bom = runtimeBOM(input); assert.equal(bom.metadata.component.version, build.version); assert.equal(bom.specVersion, "1.5");
  assert.ok(bom.dependencies.some((dependency) => dependency.ref === "frontend" && dependency.dependsOn.includes("react")));
  assert.ok(bom.components.some((component) => component.name === "github.com/example/module" && component.version === "v1.2.3"));
  assert.equal(bom.properties.find((property) => property.name === "atom:notices:complete").value, "false");
  assert.equal(runtimeBOM(input).serialNumber, bom.serialNumber); assert.notEqual(stableSerial("another candidate"), bom.serialNumber);
});
