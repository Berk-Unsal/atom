package raytracer

import (
	"context"
	"math"
	"reflect"
	"testing"
)

func TestDiffractionDiagnosticRequiresKnownHeightAndExposesEdgeLedger(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 120)
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 360, 100, 0.7, 1)
	profile.AntennaHeightM = 12
	profile.ReceiverHeightM = 1.5
	known := diffractionFixtureBuilding("known-roof", origin, 60, 12, 25, HeightSourceExplicitLegacy)
	response, err := AnalyzePathProfileContext(context.Background(), PathProfileRequest{
		Transmitter: origin, Receiver: endpoint, SampleSpacingM: 5, ModelProfile: "urban-short-range", AzimuthDeg: 90,
		RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
	}, flatTestTerrain{elevation: 100}, NewBuildingIndex([]*BuildingFootprint{known}))
	if err != nil {
		t.Fatalf("known-height path profile: %v", err)
	}
	diagnostic := response.DiffractionDiagnostic
	if !diagnostic.Available || diagnostic.Reason != "available" || diagnostic.SelectedEdge == nil {
		t.Fatalf("known-height diagnostic = %+v", diagnostic)
	}
	if len(diagnostic.Geometry.Candidates) != 2 {
		t.Fatalf("roof entry/exit candidates = %d, want 2: %+v", len(diagnostic.Geometry.Candidates), diagnostic.Geometry.Candidates)
	}
	maxV := math.Inf(-1)
	selectedCount := 0
	for _, candidate := range diagnostic.Geometry.Candidates {
		if candidate.V == nil || candidate.DiffractionLossDB == nil || candidate.ClearanceM == nil || candidate.FresnelClearanceRatio == nil {
			t.Fatalf("known candidate omitted geometry = %+v", candidate)
		}
		if *candidate.V > maxV && *candidate.V > P526SingleEdgeZeroLossV {
			maxV = *candidate.V
		}
		if candidate.SelectedDominantEdge {
			selectedCount++
			if candidate.ID != diagnostic.SelectedEdge.ID {
				t.Fatalf("selected edge mismatch: candidate=%+v selected=%+v", candidate, diagnostic.SelectedEdge)
			}
		}
	}
	if selectedCount != 1 || math.Abs(*diagnostic.SelectedEdge.V-maxV) > 1e-9 {
		t.Fatalf("dominant selection count/v = %d/%.6f, want 1/%.6f", selectedCount, *diagnostic.SelectedEdge.V, maxV)
	}
	if response.CanonicalComparison.Available && response.CanonicalComparison.DiagnosticMinusCanonicalDB == nil {
		t.Fatal("canonical comparison did not expose diagnostic-minus-canonical difference")
	}

	unknown := diffractionFixtureBuilding("unknown-roof", origin, 60, 12, defaultBuildingHeightMeters, HeightSourceFallbackLegacy)
	unknownResponse, err := AnalyzePathProfileContext(context.Background(), PathProfileRequest{
		Transmitter: origin, Receiver: endpoint, SampleSpacingM: 5, ModelProfile: "urban-short-range", AzimuthDeg: 90,
		RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
	}, flatTestTerrain{elevation: 100}, NewBuildingIndex([]*BuildingFootprint{unknown}))
	if err != nil {
		t.Fatalf("unknown-height path profile: %v", err)
	}
	if unknownResponse.DiffractionDiagnostic.Available || unknownResponse.DiffractionDiagnostic.Reason != DiffractionUnavailableHeight {
		t.Fatalf("unknown-height diagnostic = %+v", unknownResponse.DiffractionDiagnostic)
	}
	for _, candidate := range unknownResponse.DiffractionDiagnostic.Geometry.Candidates {
		if candidate.HeightAvailable || candidate.V != nil || candidate.DiffractionLossDB != nil || candidate.ClearanceM != nil {
			t.Fatalf("unknown height entered diffraction geometry = %+v", candidate)
		}
	}
	if component := lossComponent(unknownResponse.LossBudget.Components, "diffraction"); component.Enabled || component.LossDB != 0 {
		t.Fatalf("unknown-height loss budget used diffraction = %+v", component)
	}
}

