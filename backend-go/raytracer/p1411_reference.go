package raytracer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

const (
	P1411ReferenceModelID             = "itu_r_p1411_table4_candidates_v1"
	P1411Reference                    = "ITU-R P.1411-13"
	P1411ReferenceRevision            = "2025-09"
	P1411ReferenceSection             = "4.1.1"
	P1411ReferenceTable               = "Table 4"
	P1411ReferenceURL                 = "https://www.itu.int/rec/R-REC-P.1411-13-202509-I/en"
	P1411ReferencePDFURL              = "https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1411-13-202509-I!!PDF-E.pdf"
	P1411ReferenceFrequencyMinGHz     = 0.45
	P1411ReferenceFrequencyMaxGHz     = 300.0
	P1411ReferenceMaxDistanceM        = 100000.0
	P1411AtmosphericComparisonStatus  = "comparison_only"
	P1411ResearchComparisonStatus     = "comparison_only"
	P1411P525ComparisonReference      = P5255Reference
	P1411ResearchComparisonModelID    = "research_sub_thz"
	P1411ResearchWallLossPerEventDB   = 80.0
	P1411DefaultCandidateSelection    = "all"
	P1411ProvenanceUserDeclared       = "user_declared"
	P1411ProvenanceDatasetMeasured    = "dataset_measured"
	P1411ProvenanceDatasetDerived     = "dataset_derived"
	P1411ProvenanceGeometryClassifier = "geometry_classifier"
	P1411ProvenanceGeometryDerived    = "geometry_derived"
	P1411ProvenanceUnknown            = "unknown"
)

var p1411AllowedProvenanceSources = map[string]struct{}{
	P1411ProvenanceUserDeclared:       {},
	P1411ProvenanceDatasetMeasured:    {},
	P1411ProvenanceDatasetDerived:     {},
	P1411ProvenanceGeometryClassifier: {},
	P1411ProvenanceGeometryDerived:    {},
	P1411ProvenanceUnknown:            {},
}

const (
	P1411MorphologyUrbanHighRise = "urban_high_rise"
	P1411MorphologyUrbanLowRise  = "urban_low_rise"
	P1411MorphologySuburban      = "suburban"
	P1411MorphologyUnknown       = "unknown"

	P1411RooftopBothBelow = "both_below_rooftop"
	P1411RooftopOneAbove  = "one_above_one_below"
	P1411RooftopBothAbove = "both_above_rooftop"
	P1411RooftopUnknown   = "unknown"

	P1411LOSStateLOS     = "los"
	P1411LOSStateNLOS    = "nlos"
	P1411LOSStateUnknown = "unknown"
)

// P1411ReferenceProvenanceInput makes each scenario fact's source explicit.
// Empty fields receive the conservative defaults in ToRequest.
type P1411ReferenceProvenanceInput struct {
	FrequencyGHz    string `json:"frequency_ghz"`
	DistanceM       string `json:"distance_m"`
	TxHeightM       string `json:"tx_height_m"`
	RxHeightM       string `json:"rx_height_m"`
	Morphology      string `json:"morphology"`
	RooftopRelation string `json:"rooftop_relation"`
	LOSState        string `json:"los_state"`
}

type P1411ReferenceProvenance struct {
	FrequencyGHz    string `json:"frequency_ghz"`
	DistanceM       string `json:"distance_m"`
	TxHeightM       string `json:"tx_height_m"`
	RxHeightM       string `json:"rx_height_m"`
	Morphology      string `json:"morphology"`
	RooftopRelation string `json:"rooftop_relation"`
	LOSState        string `json:"los_state"`
}

type P1411ReferenceRequestInput struct {
	FrequencyGHz           *float64                                `json:"frequency_ghz"`
	Transmitter            SubTHZReferencePointInput               `json:"transmitter"`
	Receiver               SubTHZReferencePointInput               `json:"receiver"`
	Morphology             string                                  `json:"morphology"`
	RooftopRelation        string                                  `json:"rooftop_relation"`
	LOSState               string                                  `json:"los_state"`
	CandidateModelID       string                                  `json:"candidate_model_id"`
	Provenance             P1411ReferenceProvenanceInput           `json:"provenance"`
	AtmosphericReference   *SubTHZAtmosphericReferenceRequestInput `json:"atmospheric_reference,omitempty"`
	ResearchWallEventCount *int                                    `json:"research_wall_event_count,omitempty"`
}

type P1411ReferenceRequest struct {
	FrequencyGHz           float64                            `json:"frequency_ghz"`
	Transmitter            SubTHZReferencePoint               `json:"transmitter"`
	Receiver               SubTHZReferencePoint               `json:"receiver"`
	Morphology             string                             `json:"morphology"`
	RooftopRelation        string                             `json:"rooftop_relation"`
	LOSState               string                             `json:"los_state"`
	CandidateModelID       string                             `json:"candidate_model_id"`
	Provenance             P1411ReferenceProvenance           `json:"provenance"`
	AtmosphericReference   *SubTHZAtmosphericReferenceRequest `json:"atmospheric_reference,omitempty"`
	ResearchWallEventCount *int                               `json:"research_wall_event_count,omitempty"`
}

func (input P1411ReferenceRequestInput) ToRequest() P1411ReferenceRequest {
	request := P1411ReferenceRequest{
		FrequencyGHz:     valueOr(input.FrequencyGHz, 0),
		Transmitter:      p1411ReferencePoint(input.Transmitter),
		Receiver:         p1411ReferencePoint(input.Receiver),
		Morphology:       normalizeP1411Morphology(input.Morphology),
		RooftopRelation:  normalizeP1411RooftopRelation(input.RooftopRelation),
		LOSState:         normalizeP1411LOSState(input.LOSState),
		CandidateModelID: normalizeP1411CandidateID(input.CandidateModelID),
		Provenance: P1411ReferenceProvenance{
			FrequencyGHz:    p1411Source(input.Provenance.FrequencyGHz, P1411ProvenanceUserDeclared),
			DistanceM:       p1411Source(input.Provenance.DistanceM, P1411ProvenanceGeometryDerived),
			TxHeightM:       p1411Source(input.Provenance.TxHeightM, P1411ProvenanceUserDeclared),
			RxHeightM:       p1411Source(input.Provenance.RxHeightM, P1411ProvenanceUserDeclared),
			Morphology:      p1411Source(input.Provenance.Morphology, P1411ProvenanceUnknown),
			RooftopRelation: p1411Source(input.Provenance.RooftopRelation, P1411ProvenanceUnknown),
			LOSState:        p1411Source(input.Provenance.LOSState, P1411ProvenanceUnknown),
		},
		ResearchWallEventCount: input.ResearchWallEventCount,
	}
	if input.AtmosphericReference != nil {
		atmospheric := input.AtmosphericReference.ToRequest()
		request.AtmosphericReference = &atmospheric
	}
	return request
}

