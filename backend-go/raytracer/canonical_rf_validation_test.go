package raytracer

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"testing"
)

func canonicalRFTestFloat(value float64) *float64 { return &value }
func canonicalRFTestBool(value bool) *bool        { return &value }

func canonicalRFTestDataset(t *testing.T, count int, quantity string, offset func(CanonicalRFValidationObservation) float64) CanonicalRFValidationDataset {
	t.Helper()
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 1000, 360, 100, 0.7, 1)
	profile.PCI = func() *int { value := 101; return &value }()
	transmitter := CanonicalRFValidationTransmitter{CellID: "cell-a", MappingID: "map-a", SiteID: "site-a", Lat: 39.90, Lon: 32.80, RFProfile: profile}
	observations := make([]CanonicalRFValidationObservation, 0, count)
	for index := 0; index < count; index++ {
		distance := 25.0 + float64(index%10)*25
		if index >= count/2 {
			distance += 400
		}
		point := DestinationPoint(Point{Lon: transmitter.Lon, Lat: transmitter.Lat}, 90, distance)
		los := string(PropagationLOS)
		if index%2 == 1 {
			los = string(PropagationNLOS)
		}
		observation := CanonicalRFValidationObservation{
			ObservationID: fmt.Sprintf("obs-%02d", index),
			CampaignID:    "campaign-1", CampaignVersion: "1", SiteID: "site-" + string(rune('a'+index%2)), SessionID: "session-1",
			Lat: canonicalRFTestFloat(point.Lat), Lon: canonicalRFTestFloat(point.Lon), DistanceM: canonicalRFTestFloat(distance), RxHeightM: canonicalRFTestFloat(1.8), RxHeightSource: CanonicalRFHeightMeasured,
			Technology: "5g", FrequencyGHz: canonicalRFTestFloat(28), Band: "NR n257", BandwidthMHz: canonicalRFTestFloat(100), ChannelID: profile.ChannelID,
			ServingCellID: transmitter.CellID, ServingPCI: profile.PCI, Quantity: quantity, ValueDB: canonicalRFTestFloat(0), QuantityDefinition: quantity,
			DeviceID: "device-1", AntennaID: "antenna-1", CalibrationID: "cal-1", CalibrationState: "applied", AntennaBasis: "isotropic_equivalent",
			MotionState: "stationary", SamplingMethod: "raw", AggregationMethod: "raw", SampleCount: 1, Provenance: "synthetic_controlled",
			LOSState: los, LOSSource: "synthetic_geometry", Outdoor: canonicalRFTestBool(true), CensoringStatus: CanonicalRFCensorUncensored,
		}
		observations = append(observations, observation)
	}
	dataset := CanonicalRFValidationDataset{SchemaVersion: CanonicalRFValidationSchemaVersion, DatasetID: "synthetic-canonical-rf", DatasetVersion: "1", SourceType: "synthetic_controlled", SourceCitation: "Concept 6A controlled fixture", License: "internal-fixture", Observations: observations, Transmitters: []CanonicalRFValidationTransmitter{transmitter}}
	request := CanonicalRFValidationRequest{SchemaVersion: CanonicalRFValidationSchemaVersion, Dataset: dataset, Options: CanonicalRFValidationOptions{SchemaVersion: CanonicalRFValidationSchemaVersion, Strategy: CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}, IncludePredictions: true}}
	first, err := EvaluateCanonicalRFValidation(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	for index := range dataset.Observations {
		prediction := first.Observations[index].PredictedValueDB
		if prediction == nil {
			t.Fatalf("fixture prediction %d unavailable: %+v", index, first.Observations[index])
		}
		value := *prediction + offset(dataset.Observations[index])
		dataset.Observations[index].ValueDB = canonicalRFTestFloat(value)
	}
	return dataset
}

func canonicalRFTestRequest(dataset CanonicalRFValidationDataset, strategy CanonicalRFValidationStrategy) CanonicalRFValidationRequest {
	return CanonicalRFValidationRequest{SchemaVersion: CanonicalRFValidationSchemaVersion, Dataset: dataset, Options: CanonicalRFValidationOptions{SchemaVersion: CanonicalRFValidationSchemaVersion, Strategy: strategy, IncludePredictions: true, CalibrationRequested: true}}
}

func canonicalRFMetricForQuantity(rows []CanonicalRFMetricRow, quantity string) *CanonicalRFMetric {
	for index := range rows {
		if rows[index].Quantity == quantity {
			return &rows[index].Metric
		}
	}
	return nil
}

