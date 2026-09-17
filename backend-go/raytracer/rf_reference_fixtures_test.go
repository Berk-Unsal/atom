package raytracer

import (
	"context"
	_ "embed"
	"encoding/json"
	"math"
	"testing"
)

//go:embed testdata/rf-reference-fixtures.json
var rfReferenceFixtureBytes []byte

type rfReferenceCorpus struct {
	SchemaVersion     int                         `json:"schema_version"`
	CorpusID          string                      `json:"corpus_id"`
	Description       string                      `json:"description"`
	Conventions       map[string]string           `json:"conventions"`
	Sources           map[string]string           `json:"sources"`
	NumericFixtures   []rfReferenceNumericFixture `json:"numeric_fixtures"`
	GeometryContracts []rfReferenceGeometry       `json:"geometry_contracts"`
	Sensitivity       []rfReferenceSensitivity    `json:"sensitivity_contracts"`
	ReachContracts    []rfReferenceReach          `json:"reach_contracts"`
	SurfaceContracts  []rfReferenceSurface        `json:"surface_contracts"`
	SamplingContracts []rfReferenceSampling       `json:"sampling_contracts"`
}

type rfReferenceNumericFixture struct {
	ID                    string             `json:"id"`
	ReferenceID           string             `json:"reference_id"`
	Category              string             `json:"category"`
	Provenance            string             `json:"provenance"`
	FrequencyGHz          float64            `json:"frequency_ghz"`
	DistanceM             float64            `json:"distance_m"`
	TxPowerDBm            float64            `json:"tx_power_dbm"`
	TxGainDBi             float64            `json:"tx_gain_dbi"`
	SystemLossDB          float64            `json:"system_loss_db"`
	CalibrationOffsetDB   float64            `json:"calibration_offset_db"`
	AntennaHeightM        float64            `json:"antenna_height_m"`
	ReceiverHeightM       float64            `json:"receiver_height_m"`
	HorizontalPatternID   string             `json:"horizontal_pattern_id"`
	VerticalPatternID     string             `json:"vertical_pattern_id"`
	MechanicalDowntiltDeg float64            `json:"mechanical_downtilt_deg"`
	ElectricalDowntiltDeg float64            `json:"electrical_downtilt_deg"`
	BeamWidthDeg          float64            `json:"beam_width_deg"`
	HorizontalOffsetDeg   float64            `json:"horizontal_offset_deg"`
	WallLossDB            float64            `json:"wall_loss_db"`
	Inputs                map[string]float64 `json:"inputs"`
	Expected              map[string]float64 `json:"expected"`
	Tolerance             float64            `json:"tolerance"`
}

type rfReferenceGeometry struct {
	ID                      string                `json:"id"`
	Scenario                string                `json:"scenario"`
	Provenance              string                `json:"provenance"`
	StartM                  []float64             `json:"start_m"`
	EndM                    []float64             `json:"end_m"`
	Buildings               []rfReferenceBuilding `json:"buildings"`
	ExpectedBoundaryEvents  int                   `json:"expected_boundary_events"`
	ExpectedWallLossDB28    float64               `json:"expected_wall_loss_db_28"`
	ExpectedRaySurfaceAgree bool                  `json:"expected_ray_surface_agree"`
}

type rfReferenceBuilding struct {
	ID        string      `json:"id"`
	VerticesM [][]float64 `json:"vertices_m"`
}

type rfReferenceSensitivity struct {
	ID                               string  `json:"id"`
	Scenario                         string  `json:"scenario"`
	VerticalPatternID                string  `json:"vertical_pattern_id"`
	FrequencyGHz                     float64 `json:"frequency_ghz"`
	RadiusM                          float64 `json:"radius_m"`
	ReceiverSensitivityDBm           float64 `json:"receiver_sensitivity_dbm"`
	ExpectedTerminal                 string  `json:"expected_terminal"`
	ExpectedTerminalBelowSensitivity bool    `json:"expected_terminal_below_sensitivity"`
	Provenance                       string  `json:"provenance"`
}

type rfReferenceSurface struct {
	ID                                 string  `json:"id"`
	Scenario                           string  `json:"scenario"`
	ExpectedGridWidth                  int     `json:"expected_grid_width"`
	ExpectedGridHeight                 int     `json:"expected_grid_height"`
	ExpectedCellSizeM                  float64 `json:"expected_cell_size_m"`
	ExpectedRadiusClipping             bool    `json:"expected_radius_clipping"`
	ExpectedValidValueBelowSensitivity bool    `json:"expected_valid_value_below_sensitivity"`
	ExpectedNoInterpolation            bool    `json:"expected_no_interpolation"`
	ExpectedNoDataOutsideBeam          bool    `json:"expected_nodata_outside_beam"`
	ExpectedStatisticsIgnoreNoData     bool    `json:"expected_statistics_ignore_nodata"`
	Provenance                         string  `json:"provenance"`
}

type rfReferenceSampling struct {
	ID                       string  `json:"id"`
	Scenario                 string  `json:"scenario"`
	SampleSpacingM           float64 `json:"sample_spacing_m"`
	BuildingStartM           float64 `json:"building_start_m"`
	BuildingEndM             float64 `json:"building_end_m"`
	OffsetM                  float64 `json:"offset_m"`
	ExpectedBuildingObserved bool    `json:"expected_building_observed"`
	Provenance               string  `json:"provenance"`
}

type rfReferenceReach struct {
	ID                        string  `json:"id"`
	Scenario                  string  `json:"scenario"`
	FrequencyGHz              float64 `json:"frequency_ghz"`
	RadiusM                   float64 `json:"radius_m"`
	Rays                      int     `json:"rays"`
	ExpectedTerminal          string  `json:"expected_terminal"`
	ExpectedTerminalDistanceM float64 `json:"expected_terminal_distance_m"`
	ExpectedCoverageScore     float64 `json:"expected_coverage_score"`
	Provenance                string  `json:"provenance"`
}

func loadRFReferenceCorpus(t *testing.T) rfReferenceCorpus {
	t.Helper()
	var corpus rfReferenceCorpus
	if err := json.Unmarshal(rfReferenceFixtureBytes, &corpus); err != nil {
		t.Fatalf("decode RF reference corpus: %v", err)
	}
	return corpus
}

// REFERENCE MATHEMATICS: these helpers intentionally do not call the
// production equations whose results are asserted below.

func referenceNumericValue(t *testing.T, fixture rfReferenceNumericFixture, key string) float64 {
	t.Helper()
	value, ok := fixture.Expected[key]
	if !ok {
		t.Fatalf("%s is missing expected.%s", fixture.ID, key)
	}
	return value
}

func assertReferenceClose(t *testing.T, fixture rfReferenceNumericFixture, key string, got float64) {
	t.Helper()
	want := referenceNumericValue(t, fixture, key)
	tolerance := fixture.Tolerance
	if tolerance == 0 {
		tolerance = 1e-9
	}
	if math.Abs(got-want) > tolerance {
		t.Fatalf("%s %s = %.9f, want %.9f ± %.9f", fixture.ID, key, got, want, tolerance)
	}
}

func independentReferenceFSPL(distanceM, frequencyGHz float64) float64 {
	if distanceM < 1 {
		distanceM = 1
	}
	return 20*math.Log10(distanceM) + 20*math.Log10(frequencyGHz) + 32.45
}

