# Concept 7A — Project, Scenario & Persistence Architecture

Status: architecture audit complete; implementation intentionally deferred.

Date: 2026-09-21 (Europe/Istanbul)

Repository baseline: commit 92711dbcccae5a4de6e4d63c9f274082e890a50f

This document describes the current system as it exists in the working tree and proposes the smallest durable domain boundary for the next phase. It does not introduce PostgreSQL, PostGIS, object storage, a new IndexedDB schema, RF changes, optimizer changes, or API behavior changes.

## 1. Executive conclusion

A.T.O.M. is currently a local-first planning workspace. The browser owns a complete ProjectV2 workspace snapshot in IndexedDB, with a localStorage fallback. React state owns the active draft, inventory edits, live RF results, diagnostics, and UI state. The Go backend owns validated dataset packs and request-scoped computation, but it does not persist projects, scenarios, runs, reports, or generated artifacts.

The right next move is to formalize a domain model and repository boundary while retaining IndexedDB as the LocalRepository. A database migration is not the next release decision. PostgreSQL/PostGIS becomes justified later if sharing, cross-device sync, remote durable Runs, or relational spatial queries become product requirements. Large source and result files should use an object/file boundary rather than being embedded in project metadata.

The key model decision is to separate:

- Project metadata and ownership.
- Revisioned flat-cell Inventory.
- Immutable ScenarioRevision inputs.
- Immutable typed Run records.
- Recomputable or explicitly retained GeneratedArtifacts.
- Mutable ReportDefinition and immutable GeneratedReportArtifact.

The current backend atom-scenario-v1 fingerprint remains unchanged. A durable entity id, a ScenarioRevision id, and a Run id are separate from that content fingerprint.

## 2. Scope and invariance

This is an architecture-only audit. The audit covers the project/scenario lifecycle, frontend state ownership, IndexedDB and localStorage behavior, backend dataset/runtime boundaries, result retention, report generation, provenance, and a future database/object-storage boundary.

The following are deliberately unchanged:

- RF algorithms, propagation models, terrain behavior, and request DTOs.
- Optimizer search policy, budgets, scoring, Pareto archive behavior, and response shapes.
- The existing atom-scenario-v1 fingerprint algorithm.
- Dataset pack files, manifests, source hashes, and in-memory spatial indexes.
- IndexedDB as the current local-first persistence path.
- Concept 6 and earlier validation/terrain work.
- Existing dirty worktree changes that predate Concept 7A.

The only Concept 7A changes are the audit artifacts listed in the artifact manifest at the end of this document.

## 3. Current architecture

~~~mermaid
flowchart LR
  UI[React UI and App.jsx] --> Draft[Draft plan and live state]
  Draft --> Hook[useProjectWorkspace]
  Hook --> Store[projectStore]
  Store --> IDB[(IndexedDB workspace/current)]
  Store --> LS[(localStorage fallback)]
  Draft --> API[Stateless Go compute APIs]
  API --> Runtime[DatasetPack and in-memory indexes]
  Runtime --> Results[Simulation, gaps, interference, optimization, diagnostics]
  Results --> Live[React result state]
  Live --> Export[Live Markdown/PDF report or download]
  Files[Dataset files and manifest] --> Runtime
~~~

The implementation is intentionally pragmatic: App.jsx has broad state ownership, while useProjectWorkspace and projectStore own the durable local envelope. There is no React context/store/provider that represents a formal domain repository. There are no project/scenario/run/report persistence endpoints in the Go backend.

The browser and backend therefore have different authorities:

| Concern | Current authority | Current lifetime |
| --- | --- | --- |
| Active draft and saved workspace | Browser IndexedDB, localStorage fallback | Survives reload |
| Dataset source and manifest | Validated file pack and backend runtime | Files plus server process |
| RF and optimizer outputs | Go request response retained by React | Session; selected scenario artifacts may survive |
| Batch experiment jobs | In-memory Go manager | Until restart/eviction |
| UI selection and request cancellation | React runtime | Session |
| Report bytes | User download | Outside project unless saved manually |

## 4. Current Project and workspace behavior

ProjectV2 currently contains a project id, name, dataset reference, timestamps, active scenario id, draft, and scenario snapshots. The entire Workspace envelope is stored under one IndexedDB object store named workspace at key current. The project store normalizes schema v1 and v2 plus a legacy single-project envelope.

