import { RESULT_FRESHNESS } from "../domain/resultContext.js";
import { UNAVAILABLE_VALUE } from "./appWorkspace.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

export function interferenceHasExplicitNoSignal(properties = {}) {
  return properties.quality_class === "no_signal"
    || (hasOwn(properties, "rsrp_dbm") && properties.rsrp_dbm === null);
}

export function interferenceServingCellLabel(properties = {}) {
  if (properties.serving_cell_id) return String(properties.serving_cell_id);
  return interferenceHasExplicitNoSignal(properties) ? "No signal" : UNAVAILABLE_VALUE;
}

export function interferenceStrongestInterfererLabel(properties = {}) {
  if (properties.strongest_interferer_id) return String(properties.strongest_interferer_id);
  if (interferenceHasExplicitNoSignal(properties)) return "No signal";
  if (hasOwn(properties, "interferer_count") && Number(properties.interferer_count) === 0
    && hasOwn(properties, "rsrp_dbm") && properties.rsrp_dbm !== null
    && Number.isFinite(Number(properties.rsrp_dbm)) && properties.quality_class) return "Noise-limited";
  return UNAVAILABLE_VALUE;
}

export function interferenceCountLabel(value) {
  if (value === null || value === undefined || value === "") return UNAVAILABLE_VALUE;
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString("en") : UNAVAILABLE_VALUE;
}

export function interferenceQualityLabel(properties = {}) {
  return properties.quality_class ? String(properties.quality_class).split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : UNAVAILABLE_VALUE;
}

export function interferenceMeasurementFamilyLabel(model = {}) {
  if (model.measurement_family === "nr_ss") return "Modeled SS-RSRP / SS-RSRQ";
  if (model.measurement_family === "lte_crs") return "Modeled LTE CRS RSRP / RSRQ";
  return "Measurement family unavailable";
}

export function explainInterferenceSample(properties = {}) {
  if (!hasOwn(properties, "rsrp_dbm")) {
    return "UNAVAILABLE · The retained sample has no RSRP field, so its signal state cannot be interpreted.";
  }
  if (interferenceHasExplicitNoSignal(properties)) {
    return "No eligible modeled carrier was retained for this sample.";
  }

  const rsrp = Number(properties.rsrp_dbm);
  const sinr = Number(properties.sinr_db);
  if (!Number.isFinite(rsrp) || !hasOwn(properties, "sinr_db") || !Number.isFinite(sinr)) {
    return "UNAVAILABLE · The retained sample does not include finite RSRP and SINR values.";
  }

  const strongestInterferer = Number(properties.strongest_interferer_dbm);
  if (properties.strongest_interferer_id
    && Number.isFinite(strongestInterferer)
    && Math.abs(rsrp - strongestInterferer) <= 1
    && Math.abs(sinr) <= 1) {
    return "Reported serving and strongest-interferer powers are within 1 dB, matching the near-zero SINR at this sample.";
  }

  const interferencePower = Number(properties.interference_power_mw);
  const desiredPower = Number(properties.desired_signal_power_mw);
  if (sinr < 0 && Number.isFinite(interferencePower) && Number.isFinite(desiredPower) && interferencePower > desiredPower) {
    return "The retained power ledger reports co-channel interference above desired-signal power, alongside negative SINR.";
  }

  if (hasOwn(properties, "wall_count") && Number(properties.wall_count) > 0) {
    const wallCount = Number(properties.wall_count);
    return `The retained sample reports ${wallCount} modeled wall${wallCount === 1 ? "" : "s"} on the serving path.`;
  }

  if (properties.strongest_interferer_id) {
    return `The retained response identifies ${properties.strongest_interferer_id} as the strongest co-channel interferer.`;
  }
  if (hasOwn(properties, "interferer_count") && Number(properties.interferer_count) === 0) {
    return "The retained response reports no co-channel interferers for this sample.";
  }
  return "UNAVAILABLE · The retained response does not include enough power and interferer evidence to explain this sample.";
}

export function resolveInterferenceSampleFreshness(sourceContext, sampleID, workspaceLineage, planDirty) {
  if (!sourceContext?.analysis_id || !Array.isArray(sourceContext.sample_ids)
    || sampleID === null || sampleID === undefined
    || !sourceContext.sample_ids.includes(String(sampleID))) {
    return RESULT_FRESHNESS.UNAVAILABLE;
  }
  const sourceIdentity = [sourceContext.project_id, sourceContext.scenario_id, sourceContext.scenario_revision_id];
  const currentIdentity = [workspaceLineage?.project_id, workspaceLineage?.scenario_id, workspaceLineage?.scenario_revision_id];
  if (sourceIdentity.some((value, index) => String(value ?? "") !== String(currentIdentity[index] ?? ""))) {
    return RESULT_FRESHNESS.STALE;
  }
  return planDirty ? RESULT_FRESHNESS.STALE : RESULT_FRESHNESS.CURRENT;
}
