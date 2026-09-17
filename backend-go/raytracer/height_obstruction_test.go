package raytracer

import (
	"context"
	"fmt"
	"math"
	"os"
	"strings"
	"testing"
	"time"
)

func TestBuildingHeightEvidenceSeparatesObservedDerivedAndFallback(t *testing.T) {
	tests := []struct {
		name           string
		props          map[string]any
		meters         float64
		source         string
		evidenceSource string
		tag            string
	}{
		{name: "explicit height", props: map[string]any{"height": "24 m", "building:levels": 2.0}, meters: 24, source: HeightSourceExplicitLegacy, evidenceSource: HeightEvidenceObservedTag, tag: "height"},
		{name: "levels", props: map[string]any{"building:levels": 4.0}, meters: 12, source: HeightSourceLevelsLegacy, evidenceSource: HeightEvidenceFromLevels, tag: "building:levels"},
		{name: "fallback", props: map[string]any{}, meters: defaultBuildingHeightMeters, source: HeightSourceFallbackLegacy, evidenceSource: HeightEvidenceUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			meters, source, evidenceMeters, evidenceSource, tag := buildingHeightWithEvidence(feature{Properties: test.props})
			if meters != test.meters || source != test.source || evidenceSource != test.evidenceSource || tag != test.tag {
				t.Fatalf("height evidence = %.3f/%s %.3f/%s/%s, want %.3f/%s %.3f/%s/%s", meters, source, evidenceMeters, evidenceSource, tag, test.meters, test.source, test.meters, test.evidenceSource, test.tag)
			}
			if test.evidenceSource == HeightEvidenceUnavailable {
				if evidenceMeters != 0 {
					t.Fatalf("unavailable height evidence meters = %.3f, want zero", evidenceMeters)
				}
			} else if evidenceMeters != test.meters {
				t.Fatalf("height evidence meters = %.3f, want %.3f", evidenceMeters, test.meters)
			}
		})
	}
}

func TestHeightAwareClassifierUsesRoofIntervalsAndUnknownFallback(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 120)
	profile := heightAwareTestProfile()

	for _, test := range []struct {
		name        string
		height      float64
		source      string
		wantState   PropagationLOSState
		wantBasis   string
		wantBlocks  int
		wantClear   int
		wantUnknown int
	}{
		{name: "known roof blocks", height: 20, source: HeightSourceExplicitLegacy, wantState: PropagationLOSState(PropagationNLOS), wantBasis: LOSClassificationKnownRoofObstruction, wantBlocks: 1},
		{name: "known roof clears", height: 5, source: HeightSourceExplicitLegacy, wantState: PropagationLOSState(PropagationLOS), wantBasis: LOSClassificationKnownRoofsCleared, wantClear: 1},
		{name: "fallback is conservative", height: defaultBuildingHeightMeters, source: HeightSourceFallbackLegacy, wantState: PropagationLOSState(PropagationNLOS), wantBasis: LOSClassificationUnknownHeightConservative, wantUnknown: 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			building := heightFixtureBuilding("b-height", origin, 90, 80, 5, test.height, test.source)
			geometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, NewBuildingIndex([]*BuildingFootprint{building}), propagationPathGeometryOptions{
				TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
			})
			if err != nil {
				t.Fatalf("build geometry: %v", err)
			}
			classification := geometry.classifyHeightAware(endpoint, 120)
			if classification.State != test.wantState || classification.ClassificationBasis != test.wantBasis {
				t.Fatalf("classification = %+v", classification)
			}
			if len(classification.BlockingBuildings) != test.wantBlocks || len(classification.ClearedBuildings) != test.wantClear || len(classification.UnknownHeightBuildings) != test.wantUnknown {
				t.Fatalf("evidence counts = blocking=%d clear=%d unknown=%d", len(classification.BlockingBuildings), len(classification.ClearedBuildings), len(classification.UnknownHeightBuildings))
			}
			if len(classification.BlockingBuildings)+len(classification.ClearedBuildings) == 1 {
				intervals := classification.BlockingBuildings
				if len(intervals) == 0 {
					intervals = classification.ClearedBuildings
				}
				if len(intervals[0].Intervals) == 0 || intervals[0].Intervals[0].TEntry >= intervals[0].Intervals[0].TExit {
					t.Fatalf("crossed building did not produce a positive interval: %+v", intervals[0])
				}
			}
			if classification.TerrainStatus != TerrainStatusUnavailable {
				t.Fatalf("terrain status = %q, want unavailable", classification.TerrainStatus)
			}
		})
	}

	// At exactly roof/centerline contact the deterministic contract treats the
	// roof as intersecting the geometric line. No Fresnel margin is involved.
	exactBuilding := heightFixtureBuilding("b-touch", origin, 90, 80, 5, 1, HeightSourceExplicitLegacy)
	exactIndex := NewBuildingIndex([]*BuildingFootprint{exactBuilding})
	geometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, exactIndex, propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build exact-touch geometry: %v", err)
	}
	exactHeight := geometry.lineHeightAt(geometry.heightEvidence[0].intervals[0].TExit)
	exactBuilding.HeightMeters = exactHeight
	exactBuilding.HeightEvidenceMeters = exactHeight
	exact := geometry.classifyHeightAware(endpoint, 120)
	if exact.State != PropagationLOSState(PropagationNLOS) || exact.ClassificationBasis != LOSClassificationKnownRoofObstruction {
		t.Fatalf("exact roof contact = %+v", exact)
	}
}

