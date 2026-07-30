import {
  DEFAULT_RF_PROFILE,
  DEFAULT_SIMULATION,
  NETWORK_TECHNOLOGIES,
  POLICY_LIMITS,
  RF_PROFILE_SCHEMA_VERSION,
  networkTechnologyForFrequency,
} from "../generated/policy.js";

const DUPLEX_MODES = new Set(["fdd", "tdd", "sdl", "sul"]);
const HORIZONTAL_PATTERNS = new Set(["ideal-sector", "cosine-sector", "omni"]);
const VERTICAL_PATTERNS = new Set(["flat", "panel-10deg", "panel-20deg"]);

export function resolveRFProfile(tower = {}, settings = DEFAULT_SIMULATION, index = 0) {
  const override = tower.rfProfile ?? {};
  const globalFrequency = finiteNumber(settings.frequencyGHz, DEFAULT_SIMULATION.frequencyGHz);
  const explicitTechnology = normalizeTechnology(override.networkTech);
  const networkTech = explicitTechnology
    ?? networkTechnologyForFrequency(globalFrequency);
  const technology = NETWORK_TECHNOLOGIES.find((candidate) => candidate.id === networkTech)
    ?? NETWORK_TECHNOLOGIES[1];
  const frequencyGHz = override.frequencyGHz === undefined
    ? explicitTechnology ? technology.default_frequency_ghz : globalFrequency
    : finiteNumber(override.frequencyGHz, technology.default_frequency_ghz);
  const reuseFactor = integerNumber(
    override.reuseFactor,
    integerNumber(settings.reuseFactor, DEFAULT_RF_PROFILE.reuseFactor),
  );
  return {
    schemaVersion: RF_PROFILE_SCHEMA_VERSION,
    networkTech,
    frequencyGHz,
    band: cleanText(override.band, technology.default_band),
    bandwidthMHz: finiteNumber(
      override.bandwidthMHz,
      explicitTechnology ? technology.default_bandwidth_mhz : finiteNumber(settings.interferenceBandwidthMHz, technology.default_bandwidth_mhz),
    ),
    channelId: cleanText(override.channelId, `CH-${index % Math.max(reuseFactor, 1) + 1}`),
    duplexMode: cleanText(override.duplexMode, technology.default_duplex_mode).toLowerCase(),
    txPowerDbm: finiteNumber(override.txPowerDbm, settings.txPowerDbm),
    antennaGainDbi: finiteNumber(override.antennaGainDbi, DEFAULT_RF_PROFILE.antennaGainDbi),
    systemLossDb: finiteNumber(override.systemLossDb, DEFAULT_RF_PROFILE.systemLossDb),
    radiusMeters: finiteNumber(override.radiusMeters, settings.radiusMeters),
    beamWidthDeg: finiteNumber(override.beamWidthDeg, settings.beamWidthDeg),
    antennaHeightM: finiteNumber(override.antennaHeightM, DEFAULT_RF_PROFILE.antennaHeightM),
    mechanicalDowntiltDeg: finiteNumber(override.mechanicalDowntiltDeg, DEFAULT_RF_PROFILE.mechanicalDowntiltDeg),
    electricalDowntiltDeg: finiteNumber(override.electricalDowntiltDeg, DEFAULT_RF_PROFILE.electricalDowntiltDeg),
    orientationDeg: normalizeDegrees(finiteNumber(override.orientationDeg, DEFAULT_RF_PROFILE.orientationDeg)),
    horizontalPatternId: cleanText(override.horizontalPatternId, DEFAULT_RF_PROFILE.horizontalPatternId).toLowerCase(),
    verticalPatternId: cleanText(override.verticalPatternId, DEFAULT_RF_PROFILE.verticalPatternId).toLowerCase(),
    loadFactor: finiteNumber(override.loadFactor, finiteNumber(settings.cellLoadPct, 70) / 100),
    reuseFactor,
    pci: optionalInteger(override.pci),
    receiverHeightM: finiteNumber(override.receiverHeightM, DEFAULT_RF_PROFILE.receiverHeightM),
    receiverSensitivityDbm: finiteNumber(override.receiverSensitivityDbm, DEFAULT_RF_PROFILE.receiverSensitivityDbm),
  };
}

