package raytracer

import (
	"context"
	"fmt"
	"math"
	"strings"
	"testing"
)

func validationFloat(value float64) *float64 { return &value }
func validationBool(value bool) *bool        { return &value }

func validationCampaign(modelValue func(float64, int) float64, count int) MeasurementCampaign {
	measurements := make([]MeasurementRecord, 0, count)
	for index := 0; index < count; index++ {
		distance := 20.0 + float64(index)*10
		lon := 32.85 + float64(index)*0.001
		lat := 39.92 + float64(index)*0.001
		measurements = append(measurements, MeasurementRecord{
			MeasurementID: fmt.Sprintf("m-%04d", index), SiteID: fmt.Sprintf("site-%d", index%2), LocationPairID: fmt.Sprintf("pair-%04d", index),
			Tx:           MeasurementEndpoint{Lon: validationFloat(lon), Lat: validationFloat(lat), HeightM: validationFloat(10)},
			Rx:           MeasurementEndpoint{Lon: validationFloat(lon + 0.0001), Lat: validationFloat(lat), HeightM: validationFloat(2)},
			FrequencyGHz: validationFloat(140), MeasuredPathLossDB: validationFloat(modelValue(distance, index)), MeasurementQuantity: "path_loss",
			AntennaGainEmbedded: validationBool(true), CableLossEmbedded: validationBool(true), CalibrationApplied: validationBool(true),
			Directionality: ValidationDirectionSynthesizedOmni, AntennaComparisonBasis: ValidationBasisSynthesizedOmni,
			Labels:   MeasurementLabels{LOSState: P1411LOSStateLOS, LOSSource: "campaign_author", Morphology: P1411MorphologyUrbanLowRise, MorphologySource: "campaign_author", RooftopRelation: P1411RooftopBothBelow, RooftopSource: "campaign_author"},
			Geometry: MeasurementGeometry{Direct3DDistanceM: validationFloat(distance)},
		})
	}
	return MeasurementCampaign{
		SchemaVersion: MeasurementValidationSchemaVersion, CampaignID: "synthetic-campaign", CampaignVersion: "1",
		FrequencyRange: MeasurementFrequencyRange{MinGHz: 140, MaxGHz: 140}, Provenance: MeasurementCampaignProvenance{SourceType: "synthetic_controlled"},
		AntennaSetup: MeasurementAntennaSetup{Directionality: ValidationDirectionSynthesizedOmni, ComparisonBasis: ValidationBasisSynthesizedOmni},
		Measurements: measurements,
	}
}

func TestValidateSubTHZValidationRejectsInvalidEvidence(t *testing.T) {
	campaign := validationCampaign(func(distance float64, _ int) float64 { return p1411ExactFSPL(distance, 140) }, 1)
	campaign.Measurements[0].Tx.Lon = validationFloat(181)
	if got := ValidateSubTHZValidationRequest(SubTHZValidationRequest{SchemaVersion: 1, Operation: ValidationOperationCompareModels, Campaigns: []MeasurementCampaign{campaign}, ModelIDs: []string{"p525_fspl"}}); !strings.Contains(got, "coordinates") {
		t.Fatalf("expected coordinate validation error, got %q", got)
	}
	campaign = validationCampaign(func(distance float64, _ int) float64 { return p1411ExactFSPL(distance, 140) }, 1)
	campaign.Measurements[0].MeasurementQuantity = "path_loss"
	campaign.Measurements[0].AntennaGainEmbedded = nil
	request := SubTHZValidationRequest{SchemaVersion: 1, Operation: ValidationOperationCompareModels, Campaigns: []MeasurementCampaign{campaign}, ModelIDs: []string{"p525_fspl"}, IncludePredictions: true}
	response, err := EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil || response.Models[0].StatusCounts[ValidationStatusAmbiguous] != 1 {
		t.Fatalf("expected missing normalization metadata to remain ambiguous: %v / %+v", err, response.Models)
	}
}

func TestMeasurementValidationP525ExactAndConstantBias(t *testing.T) {
	campaign := validationCampaign(func(distance float64, index int) float64 { return p1411ExactFSPL(distance, 140) + float64(index%2)*5 }, 6)
	request := SubTHZValidationRequest{SchemaVersion: 1, Operation: ValidationOperationCompareModels, Campaigns: []MeasurementCampaign{campaign}, ModelIDs: []string{"p525_fspl"}, IncludePredictions: true}
	response, err := EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Models[0].Metric.Count != 6 || math.Abs(response.Models[0].Metric.MeanBiasDB-2.5) > 1e-9 {
		t.Fatalf("unexpected exact P.525 metrics: %+v", response.Models[0].Metric)
	}
	if response.Readiness.ProductionCandidate {
		t.Fatal("measurement evidence must never produce a production candidate")
	}
	request.Operation = ValidationOperationCalibrateBias
	request.Strategy = ValidationStrategy{Method: "explicit_groups", GroupBy: "site_id", CalibrationGroupIDs: []string{"site-a"}, ValidationGroupIDs: []string{"site-b"}}
	response, err = EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Models[0].Calibration == nil || response.Models[0].Calibration.Promoted {
		t.Fatal("calibration must be reported without promotion")
	}
}

