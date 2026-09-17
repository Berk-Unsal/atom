package raytracer

import (
	"context"
	"errors"
	"fmt"
	"math"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
)

// ReceiverSensitivity is a legacy default-only alias. Production ray
// evaluation uses CellRFProfile.ReceiverSensitivityDBm per cell.
const ReceiverSensitivity = DefaultReceiverSensitivityDBm

// AntennaGainDBi is a legacy default-only alias. Production link budgets use
// CellRFProfile.AntennaGainDBi per cell.
const AntennaGainDBi = DefaultAntennaGainDBi
const SegmentStepMeters = 25.0
const DemandScoreMultiplier = 10000.0
const ResidentialScoreMultiplier = 10000.0
const CoverageTieBreakerPerRay = 100.0
const CoverageTieBreakerMaxMeters = 500.0
const NetworkOverlapPenaltyPerBuilding = 2500.0
const MaxCoverageGapFeatures = 500
const MaxSimulationResponseFeatures = 25000

var ErrSimulationFeatureLimit = errors.New("simulation response feature limit exceeded")

func EstimatedSimulationFeatureCount(rays int, radiusMeters float64) int {
	if rays <= 0 || radiusMeters <= 0 {
		return 0
	}
	maxInt := int(^uint(0) >> 1)
	segmentsPerRayFloat := math.Ceil(radiusMeters / SegmentStepMeters)
	if math.IsNaN(segmentsPerRayFloat) || math.IsInf(segmentsPerRayFloat, 0) || segmentsPerRayFloat > float64(maxInt) {
		return maxInt
	}
	segmentsPerRay := int(segmentsPerRayFloat)
	if segmentsPerRay > 0 && rays > maxInt/segmentsPerRay {
		return maxInt
	}
	return rays * segmentsPerRay
}

func ValidateSimulationFeatureBudget(rays int, radiusMeters float64) string {
	estimated := EstimatedSimulationFeatureCount(rays, radiusMeters)
	if estimated <= MaxSimulationResponseFeatures {
		return ""
	}
	return fmt.Sprintf(
		"rays and radius_m exceed the %d-feature simulation response limit (estimated %d); reduce rays or radius_m",
		MaxSimulationResponseFeatures,
		estimated,
	)
}

type StaticSimulationRequest struct {
	TowerLon            float64       `json:"tower_lon"`
	TowerLat            float64       `json:"tower_lat"`
	Rays                int           `json:"rays"`
	RadiusMeters        float64       `json:"radius_m"`
	FrequencyGHz        float64       `json:"frequency_ghz"`
	TxPowerDBm          float64       `json:"tx_power_dbm"`
	AzimuthDeg          float64       `json:"azimuth"`
	BeamWidthDeg        float64       `json:"beam_width"`
	CalibrationOffsetDB float64       `json:"calibration_offset_db,omitempty"`
	RFProfile           CellRFProfile `json:"rf_profile"`
}

type NetworkTowerRequest struct {
	ID         string        `json:"id"`
	TowerLon   float64       `json:"tower_lon"`
	TowerLat   float64       `json:"tower_lat"`
	AzimuthDeg float64       `json:"azimuth"`
	RFProfile  CellRFProfile `json:"rf_profile"`
}

type NetworkOptimizationRequest struct {
	Towers              []NetworkTowerRequest `json:"towers"`
	Rays                int                   `json:"rays"`
	RadiusMeters        float64               `json:"radius_m"`
	FrequencyGHz        float64               `json:"frequency_ghz"`
	TxPowerDBm          float64               `json:"tx_power_dbm"`
	BeamWidthDeg        float64               `json:"beam_width"`
	CalibrationOffsetDB float64               `json:"calibration_offset_db,omitempty"`
	RFProfile           CellRFProfile         `json:"rf_profile"`
	Optimization        OptimizationConfig    `json:"optimization"`
}

type OptimizationObjective struct {
	ID     string  `json:"id"`
	Weight float64 `json:"weight"`
}

type OptimizationConstraints struct {
	MinCoverageScore              *float64 `json:"min_coverage_score,omitempty"`
	MinUniqueDemandBuildings      *int     `json:"min_unique_demand_buildings,omitempty"`
	MinUniqueResidentialBuildings *int     `json:"min_unique_residential_buildings,omitempty"`
	MaxOverlapBuildings           *int     `json:"max_overlap_buildings,omitempty"`
}

type OptimizationConfig struct {
	Objectives  []OptimizationObjective `json:"objectives"`
	Constraints OptimizationConstraints `json:"constraints"`
}

type RayFeatureCollection struct {
	Type     string       `json:"type"`
	Features []RayFeature `json:"features"`
}

type StaticSimulationResponse struct {
	GeoJSON    RayFeatureCollection `json:"geojson"`
	Stats      SimulationStats      `json:"stats"`
	RFProfile  CellRFProfile        `json:"rf_profile"`
	RFContract RFContractMetadata   `json:"rf_contract"`
}

type SectorAnalysisResponse struct {
	Simulation   StaticSimulationResponse `json:"simulation"`
	CoverageGaps CoverageGapResponse      `json:"coverage_gaps"`
}

type AzimuthOptimizationResponse struct {
	OptimalAzimuth          float64            `json:"optimal_azimuth"`
	CoverageScore           float64            `json:"coverage_score"`
	PropagationReachScore   float64            `json:"propagation_reach_score"`
	DemandScore             float64            `json:"demand_score"`
	ResidentialScore        float64            `json:"residential_score"`
	HitDemandBuildings      int                `json:"hit_demand_buildings"`
	HitResidentialBuildings int                `json:"hit_residential_buildings"`
	DataQuality             string             `json:"data_quality"`
	RFContract              RFContractMetadata `json:"rf_contract"`
}

type NetworkOptimizedTower struct {
	ID             string        `json:"id"`
	OptimalAzimuth float64       `json:"optimal_azimuth"`
	Score          float64       `json:"score"`
	RFProfile      CellRFProfile `json:"rf_profile"`
}

type NetworkOptimizationStats struct {
	NetworkScore               float64                        `json:"network_score"`
	UniqueDemandBuildings      int                            `json:"unique_demand_buildings"`
	UniqueResidentialBuildings int                            `json:"unique_residential_buildings"`
	OverlapBuildings           int                            `json:"overlap_buildings"`
	DemandScore                float64                        `json:"demand_score"`
	ResidentialScore           float64                        `json:"residential_score"`
	CoverageScore              float64                        `json:"coverage_score"`
	OverlapPenalty             float64                        `json:"overlap_penalty"`
	DataQuality                string                         `json:"data_quality"`
	RawMetrics                 OptimizationRawMetrics         `json:"raw_metrics"`
	Objectives                 OptimizationUtilities          `json:"objectives"`
	CompositeScore             float64                        `json:"composite_score"`
	Score                      float64                        `json:"score"`
	ObjectiveBreakdown         OptimizationObjectiveBreakdown `json:"objective_breakdown"`
	ObjectiveStatus            OptimizationObjectiveStatusMap `json:"objective_status,omitempty"`
}

// NetworkOptimizationCellConfiguration is the resolved configuration of one
// selected cell at the boundary of a network optimization execution. Keeping
// this alongside the baseline stats makes the baseline identity independent of
// any later UI re-ranking or project edits.
type NetworkOptimizationCellConfiguration struct {
	ID         string        `json:"id"`
	TowerLon   float64       `json:"tower_lon"`
	TowerLat   float64       `json:"tower_lat"`
	AzimuthDeg float64       `json:"azimuth_deg"`
	RFProfile  CellRFProfile `json:"rf_profile"`
}

// NetworkOptimizationParameters contains request-level RF inputs that are not
// repeated in each resolved cell profile.
type NetworkOptimizationParameters struct {
	Rays                int           `json:"rays"`
	RadiusMeters        float64       `json:"radius_m"`
	FrequencyGHz        float64       `json:"frequency_ghz"`
	TxPowerDBm          float64       `json:"tx_power_dbm"`
	BeamWidthDeg        float64       `json:"beam_width"`
	BandwidthMHz        float64       `json:"bandwidth_mhz,omitempty"`
	LoadFactor          float64       `json:"load_factor,omitempty"`
	ReuseFactor         int           `json:"reuse_factor,omitempty"`
	CalibrationOffsetDB float64       `json:"calibration_offset_db,omitempty"`
	RFProfile           CellRFProfile `json:"rf_profile"`
}

// NetworkOptimizationSolution is a compact, authoritative solution snapshot.
// The baseline is retained by optimize-network; optimized solutions continue
// to use the existing response stats and Pareto frontier records.
type NetworkOptimizationSolution struct {
	CellConfigurations   []NetworkOptimizationCellConfiguration `json:"cell_configurations"`
	Parameters           NetworkOptimizationParameters          `json:"parameters"`
	Stats                NetworkOptimizationStats               `json:"stats"`
	ConstraintsSatisfied bool                                   `json:"constraints_satisfied"`
	Violations           []string                               `json:"violations,omitempty"`
}

type NetworkOptimizationResponse struct {
	OptimizedTowers       []NetworkOptimizedTower      `json:"optimized_towers"`
	Stats                 NetworkOptimizationStats     `json:"stats"`
	OptimizationDomain    OptimizationDomainMetadata   `json:"optimization_domain"`
	Optimization          OptimizationOutcome          `json:"optimization"`
	ParetoFrontier        []NetworkParetoSolution      `json:"pareto_frontier"`
	OptimizationRunID     string                       `json:"optimization_run_id,omitempty"`
	Baseline              *NetworkOptimizationSolution `json:"baseline,omitempty"`
	RequestDefaults       RFRequestDefaults            `json:"request_defaults"`
	EffectiveCellProfiles []EffectiveCellRFProfile     `json:"effective_cell_profiles"`
	RFContract            RFContractMetadata           `json:"rf_contract"`
}

type OptimizationOutcome struct {
	Objectives            []OptimizationObjective        `json:"objectives"`
	ConfiguredPriorities  map[string]float64             `json:"configured_priorities"`
	NormalizedWeights     map[string]float64             `json:"normalized_weights"`
	EffectiveWeights      map[string]float64             `json:"effective_weights"`
	ObjectiveStatus       OptimizationObjectiveStatusMap `json:"objective_status"`
	Constraints           OptimizationConstraints        `json:"constraints"`
	ObjectiveScore        float64                        `json:"objective_score"`
	CompositeScore        float64                        `json:"composite_score"`
	Score                 float64                        `json:"score"`
	RecommendedSolutionID string                         `json:"recommended_solution_id,omitempty"`
	ConstraintsSatisfied  bool                           `json:"constraints_satisfied"`
	Recommended           bool                           `json:"recommended"`
	Violations            []string                       `json:"violations"`
	AdjustedParameters    []string                       `json:"adjusted_parameters"`
}

