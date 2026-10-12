package raytracer

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// CellRFProfile is the complete, normalized RF contract used by the simulation
// engines. Request inputs use CellRFProfileInput so an explicit zero is not
// confused with an omitted value.
type CellRFProfile struct {
	SchemaVersion      int     `json:"schema_version"`
	NetworkTech        string  `json:"network_tech"`
	PropagationModelID string  `json:"propagation_model"`
	FrequencyGHz       float64 `json:"frequency_ghz"`
	Band               string  `json:"band"`
	BandwidthMHz       float64 `json:"bandwidth_mhz"`
	ChannelID          string  `json:"channel_id"`
	DuplexMode         string  `json:"duplex_mode"`
	TxPowerDBm         float64 `json:"tx_power_dbm"`
	// AntennaGainDBi is retained as the stable wire/source alias for the
	// configured absolute TX boresight gain. New clients may send
	// tx_antenna_gain_dbi; normalized responses expose both names.
	AntennaGainDBi               float64 `json:"antenna_gain_dbi"`
	RxAntennaGainDBi             float64 `json:"rx_antenna_gain_dbi"`
	SystemLossDB                 float64 `json:"system_loss_db"`
	PolarizationLossDB           float64 `json:"polarization_loss_db"`
	RadiusMeters                 float64 `json:"radius_m"`
	BeamWidthDeg                 float64 `json:"beam_width"`
	AntennaHeightM               float64 `json:"antenna_height_m"`
	MechanicalDowntiltDeg        float64 `json:"mechanical_downtilt_deg"`
	ElectricalDowntiltDeg        float64 `json:"electrical_downtilt_deg"`
	OrientationDeg               float64 `json:"orientation_deg"`
	HorizontalPatternID          string  `json:"horizontal_pattern_id"`
	VerticalPatternID            string  `json:"vertical_pattern_id"`
	LoadFactor                   float64 `json:"load_factor"`
	ReuseFactor                  int     `json:"reuse_factor"`
	PCI                          *int    `json:"pci,omitempty"`
	ReceiverHeightM              float64 `json:"receiver_height_m"`
	ReceiverSensitivityDBm       float64 `json:"receiver_sensitivity_dbm"`
	ReceiverSensitivityMode      string  `json:"receiver_sensitivity_mode"`
	ReceiverNoiseBandwidthHz     float64 `json:"receiver_noise_bandwidth_hz"`
	ReceiverNoiseBandwidthSource string  `json:"receiver_noise_bandwidth_source,omitempty"`
	ReceiverNoiseFigureDB        float64 `json:"receiver_noise_figure_db"`
	ReceiverRequiredSNRDB        float64 `json:"receiver_required_snr_db"`
	ReceiverMarginDB             float64 `json:"receiver_margin_db"`
}