The local persistence path is:

1. App state changes.
2. App.jsx waits for its debounce interval and builds a draft plan.
3. useProjectWorkspace queues a serialized workspace save.
4. projectStore normalizes and compacts the workspace.
5. IndexedDB is written first.
6. localStorage is used only when the IndexedDB write fails.
7. Reads compare usable IndexedDB and fallback records by persistence revision and committed timestamp.

The current file size limit is 16 MiB per project import/export. Up to 100 scenarios are allowed per project, but only the newest five retain artifacts during compaction. That is a sensible local safety valve, not a durable evidence policy.

The current Save current operation appends a new scenario snapshot. It is not a revision update operation. Project deletion is guarded so at least one project remains. Scenario deletion has an undo path in the UI. There is no server-side entity version or distributed conflict protocol.

## 5. State ownership audit

The complete machine-readable inventory is in concept-7a-state-inventory.json. The most important ownership finding is that App.jsx currently owns four different kinds of state:

- Domain inputs: settings, selected cells, azimuths, optimization configuration, selection polygon, and project-local tower records.
- Derived compute state: simulation, gaps, interference, recommendations, optimization output, measurement analysis, and diagnostics.
- Presentation state: tool/drawer/result selection, visibility, notices, errors, and map selections.
- Runtime controls: request cancellation, active task, hydration, and dataset switching.

Only the first category is a candidate for ScenarioRevision. The second category belongs to Runs or optional artifacts. The third and fourth categories must stay outside domain persistence.

This split is important because a report currently reads live state directly. A report generated after a new request can accidentally describe a different result than the saved scenario unless it is later bound to explicit ScenarioRevision and Run identities.

## 6. Proposed Project boundary

Project is the durable planning workspace and ownership boundary. It should own:

- Stable project identity, name, description, and optional tags.
- Scenario lineage and the active working-scenario pointer.
- References to project-owned or reusable Inventory revisions.
- Dataset references used by its scenarios.
- Report definitions and links to generated reports.

Project should not own:

- Drawer state, viewport, map visibility, or request cancellation.
- Every RF ray, receiver sample, or internal optimizer evaluation.
- A mutable global copy of a dataset.

The current ProjectV2 is a compatible local container for this boundary. Concept 7B should introduce the pure type and repository interface first, then adapt ProjectV2 behind it.

## 7. Proposed Inventory boundary

Inventory is the reusable physical/network asset collection that seeds a scenario. The current implementation stores a flat array of cell/tower records containing an id, optional cell id, radio type, simulated flag, coordinates, RF profile, source, and editability. Manual placement, imports, duplication, movement, profile editing, deletion, and dataset loading all mutate that working array.

The future Inventory boundary should add:

- Inventory identity and revision.
- Stable source/external keys.
- Cell/Sector records and RF profiles.
- Import provenance and source-artifact references.
- Explicit revision lineage.
- Scenario-specific sparse overrides rather than copying all cells into each scenario.

### Site decision

Do not invent a Site entity now. The backend TowerStation has cell identity, radio type, simulation flag, and coordinates, but no authoritative stable site key. Proximity-based grouping would be a new domain assumption and could make scenario results non-reproducible. Keep the inventory flat at Cell/Sector level until a source-defined site key and grouping rule are available.

## 8. Proposed Scenario boundary

Scenario is the named planning hypothesis inside a Project. It selects an inventory revision and datasets, describes the area and demand context, carries RF and receiver assumptions, and owns the lineage of its immutable revisions and Runs.

A ScenarioRevision is the reproducible input snapshot. It contains:

- Inventory revision reference and sparse cell overrides.
- Enabled/disabled cells and selected network cells.
- Coordinates or azimuth overrides.
- Frequency, bandwidth, power, antenna, propagation, receiver, and interference inputs.
- AOI or selection geometry.
- Optimization objectives, constraints, weights, search policy, and budgets.
- Dataset ids, versions, and hashes.
- Canonical resolved inputs and fingerprints.
- Parent revision and change summary.

ScenarioRevision does not contain UI drawer state or unselected caches. It may contain a reference to a measurement dataset or demand layer, but not necessarily the raw bytes.

## 9. Dataset boundary

