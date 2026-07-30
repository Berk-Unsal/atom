package raytracer

import (
	"context"
	"math"
	"testing"
)

func TestDBmLinearConversionsRoundTrip(t *testing.T) {
	for _, dbm := range []float64{-120, -80, -30, 0, 20} {
		got := MilliwattsToDBm(DBmToMilliwatts(dbm))
		if math.Abs(got-dbm) > 1e-9 {
			t.Fatalf("round trip for %.1f dBm = %.9f", dbm, got)
		}
	}
}

func TestInterferenceTechnologyPresets(t *testing.T) {
	lte, err := interferencePresetFor("4g", 20)
	if err != nil || lte.scsKHz != 15 || lte.resourceBlocks != 100 {
		t.Fatalf("LTE preset = %+v, %v", lte, err)
	}
	nr, err := interferencePresetFor("5g", 100)
	if err != nil || nr.scsKHz != 120 || nr.resourceBlocks != 66 {
		t.Fatalf("NR preset = %+v, %v", nr, err)
	}
}

func TestThermalNoisePerRE(t *testing.T) {
	got := ThermalNoisePerREDBm(15, 7)
	if math.Abs(got-(-125.239)) > 0.01 {
		t.Fatalf("thermal noise = %.3f dBm, want -125.239", got)
	}
}

func TestEqualPowerCoChannelInterfererDrivesSINRTowardZero(t *testing.T) {
	req := testInterferenceRequest(1)
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.SINRDB == nil || math.Abs(*properties.SINRDB) > 0.2 {
		t.Fatalf("equal-power SINR = %v, want approximately 0 dB", properties.SINRDB)
	}
	if properties.StrongestInterfererID != "b" {
		t.Fatalf("strongest interferer = %q, want b", properties.StrongestInterfererID)
	}
}

func TestReuseThreeExcludesOrthogonalInterferer(t *testing.T) {
	req := testInterferenceRequest(3)
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.SINRDB == nil || *properties.SINRDB < 20 {
		t.Fatalf("orthogonal-channel SINR = %v, want above 20 dB", properties.SINRDB)
	}
	if properties.InterferenceDBm != nil {
		t.Fatalf("orthogonal-channel interference = %v, want nil", properties.InterferenceDBm)
	}
}

func TestExplicitPerCellChannelsOverrideReuseAssignment(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	req.Towers[0].RFProfile.ChannelID = "A"
	req.Towers[1].RFProfile.ChannelID = "B"
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.ChannelID != "A" || properties.InterferenceDBm != nil {
		t.Fatalf("explicit channels were not applied: %+v", properties)
	}
}

func TestPerCellPowerChangesServingCell(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	req.Towers[0].RFProfile.TxPowerDBm = 10
	req.Towers[1].RFProfile.TxPowerDBm = 40
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.ServingCellID != "b" {
		t.Fatalf("serving cell = %q, want higher-power cell b", properties.ServingCellID)
	}
}

func TestInterferenceServingCellUsesStrongestRSRP(t *testing.T) {
	req := testInterferenceRequest(1)
	req.Towers[1].TowerLon -= 0.001
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.ServingCellID != "a" {
		t.Fatalf("serving cell = %q, want nearest cell a", properties.ServingCellID)
	}
}

func TestWallBoundariesReduceInterferenceRSRP(t *testing.T) {
	req := testInterferenceRequest(3)
	req.Towers = req.Towers[:1]
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 60)
	clear := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	blocked := evaluateInterferencePoint(req, preset, testBuildingWallIndex(t), point)
	if clear.RSRPDBm == nil || blocked.RSRPDBm == nil || *blocked.RSRPDBm >= *clear.RSRPDBm-15 {
		t.Fatalf("clear RSRP %v, blocked RSRP %v; want material wall attenuation", clear.RSRPDBm, blocked.RSRPDBm)
	}
	if blocked.WallCount == 0 {
		t.Fatal("blocked path wall count = 0")
	}
}

func TestInterferenceGridAdaptsToSampleLimit(t *testing.T) {
	req := testInterferenceRequest(1)
	req.RadiusMeters = 5000
	req.SampleSpacingM = 20
	req.Towers = []InterferenceTowerRequest{
		{ID: "a", TowerLon: 32, TowerLat: 39, AzimuthDeg: 90},
		{ID: "b", TowerLon: 32.01, TowerLat: 39, AzimuthDeg: 90},
		{ID: "c", TowerLon: 32.02, TowerLat: 39, AzimuthDeg: 90},
		{ID: "d", TowerLon: 32.03, TowerLat: 39, AzimuthDeg: 90},
		{ID: "e", TowerLon: 32.04, TowerLat: 39, AzimuthDeg: 90},
		{ID: "f", TowerLon: 32.05, TowerLat: 39, AzimuthDeg: 90},
	}
	samples, spacing := buildInterferenceGrid(req)
	if len(samples) > MaxInterferenceSamples {
		t.Fatalf("grid samples = %d, max %d", len(samples), MaxInterferenceSamples)
	}
	if spacing <= req.SampleSpacingM {
		t.Fatalf("effective spacing = %.1f, want adaptive increase above %.1f", spacing, req.SampleSpacingM)
	}
	for index := 1; index < len(samples); index++ {
		previous := samples[index-1]
		current := samples[index]
		if current.row < previous.row || (current.row == previous.row && current.col < previous.col) {
			t.Fatal("grid ordering is not deterministic row-major order")
		}
	}
}

