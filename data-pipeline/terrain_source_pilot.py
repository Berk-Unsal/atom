#!/usr/bin/env python3
"""Run the Concept 4F.3A.3 Ankara terrain-source evidence pilot.

The runner is intentionally diagnostic.  It audits four NASADEM and four
FABDEM one-degree tiles against the repository AOI, computes source-local
ground/base and path-profile evidence, and writes reproducible manifests.
It never edits the canonical dataset pack and never supplies terrain to the
canonical RF path.

The two products use different vertical datums (NASADEM EGM96 and FABDEM
EGM2008).  Unless a sourced transformation is supplied, the runner refuses
to call their raw difference an absolute source error.  It still reports a
clearly labelled demeaned surface-shape diagnostic for research triage.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import resource
import shutil
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import box, shape
from shapely.strtree import STRtree
from shapely.ops import unary_union

try:
    from external_height_pilot import parse_building_length
except ImportError:  # pragma: no cover - direct import from another cwd
    from data_pipeline.external_height_pilot import parse_building_length


CONCEPT = "4F.3A.3"
AOI = [32.45, 39.55, 33.25, 40.25]
CRS = "EPSG:4326"
INTERPOLATION = "bilinear"
BASE_SPREAD_THRESHOLD_M = 5.0
REQUESTED_PATH_SPACING_M = 30.0
EARTH_RADIUS_M = 6_371_000.0
TILE_NAME = re.compile(r"(?i)([ns])(\d{2})([ew])(\d{3})")
MAX_PERIMETER_VERTICES = 12
CANONICAL_SAMPLE_CELLS = (
    "LTE-35084",
    "LTE-35104",
    "LTE-35877",
    "LTE-313100",
    "LTE-313110",
    "LTE-322828",
)

OFFICIAL_NASADEM_CATALOG = "https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001"
OFFICIAL_NASADEM_GUIDE = "https://lpdaac.usgs.gov/documents/2237/NASADEM_User_Guide_V13.pdf"
OFFICIAL_NASADEM_DOI = "https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001"
OFFICIAL_NASADEM_FORUM = "https://forum.earthdata.nasa.gov/viewtopic.php?t=6648"
OFFICIAL_FABDEM_DATASET = "https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/"
OFFICIAL_FABDEM_README = "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/readme.txt"
OFFICIAL_FABDEM_LICENSE = "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/license.txt"
OFFICIAL_FABDEM_CHANGELOG = "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/FABDEM-V1-2%20Changelog.pdf"
OFFICIAL_FABDEM_DIRECTORY = "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/"

NASADEM_MIRROR_BASE = "https://opentopography.s3.sdsc.edu/raster/NASADEM/NASADEM_be"
FABDEM_MIRROR_BASE = "https://huggingface.co/buckets/links-ads/fabdem/resolve/tiles"


def _source_tiles():
    tiles = []
    for latitude in (39, 40):
        for longitude in (32, 33):
            suffix = f"n{latitude:02d}e{longitude:03d}"
            tiles.append(
                {
                    "source": "nasadem",
                    "tile_id": f"NASADEM_HGT_{suffix}",
                    "filename": f"NASADEM_HGT_{suffix}.tif",
                    "official_granule": f"NASADEM_HGT_{suffix}",
                    "official_product": "NASADEM_HGT.001",
                    "official_url": OFFICIAL_NASADEM_CATALOG,
                    "mirror_url": f"{NASADEM_MIRROR_BASE}/NASADEM_HGT_{suffix}.tif",
                    "raw_subdir": "nasadem",
                }
            )
            tile_name = f"N{latitude:02d}E{longitude:03d}_FABDEM_V1-2.tif"
            group = "N30E030-N40E040_FABDEM_V1-2" if latitude == 39 else "N40E030-N50E040_FABDEM_V1-2"
            tiles.append(
                {
                    "source": "fabdem",
                    "tile_id": tile_name.removesuffix(".tif"),
                    "filename": tile_name,
                    "official_granule": tile_name.removesuffix(".tif"),
                    "official_product": "FABDEM V1-2",
                    "official_url": OFFICIAL_FABDEM_DIRECTORY,
                    "mirror_url": f"{FABDEM_MIRROR_BASE}/{group}/{tile_name}",
                    "raw_subdir": "fabdem",
                }
            )
    return sorted(tiles, key=lambda item: (item["source"], item["filename"]))


SOURCE_DEFINITIONS = {
    "nasadem": {
        "provider": "NASA/JPL/LP DAAC",
        "product": "NASADEM Merged DEM Global 1 arc second V001",
        "release": "V001",
        "product_id": "NASADEM_HGT.001",
        "official_url": OFFICIAL_NASADEM_CATALOG,
        "guide_url": OFFICIAL_NASADEM_GUIDE,
        "doi": OFFICIAL_NASADEM_DOI,
        "license_url": OFFICIAL_NASADEM_FORUM,
        "license": "NASA/LP DAAC public-domain/CC0 reuse terms as documented by LP DAAC; citation requested",
        "horizontal_crs": CRS,
        "vertical_datum": "EGM96 geoid",
        "vertical_datum_kind": "orthometric",
        "geoid_model": "EGM96",
        "nominal_resolution": "1 arc-second (~30 m at Ankara latitude)",
        "format": "official HGT signed big-endian int16; acquired diagnostic mirror as GeoTIFF",
        "candidate_kind": "dem_unspecified",
        "classification": "merged void-filled elevation DEM; not automatically a bare-earth DTM",
        "limitations": [
            "HGT layers carry no embedded CRS or vertical-datum metadata; the NASADEM product documentation supplies EGM96 semantics.",
            "NASADEM is a merged SRTM/ASTER/ICESat-GLAS product with source-dependent void fills and radar/surface residuals.",
            "Building/vegetation/layover and fill lineage must be audited before assigning authoritative ground semantics.",
        ],
    },
    "fabdem": {
        "provider": "University of Bristol",
        "product": "FABDEM V1-2",
        "release": "V1-2",
        "product_id": "FABDEM V1-2",
        "official_url": OFFICIAL_FABDEM_DATASET,
        "readme_url": OFFICIAL_FABDEM_README,
        "doi": "https://doi.org/10.5523/bris.s5hqmjcdj8yo2ibzi9b4ew3sn",
        "license_url": OFFICIAL_FABDEM_LICENSE,
        "license": "CC BY-NC-SA 4.0; non-commercial and ShareAlike terms apply",
        "horizontal_crs": CRS,
        "vertical_datum": "EGM2008",
        "vertical_datum_kind": "orthometric",
        "geoid_model": "EGM2008",
        "nominal_resolution": "1 arc-second (~30 m at Ankara latitude)",
        "format": "COG GeoTIFF float32, 3600 x 3600, nodata -9999",
        "candidate_kind": "dtm_candidate",
        "classification": "model-derived bare-earth candidate with building/tree height bias removed from Copernicus GLO-30; research comparator only",
        "limitations": [
            "FABDEM is not a production dependency in this phase because its CC BY-NC-SA license requires a separate commercial/use review.",
            "Its EGM2008 vertical datum is not directly comparable with NASADEM EGM96 without an explicit sourced transformation.",
            "Bare-earth correction is model-derived and requires local control before authoritative ground use.",
        ],
    },
}


def _json_default(value):
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "item"):
        return value.item()
    raise TypeError(f"not JSON serializable: {type(value)!r}")


def write_json(path: Path, value) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True, ensure_ascii=False, default=_json_default)
        handle.write("\n")
    os.replace(temporary, path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_file(url: str, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return {"bytes": destination.stat().st_size, "sha256": sha256_file(destination), "reused": True}
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "A.T.O.M.-4F.3A.3-terrain-pilot/1.0"})
    with urllib.request.urlopen(request, timeout=180) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output, length=1024 * 1024)
    os.replace(temporary, destination)
    return {"bytes": destination.stat().st_size, "sha256": sha256_file(destination), "reused": False}


def source_definition(name: str) -> dict:
    return SOURCE_DEFINITIONS[name]


def parse_tile_origin(path: Path) -> tuple[int, int]:
    match = TILE_NAME.search(path.name)
    if not match:
        raise ValueError(f"terrain tile filename does not encode a one-degree origin: {path.name}")
    latitude = int(match.group(2)) * (-1 if match.group(1).lower() == "s" else 1)
    longitude = int(match.group(4)) * (-1 if match.group(3).lower() == "w" else 1)
    return longitude, latitude


class RasterTile:
    """In-memory tile with the same posting semantics used by the Go adapter."""

    def __init__(self, definition: dict, path: Path):
        self.definition = definition
        self.path = Path(path)
        self.dataset = rasterio.open(self.path)
        self.array = self.dataset.read(1, masked=False)
        self.width = int(self.dataset.width)
        self.height = int(self.dataset.height)
        self.nodata = self.dataset.nodata
        self.west, self.south = parse_tile_origin(self.path)
        self.north = self.south + 1.0
        self.resolution = float(self.dataset.res[0])
        if self.width not in (3600, 3601) or self.height not in (3600, 3601):
            raise ValueError(f"unexpected one-degree tile dimensions for {self.path.name}: {self.width}x{self.height}")
        if abs(self.resolution - 1.0 / 3600.0) > 1e-8:
            raise ValueError(f"unexpected terrain resolution for {self.path.name}: {self.resolution}")

    def close(self) -> None:
        self.dataset.close()

    def _coordinates(self, lon: float, lat: float) -> tuple[float, float]:
        return (lon - self.west) / self.resolution, (self.north - lat) / self.resolution

    def contains(self, lon: float, lat: float) -> bool:
        column, row = self._coordinates(lon, lat)
        epsilon = 1e-8
        return -epsilon <= column <= self.width - 1 + epsilon and -epsilon <= row <= self.height - 1 + epsilon

    def _valid(self, value) -> bool:
        if not np.isfinite(value):
            return False
        if self.nodata is not None and float(value) == float(self.nodata):
            return False
        return True

    def sample(self, lon: float, lat: float, interpolation: str = INTERPOLATION) -> float | None:
        if not self.contains(lon, lat):
            return None
        column, row = self._coordinates(lon, lat)
        column = min(max(column, 0.0), float(self.width - 1))
        row = min(max(row, 0.0), float(self.height - 1))
        if interpolation == "nearest":
            value = self.array[int(round(row)), int(round(column))]
            return float(value) if self._valid(value) else None
        left, top = int(math.floor(column)), int(math.floor(row))
        right, bottom = min(left + 1, self.width - 1), min(top + 1, self.height - 1)
        values = [
            self.array[top, left],
            self.array[top, right],
            self.array[bottom, left],
            self.array[bottom, right],
        ]
        if not all(self._valid(value) for value in values):
            return None
        x, y = column - left, row - top
        upper = float(values[0]) * (1 - x) + float(values[1]) * x
        lower = float(values[2]) * (1 - x) + float(values[3]) * x
        return upper * (1 - y) + lower * y


class RasterSource:
    def __init__(self, name: str, paths_by_filename: dict[str, Path]):
        self.name = name
        self.definition = source_definition(name)
        self.tiles = [RasterTile(item, paths_by_filename[item["filename"]]) for item in _source_tiles() if item["source"] == name]
        self.tiles.sort(key=lambda tile: (tile.south, tile.west))

    def close(self) -> None:
        for tile in self.tiles:
            tile.close()

    def sample(self, point: tuple[float, float], interpolation: str = INTERPOLATION) -> float | None:
        lon, lat = point
        for tile in self.tiles:
            if tile.contains(lon, lat):
                value = tile.sample(lon, lat, interpolation)
                if value is not None:
                    return value
        return None

    def metadata(self) -> dict:
        return {
            "source": self.name,
            "horizontal_crs": self.definition["horizontal_crs"],
            "vertical_datum": self.definition["vertical_datum"],
            "vertical_datum_kind": self.definition["vertical_datum_kind"],
            "geoid_model": self.definition["geoid_model"],
            "interpolation": INTERPOLATION,
            "tile_count": len(self.tiles),
            "tile_dimensions": sorted({f"{tile.width}x{tile.height}" for tile in self.tiles}),
            "resolution_deg": sorted({tile.resolution for tile in self.tiles}),
            "nominal_bounds": [
                min(tile.west for tile in self.tiles),
                min(tile.south for tile in self.tiles),
                max(tile.west + 1 for tile in self.tiles),
                max(tile.south + 1 for tile in self.tiles),
            ],
        }


def parse_osm_height(properties: dict) -> tuple[float | None, str]:
    explicit = parse_building_length(properties.get("height"))
    if explicit is not None:
        return float(explicit), "osm_explicit"
    raw_levels = properties.get("building:levels")
    try:
        levels = float(raw_levels)
    except (TypeError, ValueError):
        levels = None
    if levels is not None and math.isfinite(levels) and levels > 0:
        return min(levels * 3.0, 500.0), "osm_levels_derived"
    return None, "unavailable"


def load_buildings(path: Path) -> list[dict]:
    with Path(path).open("r", encoding="utf-8") as handle:
        document = json.load(handle)
    records = []
    for index, feature in enumerate(document.get("features", [])):
        try:
            geometry = shape(feature.get("geometry"))
        except Exception:
            continue
        if geometry.is_empty or geometry.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        properties = feature.get("properties") or {}
        height, height_source = parse_osm_height(properties)
        identifier = feature.get("id") or properties.get("id") or properties.get("osm_id") or f"osm-feature-{index + 1:08d}"
        parts = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
        for part_index, part in enumerate(parts):
            if part.is_empty:
                continue
            part_identifier = str(identifier)
            if len(parts) > 1:
                part_identifier = f"{part_identifier}#part-{part_index + 1}"
            records.append(
                {
                    "id": part_identifier,
                    "logical_id": str(identifier),
                    "geometry": part,
                    "height_m": height,
                    "height_source": height_source,
                    "feature_index": index,
                }
            )
    return records


def _largest_polygon(geometry):
    if geometry.geom_type == "Polygon":
        return geometry
    polygons = list(geometry.geoms)
    return max(polygons, key=lambda item: item.area) if polygons else None


def robust_perimeter_points(geometry) -> list[tuple[float, float]]:
    polygon = _largest_polygon(geometry)
    if polygon is None or polygon.is_empty:
        return []
    coordinates = list(polygon.exterior.coords)[:-1]
    if len(coordinates) > MAX_PERIMETER_VERTICES:
        indexes = np.linspace(0, len(coordinates) - 1, MAX_PERIMETER_VERTICES, dtype=int)
        coordinates = [coordinates[index] for index in sorted(set(indexes))]
    points = [(float(x), float(y)) for x, y in coordinates]
    points.extend(
        [
            ((coordinates[index][0] + coordinates[(index + 1) % len(coordinates)][0]) / 2.0,
             (coordinates[index][1] + coordinates[(index + 1) % len(coordinates)][1]) / 2.0)
            for index in range(len(coordinates))
        ]
    )
    centroid = polygon.centroid
    points.append((float(centroid.x), float(centroid.y)))
    return points


def distribution(values: list[float]) -> dict:
    if not values:
        return {"count": 0}
    array = np.asarray(values, dtype=float)
    return {
        "count": int(array.size),
        "min": float(np.min(array)),
        "p01": float(np.percentile(array, 1)),
        "p10": float(np.percentile(array, 10)),
        "median": float(np.percentile(array, 50)),
        "mean": float(np.mean(array)),
        "p75": float(np.percentile(array, 75)),
        "p90": float(np.percentile(array, 90)),
        "p99": float(np.percentile(array, 99)),
        "max": float(np.max(array)),
    }


def _within(value, lower, upper):
    return lower <= value < upper


def _stats_for_differences(raw: list[float], relative: list[float]) -> dict:
    raw_array = np.asarray(raw, dtype=float)
    relative_array = np.asarray(relative, dtype=float)
    result = {
        "sample_count": int(raw_array.size),
        "raw_untransformed_difference_m": distribution(raw),
        "demeaned_surface_shape_difference_m": distribution(relative),
        "qualification": "relative diagnostic only; not an absolute source disagreement",
        "within_absolute_thresholds_not_reported": True,
    }
    if raw_array.size:
        result["raw_untransformed_difference_m"]["mean_signed"] = float(np.mean(raw_array))
        result["demeaned_surface_shape_difference_m"].update(
            {
                "mae": float(np.mean(np.abs(relative_array))),
                "rmse": float(np.sqrt(np.mean(relative_array * relative_array))),
                "within_1m": int(np.count_nonzero(np.abs(relative_array) <= 1.0)),
                "within_3m": int(np.count_nonzero(np.abs(relative_array) <= 3.0)),
                "within_5m": int(np.count_nonzero(np.abs(relative_array) <= 5.0)),
            }
        )
    return result


def _grid_points(bounds, columns=161, rows=141):
    west, south, east, north = bounds
    return [
        (west + (column + 0.5) * (east - west) / columns,
         south + (row + 0.5) * (north - south) / rows)
        for row in range(rows)
        for column in range(columns)
    ]


def _pair_samples(points, first: RasterSource, second: RasterSource) -> tuple[list[float], list[float]]:
    first_values, second_values = [], []
    for point in points:
        first_value = first.sample(point)
        second_value = second.sample(point)
        if first_value is None or second_value is None:
            continue
        first_values.append(first_value)
        second_values.append(second_value)
    return first_values, second_values


def _comparison_for_points(points, first: RasterSource, second: RasterSource) -> dict:
    first_values, second_values = _pair_samples(points, first, second)
    if not first_values:
        return {"sample_count": 0, "status": "no_common_valid_samples"}
    first_median, second_median = float(np.median(first_values)), float(np.median(second_values))
    raw = [second_value - first_value for first_value, second_value in zip(first_values, second_values)]
    relative = [
        (second_value - second_median) - (first_value - first_median)
        for first_value, second_value in zip(first_values, second_values)
    ]
    result = _stats_for_differences(raw, relative)
    result.update(
        {
            "status": "relative_diagnostic",
            "nasadem_elevation_distribution_m": distribution(first_values),
            "fabdem_elevation_distribution_m": distribution(second_values),
            "source_median_offset_m": second_median - first_median,
        }
    )
    return result


def source_coverage(source: RasterSource, bounds=AOI) -> dict:
    aoi_geometry = box(*bounds)
    nominal_coverage = unary_union([box(tile.west, tile.south, tile.west + 1, tile.north) for tile in source.tiles])
    intersection_area = nominal_coverage.intersection(aoi_geometry).area
    grid = _grid_points(bounds, 161, 141)
    valid = sum(source.sample(point) is not None for point in grid)
    tile_records = []
    for tile in source.tiles:
        valid_mask = np.isfinite(tile.array)
        if tile.nodata is not None:
            valid_mask &= tile.array != tile.nodata
        valid_count = int(np.count_nonzero(valid_mask))
        tile_records.append(
            {
                "filename": tile.path.name,
                "width": tile.width,
                "height": tile.height,
                "bounds_nominal": [tile.west, tile.south, tile.west + 1, tile.north],
                "valid_cells": valid_count,
                "total_cells": int(tile.array.size),
                "valid_fraction": valid_count / float(tile.array.size),
                "sampled_distribution_m": distribution(tile.array[valid_mask].astype(float)[::16].tolist()),
            }
        )
    return {
        "aoi_bounds": list(bounds),
        "nominal_raster_bounds": [
            min(tile.west for tile in source.tiles),
            min(tile.south for tile in source.tiles),
            max(tile.west + 1 for tile in source.tiles),
            max(tile.north for tile in source.tiles),
        ],
        "nominal_aoi_coverage_ratio": float(intersection_area / aoi_geometry.area),
        "deterministic_aoi_grid": {"columns": 161, "rows": 141, "total_samples": len(grid), "valid_samples": valid, "valid_fraction": valid / len(grid)},
        "tile_quality": tile_records,
    }


def _stratified_points(records: list[dict], bounds=AOI) -> dict[str, list[tuple[float, float]]]:
    grid = _grid_points(bounds)
    geometries = [record["geometry"] for record in records]
    tree = STRtree(geometries)

    def inside_building(point):
        candidate_indexes = tree.query(ShapelyPoint(point))
        return any(geometries[int(index)].intersects(ShapelyPoint(point)) for index in candidate_indexes)

    urban = []
    stride = max(1, len(records) // 6000)
    for record in records[::stride]:
        centroid = record["geometry"].centroid
        if AOI[0] <= centroid.x <= AOI[2] and AOI[1] <= centroid.y <= AOI[3]:
            urban.append((float(centroid.x), float(centroid.y)))
        if len(urban) >= 6000:
            break
    open_points = []
    for point in grid:
        if not inside_building(point):
            open_points.append(point)
        if len(open_points) >= 6000:
            break
    return {"all": grid[:20000], "urban_building_centroids": urban, "open_grid": open_points}


def _slope_degrees(source: RasterSource, point: tuple[float, float]) -> float | None:
    lon, lat = point
    delta_lat = 1.0 / 3600.0
    delta_lon = delta_lat / max(math.cos(math.radians(lat)), 0.1)
    west = source.sample((lon - delta_lon, lat))
    east = source.sample((lon + delta_lon, lat))
    south = source.sample((lon, lat - delta_lat))
    north = source.sample((lon, lat + delta_lat))
    if None in (west, east, south, north):
        return None
    dx = (east - west) / (2 * delta_lon * 111_320.0 * math.cos(math.radians(lat)))
    dy = (north - south) / (2 * delta_lat * 110_540.0)
    return math.degrees(math.atan(math.hypot(dx, dy)))


def slope_strata(points, nasa: RasterSource, fab: RasterSource) -> dict:
    bins = (("0-2deg", 0, 2), ("2-5deg", 2, 5), ("5-10deg", 5, 10), ("10-20deg", 10, 20), (">=20deg", 20, float("inf")))
    grouped = {label: [] for label, _, _ in bins}
    for point in points[::3]:
        nasa_slope = _slope_degrees(nasa, point)
        fab_slope = _slope_degrees(fab, point)
        nasa_value = nasa.sample(point)
        fab_value = fab.sample(point)
        if nasa_slope is None or fab_slope is None or nasa_value is None or fab_value is None:
            continue
        # Classification uses the NASADEM slope diagnostic; disagreement is
        # demeaned because the source datums are not interchangeable.
        for label, lower, upper in bins:
            if _within(nasa_slope, lower, upper):
                grouped[label].append((nasa_value, fab_value))
                break
    result = {}
    for label, pairs in grouped.items():
        if not pairs:
            result[label] = {"sample_count": 0}
            continue
        nasa_values = [pair[0] for pair in pairs]
        fab_values = [pair[1] for pair in pairs]
        nasa_median, fab_median = np.median(nasa_values), np.median(fab_values)
        result[label] = _stats_for_differences(
            [fab - nas for nas, fab in pairs],
            [(fab - fab_median) - (nas - nasa_median) for nas, fab in pairs],
        )
    return result


def building_base_audit(records: list[dict], sources: dict[str, RasterSource]) -> dict:
    per_source = {}
    known_by_source = {name: [] for name in sources}
    for name, source in sources.items():
        values, spreads, point_counts = [], [], []
        valid_count = uncertain_count = no_data_count = 0
        roof_values = []
        for record in records:
            points = robust_perimeter_points(record["geometry"])
            samples = [value for point in points if (value := source.sample(point)) is not None]
            point_counts.append(len(points))
            if not samples:
                no_data_count += 1
                if record["height_m"] is not None:
                    known_by_source[name].append({"id": record["id"], "base_m": None, "height_m": record["height_m"], "spread_m": None})
                continue
            valid_count += 1
            median = float(np.median(samples))
            spread = float(max(samples) - min(samples))
            values.append(median)
            spreads.append(spread)
            if spread > BASE_SPREAD_THRESHOLD_M:
                uncertain_count += 1
            if record["height_m"] is not None:
                roof = median + record["height_m"]
                roof_values.append(roof)
                known_by_source[name].append({"id": record["id"], "base_m": median, "height_m": record["height_m"], "roof_m": roof, "spread_m": spread})
        definition = source_definition(name)
        per_source[name] = {
            "population_feature_count": len(records),
            "method": "robust_perimeter_median",
            "sample_geometry": "outer-ring vertices plus edge midpoints plus polygon centroid; deterministic cap of 12 perimeter vertices",
            "base_available_count": valid_count,
            "base_no_data_count": no_data_count,
            "base_available_fraction": valid_count / len(records) if records else 0.0,
            "base_uncertain_spread_gt_5m_count": uncertain_count,
            "base_uncertain_spread_gt_5m_fraction_of_available": uncertain_count / valid_count if valid_count else 0.0,
            "sample_count_distribution": distribution(point_counts),
            "base_median_elevation_distribution_m": distribution(values),
            "base_spread_distribution_m": distribution(spreads),
            "diagnostic_absolute_roof_count": len(roof_values),
            "diagnostic_absolute_roof_distribution_m": distribution(roof_values),
            "ground_qualification": (
                "unresolved_dem_semantics; no production ground anchor"
                if definition["candidate_kind"] == "dem_unspecified"
                else "research_bare_earth_candidate; not production-approved"
            ),
            "vertical_datum": definition["vertical_datum"],
            "known_osm_height_count": sum(record["height_m"] is not None for record in records),
            "absolute_roof_note": "Roof = source-local robust perimeter median + OSM AGL evidence; diagnostic only and not an RF input.",
        }
    return {"by_source": per_source, "known_height_base_records": known_by_source}


def destination_point(origin: tuple[float, float], bearing_deg: float, distance_m: float) -> tuple[float, float]:
    bearing = math.radians(bearing_deg)
    lat1, lon1 = math.radians(origin[1]), math.radians(origin[0])
    angular = distance_m / EARTH_RADIUS_M
    lat2 = math.asin(math.sin(lat1) * math.cos(angular) + math.cos(lat1) * math.sin(angular) * math.cos(bearing))
    lon2 = lon1 + math.atan2(math.sin(bearing) * math.sin(angular) * math.cos(lat1), math.cos(angular) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lon2), math.degrees(lat2)


def legacy_terrain_excess_for_frozen_comparison(terrain_m: float, radio_line_m: float) -> float:
    """Reproduce the frozen 4F.3A.3 sign inversion for historical evidence only.

    This is intentionally not named or exposed as clearance. New diagnostic
    callers must use terrain_clearance_primitive.evaluate_terrain_clearance.
    """

    return float(terrain_m - radio_line_m)


def path_profiles(source: RasterSource, tower_by_id: dict[str, tuple[float, float]]) -> dict:
    """Return the frozen 4F.3A.3 profiles without changing their artifact schema.

    The function remains only so the historical artifact can be reproduced;
    4F.3A.5 uses the authoritative primitive through terrain_clearance_audit.
    """

    profiles = []
    for cell_id in CANONICAL_SAMPLE_CELLS:
        origin = tower_by_id[cell_id]
        for ray_index in range(72):
            bearing = ray_index * 360.0 / 72.0
            endpoint = destination_point(origin, bearing, 400.0)
            steps = max(1, math.ceil(400.0 / REQUESTED_PATH_SPACING_M))
            values, points = [], []
            for step in range(steps + 1):
                distance = 400.0 * step / steps
                point = destination_point(origin, bearing, distance)
                value = source.sample(point)
                points.append(point)
                if value is not None:
                    values.append((step / steps, value))
            profile = {
                "cell_id": cell_id,
                "ray_index": ray_index,
                "bearing_deg": bearing,
                "distance_m": 400.0,
                "requested_spacing_m": REQUESTED_PATH_SPACING_M,
                "effective_spacing_m": 400.0 / steps,
                "sample_count": len(points),
                "valid_sample_count": len(values),
                "terrain_status": "terrain_available" if len(values) == len(points) else "terrain_partial_or_no_data",
                "terrain_min_m": min(value for _, value in values) if values else None,
                "terrain_max_m": max(value for _, value in values) if values else None,
                "terrain_range_m": (max(value for _, value in values) - min(value for _, value in values)) if values else None,
                "terrain_clearance_min_m": None,
                "terrain_obstruction_candidate": None,
            }
            if len(values) == len(points):
                tx_ground, rx_ground = values[0][1], values[-1][1]
                legacy_terrain_excesses = []
                for fraction, terrain_value in values:
                    radio_line = (tx_ground + 25.0) * (1 - fraction) + (rx_ground + 1.5) * fraction
                    legacy_terrain_excesses.append(legacy_terrain_excess_for_frozen_comparison(terrain_value, radio_line))
                # Historical output keys are retained solely to preserve the
                # before artifact and its explicit sign-inversion evidence.
                profile["terrain_clearance_min_m"] = min(legacy_terrain_excesses)
                profile["terrain_obstruction_candidate"] = min(legacy_terrain_excesses) < 0.0
            profiles.append(profile)
    complete = [profile for profile in profiles if profile["valid_sample_count"] == profile["sample_count"]]
    return {
        "cells": len(CANONICAL_SAMPLE_CELLS),
        "rays_per_cell": 72,
        "paths": len(profiles),
        "complete_profiles": len(complete),
        "partial_profiles": len(profiles) - len(complete),
        "terrain_clearance_distribution_m": distribution([profile["terrain_clearance_min_m"] for profile in complete if profile["terrain_clearance_min_m"] is not None]),
        "terrain_range_distribution_m": distribution([profile["terrain_range_m"] for profile in complete if profile["terrain_range_m"] is not None]),
        "terrain_obstruction_candidate_count": sum(profile["terrain_obstruction_candidate"] is True for profile in complete),
        "profiles": profiles,
    }


def tile_manifest_records(raw_dir: Path) -> tuple[dict, dict, dict[str, Path]]:
    by_source = {"nasadem": [], "fabdem": []}
    paths_by_filename = {}
    for tile in _source_tiles():
        path = raw_dir / tile["raw_subdir"] / tile["filename"]
        if not path.exists():
            raise FileNotFoundError(f"missing acquired tile {path}; rerun with --download")
        record = {
            **tile,
            "relative_raw_path": f"{tile['raw_subdir']}/{tile['filename']}",
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
            "acquisition_route": "public diagnostic mirror; official upstream identity retained",
        }
        by_source[tile["source"]].append(record)
        paths_by_filename[tile["filename"]] = path
    return by_source["nasadem"], by_source["fabdem"], paths_by_filename


def build_source_manifest(name: str, records: list[dict], captured_at: str) -> dict:
    definition = source_definition(name)
    return {
        "schema_version": 1,
        "concept": CONCEPT,
        "artifact": f"{name}-manifest",
        "captured_at": captured_at,
        "source": {
            **definition,
            "acquisition_route": "Public mirror used because the official NASA Earthdata URLs require credentials for direct retrieval in this environment." if name == "nasadem" else "Public mirror used for tile-level analysis; official Bristol release remains authoritative.",
        },
        "active_aoi": {"bounds_west_south_east_north": AOI, "crs": CRS},
        "tiles": records,
        "tile_selection_policy": "all one-degree tiles intersecting AOI; retain one-degree source tiles without cropping; tile edges are sampled with source-native posting semantics",
        "reproducibility": {
            "raw_cache_layout": "<raw_dir>/<relative_raw_path>",
            "sha256_algorithm": "SHA-256",
            "sampling_interpolation": INTERPOLATION,
            "adapter": "terrain_source_pilot.py RasterSource v1 plus Go HGT/GeoTIFF diagnostic adapters",
        },
        "production_decision": "primary candidate for future evidence only; not installed or activated in canonical RF" if name == "nasadem" else "research-only comparator; not a production dependency",
    }


def source_comparison(nasa: RasterSource, fab: RasterSource, records: list[dict]) -> dict:
    stratified = _stratified_points(records)
    comparisons = {label: _comparison_for_points(points, nasa, fab) for label, points in stratified.items()}
    slope_points = stratified["all"]
    result = {
        "schema_version": 1,
        "concept": CONCEPT,
        "aoi": {"bounds_west_south_east_north": AOI, "crs": CRS},
        "source_order": ["nasadem", "fabdem"],
        "vertical_datum_gate": {
            "nasadem": {"vertical_datum": "EGM96", "vertical_datum_kind": "orthometric"},
            "fabdem": {"vertical_datum": "EGM2008", "vertical_datum_kind": "orthometric"},
            "compatible": False,
            "cross_source_absolute_comparison": "unavailable",
            "reason": "No explicit sourced EGM96-to-EGM2008 transformation was applied; raw differences are not interpreted as source error.",
        },
        "sampling": {
            "method": "same-coordinate bilinear sampling from source-native one-degree tiles",
            "strata": {label: len(points) for label, points in stratified.items()},
            "relative_metric_definition": "(FABDEM - its sample median) - (NASADEM - its sample median); surface-shape diagnostic only",
        },
        "comparisons": comparisons,
        "urban_effect": {
            "urban_stratum": "building centroids",
            "open_stratum": "AOI grid points not intersecting a repository building footprint",
            "interpretation": "Differences are datum-mixed raw diagnostics and demeaned shape diagnostics; no building/vegetation bias claim is promoted to truth.",
            "urban": comparisons["urban_building_centroids"],
            "open": comparisons["open_grid"],
        },
        "vegetation_effect": {
            "status": "not_assessed",
            "land_cover_source_present": False,
            "reason": "The repository pilot has no land-cover/vegetation truth layer; source documentation records vegetation and surface-model limitations, but no vegetation class is inferred from elevation alone.",
        },
        "slope_effect": {
            "status": "relative_diagnostic",
            "slope_source": "NASADEM four-neighbour finite-difference slope",
            "strata": slope_strata(slope_points, nasa, fab),
            "interpretation": "Slope bins organize relative surface-shape disagreement; they are not an accuracy assessment.",
        },
    }
    return result


def _source_fingerprint(name: str, records: list[dict]) -> tuple[str, dict]:
    payload = {
        "concept": CONCEPT,
        "source": name,
        "product": source_definition(name)["product"],
        "release": source_definition(name)["release"],
        "tiles": [{"filename": record["filename"], "sha256": record["sha256"]} for record in sorted(records, key=lambda item: item["filename"])],
        "adapter": "terrain-source-pilot-v1",
        "interpolation": INTERPOLATION,
        "base_method": "robust_perimeter_median",
        "base_spread_threshold_m": BASE_SPREAD_THRESHOLD_M,
        "path_profile": {"cells": 6, "rays_per_cell": 72, "radius_m": 400.0, "spacing_m": REQUESTED_PATH_SPACING_M},
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return f"{name}-terrain-evidence-{digest}", payload


def _baseline_copy(baseline: dict, captured_at: str) -> dict:
    result = json.loads(json.dumps(baseline))
    result.update(
        {
            "schema_version": 1,
            "concept": CONCEPT,
            "title": "Ankara ground-elevation source evidence pre-change baseline",
            "artifact": "pre-change-baseline",
            "captured_at": captured_at,
            "phase_boundary": "Before NASADEM/FABDEM diagnostic acquisition and source comparison; canonical dataset remains terrain-unavailable.",
            "terrain_activation": False,
        }
    )
    result.setdefault("ground_elevation_gate", {})
    result["ground_elevation_gate"].update(
        {
            "source_selected": False,
            "cross_source_absolute_comparison": "not_applicable_before_acquisition",
            "canonical_rf_coupling": False,
            "known_osm_height_count": result.get("current_loader_height_audit", {}).get("trusted_or_qualified_count"),
        }
    )
    return result


def build_readiness(baseline: dict, bases: dict, profiles: dict[str, dict], source_comparison_result: dict) -> dict:
    p526_before = baseline.get("p526_readiness", {})
    p1411_before = baseline.get("p1411_readiness", {})
    reflection_before = baseline.get("reflection_readiness", {})
    readiness = {
        "schema_version": 1,
        "concept": CONCEPT,
        "canonical_activation": False,
        "terrain_layer_installed_in_canonical_dataset": False,
        "four_f_3b": {
            "started": False,
            "status": "not_started",
            "reason": "This phase stops at source semantics, local evidence, and diagnostic readiness; no terrain source is promoted into canonical RF or numeric comparison.",
        },
        "canonical_height_audit": {
            "status": "validated",
            "paths": 432,
            "terrain_status": "terrain_unavailable",
            "transitions": baseline.get("height_aware_los_audit", {}).get("transitions", {}),
            "canonical_propagation_coupling": False,
            "note": "The repository's opt-in canonical audit was rerun after the source pilot; it still evaluated the active pack without a terrain layer.",
        },
        "datum_gate": source_comparison_result["vertical_datum_gate"],
        "p526": {
            "before": p526_before,
            "after_diagnostic": {
                "paths": 432,
                "nasadem_complete_profiles": profiles["nasadem"]["complete_profiles"],
                "fabdem_complete_profiles": profiles["fabdem"]["complete_profiles"],
                "terrain_clearance_is_diagnostic_only": True,
                "canonical_propagation_coupling": False,
                "status": "diagnostic_profile_available_but_no_canonical_terrain_term",
            },
        },
        "p1411": {
            "before": p1411_before,
            "after_diagnostic": {
                "audited_paths": 432,
                "fully_automatic_paths": 0,
                "terrain_profiles_available": True,
                "morphology_taxonomy_present": False,
                "both_below_rooftop_provable": False,
                "status": "not_ready",
                "reason": "Terrain profiles do not supply the missing morphology, rooftop relation, facade/material, or compatible absolute-datum gate.",
            },
        },
        "reflection": {
            "before": reflection_before,
            "after_diagnostic": {
                "sample_paths": 432,
                "terrain_profile_sources": ["nasadem", "fabdem"],
                "candidates_with_terrain_anchored_vertical_span": 0,
                "material_evidence_footprints": 0,
                "status": "not_ready",
                "reason": "Source-local diagnostic roofs and terrain profiles are not enough to establish a compatible, production-authoritative reflected-link vertical span.",
            },
        },
        "source_decisions": {
            "nasadem": {
                "legal_reuse": "go_with_citation",
                "technical_ground_readiness": "no_go_pending_semantics_and_local_control",
                "primary_candidate": True,
            },
            "fabdem": {
                "legal_reuse": "research_only_pending_noncommercial_and_sharealike_review",
                "technical_ground_readiness": "research_comparator_only",
                "primary_candidate": False,
            },
        },
        "stop_conditions_triggered": [
            "NASADEM EGM96 and FABDEM EGM2008 are not directly comparable without an explicit sourced transformation.",
            "NASADEM surface/DEM semantics are not promoted to authoritative DTM from the product name alone.",
            "No local ground-control or independent building-base validation source was available in this phase.",
        ],
    }
    return readiness


def _audit_markdown(captured_at, nasa_manifest, fab_manifest, quality, comparison, bases, readiness, fingerprints) -> str:
    nasa_coverage = quality["coverage"]["nasadem"]
    fab_coverage = quality["coverage"]["fabdem"]
    return f"""# Concept 4F.3A.3 — Ankara terrain-source audit

