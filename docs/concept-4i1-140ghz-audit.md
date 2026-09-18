# Concept 4I.1 — 140 GHz / Sub-THz Applicability Audit

Audit date: 2026-09-18  
Baseline commit: `d66ad902075402a2df8df413bec63e9a51059561`  
Decision: read-only scientific and architectural audit. No production RF equation, model dispatch, optimizer, or radio-quality behavior is changed.

The machine-readable evidence is kept beside this report:

- [pre-change baseline](concept-4i1-pre-change-140ghz-baseline.json)
- [reference applicability audit](concept-4i1-140ghz-applicability.json)
- [controlled atmospheric/material/FSPL/diffraction fixtures](concept-4i1-140ghz-controlled-fixtures.json)

## 1. Current `research_sub_thz` equation and heuristics

The runtime dispatch in [`propagation_model.go`](../backend-go/raytracer/propagation_model.go) selects `research_sub_thz` for `frequency_ghz >= 100`. Its applicability check only requires `100 <= f <= 300 GHz` and a positive finite distance. It returns `research_profile_only` and does not claim standards conformance.

The evaluator delegates to the legacy term helper:

```text
slant_distance = hypot(max(d_ground, 0), h_tx - h_rx)
FSPL_current = 20 log10(max(slant_distance, 1 m))
                + 20 log10(f_GHz) + 32.45
wall_loss = max(wall_event_count, 0) * penetration_loss(f)
penetration_loss(f >= 100 GHz) = 80 dB/event
total_path_loss = FSPL_current + wall_loss + antenna_pattern_attenuation
```

The link ledger then applies the existing antenna, system, polarization, calibration, and receiver terms. `research_sub_thz` does not calculate an empirical sub-THz path-loss exponent, gas, rain, cloud/fog, clutter, vegetation, material interaction, reflection, scattering, or channel impulse response. It also does not consume the LOS label or building height in its numeric terms.

## 2. Current 140 GHz baseline values

The baseline uses the production planning defaults with an omni/flat controlled pattern: 30 dBm conducted TX power, 25 dBi TX gain, 0 dBi RX gain, 25 m TX height, 1.5 m RX height, zero system/polarization/calibration loss, 400 m radius, and manual -115 dBm receiver sensitivity.

At 10/25/50/100/200/400 m ground distance, the slant distances are 25.539186/34.311077/55.247172/102.724145/201.375892/400.689718 m. Current FSPL is 103.516702/106.081248/110.218762/115.606011/121.452710/127.428725 dB.

The geometry audit is deliberately repetitive because it exposes the current behavior:

| Geometry input | Wall events | 100 m total path loss | 100 m received power |
| --- | ---: | ---: | ---: |
| Clear LOS | 0 | 115.606011 dB | -60.606011 dBm |
| Footprint NLOS | 1 | 195.606011 dB | -140.606011 dBm |
| One boundary crossing | 1 | 195.606011 dB | -140.606011 dBm |
| Two boundary crossings | 2 | 275.606011 dB | -220.606011 dBm |
| Known-height blocker | 1 | 195.606011 dB | -140.606011 dBm |
| Unknown-height blocker | 1 | 195.606011 dB | -140.606011 dBm |

The one-event curve is -128.516702/-131.081248/-135.218762/-140.606011/-146.452710/-152.428725 dBm across the six distances; the two-event curve is 80 dB lower. The full values and states are in the baseline artifact.

## 3. Authoritative reference/version table

