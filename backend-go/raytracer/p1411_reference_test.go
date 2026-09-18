package raytracer

import (
	"context"
	"math"
	"testing"
)

func p1411TestRequest(frequencyGHz, distanceM float64, morphology, rooftop, los string) P1411ReferenceRequest {
	return P1411ReferenceRequest{
		FrequencyGHz: frequencyGHz,
		Transmitter:  SubTHZReferencePoint{Location: Point{Lon: 0, Lat: 0}, HeightM: 10},
		Receiver:     SubTHZReferencePoint{Location: Point{Lon: 0, Lat: distanceM / 111320}, HeightM: 10},
		Morphology:   morphology, RooftopRelation: rooftop, LOSState: los,
		Provenance: P1411ReferenceProvenance{
			FrequencyGHz: P1411ProvenanceUserDeclared, DistanceM: P1411ProvenanceGeometryDerived,
			TxHeightM: P1411ProvenanceUserDeclared, RxHeightM: P1411ProvenanceUserDeclared,
			Morphology: P1411ProvenanceUserDeclared, RooftopRelation: P1411ProvenanceUserDeclared, LOSState: P1411ProvenanceUserDeclared,
		},
	}
}

func p1411IndependentMedian(alpha, beta, gamma, distanceM, frequencyGHz float64) float64 {
	return 10*alpha*math.Log10(distanceM) + beta + 10*gamma*math.Log10(frequencyGHz)
}

func p1411IndependentFSPL(distanceM, frequencyGHz float64) float64 {
	const speedOfLightMPerSecond = 299792458.0
	wavelengthM := speedOfLightMPerSecond / (frequencyGHz * 1e9)
	return 20 * math.Log10(4*math.Pi*distanceM/wavelengthM)
}

func TestP1411Table4CandidatesAt140GHzUseIndependentMedianFixtures(t *testing.T) {
	tests := []struct {
		name       string
		modelID    string
		morphology string
		los        string
		distanceM  float64
		alpha      float64
		beta       float64
		gamma      float64
		wantSigma  float64
	}{
		{"los_25m", "p1411_below_rooftop_los_v1", P1411MorphologyUrbanHighRise, P1411LOSStateLOS, 25, 2.07, 31.23, 2.06, 4.91},
		{"highrise_nlos_100m", "p1411_urban_highrise_nlos_v1", P1411MorphologyUrbanHighRise, P1411LOSStateNLOS, 100, 3.73, 16.02, 2.26, 7.62},
		{"lowrise_nlos_100m", "p1411_urban_lowrise_nlos_v1", P1411MorphologyUrbanLowRise, P1411LOSStateNLOS, 100, 4.52, 6.04, 2.14, 8.02},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := p1411TestRequest(140, test.distanceM, test.morphology, P1411RooftopBothBelow, test.los)
			request.CandidateModelID = test.modelID
			response, err := EvaluateP1411ReferenceContext(context.Background(), request, EmptyBuildingIndex())
			if err != nil {
				t.Fatal(err)
			}
			if len(response.Candidates) != 1 || len(response.ApplicableCandidates) != 1 || response.ApplicableCandidates[0] != test.modelID {
				t.Fatalf("candidate selection = %+v applicable=%v", response.Candidates, response.ApplicableCandidates)
			}
			candidate := response.Candidates[0]
			if !candidate.Applicability.Applicable || candidate.Model.MedianPathLossDB == nil {
				t.Fatalf("candidate applicability = %+v model=%+v", candidate.Applicability, candidate.Model)
			}
			want := p1411IndependentMedian(test.alpha, test.beta, test.gamma, test.distanceM, 140)
			if math.Abs(*candidate.Model.MedianPathLossDB-want) > 1e-12 {
				t.Fatalf("median = %.12f, want %.12f", *candidate.Model.MedianPathLossDB, want)
			}
			if candidate.Uncertainty.SigmaDB != test.wantSigma || candidate.Uncertainty.RandomSampling || candidate.Model.RandomFadingIncluded {
				t.Fatalf("statistical metadata = %+v model=%+v", candidate.Uncertainty, candidate.Model)
			}
			if candidate.Model.WallLossDB != 0 || candidate.P525Comparison.IncludedInP1411Median {
				t.Fatalf("unexpected additive terms: model=%+v p525=%+v", candidate.Model, candidate.P525Comparison)
			}
		})
	}
}