func independentReferenceSlant(distanceM, antennaHeightM, receiverHeightM float64) float64 {
	return math.Hypot(math.Max(distanceM, 0), antennaHeightM-receiverHeightM)
}

func independentReferencePattern(fixture rfReferenceNumericFixture) float64 {
	horizontal := 0.0
	if fixture.HorizontalPatternID == "cosine-sector" {
		halfBeam := math.Max(fixture.BeamWidthDeg/2, 1)
		horizontal = math.Min(30, 12*math.Pow(math.Abs(fixture.HorizontalOffsetDeg)/halfBeam, 2))
	}
	vertical := 0.0
	verticalWidth := 0.0
	switch fixture.VerticalPatternID {
	case "panel-10deg":
		verticalWidth = 10
	case "panel-20deg":
		verticalWidth = 20
	}
	if verticalWidth > 0 {
		depression := math.Atan2(
			fixture.AntennaHeightM-fixture.ReceiverHeightM,
			math.Max(fixture.DistanceM, 0.1),
		) * 180 / math.Pi
		tilt := fixture.MechanicalDowntiltDeg + fixture.ElectricalDowntiltDeg
		vertical = math.Min(30, 12*math.Pow((depression-tilt)/verticalWidth, 2))
	}
	return horizontal + vertical
}

func independentReferenceLinkBudget(fixture rfReferenceNumericFixture) float64 {
	slant := independentReferenceSlant(fixture.DistanceM, fixture.AntennaHeightM, fixture.ReceiverHeightM)
	eirp := fixture.TxPowerDBm + fixture.TxGainDBi - fixture.SystemLossDB + fixture.CalibrationOffsetDB
	return eirp - independentReferenceFSPL(slant, fixture.FrequencyGHz) - fixture.WallLossDB - independentReferencePattern(fixture)
}

func independentReferenceFresnel(frequencyGHz, distanceM, d1M float64) float64 {
	wavelengthM := 0.299792458 / frequencyGHz
	return math.Sqrt(wavelengthM * d1M * (distanceM - d1M) / distanceM)
}

func independentReferenceKnifeEdge(heightAboveLOSM, distanceFromTxM, distanceToRxM, frequencyGHz float64) float64 {
	if heightAboveLOSM <= 0 || distanceFromTxM <= 0 || distanceToRxM <= 0 || frequencyGHz <= 0 {
		return 0
	}
	wavelengthM := 0.299792458 / frequencyGHz
	v := heightAboveLOSM * math.Sqrt(2*(distanceFromTxM+distanceToRxM)/(wavelengthM*distanceFromTxM*distanceToRxM))
	if v <= -0.78 {
		return 0
	}
	return math.Max(0, 6.9+20*math.Log10(math.Sqrt(math.Pow(v-0.1, 2)+1)+v-0.1))
}

func independentReferenceDBmToMilliwatts(dbm float64) float64 {
	return math.Pow(10, dbm/10)
}

func independentReferenceMilliwattsToDBm(milliwatts float64) float64 {
	if milliwatts <= 0 {
		return math.Inf(-1)
	}
	return 10 * math.Log10(milliwatts)
}

func referenceProfileForFixture(fixture rfReferenceNumericFixture) CellRFProfile {
	frequency := fixture.FrequencyGHz
	if frequency <= 0 {
		frequency = 28
	}
	txPower := fixture.TxPowerDBm
	if txPower == 0 {
		txPower = 30
	}
	radius := fixture.DistanceM
	if radius < MinRadiusMeters {
		radius = 100
	}
	beam := fixture.BeamWidthDeg
	if beam == 0 {
		beam = 120
	}
	profile := DefaultCellRFProfile(NetworkTechnologyForFrequency(frequency), frequency, txPower, radius, beam, 0, 0, 0)
	if fixture.TxGainDBi != 0 {
		profile.AntennaGainDBi = fixture.TxGainDBi
	}
	if fixture.SystemLossDB != 0 {
		profile.SystemLossDB = fixture.SystemLossDB
	}
	if fixture.AntennaHeightM != 0 {
		profile.AntennaHeightM = fixture.AntennaHeightM
	}
	if fixture.ReceiverHeightM != 0 {
		profile.ReceiverHeightM = fixture.ReceiverHeightM
	}
	if fixture.HorizontalPatternID != "" {
		profile.HorizontalPatternID = fixture.HorizontalPatternID
	}
	if fixture.VerticalPatternID != "" {
		profile.VerticalPatternID = fixture.VerticalPatternID
	}
	profile.MechanicalDowntiltDeg = fixture.MechanicalDowntiltDeg
	profile.ElectricalDowntiltDeg = fixture.ElectricalDowntiltDeg
	return profile
}

func TestRFReferenceCorpusIsIndependentAndComplete(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	if corpus.SchemaVersion != RFReferenceCatalogSchemaVersion {
		t.Fatalf("corpus schema version = %d, want %d", corpus.SchemaVersion, RFReferenceCatalogSchemaVersion)
	}
	if corpus.CorpusID == "" || corpus.Description == "" {
		t.Fatal("reference corpus must identify its provenance and purpose")
	}
	for _, key := range []string{"distance", "frequency", "power", "loss", "linear_power", "fspl_constant", "rounding"} {
		if corpus.Conventions[key] == "" {
			t.Fatalf("reference corpus convention %q is missing", key)
		}
	}
	for _, key := range []string{"fspl-metre-ghz", "itu-r-p1411", "itu-r-p1812", "itu-r-p526", "3gpp-tr-38-901"} {
		if corpus.Sources[key] == "" {
			t.Fatalf("reference corpus source %q is missing", key)
		}
	}
	if len(corpus.NumericFixtures) < 40 {
		t.Fatalf("numeric fixture count = %d, want at least 40", len(corpus.NumericFixtures))
	}
	if len(corpus.GeometryContracts) < 8 || len(corpus.Sensitivity) < 4 || len(corpus.ReachContracts) < 3 || len(corpus.SurfaceContracts) < 1 || len(corpus.SamplingContracts) < 4 {
		t.Fatalf("reference behavior corpus is incomplete: geometry=%d sensitivity=%d reach=%d surface=%d sampling=%d", len(corpus.GeometryContracts), len(corpus.Sensitivity), len(corpus.ReachContracts), len(corpus.SurfaceContracts), len(corpus.SamplingContracts))
	}
	categories := map[string]bool{}
	for _, fixture := range corpus.NumericFixtures {
		if fixture.ID == "" || fixture.ReferenceID == "" || fixture.Category == "" || fixture.Provenance == "" {
			t.Fatalf("fixture lacks identity/provenance: %+v", fixture)
		}
		categories[fixture.Category] = true
	}
	for _, geometry := range corpus.GeometryContracts {
		if geometry.ID == "" || geometry.Scenario == "" || geometry.Provenance == "" {
			t.Fatalf("geometry contract lacks identity/provenance: %+v", geometry)
		}
	}
	for _, sensitivity := range corpus.Sensitivity {
		if sensitivity.ID == "" || sensitivity.Scenario == "" || sensitivity.Provenance == "" {
			t.Fatalf("sensitivity contract lacks identity/provenance: %+v", sensitivity)
		}
	}
	for _, reach := range corpus.ReachContracts {
		if reach.ID == "" || reach.Scenario == "" || reach.Provenance == "" || reach.ExpectedTerminalDistanceM <= 0 {
			t.Fatalf("reach contract lacks identity/provenance/distance: %+v", reach)
		}
	}
	for _, surface := range corpus.SurfaceContracts {
		if surface.ID == "" || surface.Scenario == "" || surface.Provenance == "" || surface.ExpectedGridWidth <= 0 || surface.ExpectedGridHeight <= 0 || surface.ExpectedCellSizeM <= 0 {
			t.Fatalf("surface contract lacks identity/provenance: %+v", surface)
		}
	}
	samplingSpacings := map[float64]bool{}
	hasGrazingSampling := false
	for _, sampling := range corpus.SamplingContracts {
		if sampling.ID == "" || sampling.Scenario == "" || sampling.Provenance == "" {
			t.Fatalf("sampling contract lacks identity/provenance: %+v", sampling)
		}
		samplingSpacings[sampling.SampleSpacingM] = true
		hasGrazingSampling = hasGrazingSampling || sampling.Scenario == "path_profile_sampling_grazing"
	}
	if len(samplingSpacings) < 2 || !hasGrazingSampling {
		t.Fatalf("sampling corpus must include varying spacing and a grazing path: spacings=%v grazing=%v", samplingSpacings, hasGrazingSampling)
	}
	for _, category := range []string{"fspl", "link_budget", "antenna", "beam_eligibility", "interference", "fresnel", "knife_edge"} {
		if !categories[category] {
			t.Fatalf("reference corpus lacks %s fixtures", category)
		}
	}
}

