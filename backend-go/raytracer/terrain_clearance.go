package raytracer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
)

const (
	// TerrainClearancePrimitiveVersion identifies the diagnostic contract. It
	// is deliberately separate from every canonical RF model version.
	TerrainClearancePrimitiveVersion = "terrain-clearance-primitive-v1"

	TerrainClearanceStatusAvailable   = "available"
	TerrainClearanceStatusPartial     = "partial_profile"
	TerrainClearanceStatusUnavailable = "unavailable"

	TerrainClearanceClassClear                = "clear"
	TerrainClearanceClassObstructionCandidate = "obstruction_candidate"
	TerrainClearanceClassNearUncertainty      = "near_uncertainty_boundary"
	TerrainClearanceClassUnavailable          = "unavailable"
	TerrainClearanceEndpointProximityM        = 30.0
	defaultTerrainClearanceRequestedSpacingM  = 30.0
)

// TerrainClearanceOptions describes a diagnostic-only source-local profile.
// A nil uncertainty margin means strict-zero classification. No production
// uncertainty margin is implied by this type.
type TerrainClearanceOptions struct {
	TxHeightAGLM       float64  `json:"tx_height_agl_m"`
	RxHeightAGLM       float64  `json:"rx_height_agl_m"`
	RequestedSpacingM  float64  `json:"requested_spacing_m"`
	UncertaintyMarginM *float64 `json:"uncertainty_margin_m,omitempty"`
}

func DefaultTerrainClearanceOptions() TerrainClearanceOptions {
	return TerrainClearanceOptions{
		TxHeightAGLM:      25.0,
		RxHeightAGLM:      1.5,
		RequestedSpacingM: defaultTerrainClearanceRequestedSpacingM,
	}
}

type TerrainClearanceSample struct {
	PathDistanceM     float64  `json:"path_distance_m"`
	PathFraction      float64  `json:"path_fraction"`
	Point             Point    `json:"point"`
	TerrainElevationM *float64 `json:"terrain_elevation_m"`
	RadioElevationM   *float64 `json:"radio_elevation_m"`
	ClearanceM        *float64 `json:"clearance_m"`
	SampleStatus      string   `json:"sample_status"`
}

// TerrainClearanceResult is the authoritative diagnostic result. Clearance
// always means radio elevation minus sampled terrain elevation:
//
//	positive = radio line is above terrain
//	negative = terrain exceeds the radio line
//
// A result is never a canonical LOS/NLOS or RF state.
type TerrainClearanceResult struct {
	PrimitiveVersion          string                   `json:"primitive_version"`
	Status                    string                   `json:"status"`
	MinimumClearanceM         *float64                 `json:"minimum_clearance_m"`
	MinimumClearanceDistanceM *float64                 `json:"minimum_clearance_distance_m"`
	MinimumClearanceFraction  *float64                 `json:"minimum_clearance_fraction"`
	MinimumLocation           string                   `json:"minimum_location,omitempty"`
	TxEndpointClearanceM      *float64                 `json:"tx_endpoint_clearance_m"`
	RxEndpointClearanceM      *float64                 `json:"rx_endpoint_clearance_m"`
	TxHeightAGLM              float64                  `json:"tx_height_agl_m"`
	RxHeightAGLM              float64                  `json:"rx_height_agl_m"`
	SampleCount               int                      `json:"sample_count"`
	ValidSampleCount          int                      `json:"valid_sample_count"`
	Classification            string                   `json:"classification"`
	Source                    string                   `json:"source,omitempty"`
	SourceVersion             string                   `json:"source_version,omitempty"`
	DatasetID                 string                   `json:"dataset_id,omitempty"`
	SourceChecksum            string                   `json:"source_checksum,omitempty"`
	RasterResolutionM         float64                  `json:"raster_resolution_m,omitempty"`
	SourceResolutionM         float64                  `json:"source_resolution_m,omitempty"`
	RequestedSpacingM         float64                  `json:"requested_spacing_m"`
	EffectiveSpacingM         float64                  `json:"effective_spacing_m"`
	Interpolation             string                   `json:"interpolation"`
	VerticalDatum             string                   `json:"vertical_datum,omitempty"`
	DatumKind                 string                   `json:"datum_kind,omitempty"`
	GeoidModel                string                   `json:"geoid_model,omitempty"`
	UncertaintyMarginM        *float64                 `json:"uncertainty_margin_m"`
	MarginPolicy              string                   `json:"margin_policy"`
	Assumptions               []string                 `json:"assumptions"`
	Qualifications            []string                 `json:"qualifications"`
	Fingerprint               string                   `json:"fingerprint"`
	Samples                   []TerrainClearanceSample `json:"samples"`
}