The current dataset is a validated file pack. data-pipeline/manifest.json provides id, version, CRS, bounds, source/license metadata, layer descriptions, quality information, and SHA-256 values. The backend loads the pack into DatasetPack and builds in-memory building and terrain access paths. The active dataset can be switched among installed packs, but that selection is not a durable server project record.

The future Dataset registry should record:

- Dataset id and immutable version.
- Manifest and per-file content hashes.
- CRS, bounds, layers, units, resolution, vertical datum, and acquisition epoch.
- Source, license, importer, validation status, and object/file references.
- Availability and compatibility metadata.

Dataset version is immutable. If a source file changes, it is a new version even when the human-readable dataset name is unchanged. A ScenarioRevision stores the exact version/hash reference it used. A currently active server pack cannot silently replace that reference.

## 10. Generic Run model

Run is the durable envelope for an execution, not a synonym for a particular RF endpoint. The typed run types are:

- simulation
- optimization
- validation
- batch_experiment
- diagnostic
- reference_evaluation

Every durable Run should record:

- Durable run_id UUID and run_type.
- Project, Scenario, and ScenarioRevision ids.
- scenario_fingerprint and a future input_fingerprint.
- Dataset references and content hashes.
- Engine version/commit, RF contract, model contract, and optimizer version when applicable.
- Canonical request/configuration snapshot.
- Queued/running/succeeded/failed/cancelled status and timestamps.
- Summary metrics, warnings, failure details, and artifact references.

The current optimization_run_id is useful as a compute/cache identity, but it is not a durable database primary key. A future Run can preserve it as an external or compute identity while using its own durable run_id.

### Typed Run details

An OptimizationRunDetails record should retain the baseline compact solution, public Pareto archive, effective weights, objective/constraint configuration, search policy, budgets, evaluated count, cache-hit summary, and selected solution. Internal RF evaluation ledgers remain private/recomputable unless a specific audit workflow requires them.

A ValidationRunDetails record should retain campaign summaries, model results, holdout/readiness information, assumptions, limitations, measurement dataset hash, and references to residual artifacts.

A BatchExperimentRun can retain its definition, parameter matrix, dataset reference, run summaries, cache provenance, and job terminal state. The current in-memory experiment manager is a runtime precursor, not durable evidence.

## 11. Derived results and cache policy

The durable distinction is not “result versus no result”; it is “evidence needed to explain or reproduce a decision versus a large value that can be regenerated.”

Durable by default when a Run is saved:

- The resolved input snapshot or a canonical request sufficient to rebuild it.
- Scenario, dataset, inventory, model, RF contract, and optimizer fingerprints.
- Compact summary metrics and constraint status.
- Public Pareto solutions and the selected/recommended solution.
- Validation summaries, assumptions, and readiness.
- References to required raw or generated artifacts.

Recomputable/cache by default:

- Full ray traces.
- Dense received-power samples and coverage surfaces.
- Building-entry/path-profile overlays.
- Per-cell explanation cache.
- Intermediate optimizer evaluations and private search ledgers.
- Backend terrain blocks and other runtime indexes.

Persist a large result when the user explicitly saves or exports it, when it is required by a validation/audit policy, or when a Run’s retention policy says it is part of the evidence. Store it by content hash and reference it from metadata.

## 12. Optimization result semantics

The existing optimizer response contains a compact baseline, optimized towers, public Pareto solutions, stats, policy/budget information, an optimization run identity, effective profiles, the RF contract, and a scenario fingerprint. That public result is enough to define a durable OptimizationRun summary and OptimizationSolution records.

The current UI updates networkAzimuths directly after optimization. The durable semantic should be:

1. Run optimization against an immutable ScenarioRevision.
2. Keep the OptimizationRun immutable.
3. Let the user inspect baseline and Pareto solutions.
4. “Apply as Scenario” creates a new ScenarioRevision, or a cloned Scenario when the user requests a branch.
5. Record originating_run_id and selected_solution_id on the new revision.
6. Leave baseline Inventory and prior ScenarioRevisions unchanged.

The safe default is branching. An explicit overwrite action can be considered later, but it must create a new revision and preserve the prior lineage even if the UI presents it as “replace current plan.”

## 13. Precedence and mutability

The future resolved-cell precedence is:

1. A field explicitly set in ScenarioCellOverride.
2. The referenced InventoryCell value.
3. A Dataset or application default.