// APPLICABILITY: scope and prerequisite decisions are explicit results.

func TestRFReferenceApplicabilityCatalog(t *testing.T) {
	catalog := RFReferenceApplicabilityCatalog()
	if len(catalog) != 6 {
		t.Fatalf("reference catalog count = %d, want 6", len(catalog))
	}
	for _, reference := range catalog {
		if reference.ID == "" || reference.ModelFamily == "" || reference.Revision == "" || reference.Scenario == "" || reference.PathLengthNote == "" || reference.Status == "" {
			t.Fatalf("incomplete applicability metadata: %+v", reference)
		}
	}
	p1411, ok := RFReferenceApplicabilityByID("itu-r-p1411")
	if !ok || p1411.Revision != "P.1411-13 (2025-09)" {
		t.Fatalf("P.1411 catalog entry = %+v", p1411)
	}
	if profile := PathModelApplicability("urban-short-range", 28); profile.Reference != "ITU-R P.1411-13" {
		t.Fatalf("runtime P.1411 reference = %q", profile.Reference)
	}
	if profile := PathModelApplicability("terrain-profile", 2.6); profile.Reference != "ITU-R P.1812-8" {
		t.Fatalf("runtime P.1812 reference = %q", profile.Reference)
	}
	applicable := CheckRFReferenceApplicability(p1411, RFReferenceApplicabilityInput{
		FrequencyGHz: 28, DistanceM: 100, Scenario: "urban-short-range",
		BuildingDataAvailable: true, LOSOrNLOSKnown: true,
	})
	if !applicable.Applicable || applicable.Reason != RFReferenceReasonApplicable {
		t.Fatalf("P.1411 applicable result = %+v", applicable)
	}
	missingBuilding := CheckRFReferenceApplicability(p1411, RFReferenceApplicabilityInput{
		FrequencyGHz: 28, DistanceM: 100, Scenario: "urban-short-range",
		LOSOrNLOSKnown: true,
	})
	if missingBuilding.Applicable || missingBuilding.Reason != RFReferenceReasonRequiredBuildingDataMissing {
		t.Fatalf("P.1411 missing-building result = %+v", missingBuilding)
	}
	missingLOS := CheckRFReferenceApplicability(p1411, RFReferenceApplicabilityInput{
		FrequencyGHz: 28, DistanceM: 100, Scenario: "urban-short-range",
		BuildingDataAvailable: true,
	})
	if missingLOS.Applicable || missingLOS.Reason != RFReferenceReasonRequiredLOSOrNLOSMissing {
		t.Fatalf("P.1411 missing-LOS result = %+v", missingLOS)
	}
	outOfFrequency := CheckRFReferenceApplicability(p1411, RFReferenceApplicabilityInput{
		FrequencyGHz: 0.2, DistanceM: 100, Scenario: "urban-short-range",
		BuildingDataAvailable: true, LOSOrNLOSKnown: true,
	})
	if outOfFrequency.Applicable || outOfFrequency.Reason != RFReferenceReasonFrequencyOutOfRange {
		t.Fatalf("P.1411 frequency result = %+v", outOfFrequency)
	}

	p1812, _ := RFReferenceApplicabilityByID("itu-r-p1812")
	missingTerrain := CheckRFReferenceApplicability(p1812, RFReferenceApplicabilityInput{
		FrequencyGHz: 2.6, DistanceM: 1000, Scenario: "terrain-profile", LOSOrNLOSKnown: true,
	})
	if missingTerrain.Applicable || missingTerrain.Reason != RFReferenceReasonRequiredTerrainMissing {
		t.Fatalf("P.1812 terrain result = %+v", missingTerrain)
	}
	outOfDistance := CheckRFReferenceApplicability(p1812, RFReferenceApplicabilityInput{
		FrequencyGHz: 2.6, DistanceM: 100, Scenario: "terrain-profile", TerrainAvailable: true, LOSOrNLOSKnown: true,
	})
	if outOfDistance.Applicable || outOfDistance.Reason != RFReferenceReasonDistanceOutOfRange {
		t.Fatalf("P.1812 distance result = %+v", outOfDistance)
	}
	p1812Applicable := CheckRFReferenceApplicability(p1812, RFReferenceApplicabilityInput{
		FrequencyGHz: 2.6, DistanceM: 1000, Scenario: "terrain-profile", TerrainAvailable: true, LOSOrNLOSKnown: true,
	})
	if !p1812Applicable.Applicable {
		t.Fatalf("P.1812 applicable result = %+v", p1812Applicable)
	}

	p526, _ := RFReferenceApplicabilityByID("itu-r-p526")
	p526Result := CheckRFReferenceApplicability(p526, RFReferenceApplicabilityInput{
		FrequencyGHz: 28, DistanceM: 100, Scenario: "diffraction-obstacle", LOSOrNLOSKnown: true,
	})
	if !p526Result.Applicable {
		t.Fatalf("P.526 applicable result = %+v", p526Result)
	}
	wrongScenario := CheckRFReferenceApplicability(p526, RFReferenceApplicabilityInput{
		FrequencyGHz: 28, DistanceM: 100, Scenario: "urban-short-range", LOSOrNLOSKnown: true,
	})
	if wrongScenario.Applicable || wrongScenario.Reason != RFReferenceReasonUnsupportedEnvironment {
		t.Fatalf("P.526 scenario result = %+v", wrongScenario)
	}

	threeGPP, _ := RFReferenceApplicabilityByID("3gpp-tr-38-901")
	if got := CheckRFReferenceApplicability(threeGPP, RFReferenceApplicabilityInput{
		FrequencyGHz: 140, DistanceM: 100, Scenario: "3gpp-channel-evaluation", LOSOrNLOSKnown: true,
	}); got.Reason != RFReferenceReasonFrequencyOutOfRange {
		t.Fatalf("3GPP out-of-range result = %+v", got)
	}
	research, _ := RFReferenceApplicabilityByID("atom-research-sub-thz")
	if got := CheckRFReferenceApplicability(research, RFReferenceApplicabilityInput{
		FrequencyGHz: 140, DistanceM: 100, Scenario: "research-sub-thz",
	}); got.Applicable || got.Reason != RFReferenceReasonResearchProfileOnly {
		t.Fatalf("research result = %+v", got)
	}
}

