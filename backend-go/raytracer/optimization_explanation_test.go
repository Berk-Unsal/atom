package raytracer

import (
	"context"
	"math"
	"reflect"
	"strings"
	"testing"
)

func TestExplainNetworkCellRestoresOnlyTheRequestedCell(t *testing.T) {
	request, buildings := networkCellExplanationFixture(t, OptimizationConfig{
		Objectives: []OptimizationObjective{{ID: "demand", Weight: 60}, {ID: "coverage", Weight: 40}},
	})

	response, err := ExplainNetworkCellContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatalf("explain network cell: %v", err)
	}
	if !response.Available || response.Unchanged {
		t.Fatalf("explanation availability = %v, unchanged = %v; want changed available comparison", response.Available, response.Unchanged)
	}
	if response.Cell.ID != "cell-a" || response.Cell.BaselineAzimuthDeg != 0 || response.Cell.SelectedAzimuthDeg != 90 {
		t.Fatalf("cell comparison = %+v", response.Cell)
	}

	selectedRequest, baselineRequest, selectedAzimuths, cell, err := buildNetworkCellExplanationRequests(*request.Baseline, *request.Solution, *request.Optimization, request.CellID)
	if err != nil {
		t.Fatalf("reconstruct explanation requests: %v", err)
	}
	prepared, err := prepareNetworkOptimizationContext(context.Background(), baselineRequest, buildings)
	if err != nil {
		t.Fatalf("prepare expected explanation context: %v", err)
	}
	counterfactualAzimuths := append([]float64(nil), selectedAzimuths...)
	counterfactualAzimuths[cellIndex(baselineRequest.Towers, cell.ID)] = cell.BaselineAzimuthDeg
	expectedBreakdown, err := networkCoverageScoreBreakdownPreparedContext(
		context.Background(),
		baselineRequestWithAzimuths(selectedRequest, counterfactualAzimuths),
		counterfactualAzimuths,
		buildings,
		prepared,
	)
	if err != nil {
		t.Fatalf("evaluate expected counterfactual: %v", err)
	}
	expectedStats, err := scoreNetworkOptimization(expectedBreakdown, *request.Optimization, prepared.ObjectiveAvailability)
	if err != nil {
		t.Fatalf("score expected counterfactual: %v", err)
	}
	expectedStats = expectedStats.rounded()
	if !reflect.DeepEqual(response.Counterfactual.RawMetrics, expectedStats.RawMetrics) {
		t.Fatalf("counterfactual raw metrics = %+v, want exact one-cell restore metrics %+v", response.Counterfactual.RawMetrics, expectedStats.RawMetrics)
	}

	if selectedRequest.Towers[1].AzimuthDeg != counterfactualAzimuths[1] {
		t.Fatalf("non-target cell changed during restore: selected=%+v counterfactual=%v", selectedRequest.Towers, counterfactualAzimuths)
	}
	if response.Delta.ServedDemandWeight != response.Actual.RawMetrics.ServedDemandWeight-response.Counterfactual.RawMetrics.ServedDemandWeight {
		t.Fatalf("demand delta = %.6f, want selected-counterfactual arithmetic", response.Delta.ServedDemandWeight)
	}
	if response.Delta.OverlapRatio != response.Actual.RawMetrics.OverlapRatio-response.Counterfactual.RawMetrics.OverlapRatio {
		t.Fatalf("overlap ratio delta = %.6f, want selected-counterfactual arithmetic", response.Delta.OverlapRatio)
	}
}

func TestExplainNetworkCellKeepsInfeasibleCounterfactualInspectable(t *testing.T) {
	minimumDemand := 1
	request, buildings := networkCellExplanationFixture(t, OptimizationConfig{
		Objectives:  []OptimizationObjective{{ID: "demand", Weight: 100}},
		Constraints: OptimizationConstraints{MinUniqueDemandBuildings: &minimumDemand},
	})
	response, err := ExplainNetworkCellContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatalf("explain constrained network cell: %v", err)
	}
	// The fixture's demand building is reached by selected cell-a at 90 degrees
	// and is outside the restored 0-degree beam. The hard constraint should make
	// that counterfactual inspectably infeasible without discarding its RF data.
	if response.Counterfactual.ConstraintsSatisfied || len(response.Counterfactual.Violations) == 0 {
		t.Fatalf("counterfactual feasibility = %v violations=%v, want infeasible", response.Counterfactual.ConstraintsSatisfied, response.Counterfactual.Violations)
	}
	if response.Counterfactual.RawMetrics.RelevantDemandWeight <= 0 {
		t.Fatalf("counterfactual raw metrics lost domain denominator: %+v", response.Counterfactual.RawMetrics)
	}
}

func TestExplainNetworkCellUnchangedSkipsCounterfactualAndPreservesMetrics(t *testing.T) {
	request, buildings := networkCellExplanationFixture(t, OptimizationConfig{
		Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}},
	})
	request.Solution.Towers[0].AzimuthDeg = request.Baseline.CellConfigurations[0].AzimuthDeg
	request.Solution.Stats = request.Baseline.Stats

	response, err := ExplainNetworkCellContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatalf("explain unchanged cell: %v", err)
	}
	if !response.Unchanged {
		t.Fatal("unchanged cell did not report unchanged=true")
	}
	if !reflect.DeepEqual(response.Actual.RawMetrics, response.Counterfactual.RawMetrics) {
		t.Fatalf("unchanged raw metrics differ: actual=%+v counterfactual=%+v", response.Actual.RawMetrics, response.Counterfactual.RawMetrics)
	}
	if response.Score.Delta != 0 {
		t.Fatalf("unchanged score delta = %.6f, want 0", response.Score.Delta)
	}
}