func TestMeasurementValidationP1411ApplicabilityAndSourceSigma(t *testing.T) {
	campaign := validationCampaign(func(distance float64, _ int) float64 {
		return 10*2.07*math.Log10(distance) + 31.23 + 10*2.06*math.Log10(140)
	}, 4)
	request := SubTHZValidationRequest{SchemaVersion: 1, Operation: ValidationOperationCompareModels, Campaigns: []MeasurementCampaign{campaign}, ModelIDs: []string{"p1411_below_rooftop_los_v1"}}
	response, err := EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	result := response.Models[0]
	if result.StatusCounts[ValidationStatusApplicable] != 4 || result.Metric.RMSEDB > 1e-9 {
		t.Fatalf("expected exact P.1411 result, got %+v", result)
	}
	if result.P1411SigmaComparison == nil || math.Abs(result.P1411SigmaComparison.SourceSigmaDB-4.91) > 1e-9 {
		t.Fatalf("expected source sigma comparison, got %+v", result.P1411SigmaComparison)
	}
	campaign.Measurements[0].Labels.LOSState = P1411LOSStateNLOS
	request.Campaigns = []MeasurementCampaign{campaign}
	response, err = EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Models[0].StatusCounts[ValidationStatusInapplicable] == 0 {
		t.Fatal("expected LOS row to be inapplicable for an NLOS observation")
	}
}

func TestMeasurementValidationQuantitySemanticsAndCensoring(t *testing.T) {
	campaign := validationCampaign(func(distance float64, _ int) float64 { return p1411ExactFSPL(distance, 140) }, 2)
	campaign.Measurements[0].MeasurementQuantity = "received_power"
	campaign.Measurements[0].MeasuredPathLossDB = nil
	campaign.Measurements[0].MeasuredReceivedPowerDBm = validationFloat(-70)
	campaign.Measurements[0].TxConductedPowerDBm = validationFloat(10)
	campaign.Measurements[0].TxGainDBi = validationFloat(20)
	campaign.Measurements[0].RxGainDBi = validationFloat(20)
	campaign.Measurements[0].TxCableLossDB = validationFloat(1)
	campaign.Measurements[0].RxCableLossDB = validationFloat(1)
	campaign.Measurements[0].Directionality = ValidationDirectionSynthesizedOmni
	campaign.Measurements[0].AntennaComparisonBasis = ValidationBasisSynthesizedOmni
	campaign.Measurements[0].CalibrationApplied = validationBool(true)
	campaign.Measurements[1].Detection.Status = ValidationObservationBelowDetection
	campaign.Measurements[1].MeasuredPathLossDB = nil
	request := SubTHZValidationRequest{SchemaVersion: 1, Operation: ValidationOperationCompareModels, Campaigns: []MeasurementCampaign{campaign}, ModelIDs: []string{"p525_fspl"}, IncludePredictions: true}
	if got := ValidateSubTHZValidationRequest(request); got != "" {
		t.Fatal(got)
	}
	response, err := EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Campaigns[0].CensoredCount != 1 || response.Models[0].Metric.Count != 1 {
		t.Fatalf("expected censored observation to be counted but excluded: %+v / %+v", response.Campaigns[0], response.Models[0])
	}
	campaign.Measurements[0].Directionality = ValidationDirectionBestDirectional
	request.Campaigns = []MeasurementCampaign{campaign}
	response, err = EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Models[0].StatusCounts[ValidationStatusAmbiguous] == 0 {
		t.Fatal("expected directional sample to remain ambiguous")
	}
}

func TestMeasurementValidationSpatialHoldoutFingerprintAndNoLeak(t *testing.T) {
	campaign := validationCampaign(func(distance float64, index int) float64 { return p1411ExactFSPL(distance, 140) + float64(index) }, 6)
	request := SubTHZValidationRequest{SchemaVersion: 1, Operation: ValidationOperationSpatialHoldout, Campaigns: []MeasurementCampaign{campaign}, ModelIDs: []string{"p525_fspl"}, Strategy: ValidationStrategy{Method: "spatial_grid", SpatialCellSizeM: 10, MinimumSeparationM: 10}}
	first, err := EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := EvaluateSubTHZValidationContext(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if first.ValidationFingerprint != second.ValidationFingerprint || first.Holdout == nil || len(first.Holdout.Folds) == 0 {
		t.Fatalf("expected deterministic spatial holdout: %q / %q", first.ValidationFingerprint, second.ValidationFingerprint)
	}
	for _, fold := range first.Holdout.Folds {
		if !strings.Contains(fold.NoLeakEvidence, "disjoint") {
			t.Fatal("missing no-leak evidence")
		}
	}
}

func BenchmarkMeasurementValidation100(b *testing.B) {
	benchmarkMeasurementValidation(b, 100)
}

func BenchmarkMeasurementValidation1000(b *testing.B) {
	benchmarkMeasurementValidation(b, 1000)
}

func benchmarkMeasurementValidation(b *testing.B, count int) {
	campaign := validationCampaign(func(distance float64, _ int) float64 { return p1411ExactFSPL(distance, 140) }, count)
	request := SubTHZValidationRequest{SchemaVersion: 1, Operation: ValidationOperationCompareModels, Campaigns: []MeasurementCampaign{campaign}, ModelIDs: []string{"p525_fspl"}}
	b.ReportAllocs()
	for index := 0; index < b.N; index++ {
		if _, err := EvaluateSubTHZValidationContext(context.Background(), request); err != nil {
			b.Fatal(err)
		}
	}
}
