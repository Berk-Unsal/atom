package raytracer

// This file is an evidence-only validation boundary for the canonical 2.6 and
// 28 GHz planning profiles. It intentionally does not alter any production RF
// request, optimizer, receiver, interference, or propagation path. The
// evaluator calls the same link and radio-quality primitives used by planning
// and keeps the observed quantity explicit instead of normalizing everything
// to path loss as the isolated Sub-THz evidence workflow does.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

const (
	CanonicalRFValidationSchemaVersion    = 1
	CanonicalRFValidationAdapterVersion   = "canonical-rf-observation-adapter-v1"
	CanonicalRFValidationEvaluatorVersion = "canonical-rf-validation-evaluator-v1"
	CanonicalRFValidationMaxObservations  = 5000
	CanonicalRFValidationMaxCells         = 512
	CanonicalRFValidationFrequencyTolGHz  = 1e-6
	// Shared 4I.3 defaults; the canonical extension changes quantity semantics
	// without creating a second repository-wide policy for group size or cells.
	CanonicalRFValidationMinimumGroupN      = MinimumValidationSamples
	CanonicalRFValidationDefaultCellM       = DefaultSpatialCellSizeM
	CanonicalRFValidationDefaultSeparationM = DefaultSpatialSeparationM
)

const (
	CanonicalRFQuantityReceivedPowerDBm = "received_power_dbm"
	CanonicalRFQuantityRSRPDBm          = "rsrp_dbm"
	CanonicalRFQuantitySINRDB           = "sinr_db"
	CanonicalRFQuantityRSRQDB           = "rsrq_db"
	CanonicalRFQuantityRSSIDBm          = "rssi_dbm"
	CanonicalRFQuantityPathLossDB       = "path_loss_db"
)

const (
	CanonicalRFStatusApplicable            = "applicable"
	CanonicalRFStatusInapplicable          = "inapplicable"
	CanonicalRFStatusInsufficientMetadata  = "insufficient_metadata"
	CanonicalRFStatusQuantityIncompatible  = "quantity_incompatible"
	CanonicalRFStatusCensored              = "censored"
	CanonicalRFStatusUnresolvedTransmitter = "unresolved_transmitter"
	CanonicalRFStatusDeterministicMismatch = "deterministic_mismatch"
)

const (
	CanonicalRFCensorUncensored     = "uncensored"
	CanonicalRFCensorLeft           = "left_censored"
	CanonicalRFCensorRight          = "right_censored"
	CanonicalRFCensorBelowDetection = "below_detection_limit"
	CanonicalRFCensorNotDetected    = "not_detected"
)

const (
	CanonicalRFReadinessNoMeasurementData         = "no_measurement_data"
	CanonicalRFReadinessInsufficientMetadata      = "insufficient_metadata"
	CanonicalRFReadinessValidationOnly            = "validation_only"
	CanonicalRFReadinessCalibrationUnstable       = "calibration_unstable"
	CanonicalRFReadinessCalibrationCandidate      = "calibration_candidate"
	CanonicalRFReadinessValidatedForDeclaredScope = "validated_for_declared_scope"
)

const (
	CanonicalRFHeightMeasured   = "measured"
	CanonicalRFHeightConfigured = "configured"
	CanonicalRFHeightAssumed    = "assumed"
	CanonicalRFHeightUnknown    = "unknown"
)

// CanonicalRFValidationObservation is the source-independent observation
// contract. ValueDB is expressed in dB/dBm according to Quantity; a nil value
// is valid only for an explicitly censored observation. No field is silently
// filled with a receiver, antenna, height, cell, frequency, or aggregation
// default.
type CanonicalRFValidationObservation struct {
	ObservationID   string   `json:"observation_id"`
	CampaignID      string   `json:"campaign_id"`
	CampaignVersion string   `json:"campaign_version,omitempty"`
	SiteID          string   `json:"site_id"`
	SessionID       string   `json:"session_id,omitempty"`
	Timestamp       string   `json:"timestamp,omitempty"`
	Lat             *float64 `json:"lat,omitempty"`
	Lon             *float64 `json:"lon,omitempty"`
	DistanceM       *float64 `json:"distance_m,omitempty"`
	RxHeightM       *float64 `json:"rx_height_m,omitempty"`
	RxHeightSource  string   `json:"rx_height_source,omitempty"`

	Technology   string   `json:"technology"`
	FrequencyGHz *float64 `json:"frequency_ghz"`
	Band         string   `json:"band,omitempty"`
	BandwidthMHz *float64 `json:"bandwidth_mhz,omitempty"`
	ChannelID    string   `json:"channel_id,omitempty"`

	TransmitterID      string   `json:"transmitter_id,omitempty"`
	ServingCellID      string   `json:"serving_cell_id,omitempty"`
	ServingPCI         *int     `json:"serving_pci,omitempty"`
	Quantity           string   `json:"quantity"`
	ValueDB            *float64 `json:"value_db,omitempty"`
	QuantityDefinition string   `json:"quantity_definition,omitempty"`

	DeviceID         string   `json:"device_id,omitempty"`
	DeviceModel      string   `json:"device_model,omitempty"`
	AntennaID        string   `json:"antenna_id,omitempty"`
	AntennaModel     string   `json:"antenna_model,omitempty"`
	CalibrationID    string   `json:"calibration_id,omitempty"`
	CalibrationState string   `json:"calibration_state,omitempty"`
	AntennaGainDBi   *float64 `json:"antenna_gain_dbi,omitempty"`
	AntennaBasis     string   `json:"antenna_basis,omitempty"`

	MotionState           string   `json:"motion_state,omitempty"`
	SamplingMethod        string   `json:"sampling_method,omitempty"`
	AggregationMethod     string   `json:"aggregation_method,omitempty"`
	AggregationPercentile *float64 `json:"aggregation_percentile,omitempty"`
	SampleCount           int      `json:"sample_count,omitempty"`
	Provenance            string   `json:"provenance,omitempty"`
	QualityFlags          []string `json:"quality_flags,omitempty"`

	LOSState          string   `json:"los_nlos,omitempty"`
	LOSSource         string   `json:"los_source,omitempty"`
	Outdoor           *bool    `json:"outdoor,omitempty"`
	DetectionLimitDBm *float64 `json:"detection_limit_dbm,omitempty"`
	CensoringStatus   string   `json:"censoring_status,omitempty"`

	ResourceSemantics           string   `json:"resource_semantics,omitempty"`
	InterferenceContextComplete *bool    `json:"interference_context_complete,omitempty"`
	NeighborCellIDs             []string `json:"neighbor_cell_ids,omitempty"`
}

// CanonicalRFValidationTransmitter is the deterministic matching inventory.
// Matching never selects the strongest modeled cell; an observation must be
// tied to an explicit ID/mapping or to an explicitly enabled geographic
// candidate policy.
type CanonicalRFValidationTransmitter struct {
	CellID     string        `json:"cell_id"`
	MappingID  string        `json:"mapping_id,omitempty"`
	SiteID     string        `json:"site_id,omitempty"`
	Lat        float64       `json:"lat"`
	Lon        float64       `json:"lon"`
	AzimuthDeg float64       `json:"azimuth_deg,omitempty"`
	RFProfile  CellRFProfile `json:"rf_profile"`
}

type CanonicalRFValidationDataset struct {
	SchemaVersion  int                                `json:"schema_version"`
	DatasetID      string                             `json:"dataset_id"`
	DatasetVersion string                             `json:"dataset_version"`
	SourceType     string                             `json:"source_type"`
	SourceCitation string                             `json:"source_citation,omitempty"`
	License        string                             `json:"license,omitempty"`
	MetadataURL    string                             `json:"metadata_url,omitempty"`
	Observations   []CanonicalRFValidationObservation `json:"observations,omitempty"`
	Transmitters   []CanonicalRFValidationTransmitter `json:"transmitters,omitempty"`
}

type CanonicalRFValidationStrategy struct {
	Method             string  `json:"method,omitempty"`
	SpatialCellSizeM   float64 `json:"spatial_cell_size_m,omitempty"`
	MinimumSeparationM float64 `json:"minimum_separation_m,omitempty"`
	PrimaryHoldout     bool    `json:"primary_holdout,omitempty"`
}

type CanonicalRFValidationOptions struct {
	SchemaVersion                 int                           `json:"schema_version"`
	BuildingsAvailable            bool                          `json:"buildings_available"`
	Buildings                     *BuildingIndex                `json:"-"`
	AllowGeographicCandidateMatch bool                          `json:"allow_geographic_candidate_match"`
	GeographicCandidateRadiusM    float64                       `json:"geographic_candidate_radius_m,omitempty"`
	Strategy                      CanonicalRFValidationStrategy `json:"strategy,omitempty"`
	IncludePredictions            bool                          `json:"include_predictions"`
	CalibrationRequested          bool                          `json:"calibration_requested"`
	DeclaredScope                 string                        `json:"declared_scope,omitempty"`
}

// CanonicalRFValidationRequest is deliberately a library contract rather than
// a planning endpoint request. It can be wrapped by a future source-specific
// API without entering normal planning or optimizer workflows.
type CanonicalRFValidationRequest struct {
	SchemaVersion int                          `json:"schema_version"`
	Dataset       CanonicalRFValidationDataset `json:"dataset"`
	Options       CanonicalRFValidationOptions `json:"options,omitempty"`
}

