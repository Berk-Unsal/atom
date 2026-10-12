package raytracer

import (
	"context"
	"fmt"
	"math"
	"testing"
)

func TestControlledRoofDiffractionFixtures(t *testing.T) {
	tests := []struct {
		name             string
		centerM          float64
		halfSizeM        float64
		buildingHeightM  float64
		txHeightM        float64
		rxHeightM        float64
		heightSource     string
		wantAvailable    bool
		wantCandidateNum int
	}{
		{name: "roof-clearly-below-los", centerM: 50, halfSizeM: 5, buildingHeightM: 5, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "roof-touches-los", centerM: 50, halfSizeM: 5, buildingHeightM: 10, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "roof-one-metre-above-los", centerM: 50, halfSizeM: 5, buildingHeightM: 11, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "roof-five-metres-above-los", centerM: 50, halfSizeM: 5, buildingHeightM: 15, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "near-tx-obstruction", centerM: 15, halfSizeM: 4, buildingHeightM: 15, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "near-rx-obstruction", centerM: 85, halfSizeM: 4, buildingHeightM: 15, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "midpoint-obstruction", centerM: 50, halfSizeM: 3, buildingHeightM: 15, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "wide-flat-roof", centerM: 50, halfSizeM: 20, buildingHeightM: 11, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "two-roof-edges", centerM: 50, halfSizeM: 10, buildingHeightM: 12, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceExplicitLegacy, wantAvailable: true, wantCandidateNum: 2},
		{name: "unknown-roof-height", centerM: 50, halfSizeM: 5, buildingHeightM: defaultBuildingHeightMeters, txHeightM: 10, rxHeightM: 10, heightSource: HeightSourceFallbackLegacy, wantAvailable: false, wantCandidateNum: 2},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			origin := Point{Lon: 32.85, Lat: 39.92}
			endpoint := DestinationPoint(origin, 90, 100)
			profile := DefaultCellRFProfile("5g", 28, 30, 400, 360, 100, 0.7, 1)
			profile.AntennaHeightM = test.txHeightM
			profile.ReceiverHeightM = test.rxHeightM
			building := diffractionFixtureBuilding("fixture-roof", origin, test.centerM, test.halfSizeM, test.buildingHeightM, test.heightSource)
			response, err := AnalyzePathProfileContext(context.Background(), PathProfileRequest{
				Transmitter: origin, Receiver: endpoint, SampleSpacingM: 2, ModelProfile: "urban-short-range", AzimuthDeg: 90,
				RFProfile: profile, Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
			}, flatTestTerrain{elevation: 0}, NewBuildingIndex([]*BuildingFootprint{building}))
			if err != nil {
				t.Fatalf("controlled profile: %v", err)
			}
			diagnostic := response.DiffractionDiagnostic
			if diagnostic.Available != test.wantAvailable || len(diagnostic.Geometry.Candidates) != test.wantCandidateNum {
				t.Fatalf("availability/candidates = %t/%d, want %t/%d; diagnostic=%+v", diagnostic.Available, len(diagnostic.Geometry.Candidates), test.wantAvailable, test.wantCandidateNum, diagnostic)
			}
			if test.heightSource == HeightSourceFallbackLegacy && diagnostic.Reason != DiffractionUnavailableHeight {
				t.Fatalf("unknown-height reason = %q", diagnostic.Reason)
			}
			for _, candidate := range diagnostic.Geometry.Candidates {
				if candidate.HeightAvailable {
					if candidate.RelativeHeightAboveLOSM == nil || candidate.V == nil || candidate.DiffractionLossDB == nil {
						t.Fatalf("known fixture omitted edge values: %+v", candidate)
					}
					expectedV := independentControlledV(*candidate.RelativeHeightAboveLOSM, candidate.D1M, candidate.D2M, profile.FrequencyGHz)
					expectedLoss := independentReferenceKnifeEdge(*candidate.RelativeHeightAboveLOSM, candidate.D1M, candidate.D2M, profile.FrequencyGHz)
					// The public ledger rounds d1/d2/h/v/loss for readability, so
					// the independently reconstructed value is checked within that
					// serialization precision.
					if math.Abs(*candidate.V-expectedV) > 0.03 || math.Abs(*candidate.DiffractionLossDB-expectedLoss) > 0.05 {
						t.Fatalf("independent edge mismatch = v %.6f/%.6f loss %.6f/%.6f", *candidate.V, expectedV, *candidate.DiffractionLossDB, expectedLoss)
					}
				} else if candidate.V != nil || candidate.DiffractionLossDB != nil {
					t.Fatalf("unknown fixture produced diffraction values: %+v", candidate)
				}
			}
			selectedV, selectedLoss := "none", "none"
			if diagnostic.SelectedEdge != nil {
				selectedV = formatControlledFloat(diagnostic.SelectedEdge.V)
				selectedLoss = formatControlledFloat(diagnostic.SelectedEdge.DiffractionLossDB)
			}
			t.Logf("controlled_fixture=%s geometry=center=%.1fm half_width=%.1fm tx=%.1fm rx=%.1fm height=%.1fm source=%s candidates=%d selected_v=%s selected_loss_db=%s available=%t", test.name, test.centerM, test.halfSizeM, test.txHeightM, test.rxHeightM, test.buildingHeightM, test.heightSource, len(diagnostic.Geometry.Candidates), selectedV, selectedLoss, diagnostic.Available)
		})
	}
}

func independentControlledV(heightAboveLOS, d1, d2, frequencyGHz float64) float64 {
	wavelength := 0.299792458 / frequencyGHz
	return heightAboveLOS * math.Sqrt(2*(d1+d2)/(wavelength*d1*d2))
}

func formatControlledFloat(value *float64) string {
	if value == nil {
		return "none"
	}
	return fmt.Sprintf("%.4f", *value)
}
