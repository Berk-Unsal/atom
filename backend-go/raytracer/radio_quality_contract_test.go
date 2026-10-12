package raytracer

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"
)

func TestCarrierPowerReferenceResourceConversionIsReversible(t *testing.T) {
	preset, err := interferencePresetFor("4g", 20)
	if err != nil {
		t.Fatal(err)
	}
	carrierDBm := -80.0
	referenceDBm, ok := carrierPowerToReferencePower(carrierDBm, preset)
	if !ok {
		t.Fatal("carrier power was rejected")
	}
	if want := carrierDBm - 10*math.Log10(1200); math.Abs(referenceDBm-want) > 1e-12 {
		t.Fatalf("reference power = %.12f, want %.12f", referenceDBm, want)
	}
	roundTrip, ok := referencePowerToCarrierPower(referenceDBm, preset)
	if !ok || math.Abs(roundTrip-carrierDBm) > 1e-12 {
		t.Fatalf("carrier round trip = %.12f, want %.12f", roundTrip, carrierDBm)
	}
}

func TestControlledRadioQualityPowerFixtures(t *testing.T) {
	tests := []struct {
		name       string
		interferer float64
		noise      float64
		wantSINRDB float64
		wantRSRQDB float64
	}{
		{name: "equal_power", interferer: 1, noise: 1e-12, wantSINRDB: 0, wantRSRQDB: -10 * math.Log10(12*2)},
		{name: "ten_db_weaker", interferer: 0.1, noise: 1e-12, wantSINRDB: 10 * math.Log10(1.0/0.1), wantRSRQDB: -10 * math.Log10(12*1.1)},
		{name: "ten_db_stronger", interferer: 10, noise: 1e-12, wantSINRDB: 10 * math.Log10(1.0/10), wantRSRQDB: -10 * math.Log10(12*11)},
		{name: "noise_dominated", interferer: 0, noise: 0.1, wantSINRDB: 10, wantRSRQDB: -10 * math.Log10(12*1.1)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			metrics := computeRadioQualityMetrics(1, test.interferer, test.noise, 100)
			if math.Abs(metrics.SINRDB-test.wantSINRDB) > 1e-8 {
				t.Fatalf("SINR = %.12f, want %.12f", metrics.SINRDB, test.wantSINRDB)
			}
			if math.Abs(metrics.RSRQDB-test.wantRSRQDB) > 1e-8 {
				t.Fatalf("RSRQ = %.12f, want %.12f", metrics.RSRQDB, test.wantRSRQDB)
			}
			if metrics.RSSIMW <= 0 || !isFiniteRadioValue(metrics.RSSIDBm) {
				t.Fatalf("invalid RSSI metrics: %+v", metrics)
			}
		})
	}
}

func TestExplicitWeakerServingCellIsPreserved(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	req.Towers[1].RFProfile.TxPowerDBm = 40
	req.ServingCellID = "a"
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.ServingCellID != "a" || properties.ServingSelectionMode != RadioQualityServingSelectionExplicit {
		t.Fatalf("explicit serving selection = %q/%q", properties.ServingCellID, properties.ServingSelectionMode)
	}
	if properties.SINRDB == nil || *properties.SINRDB >= 0 {
		t.Fatalf("explicit weaker serving SINR = %v, want interference-dominated negative value", properties.SINRDB)
	}
	if properties.StrongestInterfererID != "b" || properties.InterfererCount != 1 {
		t.Fatalf("stronger interferer diagnostics = %q/%d", properties.StrongestInterfererID, properties.InterfererCount)
	}
}

