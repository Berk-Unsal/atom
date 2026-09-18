package raytracer

import (
	"context"
	"fmt"
	"math"
	"os"
	"reflect"
	"testing"
	"time"
)

func TestRadioQualityObjectiveUsesStableServiceableFraction(t *testing.T) {
	stats := NetworkOptimizationStats{RawMetrics: OptimizationRawMetrics{
		RadioQualityTotalSamples:        4,
		RadioQualityServiceableSamples:  3,
		RadioQualityServiceableFraction: 0.75,
	}}
	config := OptimizationConfig{Objectives: []OptimizationObjective{{ID: radioQualityOptimizationObjectiveID, Weight: 100}}}
	scored, err := scoreNetworkOptimization(stats, config)
	if err != nil {
		t.Fatalf("score radio-quality objective: %v", err)
	}
	if scored.Objectives.RadioQuality != 0.75 || scored.CompositeScore != 0.75 {
		t.Fatalf("radio-quality score = objectives=%+v composite=%.6f, want 0.75", scored.Objectives, scored.CompositeScore)
	}
	status := scored.ObjectiveStatus[radioQualityOptimizationObjectiveID]
	if !status.Available || status.ConfiguredPriority != 100 || status.EffectiveWeight != 1 || status.Utility == nil || *status.Utility != 0.75 {
		t.Fatalf("radio-quality status = %+v", status)
	}
}

func TestRadioQualityCanBecomeAnEnabledRankingAndParetoDimension(t *testing.T) {
	left := optimizationStatsForTest(4, 5, 4, 5, 4, 5, 5, 0)
	left.RawMetrics.RadioQualityTotalSamples = 10
	left.RawMetrics.RadioQualityServiceableSamples = 2
	left.RawMetrics.RadioQualityServiceableFraction = 0.2
	right := left
	right.RawMetrics.RadioQualityServiceableSamples = 8
	right.RawMetrics.RadioQualityServiceableFraction = 0.8
	config := OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 0}, {ID: "residential", Weight: 0},
		{ID: "coverage", Weight: 0}, {ID: "overlap", Weight: 0},
		{ID: radioQualityOptimizationObjectiveID, Weight: 100},
	}}
	frontier := networkParetoFrontier([]networkOptimizationCandidate{
		{Azimuths: []float64{0}, Stats: left},
		{Azimuths: []float64{10}, Stats: right},
	}, []NetworkTowerRequest{{ID: "cell-a"}}, config)
	if len(frontier) != 1 || frontier[0].ID != "10.0" || frontier[0].Stats.Objectives.RadioQuality != 0.8 {
		t.Fatalf("enabled radio-quality Pareto frontier = %+v", frontier)
	}
}

func TestRadioQualityDisabledPreservesLegacyParetoDimensions(t *testing.T) {
	config := OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 25}, {ID: "residential", Weight: 25},
		{ID: "coverage", Weight: 25}, {ID: "overlap", Weight: 25},
	}}
	left := optimizationStatsForTest(4, 5, 4, 5, 4, 5, 5, 0)
	left.RawMetrics.RadioQualityTotalSamples = 10
	left.RawMetrics.RadioQualityServiceableSamples = 2
	left.RawMetrics.RadioQualityServiceableFraction = 0.2
	right := left
	right.RawMetrics.RadioQualityServiceableSamples = 9
	right.RawMetrics.RadioQualityServiceableFraction = 0.9

	leftScore, err := scoreNetworkOptimization(left, config)
	if err != nil {
		t.Fatalf("score left legacy candidate: %v", err)
	}
	rightScore, err := scoreNetworkOptimization(right, config)
	if err != nil {
		t.Fatalf("score right legacy candidate: %v", err)
	}
	if leftScore.CompositeScore != rightScore.CompositeScore {
		t.Fatalf("disabled radio quality changed legacy score: left=%.12f right=%.12f", leftScore.CompositeScore, rightScore.CompositeScore)
	}
	if status := leftScore.ObjectiveStatus[radioQualityOptimizationObjectiveID]; status.Available || status.Reason != "disabled" {
		t.Fatalf("disabled radio-quality status = %+v", status)
	}
	frontier := networkParetoFrontier([]networkOptimizationCandidate{
		{Azimuths: []float64{0}, Stats: left},
		{Azimuths: []float64{10}, Stats: right},
	}, []NetworkTowerRequest{{ID: "cell-a"}}, config)
	if len(frontier) != 2 {
		t.Fatalf("disabled radio quality changed Pareto dimensions: frontier=%+v", frontier)
	}
}

