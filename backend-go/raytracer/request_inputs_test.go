package raytracer

import (
	"strings"
	"testing"
)

func TestValidateTowerIDEnforcesByteLimit(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		wantErr bool
	}{
		{name: "maximum ASCII length", id: strings.Repeat("a", MaxTowerIDBytes)},
		{name: "maximum UTF-8 byte length", id: strings.Repeat("é", MaxTowerIDBytes/2)},
		{name: "over ASCII limit", id: strings.Repeat("a", MaxTowerIDBytes+1), wantErr: true},
		{name: "over UTF-8 byte limit", id: strings.Repeat("é", MaxTowerIDBytes/2+1), wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			validationError := ValidateTowerID(test.id)
			if (validationError != "") != test.wantErr {
				t.Fatalf("ValidateTowerID() = %q, wantErr %t", validationError, test.wantErr)
			}
		})
	}
}

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
	input := NetworkOptimizationRequestInput{Towers: []TowerRequestInput{
		{ID: "second", TowerLon: &lonB, TowerLat: &latB},
		{ID: "first", TowerLon: &lonA, TowerLat: &latA},
	}}
	req := input.ToRequest()
	if req.Towers[0].ID != "second" || req.Towers[1].ID != "first" {
		t.Fatalf("tower order changed: %+v", req.Towers)
	}
}

func TestNetworkInputAppliesRFProfilePerTower(t *testing.T) {
	lonA, latA := 32.85, 39.92
	lonB, latB := 32.86, 39.93
	frequencyA, frequencyB := 2.6, 28.0
	techA, techB := "4g", "5g"
	powerA, powerB := 43.0, 30.0
	input := NetworkOptimizationRequestInput{Towers: []TowerRequestInput{
		{ID: "lte", TowerLon: &lonA, TowerLat: &latA, RFProfile: &CellRFProfileInput{NetworkTech: &techA, FrequencyGHz: &frequencyA, TxPowerDBm: &powerA}},
		{ID: "nr", TowerLon: &lonB, TowerLat: &latB, RFProfile: &CellRFProfileInput{NetworkTech: &techB, FrequencyGHz: &frequencyB, TxPowerDBm: &powerB}},
	}}
	req := input.ToRequest()
	if req.Towers[0].RFProfile.NetworkTech != "4g" || req.Towers[0].RFProfile.TxPowerDBm != 43 {
		t.Fatalf("LTE profile lost: %+v", req.Towers[0].RFProfile)
	}
	if req.Towers[1].RFProfile.NetworkTech != "5g" || req.Towers[1].RFProfile.FrequencyGHz != 28 {
		t.Fatalf("NR profile lost: %+v", req.Towers[1].RFProfile)
	}
	for _, tower := range req.Towers {
		if validationError := ValidateCellRFProfile(tower.RFProfile, false); validationError != "" {
			t.Fatalf("%s profile invalid: %s", tower.ID, validationError)
		}
	}
}

func TestNetworkTechnologyUsesCanonicalFrequencyBoundaries(t *testing.T) {
	tests := []struct {
		frequency float64
		want      string
	}{
		{frequency: 2.6, want: "4g"},
		{frequency: LTEFrequencyMaxGHz, want: "5g"},
		{frequency: NRFrequencyMaxGHz, want: "6g"},
	}
	for _, test := range tests {
		if got := NetworkTechnologyForFrequency(test.frequency); got != test.want {
			t.Fatalf("NetworkTechnologyForFrequency(%v) = %q, want %q", test.frequency, got, test.want)
		}
	}
}
