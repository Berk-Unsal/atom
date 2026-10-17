## Context

The first result most users see is the pre-selected sector at 28 GHz. Its metrics are correct but uninterpreted, so it reads as a failure. Network results already have score help (closed #76); the single-sector RF view has none.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

Default result: **Blocked 99.2%**, **Average Rx −185.5 dBm**, Max range 400 m, Min range 8.5 m, directly above a **Coverage Gaps** card showing 0 underserved buildings, 0.0% gap ratio and 0 unmet demand. With 4G LTE the same sector is 84.2% blocked. Nothing explains that *blocked rays* (geometry obstruction along sampled rays) and *coverage gaps* (demand buildings inside the sector below the service threshold) measure different things, so the two read as contradictory.

## Scope

- Add one short, deterministic interpretation line above the RF metrics, built from existing result fields, that distinguishes ray blockage from demand coverage gaps and states the receiver threshold used.
- Add an accessible "About these metrics" disclosure, matching the existing score-help pattern, defining Blocked, Average Rx (over sampled rays), usable range and coverage gaps.
- Wording must follow `docs/modeling-limits.md`: planning estimate, no quality grade or accuracy claim.

## Acceptance criteria

- [ ] With the default sector, a novice can tell from the screen why 99% blocked and 0 gaps are not contradictory.
- [ ] Interpretation text is generated from existing fields only and covered by unit tests for blocked/unblocked, gaps/no-gaps and unavailable values.
- [ ] The disclosure is keyboard operable and does not trigger RF requests (workflow test).
- [ ] Maintainer approves the wording against the modeling-limits page.

## Non-goals

No change to RF metrics, thresholds, averaging or defaults. No pass/fail or quality grading. No changes to network score help.

## Evidence / references

- [frontend-react/src/App.jsx:L4470-L4488](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4470-L4488) — RF metric list
- [frontend-react/src/App.jsx:L5698-L5740](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L5698-L5740) — Coverage gap panel
- [frontend-react/src/components/OptimizationHelp.jsx](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/OptimizationHelp.jsx) — existing help pattern
- [docs/modeling-limits.md](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/docs/modeling-limits.md)

## Dependencies

None. The metric-presentation polish issue edits the same panel; either can land first.

## Contributor notes

Suitability: **help wanted**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **low — wording must not imply quality thresholds or accuracy; maintainer reviews copy**.
