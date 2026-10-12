package raytracer

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func TestSpecularReflectionReferenceControlled140GHzTEAndTM(t *testing.T) {
	for _, fixture := range []struct {
		polarization string
		gamma        float64
		power        float64
		rxPower      float64
	}{
		{polarization: MaterialPolarizationTE, gamma: -0.4514162296451364, power: 0.20377661238703051, rxPower: -95.28910051020749},
		{polarization: MaterialPolarizationTM, gamma: 0.20377661238703063, power: 0.04152490775593412, rxPower: -102.19755712832702},
	} {
		request := controlledSpecularReflectionRequest(fixture.polarization)
		response, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
		if err != nil {
			t.Fatalf("%s evaluation failed: %v", fixture.polarization, err)
		}
		if response.Geometry.ReflectionPointENU == nil || response.Geometry.MirroredTxENU == nil {
			t.Fatalf("%s did not return image geometry: %+v", fixture.polarization, response.Geometry)
		}
		assertSpecularClose(t, fixture.polarization+" reflection point x", response.Geometry.ReflectionPointENU.X, 0)
		assertSpecularClose(t, fixture.polarization+" reflection point y", response.Geometry.ReflectionPointENU.Y, 0)
		assertSpecularClose(t, fixture.polarization+" mirrored tx x", response.Geometry.MirroredTxENU.X, -50)
		assertSpecularClose(t, fixture.polarization+" d1", *response.Geometry.D1M, 70.71067811865476)
		assertSpecularClose(t, fixture.polarization+" d2", *response.Geometry.D2M, 70.71067811865476)
		assertSpecularClose(t, fixture.polarization+" total path", *response.Geometry.TotalPathLengthM, 141.4213562373095)
		assertSpecularClose(t, fixture.polarization+" incidence", *response.Geometry.IncidenceAngleDeg, 45)
		assertSpecularClose(t, fixture.polarization+" reflection", *response.Geometry.ReflectionAngleDeg, 45)
		assertSpecularClose(t, fixture.polarization+" FSPL", response.Spreading.FSPLReflectedPathDB, 118.38064389208795)
		assertSpecularClose(t, fixture.polarization+" gamma", response.Material.ReflectionCoefficient.Real, fixture.gamma)
		assertSpecularClose(t, fixture.polarization+" reflected fraction", response.Material.ReflectionCoefficient.PowerFraction, fixture.power)
		if response.LinkBudget.ReflectedPathReferencePowerDBm == nil {
			t.Fatalf("%s missing reference power: %+v", fixture.polarization, response.LinkBudget)
		}
		assertSpecularClose(t, fixture.polarization+" reference power", *response.LinkBudget.ReflectedPathReferencePowerDBm, fixture.rxPower)
		if response.Spreading.TwoLegFSPLComposition {
			t.Fatalf("%s incorrectly used two-leg FSPL composition", fixture.polarization)
		}
		if response.DirectPathCalculated || response.MultipathCombined || response.NetworkCoupled || response.Canonical {
			t.Fatalf("%s crossed isolation boundary: %+v", fixture.polarization, response)
		}
	}
}

func TestSpecularReflectionReferenceUsesTotalPathFSPLOnly(t *testing.T) {
	request := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	response, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if response.Geometry.D1M == nil || response.Geometry.D2M == nil {
		t.Fatal("missing leg distances")
	}
	wavelength := calculateSpecularReflectionWavelength(140)
	want := specularReflectionFSPL(*response.Geometry.D1M+*response.Geometry.D2M, wavelength)
	rejected := specularReflectionFSPL(*response.Geometry.D1M, wavelength) + specularReflectionFSPL(*response.Geometry.D2M, wavelength)
	assertSpecularClose(t, "total path FSPL", response.Spreading.FSPLReflectedPathDB, want)
	if math.Abs(rejected-response.Spreading.FSPLReflectedPathDB) < 50 {
		t.Fatalf("two-leg regression fixture is not dramatically different: rejected=%.6f selected=%.6f", rejected, response.Spreading.FSPLReflectedPathDB)
	}
}

