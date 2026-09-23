# Concept 8A — Navigation, Workspace Chrome & Information-Density Audit

- **Status:** Audit complete; recommendation for Concept 8B
- **Captured:** 2026-09-23
- **Baseline:** commit fc81741771699da7af95fb20b846f893950585db, version 0.9.0
- **Scope:** Product structure and navigation only. No product source, RF, optimization, persistence, Scenario, Run, Report, or styling changes were made.

## Executive finding

The primary diagnosis is supported. The workspace is map-first and already shows one active tool in one drawer, but it presents the tool hierarchy twice: the left rail selects a stage and the drawer repeats that stage’s tools in a persistent tab row. The current tool then appears in the selected rail stage, the drawer title, and the selected tool tab. At 1440×900 the tabs consume 51 px before tool content; at 390 px they consume 59 px and the four-item Analyze and Review rows need 513 px of horizontal scrolling inside a 390 px viewport.

Keep Plan, Simulate, Analyze, and Review. Keep the 88 px desktop stage rail and the one-tool drawer. Replace the permanent tool-tab row with a stage-owned, click-open tool flyout. The flyout should preserve each tool’s current availability reason and attention state, and it must work with keyboard, pointer, and touch. This removes one persistent navigation layer without widening the rail or routing away from the map.

The command bar has a second, independent density problem. At 1440 px its workspace identity, RF context, result context, metric shortcut, operation state, local-save state, model-limit link, and compute action all compete in one 56 px row. CSS hides some of these fields at narrower breakpoints, but the 390 px screenshot still shows overlapping workspace and result text; operation status is reduced to a dot. Group the same information into Workspace, RF context, Status, and one primary-action slot. Keep lineage and result freshness immediately readable; move detailed metrics and RF scalars behind their relevant views.

- **Selected model:** Option A, rail flyout.
- **Command-bar recommendation:** grouped workspace/RF/status/action model.
- **Map-toolbar scope:** defer structural changes to Concept 8C.
- **Dashboard:** no dashboard is justified.

## Baseline and method

The initial tree was clean on branch main at fc81741771699da7af95fb20b846f893950585db, version 0.9.0. A Vite development server used the checked-out frontend and the already-running local API. Screens were captured in disposable Playwright Chromium contexts; the isolated contexts created sample simulation and interference results only to make CURRENT, STALE, HISTORICAL, and post-run screens inspectable. No browser profile, project files, source code, or durable workspace records were changed. There were no page errors in the captured journeys.

The screenshots and measured viewport geometry are indexed in docs/concept-8a-pre-change-baseline.json. The compressed evidence images are in docs/assets/concept-8a/. They show the map, tool drawer, rail, toolbar, and legend together, so the overlays and their simultaneous visual weight can be reviewed in context.

## Current chrome hierarchy

The actual persistent stack is:

1. Command bar: product identity; Project menu; Scenario/Version/draft summary; conditional result state; single/network and cell context; technology and RF scalars; Planning estimate link; conditional result metrics; operation state; local autosave state; and the conditional Run Sector/Evaluate Network action.
2. Stage rail: Plan, Simulate, Analyze, Review. Clicking a stage selects its first available tool; it does not expand a tool list.
3. Drawer header: active tool icon, title, short description, and close.
4. Tool-tab row: sibling tools for the active stage, including availability and result-attention badges.
5. Capability disclosure: Planning, Advanced analysis/model details, Research / reference, or tool-specific sections.
6. Tool content and controls.
7. Map overlays: selection and RF toolbar, Leaflet zoom controls, map legend/result source, map object popups/inspectors, and transient notices.

The map remains continuous beneath the drawer and tool changes happen in place. That is a strong product contract to preserve. The drawer does not create a page transition.

## Current navigation depth and stage/tool map

The concepts are useful and distinct: a stage answers “what kind of work?”, a tool answers “which operation?”, a disclosure answers “which capability?”, and Details/Provenance answers “what method, source, or record produced this?” The UI currently presents the first two as separate levels in both the rail and drawer, then can repeat a capability label inside its content.

