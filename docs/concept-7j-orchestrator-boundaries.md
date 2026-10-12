# Concept 7J — Orchestrator boundaries

## Outcome

Concept 7J moved two complete, testable workflow lifecycles out of `App.jsx`:

- `useRunExecution` owns durable Run capture/persistence coordination, its non-fatal history warning, the association between a successful live Run and the displayed result, and selected Pareto metadata updates.
- `useReportWorkflow` owns current and historical report coordination, source resolution, deferred renderer/artifact/download loading, artifact actions, and report warnings.

`App.jsx` remains the composition root. Its remaining work is still cross-feature: workspace hydration and transition guards, RF request/API workflows, simulation and optimization result interpretation, map/result presentation, invalidation, apply/rerun transactions, and navigation. The purpose of the change is explicit ownership; line counts are descriptive evidence only.

## Ownership decisions

| Concern | Owner | Boundary |
| --- | --- | --- |
| Durable Project, Scenario, Version storage and domain operations | Existing `useProjectWorkspace` | App sequences hydration, draft restore, transition guards, and navigation around it. No pass-through workspace wrapper was added. |
| Queued/running/final Run records and successful current Run association | `useRunExecution` | Uses existing Run constructors, transitions, capture functions, and `useRunHistory`. API requests and RF/result interpretation remain in App. |
| Request cancellation and request identity | Existing `useRequestCoordinator` | App selects channels and asks for cancellation. AbortControllers remain in refs and are not durable state. |
| Result freshness and rendered-result invalidation | App plus existing `buildResultContext` / `resolveRunFreshness` | One App invalidation action clears dependent outputs and requests, marks the plan dirty, and retains Run identity for stale lineage. Domain freshness rules remain authoritative. |
| Report definition/render/artifact workflow | `useReportWorkflow` | Coordinates existing domain, workspace, artifact-store, and deferred renderer APIs. It does not own the report renderer or artifact schema. |
| Artifact persistence implementation | Existing `useReportArtifacts` / `LocalArtifactStore` | The hook exposes cleanup errors so App can stop a Project deletion transaction when cleanup fails. |
| Project/Scenario, RF, Inventory, result, map and cross-panel state | App composition root | These values cross planning, execution, lineage, maps and navigation; moving them into a presentation-only hook would split ownership. |
| Specialized panel load/error and local research state | `LazyFeatureBoundary` and each lazy feature | Feature imports remain deferred until activation; feature-local research inputs stay local. |

The new hooks return named `state` and `actions` groups. Their APIs are small and named for the lifecycle they own; neither renders UI, imports map components, nor hides domain semantics.

## Deliberately rejected boundaries

- **A second workspace controller:** `useProjectWorkspace` already owns durable storage and Project/Scenario/Version operations. App's remaining hydration and guard sequence is a real cross-feature transaction; a wrapper forwarding the existing methods would add indirection.
- **A map-state hook:** App map state includes persisted plan inputs, result associations, RF invalidation, selection, focus and cross-feature inspection. Those values do not form an independent presentation lifecycle.
- **A separate result controller:** freshness derives from App's current outputs and workspace lineage. Splitting it would either pass through App setters or duplicate Concept 7G identity rules.
- **A generic execution API:** simulation, optimization, network evaluation and historical replay have different request and result semantics. Only Run record lifecycle primitives are shared.
- **A global store, React Context, event bus or service layer:** the repository and existing focused hooks provide the needed boundaries; no correctness problem required another state library.

## Workflow behavior retained

### Hydration and dataset changes

Application metadata and the dataset catalog hydrate for the active dataset revision. Tower loading sets `hydratedDatasetRevision`; workspace repository loading can proceed independently. App restores the Project's active Scenario or draft only after the workspace is loaded, a Project exists, towers are available, and the dataset revisions match. A per-Project ref prevents duplicate restoration. Draft persistence waits for the same guards and is debounced.

A dataset switch first asks the API to validate/load the requested dataset. On success, App resets the restoration guard, cancels RF and dependent analysis requests, clears rendered analysis and dataset-bound in-memory Inventory/map state, marks the plan dirty, and advances `datasetRevision`. Existing Project scenarios remain bound to their recorded dataset. The current Run identity is retained as source evidence; the dirty plan makes its result stale until valid work is run again. Dataset switching requires a live backend and is covered by backend validation rather than this local E2E run.

### Scenario and Version navigation

Opening another saved Scenario is blocked while an unsaved working draft would be discarded. When allowed, App clears the current-result association/focused Run, activates the Scenario through `useProjectWorkspace`, restores its plan and stored artifacts, then updates focus/navigation.

Opening a Run's exact source Version within the active Scenario is inspection: it focuses that Version without replacing the current active Version or draft. Opening a different Scenario uses the guarded Scenario transition. “Continue from Version” is a separate mutation that asks the domain/repository operation to create a working draft, restores that draft, and marks it as requiring a rerun. Branch and duplicate remain existing domain transactions.

### Simulation and optimization

App continues to build the same requests, enforce existing guards, call the same endpoints, interpret responses, and write the distinct result payloads. It asks `useRunExecution` to capture queued/running records and then the appropriate typed final Run. Successful ordinary simulation and optimization Runs become the current result association. A failed or cancelled Run is retained with its existing lifecycle semantics and does not replace that association. If Run History persistence fails, the completed RF result remains usable and the hook exposes a warning.