func TestRFTechnologyEndpointCapabilityMatrix(t *testing.T) {
	matrix := RFTechnologyEndpointCapabilityMatrix()
	if len(matrix) != 36 {
		t.Fatalf("capability matrix count = %d, want 36", len(matrix))
	}
	endpoints := map[string]bool{}
	pairs := map[string]bool{}
	for _, capability := range matrix {
		endpoints[capability.Endpoint] = true
		if capability.Technology == "" || capability.FrequencyGHz <= 0 || capability.Status == "" || capability.Reason == "" || capability.Note == "" {
			t.Fatalf("incomplete capability entry: %+v", capability)
		}
		key := capability.Technology + "|" + capability.Endpoint
		if pairs[key] {
			t.Fatalf("duplicate capability entry: %s", key)
		}
		pairs[key] = true
		if capability.Technology != "6g" && capability.Status != RFEndpointSupported {
			t.Fatalf("non-6G capability is not supported: %+v", capability)
		}
		expectedFrequency := map[string]float64{"4g": 2.6, "5g": 28, "6g": 140}[capability.Technology]
		if capability.FrequencyGHz != expectedFrequency {
			t.Fatalf("%s frequency = %.1f, want %.1f", key, capability.FrequencyGHz, expectedFrequency)
		}
	}
	if len(endpoints) != 12 {
		t.Fatalf("capability endpoint count = %d, want 12", len(endpoints))
	}
	for _, endpoint := range []string{"/api/simulate", "/api/coverage-surface", "/api/evaluate-network"} {
		capability, ok := RFTechnologyEndpointCapabilityFor("6G", endpoint)
		if !ok || capability.Status != RFEndpointSupported {
			t.Fatalf("6G %s capability = %+v, found=%v", endpoint, capability, ok)
		}
	}
	for _, endpoint := range []string{"/api/interference", "/api/measurements/evaluate", "/api/recommend-sites"} {
		capability, ok := RFTechnologyEndpointCapabilityFor("6g", endpoint)
		if !ok || capability.Status != RFEndpointUnsupported {
			t.Fatalf("6G %s capability = %+v, found=%v", endpoint, capability, ok)
		}
	}
	if capability, ok := RFTechnologyEndpointCapabilityFor("6g", "/api/path-profile"); !ok || capability.Status != RFEndpointResearchOnly {
		t.Fatalf("6G path profile capability = %+v, found=%v", capability, ok)
	}
}

func TestRFReferenceNumericFixtures(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	for _, fixture := range corpus.NumericFixtures {
		t.Run(fixture.ID, func(t *testing.T) {
			switch fixture.Category {
			case "fspl":
				independent := independentReferenceFSPL(fixture.DistanceM, fixture.FrequencyGHz)
				assertReferenceClose(t, fixture, "fspl_db", independent)
				assertReferenceClose(t, fixture, "fspl_db", FreeSpacePathLossMetersGHz(fixture.DistanceM, fixture.FrequencyGHz))
			case "link_budget":
				independent := independentReferenceLinkBudget(fixture)
				slant := independentReferenceSlant(fixture.DistanceM, fixture.AntennaHeightM, fixture.ReceiverHeightM)
				assertReferenceClose(t, fixture, "slant_distance_m", slant)
				assertReferenceClose(t, fixture, "fspl_db", independentReferenceFSPL(slant, fixture.FrequencyGHz))
				assertReferenceClose(t, fixture, "pattern_db", independentReferencePattern(fixture))
				assertReferenceClose(t, fixture, "eirp_dbm", fixture.TxPowerDBm+fixture.TxGainDBi-fixture.SystemLossDB+fixture.CalibrationOffsetDB)
				assertReferenceClose(t, fixture, "wall_loss_db", fixture.WallLossDB)
				assertReferenceClose(t, fixture, "received_power_dbm", independent)
				profile := referenceProfileForFixture(fixture)
				got := profile.ReceivedPowerDBm(fixture.DistanceM, fixture.WallLossDB, fixture.CalibrationOffsetDB, fixture.HorizontalOffsetDeg)
				assertReferenceClose(t, fixture, "received_power_dbm", got)
			case "antenna":
				independent := independentReferencePattern(fixture)
				assertReferenceClose(t, fixture, "pattern_db", independent)
				profile := referenceProfileForFixture(fixture)
				assertReferenceClose(t, fixture, "pattern_db", profile.PatternAttenuationDB(fixture.DistanceM, fixture.HorizontalOffsetDeg))
			case "beam_eligibility":
				got := 0.0
				if AngleInBeam(fixture.HorizontalOffsetDeg, 0, fixture.BeamWidthDeg) {
					got = 1
				}
				assertReferenceClose(t, fixture, "in_beam", got)
			case "interference":
				switch fixture.ID {
				case "interference-db-to-mw-minus80":
					got := independentReferenceDBmToMilliwatts(fixture.Inputs["dbm"])
					assertReferenceClose(t, fixture, "milliwatts", got)
					assertReferenceClose(t, fixture, "milliwatts", DBmToMilliwatts(fixture.Inputs["dbm"]))
				case "interference-mw-to-db-minus80":
					got := independentReferenceMilliwattsToDBm(fixture.Inputs["milliwatts"])
					assertReferenceClose(t, fixture, "dbm", got)
					assertReferenceClose(t, fixture, "dbm", MilliwattsToDBm(fixture.Inputs["milliwatts"]))
				case "interference-sum-minus80-minus83":
					got := independentReferenceMilliwattsToDBm(independentReferenceDBmToMilliwatts(fixture.Inputs["a_dbm"]) + independentReferenceDBmToMilliwatts(fixture.Inputs["b_dbm"]))
					assertReferenceClose(t, fixture, "sum_dbm", got)
					assertReferenceClose(t, fixture, "sum_dbm", MilliwattsToDBm(DBmToMilliwatts(fixture.Inputs["a_dbm"])+DBmToMilliwatts(fixture.Inputs["b_dbm"])))
				case "interference-noise-15khz-nf7", "interference-noise-120khz-nf7":
					scs := fixture.Inputs["scs_khz"]
					nf := fixture.Inputs["noise_figure_db"]
					independent := -174 + 10*math.Log10(scs*1000) + nf
					assertReferenceClose(t, fixture, "noise_dbm", independent)
					assertReferenceClose(t, fixture, "noise_dbm", ThermalNoisePerREDBm(scs, nf))
				case "interference-rsrp-offset-rb100":
					independent := fixture.Inputs["carrier_dbm"] - 10*math.Log10(12*fixture.Inputs["resource_blocks"])
					assertReferenceClose(t, fixture, "rsrp_dbm", independent)
				case "interference-loaded-equal-power":
					independent := independentReferenceMilliwattsToDBm(independentReferenceDBmToMilliwatts(fixture.Inputs["interferer_dbm"]) * fixture.Inputs["load_factor"])
					assertReferenceClose(t, fixture, "interference_dbm", independent)
				case "interference-multiple-loaded":
					interference := independentReferenceDBmToMilliwatts(fixture.Inputs["a_dbm"])*fixture.Inputs["a_load"] +
						independentReferenceDBmToMilliwatts(fixture.Inputs["b_dbm"])*fixture.Inputs["b_load"]
					assertReferenceClose(t, fixture, "interference_dbm", independentReferenceMilliwattsToDBm(interference))
				case "interference-sinr-equal-loaded":
					serving := independentReferenceDBmToMilliwatts(fixture.Inputs["serving_dbm"])
					interference := independentReferenceDBmToMilliwatts(fixture.Inputs["interference_dbm"])
					noise := independentReferenceDBmToMilliwatts(fixture.Inputs["noise_dbm"])
					independent := 10 * math.Log10(serving/(noise+interference))
					assertReferenceClose(t, fixture, "sinr_db", independent)
				case "interference-no-interferer":
					serving := independentReferenceDBmToMilliwatts(fixture.Inputs["serving_dbm"])
					noise := independentReferenceDBmToMilliwatts(fixture.Inputs["noise_dbm"])
					resourceBlocks := fixture.Inputs["resource_blocks"]
					assertReferenceClose(t, fixture, "interference_mw", 0)
					assertReferenceClose(t, fixture, "sinr_db", 10*math.Log10(serving/noise))
					rssi := 12 * resourceBlocks * (serving + noise)
					assertReferenceClose(t, fixture, "rssi_dbm", independentReferenceMilliwattsToDBm(rssi))
					assertReferenceClose(t, fixture, "rsrq_db", 10*math.Log10(resourceBlocks*serving/rssi))
				case "interference-channel-mismatch":
					if fixture.Inputs["same_channel"] != 0 {
						t.Fatalf("channel mismatch fixture is not marked as mismatched")
					}
					assertReferenceClose(t, fixture, "interference_mw", 0)
				default:
					t.Fatalf("unhandled interference fixture")
				}
			case "fresnel":
				independent := independentReferenceFresnel(fixture.FrequencyGHz, fixture.DistanceM, fixture.Inputs["d1_m"])
				assertReferenceClose(t, fixture, "radius_m", independent)
			case "fresnel_clearance":
				assertReferenceClose(t, fixture, "ratio", fixture.Inputs["clearance_m"]/fixture.Inputs["radius_m"])
			case "knife_edge":
				independent := independentReferenceKnifeEdge(
					fixture.Inputs["height_above_los_m"],
					fixture.Inputs["distance_from_tx_m"],
					fixture.Inputs["distance_to_rx_m"],
					fixture.FrequencyGHz,
				)
				assertReferenceClose(t, fixture, "loss_db", independent)
				assertReferenceClose(t, fixture, "loss_db", KnifeEdgeLossDB(
					fixture.Inputs["height_above_los_m"],
					fixture.Inputs["distance_from_tx_m"],
					fixture.Inputs["distance_to_rx_m"],
					fixture.FrequencyGHz,
				))
			default:
				t.Fatalf("unhandled numeric fixture category %q", fixture.Category)
			}
		})
	}
}

