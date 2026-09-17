package raytracer

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// Concept 4E is deliberately a separate analysis model. It reuses the
// deterministic Concept 4D outdoor UMa link as the facade baseline and adds
// only the standard O2I entry term for the explicitly requested target
// semantic: a representative facade point immediately inside the envelope.
const (
	BuildingEntryModelID         = "3gpp_tr_38_901_o2i"
	BuildingEntryModelReference  = "3GPP TR 38.901 V19.4.0, §7.4.3.1"
	BuildingEntryLowLossProfile  = "low_loss"
	BuildingEntryHighLossProfile = "high_loss"
	BuildingEntryUnknownProfile  = "unknown"
	BuildingEntryIndoorDepthM    = 0
	BuildingEntryHTTPRequests    = 1
	MaxBuildingEntryBuildingIDs  = 5000
)

const (
	buildingEntryCompatibilityFrequencyGHz = 6.0
	buildingEntryLowGlassInterceptDB       = 2.0
	buildingEntryLowGlassSlopeDBPerGHz     = 0.2
	buildingEntryIRRGlassInterceptDB       = 25.4
	buildingEntryIRRGlassSlopeDBPerGHz     = 0.11
	buildingEntryConcreteInterceptDB       = 5.0
	buildingEntryConcreteSlopeDBPerGHz     = 4.0
)

type BuildingEntryModelMetadata struct {
	ID                     string                     `json:"id"`
	Reference              string                     `json:"reference"`
	Scenario               string                     `json:"scenario"`
	Description            string                     `json:"description"`
	SupportedFrequencies   []float64                  `json:"supported_frequencies_ghz"`
	OutdoorBaselineModel   string                     `json:"outdoor_baseline_model"`
	OutdoorBaselineRule    string                     `json:"outdoor_baseline_rule"`
	IndoorDepthM           float64                    `json:"indoor_depth_m"`
	RandomDrawsUsed        bool                       `json:"random_draws_used"`
	MaterialEvidenceOnly   bool                       `json:"material_evidence_only"`
	NoWholeBuildingClaim   bool                       `json:"no_whole_building_claim"`
	ProfileSemantics       string                     `json:"profile_semantics"`
	UnsupportedFrequencies []float64                  `json:"unsupported_frequencies_ghz"`
	Profiles               []BuildingEntryLossProfile `json:"profiles"`
}

type BuildingEntryLossProfile struct {
	ID                       string  `json:"id"`
	Label                    string  `json:"label"`
	FrequencyScope           string  `json:"frequency_scope"`
	ExternalWallLossDB       float64 `json:"external_wall_loss_db"`
	IndoorDepthM             float64 `json:"indoor_depth_m"`
	IndoorLossDB             float64 `json:"indoor_loss_db"`
	MedianEntryLossDB        float64 `json:"median_entry_loss_db"`
	ShadowSigmaDB            float64 `json:"shadow_sigma_db"`
	ReferenceShadowSigmaDB   float64 `json:"reference_shadow_sigma_db"`
	ReferenceShadowSigmaNote string  `json:"reference_shadow_sigma_note"`
	RandomDrawApplied        bool    `json:"random_draw_applied"`
	Equation                 string  `json:"equation"`
	CompositionAssumption    string  `json:"composition_assumption"`
}

func BuildingEntryModelInfo(frequencyGHz float64) BuildingEntryModelMetadata {
	profiles := []BuildingEntryLossProfile{
		buildingEntryProfileMetadata(frequencyGHz, BuildingEntryLowLossProfile),
		buildingEntryProfileMetadata(frequencyGHz, BuildingEntryHighLossProfile),
	}
	return BuildingEntryModelMetadata{
		ID:                     BuildingEntryModelID,
		Reference:              BuildingEntryModelReference,
		Scenario:               "building-entry-just-inside-facade",
		Description:            "Deterministic median outdoor facade power plus 3GPP TR 38.901 O2I entry loss; not an indoor or whole-building coverage model",
		SupportedFrequencies:   []float64{2.6, 28},
		OutdoorBaselineModel:   UrbanShortRangePropagationID,
		OutdoorBaselineRule:    "Concept 4D 3GPP UMa LOS/NLOS to the representative facade point; outdoor wall events are not added as legacy wall loss",
		IndoorDepthM:           BuildingEntryIndoorDepthM,
		RandomDrawsUsed:        false,
		MaterialEvidenceOnly:   true,
		NoWholeBuildingClaim:   true,
		ProfileSemantics:       "low-loss and high-loss reference scenarios; both are retained when facade material evidence is not defensibly mapped",
		UnsupportedFrequencies: []float64{140},
		Profiles:               profiles,
	}
}

func buildingEntryProfileMetadata(frequencyGHz float64, profileID string) BuildingEntryLossProfile {
	loss, ok := BuildingEntryLossDB(frequencyGHz, profileID)
	if !ok {
		return BuildingEntryLossProfile{
			ID:                       profileID,
			Label:                    profileID,
			FrequencyScope:           "unsupported",
			IndoorDepthM:             BuildingEntryIndoorDepthM,
			ReferenceShadowSigmaNote: "reference sigma is not evaluated outside the supported frequency scope",
			RandomDrawApplied:        false,
			Equation:                 "unsupported outside the Concept 4E 2.6 GHz and 28 GHz scope",
			CompositionAssumption:    "not evaluated",
		}
	}
	if nearlyEqualFrequency(frequencyGHz, 2.6) {
		return BuildingEntryLossProfile{
			ID:                       profileID,
			Label:                    profileID,
			FrequencyScope:           "single_frequency_below_6_ghz_compatibility",
			ExternalWallLossDB:       loss,
			IndoorDepthM:             BuildingEntryIndoorDepthM,
			IndoorLossDB:             0,
			MedianEntryLossDB:        loss,
			ShadowSigmaDB:            0,
			ReferenceShadowSigmaDB:   7,
			ReferenceShadowSigmaNote: "TR 38.901 Table 7.4.3-3 compatibility values: 0 dB LOS, 7 dB NLOS; no random draw is sampled",
			RandomDrawApplied:        false,
			Equation:                 "PL_tw = 20 dB; PL_in = 0.5 * d_2D-in with d_2D-in = 0 m for Concept 4E",
			CompositionAssumption:    "TR 38.901 Table 7.4.3-3 backward-compatibility single-frequency value; low/high API scenarios are identical",
		}
	}
	return BuildingEntryLossProfile{
		ID:                       profileID,
		Label:                    profileID,
		FrequencyScope:           "o2i_low_high_profile",
		ExternalWallLossDB:       loss,
		IndoorDepthM:             BuildingEntryIndoorDepthM,
		IndoorLossDB:             0,
		MedianEntryLossDB:        loss,
		ShadowSigmaDB:            0,
		ReferenceShadowSigmaDB:   map[string]float64{BuildingEntryLowLossProfile: 4.4, BuildingEntryHighLossProfile: 6.5}[profileID],
		ReferenceShadowSigmaNote: "TR 38.901 Table 7.4.3-2 reference sigma; no random draw is sampled in Concept 4E",
		RandomDrawApplied:        false,
		Equation:                 "PL_tw = PL_npi - 10 log10(sum_i(p_i * 10^(-L_material_i/10))); PL_in = 0.5 * d_2D-in with d_2D-in = 0 m for Concept 4E",
		CompositionAssumption:    buildingEntryCompositionAssumption(profileID),
	}
}