type CellRFProfileInput struct {
	SchemaVersion            *int     `json:"schema_version"`
	NetworkTech              *string  `json:"network_tech"`
	PropagationModelID       *string  `json:"propagation_model"`
	FrequencyGHz             *float64 `json:"frequency_ghz"`
	Band                     *string  `json:"band"`
	BandwidthMHz             *float64 `json:"bandwidth_mhz"`
	ChannelID                *string  `json:"channel_id"`
	DuplexMode               *string  `json:"duplex_mode"`
	TxPowerDBm               *float64 `json:"tx_power_dbm"`
	TxAntennaGainDBi         *float64 `json:"tx_antenna_gain_dbi"`
	AntennaGainDBi           *float64 `json:"antenna_gain_dbi"`
	RxAntennaGainDBi         *float64 `json:"rx_antenna_gain_dbi"`
	SystemLossDB             *float64 `json:"system_loss_db"`
	PolarizationLossDB       *float64 `json:"polarization_loss_db"`
	RadiusMeters             *float64 `json:"radius_m"`
	BeamWidthDeg             *float64 `json:"beam_width"`
	AntennaHeightM           *float64 `json:"antenna_height_m"`
	MechanicalDowntiltDeg    *float64 `json:"mechanical_downtilt_deg"`
	ElectricalDowntiltDeg    *float64 `json:"electrical_downtilt_deg"`
	OrientationDeg           *float64 `json:"orientation_deg"`
	HorizontalPatternID      *string  `json:"horizontal_pattern_id"`
	VerticalPatternID        *string  `json:"vertical_pattern_id"`
	LoadFactor               *float64 `json:"load_factor"`
	ReuseFactor              *int     `json:"reuse_factor"`
	PCI                      *int     `json:"pci"`
	ReceiverHeightM          *float64 `json:"receiver_height_m"`
	ReceiverSensitivityDBm   *float64 `json:"receiver_sensitivity_dbm"`
	ReceiverSensitivityMode  *string  `json:"receiver_sensitivity_mode"`
	ReceiverNoiseBandwidthHz *float64 `json:"receiver_noise_bandwidth_hz"`
	ReceiverNoiseFigureDB    *float64 `json:"receiver_noise_figure_db"`
	ReceiverRequiredSNRDB    *float64 `json:"receiver_required_snr_db"`
	ReceiverMarginDB         *float64 `json:"receiver_margin_db"`
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
		SchemaVersion: RFProfileSchemaVersion,
		NetworkTech:   networkTech,
		// DefaultCellRFProfile is retained as the source-compatible legacy
		// constructor used by direct Go callers and historical fixtures. API
		// request constructors use DefaultPlanningCellRFProfile below.
		PropagationModelID:           CanonicalRFModelID,
		FrequencyGHz:                 frequencyGHz,
		Band:                         DefaultBandForTechnology(networkTech),
		BandwidthMHz:                 bandwidthMHz,
		ChannelID:                    "CH-1",
		DuplexMode:                   DefaultDuplexModeForTechnology(networkTech),
		TxPowerDBm:                   txPowerDBm,
		AntennaGainDBi:               DefaultAntennaGainDBi,
		RxAntennaGainDBi:             DefaultRxAntennaGainDBi,
		SystemLossDB:                 DefaultSystemLossDB,
		PolarizationLossDB:           DefaultPolarizationLossDB,
		RadiusMeters:                 radiusMeters,
		BeamWidthDeg:                 beamWidthDeg,
		AntennaHeightM:               DefaultAntennaHeightM,
		MechanicalDowntiltDeg:        DefaultMechanicalDowntiltDeg,
		ElectricalDowntiltDeg:        DefaultElectricalDowntiltDeg,
		OrientationDeg:               DefaultOrientationDeg,
		HorizontalPatternID:          "ideal-sector",
		VerticalPatternID:            "flat",
		LoadFactor:                   loadFactor,
		ReuseFactor:                  reuseFactor,
		ReceiverHeightM:              DefaultReceiverHeightM,
		ReceiverSensitivityDBm:       DefaultReceiverSensitivityDBm,
		ReceiverSensitivityMode:      DefaultReceiverSensitivityMode,
		ReceiverNoiseBandwidthHz:     bandwidthMHz * 1e6,
		ReceiverNoiseBandwidthSource: ReceiverNoiseBandwidthSourceChannelBandwidth,
		ReceiverNoiseFigureDB:        DefaultReceiverNoiseFigureDB,
		ReceiverRequiredSNRDB:        DefaultReceiverRequiredSNRDB,
		ReceiverMarginDB:             DefaultReceiverMarginDB,
	}
}

// DefaultPlanningCellRFProfile is the production request default. Keeping it
// separate from DefaultCellRFProfile preserves the historical Go helper while
// making API requests explicit about the Concept 4D model selection.
func DefaultPlanningCellRFProfile(networkTech string, frequencyGHz, txPowerDBm, radiusMeters, beamWidthDeg, bandwidthMHz, loadFactor float64, reuseFactor int) CellRFProfile {
	profile := DefaultCellRFProfile(networkTech, frequencyGHz, txPowerDBm, radiusMeters, beamWidthDeg, bandwidthMHz, loadFactor, reuseFactor)
	profile.PropagationModelID = DefaultPropagationModelID(profile.FrequencyGHz)
	return profile
}

