package raytracer

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestThermalNoiseReferenceFixtures(t *testing.T) {
	for _, test := range []struct {
		name        string
		bandwidthHz float64
		noiseFigure float64
		temperature float64
	}{
		{name: "1 Hz", bandwidthHz: 1, noiseFigure: 0, temperature: 290},
		{name: "1 MHz", bandwidthHz: 1e6, noiseFigure: 0, temperature: 290},
		{name: "20 MHz", bandwidthHz: 20e6, noiseFigure: 0, temperature: 290},
		{name: "100 MHz NF 7", bandwidthHz: 100e6, noiseFigure: 7, temperature: 290},
		{name: "temperature scaling", bandwidthHz: 1e6, noiseFigure: 3, temperature: 580},
	} {
		t.Run(test.name, func(t *testing.T) {
			// Independent reference: N = -174 dBm/Hz + 10log10(T/290) + 10log10(B) + NF.
			expected := -174.0 + 10*math.Log10(test.temperature/290) + 10*math.Log10(test.bandwidthHz) + test.noiseFigure
			if got := ThermalNoiseDBm(test.bandwidthHz, test.noiseFigure, test.temperature); math.Abs(got-expected) > 1e-12 {
				t.Fatalf("thermal noise = %.12f dBm, want %.12f", got, expected)
			}
		})
	}
}

func TestReceiverThresholdDefaultRemainsManualCompatibility(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	threshold, err := ReceiverThresholdForProfile(profile)
	if err != nil {
		t.Fatalf("resolve default receiver threshold: %v", err)
	}
	if threshold.Mode != ReceiverSensitivityModeManual || threshold.SensitivityDBm != DefaultReceiverSensitivityDBm {
		t.Fatalf("default receiver threshold = %+v", threshold)
	}
	if threshold.NoiseDensityDBmHz != nil || threshold.NoiseBandwidthHz != nil || threshold.ThermalNoiseDBm != nil || threshold.NoiseFloorDBm != nil {
		t.Fatalf("manual mode exposed derived noise terms: %+v", threshold)
	}
	for _, test := range []struct {
		signal float64
		usable bool
		label  string
	}{
		{signal: DefaultReceiverSensitivityDBm + 1, usable: true, label: "one dB above"},
		{signal: DefaultReceiverSensitivityDBm, usable: false, label: "exact"},
		{signal: DefaultReceiverSensitivityDBm - 1, usable: false, label: "one dB below"},
	} {
		if got := ReceiverUsableSignal(test.signal, threshold.SensitivityDBm); got != test.usable {
			t.Fatalf("%s signal usability = %t, want %t", test.label, got, test.usable)
		}
	}
}

func TestReceiverThresholdDerivedMatchesIndependentKTBEquation(t *testing.T) {
	tests := []struct {
		name        string
		frequency   float64
		technology  string
		bandwidth   float64
		noiseFigure float64
		requiredSNR float64
		margin      float64
		source      string
	}{
		{name: "4g 5 MHz", frequency: 2.6, technology: "4g", bandwidth: 5e6, noiseFigure: 0, requiredSNR: 0, margin: 0, source: ReceiverNoiseBandwidthSourceExplicit},
		{name: "5g 20 MHz", frequency: 28, technology: "5g", bandwidth: 20e6, noiseFigure: 7, requiredSNR: 3, margin: 0, source: ReceiverNoiseBandwidthSourceExplicit},
		{name: "5g 100 MHz planning margin", frequency: 28, technology: "5g", bandwidth: 100e6, noiseFigure: 10, requiredSNR: 5, margin: 2, source: ReceiverNoiseBandwidthSourceChannelBandwidth},
		{name: "6g explicit 100 MHz", frequency: 140, technology: "6g", bandwidth: 100e6, noiseFigure: 4, requiredSNR: -2, margin: 1.5, source: ReceiverNoiseBandwidthSourceExplicit},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			profile := DefaultPlanningCellRFProfile(test.technology, test.frequency, 30, 400, 120, 20, 0.7, 1)
			profile.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
			profile.ReceiverNoiseBandwidthHz = test.bandwidth
			profile.ReceiverNoiseBandwidthSource = test.source
			profile.ReceiverNoiseFigureDB = test.noiseFigure
			profile.ReceiverRequiredSNRDB = test.requiredSNR
			profile.ReceiverMarginDB = test.margin
			if validationError := ValidateCellRFProfile(profile, false); validationError != "" {
				t.Fatalf("derived profile validation = %s", validationError)
			}
			threshold, err := ReceiverThresholdForProfile(profile)
			if err != nil {
				t.Fatalf("resolve derived threshold: %v", err)
			}
			// Keep the expected equation independent from the production helper.
			expectedThermal := -174.0 + 10*math.Log10(test.bandwidth)
			expectedFloor := expectedThermal + test.noiseFigure
			expectedSensitivity := expectedFloor + test.requiredSNR + test.margin
			if math.Abs(*threshold.ThermalNoiseDBm-expectedThermal) > 1e-12 || math.Abs(*threshold.NoiseFloorDBm-expectedFloor) > 1e-12 || math.Abs(threshold.SensitivityDBm-expectedSensitivity) > 1e-12 {
				t.Fatalf("threshold = %+v, expected thermal=%.12f floor=%.12f sensitivity=%.12f", threshold, expectedThermal, expectedFloor, expectedSensitivity)
			}
			if *threshold.NoiseBandwidthHz != test.bandwidth || threshold.NoiseBandwidthSource != test.source || *threshold.NoiseFigureDB != test.noiseFigure || *threshold.RequiredSNRDB != test.requiredSNR || *threshold.ReceiverMarginDB != test.margin {
				t.Fatalf("resolved terms were not inspectable: %+v", threshold)
			}
		})
	}
}

func TestReceiverThresholdInputsAreIndependentAndMonotonic(t *testing.T) {
	base := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	base.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	base.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	base.ReceiverNoiseBandwidthHz = 20e6
	base.ReceiverNoiseFigureDB = 5
	base.ReceiverRequiredSNRDB = 0
	base.ReceiverMarginDB = 0
	baseThreshold, err := ReceiverThresholdForProfile(base)
	if err != nil {
		t.Fatalf("resolve base threshold: %v", err)
	}
	for name, mutate := range map[string]func(*CellRFProfile){
		"bandwidth":       func(profile *CellRFProfile) { profile.ReceiverNoiseBandwidthHz = 100e6 },
		"noise figure":    func(profile *CellRFProfile) { profile.ReceiverNoiseFigureDB = 8 },
		"required snr":    func(profile *CellRFProfile) { profile.ReceiverRequiredSNRDB = 3 },
		"receiver margin": func(profile *CellRFProfile) { profile.ReceiverMarginDB = 2 },
	} {
		profile := base
		mutate(&profile)
		threshold, resolveErr := ReceiverThresholdForProfile(profile)
		if resolveErr != nil {
			t.Fatalf("%s resolve error: %v", name, resolveErr)
		}
		if threshold.SensitivityDBm <= baseThreshold.SensitivityDBm {
			t.Fatalf("%s changed sensitivity from %.6f to %.6f; expected a higher threshold", name, baseThreshold.SensitivityDBm, threshold.SensitivityDBm)
		}
	}
	manual := base
	manual.ReceiverSensitivityMode = ReceiverSensitivityModeManual
	manual.ReceiverSensitivityDBm = -123
	manual.ReceiverNoiseBandwidthHz = math.NaN()
	manual.ReceiverNoiseFigureDB = 99
	manual.ReceiverRequiredSNRDB = -1000
	manual.ReceiverMarginDB = 1000
	if validationError := ValidateCellRFProfile(manual, false); validationError != "" {
		t.Fatalf("manual mode should ignore derived fields: %s", validationError)
	}
	manualThreshold, resolveErr := ReceiverThresholdForProfile(manual)
	if resolveErr != nil || manualThreshold.SensitivityDBm != -123 || manualThreshold.Mode != ReceiverSensitivityModeManual {
		t.Fatalf("manual mode did not retain direct threshold: %+v, %v", manualThreshold, resolveErr)
	}
}

