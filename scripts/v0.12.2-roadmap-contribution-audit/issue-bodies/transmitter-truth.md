## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

The pilot has zero exact mappings to the planning pack. OpenCellID-derived points and configured RF defaults do not establish the actual sector, position, conducted power/reference plane, height, orientation or antenna response.

## Scope

Scientific question: can a permitted reference transmitter or operator-provided source support exact identity mapping and an auditable RF link budget? Obtain or assess an authoritative evidence package with field-level provenance and uncertainty. Known evidence is the transmitter-reconciliation/truth audit; all source-specific TX parameters are currently missing.

## Acceptance criteria

- [ ] The source has explicit usage/privacy rights and exact PLMN plus Cell/sector mapping; nearest-tower or strongest-signal matching is never substituted.
- [ ] Position, antenna height/azimuth/tilt, conducted TX power and reference plane, gain/pattern, system/polarization assumptions, frequency and channel are each known with provenance or explicitly block validation.
- [ ] A sanitized mapping/field-completeness decision is reviewed against the existing transmitter-map contract and rejects ambiguous identities.
- [ ] No public issue contains precise private sites/raw routes or confidential operator data; missing truth produces a recorded no-go rather than guessed defaults.

## Non-goals

No general operator inventory product, proximity mapper, vendor-pattern importer, guessed TX values, RF extension, campaign collection or calibration promotion.

## Evidence / references

- [docs/concept-6a1-1-real-pilot-ingestion.md:L78](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-1-real-pilot-ingestion.md#L78)
- [docs/concept-6a1-1-transmitter-truth.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-1-transmitter-truth.json#L1)
- [docs/concept-6a1-1-transmitter-reconciliation.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-1-transmitter-reconciliation.json#L1)
- [backend-go/raytracer/concept_6a1_campaign_tooling.go:L452](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/raytracer/concept_6a1_campaign_tooling.go#L452)

## Dependencies

None in this backlog.

External/evidence blocker: Authoritative identity and transmitter RF/source evidence is unavailable.

## Contributor notes

Suitability: **research-heavy**. Rough effort: **RESEARCH** (planning estimate, not a promise). Priority: **P1**.

Maintainer-owned scientific/data-provenance work. Source access is an external prerequisite; existing transmitter-map validation supplies the deterministic contract. Coordinate with serving-semantics for final observation binding, but source acquisition can be assessed independently.