func p1411ReferencePoint(input SubTHZReferencePointInput) SubTHZReferencePoint {
	return SubTHZReferencePoint{
		Location: Point{Lon: valueOr(input.Lon, 0), Lat: valueOr(input.Lat, 0)},
		HeightM:  valueOr(input.HeightM, 0),
	}
}

func ValidateP1411ReferenceRequest(input P1411ReferenceRequestInput, request P1411ReferenceRequest) string {
	if input.FrequencyGHz == nil {
		return "frequency_ghz is required"
	}
	if input.Transmitter.Lon == nil || input.Transmitter.Lat == nil || input.Transmitter.HeightM == nil {
		return "transmitter lon, lat, and height_m are required"
	}
	if input.Receiver.Lon == nil || input.Receiver.Lat == nil || input.Receiver.HeightM == nil {
		return "receiver lon, lat, and height_m are required"
	}
	if !finiteNumber(request.FrequencyGHz) || request.FrequencyGHz < 1e-9 || request.FrequencyGHz > 1e6 {
		return "frequency_ghz must be a positive finite number"
	}
	for label, point := range map[string]SubTHZReferencePoint{"transmitter": request.Transmitter, "receiver": request.Receiver} {
		if !finiteInRange(point.Location.Lon, -180, 180) || !finiteInRange(point.Location.Lat, -90, 90) {
			return label + " coordinates are invalid"
		}
		if !finiteInRange(point.HeightM, 0, 10000) {
			return label + ".height_m must be between 0 and 10000"
		}
	}
	horizontal := ApproxDistanceMeters(request.Transmitter.Location, request.Receiver.Location)
	slant := math.Hypot(horizontal, request.Receiver.HeightM-request.Transmitter.HeightM)
	if !finiteInRange(horizontal, 0, P1411ReferenceMaxDistanceM) || !finiteInRange(slant, 0.01, P1411ReferenceMaxDistanceM) {
		return fmt.Sprintf("reference path distance must be between 0.01 and %.0f metres", P1411ReferenceMaxDistanceM)
	}
	if !p1411ValidMorphology(request.Morphology) {
		return "morphology must be urban_high_rise, urban_low_rise, suburban, or unknown"
	}
	if !p1411ValidRooftopRelation(request.RooftopRelation) {
		return "rooftop_relation must be both_below_rooftop, one_above_one_below, both_above_rooftop, or unknown"
	}
	if !p1411ValidLOSState(request.LOSState) {
		return "los_state must be los, nlos, or unknown"
	}
	if request.CandidateModelID != "" && !p1411CandidateIDKnown(request.CandidateModelID) {
		return "candidate_model_id is not one of the supported P.1411 Table 4 candidates"
	}
	for field, source := range map[string]string{
		"provenance.frequency_ghz":    request.Provenance.FrequencyGHz,
		"provenance.distance_m":       request.Provenance.DistanceM,
		"provenance.tx_height_m":      request.Provenance.TxHeightM,
		"provenance.rx_height_m":      request.Provenance.RxHeightM,
		"provenance.morphology":       request.Provenance.Morphology,
		"provenance.rooftop_relation": request.Provenance.RooftopRelation,
		"provenance.los_state":        request.Provenance.LOSState,
	} {
		if _, ok := p1411AllowedProvenanceSources[source]; !ok {
			return field + " is not a supported provenance source"
		}
	}
	if request.ResearchWallEventCount != nil && (*request.ResearchWallEventCount < 0 || *request.ResearchWallEventCount > 1000) {
		return "research_wall_event_count must be between 0 and 1000"
	}
	if request.AtmosphericReference != nil {
		if atmosphericError := ValidateSubTHZAtmosphericReferenceRequest(*input.AtmosphericReference, *request.AtmosphericReference); atmosphericError != "" {
			return "atmospheric_reference: " + atmosphericError
		}
		if math.Abs(request.AtmosphericReference.FrequencyGHz-request.FrequencyGHz) > 1e-9 ||
			!sameP1411Point(request.AtmosphericReference.Transmitter, request.Transmitter) ||
			!sameP1411Point(request.AtmosphericReference.Receiver, request.Receiver) {
			return "atmospheric_reference must use the same frequency and endpoints as the P.1411 request"
		}
	}
	return ""
}

func sameP1411Point(a, b SubTHZReferencePoint) bool {
	return math.Abs(a.Location.Lon-b.Location.Lon) <= 1e-9 && math.Abs(a.Location.Lat-b.Location.Lat) <= 1e-9 && math.Abs(a.HeightM-b.HeightM) <= 1e-9
}

func p1411Source(raw, fallback string) string {
	source := strings.ToLower(strings.TrimSpace(raw))
	if source == "" {
		return fallback
	}
	return source
}

func normalizeP1411Morphology(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "-", "_")
	value = strings.ReplaceAll(value, " ", "_")
	if value == "" {
		return P1411MorphologyUnknown
	}
	return value
}

func normalizeP1411RooftopRelation(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "-", "_")
	value = strings.ReplaceAll(value, " ", "_")
	if value == "" {
		return P1411RooftopUnknown
	}
	return value
}

func normalizeP1411LOSState(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return P1411LOSStateUnknown
	}
	return value
}

func normalizeP1411CandidateID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || strings.EqualFold(value, P1411DefaultCandidateSelection) {
		return ""
	}
	return value
}

func p1411ValidMorphology(value string) bool {
	return value == P1411MorphologyUrbanHighRise || value == P1411MorphologyUrbanLowRise || value == P1411MorphologySuburban || value == P1411MorphologyUnknown
}

func p1411ValidRooftopRelation(value string) bool {
	return value == P1411RooftopBothBelow || value == P1411RooftopOneAbove || value == P1411RooftopBothAbove || value == P1411RooftopUnknown
}

func p1411ValidLOSState(value string) bool {
	return value == P1411LOSStateLOS || value == P1411LOSStateNLOS || value == P1411LOSStateUnknown
}

