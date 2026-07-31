package raytracer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecommendSitesReturnsDeterministicCandidate(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	buildings := testDemandBuildingAt(t, "candidate-demand", DestinationPoint(origin, 90, 100), 3)
	req := SiteRecommendationRequest{
		NetworkTech: "5g",
		Network: NetworkOptimizationRequest{
			Towers: []NetworkTowerRequest{
				{ID: "1", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 270},
				{ID: "2", TowerLon: origin.Lon - 0.001, TowerLat: origin.Lat, AzimuthDeg: 270},
			},
			Rays:         12,
			RadiusMeters: 250,
			FrequencyGHz: 28,
			TxPowerDBm:   30,
			BeamWidthDeg: 90,
		},
		SearchPolygon: []Point{
			{Lon: 32.84, Lat: 39.91},
			{Lon: 32.86, Lat: 39.91},
			{Lon: 32.86, Lat: 39.93},
			{Lon: 32.84, Lat: 39.93},
		},
		MaxResults: 5,
	}
	inventory := []TowerStation{{ID: "LTE-3", CellID: 3, Lon: 32.851, Lat: 39.92}}
	first, err := RecommendSitesContext(context.Background(), req, inventory, buildings)
	if err != nil {
		t.Fatalf("recommend sites: %v", err)
	}
	second, err := RecommendSitesContext(context.Background(), req, inventory, buildings)
	if err != nil {
		t.Fatalf("recommend sites second run: %v", err)
	}
	if len(first.Recommendations) != 1 || len(second.Recommendations) != 1 {
		t.Fatalf("recommendation counts = %d and %d, want 1", len(first.Recommendations), len(second.Recommendations))
	}
	if first.Recommendations[0] != second.Recommendations[0] {
		t.Fatalf("recommendations differ: %#v vs %#v", first.Recommendations[0], second.Recommendations[0])
	}
	if len(first.GeoJSON.Features) != 1 || first.GeoJSON.Features[0].ID != first.Recommendations[0].ID {
		t.Fatalf("GeoJSON feature does not reference the canonical recommendation: %#v", first.GeoJSON.Features)
	}
	payload, marshalErr := json.Marshal(first)
	if marshalErr != nil {
		t.Fatalf("marshal recommendation response: %v", marshalErr)
	}
	if count := bytes.Count(payload, []byte(`"marginal_network_score"`)); count != 1 {
		t.Fatalf("marginal_network_score appears %d times in response, want canonical occurrence only", count)
	}
	if count := bytes.Count(payload, []byte(first.Recommendations[0].Reason)); count != 1 {
		t.Fatalf("recommendation reason appears %d times in response, want canonical occurrence only", count)
	}
}

func TestRecommendationValidationEnforcesSimulationFeatureBudget(t *testing.T) {
	req := SiteRecommendationRequest{
		NetworkTech: "5g",
		Network: NetworkOptimizationRequest{
			Towers: []NetworkTowerRequest{
				{ID: "one", TowerLon: 32.85, TowerLat: 39.92},
				{ID: "two", TowerLon: 32.86, TowerLat: 39.93},
			},
			Rays: 720, RadiusMeters: 5000,
			FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
		},
		SearchPolygon: []Point{
			{Lon: 32.84, Lat: 39.91},
			{Lon: 32.87, Lat: 39.91},
			{Lon: 32.85, Lat: 39.94},
		},
		MaxResults: 5,
	}
	if validationError := ValidateSiteRecommendationRequest(req); !strings.Contains(validationError, "25000-feature") {
		t.Fatalf("validation error = %q", validationError)
	}
}

func TestRecommendationValidationEnforcesPerCellSimulationFeatureBudget(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 5000, 120, 100, 0.7, 1)
	req := SiteRecommendationRequest{
		NetworkTech: "5g",
		Network: NetworkOptimizationRequest{
			Towers: []NetworkTowerRequest{
				{ID: "one", TowerLon: 32.85, TowerLat: 39.92, RFProfile: profile},
				{ID: "two", TowerLon: 32.86, TowerLat: 39.93, RFProfile: DefaultCellRFProfile("5g", 28, 30, 25, 120, 100, 0.7, 1)},
			},
			Rays: 720, RadiusMeters: 25, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
		},
		SearchPolygon: []Point{{Lon: 32.84, Lat: 39.91}, {Lon: 32.87, Lat: 39.91}, {Lon: 32.85, Lat: 39.94}},
		MaxResults:    5,
	}
	if validationError := ValidateSiteRecommendationRequest(req); !strings.Contains(validationError, `tower "one"`) || !strings.Contains(validationError, "25000-feature") {
		t.Fatalf("validation error = %q", validationError)
	}
}

