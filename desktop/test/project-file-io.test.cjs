"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { MAX_PROJECT_BYTES, approvedPath, readProjectFile, writeProjectFile } = require("../lib/project-file-io.cjs");

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atom-project-io-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, "Türkçe space.atom-project.json") };
}
test("portable bytes use the chosen Unicode destination and atomic private replacement", async (t) => {
  const { file } = await fixture(t);
  assert.equal(await approvedPath(file), path.join(await fs.realpath(path.dirname(file)), path.basename(file)));
  const text = JSON.stringify({ project: { name: "çağ space" } });
  const first = await writeProjectFile(file, text, null);
  assert.equal((await readProjectFile(file)).text, text); assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  const second = await writeProjectFile(file, `${text}\n`, first);
  assert.notEqual(first.inode, second.inode); assert.equal((await readProjectFile(file)).text, `${text}\n`);
});
test("external edits, replacements and missing destinations reject Save before changing bytes", async (t) => {
  const { file } = await fixture(t); const original = await writeProjectFile(file, "original", null);
  await fs.writeFile(file, "external edit");
  await assert.rejects(writeProjectFile(file, "do not overwrite", original), { code: "file_conflict" });
  assert.equal(await fs.readFile(file, "utf8"), "external edit");
  await fs.unlink(file); await assert.rejects(writeProjectFile(file, "do not recreate", original), { code: "file_conflict" });
  assert.equal(await fs.stat(file).then(() => true, () => false), false);
});
test("bounded UTF-8 reads reject oversize, symlinks, directories and FIFOs without hanging", async (t) => {
  const { file, directory } = await fixture(t);
  await fs.writeFile(file, Buffer.from([0xff])); await assert.rejects(readProjectFile(file), { code: "file_encoding" });
  await fs.writeFile(file, Buffer.alloc(MAX_PROJECT_BYTES + 1)); await assert.rejects(readProjectFile(file), { code: "file_too_large" });
  const link = path.join(directory, "link"); await fs.symlink(file, link); await assert.rejects(readProjectFile(link), { code: "file_symlink" });
  await assert.rejects(readProjectFile(directory), { code: "file_not_regular" });
  const fifo = path.join(directory, "fifo"); execFileSync("mkfifo", [fifo]); await assert.rejects(readProjectFile(fifo), { code: "file_not_regular" });
});
test("disk/quota/permission failures preserve the prior file and unrelated temporary files", async (t) => {
  const { file, directory } = await fixture(t); const original = await writeProjectFile(file, "last good", null);
  const interrupted = path.join(directory, ".unrelated.tmp"); await fs.writeFile(interrupted, "keep");
  for (const [operation, code] of [["writeFile", "ENOSPC"], ["sync", "EDQUOT"], ["rename", "EACCES"]]) {
    const fail = () => { const error = new Error(code); error.code = code; throw error; };
    const io = { ...fs, async open(name, ...args) {
      const handle = await fs.open(name, ...args);
      if (name.endsWith(".tmp") && operation !== "rename") handle[operation] = fail;
      return handle;
    }, ...(operation === "rename" ? { rename: fail } : {}) };
    await assert.rejects(writeProjectFile(file, "new bytes", original, { io }), { code: code === "EACCES" ? "file_permission" : "file_disk_full" });
    assert.equal(await fs.readFile(file, "utf8"), "last good");
    assert.deepEqual((await fs.readdir(directory)).sort(), [".unrelated.tmp", path.basename(file)].sort());
  }
});
test("an edit during staging is detected again before rename", async (t) => {
  const { file } = await fixture(t); const original = await writeProjectFile(file, "last good", null);
  const io = { ...fs, async open(name, ...args) {
    const handle = await fs.open(name, ...args);
    if (name.endsWith(".tmp")) {
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { await sync(); await fs.writeFile(file, "changed during save"); };
    }
    return handle;
  } };
  await assert.rejects(writeProjectFile(file, "staged bytes", original, { io }), { code: "file_conflict" });
  assert.equal(await fs.readFile(file, "utf8"), "changed during save");
});