func TestReceiverThresholdValidationRejectsInvalidDerivedInputs(t *testing.T) {
	base := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	base.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	base.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	tests := []struct {
		name   string
		mutate func(*CellRFProfile)
	}{
		{name: "zero bandwidth", mutate: func(profile *CellRFProfile) { profile.ReceiverNoiseBandwidthHz = 0 }},
		{name: "nan bandwidth", mutate: func(profile *CellRFProfile) { profile.ReceiverNoiseBandwidthHz = math.NaN() }},
		{name: "infinite bandwidth", mutate: func(profile *CellRFProfile) { profile.ReceiverNoiseBandwidthHz = math.Inf(1) }},
		{name: "noise figure too high", mutate: func(profile *CellRFProfile) { profile.ReceiverNoiseFigureDB = MaxReceiverNoiseFigureDB + 1 }},
		{name: "snr too low", mutate: func(profile *CellRFProfile) { profile.ReceiverRequiredSNRDB = MinReceiverRequiredSNRDB - 1 }},
		{name: "margin too high", mutate: func(profile *CellRFProfile) { profile.ReceiverMarginDB = MaxReceiverMarginDB + 1 }},
		{name: "unknown bandwidth source", mutate: func(profile *CellRFProfile) { profile.ReceiverNoiseBandwidthSource = "interference-bandwidth" }},
		{name: "unknown mode", mutate: func(profile *CellRFProfile) { profile.ReceiverSensitivityMode = "estimated" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			profile := base
			test.mutate(&profile)
			if validationError := ValidateCellRFProfile(profile, false); validationError == "" {
				t.Fatal("invalid derived profile was accepted")
			}
			if _, err := ReceiverThresholdForProfile(profile); err == nil {
				t.Fatal("invalid derived profile resolved without an error")
			}
		})
	}
}

func TestReceiverThresholdFlowsThroughPropagationLinkBudget(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	profile.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	profile.ReceiverNoiseBandwidthHz = 20e6
	profile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	profile.ReceiverNoiseFigureDB = 6
	profile.ReceiverRequiredSNRDB = 2
	profile.ReceiverMarginDB = 1
	threshold, err := ReceiverThresholdForProfile(profile)
	if err != nil {
		t.Fatalf("resolve threshold: %v", err)
	}
	result := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: 100, LOSState: PropagationLOSState(PropagationLOS),
		ReceiverThreshold: &threshold,
	})
	if result.ReceiverThreshold.Mode != ReceiverSensitivityModeDerived || result.LinkBudget.ReceiverSensitivityMode != ReceiverSensitivityModeDerived {
		t.Fatalf("propagation result lost receiver mode: %+v / %+v", result.ReceiverThreshold, result.LinkBudget)
	}
	if math.Abs(result.LinkBudget.EffectiveReceiverSensitivityDBm-threshold.SensitivityDBm) > 1e-12 {
		t.Fatalf("link-budget threshold = %.12f, want %.12f", result.LinkBudget.EffectiveReceiverSensitivityDBm, threshold.SensitivityDBm)
	}
	expectedMargin := result.ReceivedPowerDBm - threshold.SensitivityDBm
	if math.Abs(result.ReceiverLinkMarginDB-expectedMargin) > 1e-12 || math.Abs(result.LinkBudget.ReceiverLinkMarginDB-expectedMargin) > 1e-12 {
		t.Fatalf("link margin = %.12f / %.12f, want %.12f", result.ReceiverLinkMarginDB, result.LinkBudget.ReceiverLinkMarginDB, expectedMargin)
	}
}

func TestReceiverThresholdPerCellProfilesRemainHeterogeneous(t *testing.T) {
	root := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	derived := root
	derived.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	derived.ReceiverNoiseBandwidthHz = 5e6
	derived.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	derived.ReceiverNoiseFigureDB = 0
	derived.ReceiverRequiredSNRDB = 0
	derived.ReceiverMarginDB = 0
	request := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "manual", TowerLon: 32, TowerLat: 39, RFProfile: root},
			{ID: "derived", TowerLon: 32.001, TowerLat: 39, RFProfile: derived},
		},
		RFProfile: root,
	}
	profiles := effectiveCellRFProfiles(request, []float64{0, 0})
	if len(profiles) != 2 || profiles[0].ReceiverThreshold.Mode != ReceiverSensitivityModeManual || profiles[1].ReceiverThreshold.Mode != ReceiverSensitivityModeDerived {
		t.Fatalf("effective per-cell receiver modes = %+v", profiles)
	}
	if profiles[0].ReceiverThreshold.SensitivityDBm == profiles[1].ReceiverThreshold.SensitivityDBm {
		t.Fatalf("heterogeneous cells unexpectedly share sensitivity %.6f", profiles[0].ReceiverThreshold.SensitivityDBm)
	}
}

