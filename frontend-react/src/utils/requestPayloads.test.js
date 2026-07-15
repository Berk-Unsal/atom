import { describe, expect, it } from "vitest";
import { buildInterferencePayload } from "./requestPayloads.js";

const towers = [
  { id: "lte-1", cellId: 1, coordinates: [32.85, 39.92] },
  { id: "lte-2", cellId: 2, coordinates: [32.86, 39.93] },
];

const settings = {
  frequencyGHz: 2.6,
  txPowerDbm: 0,
  radiusMeters: 400,
  azimuthDeg: 90,
  beamWidthDeg: 120,
  interferenceBandwidthMHz: 20,
  cellLoadPct: 70,
  reuseFactor: 3,
  noiseFigureDb: 0,
  sampleSpacingMeters: 40,
};

describe("interference request payload", () => {
  it("preserves selected order, zero values, and optimized azimuths", () => {
    const payload = buildInterferencePayload(towers, settings, {
      optimized_towers: [{ id: "2", optimal_azimuth: 180 }],
    });
    expect(payload.network_tech).toBe("4g");
    expect(payload.tx_power_dbm).toBe(0);
    expect(payload.noise_figure_db).toBe(0);
    expect(payload.towers.map((tower) => tower.id)).toEqual(["1", "2"]);
    expect(payload.towers.map((tower) => tower.azimuth)).toEqual([90, 180]);
  });
});