func TestRadioQualityFixedDomainCountsNoCarrierSamples(t *testing.T) {
	profile := DefaultCellRFProfile("4g", 2.6, 43, 400, 360, 20, 0.7, 1)
	profile.HorizontalPatternID = AntennaPatternOmniID
	cell := radioQualityOptimizationCell{
		id: "serving", profile: profile, receiverThreshold: receiverThresholdForProfileOrManual(profile),
		preset: mustInterferencePreset(t, "4g", 20), links: []radioQualityOptimizationLink{
			{inHorizon: true, geometryValid: true, distanceM: 100, bearingDeg: 0, endpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O)},
			{inHorizon: false, geometryValid: true, distanceM: 500, bearingDeg: 0, endpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O)},
		},
	}
	evaluationContext := &radioQualityOptimizationContext{
		samples: []gridSample{{point: Point{Lon: 32.0, Lat: 39.0}, row: 0, col: 0}, {point: Point{Lon: 32.01, Lat: 39.0}, row: 1, col: 0}},
		cells:   []radioQualityOptimizationCell{cell}, noiseFigureDB: 7,
	}
	first, err := evaluationContext.evaluate(context.Background(), []float64{0})
	if err != nil {
		t.Fatalf("evaluate fixed-domain candidate: %v", err)
	}
	second, err := evaluationContext.evaluate(context.Background(), []float64{180})
	if err != nil {
		t.Fatalf("evaluate second fixed-domain candidate: %v", err)
	}
	if first.RadioQualityTotalSamples != 2 || second.RadioQualityTotalSamples != 2 {
		t.Fatalf("fixed-domain sample counts = %d and %d, want both 2", first.RadioQualityTotalSamples, second.RadioQualityTotalSamples)
	}
	if first.RadioQualityOutageByReason["no_carrier"] != 1 || first.RadioQualityServiceableSamples != 1 {
		t.Fatalf("fixed-domain failures = %+v serviceable=%d, want one no-carrier and one serviceable", first.RadioQualityOutageByReason, first.RadioQualityServiceableSamples)
	}
	if first.RadioQualityServiceableFraction != 0.5 || second.RadioQualityServiceableFraction != 0.5 {
		t.Fatalf("fixed-domain fractions = %.6f and %.6f, want 0.5", first.RadioQualityServiceableFraction, second.RadioQualityServiceableFraction)
	}
}

