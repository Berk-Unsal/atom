import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { assertUbuntu, linkedLibraries, dependencyFloor, control, runCommand, normalizeInstalledModes } = require("../lib/deb-contract.cjs");
const { inventory, hash } = require("../lib/package-contract.cjs");
const desktop = path.resolve(import.meta.dirname, ".."); const root = path.dirname(desktop);
const run = (command, args, options = {}) => runCommand(command, args, { cwd: root, ...options });
if (process.argv.length !== 2) throw new Error("Usage: node desktop/scripts/deb.mjs");
if (process.platform !== "linux") throw new Error("Build the .deb natively on updated Ubuntu 24.04 x86_64");
const os = assertUbuntu({ platform: process.platform, arch: process.arch, dpkgArch: run("dpkg", ["--print-architecture"]), release: await fs.readFile("/etc/os-release", "utf8") });
const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
const commit = run("git", ["rev-parse", "HEAD"]);
if (run("git", ["status", "--porcelain"])) throw new Error("Package a committed, clean checkout");
const packageRoot = path.join(desktop, "build/packages", `atom-${version}-linux-x64-internal-unsigned`);
const packaged = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
if (packaged.commit !== commit || packaged.version !== version || packaged.platform !== "linux" || packaged.arch !== "x64") throw new Error("Rebuild matching native resources/package before .deb assembly");
const source = path.join(packageRoot, "A.T.O.M-linux-x64");
if (hash(JSON.stringify(inventory(source), null, 2) + "\n") !== packaged.file_manifest_sha256) throw new Error("Package inventory has changed since assembly");
const scratch = await fs.mkdtemp(path.join(desktop, "build/deb-stage-"));
try {
  const payload = path.join(scratch, "opt/atom-planner"); await fs.mkdir(path.dirname(payload), { recursive: true });
  await fs.cp(source, payload, { recursive: true, verbatimSymlinks: true });
  // The initial Ubuntu target uses its per-app userns profile. Do not install
  // a root-owned setuid fallback or tell users to disable Chromium's sandbox.
  await fs.rm(path.join(payload, "chrome-sandbox"), { force: true });
  const linked = []; const dependencies = new Set(); const owners = new Map();
  for (const row of inventory(payload)) {
    if (row.symlink) continue;
    const file = path.join(payload, row.path);
    const description = run("file", ["-b", file]); if (!description.startsWith("ELF ")) continue;
    if (!description.includes("64-bit") || !description.includes("x86-64")) throw new Error(`Unexpected ELF architecture: ${row.path}`);
    if (description.includes("statically linked")) { linked.push({ executable: row.path, static: true, libraries: [] }); continue; }
    const libraries = linkedLibraries(run("ldd", [file]));
    if (!libraries.length) throw new Error(`No dynamic dependencies resolved for ${row.path}`);
    const records = [];
    for (const library of libraries) {
      const resolved = await fs.realpath(library);
      if (resolved.startsWith(payload + path.sep)) { records.push({ bundled: path.relative(payload, resolved) }); continue; }
      let metadata = owners.get(resolved);
      if (!metadata) {
        let owner;
        for (const candidate of [...new Set([resolved, library, resolved.replace(/^\/usr\/lib\//, "/lib/")])]) {
          try { owner = run("dpkg-query", ["-S", candidate], { stdio: ["ignore", "pipe", "ignore"] }).split("\n")[0].split(": ")[0]; break; } catch { /* Try merged-/usr spelling. */ }
        }
        if (!owner) throw new Error(`System library is not owned by an installed package: ${library}`);
        const [name, installedVersion] = run("dpkg-query", ["-W", "-f=${binary:Package}\t${Version}", owner]).split("\t");
        const dependency = dependencyFloor(name, installedVersion); dependencies.add(dependency);
        metadata = { path: resolved, package: name, version: installedVersion, dependency }; owners.set(resolved, metadata);
      }
      records.push(metadata);
    }
    linked.push({ executable: row.path, libraries: records });
  }
  const copy = async (input, output, mode = 0o644) => { await fs.mkdir(path.dirname(output), { recursive: true }); await fs.copyFile(input, output); await fs.chmod(output, mode); };
  const debian = path.join(scratch, "DEBIAN"); await fs.mkdir(debian);
  await copy(path.join(desktop, "linux/atom-planner.apparmor"), path.join(scratch, "etc/apparmor.d/atom-planner"));
  await copy(path.join(desktop, "linux/io.github.berk-unsal.atom.desktop"), path.join(scratch, "usr/share/applications/io.github.berk-unsal.atom.desktop"));
  await copy(path.join(desktop, "linux/io.github.berk-unsal.atom.metainfo.xml"), path.join(scratch, "usr/share/metainfo/io.github.berk-unsal.atom.metainfo.xml"));
  await copy(path.join(root, "icon/png/atom-256.png"), path.join(scratch, "usr/share/icons/hicolor/256x256/apps/io.github.berk-unsal.atom.png"));
  await fs.mkdir(path.join(scratch, "usr/bin"), { recursive: true });
  await fs.symlink("../../opt/atom-planner/atom-desktop", path.join(scratch, "usr/bin/atom-planner"));
  for (const name of ["postinst", "postrm"]) await copy(path.join(desktop, "linux", name), path.join(debian, name), 0o755);
  await fs.writeFile(path.join(debian, "conffiles"), "/etc/apparmor.d/atom-planner\n");
  const rows = inventory(scratch);
  const body = control({ version, dependencies: [...dependencies], installedBytes: rows.reduce((sum, row) => sum + (row.bytes || 0), 0) });
  await fs.writeFile(path.join(debian, "control"), body);
  // Packager's private staging root can be 0700. dpkg installs it as root, so
  // normalize public software traversal/read modes before root ownership is
  // applied. Native user-data permissions remain the runtime's private 0700.
  normalizeInstalledModes(scratch);
  run("desktop-file-validate", [path.join(scratch, "usr/share/applications/io.github.berk-unsal.atom.desktop")]);
  run("sh", ["-n", path.join(debian, "postinst")]); run("sh", ["-n", path.join(debian, "postrm")]);
  const destination = path.join(packageRoot, `atom-${version}-linux-x64-internal-unsigned.deb`);
  run("dpkg-deb", ["--root-owner-group", "--build", scratch, destination]);
  const bytes = await fs.readFile(destination);
  const result = { schema: 1, commit, version, platform: "linux", arch: "x64", os, shell_version: packaged.shell_version, trust: "internal-unsigned",
    data_redistribution_approved: packaged.data_redistribution_approved, binary_upload_permitted: packaged.binary_upload_permitted,
    artifact: { file: path.basename(destination), bytes: bytes.length, sha256: hash(bytes) }, control: body, elf_dependencies: linked,
    dependency_policy: "All resolved system ELF owners require at least the installed Ubuntu build version; explicit dlopen/portal packages are additional. Other distributions are unqualified.",
    setuid_helper_installed: false, user_data_removed_by_maintainer_scripts: false };
  await fs.writeFile(path.join(packageRoot, "deb.json"), JSON.stringify(result, null, 2) + "\n");
  await fs.appendFile(path.join(packageRoot, "SHA256SUMS"), `${result.artifact.sha256}  ${result.artifact.file}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally { await fs.rm(scratch, { recursive: true, force: true }); }
