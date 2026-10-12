package raytracer

import (
	"context"
	"math"
	"reflect"
	"testing"
)

func TestOptimizeNetworkRetainsBaselineConfigurationAndPreparedDomain(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testDemandBuildingAt(t, "baseline-demand", DestinationPoint(origin, 90, 24), 4)
	req := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 17},
			{ID: "b", TowerLon: origin.Lon - 0.00005, TowerLat: origin.Lat, AzimuthDeg: 203},
		},
		Rays:         8,
		RadiusMeters: 120,
		FrequencyGHz: 2.6,
		TxPowerDBm:   31,
		BeamWidthDeg: 80,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{
			{ID: "demand", Weight: 50},
			{ID: "coverage", Weight: 50},
		}},
	}
	expectedRequest := req
	NormalizeNetworkOptimizationRequest(&expectedRequest)
	result := mustResult(OptimizeNetworkContext(context.Background(), req, buildings))
	if result.Baseline == nil {
		t.Fatal("optimization response omitted the authoritative baseline")
	}
	if len(result.Baseline.CellConfigurations) != len(expectedRequest.Towers) {
		t.Fatalf("baseline cell configurations = %d, want %d", len(result.Baseline.CellConfigurations), len(expectedRequest.Towers))
	}
	for index, expectedTower := range expectedRequest.Towers {
		actual := result.Baseline.CellConfigurations[index]
		if actual.ID != expectedTower.ID || actual.TowerLon != expectedTower.TowerLon || actual.TowerLat != expectedTower.TowerLat {
			t.Fatalf("baseline cell %d identity = %+v, want %+v", index, actual, expectedTower)
		}
		if actual.AzimuthDeg != normalizeDegrees(expectedTower.AzimuthDeg) {
			t.Fatalf("baseline cell %d azimuth = %.1f, want %.1f", index, actual.AzimuthDeg, expectedTower.AzimuthDeg)
		}
		if !reflect.DeepEqual(actual.RFProfile, expectedTower.RFProfile) {
			t.Fatalf("baseline cell %d RF profile = %+v, want %+v", index, actual.RFProfile, expectedTower.RFProfile)
		}
	}
	if result.Baseline.Parameters != networkOptimizationParameters(expectedRequest) {
		t.Fatalf("baseline parameters = %+v, want %+v", result.Baseline.Parameters, networkOptimizationParameters(expectedRequest))
	}
	if result.Baseline.Stats.RawMetrics.RelevantDemandWeight != result.Stats.RawMetrics.RelevantDemandWeight {
		t.Fatalf("demand denominators differ: baseline %.4f optimized %.4f", result.Baseline.Stats.RawMetrics.RelevantDemandWeight, result.Stats.RawMetrics.RelevantDemandWeight)
	}
	if result.Baseline.Stats.RawMetrics.RelevantResidentialTotal != result.Stats.RawMetrics.RelevantResidentialTotal {
		t.Fatalf("residential denominators differ: baseline %d optimized %d", result.Baseline.Stats.RawMetrics.RelevantResidentialTotal, result.Stats.RawMetrics.RelevantResidentialTotal)
	}
	if result.Baseline.Stats.RawMetrics.PropagationReachMaximum != result.Stats.RawMetrics.PropagationReachMaximum {
		t.Fatalf("propagation maximums differ: baseline %.4f optimized %.4f", result.Baseline.Stats.RawMetrics.PropagationReachMaximum, result.Stats.RawMetrics.PropagationReachMaximum)
	}
	if len(result.ParetoFrontier) == 0 || result.Optimization.RecommendedSolutionID == "" {
		t.Fatalf("recommended solution identity = %q, frontier size = %d", result.Optimization.RecommendedSolutionID, len(result.ParetoFrontier))
	}
	if result.Optimization.RecommendedSolutionID != result.ParetoFrontier[0].ID {
		t.Fatalf("recommended solution ID = %q, top frontier ID = %q", result.Optimization.RecommendedSolutionID, result.ParetoFrontier[0].ID)
	}
}

func TestOptimizeNetworkRetainsInfeasibleBaseline(t *testing.T) {
	minimumDemand := 1
	req := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "a", TowerLon: 32, TowerLat: 39, AzimuthDeg: 0},
			{ID: "b", TowerLon: 32.0001, TowerLat: 39, AzimuthDeg: 180},
		},
		Rays:         8,
		RadiusMeters: 100,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 80,
		Optimization: OptimizationConfig{
			Objectives:  []OptimizationObjective{{ID: "coverage", Weight: 100}},
			Constraints: OptimizationConstraints{MinUniqueDemandBuildings: &minimumDemand},
		},
	}
	result := mustResult(OptimizeNetworkContext(context.Background(), req, EmptyBuildingIndex()))
	if result.Baseline == nil || result.Baseline.ConstraintsSatisfied {
		t.Fatalf("baseline = %+v, want retained infeasible snapshot", result.Baseline)
	}
	if len(result.Baseline.Violations) == 0 || result.Optimization.Recommended {
		t.Fatalf("baseline violations = %v, recommended = %v", result.Baseline.Violations, result.Optimization.Recommended)
	}
	if len(result.ParetoFrontier) != 0 || len(result.OptimizedTowers) != 0 {
		t.Fatalf("infeasible optimization returned optimized solutions: frontier=%d towers=%d", len(result.ParetoFrontier), len(result.OptimizedTowers))
	}
}

func TestOptimizeNetworkBaselineAndRecommendedUseOnePreparedDomain(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	building := optimizationFootprintForTest("domain-invariant", DestinationPoint(origin, 90, 24), 4, 12, 1)
	req := optimizationRequestForTest(origin, 100)
	req.Towers = append(req.Towers, NetworkTowerRequest{ID: "second", TowerLon: origin.Lon + 0.00005, TowerLat: origin.Lat, AzimuthDeg: 180})
	req.Rays = 8
	req.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}}
	result := mustResult(OptimizeNetworkContext(context.Background(), req, NewBuildingIndex([]*BuildingFootprint{building})))
	if result.Baseline == nil || len(result.ParetoFrontier) == 0 {
		t.Fatalf("optimization result lacks comparable baseline/frontier: baseline=%v frontier=%d", result.Baseline != nil, len(result.ParetoFrontier))
	}
	for index, solution := range result.ParetoFrontier {
		if solution.Stats.RawMetrics.RelevantDemandWeight != result.Baseline.Stats.RawMetrics.RelevantDemandWeight {
			t.Fatalf("frontier %d demand denominator = %.4f, baseline = %.4f", index, solution.Stats.RawMetrics.RelevantDemandWeight, result.Baseline.Stats.RawMetrics.RelevantDemandWeight)
		}
		if solution.Stats.RawMetrics.RelevantResidentialTotal != result.Baseline.Stats.RawMetrics.RelevantResidentialTotal {
			t.Fatalf("frontier %d residential denominator = %d, baseline = %d", index, solution.Stats.RawMetrics.RelevantResidentialTotal, result.Baseline.Stats.RawMetrics.RelevantResidentialTotal)
		}
		if solution.Stats.RawMetrics.PropagationReachMaximum != result.Baseline.Stats.RawMetrics.PropagationReachMaximum {
			t.Fatalf("frontier %d propagation maximum = %.4f, baseline = %.4f", index, solution.Stats.RawMetrics.PropagationReachMaximum, result.Baseline.Stats.RawMetrics.PropagationReachMaximum)
		}
	}
	if math.IsNaN(result.Baseline.Stats.Score) || math.IsInf(result.Baseline.Stats.Score, 0) {
		t.Fatalf("baseline score = %v", result.Baseline.Stats.Score)
	}
}
