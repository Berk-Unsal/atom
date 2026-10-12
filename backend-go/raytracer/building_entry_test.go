package raytracer

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func TestBuildingEntryLossUsesTR38901ReferenceProfiles(t *testing.T) {
	tests := []struct {
		name      string
		frequency float64
		profile   string
		want      float64
	}{
		{name: "2.6 low compatibility", frequency: 2.6, profile: BuildingEntryLowLossProfile, want: 20},
		{name: "2.6 high compatibility", frequency: 2.6, profile: BuildingEntryHighLossProfile, want: 20},
		{name: "28 low loss", frequency: 28, profile: BuildingEntryLowLossProfile, want: 17.828787452687028},
		{name: "28 high loss", frequency: 28, profile: BuildingEntryHighLossProfile, want: 35.029019597240406},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := BuildingEntryLossDB(test.frequency, test.profile)
			if !ok {
				t.Fatal("building-entry profile unexpectedly unsupported")
			}
			if math.Abs(got-test.want) > 1e-12 {
				t.Fatalf("loss = %.15f, want %.15f", got, test.want)
			}
		})
	}
	if _, ok := BuildingEntryLossDB(140, BuildingEntryLowLossProfile); ok {
		t.Fatal("140 GHz must remain outside the Concept 4E loss scope")
	}
}

func TestBuildingEntryMetadataDeclaresDeterministicZeroDepthScenarios(t *testing.T) {
	metadata := BuildingEntryModelInfo(28)
	if metadata.ID != BuildingEntryModelID || metadata.Reference != BuildingEntryModelReference {
		t.Fatalf("unexpected model metadata: %+v", metadata)
	}
	if metadata.IndoorDepthM != 0 || metadata.RandomDrawsUsed || !metadata.MaterialEvidenceOnly || !metadata.NoWholeBuildingClaim {
		t.Fatalf("metadata violates Concept 4E semantics: %+v", metadata)
	}
	if len(metadata.Profiles) != 2 || metadata.Profiles[0].IndoorDepthM != 0 || metadata.Profiles[1].IndoorDepthM != 0 {
		t.Fatalf("profile metadata does not preserve zero indoor depth: %+v", metadata.Profiles)
	}
	if metadata.Profiles[0].ReferenceShadowSigmaDB != 4.4 || metadata.Profiles[1].ReferenceShadowSigmaDB != 6.5 {
		t.Fatalf("28 GHz standard reference sigmas were not retained: %+v", metadata.Profiles)
	}
}

func TestBuildingEntryOutdoorNLOSDoesNotAddEntryLoss(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 360, 100, 0.7, 1)
	base := PropagationLinkContext{
		Profile:               profile,
		GroundDistanceM:       100,
		HorizontalOffsetDeg:   0,
		CalibrationOffsetDB:   0,
		LOSState:              PropagationLOSState(PropagationNLOS),
		EndpointCase:          PropagationEndpointOutdoorO2O,
		BuildingDataAvailable: true,
	}
	withoutWallEvents := EvaluatePropagationLink(base)
	withWallEvents := base
	withWallEvents.WallEventCount = 4
	withWallEventsResult := EvaluatePropagationLink(withWallEvents)
	if withoutWallEvents.AppliedModelID != UrbanShortRangePropagationID || withWallEventsResult.AppliedModelID != UrbanShortRangePropagationID {
		t.Fatalf("unexpected models: %q and %q", withoutWallEvents.AppliedModelID, withWallEventsResult.AppliedModelID)
	}
	if withoutWallEvents.Terms.WallLossDB != 0 || withWallEventsResult.Terms.WallLossDB != 0 {
		t.Fatalf("urban NLOS unexpectedly has wall loss: %.3f %.3f", withoutWallEvents.Terms.WallLossDB, withWallEventsResult.Terms.WallLossDB)
	}
	if withoutWallEvents.TotalPathLossDB != withWallEventsResult.TotalPathLossDB {
		t.Fatalf("wall events changed the urban NLOS result: %.12f vs %.12f", withoutWallEvents.TotalPathLossDB, withWallEventsResult.TotalPathLossDB)
	}
}

