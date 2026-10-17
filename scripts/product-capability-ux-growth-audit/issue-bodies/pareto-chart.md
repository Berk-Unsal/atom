## Context

#96 explains what non-dominated alternatives mean. Choosing among them is still hard, because the frontier is presented only as a long list.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

An 8-Cell optimization returned **25** solution cards in Results → Solutions. Values are often near-identical ("Demand 28.3%" on every card), so the trade-off structure is invisible. Experiments already renders a Pareto SVG; network optimization does not.

## Scope

- Add a two-objective scatter of the retained frontier with user-selectable axes from the existing objectives, marking Recommended, Selected and Inspected.
- Selecting a point inspects that solution (no RF request).
- Collapse the list to the top N with a "show all" control.
- Reuse existing chart helpers where practical.

## Acceptance criteria

- [ ] The chart is keyboard operable and has a text alternative listing plotted solutions.
- [ ] Selecting a point inspects that solution without RF requests (workflow test).
- [ ] Plotted values come only from retained solution metrics; no new objectives or scoring.

## Non-goals

No change to Pareto computation, search policy, scoring or the number of retained solutions.

## Evidence / references

- [frontend-react/src/App.jsx:L4797](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4797) — ParetoSolutionsPanel
- [frontend-react/src/components/ExperimentPanel.jsx:L115-L121](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ExperimentPanel.jsx#L115-L121) — existing Pareto SVG
- [frontend-react/src/utils/comparisonCharts.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/comparisonCharts.js)

## Dependencies

None. Follow-up to #76 (closed by #96).

## Contributor notes

Suitability: **help wanted**. Rough effort: **M** (planning estimate, not a promise). Priority: **P3**. Semantic/scientific risk: **none**.
