package raytracer

import (
	"math"
	"testing"
)

type flatTestTerrain struct{ elevation float64 }

func (terrain flatTestTerrain) Elevation(Point) (float64, bool) { return terrain.elevation, true }
func (terrain flatTestTerrain) Metadata() TerrainMetadata {
	return TerrainMetadata{Available: true, Source: "synthetic", Format: "test", CRS: "EPSG:4326"}
}

func TestAnalyzePathProfileClassifiesBuildingAndExposesLossBudget(t *testing.T) {
	profile := DefaultCellRFProfile("4g", 2.6, 40, 1000, 120, 20, 0.7, 1)
	profile.AntennaHeightM = 12
	profile.ReceiverHeightM = 1.5
	building := &BuildingFootprint{
		ID: "screen", HeightMeters: 25, HeightSource: "height", Material: "brick",
		Bounds:   Bounds{MinLon: 0.00043, MinLat: -0.0001, MaxLon: 0.00057, MaxLat: 0.0001},
		Vertices: []Point{{Lon: 0.00043, Lat: -0.0001}, {Lon: 0.00057, Lat: -0.0001}, {Lon: 0.00057, Lat: 0.0001}, {Lon: 0.00043, Lat: 0.0001}},
	}
	request := PathProfileRequest{
		Transmitter: Point{Lon: 0, Lat: 0}, Receiver: Point{Lon: 0.001, Lat: 0},
		SampleSpacingM: 5, ModelProfile: "terrain-profile", RFProfile: profile,
		Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete", ShadowSigmaDB: 6},
	}
	response, err := AnalyzePathProfileContext(t.Context(), request, flatTestTerrain{elevation: 100}, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatalf("analyze profile: %v", err)
	}
	if response.Classification != "building-obstructed" || response.DominantObstruction == nil || response.DominantObstruction.BuildingID != "screen" {
		t.Fatalf("classification = %q, obstruction = %+v", response.Classification, response.DominantObstruction)
	}
	if response.LossBudget.RxDBmP90Reliability >= response.LossBudget.RxDBmP50 {
		t.Fatalf("uncertainty bounds = %+v", response.LossBudget)
	}
	diffraction := lossComponent(response.LossBudget.Components, "diffraction")
	if !diffraction.Enabled || diffraction.LossDB <= 0 {
		t.Fatalf("diffraction component = %+v", diffraction)
	}
	if len(response.Samples) < 20 || !response.Terrain.Available {
		t.Fatalf("profile samples/terrain = %d, %+v", len(response.Samples), response.Terrain)
	}
}

func TestPathProfileApplicabilityIsFrequencySpecific(t *testing.T) {
	terrain := PathModelApplicability("terrain-profile", 28)
	shortRange := PathModelApplicability("urban-short-range", 28)
	if terrain.FrequencyApplicable || !shortRange.FrequencyApplicable {
		t.Fatalf("terrain=%+v short-range=%+v", terrain, shortRange)
	}
	if loss := KnifeEdgeLossDB(10, 100, 100, 2.6); math.IsNaN(loss) || loss <= 0 {
		t.Fatalf("knife edge loss = %v", loss)
	}
}

func TestBuildingHeightUsesTagsAndExplicitFallback(t *testing.T) {
	height, source := buildingHeight(feature{Properties: map[string]any{"height": "40 ft"}})
	if math.Abs(height-12.192) > 0.001 || source != "height" {
		t.Fatalf("height = %v, source = %q", height, source)
	}
	height, source = buildingHeight(feature{Properties: map[string]any{"building:levels": 4.0}})
	if height != 12 || source != "building:levels" {
		t.Fatalf("level height = %v, source = %q", height, source)
	}
	height, source = buildingHeight(feature{})
	if height != defaultBuildingHeightMeters || source != "default-3-storey" {
		t.Fatalf("fallback height = %v, source = %q", height, source)
	}
}

func lossComponent(components []LossComponent, id string) LossComponent {
	for _, component := range components {
		if component.ID == id {
			return component
		}
	}
	return LossComponent{}
}