type P1411CandidateDefinition struct {
	ModelID                   string     `json:"model_id"`
	Reference                 string     `json:"reference"`
	Revision                  string     `json:"revision"`
	Section                   string     `json:"section"`
	Table                     string     `json:"table"`
	Row                       string     `json:"row"`
	FrequencyRangeGHz         [2]float64 `json:"frequency_range_ghz"`
	GeneralDistanceRangeM     [2]float64 `json:"general_distance_range_m"`
	Morphologies              []string   `json:"morphologies"`
	RooftopRelation           string     `json:"rooftop_relation"`
	LOSState                  string     `json:"los_state"`
	Alpha                     float64    `json:"alpha"`
	Beta                      float64    `json:"beta"`
	Gamma                     float64    `json:"gamma"`
	SigmaDB                   float64    `json:"sigma_db"`
	FrequencyDistanceFootnote string     `json:"frequency_distance_footnote"`
	Equation                  string     `json:"equation"`
	StatisticalInterpretation string     `json:"statistical_interpretation"`
	SourceURL                 string     `json:"source_url"`
}

func p1411CandidateDefinitions() []P1411CandidateDefinition {
	return []P1411CandidateDefinition{
		{
			ModelID: "p1411_below_rooftop_los_v1", Reference: P1411Reference, Revision: P1411ReferenceRevision, Section: P1411ReferenceSection, Table: P1411ReferenceTable,
			Row: "Urban high-rise, urban low-rise/suburban, LoS", FrequencyRangeGHz: [2]float64{0.45, 300}, GeneralDistanceRangeM: [2]float64{5, 660},
			Morphologies: []string{P1411MorphologyUrbanHighRise, P1411MorphologyUrbanLowRise, P1411MorphologySuburban}, RooftopRelation: P1411RooftopBothBelow, LOSState: P1411LOSStateLOS,
			Alpha: 2.07, Beta: 31.23, Gamma: 2.06, SigmaDB: 4.91,
			FrequencyDistanceFootnote: "Table 4 footnote (1): recommended up to 500 m for 82 < f <= 159 GHz, 250 m for 159 < f <= 255 GHz, and 155 m for 255 < f <= 300 GHz; otherwise the Table 4 nominal maximum applies.",
			Equation:                  "Lb(d,f) = 10 alpha log10(d) + beta + 10 gamma log10(f) dB; d is 3D direct distance in metres and f is GHz.",
			StatisticalInterpretation: "Median/basic transmission loss prediction; the source adds zero-mean Gaussian N(0, sigma) with sigma in dB for statistical variation. This implementation returns the median only and never samples.", SourceURL: P1411ReferenceURL,
		},
		{
			ModelID: "p1411_urban_highrise_nlos_v1", Reference: P1411Reference, Revision: P1411ReferenceRevision, Section: P1411ReferenceSection, Table: P1411ReferenceTable,
			Row: "Urban high-rise, NLoS", FrequencyRangeGHz: [2]float64{0.8, 159}, GeneralDistanceRangeM: [2]float64{20, 715},
			Morphologies: []string{P1411MorphologyUrbanHighRise}, RooftopRelation: P1411RooftopBothBelow, LOSState: P1411LOSStateNLOS,
			Alpha: 3.73, Beta: 16.02, Gamma: 2.26, SigmaDB: 7.62,
			FrequencyDistanceFootnote: "Table 4 footnote (2): recommended up to 150 m for 82 < f <= 159 GHz; otherwise the Table 4 nominal maximum applies.",
			Equation:                  "Lb(d,f) = 10 alpha log10(d) + beta + 10 gamma log10(f) dB; d is 3D direct distance in metres and f is GHz.",
			StatisticalInterpretation: "Median/basic transmission loss prediction; the source adds zero-mean Gaussian N(0, sigma) with sigma in dB for statistical variation. This implementation returns the median only and never samples.", SourceURL: P1411ReferenceURL,
		},
		{
			ModelID: "p1411_urban_lowrise_nlos_v1", Reference: P1411Reference, Revision: P1411ReferenceRevision, Section: P1411ReferenceSection, Table: P1411ReferenceTable,
			Row: "Urban low-rise/suburban, NLoS", FrequencyRangeGHz: [2]float64{0.45, 255}, GeneralDistanceRangeM: [2]float64{10, 250},
			Morphologies: []string{P1411MorphologyUrbanLowRise, P1411MorphologySuburban}, RooftopRelation: P1411RooftopBothBelow, LOSState: P1411LOSStateNLOS,
			Alpha: 4.52, Beta: 6.04, Gamma: 2.14, SigmaDB: 8.02,
			FrequencyDistanceFootnote: "Table 4 footnote (3): recommended up to 150 m for 73 < f <= 159 GHz and 80 m for 159 < f <= 255 GHz; otherwise the Table 4 nominal maximum applies.",
			Equation:                  "Lb(d,f) = 10 alpha log10(d) + beta + 10 gamma log10(f) dB; d is 3D direct distance in metres and f is GHz.",
			StatisticalInterpretation: "Median/basic transmission loss prediction; the source adds zero-mean Gaussian N(0, sigma) with sigma in dB for statistical variation. This implementation returns the median only and never samples.", SourceURL: P1411ReferenceURL,
		},
	}
}

func p1411CandidateIDKnown(id string) bool {
	for _, definition := range p1411CandidateDefinitions() {
		if definition.ModelID == id {
			return true
		}
	}
	return false
}

type P1411SceneContext struct {
	FrequencyGHz          float64                  `json:"frequency_ghz"`
	HorizontalDistanceM   float64                  `json:"horizontal_distance_m"`
	SlantDistanceM        float64                  `json:"slant_distance_m"`
	HeightDeltaM          float64                  `json:"height_delta_m"`
	TxHeightM             float64                  `json:"tx_height_m"`
	RxHeightM             float64                  `json:"rx_height_m"`
	Morphology            string                   `json:"morphology"`
	RooftopRelation       string                   `json:"rooftop_relation"`
	LOSState              string                   `json:"los_state"`
	Provenance            P1411ReferenceProvenance `json:"provenance"`
	ScenarioMode          string                   `json:"scenario_mode"`
	BuildingDataAvailable bool                     `json:"building_data_available"`
	TerrainDataAvailable  bool                     `json:"terrain_data_available"`
}

