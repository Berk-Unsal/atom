import { describe, expect, it } from "vitest";
import { buildExperimentDefinition, paretoGeometry } from "./experimentMatrix.js";

const tower = { id: "cell-1", coordinates: [32.85, 39.92] };
const settings = {
  frequencyGHz: 2.6, txPowerDbm: 30, radiusMeters: 400, azimuthDeg: 90, beamWidthDeg: 120,
  rayCount: 60, interferenceBandwidthMHz: 20, cellLoadPct: 70, reuseFactor: 1, calibrationOffsetDb: 0,
};

describe("experiment matrix", () => {
  it("serializes unique numeric sweep dimensions and active-plan defaults", () => {
    const definition = buildExperimentDefinition("Sweep", tower, settings, {
      frequencies_ghz: "2.6, 3.5, 2.6", tx_powers_dbm: "30, 35", beam_widths_deg: "", azimuths_deg: "", calibration_offsets_db: "",
    });
    expect(definition.matrix).toEqual({ frequencies_ghz: [2.6, 3.5], tx_powers_dbm: [30, 35] });
    expect(definition.base).toMatchObject({ tower_lon: 32.85, frequency_ghz: 2.6, rays: 60 });
  });

  it("maps non-dominated results to the Pareto view", () => {
    const geometry = paretoGeometry([
      { fingerprint: "a", avg_rx_dbm: -90, gap_pct: 30, non_dominated: false, parameters: { frequency_ghz: 2.6 } },
      { fingerprint: "b", avg_rx_dbm: -75, gap_pct: 10, non_dominated: true, parameters: { frequency_ghz: 3.5 } },
    ]);
    expect(geometry.points).toHaveLength(2);
    expect(geometry.points[1]).toMatchObject({ nonDominated: true, x: expect.any(Number), y: expect.any(Number) });
  });
});
