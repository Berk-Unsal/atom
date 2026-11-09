# Desktop default-data redistribution review

Status: **pending maintainer review; not an approval to distribute the default data in a public desktop package**. This records the concrete evidence and remaining decisions for #155. Local unsigned development/test resources keep the existing pack. No dataset was regenerated, relabeled as licensed, or replaced to hide a missing permission record.

## Exact proposed bundle

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `manifest.json` | 2,400 | `9f2341ca88d2ae421bb7f60c405af7addd1efb6452c529f2c8e4883acda122b5` |
| `ankara_5g_nodes.geojson` | 102,831 | `c460c254d8748df52305d141b2f5e5147757a00b9d0581d8670084aa29ee3bd8` |
| `ankara_buildings.geojson` | 116,805,843 | `d952a853b1146fe4e4136c2d8bac1b8e2c7152b33d78b0d9f82399350bfd50fc` |

The read-only bundle includes only those declared files: 116,911,074 bytes, approximately 111.50 MiB, before filesystem/archive overhead. Pipeline source dumps, captures and caches are excluded. The pack identifies `ankara-open-planning`, version `2026.07`, generated `2026-07-17`. Canonical validation counts 451 towers and 161,784 buildings; the manifest's historical quality annotation says 161,626 buildings. That annotation was not silently rewritten as part of a rights review.

The machine-readable [review record](https://github.com/Berk-Unsal/atom/blob/codex/atom-desktop-datasets/desktop/data-redistribution.json) is deliberately pending and has no approval. Future public installer/release work must enforce that gate against the actual bundled hashes; a local build or a green CI run cannot supply the missing approval.

## Reproduced tower transformation

On 2026-11-09, the local ignored OpenCellID source file `286.csv` was found and audited without uploading or committing its contents. It is 1,195,019 bytes, SHA-256 `bd3335e3bcc451038a0979c0e1efeddeef879fb51455398444d75b62033cae9d`. Its filesystem timestamp is not proof of download date, source authorization, or applicable historical terms.

Running the existing `extract_ankara.py` with its unchanged defaults, followed by `export_tower_geojson.py`, into a temporary directory reproduced both checked-in outputs byte for byte. The audit used Python 3.12 and pandas 2.2.3. The derived CSV SHA-256 is `e45ccdb2da7a08bf0e8cfa17e72d12c6c7f1db56482f16276ae80ea9ae53f03a`; the resulting GeoJSON has the exact tower hash above. The extraction selects the existing Ankara bounding box, deduplicates and sorts records, and falls back from fewer than 50 NR records to LTE records explicitly marked simulated. All 451 output rows are that LTE-as-5G planning fallback; this is not an operator-verified 5G inventory.

Repository-history follow-up found the [original June 19 source file](https://github.com/Berk-Unsal/atom/blob/d8af09cea0b3d5467da7bc6e9fd21c1d74f4f0a2/286.csv), Git blob `3f39cc6113be121b77afc58ef482ab1c896bc92f`. Its decoded bytes exactly match the local source size and SHA-256 above. The [first July 17 manifest](https://github.com/Berk-Unsal/atom/blob/4cb0efa2038072e2d4fd8b9f922c27aa48662bff/data-pipeline/manifest.json) already records both current layer hashes and says “Review upstream OpenCellID terms before redistribution.” The [June 23 building LFS pointer](https://github.com/Berk-Unsal/atom/blob/e9446dcb341f08400151ad5d1677db12f0a165ab/data-pipeline/ankara_buildings.geojson) records the current building SHA-256 and 116,805,843-byte size. These establish when the inputs/derived files were present in this repository. No additional source dump was committed or uploaded by this audit.

This establishes a reproducible source-to-derived-file link and repository provenance. The original upstream acquisition record, applicable source notices and prior redistribution approval were not found in the checked documentation/history. They remain required evidence, rather than being inferred from a local filename or today's license page.

## Current upstream terms and proposed notices

Official sources checked 2026-11-09:

- [OpenCellID attribution guidance](https://docs.opencellid.org/docs/attribution) identifies its downloaded/API data as CC BY-SA 4.0 and describes attribution, source/license links, modification notices and ShareAlike duties. Its guidance includes visible attribution for data/results and report/printed-output attribution. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) supplies the license reference. These current pages do not attest how this exact historical input was acquired.
- [OpenStreetMap copyright and license guidance](https://www.openstreetmap.org/copyright) identifies the database's ODbL terms and attribution duties. The existing building preparation script derives footprints and adds heuristic demand attributes. No exact original OSM extract/acquisition record was found here; the currently tracked derived layer and script do not supply that missing trail.

For maintainer review, the proposed notice set must credit OpenStreetMap contributors with the copyright/ODbL link and credit OpenCellID with source and CC BY-SA links, identify the Ankara selection, deduplication/export, simulated LTE fallback and building demand enrichment, and preserve applicable source notices. The review must decide the separate layer/adapted-database treatment and corresponding share-alike distribution obligations. A software MIT license alone does not settle those data obligations.

Before approval, confirm the exact acquisition/terms evidence, the complete source/adaptation notices delivered alongside the files, and visible attribution in app data/results and exported reports. Native Save/Print preserves existing report provenance and bytes; it does not manufacture a new license grant or rewrite historical report metadata. If the exact default pack cannot be approved, select and qualify an already-supported approved sample pack through an explicit follow-up decision.

Record the approving maintainer and review URL in the machine-readable record only after that review. Approval must remain bound to the exact manifest and layer hashes. Public distribution remains gated; implementation/test progress on #155 does not close this acceptance criterion.

## Basemap service is a separate decision

The desktop uses the visible OSM Standard fallback under the current [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/): HTTPS, visible contributor attribution, a distinct `A.T.O.M/<version>` User-Agent with project URL, normal HTTP caching, and no area prefetch or offline tile distribution. Native requests do not spoof localhost or browser Referer headers. The public service is best-effort; denied/offline tiles leave RF overlays and explicit retry available.

[Stadia authentication guidance](https://docs.stadiamaps.com/authentication/) recommends API keys for desktop applications; its localhost exemption does not establish authorization for `app://atom`. No private shared key is embedded. Unconfigured Stadia choices and hosts are therefore unavailable in the native target. Existing browser provider defaults and deployment authentication remain separate.

Routine automated native tests block public OSM DNS from process startup. The isolated development fixture adds the same block before any renderer. The explicit online qualification permits only one fixed tile URL, checks a real image response and native cache reuse after relaunch, and never pans/zooms or prefetches an area. The [dataset qualification](desktop-datasets-qualification.md) records the exact scope and evidence.