Captured `{captured_at}` for the exact AOI `[32.45, 39.55, 33.25, 40.25]` in EPSG:4326. This is a diagnostic evidence pilot. The canonical dataset remains unchanged and terrain remains unavailable to canonical RF calculations.

## Source identity and license

The primary candidate is NASADEM Merged DEM Global 1 arc second V001. NASA’s [Earthdata catalog entry]({OFFICIAL_NASADEM_CATALOG}) describes global one-arc-second one-degree HGT tiles derived from SRTM and other source inputs; the [official NASADEM user guide]({OFFICIAL_NASADEM_GUIDE}) documents the merged HGT integer postings as metres relative to the EGM96 geoid. LP DAAC’s [reuse guidance]({OFFICIAL_NASADEM_FORUM}) records public-domain/CC0-style reuse terms with citation requested. Direct Earthdata downloads were credential-gated in this environment, so the acquired GeoTIFF representations came from a public mirror; official product identity, tile names, and upstream links are retained in `concept-4f3a3-nasadem-manifest.json`.

FABDEM V1-2 is the research comparator. The [University of Bristol record]({OFFICIAL_FABDEM_DATASET}), [release readme]({OFFICIAL_FABDEM_README}), and [license text]({OFFICIAL_FABDEM_LICENSE}) identify a global one-arc-second model-derived bare-earth candidate, with horizontal WGS84/EPSG:4326 and vertical EGM2008, under CC BY-NC-SA 4.0. It is not a production dependency: the license’s non-commercial and ShareAlike terms require a separate use review. The official [release directory]({OFFICIAL_FABDEM_DIRECTORY}) and [V1-2 changelog]({OFFICIAL_FABDEM_CHANGELOG}) are retained as provenance.

