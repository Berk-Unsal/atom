// Invoked only by protected manual CI after exact-source/data authorization.
// --plan is credential-free and performs no signing or Apple submission.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { environmentProtection } from "./authorize-signing.mjs";
import { exportMetadata } from "./candidate-metadata.mjs";
const require = createRequire(import.meta.url);
const { inventory, hash, dataApproval } = require("../lib/package-contract.cjs");
const { validateAuthorization, validateCIContext, validateDeveloperIdentity, entitlementsFor, validateNotary, validateSignature } = require("../lib/signing-contract.cjs");
const { consumeCredentials, privateKeychain } = require("../lib/signing-credentials.cjs");
const desktop = path.resolve(import.meta.dirname, ".."); const root = path.dirname(desktop);
const [mode, packageArgument] = process.argv.slice(2);
if (!["--plan", "--execute"].includes(mode) || !packageArgument || process.argv.length !== 4) throw new Error("Usage: node desktop/scripts/sign.mjs --plan|--execute PACKAGE_DIRECTORY");
const packageRoot = path.resolve(packageArgument);
const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
if (metadata.version !== version || metadata.platform !== "darwin" || !["arm64", "x64"].includes(metadata.arch) || metadata.trust !== "internal-unsigned" || metadata.source_dirty !== false) throw new Error("Signing requires an unchanged native internal macOS package matching VERSION");
const original = path.join(packageRoot, "A.T.O.M.app");
const rows = inventory(original);
if (hash(JSON.stringify(rows, null, 2) + "\n") !== metadata.file_manifest_sha256) throw new Error("Unsigned candidate bytes/permissions/links changed after package assembly");
const magic = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca]);
const nativeFiles = [];
for (const row of rows) {
  if (row.symlink || row.bytes < 4) continue;
  const handle = await fs.open(path.join(original, row.path), "r");
  try { const header = Buffer.alloc(4); await handle.read(header, 0, 4, 0); if (magic.has(header.readUInt32BE(0))) nativeFiles.push(row.path); }
  finally { await handle.close(); }
}
if (JSON.stringify(nativeFiles.toSorted()) !== JSON.stringify(Object.keys(metadata.native_architectures).toSorted())) throw new Error("Actual Mach-O inventory differs from package architecture metadata");
const resourceRoot = path.join(original, "Contents/Resources");
const build = JSON.parse(await fs.readFile(path.join(resourceRoot, "build-info.json"), "utf8"));
if (build.commit !== metadata.commit || build.version !== version || build.arch !== metadata.arch || build.shellVersion !== metadata.shell_version) throw new Error("Candidate build identity differs from package metadata");
const authorization = JSON.parse(await fs.readFile(path.join(desktop, "signing-authorization.json"), "utf8"));
const review = JSON.parse(await fs.readFile(path.join(desktop, "data-redistribution.json"), "utf8"));
const manifestBytes = await fs.readFile(path.join(resourceRoot, "data-pipeline/manifest.json"));
const manifest = JSON.parse(manifestBytes); const layerHashes = {};
for (const name of Object.values(manifest.files)) {
  const file = path.resolve(resourceRoot, "data-pipeline", name);
  if (!file.startsWith(path.join(resourceRoot, "data-pipeline") + path.sep)) throw new Error("Dataset path escapes candidate resources");
  layerHashes[name] = hash(await fs.readFile(file));
}
const dataApproved = dataApproval({ review, manifest: manifestBytes, layerHashes });
const plan = { version, source_commit: metadata.commit, platform: "darwin", arch: metadata.arch, data_redistribution_approved: dataApproved,
  data_manifest_sha256: hash(manifestBytes), data_layer_sha256: layerHashes,
  authorization_status: authorization.status, per_file_entitlements: nativeFiles.map((file) => ({ file, entitlements: entitlementsFor(file) })),
  phases: ["validate private Developer ID identity", "sign nested code before outer app with hardened runtime and secure timestamps", "verify every Mach-O and exact entitlements", "notarize submission ZIP", "staple/validate app", "create/sign/notarize/staple/validate DMG", "assess app and DMG with Gatekeeper", "archive stapled app and record final checksums"],
  public_distribution: false };