func TestHeightAwareClassifierHandlesTangentMultipartAndTargetFacade(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	profile := heightAwareTestProfile()
	metersPerLon := 111_320.0 * math.Cos(origin.Lat*math.Pi/180)
	endpoint := Point{Lon: origin.Lon + 120/metersPerLon, Lat: origin.Lat}

	// A triangle touches the east-going path at one vertex. The zero-length
	// interval is retained so tangent behavior is deterministic and inspectable.
	tangentCenter := Point{Lon: origin.Lon + 80/metersPerLon, Lat: origin.Lat}
	latDelta := 5.0 / 111_320.0
	lonDelta := 5.0 / (111_320.0 * math.Cos(tangentCenter.Lat*math.Pi/180))
	tangentVertices := []Point{
		{Lon: tangentCenter.Lon, Lat: tangentCenter.Lat},
		{Lon: tangentCenter.Lon - lonDelta, Lat: tangentCenter.Lat + latDelta},
		{Lon: tangentCenter.Lon + lonDelta, Lat: tangentCenter.Lat + latDelta},
	}
	tangentBounds, _ := BoundsFromPoints(tangentVertices)
	tangent := &BuildingFootprint{ID: "b-tangent", Bounds: tangentBounds, Vertices: tangentVertices, HeightMeters: 20, HeightSource: HeightSourceExplicitLegacy}
	geometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, NewBuildingIndex([]*BuildingFootprint{tangent}), propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build tangent geometry: %v", err)
	}
	tangentClassification := geometry.classifyHeightAware(endpoint, 120)
	if tangentClassification.State != PropagationLOSState(PropagationNLOS) || len(tangentClassification.BlockingBuildings) != 1 {
		t.Fatalf("tangent classification = %+v", tangentClassification)
	}
	if len(tangentClassification.BlockingBuildings[0].Intervals) != 1 || tangentClassification.BlockingBuildings[0].Intervals[0].TEntry != tangentClassification.BlockingBuildings[0].Intervals[0].TExit {
		t.Fatalf("tangent interval = %+v", tangentClassification.BlockingBuildings[0])
	}

	// A path that follows a footprint edge is a positive grazing interval, not
	// a pair of unrelated vertex contacts.
	edgeWest := Point{Lon: origin.Lon + 50/metersPerLon, Lat: origin.Lat}
	edgeEast := Point{Lon: origin.Lon + 90/metersPerLon, Lat: origin.Lat}
	edgeNorth := 5.0 / 111_320.0
	edgeVertices := []Point{
		edgeWest,
		edgeEast,
		{Lon: edgeEast.Lon, Lat: edgeEast.Lat + edgeNorth},
		{Lon: edgeWest.Lon, Lat: edgeWest.Lat + edgeNorth},
	}
	edgeBounds, _ := BoundsFromPoints(edgeVertices)
	edgeBuilding := &BuildingFootprint{ID: "b-edge-graze", Bounds: edgeBounds, Vertices: edgeVertices, HeightMeters: 20, HeightSource: HeightSourceExplicitLegacy}
	edgeGeometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, NewBuildingIndex([]*BuildingFootprint{edgeBuilding}), propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build edge-grazing geometry: %v", err)
	}
	edgeClassification := edgeGeometry.classifyHeightAware(endpoint, 120)
	if edgeClassification.State != PropagationLOSState(PropagationNLOS) || len(edgeClassification.BlockingBuildings) != 1 || len(edgeClassification.BlockingBuildings[0].Intervals) != 1 || edgeClassification.BlockingBuildings[0].Intervals[0].TExit-edgeClassification.BlockingBuildings[0].Intervals[0].TEntry <= 0 {
		t.Fatalf("edge grazing classification = %+v", edgeClassification)
	}

	partA := heightFixtureBuilding("logical-part-a", origin, 90, 55, 4, 5, HeightSourceExplicitLegacy)
	partB := heightFixtureBuilding("logical-part-b", origin, 90, 95, 4, 20, HeightSourceExplicitLegacy)
	geometry, err = buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, NewBuildingIndex([]*BuildingFootprint{partA, partB}), propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build multipart geometry: %v", err)
	}
	multipart := geometry.classifyHeightAware(endpoint, 120)
	if multipart.State != PropagationLOSState(PropagationNLOS) || len(multipart.ClearedBuildings) != 1 || len(multipart.BlockingBuildings) != 1 {
		t.Fatalf("multipart classification = %+v", multipart)
	}

	logicalPartA := heightFixtureBuilding("logical-part-1", origin, 90, 55, 4, 20, HeightSourceExplicitLegacy)
	logicalPartB := heightFixtureBuilding("logical-part-2", origin, 90, 95, 4, 20, HeightSourceExplicitLegacy)
	logicalPartA.LogicalID = "logical-building"
	logicalPartB.LogicalID = "logical-building"
	geometry, err = buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, NewBuildingIndex([]*BuildingFootprint{logicalPartA, logicalPartB}), propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build logical multipart geometry: %v", err)
	}
	logicalMultipart := geometry.classifyHeightAware(endpoint, 120)
	if len(logicalMultipart.BlockingBuildings) != 1 || logicalMultipart.BlockingBuildings[0].BuildingID != "logical-building" || len(logicalMultipart.BlockingBuildings[0].PartIDs) != 2 || len(logicalMultipart.BlockingBuildings[0].Intervals) != 2 {
		t.Fatalf("logical multipart was double-counted: %+v", logicalMultipart)
	}

	target := heightFixtureBuilding("target-facade", origin, 90, 95, 5, 40, HeightSourceExplicitLegacy)
	target.LogicalID = "target-building"
	targetEndpoint := DestinationPoint(origin, 90, 100)
	targetGeometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, targetEndpoint, NewBuildingIndex([]*BuildingFootprint{target}), propagationPathGeometryOptions{
		ExcludedBuildingIDs:        map[string]struct{}{target.ID: {}},
		ExcludedLogicalBuildingIDs: map[string]struct{}{target.LogicalID: {}},
		TxHeightM:                  profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build target facade geometry: %v", err)
	}
	targetClassification := targetGeometry.classifyHeightAware(targetEndpoint, 100)
	if targetClassification.State != PropagationLOSState(PropagationLOS) || targetClassification.ClassificationBasis != LOSClassificationNoFootprint {
		t.Fatalf("target facade self-blocked = %+v", targetClassification)
	}
}

