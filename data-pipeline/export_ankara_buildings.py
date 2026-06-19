#!/usr/bin/env python3
"""Download Ankara building footprints from OSM and export static GeoJSON.

This is a one-time/offline data preparation step. The Go backend only reads the
generated ankara_buildings.geojson file and never calls OSM at runtime.
"""

from __future__ import annotations

import argparse
import inspect
from pathlib import Path

import osmnx as ox


MIN_LON = 32.55
MIN_LAT = 39.75
MAX_LON = 33.00
MAX_LAT = 40.05


def fetch_buildings():
    tags = {"building": True}
    signature = inspect.signature(ox.features_from_bbox)
    parameters = list(signature.parameters)

    if parameters and parameters[0] == "bbox":
        bbox = (MIN_LON, MIN_LAT, MAX_LON, MAX_LAT)
        return ox.features_from_bbox(bbox, tags)

    return ox.features_from_bbox(MAX_LAT, MIN_LAT, MAX_LON, MIN_LON, tags)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Ankara OSM building footprints as GeoJSON.")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).with_name("ankara_buildings.geojson")),
        help="Output GeoJSON path.",
    )
    parser.add_argument(
        "--simplify-tolerance",
        type=float,
        default=0.0,
        help="Optional geometry simplification tolerance in degrees. Leave 0 for original footprints.",
    )
    args = parser.parse_args()

    ox.settings.use_cache = True
    ox.settings.log_console = True

    buildings = fetch_buildings()
    if buildings.empty:
        raise RuntimeError("OSM returned no building features for the Ankara bounding box.")

    buildings = buildings.reset_index()
    buildings = buildings[buildings.geometry.notna()]
    buildings = buildings[buildings.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    buildings = buildings.to_crs("EPSG:4326")

    if args.simplify_tolerance > 0:
        buildings["geometry"] = buildings.geometry.simplify(
            args.simplify_tolerance,
            preserve_topology=True,
        )

    keep_columns = [
        column
        for column in ["osmid", "building", "name", "amenity", "height", "building:levels", "geometry"]
        if column in buildings.columns
    ]
    buildings = buildings[keep_columns]

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    buildings.to_file(output_path, driver="GeoJSON")
    print(f"Wrote {len(buildings)} building footprints to {output_path}")


if __name__ == "__main__":
    main()
