package raytracer

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

const MaxMeasurementSamples = 5000

type MeasurementEvaluationRequestInput struct {
	NetworkTech         string                   `json:"network_tech"`
	Towers              []TowerRequestInput      `json:"towers"`
	RadiusMeters        *float64                 `json:"radius_m"`
	FrequencyGHz        *float64                 `json:"frequency_ghz"`
	TxPowerDBm          *float64                 `json:"tx_power_dbm"`
	BeamWidthDeg        *float64                 `json:"beam_width"`
	BandwidthMHz        *float64                 `json:"bandwidth_mhz"`
	NoiseFigureDB       *float64                 `json:"noise_figure_db"`
	CalibrationOffsetDB *float64                 `json:"calibration_offset_db"`
	Provenance          CalibrationProvenance    `json:"calibration_provenance"`
	Samples             []MeasurementSampleInput `json:"samples"`
}

type MeasurementSampleInput struct {
	ID         string   `json:"id"`
	Lon        *float64 `json:"lon"`
	Lat        *float64 `json:"lat"`
	Technology string   `json:"technology"`
	RSRPDBm    *float64 `json:"rsrp_dbm"`
	CellID     string   `json:"cell_id"`
}

type MeasurementEvaluationRequest struct {
	Radio      InterferenceRequest
	Provenance CalibrationProvenance
	Samples    []MeasurementSample
}

type MeasurementSample struct {
	ID         string
	Lon        float64
	Lat        float64
	Technology string
	RSRPDBm    float64
	CellID     string
}

type MeasurementEvaluationResponse struct {
	GeoJSON     MeasurementFeatureCollection `json:"geojson"`
	Stats       MeasurementStats             `json:"stats"`
	PerCell     []MeasurementCellStats       `json:"per_cell"`
	PerBand     []MeasurementBandStats       `json:"per_band"`
	Diagnostics MeasurementDiagnostics       `json:"diagnostics"`
	Calibration BiasCalibration              `json:"calibration"`
	Model       MeasurementModel             `json:"model"`
}

type MeasurementFeatureCollection struct {
	Type     string               `json:"type"`
	Features []MeasurementFeature `json:"features"`
}

type MeasurementFeature struct {
	Type       string                `json:"type"`
	Properties MeasurementProperties `json:"properties"`
	Geometry   PointGeometry         `json:"geometry"`
}

type MeasurementProperties struct {
	ID                        string   `json:"id"`
	Technology                string   `json:"technology"`
	RequestedCellID           string   `json:"requested_cell_id,omitempty"`
	ServingCellID             string   `json:"serving_cell_id,omitempty"`
	MeasuredRSRPDBm           float64  `json:"measured_rsrp_dbm"`
	PredictedRSRPDBm          *float64 `json:"predicted_rsrp_dbm"`
	ResidualDB                *float64 `json:"residual_db"`
	CorrectedPredictedRSRPDBm *float64 `json:"corrected_predicted_rsrp_dbm"`
	CorrectedResidualDB       *float64 `json:"corrected_residual_db"`
	DistanceMeters            *float64 `json:"distance_m"`
	WallCount                 *int     `json:"wall_count"`
	Outlier                   bool     `json:"outlier"`
	Status                    string   `json:"status"`
}

type MeasurementStats struct {
	SampleCount       int      `json:"sample_count"`
	ValidSampleCount  int      `json:"valid_sample_count"`
	NoSignalCount     int      `json:"no_signal_count"`
	CellMismatchCount int      `json:"cell_mismatch_count"`
	MAEDB             *float64 `json:"mae_db"`
	RMSEDB            *float64 `json:"rmse_db"`
	MeanBiasDB        *float64 `json:"mean_bias_db"`
	MedianBiasDB      *float64 `json:"median_bias_db"`
	P50AbsErrorDB     *float64 `json:"p50_abs_error_db"`
	P90AbsErrorDB     *float64 `json:"p90_abs_error_db"`
}

type MeasurementCellStats struct {
	CellID      string  `json:"cell_id"`
	SampleCount int     `json:"sample_count"`
	MAEDB       float64 `json:"mae_db"`
	RMSEDB      float64 `json:"rmse_db"`
	MeanBiasDB  float64 `json:"mean_bias_db"`
}

type MeasurementBandStats struct {
	FrequencyGHz float64 `json:"frequency_ghz"`
	SampleCount  int     `json:"sample_count"`
	MAEDB        float64 `json:"mae_db"`
	RMSEDB       float64 `json:"rmse_db"`
	MeanBiasDB   float64 `json:"mean_bias_db"`
}