type ParetoTowerSetting struct {
	ID         string  `json:"id"`
	AzimuthDeg float64 `json:"azimuth_deg"`
}

type NetworkParetoSolution struct {
	ID             string                   `json:"id,omitempty"`
	Towers         []ParetoTowerSetting     `json:"towers"`
	Stats          NetworkOptimizationStats `json:"stats"`
	ObjectiveScore float64                  `json:"objective_score"`
	CompositeScore float64                  `json:"composite_score"`
	Score          float64                  `json:"score"`
	Explanation    string                   `json:"explanation"`
}

type CoverageGapResponse struct {
	GeoJSON    PointFeatureCollection `json:"geojson"`
	Stats      CoverageGapStats       `json:"stats"`
	RFContract RFContractMetadata     `json:"rf_contract"`
}

type CoverageGapStats struct {
	CandidateBuildings          int     `json:"candidate_buildings"`
	ServedBuildings             int     `json:"served_buildings"`
	GapBuildings                int     `json:"gap_buildings"`
	ReturnedGaps                int     `json:"returned_gaps"`
	GapPct                      float64 `json:"gap_pct"`
	TotalGapDemand              float64 `json:"total_gap_demand"`
	WorstRxDBm                  float64 `json:"worst_rx_dbm"`
	ThresholdDBm                float64 `json:"threshold_dbm"`
	BuildingServiceThresholdDBm float64 `json:"building_service_threshold_dbm"`
}

type SimulationStats struct {
	BlockedPct float64 `json:"blocked_pct"`
	AvgRxDBm   float64 `json:"avg_rx_dbm"`
	MinRangeM  float64 `json:"min_range_m"`
	MaxRangeM  float64 `json:"max_range_m"`
}

type RayFeature struct {
	Type       string        `json:"type"`
	Properties RayProperties `json:"properties"`
	Geometry   LineGeometry  `json:"geometry"`
}

type RayProperties struct {
	AngleDeg                  float64            `json:"angle_deg"`
	RayIndex                  int                `json:"ray_index"`
	SegmentIndex              int                `json:"segment_index"`
	SignalDBm                 float64            `json:"signal_dbm"`
	SignalStartDBm            float64            `json:"signal_start_dbm"`
	SignalEndDBm              float64            `json:"signal_end_dbm"`
	PathLossDB                float64            `json:"path_loss_db"`
	WallLossDB                float64            `json:"wall_loss_db"`
	IsBlocked                 bool               `json:"is_blocked"`
	DistanceMeters            float64            `json:"distance_m"`
	SegmentStartM             float64            `json:"segment_start_m"`
	SegmentEndM               float64            `json:"segment_end_m"`
	HitBuildingID             string             `json:"hit_building_id,omitempty"`
	CandidateChecks           int                `json:"candidate_checks"`
	PropagationModelID        string             `json:"propagation_model_id,omitempty"`
	AppliedPropagationModelID string             `json:"applied_propagation_model_id,omitempty"`
	LOSState                  string             `json:"los_state,omitempty"`
	LOSClassifierID           string             `json:"los_classifier_id,omitempty"`
	LOSClassificationBasis    string             `json:"los_classification_basis,omitempty"`
	TerrainStatus             string             `json:"terrain_status,omitempty"`
	LOSClassification         *LOSClassification `json:"los_classification,omitempty"`
	FallbackUsed              bool               `json:"fallback_used,omitempty"`
	ApplicabilityReason       string             `json:"applicability_reason,omitempty"`
}

type LineGeometry struct {
	Type        string      `json:"type"`
	Coordinates [][]float64 `json:"coordinates"`
}

type PointFeatureCollection struct {
	Type     string         `json:"type"`
	Features []PointFeature `json:"features"`
}

type PointFeature struct {
	Type       string        `json:"type"`
	Properties GapProperties `json:"properties"`
	Geometry   PointGeometry `json:"geometry"`
}

type GapProperties struct {
	BuildingID                  string  `json:"building_id"`
	RxDBm                       float64 `json:"rx_dbm"`
	BuildingServiceThresholdDBm float64 `json:"building_service_threshold_dbm"`
	DistanceMeters              float64 `json:"distance_m"`
	DemandWeight                float64 `json:"demand_weight"`
	ResidentialDemand           float64 `json:"residential_demand"`
	DensityScore                float64 `json:"density_score"`
	TotalDemand                 float64 `json:"total_demand"`
	Reason                      string  `json:"reason"`
	Severity                    string  `json:"severity"`
}

type PointGeometry struct {
	Type        string    `json:"type"`
	Coordinates []float64 `json:"coordinates"`
}

func NormalizeStaticSimulationRequest(req *StaticSimulationRequest) {
	if req.Rays == 0 {
		req.Rays = DefaultStaticSimulationRays
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = DefaultRadiusMeters
	}
	if req.FrequencyGHz == 0 {
		req.FrequencyGHz = DefaultFrequencyGHz
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = DefaultTxPowerDBm
	}
	req.AzimuthDeg = normalizeDegrees(req.AzimuthDeg)
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = DefaultBeamWidthDeg
	}
	if req.BeamWidthDeg < MinBeamWidthDeg {
		req.BeamWidthDeg = MinBeamWidthDeg
	}
	if req.BeamWidthDeg > MaxBeamWidthDeg {
		req.BeamWidthDeg = MaxBeamWidthDeg
	}
	if req.RFProfile.SchemaVersion == 0 {
		req.RFProfile = DefaultCellRFProfile(NetworkTechnologyForFrequency(req.FrequencyGHz), req.FrequencyGHz, req.TxPowerDBm, req.RadiusMeters, req.BeamWidthDeg, 0, 0, 0)
	} else {
		req.RFProfile = req.RFProfile.normalized()
		req.RadiusMeters = req.RFProfile.RadiusMeters
		req.FrequencyGHz = req.RFProfile.FrequencyGHz
		req.TxPowerDBm = req.RFProfile.TxPowerDBm
		req.BeamWidthDeg = req.RFProfile.BeamWidthDeg
	}
}

func NormalizeNetworkOptimizationRequest(req *NetworkOptimizationRequest) {
	if req.Rays == 0 {
		req.Rays = DefaultNetworkOptimizationRays
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = DefaultRadiusMeters
	}
	if req.FrequencyGHz == 0 {
		req.FrequencyGHz = DefaultFrequencyGHz
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = DefaultTxPowerDBm
	}
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = DefaultBeamWidthDeg
	}
	if req.BeamWidthDeg < MinBeamWidthDeg {
		req.BeamWidthDeg = MinBeamWidthDeg
	}
	if req.BeamWidthDeg > MaxBeamWidthDeg {
		req.BeamWidthDeg = MaxBeamWidthDeg
	}
	if req.RFProfile.SchemaVersion == 0 {
		req.RFProfile = DefaultCellRFProfile(NetworkTechnologyForFrequency(req.FrequencyGHz), req.FrequencyGHz, req.TxPowerDBm, req.RadiusMeters, req.BeamWidthDeg, 0, 0, 0)
	}
	for index := range req.Towers {
		req.Towers[index].AzimuthDeg = normalizeDegrees(req.Towers[index].AzimuthDeg)
		if req.Towers[index].RFProfile.SchemaVersion == 0 {
			req.Towers[index].RFProfile = req.RFProfile
		} else {
			req.Towers[index].RFProfile = req.Towers[index].RFProfile.normalized()
		}
	}
	req.Optimization = NormalizeOptimizationConfig(&req.Optimization)
}

func SimulateStaticRaysContext(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex) (StaticSimulationResponse, error) {
	NormalizeStaticSimulationRequest(&req)
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	profiles, err := buildBeamCoverageProfilesContext(ctx, origin, req, buildings)
	if err != nil {
		return StaticSimulationResponse{}, err
	}
	defer releaseRayProfileSegments(profiles)
	return staticSimulationResponseFromProfilesContext(ctx, req, profiles)
}

func staticSimulationResponseFromProfilesContext(ctx context.Context, req StaticSimulationRequest, profiles []rayCoverageProfile) (StaticSimulationResponse, error) {
	featureCount := 0
	for index := range profiles {
		if err := ctx.Err(); err != nil {
			return StaticSimulationResponse{}, err
		}
		if len(profiles[index].segments) > MaxSimulationResponseFeatures-featureCount {
			return StaticSimulationResponse{}, ErrSimulationFeatureLimit
		}
		featureCount += len(profiles[index].segments)
	}

	features := make([]RayFeature, 0, featureCount)
	terminals := make([]rayTerminal, len(profiles))
	for index := range profiles {
		if err := ctx.Err(); err != nil {
			return StaticSimulationResponse{}, err
		}
		features = append(features, profiles[index].segments...)
		terminals[index] = profiles[index].terminal
	}

	sort.SliceStable(features, func(i, j int) bool {
		if features[i].Properties.AngleDeg == features[j].Properties.AngleDeg {
			return features[i].Properties.SegmentIndex < features[j].Properties.SegmentIndex
		}
		return features[i].Properties.AngleDeg < features[j].Properties.AngleDeg
	})

	geojson := RayFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
	return StaticSimulationResponse{
		GeoJSON:    geojson,
		Stats:      CalculateSimulationStats(terminals),
		RFProfile:  req.RFProfile,
		RFContract: rfContractForProfile(&req.RFProfile, req.CalibrationOffsetDB),
	}, nil
}

func AnalyzeSectorContext(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex) (SectorAnalysisResponse, error) {
	NormalizeStaticSimulationRequest(&req)
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	profiles, err := buildBeamCoverageProfilesContext(ctx, origin, req, buildings)
	if err != nil {
		return SectorAnalysisResponse{}, err
	}
	defer releaseRayProfileSegments(profiles)
	simulation, err := staticSimulationResponseFromProfilesContext(ctx, req, profiles)
	if err != nil {
		return SectorAnalysisResponse{}, err
	}
	candidates, err := demandCandidatesInBeamContext(ctx, origin, req, buildings)
	if err != nil {
		return SectorAnalysisResponse{}, err
	}
	coverageGaps, err := coverageGapResponseFromProfilesContext(ctx, origin, req, candidates, profiles)
	if err != nil {
		return SectorAnalysisResponse{}, err
	}
	return SectorAnalysisResponse{Simulation: simulation, CoverageGaps: coverageGaps}, nil
}

