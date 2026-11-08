"use strict";
const fs = require("node:fs");
const path = require("node:path");

/** Shared by local builds and dist-free development staging. Only declared
 * planning layers belong in resources, never a pipeline's captures or caches. */
function stageDatasetPack({ source, destination }) {
  if (!path.isAbsolute(source) || !path.isAbsolute(destination)) throw new Error("Dataset resource paths must be absolute");
  const root = fs.realpathSync(source);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  fs.mkdirSync(destination);
  for (const relative of ["manifest.json", ...Object.values(manifest.files)]) {
    if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("Invalid dataset resource path");
    const input = fs.realpathSync(path.resolve(root, relative));
    const output = path.resolve(destination, relative);
    if (!input.startsWith(root + path.sep) || !output.startsWith(destination + path.sep)) throw new Error("Dataset resource escaped its pack");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(input, output);
  }
  return manifest;
}

module.exports = { stageDatasetPack };
