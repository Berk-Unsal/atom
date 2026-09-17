package raytracer

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

func TestCanonicalAnkaraDiffractionDiagnosticAvailabilityAudit(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_DIFFRACTION_AUDIT") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_DIFFRACTION_AUDIT=1 to run the Ankara diffraction audit")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}
	request := canonicalAnkaraNetworkOptimizationRequest()
	request.RFProfile = DefaultPlanningCellRFProfile("5g", request.FrequencyGHz, request.TxPowerDBm, request.RadiusMeters, request.BeamWidthDeg, 100, 0.7, 1)
	NormalizeNetworkOptimizationRequest(&request)

	counts := map[string]int{
		"paths": 0, "diagnostic_eligible": 0, "unknown_height_ineligible": 0,
		"one_known_candidate_edge": 0, "multiple_known_candidate_edges": 0,
		"geometric_los": 0, "blocked_only_by_unknown_height": 0,
	}
	representatives := make(map[string]string)
	ledgerRepresentatives := make(map[string]any)
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
				t.Fatalf("build geometry for %s ray %d: %v", tower.ID, rayIndex, geometryErr)
			}
			distance := ApproxDistanceMeters(origin, endpoint)
			pathRequest := PathProfileRequest{
				Transmitter: origin, Receiver: endpoint, SampleSpacingM: 10, ModelProfile: "urban-short-range", AzimuthDeg: angle,
				RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
			}
			diagnostic := buildDiffractionDiagnostic(pathRequest, "urban-short-range", nil, TerrainMetadata{Available: false, Status: TerrainStatusUnavailable}, pack.BuildingIndex, geometry, nil, profile.AntennaHeightM, profile.ReceiverHeightM, distance, angle)
			classification := geometry.classifyHeightAware(endpoint, distance)
			knownEdges, unknownEdges := 0, 0
			for _, candidate := range diagnostic.Geometry.Candidates {
				if candidate.ObstructionType != "building_roof_edge" {
					continue
				}
				if candidate.HeightAvailable {
					knownEdges++
				} else {
					unknownEdges++
				}
			}
			counts["paths"]++
			if diagnostic.Available {
				counts["diagnostic_eligible"]++
			}
			if diagnostic.Reason == DiffractionUnavailableHeight {
				counts["unknown_height_ineligible"]++
			}
			switch {
			case knownEdges == 1:
				counts["one_known_candidate_edge"]++
			case knownEdges > 1:
				counts["multiple_known_candidate_edges"]++
			}
			if classification.State == PropagationLOSState(PropagationLOS) {
				counts["geometric_los"]++
			}
			if unknownEdges > 0 && len(classification.BlockingBuildings) == 0 {
				counts["blocked_only_by_unknown_height"]++
			}
			for _, key := range []string{"diagnostic_eligible", "unknown_height_ineligible", "one_known_candidate_edge", "multiple_known_candidate_edges", "geometric_los", "blocked_only_by_unknown_height"} {
				if _, ok := representatives[key]; !ok && ((key == "diagnostic_eligible" && diagnostic.Available) || (key == "unknown_height_ineligible" && diagnostic.Reason == DiffractionUnavailableHeight) || (key == "one_known_candidate_edge" && knownEdges == 1) || (key == "multiple_known_candidate_edges" && knownEdges > 1) || (key == "geometric_los" && classification.State == PropagationLOSState(PropagationLOS)) || (key == "blocked_only_by_unknown_height" && unknownEdges > 0 && len(classification.BlockingBuildings) == 0)) {
					representatives[key] = fmt.Sprintf("tower=%s ray=%d basis=%s known_edges=%d unknown_edges=%d candidates=%d", tower.ID, rayIndex, classification.ClassificationBasis, knownEdges, unknownEdges, len(diagnostic.Geometry.Candidates))
					if key == "diagnostic_eligible" || key == "unknown_height_ineligible" {
						ledgerRepresentatives[key] = map[string]any{
							"tower": tower.ID, "ray": rayIndex, "transmitter": origin, "receiver": endpoint,
							"classification": classification.State, "classification_basis": classification.ClassificationBasis,
							"diagnostic_reason": diagnostic.Reason, "candidates": diagnostic.Geometry.Candidates,
						}
					}
				}
			}
		}
	}
	if counts["paths"] == 0 {
		t.Fatal("canonical diffraction audit evaluated no paths")
	}
	t.Logf("diffraction_height_audit=%+v", AuditBuildingHeightEvidence(pack.BuildingIndex))
	t.Logf("diffraction_availability=%v representatives=%v", counts, representatives)
	if encoded, encodeErr := json.Marshal(ledgerRepresentatives); encodeErr == nil {
		t.Logf("diffraction_representative_ledgers=%s", encoded)
	}
}
