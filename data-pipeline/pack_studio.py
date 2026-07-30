#!/usr/bin/env python3
"""Build and inspect portable A.T.O.M dataset packs (manifest schema v2)."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import shutil
import sys
import tempfile
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


SCHEMA_VERSION = 2
TARGET_CRS = "EPSG:4326"
MAX_IDENTITY_BYTES = 128
VECTOR_LAYERS = ("towers", "buildings", "clutter", "building_heights", "materials")
OPTIONAL_LAYERS = ("terrain", "clutter", "building_heights", "materials")
EXPECTED_FIELDS = {
    "towers": ("cell_id", "radio_type"),
    "buildings": ("building", "height", "building_levels", "demand_weight", "residential_density"),
    "clutter": ("clutter_class",),
    "building_heights": ("height",),
    "materials": ("material",),
}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    inspect = commands.add_parser("inspect", help="Preview CRS, geometry, fields, bounds, and source coverage")
    add_layer_arguments(inspect, required=True)
    inspect.add_argument("--bounds", type=parse_bounds, help="Requested west,south,east,north bounds")
    inspect.add_argument("--json", action="store_true", help="Emit machine-readable JSON")

    build = commands.add_parser("build", help="Repair, reproject, and assemble a schema-v2 pack")
    build.add_argument("--id", required=True, dest="dataset_id")
    build.add_argument("--name", required=True)
    build.add_argument("--version", required=True)
    build.add_argument("--output", required=True, type=Path)
    build.add_argument("--source", required=True, action="append", help="Source attribution; repeatable")
    build.add_argument("--license", required=True, action="append", dest="licenses", help="License notice; repeatable")
    build.add_argument("--confidence", required=True, help="Planning confidence and limitations")
    build.add_argument("--bounds", type=parse_bounds, help="Crop and declare west,south,east,north bounds")
    build.add_argument("--quality-summary", default="Geometry repaired and reprojected by Dataset Pack Studio; review missing-field counts before RF use.")
    add_layer_arguments(build, required=True)
    return root


def add_layer_arguments(command: argparse.ArgumentParser, required: bool) -> None:
    command.add_argument("--towers", required=required, type=Path)
    command.add_argument("--buildings", required=required, type=Path)
    command.add_argument("--terrain", type=Path)
    command.add_argument("--clutter", type=Path)
    command.add_argument("--building-heights", type=Path, dest="building_heights")
    command.add_argument("--materials", type=Path)
    for layer in ("towers", "buildings", *OPTIONAL_LAYERS):
        command.add_argument(f"--{layer.replace('_', '-')}-crs", dest=f"{layer}_crs")
    command.add_argument("--terrain-units", default="m")


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "inspect":
            report = inspect_sources(args)
            if args.json:
                print(json.dumps(report, indent=2, sort_keys=True))
            else:
                print_human_report(report)
            return 0
        manifest = build_pack(args)
        print(json.dumps({"status": "built", "output": str(args.output), "manifest": manifest}, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"pack studio error: {error}", file=sys.stderr)
        return 1


def inspect_sources(args: argparse.Namespace) -> Dict[str, Any]:
    reports: Dict[str, Any] = {}
    all_bounds: List[Sequence[float]] = []
    for layer in VECTOR_LAYERS:
        source = getattr(args, layer, None)
        if source is None:
            continue
        _, report = prepare_vector(layer, source, getattr(args, f"{layer}_crs", None), args.bounds)
        reports[layer] = report
        if report["output_bounds"]:
            all_bounds.append(report["output_bounds"])
    if getattr(args, "terrain", None):
        terrain = checked_source(args.terrain)
        reports["terrain"] = {
            "source": str(terrain),
            "crs": args.terrain_crs or "unspecified",
            "format": file_format(terrain),
            "bytes": terrain.stat().st_size,
            "note": "Raster contents are copied and hashed; supply CRS metadata explicitly when it is not embedded.",
        }
    data_bounds = union_bounds(all_bounds)
    requested = list(args.bounds) if args.bounds else data_bounds
    return {
        "schema_version": SCHEMA_VERSION,
        "target_crs": TARGET_CRS,
        "layers": reports,
        "coverage": {
            "requested_bounds": requested,
            "data_bounds": data_bounds,
            "coverage_ratio": coverage_ratio(requested, data_bounds),
        },
    }


def build_pack(args: argparse.Namespace) -> Dict[str, Any]:
    validate_identity(args.dataset_id, "dataset id")
    validate_identity(args.name, "dataset name")
    validate_identity(args.version, "dataset version")
    validate_nonempty_values(args.source, "source")
    validate_nonempty_values(args.licenses, "license")
    validate_statement(args.confidence, "confidence")
    validate_statement(args.quality_summary, "quality summary")
    if args.terrain:
        if not args.terrain_crs:
            raise ValueError("terrain requires --terrain-crs metadata")
        validate_crs(args.terrain_crs, "terrain CRS")
        validate_statement(args.terrain_units, "terrain units")
    output = args.output.expanduser().resolve()
    if output.exists() and any(output.iterdir() if output.is_dir() else [output]):
        raise ValueError(f"output must not already contain files: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=str(output.parent)))
    try:
        files: Dict[str, str] = {}
        layers: Dict[str, Dict[str, Any]] = {}
        geometry_quality: Dict[str, Dict[str, int]] = {}
        missing_fields: Dict[str, Dict[str, int]] = {}
        feature_counts: Dict[str, int] = {}
        source_bounds: List[Sequence[float]] = []

        for layer in VECTOR_LAYERS:
            source = getattr(args, layer, None)
            if source is None:
                continue
            frame, report = prepare_vector(layer, source, getattr(args, f"{layer}_crs", None), args.bounds)
            filename = f"{layer}.geojson"
            write_geojson(frame, staging / filename, layer)
            files[layer] = filename
            layers[layer] = layer_metadata(
                layer,
                "geojson",
                TARGET_CRS,
                layer in OPTIONAL_LAYERS,
                args.source[0],
                args.licenses[0],
                args.confidence,
            )
            geometry_quality[layer] = {
                "invalid_input": report["invalid_input"],
                "repaired": report["repaired"],
                "dropped": report["dropped"],
                "output": report["output_features"],
            }
            missing_fields[layer] = report["missing_fields"]
            feature_counts[layer] = report["output_features"]
            if report["output_bounds"]:
                source_bounds.append(report["output_bounds"])

        if args.terrain:
            source = checked_source(args.terrain)
            suffix = source.suffix.lower() or ".bin"
            filename = f"terrain{suffix}"
            shutil.copyfile(source, staging / filename)
            files["terrain"] = filename
            layers["terrain"] = layer_metadata(
                "terrain",
                file_format(source),
                args.terrain_crs or "unspecified",
                True,
                args.source[0],
                args.licenses[0],
                args.confidence,
                units=args.terrain_units,
            )

        data_bounds = union_bounds(source_bounds)
        bounds = list(args.bounds) if args.bounds else data_bounds
        if not bounds or not valid_bounds(bounds):
            raise ValueError("could not derive valid EPSG:4326 bounds from the vector layers")
        hashes = {filename: sha256_file(staging / filename) for filename in files.values()}
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "id": args.dataset_id.strip(),
            "name": args.name.strip(),
            "version": args.version.strip(),
            "crs": TARGET_CRS,
            "bounds": round_bounds(bounds),
            "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "sources": [value.strip() for value in args.source if value.strip()],
            "licenses": [value.strip() for value in args.licenses if value.strip()],
            "confidence": args.confidence.strip(),
            "files": files,
            "layers": layers,
            "quality": {
                "summary": args.quality_summary.strip(),
                "feature_counts": feature_counts,
                "missing_fields": missing_fields,
                "geometry": geometry_quality,
                "coverage": {
                    "requested_bounds": round_bounds(bounds),
                    "data_bounds": round_bounds(data_bounds),
                    "coverage_ratio": coverage_ratio(bounds, data_bounds),
                },
            },
            "sha256": hashes,
        }
        (staging / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        if output.exists():
            output.rmdir()
        os.replace(staging, output)
        staging = None
        return manifest
    finally:
        if staging is not None:
            shutil.rmtree(staging, ignore_errors=True)


def prepare_vector(layer: str, source: Path, source_crs: Optional[str], bounds: Optional[Sequence[float]]):
    geopandas, box = spatial_dependencies()
    source = checked_source(source)
    try:
        frame = geopandas.read_file(source)
    except Exception as error:
        raise ValueError(f"could not read {layer} vector source {source}: {error}") from error
    if frame.crs is None:
        if not source_crs:
            raise ValueError(f"{layer} source has no CRS; pass --{layer.replace('_', '-')}-crs")
        frame = frame.set_crs(source_crs, allow_override=True)
    input_crs = str(frame.crs)
    input_features = len(frame)
    invalid_input = int((~frame.geometry.is_valid & frame.geometry.notna()).sum())
    frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
    invalid_before_repair = ~frame.geometry.is_valid
    try:
        frame.geometry = frame.geometry.make_valid()
    except AttributeError:
        from shapely.validation import make_valid
        frame.geometry = frame.geometry.apply(make_valid)
    frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty & frame.geometry.is_valid].copy()
    repaired = int(invalid_before_repair.reindex(frame.index, fill_value=False).sum())
    if layer == "towers":
        frame = frame[frame.geometry.geom_type == "Point"].copy()
    elif layer in ("buildings", "building_heights", "materials", "clutter"):
        allowed = {"Polygon", "MultiPolygon"}
        frame = frame[frame.geometry.geom_type.isin(allowed)].copy()
    if frame.crs.to_string().upper() != TARGET_CRS:
        frame = frame.to_crs(TARGET_CRS)
    if bounds:
        frame = geopandas.clip(frame, box(*bounds), keep_geom_type=True)
        frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
    frame = frame.reset_index(drop=True)
    missing = missing_field_counts(frame, EXPECTED_FIELDS.get(layer, ()))
    ensure_feature_identifiers(frame, layer)
    if layer in ("towers", "buildings") and frame.empty:
        raise ValueError(f"{layer} source contains no usable geometry in the requested bounds")
    output_bounds = [] if frame.empty else [float(value) for value in frame.total_bounds]
    return frame, {
        "source": str(source),
        "input_crs": input_crs,
        "output_crs": TARGET_CRS,
        "input_features": input_features,
        "invalid_input": invalid_input,
        "repaired": repaired,
        "dropped": input_features - len(frame),
        "output_features": len(frame),
        "output_bounds": round_bounds(output_bounds),
        "missing_fields": missing,
    }


def ensure_feature_identifiers(frame, layer: str) -> None:
    if "id" not in frame.columns:
        raw_identifiers = [f"{layer}-{index + 1}" for index in range(len(frame))]
    else:
        raw_identifiers = [str(value).strip() if value is not None and str(value).strip() else f"{layer}-{index + 1}" for index, value in enumerate(frame["id"])]
    used = set()
    unique: List[str] = []
    for value in raw_identifiers:
        base = bounded_identifier(value)
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = identifier_with_suffix(base, f"-{suffix}")
            suffix += 1
        used.add(candidate)
        unique.append(candidate)
    if unique != raw_identifiers and "source_feature_id" not in frame.columns:
        frame["source_feature_id"] = raw_identifiers
    frame["id"] = unique
    if layer == "towers":
        if "cell_id" not in frame.columns:
            frame["cell_id"] = list(range(1, len(frame) + 1))
        else:
            normalize_tower_cell_ids(frame)
        if "radio_type" not in frame.columns:
            frame["radio_type"] = "unknown"


def normalize_tower_cell_ids(frame) -> None:
    raw_values = list(frame["cell_id"])
    parsed_values = [positive_int64(value) for value in raw_values]
    used = set()
    next_id = 1
    normalized = []
    changed = False
    for parsed in parsed_values:
        if parsed is None or parsed in used:
            while next_id in used:
                next_id += 1
            parsed = next_id
            next_id += 1
            changed = True
        used.add(parsed)
        normalized.append(parsed)
    if changed and "source_cell_id" not in frame.columns:
        frame["source_cell_id"] = [None if value is None else str(value) for value in raw_values]
    frame["cell_id"] = normalized


def positive_int64(value: Any) -> Optional[int]:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if not number.is_finite() or number != number.to_integral_value() or number <= 0 or number > 9_223_372_036_854_775_807:
        return None
    return int(number)


def bounded_identifier(value: str) -> str:
    if len(value.encode("utf-8")) <= MAX_IDENTITY_BYTES:
        return value
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return identifier_with_suffix(value, f"-{digest}")


def identifier_with_suffix(value: str, suffix: str) -> str:
    budget = MAX_IDENTITY_BYTES - len(suffix.encode("utf-8"))
    prefix = value
    while prefix and len(prefix.encode("utf-8")) > budget:
        prefix = prefix[:-1]
    return f"{prefix}{suffix}"


def write_geojson(frame, destination: Path, layer: str) -> None:
    from shapely.geometry import mapping

    features = []
    for _, row in frame.iterrows():
        properties = {}
        for key, value in row.items():
            if key == frame.geometry.name or key == "id":
                continue
            properties[key] = json_value(value)
        feature_id = str(row["id"])
        features.append({
            "type": "Feature",
            "id": feature_id,
            "properties": properties,
            "geometry": mapping(row.geometry),
        })
    collection = {
        "type": "FeatureCollection",
        "name": layer,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }
    destination.write_text(json.dumps(collection, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if hasattr(value, "item"):
        return json_value(value.item())
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    if isinstance(value, Mapping):
        return {str(key): json_value(item) for key, item in value.items()}
    text = str(value)
    return None if text.lower() in ("nan", "nat", "none") else text


def missing_field_counts(frame, fields: Iterable[str]) -> Dict[str, int]:
    result = {}
    for field in fields:
        if field not in frame.columns:
            result[field] = len(frame)
            continue
        result[field] = int(frame[field].isna().sum() + frame[field].astype(str).str.strip().eq("").sum())
    return result


def layer_metadata(layer: str, format_name: str, crs: str, optional: bool, source: str, license_name: str, confidence: str, units: str = "") -> Dict[str, Any]:
    metadata = {
        "kind": {
            "towers": "cell_inventory",
            "buildings": "building_footprints",
            "terrain": "terrain_elevation",
            "clutter": "land_clutter",
            "building_heights": "building_heights",
            "materials": "building_materials",
        }[layer],
        "format": format_name,
        "crs": crs,
        "optional": optional,
        "source": source,
        "license": license_name,
        "confidence": confidence,
    }
    if units:
        metadata["units"] = units
    return metadata


def spatial_dependencies():
    try:
        import geopandas
        from shapely.geometry import box
    except ImportError as error:
        raise RuntimeError("Dataset Pack Studio requires the data-pipeline environment (geopandas, shapely, and pyproj)") from error
    return geopandas, box


def checked_source(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise ValueError(f"source is not a regular file: {resolved}")
    return resolved


def parse_bounds(value: str) -> Tuple[float, float, float, float]:
    try:
        bounds = tuple(float(part.strip()) for part in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("bounds must be west,south,east,north") from error
    if len(bounds) != 4 or not valid_bounds(bounds):
        raise argparse.ArgumentTypeError("bounds must be valid west,south,east,north EPSG:4326 coordinates")
    return bounds


def valid_bounds(bounds: Sequence[float]) -> bool:
    return len(bounds) == 4 and all(math.isfinite(value) for value in bounds) and -180 <= bounds[0] < bounds[2] <= 180 and -90 <= bounds[1] < bounds[3] <= 90


def union_bounds(bounds: Sequence[Sequence[float]]) -> List[float]:
    valid = [item for item in bounds if valid_bounds(item)]
    if not valid:
        return []
    return [min(item[0] for item in valid), min(item[1] for item in valid), max(item[2] for item in valid), max(item[3] for item in valid)]


def coverage_ratio(requested: Sequence[float], actual: Sequence[float]) -> float:
    if not valid_bounds(requested) or not valid_bounds(actual):
        return 0.0
    width = max(0.0, min(requested[2], actual[2]) - max(requested[0], actual[0]))
    height = max(0.0, min(requested[3], actual[3]) - max(requested[1], actual[1]))
    requested_area = (requested[2] - requested[0]) * (requested[3] - requested[1])
    return round(width * height / requested_area, 6) if requested_area > 0 else 0.0


def round_bounds(bounds: Sequence[float]) -> List[float]:
    return [round(float(value), 8) for value in bounds] if len(bounds) == 4 else []


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_format(path: Path) -> str:
    return {".tif": "geotiff", ".tiff": "geotiff", ".gpkg": "geopackage", ".geojson": "geojson", ".json": "geojson"}.get(path.suffix.lower(), path.suffix.lower().lstrip(".") or "binary")


def validate_identity(value: str, label: str) -> None:
    if not value.strip() or len(value.encode("utf-8")) > MAX_IDENTITY_BYTES:
        raise ValueError(f"{label} is required and must be at most {MAX_IDENTITY_BYTES} bytes")


def validate_nonempty_values(values: Sequence[str], label: str) -> None:
    if not values or any(not value.strip() for value in values):
        raise ValueError(f"at least one non-empty {label} is required")


def validate_statement(value: str, label: str) -> None:
    if not str(value).strip():
        raise ValueError(f"{label} is required")


def validate_crs(value: str, label: str) -> None:
    try:
        from pyproj import CRS
        CRS.from_user_input(value)
    except Exception as error:
        raise ValueError(f"{label} is invalid: {value}") from error


def print_human_report(report: Dict[str, Any]) -> None:
    print(f"Target CRS: {report['target_crs']}")
    for name, layer in report["layers"].items():
        if name == "terrain":
            print(f"- {name}: {layer['format']}, {layer['bytes']} bytes, CRS {layer['crs']}")
            continue
        print(
            f"- {name}: {layer['input_features']} input, {layer['output_features']} output, "
            f"{layer['invalid_input']} invalid, {layer['repaired']} repaired, {layer['dropped']} dropped; "
            f"CRS {layer['input_crs']} -> {layer['output_crs']}"
        )
        missing = ", ".join(f"{field}={count}" for field, count in layer["missing_fields"].items())
        print(f"  missing fields: {missing or 'none'}")
    coverage = report["coverage"]
    print(f"Coverage: {coverage['coverage_ratio'] * 100:.1f}% of {coverage['requested_bounds']}")


if __name__ == "__main__":
    raise SystemExit(main())
