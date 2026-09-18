package raytracer

import (
	"fmt"
	"strings"
	"time"
)

const (
	MeasurementValidationSchemaVersion = 1
	MeasurementValidationModelFamily   = "measurement_evidence_validation_v1"
	MaxValidationCampaigns             = 8
	MaxValidationMeasurements          = 5000
	MaxValidationModels                = 8
	DefaultSpatialCellSizeM            = 100.0
	DefaultSpatialSeparationM          = 100.0
	MinimumValidationSamples           = 3
)

const (
	ValidationOperationValidateCampaign = "validate_campaign"
	ValidationOperationCompareModels    = "compare_models"
	ValidationOperationCalibrateBias    = "calibrate_bias"
	ValidationOperationSpatialHoldout   = "spatial_holdout"
)

const (
	ValidationStatusApplicable   = "applicable"
	ValidationStatusInapplicable = "inapplicable"
	ValidationStatusAmbiguous    = "ambiguous"
	ValidationStatusUnsupported  = "unsupported"
	ValidationStatusCensored     = "censored"
)

const (
	ValidationObservationObserved           = "observed"
	ValidationObservationBelowDetection     = "below_detection_limit"
	ValidationObservationNotDetected        = "not_detected"
	ValidationDirectionBestDirectional      = "best_directional"
	ValidationDirectionArbitraryDirectional = "arbitrary_directional"
	ValidationDirectionSynthesizedOmni      = "synthesized_omnidirectional"
	ValidationDirectionUnknown              = "unknown"
	ValidationBasisIsotropicEquivalent      = "isotropic_equivalent_path_loss"
	ValidationBasisDirectionalPathLoss      = "directional_path_loss"
	ValidationBasisSynthesizedOmni          = "synthesized_omnidirectional_path_loss"
	ValidationBasisUnknown                  = "unknown"
)

var validationModelIDs = []string{
	"p525_fspl",
	SubTHZAtmosphericReferenceModelID,
	"p1411_below_rooftop_los_v1",
	"p1411_urban_highrise_nlos_v1",
	"p1411_urban_lowrise_nlos_v1",
	P1411ResearchComparisonModelID,
	DiffractionDiagnosticID,
}

type MeasurementCampaign struct {
	SchemaVersion   int                           `json:"schema_version"`
	CampaignID      string                        `json:"campaign_id"`
	CampaignVersion string                        `json:"campaign_version,omitempty"`
	Title           string                        `json:"title"`
	Source          MeasurementCampaignSource     `json:"source"`
	Provenance      MeasurementCampaignProvenance `json:"provenance"`
	FrequencyRange  MeasurementFrequencyRange     `json:"frequency_range_ghz"`
	Environment     MeasurementEnvironment        `json:"environment"`
	Equipment       MeasurementEquipment          `json:"equipment"`
	AntennaSetup    MeasurementAntennaSetup       `json:"antenna_setup"`
	Calibration     MeasurementCalibration        `json:"calibration"`
	Weather         MeasurementWeather            `json:"weather"`
	Sites           []MeasurementSite             `json:"sites,omitempty"`
	Measurements    []MeasurementRecord           `json:"measurements,omitempty"`
	Limitations     []string                      `json:"limitations,omitempty"`
}

type MeasurementCampaignSource struct {
	Citation         string `json:"citation"`
	DOI              string `json:"doi,omitempty"`
	URL              string `json:"url,omitempty"`
	License          string `json:"license,omitempty"`
	DataAvailability string `json:"data_availability,omitempty"`
	DatasetVersion   string `json:"dataset_version,omitempty"`
}

type MeasurementCampaignProvenance struct {
	SourceType  string   `json:"source_type"`
	CollectedBy string   `json:"collected_by,omitempty"`
	ImportedBy  string   `json:"imported_by,omitempty"`
	MetadataURL string   `json:"metadata_url,omitempty"`
	ImportedAt  string   `json:"imported_at,omitempty"`
	Notes       []string `json:"notes,omitempty"`
}

type MeasurementFrequencyRange struct {
	MinGHz float64 `json:"min_ghz"`
	MaxGHz float64 `json:"max_ghz"`
}

type MeasurementEnvironment struct {
	EnvironmentType  string `json:"environment_type,omitempty"`
	Morphology       string `json:"morphology,omitempty"`
	MorphologySource string `json:"morphology_source,omitempty"`
	RooftopRelation  string `json:"rooftop_relation,omitempty"`
	RooftopSource    string `json:"rooftop_source,omitempty"`
	LOSState         string `json:"los_state,omitempty"`
	LOSSource        string `json:"los_source,omitempty"`
	Description      string `json:"description,omitempty"`
}

