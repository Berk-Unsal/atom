"use strict";
const fs = require("node:fs"); const path = require("node:path"); const { createHash } = require("node:crypto");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const NOTICE = /^(?:LICEN[CS]ES?|COPYING|NOTICE|COPYRIGHT|AUTHORS|PATENTS|THIRD[-_ .]?PARTY)(?:[._ -].*)?$/i;
function selectRuntimeNpm(lock, fullBOM) {
  const packages = lock.packages; if (lock.lockfileVersion < 3 || !packages?.[""]) throw new Error("A current npm lockfile is required");
  const selected = new Set([""]); const queue = [""];
  const resolve = (from, name) => {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || name.split("/").some((part) => part === "." || part === "..")) throw new Error("Invalid npm dependency name");
    let directory = from;
    for (;;) {
      const location = `${directory ? directory + "/" : ""}node_modules/${name}`;
      if (packages[location]) return location;
      if (!directory) return null;
      const index = directory.lastIndexOf("node_modules/"); directory = index > 0 ? directory.slice(0, index - 1) : "";
    }
  };
  while (queue.length) {
    const from = queue.shift(); const item = packages[from];
    const dependencies = { ...item.dependencies, ...item.optionalDependencies, ...item.peerDependencies };
    for (const name of Object.keys(dependencies).sort()) {
      const location = resolve(from, name);
      if (!location) { if (item.optionalDependencies?.[name] || item.peerDependenciesMeta?.[name]?.optional) continue; throw new Error(`Missing runtime dependency ${name}`); }
      if (!selected.has(location)) { selected.add(location); queue.push(location); }
    }
  }
  const rows = [...selected].filter(Boolean).sort().map((location) => {
    const item = packages[location]; if (item.link) throw new Error("Local npm dependency links require review");
    const name = item.name || location.slice(location.lastIndexOf("node_modules/") + 13);
    const component = fullBOM.components.find((component) => component.name === name && component.version === item.version);
    if (!component) throw new Error(`Installed npm SBOM is missing locked runtime component ${name}`);
    return { location, component };
  });
  const refs = new Set([fullBOM.metadata.component["bom-ref"], ...rows.map((row) => row.component["bom-ref"])]);
  const components = [...new Map(rows.map((row) => [row.component["bom-ref"], row.component])).values()];
  return { rows, bom: { ...fullBOM, components, dependencies: fullBOM.dependencies.filter((entry) => refs.has(entry.ref)).map((entry) => ({ ...entry, dependsOn: entry.dependsOn.filter((ref) => refs.has(ref)) })) } };
}
function componentSlug(name, version) { return encodeURIComponent(`${name}@${version}`); }
function moduleIdentity(module) {
  const selected = module.Replace || module;
  if (!/^[A-Za-z0-9][A-Za-z0-9./_~!+\-]*$/.test(selected.Path || "") || !/^v[0-9][A-Za-z0-9.+\-]*$/.test(selected.Version || "")
    || !/^h1:[A-Za-z0-9+/]+=*$/.test(selected.Sum || "")) throw new Error("Linked Go modules require versioned, checksummed sources; local replacements cannot be packaged");
  return selected;
}
function collectNotices(source, destination) {
  const root = fs.realpathSync(source); const rows = [];
  fs.mkdirSync(destination, { recursive: true });
  const copy = (relative) => {
    const input = path.join(root, relative); const stat = fs.lstatSync(input);
    if (stat.isSymbolicLink()) throw new Error("Dependency notice links require review; do not copy external files");
    if (stat.isDirectory()) { for (const name of fs.readdirSync(input).sort()) copy(path.join(relative, name)); return; }
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error("Invalid or oversized dependency notice");
    const bytes = fs.readFileSync(input); const output = path.join(destination, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, bytes, { mode: 0o644 });
    rows.push({ file: relative, bytes: bytes.length, sha256: digest(bytes) });
  };
  for (const name of fs.readdirSync(root).sort()) if (NOTICE.test(name)) copy(name);
  return rows;
}
function stableSerial(seed) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const value = bytes.toString("hex"); return `urn:uuid:${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
function runtimeBOM({ npmBOM, goInfo, build, binarySHA256, noticeIndex, timestamp, electronVersion }) {
  const frontend = structuredClone(npmBOM.metadata.component);
  const ref = `pkg:generic/atom@${build.version}?arch=${build.arch}&os=${build.platform}`;
  const backendRef = `pkg:generic/atom-api@${build.version}?arch=${build.arch}&os=${build.platform}`;
  const electronRef = `pkg:github/electron/electron@v${electronVersion}`;
  const stdlibRef = `pkg:generic/go-stdlib@${goInfo.GoVersion}`;
  const modules = (goInfo.Deps || []).map((dependency) => {
    const module = moduleIdentity(dependency); const purl = `pkg:golang/${module.Path.split("/").map(encodeURIComponent).join("/")}@${encodeURIComponent(module.Version)}`;
    return { type: "library", name: module.Path, version: module.Version, purl, "bom-ref": purl,
      properties: [{ name: "atom:go:checksum", value: module.Sum }, { name: "atom:notice-index", value: "license-index.json" }],
      licenses: [{ license: { name: "See exact-version bundled source notices" } }] };
  });
  const sbom = { $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json", bomFormat: "CycloneDX", specVersion: "1.5", version: 1,
    serialNumber: stableSerial(`${build.commit}/${build.platform}/${build.arch}/${binarySHA256}`),
    metadata: { timestamp, tools: npmBOM.metadata.tools, component: { type: "application", name: "A.T.O.M", version: build.version, "bom-ref": ref, purl: ref,
      licenses: [{ license: { id: "MIT" } }], properties: [{ name: "atom:source:commit", value: build.commit }, { name: "atom:inventory:scope", value: "Bundled frontend runtime packages, linked Go modules/standard library, Electron vendor component; Chromium notices supplied by Electron" }] } },
    components: [frontend, ...npmBOM.components, { type: "application", name: "A.T.O.M planning service", version: build.version, "bom-ref": backendRef, purl: backendRef,
      hashes: [{ alg: "SHA-256", content: binarySHA256 }], licenses: [{ license: { id: "MIT" } }] },
    { type: "framework", name: "Electron", version: electronVersion, "bom-ref": electronRef, purl: electronRef,
      licenses: [{ license: { id: "MIT" } }], properties: [{ name: "atom:upstream:embedded-notices", value: "Electron-LICENSES.chromium.html" }] },
    { type: "library", name: "Go standard library", version: goInfo.GoVersion, "bom-ref": stdlibRef, purl: stdlibRef, licenses: [{ license: { name: "See Go-standard-library-LICENSE" } }] }, ...modules],
    dependencies: [{ ref, dependsOn: [frontend["bom-ref"], backendRef, electronRef] }, ...npmBOM.dependencies,
      { ref: backendRef, dependsOn: [stdlibRef, ...modules.map((module) => module["bom-ref"])] }],
    properties: [{ name: "atom:notices:complete", value: String(noticeIndex.notices_complete) }, { name: "atom:legal-review", value: "Required separately; machine inventory is not redistribution approval" }] };
  return sbom;
}
module.exports = { collectNotices, componentSlug, moduleIdentity, runtimeBOM, stableSerial, selectRuntimeNpm };
