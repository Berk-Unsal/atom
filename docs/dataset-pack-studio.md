# Dataset Pack Studio

Dataset Pack Studio builds portable, local A.T.O.M dataset packs for arbitrary regions. It inspects source coverage before build, repairs vector geometry, reprojects vectors to EPSG:4326, crops to an optional planning extent, writes deterministic GeoJSON, hashes every emitted layer, and produces a schema-v2 manifest with provenance and QA evidence.

It does not download data from a browser or upload source data to a service. Input processing and runtime switching remain local.

## Environment

Install the hash-locked pipeline environment:

```bash
python3 -m venv data-pipeline/.venv
data-pipeline/.venv/bin/pip install --require-hashes -r data-pipeline/Requirements.txt
```

The Studio directly uses GeoPandas, Shapely, and PyProj. Supported vector inputs are formats readable by GeoPandas, including GeoJSON and GeoPackage. Terrain is copied as a binary layer and must have truthful CRS and unit metadata.

## Inspect Sources Before Building

```bash
data-pipeline/.venv/bin/python data-pipeline/pack_studio.py inspect \
  --towers /data/izmir/cells.gpkg \
  --buildings /data/izmir/buildings.gpkg \
  --bounds 26.80,38.30,27.35,38.65 \
  --json
```

The preview reports source and output CRS, input/invalid/repaired/dropped/output geometry counts, per-field missing counts, output bounds, and requested-area coverage. Use `--towers-crs` or another `--<layer>-crs` override only when a source has no embedded CRS and the supplied value is authoritative.

## Build A Schema-v2 Pack

```bash
data-pipeline/.venv/bin/python data-pipeline/pack_studio.py build \
  --id izmir-planning-2026 \
  --name "Izmir Planning Dataset" \
  --version 2026.07 \
  --output /datasets/izmir-planning-2026 \
  --source "Municipal building inventory, 2026-06" \
  --source "Operator-authorized planning export, 2026-07" \
  --license "Municipal Open Data License" \
  --license "Internal planning use only" \
  --confidence "Planning-grade cells; heights are partially surveyed." \
  --bounds 26.80,38.30,27.35,38.65 \
  --towers /data/izmir/cells.gpkg \
  --buildings /data/izmir/buildings.gpkg \
  --terrain /data/izmir/elevation.tif \
  --terrain-crs EPSG:32635 \
  --terrain-units m \
  --clutter /data/izmir/clutter.gpkg \
  --building-heights /data/izmir/heights.gpkg \
  --materials /data/izmir/materials.gpkg
```

The output directory must be absent or empty. The Studio stages the pack beside the destination and publishes it only after all layers and the manifest are complete. Required tower/building layers are normalized to `towers.geojson` and `buildings.geojson`; optional layers use stable filenames. Every referenced file receives a SHA-256 entry.

## Manifest Schema v2

Schema v2 retains the required identity, EPSG:4326 bounds, sources, licenses, confidence note, files, and hashes from v1, and adds:

- Per-layer kind, format, CRS, optionality, source, license, confidence, and optional units.
- Geometry repair and output counts for each vector layer.
- Missing-field counts and requested/data coverage bounds.
- Optional `terrain`, `clutter`, `building_heights`, and `materials` files.

The engine loads and validates optional-layer metadata. A supported north-up EPSG:4326 COG/GeoTIFF terrain layer is sampled by the 2.5D point-to-point path profiler. Fast sectors, interference, optimization, batch runs, and analytical surfaces remain terrain-independent. Clutter and separate height/material sidecar layers are not automatically joined; user-selected path-profile sensitivity inputs must not be interpreted as surveyed layer values.

## Validate And Install

Validate the finished pack with the same loader used by the server:

```bash
cd backend-go
go run ./cmd/validate-dataset /datasets/izmir-planning-2026
```

Set `ATOM_DATASET_DIR` to the initial pack. To enable the Data tool's installed-pack list and safe switching, set `ATOM_DATASETS_ROOT` to a directory that contains packs as immediate child directories:

```text
/datasets/
├── ankara-open-planning/manifest.json
└── izmir-planning-2026/manifest.json
```

The runtime never accepts a filesystem path from the switch API. `POST /api/datasets/switch` accepts an installed manifest ID, resolves only entries beneath `ATOM_DATASETS_ROOT`, rejects duplicate IDs and symlink escapes, validates the candidate's geometry and hashes, then swaps the immutable in-memory pack. A failed load leaves the previous pack active. Configure `DATASET_ADMIN_API_KEY` at an origin gateway when dataset activation must be restricted.

## Required Review

Before using a pack for a planning decision, review source authority, redistribution terms, missing RF fields, geometry repairs/drops, requested coverage ratio, coordinate reference systems, optional raster units, and whether confidence statements match the actual collection method. A successful hash or geometry validation proves integrity and structural usability, not operator accuracy.

## Related References

- [Deployment](./deployment.html)
- [REST API](./api.html)
- [Modeling limits](./modeling-limits.html)
