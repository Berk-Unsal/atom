package raytracer

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
)

const (
	DiffractionDiagnosticID      = "p526-single-edge-v1"
	P526SingleEdgeReference      = "ITU-R P.526-16 §4.1, equations (26) and (31)"
	P526SingleEdgeEquation       = "v = h * sqrt(2 * (d1 + d2) / (lambda * d1 * d2)); J(v) uses P.526-16 equation (31) for v > -0.78"
	P526SingleEdgeExactEquation  = "J(v) = -20 log10(|(1+j)/2| * |C(v)-jS(v)|) from P.526-16 equation (30)"
	P526SingleEdgeZeroLossV      = -0.78
	P526MinimumFrequencyGHz      = 0.03
	DiffractionUnavailableHeight = "obstruction_height_unavailable"
)

// DiffractionEdgeCandidate is one auditable edge in the path-profile
// obstruction ledger. A building interval produces entry and exit candidates;
// a terrain candidate is a measured profile sample. Unknown building heights
// are retained as unavailable ledger rows and never enter the v calculation.
type DiffractionEdgeCandidate struct {
	ID                      string   `json:"id"`
	ObstructionID           string   `json:"obstruction_id"`
	LogicalObstructionID    string   `json:"logical_obstruction_id,omitempty"`
	ObstructionType         string   `json:"obstruction_type"`
	EdgePosition            string   `json:"edge_position"`
	Material                string   `json:"material,omitempty"`
	HeightSource            string   `json:"height_source"`
	HeightTag               string   `json:"height_tag,omitempty"`
	HeightAvailable         bool     `json:"height_available"`
	BuildingHeightM         *float64 `json:"building_height_m"`
	TerrainElevationM       *float64 `json:"terrain_elevation_m"`
	AbsoluteHeightM         *float64 `json:"absolute_height_m"`
	RelativeHeightAboveLOSM *float64 `json:"relative_height_above_los_m"`
	AlongPathFraction       float64  `json:"along_path_fraction"`
	AlongPathDistanceM      float64  `json:"along_path_distance_m"`
	D1M                     float64  `json:"d1_m"`
	D2M                     float64  `json:"d2_m"`
	LOSLineHeightM          float64  `json:"los_line_height_m"`
	ClearanceM              *float64 `json:"clearance_m"`
	FirstFresnelRadiusM     float64  `json:"first_fresnel_radius_m"`
	FresnelClearanceRatio   *float64 `json:"fresnel_clearance_ratio"`
	V                       *float64 `json:"v"`
	DiffractionLossDB       *float64 `json:"diffraction_loss_db"`
	SelectedDominantEdge    bool     `json:"selected_dominant_edge"`
	Available               bool     `json:"available"`
	UnavailableReason       string   `json:"unavailable_reason,omitempty"`
}

// DiffractionGeometry contains the link geometry and every edge considered
// by the deterministic single-edge diagnostic. Heights are AGL inputs; the
// absolute endpoint elevations make terrain assumptions explicit.
type DiffractionGeometry struct {
	Transmitter            Point                      `json:"transmitter"`
	Receiver               Point                      `json:"receiver"`
	TxHeightM              float64                    `json:"tx_height_m"`
	RxHeightM              float64                    `json:"rx_height_m"`
	TxAbsoluteElevationM   float64                    `json:"tx_absolute_elevation_m"`
	RxAbsoluteElevationM   float64                    `json:"rx_absolute_elevation_m"`
	HorizontalDistanceM    float64                    `json:"horizontal_distance_m"`
	SlantDistanceM         float64                    `json:"slant_distance_m"`
	TerrainStatus          string                     `json:"terrain_status"`
	TerrainAssumption      string                     `json:"terrain_assumption"`
	KnownHeightRequirement string                     `json:"known_height_requirement"`
	EdgeSelectionRule      string                     `json:"edge_selection_rule"`
	RoofEdgeRule           string                     `json:"roof_edge_rule"`
	Candidates             []DiffractionEdgeCandidate `json:"candidates"`
	SelectedEdgeID         string                     `json:"selected_edge_id,omitempty"`
}