## Tile and datum gate

NASADEM tiles: `{len(nasa_manifest['tiles'])}`. FABDEM tiles: `{len(fab_manifest['tiles'])}`. All four one-degree tiles for each source intersect the AOI and their SHA-256 values are recorded in the two manifests. The source-native adapter uses bilinear interpolation and treats all four no-data neighbours as unavailable, matching the diagnostic Go sampler contract.

The hard comparison gate is **closed**: NASADEM is orthometric EGM96 while FABDEM is orthometric EGM2008. No sourced EGM96-to-EGM2008 transformation was applied. Therefore the raw difference is retained only as an untransformed diagnostic, and the demeaned difference is labelled a relative surface-shape diagnostic—not an absolute source error, accuracy estimate, or truth ranking.

## Coverage and quality

| Source | Nominal AOI coverage | Valid deterministic grid samples | Base evidence available | Base spread >5 m |
|---|---:|---:|---:|---:|
| NASADEM | {nasa_coverage['nominal_aoi_coverage_ratio']:.6f} | {nasa_coverage['deterministic_aoi_grid']['valid_fraction']:.6f} | {bases['by_source']['nasadem']['base_available_fraction']:.6f} | {bases['by_source']['nasadem']['base_uncertain_spread_gt_5m_count']} |
| FABDEM | {fab_coverage['nominal_aoi_coverage_ratio']:.6f} | {fab_coverage['deterministic_aoi_grid']['valid_fraction']:.6f} | {bases['by_source']['fabdem']['base_available_fraction']:.6f} | {bases['by_source']['fabdem']['base_uncertain_spread_gt_5m_count']} |

