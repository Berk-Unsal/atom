# Concept 8B — Navigation, Workspace Chrome & Information Density

**Status:** Implemented in the working tree on 2026-09-23. **Scope:** navigation and workspace chrome only. Concept 8C is deferred.

## Decision and starting point

Concept 8A selected the four existing stages (Plan, Simulate, Analyze, Review), the map-first layout, one active-tool drawer, and stage-owned temporary tool choice. This implementation removes the persistent sibling-tool strip from the drawer and groups the command bar as Workspace, RF context, Status, and Primary action. The map toolbar, RF behavior, routes, persistence model, and drawer capabilities stay outside the redesign.

The exact pre-change snapshot is [concept-8b-pre-change-baseline.json](concept-8b-pre-change-baseline.json). It records `fc81741771699da7af95fb20b846f893950585db`, `main`, version `0.9.0`, and the pre-existing four-viewport historical Run-source assertion failure. The user explicitly directed continuation after that gate. No pre-existing Concept 8A documentation or screenshots were reset.

The 8A reference remains authoritative: [navigation audit](concept-8a-navigation-chrome-audit.md), [decision](concept-8a-decision.json), [options](concept-8a-navigation-options.json), [responsive analysis](concept-8a-responsive-analysis.json), [implementation risk](concept-8a-implementation-risk.json), [test plan](concept-8a-8b-test-plan.json), and [wireframes](concept-8a-wireframes.md).

## Navigation behavior

`WORKSPACE_STAGES` and `WORKSPACE_TOOLS` remain the single metadata source for four stages and thirteen tools. The registry only adds short explanatory copy. Availability and attention stay in the existing App-owned `toolState`; menu metadata contains no loader or eligibility rules.

Each stage button opens or closes its tool chooser. Opening a chooser leaves `activeTool` unchanged. On desktop, a small dialog-like flyout overlays the rail/drawer edge and does not resize the map, rail, or drawer. On phones, the same stage list is rendered inside the existing bottom-sheet drawer. Selecting a tool sets its existing tool ID, closes the chooser, and displays the one active tool in the drawer. Selecting the current tool closes the chooser and keeps that tool open.

Each tool choice shows its name, a short description or dynamic state, and a non-color current marker. Existing unavailable reasons are rendered inline and exposed through `aria-describedby`; the choice remains focusable with `aria-disabled=true` and its click is guarded. Existing warning/result/count signals continue to feed the stage and tool indicators. First-time discovery is by opening one of four labeled stages; a stage exposes all of its 2–4 tools together.

Direct actions still call their existing destinations. The RF Diagnostics path-profile action opens Propagation and its existing Advanced control directly; current/stale result actions open Results; history/report actions retain their original destinations. They do not require the user to open a rail chooser first.

The chooser is a standard button/dialog interaction, not an ARIA menu. Stage buttons report `aria-haspopup=dialog`, truthful `aria-expanded`, and `aria-current=step`; active tools report `aria-current=page` and the visible word “Current.” Enter/Space use native button behavior. Escape closes the chooser and returns focus to its stage button; a pointer outside dismisses it without changing the tool. Closing a tool drawer returns focus to its owning stage. Phone choices have a 58px minimum height. See [accessibility evidence](concept-8b-accessibility-evidence.json).

## Command bar and identity

The command bar has four labeled `role=group` regions:

| Group | Persistent information | Progressive detail |
| --- | --- | --- |
| Workspace | Project, Scenario, Version/No Version, draft summary | Full lineage and browser-draft explanation in one disclosure |
| RF context | planning mode/cell count, technology, frequency | TX power, planning radius, model-limits link |
| Status | operation state and, when available, explicit result freshness plus short source Run | Full source and immutable provenance in Results |
| Primary action | Existing mode-aware Run Sector / Evaluate Network / readiness label on Setup, Inventory, and Propagation | Existing tool-local analysis actions stay in their tools |

When a draft differs from an immutable Version, the full workspace label remains “Unsaved changes”; the phone summary uses “Local draft” to fit. The workspace disclosure says the browser draft is stored locally and is not an immutable Version. With no named Version, the summary says “No Version.” The persistent status group reports saving and save failure; the idle local-draft state is part of Workspace identity.

The global result-metric card is removed. Results retains the RF, Optimization, Interference, Compare, and Candidates subviews; the map legend continues to retain its scientific layer metrics and result-source labeling. The compact command-bar result badge is a shortcut to Results and retains current/stale/historical/unavailable/unsupported state plus its source Run. `resolveRunFreshness` and `buildResultContext` were not changed.

## Presentation-only research cleanup

Repeated top-level “reference only” taxonomy and internal model identifiers were reduced in Material, Specular reflection, P1411, Sub-THz, and measurement-validation panels. Safety and limitation copy remains. Identifiers and section references remain available under “Details / Provenance”; the panels retain their existing `Research/reference` disclosure and do not enter canonical simulation requests.

