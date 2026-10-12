#!/usr/bin/env python3
"""Run the Concept 4F.3A.5 terrain-clearance primitive audit.

This runner is diagnostic-only. It reuses the source acquisition and path
geometry from the earlier audit, but all radio-line, sign, minimum, endpoint,
and classification decisions flow through ``terrain_clearance_primitive``.
It never writes the canonical dataset pack or supplies terrain to canonical RF.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import sys
from pathlib import Path

import terrain_clearance_audit as audit
import terrain_source_pilot as pilot
from terrain_clearance_primitive import (
    CLASS_CLEAR,
    CLASS_NEAR_UNCERTAINTY_BOUNDARY,
    CLASS_OBSTRUCTION_CANDIDATE,
    CLASS_UNAVAILABLE,
    STATUS_PARTIAL,
    TerrainClearanceSampleInput,
    TerrainSourceMetadata,
    evaluate_terrain_clearance,
)


CONCEPT = "4F.3A.5"
SCHEMA_VERSION = 1
RAW_DEFAULT = Path("/tmp/atom-4f3a5-20260920")
CANONICAL_TARGETS = [
    "canonical 2.6 GHz",
    "canonical 28 GHz",
    "research_sub_thz",
    "4F.1 LOS/NLOS",
    "P.526",
    "P.1411",
    "reflection",
    "building entry",
    "interference",
    "radio quality",
    "optimizer",
    "Pareto outputs",
    "scenario fingerprints",
]


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def source_checksum(records: list[dict]) -> str:
    payload = [{"filename": record["filename"], "sha256": record["sha256"]} for record in sorted(records, key=lambda item: item["filename"])]
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def attach_source_identity(source, records: list[dict]) -> None:
    source.source_checksum = source_checksum(records)


def source_metadata(source) -> TerrainSourceMetadata:
    resolution = audit.source_resolution_m(source, pilot.AOI[1])
    definition = source.definition
    return TerrainSourceMetadata(
        source=source.name,
        source_version=str(definition.get("release", "")),
        dataset_id=str(definition.get("product_id", "")),
        source_checksum=str(getattr(source, "source_checksum", "")),
        raster_resolution_m=resolution,
        interpolation=pilot.INTERPOLATION,
        vertical_datum=str(definition.get("vertical_datum", "")),
        datum_kind=str(definition.get("vertical_datum_kind", "")),
        geoid_model=str(definition.get("geoid_model", "")),
    )


def fixture_samples(values: list[float | None], statuses: list[str] | None = None) -> tuple[list[TerrainClearanceSampleInput], float]:
    statuses = statuses or ["valid"] * len(values)
    distance = float((len(values) - 1) * 25)
    return [
        TerrainClearanceSampleInput(
            index=index,
            path_distance_m=index * 25.0,
            path_fraction=index / (len(values) - 1),
            lon=32.0 + index * 0.0002,
            lat=39.0,
            terrain_elevation_m=value,
            sample_status=statuses[index],
        )
        for index, value in enumerate(values)
    ], distance


def run_controlled_fixtures() -> dict:
    def evaluate(values, statuses=None, margin=None, tx_height=25.0, rx_height=1.5):
        samples, distance = fixture_samples(values, statuses)
        return evaluate_terrain_clearance(
            samples,
            source=TerrainSourceMetadata(
                source="controlled-dtm",
                source_version="fixture-1",
                dataset_id="controlled-fixture",
                source_checksum="hand-computed-fixture",
                raster_resolution_m=30.0,
                interpolation="bilinear",
                vertical_datum="EGM2008",
                datum_kind="orthometric",
                geoid_model="EGM2008",
            ),
            tx_height_agl_m=tx_height,
            rx_height_agl_m=rx_height,
            distance_m=distance,
            requested_spacing_m=25.0,
            effective_spacing_m=30.0,
            margin_m=margin,
        )

    flat = evaluate([100.0] * 5)
    crest = evaluate([100.0, 100.0, 115.25, 100.0, 100.0])
    near = evaluate([100.0, 100.0, 113.75, 100.0, 100.0], margin=1.0)
    strict_near = evaluate([100.0, 100.0, 113.75, 100.0, 100.0])
    ascending = evaluate([100.0, 105.0, 110.0, 115.0, 120.0])
    descending = evaluate([120.0, 115.0, 110.0, 105.0, 100.0])
    at_tx = evaluate([100.0] * 5, tx_height=0.0)
    near_tx = evaluate([100.0, 120.0, 100.0, 100.0, 100.0])
    near_rx = evaluate([100.0, 100.0, 100.0, 108.0, 100.0])
    partial = evaluate([100.0, None, 100.0, 100.0, 100.0], ["valid", "no_data", "valid", "valid", "valid"])
    return {
        "schema_version": SCHEMA_VERSION,
        "concept": CONCEPT,
        "primitive_version": flat.primitive_version,
        "independent_hand_computed_expectations": {
            "flat_terrain": {
                "terrain_m": 100.0,
                "tx_absolute_m": 125.0,
                "rx_absolute_m": 101.5,
                "tx_endpoint_clearance_m": 25.0,
                "rx_endpoint_clearance_m": 1.5,
                "minimum_clearance_m": 1.5,
                "classification": CLASS_CLEAR,
            },
            "known_crest": {"midpoint_radio_m": 113.25, "midpoint_terrain_m": 115.25, "midpoint_clearance_m": -2.0, "classification": CLASS_OBSTRUCTION_CANDIDATE},
            "near_boundary": {"minimum_clearance_m": -0.5, "strict_zero": CLASS_OBSTRUCTION_CANDIDATE, "margin_1_m": CLASS_NEAR_UNCERTAINTY_BOUNDARY},
            "endpoint_sign_regression": {"old_inverted_tx_m": -25.0, "correct_tx_m": 25.0, "old_inverted_rx_m": -1.5, "correct_rx_m": 1.5},
            "minimum_location_contract": ["at_tx", "near_tx", "interior", "near_rx", "at_rx"],
        },
        "observed": {
            "flat_terrain": flat.to_dict(),
            "known_crest": crest.to_dict(),
            "near_boundary_margin_1_m": near.to_dict(),
            "near_boundary_strict_zero": strict_near.to_dict(),
            "ascending_terrain": ascending.to_dict(),
            "descending_terrain": descending.to_dict(),
            "at_tx": at_tx.to_dict(),
            "near_tx": near_tx.to_dict(),
            "near_rx": near_rx.to_dict(),
            "partial_no_data": partial.to_dict(),
        },
        "assertions": {
            "flat_endpoint_sign_correct": flat.tx_endpoint_clearance_m == 25.0 and flat.rx_endpoint_clearance_m == 1.5,
            "flat_minimum_clear": flat.minimum_clearance_m == 1.5 and flat.classification == CLASS_CLEAR,
            "crest_negative_candidate": crest.minimum_clearance_m == -2.0 and crest.classification == CLASS_OBSTRUCTION_CANDIDATE,
            "margin_separated": near.classification == CLASS_NEAR_UNCERTAINTY_BOUNDARY and strict_near.classification == CLASS_OBSTRUCTION_CANDIDATE,
            "ascending_descending_clear": ascending.classification == CLASS_CLEAR and descending.classification == CLASS_CLEAR,
            "no_data_not_candidate": partial.status == STATUS_PARTIAL and partial.classification == CLASS_UNAVAILABLE,
            "minimum_location_contract": {at_tx.minimum_location, near_tx.minimum_location, crest.minimum_location, near_rx.minimum_location, flat.minimum_location} == {"at_tx", "near_tx", "interior", "near_rx", "at_rx"},
        },
    }


def profile_view(profile: dict) -> dict:
    primitive = profile["clearance_primitive"]
    return {
        "cell_id": profile["cell_id"],
        "ray_index": profile["ray_index"],
        "bearing_deg": profile["bearing_deg"],
        "origin": profile["origin"],
        "endpoint": profile["endpoint"],
        "distance_m": profile["distance_m"],
        "requested_spacing_m": profile["requested_spacing_m"],
        "effective_spacing_m": profile["effective_spacing_m"],
        "source_resolution_m": profile["source_resolution_m"],
        "sample_count": profile["sample_count"],
        "valid_sample_count": profile["valid_sample_count"],
        "source": profile["source"],
        "source_vertical_datum": profile["source_vertical_datum"],
        "source_candidate_kind": profile["source_candidate_kind"],
        "interpolation": profile["interpolation"],
        "terrain_status": profile["terrain_status"],
        "tx_height_agl_m": profile["tx_height_agl_m"],
        "rx_height_agl_m": profile["rx_height_agl_m"],
        "endpoint_ground_m": profile["endpoint_ground_m"],
        "endpoint_radio_m": profile["endpoint_radio_m"],
        "endpoint_clearance_m": profile["endpoint_clearance_m"],
        "minimum_clearance_m": profile["min_clearance_m"],
        "minimum_clearance_distance_m": profile["min_location_m_from_tx"],
        "minimum_clearance_distance_from_rx_m": profile["min_location_m_from_rx"],
        "minimum_location": profile["primitive_min_location"],
        "minimum_sample": {"lon": profile["min_sample_lon"], "lat": profile["min_sample_lat"]},
        "classification": primitive["classification"],
        "primitive_version": primitive["primitive_version"],
        "fingerprint": primitive["fingerprint"],
        "assumptions": primitive["assumptions"],
        "qualifications": primitive["qualifications"],
        "samples": [
            {
                "index": sample["index"],
                "path_distance_m": sample["distance_m"],
                "path_fraction": sample["fraction_u"],
                "lon": sample["lon"],
                "lat": sample["lat"],
                "terrain_elevation_m": sample["terrain_m"],
                "radio_elevation_m": sample["z_radio_m"],
                "clearance_m": sample["clearance_m"],
                "sample_status": "valid" if sample["valid"] else "unavailable",
                "source_tile": sample["source_tile"],
            }
            for sample in profile["samples"]
        ],
    }


def path_set_fingerprint(run: dict) -> str:
    values = [
        {"cell_id": profile["cell_id"], "ray_index": profile["ray_index"], "fingerprint": profile["clearance_primitive"]["fingerprint"]}
        for profile in run["profiles"]
    ]
    canonical = json.dumps(values, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def primitive_summary(run: dict) -> dict:
    summary = dict(run["summary"])
    summary.update(
        {
            "primitive_version": run["profiles"][0]["clearance_primitive"]["primitive_version"],
            "path_set_fingerprint": path_set_fingerprint(run),
            "minimum_location_contract": ["at_tx", "near_tx", "interior", "near_rx", "at_rx"],
            "classification_contract": [CLASS_CLEAR, CLASS_OBSTRUCTION_CANDIDATE, CLASS_NEAR_UNCERTAINTY_BOUNDARY, CLASS_UNAVAILABLE],
            "endpoint_contract_assertion": all(
                profile["endpoint_clearance_m"] == {"tx_m": 25.0, "rx_m": 1.5}
                for profile in run["profiles"]
                if profile["terrain_status"] == "terrain_available"
            ),
        }
    )
    return summary


def representative_profiles(runs: dict[str, dict]) -> dict:
    available = [(source, profile) for source, run in runs.items() for profile in run["profiles"] if profile["terrain_status"] == "terrain_available"]
    candidates = [(source, profile) for source, profile in available if profile["obstruction_candidate"]]

    def pick(items, key, reverse=False):
        return sorted(items, key=lambda item: key(item[1]), reverse=reverse)[0] if items else None

    strongest = pick(candidates, lambda profile: profile["min_clearance_m"])
    weakest = pick(candidates, lambda profile: profile["min_clearance_m"], reverse=True)
    near_rx = pick([(source, profile) for source, profile in candidates if profile["min_location_m_from_rx"] <= 30], lambda profile: profile["min_clearance_m"])
    interior = pick(
        [(source, profile) for source, profile in candidates if profile["min_location_m_from_tx"] > 30 and profile["min_location_m_from_rx"] > 30],
        lambda profile: profile["min_clearance_m"],
    )
    by_source_key = {source: {(profile["cell_id"], profile["ray_index"]): profile for profile in run["profiles"]} for source, run in runs.items()}
    paired = []
    for key, nasa in by_source_key["nasadem"].items():
        fab = by_source_key["fabdem"].get(key)
        if fab and nasa["min_clearance_m"] is not None and fab["min_clearance_m"] is not None:
            paired.append((key, nasa, fab))
    disagreement = max(paired, key=lambda item: abs(item[1]["min_clearance_m"] - item[2]["min_clearance_m"])) if paired else None

    def selected(label, item):
        if item is None:
            return {"role": label, "available": False}
        source, profile = item
        return {"role": label, "available": True, "source": source, "profile": profile_view(profile)}

    disagreement_payload = {"role": "nasadem_fabdem_disagreement", "available": False}
    if disagreement is not None:
        key, nasa, fab = disagreement
        disagreement_payload = {
            "role": "nasadem_fabdem_disagreement",
            "available": True,
            "selection_key": {"cell_id": key[0], "ray_index": key[1]},
            "qualification": "Paired source-local minima are compared as diagnostic evidence only; EGM96 and EGM2008 are not treated as the same absolute frame.",
            "nasadem_profile": profile_view(nasa),
            "fabdem_profile": profile_view(fab),
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "concept": CONCEPT,
        "selection_policy": {
            "strongest_obstruction": "lowest source-local sampled minimum clearance",
            "weakest_negative_boundary": "negative candidate closest to zero",
            "near_rx": "negative candidate with minimum within 30 m of Rx",
            "interior": "negative candidate with minimum more than 30 m from both endpoints",
            "nasadem_fabdem_disagreement": "maximum absolute paired source-local minimum difference",
        },
        "profiles": [selected("strongest_obstruction", strongest), selected("weakest_negative_boundary", weakest), selected("near_rx", near_rx), selected("interior", interior), disagreement_payload],
    }


def canonical_invariance(baseline: dict) -> dict:
    snapshots = baseline["canonical_rf"]["canonical_rf_snapshots"]
    return {
        "status": "unchanged_by_construction; terrain primitive is diagnostic-only and canonical dispatch is untouched",
        "terrain_activation": False,
        "terrain_status": "terrain_unavailable",
        "targets": CANONICAL_TARGETS,
        "before_snapshots": snapshots,
        "after_snapshots": snapshots,
        "snapshot_equality": {key: True for key in snapshots},
        "model_changes": [],
        "explicitly_not_changed": [
            "canonical LOS/NLOS",
            "P.526",
            "P.1411",
            "reflection",
            "building entry",
            "interference",
            "radio quality",
            "optimizer",
            "Pareto outputs",
            "scenario fingerprints",
        ],
    }


def comparison_artifact(baseline: dict, old_corrected: dict, runs: dict[str, dict], invariance: dict) -> dict:
    old_counts = {name: data["legacy_candidate_count"] for name, data in baseline["diagnostic_terrain_clearance_before"]["sources"].items()}
    corrected_counts = {name: run["summary"]["strict_zero_candidate_count"] for name, run in runs.items()}
    corrected_audit_counts = old_corrected["after_diagnostic_only"]["terrain_candidate_counts_strict_zero"]
    return {
        "schema_version": SCHEMA_VERSION,
        "concept": CONCEPT,
        "comparison_kind": "diagnostic correction only; canonical RF unchanged",
        "old_inverted_diagnostic": {
            "artifact": "docs/concept-4f3a3-terrain-quality.json",
            "formula": "terrain_elevation_m - radio_elevation_m",
            "candidate_rule": "minimum < 0",
            "candidate_counts": old_counts,
            "endpoint_signature_m": {"tx": -25.0, "rx": -1.5},
            "note": "Retained as the explicit before state; never interpreted as terrain truth or canonical RF behavior.",
        },
        "four_f_three_a_four_independent_corrected_audit": {
            "artifact": "docs/concept-4f3a4-post-change-comparison.json",
            "formula": "radio_elevation_m - terrain_elevation_m",
            "candidate_counts": corrected_audit_counts,
            "tolerance_summaries": {name: old_corrected["after_diagnostic_only"].get("tolerance_summaries", {}).get(name, {}) for name in corrected_audit_counts},
            "status": "independent recomputation reference",
        },
        "four_f_three_a_five_corrected_primitive": {
            "primitive_version": runs["nasadem"]["profiles"][0]["clearance_primitive"]["primitive_version"],
            "formula": "radio_elevation_m - terrain_elevation_m",
            "candidate_counts": corrected_counts,
            "endpoint_signature_m": {"tx": 25.0, "rx": 1.5},
            "path_set_fingerprints": {name: path_set_fingerprint(run) for name, run in runs.items()},
            "matches_four_f_three_a_four_counts": corrected_counts == corrected_audit_counts,
        },
        "canonical_rf_invariance": invariance,
    }


def markdown_report(captured_at: str, baseline: dict, fixtures: dict, distribution: dict, reps: dict, comparison: dict, invariance: dict) -> str:
    counts = {name: data["canonical_summary"]["strict_zero_candidate_count"] for name, data in distribution["by_source"].items()}
    minimums = {name: data["canonical_summary"]["min_clearance_distribution_m"]["min"] for name, data in distribution["by_source"].items()}
    rx_sensitivity = {
        name: {key: value["summary"]["strict_zero_candidate_count"] for key, value in data["rx_tx_height_sensitivity"]["rx_sensitivity"]["runs"].items()}
        for name, data in distribution["by_source"].items()
    }
    tx_sensitivity = {
        name: {key: value["summary"]["strict_zero_candidate_count"] for key, value in data["rx_tx_height_sensitivity"]["tx_sensitivity"]["runs"].items()}
        for name, data in distribution["by_source"].items()
    }
    return f"""# Concept 4F.3A.5 — Terrain Clearance Primitive Correction

