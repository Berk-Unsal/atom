package raytracer

import (
	"context"
	"fmt"
	"math"
	"strings"
)

// Propagation model IDs are stable API values. The legacy model remains
// selectable so existing studies can be reproduced explicitly.
const (
	LegacyPropagationModelID       = "legacy_fspl_walls"
	UrbanShortRangePropagationID   = "urban_short_range"
	ResearchSubTHzPropagationID    = "research_sub_thz"
	PropagationLOS                 = "los"
	PropagationNLOS                = "nlos"
	PropagationLOSUnknown          = "unknown"
	PropagationEndpointOutdoorO2O  = "outdoor_to_outdoor"
	PropagationEndpointIndoorTx    = "indoor_transmitter"
	PropagationEndpointIndoorRx    = "indoor_receiver"
	PropagationEndpointUnknown     = "unknown"
	PropagationModelUnsupported    = "unsupported_model"
	PropagationModelDefaultReason  = "default_model_for_frequency"
	PropagationModelFallbackReason = "fallback_to_legacy"
)

const (
	UrbanShortRangeModelDescription = "3GPP TR 38.901 UMa median outdoor urban path loss with deterministic height-aware footprint LOS/NLOS classification"
	LegacyPropagationDescription    = "Legacy FSPL with frequency-dependent footprint wall-event loss"
	ResearchSubTHzDescription       = "Research-only sub-THz planning profile using the legacy conservative attenuation envelope"
)

// DefaultPropagationModelID selects the production planning profile for the
// technology bands supported by the application. 2.6 and 28 GHz use the
// urban model; 140 GHz is deliberately labeled research-only.
func DefaultPropagationModelID(frequencyGHz float64) string {
	if frequencyGHz >= 100 {
		return ResearchSubTHzPropagationID
	}
	return UrbanShortRangePropagationID
}

type PropagationLOSState string

type PropagationEndpointCase string

// PropagationLinkContext is the complete link-level input shared by all
// propagation engines. The urban baseline receives one shared geometric
// classification; legacy and research callers can continue to provide the
// historical 2D state without opting into the height-aware classifier.
type PropagationLinkContext struct {
	Profile               CellRFProfile
	GroundDistanceM       float64
	HorizontalOffsetDeg   float64
	CalibrationOffsetDB   float64
	LOSState              PropagationLOSState
	LOSClassification     *LOSClassification
	EndpointCase          PropagationEndpointCase
	BuildingDataAvailable bool
	WallEventCount        int
}

type PropagationApplicability struct {
	Applicable bool   `json:"applicable"`
	Reason     string `json:"reason"`
	Detail     string `json:"detail,omitempty"`
}

type PropagationPathTerms struct {
	FrequencyGHz                   float64 `json:"frequency_ghz"`
	DistanceM                      float64 `json:"distance_m"`
	SlantDistanceM                 float64 `json:"slant_distance_m"`
	EIRPDBm                        float64 `json:"eirp_dbm"`
	FreeSpacePathLossDB            float64 `json:"free_space_path_loss_db"`
	UrbanPathLossDB                float64 `json:"urban_path_loss_db"`
	WallLossDB                     float64 `json:"wall_loss_db"`
	BreakpointDistanceM            float64 `json:"breakpoint_distance_m,omitempty"`
	HorizontalPatternAttenuationDB float64 `json:"horizontal_pattern_attenuation_db"`
	VerticalPatternAttenuationDB   float64 `json:"vertical_pattern_attenuation_db"`
	PatternAttenuationDB           float64 `json:"pattern_attenuation_db"`
	BasePathLossDB                 float64 `json:"base_path_loss_db"`
	AdditionalLossDB               float64 `json:"additional_loss_db"`
	TotalPathLossDB                float64 `json:"total_path_loss_db"`
}

