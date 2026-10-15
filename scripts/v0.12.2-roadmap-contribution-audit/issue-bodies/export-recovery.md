## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

ProjectMenu catches export/import exceptions and displays only error.message. The current note explains retained evidence, but a size/node guard failure gives no next safe action. Large ray-bearing exports can hit the unchanged guards at six or eight Cells.

## Scope

Add contextual recovery help for known project-budget failures and a link to the portable-format limits. Explain how to preserve an available report and current local project, and distinguish reduced future scenarios from archival export. Verify any suggested action actually works in the current UI.

## Acceptance criteria

- [ ] Known encoded-size, decoded-size and node/depth budget errors show specific recovery guidance; unknown errors retain their original message.
- [ ] Guidance names browser-local state and separately downloaded reports accurately; it does not promise that a report is a full editable backup.
- [ ] Failure preserves the active project, retained evidence and file contents and triggers no RF retry or automatic deletion.
- [ ] Deterministic ProjectMenu interaction tests inject budget failures and assert the guidance, preserved data and no download on failure; existing project reliability tests still pass.

## Non-goals

Do not raise guards, change schemas, trim scientific data, implement a new archive/export mode or automatically delete Scenarios.

## Evidence / references

- [frontend-react/src/components/WorkspaceChrome.jsx:L211](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/components/WorkspaceChrome.jsx#L211)
- [frontend-react/src/utils/projectStore.js:L260](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/utils/projectStore.js#L260)
- [docs/project-format.md:L33](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/project-format.md#L33)
- [docs/eight-cell-product-cap-promotion.md:L25](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/eight-cell-product-cap-promotion.md#L25)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **contributor-friendly**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**.

WorkspaceChrome.jsx ProjectMenu owns the message; projectStore.js and projectRayColumns.js own guards. Use existing projectFileReliability.test.js and App.workflow.test.jsx patterns. RF expertise is unnecessary.
