package raytracer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

// Concept 4F.3A deliberately keeps spatial evidence separate from the
// canonical propagation inputs. These types describe what a source says and
// how it was obtained; they do not silently promote a value into RF physics.
const (
	SpatialEvidenceSchemaVersion = "atom-spatial-evidence-v1"
	SpatialMatchingPolicyVersion = "footprint-height-match-v1"
	SpatialDatumPolicyVersion    = "explicit-compatible-datum-v1"

	TerrainKindDTM               TerrainKind = "dtm"
	TerrainKindDSM               TerrainKind = "dsm"
	TerrainKindDEMUnspecified    TerrainKind = "dem_unspecified"
	TerrainInterpolationNearest              = "nearest"
	TerrainInterpolationBilinear             = "bilinear"
	TerrainSampleSource                      = "measured_or_source"
	TerrainSampleInterpolated                = "interpolated"
	TerrainSampleUnavailable                 = "unavailable"
	TerrainSampleOutsideDataset              = "outside_dataset"
	TerrainSampleNoData                      = "no_data"

	VerticalDatumOrthometric = "orthometric"
	VerticalDatumEllipsoidal = "ellipsoidal"
	VerticalDatumUnknown     = "unknown"

	SpatialHeightOSMExplicit SpatialHeightProvenance = "osm_explicit_height"
	SpatialHeightOSMLevels   SpatialHeightProvenance = "osm_levels_derived"
	SpatialHeightExternal    SpatialHeightProvenance = "external_building_height"
	SpatialHeightDSMMinusDTM SpatialHeightProvenance = "dsm_minus_dtm"
	SpatialHeightLidar       SpatialHeightProvenance = "lidar_derived"
	SpatialHeightUser        SpatialHeightProvenance = "user_supplied"
	SpatialHeightFallback    SpatialHeightProvenance = "generic_fallback"
	SpatialHeightUnavailable SpatialHeightProvenance = "unavailable"

	EvidenceTrusted                 EvidenceClass = "trusted"
	EvidenceUsableWithQualification EvidenceClass = "usable_with_qualification"
	EvidenceFallbackOnly            EvidenceClass = "fallback_only"
	EvidenceUnavailable             EvidenceClass = "unavailable"

	BaseElevationMethodRobustPerimeterMedian = "robust_perimeter_median"
	BaseElevationUncertain                   = "base_elevation_uncertain"
	BaseElevationGroundUnavailable           = "ground_elevation_unavailable"

	ExternalMatchExact             ExternalMatchQuality = "exact"
	ExternalMatchHighConfidenceIoU ExternalMatchQuality = "high_confidence_overlap"
	ExternalMatchAmbiguous         ExternalMatchQuality = "ambiguous"
	ExternalMatchUnmatched         ExternalMatchQuality = "unmatched"

	HeightConflictNone                     HeightConflictStatus = "none"
	HeightConflictWithinScreeningTolerance HeightConflictStatus = "within_screening_tolerance"
	HeightConflictReviewRequired           HeightConflictStatus = "review_required"
)

type TerrainKind string
type SpatialHeightProvenance string
type EvidenceClass string
type ExternalMatchQuality string
type HeightConflictStatus string

type EvidenceProvenance struct {
	Source            string                  `json:"source,omitempty"`
	SourceVersion     string                  `json:"source_version,omitempty"`
	DatasetID         string                  `json:"dataset_id,omitempty"`
	Category          SpatialHeightProvenance `json:"category,omitempty"`
	Derivation        string                  `json:"derivation,omitempty"`
	VerticalDatum     string                  `json:"vertical_datum,omitempty"`
	VerticalDatumKind string                  `json:"vertical_datum_kind,omitempty"`
	GeoidModel        string                  `json:"geoid_model,omitempty"`
	ResolutionM       float64                 `json:"resolution_m,omitempty"`
	AcquisitionEpoch  string                  `json:"acquisition_epoch,omitempty"`
	EvidenceClass     EvidenceClass           `json:"evidence_class"`
}

type TerrainSample struct {
	ElevationM          *float64           `json:"elevation_m,omitempty"`
	Status              string             `json:"status"`
	Kind                TerrainKind        `json:"kind"`
	Source              EvidenceProvenance `json:"source"`
	Interpolation       string             `json:"interpolation,omitempty"`
	ResolutionXM        float64            `json:"resolution_x_m,omitempty"`
	ResolutionYM        float64            `json:"resolution_y_m,omitempty"`
	AuthoritativeGround bool               `json:"authoritative_ground"`
	NoData              bool               `json:"no_data,omitempty"`
	Reason              string             `json:"reason,omitempty"`
}

type GroundElevationEvidence struct {
	ElevationM       *float64           `json:"ground_elevation_m,omitempty"`
	Status           string             `json:"status"`
	Method           string             `json:"method,omitempty"`
	Source           EvidenceProvenance `json:"source"`
	Kind             TerrainKind        `json:"kind"`
	SpreadM          *float64           `json:"ground_spread_m,omitempty"`
	SampleCount      int                `json:"sample_count,omitempty"`
	ValidSampleCount int                `json:"valid_sample_count,omitempty"`
	Uncertain        bool               `json:"uncertain"`
	Reason           string             `json:"reason,omitempty"`
}

type BuildingHeightEvidence struct {
	HeightAGLM       *float64             `json:"building_height_agl_m,omitempty"`
	Provenance       EvidenceProvenance   `json:"provenance"`
	MatchQuality     ExternalMatchQuality `json:"match_quality,omitempty"`
	ExternalSourceID string               `json:"external_source_id,omitempty"`
}

type RoofElevationEvidence struct {
	ElevationAMSLM *float64                `json:"roof_elevation_amsl_m,omitempty"`
	Ground         GroundElevationEvidence `json:"ground"`
	Height         BuildingHeightEvidence  `json:"height"`
	Compatibility  string                  `json:"compatibility"`
	Reason         string                  `json:"reason,omitempty"`
}

type TerrainEvidenceDeclaration struct {
	Kind              TerrainKind `json:"kind"`
	VerticalDatum     string      `json:"vertical_datum,omitempty"`
	VerticalDatumKind string      `json:"vertical_datum_kind"`
	GeoidModel        string      `json:"geoid_model,omitempty"`
	ResolutionM       float64     `json:"resolution_m,omitempty"`
	Interpolation     string      `json:"interpolation"`
	AcquisitionEpoch  string      `json:"acquisition_epoch,omitempty"`
	Authoritative     bool        `json:"authoritative"`
	Compatibility     string      `json:"compatibility"`
}

type TerrainPathSample struct {
	DistanceM float64       `json:"distance_m"`
	Point     Point         `json:"point"`
	Terrain   TerrainSample `json:"terrain"`
}

type TerrainPathProfile struct {
	Transmitter          Point               `json:"transmitter"`
	Receiver             Point               `json:"receiver"`
	DistanceM            float64             `json:"distance_m"`
	RequestedSpacingM    float64             `json:"requested_spacing_m"`
	EffectiveSpacingM    float64             `json:"effective_spacing_m"`
	SamplingIntervalRule string              `json:"sampling_interval_rule"`
	Samples              []TerrainPathSample `json:"samples"`
	Status               string              `json:"status"`
	Limitations          []string            `json:"limitations,omitempty"`
}

