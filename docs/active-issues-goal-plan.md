# Active GitHub issues: execution goal

Snapshot: 2026-11-08, repository `Berk-Unsal/atom`, main `95389c9`, product 0.13.1.
20 open issues; pull requests are inventoried separately and are not counted as issues.

## Goal and completion rule

Resolve as many of the active issues as their acceptance criteria and available evidence permit. Aim to complete all fourteen remaining macOS/Linux desktop work packages (#149–#162), then the parent tracker #147. Keep Windows #163 deferred and the four RF research issues #87–#90 evidence-gated. This is an execution plan, not a promise of public desktop support or physical RF accuracy.

An issue is complete only when its acceptance criteria have code, tests and any required native/external evidence. Proposed changes go through reviewable PRs with issue links, checks and explicit remaining limits. Preparing a PR is tracked separately from merging or closing its issues. Preserve existing web, Docker, headless API/CLI, RF semantics, project/report formats and root VERSION. No release dates, new assignments, public release or invented evidence.

## Verified starting point

- #148 is closed. Electron was selected in Gate 1; Gate 2 was explicitly accepted on 2026-11-05. The qualification code/report is now on main. The 2026-10-31 tracker comment predates this acceptance and no longer blocks #149.
- Main contains a disposable Electron spike and opt-in Go desktop control protocol, not a production desktop host. Reuse proven contracts, with production boundaries and focused tests; retain historical spike evidence.
- Existing Dependabot PRs #49, #52, #146 and #175–#177 are independent of this issue plan. Avoid mixing dependency-major upgrades into desktop implementation.

## Execution order

| Order | Issues | Deliverable and evidence | Prerequisites / status |
| --- | --- | --- | --- |
| 1 | [#149](https://github.com/Berk-Unsal/atom/issues/149) | Thin Electron host, shared React build, browser/native capability adapter, narrow preload, menus/About/Quit, safe links and bounded geometry; unsigned native launch plus browser tests. | Ready; first implementation batch. |
| 2 | [#150](https://github.com/Berk-Unsal/atom/issues/150) | Owned sidecar with private control pipes, dynamic loopback, identity/readiness, bounded startup/drain, crash/restart/generation handling and parent-death tests. | After #149. Existing Go support is a starting point, not closure. |
| 3 | [#151](https://github.com/Berk-Unsal/atom/issues/151) | Stable origin and authenticated API proxy, per-generation host-only token, exact origin/Host, CSP and native capability/navigation isolation. Test hostile origins, stale work, JSON/Blob cancellation and real engine navigation. | After #150. |
| 4a | [#152](https://github.com/Berk-Unsal/atom/issues/152) | Clean-clone dev/build/test commands, React HMR and safe build-before-swap Go watcher; failed-build and cleanup tests; record 20-edit HMR and warm Go/shell timing. | After #151. |
| 4b | [#153](https://github.com/Berk-Unsal/atom/issues/153) | Private native/XDG directories, isolated durable release/dev/test profiles, atomic settings and recovery; persistence across restart, port, relocation and upgrade. | After #151; independent of #152. |
| 5a | [#154](https://github.com/Berk-Unsal/atom/issues/154) | Dialog-approved project Open/Save/Save As/Export using existing serializer and validation; cancellation, atomic replacement, failure and Unicode/identity cases. | After #153. |
| 5b | [#155](https://github.com/Berk-Unsal/atom/issues/155) | Validated native dataset registry/copy/reference and safe recovery; approved default-data redistribution basis and production map-provider arrangement. | After #153. Data rights and provider access require actual evidence. |
| 5c | [#156](https://github.com/Berk-Unsal/atom/issues/156) | Native report/review Save and isolated Print/PDF using shared renderers and retained bytes; hostile HTML, cancellation and Chromium reference checks. | After #153. |
| 5d | [#157](https://github.com/Berk-Unsal/atom/issues/157) | Bounded redacted logs, actionable startup/crash diagnostics and explicit recovery without replaying RF work. | After #153; build testable diagnostics interfaces in the foundation. |
| 6 | [#158](https://github.com/Berk-Unsal/atom/issues/158) | Additive native smoke matrix, unchanged RF/availability parity, startup/HMR/RF/size measurements; written memory-budget review separating shell and dataset overhead. | After #152 and #154–#157. Existing spike evidence does not qualify production changes. |
| 7a | [#159](https://github.com/Berk-Unsal/atom/issues/159) | Architecture-specific macOS bundles, resource relocation, metadata/license checks and clean-machine installation. | After #158; test arm64 and Intel independently. |
| 7b | [#161](https://github.com/Berk-Unsal/atom/issues/161) | Ubuntu 24.04 x86_64 .deb, actual Electron runtime/sandbox dependencies and AppArmor policy, X11/Wayland install/upgrade/uninstall evidence. | After #158. Issue's original Wails-specific wording must be reconciled with accepted Electron; no universal-Linux claim. |
| 8 | [#160](https://github.com/Berk-Unsal/atom/issues/160) | Protected signing/notarization/stapling, nested executable verification and downloaded/quarantined clean-machine tests. | After #159; requires an owned Developer ID identity and protected credentials. Keep local builds unsigned. |
| 9 | [#162](https://github.com/Berk-Unsal/atom/issues/162) | Credential-free PR artifacts, protected native release jobs, unified VERSION, checksums/SBOM/licenses, installation/manual-update docs and fail-closed release gates. | After #160 and #161. Public desktop publication requires all six gates plus data/provider decisions. |
| 10 | [#147](https://github.com/Berk-Unsal/atom/issues/147) | Reconcile child checklist and Gate 1–6 evidence; close only when the macOS/Linux MVP is verified. | After #149–#162. Tracker wording still contains superseded Wails assumptions; use the accepted Electron ADR. |

## External evidence and deferred work

| Issue | Required evidence / next action | Closure rule |
| --- | --- | --- |
| [#87](https://github.com/Berk-Unsal/atom/issues/87) | Version/device-specific authoritative collector serving-state explanation; reviewed accepted/rejected/ambiguous matrix. | External evidence or an evidence-backed no-go; no parser fallback or new collection inferred. |
| [#88](https://github.com/Berk-Unsal/atom/issues/88) | Permitted authoritative exact transmitter mapping and RF field provenance/uncertainty. | Never substitute nearest tower or planning defaults for truth. |
| [#89](https://github.com/Berk-Unsal/atom/issues/89) | Observation-bound bandwidth, frequency, quantity/reference-plane and resource evidence, per KPI. | Retain missing sentinels and canonical frequency tolerance; exclude unsupported quantities. |
| [#90](https://github.com/Berk-Unsal/atom/issues/90) | #87–#89 decisions plus compatible licensed reference data, receiver/AGL and independent outdoor/LOS labels, then predeclared holdout study. | A no-go remains a validation blocker; synthetic fixtures cannot establish physical accuracy. |
| [#163](https://github.com/Berk-Unsal/atom/issues/163) | Written Windows runtime/path/process/installer proposal after stable macOS/Linux release foundation. | Deliberately deferred, no date/assignee; does not block MVP. |

## Validation and progress ledger

- For each batch: acceptance-criteria checklist, focused automated tests, applicable lint/build/version/docs checks, native evidence when behavior depends on the engine/OS, and a reviewable PR.
- Preserve the existing browser and Go checks. Do not claim signed packages, clean-machine support, provider permission or RF measurements from local unit tests.
- Current: repository and complete open-issue inventory verified; goal created; plan written. #149 has a local unsigned Electron host and shared platform adapter in implementation, with canonical About, native menus, safe links, bounded geometry, private owned sidecar transport and focused regressions. The host uses patched Electron 44.10.2 rather than inheriting the spike's vulnerable 44.7.0 pin. macOS arm64 smoke passed real Run Sector and network evaluation/Results, sandbox/no-Node checks, typed links, normal-window quit and real sidecar reaping. The shared Stadia provider still returns authentication-error tiles; #155 retains that dependency. No issue has been claimed merged or closed by this execution goal yet; #150's full restart/generation and #151's complete security qualification remain separate work.
