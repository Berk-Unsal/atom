package raytracer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

// NormalizedMeasurement is the only quantity accepted by the validation
// model adapters. It is intentionally path-loss oriented: received power is
// converted only when its conducted-power, antenna, cable, and calibration
// terms are explicit and the antenna basis is compatible.
type NormalizedMeasurement struct {
	CampaignID         string
	MeasurementID      string
	CampaignVersion    string
	SiteID             string
	LocationPairID     string
	BeamID             string
	FrequencyGHz       float64
	DistanceM          float64
	MeasuredPathLossDB float64
	Quantity           string
	QuantityBasis      string
	Directionality     string
	LOSState           string
	LOSSource          string
	Morphology         string
	MorphologySource   string
	RooftopRelation    string
	RooftopSource      string
	Tx                 SubTHZReferencePoint
	Rx                 SubTHZReferencePoint
	Weather            *MeasurementWeather
	WallEventCount     *int
	Geometry           MeasurementGeometry
	Source             string
	CalibrationNote    string
}

type ValidationPrediction struct {
	ModelID             string   `json:"model_id"`
	ModelVersion        string   `json:"model_version"`
	Status              string   `json:"status"`
	Reason              string   `json:"reason,omitempty"`
	PredictedPathLossDB *float64 `json:"predicted_path_loss_db,omitempty"`
	SourceSigmaDB       *float64 `json:"source_sigma_db,omitempty"`
	Reference           string   `json:"reference,omitempty"`
	CalibrationEligible bool     `json:"calibration_eligible"`
}

// MeasurementValidationModelAdapter is deliberately small. Adapters must
// return a status before a prediction; callers never infer applicability from
// a numeric value or manufacture a fallback when a model is out of scope.
type MeasurementValidationModelAdapter interface {
	ID() string
	Predict(context.Context, NormalizedMeasurement) ValidationPrediction
}

type validationAdapter struct {
	id      string
	predict func(context.Context, NormalizedMeasurement) ValidationPrediction
}

func (adapter validationAdapter) ID() string { return adapter.id }
func (adapter validationAdapter) Predict(ctx context.Context, measurement NormalizedMeasurement) ValidationPrediction {
	return adapter.predict(ctx, measurement)
}

type validationObservation struct {
	Measurement       NormalizedMeasurement
	Status            string
	Reason            string
	SourceRecord      MeasurementRecord
	Campaign          MeasurementCampaign
	GroupKeys         map[string]string
	CoordinateKnown   bool
	CalibrationSource string
}

type ValidationMetric struct {
	Count        int     `json:"count"`
	MeanBiasDB   float64 `json:"mean_bias_db"`
	MedianBiasDB float64 `json:"median_bias_db"`
	MAEDB        float64 `json:"mae_db"`
	RMSEDB       float64 `json:"rmse_db"`
	StdDB        float64 `json:"std_db"`
	P10DB        float64 `json:"p10_db"`
	P90DB        float64 `json:"p90_db"`
}

type ValidationStratumMetric struct {
	Dimension string           `json:"dimension"`
	Value     string           `json:"value"`
	Metric    ValidationMetric `json:"metric"`
}

type ValidationDiagnostic struct {
	Dimension      string  `json:"dimension"`
	Count          int     `json:"count"`
	SlopeDBPerUnit float64 `json:"slope_db_per_unit"`
	Correlation    float64 `json:"correlation"`
	StrongTrend    bool    `json:"strong_trend"`
	Unit           string  `json:"unit"`
	Interpretation string  `json:"interpretation"`
}

type ValidationPredictionRecord struct {
	CampaignID          string   `json:"campaign_id"`
	MeasurementID       string   `json:"measurement_id"`
	SiteID              string   `json:"site_id,omitempty"`
	LocationPairID      string   `json:"location_pair_id,omitempty"`
	BeamID              string   `json:"beam_id,omitempty"`
	FrequencyGHz        float64  `json:"frequency_ghz"`
	DistanceM           float64  `json:"distance_m"`
	Status              string   `json:"status"`
	Reason              string   `json:"reason,omitempty"`
	ObservedPathLossDB  *float64 `json:"observed_path_loss_db,omitempty"`
	PredictedPathLossDB *float64 `json:"predicted_path_loss_db,omitempty"`
	ResidualDB          *float64 `json:"residual_db,omitempty"`
	LOSState            string   `json:"los_state,omitempty"`
	Morphology          string   `json:"morphology,omitempty"`
	QuantityBasis       string   `json:"quantity_basis,omitempty"`
	CalibrationSet      string   `json:"calibration_set,omitempty"`
}

type ValidationModelResult struct {
	ModelID               string                           `json:"model_id"`
	ModelVersion          string                           `json:"model_version"`
	Reference             string                           `json:"reference,omitempty"`
	StatusCounts          map[string]int                   `json:"status_counts"`
	Metric                ValidationMetric                 `json:"metric"`
	StratifiedMetrics     []ValidationStratumMetric        `json:"stratified_metrics,omitempty"`
	Diagnostics           []ValidationDiagnostic           `json:"diagnostics,omitempty"`
	Predictions           []ValidationPredictionRecord     `json:"predictions,omitempty"`
	P1411SigmaComparison  *ValidationSigmaComparison       `json:"p1411_sigma_comparison,omitempty"`
	AtmosphericComparison *ValidationAtmosphericComparison `json:"atmospheric_comparison,omitempty"`
	Calibration           *ValidationCalibrationResult     `json:"calibration,omitempty"`
}

type ValidationSigmaComparison struct {
	SourceSigmaDB         float64 `json:"source_sigma_db"`
	ObservedResidualStdDB float64 `json:"observed_residual_std_db"`
	ApplicableCount       int     `json:"applicable_count"`
	Interpretation        string  `json:"interpretation"`
}

type ValidationAtmosphericComparison struct {
	Status           string `json:"status"`
	ComparableCount  int    `json:"comparable_count"`
	UnavailableCount int    `json:"unavailable_count"`
	Reason           string `json:"reason,omitempty"`
}

type ValidationCampaignSummary struct {
	CampaignID       string `json:"campaign_id"`
	CampaignVersion  string `json:"campaign_version,omitempty"`
	SourceType       string `json:"source_type,omitempty"`
	MeasurementCount int    `json:"measurement_count"`
	ObservedCount    int    `json:"observed_count"`
	CensoredCount    int    `json:"censored_count"`
	MetadataOnly     bool   `json:"metadata_only"`
}

type ValidationCalibrationResult struct {
	ModelID           string           `json:"model_id"`
	Method            string           `json:"method"`
	FittedBiasDB      float64          `json:"fitted_bias_db"`
	CalibrationCount  int              `json:"calibration_count"`
	ValidationCount   int              `json:"validation_count"`
	PreCalibration    ValidationMetric `json:"pre_calibration"`
	PostCalibration   ValidationMetric `json:"post_calibration"`
	ValidationSource  string           `json:"validation_source"`
	Status            string           `json:"status"`
	Promoted          bool             `json:"promoted"`
	NotPromotedReason string           `json:"not_promoted_reason"`
}

type ValidationHoldoutFold struct {
	FoldID           string                      `json:"fold_id"`
	HeldOutGroups    []string                    `json:"held_out_groups"`
	CalibrationCount int                         `json:"calibration_count"`
	ValidationCount  int                         `json:"validation_count"`
	Metrics          map[string]ValidationMetric `json:"metrics"`
	NoLeakEvidence   string                      `json:"no_leak_evidence"`
}

type ValidationHoldoutSummary struct {
	Method             string                  `json:"method"`
	GroupBy            string                  `json:"group_by,omitempty"`
	SpatialCellSizeM   float64                 `json:"spatial_cell_size_m,omitempty"`
	MinimumSeparationM float64                 `json:"minimum_separation_m,omitempty"`
	Folds              []ValidationHoldoutFold `json:"folds"`
	NoLeakEvidence     string                  `json:"no_leak_evidence"`
}

