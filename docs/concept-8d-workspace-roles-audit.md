# Concept 8D — Workspace Roles, Contextual Inspector & Tool Information Architecture

**Status:** Audit and product-architecture recommendation only<br>
**Baseline:** Version `0.9.0`, HEAD `b57b1efc98bda9ac37c75fe32d1d8b9618feea8c`, captured 2026-09-24<br>
**Scope:** Current dirty Concept 8B.1 worktree; no production component moves, product-code edits, RF/optimizer changes, persistence changes, or toolbar redesign.

## Executive decision

A.T.O.M should use a contextual right inspector for selected map-linked entities. The product already has a `MapInspector`, but it is rendered inside the same `ToolDrawer` and replaces the active task panel. The actual gap is ownership and continuity: the left drawer answers “what task am I doing?”, the map is the spatial work surface, and a compact inspector should answer “what entity/result am I inspecting?” without displacing the task.

Keep the inspector read-only. It can show a small set of contextual facts, freshness/source identity, and actions that open existing workflows. It must not become a second Setup, Inventory, Results, Run History, Reports, or Data drawer. The first implementation should establish a shared inspector shell and support Cell, Building, and Interference sample as the three designed entity families, reusing current read-only renderers for other already-inspectable map features during relocation. Pareto solutions, Runs, and Report artifacts stay with their existing tools.

The cell-click contract needs one small explicit boundary. Today a tower click changes map Focus, changes the Single active transmitter or Network cluster, invalidates results, and opens Map Inspector. A future Inspect / Select-cells choice should separate inspection from plan mutation. Armed area selection, cell placement, and path-endpoint selection take priority over inspection. This is a narrowly scoped prerequisite for an 8E cell pilot, not the full Concept 8C toolbar redesign.

Move Scenario/Version management to a dedicated **Plan > Scenarios** tool. Keep the four stages, one-tool drawer, map-first shell, command bar, explicit compute actions, freshness states, data/domain semantics, and lazy-load boundaries intact.

## Baseline and evidence

The pre-change record in [concept-8d-pre-change-baseline.json](concept-8d-pre-change-baseline.json) captures `git status`, `git diff --stat`, HEAD, and version. The worktree was already dirty with Concept 8B.1 changes in `App.jsx`, `WorkspaceChrome.jsx`, `styles.css`, E2E coverage, and untracked Concept 8B.1 evidence. Those files and screenshots were treated as user work and left untouched. 8D adds documentation only.

The current shell has four stages, stage-owned temporary choosers, one active left tool drawer, a grouped command bar, and a map toolbar/legend. Concept 8B.1 screenshot/geometry evidence reports drawer widths of 360px at 1440, 345.6px at 1280, 320px at 1024/768, and a full-width sheet at 390. The CSS confirms an 88px desktop stage rail and a `clamp(320px, 27vw, 360px)` tool drawer.

### Screenshot evidence index

All listed images are existing Concept 8B.1 after-state evidence; 8D did not replace or generate captures.

| Coverage | Evidence | Audit use / limit |
|---|---|---|
| Setup | `docs/assets/concept-8b1/after/1440-setup.jpg`, `1280-setup.jpg`, `1024-setup.jpg`, `768-setup.jpg` | Shows common Setup inputs and collapsed Scenario workspace; does not show its expanded contents. |
| Propagation | `docs/assets/concept-8b1/after/1440-propagation.jpg` | Shows Planning controls open, Advanced and Research collapsed. |
| RF Diagnostics | `1440-rf-diagnostics.jpg`, `1440-rf-diagnostics-research.jpg` | Shows canonical actions and the start of the expanded research stack; not all three research workflows. |
| Results | `1440-results-current.jpg`, `1440-results-stale.jpg`, `1440-results-optimization.jpg`, `390-results-current.jpg`, `390-results-stale.jpg` | Shows source/freshness context and result hierarchy; no populated Pareto browser. |
| Shell / stage chooser | 8B.1 before/after chooser captures at 1440, 1280, 1024, 768, and 390 | Confirms stage navigation and responsive drawer/sheet geometry. |
| Scenario workspace expanded | Unavailable | Source inspected in `ScenarioPanel.jsx`; only the collapsed Setup row is captured. |
| Inventory, priorities, path profile, Experiments, Interference, standalone Material/Reflection, Building Entry, Core Lab, Run History, Data, Reports | Unavailable as screenshots | Source/component inspection was used; this audit does not claim visual measurement for those states. |
| Populated Run History / Pareto | Unavailable | Their workflows and data contracts were inspected in source; no populated screenshot is indexed. |

