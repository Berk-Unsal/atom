import { DEFAULT_RECOMMENDATION_RESULTS, networkTechnologyForFrequency } from "../generated/policy.js";
import { resolveRFProfile, rfProfileToPayload } from "./rfProfile.js";
import { optimizationConfigToPayload } from "./optimizationConfig.js";

export function buildSimulationPayload(selectedTower, settings, profileIndex = 0) {
  const profile = resolveRFProfile(selectedTower, settings, profileIndex);
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

export function buildPathProfilePayload(selectedTower, receiver, settings, options = {}) {
  const profile = resolveRFProfile(selectedTower, settings, 0);
  return {
    transmitter: { lon: selectedTower.coordinates[0], lat: selectedTower.coordinates[1] },
    receiver: { lon: Number(receiver[0]), lat: Number(receiver[1]) },
    sample_spacing_m: Number(options.sampleSpacingM ?? 10),
    model_profile: options.modelProfile ?? defaultPathModelProfile(profile.frequencyGHz),
    azimuth: settings.azimuthDeg,
    calibration_offset_db: settings.calibrationOffsetDb ?? 0,
    rf_profile: rfProfileToPayload(profile),
    fidelity: {
      building_loss_mode: options.buildingLossMode ?? "screen-diffraction",
      diffraction_model: options.diffractionModel ?? "single-knife-edge",
      default_wall_material: options.defaultWallMaterial ?? "concrete",
      clutter_specific_attenuation_db_per_km: Number(options.clutterSpecificAttenuationDbPerKm ?? 0),
      vegetation_depth_m: Number(options.vegetationDepthM ?? 0),
      vegetation_specific_attenuation_db_per_m: Number(options.vegetationSpecificAttenuationDbPerM ?? 0),
      gas_specific_attenuation_db_per_km: Number(options.gasSpecificAttenuationDbPerKm ?? 0),
      rain_specific_attenuation_db_per_km: Number(options.rainSpecificAttenuationDbPerKm ?? 0),
      shadow_sigma_db: Number(options.shadowSigmaDb ?? 0),
    },
  };
}

export function buildSubTHZReferencePayload(selectedTower, receiver, settings, options = {}) {
  const rainEnabled = Boolean(options.rainEnabled);
  const localFogEnabled = Boolean(options.localFogEnabled);
  const payload = {
    frequency_ghz: Number(options.frequencyGHz),
    transmitter: {
      lon: Number(selectedTower.coordinates[0]),
      lat: Number(selectedTower.coordinates[1]),
      height_m: Number(options.txHeightM),
    },
    receiver: {
      lon: Number(receiver[0]),
      lat: Number(receiver[1]),
      height_m: Number(options.rxHeightM),
    },
    atmosphere: {
      enabled: true,
      pressure_hpa: Number(options.pressureHpa),
      temperature_k: Number(options.temperatureK),
      water_vapour_density_g_m3: Number(options.waterVapourDensityGm3),
    },
    rain: {
      enabled: rainEnabled,
      rain_rate_mm_h: Number(options.rainRateMmh),
      polarization: options.rainPolarization ?? "circular",
      polarization_tilt_deg: Number(options.rainPolarizationTiltDeg ?? 45),
    },
    local_fog: {
      enabled: localFogEnabled,
      liquid_water_density_g_m3: Number(options.localFogDensityGm3),
      temperature_k: Number(options.localFogTemperatureK ?? options.temperatureK),
    },
  };
  if (options.linkBudgetEnabled) {
    payload.link_budget = {
      conducted_tx_power_dbm: Number(options.conductedTxPowerDbm),
      tx_gain_dbi: Number(options.txGainDbi),
      rx_gain_dbi: Number(options.rxGainDbi),
      tx_pattern_attenuation_db: Number(options.txPatternAttenuationDb),
      system_loss_db: Number(options.systemLossDb),
      polarization_loss_db: Number(options.polarizationLossDb),
      calibration_offset_db: Number(options.calibrationOffsetDb),
    };
  }
  return payload;
}

export function buildP1411ReferencePayload(selectedTower, receiver, settings, options = {}) {
  const frequencyGHz = Number(options.frequencyGHz);
  const txHeightM = Number(options.txHeightM);
  const rxHeightM = Number(options.rxHeightM);
  const payload = {
    frequency_ghz: frequencyGHz,
    transmitter: {
      lon: Number(selectedTower.coordinates[0]),
      lat: Number(selectedTower.coordinates[1]),
      height_m: txHeightM,
    },
    receiver: {
      lon: Number(receiver[0]),
      lat: Number(receiver[1]),
      height_m: rxHeightM,
    },
    morphology: options.morphology ?? "unknown",
    rooftop_relation: options.rooftopRelation ?? "unknown",
    los_state: options.losState ?? "unknown",
    candidate_model_id: options.candidateModelID ?? "all",
    provenance: {
      frequency_ghz: options.frequencyProvenance ?? "user_declared",
      distance_m: options.distanceProvenance ?? "geometry_derived",
      tx_height_m: options.txHeightProvenance ?? "user_declared",
      rx_height_m: options.rxHeightProvenance ?? "user_declared",
      morphology: options.morphologyProvenance ?? "user_declared",
      rooftop_relation: options.rooftopProvenance ?? "user_declared",
      los_state: options.losProvenance ?? "user_declared",
    },
  };

  if (options.includeAtmosphericComparison) {
    payload.atmospheric_reference = {
      frequency_ghz: frequencyGHz,
      transmitter: { ...payload.transmitter },
      receiver: { ...payload.receiver },
      atmosphere: {
        enabled: true,
        pressure_hpa: Number(options.pressureHpa),
        temperature_k: Number(options.temperatureK),
        water_vapour_density_g_m3: Number(options.waterVapourDensityGm3),
      },
      rain: {
        enabled: false,
        rain_rate_mm_h: 0,
        polarization: "circular",
        polarization_tilt_deg: 45,
      },
      local_fog: {
        enabled: false,
        liquid_water_density_g_m3: 0,
        temperature_k: Number(options.temperatureK),
      },
    };
  }
  if (options.includeResearchComparison) {
    payload.research_wall_event_count = Number(options.researchWallEventCount ?? 0);
  }
  return payload;
}

export function buildSpecularReflectionReferencePayload(options = {}) {
  const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const tx = options.tx ?? {};
  const rx = options.rx ?? {};
  const facade = options.facade ?? {};
  const material = options.material ?? {};
  const linkBudget = options.linkBudget ?? {};
  const materialSource = material.materialSource ?? "user_defined";
  const incidentMedium = material.incidentMedium ?? { name: "air", relativePermittivity: 1, conductivitySPerM: 0, propertySource: "user_declared" };
  const exitMedium = material.exitMedium ?? { name: "air", relativePermittivity: 1, conductivitySPerM: 0, propertySource: "user_declared" };
  const payload = {
    schema_version: 1,
    frequency_ghz: numberOr(options.frequencyGHz, 140),
    coordinate_frame: { mode: options.coordinateFrameMode ?? "local_enu" },
    tx: {
      position: { x: numberOr(tx.x), y: numberOr(tx.y), z: numberOr(tx.z) },
      antenna: {
        mode: tx.antennaMode ?? "isotropic",
        absolute_gain_dbi: numberOr(tx.gainDBi),
        ...(tx.patternID ? { pattern_id: tx.patternID } : {}),
        ...(tx.boresightAzimuthDeg !== undefined ? { boresight_azimuth_deg: numberOr(tx.boresightAzimuthDeg) } : {}),
        ...(tx.boresightElevationDeg !== undefined ? { boresight_elevation_deg: numberOr(tx.boresightElevationDeg) } : {}),
        ...(tx.beamWidthDeg !== undefined ? { beam_width_deg: numberOr(tx.beamWidthDeg) } : {}),
        ...(tx.apertureM !== undefined && tx.apertureM !== "" ? { aperture_m: numberOr(tx.apertureM) } : {}),
      },
    },
    rx: {
      position: { x: numberOr(rx.x), y: numberOr(rx.y), z: numberOr(rx.z) },
      antenna: {
        mode: rx.antennaMode ?? "isotropic",
        absolute_gain_dbi: numberOr(rx.gainDBi),
        ...(rx.patternID ? { pattern_id: rx.patternID } : {}),
        ...(rx.boresightAzimuthDeg !== undefined ? { boresight_azimuth_deg: numberOr(rx.boresightAzimuthDeg) } : {}),
        ...(rx.boresightElevationDeg !== undefined ? { boresight_elevation_deg: numberOr(rx.boresightElevationDeg) } : {}),
        ...(rx.beamWidthDeg !== undefined ? { beam_width_deg: numberOr(rx.beamWidthDeg) } : {}),
        ...(rx.apertureM !== undefined && rx.apertureM !== "" ? { aperture_m: numberOr(rx.apertureM) } : {}),
      },
    },
    facade: {
      start: { x: numberOr(facade.startX), y: numberOr(facade.startY), z: 0 },
      end: { x: numberOr(facade.endX), y: numberOr(facade.endY), z: 0 },
      plane_point: { x: numberOr(facade.planeX), y: numberOr(facade.planeY), z: 0 },
      outward_normal: { x: numberOr(facade.normalX, 1), y: numberOr(facade.normalY), z: numberOr(facade.normalZ) },
      geometry_provenance: facade.geometryProvenance ?? "user_declared",
      normal_provenance: facade.normalProvenance ?? "user_declared",
      height_provenance: facade.heightProvenance ?? "user_declared",
      ...(facade.baseZ !== "" && facade.baseZ !== undefined ? { base_z: numberOr(facade.baseZ) } : {}),
      ...(facade.topZ !== "" && facade.topZ !== undefined ? { top_z: numberOr(facade.topZ) } : {}),
      ...(facade.reflectingObjectID ? { reflecting_object_id: facade.reflectingObjectID } : {}),
    },
    material: {
      mode: material.mode ?? "interface",
      material_source: materialSource,
      ...(materialSource === "p2040_reference" ? { material_id: material.materialID ?? "concrete_110_330" } : {
        user_material: {
          name: material.name ?? "user-declared facade material",
          property_source: material.propertySource ?? "user_declared",
          relative_permittivity: numberOr(material.relativePermittivity, 4),
          conductivity_s_per_m: numberOr(material.conductivitySPerM),
          ...(material.provenanceNote ? { provenance_note: material.provenanceNote } : {}),
        },
      }),
      incident_medium: {
        name: incidentMedium.name,
        relative_permittivity: numberOr(incidentMedium.relativePermittivity, 1),
        conductivity_s_per_m: numberOr(incidentMedium.conductivitySPerM),
        property_source: incidentMedium.propertySource ?? "user_declared",
      },
      exit_medium: {
        name: exitMedium.name,
        relative_permittivity: numberOr(exitMedium.relativePermittivity, 1),
        conductivity_s_per_m: numberOr(exitMedium.conductivitySPerM),
        property_source: exitMedium.propertySource ?? "user_declared",
      },
      ...(material.mode === "finite_slab" ? {
        thickness_m: numberOr(material.thicknessM),
        thickness_provenance: material.thicknessProvenance ?? "user_declared",
        phase_coherence: material.phaseCoherence ?? "coherent_total_slab",
      } : {}),
      ...(material.provenance ? { provenance: material.provenance } : {}),
    },
    polarization: options.polarization ?? "TE",
    terrain: { mode: options.terrainMode ?? "flat_ground_relative_datum", provenance: options.terrainProvenance ?? "user_declared" },
    link_budget: {
      pt_conducted_dbm: numberOr(linkBudget.ptConductedDBm, 30),
      ...(linkBudget.txGainDBi !== undefined ? { tx_gain_dbi: numberOr(linkBudget.txGainDBi) } : {}),
      ...(linkBudget.rxGainDBi !== undefined ? { rx_gain_dbi: numberOr(linkBudget.rxGainDBi) } : {}),
      tx_pattern_attenuation_db: numberOr(linkBudget.txPatternAttenuationDB),
      rx_pattern_attenuation_db: numberOr(linkBudget.rxPatternAttenuationDB),
      system_loss_db: numberOr(linkBudget.systemLossDB),
      polarization_loss_db: numberOr(linkBudget.polarizationLossDB),
      calibration_db: numberOr(linkBudget.calibrationDB),
    },
  };
  if (options.rmsRoughnessM !== undefined && options.rmsRoughnessM !== "") {
    payload.rms_roughness_m = numberOr(options.rmsRoughnessM);
  }
  return payload;
}

export function buildCoverageSurfacePayload(selectedTower, settings, options = {}, profileIndex = 0) {
  return {
    ...buildSimulationPayload(selectedTower, settings, profileIndex),
    cell_size_m: Number(options.cellSizeMeters ?? 25),
    thresholds_dbm: [...(options.thresholdsDBm ?? [-110, -100, -90, -80])].map(Number),
  };
}

export function buildCoverageSurfaceSourceKey(payload, cellID) {
  if (!payload) return null;
  const rfPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "cell_size_m" && key !== "thresholds_dbm"),
  );
  return JSON.stringify({
    cell_id: cellID === null || cellID === undefined ? null : String(cellID),
    ...rfPayload,
  });
}

