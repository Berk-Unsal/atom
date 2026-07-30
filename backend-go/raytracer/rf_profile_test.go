package raytracer

import (
	"math"
	"testing"
)

func TestCellRFProfileInputUsesIndependentOverrides(t *testing.T) {
	frequency := 2.6
	band := "LTE Band 7"
	bandwidth := 20.0
	channel := "EARFCN-2850"
	tech := "4G"
	duplex := "FDD"
	txPower := 43.0
	gain := 18.0
	loss := 2.0
	radius := 1250.0
	beam := 65.0
	height := 32.0
	mechanicalTilt := 4.0
	electricalTilt := 2.0
	orientation := -15.0
	horizontalPattern := "COSINE-SECTOR"
	verticalPattern := "PANEL-10DEG"
	load := 0.85
	reuse := 3
	pci := 503
	receiverHeight := 1.7
	sensitivity := -108.0
	schemaVersion := 1

	profile := (&CellRFProfileInput{
		SchemaVersion:          &schemaVersion,
		NetworkTech:            &tech,
		FrequencyGHz:           &frequency,
		Band:                   &band,
		BandwidthMHz:           &bandwidth,
		ChannelID:              &channel,
		DuplexMode:             &duplex,
		TxPowerDBm:             &txPower,
		AntennaGainDBi:         &gain,
		SystemLossDB:           &loss,
		RadiusMeters:           &radius,
		BeamWidthDeg:           &beam,
		AntennaHeightM:         &height,
		MechanicalDowntiltDeg:  &mechanicalTilt,
		ElectricalDowntiltDeg:  &electricalTilt,
		OrientationDeg:         &orientation,
		HorizontalPatternID:    &horizontalPattern,
		VerticalPatternID:      &verticalPattern,
		LoadFactor:             &load,
		ReuseFactor:            &reuse,
		PCI:                    &pci,
		ReceiverHeightM:        &receiverHeight,
		ReceiverSensitivityDBm: &sensitivity,
	}).WithDefaults(DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1))

	if validationError := ValidateCellRFProfile(profile, false); validationError != "" {
		t.Fatalf("profile validation failed: %s", validationError)
	}
	if profile.NetworkTech != "4g" || profile.OrientationDeg != 345 || profile.HorizontalPatternID != "cosine-sector" || profile.VerticalPatternID != "panel-10deg" {
		t.Fatalf("profile was not normalized: %+v", profile)
	}
	if profile.PCI == nil || *profile.PCI != 503 || profile.ChannelID != channel || profile.AntennaGainDBi != gain || profile.SystemLossDB != loss {
		t.Fatalf("independent overrides were lost: %+v", profile)
	}
}

func TestValidateCellRFProfileRejectsTechnologyAndPCIMismatch(t *testing.T) {
	profile := DefaultCellRFProfile("4g", 2.6, 30, 400, 120, 20, 0.7, 1)
	profile.FrequencyGHz = 28
	if got := ValidateCellRFProfile(profile, false); got != "rf_profile.frequency_ghz must be finite, positive, and match network_tech" {
		t.Fatalf("frequency mismatch validation = %q", got)
	}
	profile.FrequencyGHz = 2.6
	pci := 504
	profile.PCI = &pci
	if got := ValidateCellRFProfile(profile, false); got != "rf_profile.pci must be between 0 and 503 for 4g" {
		t.Fatalf("PCI validation = %q", got)
	}
}

func TestCellRFProfileReceivedPowerUsesGainLossHeightAndPatterns(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 120, 100, 0.7, 1)
	baseline := profile.ReceivedPowerDBm(100, 0, 0, 0)
	profile.AntennaGainDBi += 5
	profile.SystemLossDB += 2
	if got := profile.ReceivedPowerDBm(100, 0, 0, 0) - baseline; math.Abs(got-3) > 0.0001 {
		t.Fatalf("gain/loss delta = %.4f dB, want 3 dB", got)
	}
	profile.HorizontalPatternID = "cosine-sector"
	boresight := profile.ReceivedPowerDBm(100, 0, 0, 0)
	edge := profile.ReceivedPowerDBm(100, 0, 0, profile.BeamWidthDeg/2)
	if math.Abs((boresight-edge)-12) > 0.0001 {
		t.Fatalf("horizontal edge attenuation = %.4f dB, want 12 dB", boresight-edge)
	}
	profile.VerticalPatternID = "panel-10deg"
	profile.MechanicalDowntiltDeg = 0
	profile.ElectricalDowntiltDeg = 0
	if panel := profile.ReceivedPowerDBm(10, 0, 0, 0); panel >= boresight {
		t.Fatalf("vertical panel pattern did not attenuate steep near-field path: %.2f >= %.2f", panel, boresight)
	}
}

func TestDefaultCellRFProfileCovers6G(t *testing.T) {
	profile := DefaultCellRFProfile("6g", 0, 0, 0, 0, 0, 0, 0)
	if profile.FrequencyGHz != 140 || profile.BandwidthMHz != 1000 || profile.Band != "Sub-THz research" || profile.DuplexMode != "tdd" {
		t.Fatalf("unexpected 6g defaults: %+v", profile)
	}
}

func TestOmnidirectionalProfileSamplesFullCircle(t *testing.T) {
	profile := DefaultCellRFProfile("5g", 28, 30, 400, 65, 100, 0.7, 1)
	profile.HorizontalPatternID = "omni"
	if profile.EffectiveBeamWidthDeg() != 360 {
		t.Fatalf("omni effective beam = %v, want 360", profile.EffectiveBeamWidthDeg())
	}
	profile.HorizontalPatternID = "cosine-sector"
	if profile.EffectiveBeamWidthDeg() != 65 {
		t.Fatalf("sector effective beam = %v, want 65", profile.EffectiveBeamWidthDeg())
	}
}