func TestRFReferenceFresnelFixturesReachPathProfileRuntime(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	origin := Point{Lon: 32, Lat: 39}
	receiver := DestinationPoint(origin, 90, 100)
	for _, fixture := range corpus.NumericFixtures {
		if fixture.Category != "fresnel" {
			continue
		}
		profile := DefaultCellRFProfile(NetworkTechnologyForFrequency(fixture.FrequencyGHz), fixture.FrequencyGHz, 30, 100, 120, 0, 0, 0)
		sampleSpacing := fixture.Inputs["d1_m"]
		if sampleSpacing < MinPathSampleSpacingM {
			sampleSpacing = 50
		}
		request := PathProfileRequest{
			Transmitter: origin, Receiver: receiver, SampleSpacingM: sampleSpacing,
			ModelProfile: DefaultPathModelProfile(fixture.FrequencyGHz), AzimuthDeg: 90,
			RFProfile: profile,
			Fidelity:  PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
		}
		response, err := AnalyzePathProfileContext(context.Background(), request, nil, EmptyBuildingIndex())
		if err != nil {
			t.Fatalf("%s path profile: %v", fixture.ID, err)
		}
		if response.RFContract.ModelID != DiagnosticPathModelID || response.RFContract.EndpointScope == canonicalRFContract(nil, 0).EndpointScope || !response.RFContract.UsesTerrain || !response.RFContract.UsesDiffraction {
			t.Fatalf("%s path-profile RF contract = %+v", fixture.ID, response.RFContract)
		}
		if len(response.Samples) < 3 {
			t.Fatalf("%s sample count = %d, want midpoint sample", fixture.ID, len(response.Samples))
		}
		want := referenceNumericValue(t, fixture, "radius_m")
		if got := response.Samples[1].FresnelRadiusM; math.Abs(got-want) > 0.06 {
			t.Errorf("%s runtime midpoint Fresnel radius = %.3f, want %.6f", fixture.ID, got, want)
		}
	}
}

func referencePoint(origin Point, coordinatesM []float64) Point {
	cosLat := math.Cos(origin.Lat * math.Pi / 180)
	return Point{
		Lon: origin.Lon + coordinatesM[0]/(111_320*math.Max(1e-9, cosLat)),
		Lat: origin.Lat + coordinatesM[1]/111_320,
	}
}

func referenceGeometryIndex(t *testing.T, origin Point, geometry rfReferenceGeometry) *BuildingIndex {
	t.Helper()
	footprints := make([]*BuildingFootprint, 0, len(geometry.Buildings))
	for _, referenceBuilding := range geometry.Buildings {
		vertices := make([]Point, 0, len(referenceBuilding.VerticesM))
		for _, coordinates := range referenceBuilding.VerticesM {
			if len(coordinates) != 2 {
				t.Fatalf("%s building %s has invalid meter coordinates", geometry.ID, referenceBuilding.ID)
			}
			vertices = append(vertices, referencePoint(origin, coordinates))
		}
		bounds, ok := BoundsFromPoints(vertices)
		if !ok {
			t.Fatalf("%s building %s has invalid bounds", geometry.ID, referenceBuilding.ID)
		}
		footprints = append(footprints, &BuildingFootprint{
			ID: referenceBuilding.ID, HeightMeters: 9, Material: "concrete",
			Bounds: bounds, Vertices: vertices,
		})
	}
	return NewBuildingIndex(footprints)
}

// IMPLEMENTATION CONTRACTS: these tests record current A.T.O.M behavior and
// deliberately do not promote it to a physical-model or standards claim.

func TestRFReferenceGeometryContracts(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	origin := Point{Lon: 32, Lat: 39}
	for _, geometry := range corpus.GeometryContracts {
		t.Run(geometry.ID, func(t *testing.T) {
			index := referenceGeometryIndex(t, origin, geometry)
			start := referencePoint(origin, geometry.StartM)
			end := referencePoint(origin, geometry.EndM)
			intersections, _, err := wallIntersectionsForSegmentContext(context.Background(), origin, start, end, index)
			if err != nil {
				t.Fatalf("wall intersection search: %v", err)
			}
			if len(intersections) != geometry.ExpectedBoundaryEvents {
				t.Fatalf("boundary events = %d, want %d (%+v)", len(intersections), geometry.ExpectedBoundaryEvents, intersections)
			}
			for i := 1; i < len(intersections); i++ {
				if intersections[i].distanceMeters < intersections[i-1].distanceMeters {
					t.Fatalf("boundary events are not ordered: %+v", intersections)
				}
			}
			gotWallLoss := float64(len(intersections)) * PenetrationLossForFrequencyGHz(28)
			if math.Abs(gotWallLoss-geometry.ExpectedWallLossDB28) > 1e-9 {
				t.Fatalf("wall loss = %.1f dB, want %.1f dB", gotWallLoss, geometry.ExpectedWallLossDB28)
			}
		})
	}
}