type BuildingBaseElevationResult struct {
	BuildingID       string             `json:"building_id"`
	Method           string             `json:"base_elevation_method"`
	SampleCount      int                `json:"sample_count"`
	ValidSampleCount int                `json:"valid_sample_count"`
	GroundMinM       *float64           `json:"ground_min_m,omitempty"`
	GroundMedianM    *float64           `json:"ground_median_m,omitempty"`
	GroundMaxM       *float64           `json:"ground_max_m,omitempty"`
	GroundSpreadM    *float64           `json:"ground_spread_m,omitempty"`
	Status           string             `json:"status"`
	Uncertainty      string             `json:"uncertainty"`
	Source           EvidenceProvenance `json:"source"`
	Kind             TerrainKind        `json:"kind"`
	Reason           string             `json:"reason,omitempty"`
}

type ExternalBuildingHeightRecord struct {
	ID               string             `json:"id"`
	Footprint        []Point            `json:"footprint"`
	HeightAGLM       float64            `json:"height_agl_m"`
	Source           EvidenceProvenance `json:"source"`
	AcquisitionEpoch string             `json:"acquisition_epoch,omitempty"`
}

// BuildingHeightEvidenceContext supplies the dataset-level provenance that is
// not present in a legacy footprint feature. It is intentionally separate from
// the numeric height so a ledger can retain the original source identity.
type BuildingHeightEvidenceContext struct {
	Source            string
	SourceVersion     string
	DatasetID         string
	ResolutionM       float64
	VerticalDatum     string
	VerticalDatumKind string
	AcquisitionEpoch  string
}

type ExternalBuildingMatch struct {
	ExternalID        string               `json:"external_id"`
	BuildingID        string               `json:"building_id,omitempty"`
	Quality           ExternalMatchQuality `json:"quality"`
	IoU               float64              `json:"iou,omitempty"`
	OverlapMethod     string               `json:"overlap_method,omitempty"`
	CentroidDistanceM float64              `json:"centroid_distance_m,omitempty"`
	CandidateCount    int                  `json:"candidate_count"`
	Reason            string               `json:"reason,omitempty"`
}

type ExternalHeightMatchPolicy struct {
	Version                  string  `json:"version"`
	HighConfidenceIoU        float64 `json:"high_confidence_iou"`
	MaximumCentroidDistanceM float64 `json:"maximum_centroid_distance_m"`
}

func DefaultExternalHeightMatchPolicy() ExternalHeightMatchPolicy {
	return ExternalHeightMatchPolicy{
		Version:                  SpatialMatchingPolicyVersion,
		HighConfidenceIoU:        0.6,
		MaximumCentroidDistanceM: 30,
	}
}

type HeightEvidenceCandidate struct {
	HeightAGLM       float64              `json:"height_agl_m"`
	Provenance       EvidenceProvenance   `json:"provenance"`
	MatchQuality     ExternalMatchQuality `json:"match_quality,omitempty"`
	ExternalSourceID string               `json:"external_source_id,omitempty"`
}

type AlternativeHeightSource struct {
	HeightAGLM              float64              `json:"height_agl_m"`
	Provenance              EvidenceProvenance   `json:"provenance"`
	MatchQuality            ExternalMatchQuality `json:"match_quality,omitempty"`
	ExternalSourceID        string               `json:"external_source_id,omitempty"`
	DifferenceFromSelectedM float64              `json:"difference_from_selected_m,omitempty"`
}

type HeightConflict struct {
	Status                     HeightConflictStatus `json:"status"`
	CandidateCount             int                  `json:"candidate_count"`
	MedianDifferenceM          float64              `json:"median_difference_m,omitempty"`
	P90DifferenceM             float64              `json:"p90_difference_m,omitempty"`
	ExtremeDifferenceM         float64              `json:"extreme_difference_m,omitempty"`
	ScreeningToleranceM        float64              `json:"screening_tolerance_m"`
	ScreeningRelativeTolerance float64              `json:"screening_relative_tolerance"`
	Note                       string               `json:"note"`
}

type BuildingHeightLedger struct {
	BuildingID             string                    `json:"building_id"`
	LogicalBuildingID      string                    `json:"logical_building_id,omitempty"`
	SelectedHeightAGLM     *float64                  `json:"selected_height_agl_m,omitempty"`
	SelectedProvenance     EvidenceProvenance        `json:"selected_provenance"`
	SelectedConfidence     EvidenceClass             `json:"selected_confidence"`
	SelectedRoofElevation  RoofElevationEvidence     `json:"selected_roof_elevation"`
	BaseElevation          GroundElevationEvidence   `json:"base_elevation"`
	AlternativeSources     []AlternativeHeightSource `json:"alternative_sources,omitempty"`
	Conflict               HeightConflict            `json:"conflict"`
	SourcePrecedence       []SpatialHeightProvenance `json:"source_precedence"`
	SelectionPolicyVersion string                    `json:"selection_policy_version"`
}

type SpatialEvidenceDatasetIdentity struct {
	ID       string `json:"id"`
	Version  string `json:"version"`
	Kind     string `json:"kind"`
	Checksum string `json:"checksum"`
}

type SpatialEvidenceFingerprintInput struct {
	TerrainDatasets           []SpatialEvidenceDatasetIdentity `json:"terrain_datasets"`
	BuildingHeightDatasets    []SpatialEvidenceDatasetIdentity `json:"building_height_datasets"`
	MatchingPolicyVersion     string                           `json:"matching_policy_version"`
	SourcePrecedence          []SpatialHeightProvenance        `json:"source_precedence"`
	Interpolation             string                           `json:"interpolation"`
	DatumTransformationPolicy string                           `json:"datum_transformation_policy"`
}

type SpatialEvidenceSummary struct {
	SchemaVersion        string                     `json:"schema_version"`
	Terrain              TerrainEvidenceDeclaration `json:"terrain"`
	HeightEvidence       HeightEvidenceAudit        `json:"height_evidence"`
	TrustedHeightCount   int                        `json:"trusted_height_count"`
	QualifiedHeightCount int                        `json:"qualified_height_count"`
	FallbackOnlyCount    int                        `json:"fallback_only_count"`
	BaseElevationStatus  string                     `json:"base_elevation_status"`
	SourcePrecedence     []SpatialHeightProvenance  `json:"source_precedence"`
	MatchingPolicy       ExternalHeightMatchPolicy  `json:"matching_policy"`
	SpatialFingerprint   string                     `json:"spatial_evidence_fingerprint"`
	CanonicalActivation  string                     `json:"canonical_activation"`
	Limitations          []string                   `json:"limitations"`
}

const (
	HeightSelectionPolicyVersion = "height-source-precedence-v1"
	heightConflictToleranceM     = 5.0
	heightConflictRelative       = 0.25
)

func DefaultHeightSourcePrecedence() []SpatialHeightProvenance {
	return []SpatialHeightProvenance{
		SpatialHeightUser,
		SpatialHeightLidar,
		SpatialHeightOSMExplicit,
		SpatialHeightExternal,
		SpatialHeightOSMLevels,
		SpatialHeightDSMMinusDTM,
		SpatialHeightFallback,
		SpatialHeightUnavailable,
	}
}