type terrainClearanceFingerprintInput struct {
	PrimitiveVersion  string                             `json:"primitive_version"`
	Source            string                             `json:"source"`
	SourceVersion     string                             `json:"source_version"`
	DatasetID         string                             `json:"dataset_id"`
	SourceChecksum    string                             `json:"source_checksum"`
	VerticalDatum     string                             `json:"vertical_datum"`
	DatumKind         string                             `json:"datum_kind"`
	GeoidModel        string                             `json:"geoid_model"`
	RasterResolutionM float64                            `json:"raster_resolution_m"`
	Interpolation     string                             `json:"interpolation"`
	RequestedSpacingM float64                            `json:"requested_spacing_m"`
	EffectiveSpacingM float64                            `json:"effective_spacing_m"`
	TxHeightAGLM      float64                            `json:"tx_height_agl_m"`
	RxHeightAGLM      float64                            `json:"rx_height_agl_m"`
	MarginPolicy      string                             `json:"margin_policy"`
	Geometry          []terrainClearanceFingerprintPoint `json:"geometry"`
}

type terrainClearanceFingerprintPoint struct {
	DistanceM float64 `json:"distance_m"`
	Fraction  float64 `json:"fraction"`
	Lon       float64 `json:"lon"`
	Lat       float64 `json:"lat"`
}

// BuildTerrainClearanceProfile samples the source once, then evaluates the
// authoritative clearance primitive over the resulting profile.
func BuildTerrainClearanceProfile(start, end Point, sampler *TerrainSampler, options TerrainClearanceOptions) (TerrainPathProfile, TerrainClearanceResult, error) {
	if err := validateTerrainClearanceOptions(options); err != nil {
		return TerrainPathProfile{}, TerrainClearanceResult{}, err
	}
	profile, err := BuildTerrainPathProfile(start, end, sampler, options.RequestedSpacingM)
	if err != nil {
		return TerrainPathProfile{}, TerrainClearanceResult{}, err
	}
	result, err := EvaluateTerrainClearanceProfile(profile, options)
	if err != nil {
		return TerrainPathProfile{}, TerrainClearanceResult{}, err
	}
	profile.Clearance = &result
	return profile, result, nil
}

func EvaluateTerrainClearance(start, end Point, sampler *TerrainSampler, options TerrainClearanceOptions) (TerrainClearanceResult, error) {
	_, result, err := BuildTerrainClearanceProfile(start, end, sampler, options)
	return result, err
}

