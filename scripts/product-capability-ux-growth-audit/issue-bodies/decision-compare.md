## Context

Defending a recommendation needs *where*, not only *how much*: which demand becomes served, which is lost, and where overlap changes. Today comparisons are aggregate KPI deltas only.

## Problem

Network evaluation and optimization responses return aggregate counts (`unique_demand_buildings`, `unique_residential_buildings`, `overlap_buildings`, scores) but no per-building served state, so the frontend cannot draw differences between two plans. Results → Compare shows numeric deltas only.

## Scope

**Class B — bounded semantic change** (API addition, no new physics). MVP:

- For two compatible network results with **identical dataset and model fingerprints**, show a map layer with demand buildings **newly served**, **newly lost** and **overlap changed**, with counts.
- Backend: a bounded, opt-in per-building served/overlap classification in network evaluation responses, or a deterministic comparison endpoint, within existing response and request budgets.
- Include the delta counts and a static map in the report comparison section.

## Acceptance criteria

- [ ] Delta classes are computed only when both results share dataset and model fingerprints; otherwise a clear incompatibility notice is shown.
- [ ] Per-building data is opt-in, bounded and covered by OpenAPI schema and response-bound tests.
- [ ] Delta counts reconcile exactly with the aggregate KPI deltas for the same pair (tests).
- [ ] The map layer has a legend and is reachable from the unified Compare view.

## Non-goals

No new RF physics, no cross-model or cross-dataset comparison, no SINR deltas in the MVP, no animation.

## Evidence / references

- [backend-go/raytracer/static_simulation.go:L155-L170](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/backend-go/raytracer/static_simulation.go#L155-L170) — aggregate network stats
- [backend-go/raytracer/static_simulation.go:L212-L223](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/backend-go/raytracer/static_simulation.go#L212-L223) — network response
- [frontend-react/src/App.jsx:L4545-L4549](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4545-L4549) — current Compare

## Dependencies

Depends on #107 (unified comparison surface).

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **L** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **bounded — API addition; must not alter served/overlap classification**.