func TestFresnelConcernDoesNotChangeGeometricLOSClassification(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 5000)
	profile := DefaultCellRFProfile("4g", 2.6, 30, 5000, 360, 20, 0.7, 1)
	profile.AntennaHeightM = 1.5
	profile.ReceiverHeightM = 1.5
	response, err := AnalyzePathProfileContext(context.Background(), PathProfileRequest{
		Transmitter: origin, Receiver: endpoint, SampleSpacingM: 100, ModelProfile: "terrain-profile", AzimuthDeg: 90,
		RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
	}, flatTestTerrain{elevation: 0}, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("clear path profile: %v", err)
	}
	if !response.GeometricLOS || response.Classification != "line-of-sight" {
		t.Fatalf("geometric classification = %t/%q", response.GeometricLOS, response.Classification)
	}
	if response.FresnelClearance.Status != "concern" || !response.FresnelClearance.ClassificationIndependent || response.MinimumFresnelRatio >= 0.6 {
		t.Fatalf("Fresnel diagnostic = %+v", response.FresnelClearance)
	}
}

func TestMultipleKnownRoofEdgesRemainSingleDominantDiagnostic(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 220)
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 360, 100, 0.7, 1)
	profile.AntennaHeightM = 30
	profile.ReceiverHeightM = 1.5
	first := diffractionFixtureBuilding("first", origin, 60, 8, 31, HeightSourceExplicitLegacy)
	second := diffractionFixtureBuilding("second", origin, 150, 8, 25, HeightSourceExplicitLegacy)
	response, err := AnalyzePathProfileContext(context.Background(), PathProfileRequest{
		Transmitter: origin, Receiver: endpoint, SampleSpacingM: 5, ModelProfile: "urban-short-range", AzimuthDeg: 90,
		RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
	}, flatTestTerrain{elevation: 0}, NewBuildingIndex([]*BuildingFootprint{first, second}))
	if err != nil {
		t.Fatalf("multiple-edge path profile: %v", err)
	}
	if !response.DiffractionDiagnostic.Available || response.DiffractionDiagnostic.MultipleEdgeStatus != "multi-edge deferred" {
		t.Fatalf("multiple-edge diagnostic = %+v", response.DiffractionDiagnostic)
	}
	if len(response.DiffractionDiagnostic.Geometry.Candidates) != 4 {
		t.Fatalf("multiple-edge ledger = %d, want 4", len(response.DiffractionDiagnostic.Geometry.Candidates))
	}
	selected := 0
	for _, candidate := range response.DiffractionDiagnostic.Geometry.Candidates {
		if candidate.SelectedDominantEdge {
			selected++
		}
	}
	if selected != 1 {
		t.Fatalf("selected edge count = %d, want 1", selected)
	}
}

func TestPathProfileDoesNotMutateCanonicalPropagationResult(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 120)
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 360, 100, 0.7, 1)
	contextBefore := PropagationLinkContext{
		Profile: profile, GroundDistanceM: 120, HorizontalOffsetDeg: 0, CalibrationOffsetDB: 0,
		LOSState: PropagationLOSState(PropagationLOS), EndpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O),
		BuildingDataAvailable: true,
	}
	before := EvaluatePropagationLink(contextBefore)
	building := diffractionFixtureBuilding("diagnostic-only", origin, 60, 8, 30, HeightSourceExplicitLegacy)
	_, err := AnalyzePathProfileContext(context.Background(), PathProfileRequest{
		Transmitter: origin, Receiver: endpoint, SampleSpacingM: 5, ModelProfile: "urban-short-range", AzimuthDeg: 90,
		RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
	}, flatTestTerrain{elevation: 0}, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatalf("diagnostic path profile: %v", err)
	}
	after := EvaluatePropagationLink(contextBefore)
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("canonical propagation changed across diagnostic evaluation:\nbefore=%+v\nafter=%+v", before, after)
	}
}

