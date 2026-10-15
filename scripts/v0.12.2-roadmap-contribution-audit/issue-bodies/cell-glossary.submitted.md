## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

UI labels use Cell, the API and active dataset use tower records, and candidates are known planning records. Getting Started says choose a tower while inventory uses Cells; no compact glossary explains that one physical site can contain several Cells or that a candidate record is not a verified site.

## Scope

Add a short linked terminology section to current user help, covering planning Cell/sector/site/tower record, co-location, dataset identity and candidate feasibility. Reuse existing model-limit definitions rather than introducing new RF semantics.

## Acceptance criteria

- [ ] A reader can distinguish a selected planning Cell from a physical site and understand multiple sectors at one location.
- [ ] Candidate records are explicitly not evidence of ownership, availability, permitting, cost or backhaul.
- [ ] Setup/Inventory and first-workflow documentation lead to the glossary; existing API names remain compatible.
- [ ] Current generated docs, navigation and link validation pass; maintainer reviews definitions against the existing model contract.

## Non-goals

No API/schema renames, physical inventory verification, RF equations or repository-wide historical terminology rewrite.

## Evidence / references

- [docs/getting-started.md:L109](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/getting-started.md#L109)
- [docs/modeling-limits.md:L59](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/modeling-limits.md#L59)
- [docs/modeling-limits.md:L70](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/modeling-limits.md#L70)
- [docs/features.md:L111](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/features.md#L111)
- [frontend-react/src/components/InventoryPanel.jsx:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/frontend-react/src/components/InventoryPanel.jsx#L1)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **beginner-safe**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**.

Start with docs/getting-started.md or docs/faq.md. Existing definitions and UI names supply the answer; deep RF knowledge is unnecessary. Build current references and run docs validation; do not edit historical audits.
