import { DEFAULT_RECOMMENDATION_RESULTS, networkTechnologyForFrequency } from "../generated/policy.js";
import { resolveRFProfile, rfProfileToPayload } from "./rfProfile.js";

export function buildSimulationPayload(selectedTower, settings) {
  const profile = resolveRFProfile(selectedTower, settings, 0);
  return {
    tower_lon: selectedTower.coordinates[0],
    tower_lat: selectedTower.coordinates[1],
    rays: settings.rayCount,
    radius_m: settings.radiusMeters,
    frequency_ghz: settings.frequencyGHz,
    tx_power_dbm: settings.txPowerDbm,
    azimuth: settings.azimuthDeg,
    beam_width: settings.beamWidthDeg,
    calibration_offset_db: settings.calibrationOffsetDb ?? 0,
    rf_profile: rfProfileToPayload(profile),
  };
}

export function buildNetworkOptimizationPayload(selectedNetworkTowers, settings, networkAzimuths = {}) {
  return {
    towers: selectedNetworkTowers.map((tower, index) => ({
      id: String(tower.cellId ?? tower.id),
      tower_lon: tower.coordinates[0],
      tower_lat: tower.coordinates[1],
      azimuth: azimuthForTower(tower, settings, networkAzimuths),
      rf_profile: rfProfileToPayload(resolveRFProfile(tower, settings, index)),
    })),
    rays: settings.rayCount,
    radius_m: settings.radiusMeters,
    frequency_ghz: settings.frequencyGHz,
    tx_power_dbm: settings.txPowerDbm,
    beam_width: settings.beamWidthDeg,
    calibration_offset_db: settings.calibrationOffsetDb ?? 0,
  };
}

export function buildInterferencePayload(selectedNetworkTowers, settings, networkOptimization, networkAzimuths = {}) {
  const optimizedByID = new Map(
    (networkOptimization?.optimized_towers ?? []).map((tower) => [String(tower.id), tower]),
  );
  return {
    network_tech: networkTechnologyForFrequency(settings.frequencyGHz),
    towers: selectedNetworkTowers.map((tower, index) => {
      const id = String(tower.cellId ?? tower.id);
      return {
        id,
        tower_lon: tower.coordinates[0],
        tower_lat: tower.coordinates[1],
        azimuth: Number(optimizedByID.get(id)?.optimal_azimuth ?? azimuthForTower(tower, settings, networkAzimuths)),
        rf_profile: rfProfileToPayload(resolveRFProfile(tower, settings, index)),
      };
    }),
    radius_m: settings.radiusMeters,
    frequency_ghz: settings.frequencyGHz,
    tx_power_dbm: settings.txPowerDbm,
    beam_width: settings.beamWidthDeg,
    bandwidth_mhz: settings.interferenceBandwidthMHz,
    load_factor: settings.cellLoadPct / 100,
    reuse_factor: settings.reuseFactor,
    noise_figure_db: settings.noiseFigureDb,
    sample_spacing_m: settings.sampleSpacingMeters,
    calibration_offset_db: settings.calibrationOffsetDb ?? 0,
  };
}

export function buildRecommendationPayload(selectedNetworkTowers, settings, selectionPolygon, networkOptimization, networkAzimuths = {}) {
  const optimizedByID = new Map(
    (networkOptimization?.optimized_towers ?? []).map((tower) => [String(tower.id), tower]),
  );
  const network = buildNetworkOptimizationPayload(selectedNetworkTowers, settings, networkAzimuths);
  return {
    ...network,
    towers: network.towers.map((tower) => ({
      ...tower,
      azimuth: Number(optimizedByID.get(tower.id)?.optimal_azimuth ?? tower.azimuth),
    })),
    network_tech: networkTechnologyForFrequency(settings.frequencyGHz),
    search_polygon: selectionPolygon.map((point) => Array.isArray(point)
      ? [point[0], point[1]]
      : [point.lng ?? point.lon, point.lat]),
    max_results: DEFAULT_RECOMMENDATION_RESULTS,
  };
}

export function buildMeasurementPayload(towers, settings, samples, networkOptimization, networkAzimuths = {}) {
  const interference = buildInterferencePayload(towers, settings, networkOptimization, networkAzimuths);
  return {
    network_tech: interference.network_tech,
    towers: interference.towers,
    radius_m: interference.radius_m,
    frequency_ghz: interference.frequency_ghz,
    tx_power_dbm: interference.tx_power_dbm,
    beam_width: interference.beam_width,
    bandwidth_mhz: interference.bandwidth_mhz,
    noise_figure_db: interference.noise_figure_db,
    calibration_offset_db: interference.calibration_offset_db,
    samples,
  };
}

export function azimuthForTower(tower, settings, networkAzimuths = {}) {
  const explicit = networkAzimuths[tower.id] ?? networkAzimuths[String(tower.id)]
    ?? networkAzimuths[String(tower.cellId ?? "")];
  return Number.isFinite(Number(explicit)) ? Number(explicit) : settings.azimuthDeg;
}
