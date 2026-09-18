package raytracer

import (
	"context"
	"math"
	"strings"
	"testing"
)

func subTHZReferenceFixtureRequest(frequencyGHz, horizontalDistanceM float64) SubTHZAtmosphericReferenceRequest {
	return SubTHZAtmosphericReferenceRequest{
		FrequencyGHz: frequencyGHz,
		Transmitter:  SubTHZReferencePoint{Location: Point{Lon: 0, Lat: 0}, HeightM: 25},
		Receiver:     SubTHZReferencePoint{Location: Point{Lon: horizontalDistanceM / 111320, Lat: 0}, HeightM: 1.5},
		Atmosphere:   SubTHZReferenceAtmosphere{Enabled: true, PressureHPA: 1013.25, TemperatureK: 288.15, WaterVapourDensityGM3: 7.5},
		Rain:         SubTHZReferenceRain{Polarization: "circular", PolarizationTiltDeg: 45},
		LocalFog:     SubTHZReferenceLocalFog{TemperatureSource: "unavailable"},
	}
}

func TestSubTHZAtmosphericReferenceP525DistanceSweep(t *testing.T) {
	distances := []float64{10, 25, 50, 100, 200, 400}
	expectedSlant := []float64{25.539185578244, 34.311076928596, 55.247171873319, 102.724145165584, 201.375892300941, 400.689717861589}
	expectedFSPL140 := []float64{103.514484813171, 106.079030926596, 110.216544959515, 115.603794653491, 121.450493491444, 127.426507897490}
	for index, distance := range distances {
		response, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), subTHZReferenceFixtureRequest(140, distance), EmptyBuildingIndex())
		if err != nil {
			t.Fatalf("distance %.0f: %v", distance, err)
		}
		if math.Abs(response.Geometry.SlantDistanceM-expectedSlant[index]) > 1e-9 {
			t.Errorf("distance %.0f slant = %.12f, want %.12f", distance, response.Geometry.SlantDistanceM, expectedSlant[index])
		}
		if math.Abs(response.FSPL.FSPLDB-expectedFSPL140[index]) > 1e-9 {
			t.Errorf("distance %.0f fspl = %.12f, want %.12f", distance, response.FSPL.FSPLDB, expectedFSPL140[index])
		}
		if response.ReferenceModelID != SubTHZAtmosphericReferenceModelID || response.Total.CanonicalNetwork || response.Total.ReceiverThreshold {
			t.Errorf("unexpected model boundary: id=%q canonical=%t threshold=%t", response.ReferenceModelID, response.Total.CanonicalNetwork, response.Total.ReceiverThreshold)
		}
	}
}

func TestSubTHZAtmosphericReferenceFrequencyComparison(t *testing.T) {
	const distance = 100.0
	at140, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), subTHZReferenceFixtureRequest(140, distance), EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	at28, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), subTHZReferenceFixtureRequest(28, distance), EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	wantDelta := 20 * math.Log10(140.0/28.0)
	if got := at140.FSPL.FSPLDB - at28.FSPL.FSPLDB; math.Abs(got-wantDelta) > 1e-9 {
		t.Fatalf("FSPL frequency delta = %.12f, want %.12f", got, wantDelta)
	}
	if math.Abs(at140.Total.TotalPathLossDB-at140.FSPL.FSPLDB-at140.Gas.PathLossDB) > 1e-12 {
		t.Fatalf("disabled optional components changed total: total=%.12f fspl=%.12f gas=%.12f", at140.Total.TotalPathLossDB, at140.FSPL.FSPLDB, at140.Gas.PathLossDB)
	}
}

func TestSubTHZAtmosphericReferenceP676P838P840Fixtures(t *testing.T) {
	request := subTHZReferenceFixtureRequest(140, 100)
	request.Rain = SubTHZReferenceRain{Enabled: true, RainRateMMH: 25, Polarization: "circular", PolarizationTiltDeg: 45}
	request.LocalFog = SubTHZReferenceLocalFog{Enabled: true, LiquidWaterDensityGM3: 0.5, TemperatureK: 288.15, TemperatureSource: "request.local_fog.temperature_k"}
	response, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	assertClose := func(label string, got, want float64) {
		t.Helper()
		if math.Abs(got-want) > 1e-6 {
			t.Errorf("%s = %.9f, want %.9f", label, got, want)
		}
	}
	// Independent P.676-13 line-by-line fixture calculated from the published
	// line tables with total pressure 1013.25 hPa, 288.15 K, and 7.5 g/m3.
	assertClose("oxygen line", response.Gas.OxygenLineDBPerKM, 0.005956182)
	assertClose("dry continuum", response.Gas.DryContinuumDBPerKM, 0.012733146)
	assertClose("water vapour", response.Gas.WaterVapourDBPerKM, 0.896759348)
	assertClose("gas total", response.Gas.TotalDBPerKM, 0.915448676)
	assertClose("gas path loss", response.Gas.PathLossDB, 0.094038683)
	assertClose("P.838 k", response.Rain.K, 1.561638351)
	assertClose("P.838 alpha", response.Rain.Alpha, 0.651857990)
	assertClose("P.838 specific", response.Rain.SpecificDBPerKM, 12.730305607)
	assertClose("P.838 path loss", response.Rain.PathLossDB, 1.307709761)
	assertClose("P.840 K_l", response.LocalFog.KLGivenTemperature, 6.967799768)
	assertClose("P.840 specific", response.LocalFog.SpecificDBPerKM, 3.483899884)
	assertClose("P.840 path loss", response.LocalFog.PathLossDB, 0.357880637)
	assertClose("total", response.Total.TotalPathLossDB, 117.363423735)
	if response.Gas.Status != "included" || response.Rain.Status != "included" || response.LocalFog.Status != "included" {
		t.Fatalf("component statuses = %s/%s/%s", response.Gas.Status, response.Rain.Status, response.LocalFog.Status)
	}
}

