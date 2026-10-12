package raytracer

import "math"

const (
	AntennaPatternIdealSectorID       = "ideal-sector"
	AntennaPatternCosineSectorID      = "cosine-sector"
	AntennaPatternOmniID              = "omni"
	AntennaPattern3GPPSingleElementID = "3gpp-single-element"

	AntennaPatternIdealSectorDescription       = "Compatibility ideal sector: zero relative pattern attenuation inside the configured hard beam"
	AntennaPatternCosineSectorDescription      = "Deterministic cosine-sector relative pattern: min(30, 12 * (offset/(beam_width/2))^2)"
	AntennaPatternOmniDescription              = "Compatibility omnidirectional pattern: zero relative attenuation over 360 degrees"
	AntennaPattern3GPPSingleElementDescription = "3GPP TR 38.901 V19.4.0 §7.3 Table 7.3-1 single-element relative shape; 65 degree cut parameters, 30 dB cap, no array factor"
	AntennaPattern3GPPSingleElementReference   = "3GPP TR 38.901 V19.4.0, §7.3, Table 7.3-1"
	// TR 38.901 calls these the phi_3dB/theta_3dB parameters. The quadratic
	// cut reaches 3 dB at half the 65 degree parameter (32.5 degrees).
	AntennaPattern3GPPSingleElement3dBParameterDeg = 65.0
	AntennaPattern3GPPSingleElementCapDB           = 30.0
)

// AntennaPatternEvaluation is the shared relative antenna-pattern result.
// Absolute gain is intentionally separate: a pattern is not an additional
// antenna gain and no array/MIMO factor is implied by this type.
type AntennaPatternEvaluation struct {
	HorizontalPatternID       string  `json:"horizontal_pattern_id"`
	VerticalPatternID         string  `json:"vertical_pattern_id"`
	Description               string  `json:"description"`
	HorizontalOffsetDeg       float64 `json:"horizontal_offset_deg"`
	VerticalOffsetDeg         float64 `json:"vertical_offset_deg"`
	HorizontalAttenuationDB   float64 `json:"horizontal_attenuation_db"`
	VerticalAttenuationDB     float64 `json:"vertical_attenuation_db"`
	TotalAttenuationDB        float64 `json:"total_attenuation_db"`
	UsesHardBeamEligibility   bool    `json:"uses_hard_beam_eligibility"`
	EffectiveBeamWidthDeg     float64 `json:"effective_beam_width_deg"`
	HardBeamEligible          bool    `json:"hard_beam_eligible"`
	HardBeamEligibilityReason string  `json:"hard_beam_eligibility_reason"`
}

// AntennaLinkEvaluation is the one shared antenna-side evaluation consumed
// by direct RF, ray, surface, optimization, interference, and building-entry
// paths. It stops before propagation loss so the two concerns cannot be
// silently fused.
type AntennaLinkEvaluation struct {
	Pattern             AntennaPatternEvaluation `json:"pattern"`
	LinkBearingDeg      float64                  `json:"link_bearing_deg"`
	EffectiveAzimuthDeg float64                  `json:"effective_azimuth_deg"`
	HorizontalOffsetDeg float64                  `json:"horizontal_offset_deg"`
	Eligible            bool                     `json:"eligible"`
	EligibilityReason   string                   `json:"eligibility_reason"`
	TxConductedPowerDBm float64                  `json:"tx_conducted_power_dbm"`
	TxAntennaGainDBi    float64                  `json:"tx_antenna_gain_dbi"`
	BoresightEIRPDBm    float64                  `json:"boresight_eirp_dbm"`
	DirectionalEIRPDBm  float64                  `json:"directional_eirp_dbm"`
	RxAntennaGainDBi    float64                  `json:"rx_antenna_gain_dbi"`
	SystemLossDB        float64                  `json:"system_loss_db"`
	PolarizationLossDB  float64                  `json:"polarization_loss_db"`
}

// EvaluateAntennaPattern evaluates only relative pattern attenuation. The
// caller supplies a signed horizontal offset from the effective azimuth.
// Ground distance is used only for the existing height-aware analytic
// vertical patterns.
func EvaluateAntennaPattern(profile CellRFProfile, groundDistanceMeters, horizontalOffsetDeg float64) AntennaPatternEvaluation {
	profile = profile.normalized()
	horizontalOffsetDeg = safeSignedAngle(horizontalOffsetDeg)
	verticalOffsetDeg := verticalPatternOffsetDeg(profile, groundDistanceMeters)
	horizontal, vertical := 0.0, 0.0

	switch profile.HorizontalPatternID {
	case AntennaPatternCosineSectorID:
		halfBeam := math.Max(profile.BeamWidthDeg/2, 1)
		horizontal = cappedQuadratic(horizontalOffsetDeg, halfBeam, 30)
	case AntennaPattern3GPPSingleElementID:
		horizontal = cappedQuadratic(horizontalOffsetDeg, AntennaPattern3GPPSingleElement3dBParameterDeg, AntennaPattern3GPPSingleElementCapDB)
	case AntennaPatternOmniID, AntennaPatternIdealSectorID:
		// Compatibility patterns are intentionally flat in relative gain.
	}

	if profile.HorizontalPatternID == AntennaPattern3GPPSingleElementID {
		vertical = cappedQuadratic(verticalOffsetDeg, AntennaPattern3GPPSingleElement3dBParameterDeg, AntennaPattern3GPPSingleElementCapDB)
	} else {
		vertical = analyticVerticalAttenuation(profile, verticalOffsetDeg)
	}

	total := horizontal + vertical
	if profile.HorizontalPatternID == AntennaPattern3GPPSingleElementID {
		// Table 7.3-1 defines the 3D element pattern with one combined 30 dB
		// cap, rather than independently adding two 30 dB sidelobe floors.
		total = math.Min(AntennaPattern3GPPSingleElementCapDB, total)
	}
	usesHardBeam := antennaPatternUsesHardBeam(profile.HorizontalPatternID)
	beamWidth := profile.BeamWidthDeg
	if !usesHardBeam {
		beamWidth = 360
	}
	hardEligible := true
	reason := "full_azimuth_pattern"
	if usesHardBeam {
		hardEligible = AngleInBeam(horizontalOffsetDeg, 0, profile.BeamWidthDeg)
		reason = "outside_hard_beam"
		if hardEligible {
			reason = "inside_hard_beam"
		}
	}
	return AntennaPatternEvaluation{
		HorizontalPatternID:       profile.HorizontalPatternID,
		VerticalPatternID:         profile.VerticalPatternID,
		Description:               antennaPatternDescription(profile.HorizontalPatternID, profile.VerticalPatternID),
		HorizontalOffsetDeg:       horizontalOffsetDeg,
		VerticalOffsetDeg:         verticalOffsetDeg,
		HorizontalAttenuationDB:   horizontal,
		VerticalAttenuationDB:     vertical,
		TotalAttenuationDB:        total,
		UsesHardBeamEligibility:   usesHardBeam,
		EffectiveBeamWidthDeg:     beamWidth,
		HardBeamEligible:          hardEligible,
		HardBeamEligibilityReason: reason,
	}
}