func TestDerivedReceiverThresholdFlowsIntoSurfaceWithoutChangingRawPower(t *testing.T) {
	manual := DefaultPlanningCellRFProfile("4g", 2.6, 43, 100, 360, 20, 0.7, 1)
	manual.HorizontalPatternID = "omni"
	derived := manual
	derived.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	derived.ReceiverNoiseBandwidthHz = 5e6
	derived.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	derived.ReceiverNoiseFigureDB = 0
	derived.ReceiverRequiredSNRDB = 0
	derived.ReceiverMarginDB = 0
	manualResponse, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
		Simulation:     StaticSimulationRequest{TowerLon: 32.85, TowerLat: 39.92, Rays: 24, RadiusMeters: 100, FrequencyGHz: 2.6, TxPowerDBm: 43, BeamWidthDeg: 360, RFProfile: manual},
		CellSizeMeters: 25, ThresholdsDBm: []float64{-100, -80},
	}, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("manual surface: %v", err)
	}
	derivedResponse, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
		Simulation:     StaticSimulationRequest{TowerLon: 32.85, TowerLat: 39.92, Rays: 24, RadiusMeters: 100, FrequencyGHz: 2.6, TxPowerDBm: 43, BeamWidthDeg: 360, RFProfile: derived},
		CellSizeMeters: 25, ThresholdsDBm: []float64{-100, -80},
	}, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("derived surface: %v", err)
	}
	if len(manualResponse.Grid.Values) != len(derivedResponse.Grid.Values) {
		t.Fatalf("surface value lengths = %d and %d", len(manualResponse.Grid.Values), len(derivedResponse.Grid.Values))
	}
	for index := range manualResponse.Grid.Values {
		if manualResponse.Grid.Values[index] != derivedResponse.Grid.Values[index] {
			t.Fatalf("raw surface value %d changed from %.12f to %.12f", index, manualResponse.Grid.Values[index], derivedResponse.Grid.Values[index])
		}
	}
	if manualResponse.ReceiverThreshold.Mode != ReceiverSensitivityModeManual || derivedResponse.ReceiverThreshold.Mode != ReceiverSensitivityModeDerived {
		t.Fatalf("surface receiver modes = %q and %q", manualResponse.ReceiverThreshold.Mode, derivedResponse.ReceiverThreshold.Mode)
	}
	if derivedResponse.Stats.ReceiverSensitivityMode != ReceiverSensitivityModeDerived || math.Abs(derivedResponse.Stats.ReceiverSensitivityDBm-derivedResponse.ReceiverThreshold.SensitivityDBm) > 1e-12 {
		t.Fatalf("surface stats did not expose effective threshold: %+v / %+v", derivedResponse.Stats, derivedResponse.ReceiverThreshold)
	}
}

func TestDerivedReceiverThresholdKeepsBuildingServiceThresholdSeparate(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 360, 100, 0.7, 1)
	profile.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	profile.ReceiverNoiseBandwidthHz = 100e6
	profile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	profile.ReceiverNoiseFigureDB = 7
	profile.ReceiverRequiredSNRDB = 3
	profile.ReceiverMarginDB = 0
	building := &BuildingFootprint{
		ID: "b-derived-threshold", Tags: map[string]string{"building": "apartments"}, DemandWeight: 2, ResidentialDemand: 1,
		Bounds:   Bounds{MinLon: 0.0008, MinLat: -0.0002, MaxLon: 0.0012, MaxLat: 0.0002},
		Vertices: []Point{{Lon: 0.0008, Lat: -0.0002}, {Lon: 0.0012, Lat: -0.0002}, {Lon: 0.0012, Lat: 0.0002}, {Lon: 0.0008, Lat: 0.0002}},
	}
	response, err := AnalyzeBuildingEntryContext(context.Background(), BuildingEntryAnalysisRequest{
		Network: NetworkOptimizationRequest{
			Towers:       []NetworkTowerRequest{{ID: "cell-derived", TowerLon: 0, TowerLat: 0, AzimuthDeg: 90, RFProfile: profile}},
			RadiusMeters: 400, FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 360, RFProfile: profile,
		},
		BuildingIDs: []string{building.ID},
	}, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil {
		t.Fatalf("derived building-entry analysis: %v", err)
	}
	if len(response.Results) != 1 || response.Results[0].ReceiverSensitivityMode != ReceiverSensitivityModeDerived || response.Results[0].ReceiverThreshold == nil {
		t.Fatalf("building result lost derived receiver contract: %+v", response.Results)
	}
	if response.Summary.BuildingServiceThresholdDBm != BuildingServiceThresholdDBm {
		t.Fatalf("building summary threshold = %.3f, want %.3f", response.Summary.BuildingServiceThresholdDBm, BuildingServiceThresholdDBm)
	}
	result := response.Results[0]
	if result.BuildingServiceThresholdDBm != BuildingServiceThresholdDBm || result.BuildingServiceThresholdDBm == result.ReceiverThreshold.SensitivityDBm {
		t.Fatalf("building and receiver thresholds were conflated: building=%.3f receiver=%.3f", result.BuildingServiceThresholdDBm, result.ReceiverThreshold.SensitivityDBm)
	}
	if result.LowLossReceiverLinkMarginDB == nil || result.HighLossReceiverLinkMarginDB == nil {
		t.Fatalf("entry link margins were not emitted: %+v", result)
	}
}

func TestDerivedReceiverTerminationDoesNotHideBuildingService(t *testing.T) {
	origin := Point{Lon: 32, Lat: 39}
	buildingIndex := testDemandBuildingAt(t, "service-beyond-receiver", DestinationPoint(origin, 90, 400), 12)
	building := buildingIndex.footprints[0]
	profile := DefaultPlanningCellRFProfile("4g", 2.6, 30, 500, 360, 20, 0.7, 1)
	profile.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	profile.ReceiverNoiseBandwidthHz = 100e6
	profile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	profile.ReceiverNoiseFigureDB = 10
	profile.ReceiverRequiredSNRDB = 50
	profile.BeamWidthDeg = 20
	threshold, err := ReceiverThresholdForProfile(profile)
	if err != nil {
		t.Fatalf("resolve derived building-service threshold: %v", err)
	}
	staticRequest := StaticSimulationRequest{
		TowerLon: origin.Lon, TowerLat: origin.Lat, Rays: 1, RadiusMeters: profile.RadiusMeters,
		FrequencyGHz: profile.FrequencyGHz, TxPowerDBm: profile.TxPowerDBm, AzimuthDeg: 100,
		BeamWidthDeg: 20, RFProfile: profile,
	}
	coverage := mustResult(BuildingCoverageMapContext(context.Background(), origin, staticRequest, buildingIndex))
	received, ok := coverage[building.ID]
	if !ok {
		t.Fatalf("building service value was hidden after receiver termination: coverage=%v", coverage)
	}
	if received <= BuildingServiceThresholdDBm {
		t.Fatalf("controlled building-service Rx = %.3f dBm, want > %.3f dBm", received, BuildingServiceThresholdDBm)
	}
	if ReceiverUsableSignal(received, threshold.SensitivityDBm) {
		t.Fatalf("controlled building-service Rx = %.3f dBm unexpectedly met derived receiver threshold %.3f dBm", received, threshold.SensitivityDBm)
	}
}

