# Concept 4F.3A.5 — Terrain Clearance Primitive Correction

Captured `2026-09-20`. This is a small diagnostic hardening phase. Terrain is not activated in canonical RF and Concept 4F.3B has not started.

## 1. Old bug location

The frozen 4F.3A.3 implementation was `data-pipeline/terrain_source_pilot.py::path_profiles`. It stored `terrain - radio_line` while interpreting negative values as obstruction. At a valid 25 m Tx endpoint that necessarily produced `-25 m`; consequently the old complete-path result was NASADEM `432/432` and FABDEM `432/432`. The before record is `docs/concept-4f3a5-pre-change-baseline.json` and the historical source artifact is preserved.

## 2. New primitive and sign convention

The authoritative model is `terrain-clearance-primitive-v1` in `data-pipeline/terrain_clearance_primitive.py`, with the Go diagnostic counterpart `TerrainClearanceResult` in `backend-go/raytracer/terrain_clearance.go`. The only quantity called clearance is

```text
clearance_m = radio_elevation_m - terrain_elevation_m
```

Positive means the radio line is above terrain. Negative means terrain exceeds the radio line. A separately named `terrain_excess_m` is used only when retaining the old comparison view; it is never called clearance.

## 3. Radio line and endpoint contract

For `u ∈ [0,1]`, each source uses its own endpoint samples:

```text
z_tx_abs = terrain_at_tx + tx_height_agl_m
z_rx_abs = terrain_at_rx + rx_height_agl_m
z_radio(u) = z_tx_abs + u * (z_rx_abs - z_tx_abs)
```

Endpoints participate in the minimum. The controlled flat fixture has terrain `100 m`, absolute endpoints `125 m` and `101.5 m`, endpoint clearances `+25 m` and `+1.5 m`, minimum `+1.5 m`, and `clear` classification. The Tx sign-regression fixture explicitly protects against `-25 m`.

## 4. Classification and uncertainty policy

Complete profiles use strict raw classification: minimum `< 0` is `obstruction_candidate`; minimum `>= 0` is `clear`. An optional explicit margin `M` is separate policy: `< -M` candidate, `|clearance| <= M` near uncertainty boundary, `> M` clear. No production margin is invented. Partial/no-data profiles are `unavailable` for classification even when a valid-sample minimum is retained for inspection.

## 5. Samples, no-data, spacing, and interpolation

Every primitive sample carries distance, fraction, coordinate, source terrain, radio elevation, signed clearance, status, and validity. No-data, outside-dataset, NaN, and Inf never become candidates. `nearest` and `bilinear` are explicit inputs and fingerprints. Requested spacing, effective spacing, and native raster resolution are recorded; the effective interval is qualified as source-resolution-limited and does not imply sub-raster terrain information.

## 6. Source-local vertical frame

Tx, Rx, and all path samples use the same source, source version/checksum, interpolation, vertical datum, datum kind, and geoid model. Mixed source-local datum identities are rejected. NASADEM remains an EGM96 diagnostic source with unresolved bare-earth semantics; FABDEM remains an EGM2008 research comparator and is not a production dependency. No cross-source datum conversion is inserted into a source-local path decision.

## 7. Exact 432-path rerun

The run uses six cells, 72 rays per cell, 400 m radius, Tx AGL 25 m, Rx AGL 1.5 m, the same source manifests, and bilinear interpolation. Corrected strict-zero results are:

| Source | Complete paths | Candidates | Minimum clearance |
|---|---:|---:|---:|
| NASADEM | 432 | 50 | -4.642 m |
| FABDEM | 432 | 19 | -1.685 m |

The primitive reproduces the independent 4F.3A.4 counts: `50` NASADEM and `19` FABDEM. Differences from any source-scale or interpolation run are reported as sampling sensitivity, not forced to a target count.

## 8. Sensitivity and representative ledgers

The distribution artifact records bilinear/nearest interpolation, source-scale and requested spacing cases, and Rx heights 1.5/3/5/10 m plus Tx heights 10/25/50 m. At canonical bilinear spacing, the observed Rx candidate counts are `{'1.5': 50, '3.0': 27, '5.0': 11, '10.0': 0}` for NASADEM and `{'1.5': 19, '3.0': 3, '5.0': 0, '10.0': 0}` for FABDEM; Tx sensitivity is `{'10.0': 169, '25.0': 50, '50.0': 3}` and `{'10.0': 122, '25.0': 19, '50.0': 0}`. Representative strongest, boundary, near-Rx, interior, and maximum source-disagreement profiles with full per-sample ledgers are in `concept-4f3a5-representative-profiles.json`.

## 9. Fingerprint and API/UI boundary

Each result fingerprint includes primitive version, source ID/version/checksum, vertical datum, interpolation, raster resolution, requested/effective spacing, endpoint AGL, margin policy, and profile geometry. It excludes runtime, timestamp, local path, and UI state. The isolated Go route `/api/spatial-evidence/path-profile` now exposes the result under `profile.clearance` and top-level `clearance`; canonical `/api/simulate` is untouched. No frontend change was required because the existing UI does not consume this isolated route.

## 10. Canonical invariance and 4F.3B gate

Canonical snapshots remain byte-for-byte equal in the artifact, terrain remains `terrain_unavailable`, and no canonical LOS/NLOS, P.526, P.1411, reflection, building entry, interference, radio quality, optimizer, Pareto, or scenario-fingerprint behavior is changed. The recommendation is **do not begin 4F.3B**: source semantics, local control, uncertainty policy, and exact terrain/diffraction qualification remain blockers.

## Artifacts

- `docs/concept-4f3a5-pre-change-baseline.json`
- `docs/concept-4f3a5-controlled-fixtures.json`
- `docs/concept-4f3a5-clearance-comparison.json`
- `docs/concept-4f3a5-clearance-distribution.json`
- `docs/concept-4f3a5-representative-profiles.json`
- `docs/concept-4f3a5-post-change-comparison.json`
- `docs/concept-4f3a5-source-manifests.json`