func normalizeTerrainKind(kind TerrainKind) TerrainKind {
	switch TerrainKind(strings.ToLower(strings.TrimSpace(string(kind)))) {
	case TerrainKindDTM:
		return TerrainKindDTM
	case TerrainKindDSM:
		return TerrainKindDSM
	default:
		return TerrainKindDEMUnspecified
	}
}

func normalizeVerticalDatumKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case VerticalDatumOrthometric:
		return VerticalDatumOrthometric
	case VerticalDatumEllipsoidal:
		return VerticalDatumEllipsoidal
	default:
		return VerticalDatumUnknown
	}
}

func normalizeInterpolation(method string) string {
	if strings.EqualFold(strings.TrimSpace(method), TerrainInterpolationNearest) {
		return TerrainInterpolationNearest
	}
	return TerrainInterpolationBilinear
}

func geographicResolutionMeters(metadata TerrainMetadata) (float64, float64) {
	latitude := 0.0
	if len(metadata.Bounds) == 4 {
		latitude = (metadata.Bounds[1] + metadata.Bounds[3]) / 2
	}
	latScale := EarthRadiusMeters * math.Pi / 180
	return math.Abs(metadata.ResolutionXDeg) * latScale * math.Cos(latitude*math.Pi/180), math.Abs(metadata.ResolutionYDeg) * latScale
}

func TerrainDeclarationFromMetadata(metadata TerrainMetadata) TerrainEvidenceDeclaration {
	metadata = normalizeTerrainMetadata(metadata)
	kind := normalizeTerrainKind(metadata.Kind)
	verticalKind := normalizeVerticalDatumKind(metadata.VerticalDatumKind)
	datumDeclared := hasDeclaredVerticalDatum(metadata.VerticalDatum)
	authoritative := kind == TerrainKindDTM && verticalKind != VerticalDatumUnknown && datumDeclared && metadata.Available
	compatibility := "unresolved"
	if !metadata.Available {
		compatibility = "unavailable"
	} else if kind == TerrainKindDSM {
		compatibility = "surface_only_not_ground"
	} else if kind == TerrainKindDEMUnspecified {
		compatibility = "unresolved_dem_semantics"
	} else if verticalKind == VerticalDatumUnknown || !datumDeclared {
		compatibility = "unresolved_vertical_datum"
	} else {
		compatibility = "compatible_for_declared_ground_datum"
	}
	resolution := math.Max(metadata.ResolutionXM, metadata.ResolutionYM)
	return TerrainEvidenceDeclaration{
		Kind: kind, VerticalDatum: metadata.VerticalDatum, VerticalDatumKind: verticalKind,
		GeoidModel: metadata.GeoidModel, ResolutionM: resolution, Interpolation: normalizeInterpolation(metadata.Interpolation),
		AcquisitionEpoch: metadata.AcquisitionEpoch, Authoritative: authoritative, Compatibility: compatibility,
	}
}

func IsAuthoritativeGroundTerrain(metadata TerrainMetadata) bool {
	declaration := TerrainDeclarationFromMetadata(metadata)
	return declaration.Authoritative && declaration.Kind == TerrainKindDTM
}

func NewTerrainSampler(model TerrainModel, interpolation string) (*TerrainSampler, error) {
	method := normalizeInterpolation(interpolation)
	if model == nil {
		return &TerrainSampler{metadata: TerrainMetadata{Available: false, Status: TerrainStatusUnavailable, Kind: TerrainKindDEMUnspecified, VerticalDatumKind: VerticalDatumUnknown}, interpolation: method}, nil
	}
	metadata := normalizeTerrainMetadata(model.Metadata())
	if metadata.Available && metadata.Kind == "" {
		metadata.Kind = TerrainKindDEMUnspecified
	}
	if metadata.VerticalDatumKind == "" {
		metadata.VerticalDatumKind = VerticalDatumUnknown
	}
	if metadata.ResolutionXM == 0 || metadata.ResolutionYM == 0 {
		metadata.ResolutionXM, metadata.ResolutionYM = geographicResolutionMeters(metadata)
	}
	return &TerrainSampler{model: model, metadata: metadata, interpolation: method}, nil
}

type TerrainSampler struct {
	model         TerrainModel
	metadata      TerrainMetadata
	interpolation string
}

func (sampler *TerrainSampler) Metadata() TerrainMetadata {
	if sampler == nil {
		return TerrainMetadata{Available: false, Status: TerrainStatusUnavailable, Kind: TerrainKindDEMUnspecified, VerticalDatumKind: VerticalDatumUnknown}
	}
	return sampler.metadata
}

func (sampler *TerrainSampler) SampleTerrain(point Point) TerrainSample {
	if sampler == nil || sampler.model == nil || !sampler.metadata.Available {
		metadata := sampler.Metadata()
		interpolation := TerrainInterpolationBilinear
		if sampler != nil && sampler.interpolation != "" {
			interpolation = sampler.interpolation
		}
		return TerrainSample{Status: TerrainSampleUnavailable, Kind: normalizeTerrainKind(metadata.Kind), Source: terrainProvenance(metadata), Interpolation: interpolation, Reason: "terrain source unavailable"}
	}
	value, ok := sampleTerrainModel(sampler.model, point, sampler.interpolation)
	if !ok {
		status := TerrainSampleOutsideDataset
		reason := "point is outside raster bounds"
		inside := terrainPointInsideMetadataBounds(point, sampler.metadata)
		if inside && sampler.metadata.NoData != nil {
			status = TerrainSampleNoData
			reason = "raster pixel is no-data or interpolation neighborhood contains no-data"
		}
		return TerrainSample{Status: status, Kind: normalizeTerrainKind(sampler.metadata.Kind), Source: terrainProvenance(sampler.metadata), Interpolation: sampler.interpolation, ResolutionXM: sampler.metadata.ResolutionXM, ResolutionYM: sampler.metadata.ResolutionYM, AuthoritativeGround: IsAuthoritativeGroundTerrain(sampler.metadata), Reason: reason, NoData: status == TerrainSampleNoData}
	}
	status := TerrainSampleSource
	if sampler.interpolation == TerrainInterpolationBilinear {
		status = TerrainSampleInterpolated
	}
	return TerrainSample{ElevationM: spatialFloatPointer(value), Status: status, Kind: normalizeTerrainKind(sampler.metadata.Kind), Source: terrainProvenance(sampler.metadata), Interpolation: sampler.interpolation, ResolutionXM: sampler.metadata.ResolutionXM, ResolutionYM: sampler.metadata.ResolutionYM, AuthoritativeGround: IsAuthoritativeGroundTerrain(sampler.metadata)}
}

func sampleTerrainModel(model TerrainModel, point Point, interpolation string) (float64, bool) {
	if sampled, ok := model.(interface {
		Sample(Point, string) (float64, bool)
	}); ok {
		return sampled.Sample(point, interpolation)
	}
	return model.Elevation(point)
}

func terrainPointInsideMetadataBounds(point Point, metadata TerrainMetadata) bool {
	if len(metadata.Bounds) != 4 {
		return true
	}
	return point.Lon >= metadata.Bounds[0] && point.Lon <= metadata.Bounds[2] && point.Lat >= metadata.Bounds[1] && point.Lat <= metadata.Bounds[3]
}