type MeasurementEquipment struct {
	Transmitter    string   `json:"transmitter,omitempty"`
	Receiver       string   `json:"receiver,omitempty"`
	ChannelSounder string   `json:"channel_sounder,omitempty"`
	ReceiverModel  string   `json:"receiver_model,omitempty"`
	Notes          []string `json:"notes,omitempty"`
}

type MeasurementAntennaSetup struct {
	TxGainDBi             *float64 `json:"tx_gain_dbi,omitempty"`
	RxGainDBi             *float64 `json:"rx_gain_dbi,omitempty"`
	BeamwidthDeg          *float64 `json:"beamwidth_deg,omitempty"`
	Polarization          string   `json:"polarization,omitempty"`
	Directionality        string   `json:"directionality,omitempty"`
	ComparisonBasis       string   `json:"comparison_basis,omitempty"`
	PatternMetadata       string   `json:"pattern_metadata,omitempty"`
	StrongestBeamSelected *bool    `json:"strongest_beam_selected,omitempty"`
	BeamAverageMethod     string   `json:"beam_average_method,omitempty"`
	Notes                 []string `json:"notes,omitempty"`
}

type MeasurementCalibration struct {
	ConductedTxPowerDBm        *float64 `json:"conducted_tx_power_dbm,omitempty"`
	TxCableLossDB              *float64 `json:"tx_cable_loss_db,omitempty"`
	RxCableLossDB              *float64 `json:"rx_cable_loss_db,omitempty"`
	ReceiverCalibrationApplied *bool    `json:"receiver_calibration_applied,omitempty"`
	DynamicRangeDB             *float64 `json:"dynamic_range_db,omitempty"`
	NoiseFloorDBm              *float64 `json:"noise_floor_dbm,omitempty"`
	DetectablePowerFloorDBm    *float64 `json:"detectable_power_floor_dbm,omitempty"`
	Reference                  string   `json:"reference,omitempty"`
	Notes                      []string `json:"notes,omitempty"`
}

type MeasurementWeather struct {
	TemperatureK             *float64 `json:"temperature_k,omitempty"`
	PressureHPA              *float64 `json:"pressure_hpa,omitempty"`
	RelativeHumidityPct      *float64 `json:"relative_humidity_pct,omitempty"`
	WaterVapourDensityGM3    *float64 `json:"water_vapour_density_g_m3,omitempty"`
	RainRateMMH              *float64 `json:"rain_rate_mm_h,omitempty"`
	RainKnown                *bool    `json:"rain_known,omitempty"`
	FogLiquidWaterDensityGM3 *float64 `json:"fog_liquid_water_density_g_m3,omitempty"`
	FogKnown                 *bool    `json:"fog_known,omitempty"`
	Description              string   `json:"description,omitempty"`
	Source                   string   `json:"source,omitempty"`
}

type MeasurementSite struct {
	SiteID           string   `json:"site_id"`
	Name             string   `json:"name,omitempty"`
	Lon              *float64 `json:"lon,omitempty"`
	Lat              *float64 `json:"lat,omitempty"`
	Morphology       string   `json:"morphology,omitempty"`
	MorphologySource string   `json:"morphology_source,omitempty"`
	RooftopRelation  string   `json:"rooftop_relation,omitempty"`
	RooftopSource    string   `json:"rooftop_source,omitempty"`
	Description      string   `json:"description,omitempty"`
}

type MeasurementEndpoint struct {
	Lat               *float64 `json:"lat,omitempty"`
	Lon               *float64 `json:"lon,omitempty"`
	HeightM           *float64 `json:"height_m,omitempty"`
	ConductedPowerDBm *float64 `json:"conducted_power_dbm,omitempty"`
}

type MeasurementLabels struct {
	LOSState         string `json:"los_nlos,omitempty"`
	LOSSource        string `json:"los_nlos_source,omitempty"`
	Morphology       string `json:"morphology,omitempty"`
	MorphologySource string `json:"morphology_source,omitempty"`
	RooftopRelation  string `json:"rooftop_relation,omitempty"`
	RooftopSource    string `json:"rooftop_relation_source,omitempty"`
}

type MeasurementGeometry struct {
	Direct3DDistanceM     *float64  `json:"direct_3d_distance_m,omitempty"`
	StreetWidthM          *float64  `json:"street_width_m,omitempty"`
	CornerGeometry        string    `json:"corner_geometry,omitempty"`
	BuildingIntersections []string  `json:"building_intersections,omitempty"`
	RoofHeightsM          []float64 `json:"roof_heights_m,omitempty"`
	VegetationPresent     *bool     `json:"vegetation_present,omitempty"`
	TerrainAvailable      *bool     `json:"terrain_available,omitempty"`
	WallEventCount        *int      `json:"wall_event_count,omitempty"`
	DiffractionLossDB     *float64  `json:"diffraction_loss_db,omitempty"`
	Source                string    `json:"source,omitempty"`
	Notes                 []string  `json:"notes,omitempty"`
}