func TestRFReferenceRayAndSurfaceAgreementContracts(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	origin := Point{Lon: 32, Lat: 39}
	for _, geometry := range corpus.GeometryContracts {
		if !geometry.ExpectedRaySurfaceAgree {
			continue
		}
		t.Run(geometry.ID, func(t *testing.T) {
			index := referenceGeometryIndex(t, origin, geometry)
			profile := DefaultCellRFProfile("5g", 28, 30, 100, 120, 0, 0, 0)
			simulation := StaticSimulationRequest{
				TowerLon: origin.Lon, TowerLat: origin.Lat, Rays: 8, RadiusMeters: 100,
				FrequencyGHz: 28, TxPowerDBm: 30, AzimuthDeg: 90, BeamWidthDeg: 120, RFProfile: profile,
			}
			terminal, err := simulateRayTerminalContext(context.Background(), origin, 0, 90, simulation, index)
			if err != nil {
				t.Fatalf("simulate reference ray: %v", err)
			}
			surface, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
				Simulation: simulation, CellSizeMeters: 25, ThresholdsDBm: []float64{-100},
			}, index)
			if err != nil {
				t.Fatalf("generate reference surface: %v", err)
			}
			row := surface.Grid.Height / 2
			column := surface.Grid.Width - 1
			surfaceValue := surface.Grid.Values[row*surface.Grid.Width+column]
			if surfaceValue == surface.Grid.NoDataValue {
				t.Fatal("east grid center is NoData")
			}
			if math.Abs(surfaceValue-terminal.signalDBm) > 0.06 {
				t.Fatalf("surface east value = %.3f dBm, ray terminal = %.3f dBm", surfaceValue, terminal.signalDBm)
			}
		})
	}
}

func referenceStaticRequest(profile CellRFProfile) StaticSimulationRequest {
	return StaticSimulationRequest{
		TowerLon: 32, TowerLat: 39, Rays: 8, RadiusMeters: profile.RadiusMeters,
		FrequencyGHz: profile.FrequencyGHz, TxPowerDBm: profile.TxPowerDBm,
		AzimuthDeg: 90, BeamWidthDeg: profile.BeamWidthDeg, RFProfile: profile,
	}
}

func TestRFReferenceSensitivityContracts(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	origin := Point{Lon: 32, Lat: 39}
	for _, contract := range corpus.Sensitivity {
		t.Run(contract.ID, func(t *testing.T) {
			profile := DefaultCellRFProfile("5g", contract.FrequencyGHz, 30, contract.RadiusM, 120, 0, 0, 0)
			profile.VerticalPatternID = contract.VerticalPatternID
			profile.ReceiverSensitivityDBm = contract.ReceiverSensitivityDBm
			buildings := EmptyBuildingIndex()
			if contract.Scenario == "wall_path" {
				var geometry rfReferenceGeometry
				for _, candidate := range corpus.GeometryContracts {
					if candidate.Scenario == "two_buildings" {
						geometry = candidate
						break
					}
				}
				buildings = referenceGeometryIndex(t, origin, geometry)
			}
			request := referenceStaticRequest(profile)
			terminal, err := simulateRayTerminalContext(context.Background(), origin, 0, 90, request, buildings)
			if err != nil {
				t.Fatalf("simulate sensitivity contract: %v", err)
			}
			switch contract.ExpectedTerminal {
			case "sensitivity":
				if terminal.distanceMeters >= profile.RadiusMeters || terminal.signalDBm > profile.ReceiverSensitivityDBm+0.01 || terminal.blocked {
					t.Fatalf("sensitivity terminal = %+v", terminal)
				}
			case "radius":
				if math.Abs(terminal.distanceMeters-profile.RadiusMeters) > 0.01 {
					t.Fatalf("radius terminal distance = %.3f, want %.3f", terminal.distanceMeters, profile.RadiusMeters)
				}
				if contract.ExpectedTerminalBelowSensitivity && terminal.signalDBm >= profile.ReceiverSensitivityDBm {
					t.Fatalf("panel terminal signal = %.3f, want below %.3f", terminal.signalDBm, profile.ReceiverSensitivityDBm)
				}
				if !contract.ExpectedTerminalBelowSensitivity && terminal.signalDBm <= profile.ReceiverSensitivityDBm {
					t.Fatalf("clear terminal signal = %.3f, want above %.3f", terminal.signalDBm, profile.ReceiverSensitivityDBm)
				}
			case "wall_or_sensitivity":
				if terminal.distanceMeters >= profile.RadiusMeters || !terminal.blocked {
					t.Fatalf("wall terminal = %+v", terminal)
				}
			case "network_threshold_minus_100_dbm":
				if CoveredBuildingThresholdDBm != -100 {
					t.Fatalf("network served-building threshold = %.1f, want -100", CoveredBuildingThresholdDBm)
				}
			default:
				t.Fatalf("unhandled terminal contract %q", contract.ExpectedTerminal)
			}
		})
	}
}

func TestRFReferenceThresholdNamesRemainSeparate(t *testing.T) {
	const receiverSensitivityDBm float64 = DefaultReceiverSensitivityDBm
	const buildingServiceThresholdDBm float64 = CoveredBuildingThresholdDBm
	const interferenceRSRPThresholdDBm float64 = InterferenceRSRPThresholdDBm
	if receiverSensitivityDBm != -115 {
		t.Fatalf("profile receiverSensitivityDBm = %.1f, want -115", receiverSensitivityDBm)
	}
	if buildingServiceThresholdDBm != -100 {
		t.Fatalf("buildingServiceThresholdDBm = %.1f, want -100", buildingServiceThresholdDBm)
	}
	if interferenceRSRPThresholdDBm != -110 {
		t.Fatalf("interferenceRSRPThresholdDBm = %.1f, want -110", interferenceRSRPThresholdDBm)
	}
	if InterferenceSINRThresholdDB != 0 || InterferenceRSRQThresholdDB != -20 {
		t.Fatalf("interference thresholds changed: SINR=%.1f RSRQ=%.1f", InterferenceSINRThresholdDB, InterferenceRSRQThresholdDB)
	}
}

