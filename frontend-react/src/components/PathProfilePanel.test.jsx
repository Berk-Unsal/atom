import { describe, expect, it } from "vitest";
import { profileChartGeometry } from "../utils/pathProfileChart.js";

describe("path profile chart geometry", () => {
  it("renders terrain, Fresnel, LOS, and a dominant obstruction marker", () => {
    const geometry = profileChartGeometry([
      { distance_m: 0, terrain_elevation_m: 100, obstruction_elevation_m: 100, line_of_sight_elevation_m: 125, fresnel_radius_m: 0, clearance_m: 25 },
      { distance_m: 50, terrain_elevation_m: 103, obstruction_elevation_m: 130, line_of_sight_elevation_m: 115, fresnel_radius_m: 2, clearance_m: -15 },
      { distance_m: 100, terrain_elevation_m: 105, obstruction_elevation_m: 105, line_of_sight_elevation_m: 106.5, fresnel_radius_m: 0, clearance_m: 1.5 },
    ]);

    expect(geometry.terrainAreaPath).toContain("Z");
    expect(geometry.fresnelPath).toContain("Z");
    expect(geometry.losPath).toMatch(/^M/);
    expect(geometry.dominant).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });
});