func terrainProvenance(metadata TerrainMetadata) EvidenceProvenance {
	return EvidenceProvenance{
		Source: metadata.Source, SourceVersion: metadata.SourceVersion, DatasetID: metadata.DatasetID, Derivation: "raster_sample",
		VerticalDatum: metadata.VerticalDatum, VerticalDatumKind: normalizeVerticalDatumKind(metadata.VerticalDatumKind), GeoidModel: metadata.GeoidModel,
		ResolutionM: math.Max(metadata.ResolutionXM, metadata.ResolutionYM), AcquisitionEpoch: metadata.AcquisitionEpoch,
		EvidenceClass: func() EvidenceClass {
			if !metadata.Available {
				return EvidenceUnavailable
			}
			if IsAuthoritativeGroundTerrain(metadata) {
				return EvidenceTrusted
			}
			return EvidenceUsableWithQualification
		}(),
	}
}

func (sampler *TerrainSampler) RecommendedSampleSpacingM() float64 {
	if sampler == nil {
		return 0
	}
	return math.Max(sampler.metadata.ResolutionXM, sampler.metadata.ResolutionYM)
}

func BuildTerrainPathProfile(start, end Point, sampler *TerrainSampler, requestedSpacingM float64) (TerrainPathProfile, error) {
	if requestedSpacingM <= 0 || math.IsNaN(requestedSpacingM) || math.IsInf(requestedSpacingM, 0) {
		return TerrainPathProfile{}, errors.New("terrain path sample spacing must be positive and finite")
	}
	distance := ApproxDistanceMeters(start, end)
	if distance <= 0 {
		return TerrainPathProfile{}, errors.New("terrain path endpoints must be distinct")
	}
	effective := requestedSpacingM
	if sourceSpacing := sampler.RecommendedSampleSpacingM(); sourceSpacing > effective {
		effective = sourceSpacing
	}
	if effective <= 0 {
		effective = requestedSpacingM
	}
	count := int(math.Ceil(distance/effective)) + 1
	bearing := BearingDegrees(start, end)
	profile := TerrainPathProfile{
		Transmitter: start, Receiver: end, DistanceM: distance, RequestedSpacingM: requestedSpacingM,
		EffectiveSpacingM: effective, SamplingIntervalRule: "effective spacing is max(requested spacing, largest source raster resolution); no sub-pixel precision is implied",
		Samples: make([]TerrainPathSample, 0, count), Status: TerrainSampleUnavailable,
	}
	if effective > requestedSpacingM {
		profile.Limitations = append(profile.Limitations, "requested spacing was raised to the source raster resolution")
	}
	for index := 0; index < count; index++ {
		distanceM := math.Min(float64(index)*effective, distance)
		if index == count-1 {
			distanceM = distance
		}
		point := DestinationPoint(start, bearing, distanceM)
		sample := TerrainSample{Status: TerrainSampleUnavailable, Kind: TerrainKindDEMUnspecified, Interpolation: TerrainInterpolationBilinear, Reason: "terrain source unavailable"}
		if sampler != nil {
			sample = sampler.SampleTerrain(point)
		}
		if sample.ElevationM != nil {
			profile.Status = TerrainSampleInterpolated
		}
		profile.Samples = append(profile.Samples, TerrainPathSample{DistanceM: distanceM, Point: point, Terrain: sample})
	}
	return profile, nil
}

func CalculateBuildingBaseElevation(building *BuildingFootprint, sampler *TerrainSampler, uncertaintyThresholdM float64) BuildingBaseElevationResult {
	result := BuildingBaseElevationResult{Method: BaseElevationMethodRobustPerimeterMedian, Status: TerrainSampleUnavailable, Uncertainty: BaseElevationGroundUnavailable, Kind: TerrainKindDEMUnspecified, Source: EvidenceProvenance{EvidenceClass: EvidenceUnavailable}}
	if building == nil {
		result.Reason = "building is nil"
		return result
	}
	result.BuildingID = building.ID
	points := robustPerimeterSamplePoints(building.Vertices)
	result.SampleCount = len(points)
	if result.SampleCount == 0 {
		result.Reason = "building footprint has no valid polygon vertices"
		return result
	}
	if sampler == nil || !IsAuthoritativeGroundTerrain(sampler.Metadata()) {
		result.Kind = normalizeTerrainKind(sampler.Metadata().Kind)
		result.Source = terrainProvenance(sampler.Metadata())
		result.Reason = "building base requires an authoritative DTM with a known vertical datum; DSM and unspecified DEM semantics remain non-ground evidence"
		if result.Kind == TerrainKindDSM {
			result.Status = "surface_not_ground"
		}
		return result
	}
	result.Kind = TerrainKindDTM
	values := make([]float64, 0, len(points))
	for _, point := range points {
		sample := sampler.SampleTerrain(point)
		if sample.ElevationM == nil || !sample.AuthoritativeGround {
			continue
		}
		values = append(values, *sample.ElevationM)
		result.Source = sample.Source
	}
	result.ValidSampleCount = len(values)
	if len(values) == 0 {
		result.Reason = "no valid DTM sample was available across the footprint"
		return result
	}
	sort.Float64s(values)
	minimum, maximum, median := values[0], values[len(values)-1], spatialMedianFloat64(values)
	spread := maximum - minimum
	result.GroundMinM, result.GroundMedianM, result.GroundMaxM, result.GroundSpreadM = spatialFloatPointer(minimum), spatialFloatPointer(median), spatialFloatPointer(maximum), spatialFloatPointer(spread)
	result.Status = TerrainSampleInterpolated
	if uncertaintyThresholdM <= 0 {
		uncertaintyThresholdM = 5
	}
	if spread > uncertaintyThresholdM {
		result.Uncertainty = BaseElevationUncertain
		result.Status = BaseElevationUncertain
		result.Reason = fmt.Sprintf("terrain spread %.3f m exceeds declared threshold %.3f m", spread, uncertaintyThresholdM)
	} else {
		result.Uncertainty = "within_threshold"
	}
	return result
}

func robustPerimeterSamplePoints(vertices []Point) []Point {
	if len(vertices) < 3 {
		return nil
	}
	points := make([]Point, 0, len(vertices)*2+1)
	for index, point := range vertices {
		if index > 0 && point == vertices[0] {
			continue
		}
		points = append(points, point)
		next := vertices[(index+1)%len(vertices)]
		points = append(points, Point{Lon: (point.Lon + next.Lon) / 2, Lat: (point.Lat + next.Lat) / 2})
	}
	if centroid, ok := PolygonCentroid(vertices); ok {
		points = append(points, centroid)
	}
	return points
}

func spatialMedianFloat64(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	middle := len(values) / 2
	if len(values)%2 == 1 {
		return values[middle]
	}
	return (values[middle-1] + values[middle]) / 2
}

func spatialFloatPointer(value float64) *float64 { return &value }