func TestCanonicalRFContractAndLinkBudgetTerms(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	profile.HorizontalPatternID = "cosine-sector"
	profile.VerticalPatternID = "panel-10deg"
	terms := profile.LinkBudgetTerms(100, 30, 2, 15)

	if math.Abs(terms.PatternAttenuationDB-(terms.HorizontalPatternAttenuationDB+terms.VerticalPatternAttenuationDB)) > 1e-9 {
		t.Fatalf("combined pattern attenuation = %.9f, components = %.9f + %.9f", terms.PatternAttenuationDB, terms.HorizontalPatternAttenuationDB, terms.VerticalPatternAttenuationDB)
	}
	wantReceived := terms.EIRPDBm - terms.FSPLDB - terms.BuildingLossDB - terms.PatternAttenuationDB
	if math.Abs(terms.ReceivedPowerDBm-wantReceived) > 1e-9 {
		t.Fatalf("link budget received power = %.9f, want %.9f", terms.ReceivedPowerDBm, wantReceived)
	}
	if math.Abs(profile.ReceivedPowerDBm(100, 30, 2, 15)-terms.ReceivedPowerDBm) > 1e-9 {
		t.Fatal("authoritative profile received-power helper diverged from inspectable link-budget terms")
	}
	if math.Abs(profile.ReceivedPowerDBm(100, 0, 2, 15)-profile.ReceivedPowerDBm(100, 0, 0, 15)-2) > 1e-9 {
		t.Fatal("positive calibration offset did not raise received power by the same dB amount")
	}

	contract := canonicalRFContract(&profile, 2)
	if contract.ModelID != CanonicalRFModelID || contract.ModelDescription != CanonicalRFModelDescription || !contract.Deterministic {
		t.Fatalf("canonical RF contract identity = %+v", contract)
	}
	if contract.UsesTerrain || contract.UsesBuildingHeight || contract.UsesDiffraction || contract.UsesReflection {
		t.Fatalf("canonical RF contract claims excluded physics: %+v", contract)
	}
	if contract.BuildingServiceThresholdDBm != BuildingServiceThresholdDBm || contract.InterferenceRSRPThresholdDBm != InterferenceRSRPThresholdDBm {
		t.Fatalf("contract thresholds = %+v", contract)
	}
	if contract.CalibrationOffsetDB != 2 || contract.CalibrationDefinition != CanonicalCalibrationDefinition {
		t.Fatalf("contract calibration = %+v", contract)
	}

	diagnostic := diagnosticRFContract(&profile, 2)
	if diagnostic.ModelID == contract.ModelID || diagnostic.EndpointScope == contract.EndpointScope || !diagnostic.UsesTerrain || !diagnostic.UsesDiffraction {
		t.Fatalf("diagnostic contract is not isolated: canonical=%+v diagnostic=%+v", contract, diagnostic)
	}
}

func TestEffectiveRFProfilesExposeDefaultsAndOverrides(t *testing.T) {
	root := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	override := root
	override.SchemaVersion = RFProfileSchemaVersion
	override.ReceiverSensitivityDBm = -96
	override.RadiusMeters = 250
	req := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "default-cell", TowerLon: 32, TowerLat: 39, AzimuthDeg: 370},
			{ID: "override-cell", TowerLon: 32.001, TowerLat: 39.001, AzimuthDeg: -10, RFProfile: override},
		},
		Rays: 32, RadiusMeters: 400, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120, RFProfile: root,
	}
	NormalizeNetworkOptimizationRequest(&req)
	defaults := networkRequestDefaults(req)
	profiles := effectiveCellRFProfiles(req, []float64{15, 25})
	if defaults.Rays != 32 || defaults.RadiusMeters != 400 || defaults.RFProfile.ReceiverSensitivityDBm != root.ReceiverSensitivityDBm {
		t.Fatalf("request defaults = %+v", defaults)
	}
	if len(profiles) != 2 || profiles[0].RFProfile.ReceiverSensitivityDBm != root.ReceiverSensitivityDBm || profiles[1].RFProfile.ReceiverSensitivityDBm != -96 || profiles[1].RFProfile.RadiusMeters != 250 {
		t.Fatalf("effective profiles = %+v", profiles)
	}
	if profiles[0].AzimuthDeg != 15 || profiles[1].AzimuthDeg != 25 {
		t.Fatalf("effective azimuths = %+v", profiles)
	}

	interference := InterferenceRequest{
		NetworkTech: "5g", Towers: []InterferenceTowerRequest{
			{ID: "cell-a", TowerLon: 32, TowerLat: 39},
			{ID: "cell-b", TowerLon: 32.001, TowerLat: 39.001, RFProfile: override},
		}, RadiusMeters: 400, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
		BandwidthMHz: 100, LoadFactor: 0.7, ReuseFactor: 1, NoiseFigureDB: 7,
	}
	NormalizeInterferenceRequest(&interference)
	interferenceProfiles := effectiveInterferenceCellRFProfiles(interference)
	if len(interferenceProfiles) != 2 || interferenceProfiles[0].RFProfile.ReceiverSensitivityDBm != root.ReceiverSensitivityDBm || interferenceProfiles[1].RFProfile.ReceiverSensitivityDBm != -96 {
		t.Fatalf("effective interference profiles = %+v", interferenceProfiles)
	}
}

// REGRESSION: representation labels and user-facing score semantics must not
// regress while the raw compatibility aggregate remains unchanged.

func TestNetworkScoreRepresentationsStayDistinct(t *testing.T) {
	const rawNetworkScore = 6567105.4
	stats := NetworkOptimizationStats{
		NetworkScore: rawNetworkScore,
		RawMetrics: OptimizationRawMetrics{
			ServedWeightedDemand: 480, TotalWeightedDemand: 1420,
			ResidentialCovered: 15, ResidentialTotal: 465,
			CoverageReachScore: 24605.4, CoverageReachMaximum: 43200,
			CoveredUnits: 67, OverlapBuildings: 5,
		},
	}
	config := OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 40}, {ID: "residential", Weight: 20},
		{ID: "coverage", Weight: 30}, {ID: "overlap", Weight: 10},
	}}
	scored, err := scoreNetworkOptimization(stats, config)
	if err != nil {
		t.Fatalf("score canonical representation: %v", err)
	}
	if scored.NetworkScore != rawNetworkScore {
		t.Fatalf("raw network score = %.1f, want %.1f", scored.NetworkScore, rawNetworkScore)
	}
	expectedComposite := (480.0/1420)*0.4 + (15.0/465)*0.2 + (24605.4/43200)*0.3 + (1-5.0/67)*0.1
	if math.Abs(scored.CompositeScore-expectedComposite) > 1e-9 || math.Abs(scored.Score-expectedComposite*100) > 1e-7 {
		t.Fatalf("normalized score = %.9f / %.6f, want %.9f / %.6f", scored.CompositeScore, scored.Score, expectedComposite, expectedComposite*100)
	}
	if scored.Score <= 0 || scored.Score >= 100 {
		t.Fatalf("normalized score is outside 0-100: %.6f", scored.Score)
	}
}

func TestRFReferenceReachContracts(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	origin := Point{Lon: 32, Lat: 39}
	for _, contract := range corpus.ReachContracts {
		t.Run(contract.ID, func(t *testing.T) {
			profile := DefaultCellRFProfile("5g", contract.FrequencyGHz, 30, contract.RadiusM, 120, 0, 0, 0)
			request := StaticSimulationRequest{
				TowerLon: origin.Lon, TowerLat: origin.Lat, Rays: contract.Rays,
				RadiusMeters: contract.RadiusM, FrequencyGHz: contract.FrequencyGHz,
				TxPowerDBm: 30, AzimuthDeg: 90, BeamWidthDeg: 120, RFProfile: profile,
			}
			breakdown, err := CoverageAreaScoreBreakdownContext(context.Background(), origin, request, EmptyBuildingIndex())
			if err != nil {
				t.Fatalf("calculate reach contract: %v", err)
			}
			if math.Abs(breakdown.CoverageScore-contract.ExpectedCoverageScore) > 0.01 {
				t.Fatalf("coverage reach score = %.3f, want %.3f", breakdown.CoverageScore, contract.ExpectedCoverageScore)
			}
			terminal, err := simulateRayTerminalContext(context.Background(), origin, 0, 90, request, EmptyBuildingIndex())
			if err != nil {
				t.Fatalf("calculate terminal reach: %v", err)
			}
			if math.Abs(terminal.distanceMeters-contract.ExpectedTerminalDistanceM) > 0.01 {
				t.Fatalf("terminal geometric distance = %.3f, want %.3f", terminal.distanceMeters, contract.ExpectedTerminalDistanceM)
			}
			if contract.ExpectedTerminal == "radius" && breakdown.CoverageScore != float64(contract.Rays)*CoverageTieBreakerPerRay && contract.RadiusM <= CoverageTieBreakerMaxMeters {
				t.Fatalf("clear radius reach score = %.3f, want one capped contribution per ray", breakdown.CoverageScore)
			}
		})
	}
}