func TestDerivedReceiverThresholdDoesNotReplaceInterferencePerResourceElementNoise(t *testing.T) {
	request := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&request)
	preset, err := interferencePresetFor(request.NetworkTech, request.BandwidthMHz)
	if err != nil {
		t.Fatalf("interference preset: %v", err)
	}
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	manual := evaluateInterferencePoint(request, preset, EmptyBuildingIndex(), point)
	for index := range request.Towers {
		profile := request.Towers[index].RFProfile
		profile.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
		profile.ReceiverNoiseBandwidthHz = 20e6
		profile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
		profile.ReceiverNoiseFigureDB = 7
		profile.ReceiverRequiredSNRDB = 3
		profile.ReceiverMarginDB = 0
		request.Towers[index].RFProfile = profile
	}
	NormalizeInterferenceRequest(&request)
	derived := evaluateInterferencePoint(request, preset, EmptyBuildingIndex(), point)
	if derived.ReceiverThreshold == nil || derived.ReceiverThreshold.Mode != ReceiverSensitivityModeDerived {
		t.Fatalf("derived interference sample did not expose receiver threshold: %+v", derived)
	}
	if manual.ServingCellID != derived.ServingCellID || manual.QualityClass != derived.QualityClass {
		t.Fatalf("receiver admission changed the close-in serving result: manual=%+v derived=%+v", manual, derived)
	}
	for label, pair := range map[string][2]*float64{
		"RSRP": {manual.RSRPDBm, derived.RSRPDBm},
		"SINR": {manual.SINRDB, derived.SINRDB},
		"RSRQ": {manual.RSRQDB, derived.RSRQDB},
		"RSSI": {manual.RSSIDBm, derived.RSSIDBm},
	} {
		if pair[0] == nil || pair[1] == nil || math.Abs(*pair[0]-*pair[1]) > 1e-12 {
			t.Fatalf("%s changed when only receiver sensitivity mode changed: manual=%v derived=%v", label, pair[0], pair[1])
		}
	}
	expectedNoise := -174.0 + 10*math.Log10(15e3) + request.NoiseFigureDB
	if math.Abs(ThermalNoisePerREDBm(preset.scsKHz, request.NoiseFigureDB)-expectedNoise) > 1e-12 {
		t.Fatalf("interference per-RE noise = %.12f, want %.12f", ThermalNoisePerREDBm(preset.scsKHz, request.NoiseFigureDB), expectedNoise)
	}
}

type receiverComparisonArtifact struct {
	SchemaVersion             int                          `json:"schema_version"`
	ReferenceConvention       string                       `json:"reference_convention"`
	ManualBaselineByFrequency []receiverComparisonBaseline `json:"manual_baseline_by_frequency"`
	DerivedExperimentMatrix   []receiverComparisonCase     `json:"derived_experiment_matrix"`
	Notes                     []string                     `json:"notes"`
}

type receiverComparisonBaseline struct {
	NetworkTech    string                         `json:"network_tech"`
	FrequencyGHz   float64                        `json:"frequency_ghz"`
	SensitivityDBm float64                        `json:"sensitivity_dbm"`
	ReachMeters    float64                        `json:"controlled_fspl_reach_m"`
	BuildingEntry  receiverComparisonBuilding     `json:"building_entry"`
	Interference   receiverComparisonInterference `json:"interference"`
}

type receiverComparisonCase struct {
	NetworkTech           string                         `json:"network_tech"`
	FrequencyGHz          float64                        `json:"frequency_ghz"`
	NoiseBandwidthHz      float64                        `json:"receiver_noise_bandwidth_hz"`
	NoiseBandwidthSource  string                         `json:"receiver_noise_bandwidth_source"`
	NoiseFigureDB         float64                        `json:"receiver_noise_figure_db"`
	RequiredSNRDB         float64                        `json:"receiver_required_snr_db"`
	ReceiverMarginDB      float64                        `json:"receiver_margin_db"`
	ManualSensitivityDBm  float64                        `json:"manual_sensitivity_dbm"`
	DerivedSensitivityDBm float64                        `json:"derived_sensitivity_dbm"`
	SensitivityDeltaDB    float64                        `json:"sensitivity_delta_db"`
	ManualReachMeters     float64                        `json:"manual_controlled_fspl_reach_m"`
	DerivedReachMeters    float64                        `json:"derived_controlled_fspl_reach_m"`
	ReachDeltaMeters      float64                        `json:"reach_delta_m"`
	ManualBuildingEntry   receiverComparisonBuilding     `json:"manual_building_entry"`
	DerivedBuildingEntry  receiverComparisonBuilding     `json:"derived_building_entry"`
	ManualInterference    receiverComparisonInterference `json:"manual_interference"`
	DerivedInterference   receiverComparisonInterference `json:"derived_interference"`
}

type receiverComparisonBuilding struct {
	Available                   bool    `json:"available"`
	LowLossRxDBm                float64 `json:"low_loss_rx_dbm,omitempty"`
	HighLossRxDBm               float64 `json:"high_loss_rx_dbm,omitempty"`
	LowLossServiceable          bool    `json:"low_loss_serviceable,omitempty"`
	HighLossServiceable         bool    `json:"high_loss_serviceable,omitempty"`
	OutdoorServiceable          bool    `json:"outdoor_serviceable,omitempty"`
	ReceiverThresholdDBm        float64 `json:"receiver_threshold_dbm,omitempty"`
	BuildingServiceThresholdDBm float64 `json:"building_service_threshold_dbm,omitempty"`
}

type receiverComparisonInterference struct {
	Available            bool     `json:"available"`
	NoSignal             bool     `json:"no_signal"`
	Serviceable          bool     `json:"serviceable"`
	ReceiverThresholdDBm float64  `json:"receiver_threshold_dbm,omitempty"`
	ReceiverLinkMarginDB *float64 `json:"receiver_link_margin_db,omitempty"`
	RSRPDBm              *float64 `json:"rsrp_dbm,omitempty"`
	SINRDB               *float64 `json:"sinr_db,omitempty"`
	RSRQDB               *float64 `json:"rsrq_db,omitempty"`
	ContributingCells    int      `json:"contributing_cells,omitempty"`
}

func TestReceiverSensitivityExperimentMatrix(t *testing.T) {
	artifact, err := buildReceiverSensitivityExperimentMatrix()
	if err != nil {
		t.Fatalf("build receiver sensitivity experiment matrix: %v", err)
	}
	if len(artifact.ManualBaselineByFrequency) != 2 || len(artifact.DerivedExperimentMatrix) != 18 {
		t.Fatalf("receiver experiment shape = %d baselines / %d cases, want 2 / 18", len(artifact.ManualBaselineByFrequency), len(artifact.DerivedExperimentMatrix))
	}
	for _, item := range artifact.DerivedExperimentMatrix {
		if item.DerivedSensitivityDBm <= item.ManualSensitivityDBm {
			t.Fatalf("derived sensitivity did not increase for %+v", item)
		}
		if item.ReachDeltaMeters >= 0 {
			t.Fatalf("derived threshold did not reduce controlled reach for %+v", item)
		}
	}
	if os.Getenv("ATOM_RUN_CANONICAL_RECEIVER_COMPARISON") != "1" {
		t.Log("set ATOM_RUN_CANONICAL_RECEIVER_COMPARISON=1 to write docs/concept-4g2-receiver-comparison.json")
		return
	}
	output := os.Getenv("ATOM_RECEIVER_COMPARISON_OUTPUT")
	if output == "" {
		output = filepath.Join("..", "..", "docs", "concept-4g2-receiver-comparison.json")
	}
	encoded, err := json.MarshalIndent(artifact, "", "  ")
	if err != nil {
		t.Fatalf("marshal receiver comparison artifact: %v", err)
	}
	if err := os.WriteFile(output, append(encoded, '\n'), 0o600); err != nil {
		t.Fatalf("write receiver comparison artifact: %v", err)
	}
	t.Logf("receiver comparison artifact: %s", output)
}

