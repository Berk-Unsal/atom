## Context

Candidate recommendation (find one additional Cell from dataset records inside a drawn area) is an implemented, bounded and documented capability. It is effectively undiscoverable.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- Its only entry point is the fifth Results tab, **Candidates**. After any Pareto optimization the same tab becomes **Solutions** and the recommendation panel is no longer reachable.
- Prerequisites are 2–5 selected Cells **and** a drawn search area, but drawing an area auto-selects up to 8 Cells ("272 towers found, nearest 8 selected"), which immediately violates the 2–5 limit.
- At desktop widths the tab label itself is clipped ("C…").

## Scope

- Add an explicit **Find an additional Cell** action in Network mode, next to the existing network actions, with inline prerequisite status (Cell count 2–5, search area present, 4G/5G).
- Give recommendations a Results view that does not share a slot with Pareto Solutions.
- Allow keeping or drawing a search area without forcing the 8-Cell area selection (for example a separate "search area" mode).

## Acceptance criteria

- [ ] Recommendations are reachable before and after a network optimization (workflow test: optimize → recommend → apply as scenario).
- [ ] Prerequisites are shown before the action is attempted; unmet ones explain how to satisfy them.
- [ ] A user with 2–5 selected Cells can draw a search area without their selection being replaced.
- [ ] Candidate scoring and request payloads are unchanged (request-equivalence test).

## Non-goals

No change to candidate scoring, the 50-record prefilter, the five-option limit or the Recommendation5 cap. No interference in candidate scoring. No site-availability claims.

## Evidence / references

- [frontend-react/src/App.jsx:L4449](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4449) — tab label swaps
- [frontend-react/src/App.jsx:L4565-L4580](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4565-L4580) — panel replaced by Solutions
- [frontend-react/src/App.jsx:L2071-L2080](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2071-L2080) — prerequisites
- [frontend-react/src/App.jsx:L2043](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2043) — area selection keeps up to 8
- [frontend-react/src/App.jsx:L4617-L4637](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4617-L4637) — recommendation panel

## Dependencies

None. Results tab changes interact with the desktop collision issue (#105).

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **M** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none — presentation and selection-mode workflow only**.