// PropagationResult is the explainable result returned by the shared link
// evaluator. ModelID is the requested model; AppliedModelID identifies the
// numeric evaluator actually used after applicability and fallback checks.
type PropagationResult struct {
	ModelID                  string                  `json:"model_id"`
	AppliedModelID           string                  `json:"applied_model_id"`
	ModelDescription         string                  `json:"model_description"`
	Applicable               bool                    `json:"applicable"`
	ApplicabilityReason      string                  `json:"applicability_reason"`
	ApplicabilityDetail      string                  `json:"applicability_detail,omitempty"`
	FallbackUsed             bool                    `json:"fallback_used"`
	FallbackModelID          string                  `json:"fallback_model_id,omitempty"`
	LOSState                 PropagationLOSState     `json:"los_state"`
	EndpointCase             PropagationEndpointCase `json:"endpoint_case"`
	LOSClassifierID          string                  `json:"los_classifier_id,omitempty"`
	LOSClassifierDescription string                  `json:"los_classifier_description,omitempty"`
	TerrainStatus            string                  `json:"terrain_status,omitempty"`
	ClassificationBasis      string                  `json:"classification_basis,omitempty"`
	LOSClassification        *LOSClassification      `json:"los_classification,omitempty"`
	DistanceM                float64                 `json:"distance_m"`
	SlantDistanceM           float64                 `json:"slant_distance_m"`
	ReceivedPowerDBm         float64                 `json:"received_power_dbm"`
	TotalPathLossDB          float64                 `json:"total_path_loss_db"`
	Terms                    PropagationPathTerms    `json:"terms"`
}

// PropagationModel is the narrow abstraction implemented by every selectable
// model. It keeps applicability separate from numeric evaluation so an
// inapplicable urban request cannot silently become an undocumented formula.
type PropagationModel interface {
	ID() string
	Description() string
	Applicability(PropagationLinkContext) PropagationApplicability
	Evaluate(PropagationLinkContext) PropagationResult
}

type PropagationModelInfo struct {
	ID                   string   `json:"id"`
	Description          string   `json:"description"`
	ModelFamily          string   `json:"model_family"`
	Scenario             string   `json:"scenario"`
	Formula              string   `json:"formula"`
	FallbackModelID      string   `json:"fallback_model_id"`
	BuildingHeightUsed   bool     `json:"building_height_used"`
	RequiresBuildingData bool     `json:"requires_building_data"`
	RequiresLOSOrNLOS    bool     `json:"requires_los_or_nlos"`
	FrequencyMinGHz      float64  `json:"frequency_min_ghz"`
	FrequencyMaxGHz      float64  `json:"frequency_max_ghz"`
	DistanceMinM         float64  `json:"distance_min_m"`
	DistanceMaxM         float64  `json:"distance_max_m"`
	Limitations          []string `json:"limitations"`
}

type legacyFSPLWallsModel struct{}

func (legacyFSPLWallsModel) ID() string          { return LegacyPropagationModelID }
func (legacyFSPLWallsModel) Description() string { return LegacyPropagationDescription }

func (legacyFSPLWallsModel) Applicability(ctx PropagationLinkContext) PropagationApplicability {
	if ctx.Profile.FrequencyGHz <= 0 || ctx.Profile.FrequencyGHz > MaxFrequencyGHz {
		return PropagationApplicability{Reason: RFReferenceReasonFrequencyOutOfRange, Detail: "frequency is outside the runtime model range"}
	}
	if math.IsNaN(ctx.GroundDistanceM) || math.IsInf(ctx.GroundDistanceM, 0) || ctx.GroundDistanceM < 0 {
		return PropagationApplicability{Reason: RFReferenceReasonDistanceOutOfRange, Detail: "ground distance must be finite and non-negative"}
	}
	return PropagationApplicability{Applicable: true, Reason: RFReferenceReasonApplicable}
}

func (model legacyFSPLWallsModel) Evaluate(ctx PropagationLinkContext) PropagationResult {
	profile := ctx.Profile.normalized()
	terms := legacyPropagationTerms(profile, ctx.GroundDistanceM, ctx.WallEventCount, ctx.CalibrationOffsetDB, ctx.HorizontalOffsetDeg)
	return propagationResultFromTerms(model, ctx, terms)
}

type urbanShortRangeModel struct{}

func (urbanShortRangeModel) ID() string          { return UrbanShortRangePropagationID }
func (urbanShortRangeModel) Description() string { return UrbanShortRangeModelDescription }