func buildingEntryCompositionAssumption(profileID string) string {
	if profileID == BuildingEntryHighLossProfile {
		return "high-loss: PL_npi = 5 dB, p_IRR-glass = 0.7, p_concrete = 0.3"
	}
	return "low-loss: PL_npi = 5 dB, p_standard-glass = 0.3, p_concrete = 0.7"
}

// BuildingEntryLossDB returns the deterministic median entry term L_building
// for the selected standard profile. It intentionally excludes PL_b, the
// outdoor path loss, and excludes any random shadow-fading draw.
func BuildingEntryLossDB(frequencyGHz float64, profileID string) (float64, bool) {
	profileID = normalizeBuildingEntryProfile(profileID)
	if !nearlyEqualFrequency(frequencyGHz, 2.6) && !nearlyEqualFrequency(frequencyGHz, 28) {
		return 0, false
	}
	if profileID != BuildingEntryLowLossProfile && profileID != BuildingEntryHighLossProfile {
		return 0, false
	}
	if nearlyEqualFrequency(frequencyGHz, 2.6) {
		return 20, true
	}

	standardGlass := buildingEntryLowGlassInterceptDB + buildingEntryLowGlassSlopeDBPerGHz*frequencyGHz
	concrete := buildingEntryConcreteInterceptDB + buildingEntryConcreteSlopeDBPerGHz*frequencyGHz
	plNPI := 5.0
	glassLoss := standardGlass
	glassFraction := 0.3
	concreteFraction := 0.7
	if profileID == BuildingEntryHighLossProfile {
		glassLoss = buildingEntryIRRGlassInterceptDB + buildingEntryIRRGlassSlopeDBPerGHz*frequencyGHz
		glassFraction = 0.7
		concreteFraction = 0.3
	}
	transmission := glassFraction*math.Pow(10, -glassLoss/10) + concreteFraction*math.Pow(10, -concrete/10)
	if transmission <= 0 || math.IsNaN(transmission) || math.IsInf(transmission, 0) {
		return 0, false
	}
	return plNPI - 10*math.Log10(transmission), true
}

func normalizeBuildingEntryProfile(profileID string) string {
	switch strings.ToLower(strings.TrimSpace(profileID)) {
	case "low", "low-loss", "low_loss":
		return BuildingEntryLowLossProfile
	case "high", "high-loss", "high_loss":
		return BuildingEntryHighLossProfile
	default:
		return strings.ToLower(strings.TrimSpace(profileID))
	}
}

func nearlyEqualFrequency(a, b float64) bool {
	return math.Abs(a-b) <= 1e-6
}

type BuildingEntryAnalysisRequestInput struct {
	NetworkOptimizationRequestInput
	BuildingIDs     []string `json:"building_ids"`
	ResidentialOnly bool     `json:"residential_only"`
}

type BuildingEntryAnalysisRequest struct {
	Network         NetworkOptimizationRequest `json:"network"`
	BuildingIDs     []string                   `json:"building_ids,omitempty"`
	ResidentialOnly bool                       `json:"residential_only,omitempty"`
}

