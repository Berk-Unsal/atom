package raytracer

import (
	"context"
	"fmt"
	"path/filepath"
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
}

func TestMeasurementBiasCalibrationUsesHoldout(t *testing.T) {
	origin := Point{Lon: 32.85, Lat: 39.92}
	samples := make([]MeasurementSample, 20)
	for index := range samples {
		point := DestinationPoint(origin, 90, 20+float64(index))
		samples[index] = MeasurementSample{
			ID:         fmt.Sprintf("sample-%02d", index),
			Lon:        point.Lon,
			Lat:        point.Lat,
			Technology: "5g",
			RSRPDBm:    -80,
		}
	}
	response, err := EvaluateMeasurementsContext(context.Background(), MeasurementEvaluationRequest{
		Radio: InterferenceRequest{
			NetworkTech:    "5g",
			Towers:         []InterferenceTowerRequest{{ID: "cell-1", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90}},
			RadiusMeters:   400,
			FrequencyGHz:   28,
			TxPowerDBm:     30,
			BeamWidthDeg:   120,
			BandwidthMHz:   100,
			LoadFactor:     1,
			ReuseFactor:    1,
			NoiseFigureDB:  7,
			SampleSpacingM: 40,
		},
		Samples: samples,
	}, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("evaluate measurements: %v", err)
	}
	if !response.Calibration.Eligible {
		t.Fatalf("calibration not eligible: %s", response.Calibration.Reason)
	}
	if response.Calibration.TrainingSampleCount != 16 || response.Calibration.HoldoutSampleCount != 4 {
		t.Fatalf("split = %d/%d, want 16/4", response.Calibration.TrainingSampleCount, response.Calibration.HoldoutSampleCount)
	}
	if response.Calibration.HoldoutMAEAfterDB == nil || response.Calibration.HoldoutMAEBeforeDB == nil {
		t.Fatal("holdout metrics are nil")
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

func TestLoadPortableDatasetPackFixture(t *testing.T) {
	pack, err := LoadDatasetPack(filepath.Join("testdata", "sample-pack"))
	if err != nil {
		t.Fatalf("load sample dataset pack: %v", err)
	}
	if pack.Manifest.ID != "sample-portability-pack" || len(pack.Towers) != 2 || pack.BuildingIndex.Len() != 1 {
		t.Fatalf("unexpected sample pack: id=%s towers=%d buildings=%d", pack.Manifest.ID, len(pack.Towers), pack.BuildingIndex.Len())
	}
}
