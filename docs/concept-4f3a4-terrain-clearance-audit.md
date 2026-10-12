# Concept 4F.3A.4 — Terrain Clearance & Vertical-Datum Validation Audit

Captured `2026-09-19` for AOI `[32.45, 39.55, 33.25, 40.25]` in `EPSG:4326`. This is a read-only diagnostic audit. It does not activate terrain, start 4F.3B, or change canonical RF behavior.

## Decision first

**Decision C — NO-GO: correct the clearance implementation and re-audit before 4F.3B.** The existing 4F.3A.3 result of 432/432 candidates is fully explained, but it is not a valid terrain-obstruction result: the stored expression is `terrain - radio_line` while the negative test assumes `radio_line - terrain`. The corrected source-local recomputation gives `50` NASADEM candidates and `19` FABDEM candidates at strict zero tolerance, but those are sampled candidates, not exact obstructions or production RF inputs.

The audit writes a frozen pre-change record in `concept-4f3a4-pre-change-baseline.json`; the existing `concept-4f3a3-terrain-quality.json` is not overwritten.

## 1. Scope and invariance boundary

The fixed sample is six canonical cells (`6`), 72 bearings per cell, 400 m per path, source-native 1 arc-second tiles, and an explicit minimum spacing of 30 m. The audit reads the already acquired NASADEM and FABDEM tiles plus official geoid grids; it does not change the dataset pack or Go RF runtime.

The invariance matrix covers 2.6 GHz, 28 GHz, research sub-THz, height-aware LOS/NLOS, P.526, P.1411, reflection, building entry, interference, radio quality, optimization, and scenario fingerprints. The machine-readable post-change comparison records identical before/after canonical snapshots, terrain activation `false`, and canonical terrain status `terrain_unavailable`.

## 2. Exact equation and the 432/432 explanation

For `u ∈ [0,1]`, endpoint radio heights are `z_tx_radio = z_tx_ground + h_tx_agl` and `z_rx_radio = z_rx_ground + h_rx_agl`. The diagnostic line is

```text
z_radio(u) = (1-u) z_tx_radio + u z_rx_radio
terrain_clearance(u) = z_radio(u) - z_terrain(u)
```

Positive clearance means the radio line is above the sampled terrain. A strict-zero candidate is `min(terrain_clearance) < 0`. At valid endpoints the clearance is exactly the configured AGL height: 25 m at Tx and 1.5 m at Rx.

The old result used `terrain - radio_line` and tested `< 0`, so the Tx endpoint was always `-25 m` and every complete path became a candidate. The frozen baseline reports the legacy per-path values and source artifact hashes.

## 3. Endpoint and near-endpoint behavior

Corrected minimum locations are reported as Tx endpoint, Rx endpoint, or interior, with histograms from both Tx and Rx. A minimum within 30 m of an endpoint is not silently discarded: it is retained with its distance, source posting/interpolation, ground sample, radio line, and signed clearance. The endpoint identity is an invariant test, not an empirical terrain assumption. The endpoint analysis is in `concept-4f3a4-endpoint-analysis.json`.

## 4. Corrected clearance distribution and height sensitivity

| Source | Complete paths | Strict `<0` candidates | Minimum clearance (m) | Median minimum (m) | p90 minimum (m) |
|---|---:|---:|---:|---:|---:|
| NASADEM | 432 | 50 | -4.642 | 1.500 | 1.500 |
| FABDEM | 432 | 19 | -1.685 | 1.500 | 1.500 |

Rx heights 1.5/3/5/10 m and Tx heights 10/25/50 m are recomputed for every source and stored in the distribution artifact. Increasing endpoint height reduces the strict negative candidate count; this is expected sensitivity, not a calibration.

## 5. Spacing and interpolation sensitivity

The spacing artifact includes half-source, source-scale, 15 m, 30 m, and 60 m runs. Source-scale is one north-south posting interval at Ankara latitude; east-west spacing is smaller. Bilinear and nearest interpolation are compared over the same geometry. A candidate changes meaning when spacing or interpolation changes: it remains a sampled diagnostic and cannot be called an exact obstruction.

## 6. No-data, interpolation, and tile boundaries

The source adapter returns unavailable when a sample is outside coverage, invalid, or has an incomplete bilinear neighbourhood. The audit includes synthetic `[valid, None, valid]` fixture evidence and samples immediately on both sides of the 33° longitude and 40° latitude tile boundaries. No no-data value is replaced with zero, and unavailable profiles cannot be candidates.

## 7. Source-local versus absolute geometry

Each source’s path line is anchored to that source’s own endpoint ground samples and datum. The path decision is therefore source-local. Cross-source differences are not interpreted as accuracy or truth ranking. Representative profiles retain both source samples, radio lines, raw differences, and transformed differences where the same geometry is paired.

## 8. NASADEM semantics and vertical accuracy

