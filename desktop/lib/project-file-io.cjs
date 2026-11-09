"use strict";

const { NativeFileError: ProjectFileError, normalizeFileError, approvedPath, readPortableFile, writePortableFile, sameFingerprint } = require("./portable-file-io.cjs");
const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
async function readProjectFile(file, options = {}) {
  const loaded = await readPortableFile(file, { ...options, limit: MAX_PROJECT_BYTES, label: "Project file" });
  if (!loaded) return null;
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(loaded.bytes); }
  catch { throw new ProjectFileError("file_encoding", "Project files must contain valid UTF-8 JSON."); }
  return { text, fingerprint: loaded.fingerprint };
}
async function writeProjectFile(file, text, expected, options = {}) {
  if (typeof text !== "string") throw new ProjectFileError("file_invalid_content", "Serialize the project before saving.");
  if (Buffer.byteLength(text, "utf8") > MAX_PROJECT_BYTES) throw new ProjectFileError("file_too_large", "Project file must be no larger than 16 MiB");
  return writePortableFile(file, Buffer.from(text, "utf8"), expected, { ...options, limit: MAX_PROJECT_BYTES, label: "Project file" });
}
module.exports = { MAX_PROJECT_BYTES, ProjectFileError, normalizeFileError, approvedPath, readProjectFile, writeProjectFile, sameFingerprint };
