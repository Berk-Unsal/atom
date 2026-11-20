"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { observeFileAssociation } = require("./file-association-observation.cjs");
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), "atom-file-identity-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "Çığ plan.atom-project.json"); await fs.writeFile(target, "{}", { mode: 0o600 }); return { root, target }; }
test("accepts the exact chosen file under a canonically equivalent Unicode spelling", async (t) => {
  const { target } = await fixture(t), alternative = target.normalize("NFD");
  // APFS addresses these spellings as one file. On other filesystems create
  // the equivalent same-inode fixture without changing the observed contract.
  if (!await fs.stat(alternative).then(() => true, () => false)) await fs.link(target, alternative);
  const observed = await observeFileAssociation({ path: alternative, dirty: false }, target);
  assert.equal(observed.lexical_path_matches, false); assert.equal(observed.normalized_filename_matches, true);
  assert.equal(observed.file_identity_matches, true); assert.equal(observed.parent_identity_matches, true); assert.equal(observed.valid, true);
});
test("rejects byte-identical files that have a different filesystem identity", async (t) => {
  const { root, target } = await fixture(t), other = path.join(root, "other"); await fs.mkdir(other);
  const candidate = path.join(other, path.basename(target)); await fs.copyFile(target, candidate);
  const observed = await observeFileAssociation({ path: candidate, dirty: false }, target); assert.equal(observed.file_identity_matches, false); assert.equal(observed.valid, false);
});
test("rejects a same-inode file in a different chosen parent directory", async (t) => {
  const { root, target } = await fixture(t), other = path.join(root, "other"); await fs.mkdir(other);
  const candidate = path.join(other, path.basename(target)); await fs.link(target, candidate);
  const observed = await observeFileAssociation({ path: candidate, dirty: false }, target); assert.equal(observed.file_identity_matches, true); assert.equal(observed.parent_identity_matches, false); assert.equal(observed.valid, false);
});
test("never accepts dirty, absent or unavailable associations", async (t) => {
  const { root, target } = await fixture(t);
  assert.equal((await observeFileAssociation({ path: target, dirty: true }, target)).valid, false);
  assert.equal((await observeFileAssociation({ path: target }, target)).valid, false);
  assert.equal((await observeFileAssociation(null, target)).valid, false);
  assert.equal((await observeFileAssociation({ path: path.join(root, "missing", path.basename(target)), dirty: false }, target)).valid, false);
});