func CombineGroundAndBuildingHeight(ground GroundElevationEvidence, height BuildingHeightEvidence) (RoofElevationEvidence, error) {
	result := RoofElevationEvidence{Ground: ground, Height: height, Compatibility: "unresolved"}
	if ground.ElevationM == nil || height.HeightAGLM == nil {
		result.Reason = "both ground_elevation_m and building_height_agl_m are required"
		return result, errors.New(result.Reason)
	}
	if ground.Kind != TerrainKindDTM || normalizeVerticalDatumKind(ground.Source.VerticalDatumKind) == VerticalDatumUnknown || !hasDeclaredVerticalDatum(ground.Source.VerticalDatum) {
		result.Compatibility = "unresolved"
		result.Reason = "roof elevation requires a DTM ground value with a known vertical datum"
		return result, errors.New(result.Reason)
	}
	if height.Provenance.VerticalDatumKind != "" && height.Provenance.VerticalDatumKind != "not_applicable_agl" && normalizeVerticalDatumKind(height.Provenance.VerticalDatumKind) != VerticalDatumUnknown {
		if !compatibleVerticalDatum(ground.Source, height.Provenance) {
			result.Compatibility = "incompatible"
			result.Reason = "ground and height evidence declare incompatible vertical datums"
			return result, errors.New(result.Reason)
		}
	}
	if *height.HeightAGLM < 0 || math.IsNaN(*height.HeightAGLM) || math.IsInf(*height.HeightAGLM, 0) {
		result.Reason = "building height above ground must be finite and non-negative"
		return result, errors.New(result.Reason)
	}
	value := *ground.ElevationM + *height.HeightAGLM
	result.ElevationAMSLM = &value
	result.Compatibility = "compatible"
	if ground.Uncertain {
		result.Compatibility = "compatible_but_base_uncertain"
		result.Reason = "roof elevation uses the footprint median ground sample; terrain spread remains an explicit uncertainty"
	}
	return result, nil
}

func EvaluateNDSMDifference(dsm, dtm TerrainSample, roofStatistic string) (BuildingHeightEvidence, error) {
	if dsm.ElevationM == nil || dtm.ElevationM == nil {
		return BuildingHeightEvidence{}, errors.New("DSM and DTM samples are both required")
	}
	if dsm.Kind != TerrainKindDSM || dtm.Kind != TerrainKindDTM {
		return BuildingHeightEvidence{}, errors.New("nDSM derivation requires an explicit DSM and an explicit DTM")
	}
	if !compatibleVerticalDatum(dtm.Source, dsm.Source) {
		return BuildingHeightEvidence{}, errors.New("DSM and DTM vertical datum compatibility is unresolved")
	}
	height := *dsm.ElevationM - *dtm.ElevationM
	if height < 0 {
		height = 0
	}
	return BuildingHeightEvidence{HeightAGLM: &height, Provenance: EvidenceProvenance{
		Source: dsm.Source.Source + "+" + dtm.Source.Source, SourceVersion: dsm.Source.SourceVersion, Category: SpatialHeightDSMMinusDTM, Derivation: "DSM minus DTM using " + strings.TrimSpace(roofStatistic) + " roof statistic; vegetation contamination risk unknown",
		VerticalDatum: dsm.Source.VerticalDatum, VerticalDatumKind: "not_applicable_agl", ResolutionM: math.Max(dsm.Source.ResolutionM, dtm.Source.ResolutionM), EvidenceClass: EvidenceUsableWithQualification,
	}}, nil
}

func MatchExternalBuildingHeights(buildings *BuildingIndex, records []ExternalBuildingHeightRecord, policy ExternalHeightMatchPolicy) []ExternalBuildingMatch {
	if policy.Version == "" {
		policy = DefaultExternalHeightMatchPolicy()
	}
	result := make([]ExternalBuildingMatch, 0, len(records))
	for _, record := range records {
		match := ExternalBuildingMatch{ExternalID: record.ID, Quality: ExternalMatchUnmatched, Reason: "no candidate footprint"}
		if buildings == nil || len(record.Footprint) < 3 {
			result = append(result, match)
			continue
		}
		candidates := buildings.SearchBounds(boundsForPoints(record.Footprint))
		sort.SliceStable(candidates, func(i, j int) bool {
			return candidates[i] != nil && (candidates[j] == nil || candidates[i].ID < candidates[j].ID)
		})
		for _, building := range candidates {
			if building == nil {
				continue
			}
			if record.ID != "" && (record.ID == building.ID || record.ID == logicalBuildingID(building)) {
				match.BuildingID, match.Quality, match.Reason, match.CandidateCount = building.ID, ExternalMatchExact, "external and loader IDs agree", 1
				break
			}
			candidate := externalCandidateMatch(record.Footprint, building.Vertices)
			if candidate.CentroidDistanceM > policy.MaximumCentroidDistanceM && candidate.IoU == 0 {
				continue
			}
			match.CandidateCount++
			if candidate.IoU >= policy.HighConfidenceIoU {
				candidate.Quality = ExternalMatchHighConfidenceIoU
			} else {
				candidate.Quality = ExternalMatchAmbiguous
			}
			if match.BuildingID == "" || candidate.IoU > match.IoU || (candidate.IoU == match.IoU && candidate.CentroidDistanceM < match.CentroidDistanceM) {
				match.BuildingID, match.Quality, match.IoU, match.OverlapMethod, match.CentroidDistanceM, match.Reason = building.ID, candidate.Quality, candidate.IoU, candidate.OverlapMethod, candidate.CentroidDistanceM, "best deterministic overlap candidate"
			}
		}
		if match.CandidateCount > 1 {
			match.Quality = ExternalMatchAmbiguous
			match.Reason = "more than one spatial candidate; retain for review"
		}
		if match.BuildingID == "" {
			match.Quality = ExternalMatchUnmatched
		}
		result = append(result, match)
	}
	return result
}

type candidateMatch struct {
	Quality           ExternalMatchQuality
	IoU               float64
	OverlapMethod     string
	CentroidDistanceM float64
}

func externalCandidateMatch(external, building []Point) candidateMatch {
	externalBounds, externalOK := boundsForPoints(external), len(external) >= 3
	buildingBounds, buildingOK := boundsForPoints(building), len(building) >= 3
	if !externalOK || !buildingOK {
		return candidateMatch{}
	}
	iou, overlapMethod := polygonIoU(external, building, externalBounds, buildingBounds)
	externalCentroid, _ := PolygonCentroid(external)
	buildingCentroid, _ := PolygonCentroid(building)
	return candidateMatch{IoU: iou, OverlapMethod: overlapMethod, CentroidDistanceM: ApproxDistanceMeters(externalCentroid, buildingCentroid)}
}

func polygonIoU(subject, clip []Point, subjectBounds, clipBounds Bounds) (float64, string) {
	if isConvexPolygon(subject) && isConvexPolygon(clip) {
		intersection := convexPolygonIntersection(subject, clip)
		intersectionArea := math.Abs(polygonSignedArea(intersection))
		union := math.Abs(polygonSignedArea(subject)) + math.Abs(polygonSignedArea(clip)) - intersectionArea
		if union > 0 {
			return intersectionArea / union, "polygon_iou_convex"
		}
		return 0, "polygon_iou_convex"
	}
	return sampledPolygonIoU(subject, clip, subjectBounds, clipBounds), "sampled_polygon_iou"
}

func polygonSignedArea(points []Point) float64 {
	if len(points) < 3 {
		return 0
	}
	area := 0.0
	for index, point := range points {
		next := points[(index+1)%len(points)]
		area += point.Lon*next.Lat - next.Lon*point.Lat
	}
	return area / 2
}

