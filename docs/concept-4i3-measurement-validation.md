# Concept 4I.3 — Measurement Evidence, Calibration & Spatial Validation Foundation

Concept 4I.3 is an isolated evidence ledger for measured path-loss campaigns. It establishes the data contract, quantity semantics, reference-model adapters, deterministic comparison/holdout diagnostics, and a conservative readiness gate. It does not introduce a new propagation equation, path-loss exponent, ML model, arbitrary regression, or production RF model.

## Boundary and invariance

The workflow is exposed at `POST /api/sub-thz-validation`. It consumes imported campaign JSON and calls only the versioned reference adapters. It does not call or mutate the canonical 2.6 GHz, 28 GHz, `research_sub_thz`, Concept 4I.2A atmospheric, Concept 4I.2B P.1411, building-entry, diffraction, interference/radio-quality, or optimization result paths. The pre-change audit and invariance targets are recorded in [concept-4i3-pre-change-baseline.json](concept-4i3-pre-change-baseline.json); the post-change comparison is recorded in [concept-4i3-post-change-comparison.json](concept-4i3-post-change-comparison.json).

The legacy `/api/measurements/evaluate` RSRP workflow remains unchanged. Its 4G/5G radio-quality semantics are not silently reused as sub-THz path-loss evidence.

## Campaign and measurement contract

Every campaign has a schema version, stable campaign ID/version, source and provenance, frequency range, equipment/antenna/calibration metadata, environment and weather metadata, sites, and measurement records. Every record has a stable measurement ID and may carry `location_pair_id` and `beam_id` so repeated beams and correlated observations are visible rather than counted as independent evidence.

The machine-readable contract is [concept-4i3-validation-schema.json](concept-4i3-validation-schema.json). Coordinates, numeric values, IDs, timestamps, duplicate campaign/site/measurement IDs, and enumerations are strictly validated. JSON `NaN`/`Infinity` are rejected by the decoder and all finite numeric fields are range checked.

The canonical comparison domain is path loss in dB. The residual sign is:

`residual = measured_path_loss_db - predicted_path_loss_db`

Received power is normalized only when conducted transmit power, transmit/receive gains, cable losses, calibration status, and a compatible isotropic-equivalent or synthesized-omnidirectional basis are explicit:

`PL = Pt_conducted + Gt + Gr - Ltx - Lrx - Pr_received`

Path gain is converted as `PL = -path_gain_db` only with explicit quantity, antenna/cable embedding, calibration, and compatible basis metadata. Directional or best-beam observations remain ambiguous unless a synthesized-omnidirectional or isotropic-equivalent basis is supplied. Rx power, path loss, and path gain are never mixed without an explicit normalization decision.

Below-detection and not-detected records are counted as censored and excluded from ordinary residual metrics. No censoring threshold is converted into a fabricated path-loss value.

## Reference adapters

The shared adapter contract evaluates applicability before residuals and returns `applicable`, `inapplicable`, `ambiguous`, `unsupported`, or `censored` status:

- `p525_fspl`: exact wavelength-form P.525 free-space path loss at the normalized 3D distance.
- `sub_thz_atmospheric_reference_v1`: the existing opt-in P.525/P.676/P.838/P.840 ledger, only when explicit weather and rain/fog-known flags exist. Atmospheric totals are side-by-side evidence, not additions to an empirical model.
- `p1411_below_rooftop_los_v1`, `p1411_urban_highrise_nlos_v1`, and `p1411_urban_lowrise_nlos_v1`: existing Table 4 row implementations with strict frequency, distance, morphology, rooftop, and LOS applicability. The empirical sigma is compared with observed residual spread; no random fading is sampled.
- `research_sub_thz`: comparison-only `140 GHz` planning profile requiring an explicit wall-event count. Its `80 dB` per-wall heuristic is never inferred or calibrated.
- `p526-single-edge-v1`: diagnostic-only adapter requiring an explicit obstacle/diffraction loss profile. It is not a canonical propagation path.

## Metrics and diagnostics

For every applicable common sample set, the response reports count, mean bias, median bias, MAE, RMSE, standard deviation, p10, and p90. It also reports strata by LOS/NLOS, morphology, distance bin, frequency, campaign, and site; residual diagnostics versus log-distance and frequency; common-sample pair comparisons; censored counts; and directional-basis warnings. No R² score or universal model winner is used as a primary decision.

Calibration is constant-bias-only. A fitted bias is the mean calibration-set residual and is applied only to a held-out diagnostic comparison. Calibration and validation sets are explicit or deterministically separated by site, campaign, location group, or spatial component. Status is `stable`, `unstable`, or `insufficient_validation_data`; `promoted` is always false.

Spatial holdout uses deterministic meter cells and connected neighboring-cell components so nearby observations cannot leak between calibration and validation folds. Leave-one-site-out and leave-one-campaign-out are also available. The response contains the cell size, minimum-separation policy, fold IDs, counts, and no-leak evidence. The validation fingerprint excludes timestamps, runtime, UI state, and file paths.

## External evidence policy

[concept-4i3-external-evidence.json](concept-4i3-external-evidence.json) registers a small set of previously audited 100–200 GHz sources as metadata-only references. No numeric sample is redistributed, plot-digitized, or invented. A source becomes a numeric campaign only after access/license, quantity semantics, antenna basis, calibration, geometry, labels, and duplicate-beam policy are established.

## Synthetic controls

[concept-4i3-synthetic-validation.json](concept-4i3-synthetic-validation.json) covers exact P.525, a controlled +5 dB bias, exact P.1411 median evaluation, deterministic residual statistics, spatial-region offset, censored observations, and directional ambiguity. These fixtures test implementation behavior; they are not field validation.

## Ankara 140 GHz campaign gap

The current repository contains no redistributable Ankara 140 GHz measurement campaign. A future campaign must capture, per link:

- georeferenced Tx/Rx coordinates and antenna heights, plus the coordinate reference system;
- exact carrier frequency, bandwidth, waveform/sounding configuration, timestamp, and synchronization state;
- conducted Tx power, Tx/Rx cable losses, receiver calibration state, noise/detection floor, receiver dynamic range, and hardware identifiers;
- antenna gain/pattern metadata, beam pointing/beamwidth, polarization, beam ID, and whether the value is directional, best-beam, isotropic-equivalent, or synthesized omni;
- received power/path loss/path gain quantity with an explicit definition and embedded-gain/cable-loss flags;
- LOS/NLOS, morphology, rooftop relation, street width/corner, building/roof intersections, wall events, terrain/vegetation, and the source/provenance of each label;
- temperature, pressure, humidity/water vapour, rain and fog observations with explicit known/unknown flags.

Until that gap is closed, the readiness taxonomy remains `reference_only`, `synthetic_controlled_only`, or `diagnostic_only`; Concept 4I.3 has no `production_candidate` state.