func TestNetworkOptimizationRunIDExcludesPrioritiesButIncludesRFAffectingState(t *testing.T) {
	request, _ := networkCellExplanationFixture(t, OptimizationConfig{
		Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}},
	})
	base := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "cell-a", TowerLon: 32, TowerLat: 39, AzimuthDeg: 0},
			{ID: "cell-b", TowerLon: 32.0001, TowerLat: 39, AzimuthDeg: 180},
		},
		Rays: 8, RadiusMeters: 120, FrequencyGHz: 2.6, TxPowerDBm: 30, BeamWidthDeg: 80,
		Optimization: *request.Optimization,
	}
	NormalizeNetworkOptimizationRequest(&base)
	priorityOnly := base
	priorityOnly.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}}
	if NetworkOptimizationRunID(base) != NetworkOptimizationRunID(priorityOnly) {
		t.Fatal("priority-only change invalidated the RF run identity")
	}

	rfChange := base
	rfChange.Towers = append([]NetworkTowerRequest(nil), base.Towers...)
	rfChange.Towers[0].AzimuthDeg = 10
	if NetworkOptimizationRunID(base) == NetworkOptimizationRunID(rfChange) {
		t.Fatal("baseline azimuth change reused the RF run identity")
	}
	constraintChange := base
	minimum := 1
	constraintChange.Optimization.Constraints.MinUniqueDemandBuildings = &minimum
	if NetworkOptimizationRunID(base) == NetworkOptimizationRunID(constraintChange) {
		t.Fatal("hard-constraint change reused the RF run identity")
	}
}

func TestExplainNetworkCellRejectsMismatchedRunID(t *testing.T) {
	request, buildings := networkCellExplanationFixture(t, OptimizationConfig{
		Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}},
	})
	request.RunID = "stale-run"
	if _, err := ExplainNetworkCellContext(context.Background(), request, buildings); err == nil || !strings.Contains(err.Error(), "run_id") {
		t.Fatalf("mismatched run id error = %v, want run identity validation", err)
	}
}

func networkCellExplanationFixture(t *testing.T, config OptimizationConfig) (NetworkCellExplanationRequest, *BuildingIndex) {
	t.Helper()
	origin := Point{Lon: 32, Lat: 39}
	buildings := NewBuildingIndex([]*BuildingFootprint{
		optimizationFootprintForTest("east-demand", DestinationPoint(origin, 90, 24), 4, 12, 1),
	})
	request := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "cell-a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 0},
			{ID: "cell-b", TowerLon: origin.Lon + 0.0003, TowerLat: origin.Lat, AzimuthDeg: 180},
		},
		Rays:         8,
		RadiusMeters: 120,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 20,
		Optimization: config,
	}
	NormalizeNetworkOptimizationRequest(&request)
	baselineAzimuths := []float64{0, 180}
	selectedAzimuths := []float64{90, 0}
	prepared := mustResult(prepareNetworkOptimizationContext(context.Background(), request, buildings))
	baselineBreakdown := mustResult(networkCoverageScoreBreakdownPreparedContext(context.Background(), request, baselineAzimuths, buildings, prepared))
	selectedBreakdown := mustResult(networkCoverageScoreBreakdownPreparedContext(context.Background(), request, selectedAzimuths, buildings, prepared))
	baselineStats := mustResult(scoreNetworkOptimization(baselineBreakdown, config, prepared.ObjectiveAvailability)).rounded()
	selectedStats := mustResult(scoreNetworkOptimization(selectedBreakdown, config, prepared.ObjectiveAvailability)).rounded()
	solution := &NetworkParetoSolution{
		ID: "solution-test",
		Towers: []ParetoTowerSetting{
			{ID: "cell-a", AzimuthDeg: selectedAzimuths[0]},
			{ID: "cell-b", AzimuthDeg: selectedAzimuths[1]},
		},
		Stats: selectedStats,
		Score: selectedStats.Score,
	}
	return NetworkCellExplanationRequest{
		RunID:      NetworkOptimizationRunID(request),
		SolutionID: solution.ID,
		CellID:     "cell-a",
		Baseline: &NetworkOptimizationSolution{
			CellConfigurations:   networkOptimizationCellConfigurations(request, baselineAzimuths),
			Parameters:           networkOptimizationParameters(request),
			Stats:                baselineStats,
			ConstraintsSatisfied: len(OptimizationConstraintViolations(baselineStats, config.Constraints)) == 0,
		},
		Solution:           solution,
		Optimization:       &config,
		OptimizationDomain: &prepared.DomainMetadata,
	}, buildings
}

func TestExplainNetworkCellRejectsDomainMismatch(t *testing.T) {
	request, buildings := networkCellExplanationFixture(t, OptimizationConfig{
		Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}},
	})
	request.OptimizationDomain.EnvelopeRadiiMeters[0] += 1
	if _, err := ExplainNetworkCellContext(context.Background(), request, buildings); err == nil || !strings.Contains(err.Error(), "optimization domain metadata") {
		t.Fatalf("domain mismatch error = %v, want retained-domain validation error", err)
	}
}

func TestExplainNetworkCellRejectsNonFiniteStoredMetrics(t *testing.T) {
	request, buildings := networkCellExplanationFixture(t, OptimizationConfig{
		Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}},
	})
	request.Solution.Stats.RawMetrics.RelevantDemandWeight = math.NaN()
	if _, err := ExplainNetworkCellContext(context.Background(), request, buildings); err == nil {
		t.Fatal("non-finite stored metrics were accepted")
	}
}
