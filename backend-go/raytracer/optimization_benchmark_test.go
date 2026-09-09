package raytracer

import (
	"context"
	"os"
	"reflect"
	"testing"
)

// canonicalAnkaraNetworkOptimizationRequest is the repository-defined six-cell
// regression scenario used for semantic and runtime comparisons. The fixture
// deliberately keeps the legacy objective ID "coverage" for API compatibility;
// its presentation name is Propagation reach.
func canonicalAnkaraNetworkOptimizationRequest() NetworkOptimizationRequest {
	return NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "LTE-35084", TowerLon: 32.8477, TowerLat: 39.9113, AzimuthDeg: 0},
			{ID: "LTE-35104", TowerLon: 32.8585, TowerLat: 39.9081, AzimuthDeg: 60},
			{ID: "LTE-35877", TowerLon: 32.8488, TowerLat: 39.9240, AzimuthDeg: 120},
			{ID: "LTE-313100", TowerLon: 32.8677, TowerLat: 39.9054, AzimuthDeg: 180},
			{ID: "LTE-313110", TowerLon: 32.8639, TowerLat: 39.9062, AzimuthDeg: 240},
			{ID: "LTE-322828", TowerLon: 32.8523, TowerLat: 39.9135, AzimuthDeg: 300},
		},
		Rays:         72,
		RadiusMeters: 400,
		FrequencyGHz: 28,
		TxPowerDBm:   30,
		BeamWidthDeg: 120,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{
			{ID: "demand", Weight: 50},
			{ID: "residential", Weight: 50},
			{ID: "coverage", Weight: 50},
			{ID: "overlap", Weight: 50},
		}},
	}
}

func TestCanonicalAnkaraOptimizationFixtureIsStable(t *testing.T) {
	first := canonicalAnkaraNetworkOptimizationRequest()
	second := canonicalAnkaraNetworkOptimizationRequest()
	if !reflect.DeepEqual(first, second) {
		t.Fatal("canonical Ankara optimization fixture is not deterministic")
	}
	if len(first.Towers) != 6 || first.Rays != 72 || first.RadiusMeters != 400 || first.FrequencyGHz != 28 || first.TxPowerDBm != 30 || first.BeamWidthDeg != 120 {
		t.Fatalf("canonical fixture settings = %+v", first)
	}
}

func TestCanonicalAnkaraOptimizationIsDeterministicWhenDatasetIsEnabled(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_BENCHMARK") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_BENCHMARK=1 to run the Ankara dataset regression")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}
	request := canonicalAnkaraNetworkOptimizationRequest()
	first, err := OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("first canonical optimization: %v", err)
	}
	second, err := OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("second canonical optimization: %v", err)
	}
	if !reflect.DeepEqual(first.Stats, second.Stats) || !reflect.DeepEqual(first.Optimization, second.Optimization) || !reflect.DeepEqual(first.ParetoFrontier, second.ParetoFrontier) {
		t.Fatal("canonical Ankara optimization produced non-deterministic results")
	}
	t.Logf("domain=%+v raw=%+v objectives=%+v score=%.4f recommended=%v pareto=%d azimuths=%v", first.OptimizationDomain, first.Stats.RawMetrics, first.Stats.Objectives, first.Stats.Score, first.Optimization.Recommended, len(first.ParetoFrontier), first.OptimizedTowers)
}

func BenchmarkCanonicalAnkaraNetworkOptimization(b *testing.B) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		b.Skip("set ATOM_DATASET_DIR to benchmark the Ankara dataset")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		b.Fatalf("load canonical dataset: %v", err)
	}
	request := canonicalAnkaraNetworkOptimizationRequest()
	b.ReportAllocs()
	b.ResetTimer()
	var result NetworkOptimizationResponse
	for index := 0; index < b.N; index++ {
		result, err = OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
		if err != nil {
			b.Fatalf("canonical optimization: %v", err)
		}
	}
	b.StopTimer()
	b.ReportMetric(result.Stats.RawMetrics.RelevantDemandWeight, "relevant_demand_weight")
	b.ReportMetric(float64(result.Stats.RawMetrics.RelevantResidentialTotal), "relevant_residential_entities")
	b.ReportMetric(float64(len(result.ParetoFrontier)), "pareto_solutions")
}