func TestCanonicalAnkaraReceiverSensitivityComparisonWhenDatasetIsEnabled(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_RECEIVER_COMPARISON") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_RECEIVER_COMPARISON=1 to run the Ankara receiver comparison")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}

	manualRequest := canonicalAnkaraNetworkOptimizationRequest()
	manualProfile := DefaultCellRFProfile("5g", manualRequest.FrequencyGHz, manualRequest.TxPowerDBm, manualRequest.RadiusMeters, manualRequest.BeamWidthDeg, 100, 0.7, 1)
	manualRequest.RFProfile = manualProfile
	for index := range manualRequest.Towers {
		manualRequest.Towers[index].RFProfile = manualProfile
	}
	NormalizeNetworkOptimizationRequest(&manualRequest)
	manualThreshold, err := ReceiverThresholdForProfile(manualProfile)
	if err != nil {
		t.Fatalf("resolve canonical manual threshold: %v", err)
	}
	manualStarted := time.Now()
	manualOptimization, err := OptimizeNetworkContext(context.Background(), manualRequest, pack.BuildingIndex)
	manualElapsed := time.Since(manualStarted)
	if err != nil {
		t.Fatalf("canonical manual optimization: %v", err)
	}
	if manualOptimization.Baseline == nil {
		t.Fatal("canonical manual optimization did not retain a baseline")
	}
	manualBaselineRaw := manualOptimization.Baseline.Stats.RawMetrics
	manualOptimizedRaw := manualOptimization.Stats.RawMetrics
	if math.Abs(manualBaselineRaw.ServedDemandWeight-185) > 1e-6 || manualBaselineRaw.ResidentialCovered != 28 || math.Abs(manualBaselineRaw.PropagationReachScore-16013.3051) > 1e-4 || math.Abs(manualBaselineRaw.OverlapRatio-0.098361) > 1e-6 || math.Abs(manualOptimization.Baseline.Stats.Score-33.7894) > 1e-4 {
		t.Fatalf("canonical manual baseline changed: raw=%+v score=%.6f", manualBaselineRaw, manualOptimization.Baseline.Stats.Score)
	}
	if math.Abs(manualOptimizedRaw.ServedDemandWeight-555) > 1e-6 || manualOptimizedRaw.ResidentialCovered != 43 || math.Abs(manualOptimizedRaw.PropagationReachScore-19548.6910) > 1e-4 || math.Abs(manualOptimizedRaw.OverlapRatio) > 1e-6 || math.Abs(manualOptimization.Stats.Score-41.1715) > 1e-4 {
		t.Fatalf("canonical manual optimized result changed: raw=%+v score=%.6f", manualOptimizedRaw, manualOptimization.Stats.Score)
	}
	wantAzimuths := []float64{70, 20, 130, 160, 290, 110}
	if len(manualOptimization.ParetoFrontier) != 6 || len(manualOptimization.OptimizedTowers) != len(wantAzimuths) {
		t.Fatalf("canonical manual recommendation shape changed: pareto=%d towers=%d", len(manualOptimization.ParetoFrontier), len(manualOptimization.OptimizedTowers))
	}
	for index, tower := range manualOptimization.OptimizedTowers {
		if math.Abs(tower.OptimalAzimuth-wantAzimuths[index]) > 1e-9 {
			t.Fatalf("canonical manual azimuth[%d] = %.6f, want %.6f", index, tower.OptimalAzimuth, wantAzimuths[index])
		}
	}

	derivedRequest := canonicalAnkaraNetworkOptimizationRequest()
	derivedProfile := manualProfile
	derivedProfile.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
	derivedProfile.ReceiverNoiseBandwidthHz = 100e6
	derivedProfile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	derivedProfile.ReceiverNoiseFigureDB = 7
	derivedProfile.ReceiverRequiredSNRDB = 3
	derivedProfile.ReceiverMarginDB = 0
	derivedRequest.RFProfile = derivedProfile
	for index := range derivedRequest.Towers {
		derivedRequest.Towers[index].RFProfile = derivedProfile
	}
	NormalizeNetworkOptimizationRequest(&derivedRequest)
	derivedThreshold, err := ReceiverThresholdForProfile(derivedProfile)
	if err != nil {
		t.Fatalf("resolve canonical derived threshold: %v", err)
	}
	derivedStarted := time.Now()
	derivedOptimization, err := OptimizeNetworkContext(context.Background(), derivedRequest, pack.BuildingIndex)
	derivedElapsed := time.Since(derivedStarted)
	if err != nil {
		t.Fatalf("canonical derived optimization: %v", err)
	}
	if derivedThreshold.SensitivityDBm <= manualThreshold.SensitivityDBm || derivedOptimization.Stats.RawMetrics.PropagationReachScore >= manualOptimization.Stats.RawMetrics.PropagationReachScore {
		t.Fatalf("canonical derived experiment did not show the expected threshold/reach consequence: manual=%+.3f/%.4f derived=%+.3f/%.4f", manualThreshold.SensitivityDBm, manualOptimization.Stats.RawMetrics.PropagationReachScore, derivedThreshold.SensitivityDBm, derivedOptimization.Stats.RawMetrics.PropagationReachScore)
	}
	for _, cell := range derivedOptimization.EffectiveCellProfiles {
		if cell.ReceiverThreshold.Mode != ReceiverSensitivityModeDerived || math.Abs(cell.ReceiverThreshold.SensitivityDBm-derivedThreshold.SensitivityDBm) > 1e-12 {
			t.Fatalf("canonical derived effective cell threshold = %+v", cell)
		}
	}

	manualEntry, err := AnalyzeBuildingEntryContext(context.Background(), BuildingEntryAnalysisRequest{Network: canonicalReceiverEntryNetwork(manualRequest)}, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical manual building entry: %v", err)
	}
	derivedEntry, err := AnalyzeBuildingEntryContext(context.Background(), BuildingEntryAnalysisRequest{Network: canonicalReceiverEntryNetwork(derivedRequest)}, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical derived building entry: %v", err)
	}
	if manualEntry.Summary.BuildingServiceThresholdDBm != BuildingServiceThresholdDBm || derivedEntry.Summary.BuildingServiceThresholdDBm != BuildingServiceThresholdDBm {
		t.Fatalf("canonical building-service threshold drifted: manual=%.3f derived=%.3f want=%.3f", manualEntry.Summary.BuildingServiceThresholdDBm, derivedEntry.Summary.BuildingServiceThresholdDBm, BuildingServiceThresholdDBm)
	}
	manualSurface, err := canonicalReceiverSurface(manualRequest, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical manual surface: %v", err)
	}
	derivedSurface, err := canonicalReceiverSurface(derivedRequest, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical derived surface: %v", err)
	}
	if len(manualSurface.Grid.Values) != len(derivedSurface.Grid.Values) {
		t.Fatalf("canonical surface grid shape changed between modes: %d / %d", len(manualSurface.Grid.Values), len(derivedSurface.Grid.Values))
	}
	for index := range manualSurface.Grid.Values {
		if manualSurface.Grid.Values[index] != derivedSurface.Grid.Values[index] {
			t.Fatalf("canonical raw surface value %d changed between receiver modes: %.12f / %.12f", index, manualSurface.Grid.Values[index], derivedSurface.Grid.Values[index])
		}
	}
	manualInterference, err := AnalyzeInterferenceContext(context.Background(), canonicalAntennaComparisonInterferenceRequest(manualRequest), pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical manual interference: %v", err)
	}
	derivedInterference, err := AnalyzeInterferenceContext(context.Background(), canonicalAntennaComparisonInterferenceRequest(derivedRequest), pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical derived interference: %v", err)
	}
	manualTerminals, err := canonicalReceiverTerminalDistribution(manualRequest, manualOptimization, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical manual terminal distribution: %v", err)
	}
	derivedTerminals, err := canonicalReceiverTerminalDistribution(derivedRequest, derivedOptimization, pack.BuildingIndex)
	if err != nil {
		t.Fatalf("canonical derived terminal distribution: %v", err)
	}

	artifact := map[string]any{
		"schema_version": 1,
		"scenario":       "canonical six-cell Ankara 28 GHz optimization",
		"manual": map[string]any{
			"receiver_threshold":        manualThreshold,
			"optimization_elapsed_s":    manualElapsed.Seconds(),
			"optimization":              canonicalReceiverOptimizationRecord(manualOptimization),
			"building_entry":            canonicalReceiverBuildingRecord(manualEntry),
			"surface":                   canonicalReceiverSurfaceRecord(manualSurface),
			"interference":              canonicalReceiverInterferenceRecord(manualInterference),
			"ray_terminal_distribution": manualTerminals,
		},
		"derived": map[string]any{
			"receiver_threshold":        derivedThreshold,
			"optimization_elapsed_s":    derivedElapsed.Seconds(),
			"optimization":              canonicalReceiverOptimizationRecord(derivedOptimization),
			"building_entry":            canonicalReceiverBuildingRecord(derivedEntry),
			"surface":                   canonicalReceiverSurfaceRecord(derivedSurface),
			"interference":              canonicalReceiverInterferenceRecord(derivedInterference),
			"ray_terminal_distribution": derivedTerminals,
		},
		"comparison": map[string]any{
			"sensitivity_delta_db":        derivedThreshold.SensitivityDBm - manualThreshold.SensitivityDBm,
			"optimized_reach_delta_m":     derivedOptimization.Stats.RawMetrics.PropagationReachScore - manualOptimization.Stats.RawMetrics.PropagationReachScore,
			"optimized_score_delta":       derivedOptimization.Stats.Score - manualOptimization.Stats.Score,
			"optimized_demand_delta":      derivedOptimization.Stats.RawMetrics.ServedDemandWeight - manualOptimization.Stats.RawMetrics.ServedDemandWeight,
			"optimized_residential_delta": derivedOptimization.Stats.RawMetrics.ResidentialCovered - manualOptimization.Stats.RawMetrics.ResidentialCovered,
			"pareto_frontier_size_delta":  len(derivedOptimization.ParetoFrontier) - len(manualOptimization.ParetoFrontier),
		},
		"notes": []string{
			"Manual mode is the compatibility baseline and remains the default; the canonical six-cell manual values are asserted against the pre-change regression contract.",
			"The derived experiment explicitly uses 100 MHz receiver noise bandwidth, 7 dB noise figure, 3 dB required SNR, and 0 dB receiver margin, producing a -84 dBm threshold under the rounded -174 dBm/Hz at 290 K convention.",
			"Building entry uses its existing urban_short_range outdoor baseline and compares low/high O2I powers against the effective receiver threshold; building service remains the separate -100 dBm rule.",
			"Surface values remain raw received power; receiver sensitivity only changes the reported threshold/statistic, not numeric grid values.",
			"Interference retains per-resource-element thermal noise and its RSRP/SINR/RSRQ serviceability contract; receiver sensitivity only admits carriers before KPI calculation.",
			"This is a deterministic planning comparison, not a throughput, MCS, coding, UE conformance, or 140 GHz validation claim.",
		},
	}
	output := os.Getenv("ATOM_CANONICAL_RECEIVER_COMPARISON_OUTPUT")
	if output == "" {
		output = filepath.Join("..", "..", "docs", "concept-4g2-canonical-receiver-comparison.json")
	}
	encoded, err := json.MarshalIndent(artifact, "", "  ")
	if err != nil {
		t.Fatalf("marshal canonical receiver comparison: %v", err)
	}
	if err := os.WriteFile(output, append(encoded, '\n'), 0o600); err != nil {
		t.Fatalf("write canonical receiver comparison: %v", err)
	}
	t.Logf("canonical receiver comparison artifact: %s", output)
}