func (input BuildingEntryAnalysisRequestInput) ToRequest() BuildingEntryAnalysisRequest {
	ids := make([]string, 0, len(input.BuildingIDs))
	seen := make(map[string]struct{}, len(input.BuildingIDs))
	for _, rawID := range input.BuildingIDs {
		id := strings.TrimSpace(rawID)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return BuildingEntryAnalysisRequest{
		Network:         input.NetworkOptimizationRequestInput.ToRequest(),
		BuildingIDs:     ids,
		ResidentialOnly: input.ResidentialOnly,
	}
}

func ValidateBuildingEntryAnalysisRequest(req BuildingEntryAnalysisRequest) string {
	if len(req.Network.Towers) < 1 || len(req.Network.Towers) > MaxNetworkTowers {
		return fmt.Sprintf("towers must contain between 1 and %d selected towers", MaxNetworkTowers)
	}
	if len(req.BuildingIDs) > MaxBuildingEntryBuildingIDs {
		return fmt.Sprintf("building_ids must contain at most %d ids", MaxBuildingEntryBuildingIDs)
	}
	if req.RFNetworkFrequency() <= 0 {
		return "frequency_ghz must be positive"
	}
	if req.Network.FrequencyGHz > MaxFrequencyGHz || math.IsNaN(req.Network.FrequencyGHz) || math.IsInf(req.Network.FrequencyGHz, 0) {
		return "frequency_ghz must be between 0 and 300"
	}
	if req.Network.RadiusMeters < MinRadiusMeters || req.Network.RadiusMeters > MaxRadiusMeters {
		return "radius_m must be between 25 and 5000"
	}
	if req.Network.TxPowerDBm < MinTxPowerDBm || req.Network.TxPowerDBm > MaxTxPowerDBm {
		return "tx_power_dbm must be between 0 and 60"
	}
	if req.Network.BeamWidthDeg < MinBeamWidthDeg || req.Network.BeamWidthDeg > MaxBeamWidthDeg {
		return "beam_width must be between 10 and 360"
	}
	if req.Network.CalibrationOffsetDB < MinCalibrationOffsetDB || req.Network.CalibrationOffsetDB > MaxCalibrationOffsetDB {
		return "calibration_offset_db must be between -40 and 40"
	}
	seenIDs := make(map[string]struct{}, len(req.Network.Towers))
	for _, tower := range req.Network.Towers {
		if validationError := ValidateTowerID(tower.ID); validationError != "" {
			return validationError
		}
		if _, exists := seenIDs[tower.ID]; exists {
			return "tower ids must be unique"
		}
		seenIDs[tower.ID] = struct{}{}
		if tower.TowerLon < MinLongitude || tower.TowerLon > MaxLongitude || tower.TowerLat < MinLatitude || tower.TowerLat > MaxLatitude {
			return "each tower must include valid tower_lon and tower_lat coordinates"
		}
		profile := tower.RFProfile
		if profile.SchemaVersion == 0 {
			profile = req.Network.RFProfile
		}
		if validationError := ValidateCellRFProfile(profile, false); validationError != "" {
			return fmt.Sprintf("tower %q: %s", tower.ID, validationError)
		}
		if !nearlyEqualFrequency(profile.FrequencyGHz, req.Network.FrequencyGHz) {
			return fmt.Sprintf("tower %q: rf_profile.frequency_ghz must match the request frequency", tower.ID)
		}
		if isBuildingEntryFrequency(req.Network.FrequencyGHz) && !isBuildingEntryFrequency(profile.FrequencyGHz) {
			return fmt.Sprintf("tower %q: building-entry analysis supports only 2.6 GHz and 28 GHz", tower.ID)
		}
		if isBuildingEntryFrequency(profile.FrequencyGHz) && profile.PropagationModelID != UrbanShortRangePropagationID {
			return fmt.Sprintf("tower %q: building-entry analysis requires the urban_short_range outdoor baseline", tower.ID)
		}
	}
	return ""
}

func (req BuildingEntryAnalysisRequest) RFNetworkFrequency() float64 {
	return req.Network.FrequencyGHz
}

func isBuildingEntryFrequency(frequencyGHz float64) bool {
	return nearlyEqualFrequency(frequencyGHz, 2.6) || nearlyEqualFrequency(frequencyGHz, 28)
}

type BuildingEntryApplicability struct {
	Applicable  bool     `json:"applicable"`
	Reason      string   `json:"reason"`
	Detail      string   `json:"detail,omitempty"`
	Limitations []string `json:"limitations,omitempty"`
}

type BuildingEntryMaterialEvidence struct {
	Available      bool   `json:"available"`
	Source         string `json:"source"`
	Tag            string `json:"tag,omitempty"`
	Value          string `json:"value,omitempty"`
	Normalized     string `json:"normalized,omitempty"`
	UsedForProfile bool   `json:"used_for_profile"`
	Interpretation string `json:"interpretation"`
}

type BuildingEntryGeometry struct {
	RepresentativePointSource string  `json:"representative_point_source"`
	FacadeEntryPointSource    string  `json:"facade_entry_point_source"`
	IndoorDepthM              float64 `json:"indoor_depth_m"`
	GeometryRule              string  `json:"geometry_rule"`
}

type BuildingEntryEstimate struct {
	BuildingID                  string                        `json:"building_id"`
	BuildingType                string                        `json:"building_type,omitempty"`
	Residential                 bool                          `json:"residential"`
	DemandWeight                float64                       `json:"demand_weight,omitempty"`
	ResidentialDemand           float64                       `json:"residential_demand,omitempty"`
	RepresentativePoint         *Point                        `json:"representative_point,omitempty"`
	FacadeEntryPoint            *Point                        `json:"facade_entry_point,omitempty"`
	ServingCellID               string                        `json:"serving_cell_id,omitempty"`
	FrequencyGHz                float64                       `json:"frequency_ghz,omitempty"`
	PropagationModel            string                        `json:"propagation_model,omitempty"`
	OutdoorLOSState             string                        `json:"outdoor_los_state,omitempty"`
	OutdoorDistanceM            float64                       `json:"outdoor_distance_m,omitempty"`
	OutdoorRxAtFacadeDBm        *float64                      `json:"outdoor_rx_at_facade_dbm,omitempty"`
	OutdoorPathLossDB           *float64                      `json:"outdoor_path_loss_db,omitempty"`
	OutdoorWallLossDB           float64                       `json:"outdoor_wall_loss_db"`
	OutdoorServiceable          bool                          `json:"outdoor_serviceable"`
	LowLossEntryLossDB          *float64                      `json:"low_loss_entry_loss_db,omitempty"`
	LowLossRxJustInsideDBm      *float64                      `json:"low_loss_rx_just_inside_dbm,omitempty"`
	LowLossServiceable          *bool                         `json:"low_loss_serviceable,omitempty"`
	HighLossEntryLossDB         *float64                      `json:"high_loss_entry_loss_db,omitempty"`
	HighLossRxJustInsideDBm     *float64                      `json:"high_loss_rx_just_inside_dbm,omitempty"`
	HighLossServiceable         *bool                         `json:"high_loss_serviceable,omitempty"`
	ReceiverSensitivityDBm      *float64                      `json:"receiver_sensitivity_dbm,omitempty"`
	BuildingServiceThresholdDBm float64                       `json:"building_service_threshold_dbm"`
	MaterialEvidence            BuildingEntryMaterialEvidence `json:"material_evidence"`
	SelectedEntryProfile        string                        `json:"selected_entry_profile"`
	Applicability               BuildingEntryApplicability    `json:"applicability"`
	EntryGeometry               BuildingEntryGeometry         `json:"entry_geometry"`
	Limitations                 []string                      `json:"limitations"`
}

type BuildingEntryCellSummary struct {
	CellID              string `json:"cell_id"`
	CandidateBuildings  int    `json:"candidate_buildings"`
	EvaluatedLinks      int    `json:"evaluated_links"`
	ServingBuildings    int    `json:"serving_buildings"`
	LowLossServiceable  int    `json:"low_loss_serviceable"`
	HighLossServiceable int    `json:"high_loss_serviceable"`
}

type BuildingEntryAnalysisSummary struct {
	RelevantBuildings              int                `json:"relevant_buildings"`
	RelevantResidentialBuildings   int                `json:"relevant_residential_buildings"`
	RelevantDemandBuildings        int                `json:"relevant_demand_buildings"`
	EvaluatedBuildings             int                `json:"evaluated_buildings"`
	BuildingsWithServingCell       int                `json:"buildings_with_serving_cell"`
	OutdoorServiceableBuildings    int                `json:"outdoor_serviceable_buildings"`
	LowLossServiceableBuildings    int                `json:"low_loss_serviceable_buildings"`
	HighLossServiceableBuildings   int                `json:"high_loss_serviceable_buildings"`
	LowLossServiceableResidential  int                `json:"low_loss_serviceable_residential"`
	HighLossServiceableResidential int                `json:"high_loss_serviceable_residential"`
	TotalDemandWeight              float64            `json:"total_demand_weight"`
	LowLossServedDemandWeight      float64            `json:"low_loss_served_demand_weight"`
	HighLossServedDemandWeight     float64            `json:"high_loss_served_demand_weight"`
	MaterialKnownBuildings         int                `json:"material_known_buildings"`
	MaterialUnknownBuildings       int                `json:"material_unknown_buildings"`
	MaterialMetadataCoveragePct    float64            `json:"material_metadata_coverage_pct"`
	MaterialTagCoveragePct         map[string]float64 `json:"material_tag_coverage_pct"`
	MaterialCategories             map[string]int     `json:"material_categories"`
	UnsupportedBuildings           int                `json:"unsupported_buildings"`
	InvalidGeometryBuildings       int                `json:"invalid_geometry_buildings"`
	CandidateCellLinkEvaluations   int                `json:"candidate_cell_link_evaluations"`
	BuildingServiceThresholdDBm    float64            `json:"building_service_threshold_dbm"`
	ReceiverSensitivityRule        string             `json:"receiver_sensitivity_rule"`
}

type BuildingEntryAnalysisDiagnostics struct {
	HTTPRequestsRequired int      `json:"http_requests_required"`
	BuildingsEvaluated   int      `json:"buildings_evaluated"`
	CandidateCellLinks   int      `json:"candidate_cell_links"`
	ElapsedMilliseconds  float64  `json:"elapsed_ms"`
	SelectionRule        string   `json:"selection_rule"`
	CacheKeyInputs       []string `json:"cache_key_inputs"`
}

type BuildingEntryAnalysisResponse struct {
	Model                 BuildingEntryModelMetadata       `json:"model"`
	Applicability         BuildingEntryApplicability       `json:"applicability"`
	Summary               BuildingEntryAnalysisSummary     `json:"summary"`
	Results               []BuildingEntryEstimate          `json:"results"`
	CellSummaries         []BuildingEntryCellSummary       `json:"cell_summaries"`
	EffectiveCellProfiles []EffectiveCellRFProfile         `json:"effective_cell_profiles"`
	Diagnostics           BuildingEntryAnalysisDiagnostics `json:"diagnostics"`
	RFContract            RFContractMetadata               `json:"rf_contract"`
}

func AnalyzeBuildingEntryContext(ctx context.Context, req BuildingEntryAnalysisRequest, buildings *BuildingIndex) (BuildingEntryAnalysisResponse, error) {
	started := time.Now()
	req.Network = normalizeBuildingEntryNetworkRequest(req.Network)
	response := BuildingEntryAnalysisResponse{
		Model:         BuildingEntryModelInfo(req.Network.FrequencyGHz),
		Results:       []BuildingEntryEstimate{},
		CellSummaries: []BuildingEntryCellSummary{},
		Diagnostics: BuildingEntryAnalysisDiagnostics{
			HTTPRequestsRequired: BuildingEntryHTTPRequests,
			SelectionRule:        "strongest low-loss just-inside received power among eligible cells; ties resolve by ascending cell id",
			CacheKeyInputs:       []string{"effective cell RF profiles", "tower coordinates", "azimuths", "building dataset revision", "building filters"},
		},
	}
	if len(req.Network.Towers) > 0 {
		response.RFContract = rfContractForProfile(&req.Network.Towers[0].RFProfile, req.Network.CalibrationOffsetDB)
	}
	response.Applicability = buildingEntryRequestApplicability(req, buildings)
	if !response.Applicability.Applicable {
		response.Diagnostics.ElapsedMilliseconds = elapsedMilliseconds(started)
		return response, nil
	}

	towers := append([]NetworkTowerRequest(nil), req.Network.Towers...)
	sort.SliceStable(towers, func(i, j int) bool { return towers[i].ID < towers[j].ID })
	response.EffectiveCellProfiles = make([]EffectiveCellRFProfile, 0, len(towers))
	cellSummaries := make(map[string]*BuildingEntryCellSummary, len(towers))
	for _, tower := range towers {
		response.EffectiveCellProfiles = append(response.EffectiveCellProfiles, EffectiveCellRFProfile{
			ID: tower.ID, TowerLon: tower.TowerLon, TowerLat: tower.TowerLat,
			AzimuthDeg: tower.AzimuthDeg, RFProfile: tower.RFProfile,
		})
		cellSummaries[tower.ID] = &BuildingEntryCellSummary{CellID: tower.ID}
	}

	targets := selectBuildingEntryTargets(ctx, req, buildings, towers)
	response.Summary.RelevantBuildings = len(targets)
	response.Diagnostics.BuildingsEvaluated = len(targets)
	response.Summary.MaterialTagCoveragePct = make(map[string]float64)
	response.Summary.MaterialCategories = make(map[string]int)
	response.Results = make([]BuildingEntryEstimate, 0, len(targets))
	for index, building := range targets {
		if index%64 == 0 {
			if err := ctx.Err(); err != nil {
				return BuildingEntryAnalysisResponse{}, err
			}
		}
		result, metrics := analyzeBuildingEntryBuilding(ctx, req, building, towers, buildings, cellSummaries)
		response.Results = append(response.Results, result)
		response.Diagnostics.CandidateCellLinks += metrics.candidateLinks
		response.Summary.CandidateCellLinkEvaluations += metrics.candidateLinks
		response.Summary.RelevantResidentialBuildings += boolToInt(result.Residential)
		response.Summary.RelevantDemandBuildings += boolToInt(building.DemandWeight > 0)
		response.Summary.TotalDemandWeight += building.DemandWeight
		response.Summary.MaterialKnownBuildings += boolToInt(result.MaterialEvidence.Available)
		response.Summary.MaterialUnknownBuildings += boolToInt(!result.MaterialEvidence.Available)
		materialTag := result.MaterialEvidence.Tag
		if materialTag != "" {
			response.Summary.MaterialTagCoveragePct[materialTag]++
		}
		category := result.MaterialEvidence.Normalized
		if category == "" {
			category = "unknown"
		}
		response.Summary.MaterialCategories[category]++
		if result.Applicability.Applicable {
			response.Summary.EvaluatedBuildings++
			if result.ServingCellID != "" {
				response.Summary.BuildingsWithServingCell++
			}
			response.Summary.OutdoorServiceableBuildings += boolToInt(result.OutdoorServiceable)
			lowServiceable := result.LowLossServiceable != nil && *result.LowLossServiceable
			highServiceable := result.HighLossServiceable != nil && *result.HighLossServiceable
			response.Summary.LowLossServiceableBuildings += boolToInt(lowServiceable)
			response.Summary.HighLossServiceableBuildings += boolToInt(highServiceable)
			if result.Residential {
				response.Summary.LowLossServiceableResidential += boolToInt(lowServiceable)
				response.Summary.HighLossServiceableResidential += boolToInt(highServiceable)
			}
			if lowServiceable {
				response.Summary.LowLossServedDemandWeight += building.DemandWeight
			}
			if highServiceable {
				response.Summary.HighLossServedDemandWeight += building.DemandWeight
			}
		} else {
			response.Summary.UnsupportedBuildings += boolToInt(result.Applicability.Reason != "invalid_geometry")
			response.Summary.InvalidGeometryBuildings += boolToInt(result.Applicability.Reason == "invalid_geometry")
		}
	}
	if response.Summary.RelevantBuildings > 0 {
		response.Summary.MaterialMetadataCoveragePct = roundFloat(float64(response.Summary.MaterialKnownBuildings)/float64(response.Summary.RelevantBuildings)*100, 2)
		for tag, count := range response.Summary.MaterialTagCoveragePct {
			response.Summary.MaterialTagCoveragePct[tag] = roundFloat(count/float64(response.Summary.RelevantBuildings)*100, 2)
		}
	}
	response.CellSummaries = make([]BuildingEntryCellSummary, 0, len(towers))
	for _, tower := range towers {
		response.CellSummaries = append(response.CellSummaries, *cellSummaries[tower.ID])
	}
	response.Diagnostics.ElapsedMilliseconds = elapsedMilliseconds(started)
	return response, nil
}

func normalizeBuildingEntryNetworkRequest(req NetworkOptimizationRequest) NetworkOptimizationRequest {
	if req.FrequencyGHz == 0 {
		req.FrequencyGHz = DefaultFrequencyGHz
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = DefaultRadiusMeters
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = DefaultTxPowerDBm
	}
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = DefaultBeamWidthDeg
	}
	if req.RFProfile.SchemaVersion == 0 {
		req.RFProfile = DefaultPlanningCellRFProfile(NetworkTechnologyForFrequency(req.FrequencyGHz), req.FrequencyGHz, req.TxPowerDBm, req.RadiusMeters, req.BeamWidthDeg, 0, 0, 0)
	} else {
		req.RFProfile = req.RFProfile.normalized()
	}
	for index := range req.Towers {
		if req.Towers[index].RFProfile.SchemaVersion == 0 {
			req.Towers[index].RFProfile = req.RFProfile
		} else {
			req.Towers[index].RFProfile = req.Towers[index].RFProfile.normalized()
		}
		if req.Towers[index].RFProfile.PropagationModelID == "" {
			req.Towers[index].RFProfile.PropagationModelID = UrbanShortRangePropagationID
		}
		req.Towers[index].AzimuthDeg = normalizeDegrees(req.Towers[index].AzimuthDeg)
	}
	return req
}