type P1411Applicability struct {
	Status                   string      `json:"status"`
	Applicable               bool        `json:"applicable"`
	Reasons                  []string    `json:"reasons,omitempty"`
	GeneralFrequencyRangeGHz [2]float64  `json:"general_frequency_range_ghz"`
	GeneralDistanceRangeM    [2]float64  `json:"general_distance_range_m"`
	EffectiveDistanceRangeM  *[2]float64 `json:"effective_distance_range_m,omitempty"`
	ValidatedAtFrequencyGHz  float64     `json:"validated_at_frequency_ghz"`
	Morphologies             []string    `json:"morphologies"`
	RequiredRooftopRelation  string      `json:"required_rooftop_relation"`
	RequiredLOSState         string      `json:"required_los_state"`
	EnvelopeRule             string      `json:"envelope_rule"`
}

type P1411CandidateInputs struct {
	FrequencyGHz        float64                  `json:"frequency_ghz"`
	HorizontalDistanceM float64                  `json:"horizontal_distance_m"`
	SlantDistanceM      float64                  `json:"slant_distance_m"`
	TxHeightM           float64                  `json:"tx_height_m"`
	RxHeightM           float64                  `json:"rx_height_m"`
	Morphology          string                   `json:"morphology"`
	RooftopRelation     string                   `json:"rooftop_relation"`
	LOSState            string                   `json:"los_state"`
	Provenance          P1411ReferenceProvenance `json:"provenance"`
}

type P1411Coefficients struct {
	Alpha float64 `json:"alpha"`
	Beta  float64 `json:"beta"`
	Gamma float64 `json:"gamma"`
}

type P1411ModelOutput struct {
	Status               string            `json:"status"`
	Equation             string            `json:"equation"`
	Coefficients         P1411Coefficients `json:"coefficients"`
	DistanceLog10        *float64          `json:"distance_log10,omitempty"`
	FrequencyLog10       *float64          `json:"frequency_log10,omitempty"`
	DistanceTermDB       *float64          `json:"distance_term_db,omitempty"`
	FrequencyTermDB      *float64          `json:"frequency_term_db,omitempty"`
	OffsetDB             float64           `json:"offset_db"`
	MedianPathLossDB     *float64          `json:"median_path_loss_db,omitempty"`
	RandomFadingIncluded bool              `json:"random_fading_included"`
	WallLossDB           float64           `json:"wall_loss_db"`
	Note                 string            `json:"note"`
}

type P1411Uncertainty struct {
	SigmaDB           float64 `json:"sigma_db"`
	Distribution      string  `json:"distribution"`
	MeanOffsetDB      float64 `json:"mean_offset_db"`
	P50OffsetDB       float64 `json:"p50_offset_db"`
	Interpretation    string  `json:"interpretation"`
	RandomSampling    bool    `json:"random_sampling"`
	ReportedStatistic string  `json:"reported_statistic"`
}

type P1411P525Comparison struct {
	Reference              string   `json:"reference"`
	ReferenceURL           string   `json:"reference_url"`
	Equation               string   `json:"equation"`
	SlantDistanceM         float64  `json:"slant_distance_m"`
	FSPLDB                 float64  `json:"fspl_db"`
	ExcessRelativeToFSPLDB *float64 `json:"excess_relative_to_fspl_db,omitempty"`
	IncludedInP1411Median  bool     `json:"included_in_p1411_median"`
	Note                   string   `json:"note"`
}

type P1411AtmosphericComparison struct {
	Status                    string   `json:"status"`
	ReferenceModelID          string   `json:"reference_model_id"`
	Reference                 string   `json:"reference"`
	ReferenceURL              string   `json:"reference_url"`
	FreeSpaceDB               *float64 `json:"free_space_db,omitempty"`
	GasDB                     *float64 `json:"gas_db,omitempty"`
	RainDB                    *float64 `json:"rain_db,omitempty"`
	LocalFogDB                *float64 `json:"local_fog_db,omitempty"`
	TotalPathLossDB           *float64 `json:"total_path_loss_db,omitempty"`
	DifferenceToP1411MedianDB *float64 `json:"difference_to_p1411_median_db,omitempty"`
	IncludedInP1411Median     bool     `json:"included_in_p1411_median"`
	CanonicalNetworkCoupling  bool     `json:"canonical_network_coupling"`
	Note                      string   `json:"note"`
}

type P1411ResearchComparison struct {
	Status                    string   `json:"status"`
	ReferenceModelID          string   `json:"reference_model_id"`
	FrequencyGHz              float64  `json:"frequency_ghz"`
	WallEventCount            *int     `json:"wall_event_count,omitempty"`
	FreeSpaceDB               *float64 `json:"free_space_db,omitempty"`
	WallLossDB                *float64 `json:"wall_loss_db,omitempty"`
	TotalPathLossDB           *float64 `json:"total_path_loss_db,omitempty"`
	DifferenceToP1411MedianDB *float64 `json:"difference_to_p1411_median_db,omitempty"`
	IncludedInP1411Median     bool     `json:"included_in_p1411_median"`
	CanonicalNetworkCoupling  bool     `json:"canonical_network_coupling"`
	Note                      string   `json:"note"`
}

type P1411HeightEvidence struct {
	BuildingID        string   `json:"building_id"`
	LogicalBuildingID string   `json:"logical_building_id,omitempty"`
	HeightM           *float64 `json:"height_m,omitempty"`
	HeightSource      string   `json:"height_source"`
	Known             bool     `json:"known"`
}

type P1411ObstructionContext struct {
	DatasetAvailable            bool                  `json:"building_dataset_available"`
	BuildingIntersectionPresent bool                  `json:"building_intersection_present"`
	BuildingIntersectionCount   int                   `json:"building_intersection_count"`
	BuildingIDs                 []string              `json:"building_ids,omitempty"`
	KnownHeightBuildingIDs      []string              `json:"known_height_building_ids,omitempty"`
	UnknownHeightBuildingIDs    []string              `json:"unknown_height_building_ids,omitempty"`
	KnownHeightCount            int                   `json:"known_height_count"`
	UnknownHeightCount          int                   `json:"unknown_height_count"`
	HeightEvidence              []P1411HeightEvidence `json:"height_evidence,omitempty"`
	TransmitterInsideBuilding   bool                  `json:"transmitter_inside_building"`
	ReceiverInsideBuilding      bool                  `json:"receiver_inside_building"`
	WallLossApplied             bool                  `json:"wall_loss_applied"`
	DiffractionApplied          bool                  `json:"diffraction_applied"`
	MaterialLossApplied         bool                  `json:"material_loss_applied"`
	Note                        string                `json:"note"`
}

