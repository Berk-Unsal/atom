package raytracer

import (
	"fmt"
	"math"
)

const (
	ReceiverSensitivityModeManual  = "manual"
	ReceiverSensitivityModeDerived = "derived"

	// ReceiverThermalNoiseDensityDBmPerHz is the rounded 290 K reference
	// convention used by the existing RF reference corpus. It is deliberately
	// separate from interference power: sensitivity is noise-limited only.
	ReceiverThermalNoiseDensityDBmPerHz = -174.0
	ReceiverReferenceTemperatureK       = 290.0

	ReceiverNoiseBandwidthSourceExplicit         = "explicit_receiver_noise_bandwidth_hz"
	ReceiverNoiseBandwidthSourceChannelBandwidth = "channel_bandwidth_approximation"
)

// ThermalNoiseDBm applies the shared rounded 290 K thermal-noise convention to
// one declared bandwidth and an additive receiver noise figure. A non-positive
// bandwidth/temperature or non-finite input returns NaN; profile/API callers
// validate the engineering bounds before evaluation.
func ThermalNoiseDBm(bandwidthHz, noiseFigureDB, temperatureK float64) float64 {
	if bandwidthHz <= 0 || temperatureK <= 0 || math.IsNaN(bandwidthHz) || math.IsInf(bandwidthHz, 0) || math.IsNaN(noiseFigureDB) || math.IsInf(noiseFigureDB, 0) || math.IsNaN(temperatureK) || math.IsInf(temperatureK, 0) {
		return math.NaN()
	}
	return ReceiverThermalNoiseDensityDBmPerHz + 10*math.Log10(temperatureK/ReceiverReferenceTemperatureK) + 10*math.Log10(bandwidthHz) + noiseFigureDB
}

// ReceiverThreshold is the resolved, inspectable receiver usability contract
// for one effective cell. Derived fields are omitted in manual mode so a
// configured threshold is never presented as if it came from a noise model.
type ReceiverThreshold struct {
	Mode                 string   `json:"mode"`
	SensitivityDBm       float64  `json:"sensitivity_dbm"`
	NoiseDensityDBmHz    *float64 `json:"noise_density_dbm_hz,omitempty"`
	NoiseBandwidthHz     *float64 `json:"noise_bandwidth_hz,omitempty"`
	NoiseBandwidthSource string   `json:"noise_bandwidth_source"`
	ThermalNoiseDBm      *float64 `json:"thermal_noise_dbm,omitempty"`
	NoiseFigureDB        *float64 `json:"noise_figure_db,omitempty"`
	NoiseFloorDBm        *float64 `json:"noise_floor_dbm,omitempty"`
	RequiredSNRDB        *float64 `json:"required_snr_db,omitempty"`
	ReceiverMarginDB     *float64 `json:"receiver_margin_db,omitempty"`
	Assumptions          []string `json:"assumptions"`
	Applicability        string   `json:"applicability"`
}

