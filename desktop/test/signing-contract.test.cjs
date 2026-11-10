"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { JIT, validateAuthorization, validateCIContext, validateEnvironment, validateDeveloperIdentity, entitlementsFor, validateNotary, validateSignature } = require("../lib/signing-contract.cjs");
const source = "a".repeat(40); const certificateSHA1 = "B".repeat(40); const teamID = "AB1234CD56";
const record = { schema: 1, status: "approved", version: "0.13.1", source_commit: source, certificate_sha1: certificateSHA1, team_id: teamID, reviewer: "maintainer", record_url: "https://github.com/Berk-Unsal/atom/issues/160#issuecomment-1" };
test("signing authorization fails closed for pending, changed-source or incomplete decisions", () => {
  assert.deepEqual(validateAuthorization(record, record), { certificateSHA1, teamID });
  for (const change of [{ status: "pending-maintainer-review" }, { source_commit: "c".repeat(40) }, { certificate_sha1: "-" }, { reviewer: null }, { record_url: "https://github.com/other/repo/issues/160" }]) assert.throws(() => validateAuthorization({ ...record, ...change }, record));
});
test("forks, PR events, unprotected refs and unreviewed environments cannot sign", () => {
  const env = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "Berk-Unsal/atom", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REF_PROTECTED: "true" };
  validateCIContext(env);
  for (const patch of [{ GITHUB_REPOSITORY: "fork/atom" }, { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_REF_PROTECTED: "false" }, { GITHUB_REF: "refs/heads/feature" }]) assert.throws(() => validateCIContext({ ...env, ...patch }));
  validateEnvironment({ protection_rules: [{ type: "required_reviewers", reviewers: [{}] }], deployment_branch_policy: { protected_branches: true } });
  assert.throws(() => validateEnvironment({ protection_rules: [] }));
});
test("only the selected valid Developer ID Application certificate/team can sign", () => {
  const identity = `  1) ${certificateSHA1} "Developer ID Application: Example (${teamID})"\n`;
  validateDeveloperIdentity(identity, { certificateSHA1, teamID });
  for (const invalid of [identity.replace("Developer ID Application", "Apple Development"), identity.replace(teamID, "ZZ1234CD56"), identity.replace(certificateSHA1, "C".repeat(40))]) assert.throws(() => validateDeveloperIdentity(invalid, { certificateSHA1, teamID }));
});
test("JIT applies to Electron processes and never to Go or unrelated libraries", () => {
  for (const relative of ["", "Contents/MacOS/atom-desktop", "Contents/Frameworks/A.T.O.M Helper (Renderer).app", "Contents/Frameworks/A.T.O.M Helper (GPU).app/Contents/MacOS/A.T.O.M Helper (GPU)"]) assert.deepEqual(entitlementsFor(relative), [JIT]);
  for (const relative of ["Contents/Resources/atom-api", "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework", "Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"]) assert.deepEqual(entitlementsFor(relative), []);
  assert.throws(() => entitlementsFor("../outside"));
});
test("notarization accepts only an explicit accepted job with a real submission ID", () => {
  const accepted = { status: "Accepted", id: "00000000-0000-0000-0000-000000000001" };
  assert.deepEqual(validateNotary(accepted), accepted);
  for (const patch of [{ status: "In Progress" }, { status: "Invalid" }, { id: "" }]) assert.throws(() => validateNotary({ ...accepted, ...patch }));
});
test("signature verification rejects ad hoc identities, missing hardening and extra entitlements", () => {
  const details = `Authority=Developer ID Application: Example (${teamID})\nTeamIdentifier=${teamID}\nCodeDirectory flags=0x10000(runtime)\nTimestamp=2026-11-10\n`;
  const xml = `<plist><dict><key>${JIT}</key><true/></dict></plist>`;
  validateSignature(details, xml, { teamID, expectedEntitlements: [JIT] });
  for (const removed of [`TeamIdentifier=${teamID}`, "Authority=Developer ID Application:", "runtime", "Timestamp="]) assert.throws(() => validateSignature(details.replace(removed, "missing"), xml, { teamID, expectedEntitlements: [JIT] }));
  assert.throws(() => validateSignature(details, xml.replace("</dict>", "<key>com.apple.security.cs.disable-library-validation</key><true/></dict>"), { teamID, expectedEntitlements: [JIT] }));
  assert.throws(() => validateSignature(details, xml.replace("true", "false"), { teamID, expectedEntitlements: [JIT] }));
});