func TestRadioQualitySubSensitivityInterferersAccumulateAndChannelsSeparate(t *testing.T) {
	profile := DefaultCellRFProfile("4g", 2.6, 43, 400, 360, 20, 0.7, 1)
	profile.HorizontalPatternID = AntennaPatternOmniID
	preset := mustInterferencePreset(t, "4g", 20)
	serving := radioQualityOptimizationCell{
		id: "serving", profile: profile, receiverThreshold: ReceiverThreshold{Mode: ReceiverSensitivityModeManual, SensitivityDBm: -200}, preset: preset,
		links: []radioQualityOptimizationLink{{inHorizon: true, geometryValid: true, distanceM: 100, bearingDeg: 0, endpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O)}},
	}
	interfererProfile := profile
	interfererProfile.ChannelID = "CH-1"
	interferer := radioQualityOptimizationCell{
		id: "sub-sensitivity", profile: interfererProfile, receiverThreshold: ReceiverThreshold{Mode: ReceiverSensitivityModeManual, SensitivityDBm: 0}, preset: preset,
		links: []radioQualityOptimizationLink{{inHorizon: true, geometryValid: true, distanceM: 120, bearingDeg: 0, endpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O)}},
	}
	contextWithInterferer := &radioQualityOptimizationContext{
		samples: []gridSample{{point: Point{Lon: 32, Lat: 39}, row: 0, col: 0}},
		cells:   []radioQualityOptimizationCell{serving, interferer}, noiseFigureDB: 7,
	}
	withSameChannel, err := contextWithInterferer.evaluate(context.Background(), []float64{0, 0})
	if err != nil {
		t.Fatalf("evaluate same-channel sub-sensitivity interferer: %v", err)
	}
	differentChannel := interferer
	differentChannel.profile.ChannelID = "CH-2"
	contextWithDifferentChannel := *contextWithInterferer
	contextWithDifferentChannel.cells = []radioQualityOptimizationCell{serving, differentChannel}
	withoutInterference, err := contextWithDifferentChannel.evaluate(context.Background(), []float64{0, 0})
	if err != nil {
		t.Fatalf("evaluate different-channel interferer: %v", err)
	}
	if *withSameChannel.RadioQualityP10SINRDB >= *withoutInterference.RadioQualityP10SINRDB {
		t.Fatalf("sub-sensitivity same-channel SINR=%.6f is not below different-channel SINR=%.6f", *withSameChannel.RadioQualityP10SINRDB, *withoutInterference.RadioQualityP10SINRDB)
	}
	if *withSameChannel.RadioQualityP10RSRPDBm != *withoutInterference.RadioQualityP10RSRPDBm {
		t.Fatalf("different channel changed serving RSRP: same=%.6f different=%.6f", *withSameChannel.RadioQualityP10RSRPDBm, *withoutInterference.RadioQualityP10RSRPDBm)
	}

	secondInterferer := interferer
	secondInterferer.id = "sub-sensitivity-2"
	secondInterferer.links = append([]radioQualityOptimizationLink(nil), interferer.links...)
	contextWithTwoInterferers := *contextWithInterferer
	contextWithTwoInterferers.cells = []radioQualityOptimizationCell{serving, interferer, secondInterferer}
	withTwo, err := contextWithTwoInterferers.evaluate(context.Background(), []float64{0, 0, 0})
	if err != nil {
		t.Fatalf("evaluate two sub-sensitivity interferers: %v", err)
	}
	if *withTwo.RadioQualityP10SINRDB >= *withSameChannel.RadioQualityP10SINRDB {
		t.Fatalf("two sub-sensitivity interferers did not accumulate: one=%.6f two=%.6f", *withSameChannel.RadioQualityP10SINRDB, *withTwo.RadioQualityP10SINRDB)
	}
}