func (urbanShortRangeModel) Applicability(ctx PropagationLinkContext) PropagationApplicability {
	profile := ctx.Profile
	if profile.FrequencyGHz <= 0.5 || profile.FrequencyGHz >= 100 {
		return PropagationApplicability{Reason: RFReferenceReasonFrequencyOutOfRange, Detail: "3GPP UMa baseline is scoped to 0.5 < f_c < 100 GHz"}
	}
	if math.IsNaN(ctx.GroundDistanceM) || math.IsInf(ctx.GroundDistanceM, 0) || ctx.GroundDistanceM < 10 || ctx.GroundDistanceM > 5000 {
		return PropagationApplicability{Reason: RFReferenceReasonDistanceOutOfRange, Detail: "3GPP UMa baseline is scoped to 10 m <= d_2D <= 5000 m"}
	}
	if profile.AntennaHeightM < 10 || profile.AntennaHeightM > 150 || profile.ReceiverHeightM < 1.5 || profile.ReceiverHeightM >= 13 {
		return PropagationApplicability{Reason: "required_height_out_of_range", Detail: "deterministic UMa baseline requires 10 m <= hBS <= 150 m and 1.5 m <= hUT < 13 m"}
	}
	if ctx.EndpointCase != PropagationEndpointOutdoorO2O {
		return PropagationApplicability{Reason: RFReferenceReasonUnsupportedEndpoint, Detail: "urban outdoor-to-outdoor baseline does not model indoor transmitter or receiver entry"}
	}
	if !ctx.BuildingDataAvailable {
		return PropagationApplicability{Reason: RFReferenceReasonRequiredBuildingDataMissing, Detail: "2D footprint data is required to classify the link as LOS or NLOS"}
	}
	if ctx.LOSState != PropagationLOSState(PropagationLOS) && ctx.LOSState != PropagationLOSState(PropagationNLOS) {
		return PropagationApplicability{Reason: RFReferenceReasonRequiredLOSOrNLOSMissing, Detail: "urban baseline requires a deterministic LOS or NLOS classification"}
	}
	return PropagationApplicability{Applicable: true, Reason: RFReferenceReasonApplicable}
}

func (model urbanShortRangeModel) Evaluate(ctx PropagationLinkContext) PropagationResult {
	profile := ctx.Profile.normalized()
	terms := urbanPropagationTerms(profile, ctx.GroundDistanceM, ctx.LOSState, ctx.CalibrationOffsetDB, ctx.HorizontalOffsetDeg)
	return propagationResultFromTerms(model, ctx, terms)
}

type researchSubTHzModel struct{}

func (researchSubTHzModel) ID() string          { return ResearchSubTHzPropagationID }
func (researchSubTHzModel) Description() string { return ResearchSubTHzDescription }

func (researchSubTHzModel) Applicability(ctx PropagationLinkContext) PropagationApplicability {
	if ctx.Profile.FrequencyGHz < 100 || ctx.Profile.FrequencyGHz > MaxFrequencyGHz {
		return PropagationApplicability{Reason: RFReferenceReasonFrequencyOutOfRange, Detail: "research sub-THz profile is scoped to 100-300 GHz"}
	}
	if math.IsNaN(ctx.GroundDistanceM) || math.IsInf(ctx.GroundDistanceM, 0) || ctx.GroundDistanceM <= 0 {
		return PropagationApplicability{Reason: RFReferenceReasonDistanceOutOfRange, Detail: "research profile requires a positive finite distance"}
	}
	return PropagationApplicability{Applicable: true, Reason: RFReferenceReasonResearchProfileOnly, Detail: "research-only planning profile; not a standards-conformance claim"}
}

func (model researchSubTHzModel) Evaluate(ctx PropagationLinkContext) PropagationResult {
	profile := ctx.Profile.normalized()
	terms := legacyPropagationTerms(profile, ctx.GroundDistanceM, ctx.WallEventCount, ctx.CalibrationOffsetDB, ctx.HorizontalOffsetDeg)
	return propagationResultFromTerms(model, ctx, terms)
}

var propagationModels = map[string]PropagationModel{
	LegacyPropagationModelID:     legacyFSPLWallsModel{},
	UrbanShortRangePropagationID: urbanShortRangeModel{},
	ResearchSubTHzPropagationID:  researchSubTHzModel{},
}

func PropagationModelByID(id string) (PropagationModel, bool) {
	normalizedID := strings.ToLower(strings.TrimSpace(id))
	if normalizedID == CanonicalRFModelID {
		return legacyFSPLWallsModel{}, true
	}
	model, ok := propagationModels[normalizedID]
	return model, ok
}

func PropagationModelDescription(id string) string {
	if model, ok := PropagationModelByID(id); ok {
		return model.Description()
	}
	return ""
}

