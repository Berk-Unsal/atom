# Concept 6A.2 — External RF Benchmark & Inventory Reconstruction Feasibility Audit

Audit date: 2026-09-21
Repository baseline: `main` at `92711dbcccae5a4de6e4d63c9f274082e890a50f`
Decision: **No external benchmark selected. No adapter implemented. 6B remains closed.**

This is a source and feasibility audit only. It preserves the existing dirty worktree and does not change the canonical RF evaluator, inventory semantics, validation results, calibration state, optimizer behavior, terrain behavior, or scenario fingerprints.

## 1. Inventory capability

The current inventory boundary can represent cell/tower coordinates, optional azimuth, technology, channel/frequency, bandwidth, conducted TX power, absolute TX gain, RX gain, system/polarization loss, height, mechanical/electrical tilt, orientation, a finite set of built-in antenna patterns, load/reuse, PCI, receiver height, and receiver sensitivity/noise fields.

It does not have first-class site/operator identifiers, EIRP, arbitrary radiation-pattern files, explicit neighbor relationships, or a general external-provenance field in the production inventory. The normal planning UI/profile resolver supplies defaults, including canonical 2.6/28 GHz profile defaults; those defaults are forbidden for external benchmark reconstruction.

The exact capability map is recorded in [`concept-6a2-inventory-capability.json`](concept-6a2-inventory-capability.json).

## 2. Benchmark fitness contract

The contract separates transmitter truth from measurement truth. It requires explicit evidence for:

- transmitter identity and coordinates;
- height, azimuth, mechanical/electrical tilt;
- carrier frequency, band, bandwidth, technology, and resource semantics;
- conducted power or EIRP with a reference plane;
- absolute antenna gain and radiation pattern;
- exact measured quantity and its device/reference-signal definition;
- serving-cell mapping, channel identity, receiver/device/calibration provenance, receiver height, sampling, aggregation, missingness, and censoring;
- environment/holdout support; and
- public access, license, versioned provenance, and field documentation.

The full gate and claim-specific gates are in [`concept-6a2-benchmark-fitness-contract.json`](concept-6a2-benchmark-fitness-contract.json). A measurement of RSRP, RSRQ, SINR, RSSI, or path loss is never silently substituted for another quantity.

## 3. Sources researched

The audit inspected authoritative landing pages, READMEs/data dictionaries, metadata, and small samples where available. It did not download the large Vienna archive or any other large archive merely to improve a score.

The leading sources were:

