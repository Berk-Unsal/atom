package raytracer

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"
)

// TestCanonicalAnkaraAntennaPatternComparison is an opt-in evidence run. It
// keeps the compatibility pattern and the reference element pattern under the
// same Ankara geometry, propagation settings, and objective configuration so
// the reference pattern cannot become a silent default.
func TestCanonicalAnkaraAntennaPatternComparison(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_ANTENNA_COMPARISON") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_ANTENNA_COMPARISON=1 to compare canonical antenna patterns")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}

	for _, test := range []struct {
		name  string
		model string
	}{
		{name: "legacy-compatibility", model: LegacyPropagationModelID},
		{name: "urban-planning", model: UrbanShortRangePropagationID},
	} {
		for _, patternID := range []string{AntennaPatternIdealSectorID, AntennaPattern3GPPSingleElementID} {
			t.Run(test.name+"/"+patternID, func(t *testing.T) {
				request := canonicalAnkaraNetworkOptimizationRequest()
				profile := DefaultCellRFProfile("5g", request.FrequencyGHz, request.TxPowerDBm, request.RadiusMeters, request.BeamWidthDeg, 100, 0.7, 1)
				profile.PropagationModelID = test.model
				profile.HorizontalPatternID = patternID
				request.RFProfile = profile
				NormalizeNetworkOptimizationRequest(&request)

				started := time.Now()
				optimization, optimizeErr := OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
				if optimizeErr != nil {
					t.Fatalf("canonical %s optimization: %v", patternID, optimizeErr)
				}
				optimizationElapsed := time.Since(started)

				firstTower := request.Towers[0]
				staticRequest := StaticSimulationRequest{
					TowerLon: firstTower.TowerLon, TowerLat: firstTower.TowerLat,
					Rays: request.Rays, RadiusMeters: request.RadiusMeters, FrequencyGHz: request.FrequencyGHz,
					TxPowerDBm: request.TxPowerDBm, AzimuthDeg: firstTower.AzimuthDeg, BeamWidthDeg: request.BeamWidthDeg,
					RFProfile: firstTower.RFProfile,
				}
				surface, surfaceErr := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
					Simulation: staticRequest, CellSizeMeters: 40, ThresholdsDBm: []float64{-100},
				}, pack.BuildingIndex)
				if surfaceErr != nil {
					t.Fatalf("canonical %s surface: %v", patternID, surfaceErr)
				}

				interference := canonicalAntennaComparisonInterferenceRequest(request)
				interferenceResult, interferenceErr := AnalyzeInterferenceContext(context.Background(), interference, pack.BuildingIndex)
				if interferenceErr != nil {
					t.Fatalf("canonical %s interference: %v", patternID, interferenceErr)
				}
				entry, entryErr := AnalyzeBuildingEntryContext(context.Background(), BuildingEntryAnalysisRequest{Network: request}, pack.BuildingIndex)
				if entryErr != nil {
					t.Fatalf("canonical %s building entry: %v", patternID, entryErr)
				}

				record := map[string]any{
					"propagation_model":      test.model,
					"horizontal_pattern_id":  patternID,
					"optimization_elapsed_s": optimizationElapsed.Seconds(),
					"optimization":           canonicalAntennaOptimizationRecord(optimization),
					"surface": map[string]any{
						"valid_cell_count":             surface.Stats.ValidCellCount,
						"below_sensitivity_cell_count": surface.Stats.BelowSensitivityCellCount,
						"minimum_dbm":                  surface.Stats.MinimumDBm,
						"maximum_dbm":                  surface.Stats.MaximumDBm,
						"center_value_dbm":             surface.Grid.Values[(surface.Grid.Height/2)*surface.Grid.Width+surface.Grid.Width/2],
					},
					"interference": map[string]any{
						"signal_samples":      interferenceResult.Stats.SignalSamples,
						"serviceable_samples": interferenceResult.Stats.ServiceableSamples,
						"serviceable_pct":     interferenceResult.Stats.ServiceablePct,
						"avg_rsrp_dbm":        interferenceResult.Stats.AvgRSRPDBm,
						"p10_rsrp_dbm":        interferenceResult.Stats.P10RSRPDBm,
						"avg_sinr_db":         interferenceResult.Stats.AvgSINRDB,
						"p10_sinr_db":         interferenceResult.Stats.P10SINRDB,
					},
					"building_entry": map[string]any{
						"relevant_buildings":              entry.Summary.RelevantBuildings,
						"outdoor_serviceable_buildings":   entry.Summary.OutdoorServiceableBuildings,
						"low_loss_serviceable_buildings":  entry.Summary.LowLossServiceableBuildings,
						"high_loss_serviceable_buildings": entry.Summary.HighLossServiceableBuildings,
						"candidate_cell_link_evaluations": entry.Summary.CandidateCellLinkEvaluations,
						"unsupported_buildings":           entry.Summary.UnsupportedBuildings,
						"elapsed_ms":                      entry.Diagnostics.ElapsedMilliseconds,
					},
				}
				encoded, encodeErr := json.Marshal(record)
				if encodeErr != nil {
					t.Fatalf("encode canonical %s comparison: %v", patternID, encodeErr)
				}
				t.Logf("canonical_antenna_comparison=%s", encoded)
			})
		}
	}
}

func canonicalAntennaComparisonInterferenceRequest(request NetworkOptimizationRequest) InterferenceRequest {
	towers := make([]InterferenceTowerRequest, 0, len(request.Towers))
	for _, tower := range request.Towers {
		towers = append(towers, InterferenceTowerRequest{
			ID: tower.ID, TowerLon: tower.TowerLon, TowerLat: tower.TowerLat, AzimuthDeg: tower.AzimuthDeg, RFProfile: tower.RFProfile,
		})
	}
	return InterferenceRequest{
		NetworkTech: "5g", Towers: towers, RadiusMeters: request.RadiusMeters, FrequencyGHz: request.FrequencyGHz,
		TxPowerDBm: request.TxPowerDBm, BeamWidthDeg: request.BeamWidthDeg, BandwidthMHz: 100,
		LoadFactor: 0.7, ReuseFactor: 1, NoiseFigureDB: 7, SampleSpacingM: 40, RFProfile: request.RFProfile,
	}
}

func canonicalAntennaOptimizationRecord(result NetworkOptimizationResponse) map[string]any {
	record := map[string]any{
		"pareto_frontier_size": len(result.ParetoFrontier),
		"recommended_azimuths": result.OptimizedTowers,
		"optimized":            result.Stats.RawMetrics,
	}
	if result.Baseline != nil {
		record["baseline"] = result.Baseline.Stats.RawMetrics
	}
	return record
}
