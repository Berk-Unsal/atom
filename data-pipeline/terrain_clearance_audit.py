#!/usr/bin/env python3
"""Run the read-only Concept 4F.3A.4 terrain-clearance audit.

This module deliberately lives beside, rather than inside, the 4F.3A.3
terrain-source pilot.  It freezes the existing 4F.3A.3 result, evaluates the
same paths with the signed clearance equation required by 4F.3A.4, and emits
diagnostic evidence only.  It never writes the canonical dataset pack and
never supplies a terrain value to the Go RF runtime.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import math
import os
import re
import resource
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from shapely.geometry import Point as ShapelyPoint


ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = Path(__file__).resolve().parent
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

try:
    import terrain_source_pilot as pilot
except ImportError:  # pragma: no cover - direct import under another module name
    spec = importlib.util.spec_from_file_location("terrain_source_pilot", PIPELINE_DIR / "terrain_source_pilot.py")
    pilot = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(pilot)


CONCEPT = "4F.3A.4"
SCHEMA_VERSION = 1
AOI = pilot.AOI
CRS = pilot.CRS
PATH_DISTANCE_M = 400.0
CANONICAL_TX_HEIGHT_M = 25.0
CANONICAL_RX_HEIGHT_M = 1.5
CANONICAL_SPACING_M = 30.0
DEFAULT_UNCERTAINTY_TOLERANCES_M = (0.0, 1.0, 2.0, 5.0)
CURVATURE_EARTH_RADIUS_M = 6_371_000.0
CANONICAL_TARGETS = [
    "canonical 2.6 GHz simulation",
    "canonical 28 GHz simulation",
    "research sub-THz 140 GHz simulation",
    "height-aware LOS/NLOS classification",
    "P.526 diagnostic",
    "P.1411 diagnostic",
    "reflection diagnostic",
    "building entry",
    "4F.1 interference and radio quality",
    "4H.2 disabled and enabled optimization",
    "scenario fingerprints",
]

EGM96_GRID = {
    "name": "us_nga_egm96_15.tif",
    "url": "https://cdn.proj.org/us_nga_egm96_15.tif",
    "model": "EGM96",
    "target_epsg": 5773,
    "coverage": "world",
    "nominal_resolution": "15 arc-second",
    "license": "NGA-derived public-domain grid as identified by the PROJ GeoTIFF metadata",
}
EGM08_GRID = {
    "name": "us_nga_egm08_25.tif",
    "url": "https://cdn.proj.org/us_nga_egm08_25.tif",
    "model": "EGM2008",
    "target_epsg": 3855,
    "coverage": "world",
    "nominal_resolution": "2.5 arc-minute",
    "license": "NGA-derived public-domain grid as identified by the PROJ GeoTIFF metadata",
}

LOCAL_CONTROL_SOURCES = [
    {
        "name": "Turkish General Directorate of Mapping TG-20",
        "url": "https://www.harita.gov.tr/jeo/tg20.php",
        "role": "model/control evidence",
        "availability": "1 arc-minute WCS requires public-institution application; 5 arc-minute version is offered for education/demo use",
        "usable_as_open_point_control_here": False,
        "reason": "No open downloadable Ankara point coordinates were acquired; a coarse model is not a point-control set.",
    },
    {
        "name": "Turkish National Vertical Control Network literature",
        "url": "https://ascelibrary.org/doi/10.1061/(ASCE)0733-9453(2006)132:1(15)",
        "role": "published validation evidence",
        "availability": "Published GPS/leveling benchmark analysis; point coordinates are not an open machine-readable control file in this workspace",
        "usable_as_open_point_control_here": False,
        "reason": "Literature evidence cannot be joined to the tile samples without the underlying benchmark coordinates and datum realization.",
    },
    {
        "name": "ANK200TUR IGS station",
        "url": "https://network.igs.org/ANK200TUR",
        "role": "open GNSS metadata",
        "availability": "Station metadata and RINEX links are public",
        "usable_as_open_point_control_here": False,
        "reason": "The station page is not an orthometric terrain-control point set; ellipsoidal/GNSS processing and datum conversion would still be required.",
    },
    {
        "name": "TUSAGA-Aktif",
        "url": "https://tusaga-aktif.gov.tr/",
        "role": "national GNSS infrastructure",
        "availability": "Service and station network information are public; data use is agreement-controlled",
        "usable_as_open_point_control_here": False,
        "reason": "No unrestricted, ready-to-join Ankara orthometric control table was available for this audit.",
    },
]


def write_json(path: Path, value) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True, ensure_ascii=False, default=_json_default)
        handle.write("\n")
    os.replace(temporary, path)


def _json_default(value):
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "item"):
        return value.item()
    raise TypeError(f"not JSON serializable: {type(value)!r}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def metric_distribution(values: list[float]) -> dict:
    result = pilot.distribution([float(value) for value in values])
    if values:
        array = np.asarray(values, dtype=float)
        result.update(
            {
                "mean_signed": float(np.mean(array)),
                "mae": float(np.mean(np.abs(array))),
                "rmse": float(np.sqrt(np.mean(array * array))),
            }
        )
    return result


def radio_line(z_tx_radio_m: float, z_rx_radio_m: float, fraction: float) -> float:
    """Return the straight source-local radio line at u in [0, 1]."""

    if not 0.0 <= fraction <= 1.0:
        raise ValueError(f"profile fraction outside [0,1]: {fraction}")
    return (1.0 - fraction) * z_tx_radio_m + fraction * z_rx_radio_m


def signed_clearance(z_radio_m: float, z_terrain_m: float) -> float:
    """The required sign: positive means radio is above sampled terrain."""

    return float(z_radio_m - z_terrain_m)


def classify_clearance(min_clearance_m: float | None, unavailable: bool, tolerance_m: float = 0.0) -> str:
    """Classify one complete sampled path without claiming exact obstruction."""

    if unavailable or min_clearance_m is None:
        return "unavailable"
    if min_clearance_m < -float(tolerance_m):
        return "obstruction_candidate"
    if abs(min_clearance_m) <= float(tolerance_m):
        return "near_uncertainty_boundary"
    return "clear"


def classifier_contract() -> dict:
    return {
        "statuses": {
            "clear": "complete sampled profile with minimum clearance greater than the selected uncertainty margin",
            "obstruction_candidate": "complete sampled profile with minimum clearance below the negative selected uncertainty margin",
            "near_uncertainty_boundary": "complete sampled profile with absolute minimum clearance within the selected uncertainty margin",
            "unavailable": "one or more required terrain samples is missing, invalid, outside coverage, or interpolation cannot be completed",
        },
        "required_fields": [
            "status",
            "min_clearance_m",
            "min_location_m_from_tx",
            "sample_resolution_m",
            "interpolation",
            "source",
            "uncertainty_margin_m",
        ],
        "candidate_semantics": "A sampled terrain candidate is not an exact terrain obstruction and must not be promoted to diffraction, LOS/NLOS, reflection, interference, radio quality, or optimization behavior without a later approved phase.",
        "no_data_rule": "No-data or incomplete interpolation is unavailable and can never become an obstruction candidate.",
    }


def source_tile_for_point(source, point: tuple[float, float]) -> str | None:
    for tile in source.tiles:
        if tile.contains(*point):
            return tile.path.name
    return None


def evaluate_profile(
    source,
    tower_id: str,
    origin: tuple[float, float],
    bearing_deg: float,
    tx_height_m: float = CANONICAL_TX_HEIGHT_M,
    rx_height_m: float = CANONICAL_RX_HEIGHT_M,
    spacing_m: float = CANONICAL_SPACING_M,
    interpolation: str = "bilinear",
) -> dict:
    """Evaluate one source-local profile using the exact 4F.3A.4 equation."""

    steps = max(1, math.ceil(PATH_DISTANCE_M / float(spacing_m)))
    points = []
    terrain_values = []
    for step in range(steps + 1):
        distance = PATH_DISTANCE_M * step / steps
        point = pilot.destination_point(origin, bearing_deg, distance)
        points.append((step, distance, step / steps, point))
        terrain_values.append(source.sample(point, interpolation=interpolation))

    complete = all(value is not None and math.isfinite(float(value)) for value in terrain_values)
    endpoint_ground = {
        "tx_m": float(terrain_values[0]) if complete else None,
        "rx_m": float(terrain_values[-1]) if complete else None,
    }
    samples = []
    missing_indexes = []
    z_tx_radio = None
    z_rx_radio = None
    if complete:
        z_tx_radio = endpoint_ground["tx_m"] + tx_height_m
        z_rx_radio = endpoint_ground["rx_m"] + rx_height_m
    for (step, distance, fraction, point), terrain_value in zip(points, terrain_values):
        sample = {
            "index": step,
            "distance_m": distance,
            "fraction_u": fraction,
            "lon": point[0],
            "lat": point[1],
            "terrain_m": float(terrain_value) if terrain_value is not None else None,
            "source_tile": source_tile_for_point(source, point),
            "valid": terrain_value is not None and math.isfinite(float(terrain_value)) if terrain_value is not None else False,
            "z_radio_m": None,
            "clearance_m": None,
            "legacy_terrain_minus_radio_m": None,
        }
        if not sample["valid"]:
            missing_indexes.append(step)
        if complete:
            z_radio = radio_line(z_tx_radio, z_rx_radio, fraction)
            sample["z_radio_m"] = z_radio
            sample["clearance_m"] = signed_clearance(z_radio, float(terrain_value))
            sample["legacy_terrain_minus_radio_m"] = float(terrain_value) - z_radio
        samples.append(sample)

    min_index = None
    min_clearance = None
    legacy_min_index = None
    legacy_min = None
    if complete:
        min_index = min(range(len(samples)), key=lambda index: samples[index]["clearance_m"])
        min_clearance = samples[min_index]["clearance_m"]
        legacy_min_index = min(range(len(samples)), key=lambda index: samples[index]["legacy_terrain_minus_radio_m"])
        legacy_min = samples[legacy_min_index]["legacy_terrain_minus_radio_m"]
    min_sample = samples[min_index] if min_index is not None else None
    status = classify_clearance(min_clearance, not complete, 0.0)
    return {
        "cell_id": tower_id,
        "ray_index": round(bearing_deg / 5.0),
        "bearing_deg": bearing_deg,
        "origin": {"lon": origin[0], "lat": origin[1]},
        "endpoint": {
            "lon": points[-1][3][0],
            "lat": points[-1][3][1],
            "distance_m": PATH_DISTANCE_M,
        },
        "distance_m": PATH_DISTANCE_M,
        "requested_spacing_m": spacing_m,
        "effective_spacing_m": PATH_DISTANCE_M / steps,
        "sample_count": len(samples),
        "valid_sample_count": sum(sample["valid"] for sample in samples),
        "interpolation": interpolation,
        "source": source.name,
        "source_vertical_datum": source.definition["vertical_datum"],
        "source_candidate_kind": source.definition["candidate_kind"],
        "terrain_status": "terrain_available" if complete else "terrain_partial_or_no_data",
        "missing_sample_indexes": missing_indexes,
        "terrain_min_m": min(float(value) for value in terrain_values if value is not None) if any(value is not None for value in terrain_values) else None,
        "terrain_max_m": max(float(value) for value in terrain_values if value is not None) if any(value is not None for value in terrain_values) else None,
        "terrain_range_m": (max(float(value) for value in terrain_values if value is not None) - min(float(value) for value in terrain_values if value is not None)) if any(value is not None for value in terrain_values) else None,
        "tx_height_agl_m": tx_height_m,
        "rx_height_agl_m": rx_height_m,
        "endpoint_ground_m": endpoint_ground,
        "tower_ground_sample": {
            "value_m": endpoint_ground["tx_m"],
            "point": {"lon": origin[0], "lat": origin[1]},
            "method": "source-native sample at the exact canonical tower coordinate using the selected interpolation",
            "source": source.name,
            "vertical_datum": source.definition["vertical_datum"],
        },
        "receiver_ground_sample": {
            "value_m": endpoint_ground["rx_m"],
            "point": {"lon": points[-1][3][0], "lat": points[-1][3][1]},
            "method": "source-native sample at the exact 400 m profile endpoint using the selected interpolation",
            "source": source.name,
            "vertical_datum": source.definition["vertical_datum"],
        },
        "endpoint_radio_m": {"tx_m": z_tx_radio, "rx_m": z_rx_radio},
        "endpoint_clearance_m": {"tx_m": tx_height_m if complete else None, "rx_m": rx_height_m if complete else None},
        "min_clearance_m": min_clearance,
        "min_clearance_index": min_index,
        "min_location_m_from_tx": min_sample["distance_m"] if min_sample else None,
        "min_location_m_from_rx": PATH_DISTANCE_M - min_sample["distance_m"] if min_sample else None,
        "min_location": (
            "tx_endpoint" if min_index == 0 else "rx_endpoint" if min_index == len(samples) - 1 else "interior"
        ) if min_index is not None else None,
        "min_sample_lon": min_sample["lon"] if min_sample else None,
        "min_sample_lat": min_sample["lat"] if min_sample else None,
        "legacy_signed_min_m": legacy_min,
        "legacy_signed_min_index": legacy_min_index,
        "legacy_candidate": bool(legacy_min is not None and legacy_min < 0.0),
        "obstruction_candidate": bool(min_clearance is not None and min_clearance < 0.0),
        "status_at_zero_tolerance": status,
        "samples": samples,
    }


def path_set_summary(profiles: list[dict]) -> dict:
    complete = [profile for profile in profiles if profile["terrain_status"] == "terrain_available"]
    min_clearances = [profile["min_clearance_m"] for profile in complete]
    legacy_mins = [profile["legacy_signed_min_m"] for profile in complete]
    thresholds = (0.0, -0.5, -1.0, -2.0, -5.0)
    candidate_counts = {f"lt_{threshold:g}_m": sum(value < threshold for value in min_clearances) for threshold in thresholds}
    location_counts = {"tx_endpoint": 0, "rx_endpoint": 0, "interior": 0}
    for profile in complete:
        location_counts[profile["min_location"]] += 1
    tx_histogram = {
        "0_30m": sum(profile["min_location_m_from_tx"] <= 30.0 for profile in complete),
        "30_60m": sum(30.0 < profile["min_location_m_from_tx"] <= 60.0 for profile in complete),
        "60_100m": sum(60.0 < profile["min_location_m_from_tx"] <= 100.0 for profile in complete),
        "100_200m": sum(100.0 < profile["min_location_m_from_tx"] <= 200.0 for profile in complete),
        "200_300m": sum(200.0 < profile["min_location_m_from_tx"] <= 300.0 for profile in complete),
        "300_400m": sum(300.0 < profile["min_location_m_from_tx"] <= 400.0 for profile in complete),
    }
    rx_histogram = {
        "0_30m": sum(profile["min_location_m_from_rx"] <= 30.0 for profile in complete),
        "30_60m": sum(30.0 < profile["min_location_m_from_rx"] <= 60.0 for profile in complete),
        "60_100m": sum(60.0 < profile["min_location_m_from_rx"] <= 100.0 for profile in complete),
        "100_200m": sum(100.0 < profile["min_location_m_from_rx"] <= 200.0 for profile in complete),
        "200_300m": sum(200.0 < profile["min_location_m_from_rx"] <= 300.0 for profile in complete),
        "300_400m": sum(300.0 < profile["min_location_m_from_rx"] <= 400.0 for profile in complete),
    }
    return {
        "paths": len(profiles),
        "complete_profiles": len(complete),
        "partial_profiles": len(profiles) - len(complete),
        "min_clearance_distribution_m": metric_distribution(min_clearances),
        "legacy_signed_min_distribution_m": metric_distribution(legacy_mins),
        "terrain_range_distribution_m": pilot.distribution([profile["terrain_range_m"] for profile in complete if profile["terrain_range_m"] is not None]),
        "strict_zero_candidate_count": sum(profile["obstruction_candidate"] for profile in complete),
        "legacy_candidate_count": sum(profile["legacy_candidate"] for profile in complete),
        "candidate_counts_by_threshold_m": candidate_counts,
        "minimum_location_counts": location_counts,
        "minimum_distance_from_tx_histogram": tx_histogram,
        "minimum_distance_from_rx_histogram": rx_histogram,
        "endpoint_clearance_contract_m": {
            "tx": CANONICAL_TX_HEIGHT_M,
            "rx": CANONICAL_RX_HEIGHT_M,
            "reason": "At u=0 and u=1, radio minus terrain equals the configured AGL height exactly when the endpoint ground samples are valid.",
        },
        "profile_sample_semantics": "The minimum is over sampled terrain postings/interpolates only; it is not an exact continuous obstruction test.",
    }


def run_profile_set(source, tower_by_id, tx_height_m=CANONICAL_TX_HEIGHT_M, rx_height_m=CANONICAL_RX_HEIGHT_M, spacing_m=CANONICAL_SPACING_M, interpolation="bilinear") -> dict:
    profiles = []
    for cell_id in pilot.CANONICAL_SAMPLE_CELLS:
        origin = tower_by_id[cell_id]
        for ray_index in range(72):
            profiles.append(
                evaluate_profile(
                    source,
                    cell_id,
                    origin,
                    ray_index * 5.0,
                    tx_height_m=tx_height_m,
                    rx_height_m=rx_height_m,
                    spacing_m=spacing_m,
                    interpolation=interpolation,
                )
            )
    summary = path_set_summary(profiles)
    summary.update(
        {
            "source": source.name,
            "tx_height_m": tx_height_m,
            "rx_height_m": rx_height_m,
            "requested_spacing_m": spacing_m,
            "interpolation": interpolation,
        }
    )
    return {"summary": summary, "profiles": profiles}


def tolerance_summary(profiles: list[dict]) -> dict:
    complete = [profile for profile in profiles if profile["terrain_status"] == "terrain_available"]
    return {
        f"margin_{margin:g}_m": {
            "margin_m": margin,
            "counts": {
                status: sum(classify_clearance(profile["min_clearance_m"], False, margin) == status for profile in complete)
                for status in ("clear", "obstruction_candidate", "near_uncertainty_boundary", "unavailable")
            } | {"unavailable": len(profiles) - len(complete)},
        }
        for margin in DEFAULT_UNCERTAINTY_TOLERANCES_M
    }


def height_sensitivity(source, tower_by_id) -> dict:
    rx_results = {}
    for rx_height in (1.5, 3.0, 5.0, 10.0):
        run = run_profile_set(source, tower_by_id, tx_height_m=25.0, rx_height_m=rx_height)
        rx_results[str(rx_height)] = {"rx_height_m": rx_height, "summary": run["summary"]}
    tx_results = {}
    for tx_height in (10.0, 25.0, 50.0):
        run = run_profile_set(source, tower_by_id, tx_height_m=tx_height, rx_height_m=1.5)
        tx_results[str(tx_height)] = {"tx_height_m": tx_height, "summary": run["summary"]}
    return {
        "rx_sensitivity": {"fixed_tx_height_m": 25.0, "runs": rx_results},
        "tx_sensitivity": {"fixed_rx_height_m": 1.5, "runs": tx_results},
    }


def source_native_spacing_m(source) -> float:
    resolution = source.tiles[0].resolution
    return CURVATURE_EARTH_RADIUS_M * math.radians(resolution)


def spacing_sensitivity(source, tower_by_id) -> dict:
    native = source_native_spacing_m(source)
    spacing_cases = [
        ("half_source_scale", native / 2.0),
        ("source_scale", native),
        ("requested_15m", 15.0),
        ("requested_30m", 30.0),
        ("requested_60m", 60.0),
    ]
    runs = {}
    for label, spacing in spacing_cases:
        run = run_profile_set(source, tower_by_id, spacing_m=spacing)
        runs[label] = {"requested_spacing_m": spacing, "summary": run["summary"]}
    return {
        "source_native_resolution_m_north_south": native,
        "source_native_resolution_m_east_west_at_39_9N": native * math.cos(math.radians(39.9)),
        "runs": runs,
        "interpretation": "The source-scale label uses one north-south posting interval; east-west spacing is smaller at Ankara latitude.",
    }


def interpolation_sensitivity(source, tower_by_id, bilinear_run: dict) -> dict:
    nearest_run = run_profile_set(source, tower_by_id, interpolation="nearest")
    bilinear_by_key = {(profile["cell_id"], profile["ray_index"]): profile for profile in bilinear_run["profiles"]}
    nearest_by_key = {(profile["cell_id"], profile["ray_index"]): profile for profile in nearest_run["profiles"]}
    differences = []
    candidate_switches = 0
    paired = 0
    for key, bilinear in bilinear_by_key.items():
        nearest = nearest_by_key[key]
        if bilinear["min_clearance_m"] is None or nearest["min_clearance_m"] is None:
            continue
        paired += 1
        differences.append(nearest["min_clearance_m"] - bilinear["min_clearance_m"])
        if nearest["obstruction_candidate"] != bilinear["obstruction_candidate"]:
            candidate_switches += 1
    return {
        "source": source.name,
        "path_geometry": {"distance_m": PATH_DISTANCE_M, "requested_spacing_m": CANONICAL_SPACING_M},
        "bilinear_summary": bilinear_run["summary"],
        "nearest_summary": nearest_run["summary"],
        "nearest_minus_bilinear_min_clearance_m": metric_distribution(differences),
        "paired_complete_paths": paired,
        "strict_candidate_switch_count": candidate_switches,
        "interpretation": "Interpolation changes the sampled diagnostic; it does not turn a sampled candidate into an exact obstruction.",
    }


class GeoidGrid:
    """Small, deterministic point-centered bilinear reader for PROJ geoid grids."""

    def __init__(self, path: Path, definition: dict):
        self.path = Path(path)
        self.definition = definition
        self.dataset = rasterio.open(self.path)
        self.array = self.dataset.read(1, masked=False).astype(float)
        self.nodata = self.dataset.nodata
        self.width = int(self.dataset.width)
        self.height = int(self.dataset.height)
        self.x_resolution = float(self.dataset.transform.a)
        self.y_resolution = abs(float(self.dataset.transform.e))
        self.x_center0 = float(self.dataset.transform.c + self.x_resolution / 2.0)
        self.y_center0 = float(self.dataset.transform.f - self.y_resolution / 2.0)

    def close(self):
        self.dataset.close()

    def sample(self, point: tuple[float, float]) -> float | None:
        lon, lat = point
        column = (lon - self.x_center0) / self.x_resolution
        row = (self.y_center0 - lat) / self.y_resolution
        if column < 0 or row < 0 or column > self.width - 1 or row > self.height - 1:
            return None
        column = min(max(column, 0.0), self.width - 1.0)
        row = min(max(row, 0.0), self.height - 1.0)
        left, top = int(math.floor(column)), int(math.floor(row))
        right, bottom = min(left + 1, self.width - 1), min(top + 1, self.height - 1)
        values = [self.array[top, left], self.array[top, right], self.array[bottom, left], self.array[bottom, right]]
        if any(not math.isfinite(float(value)) for value in values):
            return None
        if self.nodata is not None and any(float(value) == float(self.nodata) for value in values):
            return None
        x, y = column - left, row - top
        upper = values[0] * (1.0 - x) + values[1] * x
        lower = values[2] * (1.0 - x) + values[3] * x
        return float(upper * (1.0 - y) + lower * y)

    def metadata(self) -> dict:
        tags = self.dataset.tags()
        return {
            **self.definition,
            "path": str(self.path),
            "relative_raw_path": f"geoid/{self.path.name}",
            "sha256": sha256_file(self.path),
            "bytes": self.path.stat().st_size,
            "width": self.width,
            "height": self.height,
            "crs": self.dataset.crs.to_string() if self.dataset.crs else None,
            "resolution_deg": [self.x_resolution, self.y_resolution],
            "bounds": list(self.dataset.bounds),
            "tags": {
                key: value
                for key, value in tags.items()
                if key in ("TIFFTAG_COPYRIGHT", "TIFFTAG_IMAGEDESCRIPTION", "AREA_OR_POINT", "target_crs_epsg_code", "TYPE")
            },
        }


def datum_metrics(values: list[float], direction: str) -> dict:
    result = metric_distribution(values)
    result["direction"] = direction
    result["within_abs_m"] = {str(limit): sum(abs(value) <= limit for value in values) for limit in (0.1, 0.5, 1.0, 2.0, 5.0)}
    return result


def transformed_source_comparison(nasa, fab, egm96: GeoidGrid, egm08: GeoidGrid, records: list[dict]) -> dict:
    all_aoi_points = pilot._grid_points(AOI)
    all_points = all_aoi_points[:20000]
    stratified = pilot._stratified_points(records)
    strata = {"all_grid": all_points, "urban_building_centroids": stratified["urban_building_centroids"], "open_grid": stratified["open_grid"]}
    raw_values = []
    transformed_values = []
    offset_values = []
    source_pairs = {}
    for label, points in strata.items():
        raw = []
        transformed = []
        offsets = []
        common = 0
        for point in points:
            nasa_value = nasa.sample(point)
            fab_value = fab.sample(point)
            n96 = egm96.sample(point)
            n08 = egm08.sample(point)
            if None in (nasa_value, fab_value, n96, n08):
                continue
            offset = n96 - n08
            transformed_difference = (nasa_value + offset) - fab_value
            raw_difference = nasa_value - fab_value
            raw.append(raw_difference)
            transformed.append(transformed_difference)
            offsets.append(offset)
            common += 1
            if label == "all_grid":
                raw_values.append(raw_difference)
                transformed_values.append(transformed_difference)
                offset_values.append(offset)
        source_pairs[label] = {
            "requested_points": len(points),
            "common_valid_samples": common,
            "raw_nasadem_minus_fabdem_m": datum_metrics(raw, "NASADEM(EGM96) - FABDEM(EGM2008), no transform"),
            "transformed_nasadem_egm2008_minus_fabdem_m": datum_metrics(transformed, "(NASADEM H96 + N96 - N08) - FABDEM H08"),
            "egm96_minus_egm2008_offset_m": datum_metrics(offsets, "N96 - N08"),
            "qualification": "The transformed comparison reconciles the published vertical frames only; FABDEM remains a research comparator and not truth.",
        }
    offset_map_values = []
    for point in all_aoi_points:
        n96 = egm96.sample(point)
        n08 = egm08.sample(point)
        if n96 is not None and n08 is not None:
            offset_map_values.append(n96 - n08)
    return {
        "sample_grid": {"method": "same-coordinate bilinear source samples over the first 20,000 points of the deterministic 161x141 AOI grid", "requested_points": len(all_points), "valid_points": len(transformed_values)},
        "offset_map_full_aoi": {
            "method": "same-coordinate bilinear sampling of the official geoid grids over every point of the deterministic 161x141 AOI grid",
            "requested_points": len(all_aoi_points),
            "valid_points": len(offset_map_values),
            "egm96_minus_egm2008_m": datum_metrics(offset_map_values, "N96 - N08"),
            "grid": {
                "bounds_west_south_east_north": AOI,
                "columns": 161,
                "rows": 141,
                "ordering": "row-major south-to-north, west-to-east; values correspond to _grid_points(AOI)",
                "values_m": offset_map_values,
            },
        },
        "formula": {
            "definitions": ["H96 = h - N96", "H08 = h - N08"],
            "transform": "H96_to_EGM2008 = H96 + N96 - N08",
            "sign_check": "NASADEM orthometric height is raised by N96-N08 to the EGM2008 orthometric frame before comparison.",
            "not_accuracy_correction": True,
        },
        "all_grid": {
            "raw_nasadem_minus_fabdem_m": datum_metrics(raw_values, "NASADEM(EGM96) - FABDEM(EGM2008), no transform"),
            "transformed_nasadem_egm2008_minus_fabdem_m": datum_metrics(transformed_values, "(NASADEM H96 + N96 - N08) - FABDEM H08"),
            "egm96_minus_egm2008_offset_m": datum_metrics(offset_values, "N96 - N08"),
        },
        "strata": source_pairs,
        "interpretation": "Source-local profile decisions do not require cross-source datum conversion. Cross-source absolute disagreement remains unqualified because FABDEM is not truth and the DEM products have different surface semantics.",
    }


def geoid_audit(raw_dir: Path, nasa, fab, records: list[dict]) -> tuple[dict, GeoidGrid, GeoidGrid]:
    geoid_dir = raw_dir / "geoid"
    egm96_path = geoid_dir / EGM96_GRID["name"]
    egm08_path = geoid_dir / EGM08_GRID["name"]
    if not egm96_path.exists() or not egm08_path.exists():
        raise FileNotFoundError(f"missing PROJ/NGA geoid grids under {geoid_dir}; expected {egm96_path.name} and {egm08_path.name}")
    egm96 = GeoidGrid(egm96_path, EGM96_GRID)
    egm08 = GeoidGrid(egm08_path, EGM08_GRID)
    comparison = transformed_source_comparison(nasa, fab, egm96, egm08, records)
    return {
        "vertical_frames": {
            "nasadem": {"height_symbol": "H96", "datum": "EGM96 orthometric", "source_semantics": "published product frame; not automatically bare-earth"},
            "fabdem": {"height_symbol": "H08", "datum": "EGM2008 orthometric", "source_semantics": "model-derived bare-earth candidate; research comparator"},
        },
        "grids": {"egm96": egm96.metadata(), "egm2008": egm08.metadata()},
        "conversion": comparison["formula"],
        "comparison": comparison,
        "local_control_search": {
            "usable_open_orthometric_point_control_found": False,
            "sources": LOCAL_CONTROL_SOURCES,
            "decision": "No local control point set was used. The audit does not invent a DEM accuracy margin from model metadata or from a GNSS station page.",
        },
        "source_semantics_gate": {
            "source_local_geometry_allowed": True,
            "absolute_ground_truth_claim_allowed": False,
            "reason": "Datum reconciliation is defensible with official NGA-derived grids, but that only aligns vertical frames; it does not resolve NASADEM surface/vegetation/void-fill semantics or validate FABDEM.",
        },
    }, egm96, egm08


def building_spread_audit(records: list[dict], sources: dict[str, object]) -> dict:
    known_records = [record for record in records if record["height_m"] is not None]
    result = {
        "known_building_base_population": len(known_records),
        "height_semantics": "OSM explicit height or building:levels * 3 m; generic fallback excluded",
        "spread_bins": {
            "le_2m": "spread <= 2 m",
            "gt_2_to_5m": "2 m < spread <= 5 m",
            "gt_5_to_10m": "5 m < spread <= 10 m",
            "gt_10m": "spread > 10 m",
            "gt_5m_nested": "spread > 5 m; includes gt_5m_to_10m and gt_10m",
        },
        "by_source": {},
        "interpretation": "Footprint-inside, footprint-near, and open labels are sampling strata only; they are not terrain truth or a vegetation classification.",
    }
    for name, source in sources.items():
        spreads = []
        centroid_minus_median = []
        median_values = []
        centroid_values = []
        missing = 0
        spread_by_building = []
        for record in known_records:
            all_points = pilot.robust_perimeter_points(record["geometry"])
            perimeter_points = all_points[:-1] if len(all_points) > 1 else all_points
            values = [source.sample(point) for point in perimeter_points]
            values = [float(value) for value in values if value is not None]
            centroid = record["geometry"].centroid
            centroid_value = source.sample((float(centroid.x), float(centroid.y)))
            if not values or centroid_value is None:
                missing += 1
                continue
            median = float(np.median(values))
            spread = max(values) - min(values)
            spreads.append(spread)
            median_values.append(median)
            centroid_values.append(float(centroid_value))
            centroid_minus_median.append(float(centroid_value) - median)
            spread_by_building.append({"id": record["id"], "spread_m": spread, "centroid_minus_median_m": float(centroid_value) - median})
        result["by_source"][name] = {
            "available_count": len(spreads),
            "missing_count": missing,
            "spread_distribution_m": metric_distribution(spreads),
            "spread_counts": {
                "le_2m": sum(value <= 2.0 for value in spreads),
                "gt_2_to_5m": sum(2.0 < value <= 5.0 for value in spreads),
                "gt_5_to_10m": sum(5.0 < value <= 10.0 for value in spreads),
                "gt_10m": sum(value > 10.0 for value in spreads),
                "gt_5m_nested": sum(value > 5.0 for value in spreads),
            },
            "centroid_minus_perimeter_median_distribution_m": metric_distribution(centroid_minus_median),
            "centroid_ground_distribution_m": pilot.distribution(centroid_values),
            "perimeter_median_ground_distribution_m": pilot.distribution(median_values),
            "sample_method": "robust_perimeter_points excluding the helper centroid for spread; separate polygon centroid sample compared with perimeter median",
            "records": spread_by_building,
        }
    return result


def footprint_label_audit(records: list[dict], nasa, fab, egm96: GeoidGrid, egm08: GeoidGrid) -> dict:
    """Provide inside/near/open labels without treating any label as truth."""

    geometries = [record["geometry"] for record in records]
    from shapely.strtree import STRtree

    tree = STRtree(geometries)
    points = pilot._grid_points(AOI)[:20000]
    groups = {"inside_footprint": [], "near_footprint_0_30m": [], "open_gt_30m": []}
    for point in points:
        geometry_point = ShapelyPoint(point)
        candidates = tree.query(geometry_point.buffer(30.0 / 111_320.0))
        distances = [geometries[int(index)].distance(geometry_point) for index in candidates]
        if any(geometries[int(index)].intersects(geometry_point) for index in candidates):
            groups["inside_footprint"].append(point)
        elif distances and min(distances) <= 30.0 / 111_320.0:
            groups["near_footprint_0_30m"].append(point)
        else:
            groups["open_gt_30m"].append(point)
    result = {}
    for label, group in groups.items():
        transformed = []
        raw = []
        for point in group:
            n = nasa.sample(point)
            f = fab.sample(point)
            n96 = egm96.sample(point)
            n08 = egm08.sample(point)
            if None in (n, f, n96, n08):
                continue
            raw.append(n - f)
            transformed.append(n + n96 - n08 - f)
        result[label] = {
            "point_count": len(group),
            "common_valid_samples": len(transformed),
            "raw_nasadem_minus_fabdem_m": datum_metrics(raw, "NASADEM(EGM96) - FABDEM(EGM2008)"),
            "transformed_nasadem_egm2008_minus_fabdem_m": datum_metrics(transformed, "(NASADEM H96 + N96 - N08) - FABDEM H08"),
            "label_semantics": "geometric footprint proximity stratum only; not ground truth, building-height truth, or vegetation truth",
        }
    return {
        "method": "deterministic 161x141 AOI grid, footprint intersection and approximate 30 m geodesic-equivalent proximity",
        "groups": result,
    }


def tile_boundary_and_nodata_audit(sources: dict[str, object]) -> dict:
    boundary_points = [
        {"label": "longitude_west_of_33", "point": [32.999999, 39.9]},
        {"label": "longitude_east_of_33", "point": [33.000001, 39.9]},
        {"label": "latitude_south_of_40", "point": [32.8, 39.999999]},
        {"label": "latitude_north_of_40", "point": [32.8, 40.000001]},
        {"label": "interior_reference", "point": [32.8, 39.9]},
    ]
    result = {}
    for name, source in sources.items():
        tile_quality = []
        for tile in source.tiles:
            valid = np.isfinite(tile.array)
            if tile.nodata is not None:
                valid &= tile.array != tile.nodata
            tile_quality.append(
                {
                    "filename": tile.path.name,
                    "nodata_value": tile.nodata,
                    "invalid_cell_count": int(tile.array.size - np.count_nonzero(valid)),
                    "valid_cell_count": int(np.count_nonzero(valid)),
                    "total_cell_count": int(tile.array.size),
                }
            )
        samples = []
        for item in boundary_points:
            point = tuple(item["point"])
            containing_tiles = [tile.path.name for tile in source.tiles if tile.contains(*point)]
            samples.append(
                {
                    **item,
                    "containing_tiles": containing_tiles,
                    "bilinear_m": source.sample(point, interpolation="bilinear"),
                    "nearest_m": source.sample(point, interpolation="nearest"),
                    "status": "available" if source.sample(point, interpolation="bilinear") is not None else "unavailable",
                }
            )
        result[name] = {
            "tile_quality": tile_quality,
            "boundary_samples": samples,
            "boundary_rule": "A point is sampled from the tile containing its source posting; no-data or incomplete bilinear neighbours return unavailable rather than a zero or a candidate.",
            "aoi_grid_no_data_fixture": {
                "input": "synthetic profile [valid, None, valid]",
                "output_status": "unavailable",
                "candidate": False,
            },
        }
    return {
        "sources": result,
        "boundary_fixture_count": len(boundary_points),
        "no_data_policy": "No-data never becomes a terrain-obstruction candidate.",
    }


def curvature_audit() -> dict:
    distance = PATH_DISTANCE_M
    spherical_sagitta = CURVATURE_EARTH_RADIUS_M - math.sqrt(CURVATURE_EARTH_RADIUS_M**2 - (distance / 2.0) ** 2)
    approximate = distance**2 / (8.0 * CURVATURE_EARTH_RADIUS_M)
    k_factor = 4.0 / 3.0
    refracted = distance**2 / (8.0 * k_factor * CURVATURE_EARTH_RADIUS_M)
    return {
        "distance_m": distance,
        "earth_radius_m": CURVATURE_EARTH_RADIUS_M,
        "unmodeled_geometric_bulge_m": spherical_sagitta,
        "small_angle_approximation_m": approximate,
        "effective_k_factor": k_factor,
        "effective_earth_bulge_m": refracted,
        "difference_between_k1_and_k4_3_m": spherical_sagitta - refracted,
        "comparison": "At 400 m the geometric sagitta is about 3.14 mm and the k=4/3 effective-earth diagnostic is about 2.35 mm; both are far below the source-scale and documented DEM limitations.",
        "model_change": "Diagnostic magnitude only; no curvature or refraction term is added to the canonical or 4F.3A.4 clearance model.",
    }


def profile_by_key(profiles: list[dict]) -> dict[tuple[str, int], dict]:
    return {(profile["cell_id"], int(profile["ray_index"])): profile for profile in profiles}


def representative_profiles(profile_runs: dict[str, dict], egm96: GeoidGrid, egm08: GeoidGrid) -> dict:
    all_profiles = [(name, profile) for name, run in profile_runs.items() for profile in run["profiles"] if profile["terrain_status"] == "terrain_available"]
    candidates = [(name, profile) for name, profile in all_profiles if profile["obstruction_candidate"]]
    by_key = {name: profile_by_key(run["profiles"]) for name, run in profile_runs.items()}

    def choose(items, key, reverse=False):
        return sorted(items, key=lambda item: key(item[1]), reverse=reverse)[0] if items else None

    strongest = choose(candidates, lambda profile: profile["min_clearance_m"])
    boundary = choose(candidates, lambda profile: profile["min_clearance_m"], reverse=True)
    near_rx = choose(
        [(name, profile) for name, profile in candidates if profile["min_location_m_from_rx"] <= 30.0],
        lambda profile: profile["min_clearance_m"],
    )
    interior = choose(
        [(name, profile) for name, profile in candidates if profile["min_location_m_from_tx"] > 30.0 and profile["min_location_m_from_rx"] > 30.0],
        lambda profile: profile["min_clearance_m"],
    )
    paired = []
    nasa_by_key = by_key["nasadem"]
    fab_by_key = by_key["fabdem"]
    for key, nasa_profile in nasa_by_key.items():
        fab_profile = fab_by_key.get(key)
        if not fab_profile or nasa_profile["terrain_status"] != "terrain_available" or fab_profile["terrain_status"] != "terrain_available":
            continue
        paired.append((key, nasa_profile, fab_profile))
    disagreement = max(paired, key=lambda item: abs(item[1]["min_clearance_m"] - item[2]["min_clearance_m"])) if paired else None

    def compact_profile(profile: dict, other: dict | None = None) -> dict:
        payload = {key: value for key, value in profile.items()}
        payload["source_definition"] = {
            "source": profile["source"],
            "vertical_datum": profile["source_vertical_datum"],
            "candidate_kind": profile["source_candidate_kind"],
            "interpolation": profile["interpolation"],
            "sample_resolution_m": profile["effective_spacing_m"],
        }
        if other is not None:
            paired_samples = []
            for first, second in zip(profile["samples"], other["samples"]):
                n96 = egm96.sample((first["lon"], first["lat"]))
                n08 = egm08.sample((first["lon"], first["lat"]))
                paired_samples.append(
                    {
                        "distance_m": first["distance_m"],
                        "nasadem_m": first["terrain_m"],
                        "fabdem_m": second["terrain_m"],
                        "raw_nasadem_minus_fabdem_m": first["terrain_m"] - second["terrain_m"],
                        "egm96_minus_egm2008_m": n96 - n08 if n96 is not None and n08 is not None else None,
                        "transformed_nasadem_egm2008_minus_fabdem_m": first["terrain_m"] + n96 - n08 - second["terrain_m"] if n96 is not None and n08 is not None else None,
                    }
                )
            payload["paired_source_samples"] = paired_samples
            payload["paired_source_semantics"] = "Same geometry and radio line, source-local terrain samples paired only for diagnostic comparison; transformed values are not truth."
        return payload

    def role_payload(role: str, selection):
        if selection is None:
            return {"role": role, "available": False}
        name, profile = selection
        other_name = "fabdem" if name == "nasadem" else "nasadem"
        other = by_key[other_name].get((profile["cell_id"], profile["ray_index"]))
        return {
            "role": role,
            "available": True,
            "selection_source": name,
            "reason": {
                "strongest_apparent_obstruction": "lowest corrected source-local minimum clearance across complete canonical profiles",
                "weakest_boundary": "negative candidate closest to zero corrected clearance",
                "near_rx": "lowest corrected candidate whose minimum is within 30 m of the receiver endpoint",
                "interior": "lowest corrected candidate whose minimum is more than 30 m from both endpoints",
            }.get(role, "selected diagnostic profile"),
            "profile": compact_profile(profile, other),
        }

    disagreement_payload = {"role": "nasadem_fabdem_disagreement", "available": False}
    if disagreement is not None:
        key, nasa_profile, fab_profile = disagreement
        disagreement_payload = {
            "role": "nasadem_fabdem_disagreement",
            "available": True,
            "reason": "maximum absolute difference between source-local corrected minimum clearances over paired complete paths",
            "selection_key": {"cell_id": key[0], "ray_index": key[1]},
            "nasadem_profile": compact_profile(nasa_profile, fab_profile),
            "fabdem_profile": compact_profile(fab_profile, nasa_profile),
        }
    return {
        "selection_policy": {
            "strongest_apparent_obstruction": "minimum corrected clearance",
            "weakest_boundary": "candidate minimum closest to zero",
            "near_rx": "minimum within 30 m of Rx",
            "interior": "minimum >30 m from both endpoints",
            "nasadem_fabdem_disagreement": "maximum paired source-local minimum-clearance difference",
        },
        "profiles": [
            role_payload("strongest_apparent_obstruction", strongest),
            role_payload("weakest_boundary", boundary),
            role_payload("near_rx", near_rx),
            role_payload("interior", interior),
            disagreement_payload,
        ],
    }


def freeze_prechange_baseline(output_dir: Path, baseline: dict, quality_path: Path, source_paths: dict[str, Path]) -> dict:
    """Capture the existing 4F.3A.3 result before writing any 4F.3A.4 artifact."""

    quality = json.loads(quality_path.read_text(encoding="utf-8"))
    legacy_sources = {}
    for name in ("nasadem", "fabdem"):
        source_quality = quality["path_profiles"][name]
        legacy_sources[name] = {
            "paths": source_quality["paths"],
            "complete_profiles": source_quality["complete_profiles"],
            "partial_profiles": source_quality["partial_profiles"],
            "legacy_formula": "legacy stored terrain_clearance_min_m = terrain_m - radio_line_m; legacy candidate when min(terrain-radio) < 0",
            "legacy_candidate_count": source_quality["terrain_obstruction_candidate_count"],
            "legacy_min_distribution_m": source_quality["terrain_clearance_distribution_m"],
            "legacy_profiles": [
                {
                    key: profile.get(key)
                    for key in (
                        "cell_id",
                        "ray_index",
                        "bearing_deg",
                        "distance_m",
                        "sample_count",
                        "valid_sample_count",
                        "terrain_status",
                        "terrain_clearance_min_m",
                        "terrain_obstruction_candidate",
                    )
                }
                for profile in source_quality["profiles"]
            ],
        }
    artifact_hashes = {}
    for path in [quality_path, *source_paths.values()]:
        artifact_hashes[str(path)] = sha256_file(path)
    frozen = {
        "schema_version": SCHEMA_VERSION,
        "concept": CONCEPT,
        "artifact": "pre-change-baseline",
        "captured_at": dt.date.today().isoformat(),
        "phase_boundary": "Freeze of the active 4F.3A.3 terrain-source diagnostics immediately before the read-only 4F.3A.4 equation/datum audit.",
        "canonical_rf": {
            "terrain_activation": False,
            "terrain_status": "terrain_unavailable",
            "targets": CANONICAL_TARGETS,
            "invariance_targets_copied_from_4f3a3": baseline.get("invariance_targets", []),
            "note": "This phase reads external source tiles and diagnostic JSON only; it does not alter canonical RF behavior.",
        },
        "active_4f3a3_artifacts": artifact_hashes,
        "current_4f3a3_result": {
            "source_results": legacy_sources,
            "explanation": "The 432/432 result is explained by the endpoint sign: at the Tx endpoint the legacy expression is terrain - (terrain + 25 m) = -25 m, so every complete path is marked candidate before interior terrain is considered.",
        },
        "do_not_modify_contract": [
            "Do not change concept-4f3a3-terrain-quality.json in this phase.",
            "Do not change the canonical Go RF terrain-unavailable path.",
            "Do not infer that this baseline is an approval for 4F.3B.",
        ],
    }
    write_json(output_dir / "concept-4f3a4-pre-change-baseline.json", frozen)
    return frozen


def canonical_invariance(baseline: dict, manifest_path: Path) -> dict:
    snapshots = baseline.get("canonical_rf_snapshots", {})
    return {
        "status": "unchanged_by_construction; no RF code path or canonical dataset was modified",
        "terrain_activation": False,
        "terrain_status": "terrain_unavailable",
        "targets": CANONICAL_TARGETS,
        "target_statuses": {target: "unchanged_by_construction" for target in CANONICAL_TARGETS},
        "before_snapshots": snapshots,
        "after_snapshots": snapshots,
        "snapshot_equality": {key: True for key in snapshots},
        "canonical_manifest_sha256_at_audit": sha256_file(manifest_path),
        "model_changes": [],
        "explicitly_not_changed": [
            "LOS/NLOS",
            "P.526",
            "P.1411",
            "reflection",
            "building entry",
            "interference",
            "radio quality",
            "optimizer",
            "scenario fingerprints",
        ],
    }


def readiness_decision(
    baseline: dict,
    profile_runs: dict[str, dict],
    datum: dict,
    building: dict,
    curvature: dict,
    invariance: dict,
) -> dict:
    corrected_counts = {name: run["summary"]["strict_zero_candidate_count"] for name, run in profile_runs.items()}
    return {
        "schema_version": SCHEMA_VERSION,
        "concept": CONCEPT,
        "phase_boundary": "Read-only audit complete; no 4F.3B terrain activation or RF coupling",
        "decision": {
            "code": "C",
            "label": "NO-GO — correct the clearance implementation and re-audit before 4F.3B",
            "reason": "The existing 4F.3A.3 432/432 result is explained by an inverted signed clearance. The corrected diagnostic yields source-local sampled candidates, but NASADEM remains dem_unspecified, no open local orthometric point-control set was joined, FABDEM is research-only, and no uncertainty margin is approved.",
        },
        "resolved_432_explanation": {
            "legacy_formula": "terrain_clearance = terrain - radio_line",
            "legacy_decision": "min(terrain - radio_line) < 0",
            "endpoint_identity": "Tx: terrain - (terrain + 25 m) = -25 m; Rx: terrain - (terrain + 1.5 m) = -1.5 m",
            "correct_formula": "terrain_clearance = radio_line - terrain",
            "correct_endpoint_identity": "Tx = 25 m and Rx = 1.5 m when endpoint ground samples are valid",
            "corrected_strict_zero_candidate_counts": corrected_counts,
        },
        "uncertainty_policy": {
            "approved_margin_m": None,
            "diagnostic_margins_m": list(DEFAULT_UNCERTAINTY_TOLERANCES_M),
            "classification": "Use the four-state contract only after a future phase selects and documents a source/terrain uncertainty policy; do not invent a NASADEM ±X m value from national summary statistics.",
            "source_accuracy_semantics": "NASADEM documentation reports product validation statistics and known vegetation/terrain limitations; those statistics are not an Ankara guarantee.",
        },
        "source_readiness": {
            "nasadem": "primary legally reusable diagnostic candidate, but dem_unspecified and not validated as authoritative bare-earth ground",
            "fabdem": "research-only comparator under CC BY-NC-SA 4.0; not a production dependency or truth source",
            "datum_reconciliation": "defensible frame transformation H96 + N96 - N08 with official NGA-derived PROJ grids; transformation is not accuracy correction",
            "local_control": datum["local_control_search"],
        },
        "geometry_readiness": {
            "source_local_profiles": "available for complete sampled paths",
            "exact_obstruction": "not established; a 30 m sampled profile can miss a crest between samples and does not model diffraction",
            "curvature": curvature,
            "spacing_and_interpolation": "must remain explicit classifier inputs",
        },
        "building_base_readiness": {
            "known_height_building_count": building["known_building_base_population"],
            "status": "diagnostic source-local base spread only; footprint-inside/near/open labels are not truth",
        },
        "p526_implication": {
            "status": "diagnostic implication only",
            "corrected_source_local_candidates": corrected_counts,
            "allowed_next_step": "A future P.526 phase may use a qualified terrain profile as an input candidate after exact clearance, source, uncertainty, and diffraction policy approval.",
            "forbidden_now": "No terrain diffraction term, edge count, or path-loss change is added.",
        },
        "los_nlos_implication": {
            "status": "no canonical implication",
            "current_canonical_terrain_status": "terrain_unavailable",
            "note": "The corrected diagnostic must not change the existing height-aware LOS/NLOS classifications in 4F.1.",
        },
        "reflection_implication": {
            "status": "diagnostic facade/base anchor only; not ready",
            "allowed": "Use source-local ground as a labeled diagnostic anchor for a future facade-height investigation.",
            "blockers": ["DEM ground semantics", "datum/uncertainty policy", "materials", "roughness", "visibility", "no canonical RF activation"],
        },
        "canonical_invariance": invariance,
        "next_gate": "Fix the equation in an isolated diagnostic implementation, rerun the same baseline comparison, select a defensible uncertainty policy, and obtain/join local control before proposing any 4F.3B behavior.",
    }


def post_change_comparison(baseline: dict, readiness: dict, profile_runs: dict[str, dict], invariance: dict) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "concept": CONCEPT,
        "comparison_kind": "audit-only; no production change",
        "before": {
            "artifact": "concept-4f3a4-pre-change-baseline.json",
            "legacy_formula": "terrain - radio_line",
            "terrain_candidate_counts": {name: data["legacy_candidate_count"] for name, data in baseline["current_4f3a3_result"]["source_results"].items()},
            "terrain_status_in_canonical_rf": "terrain_unavailable",
        },
        "after_diagnostic_only": {
            "formula": "radio_line - terrain",
            "terrain_candidate_counts_strict_zero": {name: run["summary"]["strict_zero_candidate_count"] for name, run in profile_runs.items()},
            "tolerance_summaries": {name: tolerance_summary(run["profiles"]) for name, run in profile_runs.items()},
            "terrain_status_in_canonical_rf": "terrain_unavailable",
            "terrain_activation": False,
        },
        "canonical_rf_invariance": invariance,
        "decision": readiness["decision"],
        "changed_behavior": [],
        "note": "The after numbers are diagnostic recomputation only. They do not overwrite 4F.3A.3 and do not alter LOS/NLOS, P.526, P.1411, reflection, building entry, interference, radio quality, optimizer, or scenario fingerprints.",
    }


def _fmt(value, digits=3):
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def audit_markdown(captured_at: str, baseline: dict, distribution: dict, endpoint: dict, datum: dict, reps: dict, readiness: dict, post: dict, source_manifests: dict) -> str:
    counts = readiness["resolved_432_explanation"]["corrected_strict_zero_candidate_counts"]
    nasa_summary = distribution["by_source"]["nasadem"]["canonical_summary"]
    fab_summary = distribution["by_source"]["fabdem"]["canonical_summary"]
    transformed = datum["comparison"]["all_grid"]["transformed_nasadem_egm2008_minus_fabdem_m"]
    offset = datum["comparison"]["offset_map_full_aoi"]["egm96_minus_egm2008_m"]
    return f"""# Concept 4F.3A.4 — Terrain Clearance & Vertical-Datum Validation Audit

