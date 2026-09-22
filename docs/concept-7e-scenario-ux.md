# Concept 7E — Scenario, Version, and Branch UX

Concept 7E turns the existing local planning workspace into a legible Scenario and Version product without changing RF computation. A Project remains the local workspace boundary. A Scenario is a named planning lineage. A Version is an immutable input state inside that lineage. Runs and Reports point back to exact Versions when they are saved; a working draft remains explicitly unsaved.

The required audit artifacts are [the pre-change baseline](concept-7e-pre-change-baseline.json), [the terminology map](concept-7e-terminology.json), [the implementation source map](concept-7e-source-map.json), [the post-change comparison](concept-7e-post-change-comparison.json), and [the test evidence](concept-7e-test-evidence.json).

## Product vocabulary

| User term | Durable meaning | Internal identity |
| --- | --- | --- |
| Project | Local workspace containing planning lineages and evidence | `ProjectV2`, `project_id` |
| Scenario | Named lineage that can have Versions and child branches | `Scenario`, `scenario_id` |
| Version | Immutable input state; never edited in place | `ScenarioRevision`, `scenario_revision_id`, `revision` |
| Branch scenario | New Scenario whose first Version records its parent | `branchScenario`, `parent_scenario_id` |
| Save version | Explicitly persist the current working plan as a new Version | `saveScenarioVersion`, `createScenarioRevision` |
| Run | Durable execution record | `Run`, `run_id` |
| Report | Report metadata and optional retained evidence bytes | `ReportDefinition`, `GeneratedReportArtifact` |

Internal names remain stable for compatibility and storage. User-facing surfaces use Version, Branch scenario, Save version, Run, and Report.

## UX workflow

The Setup tool contains the Scenario workspace. It is intentionally compact so the map remains the primary planning surface.

### Scenario switcher

Each Scenario row shows its name, latest Version, last-updated time, branch parent when present, and whether the active Scenario has Unsaved changes. Switching restores the selected Scenario's current input snapshot. It does not call an RF endpoint, recompute a map, or mutate any Version.

The project menu remains a quick-access surface and now says Scenarios / Versions. The detailed history surface is the Scenario workspace.

### Draft and save semantics

Autosave continues to persist the working draft so browser refresh is recoverable. Autosave never creates a Version. When the working plan differs from the active Version, the Scenario workspace says Unsaved changes and Save version is the explicit durable action. When no named Scenario exists, the same action creates the first Scenario and Version.

Saving a Version records:

```text
Scenario
  current_revision_id → new Version
  revision_ids        → previous Versions + new Version

Version
  revision = previous revision + 1
  parent_revision_id = previous current Version
  change_summary     = optional user text
  input state        = RF-affecting, dataset, cell, optimization, interference, and AOI inputs
```

The existing ProjectV2 compatibility projection stores the Version records under `snapshot.domain.revisions`. The adapter remains additive: old flat snapshots are reconstructed as Version 1 when no history is present.

### Version history and inspection

The Version list shows Version number, timestamp, change summary, provenance, associated Run count, and associated Report count. Selecting a Version shows only metadata and input state. Report bytes are not hydrated.

The pure `buildScenarioRevisionDiff(before, after)` model reports changes in these sections:

- cells and enablement, including per-cell overrides and selected cells;
- RF settings and propagation model;
- receiver assumptions;
- interference settings;
- objectives, constraints, and optimizer configuration;
- dataset references and inventory Version;
- AOI/selection geometry and planning mode.

The selected Version is compared with its parent Version when possible. A first Version is shown as the initial input state. This is an input diff, not an RF result diff.

### Continue and branch

`Continue from Version` copies the selected immutable input state into the Project draft, marks it as requiring a new Run, and retains source Scenario/Version IDs on the draft. It does not change the selected Version.

`Branch from here` asks for a name and creates a new Scenario whose first Version records both `parent_scenario_id` and `parent_revision_id`. The parent remains untouched. The branch becomes active, but RF computation is still explicit.

`Duplicate scenario` copies the latest Version into a new independent Scenario. It deliberately clears parent Scenario and parent Version lineage. This is the user-facing distinction:

```text
Branch scenario  = related lineage; parent remains discoverable
Duplicate        = independent lineage; content starts from the same input
```

### Overview

The active Scenario overview shows name, description, Version count, parent label, last Run, last optimization, last Report, dataset, RF mode, and propagation/profile context. Renaming changes Scenario metadata only; it does not create a new Version.

## Optimization lineage

Run History and the current Pareto inspector expose two explicit actions:

- **Apply as new Version**: append a Version to the source Scenario using the selected historical Version as the input parent;
- **Branch with solution**: create a related Scenario from the historical Version and append the solution as its second Version.

The source Version, Run, and optimization solution remain immutable. The resulting Version records `originating_run_id` and `originating_solution_id`. Both actions invalidate cached RF visualization and require a fresh explicit Run.

Applying a historical solution uses the Run's `scenario_revision_id` when available. It never silently substitutes the currently selected Version. If the recorded dataset is unavailable, application is blocked.

## Run History and Reports

Run History rows display friendly Scenario and Version labels. Run details show Scenario, Version, Run identity, dataset, engine, and RF contract. `Open source Version` navigates to Setup and focuses the exact Version without rerunning RF. Historical optimization solutions retain Apply as new Version and Branch with solution.

Report rows display Scenario + Version, format, size, timestamp, availability, and source Run IDs. `Open Version` navigates to the exact source Version. Version inspection lists associated Runs and Reports as metadata and links back to the existing history/report surfaces. Downloading a retained Report remains an explicit bytes action.

## Comparison model

The Scenario workspace compares `Scenario A + Version` with `Scenario B + Version`. It renders the input-state diff first. It does not label input differences as better or worse RF performance.

An optional retained Run pair is displayed only when both Runs are succeeded and semantically compatible: same Run type, dataset ID/version, and RF model/engine identity. When a compatible pair is absent, the UI says so rather than inventing a comparison. Opening a Run navigates to the existing Run History record.

The existing Results KPI comparison remains useful for the current analysis flow, but the durable Scenario comparison is the authoritative Version/input comparison.

## Storage and retention boundary

7E does not create a new database. Scenario Versions continue through the existing ProjectV2 compatibility adapter and local repository. Run History and Report Artifacts remain additive local stores. Version inspection uses compact metadata and does not hydrate retained report bytes or large RF arrays.

The current ProjectV2 limits remain visible and unchanged:

- maximum 100 Scenario snapshots per Project;
- compact cached artifacts retained for the five newest artifact-bearing Scenarios;
- older cached Scenario artifacts are nulled and marked `requiresRerun` while exact input/revision metadata remains available.

These limits are storage/retention policies, not automatic Version deletion. Deleting a Scenario remains an explicit user action with the existing recoverable undo toast.

## Invariants and non-goals

- Switching, inspecting, comparing, continuing, branching, duplicating, and applying a solution never launch RF compute.
- A Version is immutable; new input always creates a new Version or draft.
- Autosave persists a draft; it never silently creates a Version.
- Historical Run and Report navigation preserves exact IDs.
- Existing dataset compatibility, ProjectV2 import/export, Run History, Report Artifact, and RF behavior remain additive.
- No collaboration, authentication, remote persistence, server-side report service, RF algorithm redesign, or optimizer redesign is part of 7E.

## Validation

The pure diff model, repository lineage operations, Scenario workspace, Run History labels/actions, and Report source navigation have focused regressions. Final completion evidence is maintained in `concept-7e-test-evidence.json` and is updated after the responsive browser workflow, Go checks, and documentation validator complete.
