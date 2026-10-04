# Persistence reliability audit

Audit date: 2026-10-04. Scope: two existing persistence defects at the supported six-Cell baseline. No selection cap, RF, optimizer, request budget or deadline changes.

## Starting baseline

- Branch `main`, HEAD `d6251b26126807027cba6ef55d47d97f7bcb7002`, VERSION `0.10.2`.
- Tracked diff empty. Existing untracked capacity-audit backend test, scripts, browser tests and documentation/assets preserved.
- Baseline frontend: 377 tests in 67 files pass; lint and build pass (existing bundle-size advisory). Baseline E2E: 160 passed, 188 gated/skipped, across four responsive projects.

## Persistence ownership (before changes)

| State | Owner / durable representation |
| --- | --- |
| Projects / Scenario snapshots | `useProjectWorkspace` → `LocalRepository` → `projectStore`; IndexedDB `atom-planning-workspace/workspace/current`, revisioned whole-workspace writes; localStorage failure fallback |
| Versions | `Scenario.domain.revisions`; immutable domain input snapshots; saved through repository compatibility adapter |
| Runs | Separate IndexedDB `atom-run-history/runs`; canonical requests and compact public scientific outputs; intentionally excluded from portable ProjectV2 exports (Concept 7C) |
| Selected network, order, active Cell, mode | `App` live state; Scenario `plan` and autosaved Project `draft.plan`; normalized to existing six-Cell cap during hydration |
| Map Focus / ray scope | Scenario plan presentation fields; excluded from scientific Scenario identity; existing autosaved draft omits these fields |
| Stage/tool, camera, selected Pareto UI item | Ephemeral React/navigation state; reconstructed from defaults |
| RF/map rays, coverage gaps, optimization/Pareto, interference, diagnostics, recommendations, measurement and building-entry results | Live `App` state; retained in saved Scenario `artifacts` when inputs are current; latest five Scenario caches retained by existing workspace compaction |
| Coverage surface, transient explanation selection, requests/cancellation | Ephemeral; not part of saved Scenario artifact bundle |
| Reports | Live export plus separate report/artifact lifecycle; no generated report bytes in ProjectV2 export |
| Undo | Six-second single notice closure in `App`; restore uses workspace hook; no durable Undo history or Redo |
| Autosave | 500 ms debounced draft inputs; cleanup cancels replaced timer; workspace writes serialize with increasing revisions |
| Export | Synchronous pretty JSON `{schemaVersion:2, project}`; no export byte limit |
| Import | UI preflight file byte check; store UTF-8 byte check, JSON parse, budget traversal, schema/snapshot checks; import forks project and Scenario IDs and removes their domain metadata by existing contract |

## Import limit history and contract

`cbd0834cd4d301ca7edc9017228de4d4740152b3` (2026-07-31), “feat: add utility functions for app workspace and inventory import”, introduced the 16 MiB, depth 40, 250,000-node, 2,000-key, 25,000-array-item and 1 MiB-string guards together. History does not explain the numeric byte threshold or establish a browser-memory measurement. Technical intent is security/resource protection; numeric rationale **unknown**. Classification: multiple (resource safety plus undocumented conservative threshold).

`features.md` promises complete versioned projects. Actual contract is editable project inputs plus retained Scenario result artifacts, not an archive of all local Run history. Concept 7C explicitly excludes the separate history database. Import deliberately creates fresh project/Scenario IDs and strips domain metadata. These existing identity/portability limitations must be distinguished from result loss. Concept 7A's statement that 16 MiB applies to export too is incorrect: export never enforced it.

## Investigation ledger

## Independent before-fix reproductions

The primary result reproduction uses the real production UI and captured, unmodified six-Cell backend responses, not a generated oversized padding file. Inventory comes from the Ankara pack. Request settings are 28 GHz, 120 rays per Cell, 400 m radius. Workflow: six Cells → Evaluate Network → Analyze Interference → Optimize Network → Save Version → actual UI download → select that same downloaded file for Import.

