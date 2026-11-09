"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { readPortableFile, writePortableFile } = require("../lib/portable-file-io.cjs");
const { readProjectFile, MAX_PROJECT_BYTES } = require("../lib/project-file-io.cjs");
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atom-export-bytes-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, "Retained — çığ.zip");
}
test("binary exports retain exact non-UTF8 bytes and hashes through atomic replacement", async (t) => {
  const file = await fixture(t); const bytes = new Uint8Array([0x50, 0x4b, 0x00, 0xff, 0x80, 0x13]);
  const fingerprint = await writePortableFile(file, bytes, null);
  assert.equal(fingerprint.sha256, crypto.createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual((await readPortableFile(file)).bytes, Buffer.from(bytes));
  await assert.rejects(readProjectFile(file), { code: "file_encoding" });
  const next = new Uint8Array([0, 1, 255]); await writePortableFile(file, next, fingerprint);
  assert.deepEqual(await fs.readFile(file), Buffer.from(next));
});
test("the shared binary ceiling does not expand the portable-project format limit", async (t) => {
  const file = await fixture(t); const bytes = new Uint8Array(MAX_PROJECT_BYTES + 1); bytes[bytes.length - 1] = 0xff;
  const fingerprint = await writePortableFile(file, bytes, null);
  assert.equal(fingerprint.bytes, bytes.length);
  await assert.rejects(readProjectFile(file), { code: "file_too_large" });
  await assert.rejects(readPortableFile(file, { limit: 2 }), { code: "file_too_large" });
  assert.equal((await fs.stat(file)).size, bytes.length);
});
test("an asynchronous destination check cannot change the captured export bytes", async (t) => {
  const file = await fixture(t); const bytes = new Uint8Array([1, 2, 3]);
  const saving = writePortableFile(file, bytes, null); bytes.fill(255);
  await saving; assert.deepEqual(await fs.readFile(file), Buffer.from([1, 2, 3]));
});
