package raytracer

import (
	"context"
	"encoding/json"
	"math"
	"testing"
)

func areaOfInterestFixture() (NetworkOptimizationRequest, *BuildingIndex) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	req := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "east", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90},
			{ID: "west", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 270},
		},
		Rays:         72,
		RadiusMeters: 250,
		FrequencyGHz: 2.6,
		TxPowerDBm:   43,
		BeamWidthDeg: 120,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 50}, {ID: "residential", Weight: 50}, {ID: "coverage", Weight: 50}, {ID: "overlap", Weight: 50}}},
	}
	buildings := []*BuildingFootprint{
		optimizationFootprintForTest("east-near", DestinationPoint(origin, 90, 60), 4, 10, 2),
		optimizationFootprintForTest("east-far", DestinationPoint(origin, 80, 140), 4, 6, 0),
		optimizationFootprintForTest("west-near", DestinationPoint(origin, 270, 60), 4, 8, 3),
		optimizationFootprintForTest("west-far", DestinationPoint(origin, 260, 140), 4, 4, 1),
	}
	return req, NewBuildingIndex(buildings)
}

func squareAround(center Point, halfMeters float64) []Point {
	return []Point{
		DestinationPoint(DestinationPoint(center, 180, halfMeters), 270, halfMeters),
		DestinationPoint(DestinationPoint(center, 180, halfMeters), 90, halfMeters),
		DestinationPoint(DestinationPoint(center, 0, halfMeters), 90, halfMeters),
		DestinationPoint(DestinationPoint(center, 0, halfMeters), 270, halfMeters),
	}
}

func evaluateForArea(t *testing.T, area []Point) NetworkOptimizationStats {
	t.Helper()
	req, index := areaOfInterestFixture()
	req.AreaOfInterest = area
	result, err := EvaluateNetworkContext(context.Background(), req, index)
	if err != nil {
		t.Fatalf("evaluate network: %v", err)
	}
	return result.Stats
}

