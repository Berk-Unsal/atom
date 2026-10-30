import { effectiveReceiverSensitivityDbm } from "./rfProfile.js";

// Compare effective values, not formatted text. Keep component tilts, receiver mode, and provenance separate.
export const REPORT_RF_FIELDS = [
  ["networkTech", "Technology", "Spectrum & channel"],
  ["propagationModelID", "RF model", "Spectrum & channel"],
  ["frequencyGHz", "Frequency", "Spectrum & channel", "GHz"],
  ["band", "Band", "Spectrum & channel"],
  ["channelId", "Channel", "Spectrum & channel"],
  ["bandwidthMHz", "Channel bandwidth", "Spectrum & channel", "MHz"],
  ["duplexMode", "Duplex mode", "Spectrum & channel"],
  ["txPowerDbm", "Conducted TX power", "Signed link terms", "dBm"],
  ["antennaGainDbi", "TX absolute boresight gain", "Signed link terms", "dBi"],
  ["rxAntennaGainDbi", "RX antenna gain", "Signed link terms", "dBi"],
  ["systemLossDb", "System loss", "Signed link terms", "dB"],
  ["polarizationLossDb", "Polarization loss", "Signed link terms", "dB"],
  ["radiusMeters", "Planning radius", "Antenna & site", "m"],
  ["beamWidthDeg", "Beam width", "Antenna & site", "°"],
  ["antennaHeightM", "Antenna height", "Antenna & site", "m"],
  ["mechanicalDowntiltDeg", "Mechanical downtilt", "Antenna & site", "°"],
  ["electricalDowntiltDeg", "Electrical downtilt", "Antenna & site", "°"],
  ["orientationDeg", "Orientation offset", "Antenna & site", "°"],
  ["horizontalPatternId", "Horizontal pattern", "Antenna & site"],
  ["verticalPatternId", "Vertical pattern", "Antenna & site"],
  ["loadFactor", "Load factor", "Load & reuse"],
  ["reuseFactor", "Reuse factor", "Load & reuse"],
  ["pci", "PCI", "Load & reuse"],
  ["receiverHeightM", "Receiver height", "Receiver assumptions", "m"],
  ["receiverSensitivityMode", "Threshold mode", "Receiver assumptions"],
  ["effectiveSensitivityDbm", "Effective ray sensitivity", "Receiver assumptions", "dBm"],
  ["receiverSensitivityDbm", "Configured manual sensitivity", "Receiver assumptions", "dBm"],
  ["receiverNoiseBandwidthHz", "Noise bandwidth", "Receiver assumptions", "Hz"],
  ["receiverNoiseBandwidthSource", "Noise bandwidth source", "Receiver assumptions"],
  ["receiverNoiseFigureDb", "Noise figure", "Receiver assumptions", "dB"],
  ["receiverRequiredSnrDb", "Required SNR", "Receiver assumptions", "dB"],
  ["receiverMarginDb", "Receiver margin", "Receiver assumptions", "dB"],
].map(([key, label, group, unit = ""]) => Object.freeze({ key, label, group, unit }));

export function compareReportIds(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function recorded(value) {
  return value !== undefined && value !== null && value !== "" && (typeof value !== "number" || Number.isFinite(value));
}

export function normalizeReportProfile(profile) {
  const mode = profile.receiverSensitivityMode;
  const thresholdKnown = mode === "manual" ? recorded(profile.receiverSensitivityDbm)
    : mode === "derived" && ["receiverNoiseBandwidthHz", "receiverNoiseFigureDb", "receiverRequiredSnrDb", "receiverMarginDb"].every((key) => recorded(profile[key]));
  const values = { ...profile, effectiveSensitivityDbm: recorded(profile.effectiveSensitivityDbm) ? profile.effectiveSensitivityDbm : thresholdKnown ? effectiveReceiverSensitivityDbm(profile) : null };
  return Object.fromEntries(REPORT_RF_FIELDS.map(({ key }) => [key, recorded(values[key]) ? values[key] : null]));
}

export function formatReportRFValue(field, value) {
  return value === null ? "Not recorded" : `${String(value)}${field.unit ? ` ${field.unit}` : ""}`;
}

/** Lossless presentation grouping. Input profiles must already be resolved in request order. */
export function groupReportRFProfiles(profiles = []) {
  const cells = profiles.map((profile) => ({ id: String(profile.cellId), values: normalizeReportProfile(profile) }))
    .sort((a, b) => compareReportIds(a.id, b.id));
  if (!cells.length) return { kind: "missing", cells: [], common: [], groups: [], deviations: [], reference: null };
  const common = REPORT_RF_FIELDS.filter(({ key }) => cells[0].values[key] !== null && cells.every((cell) => Object.is(cell.values[key], cells[0].values[key])))
    .map((field) => ({ ...field, value: cells[0].values[field.key] }));
  const signatures = new Map();
  for (const cell of cells) {
    const signature = JSON.stringify(cell.values);
    const group = signatures.get(signature) ?? [];
    group.push(cell);
    signatures.set(signature, group);
  }
  const sortedGroups = [...signatures.values()].sort((a, b) => b.length - a.length || compareReportIds(a[0].id, b[0].id));
  const identical = signatures.size === 1;
  const partial = cells.some((cell) => REPORT_RF_FIELDS.some(({ key }) => key !== "pci" && cell.values[key] === null));
  const reference = identical || sortedGroups[0].length > 1 ? sortedGroups[0][0] : null;
  const referenceCount = reference ? sortedGroups[0].length : 0;
  const commonKeys = new Set(common.map(({ key }) => key));
  const fields = reference
    ? REPORT_RF_FIELDS.filter(({ key }) => reference.values[key] !== null).map((field) => ({ ...field, value: reference.values[field.key], common: commonKeys.has(field.key) }))
    : common;
  const groups = [...new Set(fields.map(({ group }) => group))].map((title) => ({
    title,
    fields: fields.filter(({ group }) => group === title),
  }));
  const deviations = cells.map((cell) => ({
    id: cell.id,
    fields: REPORT_RF_FIELDS.filter(({ key }) => reference ? !Object.is(cell.values[key], reference.values[key]) : !commonKeys.has(key) && cell.values[key] !== null)
      .map((field) => ({ ...field, value: cell.values[field.key] })),
  }));
  return { kind: cells.every((cell) => Object.values(cell.values).every((value) => value === null)) ? "unknown" : cells.length === 1 ? "single" : identical ? "common" : reference ? "reference" : "mixed", cells, common, groups, deviations, reference, referenceCount, partial };
}