NASADEM Merged DEM Global 1 arc second V001 is an orthometric EGM96 merged elevation DEM. NASA’s [Earthdata catalog](https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001), [User Guide](https://lpdaac.usgs.gov/documents/2237/NASADEM_User_Guide_V13.pdf), and [DOI](https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001) describe the product, validation, source lineage, vegetation/terrain limitations, and EGM96 frame. The guide reports North America HREC after-correction mean MAE 2.81 m (range 1.74–17.19 m) and mean RMSE 5.30 m (range 2.29–74.03 m); it also reports vegetation-context RH50 bias −0.48 m with 7.3 m standard deviation. These are product-validation summaries, not an Ankara guarantee and not a universal ±X m uncertainty margin. No invented NASADEM accuracy bound is used here.

FABDEM V1-2 is the [University of Bristol release](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/) with [readme](https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/readme.txt) and [license](https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/license.txt); it is EGM2008 and a model-derived bare-earth candidate under CC BY-NC-SA 4.0. It remains research-only and is not truth.

## 9. EGM96/EGM2008 reconciliation

The audit uses the open PROJ/NGA-derived grids [EGM96](https://cdn.proj.org/us_nga_egm96_15.tif) and [EGM2008](https://cdn.proj.org/us_nga_egm08_25.tif), with source paths, hashes, dimensions, coverage, metadata, and license notes in `concept-4f3a4-datum-audit.json`. With `H96 = h − N96` and `H08 = h − N08`, the defensible frame transformation is `H96→08 = H96 + N96 − N08`. It is a datum-frame reconciliation, not an elevation correction.

Across the deterministic common grid, `N96−N08` has median `-0.380 m`, p90 `-0.068 m`, p99 `0.063 m`, and range `1.054 m`. Transformed NASADEM minus FABDEM has median `0.172 m`, MAE `1.977 m`, RMSE `2.843 m`, p90 `3.314 m`, and p99 `7.115 m`. FABDEM is still not truth, so these are qualified comparison diagnostics.

## 10. Local-control evidence

The audit searched legitimate/open local control evidence without shopping for another DEM. HGM TG-20, Turkish vertical-control literature, the ANK200TUR IGS station, and TUSAGA-Aktif are recorded with access limitations. No unrestricted, ready-to-join Ankara orthometric point-control table was found or used. A GNSS station metadata page is not silently promoted to terrain truth.

## 11. Building-base spread and footprint labels

The 6,074 known-height building population is audited with source-local robust perimeter samples and a separate centroid sample. Counts for `≤2 m`, `>2–5 m`, `>5–10 m`, and `>10 m` spread, plus centroid-minus-perimeter-median distributions, are in the datum audit. Inside-footprint, within-30-m, and open labels are sampling strata only; they are not building-base truth, vegetation truth, or DEM validation.

## 12. Representative profiles

`concept-4f3a4-representative-profiles.json` contains full machine-readable samples for the strongest apparent obstruction, weakest negative boundary, near-Rx candidate, interior candidate, and maximum paired NASADEM/FABDEM disagreement. Each includes geometry, source tile, datum, interpolation, resolution, endpoint ground, radio line, corrected clearance, legacy signed clearance, and paired source semantics.

## 13. Curvature and refraction magnitude

Over 400 m, the spherical Earth sagitta is about 3.14 mm. A k=4/3 effective-earth diagnostic is about 2.35 mm, a difference of about 0.79 mm. These values are recorded for scale and are not added to the clearance model. They are negligible relative to 30 m source sampling and the documented product limitations, but no silent curvature assumption is made.

## 14. Future classifier contract

The future classifier contract is the four-state set `clear`, `obstruction_candidate`, `near_uncertainty_boundary`, and `unavailable`. Every decision must carry minimum clearance, location from Tx, effective resolution, interpolation, source, and selected uncertainty margin. No-data is always `unavailable`. Strict-zero and 1/2/5 m tolerances in this audit are sensitivity diagnostics; none is approved as production uncertainty.

## 15. P.526, LOS/NLOS, and reflection implications

The corrected profiles may inform a future P.526 input-validation phase, but no terrain diffraction term is implemented. Terrain candidates do not alter the current height-aware LOS/NLOS audit, which remains terrain-unavailable. Source-local ground may be a diagnostic facade/base anchor for future reflection work, but materials, roughness, visibility, datum, and uncertainty remain blockers. No building entry, interference, radio-quality, optimizer, or scenario-fingerprint behavior changes.

## 16. 4F.3B gate

The 4F.3B decision is **C / NO-GO**. Before any future start, the signed clearance implementation must be corrected in an isolated diagnostic path, the baseline must be rerun, an uncertainty policy must be approved from appropriate local evidence, and source semantics/control must be qualified. This audit does not start 4F.3B.

## Reproduction and artifacts

```text
data-pipeline/.venv/bin/python data-pipeline/terrain_clearance_audit.py \
  --manifest data-pipeline/manifest.json \
  --buildings data-pipeline/ankara_buildings.geojson \
  --towers data-pipeline/ankara_5g_nodes.geojson \
  --baseline docs/concept-4f3a3-pre-change-baseline.json \
  --raw-dir /tmp/atom-4f3a3-20260919 \
  --output-dir docs
```

The required outputs are:

* `concept-4f3a4-pre-change-baseline.json`
* `concept-4f3a4-clearance-distribution.json`
* `concept-4f3a4-endpoint-analysis.json`
* `concept-4f3a4-datum-audit.json`
* `concept-4f3a4-representative-profiles.json`
* `concept-4f3a4-readiness-decision.json`
* `concept-4f3a4-post-change-comparison.json`
* this audit report

The machine-readable post-change comparison records no canonical behavior change. The 4F.3A.3 terrain-quality artifact remains the frozen pre-audit result.