type MeasurementDetection struct {
	Status            string   `json:"status,omitempty"`
	DetectionLimitDBm *float64 `json:"detection_limit_dbm,omitempty"`
	Notes             []string `json:"notes,omitempty"`
}

type MeasurementRecord struct {
	MeasurementID            string               `json:"measurement_id"`
	LocationPairID           string               `json:"location_pair_id,omitempty"`
	BeamID                   string               `json:"beam_id,omitempty"`
	SiteID                   string               `json:"site_id,omitempty"`
	Tx                       MeasurementEndpoint  `json:"tx"`
	Rx                       MeasurementEndpoint  `json:"rx"`
	FrequencyGHz             *float64             `json:"frequency_ghz,omitempty"`
	BandwidthHz              *float64             `json:"bandwidth_hz,omitempty"`
	MeasuredReceivedPowerDBm *float64             `json:"measured_received_power_dbm,omitempty"`
	MeasuredPathLossDB       *float64             `json:"measured_path_loss_db,omitempty"`
	MeasuredPathGainDB       *float64             `json:"measured_path_gain_db,omitempty"`
	ValueDB                  *float64             `json:"value_db,omitempty"`
	MeasurementQuantity      string               `json:"measurement_quantity,omitempty"`
	QuantityDefinition       string               `json:"quantity_definition,omitempty"`
	AntennaGainEmbedded      *bool                `json:"antenna_gain_embedded,omitempty"`
	CableLossEmbedded        *bool                `json:"cable_loss_embedded,omitempty"`
	CalibrationApplied       *bool                `json:"calibration_applied,omitempty"`
	TxConductedPowerDBm      *float64             `json:"tx_conducted_power_dbm,omitempty"`
	TxGainDBi                *float64             `json:"tx_gain_dbi,omitempty"`
	RxGainDBi                *float64             `json:"rx_gain_dbi,omitempty"`
	TxCableLossDB            *float64             `json:"tx_cable_loss_db,omitempty"`
	RxCableLossDB            *float64             `json:"rx_cable_loss_db,omitempty"`
	TxAzimuthDeg             *float64             `json:"tx_azimuth_deg,omitempty"`
	TxElevationDeg           *float64             `json:"tx_elevation_deg,omitempty"`
	RxOrientation            string               `json:"rx_orientation,omitempty"`
	BeamwidthDeg             *float64             `json:"beamwidth_deg,omitempty"`
	PatternMetadata          string               `json:"pattern_metadata,omitempty"`
	Polarization             string               `json:"polarization,omitempty"`
	Directionality           string               `json:"directionality,omitempty"`
	AntennaComparisonBasis   string               `json:"antenna_comparison_basis,omitempty"`
	Labels                   MeasurementLabels    `json:"labels"`
	Weather                  *MeasurementWeather  `json:"weather,omitempty"`
	Timestamp                string               `json:"timestamp,omitempty"`
	QualityFlags             []string             `json:"quality_flags,omitempty"`
	Detection                MeasurementDetection `json:"detection,omitempty"`
	Geometry                 MeasurementGeometry  `json:"geometry,omitempty"`
	Notes                    []string             `json:"notes,omitempty"`
}

type ValidationStrategy struct {
	Method              string   `json:"method,omitempty"`
	GroupBy             string   `json:"group_by,omitempty"`
	CalibrationGroupIDs []string `json:"calibration_group_ids,omitempty"`
	ValidationGroupIDs  []string `json:"validation_group_ids,omitempty"`
	SpatialCellSizeM    float64  `json:"spatial_cell_size_m,omitempty"`
	MinimumSeparationM  float64  `json:"minimum_separation_m,omitempty"`
}

type SubTHZValidationRequest struct {
	SchemaVersion      int                   `json:"schema_version"`
	Operation          string                `json:"operation"`
	Campaigns          []MeasurementCampaign `json:"campaigns"`
	ModelIDs           []string              `json:"model_ids,omitempty"`
	Strategy           ValidationStrategy    `json:"strategy,omitempty"`
	IncludePredictions bool                  `json:"include_predictions,omitempty"`
}

func defaultValidationModelIDs() []string {
	return append([]string(nil), validationModelIDs...)
}

