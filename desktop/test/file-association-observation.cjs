"use strict";
const fs = require("node:fs/promises"), path = require("node:path");

// Test-side identity observation: macOS can return a canonically equivalent
// spelling of the chosen Unicode filename or a system directory alias.
async function observeFileAssociation(row, target) {
  const result = { associated: typeof row?.path === "string" && path.isAbsolute(row.path), clean: row?.dirty === false,
    lexical_path_matches: row?.path === target, normalized_filename_matches: typeof row?.path === "string" && path.basename(row.path).normalize("NFC") === path.basename(target).normalize("NFC"),
    file_identity_matches: false, parent_identity_matches: false, valid: false };
  if (!result.associated || !result.normalized_filename_matches) return result;
  try {
    const [chosen, actual, chosenParent, actualParent] = await Promise.all([
      fs.stat(target), fs.stat(row.path), fs.stat(path.dirname(target)), fs.stat(path.dirname(row.path)),
    ]);
    result.file_identity_matches = chosen.isFile() && actual.isFile() && chosen.dev === actual.dev && chosen.ino === actual.ino;
    result.parent_identity_matches = chosenParent.isDirectory() && actualParent.isDirectory() && chosenParent.dev === actualParent.dev && chosenParent.ino === actualParent.ino;
    result.valid = result.clean && result.file_identity_matches && result.parent_identity_matches;
  } catch { result.filesystem_identity_unavailable = true; }
  return result;
}
module.exports = { observeFileAssociation };
