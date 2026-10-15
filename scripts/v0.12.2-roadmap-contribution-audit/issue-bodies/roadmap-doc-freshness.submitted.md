## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

planning/future_plans.md still calls tagged images, browser coverage and an additional pack release-completion work despite current release workflow/E2E/sample-pack evidence. docs/api.md says future versions will add webhooks and other capabilities without an admitted objective or milestone.

## Scope

Reconcile maintained roadmap rows with the released source and this evidence-backed issue backlog. Replace unconditional API future promises with supported current behavior or clearly gated candidates. Preserve dated historical research and qualification reports.

## Acceptance criteria

- [ ] Each maintained roadmap row is marked implemented, partial, blocked or deferred with current source/issue evidence; existing sample-pack and release/E2E work is not recreated.
- [ ] Measurement reference-set text distinguishes synthetic/tooling fixtures from a usable real field-validation dataset.
- [ ] API documentation makes no uncommitted webhook, terrain, custom-model or release promise; API contract version is kept distinct from application VERSION.
- [ ] Current docs build/classification/link checks pass and historical artifacts are unchanged.

## Non-goals

No v0.13.0 milestone or release commitment, qualification reopening, new APIs, new field measurements or implementation of listed ideas.

## Evidence / references

- [planning/future_plans.md:L21](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/planning/future_plans.md#L21)
- [docs/api.md:L1285](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/api.md#L1285)
- [backend-go/raytracer/testdata/sample-pack/manifest.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/raytracer/testdata/sample-pack/manifest.json#L1)
- [.github/workflows/release.yml:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/.github/workflows/release.yml#L1)
- [frontend-react/playwright.config.js:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/playwright.config.js#L1)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **contributor-friendly**. Rough effort: **S** (planning estimate, not a promise). Priority: **P3**.

Edit only current planning/future_plans.md and docs/api.md plus regenerated current docs as needed. Verify completion evidence rather than marking all broad rows complete. Maintainer reviews roadmap wording; no RF math changes.