func TestCanonicalRFValidationExactCanonicalResidualZero(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 6, CanonicalRFQuantityReceivedPowerDBm, func(CanonicalRFValidationObservation) float64 { return 0 })
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Counts.Applicable != 6 || response.Readiness != CanonicalRFReadinessValidationOnly {
		t.Fatalf("exact fixture counts/readiness = %+v / %q", response.Counts, response.Readiness)
	}
	metric := canonicalRFMetricForQuantity(response.Summary.Overall, CanonicalRFQuantityReceivedPowerDBm)
	if metric == nil || metric.RMSEDB == nil || *metric.RMSEDB > 1e-9 || metric.P95AbsErrorDB == nil || *metric.P95AbsErrorDB > 1e-9 {
		t.Fatalf("exact residual metric = %+v", metric)
	}
}

func TestCanonicalRFValidationKnownFiveDBiasRecoveryIsHeldOutAndNotPromoted(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 8, CanonicalRFQuantityReceivedPowerDBm, func(CanonicalRFValidationObservation) float64 { return 5 })
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Calibration == nil || response.Calibration.Promoted || response.Calibration.Status != CanonicalRFReadinessCalibrationCandidate {
		t.Fatalf("unexpected calibration result: %+v", response.Calibration)
	}
	if len(response.Calibration.Folds) == 0 || response.Calibration.Folds[0].BiasDB == nil || math.Abs(*response.Calibration.Folds[0].BiasDB-5) > 1e-9 {
		t.Fatalf("expected +5 dB fold bias, got %+v", response.Calibration.Folds)
	}
	for _, fold := range response.Calibration.Folds {
		if fold.Corrected.RMSEDB == nil || *fold.Corrected.RMSEDB > 1e-9 {
			t.Fatalf("held-out correction did not recover +5 dB: %+v", fold)
		}
	}
	if response.CalibrationActive || response.ProductionCandidate {
		t.Fatal("calibration must remain diagnostic-only")
	}
}

func TestCanonicalRFValidationDistanceDependentErrorRejectsConstantBias(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 12, CanonicalRFQuantityReceivedPowerDBm, func(observation CanonicalRFValidationObservation) float64 { return *observation.DistanceM * 0.03 })
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Calibration == nil || response.Calibration.Status != CanonicalRFReadinessCalibrationUnstable {
		t.Fatalf("distance-dependent error should be calibration-unstable: %+v", response.Calibration)
	}
	for _, fold := range response.Calibration.Folds {
		if fold.Corrected.RMSEDB != nil && *fold.Corrected.RMSEDB < 0.1 {
			t.Fatalf("constant bias unexpectedly removed distance trend: %+v", fold)
		}
	}
}

func TestCanonicalRFValidationSpatialErrorFailsHeldOutRegion(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 12, CanonicalRFQuantityReceivedPowerDBm, func(observation CanonicalRFValidationObservation) float64 {
		if *observation.DistanceM > 400 {
			return 10
		}
		return 0
	})
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "spatial_blocks", SpatialCellSizeM: 500, MinimumSeparationM: 0, PrimaryHoldout: true}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Holdout == nil || len(response.Holdout.Folds) < 2 {
		t.Fatalf("expected spatial folds, got %+v", response.Holdout)
	}
	foundHeldoutFailure := false
	for _, fold := range response.Calibration.Folds {
		if fold.ValidationCount >= CanonicalRFValidationMinimumGroupN && fold.Corrected.MAEDB != nil && *fold.Corrected.MAEDB > 5 {
			foundHeldoutFailure = true
		}
	}
	if !foundHeldoutFailure {
		t.Fatalf("spatially separated error was not visible in held-out metrics: %+v", response.Calibration)
	}
}

func TestCanonicalRFValidationLOSNLOSDifferentialNeedsMoreThanOneScalar(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 12, CanonicalRFQuantityReceivedPowerDBm, func(observation CanonicalRFValidationObservation) float64 {
		if observation.LOSState == string(PropagationLOS) {
			return 5
		}
		return -5
	})
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	losRows := map[string]CanonicalRFMetricRow{}
	for _, row := range response.Summary.ByLOS {
		losRows[row.LOSState] = row
	}
	if losRows[string(PropagationLOS)].Metric.MeanBiasDB == nil || math.Abs(*losRows[string(PropagationLOS)].Metric.MeanBiasDB-5) > 1e-9 || losRows[string(PropagationNLOS)].Metric.MeanBiasDB == nil || math.Abs(*losRows[string(PropagationNLOS)].Metric.MeanBiasDB+5) > 1e-9 {
		t.Fatalf("LOS/NLOS differential was not retained: %+v", response.Summary.ByLOS)
	}
	if response.Calibration == nil || response.Calibration.LOSStratified {
		t.Fatal("Concept 6A must not activate LOS/NLOS-specific calibration")
	}
}