// EvaluateAntennaLink evaluates orientation, eligibility, absolute TX/RX
// antenna terms, and relative pattern attenuation in one deterministic call.
// Propagation loss and calibration remain outside this evaluator.
func EvaluateAntennaLink(profile CellRFProfile, groundDistanceMeters, bearingDeg, baseAzimuthDeg float64) AntennaLinkEvaluation {
	profile = profile.normalized()
	effectiveAzimuth := profile.EffectiveAzimuth(baseAzimuthDeg)
	horizontalOffset := smallestAngleDifference(bearingDeg, effectiveAzimuth)
	pattern := EvaluateAntennaPattern(profile, groundDistanceMeters, horizontalOffset)
	eligible := pattern.HardBeamEligible
	return AntennaLinkEvaluation{
		Pattern:             pattern,
		LinkBearingDeg:      normalizeDegrees(bearingDeg),
		EffectiveAzimuthDeg: effectiveAzimuth,
		HorizontalOffsetDeg: pattern.HorizontalOffsetDeg,
		Eligible:            eligible,
		EligibilityReason:   pattern.HardBeamEligibilityReason,
		TxConductedPowerDBm: profile.TxPowerDBm,
		TxAntennaGainDBi:    profile.AntennaGainDBi,
		BoresightEIRPDBm:    profile.TxPowerDBm + profile.AntennaGainDBi,
		DirectionalEIRPDBm:  profile.TxPowerDBm + profile.AntennaGainDBi - pattern.TotalAttenuationDB,
		RxAntennaGainDBi:    profile.RxAntennaGainDBi,
		SystemLossDB:        profile.SystemLossDB,
		PolarizationLossDB:  profile.PolarizationLossDB,
	}
}

func antennaPatternUsesHardBeam(horizontalPatternID string) bool {
	switch horizontalPatternID {
	case AntennaPatternOmniID, AntennaPattern3GPPSingleElementID:
		return false
	default:
		return true
	}
}

func antennaPatternDescription(horizontalPatternID, verticalPatternID string) string {
	var horizontal string
	switch horizontalPatternID {
	case AntennaPatternIdealSectorID:
		horizontal = AntennaPatternIdealSectorDescription
	case AntennaPatternCosineSectorID:
		horizontal = AntennaPatternCosineSectorDescription
	case AntennaPatternOmniID:
		horizontal = AntennaPatternOmniDescription
	case AntennaPattern3GPPSingleElementID:
		horizontal = AntennaPattern3GPPSingleElementDescription
	default:
		horizontal = "Unknown antenna pattern"
	}
	if horizontalPatternID == AntennaPattern3GPPSingleElementID {
		return horizontal
	}
	switch verticalPatternID {
	case "panel-10deg":
		return horizontal + "; vertical analytic panel cut: 10 degree beam"
	case "panel-20deg":
		return horizontal + "; vertical analytic panel cut: 20 degree beam"
	default:
		return horizontal + "; flat vertical cut"
	}
}

func verticalPatternOffsetDeg(profile CellRFProfile, groundDistanceMeters float64) float64 {
	depressionAngle := math.Atan2(profile.AntennaHeightM-profile.ReceiverHeightM, math.Max(groundDistanceMeters, 0.1)) * 180 / math.Pi
	return depressionAngle - (profile.MechanicalDowntiltDeg + profile.ElectricalDowntiltDeg)
}

func analyticVerticalAttenuation(profile CellRFProfile, verticalOffsetDeg float64) float64 {
	beamWidth := 0.0
	switch profile.VerticalPatternID {
	case "panel-10deg":
		beamWidth = 10
	case "panel-20deg":
		beamWidth = 20
	}
	if beamWidth == 0 {
		return 0
	}
	return cappedQuadratic(verticalOffsetDeg, beamWidth, 30)
}

func cappedQuadratic(offsetDeg, threeDBWidthDeg, capDB float64) float64 {
	if threeDBWidthDeg <= 0 || !isFinite(offsetDeg) {
		return 0
	}
	return math.Min(capDB, 12*math.Pow(math.Abs(offsetDeg)/threeDBWidthDeg, 2))
}

func safeSignedAngle(value float64) float64 {
	if !isFinite(value) {
		return 0
	}
	return smallestAngleDifference(value, 0)
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
