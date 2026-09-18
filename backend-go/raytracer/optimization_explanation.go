package raytracer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// NetworkCellExplanationRequest is the serialized hand-off from an
// optimization result to the lazy per-cell marginal-effect evaluator. The
// baseline and solution are authoritative snapshots from one optimization
// response; priorities are supplied separately so score deltas can be
// recalculated without another RF evaluation.
type NetworkCellExplanationRequest struct {
	RunID              string                       `json:"run_id"`
	SolutionID         string                       `json:"solution_id"`
	CellID             string                       `json:"cell_id"`
	Baseline           *NetworkOptimizationSolution `json:"baseline"`
	Solution           *NetworkParetoSolution       `json:"solution"`
	Optimization       *OptimizationConfig          `json:"optimization"`
	OptimizationDomain *OptimizationDomainMetadata  `json:"optimization_domain"`
}

// NetworkCellExplanationRequestInput is the strict JSON-facing form used by
// the HTTP route. Pointers let the route distinguish omitted legacy metadata
// from a valid empty value and fail gracefully before RF work begins.
type NetworkCellExplanationRequestInput struct {
	RunID              string                       `json:"run_id"`
	SolutionID         string                       `json:"solution_id"`
	CellID             string                       `json:"cell_id"`
	Baseline           *NetworkOptimizationSolution `json:"baseline"`
	Solution           *NetworkParetoSolution       `json:"solution"`
	Optimization       *OptimizationConfig          `json:"optimization"`
	OptimizationDomain *OptimizationDomainMetadata  `json:"optimization_domain"`
}

func (input NetworkCellExplanationRequestInput) ToRequest() NetworkCellExplanationRequest {
	return NetworkCellExplanationRequest{
		RunID:              strings.TrimSpace(input.RunID),
		SolutionID:         strings.TrimSpace(input.SolutionID),
		CellID:             strings.TrimSpace(input.CellID),
		Baseline:           input.Baseline,
		Solution:           input.Solution,
		Optimization:       input.Optimization,
		OptimizationDomain: input.OptimizationDomain,
	}
}

// NetworkCellExplanationCell identifies the one changed cell and both
// azimuths used in the conditional comparison.
type NetworkCellExplanationCell struct {
	ID                 string  `json:"id"`
	BaselineAzimuthDeg float64 `json:"baseline_azimuth_deg"`
	SelectedAzimuthDeg float64 `json:"selected_azimuth_deg"`
}

// NetworkCellExplanationSide keeps RF measurements and feasibility separate.
// A counterfactual that violates hard constraints remains a valid, inspectable
// side of the comparison.
type NetworkCellExplanationSide struct {
	RawMetrics           OptimizationRawMetrics `json:"raw_metrics"`
	ConstraintsSatisfied bool                   `json:"constraints_satisfied"`
	Violations           []string               `json:"violations,omitempty"`
}

// NetworkCellExplanationDelta uses selected - baseline-revert arithmetic.
// Ratio deltas are retained as ratios; consumers can present them as
// percentage points without losing the underlying value.
type NetworkCellExplanationDelta struct {
	ServedDemandWeight              float64 `json:"served_demand_weight"`
	ResidentialCovered              int     `json:"residential_covered"`
	PropagationReachScore           float64 `json:"propagation_reach_score"`
	PropagationReachRatio           float64 `json:"propagation_reach_ratio"`
	RadioQualityServiceableFraction float64 `json:"radio_quality_serviceable_fraction"`
	OverlapBuildings                int     `json:"overlap_buildings"`
	OverlapRatio                    float64 `json:"overlap_ratio"`
	CoveredUnits                    int     `json:"covered_units"`
}

// NetworkCellExplanationScore is the only priority-sensitive part of the
// response. Raw sides remain reusable when sliders change.
type NetworkCellExplanationScore struct {
	Actual           float64            `json:"actual"`
	Counterfactual   float64            `json:"counterfactual"`
	Delta            float64            `json:"delta"`
	EffectiveWeights map[string]float64 `json:"effective_weights"`
}

