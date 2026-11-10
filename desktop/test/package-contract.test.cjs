"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateBuild, inventory, dataApproval, hash, productionEnvironment } = require("../lib/package-contract.cjs");
test("packages require clean matching version, commit and native architecture", () => {
  const source = { version: "1.2.3", commit: "abc", platform: "darwin", arch: "arm64", dirty: false };
  const info = { ...source, shell: "electron" };
  validateBuild(info, source);
  for (const key of ["version", "commit", "platform", "arch"]) assert.throws(() => validateBuild({ ...info, [key]: "wrong" }, source), /Rebuild/);
  assert.throws(() => validateBuild(info, { ...source, dirty: true }), /clean/);
  assert.throws(() => validateBuild({ ...info, arch: "riscv64" }, { ...source, arch: "riscv64" }), /target/);
});
test("inventory preserves executable bits and relative links while rejecting escapes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atom-package-unit-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "binary"), "real bytes", { mode: 0o755 }); fs.symlinkSync("binary", path.join(root, "alias"));
  const rows = inventory(root); assert.equal(rows.find((row) => row.path === "binary").mode, 0o755);
  assert.equal(rows.find((row) => row.path === "alias").symlink, "binary");
  fs.symlinkSync(os.tmpdir(), path.join(root, "escape")); assert.throws(() => inventory(root), /escapes/);
});
test("data upload approval fails closed unless reviewer, record and every exact hash match", () => {
  const manifest = Buffer.from("manifest"); const layerHashes = { "layer.json": hash("layer") };
  const review = { status: "approved", approval: { reviewer: "maintainer", record_url: "https://github.com/Berk-Unsal/atom/issues/155" }, manifest_sha256: hash(manifest), layer_sha256: layerHashes };
  assert.equal(dataApproval({ review, manifest, layerHashes }), true);
  for (const changes of [{ status: "pending-maintainer-review" }, { approval: null }, { manifest_sha256: "wrong" }, { layer_sha256: {} }]) {
    assert.equal(dataApproval({ review: { ...review, ...changes }, manifest, layerHashes }), false);
  }
  assert.equal(dataApproval({ review, manifest, layerHashes: { ...layerHashes, extra: "hash" } }), false);
});
test("desktop production builds exclude developer Vite values", () => {
  assert.deepEqual(productionEnvironment({ PATH: "tools", VITE_PROVIDER_KEY: "private", ATOM_DESKTOP_DEV: "1", LANG: "en" }), { PATH: "tools", LANG: "en" });
});
