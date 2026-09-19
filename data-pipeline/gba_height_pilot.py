#!/usr/bin/env python3
"""Run the Concept 4F.3A.2 GBA.Height Ankara diagnostic pilot.

The pilot is deliberately diagnostic.  It acquires only the official
GBA.Height GeoTIFF entries intersecting the active Ankara AOI, samples those
rasters against the repository's existing OSM footprints, and writes compact
audit artifacts.  It never edits the canonical dataset or activates an
external height source in the RF path.

The public GBA distribution exposes very large parent ZIP archives over FTP.
The acquisition code downloads the ZIP central directory and the compressed
byte ranges for the selected 0.2-degree GeoTIFF entries only.  Parent archives
and derived per-footprint records stay in the caller-selected external cache.
"""

from __future__ import annotations

import argparse
import binascii
import datetime as _datetime
import ftplib
import hashlib
import json
import math
import os
import resource
import re
import shutil
import struct
import subprocess
import sys
import time
import zipfile
import zlib
from collections import Counter, defaultdict
from pathlib import Path

from shapely.geometry import box, mapping
from shapely.ops import transform as shapely_transform
from shapely.strtree import STRtree

from external_height_pilot import (
    AREA_BINS,
    CONTROLLED_FIXTURES,
    HEIGHT_BINS,
    _local_area_m2,
    _tree_query_indices,
    binned_distribution,
    distribution,
    geometry_from_feature,
    load_osm_records,
    parse_building_length,
)