type NetworkCellExplanationResponse struct {
	Available          bool                           `json:"available"`
	Unchanged          bool                           `json:"unchanged"`
	RunID              string                         `json:"run_id"`
	SolutionID         string                         `json:"solution_id"`
	Cell               NetworkCellExplanationCell     `json:"cell"`
	Actual             NetworkCellExplanationSide     `json:"actual"`
	Counterfactual     NetworkCellExplanationSide     `json:"counterfactual"`
	Delta              NetworkCellExplanationDelta    `json:"delta"`
	Score              NetworkCellExplanationScore    `json:"score"`
	ObjectiveStatus    OptimizationObjectiveStatusMap `json:"objective_status"`
	OptimizationDomain OptimizationDomainMetadata     `json:"optimization_domain"`
	Limitations        []string                       `json:"limitations"`
}

// NetworkCellExplanationValidationError marks retained-result or current
// priority metadata that cannot be accepted as an explanation request. The
// HTTP layer maps it to a client error without exposing parser or RF details.
type NetworkCellExplanationValidationError struct {
	message string
}

func (err *NetworkCellExplanationValidationError) Error() string {
	if err == nil {
		return "invalid network cell explanation"
	}
	return err.message
}

func newNetworkCellExplanationValidationError(message string) error {
	return &NetworkCellExplanationValidationError{message: message}
}

// NetworkOptimizationRunID identifies RF-affecting state for local result
// reuse. Objective priorities are intentionally excluded; hard constraints
// are included because they change feasibility semantics.
func NetworkOptimizationRunID(req NetworkOptimizationRequest) string {
	normalized := req
	NormalizeNetworkOptimizationRequest(&normalized)
	identity := struct {
		Towers                       []NetworkTowerRequest   `json:"towers"`
		Rays                         int                     `json:"rays"`
		RadiusMeters                 float64                 `json:"radius_m"`
		FrequencyGHz                 float64                 `json:"frequency_ghz"`
		TxPowerDBm                   float64                 `json:"tx_power_dbm"`
		BeamWidthDeg                 float64                 `json:"beam_width"`
		CalibrationOffsetDB          float64                 `json:"calibration_offset_db"`
		Constraints                  OptimizationConstraints `json:"constraints"`
		RadioQualityEnabled          bool                    `json:"radio_quality_enabled"`
		RadioQualityDomainVersion    string                  `json:"radio_quality_domain_version"`
		RadioQualityPolicy           string                  `json:"radio_quality_policy"`
		RadioQualityDomain           string                  `json:"radio_quality_domain_source"`
		RadioQualityHorizon          string                  `json:"radio_quality_horizon_mode"`
		RadioQualitySpacing          float64                 `json:"radio_quality_sample_spacing_m"`
		RadioQualityRSRPThresholdDBm float64                 `json:"radio_quality_rsrp_threshold_dbm"`
		RadioQualitySINRThresholdDB  float64                 `json:"radio_quality_sinr_threshold_db"`
		RadioQualityRSRQThresholdDB  float64                 `json:"radio_quality_rsrq_threshold_db"`
		RadioQualityCoChannelRule    string                  `json:"radio_quality_co_channel_rule"`
		RadioQualityLoadAssumption   string                  `json:"radio_quality_load_assumption"`
	}{
		Towers:                       normalized.Towers,
		Rays:                         normalized.Rays,
		RadiusMeters:                 normalized.RadiusMeters,
		FrequencyGHz:                 normalized.FrequencyGHz,
		TxPowerDBm:                   normalized.TxPowerDBm,
		BeamWidthDeg:                 normalized.BeamWidthDeg,
		CalibrationOffsetDB:          normalized.CalibrationOffsetDB,
		Constraints:                  normalized.Optimization.Constraints,
		RadioQualityEnabled:          optimizationObjectiveEnabled(normalized.Optimization, radioQualityOptimizationObjectiveID),
		RadioQualityDomainVersion:    RadioQualityOptimizationDomainIDVersion,
		RadioQualityPolicy:           "planning-default-v1",
		RadioQualityDomain:           RadioQualityOptimizationDomainSource,
		RadioQualityHorizon:          RadioQualityOptimizationHorizonMode,
		RadioQualitySpacing:          DefaultInterferenceSpacingM,
		RadioQualityRSRPThresholdDBm: InterferenceRSRPThresholdDBm,
		RadioQualitySINRThresholdDB:  InterferenceSINRThresholdDB,
		RadioQualityRSRQThresholdDB:  InterferenceRSRQThresholdDB,
		RadioQualityCoChannelRule:    RadioQualityCoChannelRule,
		RadioQualityLoadAssumption:   RadioQualityLoadAssumption,
	}
	serialized, err := json.Marshal(identity)
	if err != nil {
		return "network-opt-unknown"
	}
	digest := sha256.Sum256(serialized)
	return "network-opt-" + hex.EncodeToString(digest[:12])
}