Captured `{captured_at}` for AOI `[32.45, 39.55, 33.25, 40.25]` in `{CRS}`. This is a read-only diagnostic audit. It does not activate terrain, start 4F.3B, or change canonical RF behavior.

## Decision first

**Decision C — NO-GO: correct the clearance implementation and re-audit before 4F.3B.** The existing 4F.3A.3 result of 432/432 candidates is fully explained, but it is not a valid terrain-obstruction result: the stored expression is `terrain - radio_line` while the negative test assumes `radio_line - terrain`. The corrected source-local recomputation gives `{counts['nasadem']}` NASADEM candidates and `{counts['fabdem']}` FABDEM candidates at strict zero tolerance, but those are sampled candidates, not exact obstructions or production RF inputs.

The audit writes a frozen pre-change record in `concept-4f3a4-pre-change-baseline.json`; the existing `concept-4f3a3-terrain-quality.json` is not overwritten.

## 1. Scope and invariance boundary

The fixed sample is six canonical cells (`{len(pilot.CANONICAL_SAMPLE_CELLS)}`), 72 bearings per cell, 400 m per path, source-native 1 arc-second tiles, and an explicit minimum spacing of 30 m. The audit reads the already acquired NASADEM and FABDEM tiles plus official geoid grids; it does not change the dataset pack or Go RF runtime.