type MeasurementResidualBin struct {
	Label       string  `json:"label"`
	SampleCount int     `json:"sample_count"`
	MAEDB       float64 `json:"mae_db"`
	MeanBiasDB  float64 `json:"mean_bias_db"`
}

type MeasurementDiagnostics struct {
	OutlierCount       int                      `json:"outlier_count"`
	OutlierThresholdDB float64                  `json:"outlier_threshold_db"`
	OutlierSampleIDs   []string                 `json:"outlier_sample_ids"`
	DistanceBins       []MeasurementResidualBin `json:"residual_vs_distance"`
	ObstructionBins    []MeasurementResidualBin `json:"residual_vs_obstruction"`
}

type CalibrationProvenance struct {
	CampaignID  string `json:"campaign_id,omitempty"`
	Source      string `json:"source,omitempty"`
	CollectedAt string `json:"collected_at,omitempty"`
	ExpiresAt   string `json:"expires_at,omitempty"`
}

type CalibrationConfidenceInterval struct {
	LowerDB float64 `json:"lower_db"`
	UpperDB float64 `json:"upper_db"`
	Level   float64 `json:"level"`
}

type CalibrationFoldStats struct {
	Fold                  int       `json:"fold"`
	TrainingSampleCount   int       `json:"training_sample_count"`
	ValidationSampleCount int       `json:"validation_sample_count"`
	AdjustmentDB          float64   `json:"adjustment_db"`
	MAEBeforeDB           float64   `json:"mae_before_db"`
	MAEAfterDB            float64   `json:"mae_after_db"`
	Bounds                []float64 `json:"bounds"`
}

type BiasCalibration struct {
	Eligible                   bool                           `json:"eligible"`
	Reason                     string                         `json:"reason"`
	CurrentOffsetDB            float64                        `json:"current_offset_db"`
	SuggestedAdjustmentDB      *float64                       `json:"suggested_adjustment_db"`
	RecommendedTotalOffsetDB   *float64                       `json:"recommended_total_offset_db"`
	TrainingSampleCount        int                            `json:"training_sample_count"`
	HoldoutSampleCount         int                            `json:"holdout_sample_count"`
	HoldoutMAEBeforeDB         *float64                       `json:"holdout_mae_before_db"`
	HoldoutMAEAfterDB          *float64                       `json:"holdout_mae_after_db"`
	Method                     string                         `json:"method"`
	FoldCount                  int                            `json:"fold_count"`
	Folds                      []CalibrationFoldStats         `json:"folds"`
	SpatialDiversitySufficient bool                           `json:"spatial_diversity_sufficient"`
	SpatialGroupCount          int                            `json:"spatial_group_count"`
	SpatialSpanMeters          float64                        `json:"spatial_span_m"`
	P50AbsoluteErrorDB         *float64                       `json:"p50_absolute_error_db"`
	P90AbsoluteErrorDB         *float64                       `json:"p90_absolute_error_db"`
	AdjustmentConfidence95     *CalibrationConfidenceInterval `json:"adjustment_confidence_95"`
	Provenance                 CalibrationProvenance          `json:"provenance"`
	Expired                    bool                           `json:"expired"`
}

type MeasurementModel struct {
	Technology        string   `json:"technology"`
	MeasurementFamily string   `json:"measurement_family"`
	CalibrationKind   string   `json:"calibration_kind"`
	Notes             []string `json:"notes"`
}

func (input MeasurementEvaluationRequestInput) ToRequest() MeasurementEvaluationRequest {
	radioInput := InterferenceRequestInput{
		NetworkTech:         input.NetworkTech,
		Towers:              input.Towers,
		RadiusMeters:        input.RadiusMeters,
		FrequencyGHz:        input.FrequencyGHz,
		TxPowerDBm:          input.TxPowerDBm,
		BeamWidthDeg:        input.BeamWidthDeg,
		BandwidthMHz:        input.BandwidthMHz,
		LoadFactor:          floatPointer(1),
		ReuseFactor:         intPointer(1),
		NoiseFigureDB:       input.NoiseFigureDB,
		SampleSpacingM:      floatPointer(DefaultInterferenceSpacingM),
		CalibrationOffsetDB: input.CalibrationOffsetDB,
	}
	samples := make([]MeasurementSample, 0, len(input.Samples))
	for _, sample := range input.Samples {
		samples = append(samples, MeasurementSample{
			ID:         strings.TrimSpace(sample.ID),
			Lon:        valueOr(sample.Lon, 0),
			Lat:        valueOr(sample.Lat, 0),
			Technology: strings.ToLower(strings.TrimSpace(sample.Technology)),
			RSRPDBm:    valueOr(sample.RSRPDBm, 0),
			CellID:     strings.TrimSpace(sample.CellID),
		})
	}
	provenance := input.Provenance
	provenance.CampaignID = strings.TrimSpace(provenance.CampaignID)
	provenance.Source = strings.TrimSpace(provenance.Source)
	provenance.CollectedAt = strings.TrimSpace(provenance.CollectedAt)
	provenance.ExpiresAt = strings.TrimSpace(provenance.ExpiresAt)
	return MeasurementEvaluationRequest{Radio: radioInput.ToRequest(), Provenance: provenance, Samples: samples}
}

