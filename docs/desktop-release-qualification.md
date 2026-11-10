# Desktop release integration and remaining qualification

Status: #162 implementation in progress. No public desktop release, rights approval, signing identity or minimum-OS acceptance is established by this document. Root `VERSION` remains the sole product version. The existing tag-triggered container/release-announcement workflow is unchanged.

## Runtime notices and SBOM

Native package assembly collects full original notice files for the installed frontend production dependency closure and every checksummed Go module actually linked into the backend. The Go standard-library notice matches the binary toolchain. Pinned Electron supplies its own license and embedded Chromium third-party notice inventory. Collection rejects source links, local Go replacements, checksum mismatches and escaped npm paths; absent notices remain explicit. Build dependencies are excluded from the runtime scope.

The machine-readable CycloneDX 1.5 SBOM includes the npm graph, exact linked Go versions/checksums, backend binary SHA-256, Electron vendor component and canonical version/source/OS/architecture. It does not claim a separate per-Chromium-library graph: Electron's full vendor notice document is retained. The serial identity and timestamp bind source/platform/binary and Git commit time. `license-index.json` inventories collected file hashes; package metadata binds the SBOM and index hashes. These files are bundled before signing, and JSON sidecars are retained by ordinary PR CI without data/app/archive uploads.

The real nine-package frontend runtime closure includes `react-leaflet` and `@react-leaflet/core`, whose installed package metadata/notices identify **Hippocratic-2.1**. Root MIT software licensing is not a conclusion that every dependency has MIT terms. A maintainer license review remains mandatory. The inventory is evidence, not legal or default-data approval.

## Candidate builds

Ordinary PR workflows are credential-free and retain metadata, inventories, diagnostics and screenshots only. They do not upload the bundled Ankara data or binary packages while its review is pending.

`Trusted macOS desktop candidate` remains a manual protected-main workflow using the separately reviewed `desktop-signing` environment and exact-source Developer ID authorization. It assembles the candidate, collects runtime notices before Apple submission, signs/notarizes/staples, verifies Gatekeeper and runs the final signed archive with the native sandbox. Archive names and DMG volume are final before QA; promotion does not alter signed bytes. Signed smoke has hosted functional scope; quarantined download/offline clean-machine acceptance is separate.

`Reviewed Ubuntu desktop candidate` is manual on protected main and checks an existing `vVERSION` tag already contained in main, source VERSION and both policy/source data-review states before entering the reviewed `desktop-candidates` environment. It builds one native Ubuntu candidate, then tests the exact installed `.deb` under X11 and Wayland, including apt upgrade/remove/purge and user-file preservation. The policy exporter rechecks exact bundled data hashes, complete source-bound notices and both session receipts before any candidate upload. Its normal installer name/description are set before QA. Public approval remains false.

Both workflows separate the protected policy checkout from the exact tagged product checkout and bind resulting candidate metadata to source/version/architecture. No signing credentials are available to PR jobs. Protected environments must already exist with required reviewers and protected-branch deployment rules; the code does not create or weaken them. Candidate retention is 14 days, so human QA and exact-byte review must occur before expiry or a new candidate must be built and qualified.

## Public promotion is fail-closed

`desktop/release-gates.json` is deliberately pending with no candidate approvals. It must be reviewed on protected main independently of the product tag, avoiding a self-referential source hash. Required recorded decisions cover Gate 1 Framework, Gate 2 WebView, Gate 3 Runtime, Gate 4 Developer experience, Gate 5 Filesystem, Gate 6 Distribution, plus exact-data rights, provider access, security and dependency licenses. Historical #148 spike acceptance is historical evidence rather than automatic candidate approval.

An approved record binds canonical version, tag/source SHA and all three native targets. Each target records the successful manual workflow's run ID, policy commit, immutable Actions artifact ID/archive SHA-256, a reviewer/evidence URL, proposed-minimum-OS clean-machine QA and final release-file sizes/hashes. macOS requires quarantined download and offline stapled launch evidence for every final ZIP/DMG hash on macOS 14; Ubuntu requires graphical installation plus X11/Wayland evidence on Ubuntu 24.04. Approvals are not populated by tests.

Each macOS candidate lists exactly one file for roles `dmg`, `zip`, `sbom`, `license_index`, `licenses`, `receipt`, `smoke`; Ubuntu lists `deb`, `sbom`, `license_index`, `licenses`, `receipt`. Filenames start `atom-VERSION-PLATFORM-ARCH` and are flat, unique regular files. Receipts must bind the exact binary, SBOM and notice-index hashes. Signed smoke must bind the final ZIP and matching source/version/architecture. The current data-review policy must approve the receipt's exact manifest/layer hashes.

`Reviewed desktop release promotion` is manual from protected main. A read-only job validates the policy, existing tag and existing published VERSION release, successful trusted candidate runs, archive digests, safe selected-file extraction, final bytes, notices, data and native/signing receipts. A second job repeats all verification inside the reviewed `desktop-publication` environment with narrowly scoped contents-write permission, then uploads the **same approved bytes** to the existing release. It generates only the separate `atom-VERSION-desktop-SHA256SUMS` metadata. It does not create a tag/release, rebuild, resign, replace or delete assets. Matching completed uploads allow retry; any different existing asset fails before writes. A partial network failure preserves prior uploads for investigation/retry.

Implementation uses GitHub's documented [immutable Actions artifact identity/digest endpoints](https://docs.github.com/en/rest/actions/artifacts) and [release asset digest/upload endpoints](https://docs.github.com/en/rest/releases/assets). Extraction reads only approved regular files with exact sizes; traversal, links, duplicates and excessive archives fail. The repository token is not forwarded to artifact storage.

## Qualification still required

Original #158 memory, warm-build and RF budget results remain review failures until addressed or explicitly revised with evidence. No limit was silently raised. Configured-printer Print, actual production chooser surfaces on Ubuntu, clean macOS 14/Ubuntu GNOME installation, Developer ID/Apple acceptance, downloaded/quarantined/offline tests, exact-data approval, provider access and dependency-license review remain open. See [production qualification](desktop-production-qualification.md), [macOS signing](desktop-signing-qualification.md), [Ubuntu installed-package evidence](desktop-ubuntu-package-qualification.md) and [installation/manual-update instructions](desktop-installation.md).

No Windows support, automatic updater, file association, release date or public distribution promise is introduced.
