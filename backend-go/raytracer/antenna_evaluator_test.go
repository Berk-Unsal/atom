package raytracer

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func TestAntennaLinkBudgetSeparatesAbsoluteRelativeAndReceiverTerms(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	profile.AntennaGainDBi = 25
	profile.RxAntennaGainDBi = 6
	profile.SystemLossDB = 2
	profile.PolarizationLossDB = 3
	profile.HorizontalPatternID = AntennaPatternIdealSectorID
	profile.VerticalPatternID = "flat"

	const distanceM = 100.0
	const buildingLossDB = 4.0
	const calibrationDB = 1.0
	terms := profile.LinkBudgetTerms(distanceM, buildingLossDB, calibrationDB, 0)
	fspl := FreeSpacePathLossMetersGHz(profile.SlantDistanceMeters(distanceM), profile.FrequencyGHz)
	wantReceived := 30 + 25 - fspl - buildingLossDB - 2 - 3 + 6 + calibrationDB
	wantTotalLoss := fspl + buildingLossDB + 2 + 3 - 6

	assertClose(t, "boresight EIRP", terms.BoresightEIRPDBm, 55)
	assertClose(t, "directional EIRP", terms.DirectionalEIRPDBm, 55)
	assertClose(t, "historical effective transmit alias", terms.EIRPDBm, 54)
	assertClose(t, "total signed loss", terms.TotalLossDB, wantTotalLoss)
	assertClose(t, "received power", terms.ReceivedPowerDBm, wantReceived)
	if terms.TxPatternAttenuationDB != 0 || terms.RxAntennaGainDBi != 6 || terms.PolarizationLossDB != 3 {
		t.Fatalf("explicit antenna terms = %+v", terms)
	}

	defaultProfile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	defaultTerms := defaultProfile.LinkBudgetTerms(distanceM, buildingLossDB, calibrationDB, 0)
	legacyExpected := defaultProfile.TxPowerDBm + defaultProfile.AntennaGainDBi - defaultProfile.SystemLossDB + calibrationDB - fspl - buildingLossDB
	assertClose(t, "default compatibility received power", defaultTerms.ReceivedPowerDBm, legacyExpected)
}

func TestCellRFProfilePreferredTxGainAliasAndWireCompatibility(t *testing.T) {
	defaults := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	gainFromPreferredAlias := 21.0
	legacyGain := 17.0
	profile := (&CellRFProfileInput{
		TxAntennaGainDBi: &gainFromPreferredAlias,
		AntennaGainDBi:   &legacyGain,
	}).WithDefaults(defaults)
	if profile.AntennaGainDBi != gainFromPreferredAlias {
		t.Fatalf("preferred TX gain alias did not win: %.3f", profile.AntennaGainDBi)
	}

	encoded, err := json.Marshal(profile)
	if err != nil {
		t.Fatalf("marshal normalized profile: %v", err)
	}
	wire := string(encoded)
	for _, field := range []string{`"antenna_gain_dbi":21`, `"tx_antenna_gain_dbi":21`, `"rx_antenna_gain_dbi":0`, `"polarization_loss_db":0`} {
		if !strings.Contains(wire, field) {
			t.Fatalf("normalized profile omitted %s: %s", field, wire)
		}
	}
}

func TestAnalyticAntennaPatternsUseIndependentExpectedValues(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	profile.HorizontalPatternID = AntennaPatternCosineSectorID
	profile.VerticalPatternID = "flat"
	for _, fixture := range []struct {
		offset float64
		want   float64
	}{
		{offset: 0, want: 0},
		{offset: 30, want: 3},
		{offset: 60, want: 12},
		{offset: 90, want: 27},
		{offset: 350, want: 0.3333333333},
	} {
		got := EvaluateAntennaPattern(profile, 100, fixture.offset).TotalAttenuationDB
		assertClose(t, "cosine pattern at offset", got, fixture.want)
	}

	profile.HorizontalPatternID = AntennaPatternIdealSectorID
	outside := EvaluateAntennaLink(profile, 100, 61, 0)
	if outside.Eligible {
		t.Fatal("ideal sector allowed a link outside its hard beam")
	}
	if outside.Pattern.TotalAttenuationDB != 0 {
		t.Fatalf("ideal-sector relative attenuation changed outside the hard eligibility gate: %+v", outside.Pattern)
	}

	profile.HorizontalPatternID = AntennaPatternOmniID
	omni := EvaluateAntennaLink(profile, 100, 271, 0)
	if !omni.Eligible || omni.Pattern.EffectiveBeamWidthDeg != 360 || omni.Pattern.TotalAttenuationDB != 0 {
		t.Fatalf("omnidirectional evaluation = %+v", omni)
	}
}

