#!/usr/bin/env python3
"""Load data-pipeline/ankara_5g_nodes.csv into MongoDB."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from pymongo import MongoClient, UpdateOne


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Ankara tower CSV into MongoDB.")
    parser.add_argument("--csv", default=str(Path(__file__).with_name("ankara_5g_nodes.csv")))
    parser.add_argument("--mongo-uri", default="mongodb://localhost:27017")
    parser.add_argument("--database", default="ankara_raytracer")
    parser.add_argument("--collection", default="base_stations")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    frame = pd.read_csv(csv_path)
    required = {"radio", "cell", "lon", "lat", "is_simulated_5g"}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing)}")

    client = MongoClient(args.mongo_uri)
    collection = client[args.database][args.collection]
    collection.create_index([("location", "2dsphere")], name="location_2dsphere")

    operations = []
    for row in frame.to_dict("records"):
        cell_id = int(row["cell"])
        doc = {
            "cell_id": cell_id,
            "radio_type": str(row["radio"]),
            "location": {
                "type": "Point",
                "coordinates": [float(row["lon"]), float(row["lat"])],
            },
            "is_simulated": bool(row["is_simulated_5g"]),
            "metadata": {
                "mcc": int(row["mcc"]) if pd.notna(row.get("mcc")) else None,
                "net": int(row["net"]) if pd.notna(row.get("net")) else None,
                "area": int(row["area"]) if pd.notna(row.get("area")) else None,
                "range": float(row["range"]) if pd.notna(row.get("range")) else None,
                "samples": int(row["samples"]) if pd.notna(row.get("samples")) else None,
                "updated": int(row["updated"]) if pd.notna(row.get("updated")) else None,
            },
        }
        operations.append(
            UpdateOne(
                {"cell_id": cell_id, "radio_type": doc["radio_type"]},
                {"$set": doc},
                upsert=True,
            )
        )

    if operations:
        result = collection.bulk_write(operations, ordered=False)
        print(f"Upserted {result.upserted_count}, modified {result.modified_count}")
    else:
        print("No rows to load.")


if __name__ == "__main__":
    main()