func canonicalReceiverEntryNetwork(network NetworkOptimizationRequest) NetworkOptimizationRequest {
	entry := network
	entry.RFProfile.PropagationModelID = UrbanShortRangePropagationID
	for index := range entry.Towers {
		entry.Towers[index].RFProfile.PropagationModelID = UrbanShortRangePropagationID
	}
	return entry
}

func canonicalReceiverSurface(network NetworkOptimizationRequest, buildings *BuildingIndex) (CoverageSurfaceResponse, error) {
	first := network.Towers[0]
	return GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
		Simulation: StaticSimulationRequest{
			TowerLon: first.TowerLon, TowerLat: first.TowerLat, Rays: network.Rays,
			RadiusMeters: network.RadiusMeters, FrequencyGHz: network.FrequencyGHz, TxPowerDBm: network.TxPowerDBm,
			AzimuthDeg: first.AzimuthDeg, BeamWidthDeg: network.BeamWidthDeg, RFProfile: first.RFProfile,
		},
		CellSizeMeters: 40, ThresholdsDBm: []float64{-100},
	}, buildings)
}

func canonicalReceiverOptimizationRecord(result NetworkOptimizationResponse) map[string]any {
	record := map[string]any{
		"baseline":                result.Baseline.Stats.RawMetrics,
		"optimized":               result.Stats.RawMetrics,
		"score":                   result.Stats.Score,
		"pareto_frontier_size":    len(result.ParetoFrontier),
		"recommended_solution_id": result.Optimization.RecommendedSolutionID,
		"recommended_azimuths":    canonicalReceiverAzimuths(result.OptimizedTowers),
		"effective_cell_profiles": result.EffectiveCellProfiles,
	}
	return record
}

func canonicalReceiverAzimuths(towers []NetworkOptimizedTower) []float64 {
	azimuths := make([]float64, 0, len(towers))
	for _, tower := range towers {
		azimuths = append(azimuths, tower.OptimalAzimuth)
	}
	return azimuths
}

func canonicalReceiverBuildingRecord(response BuildingEntryAnalysisResponse) map[string]any {
	return map[string]any{
		"relevant_buildings":              response.Summary.RelevantBuildings,
		"outdoor_serviceable_buildings":   response.Summary.OutdoorServiceableBuildings,
		"low_loss_serviceable_buildings":  response.Summary.LowLossServiceableBuildings,
		"high_loss_serviceable_buildings": response.Summary.HighLossServiceableBuildings,
		"candidate_cell_link_evaluations": response.Summary.CandidateCellLinkEvaluations,
		"receiver_sensitivity_rule":       response.Summary.ReceiverSensitivityRule,
		"building_service_threshold_dbm":  response.Summary.BuildingServiceThresholdDBm,
		"elapsed_ms":                      response.Diagnostics.ElapsedMilliseconds,
	}
}