func TestSubTHZAtmosphericReferenceBuildingFlagDoesNotAddLoss(t *testing.T) {
	request := subTHZReferenceFixtureRequest(140, 100)
	plain, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	building := &BuildingFootprint{
		ID: "screen", Vertices: []Point{{Lon: 0.0003, Lat: -0.00002}, {Lon: 0.0005, Lat: -0.00002}, {Lon: 0.0005, Lat: 0.00002}, {Lon: 0.0003, Lat: 0.00002}},
		Bounds: Bounds{MinLon: 0.0003, MinLat: -0.00002, MaxLon: 0.0005, MaxLat: 0.00002},
	}
	withBuilding, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), request, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatal(err)
	}
	if !withBuilding.Obstruction.BuildingIntersectionPresent || len(withBuilding.Obstruction.BuildingIDs) != 1 || withBuilding.Obstruction.BuildingIDs[0] != "screen" {
		t.Fatalf("building flag = %+v", withBuilding.Obstruction)
	}
	if withBuilding.Obstruction.WallLossApplied || withBuilding.Obstruction.DiffractionApplied || withBuilding.Obstruction.MaterialLossApplied {
		t.Fatalf("unexpected building loss terms: %+v", withBuilding.Obstruction)
	}
	if math.Abs(withBuilding.Total.TotalPathLossDB-plain.Total.TotalPathLossDB) > 1e-12 {
		t.Fatalf("building flag changed atmospheric total: plain=%.12f with_building=%.12f", plain.Total.TotalPathLossDB, withBuilding.Total.TotalPathLossDB)
	}
}

func TestSubTHZAtmosphericReferenceLinkBudgetHasNoServiceabilityDecision(t *testing.T) {
	request := subTHZReferenceFixtureRequest(140, 100)
	request.LinkBudget = &SubTHZReferenceLinkBudget{ConductedTxPowerDBm: 30, TxGainDBi: 25, RxGainDBi: 10, TxPatternAttenuationDB: 3, SystemLossDB: 2, PolarizationLossDB: 1, CalibrationOffsetDB: 0}
	response, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if response.ReferenceLinkBudget == nil || !response.ReferenceLinkBudget.Provided || response.ReferenceLinkBudget.ReceiverThresholdApplied || response.ReferenceLinkBudget.ServiceabilityEvaluated {
		t.Fatalf("unexpected link-budget boundary: %+v", response.ReferenceLinkBudget)
	}
	if response.ReferenceLinkBudget.ReceivedPowerDBm >= -1 || response.ReferenceLinkBudget.ReceivedPowerDBm <= -200 {
		t.Fatalf("unexpected reference received power: %.3f", response.ReferenceLinkBudget.ReceivedPowerDBm)
	}
}

func TestValidateSubTHZAtmosphericReferenceRequiresExplicitInputs(t *testing.T) {
	input := SubTHZAtmosphericReferenceRequestInput{}
	request := input.ToRequest()
	if got := ValidateSubTHZAtmosphericReferenceRequest(input, request); !strings.Contains(got, "frequency_ghz is required") {
		t.Fatalf("validation = %q", got)
	}
	frequency := 140.0
	input.FrequencyGHz = &frequency
	request = input.ToRequest()
	if got := ValidateSubTHZAtmosphericReferenceRequest(input, request); !strings.Contains(got, "transmitter") {
		t.Fatalf("validation = %q", got)
	}
}

func TestSubTHZAtmosphericReferenceFingerprintIsDeterministic(t *testing.T) {
	request := subTHZReferenceFixtureRequest(140, 100)
	first, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	second, err := EvaluateSubTHZAtmosphericReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if first.ExperimentFingerprint == "" || first.ExperimentFingerprint != second.ExperimentFingerprint {
		t.Fatalf("fingerprint is not deterministic: %q/%q", first.ExperimentFingerprint, second.ExperimentFingerprint)
	}
}