// DiffractionDiagnostic is deliberately not a PropagationResult. It is an
// alternative FSPL-plus-explicit-edge calculation and is not consumed by the
// network, optimizer, surface, interference, or building-entry workflows.
type DiffractionDiagnostic struct {
	ID                         string                    `json:"id"`
	Available                  bool                      `json:"available"`
	Reason                     string                    `json:"reason"`
	Reference                  string                    `json:"reference"`
	Method                     string                    `json:"method"`
	BaselineModel              string                    `json:"baseline_model"`
	BaselineReference          string                    `json:"baseline_reference"`
	Geometry                   DiffractionGeometry       `json:"geometry"`
	SelectedEdge               *DiffractionEdgeCandidate `json:"selected_edge"`
	FSPLDB                     float64                   `json:"fspl_db"`
	DiffractionLossDB          *float64                  `json:"diffraction_loss_db"`
	DiagnosticTotalPathLossDB  *float64                  `json:"diagnostic_total_path_loss_db"`
	DiagnosticRxDBm            *float64                  `json:"diagnostic_rx_dbm"`
	LinkBudget                 RFLinkBudgetTerms         `json:"link_budget"`
	AppliedPatternLossDB       float64                   `json:"applied_pattern_loss_db"`
	AppliedSystemLossDB        float64                   `json:"applied_system_loss_db"`
	AppliedCalibrationOffsetDB float64                   `json:"applied_calibration_offset_db"`
	Applicability              string                    `json:"applicability"`
	MultipleEdgeStatus         string                    `json:"multiple_edge_status"`
	Limitations                []string                  `json:"limitations"`
}

type FresnelClearanceDiagnostics struct {
	MinimumRatio              float64 `json:"minimum_ratio"`
	ThresholdRatio            float64 `json:"threshold_ratio"`
	Status                    string  `json:"status"`
	ClassificationIndependent bool    `json:"classification_independent"`
	Note                      string  `json:"note"`
}

// CanonicalDiagnosticComparison keeps the UMa result and the diagnostic view
// side by side. They are alternative calculations; their values must not be
// added together.
type CanonicalDiagnosticComparison struct {
	Available                    bool     `json:"available"`
	Reason                       string   `json:"reason"`
	CanonicalModel               string   `json:"canonical_model"`
	CanonicalReference           string   `json:"canonical_reference"`
	CanonicalLOSState            string   `json:"canonical_los_state,omitempty"`
	CanonicalClassificationBasis string   `json:"canonical_classification_basis,omitempty"`
	CanonicalPathLossDB          *float64 `json:"canonical_path_loss_db"`
	CanonicalRxDBm               *float64 `json:"canonical_rx_dbm"`
	DiagnosticRxDBm              *float64 `json:"diagnostic_rx_dbm"`
	DiagnosticMinusCanonicalDB   *float64 `json:"diagnostic_minus_canonical_db"`
	Note                         string   `json:"note"`
}

// KnifeEdgeV implements the signed P.526-16 equation (26) form. Distances
// and wavelength must use one self-consistent unit system. The API uses metres
// and GHz, so wavelength is converted to metres here.
func KnifeEdgeV(heightAboveLOS, distanceFromTx, distanceToRx, frequencyGHz float64) (float64, bool) {
	if math.IsNaN(heightAboveLOS) || math.IsInf(heightAboveLOS, 0) ||
		math.IsNaN(distanceFromTx) || math.IsInf(distanceFromTx, 0) || distanceFromTx <= 0 ||
		math.IsNaN(distanceToRx) || math.IsInf(distanceToRx, 0) || distanceToRx <= 0 ||
		math.IsNaN(frequencyGHz) || math.IsInf(frequencyGHz, 0) || frequencyGHz <= 0 {
		return 0, false
	}
	wavelength := 0.299792458 / frequencyGHz
	return heightAboveLOS * math.Sqrt(2*(distanceFromTx+distanceToRx)/(wavelength*distanceFromTx*distanceToRx)), true
}

// KnifeEdgeLossForV evaluates the P.526-16 equation (31) approximation. The
// exact Fresnel-integral equation (30) is recorded as the reference basis but
// is intentionally not claimed as a full implementation here.
func KnifeEdgeLossForV(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) || v <= P526SingleEdgeZeroLossV {
		return 0
	}
	return math.Max(0, 6.9+20*math.Log10(math.Sqrt(math.Pow(v-0.1, 2)+1)+v-0.1))
}

// KnifeEdgeLossDB retains the pre-4F.2 public helper while routing it through
// the signed reference implementation.
func KnifeEdgeLossDB(heightAboveLOS, distanceFromTx, distanceToRx, frequencyGHz float64) float64 {
	v, ok := KnifeEdgeV(heightAboveLOS, distanceFromTx, distanceToRx, frequencyGHz)
	if !ok {
		return 0
	}
	return KnifeEdgeLossForV(v)
}