func isConvexPolygon(points []Point) bool {
	if len(points) < 3 {
		return false
	}
	direction := 0.0
	for index := range points {
		a, b, c := points[index], points[(index+1)%len(points)], points[(index+2)%len(points)]
		cross := (b.Lon-a.Lon)*(c.Lat-b.Lat) - (b.Lat-a.Lat)*(c.Lon-b.Lon)
		if math.Abs(cross) < 1e-14 {
			continue
		}
		if direction == 0 {
			direction = math.Copysign(1, cross)
			continue
		}
		if math.Copysign(1, cross) != direction {
			return false
		}
	}
	return direction != 0
}

func convexPolygonIntersection(subject, clip []Point) []Point {
	output := append([]Point(nil), subject...)
	clipOrientation := math.Copysign(1, polygonSignedArea(clip))
	for index := range clip {
		if len(output) == 0 {
			break
		}
		clipStart, clipEnd := clip[index], clip[(index+1)%len(clip)]
		input := output
		output = make([]Point, 0, len(input))
		previous := input[len(input)-1]
		previousInside := polygonHalfPlaneContains(previous, clipStart, clipEnd, clipOrientation)
		for _, current := range input {
			currentInside := polygonHalfPlaneContains(current, clipStart, clipEnd, clipOrientation)
			if currentInside != previousInside {
				if intersection, ok := infiniteLineIntersection(previous, current, clipStart, clipEnd); ok {
					output = append(output, intersection)
				}
			}
			if currentInside {
				output = append(output, current)
			}
			previous, previousInside = current, currentInside
		}
	}
	return output
}

func polygonHalfPlaneContains(point, start, end Point, orientation float64) bool {
	cross := (end.Lon-start.Lon)*(point.Lat-start.Lat) - (end.Lat-start.Lat)*(point.Lon-start.Lon)
	return orientation*cross >= -1e-14
}

func infiniteLineIntersection(a, b, c, d Point) (Point, bool) {
	denominator := (a.Lon-b.Lon)*(c.Lat-d.Lat) - (a.Lat-b.Lat)*(c.Lon-d.Lon)
	if math.Abs(denominator) < 1e-14 {
		return Point{}, false
	}
	t := ((a.Lon-c.Lon)*(c.Lat-d.Lat) - (a.Lat-c.Lat)*(c.Lon-d.Lon)) / denominator
	return Point{Lon: a.Lon + t*(b.Lon-a.Lon), Lat: a.Lat + t*(b.Lat-a.Lat)}, true
}

