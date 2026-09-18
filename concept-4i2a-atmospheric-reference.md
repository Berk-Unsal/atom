# Concept 4I.2A: Componentized Sub-THz Atmospheric Reference

This change adds `sub_thz_atmospheric_reference_v1`, an opt-in, non-canonical reference evaluator for controlled point-to-point atmospheric comparisons. It is deliberately separate from `research_sub_thz`, `urban_short_range`, `legacy_fspl_walls`, the path-profile diagnostic, network RF, radio quality, building entry, and optimization.

## 1. Objective and boundary

The endpoint answers a narrow question: what does a declared free-space path plus explicitly supplied atmospheric state contribute over a homogeneous terrestrial Tx-to-Rx path? It is a ledger and sensitivity tool, not a validated 140 GHz urban propagation model.

## 2. Pre-change audit

The pre-change artifact records the existing 2.6 GHz, 28 GHz, 140 GHz research, 4H.2, building-entry, and P.526 runtime behavior: [concept-4i2a-pre-change-baseline.json](concept-4i2a-pre-change-baseline.json). The existing 140 GHz profile remains FSPL plus its historical wall-event heuristic; this feature does not rewrite that path.

## 3. Stable model identity

The stable response and request identity is `sub_thz_atmospheric_reference_v1`. The route is `POST /api/sub-thz-reference`. The UI labels it “Opt-in, non-canonical ledger” and shows the model ID directly.

## 4. Route and UI isolation

The route is protected by the existing RF limiter and optional `RF_API_KEY`. The React panel sits beside the existing vertical path-profile diagnostic, reuses the selected transmitter/receiver geometry only, and owns separate request state. It cannot silently alter a sector run, coverage surface, interference result, building-entry estimate, or optimizer result.

## 5. Explicit geometry

The request requires transmitter and receiver longitude, latitude, and height in metres. The response reports horizontal distance, height delta, slant distance, path length in kilometres, and the rain-path elevation angle. The atmospheric terms are multiplied by slant path length, not by a hidden default radius.

## 6. P.525-5 free-space baseline

The implementation calculates `Lbf = 20 log10(4 pi d / lambda)` using `lambda = c/f` and reports the rounded `32.4 + 20 log10(f_MHz) + 20 log10(d_km)` presentation form alongside it. See the official [ITU-R P.525-5 recommendation](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.525-5-202411-I!!PDF-E.pdf). FSPL is included exactly once and is not an urban NLOS claim.

## 7. P.676-13 gas method

