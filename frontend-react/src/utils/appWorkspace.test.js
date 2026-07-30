import { describe, expect, it } from "vitest";
import { combineNetworkSimulations, networkAzimuthMap, normalizeSimulationStats } from "./appWorkspace.js";

describe("app workspace helpers", () => {
  it("combines network features and aggregate statistics deterministically", () => {
    const combined = combineNetworkSimulations([
      { geojson: { features: [{ properties: { ray: 1 } }] }, stats: { avg_rx_dbm: -80, blocked_pct: 10, min_range_m: 20, max_range_m: 100 } },
      { geojson: { features: [{ properties: { ray: 2 } }] }, stats: { avg_rx_dbm: -60, blocked_pct: 30, min_range_m: 10, max_range_m: 120 } },
    ]);
    expect(combined.stats).toEqual({ avg_rx_dbm: -70, blocked_pct: 20, min_range_m: 10, max_range_m: 120 });
    expect(combined.geojson.features[1].properties.network_tower_index).toBe(1);
  });

  it("maps optimized cell IDs without discarding existing azimuths", () => {
    expect(networkAzimuthMap([{ id: "tower-a", cellId: 7 }], {
      optimized_towers: [{ id: "7", optimal_azimuth: 135 }],
    }, { tower_b: 20 })).toEqual({ tower_b: 20, "tower-a": 135 });
  });

  it("normalizes absent simulation evidence", () => {
    expect(normalizeSimulationStats(null, null)).toMatchObject({ avgPower: null, rayCount: 0 });
  });
});