The captured map tile provider failed in the screenshots (`Base map unavailable`). Those captures support shell, drawer density, and control placement; map-usability judgments below are qualitative and must be verified against a live map in 8E. Full screenshot provenance remains in `docs/concept-8b1-responsive-evidence.json` and `docs/concept-8b1-chrome-geometry.json`.

## Workspace roles and tool inventory

The full tool-by-tool inventory is in [concept-8d-tool-inventory.json](concept-8d-tool-inventory.json); major controls are classified in [concept-8d-role-classification.json](concept-8d-role-classification.json). The classifications use one primary role from `GLOBAL_CONTEXT`, `NAVIGATION`, `TASK_CONFIGURATION`, `SPATIAL_INSPECTION`, `MAP_VISUALIZATION`, `RESULT_ANALYSIS`, `WORKSPACE_MANAGEMENT`, `HISTORY`, `PROVENANCE_EVIDENCE`, or `TRANSIENT_FEEDBACK`, and list other roles only when ownership is genuinely mixed.

| Stage | Tool / subview | Primary goal | Audit call |
|---|---|---|---|
| Plan | Setup | Choose plan mode, technology/profile and shared RF inputs | Keep as task configuration; move Scenario management out. |
| Plan | Inventory | Browse/import/place cells and edit per-cell RF profiles | Keep as the sole full cell editor; inspector is read-only and links here. |
| Plan | Scenario workspace (currently inside Setup) | Manage Scenarios, drafts, Versions, branches and associations | Extract to Plan > **Scenarios**. |
| Simulate | Propagation: Planning | Set ray count, radius, azimuth, beam width; run/optimize sector | Keep as primary left workflow. |
| Simulate | Propagation: Advanced | Network optimization priorities/constraints and path profile | Keep secondary; compact priorities and distinguish configuration from path evidence. |
| Simulate | Propagation: Research/reference | Sub-THz and P.1411 candidate workflows | Keep collapsed and isolated; no new top-level tools. |
| Simulate | Experiments | Queue parameter sweeps and compare outcomes | Keep lazy-loaded; hide Cancel until a job can be cancelled and clarify Definition action. |
| Simulate | Signal surface | Generate/export aggregate received-power raster | Keep as a map visualization workflow; no point inspector until sample semantics exist. `SurfacePanel` is currently a static App import, not a Concept 7I lazy feature. |
| Analyze | Interference | Analyze Network overlap/radio quality | Keep as a compact task with explicit analysis; sample click can inspect without replacing controls. |
| Analyze | RF Diagnostics canonical | Open current RF result/path profile and building-entry evidence | Keep canonical actions visible and separate from reference workflows. |
| Analyze | RF Diagnostics Research | Measurement Validation, Material, Reflection | Use internal one-at-a-time subviews, not a long stacked disclosure or more stage tools. |
| Analyze | Building Entry | Estimate representative facade entry/service | Keep sparse: scope, one action, one result/empty state. |
| Analyze | 5G Core | Optional local Core Lab connection/path overlay | Keep optional and lean; tuck startup command and verbose events into details. |
| Review | Results: RF/Optimization/Interference/Compare/Candidates | Interpret exact current/historical outputs | Keep in Results with summary-first progressive detail. |
| Review | Run History | Browse retained Runs and inspect source/summary | Keep as an in-tool history master/detail task; do not use the spatial inspector. |
| Review | Data | Understand data confidence, packs and measurements | Compact Data summary; separate dataset QA/provenance from measurement evidence and developer commands. |
| Review | Reports | Generate/export and inspect retained report artifacts | Keep source-first and integrity-aware; no contextual map inspector. |

### Mixed-responsibility surfaces