func TestP1411Effective140GHzDistanceEnvelopesAreStrict(t *testing.T) {
	tests := []struct {
		name       string
		modelID    string
		morphology string
		los        string
		insideM    float64
		outsideM   float64
		wantMaxM   float64
	}{
		{"los", "p1411_below_rooftop_los_v1", P1411MorphologySuburban, P1411LOSStateLOS, 500, 501, 500},
		{"highrise_nlos", "p1411_urban_highrise_nlos_v1", P1411MorphologyUrbanHighRise, P1411LOSStateNLOS, 150, 151, 150},
		{"lowrise_nlos", "p1411_urban_lowrise_nlos_v1", P1411MorphologySuburban, P1411LOSStateNLOS, 150, 151, 150},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			inside := p1411TestRequest(140, test.insideM, test.morphology, P1411RooftopBothBelow, test.los)
			inside.CandidateModelID = test.modelID
			insideResponse, err := EvaluateP1411ReferenceContext(context.Background(), inside, EmptyBuildingIndex())
			if err != nil || len(insideResponse.ApplicableCandidates) != 1 {
				t.Fatalf("inside %.0fm err=%v applicable=%v", test.insideM, err, insideResponse.ApplicableCandidates)
			}
			if insideResponse.Candidates[0].Applicability.EffectiveDistanceRangeM == nil || insideResponse.Candidates[0].Applicability.EffectiveDistanceRangeM[1] != test.wantMaxM {
				t.Fatalf("effective envelope = %+v", insideResponse.Candidates[0].Applicability.EffectiveDistanceRangeM)
			}
			outside := p1411TestRequest(140, test.outsideM, test.morphology, P1411RooftopBothBelow, test.los)
			outside.CandidateModelID = test.modelID
			outsideResponse, err := EvaluateP1411ReferenceContext(context.Background(), outside, EmptyBuildingIndex())
			if err != nil {
				t.Fatal(err)
			}
			candidate := outsideResponse.Candidates[0]
			if candidate.Applicability.Applicable || candidate.Model.MedianPathLossDB != nil || !containsString(candidate.Applicability.Reasons, "distance_out_of_range") {
				t.Fatalf("outside envelope was extrapolated: %+v", candidate)
			}
		})
	}
}

func TestP1411ApplicabilityRequiresExplicitScenarioEvidence(t *testing.T) {
	request := p1411TestRequest(140, 100, P1411MorphologyUnknown, P1411RooftopUnknown, P1411LOSStateUnknown)
	request.Provenance.Morphology = P1411ProvenanceUnknown
	request.Provenance.RooftopRelation = P1411ProvenanceUnknown
	request.Provenance.LOSState = P1411ProvenanceUnknown
	response, err := EvaluateP1411ReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if len(response.ApplicableCandidates) != 0 {
		t.Fatalf("unknown scenario unexpectedly applicable: %v", response.ApplicableCandidates)
	}
	for _, candidate := range response.Candidates {
		if candidate.Model.MedianPathLossDB != nil || !containsString(candidate.Applicability.Reasons, "morphology_unknown") || !containsString(candidate.Applicability.Reasons, "rooftop_relation_unknown") || !containsString(candidate.Applicability.Reasons, "los_state_unknown") || !containsString(candidate.Applicability.Reasons, "insufficient_scene_evidence") {
			t.Fatalf("candidate did not expose strict gates: %+v", candidate)
		}
	}

	request = p1411TestRequest(140, 100, P1411MorphologyUrbanHighRise, P1411RooftopOneAbove, P1411LOSStateLOS)
	response, err = EvaluateP1411ReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if response.Candidates[0].Applicability.Applicable || !containsString(response.Candidates[0].Applicability.Reasons, "rooftop_relation_mismatch") || !containsString(response.Candidates[0].Applicability.Reasons, "unsupported_geometry") {
		t.Fatalf("above-rooftop scenario was not rejected: %+v", response.Candidates[0].Applicability)
	}
}

