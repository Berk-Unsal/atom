package raytracer

import (
	"context"
	"math"
	"testing"
)

func TestPlanningDefaultsSelectExplicitPropagationModes(t *testing.T) {
	if got := DefaultPlanningCellRFProfile("4g", 2.6, 30, 400, 120, 20, 0.7, 1).PropagationModelID; got != UrbanShortRangePropagationID {
		t.Fatalf("2.6 GHz planning default = %q, want %q", got, UrbanShortRangePropagationID)
	}
	if got := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1).PropagationModelID; got != UrbanShortRangePropagationID {
		t.Fatalf("28 GHz planning default = %q, want %q", got, UrbanShortRangePropagationID)
	}
	if got := DefaultPlanningCellRFProfile("6g", 140, 30, 400, 120, 1000, 0.7, 1).PropagationModelID; got != ResearchSubTHzPropagationID {
		t.Fatalf("140 GHz planning default = %q, want %q", got, ResearchSubTHzPropagationID)
	}

	request := (StaticSimulationRequestInput{}).ToRequest()
	if request.RFProfile.PropagationModelID != UrbanShortRangePropagationID {
		t.Fatalf("API request default = %q, want %q", request.RFProfile.PropagationModelID, UrbanShortRangePropagationID)
	}
}

func TestUrbanShortRangeFormulaFixtures(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 500, 120, 100, 0.7, 1)
	profile.PropagationModelID = UrbanShortRangePropagationID
	base := PropagationLinkContext{
		Profile: profile, GroundDistanceM: 100, LOSState: PropagationLOSState(PropagationLOS),
		EndpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O), BuildingDataAvailable: true,
	}

	los := EvaluatePropagationLink(base)
	if !los.Applicable || los.AppliedModelID != UrbanShortRangePropagationID || los.FallbackUsed {
		t.Fatalf("LOS result did not use the urban model: %+v", los)
	}
	if math.Abs(los.Terms.BreakpointDistanceM-4480) > 1e-9 {
		t.Fatalf("breakpoint = %.9f, want 4480", los.Terms.BreakpointDistanceM)
	}
	if math.Abs(los.Terms.BasePathLossDB-101.1999564167) > 1e-6 {
		t.Fatalf("28 GHz UMa LOS path loss = %.9f, want 101.199956417", los.Terms.BasePathLossDB)
	}
	if math.Abs(los.ReceivedPowerDBm-(-46.1999564167)) > 1e-6 {
		t.Fatalf("28 GHz UMa LOS received power = %.9f, want -46.199956417", los.ReceivedPowerDBm)
	}

	nlosContext := base
	nlosContext.LOSState = PropagationLOSState(PropagationNLOS)
	nlosContext.WallEventCount = 3
	nlos := EvaluatePropagationLink(nlosContext)
	if math.Abs(nlos.Terms.BasePathLossDB-121.0993233299) > 1e-6 {
		t.Fatalf("28 GHz UMa NLOS path loss = %.9f, want 121.099323330", nlos.Terms.BasePathLossDB)
	}
	if nlos.Terms.WallLossDB != 0 || nlos.Terms.FreeSpacePathLossDB != 0 {
		t.Fatalf("urban NLOS double-counted legacy loss terms: %+v", nlos.Terms)
	}
	if math.Abs(nlos.ReceivedPowerDBm-(-66.0993233299)) > 1e-6 {
		t.Fatalf("28 GHz UMa NLOS received power = %.9f, want -66.099323330", nlos.ReceivedPowerDBm)
	}

	breakpoint := base
	breakpoint.Profile = DefaultPlanningCellRFProfile("4g", 2.6, 30, 500, 120, 20, 0.7, 1)
	breakpoint.Profile.PropagationModelID = UrbanShortRangePropagationID
	breakpoint.GroundDistanceM = 500
	breakpointResult := EvaluatePropagationLink(breakpoint)
	if math.Abs(breakpointResult.Terms.BasePathLossDB-97.1212998679) > 1e-6 {
		t.Fatalf("2.6 GHz post-breakpoint LOS path loss = %.9f, want 97.121299868", breakpointResult.Terms.BasePathLossDB)
	}

	fixtures := []struct {
		name       string
		frequency  float64
		distance   float64
		state      PropagationLOSState
		pathLossDB float64
		rxDBm      float64
	}{
		{name: "2.6 GHz near LOS", frequency: 2.6, distance: 10, state: PropagationLOSState(PropagationLOS), pathLossDB: 67.2580219249, rxDBm: -12.2580219249},
		{name: "2.6 GHz medium NLOS", frequency: 2.6, distance: 100, state: PropagationLOSState(PropagationNLOS), pathLossDB: 100.4556296625, rxDBm: -45.4556296625},
		{name: "2.6 GHz long LOS beyond breakpoint", frequency: 2.6, distance: 5000, state: PropagationLOSState(PropagationLOS), pathLossDB: 137.1023257679, rxDBm: -82.1023257679},
		{name: "28 GHz near NLOS", frequency: 28, distance: 10, state: PropagationLOSState(PropagationNLOS), pathLossDB: 97.4768119019, rxDBm: -42.4768119019},
		{name: "28 GHz medium LOS", frequency: 28, distance: 100, state: PropagationLOSState(PropagationLOS), pathLossDB: 101.1999564167, rxDBm: -46.1999564167},
		{name: "28 GHz long NLOS", frequency: 28, distance: 5000, state: PropagationLOSState(PropagationNLOS), pathLossDB: 187.0390958525, rxDBm: -132.0390958525},
	}
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			fixtureProfile := DefaultPlanningCellRFProfile(NetworkTechnologyForFrequency(fixture.frequency), fixture.frequency, 30, 5000, 360, 100, 0.7, 1)
			fixtureProfile.HorizontalPatternID = "omni"
			result := EvaluatePropagationLink(PropagationLinkContext{
				Profile: fixtureProfile, GroundDistanceM: fixture.distance, LOSState: fixture.state,
				EndpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O), BuildingDataAvailable: true,
			})
			if !result.Applicable || result.FallbackUsed {
				t.Fatalf("fixture unexpectedly fell back: %+v", result)
			}
			if math.Abs(result.Terms.BasePathLossDB-fixture.pathLossDB) > 1e-6 {
				t.Fatalf("path loss = %.10f, want %.10f", result.Terms.BasePathLossDB, fixture.pathLossDB)
			}
			if math.Abs(result.ReceivedPowerDBm-fixture.rxDBm) > 1e-6 {
				t.Fatalf("received power = %.10f, want %.10f", result.ReceivedPowerDBm, fixture.rxDBm)
			}
			if result.Terms.FreeSpacePathLossDB != 0 || result.Terms.WallLossDB != 0 {
				t.Fatalf("urban fixture includes legacy loss terms: %+v", result.Terms)
			}
		})
	}
}

