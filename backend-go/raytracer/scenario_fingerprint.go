package raytracer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
)

const ScenarioFingerprintSchemaVersion = "atom-scenario-v1"

// InterferenceScenarioFingerprint returns a stable identity for all
// RF-affecting interference inputs and policy semantics. It intentionally
// excludes timestamps, runtime paths, worker counts, and presentation state.
func InterferenceScenarioFingerprint(req InterferenceRequest) string {
	normalized := req
	NormalizeInterferenceRequest(&normalized)
	cells := make([]InterferenceTowerRequest, len(normalized.Towers))
	copy(cells, normalized.Towers)
	sort.SliceStable(cells, func(i, j int) bool { return cells[i].ID < cells[j].ID })
	identity := struct {
		SchemaVersion       string                     `json:"schema_version"`
		ContractVersion     string                     `json:"radio_quality_contract_version"`
		NetworkTech         string                     `json:"network_tech"`
		ServingCellID       string                     `json:"serving_cell_id,omitempty"`
		Towers              []InterferenceTowerRequest `json:"towers"`
		RadiusMeters        float64                    `json:"radius_m"`
		FrequencyGHz        float64                    `json:"frequency_ghz"`
		TxPowerDBm          float64                    `json:"tx_power_dbm"`
		BeamWidthDeg        float64                    `json:"beam_width"`
		BandwidthMHz        float64                    `json:"bandwidth_mhz"`
		LoadFactor          float64                    `json:"load_factor"`
		ReuseFactor         int                        `json:"reuse_factor"`
		NoiseFigureDB       float64                    `json:"noise_figure_db"`
		SampleSpacingM      float64                    `json:"sample_spacing_m"`
		CalibrationOffsetDB float64                    `json:"calibration_offset_db"`
		RSRPThresholdDBm    float64                    `json:"rsrp_threshold_dbm"`
		SINRThresholdDB     float64                    `json:"sinr_threshold_db"`
		RSRQThresholdDB     float64                    `json:"rsrq_threshold_db"`
		CoChannelRule       string                     `json:"co_channel_rule"`
		AdjacentModel       string                     `json:"adjacent_channel_model"`
		PartialOverlapModel string                     `json:"partial_overlap_model"`
		ServingAdmission    string                     `json:"serving_admission_rule"`
		HorizonSource       string                     `json:"interference_horizon_source"`
		HorizonSemantics    string                     `json:"interference_horizon_semantics"`
	}{
		SchemaVersion:       ScenarioFingerprintSchemaVersion,
		ContractVersion:     RadioQualityContractVersion,
		NetworkTech:         normalized.NetworkTech,
		ServingCellID:       normalized.ServingCellID,
		Towers:              cells,
		RadiusMeters:        normalized.RadiusMeters,
		FrequencyGHz:        normalized.FrequencyGHz,
		TxPowerDBm:          normalized.TxPowerDBm,
		BeamWidthDeg:        normalized.BeamWidthDeg,
		BandwidthMHz:        normalized.BandwidthMHz,
		LoadFactor:          normalized.LoadFactor,
		ReuseFactor:         normalized.ReuseFactor,
		NoiseFigureDB:       normalized.NoiseFigureDB,
		SampleSpacingM:      normalized.SampleSpacingM,
		CalibrationOffsetDB: normalized.CalibrationOffsetDB,
		RSRPThresholdDBm:    InterferenceRSRPThresholdDBm,
		SINRThresholdDB:     InterferenceSINRThresholdDB,
		RSRQThresholdDB:     InterferenceRSRQThresholdDB,
		CoChannelRule:       RadioQualityCoChannelRule,
		AdjacentModel:       RadioQualityAdjacentChannelModel,
		PartialOverlapModel: RadioQualityPartialOverlapModel,
		ServingAdmission:    RadioQualityServingAdmissionRule,
		HorizonSource:       RadioQualityInterferenceHorizonSource,
		HorizonSemantics:    RadioQualityInterferenceHorizonSemantics,
	}
	return fingerprintJSON("interference", identity)
}

// NetworkScenarioFingerprint captures the canonical optimizer scenario,
// including priorities and hard constraints, without coupling interference
// diagnostics into optimization math.
func NetworkScenarioFingerprint(req NetworkOptimizationRequest) string {
	normalized := req
	NormalizeNetworkOptimizationRequest(&normalized)
	towers := make([]NetworkTowerRequest, len(normalized.Towers))
	copy(towers, normalized.Towers)
	sort.SliceStable(towers, func(i, j int) bool { return towers[i].ID < towers[j].ID })
	objectives := append([]OptimizationObjective(nil), normalized.Optimization.Objectives...)
	sort.SliceStable(objectives, func(i, j int) bool {
		if objectives[i].ID == objectives[j].ID {
			return objectives[i].Weight < objectives[j].Weight
		}
		return objectives[i].ID < objectives[j].ID
	})
	identity := struct {
		SchemaVersion       string                  `json:"schema_version"`
		Towers              []NetworkTowerRequest   `json:"towers"`
		Rays                int                     `json:"rays"`
		RadiusMeters        float64                 `json:"radius_m"`
		FrequencyGHz        float64                 `json:"frequency_ghz"`
		TxPowerDBm          float64                 `json:"tx_power_dbm"`
		BeamWidthDeg        float64                 `json:"beam_width"`
		CalibrationOffsetDB float64                 `json:"calibration_offset_db"`
		RFProfile           CellRFProfile           `json:"rf_profile"`
		Objectives          []OptimizationObjective `json:"objectives"`
		Constraints         OptimizationConstraints `json:"constraints"`
	}{
		SchemaVersion:       ScenarioFingerprintSchemaVersion,
		Towers:              towers,
		Rays:                normalized.Rays,
		RadiusMeters:        normalized.RadiusMeters,
		FrequencyGHz:        normalized.FrequencyGHz,
		TxPowerDBm:          normalized.TxPowerDBm,
		BeamWidthDeg:        normalized.BeamWidthDeg,
		CalibrationOffsetDB: normalized.CalibrationOffsetDB,
		RFProfile:           normalized.RFProfile,
		Objectives:          objectives,
		Constraints:         normalized.Optimization.Constraints,
	}
	return fingerprintJSON("network", identity)
}

func fingerprintJSON(prefix string, value any) string {
	serialized, err := json.Marshal(value)
	if err != nil {
		return prefix + "-unknown"
	}
	digest := sha256.Sum256(serialized)
	return prefix + "-" + hex.EncodeToString(digest[:16])
}
