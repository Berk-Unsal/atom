package raytracer

import (
	"context"
	"errors"
	"math"
	"reflect"
	"testing"
)

func TestSegmentedRayStopsOnCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err := simulateSegmentedRayContext(ctx, Point{Lon: 32.85, Lat: 39.92}, 0, 90, StaticSimulationRequest{
		Rays: 720, RadiusMeters: 5000, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
	}, EmptyBuildingIndex())
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context cancellation", err)
	}
}

func TestSimulationFeatureEstimateAndPreflightLimit(t *testing.T) {
	if got := EstimatedSimulationFeatureCount(720, 5000); got != 144000 {
		t.Fatalf("estimated features = %d, want 144000", got)
	}
	if got := EstimatedSimulationFeatureCount(int(^uint(0)>>1), math.Inf(1)); got != int(^uint(0)>>1) {
		t.Fatalf("overflow-safe estimate = %d", got)
	}
	if validationError := ValidateSimulationFeatureBudget(360, 1500); validationError != "" {
		t.Fatalf("frontend maximum rejected: %s", validationError)
	}
	if validationError := ValidateSimulationFeatureBudget(720, 5000); validationError == "" {
		t.Fatal("reported worst-case request passed the feature budget")
	}

	_, err := SimulateStaticRaysContext(context.Background(), StaticSimulationRequest{
		TowerLon: 32.85, TowerLat: 39.92,
		Rays: 720, RadiusMeters: 5000,
		FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
	}, EmptyBuildingIndex())
	if !errors.Is(err, ErrSimulationFeatureLimit) {
		t.Fatalf("simulation error = %v, want feature limit", err)
	}
}

func TestSegmentCollectionStopsAtSharedFeatureBudget(t *testing.T) {
	budget := newSimulationFeatureBudget(2)
	_, _, err := simulateSegmentedRayWithBudgetContext(
		context.Background(),
		Point{Lon: 32.85, Lat: 39.92},
		0,
		90,
		StaticSimulationRequest{
			Rays: 8, RadiusMeters: 100,
			FrequencyGHz: 1, TxPowerDBm: 60, BeamWidthDeg: 120,
		},
		EmptyBuildingIndex(),
		budget,
	)
	if !errors.Is(err, ErrSimulationFeatureLimit) {
		t.Fatalf("simulation error = %v, want feature limit", err)
	}
	if got := budget.used.Load(); got != 3 {
		t.Fatalf("reserved features = %d, want first rejected reservation at 3", got)
	}
}

func TestResponseAssemblyRejectsActualFeatureOverflow(t *testing.T) {
	profiles := []rayCoverageProfile{{segments: make([]RayFeature, MaxSimulationResponseFeatures+1)}}
	_, err := staticSimulationResponseFromProfilesContext(context.Background(), StaticSimulationRequest{}, profiles)
	if !errors.Is(err, ErrSimulationFeatureLimit) {
		t.Fatalf("response error = %v, want feature limit", err)
	}
}

func TestAnalyzeSectorMatchesStandaloneResponses(t *testing.T) {
	req := StaticSimulationRequest{
		TowerLon: 32, TowerLat: 39, Rays: 12, RadiusMeters: 100,
		FrequencyGHz: 140, TxPowerDBm: 30, AzimuthDeg: 90, BeamWidthDeg: 40,
	}
	buildings := testBuildingWallIndex(t)

	combined, err := AnalyzeSectorContext(context.Background(), req, buildings)
	if err != nil {
		t.Fatalf("analyze sector: %v", err)
	}
	simulation, err := SimulateStaticRaysContext(context.Background(), req, buildings)
	if err != nil {
		t.Fatalf("simulate rays: %v", err)
	}
	gaps, err := FindCoverageGapsContext(context.Background(), req, buildings)
	if err != nil {
		t.Fatalf("find coverage gaps: %v", err)
	}

	if !reflect.DeepEqual(combined.Simulation, simulation) {
		t.Fatalf("combined simulation differs from standalone response")
	}
	if !reflect.DeepEqual(combined.CoverageGaps, gaps) {
		t.Fatalf("combined coverage gaps differ from standalone response")
	}
}

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

	got := mustResult(OptimizeAzimuthContext(context.Background(), req, EmptyBuildingIndex()))
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
	eastScore := mustResult(CoverageAreaScoreBreakdownContext(context.Background(), origin, eastReq, buildings))

	northReq := req
	northReq.AzimuthDeg = 10
	northScore := mustResult(CoverageAreaScoreBreakdownContext(context.Background(), origin, northReq, buildings))

	if eastScore.TotalScore <= northScore.TotalScore {
		t.Fatalf("weighted sector score = %.1f, empty sector score = %.1f; want weighted sector higher", eastScore.TotalScore, northScore.TotalScore)
	}
	if eastScore.DemandScore != 100*10000 {
		t.Fatalf("demand score = %.1f, want one high-value building bonus", eastScore.DemandScore)
	}
	if eastScore.ResidentialScore != 0 {
		t.Fatalf("residential score = %.1f, want 0 for commercial demand fixture", eastScore.ResidentialScore)
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

	score := mustResult(CoverageAreaScoreBreakdownContext(context.Background(), origin, req, buildings))
	if score.DemandScore != 0 {
		t.Fatalf("generic building demand score = %.1f, want 0", score.DemandScore)
	}
	if score.ResidentialScore != 0 {
		t.Fatalf("generic building residential score = %.1f, want 0", score.ResidentialScore)
	}
	if score.HitDemandBuildings != 0 {
		t.Fatalf("generic building demand hits = %d, want 0", score.HitDemandBuildings)
	}
}