func (input *CellRFProfileInput) WithDefaults(defaults CellRFProfile) CellRFProfile {
	if input == nil {
		return defaults.normalized()
	}
	antennaGainDBi := valueOr(input.AntennaGainDBi, defaults.AntennaGainDBi)
	if input.TxAntennaGainDBi != nil {
		antennaGainDBi = *input.TxAntennaGainDBi
	}
	profile := CellRFProfile{
		SchemaVersion:                valueOr(input.SchemaVersion, defaults.SchemaVersion),
		NetworkTech:                  valueOr(input.NetworkTech, defaults.NetworkTech),
		PropagationModelID:           valueOr(input.PropagationModelID, defaults.PropagationModelID),
		FrequencyGHz:                 valueOr(input.FrequencyGHz, defaults.FrequencyGHz),
		Band:                         valueOr(input.Band, defaults.Band),
		BandwidthMHz:                 valueOr(input.BandwidthMHz, defaults.BandwidthMHz),
		ChannelID:                    valueOr(input.ChannelID, defaults.ChannelID),
		DuplexMode:                   valueOr(input.DuplexMode, defaults.DuplexMode),
		TxPowerDBm:                   valueOr(input.TxPowerDBm, defaults.TxPowerDBm),
		AntennaGainDBi:               antennaGainDBi,
		RxAntennaGainDBi:             valueOr(input.RxAntennaGainDBi, defaults.RxAntennaGainDBi),
		SystemLossDB:                 valueOr(input.SystemLossDB, defaults.SystemLossDB),
		PolarizationLossDB:           valueOr(input.PolarizationLossDB, defaults.PolarizationLossDB),
		RadiusMeters:                 valueOr(input.RadiusMeters, defaults.RadiusMeters),
		BeamWidthDeg:                 valueOr(input.BeamWidthDeg, defaults.BeamWidthDeg),
		AntennaHeightM:               valueOr(input.AntennaHeightM, defaults.AntennaHeightM),
		MechanicalDowntiltDeg:        valueOr(input.MechanicalDowntiltDeg, defaults.MechanicalDowntiltDeg),
		ElectricalDowntiltDeg:        valueOr(input.ElectricalDowntiltDeg, defaults.ElectricalDowntiltDeg),
		OrientationDeg:               valueOr(input.OrientationDeg, defaults.OrientationDeg),
		HorizontalPatternID:          valueOr(input.HorizontalPatternID, defaults.HorizontalPatternID),
		VerticalPatternID:            valueOr(input.VerticalPatternID, defaults.VerticalPatternID),
		LoadFactor:                   valueOr(input.LoadFactor, defaults.LoadFactor),
		ReuseFactor:                  valueOr(input.ReuseFactor, defaults.ReuseFactor),
		PCI:                          input.PCI,
		ReceiverHeightM:              valueOr(input.ReceiverHeightM, defaults.ReceiverHeightM),
		ReceiverSensitivityDBm:       valueOr(input.ReceiverSensitivityDBm, defaults.ReceiverSensitivityDBm),
		ReceiverSensitivityMode:      valueOr(input.ReceiverSensitivityMode, defaults.ReceiverSensitivityMode),
		ReceiverNoiseBandwidthHz:     valueOr(input.ReceiverNoiseBandwidthHz, defaults.ReceiverNoiseBandwidthHz),
		ReceiverNoiseBandwidthSource: defaults.ReceiverNoiseBandwidthSource,
		ReceiverNoiseFigureDB:        valueOr(input.ReceiverNoiseFigureDB, defaults.ReceiverNoiseFigureDB),
		ReceiverRequiredSNRDB:        valueOr(input.ReceiverRequiredSNRDB, defaults.ReceiverRequiredSNRDB),
		ReceiverMarginDB:             valueOr(input.ReceiverMarginDB, defaults.ReceiverMarginDB),
	}
	if input.ReceiverNoiseBandwidthHz != nil {
		profile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	}
	if input.PCI == nil {
		profile.PCI = defaults.PCI
	}
	return profile.normalized()
}

