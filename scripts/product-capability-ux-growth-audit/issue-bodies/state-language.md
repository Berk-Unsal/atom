## Context

Result freshness (CURRENT / STALE / UNAVAILABLE) is one of A.T.O.M's trust mechanisms. When it fires for view-level changes and speaks in hashes, users learn to ignore it.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- Switching **Single → Network** immediately shows **STALE** with the map prompt "Result out of date — Optimization 3ca91dc3…eec14b came from its original input. Run again for this plan."
- Run identity leads with hashes in the command bar, Results context and Run history ("Optimization · f1a1e6d2…73ba08 · Working draft · No saved Version"), with no type summary, Cell count or headline metric.
- A scenario auto-named **"Sector plan 1"** keeps that name after becoming an 8-Cell network. For the same state the header says **"Version 1 Unsaved"** while Results says **"Sector plan 1 · No saved Version"**.

## Scope

- Classify invalidation reasons so that a plan-mode switch without input changes is presented neutrally (for example "Result belongs to Single-sector mode"), while genuine input changes keep STALE.
- Lead run labels with type · Cell count · headline metric · time; keep the hash in details.
- Use one vocabulary for Version state in the header, Results and Scenarios (saved Version vs draft with changes).
- Derive default scenario names from the plan at first save without silently renaming existing scenarios.

## Acceptance criteria

- [ ] A mode switch with no input change does not show STALE; any input change still does (unit tests for reason classification).
- [ ] Run history entries and the command-bar chip show type, Cell count and a headline metric; hashes remain available in details.
- [ ] Header, Results and Scenarios use identical wording for the same Version state (workflow test).
- [ ] New default scenario names reflect plan mode; existing names are never changed automatically.

## Non-goals

Must not hide genuine staleness or weaken fingerprint checks. No persistence schema change. No change to which results are retained.

## Evidence / references

- [frontend-react/src/App.jsx:L1982-L1990](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L1982-L1990) — mode change invalidates results
- [frontend-react/src/App.jsx:L2765-L2777](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2765-L2777) — stale prompt
- [frontend-react/src/App.jsx:L4088-L4091](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L4088-L4091) — hash run label
- [frontend-react/src/components/RunHistoryPanel.jsx](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/RunHistoryPanel.jsx)
- [frontend-react/src/components/ResultContextBadge.jsx](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ResultContextBadge.jsx)

## Dependencies

None. Coordinate with the result-continuity issue, which also changes how restored freshness is shown.

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **S–M** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **low — state presentation; invalidation rules need maintainer sign-off**.
