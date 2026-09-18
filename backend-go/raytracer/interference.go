package raytracer

import (
	"context"
	"fmt"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
)

const (
	MaxInterferenceSamples        = 3000
	MaxInterferenceDemandFeatures = 500
)

type InterferenceTowerRequest struct {
	ID         string        `json:"id"`
	TowerLon   float64       `json:"tower_lon"`
	TowerLat   float64       `json:"tower_lat"`
	AzimuthDeg float64       `json:"azimuth"`
	RFProfile  CellRFProfile `json:"rf_profile"`
}

type InterferenceRequest struct {
	NetworkTech         string                     `json:"network_tech"`
	Towers              []InterferenceTowerRequest `json:"towers"`
	ServingCellID       string                     `json:"serving_cell_id,omitempty"`
	RadiusMeters        float64                    `json:"radius_m"`
	FrequencyGHz        float64                    `json:"frequency_ghz"`
	TxPowerDBm          float64                    `json:"tx_power_dbm"`
	BeamWidthDeg        float64                    `json:"beam_width"`
	BandwidthMHz        float64                    `json:"bandwidth_mhz"`
	LoadFactor          float64                    `json:"load_factor"`
	ReuseFactor         int                        `json:"reuse_factor"`
	NoiseFigureDB       float64                    `json:"noise_figure_db"`
	SampleSpacingM      float64                    `json:"sample_spacing_m"`
	CalibrationOffsetDB float64                    `json:"calibration_offset_db,omitempty"`
	RFProfile           CellRFProfile              `json:"rf_profile"`
	receiverThresholds  []ReceiverThreshold
}

type InterferenceResponse struct {
	GeoJSON       InterferenceFeatureCollection `json:"geojson"`
	DemandGeoJSON InterferenceFeatureCollection `json:"demand_geojson"`
	Stats         InterferenceStats             `json:"stats"`
	Model         InterferenceModel             `json:"model"`
}

type InterferenceFeatureCollection struct {
	Type     string                `json:"type"`
	Features []InterferenceFeature `json:"features"`
}

type InterferenceFeature struct {
	Type       string                 `json:"type"`
	Properties InterferenceProperties `json:"properties"`
	Geometry   PointGeometry          `json:"geometry"`
}

type InterferenceProperties struct {
	SampleID                       string                         `json:"sample_id"`
	ServingCellID                  string                         `json:"serving_cell_id,omitempty"`
	ChannelID                      string                         `json:"channel_id,omitempty"`
	ServingReceivedCarrierPowerDBm *float64                       `json:"serving_received_carrier_power_dbm,omitempty"`
	DesiredSignalPowerMW           *float64                       `json:"desired_signal_power_mw,omitempty"`
	InterferencePowerMW            *float64                       `json:"interference_power_mw,omitempty"`
	ThermalNoisePowerMW            *float64                       `json:"thermal_noise_power_mw,omitempty"`
	ThermalNoiseDBm                *float64                       `json:"thermal_noise_dbm,omitempty"`
	InterferenceNoiseBandwidthHz   float64                        `json:"interference_noise_bandwidth_hz,omitempty"`
	NoiseBandwidthSource           string                         `json:"noise_bandwidth_source,omitempty"`
	RSRPDBm                        *float64                       `json:"rsrp_dbm"`
	SINRDB                         *float64                       `json:"sinr_db"`
	RSRQDB                         *float64                       `json:"rsrq_db"`
	RSSIDBm                        *float64                       `json:"rssi_dbm"`
	InterferenceDBm                *float64                       `json:"interference_dbm"`
	QualityClass                   string                         `json:"quality_class"`
	Serviceable                    bool                           `json:"serviceable"`
	InterferenceLimited            bool                           `json:"interference_limited"`
	WallCount                      int                            `json:"wall_count"`
	LOSState                       string                         `json:"los_state,omitempty"`
	LOSClassifierID                string                         `json:"los_classifier_id,omitempty"`
	LOSClassificationBasis         string                         `json:"los_classification_basis,omitempty"`
	TerrainStatus                  string                         `json:"terrain_status,omitempty"`
	LOSClassification              *LOSClassification             `json:"los_classification,omitempty"`
	StrongestInterfererID          string                         `json:"strongest_interferer_id,omitempty"`
	StrongestInterfererDBm         *float64                       `json:"strongest_interferer_dbm,omitempty"`
	ContributingCells              int                            `json:"contributing_cells"`
	InterfererCount                int                            `json:"interferer_count"`
	ServingSelectionMode           string                         `json:"serving_selection_mode,omitempty"`
	ServingSelectionMetric         string                         `json:"serving_selection_metric,omitempty"`
	RSRPKind                       string                         `json:"rsrp_kind,omitempty"`
	RSRPConversionID               string                         `json:"rsrp_conversion_id,omitempty"`
	RSRPConversionDescription      string                         `json:"rsrp_conversion_description,omitempty"`
	ServiceabilityStatus           string                         `json:"serviceability_status,omitempty"`
	ServiceabilityFailures         []string                       `json:"serviceability_failures,omitempty"`
	PowerLedger                    []RadioQualityPowerLedgerEntry `json:"power_ledger,omitempty"`
	LinkBudget                     *RFLinkBudgetTerms             `json:"link_budget,omitempty"`
	ReceiverThreshold              *ReceiverThreshold             `json:"receiver_threshold,omitempty"`
	ReceiverLinkMarginDB           *float64                       `json:"receiver_link_margin_db,omitempty"`
	BuildingID                     string                         `json:"building_id,omitempty"`
	DemandWeight                   float64                        `json:"demand_weight,omitempty"`
	ResidentialDemand              float64                        `json:"residential_demand,omitempty"`
	TotalDemand                    float64                        `json:"total_demand,omitempty"`
	Reason                         string                         `json:"reason,omitempty"`
}