// ReceiverThresholdForProfile resolves one threshold. Callers in hot loops
// should resolve once per effective profile and pass the result through their
// link context.
func ReceiverThresholdForProfile(profile CellRFProfile) (ReceiverThreshold, error) {
	profile = profile.normalized()
	mode := profile.ReceiverSensitivityMode
	if mode == "" {
		mode = ReceiverSensitivityModeManual
	}
	switch mode {
	case ReceiverSensitivityModeManual:
		if !finiteInRange(profile.ReceiverSensitivityDBm, MinReceiverSensitivityDBm, MaxReceiverSensitivityDBm) {
			return ReceiverThreshold{}, fmt.Errorf("manual receiver sensitivity %.6g dBm is outside the supported range", profile.ReceiverSensitivityDBm)
		}
		return ReceiverThreshold{
			Mode:                 mode,
			SensitivityDBm:       profile.ReceiverSensitivityDBm,
			NoiseBandwidthSource: "not_applicable",
			Assumptions: []string{
				"receiver sensitivity is a direct configured threshold; no thermal-noise, noise-figure, SNR, or margin term is evaluated",
				"network interference is evaluated separately through RSRP, SINR, and RSRQ",
			},
			Applicability: "manual noise-limited receiver threshold for deterministic planning",
		}, nil
	case ReceiverSensitivityModeDerived:
		if !finiteInRange(profile.ReceiverNoiseBandwidthHz, MinReceiverNoiseBandwidthHz, MaxReceiverNoiseBandwidthHz) {
			return ReceiverThreshold{}, fmt.Errorf("derived receiver noise bandwidth %.6g Hz is outside the supported range", profile.ReceiverNoiseBandwidthHz)
		}
		if !finiteInRange(profile.ReceiverNoiseFigureDB, MinReceiverNoiseFigureDB, MaxReceiverNoiseFigureDB) {
			return ReceiverThreshold{}, fmt.Errorf("derived receiver noise figure %.6g dB is outside the supported range", profile.ReceiverNoiseFigureDB)
		}
		if !finiteInRange(profile.ReceiverRequiredSNRDB, MinReceiverRequiredSNRDB, MaxReceiverRequiredSNRDB) {
			return ReceiverThreshold{}, fmt.Errorf("derived required SNR %.6g dB is outside the supported range", profile.ReceiverRequiredSNRDB)
		}
		if !finiteInRange(profile.ReceiverMarginDB, MinReceiverMarginDB, MaxReceiverMarginDB) {
			return ReceiverThreshold{}, fmt.Errorf("derived receiver margin %.6g dB is outside the supported range", profile.ReceiverMarginDB)
		}
		source := profile.ReceiverNoiseBandwidthSource
		if source == "" {
			source = ReceiverNoiseBandwidthSourceExplicit
		}
		if !oneOf(source, ReceiverNoiseBandwidthSourceExplicit, ReceiverNoiseBandwidthSourceChannelBandwidth) {
			return ReceiverThreshold{}, fmt.Errorf("derived receiver noise bandwidth source %q is unsupported", source)
		}
		thermalNoise := ThermalNoiseDBm(profile.ReceiverNoiseBandwidthHz, 0, ReceiverReferenceTemperatureK)
		noiseFloor := ThermalNoiseDBm(profile.ReceiverNoiseBandwidthHz, profile.ReceiverNoiseFigureDB, ReceiverReferenceTemperatureK)
		sensitivity := noiseFloor + profile.ReceiverRequiredSNRDB + profile.ReceiverMarginDB
		if math.IsNaN(sensitivity) || math.IsInf(sensitivity, 0) {
			return ReceiverThreshold{}, fmt.Errorf("derived receiver sensitivity is not finite")
		}
		noiseDensity := ReceiverThermalNoiseDensityDBmPerHz
		bandwidth := profile.ReceiverNoiseBandwidthHz
		noiseFigure := profile.ReceiverNoiseFigureDB
		requiredSNR := profile.ReceiverRequiredSNRDB
		margin := profile.ReceiverMarginDB
		return ReceiverThreshold{
			Mode:                 mode,
			SensitivityDBm:       sensitivity,
			NoiseDensityDBmHz:    &noiseDensity,
			NoiseBandwidthHz:     &bandwidth,
			NoiseBandwidthSource: source,
			ThermalNoiseDBm:      &thermalNoise,
			NoiseFigureDB:        &noiseFigure,
			NoiseFloorDBm:        &noiseFloor,
			RequiredSNRDB:        &requiredSNR,
			ReceiverMarginDB:     &margin,
			Assumptions: []string{
				"thermal noise uses the rounded -174 dBm/Hz, 290 K reference convention",
				"receiver noise bandwidth is an independent noise-equivalent bandwidth in Hz; it is not the interference SCS/resource-element bandwidth",
				"network interference is excluded from sensitivity and is evaluated separately through RSRP, SINR, and RSRQ",
				"required SNR and receiver margin are explicit planning inputs, not throughput, coding, modulation, or 3GPP conformance terms",
			},
			Applicability: "derived noise-limited receiver threshold for deterministic planning; not a UE conformance sensitivity claim",
		}, nil
	default:
		return ReceiverThreshold{}, fmt.Errorf("receiver sensitivity mode %q must be manual or derived", mode)
	}
}

// ReceiverUsableSignal preserves the established strict boundary: equality
// with the effective sensitivity is not usable.
func ReceiverUsableSignal(receivedPowerDBm, sensitivityDBm float64) bool {
	return receivedPowerDBm > sensitivityDBm
}

func receiverLinkMarginDB(receivedPowerDBm float64, threshold ReceiverThreshold) float64 {
	return receivedPowerDBm - threshold.SensitivityDBm
}

func receiverThresholdForProfileOrManual(profile CellRFProfile) ReceiverThreshold {
	threshold, err := ReceiverThresholdForProfile(profile)
	if err == nil {
		return threshold
	}
	// This path is only for compatibility helpers called with an unvalidated
	// direct Go profile. API routes validate before evaluation.
	return ReceiverThreshold{
		Mode:                 ReceiverSensitivityModeManual,
		SensitivityDBm:       profile.ReceiverSensitivityDBm,
		NoiseBandwidthSource: "not_applicable",
		Assumptions:          []string{"unvalidated direct profile; receiver threshold retained as configured"},
		Applicability:        "compatibility fallback",
	}
}

func withReceiverThreshold(terms RFLinkBudgetTerms, profile CellRFProfile, threshold *ReceiverThreshold) RFLinkBudgetTerms {
	resolved := threshold
	if resolved == nil {
		value := receiverThresholdForProfileOrManual(profile)
		resolved = &value
	}
	terms.ReceiverSensitivityMode = resolved.Mode
	terms.EffectiveReceiverSensitivityDBm = resolved.SensitivityDBm
	terms.ReceiverLinkMarginDB = receiverLinkMarginDB(terms.ReceivedPowerDBm, *resolved)
	return terms
}
