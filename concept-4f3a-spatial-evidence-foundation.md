# Concept 4F.3A — Terrain and Building-Height Spatial Evidence Foundation

Status: **implemented as a provenance-aware, diagnostic-only foundation; not promoted into canonical RF**.

The phase answers a data question before it answers another propagation question: what does a terrain or building-height value actually mean, where did it come from, and is it safe to combine with another elevation? The active Ankara pack remains unchanged while these contracts are available through audit artifacts and isolated API routes.

## 1. Current limitation

The current pack is `ankara-open-planning` `2026.07`, in EPSG:4326, with 451 cells and 161,626 GeoJSON building features. The streaming loader exposes 161,784 outer-ring footprints after MultiPolygon expansion.

Current height evidence is sparse:

| Evidence | Count | Share |
| --- | ---: | ---: |
| Explicit OSM `height` | 1,108 | 0.68% |
| `building:levels × 3 m` | 4,966 | 3.07% |
| Fallback-only `default-3-storey` | 155,710 | 96.25% |
| Unavailable | 0 | 0.00% |
| Explicit or levels-derived | 6,074 | 3.75% |

No terrain layer is installed. `terrain_status` is `terrain_unavailable`; the existing path profiler’s zero local reference is explicitly not measured ground. The exact pre-change ledger is [concept-4f3a-pre-change-baseline.json](concept-4f3a-pre-change-baseline.json).

## 2. Height semantics

The foundation keeps three different quantities separate:

```text
ground_elevation_m       terrain / bare-earth elevation in a declared vertical datum
building_height_agl_m    building height above its local ground
roof_elevation_amsl_m    ground_elevation_m + building_height_agl_m
```

The sum is produced only when the ground is an authoritative DTM with a known datum and the height is finite, non-negative, and compatible. AGL is never labeled as an absolute elevation. An OSM height tag has `vertical_datum_kind: not_applicable_agl`; it is not an ellipsoidal or orthometric ground value.

## 3. Current loader audit

The existing loader remains the canonical height source for default RF behavior. Its exact order and constants are:

1. Parse `height` as a positive length in metres. Supported suffixes include metres/meters, `m`, feet/`ft`, and `'`; valid values are 1–500 m.
2. If no valid height exists, parse positive `building:levels`, multiply by **3.0 m per level**, and cap the result at **500 m**.
3. If neither source is present, retain the legacy **9.0 m** `default-3-storey` display value.

The 9 m value is not roof evidence. Explicit and levels-derived evidence remain separate in the existing classifier and in the new ledger. MultiPolygon features become outer-ring parts with a shared `logical_building_id`; holes are not treated as exterior facades. Coordinates are expected in EPSG:4326, and the spatial index stores bounding boxes plus the original loader-visible ring vertices.

## 4. Provenance model

`EvidenceProvenance` carries:

- source label and optional dataset ID/version;
- normalized category (`osm_explicit_height`, `osm_levels_derived`, `external_building_height`, `dsm_minus_dtm`, `lidar_derived`, `user_supplied`, `generic_fallback`, or `unavailable`);
- derivation text;
- vertical datum and geoid model when applicable;
- source resolution and acquisition epoch when known;
- evidence class.

The practical evidence classes are:

| Class | Meaning in this phase |
| --- | --- |
| `trusted` | Direct source evidence suitable for a qualified diagnostic, such as an explicit height tag or a DTM with declared datum. |
| `usable_with_qualification` | Deterministic derived/modelled evidence whose limitations remain visible, such as levels-derived height, matched external estimate, or nDSM. |
| `fallback_only` | A value retained for legacy display or conservative behavior, never presented as a measured roof. |
| `unavailable` | No usable evidence, or an evidence gate deliberately refused the value. |

Numeric confidence percentages are not invented. Downstream callers can require `trusted` or allow `trusted + usable_with_qualification` explicitly.

## 5. Terrain versus DSM

Terrain metadata uses a strict kind:

```text
dtm              bare-earth ground candidate
dsm              surface elevation, including buildings/vegetation
dem_unspecified  semantics not resolved
```

Only `dtm` with a known vertical datum and an available raster becomes `authoritative_ground`. `dsm` returns `surface_only_not_ground`; `dem_unspecified` returns `unresolved_dem_semantics`. Neither can silently become ground elevation.

