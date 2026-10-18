package raytracer

import (
	"context"
	"sort"
)

// MaxNetworkComparisonBuildings bounds the per-building list in a comparison response. Counts are always complete;
// only the list used for the map layer is truncated, deterministically by building ID.
const MaxNetworkComparisonBuildings = 5000

const (
	ComparisonNewlyServed    = "newly_served"
	ComparisonNewlyLost      = "newly_lost"
	ComparisonOverlapGained  = "overlap_gained"
	ComparisonOverlapRemoved = "overlap_removed"
)

type NetworkComparisonRequestInput struct {
	A NetworkOptimizationRequestInput `json:"a"`
	B NetworkOptimizationRequestInput `json:"b"`
}

type NetworkComparisonRequest struct {
	A NetworkOptimizationRequest
	B NetworkOptimizationRequest
}

func (input NetworkComparisonRequestInput) ToRequest() NetworkComparisonRequest {
	return NetworkComparisonRequest{A: input.A.ToRequest(), B: input.B.ToRequest()}
}

func (input NetworkComparisonRequestInput) MissingRequiredTowerFields() bool {
	return input.A.MissingRequiredTowerFields() || input.B.MissingRequiredTowerFields()
}

type NetworkComparisonCounts struct {
	NewlyServed    int `json:"newly_served"`
	NewlyLost      int `json:"newly_lost"`
	OverlapGained  int `json:"overlap_gained"`
	OverlapRemoved int `json:"overlap_removed"`
}

// NetworkComparisonAggregates are the network-wide KPIs of each plan from the same per-building results.
type NetworkComparisonAggregates struct {
	UniqueDemandBuildingsA int `json:"unique_demand_buildings_a"`
	UniqueDemandBuildingsB int `json:"unique_demand_buildings_b"`
	OverlapBuildingsA      int `json:"overlap_buildings_a"`
	OverlapBuildingsB      int `json:"overlap_buildings_b"`
}

type NetworkComparisonBuilding struct {
	ID    string  `json:"id"`
	Lon   float64 `json:"lon"`
	Lat   float64 `json:"lat"`
	Class string  `json:"class"`
}

type NetworkComparisonResponse struct {
	Counts               NetworkComparisonCounts     `json:"counts"`
	Aggregates           NetworkComparisonAggregates `json:"aggregates"`
	Buildings            []NetworkComparisonBuilding `json:"buildings"`
	BuildingsTruncated   bool                        `json:"buildings_truncated"`
	ScenarioFingerprintA string                      `json:"scenario_fingerprint_a"`
	ScenarioFingerprintB string                      `json:"scenario_fingerprint_b"`
	ServiceThresholdDBm  float64                     `json:"service_threshold_dbm"`
	Classification       string                      `json:"classification"`
}

type networkBuildingStates struct {
	demandServed map[string]struct{}
	overlap      map[string]struct{}
	stats        NetworkOptimizationStats
	locations    map[string]Point
}

func evaluateNetworkBuildingStates(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex) (networkBuildingStates, error) {
	NormalizeNetworkOptimizationRequest(&req)
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return networkBuildingStates{}, err
	}
	azimuths := make([]float64, len(req.Towers))
	for index, tower := range req.Towers {
		azimuths[index] = normalizeDegrees(tower.AzimuthDeg)
	}
	stats, err := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
	if err != nil {
		return networkBuildingStates{}, err
	}
	servedCounts, bestRx, _, err := networkServedBuildings(ctx, req, azimuths, buildings, prepared)
	if err != nil {
		return networkBuildingStates{}, err
	}
	states := networkBuildingStates{demandServed: map[string]struct{}{}, overlap: map[string]struct{}{}, stats: stats, locations: map[string]Point{}}
	for buildingID := range bestRx {
		building := prepared.RelevantBuildings[buildingID]
		if building == nil {
			continue
		}
		if _, relevant := prepared.RelevantDemandBuildings[buildingID]; relevant {
			states.demandServed[buildingID] = struct{}{}
		}
		if servedCounts[buildingID] > 1 {
			states.overlap[buildingID] = struct{}{}
		}
		point, ok := PolygonCentroid(building.Vertices)
		if !ok {
			point = Point{Lon: (building.Bounds.MinLon + building.Bounds.MaxLon) / 2, Lat: (building.Bounds.MinLat + building.Bounds.MaxLat) / 2}
		}
		states.locations[buildingID] = point
	}
	return states, nil
}

