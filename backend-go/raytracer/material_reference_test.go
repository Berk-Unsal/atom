package raytracer

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func materialReferenceFixtureRequest(materialID string, thicknessM float64) MaterialReferenceRequest {
	thickness := thicknessM
	return MaterialReferenceRequest{
		SchemaVersion:       MaterialReferenceSchemaVersion,
		FrequencyGHz:        140,
		MaterialSource:      MaterialSourceP2040,
		MaterialID:          materialID,
		ThicknessM:          &thickness,
		ThicknessProvenance: "controlled_reference_fixture",
		IncidenceAngle:      0,
		Polarization:        MaterialPolarizationTE,
		IncidentMedium:      MaterialReferenceMedium{Name: "air", RelativePermittivity: 1, PropertySource: MaterialPropertySourceUserDeclared},
		ExitMedium:          MaterialReferenceMedium{Name: "air", RelativePermittivity: 1, PropertySource: MaterialPropertySourceUserDeclared},
	}
}

func TestMaterialReferenceTable3At140Fixtures(t *testing.T) {
	fixtures := []struct {
		materialID       string
		thicknessM       float64
		interfaceR       float64
		transmissionLoss float64
	}{
		{materialID: "concrete_110_330", thicknessM: 0.2, interfaceR: 0.152271, transmissionLoss: 456.972062},
		{materialID: "brick_110_330", thicknessM: 0.2, interfaceR: 0.116877, transmissionLoss: 228.055099},
		{materialID: "glass_100_400", thicknessM: 0.01, interfaceR: 0.192810, transmissionLoss: 12.646834},
		{materialID: "wood_110_330", thicknessM: 0.1, interfaceR: 0.022409, transmissionLoss: 99.100082},
	}
	for _, fixture := range fixtures {
		fixture := fixture
		t.Run(fixture.materialID, func(t *testing.T) {
			response, err := EvaluateMaterialReferenceContext(context.Background(), materialReferenceFixtureRequest(fixture.materialID, fixture.thicknessM))
			if err != nil {
				t.Fatal(err)
			}
			if response.Status != MaterialReferenceStatusApplicable || response.Ledger == nil {
				t.Fatalf("status=%q ledger=%v", response.Status, response.Ledger != nil)
			}
			if got := response.Ledger.InterfaceReflectionPowerFraction; math.Abs(got-fixture.interfaceR) > 2e-6 {
				t.Errorf("interface reflection power = %.9f, want %.9f", got, fixture.interfaceR)
			}
			if response.Ledger.TransmissionLossDB == nil {
				t.Fatal("missing finite slab transmission loss")
			}
			if got := *response.Ledger.TransmissionLossDB; math.Abs(got-fixture.transmissionLoss) > 2e-5 {
				t.Errorf("transmission loss = %.9f, want %.9f", got, fixture.transmissionLoss)
			}
			if response.Material.RelativePermittivity == nil || response.Material.ConductivitySPerM == nil || response.Material.ComplexRelativePermittivity == nil {
				t.Fatal("reference material ledger omitted resolved electrical properties")
			}
			if response.Material.PropertySource != MaterialPropertySourceP2040 || response.Material.Classification != "reference_material" {
				t.Fatalf("unexpected provenance: %+v", response.Material)
			}
		})
	}
}

func TestMaterialReferencePresetCatalogContract(t *testing.T) {
	catalog := MaterialReferencePresetCatalog()
	if len(catalog) != 22 {
		t.Fatalf("preset count = %d, want 22 non-metal Table 3 rows", len(catalog))
	}
	seen := make(map[string]bool, len(catalog))
	for _, preset := range catalog {
		if seen[preset.MaterialID] {
			t.Fatalf("duplicate preset ID %q", preset.MaterialID)
		}
		seen[preset.MaterialID] = true
		if strings.Contains(strings.ToLower(preset.MaterialID), "metal") || preset.FrequencyRangeGHz[0] <= 0 || preset.FrequencyRangeGHz[1] < preset.FrequencyRangeGHz[0] {
			t.Fatalf("invalid or excluded preset: %+v", preset)
		}
	}
	for _, id := range []string{"concrete_110_330", "brick_110_330", "wood_110_330", "glass_100_400"} {
		if !seen[id] {
			t.Fatalf("140 GHz material row %q missing", id)
		}
	}
}