func TestRecommendationValidationBoundsSearchPolygonComplexity(t *testing.T) {
	req := SiteRecommendationRequest{
		NetworkTech: "5g",
		Network: NetworkOptimizationRequest{
			Towers: []NetworkTowerRequest{
				{ID: "one", TowerLon: 32.85, TowerLat: 39.92},
				{ID: "two", TowerLon: 32.86, TowerLat: 39.93},
			},
			Rays: 12, RadiusMeters: 250,
			FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
		},
		SearchPolygon: make([]Point, MaxSearchPolygonCoordinates+1),
		MaxResults:    5,
	}
	if validationError := ValidateSiteRecommendationRequest(req); !strings.Contains(validationError, "no more than 256") {
		t.Fatalf("validation error = %q", validationError)
	}
}

func TestMeasurementBiasCalibrationUsesHoldout(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	radio := InterferenceRequest{
		NetworkTech:  "5g",
		Towers:       []InterferenceTowerRequest{{ID: "cell-1", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90}},
		RadiusMeters: 400, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
		BandwidthMHz: 100, LoadFactor: 1, ReuseFactor: 1, NoiseFigureDB: 7, SampleSpacingM: 40,
	}
	preset, err := interferencePresetFor("5g", 100)
	if err != nil {
		t.Fatalf("preset: %v", err)
	}
	samples := make([]MeasurementSample, 20)
	for index := range samples {
		cluster := index / 4
		point := DestinationPoint(origin, 90, 40+float64(cluster)*60+float64(index%4))
		prediction := evaluateInterferencePoint(radio, preset, EmptyBuildingIndex(), point)
		if prediction.RSRPDBm == nil {
			t.Fatalf("sample %d has no predicted signal", index)
		}
		samples[index] = MeasurementSample{
			ID:         fmt.Sprintf("sample-%02d", index),
			Lon:        point.Lon,
			Lat:        point.Lat,
			Technology: "5g",
			RSRPDBm:    *prediction.RSRPDBm + 6,
		}
	}
	response, err := EvaluateMeasurementsContext(context.Background(), MeasurementEvaluationRequest{Radio: radio, Samples: samples}, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("evaluate measurements: %v", err)
	}
	if !response.Calibration.Eligible {
		t.Fatalf("calibration not eligible: %s", response.Calibration.Reason)
	}
	if response.Calibration.TrainingSampleCount != 16 || response.Calibration.HoldoutSampleCount != 20 || response.Calibration.FoldCount != 5 {
		t.Fatalf("spatial CV split = training %d/validation %d/folds %d, want 16/20/5", response.Calibration.TrainingSampleCount, response.Calibration.HoldoutSampleCount, response.Calibration.FoldCount)
	}
	if response.Calibration.HoldoutMAEAfterDB == nil || response.Calibration.HoldoutMAEBeforeDB == nil {
		t.Fatal("holdout metrics are nil")
	}
}

func TestMeasurementCalibrationRejectsInsufficientSpatialDiversity(t *testing.T) {
	residuals := make([]measurementResidual, 20)
	for index := range residuals {
		residuals[index] = measurementResidual{sampleID: fmt.Sprintf("sample-%d", index), cellID: "1", lon: 32.85 + float64(index)*0.000001, lat: 39.92, residual: 4}
	}
	calibration := buildBiasCalibration(residuals, 0)
	if calibration.Eligible || calibration.SpatialDiversitySufficient {
		t.Fatal("calibration should reject samples from one small area")
	}
	if !strings.Contains(calibration.Reason, "Insufficient spatial diversity") {
		t.Fatalf("reason = %q", calibration.Reason)
	}
}

func TestMeasurementCalibrationRequiresTwentyValidSamples(t *testing.T) {
	calibration := buildBiasCalibration([]measurementResidual{{cellID: "1", residual: 4}}, 0)
	if calibration.Eligible {
		t.Fatal("calibration should not be eligible with one sample")
	}
}

func TestMeasurementStatsSeparateNoSignalAndCellMismatch(t *testing.T) {
	stats := measurementStats([]measurementResidual{{cellID: "1", residual: 2}}, 3, 1, 1)
	if stats.ValidSampleCount != 1 || stats.NoSignalCount != 1 || stats.CellMismatchCount != 1 {
		t.Fatalf("measurement counts = valid %d, no signal %d, mismatch %d", stats.ValidSampleCount, stats.NoSignalCount, stats.CellMismatchCount)
	}
}

func TestDatasetManifestRejectsUnsupportedCRS(t *testing.T) {
	err := validateDatasetManifest(DatasetManifest{
		SchemaVersion: 1,
		ID:            "test",
		Name:          "Test",
		Version:       "1",
		CRS:           "EPSG:3857",
		Bounds:        []float64{0, 0, 1, 1},
		Files:         DatasetFiles{Towers: "towers.geojson", Buildings: "buildings.geojson"},
	})
	if err == nil {
		t.Fatal("unsupported CRS should fail validation")
	}
}