func TestBelowSensitivityNonServingCellStillContributesAndCannotServe(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 60)
	baseline := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	carrierDBm := ledgerCarrierPower(t, baseline.PowerLedger, "b")

	req.Towers[1].RFProfile.ReceiverSensitivityMode = ReceiverSensitivityModeManual
	req.Towers[1].RFProfile.ReceiverSensitivityDBm = carrierDBm + 1
	NormalizeInterferenceRequest(&req)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	entry := ledgerEntryForCell(t, properties.PowerLedger, "b")
	if properties.ServingCellID != "a" {
		t.Fatalf("automatic serving cell = %q, want receiver-admitted cell a", properties.ServingCellID)
	}
	if entry.Eligible == false || entry.ServingEligible {
		t.Fatalf("sub-sensitivity interferer eligibility = eligible:%v serving:%v, want true:false", entry.Eligible, entry.ServingEligible)
	}
	if entry.ExclusionReason != "below_receiver_sensitivity" || !entry.ChannelMatch || entry.LoadedPowerMW == nil || *entry.LoadedPowerMW <= 0 {
		t.Fatalf("sub-sensitivity interferer ledger = %+v", entry)
	}
	if properties.InterfererCount != 1 || properties.InterferencePowerMW == nil || *properties.InterferencePowerMW <= 0 {
		t.Fatalf("sub-sensitivity interferer contribution = count:%d power:%v", properties.InterfererCount, properties.InterferencePowerMW)
	}
	if baseline.InterferencePowerMW == nil || math.Abs(*properties.InterferencePowerMW-*baseline.InterferencePowerMW) > *baseline.InterferencePowerMW*1e-9 {
		t.Fatalf("receiver sensitivity changed non-serving interference: baseline:%v below:%v", baseline.InterferencePowerMW, properties.InterferencePowerMW)
	}

	req.ServingCellID = "b"
	explicit := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if explicit.RSRPDBm != nil || explicit.ServiceabilityStatus != "unavailable" || len(explicit.ServiceabilityFailures) != 1 || explicit.ServiceabilityFailures[0] != "serving_cell_unavailable" {
		t.Fatalf("explicit sub-sensitivity serving admission = %+v, want unavailable", explicit)
	}
}

func TestMultipleSubSensitivityInterferersSumInLinearDomain(t *testing.T) {
	base := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&base)
	preset, _ := interferencePresetFor(base.NetworkTech, base.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 60)
	baseProperties := evaluateInterferencePoint(base, preset, EmptyBuildingIndex(), point)
	carrierDBm := ledgerCarrierPower(t, baseProperties.PowerLedger, "b")

	req := base
	req.Towers = make([]InterferenceTowerRequest, 10)
	for index := range req.Towers {
		tower := base.Towers[1]
		tower.ID = fmt.Sprintf("i-%02d", index)
		if index == 0 {
			tower = base.Towers[0]
			tower.ID = "a"
		} else {
			tower.RFProfile.ReceiverSensitivityMode = ReceiverSensitivityModeManual
			tower.RFProfile.ReceiverSensitivityDBm = carrierDBm + 1
		}
		req.Towers[index] = tower
	}
	NormalizeInterferenceRequest(&req)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.ServingCellID != "a" || properties.InterfererCount != 9 {
		t.Fatalf("ten-cell serving/interferer selection = %q/%d, want a/9", properties.ServingCellID, properties.InterfererCount)
	}
	if properties.InterferencePowerMW == nil || *properties.InterferencePowerMW <= 0 {
		t.Fatalf("linear aggregate interference = %v", properties.InterferencePowerMW)
	}
	var ledgerSum float64
	for _, entry := range properties.PowerLedger {
		if entry.CellID == "a" {
			continue
		}
		if !entry.Eligible || entry.ServingEligible || entry.LoadedPowerMW == nil {
			t.Fatalf("sub-sensitivity ledger entry = %+v", entry)
		}
		ledgerSum += *entry.LoadedPowerMW
	}
	if math.Abs(ledgerSum-*properties.InterferencePowerMW) > ledgerSum*1e-9 {
		t.Fatalf("ledger sum = %.18g, aggregate = %.18g", ledgerSum, *properties.InterferencePowerMW)
	}
}

func TestSubSensitivityDifferentChannelStillExcluded(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 60)
	baseline := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	carrierDBm := ledgerCarrierPower(t, baseline.PowerLedger, "b")
	req.ServingCellID = "a"
	req.Towers[1].RFProfile.ChannelID = "different"
	req.Towers[1].RFProfile.ReceiverSensitivityMode = ReceiverSensitivityModeManual
	req.Towers[1].RFProfile.ReceiverSensitivityDBm = carrierDBm + 1
	NormalizeInterferenceRequest(&req)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	entry := ledgerEntryForCell(t, properties.PowerLedger, "b")
	if properties.InterferencePowerMW == nil || *properties.InterferencePowerMW != 0 {
		t.Fatalf("different-channel sub-sensitivity interference = %v, want zero", properties.InterferencePowerMW)
	}
	if entry.Eligible == false || entry.ServingEligible || entry.ChannelMatch || entry.ExclusionReason != "different_channel" {
		t.Fatalf("different-channel sub-sensitivity ledger = %+v", entry)
	}
}

