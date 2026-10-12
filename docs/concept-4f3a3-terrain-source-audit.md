# Concept 4F.3A.3 — Ankara terrain-source audit

Captured `2026-09-19` for the exact AOI `[32.45, 39.55, 33.25, 40.25]` in EPSG:4326. This is a diagnostic evidence pilot. The canonical dataset remains unchanged and terrain remains unavailable to canonical RF calculations.

## Source identity and license

The primary candidate is NASADEM Merged DEM Global 1 arc second V001. NASA’s [Earthdata catalog entry](https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001) describes global one-arc-second one-degree HGT tiles derived from SRTM and other source inputs; the [official NASADEM user guide](https://lpdaac.usgs.gov/documents/2237/NASADEM_User_Guide_V13.pdf) documents the merged HGT integer postings as metres relative to the EGM96 geoid. LP DAAC’s [reuse guidance](https://forum.earthdata.nasa.gov/viewtopic.php?t=6648) records public-domain/CC0-style reuse terms with citation requested. Direct Earthdata downloads were credential-gated in this environment, so the acquired GeoTIFF representations came from a public mirror; official product identity, tile names, and upstream links are retained in `concept-4f3a3-nasadem-manifest.json`.

FABDEM V1-2 is the research comparator. The [University of Bristol record](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/), [release readme](https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/readme.txt), and [license text](https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/license.txt) identify a global one-arc-second model-derived bare-earth candidate, with horizontal WGS84/EPSG:4326 and vertical EGM2008, under CC BY-NC-SA 4.0. It is not a production dependency: the license’s non-commercial and ShareAlike terms require a separate use review. The official [release directory](https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/) and [V1-2 changelog](https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/FABDEM-V1-2%20Changelog.pdf) are retained as provenance.

## Tile and datum gate

NASADEM tiles: `4`. FABDEM tiles: `4`. All four one-degree tiles for each source intersect the AOI and their SHA-256 values are recorded in the two manifests. The source-native adapter uses bilinear interpolation and treats all four no-data neighbours as unavailable, matching the diagnostic Go sampler contract.

The hard comparison gate is **closed**: NASADEM is orthometric EGM96 while FABDEM is orthometric EGM2008. No sourced EGM96-to-EGM2008 transformation was applied. Therefore the raw difference is retained only as an untransformed diagnostic, and the demeaned difference is labelled a relative surface-shape diagnostic—not an absolute source error, accuracy estimate, or truth ranking.

## Coverage and quality

| Source | Nominal AOI coverage | Valid deterministic grid samples | Base evidence available | Base spread >5 m |
|---|---:|---:|---:|---:|
| NASADEM | 1.000000 | 1.000000 | 1.000000 | 13943 |
| FABDEM | 1.000000 | 1.000000 | 0.999796 | 10627 |

The building-base method is a robust perimeter median of outer-ring vertices, edge midpoints, and the polygon centroid. It is computed independently for each source over `161784` loader-visible footprints (MultiPolygon parts expanded with stable logical IDs). All `6074` known OSM AGL heights are carried into source-local diagnostic roof counts; generic fallback heights are excluded. NASADEM remains `dem_unspecified` and is not a production ground anchor. FABDEM remains a research-only bare-earth candidate.

## Source comparison and stratification

The all-sample result is `relative_diagnostic` with `20000` common samples. Its datum-mixed raw median offset is `-0.534 m`; this number is not interpreted as an error. The demeaned surface-shape diagnostic has median `-0.009 m` and MAE `1.967 m`.

Urban samples are repository building centroids and open samples are deterministic AOI-grid points outside building footprints. Vegetation effect is not assessed because no land-cover truth layer is present. Slope strata use four-neighbour NASADEM finite differences only to organize relative diagnostics; neither stratum is an accuracy claim.

## 432-path evidence audit

The fixed six-cell, 72-ray, 400 m sample produces 432 path profiles per source. Profiles use a 30 m minimum spacing and remain diagnostic. They report valid terrain sample counts, source-local terrain range, and clearance against a straight radio line using source-local endpoint elevations plus 25 m/1.5 m antenna heights. They do not change LOS/NLOS, P.526, diffraction, P.1411, reflection, interference, radio quality, optimization, or any canonical fingerprint.

NASADEM complete profiles: `432`; candidate terrain-obstruction profiles: `432`. FABDEM complete profiles: `432`; candidate terrain-obstruction profiles: `432`.

## Readiness and decision

P.526 receives a complete source-local profile diagnostic but no canonical terrain term. P.1411 remains not ready because morphology and compatible rooftop relations are absent. Reflection remains not ready because terrain-anchored vertical spans, materials, roughness, visibility, and compatible production datum evidence are not established.

The evidence decision is: NASADEM is a legally reusable primary candidate for a future terrain-only validation phase, but **NO-GO for production ground fusion in this phase**; FABDEM is **research-only** and cannot become a production dependency. The canonical RF path remains invariant by construction. Source fingerprints are `nasadem-terrain-evidence-72ca291a55aafb5a033b5e99061968135798dd39e4d7c997ed451b14a1e7462f` and `fabdem-terrain-evidence-bb6b15acb7276d49ce5d4fdd11a45bcb11dfba5ad00985fcbff3ec6d5c40dfda`.

## Reproduction

```text
data-pipeline/.venv/bin/python data-pipeline/terrain_source_pilot.py \
  --manifest data-pipeline/manifest.json \
  --buildings data-pipeline/ankara_buildings.geojson \
  --towers data-pipeline/ankara_5g_nodes.geojson \
  --baseline docs/concept-4f3a-pre-change-baseline.json \
  --raw-dir /tmp/atom-4f3a3-20260919 \
  --output-dir docs
```

The runner is deterministic for a fixed input manifest, raw-tile checksums, source definitions, adapter version, interpolation, base method, threshold, and path sample. It writes no raw tiles into the repository.
