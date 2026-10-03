# Concept 8H — Visual system consolidation

Concept 8H makes the existing A.T.O.M workspace read as one product. It consolidates presentation and exposes the existing Run/Evaluate action throughout the workspace. Plan, Simulate, Analyze, and Review retain their tools and responsibilities. Concepts 8C, 8E, 8F, and 8G retain their interaction semantics. Concept 6A/6A.1 remains frozen.

## Starting point

Baseline: clean `main`, commit `ed7268f25a9faa4d1c76d6043a3b213147eada00`, version `0.9.3`. The baseline passed 321 unit tests, lint, production build, and 109 browser tests; 91 browser cases were intentionally skipped. This JavaScript project has no separate type-check command. The existing large-chunk build warning was present before this work.

The CSS inventory found 42 font-size values, 15 weights, 16 radius declarations, 16 shadow declarations, and 29 gap declarations. Repeated historical concept styles, separate panel header implementations, and competing document/workflow statuses were the main causes. Other confirmed issues included disappearing primary actions, wrapping result tabs, native stage tooltips over open flyouts, warning-colored helper text, and detached selection numbers.

## Foundations

The existing `:root` token layer now defines six type roles: panel title 18px/700, section heading 14px/600, control value 14px/500, label 13px/600, body/helper 13px/400, and metadata 12px/500. Sizes use rem; the root remains 100% so browser font preferences work. No local Inter font existed, so the deliberate UI font is the system sans stack. No remote font is loaded.

Spacing uses 4, 8, 12, 16, 20, 24, and 32px. Compact/form/primary/segmented controls use 32/36/40/52px minimum heights, with 44px phone targets. Radii use 4/6/8px and round; flush sections retain zero radius. One subtle elevation serves floating menus. Cards, regular panels, and primary actions have no elevation. Selection underlines are a state cue rather than elevation.

Technical values, numeric inputs, counts, source metadata, and RF context use tabular numerals. Ordinary prose does not. Primary, secondary, tertiary, disabled, warning, error, and selected/action text pairs have explicit contrast evidence in [design tokens](concept-8h-design-tokens.json). These tested pairs exceed 4.5:1. This is a role audit, not a claim of exhaustive WCAG certification or raster-map contrast measurement.

## Header and actions

The header reserves one primary-action column at every tool. A.T.O.M remains readable; its secondary expansion uses “Telecom planning” on ordinary desktops and the full expansion on wide displays. RF context is compact, with power and radius in the existing details popover. Narrow layouts reduce secondary metadata while retaining workflow status and the primary action.

“Unsaved” is neutral document metadata, with complete Project/Scenario/Version/draft provenance still in the accessible summary and popover. “Run needed” is the prominent teal workflow state when the live workspace has no result. Existing busy, error, and stale predicates are retained; stale results remain clearly identified. Result existence and draft existence no longer create rail notification dots. Genuine actionable warnings remain.

The shared action uses the existing `startMapCellSelection`, `evaluateNetwork`, or `runSimulation` callback and readiness checks. During incompatible special map modes, incomplete-network selection stays visible and disabled. Invalid profiles show “Resolve setup issues” with the existing invalid-profile gate. No request builder or calculation has changed.

RF Results empty states use this same callback and disabled flag. Optimization offers “Open Propagation”; Interference offers the existing Interference tool when network prerequisites are met, otherwise Setup. Header and panel buttons are two entrances to one action, without duplicated execution logic.

## Menus and panels

`StageMenu` supplies one desktop flyout wrapper and `StageToolChoices` supplies the same rows to desktop and mobile choosers. All flyouts share placement, width, row geometry, icon alignment, type hierarchy, and disabled explanations. Stage click toggles the chooser; another stage switches it. Escape restores focus, outside click dismisses, and Arrow Up/Down/Home/End navigates choices. Unavailable items remain focusable for their explanation and cannot dispatch a tool action.

Rail tooltips are suppressed whenever any chooser is open. Native stage titles were removed so the browser cannot display a competing tooltip. Flyouts anchor to one rail position regardless of active stage or drawer state. Map zoom and toolbar chrome clear the open flyout.

