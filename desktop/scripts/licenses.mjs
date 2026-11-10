// Assemble source notices and a component-level runtime SBOM before packaging
// and signing. Never treat machine-collected metadata as legal approval.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { collectNotices, componentSlug, moduleIdentity, runtimeBOM, selectRuntimeNpm } = require("../lib/license-inventory.cjs");
const { hash } = require("../lib/package-contract.cjs");
const desktop = path.resolve(import.meta.dirname, ".."); const root = path.dirname(desktop);
if (process.argv.length !== 4) throw new Error("Usage: node licenses.mjs RESOURCES DESTINATION");
const resources = path.resolve(process.argv[2]); const destination = path.resolve(process.argv[3]);
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...options }).trim();
const build = JSON.parse(await fs.readFile(path.join(resources, "build-info.json"), "utf8"));
const goInfo = JSON.parse(run("go", ["version", "-m", "-json", path.join(resources, "atom-api")]));
// npm's omit=dev selector can omit a shared production/peer dependency. Select
// the production closure from the lock, then retain npm's component metadata.
const fullNpmBOM = JSON.parse(run("npm", ["sbom", "--sbom-format=cyclonedx"], { cwd: path.join(root, "frontend-react") }));
const { rows: npmRows, bom: npmBOM } = selectRuntimeNpm(JSON.parse(await fs.readFile(path.join(root, "frontend-react/package-lock.json"), "utf8")), fullNpmBOM);
await fs.mkdir(destination, { recursive: true });
const copy = async (input, name) => { const bytes = await fs.readFile(input); await fs.writeFile(path.join(destination, name), bytes, { mode: 0o644 }); return { file: name, sha256: hash(bytes), bytes: bytes.length }; };
const index = { schema: 1, source_commit: build.commit, version: build.version, platform: build.platform, arch: build.arch,
  scope: "Runtime components; Electron supplies the embedded Chromium third-party notice inventory", components: [], missing_notices: [], notices_complete: false };
index.application_notice = await copy(path.join(root, "LICENSE"), "A.T.O.M-MIT.txt");
await copy(path.join(desktop, "data-redistribution.json"), "dataset-review.json");
await copy(path.join(root, "docs/desktop-data-redistribution-review.md"), "dataset-review.md");
const electronRoot = path.dirname(require.resolve("electron/package.json"));
if (require("electron/package.json").version !== build.shellVersion) throw new Error("Installed Electron differs from candidate build metadata");
require("electron"); // Electron 44 downloads its pinned archive lazily on first use.
index.electron_notices = [await copy(path.join(electronRoot, "dist/LICENSE"), "Electron-LICENSE"), await copy(path.join(electronRoot, "dist/LICENSES.chromium.html"), "Electron-LICENSES.chromium.html")];
const goRoot = run("go", ["env", "GOROOT"], { cwd: path.join(root, "backend-go") });
if (run("go", ["env", "GOVERSION"], { cwd: path.join(root, "backend-go") }) !== goInfo.GoVersion) throw new Error("Go standard-library notice must match the binary's toolchain");
index.standard_library_notice = await copy(path.join(goRoot, "LICENSE"), "Go-standard-library-LICENSE");
for (const { component, location: relative } of npmRows) {
  if (!relative?.startsWith("node_modules/") || relative.split("/").some((part) => part === "..")) throw new Error("Npm SBOM component escaped the installed runtime tree");
  const directory = await fs.realpath(path.join(root, "frontend-react", relative));
  if (!directory.startsWith(path.join(root, "frontend-react/node_modules") + path.sep)) throw new Error("Npm notice directory escaped the runtime tree");
  const prefix = path.join("npm", componentSlug(component.name, component.version));
  const notices = collectNotices(directory, path.join(destination, prefix));
  index.components.push({ ecosystem: "npm", name: component.name, version: component.version, purl: component.purl, notices: notices.map((notice) => ({ ...notice, file: path.join(prefix, notice.file) })) });
  if (!notices.length) index.missing_notices.push(`npm:${component.name}@${component.version}`);
}
for (const dependency of goInfo.Deps || []) {
  const module = moduleIdentity(dependency);
  const downloaded = JSON.parse(run("go", ["mod", "download", "-json", `${module.Path}@${module.Version}`], { cwd: path.join(root, "backend-go") }));
  if (downloaded.Sum !== module.Sum || !downloaded.Dir) throw new Error("Go notice source does not match the linked binary checksum");
  const prefix = path.join("go", componentSlug(module.Path, module.Version));
  const notices = collectNotices(downloaded.Dir, path.join(destination, prefix));
  index.components.push({ ecosystem: "go", name: module.Path, version: module.Version, checksum: module.Sum, notices: notices.map((notice) => ({ ...notice, file: path.join(prefix, notice.file) })) });
  if (!notices.length) index.missing_notices.push(`go:${module.Path}@${module.Version}`);
}
index.notices_complete = index.missing_notices.length === 0;
await fs.writeFile(path.join(destination, "license-index.json"), JSON.stringify(index, null, 2) + "\n");
const timestamp = run("git", ["show", "-s", "--format=%cI", build.commit]);
const sbom = runtimeBOM({ npmBOM, goInfo, build, binarySHA256: hash(await fs.readFile(path.join(resources, "atom-api"))), noticeIndex: index, timestamp, electronVersion: build.shellVersion });
await fs.writeFile(path.join(destination, "sbom.cdx.json"), JSON.stringify(sbom, null, 2) + "\n");
console.log(JSON.stringify({ components: sbom.components.length, notices_complete: index.notices_complete, missing_notices: index.missing_notices }));