type InterferenceStats struct {
	SampleCount              int                       `json:"sample_count"`
	SignalSamples            int                       `json:"signal_samples"`
	ValidSampleCount         int                       `json:"valid_sample_count"`
	NoSignalCount            int                       `json:"no_signal_count"`
	ServiceableSamples       int                       `json:"serviceable_samples"`
	ServiceablePct           float64                   `json:"serviceable_pct"`
	InterferenceLimitedCount int                       `json:"interference_limited_count"`
	InterferenceLimitedPct   float64                   `json:"interference_limited_pct"`
	AvgSINRDB                *float64                  `json:"avg_sinr_db"`
	P10SINRDB                *float64                  `json:"p10_sinr_db"`
	MedianSINRDB             *float64                  `json:"median_sinr_db"`
	AvgRSRPDBm               *float64                  `json:"avg_rsrp_dbm"`
	P10RSRPDBm               *float64                  `json:"p10_rsrp_dbm"`
	AvgRSRQDB                *float64                  `json:"avg_rsrq_db"`
	P10RSRQDB                *float64                  `json:"p10_rsrq_db"`
	DemandCandidates         int                       `json:"demand_candidates"`
	AffectedDemandBuildings  int                       `json:"affected_demand_buildings"`
	AffectedDemand           float64                   `json:"affected_demand"`
	ServiceableFraction      *float64                  `json:"serviceable_fraction"`
	OutageByReason           map[string]int            `json:"outage_by_reason"`
	PerServingCell           []InterferenceCellSummary `json:"per_serving_cell"`
}

type InterferenceCellSummary struct {
	CellID             string  `json:"cell_id"`
	ChannelID          string  `json:"channel_id"`
	ServingSamples     int     `json:"serving_samples"`
	ServiceableSamples int     `json:"serviceable_samples"`
	AvgSINRDB          float64 `json:"avg_sinr_db"`
	AvgRSRPDBm         float64 `json:"avg_rsrp_dbm"`
	AvgRSRQDB          float64 `json:"avg_rsrq_db"`
}

type InterferenceModel struct {
	Type                         string                   `json:"type"`
	NetworkTech                  string                   `json:"network_tech"`
	MeasurementFamily            string                   `json:"measurement_family"`
	FrequencyGHz                 float64                  `json:"frequency_ghz"`
	BandwidthMHz                 float64                  `json:"bandwidth_mhz"`
	SubcarrierSpacingKHz         float64                  `json:"subcarrier_spacing_khz"`
	ResourceBlocks               int                      `json:"resource_blocks"`
	NoiseFigureDB                float64                  `json:"noise_figure_db"`
	LoadFactor                   float64                  `json:"load_factor"`
	ReuseFactor                  int                      `json:"reuse_factor"`
	RequestedSampleSpacingM      float64                  `json:"requested_sample_spacing_m"`
	EffectiveSampleSpacingM      float64                  `json:"effective_sample_spacing_m"`
	Assumptions                  []string                 `json:"assumptions"`
	HeterogeneousProfiles        bool                     `json:"heterogeneous_profiles"`
	Profiles                     []CellRFProfile          `json:"profiles"`
	RequestDefaults              RFRequestDefaults        `json:"request_defaults"`
	EffectiveCellProfiles        []EffectiveCellRFProfile `json:"effective_cell_profiles"`
	InterferenceHorizonMeters    []float64                `json:"interference_horizon_meters"`
	InterferenceHorizonSource    string                   `json:"interference_horizon_source"`
	InterferenceHorizonSemantics string                   `json:"interference_horizon_semantics"`
	RFContract                   RFContractMetadata       `json:"rf_contract"`
	RSRPThresholdDBm             float64                  `json:"rsrp_threshold_dbm"`
	SINRThresholdDB              float64                  `json:"sinr_threshold_db"`
	RSRQThresholdDB              float64                  `json:"rsrq_threshold_db"`
	ServiceabilityRule           string                   `json:"serviceability_rule"`
	ReceiverThresholdRule        string                   `json:"receiver_threshold_rule"`
	ReceiverNoiseSemantics       string                   `json:"receiver_noise_semantics"`
	ServingSelectionMode         string                   `json:"serving_selection_mode"`
	ServingSelectionMetric       string                   `json:"serving_selection_metric"`
	CoChannelEligibilityRule     string                   `json:"co_channel_eligibility_rule"`
	CarrierPowerSemantics        string                   `json:"carrier_power_semantics"`
	ResourceBasis                string                   `json:"resource_basis"`
	ResourceElementsPerRB        int                      `json:"resource_elements_per_rb"`
	InterferenceNoiseBandwidthHz float64                  `json:"interference_noise_bandwidth_hz"`
	NoiseBandwidthSource         string                   `json:"noise_bandwidth_source"`
	RSRPKind                     string                   `json:"rsrp_kind"`
	RSRPConversionID             string                   `json:"rsrp_conversion_id"`
	RSRPConversionDescription    string                   `json:"rsrp_conversion_description"`
	RSSIRSRQSemantics            string                   `json:"rssi_rsrq_semantics"`
	LoadAssumption               string                   `json:"load_assumption"`
	AdjacentChannelModel         string                   `json:"adjacent_channel_model"`
	PartialOverlapModel          string                   `json:"partial_overlap_model"`
	OptimizationCoupling         string                   `json:"optimization_coupling"`
	ServiceabilityPolicyID       string                   `json:"serviceability_policy_id"`
	ThresholdProvenance          string                   `json:"threshold_provenance"`
	RadioQualityReferences       []RadioQualityReference  `json:"radio_quality_references"`
	ScenarioFingerprint          string                   `json:"scenario_fingerprint"`
	ScenarioSchemaVersion        string                   `json:"scenario_schema_version"`
}

type interferencePreset struct {
	measurementFamily string
	scsKHz            float64
	resourceBlocks    int
}

type receivedCellSignal struct {
	cellID              string
	networkTech         string
	channelID           string
	frequencyGHz        float64
	bandwidthMHz        float64
	receivedCarrierDBm  float64
	rsrpDBm             float64
	wallCount           int
	losState            string
	classifierID        string
	classificationBasis string
	terrainStatus       string
	losClassification   *LOSClassification
	loadFactor          float64
	preset              interferencePreset
	linkBudget          RFLinkBudgetTerms
	receiverThreshold   ReceiverThreshold
	servingEligible     bool
}

type gridSample struct {
	point Point
	row   int
	col   int
}

type cellAccumulator struct {
	channelID      string
	servingSamples int
	serviceable    int
	sinrTotal      float64
	rsrpTotal      float64
	rsrqTotal      float64
}