type ValidationCommonSampleComparison struct {
	ModelA              string           `json:"model_a"`
	ModelB              string           `json:"model_b"`
	CommonSampleCount   int              `json:"common_sample_count"`
	ModelAMetric        ValidationMetric `json:"model_a_metric"`
	ModelBMetric        ValidationMetric `json:"model_b_metric"`
	MeanResidualDeltaDB float64          `json:"mean_residual_delta_db"`
}

type ValidationReadiness struct {
	Classification      string   `json:"classification"`
	PromotedModel       string   `json:"promoted_model"`
	ProductionCandidate bool     `json:"production_candidate"`
	GateStatus          string   `json:"gate_status"`
	RequiredGates       []string `json:"required_gates"`
	Notes               []string `json:"notes"`
}

type SubTHZValidationResponse struct {
	SchemaVersion         int                                `json:"schema_version"`
	Operation             string                             `json:"operation"`
	ModelFamily           string                             `json:"model_family"`
	ValidationFingerprint string                             `json:"validation_fingerprint"`
	Campaigns             []ValidationCampaignSummary        `json:"campaigns"`
	Models                []ValidationModelResult            `json:"models"`
	CommonSamples         []ValidationCommonSampleComparison `json:"common_sample_comparisons,omitempty"`
	Holdout               *ValidationHoldoutSummary          `json:"holdout,omitempty"`
	Readiness             ValidationReadiness                `json:"readiness"`
	Assumptions           []string                           `json:"assumptions"`
	Limitations           []string                           `json:"limitations"`
}

func validationAdapters() map[string]MeasurementValidationModelAdapter {
	adapters := map[string]MeasurementValidationModelAdapter{}
	for _, id := range validationModelIDs {
		adapters[id] = validationAdapter{id: id, predict: validationPredictor(id)}
	}
	return adapters
}

func validationPredictor(modelID string) func(context.Context, NormalizedMeasurement) ValidationPrediction {
	return func(ctx context.Context, measurement NormalizedMeasurement) ValidationPrediction {
		prediction := ValidationPrediction{ModelID: modelID, ModelVersion: "v1", Status: ValidationStatusAmbiguous, CalibrationEligible: true}
		if err := ctx.Err(); err != nil {
			prediction.Status = ValidationStatusUnsupported
			prediction.Reason = err.Error()
			return prediction
		}
		if measurement.Directionality != ValidationDirectionSynthesizedOmni && measurement.Directionality != ValidationDirectionUnknown && measurement.Directionality != "" && measurement.Directionality != "isotropic" {
			prediction.Status = ValidationStatusAmbiguous
			prediction.Reason = "directional measurement cannot be compared with an isotropic reference without a synthesized-omni basis"
			return prediction
		}
		if measurement.DistanceM <= 0 || measurement.FrequencyGHz <= 0 {
			prediction.Status = ValidationStatusAmbiguous
			prediction.Reason = "frequency and 3D distance are required"
			return prediction
		}
		switch modelID {
		case "p525_fspl":
			value := p1411ExactFSPL(measurement.DistanceM, measurement.FrequencyGHz)
			prediction.PredictedPathLossDB = &value
			prediction.Status = ValidationStatusApplicable
			prediction.Reference = P5255Reference
		case SubTHZAtmosphericReferenceModelID:
			return predictAtmosphericReference(ctx, measurement, prediction)
		case "p1411_below_rooftop_los_v1", "p1411_urban_highrise_nlos_v1", "p1411_urban_lowrise_nlos_v1":
			return predictP1411Reference(ctx, measurement, prediction)
		case P1411ResearchComparisonModelID:
			prediction.CalibrationEligible = false
			if measurement.WallEventCount == nil {
				prediction.Status = ValidationStatusAmbiguous
				prediction.Reason = "research_sub_thz requires an explicit wall_event_count; the 80 dB heuristic is not inferred"
				return prediction
			}
			if math.Abs(measurement.FrequencyGHz-140) > 1e-9 {
				prediction.Status = ValidationStatusInapplicable
				prediction.Reason = "research_sub_thz comparison is scoped to its 140 GHz planning-profile frequency"
				return prediction
			}
			value := p1411ExactFSPL(measurement.DistanceM, measurement.FrequencyGHz) + float64(*measurement.WallEventCount)*P1411ResearchWallLossPerEventDB
			prediction.PredictedPathLossDB = &value
			prediction.Status = ValidationStatusApplicable
			prediction.Reference = "existing research_sub_thz profile; comparison only"
		case DiffractionDiagnosticID:
			prediction.CalibrationEligible = false
			if measurement.Geometry.DiffractionLossDB == nil {
				prediction.Status = ValidationStatusUnsupported
				prediction.Reason = "P.526 diagnostic requires an explicit obstacle/diffraction loss profile"
				return prediction
			}
			value := p1411ExactFSPL(measurement.DistanceM, measurement.FrequencyGHz) + *measurement.Geometry.DiffractionLossDB
			prediction.PredictedPathLossDB = &value
			prediction.Status = ValidationStatusApplicable
			prediction.Reference = P526SingleEdgeReference
		default:
			prediction.Status = ValidationStatusUnsupported
			prediction.Reason = "no adapter registered"
		}
		return prediction
	}
}

func predictP1411Reference(ctx context.Context, measurement NormalizedMeasurement, prediction ValidationPrediction) ValidationPrediction {
	if measurement.LOSState == "" || measurement.Morphology == "" || measurement.RooftopRelation == "" || measurement.LOSState == P1411LOSStateUnknown || measurement.Morphology == P1411MorphologyUnknown || measurement.RooftopRelation == P1411RooftopUnknown || measurement.LOSSource == "" || measurement.LOSSource == "unknown" || measurement.MorphologySource == "" || measurement.MorphologySource == "unknown" || measurement.RooftopSource == "" || measurement.RooftopSource == "unknown" {
		prediction.Status = ValidationStatusAmbiguous
		prediction.Reason = "P.1411 requires explicit LOS/NLOS, morphology, and rooftop relation labels"
		return prediction
	}
	request := P1411ReferenceRequest{
		FrequencyGHz:     measurement.FrequencyGHz,
		Transmitter:      measurement.Tx,
		Receiver:         measurement.Rx,
		Morphology:       measurement.Morphology,
		RooftopRelation:  measurement.RooftopRelation,
		LOSState:         measurement.LOSState,
		CandidateModelID: prediction.ModelID,
		Provenance: P1411ReferenceProvenance{
			FrequencyGHz:    P1411ProvenanceDatasetMeasured,
			DistanceM:       P1411ProvenanceDatasetMeasured,
			TxHeightM:       P1411ProvenanceDatasetMeasured,
			RxHeightM:       P1411ProvenanceDatasetMeasured,
			Morphology:      P1411ProvenanceDatasetMeasured,
			RooftopRelation: P1411ProvenanceDatasetMeasured,
			LOSState:        P1411ProvenanceDatasetMeasured,
		},
	}
	response, err := EvaluateP1411ReferenceContext(ctx, request, EmptyBuildingIndex())
	if err != nil {
		prediction.Status = ValidationStatusUnsupported
		prediction.Reason = err.Error()
		return prediction
	}
	if len(response.Candidates) != 1 {
		prediction.Status = ValidationStatusUnsupported
		prediction.Reason = "P.1411 adapter did not return exactly one candidate"
		return prediction
	}
	candidate := response.Candidates[0]
	if !candidate.Applicability.Applicable || candidate.Model.MedianPathLossDB == nil {
		prediction.Status = ValidationStatusInapplicable
		prediction.Reason = strings.Join(candidate.Applicability.Reasons, ",")
		if prediction.Reason == "" {
			prediction.Reason = "P.1411 row is outside its declared applicability envelope"
		}
		return prediction
	}
	prediction.Status = ValidationStatusApplicable
	prediction.PredictedPathLossDB = candidate.Model.MedianPathLossDB
	prediction.SourceSigmaDB = &candidate.Uncertainty.SigmaDB
	prediction.Reference = candidate.Reference + " " + candidate.Table + " " + candidate.Row
	return prediction
}

