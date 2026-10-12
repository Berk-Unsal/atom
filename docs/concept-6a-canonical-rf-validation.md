# Concept 6A — Canonical RF Measurement Validation Foundation

Concept 6A adds an evidence-only validation foundation for the production 2.6 GHz and 28 GHz planning profiles. Its result is a reproducible validation report, not a new propagation model, a fitted UMa equation, a calibrated canonical profile, or an optimizer input.

The current readiness result is **validation infrastructure complete, real-data validation unavailable**. The repository has no usable public Ankara/Türkiye measurement campaign in the required schema, so no `concept-6a-real-data-validation.json` artifact is created and no real measurement result is claimed.

## Boundary and invariance

The implementation lives in [`canonical_rf_validation.go`](../backend-go/raytracer/canonical_rf_validation.go) and [`canonical_rf_validation_holdout.go`](../backend-go/raytracer/canonical_rf_validation_holdout.go). It is a library boundary with no normal planning route and no frontend statistics panel. A future importer or isolated API can adapt source data into the same schema without entering `/api/simulate`, `/api/interference`, `/api/optimize`, or recommendation workflows.

Concept 6A does not change:

- the 2.6 GHz or 28 GHz propagation equations, UMa coefficients, LOS/NLOS rules, building-entry behavior, or antenna/link-budget equations;
- receiver thresholds, sensitivity admission, interference, serving-cell selection, RSRP/SINR/RSRQ resource semantics, or radio-quality thresholds;
- objective definitions, search policies, Pareto/reranking behavior, recommendations, or optimizer scenario fingerprints;
- the research-only `research_sub_thz` profile, the 4I references, terrain-disabled behavior, or any existing measurement route.

The pre-change freeze is in [`concept-6a-pre-change-baseline.json`](concept-6a-pre-change-baseline.json), and the post-change comparison is in [`concept-6a-post-change-comparison.json`](concept-6a-post-change-comparison.json). Both record the current UMa contract, antenna and receiver semantics, interference/radio-quality contract, optimizer-independent fingerprint, and Ankara dataset identity.

## Architecture and 4I.3 reuse

The flow is:

`source adapter → canonical observation schema → deterministic transmitter match → frequency/resource/geometry/applicability gate → shared canonical RF primitive → quantity-specific predicted value → measured − predicted residual → strata/holdout/calibration diagnostics → readiness`.

The existing 4I.3 layer was audited and reused where it is generic: schema/version discipline, provenance-first evidence, explicit censoring, deterministic spatial defaults, minimum reportable group size, holdout vocabulary, fingerprint exclusion of runtime/path/UI state, and the conservative calibration/non-promotion policy. The shared 4I.3 defaults are referenced directly by the Go extension (`MinimumValidationSamples`, `DefaultSpatialCellSizeM`, and `DefaultSpatialSeparationM`).

4I.3 intentionally normalizes Sub-THz evidence to path loss. Reusing that normalizer for 2.6/28 GHz would erase the distinction between received power, RSRP, RSSI, SINR, and RSRQ. Concept 6A therefore extends the same evidence policy with a quantity-preserving canonical layer rather than silently duplicating or weakening the 4I.3 semantics.

Source independence is represented by `CanonicalRFValidationAdapter`. The included identity adapter accepts the canonical schema; source-specific CSV/TSV, GeoJSON, or field-tool adapters must map into it and retain source provenance before evaluation. No source adapter is allowed to choose a model, strongest cell, calibration statistic, or residual-minimizing aggregation.

## Schema and observed quantities

The machine-readable contract is [`concept-6a-validation-schema.json`](concept-6a-validation-schema.json). Each observation carries stable observation/campaign/site/session identifiers, timestamp, latitude/longitude when available, receiver height and height provenance, technology, frequency, band, bandwidth, channel, serving-cell identity/PCI, quantity, value, device/antenna/calibration identity, motion and sampling metadata, aggregation method, provenance, quality flags, LOS/NLOS and outdoor labels, detection/censoring status, and radio-resource context.

The accepted quantities are distinct:

| Quantity | Comparison domain | Required interpretation |
| --- | --- | --- |
| `received_power_dbm` | absolute received power | shared `EvaluatePropagationLink` result |
| `rsrp_dbm` | reference-signal power | shared carrier-to-reference-resource conversion; never RSSI |
| `sinr_db` | serving SINR | shared interference/radio-quality primitive with serving, channel, bandwidth, resource, and neighbor context |
| `rsrq_db` | serving RSRQ | shared interference/radio-quality primitive with the same context requirements |
| `rssi_dbm` | wideband RSSI | kept separate from RSRP and never cross-compared |
| `path_loss_db` | propagation-only path loss | diagnostic propagation comparison, not absolute received-power validation |