func TestDiffractionDiagnosticDoesNotChangeCanonicalWorkflowResults(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 120)
	profile := heightAwareTestProfile()
	profile.RadiusMeters = 120
	profile.BeamWidthDeg = 360
	building := heightFixtureBuilding("workflow-roof", origin, 90, 60, 8, 22, HeightSourceExplicitLegacy)
	buildings := NewBuildingIndex([]*BuildingFootprint{building})
	network := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{{ID: "cell-a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90, RFProfile: profile}},
		Rays:   4, RadiusMeters: 120, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 360, RFProfile: profile,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}},
	}
	static := StaticSimulationRequest{
		TowerLon: origin.Lon, TowerLat: origin.Lat, Rays: 1, RadiusMeters: 120, FrequencyGHz: 28,
		TxPowerDBm: 30, AzimuthDeg: 90, BeamWidthDeg: 360, RFProfile: profile,
	}
	interference := InterferenceRequest{
		NetworkTech: "5g", Towers: []InterferenceTowerRequest{{ID: "cell-a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90, RFProfile: profile}},
		RadiusMeters: 120, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 360, BandwidthMHz: 100,
		LoadFactor: 0.7, ReuseFactor: 1, NoiseFigureDB: 7, SampleSpacingM: 40, RFProfile: profile,
	}
	NormalizeInterferenceRequest(&interference)
	entry := BuildingEntryAnalysisRequest{Network: network, BuildingIDs: []string{building.ID}}

	beforeOptimization, err := OptimizeNetworkContext(context.Background(), network, buildings)
	if err != nil {
		t.Fatalf("baseline optimizer: %v", err)
	}
	beforeSurface, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{Simulation: static, CellSizeMeters: 20, ThresholdsDBm: []float64{-100}}, buildings)
	if err != nil {
		t.Fatalf("baseline surface: %v", err)
	}
	beforeInterference, err := AnalyzeInterferenceContext(context.Background(), interference, buildings)
	if err != nil {
		t.Fatalf("baseline interference: %v", err)
	}
	beforeEntry, err := AnalyzeBuildingEntryContext(context.Background(), entry, buildings)
	if err != nil {
		t.Fatalf("baseline building entry: %v", err)
	}

	_, err = AnalyzePathProfileContext(context.Background(), PathProfileRequest{
		Transmitter: origin, Receiver: endpoint, SampleSpacingM: 5, ModelProfile: "urban-short-range", AzimuthDeg: 90,
		RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
	}, flatTestTerrain{elevation: 0}, buildings)
	if err != nil {
		t.Fatalf("diffraction diagnostic: %v", err)
	}

	afterOptimization, err := OptimizeNetworkContext(context.Background(), network, buildings)
	if err != nil {
		t.Fatalf("post-diagnostic optimizer: %v", err)
	}
	afterSurface, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{Simulation: static, CellSizeMeters: 20, ThresholdsDBm: []float64{-100}}, buildings)
	if err != nil {
		t.Fatalf("post-diagnostic surface: %v", err)
	}
	afterInterference, err := AnalyzeInterferenceContext(context.Background(), interference, buildings)
	if err != nil {
		t.Fatalf("post-diagnostic interference: %v", err)
	}
	afterEntry, err := AnalyzeBuildingEntryContext(context.Background(), entry, buildings)
	if err != nil {
		t.Fatalf("post-diagnostic building entry: %v", err)
	}

	if !reflect.DeepEqual(beforeOptimization.Stats, afterOptimization.Stats) ||
		!reflect.DeepEqual(beforeOptimization.Baseline, afterOptimization.Baseline) ||
		!reflect.DeepEqual(beforeOptimization.Optimization, afterOptimization.Optimization) ||
		!reflect.DeepEqual(beforeOptimization.ParetoFrontier, afterOptimization.ParetoFrontier) {
		t.Fatal("canonical optimizer output changed after diffraction diagnostic")
	}
	if !reflect.DeepEqual(beforeSurface.Grid, afterSurface.Grid) || !reflect.DeepEqual(beforeSurface.Stats, afterSurface.Stats) || !reflect.DeepEqual(beforeSurface.Contours, afterSurface.Contours) {
		t.Fatal("canonical coverage surface output changed after diffraction diagnostic")
	}
	if !reflect.DeepEqual(beforeInterference.Stats, afterInterference.Stats) || !reflect.DeepEqual(beforeInterference.GeoJSON, afterInterference.GeoJSON) || !reflect.DeepEqual(beforeInterference.DemandGeoJSON, afterInterference.DemandGeoJSON) {
		t.Fatal("canonical interference output changed after diffraction diagnostic")
	}
	if !reflect.DeepEqual(beforeEntry.Summary, afterEntry.Summary) || !reflect.DeepEqual(beforeEntry.Results, afterEntry.Results) || !reflect.DeepEqual(beforeEntry.CellSummaries, afterEntry.CellSummaries) {
		t.Fatal("canonical building-entry output changed after diffraction diagnostic")
	}
	t.Log("canonical optimization, surface, interference, and building-entry outputs remained invariant")
}