func TestPropagationApplicabilityAndFallbackAreExplicit(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	base := PropagationLinkContext{
		Profile: profile, GroundDistanceM: 100, LOSState: PropagationLOSState(PropagationLOS),
		EndpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O), BuildingDataAvailable: true,
	}
	for name, mutate := range map[string]func(*PropagationLinkContext){
		"missing building data": func(ctx *PropagationLinkContext) { ctx.BuildingDataAvailable = false },
		"unknown LOS":           func(ctx *PropagationLinkContext) { ctx.LOSState = PropagationLOSState(PropagationLOSUnknown) },
		"indoor receiver": func(ctx *PropagationLinkContext) {
			ctx.EndpointCase = PropagationEndpointCase(PropagationEndpointIndoorRx)
		},
		"distance too short":                  func(ctx *PropagationLinkContext) { ctx.GroundDistanceM = 9 },
		"distance too long":                   func(ctx *PropagationLinkContext) { ctx.GroundDistanceM = 5001 },
		"frequency too low":                   func(ctx *PropagationLinkContext) { ctx.Profile.FrequencyGHz = 0.5 },
		"frequency too high":                  func(ctx *PropagationLinkContext) { ctx.Profile.FrequencyGHz = 100 },
		"transmitter height outside envelope": func(ctx *PropagationLinkContext) { ctx.Profile.AntennaHeightM = 9 },
		"receiver height outside envelope":    func(ctx *PropagationLinkContext) { ctx.Profile.ReceiverHeightM = 13 },
	} {
		t.Run(name, func(t *testing.T) {
			ctx := base
			mutate(&ctx)
			result := EvaluatePropagationLink(ctx)
			if result.Applicable || !result.FallbackUsed || result.AppliedModelID != LegacyPropagationModelID {
				t.Fatalf("fallback result = %+v", result)
			}
			if result.ApplicabilityReason == "" || result.ApplicabilityDetail == "" {
				t.Fatalf("fallback reason was not explained: %+v", result)
			}
		})
	}

	research := DefaultPlanningCellRFProfile("6g", 140, 30, 400, 120, 1000, 0.7, 1)
	researchResult := EvaluatePropagationLink(PropagationLinkContext{Profile: research, GroundDistanceM: 100})
	if !researchResult.Applicable || researchResult.AppliedModelID != ResearchSubTHzPropagationID || researchResult.FallbackUsed {
		t.Fatalf("140 GHz research result = %+v", researchResult)
	}

	urbanAt140 := base
	urbanAt140.Profile = research
	urbanAt140.Profile.PropagationModelID = UrbanShortRangePropagationID
	urbanFallback := EvaluatePropagationLink(urbanAt140)
	if urbanFallback.Applicable || !urbanFallback.FallbackUsed || urbanFallback.AppliedModelID != LegacyPropagationModelID || urbanFallback.ApplicabilityReason != RFReferenceReasonFrequencyOutOfRange {
		t.Fatalf("140 GHz urban request did not expose explicit fallback: %+v", urbanFallback)
	}
}

