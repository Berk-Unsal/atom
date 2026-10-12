# Concept 6A.1.1 — Real Ankara Pilot Ingestion and Transmitter Reconciliation

**Date:** 2026-10-02  
**Decision:** **A — REAL INGESTION FAILED at the trustworthy canonical-observation boundary.** Both Signal Collector V6 files parse completely, but the existing importer emits **zero canonical observations**. The files contain LTE quantities and collector-reported serving-cell changes, yet every CellInfo snapshot reports `connection_status=NONE`, including every `registered=true` snapshot. The importer correctly declines to promote them.

No propagation residual, absolute validation metric, calibration, RF change, optimizer change, persistence change, or UI work was performed. Concept 6B was not opened. The optional `concept-6a1-pilot-validation.json` remains absent.

## Raw files and immutable parse

The raw files remain at the operator-provided external locations. Their bytes were not modified, and neither the files nor precise route coordinates are tracked.

| Session | File | SHA-256 | Bytes | Header rows | Parsed rows | Duration | Collector distance |
|---|---|---|---:|---:|---:|---:|---:|
| `stationary_control` (source session `1`) | `data-stationary-test.txt` | `ae4c62426eb02e6de158220fbb43a5eb978fdfa72b5550483b5cf25d12680fc7` | 3,642,965 | 7,374 | 7,374 | 121,199 ms | 226.4 m |
| `walking_pilot` (source session `2`) | `data-walking-test.txt` | `9d7aa4830391304a1a255c059c4c15dcb1b48c6f0de623dad4d934f7966c8f2f` | 22,175,305 | 45,631 | 45,631 | 823,293 ms | 1,297.6 m |

Both headers report `COMPLETED`, `USER_STOP`, accepted and written sample counts equal to `record_count`, zero dropped samples, no writer error, zero tail gap, and a 20 m distance accuracy setting. The sequence numbers are continuous and unique; epoch timestamps have no decreases or skew rows. All rows parsed without malformed records. The parser recorded 237 stationary and 1,621 walking `elapsed_realtime_ns` ordering warnings (1,858 total); these source values were retained without repair.

The two headers independently identify a Samsung SM-A325F handset, Android 13, SDK 33. The Signal Collector app version is not reported. Per-source counts and checks are in [`concept-6a1-1-raw-file-audit.json`](concept-6a1-1-raw-file-audit.json).

| Raw V6 source | Stationary | Walking | Combined |
|---|---:|---:|---:|
| `session` | 2 | 2 | 4 |
| `location` | 131 | 868 | 999 |
| `mobile_network` | 276 | 1,755 | 2,031 |
| `gnss_satellite` | 6,459 | 41,400 | 47,859 |
| `gnss_navigation` | 482 | 1,447 | 1,929 |
| `gnss_antenna` | 1 | 1 | 2 |
| `collector_heartbeat` | 23 | 158 | 181 |
| **All parsed rows** | **7,374** | **45,631** | **53,005** |

Mobile-network records comprise 224 `cell`, 1,005 `event`, and 802 `signal_strength` rows. Event types include 37 `SERVING_CELL_CHANGED` (7 stationary, 30 walking), 79 `SERVICE_STATE_CHANGED`, 802 `SIGNAL_STRENGTH_CHANGED`, and 83 `CELL_LIST_CHANGED`. Android's [`CellInfo` API](https://developer.android.com/reference/android/telephony/CellInfo) defines `CONNECTION_NONE` separately from primary/secondary serving status; `isRegistered()` is a separate field. The change events are reported as collector serving-cell changes, not network-protocol handovers. Their presence does not resolve the conflicting per-cell connection status.

## GNSS quality and distance interpretation

Only GPS-provider fixes are counted as GPS geometry. Network-provider locations remain a separate population; the two were not merged into one accuracy claim.

| Session | GPS fixes | Network fixes | GPS horizontal accuracy p50 / p90 / p95 / max | GPS cadence p50 / p90 / max | GPS gaps over 5 s |
|---|---:|---:|---|---|---:|
| Stationary | 122 | 7 | 1.8 / 2.0 / 2.495 / 10.2 m | 1.001 / 1.038 / 1.148 s | 0 |
| Walking | 823 | 43 | 1.7 / 1.9 / 1.9 / 21.2 m | 1.001 / 1.038 / 4.041 s | 0 |

