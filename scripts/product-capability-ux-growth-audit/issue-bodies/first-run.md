## Context

The workspace opens with a clear primary action, but nothing says what A.T.O.M produces, and the network workflow — the product's main value — needs several unexplained steps. #78 is creating a reproducible, documented sample plan; this issue makes such a sample reachable from inside the product.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- First load shows the Setup drawer and **Run Sector**, with no statement of purpose or outcome.
- The bundled `examples/ankara-sample.atom-project.json` is reachable only by reading README and importing it through the project menu. The current sample is settings-only (no selected Cells or results), so on its own it does not produce a network result.

## Scope

- When no saved project exists, show a dismissible first-run card: one sentence on what A.T.O.M does, **Run the pre-selected sector**, **Open sample network project**, and a glossary link.
- Opening the sample creates a new project and never overwrites existing work.
- Use the validated planning fixture produced by #78 (selected Cells, dataset identity). Until it exists, the card can omit the sample action.

## Acceptance criteria

- [ ] The card appears only when no saved project exists; dismissal persists.
- [ ] Opening the sample creates a separate project; existing projects are unchanged (persistence test).
- [ ] From first load, a user reaches a network evaluation result in three actions or fewer using the sample.
- [ ] The sample passes existing import/reliability checks.

## Non-goals

No wizard, tour or modal sequence. No new optimizer behavior or fabricated measurements.

## Evidence / references

- [README.md:L180](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/README.md#L180)
- [examples/ankara-sample.atom-project.json](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/examples/ankara-sample.atom-project.json)
- [frontend-react/src/utils/projectFileReliability.test.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/projectFileReliability.test.js)

## Dependencies

Depends on #78 for a sample with selected Cells and dataset identity (the card and purpose sentence can land first).

## Contributor notes

Suitability: **help wanted**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none**.
