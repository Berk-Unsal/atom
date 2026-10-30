import { describe, expect, it } from "vitest";
import { buildReportMap, sampleReportSegments, placeReportMarkers } from "./reportMap.js";
import { reportInputs } from "../test/fixtures/reportFixtures.js";

describe("report map presentation", () => {
  it("samples 300 immutable segments deterministically across eight Cells", () => {
    const inputs = reportInputs();
    const original = JSON.stringify(inputs.simulation);
    const sampled = sampleReportSegments(inputs.simulation.geojson.features);
    expect(sampled).toHaveLength(300);
    expect(new Set(sampled.map(({ properties }) => properties.cell_id)).size).toBe(8);
    expect(sampleReportSegments([...inputs.simulation.geojson.features].reverse())).toEqual(sampled);
    expect(JSON.stringify(inputs.simulation)).toBe(original);
    expect(sampleReportSegments(inputs.simulation.geojson.features, 0)).toEqual([]);
  });

  it("keeps true anchors at exact/near co-location and finds noncolliding labels at plot edges", () => {
    const anchors = Array.from({ length: 8 }, (_, i) => ({ id: String(i), number: i + 1, x: i % 2 ? 686 : 688, y: 390 }));
    const placed = placeReportMarkers(anchors);
    expect(placed.map(({ x, y }) => [x, y])).toEqual(anchors.map(({ x, y }) => [x, y]));
    for (const [i, a] of placed.entries()) for (const b of placed.slice(i + 1)) expect(Math.hypot(a.labelX - b.labelX, a.labelY - b.labelY)).toBeGreaterThanOrEqual(27);
  });

  it("frames full data, exposes sampling units and distinguishes a reranked solution", () => {
    const inputs = reportInputs({ optimized: true });
    const cells = inputs.selectedNetworkTowers.map((cell, i) => ({ id: cell.cellId, number: i + 1, coordinates: cell.coordinates }));
    const map = buildReportMap({ cells, simulation: inputs.simulation, source: inputs.simulationSource, recommendedSolutionId: "solution-2" });
    expect(map).toMatchObject({ state: "available", shownSegments: 300, totalSegments: 8748, relationship: "different_solution" });
    expect(map.caption).toContain("underlying RF results and all reported KPIs are unchanged");
    expect(map.caption).toContain("last simulation (solution-1)");
    const extremes = inputs.simulation.geojson.features.flatMap(({ geometry }) => geometry.coordinates);
    expect(map.bounds.maxLon).toBe(Math.max(...extremes.map(([lon]) => lon)));
    expect(map.svg).toContain('data-cell-number="8"');
    expect(map.svg).not.toContain("Cell 8414708</text>");
    const svg = new DOMParser().parseFromString(map.svg, "image/svg+xml");
    expect(svg.querySelectorAll(".cell-leaders line")).toHaveLength(8);
    expect(svg.querySelectorAll("[data-cell-number] line")).toHaveLength(0);
    expect(svg.querySelector(".cell-leaders").nextElementSibling.getAttribute("data-cell-number")).toBe("1");
  });

  it.each(["gaps", "interference"])("does not invent simulation provenance for %s-only geometry", (layer) => {
    const data = { geojson: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [32.8, 39.9] }, properties: { sinr_db: 5, severity: "weak" } }] } };
    const map = buildReportMap({ [layer === "gaps" ? "coverageGaps" : "interference"]: data });
    expect(map).toMatchObject({ state: "available", relationship: "layers_only", totalSegments: 0 });
    expect(map.caption).toContain("No RF segment geometry was retained");
    expect(map.caption).toContain("alignment of these analysis layers");
    expect(map.caption).not.toContain("simulation");
  });

  it("does not fabricate map geometry for a historical configuration", () => {
    const map = buildReportMap({ cells: [{ id: "a", number: 1, coordinates: [32.8, 39.9] }] });
    expect(map.state).toBe("configuration_only");
    expect(map.svg).toBe("");
    expect(map.caption).toContain("no coverage map was reconstructed");
  });
});