func ValidateSubTHZValidationRequest(request SubTHZValidationRequest) string {
	if request.SchemaVersion != 0 && request.SchemaVersion != MeasurementValidationSchemaVersion {
		return fmt.Sprintf("schema_version must be %d", MeasurementValidationSchemaVersion)
	}
	if request.Operation == "" {
		request.Operation = ValidationOperationCompareModels
	}
	if !oneOf(request.Operation, ValidationOperationValidateCampaign, ValidationOperationCompareModels, ValidationOperationCalibrateBias, ValidationOperationSpatialHoldout) {
		return "operation must be validate_campaign, compare_models, calibrate_bias, or spatial_holdout"
	}
	if len(request.Campaigns) == 0 || len(request.Campaigns) > MaxValidationCampaigns {
		return fmt.Sprintf("campaigns must contain between 1 and %d campaigns", MaxValidationCampaigns)
	}
	modelIDs := request.ModelIDs
	if len(modelIDs) == 0 {
		modelIDs = defaultValidationModelIDs()
	}
	if len(modelIDs) > MaxValidationModels {
		return fmt.Sprintf("model_ids must contain at most %d models", MaxValidationModels)
	}
	seenModels := map[string]struct{}{}
	for _, modelID := range modelIDs {
		modelID = strings.TrimSpace(modelID)
		if !validationModelKnown(modelID) {
			return fmt.Sprintf("model_id %q is unsupported", modelID)
		}
		if _, exists := seenModels[modelID]; exists {
			return "model_ids must be unique"
		}
		seenModels[modelID] = struct{}{}
	}
	totalMeasurements := 0
	seenCampaigns := map[string]struct{}{}
	for _, campaign := range request.Campaigns {
		if validationError := ValidateMeasurementCampaign(campaign); validationError != "" {
			return validationError
		}
		if _, exists := seenCampaigns[campaign.CampaignID]; exists {
			return "campaign_id values must be unique"
		}
		seenCampaigns[campaign.CampaignID] = struct{}{}
		totalMeasurements += len(campaign.Measurements)
	}
	if totalMeasurements > MaxValidationMeasurements {
		return fmt.Sprintf("campaign measurements must contain at most %d records in total", MaxValidationMeasurements)
	}
	if request.Operation != ValidationOperationValidateCampaign && totalMeasurements == 0 {
		return "the selected validation operation requires at least one measurement"
	}
	if validationError := validateValidationStrategy(request.Operation, request.Strategy); validationError != "" {
		return validationError
	}
	return ""
}