func PropagationModelCatalog() []PropagationModelInfo {
	return []PropagationModelInfo{
		{
			ID: UrbanShortRangePropagationID, Description: UrbanShortRangeModelDescription,
			ModelFamily: "3GPP UMa outdoor urban median path loss", Scenario: "urban-short-range-outdoor-to-outdoor",
			Formula:         "PL_LOS = PL1/PL2 with dBP; PL_NLOS = max(PL_LOS, PL') using Table 7.4.1-1",
			FallbackModelID: LegacyPropagationModelID, BuildingHeightUsed: true, RequiresBuildingData: true, RequiresLOSOrNLOS: true,
			FrequencyMinGHz: 0.5, FrequencyMaxGHz: 100, DistanceMinM: 10, DistanceMaxM: 5000,
			Limitations: []string{"median outdoor path loss only", "no shadow fading, Fresnel clearance, diffraction, or reflection", "unknown building heights use conservative 2D NLOS", "terrain is unavailable in the current Ankara network evaluator; flat-ground relative-height assumption applies"},
		},
		{
			ID: LegacyPropagationModelID, Description: LegacyPropagationDescription,
			ModelFamily: "free-space path loss plus footprint wall events", Scenario: "planning-compatibility",
			Formula: CanonicalLinkBudgetEquation, FallbackModelID: LegacyPropagationModelID,
			BuildingHeightUsed: false, RequiresBuildingData: false, RequiresLOSOrNLOS: false,
			FrequencyMinGHz: 0, FrequencyMaxGHz: MaxFrequencyGHz, DistanceMinM: 0, DistanceMaxM: MaxRadiusMeters,
			Limitations: []string{"material-agnostic wall loss", "not an empirical urban path-loss model"},
		},
		{
			ID: ResearchSubTHzPropagationID, Description: ResearchSubTHzDescription,
			ModelFamily: "research planning profile", Scenario: "research-sub-thz",
			Formula: CanonicalLinkBudgetEquation, FallbackModelID: LegacyPropagationModelID,
			BuildingHeightUsed: false, RequiresBuildingData: false, RequiresLOSOrNLOS: false,
			FrequencyMinGHz: 100, FrequencyMaxGHz: MaxFrequencyGHz, DistanceMinM: 0, DistanceMaxM: MaxRadiusMeters,
			Limitations: []string{"research-only", "uses conservative planning attenuation rather than a validated 140 GHz channel model"},
		},
	}
}

// EvaluatePropagationLink dispatches one link through the requested model and
// records a deterministic legacy fallback when the requested scope is not met.
func EvaluatePropagationLink(ctx PropagationLinkContext) PropagationResult {
	ctx.Profile = ctx.Profile.normalized()
	requestedID := strings.ToLower(strings.TrimSpace(ctx.Profile.PropagationModelID))
	if requestedID == "" {
		requestedID = DefaultPropagationModelID(ctx.Profile.FrequencyGHz)
		ctx.Profile.PropagationModelID = requestedID
	}
	model, known := PropagationModelByID(requestedID)
	if !known {
		return fallbackPropagationResult(ctx, requestedID, PropagationApplicability{
			Reason: PropagationModelUnsupported,
			Detail: fmt.Sprintf("propagation model %q is not registered", requestedID),
		})
	}
	applicability := model.Applicability(ctx)
	if !applicability.Applicable {
		return fallbackPropagationResult(ctx, requestedID, applicability)
	}
	result := model.Evaluate(ctx)
	result.ModelID = requestedID
	result.AppliedModelID = model.ID()
	result.ModelDescription = model.Description()
	result.Applicable = true
	result.ApplicabilityReason = applicability.Reason
	result.ApplicabilityDetail = applicability.Detail
	return result
}

func fallbackPropagationResult(ctx PropagationLinkContext, requestedID string, applicability PropagationApplicability) PropagationResult {
	legacy := legacyFSPLWallsModel{}
	legacyResult := legacy.Evaluate(ctx)
	legacyResult.ModelID = requestedID
	legacyResult.AppliedModelID = LegacyPropagationModelID
	legacyResult.ModelDescription = PropagationModelDescription(requestedID)
	if legacyResult.ModelDescription == "" {
		legacyResult.ModelDescription = legacy.Description()
	}
	legacyResult.Applicable = false
	legacyResult.ApplicabilityReason = applicability.Reason
	legacyResult.ApplicabilityDetail = applicability.Detail
	legacyResult.FallbackUsed = true
	legacyResult.FallbackModelID = LegacyPropagationModelID
	return legacyResult
}