func TestDifferentTechnologyIsNotCoChannel(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	req.ServingCellID = "a"
	req.Towers[1].RFProfile.NetworkTech = "5g"
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 60)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	entry := ledgerEntryForCell(t, properties.PowerLedger, "b")
	if properties.InterferencePowerMW == nil || *properties.InterferencePowerMW != 0 {
		t.Fatalf("different-technology interference = %v, want zero", properties.InterferencePowerMW)
	}
	if entry.ChannelMatch || entry.ExclusionReason != "different_technology" {
		t.Fatalf("different-technology ledger = %+v", entry)
	}
}

func TestLinearAggregationAndNumericFloorAreSeparateFromSensitivity(t *testing.T) {
	tenEqualDBm := MilliwattsToDBm(10 * DBmToMilliwatts(-116))
	if math.Abs(tenEqualDBm-(-106)) > 1e-12 {
		t.Fatalf("ten equal -116 dBm signals aggregate to %.12f dBm, want -106 dBm", tenEqualDBm)
	}
	if _, ok := referencePowerMilliwatts(-4000); ok {
		t.Fatal("underflowed reference power was not rejected by the numerical floor")
	}
	if ReceiverUsableSignal(-4000, -180) {
		t.Fatal("numerical-floor signal was treated as receiver-admitted")
	}
	if _, ok := referencePowerMilliwatts(-114); !ok {
		t.Fatal("finite above-floor reference power was rejected")
	}
}

func TestInterferenceHorizonUsesEffectivePerCellRadius(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	req.Towers[1].RFProfile.RadiusMeters = 50
	NormalizeInterferenceRequest(&req)
	response, err := AnalyzeInterferenceContext(context.Background(), req, EmptyBuildingIndex())
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Model.InterferenceHorizonMeters) != 2 || response.Model.InterferenceHorizonMeters[0] != 100 || response.Model.InterferenceHorizonMeters[1] != 50 {
		t.Fatalf("interference horizons = %v, want [100 50]", response.Model.InterferenceHorizonMeters)
	}
	if response.Model.InterferenceHorizonSource != RadioQualityInterferenceHorizonSource || response.Model.InterferenceHorizonSemantics != RadioQualityInterferenceHorizonSemantics {
		t.Fatalf("interference horizon metadata = %q/%q", response.Model.InterferenceHorizonSource, response.Model.InterferenceHorizonSemantics)
	}
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 75)
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	entry := ledgerEntryForCell(t, properties.PowerLedger, "b")
	if entry.ExclusionReason != "outside_radius" || entry.Eligible || entry.ServingEligible {
		t.Fatalf("outside-horizon ledger = %+v", entry)
	}
}

func ledgerEntryForCell(t *testing.T, ledger []RadioQualityPowerLedgerEntry, cellID string) RadioQualityPowerLedgerEntry {
	t.Helper()
	for _, entry := range ledger {
		if entry.CellID == cellID {
			return entry
		}
	}
	t.Fatalf("ledger did not contain cell %q", cellID)
	return RadioQualityPowerLedgerEntry{}
}

func ledgerCarrierPower(t *testing.T, ledger []RadioQualityPowerLedgerEntry, cellID string) float64 {
	t.Helper()
	entry := ledgerEntryForCell(t, ledger, cellID)
	if entry.ReceivedCarrierPowerDBm == nil {
		t.Fatalf("ledger cell %q has no received carrier power: %+v", cellID, entry)
	}
	return *entry.ReceivedCarrierPowerDBm
}

func TestPowerLedgerExplainsDifferentChannelExclusion(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	req.Towers[0].RFProfile.ChannelID = "A"
	req.Towers[1].RFProfile.ChannelID = "B"
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
	properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
	if properties.InterferencePowerMW == nil || *properties.InterferencePowerMW != 0 {
		t.Fatalf("different-channel interference power = %v, want zero", properties.InterferencePowerMW)
	}
	var excluded *RadioQualityPowerLedgerEntry
	for index := range properties.PowerLedger {
		if properties.PowerLedger[index].CellID == "b" {
			excluded = &properties.PowerLedger[index]
		}
	}
	if excluded == nil || excluded.ExclusionReason != "different_channel" || excluded.ChannelMatch {
		t.Fatalf("channel exclusion ledger = %+v", excluded)
	}
}