func TestBuildingEntryFacadeGeometryRejectsTangentAndFindsConcaveInterior(t *testing.T) {
	tangentPolygon := []Point{{Lon: 0, Lat: 0}, {Lon: 0.001, Lat: 0}, {Lon: 0.001, Lat: 0.001}, {Lon: 0, Lat: 0.001}}
	if point, distance, ok := facadeEntryPoint(Point{Lon: -0.001, Lat: -0.001}, Point{Lon: 0, Lat: 0}, tangentPolygon); ok || point != (Point{}) || distance != 0 {
		t.Fatalf("tangent/corner path should not become a facade entry: point=%+v distance=%.3f ok=%v", point, distance, ok)
	}
	concave := &BuildingFootprint{
		ID:     "concave",
		Bounds: Bounds{MinLon: 0, MinLat: 0, MaxLon: 0.004, MaxLat: 0.004},
		Vertices: []Point{
			{Lon: 0, Lat: 0}, {Lon: 0.004, Lat: 0}, {Lon: 0.004, Lat: 0.001},
			{Lon: 0.001, Lat: 0.001}, {Lon: 0.001, Lat: 0.003}, {Lon: 0.004, Lat: 0.003},
			{Lon: 0.004, Lat: 0.004}, {Lon: 0, Lat: 0.004},
		},
	}
	point, source, ok := representativeBuildingPoint(concave)
	if !ok || !PointInPolygon(point, concave.Vertices) || source == "polygon_centroid" {
		t.Fatalf("concave representative point = %+v source=%q ok=%v", point, source, ok)
	}
}

func TestBuildingEntryGeometryFixturesCoverRectangleMultipartAndInvalid(t *testing.T) {
	rectangle := &BuildingFootprint{
		ID:     "rectangle",
		Bounds: Bounds{MinLon: 0, MinLat: 0, MaxLon: 0.002, MaxLat: 0.002},
		Vertices: []Point{
			{Lon: 0, Lat: 0}, {Lon: 0.002, Lat: 0}, {Lon: 0.002, Lat: 0.002}, {Lon: 0, Lat: 0.002},
		},
	}
	point, source, ok := representativeBuildingPoint(rectangle)
	if !ok || source != "polygon_centroid" || !PointInPolygon(point, rectangle.Vertices) {
		t.Fatalf("rectangle representative = %+v source=%q ok=%v", point, source, ok)
	}
	invalid := &BuildingFootprint{ID: "invalid", Vertices: []Point{{Lon: 0, Lat: 0}, {Lon: 0.001, Lat: 0}}}
	if point, source, ok := representativeBuildingPoint(invalid); ok || source != "invalid" || point != (Point{}) {
		t.Fatalf("invalid geometry produced a representative: %+v source=%q ok=%v", point, source, ok)
	}

	path := filepath.Join(t.TempDir(), "multipart.geojson")
	fixture := map[string]any{
		"type": "FeatureCollection",
		"features": []any{
			map[string]any{
				"type": "Feature", "id": "rectangle", "properties": map[string]any{},
				"geometry": map[string]any{"type": "Polygon", "coordinates": [][][]float64{{{0, 0}, {0.002, 0}, {0.002, 0.002}, {0, 0.002}, {0, 0}}}},
			},
			map[string]any{
				"type": "Feature", "id": "multipart", "properties": map[string]any{},
				"geometry": map[string]any{"type": "MultiPolygon", "coordinates": [][][][]float64{
					{{{0.003, 0}, {0.004, 0}, {0.004, 0.001}, {0.003, 0.001}, {0.003, 0}}},
					{{{0.005, 0}, {0.006, 0}, {0.006, 0.001}, {0.005, 0.001}, {0.005, 0}}},
				}},
			},
			map[string]any{
				"type": "Feature", "id": "invalid", "properties": map[string]any{},
				"geometry": map[string]any{"type": "Polygon", "coordinates": [][][]float64{}},
			},
		},
	}
	contents, err := json.Marshal(fixture)
	if err != nil {
		t.Fatalf("marshal geometry fixture: %v", err)
	}
	if err := os.WriteFile(path, contents, 0o600); err != nil {
		t.Fatalf("write geometry fixture: %v", err)
	}
	index, stats, err := LoadBuildingIndexFromGeoJSON(path)
	if err != nil {
		t.Fatalf("load geometry fixture: %v", err)
	}
	if index.Len() != 3 || stats.FootprintCount != 3 {
		t.Fatalf("multipart index = %d footprints / stats=%d, want 3 / 3", index.Len(), stats.FootprintCount)
	}
	ids := make([]string, 0, len(index.Footprints()))
	for _, building := range index.Footprints() {
		ids = append(ids, building.ID)
	}
	joined := strings.Join(ids, ",")
	if !strings.Contains(joined, "multipart-0") || !strings.Contains(joined, "multipart-1") || strings.Contains(joined, "invalid") {
		t.Fatalf("multipart/invalid fixture IDs = %s", joined)
	}
}