export function rfProfileToPayload(profile) {
  return {
    schema_version: profile.schemaVersion,
    network_tech: profile.networkTech,
    frequency_ghz: profile.frequencyGHz,
    band: profile.band,
    bandwidth_mhz: profile.bandwidthMHz,
    channel_id: profile.channelId,
    duplex_mode: profile.duplexMode,
    tx_power_dbm: profile.txPowerDbm,
    antenna_gain_dbi: profile.antennaGainDbi,
    system_loss_db: profile.systemLossDb,
    radius_m: profile.radiusMeters,
    beam_width: profile.beamWidthDeg,
    antenna_height_m: profile.antennaHeightM,
    mechanical_downtilt_deg: profile.mechanicalDowntiltDeg,
    electrical_downtilt_deg: profile.electricalDowntiltDeg,
    orientation_deg: profile.orientationDeg,
    horizontal_pattern_id: profile.horizontalPatternId,
    vertical_pattern_id: profile.verticalPatternId,
    load_factor: profile.loadFactor,
    reuse_factor: profile.reuseFactor,
    pci: profile.pci,
    receiver_height_m: profile.receiverHeightM,
    receiver_sensitivity_dbm: profile.receiverSensitivityDbm,
  };
}

export function validateRFProfile(profile) {
  const errors = {};
  const limits = POLICY_LIMITS;
  checkRange(errors, "frequencyGHz", profile.frequencyGHz, Number.MIN_VALUE, limits.frequency_ghz_max);
  if (networkTechnologyForFrequency(profile.frequencyGHz) !== profile.networkTech) {
    errors.frequencyGHz = "Frequency must match the selected technology.";
  }
  checkText(errors, "band", profile.band);
  checkRange(errors, "bandwidthMHz", profile.bandwidthMHz, limits.bandwidth_mhz_min, limits.bandwidth_mhz_max);
  checkText(errors, "channelId", profile.channelId);
  if (!DUPLEX_MODES.has(profile.duplexMode)) errors.duplexMode = "Unsupported duplex mode.";
  checkRange(errors, "txPowerDbm", profile.txPowerDbm, limits.tx_power_dbm_min, limits.tx_power_dbm_max);
  checkRange(errors, "antennaGainDbi", profile.antennaGainDbi, limits.antenna_gain_dbi_min, limits.antenna_gain_dbi_max);
  checkRange(errors, "systemLossDb", profile.systemLossDb, limits.system_loss_db_min, limits.system_loss_db_max);
  checkRange(errors, "radiusMeters", profile.radiusMeters, limits.radius_m_min, limits.radius_m_max);
  checkRange(errors, "beamWidthDeg", profile.beamWidthDeg, limits.beam_width_deg_min, limits.beam_width_deg_max);
  checkRange(errors, "antennaHeightM", profile.antennaHeightM, limits.antenna_height_m_min, limits.antenna_height_m_max);
  checkRange(errors, "mechanicalDowntiltDeg", profile.mechanicalDowntiltDeg, limits.downtilt_deg_min, limits.downtilt_deg_max);
  checkRange(errors, "electricalDowntiltDeg", profile.electricalDowntiltDeg, limits.downtilt_deg_min, limits.downtilt_deg_max);
  checkRange(errors, "orientationDeg", profile.orientationDeg, 0, 359.999999);
  if (!HORIZONTAL_PATTERNS.has(profile.horizontalPatternId)) errors.horizontalPatternId = "Unsupported horizontal pattern.";
  if (!VERTICAL_PATTERNS.has(profile.verticalPatternId)) errors.verticalPatternId = "Unsupported vertical pattern.";
  checkRange(errors, "loadFactor", profile.loadFactor, Number.MIN_VALUE, 1);
  checkIntegerRange(errors, "reuseFactor", profile.reuseFactor, 1, limits.reuse_factor_max);
  if (profile.pci !== null) {
    checkIntegerRange(errors, "pci", profile.pci, limits.pci_min, profile.networkTech === "4g" ? limits.pci_lte_max : limits.pci_nr_max);
  }
  checkRange(errors, "receiverHeightM", profile.receiverHeightM, limits.receiver_height_m_min, limits.receiver_height_m_max);
  checkRange(errors, "receiverSensitivityDbm", profile.receiverSensitivityDbm, limits.receiver_sensitivity_dbm_min, limits.receiver_sensitivity_dbm_max);
  return errors;
}