Absence means inherit. Clearing a value needs an explicit clear marker so that “unset” is not confused with “inherit.” The server’s resolved request and applied defaults should be recorded with the Run.

| Change | Domain effect |
| --- | --- |
| Drawer, map viewport, tab, layer visibility | UI-only; no ScenarioRevision |
| Rename project or scenario | Mutable metadata |
| Change azimuth, power, frequency, beam, model, receiver, cell enablement, geometry, or dataset | New working ScenarioRevision |
| Change optimizer weights only | New revision if it changes the requested ranking contract; may locally re-rank an existing public frontier without RF rerun when semantics permit |
| Import/edit/delete inventory cell | New Inventory revision or explicit scenario override |
| Apply an optimizer solution | New ScenarioRevision with Run/solution lineage |
| Start or finish a computation | New immutable Run; no mutation to prior input revision |
| Generate a report | New immutable GeneratedReportArtifact |

The current UI’s “Save current” append behavior can remain the compatibility behavior while the domain model makes the append/revision distinction explicit.

## 14. Fingerprints and identity

These identities have different jobs:

- Project id: durable workspace identity.
- Scenario id: named lineage identity.
- ScenarioRevision id: immutable saved input identity.
- Dataset id/version: immutable source identity.
- Run id: durable execution identity.
- Artifact id/content hash: immutable bytes identity.
- atom-scenario-v1 fingerprint: current deterministic content/cache identity.
- Future input_fingerprint: canonical execution-input identity including dataset/inventory/engine contracts.

Concept 7A does not change the existing atom-scenario-v1 algorithm. It also does not retroactively make optimization_run_id a durable Run id. A future input fingerprint can wrap or extend the existing scenario fingerprint with dataset hashes, inventory revision, RF contract, engine commit, and optimizer contract while preserving the current value for compatibility and cache behavior.

Timestamps, request paths, runtime pointers, map viewport, and presentation state should not enter deterministic fingerprints unless they are explicitly part of the computation request.

## 15. Reproducibility contract

An analysis is reproducible only when the system can reconstruct:

- Exact ScenarioRevision or canonical resolved inputs.
- Exact Inventory revision and sparse override map.
- Dataset ids, versions, manifests, and file hashes.
- RF contract, propagation/model version, engine commit, and applied defaults.
- Objective/constraint/search policy and optimizer version.
- Input and output fingerprints.
- Required measurement/source/evidence artifact references.
- Environment assumptions, warnings, and known limitations.

The current saved scenario can preserve useful plan and selected artifacts, but it does not yet meet this full contract. In particular, some diagnostics are React-only, raw measurement samples/provenance are not included in the current snapshot, and backend jobs disappear on restart.

## 16. Provenance and evidence

Use a small application-level vocabulary for field and artifact provenance:

user_configured, imported, measured, derived, assumed, default, generated, and validated.

The vocabulary supplements, rather than replaces, domain-specific RF evidence. Measurement evaluation should retain the source file/content hash, sample schema, campaign metadata, and model/dataset references. Dataset layers should retain source, license, confidence, acquisition epoch, and resolution metadata from the manifest. Derived values should identify their producing Run and input fingerprints.

## 17. Report lifecycle

The current reportExport.js builds a report from live state and downloads Markdown or opens a print window. The report id is timestamp-based and does not guarantee a stable scenario/run binding. That is appropriate for a live export but not for an audit artifact.

The future split is:

- ReportDefinition: mutable selection of sections, presentation options, scenario revision, and Runs.
- GeneratedReportArtifact: immutable Markdown/PDF/HTML bytes with report schema version, generator version, content hash, project/scenario/revision ids, Run ids, and artifact reference.

Regenerating a report creates a new GeneratedReportArtifact. It never mutates an earlier report. Reports should state when a result is recomputed, cached, or unavailable because its artifact was compacted.

## 18. Storage boundary

### PostgreSQL metadata

Use relational metadata for projects, scenarios, immutable revisions, inventory revisions, dataset registry records, Run envelopes, compact optimization solutions, validation summaries, report definitions, generated report metadata, and artifact references.

### PostGIS, only where it earns its cost

Use optional geometry columns for project AOIs, inventory cell points, verified Site geometries in the future, demand/user layers, and measurement points when relational spatial predicates or joins are needed. PostGIS is not the RF engine and should not become a row-per-ray store.

