package raytracer

import (
	"fmt"
	"math"
	"strings"
)

// CellRFProfile is the complete, normalized RF contract used by the simulation
// engines. Request inputs use CellRFProfileInput so an explicit zero is not
// confused with an omitted value.
type CellRFProfile struct {
	SchemaVersion          int     `json:"schema_version"`
	NetworkTech            string  `json:"network_tech"`
	FrequencyGHz           float64 `json:"frequency_ghz"`
	Band                   string  `json:"band"`
	BandwidthMHz           float64 `json:"bandwidth_mhz"`
	ChannelID              string  `json:"channel_id"`
	DuplexMode             string  `json:"duplex_mode"`
	TxPowerDBm             float64 `json:"tx_power_dbm"`
	AntennaGainDBi         float64 `json:"antenna_gain_dbi"`
	SystemLossDB           float64 `json:"system_loss_db"`
	RadiusMeters           float64 `json:"radius_m"`
	BeamWidthDeg           float64 `json:"beam_width"`
	AntennaHeightM         float64 `json:"antenna_height_m"`
	MechanicalDowntiltDeg  float64 `json:"mechanical_downtilt_deg"`
	ElectricalDowntiltDeg  float64 `json:"electrical_downtilt_deg"`
	OrientationDeg         float64 `json:"orientation_deg"`
	HorizontalPatternID    string  `json:"horizontal_pattern_id"`
	VerticalPatternID      string  `json:"vertical_pattern_id"`
	LoadFactor             float64 `json:"load_factor"`
	ReuseFactor            int     `json:"reuse_factor"`
	PCI                    *int    `json:"pci,omitempty"`
	ReceiverHeightM        float64 `json:"receiver_height_m"`
	ReceiverSensitivityDBm float64 `json:"receiver_sensitivity_dbm"`
}

type CellRFProfileInput struct {
	SchemaVersion          *int     `json:"schema_version"`
	NetworkTech            *string  `json:"network_tech"`
	FrequencyGHz           *float64 `json:"frequency_ghz"`
	Band                   *string  `json:"band"`
	BandwidthMHz           *float64 `json:"bandwidth_mhz"`
	ChannelID              *string  `json:"channel_id"`
	DuplexMode             *string  `json:"duplex_mode"`
	TxPowerDBm             *float64 `json:"tx_power_dbm"`
	AntennaGainDBi         *float64 `json:"antenna_gain_dbi"`
	SystemLossDB           *float64 `json:"system_loss_db"`
	RadiusMeters           *float64 `json:"radius_m"`
	BeamWidthDeg           *float64 `json:"beam_width"`
	AntennaHeightM         *float64 `json:"antenna_height_m"`
	MechanicalDowntiltDeg  *float64 `json:"mechanical_downtilt_deg"`
	ElectricalDowntiltDeg  *float64 `json:"electrical_downtilt_deg"`
	OrientationDeg         *float64 `json:"orientation_deg"`
	HorizontalPatternID    *string  `json:"horizontal_pattern_id"`
	VerticalPatternID      *string  `json:"vertical_pattern_id"`
	LoadFactor             *float64 `json:"load_factor"`
	ReuseFactor            *int     `json:"reuse_factor"`
	PCI                    *int     `json:"pci"`
	ReceiverHeightM        *float64 `json:"receiver_height_m"`
	ReceiverSensitivityDBm *float64 `json:"receiver_sensitivity_dbm"`
}

