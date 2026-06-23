#!/usr/bin/env python3
"""Generate dependency-free SVG charts for the A.T.O.M academic report."""

from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUILDINGS_PATH = ROOT / "data-pipeline" / "ankara_buildings.geojson"
OUTPUT_DIR = Path(__file__).resolve().parent / "charts"

COLORS = {
    "ink": "#17201b",
    "muted": "#66736b",
    "grid": "#dce4da",
    "teal": "#0f766e",
    "emerald": "#10b981",
    "amber": "#f59e0b",
    "rose": "#e11d48",
    "slate": "#475569",
    "blue": "#2563eb",
}


def svg_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def number(value) -> float:
    try:
        if value in (None, ""):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def has_value(value) -> bool:
    if value is None:
        return False
    text = str(value).strip().lower()
    return text not in {"", "nan", "none", "null", "<na>", "n/a", "na", "no"}


def load_metrics() -> dict:
    data = json.loads(BUILDINGS_PATH.read_text())
    features = data.get("features", [])
    props = [feature.get("properties") or {} for feature in features]
    total = len(props)

    demand_positive = sum(number(row.get("demand_weight")) > 0 for row in props)
    residential_positive = sum(number(row.get("residential_demand")) > 0 for row in props)
    density_ge_25 = sum(number(row.get("density_score")) >= 25 for row in props)
    demand_or_residential = sum(
        number(row.get("demand_weight")) > 0 or number(row.get("residential_demand")) > 0
        for row in props
    )
    poi_only = sum(
        number(row.get("demand_weight")) > 0 and number(row.get("residential_demand")) == 0
        for row in props
    )
    residential_only = sum(
        number(row.get("demand_weight")) == 0 and number(row.get("residential_demand")) > 0
        for row in props
    )
    both = sum(
        number(row.get("demand_weight")) > 0 and number(row.get("residential_demand")) > 0
        for row in props
    )
    no_demand = total - poi_only - residential_only - both

    metadata = {
        "building:levels": sum(has_value(row.get("building:levels")) for row in props),
        "amenity": sum(has_value(row.get("amenity")) for row in props),
        "name": sum(has_value(row.get("name")) for row in props),
        "shop": sum(has_value(row.get("shop")) for row in props),
        "office": sum(has_value(row.get("office")) for row in props),
    }

    return {
        "total": total,
        "demand_positive": demand_positive,
        "residential_positive": residential_positive,
        "density_ge_25": density_ge_25,
        "demand_or_residential": demand_or_residential,
        "poi_only": poi_only,
        "residential_only": residential_only,
        "both": both,
        "no_demand": no_demand,
        "metadata": metadata,
    }


def write_svg(path: Path, width: int, height: int, body: str) -> None:
    path.write_text(
        "\n".join(
            [
                f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img">',
                '<style>text{font-family:Inter,Arial,sans-serif}.title{font-size:20px;font-weight:700;fill:#17201b}.label{font-size:12px;fill:#334139}.muted{font-size:11px;fill:#66736b}.value{font-size:12px;font-weight:700;fill:#17201b}</style>',
                body,
                "</svg>",
            ]
        )
        + "\n"
    )


def bar_chart(path: Path, title: str, rows: list[tuple[str, int, str]], total: int) -> None:
    width, height = 900, 520
    left, top, chart_width, chart_height = 150, 78, 670, 330
    max_value = max(value for _, value, _ in rows) or 1
    parts = [
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        f'<text class="title" x="36" y="42">{svg_escape(title)}</text>',
    ]
    for i in range(6):
        x = left + chart_width * i / 5
        parts.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + chart_height}" stroke="{COLORS["grid"]}" stroke-width="1"/>')
        tick = max_value * i / 5
        parts.append(f'<text class="muted" x="{x:.1f}" y="{top + chart_height + 24}" text-anchor="middle">{tick / 1000:.0f}k</text>')
    gap = 30
    bar_height = 48
    for index, (label, value, color) in enumerate(rows):
        y = top + index * (bar_height + gap)
        bar_width = chart_width * value / max_value
        pct = value / total * 100 if total else 0
        parts.append(f'<text class="label" x="{left - 18}" y="{y + 30}" text-anchor="end">{svg_escape(label)}</text>')
        parts.append(f'<rect x="{left}" y="{y}" width="{bar_width:.1f}" height="{bar_height}" rx="6" fill="{color}"/>')
        parts.append(f'<text class="value" x="{left + bar_width + 10:.1f}" y="{y + 30}">{value:,} ({pct:.1f}%)</text>')
    parts.append(f'<text class="muted" x="{left}" y="{height - 44}">Source: generated from data-pipeline/ankara_buildings.geojson</text>')
    write_svg(path, width, height, "\n".join(parts))