func (profile CellRFProfile) normalized() CellRFProfile {
	profile.NetworkTech = strings.ToLower(strings.TrimSpace(profile.NetworkTech))
	profile.PropagationModelID = strings.ToLower(strings.TrimSpace(profile.PropagationModelID))
	profile.Band = strings.TrimSpace(profile.Band)
	profile.ChannelID = strings.TrimSpace(profile.ChannelID)
	profile.DuplexMode = strings.ToLower(strings.TrimSpace(profile.DuplexMode))
	profile.HorizontalPatternID = strings.ToLower(strings.TrimSpace(profile.HorizontalPatternID))
	profile.VerticalPatternID = strings.ToLower(strings.TrimSpace(profile.VerticalPatternID))
	profile.ReceiverSensitivityMode = strings.ToLower(strings.TrimSpace(profile.ReceiverSensitivityMode))
	if profile.ReceiverSensitivityMode == "" {
		profile.ReceiverSensitivityMode = ReceiverSensitivityModeManual
	}
	profile.ReceiverNoiseBandwidthSource = strings.ToLower(strings.TrimSpace(profile.ReceiverNoiseBandwidthSource))
	if profile.ReceiverNoiseBandwidthSource == "" && profile.ReceiverNoiseBandwidthHz > 0 {
		profile.ReceiverNoiseBandwidthSource = ReceiverNoiseBandwidthSourceExplicit
	}
	if profile.PropagationModelID == "" {
		profile.PropagationModelID = DefaultPropagationModelID(profile.FrequencyGHz)
	}
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
	if _, ok := PropagationModelByID(profile.PropagationModelID); !ok {
		return "rf_profile.propagation_model must be legacy_fspl_walls, urban_short_range, or research_sub_thz"
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
	if !finiteInRange(profile.RxAntennaGainDBi, MinRxAntennaGainDBi, MaxRxAntennaGainDBi) {
		return "rf_profile.rx_antenna_gain_dbi is outside the supported range"
	}
	if !finiteInRange(profile.SystemLossDB, MinSystemLossDB, MaxSystemLossDB) {
		return "rf_profile.system_loss_db is outside the supported range"
	}
	if !finiteInRange(profile.PolarizationLossDB, MinPolarizationLossDB, MaxPolarizationLossDB) {
		return "rf_profile.polarization_loss_db is outside the supported range"
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
	if !oneOf(profile.HorizontalPatternID, AntennaPatternIdealSectorID, AntennaPatternCosineSectorID, AntennaPatternOmniID, AntennaPattern3GPPSingleElementID) {
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
	if !oneOf(profile.ReceiverSensitivityMode, ReceiverSensitivityModeManual, ReceiverSensitivityModeDerived) {
		return "rf_profile.receiver_sensitivity_mode must be manual or derived"
	}
	if profile.ReceiverSensitivityMode == ReceiverSensitivityModeManual {
		if !finiteInRange(profile.ReceiverSensitivityDBm, MinReceiverSensitivityDBm, MaxReceiverSensitivityDBm) {
			return "rf_profile.receiver_sensitivity_dbm is outside the supported range"
		}
	} else {
		if !finiteInRange(profile.ReceiverNoiseBandwidthHz, MinReceiverNoiseBandwidthHz, MaxReceiverNoiseBandwidthHz) {
			return "rf_profile.receiver_noise_bandwidth_hz is outside the supported range"
		}
		if !finiteInRange(profile.ReceiverNoiseFigureDB, MinReceiverNoiseFigureDB, MaxReceiverNoiseFigureDB) {
			return "rf_profile.receiver_noise_figure_db is outside the supported range"
		}
		if !finiteInRange(profile.ReceiverRequiredSNRDB, MinReceiverRequiredSNRDB, MaxReceiverRequiredSNRDB) {
			return "rf_profile.receiver_required_snr_db is outside the supported range"
		}
		if !finiteInRange(profile.ReceiverMarginDB, MinReceiverMarginDB, MaxReceiverMarginDB) {
			return "rf_profile.receiver_margin_db is outside the supported range"
		}
		if !oneOf(profile.ReceiverNoiseBandwidthSource, ReceiverNoiseBandwidthSourceExplicit, ReceiverNoiseBandwidthSourceChannelBandwidth) {
			return "rf_profile.receiver_noise_bandwidth_source is unsupported"
		}
	}
	return ""
}

func (profile CellRFProfile) EffectiveAzimuth(baseAzimuthDeg float64) float64 {
	return normalizeDegrees(baseAzimuthDeg + profile.OrientationDeg)
}

func (profile CellRFProfile) EffectiveBeamWidthDeg() float64 {
	if !antennaPatternUsesHardBeam(profile.HorizontalPatternID) {
		return 360
	}
	return profile.BeamWidthDeg
}

func (profile CellRFProfile) SlantDistanceMeters(groundDistanceMeters float64) float64 {
	heightDifference := profile.AntennaHeightM - profile.ReceiverHeightM
	return math.Hypot(math.Max(groundDistanceMeters, 0), heightDifference)
}

func (profile CellRFProfile) PatternAttenuationDB(groundDistanceMeters, horizontalOffsetDeg float64) float64 {
	return EvaluateAntennaPattern(profile, groundDistanceMeters, horizontalOffsetDeg).TotalAttenuationDB
}

// HorizontalPatternAttenuationDB is a relative antenna-pattern loss. It is
// not the configured absolute antenna gain.
func (profile CellRFProfile) HorizontalPatternAttenuationDB(horizontalOffsetDeg float64) float64 {
	return EvaluateAntennaPattern(profile, 100, horizontalOffsetDeg).HorizontalAttenuationDB
}

// VerticalPatternAttenuationDB is a relative antenna-pattern loss. It is
// kept separate from horizontal attenuation so the link-budget contract is
// explicit even though the production model sums both terms.
func (profile CellRFProfile) VerticalPatternAttenuationDB(groundDistanceMeters float64) float64 {
	return EvaluateAntennaPattern(profile, groundDistanceMeters, 0).VerticalAttenuationDB
}

// ReceivedPowerDBm is the authoritative production received-power contract:
// conducted TX power plus absolute TX gain, RX gain, and calibration minus
// propagation/building/pattern/system/polarization losses.
func (profile CellRFProfile) ReceivedPowerDBm(groundDistanceMeters, attenuationDB, calibrationOffsetDB, horizontalOffsetDeg float64) float64 {
	return profile.LinkBudgetTerms(groundDistanceMeters, attenuationDB, calibrationOffsetDB, horizontalOffsetDeg).ReceivedPowerDBm
}

// MarshalJSON keeps antenna_gain_dbi source compatibility while making the
// preferred TX-gain terminology visible in normalized API responses.
func (profile CellRFProfile) MarshalJSON() ([]byte, error) {
	type profileAlias CellRFProfile
	return json.Marshal(struct {
		profileAlias
		TxAntennaGainDBi float64 `json:"tx_antenna_gain_dbi"`
	}{
		profileAlias:     profileAlias(profile),
		TxAntennaGainDBi: profile.AntennaGainDBi,
	})
}

// UnmarshalJSON accepts the preferred TX-gain alias on full profiles as well
// as the historical antenna_gain_dbi name. Request bodies normally use
// CellRFProfileInput, but full-profile decoding is also part of the public
// JSON contract for saved scenarios and integrations.
func (profile *CellRFProfile) UnmarshalJSON(data []byte) error {
	type profileAlias CellRFProfile
	var decoded profileAlias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var preferred struct {
		TxAntennaGainDBi *float64 `json:"tx_antenna_gain_dbi"`
	}
	if err := json.Unmarshal(data, &preferred); err != nil {
		return err
	}
	*profile = CellRFProfile(decoded)
	if preferred.TxAntennaGainDBi != nil {
		profile.AntennaGainDBi = *preferred.TxAntennaGainDBi
	}
	return nil
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