type CanonicalRFAssumptions struct {
	Items []string `json:"items,omitempty"`
}

type CanonicalRFEvidence struct {
	Primitive              string                   `json:"primitive"`
	ModelID                string                   `json:"model_id"`
	AppliedModelID         string                   `json:"applied_model_id,omitempty"`
	FrequencyGHz           float64                  `json:"frequency_ghz"`
	DistanceM              float64                  `json:"distance_m"`
	LOSState               string                   `json:"los_nlos,omitempty"`
	EndpointCase           string                   `json:"endpoint_case,omitempty"`
	Applicability          PropagationApplicability `json:"applicability"`
	PropagationFingerprint string                   `json:"propagation_fingerprint"`
	RFContract             RFContractMetadata       `json:"rf_contract"`
	ReceivedPowerDBm       *float64                 `json:"received_power_dbm,omitempty"`
	PathLossDB             *float64                 `json:"path_loss_db,omitempty"`
	RSRPDBm                *float64                 `json:"rsrp_dbm,omitempty"`
	SINRDB                 *float64                 `json:"sinr_db,omitempty"`
	RSRQDB                 *float64                 `json:"rsrq_db,omitempty"`
	RSSIDBm                *float64                 `json:"rssi_dbm,omitempty"`
	ReceiverThreshold      *ReceiverThreshold       `json:"receiver_threshold,omitempty"`
	RSRPConversionID       string                   `json:"rsrp_conversion_id,omitempty"`
	ResourceSemantics      string                   `json:"resource_semantics,omitempty"`
	InterferenceValidation string                   `json:"interference_validation,omitempty"`
}

type CanonicalRFValidationObservationResult struct {
	ObservationID          string               `json:"observation_id"`
	CampaignID             string               `json:"campaign_id"`
	SiteID                 string               `json:"site_id"`
	SessionID              string               `json:"session_id,omitempty"`
	Lat                    *float64             `json:"lat,omitempty"`
	Lon                    *float64             `json:"lon,omitempty"`
	Quantity               string               `json:"quantity"`
	FrequencyGHz           float64              `json:"frequency_ghz,omitempty"`
	DistanceM              float64              `json:"distance_m,omitempty"`
	LOSState               string               `json:"los_nlos,omitempty"`
	DistanceBin            string               `json:"distance_bin,omitempty"`
	TransmitterID          string               `json:"transmitter_id,omitempty"`
	MatchingMethod         string               `json:"matching_method,omitempty"`
	MatchingStatus         string               `json:"matching_status,omitempty"`
	Status                 string               `json:"status"`
	ExclusionReason        string               `json:"exclusion_reason,omitempty"`
	EvidenceStatus         string               `json:"evidence_status,omitempty"`
	CensoringStatus        string               `json:"censoring_status,omitempty"`
	InterferenceValidation string               `json:"interference_validation,omitempty"`
	MeasuredValueDB        *float64             `json:"measured_value_db,omitempty"`
	PredictedValueDB       *float64             `json:"predicted_value_db,omitempty"`
	ResidualDB             *float64             `json:"residual_db,omitempty"`
	AbsoluteErrorDB        *float64             `json:"absolute_error_db,omitempty"`
	Assumptions            []string             `json:"assumptions,omitempty"`
	Evidence               *CanonicalRFEvidence `json:"evidence,omitempty"`
}

type CanonicalRFMetric struct {
	Count         int      `json:"n"`
	MeanBiasDB    *float64 `json:"mean_bias_db,omitempty"`
	MedianBiasDB  *float64 `json:"median_bias_db,omitempty"`
	MAEDB         *float64 `json:"mae_db,omitempty"`
	RMSEDB        *float64 `json:"rmse_db,omitempty"`
	StdDB         *float64 `json:"std_db,omitempty"`
	P50AbsErrorDB *float64 `json:"p50_abs_error_db,omitempty"`
	P90AbsErrorDB *float64 `json:"p90_abs_error_db,omitempty"`
	P95AbsErrorDB *float64 `json:"p95_abs_error_db,omitempty"`
	MinResidualDB *float64 `json:"min_residual_db,omitempty"`
	P01ResidualDB *float64 `json:"p01_residual_db,omitempty"`
	P10ResidualDB *float64 `json:"p10_residual_db,omitempty"`
	P90ResidualDB *float64 `json:"p90_residual_db,omitempty"`
	P99ResidualDB *float64 `json:"p99_residual_db,omitempty"`
	MaxResidualDB *float64 `json:"max_residual_db,omitempty"`
	SmallGroup    bool     `json:"small_group,omitempty"`
}

type CanonicalRFMetricRow struct {
	Key          string            `json:"key"`
	Quantity     string            `json:"quantity"`
	FrequencyGHz *float64          `json:"frequency_ghz,omitempty"`
	LOSState     string            `json:"los_nlos,omitempty"`
	DistanceBin  string            `json:"distance_bin,omitempty"`
	SiteID       string            `json:"site_id,omitempty"`
	CampaignID   string            `json:"campaign_id,omitempty"`
	Metric       CanonicalRFMetric `json:"metric"`
}

type CanonicalRFValidationSummary struct {
	Overall     []CanonicalRFMetricRow `json:"overall"`
	ByFrequency []CanonicalRFMetricRow `json:"by_frequency"`
	ByLOS       []CanonicalRFMetricRow `json:"by_los_nlos"`
	ByDistance  []CanonicalRFMetricRow `json:"by_distance"`
	BySite      []CanonicalRFMetricRow `json:"by_site"`
	ByCampaign  []CanonicalRFMetricRow `json:"by_campaign"`
}

type CanonicalRFValidationCounts struct {
	Total                 int            `json:"total"`
	Applicable            int            `json:"applicable"`
	Censored              int            `json:"censored"`
	Inapplicable          int            `json:"inapplicable"`
	InsufficientMetadata  int            `json:"insufficient_metadata"`
	QuantityIncompatible  int            `json:"quantity_incompatible"`
	UnresolvedTransmitter int            `json:"unresolved_transmitter"`
	DeterministicMismatch int            `json:"deterministic_mismatch"`
	ExcludedReason        map[string]int `json:"excluded_reason"`
}

type CanonicalRFHoldoutFold struct {
	FoldID               string   `json:"fold_id"`
	Method               string   `json:"method"`
	CalibrationIDs       []string `json:"calibration_ids"`
	ValidationIDs        []string `json:"validation_ids"`
	CalibrationSites     []string `json:"calibration_sites,omitempty"`
	ValidationSites      []string `json:"validation_sites,omitempty"`
	CalibrationCampaigns []string `json:"calibration_campaigns,omitempty"`
	ValidationCampaigns  []string `json:"validation_campaigns,omitempty"`
	CalibrationCount     int      `json:"calibration_count"`
	ValidationCount      int      `json:"validation_count"`
	MinimumSeparationM   float64  `json:"minimum_separation_m"`
	NoLeakEvidence       string   `json:"no_leak_evidence"`
}

type CanonicalRFHoldoutResult struct {
	Method             string                   `json:"method"`
	Primary            bool                     `json:"primary"`
	SpatialCellSizeM   float64                  `json:"spatial_cell_size_m,omitempty"`
	MinimumSeparationM float64                  `json:"minimum_separation_m,omitempty"`
	Folds              []CanonicalRFHoldoutFold `json:"folds"`
	Notes              []string                 `json:"notes,omitempty"`
}

type CanonicalRFCalibrationFold struct {
	FoldID           string            `json:"fold_id"`
	Quantity         string            `json:"quantity"`
	FrequencyGHz     float64           `json:"frequency_ghz"`
	CalibrationCount int               `json:"calibration_count"`
	ValidationCount  int               `json:"validation_count"`
	BiasDB           *float64          `json:"bias_db,omitempty"`
	Baseline         CanonicalRFMetric `json:"uncalibrated_baseline"`
	Corrected        CanonicalRFMetric `json:"heldout_constant_bias"`
	Stable           bool              `json:"stable"`
}

type CanonicalRFCalibrationResult struct {
	Policy            string                       `json:"policy"`
	FrequencySpecific bool                         `json:"frequency_specific"`
	LOSStratified     bool                         `json:"los_stratified"`
	Promoted          bool                         `json:"promoted"`
	Status            string                       `json:"status"`
	Folds             []CanonicalRFCalibrationFold `json:"folds,omitempty"`
	Notes             []string                     `json:"notes,omitempty"`
}

type CanonicalRFValidationResponse struct {
	SchemaVersion         int                                      `json:"schema_version"`
	DatasetIdentity       CanonicalRFValidationDatasetIdentity     `json:"dataset_identity"`
	Counts                CanonicalRFValidationCounts              `json:"counts"`
	Summary               CanonicalRFValidationSummary             `json:"summary"`
	Observations          []CanonicalRFValidationObservationResult `json:"observations,omitempty"`
	Holdout               *CanonicalRFHoldoutResult                `json:"holdout,omitempty"`
	Calibration           *CanonicalRFCalibrationResult            `json:"calibration,omitempty"`
	Readiness             string                                   `json:"readiness"`
	ProductionCandidate   bool                                     `json:"production_candidate"`
	CalibrationActive     bool                                     `json:"calibration_active"`
	ConfigurationClass    string                                   `json:"configuration_class"`
	RFScenarioFingerprint string                                   `json:"rf_scenario_fingerprint"`
	ObservationChecksum   string                                   `json:"observation_checksum"`
	ValidationFingerprint string                                   `json:"validation_fingerprint"`
	Policy                map[string]string                        `json:"policy"`
	Notes                 []string                                 `json:"notes,omitempty"`
}