The download was **31,156,171 bytes** (29.71 MiB). Both UI preflight and the original helper reject it at **16,777,216 bytes / 16 MiB**. Removing whitespace yields 14,935,989 bytes but **578,091 nodes**; the 250,000-node guard also rejects it. Largest array 6,542, depth 15, largest object 48 keys. Both failures must be repaired; a byte-only change cannot work. The small size difference from the preceding capacity audit's 31,151,189 bytes is input/default/domain metadata, not altered ray science.

The separate input-only Scenario reproduction starts with the same six Cells, saves a Scenario, waits for durable storage, deletes it, waits for deletion, presses Undo, verifies immediate `Network · 6 cells`, then reloads. The original implementation reloads to Single / zero selected Cells. The original pre-delete callback regression fails deterministically in the hook, independent of browser timing. Baseline traces and command output were retained in `/tmp/atom-persistence-reproduction.log`, `/tmp/atom-persistence-undo-before.log` and `/tmp/atom-persistence-undo-unit-before.log` during investigation.

## Exact byte composition

Values below are disjoint serialized value fragments including their actual two-space indentation at the source depth. Keys/container delimiters/separators outside those fragments are assigned to the final syntax row. They sum exactly to 31,156,171 bytes. Machine-readable details and regeneration are in `assets/persistence-reliability/export-measurements.json` and `scripts/persistence-reliability-audit.mjs`.

| Section | Bytes | File % |
| --- | ---: | ---: |
| Project metadata | 180 | 0.00058 |
| Autosaved network/input draft | 4,976 | 0.01597 |
| Scenario metadata / summary / dataset/model references | 695 | 0.00223 |
| Scenario network / inventory inputs | 5,343 | 0.01715 |
| RF request snapshot | 10,109 | 0.03245 |
| Version / embedded domain metadata | 24,004 | 0.07704 |
| Merged per-Cell ray features | **30,908,955** | **99.20653** |
| RF statistics | 177 | 0.00057 |
| Optimization baseline | 20,344 | 0.06530 |
| Public Pareto alternatives | 135,446 | 0.43473 |
| Other optimization results / evidence | 44,102 | 0.14155 |
| Interference empty bundle after optimization | 297 | 0.00095 |
| Other retained artifacts | 171 | 0.00055 |
| Remaining JSON syntax / whitespace | 1,372 | 0.00440 |
| **Total** | **31,156,171** | **100** |

The 6,542 merged ray features belong to Cells 9664800 / 26390 / 9664790 / 9664795 / 9664791 / 9664794 with 1,093 / 706 / 1,004 / 1,239 / 1,250 / 1,250 segments. There is no second persisted array of separate per-Cell simulation responses. Geometry value fragments alone contribute 2,535,770 bytes; most ray bytes describe scientific properties, link budgets and LOS evidence. 6,542 LOS classification instances contain 2,242 distinct values; 6,542 link budgets contain 3,339 distinct values.

The initial workflow clears interference when optimization replaces the baseline. Final acceptance additionally analyzes interference again and saves a second Version: its complete logical project is about 19.6 MB / 728,000 values, rather than assuming an empty interference bundle is representative of all retained state.

## Duplication classification

| Repetition | Classification / treatment |
| --- | --- |
| Inventory and request inputs in draft / current Scenario / immutable Versions | Required independent snapshots and provenance; preserved |
| Per-segment link budgets and LOS classification | Required scientific provenance, even when equal; represented once in columns/dictionaries and reconstructed independently |
| Repeated GeoJSON field names, constants and formatting | Serialization overhead; safely removed with a versioned lossless representation |
| Public baseline and Pareto alternatives in optimization/domain summaries | Required public evidence/compatibility snapshots; preserved |
| Standalone per-Cell simulation copies beside merged rays | Not present in this actual export |
| Report bytes / separate durable Run History / surfaces | Intentionally excluded by existing contract, not deleted by the fix |