type P1411CandidateResult struct {
	ModelID                        string                     `json:"model_id"`
	Reference                      string                     `json:"reference"`
	Revision                       string                     `json:"revision"`
	Section                        string                     `json:"section"`
	Table                          string                     `json:"table"`
	Row                            string                     `json:"row"`
	SourceURL                      string                     `json:"source_url"`
	SourcePDFURL                   string                     `json:"source_pdf_url"`
	Applicability                  P1411Applicability         `json:"applicability"`
	Inputs                         P1411CandidateInputs       `json:"inputs"`
	Model                          P1411ModelOutput           `json:"model"`
	Uncertainty                    P1411Uncertainty           `json:"uncertainty"`
	P525Comparison                 P1411P525Comparison        `json:"p525_comparison"`
	ExternalAtmosphericComposition P1411AtmosphericComparison `json:"external_atmospheric_composition"`
	ResearchSubTHZComparison       P1411ResearchComparison    `json:"research_sub_thz_comparison"`
	Obstruction                    P1411ObstructionContext    `json:"obstruction"`
	Limitations                    []string                   `json:"limitations"`
	NonClaims                      []string                   `json:"non_claims"`
}

type P1411ReferenceResponse struct {
	ReferenceModelID     string                  `json:"reference_model_id"`
	Reference            string                  `json:"reference"`
	Revision             string                  `json:"revision"`
	Section              string                  `json:"section"`
	Table                string                  `json:"table"`
	ReferenceURL         string                  `json:"reference_url"`
	ReferencePDFURL      string                  `json:"reference_pdf_url"`
	RequestedModelID     string                  `json:"requested_model_id"`
	Candidates           []P1411CandidateResult  `json:"candidates"`
	ApplicableCandidates []string                `json:"applicable_candidates"`
	ComparisonNotes      []string                `json:"comparison_notes"`
	SceneContext         P1411SceneContext       `json:"scene_context"`
	Obstruction          P1411ObstructionContext `json:"obstruction"`
	Limitations          []string                `json:"limitations"`
	Fingerprint          string                  `json:"fingerprint"`
}

func EvaluateP1411ReferenceContext(ctx context.Context, request P1411ReferenceRequest, buildings *BuildingIndex) (P1411ReferenceResponse, error) {
	if err := ctx.Err(); err != nil {
		return P1411ReferenceResponse{}, err
	}
	if err := validateP1411ReferenceRequest(request); err != nil {
		return P1411ReferenceResponse{}, err
	}
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}
	horizontal := ApproxDistanceMeters(request.Transmitter.Location, request.Receiver.Location)
	slant := math.Hypot(horizontal, request.Receiver.HeightM-request.Transmitter.HeightM)
	obstruction, err := p1411ObstructionContext(ctx, request, buildings)
	if err != nil {
		return P1411ReferenceResponse{}, err
	}
	scene := P1411SceneContext{
		FrequencyGHz: request.FrequencyGHz, HorizontalDistanceM: horizontal, SlantDistanceM: slant,
		HeightDeltaM: request.Receiver.HeightM - request.Transmitter.HeightM, TxHeightM: request.Transmitter.HeightM, RxHeightM: request.Receiver.HeightM,
		Morphology: request.Morphology, RooftopRelation: request.RooftopRelation, LOSState: request.LOSState, Provenance: request.Provenance,
		ScenarioMode: p1411ScenarioMode(request), BuildingDataAvailable: obstruction.DatasetAvailable, TerrainDataAvailable: false,
	}
	atmosphericComparison := P1411AtmosphericComparison{
		Status: "deferred_unvalidated", ReferenceModelID: SubTHZAtmosphericReferenceModelID, Reference: "A.T.O.M. Concept 4I.2A atmospheric reference",
		ReferenceURL: P67613ReferenceURL, IncludedInP1411Median: false, CanonicalNetworkCoupling: false,
		Note: "P.676/P.838/P.840 composition is deferred unless explicitly requested as a side-by-side alternative; it is never summed into the P.1411 median.",
	}
	if request.AtmosphericReference != nil {
		atmosphericResponse, atmosphericErr := EvaluateSubTHZAtmosphericReferenceContext(ctx, *request.AtmosphericReference, buildings)
		if atmosphericErr != nil {
			return P1411ReferenceResponse{}, atmosphericErr
		}
		atmosphericComparison = P1411AtmosphericComparison{
			Status: P1411AtmosphericComparisonStatus, ReferenceModelID: atmosphericResponse.ReferenceModelID,
			Reference: "A.T.O.M. Concept 4I.2A atmospheric reference", ReferenceURL: P67613ReferenceURL,
			FreeSpaceDB: floatPointer(atmosphericResponse.FSPL.FSPLDB), GasDB: floatPointer(atmosphericResponse.Gas.PathLossDB),
			RainDB: floatPointer(atmosphericResponse.Rain.PathLossDB), LocalFogDB: floatPointer(atmosphericResponse.LocalFog.PathLossDB),
			TotalPathLossDB: floatPointer(atmosphericResponse.Total.TotalPathLossDB), IncludedInP1411Median: false, CanonicalNetworkCoupling: false,
			Note: "Alternative reference calculation only. Its FSPL, gas, rain, and local-fog terms are not added to the P.1411 empirical median.",
		}
	}
	researchComparison := p1411ResearchComparison(request, slant)
	p525FSPL := p1411ExactFSPL(slant, request.FrequencyGHz)

	definitions := p1411CandidateDefinitions()
	if request.CandidateModelID != "" {
		filtered := make([]P1411CandidateDefinition, 0, 1)
		for _, definition := range definitions {
			if definition.ModelID == request.CandidateModelID {
				filtered = append(filtered, definition)
			}
		}
		definitions = filtered
	}
	candidates := make([]P1411CandidateResult, 0, len(definitions))
	applicable := make([]string, 0, len(definitions))
	for _, definition := range definitions {
		result := p1411CandidateResult(request, definition, horizontal, slant, p525FSPL, atmosphericComparison, researchComparison, obstruction)
		if result.Applicability.Applicable {
			applicable = append(applicable, result.ModelID)
		}
		candidates = append(candidates, result)
	}
	return P1411ReferenceResponse{
		ReferenceModelID: P1411ReferenceModelID, Reference: P1411Reference, Revision: P1411ReferenceRevision,
		Section: P1411ReferenceSection, Table: P1411ReferenceTable, ReferenceURL: P1411ReferenceURL, ReferencePDFURL: P1411ReferencePDFURL, RequestedModelID: request.CandidateModelID,
		Candidates: candidates, ApplicableCandidates: applicable,
		ComparisonNotes: []string{
			"P.1411 Table 4 is evaluated as a median/basic-transmission-loss reference. P.525 FSPL is shown as a comparison baseline, never added to the P.1411 result.",
			"P.676/P.838/P.840 atmospheric terms and the research_sub_thz profile are separate alternative calculations. They are never composed with this P.1411 median.",
			"The Table 4 sigma values are returned as statistical metadata. No random fading or Gaussian sample is generated.",
			"Candidates are displayed side by side; no candidate is ranked, calibrated, or promoted to canonical network RF.",
		},
		SceneContext: scene, Obstruction: obstruction,
		Limitations: p1411GlobalLimitations(), Fingerprint: p1411ReferenceFingerprint(request),
	}, nil
}

