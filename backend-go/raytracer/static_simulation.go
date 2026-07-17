package raytracer

import (
	"context"
	"math"
	"runtime"
	"sort"
	"sync"
)

const ReceiverSensitivity = -115.0 // dBm
const AntennaGainDBi = 25.0
const SegmentStepMeters = 25.0
const DemandScoreMultiplier = 10000.0
const ResidentialScoreMultiplier = 10000.0
const CoverageTieBreakerPerRay = 100.0
const CoverageTieBreakerMaxMeters = 500.0
const NetworkOverlapPenaltyPerBuilding = 2500.0
const CoveredBuildingThresholdDBm = -100.0
const MaxCoverageGapFeatures = 500

type StaticSimulationRequest struct {
	TowerLon            float64 `json:"tower_lon"`
	TowerLat            float64 `json:"tower_lat"`
	Rays                int     `json:"rays"`
	RadiusMeters        float64 `json:"radius_m"`
	FrequencyGHz        float64 `json:"frequency_ghz"`
	TxPowerDBm          float64 `json:"tx_power_dbm"`
	AzimuthDeg          float64 `json:"azimuth"`
	BeamWidthDeg        float64 `json:"beam_width"`
	CalibrationOffsetDB float64 `json:"calibration_offset_db,omitempty"`
}

type NetworkTowerRequest struct {
	ID         string  `json:"id"`
	TowerLon   float64 `json:"tower_lon"`
	TowerLat   float64 `json:"tower_lat"`
	AzimuthDeg float64 `json:"azimuth"`
}

type NetworkOptimizationRequest struct {
	Towers              []NetworkTowerRequest `json:"towers"`
	Rays                int                   `json:"rays"`
	RadiusMeters        float64               `json:"radius_m"`
	FrequencyGHz        float64               `json:"frequency_ghz"`
	TxPowerDBm          float64               `json:"tx_power_dbm"`
	BeamWidthDeg        float64               `json:"beam_width"`
	CalibrationOffsetDB float64               `json:"calibration_offset_db,omitempty"`
}

type RayFeatureCollection struct {
	Type     string       `json:"type"`
	Features []RayFeature `json:"features"`
}

type StaticSimulationResponse struct {
	GeoJSON RayFeatureCollection `json:"geojson"`
	Stats   SimulationStats      `json:"stats"`
}

type AzimuthOptimizationResponse struct {
	OptimalAzimuth          float64 `json:"optimal_azimuth"`
	CoverageScore           float64 `json:"coverage_score"`
	DemandScore             float64 `json:"demand_score"`
	ResidentialScore        float64 `json:"residential_score"`
	HitDemandBuildings      int     `json:"hit_demand_buildings"`
	HitResidentialBuildings int     `json:"hit_residential_buildings"`
	DataQuality             string  `json:"data_quality"`
}

type NetworkOptimizedTower struct {
	ID             string  `json:"id"`
	OptimalAzimuth float64 `json:"optimal_azimuth"`
	Score          float64 `json:"score"`
}

type NetworkOptimizationStats struct {
	NetworkScore               float64 `json:"network_score"`
	UniqueDemandBuildings      int     `json:"unique_demand_buildings"`
	UniqueResidentialBuildings int     `json:"unique_residential_buildings"`
	OverlapBuildings           int     `json:"overlap_buildings"`
	DemandScore                float64 `json:"demand_score"`
	ResidentialScore           float64 `json:"residential_score"`
	CoverageScore              float64 `json:"coverage_score"`
	OverlapPenalty             float64 `json:"overlap_penalty"`
	DataQuality                string  `json:"data_quality"`
}

type NetworkOptimizationResponse struct {
	OptimizedTowers []NetworkOptimizedTower  `json:"optimized_towers"`
	Stats           NetworkOptimizationStats `json:"stats"`
}

type CoverageGapResponse struct {
	GeoJSON PointFeatureCollection `json:"geojson"`
	Stats   CoverageGapStats       `json:"stats"`
}