- [Chongqing 5G macrocell dataset on Zenodo](https://zenodo.org/records/20564635), including its [CC BY 4.0 data license](https://zenodo.org/records/20564635/files/LICENSE.txt?download=1). The release advertises raw RSRP/RSRQ/SINR, GNSS positions, cell identifiers, a base-station table, and building/DEM products. The inspected small files exposed 81,419 raw rows, 189 base rows, and a material raw-ARFCN/base-downlink reconciliation problem.
- [Vienna 4G/5G Drive-Test Dataset](https://zenodo.org/records/21372657) and its [technical paper](https://arxiv.org/html/2603.02638v2). The paper documents 2,893,129 records, exact LTE B7/2.6 measurements, several RSRP/RSRQ/RSSI/SINR/path-loss fields, WGS84 tracks, and building/terrain context, but the public deployment table is inferred and lacks complete absolute RF configuration. The full archive is large.
- [LACN-Dataset](https://github.com/ycw671/LACN-Dataset/blob/main/README.md). It exposes serving/detected RSRP/SINR, local coordinates, and advertised station azimuth/tilt data, but uses n79/approximately 4.9 GHz, has no power/gain/pattern contract, uses a proprietary `.numbers` station file, and has no repository license identified in the audit.

Other sources were checked as controls or rejection candidates:

- [AERPAW LTE measurements on Dryad](https://datadryad.org/dataset/doi:10.5061/dryad.r7sqv9sr3): useful RSRP/RSRQ/RSSI observations, but no matched transmitter inventory or complete RF configuration.
- [POWDER cellular data](https://powderwireless.net/data), including the [cellular metrics record](https://zenodo.org/records/18272105): useful channel/cell measurements, but no complete public transmitter inventory and no exact 2.6/28 pair.
- [TalTech mmWave dataset](https://zenodo.org/records/18889490): metadata advertises relevant 5G measurements, but the raw files are restricted, so the access stop condition applies.
- [A campus-scale 5G NR dataset](https://data.mendeley.com/datasets/7gs87p73sg/1): useful building/DEM and measurement material, but its public description says unavailable transmitter parameters were calibrated against measured RSRP; that fails the independent uncalibrated-truth gate.
- [SUTD private-5G dataset](https://github.com/FCCLab/sutd_5g_dataset_2023): device measurements and scenario files, without a general transmitter inventory or clear rights metadata.
- [COSMOS coverage measurements](https://www.cosmos-lab.org/wiki/public/legacy): Wi-Fi 802.11g at 2.412 GHz, not a cellular 2.6/28 benchmark.
- [mMobile 28 GHz CSI repository](https://github.com/ucsdwcsng/mMobile): 28 GHz channel/CSI research traces, not cellular serving-cell measurements or transmitter inventory truth.

## 4. Candidate matrix

The normalized field-by-field matrix is in [`concept-6a2-candidate-matrix.json`](concept-6a2-candidate-matrix.json). Its conclusion is:

| Class | Sources |
| --- | --- |
| Full inventory validation candidate | None |
| Propagation-validation near-candidate | Chongqing macro; Vienna drive-test |
| Quantity-validation near-candidate | LACN; AERPAW; POWDER |
| Rejected | TalTech; Mendeley campus; SUTD; COSMOS; mMobile |

This is a readiness classification, not a numeric ranking.

## 5. Shortlist

The three-source shortlist is documented in [`concept-6a2-shortlist.json`](concept-6a2-shortlist.json):

1. Chongqing — strongest transmitter-metadata near-candidate.
2. Vienna — strongest measurement/environment near-candidate.
3. LACN — useful geometry/tilt contrast, but outside the canonical frequency pair and incomplete legally/physically.

Shortlist membership does not open 6B and does not authorize an adapter.

## 6. Transmitter truth

Chongqing has the best public transmitter table: coordinates, height, angle, electrical/mechanical tilt, bandwidth, and a numeric antenna transmit-power field. However, the audit could not establish whether that power is conducted output, EIRP, or another reference-plane quantity; antenna gain and radiation pattern are not supplied; and some raw serving identifiers do not map to the base table.

Vienna’s deployment geometry is explicitly inferred. Its public cell information is useful for spatial analysis, but it is not direct transmitter configuration truth. The public table does not supply TX power/EIRP, gain, pattern, tilt, or bandwidth sufficient to reconstruct a canonical link budget.

LACN advertises azimuth and mechanical/electrical tilt, but lacks power, gain, pattern, bandwidth, and a generally usable coordinate/provenance contract.

## 7. Measurement truth

Chongqing exposes raw `SS_RSRP`, `SS_RSRQ`, and `SS_SINR` fields with timestamps, coordinates, band/channel values, and identifiers. Vienna exposes scanner/phone RSRP, RSRQ, RSSI, SINR, CINR, and estimated path-loss fields. LACN exposes serving/detected RSRP and SINR. These are exact measurement quantities for their respective releases, but their receiver and aggregation semantics are not interchangeable.

The audit therefore permits only quantity-specific, frequency-specific, and explicitly conditional claims. It does not convert RSRP into received power, or SINR into a canonical radio-quality result.

## 8. Serving identity and frequency compatibility

Chongqing’s raw-to-base join is promising but not complete: 81,077 of 81,419 raw rows map to a base ECI, while 342 rows remain unmapped. Raw ARFCN values and base-table downlink-frequency values do not reconcile directly, so an adapter must fail closed until units, raster, duplex direction, and source epoch are explained.

Vienna has strong LTE serving identity and direct channel/frequency fields. Its LTE B7/2.6 coverage is the closest exact frequency match, while NR NSA identity is more conditional. Neither Vienna nor Chongqing supplies a valid 28 GHz external benchmark under this contract. LACN’s n79/approximately 4.9 GHz data is a contrast dataset, not a canonical 2.6/28 benchmark.

## 9. Quantity and interference readiness

RSRP quantity validation is potentially usable for Chongqing and Vienna after mapping/provenance checks. Absolute received-power or path-loss validation is conditional because power reference planes, gain/patterns, receiver height, calibration, and frequency semantics are incomplete.

SINR/RSRQ/RSSI and radio-quality validation remain closed for all candidates: a complete neighbor list, resource/load allocation, noise/interference context, and receiver semantics are not jointly available. PCI or a detected-cell column alone is not explicit neighbor truth.

## 10. Environment, LOS/NLOS, and holdouts

Chongqing provides building morphology and DEM/grid products. Vienna provides building-height and terrain rasters. Neither release supplies measured LOS/NLOS labels sufficient to bypass A.T.O.M.’s declared classification/provenance policy. LACN lacks comparable public environment layers.

Vienna has the strongest route/campaign coverage for spatial holdouts. Chongqing has time/source-file and spatial products that may support holdouts after route/session semantics are verified. No candidate currently satisfies the complete independent holdout and metadata gate.

## 11. Legal access and download policy

The Chongqing data release states CC BY 4.0. Vienna’s release states CC BY 4.0 for the released materials. LACN has no license file identified during this audit. Restricted TalTech files are not treated as usable. Other sources with unclear dataset-specific rights remain rejected or research-only until rights are resolved.

Large archives are not downloaded solely to improve the audit. Any future pilot must record the exact version, checksums, license, file inventory, and selective-download policy before processing.

## 12. Assumption policy and claim boundary

The following are prohibited in an external audit:

- filling missing transmitter fields with A.T.O.M. planning defaults;
- converting EIRP to conducted power without gain/reference-plane evidence;
- converting a relative radiation plot into an absolute supported pattern;
- using strongest predicted cell as a substitute for an explicit serving mapping;
- treating a device detection floor as an exact measurement;
- treating RSRP, path loss, SINR, RSRQ, RSSI, and received power as interchangeable;
- presenting calibrated or tuned parameters as independent validation truth.

The permitted claim is that the sources are conditional research candidates with the documented field-level blockers. The prohibited claim is that A.T.O.M. is calibrated or validated against real-world external data.

## 13. Selected benchmark

`selected_benchmark = null` in [`concept-6a2-selected-benchmark.json`](concept-6a2-selected-benchmark.json).

The Chongqing release is the best near-candidate for a future research-only reconciliation pilot. Vienna is the best complementary measurement/environment source, particularly for LTE B7/2.6. Neither is selected as a production or full-inventory benchmark today.

## 14. Next phase and adapters

The next-phase plan is in [`concept-6a2-next-phase.json`](concept-6a2-next-phase.json). A future 6A.3 effort would first create source manifests, field mappings, reconciliation reports, observation-quality reports, checksums, and small samples. Only after the entry gates pass could a research-only adapter be considered.

The hypothetical adapter would emit the existing validation schema, preserve raw fields/provenance, and fail closed on unresolved frequency, power, identity, coordinate, receiver, or license semantics. It would not change the canonical RF evaluator, inventory schema, optimizer, radio-quality policy, terrain behavior, or fingerprints.

## 15. 6B gate and invariance

6B remains closed because there is no independent usable benchmark with complete metadata, deterministic transmitter mapping, reproducible provenance, stable frequency-specific semantics, and acceptable review evidence. The existing states remain:

- Concept 6A: `no_measurement_data`;
- Concept 6A.1: `dry_run_ready_real_data_unavailable`;
- production candidate: `false`;
- calibration active: `false`.

The post-change comparison is in [`concept-6a2-post-change-comparison.json`](concept-6a2-post-change-comparison.json). This audit adds documentation artifacts only; it does not change canonical RF, inventory semantics, validation readiness, calibration, optimizer/interference behavior, terrain, or scenario fingerprints.

## 16. Files and validation

Audit artifacts:

- [`concept-6a2-pre-change-baseline.json`](concept-6a2-pre-change-baseline.json)
- [`concept-6a2-inventory-capability.json`](concept-6a2-inventory-capability.json)
- [`concept-6a2-benchmark-fitness-contract.json`](concept-6a2-benchmark-fitness-contract.json)
- [`concept-6a2-candidate-matrix.json`](concept-6a2-candidate-matrix.json)
- [`concept-6a2-shortlist.json`](concept-6a2-shortlist.json)
- [`concept-6a2-selected-benchmark.json`](concept-6a2-selected-benchmark.json)
- [`concept-6a2-next-phase.json`](concept-6a2-next-phase.json)
- [`concept-6a2-post-change-comparison.json`](concept-6a2-post-change-comparison.json)
- this audit report

The required checks are:

```text
jq empty docs/concept-6a2-*.json
python3 docs/validate_docs.py
python3 scripts/versioning.py check
git diff --check
```

No production code or configuration was changed as part of Concept 6A.2.