func TestPowerLedgerExplainsFrequencyAndBandwidthExclusion(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*CellRFProfile)
		want   string
	}{
		{name: "frequency", mutate: func(profile *CellRFProfile) { profile.FrequencyGHz = 2.7 }, want: "different_frequency"},
		{name: "bandwidth", mutate: func(profile *CellRFProfile) { profile.BandwidthMHz = 10 }, want: "different_bandwidth"},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := testInterferenceRequest(1)
			NormalizeInterferenceRequest(&req)
			req.ServingCellID = "a"
			test.mutate(&req.Towers[1].RFProfile)
			preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
			point := DestinationPoint(Point{Lon: 32, Lat: 39}, 90, 10)
			properties := evaluateInterferencePoint(req, preset, EmptyBuildingIndex(), point)
			if properties.InterferencePowerMW == nil || *properties.InterferencePowerMW != 0 {
				t.Fatalf("mismatched-carrier interference power = %v, want zero", properties.InterferencePowerMW)
			}
			found := false
			for _, entry := range properties.PowerLedger {
				if entry.CellID == "b" && entry.ExclusionReason != test.want {
					t.Fatalf("ledger exclusion = %q, want %q", entry.ExclusionReason, test.want)
				}
				if entry.CellID == "b" {
					found = true
				}
			}
			if !found {
				t.Fatal("ledger did not include cell b")
			}
		})
	}
}

func TestServiceabilityBoundaryAndFailureReasons(t *testing.T) {
	if failures := radioQualityServiceabilityFailures(-110, 0, -20); len(failures) != 0 {
		t.Fatalf("threshold boundary failures = %v", failures)
	}
	failures := radioQualityServiceabilityFailures(-110.1, -0.1, -20.1)
	if got := radioQualityServiceabilityStatus(failures); got != "multiple_thresholds_below" {
		t.Fatalf("failure status = %q, want multiple_thresholds_below", got)
	}
	if len(failures) != 3 {
		t.Fatalf("failure reasons = %v", failures)
	}
}

func TestScenarioFingerprintsAreStableAndRFSensitive(t *testing.T) {
	req := testInterferenceRequest(1)
	NormalizeInterferenceRequest(&req)
	reordered := req
	reordered.Towers = append([]InterferenceTowerRequest(nil), req.Towers[1], req.Towers[0])
	if left, right := InterferenceScenarioFingerprint(req), InterferenceScenarioFingerprint(reordered); left != right {
		t.Fatalf("tower ordering changed fingerprint: %q != %q", left, right)
	}
	reordered.NoiseFigureDB += 1
	if InterferenceScenarioFingerprint(req) == InterferenceScenarioFingerprint(reordered) {
		t.Fatal("noise figure did not change interference fingerprint")
	}
	reqNetwork := NetworkOptimizationRequest{
		Towers:       []NetworkTowerRequest{{ID: "b", TowerLon: 32.01, TowerLat: 39}, {ID: "a", TowerLon: 32, TowerLat: 39}},
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 50}, {ID: "demand", Weight: 50}}},
	}
	reorderedNetwork := reqNetwork
	reorderedNetwork.Towers = append([]NetworkTowerRequest(nil), reqNetwork.Towers[1], reqNetwork.Towers[0])
	if NetworkScenarioFingerprint(reqNetwork) != NetworkScenarioFingerprint(reorderedNetwork) {
		t.Fatal("network tower ordering changed fingerprint")
	}
	priorityChanged := reqNetwork
	priorityChanged.Optimization.Objectives = []OptimizationObjective{{ID: "coverage", Weight: 80}, {ID: "demand", Weight: 20}}
	if NetworkScenarioFingerprint(reqNetwork) == NetworkScenarioFingerprint(priorityChanged) {
		t.Fatal("optimization priorities did not change network fingerprint")
	}
}