func TestHeightAwareClassifierLeavesLegacyModelNumericallyUnchanged(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	endpoint := DestinationPoint(origin, 90, 120)
	building := heightFixtureBuilding("b-clear-roof", origin, 90, 80, 5, 5, HeightSourceExplicitLegacy)
	index := NewBuildingIndex([]*BuildingFootprint{building})
	profile := heightAwareTestProfile()
	profile.PropagationModelID = LegacyPropagationModelID
	geometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, index, propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build legacy geometry: %v", err)
	}
	state, endpointCase, wallEvents, classification := classifyPropagationPath(profile, geometry, endpoint, 120)
	if classification != nil || state != PropagationLOSState(PropagationNLOS) || endpointCase != PropagationEndpointCase(PropagationEndpointOutdoorO2O) || wallEvents == 0 {
		t.Fatalf("legacy classification changed = %q/%q/%d/%+v", state, endpointCase, wallEvents, classification)
	}
	result := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: 120, LOSState: state, EndpointCase: endpointCase,
		BuildingDataAvailable: true, WallEventCount: wallEvents,
	})
	if result.Terms.WallLossDB != PenetrationLossForFrequencyGHz(profile.FrequencyGHz)*float64(wallEvents) {
		t.Fatalf("legacy wall loss changed = %.3f with %d events", result.Terms.WallLossDB, wallEvents)
	}
	legacyContract := rfContractForProfile(&profile, 0)
	if legacyContract.UsesBuildingHeight || strings.Contains(legacyContract.LOSClassificationRule, HeightAwareLOSClassifierID) {
		t.Fatalf("legacy RF contract incorrectly advertises height-aware obstruction: %+v", legacyContract)
	}
	profile.PropagationModelID = UrbanShortRangePropagationID
	urbanContract := rfContractForProfile(&profile, 0)
	if !urbanContract.UsesBuildingHeight || !strings.Contains(urbanContract.LOSClassificationRule, HeightAwareLOSClassifierID) || urbanContract.BuildingHeightNote == "" {
		t.Fatalf("urban RF contract omitted height-aware obstruction: %+v", urbanContract)
	}
}

