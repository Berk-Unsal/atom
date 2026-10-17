## Context

Small presentation defects on the result and selection surfaces undermine trust: units are mis-cased, empty results look like alarms, and the copy contradicts the Cell/site/tower glossary added in #80.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- `.metric-row strong` uses `text-transform: capitalize`, so `-185.5 dBm` renders as **-185.5 DBm** and `400.0 m` as **400.0 M** (which reads as mega). The accessibility tree has the correct text.
- The Coverage Gaps card uses red alert styling when there are 0 underserved buildings, and shows **Worst Rx 0.0 dBm** when no gap was returned.
- User-facing copy still says *tower* where a planning Cell is meant: "272 towers found, nearest 8 selected.", "No tower selected", "Select at least 2 towers…", "Tower GeoJSON could not be loaded", command bar "Cell No tower", and the Report intro "Export the selected tower…". The area-selection notice does not say what "nearest" means.

## Scope

- Remove the capitalize transform from metric values; keep labels styled as they are.
- Use neutral styling for the Coverage Gaps card when no gaps are returned, and show the unavailable placeholder instead of `0.0 dBm` for Worst Rx in that case.
- Replace user-facing *tower* with *Cell* where a planning Cell is meant (copy only).
- Make the area-selection notice state the rule (nearest to the drawn area's centre, up to the network limit) and how to change the selection.

## Acceptance criteria

- [ ] Metric values render units exactly as produced (`dBm`, `m`, `%`).
- [ ] A zero-gap result shows neutral styling and an unavailable Worst Rx; a non-zero result keeps the alert styling.
- [ ] No user-facing string uses *tower* where a planning Cell is meant; API fields and code identifiers are unchanged.
- [ ] Area-selection feedback states the selection rule when the area holds more Cells than the limit.
- [ ] Unit/workflow tests cover the copy and styling states; existing tests are updated rather than deleted.

## Non-goals

No renaming of API fields, data files or code identifiers. No change to the selection algorithm or the network limit. No restyling beyond the zero-gap state.

## Evidence / references

- [frontend-react/src/styles.css:L1157-L1162](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/styles.css#L1157-L1162)
- [frontend-react/src/App.jsx:L5698-L5740](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L5698-L5740)
- [frontend-react/src/App.jsx:L2034-L2058](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2034-L2058)
- [frontend-react/src/App.jsx:L515](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L515)
- [frontend-react/src/App.jsx:L961](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L961)
- [frontend-react/src/App.jsx:L1155](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L1155)
- [frontend-react/src/App.jsx:L2523](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2523)
- [frontend-react/src/features/reports/ReportFeature.jsx:L36-L39](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/features/reports/ReportFeature.jsx#L36-L39)
- [docs/terminology.md](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/docs/terminology.md)

## Dependencies

None. Glossary context: #80 (closed).

## Contributor notes

Suitability: **good first issue**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none — copy and styling only**.

Files: `styles.css`, `App.jsx` (CoverageGapPanel, selection notice, error strings), `ReportFeature.jsx`. Search tests for the old strings first. The work can be split into separate PRs.
