import { describe, expect, it } from "vitest";
import { networkRequestForSource, spatialComparisonAvailability, spatialComparisonRows, spatialComparisonSvg } from "./spatialComparison.js";

const request = { towers: [{ id: "101", tower_lon: 32.85, tower_lat: 39.92, azimuth: 0 }, { id: "102", tower_lon: 32.854, tower_lat: 39.922, azimuth: 90 }], rays: 72, radius_m: 400 };
const context = {
  currentNetworkRequest: request,
  optimizationRequest: request,
  recommendedSolution: { id: "sol-1", towers: [{ id: "101", azimuth_deg: 20 }, { id: "102", azimuth_deg: 140 }] },
  selectedSolution: { id: "sol-2", towers: [{ id: "101", azimuth_deg: 30 }, { id: "102", azimuth_deg: 150 }] },
};

describe("spatial comparison requests", () => {
  it.each([
    ["version", { kind: "version", revision: { request_inputs: request } }, [0, 90]],
    ["current", { kind: "current" }, [0, 90]],
    ["baseline", { kind: "baseline" }, [0, 90]],
    ["recommended", { kind: "recommended" }, [20, 140]],
    ["alternative", { kind: "alternative" }, [30, 150]],
  ])("uses the exact network request for a %s source", (_kind, source, azimuths) => {
    const built = networkRequestForSource(source, context);
    expect(built.towers.map((tower) => tower.azimuth)).toEqual(azimuths);
    expect({ ...built, towers: undefined }).toEqual({ ...request, towers: undefined });
  });

  it("has no request for single-sector or missing sources", () => {
    expect(networkRequestForSource({ kind: "version", revision: { request_inputs: { tower_lon: 32.85, tower_lat: 39.92 } } }, context)).toBeNull();
    expect(networkRequestForSource({ kind: "current" }, { ...context, currentNetworkRequest: null })).toBeNull();
    expect(networkRequestForSource({ kind: "recommended" }, { ...context, recommendedSolution: null })).toBeNull();
  });
});

describe("spatial comparison availability", () => {
  const identity = { dataset: "ankara@2026.07", model: "m1" };
  const a = { id: "a", identity };
  const b = { id: "b", identity };
  it.each([
    ["the same state", a, a, { a: request, b: request }, /two different states/],
    ["a non-network state", a, b, { a: request, b: null }, /two network plans/],
    ["another dataset", a, { id: "b", identity: { dataset: "istanbul@2026.01", model: "m1" } }, { a: request, b: request }, /current dataset and model/],
    ["another model", a, { id: "b", identity: { dataset: "ankara@2026.07", model: "m0" } }, { a: request, b: request }, /current dataset and model/],
  ])("refuses %s", (_label, first, second, requests, reason) => {
    const availability = spatialComparisonAvailability(first, second, requests, identity);
    expect(availability.available).toBe(false);
    expect(availability.reason).toMatch(reason);
  });

  it("allows two network plans on the current dataset and model", () => {
    expect(spatialComparisonAvailability(a, b, { a: request, b: request }, identity)).toEqual({ available: true, reason: "" });
  });
});

describe("spatial comparison presentation", () => {
  const result = {
    counts: { newly_served: 2, newly_lost: 1, overlap_gained: 0, overlap_removed: 1 },
    buildings: [
      { id: "b1", lon: 32.85, lat: 39.92, class: "newly_served" },
      { id: "b2", lon: 32.851, lat: 39.921, class: "newly_served" },
      { id: "b3", lon: 32.849, lat: 39.919, class: "newly_lost" },
      { id: "b4", lon: 32.852, lat: 39.918, class: "overlap_removed" },
    ],
  };
  it("labels every class with its count", () => {
    expect(spatialComparisonRows(result)).toEqual([["Newly served", "2"], ["Newly lost", "1"], ["Overlap gained", "0"], ["Overlap removed", "1"]]);
  });

  it("draws a static map with a labeled legend, and nothing when no building changed", () => {
    const svg = spatialComparisonSvg(result);
    expect(svg).toContain('aria-label="Where the two plans differ: changed buildings by class"');
    expect(svg.match(/<circle /g)).toHaveLength(4 + 4);
    expect(svg).toContain("Newly served (2)");
    expect(svg).toContain("Overlap removed (1)");
    expect(spatialComparisonSvg({ counts: result.counts, buildings: [] })).toBe("");
  });
});