func buildingEntryRequestApplicability(req BuildingEntryAnalysisRequest, buildings *BuildingIndex) BuildingEntryApplicability {
	if !isBuildingEntryFrequency(req.Network.FrequencyGHz) {
		return BuildingEntryApplicability{
			Reason:      "unsupported_frequency",
			Detail:      "Concept 4E is implemented only for 2.6 GHz and 28 GHz; 140 GHz remains the research_sub_thz profile and is not silently converted",
			Limitations: []string{"no building-entry estimate is produced for this frequency"},
		}
	}
	for _, tower := range req.Network.Towers {
		if tower.RFProfile.PropagationModelID != UrbanShortRangePropagationID {
			return BuildingEntryApplicability{
				Reason:      "unsupported_propagation_model",
				Detail:      "Concept 4E requires the Concept 4D urban_short_range outdoor baseline",
				Limitations: []string{"legacy wall-event loss is not reused for building entry"},
			}
		}
	}
	if buildings == nil || buildings.Len() == 0 {
		return BuildingEntryApplicability{
			Reason: "building_data_unavailable",
			Detail: "a loaded footprint dataset is required to derive a representative facade and outdoor LOS/NLOS state",
		}
	}
	return BuildingEntryApplicability{
		Applicable: true,
		Reason:     RFReferenceReasonApplicable,
		Detail:     "outdoor UMa facade baseline plus deterministic median O2I entry loss at zero indoor depth",
		Limitations: []string{
			"representative facade point only",
			"receiver height is the configured per-cell height; no floor, room, interior-wall, or whole-building claim",
			"low-loss and high-loss values are scenarios, not a confidence interval",
		},
	}
}