func sampledPolygonIoU(subject, clip []Point, subjectBounds, clipBounds Bounds) float64 {
	minLon := math.Min(subjectBounds.MinLon, clipBounds.MinLon)
	maxLon := math.Max(subjectBounds.MaxLon, clipBounds.MaxLon)
	minLat := math.Min(subjectBounds.MinLat, clipBounds.MinLat)
	maxLat := math.Max(subjectBounds.MaxLat, clipBounds.MaxLat)
	if maxLon <= minLon || maxLat <= minLat {
		return 0
	}
	const grid = 64
	intersection, union := 0, 0
	for row := 0; row < grid; row++ {
		lat := minLat + (float64(row)+0.5)*(maxLat-minLat)/grid
		for column := 0; column < grid; column++ {
			lon := minLon + (float64(column)+0.5)*(maxLon-minLon)/grid
			inSubject := PointInPolygon(Point{Lon: lon, Lat: lat}, subject)
			inClip := PointInPolygon(Point{Lon: lon, Lat: lat}, clip)
			if inSubject || inClip {
				union++
			}
			if inSubject && inClip {
				intersection++
			}
		}
	}
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

func boundsForPoints(points []Point) Bounds {
	bounds, _ := BoundsFromPoints(points)
	return bounds
}

func hasDeclaredVerticalDatum(value string) bool {
	cleaned := strings.ToLower(strings.TrimSpace(value))
	return cleaned != "" && cleaned != "unknown" && cleaned != "unspecified"
}

func compatibleVerticalDatum(ground, height EvidenceProvenance) bool {
	groundKind := normalizeVerticalDatumKind(ground.VerticalDatumKind)
	heightKind := normalizeVerticalDatumKind(height.VerticalDatumKind)
	if groundKind == VerticalDatumUnknown || heightKind == VerticalDatumUnknown || groundKind != heightKind {
		return false
	}
	if !hasDeclaredVerticalDatum(ground.VerticalDatum) || !hasDeclaredVerticalDatum(height.VerticalDatum) {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(ground.VerticalDatum), strings.TrimSpace(height.VerticalDatum)) {
		return false
	}
	if ground.GeoidModel != "" && height.GeoidModel != "" && !strings.EqualFold(strings.TrimSpace(ground.GeoidModel), strings.TrimSpace(height.GeoidModel)) {
		return false
	}
	return true
}

func SelectHeightEvidence(candidates []HeightEvidenceCandidate) (HeightEvidenceCandidate, []AlternativeHeightSource, HeightConflict) {
	valid := make([]HeightEvidenceCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.HeightAGLM >= 0 && !math.IsNaN(candidate.HeightAGLM) && !math.IsInf(candidate.HeightAGLM, 0) && candidate.Provenance.EvidenceClass != EvidenceUnavailable && externalHeightCandidateEligible(candidate) {
			valid = append(valid, candidate)
		}
	}
	if len(valid) == 0 {
		return HeightEvidenceCandidate{Provenance: EvidenceProvenance{EvidenceClass: EvidenceUnavailable, Source: string(SpatialHeightUnavailable)}}, nil, HeightConflict{Status: HeightConflictNone, ScreeningToleranceM: heightConflictToleranceM, ScreeningRelativeTolerance: heightConflictRelative, Note: "no usable height source"}
	}
	sort.SliceStable(valid, func(i, j int) bool {
		rankI, rankJ := heightCandidateRank(valid[i]), heightCandidateRank(valid[j])
		if rankI != rankJ {
			return rankI < rankJ
		}
		if valid[i].MatchQuality != valid[j].MatchQuality {
			return matchQualityRank(valid[i].MatchQuality) < matchQualityRank(valid[j].MatchQuality)
		}
		categoryI, categoryJ := heightProvenanceCategory(valid[i].Provenance), heightProvenanceCategory(valid[j].Provenance)
		if categoryI != categoryJ {
			return categoryI < categoryJ
		}
		if valid[i].Provenance.Source != valid[j].Provenance.Source {
			return valid[i].Provenance.Source < valid[j].Provenance.Source
		}
		return valid[i].ExternalSourceID < valid[j].ExternalSourceID
	})
	selected := valid[0]
	differences := make([]float64, 0, len(valid)-1)
	alternatives := make([]AlternativeHeightSource, 0, len(valid)-1)
	for _, candidate := range valid[1:] {
		difference := math.Abs(candidate.HeightAGLM - selected.HeightAGLM)
		differences = append(differences, difference)
		alternatives = append(alternatives, AlternativeHeightSource{HeightAGLM: candidate.HeightAGLM, Provenance: candidate.Provenance, MatchQuality: candidate.MatchQuality, ExternalSourceID: candidate.ExternalSourceID, DifferenceFromSelectedM: difference})
	}
	conflict := HeightConflict{Status: HeightConflictNone, CandidateCount: len(valid), ScreeningToleranceM: heightConflictToleranceM, ScreeningRelativeTolerance: heightConflictRelative, Note: "differences are a review screen, not a ground-truth error claim"}
	if len(differences) > 0 {
		sort.Float64s(differences)
		conflict.MedianDifferenceM = spatialMedianFloat64(differences)
		conflict.P90DifferenceM = differences[int(math.Min(float64(len(differences)-1), math.Floor(float64(len(differences)-1)*0.9)))]
		conflict.ExtremeDifferenceM = differences[len(differences)-1]
		threshold := math.Max(heightConflictToleranceM, math.Abs(selected.HeightAGLM)*heightConflictRelative)
		if conflict.ExtremeDifferenceM <= threshold {
			conflict.Status = HeightConflictWithinScreeningTolerance
		} else {
			conflict.Status = HeightConflictReviewRequired
		}
	}
	return selected, alternatives, conflict
}

func externalHeightCandidateEligible(candidate HeightEvidenceCandidate) bool {
	if heightProvenanceCategory(candidate.Provenance) != SpatialHeightExternal {
		return true
	}
	return candidate.MatchQuality == ExternalMatchExact || candidate.MatchQuality == ExternalMatchHighConfidenceIoU
}

func heightCandidateRank(candidate HeightEvidenceCandidate) int {
	provenance := heightProvenanceCategory(candidate.Provenance)
	if provenance == SpatialHeightExternal && (candidate.MatchQuality == ExternalMatchExact || candidate.MatchQuality == ExternalMatchHighConfidenceIoU) {
		return 3
	}
	switch provenance {
	case SpatialHeightUser:
		return 0
	case SpatialHeightLidar:
		return 1
	case SpatialHeightOSMExplicit:
		return 2
	case SpatialHeightExternal:
		return 4
	case SpatialHeightOSMLevels:
		return 5
	case SpatialHeightDSMMinusDTM:
		return 6
	case SpatialHeightFallback:
		return 7
	default:
		return 8
	}
}

func heightProvenanceCategory(provenance EvidenceProvenance) SpatialHeightProvenance {
	if provenance.Category != "" {
		return provenance.Category
	}
	return SpatialHeightProvenance(provenance.Source)
}

func matchQualityRank(value ExternalMatchQuality) int {
	switch value {
	case ExternalMatchExact:
		return 0
	case ExternalMatchHighConfidenceIoU:
		return 1
	case ExternalMatchAmbiguous:
		return 2
	default:
		return 3
	}
}

func BuildingHeightLedgerFor(building *BuildingFootprint, base BuildingBaseElevationResult, external []HeightEvidenceCandidate) BuildingHeightLedger {
	return BuildingHeightLedgerForWithContext(building, base, external, BuildingHeightEvidenceContext{})
}

func BuildingHeightLedgerForWithContext(building *BuildingFootprint, base BuildingBaseElevationResult, external []HeightEvidenceCandidate, context BuildingHeightEvidenceContext) BuildingHeightLedger {
	ledger := BuildingHeightLedger{SourcePrecedence: DefaultHeightSourcePrecedence(), SelectionPolicyVersion: HeightSelectionPolicyVersion, BaseElevation: GroundElevationEvidence{
		ElevationM: base.GroundMedianM, Status: base.Status, Method: base.Method, Source: base.Source, Kind: base.Kind, SpreadM: base.GroundSpreadM, SampleCount: base.SampleCount, ValidSampleCount: base.ValidSampleCount, Reason: base.Reason,
	}}
	if building == nil {
		ledger.SelectedProvenance = EvidenceProvenance{Source: string(SpatialHeightUnavailable), EvidenceClass: EvidenceUnavailable}
		ledger.Conflict = HeightConflict{Status: HeightConflictNone, ScreeningToleranceM: heightConflictToleranceM, ScreeningRelativeTolerance: heightConflictRelative, Note: "building is nil"}
		return ledger
	}
	ledger.BuildingID, ledger.LogicalBuildingID = building.ID, logicalBuildingID(building)
	candidates := make([]HeightEvidenceCandidate, 0, len(external)+1)
	if height, source, tag, ok := heightEvidenceForBuilding(building); ok {
		category := SpatialHeightOSMExplicit
		verticalDatumKind := context.VerticalDatumKind
		if verticalDatumKind == "" {
			verticalDatumKind = "not_applicable_agl"
		}
		provenance := EvidenceProvenance{Source: context.Source, SourceVersion: context.SourceVersion, DatasetID: context.DatasetID, Category: category, Derivation: tag, ResolutionM: context.ResolutionM, AcquisitionEpoch: context.AcquisitionEpoch, VerticalDatum: context.VerticalDatum, VerticalDatumKind: verticalDatumKind, EvidenceClass: EvidenceTrusted}
		if source == HeightEvidenceFromLevels {
			category = SpatialHeightOSMLevels
			provenance.Category = category
			provenance.EvidenceClass = EvidenceUsableWithQualification
		}
		if provenance.Source == "" {
			provenance.Source = string(category)
		}
		candidates = append(candidates, HeightEvidenceCandidate{HeightAGLM: height, Provenance: provenance})
	} else if building.HeightSource == HeightSourceFallbackLegacy {
		fallback := SpatialHeightFallback
		source := context.Source
		if source == "" {
			source = string(fallback)
		}
		verticalDatumKind := context.VerticalDatumKind
		if verticalDatumKind == "" {
			verticalDatumKind = "not_applicable_agl"
		}
		candidates = append(candidates, HeightEvidenceCandidate{HeightAGLM: building.HeightMeters, Provenance: EvidenceProvenance{Source: source, SourceVersion: context.SourceVersion, DatasetID: context.DatasetID, Category: fallback, Derivation: "legacy display fallback; not roof evidence", ResolutionM: context.ResolutionM, AcquisitionEpoch: context.AcquisitionEpoch, VerticalDatum: context.VerticalDatum, VerticalDatumKind: verticalDatumKind, EvidenceClass: EvidenceFallbackOnly}})
	}
	candidates = append(candidates, external...)
	selected, alternatives, conflict := SelectHeightEvidence(candidates)
	if selected.Provenance.EvidenceClass != EvidenceUnavailable {
		ledger.SelectedHeightAGLM = spatialFloatPointer(selected.HeightAGLM)
	}
	ledger.SelectedProvenance = selected.Provenance
	ledger.SelectedConfidence = selected.Provenance.EvidenceClass
	ledger.AlternativeSources, ledger.Conflict = alternatives, conflict
	heightEvidence := BuildingHeightEvidence{HeightAGLM: ledger.SelectedHeightAGLM, Provenance: selected.Provenance, MatchQuality: selected.MatchQuality, ExternalSourceID: selected.ExternalSourceID}
	if base.GroundMedianM != nil {
		ground := GroundElevationEvidence{ElevationM: base.GroundMedianM, Status: base.Status, Method: base.Method, Source: base.Source, Kind: base.Kind, SpreadM: base.GroundSpreadM, SampleCount: base.SampleCount, ValidSampleCount: base.ValidSampleCount, Uncertain: base.Uncertainty == BaseElevationUncertain, Reason: base.Reason}
		roof, err := CombineGroundAndBuildingHeight(ground, heightEvidence)
		ledger.SelectedRoofElevation = roof
		if err != nil && ledger.SelectedRoofElevation.Reason == "" {
			ledger.SelectedRoofElevation.Reason = err.Error()
		}
	} else {
		ledger.SelectedRoofElevation = RoofElevationEvidence{Ground: ledger.BaseElevation, Height: heightEvidence, Compatibility: "unresolved", Reason: "base elevation is unavailable"}
	}
	return ledger
}

func SpatialEvidenceFingerprint(input SpatialEvidenceFingerprintInput) string {
	normalized := input
	normalized.TerrainDatasets = append([]SpatialEvidenceDatasetIdentity(nil), input.TerrainDatasets...)
	normalized.BuildingHeightDatasets = append([]SpatialEvidenceDatasetIdentity(nil), input.BuildingHeightDatasets...)
	sort.SliceStable(normalized.TerrainDatasets, func(i, j int) bool {
		return datasetIdentityKey(normalized.TerrainDatasets[i]) < datasetIdentityKey(normalized.TerrainDatasets[j])
	})
	sort.SliceStable(normalized.BuildingHeightDatasets, func(i, j int) bool {
		return datasetIdentityKey(normalized.BuildingHeightDatasets[i]) < datasetIdentityKey(normalized.BuildingHeightDatasets[j])
	})
	if normalized.MatchingPolicyVersion == "" {
		normalized.MatchingPolicyVersion = SpatialMatchingPolicyVersion
	}
	if normalized.DatumTransformationPolicy == "" {
		normalized.DatumTransformationPolicy = SpatialDatumPolicyVersion
	}
	if normalized.Interpolation == "" {
		normalized.Interpolation = TerrainInterpolationBilinear
	}
	if len(normalized.SourcePrecedence) == 0 {
		normalized.SourcePrecedence = DefaultHeightSourcePrecedence()
	}
	serialized, err := json.Marshal(struct {
		SchemaVersion string                          `json:"schema_version"`
		Input         SpatialEvidenceFingerprintInput `json:"input"`
	}{SpatialEvidenceSchemaVersion, normalized})
	if err != nil {
		return "spatial-evidence-unknown"
	}
	digest := sha256.Sum256(serialized)
	return "spatial-evidence-" + hex.EncodeToString(digest[:16])
}

func datasetIdentityKey(identity SpatialEvidenceDatasetIdentity) string {
	return identity.ID + "\x00" + identity.Version + "\x00" + identity.Kind + "\x00" + identity.Checksum
}

func SpatialEvidenceSummaryForPack(pack *DatasetPack) SpatialEvidenceSummary {
	matching := DefaultExternalHeightMatchPolicy()
	summary := SpatialEvidenceSummary{
		SchemaVersion: SpatialEvidenceSchemaVersion, HeightEvidence: HeightEvidenceAudit{}, SourcePrecedence: DefaultHeightSourcePrecedence(), MatchingPolicy: matching,
		BaseElevationStatus: BaseElevationGroundUnavailable, CanonicalActivation: "diagnostic_only_not_active",
		Limitations: []string{"external height sources are audited but not activated", "DSM and dem_unspecified sources cannot become ground elevation automatically"},
	}
	if pack == nil {
		summary.Terrain = TerrainDeclarationFromMetadata(TerrainMetadata{Available: false, Status: TerrainStatusUnavailable, Kind: TerrainKindDEMUnspecified, VerticalDatumKind: VerticalDatumUnknown})
		summary.SpatialFingerprint = SpatialEvidenceFingerprint(SpatialEvidenceFingerprintInput{TerrainDatasets: nil, BuildingHeightDatasets: nil})
		return summary
	}
	summary.Terrain = TerrainDeclarationFromMetadata(pack.TerrainMeta)
	if summary.Terrain.Authoritative {
		summary.BaseElevationStatus = "authoritative_dtm_available"
	} else {
		summary.Limitations = append([]string{"no authoritative DTM is installed in the current pack"}, summary.Limitations...)
	}
	summary.HeightEvidence = AuditBuildingHeightEvidence(pack.BuildingIndex)
	summary.TrustedHeightCount = summary.HeightEvidence.ExplicitHeightCount
	summary.QualifiedHeightCount = summary.HeightEvidence.LevelsDerivedHeightCount
	summary.FallbackOnlyCount = summary.HeightEvidence.FallbackOnlyCount
	terrainID := SpatialEvidenceDatasetIdentity{ID: pack.Manifest.ID, Version: pack.Manifest.Version, Kind: string(summary.Terrain.Kind), Checksum: pack.Manifest.SHA256[pack.Manifest.Files.Terrain]}
	heightsID := SpatialEvidenceDatasetIdentity{ID: pack.Manifest.ID, Version: pack.Manifest.Version, Kind: "osm_embedded_height_evidence", Checksum: pack.Manifest.SHA256[pack.Manifest.Files.Buildings]}
	input := SpatialEvidenceFingerprintInput{TerrainDatasets: []SpatialEvidenceDatasetIdentity{terrainID}, BuildingHeightDatasets: []SpatialEvidenceDatasetIdentity{heightsID}, MatchingPolicyVersion: matching.Version, SourcePrecedence: summary.SourcePrecedence, Interpolation: summary.Terrain.Interpolation, DatumTransformationPolicy: SpatialDatumPolicyVersion}
	summary.SpatialFingerprint = SpatialEvidenceFingerprint(input)
	return summary
}

func ApplyTerrainLayerDeclaration(model TerrainModel, metadata TerrainMetadata) TerrainModel {
	if model == nil {
		return nil
	}
	base := normalizeTerrainMetadata(model.Metadata())
	if metadata.Source != "" {
		base.Source = metadata.Source
	}
	if metadata.Kind != "" {
		base.Kind = normalizeTerrainKind(metadata.Kind)
	}
	if metadata.SourceVersion != "" {
		base.SourceVersion = metadata.SourceVersion
	}
	if metadata.DatasetID != "" {
		base.DatasetID = metadata.DatasetID
	}
	if metadata.ElevationReference != "" {
		base.ElevationReference = metadata.ElevationReference
	}
	if metadata.VerticalDatum != "" {
		base.VerticalDatum = metadata.VerticalDatum
	}
	if metadata.VerticalDatumKind != "" {
		base.VerticalDatumKind = normalizeVerticalDatumKind(metadata.VerticalDatumKind)
	}
	if metadata.GeoidModel != "" {
		base.GeoidModel = metadata.GeoidModel
	}
	if metadata.ResolutionXM > 0 {
		base.ResolutionXM = metadata.ResolutionXM
	}
	if metadata.ResolutionYM > 0 {
		base.ResolutionYM = metadata.ResolutionYM
	}
	if metadata.Interpolation != "" {
		base.Interpolation = normalizeInterpolation(metadata.Interpolation)
	}
	base.AcquisitionEpoch = metadata.AcquisitionEpoch
	base.Authoritative = IsAuthoritativeGroundTerrain(base)
	return terrainMetadataOverride{TerrainModel: model, metadata: base}
}

type terrainMetadataOverride struct {
	TerrainModel
	metadata TerrainMetadata
}

func (model terrainMetadataOverride) Metadata() TerrainMetadata { return model.metadata }

func (model terrainMetadataOverride) Sample(point Point, interpolation string) (float64, bool) {
	if sampled, ok := model.TerrainModel.(interface {
		Sample(Point, string) (float64, bool)
	}); ok {
		return sampled.Sample(point, interpolation)
	}
	return model.Elevation(point)
}