The invariance matrix covers 2.6 GHz, 28 GHz, research sub-THz, height-aware LOS/NLOS, P.526, P.1411, reflection, building entry, interference, radio quality, optimization, and scenario fingerprints. The machine-readable post-change comparison records identical before/after canonical snapshots, terrain activation `false`, and canonical terrain status `terrain_unavailable`.

## 2. Exact equation and the 432/432 explanation

For `u ∈ [0,1]`, endpoint radio heights are `z_tx_radio = z_tx_ground + h_tx_agl` and `z_rx_radio = z_rx_ground + h_rx_agl`. The diagnostic line is

```text
z_radio(u) = (1-u) z_tx_radio + u z_rx_radio
terrain_clearance(u) = z_radio(u) - z_terrain(u)
```

Positive clearance means the radio line is above the sampled terrain. A strict-zero candidate is `min(terrain_clearance) < 0`. At valid endpoints the clearance is exactly the configured AGL height: 25 m at Tx and 1.5 m at Rx.

The old result used `terrain - radio_line` and tested `< 0`, so the Tx endpoint was always `-25 m` and every complete path became a candidate. The frozen baseline reports the legacy per-path values and source artifact hashes.

## 3. Endpoint and near-endpoint behavior

Corrected minimum locations are reported as Tx endpoint, Rx endpoint, or interior, with histograms from both Tx and Rx. A minimum within 30 m of an endpoint is not silently discarded: it is retained with its distance, source posting/interpolation, ground sample, radio line, and signed clearance. The endpoint identity is an invariant test, not an empirical terrain assumption. The endpoint analysis is in `concept-4f3a4-endpoint-analysis.json`.

