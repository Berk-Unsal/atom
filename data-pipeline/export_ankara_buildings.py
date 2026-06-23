#!/usr/bin/env python3
"""Download Ankara building footprints from OSM and export static GeoJSON.

This is a one-time/offline data preparation step. The Go backend only reads the
generated ankara_buildings.geojson file and never calls OSM at runtime.
"""

from __future__ import annotations

import argparse
import math
import inspect
import re
from pathlib import Path

import osmnx as ox
import geopandas as gpd
import pandas as pd


MIN_LON = 32.55
MIN_LAT = 39.75
MAX_LON = 33.00
MAX_LAT = 40.05

DEMAND_AMENITIES = {
    "cafe": 50,
    "hospital": 70,
    "university": 65,
    "clinic": 50,
    "school": 50,
    "restaurant": 50,
}
DEMAND_SHOPS = {
    "mall": 100,
    "supermarket": 80,
    "department_store": 100,
}
DEMAND_BUILDING_TYPES = {
    "commercial": 45,
    "retail": 40,
    "office": 35,
    "school": 45,
    "university": 60,
    "hospital": 70,
    "dormitory": 30,
    "public": 20,
}
NAME_KEYWORDS = {
    "avm": 100,
    "alışveriş": 90,
    "alisveris": 90,
    "mall": 100,
    "hastane": 70,
    "hospital": 70,
    "üniversite": 65,
    "universite": 65,
    "university": 65,
    "okul": 50,
    "school": 50,
    "tower": 45,
    "plaza": 45,
}
MISSING_TAG_VALUES = {"", "no", "none", "nan", "null", "<na>", "n/a", "na"}


def fetch_buildings():
    tags = {"building": True}
    signature = inspect.signature(ox.features_from_bbox)
    parameters = list(signature.parameters)

    if parameters and parameters[0] == "bbox":
        bbox = (MIN_LON, MIN_LAT, MAX_LON, MAX_LAT)
        return ox.features_from_bbox(bbox, tags)

    return ox.features_from_bbox(MAX_LAT, MIN_LAT, MAX_LON, MIN_LON, tags)


def ensure_column(frame, column: str, default=pd.NA):
    if column not in frame.columns:
        frame[column] = default


def clean_tag(value) -> str:
    if pd.isna(value):
        return ""
    cleaned = str(value).strip().lower()
    if cleaned in MISSING_TAG_VALUES:
        return ""
    return cleaned


def parse_levels(value) -> float | None:
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    match = re.search(r"\d+(?:\.\d+)?", str(value))
    if not match:
        return None
    return float(match.group(0))


def geometry_area_demand(area_m2) -> float:
    if pd.isna(area_m2):
        return 0.0
    if area_m2 >= 20_000:
        return 30.0
    if area_m2 >= 10_000:
        return 20.0
    if area_m2 >= 5_000:
        return 10.0
    return 0.0


def calculate_building_weight(row) -> float:
    weight = 1.0

    levels = parse_levels(row.get("building:levels"))
    if levels is not None:
        weight += levels * 2

    building = clean_tag(row.get("building"))
    if building in {"residential", "apartments"}:
        weight += 5
    if building == "commercial" or clean_tag(row.get("office")) != "":
        weight += 20

    amenity = clean_tag(row.get("amenity"))
    if amenity in DEMAND_AMENITIES:
        weight += 50

    shop = clean_tag(row.get("shop"))
    if shop in DEMAND_SHOPS:
        weight += 100

    return round(weight, 2)


def calculate_demand_profile(row) -> pd.Series:
    demand_weight = 0.0
    reasons: list[str] = []
    confidence_rank = 0

    def add(score: float, reason: str, confidence: int) -> None:
        nonlocal demand_weight, confidence_rank
        if score <= 0:
            return
        demand_weight += score
        reasons.append(reason)
        confidence_rank = max(confidence_rank, confidence)

    building = clean_tag(row.get("building"))
    amenity = clean_tag(row.get("amenity"))
    shop = clean_tag(row.get("shop"))
    office = clean_tag(row.get("office"))
    name = clean_tag(row.get("name"))
    levels = parse_levels(row.get("building:levels"))

    if shop in DEMAND_SHOPS:
        add(DEMAND_SHOPS[shop], f"shop:{shop}", 3)
    if amenity in DEMAND_AMENITIES:
        add(DEMAND_AMENITIES[amenity], f"amenity:{amenity}", 3)
    if office != "":
        add(35, f"office:{office}", 3)
    if building in DEMAND_BUILDING_TYPES:
        add(DEMAND_BUILDING_TYPES[building], f"building:{building}", 3)

    if levels is not None and levels >= 8:
        add(min(levels * 1.5, 80), f"levels:{levels:g}", 2)

    for keyword, score in NAME_KEYWORDS.items():
        if keyword in name:
            add(score, f"name:{keyword}", 2)
            break

    area_score = geometry_area_demand(row.get("area_m2"))
    if area_score > 0:
        add(area_score, f"large_footprint:{float(row.get('area_m2')):.0f}m2", 1)

    confidence = {
        0: "none",
        1: "low",
        2: "medium",
        3: "high",
    }[confidence_rank]

    return pd.Series(
        {
            "demand_weight": round(demand_weight, 2),
            "weight_reason": "|".join(reasons) if reasons else "generic",
            "weight_confidence": confidence,
        }
    )