func propagationResultFromTerms(model PropagationModel, ctx PropagationLinkContext, terms PropagationPathTerms) PropagationResult {
	classification := ctx.LOSClassification
	result := PropagationResult{
		ModelID: model.ID(), AppliedModelID: model.ID(), ModelDescription: model.Description(),
		Applicable: true, ApplicabilityReason: RFReferenceReasonApplicable,
		LOSState: ctx.LOSState, EndpointCase: ctx.EndpointCase,
		DistanceM: terms.DistanceM, SlantDistanceM: terms.SlantDistanceM,
		ReceivedPowerDBm: terms.EIRPDBm - terms.TotalPathLossDB,
		TotalPathLossDB:  terms.TotalPathLossDB, Terms: terms,
	}
	if classification != nil {
		result.LOSClassifierID = classification.ClassifierID
		result.LOSClassifierDescription = classification.ClassifierDescription
		result.TerrainStatus = classification.TerrainStatus
		result.ClassificationBasis = classification.ClassificationBasis
		result.LOSClassification = classification
	}
	return result
}

func propagationPatternTerms(profile CellRFProfile, distanceM, calibrationOffsetDB, horizontalOffsetDeg float64) (float64, float64, float64, float64) {
	horizontal := profile.HorizontalPatternAttenuationDB(horizontalOffsetDeg)
	vertical := profile.VerticalPatternAttenuationDB(distanceM)
	return horizontal, vertical, horizontal + vertical, profile.TxPowerDBm + profile.AntennaGainDBi - profile.SystemLossDB + calibrationOffsetDB
}

func legacyPropagationTerms(profile CellRFProfile, distanceM float64, wallEventCount int, calibrationOffsetDB, horizontalOffsetDeg float64) PropagationPathTerms {
	distanceM = math.Max(distanceM, 0)
	slantDistanceM := profile.SlantDistanceMeters(distanceM)
	horizontal, vertical, pattern, eirp := propagationPatternTerms(profile, distanceM, calibrationOffsetDB, horizontalOffsetDeg)
	fspl := FreeSpacePathLossMetersGHz(slantDistanceM, profile.FrequencyGHz)
	wallLoss := math.Max(0, float64(wallEventCount)) * PenetrationLossForFrequencyGHz(profile.FrequencyGHz)
	return PropagationPathTerms{
		FrequencyGHz: profile.FrequencyGHz, DistanceM: distanceM, SlantDistanceM: slantDistanceM,
		EIRPDBm: eirp, FreeSpacePathLossDB: fspl, WallLossDB: wallLoss,
		HorizontalPatternAttenuationDB: horizontal, VerticalPatternAttenuationDB: vertical,
		PatternAttenuationDB: pattern, BasePathLossDB: fspl, AdditionalLossDB: wallLoss,
		TotalPathLossDB: fspl + wallLoss + pattern,
	}
}

func urbanPropagationTerms(profile CellRFProfile, distanceM float64, state PropagationLOSState, calibrationOffsetDB, horizontalOffsetDeg float64) PropagationPathTerms {
	distanceM = math.Max(distanceM, 0)
	slantDistanceM := profile.SlantDistanceMeters(distanceM)
	horizontal, vertical, pattern, eirp := propagationPatternTerms(profile, distanceM, calibrationOffsetDB, horizontalOffsetDeg)
	fcHz := profile.FrequencyGHz * 1e9
	hBSPrime := profile.AntennaHeightM - 1
	hUTPrime := profile.ReceiverHeightM - 1
	dBP := 4 * hBSPrime * hUTPrime * fcHz / 3e8
	logDistance := math.Log10(math.Max(slantDistanceM, 1))
	pl1 := 28 + 22*logDistance + 20*math.Log10(profile.FrequencyGHz)
	pl2 := 28 + 40*logDistance + 20*math.Log10(profile.FrequencyGHz) - 9*math.Log10(dBP*dBP+math.Pow(profile.AntennaHeightM-profile.ReceiverHeightM, 2))
	plLOS := pl1
	if distanceM > dBP {
		plLOS = pl2
	}
	plNLOS := 13.54 + 39.08*logDistance + 20*math.Log10(profile.FrequencyGHz) - 0.6*(profile.ReceiverHeightM-1.5)
	if plNLOS < plLOS {
		plNLOS = plLOS
	}
	selected := plLOS
	if state == PropagationLOSState(PropagationNLOS) {
		selected = plNLOS
	}
	return PropagationPathTerms{
		FrequencyGHz: profile.FrequencyGHz, DistanceM: distanceM, SlantDistanceM: slantDistanceM,
		EIRPDBm: eirp, UrbanPathLossDB: selected, BreakpointDistanceM: dBP,
		HorizontalPatternAttenuationDB: horizontal, VerticalPatternAttenuationDB: vertical,
		PatternAttenuationDB: pattern, BasePathLossDB: selected, AdditionalLossDB: 0,
		TotalPathLossDB: selected + pattern,
	}
}

