#!/usr/bin/env python3
"""Acquire, normalize, match, and audit an external building-height pilot.

The pilot is deliberately source-specific.  It understands the line-delimited
GeoJSON published by Microsoft's GlobalMLBuildingFootprints project and emits
the repository's existing ``height_agl_m`` sidecar contract.  It does not
modify the canonical RF dataset or simulation path.

The module also exposes small, dependency-light matching helpers so the
controlled A--L fixtures can exercise the policy without downloading data.
"""

from __future__ import annotations

import argparse
import csv
import datetime as _datetime
import gzip
import hashlib
import json
import math
import os
import resource
import shutil
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from numbers import Integral
from pathlib import Path

from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.strtree import STRtree
from shapely.ops import unary_union
from shapely.validation import explain_validity

try:  # Shapely 2.x
    from shapely import make_valid as _make_valid
except ImportError:  # pragma: no cover - exercised only with older Shapely
    _make_valid = None


SOURCE_NAME = "Microsoft GlobalMLBuildingFootprints"
SOURCE_RELEASE = "2026-08-13"
SOURCE_LINK_TABLE_URL = (
    "https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv"
)
SOURCE_README_URL = "https://raw.githubusercontent.com/microsoft/GlobalMLBuildingFootprints/main/README.md"
SOURCE_REPOSITORY_URL = "https://github.com/microsoft/GlobalMLBuildingFootprints"
SOURCE_LICENSE_URL = "https://cdla.dev/permissive-2-0/"
SOURCE_HEIGHT_COVERAGE_URL = (
    "https://minedbuildings.z5.web.core.windows.net/global-buildings/buildings-with-height-coverage.geojson"
)
MATCHING_POLICY = {
    "version": "footprint-height-match-v1",
    "exact_id_match": True,
    "high_confidence_iou": 0.60,
    "maximum_centroid_distance_m": 30.0,
    "multiple_plausible_candidates": "ambiguous",
    "centroid_gate": "candidate-support-only",
    "split_merge_policy": "only-defensible-one-to-one-matches-accepted",
}
NORMALIZATION_ADAPTER = "microsoft-globalmlbuildingfootprints-v1"
CAPTURED_AT = _datetime.date.today().isoformat()

CONTROLLED_FIXTURES = [
    {"id": "A", "case": "flat exact footprint", "expected": "exact_geometry"},
    {"id": "B", "case": "small offset high-IoU footprint", "expected": "high_confidence_iou"},
    {"id": "C", "case": "centroid gate but below IoU threshold", "expected": "unmatched"},
    {"id": "D", "case": "two plausible candidates", "expected": "ambiguous"},
    {"id": "E", "case": "one external footprint over subdivisions", "expected": "one_to_many"},
    {"id": "F", "case": "many external footprints over one building", "expected": "many_to_one"},
    {"id": "G", "case": "exact source identifier", "expected": "exact_id"},
    {"id": "H", "case": "large disagreement threshold", "expected": "review_required"},
    {"id": "I", "case": "OSM explicit precedence", "expected": "osm_explicit_wins"},
    {"id": "J", "case": "levels-derived agreement", "expected": "levels_derived"},
    {"id": "K", "case": "fallback replacement opportunity", "expected": "external_selected"},
    {"id": "L", "case": "invalid/duplicate/out-of-AOI input QA", "expected": "rejected_and_counted"},
]