func testPropagationFixtureBuilding(origin Point, bearing, distance, halfSize float64) *BuildingIndex {
	center := DestinationPoint(origin, bearing, distance)
	latDelta := halfSize / 111_320
	lonDelta := halfSize / (111_320 * math.Cos(center.Lat*math.Pi/180))
	vertices := []Point{
		{Lon: center.Lon - lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat + latDelta},
		{Lon: center.Lon - lonDelta, Lat: center.Lat + latDelta},
	}
	bounds, _ := BoundsFromPoints(vertices)
	return NewBuildingIndex([]*BuildingFootprint{{ID: "fixture-building", Bounds: bounds, Vertices: vertices}})
}

func TestPropagationGeometryAndEngineConsistency(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	buildings := testPropagationFixtureBuilding(origin, 0, 80, 4)
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 100, 360, 100, 0.7, 1)
	profile.HorizontalPatternID = "omni"
	request := StaticSimulationRequest{
		TowerLon: origin.Lon, TowerLat: origin.Lat, Rays: 1, RadiusMeters: 100,
		FrequencyGHz: 28, TxPowerDBm: 30, AzimuthDeg: 0, BeamWidthDeg: 360,
		RFProfile: profile,
	}

	east := DestinationPoint(origin, 90, 100)
	geometry, err := buildPropagationPathGeometryContext(context.Background(), origin, east, buildings)
	if err != nil {
		t.Fatalf("build propagation geometry: %v", err)
	}
	los, endpoint, walls := geometry.classify(east, 100)
	if los != PropagationLOSState(PropagationLOS) || endpoint != PropagationEndpointCase(PropagationEndpointOutdoorO2O) || walls != 0 {
		t.Fatalf("clear fixture classification = %q/%q/%d", los, endpoint, walls)
	}
	direct := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: 100, LOSState: los, EndpointCase: endpoint,
		BuildingDataAvailable: geometry.available, WallEventCount: walls,
	})

	surface, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
		Simulation: request, CellSizeMeters: 25, ThresholdsDBm: []float64{-100},
	}, buildings)
	if err != nil {
		t.Fatalf("surface: %v", err)
	}
	centerRow := surface.Grid.Height / 2
	surfacePower := surface.Grid.Values[centerRow*surface.Grid.Width+surface.Grid.Width-1]
	if math.Abs(surfacePower-roundOne(direct.ReceivedPowerDBm)) > 0.1 {
		t.Fatalf("surface clear endpoint = %.3f, direct = %.3f", surfacePower, direct.ReceivedPowerDBm)
	}

	features, terminal := simulateSegmentedRayInternal(origin, 0, 90, request, buildings, true)
	var rayPower float64
	found := false
	for _, feature := range features {
		if math.Abs(feature.Properties.SegmentEndM-100) < 0.1 {
			rayPower = feature.Properties.SignalEndDBm
			found = true
			if feature.Properties.AppliedPropagationModelID != UrbanShortRangePropagationID || feature.Properties.LOSState != PropagationLOS {
				t.Fatalf("ray explainability = %+v", feature.Properties)
			}
		}
	}
	if !found || math.Abs(rayPower-surfacePower) > 0.1 {
		t.Fatalf("ray endpoint = %.3f, surface endpoint = %.3f, terminal = %+v", rayPower, surfacePower, terminal)
	}

	north := DestinationPoint(origin, 0, 100)
	nlosGeometry, err := buildPropagationPathGeometryContext(context.Background(), origin, north, buildings)
	if err != nil {
		t.Fatalf("build NLOS propagation geometry: %v", err)
	}
	nlos, nlosEndpoint, nlosWalls := nlosGeometry.classify(north, 100)
	if nlos != PropagationLOSState(PropagationNLOS) || nlosEndpoint != PropagationEndpointCase(PropagationEndpointOutdoorO2O) || nlosWalls == 0 {
		t.Fatalf("blocked fixture classification = %q/%q/%d", nlos, nlosEndpoint, nlosWalls)
	}
	nlosDirect := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: 100, LOSState: nlos, EndpointCase: nlosEndpoint,
		BuildingDataAvailable: nlosGeometry.available, WallEventCount: nlosWalls,
	})
	nlosSurface, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
		Simulation: request, CellSizeMeters: 25, ThresholdsDBm: []float64{-100},
	}, buildings)
	if err != nil {
		t.Fatalf("NLOS surface: %v", err)
	}
	nlosSurfacePower := nlosSurface.Grid.Values[(nlosSurface.Grid.Height-1)*nlosSurface.Grid.Width+nlosSurface.Grid.Width/2]
	if math.Abs(nlosSurfacePower-roundOne(nlosDirect.ReceivedPowerDBm)) > 0.1 {
		t.Fatalf("NLOS surface endpoint = %.3f, direct = %.3f", nlosSurfacePower, nlosDirect.ReceivedPowerDBm)
	}
	nlosFeatures, nlosTerminal := simulateSegmentedRayInternal(origin, 0, 0, request, buildings, true)
	nlosFound := false
	for _, feature := range nlosFeatures {
		if math.Abs(feature.Properties.SegmentEndM-100) < 0.1 {
			nlosFound = true
			if feature.Properties.AppliedPropagationModelID != UrbanShortRangePropagationID || feature.Properties.LOSState != PropagationNLOS || feature.Properties.WallLossDB != 0 {
				t.Fatalf("NLOS ray explainability = %+v", feature.Properties)
			}
			if math.Abs(feature.Properties.SignalEndDBm-nlosSurfacePower) > 0.1 {
				t.Fatalf("NLOS ray endpoint = %.3f, surface endpoint = %.3f", feature.Properties.SignalEndDBm, nlosSurfacePower)
			}
		}
	}
	if !nlosFound || math.Abs(nlosTerminal.signalDBm-nlosDirect.ReceivedPowerDBm) > 0.1 {
		t.Fatalf("NLOS ray endpoint was not retained: found=%t terminal=%+v direct=%.3f", nlosFound, nlosTerminal, nlosDirect.ReceivedPowerDBm)
	}

	boundaryPoint := DestinationPoint(origin, 0, 84)
	boundaryGeometry, err := buildPropagationPathGeometryContext(context.Background(), origin, boundaryPoint, buildings)
	if err != nil {
		t.Fatalf("build boundary propagation geometry: %v", err)
	}
	boundaryLOS, boundaryEndpoint, boundaryWalls := boundaryGeometry.classify(boundaryPoint, 84)
	if boundaryLOS != PropagationLOSState(PropagationNLOS) || boundaryEndpoint != PropagationEndpointCase(PropagationEndpointOutdoorO2O) || boundaryWalls == 0 {
		t.Fatalf("boundary fixture classification = %q/%q/%d", boundaryLOS, boundaryEndpoint, boundaryWalls)
	}

	beamEdgePoint := DestinationPoint(origin, 30, 100)
	if math.Abs(BearingDegrees(origin, beamEdgePoint)-30) > 0.001 || !AngleInBeam(30, 0, 60) || AngleInBeam(30.001, 0, 60) {
		t.Fatalf("beam-edge eligibility is not deterministic: bearing=%.12f edge=%t outside=%t", BearingDegrees(origin, beamEdgePoint), AngleInBeam(30, 0, 60), AngleInBeam(30.001, 0, 60))
	}

	interferenceRequest := InterferenceRequest{
		NetworkTech: "5g", Towers: []InterferenceTowerRequest{{ID: "fixture", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90, RFProfile: profile}},
		RadiusMeters: 100, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 360, BandwidthMHz: 100,
		LoadFactor: 0.7, ReuseFactor: 1, NoiseFigureDB: 7, SampleSpacingM: 40, RFProfile: profile,
	}
	NormalizeInterferenceRequest(&interferenceRequest)
	preset, _ := interferencePresetFor("5g", 100)
	interferencePoint := DestinationPoint(origin, 90, 90)
	interferenceGeometry, err := buildPropagationPathGeometryContext(context.Background(), origin, interferencePoint, buildings)
	if err != nil {
		t.Fatalf("build interference geometry: %v", err)
	}
	interferenceLOS, interferenceEndpoint, interferenceWalls := interferenceGeometry.classify(interferencePoint, ApproxDistanceMeters(origin, interferencePoint))
	interferenceDirect := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: ApproxDistanceMeters(origin, interferencePoint),
		LOSState: interferenceLOS, EndpointCase: interferenceEndpoint,
		BuildingDataAvailable: interferenceGeometry.available, WallEventCount: interferenceWalls,
	})
	properties, err := evaluateInterferencePointContext(context.Background(), interferenceRequest, preset, buildings, interferencePoint)
	if err != nil || properties.RSRPDBm == nil {
		t.Fatalf("interference clear endpoint = %+v, err=%v", properties, err)
	}
	expectedRSRP := interferenceDirect.ReceivedPowerDBm - 10*math.Log10(12*float64(preset.resourceBlocks))
	if math.Abs(*properties.RSRPDBm-roundOne(expectedRSRP)) > 0.1 {
		t.Fatalf("interference RSRP = %.3f, direct conversion = %.3f", *properties.RSRPDBm, expectedRSRP)
	}
}
