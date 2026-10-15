## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

README and Getting Started now state the first planning question, but the shipped sample has no selected Cells, dataset binding or results. The four-step network guide leaves the user to choose a plan and infer what a useful comparison looks like.

## Scope

Document one small public Ankara planning question using explicit dataset identity, selectable records or a validated importable planning-only fixture, RF settings, priorities and a baseline. Walk through evaluate, optimize, one meaningful metric trade-off, save/apply and separate project/report downloads.

## Acceptance criteria

- [ ] A fresh clone with the documented public pack can reproduce the selected Cells and inputs without private data or guessed operator truth.
- [ ] The example records dataset/model version and distinguishes changed azimuths from fixed settings; it states the planning and unestablished-accuracy boundaries.
- [ ] The walkthrough explains a baseline delta and trade-off and ends with evidence a reviewer can reopen or read offline.
- [ ] Any new project fixture passes existing import/reliability checks; instructions are exercised once and generated docs/link validation passes. Numeric expectations are scoped to the recorded dataset/configuration.

## Non-goals

No new optimizer, onboarding wizard, deployment recommendation, larger network support or fabricated measured data. Preserve the legacy settings-only sample as a valid input-only example.

## Evidence / references

- [README.md:L25](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/README.md#L25)
- [docs/getting-started.md:L105](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/getting-started.md#L105)
- [examples/ankara-sample.atom-project.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/examples/ankara-sample.atom-project.json#L1)
- [frontend-react/src/utils/projectFileReliability.test.js:L146](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/utils/projectFileReliability.test.js#L146)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **contributor-friendly**. Rough effort: **M** (planning estimate, not a promise). Priority: **P2**.

Work in docs/getting-started.md and examples/. Follow existing project-schema tests; use a bounded two-to-four Cell example. Maintainer reviews interpretation of the planning result. This is an executable example, not a replacement first-use slogan.
