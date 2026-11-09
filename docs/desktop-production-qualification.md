# Production desktop qualification work record

Scope: #158, integrated production Electron host after #149–#157. This work is in progress. Accepted Electron supersedes the roadmap's original Wails/WebKit native-engine assumptions; a WebKit browser subset remains an early warning, not evidence for a supported native WebKit target. No public desktop support, redistribution or signing approval is implied.

## Measurement protocol

`npm run build --prefix desktop` stages the exact committed UI and Go executable. `npm run test:startup-budget --prefix desktop` requires a clean checkout and matching resource build identity. It records 20 paired fresh-profile launches and same-profile process relaunches, actual sidecar lifecycle timestamps from the existing redacted log, and launch-to-enabled-Run-Sector time. Filesystem/OS caches are uncontrolled: fresh profile/process is not a cold disk claim. No global cache purge is performed.

The same complete host/UI/binary is measured after 60 seconds idle with the full unchanged default pack and the canonical tiny sample pack. Every descendant host, renderer, GPU, utility and owned Go process appears in the process-tree record. Aggregate RSS sums shared pages; Linux PSS is additionally recorded when readable. Full-minus-sample is an observed whole-tree difference, not an isolated allocator measurement. Private temporary test profiles/resources are removed and owned processes must exit.

The original launch/readiness and 500 MiB aggregate RSS guidance remains an explicit comparator. A missed budget is recorded as `BUDGET_REVIEW_REQUIRED` and the command fails; this task cannot approve its own budget revision. Map/input, deterministic RF parity/timing, actual OS surfaces, the complete platform matrix and local package size are separate required measurements. Existing functional native suites retain their narrower claims.

Routine automation blocks public OSM from process startup, retains the production sandbox and never raises production RF admission limits. Test automation uses Playwright's external Electron harness; no privileged qualification endpoint is added to release code. Public default-data packaging remains subject to the [pending exact-hash review](desktop-data-redistribution-review.md).

## Dataset allocation investigation

The pre-change full-pack snapshot was captured from clean integrated source `98c50aa`. SHA-256 of the Go JSON encoding of every ordered footprint (all tags, IDs, metadata and coordinates), tower and demand summary is `a420550cfee8b9d08c994fb3e15f4389883db206904bce75ef723ab6d2612573`: 161,784 footprints, 936,651 vertices and 451 towers. The qualification-only helper is `desktop/test/go/dataset-load.go`, built from the backend module as its header describes; it is not part of the production binary.

Reusing only temporary feature properties/coordinate decode buffers reduces allocation pressure. Fields are reset before each feature, including missing/null values; output tags and vertices retain independent ownership. Differential fixtures compare against separately decoded complete collections, and malformed/trailing JSON remains rejected. No unknown property, coordinate precision, RF scope/cap or optimizer behavior is removed. Frozen-source measurements and HTTP parity remain required before treating this as a qualified restart performance improvement.

## Frozen local startup and memory result

Clean macOS arm64 source/resources `dc9132f9bc398b0abb6ce0de040b83a7b93dbf10` completed all 40 launches. [Raw measurements](assets/desktop-production-startup-macos.json) record the hardware and all five owned processes. Fresh-profile launch p95 is 2,278 ms; same-profile relaunch p95 is 2,259 ms. Sidecar-start-to-dataset-ready p95 is 1,921 / 1,911 ms. All four original startup/readiness comparators pass on this host, with the filesystem-cache limitation above.

After 60 seconds idle, aggregate RSS is **951.77 MiB** for the default pack and **522.67 MiB** for the sample pack; their observed difference is 429.09 MiB. The full-pack Go process is 434.39 MiB versus 17.61 MiB for the sample; host, GPU, utility and renderer remain included. The 500 MiB aggregate guidance therefore **fails**, including with this sample pack. No Electron replacement budget is approved here. RSS is not unique physical memory; macOS PSS is unavailable in this record. This is an unsigned development-host measurement, not clean-machine installed-app or Intel/Ubuntu evidence.

A prior attempt stopped after 15 launches when the page closed unexpectedly. The completed record is a new clean run after adding bounded failure-log capture to the harness. The interrupted attempt's deleted temporary profile did not retain a cause; it is not classified as an OS or product crash without evidence. Future failures retain existing redacted host/backend lifecycle records and process exit status.

`npm run test:rf-parity --prefix desktop` separately launches the same exact Go binary in ordinary loopback HTTP mode and through the production native transport. It compares entire metadata/capability and deterministic response JSON, alternates request order for warmed timing samples, closes unused workflow reservations through the normal API, and waits for the observed production budget window before real eight-Cell UI evaluate/optimize. Default RF limits, scope, search policy and precision remain unchanged. Map pan measurements use actual pointer gestures with all eight result-ray layers; event-to-second-animation-frame is an explicit presentation proxy, not an INP claim. Results and remaining criteria are pending.

## Frozen parser and development-loop result

Clean integrated source `197663935d0be2447984940ab84dbd900cf9bde3` passes the local development-loop functional and unchanged timing comparators: warm Go replacement **2,578.85 ms**, shell replacement and all 20 warmed JSX/CSS edits within their original limits. [Raw development-loop record](assets/desktop-production-dev-loop-macos.json) retains phases and hardware. This local result does not overwrite earlier prerequisite PRs' hosted timing misses.

[Five alternating full-pack baseline/candidate pairs](assets/desktop-production-dataset-load-macos.json) preserve the pre-change full snapshot exactly. Median allocated bytes fall from 1,008,044,640 to 619,010,752 (38.59%); median load time on this host falls from 1,870.92 to 1,734.64 ms (7.28%). Live post-GC Go heap is effectively unchanged at about 371.36 MB. The optimization reduces temporary allocation pressure, not the full retained dataset footprint. These small-sample local measurements do not establish hosted timing or a lower whole-app memory budget.

## Fault regressions during integration

A confirmed malformed bundled identity previously entered native status/approved roots before Go rejected the pack, so the recovery UI could receive non-text identity fields. Host metadata inspection now rejects invalid identity types, empty values and the canonical 128-byte identity bound before publishing them. Unit cases preserve settings/empty roots; a real native recovery case is added without changing the original resources.

A confirmed late Run-history completion could reattach a result after dataset activation had cleared its map. Clearing now invalidates the association sequence and pending Pareto history updates while preserving the truthful historical Run; successful dataset activation explicitly clears that association. Regressions hold/release real persistence promises, and the App dataset workflow must return to Run needed after clearing a previously successful result. Both failures were reproduced before their fixes; focused tests pass.

The first RF qualification attempt confirmed 18 exact standalone/native response comparisons (including 4G/5G/6G simulation) and completed eight-Cell UI evaluation. Its harness then failed to reopen Propagation before pressing Optimize after evaluation navigated to Results. The corrected harness explicitly opens that tool and handles response/click promises together; map/optimization acceptance requires a completed rerun. Partial results are not promoted to a complete native workflow qualification.