type CanonicalRFValidationDatasetIdentity struct {
	DatasetID      string `json:"dataset_id"`
	DatasetVersion string `json:"dataset_version"`
	SourceType     string `json:"source_type"`
	SourceCitation string `json:"source_citation,omitempty"`
	License        string `json:"license,omitempty"`
	MetadataURL    string `json:"metadata_url,omitempty"`
}

// CanonicalRFValidationAdapter is the source-independent seam. Public or
// field-specific adapters should map into this schema and must not call the
// production planner directly while importing data.
type CanonicalRFValidationAdapter interface {
	ID() string
	Version() string
	Adapt(CanonicalRFValidationDataset) (CanonicalRFValidationDataset, error)
}

type CanonicalRFIdentityAdapter struct{}

func (CanonicalRFIdentityAdapter) ID() string      { return "canonical_schema_identity" }
func (CanonicalRFIdentityAdapter) Version() string { return CanonicalRFValidationAdapterVersion }
func (CanonicalRFIdentityAdapter) Adapt(dataset CanonicalRFValidationDataset) (CanonicalRFValidationDataset, error) {
	if validationError := ValidateCanonicalRFValidationDataset(dataset); validationError != "" {
		return CanonicalRFValidationDataset{}, fmt.Errorf("canonical validation dataset: %s", validationError)
	}
	return dataset, nil
}

func canonicalRFKnownQuantity(quantity string) bool {
	switch strings.ToLower(strings.TrimSpace(quantity)) {
	case CanonicalRFQuantityReceivedPowerDBm, CanonicalRFQuantityRSRPDBm, CanonicalRFQuantitySINRDB, CanonicalRFQuantityRSRQDB, CanonicalRFQuantityRSSIDBm, CanonicalRFQuantityPathLossDB:
		return true
	default:
		return false
	}
}

func canonicalRFCensoring(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", CanonicalRFCensorUncensored, CanonicalRFCensorLeft, CanonicalRFCensorRight, CanonicalRFCensorBelowDetection, CanonicalRFCensorNotDetected:
		return true
	default:
		return false
	}
}

func canonicalRFFinitePointer(value *float64) bool {
	return value != nil && !math.IsNaN(*value) && !math.IsInf(*value, 0)
}

func validCanonicalRFIdentifier(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 {
		return false
	}
	for _, r := range value {
		if !(r == '-' || r == '_' || r == '.' || r == ':' || r >= '0' && r <= '9' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z') {
			return false
		}
	}
	return true
}

// ValidateCanonicalRFValidationDataset rejects missing semantics rather than
// filling them. A zero-observation dataset is valid so the audit can represent
// the explicitly documented no-measurement-data state.
func ValidateCanonicalRFValidationDataset(dataset CanonicalRFValidationDataset) string {
	if dataset.SchemaVersion != CanonicalRFValidationSchemaVersion {
		return fmt.Sprintf("schema_version must be %d", CanonicalRFValidationSchemaVersion)
	}
	if !validCanonicalRFIdentifier(dataset.DatasetID) || strings.TrimSpace(dataset.DatasetVersion) == "" {
		return "dataset_id and dataset_version are required identifiers"
	}
	if strings.TrimSpace(dataset.SourceType) == "" {
		return "source_type is required"
	}
	if len(dataset.Observations) > CanonicalRFValidationMaxObservations {
		return fmt.Sprintf("observations must contain at most %d records", CanonicalRFValidationMaxObservations)
	}
	if len(dataset.Transmitters) > CanonicalRFValidationMaxCells {
		return fmt.Sprintf("transmitters must contain at most %d records", CanonicalRFValidationMaxCells)
	}
	seenCells := map[string]struct{}{}
	for index, transmitter := range dataset.Transmitters {
		if !validCanonicalRFIdentifier(transmitter.CellID) {
			return fmt.Sprintf("transmitters[%d].cell_id is invalid", index)
		}
		if _, exists := seenCells[transmitter.CellID]; exists {
			return fmt.Sprintf("transmitters[%d].cell_id is duplicated", index)
		}
		seenCells[transmitter.CellID] = struct{}{}
		if !finiteCoordinate(transmitter.Lon, transmitter.Lat) {
			return fmt.Sprintf("transmitters[%d] coordinates are invalid", index)
		}
		profile := transmitter.RFProfile.normalized()
		if validationError := ValidateCellRFProfile(profile, false); validationError != "" {
			return fmt.Sprintf("transmitters[%d].rf_profile: %s", index, validationError)
		}
		if math.Abs(profile.FrequencyGHz-2.6) > 0.01 && math.Abs(profile.FrequencyGHz-28) > 0.01 {
			return fmt.Sprintf("transmitters[%d].rf_profile.frequency_ghz must be 2.6 or 28 for canonical validation", index)
		}
	}
	seenObservations := map[string]struct{}{}
	for index, observation := range dataset.Observations {
		if !validCanonicalRFIdentifier(observation.ObservationID) {
			return fmt.Sprintf("observations[%d].observation_id is invalid", index)
		}
		if _, exists := seenObservations[observation.ObservationID]; exists {
			return fmt.Sprintf("observations[%d].observation_id is duplicated", index)
		}
		seenObservations[observation.ObservationID] = struct{}{}
		if !validCanonicalRFIdentifier(observation.CampaignID) || !validCanonicalRFIdentifier(observation.SiteID) {
			return fmt.Sprintf("observations[%d] campaign_id and site_id are required identifiers", index)
		}
		if observation.Timestamp != "" {
			if _, err := time.Parse(time.RFC3339, observation.Timestamp); err != nil {
				return fmt.Sprintf("observations[%d].timestamp must use RFC3339", index)
			}
		}
		if observation.Lat != nil || observation.Lon != nil {
			if observation.Lat == nil || observation.Lon == nil || !finiteCoordinate(*observation.Lon, *observation.Lat) {
				return fmt.Sprintf("observations[%d] coordinates must be supplied together and be valid", index)
			}
		}
		if observation.DistanceM != nil && (!canonicalRFFinitePointer(observation.DistanceM) || *observation.DistanceM <= 0) {
			return fmt.Sprintf("observations[%d].distance_m must be positive and finite", index)
		}
		if observation.RxHeightM != nil && (!canonicalRFFinitePointer(observation.RxHeightM) || *observation.RxHeightM <= 0) {
			return fmt.Sprintf("observations[%d].rx_height_m must be positive and finite", index)
		}
		if observation.RxHeightSource != "" && !oneOf(observation.RxHeightSource, CanonicalRFHeightMeasured, CanonicalRFHeightConfigured, CanonicalRFHeightAssumed, CanonicalRFHeightUnknown) {
			return fmt.Sprintf("observations[%d].rx_height_source is unsupported", index)
		}
		if observation.FrequencyGHz != nil && (!canonicalRFFinitePointer(observation.FrequencyGHz) || *observation.FrequencyGHz <= 0 || *observation.FrequencyGHz > 100) {
			return fmt.Sprintf("observations[%d].frequency_ghz is invalid", index)
		}
		if observation.BandwidthMHz != nil && (!canonicalRFFinitePointer(observation.BandwidthMHz) || *observation.BandwidthMHz <= 0) {
			return fmt.Sprintf("observations[%d].bandwidth_mhz must be positive and finite", index)
		}
		if !canonicalRFKnownQuantity(observation.Quantity) {
			return fmt.Sprintf("observations[%d].quantity is unsupported", index)
		}
		if !canonicalRFCensoring(observation.CensoringStatus) {
			return fmt.Sprintf("observations[%d].censoring_status is unsupported", index)
		}
		if observation.ValueDB != nil && !canonicalRFFinitePointer(observation.ValueDB) {
			return fmt.Sprintf("observations[%d].value_db must be finite", index)
		}
		censored := observation.CensoringStatus != "" && observation.CensoringStatus != CanonicalRFCensorUncensored
		if observation.ValueDB == nil && !censored {
			return fmt.Sprintf("observations[%d].value_db is required unless the observation is censored", index)
		}
		if observation.AggregationMethod != "" && !oneOf(observation.AggregationMethod, "raw", "mean", "median", "percentile") {
			return fmt.Sprintf("observations[%d].aggregation_method is unsupported", index)
		}
		if observation.AggregationMethod == "percentile" && (observation.AggregationPercentile == nil || *observation.AggregationPercentile < 0 || *observation.AggregationPercentile > 100) {
			return fmt.Sprintf("observations[%d].aggregation_percentile is required for percentile aggregation", index)
		}
		if observation.SampleCount < 0 {
			return fmt.Sprintf("observations[%d].sample_count cannot be negative", index)
		}
	}
	return ""
}

func finiteCoordinate(lon, lat float64) bool {
	return !math.IsNaN(lon) && !math.IsInf(lon, 0) && !math.IsNaN(lat) && !math.IsInf(lat, 0) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
}

