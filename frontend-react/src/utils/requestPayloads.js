export function buildSimulationPayload(selectedTower, settings) {
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
  };
}

export function buildNetworkOptimizationPayload(selectedNetworkTowers, settings) {
  return {
    towers: selectedNetworkTowers.map((tower) => ({
      id: String(tower.cellId ?? tower.id),
      tower_lon: tower.coordinates[0],
      tower_lat: tower.coordinates[1],
      azimuth: settings.azimuthDeg,
    })),
    rays: settings.rayCount,
    radius_m: settings.radiusMeters,
    frequency_ghz: settings.frequencyGHz,
    tx_power_dbm: settings.txPowerDbm,
    beam_width: settings.beamWidthDeg,
    calibration_offset_db: settings.calibrationOffsetDb ?? 0,
  };
}

export function buildInterferencePayload(selectedNetworkTowers, settings, networkOptimization) {
  const optimizedByID = new Map(
    (networkOptimization?.optimized_towers ?? []).map((tower) => [String(tower.id), tower]),
  );
  return {
    network_tech: settings.frequencyGHz < 10 ? "4g" : "5g",
    towers: selectedNetworkTowers.map((tower) => {
      const id = String(tower.cellId ?? tower.id);
      return {
        id,
        tower_lon: tower.coordinates[0],
        tower_lat: tower.coordinates[1],
        azimuth: Number(optimizedByID.get(id)?.optimal_azimuth ?? settings.azimuthDeg),
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

export function buildRecommendationPayload(selectedNetworkTowers, settings, selectionPolygon) {
  return {
    ...buildNetworkOptimizationPayload(selectedNetworkTowers, settings),
    network_tech: settings.frequencyGHz < 10 ? "4g" : "5g",
    search_polygon: selectionPolygon.map((point) => Array.isArray(point)
      ? [point[0], point[1]]
      : [point.lng ?? point.lon, point.lat]),
    max_results: 5,
  };
}

export function buildMeasurementPayload(towers, settings, samples, networkOptimization) {
  const interference = buildInterferencePayload(towers, settings, networkOptimization);
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
