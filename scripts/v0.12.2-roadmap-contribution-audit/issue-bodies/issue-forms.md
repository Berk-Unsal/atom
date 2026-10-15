## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

Neither the tracked .github tree nor GitHub community profile has an issue template. A useful planning bug needs model/dataset identity, supported workflow, expected/actual result and reproducible inputs; arbitrary screenshots or private campaigns are insufficient.

## Scope

Add lightweight bug and feature/research proposal forms that request the evidence appropriate to the problem, point to duplicate search and model limits, and keep private route data and credentials out of submissions.

## Acceptance criteria

- [ ] Bug form captures app version, dataset/model identity, workflow/technology, minimal steps, expected/actual and relevant safe logs; setup-only bugs do not require RF data.
- [ ] Proposal form asks which planning decision improves, evidence/prerequisites, bounded scope and non-goals.
- [ ] Forms explicitly discourage secrets, private campaign locations and raw routes, and direct scientifically uncertain work to maintainer review.
- [ ] Templates validate as GitHub issue-form YAML, use existing labels, and do not route users to disabled Discussions or require inaccessible private datasets.

## Non-goals

No auto-triage bots, permission changes, forced raw measurement upload, new support service or reopening resolved security findings.

## Evidence / references

- [.github/workflows/quality.yml:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/.github/workflows/quality.yml#L1)
- [docs/contributing.md:L7](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/contributing.md#L7)
- [planning/product-compass.md:L108](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/planning/product-compass.md#L108)
- [docs/modeling-limits.md:L131](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/modeling-limits.md#L131)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **contributor-friendly**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**.

Create .github/ISSUE_TEMPLATE/*.yml and optionally config.yml. Cross-check supported YAML syntax and existing issue labels; no deep RF implementation knowledge is required. No workflow automation is needed.
