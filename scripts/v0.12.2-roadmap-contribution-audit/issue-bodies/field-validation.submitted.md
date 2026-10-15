## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

Measurement tooling and synthetic fixtures exist, but current canonical real-pilot observations are zero and measured accuracy remains unestablished. Three independent evidence-source blockers need coordinated closure; more raw rows alone will not establish accuracy.

## Scope

Track the serving, transmitter and resource prerequisites plus the remaining compatible reference dataset, receiver characterization/AGL provenance, independent outdoor/LOS labels and declared-scope holdout evaluation. Scientific question: what uncalibrated held-out error can the released canonical model support under a fully evidenced scope? Known evidence is the retained readiness ledger and existing validation tooling; a qualifying reference set and endpoint truth are missing.

## Acceptance criteria

- [ ] Linked serving, transmitter and resource issues reach evidence-backed decisions; no-go decisions remain blockers rather than counting as successful validation.
- [ ] A licensed/public-safe compatible-frequency reference set has trustworthy serving identity, authoritative TX truth, receiver height/response provenance and independent outdoor/LOS annotations, with exclusions/counts retained.
- [ ] The study predeclares quantity, dataset/model identity, scope, spatial/site/campaign holdouts, uncertainty and handling of repeated/autocorrelated samples before examining residual improvements.
- [ ] Only after all gates pass, uncalibrated held-out residuals, subgroup counts, limitations and reproducible sanitized fixtures/report are published; no threshold/MAE target is invented from current missing evidence.
- [ ] Calibration remains a separate later study using independent holdouts; artifact hashes and synthetic tests are not presented as physical accuracy.

## Non-goals

No campaign scheduling or collection authorized by this audit, no forced salvage of the current pilot, no calibration implementation, 140 GHz promotion, new model or commercial-accuracy claim.

## Evidence / references

- [docs/concept-6a1-readiness.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-readiness.json#L1)
- [docs/concept-6a1-1-applicability.json:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a1-1-applicability.json#L1)
- [docs/concept-6a-canonical-rf-validation.md:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/concept-6a-canonical-rf-validation.md#L1)
- [backend-go/raytracer/canonical_rf_validation.go:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/raytracer/canonical_rf_validation.go#L1)
- [backend-go/raytracer/canonical_rf_validation_holdout.go:L1](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/raytracer/canonical_rf_validation_holdout.go#L1)

## Dependencies

- #87
- #88
- #89

External/evidence blocker: Depends on three evidence prerequisites and external receiver/outdoor/LOS compatible reference-set evidence.

## Contributor notes

Suitability: **maintainer-owned**. Rough effort: **RESEARCH** (planning estimate, not a promise). Priority: **P1**.

One tracking issue is justified by the independent evidence prerequisites; it owns final study readiness and receiver/LOS/reference-set evidence, not duplicate prerequisite research. Maintainer/RF review required. No raw private route data in GitHub.
