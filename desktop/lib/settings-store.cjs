"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { privateDirectory } = require("./native-paths.cjs");

const MAX_SETTINGS_BYTES = 256 * 1024;
const emptySettings = () => ({ schema: 1, preferences: {}, datasets: [], recentFiles: [] });
const plain = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function validateSettings(value) {
  if (!plain(value) || value.schema !== 1 || !plain(value.preferences) || !Array.isArray(value.datasets) || !Array.isArray(value.recentFiles)
    || Object.keys(value).some((key) => !["schema", "preferences", "datasets", "recentFiles"].includes(key))
    || value.datasets.length > 100 || value.recentFiles.length > 20) throw new Error("Unsupported or invalid desktop settings; the original file is preserved");
  for (const entry of value.datasets) {
    if (!plain(entry) || typeof entry.id !== "string" || !entry.id || entry.id.length > 200 || !path.isAbsolute(entry.path || "")) throw new Error("Invalid dataset registry entry");
  }
  for (const entry of value.recentFiles) {
    if (!plain(entry) || !path.isAbsolute(entry.path || "") || typeof entry.projectId !== "string" || !entry.projectId || !["project", "report"].includes(entry.kind)) throw new Error("Invalid recent-file association");
  }
  return value;
}

// The rename is the commit point: failure before it preserves the previous
// file. Unique O_EXCL/O_NOFOLLOW siblings cannot clobber an interrupted write.
function atomicWriteJSON(file, value, { io = fs, limit = MAX_SETTINGS_BYTES } = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > limit) throw new Error("Desktop settings exceed their size limit");
  privateDirectory(path.dirname(file), io);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = io.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    io.writeFileSync(descriptor, bytes); io.fsyncSync(descriptor); io.closeSync(descriptor); descriptor = undefined;
    io.renameSync(temporary, file);
    // Persist the rename where the filesystem supports directory fsync. Once
    // committed, a directory-fsync error must not imply the old file survived.
    try { const directory = io.openSync(path.dirname(file), "r"); try { io.fsyncSync(directory); } finally { io.closeSync(directory); } } catch { /* filesystem may not support directory fsync */ }
  } finally {
    if (descriptor !== undefined) try { io.closeSync(descriptor); } catch { /* preserve original error */ }
    try { io.unlinkSync(temporary); } catch { /* absent after a successful rename */ }
  }
}

class SettingsStore {
  constructor(file, { io = fs } = {}) { this.file = file; this.io = io; this.value = null; }
  load() {
    try {
      const stat = this.io.lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.size > MAX_SETTINGS_BYTES) throw new Error("Desktop settings must be a private bounded regular file");
      this.value = validateSettings(JSON.parse(this.io.readFileSync(this.file, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.value = emptySettings();
    }
    return structuredClone(this.value);
  }
  save(value) {
    validateSettings(value);
    atomicWriteJSON(this.file, value, { io: this.io });
    this.value = structuredClone(value);
    return structuredClone(this.value);
  }
}

module.exports = { SettingsStore, atomicWriteJSON, validateSettings, emptySettings };