func TestMaterialReferenceOutOfRangeDoesNotExtrapolate(t *testing.T) {
	request := materialReferenceFixtureRequest("brick_1_40", 0.2)
	request.FrequencyGHz = 60
	response, err := EvaluateMaterialReferenceContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Status != MaterialReferenceStatusMaterialFrequencyOutOfRange || response.Ledger != nil {
		t.Fatalf("out-of-range response = status %q ledger=%v", response.Status, response.Ledger != nil)
	}
	if response.Material.RelativePermittivity != nil || response.Material.ComplexRelativePermittivity != nil {
		t.Fatalf("out-of-range response exposed extrapolated properties: %+v", response.Material)
	}
	if response.Applicability.FrequencyRangeGHz != [2]float64{1, 40} {
		t.Fatalf("frequency range = %v", response.Applicability.FrequencyRangeGHz)
	}
}

func TestMaterialReferenceUserPropertyContractAndProvenance(t *testing.T) {
	eps := 4.0
	sigma := 0.15
	request := materialReferenceFixtureRequest("", 0.01)
	request.MaterialSource = MaterialSourceUser
	request.UserMaterial = &MaterialReferenceUserMaterial{
		Name: "Measured facade coupon", PropertySource: MaterialPropertySourceMeasured,
		FrequencyRangeGHz: []float64{100, 200}, RelativePermittivity: &eps, ConductivitySPerM: &sigma,
		ProvenanceNote: "controlled coupon record",
	}
	response, err := EvaluateMaterialReferenceContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Status != MaterialReferenceStatusApplicable || response.Material.Classification != "user_assumption" || response.Material.MaterialID != "user_assumption" {
		t.Fatalf("unexpected user material response: status=%q material=%+v", response.Status, response.Material)
	}
	if response.PropertyProvenance["material_properties"] != MaterialPropertySourceMeasured || response.Material.PropertySource != MaterialPropertySourceMeasured {
		t.Fatalf("property provenance = %+v", response.PropertyProvenance)
	}

	request.UserMaterial.ComplexRelativePermittivity = &MaterialReferenceComplexInput{Real: 4, ImaginaryLoss: 0.1}
	if validationError := ValidateMaterialReferenceRequest(request); !strings.Contains(validationError, "exactly one electrical-property form") {
		t.Fatalf("redundant property validation = %q", validationError)
	}
}

func TestMaterialReferenceZeroThicknessAndTEPowers(t *testing.T) {
	for _, polarization := range []string{MaterialPolarizationTE, MaterialPolarizationTM} {
		request := materialReferenceFixtureRequest("glass_100_400", 0)
		request.Polarization = polarization
		response, err := EvaluateMaterialReferenceContext(context.Background(), request)
		if err != nil {
			t.Fatalf("%s: %v", polarization, err)
		}
		if response.Ledger == nil || response.Ledger.TransmittedPowerFraction == nil || response.Ledger.AbsorbedPowerFraction == nil {
			t.Fatalf("%s: incomplete zero-thickness ledger: %+v", polarization, response.Ledger)
		}
		if got := response.Ledger.ReflectedPowerFraction; math.Abs(got) > 1e-12 {
			t.Errorf("%s: reflected power = %.12g", polarization, got)
		}
		if got := *response.Ledger.TransmittedPowerFraction; math.Abs(got-1) > 1e-12 {
			t.Errorf("%s: transmitted power = %.12g", polarization, got)
		}
		if got := *response.Ledger.AbsorbedPowerFraction; math.Abs(got) > 1e-12 {
			t.Errorf("%s: absorbed power = %.12g", polarization, got)
		}
	}
}

func TestMaterialReferenceObliqueTEAndTMPowerBalance(t *testing.T) {
	teRequest := materialReferenceFixtureRequest("glass_100_400", 0.01)
	teRequest.IncidenceAngle = 45
	tmRequest := teRequest
	tmRequest.Polarization = MaterialPolarizationTM
	te, err := EvaluateMaterialReferenceContext(context.Background(), teRequest)
	if err != nil {
		t.Fatal(err)
	}
	tm, err := EvaluateMaterialReferenceContext(context.Background(), tmRequest)
	if err != nil {
		t.Fatal(err)
	}
	if te.Ledger == nil || tm.Ledger == nil || te.Ledger.AbsorbedPowerFraction == nil || tm.Ledger.AbsorbedPowerFraction == nil {
		t.Fatal("oblique TE/TM result omitted power balance")
	}
	for name, response := range map[string]MaterialReferenceResponse{"TE": te, "TM": tm} {
		balance := response.Ledger.ReflectedPowerFraction + *response.Ledger.TransmittedPowerFraction + *response.Ledger.AbsorbedPowerFraction
		if math.Abs(balance-1) > 1e-8 {
			t.Errorf("%s power balance = %.12f", name, balance)
		}
	}
	if te.Ledger.ReflectionCoefficient.Real == tm.Ledger.ReflectionCoefficient.Real && te.Ledger.ReflectionCoefficient.Imaginary == tm.Ledger.ReflectionCoefficient.Imaginary {
		t.Fatal("TE and TM coefficients unexpectedly identical at oblique incidence")
	}
}