func TestRadioQualityObjectiveAvailabilityByTechnology(t *testing.T) {
	unsupportedProfile := DefaultCellRFProfile("6g", 140, 30, 400, 120, 400, 0.7, 1)
	unsupportedRequest := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "6g-a", TowerLon: 32.0, TowerLat: 39.0, RFProfile: unsupportedProfile},
			{ID: "6g-b", TowerLon: 32.001, TowerLat: 39.0, RFProfile: unsupportedProfile},
		},
		Rays: 12, RadiusMeters: 400, FrequencyGHz: 140, TxPowerDBm: 30, BeamWidthDeg: 120,
		RFProfile:    unsupportedProfile,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 50}, {ID: radioQualityOptimizationObjectiveID, Weight: 50}}},
	}
	_, metadata, err := prepareRadioQualityOptimizationContext(context.Background(), unsupportedRequest, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("prepare unsupported 140 GHz objective: %v", err)
	}
	if !metadata.Enabled || metadata.Available || metadata.Reason != RadioQualityOptimizationUnavailableReason {
		t.Fatalf("140 GHz radio-quality metadata = %+v", metadata)
	}
	weights, err := NormalizeAvailableOptimizationPriorities(unsupportedRequest.Optimization.Objectives, map[string]OptimizationObjectiveAvailability{
		"coverage": {Available: true}, radioQualityOptimizationObjectiveID: {Available: false, Reason: RadioQualityOptimizationUnavailableReason},
	})
	if err != nil || weights["coverage"] != 1 || weights[radioQualityOptimizationObjectiveID] != 0 {
		t.Fatalf("unsupported radio-quality weights = %v, err=%v", weights, err)
	}

	supportedProfile := DefaultCellRFProfile("4g", 2.6, 43, 120, 360, 20, 0.7, 1)
	supportedRequest := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "4g-a", TowerLon: 32.0, TowerLat: 39.0, RFProfile: supportedProfile},
			{ID: "4g-b", TowerLon: 32.001, TowerLat: 39.0, RFProfile: supportedProfile},
		},
		Rays: 12, RadiusMeters: 120, FrequencyGHz: 2.6, TxPowerDBm: 43, BeamWidthDeg: 360,
		RFProfile:    supportedProfile,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 50}, {ID: radioQualityOptimizationObjectiveID, Weight: 50}}},
	}
	prepared, metadata, err := prepareRadioQualityOptimizationContext(context.Background(), supportedRequest, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("prepare supported 2.6 GHz objective: %v", err)
	}
	if prepared == nil || !metadata.Enabled || !metadata.Available || metadata.SampleCount == 0 || metadata.DomainID == "" {
		t.Fatalf("2.6 GHz radio-quality metadata/context = %+v / %#v", metadata, prepared)
	}
	first, err := prepared.evaluate(context.Background(), []float64{0, 180})
	if err != nil {
		t.Fatalf("evaluate supported 2.6 GHz objective: %v", err)
	}
	second, err := prepared.evaluate(context.Background(), []float64{180, 0})
	if err != nil {
		t.Fatalf("evaluate second supported 2.6 GHz objective: %v", err)
	}
	if first.RadioQualityTotalSamples != metadata.SampleCount || second.RadioQualityTotalSamples != metadata.SampleCount {
		t.Fatalf("2.6 GHz candidate denominators = %d and %d, metadata=%d", first.RadioQualityTotalSamples, second.RadioQualityTotalSamples, metadata.SampleCount)
	}
}

func TestRadioQualityScenarioFingerprintTracksSemantics(t *testing.T) {
	request := canonicalAnkaraNetworkOptimizationRequest()
	disabled := NetworkScenarioFingerprint(request)
	enabledRequest := request
	enabledRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 40}, {ID: "residential", Weight: 20}, {ID: "coverage", Weight: 20}, {ID: "overlap", Weight: 10}, {ID: radioQualityOptimizationObjectiveID, Weight: 10},
	}}
	enabled := NetworkScenarioFingerprint(enabledRequest)
	if disabled == enabled {
		t.Fatalf("enabling radio quality did not change fingerprint: %s", disabled)
	}
	priorityChange := enabledRequest
	priorityChange.Optimization.Objectives[4].Weight = 20
	if NetworkScenarioFingerprint(priorityChange) == enabled {
		t.Fatal("changing radio-quality priority did not change fingerprint")
	}
	if NetworkScenarioFingerprint(enabledRequest) != NetworkScenarioFingerprint(enabledRequest) {
		t.Fatal("identical radio-quality scenario fingerprint is not deterministic")
	}
}