func TestSpecularReflectionReferenceGeographicCoordinatesUseMetricENU(t *testing.T) {
	request := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	lon0, lat0, originZ := 32.8541, 39.9208, 100.0
	metersToLon := func(meters float64) float64 {
		return meters / (EarthRadiusMeters * math.Cos(lat0*math.Pi/180)) * 180 / math.Pi
	}
	metersToLat := func(meters float64) float64 { return meters / EarthRadiusMeters * 180 / math.Pi }
	position := func(east, north, z float64) SpecularReflectionPositionInput {
		lon, lat, height := lon0+metersToLon(east), lat0+metersToLat(north), z
		return SpecularReflectionPositionInput{Lon: &lon, Lat: &lat, Z: &height}
	}
	origin := position(0, 0, originZ)
	request.CoordinateFrame = SpecularReflectionFrameInput{Mode: "geographic_enu", Origin: &origin}
	request.Tx.Position = position(50, -50, originZ+10)
	request.Rx.Position = position(50, 50, originZ+10)
	request.Facade.Start = position(0, -10, originZ)
	request.Facade.End = position(0, 10, originZ)
	planePoint := position(0, 0, originZ)
	request.Facade.PlanePoint = &planePoint
	response, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if response.Geometry.LocalFrame.Mode != "geographic_enu" || response.Geometry.LocalFrame.OriginProvenance != "declared_wgs84_origin" {
		t.Fatalf("geographic frame provenance = %+v", response.Geometry.LocalFrame)
	}
	assertSpecularClose(t, "geographic Tx east", response.Geometry.TxENU.X, 50)
	assertSpecularClose(t, "geographic Tx north", response.Geometry.TxENU.Y, -50)
	assertSpecularClose(t, "geographic Tx up", response.Geometry.TxENU.Z, 10)
	if response.Geometry.ReflectionPointENU == nil {
		t.Fatalf("geographic request did not produce reflection point: %+v", response)
	}
	assertSpecularClose(t, "geographic reflection x", response.Geometry.ReflectionPointENU.X, 0)
	assertSpecularClose(t, "geographic reflection y", response.Geometry.ReflectionPointENU.Y, 0)
}

func TestSpecularReflectionReferenceGeometryAndHeightGates(t *testing.T) {
	tests := []struct {
		name          string
		mutate        func(*SpecularReflectionReferenceRequest)
		reason        string
		qualification string
	}{
		{name: "point outside segment", mutate: func(request *SpecularReflectionReferenceRequest) {
			request.Facade.Start = specularPosition(0, 1, 0)
			request.Facade.End = specularPosition(0, 10, 0)
		}, reason: "specular_point_outside_facade_segment"},
		{name: "vertical extent failure", mutate: func(request *SpecularReflectionReferenceRequest) { top := 5.0; request.Facade.TopZ = &top }, reason: "specular_point_outside_vertical_extent"},
		{name: "unknown height", mutate: func(request *SpecularReflectionReferenceRequest) { request.Facade.TopZ = nil }, reason: "vertical_extent_unknown"},
		{name: "wrong exterior side", mutate: func(request *SpecularReflectionReferenceRequest) {
			request.Facade.OutwardNormal = &SpecularReflectionVectorInput{X: -1, Y: 0, Z: 0}
		}, qualification: "tx and rx must lie on the declared exterior side of the facade"},
	}
	for _, fixture := range tests {
		t.Run(fixture.name, func(t *testing.T) {
			request := controlledSpecularReflectionRequest(MaterialPolarizationTE)
			fixture.mutate(&request)
			response, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
			if err != nil {
				t.Fatal(err)
			}
			if response.Status != SpecularReflectionStatusInapplicable {
				t.Fatalf("status=%s response=%+v", response.Status, response)
			}
			if fixture.reason != "" && !containsSpecularString(response.Applicability.Reasons, fixture.reason) {
				t.Fatalf("reasons=%v, want %s", response.Applicability.Reasons, fixture.reason)
			}
			if fixture.qualification != "" && !containsSpecularString(response.Applicability.Qualifications, fixture.qualification) {
				t.Fatalf("qualifications=%v, want %s", response.Applicability.Qualifications, fixture.qualification)
			}
		})
	}
}

