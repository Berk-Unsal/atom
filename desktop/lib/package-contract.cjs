"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const BUNDLE_ID = "io.github.berk-unsal.atom";
const RESOURCE_NAMES = ["atom-api", "atom.png", "build-info.json", "data-pipeline", "dist"];
const HOST_NAMES = ["main.cjs", "preload.cjs", "lib"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function validateBuild(info, { version, commit, platform, arch, dirty }) {
  if (dirty) throw new Error("Package a committed, clean checkout");
  for (const [key, value] of Object.entries({ version, commit, platform, arch, shell: "electron" })) {
    if (info[key] !== value) throw new Error(`Rebuild native resources: ${key} does not match package source/target`);
  }
  if (!["darwin/arm64", "darwin/x64", "linux/x64"].includes(`${platform}/${arch}`)) throw new Error("Unqualified package target");
}

// Record every installed byte and executable bit. Follow no directory links;
// Electron's relative Framework links are allowed only within the bundle.
function inventory(root) {
  root = fs.realpathSync(root);
  const rows = [];
  const walk = (relative) => {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(absolute);
      const resolved = fs.realpathSync(absolute);
      if (path.isAbsolute(target) || !resolved.startsWith(root + path.sep)) throw new Error("Package link escapes bundle");
      rows.push({ path: relative, symlink: target });
    } else if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) walk(path.join(relative, name));
    } else if (stat.isFile()) rows.push({ path: relative, bytes: stat.size, mode: stat.mode & 0o777, sha256: hash(fs.readFileSync(absolute)) });
    else throw new Error("Package contains a non-regular resource");
  };
  walk("");
  return rows;
}

function dataApproval({ review, manifest, layerHashes }) {
  // Exact bytes, rather than repository presence or a mutable dataset label.
  return review?.status === "approved" && review.layer_sha256 && typeof review.layer_sha256 === "object"
    && typeof review.approval?.reviewer === "string" && review.approval.reviewer.trim()
    && typeof review.approval?.record_url === "string" && /^https:\/\//.test(review.approval.record_url)
    && review.manifest_sha256 === hash(manifest)
    && Object.keys(review.layer_sha256).length === Object.keys(layerHashes).length
    && Object.entries(layerHashes).every(([name, digest]) => review.layer_sha256[name] === digest)
    ? true : false;
}

function productionEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith("VITE_") && key !== "ATOM_DESKTOP_DEV"));
}

module.exports = { BUNDLE_ID, RESOURCE_NAMES, HOST_NAMES, hash, validateBuild, inventory, dataApproval, productionEnvironment };