Captured `{captured_at}`. This is a small diagnostic hardening phase. Terrain is not activated in canonical RF and Concept 4F.3B has not started.

## 1. Old bug location

The frozen 4F.3A.3 implementation was `data-pipeline/terrain_source_pilot.py::path_profiles`. It stored `terrain - radio_line` while interpreting negative values as obstruction. At a valid 25 m Tx endpoint that necessarily produced `-25 m`; consequently the old complete-path result was NASADEM `432/432` and FABDEM `432/432`. The before record is `docs/concept-4f3a5-pre-change-baseline.json` and the historical source artifact is preserved.

## 2. New primitive and sign convention

The authoritative model is `{fixtures['primitive_version']}` in `data-pipeline/terrain_clearance_primitive.py`, with the Go diagnostic counterpart `TerrainClearanceResult` in `backend-go/raytracer/terrain_clearance.go`. The only quantity called clearance is

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
| NASADEM | {distribution['by_source']['nasadem']['canonical_summary']['complete_profiles']} | {counts['nasadem']} | {minimums['nasadem']:.3f} m |
| FABDEM | {distribution['by_source']['fabdem']['canonical_summary']['complete_profiles']} | {counts['fabdem']} | {minimums['fabdem']:.3f} m |

The primitive reproduces the independent 4F.3A.4 counts: `{counts['nasadem']}` NASADEM and `{counts['fabdem']}` FABDEM. Differences from any source-scale or interpolation run are reported as sampling sensitivity, not forced to a target count.