type CoverageGapStats struct {
	CandidateBuildings int     `json:"candidate_buildings"`
	ServedBuildings    int     `json:"served_buildings"`
	GapBuildings       int     `json:"gap_buildings"`
	ReturnedGaps       int     `json:"returned_gaps"`
	GapPct             float64 `json:"gap_pct"`
	TotalGapDemand     float64 `json:"total_gap_demand"`
	WorstRxDBm         float64 `json:"worst_rx_dbm"`
	ThresholdDBm       float64 `json:"threshold_dbm"`
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
	AngleDeg        float64 `json:"angle_deg"`
	RayIndex        int     `json:"ray_index"`
	SegmentIndex    int     `json:"segment_index"`
	SignalDBm       float64 `json:"signal_dbm"`
	SignalStartDBm  float64 `json:"signal_start_dbm"`
	SignalEndDBm    float64 `json:"signal_end_dbm"`
	PathLossDB      float64 `json:"path_loss_db"`
	WallLossDB      float64 `json:"wall_loss_db"`
	IsBlocked       bool    `json:"is_blocked"`
	DistanceMeters  float64 `json:"distance_m"`
	SegmentStartM   float64 `json:"segment_start_m"`
	SegmentEndM     float64 `json:"segment_end_m"`
	HitBuildingID   string  `json:"hit_building_id,omitempty"`
	CandidateChecks int     `json:"candidate_checks"`
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
	BuildingID        string  `json:"building_id"`
	RxDBm             float64 `json:"rx_dbm"`
	DistanceMeters    float64 `json:"distance_m"`
	DemandWeight      float64 `json:"demand_weight"`
	ResidentialDemand float64 `json:"residential_demand"`
	DensityScore      float64 `json:"density_score"`
	TotalDemand       float64 `json:"total_demand"`
	Reason            string  `json:"reason"`
	Severity          string  `json:"severity"`
}

type PointGeometry struct {
	Type        string    `json:"type"`
	Coordinates []float64 `json:"coordinates"`
}

func NormalizeStaticSimulationRequest(req *StaticSimulationRequest) {
	if req.Rays == 0 {
		req.Rays = 60
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = 400
	}
	if req.FrequencyGHz == 0 {
		req.FrequencyGHz = 28
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = 30
	}
	req.AzimuthDeg = normalizeDegrees(req.AzimuthDeg)
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = 120
	}
	if req.BeamWidthDeg < 10 {
		req.BeamWidthDeg = 10
	}
	if req.BeamWidthDeg > 360 {
		req.BeamWidthDeg = 360
	}
}

func NormalizeNetworkOptimizationRequest(req *NetworkOptimizationRequest) {
	if req.Rays == 0 {
		req.Rays = 72
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = 400
	}
	if req.FrequencyGHz == 0 {
		req.FrequencyGHz = 28
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = 30
	}
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = 120
	}
	if req.BeamWidthDeg < 10 {
		req.BeamWidthDeg = 10
	}
	if req.BeamWidthDeg > 360 {
		req.BeamWidthDeg = 360
	}
	for index := range req.Towers {
		req.Towers[index].AzimuthDeg = normalizeDegrees(req.Towers[index].AzimuthDeg)
	}
}

func SimulateStaticRays(req StaticSimulationRequest, buildings *BuildingIndex) StaticSimulationResponse {
	response, _ := SimulateStaticRaysContext(context.Background(), req, buildings)
	return response
}

func SimulateStaticRaysContext(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex) (StaticSimulationResponse, error) {
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	rayFeatures := make([][]RayFeature, req.Rays)
	terminals := make([]rayTerminal, req.Rays)

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
					angle := BeamAngleForIndex(req.AzimuthDeg, req.BeamWidthDeg, req.Rays, index)
					rayFeatures[index], terminals[index] = simulateSegmentedRay(origin, index, angle, req, buildings)
				}
			}
		}()
	}

	for index := 0; index < req.Rays; index++ {
		select {
		case <-ctx.Done():
			close(jobs)
			waitGroup.Wait()
			return StaticSimulationResponse{}, ctx.Err()
		case jobs <- index:
		}
	}
	close(jobs)
	waitGroup.Wait()
	if err := ctx.Err(); err != nil {
		return StaticSimulationResponse{}, err
	}

	features := make([]RayFeature, 0, req.Rays*int(math.Ceil(req.RadiusMeters/SegmentStepMeters)))
	for _, segments := range rayFeatures {
		features = append(features, segments...)
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
		GeoJSON: geojson,
		Stats:   CalculateSimulationStats(terminals),
	}, nil
}

