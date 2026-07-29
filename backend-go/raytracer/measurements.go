package raytracer

import (
	"context"
	"math"
	"sort"
	"strings"
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
	Radio   InterferenceRequest
	Samples []MeasurementSample
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
}

type MeasurementCellStats struct {
	CellID      string  `json:"cell_id"`
	SampleCount int     `json:"sample_count"`
	MAEDB       float64 `json:"mae_db"`
	RMSEDB      float64 `json:"rmse_db"`
	MeanBiasDB  float64 `json:"mean_bias_db"`
}

type BiasCalibration struct {
	Eligible                 bool     `json:"eligible"`
	Reason                   string   `json:"reason"`
	CurrentOffsetDB          float64  `json:"current_offset_db"`
	SuggestedAdjustmentDB    *float64 `json:"suggested_adjustment_db"`
	RecommendedTotalOffsetDB *float64 `json:"recommended_total_offset_db"`
	TrainingSampleCount      int      `json:"training_sample_count"`
	HoldoutSampleCount       int      `json:"holdout_sample_count"`
	HoldoutMAEBeforeDB       *float64 `json:"holdout_mae_before_db"`
	HoldoutMAEAfterDB        *float64 `json:"holdout_mae_after_db"`
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
	return MeasurementEvaluationRequest{Radio: radioInput.ToRequest(), Samples: samples}
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
			featureProperties.ResidualDB = floatPointer(roundOne(residual))
			featureProperties.Status = "valid"
			valid = append(valid, measurementResidual{cellID: properties.ServingCellID, residual: residual})
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
	calibration := buildBiasCalibration(valid, req.Radio.CalibrationOffsetDB)
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
		Calibration: calibration,
		Model: MeasurementModel{
			Technology:        req.Radio.NetworkTech,
			MeasurementFamily: preset.measurementFamily,
			CalibrationKind:   "robust_global_path_loss_bias",
			Notes: []string{
				"Measurement comparison uses the deterministic FSPL-plus-walls planning model.",
				"The suggested correction is a global dB bias, not full propagation calibration.",
			},
		},
	}, nil
}

type measurementResidual struct {
	cellID   string
	residual float64
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
	return stats
}

func buildBiasCalibration(residuals []measurementResidual, currentOffset float64) BiasCalibration {
	calibration := BiasCalibration{CurrentOffsetDB: roundOne(currentOffset)}
	if len(residuals) < 20 {
		calibration.Reason = "At least 20 valid samples are required for a bias correction."
		return calibration
	}
	training := make([]float64, 0, len(residuals))
	holdout := make([]float64, 0, len(residuals)/5+1)
	for index, residual := range residuals {
		if index%5 == 0 {
			holdout = append(holdout, residual.residual)
		} else {
			training = append(training, residual.residual)
		}
	}
	if len(training) == 0 || len(holdout) == 0 {
		calibration.Reason = "Training and holdout samples are required."
		return calibration
	}
	adjustment := medianFloat64(training)
	totalOffset := currentOffset + adjustment
	if totalOffset < MinCalibrationOffsetDB || totalOffset > MaxCalibrationOffsetDB {
		calibration.Reason = "Suggested correction exceeds the supported +/-40 dB range."
		return calibration
	}
	correctedHoldout := make([]float64, len(holdout))
	for index, residual := range holdout {
		correctedHoldout[index] = residual - adjustment
	}
	beforeMAE, _, _ := residualMetrics(holdout)
	afterMAE, _, _ := residualMetrics(correctedHoldout)
	calibration.Eligible = true
	calibration.Reason = "Review holdout error before applying this global correction."
	calibration.SuggestedAdjustmentDB = floatPointer(roundOne(adjustment))
	calibration.RecommendedTotalOffsetDB = floatPointer(roundOne(totalOffset))
	calibration.TrainingSampleCount = len(training)
	calibration.HoldoutSampleCount = len(holdout)
	calibration.HoldoutMAEBeforeDB = floatPointer(roundOne(beforeMAE))
	calibration.HoldoutMAEAfterDB = floatPointer(roundOne(afterMAE))
	return calibration
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