func canonicalRFObservationCoordinate(observation CanonicalRFValidationObservation) (Point, bool) {
	if observation.Lon == nil || observation.Lat == nil || !finiteCoordinate(*observation.Lon, *observation.Lat) {
		return Point{}, false
	}
	return Point{Lon: *observation.Lon, Lat: *observation.Lat}, true
}

func canonicalRFFrequencyEqual(left, right float64) bool {
	return math.Abs(left-right) <= CanonicalRFValidationFrequencyTolGHz
}

func canonicalRFDistanceBin(distance float64) string {
	switch {
	case distance < 10:
		return "0-10m"
	case distance < 50:
		return "10-50m"
	case distance < 100:
		return "50-100m"
	case distance < 200:
		return "100-200m"
	case distance < 400:
		return "200-400m"
	default:
		return "400m+"
	}
}

func canonicalRFFrequencyPointer(value float64) *float64 { return &value }

func canonicalRFHeightAssumption(observation CanonicalRFValidationObservation) (string, []string) {
	source := strings.ToLower(strings.TrimSpace(observation.RxHeightSource))
	switch source {
	case CanonicalRFHeightMeasured, CanonicalRFHeightConfigured:
		return "complete_for_absolute_validation", nil
	case CanonicalRFHeightAssumed:
		return "usable_with_assumptions", []string{"receiver height is assumed by the source and is retained as provenance; no 1.5 m default was inferred"}
	default:
		return "insufficient_metadata", []string{"receiver height provenance is missing; absolute validation is not complete"}
	}
}

func canonicalRFValueForQuantity(quantity string, propagation PropagationResult, radio *InterferenceProperties) (*float64, string) {
	var value float64
	switch quantity {
	case CanonicalRFQuantityReceivedPowerDBm:
		value = propagation.ReceivedPowerDBm
	case CanonicalRFQuantityPathLossDB:
		value = propagation.TotalPathLossDB
	case CanonicalRFQuantityRSRPDBm:
		if radio == nil || radio.RSRPDBm == nil {
			return nil, "rsrp_conversion_unavailable"
		}
		value = *radio.RSRPDBm
	case CanonicalRFQuantitySINRDB:
		if radio == nil || radio.SINRDB == nil {
			return nil, "sinr_unavailable"
		}
		value = *radio.SINRDB
	case CanonicalRFQuantityRSRQDB:
		if radio == nil || radio.RSRQDB == nil {
			return nil, "rsrq_unavailable"
		}
		value = *radio.RSRQDB
	case CanonicalRFQuantityRSSIDBm:
		if radio == nil || radio.RSSIDBm == nil {
			return nil, "rssi_unavailable"
		}
		value = *radio.RSSIDBm
	default:
		return nil, "quantity_incompatible"
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return nil, "prediction_not_finite"
	}
	return floatPointer(value), ""
}

func canonicalRFPropagationFingerprint(profile CellRFProfile, result PropagationResult) string {
	identity := struct {
		Profile                CellRFProfile      `json:"profile"`
		AppliedModel           string             `json:"applied_model"`
		ModelID                string             `json:"model_id"`
		LOSState               string             `json:"los_nlos"`
		Endpoint               string             `json:"endpoint_case"`
		DistanceM              float64            `json:"distance_m"`
		ReceiverHeightM        float64            `json:"receiver_height_m"`
		ReceiverSensitivityDBm float64            `json:"receiver_sensitivity_dbm"`
		RFContract             RFContractMetadata `json:"rf_contract"`
	}{
		Profile: profile.normalized(), AppliedModel: result.AppliedModelID, ModelID: result.ModelID,
		LOSState: string(result.LOSState), Endpoint: string(result.EndpointCase), DistanceM: result.DistanceM,
		ReceiverHeightM: profile.ReceiverHeightM, ReceiverSensitivityDBm: result.ReceiverThreshold.SensitivityDBm,
		RFContract: RFContractMetadataForModel(profile.PropagationModelID, 0),
	}
	encoded, _ := json.Marshal(identity)
	digest := sha256.Sum256(encoded)
	return "canonical-rf-" + hex.EncodeToString(digest[:12])
}

func canonicalRFDatasetIdentity(dataset CanonicalRFValidationDataset) CanonicalRFValidationDatasetIdentity {
	return CanonicalRFValidationDatasetIdentity{DatasetID: dataset.DatasetID, DatasetVersion: dataset.DatasetVersion, SourceType: dataset.SourceType, SourceCitation: dataset.SourceCitation, License: dataset.License, MetadataURL: dataset.MetadataURL}
}

func canonicalRFSortedObservations(dataset CanonicalRFValidationDataset) []CanonicalRFValidationObservation {
	observations := append([]CanonicalRFValidationObservation(nil), dataset.Observations...)
	sort.SliceStable(observations, func(i, j int) bool { return observations[i].ObservationID < observations[j].ObservationID })
	return observations
}

func CanonicalRFObservationChecksum(dataset CanonicalRFValidationDataset) string {
	observations := canonicalRFSortedObservations(dataset)
	encoded, err := json.Marshal(observations)
	if err != nil {
		return "sha256-unknown"
	}
	digest := sha256.Sum256(encoded)
	return "sha256-" + hex.EncodeToString(digest[:])
}

func canonicalRFScenarioFingerprint(dataset CanonicalRFValidationDataset) string {
	type cellIdentity struct {
		CellID     string        `json:"cell_id"`
		Lat        float64       `json:"lat"`
		Lon        float64       `json:"lon"`
		AzimuthDeg float64       `json:"azimuth_deg"`
		Profile    CellRFProfile `json:"rf_profile"`
	}
	cells := make([]cellIdentity, 0, len(dataset.Transmitters))
	for _, transmitter := range dataset.Transmitters {
		cells = append(cells, cellIdentity{CellID: transmitter.CellID, Lat: transmitter.Lat, Lon: transmitter.Lon, AzimuthDeg: transmitter.AzimuthDeg, Profile: transmitter.RFProfile.normalized()})
	}
	sort.SliceStable(cells, func(i, j int) bool { return cells[i].CellID < cells[j].CellID })
	identity := struct {
		Evaluator                string         `json:"evaluator"`
		Cells                    []cellIdentity `json:"cells"`
		RFContractVersions       []string       `json:"rf_contract_versions"`
		ReceiverSensitivityScope string         `json:"receiver_sensitivity_scope"`
		RadioQualityContract     string         `json:"radio_quality_contract"`
		OptimizerIndependent     bool           `json:"optimizer_independent"`
	}{CanonicalRFValidationEvaluatorVersion, cells, []string{CanonicalRFModelID, UrbanShortRangePropagationID}, "per_cell_threshold_not_a_validation_target", RadioQualityContractVersion, true}
	return fingerprintJSON("canonical-rf-scenario", identity)
}

func CanonicalRFValidationFingerprint(dataset CanonicalRFValidationDataset, options CanonicalRFValidationOptions) string {
	identity := struct {
		DatasetID             string                        `json:"dataset_id"`
		DatasetVersion        string                        `json:"dataset_version"`
		ObservationChecksum   string                        `json:"observation_checksum"`
		AdapterVersion        string                        `json:"adapter_version"`
		EvaluatorVersion      string                        `json:"evaluator_version"`
		RFScenarioFingerprint string                        `json:"rf_scenario_fingerprint"`
		MatchingPolicy        string                        `json:"matching_policy"`
		ApplicabilityPolicy   string                        `json:"applicability_policy"`
		ResidualPolicy        string                        `json:"residual_policy"`
		CensoringPolicy       string                        `json:"censoring_policy"`
		SpatialPolicy         CanonicalRFValidationStrategy `json:"spatial_policy"`
		CalibrationPolicy     string                        `json:"calibration_policy"`
	}{
		DatasetID: dataset.DatasetID, DatasetVersion: dataset.DatasetVersion,
		ObservationChecksum: CanonicalRFObservationChecksum(dataset), AdapterVersion: CanonicalRFValidationAdapterVersion,
		EvaluatorVersion: CanonicalRFValidationEvaluatorVersion, RFScenarioFingerprint: canonicalRFScenarioFingerprint(dataset),
		MatchingPolicy:      "explicit_id_then_mapping_then_pci_channel_frequency_then_opt_in_geographic_candidate; never strongest_cell",
		ApplicabilityPolicy: "2.6_or_28GHz_UMa_10m_to_5000m_outdoor_outdoor_explicit_height_and_los",
		ResidualPolicy:      "measured_minus_predicted_positive_means_model_underpredicts",
		CensoringPolicy:     "explicit_left_right_or_below_detection_records_excluded_from_residual_metrics",
		SpatialPolicy:       options.Strategy,
		CalibrationPolicy:   "uncalibrated_baseline_plus_frequency_specific_constant_bias_holdout; no_los_calibration; never_promoted",
	}
	return fingerprintJSON("canonical-rf-validation", identity)
}

type canonicalRFMatch struct {
	Transmitter *CanonicalRFValidationTransmitter
	Method      string
	Status      string
	Reason      string
}