Exact current tool map:

| Stage | Tools | Count | Notes |
|---|---|---:|---|
| Plan | Setup; Inventory | 2 | Both available in the default workspace. |
| Simulate | Propagation; Experiments; Signal surface | 3 | Experiments feature is lazy-loaded; Signal surface is available from the stage row. |
| Analyze | Interference; RF Diagnostics; Building entry; 5G Core | 4 | Interference is unavailable outside Network mode, below two selected cells, or for the 6G research profile. The stage jump skips an unavailable tool and selects the first available one. Core Lab is an optional integration. |
| Review | Results; Run history; Data; Report | 4 | Run history and Report have lazy feature boundaries. Results contains a second row of five result views: RF, Optimization, Interference, Compare, Candidates. |

Important paths are mapped in docs/concept-8a-navigation-depth.json. The deepest common tool path is Review → Run history → a Run → Details / Provenance; RF Diagnostics adds the Research / reference disclosure and then method-specific panels and provenance. Direct actions already jump to exact destinations: Open current RF result goes to Results, Open vertical path profile goes to Propagation’s advanced section, and run/report source actions open their source context without navigating through every level.

The 13 tool definitions already share WORKSPACE_TOOLS for stage, label, and icon. The rail and tool row filter that same list. A small extension to this existing metadata can supply short descriptions and lazy/eager hints for navigation. Availability remains app-owned runtime state. Do not create a second registry, put RF logic in metadata, or build a plugin architecture.

## Left-rail capacity and drawer-tab redundancy

The rail is 88 px wide and contains four labeled stage buttons with icons. The active stage uses a selected treatment; a stage can show an aggregated warning or success badge. At widths below 640 px it becomes a 64 px bottom bar with four labeled targets. At 768 px it remains a vertical rail. Tool identity is not present in the rail; its active state is derived from the open drawer and tool mode.

The current rail has room for stage selection, but it cannot clearly display up to four tool names without becoming wider or expanding. Its stage click currently changes to a default tool, not to a stage menu. Tool tabs therefore have a unique job today: one-click sibling selection plus per-tool availability/attention. Remove them only when the rail-owned tool launcher takes over both jobs.

At 1440×900 the tool drawer is 360 px wide; the header is 62 px and the tool-tab row is 51 px. At 1280 px the drawer is 345.6 px; at 1024 and 768 it is 320 px. The row’s natural width for Analyze and Review is 513 px, wider than the drawer at every tested viewport. It scrolls horizontally with its scrollbar hidden, so Building entry and 5G Core are clipped in the default Analyze view; mobile users must discover horizontal swiping.

The drawer is already a one-tool drawer: only the selected tool’s content renders, and its header already contains icon, tool name, one-line description, and close. Keep that header. Removing the sibling row saves 51 px at desktop and 59 px on mobile and reduces the simultaneous tool signals from active rail + title + selected tab to active rail + title. Do not remove the row’s availability and attention information; move those indicators into the flyout.

## Screen-by-screen observations