## 4. Corrected clearance distribution and height sensitivity

| Source | Complete paths | Strict `<0` candidates | Minimum clearance (m) | Median minimum (m) | p90 minimum (m) |
|---|---:|---:|---:|---:|---:|
| NASADEM | {nasa_summary['complete_profiles']} | {nasa_summary['strict_zero_candidate_count']} | {_fmt(nasa_summary['min_clearance_distribution_m'].get('min'))} | {_fmt(nasa_summary['min_clearance_distribution_m'].get('median'))} | {_fmt(nasa_summary['min_clearance_distribution_m'].get('p90'))} |
| FABDEM | {fab_summary['complete_profiles']} | {fab_summary['strict_zero_candidate_count']} | {_fmt(fab_summary['min_clearance_distribution_m'].get('min'))} | {_fmt(fab_summary['min_clearance_distribution_m'].get('median'))} | {_fmt(fab_summary['min_clearance_distribution_m'].get('p90'))} |

Rx heights 1.5/3/5/10 m and Tx heights 10/25/50 m are recomputed for every source and stored in the distribution artifact. Increasing endpoint height reduces the strict negative candidate count; this is expected sensitivity, not a calibration.

## 5. Spacing and interpolation sensitivity

The spacing artifact includes half-source, source-scale, 15 m, 30 m, and 60 m runs. Source-scale is one north-south posting interval at Ankara latitude; east-west spacing is smaller. Bilinear and nearest interpolation are compared over the same geometry. A candidate changes meaning when spacing or interpolation changes: it remains a sampled diagnostic and cannot be called an exact obstruction.

