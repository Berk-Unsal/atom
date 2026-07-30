import { describe, expect, it } from "vitest";
import { resolveRFProfile, rfProfileOverrideFromProperties, rfProfileToPayload, technologyDefaults, validateRFProfile } from "./rfProfile.js";

const settings = {
  frequencyGHz: 28,
  txPowerDbm: 30,
  radiusMeters: 400,
  beamWidthDeg: 120,
  interferenceBandwidthMHz: 100,
  cellLoadPct: 70,
  reuseFactor: 1,
};

describe("per-cell RF profiles", () => {
  it("merges every independent override into the request contract", () => {
    const profile = resolveRFProfile({ rfProfile: {
      ...technologyDefaults("4g"),
      channelId: "EARFCN-2850",
      txPowerDbm: 43,
      antennaGainDbi: 18,
      systemLossDb: 2,
      radiusMeters: 1200,
      beamWidthDeg: 65,
      antennaHeightM: 32,
      mechanicalDowntiltDeg: 4,
      electricalDowntiltDeg: 2,
      orientationDeg: -15,
      horizontalPatternId: "cosine-sector",
      verticalPatternId: "panel-10deg",
      loadFactor: 0.85,
      reuseFactor: 3,
      pci: 503,
      receiverHeightM: 1.7,
      receiverSensitivityDbm: -108,
    } }, settings);

    expect(validateRFProfile(profile)).toEqual({});
    expect(profile.orientationDeg).toBe(345);
    expect(rfProfileToPayload(profile)).toMatchObject({
      network_tech: "4g",
      frequency_ghz: 2.6,
      channel_id: "EARFCN-2850",
      antenna_gain_dbi: 18,
      system_loss_db: 2,
      mechanical_downtilt_deg: 4,
      electrical_downtilt_deg: 2,
      horizontal_pattern_id: "cosine-sector",
      vertical_pattern_id: "panel-10deg",
      pci: 503,
    });
  });

  it("inherits plan defaults when a cell has no override", () => {
    const profile = resolveRFProfile({}, settings, 2);
    expect(profile).toMatchObject({ networkTech: "5g", frequencyGHz: 28, txPowerDbm: 30, channelId: "CH-1" });
  });

  it("reports frequency and PCI validation errors", () => {
    const profile = resolveRFProfile({ rfProfile: { ...technologyDefaults("4g"), frequencyGHz: 28, pci: 504 } }, settings);
    expect(validateRFProfile(profile)).toMatchObject({ frequencyGHz: expect.any(String), pci: expect.any(String) });
  });

  it("reads nested and flat RF fields from dataset tower properties", () => {
    const override = rfProfileOverrideFromProperties({
      frequency_ghz: 28,
      rf_profile: { network_tech: "4g", frequency_ghz: 2.6, band: "LTE Band 7", tx_power_dbm: 43 },
    });
    expect(override).toEqual({ networkTech: "4g", frequencyGHz: 2.6, band: "LTE Band 7", txPowerDbm: 43 });
  });
});