func diffractionApplicability(frequencyGHz float64, modelProfile string) (string, string) {
	if frequencyGHz <= P526MinimumFrequencyGHz {
		return "unavailable", "frequency_out_of_range"
	}
	if strings.EqualFold(strings.TrimSpace(modelProfile), "research-sub-thz") || frequencyGHz >= 100 {
		return "research_only", "mathematical_reference_only_at_sub_thz"
	}
	return "standards_aligned_subset", ""
}

func diffractionLimitations(terrainStatus string, applicability string) []string {
	limitations := []string{
		"single knife-edge only; multiple-edge propagation is deferred",
		"flat-roof buildings are represented by deterministic entry and exit roof edges; roof reflection and rounded-edge effects are not modeled",
		"P.526-16 equation (31) approximation is used for v > -0.78; equation (30) Fresnel-integral evaluation is not implemented",
		"diagnostic FSPL plus explicit diffraction is an alternative view and is never summed with canonical UMa NLOS",
	}
	if terrainStatus != TerrainStatusAvailable {
		limitations = append(limitations, "terrain_unavailable; known building edges use a flat-ground local relative-height datum")
	}
	if applicability == "research_only" {
		limitations = append(limitations, "140 GHz result is research diagnostic only and does not validate or modify research_sub_thz propagation")
	}
	return limitations
}