func NormalizeInterferenceRequest(req *InterferenceRequest) {
	req.NetworkTech = strings.ToLower(strings.TrimSpace(req.NetworkTech))
	if req.NetworkTech == "" {
		req.NetworkTech = NetworkTechnologyForFrequency(req.FrequencyGHz)
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = DefaultRadiusMeters
	}
	if req.FrequencyGHz == 0 {
		if req.NetworkTech == "4g" {
			req.FrequencyGHz = DefaultFrequencyForTechnology("4g")
		} else {
			req.FrequencyGHz = DefaultFrequencyForTechnology("5g")
		}
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = DefaultTxPowerDBm
	}
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = DefaultBeamWidthDeg
	}
	if req.BandwidthMHz == 0 {
		if req.NetworkTech == "4g" {
			req.BandwidthMHz = DefaultInterferenceBandwidthLTE
		} else {
			req.BandwidthMHz = DefaultInterferenceBandwidthNR
		}
	}
	if req.LoadFactor == 0 {
		req.LoadFactor = DefaultInterferenceLoadFactor
	}
	if req.ReuseFactor == 0 {
		req.ReuseFactor = DefaultInterferenceReuseFactor
	}
	if req.SampleSpacingM == 0 {
		req.SampleSpacingM = DefaultInterferenceSpacingM
	}
	if req.RFProfile.SchemaVersion == 0 {
		req.RFProfile = DefaultCellRFProfile(req.NetworkTech, req.FrequencyGHz, req.TxPowerDBm, req.RadiusMeters, req.BeamWidthDeg, req.BandwidthMHz, req.LoadFactor, req.ReuseFactor)
	}
	for index := range req.Towers {
		req.Towers[index].ID = strings.TrimSpace(req.Towers[index].ID)
		req.Towers[index].AzimuthDeg = normalizeDegrees(req.Towers[index].AzimuthDeg)
		if req.Towers[index].RFProfile.SchemaVersion == 0 {
			req.Towers[index].RFProfile = req.RFProfile
			req.Towers[index].RFProfile.ChannelID = fmt.Sprintf("CH-%d", index%req.ReuseFactor+1)
		} else {
			req.Towers[index].RFProfile = req.Towers[index].RFProfile.normalized()
		}
	}
	req.receiverThresholds = make([]ReceiverThreshold, len(req.Towers))
	for index, tower := range req.Towers {
		profile := effectiveInterferenceTowerProfile(*req, tower, index)
		if threshold, err := ReceiverThresholdForProfile(profile); err == nil {
			req.receiverThresholds[index] = threshold
		}
	}
}

func receiverThresholdForInterferenceTower(req InterferenceRequest, tower InterferenceTowerRequest, index int) ReceiverThreshold {
	if index >= 0 && index < len(req.receiverThresholds) && req.receiverThresholds[index].Mode != "" {
		return req.receiverThresholds[index]
	}
	return receiverThresholdForProfileOrManual(effectiveInterferenceTowerProfile(req, tower, index))
}

func effectiveInterferenceTowerProfile(req InterferenceRequest, tower InterferenceTowerRequest, index int) CellRFProfile {
	if tower.RFProfile.SchemaVersion != 0 {
		return tower.RFProfile.normalized()
	}
	profile := req.RFProfile
	if profile.SchemaVersion == 0 {
		profile = DefaultCellRFProfile(req.NetworkTech, req.FrequencyGHz, req.TxPowerDBm, req.RadiusMeters, req.BeamWidthDeg, req.BandwidthMHz, req.LoadFactor, req.ReuseFactor)
	}
	reuseFactor := profile.ReuseFactor
	if reuseFactor < 1 {
		reuseFactor = 1
	}
	profile.ChannelID = fmt.Sprintf("CH-%d", index%reuseFactor+1)
	return profile
}

// interferenceHorizonMeters returns the per-cell finite analysis horizons
// actually used by point and demand evaluation. The values are aligned with
// effective_cell_profiles and deliberately remain separate from receiver
// sensitivity admission.
func interferenceHorizonMeters(req InterferenceRequest) []float64 {
	horizons := make([]float64, 0, len(req.Towers))
	for index, tower := range req.Towers {
		horizons = append(horizons, effectiveInterferenceTowerProfile(req, tower, index).RadiusMeters)
	}
	return horizons
}

func ValidateInterferenceRequest(req InterferenceRequest) string {
	if !IsAnalysisTechnology(req.NetworkTech) {
		return "network_tech must be 4g or 5g; 6g interference KPIs are not applicable"
	}
	if len(req.Towers) < MinNetworkTowers || len(req.Towers) > MaxNetworkTowers {
		return "towers must contain between 2 and 6 selected cells"
	}
	seen := make(map[string]bool, len(req.Towers))
	for _, tower := range req.Towers {
		if validationError := ValidateTowerID(tower.ID); validationError != "" {
			return validationError
		}
		if seen[tower.ID] {
			return "tower ids must be unique"
		}
		seen[tower.ID] = true
		if tower.TowerLon < MinLongitude || tower.TowerLon > MaxLongitude || tower.TowerLat < MinLatitude || tower.TowerLat > MaxLatitude {
			return "each tower must include valid tower_lon and tower_lat coordinates"
		}
		if validationError := ValidateCellRFProfile(tower.RFProfile, true); validationError != "" {
			return fmt.Sprintf("tower %q: %s", tower.ID, validationError)
		}
		if _, err := interferencePresetFor(tower.RFProfile.NetworkTech, tower.RFProfile.BandwidthMHz); err != nil {
			return fmt.Sprintf("tower %q: rf_profile.%s", tower.ID, err.Error())
		}
	}
	if req.RadiusMeters < MinRadiusMeters || req.RadiusMeters > MaxRadiusMeters {
		return "radius_m must be between 25 and 5000"
	}
	if req.FrequencyGHz <= 0 || req.FrequencyGHz >= NRFrequencyMaxGHz {
		return "frequency_ghz must be between 0 and 100 for interference analysis"
	}
	if req.NetworkTech == "4g" && !FrequencyMatchesTechnology(req.NetworkTech, req.FrequencyGHz) {
		return "4g interference analysis requires frequency_ghz below 10"
	}
	if req.NetworkTech == "5g" && !FrequencyMatchesTechnology(req.NetworkTech, req.FrequencyGHz) {
		return "5g interference analysis requires frequency_ghz from 10 up to 100"
	}
	if req.TxPowerDBm < MinTxPowerDBm || req.TxPowerDBm > MaxTxPowerDBm {
		return "tx_power_dbm must be between 0 and 60"
	}
	if req.BeamWidthDeg < MinBeamWidthDeg || req.BeamWidthDeg > MaxBeamWidthDeg {
		return "beam_width must be between 10 and 360"
	}
	if _, err := interferencePresetFor(req.NetworkTech, req.BandwidthMHz); err != nil {
		return err.Error()
	}
	if req.LoadFactor <= MinInterferenceLoadFactorExclusive || req.LoadFactor > MaxInterferenceLoadFactor {
		return "load_factor must be greater than 0 and no more than 1"
	}
	if req.ReuseFactor != 1 && req.ReuseFactor != 3 {
		return "reuse_factor must be 1 or 3"
	}
	if req.NoiseFigureDB < MinNoiseFigureDB || req.NoiseFigureDB > MaxNoiseFigureDB {
		return "noise_figure_db must be between 0 and 20"
	}
	if req.SampleSpacingM < MinSampleSpacingM || req.SampleSpacingM > MaxSampleSpacingM {
		return "sample_spacing_m must be between 20 and 200"
	}
	if req.CalibrationOffsetDB < MinCalibrationOffsetDB || req.CalibrationOffsetDB > MaxCalibrationOffsetDB {
		return "calibration_offset_db must be between -40 and 40"
	}
	return ""
}