func TestCanonicalRFValidationCensoringIsNotAnExactResidual(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 5, CanonicalRFQuantityReceivedPowerDBm, func(CanonicalRFValidationObservation) float64 { return 0 })
	dataset.Observations[0].ValueDB = nil
	dataset.Observations[0].CensoringStatus = CanonicalRFCensorBelowDetection
	dataset.Observations[0].DetectionLimitDBm = canonicalRFTestFloat(-120)
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Counts.Censored != 1 || response.Counts.Applicable != 4 {
		t.Fatalf("censored counts = %+v", response.Counts)
	}
	metric := canonicalRFMetricForQuantity(response.Summary.Overall, CanonicalRFQuantityReceivedPowerDBm)
	if metric == nil || metric.Count != 4 {
		t.Fatalf("censored observation entered residual metric: %+v", metric)
	}
}

func TestCanonicalRFValidationMatchingQuantityFrequencyAndApplicabilityGates(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 4, CanonicalRFQuantityReceivedPowerDBm, func(CanonicalRFValidationObservation) float64 { return 0 })
	dataset.Observations[0].ServingCellID = "missing-cell"
	dataset.Observations[1].FrequencyGHz = canonicalRFTestFloat(2.6)
	dataset.Observations[2].DistanceM = canonicalRFTestFloat(5)
	dataset.Observations[2].Lat = nil
	dataset.Observations[2].Lon = nil
	dataset.Observations[3].Quantity = "unknown_quantity"
	if validationError := ValidateCanonicalRFValidationDataset(dataset); !strings.Contains(validationError, "quantity") {
		t.Fatalf("expected quantity schema rejection, got %q", validationError)
	}
	dataset.Observations[3].Quantity = CanonicalRFQuantityReceivedPowerDBm
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	statuses := map[string]bool{}
	for _, observation := range response.Observations {
		statuses[observation.ExclusionReason] = true
	}
	if !statuses["serving_cell_or_mapping_not_found"] || !statuses["frequency_mismatch"] || !statuses["distance_out_of_range"] {
		t.Fatalf("matching/applicability reasons = %+v", statuses)
	}
}

func TestCanonicalRFValidationRSRPIsNotRSSIAndInterferenceLimitsAreExplicit(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 2, CanonicalRFQuantityRSRPDBm, func(CanonicalRFValidationObservation) float64 { return 0 })
	response, err := EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Counts.Applicable != 2 {
		t.Fatalf("RSRP direct quantity should be evaluable: %+v", response.Counts)
	}
	if response.Observations[0].Evidence == nil || response.Observations[0].Evidence.RSRPDBm == nil {
		t.Fatalf("missing direct RSRP evidence: %+v", response.Observations[0])
	}
	for index := range dataset.Observations {
		dataset.Observations[index].Quantity = CanonicalRFQuantitySINRDB
		dataset.Observations[index].ValueDB = canonicalRFTestFloat(0)
	}
	response, err = EvaluateCanonicalRFValidation(context.Background(), canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0}))
	if err != nil {
		t.Fatal(err)
	}
	if response.Counts.InsufficientMetadata != 2 || !strings.Contains(response.Observations[0].ExclusionReason, "interference_validation_limited") {
		t.Fatalf("incomplete interference context was not explicit: %+v", response.Observations)
	}
}

