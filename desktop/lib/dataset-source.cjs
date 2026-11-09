"use strict";
const fs = require("node:fs");
const io = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const MAX_MANIFEST = 1024 * 1024;
const MAX_LAYER = 2 * 1024 ** 3;
const MAX_PACK = 4 * 1024 ** 3;
const LAYERS = new Set(["towers", "buildings", "terrain", "clutter", "building_heights", "materials"]);
class DatasetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalid = () => new DatasetError("dataset_invalid", "The pack is incomplete, changed, or invalid. Check its manifest, layer hashes, permissions, and declared files. The active pack was preserved.");
const canceled = () => new DatasetError("dataset_canceled", "Dataset operation canceled. The active pack was preserved.");
function checkAbort(signal) { if (signal?.aborted) throw canceled(); }
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function relativeFile(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 1024 && !path.isAbsolute(name) && !/[\\\x00-\x1f\x7f]/.test(name)
    && name.split("/").every((part) => part && part !== "." && part !== "..");
}
async function sourceRoot(selected) {
  const stat = await io.lstat(selected);
  if (stat.isSymbolicLink()) throw invalid();
  if (stat.isFile() && path.basename(selected) === "manifest.json") selected = path.dirname(selected);
  else if (!stat.isDirectory()) throw invalid();
  return io.realpath(selected);
}
async function openSource(root, name) {
  if (!relativeFile(name)) throw invalid();
  const file = path.join(root, name);
  const real = await io.realpath(file);
  if (!real.startsWith(root + path.sep)) throw invalid();
  const handle = await io.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > (name === "manifest.json" ? MAX_MANIFEST : MAX_LAYER)) throw invalid();
    return { handle, stat, file, real };
  } catch (error) { await handle.close(); throw error; }
}
const unchanged = (before, after) => ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((key) => before[key] === after[key]);
async function readManifest(root) {
  root = await io.realpath(root);
  const opened = await openSource(root, "manifest.json");
  try {
    const bounded = Buffer.alloc(MAX_MANIFEST + 1);
    let length = 0;
    while (length < bounded.length) {
      const { bytesRead } = await opened.handle.read(bounded, length, bounded.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const bytes = bounded.subarray(0, length);
    if (bytes.length > MAX_MANIFEST || !unchanged(opened.stat, await opened.handle.stat())) throw invalid();
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (!manifest || ["id", "name", "version"].some((key) => typeof manifest[key] !== "string" || !manifest[key].trim()
      || Buffer.byteLength(manifest[key].trim()) > 128)
      || !manifest.files || !manifest.sha256 || Object.keys(manifest.files).some((key) => !LAYERS.has(key))) throw invalid();
    const names = Object.values(manifest.files);
    if (!manifest.files.towers || !manifest.files.buildings || names.length > 6 || new Set(names).size !== names.length
      || names.some((name) => !relativeFile(name) || name === "manifest.json" || !/^[a-fA-F0-9]{64}$/.test(manifest.sha256[name] || ""))) throw invalid();
    return { manifest, bytes, sha256: digest(bytes) };
  } finally { await opened.handle.close(); }
}
async function streamLayer(root, name, expected, { signal, destination } = {}) {
  checkAbort(signal);
  root = await io.realpath(root);
  const opened = await openSource(root, name);
  let output;
  try {
    if (destination) {
      await io.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      output = await io.open(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    }
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.alloc(1024 * 1024);
    let total = 0;
    while (true) {
      checkAbort(signal);
      const { bytesRead } = await opened.handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > MAX_LAYER || total > opened.stat.size) throw invalid();
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      if (output) await output.writeFile(chunk);
    }
    if (hash.digest("hex") !== expected.toLowerCase() || total !== opened.stat.size || !unchanged(opened.stat, await opened.handle.stat())
      || await io.realpath(opened.file) !== opened.real) throw invalid();
    if (output) await output.sync();
    return total;
  } finally { await opened.handle.close(); await output?.close(); }
}
function validateWithGo(executable, root, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(executable, ["--validate-dataset-json", root, "--parent-lifetime-stdin"], { cwd: root, env: { GIN_MODE: "release" }, stdio: ["pipe", "pipe", "pipe"] }); }
    catch { reject(invalid()); return; }
    let bytes = 0; const chunks = []; let failed = false;
    child.stdin.on("error", () => {}); // Lifetime only; never send a payload.
    const stop = () => child.kill("SIGKILL");
    const timeout = setTimeout(() => { failed = true; stop(); }, 5 * 60_000);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    child.stdout.on("data", (chunk) => { bytes += chunk.length; if (bytes > MAX_MANIFEST) { failed = true; stop(); } else chunks.push(chunk); });
    child.stderr.on("data", () => {}); // Never surface paths or input contents.
    child.once("error", () => { failed = true; });
    child.once("close", (code) => {
      clearTimeout(timeout); signal?.removeEventListener("abort", stop);
      if (signal?.aborted) return reject(canceled());
      if (failed || code !== 0) return reject(invalid());
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(invalid()); }
    });
  });
}
async function inspectDataset(root, { executable, signal, validate = validateWithGo } = {}) {
  checkAbort(signal);
  root = await io.realpath(root);
  const source = await readManifest(root);
  let size = source.bytes.length;
  for (const name of Object.values(source.manifest.files)) {
    size += await streamLayer(root, name, source.manifest.sha256[name], { signal });
    if (size > MAX_PACK) throw invalid();
  }
  const manifest = await validate(executable, root, signal);
  const after = await readManifest(root);
  if (after.sha256 !== source.sha256 || manifest.id !== source.manifest.id || !isDeepStrictEqual(manifest.files, source.manifest.files)
    || !isDeepStrictEqual(manifest.sha256, source.manifest.sha256)) throw invalid();
  checkAbort(signal);
  return { root, manifest, sha256: source.sha256, size };
}
module.exports = { DatasetError, invalid, canceled, checkAbort, sourceRoot, readManifest, streamLayer, inspectDataset, validateWithGo, MAX_PACK };