func validateP1411ReferenceRequest(request P1411ReferenceRequest) error {
	if !finiteNumber(request.FrequencyGHz) || request.FrequencyGHz < 1e-9 || request.FrequencyGHz > 1e6 {
		return errors.New("frequency_ghz must be a positive finite number")
	}
	if !finiteInRange(request.Transmitter.Location.Lon, -180, 180) || !finiteInRange(request.Transmitter.Location.Lat, -90, 90) || !finiteInRange(request.Receiver.Location.Lon, -180, 180) || !finiteInRange(request.Receiver.Location.Lat, -90, 90) {
		return errors.New("reference coordinates are invalid")
	}
	if !finiteInRange(request.Transmitter.HeightM, 0, 10000) || !finiteInRange(request.Receiver.HeightM, 0, 10000) {
		return errors.New("reference endpoint heights are invalid")
	}
	horizontal := ApproxDistanceMeters(request.Transmitter.Location, request.Receiver.Location)
	slant := math.Hypot(horizontal, request.Receiver.HeightM-request.Transmitter.HeightM)
	if !finiteInRange(slant, 0.01, P1411ReferenceMaxDistanceM) {
		return errors.New("reference path distance is outside the supported range")
	}
	if !p1411ValidMorphology(request.Morphology) || !p1411ValidRooftopRelation(request.RooftopRelation) || !p1411ValidLOSState(request.LOSState) {
		return errors.New("reference scenario values are invalid")
	}
	if request.CandidateModelID != "" && !p1411CandidateIDKnown(request.CandidateModelID) {
		return errors.New("candidate_model_id is not supported")
	}
	for field, source := range map[string]string{
		"provenance.frequency_ghz":    request.Provenance.FrequencyGHz,
		"provenance.distance_m":       request.Provenance.DistanceM,
		"provenance.tx_height_m":      request.Provenance.TxHeightM,
		"provenance.rx_height_m":      request.Provenance.RxHeightM,
		"provenance.morphology":       request.Provenance.Morphology,
		"provenance.rooftop_relation": request.Provenance.RooftopRelation,
		"provenance.los_state":        request.Provenance.LOSState,
	} {
		if _, ok := p1411AllowedProvenanceSources[source]; !ok {
			return fmt.Errorf("%s is not a supported provenance source", field)
		}
	}
	return nil
}

func p1411ScenarioMode(request P1411ReferenceRequest) string {
	if request.Morphology == P1411MorphologyUnknown || request.RooftopRelation == P1411RooftopUnknown || request.LOSState == P1411LOSStateUnknown {
		return "insufficient_explicit_scenario_evidence"
	}
	return "explicit_scenario_reference_only"
}

func p1411EffectiveDistanceRange(definition P1411CandidateDefinition, frequencyGHz float64) *[2]float64 {
	if frequencyGHz < definition.FrequencyRangeGHz[0] || frequencyGHz > definition.FrequencyRangeGHz[1] {
		return nil
	}
	maxDistance := definition.GeneralDistanceRangeM[1]
	switch definition.ModelID {
	case "p1411_below_rooftop_los_v1":
		if frequencyGHz > 82 && frequencyGHz <= 159 {
			maxDistance = 500
		} else if frequencyGHz > 159 && frequencyGHz <= 255 {
			maxDistance = 250
		} else if frequencyGHz > 255 && frequencyGHz <= 300 {
			maxDistance = 155
		}
	case "p1411_urban_highrise_nlos_v1":
		if frequencyGHz > 82 && frequencyGHz <= 159 {
			maxDistance = 150
		}
	case "p1411_urban_lowrise_nlos_v1":
		if frequencyGHz > 73 && frequencyGHz <= 159 {
			maxDistance = 150
		} else if frequencyGHz > 159 && frequencyGHz <= 255 {
			maxDistance = 80
		}
	}
	return &[2]float64{definition.GeneralDistanceRangeM[0], maxDistance}
}