| Screen | What works | What feels crowded or repeated | 8B structural direction |
|---|---|---|---|
| Setup | Planning disclosure groups the mode, technology, model, and power controls; the global Run Sector action is visible. | Drawer header + tabs + Planning title/description put the first mode control 236 px from the drawer top. Workspace and RF context are split across many header items. | Keep the disclosure and controls; remove only the persistent tool row and group command-bar context. |
| Inventory | Search, local cells, map placement, imports, and selected-cell editing stay beside the map. | The Inventory title, CELL INVENTORY title, intro, actions, search, list, selected-cell detail, and disclosure hierarchy make the drawer feel dense. | Keep this tool’s inventory structure; reduce the shared navigation row before content. |
| Propagation | Planning, Advanced analysis, and Research / reference disclose capability in a scientifically legible way. | The drawer exposes the tool tab row before three disclosure levels; first range control is 238 px from the drawer top and Auto-Optimize Sector is 462 px down. | Keep disclosure semantics and compute action; remove only the tool row. |
| Experiments | The matrix and queued-work framing make explicit compute work understandable. | Introductory copy and input matrix push Queue matrix to 506 px from the drawer top. | Keep the tool content and lazy boundary; row removal buys 51 px. |
| Signal surface | Raster generation is explicit; cell size, thresholds, visual floor, opacity, and exports are grouped in one tool. | The tool intro and dense controls put Generate raster + contours 592 px from the drawer top. | Keep controls and science context. No nav-driven control changes. |
| Interference | Bandwidth, cell load, reuse, advanced assumptions, and the radio-quality action are in one analysis tool; the map shows selected cluster and SINR. | Requires Network mode and at least two cells. Four sibling tools exceed the available tab-row width. Analyze Interference appears after its inputs. | Preserve readiness reason, current stage/tool identity, and its separate compute action. |
| RF Diagnostics, collapsed | Direct Open current RF result and Open vertical path profile actions reduce navigation depth. Research/reference is closed by default. | Rail stage, drawer title, selected tab, then Research / reference disclosure each name a different level without a clear visual separation. | Keep direct destinations and disclosure. Use one header tool title and one capability label. |
| RF Diagnostics, expanded | Campaign validation and reference tools retain explicit scope limits and scientific source details. | RF DIAGNOSTICS, VALIDATION / REFERENCE, ISOLATED, RESEARCH / REFERENCE, and 4I.4 · ISOLATED coexist with “not used by network simulation” copy. | Keep one capability-group label and one safety/provenance explanation per method. Move internal IDs to Details / Provenance. |
| Building entry | The estimate is explicitly limited to representative facade entry, with a visible Run building-entry estimate action. | Tool row, Advanced analysis disclosure, and inner BUILDING ENTRY label repeat hierarchy before the action at 321 px. | Keep applicability language and compute action; remove the shared row. |
| 5G Core | The optional sidecar and startup command are clear; the tool is selectable and the feature remains lazy. | It occupies the same four-item clipped row even when the optional lab is not running. | Show availability and optional-local status in the flyout; select the existing lazy feature only on activation. |
| Results / Optimization | Result subviews separate RF, optimization, interference, comparisons, and candidates; the result card shows lineage and freshness. | Tool tabs are followed by five result-view buttons. Result source appears in the header, result card, and map legend; the global metric shortcut repeats values displayed in Results. | Keep result subviews and lineage. Retain one compact global result-state/source chip; move metrics to Results and active-layer legend. |
| Run history | Filters, run identity, historical status, retained summary, and provenance are available together. | Filters, run list, selected-run detail, JSON summary, and unavailable historical report status make the drawer long. | Keep Run selection and provenance behavior; no change to Run semantics. |
| Data | Dataset confidence, model assumptions, provenance, and local dataset context are grouped by capability. | Planning data starts open, then Dataset details, Advanced model details, and Research / reference add repeated disclosure headers. | Retain confidence and applicability; reduce repeated Research/reference labels where the group already states it. |
| Report | Report source and generated artifacts remain tied to Scenario/Version/Run. | Export actions are below report-source context; the tool is one of four clipped Review choices. | Keep Report semantics and lazy loading; make it discoverable from Review’s flyout. |

## Navigation options and switching cost

The current model and six alternatives were compared in docs/concept-8a-navigation-options.json. The phase 8 prototype labels call the selected click-open flyout “Option A”; the separate rail-capacity pass evaluates the phase 4 A–F list, where the click-open flyout is B:

1. **A — Rail flyout (selected):** clicking a stage opens its vertically listed tools; choosing one updates the same drawer. The flyout is click, keyboard, and touch accessible. It does not resize the map or add a persistent row.
2. **B — Expandable rail:** tool names remain visible below the expanded stage. This offers excellent sibling discovery and one-click switches within the open stage, but grows the rail from 88 px to roughly 208–248 px or requires an overlay that behaves like A.
3. **C — Stage rail plus current-tool dropdown in the drawer header:** compact and easy to place, but leaves tool selection out of the rail and retains a second independent selector near the command bar context.
4. **D — Temporary two-column stage/tool chooser:** explicit hierarchy, but a wide overlay covers a larger part of the map and adds another temporary navigation surface.
5. **E — Persistent nested rail:** makes all 13 tools visible and fast to select, but would make navigation dominate the map-first shell and constrain tablet/mobile layouts.
6. **F — Workspace-wide searchable palette:** helps experts who know a tool name, but adds a global launcher and search mode without evidence that users need it more than stage-owned sibling discovery.

Wireframes are in docs/concept-8a-wireframes.md.

Cold closed-menu transitions under A take two activations: open the stage’s tool list, then choose the sibling. Once the list is open, one selection changes the tool. Current tab switches are one activation. This is a real expert-workflow cost. The map remains the same size, the drawer changes in place, and direct programmatic destinations do not acquire an extra click. No usage telemetry exists to prove which transitions are most frequent; Setup ↔ Inventory, Propagation ↔ Results, and Results ↔ Run history are plausible high-frequency pairs, not measured facts. Do not add recents or keyboard shortcuts in 8B without user evidence.

The flyout wins because it removes a permanent row while preserving map area and tool discoverability. The 8B interaction should be explicit: stage buttons open the relevant tool list; the current tool is marked; unavailable tools remain visible with a reason; selecting a tool updates the existing drawer; Escape closes the chooser and restores focus to its stage trigger. A pointer hover may assist, but click, Enter/Space, and touch must work independently. A future usability check should specifically ask expert users whether the extra closed-menu activation is acceptable.

## Command-bar inventory and recommendation

The current bar contains all of the following:

| Item | Class | Current behavior |
|---|---|---|
| A.T.O.M identity and subtitle | Global identity | Brand and product name. Subtitle is hidden below 1120 px; all brand text is hidden on phone. |
| Project menu | Workspace identity/action | Project name, scenario/project operations, import/export, and immutable Version save. |
| Workspace lineage summary | Workspace identity/status | Scenario, Version label, draft state. Full Project/Scenario/Version/Draft fields are in a disclosure. |
| ResultContextBadge | Result context | Conditional freshness and source Run context. |
| Single/Network and cell count | RF context | Context label for mode and selected cell count. |
| Technology | RF context | LTE, 5G mmWave, or 6G research profile label. |
| Frequency, TX power, radius | RF context | One scalar summary string on wider screens; hidden by the 1120 px rule. |
| Planning estimate | Model qualification | Always-present external modeling-limits link. |
| Result summary button | Result metrics/action | Conditional score or RF/interference summary and route to Results. |
| Ready/Running/Run needed/Result out of date | Operation/result status | Current top-level status with dot and text; mobile reduces it to a dot. |
| Draft saved locally/Saving/Save failed | Persistence status | Live status; hidden below 1120 px. |
| Run Sector/Evaluate Network | Primary action | Present on Setup, Inventory, and Propagation; wording adapts to mode/readiness. |

Keep a compact Workspace group with Project, Scenario, Version or No saved Version, and draft state visible. Keep CURRENT, STALE, HISTORICAL, UNAVAILABLE, or UNSUPPORTED visible whenever a result context exists, with a short source Run label. Keep current operation state and a grouped RF summary (mode/cell count, technology, frequency); expose power and radius as secondary RF detail at narrow widths. Keep one primary Run Sector/Evaluate Network action in the existing Plan/Simulate scope, with current disabled/readiness behavior. Do not add a dashboard or routing.

Move optimization score, average RF values, overlap, serviceability, and other analysis metrics to the Results view and relevant active-layer legend. A small result-state/source chip may open Results, but should not compete with the workspace identity as a second metric card. The map legend should keep Result source while result layers are visible because it qualifies the map itself.