func OptimizeAzimuthContext(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex) (AzimuthOptimizationResponse, error) {
	NormalizeStaticSimulationRequest(&req)
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}

	type sweepResult struct {
		azimuth   float64
		breakdown CoverageScoreBreakdown
	}

	candidateCount := 36
	results := make([]sweepResult, candidateCount)
	jobs := make(chan int)
	workerCount := runtime.NumCPU()
	if workerCount > 4 {
		workerCount = 4
	}
	if workerCount > candidateCount {
		workerCount = candidateCount
	}
	if workerCount < 1 {
		workerCount = 1
	}

	var waitGroup sync.WaitGroup
	waitGroup.Add(workerCount)
	for worker := 0; worker < workerCount; worker++ {
		go func() {
			defer waitGroup.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case index, ok := <-jobs:
					if !ok {
						return
					}
					testAzimuth := float64(index * 10)
					testReq := req
					testReq.AzimuthDeg = testAzimuth
					breakdown, err := CoverageAreaScoreBreakdownContext(ctx, origin, testReq, buildings)
					if err != nil {
						return
					}
					results[index] = sweepResult{
						azimuth:   testAzimuth,
						breakdown: breakdown,
					}
				}
			}
		}()
	}

	for index := 0; index < candidateCount; index++ {
		select {
		case <-ctx.Done():
			close(jobs)
			waitGroup.Wait()
			return AzimuthOptimizationResponse{}, ctx.Err()
		case jobs <- index:
		}
	}
	close(jobs)
	waitGroup.Wait()
	if err := ctx.Err(); err != nil {
		return AzimuthOptimizationResponse{}, err
	}

	best := results[0]
	for _, result := range results[1:] {
		if result.breakdown.TotalScore > best.breakdown.TotalScore {
			best = result
		}
	}
	demandSummary := buildings.DemandSummary("")
	return AzimuthOptimizationResponse{
		OptimalAzimuth:          best.azimuth,
		CoverageScore:           math.Round(best.breakdown.CoverageScore*10) / 10,
		PropagationReachScore:   math.Round(best.breakdown.CoverageScore*10) / 10,
		DemandScore:             math.Round(best.breakdown.DemandScore*10) / 10,
		ResidentialScore:        math.Round(best.breakdown.ResidentialScore*10) / 10,
		HitDemandBuildings:      best.breakdown.HitDemandBuildings,
		HitResidentialBuildings: best.breakdown.HitResidentialBuildings,
		DataQuality:             demandSummary.DataQuality,
		RFContract:              rfContractForProfile(&req.RFProfile, req.CalibrationOffsetDB),
	}, nil
}

func OptimizeNetworkContext(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex) (NetworkOptimizationResponse, error) {
	NormalizeNetworkOptimizationRequest(&req)
	config := req.Optimization
	if validationError := ValidateOptimizationConfig(config); validationError != "" {
		return NetworkOptimizationResponse{}, fmt.Errorf("%s", validationError)
	}
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}
	prepared, prepareErr := prepareNetworkOptimizationContext(ctx, req, buildings)
	if prepareErr != nil {
		return NetworkOptimizationResponse{}, prepareErr
	}
	if _, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability); weightErr != nil {
		return NetworkOptimizationResponse{}, weightErr
	}
	azimuths := make([]float64, len(req.Towers))
	for index, tower := range req.Towers {
		azimuths[index] = normalizeDegrees(tower.AzimuthDeg)
	}
	baselineAzimuths := append([]float64(nil), azimuths...)

	evaluated := make([]networkOptimizationCandidate, 0, len(req.Towers)*72+1)
	baselineBreakdown, err := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
	if err != nil {
		return NetworkOptimizationResponse{}, err
	}
	evaluated = append(evaluated, networkOptimizationCandidate{Azimuths: append([]float64(nil), azimuths...), Stats: baselineBreakdown})
	for pass := 0; pass < 2; pass++ {
		for towerIndex := range req.Towers {
			bestAzimuth := azimuths[towerIndex]
			bestScore := math.Inf(-1)
			bestFeasible := false
			for candidate := 0; candidate < 36; candidate++ {
				if err := ctx.Err(); err != nil {
					return NetworkOptimizationResponse{}, err
				}
				testAzimuths := append([]float64(nil), azimuths...)
				testAzimuths[towerIndex] = float64(candidate * 10)
				breakdown, err := networkCoverageScoreBreakdownPreparedContext(ctx, req, testAzimuths, buildings, prepared)
				if err != nil {
					return NetworkOptimizationResponse{}, err
				}
				evaluated = append(evaluated, networkOptimizationCandidate{Azimuths: append([]float64(nil), testAzimuths...), Stats: breakdown})
				score := optimizationObjectiveScoreWithAvailability(breakdown, config, prepared.ObjectiveAvailability)
				feasible := len(OptimizationConstraintViolations(breakdown, config.Constraints)) == 0
				if (feasible && (!bestFeasible || score > bestScore)) || (!bestFeasible && !feasible && score > bestScore) {
					bestScore = score
					bestAzimuth = testAzimuths[towerIndex]
					bestFeasible = feasible
				}
			}
			azimuths[towerIndex] = bestAzimuth
		}
	}

	breakdown, err := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
	if err != nil {
		return NetworkOptimizationResponse{}, err
	}
	evaluated = append(evaluated, networkOptimizationCandidate{Azimuths: append([]float64(nil), azimuths...), Stats: breakdown})
	finalStats, scoreErr := scoreNetworkOptimization(breakdown, config, prepared.ObjectiveAvailability)
	if scoreErr != nil {
		return NetworkOptimizationResponse{}, scoreErr
	}
	baselineStats, scoreErr := scoreNetworkOptimization(baselineBreakdown, config, prepared.ObjectiveAvailability)
	if scoreErr != nil {
		return NetworkOptimizationResponse{}, scoreErr
	}
	frontier := networkParetoFrontier(evaluated, req.Towers, config, prepared.ObjectiveAvailability)
	recommendedAzimuths := []float64(nil)
	recommendedStats := finalStats
	recommended := len(frontier) > 0
	recommendedSolutionID := ""
	if recommended {
		recommendedAzimuths = azimuthsForParetoSolution(frontier[0], req.Towers)
		recommendedSolutionID = frontier[0].ID
		if candidateStats, found := networkCandidateStats(evaluated, recommendedAzimuths); found {
			recommendedStats, scoreErr = scoreNetworkOptimization(candidateStats, config, prepared.ObjectiveAvailability)
			if scoreErr != nil {
				return NetworkOptimizationResponse{}, scoreErr
			}
		}
	}
	demandSummary := buildings.DemandSummary("")
	baselineStats.DataQuality = demandSummary.DataQuality
	recommendedStats.DataQuality = demandSummary.DataQuality
	baselineViolations := OptimizationConstraintViolations(baselineStats, config.Constraints)
	violations := OptimizationConstraintViolations(recommendedStats, config.Constraints)
	normalizedWeights, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability)
	if weightErr != nil {
		return NetworkOptimizationResponse{}, weightErr
	}
	configuredPriorities := configuredOptimizationPriorities(config.Objectives)
	optimized, optimizedErr := optimizedTowerResults(ctx, req, recommendedAzimuths, buildings)
	if optimizedErr != nil {
		return NetworkOptimizationResponse{}, optimizedErr
	}
	responseAzimuths := append([]float64(nil), azimuths...)
	if len(recommendedAzimuths) == len(req.Towers) {
		responseAzimuths = recommendedAzimuths
	}
	return NetworkOptimizationResponse{
		OptimizedTowers:       optimized,
		Stats:                 recommendedStats.rounded(),
		OptimizationDomain:    prepared.DomainMetadata,
		OptimizationRunID:     NetworkOptimizationRunID(req),
		RequestDefaults:       networkRequestDefaults(req),
		EffectiveCellProfiles: effectiveCellRFProfiles(req, responseAzimuths),
		RFContract:            rfContractForProfile(&req.RFProfile, req.CalibrationOffsetDB),
		Baseline: &NetworkOptimizationSolution{
			CellConfigurations:   networkOptimizationCellConfigurations(req, baselineAzimuths),
			Parameters:           networkOptimizationParameters(req),
			Stats:                baselineStats.rounded(),
			ConstraintsSatisfied: len(baselineViolations) == 0,
			Violations:           baselineViolations,
		},
		Optimization: OptimizationOutcome{
			Objectives: config.Objectives, ConfiguredPriorities: configuredPriorities, NormalizedWeights: normalizedWeights, EffectiveWeights: normalizedWeights,
			ObjectiveStatus: recommendedStats.ObjectiveStatus, Constraints: config.Constraints,
			ObjectiveScore: math.Round(LegacyOptimizationObjectiveScore(recommendedStats, config)*10) / 10,
			CompositeScore: roundFloat(recommendedStats.CompositeScore, 6), Score: roundFloat(recommendedStats.Score, 4),
			RecommendedSolutionID: recommendedSolutionID,
			ConstraintsSatisfied:  len(violations) == 0, Recommended: recommended, Violations: violations,
			AdjustedParameters: []string{"azimuth"},
		},
		ParetoFrontier: frontier,
	}, nil
}

