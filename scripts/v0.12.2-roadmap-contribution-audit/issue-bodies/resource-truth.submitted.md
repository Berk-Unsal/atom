## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

Pilot B7 rows have unavailable CellInfo bandwidth; ServiceState vectors cannot be assigned exactly to a candidate identity. RSRP cannot be relabeled as carrier power, and RSRQ/SINR/RSSI additionally lack a defensible resource/interferer context.

## Scope

Scientific question: which observed quantity/reference plane and identity/time-bound resource evidence permits a like-for-like comparison? Establish provenance for bandwidth, reference-signal/resource definition, frequency and neighbor/load context per intended KPI, or explicitly exclude unsupported quantities.

## Acceptance criteria

- [ ] Every accepted quantity has a documented measurement definition/reference plane, units, identity/time binding and uncertainty; unavailable sentinels remain missing.
- [ ] Bandwidth is independently assignable to the exact observation; channel/subscription proximity or configured planning defaults do not fill missing truth.
- [ ] The 2.665 versus canonical 2.600 GHz mismatch is resolved through a compatible evidence source or explicit no-go, without widening the frozen profile tolerance.
- [ ] RSRP, carrier power, RSRQ, SINR and RSSI eligibility is assessed separately; missing denominator/neighbor truth explicitly blocks affected KPIs.
- [ ] Publish only sanitized quantity-readiness decisions and reviewable positive/negative assignment examples.

## Non-goals

No invented bandwidth, signal-quantity conversion, new carrier model, canonical tolerance change, extra KPI accuracy claim or calibration.

## Evidence / references

- [docs/concept-6a1-1-bandwidth-audit.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-1-bandwidth-audit.json#L1)
- [docs/concept-6a1-1-applicability.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-1-applicability.json#L1)
- [docs/concept-6a1-readiness.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-readiness.json#L1)
- [backend-go/raytracer/concept_6a1_campaign_tooling.go:L1054](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/raytracer/concept_6a1_campaign_tooling.go#L1054)

## Dependencies

None in this backlog.

External/evidence blocker: Observation-bound bandwidth/resource/quantity evidence is missing; identity remains unresolved.

## Contributor notes

Suitability: **research-heavy**. Rough effort: **RESEARCH** (planning estimate, not a promise). Priority: **P1**.

Research-heavy measurement/RF semantics; not beginner work. Reuse current quantity-readiness and explicit resource ledgers. Serving and TX tasks establish final observation identity, while evidence-source assessment can proceed independently.