func ValidateMeasurementEvaluationRequest(input MeasurementEvaluationRequestInput, req MeasurementEvaluationRequest) string {
	if len(req.Samples) == 0 || len(req.Samples) > MaxMeasurementSamples {
		return "samples must contain between 1 and 5000 measurements"
	}
	if !IsAnalysisTechnology(req.Radio.NetworkTech) {
		return "network_tech must be 4g or 5g"
	}
	if len(req.Radio.Towers) < MinMeasurementTowers || len(req.Radio.Towers) > MaxMeasurementTowers {
		return "towers must contain between 1 and 6 selected towers"
	}
	if req.Radio.RadiusMeters < MinRadiusMeters || req.Radio.RadiusMeters > MaxRadiusMeters {
		return "radius_m must be between 25 and 5000"
	}
	if req.Radio.TxPowerDBm < MinTxPowerDBm || req.Radio.TxPowerDBm > MaxTxPowerDBm || req.Radio.BeamWidthDeg < MinBeamWidthDeg || req.Radio.BeamWidthDeg > MaxBeamWidthDeg {
		return "tx_power_dbm must be between 0 and 60 and beam_width between 10 and 360"
	}
	if req.Radio.CalibrationOffsetDB < MinCalibrationOffsetDB || req.Radio.CalibrationOffsetDB > MaxCalibrationOffsetDB {
		return "calibration_offset_db must be between -40 and 40"
	}
	if req.Radio.NetworkTech == "4g" && !FrequencyMatchesTechnology(req.Radio.NetworkTech, req.Radio.FrequencyGHz) {
		return "4g measurement evaluation requires frequency_ghz below 10"
	}
	if req.Radio.NetworkTech == "5g" && !FrequencyMatchesTechnology(req.Radio.NetworkTech, req.Radio.FrequencyGHz) {
		return "5g measurement evaluation requires frequency_ghz from 10 up to 100"
	}
	if _, err := interferencePresetFor(req.Radio.NetworkTech, req.Radio.BandwidthMHz); err != nil {
		return err.Error()
	}
	for label, value := range map[string]string{
		"calibration_provenance.collected_at": req.Provenance.CollectedAt,
		"calibration_provenance.expires_at":   req.Provenance.ExpiresAt,
	} {
		if len([]byte(value)) > 256 {
			return label + " must be at most 256 bytes"
		}
		if value != "" {
			if _, err := time.Parse(time.RFC3339, value); err != nil {
				return label + " must use RFC3339 format"
			}
		}
	}
	for label, value := range map[string]string{
		"calibration_provenance.campaign_id": req.Provenance.CampaignID,
		"calibration_provenance.source":      req.Provenance.Source,
	} {
		if len([]byte(value)) > 256 {
			return label + " must be at most 256 bytes"
		}
	}
	if req.Provenance.CollectedAt != "" && req.Provenance.ExpiresAt != "" {
		collectedAt, _ := time.Parse(time.RFC3339, req.Provenance.CollectedAt)
		expiresAt, _ := time.Parse(time.RFC3339, req.Provenance.ExpiresAt)
		if !expiresAt.After(collectedAt) {
			return "calibration_provenance.expires_at must be after collected_at"
		}
	}
	seenTowers := make(map[string]struct{}, len(req.Radio.Towers))
	for _, tower := range req.Radio.Towers {
		if validationError := ValidateTowerID(tower.ID); validationError != "" {
			return validationError
		}
		if _, exists := seenTowers[tower.ID]; exists {
			return "tower ids must be unique"
		}
		seenTowers[tower.ID] = struct{}{}
		if tower.TowerLon < MinLongitude || tower.TowerLon > MaxLongitude || tower.TowerLat < MinLatitude || tower.TowerLat > MaxLatitude {
			return "each tower must include valid tower_lon and tower_lat coordinates"
		}
		if validationError := ValidateCellRFProfile(tower.RFProfile, true); validationError != "" {
			return validationError
		}
	}
	seen := make(map[string]struct{}, len(req.Samples))
	for index, sample := range req.Samples {
		if input.Samples[index].Lon == nil || input.Samples[index].Lat == nil || input.Samples[index].RSRPDBm == nil {
			return "each sample must include lon, lat, and rsrp_dbm"
		}
		if sample.ID == "" {
			return "each sample must include a non-empty id"
		}
		if _, exists := seen[sample.ID]; exists {
			return "sample ids must be unique"
		}
		seen[sample.ID] = struct{}{}
		if sample.Lon < MinLongitude || sample.Lon > MaxLongitude || sample.Lat < MinLatitude || sample.Lat > MaxLatitude {
			return "each sample must include valid lon and lat coordinates"
		}
		if sample.RSRPDBm < -180 || sample.RSRPDBm > -20 {
			return "rsrp_dbm must be between -180 and -20"
		}
		if sample.Technology != "" && sample.Technology != req.Radio.NetworkTech {
			return "sample technology must match network_tech"
		}
	}
	return ""
}