func OptimizeAzimuth(req StaticSimulationRequest, buildings *BuildingIndex) AzimuthOptimizationResponse {
	NormalizeStaticSimulationRequest(&req)
	response, _ := OptimizeAzimuthContext(context.Background(), req, buildings)
	return response
}

func OptimizeAzimuthContext(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex) (AzimuthOptimizationResponse, error) {
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
		DemandScore:             math.Round(best.breakdown.DemandScore*10) / 10,
		ResidentialScore:        math.Round(best.breakdown.ResidentialScore*10) / 10,
		HitDemandBuildings:      best.breakdown.HitDemandBuildings,
		HitResidentialBuildings: best.breakdown.HitResidentialBuildings,
		DataQuality:             demandSummary.DataQuality,
	}, nil
}

func OptimizeNetwork(req NetworkOptimizationRequest, buildings *BuildingIndex) NetworkOptimizationResponse {
	NormalizeNetworkOptimizationRequest(&req)
	response, _ := OptimizeNetworkContext(context.Background(), req, buildings)
	return response
}

func OptimizeNetworkContext(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex) (NetworkOptimizationResponse, error) {
	azimuths := make([]float64, len(req.Towers))
	for index, tower := range req.Towers {
		azimuths[index] = normalizeDegrees(tower.AzimuthDeg)
	}

	for pass := 0; pass < 2; pass++ {
		for towerIndex := range req.Towers {
			bestAzimuth := azimuths[towerIndex]
			bestScore := math.Inf(-1)
			for candidate := 0; candidate < 36; candidate++ {
				if err := ctx.Err(); err != nil {
					return NetworkOptimizationResponse{}, err
				}
				testAzimuths := append([]float64(nil), azimuths...)
				testAzimuths[towerIndex] = float64(candidate * 10)
				breakdown, err := NetworkCoverageScoreBreakdownContext(ctx, req, testAzimuths, buildings)
				if err != nil {
					return NetworkOptimizationResponse{}, err
				}
				if breakdown.NetworkScore > bestScore {
					bestScore = breakdown.NetworkScore
					bestAzimuth = testAzimuths[towerIndex]
				}
			}
			azimuths[towerIndex] = bestAzimuth
		}
	}

	breakdown, err := NetworkCoverageScoreBreakdownContext(ctx, req, azimuths, buildings)
	if err != nil {
		return NetworkOptimizationResponse{}, err
	}
	optimized := make([]NetworkOptimizedTower, 0, len(req.Towers))
	for index, tower := range req.Towers {
		simReq := networkTowerToStaticRequest(req, tower, azimuths[index])
		towerBreakdown, scoreErr := CoverageAreaScoreBreakdownContext(ctx, Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, simReq, buildings)
		if scoreErr != nil {
			return NetworkOptimizationResponse{}, scoreErr
		}
		score := towerBreakdown.TotalScore
		optimized = append(optimized, NetworkOptimizedTower{
			ID:             tower.ID,
			OptimalAzimuth: azimuths[index],
			Score:          math.Round(score*10) / 10,
		})
	}

	demandSummary := buildings.DemandSummary("")
	breakdown.DataQuality = demandSummary.DataQuality
	return NetworkOptimizationResponse{
		OptimizedTowers: optimized,
		Stats:           breakdown.rounded(),
	}, nil
}

func EvaluateNetwork(req NetworkOptimizationRequest, buildings *BuildingIndex) NetworkOptimizationResponse {
	NormalizeNetworkOptimizationRequest(&req)
	response, _ := EvaluateNetworkContext(context.Background(), req, buildings)
	return response
}

func EvaluateNetworkContext(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex) (NetworkOptimizationResponse, error) {
	azimuths := make([]float64, len(req.Towers))
	for index, tower := range req.Towers {
		azimuths[index] = normalizeDegrees(tower.AzimuthDeg)
	}

	breakdown, err := NetworkCoverageScoreBreakdownContext(ctx, req, azimuths, buildings)
	if err != nil {
		return NetworkOptimizationResponse{}, err
	}
	optimized := make([]NetworkOptimizedTower, 0, len(req.Towers))
	for index, tower := range req.Towers {
		simReq := networkTowerToStaticRequest(req, tower, azimuths[index])
		towerBreakdown, scoreErr := CoverageAreaScoreBreakdownContext(ctx, Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, simReq, buildings)
		if scoreErr != nil {
			return NetworkOptimizationResponse{}, scoreErr
		}
		score := towerBreakdown.TotalScore
		optimized = append(optimized, NetworkOptimizedTower{
			ID:             tower.ID,
			OptimalAzimuth: azimuths[index],
			Score:          math.Round(score*10) / 10,
		})
	}

	demandSummary := buildings.DemandSummary("")
	breakdown.DataQuality = demandSummary.DataQuality
	return NetworkOptimizationResponse{
		OptimizedTowers: optimized,
		Stats:           breakdown.rounded(),
	}, nil
}