func EvaluateNetworkContext(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex) (NetworkOptimizationResponse, error) {
	NormalizeNetworkOptimizationRequest(&req)
	config := req.Optimization
	if validationError := ValidateOptimizationConfig(config); validationError != "" {
		return NetworkOptimizationResponse{}, fmt.Errorf("%s", validationError)
	}
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}
	prepared, prepareErr := prepareNetworkOptimizationContext(ctx, req, buildings)
	if prepareErr != nil {
		return NetworkOptimizationResponse{}, prepareErr
	}
	if _, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability); weightErr != nil {
		return NetworkOptimizationResponse{}, weightErr
	}
	azimuths := make([]float64, len(req.Towers))
	for index, tower := range req.Towers {
		azimuths[index] = normalizeDegrees(tower.AzimuthDeg)
	}

	breakdown, err := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
	if err != nil {
		return NetworkOptimizationResponse{}, err
	}
	scoredStats, scoreErr := scoreNetworkOptimization(breakdown, config, prepared.ObjectiveAvailability)
	if scoreErr != nil {
		return NetworkOptimizationResponse{}, scoreErr
	}
	demandSummary := buildings.DemandSummary("")
	scoredStats.DataQuality = demandSummary.DataQuality
	violations := OptimizationConstraintViolations(scoredStats, config.Constraints)
	candidate := networkOptimizationCandidate{Azimuths: azimuths, Stats: breakdown}
	frontier := networkParetoFrontier([]networkOptimizationCandidate{candidate}, req.Towers, config, prepared.ObjectiveAvailability)
	normalizedWeights, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability)
	if weightErr != nil {
		return NetworkOptimizationResponse{}, weightErr
	}
	configuredPriorities := configuredOptimizationPriorities(config.Objectives)
	optimized, optimizedErr := optimizedTowerResults(ctx, req, azimuths, buildings)
	if optimizedErr != nil {
		return NetworkOptimizationResponse{}, optimizedErr
	}
	return NetworkOptimizationResponse{
		OptimizedTowers:       optimized,
		Stats:                 scoredStats.rounded(),
		OptimizationDomain:    prepared.DomainMetadata,
		RequestDefaults:       networkRequestDefaults(req),
		EffectiveCellProfiles: effectiveCellRFProfiles(req, azimuths),
		RFContract:            rfContractForProfile(&req.RFProfile, req.CalibrationOffsetDB),
		Optimization: OptimizationOutcome{
			Objectives: config.Objectives, ConfiguredPriorities: configuredPriorities, NormalizedWeights: normalizedWeights, EffectiveWeights: normalizedWeights,
			ObjectiveStatus: scoredStats.ObjectiveStatus, Constraints: config.Constraints,
			ObjectiveScore: math.Round(LegacyOptimizationObjectiveScore(scoredStats, config)*10) / 10,
			CompositeScore: roundFloat(scoredStats.CompositeScore, 6), Score: roundFloat(scoredStats.Score, 4),
			ConstraintsSatisfied: len(violations) == 0, Recommended: false, Violations: violations,
			AdjustedParameters: []string{},
		},
		ParetoFrontier: frontier,
	}, nil
}

func optimizedTowerResults(ctx context.Context, req NetworkOptimizationRequest, azimuths []float64, buildings *BuildingIndex) ([]NetworkOptimizedTower, error) {
	if len(azimuths) == 0 {
		return []NetworkOptimizedTower{}, nil
	}
	optimized := make([]NetworkOptimizedTower, 0, len(req.Towers))
	for index, tower := range req.Towers {
		if index >= len(azimuths) {
			return []NetworkOptimizedTower{}, nil
		}
		simReq := networkTowerToStaticRequest(req, tower, azimuths[index])
		towerBreakdown, scoreErr := CoverageAreaScoreBreakdownContext(ctx, Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, simReq, buildings)
		if scoreErr != nil {
			return nil, scoreErr
		}
		optimized = append(optimized, NetworkOptimizedTower{
			ID:             tower.ID,
			OptimalAzimuth: normalizeDegrees(azimuths[index]),
			Score:          math.Round(towerBreakdown.TotalScore*10) / 10,
			RFProfile:      tower.RFProfile,
		})
	}
	return optimized, nil
}

func networkOptimizationParameters(req NetworkOptimizationRequest) NetworkOptimizationParameters {
	return NetworkOptimizationParameters{
		Rays:                req.Rays,
		RadiusMeters:        req.RadiusMeters,
		FrequencyGHz:        req.FrequencyGHz,
		TxPowerDBm:          req.TxPowerDBm,
		BeamWidthDeg:        req.BeamWidthDeg,
		BandwidthMHz:        req.RFProfile.BandwidthMHz,
		LoadFactor:          req.RFProfile.LoadFactor,
		ReuseFactor:         req.RFProfile.ReuseFactor,
		CalibrationOffsetDB: req.CalibrationOffsetDB,
		RFProfile:           req.RFProfile,
	}
}

func networkOptimizationCellConfigurations(req NetworkOptimizationRequest, azimuths []float64) []NetworkOptimizationCellConfiguration {
	configurations := make([]NetworkOptimizationCellConfiguration, 0, len(req.Towers))
	for index, tower := range req.Towers {
		azimuth := tower.AzimuthDeg
		if index < len(azimuths) {
			azimuth = azimuths[index]
		}
		resolved := networkTowerToStaticRequest(req, tower, azimuth)
		configurations = append(configurations, NetworkOptimizationCellConfiguration{
			ID:         tower.ID,
			TowerLon:   tower.TowerLon,
			TowerLat:   tower.TowerLat,
			AzimuthDeg: normalizeDegrees(azimuth),
			RFProfile:  resolved.RFProfile,
		})
	}
	return configurations
}

func networkCandidateStats(candidates []networkOptimizationCandidate, azimuths []float64) (NetworkOptimizationStats, bool) {
	key := azimuthKey(azimuths)
	for _, candidate := range candidates {
		if azimuthKey(candidate.Azimuths) == key {
			return candidate.Stats, true
		}
	}
	return NetworkOptimizationStats{}, false
}

func azimuthsForParetoSolution(solution NetworkParetoSolution, towers []NetworkTowerRequest) []float64 {
	byID := make(map[string]float64, len(solution.Towers))
	for _, setting := range solution.Towers {
		byID[setting.ID] = setting.AzimuthDeg
	}
	azimuths := make([]float64, 0, len(towers))
	for _, tower := range towers {
		azimuth, ok := byID[tower.ID]
		if !ok {
			return nil
		}
		azimuths = append(azimuths, normalizeDegrees(azimuth))
	}
	return azimuths
}

func NetworkCoverageScoreBreakdownContext(ctx context.Context, req NetworkOptimizationRequest, azimuths []float64, buildings *BuildingIndex) (NetworkOptimizationStats, error) {
	NormalizeNetworkOptimizationRequest(&req)
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return NetworkOptimizationStats{}, err
	}
	return networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
}

func networkCoverageScoreBreakdownPreparedContext(ctx context.Context, req NetworkOptimizationRequest, azimuths []float64, buildings *BuildingIndex, prepared *PreparedNetworkOptimizationContext) (NetworkOptimizationStats, error) {
	stats := NetworkOptimizationStats{}
	if prepared == nil {
		return stats, nil
	}

	servedCounts := make(map[string]int)
	bestRxByBuilding := make(map[string]float64)
	for index, tower := range req.Towers {
		if err := ctx.Err(); err != nil {
			return NetworkOptimizationStats{}, err
		}
		azimuth := tower.AzimuthDeg
		if index < len(azimuths) {
			azimuth = azimuths[index]
		}
		simReq := networkTowerToStaticRequest(req, tower, azimuth)
		origin := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		towerBreakdown, err := CoverageAreaScoreBreakdownContext(ctx, origin, simReq, buildings)
		if err != nil {
			return NetworkOptimizationStats{}, err
		}
		stats.CoverageScore += towerBreakdown.CoverageScore
		coverageMap, err := BuildingCoverageMapContext(ctx, origin, simReq, buildings)
		if err != nil {
			return NetworkOptimizationStats{}, err
		}
		coverageIndex := 0
		for buildingID, rx := range coverageMap {
			if coverageIndex%64 == 0 {
				if err := ctx.Err(); err != nil {
					return NetworkOptimizationStats{}, err
				}
			}
			coverageIndex++
			if rx <= BuildingServiceThresholdDBm {
				continue
			}
			if _, relevant := prepared.RelevantBuildings[buildingID]; !relevant {
				continue
			}
			servedCounts[buildingID]++
			if existing, ok := bestRxByBuilding[buildingID]; !ok || rx > existing {
				bestRxByBuilding[buildingID] = rx
			}
		}
	}

	coveredBuildingIDs := make([]string, 0, len(bestRxByBuilding))
	for buildingID := range bestRxByBuilding {
		coveredBuildingIDs = append(coveredBuildingIDs, buildingID)
	}
	sort.Strings(coveredBuildingIDs)
	for buildingIndex, buildingID := range coveredBuildingIDs {
		if buildingIndex%64 == 0 {
			if err := ctx.Err(); err != nil {
				return NetworkOptimizationStats{}, err
			}
		}
		building := prepared.RelevantBuildings[buildingID]
		if building == nil {
			continue
		}
		if _, relevant := prepared.RelevantDemandBuildings[buildingID]; relevant {
			stats.UniqueDemandBuildings++
			stats.DemandScore += building.DemandWeight * DemandScoreMultiplier
		}
		if _, relevant := prepared.RelevantResidentialBuildings[buildingID]; relevant {
			stats.UniqueResidentialBuildings++
			stats.ResidentialScore += building.ResidentialDemand * ResidentialScoreMultiplier
		}
		if servedCounts[buildingID] > 1 {
			stats.OverlapBuildings++
		}
	}
	stats.OverlapPenalty = float64(stats.OverlapBuildings) * NetworkOverlapPenaltyPerBuilding
	stats.NetworkScore = stats.DemandScore + stats.ResidentialScore + stats.CoverageScore - stats.OverlapPenalty
	coveredUnits := len(coveredBuildingIDs)
	overlapRatio := ratio01(float64(stats.OverlapBuildings), float64(coveredUnits))
	stats.RawMetrics = OptimizationRawMetrics{
		ServedWeightedDemand:     stats.DemandScore / DemandScoreMultiplier,
		ServedDemandWeight:       stats.DemandScore / DemandScoreMultiplier,
		TotalWeightedDemand:      prepared.TotalRelevantDemandWeight,
		RelevantDemandWeight:     prepared.TotalRelevantDemandWeight,
		ResidentialCovered:       stats.UniqueResidentialBuildings,
		ResidentialTotal:         prepared.TotalRelevantResidential,
		RelevantResidentialTotal: prepared.TotalRelevantResidential,
		CoverageReachScore:       stats.CoverageScore,
		CoverageReachMaximum:     float64(len(req.Towers)*req.Rays) * CoverageTieBreakerPerRay,
		PropagationReachScore:    stats.CoverageScore,
		PropagationReachMaximum:  float64(len(req.Towers)*req.Rays) * CoverageTieBreakerPerRay,
		CoveredUnits:             coveredUnits,
		OverlapBuildings:         stats.OverlapBuildings,
		OverlapRatio:             overlapRatio,
	}
	return stats, nil
}

