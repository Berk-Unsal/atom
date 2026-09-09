package raytracer

import (
	"math"
	"strings"
	"testing"
)

func TestNormalizeOptimizationPriorities(t *testing.T) {
	weights, err := NormalizeOptimizationPriorities([]OptimizationObjective{
		{ID: "demand", Weight: 80},
		{ID: "residential", Weight: 60},
		{ID: "coverage", Weight: 70},
		{ID: "overlap", Weight: 35},
	})
	if err != nil {
		t.Fatalf("normalize priorities: %v", err)
	}
	total := 0.0
	for _, weight := range weights {
		total += weight
	}
	if math.Abs(total-1) > 1e-12 {
		t.Fatalf("normalized priority total = %.12f, want 1", total)
	}
	if math.Abs(weights["demand"]-80.0/245.0) > 1e-12 {
		t.Fatalf("demand weight = %.12f, want %.12f", weights["demand"], 80.0/245.0)
	}
}

func TestZeroPriorityHasNoContribution(t *testing.T) {
	config := OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 0},
		{ID: "coverage", Weight: 100},
	}}
	stats := optimizationStatsForTest(1, 1, 1, 1, 1, 1, 1, 0)
	scored, err := scoreNetworkOptimization(stats, config)
	if err != nil {
		t.Fatalf("score optimization: %v", err)
	}
	if scored.ObjectiveBreakdown.Demand.Weight != 0 || scored.ObjectiveBreakdown.Demand.Contribution != 0 {
		t.Fatalf("zero-priority demand breakdown = %+v", scored.ObjectiveBreakdown.Demand)
	}
	if scored.ObjectiveBreakdown.Coverage.Weight != 1 {
		t.Fatalf("coverage normalized weight = %.6f, want 1", scored.ObjectiveBreakdown.Coverage.Weight)
	}
}

func TestAllZeroPrioritiesAreRejected(t *testing.T) {
	config := OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 0},
		{ID: "residential", Weight: 0},
		{ID: "coverage", Weight: 0},
		{ID: "overlap", Weight: 0},
	}}
	if validationError := ValidateOptimizationConfig(config); validationError == "" {
		t.Fatal("all-zero priorities were accepted")
	}
	if _, err := NormalizeOptimizationPriorities(config.Objectives); err == nil {
		t.Fatal("all-zero priorities were normalized without an error")
	}
}

func TestNormalizeOptimizationObjectivesUsesStableDenominators(t *testing.T) {
	stats := optimizationStatsForTest(120, 200, 3, 4, 90, 100, 10, 2)
	utilities := NormalizeOptimizationObjectives(stats)
	if math.Abs(utilities.Demand-0.6) > 1e-12 {
		t.Fatalf("demand utility = %.12f, want 0.6", utilities.Demand)
	}
	if math.Abs(utilities.Residential-0.75) > 1e-12 {
		t.Fatalf("residential utility = %.12f, want 0.75", utilities.Residential)
	}
	if math.Abs(utilities.Coverage-0.9) > 1e-12 {
		t.Fatalf("coverage utility = %.12f, want 0.9", utilities.Coverage)
	}
	if math.Abs(utilities.Overlap-0.8) > 1e-12 {
		t.Fatalf("overlap utility = %.12f, want 0.8", utilities.Overlap)
	}
	for id, utility := range map[string]float64{
		"demand": utilities.Demand, "residential": utilities.Residential,
		"coverage": utilities.Coverage, "overlap": utilities.Overlap,
	} {
		if utility < 0 || utility > 1 {
			t.Fatalf("%s utility = %.6f outside [0, 1]", id, utility)
		}
	}

	clamped := NormalizeOptimizationObjectives(optimizationStatsForTest(500, 100, 8, 4, 120, 100, 1, -2))
	if clamped.Demand != 1 || clamped.Residential != 1 || clamped.Coverage != 1 || clamped.Overlap != 1 {
		t.Fatalf("clamped utilities = %+v, want all 1", clamped)
	}
}

func TestCalculateCompositeScoreAndContributions(t *testing.T) {
	utilities := OptimizationUtilities{Demand: 0.87, Residential: 0.787, Coverage: 0.81, Overlap: 0.91}
	weights, err := NormalizeOptimizationPriorities([]OptimizationObjective{
		{ID: "demand", Weight: 80},
		{ID: "residential", Weight: 60},
		{ID: "coverage", Weight: 70},
		{ID: "overlap", Weight: 35},
	})
	if err != nil {
		t.Fatalf("normalize priorities: %v", err)
	}
	score := CalculateCompositeScore(utilities, weights)
	breakdown := calculateObjectiveBreakdown(utilities, weights)
	contributionTotal := breakdown.Demand.Contribution + breakdown.Residential.Contribution + breakdown.Coverage.Contribution + breakdown.Overlap.Contribution
	if math.Abs(score-contributionTotal) > 1e-12 {
		t.Fatalf("score %.12f != contribution total %.12f", score, contributionTotal)
	}
	if math.Abs(score-(weights["demand"]*utilities.Demand+weights["residential"]*utilities.Residential+weights["coverage"]*utilities.Coverage+weights["overlap"]*utilities.Overlap)) > 1e-12 {
		t.Fatalf("composite score = %.12f", score)
	}
}