| Surface | Current mixed roles | Recommended ownership |
|---|---|---|
| Setup | Task configuration + Scenario/Version workspace management + model evidence | Setup owns current RF inputs; Scenarios owns durable workspace lineage; model details remain secondary. |
| Map tower click | Active RF source/cluster selection + map Focus + entity inspection | Separate Inspect from Select-cells; keep map Focus independent. |
| RF Diagnostics | Canonical path/building actions + campaign validation + material and reflection references | Canonical entry stays visible; Research gets internal Validation / Materials / Reflection subviews. |
| Run History | History browsing + selected Run detail + provenance + public optimization solution/apply | Keep all in History but establish one-column list/detail hierarchy and progressive detail. |
| Results | Primary outcome + secondary metrics + feasibility + configuration + explanation + provenance | Score/feasibility/objectives first; metrics and configuration next; explanation and evidence later. |
| Data | Planning data + dataset QA + model/app metadata + measurement residual/calibration + CLI commands | Lead with data confidence/volumes; details for QA and provenance; specialist measurement workflow explicit; developer commands tertiary. |
| Inspector sample panels | Spatial inspection + result interpretation + model provenance | Compact sample facts first; technical decomposition and full source under Details/Provenance. |

## Contextual inspector decision

### Purpose and limits

**Adopt a read-only right contextual inspector.** It owns one inspected map-linked entity at a time. It keeps the map, current task, and entity identity in view. Contextual actions route to the existing owner: Inventory, Propagation path profile, Results, Run History, or Core Lab. Open/close is not a compute action.

Exclude global RF configuration, Scenario creation/Version history, optimization priority configuration, campaign/reference forms, full Run details, report generation/artifacts, and dataset administration. A selected Pareto alternative is not an inspector entity: it is a Run-scoped analysis selection with objective/configuration detail and Apply flow already owned by Results.

Use the current product vocabulary for entities: **Cell**, **Building**, **Interference sample**, **Scenario**, **Version**, **Run**, and **Report**. “Inspector” describes the shell; entity headers should name what is inspected (for example, “Cell 8414746”).

### Cell inspector design

```text
Cell 8414746                                      [Close]
5G mmWave · 28 GHz                   In cluster · #2

TX power                 30 dBm
Azimuth                  90°
Beam width               120°
Planning radius          400 m
Source                   Ankara planning dataset

CURRENT · Run 1c2224cb
[Edit in Inventory]  [Focus]  [Open path profile]

Details / Provenance ▸
```

The figures above illustrate the hierarchy; 8E must render resolved source values and units, not these example values. Show only values supported by the active per-cell profile and current plan. Separate “Active transmitter”, “In selected cluster”, and “Map Focus” labels. The inspector is read-only; profile edits/placement/deletion stay in Inventory. Show compact source/freshness and put dataset hashes, fingerprints, internal IDs, and lineage evidence behind Details/Provenance.

### RF result sample inspector design

```text
Interference sample · sample-42                 [Close]
12.4 dB SINR
−84 dBm RSRP · −11 dB RSRQ

Serving cell             8414746
Strongest interferer     8414890
Interferers              2
Quality                  Serviceable

CURRENT · Run 1c2224cb
[Focus serving cell]  [Open path profile]  [View Run]

Radio model / power terms / evidence ▸
```

Only render metrics present in the selected feature and supported by its model. Distance, LOS/NLOS, wall count, receiver margin, demand, and explanatory power decomposition are conditional on returned values; never calculate or imply missing values. The exact source Run and freshness travel with the sample. If the plan changes, retain a stale snapshot only when the selected sample payload is retained; otherwise show UNAVAILABLE and the source Run without recomputing.

### Pareto solution decision

Do not move Pareto detail into the inspector. Results already owns recommended-vs-selected state, score, objective values, feasibility, per-cell azimuth changes, comparisons, marginal explanations, and Apply. Keep candidate selection and side-by-side comparison in Results. The right inspector would duplicate `selectedSolutionId`, risk changing the source Run, and make a non-spatial analysis look like a selected map object. A cell-level link may focus a changed cell, but must not imply the map rays were recomputed for the Pareto candidate.

## Selection, focus, inspection, ownership, and lifecycle

The current code already separates several state variables imperfectly:

- `selectedTower` is the active RF transmitter in Single mode.
- `selectedNetworkTowerIds` is the Network cluster input and affects optimization/evaluation.
- `selectedMapCellId` is used by the map toolbar as Focus/ray-cell choice, although the state name says “selected”.
- `selectedMapObject` is a transient `type + payload` used by the existing Map Inspector.
- `selectedSolutionId` is the currently inspected Pareto alternative in Results.
- Run History selection/focus is historical browsing, not working-plan activation.

Use exact visible terms: **Plan selection** changes active transmitter/cluster; **Map Focus** changes map display; **Inspected entity** is a read-only context target; **Selected solution** is Results-only. Inspecting must not alter any of the other three. The current three-way tower-click handler is an implementation risk, not a desirable inspector behavior.

For the cell pilot, add a minimal Inspect / Select-cells choice. In Inspect mode, click opens the entity inspector only. In Select-cells mode, preserve the current Single activation or Network membership toggle. Area draw, cell placement, and path endpoint selection take priority and suppress inspection. Ordinary result-point clicks inspect when no map-edit mode is armed. Do not add a hover inspector or recompute on selection.

Use a small App-owned local identity such as `{ kind, id, source, projectId, scenarioId, runId }`; keep feature data resolved from the current domain/result source, with only the minimal frozen sample snapshot needed to preserve stale context. This state crosses map/task boundaries, so App-level React orchestration is justified. Do not add Redux/Zustand/XState, an event bus, routes, or plugin architecture.

Close clears only the inspected entity. Tool switches may keep the inspector open when its source remains valid. Project/Scenario switches clear it before restoring the new workspace. If a selected entity disappears, show UNAVAILABLE rather than selecting a nearby feature. Historical inspection carries HISTORICAL; plan edits carry STALE with exact source identity; unsupported 6G radio quality remains UNSUPPORTED. No automatic re-run.

## Panel coexistence and map-first behavior

The detailed matrix is in [concept-8d-panel-coexistence.json](concept-8d-panel-coexistence.json). Width arithmetic uses the measured rail/drawer geometry; map usability must be confirmed with real map tiles and representative overlays.

| Viewport | Panel behavior | Approximate map budget |
|---:|---|---:|
| 1920 | Left tool + right inspector push the map | 1152px |
| 1600 | Push both; keep inspector at 320px | 832px |
| 1440 | Right inspector overlays opposite map edge; left task stays open | 672px clear map corridor |
| 1280 | Inspector replaces/hides left drawer; Back restores the tool and state | 872px |
| 1024 | One inspector panel only; no dual side panels | 616px |
| 768 | One full-width bottom sheet at a time; target max about 55vh | 680px map width above sheet |
| 390 | One full-width sheet at a time above the bottom stage rail; keep a map strip | 390px map width |

At 1440 the paired panels are at the lower desktop limit; close either independently to recover map space. At 1280 and 1024, do not silently auto-close the left task content: temporarily occupy its panel slot and provide Back to the exact tool. At 768/390, use one sheet host and explicit Back/Close; avoid two competing overlays or a three-column simulation. The inspector should be independently collapsible. Escape closes the inspector first when both desktop panels are open; task state remains stable.

Map Focus and the legend remain distinct. Focus centers/selects which cell’s rays are displayed; inspector “Focus” is a map navigation action and must not set the active transmitter or cluster. Legend explains aggregate SINR/RSRP/RSRQ color bands; inspector explains one selected sample. The future 8C toolbar pass should visually distinguish planning selection/edit mode from RF/layer visualization, but 8D does not redesign that toolbar.

## Scenario workspace, draft guard, and stale results

### Scenario Workspace location

Move the current Scenario workspace disclosure to a dedicated **Plan > Scenarios** tool. It changes durable planning context and Versions, so Plan is the right stage; Review would make saving/branching feel retrospective, while Setup should remain the active-plan form. Keep current Scenario list, draft status, Save Version, immutable Version history, Continue/Branch, Duplicate, comparison, and compact Run/Report associations. Move full fingerprints and technical lineage to Details/Evidence; associated records link to their Review tools.

### Draft-switch guard