The residual convention is always:

`residual_db = measured_value_db - predicted_value_db`.

Positive residual means the canonical model underpredicts the measured quantity. RSSI is never compared with RSRP. Received power is never silently converted to path loss, and path loss is never treated as absolute received-power evidence.

Temporal meaning is explicit. `raw`, `mean`, `median`, and `percentile` are accepted deterministic aggregation choices; `AggregateCanonicalRFValues` sorts before reducing and requires an explicit percentile. The evaluator never selects a statistic because it improves a residual.

Receiver height is required for applicability and carries `measured`, `configured`, `assumed`, or `unknown` provenance. There is no silent 1.5 m default. Device and antenna effects are retained as evidence metadata; Concept 6A does not compensate them. Missing device, antenna, or calibration identity downgrades completeness to `usable_with_assumptions` rather than fabricating a correction.

## Matching, frequency, geometry, and applicability

Transmitter matching is deterministic and auditable:

1. exact transmitter/serving-cell ID or explicit mapping ID;
2. exact PCI, channel, and frequency candidate;
3. an explicitly enabled geographic candidate policy with a bounded radius and deterministic nearest/tie rule.

The evaluator never infers the strongest modeled cell as the serving transmitter. An unresolved, missing, mismatched, or tied candidate remains an explicit exclusion reason.

Frequency and bandwidth are checked before residuals. 2.6 GHz and 28 GHz are separate strata and are never pooled into one headline metric. RSRP conversion uses the matched profile’s declared technology/bandwidth/resource semantics. SINR/RSRQ/RSSI require explicit serving identity, channel, bandwidth, resource semantics, and complete neighbor/interference context; otherwise the result is `interference_validation_limited` and does not become an ordinary residual.

The canonical UMa applicability gate is evaluated before prediction: 2.6 or 28 GHz, `10 m <= d2D <= 5000 m`, valid Tx/Rx heights, outdoor-to-outdoor endpoints, and explicit LOS/NLOS. Unknown LOS/NLOS, indoor endpoints, frequency mismatch, height gaps, distance gaps, and geometry mismatches are excluded with a reason. Where a building index is supplied, the existing height-aware path classifier is used; otherwise the observation’s declared LOS/NLOS label is retained as provenance and passed to the same production link primitive. The validator never reimplements the UMa equations.

## Canonical evaluation and evidence fingerprint

Each applicable observation calls the same `EvaluatePropagationLink` used by production. Radio-quality quantities additionally call the existing `evaluateInterferencePointContext`, `carrierPowerToReferencePower`, and `computeRadioQualityMetrics` path. The result records measured value, predicted value, residual, applicability, matching method/status, assumptions, quantity semantics, receiver threshold, resource/interference status, and a propagation fingerprint.

The validation fingerprint contains dataset ID/version, an order-independent observation checksum, adapter/evaluator versions, canonical RF scenario identity, matching policy, applicability policy, residual convention, censoring policy, spatial strategy, and calibration policy. It excludes timestamps, local paths, runtime, memory, and UI state. The canonical scenario fingerprint is optimizer-independent and cannot be used to alter a planning scenario fingerprint.

## Metrics and strata

Every summary reports `n` together with mean bias, median bias, MAE, RMSE, standard deviation, p50/p90/p95 absolute error, and residual distribution min/p01/p10/median/p90/p99/max. Tiny groups are marked with `small_group` and never appear without their sample count.

Metrics are available overall and independently by quantity, frequency, LOS/NLOS, distance, site, and campaign. The defensible distance bins are `10–50 m`, `50–100 m`, `100–200 m`, `200–400 m`, and `400 m+`; below-envelope distances remain applicability exclusions. Unknown LOS/NLOS is not silently pooled with LOS or NLOS.

Explicit left/right/below-detection observations are counted as censored and excluded from ordinary residual metrics. A floor such as `< -120 dBm` is not rewritten as `-120 dBm`.

## Spatial, site, campaign, and calibration diagnostics

The primary holdout policy is deterministic spatial blocks; leave-one-site-out and leave-one-campaign-out are also available. Calibration rows within the configured minimum separation of a validation block are excluded, and each fold reports IDs, group sets, counts, cell size/separation, and no-leak evidence. Random row splitting is not the primary validation strategy.