func TestP1411P525ComparisonAndFingerprintAreDeterministic(t *testing.T) {
	request := p1411TestRequest(140, 100, P1411MorphologyUrbanHighRise, P1411RooftopBothBelow, P1411LOSStateLOS)
	first, err := EvaluateP1411ReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	second, err := EvaluateP1411ReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if first.Fingerprint == "" || first.Fingerprint != second.Fingerprint {
		t.Fatalf("fingerprints are not deterministic: %q vs %q", first.Fingerprint, second.Fingerprint)
	}
	candidate := first.Candidates[0]
	wantFSPL := p1411IndependentFSPL(100, 140)
	if math.Abs(candidate.P525Comparison.FSPLDB-wantFSPL) > 1e-12 {
		t.Fatalf("P.525 FSPL = %.12f, want %.12f", candidate.P525Comparison.FSPLDB, wantFSPL)
	}
	wantDifference := *candidate.Model.MedianPathLossDB - wantFSPL
	if candidate.P525Comparison.ExcessRelativeToFSPLDB == nil || math.Abs(*candidate.P525Comparison.ExcessRelativeToFSPLDB-wantDifference) > 1e-12 {
		t.Fatalf("P.525 difference = %v, want %.12f", candidate.P525Comparison.ExcessRelativeToFSPLDB, wantDifference)
	}
	if candidate.ExternalAtmosphericComposition.Status != "deferred_unvalidated" || candidate.ResearchSubTHZComparison.Status != "deferred_not_requested" {
		t.Fatalf("unexpected default comparisons: atmospheric=%+v research=%+v", candidate.ExternalAtmosphericComposition, candidate.ResearchSubTHZComparison)
	}
}

func TestP1411AlternativeComparisonsAreNotSummed(t *testing.T) {
	request := p1411TestRequest(140, 100, P1411MorphologyUrbanHighRise, P1411RooftopBothBelow, P1411LOSStateLOS)
	atmospheric := SubTHZAtmosphericReferenceRequest{
		FrequencyGHz: 140,
		Transmitter:  request.Transmitter,
		Receiver:     request.Receiver,
		Atmosphere:   SubTHZReferenceAtmosphere{Enabled: false},
		Rain:         SubTHZReferenceRain{Enabled: false, Polarization: "circular", PolarizationTiltDeg: 45},
		LocalFog:     SubTHZReferenceLocalFog{Enabled: false, TemperatureSource: "unavailable"},
	}
	wallEvents := 1
	request.AtmosphericReference = &atmospheric
	request.ResearchWallEventCount = &wallEvents
	response, err := EvaluateP1411ReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	candidate := response.Candidates[0]
	if candidate.ExternalAtmosphericComposition.Status != P1411AtmosphericComparisonStatus || candidate.ExternalAtmosphericComposition.IncludedInP1411Median {
		t.Fatalf("atmospheric comparison boundary = %+v", candidate.ExternalAtmosphericComposition)
	}
	if candidate.ResearchSubTHZComparison.Status != P1411ResearchComparisonStatus || candidate.ResearchSubTHZComparison.IncludedInP1411Median || candidate.ResearchSubTHZComparison.WallLossDB == nil || *candidate.ResearchSubTHZComparison.WallLossDB != 80 {
		t.Fatalf("research comparison boundary = %+v", candidate.ResearchSubTHZComparison)
	}
	if candidate.Model.MedianPathLossDB == nil || candidate.Model.WallLossDB != 0 {
		t.Fatalf("P.1411 model changed by alternatives: %+v", candidate.Model)
	}
}

func TestP1411ObstructionContextReportsUnknownHeightWithoutLoss(t *testing.T) {
	request := p1411TestRequest(140, 100, P1411MorphologyUrbanHighRise, P1411RooftopBothBelow, P1411LOSStateNLOS)
	building := &BuildingFootprint{
		ID:       "unknown-screen",
		Vertices: []Point{{Lon: -0.00002, Lat: 0.0003}, {Lon: 0.00002, Lat: 0.0003}, {Lon: 0.00002, Lat: 0.0005}, {Lon: -0.00002, Lat: 0.0005}},
		Bounds:   Bounds{MinLon: -0.00002, MinLat: 0.0003, MaxLon: 0.00002, MaxLat: 0.0005},
	}
	response, err := EvaluateP1411ReferenceContext(context.Background(), request, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatal(err)
	}
	if !response.Obstruction.BuildingIntersectionPresent || response.Obstruction.UnknownHeightCount != 1 || len(response.Obstruction.UnknownHeightBuildingIDs) != 1 || response.Obstruction.UnknownHeightBuildingIDs[0] != "unknown-screen" {
		t.Fatalf("obstruction evidence = %+v", response.Obstruction)
	}
	if response.Obstruction.WallLossApplied || response.Obstruction.DiffractionApplied || response.Obstruction.MaterialLossApplied || response.Candidates[0].Model.WallLossDB != 0 {
		t.Fatalf("obstruction leaked into loss: %+v candidate=%+v", response.Obstruction, response.Candidates[0].Model)
	}
}
