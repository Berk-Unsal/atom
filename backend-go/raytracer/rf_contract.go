package raytracer

import "strings"

// The canonical network model is intentionally narrow. It is a deterministic
// footprint-obstruction planning model, not a full 2.5D channel solver.
const (
	CanonicalRFModelID             = "fspl-walls-2p5d-v3"
	DiagnosticPathModelID          = "path-profile-diagnostic-v1"
	CanonicalRFModelDescription    = "Deterministic FSPL + footprint obstruction planning model"
	CanonicalPropagationDimensions = "2D footprint propagation with Tx/Rx height-aware FSPL"
	CanonicalWallModel             = "frequency-dependent, material-agnostic building-boundary loss"
	CanonicalPropagationReach      = "usable receiver-power reach"
	CanonicalSurfaceDefinition     = "raw single-cell received-power surface"
	CanonicalCalibrationDefinition = "global calibration offset; positive dB raises predicted received power"
	CanonicalPathProfileScope      = "advanced point-to-point diagnostic model; isolated from canonical network RF"
	CanonicalLinkBudgetEquation    = "P_rx = P_tx + G_tx - L_system + calibration - L_FSPL - L_building - A_pattern"
)

const (
	// BuildingServiceThresholdDBm is the network building-serving threshold.
	// It is deliberately distinct from per-cell receiver sensitivity.
	BuildingServiceThresholdDBm = -100.0

	// CoveredBuildingThresholdDBm is retained as a compatibility alias for
	// clients and tests that used the pre-Concept-4C name.
	CoveredBuildingThresholdDBm = BuildingServiceThresholdDBm

	// Interference serviceability thresholds apply only after a deterministic
	// serving/interferer sample has been formed. They are not ray sensitivity.
	InterferenceRSRPThresholdDBm = -110.0
	InterferenceSINRThresholdDB  = 0.0
	InterferenceRSRQThresholdDB  = -20.0
)

// RFLinkBudgetTerms makes the production received-power equation inspectable
// without changing the arithmetic used by the RF engines.
type RFLinkBudgetTerms struct {
	TxPowerDBm                     float64 `json:"tx_power_dbm"`
	AntennaGainDBi                 float64 `json:"antenna_gain_dbi"`
	SystemLossDB                   float64 `json:"system_loss_db"`
	CalibrationOffsetDB            float64 `json:"calibration_offset_db"`
	EIRPDBm                        float64 `json:"eirp_dbm"`
	FSPLDB                         float64 `json:"fspl_db"`
	BuildingLossDB                 float64 `json:"building_loss_db"`
	HorizontalPatternAttenuationDB float64 `json:"horizontal_pattern_attenuation_db"`
	VerticalPatternAttenuationDB   float64 `json:"vertical_pattern_attenuation_db"`
	PatternAttenuationDB           float64 `json:"pattern_attenuation_db"`
	ReceivedPowerDBm               float64 `json:"received_power_dbm"`
}