Local draft autosave and immutable Version save are different facts. Show Version identity in the Workspace group. Show local save feedback only when saving, failed, or when a compact “saved locally” detail is useful; explain that this is browser-local draft storage. Avoid showing “Unsaved changes” beside “Draft saved locally” without clarifying that the draft is locally saved but not an immutable Version.

## Lineage, result metrics, borders, badges, and labels

Project identity is currently the Project menu trigger; Scenario, Version/no-Version, and draft state are in the adjacent lineage summary. The summary is keyboard-operable and its disclosure exposes all four lineage fields. Keep all four answerable from the persistent workspace group; the disclosure may hold full IDs and detailed source lineage, not basic identity.

Result state is currently duplicated across the global result badge, metric shortcut, Results card, map source legend, and sometimes a map prompt. Keep one global state/source chip, detailed metrics and provenance in Results, and a source label in the legend only when the corresponding map layer is visible. This preserves discoverability without claiming every result metric is global workspace identity.

The default Setup screenshot has several distinct command-bar objects before any result exists: Project, lineage, context, technology, RF scalar summary, Planning estimate, Ready, local-save state, and primary action. Result-bearing screenshots add the result badge and metric card. Much of that visual weight is useful information, but independent borders/pills make it read as many peer contexts. The drawer adds the selected stage, tool title, tab row, disclosure rows, and card edges; the map adds a bordered toolbar and legend. Keep borders on interactive controls and status that needs a clear state. For grouping and hierarchy, prefer spacing, typography, and alignment before another box.

Research labels express three different meanings and should not be collapsed semantically:

- **Navigation/capability:** keep the Research / reference disclosure label.
- **Safety/applicability:** keep a clear per-method statement such as “not used by network simulation” and any unsupported/unavailable status required to prevent misuse.
- **Scientific provenance:** keep standards, clauses, model assumptions, and source details in each relevant panel and Details / Provenance.

The expanded RF Diagnostics view currently shows several simultaneous labels: RF DIAGNOSTICS; VALIDATION / REFERENCE; ISOLATED; RESEARCH / REFERENCE; and 4I.4 · ISOLATED. Keep the validation/reference category and one explicit isolation/safety statement. Move 4I.4, internal contract/model IDs, and implementation identifiers into technical Details / Provenance unless they are needed to interpret an active result. Preserve scientific terms such as P.2040, P.1411, P.526, RSRP, SINR, RSRQ, and UMa.

## Map toolbar, legend, actions, and map-first contract

The map toolbar contains:

- Spatial selection: Draw selection area; Finish/Cancel while drawing; Clear selected cells; Fit selected cells.
- RF display: Signal and Rays toggles; Scope and Focus selectors.
- Conditional interference display: SINR, RSRP, RSRQ.
- Layers menu: viewport buildings, coverage gaps, selected cells, communication paths, interference surface, measurement residuals.
- Leaflet plus/minus zoom controls.

Signal and Rays are clear immediate display actions. Scope and Focus depend on available RF rays; the metric switch depends on interference results; layer choices depend on current data. The toolbar grows from 42 px tall on desktop to a wrapped 201 px at 390 px, where it competes with the map top and the sheet drawer. Keep its science controls and visible map meaning in this concept. **Defer any toolbar regrouping to Concept 8C** so 8B can isolate navigation/command-bar risk.

The map legend is semantically coherent: cell key; result source; received-power categories; signal-surface scale, threshold, and cell; coverage gaps; and interference quality when present. Its contents vary with active layers, which is correct. Its repeated result source is useful next to the map layer; the global duplicate is the better candidate for compression.

The global Run Sector action is a plan-level action currently shown for Setup, Inventory, and Propagation. It adapts to Run Sector in single mode and Add N cells/Evaluate Network in network mode. Preserve this wording/readiness behavior and its single prominent treatment. Keep analysis actions such as Analyze Interference, Auto-Optimize Sector, Run building-entry estimate, reference evaluations, and report generation local to their tool. Do not give every tool action the global primary-button treatment.