func AnalyzeInterferenceContext(ctx context.Context, req InterferenceRequest, buildings *BuildingIndex) (InterferenceResponse, error) {
	NormalizeInterferenceRequest(&req)
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	scenarioFingerprint := InterferenceScenarioFingerprint(req)
	samples, effectiveSpacing, err := buildInterferenceGridContext(ctx, req)
	if err != nil {
		return InterferenceResponse{}, err
	}
	features, err := evaluateInterferenceSamplesContext(ctx, req, preset, buildings, samples)
	if err != nil {
		return InterferenceResponse{}, err
	}
	demandFeatures, demandCandidates, affectedDemandBuildings, affectedDemand, err := evaluateDemandInterferenceContext(ctx, req, preset, buildings)
	if err != nil {
		return InterferenceResponse{}, err
	}
	stats := calculateInterferenceStats(req, features, demandCandidates, affectedDemandBuildings, affectedDemand)

	profiles := make([]CellRFProfile, len(req.Towers))
	heterogeneousProfiles := false
	for index, tower := range req.Towers {
		profiles[index] = tower.RFProfile
		if index > 0 && !cellRFProfilesEqual(tower.RFProfile, req.Towers[0].RFProfile) {
			heterogeneousProfiles = true
		}
	}
	horizonMeters := interferenceHorizonMeters(req)
	return InterferenceResponse{
		GeoJSON:       InterferenceFeatureCollection{Type: "FeatureCollection", Features: features},
		DemandGeoJSON: InterferenceFeatureCollection{Type: "FeatureCollection", Features: demandFeatures},
		Stats:         stats,
		Model: InterferenceModel{
			Type:                    "deterministic_planning_estimate",
			NetworkTech:             req.NetworkTech,
			MeasurementFamily:       preset.measurementFamily,
			FrequencyGHz:            req.FrequencyGHz,
			BandwidthMHz:            req.BandwidthMHz,
			SubcarrierSpacingKHz:    preset.scsKHz,
			ResourceBlocks:          preset.resourceBlocks,
			NoiseFigureDB:           req.NoiseFigureDB,
			LoadFactor:              req.LoadFactor,
			ReuseFactor:             req.ReuseFactor,
			RequestedSampleSpacingM: req.SampleSpacingM,
			EffectiveSampleSpacingM: roundOne(effectiveSpacing),
			Assumptions: []string{
				"Each cell's conducted TX power, absolute gain, relative pattern, loss, height, load, channel, bandwidth, and receiver assumptions are applied independently.",
				"Only selected cells with an exact channel, frequency, bandwidth, and technology match contribute co-channel interference.",
				"Receiver sensitivity gates serving-cell admission only; finite non-serving signals remain available for co-channel interference summation.",
				"Each cell's configured effective radius is a finite interference-analysis horizon for compatibility; outside_radius is not a claim that physical RF power is zero beyond that horizon.",
				"The selected propagation model is evaluated through the shared link evaluator; the urban model uses footprint boundaries for LOS/NLOS classification without adding legacy wall dB.",
				"Carrier power is normalized to one occupied frequency resource element before linear summation; this is a deterministic uniform-PSD planning approximation, not a UE measurement implementation.",
				"Thermal noise is kTB at the serving numerology's subcarrier bandwidth plus the configured analysis noise figure; receiver sensitivity is not in the SINR denominator.",
				"Sidelobes, fading, diffraction, MIMO scheduling, uplink, adjacent-channel leakage, and partial-overlap selectivity are excluded or deferred.",
			},
			HeterogeneousProfiles:        heterogeneousProfiles,
			Profiles:                     profiles,
			RequestDefaults:              interferenceRequestDefaults(req),
			EffectiveCellProfiles:        effectiveInterferenceCellRFProfiles(req),
			InterferenceHorizonMeters:    horizonMeters,
			InterferenceHorizonSource:    RadioQualityInterferenceHorizonSource,
			InterferenceHorizonSemantics: RadioQualityInterferenceHorizonSemantics,
			RFContract:                   rfContractForProfile(&req.RFProfile, req.CalibrationOffsetDB),
			RSRPThresholdDBm:             InterferenceRSRPThresholdDBm,
			SINRThresholdDB:              InterferenceSINRThresholdDB,
			RSRQThresholdDB:              InterferenceRSRQThresholdDB,
			ServiceabilityRule:           "serviceable = RSRP >= threshold AND SINR >= threshold AND RSRQ >= threshold",
			ReceiverThresholdRule:        RadioQualityServingAdmissionRule,
			ReceiverNoiseSemantics:       "receiver sensitivity is noise-limited and separate from co-channel interference",
			ServingSelectionMode:         servingSelectionMode(req),
			ServingSelectionMetric:       RadioQualityServingSelectionMetric,
			CoChannelEligibilityRule:     RadioQualityCoChannelRule,
			CarrierPowerSemantics:        RadioQualityCarrierPowerSemantics,
			ResourceBasis:                RadioQualityResourceBasis,
			ResourceElementsPerRB:        12,
			InterferenceNoiseBandwidthHz: preset.resourceBandwidthHz(),
			NoiseBandwidthSource:         RadioQualityNoiseBandwidthSource,
			RSRPKind:                     preset.rsrpKind(),
			RSRPConversionID:             RadioQualityRSRPConversionID,
			RSRPConversionDescription:    preset.conversionDescription(),
			RSSIRSRQSemantics:            "RSSI is reconstructed over 12*N_RB occupied subcarriers from desired reference-resource power, loaded co-channel reference-resource power, and thermal noise; RSRQ uses N_RB*RSRP/RSSI on that same planning basis.",
			LoadAssumption:               RadioQualityLoadAssumption,
			AdjacentChannelModel:         RadioQualityAdjacentChannelModel,
			PartialOverlapModel:          RadioQualityPartialOverlapModel,
			OptimizationCoupling:         RadioQualityOptimizationCoupling,
			ServiceabilityPolicyID:       "planning-default-v1",
			ThresholdProvenance:          "A.T.O.M. deterministic planning defaults; thresholds are policy inputs, not operator configuration or UE conformance limits",
			RadioQualityReferences:       radioQualityReferences(),
			ScenarioFingerprint:          scenarioFingerprint,
			ScenarioSchemaVersion:        ScenarioFingerprintSchemaVersion,
		},
	}, nil
}