func predictAtmosphericReference(ctx context.Context, measurement NormalizedMeasurement, prediction ValidationPrediction) ValidationPrediction {
	weather := measurement.Weather
	prediction.Reference = "ITU-R P.525/P.676/P.838/P.840 reference composition"
	if weather == nil || weather.TemperatureK == nil || weather.PressureHPA == nil || weather.WaterVapourDensityGM3 == nil {
		prediction.Status = ValidationStatusAmbiguous
		prediction.Reason = "atmospheric comparison requires explicit temperature, pressure, and water-vapour density"
		return prediction
	}
	if weather.RainKnown == nil || weather.FogKnown == nil {
		prediction.Status = ValidationStatusAmbiguous
		prediction.Reason = "atmospheric comparison requires explicit rain_known and fog_known weather flags"
		return prediction
	}
	request := SubTHZAtmosphericReferenceRequest{
		FrequencyGHz: measurement.FrequencyGHz,
		Transmitter:  measurement.Tx,
		Receiver:     measurement.Rx,
		Atmosphere:   SubTHZReferenceAtmosphere{Enabled: true, PressureHPA: *weather.PressureHPA, TemperatureK: *weather.TemperatureK, WaterVapourDensityGM3: *weather.WaterVapourDensityGM3},
		Rain:         SubTHZReferenceRain{Enabled: *weather.RainKnown, RainRateMMH: valueOrPointer(weather.RainRateMMH), Polarization: "circular", PolarizationTiltDeg: 45},
		LocalFog:     SubTHZReferenceLocalFog{Enabled: *weather.FogKnown, LiquidWaterDensityGM3: valueOrPointer(weather.FogLiquidWaterDensityGM3), TemperatureK: *weather.TemperatureK, TemperatureSource: "measurement_weather"},
	}
	response, err := EvaluateSubTHZAtmosphericReferenceContext(ctx, request, EmptyBuildingIndex())
	if err != nil {
		prediction.Status = ValidationStatusUnsupported
		prediction.Reason = err.Error()
		return prediction
	}
	value := response.Total.TotalPathLossDB
	prediction.PredictedPathLossDB = &value
	prediction.Status = ValidationStatusApplicable
	return prediction
}

func valueOrPointer(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}

func normalizeValidationMeasurement(campaign MeasurementCampaign, record MeasurementRecord) (NormalizedMeasurement, string) {
	frequency := valueOrPointer(record.FrequencyGHz)
	if record.FrequencyGHz == nil && campaign.FrequencyRange.MinGHz == campaign.FrequencyRange.MaxGHz {
		frequency = campaign.FrequencyRange.MinGHz
	}
	txHeight := valueOrPointer(record.Tx.HeightM)
	rxHeight := valueOrPointer(record.Rx.HeightM)
	tx := SubTHZReferencePoint{Location: Point{Lon: valueOrPointer(record.Tx.Lon), Lat: valueOrPointer(record.Tx.Lat)}, HeightM: txHeight}
	rx := SubTHZReferencePoint{Location: Point{Lon: valueOrPointer(record.Rx.Lon), Lat: valueOrPointer(record.Rx.Lat)}, HeightM: rxHeight}
	distance := valueOrPointer(record.Geometry.Direct3DDistanceM)
	if record.Geometry.Direct3DDistanceM == nil && record.Tx.Lon != nil && record.Tx.Lat != nil && record.Rx.Lon != nil && record.Rx.Lat != nil && record.Tx.HeightM != nil && record.Rx.HeightM != nil {
		distance = math.Hypot(ApproxDistanceMeters(tx.Location, rx.Location), rx.HeightM-tx.HeightM)
	}
	if record.Geometry.Direct3DDistanceM != nil && record.Tx.Lon != nil && record.Tx.Lat != nil && record.Rx.Lon != nil && record.Rx.Lat != nil {
		rx = reanchorValidationDistance(tx, rx, distance)
	}
	labels := effectiveValidationLabels(campaign, record)
	directionality := record.Directionality
	if directionality == "" {
		directionality = campaign.AntennaSetup.Directionality
	}
	basis := record.AntennaComparisonBasis
	if basis == "" {
		basis = campaign.AntennaSetup.ComparisonBasis
	}
	weather := record.Weather
	if weather == nil && campaign.Weather.TemperatureK != nil {
		weatherCopy := campaign.Weather
		weather = &weatherCopy
	}
	value, reason := normalizePathLoss(campaign, record, directionality, basis)
	return NormalizedMeasurement{
		CampaignID: campaign.CampaignID, MeasurementID: record.MeasurementID, CampaignVersion: campaign.CampaignVersion, SiteID: record.SiteID,
		LocationPairID: record.LocationPairID, BeamID: record.BeamID, FrequencyGHz: frequency, DistanceM: distance,
		MeasuredPathLossDB: value, Quantity: record.MeasurementQuantity, QuantityBasis: basis, Directionality: directionality,
		LOSState: labels.LOSState, LOSSource: labels.LOSSource, Morphology: labels.Morphology, MorphologySource: labels.MorphologySource, RooftopRelation: labels.RooftopRelation, RooftopSource: labels.RooftopSource, Tx: tx, Rx: rx,
		Weather: weather, WallEventCount: record.Geometry.WallEventCount, Geometry: record.Geometry, Source: campaign.Source.Citation,
		CalibrationNote: reason,
	}, reason
}

func reanchorValidationDistance(tx, rx SubTHZReferencePoint, slantDistance float64) SubTHZReferencePoint {
	heightDelta := rx.HeightM - tx.HeightM
	horizontalSquared := slantDistance*slantDistance - heightDelta*heightDelta
	if horizontalSquared <= 0 {
		return rx
	}
	horizontal := math.Sqrt(horizontalSquared)
	metersPerLon := 111320.0 * math.Max(0.1, math.Cos(tx.Location.Lat*math.Pi/180))
	sign := 1.0
	if rx.Location.Lon < tx.Location.Lon {
		sign = -1
	}
	rx.Location.Lon = tx.Location.Lon + sign*horizontal/metersPerLon
	rx.Location.Lat = tx.Location.Lat
	return rx
}