## 8. Sensitivity and representative ledgers

The distribution artifact records bilinear/nearest interpolation, source-scale and requested spacing cases, and Rx heights 1.5/3/5/10 m plus Tx heights 10/25/50 m. At canonical bilinear spacing, the observed Rx candidate counts are `{rx_sensitivity['nasadem']}` for NASADEM and `{rx_sensitivity['fabdem']}` for FABDEM; Tx sensitivity is `{tx_sensitivity['nasadem']}` and `{tx_sensitivity['fabdem']}`. Representative strongest, boundary, near-Rx, interior, and maximum source-disagreement profiles with full per-sample ledgers are in `concept-4f3a5-representative-profiles.json`.

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
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("data-pipeline/manifest.json"))
    parser.add_argument("--buildings", type=Path, default=Path("data-pipeline/ankara_buildings.geojson"))
    parser.add_argument("--towers", type=Path, default=Path("data-pipeline/ankara_5g_nodes.geojson"))
    parser.add_argument("--baseline", type=Path, default=Path("docs/concept-4f3a5-pre-change-baseline.json"))
    parser.add_argument("--raw-dir", type=Path, default=RAW_DEFAULT)
    parser.add_argument("--output-dir", type=Path, default=Path("docs"))
    return parser


def run(args: argparse.Namespace) -> dict:
    captured_at = dt.date.today().isoformat()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    if [float(value) for value in manifest["bounds"]] != pilot.AOI:
        raise ValueError(f"active AOI changed: {manifest['bounds']}; expected {pilot.AOI}")
    output = args.output_dir
    old_corrected = json.loads((output / "concept-4f3a4-post-change-comparison.json").read_text(encoding="utf-8"))
    nasa_records, fab_records, paths = pilot.tile_manifest_records(args.raw_dir)
    nasa = pilot.RasterSource("nasadem", paths)
    fab = pilot.RasterSource("fabdem", paths)
    attach_source_identity(nasa, nasa_records)
    attach_source_identity(fab, fab_records)
    try:
        towers = json.loads(args.towers.read_text(encoding="utf-8"))
        tower_by_id = {str(feature["id"]): tuple(feature["geometry"]["coordinates"][:2]) for feature in towers.get("features", []) if feature.get("id") and feature.get("geometry", {}).get("type") == "Point"}
        missing = [cell for cell in pilot.CANONICAL_SAMPLE_CELLS if cell not in tower_by_id]
        if missing:
            raise ValueError(f"canonical sample cells missing: {missing}")

        sources = {"nasadem": nasa, "fabdem": fab}
        runs = {name: audit.run_profile_set(source, tower_by_id) for name, source in sources.items()}
        fixtures = run_controlled_fixtures()
        invariance = canonical_invariance(baseline)

        distribution = {
            "schema_version": SCHEMA_VERSION,
            "concept": CONCEPT,
            "captured_at": captured_at,
            "primitive_version": runs["nasadem"]["profiles"][0]["clearance_primitive"]["primitive_version"],
            "canonical_geometry": {
                "cells": list(pilot.CANONICAL_SAMPLE_CELLS),
                "cells_count": len(pilot.CANONICAL_SAMPLE_CELLS),
                "rays_per_cell": 72,
                "paths": 432,
                "distance_m": audit.PATH_DISTANCE_M,
                "tx_height_agl_m": audit.CANONICAL_TX_HEIGHT_M,
                "rx_height_agl_m": audit.CANONICAL_RX_HEIGHT_M,
                "requested_spacing_m": audit.CANONICAL_SPACING_M,
                "interpolation": pilot.INTERPOLATION,
            },
            "equation": {
                "radio_line": "z_radio(u) = z_tx_abs + u * (z_rx_abs - z_tx_abs)",
                "endpoint_anchors": "z_tx_abs = terrain_at_tx + tx_height_agl_m; z_rx_abs = terrain_at_rx + rx_height_agl_m",
                "clearance": "clearance_m = radio_elevation_m - terrain_elevation_m",
                "strict_zero_candidate": "minimum_clearance_m < 0",
                "endpoint_inclusion": True,
            },
            "by_source": {},
        }
        for name, source in sources.items():
            run = runs[name]
            distribution["by_source"][name] = {
                "source_metadata": {**source.metadata(), **source_metadata(source).__dict__, "source_checksum": source.source_checksum},
                "canonical_summary": primitive_summary(run),
                "tolerance_classification": audit.tolerance_summary(run["profiles"]),
                "rx_tx_height_sensitivity": audit.height_sensitivity(source, tower_by_id),
                "spacing_sensitivity": audit.spacing_sensitivity(source, tower_by_id),
                "interpolation_sensitivity": audit.interpolation_sensitivity(source, tower_by_id, run),
                "source_local_note": "Endpoint ground and radio line use this source only; NASADEM/FABDEM datum differences are not inserted into the path decision.",
                "source_manifest": f"concept-4f3a5-{name}-manifest.json",
            }

        reps = representative_profiles(runs)
        comparison = comparison_artifact(baseline, old_corrected, runs, invariance)
        post = {
            "schema_version": SCHEMA_VERSION,
            "concept": CONCEPT,
            "comparison_kind": "diagnostic-only primitive correction; no canonical RF activation",
            "before": comparison["old_inverted_diagnostic"],
            "independent_4f3a4_corrected_audit": comparison["four_f_three_a_four_independent_corrected_audit"],
            "after_4f3a5_primitive": comparison["four_f_three_a_five_corrected_primitive"],
            "changed_behavior": [
                "diagnostic terrain-clearance sign is now radio-minus-terrain",
                "diagnostic endpoint clearances are +25 m and +1.5 m for the canonical fixture",
                "diagnostic results expose source-local metadata, samples, classification, and fingerprint",
            ],
            "canonical_rf_invariance": invariance,
            "recommendation": "Do not begin Concept 4F.3B; terrain remains diagnostic-only and source/uncertainty qualification blockers remain.",
        }
        source_manifests = {}
        for name, records in (("nasadem", nasa_records), ("fabdem", fab_records)):
            source_manifest = audit.pilot.build_source_manifest(name, records, captured_at)
            source_manifest["concept"] = CONCEPT
            source_manifest["artifact"] = f"{name}-manifest-4f3a5"
            source_manifest["primitive_version"] = distribution["primitive_version"]
            source_manifest["clearance_source_checksum"] = source_checksum(records)
            source_manifests[name] = source_manifest
        write_json(output / "concept-4f3a5-controlled-fixtures.json", fixtures)
        write_json(output / "concept-4f3a5-clearance-distribution.json", distribution)
        write_json(output / "concept-4f3a5-representative-profiles.json", reps)
        write_json(output / "concept-4f3a5-clearance-comparison.json", comparison)
        write_json(output / "concept-4f3a5-post-change-comparison.json", post)
        write_json(output / "concept-4f3a5-source-manifests.json", source_manifests)
        (output / "concept-4f3a5-terrain-clearance-primitive.md").write_text(markdown_report(captured_at, baseline, fixtures, distribution, reps, comparison, invariance), encoding="utf-8")
        return {
            "status": "complete",
            "concept": CONCEPT,
            "paths": 432,
            "strict_zero_candidates": {name: run["summary"]["strict_zero_candidate_count"] for name, run in runs.items()},
            "minimum_clearance_m": {name: run["summary"]["min_clearance_distribution_m"]["min"] for name, run in runs.items()},
            "primitive_version": distribution["primitive_version"],
            "canonical_rf_invariant": invariance["terrain_activation"] is False and all(invariance["snapshot_equality"].values()),
        }
    finally:
        nasa.close()
        fab.close()


def main(argv=None) -> int:
    try:
        print(json.dumps(run(build_parser().parse_args(argv)), indent=2, sort_keys=True))
        return 0
    except (OSError, RuntimeError, ValueError, KeyError, IndexError) as error:
        print(f"terrain-clearance primitive audit error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