func p1411CandidateResult(request P1411ReferenceRequest, definition P1411CandidateDefinition, horizontal, slant, p525FSPL float64, atmospheric P1411AtmosphericComparison, research P1411ResearchComparison, obstruction P1411ObstructionContext) P1411CandidateResult {
	applicability := p1411CandidateApplicability(request, definition, slant)
	inputs := P1411CandidateInputs{
		FrequencyGHz: request.FrequencyGHz, HorizontalDistanceM: horizontal, SlantDistanceM: slant,
		TxHeightM: request.Transmitter.HeightM, RxHeightM: request.Receiver.HeightM,
		Morphology: request.Morphology, RooftopRelation: request.RooftopRelation, LOSState: request.LOSState, Provenance: request.Provenance,
	}
	model := P1411ModelOutput{
		Status: "not_available_due_to_inapplicability", Equation: definition.Equation,
		Coefficients: P1411Coefficients{Alpha: definition.Alpha, Beta: definition.Beta, Gamma: definition.Gamma},
		OffsetDB:     definition.Beta, RandomFadingIncluded: false, WallLossDB: 0,
		Note: "P.1411 median only; no wall, diffraction, material, research 80 dB, or atmospheric term is added.",
	}
	if applicability.Applicable {
		distanceLog := math.Log10(slant)
		frequencyLog := math.Log10(request.FrequencyGHz)
		distanceTerm := 10 * definition.Alpha * distanceLog
		frequencyTerm := 10 * definition.Gamma * frequencyLog
		median := distanceTerm + definition.Beta + frequencyTerm
		model.Status = "median_available"
		model.DistanceLog10 = floatPointer(distanceLog)
		model.FrequencyLog10 = floatPointer(frequencyLog)
		model.DistanceTermDB = floatPointer(distanceTerm)
		model.FrequencyTermDB = floatPointer(frequencyTerm)
		model.MedianPathLossDB = floatPointer(median)
	}
	uncertainty := P1411Uncertainty{
		SigmaDB: definition.SigmaDB, Distribution: "zero_mean_gaussian_N(0,sigma)",
		MeanOffsetDB: 0, P50OffsetDB: 0, Interpretation: definition.StatisticalInterpretation,
		RandomSampling: false, ReportedStatistic: "median_basic_transmission_loss",
	}
	p525 := P1411P525Comparison{
		Reference: P1411P525ComparisonReference, ReferenceURL: P5255ReferenceURL,
		Equation: "FSPL = 20 log10(4 pi d / lambda), lambda = c / (f GHz * 1e9)", SlantDistanceM: slant, FSPLDB: p525FSPL,
		IncludedInP1411Median: false, Note: "Exact wavelength-form P.525 comparison at the same 3D slant distance; it is not an additive P.1411 term.",
	}
	if model.MedianPathLossDB != nil {
		difference := *model.MedianPathLossDB - p525FSPL
		p525.ExcessRelativeToFSPLDB = &difference
	}
	if atmospheric.TotalPathLossDB != nil && model.MedianPathLossDB != nil {
		difference := *atmospheric.TotalPathLossDB - *model.MedianPathLossDB
		atmospheric.DifferenceToP1411MedianDB = &difference
	}
	if research.TotalPathLossDB != nil && model.MedianPathLossDB != nil {
		difference := *research.TotalPathLossDB - *model.MedianPathLossDB
		research.DifferenceToP1411MedianDB = &difference
	}
	return P1411CandidateResult{
		ModelID: definition.ModelID, Reference: definition.Reference, Revision: definition.Revision, Section: definition.Section, Table: definition.Table, Row: definition.Row, SourceURL: definition.SourceURL, SourcePDFURL: P1411ReferencePDFURL,
		Applicability: applicability, Inputs: inputs, Model: model, Uncertainty: uncertainty, P525Comparison: p525,
		ExternalAtmosphericComposition: atmospheric, ResearchSubTHZComparison: research, Obstruction: obstruction,
		Limitations: p1411CandidateLimitations(definition), NonClaims: p1411CandidateNonClaims(),
	}
}