func normalizePathLoss(campaign MeasurementCampaign, record MeasurementRecord, directionality, basis string) (float64, string) {
	quantity := record.MeasurementQuantity
	switch quantity {
	case "path_loss", "de_embedded_path_loss", "directional_path_loss", "omnidirectional_equivalent_path_loss":
		if record.MeasuredPathLossDB == nil {
			return 0, "measured path loss is missing"
		}
		if quantity == "directional_path_loss" || directionality == ValidationDirectionBestDirectional || directionality == ValidationDirectionArbitraryDirectional {
			return 0, "directional path loss is not comparable to an isotropic reference"
		}
		if record.AntennaGainEmbedded == nil || record.CableLossEmbedded == nil || record.CalibrationApplied == nil {
			return 0, "path-loss normalization requires explicit antenna_gain_embedded, cable_loss_embedded, and calibration_applied flags"
		}
		if basis != ValidationBasisIsotropicEquivalent && basis != ValidationBasisSynthesizedOmni {
			return 0, "path-loss normalization requires an isotropic-equivalent or synthesized-omni basis"
		}
		if directionality != ValidationDirectionSynthesizedOmni && directionality != "isotropic" {
			return 0, "path-loss normalization requires an explicit synthesized-omni or isotropic directionality declaration"
		}
		return *record.MeasuredPathLossDB, ""
	case "path_gain":
		if record.MeasuredPathGainDB == nil {
			return 0, "measured path gain is missing"
		}
		if record.AntennaGainEmbedded == nil || record.CableLossEmbedded == nil || record.CalibrationApplied == nil {
			return 0, "path-gain normalization requires explicit antenna/cable/calibration flags"
		}
		if basis != ValidationBasisIsotropicEquivalent && basis != ValidationBasisSynthesizedOmni {
			return 0, "path-gain normalization requires an isotropic-equivalent or synthesized-omni basis"
		}
		return -*record.MeasuredPathGainDB, ""
	case "received_power":
		if record.MeasuredReceivedPowerDBm == nil {
			return 0, "measured received power is missing"
		}
		conducted := record.TxConductedPowerDBm
		if conducted == nil {
			conducted = campaign.Calibration.ConductedTxPowerDBm
		}
		txGain := record.TxGainDBi
		if txGain == nil {
			txGain = campaign.AntennaSetup.TxGainDBi
		}
		rxGain := record.RxGainDBi
		if rxGain == nil {
			rxGain = campaign.AntennaSetup.RxGainDBi
		}
		txCable := record.TxCableLossDB
		if txCable == nil {
			txCable = campaign.Calibration.TxCableLossDB
		}
		rxCable := record.RxCableLossDB
		if rxCable == nil {
			rxCable = campaign.Calibration.RxCableLossDB
		}
		calibrated := record.CalibrationApplied
		if calibrated == nil {
			calibrated = campaign.Calibration.ReceiverCalibrationApplied
		}
		if conducted == nil || txGain == nil || rxGain == nil || txCable == nil || rxCable == nil || calibrated == nil {
			return 0, "received-power normalization requires explicit conducted power, antenna gains, cable losses, and calibration status"
		}
		if !*calibrated {
			return 0, "received-power normalization requires calibration_applied=true"
		}
		if basis != ValidationBasisIsotropicEquivalent && basis != ValidationBasisSynthesizedOmni {
			return 0, "received-power normalization requires an isotropic-equivalent or synthesized-omni basis"
		}
		if directionality == ValidationDirectionBestDirectional || directionality == ValidationDirectionArbitraryDirectional || directionality == ValidationDirectionUnknown || directionality == "" {
			return 0, "received-power normalization requires a compatible omni/isotropic directionality declaration"
		}
		return *conducted + *txGain + *rxGain - *txCable - *rxCable - *record.MeasuredReceivedPowerDBm, ""
	case "another":
		return 0, "measurement quantity is not a supported path-loss semantic"
	default:
		return 0, "measurement quantity is required and must be a supported path-loss semantic"
	}
}

func effectiveValidationLabels(campaign MeasurementCampaign, record MeasurementRecord) MeasurementLabels {
	labels := record.Labels
	site := findValidationSite(campaign, record.SiteID)
	if labels.LOSState == "" {
		labels.LOSState, labels.LOSSource = campaign.Environment.LOSState, campaign.Environment.LOSSource
	}
	if labels.Morphology == "" {
		labels.Morphology, labels.MorphologySource = site.Morphology, site.MorphologySource
	}
	if labels.Morphology == "" {
		labels.Morphology, labels.MorphologySource = campaign.Environment.Morphology, campaign.Environment.MorphologySource
	}
	if labels.RooftopRelation == "" {
		labels.RooftopRelation, labels.RooftopSource = site.RooftopRelation, site.RooftopSource
	}
	if labels.RooftopRelation == "" {
		labels.RooftopRelation, labels.RooftopSource = campaign.Environment.RooftopRelation, campaign.Environment.RooftopSource
	}
	labels.LOSState = normalizeValidationLOS(labels.LOSState)
	labels.Morphology = normalizeValidationMorphology(labels.Morphology)
	labels.RooftopRelation = normalizeValidationRooftop(labels.RooftopRelation)
	return labels
}

func findValidationSite(campaign MeasurementCampaign, siteID string) MeasurementSite {
	for _, site := range campaign.Sites {
		if site.SiteID == siteID {
			return site
		}
	}
	return MeasurementSite{}
}

func normalizeValidationLOS(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "los", "line_of_sight", "line-of-sight":
		return P1411LOSStateLOS
	case "nlos", "non_line_of_sight", "non-line-of-sight":
		return P1411LOSStateNLOS
	case "unknown":
		return P1411LOSStateUnknown
	default:
		return value
	}
}

func normalizeValidationMorphology(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "urban_high_rise", "urban-high-rise", "highrise", "urban high-rise":
		return P1411MorphologyUrbanHighRise
	case "urban_low_rise", "urban-low-rise", "lowrise", "urban low-rise", "suburban":
		if strings.Contains(strings.ToLower(value), "suburban") {
			return P1411MorphologySuburban
		}
		return P1411MorphologyUrbanLowRise
	case "unknown":
		return P1411MorphologyUnknown
	default:
		return value
	}
}

func normalizeValidationRooftop(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "both_below_rooftop", "both-below-rooftop", "below_rooftop":
		return P1411RooftopBothBelow
	case "one_above_one_below", "one-above-one-below":
		return P1411RooftopOneAbove
	case "both_above_rooftop", "both-above-rooftop":
		return P1411RooftopBothAbove
	case "unknown":
		return P1411RooftopUnknown
	default:
		return value
	}
}

// EvaluateSubTHZValidationContext runs the isolated measurement-evidence
// workflow. It does not call the canonical simulation, path-profile,
// interference, building-entry, or optimizer pipelines.
func EvaluateSubTHZValidationContext(ctx context.Context, request SubTHZValidationRequest) (SubTHZValidationResponse, error) {
	if err := ctx.Err(); err != nil {
		return SubTHZValidationResponse{}, err
	}
	if validationError := ValidateSubTHZValidationRequest(request); validationError != "" {
		return SubTHZValidationResponse{}, errors.New(validationError)
	}
	operation := request.Operation
	if operation == "" {
		operation = ValidationOperationCompareModels
	}
	request.Operation = operation
	modelIDs := request.ModelIDs
	if len(modelIDs) == 0 {
		modelIDs = defaultValidationModelIDs()
	}
	observations, campaignSummaries := buildValidationObservations(request.Campaigns)
	adapters := validationAdapters()
	models := make([]ValidationModelResult, 0, len(modelIDs))
	predictionMaps := make(map[string]map[string]ValidationPredictionRecord, len(modelIDs))
	for _, modelID := range modelIDs {
		if err := ctx.Err(); err != nil {
			return SubTHZValidationResponse{}, err
		}
		adapter := adapters[modelID]
		result, records := evaluateValidationModel(ctx, adapter, observations, request.IncludePredictions)
		models = append(models, result)
		predictionMaps[modelID] = records
	}

	response := SubTHZValidationResponse{
		SchemaVersion: MeasurementValidationSchemaVersion,
		Operation:     operation,
		ModelFamily:   MeasurementValidationModelFamily,
		Campaigns:     campaignSummaries,
		Models:        models,
		Assumptions: []string{
			"Residual is measured path loss minus predicted path loss; positive bias means the model under-predicts measured loss.",
			"Applicability is evaluated before residual metrics. Inapplicable, ambiguous, unsupported, and censored samples do not enter ordinary error metrics.",
			"The validation ledger is a reference/diagnostic workflow only. It does not rank or promote a model into canonical network RF.",
		},
		Limitations: []string{
			"A numeric residual is not evidence of transferability without explicit measurement quantity, antenna basis, calibration, geometry, and label provenance.",
			"Metadata-only external registrations contain no imported numeric samples and cannot establish Ankara performance.",
			"Constant-bias calibration is diagnostic only and cannot correct distance, frequency, morphology, or spatial trends.",
		},
	}
	response.ValidationFingerprint = validationFingerprint(request, observations, modelIDs)
	response.CommonSamples = commonValidationSamples(modelIDs, predictionMaps)
	if operation == ValidationOperationCalibrateBias || operation == ValidationOperationSpatialHoldout || request.Strategy.Method == "leave_one_site_out" || request.Strategy.Method == "leave_one_campaign_out" {
		holdout, calibrations := evaluateValidationSplits(ctx, request, observations, modelIDs, predictionMaps)
		response.Holdout = holdout
		for index := range response.Models {
			if calibration, ok := calibrations[response.Models[index].ModelID]; ok {
				response.Models[index].Calibration = &calibration
			}
		}
	}
	response.Readiness = validationReadiness(request.Campaigns, response.Models)
	return response, nil
}