func TestBuildingEntryAnalysisReturnsBothProfilesForUnknownMaterial(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 360, 100, 0.7, 1)
	building := &BuildingFootprint{
		ID:                "b-unknown",
		Tags:              map[string]string{"building": "apartments"},
		DemandWeight:      4,
		ResidentialDemand: 1,
		Bounds:            Bounds{MinLon: 0.0008, MinLat: -0.0002, MaxLon: 0.0012, MaxLat: 0.0002},
		Vertices:          []Point{{Lon: 0.0008, Lat: -0.0002}, {Lon: 0.0012, Lat: -0.0002}, {Lon: 0.0012, Lat: 0.0002}, {Lon: 0.0008, Lat: 0.0002}},
	}
	request := BuildingEntryAnalysisRequest{
		Network: NetworkOptimizationRequest{
			Towers:       []NetworkTowerRequest{{ID: "cell-a", TowerLon: 0, TowerLat: 0, AzimuthDeg: 90, RFProfile: profile}},
			RadiusMeters: 400, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 360,
			CalibrationOffsetDB: 0, RFProfile: profile,
		},
		BuildingIDs: []string{"b-unknown"},
	}
	response, err := AnalyzeBuildingEntryContext(context.Background(), request, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatalf("analyze building entry: %v", err)
	}
	if !response.Applicability.Applicable || len(response.Results) != 1 {
		t.Fatalf("unexpected response applicability/results: %+v", response)
	}
	result := response.Results[0]
	if result.MaterialEvidence.Available || result.MaterialEvidence.Source != "unavailable" || result.SelectedEntryProfile != BuildingEntryUnknownProfile {
		t.Fatalf("unknown material was not represented honestly: %+v", result.MaterialEvidence)
	}
	if result.LowLossEntryLossDB == nil || result.HighLossEntryLossDB == nil || result.LowLossRxJustInsideDBm == nil || result.HighLossRxJustInsideDBm == nil {
		t.Fatalf("both scenario estimates must be present: %+v", result)
	}
	if result.EntryGeometry.IndoorDepthM != 0 || result.OutdoorWallLossDB != 0 {
		t.Fatalf("entry semantics are not facade/zero-depth: %+v", result.EntryGeometry)
	}
	if response.Diagnostics.HTTPRequestsRequired != 1 {
		t.Fatalf("analysis is not represented as one batched request: %+v", response.Diagnostics)
	}
}

func TestBuildingEntryAnalysisKeeps140GHzStructuredUnsupported(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("6g", 140, 30, 400, 360, 100, 0.7, 1)
	request := BuildingEntryAnalysisRequest{Network: NetworkOptimizationRequest{
		Towers:       []NetworkTowerRequest{{ID: "cell-a", TowerLon: 0, TowerLat: 0, RFProfile: profile}},
		RadiusMeters: 400, FrequencyGHz: 140, TxPowerDBm: 30, BeamWidthDeg: 360, RFProfile: profile,
	}}
	if validationError := ValidateBuildingEntryAnalysisRequest(request); validationError != "" {
		t.Fatalf("140 GHz should reach structured applicability handling: %s", validationError)
	}
	response, err := AnalyzeBuildingEntryContext(context.Background(), request, NewBuildingIndex([]*BuildingFootprint{{
		ID: "b", Bounds: Bounds{MinLon: 0, MinLat: 0, MaxLon: 0.001, MaxLat: 0.001}, Vertices: []Point{{Lon: 0, Lat: 0}, {Lon: 0.001, Lat: 0}, {Lon: 0.001, Lat: 0.001}, {Lon: 0, Lat: 0.001}},
	}}))
	if err != nil {
		t.Fatalf("140 GHz should be a structured unsupported result: %v", err)
	}
	if response.Applicability.Applicable || response.Applicability.Reason != "unsupported_frequency" || len(response.Results) != 0 {
		t.Fatalf("unexpected 140 GHz response: %+v", response)
	}
}