func TestCanonicalAnkaraInterferenceContractAfterChange(t *testing.T) {
	if os.Getenv("ATOM_RUN_CANONICAL_4H1") != "1" {
		t.Skip("set ATOM_RUN_CANONICAL_4H1=1 to capture the canonical Concept 4H.1 comparison")
	}
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		t.Fatal("ATOM_DATASET_DIR is required")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatal(err)
	}
	network := canonicalAnkaraNetworkOptimizationRequest()
	NormalizeNetworkOptimizationRequest(&network)
	request := canonicalAntennaComparisonInterferenceRequest(network)
	response, err := AnalyzeInterferenceContext(context.Background(), request, pack.BuildingIndex)
	if err != nil {
		t.Fatal(err)
	}
	var sample *InterferenceProperties
	subSensitivitySamples := 0
	removedLoadedInterferenceMW := 0.0
	subSensitivityOnlySamples := 0
	maxSubSensitivityInterferenceDBm := math.Inf(-1)
	maxSubSensitivitySINRDeltaDB := 0.0
	for index := range response.GeoJSON.Features {
		candidate := &response.GeoJSON.Features[index].Properties
		if sample == nil && candidate.RSRPDBm != nil {
			sample = candidate
		}
		if candidate.InterferencePowerMW == nil {
			continue
		}
		removedMW := 0.0
		for _, entry := range candidate.PowerLedger {
			if entry.Role == "interferer" && !entry.ServingEligible && entry.LoadedPowerMW != nil {
				removedMW += *entry.LoadedPowerMW
			}
		}
		if removedMW > 0 {
			subSensitivitySamples++
			removedLoadedInterferenceMW += removedMW
			maxSubSensitivityInterferenceDBm = math.Max(maxSubSensitivityInterferenceDBm, MilliwattsToDBm(*candidate.InterferencePowerMW))
			withoutSubSensitivityMW := *candidate.InterferencePowerMW - removedMW
			if withoutSubSensitivityMW <= 0 {
				subSensitivityOnlySamples++
			}
			if candidate.DesiredSignalPowerMW != nil && candidate.ThermalNoisePowerMW != nil {
				currentSINR := computeRadioQualityMetrics(*candidate.DesiredSignalPowerMW, *candidate.InterferencePowerMW, *candidate.ThermalNoisePowerMW, response.Model.ResourceBlocks).SINRDB
				withoutSINR := computeRadioQualityMetrics(*candidate.DesiredSignalPowerMW, math.Max(withoutSubSensitivityMW, 0), *candidate.ThermalNoisePowerMW, response.Model.ResourceBlocks).SINRDB
				maxSubSensitivitySINRDeltaDB = math.Max(maxSubSensitivitySINRDeltaDB, math.Abs(currentSINR-withoutSINR))
			}
		}
	}
	record := map[string]any{
		"scenario_fingerprint": response.Model.ScenarioFingerprint,
		"stats":                response.Stats,
		"model": map[string]any{
			"measurement_family":          response.Model.MeasurementFamily,
			"resource_blocks":             response.Model.ResourceBlocks,
			"noise_bandwidth_hz":          response.Model.InterferenceNoiseBandwidthHz,
			"noise_bandwidth_source":      response.Model.NoiseBandwidthSource,
			"rsrp_conversion_id":          response.Model.RSRPConversionID,
			"serving_selection_mode":      response.Model.ServingSelectionMode,
			"co_channel_eligibility_rule": response.Model.CoChannelEligibilityRule,
			"optimization_coupling":       response.Model.OptimizationCoupling,
			"interference_horizon_source": response.Model.InterferenceHorizonSource,
			"interference_horizon_meters": response.Model.InterferenceHorizonMeters,
		},
		"sub_sensitivity_interference": map[string]any{
			"samples_with_contribution":         subSensitivitySamples,
			"samples_with_only_sub_sensitivity": subSensitivityOnlySamples,
			"removed_loaded_interference_mw":    removedLoadedInterferenceMW,
			"max_interference_dbm":              maxSubSensitivityInterferenceDBm,
			"max_sinr_delta_db":                 maxSubSensitivitySINRDeltaDB,
		},
	}
	if sample != nil {
		record["sample"] = sample
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("canonical_4h1_post_change=%s", encoded)
}