func buildValidationObservations(campaigns []MeasurementCampaign) ([]validationObservation, []ValidationCampaignSummary) {
	observations := make([]validationObservation, 0)
	summaries := make([]ValidationCampaignSummary, 0, len(campaigns))
	for _, campaign := range campaigns {
		summary := ValidationCampaignSummary{
			CampaignID: campaign.CampaignID, CampaignVersion: campaign.CampaignVersion, SourceType: campaign.Provenance.SourceType,
			MeasurementCount: len(campaign.Measurements), MetadataOnly: campaign.Provenance.SourceType == "external_publication" && len(campaign.Measurements) == 0,
		}
		for _, record := range campaign.Measurements {
			status := record.Detection.Status
			if status == "" {
				status = ValidationObservationObserved
			}
			if status == ValidationObservationBelowDetection || status == ValidationObservationNotDetected {
				summary.CensoredCount++
			} else {
				summary.ObservedCount++
			}
			measurement, reason := normalizeValidationMeasurement(campaign, record)
			if status == ValidationObservationObserved && reason == "" {
				if measurement.FrequencyGHz <= 0 {
					reason = "frequency is missing or campaign frequency is not a single explicit value"
				}
				if measurement.DistanceM <= 0 {
					reason = "3D distance requires geometry.direct_3d_distance_m or complete endpoint coordinates and heights"
				}
			}
			groupKeys := map[string]string{
				"measurement_id":   campaign.CampaignID + ":" + record.MeasurementID,
				"site_id":          record.SiteID,
				"location_pair_id": record.LocationPairID,
				"campaign_id":      campaign.CampaignID,
			}
			coordinateKnown := record.Tx.Lon != nil && record.Tx.Lat != nil && record.Rx.Lon != nil && record.Rx.Lat != nil
			observations = append(observations, validationObservation{
				Measurement: measurement, Status: status, Reason: reason, SourceRecord: record, Campaign: campaign,
				GroupKeys: groupKeys, CoordinateKnown: coordinateKnown,
			})
		}
		summaries = append(summaries, summary)
	}
	sort.Slice(summaries, func(i, j int) bool { return summaries[i].CampaignID < summaries[j].CampaignID })
	return observations, summaries
}

func evaluateValidationModel(ctx context.Context, adapter MeasurementValidationModelAdapter, observations []validationObservation, includePredictions bool) (ValidationModelResult, map[string]ValidationPredictionRecord) {
	result := ValidationModelResult{ModelID: adapter.ID(), ModelVersion: "v1", StatusCounts: map[string]int{}}
	records := make(map[string]ValidationPredictionRecord, len(observations))
	residuals := make([]float64, 0, len(observations))
	strata := make(map[string][]float64)
	sigmaValues := make([]float64, 0)
	atmospheric := &ValidationAtmosphericComparison{Status: "not_applicable"}
	for _, observation := range observations {
		prediction := ValidationPrediction{}
		if observation.Status != ValidationObservationObserved {
			prediction = ValidationPrediction{ModelID: adapter.ID(), ModelVersion: "v1", Status: ValidationStatusCensored, Reason: "censored or not-detected observation", CalibrationEligible: false}
		} else if observation.Reason != "" {
			prediction = ValidationPrediction{ModelID: adapter.ID(), ModelVersion: "v1", Status: ValidationStatusAmbiguous, Reason: observation.Reason, CalibrationEligible: false}
		} else {
			prediction = adapter.Predict(ctx, observation.Measurement)
		}
		result.StatusCounts[prediction.Status]++
		key := observation.Measurement.CampaignID + ":" + observation.Measurement.MeasurementID
		record := ValidationPredictionRecord{
			CampaignID: observation.Measurement.CampaignID, MeasurementID: observation.Measurement.MeasurementID, SiteID: observation.Measurement.SiteID,
			LocationPairID: observation.Measurement.LocationPairID, BeamID: observation.Measurement.BeamID, FrequencyGHz: observation.Measurement.FrequencyGHz,
			DistanceM: observation.Measurement.DistanceM, Status: prediction.Status, Reason: prediction.Reason, LOSState: observation.Measurement.LOSState,
			Morphology: observation.Measurement.Morphology, QuantityBasis: observation.Measurement.QuantityBasis,
		}
		if observation.Status == ValidationObservationObserved && observation.Reason == "" {
			observed := observation.Measurement.MeasuredPathLossDB
			record.ObservedPathLossDB = &observed
		}
		if prediction.PredictedPathLossDB != nil {
			record.PredictedPathLossDB = prediction.PredictedPathLossDB
		}
		if prediction.Status == ValidationStatusApplicable && prediction.PredictedPathLossDB != nil && observation.Status == ValidationObservationObserved && observation.Reason == "" {
			residual := observation.Measurement.MeasuredPathLossDB - *prediction.PredictedPathLossDB
			record.ResidualDB = &residual
			residuals = append(residuals, residual)
			for dimension, value := range validationStrata(observation.Measurement) {
				strata[dimension+"\x00"+value] = append(strata[dimension+"\x00"+value], residual)
			}
			if prediction.SourceSigmaDB != nil {
				sigmaValues = append(sigmaValues, *prediction.SourceSigmaDB)
			}
		}
		if adapter.ID() == SubTHZAtmosphericReferenceModelID {
			if prediction.Status == ValidationStatusApplicable {
				atmospheric.ComparableCount++
			} else {
				atmospheric.UnavailableCount++
				if atmospheric.Reason == "" {
					atmospheric.Reason = prediction.Reason
				}
			}
		}
		if includePredictions {
			record.CalibrationSet = "unassigned"
			records[key] = record
		}
	}
	result.Metric = validationMetric(residuals)
	result.StratifiedMetrics = flattenStrata(strata)
	if !includePredictions {
		// Metrics and fingerprints remain stable regardless of UI verbosity.
		records = buildPredictionRecordsForMetrics(observations, adapter, ctx)
	}
	result.Diagnostics = validationDiagnostics(observations, records, true)
	if len(sigmaValues) > 0 {
		result.P1411SigmaComparison = &ValidationSigmaComparison{SourceSigmaDB: mean(sigmaValues), ObservedResidualStdDB: result.Metric.StdDB, ApplicableCount: len(residuals), Interpretation: "Observed residual spread is compared with the source sigma; no Gaussian samples are generated and sigma is not fitted."}
	}
	if adapter.ID() == SubTHZAtmosphericReferenceModelID {
		if atmospheric.ComparableCount > 0 {
			atmospheric.Status = "available_for_explicit_weather_samples"
		} else {
			atmospheric.Status = "unavailable_without_explicit_weather"
		}
		result.AtmosphericComparison = atmospheric
	}
	if includePredictions {
		result.Predictions = sortedPredictionRecords(records)
	}
	if adapter.ID() == P1411ResearchComparisonModelID || adapter.ID() == DiffractionDiagnosticID {
		result.Reference = "diagnostic comparison only"
	}
	return result, records
}