func TestRFReferenceSurfaceContracts(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	for _, contract := range corpus.SurfaceContracts {
		t.Run(contract.ID, func(t *testing.T) {
			profile := DefaultCellRFProfile("5g", 28, 30, 100, 120, 0, 0, 0)
			profile.ReceiverSensitivityDBm = -10
			simulation := referenceStaticRequest(profile)
			surface, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
				Simulation: simulation, CellSizeMeters: 25, ThresholdsDBm: []float64{-100, -50},
			}, EmptyBuildingIndex())
			if err != nil {
				t.Fatalf("generate surface: %v", err)
			}
			if surface.Grid.Width != contract.ExpectedGridWidth || surface.Grid.Height != contract.ExpectedGridHeight {
				t.Fatalf("surface grid = %dx%d, want %dx%d", surface.Grid.Width, surface.Grid.Height, contract.ExpectedGridWidth, contract.ExpectedGridHeight)
			}
			if surface.Model.Type != "received_signal_surface_fspl_walls" || surface.Model.ValueSemantics != "raw_received_power_dbm" || surface.Model.UsesSensitivityMask {
				t.Fatalf("surface value contract = %+v", surface.Model)
			}
			if surface.RFContract.ModelID != CanonicalRFModelID || surface.RFContract.SurfaceDefinition != CanonicalSurfaceDefinition {
				t.Fatalf("surface RF contract = %+v", surface.RFContract)
			}
			if surface.Stats.NoDataCellCount != surface.Stats.CellCount-surface.Stats.ValidCellCount || surface.Stats.BelowSensitivityCellCount == 0 {
				t.Fatalf("surface statistics = %+v", surface.Stats)
			}
			if math.Abs(surface.Grid.CellSizeMeters-contract.ExpectedCellSizeM) > 0.01 {
				t.Fatalf("surface cell size = %.3f, want %.3f", surface.Grid.CellSizeMeters, contract.ExpectedCellSizeM)
			}
			east := surface.Grid.Values[(surface.Grid.Height/2)*surface.Grid.Width+surface.Grid.Width-1]
			if contract.ExpectedValidValueBelowSensitivity && (east == surface.Grid.NoDataValue || east >= profile.ReceiverSensitivityDBm) {
				t.Fatalf("east surface value = %.3f, want valid and below sensitivity %.3f", east, profile.ReceiverSensitivityDBm)
			}
			expectedEast := roundOne(profile.ReceivedPowerDBm(100, 0, 0, 0))
			if math.Abs(east-expectedEast) > 0.01 {
				t.Fatalf("east cell-center power = %.3f, want direct received-power value %.3f", east, expectedEast)
			}
			if contract.ExpectedNoInterpolation {
				previous := surface.Grid.Values[(surface.Grid.Height/2)*surface.Grid.Width+surface.Grid.Width-2]
				expectedPrevious := roundOne(profile.ReceivedPowerDBm(75, 0, 0, 0))
				if math.Abs(previous-expectedPrevious) > 0.01 {
					t.Fatalf("previous cell-center power = %.3f, want direct value %.3f", previous, expectedPrevious)
				}
				if math.Abs((east-previous)-(expectedEast-expectedPrevious)) > 0.01 {
					t.Fatalf("surface power delta = %.3f, want direct cell-center delta %.3f", east-previous, expectedEast-expectedPrevious)
				}
			}
			north := surface.Grid.Values[(surface.Grid.Height-1)*surface.Grid.Width+surface.Grid.Width/2]
			if contract.ExpectedNoDataOutsideBeam && north != surface.Grid.NoDataValue {
				t.Fatalf("north surface value = %.3f, want NoData %.1f", north, surface.Grid.NoDataValue)
			}
			corner := surface.Grid.Values[surface.Grid.Width-1]
			if contract.ExpectedRadiusClipping && corner != surface.Grid.NoDataValue {
				t.Fatalf("corner surface value = %.3f, want radius-clipped NoData %.1f", corner, surface.Grid.NoDataValue)
			}
			if contract.ExpectedStatisticsIgnoreNoData {
				if surface.Stats.MinimumDBm == nil || surface.Stats.MaximumDBm == nil || *surface.Stats.MinimumDBm == surface.Grid.NoDataValue || *surface.Stats.MaximumDBm == surface.Grid.NoDataValue {
					t.Fatalf("surface statistics include NoData: %+v", surface.Stats)
				}
			}
			allowedThresholds := map[float64]bool{-100: true, -50: true}
			for _, contour := range surface.Contours.Features {
				if !allowedThresholds[contour.Properties.ThresholdDBm] {
					t.Fatalf("contour threshold %.1f was not requested", contour.Properties.ThresholdDBm)
				}
			}
		})
	}
}

func referenceSamplingIndex(t *testing.T, origin Point, contract rfReferenceSampling) *BuildingIndex {
	t.Helper()
	offset := contract.OffsetM
	verticesM := [][]float64{
		{contract.BuildingStartM, -10 + offset},
		{contract.BuildingEndM, -10 + offset},
		{contract.BuildingEndM, 10 + offset},
		{contract.BuildingStartM, 10 + offset},
	}
	vertices := make([]Point, 0, len(verticesM))
	for _, coordinates := range verticesM {
		vertices = append(vertices, referencePoint(origin, coordinates))
	}
	bounds, ok := BoundsFromPoints(vertices)
	if !ok {
		t.Fatalf("%s has invalid sampling building bounds", contract.ID)
	}
	return NewBuildingIndex([]*BuildingFootprint{{
		ID: "sampling-building", HeightMeters: 9, Material: "concrete",
		Bounds: bounds, Vertices: vertices,
	}})
}

func TestRFReferenceSamplingContracts(t *testing.T) {
	corpus := loadRFReferenceCorpus(t)
	origin := Point{Lon: 32, Lat: 39}
	receiver := DestinationPoint(origin, 90, 100)
	for _, contract := range corpus.SamplingContracts {
		t.Run(contract.ID, func(t *testing.T) {
			profile := DefaultCellRFProfile("5g", 28, 30, 100, 120, 0, 0, 0)
			request := PathProfileRequest{
				Transmitter: origin, Receiver: receiver, SampleSpacingM: contract.SampleSpacingM,
				ModelProfile: "urban-short-range", AzimuthDeg: 90, RFProfile: profile,
				Fidelity: PropagationFidelity{BuildingLossMode: "screen-diffraction", DiffractionModel: "single-knife-edge", DefaultWallMaterial: "concrete"},
			}
			response, err := AnalyzePathProfileContext(context.Background(), request, nil, referenceSamplingIndex(t, origin, contract))
			if err != nil {
				t.Fatalf("analyze sampled path: %v", err)
			}
			observed := false
			for _, sample := range response.Samples {
				if sample.BuildingID != "" {
					observed = true
					break
				}
			}
			if observed != contract.ExpectedBuildingObserved {
				t.Fatalf("building observed = %v, want %v", observed, contract.ExpectedBuildingObserved)
			}
		})
	}
}