// CompareNetworksContext evaluates plans A and B on the same building index (and therefore the same dataset and
// model) and classifies each building whose served or overlap state differs. It adds no physics: served and overlap
// use exactly the network-evaluation definitions.
func CompareNetworksContext(ctx context.Context, req NetworkComparisonRequest, buildings *BuildingIndex) (NetworkComparisonResponse, error) {
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}
	a, err := evaluateNetworkBuildingStates(ctx, req.A, buildings)
	if err != nil {
		return NetworkComparisonResponse{}, err
	}
	b, err := evaluateNetworkBuildingStates(ctx, req.B, buildings)
	if err != nil {
		return NetworkComparisonResponse{}, err
	}
	response := NetworkComparisonResponse{
		Aggregates: NetworkComparisonAggregates{
			UniqueDemandBuildingsA: a.stats.UniqueDemandBuildings,
			UniqueDemandBuildingsB: b.stats.UniqueDemandBuildings,
			OverlapBuildingsA:      a.stats.OverlapBuildings,
			OverlapBuildingsB:      b.stats.OverlapBuildings,
		},
		Buildings:            []NetworkComparisonBuilding{},
		ScenarioFingerprintA: NetworkScenarioFingerprint(req.A),
		ScenarioFingerprintB: NetworkScenarioFingerprint(req.B),
		ServiceThresholdDBm:  BuildingServiceThresholdDBm,
		Classification:       "Demand buildings served above the building service threshold in one plan only; overlap is a relevant building served by more than one Cell.",
	}
	location := func(id string) Point {
		if point, ok := b.locations[id]; ok {
			return point
		}
		return a.locations[id]
	}
	var changed []NetworkComparisonBuilding
	add := func(id, class string) {
		point := location(id)
		changed = append(changed, NetworkComparisonBuilding{ID: id, Lon: roundFloat(point.Lon, 7), Lat: roundFloat(point.Lat, 7), Class: class})
	}
	for id := range b.demandServed {
		if _, before := a.demandServed[id]; !before {
			response.Counts.NewlyServed++
			add(id, ComparisonNewlyServed)
		}
	}
	for id := range a.demandServed {
		if _, after := b.demandServed[id]; !after {
			response.Counts.NewlyLost++
			add(id, ComparisonNewlyLost)
		}
	}
	for id := range b.overlap {
		if _, before := a.overlap[id]; !before {
			response.Counts.OverlapGained++
			add(id, ComparisonOverlapGained)
		}
	}
	for id := range a.overlap {
		if _, after := b.overlap[id]; !after {
			response.Counts.OverlapRemoved++
			add(id, ComparisonOverlapRemoved)
		}
	}
	sort.Slice(changed, func(i, j int) bool {
		if changed[i].ID == changed[j].ID {
			return changed[i].Class < changed[j].Class
		}
		return changed[i].ID < changed[j].ID
	})
	response.Buildings, response.BuildingsTruncated = boundComparisonBuildings(changed, MaxNetworkComparisonBuildings)
	return response, nil
}

// boundComparisonBuildings keeps the first limit entries of an ID-sorted list; counts are computed before bounding.
func boundComparisonBuildings(changed []NetworkComparisonBuilding, limit int) ([]NetworkComparisonBuilding, bool) {
	if changed == nil {
		return []NetworkComparisonBuilding{}, false
	}
	if len(changed) > limit {
		return changed[:limit], true
	}
	return changed, false
}