func TestCanonicalAnkaraRadioQualityOptimizationIsDeterministicWhenEnabled(t *testing.T) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" || os.Getenv("ATOM_RUN_CANONICAL_RADIO_QUALITY") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CANONICAL_RADIO_QUALITY=1 to run the enabled Ankara radio-quality experiment")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load canonical dataset: %v", err)
	}
	request := canonicalAnkaraNetworkOptimizationRequest()
	request.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 40}, {ID: "residential", Weight: 20}, {ID: "coverage", Weight: 20}, {ID: "overlap", Weight: 10}, {ID: radioQualityOptimizationObjectiveID, Weight: 10},
	}}
	started := time.Now()
	first, err := OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
	firstDuration := time.Since(started)
	if err != nil {
		t.Fatalf("first enabled canonical optimization: %v", err)
	}
	started = time.Now()
	second, err := OptimizeNetworkContext(context.Background(), request, pack.BuildingIndex)
	secondDuration := time.Since(started)
	if err != nil {
		t.Fatalf("second enabled canonical optimization: %v", err)
	}
	if !reflect.DeepEqual(first.Baseline, second.Baseline) || !reflect.DeepEqual(first.Stats, second.Stats) || !reflect.DeepEqual(first.Optimization, second.Optimization) || !reflect.DeepEqual(first.ParetoFrontier, second.ParetoFrontier) || first.ScenarioFingerprint != second.ScenarioFingerprint {
		t.Fatal("enabled canonical radio-quality optimization is not deterministic")
	}
	if first.Optimization.RadioQuality == nil || !first.Optimization.RadioQuality.Available || first.Stats.RawMetrics.RadioQualityTotalSamples == 0 {
		t.Fatalf("enabled canonical radio-quality metadata/stats = %+v / %+v", first.Optimization.RadioQuality, first.Stats.RawMetrics)
	}
	t.Logf("enabled canonical priority_vector=[40,20,20,10,10] runtime_ms={first=%.1f second=%.1f} fingerprint=%s domain_id=%s samples=%d baseline={score=%.4f demand=%.4f residential=%d reach=%.4f overlap=%.6f radio=%.6f p10_sinr=%s median_sinr=%s outages=%v} optimized={score=%.4f demand=%.4f residential=%d reach=%.4f overlap=%.6f radio=%.6f p10_sinr=%s median_sinr=%s outages=%v} pareto=%d recommended=%s",
		float64(firstDuration.Microseconds())/1000, float64(secondDuration.Microseconds())/1000, first.ScenarioFingerprint, first.Optimization.RadioQuality.DomainID, first.Stats.RawMetrics.RadioQualityTotalSamples,
		first.Baseline.Stats.Score, first.Baseline.Stats.RawMetrics.ServedDemandWeight, first.Baseline.Stats.RawMetrics.ResidentialCovered, first.Baseline.Stats.RawMetrics.PropagationReachScore, first.Baseline.Stats.RawMetrics.OverlapRatio, first.Baseline.Stats.RawMetrics.RadioQualityServiceableFraction, formatOptionalRadioMetric(first.Baseline.Stats.RawMetrics.RadioQualityP10SINRDB), formatOptionalRadioMetric(first.Baseline.Stats.RawMetrics.RadioQualityMedianSINRDB), first.Baseline.Stats.RawMetrics.RadioQualityOutageByReason,
		first.Stats.Score, first.Stats.RawMetrics.ServedDemandWeight, first.Stats.RawMetrics.ResidentialCovered, first.Stats.RawMetrics.PropagationReachScore, first.Stats.RawMetrics.OverlapRatio, first.Stats.RawMetrics.RadioQualityServiceableFraction, formatOptionalRadioMetric(first.Stats.RawMetrics.RadioQualityP10SINRDB), formatOptionalRadioMetric(first.Stats.RawMetrics.RadioQualityMedianSINRDB), first.Stats.RawMetrics.RadioQualityOutageByReason,
		len(first.ParetoFrontier), first.Optimization.RecommendedSolutionID)
	for index, solution := range first.ParetoFrontier {
		raw := solution.Stats.RawMetrics
		t.Logf("enabled pareto[%d] id=%s score=%.4f demand=%.4f residential=%d reach=%.4f overlap=%.6f radio=%.6f p10_sinr=%s median_sinr=%s outages=%v", index, solution.ID, solution.Score, raw.ServedDemandWeight, raw.ResidentialCovered, raw.PropagationReachScore, raw.OverlapRatio, raw.RadioQualityServiceableFraction, formatOptionalRadioMetric(raw.RadioQualityP10SINRDB), formatOptionalRadioMetric(raw.RadioQualityMedianSINRDB), raw.RadioQualityOutageByReason)
	}
}

func mustInterferencePreset(t *testing.T, networkTech string, bandwidthMHz float64) interferencePreset {
	t.Helper()
	preset, err := interferencePresetFor(networkTech, bandwidthMHz)
	if err != nil {
		t.Fatalf("interference preset: %v", err)
	}
	return preset
}

func formatOptionalRadioMetric(value *float64) string {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) {
		return "n/a"
	}
	return formatFloatForTest(*value)
}

func formatFloatForTest(value float64) string {
	return fmt.Sprintf("%.4f", value)
}
