import { describe, expect, it } from "vitest";
import {
  buildInterferencePayload,
  buildCoverageSurfacePayload,
  buildMeasurementPayload,
  buildNetworkOptimizationPayload,
  buildPathProfilePayload,
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
    const payload = buildNetworkOptimizationPayload(towers, settings, { "lte-1": 45, "lte-2": 180 }, {
      objectives: [{ id: "coverage", weight: 2 }, { id: "overlap", weight: 4 }],
      constraints: { max_overlap_buildings: 3 },
    });

    expect(payload.towers.map((tower) => tower.azimuth)).toEqual([45, 180]);
    expect(payload.optimization).toEqual({
      objectives: [{ id: "coverage", weight: 2 }, { id: "overlap", weight: 4 }],
      constraints: { max_overlap_buildings: 3 },
    });
  });

  it("serializes independent per-cell RF profiles", () => {
    const payload = buildNetworkOptimizationPayload([
      { ...towers[0], rfProfile: { networkTech: "4g", frequencyGHz: 2.6, txPowerDbm: 43, channelId: "A" } },
      { ...towers[1], rfProfile: { networkTech: "5g", frequencyGHz: 28, txPowerDbm: 30, channelId: "B" } },
    ], settings);

    expect(payload.towers[0].rf_profile).toMatchObject({ network_tech: "4g", frequency_ghz: 2.6, tx_power_dbm: 43, channel_id: "A" });
    expect(payload.towers[1].rf_profile).toMatchObject({ network_tech: "5g", frequency_ghz: 28, tx_power_dbm: 30, channel_id: "B" });
  });

  it("builds a profile-specific 2.5D path request with inspectable fidelity inputs", () => {
    const payload = buildPathProfilePayload(towers[0], [32.851, 39.921], settings, {
      gasSpecificAttenuationDbPerKm: 0.2,
      rainSpecificAttenuationDbPerKm: 1.1,
      shadowSigmaDb: 7,
    });

    expect(payload).toMatchObject({
      transmitter: { lon: 32.85, lat: 39.92 },
      receiver: { lon: 32.851, lat: 39.921 },
      model_profile: "terrain-profile",
      fidelity: {
        building_loss_mode: "screen-diffraction",
        diffraction_model: "single-knife-edge",
        gas_specific_attenuation_db_per_km: 0.2,
        rain_specific_attenuation_db_per_km: 1.1,
        shadow_sigma_db: 7,
      },
    });
  });

  it("attaches calibration campaign provenance to measurement evaluation", () => {
    const payload = buildMeasurementPayload(towers, settings, [{ id: "m1" }], null, {}, {
      source: "drive-test.csv",
      collected_at: "2026-07-01T10:00:00.000Z",
    });
    expect(payload.calibration_provenance).toEqual({
      source: "drive-test.csv",
      collected_at: "2026-07-01T10:00:00.000Z",
    });
  });

  it("builds a bounded analytical coverage surface request", () => {
    const payload = buildCoverageSurfacePayload(towers[0], { ...settings, rayCount: 72 }, {
      cellSizeMeters: 50,
      thresholdsDBm: [-105, -90],
    });
    expect(payload).toMatchObject({ tower_lon: 32.85, tower_lat: 39.92, cell_size_m: 50, thresholds_dbm: [-105, -90] });
  });
});