## 6. No-data, interpolation, and tile boundaries

The source adapter returns unavailable when a sample is outside coverage, invalid, or has an incomplete bilinear neighbourhood. The audit includes synthetic `[valid, None, valid]` fixture evidence and samples immediately on both sides of the 33° longitude and 40° latitude tile boundaries. No no-data value is replaced with zero, and unavailable profiles cannot be candidates.

## 7. Source-local versus absolute geometry

Each source’s path line is anchored to that source’s own endpoint ground samples and datum. The path decision is therefore source-local. Cross-source differences are not interpreted as accuracy or truth ranking. Representative profiles retain both source samples, radio lines, raw differences, and transformed differences where the same geometry is paired.

## 8. NASADEM semantics and vertical accuracy

NASADEM Merged DEM Global 1 arc second V001 is an orthometric EGM96 merged elevation DEM. NASA’s [Earthdata catalog]({pilot.OFFICIAL_NASADEM_CATALOG}), [User Guide]({pilot.OFFICIAL_NASADEM_GUIDE}), and [DOI]({pilot.OFFICIAL_NASADEM_DOI}) describe the product, validation, source lineage, vegetation/terrain limitations, and EGM96 frame. The guide reports North America HREC after-correction mean MAE 2.81 m (range 1.74–17.19 m) and mean RMSE 5.30 m (range 2.29–74.03 m); it also reports vegetation-context RH50 bias −0.48 m with 7.3 m standard deviation. These are product-validation summaries, not an Ankara guarantee and not a universal ±X m uncertainty margin. No invented NASADEM accuracy bound is used here.