// ValidateNetworkCellExplanationRequest validates only the serialized
// hand-off shape. RF-specific validation happens again in the core evaluator
// so direct callers receive the same safety guarantees as the HTTP route.
func ValidateNetworkCellExplanationRequest(req NetworkCellExplanationRequest) string {
	if strings.TrimSpace(req.SolutionID) == "" {
		return "solution_id is required"
	}
	if strings.TrimSpace(req.CellID) == "" {
		return "cell_id is required"
	}
	if req.Baseline == nil {
		return "baseline metadata is required for per-cell explanation"
	}
	if req.Solution == nil {
		return "solution metadata is required for per-cell explanation"
	}
	if len(req.Baseline.CellConfigurations) < MinNetworkTowers || len(req.Baseline.CellConfigurations) > MaxNetworkTowers {
		return fmt.Sprintf("baseline must contain between %d and %d cell configurations", MinNetworkTowers, MaxNetworkTowers)
	}
	if len(req.Solution.Towers) != len(req.Baseline.CellConfigurations) {
		return "solution and baseline must contain the same cells"
	}
	return ""
}

// ExplainNetworkCellContext computes one conditional marginal comparison. It
// restores exactly one selected cell to the optimization baseline and keeps
// every other cell at the inspected solution's azimuth. It never runs the
// optimizer or constructs a Pareto frontier.
func ExplainNetworkCellContext(ctx context.Context, request NetworkCellExplanationRequest, buildings *BuildingIndex) (NetworkCellExplanationResponse, error) {
	if validationError := ValidateNetworkCellExplanationRequest(request); validationError != "" {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(validationError)
	}
	config := DefaultOptimizationConfig()
	if request.Optimization != nil {
		config = NormalizeOptimizationConfig(request.Optimization)
	}
	if validationError := ValidateOptimizationConfig(config); validationError != "" {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(validationError)
	}
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}

	selectedRequest, baselineRequest, selectedAzimuths, cell, buildErr := buildNetworkCellExplanationRequests(*request.Baseline, *request.Solution, config, request.CellID)
	if buildErr != nil {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(buildErr.Error())
	}
	if validationError := validateNetworkCellExplanationRFRequest(baselineRequest); validationError != "" {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(validationError)
	}
	if validationError := validateNetworkCellExplanationRFRequest(selectedRequest); validationError != "" {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(validationError)
	}
	prepared, prepareErr := prepareNetworkOptimizationContext(ctx, baselineRequest, buildings)
	if prepareErr != nil {
		return NetworkCellExplanationResponse{}, prepareErr
	}
	if request.OptimizationDomain != nil && !sameOptimizationDomainMetadata(prepared.DomainMetadata, *request.OptimizationDomain) {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError("optimization domain metadata does not match the retained baseline context")
	}
	if _, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability); weightErr != nil {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(weightErr.Error())
	}
	if validationError := validateStoredExplanationDomainMetrics(request.Solution.Stats, prepared, baselineRequest.Rays); validationError != "" {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(validationError)
	}
	canonicalRunID := NetworkOptimizationRunID(baselineRequest)
	if suppliedRunID := strings.TrimSpace(request.RunID); suppliedRunID != "" && suppliedRunID != canonicalRunID {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError("run_id does not match the retained baseline RF state")
	}

	actualStats, scoreErr := scoreNetworkOptimization(request.Solution.Stats, config, prepared.ObjectiveAvailability)
	if scoreErr != nil {
		return NetworkCellExplanationResponse{}, scoreErr
	}
	actualViolations := OptimizationConstraintViolations(request.Solution.Stats, config.Constraints)
	actualStats = actualStats.rounded()
	actualMetrics := explanationMetricsFromStats(actualStats)
	actualSide := NetworkCellExplanationSide{
		RawMetrics:           actualStats.RawMetrics,
		ConstraintsSatisfied: len(actualViolations) == 0,
		Violations:           actualViolations,
	}

	unchanged := normalizeDegrees(cell.BaselineAzimuthDeg) == normalizeDegrees(cell.SelectedAzimuthDeg)
	counterfactualStats := actualStats
	counterfactualViolations := append([]string(nil), actualViolations...)
	if !unchanged {
		counterfactualAzimuths := append([]float64(nil), selectedAzimuths...)
		counterfactualAzimuths[cellIndex(baselineRequest.Towers, cell.ID)] = cell.BaselineAzimuthDeg
		breakdown, evaluationErr := networkCoverageScoreBreakdownPreparedContext(ctx, baselineRequestWithAzimuths(selectedRequest, counterfactualAzimuths), counterfactualAzimuths, buildings, prepared)
		if evaluationErr != nil {
			return NetworkCellExplanationResponse{}, evaluationErr
		}
		counterfactualStats, scoreErr = scoreNetworkOptimization(breakdown, config, prepared.ObjectiveAvailability)
		if scoreErr != nil {
			return NetworkCellExplanationResponse{}, scoreErr
		}
		counterfactualViolations = OptimizationConstraintViolations(counterfactualStats, config.Constraints)
		counterfactualStats = counterfactualStats.rounded()
	}
	counterfactualMetrics := explanationMetricsFromStats(counterfactualStats)
	counterfactualSide := NetworkCellExplanationSide{
		RawMetrics:           counterfactualStats.RawMetrics,
		ConstraintsSatisfied: len(counterfactualViolations) == 0,
		Violations:           counterfactualViolations,
	}

	effectiveWeights, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability)
	if weightErr != nil {
		return NetworkCellExplanationResponse{}, newNetworkCellExplanationValidationError(weightErr.Error())
	}
	return NetworkCellExplanationResponse{
		Available:      true,
		Unchanged:      unchanged,
		RunID:          canonicalRunID,
		SolutionID:     strings.TrimSpace(request.SolutionID),
		Cell:           cell,
		Actual:         actualSide,
		Counterfactual: counterfactualSide,
		Delta:          subtractExplanationMetrics(actualMetrics, counterfactualMetrics),
		Score: NetworkCellExplanationScore{
			Actual:           actualStats.Score,
			Counterfactual:   counterfactualStats.Score,
			Delta:            roundFloat(actualStats.Score-counterfactualStats.Score, 4),
			EffectiveWeights: effectiveWeights,
		},
		ObjectiveStatus:    actualStats.ObjectiveStatus,
		OptimizationDomain: prepared.DomainMetadata,
		Limitations: []string{
			"Conditional marginal comparison: selected configuration versus the same network with this cell reverted to baseline.",
			"This is not causal attribution, an independent cell contribution, or an additive decomposition; cell interactions remain.",
		},
	}, nil
}