func canonicalRFResolveTransmitter(observation CanonicalRFValidationObservation, transmitters []CanonicalRFValidationTransmitter, options CanonicalRFValidationOptions) canonicalRFMatch {
	candidates := append([]CanonicalRFValidationTransmitter(nil), transmitters...)
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].CellID < candidates[j].CellID })
	explicitID := strings.TrimSpace(observation.TransmitterID)
	if explicitID == "" {
		explicitID = strings.TrimSpace(observation.ServingCellID)
	}
	if explicitID != "" {
		for index := range candidates {
			if candidates[index].CellID == explicitID || candidates[index].MappingID == explicitID {
				return canonicalRFMatch{Transmitter: &candidates[index], Method: "explicit_id_or_mapping", Status: "matched"}
			}
		}
		return canonicalRFMatch{Status: CanonicalRFStatusUnresolvedTransmitter, Reason: "serving_cell_or_mapping_not_found"}
	}
	if observation.ServingPCI != nil {
		filtered := candidates[:0]
		for _, candidate := range candidates {
			if candidate.RFProfile.PCI != nil && *candidate.RFProfile.PCI == *observation.ServingPCI {
				filtered = append(filtered, candidate)
			}
		}
		candidates = filtered
	}
	if observation.ChannelID != "" {
		filtered := candidates[:0]
		for _, candidate := range candidates {
			if candidate.RFProfile.ChannelID == observation.ChannelID {
				filtered = append(filtered, candidate)
			}
		}
		candidates = filtered
	}
	if observation.FrequencyGHz != nil {
		filtered := candidates[:0]
		for _, candidate := range candidates {
			if canonicalRFFrequencyEqual(candidate.RFProfile.FrequencyGHz, *observation.FrequencyGHz) {
				filtered = append(filtered, candidate)
			}
		}
		candidates = filtered
	}
	if len(candidates) == 1 {
		return canonicalRFMatch{Transmitter: &candidates[0], Method: "pci_channel_frequency", Status: "matched"}
	}
	if !options.AllowGeographicCandidateMatch {
		if len(candidates) == 0 {
			return canonicalRFMatch{Status: CanonicalRFStatusUnresolvedTransmitter, Reason: "no_deterministic_identity_candidate"}
		}
		return canonicalRFMatch{Status: CanonicalRFStatusUnresolvedTransmitter, Reason: "multiple_deterministic_candidates"}
	}
	point, hasPoint := canonicalRFObservationCoordinate(observation)
	if !hasPoint || len(candidates) == 0 {
		return canonicalRFMatch{Status: CanonicalRFStatusUnresolvedTransmitter, Reason: "geographic_candidate_requires_observation_coordinate_and_candidates"}
	}
	radius := options.GeographicCandidateRadiusM
	if radius <= 0 {
		radius = 250
	}
	type candidateDistance struct {
		index    int
		distance float64
	}
	nearby := make([]candidateDistance, 0, len(candidates))
	for index, candidate := range candidates {
		distance := ApproxDistanceMeters(Point{Lon: candidate.Lon, Lat: candidate.Lat}, point)
		if distance <= radius {
			nearby = append(nearby, candidateDistance{index: index, distance: distance})
		}
	}
	if len(nearby) == 0 {
		return canonicalRFMatch{Status: CanonicalRFStatusUnresolvedTransmitter, Reason: "no_geographic_candidate_within_radius"}
	}
	sort.SliceStable(nearby, func(i, j int) bool {
		if math.Abs(nearby[i].distance-nearby[j].distance) < 1e-9 {
			return candidates[nearby[i].index].CellID < candidates[nearby[j].index].CellID
		}
		return nearby[i].distance < nearby[j].distance
	})
	if len(nearby) > 1 && math.Abs(nearby[0].distance-nearby[1].distance) < 1e-6 {
		return canonicalRFMatch{Status: CanonicalRFStatusUnresolvedTransmitter, Reason: "geographic_candidate_tie"}
	}
	selected := candidates[nearby[0].index]
	return canonicalRFMatch{Transmitter: &selected, Method: "opt_in_geographic_candidate", Status: "matched"}
}

func canonicalRFObservationDistance(observation CanonicalRFValidationObservation, transmitter CanonicalRFValidationTransmitter) (float64, string) {
	if point, ok := canonicalRFObservationCoordinate(observation); ok {
		distance := ApproxDistanceMeters(Point{Lon: transmitter.Lon, Lat: transmitter.Lat}, point)
		if observation.DistanceM != nil && math.Abs(*observation.DistanceM-distance) > 5 {
			return distance, "geometry_distance_mismatch"
		}
		return distance, ""
	}
	if observation.DistanceM != nil && canonicalRFFinitePointer(observation.DistanceM) {
		return *observation.DistanceM, ""
	}
	return 0, "distance_missing"
}

func canonicalRFHeightAndScope(observation CanonicalRFValidationObservation, profile CellRFProfile, distance float64) (string, []string, string) {
	if observation.RxHeightM == nil || !canonicalRFFinitePointer(observation.RxHeightM) {
		return CanonicalRFStatusInsufficientMetadata, []string{"rx_height_m is required; no silent 1.5 m receiver height is allowed"}, "receiver_height_missing"
	}
	if *observation.RxHeightM < 1.5 || *observation.RxHeightM >= 13 {
		return CanonicalRFStatusInapplicable, []string{"receiver height is outside the canonical UMa envelope 1.5 m <= hUT < 13 m"}, "receiver_height_out_of_range"
	}
	if profile.AntennaHeightM < 10 || profile.AntennaHeightM > 150 {
		return CanonicalRFStatusInapplicable, []string{"transmitter height is outside the canonical UMa envelope 10 m <= hBS <= 150 m"}, "transmitter_height_out_of_range"
	}
	if distance < 10 || distance > 5000 {
		return CanonicalRFStatusInapplicable, []string{"distance is outside the canonical UMa envelope 10 m <= d2D <= 5000 m"}, "distance_out_of_range"
	}
	if profile.PropagationModelID != UrbanShortRangePropagationID {
		return CanonicalRFStatusInapplicable, []string{"canonical 2.6/28 GHz validation is scoped to the production urban_short_range UMa profile"}, "propagation_model_out_of_scope"
	}
	evidenceStatus, assumptions := canonicalRFHeightAssumption(observation)
	if evidenceStatus == "insufficient_metadata" {
		return CanonicalRFStatusInsufficientMetadata, assumptions, "receiver_height_provenance_missing"
	}
	return CanonicalRFStatusApplicable, assumptions, ""
}

func canonicalRFAbsoluteEvidenceStatus(observation CanonicalRFValidationObservation, quantity string, base string) string {
	if base == "insufficient_metadata" {
		return base
	}
	if quantity == CanonicalRFQuantityPathLossDB {
		return "propagation_only"
	}
	missing := make([]string, 0, 3)
	if strings.TrimSpace(observation.DeviceID) == "" && strings.TrimSpace(observation.DeviceModel) == "" {
		missing = append(missing, "device")
	}
	if strings.TrimSpace(observation.AntennaID) == "" && strings.TrimSpace(observation.AntennaModel) == "" {
		missing = append(missing, "antenna")
	}
	if strings.TrimSpace(observation.CalibrationID) == "" && strings.TrimSpace(observation.CalibrationState) == "" {
		missing = append(missing, "calibration")
	}
	if len(missing) > 0 {
		return "usable_with_assumptions"
	}
	return base
}

func canonicalRFNeedInterference(quantity string) bool {
	return quantity == CanonicalRFQuantitySINRDB || quantity == CanonicalRFQuantityRSRQDB || quantity == CanonicalRFQuantityRSSIDBm
}

func canonicalRFInterferenceRequest(dataset CanonicalRFValidationDataset, matched CanonicalRFValidationTransmitter, observation CanonicalRFValidationObservation, profile CellRFProfile) (InterferenceRequest, error) {
	if observation.BandwidthMHz == nil || *observation.BandwidthMHz <= 0 || strings.TrimSpace(observation.ChannelID) == "" {
		return InterferenceRequest{}, fmt.Errorf("bandwidth and channel metadata are required for radio-quality quantities")
	}
	if observation.InterferenceContextComplete == nil || !*observation.InterferenceContextComplete {
		return InterferenceRequest{}, fmt.Errorf("interference_validation_limited: serving/resource/neighbor context is not declared complete")
	}
	profile = profile.normalized()
	profile.BandwidthMHz = *observation.BandwidthMHz
	profile.ChannelID = observation.ChannelID
	towers := make([]InterferenceTowerRequest, 0, len(dataset.Transmitters))
	for _, transmitter := range dataset.Transmitters {
		cellProfile := transmitter.RFProfile.normalized()
		if cellProfile.BandwidthMHz <= 0 {
			return InterferenceRequest{}, fmt.Errorf("interference_validation_limited: transmitter %q bandwidth metadata is missing", transmitter.CellID)
		}
		towers = append(towers, InterferenceTowerRequest{ID: transmitter.CellID, TowerLon: transmitter.Lon, TowerLat: transmitter.Lat, AzimuthDeg: transmitter.AzimuthDeg, RFProfile: cellProfile})
	}
	request := InterferenceRequest{
		NetworkTech: profile.NetworkTech, Towers: towers, ServingCellID: matched.CellID,
		RadiusMeters: profile.RadiusMeters, FrequencyGHz: profile.FrequencyGHz,
		TxPowerDBm: profile.TxPowerDBm, BeamWidthDeg: profile.BeamWidthDeg,
		BandwidthMHz: profile.BandwidthMHz, LoadFactor: profile.LoadFactor,
		ReuseFactor: profile.ReuseFactor, NoiseFigureDB: profile.ReceiverNoiseFigureDB,
		RFProfile: profile,
	}
	NormalizeInterferenceRequest(&request)
	return request, nil
}