func TestResidentialDemandBeatsLongEmptyCoverageTieBreaker(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testResidentialWallIndex(t)

	residentialReq := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         1,
		RadiusMeters: 100,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		AzimuthDeg:   100,
		BeamWidthDeg: 20,
	}
	residentialScore := mustResult(CoverageAreaScoreBreakdownContext(context.Background(), origin, residentialReq, buildings))

	emptyReq := residentialReq
	emptyReq.AzimuthDeg = 10
	emptyReq.RadiusMeters = 500
	emptyScore := mustResult(CoverageAreaScoreBreakdownContext(context.Background(), origin, emptyReq, buildings))

	if residentialScore.ResidentialScore <= emptyScore.CoverageScore {
		t.Fatalf("residential score = %.1f, empty coverage tie-breaker = %.1f; want residential demand to dominate", residentialScore.ResidentialScore, emptyScore.CoverageScore)
	}
	if residentialScore.TotalScore <= emptyScore.TotalScore {
		t.Fatalf("residential total score = %.1f, empty total score = %.1f; want residential sector higher", residentialScore.TotalScore, emptyScore.TotalScore)
	}
}

func TestCoverageGapFinderFlagsWeakDemandBuilding(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testBuildingWallIndex(t)
	req := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         12,
		RadiusMeters: 100,
		FrequencyGHz: 140,
		TxPowerDBm:   30,
		AzimuthDeg:   90,
		BeamWidthDeg: 40,
	}

	response := mustResult(FindCoverageGapsContext(context.Background(), req, buildings))
	if response.Stats.CandidateBuildings != 1 {
		t.Fatalf("candidate buildings = %d, want 1", response.Stats.CandidateBuildings)
	}
	if response.Stats.GapBuildings != 1 {
		t.Fatalf("gap buildings = %d, want 1", response.Stats.GapBuildings)
	}
	if len(response.GeoJSON.Features) != 1 {
		t.Fatalf("returned gap features = %d, want 1", len(response.GeoJSON.Features))
	}
	if response.GeoJSON.Features[0].Properties.Severity != "outage" {
		t.Fatalf("gap severity = %q, want outage", response.GeoJSON.Features[0].Properties.Severity)
	}
}

func TestCoverageGapFinderTreatsLTEBuildingAsServed(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testBuildingWallIndex(t)
	req := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         12,
		RadiusMeters: 100,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		AzimuthDeg:   90,
		BeamWidthDeg: 40,
	}

	response := mustResult(FindCoverageGapsContext(context.Background(), req, buildings))
	if response.Stats.CandidateBuildings != 1 {
		t.Fatalf("candidate buildings = %d, want 1", response.Stats.CandidateBuildings)
	}
	if response.Stats.ServedBuildings != 1 {
		t.Fatalf("served buildings = %d, want 1", response.Stats.ServedBuildings)
	}
	if response.Stats.GapBuildings != 0 {
		t.Fatalf("gap buildings = %d, want 0", response.Stats.GapBuildings)
	}
}