func TestDemandBuildingCanBeInterferenceLimited(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testDemandBuildingAt(t, "interference-demand", DestinationPoint(origin, 90, 10), 2)
	req := testInterferenceRequest(1)
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	features, candidates, affectedCount, affectedDemand := evaluateDemandInterference(req, preset, buildings)
	if candidates != 1 || len(features) != 1 {
		t.Fatalf("demand candidates = %d, affected = %d; want 1 and 1", candidates, len(features))
	}
	if affectedCount != 1 {
		t.Fatalf("affected demand buildings = %d, want 1", affectedCount)
	}
	if !features[0].Properties.InterferenceLimited {
		t.Fatal("equal-power demand point was not marked interference-limited")
	}
	if affectedDemand <= 0 {
		t.Fatalf("affected demand = %.1f, want positive", affectedDemand)
	}
}

func TestInterferenceRejects6G(t *testing.T) {
	req := testInterferenceRequest(1)
	req.NetworkTech = "6g"
	req.FrequencyGHz = 140
	if validation := ValidateInterferenceRequest(req); validation == "" {
		t.Fatal("6g request passed validation")
	}
}

func TestNearestRankPercentile(t *testing.T) {
	got := nearestRankPercentile([]float64{50, 10, 40, 20, 30}, 10)
	if got != 10 {
		t.Fatalf("P10 = %.1f, want 10", got)
	}
}

func TestNoSignalStatsUseNullAggregates(t *testing.T) {
	stats := calculateInterferenceStats(
		testInterferenceRequest(1),
		[]InterferenceFeature{{Properties: InterferenceProperties{QualityClass: "no_signal"}}},
		0,
		0,
		0,
	)
	if stats.ValidSampleCount != 0 || stats.SignalSamples != 0 || stats.NoSignalCount != 1 {
		t.Fatalf("unexpected counts: %+v", stats)
	}
	if stats.AvgSINRDB != nil || stats.P10SINRDB != nil || stats.AvgRSRPDBm != nil || stats.P10RSRQDB != nil {
		t.Fatalf("no-signal aggregates must be nil: %+v", stats)
	}
}

func TestInterferenceAnalysisHonorsCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := AnalyzeInterferenceContext(ctx, testInterferenceRequest(1), EmptyBuildingIndex())
	if err == nil {
		t.Fatal("canceled analysis returned no error")
	}
}

func TestInterferenceDemandCandidatesUseSpatialBounds(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	near := testDemandBuildingAt(t, "near", DestinationPoint(origin, 90, 20), 2)
	far := testDemandBuildingAt(t, "far", DestinationPoint(origin, 90, 5000), 2)
	buildings := NewBuildingIndex(append(near.Footprints(), far.Footprints()...))
	req := testInterferenceRequest(1)
	req.Towers = req.Towers[:1]
	candidates := interferenceDemandCandidates(req, buildings)
	if len(candidates) != 1 || candidates[0].ID != "near" {
		t.Fatalf("spatial candidates = %+v, want near only", candidates)
	}
}

func BenchmarkInterferenceTwoCells(b *testing.B) {
	req := testInterferenceRequest(1)
	for index := 0; index < b.N; index++ {
		if _, err := AnalyzeInterferenceContext(context.Background(), req, EmptyBuildingIndex()); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkInterferenceSixCells(b *testing.B) {
	req := testInterferenceRequest(1)
	req.Towers = []InterferenceTowerRequest{
		{ID: "a", TowerLon: 32, TowerLat: 39, AzimuthDeg: 90},
		{ID: "b", TowerLon: 32.001, TowerLat: 39, AzimuthDeg: 90},
		{ID: "c", TowerLon: 32.002, TowerLat: 39, AzimuthDeg: 90},
		{ID: "d", TowerLon: 32.003, TowerLat: 39, AzimuthDeg: 90},
		{ID: "e", TowerLon: 32.004, TowerLat: 39, AzimuthDeg: 90},
		{ID: "f", TowerLon: 32.005, TowerLat: 39, AzimuthDeg: 90},
	}
	for index := 0; index < b.N; index++ {
		if _, err := AnalyzeInterferenceContext(context.Background(), req, EmptyBuildingIndex()); err != nil {
			b.Fatal(err)
		}
	}
}

func testInterferenceRequest(reuseFactor int) InterferenceRequest {
	return InterferenceRequest{
		NetworkTech: "4g",
		Towers: []InterferenceTowerRequest{
			{ID: "a", TowerLon: 32, TowerLat: 39, AzimuthDeg: 90},
			{ID: "b", TowerLon: 32, TowerLat: 39, AzimuthDeg: 90},
		},
		RadiusMeters:   100,
		FrequencyGHz:   2.6,
		TxPowerDBm:     30,
		BeamWidthDeg:   120,
		BandwidthMHz:   20,
		LoadFactor:     1,
		ReuseFactor:    reuseFactor,
		NoiseFigureDB:  7,
		SampleSpacingM: 40,
	}
}
