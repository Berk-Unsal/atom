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

func TestPenetrationLossForFrequencyGHz(t *testing.T) {
	tests := []struct {
		frequencyGHz float64
		expectedDB   float64
	}{
		{frequencyGHz: 2.6, expectedDB: 8},
		{frequencyGHz: 28, expectedDB: 30},
		{frequencyGHz: 140, expectedDB: 80},
	}

	for _, tt := range tests {
		got := PenetrationLossForFrequencyGHz(tt.frequencyGHz)
		if got != tt.expectedDB {
			t.Fatalf("PenetrationLossForFrequencyGHz(%.1f) = %.1f, want %.1f", tt.frequencyGHz, got, tt.expectedDB)
		}
	}
}

func TestFrequencyDependentPenetrationAllowsLTEAndStops6G(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testBuildingWallIndex(t)

	lteReq := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         12,
		RadiusMeters: 100,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 120,
	}
	lteTerminal := simulateRayTerminal(origin, 0, 90, lteReq, buildings)
	if lteTerminal.blocked {
		t.Fatalf("LTE terminal marked blocked; expected it to penetrate the test wall")
	}
	if lteTerminal.distanceMeters < 99 {
		t.Fatalf("LTE terminal distance = %.1f, want near full 100m radius", lteTerminal.distanceMeters)
	}

	subTHzReq := lteReq
	subTHzReq.FrequencyGHz = 140
	subTHzTerminal := simulateRayTerminal(origin, 0, 90, subTHzReq, buildings)
	if !subTHzTerminal.blocked {
		t.Fatalf("6G terminal was not blocked after wall penetration loss")
	}
	if subTHzTerminal.distanceMeters >= 20 {
		t.Fatalf("6G terminal distance = %.1f, want truncation at first wall", subTHzTerminal.distanceMeters)
	}
}

func TestCoverageAreaScoreIncludesUniqueBuildingDemandWeight(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testBuildingWallIndex(t)

	req := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         1,
		RadiusMeters: 100,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 20,
	}

	eastReq := req
	eastReq.AzimuthDeg = 100
	eastScore := CoverageAreaScoreBreakdown(origin, eastReq, buildings)

	northReq := req
	northReq.AzimuthDeg = 10
	northScore := CoverageAreaScoreBreakdown(origin, northReq, buildings)

	if eastScore.TotalScore <= northScore.TotalScore {
		t.Fatalf("weighted sector score = %.1f, empty sector score = %.1f; want weighted sector higher", eastScore.TotalScore, northScore.TotalScore)
	}
	if eastScore.DemandScore != 100*10000 {
		t.Fatalf("demand score = %.1f, want one high-value building bonus", eastScore.DemandScore)
	}
	if eastScore.HitDemandBuildings != 1 {
		t.Fatalf("hit demand buildings = %d, want one unique building", eastScore.HitDemandBuildings)
	}
}

func TestGenericBuildingDoesNotAddDemandBonus(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testBuildingWallIndex(t)
	buildings.footprints[0].DemandWeight = 0
	buildings.footprints[0].Weight = 500

	req := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         1,
		RadiusMeters: 100,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		AzimuthDeg:   100,
		BeamWidthDeg: 20,
	}

	score := CoverageAreaScoreBreakdown(origin, req, buildings)
	if score.DemandScore != 0 {
		t.Fatalf("generic building demand score = %.1f, want 0", score.DemandScore)
	}
	if score.HitDemandBuildings != 0 {
		t.Fatalf("generic building demand hits = %d, want 0", score.HitDemandBuildings)
	}
}

func testBuildingWallIndex(t *testing.T) *BuildingIndex {
	t.Helper()
	vertices := []Point{
		{Lon: 32.00010, Lat: 38.99990},
		{Lon: 32.00016, Lat: 38.99990},
		{Lon: 32.00016, Lat: 39.00010},
		{Lon: 32.00010, Lat: 39.00010},
	}
	bounds, ok := BoundsFromPoints(vertices)
	if !ok {
		t.Fatal("test wall bounds could not be calculated")
	}
	return NewBuildingIndex([]*BuildingFootprint{{
		ID:            "test-wall",
		Kind:          "building:test",
		Weight:        100,
		DemandWeight:  100,
		AttenuationDB: DefaultBuildingAttenuationDB,
		Bounds:        bounds,
		Vertices:      vertices,
	}})
}