Optimization retains its own optimizer contract, baseline, public Pareto solutions, recommendation, objective/constraint state and selected solution identity. Selecting a Pareto solution updates lifecycle metadata on the retained optimization Run; it does not re-run RF or change recommendation membership. Network evaluation and historical replay remain separate workflows.

### Invalidation and freshness

`invalidatePlanResults` remains the single App invalidation contract. RF plan and Inventory edits, relevant network-selection changes, applied calibration, and changed optimization constraints cancel dependent requests, clear rendered result artifacts, mark the plan dirty, and keep the associated Run so Concept 7G can describe its source as stale. Dataset changes clear the rendered outputs and mark the plan dirty while preserving the old Run identity. Opening another saved Scenario and Project selection/creation transitions clear the association when accepted. Continue/branch/apply transitions retain source identity as stale lineage while restoring a destination that requires a rerun.

Disclosure changes, tool/panel navigation, lazy loading, report inspection, map viewport/legend changes, and Pareto selection do not invalidate results. Existing App workflow tests cover disclosure stability, RF-edit invalidation, and Pareto selection. The complete event-to-contract/test mapping is in [concept-7j-invalidation-matrix.json](concept-7j-invalidation-matrix.json).

### Historical rerun and apply

Historical rerun remains in App because it replays an exact retained request and has its own dataset-availability checks and result routing. It creates a new Run with a new identity, persists queued/running/final lifecycle records through `useRunExecution.persistRun`, and leaves the current working plan and current-result association alone. It does not reuse the old `run_id` or call the ordinary current-plan request builders.

Current and historical optimization apply continue to route through the authoritative App transaction and existing `useProjectWorkspace.applyHistoricalOptimization` / domain `applyOptimizationSolution` operations. The transaction validates source Run, dataset and solution identity, applies the selected configuration as a Version or branch, restores the destination snapshot, and marks it as requiring a fresh Run.

### Reports and artifacts

Current reports use a snapshot of current App inputs. A clean saved Version binds to compatible successful Runs; a dirty working draft uses the live-compatibility source path. A historical report resolves the Run's exact Scenario Version and uses that stored Run as evidence; missing source lineage prevents generation rather than silently recomputing.

The workflow creates the existing ReportDefinition and coordinates artifact generation, retention, download/open, regeneration and deletion. Report renderers and artifact helpers load only after a user action. A failed local retention attempt leaves a current generated output available for download/open and shows a warning. Report semantics, source resolution rules, artifact metadata schema and integrity behavior stay in their existing domain/repository layers.

## Dependency and lazy-loading direction

```text
App composition
  ├── orchestration hooks ──> domain / existing repository hooks / deferred import actions
  ├── workspace transactions ──> useProjectWorkspace / domain operations
  ├── explicit props and actions ──> feature UI
  └── user activation ──> LazyFeatureBoundary ──> lazy feature implementation

useReportWorkflow user action ──dynamic import──> report renderer / artifact / download helpers
```

Domain modules do not depend on React or UI; repositories do not depend on App or feature UI; lazy features do not import App or another feature's private state. A local relative-import scan of 143 source modules found no cycles. Production output contains 12 JavaScript chunks. In five fresh Chromium contexts, startup requested only the application entry; specialized Research, Diagnostics, Experiments, Core Lab, Run History, and Report feature chunks were absent until their user action. The existing activation E2E confirms those chunks load on demand.

The Propagation first-entry settings snapshot remains in its existing App activation effect. It still captures settings at the first active-tool entry and does not track later edits while the feature is open; the 7I cold-mount default semantics remain intact.

## Measurements and evidence

| Measure | Before 7J | After 7J |
| --- | ---: | ---: |
| `App.jsx` lines | 5,493 | 5,216 |
| `App.jsx` import declarations | 43 | 44 |
| App-root states / refs / effects / memos / callbacks | 84 / 7 / 15 / 29 / 102 | 81 / 6 / 15 / 28 / 90 |
| `useRunExecution.js` | — | 143 lines |
| `useReportWorkflow.js` | — | 270 lines |
| Initial JavaScript, raw | 769,861 B | 771,408 B |
| Initial JavaScript, gzip level 9 | 217,661 B | 218,425 B |
| JavaScript chunks | 12 | 12 |

The entry delta versus 7I is +1,547 raw bytes and +764 gzip bytes. These are descriptive build measurements, not an optimization claim. The feature split remains intact and no lazy module entered the cold request graph.

The focused golden fixtures and comparison tests are [concept-7j-run-snapshot-equivalence.json](concept-7j-run-snapshot-equivalence.json) and [concept-7j-report-equivalence.json](concept-7j-report-equivalence.json). Exact frontend, responsive E2E, lint, build, backend, documentation, version, and diff-check results are recorded in [concept-7j-test-evidence.json](concept-7j-test-evidence.json).

## Remaining debt and next step

App still coordinates several broad RF and workspace workflows, but the inventory found no third extraction with a stable owner that would not either wrap existing domain/repository APIs or duplicate cross-feature state. Keep the remaining integration in App until a concrete product change identifies a cohesive lifecycle. No further Concept 7 decomposition is justified immediately; return to feature/scientific work (Concept 7K is not started).
