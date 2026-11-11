// Native-host builds only: cross compilation is not native qualification.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { packager } from "@electron/packager";
const require = createRequire(import.meta.url);
const { BUNDLE_ID, RESOURCE_NAMES, HOST_NAMES, hash, validateBuild, inventory, dataApproval } = require("../lib/package-contract.cjs");
const desktop = path.resolve(import.meta.dirname, "..");
const root = path.dirname(desktop);
const resources = path.join(desktop, "build/resources");
const command = (executable, args, options = {}) => execFileSync(executable, args, { cwd: root, encoding: "utf8", ...options }).trim();
const options = process.argv.slice(2);
if (options.some((option) => option !== "--dmg") || (options.includes("--dmg") && process.platform !== "darwin")) throw new Error("Usage: node desktop/scripts/package.mjs [--dmg (macOS only)]");
const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
const commit = command("git", ["rev-parse", "HEAD"]);
const info = JSON.parse(await fs.readFile(path.join(resources, "build-info.json"), "utf8"));
validateBuild(info, { version, commit, platform: process.platform, arch: process.arch, dirty: Boolean(command("git", ["status", "--porcelain"])) });
if (info.shellVersion !== require("../package.json").devDependencies.electron) throw new Error("Electron resource/runtime versions differ");
const review = JSON.parse(await fs.readFile(path.join(desktop, "data-redistribution.json"), "utf8"));
const manifestBytes = await fs.readFile(path.join(resources, "data-pipeline/manifest.json"));
const manifest = JSON.parse(manifestBytes);
const layerHashes = {};
for (const name of Object.values(manifest.files)) {
  const file = path.resolve(resources, "data-pipeline", name);
  if (!file.startsWith(path.join(resources, "data-pipeline") + path.sep)) throw new Error("Dataset layer escapes resources");
  layerHashes[name] = hash(await fs.readFile(file));
}
command(path.join(resources, "atom-api"), ["--validate-dataset-json", path.join(resources, "data-pipeline")]);
const approved = dataApproval({ review, manifest: manifestBytes, layerHashes });
const target = `${process.platform}-${process.arch}`;
const basename = `atom-${version}-${target}-internal-unsigned`;
const destination = path.join(desktop, "build/packages", basename);
await fs.mkdir(path.dirname(destination), { recursive: true });
const scratch = await fs.mkdtemp(path.join(desktop, "build/package-stage-"));
try {
  const source = path.join(scratch, "source"); await fs.mkdir(source);
  for (const name of HOST_NAMES) await fs.cp(path.join(desktop, name), path.join(source, name), { recursive: true });
  await fs.writeFile(path.join(source, "package.json"), JSON.stringify({ name: "atom-desktop", version, main: "main.cjs", license: "MIT", description: "A.T.O.M telecom planning", author: "A.T.O.M contributors" }));
  const licenses = path.join(scratch, "licenses");
  command(process.execPath, [path.join(desktop, "scripts/licenses.mjs"), resources, licenses]);
  const licenseIndex = JSON.parse(await fs.readFile(path.join(licenses, "license-index.json"), "utf8"));
  const sbomSHA256 = hash(await fs.readFile(path.join(licenses, "sbom.cdx.json")));
  const licenseIndexSHA256 = hash(await fs.readFile(path.join(licenses, "license-index.json")));
  const [packed] = await packager({ dir: source, name: "A.T.O.M", executableName: "atom-desktop", out: path.join(scratch, "output"),
    platform: process.platform, arch: process.arch, electronVersion: info.shellVersion, appVersion: version, buildVersion: version,
    appBundleId: BUNDLE_ID, helperBundleId: `${BUNDLE_ID}.helper`, appCategoryType: "public.app-category.utilities",
    appCopyright: "Copyright A.T.O.M contributors", icon: path.join(root, "icon", process.platform === "darwin" ? "atom.icns" : "png/atom-256.png"),
    extendInfo: { LSMinimumSystemVersion: "14.0", NSHumanReadableCopyright: "A.T.O.M contributors; see bundled licenses" },
    asar: false, prune: false, osxSign: false, osxNotarize: false,
    extraResource: [...RESOURCE_NAMES.map((name) => path.join(resources, name)), licenses], quiet: false });
  const bundle = process.platform === "darwin" ? path.join(packed, "A.T.O.M.app") : packed;
  const resourceRoot = path.join(bundle, process.platform === "darwin" ? "Contents/Resources" : "resources");
  // Ensure the notices collected from the installed pinned Electron match
  // the actual vendor archive used by packager.
  for (const name of ["LICENSE", "LICENSES.chromium.html"]) {
    const notice = path.join(packed, name);
    if (hash(await fs.readFile(notice)) !== hash(await fs.readFile(path.join(resourceRoot, "licenses", `Electron-${name}`)))) throw new Error("Electron vendor notices differ from the pinned runtime");
  }
  const executable = path.join(bundle, process.platform === "darwin" ? "Contents/MacOS/atom-desktop" : "atom-desktop");
  await fs.chmod(path.join(resourceRoot, "atom-api"), 0o755);
  const rows = inventory(bundle);
  const nativeArchitectures = {};
  if (process.platform === "darwin") for (const row of rows) {
    if (row.symlink) continue;
    const file = path.join(bundle, row.path);
    if (!command("file", ["-b", file]).includes("Mach-O")) continue;
    const arches = command("lipo", ["-archs", file]);
    if (arches !== (process.arch === "x64" ? "x86_64" : "arm64")) throw new Error(`Unexpected native architecture: ${row.path}: ${arches}`);
    nativeArchitectures[row.path] = arches;
  }
  else {
    for (const file of [executable, path.join(resourceRoot, "atom-api")]) {
      const description = command("file", ["-b", file]);
      if (!description.includes("ELF 64-bit") || !description.includes("x86-64")) throw new Error("Linux package architecture mismatch");
      nativeArchitectures[path.relative(bundle, file)] = description;
    }
  }
  await fs.rm(destination, { recursive: true, force: true }); await fs.mkdir(destination);
  const installedBundle = path.join(destination, path.basename(bundle)); await fs.rename(bundle, installedBundle);
  for (const name of ["sbom.cdx.json", "license-index.json"]) await fs.copyFile(path.join(licenses, name), path.join(destination, `atom-${version}-${target}.${name}`));
  const files = JSON.stringify(rows, null, 2) + "\n";
  await fs.writeFile(path.join(destination, "files.json"), files);
  const archive = path.join(destination, basename + (process.platform === "darwin" ? ".zip" : ".tar.gz"));
  if (process.platform === "darwin") command("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", installedBundle, archive]);
  else command("tar", ["-czf", archive, "-C", destination, path.basename(installedBundle)]);
  const artifacts = [archive];
  if (options.includes("--dmg")) {
    const volume = path.join(scratch, "volume"); await fs.mkdir(volume);
    await fs.cp(installedBundle, path.join(volume, path.basename(installedBundle)), { recursive: true, verbatimSymlinks: true });
    await fs.symlink("/Applications", path.join(volume, "Applications"));
    const dmg = path.join(destination, basename + ".dmg");
    command("hdiutil", ["create", "-ov", "-format", "UDZO", "-fs", "HFS+", "-volname", `A.T.O.M ${version} internal unsigned`, "-srcfolder", volume, dmg]);
    command("hdiutil", ["verify", dmg]); artifacts.push(dmg);
  }
  const artifactRows = [];
  for (const file of artifacts) { const bytes = await fs.readFile(file); artifactRows.push({ file: path.basename(file), bytes: bytes.length, sha256: hash(bytes) }); }
  const metadata = { schema: 1, version, commit, source_dirty: false, platform: process.platform, arch: process.arch, shell: "electron", shell_version: info.shellVersion,
    bundle_id: BUNDLE_ID, trust: "internal-unsigned", public_distribution: false, data_redistribution_approved: approved,
    binary_upload_permitted: approved && licenseIndex.notices_complete, data_manifest_sha256: hash(manifestBytes), data_layer_sha256: layerHashes,
    notices_complete: licenseIndex.notices_complete, sbom_sha256: sbomSHA256, license_index_sha256: licenseIndexSHA256,
    file_manifest_sha256: hash(files), unpacked_bytes: rows.reduce((sum, row) => sum + (row.bytes || 0), 0), native_architectures: nativeArchitectures, artifacts: artifactRows,
    qualification: "Build evidence only; native launch, clean-machine, signing and public-release gates remain separate" };
  await fs.writeFile(path.join(destination, "package.json"), JSON.stringify(metadata, null, 2) + "\n");
  await fs.writeFile(path.join(destination, "SHA256SUMS"), artifactRows.map((row) => `${row.sha256}  ${row.file}\n`).join(""));
  console.log(JSON.stringify({ destination, ...metadata }, null, 2));
} finally { await fs.rm(scratch, { recursive: true, force: true }); }