func TestDatasetFilePathRejectsSymlinkEscape(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "dataset")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatalf("create dataset root: %v", err)
	}
	outside := filepath.Join(parent, "outside.geojson")
	if err := os.WriteFile(outside, []byte(`{}`), 0o600); err != nil {
		t.Fatalf("write outside fixture: %v", err)
	}
	link := filepath.Join(root, "buildings.geojson")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := datasetFilePath(root, "buildings.geojson"); err == nil || !strings.Contains(err.Error(), "inside") {
		t.Fatalf("error = %v, want symlink escape rejection", err)
	}
}

func TestReadFileWithLimitRejectsOversizedManifest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "manifest.json")
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}
	if err := file.Truncate(MaxDatasetManifestBytes + 1); err != nil {
		file.Close()
		t.Fatalf("truncate fixture: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close fixture: %v", err)
	}
	if _, err := readFileWithLimit(path, MaxDatasetManifestBytes, "dataset manifest"); err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("error = %v, want size rejection", err)
	}
}

func TestLoadPortableDatasetPackFixture(t *testing.T) {
	pack, err := LoadDatasetPack(filepath.Join("testdata", "sample-pack"))
	if err != nil {
		t.Fatalf("load sample dataset pack: %v", err)
	}
	if pack.Manifest.ID != "sample-portability-pack" || len(pack.Towers) != 2 || pack.BuildingIndex.Len() != 1 {
		t.Fatalf("unexpected sample pack: id=%s towers=%d buildings=%d", pack.Manifest.ID, len(pack.Towers), pack.BuildingIndex.Len())
	}
}

func TestLoadDatasetPackSchemaV2ValidatesOptionalLayers(t *testing.T) {
	root := t.TempDir()
	fixture := filepath.Join("testdata", "sample-pack")
	for _, name := range []string{"towers.geojson", "buildings.geojson"} {
		contents, err := os.ReadFile(filepath.Join(fixture, name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if err := os.WriteFile(filepath.Join(root, name), contents, 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	terrainName := "terrain.tif"
	writeTestGeoTIFF(t, filepath.Join(root, terrainName))
	hashes := make(map[string]string)
	for _, name := range []string{"towers.geojson", "buildings.geojson", terrainName} {
		hash, err := fileSHA256(filepath.Join(root, name))
		if err != nil {
			t.Fatalf("hash %s: %v", name, err)
		}
		hashes[name] = hash
	}
	manifest := DatasetManifest{
		SchemaVersion: 2,
		ID:            "v2-pack",
		Name:          "V2 Pack",
		Version:       "2.0.0",
		CRS:           "EPSG:4326",
		Bounds:        []float64{32.84, 39.91, 32.86, 39.93},
		GeneratedAt:   "2026-07-31T00:00:00Z",
		Sources:       []string{"Synthetic"},
		Licenses:      []string{"MIT"},
		Confidence:    "Test only",
		Files:         DatasetFiles{Towers: "towers.geojson", Buildings: "buildings.geojson", Terrain: terrainName},
		SHA256:        hashes,
		Layers: map[string]DatasetLayer{
			"towers":    {Kind: "cell_inventory", Format: "geojson", CRS: "EPSG:4326"},
			"buildings": {Kind: "building_footprints", Format: "geojson", CRS: "EPSG:4326"},
			"terrain":   {Kind: "terrain_elevation", Format: "geotiff", CRS: "EPSG:4326", Units: "m", Optional: true},
		},
		Quality: &DatasetQualityReport{Summary: "Validated synthetic fixture"},
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("encode manifest: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "manifest.json"), manifestBytes, 0o600); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	pack, err := LoadDatasetPack(root)
	if err != nil {
		t.Fatalf("load v2 pack: %v", err)
	}
	if pack.Manifest.SchemaVersion != 2 || filepath.Base(pack.LayerPaths["terrain"]) != terrainName {
		t.Fatalf("optional v2 layer not exposed: %+v", pack.LayerPaths)
	}
}

func TestDatasetManifestV2RequiresMetadataForEveryFile(t *testing.T) {
	manifest := DatasetManifest{
		SchemaVersion: 2,
		ID:            "test", Name: "Test", Version: "2", CRS: "EPSG:4326",
		Bounds: []float64{0, 0, 1, 1}, GeneratedAt: "2026-07-31", Sources: []string{"x"}, Licenses: []string{"x"}, Confidence: "x",
		Files:   DatasetFiles{Towers: "towers.geojson", Buildings: "buildings.geojson"},
		SHA256:  map[string]string{"towers.geojson": strings.Repeat("a", 64), "buildings.geojson": strings.Repeat("b", 64)},
		Layers:  map[string]DatasetLayer{"towers": {Kind: "cell_inventory", Format: "geojson", CRS: "EPSG:4326"}},
		Quality: &DatasetQualityReport{Summary: "x"},
	}
	if err := validateDatasetManifest(manifest); err == nil || !strings.Contains(err.Error(), "metadata") {
		t.Fatalf("error = %v, want missing layer metadata", err)
	}
}
