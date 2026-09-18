# Concept 4I.2B — Applicability-Gated ITU-R P.1411-13 Candidate Models

Status: isolated scientific reference implementation, captured 2026-09-18.  
Source: [ITU-R P.1411-13 (2025-09)](https://www.itu.int/rec/R-REC-P.1411-13-202509-I/en), [official PDF](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1411-13-202509-I!!PDF-E.pdf).

The machine-readable artifacts are the [applicability contract](concept-4i2b-p1411-applicability.json), [independent controlled fixtures](concept-4i2b-controlled-fixtures.json), [side-by-side comparison](concept-4i2b-reference-comparison.json), and [pre-change runtime baseline](concept-4i2b-pre-change-baseline.json).

## Decision boundary

Concept 4I.2B adds a dedicated POST /api/sub-thz-p1411-reference endpoint and a propagation diagnostics panel. It implements only three non-canonical candidates from §4.1.1 Table 4. The evaluator is never called by simulate, coverage surfaces, coverage gaps, interference, radio quality, building entry, or either optimizer.

The result is a bounded P.1411 median/basic-transmission-loss reference. It does not claim a calibrated 140 GHz channel model, Ankara coverage, receiver serviceability, or canonical network support.

## Source and equation audit

P.1411-13 §4.1.1 defines the site-general model as:

~~~text
Lb(d,f) = 10 alpha log10(d) + beta + 10 gamma log10(f) dB
~~~

d is the 3D direct distance between terminals in metres and f is GHz. The production evaluator calculates that median only. The source's zero-mean Gaussian N(0, sigma) statistical variation is returned as sigma_db metadata; no random sample, fading realization, percentile, or automatic margin is generated.

The exact P.1411 rows implemented are:

| Candidate | Table 4 row | Frequency | General distance | 140 GHz effective distance | Morphology | Roof relation | State | α | β | γ | σ |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: |
| p1411_below_rooftop_los_v1 | Urban high-rise, urban low-rise/suburban, LoS | 0.45–300 GHz | 5–660 m | 5–500 m | high-rise, low-rise, suburban | both below rooftop | LoS | 2.07 | 31.23 | 2.06 | 4.91 dB |
| p1411_urban_highrise_nlos_v1 | Urban high-rise, NLoS | 0.8–159 GHz | 20–715 m | 20–150 m | high-rise | both below rooftop | NLoS | 3.73 | 16.02 | 2.26 | 7.62 dB |
| p1411_urban_lowrise_nlos_v1 | Urban low-rise/suburban, NLoS | 0.45–255 GHz | 10–250 m | 10–150 m | low-rise, suburban | both below rooftop | NLoS | 4.52 | 6.04 | 2.14 | 8.02 dB |

The 140 GHz limits apply the Table 4 footnotes exactly: footnote (1) gives the LoS 500 m recommendation for 82 < f <= 159 GHz; footnote (2) gives high-rise NLoS 150 m for the same band; footnote (3) gives low-rise/suburban NLoS 150 m for 73 < f <= 159 GHz. A request outside the current row's effective envelope is returned as inapplicable with no path-loss value and no extrapolation.

The initial set deliberately excludes the Residential NLoS Table 4 row. Above-rooftop Table 8 rows are also excluded because their listed frequency ranges do not support this 140 GHz candidate set.

## Applicability gates and provenance

Every request carries frequency, flat Tx/Rx coordinates and heights, morphology, rooftop relation, LoS/NLoS state, and a provenance block. Supported provenance sources are user_declared, dataset_measured, dataset_derived, geometry_classifier, geometry_derived, and unknown.

The defaults are intentionally conservative:

- frequency and endpoint heights default to user_declared;
- 3D distance defaults to geometry_derived;
- morphology, rooftop relation, and LoS state default to unknown and therefore cannot produce an applicable candidate;
- the candidate requires explicit both_below_rooftop; antenna heights do not infer this relation;
- the existing 4F.1 classifier is not silently mapped to a P.1411 row;
- a user-declared research scenario is allowed, but its provenance is visible in the response.

The response exposes reason codes such as frequency_out_of_range, distance_out_of_range, morphology_mismatch, morphology_unknown, rooftop_relation_mismatch, rooftop_relation_unknown, los_state_mismatch, los_state_unknown, insufficient_scene_evidence, and unsupported_geometry.

## What the response contains

POST /api/sub-thz-p1411-reference returns all three candidates by default, or one requested candidate when candidate_model_id is selected. It includes:

- reference identity, revision, section, table, requested row, applicable row IDs, and a deterministic fingerprint;
- scene inputs, horizontal distance, 3D direct/slant distance, height delta, and provenance;
- general Table 4 bounds and current-frequency effective distance bounds;
- coefficients, equation, logarithmic intermediate terms, and median path loss only when applicable;
- sigma, distribution interpretation, random_sampling: false, and no hidden wall loss;
- exact wavelength-form P.525 FSPL at the same slant distance and P1411 - P525 excess only;
- building intersections plus known/unknown height evidence as audit context only;
- comparison-only summaries for the 4I.2A atmospheric reference and current research_sub_thz profile when explicitly requested;
- limitations and non-claims.

No candidate is labeled best, recommended, calibrated, or canonical. The panel intentionally shows candidates side by side.

## P.525 and double-counting boundary

P.525 FSPL is a comparison baseline, not an additive term. The API uses the wavelength identity 20 log10(4 pi d / lambda) with lambda = c / (f GHz × 1e9). The reported difference is:

~~~text
excess_relative_to_fspl_db = P1411_median_db - P525_fspl_db
~~~

The output does not add P.525 to P.1411. It also does not add the existing 80 dB research_sub_thz event heuristic, P.676 gas, P.838 rain, P.840 fog, P.526 diffraction, building-entry, material, receiver threshold, or radio-quality terms.

## Side-by-side alternatives

The 4I.2A sub_thz_atmospheric_reference_v1 ledger remains a separate explicit calculation. If requested, the response reports its P.525, P.676, P.838, and P.840 components and total as comparison_only; it never composes those values with the P.1411 median. Atmospheric inputs are not silently sent by the UI.

The current research_sub_thz profile remains the existing /api/simulate planning profile. Its optional side-by-side comparison can show FSPL + 80 dB × wall_event_count at 140 GHz, but that value is never added to P.1411. The comparison artifact records the P.1411 LoS candidate, atmospheric reference, research profile, and P.525 baseline independently.

P.526 remains the existing isolated knife-edge diagnostic. It is not invoked from this endpoint. The earlier 4I.1 survey remains the external sanity/transferability boundary, not a validation dataset.

## Independent 140 GHz fixtures

The controlled fixture artifact contains boundary cases and independently computed values. Representative medians are:

| Candidate | 10 m | 25 m | 100 m | 150 m | 400 m | 140 GHz effective max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Below-rooftop LoS | 96.140238 dB | 104.377596 dB | 116.840238 dB | — | 129.302879 dB | 500 m |
| Urban high-rise NLoS | — | — | 139.122494 dB | 145.690698 dB | — | 150 m |
| Urban low-rise/suburban NLoS | 97.167140 dB | 115.154028 dB | 142.367140 dB | 150.326465 dB | — | 150 m |

The out-of-envelope examples are LoS 501 m, high-rise NLoS 151 m, and low-rise/suburban NLoS 151 m. Frequency boundary examples include 0.45 GHz LoS, 0.8 GHz high-rise NLoS, 255 GHz low-rise/suburban NLoS, and 0.44/300.01 GHz rejected union boundaries.

## Ankara readiness

The current Ankara pack contains 161,784 building footprints and 451 towers. Height evidence is sparse: 1,108 observed tags (0.68%), 4,966 levels-derived (3.07%), 155,710 fallback-only (96.25%), and no unavailable records. Only 6,074 footprints (3.75%) have explicit or levels-derived height evidence. Fallback-only values are not roof evidence.

The existing Concept 4F.1 audit covers a deterministic sample of 6 cells × 72 rays at a 400 m radius: 432 reference paths, 25 m Tx, 1.5 m Rx, with terrain unavailable. The current data has no morphology taxonomy and no provable both-below-rooftop relation, so the automatic fully applicable count is reported as zero. The 432 paths are readiness evidence, not coverage or candidate-link validation. The artifact does not fabricate morphology-conditioned NLoS counts.

## External sanity and transferability boundary

The 4I.1 audit records peer-reviewed 100–200 GHz evidence including [Xing/Rappaport](https://arxiv.org/abs/2103.01151) at 140/142 GHz in a Brooklyn urban microcell, [Shakya et al.](https://doi.org/10.1109/TAP.2024.3366581) across 28/73/142 GHz, [De Beelde et al.](https://biblio.ugent.be/publication/01GQHEC5QMYV683Z0225CYYWVD) across 120–165 GHz D-band, [Sun et al.](https://www.mdpi.com/1424-8220/22/24/9734) across 138–163.2 GHz LOS, and [Ju et al.](https://arxiv.org/abs/2103.05496) on spatial consistency. These studies are useful sanity/transferability comparisons only. They do not calibrate the P.1411 row for Ankara and are not silently used by the evaluator.

## Validation and performance

The implementation adds unit and route tests for independent coefficient fixtures, frequency and distance boundaries, strict scenario/provenance gates, P.525 deltas, deterministic fingerprints, optional comparison isolation, unknown-height obstruction context, explicit optional atmospheric inputs, and route protection. It performs one bounded geometry evidence pass per request and does not alter the canonical ray/coverage/optimization hot paths.

The broader quality gate remains:

~~~text
cd backend-go && go vet ./... && go test -race ./...
cd core-lab-adapter && go vet ./... && go test -race ./...
cd frontend-react && npm test -- --run && npm run lint && npm run build
sh docs/build-reference-pages.sh
python3 docs/validate_docs.py
python3 scripts/versioning.py check
~~~

## Deferred 4I.3 work

Future work remains explicitly deferred: measurement-backed 100–200 GHz calibration and validation; site-specific morphology and rooftop evidence; weather/profile integration; spatial consistency and beam/antenna validation; optional P.2040 material/interface and P.526 studies; and any canonical 140 GHz coverage or radio-quality promotion. Those changes require a new evidence and invariance plan rather than a silent extension of Concept 4I.2B.