Stationary GPS fixes have median/p90/p95/max vertical accuracy of 11.3/14.15/15.395/129.8 m, speed of 0/0.091/0.357/1.586 m/s, and exported altitude of 852.5/855.09/855.4/858.2 m. For the 122 fixes at the manifest's 20 m threshold, radial excursion from the coordinate-wise median has p50 4.0 m, p90 and p95 7.05 m, and max 19.19 m. Accumulated GPS point-to-point distance is 44.45 m. At the ≤10 m and ≤5 m sensitivity gates, accumulated distance is 31.01 m and 28.07 m respectively; the manifest's declared 20 m gate remains the pipeline threshold.

The collector's 226.4 m stationary `distance_m` is not RF geometry. It exceeds the ≤20 m GPS polyline by 181.95 m, but the export does not identify the exact cause. A stationary GPS polyline accumulates position jitter and is not physical travel distance.

Walking has 822 GPS fixes within 20 m and one above the threshold. GPS vertical accuracy p50/p90/p95/max is 8.5/10.58/11.29/303.3 m; speed is 1.168/1.447/1.536/1.709 m/s. The approximate GPS polyline using ≤20 m fixes is 1,153.85 m, 143.75 m below the collector-reported 1,297.6 m. Tighter ≤10 m and ≤5 m gates yield 1,118.61 m and 1,100.26 m. These are separate diagnostics, not corrected traveled-distance values. Exported altitude is not receiver height AGL. Full distributions and provider counts are in [`concept-6a1-1-gnss-quality.json`](concept-6a1-1-gnss-quality.json).

The receiver is recorded as 1.4 m AGL, operator user-estimated, with an approximate 1.3–1.5 m carry range. The handset was handheld/chest height and approximately constant relative to local ground while the user walked over changing terrain. The current manifest schema has no `user_estimated` enum, so its closest supported provenance is `height_source: assumed`; that limitation is explicit in the [campaign manifest](concept-6a1-1-campaign-manifest.json). Outdoor state and LOS/NLOS remain unknown.

## Cell rows, quantities, and B7 subset

All 224 raw CellInfo rows are LTE. **83 rows have `registered=true`; all 83 and all 141 `registered=false` rows have `connection_status=NONE`.** Thus the raw export has zero rows meeting the existing adapter's serving predicate. It classifies all 224 as neighbor/context rows and emits zero canonical observations. The raw RSRP fields are present on 221 rows, RSRQ, RSSI, SINR/RSSNR, and frequency are present on all 224, and normalized bandwidth is empty on all 224.

The files contain eight distinct registered-flag identity tuples: five in the stationary session and six in walking, with overlap across sessions. The collector emits 7 and 30 `SERVING_CELL_CHANGED` events respectively. Those events provide source-reported identity changes but are not treated as handovers or used to override the conflicting CellInfo state. Session 1 is a handset/network behavior control, not a one-transmitter fixed-point control. Session 2 is moving route evidence with multiple source identity candidates and autocorrelated repeats.

| LTE band | EARFCN / frequency | Registered-flag snapshots (stationary / walking) | Distinct identity tuples | RSRP present | RSRQ / RSSI / SINR present | ≤20 m GPS-linked rows | Bandwidth present |
|---|---|---:|---:|---:|---:|---:|---:|
| B1 | 451 / 2155.1 MHz | 8 / 17 | 3 combined | 24 / 25 | 25 / 25 / 25 | 23 | 0 |
| B3 | 1306 / 1815.6 MHz | 1 / 27 | 2 combined | 27 / 28 | 28 / 28 / 28 | 25 | 0 |
| B7 | 3200 / 2665.0 MHz | 1 / 28 | 2 | 28 / 29 | 29 / 29 / 29 | 28 | 0 |
| B20 | 6200 / 796.0 MHz | 1 / 0 | 1 | 1 / 1 | 1 / 1 / 1 | 1 | 0 |

Band figures describe rows whose source `registered` field is true; **none is a confirmed serving observation**. B7 has 29 such snapshots across the two sessions and two pseudonymous candidate identities. RSRP is available on 28: combined p50 −67.0 dBm, p90 −61.7 dBm, p95 −57.1 dBm, range −83 to −54 dBm. Of those, 27 rows also have a GPS coordinate within the manifest's 20 m threshold. The serving-status gate still fails, so the count of usable canonical B7 observations is zero.

B7 RSRQ is present on 29/29 (p50 −12, p90 −8, p95 −7.4 dB); RSSI is present on 29/29 (p50 −57, p90/p95 −51 dBm); RSSNR/SINR is present on 29/29 and equals 0 dB. Android's [`CellSignalStrengthLte` API](https://developer.android.com/reference/android/telephony/CellSignalStrengthLte) documents RSSNR as a signed dB quantity with a separate unavailable sentinel; zero is retained as a valid value, not changed to missing. NR is absent: no NR technology, `nrarfcn`, `ss_rsrp`, `ss_rsrq`, or `ss_sinr` fields occur. [`concept-6a1-1-radio-inventory.json`](concept-6a1-1-radio-inventory.json) and [`concept-6a1-1-b7-evidence.json`](concept-6a1-1-b7-evidence.json) retain the aggregate evidence.

