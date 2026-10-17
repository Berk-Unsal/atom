## Context

Planners are often asked whether a plan serves a specific district, not the whole footprint. A.T.O.M already draws bounded polygons for selection and candidate search, but KPIs are network-wide only.

## Problem

Network results report served demand weight, residential buildings and overlap for the whole evaluated domain. The drawn polygon is used only to select Cells or to restrict candidate search; it cannot scope KPIs.

## Scope

**Class B — bounded semantic change** (aggregation only). MVP:

- Allow one bounded area of interest (reusing existing polygon limits) on network evaluation and optimization summaries.
- Report served demand weight, residential buildings served and overlap inside the area, next to network-wide values, and in reports.
- Backend: an optional `aoi` filter on summary aggregation; no change to the evaluated domain or scoring.

## Acceptance criteria

- [ ] With an area set, Results shows inside-area KPIs beside network-wide KPIs; without one, nothing changes.
- [ ] Inside-area values are a subset aggregation of the same per-building results (tests with fixtures where the area covers all, none and part of the domain).
- [ ] The polygon is validated with existing vertex and size bounds; OpenAPI documents the optional field.
- [ ] Optimization objectives and scores are unchanged by the area.

## Non-goals

No area-driven optimization objective, no multiple areas, no imported GIS boundaries or general GIS editing.

## Evidence / references

- [frontend-react/src/App.jsx:L2034-L2058](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2034-L2058) — existing polygon
- [backend-go/raytracer/static_simulation.go:L155-L170](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/backend-go/raytracer/static_simulation.go#L155-L170) — aggregate stats
- Closed #16 — polygon complexity bounds

## Dependencies

None (benefits from #107 for side-by-side display).

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **M** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **bounded — aggregation of existing results only**.