func TestDiffractionFrequencyComparisonAndResearch140Status(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 100)
	building := diffractionFixtureBuilding("frequency-roof", origin, 50, 5, 20, HeightSourceExplicitLegacy)
	request := func(frequency float64, tech, model string) PathProfileRequest {
		profile := DefaultCellRFProfile(tech, frequency, 30, 400, 360, 100, 0.7, 1)
		profile.PropagationModelID = DefaultPropagationModelID(frequency)
		profile.AntennaHeightM = 10
		profile.ReceiverHeightM = 10
		return PathProfileRequest{
			Transmitter: origin, Receiver: endpoint, SampleSpacingM: 2, ModelProfile: model, AzimuthDeg: 90,
			RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
		}
	}
	low, err := AnalyzePathProfileContext(context.Background(), request(2.6, "4g", "terrain-profile"), flatTestTerrain{elevation: 0}, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatalf("2.6 GHz diagnostic: %v", err)
	}
	high, err := AnalyzePathProfileContext(context.Background(), request(28, "5g", "urban-short-range"), flatTestTerrain{elevation: 0}, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatalf("28 GHz diagnostic: %v", err)
	}
	if low.DiffractionDiagnostic.SelectedEdge == nil || high.DiffractionDiagnostic.SelectedEdge == nil {
		t.Fatalf("frequency diagnostics did not select an edge: low=%+v high=%+v", low.DiffractionDiagnostic, high.DiffractionDiagnostic)
	}
	if high.DiffractionDiagnostic.SelectedEdge.V == nil || low.DiffractionDiagnostic.SelectedEdge.V == nil || high.DiffractionDiagnostic.DiffractionLossDB == nil || low.DiffractionDiagnostic.DiffractionLossDB == nil {
		t.Fatal("frequency diagnostics omitted v/loss")
	}
	if *high.DiffractionDiagnostic.SelectedEdge.V <= *low.DiffractionDiagnostic.SelectedEdge.V || *high.DiffractionDiagnostic.DiffractionLossDB <= *low.DiffractionDiagnostic.DiffractionLossDB {
		t.Fatalf("28 GHz did not increase knife-edge diagnostic: low v/loss=%.4f/%.4f high=%.4f/%.4f", *low.DiffractionDiagnostic.SelectedEdge.V, *low.DiffractionDiagnostic.DiffractionLossDB, *high.DiffractionDiagnostic.SelectedEdge.V, *high.DiffractionDiagnostic.DiffractionLossDB)
	}
	if ratio := *high.DiffractionDiagnostic.SelectedEdge.V / *low.DiffractionDiagnostic.SelectedEdge.V; math.Abs(ratio-math.Sqrt(28/2.6)) > 0.02 {
		t.Fatalf("frequency v ratio = %.5f, want %.5f", ratio, math.Sqrt(28/2.6))
	}

	research, err := AnalyzePathProfileContext(context.Background(), request(140, "6g", "research-sub-thz"), flatTestTerrain{elevation: 0}, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatalf("140 GHz diagnostic: %v", err)
	}
	if research.DiffractionDiagnostic.Applicability != "research_only" || !research.DiffractionDiagnostic.Available {
		t.Fatalf("140 GHz diagnostic status = %+v", research.DiffractionDiagnostic)
	}
	if research.RFContract.ModelID != DiagnosticPathModelID || research.RFProfile.PropagationModelID != ResearchSubTHzPropagationID {
		t.Fatalf("140 GHz diagnostic changed propagation identity: contract=%+v profile=%q", research.RFContract, research.RFProfile.PropagationModelID)
	}
}

func diffractionFixtureBuilding(id string, origin Point, distance, halfSize, height float64, source string) *BuildingFootprint {
	center := DestinationPoint(origin, 90, distance)
	latDelta := halfSize / 111_320.0
	lonDelta := halfSize / (111_320.0 * math.Cos(center.Lat*math.Pi/180))
	vertices := []Point{
		{Lon: center.Lon - lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat + latDelta},
		{Lon: center.Lon - lonDelta, Lat: center.Lat + latDelta},
	}
	bounds, _ := BoundsFromPoints(vertices)
	building := &BuildingFootprint{ID: id, Bounds: bounds, Vertices: vertices, HeightMeters: height, HeightSource: source, Material: "concrete"}
	if source == HeightSourceExplicitLegacy {
		building.HeightEvidenceMeters = height
		building.HeightEvidenceSource = HeightEvidenceObservedTag
		building.HeightEvidenceTag = "height"
	}
	return building
}