## Responsive evidence

The responsive capture records viewport geometry, the four command groups, visible status text, the tool drawer, chooser, persistent-navigation count, and horizontal overflow. It also indexes the reviewable JPEG captures in `docs/assets/concept-8b/`.

| Viewport | Command bar | Drawer / chooser | Overflow |
| --- | ---: | --- | ---: |
| 1440 | 60px | Drawer 360px; active content begins 82px from drawer edge; flyout overlays | 0px |
| 1280 | 60px | Drawer 345.6px | 0px |
| 1024 | 60px | Drawer 320px | 0px |
| 768 | 64px | Drawer 320px | 0px |
| 390 | 78px | Bottom sheet 390×590.8px; chooser reuses the same sheet; active content begins 84px from sheet edge | 0px |

The phone capture verifies visible text for operation status and stale freshness/source Run, with their boxes separated. The page keeps its full 390px map surface behind an overlay sheet and the 64px bottom stage rail. The chooser reports all four Review tools in one vertical list.

See [responsive evidence](concept-8b-responsive-evidence.json) and the screenshot files named there. The captured setup, desktop flyout, tool drawers, current/stale results, and five target widths let reviewers compare states directly.

## Density and invariance

The old persistent tool strip consumed 51px under the 62px desktop drawer header and 59px under the 65px phone header. Removing it reclaims those row heights for tool content: the first tool content begins at 82px from the drawer origin at 1440 and 84px from the sheet origin at 390, with no `.tool-subnav`, `.tool-tabs`, or persistent sibling row in the DOM. The temporary chooser does not change map/drawer geometry.

The production build remains 12 JavaScript chunks. Compared with the 8B pre-change build, the initial JavaScript entry grows by 6.86KB raw / 1.93KB gzip, and the single CSS file grows by 10.26KB raw / 1.56KB gzip. The existing large-entry Vite warning remains. Lazy modules are still split and loaded only by their existing feature actions.

No Go, domain, request-equivalence, persistence/repository, orchestration-hook, router, or map-toolbar source was changed. The post-change test evidence records request-equivalence, current/stale/history, disclosure, lazy import, frontend, and backend validation. See [invariance](concept-8b-invariance.json), [lazy-loading evidence](concept-8b-lazy-loading-evidence.json), and [test evidence](concept-8b-test-evidence.json).

## Expert switching and next concept

A same-stage switch now takes one extra activation to open the chooser, then one to choose its sibling; the chooser closes after selection. This is a tolerable discovery-first cost for the current thirteen-tool map. Do not add recents, a command palette, or shortcuts in 8B. Observe repeated expert switching before considering them. The browser smoke followed Setup → Inventory → Propagation → Experiments, configured a two-cell Network plan, then Propagation → Interference → RF Diagnostics → Building entry → Results → Run history → Report. Interference is correctly unavailable until the Network setup is ready.

Remaining UX debt: long Project and Scenario names still ellipsize in the 390px summary, although the summary’s accessible name and its one-step lineage disclosure retain the complete values. The map toolbar remains visually dense and is partly behind the open phone sheet; both are candidates for the separate 8C review. The pre-existing historical Run source Version assertion remains unresolved as recorded in the final E2E evidence.

Concept 8B leaves the map toolbar’s structure and scientific controls unchanged. The phone screenshots still show the existing toolbar’s dense wrapped footprint, partly behind the open bottom sheet. Concept 8C — Map Toolbar & Spatial Controls Refinement — remains the appropriate focused follow-up for Signal/Rays, Scope, Focus, Layers, the interference metric selector, and phone wrapping. It is separate work and was not implemented here.

## Validation record

- Frontend unit/workflow suite: 55 files and 289 tests passed; ESLint passed; production build passed (1,705 modules, 12 JS chunks).
- Browser suite: 74 passed, 23 skipped, 3 failed out of 100. The only failing test is the same historical Run source Version attribution assertion recorded before 8B; it failed at 1440, 768, and 390px this run and passed at 1024px. The 8B changes do not modify that data path.
- The dedicated request-equivalence suite passed (3 tests). `go vet` and race-enabled Go tests passed in both Go modules.
- Reference generation passed with Pandoc deprecation warnings; the repository-locked PyYAML docs validator passed with 41 HTML pages and 41 API paths. JSON, screenshot index, version metadata, and `git diff --check` validation passed.

The exact command/output record is in [test evidence](concept-8b-test-evidence.json).

## Screenshot index

All screenshots are indexed in [responsive evidence](concept-8b-responsive-evidence.json), under `screenshotFiles`, and stored in `assets/concept-8b/`. The 390px current/stale states document the compact text treatment; the 1440 captures show setup, chooser, tool, Results, and research disclosure states.
