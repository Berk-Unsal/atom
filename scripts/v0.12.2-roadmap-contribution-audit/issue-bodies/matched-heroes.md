## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

The docs landing page uses focused-workspace.jpg for light mode and v0.12.0/network-workspace.png for dark mode. Inspection confirms different navigation generations, map extents and Cell selections. Claim reconciliation explicitly deferred this mismatch.

## Scope

Capture a matched pair from the current real app with the same public planning state, map extent, selected Cells and viewport. Wire the pair into the existing theme previews, with accurate alt text and capture provenance.

## Acceptance criteria

- [ ] Both theme images show the same current workspace/state and identify source version, viewport and public dataset/configuration.
- [ ] Images are actual app captures, not synthetic or repainted screenshots; do not invent successful RF output.
- [ ] Landing-page light/dark alt text and fixture paths match the assets; desktop/mobile theme tests and docs asset/link checks pass.
- [ ] Existing historical gallery and qualification images remain intact.

## Non-goals

No UI redesign, image deduplication campaign, RF change, new scientific evidence claim or rewrite of historical screenshots.

## Evidence / references

- [docs/index.html:L97](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/index.html#L97)
- [frontend-react/e2e/docs-theme.spec.js:L53](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/e2e/docs-theme.spec.js#L53)
- [docs/v0.12.1-claim-reconciliation.md:L31](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/v0.12.1-claim-reconciliation.md#L31)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **beginner-safe**. Rough effort: **S** (planning estimate, not a promise). Priority: **P3**.

docs/index.html, docs/assets/ and e2e/docs-theme.spec.js are the bounded surface. Run the app using documented Docker/LFS setup, capture the same state in both appearances, then run the theme tests. No RF expertise is required.
