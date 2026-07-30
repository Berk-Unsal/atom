import { describe, expect, it } from "vitest";
import {
  buildInterferencePayload,
  buildNetworkOptimizationPayload,
  buildRecommendationPayload,
} from "./requestPayloads.js";

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

  it("scores recommendations from the currently optimized cell azimuths", () => {
    const payload = buildRecommendationPayload(
      towers,
      { ...settings, rayCount: 60 },
      [[32.84, 39.91], [32.87, 39.91], [32.87, 39.94]],
      { optimized_towers: [{ id: "1", optimal_azimuth: 45 }, { id: "2", optimal_azimuth: 180 }] },
    );

    expect(payload.towers.map((tower) => tower.azimuth)).toEqual([45, 180]);
  });

  it("preserves explicit per-cell azimuths for later network evaluations", () => {
    const payload = buildNetworkOptimizationPayload(towers, settings, { "lte-1": 45, "lte-2": 180 });

    expect(payload.towers.map((tower) => tower.azimuth)).toEqual([45, 180]);
  });

  it("serializes independent per-cell RF profiles", () => {
    const payload = buildNetworkOptimizationPayload([
      { ...towers[0], rfProfile: { networkTech: "4g", frequencyGHz: 2.6, txPowerDbm: 43, channelId: "A" } },
      { ...towers[1], rfProfile: { networkTech: "5g", frequencyGHz: 28, txPowerDbm: 30, channelId: "B" } },
    ], settings);

    expect(payload.towers[0].rf_profile).toMatchObject({ network_tech: "4g", frequency_ghz: 2.6, tx_power_dbm: 43, channel_id: "A" });
    expect(payload.towers[1].rf_profile).toMatchObject({ network_tech: "5g", frequency_ghz: 28, tx_power_dbm: 30, channel_id: "B" });
  });
});