func TestCanonicalRFValidationUsesSharedRadioQualityPrimitiveWhenContextIsComplete(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 2, CanonicalRFQuantityReceivedPowerDBm, func(CanonicalRFValidationObservation) float64 { return 0 })
	secondProfile := dataset.Transmitters[0].RFProfile
	secondProfile.PCI = func() *int { value := 102; return &value }()
	second := dataset.Transmitters[0]
	second.CellID, second.MappingID, second.SiteID = "cell-b", "map-b", "site-b"
	second.Lat, second.Lon = DestinationPoint(Point{Lon: dataset.Transmitters[0].Lon, Lat: dataset.Transmitters[0].Lat}, 0, 500).Lat, DestinationPoint(Point{Lon: dataset.Transmitters[0].Lon, Lat: dataset.Transmitters[0].Lat}, 0, 500).Lon
	second.RFProfile = secondProfile
	dataset.Transmitters = append(dataset.Transmitters, second)
	for index := range dataset.Observations {
		dataset.Observations[index].Quantity = CanonicalRFQuantitySINRDB
		dataset.Observations[index].QuantityDefinition = CanonicalRFQuantitySINRDB
		dataset.Observations[index].ValueDB = canonicalRFTestFloat(0)
		dataset.Observations[index].LOSState = string(PropagationLOS)
		dataset.Observations[index].InterferenceContextComplete = canonicalRFTestBool(true)
		dataset.Observations[index].NeighborCellIDs = []string{"cell-b"}
		dataset.Observations[index].ResourceSemantics = "100 MHz NR resource-block normalization"
	}
	request := canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "leave_one_site_out", MinimumSeparationM: 0})
	request.Options.BuildingsAvailable = true
	request.Options.Buildings = NewBuildingIndex([]*BuildingFootprint{{ID: "off-path", Vertices: []Point{{Lon: 32.99, Lat: 39.99}, {Lon: 32.9901, Lat: 39.99}, {Lon: 32.9901, Lat: 39.9901}, {Lon: 32.99, Lat: 39.9901}}}})
	first, err := EvaluateCanonicalRFValidation(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if first.Counts.Applicable != 2 || first.Observations[0].Evidence == nil || first.Observations[0].Evidence.SINRDB == nil {
		t.Fatalf("complete radio-quality context did not use shared primitive: %+v", first.Observations)
	}
	for index := range dataset.Observations {
		if first.Observations[index].PredictedValueDB == nil {
			t.Fatalf("missing SINR prediction: %+v", first.Observations[index])
		}
		dataset.Observations[index].ValueDB = first.Observations[index].PredictedValueDB
	}
	secondResponse, err := EvaluateCanonicalRFValidation(context.Background(), CanonicalRFValidationRequest{SchemaVersion: CanonicalRFValidationSchemaVersion, Dataset: dataset, Options: request.Options})
	if err != nil {
		t.Fatal(err)
	}
	if secondResponse.Counts.Applicable != 2 || secondResponse.Summary.Overall[0].Metric.RMSEDB == nil || *secondResponse.Summary.Overall[0].Metric.RMSEDB > 1e-9 {
		t.Fatalf("shared radio-quality exact fixture residuals = %+v", secondResponse.Summary.Overall)
	}
}

func TestCanonicalRFValidationFingerprintIsDeterministicAndOptimizerIndependent(t *testing.T) {
	dataset := canonicalRFTestDataset(t, 6, CanonicalRFQuantityReceivedPowerDBm, func(CanonicalRFValidationObservation) float64 { return 0 })
	request := canonicalRFTestRequest(dataset, CanonicalRFValidationStrategy{Method: "spatial_blocks", SpatialCellSizeM: 100, MinimumSeparationM: 50})
	first, err := EvaluateCanonicalRFValidation(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := EvaluateCanonicalRFValidation(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	firstJSON, _ := json.Marshal(first)
	secondJSON, _ := json.Marshal(second)
	if first.ValidationFingerprint == "" || first.ValidationFingerprint != second.ValidationFingerprint || string(firstJSON) != string(secondJSON) {
		t.Fatalf("validation is not deterministic: %q/%q", first.ValidationFingerprint, second.ValidationFingerprint)
	}
	if !strings.Contains(first.Policy["optimizer"], "independent") || first.CalibrationActive || first.ProductionCandidate {
		t.Fatal("validation boundary leaked into production semantics")
	}
}

func TestCanonicalRFAggregationIsDeterministicAndNeverResidualSelected(t *testing.T) {
	if got, err := AggregateCanonicalRFValues([]float64{1, 3, 2}, "median", 0); err != nil || got != 2 {
		t.Fatalf("median aggregation = %v / %v", got, err)
	}
	if got, err := AggregateCanonicalRFValues([]float64{1, 3, 2}, "percentile", 90); err != nil || math.Abs(got-2.8) > 1e-9 {
		t.Fatalf("p90 aggregation = %v / %v", got, err)
	}
	if _, err := AggregateCanonicalRFValues([]float64{1, 2}, "raw", 0); err == nil {
		t.Fatal("raw aggregation accepted multiple samples")
	}
}