if (mode === "--plan") { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
validateCIContext(process.env);
if (process.platform !== "darwin" || process.arch !== metadata.arch) throw new Error("Sign and qualify each architecture on its native macOS runner");
const identity = validateAuthorization(authorization, { version, source_commit: metadata.commit });
if (!dataApproved || metadata.data_redistribution_approved !== true) throw new Error("Exact bundled-data approval is required in both the source package and signing policy before any Apple upload");
if (metadata.notices_complete !== true) throw new Error("Complete runtime notices are required before signing or Apple upload");
await environmentProtection();
const credentials = consumeCredentials(process.env);
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-private-signing-"));
let keychain;
const output = path.join(desktop, "build/signed-candidates", `atom-${version}-darwin-${metadata.arch}`);
const receipt = { ...plan, certificate_sha1: identity.certificateSHA1, team_id: identity.teamID, notarization: [], signatures: [], verification: {}, trust: "unsigned-incomplete" };
await fs.mkdir(output, { recursive: true });
Object.assign(receipt, await exportMetadata(resourceRoot, output, { version, source_commit: metadata.commit, platform: "darwin", arch: metadata.arch }));
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error(`${path.basename(command)} failed during candidate signing/verification`);
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
};
const app = path.join(scratch, "A.T.O.M.app");
try {
  keychain = privateKeychain(scratch, credentials);
  validateDeveloperIdentity(keychain.identities, identity);
  await fs.cp(original, app, { recursive: true, verbatimSymlinks: true });
  const { sign } = await import("@electron/osx-sign");
  await sign({ app, platform: "darwin", type: "distribution", identity: identity.certificateSHA1, keychain: keychain.keychain,
    version: metadata.shell_version,
    identityValidation: true, strictVerify: true, preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    optionsForFile: (file) => ({ hardenedRuntime: true, entitlements: entitlementsFor(path.relative(app, file)) }) });
  for (const relative of [...nativeFiles, ""]) {
    const file = path.join(app, relative);
    run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", file]);
    const details = run("/usr/bin/codesign", ["--display", "--verbose=4", file]);
    const entitlements = run("/usr/bin/codesign", ["--display", "--entitlements", ":-", file]);
    const expected = entitlementsFor(relative);
    validateSignature(details.stdout + details.stderr, entitlements.stdout, { teamID: identity.teamID, expectedEntitlements: expected });
    receipt.signatures.push({ file: relative || "A.T.O.M.app", hardened_runtime: true, entitlements: expected, team_id: identity.teamID });
  }
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  const notarize = async (file, label) => {
    const authentication = ["--key", keychain.notaryKey, "--key-id", credentials.keyID, "--issuer", credentials.issuerID];
    const submitted = spawnSync("/usr/bin/xcrun", ["notarytool", "submit", file, ...authentication, "--wait", "--timeout", "30m", "--output-format", "json"],
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 31 * 60_000 });
    let response; try { response = JSON.parse(submitted.stdout); } catch { response = {}; }
    const diagnostic = { id: response.id || null, status: response.status || "command_failed", exit_code: submitted.status,
      submitted_sha256: hash(await fs.readFile(file)) };
    if (response.status !== "Accepted" && /^[a-f0-9-]{36}$/i.test(response.id || "")) {
      const logged = spawnSync("/usr/bin/xcrun", ["notarytool", "log", response.id, ...authentication], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 60_000 });
      try {
        const issues = JSON.parse(logged.stdout).issues;
        diagnostic.issues = Array.isArray(issues) ? issues.slice(0, 200).map((issue) => ({ code: issue.code, architecture: issue.architecture,
          message: String(issue.message || "").slice(0, 1000), path: String(issue.path || "").replaceAll(scratch, "<temporary>").slice(0, 1000) })) : [];
      } catch { diagnostic.log_available = false; }
    }
    await fs.writeFile(path.join(output, `notarization-${label}.json`), JSON.stringify(diagnostic, null, 2) + "\n");
    receipt.notarization.push({ artifact: label, ...diagnostic });
    if (submitted.status !== 0 || submitted.error) throw new Error("Apple submission failed; bounded notarization diagnostics were retained");
    validateNotary(response);
  };
  const submission = path.join(scratch, "app-submission.zip");
  run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, submission]);
  await notarize(submission, "app");
  run("/usr/bin/xcrun", ["stapler", "staple", app]); run("/usr/bin/xcrun", ["stapler", "validate", app]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  receipt.verification.app_staple_and_deep_signature = true;
  const volume = path.join(scratch, "volume"); await fs.mkdir(volume);
  await fs.cp(app, path.join(volume, "A.T.O.M.app"), { recursive: true, verbatimSymlinks: true }); await fs.symlink("/Applications", path.join(volume, "Applications"));
  const dmg = path.join(output, `atom-${version}-darwin-${metadata.arch}.dmg`);
  run("/usr/bin/hdiutil", ["create", "-ov", "-format", "UDZO", "-fs", "HFS+", "-volname", `A.T.O.M ${version}`, "-srcfolder", volume, dmg]);
  run("/usr/bin/codesign", ["--force", "--sign", identity.certificateSHA1, "--keychain", keychain.keychain, "--timestamp", dmg]);
  await notarize(dmg, "dmg");
  run("/usr/bin/xcrun", ["stapler", "staple", dmg]); run("/usr/bin/xcrun", ["stapler", "validate", dmg]);
  run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", dmg]); run("/usr/bin/hdiutil", ["verify", dmg]);
  receipt.verification.dmg_staple_signature_and_integrity = true;
  run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
  run("/usr/sbin/spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmg]);
  receipt.verification.app_and_dmg_gatekeeper = true;
  const zip = path.join(output, `atom-${version}-darwin-${metadata.arch}.zip`);
  run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
  receipt.final_app_inventory_sha256 = hash(JSON.stringify(inventory(app), null, 2) + "\n");
  receipt.artifacts = [];
  for (const file of [zip, dmg]) { const bytes = await fs.readFile(file); receipt.artifacts.push({ file: path.basename(file), bytes: bytes.length, sha256: hash(bytes) }); }
  receipt.trust = "developer-id-notarized-candidate"; receipt.result = "SIGNED_CANDIDATE";
  await fs.writeFile(path.join(output, "SHA256SUMS"), receipt.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.file}\n`).join(""));
} catch (error) { receipt.result = "FAIL"; receipt.failure = error.message; throw error; }
finally {
  keychain?.cleanup(); credentials.p12.fill(0); credentials.notary.fill(0);
  await fs.writeFile(path.join(output, "signing.json"), JSON.stringify(receipt, null, 2) + "\n");
  await fs.writeFile(path.join(output, `atom-${version}-darwin-${metadata.arch}.signing.json`), JSON.stringify(receipt, null, 2) + "\n");
  await fs.rm(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify(receipt, null, 2));
