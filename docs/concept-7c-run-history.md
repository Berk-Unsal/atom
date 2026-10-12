# Concept 7C — Durable Local Run History

Concept 7C adds browser-local history for normal simulation and optimization actions. A run is a durable domain record, not a cache claim and not a replacement for a saved ScenarioRevision.

## Storage decision

Run history lives in a separate additive IndexedDB database:

- database: `atom-run-history`
- database version: `1`
- object store: `runs`
- object-store key: `run_id`
- physical value: `{ "storage_schema_version": 1, "run": <Run> }`

The existing `atom-planning-workspace` database, ProjectV2 schema, workspace compaction, workspace localStorage fallback, RF request builders, and server APIs are unchanged. History never falls back to localStorage and never enters exported project files. This keeps workspace migration risk and serialized workspace growth out of the normal planning path while allowing deterministic history queries.

## Domain and lifecycle

`Run` is authoritative. Supported run types are `simulation`, `optimization`, `validation`, `batch_experiment`, `diagnostic`, and `reference_evaluation`; the UI currently creates simulation and optimization records. The lifecycle is:

`queued → running → succeeded | failed | cancelled`

The queued and running records are written before the compute request where storage is available. Terminal input and identity fields are immutable; status, timestamps, warnings, error, compact summary, details, and artifact references are lifecycle fields. A browser restart converts queued/running records into a failed record with `error.code = run_interrupted`, which is distinct from user/request cancellation.

Persistence failure is non-fatal to compute. The UI reports a local-history warning and leaves the RF/optimizer result intact. Malformed records are skipped individually while valid records load; structured `run_invalid` issues are exposed to the history panel.

## Exact inputs and unsaved drafts

Every executed request is copied into `canonical_input_snapshot.request` before the API call. The snapshot also records request schema, source ScenarioRevision when one exists, draft-vs-source provenance, inventory revision, dataset references, receiver/interference assumptions, optimizer configuration, applied defaults, engine/model identity, and the RF contract. Unsaved drafts do not force a visible Save Scenario operation and are labelled `draft_execution: true`.

Scenario and input fingerprints are copied from existing scenario/API identity fields when available. Run IDs are local entity IDs and never enter compute request payloads.

## Retained result policy

Simulation history retains compact statistics, model identity, coverage-gap statistics, warnings, and provenance. It deliberately excludes GeoJSON, ray paths, per-ray samples, terrain grids, coverage surfaces, building overlays, and other map-sized arrays. Inspecting a historic simulation says “Detailed visualization was not retained”; it does not silently rerun.

Optimization history retains the public baseline, public Pareto solutions, durable solution IDs, recommended/selected IDs, priorities, objective availability, constraints, search policy, budgets, evaluated-count/cache summary, optimizer identity, RF contract, and optimization run identity. Private evaluation ledgers, raw search archives, private caches, and full RF/map outputs are excluded. Pareto IDs remain compute/API IDs; `optimization_solution_id` is a separate durable local identity.

## History UI

The Review stage contains a compact Run history tool. It supports newest-first project filtering, status/type/source display, identity and dataset inspection, failure/cancellation/interruption messages, public optimization solution inspection, explicit “Apply to new revision”, explicit “Run again as a new run”, individual deletion, and explicit clearing of unreferenced records. Historic results are never auto-recomputed.

Applying a historic public solution creates a new immutable ScenarioRevision with originating run and solution lineage. It does not mutate the old run, old revision, or inventory. Rerun is fail-closed when the recorded dataset is unavailable.

## Deletion and retention

There is no time-based or arbitrary automatic retention policy. Users may delete individual runs. Deletion is rejected for runs referenced by ScenarioRevision lineage or report metadata. Project deletion removes unreferenced runs for that project; scenario deletion preserves history. Bulk clear requires explicit confirmation and never removes referenced runs.

## Error and privacy contract

The local repository uses `run_not_found`, `run_invalid`, `run_persistence_failed`, `run_storage_unavailable`, `run_referenced`, `run_input_stale`, and `dataset_unavailable` alongside the existing repository codes. Durable records contain request/model/result metadata only; raw measurements, secrets, credentials, and private server search state are not persisted.

## Validation

The frontend suite covers the domain capture rules, separate IndexedDB envelope, queries, deterministic ordering, terminal immutability, malformed-record isolation, interrupted recovery, size/forbidden-field protection, deletion references, storage unavailability, and the empty/simulation/optimization/failure/cancellation/interruption/history UI states. See the Concept 7C JSON evidence files beside this document.

The next recommended phase is Concept 7D: report and artifact delivery UX built on top of these compact run records. It should remain local-first and should not introduce Postgres, PostGIS, object storage, authentication, or remote job orchestration.