func canonicalRFResultForExcluded(observation CanonicalRFValidationObservation, status, reason string) CanonicalRFValidationObservationResult {
	result := CanonicalRFValidationObservationResult{
		ObservationID: observation.ObservationID, CampaignID: observation.CampaignID, SiteID: observation.SiteID, SessionID: observation.SessionID,
		Quantity: strings.ToLower(strings.TrimSpace(observation.Quantity)), Status: status, ExclusionReason: reason,
		CensoringStatus: observation.CensoringStatus,
	}
	if observation.Lat != nil {
		result.Lat = observation.Lat
	}
	if observation.Lon != nil {
		result.Lon = observation.Lon
	}
	if observation.FrequencyGHz != nil {
		result.FrequencyGHz = *observation.FrequencyGHz
	}
	if observation.LOSState != "" {
		result.LOSState = strings.ToLower(strings.TrimSpace(observation.LOSState))
	}
	if observation.DistanceM != nil {
		result.DistanceM = *observation.DistanceM
		result.DistanceBin = canonicalRFDistanceBin(*observation.DistanceM)
	}
	return result
}

func canonicalRFEvaluateObservation(ctx context.Context, dataset CanonicalRFValidationDataset, observation CanonicalRFValidationObservation, options CanonicalRFValidationOptions) CanonicalRFValidationObservationResult {
	result := canonicalRFResultForExcluded(observation, CanonicalRFStatusInsufficientMetadata, "not_evaluated")
	quantity := strings.ToLower(strings.TrimSpace(observation.Quantity))
	result.Quantity = quantity
	if observation.ValueDB != nil {
		value := *observation.ValueDB
		result.MeasuredValueDB = &value
	}
	if observation.CensoringStatus != "" && observation.CensoringStatus != CanonicalRFCensorUncensored {
		result.Status = CanonicalRFStatusCensored
		result.ExclusionReason = "explicit_censoring_not_exact_observation"
		result.CensoringStatus = observation.CensoringStatus
		return result
	}
	if observation.ValueDB == nil {
		result.Status = CanonicalRFStatusInsufficientMetadata
		result.ExclusionReason = "value_missing_without_censoring"
		return result
	}
	if observation.FrequencyGHz == nil {
		result.Status = CanonicalRFStatusInsufficientMetadata
		result.ExclusionReason = "frequency_missing"
		return result
	}
	match := canonicalRFResolveTransmitter(observation, dataset.Transmitters, options)
	result.MatchingMethod, result.MatchingStatus, result.ExclusionReason = match.Method, match.Status, match.Reason
	if match.Transmitter == nil {
		result.Status = CanonicalRFStatusUnresolvedTransmitter
		if result.ExclusionReason == "" {
			result.ExclusionReason = "transmitter_unresolved"
		}
		return result
	}
	result.TransmitterID = match.Transmitter.CellID
	profile := match.Transmitter.RFProfile.normalized()
	if !canonicalRFFrequencyEqual(profile.FrequencyGHz, *observation.FrequencyGHz) {
		result.Status = CanonicalRFStatusDeterministicMismatch
		result.ExclusionReason = "frequency_mismatch"
		return result
	}
	if strings.TrimSpace(observation.Technology) != "" && strings.ToLower(strings.TrimSpace(observation.Technology)) != profile.NetworkTech {
		result.Status = CanonicalRFStatusDeterministicMismatch
		result.ExclusionReason = "technology_mismatch"
		return result
	}
	if observation.ChannelID != "" && observation.ChannelID != profile.ChannelID {
		result.Status = CanonicalRFStatusDeterministicMismatch
		result.ExclusionReason = "channel_mismatch"
		return result
	}
	if observation.ServingPCI != nil && (profile.PCI == nil || *profile.PCI != *observation.ServingPCI) {
		result.Status = CanonicalRFStatusDeterministicMismatch
		result.ExclusionReason = "pci_mismatch"
		return result
	}
	if quantity == CanonicalRFQuantityRSRPDBm || canonicalRFNeedInterference(quantity) {
		if observation.BandwidthMHz == nil || !canonicalRFFinitePointer(observation.BandwidthMHz) || *observation.BandwidthMHz <= 0 {
			result.Status = CanonicalRFStatusInsufficientMetadata
			result.ExclusionReason = "bandwidth_missing"
			return result
		}
		if math.Abs(*observation.BandwidthMHz-profile.BandwidthMHz) > 1e-9 {
			result.Status = CanonicalRFStatusDeterministicMismatch
			result.ExclusionReason = "bandwidth_mismatch"
			return result
		}
		if strings.TrimSpace(observation.ChannelID) == "" {
			result.Status = CanonicalRFStatusInsufficientMetadata
			result.ExclusionReason = "channel_missing"
			return result
		}
	}
	distance, distanceReason := canonicalRFObservationDistance(observation, *match.Transmitter)
	result.DistanceM = distance
	result.DistanceBin = canonicalRFDistanceBin(distance)
	if distanceReason != "" {
		result.Status = CanonicalRFStatusDeterministicMismatch
		result.ExclusionReason = distanceReason
		return result
	}
	result.FrequencyGHz = profile.FrequencyGHz
	result.LOSState = strings.ToLower(strings.TrimSpace(observation.LOSState))
	baseStatus, assumptions, scopeReason := canonicalRFHeightAndScope(observation, profile, distance)
	result.Assumptions = append(result.Assumptions, assumptions...)
	if baseStatus != CanonicalRFStatusApplicable {
		result.Status, result.ExclusionReason = baseStatus, scopeReason
		return result
	}
	if observation.Outdoor == nil {
		result.Status = CanonicalRFStatusInsufficientMetadata
		result.ExclusionReason = "outdoor_endpoint_status_missing"
		return result
	}
	if !*observation.Outdoor {
		result.Status = CanonicalRFStatusInapplicable
		result.ExclusionReason = "indoor_endpoint_outside_uma_scope"
		return result
	}
	if result.LOSState != string(PropagationLOS) && result.LOSState != string(PropagationNLOS) {
		result.Status = CanonicalRFStatusInsufficientMetadata
		result.ExclusionReason = "los_nlos_missing_or_unknown"
		return result
	}
	profile.ReceiverHeightM = *observation.RxHeightM
	profile.PropagationModelID = UrbanShortRangePropagationID
	var losState PropagationLOSState = PropagationLOSState(result.LOSState)
	var endpointCase PropagationEndpointCase = PropagationEndpointOutdoorO2O
	buildingDataAvailable := true
	wallCount := 0
	var classification *LOSClassification
	if options.BuildingsAvailable {
		if point, ok := canonicalRFObservationCoordinate(observation); ok {
			pathGeometry, geometryErr := buildPropagationPathGeometryContextWithOptions(ctx, Point{Lon: match.Transmitter.Lon, Lat: match.Transmitter.Lat}, point, options.Buildings, propagationPathGeometryOptions{TxHeightM: profile.AntennaHeightM, RxHeightM: profile.ReceiverHeightM})
			if geometryErr == nil && pathGeometry.available {
				losState, endpointCase, wallCount, classification = classifyPropagationPath(profile, pathGeometry, point, distance)
				if string(losState) != result.LOSState {
					result.Status = CanonicalRFStatusDeterministicMismatch
					result.ExclusionReason = "los_nlos_mismatch_with_canonical_geometry"
					return result
				}
			}
		}
	}
	propagation := EvaluatePropagationLink(PropagationLinkContext{
		Profile: profile, GroundDistanceM: distance, HorizontalOffsetDeg: 0,
		CalibrationOffsetDB: 0, LOSState: losState, EndpointCase: endpointCase,
		LOSClassification: classification, BuildingDataAvailable: buildingDataAvailable, WallEventCount: wallCount,
	})
	if !propagation.Applicable || propagation.FallbackUsed {
		result.Status = CanonicalRFStatusInapplicable
		result.ExclusionReason = propagation.ApplicabilityReason
		return result
	}
	var radio *InterferenceProperties
	interferenceStatus := "not_applicable_to_quantity"
	if canonicalRFNeedInterference(quantity) {
		request, requestErr := canonicalRFInterferenceRequest(dataset, *match.Transmitter, observation, profile)
		if requestErr != nil {
			result.Status = CanonicalRFStatusInsufficientMetadata
			result.ExclusionReason = requestErr.Error()
			result.InterferenceValidation = "interference_validation_limited"
			return result
		}
		point, hasPoint := canonicalRFObservationCoordinate(observation)
		if !hasPoint {
			result.Status = CanonicalRFStatusInsufficientMetadata
			result.ExclusionReason = "interference_validation_limited: coordinates_required_for_neighbor_evaluation"
			result.InterferenceValidation = "interference_validation_limited"
			return result
		}
		preset, presetErr := interferencePresetFor(profile.NetworkTech, profile.BandwidthMHz)
		if presetErr != nil {
			result.Status = CanonicalRFStatusQuantityIncompatible
			result.ExclusionReason = "resource_semantics_incompatible"
			return result
		}
		properties, propertiesErr := evaluateInterferencePointContext(ctx, request, preset, options.Buildings, point)
		if propertiesErr != nil || properties.ServingCellID != match.Transmitter.CellID {
			result.Status = CanonicalRFStatusInsufficientMetadata
			result.ExclusionReason = "interference_validation_limited: serving-cell radio-quality primitive unavailable"
			result.InterferenceValidation = "interference_validation_limited"
			return result
		}
		radio = &properties
		interferenceStatus = "full_serving_and_resource_context"
	}
	if quantity == CanonicalRFQuantityRSRPDBm {
		preset, presetErr := interferencePresetFor(profile.NetworkTech, profile.BandwidthMHz)
		if presetErr != nil {
			result.Status = CanonicalRFStatusQuantityIncompatible
			result.ExclusionReason = "resource_semantics_incompatible"
			return result
		}
		rsrp, ok := carrierPowerToReferencePower(propagation.ReceivedPowerDBm, preset)
		if !ok {
			result.Status = CanonicalRFStatusQuantityIncompatible
			result.ExclusionReason = "rsrp_conversion_unavailable"
			return result
		}
		rsrpValue := rsrp
		predicted := &rsrpValue
		result.PredictedValueDB = predicted
	}
	predicted, predictionReason := canonicalRFValueForQuantity(quantity, propagation, radio)
	if quantity == CanonicalRFQuantityRSRPDBm && result.PredictedValueDB != nil {
		predicted = result.PredictedValueDB
	}
	if predicted == nil {
		result.Status = CanonicalRFStatusQuantityIncompatible
		result.ExclusionReason = predictionReason
		return result
	}
	result.PredictedValueDB = predicted
	residual := *result.MeasuredValueDB - *predicted
	result.ResidualDB = &residual
	abs := math.Abs(residual)
	result.AbsoluteErrorDB = &abs
	result.Status = CanonicalRFStatusApplicable
	result.InterferenceValidation = interferenceStatus
	result.EvidenceStatus = canonicalRFAbsoluteEvidenceStatus(observation, quantity, func() string { status, _ := canonicalRFHeightAssumption(observation); return status }())
	if result.EvidenceStatus == "usable_with_assumptions" {
		result.Assumptions = append(result.Assumptions, "device, antenna, or calibration identity is incomplete; values are retained without compensation")
	}
	evidence := &CanonicalRFEvidence{
		Primitive: "EvaluatePropagationLink plus shared radio-quality primitive when requested",
		ModelID:   propagation.ModelID, AppliedModelID: propagation.AppliedModelID, FrequencyGHz: profile.FrequencyGHz,
		DistanceM: propagation.DistanceM, LOSState: string(propagation.LOSState), EndpointCase: string(propagation.EndpointCase),
		Applicability:          PropagationApplicability{Applicable: propagation.Applicable, Reason: propagation.ApplicabilityReason, Detail: propagation.ApplicabilityDetail},
		PropagationFingerprint: canonicalRFPropagationFingerprint(profile, propagation),
		RFContract:             RFContractMetadataForModel(profile.PropagationModelID, 0),
		ReceiverThreshold:      &propagation.ReceiverThreshold, ResourceSemantics: observation.ResourceSemantics,
		InterferenceValidation: interferenceStatus,
	}
	received := propagation.ReceivedPowerDBm
	pathLoss := propagation.TotalPathLossDB
	evidence.ReceivedPowerDBm, evidence.PathLossDB = &received, &pathLoss
	if radio != nil {
		evidence.RSRPDBm, evidence.SINRDB, evidence.RSRQDB, evidence.RSSIDBm = radio.RSRPDBm, radio.SINRDB, radio.RSRQDB, radio.RSSIDBm
		evidence.RSRPConversionID = radio.RSRPConversionID
	}
	if quantity == CanonicalRFQuantityRSRPDBm {
		evidence.RSRPDBm = predicted
		evidence.RSRPConversionID = RadioQualityRSRPConversionID
	}
	result.Evidence = evidence
	return result
}