The cross-Scenario guard is semantically valid: switching from an unsaved working draft is destructive, the browser-local draft is retained, and the UI tells the user to save a Version. Recovery is less obvious: the user must open the Scenario workspace, save, then retry the destination click. Do not offer **Discard changes**; no discard/reset-draft domain operation was found. Recommended prompt names the destination and protected draft, offers **Save Version** and **Stay here**, then requires an explicit **Open destination Scenario** after save.

There is a same-Scenario false-trigger risk. `openSavedScenario` blocks whenever `activeProject.draft` exists and `activeScenarioId === null`, without checking whether the clicked Scenario is already the current draft source; the ScenarioPanel current row remains clickable. `openScenarioRevision` has a same-current exception, so behavior differs. Fix that guard in a later implementation by comparing the target Scenario identity before deciding the transition is destructive.

### Stale-result UX

An RF-affecting change cancels dependent work, clears rendered analysis layers, sets `planDirty`, and retains the source Run identity for stale communication. Keep the current stale semantics: after an edit, the old result stays STALE until a successful new Run or compatible restore; manually returning controls to matching-looking values does not clear `planDirty`. Show “Result out of date · Run [ID] came from its original inputs” with **Run current plan** and **View Run** actions where available. The inspector must show the same CURRENT/STALE/HISTORICAL/UNAVAILABLE/UNSUPPORTED state and never silently recompute.

## Tool-by-tool decisions

### Setup, Inventory, Propagation, Optimization priorities

- **Setup:** Primary is plan mode, technology/profile, propagation model, TX power, and plan cell set. Advanced applicability stays secondary. Scenario/Version workspace leaves Setup. Model IDs/fingerprints remain Details.
- **Inventory:** Keep full editing and validation here. Recommended model: Inventory remains the editor; the contextual inspector is read-only. A two-column Inventory list + inspector is not required for the pilot.
- **Propagation:** Keep ray/radius/azimuth/beam-width and explicit Run/Optimize actions as Planning. Advanced contains network priorities/constraints and path profile; label those distinct functions. Research/reference remains isolated and collapsed. No scientific-model hierarchy changes.
- **Optimization priorities:** Replace repeated large objective cards with compact rows showing objective, direction, value and slider. Keep a short meaning visible; put longer help in an info disclosure/tooltip. Do not hide objective semantics or feasibility constraints.

### Experiments, Interference, RF Diagnostics, Building Entry, Core Lab

- **Experiments:** Current idle state shows disabled Cancel and Definition buttons. Hide Cancel until accepted/running; show Definition only after generated and label it **Download definition**. Use visible units (GHz, dBm, degrees, dB); explain that blank dimensions inherit the active plan. The single empty state should say no sweep has run and give one next action. Map accepted/queued distinctly from running; retain progress and completion counts.
- **Interference:** Keep this as a reference for a strong tool: explicit applicability, a short explanation, a limited control set, model assumptions separated from the primary task, and one clear analyze action. Do not change it merely to match denser panels.
- **RF Diagnostics:** Keep canonical result/path actions visible. Add internal subviews **Validation | Materials | Reflection** under Research/reference and mount only one at a time. Do not inflate Analyze’s top-level tool count. Retain evidence/source separation and lazy loading.
- **Building Entry:** Sparse before a run is appropriate. Use a scope statement, one Estimate action, and a single result/empty state. Do not add controls to fill space or frame one button in an empty card. Preserve representative-facade limits and denominator explanation.
- **5G Core:** Toggle, applicability/connection state, and path summary are sufficient for the optional integration. Place the Docker/sidecar command in Developer setup details. Keep verbose event history secondary and do not invent more Core Lab forms.

### Results, Run History, Data, Reports

