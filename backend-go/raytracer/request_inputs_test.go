package raytracer

import "testing"

func TestStaticSimulationInputPreservesExplicitZeroTxPower(t *testing.T) {
	zero := 0.0
	lon := 32.85
	lat := 39.92
	input := StaticSimulationRequestInput{TowerLon: &lon, TowerLat: &lat, TxPowerDBm: &zero}
	req := input.ToRequest()
	if req.TxPowerDBm != 0 {
		t.Fatalf("tx power = %.1f, want explicit 0", req.TxPowerDBm)
	}
	if req.Rays != 60 || req.RadiusMeters != 400 || req.FrequencyGHz != 28 {
		t.Fatalf("defaults not applied: %+v", req)
	}
}

func TestInterferenceInputDefaultsOnlyOmittedValues(t *testing.T) {
	zero := 0.0
	input := InterferenceRequestInput{
		NetworkTech:   "4g",
		LoadFactor:    &zero,
		NoiseFigureDB: &zero,
	}
	req := input.ToRequest()
	if req.LoadFactor != 0 || req.NoiseFigureDB != 0 {
		t.Fatalf("explicit zero values changed: %+v", req)
	}
	if req.FrequencyGHz != 2.6 || req.BandwidthMHz != 20 || req.TxPowerDBm != 30 {
		t.Fatalf("omitted defaults not applied: %+v", req)
	}
	if validation := ValidateInterferenceRequest(req); validation == "" {
		t.Fatal("explicit zero load factor passed validation")
	}
}

func TestNetworkInputPreservesStableTowerOrder(t *testing.T) {
	lonA, latA := 32.85, 39.92
	lonB, latB := 32.86, 39.93
	input := NetworkOptimizationRequestInput{Towers: []NetworkTowerRequestInput{
		{ID: "second", TowerLon: &lonB, TowerLat: &latB},
		{ID: "first", TowerLon: &lonA, TowerLat: &latA},
	}}
	req := input.ToRequest()
	if req.Towers[0].ID != "second" || req.Towers[1].ID != "first" {
		t.Fatalf("tower order changed: %+v", req.Towers)
	}
}