def pie_chart(path: Path, title: str, rows: list[tuple[str, int, str]], total: int) -> None:
    width, height = 900, 560
    cx, cy, radius = 300, 292, 160
    start_angle = -90.0
    parts = [
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        f'<text class="title" x="36" y="42">{svg_escape(title)}</text>',
    ]
    for label, value, color in rows:
        if value <= 0:
            continue
        angle = value / total * 360
        end_angle = start_angle + angle
        large_arc = 1 if angle > 180 else 0
        x1 = cx + radius * math.cos(math.radians(start_angle))
        y1 = cy + radius * math.sin(math.radians(start_angle))
        x2 = cx + radius * math.cos(math.radians(end_angle))
        y2 = cy + radius * math.sin(math.radians(end_angle))
        parts.append(
            f'<path d="M {cx} {cy} L {x1:.2f} {y1:.2f} A {radius} {radius} 0 {large_arc} 1 {x2:.2f} {y2:.2f} Z" fill="{color}"/>'
        )
        start_angle = end_angle
    legend_x = 540
    legend_y = 160
    for index, (label, value, color) in enumerate(rows):
        y = legend_y + index * 58
        pct = value / total * 100 if total else 0
        parts.append(f'<rect x="{legend_x}" y="{y - 16}" width="20" height="20" rx="4" fill="{color}"/>')
        parts.append(f'<text class="label" x="{legend_x + 32}" y="{y}">{svg_escape(label)}</text>')
        parts.append(f'<text class="value" x="{legend_x + 32}" y="{y + 20}">{value:,} buildings · {pct:.1f}%</text>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="74" fill="#ffffff"/>')
    parts.append(f'<text class="value" x="{cx}" y="{cy - 4}" text-anchor="middle">{total:,}</text>')
    parts.append(f'<text class="muted" x="{cx}" y="{cy + 18}" text-anchor="middle">buildings</text>')
    write_svg(path, width, height, "\n".join(parts))


def line_chart(path: Path, title: str, rows: list[tuple[str, int]], total: int) -> None:
    width, height = 900, 520
    left, top, chart_width, chart_height = 90, 78, 735, 330
    max_value = max(value for _, value in rows) or 1
    points = []
    parts = [
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        f'<text class="title" x="36" y="42">{svg_escape(title)}</text>',
    ]
    for i in range(6):
        y = top + chart_height - chart_height * i / 5
        value = max_value * i / 5
        parts.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + chart_width}" y2="{y:.1f}" stroke="{COLORS["grid"]}" stroke-width="1"/>')
        parts.append(f'<text class="muted" x="{left - 12}" y="{y + 4:.1f}" text-anchor="end">{value / 1000:.0f}k</text>')
    for index, (label, value) in enumerate(rows):
        x = left + chart_width * index / (len(rows) - 1)
        y = top + chart_height - chart_height * value / max_value
        points.append((x, y, label, value))
    path_data = " ".join(f"{'M' if i == 0 else 'L'} {x:.1f} {y:.1f}" for i, (x, y, _, _) in enumerate(points))
    parts.append(f'<path d="{path_data}" fill="none" stroke="{COLORS["teal"]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
    for x, y, label, value in points:
        pct = value / total * 100 if total else 0
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="{COLORS["teal"]}"/>')
        parts.append(f'<text class="value" x="{x:.1f}" y="{y - 18:.1f}" text-anchor="middle">{value:,}</text>')
        parts.append(f'<text class="muted" x="{x:.1f}" y="{y - 4:.1f}" text-anchor="middle">{pct:.1f}%</text>')
        parts.append(f'<text class="label" x="{x:.1f}" y="{top + chart_height + 42}" text-anchor="middle">{svg_escape(label)}</text>')
    write_svg(path, width, height, "\n".join(parts))


def metadata_chart(path: Path, title: str, metadata: dict[str, int], total: int) -> None:
    rows = [(key, value, COLORS["blue"]) for key, value in metadata.items()]
    bar_chart(path, title, rows, total)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    metrics = load_metrics()
    total = metrics["total"]

    bar_chart(
        OUTPUT_DIR / "before-after-demand-coverage.svg",
        "Demand Visibility Before and After Optimization",
        [
            ("Baseline geometry-only", 0, COLORS["slate"]),
            ("POI/commercial demand", metrics["demand_positive"], COLORS["amber"]),
            ("Residential-density surface", metrics["residential_positive"], COLORS["emerald"]),
            ("Dense built environment", metrics["density_ge_25"], COLORS["teal"]),
        ],
        total,
    )
    pie_chart(
        OUTPUT_DIR / "final-demand-classification.svg",
        "Final Building Demand Classification",
        [
            ("No explicit demand", metrics["no_demand"], "#cbd5d1"),
            ("POI/commercial only", metrics["poi_only"], COLORS["amber"]),
            ("Residential only", metrics["residential_only"], COLORS["emerald"]),
            ("Both POI and residential", metrics["both"], COLORS["teal"]),
        ],
        total,
    )
    line_chart(
        OUTPUT_DIR / "model-evolution.svg",
        "Demand-Aware Buildings Across Model Milestones",
        [
            ("Geometry", 0),
            ("POI", metrics["demand_positive"]),
            ("Residential", metrics["demand_or_residential"]),
            ("Density map", metrics["density_ge_25"]),
        ],
        total,
    )
    metadata_chart(
        OUTPUT_DIR / "osm-metadata-coverage.svg",
        "OSM Metadata Coverage in the Local Export",
        metrics["metadata"],
        total,
    )

    (OUTPUT_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n")
    print(f"Generated charts in {OUTPUT_DIR.relative_to(ROOT)}")
    print(json.dumps(metrics, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