func networkTowerToStaticRequest(req NetworkOptimizationRequest, tower NetworkTowerRequest, azimuth float64) StaticSimulationRequest {
	profile := tower.RFProfile
	if profile.SchemaVersion == 0 {
		profile = req.RFProfile
		if profile.SchemaVersion == 0 {
			profile = DefaultCellRFProfile(NetworkTechnologyForFrequency(req.FrequencyGHz), req.FrequencyGHz, req.TxPowerDBm, req.RadiusMeters, req.BeamWidthDeg, 0, 0, 0)
		}
	}
	return StaticSimulationRequest{
		TowerLon:            tower.TowerLon,
		TowerLat:            tower.TowerLat,
		Rays:                req.Rays,
		RadiusMeters:        profile.RadiusMeters,
		FrequencyGHz:        profile.FrequencyGHz,
		TxPowerDBm:          profile.TxPowerDBm,
		AzimuthDeg:          normalizeDegrees(azimuth),
		BeamWidthDeg:        profile.BeamWidthDeg,
		CalibrationOffsetDB: req.CalibrationOffsetDB,
		RFProfile:           profile,
	}
}

func (stats NetworkOptimizationStats) rounded() NetworkOptimizationStats {
	stats.NetworkScore = math.Round(stats.NetworkScore*10) / 10
	stats.DemandScore = math.Round(stats.DemandScore*10) / 10
	stats.ResidentialScore = math.Round(stats.ResidentialScore*10) / 10
	stats.CoverageScore = math.Round(stats.CoverageScore*10) / 10
	stats.OverlapPenalty = math.Round(stats.OverlapPenalty*10) / 10
	stats.RawMetrics.ServedWeightedDemand = roundFloat(stats.RawMetrics.ServedWeightedDemand, 4)
	stats.RawMetrics.ServedDemandWeight = roundFloat(stats.RawMetrics.ServedDemandWeight, 4)
	stats.RawMetrics.TotalWeightedDemand = roundFloat(stats.RawMetrics.TotalWeightedDemand, 4)
	stats.RawMetrics.RelevantDemandWeight = roundFloat(stats.RawMetrics.RelevantDemandWeight, 4)
	stats.RawMetrics.CoverageReachScore = roundFloat(stats.RawMetrics.CoverageReachScore, 4)
	stats.RawMetrics.CoverageReachMaximum = roundFloat(stats.RawMetrics.CoverageReachMaximum, 4)
	stats.RawMetrics.PropagationReachScore = roundFloat(stats.RawMetrics.PropagationReachScore, 4)
	stats.RawMetrics.PropagationReachMaximum = roundFloat(stats.RawMetrics.PropagationReachMaximum, 4)
	stats.RawMetrics.OverlapRatio = roundFloat(stats.RawMetrics.OverlapRatio, 6)
	stats.CompositeScore = roundFloat(stats.CompositeScore, 6)
	stats.Score = roundFloat(stats.Score, 4)
	stats.Objectives.Demand = roundFloat(stats.Objectives.Demand, 6)
	stats.Objectives.Residential = roundFloat(stats.Objectives.Residential, 6)
	stats.Objectives.Coverage = roundFloat(stats.Objectives.Coverage, 6)
	stats.Objectives.Overlap = roundFloat(stats.Objectives.Overlap, 6)
	stats.ObjectiveBreakdown = roundObjectiveBreakdown(stats.ObjectiveBreakdown)
	stats.ObjectiveStatus = roundObjectiveStatus(stats.ObjectiveStatus)
	return stats
}

func FindCoverageGapsContext(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex) (CoverageGapResponse, error) {
	NormalizeStaticSimulationRequest(&req)
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	profiles, err := buildBeamCoverageProfilesContext(ctx, origin, req, buildings)
	if err != nil {
		return CoverageGapResponse{}, err
	}
	defer releaseRayProfileSegments(profiles)
	candidates, err := demandCandidatesInBeamContext(ctx, origin, req, buildings)
	if err != nil {
		return CoverageGapResponse{}, err
	}
	return coverageGapResponseFromProfilesContext(ctx, origin, req, candidates, profiles)
}

func coverageGapResponseFromProfilesContext(ctx context.Context, origin Point, req StaticSimulationRequest, candidates []*BuildingFootprint, profiles []rayCoverageProfile) (CoverageGapResponse, error) {
	coverageMap, err := buildingCoverageMapFromProfilesContext(ctx, profiles)
	if err != nil {
		return CoverageGapResponse{}, err
	}
	gaps := make([]PointFeature, 0, len(candidates))
	stats := CoverageGapStats{
		CandidateBuildings:          len(candidates),
		ThresholdDBm:                BuildingServiceThresholdDBm,
		BuildingServiceThresholdDBm: BuildingServiceThresholdDBm,
		WorstRxDBm:                  math.Inf(1),
	}

	for index, building := range candidates {
		if index%64 == 0 {
			if err := ctx.Err(); err != nil {
				return CoverageGapResponse{}, err
			}
		}
		centroid, ok := PolygonCentroid(building.Vertices)
		if !ok {
			continue
		}
		distance := ApproxDistanceMeters(origin, centroid)
		rx, hasCoverage := coverageMap[building.ID]
		if beamRx, ok := interpolatedBeamRxAtPoint(origin, centroid, profiles); ok {
			if !hasCoverage || beamRx > rx {
				rx = beamRx
				hasCoverage = true
			}
		}
		if !hasCoverage {
			rx = req.RFProfile.ReceiverSensitivityDBm
		}
		totalDemand := building.DemandWeight + building.ResidentialDemand
		if hasCoverage && rx > BuildingServiceThresholdDBm {
			stats.ServedBuildings++
			continue
		}

		stats.GapBuildings++
		stats.TotalGapDemand += totalDemand
		stats.WorstRxDBm = math.Min(stats.WorstRxDBm, rx)
		gaps = append(gaps, makeCoverageGapFeature(building, centroid, distance, rx, BuildingServiceThresholdDBm))
	}

	sort.SliceStable(gaps, func(i, j int) bool {
		left := gaps[i].Properties
		right := gaps[j].Properties
		if left.TotalDemand == right.TotalDemand {
			return left.RxDBm < right.RxDBm
		}
		return left.TotalDemand > right.TotalDemand
	})
	if len(gaps) > MaxCoverageGapFeatures {
		gaps = gaps[:MaxCoverageGapFeatures]
	}

	stats.ReturnedGaps = len(gaps)
	if stats.CandidateBuildings > 0 {
		stats.GapPct = math.Round((float64(stats.GapBuildings)/float64(stats.CandidateBuildings))*1000) / 10
	}
	if math.IsInf(stats.WorstRxDBm, 1) {
		stats.WorstRxDBm = 0
	} else {
		stats.WorstRxDBm = math.Round(stats.WorstRxDBm*10) / 10
	}
	stats.TotalGapDemand = math.Round(stats.TotalGapDemand*10) / 10

	return CoverageGapResponse{
		GeoJSON: PointFeatureCollection{
			Type:     "FeatureCollection",
			Features: gaps,
		},
		Stats:      stats,
		RFContract: rfContractForProfile(&req.RFProfile, req.CalibrationOffsetDB),
	}, nil
}

type rayCoverageProfile struct {
	angle    float64
	segments []RayFeature
	terminal rayTerminal
}

type nearbyBeamSample struct {
	delta float64
	rx    float64
}

type simulationFeatureBudget struct {
	limit int64
	used  atomic.Int64
}

func newSimulationFeatureBudget(limit int) *simulationFeatureBudget {
	return &simulationFeatureBudget{limit: int64(limit)}
}

func (budget *simulationFeatureBudget) reserve() error {
	if budget == nil {
		return nil
	}
	if budget.used.Add(1) > budget.limit {
		return ErrSimulationFeatureLimit
	}
	return nil
}

func BuildingCoverageMapContext(ctx context.Context, origin Point, req StaticSimulationRequest, buildings *BuildingIndex) (map[string]float64, error) {
	NormalizeStaticSimulationRequest(&req)
	profiles, err := buildBeamCoverageProfilesContext(ctx, origin, req, buildings)
	if err != nil {
		return nil, err
	}
	defer releaseRayProfileSegments(profiles)
	return buildingCoverageMapFromProfilesContext(ctx, profiles)
}

func releaseRayProfileSegments(profiles []rayCoverageProfile) {
	for index := range profiles {
		profiles[index].segments = nil
	}
}

func buildBeamCoverageProfilesContext(ctx context.Context, origin Point, req StaticSimulationRequest, buildings *BuildingIndex) ([]rayCoverageProfile, error) {
	if validationError := ValidateSimulationFeatureBudget(req.Rays, req.RadiusMeters); validationError != "" {
		return nil, fmt.Errorf("%w: %s", ErrSimulationFeatureLimit, validationError)
	}

	workCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	profiles := make([]rayCoverageProfile, req.Rays)
	featureBudget := newSimulationFeatureBudget(MaxSimulationResponseFeatures)
	workerCount := runtime.NumCPU()
	if workerCount > 4 {
		workerCount = 4
	}
	if req.Rays < workerCount {
		workerCount = req.Rays
	}
	if workerCount < 1 {
		workerCount = 1
	}

	jobs := make(chan int)
	workerErrors := make(chan error, 1)
	var waitGroup sync.WaitGroup
	waitGroup.Add(workerCount)
	for worker := 0; worker < workerCount; worker++ {
		go func() {
			defer waitGroup.Done()
			for {
				select {
				case <-workCtx.Done():
					return
				case index, ok := <-jobs:
					if !ok {
						return
					}
					angle := BeamAngleForIndex(req.RFProfile.EffectiveAzimuth(req.AzimuthDeg), req.RFProfile.EffectiveBeamWidthDeg(), req.Rays, index)
					segments, terminal, err := simulateSegmentedRayWithBudgetContext(workCtx, origin, index, angle, req, buildings, featureBudget)
					if err != nil {
						select {
						case workerErrors <- err:
						default:
						}
						cancel()
						return
					}
					profiles[index] = rayCoverageProfile{angle: angle, segments: segments, terminal: terminal}
				}
			}
		}()
	}
	for index := 0; index < req.Rays; index++ {
		select {
		case <-workCtx.Done():
			close(jobs)
			waitGroup.Wait()
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			select {
			case err := <-workerErrors:
				return nil, err
			default:
				return nil, workCtx.Err()
			}
		case jobs <- index:
		}
	}
	close(jobs)
	waitGroup.Wait()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	select {
	case err := <-workerErrors:
		return nil, err
	default:
	}
	return profiles, nil
}

func buildingCoverageMapFromProfiles(profiles []rayCoverageProfile) map[string]float64 {
	coverage, _ := buildingCoverageMapFromProfilesContext(context.Background(), profiles)
	return coverage
}

