# macOS signing and notarization work record

Scope: #160, stacked on architecture-specific native packages. Status: **implementation/protocol draft; no Developer ID import, Apple upload, accepted notarization or signed clean-machine launch has occurred in this task**. Current source/data authorization records remain pending. Local unsigned development and package assembly still need no paid identity.

## Reviewable signing plan

```sh
node desktop/scripts/sign.mjs --plan ABSOLUTE_INTERNAL_PACKAGE_DIRECTORY
```

Preview validates unchanged package bytes/permissions/links, matching VERSION/build identity and the actual Mach-O inventory, and prints per-file entitlements and execution phases. It reads no signing credential, creates no keychain and contacts no Apple service. A local preview against clean built source `797f199` finds all 15 arm64 Mach-O files and truthfully reports pending source/data approval; it is not signing evidence.

The proposed policy gives only `com.apple.security.cs.allow-jit` to the outer Electron app, its main executable and the named Electron helper apps/executables. The Go sidecar, frameworks and other libraries receive no entitlement keys. Automatic entitlement/provisioning additions are disabled. There are no camera, microphone, location, Apple Events, unsigned-executable-memory, task-debugging or disabled-library-validation exceptions. This policy still requires actual Developer ID runtime qualification; failures require diagnosis and reviewed changes, not automatic extra entitlements.

The pinned official `@electron/osx-sign` 2.7.2 signs from nested code outward, with hardened runtime, secure timestamps, identity validation and strict verification. The implementation independently discovers every Mach-O, compares that set to package architecture metadata, then verifies each signed native file's Developer ID/team, runtime flag, timestamp and exact entitlement keys. `--deep` is used for verification only. See [Electron signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing), the [official signer's API](https://packages.electronjs.org/osx-sign/v2.6.0/interfaces/SignOptions.html) and [Apple hardened runtime](https://developer.apple.com/documentation/security/hardened-runtime).

## Protected candidate workflow

`Trusted macOS desktop candidate` is manual dispatch only, restricted to this repository's protected `main`. A credential-free authorization job checks the single root VERSION, exact existing `vVERSION` tag/source, recorded maintainer decision and an existing `desktop-signing` environment with required reviewers and a protected-branch deployment policy. Missing protection or an absent/pending source/data record fails before a credential-bearing job is scheduled. PRs and forks cannot enter the signing path.

`desktop/signing-authorization.json` is deliberately pending. A maintainer must record the exact source commit/version, selected Developer ID certificate SHA-1, Apple team ID and decision URL on the protected policy branch. This is an approval for candidate signing, not public release. Policy/tools are checked out at the protected workflow SHA; product code is independently pinned to the approved source. Source npm/build/native-package smoke run before the credential step. Neither arbitrary dispatch input nor a mutable tag can substitute another source after authorization.

The `desktop-signing` environment owns these scoped secrets:

- `ATOM_DEVELOPER_ID_P12_BASE64` and `ATOM_DEVELOPER_ID_PASSWORD`: the exported owned Developer ID Application identity.
- `ATOM_NOTARY_KEY_BASE64`, `ATOM_NOTARY_KEY_ID`, `ATOM_NOTARY_ISSUER_ID`: the owned App Store Connect notarization API key and identifiers.

No certificate/key is purchased or assigned by the implementation. Credentials are consumed only after source/context/environment and actual bundled-data checks. They are removed from child-process environment inheritance before importing the signer. A temporary private keychain and 0600 temporary files hold the identity/API key; the existing keychain search list and user keychains are unchanged. `security` import errors do not print command arguments/passwords. Keychain/key files are cleaned on success and failure, and receipts contain only public identity fingerprints/team and verification metadata. Rotation changes the protected environment secrets and reviewed certificate selection; retired credentials are revoked/removed by their owner. Nothing is committed to the repository or placed in the app.

## Exact candidate sequence

1. Verify private-key identity is a valid matching **Developer ID Application** certificate, then sign/verify nested code before the outer app.
2. Submit an app ZIP with `notarytool`, require an explicit accepted job, staple and validate the app ticket, and verify the complete signature again.
3. Create the DMG from the stapled app, sign that image, notarize it, staple/validate its ticket and verify image/signature integrity.
4. Require normal Gatekeeper assessment of both app and DMG. Create the final ZIP from the already-stapled app and record final archive checksums plus final app inventory.
5. Launch the final signed ZIP on the matching native arm64/Intel runner, preserving the production sandbox, a system-only PATH, private disposable home, one explicit Sector run and owned-process cleanup. Candidate upload runs only after this succeeds.

Receipts record Apple submission IDs/statuses and submitted-byte hashes, per-file policy checks, stapling/Gatekeeper results and final archive hashes. Failed submissions retain bounded structured diagnostics; a failed/partial receipt remains untrusted. There is no re-sign/rebuild after final candidate hashes. See [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and [custom notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

The source package and protected review must both approve the exact manifest/layer hashes before any Apple upload. Current [default-data approval](desktop-data-redistribution-review.md) is pending, so this condition is not met. Failure diagnostics exclude binary archives and credentials. A successful protected job would retain clearly named notarized **candidates**, not attach public release assets; #162 publication gates remain separate.

## Evidence and outstanding acceptance

Eight focused contract/credential tests pass, covering pending/mismatched approvals, PR/fork/unprotected-context denial, environment protection, valid identity/team selection, per-file entitlements, Apple acceptance validation, signature hardening and credential-environment removal. All 136 host tests, syntax checks and zero-vulnerability desktop npm audit pass locally. The credential-free preview matches the actual 15-file native inventory.

Actual identity ownership/protected environment configuration, accepted Apple submissions, stapled Developer ID artifacts, signed native runtime behavior and downloaded/quarantined clean macOS arm64/Intel offline launches remain unproven. Hosted functional launch is not clean-machine or offline evidence. The proposed macOS 14 floor, configured-printer Print and all outstanding #158/#155 acceptance retain their gates. This implementation cannot close #160 until those concrete requirements are verified; no Gatekeeper bypass is supplied.