func TestBuildingCoverageMapRecordsPenetratedLTEBuilding(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testBuildingWallIndex(t)
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

	coverage := mustResult(BuildingCoverageMapContext(context.Background(), origin, req, buildings))
	rx, ok := coverage["test-wall"]
	if !ok {
		t.Fatal("penetrated LTE building was not recorded in coverage map")
	}
	if rx <= CoveredBuildingThresholdDBm {
		t.Fatalf("penetrated LTE building rx = %.1f, want covered above %.1f", rx, CoveredBuildingThresholdDBm)
	}
}

func TestCoverageGapFinderServesBuildingBetweenStrongLTERays(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testDemandBuildingAt(t, "between-rays", DestinationPoint(origin, 80, 50), 2)
	req := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         2,
		RadiusMeters: 100,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		AzimuthDeg:   90,
		BeamWidthDeg: 40,
	}

	response := mustResult(FindCoverageGapsContext(context.Background(), req, buildings))
	if response.Stats.CandidateBuildings != 1 {
		t.Fatalf("candidate buildings = %d, want 1", response.Stats.CandidateBuildings)
	}
	if response.Stats.ServedBuildings != 1 {
		t.Fatalf("served buildings = %d, want 1 from interpolated beam coverage", response.Stats.ServedBuildings)
	}
	if response.Stats.GapBuildings != 0 {
		t.Fatalf("gap buildings = %d, want 0 for building between strong LTE rays", response.Stats.GapBuildings)
	}
	if len(response.GeoJSON.Features) != 0 {
		t.Fatalf("returned gap features = %d, want 0", len(response.GeoJSON.Features))
	}
}

func TestCoverageGapFinderIgnoresDemandOutsideBeam(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testBuildingWallIndex(t)
	req := StaticSimulationRequest{
		TowerLon:     origin.Lon,
		TowerLat:     origin.Lat,
		Rays:         12,
		RadiusMeters: 100,
		FrequencyGHz: 140,
		TxPowerDBm:   30,
		AzimuthDeg:   0,
		BeamWidthDeg: 20,
	}

	response := mustResult(FindCoverageGapsContext(context.Background(), req, buildings))
	if response.Stats.CandidateBuildings != 0 {
		t.Fatalf("candidate buildings = %d, want 0 outside beam", response.Stats.CandidateBuildings)
	}
	if len(response.GeoJSON.Features) != 0 {
		t.Fatalf("returned gap features = %d, want 0 outside beam", len(response.GeoJSON.Features))
	}
}

func TestFreeSpacePathLossUsesMetersAndGHz(t *testing.T) {
	// 100 m at 2.6 GHz is approximately 80.75 dB FSPL.
	got := FreeSpacePathLossMetersGHz(100, 2.6)
	if math.Abs(got-80.75) > 0.1 {
		t.Fatalf("FSPL = %.2f dB, want approximately 80.75 dB", got)
	}
}

func TestNetworkCoverageCountsDuplicateDemandOnceAndPenalizesOverlap(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testDemandBuildingAt(t, "shared-demand", DestinationPoint(origin, 90, 18), 4)
	req := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90},
			{ID: "b", TowerLon: origin.Lon - 0.00005, TowerLat: origin.Lat, AzimuthDeg: 90},
		},
		Rays:         3,
		RadiusMeters: 80,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 40,
	}

	score := mustResult(NetworkCoverageScoreBreakdownContext(context.Background(), req, []float64{90, 90}, buildings))
	if score.UniqueDemandBuildings != 1 {
		t.Fatalf("unique demand buildings = %d, want 1", score.UniqueDemandBuildings)
	}
	if score.DemandScore != 25*DemandScoreMultiplier {
		t.Fatalf("demand score = %.1f, want one demand building reward", score.DemandScore)
	}
	if score.OverlapBuildings != 1 {
		t.Fatalf("overlap buildings = %d, want 1", score.OverlapBuildings)
	}
	if score.OverlapPenalty != NetworkOverlapPenaltyPerBuilding {
		t.Fatalf("overlap penalty = %.1f, want %.1f", score.OverlapPenalty, NetworkOverlapPenaltyPerBuilding)
	}
}