func buildDiffractionDiagnostic(request PathProfileRequest, modelProfile string, terrain TerrainModel, terrainMeta TerrainMetadata, buildings *BuildingIndex, geometry propagationPathGeometry, samples []PathProfileSample, txElevation, rxElevation, distance, bearing float64) DiffractionDiagnostic {
	profile := request.RFProfile.normalized()
	applicability, applicabilityReason := diffractionApplicability(profile.FrequencyGHz, modelProfile)
	geometryResult := DiffractionGeometry{
		Transmitter:            request.Transmitter,
		Receiver:               request.Receiver,
		TxHeightM:              profile.AntennaHeightM,
		RxHeightM:              profile.ReceiverHeightM,
		TxAbsoluteElevationM:   round1(txElevation),
		RxAbsoluteElevationM:   round1(rxElevation),
		HorizontalDistanceM:    round1(distance),
		SlantDistanceM:         round1(profile.SlantDistanceMeters(distance)),
		TerrainStatus:          terrainMeta.Status,
		TerrainAssumption:      "absolute roof and terrain elevations use sampled terrain when available; otherwise a zero-metre local datum is used only for relative path geometry",
		KnownHeightRequirement: "explicit height or building:levels evidence only; generic default-3-storey fallback is unavailable for diffraction",
		EdgeSelectionRule:      "select the available candidate with maximum v among candidates where P.526-16 equation (31) applies (v > -0.78); ties sort by path distance, obstruction ID, then edge position",
		RoofEdgeRule:           "each footprint interval contributes its entry and exit roof boundary as separate knife-edge candidates; a zero-length contact contributes one contact candidate",
		Candidates:             make([]DiffractionEdgeCandidate, 0),
	}

	for _, evidence := range geometry.heightEvidence {
		if evidence.building == nil {
			continue
		}
		height, heightSource, heightTag, heightKnown := heightEvidenceForBuilding(evidence.building)
		for intervalIndex, interval := range evidence.intervals {
			edges := []struct {
				name string
				t    float64
			}{
				{name: "entry", t: interval.TEntry},
			}
			if math.Abs(interval.TExit-interval.TEntry) <= pathParameterEpsilon {
				edges[0].name = "contact"
			} else {
				edges = append(edges, struct {
					name string
					t    float64
				}{name: "exit", t: interval.TExit})
			}
			for _, edge := range edges {
				candidate := buildBuildingDiffractionCandidate(request, terrain, evidence, height, heightSource, heightTag, heightKnown, edge.name, edge.t, intervalIndex, distance, bearing, txElevation, rxElevation)
				geometryResult.Candidates = append(geometryResult.Candidates, candidate)
			}
		}
	}

	// A terrain profile sample is a deterministic point obstacle. Building
	// samples are left to their roof-edge candidates so an unknown building can
	// never be bypassed by a sampled fallback height.
	if terrain != nil && terrainMeta.Available {
		for _, sample := range samples {
			if !sample.TerrainAvailable || sample.DistanceM <= 0 || sample.DistanceM >= distance || sample.BuildingID != "" || sample.TerrainElevationM <= sample.LineOfSightElevationM {
				continue
			}
			candidate := buildTerrainDiffractionCandidate(sample, distance, profile.FrequencyGHz)
			geometryResult.Candidates = append(geometryResult.Candidates, candidate)
		}
	}

	sort.SliceStable(geometryResult.Candidates, func(i, j int) bool {
		left, right := geometryResult.Candidates[i], geometryResult.Candidates[j]
		if left.AlongPathDistanceM != right.AlongPathDistanceM {
			return left.AlongPathDistanceM < right.AlongPathDistanceM
		}
		if left.ObstructionID != right.ObstructionID {
			return left.ObstructionID < right.ObstructionID
		}
		return left.EdgePosition < right.EdgePosition
	})

	antenna := EvaluateAntennaLink(profile, distance, bearing, request.AzimuthDeg)
	diagnostic := DiffractionDiagnostic{
		ID:                         DiffractionDiagnosticID,
		Reference:                  P526SingleEdgeReference,
		Method:                     "P.526-aligned single-edge diagnostic",
		BaselineModel:              "free_space",
		BaselineReference:          "free-space path loss (FSPL) using the configured slant distance",
		Geometry:                   geometryResult,
		FSPLDB:                     round2(FreeSpacePathLossMetersGHz(profile.SlantDistanceMeters(distance), profile.FrequencyGHz)),
		Applicability:              applicability,
		MultipleEdgeStatus:         "multi-edge deferred",
		Limitations:                diffractionLimitations(terrainMeta.Status, applicability),
		AppliedPatternLossDB:       round2(antenna.Pattern.TotalAttenuationDB),
		AppliedSystemLossDB:        round2(profile.SystemLossDB),
		AppliedCalibrationOffsetDB: round2(request.CalibrationOffsetDB),
	}

	if applicability == "unavailable" {
		diagnostic.Available = false
		diagnostic.Reason = applicabilityReason
		diagnostic.LinkBudget = rfLinkBudgetTermsFromAntenna(profile, antenna.Pattern, diagnostic.FSPLDB, diagnostic.FSPLDB, 0, request.CalibrationOffsetDB)
		return diagnostic
	}
	if request.Fidelity.DiffractionModel != "single-knife-edge" || request.Fidelity.BuildingLossMode != "screen-diffraction" {
		diagnostic.Available = false
		diagnostic.Reason = "diffraction_disabled_by_fidelity"
		diagnostic.LinkBudget = rfLinkBudgetTermsFromAntenna(profile, antenna.Pattern, diagnostic.FSPLDB, diagnostic.FSPLDB, 0, request.CalibrationOffsetDB)
		return diagnostic
	}
	if buildings == nil {
		diagnostic.Available = false
		diagnostic.Reason = "building_data_unavailable"
		diagnostic.LinkBudget = rfLinkBudgetTermsFromAntenna(profile, antenna.Pattern, diagnostic.FSPLDB, diagnostic.FSPLDB, 0, request.CalibrationOffsetDB)
		return diagnostic
	}
	for _, candidate := range geometryResult.Candidates {
		if !candidate.HeightAvailable && candidate.ObstructionType == "building_roof_edge" {
			diagnostic.Available = false
			diagnostic.Reason = DiffractionUnavailableHeight
			diagnostic.LinkBudget = rfLinkBudgetTermsFromAntenna(profile, antenna.Pattern, diagnostic.FSPLDB, diagnostic.FSPLDB, 0, request.CalibrationOffsetDB)
			return diagnostic
		}
	}

	selectedIndex := -1
	selectedV := math.Inf(-1)
	for index, candidate := range geometryResult.Candidates {
		if !candidate.Available || candidate.V == nil || *candidate.V <= P526SingleEdgeZeroLossV {
			continue
		}
		if *candidate.V > selectedV {
			selectedV = *candidate.V
			selectedIndex = index
		}
	}
	diagnostic.Available = true
	diagnostic.Reason = "available"
	if applicability == "research_only" {
		diagnostic.Reason = "available_research_only"
	}
	if selectedIndex >= 0 {
		geometryResult.Candidates[selectedIndex].SelectedDominantEdge = true
		selected := geometryResult.Candidates[selectedIndex]
		geometryResult.SelectedEdgeID = selected.ID
		diagnostic.SelectedEdge = &selected
		diagnostic.DiffractionLossDB = floatPointer(round2(valueOrFloat(selected.DiffractionLossDB)))
	} else {
		diagnostic.Reason = "no_candidate_above_p526_zero_loss_threshold"
		diagnostic.DiffractionLossDB = floatPointer(0)
	}
	diagnostic.Geometry = geometryResult

	diffractionLoss := valueOrFloat(diagnostic.DiffractionLossDB)
	diagnosticTotal := diagnostic.FSPLDB + diffractionLoss
	diagnostic.DiagnosticTotalPathLossDB = floatPointer(round2(diagnosticTotal))
	diagnostic.LinkBudget = rfLinkBudgetTermsFromAntenna(profile, antenna.Pattern, diagnostic.FSPLDB+diffractionLoss, diagnostic.FSPLDB, 0, request.CalibrationOffsetDB)
	diagnostic.DiagnosticRxDBm = floatPointer(round2(diagnostic.LinkBudget.ReceivedPowerDBm))
	return diagnostic
}