func TestSpecularReflectionReferenceVisibilityAndSelfContact(t *testing.T) {
	blocked := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	blocked.Obstructions = []SpecularReflectionObstacleInput{{
		ID: "crossing-obstacle", Polygon: []SpecularReflectionPositionInput{specularPosition(20, -30, 0), specularPosition(30, -30, 0), specularPosition(30, -20, 0), specularPosition(20, -20, 0)}, BaseZ: floatPointer(0), TopZ: floatPointer(20),
	}}
	blockedResponse, err := EvaluateSpecularReflectionReferenceContext(context.Background(), blocked, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if blockedResponse.Visibility.Leg1.Status != SpecularReflectionVisibilityBlocked || !containsSpecularString(blockedResponse.Applicability.Reasons, "leg1_blocked") {
		t.Fatalf("first leg obstruction not reported: %+v", blockedResponse)
	}

	endpointOnly := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	endpointOnly.Obstructions = []SpecularReflectionObstacleInput{{
		ID: "reflector", Reflector: true, Polygon: []SpecularReflectionPositionInput{specularPosition(-2, -2, 0), specularPosition(0, -2, 0), specularPosition(0, 2, 0), specularPosition(-2, 2, 0)}, BaseZ: floatPointer(0), TopZ: floatPointer(20),
	}}
	endpointResponse, err := EvaluateSpecularReflectionReferenceContext(context.Background(), endpointOnly, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if endpointResponse.Visibility.Leg1.Status == SpecularReflectionVisibilityBlocked || endpointResponse.Visibility.Leg2.Status == SpecularReflectionVisibilityBlocked {
		t.Fatalf("zero-length reflector endpoint contact blocked the path: %+v", endpointResponse.Visibility)
	}

	penetrating := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	penetrating.Obstructions = []SpecularReflectionObstacleInput{{
		ID: "reflector", Reflector: true, Polygon: []SpecularReflectionPositionInput{specularPosition(-2, -2, 0), specularPosition(2, -2, 0), specularPosition(2, 2, 0), specularPosition(-2, 2, 0)}, BaseZ: floatPointer(0), TopZ: floatPointer(20),
	}}
	penetratingResponse, err := EvaluateSpecularReflectionReferenceContext(context.Background(), penetrating, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if penetratingResponse.Visibility.Leg1.Status != SpecularReflectionVisibilityBlocked || !containsSpecularString(penetratingResponse.Visibility.Leg1.Reasons, "blocked_by_reflector_geometry") {
		t.Fatalf("positive reflector penetration was not blocked: %+v", penetratingResponse.Visibility.Leg1)
	}
}

func TestSpecularReflectionReferenceZeroReflectionProducesFiniteJSON(t *testing.T) {
	request := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	epsilon := 1.0
	request.Material.UserMaterial.RelativePermittivity = &epsilon
	response, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if !containsSpecularString(response.Applicability.Reasons, "reflection_coefficient_zero_or_below_numeric_floor") {
		t.Fatalf("zero reflection was not gated: %v", response.Applicability.Reasons)
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "NaN") || strings.Contains(string(encoded), "Inf") {
		t.Fatalf("response contains non-finite JSON value: %s", encoded)
	}
}

func TestSpecularReflectionReferenceFingerprintDeterministic(t *testing.T) {
	request := controlledSpecularReflectionRequest(MaterialPolarizationTM)
	first, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	second, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if first.Fingerprint == "" || first.Fingerprint != second.Fingerprint {
		t.Fatalf("fingerprint is not deterministic: %q vs %q", first.Fingerprint, second.Fingerprint)
	}
}

func TestSpecularReflectionReferenceReflectionModeAliasUsesSlabContract(t *testing.T) {
	request := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	request.Material.Mode = ""
	request.Material.ReflectionMode = SpecularReflectionMaterialSlab
	if validationError := ValidateSpecularReflectionReferenceRequest(request); !strings.Contains(validationError, "thickness_m") {
		t.Fatalf("alias slab mode did not enforce explicit thickness: %q", validationError)
	}
	request.Material.ThicknessM = floatPointer(0.01)
	request.Material.ThicknessProvenance = "controlled_reference_fixture"
	request.Material.PhaseCoherence = "coherent_total_slab"
	response, err := EvaluateSpecularReflectionReferenceContext(context.Background(), request, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if response.Material.Mode != SpecularReflectionMaterialSlab || !response.Material.MultipleInternalReflections {
		t.Fatalf("alias slab mode was not normalized: %+v", response.Material)
	}
}

func TestSpecularReflectionReferenceValidationRejectsInvalidMaterialBeforeEvaluation(t *testing.T) {
	request := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	request.Material.UserMaterial.ConductivitySPerM = nil
	if validationError := ValidateSpecularReflectionReferenceRequest(request); !strings.Contains(validationError, "conductivity_s_per_m") {
		t.Fatalf("invalid user material was not rejected by validation: %q", validationError)
	}

	request = controlledSpecularReflectionRequest(MaterialPolarizationTE)
	request.Material.IncidentMedium = MaterialReferenceMedium{}
	if validationError := ValidateSpecularReflectionReferenceRequest(request); !strings.Contains(validationError, "material.incident_medium.name") {
		t.Fatalf("invalid incident medium was not rejected by validation: %q", validationError)
	}
}

func controlledSpecularReflectionRequest(polarization string) SpecularReflectionReferenceRequest {
	epsilon := 4.0
	conductivity := 0.0
	pt := 30.0
	return SpecularReflectionReferenceRequest{
		SchemaVersion: 1, FrequencyGHz: 140,
		CoordinateFrame: SpecularReflectionFrameInput{Mode: "local_enu"},
		Tx:              SpecularReflectionEndpointInput{Position: specularPosition(50, -50, 10), Antenna: &SpecularReflectionAntennaInput{Mode: "isotropic", AbsoluteGainDBi: floatPointer(0)}},
		Rx:              SpecularReflectionEndpointInput{Position: specularPosition(50, 50, 10), Antenna: &SpecularReflectionAntennaInput{Mode: "isotropic", AbsoluteGainDBi: floatPointer(0)}},
		Facade: SpecularReflectionFacadeInput{
			Start: specularPosition(0, -10, 0), End: specularPosition(0, 10, 0), PlanePoint: positionPointer(specularPosition(0, 0, 0)),
			OutwardNormal: &SpecularReflectionVectorInput{X: 1, Y: 0, Z: 0}, GeometryProvenance: "controlled_reference_fixture", NormalProvenance: "user_declared", HeightProvenance: "controlled_reference_fixture", BaseZ: floatPointer(0), TopZ: floatPointer(20),
		},
		Material: SpecularReflectionMaterialInput{
			Mode: SpecularReflectionMaterialInterface, MaterialSource: MaterialSourceUser, UserMaterial: &MaterialReferenceUserMaterial{Name: "lossless epsilon 4", PropertySource: MaterialPropertySourceUserDeclared, RelativePermittivity: &epsilon, ConductivitySPerM: &conductivity, ProvenanceNote: "controlled reference fixture"},
			IncidentMedium: MaterialReferenceMedium{Name: "air", RelativePermittivity: 1, ConductivitySPerM: 0, PropertySource: MaterialPropertySourceUserDeclared},
			ExitMedium:     MaterialReferenceMedium{Name: "air", RelativePermittivity: 1, ConductivitySPerM: 0, PropertySource: MaterialPropertySourceUserDeclared}, Provenance: "controlled_reference_fixture",
		},
		Polarization: polarization, Terrain: SpecularReflectionTerrainInput{Mode: SpecularReflectionTerrainFlat, Provenance: "controlled_reference_fixture"}, LinkBudget: SpecularReflectionLinkBudgetInput{PtConductedDBm: &pt},
	}
}

func specularPosition(x, y, z float64) SpecularReflectionPositionInput {
	return SpecularReflectionPositionInput{X: floatPointer(x), Y: floatPointer(y), Z: floatPointer(z)}
}

func positionPointer(value SpecularReflectionPositionInput) *SpecularReflectionPositionInput {
	return &value
}

func containsSpecularString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func assertSpecularClose(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-8 {
		t.Fatalf("%s = %.14f, want %.14f", name, got, want)
	}
}

func BenchmarkSpecularReflectionReferenceControlled140GHz(b *testing.B) {
	request := controlledSpecularReflectionRequest(MaterialPolarizationTE)
	ctx := context.Background()
	b.ReportAllocs()
	for index := 0; index < b.N; index++ {
		if _, err := EvaluateSpecularReflectionReferenceContext(ctx, request, EmptyBuildingIndex()); err != nil {
			b.Fatal(err)
		}
	}
}