No unnecessary scientific results or authoritative state were found that could legitimately be dropped to meet a limit. Root-cause classification: **multiple** — import limits cannot accept the app's raw own result export, and the legacy representation repeats large scientific structures and pretty formatting inefficiently. This is not a larger-network or RF-capacity failure.

## Candidate fixes and decision

| Candidate | Compatibility, safety, portability and cost | Decision |
| --- | --- | --- |
| Raise byte ceiling | Existing format easy to read, but 578,091 values still fail the unchanged node guard; historical byte rationale is unknown | Reject; insufficient and unnecessary |
| Minify only | Backward-compatible, no provenance loss, ~14.94 MB; still too many nodes | Insufficient alone |
| Drop display/derived artifacts | Small code change but changes current retained-result contract and can destroy scientific evidence | Reject |
| General gzip export | Full fidelity and portable compression, but changes sync/UI interfaces, needs decompression-bomb preflight and still faces the logical node guard | More complex than needed |
| Lossless versioned columns | Keeps JSON and current synchronous UI; all scientific content restored exactly; small isolated codec; explicit preflight and old readers retained | **Chosen** |
| Split opaque artifacts | Multiple files / bundle lifecycle, more migration and portability complexity | Unnecessary |

The chosen v3 file format keeps workspace schema v2 and all RF/API DTOs unchanged. It encodes only retained GeoJSON FeatureCollection feature arrays, recursively using exact constant, dictionary, object/array/group columns and finite JSON number vectors. It restores missing-key distinctions, row order, nulls, nested provenance and independent objects. It adds no dependency or compression library.

The physical import/export byte limit remains **16 MiB**. Serialized depth **40**, nodes **250,000**, object keys **2,000**, arrays **25,000**, strings **1 MiB**, and Scenario count **100** remain unchanged. v3 adds a separate complete logical expansion preflight of **32 MiB / 1,000,000 values**, justified by the real fully retained six-Cell snapshot. These are representation-specific limits, not removal of the original parser guards. All non-node logical guards are reapplied after reconstruction. Expansion is measured before allocating any decoded row, and export checks the same bounds.

New imports keep Version and embedded Run metadata instead of silently dropping it. Editable local project/Scenario/Version/embedded-Run/inventory IDs receive coherent new IDs; `importProvenance.identityMap` retains source identity. Scientific snapshots, fingerprints, compute run IDs, solution IDs, recommendations and Pareto order remain unchanged. Separate Run History is still not part of the file. v1/v2 imports retain their previous copy semantics; all previously valid files remain supported. An old 31 MB v2 file was never valid under the old ceiling and remains rejected. Use the new exporter from retained local state to obtain a supported v3 artifact.

## Before / after and browser acceptance

The original 31,156,171-byte UI artifact now exports to **2,744,530 bytes** with **84,327 encoded nodes**, depth 32 and largest encoded array 3,153. Full reconstructed artifact equality is tested, not just summaries. The stricter two-Version + retained-interference browser artifact is **3,195,659 bytes**. These sizes are fixture-specific, not promises about arbitrary numbers of saved caches.

The benchmark ledger reports five samples of legacy pretty export, v3 generation and full import. v3 generation costs more CPU (hundreds of milliseconds) than plain pretty serialization (tens of milliseconds); it avoids the legacy size and node rejection and retains all content. Browser timings and heap snapshots are in `assets/persistence-reliability/browser-timings.json`; parse is measured separately from validation/reconstruction and full import. UI import timing includes persistence and test-observation overhead. Reload/hydration timing includes page navigation and inventory loading. Heap snapshots are observations, not a claimed peak-memory limit or a constrained-device certification.

## Delete / Undo lifecycle root cause