func buildBuildingDiffractionCandidate(request PathProfileRequest, terrain TerrainModel, evidence buildingPathEvidence, height float64, heightSource, heightTag string, heightKnown bool, edgePosition string, fraction float64, intervalIndex int, distance, bearing, txElevation, rxElevation float64) DiffractionEdgeCandidate {
	building := evidence.building
	edgePoint := interpolateSegmentPoint(request.Transmitter, request.Receiver, fraction)
	ground, terrainAvailable := terrainElevation(terrain, edgePoint)
	if !terrainAvailable {
		ground = 0
	}
	alongDistance := fraction * distance
	d1 := alongDistance
	d2 := distance - alongDistance
	lineHeight := txElevation + (rxElevation-txElevation)*fraction
	wavelength := 0.299792458 / request.RFProfile.FrequencyGHz
	fresnel := 0.0
	if d1 > 0 && d2 > 0 {
		fresnel = math.Sqrt(wavelength * d1 * d2 / distance)
	}
	candidate := DiffractionEdgeCandidate{
		ID:                   fmt.Sprintf("%s:%s:%d", building.ID, edgePosition, intervalIndex),
		ObstructionID:        building.ID,
		LogicalObstructionID: logicalBuildingID(building),
		ObstructionType:      "building_roof_edge",
		EdgePosition:         edgePosition,
		Material:             building.Material,
		HeightSource:         heightSource,
		HeightTag:            heightTag,
		HeightAvailable:      heightKnown,
		AlongPathFraction:    round6(fraction),
		AlongPathDistanceM:   round1(alongDistance),
		D1M:                  round1(d1),
		D2M:                  round1(d2),
		LOSLineHeightM:       round1(lineHeight),
		FirstFresnelRadiusM:  round2(fresnel),
		Available:            heightKnown,
		UnavailableReason:    "",
	}
	if terrainAvailable {
		candidate.TerrainElevationM = floatPointer(round1(ground))
	}
	if !heightKnown {
		candidate.UnavailableReason = DiffractionUnavailableHeight
		return candidate
	}
	buildingHeight := height
	absoluteHeight := ground + height
	heightAboveLOS := absoluteHeight - lineHeight
	clearance := lineHeight - absoluteHeight
	v, valid := KnifeEdgeV(heightAboveLOS, d1, d2, request.RFProfile.FrequencyGHz)
	loss := KnifeEdgeLossForV(v)
	if fresnel > 0 {
		candidate.FresnelClearanceRatio = floatPointer(round2(clearance / fresnel))
	}
	candidate.BuildingHeightM = floatPointer(round1(buildingHeight))
	candidate.AbsoluteHeightM = floatPointer(round1(absoluteHeight))
	candidate.RelativeHeightAboveLOSM = floatPointer(round1(heightAboveLOS))
	candidate.ClearanceM = floatPointer(round1(clearance))
	candidate.V = floatPointer(round4(v))
	candidate.DiffractionLossDB = floatPointer(round2(loss))
	if !valid {
		candidate.Available = false
		candidate.UnavailableReason = "invalid_single_edge_geometry"
	}
	return candidate
}

