## Context

Real layouts usually add a site with several sectors. The glossary (#80) defines site versus Cell, but the inventory supports only individual Cells.

## Problem

Adding a three-sector site takes three **Place new Cell** actions plus position and azimuth edits per Cell. Co-located Cells cannot be moved or edited together.

## Scope

**Class B — bounded semantic change** (inventory and schema grouping). MVP:

- **Place site** creates N co-located Cells (default 3 at 0/120/240°) that share position and move together; each remains an ordinary Cell in every request.
- Group membership is an optional field in the inventory and project schema; ungrouping restores independent Cells.

## Acceptance criteria

- [ ] Placing a site creates N Cells with the chosen azimuths; RF requests contain N ordinary Cells (request-equivalence test).
- [ ] Moving the group moves all members; editing one member's RF profile does not change the others unless explicitly applied to the group.
- [ ] Projects with groups round-trip through export/import; older files without groups import unchanged.
- [ ] Copy follows the glossary and makes no feasibility, ownership or cost claim.

## Non-goals

No shared-antenna or co-siting physics, no mast-height optimization, no site cost, ownership or permitting.

## Evidence / references

- [frontend-react/src/components/InventoryPanel.jsx](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/InventoryPanel.jsx)
- [frontend-react/src/domain/inventory.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/domain/inventory.js)
- [docs/terminology.md](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/docs/terminology.md)
- [docs/project-format.md](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/docs/project-format.md)

## Dependencies

None.

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **M** (planning estimate, not a promise). Priority: **P3**. Semantic/scientific risk: **bounded — schema grouping; must not imply physical site feasibility**.