func buildingCoverageMapFromProfilesContext(ctx context.Context, profiles []rayCoverageProfile) (map[string]float64, error) {
	coverage := make(map[string]float64)
	for profileIndex, profile := range profiles {
		if profileIndex%16 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		buildingIndex := 0
		for buildingID, rx := range profile.terminal.buildingCoverage {
			if buildingIndex%64 == 0 {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
			}
			buildingIndex++
			recordBuildingCoverageValue(coverage, buildingID, rx)
		}
	}
	return coverage, nil
}

func interpolatedBeamRxAtPoint(origin Point, target Point, profiles []rayCoverageProfile) (float64, bool) {
	if len(profiles) == 0 {
		return 0, false
	}
	targetAngle := BearingDegrees(origin, target)
	targetDistance := ApproxDistanceMeters(origin, target)

	nearest := make([]nearbyBeamSample, 0, 2)
	for _, profile := range profiles {
		rx, ok := rxAtDistanceFromProfile(profile, targetDistance)
		if !ok {
			continue
		}
		sample := nearbyBeamSample{
			delta: angularSeparationDegrees(targetAngle, profile.angle),
			rx:    rx,
		}
		nearest = insertNearestBeamSample(nearest, sample)
	}

	if len(nearest) == 0 {
		return 0, false
	}
	if len(nearest) == 1 || nearest[0].delta <= 1e-9 {
		return nearest[0].rx, true
	}

	totalWeight := 0.0
	weightedRx := 0.0
	bestRx := nearest[0].rx
	for _, sample := range nearest {
		weight := 1 / math.Max(sample.delta, 1e-6)
		totalWeight += weight
		weightedRx += sample.rx * weight
		bestRx = math.Max(bestRx, sample.rx)
	}
	if totalWeight == 0 {
		return bestRx, true
	}

	return math.Max(bestRx, weightedRx/totalWeight), true
}

func rxAtDistanceFromProfile(profile rayCoverageProfile, distanceMeters float64) (float64, bool) {
	if distanceMeters < 0 {
		return 0, false
	}
	for _, segment := range profile.segments {
		properties := segment.Properties
		start := properties.SegmentStartM
		end := properties.SegmentEndM
		if distanceMeters < start-0.1 || distanceMeters > end+0.1 {
			continue
		}
		if math.Abs(end-start) < 1e-9 {
			return properties.SignalDBm, true
		}
		t := math.Max(0, math.Min(1, (distanceMeters-start)/(end-start)))
		return properties.SignalStartDBm + t*(properties.SignalEndDBm-properties.SignalStartDBm), true
	}
	if distanceMeters <= profile.terminal.distanceMeters+0.1 {
		return profile.terminal.signalDBm, true
	}
	return 0, false
}

func insertNearestBeamSample(samples []nearbyBeamSample, sample nearbyBeamSample) []nearbyBeamSample {
	samples = append(samples, sample)
	sort.SliceStable(samples, func(i, j int) bool {
		if samples[i].delta == samples[j].delta {
			return samples[i].rx > samples[j].rx
		}
		return samples[i].delta < samples[j].delta
	})
	if len(samples) > 2 {
		samples = samples[:2]
	}
	return samples
}

func angularSeparationDegrees(a float64, b float64) float64 {
	delta := math.Abs(normalizeDegrees(a-b+180) - 180)
	if delta > 180 {
		return 360 - delta
	}
	return delta
}

type CoverageScoreBreakdown struct {
	CoverageScore           float64
	DemandScore             float64
	ResidentialScore        float64
	TotalScore              float64
	HitDemandBuildings      int
	HitResidentialBuildings int
}

func CoverageAreaScoreBreakdownContext(ctx context.Context, origin Point, req StaticSimulationRequest, buildings *BuildingIndex) (CoverageScoreBreakdown, error) {
	breakdown := CoverageScoreBreakdown{}
	uniqueDemandWeights := make(map[string]float64)
	uniqueResidentialDemands := make(map[string]float64)
	for index := 0; index < req.Rays; index++ {
		if err := ctx.Err(); err != nil {
			return CoverageScoreBreakdown{}, err
		}
		angle := BeamAngleForIndex(req.RFProfile.EffectiveAzimuth(req.AzimuthDeg), req.RFProfile.EffectiveBeamWidthDeg(), req.Rays, index)
		terminal, err := simulateRayTerminalContext(ctx, origin, index, angle, req, buildings)
		if err != nil {
			return CoverageScoreBreakdown{}, err
		}
		breakdown.CoverageScore += CoverageTieBreakerScore(terminal.distanceMeters, req.RadiusMeters)
		buildingIndex := 0
		for buildingID, demandWeight := range terminal.hitBuildingDemandWeights {
			if buildingIndex%64 == 0 {
				if err := ctx.Err(); err != nil {
					return CoverageScoreBreakdown{}, err
				}
			}
			buildingIndex++
			uniqueDemandWeights[buildingID] = demandWeight
		}
		buildingIndex = 0
		for buildingID, residentialDemand := range terminal.hitBuildingResidentialDemands {
			if buildingIndex%64 == 0 {
				if err := ctx.Err(); err != nil {
					return CoverageScoreBreakdown{}, err
				}
			}
			buildingIndex++
			uniqueResidentialDemands[buildingID] = residentialDemand
		}
	}
	for _, demandWeight := range uniqueDemandWeights {
		if demandWeight <= 0 {
			continue
		}
		breakdown.DemandScore += demandWeight * DemandScoreMultiplier
	}
	for _, residentialDemand := range uniqueResidentialDemands {
		if residentialDemand <= 0 {
			continue
		}
		breakdown.ResidentialScore += residentialDemand * ResidentialScoreMultiplier
	}
	breakdown.HitDemandBuildings = len(uniqueDemandWeights)
	breakdown.HitResidentialBuildings = len(uniqueResidentialDemands)
	breakdown.TotalScore = breakdown.CoverageScore + breakdown.DemandScore + breakdown.ResidentialScore
	return breakdown, nil
}

func CoverageTieBreakerScore(distanceMeters float64, radiusMeters float64) float64 {
	limit := math.Min(radiusMeters, CoverageTieBreakerMaxMeters)
	if limit <= 0 {
		limit = CoverageTieBreakerMaxMeters
	}
	normalized := math.Max(0, math.Min(distanceMeters, limit)) / limit
	return normalized * CoverageTieBreakerPerRay
}

func demandCandidatesInBeam(origin Point, req StaticSimulationRequest, buildings *BuildingIndex) []*BuildingFootprint {
	candidates, _ := demandCandidatesInBeamContext(context.Background(), origin, req, buildings)
	return candidates
}

func demandCandidatesInBeamContext(ctx context.Context, origin Point, req StaticSimulationRequest, buildings *BuildingIndex) ([]*BuildingFootprint, error) {
	if buildings == nil {
		return nil, nil
	}
	searchBounds := BoundsAroundPoint(origin, req.RadiusMeters)
	candidates := buildings.SearchBounds(searchBounds)
	demandCandidates := make([]*BuildingFootprint, 0, len(candidates))
	for index, building := range candidates {
		if index%64 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		if building == nil || building.DemandWeight+building.ResidentialDemand <= 0 {
			continue
		}
		centroid, ok := PolygonCentroid(building.Vertices)
		if !ok {
			continue
		}
		distance := ApproxDistanceMeters(origin, centroid)
		if distance > req.RadiusMeters {
			continue
		}
		bearing := BearingDegrees(origin, centroid)
		if req.RFProfile.HorizontalPatternID != "omni" && !AngleInBeam(bearing, req.RFProfile.EffectiveAzimuth(req.AzimuthDeg), req.BeamWidthDeg) {
			continue
		}
		demandCandidates = append(demandCandidates, building)
	}
	return demandCandidates, nil
}

func makeCoverageGapFeature(building *BuildingFootprint, centroid Point, distance float64, rx float64, buildingServiceThresholdDBm float64) PointFeature {
	totalDemand := building.DemandWeight + building.ResidentialDemand
	severity := "weak"
	if rx <= buildingServiceThresholdDBm {
		severity = "outage"
	}
	return PointFeature{
		Type: "Feature",
		Properties: GapProperties{
			BuildingID:                  building.ID,
			RxDBm:                       math.Round(rx*10) / 10,
			BuildingServiceThresholdDBm: math.Round(buildingServiceThresholdDBm*10) / 10,
			DistanceMeters:              math.Round(distance*10) / 10,
			DemandWeight:                math.Round(building.DemandWeight*10) / 10,
			ResidentialDemand:           math.Round(building.ResidentialDemand*10) / 10,
			DensityScore:                math.Round(building.DensityScore*10) / 10,
			TotalDemand:                 math.Round(totalDemand*10) / 10,
			Reason:                      gapReason(building),
			Severity:                    severity,
		},
		Geometry: PointGeometry{
			Type:        "Point",
			Coordinates: []float64{centroid.Lon, centroid.Lat},
		},
	}
}

func gapReason(building *BuildingFootprint) string {
	switch {
	case building.DemandWeight > 0 && building.ResidentialDemand > 0:
		return "mixed demand"
	case building.DemandWeight > 0:
		if building.WeightReason != "" && building.WeightReason != "generic" {
			return building.WeightReason
		}
		return "poi demand"
	case building.ResidentialDemand > 0:
		if building.ResidentialReason != "" && building.ResidentialReason != "none" {
			return building.ResidentialReason
		}
		return "residential demand"
	default:
		return "demand"
	}
}

func BeamAngleForIndex(azimuthDeg float64, beamWidthDeg float64, rayCount int, index int) float64 {
	if rayCount <= 0 {
		return normalizeDegrees(azimuthDeg)
	}
	startAngle := azimuthDeg - beamWidthDeg/2
	angleStep := beamWidthDeg / float64(rayCount)
	return normalizeDegrees(startAngle + float64(index)*angleStep)
}

func simulateSegmentedRay(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) ([]RayFeature, rayTerminal) {
	segments, terminal, _ := simulateSegmentedRayContext(context.Background(), origin, rayIndex, angle, req, buildings)
	return segments, terminal
}

func simulateRayTerminal(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) rayTerminal {
	terminal, _ := simulateRayTerminalContext(context.Background(), origin, rayIndex, angle, req, buildings)
	return terminal
}

func simulateSegmentedRayContext(ctx context.Context, origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) ([]RayFeature, rayTerminal, error) {
	return simulateSegmentedRayWithBudgetContext(ctx, origin, rayIndex, angle, req, buildings, nil)
}