func TestAreaOfInterestIsASubsetAggregationOfTheSamePerBuildingResults(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	network := evaluateForArea(t, nil)
	if network.AreaOfInterest != nil {
		t.Fatalf("stats without an area carry area_of_interest = %+v", network.AreaOfInterest)
	}
	if network.RawMetrics.CoveredUnits == 0 || network.UniqueDemandBuildings == 0 {
		t.Fatalf("fixture serves no buildings: %+v", network.RawMetrics)
	}
	eastOnly := squareAround(DestinationPoint(origin, 90, 100), 70)

	cases := []struct {
		name  string
		area  []Point
		check func(t *testing.T, area AreaOfInterestStats, network NetworkOptimizationStats)
	}{
		{"covers the whole domain", squareAround(origin, 1000), func(t *testing.T, area AreaOfInterestStats, network NetworkOptimizationStats) {
			if area.CoveredUnits != network.RawMetrics.CoveredUnits || area.ResidentialCovered != network.UniqueResidentialBuildings || area.OverlapBuildings != network.OverlapBuildings {
				t.Fatalf("whole-domain area %+v differs from network %+v", area, network.RawMetrics)
			}
			if math.Abs(area.ServedDemandWeight-network.RawMetrics.ServedDemandWeight) > 1e-9 || math.Abs(area.RelevantDemandWeight-network.RawMetrics.RelevantDemandWeight) > 1e-9 {
				t.Fatalf("whole-domain demand %+v differs from network %+v", area, network.RawMetrics)
			}
			if area.RelevantResidentialTotal != network.RawMetrics.RelevantResidentialTotal {
				t.Fatalf("residential totals %d vs %d", area.RelevantResidentialTotal, network.RawMetrics.RelevantResidentialTotal)
			}
		}},
		{"covers none of the domain", squareAround(DestinationPoint(origin, 0, 5000), 50), func(t *testing.T, area AreaOfInterestStats, _ NetworkOptimizationStats) {
			if area != (AreaOfInterestStats{}) {
				t.Fatalf("empty area stats = %+v, want zeros", area)
			}
		}},
		{"covers part of the domain", eastOnly, func(t *testing.T, area AreaOfInterestStats, network NetworkOptimizationStats) {
			if area.RelevantBuildings != 2 || area.RelevantDemandWeight != 16 || area.RelevantResidentialTotal != 1 {
				t.Fatalf("east area relevant set = %+v, want the two east buildings", area)
			}
			if area.CoveredUnits == 0 || area.CoveredUnits == network.RawMetrics.CoveredUnits {
				t.Fatalf("partial area covers %d of %d units; want a strict, non-empty subset", area.CoveredUnits, network.RawMetrics.CoveredUnits)
			}
			if area.CoveredUnits > network.RawMetrics.CoveredUnits || area.ServedDemandWeight > network.RawMetrics.ServedDemandWeight+1e-9 || area.ResidentialCovered > network.UniqueResidentialBuildings || area.OverlapBuildings > network.OverlapBuildings {
				t.Fatalf("partial area %+v exceeds network %+v", area, network.RawMetrics)
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stats := evaluateForArea(t, tc.area)
			if stats.AreaOfInterest == nil {
				t.Fatal("area_of_interest missing")
			}
			tc.check(t, *stats.AreaOfInterest, network)
		})
	}
}

func TestAreaOfInterestDoesNotChangeScoresOrFingerprint(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	withoutArea := evaluateForArea(t, nil)
	withArea := evaluateForArea(t, squareAround(DestinationPoint(origin, 90, 100), 70))
	withArea.AreaOfInterest = nil
	left, _ := json.Marshal(withoutArea)
	right, _ := json.Marshal(withArea)
	if string(left) != string(right) {
		t.Fatalf("stats changed with an area of interest:\n%s\n%s", left, right)
	}
	req, _ := areaOfInterestFixture()
	scoped := req
	scoped.AreaOfInterest = squareAround(origin, 100)
	if NetworkScenarioFingerprint(req) != NetworkScenarioFingerprint(scoped) {
		t.Fatal("the area of interest changed the scenario fingerprint")
	}
}

func TestValidateAreaOfInterest(t *testing.T) {
	tooMany := make([]Point, MaxSearchPolygonCoordinates+1)
	for index := range tooMany {
		tooMany[index] = Point{Lon: 32.85, Lat: 39.92}
	}
	cases := []struct {
		name string
		area []Point
		want string
	}{
		{"absent", nil, ""},
		{"triangle", []Point{{32.84, 39.91}, {32.86, 39.91}, {32.85, 39.93}}, ""},
		{"two points", []Point{{32.84, 39.91}, {32.86, 39.91}}, "aoi must contain at least 3 coordinates"},
		{"too many points", tooMany, "aoi must contain no more than 256 coordinates"},
		{"latitude out of range", []Point{{32.84, 39.91}, {32.86, 91}, {32.85, 39.93}}, "aoi contains an invalid coordinate"},
		{"malformed coordinate", areaOfInterestPoints([][]float64{{32.84, 39.91}, {32.86}, {32.85, 39.93}}), "aoi contains an invalid coordinate"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ValidateAreaOfInterest(tc.area); got != tc.want {
				t.Fatalf("ValidateAreaOfInterest = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestAreaOfInterestReachesEveryReportedSolution(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	req, index := areaOfInterestFixture()
	req.AreaOfInterest = squareAround(origin, 1000)
	result, err := EvaluateNetworkContext(context.Background(), req, index)
	if err != nil {
		t.Fatalf("evaluate network: %v", err)
	}
	if result.Stats.AreaOfInterest == nil {
		t.Fatal("response stats lack area_of_interest")
	}
	for index, solution := range result.ParetoFrontier {
		if solution.Stats.AreaOfInterest == nil {
			t.Fatalf("pareto solution %d lacks area_of_interest", index)
		}
	}
}