def print_export_summary(buildings) -> None:
    total = len(buildings)
    if total == 0:
        print("Demand summary: no building footprints exported")
        return

    demand = pd.to_numeric(buildings["demand_weight"], errors="coerce").fillna(0)
    weighted = int((demand > 0).sum())
    confidence_counts = buildings["weight_confidence"].value_counts().to_dict()
    tag_columns = ["building:levels", "height", "amenity", "shop", "office", "name"]
    print("Demand summary")
    print(f"  buildings: {total}")
    print(f"  demand_weight > 0: {weighted} ({weighted / total * 100:.2f}%)")
    print(f"  demand_weight avg/max: {demand.mean():.2f}/{demand.max():.2f}")
    print(f"  confidence: {confidence_counts}")
    for column in tag_columns:
        if column in buildings.columns:
            present = int(buildings[column].notna().sum())
            print(f"  {column}: {present} ({present / total * 100:.2f}%)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Ankara OSM building footprints as GeoJSON.")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).with_name("ankara_buildings.geojson")),
        help="Output GeoJSON path.",
    )
    parser.add_argument(
        "--offline-input",
        help="Read an existing building GeoJSON and enrich it locally instead of fetching from OSM.",
    )
    parser.add_argument(
        "--simplify-tolerance",
        type=float,
        default=0.0,
        help="Optional geometry simplification tolerance in degrees. Leave 0 for original footprints.",
    )
    args = parser.parse_args()

    if args.offline_input:
        buildings = gpd.read_file(args.offline_input)
    else:
        ox.settings.use_cache = True
        ox.settings.log_console = True
        buildings = fetch_buildings()

    if buildings.empty:
        raise RuntimeError("OSM returned no building features for the Ankara bounding box.")

    buildings = buildings.reset_index()
    ensure_column(buildings, "building")
    buildings = buildings[buildings["building"].notna()]
    buildings = buildings[buildings.geometry.notna()]
    buildings = buildings[buildings.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    buildings = buildings.to_crs("EPSG:4326")

    if args.simplify_tolerance > 0:
        buildings["geometry"] = buildings.geometry.simplify(
            args.simplify_tolerance,
            preserve_topology=True,
        )

    demand_columns = ["building", "building:levels", "amenity", "shop", "office", "name", "height"]
    for column in demand_columns:
        ensure_column(buildings, column)

    area_m2 = buildings.to_crs("EPSG:3857").geometry.area
    buildings["area_m2"] = area_m2.where(area_m2.apply(math.isfinite), 0)
    buildings["weight"] = buildings.apply(calculate_building_weight, axis=1)
    buildings[["demand_weight", "weight_reason", "weight_confidence"]] = buildings.apply(
        calculate_demand_profile,
        axis=1,
    )

    keep_columns = [
        column
        for column in [
            "osmid",
            "building",
            "name",
            "amenity",
            "shop",
            "office",
            "height",
            "building:levels",
            "weight",
            "demand_weight",
            "weight_reason",
            "weight_confidence",
            "area_m2",
            "geometry",
        ]
        if column in buildings.columns
    ]
    buildings = buildings[keep_columns]
    tag_columns = {"building", "name", "amenity", "shop", "office", "height", "building:levels"}
    for column in tag_columns.intersection(buildings.columns):
        buildings[column] = buildings[column].apply(lambda value: None if clean_tag(value) == "" else value)
    for column in keep_columns:
        if column != "geometry":
            buildings[column] = buildings[column].astype(object).where(pd.notna(buildings[column]), None)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    buildings.to_file(output_path, driver="GeoJSON")
    print(f"Wrote {len(buildings)} building footprints to {output_path}")
    print_export_summary(buildings)


if __name__ == "__main__":
    main()