export function hasRFProfileErrors(profile) {
  return Object.keys(validateRFProfile(profile)).length > 0;
}

export function technologyDefaults(networkTech) {
  const technology = NETWORK_TECHNOLOGIES.find((candidate) => candidate.id === networkTech)
    ?? NETWORK_TECHNOLOGIES[1];
  return {
    networkTech: technology.id,
    frequencyGHz: technology.default_frequency_ghz,
    band: technology.default_band,
    bandwidthMHz: technology.default_bandwidth_mhz,
    duplexMode: technology.default_duplex_mode,
  };
}

export function rfProfileOverrideFromProperties(properties = {}) {
  const nested = properties.rf_profile && typeof properties.rf_profile === "object" && !Array.isArray(properties.rf_profile)
    ? properties.rf_profile
    : {};
  const read = (...names) => {
    for (const source of [nested, properties]) {
      for (const name of names) {
        if (source[name] !== undefined && source[name] !== null && source[name] !== "") return source[name];
      }
    }
    return undefined;
  };
  return Object.fromEntries(Object.entries({
    networkTech: read("network_tech", "networkTech"),
    frequencyGHz: read("frequency_ghz", "frequencyGHz"),
    band: read("band"),
    bandwidthMHz: read("bandwidth_mhz", "bandwidthMHz"),
    channelId: read("channel_id", "channelId"),
    duplexMode: read("duplex_mode", "duplexMode"),
    txPowerDbm: read("tx_power_dbm", "txPowerDbm"),
    antennaGainDbi: read("antenna_gain_dbi", "antennaGainDbi"),
    systemLossDb: read("system_loss_db", "systemLossDb"),
    radiusMeters: read("radius_m", "radiusMeters"),
    beamWidthDeg: read("beam_width", "beamWidthDeg"),
    antennaHeightM: read("antenna_height_m", "antennaHeightM"),
    mechanicalDowntiltDeg: read("mechanical_downtilt_deg", "mechanicalDowntiltDeg"),
    electricalDowntiltDeg: read("electrical_downtilt_deg", "electricalDowntiltDeg"),
    orientationDeg: read("orientation_deg", "orientationDeg"),
    horizontalPatternId: read("horizontal_pattern_id", "horizontalPatternId"),
    verticalPatternId: read("vertical_pattern_id", "verticalPatternId"),
    loadFactor: read("load_factor", "loadFactor"),
    reuseFactor: read("reuse_factor", "reuseFactor"),
    pci: read("pci"),
    receiverHeightM: read("receiver_height_m", "receiverHeightM"),
    receiverSensitivityDbm: read("receiver_sensitivity_dbm", "receiverSensitivityDbm"),
  }).filter(([, value]) => value !== undefined));
}

function checkText(errors, key, value) {
  const length = new TextEncoder().encode(String(value ?? "")).byteLength;
  if (!String(value ?? "").trim() || length > POLICY_LIMITS.profile_text_bytes) {
    errors[key] = `Required; at most ${POLICY_LIMITS.profile_text_bytes} bytes.`;
  }
}

function checkRange(errors, key, value, minimum, maximum) {
  if (!Number.isFinite(Number(value)) || Number(value) < minimum || Number(value) > maximum) {
    errors[key] = `Must be between ${minimum} and ${maximum}.`;
  }
}

function checkIntegerRange(errors, key, value, minimum, maximum) {
  if (!Number.isInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) {
    errors[key] = `Must be a whole number from ${minimum} to ${maximum}.`;
  }
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number(fallback);
}

function integerNumber(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : Number(fallback);
}

function optionalInteger(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function normalizeTechnology(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "4g" || normalized.includes("lte")) return "4g";
  if (normalized === "5g" || normalized.includes("nr")) return "5g";
  if (normalized === "6g" || normalized.includes("sub-thz")) return "6g";
  return null;
}

function cleanText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || String(fallback ?? "");
}

function normalizeDegrees(value) {
  return ((Number(value) % 360) + 360) % 360;
}