All selected navigation options must keep the map visible, avoid route changes, leave the drawer in place, and preserve immediate spatial feedback. None of the proposals justify a dashboard.

## Responsive, accessibility, first-time, and expert review

| Viewport | Observed layout and evidence | Concept 8B contract |
|---:|---|---|
| 1440×900 | 56 px command bar, 88 px rail, 360 px drawer, 51 px tool row, 968 px map-toolbar box. Drawer covers 360 px of the map width; 992 px of viewport width remains unobscured. Header fields fit but are densely segmented. | Keep 88 px rail and map size; use temporary flyout; remove the 51 px row. Group command-bar fields without hiding lineage/state. |
| 1280×800 | Drawer 345.6 px, 51 px tool row, 808 px toolbar. Unobscured map width 846 px. Text starts to ellipsize. | Same desktop model; no widening to compensate for navigation. |
| 1024×768 | Drawer 320 px, tool row 51 px, toolbar 552 px. Unobscured map width 616 px. The ≤1120 CSS rule hides the brand subtitle, RF scalar summary, and local-save text; header fields compress. | Use one compact RF summary and grouped identity; flyout overlays instead of pushing map. |
| 768×1024 | Still the desktop vertical rail; 320 px drawer leaves 360 px of viewport map width uncovered. Toolbar is only 296 px wide. The 641–900 CSS rule hides result summary and RF scalar/local-save text. | Use a touch-sized click popover. Do not require hover. Keep map visible and expose active tool in drawer header. |
| 390×844 | 52 px top bar, 64 px bottom stage bar, full-width bottom drawer at 70vh (about 591 px), 59 px tool row, tool-row scroll width 513 px, and a 340×201 px wrapped map toolbar. Only about 137 px of map height remains unobscured above the drawer. Document width does not overflow, but command-bar content visibly overlaps and status becomes a colored dot. | Bottom stage bar stays. Tapping a stage opens a tool-selection sheet in the existing drawer footprint; selecting a tool shows that tool. Preserve basic map inspection, selection, primary action, lineage, and result state with no horizontal overflow. |

Reuse the existing 1120/900/640 CSS behavior boundaries where they fit; the brief’s reporting bands are evidence ranges, not a request for arbitrary new breakpoints. The exact responsive contract is in docs/concept-8a-responsive-analysis.json.

Current accessibility positives: named Workspace stages and tool navigation; visible stage and tool labels; aria-current; accessible Project menu and lineage summary; labeled tool drawer; focus placed on the drawer heading when it opens; a skip link to the planning map; named map controls; Escape handling for the layer menu; 44 px minimum map controls and tool-row buttons on phone.

Current concerns to carry into 8B: the stage button’s aria-expanded currently reflects active state even though it has no expansion; the rail and tool row have no custom arrow-key model; the dialog is intentionally non-modal; available tool choices use aria-disabled so they remain focusable; the tool row hides its horizontal scrollbar; and closing the drawer attempts to focus the unmounted active tool-tab button. The new flyout must use accurate aria-haspopup/aria-expanded state, labeled tool choices and reasons, complete keyboard/touch access, Escape close, and reliable focus return. The result/currentness text must remain readable at phone width instead of collapsing to a dot or overlapping.

For a first-time technical user, Plan/Simulate/Analyze/Review are understandable and should remain. A vertical list of up to four named tools is more discoverable than four clipped horizontal buttons. The flyout must show all sibling names and availability. For an expert, same-stage tab switching is currently one activation and the flyout adds an activation when closed; this should be tested directly. Keep the map and preserve direct destinations so experts do not pay the flyout cost for programmatic workflows.

## Selected 8B decisions

