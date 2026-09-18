export const MAX_MEASUREMENT_VALIDATION_FILE_BYTES = 1024 * 1024;

export function parseMeasurementValidationJSON(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Validation file is not valid JSON");
  }
  const campaigns = Array.isArray(value) ? value : value?.campaigns;
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    throw new Error("Validation file must contain a non-empty campaigns array");
  }
  const seen = new Set();
  campaigns.forEach((campaign) => {
    if (!campaign || campaign.schema_version !== 1 || typeof campaign.campaign_id !== "string" || !campaign.campaign_id.trim()) {
      throw new Error("Every campaign needs schema_version 1 and a campaign_id");
    }
    if (seen.has(campaign.campaign_id)) throw new Error(`Duplicate campaign_id: ${campaign.campaign_id}`);
    seen.add(campaign.campaign_id);
    if (!campaign.frequency_range_ghz || !Array.isArray(campaign.measurements)) {
      throw new Error(`Campaign ${campaign.campaign_id} needs frequency_range_ghz and measurements`);
    }
  });
  return { schema_version: 1, campaigns };
}

export function syntheticP525Campaign() {
  const samples = [20, 40, 60].map((distance, index) => ({
    measurement_id: `synthetic-${distance}`,
    frequency_ghz: 140,
    measurement_quantity: "path_loss",
    measured_path_loss_db: [101.39094384872776, 107.41154376200738, 110.93336894312101][index],
    antenna_gain_embedded: true,
    cable_loss_embedded: true,
    calibration_applied: true,
    directionality: "synthesized_omnidirectional",
    antenna_comparison_basis: "synthesized_omnidirectional_path_loss",
    tx: { lon: 32.8541, lat: 39.9208, height_m: 10 },
    rx: { lon: 32.8541 + distance / 111320, lat: 39.9208, height_m: 2 },
    geometry: { direct_3d_distance_m: distance },
  }));
  return {
    schema_version: 1,
    campaign_id: "synthetic-p525-exact",
    campaign_version: "1",
    title: "Synthetic P.525 exact control",
    provenance: { source_type: "synthetic_controlled" },
    frequency_range_ghz: { min_ghz: 140, max_ghz: 140 },
    antenna_setup: { directionality: "synthesized_omnidirectional", comparison_basis: "synthesized_omnidirectional_path_loss" },
    measurements: samples,
  };
}