// EvaluateTerrainClearanceProfile applies the primitive to an already sampled
// profile. This entry point is useful for independent hand-computed fixtures
// and prevents a caller from silently mixing source profiles.
func EvaluateTerrainClearanceProfile(profile TerrainPathProfile, options TerrainClearanceOptions) (TerrainClearanceResult, error) {
	if err := validateTerrainClearanceOptions(options); err != nil {
		return TerrainClearanceResult{}, err
	}
	if profile.DistanceM <= 0 || math.IsNaN(profile.DistanceM) || math.IsInf(profile.DistanceM, 0) {
		return TerrainClearanceResult{}, errors.New("terrain clearance profile distance must be positive and finite")
	}
	if len(profile.Samples) == 0 {
		return TerrainClearanceResult{}, errors.New("terrain clearance profile requires at least one sample")
	}

	provenance, interpolation, resolutionM, err := terrainClearanceProvenance(profile)
	if err != nil {
		return TerrainClearanceResult{}, err
	}

	result := TerrainClearanceResult{
		PrimitiveVersion:   TerrainClearancePrimitiveVersion,
		Status:             TerrainClearanceStatusUnavailable,
		SampleCount:        len(profile.Samples),
		Classification:     TerrainClearanceClassUnavailable,
		Source:             provenance.Source,
		SourceVersion:      provenance.SourceVersion,
		DatasetID:          provenance.DatasetID,
		SourceChecksum:     provenance.SourceChecksum,
		TxHeightAGLM:       options.TxHeightAGLM,
		RxHeightAGLM:       options.RxHeightAGLM,
		RasterResolutionM:  resolutionM,
		SourceResolutionM:  resolutionM,
		RequestedSpacingM:  profile.RequestedSpacingM,
		EffectiveSpacingM:  profile.EffectiveSpacingM,
		Interpolation:      interpolation,
		VerticalDatum:      provenance.VerticalDatum,
		DatumKind:          provenance.VerticalDatumKind,
		GeoidModel:         provenance.GeoidModel,
		UncertaintyMarginM: options.UncertaintyMarginM,
		MarginPolicy:       terrainClearanceMarginPolicy(options.UncertaintyMarginM),
		Assumptions: []string{
			"z_tx_abs = terrain_at_tx + tx_height_agl_m",
			"z_rx_abs = terrain_at_rx + rx_height_agl_m",
			"z_radio(u) = z_tx_abs + u * (z_rx_abs - z_tx_abs), for u in [0,1]",
			"clearance_m = radio_elevation_m - terrain_elevation_m; positive means above terrain",
			"minimum clearance is the minimum over valid sampled clearances and includes endpoints",
		},
		Qualifications: []string{
			"sampled terrain evidence is constrained by raster resolution and is not an exact continuous terrain-intersection test",
			"diagnostic-only result; classification is not canonical LOS/NLOS or RF state",
		},
		Samples: make([]TerrainClearanceSample, 0, len(profile.Samples)),
	}
	if result.EffectiveSpacingM > result.RequestedSpacingM {
		result.Qualifications = append(result.Qualifications, "effective spacing was bounded by the source raster resolution")
	}
	if provenance.VerticalDatum == "" || provenance.VerticalDatumKind == "" || provenance.VerticalDatumKind == VerticalDatumUnknown {
		result.Qualifications = append(result.Qualifications, "source vertical datum identity is incomplete; result remains source-local diagnostic evidence")
	}

	validSampleCount := 0
	allSamplesValid := true
	endpointValid := len(profile.Samples) >= 2 && terrainClearanceSampleValid(profile.Samples[0].Terrain) && terrainClearanceSampleValid(profile.Samples[len(profile.Samples)-1].Terrain)
	if len(profile.Samples) == 1 {
		endpointValid = terrainClearanceSampleValid(profile.Samples[0].Terrain)
	}

	var txRadio, rxRadio float64
	if endpointValid {
		txTerrain := *profile.Samples[0].Terrain.ElevationM
		rxTerrain := txTerrain
		if len(profile.Samples) >= 2 {
			rxTerrain = *profile.Samples[len(profile.Samples)-1].Terrain.ElevationM
		}
		txRadio = txTerrain + options.TxHeightAGLM
		rxRadio = rxTerrain + options.RxHeightAGLM
	}

	minimumIndex := -1
	var minimumClearance float64
	for index, pathSample := range profile.Samples {
		fraction := pathSample.DistanceM / profile.DistanceM
		if index == 0 {
			fraction = 0
		} else if index == len(profile.Samples)-1 {
			fraction = 1
		}
		clearanceSample := TerrainClearanceSample{
			PathDistanceM:     pathSample.DistanceM,
			PathFraction:      fraction,
			Point:             pathSample.Point,
			TerrainElevationM: cloneFloatPointer(pathSample.Terrain.ElevationM),
			SampleStatus:      pathSample.Terrain.Status,
		}
		terrainValid := terrainClearanceSampleValid(pathSample.Terrain)
		if terrainValid {
			validSampleCount++
		} else {
			allSamplesValid = false
		}
		if endpointValid {
			radio := txRadio + fraction*(rxRadio-txRadio)
			clearanceSample.RadioElevationM = &radio
			if terrainValid {
				// Authoritative sign convention: radio line minus sampled terrain.
				clearance := radio - *pathSample.Terrain.ElevationM
				clearanceSample.ClearanceM = &clearance
				if minimumIndex < 0 || clearance < minimumClearance {
					minimumIndex = index
					minimumClearance = clearance
				}
			}
		}
		result.Samples = append(result.Samples, clearanceSample)
	}
	result.ValidSampleCount = validSampleCount

	if endpointValid {
		txClearance := options.TxHeightAGLM
		rxClearance := options.RxHeightAGLM
		result.TxEndpointClearanceM = &txClearance
		if len(profile.Samples) >= 2 {
			result.RxEndpointClearanceM = &rxClearance
		} else {
			result.RxEndpointClearanceM = &txClearance
		}
	}
	if minimumIndex >= 0 {
		minimumDistance := result.Samples[minimumIndex].PathDistanceM
		minimumFraction := result.Samples[minimumIndex].PathFraction
		result.MinimumClearanceM = &minimumClearance
		result.MinimumClearanceDistanceM = &minimumDistance
		result.MinimumClearanceFraction = &minimumFraction
		result.MinimumLocation = terrainClearanceMinimumLocation(minimumIndex, len(result.Samples), minimumDistance, profile.DistanceM)
	}

	sourceAvailable := provenance.EvidenceClass != EvidenceUnavailable && provenance.Source != "" || result.ValidSampleCount > 0
	switch {
	case !sourceAvailable || result.ValidSampleCount == 0 || !endpointValid || result.MinimumClearanceM == nil:
		result.Status = TerrainClearanceStatusUnavailable
	case !allSamplesValid:
		result.Status = TerrainClearanceStatusPartial
		result.Qualifications = append(result.Qualifications, "one or more samples is no_data, outside_dataset, unavailable, NaN, or Inf; no obstruction classification is emitted")
	default:
		result.Status = TerrainClearanceStatusAvailable
		result.Classification = classifyTerrainClearance(*result.MinimumClearanceM, options.UncertaintyMarginM)
	}

	result.Fingerprint = terrainClearanceFingerprint(profile, options, result)
	return result, nil
}