func buildNetworkCellExplanationRequests(baseline NetworkOptimizationSolution, solution NetworkParetoSolution, config OptimizationConfig, cellID string) (NetworkOptimizationRequest, NetworkOptimizationRequest, []float64, NetworkCellExplanationCell, error) {
	selectedByID := make(map[string]float64, len(solution.Towers))
	for _, tower := range solution.Towers {
		id := strings.TrimSpace(tower.ID)
		if id == "" {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("solution contains a cell without an id")
		}
		if _, exists := selectedByID[id]; exists {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("solution cell ids must be unique")
		}
		if !finiteExplanationMetric(tower.AzimuthDeg) {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("solution cell %q has an invalid azimuth", id)
		}
		selectedByID[id] = normalizeDegrees(tower.AzimuthDeg)
	}
	baselineIDs := make(map[string]struct{}, len(baseline.CellConfigurations))
	baselineRequest := NetworkOptimizationRequest{
		Rays:                baseline.Parameters.Rays,
		RadiusMeters:        baseline.Parameters.RadiusMeters,
		FrequencyGHz:        baseline.Parameters.FrequencyGHz,
		TxPowerDBm:          baseline.Parameters.TxPowerDBm,
		BeamWidthDeg:        baseline.Parameters.BeamWidthDeg,
		CalibrationOffsetDB: baseline.Parameters.CalibrationOffsetDB,
		Optimization:        config,
	}
	selectedRequest := baselineRequest
	selectedRequest.Towers = make([]NetworkTowerRequest, 0, len(baseline.CellConfigurations))
	baselineRequest.Towers = make([]NetworkTowerRequest, 0, len(baseline.CellConfigurations))
	selectedAzimuths := make([]float64, 0, len(baseline.CellConfigurations))
	cell := NetworkCellExplanationCell{}
	for _, configuration := range baseline.CellConfigurations {
		id := strings.TrimSpace(configuration.ID)
		if validationError := ValidateTowerID(id); validationError != "" {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("baseline cell %q: %s", id, validationError)
		}
		if _, exists := baselineIDs[id]; exists {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("baseline cell ids must be unique")
		}
		baselineIDs[id] = struct{}{}
		if configuration.RFProfile.SchemaVersion != RFProfileSchemaVersion {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("baseline cell %q is missing its resolved RF profile metadata", id)
		}
		if !finiteExplanationMetric(configuration.TowerLon) || !finiteExplanationMetric(configuration.TowerLat) || !finiteExplanationMetric(configuration.AzimuthDeg) {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("baseline cell %q has non-finite coordinates or azimuth", id)
		}
		selectedAzimuth, exists := selectedByID[id]
		if !exists {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("solution is missing baseline cell %q", id)
		}
		baselineAzimuth := normalizeDegrees(configuration.AzimuthDeg)
		baselineTower := NetworkTowerRequest{ID: id, TowerLon: configuration.TowerLon, TowerLat: configuration.TowerLat, AzimuthDeg: baselineAzimuth, RFProfile: configuration.RFProfile}
		selectedTower := baselineTower
		selectedTower.AzimuthDeg = selectedAzimuth
		baselineRequest.Towers = append(baselineRequest.Towers, baselineTower)
		selectedRequest.Towers = append(selectedRequest.Towers, selectedTower)
		selectedAzimuths = append(selectedAzimuths, selectedAzimuth)
		if id == strings.TrimSpace(cellID) {
			cell = NetworkCellExplanationCell{ID: id, BaselineAzimuthDeg: baselineAzimuth, SelectedAzimuthDeg: selectedAzimuth}
		}
	}
	for id := range selectedByID {
		if _, exists := baselineIDs[id]; !exists {
			return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("solution contains unknown cell %q", id)
		}
	}
	if cell.ID == "" {
		return NetworkOptimizationRequest{}, NetworkOptimizationRequest{}, nil, NetworkCellExplanationCell{}, fmt.Errorf("cell_id %q is not present in the selected solution", cellID)
	}
	if len(baselineRequest.Towers) > 0 {
		baselineRequest.RFProfile = baselineRequest.Towers[0].RFProfile
		selectedRequest.RFProfile = selectedRequest.Towers[0].RFProfile
	}
	NormalizeNetworkOptimizationRequest(&baselineRequest)
	NormalizeNetworkOptimizationRequest(&selectedRequest)
	return selectedRequest, baselineRequest, selectedAzimuths, cell, nil
}

