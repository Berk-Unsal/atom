package raytracer

import "testing"

func TestBeamAngleForIndexWrapsAcrossNorth(t *testing.T) {
	tests := []struct {
		name     string
		azimuth  float64
		width    float64
		rays     int
		index    int
		expected float64
	}{
		{name: "wrap start", azimuth: 10, width: 60, rays: 6, index: 0, expected: 340},
		{name: "wrap through zero", azimuth: 10, width: 60, rays: 6, index: 2, expected: 0},
		{name: "sector middle", azimuth: 90, width: 120, rays: 6, index: 3, expected: 90},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BeamAngleForIndex(tt.azimuth, tt.width, tt.rays, tt.index)
			if got != tt.expected {
				t.Fatalf("BeamAngleForIndex() = %.1f, want %.1f", got, tt.expected)
			}
		})
	}
}

func TestOptimizeAzimuthReturnsFirstBestCandidateOnTie(t *testing.T) {
	req := StaticSimulationRequest{
		TowerLon:     32.8279,
		TowerLat:     39.9279,
		Rays:         12,
		RadiusMeters: 100,
		FrequencyGHz: 28,
		TxPowerDBm:   30,
		BeamWidthDeg: 120,
	}

	got := OptimizeAzimuth(req, EmptyBuildingIndex())
	if got.OptimalAzimuth != 0 {
		t.Fatalf("OptimizeAzimuth() = %.1f, want 0.0 on equal-score tie", got.OptimalAzimuth)
	}
}