func validateTerrainClearanceOptions(options TerrainClearanceOptions) error {
	if options.TxHeightAGLM < 0 || math.IsNaN(options.TxHeightAGLM) || math.IsInf(options.TxHeightAGLM, 0) {
		return errors.New("terrain clearance Tx AGL must be finite and non-negative")
	}
	if options.RxHeightAGLM < 0 || math.IsNaN(options.RxHeightAGLM) || math.IsInf(options.RxHeightAGLM, 0) {
		return errors.New("terrain clearance Rx AGL must be finite and non-negative")
	}
	if options.RequestedSpacingM <= 0 || math.IsNaN(options.RequestedSpacingM) || math.IsInf(options.RequestedSpacingM, 0) {
		return errors.New("terrain clearance requested spacing must be positive and finite")
	}
	if options.UncertaintyMarginM != nil && (*options.UncertaintyMarginM < 0 || math.IsNaN(*options.UncertaintyMarginM) || math.IsInf(*options.UncertaintyMarginM, 0)) {
		return errors.New("terrain clearance uncertainty margin must be finite and non-negative")
	}
	return nil
}

func validateTerrainInterpolation(method string) error {
	if method == "" || method == TerrainInterpolationNearest || method == TerrainInterpolationBilinear {
		return nil
	}
	return errors.New("terrain interpolation must be nearest or bilinear")
}

