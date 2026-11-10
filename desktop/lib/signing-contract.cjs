"use strict";
const JIT = "com.apple.security.cs.allow-jit";
const SHA = /^[a-f0-9]{40}$/i;
function validateAuthorization(record, candidate) {
  if (record?.schema !== 1 || record.status !== "approved") throw new Error("Exact-source signing authorization is pending maintainer review");
  for (const key of ["version", "source_commit"]) if (record[key] !== candidate[key]) throw new Error(`Signing authorization does not match candidate ${key}`);
  if (!SHA.test(record.source_commit || "") || !SHA.test(record.certificate_sha1 || "") || !/^[A-Z0-9]{10}$/.test(record.team_id || "")) throw new Error("Signing authorization identity/source metadata is incomplete");
  if (typeof record.reviewer !== "string" || !record.reviewer.trim() || !/^https:\/\/github\.com\/Berk-Unsal\/atom\/(issues|pull)\/\d+(?:[#/?].*)?$/.test(record.record_url || "")) throw new Error("Signing requires a recorded maintainer decision");
  return { certificateSHA1: record.certificate_sha1.toUpperCase(), teamID: record.team_id };
}
function validateCIContext(env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "Berk-Unsal/atom" || env.GITHUB_EVENT_NAME !== "workflow_dispatch"
    || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_REF_PROTECTED !== "true") throw new Error("Signing requires manual dispatch from this repository's protected main branch");
}
function validateEnvironment(environment) {
  const reviewers = environment?.protection_rules?.find((rule) => rule.type === "required_reviewers")?.reviewers;
  if (!Array.isArray(reviewers) || reviewers.length === 0 || environment?.deployment_branch_policy?.protected_branches !== true) throw new Error("The desktop-signing environment requires reviewers and protected-branch deployment policy");
}
function validateDeveloperIdentity(output, { certificateSHA1, teamID }) {
  const identities = [...output.matchAll(/^\s*\d+\)\s+([A-F0-9]{40})\s+"Developer ID Application: [^"\n]+ \(([A-Z0-9]{10})\)"/gmi)];
  if (!identities.some((identity) => identity[1].toUpperCase() === certificateSHA1 && identity[2] === teamID)) throw new Error("The imported keychain has no matching valid Developer ID Application identity");
}
function entitlementsFor(relative) {
  const normalized = relative.replace(/\\/g, "/");
  if (normalized.split("/").some((part) => part === "..") || normalized.startsWith("/")) throw new Error("Signing path escapes the app");
  const helper = /^Contents\/Frameworks\/(A\.T\.O\.M Helper(?: \((?:GPU|Plugin|Renderer)\))?)\.app(?:\/Contents\/MacOS\/\1)?$/;
  return normalized === "" || normalized === "Contents/MacOS/atom-desktop" || helper.test(normalized) ? [JIT] : [];
}
function validateNotary(response) {
  if (response?.status !== "Accepted" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(response.id || "")) throw new Error("Apple notarization did not return an accepted submission");
  return { id: response.id, status: response.status };
}
function validateSignature(details, entitlementXML, { teamID, expectedEntitlements }) {
  if (!details.includes(`TeamIdentifier=${teamID}\n`) || !/^Authority=Developer ID Application:/m.test(details)
    || !/flags=0x[0-9a-f]+\([^)]*\bruntime\b/i.test(details) || !/^Timestamp=.+/m.test(details)) throw new Error("Signature lacks the expected Developer ID, team, hardened runtime or secure timestamp");
  const keys = [...entitlementXML.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...expectedEntitlements].sort())) throw new Error("Signed entitlements differ from the reviewed per-file policy");
  if (keys.includes(JIT) && !/<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\s*\/>/.test(entitlementXML)) throw new Error("V8 JIT entitlement is not enabled");
}
module.exports = { JIT, validateAuthorization, validateCIContext, validateEnvironment, validateDeveloperIdentity, entitlementsFor, validateNotary, validateSignature };