`App.deleteScenarioWithUndo` captures the entire pre-delete `projectWorkspace` object in its toast closure. `restoreScenario` used a render-time `activeProject.scenarios.some(id)` duplicate check. That pre-delete project still contains the removed Scenario, so the callback returns before `updateProject`, revision allocation or persistence. No restoration write exists. The unchanged live RF selection makes Undo look successful until reload reads the durably deleted project. Classification: **stale closure + Undo does not durably persist restored state**; not a debounce, RF normalization, cap, revision conflict or current-pointer-only failure.

The repair moves the duplicate check inside the updater recipe, where `workspaceRef.current` supplies the latest project. It restores the original Scenario object at its original position, reactivates its ID and clears a competing draft when reactivating. All existing workspace revision and serialized-write behavior is preserved. A captured restore callback targets its originating project ID, not a newly selected project.

Testing immediate reload after this repair exposed an additional write-initiation window: opening and closing a new IndexedDB connection for every write could leave restoration waiting for `open()` when navigation began. The workspace store now reuses its connection, releases it on `versionchange`/abnormal close, and explicitly commits its one-record transaction after queueing the write. The store/database/schema remain unchanged. Writes still serialize; storage failures still reach the hook and fallback. This is not a new Undo framework or storage migration.

The test-only browser ledger records `performance.timeOrigin + performance.now()`, revision and active Scenario ID for transaction start/complete. The final captured run records r1 write-start at 178.6 ms, r1 write-complete at 189.4 ms, r2 write-start at 275.3 ms, r2 write-complete at 284.8 ms, r3 write-start at 324.3 ms, r3 write-complete at 337.7 ms, with explicit delete, Undo, post-Undo-save and reload-read checkpoints. Autosave scheduling/cancellation/firing records include timer identity. The complete ledger is in `assets/persistence-reliability/undo-timeline.json`. Hook tests additionally capture queue events, pending-write barriers and fake-timer delay; no full payload is logged.

## Save Version / autosave ordering

The strengthened two-Version workflow exposed a related write-order defect: autosave could queue the previous Scenario history while `saveScenarioVersion` was reading/building its repository mutation. That autosave received a newer persistence revision and could overwrite the new Version on disk while React still displayed Version 2. A deterministic repository barrier test reproduces this ordering and preserves a concurrently edited draft.

The hook now checks the latest queued revision when the repository Version save returns. If a newer workspace write exists, it commits the newly saved immutable Scenario history onto the latest workspace after that write, retaining the latest working draft, active pointer and other projects. This is a targeted Version reconciliation, not a new autosave or persistence framework. The 25-case browser acceptance matrix passes after this fix, including the fully retained two-Version export/import.

## Regression matrix

| Case | Outcome |
| --- | --- |
| Captured callback before deletion | Restores original ID and snapshot; old code fails |
| Undo at 0 / 100 / 750 ms | Pass, fake timers plus browser workflows |
| Undo after confirmed delete | Pass |
| Autosave absent / queued / completed | Pass; controlled writer barriers enforce ordering and preserve newly saved Version history |
| Reload after restoration commit | Pass on 1440 / 1024 / 768 / 390 viewports |
| Immediate reload after Undo | Pass with reusable connection / explicit commit; 12 repeated checks across four viewports |
| Delete without Undo → reload | Remains deleted |
| Repeated sequential delete / Undo; duplicate callback | Same Scenario, no duplicate; no Redo added |
| Scenario / Version / embedded Run IDs on Undo | Original identities preserved |
| Selected IDs/order, active Cell, Map Focus, Network mode | Saved Scenario plan and full domain equality preserved across reload |
| v3 export/import science | Full artifact, request, plan and Version input/fingerprint equality; mapped local links coherent |
| Legacy fixture / v1 / v2 | Shipped sample, input snapshots and small retained-result fixtures pass |
| Oversize / depth / nodes / array / keys / string / unsafe fields | Existing guards reject |
| Malformed JSON / future version / corrupted results / invalid columns / retained domain metadata | Clear errors; no workspace replacement |
| Byte or node expansion bomb / invalid number vector | Preflight rejects before decoded-row allocation |
| IndexedDB write failure / localStorage quota failure | Existing fallback/error tests pass; Undo remains coherent in memory and reports failed save |
| Aborted/malformed import | Existing workspace unchanged; no durable write before validation |

