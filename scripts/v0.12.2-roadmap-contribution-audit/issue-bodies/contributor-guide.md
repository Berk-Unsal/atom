## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

GitHub detects docs/contributing.md, but no root CONTRIBUTING.md or README contribution entry exists. The guide calls Vitest tests Jest, invokes golint, demonstrates nonexistent RF helper/import paths, prescribes editing main.go for releases, links absent community files, and recommends disabled Discussions and speculative RF priorities.

## Scope

Create a discoverable canonical contribution entry and repair the maintained guide against AGENTS.md, package scripts, CI and VERSION tooling. Include a small-change route from issue to files to focused checks, architecture/ownership boundaries, Docker/LFS prerequisites and current release process.

## Acceptance criteria

- [ ] README and a GitHub-recognized contribution entry lead to one maintained source without contradictory duplicate instructions.
- [ ] Fresh-clone Docker and frontend/backend development steps include LFS, readiness and correct working directories; documented snippets use real symbols/files or are explicitly pseudocode.
- [ ] The test matrix names Vitest, frontend lint/build/Playwright, Go vet/race, docs and version/policy checks, with focused-versus-full guidance matching CI.
- [ ] VERSION is canonical; contributor PRs use Unreleased rather than instructions to edit main.go or publish tags. Missing CoC/contributor promises are removed or linked only if real.
- [ ] Communication uses available Issues while Discussions is disabled; RF changes are routed to maintainer review and bounded newcomer work to the roadmap. Commands/links are checked and docs validation passes.

## Non-goals

No enabling Discussions, inventing CODEOWNERS/maintainers or community policy, adding RF models, changing CI gates, runtime upgrades or releasing software.

## Evidence / references

- [docs/contributing.md:L58](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/contributing.md#L58)
- [docs/contributing.md:L207](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/contributing.md#L207)
- [docs/contributing.md:L332](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/contributing.md#L332)
- [docs/contributing.md:L432](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/contributing.md#L432)
- [README.md:L210](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/README.md#L210)
- [AGENTS.md:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/AGENTS.md#L1)
- [.github/workflows/quality.yml:L45](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/.github/workflows/quality.yml#L45)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **contributor-friendly**. Rough effort: **M** (planning estimate, not a promise). Priority: **P2**.

docs/contributing.md, README.md, a root CONTRIBUTING.md and docs build mapping are the likely surfaces. This is editorial/tooling verification; do not change working production code to match stale examples. GitHub community-profile snapshot confirms the detected guide.