func baselineRequestWithAzimuths(request NetworkOptimizationRequest, azimuths []float64) NetworkOptimizationRequest {
	clone := request
	clone.Towers = append([]NetworkTowerRequest(nil), request.Towers...)
	for index := range clone.Towers {
		if index < len(azimuths) {
			clone.Towers[index].AzimuthDeg = normalizeDegrees(azimuths[index])
		}
	}
	return clone
}

func cellIndex(towers []NetworkTowerRequest, id string) int {
	for index, tower := range towers {
		if tower.ID == id {
			return index
		}
	}
	return 0
}

func validateNetworkCellExplanationRFRequest(request NetworkOptimizationRequest) string {
	if request.Rays < MinSimulationRays || request.Rays > MaxSimulationRays {
		return "baseline rays are outside the supported range"
	}
	if validationError := ValidateSimulationFeatureBudget(request.Rays, request.RadiusMeters); validationError != "" {
		return validationError
	}
	if request.RadiusMeters < MinRadiusMeters || request.RadiusMeters > MaxRadiusMeters || math.IsNaN(request.RadiusMeters) || math.IsInf(request.RadiusMeters, 0) {
		return "baseline radius_m is outside the supported range"
	}
	if request.FrequencyGHz <= 0 || request.FrequencyGHz > MaxFrequencyGHz || math.IsNaN(request.FrequencyGHz) || math.IsInf(request.FrequencyGHz, 0) {
		return "baseline frequency_ghz is outside the supported range"
	}
	if request.TxPowerDBm < MinTxPowerDBm || request.TxPowerDBm > MaxTxPowerDBm || math.IsNaN(request.TxPowerDBm) || math.IsInf(request.TxPowerDBm, 0) {
		return "baseline tx_power_dbm is outside the supported range"
	}
	if request.BeamWidthDeg < MinBeamWidthDeg || request.BeamWidthDeg > MaxBeamWidthDeg || math.IsNaN(request.BeamWidthDeg) || math.IsInf(request.BeamWidthDeg, 0) {
		return "baseline beam_width is outside the supported range"
	}
	if request.CalibrationOffsetDB < MinCalibrationOffsetDB || request.CalibrationOffsetDB > MaxCalibrationOffsetDB || math.IsNaN(request.CalibrationOffsetDB) || math.IsInf(request.CalibrationOffsetDB, 0) {
		return "baseline calibration_offset_db is outside the supported range"
	}
	for _, tower := range request.Towers {
		if !finiteExplanationMetric(tower.TowerLon) || !finiteExplanationMetric(tower.TowerLat) || !finiteExplanationMetric(tower.AzimuthDeg) || tower.TowerLon < MinLongitude || tower.TowerLon > MaxLongitude || tower.TowerLat < MinLatitude || tower.TowerLat > MaxLatitude {
			return fmt.Sprintf("baseline cell %q has invalid coordinates", tower.ID)
		}
		if validationError := ValidateCellRFProfile(tower.RFProfile, false); validationError != "" {
			return fmt.Sprintf("baseline cell %q: %s", tower.ID, validationError)
		}
		if validationError := ValidateSimulationFeatureBudget(request.Rays, tower.RFProfile.RadiusMeters); validationError != "" {
			return fmt.Sprintf("baseline cell %q: %s", tower.ID, validationError)
		}
	}
	return ""
}

