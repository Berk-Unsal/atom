"use strict";
const { hash } = require("./package-contract.cjs");
const GATES = ["framework", "webview", "runtime", "developer_experience", "filesystem", "distribution", "default_data", "provider_access", "security", "license_review"];
const TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64"];
const sha = /^[a-f0-9]{64}$/; const commit = /^[a-f0-9]{40}$/;
const evidence = (entry) => entry?.status === "approved" && typeof entry.reviewer === "string" && entry.reviewer.trim()
  && /^https:\/\/github\.com\/Berk-Unsal\/atom\/(issues|pull)\/\d+(?:[#/?].*)?$/.test(entry.record_url || "");
function validatePolicy(policy, { version, source_commit, tag }) {
  if (policy?.schema !== 1 || policy.status !== "approved") throw new Error("Desktop release approval is pending; no assets may be published");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || "") || tag !== `v${version}` || !commit.test(source_commit || "")) throw new Error("Release identity must match canonical VERSION and exact tag source");
  for (const [key, value] of Object.entries({ version, source_commit, tag })) if (policy[key] !== value) throw new Error(`Release approval differs from ${key}`);
  for (const gate of GATES) if (!evidence(policy.gates?.[gate])) throw new Error(`Desktop release gate requires a recorded approval: ${gate}`);
  if (!Array.isArray(policy.candidates) || policy.candidates.length !== 3) throw new Error("All three qualified native targets are required");
  const names = new Set(); const targets = new Set();
  for (const candidate of policy.candidates) {
    const target = `${candidate.platform}-${candidate.arch}`;
    if (!TARGETS.includes(target) || targets.has(target)) throw new Error("Unsupported or duplicate candidate architecture"); targets.add(target);
    if (!Number.isSafeInteger(candidate.artifact_id) || candidate.artifact_id <= 0 || !Number.isSafeInteger(candidate.run_id) || candidate.run_id <= 0
      || !commit.test(candidate.workflow_commit || "") || !sha.test(candidate.artifact_sha256 || "")) throw new Error("Candidate requires immutable Actions run/artifact/digest identity");
    if (!evidence(candidate.clean_machine) || !Array.isArray(candidate.clean_machine.artifact_sha256)) throw new Error("Each target requires final-byte clean-machine qualification");
    if (candidate.platform === "darwin" ? !/^14\.\d+(?:\.\d+)?$/.test(candidate.clean_machine.os_version || "") : candidate.clean_machine.os_version !== "24.04") throw new Error("Clean-machine qualification must cover the proposed minimum OS baseline");
    if (candidate.platform === "darwin" && (candidate.clean_machine.quarantined_download !== true || candidate.clean_machine.offline_staple !== true)) throw new Error("macOS requires quarantined download and offline stapled launch evidence");
    if (candidate.platform === "linux" && (candidate.clean_machine.x11 !== true || candidate.clean_machine.wayland !== true || candidate.clean_machine.graphical_install !== true)) throw new Error("Ubuntu requires both sessions and graphical installer evidence");
    if (!Array.isArray(candidate.files) || !candidate.files.length) throw new Error("Candidate has no approved release files");
    const required = new Set(candidate.platform === "darwin" ? ["dmg", "zip", "sbom", "license_index", "licenses", "receipt", "smoke"] : ["deb", "sbom", "license_index", "licenses", "receipt"]);
    const binaryHashes = [];
    for (const file of candidate.files) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(file.name || "") || !file.name.startsWith(`atom-${version}-${target}`) || names.has(file.name)
        || !sha.test(file.sha256 || "") || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 1024 ** 3) throw new Error("Invalid, duplicate or unbound release file");
      names.add(file.name); if (!required.delete(file.role)) throw new Error("Unexpected or duplicate candidate file role");
      if (["dmg", "zip", "deb"].includes(file.role)) binaryHashes.push(file.sha256);
    }
    if (required.size) throw new Error("Candidate lacks binaries, runtime SBOM, notices or verification receipts");
    if (JSON.stringify([...new Set(candidate.clean_machine.artifact_sha256)].sort()) !== JSON.stringify(binaryHashes.sort())) throw new Error("Clean-machine evidence does not bind every final installer/archive hash");
  }
  return policy.candidates;
}
function verifyReleaseFiles(candidate, read) {
  const byRole = {};
  for (const file of candidate.files) {
    const bytes = read(file.name);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Approved candidate bytes changed: ${file.name}`);
    if (["sbom", "license_index", "receipt", "smoke"].includes(file.role)) byRole[file.role] = JSON.parse(bytes.toString("utf8"));
  }
  const receipt = byRole.receipt; const licenses = byRole.license_index; const bom = byRole.sbom;
  if (receipt.version !== candidate.version || (receipt.source_commit || receipt.commit) !== candidate.source_commit || receipt.platform !== candidate.platform || receipt.arch !== candidate.arch
    || receipt.data_redistribution_approved !== true || receipt.notices_complete !== true || licenses.notices_complete !== true || licenses.source_commit !== candidate.source_commit
    || licenses.version !== candidate.version || licenses.platform !== candidate.platform || licenses.arch !== candidate.arch
    || bom.bomFormat !== "CycloneDX" || bom.metadata?.component?.version !== candidate.version
    || !bom.metadata.component.properties?.some((item) => item.name === "atom:source:commit" && item.value === candidate.source_commit)) throw new Error("Candidate identity, rights approval, notices or SBOM are incomplete");
  if (receipt.sbom_sha256 !== candidate.files.find((file) => file.role === "sbom").sha256 || receipt.license_index_sha256 !== candidate.files.find((file) => file.role === "license_index").sha256) throw new Error("Candidate receipt does not bind the approved SBOM/notices");
  if (candidate.platform === "darwin") {
    if (receipt.result !== "SIGNED_CANDIDATE" || receipt.trust !== "developer-id-notarized-candidate"
      || !["app_staple_and_deep_signature", "dmg_staple_signature_and_integrity", "app_and_dmg_gatekeeper"].every((key) => receipt.verification?.[key] === true)
      || !["app", "dmg"].every((kind) => receipt.notarization?.some((item) => item.artifact === kind && item.status === "Accepted"))
      || byRole.smoke?.result !== "PASS" || byRole.smoke.source_commit !== candidate.source_commit || byRole.smoke.arch !== candidate.arch || byRole.smoke.version !== candidate.version
      || byRole.smoke.archive_sha256 !== candidate.files.find((file) => file.role === "zip").sha256 || byRole.smoke.native_sandbox_run_and_owned_cleanup !== true) throw new Error("macOS signing, notarization, stapling or signed smoke is incomplete");
  } else if (receipt.result !== "QUALIFIED_CANDIDATE" || receipt.trust !== "linux-package-candidate"
    || !["x11", "wayland"].every((session) => receipt.sessions?.[session]?.result === "PASS")) throw new Error("Ubuntu installed-package qualification is incomplete");
  for (const file of candidate.files.filter((file) => ["dmg", "zip", "deb"].includes(file.role))) {
    if (!receipt.artifacts?.some((artifact) => artifact.file === file.name && artifact.sha256 === file.sha256 && artifact.bytes === file.bytes)) throw new Error("Final installer differs from the qualified candidate receipt");
  }
  return { receipt, licenses, bom };
}
function validateCandidateRun(candidate, run, artifact) {
  const workflow = candidate.platform === "darwin" ? ".github/workflows/desktop-signing.yml" : ".github/workflows/desktop-candidates.yml";
  if (run.id !== candidate.run_id || run.event !== "workflow_dispatch" || run.head_branch !== "main" || run.head_sha !== candidate.workflow_commit || run.conclusion !== "success"
    || run.path !== workflow || run.repository?.full_name !== "Berk-Unsal/atom" || run.head_repository?.full_name !== "Berk-Unsal/atom"
    || artifact.id !== candidate.artifact_id || artifact.workflow_run?.id !== run.id || artifact.expired || artifact.digest !== `sha256:${candidate.artifact_sha256}`) throw new Error("Candidate was not produced by the approved successful protected workflow run");
}
module.exports = { GATES, TARGETS, validatePolicy, verifyReleaseFiles, validateCandidateRun };