// RFContractMetadata is shared metadata for current RF responses. Numeric
// receiver sensitivity is carried by each effective CellRFProfile so a
// heterogeneous network never gets represented by one misleading global
// threshold.
type RFContractMetadata struct {
	ModelID                        string   `json:"model_id"`
	ModelDescription               string   `json:"model_description"`
	AppliedModelID                 string   `json:"applied_model_id,omitempty"`
	ModelFamily                    string   `json:"model_family,omitempty"`
	Scenario                       string   `json:"scenario,omitempty"`
	ModelStatus                    string   `json:"model_status,omitempty"`
	Reference                      string   `json:"reference,omitempty"`
	Applicability                  string   `json:"applicability,omitempty"`
	FallbackModelID                string   `json:"fallback_model_id,omitempty"`
	FallbackPolicy                 string   `json:"fallback_policy,omitempty"`
	LOSClassificationRule          string   `json:"los_classification_rule,omitempty"`
	BuildingHeightNote             string   `json:"building_height_note,omitempty"`
	Deterministic                  bool     `json:"deterministic"`
	PropagationDimensions          string   `json:"propagation_dimensions"`
	UsesTerrain                    bool     `json:"uses_terrain"`
	UsesBuildingHeight             bool     `json:"uses_building_height"`
	UsesDiffraction                bool     `json:"uses_diffraction"`
	UsesReflection                 bool     `json:"uses_reflection"`
	WallModel                      string   `json:"wall_model"`
	LinkBudgetEquation             string   `json:"link_budget_equation"`
	AbsoluteTerms                  []string `json:"absolute_terms"`
	RelativeAttenuationTerms       []string `json:"relative_attenuation_terms"`
	PropagationTerms               []string `json:"propagation_terms"`
	ReceiverSensitivityScope       string   `json:"receiver_sensitivity_scope"`
	BuildingServiceThresholdDBm    float64  `json:"building_service_threshold_dbm"`
	BuildingServiceRule            string   `json:"building_service_rule"`
	PropagationReachDefinition     string   `json:"propagation_reach_definition"`
	SurfaceDefinition              string   `json:"surface_definition"`
	SurfaceNoDataDefinition        string   `json:"surface_nodata_definition"`
	InterferenceServiceabilityRule string   `json:"interference_serviceability_rule"`
	InterferenceRSRPThresholdDBm   float64  `json:"interference_rsrp_threshold_dbm"`
	InterferenceSINRThresholdDB    float64  `json:"interference_sinr_threshold_db"`
	InterferenceRSRQThresholdDB    float64  `json:"interference_rsrq_threshold_db"`
	CalibrationOffsetDB            float64  `json:"calibration_offset_db"`
	CalibrationDefinition          string   `json:"calibration_definition"`
	EndpointScope                  string   `json:"endpoint_scope"`
}

func rfContractForProfile(profile *CellRFProfile, calibrationOffsetDB float64) RFContractMetadata {
	if profile == nil {
		return canonicalRFContract(nil, calibrationOffsetDB)
	}
	profileValue := profile.normalized()
	contract := canonicalRFContract(&profileValue, calibrationOffsetDB)
	contract.ModelID = profileValue.PropagationModelID
	contract.AppliedModelID = profileValue.PropagationModelID
	contract.ModelDescription = PropagationModelDescription(profileValue.PropagationModelID)
	contract.FallbackModelID = LegacyPropagationModelID
	contract.FallbackPolicy = "if the requested model is outside its explicit frequency, distance, endpoint, building-data, or LOS/NLOS scope, evaluate the legacy_fspl_walls model and report the reason"
	contract.LOSClassificationRule = "2D footprint rule: outdoor-to-outdoor paths with no footprint boundary event are LOS; one or more boundary events are NLOS; indoor transmitter/receiver and missing footprint data are not urban-applicable"
	contract.BuildingHeightNote = "building height is not used by the urban baseline; only known Tx/Rx heights are used, and uncertain building height remains a separate data limitation"
	contract.ReceiverSensitivityScope = "effective per-cell static-ray receiver threshold; see rf_profile.receiver_sensitivity_dbm"

	switch profileValue.PropagationModelID {
	case UrbanShortRangePropagationID:
		contract.ModelFamily = "3GPP TR 38.901 UMa median path loss"
		contract.Scenario = "urban short-range outdoor-to-outdoor planning"
		contract.ModelStatus = "deterministic planning baseline"
		contract.Reference = "3GPP TR 38.901 V19.4.0, Table 7.4.1-1 UMa path loss"
		contract.Applicability = "0.5 < f_c < 100 GHz, 10 m <= d_2D <= 5000 m, known Tx/Rx heights in the deterministic UMa envelope, outdoor-to-outdoor endpoint, and footprint LOS/NLOS classification"
		contract.PropagationDimensions = "height-aware 2D footprint centerline visibility with flat-ground relative heights and 3D distance in the 3GPP UMa median path-loss equation"
		contract.UsesBuildingHeight = true
		contract.LOSClassificationRule = "footprint-height-los-v1: no footprint is LOS; known-height footprints block only when the flat-ground geometric centerline reaches the roof; cleared known roofs are LOS; unknown-height intersections use conservative NLOS; indoor endpoints and missing footprint data are not urban-applicable"
		contract.BuildingHeightNote = "explicit OSM height is observed_tag; building:levels is derived_from_levels using 3 m per level; generic 9 m fallback is never roof evidence and unknown intersections remain conservative NLOS"
		contract.WallModel = "none in the urban formula; footprint boundaries classify outdoor LOS/NLOS and are not converted into legacy wall dB"
		contract.LinkBudgetEquation = "P_rx = P_tx + G_tx - L_system + calibration - PL_3GPP_UMa(LOS|NLOS) - A_pattern"
		contract.PropagationTerms = []string{"3GPP UMa PL1/PL2 breakpoint LOS path loss", "3GPP UMa NLOS max(LOS, PL') path loss", "footprint-height-los-v1 geometric centerline classifier", "conservative unknown-height fallback"}
	case ResearchSubTHzPropagationID:
		contract.ModelFamily = "research sub-THz planning profile"
		contract.Scenario = "research-only sub-THz planning"
		contract.ModelStatus = "research-only"
		contract.Reference = "A.T.O.M. research planning profile; not a 140 GHz standards-conformance claim"
		contract.Applicability = "100-300 GHz research planning range"
		contract.PropagationDimensions = "2D footprint propagation with Tx/Rx height-aware FSPL and conservative profile attenuation"
		contract.UsesBuildingHeight = false
		contract.WallModel = CanonicalWallModel
		contract.LinkBudgetEquation = CanonicalLinkBudgetEquation
		contract.PropagationTerms = []string{"FSPL", "research-profile wall-event attenuation"}
	default:
		contract.ModelFamily = "free-space path loss plus footprint wall events"
		contract.Scenario = "legacy planning compatibility"
		contract.ModelStatus = "compatibility baseline"
		contract.Reference = "A.T.O.M. legacy deterministic planning model"
		contract.Applicability = "positive finite frequency and non-negative finite link distance"
		contract.ModelDescription = LegacyPropagationDescription
		contract.PropagationDimensions = CanonicalPropagationDimensions
		contract.WallModel = CanonicalWallModel
		contract.LinkBudgetEquation = CanonicalLinkBudgetEquation
		contract.PropagationTerms = []string{"FSPL", "building/wall-event loss"}
	}
	return contract
}