func sameOptimizationDomainMetadata(left, right OptimizationDomainMetadata) bool {
	if left.Source != right.Source || left.SelectedCellCount != right.SelectedCellCount || left.RadiusPolicy != right.RadiusPolicy ||
		left.RelevantBuildingEntities != right.RelevantBuildingEntities || left.RelevantDemandEntities != right.RelevantDemandEntities ||
		left.RelevantResidentialEntities != right.RelevantResidentialEntities ||
		left.RadioQualityDomainID != right.RadioQualityDomainID ||
		left.RadioQualityDomainDescription != right.RadioQualityDomainDescription ||
		left.RadioQualitySampleCount != right.RadioQualitySampleCount ||
		math.Abs(left.RadioQualitySampleSpacingM-right.RadioQualitySampleSpacingM) > 0.001 ||
		left.InterferenceHorizonMode != right.InterferenceHorizonMode ||
		left.InterferenceHorizonDescription != right.InterferenceHorizonDescription ||
		len(left.EnvelopeRadiiMeters) != len(right.EnvelopeRadiiMeters) {
		return false
	}
	for index := range left.EnvelopeRadiiMeters {
		if math.Abs(left.EnvelopeRadiiMeters[index]-right.EnvelopeRadiiMeters[index]) > 0.001 {
			return false
		}
	}
	return true
}