func DefaultCellRFProfile(networkTech string, frequencyGHz, txPowerDBm, radiusMeters, beamWidthDeg, bandwidthMHz, loadFactor float64, reuseFactor int) CellRFProfile {
	networkTech = strings.ToLower(strings.TrimSpace(networkTech))
	if networkTech == "" {
		networkTech = NetworkTechnologyForFrequency(frequencyGHz)
	}
	if frequencyGHz == 0 {
		frequencyGHz = DefaultFrequencyForTechnology(networkTech)
	}
	if txPowerDBm == 0 {
		txPowerDBm = DefaultTxPowerDBm
	}
	if radiusMeters == 0 {
		radiusMeters = DefaultRadiusMeters
	}
	if beamWidthDeg == 0 {
		beamWidthDeg = DefaultBeamWidthDeg
	}
	if bandwidthMHz == 0 {
		bandwidthMHz = DefaultBandwidthForTechnology(networkTech)
	}
	if loadFactor == 0 {
		loadFactor = DefaultInterferenceLoadFactor
	}
	if reuseFactor == 0 {
		reuseFactor = DefaultInterferenceReuseFactor
	}
	return CellRFProfile{
		SchemaVersion:          RFProfileSchemaVersion,
		NetworkTech:            networkTech,
		FrequencyGHz:           frequencyGHz,
		Band:                   DefaultBandForTechnology(networkTech),
		BandwidthMHz:           bandwidthMHz,
		ChannelID:              "CH-1",
		DuplexMode:             DefaultDuplexModeForTechnology(networkTech),
		TxPowerDBm:             txPowerDBm,
		AntennaGainDBi:         DefaultAntennaGainDBi,
		SystemLossDB:           DefaultSystemLossDB,
		RadiusMeters:           radiusMeters,
		BeamWidthDeg:           beamWidthDeg,
		AntennaHeightM:         DefaultAntennaHeightM,
		MechanicalDowntiltDeg:  DefaultMechanicalDowntiltDeg,
		ElectricalDowntiltDeg:  DefaultElectricalDowntiltDeg,
		OrientationDeg:         DefaultOrientationDeg,
		HorizontalPatternID:    "ideal-sector",
		VerticalPatternID:      "flat",
		LoadFactor:             loadFactor,
		ReuseFactor:            reuseFactor,
		ReceiverHeightM:        DefaultReceiverHeightM,
		ReceiverSensitivityDBm: DefaultReceiverSensitivityDBm,
	}
}

func (input *CellRFProfileInput) WithDefaults(defaults CellRFProfile) CellRFProfile {
	if input == nil {
		return defaults.normalized()
	}
	profile := CellRFProfile{
		SchemaVersion:          valueOr(input.SchemaVersion, defaults.SchemaVersion),
		NetworkTech:            valueOr(input.NetworkTech, defaults.NetworkTech),
		FrequencyGHz:           valueOr(input.FrequencyGHz, defaults.FrequencyGHz),
		Band:                   valueOr(input.Band, defaults.Band),
		BandwidthMHz:           valueOr(input.BandwidthMHz, defaults.BandwidthMHz),
		ChannelID:              valueOr(input.ChannelID, defaults.ChannelID),
		DuplexMode:             valueOr(input.DuplexMode, defaults.DuplexMode),
		TxPowerDBm:             valueOr(input.TxPowerDBm, defaults.TxPowerDBm),
		AntennaGainDBi:         valueOr(input.AntennaGainDBi, defaults.AntennaGainDBi),
		SystemLossDB:           valueOr(input.SystemLossDB, defaults.SystemLossDB),
		RadiusMeters:           valueOr(input.RadiusMeters, defaults.RadiusMeters),
		BeamWidthDeg:           valueOr(input.BeamWidthDeg, defaults.BeamWidthDeg),
		AntennaHeightM:         valueOr(input.AntennaHeightM, defaults.AntennaHeightM),
		MechanicalDowntiltDeg:  valueOr(input.MechanicalDowntiltDeg, defaults.MechanicalDowntiltDeg),
		ElectricalDowntiltDeg:  valueOr(input.ElectricalDowntiltDeg, defaults.ElectricalDowntiltDeg),
		OrientationDeg:         valueOr(input.OrientationDeg, defaults.OrientationDeg),
		HorizontalPatternID:    valueOr(input.HorizontalPatternID, defaults.HorizontalPatternID),
		VerticalPatternID:      valueOr(input.VerticalPatternID, defaults.VerticalPatternID),
		LoadFactor:             valueOr(input.LoadFactor, defaults.LoadFactor),
		ReuseFactor:            valueOr(input.ReuseFactor, defaults.ReuseFactor),
		PCI:                    input.PCI,
		ReceiverHeightM:        valueOr(input.ReceiverHeightM, defaults.ReceiverHeightM),
		ReceiverSensitivityDBm: valueOr(input.ReceiverSensitivityDBm, defaults.ReceiverSensitivityDBm),
	}
	if input.PCI == nil {
		profile.PCI = defaults.PCI
	}
	return profile.normalized()
}

