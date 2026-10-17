## Context

The map is the primary working surface (PRODUCT.md: map first). Overlays and header text currently collide at common desktop sizes, and one collision breaks area drawing.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026. Light and dark were checked at 1440×900, 1280×800 and 1024×768.

- **Map key swallows drawing clicks:** a selection-area vertex clicked over the expanded Map key is lost (a 4-point area became a triangle).
- With interference visible at 1440×900 the **SINR legend is clipped**, and the result-source chip truncates to "Working dr…".
- At **1280×800**, "28.0 GHz" **overprints "RF details"** in the command bar when a run chip is present.
- The **Results tab strip overflows at every width** (content 403 px; visible 335/321/295 px), clipping the fifth tab ("C…", "ptimization").
- Programmatic heading focus when a drawer opens draws a rectangle around the title that reads as an editable field.

## Scope

- Collapse or disable pointer capture on the Map key while drawing, placing a Cell or picking a path endpoint; let the legend scroll instead of clipping.
- Define truncation priority for command-bar segments so text never overlaps.
- Make Results tabs fit at ≥1280 px (shorter labels or an overflow affordance) without hiding a tab.
- Use a subtler focus treatment for programmatically focused headings while keeping visible keyboard focus on controls.
- Add Playwright screenshot baselines (light/dark × 1440/1280/1024) for first run, Results and Solutions to prevent regressions.

## Acceptance criteria

- [ ] Area vertices can be placed anywhere on the visible map while drawing (e2e).
- [ ] No text overlap in the command bar at 1280×800 and 1024×768 in either theme.
- [ ] All Results tabs are fully visible at ≥1280 px; at 1024 px every tab remains reachable.
- [ ] Legend content is scrollable rather than clipped when interference and received-power keys are both shown.
- [ ] Screenshot baselines are committed and stable in CI (basemap tiles disabled as in existing e2e fixtures).

## Non-goals

No visual redesign or token changes (Concept 8H system stays). No new map controls.

## Evidence / references

- [frontend-react/src/components/WorkspaceChrome.jsx:L1040](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/WorkspaceChrome.jsx#L1040) — MapLegend
- [frontend-react/src/components/ResultTabs.jsx:L3](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ResultTabs.jsx#L3)
- [frontend-react/src/components/WorkspaceChrome.jsx:L560-L564](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/WorkspaceChrome.jsx#L560-L564) — heading focus
- [frontend-react/src/App.jsx:L4444-L4450](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4444-L4450) — five result views

## Dependencies

None. If the candidate-recommendation issue changes the Results views, update baselines accordingly.

## Contributor notes

Suitability: **help wanted**. Rough effort: **S–M** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none**.