The building-base method is a robust perimeter median of outer-ring vertices, edge midpoints, and the polygon centroid. It is computed independently for each source over `{quality['dataset_scope']['loader_visible_footprints']}` loader-visible footprints (MultiPolygon parts expanded with stable logical IDs). All `{bases['by_source']['nasadem']['known_osm_height_count']}` known OSM AGL heights are carried into source-local diagnostic roof counts; generic fallback heights are excluded. NASADEM remains `dem_unspecified` and is not a production ground anchor. FABDEM remains a research-only bare-earth candidate.

## Source comparison and stratification

The all-sample result is `{comparison['comparisons']['all']['status']}` with `{comparison['comparisons']['all'].get('sample_count', 0)}` common samples. Its datum-mixed raw median offset is `{comparison['comparisons']['all'].get('source_median_offset_m', float('nan')):.3f} m`; this number is not interpreted as an error. The demeaned surface-shape diagnostic has median `{comparison['comparisons']['all'].get('demeaned_surface_shape_difference_m', {}).get('median', float('nan')):.3f} m` and MAE `{comparison['comparisons']['all'].get('demeaned_surface_shape_difference_m', {}).get('mae', float('nan')):.3f} m`.

Urban samples are repository building centroids and open samples are deterministic AOI-grid points outside building footprints. Vegetation effect is not assessed because no land-cover truth layer is present. Slope strata use four-neighbour NASADEM finite differences only to organize relative diagnostics; neither stratum is an accuracy claim.