func NetworkCoverageScoreBreakdown(req NetworkOptimizationRequest, azimuths []float64, buildings *BuildingIndex) NetworkOptimizationStats {
	stats, _ := NetworkCoverageScoreBreakdownContext(context.Background(), req, azimuths, buildings)
	return stats
}

func NetworkCoverageScoreBreakdownContext(ctx context.Context, req NetworkOptimizationRequest, azimuths []float64, buildings *BuildingIndex) (NetworkOptimizationStats, error) {
	stats := NetworkOptimizationStats{}
	if buildings == nil {
		return stats, nil
	}
	buildingByID := make(map[string]*BuildingFootprint, len(buildings.Footprints()))
	for _, building := range buildings.Footprints() {
		if building != nil && building.ID != "" {
			buildingByID[building.ID] = building
		}
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
		for buildingID, rx := range coverageMap {
			if rx <= CoveredBuildingThresholdDBm {
				continue
			}
			servedCounts[buildingID]++
			if existing, ok := bestRxByBuilding[buildingID]; !ok || rx > existing {
				bestRxByBuilding[buildingID] = rx
			}
		}
	}

	for buildingID := range bestRxByBuilding {
		building := buildingByID[buildingID]
		if building == nil {
			continue
		}
		if building.DemandWeight > 0 {
			stats.UniqueDemandBuildings++
			stats.DemandScore += building.DemandWeight * DemandScoreMultiplier
		}
		if building.ResidentialDemand > 0 {
			stats.UniqueResidentialBuildings++
			stats.ResidentialScore += building.ResidentialDemand * ResidentialScoreMultiplier
		}
		if servedCounts[buildingID] > 1 {
			stats.OverlapBuildings++
		}
	}
	stats.OverlapPenalty = float64(stats.OverlapBuildings) * NetworkOverlapPenaltyPerBuilding
	stats.NetworkScore = stats.DemandScore + stats.ResidentialScore + stats.CoverageScore - stats.OverlapPenalty
	return stats, nil
}

func networkTowerToStaticRequest(req NetworkOptimizationRequest, tower NetworkTowerRequest, azimuth float64) StaticSimulationRequest {
	return StaticSimulationRequest{
		TowerLon:            tower.TowerLon,
		TowerLat:            tower.TowerLat,
		Rays:                req.Rays,
		RadiusMeters:        req.RadiusMeters,
		FrequencyGHz:        req.FrequencyGHz,
		TxPowerDBm:          req.TxPowerDBm,
		AzimuthDeg:          normalizeDegrees(azimuth),
		BeamWidthDeg:        req.BeamWidthDeg,
		CalibrationOffsetDB: req.CalibrationOffsetDB,
	}
}

func (stats NetworkOptimizationStats) rounded() NetworkOptimizationStats {
	stats.NetworkScore = math.Round(stats.NetworkScore*10) / 10
	stats.DemandScore = math.Round(stats.DemandScore*10) / 10
	stats.ResidentialScore = math.Round(stats.ResidentialScore*10) / 10
	stats.CoverageScore = math.Round(stats.CoverageScore*10) / 10
	stats.OverlapPenalty = math.Round(stats.OverlapPenalty*10) / 10
	return stats
}

func FindCoverageGaps(req StaticSimulationRequest, buildings *BuildingIndex) CoverageGapResponse {
	NormalizeStaticSimulationRequest(&req)
	response, _ := FindCoverageGapsContext(context.Background(), req, buildings)
	return response
}

