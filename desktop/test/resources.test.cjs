"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { stageDatasetPack } = require("../lib/resources.cjs");

test("shared staging excludes undeclared captures, environments and caches", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "atom-pack-staging-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source"); const destination = path.join(directory, "resources");
  fs.mkdirSync(source); fs.mkdirSync(path.join(source, ".venv"));
  fs.writeFileSync(path.join(source, "manifest.json"), JSON.stringify({ files: { towers: "towers.json" } }));
  fs.writeFileSync(path.join(source, "towers.json"), "declared layer");
  fs.writeFileSync(path.join(source, "raw-capture.csv"), "private measurement");
  fs.writeFileSync(path.join(source, ".venv/secret"), "local credentials");
  stageDatasetPack({ source, destination });
  assert.deepEqual(fs.readdirSync(destination).sort(), ["manifest.json", "towers.json"]);
  assert.equal(fs.readFileSync(path.join(destination, "towers.json"), "utf8"), "declared layer");
});

test("manifest traversal, absolute references and symlinks cannot copy outside the pack", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "atom-pack-boundary-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source"); fs.mkdirSync(source);
  const privateFile = path.join(directory, "private.txt"); fs.writeFileSync(privateFile, "private");
  fs.symlinkSync(privateFile, path.join(source, "leak.txt"));
  for (const [index, file] of ["../private.txt", privateFile, "leak.txt"].entries()) {
    fs.writeFileSync(path.join(source, "manifest.json"), JSON.stringify({ files: { towers: file } }));
    assert.throws(() => stageDatasetPack({ source, destination: path.join(directory, `candidate-${index}`) }), /resource/);
  }
  assert.equal(fs.readFileSync(privateFile, "utf8"), "private");
});
