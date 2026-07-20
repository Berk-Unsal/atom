package raytracer

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

const (
	MaxRecommendationCandidates  = 50
	MaxRecommendationEvaluations = 12
	DefaultRecommendationResults = 5
)

type SiteRecommendationRequestInput struct {
	NetworkTech         string                     `json:"network_tech"`
	Towers              []NetworkTowerRequestInput `json:"towers"`
	Rays                *int                       `json:"rays"`
	RadiusMeters        *float64                   `json:"radius_m"`
	FrequencyGHz        *float64                   `json:"frequency_ghz"`
	TxPowerDBm          *float64                   `json:"tx_power_dbm"`
	BeamWidthDeg        *float64                   `json:"beam_width"`
	CalibrationOffsetDB *float64                   `json:"calibration_offset_db"`
	SearchPolygon       [][]float64                `json:"search_polygon"`
	MaxResults          *int                       `json:"max_results"`
}

type SiteRecommendationRequest struct {
	NetworkTech   string
	Network       NetworkOptimizationRequest
	SearchPolygon []Point
	MaxResults    int
}

type SiteRecommendationResponse struct {
	Baseline            NetworkOptimizationStats        `json:"baseline"`
	CandidatesEvaluated int                             `json:"candidates_evaluated"`
	Recommendations     []SiteRecommendation            `json:"recommendations"`
	GeoJSON             RecommendationFeatureCollection `json:"geojson"`
	Notes               []string                        `json:"notes"`
}

type SiteRecommendation struct {
	ID                   string                   `json:"id"`
	CellID               int64                    `json:"cell_id"`
	TowerLon             float64                  `json:"tower_lon"`
	TowerLat             float64                  `json:"tower_lat"`
	OptimalAzimuth       float64                  `json:"optimal_azimuth"`
	MarginalNetworkScore float64                  `json:"marginal_network_score"`
	Stats                NetworkOptimizationStats `json:"stats"`
	Reason               string                   `json:"reason"`
}

type RecommendationFeatureCollection struct {
	Type     string                  `json:"type"`
	Features []RecommendationFeature `json:"features"`
}

type RecommendationFeature struct {
	Type       string             `json:"type"`
	Properties SiteRecommendation `json:"properties"`
	Geometry   PointGeometry      `json:"geometry"`
}

func (input SiteRecommendationRequestInput) ToRequest() SiteRecommendationRequest {
	networkInput := NetworkOptimizationRequestInput{
		Towers:              input.Towers,
		Rays:                input.Rays,
		RadiusMeters:        input.RadiusMeters,
		FrequencyGHz:        input.FrequencyGHz,
		TxPowerDBm:          input.TxPowerDBm,
		BeamWidthDeg:        input.BeamWidthDeg,
		CalibrationOffsetDB: input.CalibrationOffsetDB,
	}
	polygon := make([]Point, 0, len(input.SearchPolygon))
	for _, coordinate := range input.SearchPolygon {
		if len(coordinate) >= 2 {
			polygon = append(polygon, Point{Lon: coordinate[0], Lat: coordinate[1]})
		}
	}
	return SiteRecommendationRequest{
		NetworkTech:   strings.ToLower(strings.TrimSpace(input.NetworkTech)),
		Network:       networkInput.ToRequest(),
		SearchPolygon: polygon,
		MaxResults:    valueOr(input.MaxResults, DefaultRecommendationResults),
	}
}

func (input SiteRecommendationRequestInput) MissingRequiredTowerFields() bool {
	for _, tower := range input.Towers {
		if strings.TrimSpace(tower.ID) == "" || tower.TowerLon == nil || tower.TowerLat == nil {
			return true
		}
	}
	return false
}