func TestHeightAwareClassifierIsSharedByRaySurfaceAndInterference(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	profile := heightAwareTestProfile()
	profile.RadiusMeters = 120
	profile.BeamWidthDeg = 360
	profile.HorizontalPatternID = "omni"
	building := heightFixtureBuilding("b-cleared", origin, 90, 80, 5, 5, HeightSourceExplicitLegacy)
	buildings := NewBuildingIndex([]*BuildingFootprint{building})
	endpoint := DestinationPoint(origin, 90, 120)
	geometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, buildings, propagationPathGeometryOptions{
		TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
	})
	if err != nil {
		t.Fatalf("build shared geometry: %v", err)
	}
	state, endpointCase, wallEvents, classification := classifyPropagationPath(profile, geometry, endpoint, 120)
	direct := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: 120, LOSState: state, EndpointCase: endpointCase,
		LOSClassification: classification, BuildingDataAvailable: true, WallEventCount: wallEvents,
	})
	if state != PropagationLOSState(PropagationLOS) || classification == nil || classification.ClassificationBasis != LOSClassificationKnownRoofsCleared {
		t.Fatalf("direct cleared-roof classification = %q/%+v", state, classification)
	}

	request := StaticSimulationRequest{
		TowerLon: origin.Lon, TowerLat: origin.Lat, Rays: 1, RadiusMeters: 120,
		FrequencyGHz: profile.FrequencyGHz, TxPowerDBm: profile.TxPowerDBm, AzimuthDeg: 90, BeamWidthDeg: 360, RFProfile: profile,
	}
	surface, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{Simulation: request, CellSizeMeters: 20, ThresholdsDBm: []float64{-100}}, buildings)
	if err != nil {
		t.Fatalf("surface: %v", err)
	}
	center := surface.Grid.Height / 2
	surfacePower := surface.Grid.Values[center*surface.Grid.Width+surface.Grid.Width-1]
	if math.Abs(surfacePower-roundOne(direct.ReceivedPowerDBm)) > 0.1 {
		t.Fatalf("surface power %.3f != direct %.3f", surfacePower, direct.ReceivedPowerDBm)
	}

	features, _ := simulateSegmentedRayInternal(origin, 0, 90, request, buildings, true)
	foundRay := false
	for _, feature := range features {
		if math.Abs(feature.Properties.SegmentEndM-120) < 0.1 {
			foundRay = true
			if feature.Properties.LOSState != PropagationLOS || feature.Properties.LOSClassifierID != HeightAwareLOSClassifierID || feature.Properties.LOSClassificationBasis != LOSClassificationKnownRoofsCleared {
				t.Fatalf("ray classification = %+v", feature.Properties)
			}
			if math.Abs(feature.Properties.SignalEndDBm-roundOne(direct.ReceivedPowerDBm)) > 0.1 {
				t.Fatalf("ray power %.3f != direct %.3f", feature.Properties.SignalEndDBm, direct.ReceivedPowerDBm)
			}
		}
	}
	if !foundRay {
		t.Fatal("ray did not retain the radius endpoint feature")
	}

	interferenceProfile := profile
	interferenceProfile.RadiusMeters = 140
	interferenceRequest := InterferenceRequest{
		NetworkTech: "5g", Towers: []InterferenceTowerRequest{{ID: "cell", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90, RFProfile: interferenceProfile}},
		RadiusMeters: 140, FrequencyGHz: profile.FrequencyGHz, TxPowerDBm: profile.TxPowerDBm, BeamWidthDeg: 360,
		BandwidthMHz: 100, LoadFactor: 0.7, ReuseFactor: 1, NoiseFigureDB: 7, SampleSpacingM: 40, RFProfile: interferenceProfile,
	}
	NormalizeInterferenceRequest(&interferenceRequest)
	preset, err := interferencePresetFor("5g", 100)
	if err != nil {
		t.Fatalf("interference preset: %v", err)
	}
	interference, err := evaluateInterferencePointContext(context.Background(), interferenceRequest, preset, buildings, endpoint)
	if err != nil || interference.RSRPDBm == nil {
		t.Fatalf("interference: %+v, err=%v", interference, err)
	}
	if interference.LOSState != PropagationLOS || interference.LOSClassifierID != HeightAwareLOSClassifierID || interference.LOSClassificationBasis != LOSClassificationKnownRoofsCleared {
		t.Fatalf("interference classification = %+v", interference)
	}
	expectedRSRP := direct.ReceivedPowerDBm - 10*math.Log10(12*float64(preset.resourceBlocks))
	if math.Abs(*interference.RSRPDBm-roundOne(expectedRSRP)) > 0.1 {
		t.Fatalf("interference power %.3f != direct conversion %.3f", *interference.RSRPDBm, expectedRSRP)
	}
}