func selectBuildingEntryTargets(ctx context.Context, req BuildingEntryAnalysisRequest, buildings *BuildingIndex, towers []NetworkTowerRequest) []*BuildingFootprint {
	if buildings == nil {
		return nil
	}
	idFilter := make(map[string]struct{}, len(req.BuildingIDs))
	for _, id := range req.BuildingIDs {
		idFilter[id] = struct{}{}
	}
	filtered := len(idFilter) > 0
	maxRadius := 0.0
	for _, tower := range towers {
		maxRadius = math.Max(maxRadius, tower.RFProfile.RadiusMeters)
	}
	candidates := make([]*BuildingFootprint, 0)
	for _, building := range buildings.Footprints() {
		if building == nil || building.ID == "" {
			continue
		}
		if filtered {
			if _, exists := idFilter[building.ID]; !exists {
				continue
			}
		} else {
			representative, _, ok := representativeBuildingPoint(building)
			if !ok || !withinAnyBuildingEntryRadius(representative, towers, maxRadius) {
				continue
			}
		}
		if req.ResidentialOnly && building.ResidentialDemand <= 0 && !buildingLooksResidential(building) {
			continue
		}
		if err := ctx.Err(); err != nil {
			return candidates
		}
		candidates = append(candidates, building)
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].ID < candidates[j].ID })
	return candidates
}

