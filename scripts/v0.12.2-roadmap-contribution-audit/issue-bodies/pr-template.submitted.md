## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

The repository and GitHub community profile have no PR template. AGENTS.md already requires impact, validation, issue links and UI screenshots, but new contributors do not get these prompts when opening a PR.

## Scope

Add a concise PR template that asks for the problem/result, linked issue, affected surfaces, exact checks run or skipped, screenshots for UI changes and relevant scientific/persistence/cap boundary changes.

## Acceptance criteria

- [ ] GitHub recognizes the template and prepopulates a new PR body.
- [ ] Prompts ask for concrete before/after behavior, issue reference and relevant validation commands/results, without requiring unrelated full suites for a typo.
- [ ] UI changes request screenshots; RF, scope, persistence or compatibility changes request explicit boundary explanation and maintainer review.
- [ ] Template matches AGENTS.md and VERSION/Unreleased policy, contains no fabricated validation checklist results and needs no CI/production change.

## Non-goals

No new merge policy, automatic approvals, CODEOWNERS, branch protection changes or CI automation.

## Evidence / references

- [AGENTS.md:L36](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/AGENTS.md#L36)
- [README.md:L223](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/README.md#L223)
- [.github/workflows/quality.yml:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/.github/workflows/quality.yml#L1)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **beginner-safe**. Rough effort: **XS** (planning estimate, not a promise). Priority: **P2**.

One file: .github/PULL_REQUEST_TEMPLATE.md. Read AGENTS.md and existing CI, then preview the Markdown and verify GitHub-recognized placement. No RF expertise or architecture prerequisite.