func simulateSegmentedRayWithBudgetContext(ctx context.Context, origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex, featureBudget *simulationFeatureBudget) ([]RayFeature, rayTerminal, error) {
	return simulateSegmentedRayInternalWithBudgetContext(ctx, origin, rayIndex, angle, req, buildings, true, featureBudget)
}

func simulateRayTerminalContext(ctx context.Context, origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) (rayTerminal, error) {
	_, terminal, err := simulateSegmentedRayInternalWithBudgetContext(ctx, origin, rayIndex, angle, req, buildings, false, nil)
	return terminal, err
}

func simulateSegmentedRayInternal(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex, collectFeatures bool) ([]RayFeature, rayTerminal) {
	segments, terminal, _ := simulateSegmentedRayInternalContext(context.Background(), origin, rayIndex, angle, req, buildings, collectFeatures)
	return segments, terminal
}

func simulateSegmentedRayInternalContext(ctx context.Context, origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex, collectFeatures bool) ([]RayFeature, rayTerminal, error) {
	return simulateSegmentedRayInternalWithBudgetContext(ctx, origin, rayIndex, angle, req, buildings, collectFeatures, nil)
}

func simulateSegmentedRayInternalWithBudgetContext(ctx context.Context, origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex, collectFeatures bool, featureBudget *simulationFeatureBudget) ([]RayFeature, rayTerminal, error) {
	if err := ctx.Err(); err != nil {
		return nil, rayTerminal{}, err
	}
	profile := req.RFProfile
	if profile.SchemaVersion == 0 {
		profile = DefaultCellRFProfile(NetworkTechnologyForFrequency(req.FrequencyGHz), req.FrequencyGHz, req.TxPowerDBm, req.RadiusMeters, req.BeamWidthDeg, 0, 0, 0)
	}
	profile = profile.normalized()
	castDistance := profile.RadiusMeters
	wallLossPerIntersection := PenetrationLossForFrequencyGHz(profile.FrequencyGHz)
	horizontalOffsetDeg := smallestAngleDifference(angle, profile.EffectiveAzimuth(req.AzimuthDeg))
	castEndpoint := DestinationPoint(origin, angle, castDistance)
	pathGeometry, err := buildPropagationPathGeometryContextWithOptions(ctx, origin, castEndpoint, buildings, propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM,
		RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		return nil, rayTerminal{}, err
	}
	propagationAt := func(distanceMeters float64, point Point, attenuationDB float64) PropagationResult {
		losState, endpointCase, geometryWallEvents, losClassification := classifyPropagationPath(profile, pathGeometry, point, distanceMeters)
		wallEventCount := geometryWallEvents
		if wallLossPerIntersection > 0 {
			wallEventCount = int(math.Max(float64(wallEventCount), math.Round(math.Max(attenuationDB, 0)/wallLossPerIntersection)))
		}
		return EvaluatePropagationLink(PropagationLinkContext{
			Profile: profile, GroundDistanceM: distanceMeters,
			HorizontalOffsetDeg: horizontalOffsetDeg, CalibrationOffsetDB: req.CalibrationOffsetDB,
			LOSState: losState, EndpointCase: endpointCase,
			LOSClassification:     losClassification,
			BuildingDataAvailable: pathGeometry.available, WallEventCount: wallEventCount,
		})
	}
	receivedPowerAt := func(distanceMeters float64, point Point, attenuationDB float64) float64 {
		return propagationAt(distanceMeters, point, attenuationDB).ReceivedPowerDBm
	}
	pathLossAt := func(propagation PropagationResult) float64 {
		return profile.TxPowerDBm + profile.AntennaGainDBi + req.CalibrationOffsetDB - propagation.ReceivedPowerDBm
	}
	isObstructed := func(propagation PropagationResult) bool {
		return propagation.Terms.WallLossDB > 0 || propagation.LOSState == PropagationLOSState(PropagationNLOS) || propagation.EndpointCase == PropagationEndpointCase(PropagationEndpointIndoorTx) || propagation.EndpointCase == PropagationEndpointCase(PropagationEndpointIndoorRx)
	}

	if castDistance <= 0 {
		return nil, rayTerminal{
			blocked:          false,
			distanceMeters:   0,
			signalDBm:        profile.ReceiverSensitivityDBm,
			buildingCoverage: make(map[string]float64),
		}, nil
	}

	var segments []RayFeature
	if collectFeatures {
		segments = make([]RayFeature, 0, int(math.Ceil(castDistance/SegmentStepMeters)))
	}
	initialPropagation := propagationAt(castDistance, castEndpoint, float64(countPropagationWallEvents(pathGeometry.intersections, castDistance))*wallLossPerIntersection)
	terminal := rayTerminal{
		blocked:        isObstructed(initialPropagation),
		distanceMeters: castDistance,
		signalDBm:      initialPropagation.ReceivedPowerDBm,
	}

	segmentIndex := 0
	currentPoint := origin
	cumulativeWallLoss := 0.0
	hitBuildingDemandWeights := make(map[string]float64)
	hitBuildingResidentialDemands := make(map[string]float64)
	buildingCoverage := make(map[string]float64)
	for startDistance := 0.0; startDistance < castDistance; startDistance += SegmentStepMeters {
		if err := ctx.Err(); err != nil {
			return nil, rayTerminal{}, err
		}
		endDistance := math.Min(startDistance+SegmentStepMeters, castDistance)
		start := currentPoint
		nextPoint := DestinationPoint(origin, angle, endDistance)
		startPropagation := propagationAt(math.Max(startDistance, 1), start, cumulativeWallLoss)
		startRx := startPropagation.ReceivedPowerDBm

		if startDistance > 0 && startRx <= profile.ReceiverSensitivityDBm {
			terminal = rayTerminal{
				blocked:                       isObstructed(startPropagation),
				distanceMeters:                startDistance,
				signalDBm:                     startRx,
				hitBuildingDemandWeights:      hitBuildingDemandWeights,
				hitBuildingResidentialDemands: hitBuildingResidentialDemands,
				buildingCoverage:              buildingCoverage,
			}
			break
		}

		intersections, candidateChecks, err := wallIntersectionsForSegmentContext(ctx, origin, start, nextPoint, buildings)
		if err != nil {
			return nil, rayTerminal{}, err
		}
		segmentStartPoint := start
		segmentStartDistance := startDistance
		segmentStartRx := startRx
		rayStopped := false

		for _, intersection := range intersections {
			if err := ctx.Err(); err != nil {
				return nil, rayTerminal{}, err
			}
			hitDistance := startDistance + intersection.distanceMeters
			recordHitBuildingDemandWeight(hitBuildingDemandWeights, intersection.building)
			recordHitBuildingResidentialDemand(hitBuildingResidentialDemands, intersection.building)
			cumulativeWallLoss += wallLossPerIntersection
			wallPropagation := propagationAt(hitDistance, intersection.point, cumulativeWallLoss)
			wallRx := wallPropagation.ReceivedPowerDBm
			recordBuildingCoverage(buildingCoverage, intersection.building, wallRx)
			pathLossDB := pathLossAt(wallPropagation)
			isTerminalBlock := wallRx <= profile.ReceiverSensitivityDBm
			if collectFeatures {
				if ApproxDistanceMeters(segmentStartPoint, intersection.point) > 0.01 {
					if err := featureBudget.reserve(); err != nil {
						return nil, rayTerminal{}, err
					}
					segments = append(segments, makeRaySegmentFeature(
						segmentStartPoint,
						intersection.point,
						angle,
						rayIndex,
						segmentIndex,
						segmentStartDistance,
						hitDistance,
						segmentStartRx,
						wallRx,
						pathLossDB,
						wallPropagation.Terms.WallLossDB,
						isTerminalBlock,
						intersection.buildingID,
						candidateChecks,
						wallPropagation,
					))
					segmentIndex++
				}
			}

			if isTerminalBlock {
				terminal = rayTerminal{
					blocked:                       isObstructed(wallPropagation),
					distanceMeters:                hitDistance,
					signalDBm:                     wallRx,
					hitBuildingDemandWeights:      hitBuildingDemandWeights,
					hitBuildingResidentialDemands: hitBuildingResidentialDemands,
					buildingCoverage:              buildingCoverage,
				}
				rayStopped = true
				break
			}

			segmentStartPoint = intersection.point
			segmentStartDistance = hitDistance
			segmentStartRx = wallRx
		}
		if rayStopped {
			break
		}

		endPropagation := propagationAt(endDistance, nextPoint, cumulativeWallLoss)
		endRx := endPropagation.ReceivedPowerDBm
		if endRx <= profile.ReceiverSensitivityDBm {
			stopDistance := sensitivityCrossingDistanceWithEvaluator(segmentStartDistance, endDistance, profile.ReceiverSensitivityDBm, func(distanceMeters float64) float64 {
				return receivedPowerAt(distanceMeters, DestinationPoint(origin, angle, distanceMeters), cumulativeWallLoss)
			})
			if stopDistance < segmentStartDistance {
				stopDistance = segmentStartDistance
			}
			stopPoint := DestinationPoint(origin, angle, stopDistance)
			stopPropagation := propagationAt(stopDistance, stopPoint, cumulativeWallLoss)
			stopRx := stopPropagation.ReceivedPowerDBm
			pathLossDB := pathLossAt(stopPropagation)
			if err := recordBuildingsContainingSegmentCoverageContext(ctx, buildingCoverage, origin, segmentStartPoint, stopPoint, buildings, math.Max(segmentStartRx, stopRx)); err != nil {
				return nil, rayTerminal{}, err
			}
			if collectFeatures && ApproxDistanceMeters(segmentStartPoint, stopPoint) > 0.01 {
				if err := featureBudget.reserve(); err != nil {
					return nil, rayTerminal{}, err
				}
				segments = append(segments, makeRaySegmentFeature(
					segmentStartPoint,
					stopPoint,
					angle,
					rayIndex,
					segmentIndex,
					segmentStartDistance,
					stopDistance,
					segmentStartRx,
					stopRx,
					pathLossDB,
					stopPropagation.Terms.WallLossDB,
					cumulativeWallLoss > 0,
					"",
					candidateChecks,
					stopPropagation,
				))
			}

			terminal = rayTerminal{
				blocked:                       isObstructed(stopPropagation),
				distanceMeters:                stopDistance,
				signalDBm:                     stopRx,
				hitBuildingDemandWeights:      hitBuildingDemandWeights,
				hitBuildingResidentialDemands: hitBuildingResidentialDemands,
				buildingCoverage:              buildingCoverage,
			}
			break
		}

		if err := recordBuildingsContainingSegmentCoverageContext(ctx, buildingCoverage, origin, segmentStartPoint, nextPoint, buildings, math.Max(segmentStartRx, endRx)); err != nil {
			return nil, rayTerminal{}, err
		}
		pathLossDB := pathLossAt(endPropagation)
		if collectFeatures {
			if err := featureBudget.reserve(); err != nil {
				return nil, rayTerminal{}, err
			}
			segments = append(segments, makeRaySegmentFeature(
				segmentStartPoint,
				nextPoint,
				angle,
				rayIndex,
				segmentIndex,
				segmentStartDistance,
				endDistance,
				segmentStartRx,
				endRx,
				pathLossDB,
				endPropagation.Terms.WallLossDB,
				false,
				"",
				candidateChecks,
				endPropagation,
			))
			segmentIndex++
		}

		terminal = rayTerminal{
			blocked:                       false,
			distanceMeters:                endDistance,
			signalDBm:                     endRx,
			hitBuildingDemandWeights:      hitBuildingDemandWeights,
			hitBuildingResidentialDemands: hitBuildingResidentialDemands,
			buildingCoverage:              buildingCoverage,
		}
		currentPoint = nextPoint
	}

	return segments, terminal, nil
}