// RFContractMetadataForModel exposes the inspectable contract for API metadata
// without requiring a full request profile.
func RFContractMetadataForModel(modelID string, calibrationOffsetDB float64) RFContractMetadata {
	profile := DefaultCellRFProfile(NetworkTechnologyForFrequency(DefaultFrequencyGHz), DefaultFrequencyGHz, DefaultTxPowerDBm, DefaultRadiusMeters, DefaultBeamWidthDeg, 0, 0, 0)
	profile.PropagationModelID = strings.ToLower(strings.TrimSpace(modelID))
	if profile.PropagationModelID == "" {
		profile.PropagationModelID = DefaultPropagationModelID(profile.FrequencyGHz)
	}
	return rfContractForProfile(&profile, calibrationOffsetDB)
}

func canonicalRFContract(profile *CellRFProfile, calibrationOffsetDB float64) RFContractMetadata {
	contract := RFContractMetadata{
		ModelID:                        CanonicalRFModelID,
		ModelDescription:               CanonicalRFModelDescription,
		Deterministic:                  true,
		PropagationDimensions:          CanonicalPropagationDimensions,
		UsesTerrain:                    false,
		UsesBuildingHeight:             false,
		UsesDiffraction:                false,
		UsesReflection:                 false,
		WallModel:                      CanonicalWallModel,
		LinkBudgetEquation:             CanonicalLinkBudgetEquation,
		AbsoluteTerms:                  []string{"transmit power", "antenna gain", "system loss", "global calibration offset"},
		RelativeAttenuationTerms:       []string{"horizontal antenna attenuation", "vertical antenna attenuation"},
		PropagationTerms:               []string{"FSPL", "building/wall-event loss"},
		ReceiverSensitivityScope:       "effective per-cell static-ray receiver threshold",
		BuildingServiceThresholdDBm:    BuildingServiceThresholdDBm,
		BuildingServiceRule:            "building is served when modeled received power is strictly greater than the building-service threshold",
		PropagationReachDefinition:     CanonicalPropagationReach,
		SurfaceDefinition:              CanonicalSurfaceDefinition,
		SurfaceNoDataDefinition:        "NoData means radius/beam geometry exclusion; below-sensitivity numeric values remain valid",
		InterferenceServiceabilityRule: "serviceable when RSRP, SINR, and RSRQ each meet their interference-planning thresholds",
		InterferenceRSRPThresholdDBm:   InterferenceRSRPThresholdDBm,
		InterferenceSINRThresholdDB:    InterferenceSINRThresholdDB,
		InterferenceRSRQThresholdDB:    InterferenceRSRQThresholdDB,
		CalibrationOffsetDB:            calibrationOffsetDB,
		CalibrationDefinition:          CanonicalCalibrationDefinition,
		EndpointScope:                  "canonical network RF evaluation",
	}
	if profile != nil {
		// Keep this function's metadata compact. The numeric value remains in the
		// effective profile, while this field explains its scope for consumers.
		contract.ReceiverSensitivityScope = "effective per-cell static-ray receiver threshold; see rf_profile.receiver_sensitivity_dbm"
	}
	return contract
}