| Reference | Version inspected | 140 GHz status | Audit use |
| --- | --- | --- | --- |
| [ITU-R P.525](https://www.itu.int/rec/r-rec-p.525) | P.525-5 (2024-11) | FSPL baseline | Free-space term only |
| [ITU-R P.1411](https://www.itu.int/rec/R-REC-P.1411-13-202509-I/en) | P.1411-13 (2025-09) | Model-dependent | Table 4 bounded candidate; other rows audited below |
| [ITU-R P.676](https://www.itu.int/rec/R-REC-P.676-13-202208-I/en) | P.676-13 (2022-08) | Applicable atmospheric term | Gas sensitivity fixture |
| [ITU-R P.838](https://www.itu.int/rec/R-REC-P.838-3-200503-I/en) | P.838-3 (2005-03) | Applicable specific rain term | Rain sensitivity fixture |
| [ITU-R P.837](https://www.itu.int/rec/R-REC-P.837/en) | P.837-8 (2025-09) | Climate/statistics input | Required for availability, not path loss itself |
| [ITU-R P.840](https://www.itu.int/rec/R-REC-P.840-9-202308-I/en) | P.840-9 (2023-08) | Applicable to 140 GHz within 1–200 GHz | Cloud/fog term with geometry caveat |
| [ITU-R P.2040](https://www.itu.int/rec/R-REC-P.2040-4-202509-I/en) | P.2040-4 (2025-09) | Material rows cover 140 GHz | Material/interface method, not building entry |
| [ITU-R P.526](https://www.itu.int/rec/R-REC-P.526-16-202511-I/en) | P.526-16 (2025-11) | Isolated-edge math applicable | Existing diagnostic only |
| [ITU-R P.2108](https://www.itu.int/rec/R-REC-P.2108/en) | P.2108-1 (2021-09) | Out of range at 140 GHz | No clutter extrapolation |
| [ITU-R P.2109](https://www.itu.int/rec/R-REC-P.2109-2-202308-I/en) | P.2109-2 (2023-08) | Out of range at 140 GHz | No building-entry extrapolation |
| [ITU-R P.1238](https://www.itu.int/rec/R-REC-P.1238-13-202509-I/en) | P.1238-13 (2025-09) | Indoor scope includes 140 GHz | Future indoor workstream only |
| [3GPP TR 38.901](https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3173) | V19.4.0 (2026-06-23) | Out of range; 0.5–100 GHz | No 140 GHz 3GPP claim |

The exact URLs, clauses, and machine-readable classifications are in the applicability artifact.

## 4. 3GPP TR 38.901 applicability conclusion

TR 38.901 V19.4.0 remains a 0.5–100 GHz channel-model study. Its UMa/UMi formulas do not become 140 GHz models by extrapolating the frequency variable. Therefore the existing `urban_short_range` model must remain inapplicable at 140 GHz, and `research_sub_thz` must not be described as a 3GPP extension or conformance implementation.

## 5. P.1411-13 clause-level applicability findings

P.1411-13’s main scope reaches 300 GHz, but its individual models are not uniformly extended to 300 GHz. The relevant clause-level outcome is:

- §4.1.1 Table 4 below-rooftop site-general LOS: the row covers 0.45–300 GHz and has a 5–660 m base-distance range. Its 140 GHz footnote recommends use up to 500 m for 82–159 GHz. This is a conditional candidate for 10–400 m only when both terminals and the morphology satisfy the below-rooftop site-general scenario.
- §4.1.1 Table 4 urban high-rise NLOS: the row covers 0.8–159 GHz and has a 20–715 m base range; its 140 GHz footnote limits the recommendation to 150 m. It is not applicable at 10 m and does not cover 200/400 m at 140 GHz.
- §4.1.1 Table 4 urban low-rise/suburban NLOS: the row covers 0.45–255 GHz and has a 10–250 m base range; its 140 GHz footnote limits the recommendation to 150 m. It is a conditional 10–100 m candidate, not a 200/400 m 140 GHz NLOS model.
- §4.2.1 Table 8 above-rooftop rows are 2.2–73 GHz for the listed LOS case and 2.2–66.5 GHz for the listed urban high-rise NLOS case. They do not support the default 25 m base station at 140 GHz.
- §4.1.3 street-corner and §4.3 low-height models are tied to lower-frequency measurement ranges; they are out of range at 140 GHz.
- §3.2 makes scene data a prerequisite: building structure and height, vegetation, and sufficiently resolved geometry are not optional details for a site-specific interpretation.

This is the central audit result: P.1411 provides a bounded below-rooftop statistical lead, not a general 140 GHz arbitrary-geometry NLOS model for A.T.O.M.

## 6. P.525 / FSPL findings

P.525-5 equation (5) is the physical free-space identity, and equation (6) presents the familiar logarithmic form. Using the same height-adjusted slant distances as A.T.O.M, the P.525-5 32.4 presentation is 0.05 dB below the project’s 32.45 rounded constant at every distance. That difference is immaterial to the audit, but it is recorded rather than silently calling the project constant exact.

P.525 supplies no urban building, rooftop, clutter, material, or NLOS term. It is a valid base term for a future componentized model and cannot justify the current 80 dB event or a 140 GHz urban coverage claim.

## 7. P.676 gaseous attenuation findings

Using the P.676-13 line-by-line equations at 140 GHz, 15 °C, 1013 hPa, and controlled water-vapour densities of 3.5/7.5/15 g/m³ gives total specific attenuation of 0.379049/0.867224/1.998286 dB/km. At the middle case, gas contributes 0.086722 dB over 100 m and 0.346890 dB over 400 m. Oxygen is only about 0.017761 dB/km in that case; water vapour dominates.

The term is not zero, but it is much smaller than the current 80 dB event over the audited distances. A future implementation would need explicit pressure, temperature, humidity/water-vapour density or vertical profile, and a declared terrestrial path integration rule. It must not be added to an empirical model without checking whether that model already reflects atmospheric conditions.

## 8. P.838 rain findings

At 140 GHz, circular-equivalent polarization, and a horizontal-path controlled example, P.838-3 gives `gamma_R = 1.561638 R^0.651858` dB/km. Raw short-path attenuation at 25 mm/h is 1.273031 dB over 100 m and 5.092122 dB over 400 m; at 50 mm/h it is 2.000173/8.000693 dB. These are specific-attenuation path values, not annual outage predictions.

Rain availability needs an effective terrestrial path-length/reduction treatment and a climate/rate distribution. P.838 alone does not provide Ankara annual percentages, and `research_sub_thz` currently supplies neither rain rate nor reduction factor.

## 9. P.837 climatology requirements

P.837-8 supplies 1-minute rain-rate statistics and methods for deriving them from maps or local measurements. A defensible annual or percentage-time 140 GHz result would need Ankara location/climate data, time percentage, local gauge quality or map provenance, and a path reduction/availability convention. The current project has no automatic meteorological ingest; a user-entered deterministic rain rate can only be a controlled sensitivity scenario.

## 10. P.840 cloud/fog findings

At 140 GHz and 15 °C, the P.840 double-Debye coefficient is approximately 6.967800 dB/km per g/m³ of liquid water. Controlled local-fog examples of 0.05 and 0.5 g/m³ therefore give 0.034839/0.348390 dB over 100 m and 0.139356/1.393560 dB over 400 m.

P.840 is principally an Earth-space slant-path recommendation using integrated cloud liquid water. Those horizontal numbers are a transparent local-fog sensitivity calculation, not a license to apply a vertical cloud column to every urban link. A future terrestrial implementation needs local liquid-water density/path geometry and must keep cloud/fog separate from gas and rain.

## 11. P.2040 material findings

P.2040-4 Table 3 contains indicative high-frequency material rows covering 140 GHz for concrete, brick, wood, glass, and other materials. Annex 1 equations (39)–(44) require complex electrical properties, thickness/layer structure, incidence angle, polarization, and interface geometry.

The independent normal-incidence single-slab fixtures illustrate the scale sensitivity: 20 cm concrete is about 453.4 dB, 20 cm brick about 225.0 dB, 10 cm wood about 97.8 dB, and 1 cm glass about 8.6 dB under the selected rows. These are plane-wave slab transmission results without free-space spreading and are not building-entry predictions. They show why a material label or one universal 80 dB event is insufficient.

Metal has no 140 GHz Table 3 material row in this reference, and the listed ranges are indicative measurement ranges, not a universal guarantee for every construction product. P.2040 is therefore a future material/interface foundation, not a current production substitution.

## 12. P.2108 clutter conclusion

P.2108-1 is out of range at 140 GHz: its terrestrial terminal-in-clutter route ends at 67 GHz and its Earth-space/aeronautical route ends at 100 GHz. It must not be extrapolated. Its double-counting guidance is still architecturally useful: if a future path model already contains whole-path clutter, a separate clutter loss must not be attached again.

## 13. P.2109 building-entry conclusion

P.2109-2 estimates building entry loss only to 100 GHz. It is out of range at 140 GHz, so it cannot support the current `research_sub_thz` wall event or a future 140 GHz facade-entry claim. P.2040 may supply a component-level material calculation, but an aggregate 140 GHz building-entry distribution needs measurements covering the relevant facade types, thicknesses, angles, moisture, and antenna geometry.

## 14. P.526 diffraction conclusion

The existing [`diffraction_diagnostic.go`](../backend-go/raytracer/diffraction_diagnostic.go) correctly remains a separate diagnostic. P.526-16 equation (26) gives the signed knife-edge parameter and equation (31) gives the project’s approximation for `v > -0.78`. At 140 GHz, a 50 m/50 m path has a 2.141 mm wavelength: a 1 m edge above the LOS gives `v = 6.112216` and about 28.560751 dB diagnostic loss.

That result is mathematically useful and frequency-sensitive, but it assumes an isolated known edge. P.526 does not turn unknown-height footprint intersections, roof reflection, multiple edges, scattering, or urban canyon multipath into a canonical 140 GHz model. The diagnostic must never be summed with the 80 dB wall heuristic or a future P.1411/measurement NLOS model.

## 15. Current 80 dB wall-heuristic assessment

The current rule is a historical conservative planning heuristic: 80 dB per footprint event at `f >= 100 GHz`, cumulative across events, material-agnostic, and not tied to P.2040 or P.2109. It is useful as a visible compatibility envelope because it makes blocked 140 GHz paths clearly non-serviceable, but it is not physically calibrated.

The controlled comparison is decisive: one event is 80 dB, while the selected P.2040 slab examples span about 8.6–453.4 dB. Even those values are not directly comparable to building entry because they omit façade geometry and whole-building path statistics. The correct classification is “unvalidated conservative heuristic,” not “140 GHz penetration loss.”

## 16. Antenna assumptions at 140 GHz

The production profile defaults to 25 dBi absolute TX gain and 0 dBi scalar RX gain. It uses analytic `ideal-sector`/`flat` patterns by default; the controlled baseline uses `omni`/`flat` to isolate propagation. The evaluator applies a simple height-adjusted slant distance and relative pattern attenuation. It does not model a measured 140 GHz pattern, physical aperture, array factor, codebook, beam squint, pointing error, blockage-induced beam loss, or frequency-dependent calibration.

At 140 GHz, antenna aperture and beam alignment are first-order channel assumptions. The present gain/pattern fields are valid planning inputs but are not evidence that a practical 140 GHz array or link budget has been validated.

## 17. Receiver assumptions at 140 GHz

The baseline carries a 1 GHz configured bandwidth, 7 dB noise figure, 3 dB required SNR, 0 dB receiver margin, and the existing manual -115 dBm receiver sensitivity. These values are deterministic application defaults, not a 140 GHz receiver specification. The current propagation result exposes a threshold and link margin, but no sub-THz front-end, implementation loss, phase-noise, ADC, coding, MCS, or UE orientation model exists.

The receiver assumptions must therefore remain visibly separate from propagation applicability. A future 140 GHz model needs a device/link budget with bandwidth, noise figure, implementation margin, antenna gain, and sensitivity provenance matched to the measurement hardware.

## 18. Radio-quality unsupported-state confirmation

The existing radio-quality contract marks the 140 GHz research profile as `unsupported_radio_quality_model` in [`radio_quality_contract.go`](../backend-go/raytracer/radio_quality_contract.go). Concept 4H.2 already treats 140 GHz `research_sub_thz` as unavailable for the radio-quality objective. This audit does not add RSRP/RSRQ/SINR, throughput, scheduler, PHY, or UE semantics at 140 GHz.

## 19. Peer-reviewed 100–200 GHz measurement survey

Useful evidence exists, but it is scenario-specific:

- Xing and Rappaport’s [IEEE ICC 2021 140/142 GHz urban-microcell campaign](https://arxiv.org/abs/2103.01151) supplies directional and synthesized omnidirectional LOS/NLOS models and foliage measurements in downtown Brooklyn, at roughly 100 m terrestrial scale with some configurations reported around 117 m. It is strong evidence for measurement-backed profiles, not an Ankara-wide coefficient.
- Shakya et al.’s [IEEE TAP 2024 comparison at 142, 73, and 28 GHz](https://doi.org/10.1109/TAP.2024.3366581) covers outdoor open squares and streets in Brooklyn/Manhattan, with 142 GHz links around 24–117 m. It is valuable cross-frequency and morphology evidence, but not a 400 m arbitrary-NLOS model.
- De Beelde et al.’s [IEEE WCL 2022 D-band study](https://biblio.ugent.be/publication/01GQHEC5QMYV683Z0225CYYWVD) spans 120–165 GHz and reports LOS/NLOS angular loss, angular spread, and facade reflection behavior for fixed-wireless-access scenarios. It supplies mechanism priors and hardware/geometry lessons rather than Ankara coefficients.
- Sun et al.’s [Sensors 2022 D-band measurement study](https://www.mdpi.com/1424-8220/22/24/9734) covers 138–163.2 GHz and 100–800 m clear-weather LOS road/campus links. It is a useful 100/200/400 m scale comparison, but narrow-beam LOS conditions do not transfer to footprint NLOS.
- Ju et al.’s [142 GHz spatial-consistency measurements](https://arxiv.org/abs/2103.05496) provide a short outdoor route with 3 m receiver spacing. They support future spatial-correlation work, not a universal path-loss term.

## 20. Ankara transferability assessment

Transferability is low without a campaign matched to Ankara’s building morphology, roof heights, street widths, façade materials, vegetation, terrain, antenna heights, beam patterns, weather, and route sampling. Brooklyn/Manhattan open-street results can motivate a hypothesis; they cannot validate a default for Ankara footprints with unknown heights and a 25 m transmitter.

The P.1411 data requirements reinforce this boundary. A future site-specific 140 GHz study should preserve high-resolution geometry and height provenance, stratify by morphology, and use spatial holdout locations. Randomly mixing nearby samples would overstate transferability because sub-THz shadowing and beam visibility are spatially correlated.

## 21. 10–400 m mechanism-magnitude comparison

| Term / controlled condition | 10 m | 100 m | 400 m | Interpretation |
| --- | ---: | ---: | ---: | --- |
| 140 GHz current FSPL with default height | 103.517 dB | 115.606 dB | 127.429 dB | Production base term |
| P.676 gas, 7.5 g/m³ water vapour | 0.009 dB | 0.087 dB | 0.347 dB | Small but explicit |
| P.838 rain, 25 mm/h | 0.127 dB | 1.273 dB | 5.092 dB | Raw, unreduced path value |
| P.840 thick local fog, 0.5 g/m³ | 0.035 dB | 0.348 dB | 1.394 dB | Horizontal sensitivity interpretation |
| One current wall event | 80 dB | 80 dB | 80 dB | Distance-independent heuristic |
| Two current wall events | 160 dB | 160 dB | 160 dB | Cumulative heuristic |
| P.526 1 m isolated edge, 50 m + 50 m geometry | — | 28.561 dB at the specified geometry | — | Diagnostic, not a distance curve |

P.2040 material transmission is interaction-dominated rather than a smooth distance term: the selected illustrative 1 cm glass slab is 8.556 dB while 20 cm concrete is 453.398 dB. Thickness and construction details dominate.

## 22. 28 GHz versus 140 GHz controlled comparison

At the same height-adjusted distances, project FSPL is 13.9794 dB higher at 140 GHz than at 28 GHz, exactly `20 log10(140/28)`. At 100 m, the controlled project FSPL values are 101.626611 dB at 28 GHz and 115.606011 dB at 140 GHz. The existing 28 GHz UMa LOS fixture is 101.199956 dB at 100 m because it is an empirical UMa formula, not the legacy FSPL term.

The difference in model confidence is more important than the 13.98 dB frequency delta: 28 GHz has a bounded `urban_short_range` subset with explicit 3GPP-derived applicability, while 140 GHz currently has a research-only FSPL-plus-heuristic envelope.

## 23. Double-counting matrix

The machine-readable matrix records the full pairwise decisions. The governing rules are:

- Choose either P.525 FSPL or a P.1411 path-loss row as the base model; do not add both.
- P.676, P.838, and P.840 can be additive components only when their inputs and the base model’s environmental basis are explicit.
- Do not attach P.2108 to a path model that already includes whole-path clutter; P.2108 is out of range at 140 GHz anyway.
- Choose an aggregate building-entry model or a componentized P.2040 facade model; do not add P.2109 and P.2040 as independent losses.
- Keep P.526 as an alternative diagnostic, never an extra loss on top of current or future NLOS.
- Treat P.837 as the statistics source for P.838, not as a second attenuation term.
- Do not add the current 80 dB event to any physical material, building-entry, diffraction, or measured excess-loss term.

## 24. Required environmental/data inputs

The minimum future input contract is: building polygons and absolute heights; roof-edge geometry; terrain or explicit datum; facade materials, thickness, layers, moisture, angle, and polarization; vegetation; street morphology; pressure, temperature, and water vapour; rain-rate statistics and path reduction; cloud/fog liquid water; measured TX/RX patterns and aperture/beam state; conducted power and calibration; receiver bandwidth, noise figure, sensitivity, and margin; and georeferenced 100–200 GHz measurements with LOS/NLOS/roof/facade/weather labels.

Current A.T.O.M has pieces of this contract—footprints, some height provenance, optional terrain in the isolated path tool, scalar material labels, and analytic antenna/receiver settings—but does not have the complete 140 GHz evidence chain.

## 25. Current model gap analysis

The gaps are structural, not a missing coefficient:

1. `research_sub_thz` has no measured distance or morphology model.
2. The 80 dB event is not tied to material, thickness, angle, or uncertainty.
3. Footprint NLOS is not the same as above-rooftop, street-corner, facade-entry, or reflected NLOS at 140 GHz.
4. Unknown building height cannot be converted into validated edge/diffraction behavior.
5. The default 25 m antenna may violate P.1411’s below-rooftop Table 4 conditions.
6. Atmospheric terms are user-supplied only in the separate path-profile diagnostic and are not automatically integrated into the network evaluator.
7. Antenna and receiver fields are deterministic planning assumptions, not calibrated 140 GHz hardware models.
8. Radio-quality and optimization semantics intentionally stop at the current unsupported state.

## 26. Proposed future 140 GHz model architecture

The safe architecture is a provenance-aware component graph, not another frequency threshold:

```text
applicability gate
  -> P.525 FSPL base
  -> optional P.676 gas / P.838 rain / P.840 cloud-fog components
  -> geometry branch: bounded P.1411 Table 4 OR calibrated measured residual
  -> optional P.2040 facade/material interaction
  -> separate P.526 known-edge diagnostic
  -> measured/calibrated antenna and receiver ledger
  -> uncertainty, provenance, and double-counting checks
```

Every component should return its reference, clause, input provenance, validity envelope, uncertainty, and whether it already includes another component. P.1411 Table 4 should be one bounded candidate branch, not a universal dispatch rule. Above-rooftop and building-entry branches need their own evidence.

## 27. Recommended Concept 4I.2 scope

The first 4I.2 increment should be an opt-in, non-canonical 140 GHz reference experiment that evaluates P.525 plus explicitly supplied P.676/P.838/P.840 terms and returns a full ledger. It should not replace `research_sub_thz`, alter optimizer scores, or create radio-quality outputs.

The next bounded increment can implement P.1411 Table 4 rows with explicit below-rooftop/morphology/distance checks. Promotion to a production default should wait for 100–200 GHz measurement fixtures, spatial holdout validation, antenna calibration, uncertainty reporting, and a double-counting audit.

## 28. Proposed remaining 4I roadmap

| Future concept | Scope |
| --- | --- |
| 4I.2 | Componentized 140 GHz reference experiment; applicability-gated P.1411 Table 4 candidate |
| 4I.3 | Measurement fixture schema, campaign provenance, calibration, and spatial holdout validation |
| 4I.4 | Conditional facade/material and known-edge mechanisms with thickness/angle/layer inputs |
| 4I.5 | Morphology-stratified empirical residual, blockage, and reflection model |
| 4I.6 | Only if evidence supports it: bounded network-planning integration with separate 140 GHz link semantics |

Full ray tracing, automatic weather/clutter/material datasets, above-rooftop standard claims, optimizer integration, and 140 GHz radio-quality semantics remain deferred.

## 29. Tests and invariance validation

The audit test [`concept_4i1_capture_test.go`](../backend-go/raytracer/concept_4i1_capture_test.go) passes and asserts the captured slant distances, FSPL, 80 dB/event rule, dispatch identity, no-fallback state, receiver threshold, and equality of one-event geometry cases. Existing diffraction tests continue to assert that the P.526 diagnostic is available only with known height, remains research-only at 140 GHz, and does not mutate canonical propagation.

Validation performed for this audit:

```text
cd backend-go && go test ./raytracer -run TestConcept4I1ResearchProfileBaselineAndInvariance -count=1 -v  # pass
jq empty docs/concept-4i1-pre-change-140ghz-baseline.json                              # pass
jq empty docs/concept-4i1-140ghz-applicability.json                                    # pass
jq empty docs/concept-4i1-140ghz-controlled-fixtures.json                              # pass
```

The final full-suite and documentation validation commands are recorded in the delivery summary. No production RF behavior changed during this audit.

## 30. Files changed

- `docs/concept-4i1-pre-change-140ghz-baseline.json` — exact pre-audit runtime values.
- `docs/concept-4i1-140ghz-applicability.json` — authoritative versions, clause/model applicability, double-counting, evidence survey, inputs, and roadmap.
- `docs/concept-4i1-140ghz-controlled-fixtures.json` — independent FSPL, atmospheric, material, and diffraction fixtures.
- `docs/concept-4i1-140ghz-audit.md` — this report.
- `backend-go/raytracer/concept_4i1_capture_test.go` — audit-only invariance regression test; no production package behavior changed.
- Documentation hub/build/changelog entries make the report discoverable; generated HTML is a presentation artifact of this Markdown report.

## 31. Unresolved scientific questions

1. Which Ankara morphologies should define a 140 GHz P.1411-compatible below-rooftop subset?
2. How should roof-edge diffraction, facade reflection, scattering, and blockage be partitioned without double counting?
3. What material moisture/thickness distributions apply to Ankara construction at 140 GHz?
4. What antenna physical aperture, beam codebook, pointing, and receiver calibration represent the intended product?
5. Can 100–200 GHz measurements support a stable model beyond 150 m for each morphology, or should 200/400 m remain LOS/FWA-only?
6. How should weather and cloud/fog be represented for short horizontal paths and what availability percentage is required?
7. What spatial holdout size is sufficient for independent validation of shadowing and beam visibility?
8. Which receiver/link budget should define any future 140 GHz radio-quality contract?

## 32. Explicit non-claims

This audit does not claim that A.T.O.M implements a standardized, validated, or production-ready 140 GHz/6G propagation model. It does not claim 3GPP TR 38.901 coverage at 140 GHz, a universal P.1411 140 GHz urban-NLOS extension, P.2109 building-entry validity, P.2108 clutter validity, automatic P.837 weather statistics, material-specific wall loss from the 80 dB event, full P.526 urban diffraction, measured/vendor antenna behavior, a validated receiver, LTE/NR/6G radio quality, throughput, scheduler, MCS, UE, or array-beamforming behavior. The honest current boundary is `research_sub_thz` as a deterministic research planning envelope plus separate diagnostic/reference calculations.