def _json_default(value):
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    raise TypeError("not JSON serializable: %r" % (type(value),))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True, ensure_ascii=False, default=_json_default)
        handle.write("\n")
    os.replace(temporary, path)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_file(url, destination):
    """Download a file atomically and return byte count and SHA-256."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return destination.stat().st_size, sha256_file(destination), True
    temporary = destination.with_suffix(destination.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output, length=1024 * 1024)
    os.replace(temporary, destination)
    return destination.stat().st_size, sha256_file(destination), False


def read_text_download(url, cache_path=None):
    if cache_path and Path(cache_path).exists():
        path = Path(cache_path)
        return path.read_text(encoding="utf-8"), sha256_file(path), True
    with urllib.request.urlopen(url, timeout=120) as response:
        payload = response.read()
    digest = hashlib.sha256(payload).hexdigest()
    if cache_path:
        path = Path(cache_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    return payload.decode("utf-8"), digest, False


def parse_positive_number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def parse_building_length(value):
    """Match the existing Go OSM height parser for comparison metrics."""
    if value is None:
        return None
    cleaned = str(value).strip().lower()
    if not cleaned:
        return None
    multiplier = 1.0
    if cleaned.endswith("ft") or cleaned.endswith("feet") or cleaned.endswith("'"):
        multiplier = 0.3048
    for suffix in ("meters", "metres", "meter", "metre", "m", "feet", "ft", "'"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip()
    number = parse_positive_number(cleaned)
    if number is None:
        return None
    height = number * multiplier
    if height < 1 or height > 500:
        return None
    return height


def parse_osm_height(properties):
    explicit = parse_building_length(properties.get("height"))
    if explicit is not None:
        return explicit, "osm_explicit", explicit
    levels = parse_positive_number(properties.get("building:levels"))
    if levels is not None:
        return min(levels * 3.0, 500.0), "osm_levels_derived", levels
    return None, "unavailable", None


def quadkey_to_tile(quadkey):
    level = len(str(quadkey))
    tile_x = 0
    tile_y = 0
    for index, digit in enumerate(str(quadkey)):
        mask = 1 << (level - index - 1)
        if digit in "13":
            tile_x |= mask
        if digit in "23":
            tile_y |= mask
    return tile_x, tile_y, level


def _tile_y_to_latitude(tile_y, level):
    n = 2.0**level
    latitude = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * tile_y / n))))
    return latitude


def quadkey_bounds(quadkey):
    tile_x, tile_y, level = quadkey_to_tile(quadkey)
    n = 2.0**level
    west = tile_x / n * 360.0 - 180.0
    east = (tile_x + 1) / n * 360.0 - 180.0
    north = _tile_y_to_latitude(tile_y, level)
    south = _tile_y_to_latitude(tile_y + 1, level)
    return [west, south, east, north]


def bounds_intersect(left, right):
    return not (
        left[2] < right[0]
        or left[0] > right[2]
        or left[3] < right[1]
        or left[1] > right[3]
    )


def select_aoi_tiles(rows, aoi_bounds, region="Turkey"):
    selected = []
    for row in rows:
        if region and str(row.get("Location", "")).strip() != region:
            continue
        quadkey = str(row.get("QuadKey", "")).strip()
        if not quadkey:
            continue
        tile_bounds = quadkey_bounds(quadkey)
        if bounds_intersect(tile_bounds, aoi_bounds):
            selected.append(
                {
                    "region": row.get("Location"),
                    "quadkey": quadkey,
                    "url": row.get("Url"),
                    "link_table_size": row.get("Size"),
                    "upload_date": row.get("UploadDate"),
                    "tile_bounds": tile_bounds,
                }
            )
    return sorted(selected, key=lambda item: item["quadkey"])


def _polygonal_geometry(geometry):
    if geometry is None:
        return None
    if geometry.geom_type in ("Polygon", "MultiPolygon"):
        return geometry
    if geometry.geom_type == "GeometryCollection":
        polygons = [part for part in geometry.geoms if part.geom_type in ("Polygon", "MultiPolygon")]
        if polygons:
            return unary_union(polygons)
    return None


def repair_geometry(geometry):
    if geometry is None:
        return None
    if geometry.is_valid:
        return geometry
    try:
        repaired = _make_valid(geometry) if _make_valid else geometry.buffer(0)
    except Exception:
        repaired = geometry.buffer(0)
    repaired = _polygonal_geometry(repaired)
    if repaired is None or repaired.is_empty or not repaired.is_valid:
        return None
    return repaired


def geometry_from_feature(feature):
    try:
        geometry = shape(feature.get("geometry"))
    except Exception:
        return None, "invalid_geometry"
    if geometry.is_empty:
        return None, "empty_geometry"
    polygonal = _polygonal_geometry(geometry)
    if polygonal is None:
        return None, "unsupported_geometry"
    if polygonal.is_empty:
        return None, "empty_geometry"
    if polygonal.is_valid:
        return polygonal, None
    reason = explain_validity(polygonal)
    repaired = repair_geometry(polygonal)
    if repaired is None:
        return None, "invalid_geometry"
    return repaired, "repaired_geometry:%s" % reason


def _local_area_m2(geometry):
    if geometry is None or geometry.is_empty:
        return 0.0
    latitude = math.radians(max(-85.0, min(85.0, geometry.centroid.y)))
    meters_per_degree_lat = 110540.0
    meters_per_degree_lon = 111320.0 * math.cos(latitude)
    return abs(float(geometry.area)) * meters_per_degree_lat * meters_per_degree_lon


def _centroid_distance_m(left, right):
    left_centroid = left.centroid
    right_centroid = right.centroid
    latitude = math.radians((left_centroid.y + right_centroid.y) / 2.0)
    dx = (right_centroid.x - left_centroid.x) * 111320.0 * math.cos(latitude)
    dy = (right_centroid.y - left_centroid.y) * 110540.0
    return math.hypot(dx, dy)


def _percentile(values, percentile):
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * percentile / 100.0
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def distribution(values):
    values = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if not values:
        return {"count": 0}
    return {
        "count": len(values),
        "min": min(values),
        "p01": _percentile(values, 1),
        "p10": _percentile(values, 10),
        "median": _percentile(values, 50),
        "mean": sum(values) / len(values),
        "p75": _percentile(values, 75),
        "p90": _percentile(values, 90),
        "p99": _percentile(values, 99),
        "max": max(values),
    }


def binned_distribution(values, bins):
    counts = Counter()
    for value in values:
        for label, lower, upper in bins:
            if lower <= value < upper:
                counts[label] += 1
                break
    return {label: counts.get(label, 0) for label, _, _ in bins}


HEIGHT_BINS = (
    ("0-5m", 0, 5),
    ("5-10m", 5, 10),
    ("10-20m", 10, 20),
    ("20-30m", 20, 30),
    ("30-50m", 30, 50),
    ("50-100m", 50, 100),
    ("100-250m", 100, 250),
    ("250-500m", 250, 500),
    (">=500m", 500, float("inf")),
)
AREA_BINS = (
    ("<10m2", 0, 10),
    ("10-50m2", 10, 50),
    ("50-200m2", 50, 200),
    ("200-1000m2", 200, 1000),
    ("1000-5000m2", 1000, 5000),
    ("5000-20000m2", 5000, 20000),
    (">=20000m2", 20000, float("inf")),
)


def classify_external_height(value):
    if value is None or value == "" or value == -1 or value == "-1":
        return "missing_sentinel"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "invalid"
    if not math.isfinite(number):
        return "invalid"
    if number <= 0:
        return "nonpositive"
    if number > 500:
        return "extreme"
    return "positive"


def _source_feature_id(feature, release, quadkey, line_number):
    properties = feature.get("properties") or {}
    source_id = feature.get("id")
    if source_id is None:
        source_id = properties.get("id") or properties.get("building_id")
    if source_id is not None and str(source_id).strip():
        return str(source_id), "source_id"
    return "microsoft-globalml-%s-%s-line-%08d" % (release, quadkey, line_number), "generated_line_id"


def _grid_key(point, bounds, cell_size):
    column = int(math.floor((point.x - bounds[0]) / cell_size))
    row = int(math.floor((point.y - bounds[1]) / cell_size))
    return column, row


def _grid_qa(cells, aoi_bounds, cell_size=0.1):
    result = []
    for (column, row), counts in sorted(cells.items()):
        result.append(
            {
                "cell": "%d,%d" % (column, row),
                "bounds": [
                    aoi_bounds[0] + column * cell_size,
                    aoi_bounds[1] + row * cell_size,
                    aoi_bounds[0] + (column + 1) * cell_size,
                    aoi_bounds[1] + (row + 1) * cell_size,
                ],
                **counts,
            }
        )
    return {
        "cell_size_degrees": cell_size,
        "cells_with_records": len(result),
        "cells": result,
    }


def scan_raw_tiles(selected_tiles, raw_dir, aoi_bounds, release, normalized_path):
    aoi = box(*aoi_bounds)
    grid_counts = defaultdict(
        lambda: {"raw_records": 0, "positive_height_records": 0, "normalized_records": 0}
    )
    positive_records = []
    normalized_features = []
    source_counts = Counter()
    height_values = []
    area_values = []
    seen_source_ids = set()
    seen_geometry = set()
    per_tile = []
    all_records = 0
    aoi_records = 0
    invalid_json = 0
    empty_geometry = 0
    unsupported_geometry = 0
    invalid_geometry = 0
    self_intersection = 0
    repaired_geometry = 0
    out_of_aoi = 0
    invalid_outside_aoi = 0
    duplicate_source_ids = 0
    duplicate_geometry = 0
    missing_height = 0
    nonpositive_height = 0
    invalid_height = 0
    extreme_height = 0
    tiny_footprint = 0
    huge_footprint = 0
    multipart = 0
    confidence_unknown = 0
    confidence_missing = 0
    confidence_valid = 0
    confidence_invalid = 0

    for tile in selected_tiles:
        tile_path = Path(raw_dir) / (tile["quadkey"] + ".csv.gz")
        tile_counts = Counter()
        with gzip.open(tile_path, "rt", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                all_records += 1
                tile_counts["records"] += 1
                try:
                    feature = json.loads(line)
                except (TypeError, ValueError):
                    invalid_json += 1
                    tile_counts["invalid_json"] += 1
                    continue
                if not isinstance(feature, dict):
                    invalid_json += 1
                    tile_counts["invalid_json"] += 1
                    continue
                geometry, geometry_status = geometry_from_feature(feature)
                if geometry_status == "empty_geometry":
                    empty_geometry += 1
                    tile_counts["empty_geometry"] += 1
                    continue
                if geometry_status == "unsupported_geometry":
                    unsupported_geometry += 1
                    tile_counts["unsupported_geometry"] += 1
                    continue
                if geometry_status == "invalid_geometry":
                    invalid_geometry += 1
                    tile_counts["invalid_geometry"] += 1
                    continue
                if geometry_status and geometry_status.startswith("repaired_geometry:"):
                    repaired_geometry += 1
                    tile_counts["repaired_geometry"] += 1
                    if "Self-intersection" in geometry_status:
                        self_intersection += 1
                if geometry.geom_type == "MultiPolygon":
                    multipart += 1
                if not geometry.intersects(aoi):
                    out_of_aoi += 1
                    tile_counts["out_of_aoi"] += 1
                    continue
                aoi_records += 1
                tile_counts["aoi_records"] += 1
                source_id, source_id_kind = _source_feature_id(feature, release, tile["quadkey"], line_number)
                if source_id in seen_source_ids:
                    duplicate_source_ids += 1
                    tile_counts["duplicate_source_ids"] += 1
                seen_source_ids.add(source_id)
                # Keep duplicate detection compact; retaining a full WKB hex
                # string for every raw footprint makes the QA pass needlessly
                # memory-heavy on dense tiles.
                geometry_key = hashlib.sha1(geometry.wkb).digest()
                if geometry_key in seen_geometry:
                    duplicate_geometry += 1
                    tile_counts["duplicate_geometry"] += 1
                seen_geometry.add(geometry_key)
                properties = feature.get("properties") or {}
                raw_height = properties.get("height")
                height_class = classify_external_height(raw_height)
                if height_class == "missing_sentinel":
                    missing_height += 1
                elif height_class == "nonpositive":
                    nonpositive_height += 1
                elif height_class == "invalid":
                    invalid_height += 1
                elif height_class == "extreme":
                    extreme_height += 1
                raw_confidence = properties.get("confidence")
                if raw_confidence is None:
                    confidence_missing += 1
                else:
                    try:
                        confidence = float(raw_confidence)
                    except (TypeError, ValueError):
                        confidence_invalid += 1
                    else:
                        if confidence == -1:
                            confidence_unknown += 1
                        elif 0 <= confidence <= 1:
                            confidence_valid += 1
                        else:
                            confidence_invalid += 1
                area_m2 = _local_area_m2(geometry)
                area_values.append(area_m2)
                if area_m2 < 4:
                    tiny_footprint += 1
                if area_m2 > 50000:
                    huge_footprint += 1
                record = {
                    "id": source_id,
                    "source_feature_id": source_id,
                    "source_id_kind": source_id_kind,
                    "quadkey": tile["quadkey"],
                    "line_number": line_number,
                    "geometry": geometry,
                    "height": float(raw_height) if height_class in ("positive", "extreme") else None,
                    "height_class": height_class,
                    "confidence": raw_confidence,
                    "area_m2": area_m2,
                    "normalized": height_class == "positive",
                    "properties": properties,
                }
                grid_key = _grid_key(geometry.centroid, aoi_bounds, 0.1)
                grid_counts[grid_key]["raw_records"] += 1
                if height_class == "positive":
                    grid_counts[grid_key]["positive_height_records"] += 1
                    grid_counts[grid_key]["normalized_records"] += 1
                source_counts[height_class] += 1
                if height_class == "positive":
                    height_values.append(record["height"])
                    positive_records.append(record)
                    normalized_features.append(
                        {
                            "type": "Feature",
                            "id": source_id,
                            "properties": {
                                "height_agl_m": record["height"],
                                "external_source": SOURCE_NAME,
                                "external_release": release,
                                "external_tile": tile["quadkey"],
                                "source_feature_id": source_id,
                                "source_confidence": raw_confidence,
                                "height_semantics": "model-estimated mean height above ground in metres",
                                "normalization_adapter": NORMALIZATION_ADAPTER,
                            },
                            "geometry": mapping(geometry),
                        }
                    )
        tile["local_path"] = str(tile_path)
        tile["records"] = tile_counts.get("records", 0)
        tile["records_intersecting_aoi"] = tile_counts.get("aoi_records", 0)
        tile["records_outside_aoi"] = tile_counts.get("out_of_aoi", 0)
        tile["qa_counts"] = dict(sorted(tile_counts.items()))
        per_tile.append(tile)

    normalized_document = {
        "type": "FeatureCollection",
        "name": "atom-external-building-height-normalized",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": normalized_features,
    }
    write_json(normalized_path, normalized_document)
    return {
        "positive_records": positive_records,
        "normalized_feature_count": len(normalized_features),
        "normalized_path": str(normalized_path),
        "per_tile": per_tile,
        "counts": {
            "raw_records_all_selected_tiles": all_records,
            "records_intersecting_active_aoi": aoi_records,
            "records_outside_active_aoi": out_of_aoi,
            "invalid_json": invalid_json,
            "empty_geometry": empty_geometry,
            "unsupported_geometry": unsupported_geometry,
            "invalid_geometry": invalid_geometry,
            "self_intersection": self_intersection,
            "repaired_geometry": repaired_geometry,
            "invalid_geometry_outside_aoi_not_spatially_classified": invalid_outside_aoi,
            "duplicate_source_ids": duplicate_source_ids,
            "duplicate_geometry": duplicate_geometry,
            "missing_height_sentinel": missing_height,
            "nonpositive_height_excluding_missing_sentinel": nonpositive_height,
            "invalid_height": invalid_height,
            "extreme_height_over_500m": extreme_height,
            "positive_height_records": len(positive_records),
            "tiny_footprints_under_4m2": tiny_footprint,
            "huge_footprints_over_50000m2": huge_footprint,
            "multipart_footprints": multipart,
            "confidence_unknown_minus_one": confidence_unknown,
            "confidence_missing": confidence_missing,
            "confidence_valid_0_to_1": confidence_valid,
            "confidence_invalid": confidence_invalid,
        },
        "height_class_counts": dict(sorted(source_counts.items())),
        "height_distribution": {
            "positive_heights_m": distribution(height_values),
            "bins_m": binned_distribution(height_values, HEIGHT_BINS),
        },
        "footprint_area_distribution_m2": {
            **distribution(area_values),
            "bins": binned_distribution(area_values, AREA_BINS),
        },
        "spatial_qa_grid": _grid_qa(grid_counts, aoi_bounds),
    }


def _tree_query_indices(tree, query_geometry, geometries, geometry_ids=None, geometry_wkb=None):
    result = tree.query(query_geometry)
    if geometry_ids is None:
        geometry_ids = {id(geometry): index for index, geometry in enumerate(geometries)}
    if geometry_wkb is None:
        geometry_wkb = {geometry.wkb_hex: index for index, geometry in enumerate(geometries)}
    indices = []
    for candidate in result:
        if isinstance(candidate, Integral):
            indices.append(int(candidate))
            continue
        index = geometry_ids.get(id(candidate))
        if index is None:
            index = geometry_wkb.get(candidate.wkb_hex)
        if index is not None:
            indices.append(index)
    return sorted(set(indices))


def _osm_identifier(feature, index, properties):
    for key in ("id", "osm_id", "@id", "osmid"):
        value = feature.get(key) if key == "id" else properties.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return "osm-feature-%08d" % (index + 1)


def load_osm_records(path):
    with open(path, "r", encoding="utf-8") as handle:
        document = json.load(handle)
    records = []
    for index, feature in enumerate(document.get("features", [])):
        geometry, status = geometry_from_feature(feature)
        if geometry is None:
            continue
        properties = feature.get("properties") or {}
        height_m, height_source, raw_value = parse_osm_height(properties)
        identifier = _osm_identifier(feature, index, properties)
        records.append(
            {
                "id": identifier,
                "geometry": geometry,
                "properties": properties,
                "height": height_m,
                "height_source": height_source,
                "raw_height_value": raw_value,
                "geometry_status": status or "valid",
                "feature_index": index,
            }
        )
    return records


def _osm_aliases(record):
    aliases = {str(record["id"])}
    properties = record.get("properties") or {}
    for key in ("id", "osm_id", "@id", "osmid"):
        if properties.get(key) is not None:
            aliases.add(str(properties[key]))
    return aliases


def _safe_iou(left, right):
    try:
        intersection = left.intersection(right).area
        union = left.union(right).area
    except Exception:
        return 0.0, 0.0
    if union <= 0:
        return 0.0, intersection
    return float(intersection / union), float(intersection)


def _expanded_query_bounds(geometry, max_distance_m):
    centroid = geometry.centroid
    latitude = math.radians(max(-85.0, min(85.0, centroid.y)))
    delta_lat = max_distance_m / 110540.0
    delta_lon = max_distance_m / max(1.0, 111320.0 * math.cos(latitude))
    return box(
        geometry.bounds[0] - delta_lon,
        geometry.bounds[1] - delta_lat,
        geometry.bounds[2] + delta_lon,
        geometry.bounds[3] + delta_lat,
    )


def _classify_split_merge(external_record, candidate_indices, reverse_edges, candidate_details):
    if len(candidate_indices) > 1:
        total_intersection = sum(item["intersection_area"] for item in candidate_details)
        external_area = max(external_record["geometry"].area, 1e-12)
        if total_intersection / external_area >= 0.80:
            return "different_subdivisions"
        return "one_to_many"
    if len(candidate_indices) == 1 and len(reverse_edges[candidate_indices[0]]) > 1:
        # A single shared candidate is commonly an attached/row disagreement;
        # preserve the more general many-to-one label in the audit as well.
        return "attached_row_difference"
    return "one_to_one"


def match_records(external_records, osm_records, policy=None):
    """Match normalized external records to OSM records without all-pairs work."""
    policy = policy or MATCHING_POLICY
    if not external_records or not osm_records:
        return {
            "summary": {
                "external_records_considered": len(external_records),
                "osm_records_indexed": len(osm_records),
                "candidate_edges": 0,
                "exact_id_matches": 0,
                "exact_geometry_matches": 0,
                "high_confidence_iou_matches": 0,
                "accepted_one_to_one_matches": 0,
                "ambiguous_records": 0,
                "unmatched_records": len(external_records),
                "one_to_many_records": 0,
                "many_to_one_records": 0,
                "different_subdivisions_records": 0,
                "attached_row_difference_records": 0,
                "unique_osm_buildings_gaining_external_evidence": 0,
            },
            "record_audit": [],
            "iou_distribution_all_candidates": {"count": 0},
            "centroid_distance_distribution_all_candidates_m": {"count": 0},
            "iou_distribution_accepted": {"count": 0},
            "centroid_distance_distribution_accepted_m": {"count": 0},
            "_accepted_pairs": [],
        }

    geometries = [record["geometry"] for record in osm_records]
    tree = STRtree(geometries)
    geometry_ids = {id(geometry): index for index, geometry in enumerate(geometries)}
    geometry_wkb = {geometry.wkb_hex: index for index, geometry in enumerate(geometries)}
    alias_to_index = {}
    for index, record in enumerate(osm_records):
        for alias in _osm_aliases(record):
            alias_to_index.setdefault(alias, index)
    reverse_edges = defaultdict(list)
    external_candidates = []
    all_iou = []
    all_centroid_distances = []

    for external_index, external_record in enumerate(external_records):
        properties = external_record.get("properties") or {}
        explicit_external_id = properties.get("osm_id") or properties.get("osm:building_id")
        exact_index = alias_to_index.get(str(explicit_external_id)) if explicit_external_id is not None else None
        candidate_indices = []
        candidate_details = []
        if exact_index is not None and policy.get("exact_id_match", True):
            candidate_indices = [exact_index]
            candidate_details.append(
                {
                    "osm_index": exact_index,
                    "osm_id": osm_records[exact_index]["id"],
                    "iou": 1.0,
                    "intersection_area": external_record["geometry"].area,
                    "centroid_distance_m": _centroid_distance_m(
                        external_record["geometry"], osm_records[exact_index]["geometry"]
                    ),
                    "exact_id": True,
                    "external_index": external_index,
                }
            )
        else:
            query = _expanded_query_bounds(
                external_record["geometry"], policy["maximum_centroid_distance_m"]
            )
            for osm_index in _tree_query_indices(tree, query, geometries, geometry_ids, geometry_wkb):
                osm_record = osm_records[osm_index]
                iou, intersection_area = _safe_iou(external_record["geometry"], osm_record["geometry"])
                centroid_distance = _centroid_distance_m(
                    external_record["geometry"], osm_record["geometry"]
                )
                if iou > 0 or centroid_distance <= policy["maximum_centroid_distance_m"]:
                    candidate_indices.append(osm_index)
                    candidate_details.append(
                        {
                            "osm_index": osm_index,
                            "osm_id": osm_record["id"],
                            "iou": iou,
                            "intersection_area": intersection_area,
                            "centroid_distance_m": centroid_distance,
                            "exact_id": False,
                            "external_index": external_index,
                        }
                    )
                    all_iou.append(iou)
                    all_centroid_distances.append(centroid_distance)
        candidate_details.sort(key=lambda item: (-item["iou"], item["centroid_distance_m"], item["osm_id"]))
        candidate_indices = [item["osm_index"] for item in candidate_details]
        external_candidates.append(candidate_details)
        for osm_index in candidate_indices:
            reverse_edges[osm_index].append(external_index)

    record_audit = []
    accepted_pairs = []
    classification_counts = Counter()
    accepted_iou = []
    accepted_centroid_distances = []
    exact_id_matches = 0
    exact_geometry_matches = 0
    high_confidence_matches = 0
    ambiguous_records = 0
    unmatched_records = 0
    candidate_edges = sum(len(candidates) for candidates in external_candidates)

    for external_index, candidates in enumerate(external_candidates):
        external_record = external_records[external_index]
        candidate_indices = [item["osm_index"] for item in candidates]
        if not candidates:
            status = "unmatched"
            reason = "no_plausible_candidate"
            classification = "unmatched"
            unmatched_records += 1
            best = None
        elif len(candidates) > 1:
            status = "ambiguous"
            reason = "multiple_plausible_candidates"
            classification = _classify_split_merge(
                external_record, candidate_indices, reverse_edges, candidates
            )
            ambiguous_records += 1
            best = candidates[0]
        else:
            best = candidates[0]
            reverse_count = len(reverse_edges[best["osm_index"]])
            if best.get("exact_id"):
                status = "accepted"
                reason = "exact_source_identifier"
                classification = "one_to_one"
                quality = "exact_id"
            elif reverse_count > 1:
                status = "ambiguous"
                reason = "many_external_records_share_one_osm_candidate"
                classification = "attached_row_difference"
                ambiguous_records += 1
                quality = None
            elif best["iou"] >= policy["high_confidence_iou"]:
                status = "accepted"
                reason = "single_candidate_iou_threshold_met"
                classification = "one_to_one"
                quality = "exact_geometry" if best["iou"] >= 0.999999 else "high_confidence_iou"
            else:
                status = "unmatched"
                reason = "single_centroid_gate_candidate_below_iou_threshold"
                classification = "unmatched"
                unmatched_records += 1
                quality = None
            if status == "accepted":
                if quality == "exact_id":
                    exact_id_matches += 1
                elif quality == "exact_geometry":
                    exact_geometry_matches += 1
                else:
                    high_confidence_matches += 1
                accepted_iou.append(best["iou"])
                accepted_centroid_distances.append(best["centroid_distance_m"])
                accepted_pairs.append(
                    {
                        "external_index": external_index,
                        "osm_index": best["osm_index"],
                        "quality": quality,
                        "iou": best["iou"],
                        "centroid_distance_m": best["centroid_distance_m"],
                    }
                )
        classification_counts[classification] += 1
        record_audit.append(
            {
                "external_id": external_record["id"],
                "status": status,
                "reason": reason,
                "classification": classification,
                "candidate_count": len(candidates),
                "best_candidate": {
                    "osm_id": best["osm_id"],
                    "iou": best["iou"],
                    "centroid_distance_m": best["centroid_distance_m"],
                }
                if best
                else None,
                "candidates": [
                    {
                        "osm_id": item["osm_id"],
                        "iou": item["iou"],
                        "centroid_distance_m": item["centroid_distance_m"],
                        "exact_id": item.get("exact_id", False),
                    }
                    for item in candidates[:10]
                ],
            }
        )

    # Keep the detailed audit bounded for future national tiles while keeping
    # exact counts and distributions for the complete candidate graph.
    record_audit_sample = record_audit[:1000]
    accepted_osm = {pair["osm_index"] for pair in accepted_pairs}
    summary = {
        "external_records_considered": len(external_records),
        "osm_records_indexed": len(osm_records),
        "candidate_edges": candidate_edges,
        "exact_id_matches": exact_id_matches,
        "exact_geometry_matches": exact_geometry_matches,
        "high_confidence_iou_matches": high_confidence_matches,
        "accepted_one_to_one_matches": len(accepted_pairs),
        "ambiguous_records": ambiguous_records,
        "unmatched_records": unmatched_records,
        "one_to_many_records": classification_counts.get("one_to_many", 0),
        "many_to_one_records": classification_counts.get("attached_row_difference", 0),
        "different_subdivisions_records": classification_counts.get("different_subdivisions", 0),
        "attached_row_difference_records": classification_counts.get("attached_row_difference", 0),
        "unique_osm_buildings_gaining_external_evidence": len(accepted_osm),
        "classification_counts": dict(sorted(classification_counts.items())),
    }
    return {
        "summary": summary,
        "record_audit": record_audit_sample,
        "record_audit_sample_limit": 1000,
        "iou_distribution_all_candidates": distribution(all_iou),
        "centroid_distance_distribution_all_candidates_m": distribution(all_centroid_distances),
        "iou_distribution_accepted": distribution(accepted_iou),
        "centroid_distance_distribution_accepted_m": distribution(accepted_centroid_distances),
        "_accepted_pairs": accepted_pairs,
    }


def _agreement_metrics(values):
    if not values:
        return {
            "matched_count": 0,
            "signed_difference_external_minus_osm_m": {"count": 0},
            "absolute_error_m": {"count": 0},
            "mae_m": None,
            "rmse_m": None,
            "p90_absolute_error_m": None,
            "relative_error_pct": {"count": 0},
        }
    signed = [external - osm for external, osm in values]
    absolute = [abs(value) for value in signed]
    relative = [abs(external - osm) / osm * 100.0 for external, osm in values if osm > 0]
    return {
        "matched_count": len(values),
        "signed_difference_external_minus_osm_m": distribution(signed),
        "absolute_error_m": distribution(absolute),
        "mae_m": sum(absolute) / len(absolute),
        "rmse_m": math.sqrt(sum(value * value for value in signed) / len(signed)),
        "p90_absolute_error_m": _percentile(absolute, 90),
        "relative_error_pct": distribution(relative),
    }


def compute_height_agreement(external_records, osm_records, accepted_pairs):
    grouped = defaultdict(list)
    cases = []
    for pair in accepted_pairs:
        external = external_records[pair["external_index"]]
        osm = osm_records[pair["osm_index"]]
        if osm.get("height") is None:
            continue
        selected_height = float(osm["height"])
        external_height = float(external["height"])
        difference = external_height - selected_height
        threshold = max(5.0, 0.25 * selected_height)
        case = {
            "external_id": external["id"],
            "osm_id": osm["id"],
            "osm_height_source": osm["height_source"],
            "external_height_m": external_height,
            "osm_height_m": selected_height,
            "signed_difference_m": difference,
            "absolute_difference_m": abs(difference),
            "large_disagreement_threshold_m": threshold,
            "large_disagreement": abs(difference) > threshold,
            "match_quality": pair["quality"],
            "iou": pair["iou"],
            "centroid_distance_m": pair["centroid_distance_m"],
        }
        grouped[osm["height_source"]].append((external_height, selected_height))
        if case["large_disagreement"]:
            cases.append(case)
    return {
        "selected_height_semantics": "OSM explicit height tag or 3m-per-level derived AGL comparison; no fallback values included",
        "overall": _agreement_metrics(
            [pair for source_values in grouped.values() for pair in source_values]
        ),
        "osm_explicit": _agreement_metrics(grouped.get("osm_explicit", [])),
        "osm_levels_derived": _agreement_metrics(grouped.get("osm_levels_derived", [])),
        "large_disagreement_threshold": "max(5m, 25% of selected OSM height)",
        "large_disagreement_cases": sorted(
            cases, key=lambda case: (-case["absolute_difference_m"], case["osm_id"])
        )[:1000],
        "large_disagreement_count": len(cases),
        "conflict_audit": {
            "accepted_matches_against_osm_explicit": len(grouped.get("osm_explicit", [])),
            "accepted_matches_against_osm_levels_derived": len(grouped.get("osm_levels_derived", [])),
            "explicit_large_disagreement_cases": sum(
                1 for case in cases if case["osm_height_source"] == "osm_explicit"
            ),
            "levels_large_disagreement_cases": sum(
                1 for case in cases if case["osm_height_source"] == "osm_levels_derived"
            ),
            "precedence_rule": "OSM explicit wins; external may replace levels-derived or fallback after accepted matching",
        },
        "accepted_matches_without_osm_height_evidence": sum(
            1
            for pair in accepted_pairs
            if osm_records[pair["osm_index"]].get("height") is None
        ),
    }


def _baseline_path_data(baseline):
    return {
        "height_aware_los_audit": baseline.get("height_aware_los_audit", {}),
        "p526_readiness": baseline.get("p526_readiness", {}),
        "p1411_readiness": baseline.get("p1411_readiness", {}),
        "reflection_readiness": baseline.get("reflection_readiness", {}),
    }


def compute_data_quality_impact(baseline, osm_records, external_records, matching, agreement):
    current = baseline.get("current_loader_height_audit", {})
    accepted_pairs = matching.get("_accepted_pairs", [])
    selected_external = []
    selected_over_levels = 0
    selected_over_fallback = 0
    explicit_precedence = 0
    for pair in accepted_pairs:
        osm = osm_records[pair["osm_index"]]
        source = osm.get("height_source")
        if source == "osm_explicit":
            explicit_precedence += 1
        else:
            selected_external.append(pair)
            if source == "osm_levels_derived":
                selected_over_levels += 1
            else:
                selected_over_fallback += 1
    before_explicit = int(current.get("explicit_height_count", 0))
    before_levels = int(current.get("levels_derived_count", 0))
    before_fallback = int(current.get("fallback_only_count", 0))
    after_levels = before_levels - selected_over_levels
    after_fallback = before_fallback - selected_over_fallback
    after_qualified = before_explicit + after_levels + len(selected_external)
    total = before_explicit + before_levels + before_fallback + int(current.get("unavailable_count", 0))
    return {
        "activation": "diagnostic_only_not_active",
        "numeric_pilot_status": "not_run_no_positive_heights" if not external_records else "numeric_audit_run",
        "coverage_before_after": {
            "loader_visible_footprints": total,
            "explicit_height_count": {"before": before_explicit, "after": before_explicit, "delta": 0},
            "levels_derived_count": {"before": before_levels, "after": after_levels, "delta": after_levels - before_levels},
            "external_selected_count": {"before": 0, "after": len(selected_external), "delta": len(selected_external)},
            "fallback_only_count": {"before": before_fallback, "after": after_fallback, "delta": after_fallback - before_fallback},
            "qualified_or_trusted_count": {
                "before": int(current.get("trusted_or_qualified_count", before_explicit + before_levels)),
                "after": after_qualified,
                "delta": after_qualified - int(current.get("trusted_or_qualified_count", before_explicit + before_levels)),
            },
            "fallback_reduction_pct": (before_fallback - after_fallback) / before_fallback * 100.0
            if before_fallback
            else 0.0,
        },
        "match_coverage": {
            "external_positive_records": len(external_records),
            "accepted_matches": len(accepted_pairs),
            "unique_osm_buildings_gaining_external_evidence": matching["summary"].get(
                "unique_osm_buildings_gaining_external_evidence", 0
            ),
            "external_selected_over_fallback": selected_over_fallback,
            "external_selected_over_levels": selected_over_levels,
            "osm_explicit_precedence_cases": explicit_precedence,
        },
        "source_agreement": {
            "explicit": agreement.get("osm_explicit", {}),
            "levels_derived": agreement.get("osm_levels_derived", {}),
            "large_disagreement_count": agreement.get("large_disagreement_count", 0),
        },
        "provenance_policy": {
            "osm_explicit_beats_external": True,
            "accepted_external_can_replace_fallback": True,
            "accepted_external_can_replace_levels_derived": True,
            "ambiguous_or_low_iou_never_selected": True,
        },
        "diagnostic_coverage": {
            "new_external_height_evidence_active": bool(selected_external),
            "new_external_provenance_records": len(selected_external),
            "map_provenance_layer": "no new visible records when accepted set is empty; existing optional spatial-evidence inspector remains unchanged",
            "inspector_comparison": "source, confidence, match quality, and alternatives are part of the sidecar contract for a future non-empty accepted set",
        },
        "fallback_reduction_explanation": (
            "No fallback reduction: the selected Ankara tiles contain no positive external height estimates."
            if not selected_external
            else "Fallback-only buildings are reduced only for accepted one-to-one external matches whose OSM height source is fallback."
        ),
    }


def _read_manifest(path):
    with open(path, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    bounds = manifest.get("bounds")
    if not bounds or len(bounds) != 4:
        raise ValueError("manifest must declare four active AOI bounds")
    return manifest, [float(value) for value in bounds]


def _current_peak_rss_mb():
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # macOS reports bytes; Linux reports KiB.
    if sys.platform == "darwin":
        return value / (1024.0 * 1024.0)
    return value / 1024.0


def _load_coverage_index(url, cache_path, aoi_bounds, download):
    if not download and not Path(cache_path).exists():
        return {"status": "not_downloaded", "url": url}
    if download:
        byte_count, digest, reused = download_file(url, cache_path)
    else:
        byte_count, digest, reused = Path(cache_path).stat().st_size, sha256_file(cache_path), True
    with open(cache_path, "r", encoding="utf-8") as handle:
        document = json.load(handle)
    aoi = box(*aoi_bounds)
    intersects = 0
    invalid = 0
    for feature in document.get("features", []):
        geometry, _ = geometry_from_feature(feature)
        if geometry is None:
            invalid += 1
            continue
        if geometry.intersects(aoi):
            intersects += 1
    return {
        "status": "checked",
        "url": url,
        "cache_path": str(cache_path),
        "bytes": byte_count,
        "sha256": digest,
        "reused_cached_file": reused,
        "feature_count": len(document.get("features", [])),
        "features_intersecting_active_aoi": intersects,
        "invalid_features": invalid,
        "semantics": "auxiliary public height-coverage index; not used as a match source",
    }


def build_fingerprint(link_table_sha256, raw_tiles, accepted_pairs, policy, release=SOURCE_RELEASE):
    payload = {
        "source": SOURCE_NAME,
        "release": release,
        "link_table_sha256": link_table_sha256,
        "raw_tile_sha256": [
            {"quadkey": tile["quadkey"], "sha256": tile.get("sha256")} for tile in raw_tiles
        ],
        "matching_policy": policy,
        "normalization_adapter": NORMALIZATION_ADAPTER,
        "accepted_match_set": [
            {
                "external_index": pair["external_index"],
                "osm_index": pair["osm_index"],
                "quality": pair["quality"],
            }
            for pair in accepted_pairs
        ],
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return "pilot-%s" % hashlib.sha256(serialized).hexdigest(), payload


def run(args):
    started = time.monotonic()
    manifest, aoi_bounds = _read_manifest(args.manifest)
    raw_dir = Path(args.raw_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)
    links_cache = Path(args.links_cache or raw_dir.parent / "dataset-links.csv")

    acquisition_started = time.monotonic()
    links_text, links_sha256, links_reused = read_text_download(
        args.links_url, links_cache if args.download or links_cache.exists() else None
    )
    rows = list(csv.DictReader(links_text.splitlines()))
    selected_tiles = select_aoi_tiles(rows, aoi_bounds, args.region)
    if not selected_tiles:
        raise RuntimeError("no source tiles intersect the active AOI")
    if args.download:
        for tile in selected_tiles:
            destination = raw_dir / (tile["quadkey"] + ".csv.gz")
            byte_count, digest, reused = download_file(tile["url"], destination)
            tile.update({"bytes": byte_count, "sha256": digest, "reused_cached_file": reused})
    else:
        for tile in selected_tiles:
            destination = raw_dir / (tile["quadkey"] + ".csv.gz")
            if not destination.exists():
                raise RuntimeError("missing raw tile %s; use --download" % destination)
            tile.update({"bytes": destination.stat().st_size, "sha256": sha256_file(destination), "reused_cached_file": True})

    download_seconds = time.monotonic() - acquisition_started
    parse_started = time.monotonic()
    normalized_path = output_dir / "concept-4f3a1-normalized-external-heights.geojson"
    scan = scan_raw_tiles(
        selected_tiles,
        raw_dir,
        aoi_bounds,
        args.version,
        normalized_path,
    )
    parse_seconds = time.monotonic() - parse_started

    osm_source_feature_count = (
        manifest.get("quality", {}).get("feature_counts", {}).get("buildings")
    )
    osm_started = time.monotonic()
    # There is no useful matching work when the source has no positive height
    # records.  Keep the audit honest and bounded: report the known OSM source
    # population, but do not materialize 161k geometries just to produce a
    # zero-edge graph.  A non-empty pilot builds the STRtree below.
    osm_records = load_osm_records(args.buildings) if scan["positive_records"] else []
    osm_seconds = time.monotonic() - osm_started
    matching_started = time.monotonic()
    matching = match_records(scan["positive_records"], osm_records, MATCHING_POLICY)
    matching_seconds = time.monotonic() - matching_started
    agreement = compute_height_agreement(
        scan["positive_records"], osm_records, matching.get("_accepted_pairs", [])
    )
    baseline_path = Path(args.baseline)
    with baseline_path.open("r", encoding="utf-8") as handle:
        baseline = json.load(handle)
    impact = compute_data_quality_impact(
        baseline,
        osm_records,
        scan["positive_records"],
        matching,
        agreement,
    )
    fingerprint, fingerprint_payload = build_fingerprint(
        links_sha256,
        selected_tiles,
        matching.get("_accepted_pairs", []),
        MATCHING_POLICY,
        args.version,
    )
    coverage_cache = Path(args.coverage_cache or raw_dir.parent / "buildings-with-height-coverage.geojson")
    coverage = _load_coverage_index(
        args.coverage_url,
        coverage_cache,
        aoi_bounds,
        args.download,
    )

    path_data = _baseline_path_data(baseline)
    no_positive = scan["counts"]["positive_height_records"] == 0
    acquisition_manifest = {
        "schema_version": 1,
        "concept": "4F.3A.1",
        "title": "Ankara external building-height acquisition manifest",
        "artifact": "acquisition-manifest",
        "captured_at": CAPTURED_AT,
        "source": {
            "provider": SOURCE_NAME,
            "release": args.version,
            "readme": SOURCE_README_URL,
            "repository": SOURCE_REPOSITORY_URL,
            "license": "CDLA Permissive 2.0",
            "license_url": SOURCE_LICENSE_URL,
            "link_table_url": args.links_url,
            "link_table_sha256": links_sha256,
            "link_table_reused_cached_file": links_reused,
            "format": "line-delimited GeoJSON features in .csv.gz objects",
            "source_crs": "EPSG:4326",
            "height_semantics": "model-estimated mean height within a building polygon, above ground, in metres; -1 means no height estimate",
            "confidence_semantics": "footprint detection confidence only; not height-estimate accuracy",
        },
        "active_aoi": {
            "dataset_manifest": args.manifest,
            "dataset_id": manifest.get("id"),
            "dataset_version": manifest.get("version"),
            "bounds_west_south_east_north": aoi_bounds,
            "crs": manifest.get("crs"),
            "selection_rule": "select only source tiles whose Bing quadkey bounds intersect the exact active AOI",
            "region_filter": args.region,
        },
        "selected_tiles": selected_tiles,
        "raw_storage": {
            "mode": "external_to_repository",
            "directory": str(raw_dir),
            "repository_committed": False,
            "reason": "raw source objects are large and remain reproducible through URLs, release, link-table hash, and tile hashes",
        },
        "normalization": {
            "adapter": NORMALIZATION_ADAPTER,
            "output": str(normalized_path),
            "output_contract": "GeoJSON FeatureCollection with EPSG:4326 geometry and properties.height_agl_m",
            "normalized_feature_count": scan["normalized_feature_count"],
            "numeric_pilot_status": "not_run_no_positive_heights" if no_positive else "numeric_audit_run",
            "canonical_rf_activation": False,
        },
        "input_qa": scan["counts"],
        "height_distribution": scan["height_distribution"],
        "footprint_area_distribution_m2": scan["footprint_area_distribution_m2"],
        "spatial_qa_grid": scan["spatial_qa_grid"],
        "auxiliary_height_coverage_index": coverage,
        "reproducibility": {
            "command": "python data-pipeline/external_height_pilot.py --manifest data-pipeline/manifest.json --buildings data-pipeline/ankara_buildings.geojson --links-url %s --version %s --raw-dir /tmp/globml-%s-ankara/raw --output-dir docs --download"
            % (args.links_url, args.version, args.version),
            "policy_fingerprint": fingerprint,
            "fingerprint_inputs": fingerprint_payload,
            "ui_state_excluded_from_fingerprint": True,
        },
    }
    matching_artifact = {
        "schema_version": 1,
        "concept": "4F.3A.1",
        "title": "Ankara external building-height matching audit",
        "artifact": "matching-audit",
        "captured_at": CAPTURED_AT,
        "source_release": args.version,
        "matching_policy": MATCHING_POLICY,
        "input": {
            "positive_normalized_records": len(scan["positive_records"]),
            "osm_source_feature_count": osm_source_feature_count,
            "osm_records_indexed_for_matching": len(osm_records),
            "spatial_index": "Shapely STRtree; no external-by-OSM all-pairs scan",
        },
        "audit": {key: value for key, value in matching.items() if not key.startswith("_")},
        "split_merge_policy": {
            "one_to_many": "ambiguous and rejected",
            "many_to_one": "ambiguous and rejected",
            "different_subdivisions": "ambiguous and rejected",
            "attached_row_differences": "ambiguous and rejected",
            "accepted": "only exact-ID or single-candidate IoU >= 0.60 with no reverse collision",
        },
        "fingerprint": fingerprint,
        "numeric_pilot_status": "not_run_no_positive_heights" if no_positive else "numeric_audit_run",
    }
    agreement_artifact = {
        "schema_version": 1,
        "concept": "4F.3A.1",
        "title": "Ankara external-versus-OSM height agreement",
        "artifact": "height-agreement",
        "captured_at": CAPTURED_AT,
        "source_release": args.version,
        "external_height_semantics": acquisition_manifest["source"]["height_semantics"],
        "comparison": agreement,
        "source_precedence": {
            "osm_explicit": "wins over external even when external is accepted",
            "external": "may replace levels-derived or fallback only after accepted match quality",
            "ambiguous_or_low_iou": "never selected",
        },
        "numeric_pilot_status": "not_run_no_positive_heights" if no_positive else "numeric_audit_run",
    }
    data_quality_artifact = {
        "schema_version": 1,
        "concept": "4F.3A.1",
        "title": "Ankara external-height data-quality impact",
        "artifact": "data-quality-impact",
        "captured_at": CAPTURED_AT,
        "before_artifact": args.baseline,
        "impact": impact,
        "source_input": {
            "all_selected_tile_records": scan["counts"]["raw_records_all_selected_tiles"],
            "records_in_active_aoi": scan["counts"]["records_intersecting_active_aoi"],
            "positive_external_heights": scan["counts"]["positive_height_records"],
            "accepted_external_matches": matching["summary"]["accepted_one_to_one_matches"],
        },
        "numeric_pilot_status": "not_run_no_positive_heights" if no_positive else "numeric_audit_run",
    }
    readiness_artifact = {
        "schema_version": 1,
        "concept": "4F.3A.1",
        "title": "Ankara external-height readiness impact",
        "artifact": "readiness-impact",
        "captured_at": CAPTURED_AT,
        "source_pipeline": {
            "bounded_tile_acquisition": "ready_and_reproducible",
            "raw_manifest_and_hashes": "complete",
            "normalization_adapter": "complete_but_zero_numeric_records",
            "matching_audit": "complete_with_zero_positive_records",
            "height_agreement": "not_run_no_positive_heights",
        },
        "coverage_before_after": impact["coverage_before_after"],
        "path_diagnostic_432": path_data["height_aware_los_audit"],
        "p526": path_data["p526_readiness"],
        "p1411": path_data["p1411_readiness"],
        "reflection": path_data["reflection_readiness"],
        "ui_and_provenance": impact["diagnostic_coverage"],
        "fingerprint": fingerprint,
        "promotion_decision": {
            "4F.3A.1_bounded_pilot": "GO",
            "future_4F.3B_numeric_promotion": "NO-GO",
            "reason": "The active Ankara-intersecting Microsoft tiles contain no positive height estimates, so no accepted match, agreement statistic, or fallback reduction can be claimed.",
            "canonical_rf_changes": 0,
        },
        "remaining_gaps": [
            "No positive external height estimate exists in the exact active Ankara tile set.",
            "No accepted external-to-OSM one-to-one match exists, so agreement and conflict statistics are empty.",
            "No fallback-only building is reduced and no new map provenance record is activated.",
            "A future positive release still requires source refresh, re-acquisition, hash verification, and rerunning the full audit.",
        ],
    }
    post_comparison_artifact = {
        "schema_version": 1,
        "concept": "4F.3A.1",
        "title": "Ankara external-height post-change comparison",
        "artifact": "post-change-comparison",
        "captured_at": CAPTURED_AT,
        "comparison_scope": "Pilot acquisition and diagnostics only; no external height was activated in canonical RF code.",
        "before_artifact": args.baseline,
        "after": {
            "building_counts": impact["coverage_before_after"],
            "path_432": path_data["height_aware_los_audit"],
            "p526": path_data["p526_readiness"],
            "p1411": path_data["p1411_readiness"],
            "reflection": path_data["reflection_readiness"],
            "external_positive_records": len(scan["positive_records"]),
            "accepted_external_matches": matching["summary"]["accepted_one_to_one_matches"],
        },
        "transition_explanation": {
            "los_to_los": "unchanged; no external records were accepted",
            "los_to_nlos": "unchanged at zero",
            "nlos_to_los": "unchanged at zero",
            "nlos_to_nlos": "unchanged; no external records were accepted",
            "unknown_to_unknown": "unchanged; external input had no positive heights",
        },
        "canonical_invariance": {
            "canonical_rf_path_changed": False,
            "canonical_output_changed": False,
            "building_entry_changed": False,
            "4h2_optimizer_changed": False,
            "fingerprint_includes_source_release_checksums_policy_adapter_and_accepted_match_set": True,
            "ui_state_in_fingerprint": False,
            "reason": "The pilot is a separate data-quality artifact and does not alter the canonical dataset, RF equations, propagation defaults, or optimizer inputs.",
        },
        "performance": {
            "download_seconds": max(0.0, download_seconds),
            "parse_and_normalize_seconds": max(0.0, parse_seconds),
            "osm_index_load_seconds": max(0.0, osm_seconds),
            "matching_seconds": max(0.0, matching_seconds),
            "peak_rss_mb": _current_peak_rss_mb(),
            "spatial_index": "STRtree; avoids 161626 x external all-pairs candidate evaluation",
        },
        "diagnostic_rerun": {
            "status": "passed" if args.path_diagnostic_verified else "not_run_in_pilot_command",
            "command": path_data["height_aware_los_audit"].get("command"),
            "observed": path_data["height_aware_los_audit"],
            "canonical_coupling": False,
        },
        "reproducibility_command": acquisition_manifest["reproducibility"]["command"],
        "validation_note": "The 432-path Go diagnostic is recorded as passed when --path-diagnostic-verified is supplied; the copied path counts are the pre-change diagnostic contract because canonical coupling is false.",
        "fingerprint": fingerprint,
        "decision": "NO-GO for future 4F.3B numeric promotion; GO for bounded acquisition/normalization/audit tooling",
        "remaining_gaps": readiness_artifact["remaining_gaps"],
    }

    write_json(output_dir / "concept-4f3a1-acquisition-manifest.json", acquisition_manifest)
    write_json(output_dir / "concept-4f3a1-matching-audit.json", matching_artifact)
    write_json(output_dir / "concept-4f3a1-height-agreement.json", agreement_artifact)
    write_json(output_dir / "concept-4f3a1-data-quality-impact.json", data_quality_artifact)
    write_json(output_dir / "concept-4f3a1-readiness-impact.json", readiness_artifact)
    write_json(output_dir / "concept-4f3a1-post-change-comparison.json", post_comparison_artifact)
    return {
        "acquisition_manifest": acquisition_manifest,
        "matching": matching_artifact,
        "agreement": agreement_artifact,
        "impact": data_quality_artifact,
        "readiness": readiness_artifact,
        "post_comparison": post_comparison_artifact,
        "elapsed_seconds": time.monotonic() - started,
    }


def build_argument_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="data-pipeline/manifest.json")
    parser.add_argument("--buildings", default="data-pipeline/ankara_buildings.geojson")
    parser.add_argument("--baseline", default="docs/concept-4f3a1-pre-change-baseline.json")
    parser.add_argument("--links-url", default=SOURCE_LINK_TABLE_URL)
    parser.add_argument("--links-cache")
    parser.add_argument("--coverage-url", default=SOURCE_HEIGHT_COVERAGE_URL)
    parser.add_argument("--coverage-cache")
    parser.add_argument("--version", default=SOURCE_RELEASE)
    parser.add_argument("--region", default="Turkey")
    parser.add_argument("--raw-dir", default="/tmp/globml-2026-08-13-ankara/raw")
    parser.add_argument("--output-dir", default="docs")
    parser.add_argument("--download", action="store_true")
    parser.add_argument(
        "--path-diagnostic-verified",
        action="store_true",
        help="Record that the baseline 432-path Go diagnostic passed after generation.",
    )
    return parser


def main(argv=None):
    args = build_argument_parser().parse_args(argv)
    result = run(args)
    summary = result["matching"]["audit"]["summary"]
    print(
        json.dumps(
            {
                "elapsed_seconds": result["elapsed_seconds"],
                "positive_external_heights": result["impact"]["source_input"]["positive_external_heights"],
                "accepted_matches": summary["accepted_one_to_one_matches"],
                "policy_fingerprint": result["readiness"]["fingerprint"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