func canonicalRFPointerFloat(value float64) *float64 { return &value }

func canonicalRFQuantile(sortedValues []float64, probability float64) float64 {
	if len(sortedValues) == 0 {
		return math.NaN()
	}
	if probability <= 0 {
		return sortedValues[0]
	}
	if probability >= 1 {
		return sortedValues[len(sortedValues)-1]
	}
	position := probability * float64(len(sortedValues)-1)
	lower := int(math.Floor(position))
	upper := int(math.Ceil(position))
	if lower == upper {
		return sortedValues[lower]
	}
	weight := position - float64(lower)
	return sortedValues[lower]*(1-weight) + sortedValues[upper]*weight
}

func canonicalRFMetric(residuals []float64, correction float64) CanonicalRFMetric {
	if len(residuals) == 0 {
		return CanonicalRFMetric{}
	}
	values := make([]float64, len(residuals))
	absValues := make([]float64, len(residuals))
	total, absTotal, squareTotal := 0.0, 0.0, 0.0
	for index, value := range residuals {
		corrected := value - correction
		values[index] = corrected
		absValue := math.Abs(corrected)
		absValues[index] = absValue
		total += corrected
		absTotal += absValue
		squareTotal += corrected * corrected
	}
	sort.Float64s(values)
	sort.Float64s(absValues)
	mean := total / float64(len(values))
	variance := 0.0
	for _, value := range values {
		delta := value - mean
		variance += delta * delta
	}
	variance /= float64(len(values))
	return CanonicalRFMetric{
		Count: len(values), MeanBiasDB: canonicalRFPointerFloat(mean), MedianBiasDB: canonicalRFPointerFloat(canonicalRFQuantile(values, .5)),
		MAEDB: canonicalRFPointerFloat(absTotal / float64(len(values))), RMSEDB: canonicalRFPointerFloat(math.Sqrt(squareTotal / float64(len(values)))),
		StdDB: canonicalRFPointerFloat(math.Sqrt(variance)), P50AbsErrorDB: canonicalRFPointerFloat(canonicalRFQuantile(absValues, .5)),
		P90AbsErrorDB: canonicalRFPointerFloat(canonicalRFQuantile(absValues, .9)), P95AbsErrorDB: canonicalRFPointerFloat(canonicalRFQuantile(absValues, .95)),
		MinResidualDB: canonicalRFPointerFloat(values[0]), P01ResidualDB: canonicalRFPointerFloat(canonicalRFQuantile(values, .01)),
		P10ResidualDB: canonicalRFPointerFloat(canonicalRFQuantile(values, .1)), P90ResidualDB: canonicalRFPointerFloat(canonicalRFQuantile(values, .9)),
		P99ResidualDB: canonicalRFPointerFloat(canonicalRFQuantile(values, .99)), MaxResidualDB: canonicalRFPointerFloat(values[len(values)-1]),
		SmallGroup: len(values) < CanonicalRFValidationMinimumGroupN,
	}
}

// AggregateCanonicalRFValues implements the only accepted temporal reduction
// operations for a source adapter. The returned value is deterministic and
// the evaluator never selects a statistic based on residual size.
func AggregateCanonicalRFValues(values []float64, method string, percentile float64) (float64, error) {
	if len(values) == 0 {
		return 0, fmt.Errorf("cannot aggregate an empty value set")
	}
	ordered := append([]float64(nil), values...)
	for _, value := range ordered {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return 0, fmt.Errorf("aggregation values must be finite")
		}
	}
	sort.Float64s(ordered)
	switch strings.ToLower(strings.TrimSpace(method)) {
	case "raw":
		if len(ordered) != 1 {
			return 0, fmt.Errorf("raw aggregation requires exactly one sample")
		}
		return ordered[0], nil
	case "mean":
		total := 0.0
		for _, value := range ordered {
			total += value
		}
		return total / float64(len(ordered)), nil
	case "median":
		return canonicalRFQuantile(ordered, 0.5), nil
	case "percentile":
		if percentile < 0 || percentile > 100 || math.IsNaN(percentile) || math.IsInf(percentile, 0) {
			return 0, fmt.Errorf("percentile must be between 0 and 100")
		}
		return canonicalRFQuantile(ordered, percentile/100), nil
	default:
		return 0, fmt.Errorf("unsupported aggregation method %q", method)
	}
}

func canonicalRFApplicableResults(results []CanonicalRFValidationObservationResult) []CanonicalRFValidationObservationResult {
	applicable := make([]CanonicalRFValidationObservationResult, 0, len(results))
	for _, result := range results {
		if result.Status == CanonicalRFStatusApplicable && result.ResidualDB != nil {
			applicable = append(applicable, result)
		}
	}
	return applicable
}