func TestCanonicalAnkaraBuildingEntryAnalysisIsDeterministicWhenDatasetIsEnabled(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_BUILDING_ENTRY") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_BUILDING_ENTRY=1 to run the Ankara building-entry audit")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}
	fixture := canonicalAnkaraNetworkOptimizationRequest()
	request := BuildingEntryAnalysisRequest{Network: fixture}
	first, err := AnalyzeBuildingEntryContext(context.Background(), request, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("first building-entry analysis: %v", err)
	}
	second, err := AnalyzeBuildingEntryContext(context.Background(), request, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("second building-entry analysis: %v", err)
	}
	if !reflect.DeepEqual(first.Summary, second.Summary) || !reflect.DeepEqual(first.Results, second.Results) || !reflect.DeepEqual(first.CellSummaries, second.CellSummaries) {
		t.Fatal("canonical building-entry analysis was not deterministic")
	}
	t.Logf("canonical building-entry summary: relevant=%d residential=%d outdoor=%d low=%d high=%d demand=%.3f/%.3f material=%d known/%d unknown unsupported=%d invalid=%d links=%d elapsed_ms=%.1f",
		first.Summary.RelevantBuildings, first.Summary.RelevantResidentialBuildings, first.Summary.OutdoorServiceableBuildings,
		first.Summary.LowLossServiceableBuildings, first.Summary.HighLossServiceableBuildings,
		first.Summary.LowLossServedDemandWeight, first.Summary.HighLossServedDemandWeight,
		first.Summary.MaterialKnownBuildings, first.Summary.MaterialUnknownBuildings,
		first.Summary.UnsupportedBuildings, first.Summary.InvalidGeometryBuildings,
		first.Summary.CandidateCellLinkEvaluations, first.Diagnostics.ElapsedMilliseconds)
	type reasonRecord struct {
		count          int
		representative string
	}
	unsupportedReasons := make(map[string]reasonRecord)
	for _, result := range first.Results {
		if result.Applicability.Applicable || result.Applicability.Reason == "invalid_geometry" {
			continue
		}
		record := unsupportedReasons[result.Applicability.Reason]
		record.count++
		if record.representative == "" {
			record.representative = result.BuildingID
		}
		unsupportedReasons[result.Applicability.Reason] = record
	}
	unsupportedReasonTotal := 0
	unsupportedReasonNames := make([]string, 0, len(unsupportedReasons))
	for reason, record := range unsupportedReasons {
		unsupportedReasonTotal += record.count
		unsupportedReasonNames = append(unsupportedReasonNames, reason)
	}
	if unsupportedReasonTotal != first.Summary.UnsupportedBuildings {
		t.Fatalf("unsupported reason total=%d, summary=%d", unsupportedReasonTotal, first.Summary.UnsupportedBuildings)
	}
	sort.Strings(unsupportedReasonNames)
	for _, reason := range unsupportedReasonNames {
		record := unsupportedReasons[reason]
		t.Logf("unsupported reason: reason=%s count=%d percentage=%.2f representative=%s", reason, record.count, float64(record.count)/float64(first.Summary.UnsupportedBuildings)*100, record.representative)
	}
	labels := map[string]BuildingEntryEstimate{}
	var strongest *BuildingEntryEstimate
	var borderline *BuildingEntryEstimate
	borderlineDistance := math.Inf(1)
	for _, result := range first.Results {
		if result.OutdoorRxAtFacadeDBm != nil && (strongest == nil || *result.OutdoorRxAtFacadeDBm > derefFloat(strongest.OutdoorRxAtFacadeDBm)) {
			copy := result
			strongest = &copy
		}
		if result.ReceiverSensitivityDBm != nil {
			for _, value := range []*float64{result.LowLossRxJustInsideDBm, result.HighLossRxJustInsideDBm} {
				if value == nil {
					continue
				}
				distance := math.Abs(*value - *result.ReceiverSensitivityDBm)
				if distance < borderlineDistance {
					copy := result
					borderline = &copy
					borderlineDistance = distance
				}
			}
		}
		if _, exists := labels["C low-loss passes high-loss fails"]; !exists && result.LowLossServiceable != nil && *result.LowLossServiceable && result.HighLossServiceable != nil && !*result.HighLossServiceable {
			labels["C low-loss passes high-loss fails"] = result
		}
		if _, exists := labels["D both fail"]; !exists && result.LowLossServiceable != nil && !*result.LowLossServiceable && result.HighLossServiceable != nil && !*result.HighLossServiceable {
			labels["D both fail"] = result
		}
		if _, exists := labels["E known material"]; !exists && result.MaterialEvidence.Available {
			labels["E known material"] = result
		}
		if _, exists := labels["F unknown material"]; !exists && !result.MaterialEvidence.Available {
			labels["F unknown material"] = result
		}
	}
	if strongest != nil {
		labels["A strong facade signal"] = *strongest
	}
	if borderline != nil {
		labels["B borderline entry service"] = *borderline
	}
	for label, result := range labels {
		t.Logf("%s: building=%s cell=%s facade=%v outdoor=%.3f low_loss=%.3f low_rx=%.3f low_service=%v high_loss=%.3f high_rx=%.3f high_service=%v material=%s/%s",
			label, result.BuildingID, result.ServingCellID, result.FacadeEntryPoint, derefFloat(result.OutdoorRxAtFacadeDBm), derefFloat(result.LowLossEntryLossDB), derefFloat(result.LowLossRxJustInsideDBm), derefBool(result.LowLossServiceable), derefFloat(result.HighLossEntryLossDB), derefFloat(result.HighLossRxJustInsideDBm), derefBool(result.HighLossServiceable), result.MaterialEvidence.Source, result.MaterialEvidence.Value)
	}
	if result, exists := labels["C low-loss passes high-loss fails"]; exists {
		t.Logf("borderline ledger: building_id=%s serving_cell=%s facade_lon=%.12f facade_lat=%.12f outdoor_rx_dbm=%.3f low_entry_loss_db=%.3f low_rx_dbm=%.3f high_entry_loss_db=%.3f high_rx_dbm=%.3f receiver_threshold_dbm=%.3f material_source=%s material_tag=%s material_value=%s material_normalized=%s model=%s applicable=%t applicability_reason=%s applicability_detail=%s indoor_depth_m=%.1f outdoor_wall_loss_db=%.1f outdoor_los=%s",
			result.BuildingID, result.ServingCellID, result.FacadeEntryPoint.Lon, result.FacadeEntryPoint.Lat,
			derefFloat(result.OutdoorRxAtFacadeDBm), derefFloat(result.LowLossEntryLossDB), derefFloat(result.LowLossRxJustInsideDBm),
			derefFloat(result.HighLossEntryLossDB), derefFloat(result.HighLossRxJustInsideDBm), derefFloat(result.ReceiverSensitivityDBm),
			result.MaterialEvidence.Source, result.MaterialEvidence.Tag, result.MaterialEvidence.Value, result.MaterialEvidence.Normalized,
			result.PropagationModel, result.Applicability.Applicable, result.Applicability.Reason, result.Applicability.Detail,
			result.EntryGeometry.IndoorDepthM, result.OutdoorWallLossDB, result.OutdoorLOSState)
	} else {
		t.Log("borderline ledger: no low-loss-serviceable/high-loss-not-serviceable building exists in canonical scenario")
	}
}

func derefFloat(value *float64) float64 {
	if value == nil {
		return math.NaN()
	}
	return *value
}

func derefBool(value *bool) bool {
	return value != nil && *value
}
