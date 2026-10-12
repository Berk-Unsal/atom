package main

import (
	"testing"
	"time"

	"ankara-5g-raytracer/raytracer"
)

func TestExperimentManagerRunsMatrixAndReusesFingerprintCache(t *testing.T) {
	manager := newExperimentManager("test-model", 1, 2)
	definition := testExperimentDefinition()
	definition.Matrix.TxPowersDBm = []float64{30, 35}
	definition.Matrix.AzimuthsDeg = []float64{0, 90}
	pack := &raytracer.DatasetPack{
		Manifest:      raytracer.DatasetManifest{ID: "test-pack", Version: "1", SHA256: map[string]string{"buildings.geojson": "abc"}},
		BuildingIndex: raytracer.EmptyBuildingIndex(),
	}
	started, err := manager.Start(definition, pack)
	if err != nil {
		t.Fatalf("start experiment: %v", err)
	}
	deadline := time.Now().Add(3 * time.Second)
	var completed experimentJobSnapshot
	for time.Now().Before(deadline) {
		completed, _ = manager.Snapshot(started.JobID)
		if completed.Status == "succeeded" || completed.Status == "failed" {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if completed.Status != "succeeded" || completed.Result == nil || len(completed.Result.Runs) != 4 {
		t.Fatalf("completed job = %+v", completed)
	}
	if completed.Progress != 1 || completed.CompletedRuns != 4 {
		t.Fatalf("progress = %+v", completed)
	}
	cached, err := manager.Start(definition, pack)
	if err != nil {
		t.Fatalf("start cached experiment: %v", err)
	}
	if !cached.CacheHit || cached.Status != "succeeded" || cached.Fingerprint != completed.Fingerprint {
		t.Fatalf("cached job = %+v", cached)
	}
}

func TestExperimentMatrixIsBoundedAndParetoIsExplained(t *testing.T) {
	definition := testExperimentDefinition()
	definition.Matrix.FrequenciesGHz = []float64{2.6, 3.5, 28, 39, 60}
	definition.Matrix.TxPowersDBm = []float64{10, 20, 30, 40}
	definition.Matrix.AzimuthsDeg = []float64{0, 90, 180, 270}
	if _, err := expandExperiment(definition); err == nil {
		t.Fatal("matrix larger than 64 runs was accepted")
	}
	results := []experimentRunResult{
		{AvgRxDBm: -80, GapPct: 10, BlockedPct: 20},
		{AvgRxDBm: -75, GapPct: 9, BlockedPct: 19},
		{AvgRxDBm: -70, GapPct: 20, BlockedPct: 10},
	}
	markExperimentPareto(results)
	if results[0].NonDominated || !results[1].NonDominated || !results[2].NonDominated {
		t.Fatalf("Pareto flags = %+v", results)
	}
	if results[1].Explanation == "" || results[0].Explanation == "" {
		t.Fatal("Pareto explanations are missing")
	}
}

func testExperimentDefinition() experimentDefinition {
	lon, lat := 32.85, 39.92
	rays, radius := 8, 25.0
	frequency, power, beamWidth, azimuth := 2.6, 30.0, 120.0, 0.0
	return experimentDefinition{
		Name: "test sweep",
		Base: raytracer.StaticSimulationRequestInput{
			TowerLon: &lon, TowerLat: &lat, Rays: &rays, RadiusMeters: &radius,
			FrequencyGHz: &frequency, TxPowerDBm: &power, BeamWidthDeg: &beamWidth, AzimuthDeg: &azimuth,
		},
	}
}
