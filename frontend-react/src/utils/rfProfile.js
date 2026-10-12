import {
  DEFAULT_RF_PROFILE,
  DEFAULT_SIMULATION,
  NETWORK_TECHNOLOGIES,
  POLICY_LIMITS,
  RF_PROFILE_OPTIONS,
  RF_PROFILE_SCHEMA_VERSION,
  networkTechnologyForFrequency,
} from "../generated/policy.js";

const DUPLEX_MODES = new Set(["fdd", "tdd", "sdl", "sul"]);
const HORIZONTAL_PATTERNS = new Set(["ideal-sector", "cosine-sector", "omni", "3gpp-single-element"]);
const VERTICAL_PATTERNS = new Set(["flat", "panel-10deg", "panel-20deg"]);
const PROPAGATION_MODELS = new Set(["legacy_fspl_walls", "urban_short_range", "research_sub_thz"]);
const RECEIVER_SENSITIVITY_MODES = new Set((RF_PROFILE_OPTIONS.receiverSensitivityModes ?? []).map((mode) => mode.id));

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
  const propagationModelID = cleanText(
    override.propagationModelID ?? override.propagationModelId,
    cleanText(settings.propagationModelID, defaultPropagationModelForFrequency(frequencyGHz)),
  ).toLowerCase();
  const reuseFactor = integerNumber(
    override.reuseFactor,
    integerNumber(settings.reuseFactor, DEFAULT_RF_PROFILE.reuseFactor),
  );
  const bandwidthMHz = finiteNumber(
    override.bandwidthMHz,
    explicitTechnology ? technology.default_bandwidth_mhz : finiteNumber(settings.interferenceBandwidthMHz, technology.default_bandwidth_mhz),
  );
  return {
    schemaVersion: RF_PROFILE_SCHEMA_VERSION,
    networkTech,
    propagationModelID,
    frequencyGHz,
    band: cleanText(override.band, technology.default_band),
    bandwidthMHz,
    channelId: cleanText(override.channelId, `CH-${index % Math.max(reuseFactor, 1) + 1}`),
    duplexMode: cleanText(override.duplexMode, technology.default_duplex_mode).toLowerCase(),
    txPowerDbm: finiteNumber(override.txPowerDbm, settings.txPowerDbm),
    antennaGainDbi: finiteNumber(override.txAntennaGainDbi ?? override.tx_antenna_gain_dbi ?? override.antennaGainDbi ?? override.antenna_gain_dbi, DEFAULT_RF_PROFILE.antennaGainDbi),
    rxAntennaGainDbi: finiteNumber(override.rxAntennaGainDbi ?? override.rx_antenna_gain_dbi, DEFAULT_RF_PROFILE.rxAntennaGainDbi),
    systemLossDb: finiteNumber(override.systemLossDb ?? override.system_loss_db, DEFAULT_RF_PROFILE.systemLossDb),
    polarizationLossDb: finiteNumber(override.polarizationLossDb ?? override.polarization_loss_db, DEFAULT_RF_PROFILE.polarizationLossDb),
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
    receiverSensitivityMode: cleanText(
      override.receiverSensitivityMode ?? override.receiver_sensitivity_mode,
      DEFAULT_RF_PROFILE.receiverSensitivityMode,
    ).toLowerCase(),
    receiverNoiseBandwidthHz: finiteNumber(
      override.receiverNoiseBandwidthHz ?? override.receiver_noise_bandwidth_hz,
      bandwidthMHz * 1e6,
    ),
    receiverNoiseBandwidthSource: cleanText(
      override.receiverNoiseBandwidthSource ?? override.receiver_noise_bandwidth_source,
      override.receiverNoiseBandwidthHz !== undefined || override.receiver_noise_bandwidth_hz !== undefined
        ? "explicit_receiver_noise_bandwidth_hz"
        : "channel_bandwidth_approximation",
    ).toLowerCase(),
    receiverNoiseFigureDb: finiteNumber(
      override.receiverNoiseFigureDb ?? override.receiver_noise_figure_db,
      finiteNumber(settings.noiseFigureDb, DEFAULT_RF_PROFILE.receiverNoiseFigureDb),
    ),
    receiverRequiredSnrDb: finiteNumber(
      override.receiverRequiredSnrDb ?? override.receiver_required_snr_db,
      DEFAULT_RF_PROFILE.receiverRequiredSnrDb,
    ),
    receiverMarginDb: finiteNumber(
      override.receiverMarginDb ?? override.receiver_margin_db,
      DEFAULT_RF_PROFILE.receiverMarginDb,
    ),
  };
}

export function rfProfileToPayload(profile) {
  return {
    schema_version: profile.schemaVersion,
    network_tech: profile.networkTech,
    propagation_model: profile.propagationModelID,
    frequency_ghz: profile.frequencyGHz,
    band: profile.band,
    bandwidth_mhz: profile.bandwidthMHz,
    channel_id: profile.channelId,
    duplex_mode: profile.duplexMode,
    tx_power_dbm: profile.txPowerDbm,
    tx_antenna_gain_dbi: profile.antennaGainDbi,
    antenna_gain_dbi: profile.antennaGainDbi,
    rx_antenna_gain_dbi: profile.rxAntennaGainDbi,
    system_loss_db: profile.systemLossDb,
    polarization_loss_db: profile.polarizationLossDb,
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
    receiver_sensitivity_mode: profile.receiverSensitivityMode,
    receiver_noise_bandwidth_hz: profile.receiverNoiseBandwidthHz,
    receiver_noise_figure_db: profile.receiverNoiseFigureDb,
    receiver_required_snr_db: profile.receiverRequiredSnrDb,
    receiver_margin_db: profile.receiverMarginDb,
  };
}

