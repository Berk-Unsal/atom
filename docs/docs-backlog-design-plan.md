# Remaining public documentation issues

26 October 2026 · Baseline: `f073cac` · VERSION 0.13.0

This branch builds on draft PR #165, which already implements #78/#82. It does
not merge that PR or repeat its work. The current backlog and #148 comments were
read again before choosing this batch.

## Planned work

| Issue | Deliverable | Verification |
| --- | --- | --- |
| #86 | Replace the private Product Compass prerequisite, mark every maintained roadmap item implemented/partial/blocked/deferred with source evidence, distinguish API contract 1.0.0 from application VERSION, remove unconditional API promises, and document the actual 14 tools. | Compare current routes, workflow/tool definitions, sample-pack tests and field-readiness ledger; add current-doc regressions and rebuild reference pages. |
| #81 | Extend the existing report reader with source/retention/download steps; remove full-project/archive promises in onboarding; clarify missing analyses and source integrity. Correct the earlier walkthrough's reach-score units. | Check the renderer, report fixtures, download/print handlers and portable-project guards; run affected report/project tests and doc regressions. |
| #79 | Capture the same real public Ankara plan, viewport, selected Cells and map bounds in both themes. Record source identity, runtime, inputs and image hashes; wire both previews and alt text. Preserve historical assets. | Exercise the real backend and actual UI, compare recorded plan/map state before/after theme switching, inspect the pair, run desktop/mobile documentation-theme tests and asset/link checks. |

P1 #87–#90 need external RF evidence. Desktop production issues depend on the
unaccepted #148 compatibility gate; its remaining native GNOME Wayland dialog
check is not replaced by browser emulation. Research work is left aside as the
user requested. Once this batch is reviewable, reassess the remaining backlog
against current dependencies before declaring the broader goal complete.

No release, physics, API, persistence contract, native shell or historical
qualification artifact is changed by this plan.

## Execution record

- Implemented the three scoped documentation repairs, preserved historical images,
  and corrected the walkthrough's distance label without changing recorded values.
- The explicit capture workflow passed against the real Go API: two Cells, one
  evaluation plus two simulation follow-ups, matching map coordinates and no RF
  requests during theme switching. Both basemap styles returned successful tiles.
- Local checks passed: frontend lint, 735 Vitest tests, production build, 36
  documentation-theme Playwright checks across four viewports, 20 documentation
  tests, claim/link/OpenAPI checks and VERSION consistency. The new capture config
  also passes syntax and lint checks. Backend code is unchanged; the PR's normal
  CI remains responsible for its full backend/container matrix.
- Rechecked the 26 open issues and #148/#149/#147 dependencies on 26 October.
  #78/#82 are covered by #165; this follow-up covers #79/#81/#86. Remaining work
  is the gated desktop graph or explicitly blocked/deferred research. The missing
  native GNOME Wayland Open/Save evidence is not available from this macOS session.
- The design scan's pre-existing small-text findings remain outside #79's explicit
  no-redesign scope. Narrow local detector exceptions preserve the shared Inter
  font and dismiss the CTA hover contrast false positive, verified in the browser.
