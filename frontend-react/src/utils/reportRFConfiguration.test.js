import { describe, expect, it } from "vitest";
import { groupReportRFProfiles, normalizeReportProfile } from "./reportRFConfiguration.js";
import { resolveRFProfile } from "./rfProfile.js";

const profile = (cellId, overrides = {}) => ({ cellId, ...resolveRFProfile({ rfProfile: { channelId: "CH-1", ...overrides } }, { frequencyGHz: 28, radiusMeters: 400, txPowerDbm: 30 }) });

describe("report RF grouping", () => {
  it("prints an identical eight-Cell profile once while keeping Cell identity separate", () => {
    const result = groupReportRFProfiles(Array.from({ length: 8 }, (_, i) => profile(String(i))));
    expect(result.kind).toBe("common");
    expect(result.referenceCount).toBe(8);
    expect(result.common.find(({ key }) => key === "frequencyGHz").value).toBe(28);
    expect(result.deviations.every(({ fields }) => fields.length === 0)).toBe(true);
    expect(result.groups.flatMap(({ fields }) => fields).filter(({ key }) => key === "frequencyGHz")).toHaveLength(1);
  });

  it("uses an honestly scoped repeated reference and reconstructs every heterogeneous profile", () => {
    const originals = [profile("a"), profile("b"), profile("c", { frequencyGHz: 27, bandwidthMHz: 200, antennaGainDbi: 22, antennaHeightM: 30, loadFactor: 0.3, receiverSensitivityDbm: -105 })];
    const result = groupReportRFProfiles(originals);
    expect(result.kind).toBe("reference");
    expect(result.referenceCount).toBe(2);
    expect(result.deviations.find(({ id }) => id === "c").fields.map(({ key }) => key)).toEqual(expect.arrayContaining(["frequencyGHz", "bandwidthMHz", "antennaGainDbi", "antennaHeightM", "loadFactor", "receiverSensitivityDbm", "effectiveSensitivityDbm"]));
    for (const original of originals) {
      const deviation = result.deviations.find(({ id }) => id === original.cellId);
      const reconstructed = { ...result.reference.values, ...Object.fromEntries(deviation.fields.map(({ key, value }) => [key, value])) };
      expect(reconstructed).toEqual(normalizeReportProfile(original));
    }
    expect(groupReportRFProfiles([...originals].reverse())).toEqual(result);
  });

  it("keeps tiny differences, component tilts, receiver modes and bandwidth provenance", () => {
    const result = groupReportRFProfiles([profile("a", { mechanicalDowntiltDeg: 1, electricalDowntiltDeg: 2 }), profile("b", { mechanicalDowntiltDeg: 2, electricalDowntiltDeg: 1, loadFactor: 0.700000000001, receiverSensitivityMode: "derived", receiverNoiseBandwidthSource: "explicit_receiver_noise_bandwidth_hz" })]);
    expect(result.kind).toBe("mixed");
    const varied = result.deviations.find(({ id }) => id === "b").fields.map(({ key }) => key);
    expect(varied).toEqual(expect.arrayContaining(["mechanicalDowntiltDeg", "electricalDowntiltDeg", "loadFactor", "receiverSensitivityMode", "receiverNoiseBandwidthSource"]));
  });

  it("does not treat unknown historical fields as a known common profile", () => {
    const unknown = groupReportRFProfiles([{ cellId: "a" }, { cellId: "b" }]);
    expect(unknown.kind).toBe("unknown");
    expect(unknown.common).toEqual([]);
    const partial = groupReportRFProfiles([{ cellId: "a", frequencyGHz: 28 }, { cellId: "b", frequencyGHz: 28 }]);
    expect(partial.partial).toBe(true);
    expect(partial.groups.flatMap(({ fields }) => fields).map(({ key }) => key)).toEqual(["frequencyGHz"]);
  });
});