Hard browser/process termination or disk failure while storage is still reporting Saving cannot guarantee completed durability. Quota rejection remains a visible error, not a successful-save claim. This repair does not implement disaster recovery, cross-tab conflict resolution, broader archival storage or export of external history.

## Validation and release decision

Final frontend validation:

- `npm test`: **423 tests / 68 files pass** (baseline 377 / 67).
- `npm run test:e2e -- --workers=2`: **185 pass / 191 gated or skipped**, including 25 new acceptance cases across responsive viewports. The separately repeated immediate-reload matrix passes **12/12** with four workers.
- `npm run lint` and `npm run build`: pass; existing bundle-size advisory remains.
- `sh docs/build-reference-pages.sh`: pass; Pandoc emits its existing mathml deprecation advisory.
- Docs validation: **47 HTML pages / 41 API paths pass**; version metadata check: **0.10.2 consistent**; `git diff --check`: pass. The system Python lacked PyYAML, so validation used a temporary virtual environment with the repository's pinned, hash-verified `docs/requirements.txt`; no repository dependencies were changed.

The first full browser run under high worker contention had a pre-existing basemap test timestamp-only autosave race and an immediate-Undo reload failure. The latter led to the explicit commit fix; the final complete two-worker run passes, including the basemap contract. No unrelated browser workflow was weakened. Test-generated historical screenshots/evidence files were restored to the starting baseline.

Measured two-Version, retained-interference browser results: export generation **597.6 ms**, artifact **3,195,659 bytes**, JSON parse **2.8 ms**, validation + reconstruction **511.0 ms**, complete helper import **675.0 ms**, UI import + persistence + observation **3,755.4 ms**, reload + hydration **663.4 ms**. Retained JS heap after explicit GC: **87,228,428 bytes** before import and **118,834,740 bytes** after importing the independent second project. Uncollected snapshots also remain in the evidence ledger; these are not peak-memory guarantees.

Files changed for this repair:

- `frontend-react/src/utils/projectStore.js`, new `projectRayColumns.js`, existing store tests and new `projectFileReliability.test.js`.
- `frontend-react/src/hooks/useProjectWorkspace.js` and its captured-callback / barrier / failure tests.
- `frontend-react/e2e/persistence-reliability.spec.js` and compressed real-response / actual UI-export fixtures with manifest and README.
- `scripts/persistence-reliability-audit.mjs` and four baseline/measurement/timeline JSON evidence files.
- This audit, `project-format.md`, generated reference HTML, `features.md` / HTML, `build-reference-pages.sh`, regenerated search index, and `CHANGELOG.md` / generated changelog.

Both reproduced defects are resolved at the supported six-Cell baseline. Selected order, active Cell, Map Focus and mode pass exact saved-plan comparisons. Undo preserves Scenario and Version identities; portable imports intentionally remap editable local identities while recording source provenance and retaining exact scientific values. No version bump, commit, release, capacity expansion or backend change is performed. No backend production files are changed; backend suites are unnecessary for this browser-local ownership. No Cell-cap, request builder, RF math, optimization/search, Pareto/recommendation, fingerprint, budget or deadline change is included.

Recommended release: **minor** (e.g. 0.11.0), because portable file schema v3 materially expands serialization/provenance behavior and older applications cannot read new exports, even though readers remain backward-compatible. VERSION is unchanged. Freeze the six-Cell persistence baseline after final validation; do not use these results to expand network size.

The final metadata safety check additionally validates retained ScenarioRevision, Run, inventory revision and report-definition records before v3 hydration. The focused 25-case browser matrix passes again after that validation change; malformed metadata is rejected before it can replace a usable workspace.
