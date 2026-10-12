# Concept 8C — Map Interaction & Visualization Chrome

## Product boundary

Concept 8C consolidates map controls around four distinct jobs: map interaction, result visualization, view context, and interpretation. The task drawer still owns configuration; the right inspector still owns read-only entity detail. This is a UI-only phase layered on the pre-existing 8B.1/8D/8E worktree.

## Interaction model

The ordinary map choice is **Inspect | Select cells**. Inspect opens the read-only inspector and never changes plan state. Select cells retains the existing Network cluster edit semantics and never opens the inspector automatically. The old pointer-shaped affordance was the area-drawing action, not a second generic Select mode; the action is now named and represented with a lasso, and appears only for Network selection.

Draw area, Place cell, and Pick receiver replace the ordinary mode controls while armed. Each states what the next map click does. Area drawing offers Finish and Cancel; placement and receiver-picking offer Cancel. They remain owned by Setup/Network selection, Inventory, and Path Profile respectively. Clearing the cluster is an immediate edit, not an erase mode. Fit selected cells changes only the map viewport.

Network selection keeps its existing constraints: at least two cells are required to evaluate, and six cells is the maximum cluster size. Setup owns the selected count and minimum/maximum explanation. Its selection entry action changes into the active status while the mode is armed. At 900px and below, Setup closes after that action to expose the map; reopening Setup still reports the active mode rather than offering a duplicate entry action. The command bar says **Select cells** while incomplete and idle, suppresses a duplicate action while selection or a special tool is active, and says **Evaluate Network** once ready. Transient selection status uses a live region and expires after five seconds.

## Visualization and View

Signal and Rays remain quick toggles. The ambiguous RF category label is replaced by a named Result visualization group. When interference data exists, SINR, RSRP, and RSRQ appear in one native **Radio-quality metric** selector. The selector is absent when those values are unavailable.

Scope and Map Focus sit together in **View**. Scope values are All cells, Map Focus cell, and Hidden; they filter displayed rays and do not represent Network membership. Map Focus remains visualization emphasis and the ray reference cell. Choosing a new Map Focus does not open the inspector. **Inspect focused cell** appears only when a Map Focus Cell exists and is not already inspected. The inspector omits a no-op Focus action for an already-focused Cell.

**Layers** remains a separate, adjacent disclosure. The **Map key** stays an interpretation region, preserving current source/freshness, threshold, and sample-range content. On mobile, View contains labelled visualization and view-context groups while Layers stays independent.

## Popup, legend, and responsive decisions

The detailed Cell popup was removed because its identity, active-transmitter, cluster, and focus facts duplicated the inspector and its old “click to add” hint conflicted with explicit mode ownership. Detailed gap and recommendation popups were also redundant with their inspectors. Communication paths retain only the compact interface-family tooltip (Xn-C / Xn-U or fallback N2 via AMF); repeated route details are not duplicated. Cell identity remains available from the inspector and marker state.

The toolbar shifts/resizes with the existing inspector layout. At 1920 and 1600 the panels push the map; at 1440 the toolbar and legend stop at the inspector's left edge; at 1280 and 1024 the inspector uses the existing single-panel layout; at 768 and 390 one bottom sheet remains in charge. The Map key collapses at narrow widths with the inspector open. At 390, while View is open, the Map key and Leaflet zoom controls are temporarily hidden because their rectangles overlap the menu; they return when View closes.

| Viewport | Toolbar height | Inspector layout evidence | Result |
| ---: | ---: | --- | --- |
| 1920 | 44px | Push; 12px toolbar/legend gap before inspector | No measured overlap |
| 1600 | 44px | Push; 12px toolbar/legend gap before inspector | No measured overlap |
| 1440 | 44px | Overlay starts where toolbar and legend end | No measured overlap |
| 1280 | 44px | Existing single-panel inspector | No measured overlap |
| 1024 | 44px | Existing single-panel inspector | No measured overlap |
| 768 | 44px | One bottom sheet; Map key collapsed | No measured overlap |
| 390 | 42px | One bottom sheet; compact Interaction / View / Layers row | No horizontal overflow or measured overlap |

Exact geometry, menu state, and all capture paths are recorded in [responsive evidence](concept-8c-responsive-evidence.json). The phone Map key/zoom temporary hiding is asserted to restore after closing View.

## Accessibility and invariants

Ordinary modes use labelled buttons with pressed state and a non-color checkmark. Special tools announce active state, use explicit actions, and replace ordinary controls. View and phone Interaction disclosures expose expanded state, close on Escape/outside pointer, and return focus to their trigger. The controls that represent options remain native selects. The Map key disclosure uses a real hidden state for collapsed contents.

Map inspection, Map Focus, ray Scope, Signal/Rays visibility, View, and Layers do not change Scenario identity or start RF computation. Signal retains its existing explicitly requested lazy coverage-surface fetch. Select cells and other edits retain their existing plan mutation and freshness rules. Request equivalence, fingerprint tests, request counts, and RF/optimizer/backend regressions are recorded in [request invariance](concept-8c-request-invariance.json) and [test evidence](concept-8c-test-evidence.json).

## Evidence and limits

Before evidence reuses pre-8C Concept 8E inspector captures and the nearest prior 8B.1 setup capture in place; this avoids duplicate binary assets. It is useful prior-state evidence, but not a newly captured pixel-paired baseline for every toolbar state. Post-change evidence contains Inspect/View and Select-cells captures at all seven widths, desktop Setup/Layers/area/place/path-pick states, and phone interaction/edit actions. See [the source and after-capture index](concept-8c-post-change-comparison.json) and the captures under [after](assets/concept-8c/after/).

Automated accessibility-role, keyboard, focus-return, request-count, responsive, and visual-geometry checks passed. No manual screen-reader certification was performed. The full suite skips real-backend and project-gated E2E cases by design; those skip counts are explicit in the test evidence.

## Remaining product debt and next phase

The Concept 8D audit still identifies dense ownership boundaries in Setup's Scenario workspace, Inventory's list/editor, Analyze's research subviews, optimization priorities, Results, Run History, Data, Experiments, Building Entry, and Core Lab. Map marker density at city scale was audited only; no marker clustering was introduced. This work did not restructure those tools.

Recommend one follow-up: **Concept 8F — Tool Information Architecture & Density Cleanup**, starting with the largest mixed-role surface from the 8D audit: Plan > Scenarios extraction and a dedicated treatment for dense tool detail, then validate one tool family at a time. Keep RF behavior, result semantics, and map ownership outside that phase's UI cleanup boundary.

## Evidence index

- [Pre-change baseline](concept-8c-pre-change-baseline.json)
- [Map-control inventory](concept-8c-map-control-inventory.json)
- [Interaction contract](concept-8c-interaction-contract.json)
- [Visualization contract](concept-8c-visualization-contract.json)
- [Message ownership](concept-8c-message-ownership.json)
- [Focus and inspection](concept-8c-focus-inspection.json)
- [Accessibility evidence](concept-8c-accessibility-evidence.json)
- [Request invariance](concept-8c-request-invariance.json)
- [Test evidence](concept-8c-test-evidence.json)
- [Post-change comparison](concept-8c-post-change-comparison.json)
