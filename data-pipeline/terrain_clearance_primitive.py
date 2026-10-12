"""Authoritative source-local terrain-clearance primitive.

The primitive is intentionally independent of raster I/O and RF behavior. It
accepts one already sampled terrain profile, constructs the absolute radio
line from that same source's endpoint terrain values, and evaluates exactly
``radio elevation - terrain elevation``. The result is diagnostic evidence;
it is never a canonical LOS/NLOS or propagation state.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import hashlib
import json
import math
from typing import Any, Iterable, Mapping, Sequence


PRIMITIVE_VERSION = "terrain-clearance-primitive-v1"
STATUS_AVAILABLE = "available"
STATUS_PARTIAL = "partial_profile"
STATUS_UNAVAILABLE = "unavailable"

CLASS_CLEAR = "clear"
CLASS_OBSTRUCTION_CANDIDATE = "obstruction_candidate"
CLASS_NEAR_UNCERTAINTY_BOUNDARY = "near_uncertainty_boundary"
CLASS_UNAVAILABLE = "unavailable"

SAMPLE_VALID = "valid"
INVALID_SAMPLE_STATUSES = frozenset({"no_data", "outside_dataset", "unavailable", "nan", "inf"})
ENDPOINT_PROXIMITY_M = 30.0
SUPPORTED_INTERPOLATIONS = frozenset({"nearest", "bilinear"})


@dataclass(frozen=True)
class TerrainSourceMetadata:
    source: str
    source_version: str = ""
    dataset_id: str = ""
    source_checksum: str = ""
    raster_resolution_m: float = 0.0
    interpolation: str = "bilinear"
    vertical_datum: str = ""
    datum_kind: str = ""
    geoid_model: str = ""


@dataclass(frozen=True)
class TerrainClearanceSampleInput:
    index: int
    path_distance_m: float
    path_fraction: float
    lon: float
    lat: float
    terrain_elevation_m: float | None
    sample_status: str = SAMPLE_VALID
    source_tile: str | None = None
    source_metadata: TerrainSourceMetadata | None = None


@dataclass
class TerrainClearanceSample:
    index: int
    path_distance_m: float
    path_fraction: float
    lon: float
    lat: float
    terrain_elevation_m: float | None
    radio_elevation_m: float | None
    clearance_m: float | None
    sample_status: str
    valid: bool
    source_tile: str | None = None


@dataclass
class TerrainClearanceResult:
    primitive_version: str
    status: str
    minimum_clearance_m: float | None
    minimum_clearance_distance_m: float | None
    minimum_clearance_fraction: float | None
    minimum_location: str | None
    tx_endpoint_clearance_m: float | None
    rx_endpoint_clearance_m: float | None
    tx_height_agl_m: float
    rx_height_agl_m: float
    sample_count: int
    valid_sample_count: int
    classification: str
    source: str
    source_version: str
    dataset_id: str
    source_checksum: str
    raster_resolution_m: float
    source_resolution_m: float
    requested_spacing_m: float
    effective_spacing_m: float
    interpolation: str
    vertical_datum: str
    datum_kind: str
    geoid_model: str
    uncertainty_margin_m: float | None
    margin_policy: str
    assumptions: list[str] = field(default_factory=list)
    qualifications: list[str] = field(default_factory=list)
    fingerprint: str = ""
    samples: list[TerrainClearanceSample] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def radio_line_elevation(z_tx_radio_m: float, z_rx_radio_m: float, fraction: float) -> float:
    """Return the linear absolute radio elevation for ``fraction`` in [0, 1]."""

    if not 0.0 <= float(fraction) <= 1.0:
        raise ValueError(f"profile fraction outside [0,1]: {fraction}")
    return float(z_tx_radio_m + float(fraction) * (z_rx_radio_m - z_tx_radio_m))


def terrain_clearance_m(radio_elevation_m: float, terrain_elevation_m: float) -> float:
    """Authoritative sign: radio elevation minus terrain elevation."""

    return float(radio_elevation_m) - float(terrain_elevation_m)


def classify_clearance(minimum_clearance_m: float | None, unavailable: bool, margin_m: float | None = 0.0) -> str:
    """Apply strict-zero or an explicitly supplied diagnostic margin."""

    if unavailable or minimum_clearance_m is None:
        return CLASS_UNAVAILABLE
    margin = 0.0 if margin_m is None else float(margin_m)
    if not math.isfinite(margin) or margin < 0.0:
        raise ValueError("uncertainty margin must be finite and non-negative")
    if margin == 0.0:
        return CLASS_OBSTRUCTION_CANDIDATE if minimum_clearance_m < 0.0 else CLASS_CLEAR
    if minimum_clearance_m < -margin:
        return CLASS_OBSTRUCTION_CANDIDATE
    if abs(minimum_clearance_m) <= margin:
        return CLASS_NEAR_UNCERTAINTY_BOUNDARY
    return CLASS_CLEAR


def evaluate_terrain_clearance(
    samples: Sequence[TerrainClearanceSampleInput | Mapping[str, Any]],
    *,
    source: TerrainSourceMetadata | Mapping[str, Any],
    tx_height_agl_m: float,
    rx_height_agl_m: float,
    distance_m: float,
    requested_spacing_m: float,
    effective_spacing_m: float,
    margin_m: float | None = None,
) -> TerrainClearanceResult:
    """Evaluate one source-local sampled path.

    Endpoint samples are included in the minimum. A partial profile may retain
    a minimum over valid samples for inspection, but its classification is
    always ``unavailable`` so missing evidence cannot manufacture a candidate.
    """

    source_metadata = _coerce_source(source)
    normalized_interpolation = str(source_metadata.interpolation).strip().lower()
    if normalized_interpolation not in SUPPORTED_INTERPOLATIONS:
        raise ValueError("terrain interpolation must be nearest or bilinear")
    _validate_finite_nonnegative("Tx AGL", tx_height_agl_m)
    _validate_finite_nonnegative("Rx AGL", rx_height_agl_m)
    _validate_positive_finite("distance", distance_m)
    _validate_positive_finite("requested spacing", requested_spacing_m)
    _validate_positive_finite("effective spacing", effective_spacing_m)
    if margin_m is not None:
        _validate_finite_nonnegative("uncertainty margin", margin_m)
    if not samples:
        raise ValueError("terrain clearance profile requires at least one sample")

    normalized_samples = [_coerce_sample(sample, index, distance_m) for index, sample in enumerate(samples)]
    _validate_source_local_sample_metadata(normalized_samples, source_metadata)
    if normalized_samples[0].path_fraction != 0.0:
        normalized_samples[0] = _with_fraction(normalized_samples[0], 0.0)
    if normalized_samples[-1].path_fraction != 1.0:
        normalized_samples[-1] = _with_fraction(normalized_samples[-1], 1.0)

    valid_flags = [_sample_is_valid(sample) for sample in normalized_samples]
    valid_sample_count = sum(valid_flags)
    endpoint_valid = len(normalized_samples) >= 2 and valid_flags[0] and valid_flags[-1]

    tx_radio_m = None
    rx_radio_m = None
    if endpoint_valid:
        tx_radio_m = float(normalized_samples[0].terrain_elevation_m) + float(tx_height_agl_m)
        rx_radio_m = float(normalized_samples[-1].terrain_elevation_m) + float(rx_height_agl_m)

    result_samples: list[TerrainClearanceSample] = []
    minimum: tuple[float, TerrainClearanceSample] | None = None
    for sample, valid in zip(normalized_samples, valid_flags):
        radio = None
        clearance = None
        if endpoint_valid:
            radio = radio_line_elevation(float(tx_radio_m), float(rx_radio_m), sample.path_fraction)
            if valid:
                clearance = terrain_clearance_m(radio, float(sample.terrain_elevation_m))
        result_sample = TerrainClearanceSample(
            index=sample.index,
            path_distance_m=sample.path_distance_m,
            path_fraction=sample.path_fraction,
            lon=sample.lon,
            lat=sample.lat,
            terrain_elevation_m=sample.terrain_elevation_m,
            radio_elevation_m=radio,
            clearance_m=clearance,
            sample_status=sample.sample_status,
            valid=valid,
            source_tile=sample.source_tile,
        )
        result_samples.append(result_sample)
        if clearance is not None and (minimum is None or clearance < minimum[0]):
            minimum = (clearance, result_sample)

    minimum_value = minimum[0] if minimum is not None else None
    minimum_sample = minimum[1] if minimum is not None else None
    complete = endpoint_valid and valid_sample_count == len(normalized_samples) and minimum_sample is not None
    if not endpoint_valid or minimum_sample is None:
        status = STATUS_UNAVAILABLE
    elif not complete:
        status = STATUS_PARTIAL
    else:
        status = STATUS_AVAILABLE

    tx_endpoint_clearance = float(tx_height_agl_m) if endpoint_valid else None
    rx_endpoint_clearance = float(rx_height_agl_m) if endpoint_valid else None
    result = TerrainClearanceResult(
        primitive_version=PRIMITIVE_VERSION,
        status=status,
        minimum_clearance_m=minimum_value,
        minimum_clearance_distance_m=minimum_sample.path_distance_m if minimum_sample else None,
        minimum_clearance_fraction=minimum_sample.path_fraction if minimum_sample else None,
        minimum_location=_minimum_location(minimum_sample, len(result_samples), distance_m),
        tx_endpoint_clearance_m=tx_endpoint_clearance,
        rx_endpoint_clearance_m=rx_endpoint_clearance,
        tx_height_agl_m=float(tx_height_agl_m),
        rx_height_agl_m=float(rx_height_agl_m),
        sample_count=len(result_samples),
        valid_sample_count=valid_sample_count,
        classification=classify_clearance(minimum_value, status != STATUS_AVAILABLE, margin_m),
        source=source_metadata.source,
        source_version=source_metadata.source_version,
        dataset_id=source_metadata.dataset_id,
        source_checksum=source_metadata.source_checksum,
        raster_resolution_m=float(source_metadata.raster_resolution_m),
        source_resolution_m=float(source_metadata.raster_resolution_m),
        requested_spacing_m=float(requested_spacing_m),
        effective_spacing_m=float(effective_spacing_m),
        interpolation=normalized_interpolation,
        vertical_datum=source_metadata.vertical_datum,
        datum_kind=source_metadata.datum_kind,
        geoid_model=source_metadata.geoid_model,
        uncertainty_margin_m=None if margin_m is None else float(margin_m),
        margin_policy=_margin_policy(margin_m),
        assumptions=[
            "z_tx_abs = terrain_at_tx + tx_height_agl_m",
            "z_rx_abs = terrain_at_rx + rx_height_agl_m",
            "z_radio(u) = z_tx_abs + u * (z_rx_abs - z_tx_abs), for u in [0,1]",
            "clearance_m = radio_elevation_m - terrain_elevation_m; positive means above terrain",
            "minimum clearance is the minimum over valid sampled clearances and includes endpoints",
        ],
        qualifications=[
            "sampled terrain evidence is constrained by raster resolution and is not an exact continuous terrain-intersection test",
            "diagnostic-only result; classification is not canonical LOS/NLOS or RF state",
        ],
        samples=result_samples,
    )
    if effective_spacing_m > requested_spacing_m:
        result.qualifications.append("effective spacing was bounded by the source raster resolution")
    if not source_metadata.vertical_datum or not source_metadata.datum_kind:
        result.qualifications.append("source vertical datum identity is incomplete; result remains source-local diagnostic evidence")
    if status == STATUS_PARTIAL:
        result.qualifications.append("one or more samples is no_data, outside_dataset, unavailable, NaN, or Inf; no obstruction classification is emitted")
    result.fingerprint = clearance_fingerprint(result)
    return result


def clearance_fingerprint(result: TerrainClearanceResult) -> str:
    """Hash model identity, source metadata, geometry, and policy only."""

    payload = {
        "primitive_version": result.primitive_version,
        "source": result.source,
        "source_version": result.source_version,
        "dataset_id": result.dataset_id,
        "source_checksum": result.source_checksum,
        "vertical_datum": result.vertical_datum,
        "datum_kind": result.datum_kind,
        "geoid_model": result.geoid_model,
        "raster_resolution_m": result.raster_resolution_m,
        "interpolation": result.interpolation,
        "requested_spacing_m": result.requested_spacing_m,
        "effective_spacing_m": result.effective_spacing_m,
        "tx_height_agl_m": result.tx_height_agl_m,
        "rx_height_agl_m": result.rx_height_agl_m,
        "uncertainty_margin_m": result.uncertainty_margin_m,
        "margin_policy": result.margin_policy,
        "geometry": [
            {
                "distance_m": sample.path_distance_m,
                "fraction": sample.path_fraction,
                "lon": sample.lon,
                "lat": sample.lat,
            }
            for sample in result.samples
        ],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _coerce_source(source: TerrainSourceMetadata | Mapping[str, Any]) -> TerrainSourceMetadata:
    if isinstance(source, TerrainSourceMetadata):
        return source
    return TerrainSourceMetadata(
        source=str(source.get("source", "")),
        source_version=str(source.get("source_version", "")),
        dataset_id=str(source.get("dataset_id", "")),
        source_checksum=str(source.get("source_checksum", "")),
        raster_resolution_m=float(source.get("raster_resolution_m", source.get("resolution_m", 0.0)) or 0.0),
        interpolation=str(source.get("interpolation", "bilinear")),
        vertical_datum=str(source.get("vertical_datum", "")),
        datum_kind=str(source.get("datum_kind", source.get("vertical_datum_kind", ""))),
        geoid_model=str(source.get("geoid_model", "")),
    )


def _coerce_sample(sample: TerrainClearanceSampleInput | Mapping[str, Any], index: int, distance_m: float) -> TerrainClearanceSampleInput:
    if isinstance(sample, TerrainClearanceSampleInput):
        return sample
    terrain_value = sample.get("terrain_elevation_m", sample.get("terrain_m"))
    if terrain_value is not None:
        terrain_value = float(terrain_value)
    sample_status = str(sample.get("sample_status", sample.get("status", SAMPLE_VALID)))
    path_distance = float(sample.get("path_distance_m", sample.get("distance_m", 0.0)))
    fraction = float(sample.get("path_fraction", sample.get("fraction_u", path_distance / distance_m)))
    source_metadata = sample.get("source_metadata")
    if source_metadata is not None:
        source_metadata = _coerce_source(source_metadata)
    return TerrainClearanceSampleInput(
        index=int(sample.get("index", index)),
        path_distance_m=path_distance,
        path_fraction=fraction,
        lon=float(sample.get("lon", 0.0)),
        lat=float(sample.get("lat", 0.0)),
        terrain_elevation_m=terrain_value,
        sample_status=sample_status,
        source_tile=sample.get("source_tile"),
        source_metadata=source_metadata,
    )


def _validate_source_local_sample_metadata(samples: Iterable[TerrainClearanceSampleInput], source: TerrainSourceMetadata) -> None:
    source_identity = _source_identity(source)
    for index, sample in enumerate(samples):
        if sample.source_metadata is not None and _source_identity(sample.source_metadata) != source_identity:
            raise ValueError(f"terrain clearance sample {index} disagrees with source-local vertical datum identity")


def _source_identity(source: TerrainSourceMetadata) -> tuple[str, ...]:
    return (
        source.source,
        source.source_version,
        source.dataset_id,
        source.source_checksum,
        source.interpolation,
        source.vertical_datum,
        source.datum_kind,
        source.geoid_model,
    )


def _sample_is_valid(sample: TerrainClearanceSampleInput) -> bool:
    if sample.terrain_elevation_m is None:
        return False
    if str(sample.sample_status).strip().lower() in INVALID_SAMPLE_STATUSES:
        return False
    return math.isfinite(float(sample.terrain_elevation_m))


def _with_fraction(sample: TerrainClearanceSampleInput, fraction: float) -> TerrainClearanceSampleInput:
    return TerrainClearanceSampleInput(
        index=sample.index,
        path_distance_m=sample.path_distance_m,
        path_fraction=fraction,
        lon=sample.lon,
        lat=sample.lat,
        terrain_elevation_m=sample.terrain_elevation_m,
        sample_status=sample.sample_status,
        source_tile=sample.source_tile,
        source_metadata=sample.source_metadata,
    )


def _minimum_location(sample: TerrainClearanceSample | None, sample_count: int, distance_m: float) -> str | None:
    if sample is None:
        return None
    if sample.index == 0:
        return "at_tx"
    if sample.index == sample_count - 1:
        return "at_rx"
    if sample.path_distance_m <= ENDPOINT_PROXIMITY_M:
        return "near_tx"
    if distance_m - sample.path_distance_m <= ENDPOINT_PROXIMITY_M:
        return "near_rx"
    return "interior"


def _margin_policy(margin_m: float | None) -> str:
    if margin_m is None or float(margin_m) == 0.0:
        return "strict_zero"
    return f"symmetric_margin_{float(margin_m):g}_m"


def _validate_positive_finite(label: str, value: float) -> None:
    if float(value) <= 0.0 or not math.isfinite(float(value)):
        raise ValueError(f"{label} must be positive and finite")


def _validate_finite_nonnegative(label: str, value: float) -> None:
    if float(value) < 0.0 or not math.isfinite(float(value)):
        raise ValueError(f"{label} must be finite and non-negative")
