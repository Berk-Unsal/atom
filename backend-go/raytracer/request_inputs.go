package raytracer

import (
	"fmt"
	"strings"
)

type StaticSimulationRequestInput struct {
	TowerLon            *float64 `json:"tower_lon"`
	TowerLat            *float64 `json:"tower_lat"`
	Rays                *int     `json:"rays"`
	RadiusMeters        *float64 `json:"radius_m"`
	FrequencyGHz        *float64 `json:"frequency_ghz"`
	TxPowerDBm          *float64 `json:"tx_power_dbm"`
	AzimuthDeg          *float64 `json:"azimuth"`
	BeamWidthDeg        *float64 `json:"beam_width"`
	CalibrationOffsetDB *float64 `json:"calibration_offset_db"`
}

type TowerRequestInput struct {
	ID         string   `json:"id"`
	TowerLon   *float64 `json:"tower_lon"`
	TowerLat   *float64 `json:"tower_lat"`
	AzimuthDeg *float64 `json:"azimuth"`
}

type NetworkOptimizationRequestInput struct {
	Towers              []TowerRequestInput `json:"towers"`
	Rays                *int                `json:"rays"`
	RadiusMeters        *float64            `json:"radius_m"`
	FrequencyGHz        *float64            `json:"frequency_ghz"`
	TxPowerDBm          *float64            `json:"tx_power_dbm"`
	BeamWidthDeg        *float64            `json:"beam_width"`
	CalibrationOffsetDB *float64            `json:"calibration_offset_db"`
}

type InterferenceRequestInput struct {
	NetworkTech         string              `json:"network_tech"`
	Towers              []TowerRequestInput `json:"towers"`
	RadiusMeters        *float64            `json:"radius_m"`
	FrequencyGHz        *float64            `json:"frequency_ghz"`
	TxPowerDBm          *float64            `json:"tx_power_dbm"`
	BeamWidthDeg        *float64            `json:"beam_width"`
	BandwidthMHz        *float64            `json:"bandwidth_mhz"`
	LoadFactor          *float64            `json:"load_factor"`
	ReuseFactor         *int                `json:"reuse_factor"`
	NoiseFigureDB       *float64            `json:"noise_figure_db"`
	SampleSpacingM      *float64            `json:"sample_spacing_m"`
	CalibrationOffsetDB *float64            `json:"calibration_offset_db"`
}

func ValidateTowerID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return "each tower must include a non-empty id"
	}
	if len(id) > MaxTowerIDBytes {
		return fmt.Sprintf("each tower id must be at most %d bytes", MaxTowerIDBytes)
	}
	return ""
}

func (input StaticSimulationRequestInput) ToRequest() StaticSimulationRequest {
	return StaticSimulationRequest{
		TowerLon:            valueOr(input.TowerLon, 0),
		TowerLat:            valueOr(input.TowerLat, 0),
		Rays:                valueOr(input.Rays, DefaultStaticSimulationRays),
		RadiusMeters:        valueOr(input.RadiusMeters, DefaultRadiusMeters),
		FrequencyGHz:        valueOr(input.FrequencyGHz, DefaultFrequencyGHz),
		TxPowerDBm:          valueOr(input.TxPowerDBm, DefaultTxPowerDBm),
		AzimuthDeg:          normalizeDegrees(valueOr(input.AzimuthDeg, 0)),
		BeamWidthDeg:        valueOr(input.BeamWidthDeg, DefaultBeamWidthDeg),
		CalibrationOffsetDB: valueOr(input.CalibrationOffsetDB, DefaultCalibrationOffsetDB),
	}
}

