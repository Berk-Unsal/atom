# Concept 8B.1 — Workspace Chrome Visual Polish

**Status:** implementation complete; final validation results are recorded below and in [`concept-8b1-test-evidence.json`](concept-8b1-test-evidence.json).

## Visual diagnosis

The 8B chooser worked as stage-owned navigation but looked like a small content panel: at 1440px it was 264px wide, Analyze and Review scrolled at 239px high, seven labels were truncated across Simulate/Analyze/Review, and Plan/Simulate chooser geometry intersected map controls. The chooser started 3.5px beyond the rail edge. At 1024px the one-line RF context overflowed into the status group. The drawer was already one-tool; its title and description needed a clearer hierarchy.

The most important correction was making each tool row behave and look like a full-width navigation row. Screenshot review exposed a CSS specificity conflict with the rail's generic button rule; that rule was scoped around, and the capture test now checks rendered row width/layout as well as scroll and truncation.

## Visual principles

The ten 8B.1 principles are preserved verbatim in [`concept-8b1-visual-principles.json`](concept-8b1-visual-principles.json): navigation reads as navigation; the map remains dominant; one tool has one obvious title; metadata is grouped; typography and spacing lead; status stays quiet but legible; scientific safety remains visible; provenance stays secondary; controls remain interactive; and empty space is allowed.

## Chooser and navigation

The 13 existing tools remain in Plan / Simulate / Analyze / Review with their original IDs, order, availability, callbacks, direct destinations, and one-drawer model. Normal rows show the icon and tool name without generic descriptions. Those descriptions remain in the selected drawer. Desktop chooser width is 244px (248px at 768px); rows are 48px. The phone keeps the existing full-width bottom sheet and 58px rows, without adding height or horizontal tabs.

At 1440px the Analyze/Review chooser height fell from 239px to 212px; all four stage choosers are attached to the rail, have no vertical scrollbar, and have no truncated names. Before polish, seven captured tool labels were truncated and the Analyze/Review choosers scrolled. All four desktop choosers now avoid the Leaflet zoom, selection toolbar, and Layers control rectangles.

- **Current tool:** subtle teal-tinted row, visible “Current” text, and `aria-current="page"`.
- **Unavailable tool:** remains in the chooser with `aria-disabled`, a concise visible reason, and the full reason available through `aria-describedby`.
- **Attention/result:** short “Attention” / “Result” labels; Run history retains its count (for example, “3 runs”). Screen-reader descriptions remain available.
- **Mobile chooser:** stays inside the existing sheet, uses vertically stacked rows, and keeps touch rows at 58px or more.

Evidence: [before Analyze](assets/concept-8b1/before/1440-chooser-analyze.jpg) · [after Analyze](assets/concept-8b1/after/1440-chooser-analyze.jpg) · [after phone chooser](assets/concept-8b1/after/390-chooser-review.jpg). The complete paired index is in the pre-change and post-change JSON files.

## Command bar and drawer

The four command-bar groups and their information remain intact. Workspace lineage is still visible, but the Scenario/Version/draft summary no longer reads as a separate bordered card. At wide widths RF mode/cell count, technology, frequency, and RF details remain one group with quiet separators. At 901–1120px RF values stack into two compact lines so the group no longer collides with status. Run/status/freshness remain textual and retain their semantic indicators. The primary Run/Evaluate button retains its visual priority.

RF details now use an “RF configuration” heading and aligned label/value columns; the same model-limit destination and qualification remain. The drawer title is stronger, and the subtitle wraps naturally rather than truncating. This increases the measured desktop header from 62px to 73.9px where the description wraps; the phone header stays 65px. No drawer section/disclosure behavior was changed.

Screenshot evidence: [before 1024](assets/concept-8b1/before/1024-setup.jpg) · [after 1024](assets/concept-8b1/after/1024-setup.jpg) · [RF details after](assets/concept-8b1/after/1440-rf-details.jpg).

## Chrome surfaces and copy

- The lineage identity has a transparent resting border; the RF summary uses separators instead of peer chips; chooser rows have no individual borders; and the Research profile label is plain text instead of an outlined chip.
- Tool-title, field-label, help, and status tones are more distinct. The restrained teal/green and neutral palette remains.
- Duplicate research/reference phrasing was removed. “Research profile” is the capability label, while the 140GHz non-canonical / non-production-calibrated warning and `UNSUPPORTED` radio-quality language remain visible.
- The model identifier remains available under Details, moved from the summary into the disclosure body.
- The map-plan prompt was made slightly narrower and quieter. Persistent “Result out of date” status and its explanatory transient toast remain distinct; no state timing or behavior changed.

## Results and map

Results structure, score/metric meaning, freshness, feasibility, solution settings, and explanations are unchanged. The Optimization view still presents result identity, score, objective impact, metrics, then configuration/explanation. The existing score, objective, and tabular metric groupings remain because they convey distinct data. No Results component was changed.

Chooser position and the 1024px RF context were corrected without moving map controls. Map toolbar controls, functions, and order remain unchanged; the measured map-control boxes are included in [`concept-8b1-chrome-geometry.json`](concept-8b1-chrome-geometry.json). Map legend source, thresholds, categories, and semantics are unchanged.