func interferencePresetFor(networkTech string, bandwidthMHz float64) (interferencePreset, error) {
	if networkTech == "4g" {
		resourceBlocks := map[float64]int{1.4: 6, 3: 15, 5: 25, 10: 50, 15: 75, 20: 100}
		if blocks, ok := resourceBlocks[bandwidthMHz]; ok {
			return interferencePreset{measurementFamily: "lte_crs", scsKHz: 15, resourceBlocks: blocks}, nil
		}
		return interferencePreset{}, fmt.Errorf("bandwidth_mhz must be one of 1.4, 3, 5, 10, 15, or 20 for 4g")
	}
	if networkTech == "5g" {
		resourceBlocks := map[float64]int{50: 32, 100: 66, 200: 132, 400: 264}
		if blocks, ok := resourceBlocks[bandwidthMHz]; ok {
			return interferencePreset{measurementFamily: "nr_ss", scsKHz: 120, resourceBlocks: blocks}, nil
		}
		return interferencePreset{}, fmt.Errorf("bandwidth_mhz must be one of 50, 100, 200, or 400 for 5g")
	}
	return interferencePreset{}, fmt.Errorf("network_tech must be 4g or 5g")
}

func buildInterferenceGrid(req InterferenceRequest) ([]gridSample, float64) {
	samples, spacing, _ := buildInterferenceGridContext(context.Background(), req)
	return samples, spacing
}

func buildInterferenceGridContext(ctx context.Context, req InterferenceRequest) ([]gridSample, float64, error) {
	effectiveSpacing := req.SampleSpacingM
	areaEstimate := 0.0
	for index, tower := range req.Towers {
		profile := effectiveInterferenceTowerProfile(req, tower, index)
		areaEstimate += math.Pi * profile.RadiusMeters * profile.RadiusMeters
	}
	minimumSpacing := math.Sqrt(areaEstimate / MaxInterferenceSamples)
	if minimumSpacing > effectiveSpacing {
		effectiveSpacing = minimumSpacing * 1.03
	}

	for attempts := 0; attempts < 5; attempts++ {
		samples, err := generateGridSamplesContext(ctx, req, effectiveSpacing)
		if err != nil {
			return nil, 0, err
		}
		if len(samples) <= MaxInterferenceSamples {
			return samples, effectiveSpacing, nil
		}
		effectiveSpacing *= math.Sqrt(float64(len(samples))/MaxInterferenceSamples) * 1.02
	}

	samples, err := generateGridSamplesContext(ctx, req, effectiveSpacing)
	if err != nil {
		return nil, 0, err
	}
	if len(samples) > MaxInterferenceSamples {
		samples = samples[:MaxInterferenceSamples]
	}
	return samples, effectiveSpacing, nil
}

func maximumInterferenceRadius(req InterferenceRequest) float64 {
	maximum := req.RadiusMeters
	for index, tower := range req.Towers {
		maximum = math.Max(maximum, effectiveInterferenceTowerProfile(req, tower, index).RadiusMeters)
	}
	return maximum
}

func generateGridSamples(req InterferenceRequest, spacingMeters float64) []gridSample {
	samples, _ := generateGridSamplesContext(context.Background(), req, spacingMeters)
	return samples
}

func generateGridSamplesContext(ctx context.Context, req InterferenceRequest, spacingMeters float64) ([]gridSample, error) {
	minLon := req.Towers[0].TowerLon
	minLat := req.Towers[0].TowerLat
	meanLat := 0.0
	for _, tower := range req.Towers {
		meanLat += tower.TowerLat
		minLon = math.Min(minLon, tower.TowerLon)
		minLat = math.Min(minLat, tower.TowerLat)
	}
	meanLat /= float64(len(req.Towers))
	latStep := spacingMeters / 111_320
	lonScale := math.Max(math.Cos(meanLat*math.Pi/180), 0.05)
	lonStep := spacingMeters / (111_320 * lonScale)
	maxRadius := maximumInterferenceRadius(req)
	originLon := minLon - maxRadius/(111_320*lonScale) - lonStep
	originLat := minLat - maxRadius/111_320 - latStep

	unique := make(map[string]gridSample)
	for towerIndex, tower := range req.Towers {
		if towerIndex%4 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		radiusMeters := effectiveInterferenceTowerProfile(req, tower, towerIndex).RadiusMeters
		radiusSteps := int(math.Ceil(radiusMeters/spacingMeters)) + 1
		centerCol := int(math.Round((tower.TowerLon - originLon) / lonStep))
		centerRow := int(math.Round((tower.TowerLat - originLat) / latStep))
		for row := centerRow - radiusSteps; row <= centerRow+radiusSteps; row++ {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			for col := centerCol - radiusSteps; col <= centerCol+radiusSteps; col++ {
				point := Point{Lon: originLon + float64(col)*lonStep, Lat: originLat + float64(row)*latStep}
				if ApproxDistanceMeters(Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, point) > radiusMeters {
					continue
				}
				key := fmt.Sprintf("%d:%d", row, col)
				unique[key] = gridSample{point: point, row: row, col: col}
			}
		}
	}

	samples := make([]gridSample, 0, len(unique))
	for _, sample := range unique {
		samples = append(samples, sample)
	}
	sort.Slice(samples, func(i, j int) bool {
		if samples[i].row == samples[j].row {
			return samples[i].col < samples[j].col
		}
		return samples[i].row < samples[j].row
	})
	return samples, nil
}

func evaluateInterferenceSamples(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, samples []gridSample) []InterferenceFeature {
	features, _ := evaluateInterferenceSamplesContext(context.Background(), req, preset, buildings, samples)
	return features
}

func evaluateInterferenceSamplesContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, samples []gridSample) ([]InterferenceFeature, error) {
	features := make([]InterferenceFeature, len(samples))
	jobs := make(chan int)
	workerCount := runtime.NumCPU()
	if workerCount > 4 {
		workerCount = 4
	}
	if workerCount > len(samples) {
		workerCount = len(samples)
	}
	if workerCount < 1 {
		workerCount = 1
	}

	var waitGroup sync.WaitGroup
	waitGroup.Add(workerCount)
	for worker := 0; worker < workerCount; worker++ {
		go func() {
			defer waitGroup.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case index, ok := <-jobs:
					if !ok {
						return
					}
					feature, err := makeInterferenceFeatureContext(ctx, req, preset, buildings, samples[index].point, fmt.Sprintf("grid-%d", index+1))
					if err != nil {
						return
					}
					features[index] = feature
				}
			}
		}()
	}
	for index := range samples {
		select {
		case <-ctx.Done():
			close(jobs)
			waitGroup.Wait()
			return nil, ctx.Err()
		case jobs <- index:
		}
	}
	close(jobs)
	waitGroup.Wait()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return features, nil
}

func makeInterferenceFeature(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point, sampleID string) InterferenceFeature {
	feature, _ := makeInterferenceFeatureContext(context.Background(), req, preset, buildings, point, sampleID)
	return feature
}

func makeInterferenceFeatureContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point, sampleID string) (InterferenceFeature, error) {
	properties, err := evaluateInterferencePointContext(ctx, req, preset, buildings, point)
	if err != nil {
		return InterferenceFeature{}, err
	}
	properties.SampleID = sampleID
	return InterferenceFeature{
		Type:       "Feature",
		Properties: properties,
		Geometry:   PointGeometry{Type: "Point", Coordinates: []float64{point.Lon, point.Lat}},
	}, nil
}

func evaluateInterferencePoint(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point) InterferenceProperties {
	properties, _ := evaluateInterferencePointContext(context.Background(), req, preset, buildings, point)
	return properties
}

func evaluateInterferencePointContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point) (InterferenceProperties, error) {
	signals := make([]receivedCellSignal, 0, len(req.Towers))
	ledger := make([]RadioQualityPowerLedgerEntry, 0, len(req.Towers))
	for index, tower := range req.Towers {
		if err := ctx.Err(); err != nil {
			return InterferenceProperties{}, err
		}
		profile := effectiveInterferenceTowerProfile(req, tower, index)
		receiverThreshold := receiverThresholdForInterferenceTower(req, tower, index)
		towerPreset, presetErr := interferencePresetFor(profile.NetworkTech, profile.BandwidthMHz)
		if presetErr != nil {
			towerPreset = preset
		}
		origin := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		distance := ApproxDistanceMeters(origin, point)
		ledgerEntry := RadioQualityPowerLedgerEntry{
			CellID:            tower.ID,
			ChannelID:         profile.ChannelID,
			NetworkTech:       profile.NetworkTech,
			FrequencyGHz:      profile.FrequencyGHz,
			BandwidthMHz:      profile.BandwidthMHz,
			LoadFactor:        profile.LoadFactor,
			ReceiverThreshold: &receiverThreshold,
		}
		if distance > profile.RadiusMeters {
			ledgerEntry.ExclusionReason = "outside_radius"
			ledger = append(ledger, ledgerEntry)
			continue
		}
		bearing := BearingDegrees(origin, point)
		antenna := EvaluateAntennaLink(profile, math.Max(distance, 1), bearing, tower.AzimuthDeg)
		if !antenna.Eligible {
			ledgerEntry.ExclusionReason = "antenna_ineligible"
			ledger = append(ledger, ledgerEntry)
			continue
		}
		pathGeometry, err := buildPropagationPathGeometryContextWithOptions(ctx, origin, point, buildings, propagationPathGeometryOptions{
			TxHeightM: profile.AntennaHeightM,
			RxHeightM: profile.ReceiverHeightM,
		})
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return InterferenceProperties{}, ctxErr
			}
			ledgerEntry.ExclusionReason = "propagation_unavailable"
			ledger = append(ledger, ledgerEntry)
			continue
		}
		losState, endpointCase, wallCount, losClassification := classifyPropagationPath(profile, pathGeometry, point, distance)
		propagation := EvaluatePropagationLink(PropagationLinkContext{
			Profile: profile, GroundDistanceM: distance,
			HorizontalOffsetDeg: antenna.HorizontalOffsetDeg,
			CalibrationOffsetDB: req.CalibrationOffsetDB,
			LOSState:            losState, EndpointCase: endpointCase,
			LOSClassification:     losClassification,
			BuildingDataAvailable: pathGeometry.available, WallEventCount: wallCount,
			ReceiverThreshold: &receiverThreshold,
		})
		carrierRxDBm := propagation.ReceivedPowerDBm
		if !isFiniteRadioValue(carrierRxDBm) {
			ledgerEntry.ExclusionReason = "below_numeric_floor"
			ledger = append(ledger, ledgerEntry)
			continue
		}
		ledgerEntry.ReceivedCarrierPowerDBm = floatPointer(roundOne(carrierRxDBm))
		ledgerEntry.ReceiverLinkMarginDB = floatPointer(roundOne(propagation.LinkBudget.ReceiverLinkMarginDB))
		rsrpDBm, ok := carrierPowerToReferencePower(carrierRxDBm, towerPreset)
		if !ok {
			ledgerEntry.ExclusionReason = "below_numeric_floor"
			ledger = append(ledger, ledgerEntry)
			continue
		}
		rsrpMW, ok := referencePowerMilliwatts(rsrpDBm)
		if !ok {
			ledgerEntry.ExclusionReason = "below_numeric_floor"
			ledger = append(ledger, ledgerEntry)
			continue
		}
		ledgerEntry.RSRPDBm = floatPointer(roundOne(rsrpDBm))
		ledgerEntry.NormalizedPowerMW = floatPointer(rsrpMW)
		ledgerEntry.Eligible = true
		ledgerEntry.ServingEligible = ReceiverUsableSignal(carrierRxDBm, receiverThreshold.SensitivityDBm)
		if !ledgerEntry.ServingEligible {
			ledgerEntry.ExclusionReason = "below_receiver_sensitivity"
		}
		signals = append(signals, receivedCellSignal{
			cellID:              tower.ID,
			networkTech:         profile.NetworkTech,
			channelID:           profile.ChannelID,
			frequencyGHz:        profile.FrequencyGHz,
			bandwidthMHz:        profile.BandwidthMHz,
			receivedCarrierDBm:  carrierRxDBm,
			rsrpDBm:             rsrpDBm,
			wallCount:           wallCount,
			losState:            string(propagation.LOSState),
			classifierID:        propagation.LOSClassifierID,
			classificationBasis: propagation.ClassificationBasis,
			terrainStatus:       propagation.TerrainStatus,
			losClassification:   propagation.LOSClassification,
			loadFactor:          profile.LoadFactor,
			preset:              towerPreset,
			linkBudget:          propagation.LinkBudget,
			receiverThreshold:   receiverThreshold,
			servingEligible:     ledgerEntry.ServingEligible,
		})
		ledger = append(ledger, ledgerEntry)
	}

	if len(signals) == 0 {
		return InterferenceProperties{
			QualityClass:           "no_signal",
			ServingSelectionMode:   servingSelectionMode(req),
			ServingSelectionMetric: RadioQualityServingSelectionMetric,
			ServiceabilityStatus:   "unavailable",
			ServiceabilityFailures: []string{"no_eligible_carrier"},
			PowerLedger:            ledger,
		}, nil
	}
	serving, servingFound := selectServingInterferenceSignal(req, signals)
	if !servingFound {
		return InterferenceProperties{
			QualityClass:           "no_signal",
			ServingSelectionMode:   servingSelectionMode(req),
			ServingSelectionMetric: RadioQualityServingSelectionMetric,
			ServiceabilityStatus:   "unavailable",
			ServiceabilityFailures: []string{"serving_cell_unavailable"},
			PowerLedger:            ledger,
		}, nil
	}
	for index := range ledger {
		if ledger[index].CellID == serving.cellID {
			ledger[index].Role = "serving"
		} else if ledger[index].Eligible {
			ledger[index].Role = "candidate"
		}
	}
	servingMW, _ := referencePowerMilliwatts(serving.rsrpDBm)
	for index := range ledger {
		if ledger[index].CellID == serving.cellID {
			ledger[index].ChannelMatch = true
			ledger[index].LoadedPowerMW = floatPointer(servingMW)
			break
		}
	}
	noiseDBm := ThermalNoisePerREDBm(serving.preset.scsKHz, req.NoiseFigureDB)
	noiseMW := DBmToMilliwatts(noiseDBm)
	interferenceMW := 0.0
	strongestInterfererID := ""
	strongestInterfererDBm := math.Inf(-1)
	contributingCells := 1
	interfererCount := 0
	for _, signal := range signals {
		if signal.cellID == serving.cellID {
			continue
		}
		match := sameInterferenceCarrier(signal, serving)
		for index := range ledger {
			if ledger[index].CellID == signal.cellID {
				ledger[index].ChannelMatch = match
				if match {
					ledger[index].Role = "interferer"
				} else {
					ledger[index].ExclusionReason = interferenceExclusionReason(signal, serving)
				}
				break
			}
		}
		if !match {
			continue
		}
		loadedMW, _ := referencePowerMilliwatts(signal.rsrpDBm)
		loadedMW *= signal.loadFactor
		interferenceMW += loadedMW
		interfererCount++
		contributingCells++
		for index := range ledger {
			if ledger[index].CellID == signal.cellID {
				ledger[index].LoadedPowerMW = floatPointer(loadedMW)
				break
			}
		}
		loadedDBm := MilliwattsToDBm(loadedMW)
		if loadedDBm > strongestInterfererDBm {
			strongestInterfererDBm = loadedDBm
			strongestInterfererID = signal.cellID
		}
	}

	metrics := computeRadioQualityMetrics(servingMW, interferenceMW, noiseMW, serving.preset.resourceBlocks)
	sinrDB := metrics.SINRDB
	rssiDBm := metrics.RSSIDBm
	rsrqDB := metrics.RSRQDB
	serviceabilityFailures := radioQualityServiceabilityFailures(serving.rsrpDBm, sinrDB, rsrqDB)
	serviceable := len(serviceabilityFailures) == 0
	interferenceLimited := serving.rsrpDBm >= InterferenceRSRPThresholdDBm && (sinrDB < InterferenceSINRThresholdDB || rsrqDB < InterferenceRSRQThresholdDB)

	properties := InterferenceProperties{
		ServingCellID:                  serving.cellID,
		ChannelID:                      serving.channelID,
		ServingReceivedCarrierPowerDBm: floatPointer(roundOne(serving.receivedCarrierDBm)),
		DesiredSignalPowerMW:           floatPointer(servingMW),
		InterferencePowerMW:            floatPointer(interferenceMW),
		ThermalNoisePowerMW:            floatPointer(noiseMW),
		ThermalNoiseDBm:                floatPointer(roundOne(noiseDBm)),
		InterferenceNoiseBandwidthHz:   serving.preset.resourceBandwidthHz(),
		NoiseBandwidthSource:           RadioQualityNoiseBandwidthSource,
		RSRPDBm:                        floatPointer(roundOne(serving.rsrpDBm)),
		SINRDB:                         floatPointer(roundOne(sinrDB)),
		RSRQDB:                         floatPointer(roundOne(rsrqDB)),
		RSSIDBm:                        floatPointer(roundOne(rssiDBm)),
		QualityClass:                   interferenceQualityClass(serving.rsrpDBm, sinrDB, rsrqDB),
		Serviceable:                    serviceable,
		InterferenceLimited:            interferenceLimited,
		WallCount:                      serving.wallCount,
		LOSState:                       serving.losState,
		LOSClassifierID:                serving.classifierID,
		LOSClassificationBasis:         serving.classificationBasis,
		TerrainStatus:                  serving.terrainStatus,
		LOSClassification:              serving.losClassification,
		ContributingCells:              contributingCells,
		InterfererCount:                interfererCount,
		ServingSelectionMode:           servingSelectionMode(req),
		ServingSelectionMetric:         RadioQualityServingSelectionMetric,
		RSRPKind:                       serving.preset.rsrpKind(),
		RSRPConversionID:               RadioQualityRSRPConversionID,
		RSRPConversionDescription:      serving.preset.conversionDescription(),
		ServiceabilityStatus:           radioQualityServiceabilityStatus(serviceabilityFailures),
		ServiceabilityFailures:         serviceabilityFailures,
		PowerLedger:                    ledger,
		ReceiverThreshold:              &serving.receiverThreshold,
		ReceiverLinkMarginDB:           floatPointer(roundOne(serving.linkBudget.ReceiverLinkMarginDB)),
	}
	properties.LinkBudget = &serving.linkBudget
	if interferenceMW > 0 {
		interferenceDBm := MilliwattsToDBm(interferenceMW)
		properties.InterferenceDBm = floatPointer(roundOne(interferenceDBm))
		properties.StrongestInterfererID = strongestInterfererID
		properties.StrongestInterfererDBm = floatPointer(roundOne(strongestInterfererDBm))
	}
	return properties, nil
}

