# Concept 4F.3A.1 — Ankara external building-height acquisition and matching pilot

Status: the bounded acquisition, normalization, and audit pilot is **GO**. Numeric promotion to a future Concept 4F.3B is **NO-GO** for this source release because the exact Ankara-intersecting tiles contain no positive height estimates.

This phase is a data-quality pilot. It does not change the canonical RF dataset, propagation equations, LOS/NLOS defaults, optimizer inputs, or the existing source-precedence implementation. Raw source objects remain outside the repository; checksums, selection rules, and generated audits are committed.

## Source and semantics

The selected source is [Microsoft GlobalMLBuildingFootprints](https://github.com/microsoft/GlobalMLBuildingFootprints), release `2026-08-13`, acquired through the source project's [dataset link table](https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv). The project's [README](https://raw.githubusercontent.com/microsoft/GlobalMLBuildingFootprints/main/README.md) documents line-delimited GeoJSON in `.csv.gz` objects, EPSG:4326 geometry, and a CDLA Permissive 2.0 license; the [license text](https://cdla.dev/permissive-2-0/) is retained in the acquisition manifest.

The source `height` property is a model-estimated mean height within a building polygon, above ground, in metres. `height=-1` means that no height estimate is available. The source `confidence` property describes footprint-detection confidence, not height-estimate accuracy. Therefore an eventual positive record must remain `usable_with_qualification`; it is never trusted merely because it came from the external source.

The normalization adapter emits the existing external sidecar contract: an EPSG:4326 GeoJSON FeatureCollection with `properties.height_agl_m`, source release/tile/feature provenance, and no canonical RF coupling. The empty current output is retained at `docs/concept-4f3a1-normalized-external-heights.geojson`.

## Exact Ankara acquisition

The active AOI was read from `data-pipeline/manifest.json`, not inferred from a country boundary: `[32.45, 39.55, 33.25, 40.25]`, EPSG:4326. Only Turkey link-table rows whose Bing quadkey bounds intersect that AOI were acquired.

| Quadkey | Tile bounds `[W,S,E,N]` | Link-table size | Compressed bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `122101112` | `[32.343750, 39.909736, 33.046875, 40.446947]` | 23.3 MB | 24,479,567 | `1ca4afd9d5e1ef35d8c4ad8143b80e7597ddf9f8e03f1df96474a8712cad93a4` |
| `122101113` | `[33.046875, 39.909736, 33.750000, 40.446947]` | 5.7 MB | 6,013,840 | `2d5e7b323df0495495cad3a85658c82326cd319274ecc3f37e542746f0f57aac` |
| `122101130` | `[32.343750, 39.368279, 33.046875, 39.909736]` | 14.4 MB | 15,145,651 | `9f1e50ef9cc2817b827f15cb9dbcd7c207e3a0941383ee1b2f18b9cda62e5087` |
| `122101131` | `[33.046875, 39.368279, 33.750000, 39.909736]` | 7.6 MB | 7,938,484 | `2fe24b68da2f3357a80f53919335f4d40ebfb0b4cd0b513edafd4302c7562874` |

The link table itself is SHA-256 `de61b569b0c23c364d61173632d8c5487ea30bf20912c55b9fa1ab4a89d01148`. Raw files are stored externally under `/tmp/globml-2026-08-13-ankara/raw/`; they are not committed.

## Input QA and current result

The four tiles contain 624,354 raw records. Exactly 440,173 intersect the active AOI and 184,181 are rejected as out-of-AOI. In-AOI QA found 0 invalid JSON records, 0 empty geometries, 0 unsupported geometries, 7 self-intersection repairs, 0 duplicate source IDs, 0 duplicate geometries, 9 footprints over 50,000 m², 0 footprints under 4 m², and 6 multipart footprints. The repaired geometries are counted and retained for audit; their source rows are not silently discarded.

All 440,173 in-AOI records have `height=-1` and `confidence=-1`. There are 0 positive heights, 0 non-positive heights other than the missing sentinel, 0 invalid heights, and 0 extreme heights over 500 m. Consequently:

- normalized records: 0;
- exact/high-confidence matches: 0;
- ambiguous matches: 0;
- unmatched numeric records: 0, because there are no numeric records to match;
- OSM buildings gaining external evidence: 0;
- explicit-versus-external and levels-derived-versus-external agreement metrics: not run (`not_run_no_positive_heights`);
- fallback-only reduction: 0 buildings / 0 percentage points.

The footprint-area distribution for the 440,173 in-AOI records has median 148.76 m², mean 318.73 m², p90 641.73 m², p99 2,769.16 m², and maximum 81,176.60 m². The height distribution is intentionally empty rather than fabricated. An auxiliary public [height-coverage index](https://minedbuildings.z5.web.core.windows.net/global-buildings/buildings-with-height-coverage.geojson) was also checked: 66,510 index features, 0 intersecting the active AOI.

## Matching and agreement contract

The reproducible matcher uses `footprint-height-match-v1`, the current thresholds already used by the foundation:

1. exact source identifier, when a defensible shared identifier exists;
2. spatial candidate support from footprint intersection or a centroid within 30 m;
3. acceptance only for a single plausible candidate with IoU ≥ 0.60;
4. more than one plausible candidate is ambiguous;
5. a centroid-only candidate below the IoU threshold is rejected, never promoted;
6. one-to-many, many-to-one, subdivision, and attached/row differences are audited but rejected; only defensible one-to-one matches are accepted.

IoU and centroid distributions are emitted for all candidate edges and accepted edges. For a non-empty source result, the audit separately compares accepted external heights with OSM explicit tags and with the existing 3 m-per-level derivation. Large disagreement is `abs(external - selected_osm) > max(5 m, 25% of selected OSM height)`. OSM explicit height has precedence; an accepted external record may replace levels-derived or fallback evidence only after matching quality is established.

The controlled fixture suite A–L covers exact, high-IoU, centroid-only rejection, ambiguity, one-to-many, many-to-one, exact-ID, disagreement, explicit precedence, levels agreement, fallback replacement, and input-QA classification. It is in `data-pipeline/test_external_height_pilot.py`.

## Diagnostic and readiness impact

The pre-change baseline is preserved verbatim in `docs/concept-4f3a1-pre-change-baseline.json`. The 432-path diagnostic rerun passed with 29 LOS→LOS, 248 NLOS→NLOS, 155 unknown→unknown, and zero LOS/NLOS cross-transitions. P.526 remains 29 diagnostic-eligible paths and 403 unknown-height-ineligible paths, with 338 blocked only by unknown height. P.1411 remains not ready with 0 fully automatic paths. Reflection remains diagnostic-only: 6,368 geometry candidates, 777 with height evidence, 0 terrain-anchored, and 0 material-evidence footprints.

Because the accepted match set is empty, no new map provenance records are shown and the existing spatial-evidence inspector contract is unchanged. For a future non-empty accepted set, the normalized sidecar and matching audit provide source, release, tile, confidence, IoU, centroid distance, selected precedence, and alternatives for a provenance layer/inspector comparison.

The pilot fingerprint includes source release, link-table checksum, raw tile checksums, matching policy, normalization adapter, and accepted match set. UI state is excluded. The observed fingerprint is `pilot-ed25b1f6a5e7c27e44e987f0e7c67f2d8d3b55936b386ce5106b6536ae46eb92`.

The optimized no-positive run completed in about 27 seconds of parsing/normalization with approximately 306 MB peak RSS on the capture host; matching took effectively zero time because there were no numeric records. A non-empty run builds a Shapely STRtree and queries only spatial candidates, avoiding a 161,626 × external all-pairs scan.

## Reproduce

```bash
/tmp/atom-data-pipeline/bin/python data-pipeline/external_height_pilot.py \
  --manifest data-pipeline/manifest.json \
  --buildings data-pipeline/ankara_buildings.geojson \
  --baseline docs/concept-4f3a1-pre-change-baseline.json \
  --links-url 'https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv' \
  --version 2026-08-13 \
  --raw-dir /tmp/globml-2026-08-13-ankara/raw \
  --output-dir docs \
  --download
```

The required JSON artifacts are `concept-4f3a1-acquisition-manifest.json`, `concept-4f3a1-matching-audit.json`, `concept-4f3a1-height-agreement.json`, `concept-4f3a1-data-quality-impact.json`, `concept-4f3a1-readiness-impact.json`, and `concept-4f3a1-post-change-comparison.json` in `docs/`.

Final decision: **GO** for this bounded, reproducible acquisition and audit pilot; **NO-GO** for future 4F.3B numeric promotion until a source release supplies positive Ankara height estimates, produces accepted one-to-one matches, reports explicit/levels agreement and large-disagreement cases, and demonstrates a reviewed reduction in fallback-only buildings.
