import { describe, expect, it } from "vitest";
import { areaOfInterestRows } from "./areaOfInterest.js";
import { buildNetworkOptimizationPayload, buildRecommendationPayload, normalizeAreaOfInterest } from "./requestPayloads.js";

const towers = [{ id: "a", cellId: "101", coordinates: [32.85, 39.92] }, { id: "b", cellId: "102", coordinates: [32.854, 39.922] }];
const settings = { frequencyGHz: 28, txPowerDbm: 30, rayCount: 120, radiusMeters: 400, azimuthDeg: 90, beamWidthDeg: 120, calibrationOffsetDb: 0 };
const polygon = [[32.84, 39.91], [32.87, 39.91], [32.87, 39.93]];

describe("area of interest requests", () => {
  it("adds aoi only for a polygon with at least three vertices", () => {
    expect(buildNetworkOptimizationPayload(towers, settings, {}, null, polygon).aoi).toEqual(polygon);
    expect(buildNetworkOptimizationPayload(towers, settings, {}, null, polygon.slice(0, 2))).not.toHaveProperty("aoi");
    expect(buildNetworkOptimizationPayload(towers, settings, {}, null)).not.toHaveProperty("aoi");
    expect(normalizeAreaOfInterest([{ lng: 1, lat: 2 }, { lon: 3, lat: 4 }, [5, 6]])).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it("keeps everything else in the request identical", () => {
    const scoped = buildNetworkOptimizationPayload(towers, settings, {}, null, polygon);
    delete scoped.aoi;
    expect(scoped).toEqual(buildNetworkOptimizationPayload(towers, settings, {}, null));
  });

  it("never sends aoi to candidate recommendation, whose contract has no such field", () => {
    expect(buildRecommendationPayload(towers, settings, polygon, null)).not.toHaveProperty("aoi");
  });
});

describe("area of interest KPI rows", () => {
  const stats = {
    raw_metrics: { served_demand_weight: 600, relevant_demand_weight: 1000, residential_covered: 15, relevant_residential_total: 30, overlap_buildings: 2, overlap_ratio: 0.08, covered_units: 30 },
    area_of_interest: { served_demand_weight: 120, relevant_demand_weight: 300, residential_covered: 4, relevant_residential_total: 10, overlap_buildings: 1, overlap_ratio: 0.2, covered_units: 5, relevant_buildings: 9 },
  };

  it("shows network-wide and inside-area values from the same response", () => {
    expect(areaOfInterestRows(stats)).toEqual([
      ["Demand served", "60.0%", "40.0%"],
      ["Residential buildings served", "15 of 30", "4 of 10"],
      ["Overlap buildings", "2 (8.0% of covered)", "1 (20.0% of covered)"],
      ["Relevant buildings", "30 covered", "5 covered of 9"],
    ]);
  });

  it("is empty without an area and treats omitted zero network fields as zero", () => {
    expect(areaOfInterestRows({ raw_metrics: {} })).toEqual([]);
    const rows = areaOfInterestRows({ raw_metrics: { covered_units: 0 }, area_of_interest: { served_demand_weight: 0, relevant_demand_weight: 0, residential_covered: 0, relevant_residential_total: 0, overlap_buildings: 0, overlap_ratio: 0, covered_units: 0, relevant_buildings: 0 } });
    expect(rows[0]).toEqual(["Demand served", "No relevant demand", "No relevant demand"]);
    expect(rows[1]).toEqual(["Residential buildings served", "0 of 0", "0 of 0"]);
  });
});
