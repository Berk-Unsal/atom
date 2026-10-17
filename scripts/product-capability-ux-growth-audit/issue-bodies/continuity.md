## Context

Local-first persistence is a core product promise. Inputs are restored on reload, but results are not, and the resulting states read as data loss even though Run history still holds the runs.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- Run Sector, then reload: inputs are restored; the status is **"Run needed"**; no result context is shown.
- Run Sector, **Save version**, then reload: the command bar shows **"Ready · UNAVAILABLE · Run unavailable"** and the Map key shows `UNAVAILABLE`. The run is still listed in Run history as "Working draft · No saved Version", because runs made before the save stay bound to the draft. App reports "The restored result has no unambiguous retained Run."

## Scope

Technical foundation required. Design first, then implement:

- On restore, rebind the latest **exactly compatible** run summary (matching input and scenario fingerprints) and present it as HISTORICAL, with an explicit **Restore map layers** action that performs a counted RF run.
- When saving a Version whose inputs exactly match a just-completed draft run, record that run as the Version's source run.
- Never show "Ready" together with "UNAVAILABLE".

## Acceptance criteria

- [ ] After reload, Results shows the last compatible run summary with correct freshness, or an explicit explanation of why none applies.
- [ ] Saving a Version immediately after a run binds that run when fingerprints match; mismatches never bind (unit tests).
- [ ] Restoring map layers is an explicit user action and is the only RF request on restore (no-hidden-request test).
- [ ] The command bar never combines "Ready" with "UNAVAILABLE".
- [ ] Persistence round-trip e2e: run → save → reload → result context intact.

## Non-goals

No persistence of full ray GeoJSON by default, no project file format change, no relaxation of fingerprint matching.

## Evidence / references

- [frontend-react/src/App.jsx:L2640-L2648](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2640-L2648) — unambiguous-run rule
- [frontend-react/src/hooks/useProjectWorkspace.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/hooks/useProjectWorkspace.js)
- [frontend-react/src/repository/runHistoryRepository.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/repository/runHistoryRepository.js)
- [frontend-react/src/domain/resultContext.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/domain/resultContext.js)
- [docs/concept-7c-run-history.md](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/docs/concept-7c-run-history.md) — retention policy

## Dependencies

Agree on the run-to-Version binding rule with the Pareto-apply issue (#101).

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **M** (planning estimate, not a promise). Priority: **P1**. Semantic/scientific risk: **medium — result binding semantics; fingerprints must stay exact**.

Prioritized P1 for trust, grouped NEXT because it needs a short design decision on binding and retention first.
