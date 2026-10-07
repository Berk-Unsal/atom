package main

import (
	"context"
	"testing"
	"time"

	"ankara-5g-raytracer/raytracer"
)

func TestProductNetworkCapEightAndIndependentLimits(t *testing.T) {
	if raytracer.MaxNetworkTowers != 8 || raytracer.MaxRecommendationTowers != 5 || raytracer.MaxMeasurementTowers != 6 {
		t.Fatal("cap partition")
	}
	for _, n := range []int{8, 9} {
		req := wfNetwork(n).ToRequest()
		err := validateNetworkOptimizationRequest(req)
		if (err == "") != (n == 8) {
			t.Fatalf("N%d: %s", n, err)
		}
		if n == 9 && err != "towers must contain between 2 and 8 selected towers" {
			t.Fatalf("message %q", err)
		}
		inter := raytracer.InterferenceRequestInput{Towers: wfNetwork(n).Towers, NetworkTech: "4g", FrequencyGHz: rfPointer(2.6)}.ToRequest()
		if (raytracer.ValidateInterferenceRequest(inter) == "") != (n == 8) {
			t.Fatal("interference")
		}
	}
}
func TestProductEightNormalWorkflowAndLegacySearch(t *testing.T) {
	// Actual RF engine, with unchanged request-local timing ledger and empty geometry.
	req := wfNetwork(8).ToRequest()
	timing := &raytracer.NetworkOptimizationTiming{}
	ctx := raytracer.WithNetworkOptimizationTiming(context.Background(), timing)
	result, err := raytracer.OptimizeNetworkContext(ctx, req, raytracer.EmptyBuildingIndex())
	if err != nil || len(result.OptimizedTowers) != 8 {
		t.Fatal(err)
	}
	if timing.Proposals != 578 {
		t.Fatalf("proposals%d", timing.Proposals)
	}
	h := newWorkflowHarness(t, time.Minute, "")
	id, children := wfGrant(t, h, 8, "/api/evaluate-network", "192.0.2.1")
	for i, c := range children {
		if wfChild(h, id, i, "192.0.2.1", c).Code != 200 {
			t.Fatal("normal N8 child")
		}
	}
	wfInvariant(t, h.l)
}