func (input NetworkOptimizationRequestInput) ToRequest() NetworkOptimizationRequest {
	towers := make([]NetworkTowerRequest, 0, len(input.Towers))
	for _, tower := range input.Towers {
		towers = append(towers, NetworkTowerRequest{
			ID:         strings.TrimSpace(tower.ID),
			TowerLon:   valueOr(tower.TowerLon, 0),
			TowerLat:   valueOr(tower.TowerLat, 0),
			AzimuthDeg: normalizeDegrees(valueOr(tower.AzimuthDeg, 0)),
		})
	}
	return NetworkOptimizationRequest{
		Towers:              towers,
		Rays:                valueOr(input.Rays, DefaultNetworkOptimizationRays),
		RadiusMeters:        valueOr(input.RadiusMeters, DefaultRadiusMeters),
		FrequencyGHz:        valueOr(input.FrequencyGHz, DefaultFrequencyGHz),
		TxPowerDBm:          valueOr(input.TxPowerDBm, DefaultTxPowerDBm),
		BeamWidthDeg:        valueOr(input.BeamWidthDeg, DefaultBeamWidthDeg),
		CalibrationOffsetDB: valueOr(input.CalibrationOffsetDB, DefaultCalibrationOffsetDB),
	}
}

func (input InterferenceRequestInput) ToRequest() InterferenceRequest {
	networkTech := strings.ToLower(strings.TrimSpace(input.NetworkTech))
	frequencyGHz := valueOr(input.FrequencyGHz, 0)
	if networkTech == "" {
		if input.FrequencyGHz == nil {
			networkTech = NetworkTechnologyForFrequency(DefaultFrequencyGHz)
		} else {
			networkTech = NetworkTechnologyForFrequency(frequencyGHz)
		}
	}
	if input.FrequencyGHz == nil {
		frequencyGHz = DefaultFrequencyForTechnology(networkTech)
	}
	defaultBandwidth := DefaultInterferenceBandwidthNR
	if networkTech == "4g" {
		defaultBandwidth = DefaultInterferenceBandwidthLTE
	}
	towers := make([]InterferenceTowerRequest, 0, len(input.Towers))
	for _, tower := range input.Towers {
		towers = append(towers, InterferenceTowerRequest{
			ID:         strings.TrimSpace(tower.ID),
			TowerLon:   valueOr(tower.TowerLon, 0),
			TowerLat:   valueOr(tower.TowerLat, 0),
			AzimuthDeg: normalizeDegrees(valueOr(tower.AzimuthDeg, 0)),
		})
	}
	return InterferenceRequest{
		NetworkTech:         networkTech,
		Towers:              towers,
		RadiusMeters:        valueOr(input.RadiusMeters, DefaultRadiusMeters),
		FrequencyGHz:        frequencyGHz,
		TxPowerDBm:          valueOr(input.TxPowerDBm, DefaultTxPowerDBm),
		BeamWidthDeg:        valueOr(input.BeamWidthDeg, DefaultBeamWidthDeg),
		BandwidthMHz:        valueOr(input.BandwidthMHz, defaultBandwidth),
		LoadFactor:          valueOr(input.LoadFactor, DefaultInterferenceLoadFactor),
		ReuseFactor:         valueOr(input.ReuseFactor, DefaultInterferenceReuseFactor),
		NoiseFigureDB:       valueOr(input.NoiseFigureDB, DefaultInterferenceNoiseFigure),
		SampleSpacingM:      valueOr(input.SampleSpacingM, DefaultInterferenceSpacingM),
		CalibrationOffsetDB: valueOr(input.CalibrationOffsetDB, DefaultCalibrationOffsetDB),
	}
}

func (input StaticSimulationRequestInput) MissingRequiredCoordinates() bool {
	return input.TowerLon == nil || input.TowerLat == nil
}

func (input NetworkOptimizationRequestInput) MissingRequiredTowerFields() bool {
	for _, tower := range input.Towers {
		if strings.TrimSpace(tower.ID) == "" || tower.TowerLon == nil || tower.TowerLat == nil {
			return true
		}
	}
	return false
}

func (input InterferenceRequestInput) MissingRequiredTowerFields() bool {
	for _, tower := range input.Towers {
		if strings.TrimSpace(tower.ID) == "" || tower.TowerLon == nil || tower.TowerLat == nil {
			return true
		}
	}
	return false
}

func valueOr[T any](value *T, fallback T) T {
	if value == nil {
		return fallback
	}
	return *value
}
