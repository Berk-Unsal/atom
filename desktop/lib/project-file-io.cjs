"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
class ProjectFileError extends Error {
  constructor(code, message, options) { super(message, options); this.code = code; }
}
function normalizeFileError(error) {
  if (error instanceof ProjectFileError) return error;
  const message = {
    EACCES: ["file_permission", "The chosen file or folder is not writable/readable. Check permissions or choose another destination."],
    EPERM: ["file_permission", "Access to the chosen file was denied. Check permissions or choose another destination."],
    ENOSPC: ["file_disk_full", "The file could not be saved because the destination is full. Free space or choose another destination."],
    EDQUOT: ["file_disk_full", "The file could not be saved because the destination quota is exhausted. Free space or choose another destination."],
    ENOENT: ["file_missing", "The chosen file or folder is missing. Use Open or Save As to choose an available destination."],
    ELOOP: ["file_symlink", "Choose a regular project file rather than a symbolic link."],
  }[error?.code] || ["file_failed", "The file operation failed. The previous file and association are preserved; check the destination and retry."];
  return new ProjectFileError(...message, { cause: error });
}
const conflict = () => new ProjectFileError("file_conflict", "The destination changed outside A.T.O.M. The file was not overwritten. Open it separately or use Save As to choose a destination explicitly.");
const fingerprint = (stat, hash) => ({ sha256: hash, bytes: Number(stat.size), device: stat.dev.toString(), inode: stat.ino.toString(), modified: stat.mtimeNs.toString() });
const sameFingerprint = (first, second) => first === null && second === null || Boolean(first && second &&
  ["sha256", "bytes", "device", "inode", "modified"].every((key) => first[key] === second[key]));

async function approvedPath(file, io = fsp) {
  if (typeof file !== "string" || !path.isAbsolute(file) || file.includes("\0") || file.length > 16_384) throw new ProjectFileError("file_invalid_path", "Choose an absolute native file destination.");
  // Pin the user-approved parent instead of following a later retargeted alias.
  return path.join(await io.realpath(path.dirname(file)), path.basename(file));
}

async function readProjectFile(file, { io = fsp, missing = false } = {}) {
  let handle;
  try {
    // NONBLOCK prevents a hostile FIFO from hanging before the regular-file
    // check; NOFOLLOW keeps a selected/replaced symlink from changing authority.
    handle = await io.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new ProjectFileError("file_not_regular", "Choose a regular project file.");
    if (before.size > BigInt(MAX_PROJECT_BYTES)) throw new ProjectFileError("file_too_large", "Project file must be no larger than 16 MiB");
    const buffer = Buffer.alloc(MAX_PROJECT_BYTES + 1); let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break; length += bytesRead;
    }
    if (length > MAX_PROJECT_BYTES) throw new ProjectFileError("file_too_large", "Project file must be no larger than 16 MiB");
    const after = await handle.stat({ bigint: true });
    const current = await io.lstat(file, { bigint: true });
    if (!current.isFile() || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ino !== current.ino || before.dev !== current.dev || after.mtimeNs !== current.mtimeNs) throw conflict();
    const bytes = buffer.subarray(0, length);
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new ProjectFileError("file_encoding", "Project files must contain valid UTF-8 JSON."); }
    return { text, fingerprint: fingerprint(after, crypto.createHash("sha256").update(bytes).digest("hex")) };
  } catch (error) {
    if (missing && error.code === "ENOENT") return null;
    throw normalizeFileError(error);
  } finally { await handle?.close(); }
}

async function writeProjectFile(file, text, expected, { io = fsp } = {}) {
  if (typeof text !== "string") throw new ProjectFileError("file_invalid_content", "Serialize the project before saving.");
  if (Buffer.byteLength(text, "utf8") > MAX_PROJECT_BYTES) throw new ProjectFileError("file_too_large", "Project file must be no larger than 16 MiB");
  const bytes = Buffer.from(text, "utf8");
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    const current = await readProjectFile(file, { io, missing: true });
    if (!sameFingerprint(current?.fingerprint || null, expected)) throw conflict();
    handle = await io.open(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes); await handle.sync();
    const written = fingerprint(await handle.stat({ bigint: true }), crypto.createHash("sha256").update(bytes).digest("hex"));
    await handle.close(); handle = null;
    const checked = await readProjectFile(file, { io, missing: true });
    if (!sameFingerprint(checked?.fingerprint || null, expected)) throw conflict();
    // Commit point. No fallible post-rename operation may report that the old
    // file survived. This is conflict detection, not a cross-process file lock.
    await io.rename(temporary, file);
    try { const directory = await io.open(path.dirname(file), "r"); try { await directory.sync(); } finally { await directory.close(); } } catch { /* Some filesystems cannot fsync directories. */ }
    return written;
  } catch (error) { throw normalizeFileError(error); }
  finally {
    await handle?.close().catch(() => {});
    await io.unlink(temporary).catch(() => {});
  }
}

module.exports = { MAX_PROJECT_BYTES, ProjectFileError, normalizeFileError, approvedPath, readProjectFile, writeProjectFile, sameFingerprint };
