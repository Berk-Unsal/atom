package raytracer

import (
	"math"
	"strings"
	"testing"
)

func clearanceFixtureProvenance() EvidenceProvenance {
	return EvidenceProvenance{
		Source: "controlled-dtm", SourceVersion: "fixture-1", DatasetID: "fixture-dataset", SourceChecksum: "fixture-checksum",
		VerticalDatum: "EGM2008", VerticalDatumKind: VerticalDatumOrthometric, GeoidModel: "EGM2008", EvidenceClass: EvidenceTrusted,
	}
}

func clearanceFixtureProfile(values []*float64, statuses []string, interpolation string) TerrainPathProfile {
	if statuses == nil {
		statuses = make([]string, len(values))
	}
	samples := make([]TerrainPathSample, 0, len(values))
	totalDistance := float64(len(values)-1) * 25
	for index, value := range values {
		status := statuses[index]
		if status == "" {
			status = TerrainSampleSource
		}
		point := Point{Lon: 32 + float64(index)*0.0002, Lat: 39}
		samples = append(samples, TerrainPathSample{
			DistanceM: float64(index) * 25,
			Point:     point,
			Terrain: TerrainSample{
				ElevationM: value, Status: status, Kind: TerrainKindDTM, Source: clearanceFixtureProvenance(),
				Interpolation: interpolation, ResolutionXM: 30, ResolutionYM: 30, AuthoritativeGround: true,
			},
		})
	}
	return TerrainPathProfile{
		Transmitter: Point{Lon: 32, Lat: 39}, Receiver: Point{Lon: 32.0008, Lat: 39},
		DistanceM: totalDistance, RequestedSpacingM: 25, EffectiveSpacingM: 30,
		SamplingIntervalRule: "fixture", Samples: samples, Status: TerrainSampleInterpolated,
	}
}

func floatValue(value float64) *float64 { return &value }

func TestTerrainClearanceFlatFixtureUsesRadioMinusTerrain(t *testing.T) {
	profile := clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(100), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear)
	result, err := EvaluateTerrainClearanceProfile(profile, TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate flat fixture: %v", err)
	}
	if result.Status != TerrainClearanceStatusAvailable || result.Classification != TerrainClearanceClassClear {
		t.Fatalf("flat fixture status/classification = %q/%q", result.Status, result.Classification)
	}
	if result.TxEndpointClearanceM == nil || math.Abs(*result.TxEndpointClearanceM-25) > 1e-9 {
		t.Fatalf("Tx endpoint clearance = %v, want +25 m; sign inversion likely", result.TxEndpointClearanceM)
	}
	if result.RxEndpointClearanceM == nil || math.Abs(*result.RxEndpointClearanceM-1.5) > 1e-9 {
		t.Fatalf("Rx endpoint clearance = %v, want +1.5 m", result.RxEndpointClearanceM)
	}
	if result.MinimumClearanceM == nil || math.Abs(*result.MinimumClearanceM-1.5) > 1e-9 || result.MinimumLocation != "at_rx" {
		t.Fatalf("flat fixture minimum = %v at %q, want 1.5 m at_rx", result.MinimumClearanceM, result.MinimumLocation)
	}
	if len(result.Samples) != 5 || result.Samples[2].ClearanceM == nil || math.Abs(*result.Samples[2].ClearanceM-13.25) > 1e-9 {
		t.Fatalf("flat fixture midpoint sample = %+v, want 13.25 m", result.Samples[2])
	}
	if result.Fingerprint == "" {
		t.Fatal("flat fixture fingerprint is empty")
	}
}

func TestTerrainClearanceKnownCrestAndMarginPolicy(t *testing.T) {
	profile := clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(115.25), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear)
	strict, err := EvaluateTerrainClearanceProfile(profile, TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate crest fixture: %v", err)
	}
	if strict.MinimumClearanceM == nil || math.Abs(*strict.MinimumClearanceM+2) > 1e-9 || strict.Classification != TerrainClearanceClassObstructionCandidate || strict.MinimumLocation != "interior" {
		t.Fatalf("crest result = %+v, want -2 m interior obstruction candidate", strict)
	}
	margin := 1.0
	near, err := EvaluateTerrainClearanceProfile(clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(113.75), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear), TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25, UncertaintyMarginM: &margin})
	if err != nil {
		t.Fatalf("evaluate near-boundary fixture: %v", err)
	}
	if near.MinimumClearanceM == nil || math.Abs(*near.MinimumClearanceM+0.5) > 1e-9 || near.Classification != TerrainClearanceClassNearUncertainty {
		t.Fatalf("near-boundary result = %+v, want -0.5 m near uncertainty boundary", near)
	}
}