export function defaultPathModelProfile(frequencyGHz) {
  const frequency = Number(frequencyGHz);
  if (frequency <= 6) return "terrain-profile";
  if (frequency <= 100) return "urban-short-range";
  return "research-sub-thz";
}

export function buildNetworkOptimizationPayload(selectedNetworkTowers, settings, networkAzimuths = {}, optimizationConfig) {
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
    ...(optimizationConfig ? { optimization: optimizationConfigToPayload(optimizationConfig) } : {}),
  };
}

export function buildBuildingEntryAnalysisPayload(selectedNetworkTowers, selectedTower, settings, networkAzimuths = {}) {
  const towers = selectedNetworkTowers.length > 0
    ? selectedNetworkTowers
    : [selectedTower].filter(Boolean);
  return {
    towers: towers.map((tower, index) => ({
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

export function buildBuildingEntryAnalysisSourceKey(payload, datasetRevision = 0) {
  if (!payload) return null;
  return JSON.stringify({ dataset_revision: datasetRevision, payload });
}

export function buildNetworkCellExplanationPayload({
  baseline,
  cellID,
  optimization,
  optimizationDomain,
  runID,
  solution,
  solutionID,
}) {
  return {
    run_id: runID ?? "",
    solution_id: String(solutionID ?? solution?.id ?? ""),
    cell_id: String(cellID ?? ""),
    baseline,
    solution,
    optimization: optimizationConfigToPayload(optimization),
    ...(optimizationDomain ? { optimization_domain: optimizationDomain } : {}),
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

export function buildMeasurementPayload(towers, settings, samples, networkOptimization, networkAzimuths = {}, provenance) {
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
    ...(provenance ? { calibration_provenance: provenance } : {}),
    samples,
  };
}

export function azimuthForTower(tower, settings, networkAzimuths = {}) {
  const explicit = networkAzimuths[tower.id] ?? networkAzimuths[String(tower.id)]
    ?? networkAzimuths[String(tower.cellId ?? "")];
  return Number.isFinite(Number(explicit)) ? Number(explicit) : settings.azimuthDeg;
}