func servingSelectionMode(req InterferenceRequest) string {
	if strings.TrimSpace(req.ServingCellID) != "" {
		return RadioQualityServingSelectionExplicit
	}
	return RadioQualityServingSelectionAutomatic
}

func selectServingInterferenceSignal(req InterferenceRequest, signals []receivedCellSignal) (receivedCellSignal, bool) {
	if requestedID := strings.TrimSpace(req.ServingCellID); requestedID != "" {
		for _, signal := range signals {
			if signal.cellID == requestedID && signal.servingEligible {
				return signal, true
			}
		}
		return receivedCellSignal{}, false
	}
	ordered := make([]receivedCellSignal, 0, len(signals))
	for _, signal := range signals {
		if signal.servingEligible {
			ordered = append(ordered, signal)
		}
	}
	if len(ordered) == 0 {
		return receivedCellSignal{}, false
	}
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].rsrpDBm == ordered[j].rsrpDBm {
			return ordered[i].cellID < ordered[j].cellID
		}
		return ordered[i].rsrpDBm > ordered[j].rsrpDBm
	})
	return ordered[0], true
}

func sameInterferenceCarrier(left, right receivedCellSignal) bool {
	return left.networkTech == right.networkTech &&
		left.channelID == right.channelID &&
		math.Abs(left.frequencyGHz-right.frequencyGHz) < 1e-9 &&
		math.Abs(left.bandwidthMHz-right.bandwidthMHz) < 1e-9 &&
		left.preset.measurementFamily == right.preset.measurementFamily
}

func interferenceExclusionReason(signal, serving receivedCellSignal) string {
	if signal.networkTech != serving.networkTech {
		return "different_technology"
	}
	if signal.channelID != serving.channelID {
		return "different_channel"
	}
	if math.Abs(signal.frequencyGHz-serving.frequencyGHz) >= 1e-9 {
		return "different_frequency"
	}
	if math.Abs(signal.bandwidthMHz-serving.bandwidthMHz) >= 1e-9 {
		return "different_bandwidth"
	}
	return "unsupported_configuration"
}

func radioQualityServiceabilityFailures(rsrpDBm, sinrDB, rsrqDB float64) []string {
	failures := make([]string, 0, 3)
	if rsrpDBm < InterferenceRSRPThresholdDBm {
		failures = append(failures, "rsrp_below_threshold")
	}
	if sinrDB < InterferenceSINRThresholdDB {
		failures = append(failures, "sinr_below_threshold")
	}
	if rsrqDB < InterferenceRSRQThresholdDB {
		failures = append(failures, "rsrq_below_threshold")
	}
	return failures
}

func radioQualityServiceabilityStatus(failures []string) string {
	if len(failures) == 0 {
		return "serviceable"
	}
	if len(failures) == 1 {
		return failures[0]
	}
	return "multiple_thresholds_below"
}

func evaluateDemandInterference(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex) ([]InterferenceFeature, int, int, float64) {
	features, candidates, affectedCount, affectedDemand, _ := evaluateDemandInterferenceContext(context.Background(), req, preset, buildings)
	return features, candidates, affectedCount, affectedDemand
}

func evaluateDemandInterferenceContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex) ([]InterferenceFeature, int, int, float64, error) {
	if buildings == nil {
		return []InterferenceFeature{}, 0, 0, 0, nil
	}
	affected := make([]InterferenceFeature, 0)
	candidates := 0
	affectedDemand := 0.0
	demandCandidates, err := interferenceDemandCandidatesContext(ctx, req, buildings)
	if err != nil {
		return nil, 0, 0, 0, err
	}
	for index, building := range demandCandidates {
		if index%64 == 0 {
			select {
			case <-ctx.Done():
				return nil, 0, 0, 0, ctx.Err()
			default:
			}
		}
		if building == nil || (building.DemandWeight <= 0 && building.ResidentialDemand <= 0) {
			continue
		}
		centroid, ok := PolygonCentroid(building.Vertices)
		if !ok || !pointInsideAnyTowerRadius(req, centroid) {
			continue
		}
		candidates++
		feature, err := makeInterferenceFeatureContext(ctx, req, preset, buildings, centroid, "demand-"+building.ID)
		if err != nil {
			return nil, 0, 0, 0, err
		}
		if feature.Properties.Serviceable {
			continue
		}
		totalDemand := building.DemandWeight + building.ResidentialDemand
		feature.Properties.BuildingID = building.ID
		feature.Properties.DemandWeight = roundOne(building.DemandWeight)
		feature.Properties.ResidentialDemand = roundOne(building.ResidentialDemand)
		feature.Properties.TotalDemand = roundOne(totalDemand)
		feature.Properties.Reason = "radio quality below RSRP, SINR, or RSRQ service threshold"
		affectedDemand += totalDemand
		affected = append(affected, feature)
	}

	sort.SliceStable(affected, func(i, j int) bool {
		if affected[i].Properties.TotalDemand == affected[j].Properties.TotalDemand {
			return pointerValue(affected[i].Properties.SINRDB) < pointerValue(affected[j].Properties.SINRDB)
		}
		return affected[i].Properties.TotalDemand > affected[j].Properties.TotalDemand
	})
	affectedCount := len(affected)
	if affectedCount > MaxInterferenceDemandFeatures {
		affected = affected[:MaxInterferenceDemandFeatures]
	}
	return affected, candidates, affectedCount, roundOne(affectedDemand), nil
}

func interferenceDemandCandidates(req InterferenceRequest, buildings *BuildingIndex) []*BuildingFootprint {
	candidates, _ := interferenceDemandCandidatesContext(context.Background(), req, buildings)
	return candidates
}

func interferenceDemandCandidatesContext(ctx context.Context, req InterferenceRequest, buildings *BuildingIndex) ([]*BuildingFootprint, error) {
	if buildings == nil {
		return nil, nil
	}
	byID := make(map[string]*BuildingFootprint)
	for towerIndex, tower := range req.Towers {
		if towerIndex%4 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		origin := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		profile := effectiveInterferenceTowerProfile(req, tower, towerIndex)
		for buildingIndex, building := range buildings.SearchBounds(BoundsAroundPoint(origin, profile.RadiusMeters)) {
			if buildingIndex%64 == 0 {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
			}
			if building != nil && building.ID != "" {
				byID[building.ID] = building
			}
		}
	}
	ids := make([]string, 0, len(byID))
	for id := range byID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	result := make([]*BuildingFootprint, 0, len(ids))
	for _, id := range ids {
		result = append(result, byID[id])
	}
	return result, nil
}
