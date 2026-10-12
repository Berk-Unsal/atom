# Concept 6A.2.1 — Chongqing RF Metadata Reconciliation Audit

**Audit date:** 2026-09-21
**Scope:** research only; no adapter, inventory, RF, calibration, default, or production change
**Decision:** **D — `insufficient_metadata`**
**6A.3:** **NO-GO**
**6B:** **CLOSED**

Chongqing has useful public measurement material, but it is still too ambiguous for fair A.T.O.M. validation. The release can support source-level descriptive work around SS-RSRP and propagation covariates. It cannot currently support an authoritative absolute-RSRP link budget, a fair relative-propagation residual study, or a production inventory import without inventing missing semantics.

## 1. Source material inspected

The audit selected Zenodo record [10.5281/zenodo.20564635](https://zenodo.org/records/20564635), version 1.0, because the current Data Descriptor links that record and its file names match the paper. I inspected its metadata, README, license, dictionary, checksums, example loader, the small base-station CSV, and the schema/ranges of the raw release. I also inspected the parallel official record [10.5281/zenodo.20564197](https://zenodo.org/records/20564197), which is a different release with different file names, byte sizes, and hashes.

I inspected the official [GitHub source repository](https://github.com/xunuosama/A-Real-time-5G-Macro-cells-Signal-Dataset) at commit `94917ae35910d642674ceebeb6fbcb712960f488`, including the exact NCI-to-ECI matching and grid-processing scripts. I read the current [Nature Data Descriptor](https://www.nature.com/articles/s41597-026-07964-z) and its [official PDF preview](https://www.nature.com/articles/s41597-026-07964-z_reference.pdf), the associated [Sensors paper](https://doi.org/10.3390/s25175440), and the relevant [ETSI NR frequency specification](https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/15.12.00_60/ts_138104v151200p.pdf) and [ETSI identity specifications](https://www.etsi.org/deliver/etsi_TS/138400_138499/138413/17.07.00_60/ts_138413v170700p.pdf).

The raw CSV was not saved or imported into the repository. A bounded ranged scan of the 14.9 MB official raw file was performed only to answer the specific 342-row identity question that cannot be resolved from a header/sample. The complete adapter, full-dataset import, and any production path remain absent.

## 2. Transmit-power semantics

The base field is `Antenna transmit power(dBm)`. The dictionary and paper define it as transmit power of the base-station antenna, reported in dBm. The current paper says that transmission power and azimuth came from operator inference and open platforms, were cross-verified, and may have approximately ±2 dB and ±5° uncertainty.

What is not defined is more important for A.T.O.M.: conducted output versus radiated power, per-carrier versus total sector power, per-antenna versus array power, configured versus measured value, and whether antenna gain is already included. Therefore the field is retained as source metadata only. It must not be silently mapped to canonical `tx_power_dbm` or EIRP.

## 3. Antenna gain evidence

No authoritative antenna model, maximum gain, array gain, vendor specification, or measured gain was found in the audited Zenodo files, paper, supplement listing, repository, or code. The existence of azimuth and tilt fields does not supply gain. A numerical power range is not evidence of gain semantics.

## 4. Antenna pattern evidence

No horizontal or vertical radiation pattern, beamwidth, panel model, beamforming/codebook information, or 3GPP/vendor pattern was found. `angle` is described as azimuth clockwise from true north, and electrical/mechanical tilt fields are present, but those three angles cannot reconstruct an angle-dependent antenna gain. Missing pattern information can create a position-dependent residual; it cannot safely be absorbed into one fitted constant.

## 5. ARFCN and frequency reconciliation

Under the ETSI NR-ARFCN formula, the raw channels convert as follows:

| Raw band | Raw NR-ARFCN | Derived frequency |
| --- | ---: | ---: |
| N78 | 633984 | 3509.76 MHz |
| N78 | 627264 | 3408.96 MHz |
| N1 | 428910 | 2144.55 MHz |

The base `Downlink Frequency` values are `426000`, `427980`, `630000`, and `636664`. Treating those values as NR-ARFCNs only conditionally produces 2130.00, 2139.90, 3450.00, and 3549.96 MHz. Among 81,077 exactly mapped rows, raw `NR_ARFCN` equals base `Downlink Frequency` zero times. The cross-tab deltas are −40.20 MHz, −41.04 MHz, +4.65 MHz, and +14.55 MHz, so there is no single defensible offset.

The base `FREQUENCY` field is also unresolved: it is described as a carrier center frequency, but has 150 unique values including values such as 1, 5, 117, and 4144, with no unit or encoding contract. The paper's phrase “N1 and N78 (3.5 GHz)” is imprecise for N1; this audit preserves the source wording and does not silently correct it. Raw channel conversion is allowed as source-level analysis only. No base frequency rewrite or guessed offset is allowed.

## 6. Cell and base-station ID mapping

The official code uses an exact dictionary join from raw `NCI` to base `ECI`. It maps 81,077 of 81,419 rows and 189 of 197 unique raw NCI values. Eight raw NCI values, covering 342 rows, are absent from the 189-row base table.

The exact key is the only accepted serving-cell mapping for the rows it covers. `PCI` is not a safe fallback: 254 mapped rows across 32 NCI values disagree between raw PCI and base PCI. `TAC` happens to match for all mapped rows, but that does not repair missing cell keys. `CGI` is not a lossless text key because 23 base rows are rendered in scientific notation.

The raw relation `NCI = GNODEB × 4096 + GCELLID` holds for 81,418 rows. One mapped row (`ID=67557`) violates that arithmetic while still directly joining to its base ECI. This is an internal consistency finding, not a license to invent an alternative decoder. The 36-bit NCI coding responsibility remains operator-specific under 3GPP/ETSI.

## 7. What the 342 rows mean

The authoritative conclusion is limited: 342 observations reference eight parseable NCI values that are missing from the released base table. All 342 are `SA`, `N78`, raw ARFCN `633984`, TAC `10121472`, MCC/MNC `460/1`, and outdoor.

The paper says that reselection and handover were allowed and that only serving-cell observations were retained. However, the raw schema has no handover flag, secondary-cell flag, neighbor flag, or base-table version. The unmapped rows span multiple ground files and two UAV files. Therefore the audit cannot honestly label them as handover rows, secondary-cell rows, stale metadata, or corruption. They remain unresolved source rows; no nearest-base fallback and no silent drop is permitted.

## 8. Receiver hardware

The current paper documents an iQOO 8 Pro with a Qualcomm Snapdragon X60 5G modem for the UAV measurements, a DJI Mavic Air 3S platform, and the Cellular-Pro application. The phone was mounted horizontally with its screen upward in a custom holder. Ground measurements were made by assistants walking predefined routes with smartphone receivers, but the release does not provide a complete ground device inventory, receiver antenna, receiver height, or per-device identifier.

The paper's device description establishes provenance; it does not establish receiver calibration or an absolute receive-power transfer function. No calibration file, receiver antenna gain, noise-floor characterization, or device correction was found.

## 9. SS-RSRP semantics

Raw `SS_RSRP` is defined as Synchronization Signal Reference Signal Received Power in dBm. The paper says the phone was idle, generated no application-layer traffic, logged at 1 Hz, and retained only serving-cell observations. Those are useful conditions, but the release does not specify the SSB/resource-element averaging rule, beam/index selection, device correction, absolute calibration, detection floor, censoring, or whether each raw value is itself averaged.

The grid `SS_RSRP` is an average/weighted aggregate and may be interpolated. It is not interchangeable with a raw observation. Source-level quantity analysis may retain raw `SS_RSRP` under its original name; an A.T.O.M. absolute-RSRP claim is not approved.

## 10. Session and route evidence

The paper describes UAV grid flights at 5–200 m and ground walking routes through open squares, alleys, and areas near towers. The raw release contains 3,300 distinct `source_file` values, with 78,158 rows whose filenames contain UAV and 3,261 containing Ground. This is useful provenance, not a documented route/session schema.

The paper states 1 Hz logging. Within source files, the ranged scan found 78,119 positive timestamp deltas, with a 1.025 s median, 2.913 s p90, and a maximum gap of 20,456.739 s. The data therefore should not be treated as one continuous route clock or as a complete trajectory without additional source metadata.

## 11. Environment and propagation context

The release documents WGS84 EPSG:4326 grid centers and WGS84/UTM Zone 48N EPSG:32648 projected processing. It provides or describes DEM-derived terrain, Landsat/GEE NDVI, and building coverage/height features. Those are useful covariates for source-level propagation analysis.

No measured per-observation LOS/NLOS label was found, and the audited Zenodo file list does not include the raw building geometry package. The paper says a supplementary reproducibility package contains sampling points in SHP format and application configuration settings, but that package is not present in the audited record's file list. Environment fields therefore do not establish independent A.T.O.M. geometry truth.

## 12. Field-level inventory mapping

The field-level mapping is recorded in [concept-6a21-inventory-mapping.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-inventory-mapping.json>). In summary:

- Coordinates, raw timestamp, GNSS accuracy, raw band, raw channel identifier, and raw SS-RSRP are direct or qualified source fields.
- NCI-to-ECI is a direct join only for the 81,077 mapped rows.
- Base coordinates, azimuth, tilts, bandwidth labels, and height are source metadata with qualifications.
- Base frequency and transmit power are not safe canonical inventory fields.
- EIRP, antenna gain, antenna pattern, ground receiver height, and complete site/sector identity are missing.

No import manifest, inventory record, or A.T.O.M. adapter was created.

## 13. Absolute link-budget conclusion

An absolute link budget is **not supportable**. The missing power reference plane, gain, pattern, receiver calibration, receiver antenna, frequency reconciliation, and incomplete serving-cell mapping are independent blockers. Using `Antenna transmit power(dBm)` as EIRP, assuming zero gain, or treating the phone's SS-RSRP as calibrated received power would all be invented assumptions.

## 14. Relative-propagation conclusion

Chongqing is **not** a fair relative-propagation candidate for A.T.O.M. validation yet. Relative studies can sometimes tolerate an unknown constant offset, but this release has unresolved directional pattern, frequency, identity, route/session, and receiver-height effects. Those can vary across position, band, or route and are not reducible to one nuisance offset.

The safe scope is descriptive source-level analysis of SS-RSRP variation with explicit provenance, mapped/unmapped identity flags, raw versus grid/interpolated separation, and no claim that the result validates A.T.O.M.

## 15. Assumptions and non-assumptions

The audit makes only these bounded transformations: applying the published ETSI NR-ARFCN formula to raw channel IDs; treating raw NCI-to-base ECI equality as an exact join where present; retaining published coordinate systems; and retaining the paper's device/route descriptions as provenance claims.

It does **not** assume that base Downlink Frequency is NR-ARFCN, that `FREQUENCY` is MHz despite its description, that transmit power includes or excludes gain, that the phone is calibrated, that UAV altitude is receiver height, that source filenames are sessions, that PCI is a join key, or that the 342 rows are handover/secondary-cell observations.

## 16. License and reuse

The audited Zenodo `LICENSE.txt` states [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It permits sharing and adaptation with attribution, a license link, and change indication. The GitHub repository's API metadata does not declare a repository license, so repository code should be treated as inspectable source rather than copied or redistributed without separate confirmation. The Nature article is an article license and does not replace the dataset license. No redistribution or derivative dataset was created by this audit.

## 17. Final readiness

Final classification is **D — `insufficient_metadata`**. The public record is not empty; it is insufficiently authoritative at the exact field boundaries that A.T.O.M. needs. The raw SS-RSRP quantity is useful for descriptive research, but the combined release, identity, frequency, transmitter, receiver, and route gaps prevent a fair validation claim.

The machine-readable readiness decision is in [concept-6a21-readiness.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-readiness.json>).

## 18. Concept 6A.3 decision

**NO-GO.** No 6A.3 implementation pilot or adapter may be built from this audit. A future reconsideration would require: one pinned release with matching checksums and a corrected loader; resolution of the eight missing cells and 254 PCI mismatches; documented raw/base frequency semantics and mapping; power reference-plane and antenna pattern evidence; receiver/calibration/SS-RSRP resource semantics; ground receiver height and route/session IDs; and the claimed GIS/configuration supplement.

## 19. Concept 6B status

**6B remains CLOSED.** This audit did not create independent usable samples, activate calibration, change validation readiness, alter holdouts, or alter any production RF, inventory, optimizer, radio-quality, or terrain behavior.

## 20. Required files

- [concept-6a21-chongqing-reconciliation.md](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-chongqing-reconciliation.md>)
- [concept-6a21-field-semantics.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-field-semantics.json>)
- [concept-6a21-id-reconciliation.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-id-reconciliation.json>)
- [concept-6a21-frequency-reconciliation.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-frequency-reconciliation.json>)
- [concept-6a21-inventory-mapping.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-inventory-mapping.json>)
- [concept-6a21-readiness.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-readiness.json>)
- [concept-6a21-post-change-comparison.json](</Users/berkunsal/Desktop/urban-ray-tracer/docs/concept-6a21-post-change-comparison.json>)
