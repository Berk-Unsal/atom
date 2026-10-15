## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

Results shows a score /100 and defines Pareto mostly as non-dominated. Priorities already have objective help, but the decision surface does not explain that the score is a preference-weighted utility rather than coverage percentage or measured accuracy.

## Scope

Add brief accessible help beside evaluation scores and Alternative solutions: weighted normalized utility, objective directions, a plain-language trade-off example, and the distinction between inspecting, reranking retained alternatives and rerunning search. Explain that network optimization changes azimuths while other configured RF/site inputs stay fixed.

## Acceptance criteria

- [ ] A novice can explain /100 without calling it percentage coverage, measured accuracy or a probability.
- [ ] A small illustrative two-option example explains why neither alternative dominates the other and why priorities change the recommendation.
- [ ] Help distinguishes retained-frontier reranking, inspection, explicit apply and a new search; inspection sends no new RF work.
- [ ] Existing raw compatibility fields and score/search behavior are unchanged; relevant App workflow tests cover accessible help and no hidden RF requests.

## Non-goals

No scoring equations, Pareto/search policies, thresholds, API fields, navigation redesign or global-optimum claim.

## Evidence / references

- [frontend-react/src/App.jsx:L4790](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/App.jsx#L4790)
- [frontend-react/src/App.jsx:L5135](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/App.jsx#L5135)
- [frontend-react/src/components/OptimizationGoalsPanel.jsx:L34](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/components/OptimizationGoalsPanel.jsx#L34)
- [docs/modeling-limits.md:L125](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/modeling-limits.md#L125)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **contributor-friendly**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**.

Use App.jsx Results/Pareto components and App.workflow.test.jsx; optimizationConfig.js is the semantics reference. No RF-model change is required; maintainer checks the wording.