export function validateRFProfile(profile) {
  const errors = {};
  const limits = POLICY_LIMITS;
  checkRange(errors, "frequencyGHz", profile.frequencyGHz, Number.MIN_VALUE, limits.frequency_ghz_max);
  if (networkTechnologyForFrequency(profile.frequencyGHz) !== profile.networkTech) {
    errors.frequencyGHz = "Frequency must match the selected technology.";
  }
  if (!PROPAGATION_MODELS.has(profile.propagationModelID)) errors.propagationModelID = "Unsupported propagation model.";
  checkText(errors, "band", profile.band);
  checkRange(errors, "bandwidthMHz", profile.bandwidthMHz, limits.bandwidth_mhz_min, limits.bandwidth_mhz_max);
  checkText(errors, "channelId", profile.channelId);
  if (!DUPLEX_MODES.has(profile.duplexMode)) errors.duplexMode = "Unsupported duplex mode.";
  checkRange(errors, "txPowerDbm", profile.txPowerDbm, limits.tx_power_dbm_min, limits.tx_power_dbm_max);
  checkRange(errors, "antennaGainDbi", profile.antennaGainDbi, limits.antenna_gain_dbi_min, limits.antenna_gain_dbi_max);
  checkRange(errors, "rxAntennaGainDbi", profile.rxAntennaGainDbi, limits.rx_antenna_gain_dbi_min, limits.rx_antenna_gain_dbi_max);
  checkRange(errors, "systemLossDb", profile.systemLossDb, limits.system_loss_db_min, limits.system_loss_db_max);
  checkRange(errors, "polarizationLossDb", profile.polarizationLossDb, limits.polarization_loss_db_min, limits.polarization_loss_db_max);
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
  if (!RECEIVER_SENSITIVITY_MODES.has(profile.receiverSensitivityMode)) {
    errors.receiverSensitivityMode = "Unsupported receiver sensitivity mode.";
  }
  if (profile.receiverSensitivityMode === "manual") {
    checkRange(errors, "receiverSensitivityDbm", profile.receiverSensitivityDbm, limits.receiver_sensitivity_dbm_min, limits.receiver_sensitivity_dbm_max);
  } else if (profile.receiverSensitivityMode === "derived") {
    checkRange(errors, "receiverNoiseBandwidthHz", profile.receiverNoiseBandwidthHz, limits.receiver_noise_bandwidth_hz_min, limits.receiver_noise_bandwidth_hz_max);
    checkRange(errors, "receiverNoiseFigureDb", profile.receiverNoiseFigureDb, limits.receiver_noise_figure_db_min, limits.receiver_noise_figure_db_max);
    checkRange(errors, "receiverRequiredSnrDb", profile.receiverRequiredSnrDb, limits.receiver_required_snr_db_min, limits.receiver_required_snr_db_max);
    checkRange(errors, "receiverMarginDb", profile.receiverMarginDb, limits.receiver_margin_db_min, limits.receiver_margin_db_max);
  }
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

export function defaultPropagationModelForFrequency(frequencyGHz) {
  return Number(frequencyGHz) >= 100 ? "research_sub_thz" : "urban_short_range";
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
    propagationModelID: read("propagation_model", "propagationModelID", "propagationModelId"),
    frequencyGHz: read("frequency_ghz", "frequencyGHz"),
    band: read("band"),
    bandwidthMHz: read("bandwidth_mhz", "bandwidthMHz"),
    channelId: read("channel_id", "channelId"),
    duplexMode: read("duplex_mode", "duplexMode"),
    txPowerDbm: read("tx_power_dbm", "txPowerDbm"),
    antennaGainDbi: read("tx_antenna_gain_dbi", "txAntennaGainDbi", "antenna_gain_dbi", "antennaGainDbi"),
    rxAntennaGainDbi: read("rx_antenna_gain_dbi", "rxAntennaGainDbi"),
    systemLossDb: read("system_loss_db", "systemLossDb"),
    polarizationLossDb: read("polarization_loss_db", "polarizationLossDb"),
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
    receiverSensitivityMode: read("receiver_sensitivity_mode", "receiverSensitivityMode"),
    receiverNoiseBandwidthHz: read("receiver_noise_bandwidth_hz", "receiverNoiseBandwidthHz"),
    receiverNoiseBandwidthSource: read("receiver_noise_bandwidth_source", "receiverNoiseBandwidthSource"),
    receiverNoiseFigureDb: read("receiver_noise_figure_db", "receiverNoiseFigureDb"),
    receiverRequiredSnrDb: read("receiver_required_snr_db", "receiverRequiredSnrDb"),
    receiverMarginDb: read("receiver_margin_db", "receiverMarginDb"),
  }).filter(([, value]) => value !== undefined));
}

export function effectiveReceiverSensitivityDbm(profile = {}) {
  if (profile.receiverSensitivityMode !== "derived") return Number(profile.receiverSensitivityDbm);
  const bandwidthHz = Number(profile.receiverNoiseBandwidthHz);
  const noiseFigureDb = Number(profile.receiverNoiseFigureDb);
  const requiredSnrDb = Number(profile.receiverRequiredSnrDb);
  const marginDb = Number(profile.receiverMarginDb);
  if (![bandwidthHz, noiseFigureDb, requiredSnrDb, marginDb].every(Number.isFinite) || bandwidthHz <= 0) {
    return Number(profile.receiverSensitivityDbm);
  }
  return -174 + 10 * Math.log10(bandwidthHz) + noiseFigureDb + requiredSnrDb + marginDb;
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