- **Results:** Lead with result kind, freshness/source Run, and the primary outcome. For optimization show score and feasibility, then four primary objectives; put additional metrics, configuration changes, and explanation in progressive detail. Keep raw metrics accessible. Clearly distinguish **Network evaluation** (one configuration) from **Network optimization** (search); an evaluation must not imply Pareto alternatives.
- **Candidates/Pareto:** Keep recommended vs selected roles, comparison, cell deltas, explanation, and Apply inside Results. Side-by-side comparison remains available without the inspector. Apply must preserve exact source Run/Version identity.
- **Run History:** Use a single-column master/detail flow in its own tool: filters/list, then selected Run detail with Back. Full source/provenance and public solutions belong to selected Run detail, grouped progressively; do not use the inspector because Run is not spatial. When no Runs exist, show only “No saved Runs yet — run a simulation or optimization to create one”; hide the contradictory “Choose a Run from history” detail empty state. For populated history, distinguish current workspace from historical Run and keep Run Again/Report/Apply actions scoped to that Run.
- **Data:** Compact summary: Data quality, Buildings, POI demand, Residential, active dataset name/version. Dataset details expose installed packs, QA, sources and licensing; Model details expose assumptions; Provenance exposes hashes/model/app identifiers. Pack-building CLI commands belong behind Developer details. Keep the CSV residual/global-bias correction as a clearly named **Measurements & calibration** workflow in Data because it can explicitly update the plan. Do not merge it with RF Diagnostics campaign validation: that workflow is a separate evidence ledger and does not promote a model.
- **Reports:** Source identity and PDF/Print/Markdown generation lead. Definitions/artifacts and open/download/regenerate/delete follow. Retain exact source binding and byte integrity; hashes/generator/storage IDs are tertiary details. Report artifact inspection belongs in Reports, not the map inspector.

## Visual information implications

This is a container/priority audit, not a visual redesign. Current useful boundaries include the command bar, stage rail, Planning/Advanced/Research disclosures, result-source disclosure, and map legend. Main mismatches are the huge Scenario workspace disclosure, three vertically stacked RF research workflows, two-column history detail squeezed inside a narrow drawer, one-card-per-result-fact patterns, and equal-weight Data metadata tiles.

Use compact key/value rows for repeated facts, not one card per value. Establish the inspector as one entity header, 3–6 key facts, current result context when relevant, 1–3 actions, and a Details/Provenance disclosure. Keep task configuration visually distinct from entity facts. Do not copy CVAT’s density or add nested card stacks.

Color roles need to be less overloaded: teal for ready/current/primary action; navy/slate for structure; violet only for map Focus; amber for stale/warning/review; red for errors; gray for disabled/unavailable. Unsupported/research-only stays a labeled scope note, not an error color. Current amber cluster selection overlaps stale/warning, and the selected inspector marker uses a red tone similar to error/poor quality. Future styling should use a distinct selection outline plus labels, not color alone.

Reduce vertical typography pressure in RF Diagnostics, Data, Scenario/Version, Results and optimization priorities with consistent compact labels/body text and short summaries. Keep readable unit labels and RF terminology. Avoid hiding scientific semantics behind icon-only controls or abbreviations.

## Accessibility, empty states, actions, terminology, and provenance

- Name the inspector as a complementary region; heading identifies entity and stable ID. Keyboard-open moves focus to the heading; pointer inspection does not steal focus or announce hover. Close returns focus to the source action/toolbar. Ensure no focus trap and preserve Escape ordering with stage chooser/map edit modes.
- Freshness, active/cluster/focus status and unavailable reasons must be readable without color. Keep visible labels alongside icons and rail badges. Source entity gets an accessible name; all inspector actions are keyboard reachable.
- Empty states name what is missing, why, and one next action. Special cases: no Run list must not ask to choose a Run; no Version points to Save Version; no path asks for both endpoints or map selection; no building tells how to enable/load/select the building layer; Core Lab disabled explains the 5G prerequisite; no Report offers current-plan export; no result tells whether it is unavailable, stale, or unsupported.
- Hide idle Cancel and unavailable irrelevant actions when they have no useful explanation. If an action must remain visible, disable it with a specific reason and next step. Keep Run/Report/Branch/Apply actions scoped to a valid selected source.
- Preserve stable terms **Scenario**, **Version**, **Run**, **Report**, **Working draft**, **Cell**, and RF terms. Clarify **Plan selection**, **Map Focus**, **Inspected entity**, and **Selected solution**. Use `Cell` for RF entities and `site/tower` only for physical placement context.
- Normal UI shows model/standard name, compact source, freshness and source Run. Details/Provenance holds fingerprints, contract/model IDs, dataset hashes, implementation/generator identifiers, complete lineage and evidence records. Preserve inspectability without giving those fields primary visual weight.

## CVAT lessons adopted and rejected