func EvaluateMeasurementsContext(ctx context.Context, req MeasurementEvaluationRequest, buildings *BuildingIndex) (MeasurementEvaluationResponse, error) {
	preset, err := interferencePresetFor(req.Radio.NetworkTech, req.Radio.BandwidthMHz)
	if err != nil {
		return MeasurementEvaluationResponse{}, err
	}
	samples := append([]MeasurementSample(nil), req.Samples...)
	sort.SliceStable(samples, func(i, j int) bool { return samples[i].ID < samples[j].ID })
	features := make([]MeasurementFeature, 0, len(samples))
	valid := make([]measurementResidual, 0, len(samples))
	noSignalCount := 0
	cellMismatchCount := 0
	for _, sample := range samples {
		if err := ctx.Err(); err != nil {
			return MeasurementEvaluationResponse{}, err
		}
		properties, err := evaluateInterferencePointContext(ctx, req.Radio, preset, buildings, Point{Lon: sample.Lon, Lat: sample.Lat})
		if err != nil {
			return MeasurementEvaluationResponse{}, err
		}
		featureProperties := MeasurementProperties{
			ID:               sample.ID,
			Technology:       req.Radio.NetworkTech,
			RequestedCellID:  sample.CellID,
			ServingCellID:    properties.ServingCellID,
			MeasuredRSRPDBm:  roundOne(sample.RSRPDBm),
			PredictedRSRPDBm: properties.RSRPDBm,
			Status:           "no_signal",
		}
		if properties.RSRPDBm != nil && (sample.CellID == "" || sample.CellID == properties.ServingCellID) {
			residual := sample.RSRPDBm - *properties.RSRPDBm
			distanceMeters, frequencyGHz := servingTowerContext(req.Radio, properties.ServingCellID, Point{Lon: sample.Lon, Lat: sample.Lat})
			featureProperties.ResidualDB = floatPointer(roundOne(residual))
			featureProperties.DistanceMeters = floatPointer(roundOne(distanceMeters))
			featureProperties.WallCount = intPointer(properties.WallCount)
			featureProperties.Status = "valid"
			valid = append(valid, measurementResidual{
				sampleID: sample.ID, cellID: properties.ServingCellID, frequencyGHz: frequencyGHz,
				lon: sample.Lon, lat: sample.Lat, distanceMeters: distanceMeters,
				wallCount: properties.WallCount, residual: residual,
			})
		} else if properties.RSRPDBm != nil {
			featureProperties.Status = "cell_mismatch"
			cellMismatchCount++
		} else {
			noSignalCount++
		}
		features = append(features, MeasurementFeature{
			Type:       "Feature",
			Properties: featureProperties,
			Geometry:   PointGeometry{Type: "Point", Coordinates: []float64{sample.Lon, sample.Lat}},
		})
	}
	stats := measurementStats(valid, len(samples), noSignalCount, cellMismatchCount)
	diagnostics := measurementDiagnostics(valid)
	outlierIDs := make(map[string]struct{}, len(diagnostics.OutlierSampleIDs))
	for _, sampleID := range diagnostics.OutlierSampleIDs {
		outlierIDs[sampleID] = struct{}{}
	}
	for index := range features {
		_, features[index].Properties.Outlier = outlierIDs[features[index].Properties.ID]
	}
	calibration := buildBiasCalibration(valid, req.Radio.CalibrationOffsetDB, req.Provenance)
	if calibration.Eligible && calibration.SuggestedAdjustmentDB != nil {
		adjustment := *calibration.SuggestedAdjustmentDB
		for index := range features {
			properties := &features[index].Properties
			if properties.PredictedRSRPDBm == nil || properties.ResidualDB == nil {
				continue
			}
			correctedPrediction := *properties.PredictedRSRPDBm + adjustment
			correctedResidual := properties.MeasuredRSRPDBm - correctedPrediction
			properties.CorrectedPredictedRSRPDBm = floatPointer(roundOne(correctedPrediction))
			properties.CorrectedResidualDB = floatPointer(roundOne(correctedResidual))
		}
	}
	return MeasurementEvaluationResponse{
		GeoJSON:     MeasurementFeatureCollection{Type: "FeatureCollection", Features: features},
		Stats:       stats,
		PerCell:     measurementCellStats(valid),
		PerBand:     measurementBandStats(valid),
		Diagnostics: diagnostics,
		Calibration: calibration,
		Model: MeasurementModel{
			Technology:        req.Radio.NetworkTech,
			MeasurementFamily: preset.measurementFamily,
			CalibrationKind:   "spatially_validated_robust_global_path_loss_bias",
			Notes: []string{
				"Measurement comparison uses the deterministic FSPL-plus-walls planning model.",
				"The suggested correction is a spatially cross-validated global dB bias, not a fitted propagation model.",
				"Per-cell, per-band, distance, obstruction, and outlier diagnostics are descriptive and are not automatically fitted.",
			},
		},
	}, nil
}