func TestLowerOverlapProducesHigherUtility(t *testing.T) {
	lower := NormalizeOptimizationObjectives(optimizationStatsForTest(1, 1, 1, 1, 1, 1, 10, 2))
	higher := NormalizeOptimizationObjectives(optimizationStatsForTest(1, 1, 1, 1, 1, 1, 10, 8))
	if lower.Overlap <= higher.Overlap {
		t.Fatalf("overlap utilities lower=%.3f higher=%.3f", lower.Overlap, higher.Overlap)
	}
}

func TestLegacyOptimizationScoreRemainsAvailableForCompatibility(t *testing.T) {
	stats := NetworkOptimizationStats{DemandScore: 100, ResidentialScore: 200, CoverageScore: 300, OverlapPenalty: 50}
	config := OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 1},
		{ID: "residential", Weight: 1},
		{ID: "coverage", Weight: 1},
		{ID: "overlap", Weight: 1},
	}}
	if score := LegacyOptimizationObjectiveScore(stats, config); score != 550 {
		t.Fatalf("legacy objective score = %v, want 550", score)
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
	feasibleBest := optimizationStatsForTest(1, 1, 1, 1, 10, 20, 1, 1)
	feasibleBest.UniqueDemandBuildings = 2
	feasibleSecond := optimizationStatsForTest(1, 1, 1, 1, 9, 20, 1, 1)
	feasibleSecond.UniqueDemandBuildings = 2
	infeasible := optimizationStatsForTest(1, 1, 1, 1, 12, 20, 1, 2)
	infeasible.UniqueDemandBuildings = 2
	candidates := []networkOptimizationCandidate{
		{Azimuths: []float64{0}, Stats: feasibleBest},
		{Azimuths: []float64{10}, Stats: feasibleSecond},
		{Azimuths: []float64{20}, Stats: infeasible},
	}
	frontier := networkParetoFrontier(candidates, []NetworkTowerRequest{{ID: "a"}}, config)
	if len(frontier) != 1 || frontier[0].Towers[0].AzimuthDeg != 0 || frontier[0].Explanation == "" {
		t.Fatalf("frontier = %+v", frontier)
	}
}

func TestMinimumCoverageConstraintRetainsPropagationReachSemantics(t *testing.T) {
	minimum := 100.0
	violations := OptimizationConstraintViolations(NetworkOptimizationStats{CoverageScore: 90}, OptimizationConstraints{MinCoverageScore: &minimum})
	if len(violations) != 1 || !strings.Contains(violations[0], "propagation reach score") {
		t.Fatalf("reach constraint violations = %v, want propagation-reach wording", violations)
	}
	minimum = 80
	if violations := OptimizationConstraintViolations(NetworkOptimizationStats{CoverageScore: 90}, OptimizationConstraints{MinCoverageScore: &minimum}); len(violations) != 0 {
		t.Fatalf("reach constraint unexpectedly failed: %v", violations)
	}
}

func TestParetoRankingChangesWithPriorities(t *testing.T) {
	towers := []NetworkTowerRequest{{ID: "a"}}
	candidates := []networkOptimizationCandidate{
		{Azimuths: []float64{0}, Stats: optimizationStatsForTest(9, 10, 2, 10, 5, 10, 10, 5)},
		{Azimuths: []float64{10}, Stats: optimizationStatsForTest(2, 10, 9, 10, 5, 10, 10, 5)},
	}
	demandConfig := OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}, {ID: "residential", Weight: 0}, {ID: "coverage", Weight: 0}, {ID: "overlap", Weight: 0}}}
	residentialConfig := OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 0}, {ID: "residential", Weight: 100}, {ID: "coverage", Weight: 0}, {ID: "overlap", Weight: 0}}}
	demandFrontier := networkParetoFrontier(candidates, towers, demandConfig)
	residentialFrontier := networkParetoFrontier(candidates, towers, residentialConfig)
	if demandFrontier[0].Towers[0].AzimuthDeg != 0 || residentialFrontier[0].Towers[0].AzimuthDeg != 10 {
		t.Fatalf("priority ranking = demand %.1f, residential %.1f", demandFrontier[0].Towers[0].AzimuthDeg, residentialFrontier[0].Towers[0].AzimuthDeg)
	}
}

func optimizationStatsForTest(servedDemand, totalDemand float64, residentialCovered, residentialTotal int, coverageScore, coverageMaximum float64, coveredUnits, overlapBuildings int) NetworkOptimizationStats {
	return NetworkOptimizationStats{
		UniqueDemandBuildings:      1,
		UniqueResidentialBuildings: residentialCovered,
		OverlapBuildings:           overlapBuildings,
		DemandScore:                servedDemand * DemandScoreMultiplier,
		ResidentialScore:           float64(residentialCovered) * ResidentialScoreMultiplier,
		CoverageScore:              coverageScore,
		RawMetrics: OptimizationRawMetrics{
			ServedWeightedDemand: servedDemand,
			TotalWeightedDemand:  totalDemand,
			ResidentialCovered:   residentialCovered,
			ResidentialTotal:     residentialTotal,
			CoverageReachScore:   coverageScore,
			CoverageReachMaximum: coverageMaximum,
			CoveredUnits:         coveredUnits,
			OverlapBuildings:     overlapBuildings,
			OverlapRatio:         ratio01(float64(overlapBuildings), float64(coveredUnits)),
		},
	}
}
