## Context

Reports and project files are how planning evidence leaves A.T.O.M. A reviewer who does not run the app sees only the downloaded file. #81 documents how to read a report; this issue fixes what the files themselves contain and are called.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- A Markdown report downloads as **`f079b4f3-b688-4148-9fc3-5289e4c1523a.md`** (the report ID). Project export is always `<project-slug>.atom-project.json`, so repeated exports collide.
- The single-sector report repeats the same table as **RF Result** and **RF Propagation Performance**. Its executive "RF result" table contains only "Constraints: Not configured".
- About 600 lines (82 KB) of inline SVG map paths are embedded in the Markdown, and many Markdown viewers do not render inline SVG.
- The Report source card showed "No saved Version", while the stored Report generated seconds later shows "Sector plan 1 · Version 1 · Runs: None" with a HISTORICAL source badge.

## Scope

- Filenames: `<project>-<scenario>-v<N>-<yyyymmdd>[-<kind>].<ext>` with safe slugs (omit missing parts); keep the report ID in metadata.
- Remove duplicated report sections; omit constraint rows when no constraints are configured.
- In Markdown, reference the map as a separate attachment or link to the HTML report instead of embedding the full SVG; the HTML report keeps the map.
- Make the stored Report's lineage line come from the same metadata the Report source card uses.

## Acceptance criteria

- [ ] Report and project downloads have deterministic, filesystem-safe names including project, scenario/Version (when present) and date; e2e asserts the pattern instead of only `.md`.
- [ ] Snapshot tests show no duplicated tables in single-cell and network reports.
- [ ] Markdown output for the sample single-sector plan has no embedded SVG path data; HTML output still contains the map.
- [ ] The Report source card and the stored Report list identical Scenario/Version/Run lineage for the same artifact.

## Non-goals

No new report calculations, claims or sections. No archive or bundle mode (tracked separately). No artifact ID or storage changes.

## Evidence / references

- [frontend-react/src/utils/reportArtifact.js:L20-L33](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/reportArtifact.js#L20-L33)
- [frontend-react/src/domain/report.js:L63](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/domain/report.js#L63)
- [frontend-react/src/components/WorkspaceChrome.jsx:L240](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/WorkspaceChrome.jsx#L240)
- [frontend-react/src/utils/reportExport.js:L575](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/reportExport.js#L575) / [frontend-react/src/utils/reportExport.js:L665](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/reportExport.js#L665) — duplicated sections
- [frontend-react/src/utils/reportExport.js:L1775](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/reportExport.js#L1775) — inline SVG
- [frontend-react/e2e/workspace.spec.js:L1863](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/e2e/workspace.spec.js#L1863) — filename test checks only `.md`

## Dependencies

Complements #81 (documentation). No blocking dependency.

## Contributor notes

Suitability: **help wanted**. Rough effort: **S–M** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **low — keep existing limitations and provenance text verbatim**.

Filename work alone is a good first PR.