An explicit compatible DSM and DTM pair can be evaluated as a **qualified** `DSM - DTM` height. The contract records the roof statistic, raster resolution, datum check, and an `unknown` vegetation-contamination risk. One DSM pixel is not authoritative building height, and building height is never added to DSM again.

## 6. Vertical datum contract

Every terrain layer declares:

- named vertical datum;
- `orthometric`, `ellipsoidal`, or `unknown` kind;
- geoid model when relevant;
- CRS, raster resolution, interpolation, no-data, and acquisition epoch.

Ground/roof fusion rejects an unresolved or incompatible datum. No transformation is guessed. Copernicus GLO-30 is documented with an EGM2008 vertical reference; NASADEM and ASTER materials document EGM96-related values; a source adapter must preserve those differences rather than treating “metres” as datum compatibility.

## 7. Source audit

The full machine-readable audit is [concept-4f3a-source-audit.json](concept-4f3a-source-audit.json). Its conclusion is intentionally conservative:

- Copernicus DEM GLO-30 is a useful 30 m DSM/surface candidate, not an automatic DTM.
- NASADEM/SRTM and ASTER GDEM are global approximately 30 m elevation candidates, but their product-specific vertical and surface/void semantics still require local ground validation before DTM promotion.
- OpenTopography is an acquisition/distribution route; the selected product’s provenance and terms remain authoritative.
- Turkish national orthophoto, point-cloud, building-inventory, and elevation services may offer substantially better local data, but current official access is institutional, account-controlled, or paid. No restricted raw source is copied into this repository.
- Microsoft GlobalMLBuildingFootprints currently lists Turkey coverage and offers model-estimated above-ground heights under CDLA Permissive 2.0. It is a promising qualified candidate, but the Ankara tile was not acquired or matched in this phase.
- OSM explicit and levels-derived data remains the only active building-height source.

The honest result is **no activated external source and no claimed coverage improvement**.

## 8. Raster ingestion and storage

`LoadGeoTIFFTerrain` supports the current local architecture’s classic GeoTIFF/COG-compatible subset:

- north-up EPSG:4326;
- single-band integer or IEEE floating-point samples;
- strip or tiled storage;
- none/DEFLATE compression and supported predictors;
- GeoTIFF no-data metadata;
- nearest or bilinear sampling.

`LoadHGTTerrain` additionally supports standard one-degree HGT postings at
1-arc-second (3601 × 3601) or 3-arc-second (1201 × 1201) resolution. HGT is
signed big-endian `int16`, ordered north-to-south, and has no embedded CRS or
vertical-datum declaration; the pack must declare EPSG:4326 and the source
datum explicitly. The controlled adapter preserves negative elevations and
rejects the standard `-32768` no-data posting.

The reader opens one reusable file handle and reads only the required strip/tile block. A bounded 32-block cache avoids loading an entire regional raster into memory. Dataset packs copy and SHA-256 hash source files; manifest layer metadata carries the semantic declaration. No PostgreSQL/PostGIS or cloud storage dependency was introduced.

## 9. Terrain sampler

`NewTerrainSampler` returns a sampler whose `SampleTerrain` result contains:

- elevation, when valid;
- `measured_or_source`, `interpolated`, `unavailable`, `outside_dataset`, or `no_data` status;
- source/dataset/version, kind, datum, resolution, and interpolation;
- an `authoritative_ground` flag;
- a reason for rejected samples.

Nearest preserves source-pixel semantics. Bilinear is the default and is labeled `interpolated`. The sampler does not synthesize zero elevation. A failed sample inside a declared no-data raster is `no_data`; a point outside metadata bounds is `outside_dataset`.

## 10. Path terrain profile

`BuildTerrainPathProfile` is an isolated Tx-to-Rx terrain evidence primitive. It returns deterministic distance, coordinate, sample status, elevation, source, and limitations. Effective spacing is:

```text
max(requested_spacing_m, largest declared source raster resolution)
```

This prevents a 30 m source from being sampled every 10 cm and implying extra precision. The diagnostic endpoint is:

```text
POST /api/spatial-evidence/path-profile
```

It is separate from the existing `/api/path-profile` propagation diagnostic and is labeled `diagnostic_only_not_active`.

## 11. Building base elevation

For a polygon, the default method is `robust_perimeter_median`: each outer-ring vertex, each edge midpoint, and the polygon centroid are sampled. The ledger retains:

```text
ground_min_m, ground_median_m, ground_max_m, ground_spread_m
```