CONCEPT = "4F.3A.2"
SOURCE_NAME = "GlobalBuildingAtlas"
PRODUCT_NAME = "GBA.Height"
SOURCE_RELEASE = "mediaTUM-1782307-current-2026-02-10"
SOURCE_README_URL = "https://github.com/zhu-xlab/GlobalBuildingAtlas/blob/main/README.md"
SOURCE_REPOSITORY_URL = "https://github.com/zhu-xlab/GlobalBuildingAtlas"
SOURCE_PUBLICATION_URL = "https://essd.copernicus.org/articles/17/6647/2025/"
SOURCE_MEDIA_TUM_URL = "https://mediatum.ub.tum.de/1782307"
SOURCE_TERMS_URL = "https://tubvsig-so2sat-vm1.srv.mwn.de/terms_of_use.html"
SOURCE_LICENSE_URL = "https://creativecommons.org/licenses/by-nc/4.0/"
SOURCE_FTP_HOST = "dataserv.ub.tum.de"
SOURCE_INDEX_USER = "m1782307.rep"
SOURCE_INDEX_PASSWORD = "m1782307.rep"
SOURCE_DATA_USER = "m1782307"
SOURCE_DATA_PASSWORD = "m1782307"
SOURCE_INDEX_FILES = (
    "height_tif.geojson",
    "height_zip.geojson",
    "checksums.sha512",
    "README.txt",
)
EXTRACTION_POLICY_VERSION = "gba-height-extraction-v1"
DEFAULT_STATISTICS = ("min", "median", "mean", "p75", "p90", "max")
SAMPLING_STRATEGIES = (
    "all_intersecting",
    "pixel_center_inside",
    "inward_buffered",
    "robust_interior_quantile",
)
INWARD_BUFFER_M = 3.0
ZIP_TAIL_BYTES = 4 * 1024 * 1024
FTP_BLOCK_BYTES = 1024 * 1024


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
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(FTP_BLOCK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha512_file(path):
    digest = hashlib.sha512()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(FTP_BLOCK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ftp_connection(host, username, password, timeout=120):
    ftp = ftplib.FTP(host, timeout=timeout)
    ftp.login(username, password)
    ftp.voidcmd("TYPE I")
    return ftp


def ftp_size(host, username, password, remote_path):
    ftp = _ftp_connection(host, username, password)
    try:
        size = ftp.size(remote_path.lstrip("/"))
        if size is None:
            raise RuntimeError("FTP server did not return a size for %s" % remote_path)
        return int(size)
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


def ftp_download_file(host, username, password, remote_path, destination):
    """Download one complete small official metadata file atomically."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    ftp = _ftp_connection(host, username, password)
    try:
        with temporary.open("wb") as output:
            ftp.retrbinary("RETR " + remote_path.lstrip("/"), output.write, blocksize=FTP_BLOCK_BYTES)
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()
    os.replace(temporary, destination)
    return {
        "bytes": destination.stat().st_size,
        "sha256": sha256_file(destination),
        "sha512": sha512_file(destination),
        "reused_cached_file": False,
    }


def ftp_download_range(host, username, password, remote_path, start, length, destination):
    """Download exactly ``length`` bytes using FTP REST from ``start``."""
    if start < 0 or length < 0:
        raise ValueError("FTP range must be non-negative")
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    ftp = _ftp_connection(host, username, password)
    data_socket = None
    received = 0
    try:
        data_socket, _ = ftp.ntransfercmd("RETR " + remote_path.lstrip("/"), rest=start)
        with temporary.open("wb") as output:
            while received < length:
                chunk = data_socket.recv(min(FTP_BLOCK_BYTES, length - received))
                if not chunk:
                    break
                output.write(chunk)
                received += len(chunk)
    finally:
        if data_socket is not None:
            data_socket.close()
        try:
            ftp.voidresp()
        except Exception:
            pass
        try:
            ftp.quit()
        except Exception:
            ftp.close()
    if received != length:
        raise RuntimeError(
            "short FTP range for %s: received %d of %d bytes" % (remote_path, received, length)
        )
    os.replace(temporary, destination)
    return destination


def _normalise_remote_path(path):
    return str(path).strip().lstrip("./")


def _feature_bounds(feature):
    ring = feature.get("geometry", {}).get("coordinates", [[]])[0]
    points = [point for point in ring if len(point) >= 2]
    if not points:
        return None
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _bounds_intersect(left, right):
    return not (
        left[2] < right[0]
        or left[0] > right[2]
        or left[3] < right[1]
        or left[1] > right[3]
    )


def _load_or_download_index_files(index_dir, download, host, username, password):
    index_dir = Path(index_dir)
    index_dir.mkdir(parents=True, exist_ok=True)
    metadata = {}
    for name in SOURCE_INDEX_FILES:
        path = index_dir / name
        if download or not path.exists():
            metadata[name] = ftp_download_file(host, username, password, name, path)
        else:
            metadata[name] = {
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "sha512": sha512_file(path),
                "reused_cached_file": True,
            }
    with (index_dir / "height_tif.geojson").open("r", encoding="utf-8") as handle:
        height_tif = json.load(handle)
    with (index_dir / "height_zip.geojson").open("r", encoding="utf-8") as handle:
        height_zip = json.load(handle)
    return height_tif, height_zip, metadata


def select_aoi_height_tiles(height_tif, height_zip, aoi_bounds):
    selected_tiles = []
    for feature in height_tif.get("features", []):
        bounds = _feature_bounds(feature)
        if bounds is None or not _bounds_intersect(bounds, aoi_bounds):
            continue
        properties = feature.get("properties") or {}
        path = str(properties.get("path", "")).strip()
        parent = str(properties.get("zipfile_path", "")).strip()
        if not path or not parent:
            continue
        selected_tiles.append(
            {
                "tile_id": Path(path).name,
                "path": path,
                "bounds": bounds,
                "parent_archive": parent,
            }
        )
    selected_tiles.sort(key=lambda tile: tile["path"])

    archive_by_path = {}
    for feature in height_zip.get("features", []):
        bounds = _feature_bounds(feature)
        properties = feature.get("properties") or {}
        path = str(properties.get("path", "")).strip()
        if bounds is None or not path:
            continue
        if _bounds_intersect(bounds, aoi_bounds):
            archive_by_path[path] = {
                "path": path,
                "bounds": bounds,
                "sha512": properties.get("SHA512"),
            }
    selected_archives = {}
    for tile in selected_tiles:
        archive = archive_by_path.get(tile["parent_archive"])
        if archive is None:
            raise RuntimeError("selected height tile has no official parent archive: %s" % tile["path"])
        selected_archives[tile["parent_archive"]] = archive
    return selected_tiles, [selected_archives[key] for key in sorted(selected_archives)]


def _safe_name(path):
    return str(path).replace("/", "__").replace("\\", "__").replace(".", "_")


def _make_sparse_zip_index(host, username, password, archive, cache_dir):
    remote_path = _normalise_remote_path(archive["path"])
    archive_size = ftp_size(host, username, password, remote_path)
    index_dir = Path(cache_dir) / "archive-index"
    index_dir.mkdir(parents=True, exist_ok=True)
    sparse_path = index_dir / (_safe_name(remote_path) + ".sparse.zip")
    tail_path = index_dir / (_safe_name(remote_path) + ".tail")
    if not sparse_path.exists() or sparse_path.stat().st_size != archive_size:
        tail_length = min(ZIP_TAIL_BYTES, archive_size)
        ftp_download_range(
            host,
            username,
            password,
            remote_path,
            archive_size - tail_length,
            tail_length,
            tail_path,
        )
        with sparse_path.open("wb") as output:
            output.seek(archive_size - tail_length)
            output.write(tail_path.read_bytes())
    try:
        archive_index = zipfile.ZipFile(sparse_path)
        archive_index.infolist()
    except (OSError, zipfile.BadZipFile) as error:
        raise RuntimeError("could not parse official ZIP central directory for %s: %s" % (remote_path, error)) from error
    return archive_index, {
        "remote_path": remote_path,
        "archive_size": archive_size,
        "sparse_index_path": str(sparse_path),
        "official_sha512": archive.get("sha512"),
        "tail_bytes": min(ZIP_TAIL_BYTES, archive_size),
    }


def _local_zip_payload_offset(header):
    if len(header) < 30:
        raise RuntimeError("truncated ZIP local header")
    signature, _, flags, compression, _, _, _, _, _, name_length, extra_length = struct.unpack(
        "<4s5H3L2H", header[:30]
    )
    if signature != b"PK\x03\x04":
        raise RuntimeError("unexpected ZIP local header signature: %r" % signature)
    if flags & 0x1:
        raise RuntimeError("encrypted GBA.Height ZIP entry is unsupported")
    return {
        "flags": flags,
        "compression": compression,
        "name_length": name_length,
        "extra_length": extra_length,
        "payload_offset": 30 + name_length + extra_length,
    }


def _decompress_zip_payload(compressed_path, destination, info):
    destination = Path(destination)
    temporary = destination.with_suffix(destination.suffix + ".part")
    crc = 0
    written = 0
    if info.compress_type == 0:
        reader = None
    elif info.compress_type == 8:
        reader = zlib.decompressobj(-15)
    else:
        raise RuntimeError("unsupported ZIP compression method %s for %s" % (info.compress_type, info.filename))
    with Path(compressed_path).open("rb") as source, temporary.open("wb") as output:
        for chunk in iter(lambda: source.read(FTP_BLOCK_BYTES), b""):
            if reader is None:
                decoded = chunk
            else:
                decoded = reader.decompress(chunk)
            if decoded:
                output.write(decoded)
                crc = binascii.crc32(decoded, crc)
                written += len(decoded)
        if reader is not None:
            decoded = reader.flush()
            if decoded:
                output.write(decoded)
                crc = binascii.crc32(decoded, crc)
                written += len(decoded)
    crc &= 0xFFFFFFFF
    if written != info.file_size or crc != info.CRC:
        raise RuntimeError(
            "ZIP entry integrity mismatch for %s: bytes=%d/%d crc=%08x/%08x"
            % (info.filename, written, info.file_size, crc, info.CRC)
        )
    os.replace(temporary, destination)


def materialise_height_tiles(selected_tiles, selected_archives, cache_dir, host, username, password, download):
    """Materialise selected GeoTIFF members without downloading parent ZIPs."""
    cache_dir = Path(cache_dir)
    tile_dir = cache_dir / "tiles"
    tile_dir.mkdir(parents=True, exist_ok=True)
    archive_by_path = {archive["path"]: archive for archive in selected_archives}
    grouped = defaultdict(list)
    for tile in selected_tiles:
        grouped[tile["parent_archive"]].append(tile)
    acquisition = []
    for parent_path in sorted(grouped):
        archive = archive_by_path[parent_path]
        archive_index, archive_meta = _make_sparse_zip_index(
            host, username, password, archive, cache_dir
        )
        try:
            for tile in sorted(grouped[parent_path], key=lambda item: item["path"]):
                member_name = Path(tile["path"]).name
                try:
                    info = archive_index.getinfo(member_name)
                except KeyError as error:
                    raise RuntimeError("official archive is missing selected member %s" % member_name) from error
                destination = tile_dir / member_name
                if destination.exists() and destination.stat().st_size == info.file_size:
                    tile_hash = sha256_file(destination)
                    reused = True
                else:
                    header = ftp_download_range(
                        host,
                        username,
                        password,
                        archive_meta["remote_path"],
                        info.header_offset,
                        min(65536, info.compress_size + 65536),
                        cache_dir / "headers" / (member_name + ".header"),
                    ).read_bytes()
                    local_header = _local_zip_payload_offset(header)
                    local_name_start = 30
                    local_name_end = local_name_start + local_header["name_length"]
                    local_name = header[local_name_start:local_name_end].decode("utf-8")
                    if local_name != member_name:
                        raise RuntimeError(
                            "ZIP local header name mismatch: %s != %s" % (local_name, member_name)
                        )
                    payload_start = info.header_offset + local_header["payload_offset"]
                    compressed = cache_dir / "compressed" / (member_name + ".deflate")
                    if download or not compressed.exists() or compressed.stat().st_size != info.compress_size:
                        ftp_download_range(
                            host,
                            username,
                            password,
                            archive_meta["remote_path"],
                            payload_start,
                            info.compress_size,
                            compressed,
                        )
                    _decompress_zip_payload(compressed, destination, info)
                    tile_hash = sha256_file(destination)
                    reused = False
                tile.update(
                    {
                        "local_path": str(destination),
                        "bytes": destination.stat().st_size,
                        "sha256": tile_hash,
                        "parent_archive_remote_path": archive_meta["remote_path"],
                        "source_url": "ftp://%s/%s" % (host, _normalise_remote_path(tile["path"])),
                        "parent_archive_source_url": "ftp://%s/%s" % (host, archive_meta["remote_path"]),
                        "parent_archive_size": archive_meta["archive_size"],
                        "parent_archive_sha512": archive_meta["official_sha512"],
                        "zip_member_compressed_bytes": info.compress_size,
                        "zip_member_uncompressed_bytes": info.file_size,
                        "zip_member_crc32": "%08x" % info.CRC,
                        "zip_member_local_header_offset": info.header_offset,
                        "zip_entry_reused": reused,
                        "acquisition_method": "ftp_rest_compressed_member_range",
                    }
                )
                acquisition.append(tile)
        finally:
            archive_index.close()
    return sorted(acquisition, key=lambda item: item["path"])


def _require_rasterio():
    try:
        import rasterio
        from rasterio.errors import WindowError
        from rasterio.features import geometry_mask
        from rasterio.windows import Window, from_bounds
    except ImportError as error:  # pragma: no cover - exercised in unprovisioned environments
        raise RuntimeError("GBA.Height sampling requires rasterio; install data-pipeline/Requirements.txt") from error
    return rasterio, geometry_mask, Window, WindowError, from_bounds


def inspect_rasters(tile_records):
    rasterio, _, _, _, _ = _require_rasterio()
    metadata = []
    for tile in tile_records:
        with rasterio.open(tile["local_path"]) as dataset:
            metadata.append(
                {
                    "tile_id": tile["tile_id"],
                    "path": tile["path"],
                    "width": dataset.width,
                    "height": dataset.height,
                    "count": dataset.count,
                    "dtypes": list(dataset.dtypes),
                    "crs": dataset.crs.to_string() if dataset.crs else None,
                    "transform": list(dataset.transform),
                    "bounds": [float(value) for value in dataset.bounds],
                    "resolution": [float(value) for value in dataset.res],
                    "nodata": dataset.nodata,
                    "scales": list(dataset.scales),
                    "offsets": list(dataset.offsets),
                    "units": list(dataset.units) if dataset.units else None,
                    "descriptions": list(dataset.descriptions),
                    "dataset_tags": dict(dataset.tags()),
                    "band_tags": {str(index): dict(dataset.tags(index)) for index in range(1, dataset.count + 1)},
                    "height_band": 1,
                    "uncertainty_band": 2 if dataset.count >= 2 else None,
                }
            )
    if not metadata:
        raise RuntimeError("no GBA.Height rasters were acquired")
    first = metadata[0]
    consistent_keys = ("count", "dtypes", "crs", "resolution", "nodata", "scales", "offsets")
    consistency = {
        key: len({json.dumps(item.get(key), sort_keys=True, default=_json_default) for item in metadata}) == 1
        for key in consistent_keys
    }
    return {
        "tile_count": len(metadata),
        "tiles": metadata,
        "consistent_fields": consistency,
        "format": "GeoTIFF",
        "nominal_resolution_m": first["resolution"],
        "height_band_semantics": "model-derived normalized surface/object height above ground; band 1",
        "uncertainty_band_semantics": "per-pixel prediction variance across test-time augmentations; band 2 when present; not a calibrated physical confidence interval",
        "height_units": "metres, inferred from the product's nDSM/height semantics and raster scale/offset; verify scale/offset per tile",
        "vertical_quantity": "relative building/object height above local ground (AGL/nDSM-style), not absolute elevation above ellipsoid or orthometric datum",
        "crs_semantics": "raster coordinate CRS is recorded per tile; height values are relative and carry no absolute vertical datum",
        "zero_semantics": "zero is retained as a numeric raster value but is not a usable positive building-height estimate; whether it is nodata is recorded from the GeoTIFF nodata tag",
        "negative_semantics": "negative finite values are rejected as impossible building AGL values and retained in QA counts",
        "nodata_semantics": "dataset nodata tag is honored; non-finite values are also treated as invalid",
    }


def _clone_record(record, geometry, identifier, logical_id):
    clone = dict(record)
    clone["geometry"] = geometry
    clone["id"] = identifier
    clone["logical_id"] = logical_id
    return clone


def expand_loader_visible_osm_records(records):
    """Mirror the Go loader's outer-ring expansion for MultiPolygon features."""
    expanded = []
    for record in records:
        geometry = record["geometry"]
        if geometry.geom_type == "MultiPolygon":
            logical_id = record["id"]
            for ring_index, part in enumerate(geometry.geoms):
                expanded.append(_clone_record(record, part, "%s-%d" % (logical_id, ring_index), logical_id))
        else:
            expanded.append(_clone_record(record, geometry, record["id"], record["id"]))
    return expanded


def _is_geographic(crs):
    return bool(crs is not None and getattr(crs, "is_geographic", False))


def _transform_geometry_for_raster(geometry, source_crs, transformer_cache):
    if source_crs is None:
        return geometry
    key = source_crs.to_string()
    if key.upper() in ("EPSG:4326", "CRS84"):
        return geometry
    if key not in transformer_cache:
        from pyproj import Transformer

        transformer_cache[key] = Transformer.from_crs("EPSG:4326", source_crs, always_xy=True).transform
    return shapely_transform(transformer_cache[key], geometry)


def _inward_buffer_geometry(geometry, crs):
    if geometry.is_empty:
        return geometry
    if _is_geographic(crs):
        from pyproj import Transformer

        to_metric = Transformer.from_crs(crs, "EPSG:3857", always_xy=True).transform
        from_metric = Transformer.from_crs("EPSG:3857", crs, always_xy=True).transform
        return shapely_transform(from_metric, shapely_transform(to_metric, geometry).buffer(-INWARD_BUFFER_M))
    return geometry.buffer(-INWARD_BUFFER_M)


def _empty_accumulator():
    return {
        "intersecting_pixel_count": 0,
        "nodata_pixel_count": 0,
        "nonfinite_pixel_count": 0,
        "negative_pixel_count": 0,
        "zero_pixel_count": 0,
        "positive_values": [],
        "uncertainty_values": [],
        "tile_ids": set(),
    }


def _accumulate_mask(accumulator, values, uncertainty, mask, nodata, scale, offset, tile_id):
    selected_values = values[mask]
    selected_uncertainty = uncertainty[mask] if uncertainty is not None else None
    accumulator["intersecting_pixel_count"] += int(selected_values.size)
    accumulator["tile_ids"].add(tile_id)
    for index, raw in enumerate(selected_values):
        try:
            raw_float = float(raw)
        except (TypeError, ValueError):
            accumulator["nonfinite_pixel_count"] += 1
            continue
        if not math.isfinite(raw_float):
            accumulator["nonfinite_pixel_count"] += 1
            continue
        if nodata is not None and raw_float == float(nodata):
            accumulator["nodata_pixel_count"] += 1
            continue
        value = raw_float * scale + offset
        if not math.isfinite(value):
            accumulator["nonfinite_pixel_count"] += 1
            continue
        if value < 0:
            accumulator["negative_pixel_count"] += 1
            continue
        if value == 0:
            accumulator["zero_pixel_count"] += 1
            continue
        accumulator["positive_values"].append(value)
        if selected_uncertainty is not None:
            try:
                uncertainty_value = float(selected_uncertainty[index])
            except (TypeError, ValueError):
                continue
            if math.isfinite(uncertainty_value):
                accumulator["uncertainty_values"].append(uncertainty_value)


def _finalize_accumulator(accumulator):
    values = accumulator["positive_values"]
    total = accumulator["intersecting_pixel_count"]
    valid_count = len(values)
    if valid_count == 0:
        support_quality = "no_valid_positive_support"
    elif valid_count == 1:
        support_quality = "single_pixel_support"
    elif valid_count < 4:
        support_quality = "limited_support"
    else:
        support_quality = "multi_pixel_support"
    result = {
        "intersecting_pixel_count": total,
        "valid_pixel_count": valid_count,
        "nodata_pixel_count": accumulator["nodata_pixel_count"],
        "nonfinite_pixel_count": accumulator["nonfinite_pixel_count"],
        "negative_pixel_count": accumulator["negative_pixel_count"],
        "zero_pixel_count": accumulator["zero_pixel_count"],
        "coverage_fraction": valid_count / total if total else 0.0,
        "support_quality": support_quality,
        "statistics": distribution(values),
        "source_model_uncertainty": distribution(accumulator["uncertainty_values"]),
        "tile_ids": sorted(accumulator["tile_ids"]),
    }
    return result


def _sample_masks(geometry, window_transform, shape, crs, geometry_mask):
    masks = {
        "all_intersecting": geometry_mask(
            [mapping(geometry)], out_shape=shape, transform=window_transform, invert=True, all_touched=True
        ),
        "pixel_center_inside": geometry_mask(
            [mapping(geometry)], out_shape=shape, transform=window_transform, invert=True, all_touched=False
        ),
    }
    buffered = _inward_buffer_geometry(geometry, crs)
    masks["inward_buffered"] = (
        geometry_mask(
            [mapping(buffered)], out_shape=shape, transform=window_transform, invert=True, all_touched=False
        )
        if buffered is not None and not buffered.is_empty
        else False
    )
    masks["robust_interior_quantile"] = masks["pixel_center_inside"]
    return masks


def sample_gba_rasters(tile_records, osm_records, aoi_bounds):
    """Window-read each selected raster and summarize OSM footprint support."""
    rasterio, geometry_mask, Window, WindowError, from_bounds = _require_rasterio()
    geometries = [record["geometry"] for record in osm_records]
    tree = STRtree(geometries)
    geometry_ids = {id(geometry): index for index, geometry in enumerate(geometries)}
    geometry_wkb = {geometry.wkb_hex: index for index, geometry in enumerate(geometries)}
    accumulators = {
        record["id"]: {strategy: _empty_accumulator() for strategy in SAMPLING_STRATEGIES}
        for record in osm_records
    }
    tile_coverage = {record["id"]: set() for record in osm_records}
    transformer_cache = {}
    aoi = box(*aoi_bounds)
    tile_timings = []
    for tile in tile_records:
        tile_started = time.monotonic()
        with rasterio.open(tile["local_path"]) as dataset:
            tile_box = box(*tile["bounds"])
            query_geometry = tile_box.intersection(aoi)
            candidate_indices = _tree_query_indices(tree, query_geometry, geometries, geometry_ids, geometry_wkb)
            for index in candidate_indices:
                record = osm_records[index]
                if not record["geometry"].intersects(tile_box) or not record["geometry"].intersects(aoi):
                    continue
                tile_coverage[record["id"]].add(tile["tile_id"])
                raster_geometry = _transform_geometry_for_raster(
                    record["geometry"], dataset.crs, transformer_cache
                )
                try:
                    window = from_bounds(*raster_geometry.bounds, transform=dataset.transform)
                    window = window.round_offsets().round_lengths()
                    window = window.intersection(Window(0, 0, dataset.width, dataset.height))
                except (ValueError, WindowError):
                    continue
                if window.width <= 0 or window.height <= 0:
                    continue
                height_values = dataset.read(1, window=window, masked=False)
                uncertainty_values = dataset.read(2, window=window, masked=False) if dataset.count >= 2 else None
                masks = _sample_masks(
                    raster_geometry,
                    dataset.window_transform(window),
                    height_values.shape,
                    dataset.crs,
                    geometry_mask,
                )
                scale = float(dataset.scales[0]) if dataset.scales else 1.0
                offset = float(dataset.offsets[0]) if dataset.offsets else 0.0
                for strategy, mask in masks.items():
                    if isinstance(mask, bool):
                        continue
                    _accumulate_mask(
                        accumulators[record["id"]][strategy],
                        height_values,
                        uncertainty_values,
                        mask,
                        dataset.nodata,
                        scale,
                        offset,
                        tile["tile_id"],
                    )
        tile_timings.append(
            {
                "tile_id": tile["tile_id"],
                "candidate_footprints": len(candidate_indices),
                "elapsed_seconds": time.monotonic() - tile_started,
            }
        )

    output = []
    for record in osm_records:
        strategies = {}
        for strategy in SAMPLING_STRATEGIES:
            accumulator = accumulators[record["id"]][strategy]
            accumulator["tile_ids"].update(tile_coverage[record["id"]])
            strategies[strategy] = _finalize_accumulator(accumulator)
        output.append(
            {
                "id": record["id"],
                "logical_id": record.get("logical_id", record["id"]),
                "feature_index": record.get("feature_index"),
                "area_m2": _local_area_m2(record["geometry"]),
                "osm_height_m": record.get("height"),
                "osm_height_source": record.get("height_source"),
                "osm_raw_height_value": record.get("raw_height_value"),
                "raster_tile_covered": bool(tile_coverage[record["id"]]),
                "raster_tile_ids": sorted(tile_coverage[record["id"]]),
                "strategies": strategies,
            }
        )
    return output, {"tile_timings": tile_timings, "footprint_count": len(output)}


def _metric(values):
    if not values:
        return {"n": 0}
    errors = [float(value) for value in values]
    absolute = [abs(value) for value in errors]
    squared = [value * value for value in errors]
    return {
        "n": len(errors),
        "signed_bias": sum(errors) / len(errors),
        "median_error": distribution(errors)["median"],
        "mae": sum(absolute) / len(absolute),
        "rmse": math.sqrt(sum(squared) / len(squared)),
        "p90_absolute_error": distribution(absolute)["p90"],
    }


def _record_statistic(record, strategy, statistic):
    summary = record["strategies"][strategy]
    return summary["statistics"].get(statistic)


def agreement_for_policy(records, strategy, statistic):
    groups = defaultdict(list)
    cases = []
    support = Counter()
    for record in records:
        selected = _record_statistic(record, strategy, statistic)
        if selected is None:
            continue
        support[record["osm_height_source"]] += 1
        osm_height = record.get("osm_height_m")
        if osm_height is None:
            continue
        difference = float(selected) - float(osm_height)
        groups[record["osm_height_source"]].append(difference)
        threshold = max(5.0, 0.25 * float(osm_height))
        if abs(difference) > threshold:
            cases.append(
                {
                    "building_id": record["id"],
                    "logical_building_id": record["logical_id"],
                    "osm_height_source": record["osm_height_source"],
                    "osm_height_m": osm_height,
                    "gba_height_m": selected,
                    "difference_m": difference,
                    "absolute_difference_m": abs(difference),
                    "large_disagreement_threshold_m": threshold,
                    "raster_support": record["strategies"][strategy],
                }
            )
    explicit = groups.get("osm_explicit", [])
    levels = groups.get("osm_levels_derived", [])
    all_errors = [error for errors in groups.values() for error in errors]
    return {
        "strategy": strategy,
        "statistic": statistic,
        "support_count_by_osm_source": dict(sorted(support.items())),
        "overall": _metric(all_errors),
        "osm_explicit": _metric(explicit),
        "osm_levels_derived": _metric(levels),
        "large_disagreement_count": len(cases),
        "large_disagreement_cases": sorted(cases, key=lambda case: (-case["absolute_difference_m"], case["building_id"]))[:100],
        "conflict_rate_over_osm_height_matches": len(cases) / len(all_errors) if all_errors else 0.0,
        "osm_is_comparison_reference_not_ground_truth": True,
    }


def agreement_study(records):
    study = {}
    for strategy in SAMPLING_STRATEGIES:
        study[strategy] = {statistic: agreement_for_policy(records, strategy, statistic) for statistic in DEFAULT_STATISTICS}
    return study


def _coverage_for_policy(records, strategy, statistic):
    counts = Counter()
    for record in records:
        summary = record["strategies"][strategy]
        selected = summary["statistics"].get(statistic)
        if record["raster_tile_covered"]:
            counts["raster_tile_covered"] += 1
        if selected is not None:
            counts["usable_external_height"] += 1
        if summary["valid_pixel_count"] > 0:
            counts["valid_raster_support"] += 1
        elif record["raster_tile_covered"]:
            counts["insufficient_raster_support"] += 1
        if (
            record["raster_tile_covered"]
            and summary["intersecting_pixel_count"] > 0
            and summary["valid_pixel_count"] == 0
            and summary["nodata_pixel_count"] == summary["intersecting_pixel_count"]
        ):
            counts["nodata_only"] += 1
        if summary["support_quality"] == "single_pixel_support":
            counts["single_pixel_support"] += 1
    counts["total_loader_visible_footprints"] = len(records)
    counts["coverage_pct"] = {
        key: value / len(records) * 100.0 if records else 0.0
        for key, value in counts.items()
        if isinstance(value, int)
    }
    return dict(counts)


def height_distribution(records, strategy, statistic):
    values = [value for value in (_record_statistic(record, strategy, statistic) for record in records) if value is not None]
    return {
        **distribution(values),
        "bins": binned_distribution(values, HEIGHT_BINS),
    }


def _error_groups(records, strategy, statistic, key_function):
    groups = defaultdict(list)
    for record in records:
        selected = _record_statistic(record, strategy, statistic)
        osm_height = record.get("osm_height_m")
        if selected is None or osm_height is None:
            continue
        groups[key_function(record)].append(selected - osm_height)
    return {str(key): _metric(values) for key, values in sorted(groups.items(), key=lambda item: str(item[0]))}


def spatial_error_patterns(records, strategy, statistic):
    def area_key(record):
        area = record["area_m2"]
        for label, lower, upper in AREA_BINS:
            if lower <= area < upper:
                return label
        return "unbinned"

    def height_key(record):
        value = record.get("osm_height_m")
        if value is None:
            return "unavailable"
        for label, lower, upper in HEIGHT_BINS:
            if lower <= value < upper:
                return label
        return "unbinned"

    def support_key(record):
        count = record["strategies"][strategy]["valid_pixel_count"]
        if count == 0:
            return "0"
        if count == 1:
            return "1"
        if count <= 3:
            return "2-3"
        if count <= 9:
            return "4-9"
        return "10+"

    return {
        "by_footprint_area_m2": _error_groups(records, strategy, statistic, area_key),
        "by_osm_height_m": _error_groups(records, strategy, statistic, height_key),
        "by_valid_pixel_support": _error_groups(records, strategy, statistic, support_key),
    }


def choose_extraction_policy(study, records):
    """Choose a deterministic policy after support and agreement are measured."""
    candidates = []
    for strategy in SAMPLING_STRATEGIES:
        for statistic in DEFAULT_STATISTICS:
            coverage = _coverage_for_policy(records, strategy, statistic)
            explicit = study[strategy][statistic]["osm_explicit"]
            levels = study[strategy][statistic]["osm_levels_derived"]
            overall = study[strategy][statistic]["overall"]
            if overall.get("n", 0) == 0:
                continue
            agreement_score = (
                (explicit.get("mae", 0.0) if explicit.get("n", 0) else 0.0)
                + (levels.get("mae", 0.0) if levels.get("n", 0) else 0.0)
                + 0.25 * (explicit.get("p90_absolute_error", 0.0) if explicit.get("n", 0) else 0.0)
                + 0.25 * (levels.get("p90_absolute_error", 0.0) if levels.get("n", 0) else 0.0)
            )
            single_pixel_rate = coverage.get("single_pixel_support", 0) / max(1, coverage["usable_external_height"])
            strategy_penalty = {
                "all_intersecting": 0.25,
                "pixel_center_inside": 0.0,
                "inward_buffered": 0.05,
                "robust_interior_quantile": 0.0,
            }[strategy]
            statistic_penalty = {"median": 0.0, "p75": 0.05, "mean": 0.10, "p90": 0.15, "min": 0.20, "max": 0.30}[statistic]
            score = agreement_score + single_pixel_rate + strategy_penalty + statistic_penalty
            candidates.append(
                {
                    "strategy": strategy,
                    "statistic": statistic,
                    "score": score,
                    "usable_external_height": coverage["usable_external_height"],
                    "single_pixel_support_rate": single_pixel_rate,
                    "agreement_score": agreement_score,
                }
            )
    if not candidates:
        return {
            "version": EXTRACTION_POLICY_VERSION,
            "status": "no_usable_policy",
            "strategy": "pixel_center_inside",
            "statistic": "median",
            "candidates": [],
            "rationale": "No footprint has positive raster support; no external height is selected.",
        }
    candidates.sort(key=lambda item: (item["score"], -item["usable_external_height"], item["strategy"], item["statistic"]))
    selected = candidates[0]
    return {
        "version": EXTRACTION_POLICY_VERSION,
        "status": "selected",
        "strategy": selected["strategy"],
        "statistic": selected["statistic"],
        "candidates": candidates,
        "rationale": (
            "Selected after the explicit/levels source-agreement study using agreement error, "
            "single-pixel support penalty, and edge-strategy/statistic robustness.  OSM is a "
            "comparison source rather than ground truth; the policy is diagnostic and does not "
            "activate canonical RF."
        ),
    }


def _diagnostic_policy_counts(records, baseline, strategy, statistic, policy_name):
    current = baseline.get("current_loader_height_audit", {})
    before_explicit = int(current.get("explicit_height_count", 0))
    before_levels = int(current.get("levels_derived_count", 0))
    before_fallback = int(current.get("fallback_only_count", 0))
    selected = 0
    selected_over_levels = 0
    selected_over_fallback = 0
    explicit_conflicts = 0
    level_conflicts = 0
    for record in records:
        height = _record_statistic(record, strategy, statistic)
        if height is None:
            continue
        source = record.get("osm_height_source")
        if source == "osm_explicit":
            explicit_conflicts += 1
        elif policy_name == "policy_a_explicit_levels_gba_fallback" and source == "unavailable":
            selected += 1
            selected_over_fallback += 1
        elif policy_name == "policy_b_explicit_gba_levels_fallback" and source in ("unavailable", "osm_levels_derived"):
            selected += 1
            if source == "unavailable":
                selected_over_fallback += 1
            else:
                selected_over_levels += 1
        if source == "osm_levels_derived":
            level_conflicts += 1
    after_levels = before_levels - selected_over_levels
    after_fallback = before_fallback - selected_over_fallback
    return {
        "name": policy_name,
        "precedence": (
            ["osm_explicit", "osm_levels_derived", "gba_height", "generic_fallback"]
            if policy_name.startswith("policy_a")
            else ["osm_explicit", "gba_height", "osm_levels_derived", "generic_fallback"]
        ),
        "before": {
            "explicit_height_count": before_explicit,
            "levels_derived_count": before_levels,
            "fallback_only_count": before_fallback,
        },
        "after_diagnostic": {
            "explicit_height_count": before_explicit,
            "levels_derived_count": after_levels,
            "external_selected_count": selected,
            "fallback_only_count": after_fallback,
            "qualified_or_trusted_count": before_explicit + after_levels + selected,
        },
        "fallback_reduction": {
            "absolute_buildings": selected_over_fallback,
            "percentage_points": selected_over_fallback / max(1, before_fallback) * 100.0,
            "percent_of_fallback_before": selected_over_fallback / max(1, before_fallback) * 100.0,
        },
        "coverage": {
            "selected_over_fallback": selected_over_fallback,
            "selected_over_levels": selected_over_levels,
            "external_selected_total": selected,
        },
        "conflict_screening": {
            "explicit_overlap_count": explicit_conflicts,
            "levels_overlap_count": level_conflicts,
            "note": "Overlap counts are not disagreement counts; see height-agreement artifact for thresholded conflicts.",
        },
        "canonical_activation": False,
    }


def _load_baseline(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _current_peak_rss_mb():
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return value / (1024.0 * 1024.0)
    return value / 1024.0


def build_fingerprint(source_release, index_metadata, tile_records, policy, evidence_policy):
    payload = {
        "source": SOURCE_NAME,
        "product": PRODUCT_NAME,
        "release": source_release,
        "official_index_sha256": {
            name: index_metadata[name]["sha256"] for name in sorted(index_metadata)
        },
        "tiles": [
            {
                "tile_id": tile["tile_id"],
                "path": tile["path"],
                "parent_archive": tile["parent_archive"],
                "parent_archive_sha512": tile.get("parent_archive_sha512"),
                "tile_sha256": tile.get("sha256"),
            }
            for tile in sorted(tile_records, key=lambda item: item["path"])
        ],
        "extraction_policy_version": policy["version"],
        "sampling_strategy": policy["strategy"],
        "selected_statistic": policy["statistic"],
        "evidence_policy": evidence_policy,
        "source_precedence_diagnostic_mode": "policy_a_and_policy_b; OSM explicit remains first",
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return "gba-height-%s" % hashlib.sha256(encoded).hexdigest(), payload


def write_audit_records(path, records):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, sort_keys=True, ensure_ascii=False, default=_json_default))
            handle.write("\n")
    os.replace(temporary, path)


def _build_temp_diagnostic_dataset(records, extraction_policy, precedence_policy_name, raw_dir):
    """Create a policy-specific, diagnostic-only building layer for the Go audit."""
    source_path = Path("data-pipeline/ankara_buildings.geojson")
    if not source_path.exists():
        return None
    strategy = extraction_policy["strategy"]
    statistic = extraction_policy["statistic"]
    allowed_sources = (
        {"unavailable"}
        if precedence_policy_name == "policy_a_explicit_levels_gba_fallback"
        else {"unavailable", "osm_levels_derived"}
    )
    selected_by_logical_id = defaultdict(list)
    for record in records:
        if record.get("osm_height_source") not in allowed_sources:
            continue
        value = _record_statistic(record, strategy, statistic)
        if value is not None and math.isfinite(float(value)) and 0 < float(value) <= 500:
            selected_by_logical_id[record["logical_id"]].append(float(value))
    selected_by_logical_id = {
        logical_id: distribution(values)["median"]
        for logical_id, values in selected_by_logical_id.items()
    }
    with source_path.open("r", encoding="utf-8") as handle:
        document = json.load(handle)
    for feature_index, feature in enumerate(document.get("features", [])):
        properties = feature.setdefault("properties", {})
        logical_id = "osm-feature-%08d" % (feature_index + 1)
        source_id = feature.get("id")
        if source_id is not None and str(source_id).strip():
            logical_id = str(source_id).strip()
        else:
            properties = feature.get("properties") or {}
            for key in ("id", "osm_id", "@id", "osmid"):
                if properties.get(key) is not None and str(properties[key]).strip():
                    logical_id = str(properties[key]).strip()
                    break
        value = selected_by_logical_id.get(logical_id)
        if value is not None and math.isfinite(float(value)) and 0 < float(value) <= 500:
            _, original_source, _ = _parse_feature_height(properties)
            if original_source != "osm_explicit":
                properties["height"] = float(value)
                properties["gba_height_diagnostic_m"] = float(value)
                properties["gba_height_diagnostic_policy"] = precedence_policy_name
    output = (
        Path(raw_dir)
        / "diagnostic-packs"
        / (extraction_policy["version"] + "-" + precedence_policy_name + "-" + statistic + ".geojson")
    )
    write_json(output, document)
    return output


def _feature_logical_id(feature, feature_index):
    """Return the same ID shape as the Go GeoJSON loader for this pack."""
    source_id = feature.get("id")
    properties = feature.get("properties") or {}
    if source_id is None:
        for key in ("id", "osm_id", "@id", "osmid"):
            if properties.get(key) is not None and str(properties[key]).strip():
                source_id = properties[key]
                break
    if source_id is None:
        return "feature-%d" % feature_index
    return str(source_id).strip().replace(" ", "-")


def _parse_feature_height(properties):
    """Parse a source feature using the same precedence as the OSM audit."""
    explicit_value = parse_building_length(properties.get("height"))
    if explicit_value is not None:
        return explicit_value, "osm_explicit", properties.get("height")
    levels = properties.get("building:levels")
    try:
        levels_value = float(levels) if levels is not None else None
    except (TypeError, ValueError):
        levels_value = None
    if levels_value is not None and math.isfinite(levels_value) and levels_value > 0:
        return min(levels_value * 3.0, 500.0), "osm_levels_derived", levels
    return None, "unavailable", None


def _parse_go_map_counts(text):
    return {
        key: int(value)
        for key, value in re.findall(r"([A-Za-z0-9_]+):([0-9]+)", text)
    }


def _parse_go_diagnostic_summary(output):
    """Extract compact numeric summaries before truncating verbose Go logs."""
    summary = {}
    height_match = re.search(
        r"height_evidence_audit=\{([^\n}]*)\}", output
    )
    if height_match:
        summary["height_evidence_audit"] = {
            key: float(value) if "." in value else int(value)
            for key, value in re.findall(r"([A-Za-z0-9_]+):([^ ]+)", height_match.group(1))
        }
    transitions_match = re.search(
        r"height_aware_transitions=map\[([^\]]*)\] paths=([0-9]+)", output
    )
    if transitions_match:
        summary["height_aware_transitions"] = {
            "paths": int(transitions_match.group(2)),
            "transitions": _parse_go_map_counts(transitions_match.group(1)),
        }
    diffraction_match = re.search(
        r"diffraction_availability=map\[([^\]]*)\]", output
    )
    if diffraction_match:
        summary["diffraction_availability"] = _parse_go_map_counts(diffraction_match.group(1))
    reflection_match = re.search(r"ankara_reflection_readiness=(\{[^\n]*\})", output)
    if reflection_match:
        try:
            summary["reflection_readiness"] = json.loads(reflection_match.group(1))
        except json.JSONDecodeError:
            summary["reflection_readiness_parse_error"] = True
    return summary


def run_go_readiness_diagnostics(policy_name, diagnostic_buildings, raw_dir, backend_dir):
    """Run existing read-only Go audits against a temporary diagnostic layer."""
    if diagnostic_buildings is None or not Path(backend_dir).exists():
        return {"status": "not_run_missing_backend_or_diagnostic_buildings"}
    source_root = Path("data-pipeline")
    pack_root = Path(raw_dir) / "diagnostic-packs" / policy_name
    pack_root.mkdir(parents=True, exist_ok=True)
    for name in ("manifest.json", "ankara_5g_nodes.geojson"):
        target = pack_root / name
        if not target.exists():
            shutil.copy2(source_root / name, target)
    shutil.copy2(diagnostic_buildings, pack_root / "ankara_buildings.geojson")
    diagnostic_manifest_path = pack_root / "manifest.json"
    with diagnostic_manifest_path.open("r", encoding="utf-8") as handle:
        diagnostic_manifest = json.load(handle)
    diagnostic_manifest.setdefault("sha256", {})["ankara_buildings.geojson"] = sha256_file(
        diagnostic_buildings
    )
    write_json(diagnostic_manifest_path, diagnostic_manifest)
    env = dict(os.environ)
    env.update(
        {
            "ATOM_DATASET_DIR": str(pack_root.resolve()),
            "ATOM_RUN_CANONICAL_HEIGHT_AUDIT": "1",
            "ATOM_RUN_CANONICAL_DIFFRACTION_AUDIT": "1",
            "ATOM_RUN_CONCEPT_4I5A_READINESS": "1",
        }
    )
    command = ["go", "test", "./raytracer", "-run", "TestCanonicalAnkara|TestConcept4I5AAnkara", "-count=1", "-v"]
    completed = subprocess.run(command, cwd=backend_dir, env=env, capture_output=True, text=True, check=False)
    output = completed.stdout + completed.stderr
    return {
        "status": "passed" if completed.returncode == 0 else "failed",
        "command": " ".join(command),
        "dataset_root": str(pack_root),
        "return_code": completed.returncode,
        "summary": _parse_go_diagnostic_summary(output),
        "log": output[-4000:],
        "canonical_coupling": False,
    }


def run(args):
    started = time.monotonic()
    manifest = _load_baseline(args.manifest)
    baseline = _load_baseline(args.baseline)
    aoi_bounds = [float(value) for value in manifest["bounds"]]
    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    index_dir = Path(args.index_dir or raw_dir / "official-index")
    height_tif, height_zip, index_metadata = _load_or_download_index_files(
        index_dir,
        args.download,
        args.ftp_host,
        args.index_ftp_user,
        args.index_ftp_password,
    )
    selected_tiles, selected_archives = select_aoi_height_tiles(height_tif, height_zip, aoi_bounds)
    if len(selected_tiles) != 25:
        raise RuntimeError("expected 25 exact Ankara 0.2-degree height tiles, found %d" % len(selected_tiles))
    if args.download or all((raw_dir / "tiles" / tile["tile_id"]).exists() for tile in selected_tiles):
        tile_records = materialise_height_tiles(
            selected_tiles,
            selected_archives,
            raw_dir,
            args.ftp_host,
            args.data_ftp_user,
            args.data_ftp_password,
            args.download,
        )
    else:
        raise RuntimeError("selected GBA.Height tiles are missing; use --download")
    archive_records_by_path = {archive["path"]: archive for archive in selected_archives}
    for archive_path, archive in archive_records_by_path.items():
        members = [tile for tile in tile_records if tile["parent_archive"] == archive_path]
        if members:
            archive.update(
                {
                    "source_url": "ftp://%s/%s" % (args.ftp_host, _normalise_remote_path(archive_path)),
                    "archive_size": members[0]["parent_archive_size"],
                    "official_sha512": members[0]["parent_archive_sha512"],
                    "selected_member_count": len(members),
                    "selected_member_compressed_bytes": sum(
                        tile["zip_member_compressed_bytes"] for tile in members
                    ),
                    "selected_member_uncompressed_bytes": sum(
                        tile["zip_member_uncompressed_bytes"] for tile in members
                    ),
                }
            )
    raster_quality = inspect_rasters(tile_records)
    osm_source_records = load_osm_records(args.buildings)
    osm_records = [record for record in expand_loader_visible_osm_records(osm_source_records) if record["geometry"].intersects(box(*aoi_bounds))]
    expected_loader_visible = int(baseline["dataset"]["loader_visible_footprints"])
    if len(osm_records) != expected_loader_visible:
        raise RuntimeError(
            "OSM loader-visible footprint count differs from pre-change baseline: %d (expected %d)"
            % (len(osm_records), expected_loader_visible)
        )
    sampled_records, sampling_runtime = sample_gba_rasters(tile_records, osm_records, aoi_bounds)
    audit_record_path = Path(args.audit_records or raw_dir / "gba-height-footprint-audit.jsonl")
    write_audit_records(audit_record_path, sampled_records)
    study = agreement_study(sampled_records)
    policy = choose_extraction_policy(study, sampled_records)
    strategy = policy["strategy"]
    statistic = policy["statistic"]
    coverage = _coverage_for_policy(sampled_records, strategy, statistic)
    height_dist = height_distribution(sampled_records, strategy, statistic)
    agreement = {
        "schema_version": 1,
        "concept": CONCEPT,
        "product": PRODUCT_NAME,
        "statistic_selection": policy,
        "study": study,
        "selected_policy_agreement": study.get(strategy, {}).get(statistic, {}),
        "selected_policy_spatial_error_patterns": spatial_error_patterns(sampled_records, strategy, statistic),
    }
    policies = {
        "policy_a_explicit_levels_gba_fallback": _diagnostic_policy_counts(
            sampled_records, baseline, strategy, statistic, "policy_a_explicit_levels_gba_fallback"
        ),
        "policy_b_explicit_gba_levels_fallback": _diagnostic_policy_counts(
            sampled_records, baseline, strategy, statistic, "policy_b_explicit_gba_levels_fallback"
        ),
    }
    fingerprint, fingerprint_payload = build_fingerprint(
        args.release,
        index_metadata,
        tile_records,
        policy,
        "OSM explicit remains authoritative; GBA is qualified diagnostic evidence only",
    )
    go_diagnostics = {}
    if args.run_go_diagnostics and policy.get("status") == "selected":
        for policy_name, precedence_policy in policies.items():
            diagnostic_buildings = _build_temp_diagnostic_dataset(
                sampled_records, policy, policy_name, raw_dir
            )
            go_diagnostics[policy_name] = run_go_readiness_diagnostics(
                policy_name, diagnostic_buildings, raw_dir, args.backend_dir
            )
    acquisition_manifest = {
        "schema_version": 1,
        "concept": CONCEPT,
        "title": "Ankara GBA.Height acquisition manifest",
        "artifact": "acquisition-manifest",
        "source": {
            "provider": SOURCE_NAME,
            "product": PRODUCT_NAME,
            "release": args.release,
            "source_readme": SOURCE_README_URL,
            "repository": SOURCE_REPOSITORY_URL,
            "publication": SOURCE_PUBLICATION_URL,
            "mediaTUM": SOURCE_MEDIA_TUM_URL,
            "terms_of_use": SOURCE_TERMS_URL,
            "license": "CC BY-NC 4.0",
            "license_url": SOURCE_LICENSE_URL,
            "format": "GeoTIFF height map entries in official 5-degree ZIP archives",
            "nominal_resolution": "3 m x 3 m",
            "source_imagery": "PlanetScope surface-reflectance imagery; source paper describes approximately 3 m imagery and 2018/2019 acquisition selection",
            "acquisition_epoch": "source paper reports 2018/2019 PlanetScope imagery; tile metadata does not expose a per-pixel acquisition date",
            "height_semantics": "qualified relative building/object height above local ground (nDSM-style model prediction), not absolute elevation",
            "uncertainty_semantics": "per-pixel variance across up to four test-time-augmentation predictions; not a calibrated physical confidence interval",
        },
        "active_aoi": {
            "dataset_manifest": args.manifest,
            "dataset_id": manifest.get("id"),
            "dataset_version": manifest.get("version"),
            "bounds_west_south_east_north": aoi_bounds,
            "crs": manifest.get("crs"),
            "selection_rule": "official height_tif.geojson entries whose tile bounds intersect the exact active AOI",
        },
        "official_indexes": {
            "files": index_metadata,
            "height_tif_feature_count": len(height_tif.get("features", [])),
            "height_zip_feature_count": len(height_zip.get("features", [])),
        },
        "selected_parent_archives": selected_archives,
        "selected_tiles": tile_records,
        "raw_storage": {
            "mode": "external_cache",
            "directory": str(raw_dir),
            "repository_committed": False,
            "acquisition_method": "official FTP; ZIP central-directory tail plus exact compressed member ranges",
            "parent_archives_fully_downloaded": False,
        },
        "controlled_fixture_suite": {
            "name": "A-L external-height evidence fixtures",
            "test_file": "data-pipeline/test_external_height_pilot.py",
            "fixtures": CONTROLLED_FIXTURES,
            "scope": "matching, precedence, disagreement, fallback, and input-QA contracts reused by this diagnostic source adapter",
        },
        "canonical_rf_activation": False,
    }
    raster_quality.update(
        {
            "schema_version": 1,
            "concept": CONCEPT,
            "product": PRODUCT_NAME,
            "source_release": args.release,
            "active_aoi": aoi_bounds,
            "footprint_sampling": {
                "geometry_source": "existing OSM footprint layer",
                "loader_visible_footprints": len(osm_records),
                "source_features": len(osm_source_records),
                "strategies": list(SAMPLING_STRATEGIES),
                "inward_buffer_m": INWARD_BUFFER_M,
                "selected_strategy": strategy,
                "selected_statistic": statistic,
                "edge_pixels_are_not_silently_dropped": True,
                "small_buildings": "zero center support is insufficient; one positive center pixel is retained with single_pixel_support qualification",
            },
            "coverage_audit": coverage,
            "height_distribution_selected_policy": height_dist,
            "sampling_runtime": sampling_runtime,
            "peak_rss_mb": _current_peak_rss_mb(),
        }
    )
    agreement["fingerprint"] = fingerprint
    policy_comparison = {
        "schema_version": 1,
        "concept": CONCEPT,
        "title": "GBA.Height diagnostic precedence policy comparison",
        "before_artifact": args.baseline,
        "selected_extraction_policy": policy,
        "policies": policies,
        "conflict_reference": agreement["selected_policy_agreement"],
        "canonical_policy_changed": False,
        "notes": [
            "Policy A leaves OSM levels ahead of GBA; Policy B places qualified GBA ahead of levels for diagnostic comparison only.",
            "OSM explicit height remains ahead of GBA in both policies.",
            "Neither policy is canonical and neither changes RF, LOS/NLOS, diffraction, reflection, interference, radio quality, optimization, or fingerprints.",
        ],
    }
    data_quality_impact = {
        "schema_version": 1,
        "concept": CONCEPT,
        "title": "Ankara GBA.Height data-quality impact",
        "before_artifact": args.baseline,
        "loader_visible_footprints": len(sampled_records),
        "raster_tile_covered": coverage.get("raster_tile_covered", 0),
        "valid_raster_support": coverage.get("valid_raster_support", 0),
        "usable_external_height": coverage.get("usable_external_height", 0),
        "fallback_before": baseline.get("current_loader_height_audit", {}).get("fallback_only_count"),
        "policies": policies,
        "height_distribution": height_dist,
        "agreement": agreement["selected_policy_agreement"],
        "conflict_rate": agreement["selected_policy_agreement"].get("conflict_rate_over_osm_height_matches", 0.0),
        "canonical_activation": False,
    }
    readiness_impact = {
        "schema_version": 1,
        "concept": CONCEPT,
        "title": "Ankara GBA.Height readiness impact",
        "before_artifact": args.baseline,
        "selected_extraction_policy": policy,
        "p526": {
            "before": baseline.get("p526_readiness", {}),
            "diagnostic_go_runs": go_diagnostics,
            "after_by_policy": {
                name: value.get("summary", {}) for name, value in go_diagnostics.items()
            },
            "canonical_coupling": False,
        },
        "p1411": {
            "before": baseline.get("p1411_readiness", {}),
            "diagnostic_effect": "height evidence alone does not establish morphology or rooftop relation; remains not_ready",
            "after_by_policy": {
                name: {
                    "status": "not_ready",
                    "reason": "No terrain, morphology taxonomy, or below-rooftop proof is introduced by GBA.Height.",
                }
                for name in go_diagnostics
            },
            "canonical_coupling": False,
        },
        "reflection": {
            "before": baseline.get("reflection_readiness", {}),
            "diagnostic_go_runs": go_diagnostics,
            "after_by_policy": {
                name: value.get("summary", {}).get("reflection_readiness", {})
                for name, value in go_diagnostics.items()
            },
            "remaining_blockers": ["terrain", "material", "roughness"],
            "canonical_coupling": False,
        },
        "path_432": {
            "before": baseline.get("height_aware_los_audit", {}),
            "diagnostic_go_runs": go_diagnostics,
            "after_by_policy": {
                name: value.get("summary", {}).get("height_aware_transitions", {})
                for name, value in go_diagnostics.items()
            },
            "canonical_coupling": False,
        },
        "inspector": {
            "before": "GET /api/spatial-evidence and GET /api/spatial-evidence/buildings/:id remain diagnostic-only",
            "after": "unchanged; GBA.Height is not attached to the active pack or inspector ledger",
            "canonical_activation": False,
        },
    }
    post_comparison = {
        "schema_version": 1,
        "concept": CONCEPT,
        "title": "Ankara GBA.Height post-change diagnostic comparison",
        "before_artifact": args.baseline,
        "source": SOURCE_NAME,
        "product": PRODUCT_NAME,
        "after": {
            "coverage": coverage,
            "height_distribution": height_dist,
            "agreement": agreement["selected_policy_agreement"],
            "policy_comparison": policies,
            "readiness": readiness_impact,
        },
        "fingerprint": fingerprint,
        "fingerprint_inputs": fingerprint_payload,
        "canonical_invariance": {
            "canonical_2_6_ghz": "unchanged",
            "canonical_28_ghz": "unchanged",
            "research_sub_thz": "unchanged",
            "building_entry": "unchanged",
            "p526_canonical_status": "unchanged",
            "p1411": "unchanged",
            "reflection": "unchanged",
            "interference": "unchanged",
            "radio_quality": "unchanged",
            "optimizer": "unchanged",
            "canonical_fingerprints": "unchanged",
            "spatial_evidence_inspector": "unchanged",
        },
        "performance": {
            "total_elapsed_seconds": time.monotonic() - started,
            "sampling": sampling_runtime,
            "peak_rss_mb": _current_peak_rss_mb(),
            "raster_io": "windowed reads per OSM footprint; no full-raster read per building",
        },
        "reproducibility": {
            "command": "python data-pipeline/gba_height_pilot.py --manifest data-pipeline/manifest.json --buildings data-pipeline/ankara_buildings.geojson --baseline docs/concept-4f3a2-pre-change-baseline.json --raw-dir /tmp/atom-gba-height-2026 --output-dir docs --download",
            "same_inputs_same_code_same_fingerprint": True,
            "ui_state_excluded": True,
        },
        "decision": _promotion_decision(
            coverage, agreement["selected_policy_agreement"], policies, policy
        ),
        "remaining_evidence_gaps": [
            "Ankara-local independent ground truth is not supplied by this pilot.",
            "The source is ML-derived; 3 m spatial resolution is not 3 m vertical accuracy.",
            "Commercial production dependency remains prohibited_or_unresolved under CC BY-NC 4.0.",
            "Derived per-building sidecars remain outside distributable production artifacts pending license review.",
        ],
    }
    output_dir = Path(args.output_dir)
    write_json(output_dir / "concept-4f3a2-acquisition-manifest.json", acquisition_manifest)
    write_json(output_dir / "concept-4f3a2-raster-quality.json", raster_quality)
    write_json(output_dir / "concept-4f3a2-height-agreement.json", agreement)
    write_json(output_dir / "concept-4f3a2-policy-comparison.json", policy_comparison)
    write_json(output_dir / "concept-4f3a2-data-quality-impact.json", data_quality_impact)
    write_json(output_dir / "concept-4f3a2-readiness-impact.json", readiness_impact)
    write_json(output_dir / "concept-4f3a2-post-change-comparison.json", post_comparison)
    return post_comparison


def _promotion_decision(coverage, agreement, policies, extraction_policy):
    """Apply an explicit diagnostic gate; this never authorizes canonical RF use."""
    total = max(1, coverage.get("total_loader_visible_footprints", 0))
    usable = coverage.get("usable_external_height", 0)
    coverage_fraction = usable / total
    conflict_rate = agreement.get("conflict_rate_over_osm_height_matches", 0.0)
    selected = policies.get("policy_a_explicit_levels_gba_fallback", {}).get("coverage", {}).get(
        "external_selected_total", 0
    )
    gates = {
        "policy_selected": extraction_policy.get("status") == "selected",
        "substantial_coverage": coverage_fraction >= 0.10,
        "agreement_conflict_rate_below_25_pct": conflict_rate < 0.25,
        "policy_a_has_external_fallback_reduction": selected > 0,
        "license_allows_bounded_noncommercial_diagnostic": True,
    }
    return {
        "status": "GO" if all(gates.values()) else "NO-GO",
        "label": (
            "GO for a bounded future 4F.3B comparison experiment"
            if all(gates.values())
            else "NO-GO for a future 4F.3B comparison experiment"
        ),
        "gates": gates,
        "measured": {
            "usable_external_height": usable,
            "loader_visible_footprints": total,
            "coverage_fraction": coverage_fraction,
            "conflict_rate": conflict_rate,
            "policy_a_external_selected_total": selected,
        },
        "scope": "diagnostic-only; does not approve production or commercial dependency and does not activate canonical RF",
    }


def build_argument_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="data-pipeline/manifest.json")
    parser.add_argument("--buildings", default="data-pipeline/ankara_buildings.geojson")
    parser.add_argument("--baseline", default="docs/concept-4f3a2-pre-change-baseline.json")
    parser.add_argument("--raw-dir", default="/tmp/atom-gba-height-2026")
    parser.add_argument("--index-dir")
    parser.add_argument("--audit-records")
    parser.add_argument("--output-dir", default="docs")
    parser.add_argument("--release", default=SOURCE_RELEASE)
    parser.add_argument("--ftp-host", default=SOURCE_FTP_HOST)
    parser.add_argument("--index-ftp-user", default=SOURCE_INDEX_USER)
    parser.add_argument("--index-ftp-password", default=SOURCE_INDEX_PASSWORD)
    parser.add_argument("--data-ftp-user", default=SOURCE_DATA_USER)
    parser.add_argument("--data-ftp-password", default=SOURCE_DATA_PASSWORD)
    parser.add_argument("--backend-dir", default="backend-go")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--run-go-diagnostics", action="store_true")
    return parser


def main(argv=None):
    args = build_argument_parser().parse_args(argv)
    result = run(args)
    print(
        json.dumps(
            {
                "decision": result["decision"],
                "usable_external_height": result["after"]["coverage"].get("usable_external_height", 0),
                "fingerprint": result["fingerprint"],
                "elapsed_seconds": result["performance"]["total_elapsed_seconds"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