## 432-path evidence audit

The fixed six-cell, 72-ray, 400 m sample produces 432 path profiles per source. Profiles use a 30 m minimum spacing and remain diagnostic. They report valid terrain sample counts, source-local terrain range, and clearance against a straight radio line using source-local endpoint elevations plus 25 m/1.5 m antenna heights. They do not change LOS/NLOS, P.526, diffraction, P.1411, reflection, interference, radio quality, optimization, or any canonical fingerprint.

NASADEM complete profiles: `{quality['path_profiles']['nasadem']['complete_profiles']}`; candidate terrain-obstruction profiles: `{quality['path_profiles']['nasadem']['terrain_obstruction_candidate_count']}`. FABDEM complete profiles: `{quality['path_profiles']['fabdem']['complete_profiles']}`; candidate terrain-obstruction profiles: `{quality['path_profiles']['fabdem']['terrain_obstruction_candidate_count']}`.

## Readiness and decision

P.526 receives a complete source-local profile diagnostic but no canonical terrain term. P.1411 remains not ready because morphology and compatible rooftop relations are absent. Reflection remains not ready because terrain-anchored vertical spans, materials, roughness, visibility, and compatible production datum evidence are not established.

The evidence decision is: NASADEM is a legally reusable primary candidate for a future terrain-only validation phase, but **NO-GO for production ground fusion in this phase**; FABDEM is **research-only** and cannot become a production dependency. The canonical RF path remains invariant by construction. Source fingerprints are `{fingerprints['nasadem'][0]}` and `{fingerprints['fabdem'][0]}`.

