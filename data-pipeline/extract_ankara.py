#!/usr/bin/env python3
"""
Extract Ankara-area 5G candidate base stations from an OpenCellID Turkey dump.

The script prefers a local 286.csv.gz archive, supports uncompressed CSV input for
development, and writes data-pipeline/ankara_5g_nodes.csv by default.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Iterable

import pandas as pd


ANKARA_BBOX = {
    "min_lon": 32.55,
    "min_lat": 39.75,
    "max_lon": 33.00,
    "max_lat": 40.05,
}

KEEP_COLUMNS = [
    "radio",
    "mcc",
    "net",
    "area",
    "cell",
    "unit",
    "lon",
    "lat",
    "range",
    "samples",
    "changeable",
    "created",
    "updated",
]


def resolve_input_path(requested: str | None) -> Path:
    if requested:
        path = Path(requested)
        if not path.exists():
            raise FileNotFoundError(f"Input file does not exist: {path}")
        return path

    candidates = [Path("286.csv.gz"), Path("286.csv"), Path(__file__).with_name("286.csv.gz")]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Expected 286.csv.gz or 286.csv in the current directory.")


def detect_columns(path: Path) -> list[str] | None:
    compression = "gzip" if path.suffix == ".gz" else None
    sample = pd.read_csv(path, compression=compression, nrows=0)
    columns = list(sample.columns)
    if set(KEEP_COLUMNS).issubset(columns):
        return None

    open_cell_id_columns = [
        "radio",
        "mcc",
        "net",
        "area",
        "cell",
        "unit",
        "lon",
        "lat",
        "range",
        "samples",
        "changeable",
        "created",
        "updated",
        "averageSignal",
    ]
    return open_cell_id_columns[: len(columns)]


def read_chunks(path: Path, chunksize: int) -> Iterable[pd.DataFrame]:
    compression = "gzip" if path.suffix == ".gz" else None
    names = detect_columns(path)
    return pd.read_csv(
        path,
        compression=compression,
        names=names,
        header=None if names else "infer",
        usecols=lambda column: column in KEEP_COLUMNS,
        chunksize=chunksize,
        low_memory=False,
    )


def filter_bbox(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame["lon"] = pd.to_numeric(frame["lon"], errors="coerce")
    frame["lat"] = pd.to_numeric(frame["lat"], errors="coerce")
    return frame[
        frame["lon"].between(ANKARA_BBOX["min_lon"], ANKARA_BBOX["max_lon"])
        & frame["lat"].between(ANKARA_BBOX["min_lat"], ANKARA_BBOX["max_lat"])
    ]


def extract(input_path: Path, output_path: Path, chunksize: int, nr_threshold: int) -> pd.DataFrame:
    nr_chunks: list[pd.DataFrame] = []
    lte_chunks: list[pd.DataFrame] = []

    for chunk in read_chunks(input_path, chunksize):
        missing = sorted(set(KEEP_COLUMNS) - set(chunk.columns))
        if missing:
            raise ValueError(f"Input file is missing required columns: {', '.join(missing)}")

        chunk = chunk[KEEP_COLUMNS]
        chunk["radio"] = chunk["radio"].astype(str).str.upper()
        inside_ankara = filter_bbox(chunk)
        if inside_ankara.empty:
            continue

        nr_chunks.append(inside_ankara[inside_ankara["radio"] == "NR"])
        lte_chunks.append(inside_ankara[inside_ankara["radio"] == "LTE"])

    nr = pd.concat(nr_chunks, ignore_index=True) if nr_chunks else pd.DataFrame(columns=KEEP_COLUMNS)
    lte = pd.concat(lte_chunks, ignore_index=True) if lte_chunks else pd.DataFrame(columns=KEEP_COLUMNS)

    nr["is_simulated_5g"] = False
    if len(nr) < nr_threshold:
        lte = lte.copy()
        lte["is_simulated_5g"] = True
        result = pd.concat([nr, lte], ignore_index=True)
    else:
        result = nr

    result = result.drop_duplicates(subset=["radio", "mcc", "net", "area", "cell", "lon", "lat"])
    result = result.sort_values(["is_simulated_5g", "radio", "cell"]).reset_index(drop=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(output_path, index=False, quoting=csv.QUOTE_MINIMAL)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Ankara NR/LTE base-station candidates.")
    parser.add_argument("--input", help="Path to 286.csv.gz or an uncompressed OpenCellID CSV.")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).with_name("ankara_5g_nodes.csv")),
        help="Output CSV path.",
    )
    parser.add_argument("--chunksize", type=int, default=250_000, help="Rows per pandas chunk.")
    parser.add_argument("--nr-threshold", type=int, default=50, help="Minimum NR rows before LTE fallback.")
    args = parser.parse_args()

    input_path = resolve_input_path(args.input)
    output_path = Path(args.output)
    result = extract(input_path, output_path, args.chunksize, args.nr_threshold)

    simulated = int(result["is_simulated_5g"].sum()) if not result.empty else 0
    print(f"Wrote {len(result)} Ankara rows to {output_path}")
    print(f"Simulated LTE-as-5G fallback rows: {simulated}")


if __name__ == "__main__":
    main()