`PanelHeader` unifies tool-drawer, mobile chooser, and contextual inspector titles, supporting text, leading affordances, and close controls. Existing inspector back/restore behavior and tool draft state are retained. Inventory, Scenario, Run History, and empty-result presentation use fewer nested frames. Metric labels use sentence case and the shared label weight.

Results retain RF, Optimization, Interference, Compare, and Candidates/Solutions in their existing order and ownership. `ResultTabs` uses a single horizontally scrollable row, roving focus, Arrow Left/Right/Home/End navigation, and nearest scrolling for the selected category. Analyze launches computations; Review inspects retained outputs.

## Setup and controls

Planning-mode and technology selectors share geometry, selected fill, and underline treatment. The visible “6G research” label fits the same selector as 4G and 5G; its full accessible label and applicability remain unchanged. Native selects retain native keyboard behavior with a consistent chevron, font, background, and padding. Native number stepping remains available.

Conducted TX power retains its existing 0–60 dBm input bounds and adds factual support text. Selected-network information is separated into a label, “N of 6 cells selected,” and “Minimum 2 · Maximum 6.” Informational model guidance uses neutral helper text. Advanced and Research disclosure defaults, availability, and ownership remain unchanged.

## Map presentation

Only the OSM tile pane receives `saturate(0.62) contrast(0.94) brightness(1.03)`. RF rays, signal surfaces, building overlays, and metric palettes are unaffected. Roads, parks, district labels, and geographic context remain readable. Selection polygon fill decreases from 0.15 to 0.055 and uses the selection orange rather than warning styling.

`cellMarkerPresentation` is a pure presentation helper. Available Cells use smaller, softer circles with zoom-aware radii. A transparent interactive circle retains the original click footprint independently of the visible radius. Selected Cells use an orange outline and pale fill, with the order number centered at their true geographic coordinate. Active Cells have an independent teal outer ring, including when selected. Inspection has a solid slate ring; Map Focus has a dashed neutral ring. These states compose without replacing one another. The existing drag target remains transparent over the visible active marker, retaining its handlers and hit area.

The key shows the same smaller available circle, centered selected order number, active ring, active+selected combination, solid inspection ring, and dashed Map Focus. State meaning is communicated through shape, line style, numbering, and text as well as color. Existing signal and interference legends are retained.

## Verification and evidence

See [test evidence](concept-8h-test-evidence.json), [post-change comparison](concept-8h-post-change-comparison.json), [visual audit](concept-8h-visual-audit.json), and [before/after visual comparison](concept-8h-visual-comparison.md).

The dedicated evidence fixture captures 24 matching before/after states. Before images use the baseline production build; after images use the changed UI. Both use the same deterministic 42-Cell fixture, local RF response fixtures, cached OSM tiles, stable loaded-tile opacity, and disabled capture animations. RF screenshots illustrate presentation, not new scientific validation.

Added regressions cover menu interactions and tooltip suppression, actionable badges, persistent primary actions, shared empty actions, non-wrapping tab navigation, integrated order markers, combined active+selected states, accessible toolbar labels, and exact exported plan/viewport/context equality after menu-only navigation. Existing request-equivalence, stale-result, Scenario/Run/Report, RF diagnostics, optimizer, Inventory, and inspector suites are also exercised.

Protected source trees and package metadata are compared to the baseline by SHA-256, including LFS content OIDs. RF engines, optimizer implementations, domain objects, request builders, execution hooks, schemas, IndexedDB stores, fingerprints, report artifacts, and dataset sources remain unchanged. Source equality and existing frontend contracts are the invariance evidence; no new RF experiment or Go simulation is claimed. Backend tests are not required by repository policy for this frontend-only change and were not rerun.

## Boundaries and freeze

There are no new dependencies or font requests. The existing large initial JavaScript chunk warning remains. No dark theme, new information architecture, new tool, map clustering algorithm, or scientific feature is introduced. Truly co-located selected Cells retain the same geographic coordinate and can still overlap; no presentation offset changes their location or selection order.

Once the recorded validation and visual review pass, Concept 8H can be frozen. The next product step is user acceptance review of the comparison set and normal release preparation. No next UX concept or RF research is started by this work.