func (profile CellRFProfile) normalized() CellRFProfile {
	profile.NetworkTech = strings.ToLower(strings.TrimSpace(profile.NetworkTech))
	profile.Band = strings.TrimSpace(profile.Band)
	profile.ChannelID = strings.TrimSpace(profile.ChannelID)
	profile.DuplexMode = strings.ToLower(strings.TrimSpace(profile.DuplexMode))
	profile.HorizontalPatternID = strings.ToLower(strings.TrimSpace(profile.HorizontalPatternID))
	profile.VerticalPatternID = strings.ToLower(strings.TrimSpace(profile.VerticalPatternID))
	profile.OrientationDeg = normalizeDegrees(profile.OrientationDeg)
	return profile
}

func ValidateCellRFProfile(profile CellRFProfile, analysisOnly bool) string {
	if profile.SchemaVersion != RFProfileSchemaVersion {
		return fmt.Sprintf("rf_profile.schema_version must be %d", RFProfileSchemaVersion)
	}
	if profile.NetworkTech != "4g" && profile.NetworkTech != "5g" && profile.NetworkTech != "6g" {
		return "rf_profile.network_tech must be 4g, 5g, or 6g"
	}
	if analysisOnly && !IsAnalysisTechnology(profile.NetworkTech) {
		return "rf_profile.network_tech must be 4g or 5g for interference analysis"
	}
	if !finiteInRange(profile.FrequencyGHz, math.SmallestNonzeroFloat64, MaxFrequencyGHz) || !FrequencyMatchesTechnology(profile.NetworkTech, profile.FrequencyGHz) {
		return "rf_profile.frequency_ghz must be finite, positive, and match network_tech"
	}
	if invalidProfileText(profile.Band, false) {
		return fmt.Sprintf("rf_profile.band must be non-empty and at most %d bytes", MaxRFProfileTextBytes)
	}
	if !finiteInRange(profile.BandwidthMHz, MinBandwidthMHz, MaxBandwidthMHz) {
		return "rf_profile.bandwidth_mhz is outside the supported range"
	}
	if invalidProfileText(profile.ChannelID, false) {
		return fmt.Sprintf("rf_profile.channel_id must be non-empty and at most %d bytes", MaxRFProfileTextBytes)
	}
	if !oneOf(profile.DuplexMode, "fdd", "tdd", "sdl", "sul") {
		return "rf_profile.duplex_mode must be fdd, tdd, sdl, or sul"
	}
	if !finiteInRange(profile.TxPowerDBm, MinTxPowerDBm, MaxTxPowerDBm) {
		return "rf_profile.tx_power_dbm must be between 0 and 60"
	}
	if !finiteInRange(profile.AntennaGainDBi, MinAntennaGainDBi, MaxAntennaGainDBi) {
		return "rf_profile.antenna_gain_dbi is outside the supported range"
	}
	if !finiteInRange(profile.SystemLossDB, MinSystemLossDB, MaxSystemLossDB) {
		return "rf_profile.system_loss_db is outside the supported range"
	}
	if !finiteInRange(profile.RadiusMeters, MinRadiusMeters, MaxRadiusMeters) {
		return "rf_profile.radius_m must be between 25 and 5000"
	}
	if !finiteInRange(profile.BeamWidthDeg, MinBeamWidthDeg, MaxBeamWidthDeg) {
		return "rf_profile.beam_width must be between 10 and 360"
	}
	if !finiteInRange(profile.AntennaHeightM, MinAntennaHeightM, MaxAntennaHeightM) {
		return "rf_profile.antenna_height_m is outside the supported range"
	}
	if !finiteInRange(profile.MechanicalDowntiltDeg, MinDowntiltDeg, MaxDowntiltDeg) || !finiteInRange(profile.ElectricalDowntiltDeg, MinDowntiltDeg, MaxDowntiltDeg) {
		return "rf_profile downtilt values are outside the supported range"
	}
	if !finiteInRange(profile.OrientationDeg, 0, 360) || profile.OrientationDeg == 360 {
		return "rf_profile.orientation_deg must be from 0 up to 360"
	}
	if !oneOf(profile.HorizontalPatternID, "ideal-sector", "cosine-sector", "omni") {
		return "rf_profile.horizontal_pattern_id is not supported"
	}
	if !oneOf(profile.VerticalPatternID, "flat", "panel-10deg", "panel-20deg") {
		return "rf_profile.vertical_pattern_id is not supported"
	}
	if !finiteInRange(profile.LoadFactor, MinInterferenceLoadFactorExclusive, MaxInterferenceLoadFactor) || profile.LoadFactor == MinInterferenceLoadFactorExclusive {
		return "rf_profile.load_factor must be greater than 0 and no more than 1"
	}
	if profile.ReuseFactor < 1 || profile.ReuseFactor > MaxRFProfileReuseFactor {
		return fmt.Sprintf("rf_profile.reuse_factor must be between 1 and %d", MaxRFProfileReuseFactor)
	}
	if profile.PCI != nil {
		maxPCI := MaxNRPCI
		if profile.NetworkTech == "4g" {
			maxPCI = MaxLTEPCI
		}
		if *profile.PCI < MinPCI || *profile.PCI > maxPCI {
			return fmt.Sprintf("rf_profile.pci must be between %d and %d for %s", MinPCI, maxPCI, profile.NetworkTech)
		}
	}
	if !finiteInRange(profile.ReceiverHeightM, MinReceiverHeightM, MaxReceiverHeightM) {
		return "rf_profile.receiver_height_m is outside the supported range"
	}
	if !finiteInRange(profile.ReceiverSensitivityDBm, MinReceiverSensitivityDBm, MaxReceiverSensitivityDBm) {
		return "rf_profile.receiver_sensitivity_dbm is outside the supported range"
	}
	return ""
}