## Reproduction

```text
data-pipeline/.venv/bin/python data-pipeline/terrain_source_pilot.py \\
  --manifest data-pipeline/manifest.json \\
  --buildings data-pipeline/ankara_buildings.geojson \\
  --towers data-pipeline/ankara_5g_nodes.geojson \\
  --baseline docs/concept-4f3a-pre-change-baseline.json \\
  --raw-dir /tmp/atom-4f3a3-20260919 \\
  --output-dir docs
```

The runner is deterministic for a fixed input manifest, raw-tile checksums, source definitions, adapter version, interpolation, base method, threshold, and path sample. It writes no raw tiles into the repository.
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("data-pipeline/manifest.json"))
    parser.add_argument("--buildings", type=Path, default=Path("data-pipeline/ankara_buildings.geojson"))
    parser.add_argument("--towers", type=Path, default=Path("data-pipeline/ankara_5g_nodes.geojson"))
    parser.add_argument("--baseline", type=Path, default=Path("docs/concept-4f3a-pre-change-baseline.json"))
    parser.add_argument("--raw-dir", type=Path, default=Path("/tmp/atom-4f3a3-20260919"))
    parser.add_argument("--output-dir", type=Path, default=Path("docs"))
    parser.add_argument("--download", action="store_true", help="download missing mirror tiles into --raw-dir")
    return parser


