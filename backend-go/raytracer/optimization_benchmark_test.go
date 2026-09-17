package raytracer

import (
	"context"
	"math"
	"os"
	"reflect"
	"sort"
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
	if !reflect.DeepEqual(first.Baseline, second.Baseline) ||
		!reflect.DeepEqual(first.Stats, second.Stats) ||
		!reflect.DeepEqual(first.Optimization, second.Optimization) ||
		!reflect.DeepEqual(first.ParetoFrontier, second.ParetoFrontier) {
		t.Fatal("canonical Ankara optimization produced non-deterministic results")
	}
	if first.Baseline != nil {
		baselineRaw := first.Baseline.Stats.RawMetrics
		optimizedRaw := first.Stats.RawMetrics
		if math.Abs(baselineRaw.ServedDemandWeight-185) > 1e-6 || baselineRaw.ResidentialCovered != 28 || math.Abs(baselineRaw.PropagationReachScore-16013.3051) > 1e-4 || math.Abs(baselineRaw.OverlapRatio-0.098361) > 1e-6 || math.Abs(first.Baseline.Stats.Score-33.7894) > 1e-4 {
			t.Fatalf("canonical compatibility baseline changed: raw=%+v score=%.6f", baselineRaw, first.Baseline.Stats.Score)
		}
		if math.Abs(optimizedRaw.ServedDemandWeight-555) > 1e-6 || optimizedRaw.ResidentialCovered != 43 || math.Abs(optimizedRaw.PropagationReachScore-19548.6910) > 1e-4 || math.Abs(optimizedRaw.OverlapRatio) > 1e-6 || math.Abs(first.Stats.Score-41.1715) > 1e-4 {
			t.Fatalf("canonical compatibility optimized result changed: raw=%+v score=%.6f", optimizedRaw, first.Stats.Score)
		}
		if len(first.ParetoFrontier) != 6 || len(first.OptimizedTowers) != 6 || first.Optimization.RecommendedSolutionID != "70.0,20.0,130.0,160.0,290.0,110.0" {
			t.Fatalf("canonical compatibility recommendation changed: pareto=%d recommended=%s towers=%v", len(first.ParetoFrontier), first.Optimization.RecommendedSolutionID, first.OptimizedTowers)
		}
		t.Logf("comparison baseline={demand=%.4f residential=%d reach=%.4f overlap=%.6f score=%.4f feasible=%v} optimized={demand=%.4f residential=%d reach=%.4f overlap=%.6f score=%.4f feasible=%v} deltas={demand=%.4f residential=%d reach=%.4f overlap=%.6f score=%.4f}",
			baselineRaw.ServedDemandWeight, baselineRaw.ResidentialCovered, baselineRaw.PropagationReachScore, baselineRaw.OverlapRatio, first.Baseline.Stats.Score, first.Baseline.ConstraintsSatisfied,
			optimizedRaw.ServedDemandWeight, optimizedRaw.ResidentialCovered, optimizedRaw.PropagationReachScore, optimizedRaw.OverlapRatio, first.Stats.Score, first.Optimization.ConstraintsSatisfied,
			optimizedRaw.ServedDemandWeight-baselineRaw.ServedDemandWeight, optimizedRaw.ResidentialCovered-baselineRaw.ResidentialCovered, optimizedRaw.PropagationReachScore-baselineRaw.PropagationReachScore, optimizedRaw.OverlapRatio-baselineRaw.OverlapRatio, first.Stats.Score-first.Baseline.Stats.Score)
	}
	paretoIDs := make([]string, 0, len(first.ParetoFrontier))
	seenParetoIDs := make(map[string]struct{}, len(first.ParetoFrontier))
	for index, solution := range first.ParetoFrontier {
		if solution.ID == "" {
			t.Fatalf("pareto solution %d has no stable ID", index)
		}
		if _, exists := seenParetoIDs[solution.ID]; exists {
			t.Fatalf("duplicate Pareto solution ID %q", solution.ID)
		}
		seenParetoIDs[solution.ID] = struct{}{}
		paretoIDs = append(paretoIDs, solution.ID)
		raw := solution.Stats.RawMetrics
		t.Logf("pareto[%d] id=%s score=%.4f demand=%.4f residential=%d reach=%.4f overlap=%.6f utilities=%+v", index, solution.ID, solution.Score, raw.ServedDemandWeight, raw.ResidentialCovered, raw.PropagationReachScore, raw.OverlapRatio, solution.Stats.Objectives)
	}
	if len(first.ParetoFrontier) > 0 {
		t.Logf("pareto rank order=%v recommended=%s", paretoIDs, first.Optimization.RecommendedSolutionID)
	}
	if len(first.ParetoFrontier) > 1 {
		alternateConfigs := []struct {
			name   string
			config OptimizationConfig
		}{
			{name: "demand-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}}}},
			{name: "residential-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "residential", Weight: 100}}}},
			{name: "reach-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}}},
			{name: "overlap-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "overlap", Weight: 100}}}},
		}
		changedRecommendation := false
		for _, alternate := range alternateConfigs {
			ranked, rankErr := rankStoredParetoSolutions(first.ParetoFrontier, alternate.config)
			if rankErr != nil {
				t.Fatalf("rank stored Pareto frontier for %s: %v", alternate.name, rankErr)
			}
			alternateIDs := make([]string, 0, len(ranked))
			for _, solution := range ranked {
				alternateIDs = append(alternateIDs, solution.ID)
			}
			if !sameParetoIDs(paretoIDs, alternateIDs) {
				t.Fatalf("alternate %s changed stored Pareto membership: baseline=%v alternate=%v", alternate.name, paretoIDs, alternateIDs)
			}
			t.Logf("alternate priorities=%s rank order=%v recommended=%s", alternate.name, alternateIDs, alternateIDs[0])
			if alternateIDs[0] != first.Optimization.RecommendedSolutionID {
				changedRecommendation = true
			}
		}
		if !changedRecommendation {
			t.Fatalf("canonical Pareto frontier did not change recommendation under alternate priorities: %v", paretoIDs)
		}
	}
	t.Logf("domain=%+v objectives=%+v recommended=%v recommended_id=%s pareto=%d azimuths=%v", first.OptimizationDomain, first.Stats.Objectives, first.Optimization.Recommended, first.Optimization.RecommendedSolutionID, len(first.ParetoFrontier), first.OptimizedTowers)
}

func TestCanonicalAnkaraCellExplanationMatchesIndependentEvaluationWhenDatasetIsEnabled(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_BENCHMARK") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_BENCHMARK=1 to run the Ankara explanation regression")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}
	request := canonicalAnkaraNetworkOptimizationRequest()
	result, err := OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical optimization for explanation: %v", err)
	}
	if result.Baseline == nil {
		t.Fatal("canonical optimization did not retain a baseline")
	}

	var selected NetworkParetoSolution
	cellID := ""
	for _, candidate := range result.ParetoFrontier {
		for _, setting := range candidate.Towers {
			for _, baselineCell := range result.Baseline.CellConfigurations {
				if setting.ID == baselineCell.ID && math.Abs(normalizeDegrees(setting.AzimuthDeg)-normalizeDegrees(baselineCell.AzimuthDeg)) > 0.000001 {
					selected = candidate
					cellID = setting.ID
					break
				}
			}
			if cellID != "" {
				break
			}
		}
		if cellID != "" {
			break
		}
	}
	if cellID == "" {
		t.Fatal("canonical Pareto frontier contains no cell with a changed azimuth")
	}

	explanationRequest := NetworkCellExplanationRequest{
		RunID:              result.OptimizationRunID,
		SolutionID:         selected.ID,
		CellID:             cellID,
		Baseline:           result.Baseline,
		Solution:           &selected,
		Optimization:       &request.Optimization,
		OptimizationDomain: &result.OptimizationDomain,
	}
	explanation, err := ExplainNetworkCellContext(context.Background(), explanationRequest, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical cell explanation: %v", err)
	}
	if !explanation.Available || explanation.Unchanged {
		t.Fatalf("canonical explanation availability=%v unchanged=%v", explanation.Available, explanation.Unchanged)
	}

	selectedRequest, baselineRequest, selectedAzimuths, cell, err := buildNetworkCellExplanationRequests(*result.Baseline, selected, request.Optimization, cellID)
	if err != nil {
		t.Fatalf("reconstruct canonical explanation requests: %v", err)
	}
	prepared, err := prepareNetworkOptimizationContext(context.Background(), baselineRequest, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("prepare canonical explanation context: %v", err)
	}
	if !sameOptimizationDomainMetadata(prepared.DomainMetadata, result.OptimizationDomain) {
		t.Fatalf("independent explanation domain=%+v differs from optimization domain=%+v", prepared.DomainMetadata, result.OptimizationDomain)
	}
	counterfactualAzimuths := append([]float64(nil), selectedAzimuths...)
	targetIndex := cellIndex(baselineRequest.Towers, cell.ID)
	counterfactualAzimuths[targetIndex] = cell.BaselineAzimuthDeg
	for index, tower := range selectedRequest.Towers {
		if tower.ID != cell.ID && normalizeDegrees(tower.AzimuthDeg) != normalizeDegrees(counterfactualAzimuths[index]) {
			t.Fatalf("non-target canonical cell %q changed from %.1f to %.1f", tower.ID, tower.AzimuthDeg, counterfactualAzimuths[index])
		}
	}
	independentBreakdown, err := networkCoverageScoreBreakdownPreparedContext(
		context.Background(),
		baselineRequestWithAzimuths(selectedRequest, counterfactualAzimuths),
		counterfactualAzimuths,
		pack.BuildingIndex,
		prepared,
	)
	if err != nil {
		t.Fatalf("independent canonical counterfactual: %v", err)
	}
	independentStats, err := scoreNetworkOptimization(independentBreakdown, request.Optimization, prepared.ObjectiveAvailability)
	if err != nil {
		t.Fatalf("score independent canonical counterfactual: %v", err)
	}
	independentStats = independentStats.rounded()
	if !reflect.DeepEqual(explanation.Counterfactual.RawMetrics, independentStats.RawMetrics) {
		t.Fatalf("canonical counterfactual raw metrics=%+v, independent=%+v", explanation.Counterfactual.RawMetrics, independentStats.RawMetrics)
	}
	expectedDelta := subtractExplanationMetrics(explanationMetricsFromStats(selected.Stats), explanationMetricsFromStats(independentStats))
	if !reflect.DeepEqual(explanation.Delta, expectedDelta) {
		t.Fatalf("canonical explanation delta=%+v, expected selected-minus-counterfactual=%+v", explanation.Delta, expectedDelta)
	}

	priorityOnly := explanationRequest
	priorityOnlyConfig := OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}}}
	priorityOnly.Optimization = &priorityOnlyConfig
	priorityExplanation, err := ExplainNetworkCellContext(context.Background(), priorityOnly, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical priority-only explanation: %v", err)
	}
	if !reflect.DeepEqual(priorityExplanation.Actual.RawMetrics, explanation.Actual.RawMetrics) || !reflect.DeepEqual(priorityExplanation.Counterfactual.RawMetrics, explanation.Counterfactual.RawMetrics) {
		t.Fatal("priority-only explanation changed raw marginal metrics")
	}
	if reflect.DeepEqual(priorityExplanation.Score.EffectiveWeights, explanation.Score.EffectiveWeights) {
		t.Fatal("priority-only explanation did not change effective score weights")
	}
}

func rankStoredParetoSolutions(frontier []NetworkParetoSolution, config OptimizationConfig) ([]NetworkParetoSolution, error) {
	ranked := append([]NetworkParetoSolution(nil), frontier...)
	for index := range ranked {
		stats, err := scoreNetworkOptimization(ranked[index].Stats, config)
		if err != nil {
			return nil, err
		}
		ranked[index].Stats = stats
		ranked[index].CompositeScore = stats.CompositeScore
		ranked[index].Score = stats.Score
	}
	sort.SliceStable(ranked, func(left, right int) bool {
		if ranked[left].Score == ranked[right].Score {
			return ranked[left].ID < ranked[right].ID
		}
		return ranked[left].Score > ranked[right].Score
	})
	return ranked, nil
}

func sameParetoIDs(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	leftSet := make(map[string]struct{}, len(left))
	for _, id := range left {
		leftSet[id] = struct{}{}
	}
	for _, id := range right {
		if _, exists := leftSet[id]; !exists {
			return false
		}
	}
	return true
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