func ValidateSiteRecommendationRequest(req SiteRecommendationRequest) string {
	if req.NetworkTech != "4g" && req.NetworkTech != "5g" {
		return "network_tech must be 4g or 5g"
	}
	if len(req.Network.Towers) < 2 || len(req.Network.Towers) > 5 {
		return "towers must contain between 2 and 5 selected towers"
	}
	if len(req.SearchPolygon) < 3 {
		return "search_polygon must contain at least 3 coordinates"
	}
	for _, point := range req.SearchPolygon {
		if point.Lon < -180 || point.Lon > 180 || point.Lat < -90 || point.Lat > 90 {
			return "search_polygon contains an invalid coordinate"
		}
	}
	if req.MaxResults < 1 || req.MaxResults > 10 {
		return "max_results must be between 1 and 10"
	}
	if req.CalibrationOffsetDB() < -40 || req.CalibrationOffsetDB() > 40 {
		return "calibration_offset_db must be between -40 and 40"
	}
	if req.Network.Rays < 8 || req.Network.Rays > 720 || req.Network.RadiusMeters < 25 || req.Network.RadiusMeters > 5000 {
		return "rays must be between 8 and 720 and radius_m between 25 and 5000"
	}
	if req.Network.TxPowerDBm < 0 || req.Network.TxPowerDBm > 60 || req.Network.BeamWidthDeg < 10 || req.Network.BeamWidthDeg > 360 {
		return "tx_power_dbm must be between 0 and 60 and beam_width between 10 and 360"
	}
	if req.NetworkTech == "4g" && (req.Network.FrequencyGHz <= 0 || req.Network.FrequencyGHz >= 10) {
		return "4g recommendations require frequency_ghz below 10"
	}
	if req.NetworkTech == "5g" && (req.Network.FrequencyGHz < 10 || req.Network.FrequencyGHz >= 100) {
		return "5g recommendations require frequency_ghz from 10 up to 100"
	}
	seen := make(map[string]struct{}, len(req.Network.Towers))
	for _, tower := range req.Network.Towers {
		if validationError := ValidateTowerID(tower.ID); validationError != "" {
			return validationError
		}
		if _, exists := seen[tower.ID]; exists {
			return "tower ids must be unique"
		}
		seen[tower.ID] = struct{}{}
		if tower.TowerLon < -180 || tower.TowerLon > 180 || tower.TowerLat < -90 || tower.TowerLat > 90 {
			return "each tower must include valid tower_lon and tower_lat coordinates"
		}
	}
	return ""
}

func (req SiteRecommendationRequest) CalibrationOffsetDB() float64 {
	return req.Network.CalibrationOffsetDB
}