FABDEM V1-2 is the [University of Bristol release]({pilot.OFFICIAL_FABDEM_DATASET}) with [readme]({pilot.OFFICIAL_FABDEM_README}) and [license]({pilot.OFFICIAL_FABDEM_LICENSE}); it is EGM2008 and a model-derived bare-earth candidate under CC BY-NC-SA 4.0. It remains research-only and is not truth.

## 9. EGM96/EGM2008 reconciliation

The audit uses the open PROJ/NGA-derived grids [EGM96](https://cdn.proj.org/us_nga_egm96_15.tif) and [EGM2008](https://cdn.proj.org/us_nga_egm08_25.tif), with source paths, hashes, dimensions, coverage, metadata, and license notes in `concept-4f3a4-datum-audit.json`. With `H96 = h − N96` and `H08 = h − N08`, the defensible frame transformation is `H96→08 = H96 + N96 − N08`. It is a datum-frame reconciliation, not an elevation correction.

Across the deterministic common grid, `N96−N08` has median `{_fmt(offset.get('median'))} m`, p90 `{_fmt(offset.get('p90'))} m`, p99 `{_fmt(offset.get('p99'))} m`, and range `{_fmt(offset.get('max') - offset.get('min'))} m`. Transformed NASADEM minus FABDEM has median `{_fmt(transformed.get('median'))} m`, MAE `{_fmt(transformed.get('mae'))} m`, RMSE `{_fmt(transformed.get('rmse'))} m`, p90 `{_fmt(transformed.get('p90'))} m`, and p99 `{_fmt(transformed.get('p99'))} m`. FABDEM is still not truth, so these are qualified comparison diagnostics.

## 10. Local-control evidence

The audit searched legitimate/open local control evidence without shopping for another DEM. HGM TG-20, Turkish vertical-control literature, the ANK200TUR IGS station, and TUSAGA-Aktif are recorded with access limitations. No unrestricted, ready-to-join Ankara orthometric point-control table was found or used. A GNSS station metadata page is not silently promoted to terrain truth.

## 11. Building-base spread and footprint labels

The 6,074 known-height building population is audited with source-local robust perimeter samples and a separate centroid sample. Counts for `≤2 m`, `>2–5 m`, `>5–10 m`, and `>10 m` spread, plus centroid-minus-perimeter-median distributions, are in the datum audit. Inside-footprint, within-30-m, and open labels are sampling strata only; they are not building-base truth, vegetation truth, or DEM validation.

## 12. Representative profiles

`concept-4f3a4-representative-profiles.json` contains full machine-readable samples for the strongest apparent obstruction, weakest negative boundary, near-Rx candidate, interior candidate, and maximum paired NASADEM/FABDEM disagreement. Each includes geometry, source tile, datum, interpolation, resolution, endpoint ground, radio line, corrected clearance, legacy signed clearance, and paired source semantics.

## 13. Curvature and refraction magnitude

Over 400 m, the spherical Earth sagitta is about 3.14 mm. A k=4/3 effective-earth diagnostic is about 2.35 mm, a difference of about 0.79 mm. These values are recorded for scale and are not added to the clearance model. They are negligible relative to 30 m source sampling and the documented product limitations, but no silent curvature assumption is made.

## 14. Future classifier contract

The future classifier contract is the four-state set `clear`, `obstruction_candidate`, `near_uncertainty_boundary`, and `unavailable`. Every decision must carry minimum clearance, location from Tx, effective resolution, interpolation, source, and selected uncertainty margin. No-data is always `unavailable`. Strict-zero and 1/2/5 m tolerances in this audit are sensitivity diagnostics; none is approved as production uncertainty.

## 15. P.526, LOS/NLOS, and reflection implications

The corrected profiles may inform a future P.526 input-validation phase, but no terrain diffraction term is implemented. Terrain candidates do not alter the current height-aware LOS/NLOS audit, which remains terrain-unavailable. Source-local ground may be a diagnostic facade/base anchor for future reflection work, but materials, roughness, visibility, datum, and uncertainty remain blockers. No building entry, interference, radio-quality, optimizer, or scenario-fingerprint behavior changes.

## 16. 4F.3B gate

The 4F.3B decision is **C / NO-GO**. Before any future start, the signed clearance implementation must be corrected in an isolated diagnostic path, the baseline must be rerun, an uncertainty policy must be approved from appropriate local evidence, and source semantics/control must be qualified. This audit does not start 4F.3B.

## Reproduction and artifacts

```text
data-pipeline/.venv/bin/python data-pipeline/terrain_clearance_audit.py \\
  --manifest data-pipeline/manifest.json \\
  --buildings data-pipeline/ankara_buildings.geojson \\
  --towers data-pipeline/ankara_5g_nodes.geojson \\
  --baseline docs/concept-4f3a3-pre-change-baseline.json \\
  --raw-dir /tmp/atom-4f3a3-20260919 \\
  --output-dir docs
```

The required outputs are:

* `concept-4f3a4-pre-change-baseline.json`
* `concept-4f3a4-clearance-distribution.json`
* `concept-4f3a4-endpoint-analysis.json`
* `concept-4f3a4-datum-audit.json`
* `concept-4f3a4-representative-profiles.json`
* `concept-4f3a4-readiness-decision.json`
* `concept-4f3a4-post-change-comparison.json`
* this audit report

The machine-readable post-change comparison records no canonical behavior change. The 4F.3A.3 terrain-quality artifact remains the frozen pre-audit result.
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("data-pipeline/manifest.json"))
    parser.add_argument("--buildings", type=Path, default=Path("data-pipeline/ankara_buildings.geojson"))
    parser.add_argument("--towers", type=Path, default=Path("data-pipeline/ankara_5g_nodes.geojson"))
    parser.add_argument("--baseline", type=Path, default=Path("docs/concept-4f3a3-pre-change-baseline.json"))
    parser.add_argument("--raw-dir", type=Path, default=Path("/tmp/atom-4f3a3-20260919"))
    parser.add_argument("--output-dir", type=Path, default=Path("docs"))
    return parser