func buildPredictionRecordsForMetrics(observations []validationObservation, adapter MeasurementValidationModelAdapter, ctx context.Context) map[string]ValidationPredictionRecord {
	records := make(map[string]ValidationPredictionRecord, len(observations))
	for _, observation := range observations {
		prediction := ValidationPrediction{}
		if observation.Status != ValidationObservationObserved {
			prediction.Status = ValidationStatusCensored
		} else if observation.Reason != "" {
			prediction.Status, prediction.Reason = ValidationStatusAmbiguous, observation.Reason
		} else {
			prediction = adapter.Predict(ctx, observation.Measurement)
		}
		record := ValidationPredictionRecord{CampaignID: observation.Measurement.CampaignID, MeasurementID: observation.Measurement.MeasurementID, SiteID: observation.Measurement.SiteID, LocationPairID: observation.Measurement.LocationPairID, BeamID: observation.Measurement.BeamID, FrequencyGHz: observation.Measurement.FrequencyGHz, DistanceM: observation.Measurement.DistanceM, Status: prediction.Status, Reason: prediction.Reason, LOSState: observation.Measurement.LOSState, Morphology: observation.Measurement.Morphology, QuantityBasis: observation.Measurement.QuantityBasis}
		if prediction.Status == ValidationStatusApplicable && prediction.PredictedPathLossDB != nil {
			observed := observation.Measurement.MeasuredPathLossDB
			record.ObservedPathLossDB = &observed
			record.PredictedPathLossDB = prediction.PredictedPathLossDB
			residual := observed - *prediction.PredictedPathLossDB
			record.ResidualDB = &residual
		}
		records[observation.Measurement.CampaignID+":"+observation.Measurement.MeasurementID] = record
	}
	return records
}

func sortedPredictionRecords(records map[string]ValidationPredictionRecord) []ValidationPredictionRecord {
	values := make([]ValidationPredictionRecord, 0, len(records))
	for _, value := range records {
		values = append(values, value)
	}
	sort.Slice(values, func(i, j int) bool {
		if values[i].CampaignID != values[j].CampaignID {
			return values[i].CampaignID < values[j].CampaignID
		}
		return values[i].MeasurementID < values[j].MeasurementID
	})
	return values
}

func validationStrata(measurement NormalizedMeasurement) map[string]string {
	frequency := fmt.Sprintf("%.3g", measurement.FrequencyGHz)
	return map[string]string{
		"los_nlos": measurement.LOSState, "morphology": measurement.Morphology, "campaign_id": measurement.CampaignID, "site_id": measurement.SiteID,
		"frequency_ghz": frequency, "distance_bin_m": validationDistanceBin(measurement.DistanceM),
	}
}

func validationDistanceBin(distance float64) string {
	switch {
	case distance < 25:
		return "0-25"
	case distance < 50:
		return "25-50"
	case distance < 100:
		return "50-100"
	case distance < 250:
		return "100-250"
	case distance < 500:
		return "250-500"
	default:
		return "500+"
	}
}

func flattenStrata(values map[string][]float64) []ValidationStratumMetric {
	result := make([]ValidationStratumMetric, 0, len(values))
	for key, residuals := range values {
		parts := strings.SplitN(key, "\x00", 2)
		if len(parts) != 2 {
			continue
		}
		result = append(result, ValidationStratumMetric{Dimension: parts[0], Value: parts[1], Metric: validationMetric(residuals)})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Dimension != result[j].Dimension {
			return result[i].Dimension < result[j].Dimension
		}
		return result[i].Value < result[j].Value
	})
	return result
}

func validationDiagnostics(observations []validationObservation, records map[string]ValidationPredictionRecord, recordsAvailable bool) []ValidationDiagnostic {
	if !recordsAvailable {
		return nil
	}
	byDimension := map[string][][2]float64{"log_distance_m": {}, "frequency_ghz": {}}
	for _, observation := range observations {
		key := observation.Measurement.CampaignID + ":" + observation.Measurement.MeasurementID
		record, ok := records[key]
		if !ok || record.ResidualDB == nil || observation.Measurement.DistanceM <= 0 || observation.Measurement.FrequencyGHz <= 0 {
			continue
		}
		byDimension["log_distance_m"] = append(byDimension["log_distance_m"], [2]float64{math.Log10(observation.Measurement.DistanceM), *record.ResidualDB})
		byDimension["frequency_ghz"] = append(byDimension["frequency_ghz"], [2]float64{observation.Measurement.FrequencyGHz, *record.ResidualDB})
	}
	result := make([]ValidationDiagnostic, 0, len(byDimension))
	for dimension, pairs := range byDimension {
		if len(pairs) == 0 {
			continue
		}
		slope, correlation := diagnosticSlopeCorrelation(pairs)
		unit := "dB per GHz"
		if dimension == "log_distance_m" {
			unit = "dB per log10(m)"
		}
		result = append(result, ValidationDiagnostic{Dimension: dimension, Count: len(pairs), SlopeDBPerUnit: slope, Correlation: correlation, StrongTrend: math.Abs(correlation) >= 0.7 && len(pairs) >= MinimumValidationSamples, Unit: unit, Interpretation: "diagnostic trend only; no exponent or frequency correction is fitted"})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Dimension < result[j].Dimension })
	return result
}

func diagnosticSlopeCorrelation(pairs [][2]float64) (float64, float64) {
	if len(pairs) < 2 {
		return 0, 0
	}
	xMean, yMean := 0.0, 0.0
	for _, pair := range pairs {
		xMean += pair[0]
		yMean += pair[1]
	}
	xMean /= float64(len(pairs))
	yMean /= float64(len(pairs))
	var covariance, xVariance, yVariance float64
	for _, pair := range pairs {
		x, y := pair[0]-xMean, pair[1]-yMean
		covariance += x * y
		xVariance += x * x
		yVariance += y * y
	}
	if xVariance == 0 || yVariance == 0 {
		return 0, 0
	}
	return covariance / xVariance, covariance / math.Sqrt(xVariance*yVariance)
}

func validationMetric(residuals []float64) ValidationMetric {
	if len(residuals) == 0 {
		return ValidationMetric{}
	}
	values := append([]float64(nil), residuals...)
	sort.Float64s(values)
	metric := ValidationMetric{Count: len(values), MedianBiasDB: percentile(values, 0.5), P10DB: percentile(values, 0.1), P90DB: percentile(values, 0.9)}
	var sum, absolute, square float64
	for _, residual := range values {
		sum += residual
		absolute += math.Abs(residual)
		square += residual * residual
	}
	metric.MeanBiasDB = sum / float64(len(values))
	metric.MAEDB = absolute / float64(len(values))
	metric.RMSEDB = math.Sqrt(square / float64(len(values)))
	var variance float64
	for _, residual := range values {
		delta := residual - metric.MeanBiasDB
		variance += delta * delta
	}
	metric.StdDB = math.Sqrt(variance / float64(len(values)))
	return metric
}

func percentile(values []float64, fraction float64) float64 {
	if len(values) == 0 {
		return 0
	}
	if fraction <= 0 {
		return values[0]
	}
	if fraction >= 1 {
		return values[len(values)-1]
	}
	position := fraction * float64(len(values)-1)
	lower := int(math.Floor(position))
	upper := int(math.Ceil(position))
	if lower == upper {
		return values[lower]
	}
	weight := position - float64(lower)
	return values[lower]*(1-weight) + values[upper]*weight
}

