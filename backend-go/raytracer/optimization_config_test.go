package raytracer

import "testing"

func TestDefaultOptimizationScorePreservesLegacyCombinedScore(t *testing.T) {
	stats := NetworkOptimizationStats{DemandScore: 100, ResidentialScore: 200, CoverageScore: 300, OverlapPenalty: 50}
	if score := OptimizationObjectiveScore(stats, DefaultOptimizationConfig()); score != stats.DemandScore+stats.ResidentialScore+stats.CoverageScore-stats.OverlapPenalty {
		t.Fatalf("objective score = %v", score)
	}
}

func TestOptimizationConstraintsAndParetoFrontierAreInspectable(t *testing.T) {
	minimumDemand, maximumOverlap := 2, 1
	config := OptimizationConfig{
		Objectives:  []OptimizationObjective{{ID: "coverage", Weight: 2}, {ID: "overlap", Weight: 1}},
		Constraints: OptimizationConstraints{MinUniqueDemandBuildings: &minimumDemand, MaxOverlapBuildings: &maximumOverlap},
	}
	if validationError := ValidateOptimizationConfig(config); validationError != "" {
		t.Fatalf("valid config rejected: %s", validationError)
	}
	violations := OptimizationConstraintViolations(NetworkOptimizationStats{UniqueDemandBuildings: 1, OverlapBuildings: 3}, config.Constraints)
	if len(violations) != 2 {
		t.Fatalf("violations = %v", violations)
	}
	candidates := []networkOptimizationCandidate{
		{Azimuths: []float64{0}, Stats: NetworkOptimizationStats{CoverageScore: 10, OverlapBuildings: 1, UniqueDemandBuildings: 2}},
		{Azimuths: []float64{10}, Stats: NetworkOptimizationStats{CoverageScore: 9, OverlapBuildings: 1, UniqueDemandBuildings: 2}},
		{Azimuths: []float64{20}, Stats: NetworkOptimizationStats{CoverageScore: 12, OverlapBuildings: 2, UniqueDemandBuildings: 2}},
	}
	frontier := networkParetoFrontier(candidates, []NetworkTowerRequest{{ID: "a"}}, config)
	if len(frontier) != 1 || frontier[0].Towers[0].AzimuthDeg != 0 || frontier[0].Explanation == "" {
		t.Fatalf("frontier = %+v", frontier)
	}
}
