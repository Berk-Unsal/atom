package raytracer

import (
	"context"
	"encoding/json"
	"math"
	"reflect"
	"strings"
	"testing"
)

func TestPreparedOptimizationDomainIsAzimuthIndependent(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	inside := optimizationFootprintForTest("inside", DestinationPoint(origin, 90, 50), 4, 12, 1)
	outside := optimizationFootprintForTest("outside", DestinationPoint(origin, 90, 1000), 4, 800, 1)
	buildings := NewBuildingIndex([]*BuildingFootprint{inside, outside})
	req := optimizationRequestForTest(origin, 100)
	NormalizeNetworkOptimizationRequest(&req)
	prepared := mustResult(prepareNetworkOptimizationContext(context.Background(), req, buildings))

	first := mustResult(networkCoverageScoreBreakdownPreparedContext(context.Background(), req, []float64{0}, buildings, prepared))
	second := mustResult(networkCoverageScoreBreakdownPreparedContext(context.Background(), req, []float64{180}, buildings, prepared))
	if first.RawMetrics.RelevantDemandWeight != 12 || second.RawMetrics.RelevantDemandWeight != 12 {
		t.Fatalf("relevant demand totals = %.1f and %.1f, want 12", first.RawMetrics.RelevantDemandWeight, second.RawMetrics.RelevantDemandWeight)
	}
	if first.RawMetrics.RelevantResidentialTotal != 1 || second.RawMetrics.RelevantResidentialTotal != 1 {
		t.Fatalf("relevant residential totals = %d and %d, want 1", first.RawMetrics.RelevantResidentialTotal, second.RawMetrics.RelevantResidentialTotal)
	}
}

func TestPreparedOptimizationDomainMetadataIsDeterministic(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	buildings := NewBuildingIndex([]*BuildingFootprint{
		optimizationFootprintForTest("a", origin, 4, 1, 1),
	})
	req := optimizationRequestForTest(origin, 100)
	NormalizeNetworkOptimizationRequest(&req)
	first := mustResult(prepareNetworkOptimizationContext(context.Background(), req, buildings))
	second := mustResult(prepareNetworkOptimizationContext(context.Background(), req, buildings))
	if !reflect.DeepEqual(first.DomainMetadata, second.DomainMetadata) {
		t.Fatalf("domain metadata differs: %+v vs %+v", first.DomainMetadata, second.DomainMetadata)
	}
}

func TestPreparedOptimizationDomainChangesWithSelectedCells(t *testing.T) {
	firstOrigin := Point{Lon: 32.85, Lat: 39.92}
	secondOrigin := Point{Lon: 32.86, Lat: 39.92}
	firstBuilding := optimizationFootprintForTest("first", firstOrigin, 4, 10, 1)
	secondBuilding := optimizationFootprintForTest("second", secondOrigin, 4, 20, 1)
	buildings := NewBuildingIndex([]*BuildingFootprint{firstBuilding, secondBuilding})

	firstRequest := optimizationRequestForTest(firstOrigin, 100)
	NormalizeNetworkOptimizationRequest(&firstRequest)
	firstContext := mustResult(prepareNetworkOptimizationContext(context.Background(), firstRequest, buildings))
	secondRequest := optimizationRequestForTest(secondOrigin, 100)
	NormalizeNetworkOptimizationRequest(&secondRequest)
	secondContext := mustResult(prepareNetworkOptimizationContext(context.Background(), secondRequest, buildings))

	if firstContext.TotalRelevantDemandWeight >= secondContext.TotalRelevantDemandWeight {
		// Both are intentionally different so the test detects accidental global totals.
		t.Fatalf("selected-cell domains produced demand totals %.1f and %.1f; expected different totals", firstContext.TotalRelevantDemandWeight, secondContext.TotalRelevantDemandWeight)
	}
	if firstContext.DomainMetadata.RelevantDemandEntities != 1 || secondContext.DomainMetadata.RelevantDemandEntities != 1 {
		t.Fatalf("relevant demand entity counts = %d and %d, want 1 each", firstContext.DomainMetadata.RelevantDemandEntities, secondContext.DomainMetadata.RelevantDemandEntities)
	}
}

func TestOptimizationDomainBoundaryIsDeterministic(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	boundary := Point{Lon: origin.Lon + 100/(111_320*math.Cos(origin.Lat*math.Pi/180)), Lat: origin.Lat}
	inside := optimizationFootprintForTest("boundary", boundary, 0.01, 7, 0)
	outside := optimizationFootprintForTest("outside", DestinationPoint(origin, 90, 100.1), 0.01, 11, 0)
	buildings := NewBuildingIndex([]*BuildingFootprint{inside, outside})
	req := optimizationRequestForTest(origin, 100)
	NormalizeNetworkOptimizationRequest(&req)
	first := mustResult(prepareNetworkOptimizationContext(context.Background(), req, buildings))
	second := mustResult(prepareNetworkOptimizationContext(context.Background(), req, buildings))
	if first.TotalRelevantDemandWeight != second.TotalRelevantDemandWeight || first.TotalRelevantDemandWeight != 7 {
		t.Fatalf("boundary totals = %.3f and %.3f, want deterministic 7", first.TotalRelevantDemandWeight, second.TotalRelevantDemandWeight)
	}
}