func FindCoverageGapsContext(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex) (CoverageGapResponse, error) {
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	candidates := demandCandidatesInBeam(origin, req, buildings)
	profiles, err := buildBeamCoverageProfilesContext(ctx, origin, req, buildings)
	if err != nil {
		return CoverageGapResponse{}, err
	}
	coverageMap := buildingCoverageMapFromProfiles(profiles)
	gaps := make([]PointFeature, 0, len(candidates))
	stats := CoverageGapStats{
		CandidateBuildings: len(candidates),
		ThresholdDBm:       CoveredBuildingThresholdDBm,
		WorstRxDBm:         math.Inf(1),
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
			rx = ReceiverSensitivity
		}
		totalDemand := building.DemandWeight + building.ResidentialDemand
		if hasCoverage && rx > CoveredBuildingThresholdDBm {
			stats.ServedBuildings++
			continue
		}

		stats.GapBuildings++
		stats.TotalGapDemand += totalDemand
		stats.WorstRxDBm = math.Min(stats.WorstRxDBm, rx)
		gaps = append(gaps, makeCoverageGapFeature(building, centroid, distance, rx))
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
		Stats: stats,
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

func BuildingCoverageMap(origin Point, req StaticSimulationRequest, buildings *BuildingIndex) map[string]float64 {
	NormalizeStaticSimulationRequest(&req)
	coverage, _ := BuildingCoverageMapContext(context.Background(), origin, req, buildings)
	return coverage
}

func BuildingCoverageMapContext(ctx context.Context, origin Point, req StaticSimulationRequest, buildings *BuildingIndex) (map[string]float64, error) {
	profiles, err := buildBeamCoverageProfilesContext(ctx, origin, req, buildings)
	if err != nil {
		return nil, err
	}
	return buildingCoverageMapFromProfiles(profiles), nil
}

func buildBeamCoverageProfiles(origin Point, req StaticSimulationRequest, buildings *BuildingIndex) []rayCoverageProfile {
	NormalizeStaticSimulationRequest(&req)
	profiles, _ := buildBeamCoverageProfilesContext(context.Background(), origin, req, buildings)
	return profiles
}

func buildBeamCoverageProfilesContext(ctx context.Context, origin Point, req StaticSimulationRequest, buildings *BuildingIndex) ([]rayCoverageProfile, error) {
	profiles := make([]rayCoverageProfile, 0, req.Rays)
	for index := 0; index < req.Rays; index++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		angle := BeamAngleForIndex(req.AzimuthDeg, req.BeamWidthDeg, req.Rays, index)
		segments, terminal := simulateSegmentedRay(origin, index, angle, req, buildings)
		profiles = append(profiles, rayCoverageProfile{
			angle:    angle,
			segments: segments,
			terminal: terminal,
		})
	}
	return profiles, nil
}

