## Context

Measurement Validation (import up to 5,000 RSRP samples, evaluate residuals and holdout evidence, and explicitly apply a global bias correction) is a documented feature whose apply action changes the canonical plan. The field-validation research in #87–#90 will make it more important, not less.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026.

- The CSV workflow sits inside a collapsed **Research / reference** disclosure in Review → Data, although it is a supported workflow with an explicit canonical action.
- Analyze → RF Diagnostics hosts a different campaign-file tool whose region is labeled "RF diagnostics and measurement validation". Two different tools share the measurement-validation name.

## Scope

- Move CSV Measurement Validation out of the Research disclosure into its own first-class section of Review → Data. Do not add a rail tool.
- Rename or relabel the RF Diagnostics campaign tool so it is clearly research campaign evidence, distinct from CSV Measurement Validation.
- Keep all boundary copy, the six-Cell limit disclosure and the explicit apply confirmation.

## Acceptance criteria

- [ ] CSV Measurement Validation is reachable in two actions from the rail without expanding a Research disclosure.
- [ ] No two tools or regions share the name "measurement validation".
- [ ] Boundary copy, scope limits, explicit apply and invalidation behavior are unchanged (existing tests pass; workflow test updated for the new location).

## Non-goals

No change to calibration math, eligibility, holdout rules or limits. No new rail tool. No claim of real-world accuracy.

## Evidence / references

- [frontend-react/src/App.jsx:L5554-L5575](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L5554-L5575)
- [frontend-react/src/components/MeasurementValidationPanel.jsx:L83-L84](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/MeasurementValidationPanel.jsx#L83-L84)
- [frontend-react/src/features/rf-diagnostics/RFDiagnosticsResearchFeature.jsx](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/features/rf-diagnostics/RFDiagnosticsResearchFeature.jsx)
- [docs/features.md](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/docs/features.md) — Measurement Validation section

## Dependencies

None. Research context: #87, #88, #89, #90 (unchanged by this issue).

## Contributor notes

Suitability: **help wanted**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none — placement and naming only**.