Evidence: [before optimization](assets/concept-8b1/before/1440-results-optimization.jpg) · [after optimization](assets/concept-8b1/after/1440-results-optimization.jpg) · [after stale result at 390px](assets/concept-8b1/after/390-results-stale.jpg).

## Responsive geometry

| Viewport | Command bar | Drawer | Chooser | Overflow / notes |
| --- | ---: | ---: | --- | --- |
| 1440 | 60px | 360px | 244px; max captured height 212px | No chooser scroll, truncation, or measured control overlap |
| 1280 | 60px | 345.6px | 244px | No horizontal overflow; chooser attached |
| 1024 | 60px | 320px | 244px | RF context stacks; no measured chooser/control overlap |
| 768 | 64px | 320px | 248px | No horizontal overflow; chooser attached, no scroll |
| 390 | 78px | 390px sheet | Existing 390px sheet | 0px document overflow; rows 58px; sheet content starts at 66px |

The map toolbar still partially sits behind the existing open mobile sheet. That geometry is present in the before capture and was intentionally not restructured in 8B.1. The responsive screenshot index and per-capture measurements are in [`concept-8b1-responsive-evidence.json`](concept-8b1-responsive-evidence.json).

## Accessibility and behavioral invariants

The selected state, unavailable reason, attention/result text, stage `aria-expanded`, visible focus, mobile row targets, disclosures, and reduced-motion behavior are documented in [`concept-8b1-accessibility-evidence.json`](concept-8b1-accessibility-evidence.json). The chooser animation remains brief and is disabled for `prefers-reduced-motion`; focus-visible outlines remain.

The source-diff audit is in [`concept-8b1-invariance.json`](concept-8b1-invariance.json). It records unchanged registry IDs, availability logic, destinations, lazy-loading boundaries, map toolbar/legend, request/RF/optimizer/fingerprint/Pareto behavior, ProjectV2, Run History, reports, APIs, persistence, and dependencies. The request-equivalence suite is run separately from the full frontend tests.

## Before/after evidence

Fresh deterministic captures contain 22 before and 22 after screenshots across 1440, 1280, 1024, 768, and 390px, including stage choosers, Setup, Propagation, RF details, RF Diagnostics, Optimization Results, current/stale state, and phone views. Raw geometry and screenshot paths are stored in [`concept-8b1-pre-change-baseline.json`](concept-8b1-pre-change-baseline.json) and [`concept-8b1-post-change-comparison.json`](concept-8b1-post-change-comparison.json). No aesthetic scores were assigned.

## Historical Version assertion

The earlier Concept 8B baseline records the historical Run source Version assertion failing at all four viewport sizes; the 8B post-change evidence records failures at 1440, 768, and 390px and a pass at 1024px. Immediately before 8B.1, the targeted assertion passed at all four viewports, and the targeted historical-Version assertion passed all four viewports serially. The final full E2E suite passed 77 tests with 27 declared skips. Two earlier parallel runs intermittently exposed Run History as “Working draft · No saved Version” in a cold-Report test; that lineage persistence behavior remains outside the visual scope and no lineage/domain code changed.

## Validation

Final results: frontend tests 55 files / 290 passed; lint passed; production build passed; full E2E 77 passed / 0 failed / 27 skipped across four responsive projects; request equivalence 3 passed; Go vet/race tests passed for both Go modules; reference-page generation and docs validation passed (41 HTML pages / 41 API paths); 9 JSON files parsed; version 0.9.0 is consistent; `git diff --check` passed. The production build retains 12 JS chunks; JS is 778,804 raw bytes / 221.09 KB Vite gzip and CSS is 164,880 raw bytes / 30.77 KB Vite gzip. Versus the 8B build, this is +533 JS raw bytes / +0.11 KB gzip and +2,271 CSS raw bytes / +0.32 KB gzip. Vite continues to warn that the initial JS chunk exceeds 500 kB. Exact commands and details are in [`concept-8b1-test-evidence.json`](concept-8b1-test-evidence.json).

## Remaining visual debt and Concept 8C

The map toolbar remains dense at phone widths and is partly behind the existing phone sheet; Signal/Rays, Scope/Focus, Layers, map editing, and zoom alignment remain candidates for 8C. The mobile Scenario/Version summary still uses compact truncation while its accessible name and disclosure retain the complete values. The map legend and all scientific thresholds remain intact. **Concept 8C is still justified for a separate map-chrome review; it is not implemented here.**

## Files changed

Product presentation: `frontend-react/src/components/WorkspaceChrome.jsx`, `frontend-react/src/components/ResearchReferenceBadge.jsx`, `frontend-react/src/App.jsx`, and `frontend-react/src/styles.css`. Tests/evidence capture: `frontend-react/src/components/WorkspaceChrome.test.jsx` and `frontend-react/e2e/workspace.spec.js`. Documentation and 44 JPEG evidence assets are under `docs/concept-8b1-*` and `docs/assets/concept-8b1/`.