type measurementResidual struct {
	sampleID       string
	cellID         string
	frequencyGHz   float64
	lon            float64
	lat            float64
	distanceMeters float64
	wallCount      int
	residual       float64
}

func servingTowerContext(req InterferenceRequest, servingCellID string, point Point) (float64, float64) {
	for index, tower := range req.Towers {
		if tower.ID != servingCellID {
			continue
		}
		profile := effectiveInterferenceTowerProfile(req, tower, index)
		return ApproxDistanceMeters(Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, point), profile.FrequencyGHz
	}
	return 0, req.FrequencyGHz
}

func measurementStats(residuals []measurementResidual, sampleCount, noSignalCount, cellMismatchCount int) MeasurementStats {
	stats := MeasurementStats{
		SampleCount:       sampleCount,
		ValidSampleCount:  len(residuals),
		NoSignalCount:     noSignalCount,
		CellMismatchCount: cellMismatchCount,
	}
	if len(residuals) == 0 {
		return stats
	}
	values := residualValues(residuals)
	mae, rmse, bias := residualMetrics(values)
	median := medianFloat64(values)
	stats.MAEDB = floatPointer(roundOne(mae))
	stats.RMSEDB = floatPointer(roundOne(rmse))
	stats.MeanBiasDB = floatPointer(roundOne(bias))
	stats.MedianBiasDB = floatPointer(roundOne(median))
	absValues := absoluteValues(values)
	stats.P50AbsErrorDB = floatPointer(roundOne(percentileFloat64(absValues, 0.5)))
	stats.P90AbsErrorDB = floatPointer(roundOne(percentileFloat64(absValues, 0.9)))
	return stats
}