The default uncertainty screen is 5 m. A spread above that threshold returns `base_elevation_uncertain`; it does not pretend that one scalar is a surveyed foundation elevation. A missing, DSM, or unresolved DEM returns unavailable/non-ground status instead of a zero or a fabricated base.

## 12. External building-height contract

Vendor-specific adapters map into `ExternalBuildingHeightRecord`:

```json
{
  "id": "source-feature-id",
  "footprint": [{"lon": 32.85, "lat": 39.92}],
  "height_agl_m": 18.5,
  "source": {
    "source": "provider",
    "source_version": "release",
    "dataset_id": "tile-or-release-id",
    "category": "external_building_height",
    "evidence_class": "usable_with_qualification"
  }
}
```

The optional GeoJSON adapter accepts only the normalized `height_agl_m` property and EPSG:4326 Polygon/MultiPolygon geometry. It does not infer vendor semantics from a generic `height` field. This keeps RF code independent of one provider’s schema.

## 13. Matching strategy

`MatchExternalBuildingHeights` applies deterministic gates:

1. exact source/loader ID agreement, when present;
2. polygon IoU for convex rings, or deterministic sampled polygon IoU for non-convex rings;
3. a 30 m centroid-distance gate when overlap is zero;
4. high-confidence overlap at IoU ≥ 0.60;
5. more than one spatial candidate is `ambiguous`, even when a best candidate exists;
6. no acceptable candidate is `unmatched`.

Centroid proximity alone cannot assign a height. Ambiguous and unmatched records remain visible and do not enter trusted RF evidence.

## 14. Source precedence

The versioned default selection policy is `height-source-precedence-v1`:

```text
user_supplied
lidar_derived
osm_explicit_height
external_building_height (only exact/high-confidence matches)
osm_levels_derived
dsm_minus_dtm
generic_fallback
unavailable
```

The policy deliberately leaves current explicit OSM tags ahead of an unvalidated external model estimate. It does not assume that “external” means authoritative. A future audit may change the policy only with a versioned comparison artifact.

## 15. Disagreement handling

The ledger retains the selected candidate and every alternative. It reports candidate count, median/p90/extreme absolute difference, and a review status. The current screening threshold is `max(5 m, 25% of selected height)`. This is a triage threshold, not a calibrated error bar and not a claim that one source is wrong.

## 16. Building-height ledger and inspector

`BuildingHeightLedgerForWithContext` exposes:

- selected AGL height and provenance;
- selected evidence class;
- base elevation evidence and uncertainty;
- compatible absolute roof elevation, when possible;
- alternative sources and conflict statistics;
- source precedence and policy version.

The API exposes this without changing RF:

- `GET /api/spatial-evidence` — active-pack summary and fingerprint;
- `GET /api/spatial-evidence/buildings/:id` — selected-building ledger, base/roof evidence, dataset identity, and terrain declaration;
- `POST /api/spatial-evidence/path-profile` — isolated terrain path samples.

The existing viewport building overlay is now selectable. Its Map Inspector calls the diagnostic building-ledger endpoint and exposes the selected AGL value, evidence class, source/version, ground base and spread, roof elevation when compatible, terrain/datum compatibility, and conflict status. The map styling remains a building/material overlay rather than an RF coverage or signal-strength layer; provenance is not presented as coverage.

## 17. Diagnostic RF impact

The comparison artifact is [concept-4f3a-data-quality-comparison.json](concept-4f3a-data-quality-comparison.json). With no external source activated:

- terrain coverage remains 0%;
- explicit/qualified height coverage remains 6,074 / 161,784 = 3.75%;
- the 432-path transition matrix remains 29 `LOS → LOS`, 248 `NLOS → NLOS`, and 155 `unknown → unknown`, with zero `LOS → NLOS` or `NLOS → LOS` transitions;
- P.526 remains 29 eligible and 403 unavailable because of unknown obstruction height;
- P.1411 remains 0 fully automatic paths because morphology and both-below-rooftop evidence are absent;
- reflection readiness remains 777 geometry candidates with height evidence but 0 terrain-anchored vertical spans.

These are evidence/readiness results, not new propagation outputs.

## 18. Performance and memory

The implementation is designed for reusable handles and bounded block reads. The fixture benchmarks are:

```bash
cd backend-go
go test ./raytracer -run '^$' -bench 'BenchmarkConcept4F3A' -benchmem -benchtime=1x
```

