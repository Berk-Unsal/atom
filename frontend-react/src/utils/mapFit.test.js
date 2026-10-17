import { describe, expect, it } from "vitest";
import { boundsForFitTargets, fitTargetsForCells, shouldApplyFit } from "./mapFit.js";

const cells = [
  { id: "tower-1", coordinates: [32.85, 39.92] },
  { id: "tower-2", coordinates: [32.86, 39.93] },
  { id: "invalid", coordinates: [] },
];

describe("map fit targets", () => {
  it("keeps valid Cell positions with their planning radius", () => {
    expect(fitTargetsForCells(cells, (_cell, index) => [400, 1500, 300][index])).toEqual([
      { lat: 39.92, lon: 32.85, radiusMeters: 400 },
      { lat: 39.93, lon: 32.86, radiusMeters: 1500 },
    ]);
  });

  it("frames a single sector's planning radius rather than a point or the city", () => {
    const [[south, west], [north, east]] = boundsForFitTargets([{ lat: 39.92, lon: 32.85, radiusMeters: 400 }]);
    expect(north - south).toBeCloseTo((2 * 400) / 111_320, 6);
    // Longitude degrees shrink with latitude, so the east-west span is wider in degrees.
    expect(east - west).toBeGreaterThan(north - south);
    expect((south + north) / 2).toBeCloseTo(39.92, 9);
    expect((west + east) / 2).toBeCloseTo(32.85, 9);
  });

  it("covers every Cell's radius for a network", () => {
    const [[south, west], [north, east]] = boundsForFitTargets(fitTargetsForCells(cells, () => 400));
    expect(south).toBeLessThan(39.92);
    expect(north).toBeGreaterThan(39.93);
    expect(west).toBeLessThan(32.85);
    expect(east).toBeGreaterThan(32.86);
  });

  it("returns null without targets", () => {
    expect(boundsForFitTargets([])).toBeNull();
  });
});

describe("shouldApplyFit", () => {
  it("applies each request version once", () => {
    expect(shouldApplyFit({ version: 2, since: null }, 1, 0)).toBe(true);
    expect(shouldApplyFit({ version: 2, since: null }, 2, 0)).toBe(false);
    expect(shouldApplyFit(null, 0, 0)).toBe(false);
  });

  it("skips an automatic fit when the user moved the map after the action started", () => {
    expect(shouldApplyFit({ version: 3, since: 1_000 }, 2, 1_500)).toBe(false);
    expect(shouldApplyFit({ version: 3, since: 1_000 }, 2, 900)).toBe(true);
  });

  it("always applies a manual fit", () => {
    expect(shouldApplyFit({ version: 4, since: null }, 3, 9_999)).toBe(true);
  });
});