The 802 generic signal-strength callbacks contain no cell ID, PCI, or EARFCN. Their `dbm` field is not reinterpreted as RSRP and is not attached to the latest cell snapshot. The importer uses the cell rows' explicit quantities and does not count the callback as an independent radio observation.

Cell-snapshot cadence is sparse compared with GNSS: stationary group intervals have p50 20.898 s and max 28.405 s; walking groups have p50 10.736 s and max 38.444 s. Signal-strength callback intervals have p50 1.272 s (stationary) and 1.252 s (walking). For source candidate rows, diagnostic nearest-GPS age p50 is 0.223 s stationary and 0.228 s walking; this nearest-age diagnostic did not change the importer's ordered same-session prior-fix/inline-location policy.

Neighbor context is incomplete: unregistered neighbors appear in 9/10 stationary and 50/71 walking cell-timestamp groups. Twenty-two groups have no unregistered neighbor row. This is not a complete interference denominator, so RSRQ, SINR, and RSSI remain limited to source QA and cannot validate A.T.O.M radio quality.

## Bandwidth audit

All 29 B7 CellInfo snapshots have empty normalized bandwidth. Their raw LTE `CellIdentityLte` bandwidth value is `2147483647` on every row, the Android unavailable sentinel. ServiceState carries bandwidth vectors on channel 3200, commonly 10,000 kHz, but its nested identity is masked or does not supply an exact PCI match for either B7 candidate; channel and subscription context do not resolve the two same-channel candidate identities, especially when their CellInfo rows say `NONE`. No exact bandwidth-to-observation or exact identity-context assignment is established. Measured bandwidth remains unavailable. A.T.O.M configured bandwidth is not substituted. See the official Android [`CellIdentityLte`](https://developer.android.com/reference/android/telephony/CellIdentityLte) and [`ServiceState`](https://developer.android.com/reference/android/telephony/ServiceState) APIs. The per-source audit is [`concept-6a1-1-bandwidth-audit.json`](concept-6a1-1-bandwidth-audit.json).

## A.T.O.M transmitter reconciliation and RF truth

The active `ankara-open-planning` pack has 451 LTE records from OpenCellID-derived planning data and is explicitly not operator-verified. Its `cell_id` carries the source OpenCellID `cell` value through pack normalization; it is a cell-level source identifier, not PCI, site ID, or tower ID. `source_cell_id` is absent from all current records; PCI and EARFCN fields are absent. All records have `is_simulated=true` because the pack uses an LTE-as-5G fallback mode; that planning flag does not make the rows measured transmitter truth.

The exact join attempted was PLMN + observed Cell ID. There were zero exact matches. The pack contains eight records with PLMN 28603, but none matched an observed candidate Cell ID. A deterministic PCI + channel mapping is unavailable because the pack has no PCI or EARFCN fields. No geographic, strongest-signal, nearest-cell, or residual-based selection was made.

For B7, the two pseudonymous candidates are `cell-d3d772729614` (11 snapshots across both sessions; PCI 276) and `cell-e8389d1a5860` (18 walking snapshots; PCI 296), both EARFCN 3200 / 2665 MHz. Exact mappings: **0/2**. Deterministic identity mappings: **0/2**. Unresolved: **2/2**. Across the registered-flag identity pool, exact/deterministic mappings are 0/8; all 83 candidate snapshots remain unresolved. A real transmitter-map candidate was not created.

There are no mapped B7 transmitters to audit. For the actual transmitter candidates, location, serving Cell/sector truth, bandwidth, conducted TX power and its reference plane, antenna gain/pattern/beamwidth, azimuth, tilt, antenna height, system loss, and polarization are unknown. The planning pack does not make those fields actual truth. The handset's built-in antenna is known, but the receiver is uncalibrated and has no applied correction. Truth detail is in [`concept-6a1-1-transmitter-reconciliation.json`](concept-6a1-1-transmitter-reconciliation.json) and [`concept-6a1-1-transmitter-truth.json`](concept-6a1-1-transmitter-truth.json).

## Applicability, readiness, and decision

Absolute uncalibrated RSRP validation is **NO-GO**. The serving-source conflict already yields zero canonical observations. Further independent blockers include zero exact transmitter mappings; the measured B7 frequency of 2.665 GHz differs by 0.065 GHz from the canonical 2.600 GHz profile and is outside the frozen exact frequency-match tolerance; unavailable/ambiguous bandwidth and resource semantics; unknown TX RF truth and 2D geometry; and unknown outdoor/LOS state. The receiver height is operator-estimated as above, but device calibration is absent. No assumption-bound exploratory comparison is attempted because there is no exact transmitter identity or trustworthy canonical serving observation.

RSRP, RSRQ, SINR, RSSI, and received carrier power readiness are reported separately. The source contains B7 RSRP/RSRQ/SINR/RSSI values, but canonical validation counts are zero for all; the importer does not derive `received_power_dbm` from handset RSRP. Radio-quality validation is additionally blocked by incomplete neighbor/resource context. `calibration_active=false`, `suitable_for_calibration_study=false`, and `production_candidate=false`. Concept 6A remains `no_measurement_data` at its canonical layer; its project readiness now distinguishes real raw data availability from canonical observation availability. Concept 6A.1 state is `real_data_ingested_validation_blocked`.

**One next action:** obtain authoritative Signal Collector/source documentation for how `registered=true`, `connection_status=NONE`, and `SERVING_CELL_CHANGED` identity pairs relate. Only after that can we decide whether an additive deterministic adapter rule is scientifically justified. No further campaign is scheduled automatically.

## Existing importer first run and reproducible commands

The existing CLI was run unmodified for each file. Both commands exited 0 and parsed all rows, but emitted 0 canonical observations. The example transmitter map below was only an unmatched sentinel to satisfy the strict non-empty map schema; it is **not** a real transmitter map and did not match the recording.

```sh
cd backend-go
RAW_STATIONARY=/path/to/data-stationary-test.txt
RAW_WALKING=/path/to/data-walking-test.txt

go run ./cmd/import-concept-6a1 \
  -raw "$RAW_STATIONARY" \
  -manifest ../docs/concept-6a1-1-campaign-manifest.json \
  -transmitter-map ../examples/concept-6a1-dry-run-transmitter-map.json \
  -output /tmp/concept-6a1-1-stationary-import.json

go run ./cmd/import-concept-6a1 \
  -raw "$RAW_WALKING" \
  -manifest ../docs/concept-6a1-1-campaign-manifest.json \
  -transmitter-map ../examples/concept-6a1-dry-run-transmitter-map.json \
  -output /tmp/concept-6a1-1-walking-import.json
```

Replace the two `/path/to/...` placeholders with the local export paths before running the commands.

The local report JSON files each contain zero observation rows; their SHA-256 hashes and sizes are recorded in the raw-file audit. Any future run intended to reconcile a transmitter must supply a reviewed source-truth map rather than the example sentinel.

## Change boundary and tests

The only backend source addition is a sanitized V6 regression fixture and test asserting that contradictory source serving fields and `cell_id=0` neighbor rows do not become canonical observations. The production importer, canonical evaluator, RF equations, optimizer, API, fingerprints, persistence, and UI were not changed. The old synthetic dry-run artifact is preserved as historical evidence. No route plot or coordinate-bearing observation output is tracked.

Post-change validation is recorded in [`concept-6a1-1-test-evidence.json`](concept-6a1-1-test-evidence.json) and [`concept-6a1-1-post-change-comparison.json`](concept-6a1-1-post-change-comparison.json). The required audits are [`concept-6a1-1-pre-change-baseline.json`](concept-6a1-1-pre-change-baseline.json), [`concept-6a1-1-raw-file-audit.json`](concept-6a1-1-raw-file-audit.json), [`concept-6a1-1-session-quality.json`](concept-6a1-1-session-quality.json), [`concept-6a1-1-gnss-quality.json`](concept-6a1-1-gnss-quality.json), [`concept-6a1-1-radio-inventory.json`](concept-6a1-1-radio-inventory.json), [`concept-6a1-1-b7-evidence.json`](concept-6a1-1-b7-evidence.json), [`concept-6a1-1-bandwidth-audit.json`](concept-6a1-1-bandwidth-audit.json), [`concept-6a1-1-transmitter-reconciliation.json`](concept-6a1-1-transmitter-reconciliation.json), [`concept-6a1-1-transmitter-truth.json`](concept-6a1-1-transmitter-truth.json), [`concept-6a1-1-applicability.json`](concept-6a1-1-applicability.json), and [`concept-6a1-1-readiness.json`](concept-6a1-1-readiness.json).
