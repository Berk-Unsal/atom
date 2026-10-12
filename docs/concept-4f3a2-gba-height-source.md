# Concept 4F.3A.2 — GlobalBuildingAtlas GBA.Height Ankara pilot

Status: **diagnostic-only acquisition and evidence pilot; NO-GO for a future 4F.3B numeric comparison; no canonical RF activation**.

This phase evaluates the official GlobalBuildingAtlas `GBA.Height` product against A.T.O.M.'s existing OSM building footprints. It does not replace footprint geometry, change the canonical height precedence, or promote a machine-learning raster into propagation, diffraction, reflection, interference, radio-quality, optimization, or UI behavior. The existing spatial-evidence inspector routes and ledger remain unchanged.

## Source and license audit

The official [GlobalBuildingAtlas README](https://github.com/zhu-xlab/GlobalBuildingAtlas/blob/main/README.md), [mediaTUM record](https://mediatum.ub.tum.de/1782307), [terms of use](https://tubvsig-so2sat-vm1.srv.mwn.de/terms_of_use.html), and [ESSD paper](https://essd.copernicus.org/articles/17/6647/2025/) were audited. `GBA.Height` is distributed under **CC BY-NC 4.0**. Attribution, a license link, and change indication are required; commercial use is not permitted by that license. The official README also warns that combining GBA products can create additional license implications and that it is not legal advice.

The pilot therefore distinguishes these scopes:

- research/open-source diagnostic use: permitted with attribution and the source terms;
- raw and derived evidence: kept in an external cache and not committed to the repository;
- commercial or production dependency: prohibited or unresolved under the observed license and not approved;
- canonical RF input: not approved, regardless of the numeric coverage result.

The source paper describes a 3 m product derived from PlanetScope imagery, with 2018/2019 acquisition selection, normalized-surface/object-height semantics, and test-time-augmentation variance as a model uncertainty signal. The delivered Ankara GeoTIFFs contain one `float32` band, `EPSG:32636` tile CRS, 3 m pixels, scale 1, offset 0, and nodata `-1`; no uncertainty band is present. Values are treated as qualified relative AGL/nDSM-style height, never as absolute elevation or a vertical datum. Spatial resolution is not vertical accuracy.

## Reproducible acquisition

The active pack is `ankara-open-planning` `2026.07`, in EPSG:4326, with the exact AOI `[32.45, 39.55, 33.25, 40.25]`. Official `height_tif.geojson` metadata selected 25 intersecting 0.2° tiles from two official parent archives:

- `Height/africa/e030_n40_e035_n35.zip`, 92,342,612,454 bytes;
- `Height/europe/e030_n45_e035_n40.zip`, 44,497,706,352 bytes.

The selected GeoTIFF members total 5,133,172,252 uncompressed bytes. Parent archives were not downloaded in full: the workflow fetched the official index files, ZIP central-directory tails, and exact compressed member ranges over FTP, verified member CRC/size, and recorded tile SHA-256 plus official parent SHA-512. Raw TIFFs, compressed ranges, and the line-delimited per-footprint audit remain under `/tmp/atom-gba-height-2026`, outside Git.

The acquisition and quality ledger is [concept-4f3a2-acquisition-manifest.json](concept-4f3a2-acquisition-manifest.json). The source-specific workflow is `data-pipeline/gba_height_pilot.py`; it uses windowed raster reads, CRS-aware footprint transforms, a bounded external cache, and deterministic fingerprint inputs.

## Extraction and QA policy

The audit samples every loader-visible footprint, including MultiPolygon outer-ring parts, using four explicit strategies: all intersecting pixels, pixel-center-inside, a 3 m inward buffer, and robust interior support. It records min, median, mean, p75, p90, and max, plus valid/nodata/nonfinite/negative/zero counts, edge/small-building support, tile IDs, and optional model-uncertainty values.

The selected deterministic policy is `gba-height-extraction-v1`: **pixel-center-inside + max**. The max statistic is consistent with the source paper's LoD1 footprint-height construction, but remains qualified evidence rather than truth. Of 161,784 loader-visible footprints, 161,172 (99.62%) have positive support; 612 have no usable positive support and 608 have single-pixel support. The full raster-quality ledger is [concept-4f3a2-raster-quality.json](concept-4f3a2-raster-quality.json).

## Agreement result and gate

OSM explicit heights and levels-derived heights are evaluated separately and treated as comparison references, not ground truth. For the selected policy:

| Reference | n | signed bias (m) | median error (m) | MAE (m) | RMSE (m) | p90 absolute error (m) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| OSM explicit | 1,085 | −8.30 | −2.53 | 9.75 | 24.00 | 26.03 |
| OSM levels-derived | 4,965 | −6.95 | −3.08 | 8.29 | 14.98 | 21.72 |
| Combined | 6,050 | −7.19 | −2.96 | 8.55 | 16.95 | 21.96 |

The large-conflict screen is `abs(GBA − OSM) > max(5 m, 25% of selected OSM height)`. It flags 2,268 of 6,050 matches, or **37.49%**. That fails the explicit 25% promotion gate. The complete cases, spatial/error distributions, and all strategy/statistic combinations are in [concept-4f3a2-height-agreement.json](concept-4f3a2-height-agreement.json).

## Precedence comparison

Policy A (`explicit → levels → GBA → fallback`) selects GBA evidence over fallback for 155,122 loader-visible footprints and leaves 588 fallback-only. Policy B (`explicit → GBA → levels → fallback`) selects 160,087 GBA values, including 4,965 over levels-derived evidence, while preserving explicit OSM precedence. Both are diagnostic overlays only; neither changes the active pack. See [concept-4f3a2-policy-comparison.json](concept-4f3a2-policy-comparison.json) and [concept-4f3a2-data-quality-impact.json](concept-4f3a2-data-quality-impact.json).

The reusable controlled A–L fixture suite covers exact/high-IoU matching, centroid-only rejection, ambiguity, split/merge cases, exact IDs, conflict thresholds, explicit precedence, levels agreement, fallback replacement, and invalid/duplicate/out-of-AOI QA. It is exercised by `data-pipeline/test_external_height_pilot.py`; GBA-specific statistic, gate, and precedence regressions are in `data-pipeline/test_gba_height_pilot.py`.

## Readiness impact and decision

The isolated Go audits use temporary policy-specific copies with corrected checksums. Both policies pass the diagnostic runs. In the fixed 432-path / six-cell / 72-ray sample:

- height-aware classification changes five paths from NLOS to LOS; the matrix is 29 LOS→LOS, 5 NLOS→LOS, 243 NLOS→NLOS, and 155 unknown→unknown;
- P.526 diagnostic eligibility rises from 29 to 429 paths, with 3 paths still ineligible because of unknown height; this remains diagnostic, not canonical propagation;
- P.1411 remains **not ready** because GBA.Height does not supply terrain, morphology taxonomy, or proof that both terminals are below a rooftop;
- reflection remains **not ready**: the policy-A audit has 3,520 geometry-only candidates and 3,506 with height evidence, but zero terrain-anchored vertical spans and zero material evidence; candidates are not viable reflected links without the remaining gates.

The final decision is **NO-GO for a future 4F.3B numeric comparison experiment** because the 37.49% conflict rate fails the promotion gate, despite 99.62% raster support and a 99.62% reduction of fallback-only loader-visible footprints under Policy A. A bounded, noncommercial, attribution-compliant diagnostic study may use these artifacts for further ground-truth collection, but this result does not authorize production, commercial, or canonical RF dependency.

The pre-change ledger is [concept-4f3a2-pre-change-baseline.json](concept-4f3a2-pre-change-baseline.json); readiness and before/after evidence are in [concept-4f3a2-readiness-impact.json](concept-4f3a2-readiness-impact.json) and [concept-4f3a2-post-change-comparison.json](concept-4f3a2-post-change-comparison.json). Canonical RF fingerprints and outputs remain declared unchanged.