func ValidateMeasurementCampaign(campaign MeasurementCampaign) string {
	if campaign.SchemaVersion != MeasurementValidationSchemaVersion {
		return fmt.Sprintf("campaign %q schema_version must be %d", campaign.CampaignID, MeasurementValidationSchemaVersion)
	}
	if !validValidationIdentifier(campaign.CampaignID) {
		return "campaign_id must be a non-empty identifier of at most 128 safe characters"
	}
	if len([]byte(campaign.Title)) > 512 || len([]byte(campaign.CampaignVersion)) > 128 {
		return fmt.Sprintf("campaign %q title/version is too long", campaign.CampaignID)
	}
	if !finiteInRange(campaign.FrequencyRange.MinGHz, 0.01, 1000) || !finiteInRange(campaign.FrequencyRange.MaxGHz, 0.01, 1000) || campaign.FrequencyRange.MinGHz > campaign.FrequencyRange.MaxGHz {
		return fmt.Sprintf("campaign %q frequency_range_ghz is invalid", campaign.CampaignID)
	}
	if campaign.Provenance.SourceType != "" && !oneOf(campaign.Provenance.SourceType, "external_publication", "local_field", "synthetic_controlled", "vendor", "unknown") {
		return fmt.Sprintf("campaign %q provenance.source_type is unsupported", campaign.CampaignID)
	}
	if campaign.Provenance.ImportedAt != "" {
		if _, err := time.Parse(time.RFC3339, campaign.Provenance.ImportedAt); err != nil {
			return fmt.Sprintf("campaign %q provenance.imported_at must use RFC3339", campaign.CampaignID)
		}
	}
	if validationError := validateMeasurementWeather(campaign.Weather, "campaign.weather"); validationError != "" {
		return fmt.Sprintf("campaign %q: %s", campaign.CampaignID, validationError)
	}
	if validationError := validateMeasurementAntennaSetup(campaign.AntennaSetup, "campaign.antenna_setup"); validationError != "" {
		return fmt.Sprintf("campaign %q: %s", campaign.CampaignID, validationError)
	}
	if validationError := validateMeasurementCalibration(campaign.Calibration, "campaign.calibration"); validationError != "" {
		return fmt.Sprintf("campaign %q: %s", campaign.CampaignID, validationError)
	}
	if validationError := validateLabelSet(MeasurementLabels{
		LOSState: campaign.Environment.LOSState, LOSSource: campaign.Environment.LOSSource,
		Morphology: campaign.Environment.Morphology, MorphologySource: campaign.Environment.MorphologySource,
		RooftopRelation: campaign.Environment.RooftopRelation, RooftopSource: campaign.Environment.RooftopSource,
	}); validationError != "" {
		return fmt.Sprintf("campaign %q environment: %s", campaign.CampaignID, validationError)
	}
	seenSites := map[string]struct{}{}
	for _, site := range campaign.Sites {
		if !validValidationIdentifier(site.SiteID) {
			return fmt.Sprintf("campaign %q contains an invalid site_id", campaign.CampaignID)
		}
		if _, exists := seenSites[site.SiteID]; exists {
			return fmt.Sprintf("campaign %q site_id values must be unique", campaign.CampaignID)
		}
		seenSites[site.SiteID] = struct{}{}
		if validationError := validateOptionalCoordinate(site.Lon, site.Lat, "site coordinates"); validationError != "" {
			return fmt.Sprintf("campaign %q site %q: %s", campaign.CampaignID, site.SiteID, validationError)
		}
		if validationError := validateLabel(site.Morphology, site.MorphologySource, "morphology"); validationError != "" {
			return fmt.Sprintf("campaign %q site %q: %s", campaign.CampaignID, site.SiteID, validationError)
		}
		if validationError := validateLabel(site.RooftopRelation, site.RooftopSource, "rooftop_relation"); validationError != "" {
			return fmt.Sprintf("campaign %q site %q: %s", campaign.CampaignID, site.SiteID, validationError)
		}
	}
	seenMeasurements := map[string]struct{}{}
	for _, measurement := range campaign.Measurements {
		if !validValidationIdentifier(measurement.MeasurementID) {
			return fmt.Sprintf("campaign %q contains an invalid measurement_id", campaign.CampaignID)
		}
		if _, exists := seenMeasurements[measurement.MeasurementID]; exists {
			return fmt.Sprintf("campaign %q measurement_id values must be unique", campaign.CampaignID)
		}
		seenMeasurements[measurement.MeasurementID] = struct{}{}
		if measurement.LocationPairID != "" && !validValidationIdentifier(measurement.LocationPairID) {
			return fmt.Sprintf("campaign %q measurement %q has an invalid location_pair_id", campaign.CampaignID, measurement.MeasurementID)
		}
		if measurement.BeamID != "" && !validValidationIdentifier(measurement.BeamID) {
			return fmt.Sprintf("campaign %q measurement %q has an invalid beam_id", campaign.CampaignID, measurement.MeasurementID)
		}
		if measurement.SiteID != "" && !validValidationIdentifier(measurement.SiteID) {
			return fmt.Sprintf("campaign %q measurement %q has an invalid site_id", campaign.CampaignID, measurement.MeasurementID)
		}
		if validationError := validateMeasurementEndpoint(measurement.Tx, "tx"); validationError != "" {
			return fmt.Sprintf("campaign %q measurement %q: %s", campaign.CampaignID, measurement.MeasurementID, validationError)
		}
		if validationError := validateMeasurementEndpoint(measurement.Rx, "rx"); validationError != "" {
			return fmt.Sprintf("campaign %q measurement %q: %s", campaign.CampaignID, measurement.MeasurementID, validationError)
		}
		if validationError := validateMeasurementRecord(campaign, measurement); validationError != "" {
			return fmt.Sprintf("campaign %q measurement %q: %s", campaign.CampaignID, measurement.MeasurementID, validationError)
		}
	}
	return ""
}

func validateValidationStrategy(operation string, strategy ValidationStrategy) string {
	method := strategy.Method
	if method == "" {
		if operation == ValidationOperationCalibrateBias || operation == ValidationOperationSpatialHoldout {
			method = "spatial_grid"
		} else {
			method = "all_samples"
		}
	}
	if !oneOf(method, "all_samples", "explicit_groups", "spatial_grid", "leave_one_site_out", "leave_one_campaign_out") {
		return "strategy.method is unsupported"
	}
	if strategy.GroupBy != "" && !oneOf(strategy.GroupBy, "site_id", "location_pair_id", "campaign_id") {
		return "strategy.group_by must be site_id, location_pair_id, or campaign_id"
	}
	if strategy.SpatialCellSizeM != 0 && !finiteInRange(strategy.SpatialCellSizeM, 1, 10000) {
		return "strategy.spatial_cell_size_m must be between 1 and 10000"
	}
	if strategy.MinimumSeparationM != 0 && !finiteInRange(strategy.MinimumSeparationM, 1, 10000) {
		return "strategy.minimum_separation_m must be between 1 and 10000"
	}
	if method == "explicit_groups" && len(strategy.CalibrationGroupIDs) == 0 && len(strategy.ValidationGroupIDs) == 0 {
		return "explicit_groups requires calibration_group_ids or validation_group_ids"
	}
	return ""
}

