package raytracer

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestLegacyCellMemoizationPreservesCompleteOptimization(t *testing.T) {
	for _, variant := range []string{"urban", "off_grid_mixed_profiles", "infeasible", "radio_quality"} {
		t.Run(variant, func(t *testing.T) {
			req, buildings := concept5AControlledFixture(2)
			req.Rays = 8
			for index := range req.Towers {
				req.Towers[index].RFProfile = DefaultPlanningCellRFProfile("5g", 28, 30, 100, 120, 100, .7, 1)
			}
			switch variant {
			case "off_grid_mixed_profiles":
				req.Towers[0].AzimuthDeg = 13.123456789
				req.Towers[1].RFProfile = DefaultPlanningCellRFProfile("4g", 2.6, 43, 150, 90, 20, .5, 3)
				req.CalibrationOffsetDB = 1.25
			case "infeasible":
				minimum := 1e9
				req.Optimization.Constraints.MinCoverageScore = &minimum
			case "radio_quality":
				req.Optimization.Objectives = append(req.Optimization.Objectives, OptimizationObjective{ID: "radio_quality", Weight: 50})
			}
			uncachedTiming := &NetworkOptimizationTiming{}
			before, err := optimizeNetworkLegacyContext(WithNetworkOptimizationTiming(context.Background(), uncachedTiming), req, buildings, false)
			if err != nil {
				t.Fatal(err)
			}
			cachedTiming := &NetworkOptimizationTiming{}
			after, err := OptimizeNetworkContext(WithNetworkOptimizationTiming(context.Background(), cachedTiming), req, buildings)
			if err != nil {
				t.Fatal(err)
			}
			beforeJSON, _ := json.Marshal(before)
			afterJSON, _ := json.Marshal(after)
			if string(beforeJSON) != string(afterJSON) {
				t.Fatal("memoization changed response, scientific metrics, Pareto ranking or fingerprints")
			}
			if cachedTiming.Proposals != 146 || !reflect.DeepEqual(uncachedTiming.States, cachedTiming.States) {
				t.Fatalf("candidate semantics changed: before=%d after=%d", uncachedTiming.Proposals, cachedTiming.Proposals)
			}
			if cachedTiming.CellMemoHits == 0 || cachedTiming.CellMemoMisses > 74 || uncachedTiming.CellMemoMisses != 292 || uncachedTiming.CellMemoHits != 0 {
				t.Fatalf("memoization accounting: before=%+v after=%+v", uncachedTiming, cachedTiming)
			}
		})
	}
}

func TestCellMemoizationExactKeyAndCancellation(t *testing.T) {
	cache := make(networkCellContributionCache)
	req := StaticSimulationRequest{TowerLon: 32.85, TowerLat: 39.92, Rays: 4, AzimuthDeg: 13.123456789, RFProfile: DefaultPlanningCellRFProfile("5g", 28, 30, 100, 120, 100, .7, 1)}
	NormalizeStaticSimulationRequest(&req)
	buildings := EmptyBuildingIndex()
	timing := &NetworkOptimizationTiming{}
	ctx := WithNetworkOptimizationTiming(context.Background(), timing)
	first, err := networkCellRFContribution(ctx, req, buildings, cache)
	if err != nil {
		t.Fatal(err)
	}
	second, err := networkCellRFContribution(ctx, req, buildings, cache)
	if err != nil || !reflect.DeepEqual(first, second) || timing.CellMemoHits != 1 || len(cache) != 1 {
		t.Fatal("equivalent exact request missed cache")
	}
	for _, change := range []func(*StaticSimulationRequest){
		func(r *StaticSimulationRequest) { r.AzimuthDeg += 1e-8 },
		func(r *StaticSimulationRequest) { r.Rays++ },
		func(r *StaticSimulationRequest) { r.CalibrationOffsetDB++ },
		func(r *StaticSimulationRequest) { r.TowerLat += .001 },
		func(r *StaticSimulationRequest) { r.RFProfile.TxPowerDBm++ },
		func(r *StaticSimulationRequest) { r.RFProfile.FrequencyGHz = 26 },
	} {
		changed := req
		change(&changed)
		if _, err := networkCellRFContribution(ctx, changed, buildings, cache); err != nil {
			t.Fatal(err)
		}
	}
	if len(cache) != 7 || timing.CellMemoMisses != 7 {
		t.Fatalf("RF-affecting inputs aliased: entries=%d misses=%d", len(cache), timing.CellMemoMisses)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := networkCellRFContribution(canceled, req, buildings, cache); !errors.Is(err, context.Canceled) {
		t.Fatal("cache hit bypassed cancellation")
	}
}

func TestLegacyOptimizationCancelsDeepWorkWithoutPartialResult(t *testing.T) {
	req, _ := concept5AControlledFixture(6)
	req.Rays = 360
	req.RadiusMeters = 1500
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()
	started := time.Now()
	result, err := OptimizeNetworkContext(ctx, req, EmptyBuildingIndex())
	if !errors.Is(err, context.DeadlineExceeded) || !reflect.DeepEqual(result, NetworkOptimizationResponse{}) {
		t.Fatalf("partial success or missing deadline: %v", err)
	}
	if time.Since(started) > time.Second {
		t.Fatal("deep RF cancellation did not unwind promptly")
	}
}
