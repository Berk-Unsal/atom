"use strict";
const test = require("node:test"); const assert = require("node:assert/strict"); const path = require("node:path"); const { spawnSync } = require("node:child_process");
const { hash } = require("../lib/package-contract.cjs");
const { GATES, validatePolicy, verifyReleaseFiles, validateCandidateRun } = require("../lib/release-contract.cjs");
const identity = { version: "0.13.1", source_commit: "a".repeat(40), tag: "v0.13.1" };
const approval = { status: "approved", reviewer: "maintainer", record_url: "https://github.com/Berk-Unsal/atom/issues/162#issuecomment-123" };
function fixture() {
  const contents = new Map(); const candidates = [];
  for (const target of ["darwin-arm64", "darwin-x64", "linux-x64"]) {
    const [platform, arch] = target.split("-"); const stem = `atom-${identity.version}-${target}`;
    const candidate = { platform, arch, artifact_id: candidates.length + 1, run_id: 10 + candidates.length, workflow_commit: "b".repeat(40), artifact_sha256: "c".repeat(64),
      clean_machine: { ...approval, os_version: platform === "darwin" ? "14.8" : "24.04", artifact_sha256: [], quarantined_download: true, offline_staple: true, x11: true, wayland: true, graphical_install: true }, files: [] };
    const add = (role, extension, bytes) => {
      bytes = Buffer.from(typeof bytes === "object" ? JSON.stringify(bytes) : bytes);
      const file = { role, name: `${stem}.${extension}`, bytes: bytes.length, sha256: hash(bytes) }; contents.set(file.name, bytes); candidate.files.push(file); return file;
    };
    for (const role of platform === "darwin" ? ["dmg", "zip"] : ["deb"]) candidate.clean_machine.artifact_sha256.push(add(role, role, `installer fixture ${target}/${role}`).sha256);
    const bom = add("sbom", "sbom.cdx.json", { bomFormat: "CycloneDX", metadata: { component: { version: identity.version, properties: [{ name: "atom:source:commit", value: identity.source_commit }] } } });
    const index = add("license_index", "license-index.json", { notices_complete: true, ...identity, platform, arch });
    add("licenses", "licenses.tar.gz", "notice fixture");
    const receipt = { ...identity, platform, arch, data_redistribution_approved: true, notices_complete: true, sbom_sha256: bom.sha256, license_index_sha256: index.sha256,
      trust: platform === "darwin" ? "developer-id-notarized-candidate" : "linux-package-candidate", result: platform === "darwin" ? "SIGNED_CANDIDATE" : "QUALIFIED_CANDIDATE",
      verification: { app_staple_and_deep_signature: true, dmg_staple_signature_and_integrity: true, app_and_dmg_gatekeeper: true },
      notarization: ["app", "dmg"].map((artifact) => ({ artifact, status: "Accepted" })), sessions: { x11: { result: "PASS" }, wayland: { result: "PASS" } },
      artifacts: candidate.files.filter((file) => ["zip", "dmg", "deb"].includes(file.role)).map((file) => ({ ...file, file: file.name })) };
    add("receipt", "candidate.json", receipt);
    if (platform === "darwin") add("smoke", "smoke.json", { ...identity, arch, result: "PASS", archive_sha256: candidate.files.find((file) => file.role === "zip").sha256, native_sandbox_run_and_owned_cleanup: true });
    candidates.push(candidate);
  }
  return { policy: { schema: 1, status: "approved", ...identity, gates: Object.fromEntries(GATES.map((gate) => [gate, { ...approval }])), candidates }, contents };
}
test("release requires every named gate, exact source/version/tag and all qualified architectures", () => {
  const { policy } = fixture(); assert.equal(validatePolicy(policy, identity).length, 3);
  assert.throws(() => validatePolicy({ ...policy, status: "pending" }, identity), /pending/);
  for (const gate of GATES) { const missing = structuredClone(policy); missing.gates[gate] = null; assert.throws(() => validatePolicy(missing, identity), /recorded approval/); }
  assert.throws(() => validatePolicy(policy, { ...identity, source_commit: "d".repeat(40) }), /source_commit/);
  assert.throws(() => validatePolicy(policy, { ...identity, tag: "v0.13.2" }), /VERSION/);
  assert.throws(() => validatePolicy({ ...policy, candidates: policy.candidates.slice(1) }, identity), /three/);
  policy.candidates[0].arch = "x64"; assert.throws(() => validatePolicy(policy, identity), /duplicate/);
});
test("clean-machine evidence binds every final byte and requires native release surfaces", () => {
  for (const key of ["quarantined_download", "offline_staple"]) { const { policy } = fixture(); policy.candidates[0].clean_machine[key] = false; assert.throws(() => validatePolicy(policy, identity), /quarantined/); }
  const { policy } = fixture(); policy.candidates[2].clean_machine.graphical_install = false; assert.throws(() => validatePolicy(policy, identity), /graphical/);
  const changed = fixture().policy; changed.candidates[0].files[0].sha256 = "d".repeat(64); assert.throws(() => validatePolicy(changed, identity), /every final/);
});
test("promotion verifies bytes, complete notices, signed receipts and both installed sessions", () => {
  const { policy, contents } = fixture();
  for (const candidate of policy.candidates) verifyReleaseFiles({ ...candidate, ...identity }, (name) => contents.get(name));
  const first = policy.candidates[0]; const binary = first.files[0]; contents.set(binary.name, Buffer.from("changed"));
  assert.throws(() => verifyReleaseFiles({ ...first, ...identity }, (name) => contents.get(name)), /bytes changed/);
  for (const target of [0, 2]) {
    const { policy: p, contents: c } = fixture(); const candidate = p.candidates[target]; const file = candidate.files.find((file) => file.role === "receipt");
    const receipt = JSON.parse(c.get(file.name)); if (target === 0) receipt.verification.app_and_dmg_gatekeeper = false; else receipt.sessions.wayland.result = "FAIL";
    const bytes = Buffer.from(JSON.stringify(receipt)); c.set(file.name, bytes); Object.assign(file, { bytes: bytes.length, sha256: hash(bytes) });
    assert.throws(() => verifyReleaseFiles({ ...candidate, ...identity }, (name) => c.get(name)), /incomplete/);
  }
});
test("candidate provenance rejects PRs, forks, failed runs, moved workflow commits and wrong digests", () => {
  const candidate = fixture().policy.candidates[0];
  const run = { id: candidate.run_id, event: "workflow_dispatch", head_branch: "main", head_sha: candidate.workflow_commit, conclusion: "success", path: ".github/workflows/desktop-signing.yml", repository: { full_name: "Berk-Unsal/atom" }, head_repository: { full_name: "Berk-Unsal/atom" } };
  const artifact = { id: candidate.artifact_id, workflow_run: { id: run.id }, expired: false, digest: `sha256:${candidate.artifact_sha256}` };
  validateCandidateRun(candidate, run, artifact);
  for (const patch of [{ event: "pull_request" }, { head_branch: "feature" }, { head_sha: "d".repeat(40) }, { conclusion: "failure" }, { head_repository: { full_name: "other/atom" } }]) assert.throws(() => validateCandidateRun(candidate, { ...run, ...patch }, artifact), /approved successful/);
  assert.throws(() => validateCandidateRun(candidate, run, { ...artifact, digest: "sha256:changed" }), /approved successful/);
});
test("checked-in pending release CLI fails before networking or publication", () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/release.mjs"), "--publish"], { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /release approval is pending/);
});
