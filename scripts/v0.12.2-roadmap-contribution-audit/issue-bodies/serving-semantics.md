## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

The retained pilot parsed 53,005 rows but promoted zero canonical observations. All 83 registered candidates also say CONNECTION_NONE. Matching serving-change events do not settle that conflict; the latest semantics audit explicitly remains unresolved.

## Scope

Scientific question: which version-specific collector/device evidence can establish an authoritative serving identity when recorded fields conflict? Record the collector build/device scope, authoritative clarification and a deterministic decision table, or a documented no-go. Known evidence is the sanitized conflict/transition audit; missing evidence is source authority and build-specific behavior.

## Acceptance criteria

- [ ] An authoritative version/device-scoped explanation reconciles registered, connection status and event identity/derivation, including contradictory PS identity evidence; otherwise record why the source remains unusable and what new capture evidence would be necessary.
- [ ] A reviewed evidence matrix specifies accepted/rejected/ambiguous cases without strongest-signal, proximity or model-output inference.
- [ ] Any later proposed adapter behavior requires separate scoped implementation review with sanitized positive/negative fixtures; this research issue does not silently weaken current guards.
- [ ] The decision and provenance are public-safe, and canonical observation/calibration readiness stays false until all independent gates pass.

## Non-goals

No vendor contact is authorized by this issue creation; no parser fallback, private routes, new field campaign, canonical residuals, calibration or RF changes in this audit.

## Evidence / references

- [docs/concept-6a1-readiness.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-readiness.json#L1)
- [docs/concept-6a1-2-serving-state-semantics.md:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-2-serving-state-semantics.md#L1)
- [docs/concept-6a1-2-vendor-questions.md:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-2-vendor-questions.md#L1)
- [backend-go/raytracer/concept_6a1_campaign_tooling_test.go:L340](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/raytracer/concept_6a1_campaign_tooling_test.go#L340)

## Dependencies

None in this backlog.

External/evidence blocker: External version-specific collector/device source clarification is missing.

## Contributor notes

Suitability: **research-heavy**. Rough effort: **RESEARCH** (planning estimate, not a promise). Priority: **P1**.

Maintainer-owned research requiring collector/Android source understanding and external evidence. Use sanitized existing artifacts; do not publish raw recordings, Cell IDs or campaign locations. Prepared questions already exist; do not merely rewrite them as completion.