func Test3GPPSingleElementReferencePatternUsesCombinedCapAndFullAzimuth(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	profile.HorizontalPatternID = AntennaPattern3GPPSingleElementID
	profile.VerticalPatternID = "flat"
	profile.AntennaHeightM = 25
	profile.ReceiverHeightM = 1.5

	for _, fixture := range []struct {
		distanceM          float64
		offsetDeg          float64
		horizontalExpected float64
	}{
		{distanceM: 100, offsetDeg: 0, horizontalExpected: 0},
		{distanceM: 100, offsetDeg: 32.5, horizontalExpected: 3},
		{distanceM: 100, offsetDeg: 65, horizontalExpected: 12},
		{distanceM: 100, offsetDeg: 180, horizontalExpected: 30},
	} {
		// The vertical expectation is independently calculated from the
		// configured geometry: depression - (mechanical + electrical) tilt.
		depression := math.Atan2(25-1.5, fixture.distanceM) * 180 / math.Pi
		vertical := math.Min(30, 12*math.Pow(math.Abs(depression)/65, 2))
		want := math.Min(30, fixture.horizontalExpected+vertical)
		got := EvaluateAntennaPattern(profile, fixture.distanceM, fixture.offsetDeg)
		assertClose(t, "3GPP reference attenuation", got.TotalAttenuationDB, want)
		if got.UsesHardBeamEligibility || !got.HardBeamEligible || got.EffectiveBeamWidthDeg != 360 {
			t.Fatalf("3GPP reference eligibility = %+v", got)
		}
	}

	// With the antenna pointed 32.5 degrees away from the receiver's
	// depression angle, the independent vertical cut is at its 3 dB point.
	depression := math.Atan2(profile.AntennaHeightM-profile.ReceiverHeightM, 100) * 180 / math.Pi
	profile.MechanicalDowntiltDeg = depression - 32.5
	verticalHalfPower := EvaluateAntennaPattern(profile, 100, 0)
	assertClose(t, "3GPP reference vertical half-power point", verticalHalfPower.VerticalAttenuationDB, 3)
}

func TestAntennaTiltSignMovesTheAnalyticVerticalBoresight(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	profile.HorizontalPatternID = AntennaPatternOmniID
	profile.VerticalPatternID = "panel-10deg"
	profile.AntennaHeightM = 11
	profile.ReceiverHeightM = 1
	const distanceM = 100.0

	profile.MechanicalDowntiltDeg = 0
	untilted := EvaluateAntennaPattern(profile, distanceM, 0)
	profile.MechanicalDowntiltDeg = 5
	downtilted := EvaluateAntennaPattern(profile, distanceM, 0)
	depression := math.Atan2(profile.AntennaHeightM-profile.ReceiverHeightM, distanceM) * 180 / math.Pi
	wantUntilted := math.Min(30, 12*math.Pow(math.Abs(depression)/10, 2))
	wantDowntilted := math.Min(30, 12*math.Pow(math.Abs(depression-5)/10, 2))
	assertClose(t, "untilted vertical attenuation", untilted.VerticalAttenuationDB, wantUntilted)
	assertClose(t, "positive mechanical downtilt vertical attenuation", downtilted.VerticalAttenuationDB, wantDowntilted)
	if downtilted.VerticalAttenuationDB >= untilted.VerticalAttenuationDB {
		t.Fatalf("positive downtilt did not move the panel toward the receiver: untilted=%.6f downtilted=%.6f", untilted.VerticalAttenuationDB, downtilted.VerticalAttenuationDB)
	}
}

func TestPropagationResultCarriesSharedAntennaLedger(t *testing.T) {
	profile := DefaultPlanningCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	profile.HorizontalPatternID = AntennaPatternCosineSectorID
	profile.RxAntennaGainDBi = 3
	profile.PolarizationLossDB = 1
	result := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: 100, HorizontalOffsetDeg: 15,
		CalibrationOffsetDB: 2, LOSState: PropagationLOSState(PropagationLOS),
		EndpointCase: PropagationEndpointCase(PropagationEndpointOutdoorO2O), BuildingDataAvailable: true,
	})
	if !result.Applicable || result.LinkBudget.ReceivedPowerDBm != result.ReceivedPowerDBm {
		t.Fatalf("propagation result did not carry a finite link budget: %+v", result)
	}
	if result.LinkBudget.RxAntennaGainDBi != 3 || result.LinkBudget.PolarizationLossDB != 1 || result.LinkBudget.TxPatternAttenuationDB <= 0 {
		t.Fatalf("shared propagation antenna ledger = %+v", result.LinkBudget)
	}
	want := result.LinkBudget.BoresightEIRPDBm - result.LinkBudget.TxPatternAttenuationDB - result.LinkBudget.PropagationLossDB - result.LinkBudget.BuildingLossDB - result.LinkBudget.SystemLossDB - result.LinkBudget.PolarizationLossDB + result.LinkBudget.RxAntennaGainDBi + result.LinkBudget.CalibrationOffsetDB
	assertClose(t, "propagation ledger equation", result.LinkBudget.ReceivedPowerDBm, want)
}

func assertClose(t *testing.T, label string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-6 {
		t.Fatalf("%s = %.9f, want %.9f", label, got, want)
	}
}
