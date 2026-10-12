# Concept 7B — Formal Project/Scenario Domain Model and Local Repository Boundary

Status: implemented locally; no database or server persistence added.

Date: 2026-09-21 (Europe/Istanbul)

## Outcome

Concept 7B introduces a pure domain layer and a repository seam around the existing browser workspace. The browser remains local-first. `ProjectV2` is still the compatibility storage envelope, but it is no longer the conceptual model used to describe project, inventory, scenario, run, dataset, and report ownership.

The implementation is deliberately additive:

```text
React working state
  -> useProjectWorkspace
  -> LocalRepository
  -> ProjectV2 compatibility adapter
  -> projectStore
  -> IndexedDB workspace/current
  -> localStorage fallback
```

The IndexedDB database name, version, object store, key, serialized writes, revision arbitration, and fallback behavior are unchanged.

## Domain modules

The pure modules are under `frontend-react/src/domain/`:

- `project.js`: Project identity, metadata, references, and validation.
- `inventory.js`: flat Inventory, InventoryRevision, InventoryCell, sparse override resolution, and explicit clear markers.
- `scenario.js`: Scenario lineage, immutable ScenarioRevision, working drafts, request resolution, branching, and applying public optimization solutions.
- `run.js` and `runCapture.js`: typed Run envelope, statuses, public OptimizationSolution identity, optimization details, and local simulation/optimization capture helpers.
- `dataset.js`: immutable DatasetReference metadata.
- `report.js`: ReportDefinition and GeneratedReportArtifactReference.
- `serialization.js`: deterministic metadata serialization and UI-state exclusion; this does not replace atom-scenario-v1 canonicalization.
- `provenance.js`, `identifiers.js`, and `validation.js`: shared vocabulary, durable ids, structural validation, and immutable clones.

Repository boundary modules are under `frontend-react/src/repository/`:

- `projectCompatibility.js` maps both directions between ProjectV2 and the domain graph.
- `localRepository.js` implements the repository contract through the existing projectStore.
- `contract.js` records the persistence-agnostic operation set.
- `errors.js` normalizes persistence and schema failures.

## Model semantics

Inventory remains flat at cell/sector level. No Site entity was introduced. Scenario-level overrides are sparse: an absent field inherits, an explicit `{ "$clear": true }` removes an inherited field, and an ordinary `null` is not silently reinterpreted.

Saved ScenarioRevision objects are immutable clones. Working edits can be represented by `WorkingScenarioDraft`; saving creates a new revision with a parent pointer. The existing UI label “Save current” remains, but its domain meaning is now “create a ScenarioRevision.”

Durable ids are separate from deterministic fingerprints and compute/cache identities. In particular, `scenario_id`, `scenario_revision_id`, `run_id`, `artifact_id`, and `optimization_solution_id` are not `scenario_fingerprint`, `content_hash`, `optimization_run_id`, or the public optimizer solution id. The existing optimizer solution id is retained inside `OptimizationSolution`.

`applyOptimizationSolution` creates a child ScenarioRevision with `originating_run_id`, `originating_solution_id`, and sparse cell overrides. It never mutates InventoryRevision, the prior ScenarioRevision, or the Optimization Run. `branchScenario` creates a new Scenario identity with `parent_scenario_id` and a child revision.

## Compatibility and compaction

The adapter reads schema v1, schema v2, and the legacy single-project envelope through the existing projectStore normalization path. Domain identity and lineage metadata are additive compatibility metadata; full ProjectV2 plan fields remain available so current UI restoration and undo behavior continue to work.

Existing artifact compaction remains a cache-retention rule: only the newest five scenarios with artifacts retain derived artifacts, while input ScenarioRevision data is not compacted. Large ray/surface arrays and private optimizer evaluations are not copied into every revision or persisted as private optimization details.

## Request and field coverage

`ScenarioRevision` captures the current saved planning inputs: inventory cells and RF profiles, single/network selection, planning mode, per-cell azimuth overrides, AOI selection geometry, simulation settings, receiver assumptions, interference settings, optimization objectives/constraints/search configuration, dataset references, calibration profile, request inputs, and model metadata. The field-coverage artifact records the mapping to the current request builders. UI-only fields such as drawer state, map viewport, selected map object, visibility, loading, notices, errors, and cancellation are excluded from the domain input snapshot.

Request-equivalence tests cover canonical 2.6 GHz, canonical 28 GHz, interference, and optimization payloads by feeding the existing builders with resolved domain state. RF calculations remain in the Go backend; no propagation, antenna, link-budget, interference, optimizer, Pareto, terrain, or fingerprint code moved into the domain layer.

## Evidence

- [Pre-change baseline](concept-7b-pre-change-baseline.json)
- [Domain schema](concept-7b-domain-schema.json)
- [Field coverage](concept-7b-field-coverage.json)
- [Compatibility matrix](concept-7b-compatibility-matrix.json)
- [Repository contract](concept-7b-repository-contract.json)
- [Request equivalence](concept-7b-request-equivalence.json)
- [Test evidence](concept-7b-test-evidence.json)
- [Post-change comparison](concept-7b-post-change-comparison.json)

The next phase recommendation is [Durable Local Run History](concept-7b-next-phase.json), not a server repository.