// CanonicalRFContractMetadata exposes the stable contract summary for API
// metadata and documentation without exposing internal dispatch helpers.
func CanonicalRFContractMetadata(calibrationOffsetDB float64) RFContractMetadata {
	return canonicalRFContract(nil, calibrationOffsetDB)
}

func diagnosticRFContract(profile *CellRFProfile, calibrationOffsetDB float64) RFContractMetadata {
	contract := canonicalRFContract(profile, calibrationOffsetDB)
	contract.ModelID = DiagnosticPathModelID
	contract.ModelDescription = CanonicalPathProfileScope
	contract.ModelFamily = "P.526-aligned single-edge diffraction diagnostic"
	contract.Scenario = "point-to-point known-obstruction comparison"
	contract.ModelStatus = "diagnostic only"
	contract.Reference = P526SingleEdgeReference
	contract.Applicability = "known explicit/levels-derived obstruction geometry, valid single-edge distances, and frequency above the P.526 single-edge lower reference scope; 140 GHz is research-only"
	contract.FallbackModelID = ""
	contract.FallbackPolicy = "unavailable diagnostic geometry is reported explicitly; no canonical propagation fallback is applied"
	contract.PropagationDimensions = "point-to-point vertical terrain/building profile"
	contract.UsesTerrain = true
	contract.UsesBuildingHeight = true
	contract.UsesDiffraction = true
	contract.WallModel = "user-selected diagnostic material/screen or penetration sensitivity"
	contract.LinkBudgetEquation = "diagnostic P_rx = configured link terms - (FSPL + explicit P.526-aligned single-edge loss); canonical UMa is evaluated separately"
	contract.AbsoluteTerms = []string{"transmit power", "antenna gain"}
	contract.RelativeAttenuationTerms = []string{"horizontal/vertical pattern", "system loss", "selected wall, clutter, vegetation, gas, rain, and shadow terms"}
	contract.PropagationTerms = []string{"FSPL baseline", "known-height terrain/building obstruction ledger", "P.526-16 §4.1 equation (26) v parameter", "equation (31) single-edge loss approximation"}
	contract.PropagationReachDefinition = "not used by the point-to-point diagnostic workflow"
	contract.SurfaceDefinition = "not used by the point-to-point diagnostic workflow"
	contract.EndpointScope = "advanced point-to-point diagnostic workflow; does not alter canonical network RF"
	return contract
}

// EffectiveCellRFProfile identifies the normalized per-cell values that were
// actually evaluated. Request-level defaults remain separately available.
type EffectiveCellRFProfile struct {
	ID         string        `json:"id"`
	TowerLon   float64       `json:"tower_lon"`
	TowerLat   float64       `json:"tower_lat"`
	AzimuthDeg float64       `json:"azimuth_deg"`
	RFProfile  CellRFProfile `json:"rf_profile"`
}

// RFRequestDefaults records request-level defaults without implying that all
// cells used them after per-cell overrides were applied.
type RFRequestDefaults struct {
	Rays                int           `json:"rays"`
	RadiusMeters        float64       `json:"radius_m"`
	FrequencyGHz        float64       `json:"frequency_ghz"`
	TxPowerDBm          float64       `json:"tx_power_dbm"`
	BeamWidthDeg        float64       `json:"beam_width"`
	BandwidthMHz        float64       `json:"bandwidth_mhz,omitempty"`
	LoadFactor          float64       `json:"load_factor,omitempty"`
	ReuseFactor         int           `json:"reuse_factor,omitempty"`
	NoiseFigureDB       float64       `json:"noise_figure_db,omitempty"`
	CalibrationOffsetDB float64       `json:"calibration_offset_db,omitempty"`
	RFProfile           CellRFProfile `json:"rf_profile"`
}

