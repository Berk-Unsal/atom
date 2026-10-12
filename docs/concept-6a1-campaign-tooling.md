# Concept 6A.1 Ankara RF Measurement Campaign Tooling and Pilot

Concept 6A.1 is the acquisition and data-quality phase around the frozen Concept 6A canonical RF validation boundary. It makes a real Ankara pilot operationally possible without changing the canonical 2.6 GHz/28 GHz RF model, the UMa implementation, antenna/link-budget semantics, interference/radio-quality primitives, optimizer behavior, terrain behavior, or Concept 6A’s matching, applicability, residual, readiness, and calibration rules.

The original Concept 6A.1 result was `dry_run_ready_real_data_unavailable`; that historical dry-run and its readiness snapshot remain in [`concept-6a1-dry-run-validation.json`](concept-6a1-dry-run-validation.json) and [`concept-6a1-dry-run-readiness.json`](concept-6a1-dry-run-readiness.json). Two local Ankara Signal Collector recordings were added on 2026-10-02. Their raw V6 rows parse, but the existing importer produces zero trustworthy canonical observations because all CellInfo rows report `connection_status=NONE` even where `registered=true`, while separate records report `SERVING_CELL_CHANGED`. The current state is `real_data_ingested_validation_blocked`; the details are in [`concept-6a1-1-real-pilot-ingestion.md`](concept-6a1-1-real-pilot-ingestion.md). No `concept-6a1-pilot-validation.json` is created.

## 1. Scope and frozen boundary

The implementation is the receive-side campaign tooling in [`concept_6a1_campaign_tooling.go`](../backend-go/raytracer/concept_6a1_campaign_tooling.go), plus the isolated [`import-concept-6a1`](../backend-go/cmd/import-concept-6a1/main.go) command. It adapts a documented handset export into the existing `CanonicalRFValidationDataset` and then invokes `EvaluateCanonicalRFValidation`.

It does not calibrate canonical RF, fit UMa coefficients, change 2.6 GHz or 28 GHz propagation, infer a transmitter from strongest signal, invent missing frequency/bandwidth/height/LOS/antenna/calibration data, smooth measurements, replace SINR with RSRP, or feed observations into planning, optimization, or recommendation routes.

The original Concept 6A snapshots and optimizer-independent fingerprint are recorded in [`concept-6a1-pre-change-baseline.json`](concept-6a1-pre-change-baseline.json) and [`concept-6a1-post-change-comparison.json`](concept-6a1-post-change-comparison.json). Concept 6A remains `no_measurement_data` at the canonical layer because this pilot yielded zero canonical observations. The new evidence phase changes no RF, optimizer, request, persistence, or UI behavior.

## 2. Acquisition modes considered

The pilot keeps three modes available:

1. **Handset mode:** an Android handset modem plus GNSS, using an exported measurement file. This is the selected phase-1 mode because it is repeatable, low-friction, and can retain raw records without changing the network.
2. **Engineering/modem-log mode:** a vendor or native `CellInfo` collector when the handset export lacks a required field, especially NR bandwidth/resource metadata. This is a phase-2 escalation and must pass a device-specific audit first.
3. **Manual fixed-point mode:** an operator records point ID, height, route, LOS/NLOS, outdoor state, and the exact export/session at each stationary point. It is a fallback for route control, not a replacement for raw modem records.

The campaign is receive-side only. It does not transmit test signals, alter network configuration, require operator-side privileges, or claim that a handset reading is calibrated absolute received power.

## 3. Selected collector and audit

The selected tool is Android **Signal Collector** with its documented `SIGNAL_COLLECTOR_TXT_V6` export. The audit is in [`concept-6a1-collector-audit.json`](concept-6a1-collector-audit.json). The audit records platform, handset/GNSS requirements, root assumptions, export containers, fields, automation, permissions, privacy, licensing checks, and limitations.