func (profile CellRFProfile) EffectiveAzimuth(baseAzimuthDeg float64) float64 {
	return normalizeDegrees(baseAzimuthDeg + profile.OrientationDeg)
}

func (profile CellRFProfile) EffectiveBeamWidthDeg() float64 {
	if profile.HorizontalPatternID == "omni" {
		return 360
	}
	return profile.BeamWidthDeg
}

func (profile CellRFProfile) SlantDistanceMeters(groundDistanceMeters float64) float64 {
	heightDifference := profile.AntennaHeightM - profile.ReceiverHeightM
	return math.Hypot(math.Max(groundDistanceMeters, 0), heightDifference)
}

func (profile CellRFProfile) PatternAttenuationDB(groundDistanceMeters, horizontalOffsetDeg float64) float64 {
	horizontal := 0.0
	switch profile.HorizontalPatternID {
	case "cosine-sector":
		halfBeam := math.Max(profile.BeamWidthDeg/2, 1)
		horizontal = math.Min(30, 12*math.Pow(math.Abs(horizontalOffsetDeg)/halfBeam, 2))
	case "omni", "ideal-sector":
	}

	verticalBeamWidth := 0.0
	switch profile.VerticalPatternID {
	case "panel-10deg":
		verticalBeamWidth = 10
	case "panel-20deg":
		verticalBeamWidth = 20
	}
	vertical := 0.0
	if verticalBeamWidth > 0 {
		depressionAngle := math.Atan2(profile.AntennaHeightM-profile.ReceiverHeightM, math.Max(groundDistanceMeters, 0.1)) * 180 / math.Pi
		tilt := profile.MechanicalDowntiltDeg + profile.ElectricalDowntiltDeg
		vertical = math.Min(30, 12*math.Pow((depressionAngle-tilt)/verticalBeamWidth, 2))
	}
	return horizontal + vertical
}

func (profile CellRFProfile) ReceivedPowerDBm(groundDistanceMeters, attenuationDB, calibrationOffsetDB, horizontalOffsetDeg float64) float64 {
	eirpDBm := profile.TxPowerDBm + profile.AntennaGainDBi - profile.SystemLossDB + calibrationOffsetDB
	return eirpDBm - FreeSpacePathLossMetersGHz(profile.SlantDistanceMeters(groundDistanceMeters), profile.FrequencyGHz) - attenuationDB - profile.PatternAttenuationDB(groundDistanceMeters, horizontalOffsetDeg)
}

func finiteInRange(value, minimum, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= minimum && value <= maximum
}

func invalidProfileText(value string, allowEmpty bool) bool {
	return (!allowEmpty && strings.TrimSpace(value) == "") || len(value) > MaxRFProfileTextBytes
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func smallestAngleDifference(left, right float64) float64 {
	difference := math.Mod(left-right+540, 360) - 180
	return difference
}

func cellRFProfilesEqual(left, right CellRFProfile) bool {
	leftPCI, rightPCI := -1, -1
	if left.PCI != nil {
		leftPCI = *left.PCI
	}
	if right.PCI != nil {
		rightPCI = *right.PCI
	}
	left.PCI = nil
	right.PCI = nil
	return left == right && leftPCI == rightPCI
}