func TestOptimizeNetworkImprovesOrEqualsBaselineClusterScore(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testDemandBuildingAt(t, "east-demand", DestinationPoint(origin, 90, 18), 4)
	req := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 0},
			{ID: "b", TowerLon: origin.Lon - 0.00005, TowerLat: origin.Lat, AzimuthDeg: 0},
		},
		Rays:         3,
		RadiusMeters: 80,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 40,
	}

	baseline := mustResult(NetworkCoverageScoreBreakdownContext(context.Background(), req, []float64{0, 0}, buildings))
	optimized := mustResult(OptimizeNetworkContext(context.Background(), req, buildings))
	if optimized.Stats.NetworkScore < baseline.NetworkScore {
		t.Fatalf("optimized network score = %.1f, baseline = %.1f; want optimized >= baseline", optimized.Stats.NetworkScore, baseline.NetworkScore)
	}
	if len(optimized.OptimizedTowers) != 2 {
		t.Fatalf("optimized towers = %d, want 2", len(optimized.OptimizedTowers))
	}
}

func TestEvaluateNetworkUsesCurrentTowerAzimuths(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildings := testDemandBuildingAt(t, "east-demand", DestinationPoint(origin, 90, 18), 4)
	req := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 0},
			{ID: "b", TowerLon: origin.Lon - 0.00005, TowerLat: origin.Lat, AzimuthDeg: 0},
		},
		Rays:         3,
		RadiusMeters: 80,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 40,
	}

	evaluated := mustResult(EvaluateNetworkContext(context.Background(), req, buildings))
	baseline := mustResult(NetworkCoverageScoreBreakdownContext(context.Background(), req, []float64{0, 0}, buildings)).rounded()
	if evaluated.Stats.NetworkScore != baseline.NetworkScore {
		t.Fatalf("evaluated network score = %.1f, baseline = %.1f", evaluated.Stats.NetworkScore, baseline.NetworkScore)
	}
	if evaluated.Stats.UniqueDemandBuildings != baseline.UniqueDemandBuildings {
		t.Fatalf("evaluated unique demand = %d, baseline = %d", evaluated.Stats.UniqueDemandBuildings, baseline.UniqueDemandBuildings)
	}
	if len(evaluated.OptimizedTowers) != 2 {
		t.Fatalf("evaluated towers = %d, want 2", len(evaluated.OptimizedTowers))
	}
	if evaluated.OptimizedTowers[0].OptimalAzimuth != 0 {
		t.Fatalf("evaluated azimuth = %.1f, want current azimuth 0", evaluated.OptimizedTowers[0].OptimalAzimuth)
	}
}

func testDemandBuildingAt(t *testing.T, id string, center Point, halfSizeMeters float64) *BuildingIndex {
	t.Helper()
	latDelta := halfSizeMeters / 111_320
	lonDelta := halfSizeMeters / (111_320 * 0.777)
	vertices := []Point{
		{Lon: center.Lon - lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat + latDelta},
		{Lon: center.Lon - lonDelta, Lat: center.Lat + latDelta},
	}
	bounds, ok := BoundsFromPoints(vertices)
	if !ok {
		t.Fatal("test demand building bounds could not be calculated")
	}
	return NewBuildingIndex([]*BuildingFootprint{{
		ID:           id,
		Weight:       25,
		DemandWeight: 25,
		Bounds:       bounds,
		Vertices:     vertices,
	}})
}

func mustResult[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
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
		ID:           "test-wall",
		Weight:       100,
		DemandWeight: 100,
		Bounds:       bounds,
		Vertices:     vertices,
	}})
}

func testResidentialWallIndex(t *testing.T) *BuildingIndex {
	t.Helper()
	vertices := []Point{
		{Lon: 32.00010, Lat: 38.99990},
		{Lon: 32.00016, Lat: 38.99990},
		{Lon: 32.00016, Lat: 39.00010},
		{Lon: 32.00010, Lat: 39.00010},
	}
	bounds, ok := BoundsFromPoints(vertices)
	if !ok {
		t.Fatal("test residential wall bounds could not be calculated")
	}
	return NewBuildingIndex([]*BuildingFootprint{{
		ID:                "test-apartments",
		Weight:            10,
		ResidentialDemand: 35,
		DensityScore:      72,
		NearbyBuildings:   42,
		NearbyResidential: 18,
		Bounds:            bounds,
		Vertices:          vertices,
	}})
}