### Object/file storage

Use content-addressed files for the approximately 111 MB building source, DEM/DSM/clutter, raw measurement files, coverage surfaces, large GeoJSON/GeoTIFF/CSV exports, rendered reports, and large ray traces. A local filesystem, MinIO, or S3-compatible implementation can sit behind one ArtifactStore interface. Database metadata retains media type, byte size, hash, URI, producer Run, and retention class.

The smaller 451-cell tower source is easy to keep in relational metadata when it becomes a reusable Inventory. The current file-pack distribution remains valid for the backend runtime.

## 19. Conceptual schema

~~~mermaid
erDiagram
  PROJECT ||--o{ SCENARIO : contains
  SCENARIO ||--o{ SCENARIO_REVISION : versions
  INVENTORY ||--o{ INVENTORY_REVISION : versions
  INVENTORY_REVISION ||--o{ INVENTORY_CELL : contains
  SCENARIO_REVISION ||--o{ SCENARIO_OVERRIDE : overrides
  DATASET ||--o{ SCENARIO_REVISION : referenced_by
  SCENARIO_REVISION ||--o{ RUN : executes
  RUN ||--o{ OPTIMIZATION_SOLUTION : exposes
  RUN ||--o{ RUN_ARTIFACT : produces
  ARTIFACT ||--o{ RUN_ARTIFACT : referenced
  SCENARIO_REVISION ||--o{ REPORT : documented_by
  REPORT ||--|| ARTIFACT : materializes
~~~

The complete logical entity/field draft is in concept-7a-schema-draft.json. It intentionally has no Site table and no row-per-ray table.

## 20. API boundary sketch

The future repository APIs can be layered without changing compute DTOs:

~~~mermaid
flowchart TB
  Client[Local or server repository] --> Projects[/projects]
  Projects --> Scenarios[/projects/{project_id}/scenarios]
  Scenarios --> Revisions[/scenarios/{scenario_id}/revisions]
  Revisions --> Runs[/scenario-revisions/{revision_id}/runs]
  Runs --> Run[/runs/{run_id}]
  Projects --> Inventory[/projects/{project_id}/inventories]
  Projects --> Datasets[/datasets]
  Projects --> Reports[/projects/{project_id}/reports]
  Run --> Compute[Existing stateless /api/simulate and /api/optimize-network]
  Run --> Artifacts[ArtifactStore]
~~~

The current compute routes remain stateless: the repository resolves a ScenarioRevision into the existing request input, invokes the Go API, and records a Run envelope around the response when persistence is requested. This keeps RF execution decoupled from database storage.

## 21. Save and branch semantics

The recommended semantics are:

- Autosave: update the local working draft; it is not a new immutable ScenarioRevision.
- Save Scenario: create a named immutable ScenarioRevision under the current Scenario, retaining the current append behavior as a compatible UI path.
- Duplicate/Branch Scenario: create a new Scenario lineage from a selected revision.
- Apply as Scenario: create a new revision/branch from an OptimizationSolution.
- Rename: mutate metadata only.
- Run: append an immutable Run tied to the exact revision.
- Report: append an immutable GeneratedReportArtifact tied to explicit revision and Run ids.

A single-user local mode can use a last-write working draft. The moment a saved revision or Run exists, it must not be overwritten by later editing.

## 22. Deletion and retention

Deletion must follow references:

- Project: archive first; hard delete only after dependent scenarios, Runs, reports, and artifacts are handled.
- Scenario: archive/tombstone; keep revisions referenced by Runs or reports.
- ScenarioRevision: immutable; remove only when no evidence references it.
- Inventory revision: immutable; retain while referenced.
- Dataset version: retain while referenced; a missing pack makes a scenario stale rather than silently substituting another version.
- Run: keep terminal failed/cancelled status under retention policy.
- Artifact: garbage collect only when unreferenced and past retention.

The current nested IndexedDB envelope has no orphan rows, so local logical deletion is sufficient today. A future synchronized repository needs tombstones or an equivalent operation log so a deleted entity does not reappear from another device.

## 23. Conflict and failure model

Current localStorage/IndexedDB revision ordering is a fallback-recovery rule, not a distributed concurrency protocol. Future sync should add entity revision, client/device identity, an outbox operation, and explicit conflict status.

Expected terminal states and handling:

- Dataset unavailable: preserve the ScenarioRevision and mark it stale; do not rewrite its dataset reference.
- Fingerprint mismatch: refuse silent cache reuse and require a new Run.
- Compute failure: retain a failed Run envelope with error and input provenance.
- Compute cancellation: retain cancellation status if the user requested durable execution history.
- Partial artifact upload: mark the artifact unavailable/incomplete; never present it as valid evidence.
- Concurrent scenario edits: preserve both immutable revisions and ask the user to merge/choose.
- Project deletion with live dependencies: archive or require an explicit cascade policy.

## 24. IndexedDB decision

IndexedDB remains sufficient for the next release because the current product is a single-user local-first workspace and the existing adapter has schema normalization, fallback recovery, validation, compaction, and serialized writes.

It should not be promoted to a future shared source of truth because:

- It stores the whole workspace as one opaque record.
- Its revision is process-local.
- It has no server/device identity or conflict protocol.
- It mixes domain inputs with cached derived artifacts.
- It is not appropriate for large datasets or durable remote Runs.

Concept 7B should hide the current store behind a LocalRepository, not remove it. A later server adapter can implement the same repository interface without forcing the UI to know whether the source is IndexedDB or PostgreSQL.

## 25. Migration path

The migration is deliberately staged:

1. Audit and freeze invariants — completed by Concept 7A.
2. Formal local domain model — next phase; pure types, validation, canonical serialization, LocalRepository adapter.
3. Repository and Run boundary — durable local Run metadata and explicit solution-to-scenario branching.
4. Optional PostgreSQL/PostGIS metadata store — only after ownership, auth, conflict, backup, and query requirements are accepted.
5. Object/file ArtifactStore — content-addressed datasets, measurements, surfaces, rays, and reports.
6. Sharing and sync — workspace ownership, cross-device outbox, conflict UI, job recovery, and retention.

No physical IndexedDB migration, SQL migration, or database deployment is part of Concept 7A.

## 26. Concept 7B selection

Selected next phase: Concept 7B — Formal Project/Scenario Domain Model and Repository Boundary (local-first).

Acceptance criteria:

- Existing schema v1/v2 and legacy imports still load.
- IndexedDB remains the default local persistence path with localStorage fallback.
- A ScenarioRevision serializes every RF-affecting input needed to reconstruct current requests.
- UI-only state is excluded from ScenarioRevision.
- Run supports simulation, optimization, validation, batch experiment, and diagnostic types.
- Applying an OptimizationSolution creates a new scenario/revision with originating_run_id.
- Reports can reference explicit scenario/revision/run identities without changing current downloads.
- No RF, optimizer, dataset, API, or Concept 6 behavior changes.

## 27. Artifact manifest

Concept 7A adds these files:

- concept-7a-pre-change-baseline.json
- concept-7a-persistence-architecture.md
- concept-7a-state-inventory.json
- concept-7a-indexeddb-audit.json
- concept-7a-domain-model.json
- concept-7a-storage-classification.json
- concept-7a-schema-draft.json
- concept-7a-migration-plan.json
- concept-7a-next-phase.json
- concept-7a-post-change-comparison.json

No production source file, database migration, dataset, or generated reference page is added by this audit.

## 28. Evidence and source map

The audit is grounded in:

- frontend-react/src/utils/projectStore.js — IndexedDB/localStorage, schema normalization, validation, compaction, and dataset compatibility.
- frontend-react/src/hooks/useProjectWorkspace.js — workspace/project/scenario operations and persistence status.
- frontend-react/src/App.jsx — state declarations, restoration, autosave, inventory mutation, dataset switching, run lifecycle, and live result ownership.
- frontend-react/src/utils/reportExport.js — current live report construction and download behavior.
- frontend-react/src/utils/appWorkspace.js — comparison snapshots and derived report inputs.
- backend-go/raytracer/scenario_fingerprint.go — current atom-scenario-v1 deterministic fingerprint behavior.
- backend-go/raytracer/static_simulation.go — current simulation, network optimization, public solution, and RF contract response shapes.
- backend-go/raytracer/dataset_pack.go — manifest/file-pack loader and runtime boundary.
- backend-go/experiment_jobs.go — current in-memory batch experiment job/cache behavior.
- data-pipeline/manifest.json — dataset identity, hashes, CRS, source, layer, and QA metadata.

## 29. Thirty-two audit outcomes

| # | Outcome |
| ---: | --- |
| 1 | The baseline commit, version, dataset evidence, and dirty-worktree attribution are recorded. |
| 2 | Pre-existing Concept 5D/6A/6A1/6A2 work is preserved and not attributed to Concept 7A. |
| 3 | The current product is confirmed as a local-first browser workspace. |
| 4 | App.jsx is confirmed as the broad owner of domain, derived, UI, and runtime state. |
| 5 | useProjectWorkspace is confirmed as the project/scenario persistence coordinator. |
| 6 | IndexedDB is confirmed as one workspace/current record at schema version 2. |
| 7 | localStorage is confirmed as a failure fallback and revision-based recovery source. |
| 8 | Project is defined as metadata, ownership, lineage, and reference boundary. |
| 9 | Inventory is defined as reusable flat cells/sectors with revisioned provenance. |
| 10 | Site is explicitly deferred because no authoritative site grouping key exists. |
| 11 | Scenario is defined as a named planning hypothesis and lineage container. |
| 12 | ScenarioRevision is defined as the immutable resolved input snapshot. |
| 13 | Dataset is defined as an immutable version/hash/provenance record over validated files. |
| 14 | Run is defined as a generic immutable execution envelope. |
| 15 | Simulation, optimization, validation, batch, and diagnostic runs receive typed detail boundaries. |
| 16 | Public optimization frontier data is separated from private intermediate evaluation state. |
| 17 | Large RF and geospatial outputs are classified as optional generated artifacts or recomputable caches. |
| 18 | Measurement samples and provenance are identified as evidence that needs an explicit artifact policy. |
| 19 | Live report generation is separated conceptually into ReportDefinition and GeneratedReportArtifact. |
| 20 | Durable entity ids are separated from atom-scenario-v1 and future input fingerprints. |
| 21 | Cell/input precedence is defined as scenario override, inventory cell, then dataset/default. |
| 22 | RF-affecting edits are defined as new revisions; UI-only edits remain ephemeral. |
| 23 | Autosave, Save Scenario, Duplicate/Branch, Run, and Report semantics are specified. |
| 24 | Apply optimized solution is defined as a new scenario/revision with run lineage. |
| 25 | Reproducibility requirements include exact inputs, datasets, inventory, contracts, versions, and artifacts. |
| 26 | PostgreSQL metadata and optional PostGIS responsibilities are classified separately from RF runtime. |
| 27 | Object/file storage is reserved for large source, measurement, surface, ray, and report artifacts. |
| 28 | A conceptual schema is drafted without SQL or production migrations. |
| 29 | Deletion, retention, stale dataset, failure, and conflict behavior are specified. |
| 30 | A staged migration path preserves local-first compatibility and reversibility. |
| 31 | Concept 7B is selected as the formal local domain model/repository boundary phase. |
| 32 | Production behavior is invariant: no RF, optimizer, API, dataset, IndexedDB removal, or database implementation change. |

## 30. Validation

The artifact validation commands are:

~~~sh
for file in docs/concept-7a-*.json; do
  python3 -m json.tool "$file" >/dev/null || exit 1
done
python3 docs/validate_docs.py
python3 scripts/versioning.py check
git diff --check
~~~

Because this audit makes no production change, the full frontend/backend test suites are not required to establish the architecture result. They remain appropriate when Concept 7B introduces runtime adapters or changes behavior.

## 31. Risks carried forward

- A full workspace blob remains the local compatibility format until Concept 7B introduces the repository adapter.
- Current saved results are not automatically audit-grade evidence because some provenance and raw inputs are absent.
- The backend has no durable Run/job recovery until a later repository/server phase.
- Large datasets and RF artifacts still rely on local files, in-memory indexes, or user downloads.
- Site-level modeling remains intentionally unresolved.

These are explicit boundaries, not hidden behavior changes.

## 32. Final decision

Keep the current IndexedDB/localStorage local-first implementation for the immediate next release. Implement Concept 7B as a pure domain/repository seam first. Add PostgreSQL/PostGIS only when collaboration, remote durable runs, or query requirements justify the operational boundary. Add object storage when large datasets or generated evidence need durable retention. Preserve current RF and optimizer behavior throughout.
