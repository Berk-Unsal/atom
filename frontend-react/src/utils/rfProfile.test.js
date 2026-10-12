import { describe, expect, it } from "vitest";
import { effectiveReceiverSensitivityDbm, resolveRFProfile, rfProfileOverrideFromProperties, rfProfileToPayload, technologyDefaults, validateRFProfile } from "./rfProfile.js";

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
      rxAntennaGainDbi: 4,
      systemLossDb: 2,
      polarizationLossDb: 1.5,
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
      tx_antenna_gain_dbi: 18,
      rx_antenna_gain_dbi: 4,
      system_loss_db: 2,
      polarization_loss_db: 1.5,
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

  it("accepts the reference element pattern and canonical TX/RX link terms", () => {
    const profile = resolveRFProfile({ rfProfile: {
      txAntennaGainDbi: 21,
      rxAntennaGainDbi: 3,
      polarizationLossDb: 2,
      horizontalPatternId: "3gpp-single-element",
    } }, settings);
    expect(validateRFProfile(profile)).toEqual({});
    expect(profile.antennaGainDbi).toBe(21);
    expect(rfProfileToPayload(profile)).toMatchObject({
      tx_antenna_gain_dbi: 21,
      antenna_gain_dbi: 21,
      rx_antenna_gain_dbi: 3,
      polarization_loss_db: 2,
      horizontal_pattern_id: "3gpp-single-element",
    });
  });

  it("keeps manual sensitivity as the default and serializes derived receiver inputs", () => {
    const manual = resolveRFProfile({}, settings);
    expect(manual.receiverSensitivityMode).toBe("manual");
    expect(manual.receiverSensitivityDbm).toBe(-115);
    expect(manual.receiverNoiseBandwidthHz).toBe(100e6);
    expect(manual.receiverNoiseBandwidthSource).toBe("channel_bandwidth_approximation");

    const derived = resolveRFProfile({ rfProfile: {
      ...technologyDefaults("5g"),
      receiverSensitivityMode: "derived",
      receiverNoiseBandwidthHz: 20e6,
      receiverNoiseFigureDb: 6,
      receiverRequiredSnrDb: 2,
      receiverMarginDb: 1,
    } }, settings);
    expect(validateRFProfile(derived)).toEqual({});
    expect(derived.receiverNoiseBandwidthHz).toBe(20e6);
    expect(derived.receiverNoiseBandwidthSource).toBe("explicit_receiver_noise_bandwidth_hz");
    expect(rfProfileToPayload(derived)).toMatchObject({
      receiver_sensitivity_mode: "derived",
      receiver_noise_bandwidth_hz: 20e6,
      receiver_noise_figure_db: 6,
      receiver_required_snr_db: 2,
      receiver_margin_db: 1,
    });
  });

  it("computes the derived threshold without changing manual profiles", () => {
    const derived = resolveRFProfile({ rfProfile: {
      receiverSensitivityMode: "derived",
      receiverNoiseBandwidthHz: 100e6,
      receiverNoiseFigureDb: 7,
      receiverRequiredSnrDb: 3,
      receiverMarginDb: 0,
    } }, settings);
    expect(effectiveReceiverSensitivityDbm(derived)).toBeCloseTo(-84, 10);
    expect(effectiveReceiverSensitivityDbm(resolveRFProfile({}, settings))).toBe(-115);
  });
});
