## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

The report already contains an executive summary, baseline comparison, Pareto table, source lineage and limitations. User help mainly says export Markdown or printable PDF; it does not teach an outside reader to check historical/current source, missing analyses, ray sampling or integrity meaning.

## Scope

Add a bounded reader guide tied to the existing report sections. Explain source Scenario/Version/Run, evaluated versus recommended status, absent interference, map sampling, offline HTML/Markdown/PDF delivery and separate report/project retention.

## Acceptance criteria

- [ ] An annotated example or section map shows where to find assumptions, achieved metrics, baseline, alternatives and limitations without inventing new metrics.
- [ ] The guide explains historical/unsaved source context and that hashes verify artifact bytes rather than physical accuracy.
- [ ] It states map sampling and absent-analysis behavior and separates stored HTML/Markdown download from printing to PDF and portable project export.
- [ ] Steps are checked against existing report renderer/fixtures and linked from the current help; docs validation passes.

## Non-goals

No report renderer redesign, new report calculations, new archives, scientific claims or template-system implementation.

## Evidence / references

- [docs/getting-started.md:L184](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/getting-started.md#L184)
- [frontend-react/src/components/ReportArtifactsPanel.jsx:L51](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/components/ReportArtifactsPanel.jsx#L51)
- [frontend-react/src/utils/reportExport.js:L458](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/utils/reportExport.js#L458)
- [frontend-react/src/utils/reportExport.js:L713](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/utils/reportExport.js#L713)
- [frontend-react/src/utils/reportExport.test.js:L572](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/utils/reportExport.test.js#L572)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **beginner-safe**. Rough effort: **S** (planning estimate, not a promise). Priority: **P3**.

Use docs/getting-started.md/faq.md and existing reportExport fixtures as references. No RF code change or deep RF judgement is needed. Do not duplicate a new executive summary: it already exists.