The uncalibrated baseline is always present. A frequency-specific constant bias may be estimated from calibration blocks and applied only to held-out diagnostic metrics. Calibration is not stratified by LOS/NLOS in 6A, is never applied to production RF, and is never promoted by the evaluator. Stability requires independent folds with sufficient counts and materially reduced held-out residual structure; a distance trend or LOS/NLOS differential therefore fails the scalar-calibration gate.

Propagation/path-loss validation and absolute received-power validation are reported as different completeness classes:

- `complete_for_absolute_validation`;
- `usable_with_assumptions`;
- `propagation_only`;
- `insufficient`.

No readiness state is the bare word “validated.” The available states are `no_measurement_data`, `insufficient_metadata`, `validation_only`, `calibration_unstable`, `calibration_candidate`, and `validated_for_declared_scope`; the last state remains gated by independent review and reproducible real campaigns.

## Synthetic controls

[`concept-6a-synthetic-validation.json`](concept-6a-synthetic-validation.json) contains six controlled fixtures. The backend tests in [`canonical_rf_validation_test.go`](../backend-go/raytracer/canonical_rf_validation_test.go) also cover serving-cell mismatch, quantity-schema incompatibility, frequency mismatch, applicability exclusion, complete radio-quality evaluation, and deterministic repeated evaluation.

1. **Exact canonical residual zero:** values generated by the shared primitive produce zero residual.
2. **Known +5 dB offset:** a held-out constant-bias diagnostic recovers +5 dB while `promoted` and `calibration_active` remain false.
3. **Distance-dependent error:** a scalar correction remains unstable after holdout.
4. **Spatial error:** a held-out region exposes a correction failure.
5. **LOS/NLOS differential:** opposite stratum offsets remain visible; one scalar is inadequate.
6. **Censored floor:** a below-detection record is counted but is not treated as an exact residual.

These fixtures test implementation behavior only. They are not field evidence.

## Public-data audit and Ankara campaign

The source audit is [`concept-6a-dataset-source-audit.json`](concept-6a-dataset-source-audit.json). Public candidates were checked for raw numeric observations, 2.6/28 GHz frequency, geolocation, serving-cell/mapping metadata, resource semantics, device/antenna/calibration provenance, and redistribution terms. Public LTE/5G datasets do provide useful RSRP/RSRQ/SINR examples, but the audited candidates are outside Ankara/Türkiye, outside the exact 2.6/28 GHz scope, missing transmitter configuration/coordinates or complete calibration semantics, or have incomplete license/metadata evidence. They are not imported or treated as usable real-data validation in this change.

The field design is in [`concept-6a-campaign-design.json`](concept-6a-campaign-design.json). A future Ankara campaign should capture synchronized raw and aggregated records at both frequencies across independent sites/routes and repeated sessions, with georeferenced Tx/Rx coordinates, Tx/Rx heights, explicit serving cell/PCI/channel mapping, bandwidth and resource semantics, device/antenna/calibration identifiers, LOS/NLOS and outdoor labels, neighbor cells for radio quality, detection limits, and complete provenance. It should reserve spatial/site/campaign holdouts before any calibration decision. No acquisition was performed by Concept 6A.

## Readiness and Concept 6B gate

[`concept-6a-readiness.json`](concept-6a-readiness.json) records `no_measurement_data`, `production_candidate: false`, and `calibration_active: false`. The permitted interpretation is “validation infrastructure complete, real-data validation unavailable.” The required Concept 6B gate is independent usable samples, complete quantity/device/antenna/calibration/resource metadata, deterministic serving-cell mapping, spatial/site/campaign holdouts, stable frequency-specific correction if one is proposed, reproducible campaign provenance, no configuration bias, and independent review.

Concept 6A does not implement calibrated canonical RF, UMa coefficient fitting, ML/regression, kriging, terrain coupling, P.526 coupling, 140 GHz coupling, optimizer changes, or a new search policy. Those are future decisions and require a separate evidence-backed scope.

## Validation commands and files

The required backend checks are:

```text
cd backend-go && go test ./...
cd backend-go && go test -race ./...
cd backend-go && go vet ./...
python3 -m json.tool docs/concept-6a-validation-schema.json
python3 scripts/versioning.py check
git diff --check
```

The gated artifact test is:

```text
cd backend-go && ATOM_RUN_CONCEPT_6A_AUDIT=1 go test ./raytracer -run '^TestGenerateConcept6AArtifacts$' -count=1
```

Required files are the schema, pre-change baseline, synthetic validation, dataset-source audit, campaign design, readiness, post-change comparison, and this design note. No real-data artifact exists because no source passed the complete-data audit.