func buildBiasCalibration(residuals []measurementResidual, currentOffset float64, provenanceValues ...CalibrationProvenance) BiasCalibration {
	provenance := CalibrationProvenance{Source: "measurement_csv"}
	if len(provenanceValues) > 0 {
		provenance = provenanceValues[0]
		if provenance.Source == "" {
			provenance.Source = "measurement_csv"
		}
	}
	calibration := BiasCalibration{
		CurrentOffsetDB: roundOne(currentOffset), Method: "spatial_blocked_5_fold_median_bias",
		Folds: []CalibrationFoldStats{}, Provenance: provenance,
	}
	if provenance.ExpiresAt != "" {
		if expiresAt, err := time.Parse(time.RFC3339, provenance.ExpiresAt); err == nil {
			calibration.Expired = expiresAt.Before(time.Now())
		}
	}
	if len(residuals) < 20 {
		calibration.Reason = "At least 20 valid samples are required for a bias correction."
		return calibration
	}
	folds, groupCount, spatialSpanMeters := spatialCalibrationFolds(residuals, 5)
	calibration.SpatialGroupCount = groupCount
	calibration.SpatialSpanMeters = roundOne(spatialSpanMeters)
	calibration.SpatialDiversitySufficient = groupCount >= 5 && spatialSpanMeters >= 100 && len(folds) == 5
	if !calibration.SpatialDiversitySufficient {
		calibration.Reason = fmt.Sprintf("Insufficient spatial diversity: need at least 5 distinct 50 m areas spanning 100 m; found %d areas across %.1f m.", groupCount, spatialSpanMeters)
		return calibration
	}
	allValues := residualValues(residuals)
	adjustment := medianFloat64(allValues)
	totalOffset := currentOffset + adjustment
	if totalOffset < MinCalibrationOffsetDB || totalOffset > MaxCalibrationOffsetDB {
		calibration.Reason = "Suggested correction exceeds the supported +/-40 dB range."
		return calibration
	}
	validationBefore := make([]float64, 0, len(residuals))
	validationAfter := make([]float64, 0, len(residuals))
	minimumTrainingCount := len(residuals)
	for foldIndex, validationIndices := range folds {
		validationSet := make(map[int]struct{}, len(validationIndices))
		for _, index := range validationIndices {
			validationSet[index] = struct{}{}
		}
		training := make([]float64, 0, len(residuals)-len(validationIndices))
		validation := make([]float64, 0, len(validationIndices))
		for index, residual := range residuals {
			if _, heldOut := validationSet[index]; heldOut {
				validation = append(validation, residual.residual)
			} else {
				training = append(training, residual.residual)
			}
		}
		if len(training) == 0 || len(validation) == 0 {
			calibration.Reason = "Every spatial fold requires both training and validation samples."
			return calibration
		}
		foldAdjustment := medianFloat64(training)
		corrected := make([]float64, len(validation))
		for index, residual := range validation {
			corrected[index] = residual - foldAdjustment
		}
		beforeMAE, _, _ := residualMetrics(validation)
		afterMAE, _, _ := residualMetrics(corrected)
		calibration.Folds = append(calibration.Folds, CalibrationFoldStats{
			Fold: foldIndex + 1, TrainingSampleCount: len(training), ValidationSampleCount: len(validation),
			AdjustmentDB: roundOne(foldAdjustment), MAEBeforeDB: roundOne(beforeMAE), MAEAfterDB: roundOne(afterMAE),
			Bounds: residualBounds(residuals, validationIndices),
		})
		validationBefore = append(validationBefore, validation...)
		validationAfter = append(validationAfter, corrected...)
		if len(training) < minimumTrainingCount {
			minimumTrainingCount = len(training)
		}
	}
	beforeMAE, _, _ := residualMetrics(validationBefore)
	afterMAE, _, _ := residualMetrics(validationAfter)
	absCorrected := absoluteValues(validationAfter)
	confidence := medianConfidenceInterval(allValues)
	calibration.FoldCount = len(folds)
	calibration.TrainingSampleCount = minimumTrainingCount
	calibration.HoldoutSampleCount = len(validationBefore)
	calibration.HoldoutMAEBeforeDB = floatPointer(roundOne(beforeMAE))
	calibration.HoldoutMAEAfterDB = floatPointer(roundOne(afterMAE))
	calibration.P50AbsoluteErrorDB = floatPointer(roundOne(percentileFloat64(absCorrected, 0.5)))
	calibration.P90AbsoluteErrorDB = floatPointer(roundOne(percentileFloat64(absCorrected, 0.9)))
	calibration.AdjustmentConfidence95 = &confidence
	if calibration.Expired {
		calibration.Reason = "Calibration provenance is expired; import a current representative campaign before applying a correction."
		return calibration
	}
	if afterMAE >= beforeMAE {
		calibration.Reason = "The global bias did not improve spatially blocked validation error, so no correction is recommended."
		return calibration
	}
	calibration.Eligible = true
	calibration.Reason = "Review all spatial-fold errors, uncertainty, and subgroup residuals before applying this global correction."
	calibration.SuggestedAdjustmentDB = floatPointer(roundOne(adjustment))
	calibration.RecommendedTotalOffsetDB = floatPointer(roundOne(totalOffset))
	return calibration
}

type spatialResidualGroup struct {
	key     string
	indices []int
	x       float64
	y       float64
}