func TestTerrainClearanceMinimumLocationContract(t *testing.T) {
	atTxProfile := clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(100), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear)
	atTx, err := EvaluateTerrainClearanceProfile(atTxProfile, TerrainClearanceOptions{TxHeightAGLM: 0, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate at-Tx fixture: %v", err)
	}
	nearTx, err := EvaluateTerrainClearanceProfile(clearanceFixtureProfile([]*float64{floatValue(100), floatValue(120), floatValue(100), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear), TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate near-Tx fixture: %v", err)
	}
	nearRx, err := EvaluateTerrainClearanceProfile(clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(100), floatValue(108), floatValue(100)}, nil, TerrainInterpolationBilinear), TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate near-Rx fixture: %v", err)
	}
	interior, err := EvaluateTerrainClearanceProfile(clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(115.25), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear), TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate interior fixture: %v", err)
	}
	atRx, err := EvaluateTerrainClearanceProfile(clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(100), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear), TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate at-Rx fixture: %v", err)
	}
	locations := map[string]bool{atTx.MinimumLocation: true, nearTx.MinimumLocation: true, interior.MinimumLocation: true, nearRx.MinimumLocation: true, atRx.MinimumLocation: true}
	for _, location := range []string{"at_tx", "near_tx", "interior", "near_rx", "at_rx"} {
		if !locations[location] {
			t.Fatalf("minimum location contract missing %q: %v", location, locations)
		}
	}
}

func TestTerrainClearanceAscendingDescendingAndNoDataContracts(t *testing.T) {
	ascending := clearanceFixtureProfile([]*float64{floatValue(100), floatValue(105), floatValue(110), floatValue(115), floatValue(120)}, nil, TerrainInterpolationBilinear)
	result, err := EvaluateTerrainClearanceProfile(ascending, TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil || result.Classification != TerrainClearanceClassClear || result.MinimumClearanceM == nil || *result.MinimumClearanceM < 1.5 {
		t.Fatalf("ascending result = %+v, err=%v", result, err)
	}
	descending := clearanceFixtureProfile([]*float64{floatValue(120), floatValue(115), floatValue(110), floatValue(105), floatValue(100)}, nil, TerrainInterpolationBilinear)
	result, err = EvaluateTerrainClearanceProfile(descending, TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil || result.Classification != TerrainClearanceClassClear || result.MinimumClearanceM == nil || *result.MinimumClearanceM < 1.5 {
		t.Fatalf("descending result = %+v, err=%v", result, err)
	}
	partial, err := EvaluateTerrainClearanceProfile(clearanceFixtureProfile([]*float64{floatValue(100), nil, floatValue(100), floatValue(100), floatValue(100)}, []string{"", TerrainSampleNoData, "", "", ""}, TerrainInterpolationBilinear), TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("evaluate no-data fixture: %v", err)
	}
	if partial.Status != TerrainClearanceStatusPartial || partial.Classification != TerrainClearanceClassUnavailable || partial.MinimumClearanceM == nil {
		t.Fatalf("no-data result = %+v, want partial/unavailable with valid minimum evidence", partial)
	}
	if partial.Samples[1].ClearanceM != nil || !strings.Contains(strings.Join(partial.Qualifications, " "), "no_data") {
		t.Fatalf("no-data sample was classified or qualification missing: %+v", partial)
	}
}

func TestTerrainClearanceRejectsMixedDatumAndFingerprintsInterpolation(t *testing.T) {
	mixed := clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear)
	mixed.Samples[1].Terrain.Source.VerticalDatum = "EGM96"
	if _, err := EvaluateTerrainClearanceProfile(mixed, TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25}); err == nil {
		t.Fatal("mixed source-local vertical datum was accepted")
	}
	bilinear := clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(100)}, nil, TerrainInterpolationBilinear)
	nearest := clearanceFixtureProfile([]*float64{floatValue(100), floatValue(100), floatValue(100)}, nil, TerrainInterpolationNearest)
	first, err := EvaluateTerrainClearanceProfile(bilinear, TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("bilinear fingerprint: %v", err)
	}
	second, err := EvaluateTerrainClearanceProfile(nearest, TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 25})
	if err != nil {
		t.Fatalf("nearest fingerprint: %v", err)
	}
	if first.Fingerprint == second.Fingerprint || first.Interpolation != TerrainInterpolationBilinear || second.Interpolation != TerrainInterpolationNearest {
		t.Fatalf("interpolation fingerprints = %q/%q, metadata = %q/%q", first.Fingerprint, second.Fingerprint, first.Interpolation, second.Interpolation)
	}
}

func TestTerrainClearanceSourceResolutionBoundsSpacing(t *testing.T) {
	fixture := declaredDTMFixture(func(Point) (float64, bool) { return 100, true })
	sampler, err := NewTerrainSampler(fixture, TerrainInterpolationBilinear)
	if err != nil {
		t.Fatalf("new fixture sampler: %v", err)
	}
	options := TerrainClearanceOptions{TxHeightAGLM: 25, RxHeightAGLM: 1.5, RequestedSpacingM: 5}
	profile, result, err := BuildTerrainClearanceProfile(Point{Lon: 32.001, Lat: 39.999}, Point{Lon: 32.014, Lat: 39.999}, sampler, options)
	if err != nil {
		t.Fatalf("build source-resolution profile: %v", err)
	}
	if profile.EffectiveSpacingM != 30 || result.SourceResolutionM != 30 || !strings.Contains(strings.Join(result.Qualifications, " "), "bounded") {
		t.Fatalf("source-resolution spacing contract = profile=%+v result=%+v", profile, result)
	}
}
