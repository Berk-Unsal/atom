"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const desktop = path.resolve(__dirname, "..");
const root = path.dirname(desktop);
const resources = path.join(desktop, "build/resources");
const staging = path.join(desktop, "build/staging");
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

// Local unsigned resources only. No installers or public data distribution.
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: path.join(root, "frontend-react"), stdio: "inherit" });
execFileSync("go", ["build", "-trimpath", "-ldflags", `-X main.appVersion=${version} -X main.buildCommit=${commit}`, "-o", path.join(staging, "atom-api"), "."],
  { cwd: path.join(root, "backend-go"), stdio: "inherit" });
fs.cpSync(path.join(root, "frontend-react/dist"), path.join(staging, "dist"), { recursive: true });
const datasetRoot = fs.realpathSync(path.join(root, "data-pipeline"));
const pack = path.join(staging, "data-pipeline");
const manifest = JSON.parse(fs.readFileSync(path.join(datasetRoot, "manifest.json"), "utf8"));
fs.mkdirSync(pack);
// Stage only the manifest-declared planning layers, never ignored captures,
// caches, Python environments or arbitrary files in a developer's data directory.
for (const relative of ["manifest.json", ...Object.values(manifest.files)]) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("Invalid dataset resource path");
  const source = fs.realpathSync(path.resolve(datasetRoot, relative));
  const destination = path.resolve(pack, relative);
  if (!source.startsWith(datasetRoot + path.sep) || !destination.startsWith(pack + path.sep)) throw new Error("Dataset resource escaped its pack");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
execFileSync("go", ["run", "./cmd/validate-dataset", pack], { cwd: path.join(root, "backend-go"), stdio: "inherit" });
fs.copyFileSync(path.join(root, "icon/png/atom-256.png"), path.join(staging, "atom.png"));
fs.writeFileSync(path.join(staging, "build-info.json"), JSON.stringify({ version, commit, platform: process.platform, arch: process.arch, shell: "electron", shellVersion: require("../package.json").devDependencies.electron }, null, 2));
fs.rmSync(resources, { recursive: true, force: true });
fs.renameSync(staging, resources);
console.log(`Local A.T.O.M ${version} resources built for ${process.platform}/${process.arch}. No installer or signed release was produced.`);