func spatialCalibrationFolds(residuals []measurementResidual, foldCount int) ([][]int, int, float64) {
	if len(residuals) == 0 || foldCount < 2 {
		return nil, 0, 0
	}
	origin := Point{Lon: residuals[0].lon, Lat: residuals[0].lat}
	cosLatitude := math.Cos(origin.Lat * math.Pi / 180)
	groupsByKey := make(map[string]*spatialResidualGroup)
	minX, maxX, minY, maxY := math.Inf(1), math.Inf(-1), math.Inf(1), math.Inf(-1)
	for index, residual := range residuals {
		x := (residual.lon - origin.Lon) * 111320 * cosLatitude
		y := (residual.lat - origin.Lat) * 110540
		minX, maxX = math.Min(minX, x), math.Max(maxX, x)
		minY, maxY = math.Min(minY, y), math.Max(maxY, y)
		key := fmt.Sprintf("%d:%d", int(math.Floor(x/50)), int(math.Floor(y/50)))
		group := groupsByKey[key]
		if group == nil {
			group = &spatialResidualGroup{key: key, x: x, y: y}
			groupsByKey[key] = group
		}
		group.indices = append(group.indices, index)
	}
	groups := make([]spatialResidualGroup, 0, len(groupsByKey))
	for _, group := range groupsByKey {
		groups = append(groups, *group)
	}
	dominantX := maxX-minX >= maxY-minY
	sort.SliceStable(groups, func(i, j int) bool {
		if dominantX && groups[i].x != groups[j].x {
			return groups[i].x < groups[j].x
		}
		if !dominantX && groups[i].y != groups[j].y {
			return groups[i].y < groups[j].y
		}
		return groups[i].key < groups[j].key
	})
	if len(groups) < foldCount {
		return nil, len(groups), math.Hypot(maxX-minX, maxY-minY)
	}
	folds := make([][]int, foldCount)
	for groupIndex, group := range groups {
		foldIndex := groupIndex * foldCount / len(groups)
		if foldIndex >= foldCount {
			foldIndex = foldCount - 1
		}
		folds[foldIndex] = append(folds[foldIndex], group.indices...)
	}
	return folds, len(groups), math.Hypot(maxX-minX, maxY-minY)
}

func residualBounds(residuals []measurementResidual, indices []int) []float64 {
	minLon, minLat, maxLon, maxLat := math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)
	for _, index := range indices {
		residual := residuals[index]
		minLon, maxLon = math.Min(minLon, residual.lon), math.Max(maxLon, residual.lon)
		minLat, maxLat = math.Min(minLat, residual.lat), math.Max(maxLat, residual.lat)
	}
	return []float64{minLon, minLat, maxLon, maxLat}
}

func medianConfidenceInterval(values []float64) CalibrationConfidenceInterval {
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	halfWidth := int(math.Ceil(0.98 * math.Sqrt(float64(len(sorted)))))
	middle := len(sorted) / 2
	lowerIndex := max(0, middle-halfWidth)
	upperIndex := min(len(sorted)-1, middle+halfWidth)
	return CalibrationConfidenceInterval{LowerDB: roundOne(sorted[lowerIndex]), UpperDB: roundOne(sorted[upperIndex]), Level: 0.95}
}

func measurementCellStats(residuals []measurementResidual) []MeasurementCellStats {
	grouped := make(map[string][]float64)
	for _, residual := range residuals {
		grouped[residual.cellID] = append(grouped[residual.cellID], residual.residual)
	}
	cellIDs := make([]string, 0, len(grouped))
	for cellID := range grouped {
		cellIDs = append(cellIDs, cellID)
	}
	sort.Strings(cellIDs)
	stats := make([]MeasurementCellStats, 0, len(cellIDs))
	for _, cellID := range cellIDs {
		mae, rmse, bias := residualMetrics(grouped[cellID])
		stats = append(stats, MeasurementCellStats{CellID: cellID, SampleCount: len(grouped[cellID]), MAEDB: roundOne(mae), RMSEDB: roundOne(rmse), MeanBiasDB: roundOne(bias)})
	}
	return stats
}

func measurementBandStats(residuals []measurementResidual) []MeasurementBandStats {
	type bandValues struct {
		frequency float64
		values    []float64
	}
	grouped := make(map[string]*bandValues)
	for _, residual := range residuals {
		key := fmt.Sprintf("%.6f", residual.frequencyGHz)
		if grouped[key] == nil {
			grouped[key] = &bandValues{frequency: residual.frequencyGHz}
		}
		grouped[key].values = append(grouped[key].values, residual.residual)
	}
	groups := make([]bandValues, 0, len(grouped))
	for _, group := range grouped {
		groups = append(groups, *group)
	}
	sort.SliceStable(groups, func(i, j int) bool { return groups[i].frequency < groups[j].frequency })
	stats := make([]MeasurementBandStats, 0, len(groups))
	for _, group := range groups {
		mae, rmse, bias := residualMetrics(group.values)
		stats = append(stats, MeasurementBandStats{
			FrequencyGHz: round2(group.frequency), SampleCount: len(group.values),
			MAEDB: roundOne(mae), RMSEDB: roundOne(rmse), MeanBiasDB: roundOne(bias),
		})
	}
	if stats == nil {
		stats = []MeasurementBandStats{}
	}
	return stats
}