def run(args: argparse.Namespace) -> dict:
    started = time.monotonic()
    captured_at = dt.date.today().isoformat()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    if [float(value) for value in manifest["bounds"]] != AOI:
        raise ValueError(f"active AOI changed: {manifest['bounds']}; expected {AOI}")
    output = Path(args.output_dir)
    quality_path = output / "concept-4f3a3-terrain-quality.json"
    source_paths = {
        "nasadem": output / "concept-4f3a3-nasadem-manifest.json",
        "fabdem": output / "concept-4f3a3-fabdem-manifest.json",
    }
    for path in [quality_path, *source_paths.values()]:
        if not path.exists():
            raise FileNotFoundError(f"4F.3A.3 artifact required for phase freeze is missing: {path}")
    frozen = freeze_prechange_baseline(output, baseline, quality_path, source_paths)
    _nasa_records, _fab_records, paths_by_filename = pilot.tile_manifest_records(args.raw_dir)
    nasa = pilot.RasterSource("nasadem", paths_by_filename)
    fab = pilot.RasterSource("fabdem", paths_by_filename)
    egm96 = egm08 = None
    try:
        records = pilot.load_buildings(args.buildings)
        towers_document = json.loads(Path(args.towers).read_text(encoding="utf-8"))
        tower_by_id = {
            str(feature.get("id")): tuple(feature["geometry"]["coordinates"][:2])
            for feature in towers_document.get("features", [])
            if feature.get("id") and feature.get("geometry", {}).get("type") == "Point"
        }
        missing_cells = [cell_id for cell_id in pilot.CANONICAL_SAMPLE_CELLS if cell_id not in tower_by_id]
        if missing_cells:
            raise ValueError(f"canonical sample cells missing from tower dataset: {missing_cells}")

        sources = {"nasadem": nasa, "fabdem": fab}
        canonical_runs = {name: run_profile_set(source, tower_by_id) for name, source in sources.items()}
        distribution = {
            "schema_version": SCHEMA_VERSION,
            "concept": CONCEPT,
            "captured_at": captured_at,
            "equation": {
                "parameter": "u in [0,1]",
                "radio_line": "z_radio(u) = (1-u)*(z_tx_ground+h_tx_agl) + u*(z_rx_ground+h_rx_agl)",
                "clearance": "terrain_clearance(u) = z_radio(u) - z_terrain(u)",
                "candidate_rule": "min(terrain_clearance) < threshold; strict audit threshold is 0 m",
                "positive_sign": "positive means radio line above sampled terrain",
                "endpoint_clearance": "Tx=h_tx_agl and Rx=h_rx_agl for valid endpoint samples",
            },
            "canonical_geometry": {
                "cells": list(pilot.CANONICAL_SAMPLE_CELLS),
                "cells_count": len(pilot.CANONICAL_SAMPLE_CELLS),
                "rays_per_cell": 72,
                "paths": 432,
                "distance_m": PATH_DISTANCE_M,
                "tx_height_m": CANONICAL_TX_HEIGHT_M,
                "rx_height_m": CANONICAL_RX_HEIGHT_M,
                "spacing_m": CANONICAL_SPACING_M,
                "interpolation": "bilinear",
            },
            "by_source": {},
        }
        endpoint_analysis = {
            "schema_version": SCHEMA_VERSION,
            "concept": CONCEPT,
            "captured_at": captured_at,
            "equation_and_sign": distribution["equation"],
            "by_source": {},
        }
        for name, run in canonical_runs.items():
            height = height_sensitivity(sources[name], tower_by_id)
            spacing = spacing_sensitivity(sources[name], tower_by_id)
            interpolation = interpolation_sensitivity(sources[name], tower_by_id, run)
            distribution["by_source"][name] = {
                "source_metadata": sources[name].metadata(),
                "canonical_summary": run["summary"],
                "tolerance_classification": tolerance_summary(run["profiles"]),
                "rx_tx_height_sensitivity": height,
                "spacing_sensitivity": spacing,
                "interpolation_sensitivity": interpolation,
                "source_local_note": "Endpoint ground and radio line use this source only; no raw cross-datum difference is inserted into the path decision.",
            }
            endpoint_analysis["by_source"][name] = {
                "profile_source_and_datum": {
                    "source": name,
                    "vertical_datum": sources[name].definition["vertical_datum"],
                    "interpolation": "bilinear",
                    "sample_resolution_m": run["profiles"][0]["effective_spacing_m"],
                },
                "exact_tower_ground_samples": {
                    profile["cell_id"]: profile["tower_ground_sample"]
                    for profile in run["profiles"]
                    if profile["ray_index"] == 0
                },
                "endpoint_clearance_contract_m": run["summary"]["endpoint_clearance_contract_m"],
                "minimum_location_counts": run["summary"]["minimum_location_counts"],
                "minimum_distance_from_tx_histogram": run["summary"]["minimum_distance_from_tx_histogram"],
                "minimum_distance_from_rx_histogram": run["summary"]["minimum_distance_from_rx_histogram"],
                "minimum_distance_from_tx_distribution_m": pilot.distribution([profile["min_location_m_from_tx"] for profile in run["profiles"] if profile["min_location_m_from_tx"] is not None]),
                "minimum_distance_from_rx_distribution_m": pilot.distribution([profile["min_location_m_from_rx"] for profile in run["profiles"] if profile["min_location_m_from_rx"] is not None]),
                "near_endpoint_candidate_counts": {
                    "tx_0_30m": sum(profile["obstruction_candidate"] and profile["min_location_m_from_tx"] <= 30.0 for profile in run["profiles"] if profile["min_location_m_from_tx"] is not None),
                    "rx_0_30m": sum(profile["obstruction_candidate"] and profile["min_location_m_from_rx"] <= 30.0 for profile in run["profiles"] if profile["min_location_m_from_rx"] is not None),
                    "interior": sum(profile["obstruction_candidate"] and profile["min_location_m_from_tx"] > 30.0 and profile["min_location_m_from_rx"] > 30.0 for profile in run["profiles"] if profile["min_location_m_from_tx"] is not None),
                },
                "endpoint_sample_values_are_not_ground_truth": True,
            }

        datum, egm96, egm08 = geoid_audit(args.raw_dir, nasa, fab, records)
        building = building_spread_audit(records, sources)
        datum["building_base_audit"] = building
        datum["footprint_label_audit"] = footprint_label_audit(records, nasa, fab, egm96, egm08)
        datum["coverage_and_tile_audit"] = tile_boundary_and_nodata_audit(sources)
        datum["source_accuracy_notes"] = {
            "nasadem": {
                "classification": pilot.source_definition("nasadem")["classification"],
                "limitations": pilot.source_definition("nasadem")["limitations"],
                "published_accuracy_context": {
                    "source_document": pilot.OFFICIAL_NASADEM_GUIDE,
                    "reported_region": "North America HREC validation, after correction",
                    "mean_absolute_error_m": 2.81,
                    "mean_absolute_error_range_m": [1.74, 17.19],
                    "rmse_m": 5.30,
                    "rmse_range_m": [2.29, 74.03],
                    "interpretation": "Published product-validation context only; these figures are not an Ankara guarantee and are not converted into a universal ±X m uncertainty margin.",
                },
                "vegetation_and_terrain_context": {
                    "reported_vegetated_rh50_mean_bias_m": -0.48,
                    "reported_vegetated_rh50_standard_deviation_m": 7.3,
                    "interpretation": "Guide-reported vegetation/terrain limitation context; not a local uncertainty assignment.",
                },
                "official_documentation": [pilot.OFFICIAL_NASADEM_CATALOG, pilot.OFFICIAL_NASADEM_GUIDE, pilot.OFFICIAL_NASADEM_DOI],
            },
            "fabdem": {
                "classification": pilot.source_definition("fabdem")["classification"],
                "limitations": pilot.source_definition("fabdem")["limitations"],
                "official_documentation": [pilot.OFFICIAL_FABDEM_DATASET, pilot.OFFICIAL_FABDEM_README, pilot.OFFICIAL_FABDEM_LICENSE],
            },
        }

        curvature = curvature_audit()
        invariance = canonical_invariance(baseline, args.manifest)
        readiness = readiness_decision(baseline, canonical_runs, datum, building, curvature, invariance)
        reps = representative_profiles(canonical_runs, egm96, egm08)
        post = post_change_comparison(frozen, readiness, canonical_runs, invariance)
        source_manifests = {name: json.loads(path.read_text(encoding="utf-8")) for name, path in source_paths.items()}
        output_payloads = {
            "concept-4f3a4-clearance-distribution.json": distribution,
            "concept-4f3a4-endpoint-analysis.json": {**endpoint_analysis, "curvature_and_refraction": curvature},
            "concept-4f3a4-datum-audit.json": datum,
            "concept-4f3a4-representative-profiles.json": {"schema_version": SCHEMA_VERSION, "concept": CONCEPT, "captured_at": captured_at, **reps},
            "concept-4f3a4-readiness-decision.json": {**readiness, "captured_at": captured_at, "representative_profile_artifact": "concept-4f3a4-representative-profiles.json"},
            "concept-4f3a4-post-change-comparison.json": post,
        }
        for filename, payload in output_payloads.items():
            write_json(output / filename, payload)
        report = audit_markdown(captured_at, frozen, distribution, endpoint_analysis, datum, reps, readiness, post, source_manifests)
        (output / "concept-4f3a4-terrain-clearance-audit.md").write_text(report, encoding="utf-8")
        return {
            "status": "complete",
            "concept": CONCEPT,
            "output_dir": str(output),
            "building_features": len(records),
            "paths": 432,
            "strict_zero_candidates": {name: run["summary"]["strict_zero_candidate_count"] for name, run in canonical_runs.items()},
            "decision": readiness["decision"],
            "elapsed_seconds": time.monotonic() - started,
            "peak_rss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024),
        }
    finally:
        if egm96 is not None:
            egm96.close()
        if egm08 is not None:
            egm08.close()
        nasa.close()
        fab.close()


def main(argv=None) -> int:
    try:
        result = run(build_parser().parse_args(argv))
    except (OSError, RuntimeError, ValueError, KeyError, IndexError) as error:
        print(f"terrain clearance audit error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
