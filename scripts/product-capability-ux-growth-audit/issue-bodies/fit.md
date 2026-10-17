## Context

Run Sector, Evaluate Network, Optimize Network and Analyze Interference are the core planning actions. Each finishes quickly (0.2–6 s locally), but the user has to go looking for what changed, which weakens the first impression and every later iteration.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- After **Run Sector**, **Evaluate Network** or **Optimize Network** the map stays at the city-wide default zoom. Rays are a few pixels long and the only visible change is the command-bar `CURRENT Run …` chip. `fitRequestVersion` is only incremented by the icon-only **Fit selected cells** button.
- After drawing a selection area ("272 towers found, nearest 8 selected") the selected Cells are not brought into view.
- Even after **Fit selected cells**, a 400 m single-sector result occupies a small part of the map.
- After **Analyze Interference**, the Interference tool looks unchanged: no summary and no pointer to Review → Results → Interference, where the result is shown.

## Scope

- Request a map fit when a new **current** result is produced (sector run, network evaluation, network optimization) and when an area selection completes, framing the selected Cells plus their planning radius.
- Do not move the map if the user panned or zoomed after starting the action.
- Keep **Fit selected cells** as the manual control; consider a text label or tooltip that names it.
- After interference analysis, show a compact summary (for example serviceable share and affected demand, using existing result fields) and an **Open in Results** action in the Interference tool.

## Acceptance criteria

- [ ] Completing each of the three RF actions and an area selection triggers exactly one fit that contains the selected Cells and planning radius.
- [ ] No fit occurs when the user moved the map during the request, or for view-only actions (Signal/Rays toggles, ray scope, legend, inspection).
- [ ] Single-sector fit frames the planning radius rather than the city extent.
- [ ] The Interference tool shows an existing-metric summary and an Open in Results action after a successful analysis.
- [ ] Workflow tests cover fit requests per completed action and no fit or RF request for view-only toggles.

## Non-goals

No new map features, clustering, animation, zoom-limit changes or RF/request changes. No new interference metrics.

## Evidence / references

- [frontend-react/src/App.jsx:L2226-L2228](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2226-L2228) — fit only on button press
- [frontend-react/src/App.jsx:L263](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L263)
- [frontend-react/src/App.jsx:L2034-L2058](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2034-L2058) — area selection
- [frontend-react/src/components/ControlPanel.jsx:L263-L340](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ControlPanel.jsx#L263-L340) — Interference tool
- [frontend-react/src/App.jsx:L4533-L4537](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4533-L4537) — interference results only in Results

## Dependencies

None. Coordinate with the map-chrome layout issue if both touch the map toolbar.

## Contributor notes

Suitability: **help wanted**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none — presentation only**.

MapCanvas already consumes `fitRequestVersion`; most of the change is deciding when to request a fit.
