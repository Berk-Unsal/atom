#!/usr/bin/env python3
"""Convert the extracted Ankara tower CSV into static GeoJSON."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Export tower CSV rows as GeoJSON points.")
    parser.add_argument("--csv", default=str(Path(__file__).with_name("ankara_5g_nodes.csv")))
    parser.add_argument("--output", default=str(Path(__file__).with_name("ankara_5g_nodes.geojson")))
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    features = []
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            lon = float(row["lon"])
            lat = float(row["lat"])
            cell_id = int(float(row["cell"]))
            features.append(
                {
                    "type": "Feature",
                    "id": f"{row['radio']}-{cell_id}",
                    "properties": {
                        "cell_id": cell_id,
                        "radio_type": row["radio"],
                        "is_simulated": parse_bool(row.get("is_simulated_5g", "")),
                        "mcc": int(float(row["mcc"])) if row.get("mcc") else None,
                        "net": int(float(row["net"])) if row.get("net") else None,
                        "area": int(float(row["area"])) if row.get("area") else None,
                        "range": float(row["range"]) if row.get("range") else None,
                        "samples": int(float(row["samples"])) if row.get("samples") else None,
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat],
                    },
                }
            )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(features)} tower points to {output_path}")


if __name__ == "__main__":
    main()