func TestMaterialReferenceGeometryDerivedAngleRequiresReliableNormal(t *testing.T) {
	request := materialReferenceFixtureRequest("glass_100_400", 0.01)
	request.GeometryContext = &MaterialReferenceGeometryContext{IncidenceAngleSource: "geometry_derived"}
	if validationError := ValidateMaterialReferenceRequest(request); !strings.Contains(validationError, "reliable facade normal") {
		t.Fatalf("missing normal provenance was accepted: %q", validationError)
	}
	request.GeometryContext.FacadeNormalProvenance = "surveyed_facade_normal"
	response, err := EvaluateMaterialReferenceContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Geometry.IncidenceAngleSource != "geometry_derived" || response.Geometry.FacadeNormalProvenance != "surveyed_facade_normal" {
		t.Fatalf("geometry provenance was not preserved: %+v", response.Geometry)
	}
}

func TestMaterialReferenceNumericFloorIsFiniteAndExplicit(t *testing.T) {
	request := materialReferenceFixtureRequest("concrete_110_330", 10)
	response, err := EvaluateMaterialReferenceContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Status != MaterialReferenceStatusBelowNumericFloor || response.Ledger == nil || response.Ledger.LowerBoundTransmissionLossDB == nil || response.Ledger.TransmissionCoefficient != nil {
		t.Fatalf("numeric floor response = status %q ledger=%+v", response.Status, response.Ledger)
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("numeric floor JSON: %v", err)
	}
	if strings.Contains(string(encoded), "NaN") || strings.Contains(string(encoded), "Inf") {
		t.Fatalf("numeric floor JSON contains non-finite value: %s", encoded)
	}
}

func TestMaterialReferenceFingerprintAndHeuristicRemainSeparate(t *testing.T) {
	request := materialReferenceFixtureRequest("glass_100_400", 0.01)
	first, err := EvaluateMaterialReferenceContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := EvaluateMaterialReferenceContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if first.Fingerprint == "" || first.Fingerprint != second.Fingerprint {
		t.Fatalf("fingerprint is not deterministic: %q/%q", first.Fingerprint, second.Fingerprint)
	}
	if first.Comparison.Combined || first.Comparison.SlabTransmissionLossDB == nil || first.Comparison.DifferenceFromHeuristicDB == nil {
		t.Fatalf("heuristic comparison is not side-by-side: %+v", first.Comparison)
	}
	changed := request
	changedThickness := 0.02
	changed.ThicknessM = &changedThickness
	third, err := EvaluateMaterialReferenceContext(context.Background(), changed)
	if err != nil {
		t.Fatal(err)
	}
	if third.Fingerprint == first.Fingerprint {
		t.Fatal("thickness change did not change fingerprint")
	}
}

func TestMaterialReferenceContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := EvaluateMaterialReferenceContext(ctx, materialReferenceFixtureRequest("glass_100_400", 0.01)); err == nil {
		t.Fatal("cancelled context unexpectedly evaluated")
	}
}

func BenchmarkMaterialReferenceOneEvaluation(b *testing.B) {
	request := materialReferenceFixtureRequest("glass_100_400", 0.01)
	for index := 0; index < b.N; index++ {
		if _, err := EvaluateMaterialReferenceContext(context.Background(), request); err != nil {
			b.Fatal(err)
		}
	}
}

func TestP2040MaterialCharacterizationAdapterRemainsReferenceOnly(t *testing.T) {
	record := MaterialCharacterizationRecord{
		SchemaVersion:              MaterialReferenceSchemaVersion,
		RecordID:                   "coupon-glass-140-01",
		MaterialRequest:            materialReferenceFixtureRequest("glass_100_400", 0.01),
		MeasuredTransmissionLossDB: 12.8,
		MeasurementSource:          "controlled-coupon-lab",
		MeasurementProvenance:      "user_supplied_measurement",
	}
	result, err := EvaluateP2040MaterialCharacterizationRecord(context.Background(), record)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != MaterialReferenceStatusApplicable || result.PredictedTransmissionLossDB == nil || result.ResidualDB == nil {
		t.Fatalf("incomplete material characterization result: %+v", result)
	}
	if result.Readiness != "reference_only" || result.Promoted {
		t.Fatalf("material result crossed readiness boundary: %+v", result)
	}
	wantResidual := record.MeasuredTransmissionLossDB - *result.PredictedTransmissionLossDB
	if math.Abs(*result.ResidualDB-wantResidual) > 1e-12 {
		t.Fatalf("residual = %.12f, want %.12f", *result.ResidualDB, wantResidual)
	}
}