func withinAnyBuildingEntryRadius(point Point, towers []NetworkTowerRequest, fallbackRadius float64) bool {
	for _, tower := range towers {
		radius := tower.RFProfile.RadiusMeters
		if radius <= 0 {
			radius = fallbackRadius
		}
		if ApproxDistanceMeters(Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, point) <= radius+0.01 {
			return true
		}
	}
	return false
}

type buildingEntryMetrics struct {
	candidateLinks int
}

type buildingEntryCandidate struct {
	tower              NetworkTowerRequest
	entryPoint         Point
	facadeDistanceM    float64
	outdoorLOS         PropagationLOSState
	outdoorResult      PropagationResult
	lowLossDB          float64
	highLossDB         float64
	lowRxDBm           float64
	highRxDBm          float64
	lowServiceable     bool
	highServiceable    bool
	outdoorServiceable bool
}

func analyzeBuildingEntryBuilding(ctx context.Context, req BuildingEntryAnalysisRequest, building *BuildingFootprint, towers []NetworkTowerRequest, buildings *BuildingIndex, cellSummaries map[string]*BuildingEntryCellSummary) (BuildingEntryEstimate, buildingEntryMetrics) {
	representative, representativeSource, representativeOK := representativeBuildingPoint(building)
	evidence := buildingEntryMaterialEvidence(building)
	result := BuildingEntryEstimate{
		BuildingID:                  building.ID,
		BuildingType:                buildingType(building),
		Residential:                 building.ResidentialDemand > 0 || buildingLooksResidential(building),
		DemandWeight:                building.DemandWeight,
		ResidentialDemand:           building.ResidentialDemand,
		BuildingServiceThresholdDBm: BuildingServiceThresholdDBm,
		MaterialEvidence:            evidence,
		SelectedEntryProfile:        BuildingEntryUnknownProfile,
		EntryGeometry: BuildingEntryGeometry{
			RepresentativePointSource: representativeSource,
			FacadeEntryPointSource:    "first crossing into the target footprint along the cell-to-representative-point segment",
			IndoorDepthM:              BuildingEntryIndoorDepthM,
			GeometryRule:              "2D outer footprint only; holes are not represented by the dataset loader; no interior route is claimed",
		},
		Limitations: []string{
			"estimated building-entry service at one representative facade point",
			"not indoor room, floor, apartment, or whole-building coverage",
			"material evidence is informational and does not select a loss profile",
		},
	}
	if representativeOK {
		result.RepresentativePoint = &representative
	}
	if !representativeOK {
		result.Applicability = BuildingEntryApplicability{
			Reason:      "invalid_geometry",
			Detail:      "footprint has no deterministic interior representative point",
			Limitations: []string{"malformed, degenerate, or unsupported footprint geometry"},
		}
		return result, buildingEntryMetrics{}
	}

	var best *buildingEntryCandidate
	metrics := buildingEntryMetrics{}
	for _, tower := range towers {
		if err := ctx.Err(); err != nil {
			return result, metrics
		}
		profile := tower.RFProfile
		towerPoint := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		if PointInPolygon(towerPoint, building.Vertices) || pointOnPolygonBoundary(towerPoint, building.Vertices) {
			continue
		}
		distanceToRepresentative := ApproxDistanceMeters(towerPoint, representative)
		if distanceToRepresentative > profile.RadiusMeters+0.01 {
			continue
		}
		bearing := BearingDegrees(towerPoint, representative)
		effectiveAzimuth := profile.EffectiveAzimuth(tower.AzimuthDeg)
		if !AngleInBeam(bearing, effectiveAzimuth, profile.EffectiveBeamWidthDeg()) {
			continue
		}
		entryPoint, entryDistance, entryOK := facadeEntryPoint(towerPoint, representative, building.Vertices)
		if !entryOK || entryDistance < 0.5 {
			continue
		}
		metrics.candidateLinks++
		if summary := cellSummaries[tower.ID]; summary != nil {
			summary.CandidateBuildings++
		}
		losState := buildingEntryOutdoorLOS(ctx, towerPoint, entryPoint, building.ID, buildings)
		linkContext := PropagationLinkContext{
			Profile:               profile,
			GroundDistanceM:       entryDistance,
			HorizontalOffsetDeg:   signedBearingOffset(bearing, effectiveAzimuth),
			CalibrationOffsetDB:   req.Network.CalibrationOffsetDB,
			LOSState:              losState,
			EndpointCase:          PropagationEndpointOutdoorO2O,
			BuildingDataAvailable: true,
			WallEventCount:        0,
		}
		baseline, applicable := evaluateBuildingEntryOutdoorBaseline(linkContext)
		if !applicable.Applicable {
			continue
		}
		lowLoss, lowOK := BuildingEntryLossDB(profile.FrequencyGHz, BuildingEntryLowLossProfile)
		highLoss, highOK := BuildingEntryLossDB(profile.FrequencyGHz, BuildingEntryHighLossProfile)
		if !lowOK || !highOK {
			continue
		}
		candidate := &buildingEntryCandidate{
			tower:              tower,
			entryPoint:         entryPoint,
			facadeDistanceM:    entryDistance,
			outdoorLOS:         losState,
			outdoorResult:      baseline,
			lowLossDB:          lowLoss,
			highLossDB:         highLoss,
			lowRxDBm:           baseline.ReceivedPowerDBm - lowLoss,
			highRxDBm:          baseline.ReceivedPowerDBm - highLoss,
			lowServiceable:     baseline.ReceivedPowerDBm-lowLoss > profile.ReceiverSensitivityDBm,
			highServiceable:    baseline.ReceivedPowerDBm-highLoss > profile.ReceiverSensitivityDBm,
			outdoorServiceable: baseline.ReceivedPowerDBm > BuildingServiceThresholdDBm,
		}
		if best == nil || candidateBetter(candidate, best) {
			best = candidate
		}
	}
	if best == nil {
		result.Applicability = BuildingEntryApplicability{
			Reason:      "no_eligible_serving_cell",
			Detail:      "no selected cell had a valid outdoor baseline path to a representative facade point within radius and beam",
			Limitations: []string{"building may be outside the selected cells' effective geometry or require a different cell selection"},
		}
		return result, metrics
	}

	result.ServingCellID = best.tower.ID
	result.FrequencyGHz = best.tower.RFProfile.FrequencyGHz
	result.PropagationModel = UrbanShortRangePropagationID
	result.OutdoorLOSState = string(best.outdoorLOS)
	result.OutdoorDistanceM = roundFloat(best.facadeDistanceM, 3)
	result.OutdoorRxAtFacadeDBm = floatPointer(roundFloat(best.outdoorResult.ReceivedPowerDBm, 3))
	result.OutdoorPathLossDB = floatPointer(roundFloat(best.outdoorResult.TotalPathLossDB, 3))
	result.OutdoorWallLossDB = 0
	result.OutdoorServiceable = best.outdoorServiceable
	result.FacadeEntryPoint = &best.entryPoint
	result.LowLossEntryLossDB = floatPointer(roundFloat(best.lowLossDB, 3))
	result.LowLossRxJustInsideDBm = floatPointer(roundFloat(best.lowRxDBm, 3))
	result.LowLossServiceable = boolPointer(best.lowServiceable)
	result.HighLossEntryLossDB = floatPointer(roundFloat(best.highLossDB, 3))
	result.HighLossRxJustInsideDBm = floatPointer(roundFloat(best.highRxDBm, 3))
	result.HighLossServiceable = boolPointer(best.highServiceable)
	result.ReceiverSensitivityDBm = floatPointer(roundFloat(best.tower.RFProfile.ReceiverSensitivityDBm, 3))
	result.Applicability = BuildingEntryApplicability{
		Applicable:  true,
		Reason:      RFReferenceReasonApplicable,
		Detail:      "representative facade entry estimate at zero indoor depth",
		Limitations: result.Limitations,
	}
	if summary := cellSummaries[best.tower.ID]; summary != nil {
		summary.EvaluatedLinks++
		summary.ServingBuildings++
		summary.LowLossServiceable += boolToInt(best.lowServiceable)
		summary.HighLossServiceable += boolToInt(best.highServiceable)
	}
	return result, metrics
}