func buildTerrainDiffractionCandidate(sample PathProfileSample, distance, frequencyGHz float64) DiffractionEdgeCandidate {
	d1 := sample.DistanceM
	d2 := distance - d1
	heightAboveLOS := sample.TerrainElevationM - sample.LineOfSightElevationM
	v, valid := KnifeEdgeV(heightAboveLOS, d1, d2, frequencyGHz)
	loss := KnifeEdgeLossForV(v)
	candidate := DiffractionEdgeCandidate{
		ID:                      fmt.Sprintf("terrain:%.1f", sample.DistanceM),
		ObstructionID:           fmt.Sprintf("terrain:%.1f", sample.DistanceM),
		ObstructionType:         "terrain_profile_sample",
		EdgePosition:            "profile-sample",
		HeightSource:            "terrain_provider",
		HeightAvailable:         true,
		TerrainElevationM:       floatPointer(sample.TerrainElevationM),
		AbsoluteHeightM:         floatPointer(sample.TerrainElevationM),
		RelativeHeightAboveLOSM: floatPointer(round1(heightAboveLOS)),
		AlongPathFraction:       round6(sample.DistanceM / distance),
		AlongPathDistanceM:      sample.DistanceM,
		D1M:                     d1,
		D2M:                     d2,
		LOSLineHeightM:          sample.LineOfSightElevationM,
		ClearanceM:              floatPointer(round1(sample.ClearanceM)),
		FirstFresnelRadiusM:     sample.FresnelRadiusM,
		V:                       floatPointer(round4(v)),
		DiffractionLossDB:       floatPointer(round2(loss)),
		Available:               valid,
	}
	if sample.FresnelRadiusM > 0 {
		candidate.FresnelClearanceRatio = floatPointer(round2(sample.ClearanceM / sample.FresnelRadiusM))
	}
	if !valid {
		candidate.UnavailableReason = "invalid_single_edge_geometry"
	}
	return candidate
}

func valueOrFloat(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}

func round4(value float64) float64 { return math.Round(value*10000) / 10000 }
func round6(value float64) float64 { return math.Round(value*1e6) / 1e6 }

func canonicalDiagnosticComparison(request PathProfileRequest, buildings *BuildingIndex, distance, bearing float64, diagnostic *DiffractionDiagnostic) CanonicalDiagnosticComparison {
	comparison := CanonicalDiagnosticComparison{
		CanonicalModel:     UrbanShortRangePropagationID,
		CanonicalReference: "3GPP TR 38.901 V19.4.0, Table 7.4.1-1 UMa path loss",
		Note:               "Canonical UMa and the diffraction diagnostic are alternative calculations; UMa NLOS and explicit diffraction are never summed.",
	}
	if request.RFProfile.FrequencyGHz <= 0.5 || request.RFProfile.FrequencyGHz >= 100 {
		comparison.Reason = "canonical_uma_frequency_out_of_range"
		return comparison
	}
	if buildings == nil {
		comparison.Reason = "building_data_unavailable"
		return comparison
	}
	canonicalProfile := request.RFProfile
	canonicalProfile.PropagationModelID = UrbanShortRangePropagationID
	canonicalGeometry, err := buildPropagationPathGeometryContextWithOptions(context.Background(), request.Transmitter, request.Receiver, buildings, propagationPathGeometryOptions{
		TxHeightM: canonicalProfile.AntennaHeightM,
		RxHeightM: canonicalProfile.ReceiverHeightM,
	})
	if err != nil {
		comparison.Reason = "canonical_geometry_unavailable"
		return comparison
	}
	state, endpointCase, wallEvents, classification := classifyPropagationPath(canonicalProfile, canonicalGeometry, request.Receiver, distance)
	result := EvaluatePropagationLink(PropagationLinkContext{
		Profile:               canonicalProfile,
		GroundDistanceM:       distance,
		HorizontalOffsetDeg:   smallestAngleDifference(bearing, canonicalProfile.EffectiveAzimuth(request.AzimuthDeg)),
		CalibrationOffsetDB:   request.CalibrationOffsetDB,
		LOSState:              state,
		LOSClassification:     classification,
		EndpointCase:          endpointCase,
		BuildingDataAvailable: true,
		WallEventCount:        wallEvents,
	})
	if !result.Applicable {
		comparison.Reason = result.ApplicabilityReason
		return comparison
	}
	comparison.Available = true
	comparison.Reason = "available"
	comparison.CanonicalLOSState = string(result.LOSState)
	comparison.CanonicalClassificationBasis = result.ClassificationBasis
	comparison.CanonicalPathLossDB = floatPointer(round2(result.TotalPathLossDB))
	comparison.CanonicalRxDBm = floatPointer(round2(result.ReceivedPowerDBm))
	if diagnostic != nil && diagnostic.DiagnosticRxDBm != nil {
		comparison.DiagnosticRxDBm = floatPointer(*diagnostic.DiagnosticRxDBm)
		comparison.DiagnosticMinusCanonicalDB = floatPointer(round2(*diagnostic.DiagnosticRxDBm - result.ReceivedPowerDBm))
	}
	return comparison
}
