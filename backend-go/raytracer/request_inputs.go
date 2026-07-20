package raytracer

import (
	"fmt"
	"strings"
)

const MaxTowerIDBytes = 128

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

type NetworkTowerRequestInput struct {
	ID         string   `json:"id"`
	TowerLon   *float64 `json:"tower_lon"`
	TowerLat   *float64 `json:"tower_lat"`
	AzimuthDeg *float64 `json:"azimuth"`
}

type NetworkOptimizationRequestInput struct {
	Towers              []NetworkTowerRequestInput `json:"towers"`
	Rays                *int                       `json:"rays"`
	RadiusMeters        *float64                   `json:"radius_m"`
	FrequencyGHz        *float64                   `json:"frequency_ghz"`
	TxPowerDBm          *float64                   `json:"tx_power_dbm"`
	BeamWidthDeg        *float64                   `json:"beam_width"`
	CalibrationOffsetDB *float64                   `json:"calibration_offset_db"`
}

type InterferenceTowerRequestInput struct {
	ID         string   `json:"id"`
	TowerLon   *float64 `json:"tower_lon"`
	TowerLat   *float64 `json:"tower_lat"`
	AzimuthDeg *float64 `json:"azimuth"`
}

type InterferenceRequestInput struct {
	NetworkTech         string                          `json:"network_tech"`
	Towers              []InterferenceTowerRequestInput `json:"towers"`
	RadiusMeters        *float64                        `json:"radius_m"`
	FrequencyGHz        *float64                        `json:"frequency_ghz"`
	TxPowerDBm          *float64                        `json:"tx_power_dbm"`
	BeamWidthDeg        *float64                        `json:"beam_width"`
	BandwidthMHz        *float64                        `json:"bandwidth_mhz"`
	LoadFactor          *float64                        `json:"load_factor"`
	ReuseFactor         *int                            `json:"reuse_factor"`
	NoiseFigureDB       *float64                        `json:"noise_figure_db"`
	SampleSpacingM      *float64                        `json:"sample_spacing_m"`
	CalibrationOffsetDB *float64                        `json:"calibration_offset_db"`
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
		Rays:                valueOr(input.Rays, 60),
		RadiusMeters:        valueOr(input.RadiusMeters, 400),
		FrequencyGHz:        valueOr(input.FrequencyGHz, 28),
		TxPowerDBm:          valueOr(input.TxPowerDBm, 30),
		AzimuthDeg:          normalizeDegrees(valueOr(input.AzimuthDeg, 0)),
		BeamWidthDeg:        valueOr(input.BeamWidthDeg, 120),
		CalibrationOffsetDB: valueOr(input.CalibrationOffsetDB, 0),
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
		Rays:                valueOr(input.Rays, 72),
		RadiusMeters:        valueOr(input.RadiusMeters, 400),
		FrequencyGHz:        valueOr(input.FrequencyGHz, 28),
		TxPowerDBm:          valueOr(input.TxPowerDBm, 30),
		BeamWidthDeg:        valueOr(input.BeamWidthDeg, 120),
		CalibrationOffsetDB: valueOr(input.CalibrationOffsetDB, 0),
	}
}

func (input InterferenceRequestInput) ToRequest() InterferenceRequest {
	networkTech := strings.ToLower(strings.TrimSpace(input.NetworkTech))
	frequencyGHz := valueOr(input.FrequencyGHz, 0)
	if networkTech == "" {
		switch {
		case input.FrequencyGHz == nil:
			networkTech = "5g"
		case frequencyGHz < 10:
			networkTech = "4g"
		case frequencyGHz < 100:
			networkTech = "5g"
		default:
			networkTech = "6g"
		}
	}
	if input.FrequencyGHz == nil {
		if networkTech == "4g" {
			frequencyGHz = 2.6
		} else {
			frequencyGHz = 28
		}
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
		RadiusMeters:        valueOr(input.RadiusMeters, 400),
		FrequencyGHz:        frequencyGHz,
		TxPowerDBm:          valueOr(input.TxPowerDBm, 30),
		BeamWidthDeg:        valueOr(input.BeamWidthDeg, 120),
		BandwidthMHz:        valueOr(input.BandwidthMHz, defaultBandwidth),
		LoadFactor:          valueOr(input.LoadFactor, DefaultInterferenceLoadFactor),
		ReuseFactor:         valueOr(input.ReuseFactor, 1),
		NoiseFigureDB:       valueOr(input.NoiseFigureDB, DefaultInterferenceNoiseFigure),
		SampleSpacingM:      valueOr(input.SampleSpacingM, DefaultInterferenceSpacingM),
		CalibrationOffsetDB: valueOr(input.CalibrationOffsetDB, 0),
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