func heightAwareTestProfile() CellRFProfile {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 120, 360, 100, 0.7, 1)
	profile.HorizontalPatternID = "omni"
	profile.PropagationModelID = UrbanShortRangePropagationID
	return profile
}

func heightFixtureBuilding(id string, origin Point, bearing, distance, halfSize, height float64, source string) *BuildingFootprint {
	center := DestinationPoint(origin, bearing, distance)
	latDelta := halfSize / 111_320.0
	lonDelta := halfSize / (111_320.0 * math.Cos(center.Lat*math.Pi/180))
	vertices := []Point{
		{Lon: center.Lon - lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat - latDelta},
		{Lon: center.Lon + lonDelta, Lat: center.Lat + latDelta},
		{Lon: center.Lon - lonDelta, Lat: center.Lat + latDelta},
	}
	bounds, _ := BoundsFromPoints(vertices)
	building := &BuildingFootprint{ID: id, Bounds: bounds, Vertices: vertices, HeightMeters: height, HeightSource: source}
	if source == HeightSourceExplicitLegacy {
		building.HeightEvidenceMeters = height
		building.HeightEvidenceSource = HeightEvidenceObservedTag
		building.HeightEvidenceTag = "height"
	}
	return building
}

func TestCanonicalAnkaraHeightAwareClassificationAuditWhenDatasetIsEnabled(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_HEIGHT_AUDIT") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_HEIGHT_AUDIT=1 to run the Ankara height-aware audit")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}
	audit := AuditBuildingHeightEvidence(pack.BuildingIndex)
	t.Logf("height_evidence_audit=%+v", audit)

	request := canonicalAnkaraNetworkOptimizationRequest()
	request.RFProfile = DefaultPlanningCellRFProfile("5g", request.FrequencyGHz, request.TxPowerDBm, request.RadiusMeters, request.BeamWidthDeg, 100, 0.7, 1)
	NormalizeNetworkOptimizationRequest(&request)
	transitions := make(map[string]int)
	representatives := make(map[string]string)
	pathCount := 0
	for _, tower := range request.Towers {
		origin := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		profile := tower.RFProfile
		for rayIndex := 0; rayIndex < request.Rays; rayIndex++ {
			angle := BeamAngleForIndex(profile.EffectiveAzimuth(tower.AzimuthDeg), profile.EffectiveBeamWidthDeg(), request.Rays, rayIndex)
			endpoint := DestinationPoint(origin, angle, profile.RadiusMeters)
			geometry, geometryErr := buildPropagationPathGeometryContextWithOptions(context.Background(), origin, endpoint, pack.BuildingIndex, propagationPathGeometryOptions{
				TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM,
			})
			if geometryErr != nil {
				t.Fatalf("build canonical geometry for %s ray %d: %v", tower.ID, rayIndex, geometryErr)
			}
			oldState, _, _ := geometry.classify2D(endpoint, profile.RadiusMeters)
			classification := geometry.classifyHeightAware(endpoint, profile.RadiusMeters)
			if classification.ClassifierID != HeightAwareLOSClassifierID || classification.TerrainStatus != TerrainStatusUnavailable {
				t.Fatalf("canonical classifier metadata for %s ray %d = %+v", tower.ID, rayIndex, classification)
			}
			pathCount++
			transition := fmt.Sprintf("%s_to_%s", oldState, classification.State)
			transitions[transition]++
			if _, exists := representatives[classification.ClassificationBasis]; !exists {
				representatives[classification.ClassificationBasis] = fmt.Sprintf("tower=%s ray=%d old=%s new=%s blocking=%d cleared=%d unknown=%d", tower.ID, rayIndex, oldState, classification.State, len(classification.BlockingBuildings), len(classification.ClearedBuildings), len(classification.UnknownHeightBuildings))
			}
		}
	}
	if pathCount == 0 {
		t.Fatal("canonical height-aware audit evaluated no paths")
	}
	t.Logf("height_aware_transitions=%v paths=%d representatives=%v", transitions, pathCount, representatives)

	optimizationStarted := time.Now()
	optimization, err := OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical optimization after height-aware classification: %v", err)
	}
	optimizationElapsed := time.Since(optimizationStarted)
	t.Logf("height_aware_optimization_elapsed=%s", optimizationElapsed.Round(time.Millisecond))
	if optimization.Baseline != nil {
		baseline := optimization.Baseline.Stats.RawMetrics
		optimized := optimization.Stats.RawMetrics
		t.Logf("height_aware_optimization baseline={network_score=%.1f composite=%.6f demand_buildings=%d residential=%d reach=%.4f overlap_buildings=%d overlap=%.6f score=%.4f served_demand=%.4f} optimized={network_score=%.1f composite=%.6f demand_buildings=%d residential=%d reach=%.4f overlap_buildings=%d overlap=%.6f score=%.4f served_demand=%.4f} azimuths=%v",
			optimization.Baseline.Stats.NetworkScore, optimization.Baseline.Stats.CompositeScore, optimization.Baseline.Stats.UniqueDemandBuildings, optimization.Baseline.Stats.UniqueResidentialBuildings, baseline.PropagationReachScore, optimization.Baseline.Stats.OverlapBuildings, baseline.OverlapRatio, optimization.Baseline.Stats.Score, baseline.ServedDemandWeight,
			optimization.Stats.NetworkScore, optimization.Stats.CompositeScore, optimization.Stats.UniqueDemandBuildings, optimization.Stats.UniqueResidentialBuildings, optimized.PropagationReachScore, optimization.Stats.OverlapBuildings, optimized.OverlapRatio, optimization.Stats.Score, optimized.ServedDemandWeight, optimization.OptimizedTowers)
	}
}
