package raytracer

import (
	"math"
	"testing"
)

func TestConcept4I1ResearchProfileBaselineAndInvariance(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("6g", 140, 30, 400, 360, 1000, 0.7, 1)
	profile.HorizontalPatternID = "omni"
	profile.VerticalPatternID = "flat"

	type geometryCase struct {
		ID             string
		LOSState       PropagationLOSState
		WallEventCount int
	}
	cases := []geometryCase{
		{ID: "clear_los", LOSState: PropagationLOSState(PropagationLOS)},
		{ID: "footprint_nlos", LOSState: PropagationLOSState(PropagationNLOS), WallEventCount: 1},
		{ID: "one_boundary_crossing", LOSState: PropagationLOSState(PropagationNLOS), WallEventCount: 1},
		{ID: "two_boundary_crossings", LOSState: PropagationLOSState(PropagationNLOS), WallEventCount: 2},
		{ID: "known_height_blocker", LOSState: PropagationLOSState(PropagationNLOS), WallEventCount: 1},
		{ID: "unknown_height_blocker", LOSState: PropagationLOSState(PropagationLOSUnknown), WallEventCount: 1},
	}
	distances := []float64{10, 25, 50, 100, 200, 400}
	wantSlant := []float64{25.5391855782, 34.3110769286, 55.2471718733, 102.7241451656, 201.3758923009, 400.6897178616}
	wantFSPL := []float64{103.5167015913, 106.0812477047, 110.2187617376, 115.6060114316, 121.4527102696, 127.4287246756}
	wantRxByWallEvent := map[int][]float64{
		0: {-48.5167015913, -51.0812477047, -55.2187617376, -60.6060114316, -66.4527102696, -72.4287246756},
		1: {-128.5167015913, -131.0812477047, -135.2187617376, -140.6060114316, -146.4527102696, -152.4287246756},
		2: {-208.5167015913, -211.0812477047, -215.2187617376, -220.6060114316, -226.4527102696, -232.4287246756},
	}
	for _, geometry := range cases {
		for _, distance := range distances {
			result := EvaluatePropagationLink(PropagationLinkContext{
				Profile: profile, GroundDistanceM: distance,
				LOSState: geometry.LOSState, EndpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O),
				BuildingDataAvailable: true, WallEventCount: geometry.WallEventCount,
			})
			index := indexOfFloat64(distances, distance)
			if !result.Applicable || result.FallbackUsed || result.ModelID != ResearchSubTHzPropagationID || result.AppliedModelID != ResearchSubTHzPropagationID {
				t.Fatalf("%s at %.0fm changed model dispatch: %+v", geometry.ID, distance, result)
			}
			if result.ApplicabilityReason != RFReferenceReasonResearchProfileOnly {
				t.Fatalf("%s at %.0fm applicability reason = %q", geometry.ID, distance, result.ApplicabilityReason)
			}
			if math.Abs(result.SlantDistanceM-wantSlant[index]) > 1e-9 || math.Abs(result.Terms.FreeSpacePathLossDB-wantFSPL[index]) > 1e-9 {
				t.Fatalf("%s at %.0fm baseline terms changed: slant=%.12f fspl=%.12f", geometry.ID, distance, result.SlantDistanceM, result.Terms.FreeSpacePathLossDB)
			}
			wantWall := float64(geometry.WallEventCount) * 80
			if math.Abs(result.Terms.WallLossDB-wantWall) > 1e-9 || math.Abs(result.TotalPathLossDB-(wantFSPL[index]+wantWall)) > 1e-9 || math.Abs(result.ReceivedPowerDBm-wantRxByWallEvent[geometry.WallEventCount][index]) > 1e-9 {
				t.Fatalf("%s at %.0fm baseline loss changed: %+v", geometry.ID, distance, result.Terms)
			}
			if result.ReceiverThreshold.SensitivityDBm != DefaultReceiverSensitivityDBm {
				t.Fatalf("%s at %.0fm receiver threshold changed: %+v", geometry.ID, distance, result.ReceiverThreshold)
			}
		}
	}

	for _, geometry := range cases[1:] {
		if geometry.WallEventCount != 1 {
			continue
		}
		base := EvaluatePropagationLink(PropagationLinkContext{
			Profile: profile, GroundDistanceM: 100, LOSState: geometry.LOSState,
			EndpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O), BuildingDataAvailable: true,
			WallEventCount: geometry.WallEventCount,
		})
		if math.Abs(base.Terms.TotalPathLossDB-195.6060114316) > 1e-9 {
			t.Fatalf("%s did not retain the one-event 140 GHz result: %+v", geometry.ID, base.Terms)
		}
	}
}

func indexOfFloat64(values []float64, target float64) int {
	for index, value := range values {
		if value == target {
			return index
		}
	}
	return -1
}