type wallIntersection struct {
	distanceMeters float64
	point          Point
	buildingID     string
	building       *BuildingFootprint
}

type rayTerminal struct {
	blocked                       bool
	distanceMeters                float64
	signalDBm                     float64
	hitBuildingDemandWeights      map[string]float64
	hitBuildingResidentialDemands map[string]float64
	buildingCoverage              map[string]float64
}

func wallIntersectionsForSegment(origin Point, start Point, end Point, buildings *BuildingIndex) ([]wallIntersection, int) {
	intersections, checks, _ := wallIntersectionsForSegmentContext(context.Background(), origin, start, end, buildings)
	return intersections, checks
}

func wallIntersectionsForSegmentContext(ctx context.Context, origin Point, start Point, end Point, buildings *BuildingIndex) ([]wallIntersection, int, error) {
	if buildings == nil || buildings.Len() == 0 {
		return []wallIntersection{}, 0, nil
	}
	candidates := buildings.SearchRay(start, end)
	intersections, err := wallIntersectionsForCandidatesContext(ctx, origin, start, end, candidates)
	return intersections, len(candidates), err
}

func wallIntersectionsForCandidatesContext(ctx context.Context, origin Point, start Point, end Point, candidates []*BuildingFootprint) ([]wallIntersection, error) {
	intersections := make([]wallIntersection, 0, len(candidates))

	for index, building := range candidates {
		if index%16 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		if building == nil {
			continue
		}
		if PointInPolygon(origin, building.Vertices) {
			continue
		}

		points, err := segmentPolygonIntersectionsContext(ctx, start, end, building.Vertices)
		if err != nil {
			return nil, err
		}
		for _, point := range points {
			distance := ApproxDistanceMeters(start, point)
			if distance <= 0.05 {
				continue
			}
			intersections = appendUniqueWallIntersection(intersections, wallIntersection{
				distanceMeters: distance,
				point:          point,
				buildingID:     building.ID,
				building:       building,
			})
		}
	}

	sort.SliceStable(intersections, func(i, j int) bool {
		return intersections[i].distanceMeters < intersections[j].distanceMeters
	})
	return intersections, nil
}

func appendUniqueWallIntersection(intersections []wallIntersection, candidate wallIntersection) []wallIntersection {
	for _, existing := range intersections {
		if existing.buildingID != candidate.buildingID {
			continue
		}
		if math.Abs(existing.distanceMeters-candidate.distanceMeters) <= 0.05 {
			return intersections
		}
	}
	return append(intersections, candidate)
}

func recordBuildingCoverage(coverage map[string]float64, building *BuildingFootprint, rx float64) {
	if coverage == nil || building == nil || building.ID == "" {
		return
	}
	recordBuildingCoverageValue(coverage, building.ID, rx)
}

func recordBuildingCoverageValue(coverage map[string]float64, buildingID string, rx float64) {
	if coverage == nil || buildingID == "" {
		return
	}
	if existing, ok := coverage[buildingID]; !ok || rx > existing {
		coverage[buildingID] = rx
	}
}

func recordBuildingsContainingSegmentCoverage(coverage map[string]float64, origin Point, start Point, end Point, buildings *BuildingIndex, rx float64) {
	_ = recordBuildingsContainingSegmentCoverageContext(context.Background(), coverage, origin, start, end, buildings, rx)
}

func recordBuildingsContainingSegmentCoverageContext(ctx context.Context, coverage map[string]float64, origin Point, start Point, end Point, buildings *BuildingIndex, rx float64) error {
	if coverage == nil || buildings == nil {
		return nil
	}
	midpoint := Point{
		Lon: (start.Lon + end.Lon) / 2,
		Lat: (start.Lat + end.Lat) / 2,
	}
	for index, building := range buildings.SearchRay(start, end) {
		if index%16 == 0 {
			if err := ctx.Err(); err != nil {
				return err
			}
		}
		if building == nil || PointInPolygon(origin, building.Vertices) {
			continue
		}
		if PointInPolygon(start, building.Vertices) || PointInPolygon(midpoint, building.Vertices) || PointInPolygon(end, building.Vertices) {
			recordBuildingCoverage(coverage, building, rx)
		}
	}
	return nil
}

func recordHitBuildingDemandWeight(weights map[string]float64, building *BuildingFootprint) {
	if weights == nil || building == nil || building.ID == "" {
		return
	}
	demandWeight := building.DemandWeight
	if demandWeight <= 0 {
		return
	}
	weights[building.ID] = demandWeight
}

func recordHitBuildingResidentialDemand(weights map[string]float64, building *BuildingFootprint) {
	if weights == nil || building == nil || building.ID == "" {
		return
	}
	residentialDemand := building.ResidentialDemand
	if residentialDemand <= 0 {
		return
	}
	weights[building.ID] = residentialDemand
}

func makeRaySegmentFeature(
	start Point,
	end Point,
	angle float64,
	rayIndex int,
	segmentIndex int,
	startDistance float64,
	endDistance float64,
	startRx float64,
	endRx float64,
	pathLoss float64,
	wallLoss float64,
	blocked bool,
	hitBuildingID string,
	candidateChecks int,
	propagation PropagationResult,
) RayFeature {
	return RayFeature{
		Type: "Feature",
		Properties: RayProperties{
			AngleDeg:                  normalizeDegrees(angle),
			RayIndex:                  rayIndex,
			SegmentIndex:              segmentIndex,
			SignalDBm:                 math.Round(endRx*10) / 10,
			SignalStartDBm:            math.Round(startRx*10) / 10,
			SignalEndDBm:              math.Round(endRx*10) / 10,
			PathLossDB:                math.Round(pathLoss*10) / 10,
			WallLossDB:                math.Round(wallLoss*10) / 10,
			IsBlocked:                 blocked,
			DistanceMeters:            math.Round(endDistance*10) / 10,
			SegmentStartM:             math.Round(startDistance*10) / 10,
			SegmentEndM:               math.Round(endDistance*10) / 10,
			HitBuildingID:             hitBuildingID,
			CandidateChecks:           candidateChecks,
			PropagationModelID:        propagation.ModelID,
			AppliedPropagationModelID: propagation.AppliedModelID,
			LOSState:                  string(propagation.LOSState),
			LOSClassifierID:           propagation.LOSClassifierID,
			LOSClassificationBasis:    propagation.ClassificationBasis,
			TerrainStatus:             propagation.TerrainStatus,
			LOSClassification:         propagation.LOSClassification,
			FallbackUsed:              propagation.FallbackUsed,
			ApplicabilityReason:       propagation.ApplicabilityReason,
		},
		Geometry: LineGeometry{
			Type: "LineString",
			Coordinates: [][]float64{
				{start.Lon, start.Lat},
				{end.Lon, end.Lat},
			},
		},
	}
}

func sensitivityCrossingDistance(profile CellRFProfile, startDistance, endDistance, attenuationDB, calibrationOffsetDB, horizontalOffsetDeg float64) float64 {
	low := math.Max(startDistance, 0)
	high := math.Max(endDistance, low)
	for iteration := 0; iteration < 32; iteration++ {
		mid := (low + high) / 2
		if profile.ReceivedPowerDBm(mid, attenuationDB, calibrationOffsetDB, horizontalOffsetDeg) > profile.ReceiverSensitivityDBm {
			low = mid
		} else {
			high = mid
		}
	}
	return high
}

func sensitivityCrossingDistanceWithEvaluator(startDistance, endDistance, sensitivityDBm float64, receivedPower func(float64) float64) float64 {
	low := math.Max(startDistance, 0)
	high := math.Max(endDistance, low)
	for iteration := 0; iteration < 32; iteration++ {
		mid := (low + high) / 2
		if receivedPower(mid) > sensitivityDBm {
			low = mid
		} else {
			high = mid
		}
	}
	return high
}

func CalculateSimulationStats(terminals []rayTerminal) SimulationStats {
	if len(terminals) == 0 {
		return SimulationStats{}
	}

	blocked := 0
	totalSignal := 0.0
	minRange := math.Inf(1)
	maxRange := math.Inf(-1)

	for _, terminal := range terminals {
		if terminal.blocked {
			blocked++
		}
		totalSignal += terminal.signalDBm
		minRange = math.Min(minRange, terminal.distanceMeters)
		maxRange = math.Max(maxRange, terminal.distanceMeters)
	}

	return SimulationStats{
		BlockedPct: math.Round((float64(blocked)/float64(len(terminals)))*1000) / 10,
		AvgRxDBm:   math.Round((totalSignal/float64(len(terminals)))*10) / 10,
		MinRangeM:  math.Round(minRange*10) / 10,
		MaxRangeM:  math.Round(maxRange*10) / 10,
	}
}

func ApproxDistanceMeters(a Point, b Point) float64 {
	latMeters := (b.Lat - a.Lat) * 111_320
	lonMeters := (b.Lon - a.Lon) * 111_320 * math.Cos(a.Lat*math.Pi/180)
	return math.Sqrt(latMeters*latMeters + lonMeters*lonMeters)
}