func p1411CandidateApplicability(request P1411ReferenceRequest, definition P1411CandidateDefinition, slant float64) P1411Applicability {
	effective := p1411EffectiveDistanceRange(definition, request.FrequencyGHz)
	result := P1411Applicability{
		Status: "inapplicable", Applicable: false, GeneralFrequencyRangeGHz: definition.FrequencyRangeGHz, GeneralDistanceRangeM: definition.GeneralDistanceRangeM,
		EffectiveDistanceRangeM: effective, ValidatedAtFrequencyGHz: request.FrequencyGHz, Morphologies: append([]string(nil), definition.Morphologies...),
		RequiredRooftopRelation: definition.RooftopRelation, RequiredLOSState: definition.LOSState, EnvelopeRule: definition.FrequencyDistanceFootnote,
	}
	if request.FrequencyGHz < definition.FrequencyRangeGHz[0] || request.FrequencyGHz > definition.FrequencyRangeGHz[1] {
		result.Reasons = append(result.Reasons, "frequency_out_of_range")
	}
	if effective != nil && (slant < definition.GeneralDistanceRangeM[0] || slant > definition.GeneralDistanceRangeM[1] || slant < effective[0] || slant > effective[1]) {
		result.Reasons = append(result.Reasons, "distance_out_of_range")
	}
	if request.Morphology == P1411MorphologyUnknown {
		result.Reasons = append(result.Reasons, "morphology_unknown")
	} else if !containsString(definition.Morphologies, request.Morphology) {
		result.Reasons = append(result.Reasons, "morphology_mismatch")
	}
	if request.RooftopRelation == P1411RooftopUnknown {
		result.Reasons = append(result.Reasons, "rooftop_relation_unknown")
	} else if request.RooftopRelation != definition.RooftopRelation {
		result.Reasons = append(result.Reasons, "rooftop_relation_mismatch")
		result.Reasons = append(result.Reasons, "unsupported_geometry")
	}
	if request.LOSState == P1411LOSStateUnknown {
		result.Reasons = append(result.Reasons, "los_state_unknown")
	} else if request.LOSState != definition.LOSState {
		result.Reasons = append(result.Reasons, "los_state_mismatch")
	}
	for _, source := range []string{request.Provenance.Morphology, request.Provenance.RooftopRelation, request.Provenance.LOSState} {
		if source == P1411ProvenanceUnknown {
			result.Reasons = append(result.Reasons, "insufficient_scene_evidence")
			break
		}
	}
	if len(result.Reasons) == 0 {
		result.Status = "applicable"
		result.Applicable = true
	}
	return result
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func p1411ExactFSPL(distanceM, frequencyGHz float64) float64 {
	wavelengthM := 299792458.0 / (frequencyGHz * 1e9)
	return 20 * math.Log10(4*math.Pi*distanceM/wavelengthM)
}

func p1411ResearchComparison(request P1411ReferenceRequest, slant float64) P1411ResearchComparison {
	comparison := P1411ResearchComparison{
		Status: "deferred_not_requested", ReferenceModelID: P1411ResearchComparisonModelID, FrequencyGHz: request.FrequencyGHz,
		IncludedInP1411Median: false, CanonicalNetworkCoupling: false,
		Note: "The existing research_sub_thz profile is a separate alternative. Its wall-event term is not included in the P.1411 median.",
	}
	if request.ResearchWallEventCount == nil {
		return comparison
	}
	comparison.WallEventCount = intPointer(*request.ResearchWallEventCount)
	if math.Abs(request.FrequencyGHz-140) > 1e-9 {
		comparison.Status = "out_of_scope"
		comparison.Note = "The current research_sub_thz 80 dB wall-event comparison is only exposed at its 140 GHz planning-profile frequency."
		return comparison
	}
	fspl := p1411ExactFSPL(slant, request.FrequencyGHz)
	wallLoss := float64(*request.ResearchWallEventCount) * P1411ResearchWallLossPerEventDB
	total := fspl + wallLoss
	comparison.Status = P1411ResearchComparisonStatus
	comparison.FreeSpaceDB, comparison.WallLossDB, comparison.TotalPathLossDB = floatPointer(fspl), floatPointer(wallLoss), floatPointer(total)
	return comparison
}

func p1411ObstructionContext(ctx context.Context, request P1411ReferenceRequest, buildings *BuildingIndex) (P1411ObstructionContext, error) {
	status := P1411ObstructionContext{
		WallLossApplied: false, DiffractionApplied: false, MaterialLossApplied: false,
		Note: "Building geometry is diagnostic context only. It does not select a P.1411 row and contributes no wall, diffraction, material, or roof-screen loss.",
	}
	if buildings == nil || buildings.Len() == 0 {
		status.Note = "No building index was available. P.1411 scenario facts remain explicit request inputs; obstruction and height evidence are unavailable."
		return status, nil
	}
	status.DatasetAvailable = true
	geometry, err := buildPropagationPathGeometryContextWithOptions(ctx, request.Transmitter.Location, request.Receiver.Location, buildings, propagationPathGeometryOptions{
		TxHeightM: request.Transmitter.HeightM, RxHeightM: request.Receiver.HeightM,
	})
	if err != nil {
		return P1411ObstructionContext{}, err
	}
	ids := make(map[string]struct{})
	for _, intersection := range geometry.intersections {
		if intersection.buildingID != "" {
			ids[intersection.buildingID] = struct{}{}
		}
	}
	if tx := buildings.BuildingAt(request.Transmitter.Location); tx != nil {
		ids[tx.ID] = struct{}{}
		status.TransmitterInsideBuilding = true
	}
	if rx := buildings.BuildingAt(request.Receiver.Location); rx != nil {
		ids[rx.ID] = struct{}{}
		status.ReceiverInsideBuilding = true
	}
	for _, evidence := range geometry.heightEvidence {
		if evidence.building == nil {
			continue
		}
		buildingID := evidence.building.ID
		logicalID := logicalBuildingID(evidence.building)
		if logicalID == "" {
			logicalID = buildingID
		}
		height, source, _, known := heightEvidenceForBuilding(evidence.building)
		evidenceRow := P1411HeightEvidence{BuildingID: buildingID, LogicalBuildingID: logicalID, HeightSource: source, Known: known}
		if known {
			evidenceRow.HeightM = floatPointer(height)
			status.KnownHeightBuildingIDs = appendP1411UniqueString(status.KnownHeightBuildingIDs, logicalID)
		} else {
			status.UnknownHeightBuildingIDs = appendP1411UniqueString(status.UnknownHeightBuildingIDs, logicalID)
		}
		status.HeightEvidence = append(status.HeightEvidence, evidenceRow)
	}
	status.BuildingIDs = make([]string, 0, len(ids))
	for id := range ids {
		status.BuildingIDs = append(status.BuildingIDs, id)
	}
	sort.Strings(status.BuildingIDs)
	sort.Strings(status.KnownHeightBuildingIDs)
	sort.Strings(status.UnknownHeightBuildingIDs)
	sort.SliceStable(status.HeightEvidence, func(i, j int) bool {
		if status.HeightEvidence[i].LogicalBuildingID == status.HeightEvidence[j].LogicalBuildingID {
			return status.HeightEvidence[i].BuildingID < status.HeightEvidence[j].BuildingID
		}
		return status.HeightEvidence[i].LogicalBuildingID < status.HeightEvidence[j].LogicalBuildingID
	})
	status.BuildingIntersectionCount = len(status.BuildingIDs)
	status.BuildingIntersectionPresent = status.BuildingIntersectionCount > 0
	status.KnownHeightCount = len(status.KnownHeightBuildingIDs)
	status.UnknownHeightCount = len(status.UnknownHeightBuildingIDs)
	return status, nil
}

func appendP1411UniqueString(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func p1411CandidateLimitations(definition P1411CandidateDefinition) []string {
	return []string{
		"This is a strict Table 4 candidate check; no extrapolation outside the published frequency or effective distance envelope is returned.",
		"The candidate is site-general below-rooftop only. P.1411 does not receive an inferred rooftop relation from generic antenna-height defaults.",
		"The reported median does not include P.525, P.676, P.838, P.840, research_sub_thz, wall, diffraction, material, foliage, or receiver-threshold terms.",
		"The Table 4 sigma is a statistical uncertainty descriptor, not a deterministic loss adjustment.",
		"The source row is not a 140 GHz measurement validation or calibration claim for the Ankara dataset.",
		definition.FrequencyDistanceFootnote,
	}
}

func p1411CandidateNonClaims() []string {
	return []string{
		"not a canonical network propagation model",
		"not a coverage, reach, SINR, RSRP, serviceability, interference, optimization, or building-entry result",
		"not a wall-loss or diffraction prediction",
		"not a recommendation or ranking among Table 4 rows",
		"not a measured-channel calibration",
	}
}

func p1411GlobalLimitations() []string {
	return []string{
		"P.1411 Table 4 candidates are intentionally isolated from canonical simulation and network workflows.",
		"Current Ankara morphology taxonomy and provable both-below-rooftop relation are not inferred from generic building-height fallbacks.",
		"Building intersections and height evidence are reported for audit context only; they do not automatically establish a P.1411 scenario.",
		"The source's NLoS statistical construction and excess relative to FSPL are documented as limitations/metadata; no second stochastic or additive output is produced.",
	}
}

func p1411ReferenceFingerprint(request P1411ReferenceRequest) string {
	payload := struct {
		ModelID   string                `json:"model_id"`
		Reference string                `json:"reference"`
		Revision  string                `json:"revision"`
		Request   P1411ReferenceRequest `json:"request"`
	}{ModelID: P1411ReferenceModelID, Reference: P1411Reference, Revision: P1411ReferenceRevision, Request: request}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "p1411-reference-invalid"
	}
	digest := sha256.Sum256(encoded)
	return "p1411-reference-" + hex.EncodeToString(digest[:])
}