func candidateBetter(candidate, current *buildingEntryCandidate) bool {
	if candidate.lowRxDBm != current.lowRxDBm {
		return candidate.lowRxDBm > current.lowRxDBm
	}
	return candidate.tower.ID < current.tower.ID
}

func evaluateBuildingEntryOutdoorBaseline(ctx PropagationLinkContext) (PropagationResult, PropagationApplicability) {
	model, ok := PropagationModelByID(UrbanShortRangePropagationID)
	if !ok {
		return PropagationResult{}, PropagationApplicability{Reason: PropagationModelUnsupported}
	}
	applicability := model.Applicability(ctx)
	if !applicability.Applicable {
		return PropagationResult{}, applicability
	}
	result := model.Evaluate(ctx)
	result.ModelID = UrbanShortRangePropagationID
	result.AppliedModelID = UrbanShortRangePropagationID
	result.ModelDescription = model.Description()
	result.Applicable = true
	result.ApplicabilityReason = applicability.Reason
	result.ApplicabilityDetail = applicability.Detail
	return result, applicability
}

func buildingEntryOutdoorLOS(ctx context.Context, origin, facade Point, targetID string, buildings *BuildingIndex) PropagationLOSState {
	if buildings == nil || buildings.Len() == 0 {
		return PropagationLOSState(PropagationLOSUnknown)
	}
	targetDistance := ApproxDistanceMeters(origin, facade)
	for index, candidate := range buildings.SearchRay(origin, facade) {
		if index%32 == 0 && ctx.Err() != nil {
			return PropagationLOSState(PropagationLOSUnknown)
		}
		if candidate == nil || candidate.ID == targetID || len(candidate.Vertices) < 3 {
			continue
		}
		if PointInPolygon(origin, candidate.Vertices) {
			return PropagationLOSState(PropagationNLOS)
		}
		for _, intersection := range SegmentPolygonIntersections(origin, facade, candidate.Vertices) {
			distance := ApproxDistanceMeters(origin, intersection)
			if distance <= 0.5 || distance >= targetDistance-0.5 {
				continue
			}
			before := interpolateSegmentPoint(origin, facade, math.Max(0, distance-0.2)/targetDistance)
			after := interpolateSegmentPoint(origin, facade, math.Min(targetDistance, distance+0.2)/targetDistance)
			if !PointInPolygon(before, candidate.Vertices) && PointInPolygon(after, candidate.Vertices) {
				return PropagationLOSState(PropagationNLOS)
			}
		}
	}
	return PropagationLOSState(PropagationLOS)
}