func validateMeasurementRecord(campaign MeasurementCampaign, measurement MeasurementRecord) string {
	if measurement.FrequencyGHz != nil && !finiteInRange(*measurement.FrequencyGHz, 0.01, 1000) {
		return "frequency_ghz must be between 0.01 and 1000 when supplied"
	}
	if measurement.BandwidthHz != nil && !finiteInRange(*measurement.BandwidthHz, 1, 1e12) {
		return "bandwidth_hz must be positive and finite when supplied"
	}
	for label, value := range map[string]*float64{
		"measured_received_power_dbm": measurement.MeasuredReceivedPowerDBm,
		"measured_path_loss_db":       measurement.MeasuredPathLossDB,
		"measured_path_gain_db":       measurement.MeasuredPathGainDB,
		"value_db":                    measurement.ValueDB,
		"tx_conducted_power_dbm":      measurement.TxConductedPowerDBm,
		"tx_gain_dbi":                 measurement.TxGainDBi,
		"rx_gain_dbi":                 measurement.RxGainDBi,
		"tx_cable_loss_db":            measurement.TxCableLossDB,
		"rx_cable_loss_db":            measurement.RxCableLossDB,
	} {
		if value != nil && !finiteNumber(*value) {
			return label + " must be finite"
		}
	}
	if measurement.Timestamp != "" {
		if _, err := time.Parse(time.RFC3339, measurement.Timestamp); err != nil {
			return "timestamp must use RFC3339"
		}
	}
	if validationError := validateLabelSet(measurement.Labels); validationError != "" {
		return validationError
	}
	if measurement.Detection.Status != "" && !oneOf(measurement.Detection.Status, ValidationObservationObserved, ValidationObservationBelowDetection, ValidationObservationNotDetected) {
		return "detection.status is unsupported"
	}
	if measurement.Detection.DetectionLimitDBm != nil && !finiteInRange(*measurement.Detection.DetectionLimitDBm, -220, 20) {
		return "detection.detection_limit_dbm is invalid"
	}
	if measurement.Geometry.Direct3DDistanceM != nil && !finiteInRange(*measurement.Geometry.Direct3DDistanceM, 0.01, MaxSubTHZReferenceDistanceM) {
		return "geometry.direct_3d_distance_m is invalid"
	}
	if measurement.Geometry.WallEventCount != nil && (*measurement.Geometry.WallEventCount < 0 || *measurement.Geometry.WallEventCount > 1000) {
		return "geometry.wall_event_count must be between 0 and 1000"
	}
	if measurement.Geometry.DiffractionLossDB != nil && !finiteInRange(*measurement.Geometry.DiffractionLossDB, 0, 1000) {
		return "geometry.diffraction_loss_db is invalid"
	}
	for index, roofHeight := range measurement.Geometry.RoofHeightsM {
		if !finiteInRange(roofHeight, 0, 10000) {
			return fmt.Sprintf("geometry.roof_heights_m[%d] is invalid", index)
		}
	}
	if measurement.AntennaComparisonBasis != "" && !oneOf(measurement.AntennaComparisonBasis, ValidationBasisIsotropicEquivalent, ValidationBasisDirectionalPathLoss, ValidationBasisSynthesizedOmni, ValidationBasisUnknown) {
		return "antenna_comparison_basis is unsupported"
	}
	if measurement.Directionality != "" && !oneOf(measurement.Directionality, ValidationDirectionBestDirectional, ValidationDirectionArbitraryDirectional, ValidationDirectionSynthesizedOmni, ValidationDirectionUnknown) {
		return "directionality is unsupported"
	}
	if measurement.MeasurementQuantity != "" && !oneOf(measurement.MeasurementQuantity, "received_power", "path_loss", "path_gain", "de_embedded_path_loss", "directional_path_loss", "omnidirectional_equivalent_path_loss", "another") {
		return "measurement_quantity is unsupported"
	}
	if measurement.MeasurementQuantity == "another" && strings.TrimSpace(measurement.QuantityDefinition) == "" {
		return "quantity_definition is required when measurement_quantity is another"
	}
	status := measurement.Detection.Status
	if status == "" {
		status = ValidationObservationObserved
	}
	if status == ValidationObservationObserved && measurement.MeasurementQuantity == "received_power" && measurement.MeasuredReceivedPowerDBm == nil {
		return "measured_received_power_dbm is required for received_power"
	}
	if status == ValidationObservationObserved {
		switch measurement.MeasurementQuantity {
		case "received_power":
			if measurement.MeasuredPathLossDB != nil || measurement.MeasuredPathGainDB != nil || measurement.ValueDB != nil {
				return "received_power records must not mix path-loss, path-gain, or generic values"
			}
		case "path_gain":
			if measurement.MeasuredReceivedPowerDBm != nil || measurement.MeasuredPathLossDB != nil || measurement.ValueDB != nil {
				return "path_gain records must not mix received-power, path-loss, or generic values"
			}
		case "path_loss", "de_embedded_path_loss", "directional_path_loss", "omnidirectional_equivalent_path_loss":
			if measurement.MeasuredReceivedPowerDBm != nil || measurement.MeasuredPathGainDB != nil || measurement.ValueDB != nil {
				return "path-loss records must not mix received-power, path-gain, or generic values"
			}
		case "another":
			if measurement.ValueDB == nil {
				return "value_db is required when measurement_quantity is another"
			}
		}
	}
	if status == ValidationObservationObserved && oneOf(measurement.MeasurementQuantity, "path_loss", "de_embedded_path_loss", "directional_path_loss", "omnidirectional_equivalent_path_loss") && measurement.MeasuredPathLossDB == nil {
		return "measured_path_loss_db is required for the selected path-loss quantity"
	}
	if status == ValidationObservationObserved && measurement.MeasurementQuantity == "path_gain" && measurement.MeasuredPathGainDB == nil {
		return "measured_path_gain_db is required for path_gain"
	}
	if status == ValidationObservationObserved && strings.TrimSpace(measurement.MeasurementQuantity) == "" {
		return "measurement_quantity is required for an observed measurement"
	}
	if status == ValidationObservationObserved && measurement.MeasurementQuantity != "another" && measurement.ValueDB != nil && measurement.MeasuredReceivedPowerDBm == nil && measurement.MeasuredPathLossDB == nil && measurement.MeasuredPathGainDB == nil {
		return "value_db requires an explicit supported measured quantity"
	}
	if status != ValidationObservationObserved && (measurement.MeasuredReceivedPowerDBm != nil || measurement.MeasuredPathLossDB != nil || measurement.MeasuredPathGainDB != nil || measurement.ValueDB != nil) {
		return "censored observations must not carry an ordinary measured value"
	}
	if validationError := validateMeasurementWeatherValue(measurement.Weather); validationError != "" {
		return validationError
	}
	return ""
}

