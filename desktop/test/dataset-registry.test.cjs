"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { DatasetRegistry } = require("../lib/dataset-registry.cjs");
const { SettingsStore } = require("../lib/settings-store.cjs");
const { inspectDataset, readManifest, DatasetError } = require("../lib/dataset-source.cjs");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
async function pack(root, id = "reference", version = "v1") {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const files = { towers: "layers/towers.geojson", buildings: "layers/buildings.geojson" };
  const sha256 = {};
  for (const name of Object.values(files)) {
    const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}');
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), bytes); sha256[name] = hash(bytes);
  }
  const manifest = { schema_version: 2, id, name: `Türkçe ${id}`, version, crs: "EPSG:4326", bounds: [32, 39, 33, 40], generated_at: "2026-11-09",
    sources: ["test source"], licenses: ["test license"], confidence: "fixture", files, sha256 };
  await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, "unrelated-secret.txt"), "never copy");
  return manifest;
}
const inspect = (root, options) => inspectDataset(root, { ...options, validate: async () => JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8")) });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "atom-dataset-unit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bundledRoot = path.join(root, "bundle"); await pack(bundledRoot, "bundle");
  const source = path.join(root, "Dış kaynak"); await pack(source);
  const packsRoot = path.join(root, "private/packs"); await fs.mkdir(packsRoot, { recursive: true, mode: 0o700 });
  const settings = new SettingsStore(path.join(root, "config/settings.json")); settings.load(); settings.save(settings.value);
  const calls = [];
  const registry = new DatasetRegistry({ settings, packsRoot, registryFile: path.join(root, "runtime/registry.json"), bundledRoot,
    executable: "/owned/atom-api", inspect, selectSource: async () => ({ canceled: false, filePaths: [source] }),
    activate: async (entry) => { calls.push(entry.id); return { status: "active", dataset: { id: entry.id } }; } });
  await registry.initialize();
  return { root, source, registry, settings, packsRoot, calls };
}
test("managed copy contains only declared bytes; registry and selection survive restart", async (t) => {
  const { registry, source, settings, packsRoot } = await fixture(t);
  const before = await fs.readFile(path.join(source, "manifest.json"));
  const selected = await registry.choose("directory");
  assert.equal(selected.manifest.sources[0], "test source"); assert.ok(selected.bytes > before.length);
  assert.deepEqual(await registry.install({ ticket: selected.ticket, mode: "managed" }), { registered: true, id: "reference", mode: "managed" });
  const entry = settings.value.datasets[0]; assert.equal(path.dirname(entry.path), packsRoot);
  assert.equal((await fs.stat(entry.path)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(entry.path, "layers/towers.geojson"))).mode & 0o777, 0o600);
  await assert.rejects(fs.stat(path.join(entry.path, "unrelated-secret.txt")), { code: "ENOENT" });
  assert.deepEqual(await fs.readFile(path.join(source, "manifest.json")), before);
  await registry.activateID("reference"); assert.equal(settings.value.preferences.activeDataset, "reference");
  settings.load(); assert.equal(await registry.initialize(), entry.path);
  const roots = JSON.parse(await fs.readFile(registry.registryFile)); assert.deepEqual(roots.entries.map((value) => value.id), ["bundle", "reference"]);
  assert.equal((await fs.stat(registry.registryFile)).mode & 0o777, 0o600);
  const again = await registry.choose("manifest"); await registry.install({ ticket: again.ticket, mode: "managed" });
  assert.equal(settings.value.datasets.length, 1);
});
test("changed references and conflicting duplicate IDs preserve the active pack; explicit same-hash locate repairs movement", async (t) => {
  const { registry, source, settings, calls } = await fixture(t);
  const selected = await registry.choose("directory"); await registry.install({ ticket: selected.ticket, mode: "reference" });
  await registry.activateID("reference");
  const original = await fs.readFile(path.join(source, "manifest.json"));
  const changed = JSON.parse(original); changed.version = "v2";
  await fs.writeFile(path.join(source, "manifest.json"), JSON.stringify(changed));
  await assert.rejects(registry.activateID("reference"), { code: "dataset_invalid" });
  await assert.rejects(registry.choose("directory"), { code: "dataset_duplicate" });
  assert.deepEqual(calls, ["reference"]); assert.equal(settings.value.preferences.activeDataset, "reference");
  await fs.writeFile(path.join(source, "manifest.json"), original);
  const moved = source + "-moved"; await fs.rename(source, moved);
  await assert.rejects(registry.activateID("reference"), { code: "dataset_unavailable" });
  registry.selectSource = async () => ({ filePaths: [path.join(moved, "manifest.json")] });
  const located = await registry.choose("manifest"); await registry.install({ ticket: located.ticket, mode: "reference" });
  assert.equal(settings.value.datasets[0].path, await fs.realpath(moved));
  await registry.activateID("reference"); assert.equal(calls.length, 2);
});
test("hash corruption, traversal, symlink escape and changed pending selections are rejected", async (t) => {
  const { registry, source, root, settings } = await fixture(t);
  const manifestFile = path.join(source, "manifest.json");
  const original = await fs.readFile(manifestFile); const manifest = JSON.parse(original);
  const towers = path.join(source, manifest.files.towers); const bytes = await fs.readFile(towers);
  await fs.writeFile(towers, "corrupt"); await assert.rejects(registry.choose("directory"));
  await fs.writeFile(towers, bytes);
  for (const name of ["../escape.geojson", "layers/../towers.geojson", "/tmp/escape.geojson", "layers\\escape"]) {
    await fs.writeFile(manifestFile, JSON.stringify({ ...manifest, files: { ...manifest.files, towers: name }, sha256: { ...manifest.sha256, [name]: hash(bytes) } }));
    await assert.rejects(registry.choose("directory"));
  }
  await fs.writeFile(manifestFile, original);
  const outside = path.join(root, "outside.geojson"); await fs.writeFile(outside, bytes);
  await fs.unlink(towers); await fs.symlink(outside, towers); await assert.rejects(registry.choose("directory"));
  await fs.unlink(towers); await fs.writeFile(towers, bytes);
  const selected = await registry.choose("directory");
  await fs.writeFile(manifestFile, JSON.stringify({ ...manifest, version: "changed-after-dialog" }));
  await assert.rejects(registry.install({ ticket: selected.ticket, mode: "managed" }));
  assert.equal(settings.value.datasets.length, 0);
});
test("chooser cancellation, expired tickets, busy operations and owned validation cancellation cannot commit", async (t) => {
  const { registry, settings } = await fixture(t);
  const chooseSource = registry.selectSource;
  registry.selectSource = async () => ({ canceled: true });
  assert.deepEqual(await registry.choose("directory"), { canceled: true });
  registry.selectSource = chooseSource;
  const selected = await registry.choose("directory"); registry.ticket.expires = 0;
  assert.throws(() => registry.install({ ticket: selected.ticket, mode: "reference" }), { code: "dataset_ticket" });
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  registry.inspect = (_root, { signal }) => new Promise((_resolve, reject) => { started(); signal.addEventListener("abort", () => reject(new DatasetError("dataset_canceled", "Canceled")), { once: true }); });
  const pending = registry.choose("directory"); await ready;
  await assert.rejects(registry.choose("directory"), { code: "file_busy" });
  assert.deepEqual(registry.cancel(), { canceled: true });
  await assert.rejects(pending, { code: "dataset_canceled" });
  assert.equal(registry.busy, false); assert.equal(settings.value.datasets.length, 0);
});
test("permission/copy failure leaves registry unchanged and removes incomplete staging", async (t) => {
  const { registry, settings, packsRoot } = await fixture(t);
  const selected = await registry.choose("directory");
  await fs.chmod(packsRoot, 0o500);
  try { await assert.rejects(registry.install({ ticket: selected.ticket, mode: "managed" })); }
  finally { await fs.chmod(packsRoot, 0o700); }
  assert.equal(settings.value.datasets.length, 0); assert.deepEqual(await fs.readdir(packsRoot), []);
  const next = await registry.choose("directory");
  const inspectBefore = registry.inspect;
  registry.inspect = async (root, options) => {
    if (root.includes(".staging-")) { registry.cancel(); }
    return inspectBefore(root, options);
  };
  await assert.rejects(registry.install({ ticket: next.ticket, mode: "managed" }), { code: "dataset_canceled" });
  assert.equal(settings.value.datasets.length, 0); assert.deepEqual(await fs.readdir(packsRoot), []);
});
test("post-commit runtime/settings failures report the actual completed operation", async (t) => {
  const { registry, settings } = await fixture(t);
  const selected = await registry.choose("directory");
  const originalPublish = registry.publishRoots.bind(registry);
  registry.publishRoots = () => { throw new Error("disk full"); };
  const installed = await registry.install({ ticket: selected.ticket, mode: "reference" });
  assert.equal(installed.registered, true); assert.match(installed.warning, /registered.*runtime registry/);
  assert.equal(settings.value.datasets.length, 1); registry.publishRoots = originalPublish;
  const originalSave = settings.save.bind(settings);
  settings.save = () => { throw new Error("permission"); };
  const active = await registry.activateID("reference");
  assert.equal(active.status, "active"); assert.match(active.warning, /active.*startup preference/);
  settings.save = originalSave;
});
test("missing bundled metadata leaves explicit native recovery available", async (t) => {
  const { registry, settings } = await fixture(t);
  await fs.rm(registry.bundledRoot, { recursive: true });
  await registry.initialize(); assert.match(registry.status().warning, /Bundled dataset/);
  const selected = await registry.choose("directory"); await registry.install({ ticket: selected.ticket, mode: "reference" });
  assert.equal(settings.value.datasets.length, 1);
  assert.equal((await readManifest(settings.value.datasets[0].path)).manifest.id, "reference");
});
test("corrupt startup selection cannot silently substitute the bundled pack or rewrite settings", async (t) => {
  const { registry, settings } = await fixture(t);
  for (const activeDataset of [false, 0, null, "", "   ", "x".repeat(129)]) {
    settings.save({ ...settings.value, preferences: { activeDataset } });
    const before = await fs.readFile(settings.file);
    await assert.rejects(registry.initialize(), { code: "dataset_registry_invalid" });
    assert.deepEqual(await fs.readFile(settings.file), before);
  }
  settings.save({ ...settings.value, preferences: { activeDataset: "missing-pack" } });
  assert.notEqual(await registry.initialize(), registry.bundledRoot);
});
test("legacy metadata survives unchanged without becoming an approved root; explicit validation upgrades only the chosen record", async (t) => {
  const { registry, settings, source, calls } = await fixture(t);
  const legacy = { id: "reference", path: source, note: "old schema-1 registry metadata" };
  settings.save({ ...settings.value, datasets: [legacy, { id: "unavailable-metadata", path: "/not-mounted" }] });
  const original = await fs.readFile(settings.file);
  await registry.initialize();
  assert.deepEqual(await fs.readFile(settings.file), original);
  assert.equal(registry.status().datasets.find((entry) => entry.id === "reference").needs_validation, true);
  assert.deepEqual(JSON.parse(await fs.readFile(registry.registryFile)).entries.map((entry) => entry.id), ["bundle"]);
  await assert.rejects(registry.activateID("reference")); assert.deepEqual(calls, []);
  const selected = await registry.choose("directory"); await registry.install({ ticket: selected.ticket, mode: "reference" });
  assert.equal(settings.value.datasets.find((entry) => entry.id === "reference").manifest_sha256, selected.manifest_sha256);
  assert.deepEqual(settings.value.datasets.find((entry) => entry.id === "unavailable-metadata"), { id: "unavailable-metadata", path: "/not-mounted" });
  await registry.activateID("reference"); assert.deepEqual(calls, ["reference"]);
});
