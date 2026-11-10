// Read-only validation is repeated in the reviewed publication job. Promote
// exact candidate bytes; never rebuild, resign, replace or delete an asset.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { api, protectedContext, resolveTag, REPO } from "./release-api.mjs";
const require = createRequire(import.meta.url);
const { hash } = require("../lib/package-contract.cjs");
const { validatePolicy, verifyReleaseFiles, validateCandidateRun } = require("../lib/release-contract.cjs");
const root = path.resolve(import.meta.dirname, "../..");
const mode = process.argv[2]; if (!["--check", "--publish"].includes(mode) || process.argv.length !== 3) throw new Error("Usage: node release.mjs --check|--publish");
const policy = JSON.parse(await fs.readFile(path.join(root, "desktop/release-gates.json"), "utf8"));
// Fail closed before downloads or publication when the checked-in review is pending.
validatePolicy(policy, policy);
await protectedContext("desktop-publication");
const identity = await resolveTag(process.env.ATOM_RELEASE_TAG);
const candidates = validatePolicy(policy, identity);
const dataReview = JSON.parse(await fs.readFile(path.join(root, "desktop/data-redistribution.json"), "utf8"));
if (dataReview.status !== "approved" || !dataReview.approval?.reviewer || !dataReview.approval?.record_url) throw new Error("Current exact-data policy remains unapproved");
const release = await api(`releases/tags/${identity.tag}`);
if (release.tag_name !== identity.tag || release.draft || release.immutable) throw new Error("An existing mutable published VERSION release is required; container publication is separate");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-release-"));
const upload = [];
try {
  for (const candidate of candidates) {
    const run = await api(`actions/runs/${candidate.run_id}`); const artifact = await api(`actions/artifacts/${candidate.artifact_id}`);
    validateCandidateRun(candidate, run, artifact);
    const response = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${candidate.artifact_id}/zip`, {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const location = response.headers.get("location");
    if (response.status !== 302 || !location || new URL(location).protocol !== "https:") throw new Error("Artifact download did not return a secure archive URL");
    // Never forward the repository token to the artifact storage host.
    const archiveResponse = await fetch(location, { redirect: "error", signal: AbortSignal.timeout(120_000) });
    if (!archiveResponse.ok || Number(archiveResponse.headers.get("content-length")) > 2 * 1024 ** 3) throw new Error("Invalid candidate archive response");
    const archiveBytes = Buffer.from(await archiveResponse.arrayBuffer());
    if (hash(archiveBytes) !== candidate.artifact_sha256) throw new Error("Actions archive digest differs from approval");
    const target = `${candidate.platform}-${candidate.arch}`; const archive = path.join(scratch, target + ".zip");
    const list = path.join(scratch, target + ".json"); const extracted = path.join(scratch, target);
    await fs.writeFile(archive, archiveBytes); await fs.writeFile(list, JSON.stringify(candidate.files));
    execFileSync("python3", [path.join(root, "desktop/scripts/extract-candidate.py"), archive, extracted, list]);
    const files = new Map(); for (const file of candidate.files) files.set(file.name, await fs.readFile(path.join(extracted, file.name)));
    const verified = verifyReleaseFiles({ ...candidate, ...identity }, (name) => files.get(name));
    if (verified.receipt.data_manifest_sha256 !== dataReview.manifest_sha256 || JSON.stringify(Object.entries(verified.receipt.data_layer_sha256 || {}).sort()) !== JSON.stringify(Object.entries(dataReview.layer_sha256 || {}).sort())) throw new Error("Current data approval does not cover the qualified candidate bytes");
    for (const file of candidate.files) upload.push({ ...file, path: path.join(extracted, file.name) });
  }
  const checksums = upload.map((file) => `${file.sha256}  ${file.name}\n`).sort().join("");
  const name = `atom-${identity.version}-desktop-SHA256SUMS`; const checksumFile = path.join(scratch, name);
  await fs.writeFile(checksumFile, checksums); upload.push({ name, sha256: hash(checksums), bytes: Buffer.byteLength(checksums), path: checksumFile });
  // Check every collision before performing any write. Matching prior uploads
  // allow safe retry after a partial network failure; changed assets never do.
  const existing = [];
  for (let page = 1; ; page++) {
    if (page > 20) throw new Error("Excessive release assets require manual review");
    const entries = await api(`releases/${release.id}/assets?per_page=100&page=${page}`); existing.push(...entries);
    if (entries.length < 100) break;
  }
  for (const file of upload) {
    const found = existing.find((asset) => asset.name === file.name);
    if (found && (found.digest !== `sha256:${file.sha256}` || found.size !== file.bytes || found.state !== "uploaded")) throw new Error(`Existing release asset conflicts with approval: ${file.name}`);
    file.exists = Boolean(found);
  }
  if (mode === "--publish") for (const file of upload.filter((file) => !file.exists)) {
    const response = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(180_000),
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/octet-stream" }, body: await fs.readFile(file.path) });
    if (!response.ok) throw new Error(`Release upload failed (${response.status}); existing assets were preserved`);
    const asset = await response.json(); if (asset.digest !== `sha256:${file.sha256}` || asset.size !== file.bytes) throw new Error("Uploaded asset digest differs from approved bytes; investigate before retry");
  }
  console.log(JSON.stringify({ ...identity, result: mode === "--publish" ? "PROMOTED_EXACT_CANDIDATES" : "APPROVED_CANDIDATES_VERIFIED", files: upload.map(({ path: _path, ...file }) => file) }, null, 2));
} finally { await fs.rm(scratch, { recursive: true, force: true }); }