func canonicalRFMetricRows(results []CanonicalRFValidationObservationResult, keyFunc func(CanonicalRFValidationObservationResult) string, decorate func(CanonicalRFValidationObservationResult, *CanonicalRFMetricRow)) []CanonicalRFMetricRow {
	groups := map[string][]float64{}
	rows := map[string]CanonicalRFMetricRow{}
	for _, result := range canonicalRFApplicableResults(results) {
		key := keyFunc(result)
		groups[key] = append(groups[key], *result.ResidualDB)
		row := rows[key]
		if row.Key == "" {
			row.Key, row.Quantity = key, result.Quantity
			decorate(result, &row)
		}
		rows[key] = row
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	output := make([]CanonicalRFMetricRow, 0, len(keys))
	for _, key := range keys {
		row := rows[key]
		row.Metric = canonicalRFMetric(groups[key], 0)
		output = append(output, row)
	}
	return output
}

func canonicalRFOverallRows(results []CanonicalRFValidationObservationResult) []CanonicalRFMetricRow {
	return canonicalRFMetricRows(results, func(result CanonicalRFValidationObservationResult) string { return result.Quantity }, func(result CanonicalRFValidationObservationResult, row *CanonicalRFMetricRow) {})
}

func canonicalRFSummary(results []CanonicalRFValidationObservationResult) CanonicalRFValidationSummary {
	applicable := canonicalRFApplicableResults(results)
	summary := CanonicalRFValidationSummary{Overall: canonicalRFOverallRows(applicable)}
	// Metric rows are grouped by quantity plus the requested stratum. The
	// quantity remains in every row so RSRP is never aggregated with RSSI.
	withQuantity := func(prefix string, result CanonicalRFValidationObservationResult) string {
		return result.Quantity + "|" + prefix
	}
	summary.ByFrequency = canonicalRFMetricRows(applicable, func(result CanonicalRFValidationObservationResult) string {
		return withQuantity(fmt.Sprintf("%.6gGHz", result.FrequencyGHz), result)
	}, func(result CanonicalRFValidationObservationResult, row *CanonicalRFMetricRow) {
		row.FrequencyGHz = canonicalRFFrequencyPointer(result.FrequencyGHz)
	})
	summary.ByLOS = canonicalRFMetricRows(applicable, func(result CanonicalRFValidationObservationResult) string {
		return withQuantity(result.LOSState, result)
	}, func(result CanonicalRFValidationObservationResult, row *CanonicalRFMetricRow) {
		row.LOSState = result.LOSState
	})
	summary.ByDistance = canonicalRFMetricRows(applicable, func(result CanonicalRFValidationObservationResult) string {
		return withQuantity(result.DistanceBin, result)
	}, func(result CanonicalRFValidationObservationResult, row *CanonicalRFMetricRow) {
		row.DistanceBin = result.DistanceBin
	})
	summary.BySite = canonicalRFMetricRows(applicable, func(result CanonicalRFValidationObservationResult) string { return withQuantity(result.SiteID, result) }, func(result CanonicalRFValidationObservationResult, row *CanonicalRFMetricRow) {
		row.SiteID = result.SiteID
	})
	summary.ByCampaign = canonicalRFMetricRows(applicable, func(result CanonicalRFValidationObservationResult) string {
		return withQuantity(result.CampaignID, result)
	}, func(result CanonicalRFValidationObservationResult, row *CanonicalRFMetricRow) {
		row.CampaignID = result.CampaignID
	})
	return summary
}

func canonicalRFCountResults(results []CanonicalRFValidationObservationResult) CanonicalRFValidationCounts {
	counts := CanonicalRFValidationCounts{Total: len(results), ExcludedReason: map[string]int{}}
	for _, result := range results {
		switch result.Status {
		case CanonicalRFStatusApplicable:
			counts.Applicable++
		case CanonicalRFStatusCensored:
			counts.Censored++
		case CanonicalRFStatusInapplicable:
			counts.Inapplicable++
		case CanonicalRFStatusInsufficientMetadata:
			counts.InsufficientMetadata++
		case CanonicalRFStatusQuantityIncompatible:
			counts.QuantityIncompatible++
		case CanonicalRFStatusUnresolvedTransmitter:
			counts.UnresolvedTransmitter++
		case CanonicalRFStatusDeterministicMismatch:
			counts.DeterministicMismatch++
		}
		if result.ExclusionReason != "" && result.Status != CanonicalRFStatusApplicable {
			counts.ExcludedReason[result.ExclusionReason]++
		}
	}
	return counts
}

func canonicalRFConfigurationClass(dataset CanonicalRFValidationDataset, results []CanonicalRFValidationObservationResult) string {
	if len(results) == 0 {
		return CanonicalRFReadinessNoMeasurementData
	}
	applicable := canonicalRFApplicableResults(results)
	if len(applicable) == 0 {
		return "insufficient"
	}
	for _, result := range applicable {
		if result.EvidenceStatus == "propagation_only" {
			return "propagation_only"
		}
		if result.EvidenceStatus == "usable_with_assumptions" {
			return "usable_with_assumptions"
		}
	}
	if dataset.SourceType == "synthetic_controlled" {
		return "complete_for_absolute_validation_synthetic"
	}
	return "complete_for_absolute_validation"
}

// EvaluateCanonicalRFValidation evaluates each observation independently,
// evaluates applicability before residuals, and always uses zero production
// calibration. The optional calibration result is a held-out diagnostic only.
func EvaluateCanonicalRFValidation(ctx context.Context, request CanonicalRFValidationRequest) (CanonicalRFValidationResponse, error) {
	if request.SchemaVersion == 0 {
		request.SchemaVersion = CanonicalRFValidationSchemaVersion
	}
	if request.SchemaVersion != CanonicalRFValidationSchemaVersion {
		return CanonicalRFValidationResponse{}, fmt.Errorf("schema_version must be %d", CanonicalRFValidationSchemaVersion)
	}
	if validationError := ValidateCanonicalRFValidationDataset(request.Dataset); validationError != "" {
		return CanonicalRFValidationResponse{}, fmt.Errorf("canonical validation dataset: %s", validationError)
	}
	if request.Options.Strategy.SpatialCellSizeM <= 0 {
		request.Options.Strategy.SpatialCellSizeM = CanonicalRFValidationDefaultCellM
	}
	if request.Options.Strategy.MinimumSeparationM < 0 {
		request.Options.Strategy.MinimumSeparationM = CanonicalRFValidationDefaultSeparationM
	}
	if request.Options.Strategy.Method == "" {
		request.Options.Strategy.Method = "spatial_blocks"
	}
	results := make([]CanonicalRFValidationObservationResult, 0, len(request.Dataset.Observations))
	for _, observation := range canonicalRFSortedObservations(request.Dataset) {
		if err := ctx.Err(); err != nil {
			return CanonicalRFValidationResponse{}, err
		}
		results = append(results, canonicalRFEvaluateObservation(ctx, request.Dataset, observation, request.Options))
	}
	counts := canonicalRFCountResults(results)
	response := CanonicalRFValidationResponse{
		SchemaVersion:   CanonicalRFValidationSchemaVersion,
		DatasetIdentity: canonicalRFDatasetIdentity(request.Dataset),
		Counts:          counts, Summary: canonicalRFSummary(results),
		Observations: results, ProductionCandidate: false, CalibrationActive: false,
		ConfigurationClass:    canonicalRFConfigurationClass(request.Dataset, results),
		RFScenarioFingerprint: canonicalRFScenarioFingerprint(request.Dataset), ObservationChecksum: CanonicalRFObservationChecksum(request.Dataset),
		Policy: map[string]string{
			"residual":     "measured - predicted; positive means canonical model underpredicts",
			"matching":     "explicit ID/mapping first; no strongest-cell inference",
			"frequency":    "2.6 GHz and 28 GHz remain separate",
			"los_nlos":     "LOS, NLOS, and unknown are not pooled",
			"censoring":    "explicit censored observations are counted and excluded from ordinary residual metrics",
			"calibration":  "frequency-specific constant bias is diagnostic-only and held out; no production promotion",
			"interference": "SINR/RSRQ require explicit serving, channel, bandwidth, and neighbor/resource context",
			"optimizer":    "validation is optimizer-independent and cannot change recommendations or scenario fingerprints",
		},
		Notes: []string{"This response consumes canonical RF primitives; it does not modify canonical equations, profiles, receiver thresholds, interference, or optimizer behavior."},
	}
	response.ValidationFingerprint = CanonicalRFValidationFingerprint(request.Dataset, request.Options)
	if len(request.Dataset.Observations) == 0 {
		response.Readiness = CanonicalRFReadinessNoMeasurementData
		response.Notes = append(response.Notes, "No measurement observations were supplied; no real-data validation result is claimed.")
		return response, nil
	}
	if counts.Applicable == 0 {
		response.Readiness = CanonicalRFReadinessInsufficientMetadata
		return response, nil
	}
	response.Holdout = CanonicalRFBuildHoldout(results, request.Options.Strategy)
	if request.Options.CalibrationRequested || response.Holdout != nil {
		response.Calibration = CanonicalRFCalibrate(results, *response.Holdout)
	}
	if counts.InsufficientMetadata > 0 || counts.UnresolvedTransmitter > 0 || counts.DeterministicMismatch > 0 {
		response.Readiness = CanonicalRFReadinessInsufficientMetadata
	} else if response.Calibration != nil && response.Calibration.Status == CanonicalRFReadinessCalibrationUnstable {
		response.Readiness = CanonicalRFReadinessCalibrationUnstable
	} else if request.Dataset.SourceType == "synthetic_controlled" {
		response.Readiness = CanonicalRFReadinessValidationOnly
	} else if response.Calibration != nil && response.Calibration.Status == CanonicalRFReadinessCalibrationCandidate {
		response.Readiness = CanonicalRFReadinessCalibrationCandidate
	} else {
		response.Readiness = CanonicalRFReadinessValidationOnly
	}
	return response, nil
}
