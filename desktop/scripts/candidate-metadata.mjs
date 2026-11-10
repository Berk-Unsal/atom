// Export byte-bound sidecars before QA; public promotion never regenerates them.
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { hash, dataApproval } = require("../lib/package-contract.cjs");
export async function exportMetadata(resources, destination, identity) {
  const build = JSON.parse(await fs.readFile(path.join(resources, "build-info.json"), "utf8"));
  if (build.commit !== identity.source_commit || build.version !== identity.version || build.platform !== identity.platform || build.arch !== identity.arch) throw new Error("Candidate resource identity mismatch");
  const licenses = path.join(resources, "licenses");
  const indexBytes = await fs.readFile(path.join(licenses, "license-index.json")); const sbomBytes = await fs.readFile(path.join(licenses, "sbom.cdx.json"));
  const index = JSON.parse(indexBytes);
  if (!index.notices_complete || index.source_commit !== build.commit || index.version !== build.version) throw new Error("Complete exact-source runtime notices are required before candidate upload");
  const review = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, "../data-redistribution.json"), "utf8"));
  const manifest = await fs.readFile(path.join(resources, "data-pipeline/manifest.json")); const layerHashes = {};
  for (const name of Object.values(JSON.parse(manifest).files)) {
    const file = path.resolve(resources, "data-pipeline", name);
    if (!file.startsWith(path.join(resources, "data-pipeline") + path.sep)) throw new Error("Candidate dataset escapes resources");
    layerHashes[name] = hash(await fs.readFile(file));
  }
  if (!dataApproval({ review, manifest, layerHashes })) throw new Error("Policy does not approve the candidate's exact data bytes");
  const stem = `atom-${build.version}-${build.platform}-${build.arch}`;
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, `${stem}.sbom.cdx.json`), sbomBytes);
  await fs.writeFile(path.join(destination, `${stem}.license-index.json`), indexBytes);
  execFileSync("tar", ["-czf", path.join(destination, `${stem}.licenses.tar.gz`), "-C", licenses, "."]);
  return { notices_complete: true, sbom_sha256: hash(sbomBytes), license_index_sha256: hash(indexBytes), data_redistribution_approved: true,
    data_manifest_sha256: hash(manifest), data_layer_sha256: layerHashes };
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [packageArg, outputArg, x11Arg, waylandArg] = process.argv.slice(2);
  if (!packageArg || !outputArg || !x11Arg || !waylandArg || process.argv.length !== 6) throw new Error("Usage: candidate-metadata.mjs PACKAGE OUTPUT X11_RESULT WAYLAND_RESULT");
  const packageRoot = path.resolve(packageArg); const destination = path.resolve(outputArg);
  const deb = JSON.parse(await fs.readFile(path.join(packageRoot, "deb.json"), "utf8"));
  if (deb.trust !== "linux-package-candidate" || deb.binary_upload_permitted !== true) throw new Error("Only approved Linux candidates can be exported");
  if (deb.platform !== "linux" || deb.arch !== "x64" || deb.artifact?.file !== `atom-${deb.version}-linux-x64.deb`) throw new Error("Unexpected candidate installer identity/path");
  const identity = { version: deb.version, source_commit: deb.commit, platform: deb.platform, arch: deb.arch };
  const sessions = {};
  for (const [session, file] of [["x11", x11Arg], ["wayland", waylandArg]]) {
    const result = JSON.parse(await fs.readFile(file, "utf8"));
    if (result.result !== "PASS" || result.display_session !== session || result.source_commit !== deb.commit || result.apt_upgrade_remove_purge_preserved_user_bytes !== true) throw new Error("Both exact-source installed graphical session qualifications must pass");
    sessions[session] = result;
  }
  const metadata = await exportMetadata(path.join(packageRoot, "A.T.O.M-linux-x64/resources"), destination, identity);
  const bytes = await fs.readFile(path.join(packageRoot, deb.artifact.file));
  if (hash(bytes) !== deb.artifact.sha256 || bytes.length !== deb.artifact.bytes) throw new Error("Qualified .deb bytes changed");
  await fs.writeFile(path.join(destination, deb.artifact.file), bytes);
  const receipt = { ...identity, ...metadata, trust: deb.trust, result: "QUALIFIED_CANDIDATE", public_distribution: false, sessions, artifacts: [deb.artifact] };
  await fs.writeFile(path.join(destination, `atom-${deb.version}-linux-x64.candidate.json`), JSON.stringify(receipt, null, 2) + "\n");
}
