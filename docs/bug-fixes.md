# Bug-Fix Register

This register records confirmed A.T.O.M defects in priority order. Each resolved item includes its user impact, root cause, correction, and regression evidence. Planned features and model limitations are tracked elsewhere and are not mislabeled as bugs.

## Priority Definitions

| Priority | Meaning |
|---|---|
| Critical | Data loss, remote compromise, or broadly unusable core workflows with no practical recovery. |
| High | Incorrect planning state or results that can mislead a user or invalidate a principal workflow. |
| Medium | Material reliability, persistence, performance, or maintainability failure with a workaround. |
| Low | Localized inconsistency or edge case with limited operational impact. |

## Resolved

### ATOM-001: Saved Scenario Selection Was Not Persistent

**Priority:** High  
**Affected area:** Frontend project lifecycle  
**Target release:** Next release after 0.1.0

Opening a named scenario restored its values in React state but never changed the project's persisted `activeScenarioId`. Reloading could therefore reopen an older scenario. Edits made from a saved scenario were also autosaved as a draft while the old active ID continued to take precedence.

The project hook now persists explicit scenario activation. Draft autosave retains the active ID only while the draft plan still matches that scenario; the first changed planning input detaches the draft and marks it for rerun.

**Regression evidence:** `projectStore.test.js` verifies matching drafts retain their baseline and changed drafts detach from it.

### ATOM-002: Stale Layers Could Be Saved With New Inputs

**Priority:** High  
**Affected area:** Scenario snapshots and recommendations  
**Target release:** Next release after 0.1.0

Changed RF inputs invalidated the visible results, but scenario assembly still copied the previous analysis artifacts. In addition, `overrides.artifacts ?? currentArtifacts` treated an intentional `null` as absent, so input-only recommendation scenarios inherited unrelated map layers.

Scenario assembly now stores no artifacts while a plan is dirty and uses property-presence semantics so explicit `null` remains authoritative.

**Regression evidence:** `scenarioSnapshot.test.js` covers dirty plans, explicit null overrides, and fresh completed analyses.

### ATOM-003: Project Copies Reused Scenario IDs

**Priority:** Medium  
**Affected area:** Project duplicate/import and result cache  
**Target release:** Next release after 0.1.0

Project duplication and import assigned a new project ID but retained every nested scenario ID. The five-scenario artifact cache keyed retained entries only by scenario ID, so copies could cause more than five artifacts to survive or make cache accounting ambiguous.

Copies now receive new project and scenario IDs, remap the active scenario, and cache entries use a composite project/scenario key.

**Regression evidence:** `projectStore.test.js` verifies imported and duplicated scenario IDs are renewed and active selection is remapped.

### ATOM-004: IndexedDB Could Hide the Workspace Backup

**Priority:** Medium  
**Affected area:** Browser persistence fallback  
**Target release:** Next release after 0.1.0

When IndexedDB opened successfully but contained no workspace record, loading immediately created a blank project and ignored a valid local-storage backup. Successful IndexedDB saves also left any prior backup stale.

Loading now consults the backup when IndexedDB is empty, and every successful save mirrors the normalized workspace to local storage.

**Regression evidence:** storage source resolution is covered by project-store unit tests; browser workflow coverage continues to exercise reload persistence.

### ATOM-005: Dataset Hash Key Order Caused False Staleness

**Priority:** Low  
**Affected area:** Dataset compatibility  
**Target release:** Next release after 0.1.0

Hash maps were compared with raw `JSON.stringify`, making equivalent maps unequal when their keys were inserted in a different order.

Compatibility now compares sorted key/value entries.

**Regression evidence:** `projectStore.test.js` verifies reversed hash-key order remains compatible while actual version or hash drift does not.

### ATOM-006: Recommendations Ignored Optimized Cell Azimuths

**Priority:** High  
**Affected area:** Candidate recommendation request assembly  
**Target release:** Next release after 0.1.0

After network optimization, interference and measurement analysis used each optimized cell azimuth, but candidate recommendation requests rebuilt every selected cell with the global baseline azimuth. Candidate scores could therefore describe a different network from the one visible on the map.

Recommendation requests now merge optimized azimuths by stable cell ID and retain the baseline only for cells without an optimization result.

**Regression evidence:** `requestPayloads.test.js` verifies optimized per-cell azimuths are sent in selected-cell order.

### ATOM-007: Applying Calibration Left Old RF Evidence Visible

**Priority:** High  
**Affected area:** Measurement validation and result invalidation  
**Target release:** Next release after 0.1.0

Applying a measurement-derived dB correction changed the model input directly without using the normal result-invalidation path. Existing rays, network scores, interference surfaces, recommendations, and residuals could remain visible even though they were calculated without the new correction.

Calibration application now cancels active RF work, clears incompatible evidence, marks the plan for rerun, and binds the profile to dataset hashes as well as dataset/model versions.

**Regression evidence:** `App.workflow.test.jsx` verifies a completed RF result and measurement result are both removed when calibration is applied.

### ATOM-008: Network Plans Could Collapse to One Shared Azimuth

**Priority:** High  
**Affected area:** Network evaluation, optimization, and recommendation application  
**Target release:** Next release after 0.1.0