type propagationPathGeometry struct {
	available                  bool
	txInside                   bool
	buildings                  *BuildingIndex
	intersections              []wallIntersection
	heightEvidence             []buildingPathEvidence
	excludedBuildingIDs        map[string]struct{}
	excludedLogicalBuildingIDs map[string]struct{}
	totalDistanceM             float64
	txHeightM                  float64
	rxHeightM                  float64
	terrainStatus              string
}

func buildPropagationPathGeometryContext(ctx context.Context, origin, endpoint Point, buildings *BuildingIndex) (propagationPathGeometry, error) {
	return buildPropagationPathGeometryContextWithOptions(ctx, origin, endpoint, buildings, propagationPathGeometryOptions{})
}

func buildPropagationPathGeometryContextWithOptions(ctx context.Context, origin, endpoint Point, buildings *BuildingIndex, options propagationPathGeometryOptions) (propagationPathGeometry, error) {
	geometry := propagationPathGeometry{
		buildings:                  buildings,
		excludedBuildingIDs:        options.ExcludedBuildingIDs,
		excludedLogicalBuildingIDs: options.ExcludedLogicalBuildingIDs,
		totalDistanceM:             ApproxDistanceMeters(origin, endpoint),
		txHeightM:                  options.TxHeightM,
		rxHeightM:                  options.RxHeightM,
		terrainStatus:              terrainStatusForModel(options.Terrain),
	}
	if buildings == nil || buildings.Len() == 0 {
		return geometry, nil
	}
	geometry.available = true
	candidates := buildings.SearchRay(origin, endpoint)
	for _, candidate := range candidates {
		if candidate == nil || geometry.isExcludedBuilding(candidate) {
			continue
		}
		if PointInPolygon(origin, candidate.Vertices) {
			geometry.txInside = true
		}
	}
	intersections, err := wallIntersectionsForCandidatesContext(ctx, origin, origin, endpoint, candidates)
	if err != nil {
		return propagationPathGeometry{}, err
	}
	geometry.intersections = intersections
	geometry.heightEvidence = make([]buildingPathEvidence, 0, len(candidates))
	logicalEvidence := make(map[string]int, len(candidates))
	for index, candidate := range candidates {
		if index%16 == 0 {
			if err := ctx.Err(); err != nil {
				return propagationPathGeometry{}, err
			}
		}
		if candidate == nil || geometry.isExcludedBuilding(candidate) || PointInPolygon(origin, candidate.Vertices) {
			continue
		}
		intervals, intervalErr := buildingPathIntervalsContext(ctx, origin, endpoint, candidate.Vertices)
		if intervalErr != nil {
			return propagationPathGeometry{}, intervalErr
		}
		if len(intervals) > 0 {
			logicalID := logicalBuildingID(candidate)
			if existingIndex, ok := logicalEvidence[logicalID]; ok {
				existing := &geometry.heightEvidence[existingIndex]
				existing.intervals = mergeLOSIntervals(append(existing.intervals, intervals...))
				existing.partIDs = append(existing.partIDs, candidate.ID)
				continue
			}
			logicalEvidence[logicalID] = len(geometry.heightEvidence)
			geometry.heightEvidence = append(geometry.heightEvidence, buildingPathEvidence{
				building: candidate, logicalBuilding: logicalID, partIDs: []string{candidate.ID}, intervals: intervals,
			})
		}
	}
	return geometry, nil
}

func (geometry propagationPathGeometry) classify(point Point, distanceM float64) (PropagationLOSState, PropagationEndpointCase, int) {
	return geometry.classify2D(point, distanceM)
}

func pointOnPolygonBoundary(point Point, polygon []Point) bool {
	for index, start := range polygon {
		end := polygon[(index+1)%len(polygon)]
		if pointToSegmentDistanceMeters(point, start, end) <= 0.5 {
			return true
		}
	}
	return false
}

func countPropagationWallEvents(intersections []wallIntersection, distanceM float64) int {
	count := 0
	for _, intersection := range intersections {
		if intersection.distanceMeters <= distanceM+0.05 {
			count++
		}
	}
	return count
}