func RecommendSitesContext(ctx context.Context, req SiteRecommendationRequest, towerInventory []TowerStation, buildings *BuildingIndex) (SiteRecommendationResponse, error) {
	azimuths := networkAzimuths(req.Network)
	baseline, err := NetworkCoverageScoreBreakdownContext(ctx, req.Network, azimuths, buildings)
	if err != nil {
		return SiteRecommendationResponse{}, err
	}
	selected := make(map[string]struct{}, len(req.Network.Towers)*2)
	for _, tower := range req.Network.Towers {
		selected[tower.ID] = struct{}{}
	}
	candidates := make([]recommendationCandidate, 0, MaxRecommendationCandidates)
	for _, tower := range towerInventory {
		if err := ctx.Err(); err != nil {
			return SiteRecommendationResponse{}, err
		}
		cellID := strconv.FormatInt(tower.CellID, 10)
		if _, exists := selected[tower.ID]; exists {
			continue
		}
		if _, exists := selected[cellID]; exists {
			continue
		}
		point := Point{Lon: tower.Lon, Lat: tower.Lat}
		if !PointInPolygon(point, req.SearchPolygon) {
			continue
		}
		potential := nearbyDemandPotential(point, req.Network.RadiusMeters, buildings)
		candidates = append(candidates, recommendationCandidate{tower: tower, potential: potential})
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].potential == candidates[j].potential {
			return candidates[i].tower.ID < candidates[j].tower.ID
		}
		return candidates[i].potential > candidates[j].potential
	})
	if len(candidates) > MaxRecommendationCandidates {
		candidates = candidates[:MaxRecommendationCandidates]
	}
	evaluationCandidates := candidates
	if len(evaluationCandidates) > MaxRecommendationEvaluations {
		evaluationCandidates = evaluationCandidates[:MaxRecommendationEvaluations]
	}

	recommendations := make([]SiteRecommendation, 0, len(evaluationCandidates))
	for _, candidate := range evaluationCandidates {
		if err := ctx.Err(); err != nil {
			return SiteRecommendationResponse{}, err
		}
		candidateID := strconv.FormatInt(candidate.tower.CellID, 10)
		candidateRequest := StaticSimulationRequest{
			TowerLon:            candidate.tower.Lon,
			TowerLat:            candidate.tower.Lat,
			Rays:                req.Network.Rays,
			RadiusMeters:        req.Network.RadiusMeters,
			FrequencyGHz:        req.Network.FrequencyGHz,
			TxPowerDBm:          req.Network.TxPowerDBm,
			BeamWidthDeg:        req.Network.BeamWidthDeg,
			CalibrationOffsetDB: req.Network.CalibrationOffsetDB,
		}
		optimized, optimizeErr := OptimizeAzimuthContext(ctx, candidateRequest, buildings)
		if optimizeErr != nil {
			return SiteRecommendationResponse{}, optimizeErr
		}
		network := req.Network
		network.Towers = append(append([]NetworkTowerRequest(nil), req.Network.Towers...), NetworkTowerRequest{
			ID:         candidateID,
			TowerLon:   candidate.tower.Lon,
			TowerLat:   candidate.tower.Lat,
			AzimuthDeg: optimized.OptimalAzimuth,
		})
		candidateAzimuths := networkAzimuths(network)
		stats, scoreErr := NetworkCoverageScoreBreakdownContext(ctx, network, candidateAzimuths, buildings)
		if scoreErr != nil {
			return SiteRecommendationResponse{}, scoreErr
		}
		delta := stats.NetworkScore - baseline.NetworkScore
		recommendations = append(recommendations, SiteRecommendation{
			ID:                   candidate.tower.ID,
			CellID:               candidate.tower.CellID,
			TowerLon:             candidate.tower.Lon,
			TowerLat:             candidate.tower.Lat,
			OptimalAzimuth:       optimized.OptimalAzimuth,
			MarginalNetworkScore: math.Round(delta*10) / 10,
			Stats:                stats.rounded(),
			Reason:               recommendationReason(stats, baseline),
		})
	}
	sort.SliceStable(recommendations, func(i, j int) bool {
		if recommendations[i].MarginalNetworkScore == recommendations[j].MarginalNetworkScore {
			return recommendations[i].ID < recommendations[j].ID
		}
		return recommendations[i].MarginalNetworkScore > recommendations[j].MarginalNetworkScore
	})
	if len(recommendations) > req.MaxResults {
		recommendations = recommendations[:req.MaxResults]
	}
	features := make([]RecommendationFeature, 0, len(recommendations))
	for _, recommendation := range recommendations {
		features = append(features, RecommendationFeature{
			Type:       "Feature",
			Properties: recommendation,
			Geometry:   PointGeometry{Type: "Point", Coordinates: []float64{recommendation.TowerLon, recommendation.TowerLat}},
		})
	}
	return SiteRecommendationResponse{
		Baseline:            baseline.rounded(),
		CandidatesEvaluated: len(evaluationCandidates),
		Recommendations:     recommendations,
		GeoJSON:             RecommendationFeatureCollection{Type: "FeatureCollection", Features: features},
		Notes: []string{
			"Candidates are known planning records, not approved deployment sites.",
			"Candidate scoring excludes interference; analyze SINR after applying a recommendation.",
		},
	}, nil
}

type recommendationCandidate struct {
	tower     TowerStation
	potential float64
}

func networkAzimuths(req NetworkOptimizationRequest) []float64 {
	azimuths := make([]float64, len(req.Towers))
	for index, tower := range req.Towers {
		azimuths[index] = tower.AzimuthDeg
	}
	return azimuths
}

func nearbyDemandPotential(point Point, radiusMeters float64, buildings *BuildingIndex) float64 {
	if buildings == nil {
		return 0
	}
	potential := 0.0
	for _, building := range buildings.SearchBounds(BoundsAroundPoint(point, radiusMeters)) {
		centroid, ok := PolygonCentroid(building.Vertices)
		if !ok || ApproxDistanceMeters(point, centroid) > radiusMeters {
			continue
		}
		potential += building.DemandWeight + building.ResidentialDemand
	}
	return potential
}

func recommendationReason(stats NetworkOptimizationStats, baseline NetworkOptimizationStats) string {
	demandGain := stats.UniqueDemandBuildings - baseline.UniqueDemandBuildings
	residentialGain := stats.UniqueResidentialBuildings - baseline.UniqueResidentialBuildings
	overlapDelta := stats.OverlapBuildings - baseline.OverlapBuildings
	return fmt.Sprintf("adds %d demand and %d residential buildings with overlap change %+d", demandGain, residentialGain, overlapDelta)
}