func measurementDiagnostics(residuals []measurementResidual) MeasurementDiagnostics {
	diagnostics := MeasurementDiagnostics{
		OutlierSampleIDs: []string{}, DistanceBins: []MeasurementResidualBin{}, ObstructionBins: []MeasurementResidualBin{},
	}
	if len(residuals) == 0 {
		return diagnostics
	}
	values := residualValues(residuals)
	median := medianFloat64(values)
	deviations := make([]float64, len(values))
	for index, value := range values {
		deviations[index] = math.Abs(value - median)
	}
	mad := medianFloat64(deviations)
	threshold := math.Max(6, 3*1.4826*mad)
	diagnostics.OutlierThresholdDB = roundOne(threshold)
	for _, residual := range residuals {
		if math.Abs(residual.residual-median) > threshold {
			diagnostics.OutlierSampleIDs = append(diagnostics.OutlierSampleIDs, residual.sampleID)
		}
	}
	sort.Strings(diagnostics.OutlierSampleIDs)
	diagnostics.OutlierCount = len(diagnostics.OutlierSampleIDs)
	distanceRanges := []struct {
		label   string
		minimum float64
		maximum float64
	}{
		{"0–100 m", 0, 100}, {"100–250 m", 100, 250}, {"250–500 m", 250, 500},
		{"500 m–1 km", 500, 1000}, {"1 km+", 1000, math.Inf(1)},
	}
	for _, distanceRange := range distanceRanges {
		binValues := make([]float64, 0)
		for _, residual := range residuals {
			if residual.distanceMeters >= distanceRange.minimum && residual.distanceMeters < distanceRange.maximum {
				binValues = append(binValues, residual.residual)
			}
		}
		if len(binValues) > 0 {
			diagnostics.DistanceBins = append(diagnostics.DistanceBins, residualBin(distanceRange.label, binValues))
		}
	}
	for _, obstruction := range []struct {
		label string
		match func(int) bool
	}{
		{"Clear (0 walls)", func(count int) bool { return count == 0 }},
		{"1 wall", func(count int) bool { return count == 1 }},
		{"2 walls", func(count int) bool { return count == 2 }},
		{"3+ walls", func(count int) bool { return count >= 3 }},
	} {
		binValues := make([]float64, 0)
		for _, residual := range residuals {
			if obstruction.match(residual.wallCount) {
				binValues = append(binValues, residual.residual)
			}
		}
		if len(binValues) > 0 {
			diagnostics.ObstructionBins = append(diagnostics.ObstructionBins, residualBin(obstruction.label, binValues))
		}
	}
	return diagnostics
}

func residualBin(label string, values []float64) MeasurementResidualBin {
	mae, _, bias := residualMetrics(values)
	return MeasurementResidualBin{Label: label, SampleCount: len(values), MAEDB: roundOne(mae), MeanBiasDB: roundOne(bias)}
}

func residualValues(residuals []measurementResidual) []float64 {
	values := make([]float64, len(residuals))
	for index, residual := range residuals {
		values[index] = residual.residual
	}
	return values
}

func residualMetrics(values []float64) (float64, float64, float64) {
	if len(values) == 0 {
		return 0, 0, 0
	}
	absTotal := 0.0
	squareTotal := 0.0
	total := 0.0
	for _, value := range values {
		absTotal += math.Abs(value)
		squareTotal += value * value
		total += value
	}
	count := float64(len(values))
	return absTotal / count, math.Sqrt(squareTotal / count), total / count
}

func absoluteValues(values []float64) []float64 {
	absolute := make([]float64, len(values))
	for index, value := range values {
		absolute[index] = math.Abs(value)
	}
	return absolute
}

func percentileFloat64(values []float64, quantile float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	if quantile <= 0 {
		return sorted[0]
	}
	if quantile >= 1 {
		return sorted[len(sorted)-1]
	}
	position := quantile * float64(len(sorted)-1)
	lower := int(math.Floor(position))
	upper := int(math.Ceil(position))
	if lower == upper {
		return sorted[lower]
	}
	weight := position - float64(lower)
	return sorted[lower]*(1-weight) + sorted[upper]*weight
}

func medianFloat64(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	middle := len(sorted) / 2
	if len(sorted)%2 == 0 {
		return (sorted[middle-1] + sorted[middle]) / 2
	}
	return sorted[middle]
}

func intPointer(value int) *int { return &value }