func TestMultipartFootprintsUseOneConsistentAggregationUnit(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	first := optimizationFootprintForTest("source-0", DestinationPoint(origin, 90, 18), 3, 10, 1)
	second := optimizationFootprintForTest("source-1", DestinationPoint(origin, 90, 18), 3, 10, 1)
	buildings := NewBuildingIndex([]*BuildingFootprint{first, second})
	req := optimizationRequestForTest(origin, 80)
	req.Rays = 8
	req.BeamWidthDeg = 360
	req.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}}}
	NormalizeNetworkOptimizationRequest(&req)
	prepared := mustResult(prepareNetworkOptimizationContext(context.Background(), req, buildings))
	stats := mustResult(networkCoverageScoreBreakdownPreparedContext(context.Background(), req, []float64{90}, buildings, prepared))

	if stats.RawMetrics.RelevantDemandWeight != 20 || stats.RawMetrics.ServedWeightedDemand != 20 {
		t.Fatalf("multipart demand numerator/denominator = %.1f / %.1f, want 20 / 20", stats.RawMetrics.ServedWeightedDemand, stats.RawMetrics.RelevantDemandWeight)
	}
	if stats.RawMetrics.ResidentialCovered != 2 || stats.RawMetrics.RelevantResidentialTotal != 2 {
		t.Fatalf("multipart residential numerator/denominator = %d / %d, want 2 / 2", stats.RawMetrics.ResidentialCovered, stats.RawMetrics.RelevantResidentialTotal)
	}
}

func TestUnavailableObjectivesAreExcludedFromEffectiveWeights(t *testing.T) {
	stats := optimizationStatsForTest(12, 20, 0, 0, 80, 100, 2, 0)
	availability := map[string]OptimizationObjectiveAvailability{
		"demand":      {Available: true},
		"residential": {Available: false, Reason: "no_relevant_entities"},
		"coverage":    {Available: true},
		"overlap":     {Available: true},
	}
	config := OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 60}, {ID: "residential", Weight: 80}, {ID: "coverage", Weight: 50}, {ID: "overlap", Weight: 40},
	}}
	scored, err := scoreNetworkOptimization(stats, config, availability)
	if err != nil {
		t.Fatalf("score with unavailable residential objective: %v", err)
	}
	if scored.ObjectiveStatus["residential"].Available || scored.ObjectiveStatus["residential"].Utility != nil {
		t.Fatalf("residential status = %+v, want unavailable with nil utility", scored.ObjectiveStatus["residential"])
	}
	if scored.ObjectiveStatus["residential"].ConfiguredPriority != 80 {
		t.Fatalf("configured residential priority = %.1f, want 80", scored.ObjectiveStatus["residential"].ConfiguredPriority)
	}
	statusJSON, err := json.Marshal(scored.ObjectiveStatus["residential"])
	if err != nil || !strings.Contains(string(statusJSON), `"utility":null`) {
		t.Fatalf("unavailable residential status JSON = %s, want null utility", statusJSON)
	}
	weightTotal := 0.0
	for id, status := range scored.ObjectiveStatus {
		if status.Available {
			weightTotal += status.EffectiveWeight
			if id == "residential" {
				t.Fatalf("residential was included in effective weights")
			}
		}
	}
	if math.Abs(weightTotal-1) > 1e-12 {
		t.Fatalf("effective weight total = %.12f, want 1", weightTotal)
	}
}

func TestAllUnavailableObjectivesReturnDomainScoringError(t *testing.T) {
	req := optimizationRequestForTest(Point{Lon: 32.85, Lat: 39.92}, 100)
	req.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "residential", Weight: 100}}}
	if _, err := EvaluateNetworkContext(context.Background(), req, EmptyBuildingIndex()); err == nil || !strings.Contains(err.Error(), "no available positively weighted objectives") {
		t.Fatalf("error = %v, want unavailable-objective scoring error", err)
	}
}

func TestUnavailableSoftObjectiveDoesNotDisableHardConstraint(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	minimumResidential := 1
	req := optimizationRequestForTest(origin, 100)
	req.Optimization = OptimizationConfig{
		Objectives:  []OptimizationObjective{{ID: "demand", Weight: 100}, {ID: "residential", Weight: 100}},
		Constraints: OptimizationConstraints{MinUniqueResidentialBuildings: &minimumResidential},
	}
	building := optimizationFootprintForTest("demand-only", DestinationPoint(origin, 90, 20), 3, 12, 0)
	result := mustResult(EvaluateNetworkContext(context.Background(), req, NewBuildingIndex([]*BuildingFootprint{building})))
	if result.Optimization.ConstraintsSatisfied {
		t.Fatalf("residential hard constraint was disabled: %+v", result.Optimization)
	}
	if result.Stats.ObjectiveStatus["residential"].Available {
		t.Fatalf("residential objective = %+v, want unavailable", result.Stats.ObjectiveStatus["residential"])
	}
}

func optimizationRequestForTest(origin Point, radius float64) NetworkOptimizationRequest {
	return NetworkOptimizationRequest{
		Towers:       []NetworkTowerRequest{{ID: "cell", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 0}},
		Rays:         8,
		RadiusMeters: radius,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 120,
	}
}

func optimizationFootprintForTest(id string, center Point, halfSizeMeters float64, demandWeight, residentialDemand float64) *BuildingFootprint {
	latDelta := halfSizeMeters / 111_320
	lonDelta := halfSizeMeters / (111_320 * math.Cos(center.Lat*math.Pi/180))
	vertices := []Point{
		{Lon: center.Lon - lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat + latDelta},
		{Lon: center.Lon - lonDelta, Lat: center.Lat + latDelta},
	}
	bounds, _ := BoundsFromPoints(vertices)
	return &BuildingFootprint{ID: id, DemandWeight: demandWeight, ResidentialDemand: residentialDemand, Bounds: bounds, Vertices: vertices}
}