func representativeBuildingPoint(building *BuildingFootprint) (Point, string, bool) {
	if building == nil || len(building.Vertices) < 3 || !building.Bounds.Valid() {
		return Point{}, "invalid", false
	}
	if centroid, ok := PolygonCentroid(building.Vertices); ok && PointInPolygon(centroid, building.Vertices) {
		return centroid, "polygon_centroid", true
	}
	if average, ok := averagePoint(building.Vertices); ok && PointInPolygon(average, building.Vertices) {
		return average, "vertex_average", true
	}
	for row := 1; row <= 15; row++ {
		latFraction := float64(row) / 16
		for column := 1; column <= 15; column++ {
			lonFraction := float64(column) / 16
			candidate := Point{
				Lon: building.Bounds.MinLon + (building.Bounds.MaxLon-building.Bounds.MinLon)*lonFraction,
				Lat: building.Bounds.MinLat + (building.Bounds.MaxLat-building.Bounds.MinLat)*latFraction,
			}
			if PointInPolygon(candidate, building.Vertices) {
				return candidate, "deterministic_interior_grid", true
			}
		}
	}
	return Point{}, "invalid", false
}

func facadeEntryPoint(origin, representative Point, polygon []Point) (Point, float64, bool) {
	if len(polygon) < 3 || PointInPolygon(origin, polygon) || pointOnPolygonBoundary(origin, polygon) || !PointInPolygon(representative, polygon) || pointOnPolygonBoundary(representative, polygon) {
		return Point{}, 0, false
	}
	totalDistance := ApproxDistanceMeters(origin, representative)
	if totalDistance <= 0 {
		return Point{}, 0, false
	}
	intersections := SegmentPolygonIntersections(origin, representative, polygon)
	type candidateIntersection struct {
		point    Point
		distance float64
	}
	candidates := make([]candidateIntersection, 0, len(intersections))
	for _, point := range intersections {
		distance := ApproxDistanceMeters(origin, point)
		if distance <= 0.5 || distance >= totalDistance {
			continue
		}
		before := interpolateSegmentPoint(origin, representative, math.Max(0, distance-0.2)/totalDistance)
		after := interpolateSegmentPoint(origin, representative, math.Min(totalDistance, distance+0.2)/totalDistance)
		if !PointInPolygon(before, polygon) && PointInPolygon(after, polygon) {
			candidates = append(candidates, candidateIntersection{point: point, distance: distance})
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].distance < candidates[j].distance })
	if len(candidates) > 0 {
		return candidates[0].point, candidates[0].distance, true
	}
	// A binary-search fallback handles a very short or numerically borderline
	// edge while retaining the same first-entry semantics.
	if !PointInPolygon(representative, polygon) {
		return Point{}, 0, false
	}
	low, high := 0.0, 1.0
	for iteration := 0; iteration < 48; iteration++ {
		mid := (low + high) / 2
		if PointInPolygon(interpolateSegmentPoint(origin, representative, mid), polygon) {
			high = mid
		} else {
			low = mid
		}
	}
	point := interpolateSegmentPoint(origin, representative, high)
	return point, totalDistance * high, true
}

func interpolateSegmentPoint(origin, target Point, fraction float64) Point {
	fraction = math.Max(0, math.Min(1, fraction))
	return Point{
		Lon: origin.Lon + (target.Lon-origin.Lon)*fraction,
		Lat: origin.Lat + (target.Lat-origin.Lat)*fraction,
	}
}

func buildingEntryMaterialEvidence(building *BuildingFootprint) BuildingEntryMaterialEvidence {
	if building == nil {
		return BuildingEntryMaterialEvidence{Source: "unavailable", Interpretation: "no building record"}
	}
	for _, tag := range []string{"building:material", "facade:material", "material", "roof:material"} {
		value := strings.TrimSpace(building.Tags[tag])
		if meaningfulTagValue(value) {
			normalized := strings.TrimSpace(strings.ToLower(building.Material))
			if normalized == "" {
				normalized = "unknown"
			}
			return BuildingEntryMaterialEvidence{
				Available:      true,
				Source:         "OSM",
				Tag:            tag,
				Value:          value,
				Normalized:     normalized,
				UsedForProfile: false,
				Interpretation: "optional raw metadata evidence only; no automatic low/high profile selection",
			}
		}
	}
	return BuildingEntryMaterialEvidence{
		Source:         "unavailable",
		Normalized:     "unknown",
		UsedForProfile: false,
		Interpretation: "no usable material tag was present; both standardized scenarios are retained",
	}
}

func buildingType(building *BuildingFootprint) string {
	if building == nil {
		return "unknown"
	}
	for _, key := range []string{"building", "building:type", "amenity", "shop", "office"} {
		if value := strings.TrimSpace(building.Tags[key]); meaningfulTagValue(value) {
			return value
		}
	}
	return "unknown"
}

func buildingLooksResidential(building *BuildingFootprint) bool {
	if building == nil {
		return false
	}
	value := strings.ToLower(strings.TrimSpace(building.Tags["building"]))
	for _, token := range []string{"apartments", "house", "residential", "detached", "semidetached", "terrace", "dormitory", "bungalow"} {
		if value == token || strings.Contains(value, token) {
			return true
		}
	}
	return building.ResidentialDemand > 0
}

func signedBearingOffset(bearing, azimuth float64) float64 {
	delta := normalizeDegrees(bearing-azimuth+180) - 180
	return delta
}

func elapsedMilliseconds(start time.Time) float64 {
	return roundFloat(float64(time.Since(start).Microseconds())/1000, 3)
}

func boolPointer(value bool) *bool { return &value }

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