func validateMeasurementEndpoint(endpoint MeasurementEndpoint, label string) string {
	if (endpoint.Lat == nil) != (endpoint.Lon == nil) {
		return label + " latitude and longitude must be supplied together"
	}
	if endpoint.Lat != nil && (!finiteNumber(*endpoint.Lat) || !finiteNumber(*endpoint.Lon) || *endpoint.Lat < -90 || *endpoint.Lat > 90 || *endpoint.Lon < -180 || *endpoint.Lon > 180) {
		return label + " coordinates are invalid"
	}
	if endpoint.HeightM != nil && !finiteInRange(*endpoint.HeightM, 0, 10000) {
		return label + ".height_m must be between 0 and 10000"
	}
	if endpoint.ConductedPowerDBm != nil && !finiteInRange(*endpoint.ConductedPowerDBm, -100, 100) {
		return label + ".conducted_power_dbm is invalid"
	}
	return ""
}

func validateMeasurementAntennaSetup(setup MeasurementAntennaSetup, label string) string {
	for name, value := range map[string]*float64{"tx_gain_dbi": setup.TxGainDBi, "rx_gain_dbi": setup.RxGainDBi, "beamwidth_deg": setup.BeamwidthDeg} {
		if value != nil && !finiteNumber(*value) {
			return label + "." + name + " must be finite"
		}
	}
	if setup.BeamwidthDeg != nil && (*setup.BeamwidthDeg <= 0 || *setup.BeamwidthDeg > 360) {
		return label + ".beamwidth_deg must be between 0 and 360"
	}
	if setup.Directionality != "" && !oneOf(setup.Directionality, ValidationDirectionBestDirectional, ValidationDirectionArbitraryDirectional, ValidationDirectionSynthesizedOmni, ValidationDirectionUnknown) {
		return label + ".directionality is unsupported"
	}
	if setup.ComparisonBasis != "" && !oneOf(setup.ComparisonBasis, ValidationBasisIsotropicEquivalent, ValidationBasisDirectionalPathLoss, ValidationBasisSynthesizedOmni, ValidationBasisUnknown) {
		return label + ".comparison_basis is unsupported"
	}
	return ""
}