func networkRequestDefaults(req NetworkOptimizationRequest) RFRequestDefaults {
	return RFRequestDefaults{
		Rays:                req.Rays,
		RadiusMeters:        req.RadiusMeters,
		FrequencyGHz:        req.FrequencyGHz,
		TxPowerDBm:          req.TxPowerDBm,
		BeamWidthDeg:        req.BeamWidthDeg,
		BandwidthMHz:        req.RFProfile.BandwidthMHz,
		LoadFactor:          req.RFProfile.LoadFactor,
		ReuseFactor:         req.RFProfile.ReuseFactor,
		CalibrationOffsetDB: req.CalibrationOffsetDB,
		RFProfile:           req.RFProfile,
	}
}

func effectiveCellRFProfiles(req NetworkOptimizationRequest, azimuths []float64) []EffectiveCellRFProfile {
	profiles := make([]EffectiveCellRFProfile, 0, len(req.Towers))
	for index, tower := range req.Towers {
		profile := tower.RFProfile
		if profile.SchemaVersion == 0 {
			profile = req.RFProfile
		}
		azimuth := tower.AzimuthDeg
		if index < len(azimuths) {
			azimuth = azimuths[index]
		}
		profiles = append(profiles, EffectiveCellRFProfile{
			ID: tower.ID, TowerLon: tower.TowerLon, TowerLat: tower.TowerLat,
			AzimuthDeg: normalizeDegrees(azimuth), RFProfile: profile.normalized(),
		})
	}
	return profiles
}

func interferenceRequestDefaults(req InterferenceRequest) RFRequestDefaults {
	return RFRequestDefaults{
		RadiusMeters:        req.RadiusMeters,
		FrequencyGHz:        req.FrequencyGHz,
		TxPowerDBm:          req.TxPowerDBm,
		BeamWidthDeg:        req.BeamWidthDeg,
		BandwidthMHz:        req.BandwidthMHz,
		LoadFactor:          req.LoadFactor,
		ReuseFactor:         req.ReuseFactor,
		NoiseFigureDB:       req.NoiseFigureDB,
		CalibrationOffsetDB: req.CalibrationOffsetDB,
		RFProfile:           req.RFProfile,
	}
}

func effectiveInterferenceCellRFProfiles(req InterferenceRequest) []EffectiveCellRFProfile {
	profiles := make([]EffectiveCellRFProfile, 0, len(req.Towers))
	for index, tower := range req.Towers {
		profile := effectiveInterferenceTowerProfile(req, tower, index)
		profiles = append(profiles, EffectiveCellRFProfile{
			ID: tower.ID, TowerLon: tower.TowerLon, TowerLat: tower.TowerLat,
			AzimuthDeg: normalizeDegrees(tower.AzimuthDeg), RFProfile: profile,
		})
	}
	return profiles
}

func (profile CellRFProfile) LinkBudgetTerms(groundDistanceMeters, buildingLossDB, calibrationOffsetDB, horizontalOffsetDeg float64) RFLinkBudgetTerms {
	horizontalPatternDB := profile.HorizontalPatternAttenuationDB(horizontalOffsetDeg)
	verticalPatternDB := profile.VerticalPatternAttenuationDB(groundDistanceMeters)
	patternDB := horizontalPatternDB + verticalPatternDB
	eirpDBm := profile.TxPowerDBm + profile.AntennaGainDBi - profile.SystemLossDB + calibrationOffsetDB
	fsplDB := FreeSpacePathLossMetersGHz(profile.SlantDistanceMeters(groundDistanceMeters), profile.FrequencyGHz)
	return RFLinkBudgetTerms{
		TxPowerDBm:                     profile.TxPowerDBm,
		AntennaGainDBi:                 profile.AntennaGainDBi,
		SystemLossDB:                   profile.SystemLossDB,
		CalibrationOffsetDB:            calibrationOffsetDB,
		EIRPDBm:                        eirpDBm,
		FSPLDB:                         fsplDB,
		BuildingLossDB:                 buildingLossDB,
		HorizontalPatternAttenuationDB: horizontalPatternDB,
		VerticalPatternAttenuationDB:   verticalPatternDB,
		PatternAttenuationDB:           patternDB,
		ReceivedPowerDBm:               eirpDBm - fsplDB - buildingLossDB - patternDB,
	}
}
