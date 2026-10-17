## Context

Optimization now explains its score and alternatives (#96). Choosing a non-recommended alternative is the decision step the explanation exists for, but it only works if the user saved a Version *before* optimizing. Most users optimize directly in the working draft.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

Select 8 Cells → **Optimize Network** in the working draft → Results → Solutions → **Apply solution…**. The dialog says *"This solution is not bound to a retained source Version, so it cannot be applied safely"*, and both **Create new Version** and **Create branch** are disabled. No recovery step is shown, although App already has one ("Save a Scenario Version before applying…"). The UI never says that the *recommended* azimuths were already written into the working draft when optimization completed. The workflow test for apply saves a Version before optimizing, which is exactly the step users are not told to take.

## Scope

Bounded semantic change (lineage and persistence). Choose and implement one of the following:

1. **Save source and apply:** when the optimization run has no source Version, save a source Version from the run's retained exact input (refused unless its input fingerprint matches), then apply the chosen solution as a new Version or branch.
2. **Guided recovery:** if (1) is rejected, the dialog states the exact recovery steps and offers a Save version action, without silent re-optimization.

In both cases, the Solutions view states when the recommended solution is already in the working draft.

## Acceptance criteria

- [ ] From an unsaved-draft optimization, a user can adopt a non-recommended alternative with explicit confirmation and without re-running optimization (option 1), or is told exactly how to (option 2).
- [ ] The source run stays immutable; the created Version or branch records the solution and source run lineage.
- [ ] Apply is refused with a specific message when fingerprints do not match.
- [ ] Solutions view indicates when the recommended solution already matches the working draft.
- [ ] Workflow and persistence round-trip tests: optimize in draft → apply alternative → reload → lineage intact.

## Non-goals

No optimizer, scoring or Pareto changes. No automatic Version creation on every run. No change to project file format beyond existing Version and lineage fields.

## Evidence / references

- [frontend-react/src/components/ApplySolutionDialog.jsx:L13](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ApplySolutionDialog.jsx#L13)
- [frontend-react/src/components/ApplySolutionDialog.jsx:L55-L60](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ApplySolutionDialog.jsx#L55-L60)
- [frontend-react/src/App.jsx:L1217](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L1217) — recommended azimuths written to draft
- [frontend-react/src/App.jsx:L3136-L3150](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L3136-L3150) — existing recovery message
- [frontend-react/src/App.workflow.test.jsx:L857-L862](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.workflow.test.jsx#L857-L862) — test saves a Version before optimizing

## Dependencies

None. Related: the result-continuity issue also binds runs to Versions; agree on one binding rule.

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **M** (planning estimate, not a promise). Priority: **P1**. Semantic/scientific risk: **bounded — lineage semantics; no RF or optimizer change**.

Requires a maintainer decision between options 1 and 2 before implementation.