func canonicalReceiverSurfaceRecord(response CoverageSurfaceResponse) map[string]any {
	center := 0.0
	if response.Grid.Width > 0 && response.Grid.Height > 0 {
		center = response.Grid.Values[(response.Grid.Height/2)*response.Grid.Width+response.Grid.Width/2]
	}
	return map[string]any{
		"valid_cell_count":             response.Stats.ValidCellCount,
		"below_sensitivity_cell_count": response.Stats.BelowSensitivityCellCount,
		"minimum_dbm":                  response.Stats.MinimumDBm,
		"maximum_dbm":                  response.Stats.MaximumDBm,
		"center_value_dbm":             center,
		"receiver_threshold":           response.ReceiverThreshold,
	}
}

func canonicalReceiverInterferenceRecord(response InterferenceResponse) map[string]any {
	return map[string]any{
		"signal_samples":           response.Stats.SignalSamples,
		"serviceable_samples":      response.Stats.ServiceableSamples,
		"serviceable_pct":          response.Stats.ServiceablePct,
		"avg_rsrp_dbm":             response.Stats.AvgRSRPDBm,
		"p10_rsrp_dbm":             response.Stats.P10RSRPDBm,
		"avg_sinr_db":              response.Stats.AvgSINRDB,
		"p10_sinr_db":              response.Stats.P10SINRDB,
		"receiver_threshold_rule":  response.Model.ReceiverThresholdRule,
		"receiver_noise_semantics": response.Model.ReceiverNoiseSemantics,
	}
}

func canonicalReceiverTerminalDistribution(network NetworkOptimizationRequest, result NetworkOptimizationResponse, buildings *BuildingIndex) (map[string]any, error) {
	byID := make(map[string]NetworkTowerRequest, len(network.Towers))
	for _, tower := range network.Towers {
		byID[tower.ID] = tower
	}
	perCell := make(map[string]map[string]any, len(result.OptimizedTowers))
	aggregate := map[string]int{"total_rays": 0, "receiver_threshold_limited": 0, "radius_limited": 0, "blocked": 0}
	for _, optimized := range result.OptimizedTowers {
		tower, ok := byID[optimized.ID]
		if !ok {
			return nil, fmt.Errorf("optimized tower %q is missing from canonical request", optimized.ID)
		}
		staticRequest := networkTowerToStaticRequest(network, tower, optimized.OptimalAzimuth)
		profile := staticRequest.RFProfile.normalized()
		threshold := receiverThresholdForProfileOrManual(profile)
		cell := map[string]int{"total_rays": 0, "receiver_threshold_limited": 0, "radius_limited": 0, "blocked": 0}
		for index := 0; index < staticRequest.Rays; index++ {
			angle := BeamAngleForIndex(profile.EffectiveAzimuth(staticRequest.AzimuthDeg), profile.EffectiveBeamWidthDeg(), staticRequest.Rays, index)
			terminal, err := simulateRayTerminalContext(context.Background(), Point{Lon: staticRequest.TowerLon, Lat: staticRequest.TowerLat}, index, angle, staticRequest, buildings)
			if err != nil {
				return nil, err
			}
			cell["total_rays"]++
			aggregate["total_rays"]++
			if terminal.distanceMeters < profile.RadiusMeters-0.01 {
				cell["receiver_threshold_limited"]++
				aggregate["receiver_threshold_limited"]++
			} else {
				cell["radius_limited"]++
				aggregate["radius_limited"]++
			}
			if terminal.blocked {
				cell["blocked"]++
				aggregate["blocked"]++
			}
		}
		perCell[optimized.ID] = map[string]any{
			"receiver_threshold": threshold,
			"distribution":       cell,
		}
	}
	return map[string]any{"aggregate": aggregate, "per_cell": perCell}, nil
}

func buildReceiverSensitivityExperimentMatrix() (receiverComparisonArtifact, error) {
	type frequencyCase struct {
		technology       string
		frequencyGHz     float64
		interferenceBand float64
	}
	frequencies := []frequencyCase{
		{technology: "4g", frequencyGHz: 2.6, interferenceBand: 20},
		{technology: "5g", frequencyGHz: 28, interferenceBand: 100},
	}
	noiseCases := []struct {
		bandwidthHz float64
		noiseFigure float64
		requiredSNR float64
	}{
		{bandwidthHz: 5e6, noiseFigure: 0, requiredSNR: 0},
		{bandwidthHz: 5e6, noiseFigure: 5, requiredSNR: 3},
		{bandwidthHz: 5e6, noiseFigure: 10, requiredSNR: 5},
		{bandwidthHz: 20e6, noiseFigure: 0, requiredSNR: 0},
		{bandwidthHz: 20e6, noiseFigure: 7, requiredSNR: 3},
		{bandwidthHz: 100e6, noiseFigure: 10, requiredSNR: 5},
		{bandwidthHz: 100e6, noiseFigure: 0, requiredSNR: 0},
		{bandwidthHz: 100e6, noiseFigure: 7, requiredSNR: 3},
		{bandwidthHz: 100e6, noiseFigure: 10, requiredSNR: 5},
	}
	artifact := receiverComparisonArtifact{
		SchemaVersion:             1,
		ReferenceConvention:       "rounded -174 dBm/Hz at 290 K; receiver noise bandwidth is independent from interference SCS/resource-element bandwidth",
		ManualBaselineByFrequency: []receiverComparisonBaseline{},
		DerivedExperimentMatrix:   []receiverComparisonCase{},
		Notes: []string{
			"Manual mode is the compatibility baseline at -115 dBm and remains the default for 4G, 5G, and 6G profiles.",
			"Reach is a controlled single-cell FSPL threshold probe with the same profile terms; it is not a network-optimization score.",
			"Building-entry rows compare zero-depth representative-facade low/high scenarios; outdoor building service remains the separate strict > -100 dBm rule.",
			"Interference rows retain the existing per-resource-element thermal-noise/SINR/RSRP/RSRQ model; receiver sensitivity only admits carriers before those KPIs are calculated.",
			"No row is a throughput, modulation, coding, UE conformance, or 140 GHz validation claim.",
		},
	}
	for _, frequency := range frequencies {
		manualProfile := receiverComparisonProfile(frequency.technology, frequency.frequencyGHz, frequency.interferenceBand)
		manualThreshold, err := ReceiverThresholdForProfile(manualProfile)
		if err != nil {
			return receiverComparisonArtifact{}, err
		}
		manualBaseline := receiverComparisonBaseline{
			NetworkTech: frequency.technology, FrequencyGHz: frequency.frequencyGHz,
			SensitivityDBm: manualThreshold.SensitivityDBm,
			ReachMeters:    controlledReceiverReach(manualProfile),
			BuildingEntry:  receiverComparisonBuildingForProfile(manualProfile),
			Interference:   receiverComparisonInterferenceForProfile(manualProfile, frequency.interferenceBand),
		}
		artifact.ManualBaselineByFrequency = append(artifact.ManualBaselineByFrequency, manualBaseline)
		for _, noise := range noiseCases {
			derivedProfile := manualProfile
			derivedProfile.ReceiverSensitivityMode = ReceiverSensitivityModeDerived
			derivedProfile.ReceiverNoiseBandwidthHz = noise.bandwidthHz
			derivedProfile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
			derivedProfile.ReceiverNoiseFigureDB = noise.noiseFigure
			derivedProfile.ReceiverRequiredSNRDB = noise.requiredSNR
			derivedProfile.ReceiverMarginDB = 0
			derivedThreshold, resolveErr := ReceiverThresholdForProfile(derivedProfile)
			if resolveErr != nil {
				return receiverComparisonArtifact{}, resolveErr
			}
			derivedBuilding := receiverComparisonBuildingForProfile(derivedProfile)
			derivedInterference := receiverComparisonInterferenceForProfile(derivedProfile, frequency.interferenceBand)
			artifact.DerivedExperimentMatrix = append(artifact.DerivedExperimentMatrix, receiverComparisonCase{
				NetworkTech: frequency.technology, FrequencyGHz: frequency.frequencyGHz,
				NoiseBandwidthHz: noise.bandwidthHz, NoiseBandwidthSource: ReceiverNoiseBandwidthSourceExplicit,
				NoiseFigureDB: noise.noiseFigure, RequiredSNRDB: noise.requiredSNR, ReceiverMarginDB: 0,
				ManualSensitivityDBm: manualThreshold.SensitivityDBm, DerivedSensitivityDBm: derivedThreshold.SensitivityDBm,
				SensitivityDeltaDB: derivedThreshold.SensitivityDBm - manualThreshold.SensitivityDBm,
				ManualReachMeters:  manualBaseline.ReachMeters, DerivedReachMeters: controlledReceiverReach(derivedProfile),
				ReachDeltaMeters:    controlledReceiverReach(derivedProfile) - manualBaseline.ReachMeters,
				ManualBuildingEntry: manualBaseline.BuildingEntry, DerivedBuildingEntry: derivedBuilding,
				ManualInterference: manualBaseline.Interference, DerivedInterference: derivedInterference,
			})
		}
	}
	return artifact, nil
}