The benchmark covers 1,000 terrain samples, a path profile, a building-base calculation, and—when `ATOM_DATASET_DIR` is set—the full 161,784-building height-ledger join. The GeoTIFF reader’s cache is bounded to 32 blocks and does not decode an entire regional raster per request. The actual Ankara height-aware audit completed in 40.28 s wall time, including its existing optimizer ledger; the new spatial evidence endpoints do not invoke that optimizer.

On the capture host (Apple M4, darwin/arm64, one benchmark iteration), the measurements were 180.5 µs / 8,048 B for 1,000 in-memory terrain samples, 108.75 µs / 14,736 B for the path profile, 7.917 µs / 336 B for one footprint base calculation, and 40.357 ms / 93,187,584 B for the full Ankara height-ledger join. The last figure includes Go allocations for 161,784 diagnostic ledgers; it is not a raster-memory requirement and does not run in canonical RF paths.

## 19. Licensing and reproducibility

Manifest layer metadata records source, version, license, CRS, kind, datum, resolution, interpolation, acquisition epoch, and SHA-256 file identity. The spatial fingerprint is deterministic and includes:

- terrain dataset IDs/checksums;
- building-height dataset IDs/checksums;
- matching policy version;
- source precedence;
- interpolation method;
- datum transformation policy.

It excludes local filesystem paths, runtime, and timestamps. The current active-pack fingerprint is returned by `GET /api/spatial-evidence`. The fingerprint is not added to canonical RF scenario fingerprints yet because the data is not a canonical RF input.

Raw restricted national products and unacquired vendor tiles are not committed. Their acquisition instructions, source terms, and eventual hashes belong in a future authorized pack manifest.

## 20. Promotion gate for Concept 4F.3B

Canonical RF may consume spatial evidence only after all of the following are true:

1. A selected terrain source is legally usable, checksummed, declared as DTM or a separately bounded DSM, and has a compatible vertical datum/geoid.
2. Raster coverage, no-data behavior, local resolution, and validation samples are quantified for Ankara.
3. External height records have deterministic exact/high-confidence matches, acquisition/version/license metadata, and a source-disagreement audit.
4. Fallback-only buildings are materially reduced without hiding ambiguous/unmatched records.
5. Building-base spread and absolute-roof compatibility are understood for representative slopes.
6. The 432-path diagnostic transition matrix and P.526/P.1411/reflection readiness changes are reviewed.
7. A canonical before/after artifact proves that any intended RF change is explicit, reproducible, and limited to the promoted input.
8. Runtime/memory remain acceptable, and default mode remains invariant until the explicit activation switch is selected.

The current recommendation is **no-go for 4F.3B activation**. The foundation is ready; the data acquisition and validation gates are not.

## References

- [Source audit](concept-4f3a-source-audit.json)
- [Pre-change baseline](concept-4f3a-pre-change-baseline.json)
- [Data-quality comparison](concept-4f3a-data-quality-comparison.json)
- [Ankara readiness](concept-4f3a-ankara-readiness.json)
- [Concept 4F.1 height-aware obstruction](concept-4f1-height-aware-obstruction.md)
- [Concept 4F.2 diffraction diagnostic](concept-4f2-diffraction-diagnostic.md)
- [Concept 4I.2B P.1411 applicability](concept-4i2b-p1411-applicability.json)
- [Concept 4I.5A reflection readiness](concept-4i5a-ankara-readiness.json)
- [Copernicus DEM product handbook](https://dataspace.copernicus.eu/sites/default/files/media/files/2024-06/geo1988-copernicusdem-spe-002_producthandbook_i5.0.pdf)
- [Copernicus Data Space DEM API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM.html)
- [NASADEM user guide](https://lpdaac.usgs.gov/documents/1318/NASADEM_User_Guide_V12.pdf)
- [ASTER GDEM v3 user guide](https://www.earthdata.nasa.gov/s3fs-public/2025-04/ASTGTM_User_Guide_V3.pdf)
- [OpenTopography developer documentation](https://opentopography.org/developers)
- [OSM height key](https://wiki.openstreetmap.org/wiki/Height)
- [OSM building:levels key](https://wiki.openstreetmap.org/wiki/Key:building:levels)
- [Microsoft GlobalMLBuildingFootprints](https://github.com/microsoft/GlobalMLBuildingFootprints)