Adopt center canvas dominance, left task/action ownership, right selected-object ownership, collapsible panels, and spatial continuity. Reject extreme density, permanent dual panels at every viewport, icon overload, general object-list complexity, and desktop-only assumptions. CVAT is a role model only; A.T.O.M remains a calmer scientific planning tool with explicit compute and freshness.

## Lazy loading and domain invariance

Keep Concept 7I boundaries: inspector open must not load Experiments, RF Diagnostics Research, Run History, Reports, or Core Lab. Building evidence can load only after a Building is inspected. Interference sample inspection reads its selected result payload and never issues an analysis request. If RF Diagnostics is split, load only the selected Validation/Materials/Reflection subview and keep compute behind explicit actions.

Concept 8E must preserve RF requests, optimizer behavior, fingerprints, ScenarioRevision, Run schema, Reports, artifact storage/integrity, freshness, ProjectV2, data packs, and backend APIs. UI relocation is not permission to alter domain semantics.

## Recommended Concept 8E scope and test plan

Implement one cohesive inspector foundation and relocate current map-inspector content into it. Design three entity families first: Cell, Building, and Interference sample. Reuse existing read-only renderers for coverage gaps, communication paths, measurement samples, and site recommendations so relocation does not drop current behavior. Do not add Pareto, Run, or Report inspector types. Include the minimal Inspect / Select-cells boundary needed to make tower inspection non-mutating; leave the rest of 8C’s toolbar regrouping for later.

This scope is preferred over a cell-only container move because the app already supports several map entity inspector renderers and a mixed left-drawer result would be inconsistent. It is smaller than introducing every conceivable result type because three representative families exercise workspace identity, lazy evidence, and exact Run freshness while Pareto/history/report retain their established owners.

The full 8E test plan is in [concept-8d-8e-test-plan.json](concept-8d-8e-test-plan.json). It covers cell Inspect vs Select behavior; edit-mode conflicts; Building and sample identity; close/focus; task continuity; Scenario/project clearing; stale/unavailable handling; direct Inventory/path-profile actions; exact Pareto source invariance; all seven viewport widths; keyboard/accessibility; lazy-loading; request counts; and domain/schema invariance.

## Concept 8C timing

Do not implement 8C here. Let 8D settle the interaction contract and run the 8E inspector pilot first. Then scope 8C around the measured Inspect/Select mode, Map Focus, Scope, RF display/layers and legend relationships. This avoids building a toolbar around an unsettled inspector/selection model.

## Required artifact index

- [concept-8d-pre-change-baseline.json](concept-8d-pre-change-baseline.json)
- [concept-8d-tool-inventory.json](concept-8d-tool-inventory.json)
- [concept-8d-role-classification.json](concept-8d-role-classification.json)
- [concept-8d-inspector-candidates.json](concept-8d-inspector-candidates.json)
- [concept-8d-selection-semantics.json](concept-8d-selection-semantics.json)
- [concept-8d-panel-coexistence.json](concept-8d-panel-coexistence.json)
- [concept-8d-information-priority.json](concept-8d-information-priority.json)
- [concept-8d-container-audit.json](concept-8d-container-audit.json)
- [concept-8d-cvat-comparison.json](concept-8d-cvat-comparison.json)
- [concept-8d-implementation-risk.json](concept-8d-implementation-risk.json)
- [concept-8d-8e-test-plan.json](concept-8d-8e-test-plan.json)
- [concept-8d-decision.json](concept-8d-decision.json)
- [concept-8d-wireframes.md](concept-8d-wireframes.md)

## Validation record

Concept 8D is documentation-only. `sh docs/build-reference-pages.sh` completed; `docs/validate_docs.py` passed with the repository-pinned PyYAML in an isolated temporary environment (41 HTML pages and 41 API paths); all 12 Concept 8D JSON artifacts parsed; `python3 scripts/versioning.py check` passed at 0.9.0; and `git diff --check` passed. The build script emitted only Pandoc's `--mathml` deprecation warning. No frontend/backend tests, application build, or live-browser smoke were run. Existing 8B.1 captures were reviewed for drawer geometry and information density; base-map tiles are unavailable in those captures, so they do not validate live map usability. No generated reference pages were left changed, and the pre-existing 8B.1 worktree changes were preserved.