1. **Navigation:** implement the rail flyout in docs/concept-8a-navigation-options.json. It is a temporary chooser; it does not resize the map, route, or change the drawer architecture.
2. **Command bar:** group into Workspace (Project/Scenario/Version/draft), RF context (mode/cell count/technology/frequency, with power/radius detail), Status (operation plus required result freshness/source), and one primary action. Keep Project, Scenario, Version, and result state immediately visible. Move detailed metrics into Results and active-layer legend.
3. **Drawer:** retain current one-tool header and content. Remove the permanent sibling row only after tool flyout availability/attention state and sibling discovery are verified.
4. **Primary action:** preserve current Run Sector/Evaluate Network labels, disabled/readiness behavior, and Plan/Simulate visibility. Keep analysis/experiment/reference/report actions in their tool.
5. **Research:** keep capability label, scientific source, unsupported/currentness state, and one method safety statement. Move internal IDs and duplicate taxonomy badges into Details / Provenance.
6. **Map toolbar:** defer restructuring to 8C.
7. **Map legend:** retain scientific interpretation and active-layer source.
8. **Architecture:** reuse the current metadata and app-owned navigation state; no global store, plugin model, RF changes, or new design system.

Before/after hierarchy:

~~~text
BEFORE (all simultaneously visible)
Command bar → stage rail → drawer title → persistent sibling tabs
→ capability disclosure → controls
Map toolbar + legend + result-source cues remain over the map.

AFTER (8B)
Grouped command bar → stage rail + temporary stage-owned tool chooser
→ one active tool title → capability disclosure → controls
Map toolbar + scientific legend remain over the map.
~~~

## 8B implementation risks and invariance

The main risks are active-tool state regressions; direct destination actions starting to require user navigation; lazy chunks being preloaded by a menu; inaccessible flyout focus/escape behavior; mobile chooser overlap; unavailable tools disappearing without a reason; losing lineage or CURRENT/STALE/HISTORICAL/UNAVAILABLE/UNSUPPORTED state while compressing the bar; and layout regressions that reduce the map. The mitigations and exact checks are in docs/concept-8a-implementation-risk.json and docs/concept-8a-8b-test-plan.json.

8B is navigation/chrome only. RF requests, optimizer behavior, fingerprints, Project/Scenario state, Run and Report semantics, result freshness, scientific terms, existing lazy chunks, local-first storage, and Planning/Advanced/Research disclosure meaning remain invariant. Navigation state remains UI-only. No styling overhaul is part of this audit.

## Concept 8B recommendation

Proceed with one focused implementation: replace the persistent tool-tab row with the selected rail flyout; keep the single-tool drawer; compress the command bar into the four named groups while retaining immediate lineage and result freshness; and add regression coverage for every tool, direct destination, availability state, keyboard path, lazy boundary, and requested viewport. Keep map-toolbar restructuring out of 8B and evaluate it separately as Concept 8C.

## Artifact index

- docs/concept-8a-navigation-chrome-audit.md — this evidence-based decision report.
- docs/concept-8a-pre-change-baseline.json — starting state, viewports, screenshots, geometry, and result-state captures.
- docs/concept-8a-ui-layer-inventory.json — persistent and transient UI layers.
- docs/concept-8a-navigation-depth.json — level taxonomy and paths to tools/details.
- docs/concept-8a-tool-map.json — exact stages, tools, availability, and lazy boundaries.
- docs/concept-8a-command-bar-inventory.json — observed items and recommended priorities.
- docs/concept-8a-navigation-options.json — options, keyboard models, map contract, and switching costs.
- docs/concept-8a-responsive-analysis.json — measurements and behavior from 1440 to 390 px.
- docs/concept-8a-redundancy-audit.json — duplicated stage/tool/result/research/draft signals.
- docs/concept-8a-implementation-risk.json — 8B risks and mitigations.
- docs/concept-8a-8b-test-plan.json — implementation regression plan; tests were not run during this audit.
- docs/concept-8a-decision.json — canonical selected decisions and invariance contract.
- docs/concept-8a-wireframes.md — desktop and narrow textual wireframes.
