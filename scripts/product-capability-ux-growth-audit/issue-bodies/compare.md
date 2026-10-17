## Context

Comparing named planning claims is central to the Product Compass ("close the compare-to-decision loop") and is documented as implemented. In the main network workflow, though, users cannot reach it.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- **Results → Compare** shows *Baseline vs Recommended* whenever a network result exists, and shows saved-scenario A/B comparison only otherwise. A network planner with two saved Versions cannot reach the scenario comparison from Results.
- Input differences between Scenarios and Versions live in a third place: a collapsed **Compare Scenarios and Versions** disclosure in Plan → Scenarios.

## Scope

- Give Results → Compare a source picker for two states: current result, its optimization baseline, any saved Version, and the inspected Pareto alternative where available.
- Show KPI deltas (existing summaries), the input diff (existing `scenarioDiff`) and the A/B map switch in one view.
- Keep Baseline vs Recommended as the default pair after an optimization.

## Acceptance criteria

- [ ] With a network result present, a user can compare two saved Versions from Results (workflow test).
- [ ] Baseline vs Recommended remains the default after optimization.
- [ ] Input differences are visible in the same view; the Scenarios disclosure links to it or is removed without losing capability.
- [ ] Comparing states with different dataset or model identity shows a clear incompatibility notice instead of deltas.
- [ ] No RF requests are sent by selecting comparison sources (no-hidden-request test).

## Non-goals

No new metrics, no spatial delta layer (tracked separately), no new rail tool.

## Evidence / references

- [frontend-react/src/App.jsx:L4545-L4549](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4545-L4549) — Compare branches by result type
- [frontend-react/src/App.jsx:L4583-L4615](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4583-L4615) — scenario comparison
- [frontend-react/src/components/ScenarioPanel.jsx:L259-L262](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ScenarioPanel.jsx#L259-L262) — input diff
- [frontend-react/src/domain/scenarioDiff.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/domain/scenarioDiff.js)

## Dependencies

None.

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **M** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none if only existing summaries are compared**.

Needs a maintainer decision on picker layout in a 360 px drawer.