The gas ledger implements the Annex 1 line-by-line oxygen and water-vapour equations and the dry continuum. It reports oxygen-line, dry-continuum, dry-air, water-vapour, total dB/km, and path loss separately. Total pressure is an input; dry pressure is explicitly derived as total pressure minus water-vapour partial pressure. See [ITU-R P.676-13](https://www.itu.int/rec/R-REC-P.676-13-202208-I/en).

## 8. P.838-3 rain method

When enabled, rain uses `gamma_R = k R^alpha`, with P.838-3 curve-fit coefficients, path elevation, and explicit horizontal, vertical, circular, or custom linear polarization. Circular polarization is represented by the declared 45-degree tilt. The raw specific attenuation and path loss are both returned. See [ITU-R P.838-3](https://www.itu.int/rec/R-REC-P.838-3-200503-I/en).

## 9. P.840-9 local-fog method

When enabled, local fog uses `gamma_c = K_l(f,T) rho_l`, with the P.840 double-Debye water-permittivity coefficient. The request supplies local liquid-water density; fog temperature is explicit or transparently inherited from the supplied atmosphere temperature. This is not a vertical integrated Earth-space cloud column. See [ITU-R P.840-9](https://www.itu.int/rec/R-REC-P.840-9-202308-I/en).

## 10. Additive composition

The total is `FSPL + gas + rain + local fog`. Each component contains status, reference, method, inclusion, and double-counting metadata. Disabled components contribute exactly zero. Out-of-scope optional components are reported as `out_of_scope`, not silently extrapolated.

## 11. Applicability

The reference frequency envelope is 1–1000 GHz. P.838-3 uses its 1–1000 GHz range. Local-fog P.840-9 sensitivity is limited to 1–200 GHz in this implementation. A response can therefore be `applicable`, `partial`, or `fspl_only` while preserving the component-level status.

## 12. Atmospheric request contract

Enabled atmosphere requires pressure in hPa, temperature in kelvin, and water-vapour density in g/m³. The API does not infer Ankara weather, standard humidity, altitude profiles, radiosonde data, or a weather station from the dataset.

## 13. Rain request contract

Rain is disabled unless `rain.enabled` is true and a rain rate is supplied. Rain rate is instantaneous homogeneous path input. The implementation does not claim annual availability, does not ingest P.837 statistics, and does not apply a terrestrial effective-path reduction factor.

## 14. Fog request contract

Local fog is disabled by default. Enabling it requires local liquid-water density. P.840’s local specific coefficient is used for the supplied terrestrial path; no cloud-column integration, cloud climatology, or vertical profile is inferred.

## 15. Building obstruction flag

If the active building index is available, the evaluator records intersected building IDs, including endpoint-in-building evidence. The result is `flag_only_no_propagation_loss`: no wall, material, rooftop-screen, Fresnel, diffraction, or penetration term is added. If the index is unavailable, the atmospheric result remains usable while obstruction status is explicitly unknown.

## 16. Double-counting policy

The response states that the ledger must not be added to `research_sub_thz`, `urban_short_range`, `legacy_fspl_walls`, the path-profile sensitivity budget, a P.526 diagnostic, building entry, interference, coverage, or optimization. A caller must select one propagation baseline and one atmospheric source for a comparison, not sum parallel diagnostic products.

## 17. Optional reference link budget

An explicit link-budget block can combine conducted TX power, TX gain, TX pattern loss, system loss, polarization loss, RX gain, calibration, and the reference total path loss. Every term is returned in a signed ledger. No antenna hardware default is injected into this block.

## 18. Receiver boundary

The reference link budget reports received power only. It never applies receiver sensitivity, noise bandwidth, SINR, RSRP, RSRQ, serviceability, coverage, demand, or an optimization score. The response carries `receiver_threshold_applied: false` and `serviceability_evaluated: false` where the optional ledger is present.

## 19. Controlled fixture corpus

The machine-readable fixture corpus is [concept-4i2a-controlled-fixtures.json](concept-4i2a-controlled-fixtures.json). It includes the six-distance sweep, 28-versus-140 comparison, P.676 density sensitivity, P.838 rain-rate sensitivity, P.840 fog-density sensitivity, and the invariance contract.

## 20. 100 m ledger

For the controlled 140 GHz case (25 m TX, 1.5 m RX, 1013.25 hPa, 288.15 K, 7.5 g/m³, 25 mm/h circular rain, 0.5 g/m³ local fog), the 102.724 m slant path gives FSPL 115.603795 dB, gas 0.094039 dB, rain 1.307710 dB, fog 0.357881 dB, and total 117.363424 dB. The corresponding all-term 28 GHz total is 102.094775 dB.

## 21. 400 m ledger

At the 400 m horizontal fixture (400.690 m slant), the same 140 GHz terms are FSPL 127.426508 dB, gas 0.366811 dB, rain 5.100903 dB, fog 1.395963 dB, and total 134.290184 dB. The 28 GHz total is 115.281890 dB. These are controlled path sensitivities, not urban coverage predictions.

## 22. 28 versus 140 GHz comparison

With identical geometry, P.525 FSPL increases by 13.979400 dB from 28 to 140 GHz, exactly `20 log10(140/28)`. The all-term total difference is larger because P.676, P.838, and P.840 coefficients are frequency dependent; that increase must not be described as an urban morphology loss.

## 23. Independent verification note

The earlier 4I.1 fixture recorded approximately 0.867224 dB/km for the 7.5 g/m³ gas row. The new implementation independently evaluates the published line tables and yields 0.915449 dB/km under the explicit total-pressure convention. The earlier value is retained as an observed audit comparison, not copied into production expectations. This difference is documented so a future standards review can resolve version, pressure, or approximation provenance rather than hiding it.

## 24. Validation and invariance

The backend includes independent numerical and route tests for P.525 geometry, P.676, P.838, P.840, building-flag non-additivity, optional link-budget boundaries, validation, and deterministic fingerprints. Frontend tests cover explicit payload construction. Existing canonical Go, frontend, and real-backend acceptance suites are rerun as invariance evidence.

## 25. Deferred work

Not included here: P.837 annual statistics ingestion, rain effective-path/reduction modeling, altitude-dependent atmospheric integration, radiosonde profiles, weather grids, site-calibrated gas/fog/rain validation, P.2040 material transmission, P.526 coupling, multiple-edge diffraction, urban reflection/scattering/multipath, antenna hardware patterns, and any canonical network model replacement.

## 26. Limitations and next gate

This is a standards-oriented reference ledger over a homogeneous straight path. It is useful for auditable component comparison and sensitivity analysis, especially at 28, 100, 140, and 300 GHz, but it is not evidence of service, availability, indoor penetration, NLOS behavior, or an operator-grade 140 GHz channel model. Any future canonical integration requires measured/calibrated data, explicit path integration policy, site-specific obstruction/material evidence, and a separate invariance review.

## Implementation files

- `backend-go/raytracer/sub_thz_atmospheric_reference.go`: request contract, standards calculations, ledger, applicability, obstruction flag, link budget, fingerprint.
- `backend-go/sub_thz_reference_route.go`: isolated Gin route.
- `frontend-react/src/components/SubTHZReferencePanel.jsx`: opt-in UI.
- `frontend-react/src/utils/requestPayloads.js`: explicit payload builder.
- `docs/openapi.yaml`, `docs/api.md`, `docs/architecture.md`, and `docs/modeling-limits.md`: public contract and scope.