func mean(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	var total float64
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

type validationSplit struct {
	ID             string
	CalibrationIDs map[string]struct{}
	ValidationIDs  map[string]struct{}
	HeldOutGroups  []string
}

func evaluateValidationSplits(ctx context.Context, request SubTHZValidationRequest, observations []validationObservation, modelIDs []string, predictionMaps map[string]map[string]ValidationPredictionRecord) (*ValidationHoldoutSummary, map[string]ValidationCalibrationResult) {
	strategy := request.Strategy
	method := strategy.Method
	if method == "" {
		method = "spatial_grid"
	}
	splits, groupBy, cellSize, separation, noLeak := validationSplits(observations, strategy, method)
	holdout := &ValidationHoldoutSummary{Method: method, GroupBy: groupBy, SpatialCellSizeM: cellSize, MinimumSeparationM: separation, NoLeakEvidence: noLeak}
	calibrations := make(map[string]ValidationCalibrationResult, len(modelIDs))
	for _, modelID := range modelIDs {
		calibrationResult := ValidationCalibrationResult{ModelID: modelID, Method: method, ValidationSource: "explicit deterministic groups", Promoted: false, NotPromotedReason: "4I.3 never promotes a measurement-calibrated model into canonical RF"}
		adapterEligible := modelID != P1411ResearchComparisonModelID && modelID != DiffractionDiagnosticID
		if !adapterEligible {
			calibrationResult.Status = "not_calibrated_diagnostic_only"
			calibrations[modelID] = calibrationResult
		}
		allPre, allPost := make([]float64, 0), make([]float64, 0)
		var fittedBiases []float64
		for _, split := range splits {
			if err := ctx.Err(); err != nil {
				return holdout, calibrations
			}
			calibrationValues, validationValues := splitResiduals(observations, predictionMaps[modelID], split)
			foldMetrics := map[string]ValidationMetric{modelID: validationMetric(validationValues)}
			fold := ValidationHoldoutFold{FoldID: split.ID, HeldOutGroups: append([]string(nil), split.HeldOutGroups...), CalibrationCount: len(calibrationValues), ValidationCount: len(validationValues), Metrics: foldMetrics, NoLeakEvidence: "calibration and validation measurement IDs are disjoint; groups are deterministic and sorted"}
			holdout.Folds = append(holdout.Folds, fold)
			if !adapterEligible || len(calibrationValues) == 0 {
				continue
			}
			bias := mean(calibrationValues)
			fittedBiases = append(fittedBiases, bias)
			allPre = append(allPre, validationValues...)
			post := make([]float64, len(validationValues))
			for index, residual := range validationValues {
				post[index] = residual - bias
			}
			allPost = append(allPost, post...)
		}
		if adapterEligible {
			calibrationResult.FittedBiasDB = mean(fittedBiases)
			calibrationResult.CalibrationCount = 0
			calibrationResult.ValidationCount = len(allPre)
			for _, split := range splits {
				calibrationValues, _ := splitResiduals(observations, predictionMaps[modelID], split)
				calibrationResult.CalibrationCount += len(calibrationValues)
			}
			calibrationResult.PreCalibration = validationMetric(allPre)
			calibrationResult.PostCalibration = validationMetric(allPost)
			if calibrationResult.ValidationCount < MinimumValidationSamples || calibrationResult.CalibrationCount < 1 {
				calibrationResult.Status = "insufficient_validation_data"
			} else if calibrationResult.PostCalibration.MAEDB < calibrationResult.PreCalibration.MAEDB {
				calibrationResult.Status = "stable"
			} else {
				calibrationResult.Status = "unstable"
			}
			calibrations[modelID] = calibrationResult
		}
	}
	return holdout, calibrations
}

func splitResiduals(observations []validationObservation, records map[string]ValidationPredictionRecord, split validationSplit) ([]float64, []float64) {
	calibration, validation := make([]float64, 0), make([]float64, 0)
	for _, observation := range observations {
		key := observation.Measurement.CampaignID + ":" + observation.Measurement.MeasurementID
		record, ok := records[key]
		if !ok || record.ResidualDB == nil || record.Status != ValidationStatusApplicable {
			continue
		}
		if _, ok := split.ValidationIDs[key]; ok {
			validation = append(validation, *record.ResidualDB)
		} else if _, ok := split.CalibrationIDs[key]; ok {
			calibration = append(calibration, *record.ResidualDB)
		}
	}
	return calibration, validation
}

func validationSplits(observations []validationObservation, strategy ValidationStrategy, method string) ([]validationSplit, string, float64, float64, string) {
	cellSize := strategy.SpatialCellSizeM
	if cellSize == 0 {
		cellSize = DefaultSpatialCellSizeM
	}
	separation := strategy.MinimumSeparationM
	if separation == 0 {
		separation = DefaultSpatialSeparationM
	}
	groupBy := strategy.GroupBy
	if groupBy == "" {
		if method == "leave_one_site_out" {
			groupBy = "site_id"
		} else if method == "leave_one_campaign_out" {
			groupBy = "campaign_id"
		} else {
			groupBy = "location_pair_id"
		}
	}
	groupAssignments := make(map[string]string, len(observations))
	if method == "spatial_grid" {
		groupAssignments = spatialGroupAssignments(observations, cellSize, separation)
	} else {
		for _, observation := range observations {
			key := observation.GroupKeys[groupBy]
			if key == "" {
				key = observation.Measurement.CampaignID + ":" + observation.Measurement.MeasurementID
			}
			groupAssignments[observation.Measurement.CampaignID+":"+observation.Measurement.MeasurementID] = key
		}
	}
	groups := make([]string, 0)
	seenGroups := map[string]struct{}{}
	for _, group := range groupAssignments {
		if _, exists := seenGroups[group]; !exists {
			seenGroups[group] = struct{}{}
			groups = append(groups, group)
		}
	}
	sort.Strings(groups)
	allIDs := make(map[string]struct{}, len(observations))
	for _, observation := range observations {
		allIDs[observation.Measurement.CampaignID+":"+observation.Measurement.MeasurementID] = struct{}{}
	}
	if method == "all_samples" {
		return []validationSplit{{ID: "all-samples", CalibrationIDs: allIDs, ValidationIDs: allIDs, HeldOutGroups: nil}}, groupBy, cellSize, separation, "all_samples is a same-sample diagnostic; use explicit or spatial holdout for validation evidence"
	}
	if method == "explicit_groups" {
		calibrationGroups := make(map[string]struct{})
		validationGroups := make(map[string]struct{})
		for _, id := range strategy.CalibrationGroupIDs {
			calibrationGroups[id] = struct{}{}
		}
		for _, id := range strategy.ValidationGroupIDs {
			validationGroups[id] = struct{}{}
		}
		calibrationIDs, validationIDs := make(map[string]struct{}), make(map[string]struct{})
		for id, group := range groupAssignments {
			if _, ok := calibrationGroups[group]; ok {
				calibrationIDs[id] = struct{}{}
			}
			if _, ok := validationGroups[group]; ok {
				validationIDs[id] = struct{}{}
			}
		}
		if len(validationIDs) == 0 {
			for id := range allIDs {
				if _, ok := calibrationIDs[id]; !ok {
					validationIDs[id] = struct{}{}
				}
			}
		}
		return []validationSplit{{ID: "explicit-groups", CalibrationIDs: calibrationIDs, ValidationIDs: validationIDs, HeldOutGroups: append([]string(nil), strategy.ValidationGroupIDs...)}}, groupBy, cellSize, separation, "explicit group IDs are disjoint by construction; unlisted IDs are not used for calibration"
	}
	splits := make([]validationSplit, 0, len(groups))
	for _, heldOut := range groups {
		calibrationIDs, validationIDs := make(map[string]struct{}), make(map[string]struct{})
		for id, group := range groupAssignments {
			if group == heldOut {
				validationIDs[id] = struct{}{}
			} else {
				calibrationIDs[id] = struct{}{}
			}
		}
		splits = append(splits, validationSplit{ID: "fold-" + heldOut, CalibrationIDs: calibrationIDs, ValidationIDs: validationIDs, HeldOutGroups: []string{heldOut}})
	}
	return splits, groupBy, cellSize, separation, "leave-one-group-out; spatial cells are connected through occupied neighboring cells so adjacent samples cannot leak across folds"
}

func spatialGroupAssignments(observations []validationObservation, cellSize, separation float64) map[string]string {
	type cell struct{ x, y int }
	cells := make(map[string]cell)
	cellByID := make(map[string]string)
	for _, observation := range observations {
		key := observation.Measurement.CampaignID + ":" + observation.Measurement.MeasurementID
		if !observation.CoordinateKnown {
			cellByID[key] = "unknown-coordinate"
			continue
		}
		lon := valueOrPointer(observation.SourceRecord.Tx.Lon)
		lat := valueOrPointer(observation.SourceRecord.Tx.Lat)
		metersPerLon := 111320.0 * math.Max(0.1, math.Cos(lat*math.Pi/180))
		cellValue := cell{x: int(math.Floor(lon * metersPerLon / cellSize)), y: int(math.Floor(lat * 110540.0 / cellSize))}
		cellKey := fmt.Sprintf("%d:%d", cellValue.x, cellValue.y)
		cells[cellKey] = cellValue
		cellByID[key] = cellKey
	}
	parent := make(map[string]string, len(cells))
	for key := range cells {
		parent[key] = key
	}
	var find func(string) string
	find = func(key string) string {
		root := key
		for parent[root] != root {
			root = parent[root]
		}
		for parent[key] != key {
			next := parent[key]
			parent[key] = root
			key = next
		}
		return root
	}
	union := func(left, right string) {
		leftRoot, rightRoot := find(left), find(right)
		if leftRoot != rightRoot {
			if leftRoot < rightRoot {
				parent[rightRoot] = leftRoot
			} else {
				parent[leftRoot] = rightRoot
			}
		}
	}
	cellKeys := make([]string, 0, len(cells))
	for key := range cells {
		cellKeys = append(cellKeys, key)
	}
	sort.Strings(cellKeys)
	for leftIndex, leftKey := range cellKeys {
		left := cells[leftKey]
		for rightIndex := leftIndex + 1; rightIndex < len(cellKeys); rightIndex++ {
			rightKey := cellKeys[rightIndex]
			right := cells[rightKey]
			distance := math.Hypot(float64(right.x-left.x)*cellSize, float64(right.y-left.y)*cellSize)
			if distance <= separation+cellSize*math.Sqrt2 {
				union(leftKey, rightKey)
			}
		}
	}
	components := map[string]string{}
	roots := make([]string, 0)
	for key := range cells {
		root := find(key)
		if _, exists := components[root]; !exists {
			components[root] = ""
			roots = append(roots, root)
		}
	}
	sort.Strings(roots)
	for index, root := range roots {
		components[root] = fmt.Sprintf("spatial-component-%03d", index+1)
	}
	assignments := make(map[string]string, len(cellByID))
	for id, cellKey := range cellByID {
		if cellKey == "unknown-coordinate" {
			assignments[id] = cellKey
			continue
		}
		assignments[id] = components[find(cellKey)]
	}
	return assignments
}

func commonValidationSamples(modelIDs []string, predictionMaps map[string]map[string]ValidationPredictionRecord) []ValidationCommonSampleComparison {
	comparisons := make([]ValidationCommonSampleComparison, 0)
	for leftIndex := 0; leftIndex < len(modelIDs); leftIndex++ {
		for rightIndex := leftIndex + 1; rightIndex < len(modelIDs); rightIndex++ {
			leftID, rightID := modelIDs[leftIndex], modelIDs[rightIndex]
			leftRecords, rightRecords := predictionMaps[leftID], predictionMaps[rightID]
			leftResiduals, rightResiduals := make([]float64, 0), make([]float64, 0)
			for key, left := range leftRecords {
				right, ok := rightRecords[key]
				if !ok || left.ResidualDB == nil || right.ResidualDB == nil || left.Status != ValidationStatusApplicable || right.Status != ValidationStatusApplicable {
					continue
				}
				leftResiduals = append(leftResiduals, *left.ResidualDB)
				rightResiduals = append(rightResiduals, *right.ResidualDB)
			}
			leftMetric, rightMetric := validationMetric(leftResiduals), validationMetric(rightResiduals)
			comparison := ValidationCommonSampleComparison{ModelA: leftID, ModelB: rightID, CommonSampleCount: len(leftResiduals), ModelAMetric: leftMetric, ModelBMetric: rightMetric, MeanResidualDeltaDB: leftMetric.MeanBiasDB - rightMetric.MeanBiasDB}
			comparisons = append(comparisons, comparison)
		}
	}
	return comparisons
}

func validationFingerprint(request SubTHZValidationRequest, observations []validationObservation, modelIDs []string) string {
	type campaignKey struct {
		ID      string `json:"id"`
		Version string `json:"version"`
	}
	campaigns := make([]campaignKey, 0, len(request.Campaigns))
	for _, campaign := range request.Campaigns {
		campaigns = append(campaigns, campaignKey{ID: campaign.CampaignID, Version: campaign.CampaignVersion})
	}
	sort.Slice(campaigns, func(i, j int) bool { return campaigns[i].ID < campaigns[j].ID })
	sampleIDs := make([]string, 0)
	quantityBases := make([]string, 0)
	weatherSettings := make([]string, 0)
	for _, observation := range observations {
		if observation.Status == ValidationObservationObserved && observation.Reason == "" {
			sampleIDs = append(sampleIDs, observation.Measurement.CampaignID+":"+observation.Measurement.MeasurementID)
		}
		quantityBases = append(quantityBases, observation.Measurement.CampaignID+":"+observation.Measurement.MeasurementID+":"+observation.Measurement.Quantity+":"+observation.Measurement.QuantityBasis+":"+observation.Measurement.Directionality)
		if weather := observation.Measurement.Weather; weather != nil {
			weatherSettings = append(weatherSettings, fmt.Sprintf("%s:%s:%v:%v:%v:%v:%v:%v:%v:%v:%s", observation.Measurement.CampaignID, observation.Measurement.MeasurementID, valueOrPointer(weather.TemperatureK), valueOrPointer(weather.PressureHPA), valueOrPointer(weather.RelativeHumidityPct), valueOrPointer(weather.WaterVapourDensityGM3), valueOrPointer(weather.RainRateMMH), weather.RainKnown != nil && *weather.RainKnown, valueOrPointer(weather.FogLiquidWaterDensityGM3), weather.FogKnown != nil && *weather.FogKnown, weather.Source))
		}
	}
	sort.Strings(sampleIDs)
	sort.Strings(quantityBases)
	sort.Strings(weatherSettings)
	sortedModels := append([]string(nil), modelIDs...)
	sort.Strings(sortedModels)
	payload := struct {
		SchemaVersion int                `json:"schema_version"`
		Operation     string             `json:"operation"`
		ModelFamily   string             `json:"model_family"`
		Campaigns     []campaignKey      `json:"campaigns"`
		Models        []string           `json:"models"`
		ApplicableIDs []string           `json:"applicable_ids"`
		QuantityBases []string           `json:"quantity_bases"`
		Weather       []string           `json:"weather_settings"`
		Strategy      ValidationStrategy `json:"strategy"`
	}{MeasurementValidationSchemaVersion, request.Operation, MeasurementValidationModelFamily, campaigns, sortedModels, sampleIDs, quantityBases, weatherSettings, request.Strategy}
	encoded, _ := json.Marshal(payload)
	hash := sha256.Sum256(encoded)
	return "validation-" + hex.EncodeToString(hash[:])
}

func validationReadiness(campaigns []MeasurementCampaign, models []ValidationModelResult) ValidationReadiness {
	allSynthetic := len(campaigns) > 0
	metadataOnly := len(campaigns) > 0
	for _, campaign := range campaigns {
		if campaign.Provenance.SourceType != "synthetic_controlled" {
			allSynthetic = false
		}
		if !(campaign.Provenance.SourceType == "external_publication" && len(campaign.Measurements) == 0) {
			metadataOnly = false
		}
	}
	classification := "diagnostic_only"
	if allSynthetic {
		classification = "synthetic_controlled_only"
	} else if metadataOnly {
		classification = "reference_only"
	}
	return ValidationReadiness{
		Classification: classification, PromotedModel: "", ProductionCandidate: false, GateStatus: "not_ready",
		RequiredGates: []string{
			"establish an explicit, redistributable or access-controlled numeric evidence set with quantity and calibration provenance",
			"complete deterministic spatial, site, and campaign holdouts with sufficient validation counts",
			"show no material residual trend versus distance, frequency, morphology, or weather strata",
			"pre-register a model-specific review and promotion decision outside this diagnostic endpoint",
		},
		Notes: []string{
			"No production_candidate status exists in Concept 4I.3.",
			fmt.Sprintf("%d model result(s) were evaluated; side-by-side comparison does not constitute a universal winner.", len(models)),
		},
	}
}