func validateStoredExplanationDomainMetrics(stats NetworkOptimizationStats, prepared *PreparedNetworkOptimizationContext, rays int) string {
	if prepared == nil {
		return "prepared optimization context is unavailable"
	}
	raw := stats.RawMetrics
	demandDenominator := raw.RelevantDemandWeight
	if demandDenominator == 0 {
		demandDenominator = raw.TotalWeightedDemand
	}
	if !finiteExplanationMetric(demandDenominator) || !finiteExplanationMetric(raw.ServedDemandWeight) || !finiteExplanationMetric(raw.ServedWeightedDemand) {
		return "selected solution demand metrics are not finite"
	}
	if math.Abs(demandDenominator-prepared.TotalRelevantDemandWeight) > 0.01 {
		return "selected solution demand denominator does not match the retained optimization domain"
	}
	residentialDenominator := raw.RelevantResidentialTotal
	if residentialDenominator == 0 {
		residentialDenominator = raw.ResidentialTotal
	}
	if residentialDenominator != prepared.TotalRelevantResidential {
		return "selected solution residential denominator does not match the retained optimization domain"
	}
	if !finiteExplanationMetric(raw.CoverageReachScore) || !finiteExplanationMetric(raw.CoverageReachMaximum) || !finiteExplanationMetric(raw.PropagationReachScore) || !finiteExplanationMetric(raw.PropagationReachMaximum) || !finiteExplanationMetric(raw.OverlapRatio) {
		return "selected solution RF metrics are not finite"
	}
	reachMaximum := raw.PropagationReachMaximum
	if reachMaximum == 0 {
		reachMaximum = raw.CoverageReachMaximum
	}
	wantedReachMaximum := float64(len(prepared.Domain.Envelopes)*rays) * CoverageTieBreakerPerRay
	if prepared.ObjectiveAvailability["coverage"].Available && (reachMaximum <= 0 || math.Abs(reachMaximum-wantedReachMaximum) > 0.01) {
		return "selected solution propagation-reach maximum is missing"
	}
	if prepared.RadioQualityMetadata.Enabled && prepared.RadioQualityMetadata.Available {
		if raw.RadioQualityTotalSamples != prepared.RadioQualityMetadata.SampleCount {
			return "selected solution radio-quality denominator does not match the retained fixed domain"
		}
		if raw.RadioQualityServiceableSamples < 0 || raw.RadioQualityServiceableSamples > raw.RadioQualityTotalSamples ||
			!finiteExplanationMetric(raw.RadioQualityServiceableFraction) || raw.RadioQualityServiceableFraction < 0 || raw.RadioQualityServiceableFraction > 1 {
			return "selected solution radio-quality metrics are outside their valid range"
		}
		if raw.RadioQualityTotalSamples > 0 {
			wantFraction := float64(raw.RadioQualityServiceableSamples) / float64(raw.RadioQualityTotalSamples)
			if math.Abs(raw.RadioQualityServiceableFraction-wantFraction) > 0.00001 {
				return "selected solution radio-quality serviceability is inconsistent with its counts"
			}
		}
	}
	return ""
}

func finiteExplanationMetric(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func explanationMetricsFromStats(stats NetworkOptimizationStats) NetworkCellExplanationDelta {
	raw := stats.RawMetrics
	servedDemand := raw.ServedDemandWeight
	if servedDemand == 0 {
		servedDemand = raw.ServedWeightedDemand
	}
	residentialCovered := raw.ResidentialCovered
	if residentialCovered == 0 {
		residentialCovered = stats.UniqueResidentialBuildings
	}
	reachScore := raw.PropagationReachScore
	if reachScore == 0 {
		reachScore = raw.CoverageReachScore
	}
	reachMaximum := raw.PropagationReachMaximum
	if reachMaximum == 0 {
		reachMaximum = raw.CoverageReachMaximum
	}
	overlapBuildings := raw.OverlapBuildings
	if overlapBuildings == 0 {
		overlapBuildings = stats.OverlapBuildings
	}
	overlapRatio := raw.OverlapRatio
	if overlapRatio == 0 && raw.CoveredUnits > 0 {
		overlapRatio = ratio01(float64(overlapBuildings), float64(raw.CoveredUnits))
	}
	return NetworkCellExplanationDelta{
		ServedDemandWeight:              servedDemand,
		ResidentialCovered:              residentialCovered,
		PropagationReachScore:           reachScore,
		PropagationReachRatio:           ratio01(reachScore, reachMaximum),
		RadioQualityServiceableFraction: clamp01(raw.RadioQualityServiceableFraction),
		OverlapBuildings:                overlapBuildings,
		OverlapRatio:                    overlapRatio,
		CoveredUnits:                    raw.CoveredUnits,
	}
}

func subtractExplanationMetrics(actual, counterfactual NetworkCellExplanationDelta) NetworkCellExplanationDelta {
	return NetworkCellExplanationDelta{
		ServedDemandWeight:              actual.ServedDemandWeight - counterfactual.ServedDemandWeight,
		ResidentialCovered:              actual.ResidentialCovered - counterfactual.ResidentialCovered,
		PropagationReachScore:           actual.PropagationReachScore - counterfactual.PropagationReachScore,
		PropagationReachRatio:           actual.PropagationReachRatio - counterfactual.PropagationReachRatio,
		RadioQualityServiceableFraction: actual.RadioQualityServiceableFraction - counterfactual.RadioQualityServiceableFraction,
		OverlapBuildings:                actual.OverlapBuildings - counterfactual.OverlapBuildings,
		OverlapRatio:                    actual.OverlapRatio - counterfactual.OverlapRatio,
		CoveredUnits:                    actual.CoveredUnits - counterfactual.CoveredUnits,
	}
}