func buildingCoverageMapFromProfiles(profiles []rayCoverageProfile) map[string]float64 {
	coverage := make(map[string]float64)
	for _, profile := range profiles {
		for buildingID, rx := range profile.terminal.buildingCoverage {
			recordBuildingCoverageValue(coverage, buildingID, rx)
		}
	}
	return coverage
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

func CoverageAreaScore(origin Point, req StaticSimulationRequest, buildings *BuildingIndex) float64 {
	return CoverageAreaScoreBreakdown(origin, req, buildings).TotalScore
}

type CoverageScoreBreakdown struct {
	CoverageScore           float64
	DemandScore             float64
	ResidentialScore        float64
	TotalScore              float64
	HitDemandBuildings      int
	HitResidentialBuildings int
}

func CoverageAreaScoreBreakdown(origin Point, req StaticSimulationRequest, buildings *BuildingIndex) CoverageScoreBreakdown {
	breakdown, _ := CoverageAreaScoreBreakdownContext(context.Background(), origin, req, buildings)
	return breakdown
}

func CoverageAreaScoreBreakdownContext(ctx context.Context, origin Point, req StaticSimulationRequest, buildings *BuildingIndex) (CoverageScoreBreakdown, error) {
	breakdown := CoverageScoreBreakdown{}
	uniqueDemandWeights := make(map[string]float64)
	uniqueResidentialDemands := make(map[string]float64)
	for index := 0; index < req.Rays; index++ {
		if err := ctx.Err(); err != nil {
			return CoverageScoreBreakdown{}, err
		}
		angle := BeamAngleForIndex(req.AzimuthDeg, req.BeamWidthDeg, req.Rays, index)
		terminal := simulateRayTerminal(origin, index, angle, req, buildings)
		breakdown.CoverageScore += CoverageTieBreakerScore(terminal.distanceMeters, req.RadiusMeters)
		for buildingID, demandWeight := range terminal.hitBuildingDemandWeights {
			uniqueDemandWeights[buildingID] = demandWeight
		}
		for buildingID, residentialDemand := range terminal.hitBuildingResidentialDemands {
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
	if buildings == nil {
		return nil
	}
	searchBounds := BoundsAroundPoint(origin, req.RadiusMeters)
	candidates := buildings.SearchBounds(searchBounds)
	demandCandidates := make([]*BuildingFootprint, 0, len(candidates))
	for _, building := range candidates {
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
		if !AngleInBeam(bearing, req.AzimuthDeg, req.BeamWidthDeg) {
			continue
		}
		demandCandidates = append(demandCandidates, building)
	}
	return demandCandidates
}

func makeCoverageGapFeature(building *BuildingFootprint, centroid Point, distance float64, rx float64) PointFeature {
	totalDemand := building.DemandWeight + building.ResidentialDemand
	severity := "weak"
	if rx <= ReceiverSensitivity {
		severity = "outage"
	}
	return PointFeature{
		Type: "Feature",
		Properties: GapProperties{
			BuildingID:        building.ID,
			RxDBm:             math.Round(rx*10) / 10,
			DistanceMeters:    math.Round(distance*10) / 10,
			DemandWeight:      math.Round(building.DemandWeight*10) / 10,
			ResidentialDemand: math.Round(building.ResidentialDemand*10) / 10,
			DensityScore:      math.Round(building.DensityScore*10) / 10,
			TotalDemand:       math.Round(totalDemand*10) / 10,
			Reason:            gapReason(building),
			Severity:          severity,
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
	return simulateSegmentedRayInternal(origin, rayIndex, angle, req, buildings, true)
}

func simulateRayTerminal(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) rayTerminal {
	_, terminal := simulateSegmentedRayInternal(origin, rayIndex, angle, req, buildings, false)
	return terminal
}

func simulateSegmentedRayInternal(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex, collectFeatures bool) ([]RayFeature, rayTerminal) {
	effectiveTxPowerDBm := req.TxPowerDBm + req.CalibrationOffsetDB
	clearAirLimit := MaxTheoreticalDistanceMeters(effectiveTxPowerDBm, req.FrequencyGHz, 0)
	castDistance := math.Min(req.RadiusMeters, clearAirLimit)
	wallLossPerIntersection := PenetrationLossForFrequencyGHz(req.FrequencyGHz)

	if castDistance <= 0 {
		return nil, rayTerminal{
			blocked:          false,
			distanceMeters:   0,
			signalDBm:        ReceiverSensitivity,
			buildingCoverage: make(map[string]float64),
		}
	}

	var segments []RayFeature
	if collectFeatures {
		segments = make([]RayFeature, 0, int(math.Ceil(castDistance/SegmentStepMeters)))
	}
	terminal := rayTerminal{
		blocked:        false,
		distanceMeters: castDistance,
		signalDBm:      ReceivedPowerDBm(castDistance, req.FrequencyGHz, effectiveTxPowerDBm, 0),
	}

	segmentIndex := 0
	currentPoint := origin
	cumulativeWallLoss := 0.0
	hitBuildingDemandWeights := make(map[string]float64)
	hitBuildingResidentialDemands := make(map[string]float64)
	buildingCoverage := make(map[string]float64)
	for startDistance := 0.0; startDistance < castDistance; startDistance += SegmentStepMeters {
		endDistance := math.Min(startDistance+SegmentStepMeters, castDistance)
		start := currentPoint
		nextPoint := DestinationPoint(origin, angle, endDistance)
		startRx := ReceivedPowerDBm(math.Max(startDistance, 1), req.FrequencyGHz, effectiveTxPowerDBm, cumulativeWallLoss)

		if startDistance > 0 && startRx <= ReceiverSensitivity {
			terminal = rayTerminal{
				blocked:                       cumulativeWallLoss > 0,
				distanceMeters:                startDistance,
				signalDBm:                     startRx,
				hitBuildingDemandWeights:      hitBuildingDemandWeights,
				hitBuildingResidentialDemands: hitBuildingResidentialDemands,
				buildingCoverage:              buildingCoverage,
			}
			break
		}

		intersections, candidateChecks := wallIntersectionsForSegment(origin, start, nextPoint, buildings)
		segmentStartPoint := start
		segmentStartDistance := startDistance
		segmentStartRx := startRx
		rayStopped := false

		for _, intersection := range intersections {
			hitDistance := startDistance + intersection.distanceMeters
			recordHitBuildingDemandWeight(hitBuildingDemandWeights, intersection.building)
			recordHitBuildingResidentialDemand(hitBuildingResidentialDemands, intersection.building)
			cumulativeWallLoss += wallLossPerIntersection
			wallRx := ReceivedPowerDBm(hitDistance, req.FrequencyGHz, effectiveTxPowerDBm, cumulativeWallLoss)
			recordBuildingCoverage(buildingCoverage, intersection.building, wallRx)
			pathLoss := FreeSpacePathLossMetersGHz(hitDistance, req.FrequencyGHz) + cumulativeWallLoss
			isTerminalBlock := wallRx <= ReceiverSensitivity
			if collectFeatures {
				if ApproxDistanceMeters(segmentStartPoint, intersection.point) > 0.01 {
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
						pathLoss,
						cumulativeWallLoss,
						isTerminalBlock,
						intersection.buildingID,
						candidateChecks,
					))
					segmentIndex++
				}
			}

			if isTerminalBlock {
				terminal = rayTerminal{
					blocked:                       true,
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

		endRx := ReceivedPowerDBm(endDistance, req.FrequencyGHz, effectiveTxPowerDBm, cumulativeWallLoss)
		if endRx <= ReceiverSensitivity {
			stopDistance := MaxTheoreticalDistanceMeters(effectiveTxPowerDBm, req.FrequencyGHz, cumulativeWallLoss)
			if stopDistance < segmentStartDistance {
				stopDistance = segmentStartDistance
			}
			stopPoint := DestinationPoint(origin, angle, stopDistance)
			stopRx := ReceivedPowerDBm(stopDistance, req.FrequencyGHz, effectiveTxPowerDBm, cumulativeWallLoss)
			pathLoss := FreeSpacePathLossMetersGHz(stopDistance, req.FrequencyGHz) + cumulativeWallLoss
			recordBuildingsContainingSegmentCoverage(buildingCoverage, origin, segmentStartPoint, stopPoint, buildings, math.Max(segmentStartRx, stopRx))
			if collectFeatures && ApproxDistanceMeters(segmentStartPoint, stopPoint) > 0.01 {
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
					pathLoss,
					cumulativeWallLoss,
					cumulativeWallLoss > 0,
					"",
					candidateChecks,
				))
			}

			terminal = rayTerminal{
				blocked:                       cumulativeWallLoss > 0,
				distanceMeters:                stopDistance,
				signalDBm:                     stopRx,
				hitBuildingDemandWeights:      hitBuildingDemandWeights,
				hitBuildingResidentialDemands: hitBuildingResidentialDemands,
				buildingCoverage:              buildingCoverage,
			}
			break
		}

		recordBuildingsContainingSegmentCoverage(buildingCoverage, origin, segmentStartPoint, nextPoint, buildings, math.Max(segmentStartRx, endRx))
		pathLoss := FreeSpacePathLossMetersGHz(endDistance, req.FrequencyGHz) + cumulativeWallLoss
		if collectFeatures {
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
				pathLoss,
				cumulativeWallLoss,
				false,
				"",
				candidateChecks,
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

	return segments, terminal
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
	candidates := buildings.SearchRay(start, end)
	intersections := make([]wallIntersection, 0, len(candidates))

	for _, building := range candidates {
		if PointInPolygon(origin, building.Vertices) {
			continue
		}

		points := SegmentPolygonIntersections(start, end, building.Vertices)
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
	return intersections, len(candidates)
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
	if coverage == nil || buildings == nil {
		return
	}
	midpoint := Point{
		Lon: (start.Lon + end.Lon) / 2,
		Lat: (start.Lat + end.Lat) / 2,
	}
	for _, building := range buildings.SearchRay(start, end) {
		if building == nil || PointInPolygon(origin, building.Vertices) {
			continue
		}
		if PointInPolygon(start, building.Vertices) || PointInPolygon(midpoint, building.Vertices) || PointInPolygon(end, building.Vertices) {
			recordBuildingCoverage(coverage, building, rx)
		}
	}
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
) RayFeature {
	return RayFeature{
		Type: "Feature",
		Properties: RayProperties{
			AngleDeg:        normalizeDegrees(angle),
			RayIndex:        rayIndex,
			SegmentIndex:    segmentIndex,
			SignalDBm:       math.Round(endRx*10) / 10,
			SignalStartDBm:  math.Round(startRx*10) / 10,
			SignalEndDBm:    math.Round(endRx*10) / 10,
			PathLossDB:      math.Round(pathLoss*10) / 10,
			WallLossDB:      math.Round(wallLoss*10) / 10,
			IsBlocked:       blocked,
			DistanceMeters:  math.Round(endDistance*10) / 10,
			SegmentStartM:   math.Round(startDistance*10) / 10,
			SegmentEndM:     math.Round(endDistance*10) / 10,
			HitBuildingID:   hitBuildingID,
			CandidateChecks: candidateChecks,
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

func FreeSpacePathLossMetersGHz(distanceMeters float64, frequencyGHz float64) float64 {
	distance := math.Max(distanceMeters, 1)
	return 20*math.Log10(distance) + 20*math.Log10(frequencyGHz) + 32.45
}

func PenetrationLossForFrequencyGHz(frequencyGHz float64) float64 {
	switch {
	case frequencyGHz < 10:
		return 8
	case frequencyGHz < 100:
		return 30
	default:
		return 80
	}
}

func ReceivedPowerDBm(distanceMeters float64, frequencyGHz float64, txPowerDBm float64, attenuationDB float64) float64 {
	return EffectiveIsotropicRadiatedPowerDBm(txPowerDBm) - FreeSpacePathLossMetersGHz(distanceMeters, frequencyGHz) - attenuationDB
}

func MaxTheoreticalDistanceMeters(txPowerDBm float64, frequencyGHz float64, attenuationDB float64) float64 {
	if frequencyGHz <= 0 {
		return 0
	}
	exponent := (EffectiveIsotropicRadiatedPowerDBm(txPowerDBm) - ReceiverSensitivity - attenuationDB - 20*math.Log10(frequencyGHz) - 32.45) / 20
	return math.Pow(10, exponent)
}

func EffectiveIsotropicRadiatedPowerDBm(txPowerDBm float64) float64 {
	return txPowerDBm + AntennaGainDBi
}

func SegmentPolygonFirstIntersection(a Point, b Point, polygon []Point) (bool, Point) {
	if len(polygon) < 3 {
		return false, Point{}
	}
	if PointInPolygon(a, polygon) {
		return true, a
	}

	found := false
	closestPoint := Point{}
	closestDistance := math.Inf(1)
	for index := range polygon {
		next := (index + 1) % len(polygon)
		hit, point := SegmentIntersectionPoint(a, b, polygon[index], polygon[next])
		if !hit {
			continue
		}
		distance := ApproxDistanceMeters(a, point)
		if distance < closestDistance {
			closestDistance = distance
			closestPoint = point
			found = true
		}
	}
	return found, closestPoint
}

func SegmentPolygonIntersections(a Point, b Point, polygon []Point) []Point {
	if len(polygon) < 3 {
		return nil
	}

	points := make([]Point, 0, 2)
	for index := range polygon {
		next := (index + 1) % len(polygon)
		hit, point := SegmentIntersectionPoint(a, b, polygon[index], polygon[next])
		if !hit {
			continue
		}
		points = appendUniquePoint(points, point)
	}
	return points
}

func appendUniquePoint(points []Point, candidate Point) []Point {
	for _, existing := range points {
		if ApproxDistanceMeters(existing, candidate) <= 0.05 {
			return points
		}
	}
	return append(points, candidate)
}

func SegmentIntersectionPoint(p1 Point, p2 Point, q1 Point, q2 Point) (bool, Point) {
	x1, y1 := p1.Lon, p1.Lat
	x2, y2 := p2.Lon, p2.Lat
	x3, y3 := q1.Lon, q1.Lat
	x4, y4 := q2.Lon, q2.Lat

	denominator := (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
	if math.Abs(denominator) < 1e-14 {
		return false, Point{}
	}

	t := ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denominator
	u := -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denominator
	if t < 0 || t > 1 || u < 0 || u > 1 {
		return false, Point{}
	}

	return true, Point{
		Lon: x1 + t*(x2-x1),
		Lat: y1 + t*(y2-y1),
	}
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