func terrainClearanceProvenance(profile TerrainPathProfile) (EvidenceProvenance, string, float64, error) {
	first := profile.Samples[0].Terrain
	provenance := first.Source
	interpolation := first.Interpolation
	if interpolation == "" {
		interpolation = TerrainInterpolationBilinear
	}
	resolutionM := math.Max(first.ResolutionXM, first.ResolutionYM)
	for index, sample := range profile.Samples[1:] {
		current := sample.Terrain
		if current.Source.Source != provenance.Source || current.Source.SourceVersion != provenance.SourceVersion || current.Source.DatasetID != provenance.DatasetID || current.Source.SourceChecksum != provenance.SourceChecksum || current.Source.VerticalDatum != provenance.VerticalDatum || current.Source.VerticalDatumKind != provenance.VerticalDatumKind || current.Source.GeoidModel != provenance.GeoidModel {
			return EvidenceProvenance{}, "", 0, fmt.Errorf("terrain clearance sample %d disagrees with source-local vertical datum identity", index+1)
		}
		if current.Interpolation != "" && current.Interpolation != interpolation {
			return EvidenceProvenance{}, "", 0, fmt.Errorf("terrain clearance sample %d disagrees with source-local interpolation", index+1)
		}
		resolutionM = math.Max(resolutionM, math.Max(current.ResolutionXM, current.ResolutionYM))
	}
	return provenance, interpolation, resolutionM, nil
}

func terrainClearanceSampleValid(sample TerrainSample) bool {
	if sample.ElevationM == nil || math.IsNaN(*sample.ElevationM) || math.IsInf(*sample.ElevationM, 0) {
		return false
	}
	switch sample.Status {
	case TerrainSampleUnavailable, TerrainSampleOutsideDataset, TerrainSampleNoData:
		return false
	default:
		return true
	}
}

func classifyTerrainClearance(minimum float64, margin *float64) string {
	if margin == nil || *margin == 0 {
		if minimum < 0 {
			return TerrainClearanceClassObstructionCandidate
		}
		return TerrainClearanceClassClear
	}
	if minimum < -*margin {
		return TerrainClearanceClassObstructionCandidate
	}
	if math.Abs(minimum) <= *margin {
		return TerrainClearanceClassNearUncertainty
	}
	return TerrainClearanceClassClear
}

func terrainClearanceMarginPolicy(margin *float64) string {
	if margin == nil || *margin == 0 {
		return "strict_zero"
	}
	return fmt.Sprintf("symmetric_margin_%g_m", *margin)
}

func terrainClearanceMinimumLocation(index, count int, distance, totalDistance float64) string {
	if index == 0 {
		return "at_tx"
	}
	if index == count-1 {
		return "at_rx"
	}
	if distance <= TerrainClearanceEndpointProximityM {
		return "near_tx"
	}
	if totalDistance-distance <= TerrainClearanceEndpointProximityM {
		return "near_rx"
	}
	return "interior"
}

func terrainClearanceFingerprint(profile TerrainPathProfile, options TerrainClearanceOptions, result TerrainClearanceResult) string {
	geometry := make([]terrainClearanceFingerprintPoint, 0, len(profile.Samples))
	for index, sample := range profile.Samples {
		fraction := sample.DistanceM / profile.DistanceM
		if index == 0 {
			fraction = 0
		} else if index == len(profile.Samples)-1 {
			fraction = 1
		}
		geometry = append(geometry, terrainClearanceFingerprintPoint{DistanceM: sample.DistanceM, Fraction: fraction, Lon: sample.Point.Lon, Lat: sample.Point.Lat})
	}
	input := terrainClearanceFingerprintInput{
		PrimitiveVersion: TerrainClearancePrimitiveVersion, Source: result.Source, SourceVersion: result.SourceVersion,
		DatasetID: result.DatasetID, SourceChecksum: result.SourceChecksum, VerticalDatum: result.VerticalDatum,
		DatumKind: result.DatumKind, GeoidModel: result.GeoidModel, RasterResolutionM: result.RasterResolutionM,
		Interpolation: result.Interpolation, RequestedSpacingM: result.RequestedSpacingM, EffectiveSpacingM: result.EffectiveSpacingM,
		TxHeightAGLM: options.TxHeightAGLM, RxHeightAGLM: options.RxHeightAGLM,
		MarginPolicy: result.MarginPolicy, Geometry: geometry,
	}
	payload, err := json.Marshal(input)
	if err != nil {
		return ""
	}
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:])
}

func cloneFloatPointer(value *float64) *float64 {
	if value == nil {
		return nil
	}
	copyValue := *value
	return &copyValue
}