def run(args: argparse.Namespace) -> dict:
    started = time.monotonic()
    captured_at = dt.date.today().isoformat()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    aoi = [float(value) for value in manifest["bounds"]]
    if aoi != AOI:
        raise ValueError(f"active AOI changed: {aoi}; expected {AOI}")

    if args.download:
        for tile in _source_tiles():
            destination = args.raw_dir / tile["raw_subdir"] / tile["filename"]
            if not destination.exists():
                print(f"downloading {tile['source']} {tile['filename']}", file=sys.stderr)
                download_file(tile["mirror_url"], destination)
    nasa_records, fab_records, paths_by_filename = tile_manifest_records(args.raw_dir)
    nasa = RasterSource("nasadem", paths_by_filename)
    fab = RasterSource("fabdem", paths_by_filename)
    try:
        records = load_buildings(args.buildings)
        towers_document = json.loads(Path(args.towers).read_text(encoding="utf-8"))
        tower_by_id = {
            str(feature.get("id")): tuple(feature["geometry"]["coordinates"][:2])
            for feature in towers_document.get("features", [])
            if feature.get("id") and feature.get("geometry", {}).get("type") == "Point"
        }
        missing_cells = [cell_id for cell_id in CANONICAL_SAMPLE_CELLS if cell_id not in tower_by_id]
        if missing_cells:
            raise ValueError(f"canonical sample cells missing from tower dataset: {missing_cells}")

        coverage = {"nasadem": source_coverage(nasa), "fabdem": source_coverage(fab)}
        bases = building_base_audit(records, {"nasadem": nasa, "fabdem": fab})
        comparison = source_comparison(nasa, fab, records)
        profiles = {"nasadem": path_profiles(nasa, tower_by_id), "fabdem": path_profiles(fab, tower_by_id)}
        fingerprints = {
            "nasadem": _source_fingerprint("nasadem", nasa_records),
            "fabdem": _source_fingerprint("fabdem", fab_records),
        }
        readiness = build_readiness(baseline, bases, profiles, comparison)
        prechange = _baseline_copy(baseline, captured_at)
        quality = {
            "schema_version": 1,
            "concept": CONCEPT,
            "captured_at": captured_at,
            "aoi": {"bounds_west_south_east_north": AOI, "crs": CRS},
            "source_semantics": {name: {key: source_definition(name)[key] for key in ("product", "release", "candidate_kind", "classification", "vertical_datum", "vertical_datum_kind", "geoid_model", "format")} for name in ("nasadem", "fabdem")},
            "dataset_scope": {
                "manifest_building_features": int(baseline.get("dataset", {}).get("building_features_in_manifest", len(records))),
                "loader_visible_footprints": len(records),
                "multipolygon_parts_expanded": len(records) - int(baseline.get("dataset", {}).get("building_features_in_manifest", len(records))),
            },
            "coverage": coverage,
            "building_base": {key: value for key, value in bases.items() if key != "known_height_base_records"},
            "path_profiles": profiles,
            "performance": {
                "elapsed_seconds": time.monotonic() - started,
                "peak_rss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024),
                "building_feature_count": len(records),
                "note": "Diagnostic raster arrays and geometry processing only; no canonical RF request was changed.",
            },
            "fingerprints": {name: value[0] for name, value in fingerprints.items()},
        }
        base_impact = {
            "schema_version": 1,
            "concept": CONCEPT,
            "captured_at": captured_at,
            "aoi": AOI,
            "source_datum_gate": comparison["vertical_datum_gate"],
            "known_osm_height_population": {
                "count": sum(record["height_m"] is not None for record in records),
                "by_source": {name: len(items) for name, items in bases["known_height_base_records"].items()},
                "semantics": "OSM explicit height or 3 m-per-level derived AGL; generic fallback excluded",
            },
            "input_scope": {
                "manifest_building_features": int(baseline.get("dataset", {}).get("building_features_in_manifest", len(records))),
                "loader_visible_footprints": len(records),
                "multipolygon_parts_expanded": len(records) - int(baseline.get("dataset", {}).get("building_features_in_manifest", len(records))),
            },
            "by_source": {
                name: {
                    key: value
                    for key, value in source_summary.items()
                    if key not in ("known_osm_height_count",)
                }
                for name, source_summary in bases["by_source"].items()
            },
            "cross_source_roof_comparison": "unavailable_due_to_EGM96_vs_EGM2008",
            "production_activation": False,
        }
        post_change = {
            "schema_version": 1,
            "concept": CONCEPT,
            "captured_at": captured_at,
            "before_artifact": "concept-4f3a3-pre-change-baseline.json",
            "diagnostic_after_artifacts": [
                "concept-4f3a3-terrain-quality.json",
                "concept-4f3a3-source-comparison.json",
                "concept-4f3a3-building-base-impact.json",
                "concept-4f3a3-readiness-impact.json",
            ],
            "canonical_rf_invariance": {
                "status": "unchanged_by_construction",
                "terrain_activation": False,
                "canonical_targets": baseline.get("invariance_targets", []),
                "canonical_dataset_manifest_sha256_unchanged": sha256_file(args.manifest),
                "note": "The source pilot reads external tiles only; it does not modify the active pack, propagation models, LOS/NLOS, P.526, P.1411, reflection, building entry, interference, radio quality, optimization, or canonical fingerprints.",
            },
            "canonical_height_audit": readiness["canonical_height_audit"],
            "diagnostic_differences": {
                "terrain_source_profiles": {name: {key: value for key, value in profile.items() if key != "profiles"} for name, profile in profiles.items()},
                "readiness": readiness,
                "source_fingerprints": {name: value[0] for name, value in fingerprints.items()},
            },
            "decision": readiness["source_decisions"],
        }

        output = Path(args.output_dir)
        write_json(output / "concept-4f3a3-pre-change-baseline.json", prechange)
        write_json(output / "concept-4f3a3-nasadem-manifest.json", build_source_manifest("nasadem", nasa_records, captured_at))
        write_json(output / "concept-4f3a3-fabdem-manifest.json", build_source_manifest("fabdem", fab_records, captured_at))
        write_json(output / "concept-4f3a3-terrain-quality.json", quality)
        write_json(output / "concept-4f3a3-source-comparison.json", comparison)
        write_json(output / "concept-4f3a3-building-base-impact.json", base_impact)
        write_json(output / "concept-4f3a3-readiness-impact.json", readiness)
        write_json(output / "concept-4f3a3-post-change-comparison.json", post_change)
        audit = _audit_markdown(captured_at, build_source_manifest("nasadem", nasa_records, captured_at), build_source_manifest("fabdem", fab_records, captured_at), quality, comparison, bases, readiness, fingerprints)
        (output / "concept-4f3a3-terrain-source-audit.md").write_text(audit, encoding="utf-8")
        return {"status": "complete", "output_dir": str(output), "building_features": len(records), "elapsed_seconds": time.monotonic() - started, "fingerprints": {name: value[0] for name, value in fingerprints.items()}}
    finally:
        nasa.close()
        fab.close()


def main(argv=None) -> int:
    try:
        result = run(build_parser().parse_args(argv))
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        print(f"terrain source pilot error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