func receiverComparisonProfile(technology string, frequencyGHz, interferenceBandwidthMHz float64) CellRFProfile {
	profile := DefaultPlanningCellRFProfile(technology, frequencyGHz, 30, 5000, 360, interferenceBandwidthMHz, 1, 1)
	profile.AntennaGainDBi = 0
	profile.RxAntennaGainDBi = 0
	profile.HorizontalPatternID = "omni"
	profile.VerticalPatternID = "flat"
	profile.ReceiverSensitivityMode = ReceiverSensitivityModeManual
	profile.ReceiverSensitivityDBm = DefaultReceiverSensitivityDBm
	return profile
}

func controlledReceiverReach(profile CellRFProfile) float64 {
	return sensitivityCrossingDistance(profile, 0, 100000, 0, 0, 0)
}

func receiverComparisonBuildingForProfile(profile CellRFProfile) receiverComparisonBuilding {
	building := &BuildingFootprint{
		ID: "receiver-comparison-building", Tags: map[string]string{"building": "apartments"}, DemandWeight: 1, ResidentialDemand: 1,
		Bounds:   Bounds{MinLon: 0.0008, MinLat: -0.0002, MaxLon: 0.0012, MaxLat: 0.0002},
		Vertices: []Point{{Lon: 0.0008, Lat: -0.0002}, {Lon: 0.0012, Lat: -0.0002}, {Lon: 0.0012, Lat: 0.0002}, {Lon: 0.0008, Lat: 0.0002}},
	}
	request := BuildingEntryAnalysisRequest{Network: NetworkOptimizationRequest{
		Towers:       []NetworkTowerRequest{{ID: "receiver-comparison-cell", TowerLon: 0, TowerLat: 0, AzimuthDeg: 90, RFProfile: profile}},
		RadiusMeters: profile.RadiusMeters, FrequencyGHz: profile.FrequencyGHz, TxPowerDBm: profile.TxPowerDBm,
		BeamWidthDeg: profile.BeamWidthDeg, RFProfile: profile,
	}, BuildingIDs: []string{building.ID}}
	response, err := AnalyzeBuildingEntryContext(context.Background(), request, NewBuildingIndex([]*BuildingFootprint{building}))
	if err != nil || len(response.Results) == 0 {
		return receiverComparisonBuilding{}
	}
	result := response.Results[0]
	return receiverComparisonBuilding{
		Available:    true,
		LowLossRxDBm: derefFloat(result.LowLossRxJustInsideDBm), HighLossRxDBm: derefFloat(result.HighLossRxJustInsideDBm),
		LowLossServiceable: derefBool(result.LowLossServiceable), HighLossServiceable: derefBool(result.HighLossServiceable),
		OutdoorServiceable: result.OutdoorServiceable, ReceiverThresholdDBm: derefFloat(result.ReceiverSensitivityDBm),
		BuildingServiceThresholdDBm: result.BuildingServiceThresholdDBm,
	}
}

func receiverComparisonInterferenceForProfile(profile CellRFProfile, interferenceBandwidthMHz float64) receiverComparisonInterference {
	origin := Point{Lon: 32, Lat: 39}
	request := InterferenceRequest{
		NetworkTech: profile.NetworkTech,
		Towers: []InterferenceTowerRequest{
			{ID: "receiver-comparison-a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90, RFProfile: profile},
			{ID: "receiver-comparison-b", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 90, RFProfile: profile},
		},
		RadiusMeters: profile.RadiusMeters, FrequencyGHz: profile.FrequencyGHz, TxPowerDBm: profile.TxPowerDBm,
		BeamWidthDeg: profile.BeamWidthDeg, BandwidthMHz: interferenceBandwidthMHz, LoadFactor: 1, ReuseFactor: 1,
		NoiseFigureDB: 7, SampleSpacingM: 200, RFProfile: profile,
	}
	NormalizeInterferenceRequest(&request)
	preset, err := interferencePresetFor(request.NetworkTech, request.BandwidthMHz)
	if err != nil {
		return receiverComparisonInterference{}
	}
	properties := evaluateInterferencePoint(request, preset, EmptyBuildingIndex(), DestinationPoint(origin, 90, 4500))
	threshold := 0.0
	if properties.ReceiverThreshold != nil {
		threshold = properties.ReceiverThreshold.SensitivityDBm
	}
	return receiverComparisonInterference{
		Available:            properties.QualityClass != "",
		NoSignal:             properties.QualityClass == "no_signal",
		Serviceable:          properties.Serviceable,
		ReceiverThresholdDBm: threshold,
		ReceiverLinkMarginDB: properties.ReceiverLinkMarginDB,
		RSRPDBm:              properties.RSRPDBm, SINRDB: properties.SINRDB, RSRQDB: properties.RSRQDB,
		ContributingCells: properties.ContributingCells,
	}
}