The network plan stored a single global azimuth. Although optimized rays were drawn with per-cell values, later evaluation rebuilt every request from the global value. Applying a recommendation also changed that global value to the candidate azimuth, potentially steering all existing cells toward the candidate's direction.

The plan now carries a compact per-cell azimuth map. Network operations, ray rendering, interference, measurement validation, recommendations, projects, and applied candidate scenarios use it. Changing the global azimuth intentionally clears the map and establishes a new shared baseline.

**Regression evidence:** `requestPayloads.test.js` verifies a later network request preserves distinct selected-cell azimuths; existing recommendation tests verify optimized values take precedence.

### ATOM-009: Markdown Documentation Entry Point Described an Obsolete Product

**Priority:** Medium  
**Affected area:** Documentation source entry point  
**Target release:** Next release after 0.1.0

`docs/index.md` still described an earlier product, including an unsupported release number, generic container commands, and language that conflicted with the maintained static documentation and current model boundary.

The Markdown entry point now directs readers to the maintained documentation hub, current installation/API/model references, versioning process, and explicit planning-estimate limitation.

**Regression evidence:** `docs/validate_docs.py` verifies internal documentation targets after each documentation build.

### ATOM-010: Workspace Copies Could Diverge And Restore Stale State

**Priority:** Medium

**Affected area:** Browser persistence ordering and fallback storage

**Target release:** Next release after 0.3.0

Every commit launched an independent IndexedDB write and then duplicated the full workspace into local storage. Rapid edits could finish out of order, partial failures could leave divergent copies, and loading preferred IndexedDB even when the fallback contained a newer workspace.

Commits now receive monotonic persistence revisions and run through one save queue. IndexedDB is the normal authoritative store; local storage is written only when the primary commit fails. Loads compare both valid copies by revision and commit time, with project-content timestamps providing arbitration for legacy records.

**Regression evidence:** `projectStore.test.js` covers revision and legacy arbitration, primary-only writes, fallback recovery, dual-backend failure, and strict rapid-save ordering. `useProjectWorkspace.test.jsx` verifies same-tick edits build on the latest synchronous workspace.

### ATOM-011: Recommendation Details Were Duplicated In GeoJSON

**Priority:** Medium

**Affected area:** Recommendation responses and scenario persistence

**Target release:** Next release after 0.3.0

Each candidate was returned once in the ranked `recommendations` array and again as the complete `properties` object of its GeoJSON point. Network responses and saved scenario artifacts therefore stored the same scores, statistics, reasons, identifiers, and coordinates twice.

Recommendation details now remain canonical in the ranked array. GeoJSON features carry only point geometry, an empty properties object, and a standard top-level feature ID that references the canonical record. The frontend joins records only for rendering and compacts legacy full-property features whenever a scenario is saved.

**Regression evidence:** Go response tests ensure recommendation-only fields occur once in serialized output. Frontend helper and project-store tests cover rendering joins and legacy artifact compaction.

### ATOM-012: Runtime Policy Copies Could Drift

**Priority:** Medium

**Affected area:** Backend API, Core Lab adapter, and frontend request policy

**Target release:** Next release after 0.3.0

Core Lab scenario allowlists were independently maintained in three runtimes. RF defaults, technology thresholds, validation bounds, bandwidth choices, and structurally identical tower request types were also repeated across endpoint and frontend code. A change in one copy could silently create different accepted behavior or limits elsewhere.

One versioned JSON policy now generates self-contained Go and JavaScript bindings. All three runtime layers consume those generated values, CI rejects stale bindings, and measurement, interference, optimization, and recommendation requests share one Go tower input type.

**Regression evidence:** generator tests verify scenario propagation and stale-file detection; Go and frontend tests verify the shared technology boundaries and generated UI defaults.

### ATOM-013: Build Inputs And Container Artifacts Were Not Reproducible

**Priority:** Medium

**Affected area:** Container builds, Python tooling, and CI supply-chain controls

**Target release:** Next release after 0.3.0

Production and build stages selected container tags without immutable manifest digests, including a floating Alpine tag. Pipeline dependencies allowed broad ranges without a transitive lock or artifact hashes, while documentation CI installed an unconstrained PyYAML release. CI did not review dependency changes or inspect the resulting production image.

All container stages now combine readable version tags with immutable multi-architecture digests. Python direct inputs are exact, and generated transitive locks include SHA-256 hashes enforced during installation. Pull requests receive dependency review; CI emits SPDX SBOMs for both application images and rejects fixable high or critical image vulnerabilities; released images include SBOM and provenance attestations. Weekly dependency automation covers each manifest family.

**Regression evidence:** the supply-chain checker and unit tests reject floating base images, ranged direct dependencies, unhashed lock entries, and missing workflow controls. CI also installs both Python locks and exercises the production container build.

## Open Audit Queue

No Critical defect is currently confirmed. The next audit pass will focus on backend RF cancellation and timeout boundaries, calibration/dataset identity, map-layer lifecycle, report consistency, and release pipeline failure recovery. Items enter the resolved register only after they are reproduced and covered by a regression test.