The documented sources are [Signal Collector’s format reference](https://signalcollector.app/format), its [product page](https://signalcollector.app/), and its [Google Play listing](https://play.google.com/store/apps/details?id=app.signalcollector). The actual pilot must re-check the installed version, device behavior, export terms, operator permissions, and participant/site consent on the target hardware.

CellMapper standard CSV was rejected for the full scope because its documented columns do not provide the required timestamp, RSRQ/SINR, and complete provenance contract; the audit retains it as an alternative. Android native `CellInfo` is the engineering fallback. Android documents registered LTE/NR cell records and timestamps in [`CellInfo`](https://developer.android.com/reference/android/telephony/CellInfo); the AOSP signal-strength contract documents LTE RSRP/RSRQ/RSSNR and NR SSRSRP/SSRSRQ/SSSINR in its [signal-strength reference](https://source.android.google.cn/docs/core/connect/signal-strength?hl=en).

## 4. Raw V6 format and exported semantics

The selected raw artifact starts with `SIGNAL_COLLECTOR_TXT_V6`, followed by `key=value` header lines, a blank line, and a seven-column TSV envelope:

```text
timestamp_iso_utc  epoch_ms  elapsed_realtime_ns  session_id  sequence_number  source  payload
```

`payload` is a second escaped `key=value` grammar separated by semicolons. The adapter decodes the outer TSV without destroying nested `\;`, `\=`, `\t`, `\r`, `\n`, and `\\` escapes, then parses the payload. Plain UTF-8 text and gzip-wrapped text are accepted; the checksum always identifies the original input bytes.

For LTE, the adapter maps `rsrp` to `rsrp_dbm`, `rsrq` to `rsrq_db`, `rssnr` or `sinr` to `sinr_db`, and `rssi` to `rssi_dbm`. For NR it maps `ss_rsrp`, `ss_rsrq`, and `ss_sinr`. A generic `dbm` value is never relabeled as received power or RSRP. LTE `bandwidth` is interpreted as the documented kHz field and converted to MHz only when present. NR bandwidth is not assumed to exist.

The selected format carries serving identity (`registered`, `connection_status`, `cell_id`/`nci`, `pci`, `plmn`, `tac`), channel (`earfcn`/`nrarfcn`), band, frequency, cell timestamp, GNSS fix, horizontal accuracy, altitude, speed, and UTC timestamps. Every source field remains visible through the raw export checksum, source field name, raw line, and imported identity fields.

## 5. Raw preservation and checksums

The campaign manifest requires raw retention, a separate canonical output, SHA-256, and no overwrite. The CLI reads `-raw` and never writes to that path. A report includes the raw container, byte count, immutable checksum, parsed-row count, and source provenance. Canonical observations carry the raw checksum in `provenance`.

Malformed rows are reported as import issues and are not silently repaired. Header record-count mismatches and collector-reported dropped samples remain warnings. A gzip container is decompressed only in memory for parsing; its original compressed bytes are hashed and remain the artifact of record.

## 6. Campaign manifest

[`concept-6a1-campaign-manifest.schema.json`](concept-6a1-campaign-manifest.schema.json) is the strict JSON Schema contract. The example is [`concept-6a1-dry-run-campaign.json`](../examples/concept-6a1-dry-run-campaign.json). It requires:

- campaign identity, date, source type, sessions, collector/version/platform/permissions, and raw format;
- raw retention and no-overwrite policy;
- pseudonymous device, built-in antenna basis, calibration state, receiver height, and height provenance;
- coordinate provider, CRS, maximum accepted accuracy, timezone, and UTC normalization;
- operator/PLMN context and consent note;
- sampling interval, fixed-point window, motion state, raw aggregation, repeated-sample policy, LOS/outdoor annotation policy, and neighbor/censoring declarations;
- explicit representations for unavailable, invalid, and censored values; and
- known limitations plus privacy and sharing policy.

The Go validator rejects missing receiver height, unknown usable height provenance, collector root requirements, missing detection policy, missing limitations, or missing privacy policy. No receiver-height, frequency, bandwidth, cell, LOS, outdoor, or detection default is inserted.

## 7. Transmitter truth map and provenance

[`concept-6a1-transmitter-map.schema.json`](concept-6a1-transmitter-map.schema.json) and [`concept-6a1-dry-run-transmitter-map.json`](../examples/concept-6a1-dry-run-transmitter-map.json) map observed PLMN/cell identity to a configured A.T.O.M transmitter. Each entry includes A.T.O.M cell ID, observed cell ID, PCI, PLMN, site coordinates, an explicit canonical RF profile, source citation, and field-level provenance.

Every mapping field is marked `known`, `configured`, `inferred`, or `unknown` with a source. `configured` planning values such as transmitter height, azimuth, tilt, bandwidth, and conducted power remain configuration evidence. They are never relabeled as handset measurements. In particular, configured 100 MHz NR planning bandwidth cannot fill a missing `bandwidth` field in a 28 GHz observation.

## 8. Identity and matching policy

The adapter accepts only `PRIMARY_SERVING` or `SECONDARY_SERVING` rows with an explicit registered state as serving observations. It never chooses the strongest cell. Unregistered rows are retained as neighbor IDs within their source cell-timestamp group.

The mapping classes are:

- `exact_transmitter_mapping`: PLMN plus observed cell ID resolves to one map entry;
- `deterministic_identity_mapping`: PCI/channel/frequency form a unique canonical candidate later in Concept 6A;
- `geographic_candidate_only`: reserved for an explicitly enabled future policy, disabled by this adapter; and
- `unresolved`: no safe identity exists.

The dry run uses exact mappings for cell IDs `1001` and `2001`; neighbor IDs `1002` and `2002` never become canonical serving observations.

## 9. Route, point, and site design

Each real run should define independent Ankara routes and fixed points before collection. A point annotation must have a stable point ID, site ID, route ID, point window, LOS/NLOS source, and outdoor state. Route IDs are retained separately from transmitter site IDs so a measurement site is not confused with a configured base-station site.

The pilot should stratify both 2.6 GHz and 28 GHz by distance, LOS/NLOS, outdoor state, dense/open morphology, and route/site. It should include near/mid/far points within the canonical 10–5000 m distance envelope and deliberately label points that are outside it rather than filtering them into a headline result.

## 10. Fixed points, moving routes, and repeats

Fixed-point samples remain raw and repeated. The importer groups them by annotated point window and records sessions per fixed point. It does not average samples to improve residuals. Moving routes retain the source timestamp, GNSS accuracy, speed, and motion state; a manifest default is only a declared collection state, not a measured speed.

The minimum real pilot should repeat each fixed point in independent sessions, repeat routes in both directions where safe, and reserve sites/routes/campaigns for holdout before inspecting residuals. Stationary and moving rows remain separate strata. Mean, median, p10, and p90 may be reported as named descriptive summaries of the preserved raw group, but the raw samples remain the evidence and no summary is selected to improve a residual.

## 11. Receiver-height policy

The receiver height is a manifest value with explicit provenance. The dry run uses 1.8 m `configured` for a controlled handset fixture; a real run should record how the height was measured or configured for the operator’s carry position. The importer refuses a missing height and never falls back to the canonical 1.5 m value.

The transmitter map’s antenna height is planning configuration and has its own provenance. Neither height is inferred from GPS altitude or a map profile without a declared source.

## 12. GPS and coordinate policy

The selected coordinate contract is WGS84/EPSG:4326, UTC-normalized timestamps, GNSS horizontal accuracy, altitude, and speed. A fix over the manifest’s accuracy limit remains in the raw file and is counted as poor position; its coordinates are omitted from canonical geometry. A missing fix is counted separately. No coordinate is copied from a transmitter map or neighboring row.

The dry run intentionally includes one poor-accuracy row and one missing-fix row. The quality report shows both without claiming a field path result for them.

## 13. Time synchronization

The parser preserves ISO timestamp, epoch milliseconds, elapsed realtime nanoseconds, session ID, sequence number, and cell timestamp. It normalizes an ISO timestamp to UTC for the canonical row while retaining the original raw bytes. A timestamp/epoch difference over two seconds is a warning, not a silent correction. Decreasing elapsed realtime within a session is a separate warning.

The real campaign should synchronize handset and any external annotation device before each session, record timezone and clock source, and reject or quarantine runs with large skew. Timestamp warnings remain in the quality artifact.

## 14. Quantity semantics

The adapter preserves the following distinctions:

| Source field | Canonical quantity | Meaning | Missing-field rule |
| --- | --- | --- | --- |
| LTE `rsrp` / NR `ss_rsrp` | `rsrp_dbm` | reference-signal received power | no conversion from RSSI or generic dBm |
| LTE `rsrq` / NR `ss_rsrq` | `rsrq_db` | reference-signal quality | requires canonical radio-quality context |
| LTE `rssnr`/`sinr` / NR `ss_sinr` | `sinr_db` | serving signal-to-interference-plus-noise ratio | never substituted with RSRP |
| LTE `rssi` | `rssi_dbm` | wideband RSSI | never cross-compared with RSRP |
| none | `received_power_dbm` | absolute link received power | never fabricated by the adapter |

The canonical evaluator supplies predicted values only where the existing Concept 6A quantity contract permits. Residuals remain measured minus predicted. The importer does not choose a statistic or combine quantities.

## 15. Detection floors and censoring

The selected V6 export does not guarantee an explicit detection floor or left/right censoring semantics. The manifest therefore declares detection unavailable and requires empty/unavailable source fields to remain missing. An empty measurement is not a censored value, and a detection floor is never substituted.

If a future collector supplies a real floor, the adapter must carry the limit and censoring direction into the existing Concept 6A fields. Those records are counted but excluded from ordinary exact residual metrics according to the frozen evaluator policy.

## 16. Neighbor and radio-quality context

Raw neighbor rows are retained when they share a cell-timestamp group, but the dry-run manifest declares `neighbor_context_complete: false`. This means LTE SINR, RSRQ, and RSSI remain `interference_validation_limited` even though the source values are present. A 28 GHz row without raw bandwidth stops earlier at `bandwidth_missing`.

For a real radio-quality pilot, the campaign must export serving and neighbor identities, channel and bandwidth/resource semantics, sampling context, and any required load/interference metadata. The adapter must not derive a complete interference denominator from a partial neighbor list.

## 17. Quality report

The report includes raw/parsed/cell/serving/neighbor counts, ambiguous groups, valid/poor/missing coordinates, valid/missing measurements, valid/missing frequency, receiver-height status, serving identity and mapping counts, stationary/moving/unclassified counts, timestamp warnings, fixed-point groups, per-quantity readiness, exclusion reasons, issues, and notes.

The quality report is a gate, not a score. A high parse count cannot override missing bandwidth, incomplete interference context, unresolved identity, poor position, unknown LOS/NLOS, or missing calibration semantics.

## 18. Source adapter and canonical path

The end-to-end path is:

`raw V6 bytes → escaped V6 parser → manifest/map validation → source rows and quality counters → canonical quantity-preserving observations → existing Concept 6A evaluator → per-quantity readiness`.

The adapter is source-specific only up to the canonical schema. It does not call a planning route, mutate the canonical RF profile, or pass calibration into the production evaluator. The CLI writes a separate JSON report and leaves the raw input untouched.

Run it with:

```text
cd backend-go
go run ./cmd/import-concept-6a1 \
  -raw ../examples/concept-6a1-signal-collector-dry-run.txt \
  -manifest ../examples/concept-6a1-dry-run-campaign.json \
  -transmitter-map ../examples/concept-6a1-dry-run-transmitter-map.json \
  -output /tmp/concept-6a1-report.json
```

## 19. Dry-run status and real-data boundary

The controlled export is explicitly `synthetic_controlled`. It proves parser, raw checksum, mapping, quantity semantics, GPS handling, fixed-point grouping, canonical invocation, holdout retention, and readiness reporting. It does not prove handset accuracy, transmitter truth, device calibration, or Ankara field conditions.

For the original Concept 6A.1 phase, no real data had been supplied, so that implementation stopped at the synthetic dry-run report. The optional pilot validation artifact was deliberately absent. No synthetic residual was promoted as a field result. The later real-recording result is documented separately in [`concept-6a1-1-real-pilot-ingestion.md`](concept-6a1-1-real-pilot-ingestion.md); it also stops before residual evaluation because canonical serving observations could not be constructed.

## 20. Per-quantity readiness

The original synthetic dry-run readiness, preserved in [`concept-6a1-dry-run-readiness.json`](concept-6a1-dry-run-readiness.json), reported:

- 2.6 GHz `rsrp_dbm`: two applicable controlled observations and suitable for the dry-run validation path;
- 28 GHz `rsrp_dbm`: blocked by missing raw bandwidth, despite configured map bandwidth;
- 2.6 GHz `sinr_db`, `rsrq_db`, and `rssi_dbm`: source values retained but blocked by incomplete neighbor/interference context;
- 28 GHz `sinr_db` and `rsrq_db`: blocked by missing bandwidth before radio-quality evaluation; and
- `received_power_dbm`: no rows, because the adapter never fabricates it from RSRP.

These were tooling readiness results, not a claim that the canonical RF model is validated. The active [`concept-6a1-readiness.json`](concept-6a1-readiness.json) now records the real pilot as `real_data_ingested_validation_blocked`; source-level candidate quantities do not count as canonical validation observations.

## 21. Independence and holdouts

The canonical response retains the existing spatial-block holdout policy with primary holdout enabled. The real campaign plan must reserve spatial blocks, sites, routes, and campaigns before any calibration decision. Repeated samples from one fixed point are not independent merely because their timestamps differ.

The campaign manifest keeps device, antenna, calibration, route, site, session, point, and raw checksum identifiers so a later audit can group by the correct independence unit. No random row split is promoted as the primary evidence design.

## 22. Uncalibrated baseline policy

Concept 6A.1 reports only uncalibrated readiness. The receiver calibration state is recorded as provenance, not applied as a correction. The dry run sets `calibration_active: false` and `suitable_for_calibration_study: false`.

If real observations eventually pass quantity, mapping, metadata, and holdout gates, a first uncalibrated report must include `n`, bias, median residual, MAE, RMSE, p90 absolute error, and relevant frequency/LOS/distance/site/session strata. Any frequency-specific constant-bias study remains the diagnostic-only Concept 6A procedure. It must be fit on calibration blocks and assessed on held-out blocks before any separate 6B decision.

## 23. No production promotion

The CLI and adapter have no optimizer/planner integration. `production_candidate` is false, and no measurement field changes a canonical RF profile or a network scenario. The canonical evaluator’s diagnostic calibration output, when present, is not activated or promoted.

## 24. Concept 6B gate and next step

Concept 6B is not ready. The real recordings establish that raw local field data exists, but the importer generated zero canonical observations. The immediate blocker is the source-contract conflict between `registered=true`, `connection_status=NONE`, and collector `SERVING_CELL_CHANGED` events. The next action is to obtain authoritative Signal Collector semantics for that relationship before deciding whether a deterministic additive adapter rule is justified. Do not collect another campaign automatically. Other validation gates remain separately documented in the Concept 6A.1.1 readiness artifact.

## 25. Privacy, licensing, and safety

The manifest excludes subscriber name, phone number, IMSI, IMEI, account identifiers, and raw device advertising identifiers from the canonical record. Raw files remain restricted campaign artifacts. Cell identities are retained only because deterministic serving-cell mapping requires them; sharing must be pseudonymous and consented.

Before a real run, obtain operator, site, participant, institutional, and app/export permissions as applicable. Verify the collector’s current terms and any redistribution constraints. Do not collect or publish personal identifiers, do not transmit test signals, and do not use root or privileged access without an explicit device-specific audit.

## 26. Reproducibility and fingerprints

The raw checksum, manifest version, transmitter-map version, adapter version, canonical observation checksum, validation fingerprint, scenario fingerprint, device pseudonym, sessions, and point IDs form the reproducibility record. The validation fingerprint excludes local paths, runtime, memory, worker count, and UI state.

The dry run is repeatable: the raw SHA-256 and canonical validation fingerprint are stable across repeated evaluations. Gzip input uses the checksum of the original compressed bytes, so a container change is visible even when decompressed rows are identical.

## 27. Invariance tests

The artifact test captures the current 2.6 GHz and 28 GHz canonical snapshots before and after the tooling change. It asserts exact equality, equal optimizer-independent scenario fingerprints, unchanged Concept 6A readiness, no calibration activation, and no production candidate. The change is acquisition-only, so antenna/link-budget, interference/radio-quality, terrain, and optimizer policies remain untouched; the existing 140 GHz/4I reference scope is also outside this adapter. Backend tests also cover escape parsing, malformed rows, gzip checksums, missing receiver height, provenance rejection, no-default behavior, missing frequency, neighbor exclusion, fixed-point grouping, quantity mapping, and deterministic repeated evaluation.

## 28. Files, commands, and recommendation

Key files:

- [`concept_6a1_campaign_tooling.go`](../backend-go/raytracer/concept_6a1_campaign_tooling.go): parser, manifest/map validation, adapter, quality report, and evaluator wrapper;
- [`concept_6a1_campaign_tooling_test.go`](../backend-go/raytracer/concept_6a1_campaign_tooling_test.go) and [`concept_6a1_campaign_artifact_test.go`](../backend-go/raytracer/concept_6a1_campaign_artifact_test.go): regression and artifact tests;
- [`concept-6a1-campaign-manifest.schema.json`](concept-6a1-campaign-manifest.schema.json) and [`concept-6a1-transmitter-map.schema.json`](concept-6a1-transmitter-map.schema.json): strict contracts;
- [`concept-6a1-collector-audit.json`](concept-6a1-collector-audit.json): selected tool and alternatives audit;
- [`concept-6a1-dry-run-validation.json`](concept-6a1-dry-run-validation.json), [`concept-6a1-dry-run-readiness.json`](concept-6a1-dry-run-readiness.json), active [`concept-6a1-readiness.json`](concept-6a1-readiness.json), [`concept-6a1-pre-change-baseline.json`](concept-6a1-pre-change-baseline.json), and [`concept-6a1-post-change-comparison.json`](concept-6a1-post-change-comparison.json): generated evidence; and
- [`concept-6a1-signal-collector-dry-run.txt`](../examples/concept-6a1-signal-collector-dry-run.txt), [`concept-6a1-dry-run-campaign.json`](../examples/concept-6a1-dry-run-campaign.json), and [`concept-6a1-dry-run-transmitter-map.json`](../examples/concept-6a1-dry-run-transmitter-map.json): synthetic fixtures.

Validation commands:

```text
cd backend-go && go test ./...
cd backend-go && go test -race ./...
cd backend-go && go vet ./...
cd backend-go && ATOM_RUN_CONCEPT_6A1_AUDIT=1 go test ./raytracer -run '^TestGenerateConcept6A1Artifacts$' -count=1
sh docs/build-reference-pages.sh
data-pipeline/.venv/bin/python docs/validate_docs.py
python3 scripts/versioning.py check
git diff --check
```

Recommendation: proceed to a consented real pilot for acquisition and quality auditing only. Do not call the current dry run validation evidence, do not activate calibration, and do not open the Concept 6B gate until real-data and independent-review requirements are met.

## 29. Concept 6A.1.1 real Ankara pilot

The 2026-10-02 stationary-control and walking-pilot files were parsed exactly: 53,005 of 53,005 data rows, no malformed or dropped samples, and 1,858 elapsed-realtime ordering warnings. The export contains 83 `registered=true` CellInfo snapshots, all with `connection_status=NONE`, plus 37 explicit `SERVING_CELL_CHANGED` events. The events are reported as collector serving-cell changes, not protocol handovers; they do not override the conflicting CellInfo status.

LTE B7/EARFCN 3200 at 2665 MHz appears in 29 registered-flag snapshots, with two pseudonymous candidate identities and 28 source RSRP values. The Android CellInfo connection status prevents promotion to canonical serving observations. The active Ankara planning pack has no exact identity matches. Bandwidth is unavailable on each B7 cell row, and ServiceState bandwidth vectors cannot be associated with an exact B7 identity. No residuals were computed.

The receiver height is recorded as nominal 1.4 m AGL, operator-estimated, approximately 1.3–1.5 m, handheld/chest height and approximately constant relative to local ground. The manifest uses `height_source: assumed` because the existing schema does not offer `user_estimated`. Outdoor and LOS/NLOS remain unknown. No calibration, RF change, optimizer change, UI work, or Concept 6B work occurred.

The sanitized record set is [`concept-6a1-1-real-pilot-ingestion.md`](concept-6a1-1-real-pilot-ingestion.md), [`concept-6a1-1-readiness.json`](concept-6a1-1-readiness.json), and the linked audit JSON files. The raw files and exact route coordinates remain outside the repository.

Historical recommendation: use a consented real pilot for acquisition and QA only. Current recommendation: resolve the Signal Collector serving-status semantics before considering additional adapter work. The synthetic dry run remains historical evidence, not a field result.