func validateMeasurementCalibration(calibration MeasurementCalibration, label string) string {
	for name, value := range map[string]*float64{
		"conducted_tx_power_dbm":     calibration.ConductedTxPowerDBm,
		"tx_cable_loss_db":           calibration.TxCableLossDB,
		"rx_cable_loss_db":           calibration.RxCableLossDB,
		"dynamic_range_db":           calibration.DynamicRangeDB,
		"noise_floor_dbm":            calibration.NoiseFloorDBm,
		"detectable_power_floor_dbm": calibration.DetectablePowerFloorDBm,
	} {
		if value != nil && !finiteNumber(*value) {
			return label + "." + name + " must be finite"
		}
	}
	if calibration.DynamicRangeDB != nil && *calibration.DynamicRangeDB < 0 {
		return label + ".dynamic_range_db must be non-negative"
	}
	return ""
}

func validateMeasurementWeather(weather MeasurementWeather, label string) string {
	return validateMeasurementWeatherValue(&weather, label)
}

func validateMeasurementWeatherValue(weather *MeasurementWeather, labels ...string) string {
	if weather == nil {
		return ""
	}
	label := "weather"
	if len(labels) > 0 {
		label = labels[0]
	}
	for name, value := range map[string]*float64{
		"temperature_k":                 weather.TemperatureK,
		"pressure_hpa":                  weather.PressureHPA,
		"relative_humidity_pct":         weather.RelativeHumidityPct,
		"water_vapour_density_g_m3":     weather.WaterVapourDensityGM3,
		"rain_rate_mm_h":                weather.RainRateMMH,
		"fog_liquid_water_density_g_m3": weather.FogLiquidWaterDensityGM3,
	} {
		if value != nil && !finiteNumber(*value) {
			return label + "." + name + " must be finite"
		}
	}
	if weather.TemperatureK != nil && !finiteInRange(*weather.TemperatureK, 150, 400) {
		return label + ".temperature_k is outside the supported range"
	}
	if weather.PressureHPA != nil && !finiteInRange(*weather.PressureHPA, 100, 1200) {
		return label + ".pressure_hpa is outside the supported range"
	}
	if weather.RelativeHumidityPct != nil && !finiteInRange(*weather.RelativeHumidityPct, 0, 100) {
		return label + ".relative_humidity_pct must be between 0 and 100"
	}
	if weather.WaterVapourDensityGM3 != nil && !finiteInRange(*weather.WaterVapourDensityGM3, 0, 100) {
		return label + ".water_vapour_density_g_m3 must be between 0 and 100"
	}
	if weather.RainRateMMH != nil && !finiteInRange(*weather.RainRateMMH, 0, 500) {
		return label + ".rain_rate_mm_h must be between 0 and 500"
	}
	if weather.FogLiquidWaterDensityGM3 != nil && !finiteInRange(*weather.FogLiquidWaterDensityGM3, 0, 5) {
		return label + ".fog_liquid_water_density_g_m3 must be between 0 and 5"
	}
	return ""
}

func validateLabelSet(labels MeasurementLabels) string {
	for _, item := range []struct{ name, value, source string }{
		{"los_nlos", labels.LOSState, labels.LOSSource},
		{"morphology", labels.Morphology, labels.MorphologySource},
		{"rooftop_relation", labels.RooftopRelation, labels.RooftopSource},
	} {
		if validationError := validateLabel(item.value, item.source, item.name); validationError != "" {
			return validationError
		}
	}
	return ""
}

func validateLabel(value, source, label string) string {
	if value == "" {
		return ""
	}
	if source == "" || !oneOf(source, "campaign_author", "campaign_metadata", "manual_review", "dataset_geometry", "project_inference", "unknown") {
		return label + " requires a supported provenance source"
	}
	return ""
}

func validateOptionalCoordinate(lon, lat *float64, label string) string {
	if (lon == nil) != (lat == nil) {
		return label + " must include both lon and lat when either is known"
	}
	if lon != nil && (!finiteNumber(*lon) || !finiteNumber(*lat) || *lon < -180 || *lon > 180 || *lat < -90 || *lat > 90) {
		return label + " are invalid"
	}
	return ""
}

func validValidationIdentifier(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || len([]byte(value)) > 128 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || strings.ContainsRune("._:-", character) {
			continue
		}
		return false
	}
	return true
}

func validationModelKnown(modelID string) bool {
	for _, candidate := range validationModelIDs {
		if candidate == modelID {
			return true
		}
	}
	return false
}

func finitePointer(value *float64) bool {
	return value == nil || finiteNumber(*value)
}
