package raytracer

// Concept 6A.1 is the measurement-acquisition boundary around the canonical
// validation library. It imports one selected receive-side export format,
// preserves the raw bytes through an immutable checksum, and reports missing
// field semantics instead of repairing them with planning defaults.

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	Concept6A1SchemaVersion              = 1
	Concept6A1CollectorFormat            = "SIGNAL_COLLECTOR_TXT_V6"
	Concept6A1CollectorAdapterVersion    = "concept-6a1-signal-collector-v1"
	Concept6A1MaxRawBytes                = 128 << 20
	Concept6A1DefaultPointWindowSeconds  = 30
	Concept6A1DefaultPoorAccuracyLimitM  = 20
	Concept6A1SourceTypeSynthetic        = "synthetic_controlled"
	Concept6A1SourceTypeLocalField       = "local_field"
	Concept6A1MappingExact               = "exact_transmitter_mapping"
	Concept6A1MappingDeterministic       = "deterministic_identity_mapping"
	Concept6A1MappingGeographicCandidate = "geographic_candidate_only"
	Concept6A1MappingUnresolved          = "unresolved"
)

const (
	concept6A1StatusKnown      = "known"
	concept6A1StatusConfigured = "configured"
	concept6A1StatusInferred   = "inferred"
	concept6A1StatusUnknown    = "unknown"
)

// Concept6A1CampaignManifest records collection conditions and policies. It
// is deliberately separate from the canonical validation dataset: a manifest
// may describe a collection that is not yet ready for any RF quantity.
type Concept6A1CampaignManifest struct {
	SchemaVersion    int                         `json:"schema_version"`
	CampaignID       string                      `json:"campaign_id"`
	CampaignVersion  string                      `json:"campaign_version"`
	Title            string                      `json:"title"`
	CampaignDate     string                      `json:"campaign_date"`
	SourceType       string                      `json:"source_type"`
	CollectionMode   string                      `json:"collection_mode"`
	RawFormat        string                      `json:"raw_format"`
	SessionIDs       []string                    `json:"session_ids,omitempty"`
	RawPreservation  Concept6A1RawPreservation   `json:"raw_preservation"`
	Collector        Concept6A1CollectorSpec     `json:"collector"`
	Device           Concept6A1DeviceSpec        `json:"device"`
	Receiver         Concept6A1ReceiverSpec      `json:"receiver"`
	Coordinate       Concept6A1CoordinateSpec    `json:"coordinate"`
	Operator         Concept6A1OperatorContext   `json:"operator"`
	Measurement      Concept6A1MeasurementSpec   `json:"measurement"`
	Detection        Concept6A1DetectionSpec     `json:"detection"`
	PointAnnotations []Concept6A1PointAnnotation `json:"point_annotations,omitempty"`
	KnownLimitations []string                    `json:"known_limitations"`
	Privacy          Concept6A1PrivacyPolicy     `json:"privacy"`
}

type Concept6A1RawPreservation struct {
	KeepRaw            bool   `json:"keep_raw"`
	CanonicalSeparate  bool   `json:"canonical_output_separate"`
	HashAlgorithm      string `json:"hash_algorithm"`
	RawArtifactPattern string `json:"raw_artifact_pattern"`
	NoOverwrite        bool   `json:"no_overwrite"`
}

type Concept6A1CollectorSpec struct {
	Name                 string   `json:"name"`
	Version              string   `json:"version"`
	Platform             string   `json:"platform"`
	HardwareRequirements []string `json:"hardware_requirements"`
	RootRequired         bool     `json:"root_required"`
	ExportFormat         string   `json:"export_format"`
	Quantities           []string `json:"quantities"`
	ServingIdentity      []string `json:"serving_identity"`
	FrequencyMetadata    []string `json:"frequency_metadata"`
	GPSMetadata          []string `json:"gps_metadata"`
	Automation           string   `json:"automation"`
	Licensing            string   `json:"licensing"`
	Permissions          []string `json:"permissions"`
}

type Concept6A1DeviceSpec struct {
	PseudonymousID   string `json:"pseudonymous_id"`
	Manufacturer     string `json:"manufacturer"`
	Model            string `json:"model"`
	AndroidVersion   string `json:"android_version"`
	AntennaID        string `json:"antenna_id"`
	AntennaBasis     string `json:"antenna_basis"`
	CalibrationID    string `json:"calibration_id"`
	CalibrationState string `json:"calibration_state"`
}

type Concept6A1ReceiverSpec struct {
	HeightAGLM       *float64 `json:"height_agl_m"`
	HeightSource     string   `json:"height_source"`
	AntennaID        string   `json:"antenna_id"`
	AntennaBasis     string   `json:"antenna_basis"`
	CalibrationID    string   `json:"calibration_id"`
	CalibrationState string   `json:"calibration_state"`
}

type Concept6A1CoordinateSpec struct {
	Provider           string   `json:"provider"`
	CRS                string   `json:"crs"`
	MaxAccuracyM       *float64 `json:"max_accuracy_m"`
	Timezone           string   `json:"timezone"`
	NormalizeToUTC     bool     `json:"normalize_to_utc"`
	PoorPositionAction string   `json:"poor_position_action"`
}

type Concept6A1OperatorContext struct {
	OperatorName   string `json:"operator_name"`
	PLMN           string `json:"plmn"`
	NetworkContext string `json:"network_context"`
	ConsentNote    string `json:"consent_note"`
}

type Concept6A1MeasurementSpec struct {
	Mode                    string `json:"mode"`
	SamplingIntervalMS      int    `json:"sampling_interval_ms"`
	FixedPointWindowSeconds int    `json:"fixed_point_window_seconds"`
	DefaultMotionState      string `json:"default_motion_state"`
	KeepStationarySeparate  bool   `json:"keep_stationary_separate"`
	AggregationMethod       string `json:"aggregation_method"`
	PreserveRepeatedSamples bool   `json:"preserve_repeated_samples"`
	NeighborContextComplete bool   `json:"neighbor_context_complete"`
	CensoringSupported      bool   `json:"censoring_supported"`
	CensoringLimitation     string `json:"censoring_limitation"`
	LOSAnnotationPolicy     string `json:"los_annotation_policy"`
	OutdoorAnnotationPolicy string `json:"outdoor_annotation_policy"`
}

type Concept6A1DetectionSpec struct {
	Available                 bool               `json:"available"`
	FloorsDBm                 map[string]float64 `json:"floors_dbm,omitempty"`
	UnavailableRepresentation string             `json:"unavailable_representation"`
	InvalidRepresentation     string             `json:"invalid_representation"`
	CensoringRepresentation   string             `json:"censoring_representation"`
}

type Concept6A1PointAnnotation struct {
	Label              string `json:"label"`
	FixedPointID       string `json:"fixed_point_id"`
	SiteID             string `json:"site_id"`
	RouteID            string `json:"route_id"`
	LOSState           string `json:"los_nlos"`
	LOSSource          string `json:"los_source"`
	Outdoor            *bool  `json:"outdoor"`
	PointWindowSeconds int    `json:"point_window_seconds"`
	Notes              string `json:"notes"`
}

type Concept6A1PrivacyPolicy struct {
	PersonalIdentifiersExcluded []string `json:"personal_identifiers_excluded"`
	CellIdentifiersRetained     bool     `json:"cell_identifiers_retained"`
	RawAccess                   string   `json:"raw_access"`
	SharingPolicy               string   `json:"sharing_policy"`
}

type Concept6A1FieldProvenance struct {
	Status string `json:"status"`
	Source string `json:"source"`
	Note   string `json:"note,omitempty"`
}

// Concept6A1TransmitterMapEntry is a campaign-specific mapping from observed
// modem identity to one modeled A.T.O.M cell. RFProfile is configuration
// evidence; its fields are never relabeled as measured values.
type Concept6A1TransmitterMapEntry struct {
	ATOMCellID      string                               `json:"atom_cell_id"`
	ObservedCellID  string                               `json:"observed_cell_id,omitempty"`
	ObservedPCI     *int                                 `json:"observed_pci,omitempty"`
	PLMN            string                               `json:"plmn,omitempty"`
	SiteID          string                               `json:"site_id"`
	Lat             float64                              `json:"lat"`
	Lon             float64                              `json:"lon"`
	AntennaHeightM  *float64                             `json:"antenna_height_m"`
	AzimuthDeg      *float64                             `json:"azimuth_deg"`
	TiltDeg         *float64                             `json:"tilt_deg"`
	FrequencyGHz    *float64                             `json:"frequency_ghz"`
	BandwidthMHz    *float64                             `json:"bandwidth_mhz"`
	TxPowerDBm      *float64                             `json:"tx_power_dbm"`
	RFProfile       CellRFProfile                        `json:"rf_profile"`
	FieldProvenance map[string]Concept6A1FieldProvenance `json:"field_provenance"`
	SourceCitation  string                               `json:"source_citation"`
}

type Concept6A1TransmitterMap struct {
	SchemaVersion  int                             `json:"schema_version"`
	MapID          string                          `json:"map_id"`
	MapVersion     string                          `json:"map_version"`
	SourceType     string                          `json:"source_type"`
	SourceCitation string                          `json:"source_citation"`
	Entries        []Concept6A1TransmitterMapEntry `json:"entries"`
}

type Concept6A1ImportIssue struct {
	Line     int    `json:"line,omitempty"`
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}

type Concept6A1SignalCollectorRow struct {
	LineNumber           int               `json:"line_number"`
	TimestampISOUTC      string            `json:"timestamp_iso_utc"`
	EpochMS              int64             `json:"epoch_ms"`
	ElapsedRealtimeN     int64             `json:"elapsed_realtime_ns"`
	SessionID            string            `json:"session_id"`
	SequenceNumber       int64             `json:"sequence_number"`
	Source               string            `json:"source"`
	Payload              map[string]string `json:"payload"`
	TimestampEpochSkewMS int64             `json:"timestamp_epoch_skew_ms,omitempty"`
}

type Concept6A1SignalCollectorExport struct {
	FormatVersion string                         `json:"format_version"`
	Header        map[string]string              `json:"header"`
	Rows          []Concept6A1SignalCollectorRow `json:"rows,omitempty"`
	Issues        []Concept6A1ImportIssue        `json:"issues,omitempty"`
	RawSHA256     string                         `json:"raw_sha256"`
	RawBytes      int                            `json:"raw_bytes"`
	RawLineCount  int                            `json:"raw_line_count"`
	DataRowCount  int                            `json:"data_row_count"`
	RawContainer  string                         `json:"raw_container,omitempty"`
}

type Concept6A1ImportedObservation struct {
	Observation       CanonicalRFValidationObservation `json:"observation"`
	RawLine           int                              `json:"raw_line"`
	RawCellID         string                           `json:"raw_cell_id,omitempty"`
	RawPLMN           string                           `json:"raw_plmn,omitempty"`
	RawPCI            *int                             `json:"raw_pci,omitempty"`
	RawChannel        string                           `json:"raw_channel,omitempty"`
	RawIdentifiers    map[string]string                `json:"raw_identifiers,omitempty"`
	SourceField       string                           `json:"source_field"`
	MappingClass      string                           `json:"mapping_class"`
	FixedPointID      string                           `json:"fixed_point_id,omitempty"`
	RouteID           string                           `json:"route_id,omitempty"`
	LocationAccuracyM *float64                         `json:"location_accuracy_m,omitempty"`
	PoorPosition      bool                             `json:"poor_position,omitempty"`
}

type Concept6A1QuantityReadiness struct {
	Quantity              string   `json:"quantity"`
	FrequencyGHz          *float64 `json:"frequency_ghz,omitempty"`
	ObservedRows          int      `json:"observed_rows"`
	Applicable            int      `json:"applicable"`
	Censored              int      `json:"censored"`
	InsufficientMetadata  int      `json:"insufficient_metadata"`
	Inapplicable          int      `json:"inapplicable"`
	QuantityIncompatible  int      `json:"quantity_incompatible"`
	UnresolvedTransmitter int      `json:"unresolved_transmitter"`
	DeterministicMismatch int      `json:"deterministic_mismatch"`
	SuitableForValidation bool     `json:"suitable_for_validation"`
	Blockers              []string `json:"blockers,omitempty"`
}

type Concept6A1FixedPointGroup struct {
	FixedPointID string `json:"fixed_point_id"`
	SiteID       string `json:"site_id"`
	RouteID      string `json:"route_id"`
	Rows         int    `json:"rows"`
	Sessions     int    `json:"sessions"`
}

type Concept6A1QualityReport struct {
	RawFormat                   string                        `json:"raw_format"`
	RawSHA256                   string                        `json:"raw_sha256"`
	RawBytes                    int                           `json:"raw_bytes"`
	RawRows                     int                           `json:"raw_rows"`
	ParsedRows                  int                           `json:"parsed_rows"`
	CellRows                    int                           `json:"cell_rows"`
	RegisteredCellRows          int                           `json:"registered_cell_rows"`
	NeighborCellRows            int                           `json:"neighbor_cell_rows"`
	AmbiguousServingGroups      int                           `json:"ambiguous_serving_groups"`
	ValidCoordinates            int                           `json:"valid_coordinates"`
	PoorPositionRows            int                           `json:"poor_position_rows"`
	MissingCoordinates          int                           `json:"missing_coordinates"`
	ValidMeasurementRows        int                           `json:"valid_measurement_rows"`
	MissingMeasurementRows      int                           `json:"missing_measurement_rows"`
	ValidFrequencyRows          int                           `json:"valid_frequency_rows"`
	MissingFrequencyRows        int                           `json:"missing_frequency_rows"`
	ReceiverHeightKnown         bool                          `json:"receiver_height_known"`
	ServingIdentityKnown        int                           `json:"serving_identity_known"`
	ExactMappings               int                           `json:"exact_mappings"`
	DeterministicMappings       int                           `json:"deterministic_mappings"`
	GeographicCandidateMappings int                           `json:"geographic_candidate_mappings"`
	UnresolvedMappings          int                           `json:"unresolved_mappings"`
	ApplicableUMaObservations   int                           `json:"applicable_uma_observations"`
	CensoredObservations        int                           `json:"censored_observations"`
	StationaryRows              int                           `json:"stationary_rows"`
	MovingRows                  int                           `json:"moving_rows"`
	UnclassifiedMotionRows      int                           `json:"unclassified_motion_rows"`
	TimestampSkewRows           int                           `json:"timestamp_skew_rows"`
	ElapsedRealtimeOrderIssues  int                           `json:"elapsed_realtime_order_issues"`
	FixedPointGroups            []Concept6A1FixedPointGroup   `json:"fixed_point_groups,omitempty"`
	QuantityReadiness           []Concept6A1QuantityReadiness `json:"quantity_readiness,omitempty"`
	SuitableForRSRPValidation   bool                          `json:"suitable_for_rsrp_validation"`
	SuitableForReceivedPower    bool                          `json:"suitable_for_received_power_validation"`
	SuitableForSINRValidation   bool                          `json:"suitable_for_sinr_validation"`
	SuitableForRSRQValidation   bool                          `json:"suitable_for_rsrq_validation"`
	SuitableForCalibration      bool                          `json:"suitable_for_calibration_study"`
	ExclusionReasons            map[string]int                `json:"exclusion_reasons"`
	Issues                      []Concept6A1ImportIssue       `json:"issues,omitempty"`
	Notes                       []string                      `json:"notes,omitempty"`
}

type Concept6A1ImportResult struct {
	Export       Concept6A1SignalCollectorExport `json:"export"`
	Dataset      CanonicalRFValidationDataset    `json:"dataset"`
	Observations []Concept6A1ImportedObservation `json:"observations"`
	Quality      Concept6A1QualityReport         `json:"quality"`
}

type Concept6A1CampaignEvaluation struct {
	Import     Concept6A1ImportResult        `json:"import"`
	Validation CanonicalRFValidationResponse `json:"validation"`
}

func Concept6A1RawChecksum(raw []byte) string {
	digest := sha256.Sum256(raw)
	return "sha256-" + hex.EncodeToString(digest[:])
}

func concept6A1Finite(value string) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" || strings.EqualFold(value, "unknown") || strings.EqualFold(value, "unavailable") {
		return 0, false
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) || math.Abs(parsed) >= 1e12 {
		return 0, false
	}
	return parsed, true
}

func concept6A1Integer(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	return parsed, err == nil
}

func concept6A1Bool(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes":
		return true, true
	case "false", "0", "no":
		return false, true
	default:
		return false, false
	}
}

func concept6A1ValidIdentifier(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 {
		return false
	}
	for _, r := range value {
		if !(r == '-' || r == '_' || r == '.' || r == ':' || r == '/' || r == '|' || r >= '0' && r <= '9' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z') {
			return false
		}
	}
	return true
}

func concept6A1ProvenanceStatusValid(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case concept6A1StatusKnown, concept6A1StatusConfigured, concept6A1StatusInferred, concept6A1StatusUnknown:
		return true
	default:
		return false
	}
}

func ValidateConcept6A1CampaignManifest(manifest Concept6A1CampaignManifest) string {
	if manifest.SchemaVersion != Concept6A1SchemaVersion {
		return fmt.Sprintf("schema_version must be %d", Concept6A1SchemaVersion)
	}
	if !concept6A1ValidIdentifier(manifest.CampaignID) || strings.TrimSpace(manifest.CampaignVersion) == "" || strings.TrimSpace(manifest.Title) == "" {
		return "campaign_id, campaign_version, and title are required"
	}
	if _, err := time.Parse("2006-01-02", manifest.CampaignDate); err != nil {
		return "campaign_date must use YYYY-MM-DD"
	}
	if manifest.SourceType != Concept6A1SourceTypeSynthetic && manifest.SourceType != Concept6A1SourceTypeLocalField {
		return "source_type must be synthetic_controlled or local_field"
	}
	if strings.TrimSpace(manifest.CollectionMode) == "" || manifest.RawFormat != Concept6A1CollectorFormat {
		return "collection_mode and the selected Signal Collector V6 raw_format are required"
	}
	if !manifest.RawPreservation.KeepRaw || !manifest.RawPreservation.CanonicalSeparate || !manifest.RawPreservation.NoOverwrite || strings.ToLower(manifest.RawPreservation.HashAlgorithm) != "sha256" {
		return "raw_preservation must keep raw bytes, use a separate canonical output, SHA-256, and no overwrite"
	}
	if strings.TrimSpace(manifest.Collector.Name) == "" || strings.TrimSpace(manifest.Collector.Version) == "" || manifest.Collector.RootRequired {
		return "collector identity is required and root_required must be false for the selected receive-side mode"
	}
	if manifest.Collector.ExportFormat != Concept6A1CollectorFormat {
		return "collector.export_format must be SIGNAL_COLLECTOR_TXT_V6"
	}
	if strings.TrimSpace(manifest.Device.PseudonymousID) == "" || strings.TrimSpace(manifest.Device.AntennaID) == "" {
		return "device pseudonymous_id and antenna_id are required"
	}
	if manifest.Receiver.HeightAGLM == nil || !canonicalRFFinitePointer(manifest.Receiver.HeightAGLM) || *manifest.Receiver.HeightAGLM <= 0 {
		return "receiver.height_agl_m is required; no receiver-height default is allowed"
	}
	if !oneOf(manifest.Receiver.HeightSource, CanonicalRFHeightMeasured, CanonicalRFHeightConfigured, CanonicalRFHeightAssumed, CanonicalRFHeightUnknown) || manifest.Receiver.HeightSource == CanonicalRFHeightUnknown {
		return "receiver.height_source must be measured, configured, or assumed for a usable campaign manifest"
	}
	if strings.TrimSpace(manifest.Coordinate.Provider) == "" || strings.TrimSpace(manifest.Coordinate.CRS) == "" || manifest.Coordinate.MaxAccuracyM == nil || *manifest.Coordinate.MaxAccuracyM <= 0 || !manifest.Coordinate.NormalizeToUTC {
		return "coordinate provider, CRS, positive max_accuracy_m, and UTC normalization are required"
	}
	if strings.TrimSpace(manifest.Measurement.Mode) == "" || manifest.Measurement.SamplingIntervalMS <= 0 || manifest.Measurement.FixedPointWindowSeconds <= 0 || manifest.Measurement.AggregationMethod != "raw" || !manifest.Measurement.PreserveRepeatedSamples || strings.TrimSpace(manifest.Measurement.CensoringLimitation) == "" {
		return "measurement mode, sampling, fixed-point window, raw aggregation, repeated-sample retention, and censoring limitation are required"
	}
	if strings.TrimSpace(manifest.Detection.UnavailableRepresentation) == "" || strings.TrimSpace(manifest.Detection.InvalidRepresentation) == "" || strings.TrimSpace(manifest.Detection.CensoringRepresentation) == "" {
		return "detection representation policy is required"
	}
	if len(manifest.KnownLimitations) == 0 || len(manifest.Privacy.PersonalIdentifiersExcluded) == 0 || strings.TrimSpace(manifest.Privacy.SharingPolicy) == "" {
		return "known limitations and privacy policy are required"
	}
	for index, annotation := range manifest.PointAnnotations {
		if strings.TrimSpace(annotation.Label) == "" || !concept6A1ValidIdentifier(annotation.FixedPointID) || !concept6A1ValidIdentifier(annotation.SiteID) || !concept6A1ValidIdentifier(annotation.RouteID) || annotation.PointWindowSeconds <= 0 {
			return fmt.Sprintf("point_annotations[%d] has invalid identity or point window", index)
		}
		if annotation.LOSState != "" && annotation.LOSState != string(PropagationLOS) && annotation.LOSState != string(PropagationNLOS) && annotation.LOSState != string(PropagationLOSUnknown) {
			return fmt.Sprintf("point_annotations[%d].los_nlos is unsupported", index)
		}
	}
	return ""
}

func ValidateConcept6A1TransmitterMap(transmitterMap Concept6A1TransmitterMap) string {
	if transmitterMap.SchemaVersion != Concept6A1SchemaVersion || !concept6A1ValidIdentifier(transmitterMap.MapID) || strings.TrimSpace(transmitterMap.MapVersion) == "" || strings.TrimSpace(transmitterMap.SourceCitation) == "" {
		return "map schema_version, map_id, map_version, and source_citation are required"
	}
	if len(transmitterMap.Entries) == 0 || len(transmitterMap.Entries) > CanonicalRFValidationMaxCells {
		return "entries must contain between one and the canonical transmitter limit"
	}
	seenATOM := map[string]struct{}{}
	seenObserved := map[string]struct{}{}
	for index, entry := range transmitterMap.Entries {
		if !concept6A1ValidIdentifier(entry.ATOMCellID) || !concept6A1ValidIdentifier(entry.SiteID) {
			return fmt.Sprintf("entries[%d] atom_cell_id and site_id are required identifiers", index)
		}
		if _, exists := seenATOM[entry.ATOMCellID]; exists {
			return fmt.Sprintf("entries[%d].atom_cell_id is duplicated", index)
		}
		seenATOM[entry.ATOMCellID] = struct{}{}
		if strings.TrimSpace(entry.ObservedCellID) != "" {
			key := strings.TrimSpace(entry.PLMN) + "|" + strings.TrimSpace(entry.ObservedCellID)
			if _, exists := seenObserved[key]; exists {
				return fmt.Sprintf("entries[%d] observed PLMN/cell identity is duplicated", index)
			}
			seenObserved[key] = struct{}{}
		}
		if !finiteCoordinate(entry.Lon, entry.Lat) {
			return fmt.Sprintf("entries[%d] transmitter coordinates are invalid", index)
		}
		explicitFields := []struct {
			name  string
			value *float64
		}{
			{name: "antenna_height_m", value: entry.AntennaHeightM},
			{name: "azimuth_deg", value: entry.AzimuthDeg},
			{name: "tilt_deg", value: entry.TiltDeg},
			{name: "frequency_ghz", value: entry.FrequencyGHz},
			{name: "bandwidth_mhz", value: entry.BandwidthMHz},
			{name: "tx_power_dbm", value: entry.TxPowerDBm},
		}
		for _, field := range explicitFields {
			if field.value == nil || !canonicalRFFinitePointer(field.value) {
				return fmt.Sprintf("entries[%d].%s must be explicit finite mapping metadata", index, field.name)
			}
		}
		profile := entry.RFProfile.normalized()
		if validationError := ValidateCellRFProfile(profile, false); validationError != "" {
			return fmt.Sprintf("entries[%d].rf_profile: %s", index, validationError)
		}
		if profile.PropagationModelID != UrbanShortRangePropagationID || (math.Abs(profile.FrequencyGHz-2.6) > 0.01 && math.Abs(profile.FrequencyGHz-28) > 0.01) || strings.TrimSpace(profile.ChannelID) == "" {
			return fmt.Sprintf("entries[%d].rf_profile must be an explicit urban_short_range 2.6/28 GHz profile with channel_id", index)
		}
		if math.Abs(*entry.AntennaHeightM-profile.AntennaHeightM) > 1e-9 || math.Abs(*entry.AzimuthDeg-profile.OrientationDeg) > 1e-9 || math.Abs(*entry.TiltDeg-(profile.MechanicalDowntiltDeg+profile.ElectricalDowntiltDeg)) > 1e-9 || math.Abs(*entry.FrequencyGHz-profile.FrequencyGHz) > 1e-9 || math.Abs(*entry.BandwidthMHz-profile.BandwidthMHz) > 1e-9 || math.Abs(*entry.TxPowerDBm-profile.TxPowerDBm) > 1e-9 {
			return fmt.Sprintf("entries[%d] explicit mapping metadata does not agree with rf_profile", index)
		}
		for _, field := range []string{"atom_cell_id", "observed_cell_id", "site_coordinates", "antenna_height_m", "azimuth_deg", "tilt_deg", "frequency_ghz", "bandwidth_mhz", "tx_power_dbm", "provenance"} {
			provenance, exists := entry.FieldProvenance[field]
			if !exists || !concept6A1ProvenanceStatusValid(provenance.Status) || strings.TrimSpace(provenance.Source) == "" {
				return fmt.Sprintf("entries[%d].field_provenance[%q] must declare status and source", index, field)
			}
		}
	}
	return ""
}

func Concept6A1CanonicalTransmitters(transmitterMap Concept6A1TransmitterMap) []CanonicalRFValidationTransmitter {
	entries := append([]Concept6A1TransmitterMapEntry(nil), transmitterMap.Entries...)
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].ATOMCellID < entries[j].ATOMCellID })
	transmitters := make([]CanonicalRFValidationTransmitter, 0, len(entries))
	for _, entry := range entries {
		transmitters = append(transmitters, CanonicalRFValidationTransmitter{
			CellID: entry.ATOMCellID, MappingID: strings.TrimSpace(entry.ObservedCellID), SiteID: entry.SiteID,
			Lat: entry.Lat, Lon: entry.Lon, AzimuthDeg: entry.RFProfile.OrientationDeg, RFProfile: entry.RFProfile.normalized(),
		})
	}
	return transmitters
}

func concept6A1SplitEscaped(value string, separator byte) ([]string, error) {
	parts := make([]string, 0, 8)
	start := 0
	escaped := false
	for index := 0; index < len(value); index++ {
		if escaped {
			escaped = false
			continue
		}
		if value[index] == '\\' {
			escaped = true
			continue
		}
		if value[index] == separator {
			parts = append(parts, value[start:index])
			start = index + 1
		}
	}
	if escaped {
		return nil, errors.New("trailing escape character")
	}
	return append(parts, value[start:]), nil
}

func concept6A1Unescape(value string) (string, error) {
	var builder strings.Builder
	for index := 0; index < len(value); index++ {
		if value[index] != '\\' {
			builder.WriteByte(value[index])
			continue
		}
		if index+1 >= len(value) {
			return "", errors.New("trailing escape character")
		}
		index++
		switch value[index] {
		case '\\', ';', '=', 't', 'r', 'n':
			switch value[index] {
			case 't':
				builder.WriteByte('\t')
			case 'r':
				builder.WriteByte('\r')
			case 'n':
				builder.WriteByte('\n')
			default:
				builder.WriteByte(value[index])
			}
		default:
			return "", fmt.Errorf("unsupported escape \\\\%c", value[index])
		}
	}
	return builder.String(), nil
}

func concept6A1UnescapedEquals(value string) int {
	escaped := false
	for index := 0; index < len(value); index++ {
		if escaped {
			escaped = false
			continue
		}
		if value[index] == '\\' {
			escaped = true
			continue
		}
		if value[index] == '=' {
			return index
		}
	}
	return -1
}

func concept6A1ParseKeyValue(value string) (string, string, error) {
	separator := concept6A1UnescapedEquals(value)
	if separator < 0 {
		return "", "", errors.New("key/value pair has no unescaped equals sign")
	}
	key, err := concept6A1Unescape(value[:separator])
	if err != nil {
		return "", "", err
	}
	parsedValue, err := concept6A1Unescape(value[separator+1:])
	if err != nil {
		return "", "", err
	}
	if strings.TrimSpace(key) == "" {
		return "", "", errors.New("key/value pair has an empty key")
	}
	return key, parsedValue, nil
}

func concept6A1ParsePayload(value string) (map[string]string, error) {
	parts, err := concept6A1SplitEscaped(value, ';')
	if err != nil {
		return nil, err
	}
	payload := make(map[string]string, len(parts))
	for _, part := range parts {
		if strings.TrimSpace(part) == "" {
			continue
		}
		key, parsedValue, pairErr := concept6A1ParseKeyValue(part)
		if pairErr != nil {
			return nil, pairErr
		}
		payload[key] = parsedValue
	}
	return payload, nil
}

func concept6A1ParseHeader(lines []string, start int) (map[string]string, int, error) {
	header := map[string]string{}
	index := start
	for ; index < len(lines); index++ {
		line := strings.TrimSuffix(lines[index], "\r")
		if line == "" {
			return header, index + 1, nil
		}
		key, value, err := concept6A1ParseKeyValue(line)
		if err != nil {
			return nil, 0, fmt.Errorf("header line %d: %w", index+1, err)
		}
		header[key] = value
	}
	return nil, 0, errors.New("Signal Collector export has no blank line after header")
}

func ParseConcept6A1SignalCollectorTXT(raw []byte) (Concept6A1SignalCollectorExport, error) {
	if len(raw) == 0 || len(raw) > Concept6A1MaxRawBytes {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("raw export must be between 1 and %d bytes", Concept6A1MaxRawBytes)
	}
	if !utf8.Valid(raw) {
		return Concept6A1SignalCollectorExport{}, errors.New("raw export is not valid UTF-8")
	}
	lines := strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n")
	if len(lines) == 0 || strings.TrimPrefix(lines[0], "\ufeff") != Concept6A1CollectorFormat {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("raw export must start with %s", Concept6A1CollectorFormat)
	}
	header, dataStart, err := concept6A1ParseHeader(lines, 1)
	if err != nil {
		return Concept6A1SignalCollectorExport{}, err
	}
	if dataStart >= len(lines) {
		return Concept6A1SignalCollectorExport{}, errors.New("Signal Collector export is missing its TSV header")
	}
	tsvHeader, err := concept6A1SplitEscaped(strings.TrimSuffix(lines[dataStart], "\r"), '\t')
	if err != nil {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("TSV header: %w", err)
	}
	expectedHeader := []string{"timestamp_iso_utc", "epoch_ms", "elapsed_realtime_ns", "session_id", "sequence_number", "source", "payload"}
	if len(tsvHeader) != len(expectedHeader) {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("TSV header has %d columns, want %d", len(tsvHeader), len(expectedHeader))
	}
	for index := range expectedHeader {
		parsed, unescapeErr := concept6A1Unescape(tsvHeader[index])
		if unescapeErr != nil || parsed != expectedHeader[index] {
			return Concept6A1SignalCollectorExport{}, fmt.Errorf("TSV header column %d is %q, want %q", index+1, parsed, expectedHeader[index])
		}
	}
	export := Concept6A1SignalCollectorExport{FormatVersion: Concept6A1CollectorFormat, Header: header, RawSHA256: Concept6A1RawChecksum(raw), RawBytes: len(raw), RawLineCount: len(lines), Issues: make([]Concept6A1ImportIssue, 0)}
	lastElapsedBySession := map[string]int64{}
	for lineIndex := dataStart + 1; lineIndex < len(lines); lineIndex++ {
		line := strings.TrimSuffix(lines[lineIndex], "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		export.DataRowCount++
		fields, splitErr := concept6A1SplitEscaped(line, '\t')
		if splitErr != nil || len(fields) != len(expectedHeader) {
			export.Issues = append(export.Issues, Concept6A1ImportIssue{Line: lineIndex + 1, Code: "malformed_row", Severity: "error", Message: fmt.Sprintf("expected seven unescaped TSV columns, got %d: %v", len(fields), splitErr)})
			continue
		}
		decoded := make([]string, len(fields))
		decodeErr := error(nil)
		for index, field := range fields {
			// The payload is a second escaped key/value grammar. Decode the
			// outer TSV columns first, but leave payload escapes intact until
			// concept6A1ParsePayload handles its semicolon/equal delimiters.
			if index == 6 {
				decoded[index] = field
				continue
			}
			decoded[index], decodeErr = concept6A1Unescape(field)
			if decodeErr != nil {
				break
			}
		}
		if decodeErr != nil {
			export.Issues = append(export.Issues, Concept6A1ImportIssue{Line: lineIndex + 1, Code: "malformed_escape", Severity: "error", Message: decodeErr.Error()})
			continue
		}
		epoch, epochOK := concept6A1Integer(decoded[1])
		elapsed, elapsedOK := concept6A1Integer(decoded[2])
		sequence, sequenceOK := concept6A1Integer(decoded[4])
		if !epochOK || !elapsedOK || !sequenceOK {
			export.Issues = append(export.Issues, Concept6A1ImportIssue{Line: lineIndex + 1, Code: "invalid_timestamp_or_sequence", Severity: "error", Message: "epoch_ms, elapsed_realtime_ns, and sequence_number must be integers"})
			continue
		}
		parsedTimestamp, timestampErr := time.Parse(time.RFC3339Nano, decoded[0])
		if timestampErr != nil {
			export.Issues = append(export.Issues, Concept6A1ImportIssue{Line: lineIndex + 1, Code: "invalid_timestamp", Severity: "error", Message: timestampErr.Error()})
			continue
		}
		payload, payloadErr := concept6A1ParsePayload(decoded[6])
		if payloadErr != nil {
			export.Issues = append(export.Issues, Concept6A1ImportIssue{Line: lineIndex + 1, Code: "malformed_payload", Severity: "error", Message: payloadErr.Error()})
			continue
		}
		normalizedTimestamp := parsedTimestamp.UTC().Format(time.RFC3339Nano)
		skewMS := parsedTimestamp.UnixMilli() - epoch
		if math.Abs(float64(skewMS)) > 2000 {
			export.Issues = append(export.Issues, Concept6A1ImportIssue{Line: lineIndex + 1, Code: "timestamp_epoch_mismatch", Severity: "warning", Message: fmt.Sprintf("timestamp and epoch differ by %d ms", skewMS)})
		}
		if previous, exists := lastElapsedBySession[decoded[3]]; exists && elapsed < previous {
			export.Issues = append(export.Issues, Concept6A1ImportIssue{Line: lineIndex + 1, Code: "elapsed_realtime_not_monotonic", Severity: "warning", Message: fmt.Sprintf("elapsed_realtime_ns decreased from %d to %d within session %q", previous, elapsed, decoded[3])})
		}
		lastElapsedBySession[decoded[3]] = elapsed
		export.Rows = append(export.Rows, Concept6A1SignalCollectorRow{LineNumber: lineIndex + 1, TimestampISOUTC: normalizedTimestamp, EpochMS: epoch, ElapsedRealtimeN: elapsed, SessionID: decoded[3], SequenceNumber: sequence, Source: decoded[5], Payload: payload, TimestampEpochSkewMS: skewMS})
	}
	if expectedCount, ok := concept6A1Integer(header["record_count"]); ok && expectedCount != int64(len(export.Rows)) {
		export.Issues = append(export.Issues, Concept6A1ImportIssue{Code: "record_count_mismatch", Severity: "warning", Message: fmt.Sprintf("header record_count=%d but parsed %d valid rows", expectedCount, len(export.Rows))})
	}
	if dropped, ok := concept6A1Integer(header["dropped_samples"]); ok && dropped > 0 {
		export.Issues = append(export.Issues, Concept6A1ImportIssue{Code: "collector_dropped_samples", Severity: "warning", Message: fmt.Sprintf("collector reported %d dropped samples", dropped)})
	}
	return export, nil
}

// ParseConcept6A1SignalCollector accepts the documented plain-text export and
// its gzip container. The checksum always identifies the original immutable
// bytes supplied by the caller, while parsing happens on the decompressed V6
// text. Other archive containers are rejected explicitly rather than unpacked
// with an implicit policy.
func ParseConcept6A1SignalCollector(raw []byte) (Concept6A1SignalCollectorExport, error) {
	if len(raw) < 2 || raw[0] != 0x1f || raw[1] != 0x8b {
		export, err := ParseConcept6A1SignalCollectorTXT(raw)
		if err == nil {
			export.RawContainer = "text"
		}
		return export, err
	}
	if len(raw) > Concept6A1MaxRawBytes {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("raw gzip export must be no larger than %d bytes", Concept6A1MaxRawBytes)
	}
	reader, err := gzip.NewReader(bytes.NewReader(raw))
	if err != nil {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("open gzip export: %w", err)
	}
	decompressed, err := io.ReadAll(io.LimitReader(reader, Concept6A1MaxRawBytes+1))
	closeErr := reader.Close()
	if err != nil {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("read gzip export: %w", err)
	}
	if closeErr != nil {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("close gzip export: %w", closeErr)
	}
	if len(decompressed) > Concept6A1MaxRawBytes {
		return Concept6A1SignalCollectorExport{}, fmt.Errorf("decompressed raw export must be no larger than %d bytes", Concept6A1MaxRawBytes)
	}
	export, err := ParseConcept6A1SignalCollectorTXT(decompressed)
	if err != nil {
		return Concept6A1SignalCollectorExport{}, err
	}
	export.RawSHA256 = Concept6A1RawChecksum(raw)
	export.RawBytes = len(raw)
	export.RawContainer = "gzip"
	return export, nil
}

type concept6A1LocationState struct {
	Lat       *float64
	Lon       *float64
	AccuracyM *float64
	SpeedMPS  *float64
	EpochMS   int64
	Available bool
}

type concept6A1PointState struct {
	Annotation Concept6A1PointAnnotation
	UntilMS    int64
}

type concept6A1SourceCell struct {
	Row             Concept6A1SignalCollectorRow
	Payload         map[string]string
	Location        concept6A1LocationState
	Point           Concept6A1PointAnnotation
	PointActive     bool
	Technology      string
	Registered      bool
	RegisteredKnown bool
	Connection      string
	CellID          string
	PCI             *int
	PLMN            string
	Band            string
	FrequencyGHz    *float64
	BandwidthMHz    *float64
	ChannelID       string
	ChannelRaw      string
	GroupKey        string
}

func concept6A1PayloadNumber(payload map[string]string, key string) (*float64, bool) {
	value, ok := concept6A1Finite(payload[key])
	if !ok {
		return nil, false
	}
	return &value, true
}

func concept6A1PayloadInteger(payload map[string]string, key string) (*int, bool) {
	value, ok := concept6A1Integer(payload[key])
	if !ok || value < int64(math.MinInt) || value > int64(math.MaxInt) {
		return nil, false
	}
	parsed := int(value)
	return &parsed, true
}

func concept6A1CellIdentifier(payload map[string]string, technology string) string {
	if value := strings.TrimSpace(payload["cell_id"]); value != "" {
		return value
	}
	if strings.EqualFold(technology, "nr") {
		return strings.TrimSpace(payload["nci"])
	}
	return ""
}

func concept6A1Channel(payload map[string]string, technology string) (string, string) {
	if strings.EqualFold(technology, "nr") {
		if value := strings.TrimSpace(payload["nrarfcn"]); value != "" {
			return "nrarfcn:" + value, value
		}
		return "", ""
	}
	if value := strings.TrimSpace(payload["earfcn"]); value != "" {
		return "earfcn:" + value, value
	}
	return "", ""
}

func concept6A1Frequency(payload map[string]string) (*float64, bool) {
	value, ok := concept6A1Finite(payload["frequency_mhz"])
	if !ok || value <= 0 {
		return nil, false
	}
	frequencyGHz := value / 1000
	return &frequencyGHz, true
}

func concept6A1Bandwidth(payload map[string]string, technology string) (*float64, bool) {
	if value, ok := concept6A1Finite(payload["bandwidth_mhz"]); ok && value > 0 {
		return &value, true
	}
	if strings.EqualFold(technology, "lte") {
		if value, ok := concept6A1Finite(payload["bandwidth"]); ok && value > 0 {
			bandwidthMHz := value / 1000
			return &bandwidthMHz, true
		}
	}
	return nil, false
}

func concept6A1CellGroupKey(row Concept6A1SignalCollectorRow, payload map[string]string) string {
	if value, ok := concept6A1Integer(payload["cell_timestamp_ms"]); ok {
		return row.SessionID + "|" + strconv.FormatInt(value, 10)
	}
	return row.SessionID + "|" + strconv.FormatInt(row.EpochMS, 10)
}

func concept6A1LocationFromRow(row Concept6A1SignalCollectorRow) concept6A1LocationState {
	payload := row.Payload
	available, availableOK := concept6A1Bool(payload["last_location"])
	lat, latOK := concept6A1PayloadNumber(payload, "last_latitude")
	lon, lonOK := concept6A1PayloadNumber(payload, "last_longitude")
	accuracy, _ := concept6A1PayloadNumber(payload, "last_location_accuracy")
	speed, _ := concept6A1PayloadNumber(payload, "last_speed_mps")
	if availableOK && available && latOK && lonOK && finiteCoordinate(*lon, *lat) {
		return concept6A1LocationState{Lat: lat, Lon: lon, AccuracyM: accuracy, SpeedMPS: speed, EpochMS: row.EpochMS, Available: true}
	}
	return concept6A1LocationState{AccuracyM: accuracy, SpeedMPS: speed, EpochMS: row.EpochMS, Available: false}
}

func concept6A1PointAnnotations(manifest Concept6A1CampaignManifest) map[string]Concept6A1PointAnnotation {
	annotations := make(map[string]Concept6A1PointAnnotation, len(manifest.PointAnnotations))
	for _, annotation := range manifest.PointAnnotations {
		annotations[annotation.Label] = annotation
	}
	return annotations
}

func concept6A1MapEntryForCell(transmitterMap Concept6A1TransmitterMap, plmn, cellID string) *Concept6A1TransmitterMapEntry {
	if strings.TrimSpace(cellID) == "" {
		return nil
	}
	for index := range transmitterMap.Entries {
		entry := &transmitterMap.Entries[index]
		if entry.ObservedCellID == cellID && (strings.TrimSpace(entry.PLMN) == "" || strings.TrimSpace(entry.PLMN) == strings.TrimSpace(plmn)) {
			return entry
		}
	}
	return nil
}

func concept6A1RawQuantityValues(cell concept6A1SourceCell) []struct {
	Quantity    string
	Value       *float64
	SourceField string
} {
	values := make([]struct {
		Quantity    string
		Value       *float64
		SourceField string
	}, 0, 4)
	add := func(quantity, key string) {
		if value, ok := concept6A1PayloadNumber(cell.Payload, key); ok {
			values = append(values, struct {
				Quantity    string
				Value       *float64
				SourceField string
			}{Quantity: quantity, Value: value, SourceField: key})
		}
	}
	if strings.EqualFold(cell.Technology, "nr") {
		add(CanonicalRFQuantityRSRPDBm, "ss_rsrp")
		add(CanonicalRFQuantityRSRQDB, "ss_rsrq")
		add(CanonicalRFQuantitySINRDB, "ss_sinr")
		if len(values) == 0 {
			add(CanonicalRFQuantitySINRDB, "sinr")
		}
	} else if strings.EqualFold(cell.Technology, "lte") {
		add(CanonicalRFQuantityRSRPDBm, "rsrp")
		add(CanonicalRFQuantityRSRQDB, "rsrq")
		add(CanonicalRFQuantitySINRDB, "rssnr")
		if len(values) == 0 {
			add(CanonicalRFQuantitySINRDB, "sinr")
		}
	}
	if strings.EqualFold(cell.Technology, "lte") {
		add(CanonicalRFQuantityRSSIDBm, "rssi")
	}
	return values
}

func concept6A1CanonicalTechnology(technology string) string {
	switch strings.ToLower(strings.TrimSpace(technology)) {
	case "lte":
		return "4g"
	case "nr":
		return "5g"
	default:
		return strings.ToLower(strings.TrimSpace(technology))
	}
}

func concept6A1ObservationID(manifest Concept6A1CampaignManifest, cell concept6A1SourceCell, quantity string) string {
	cellPart := cell.CellID
	if cellPart == "" {
		cellPart = "unknown-cell"
	}
	return fmt.Sprintf("%s:%s:%d:%s:%s", manifest.CampaignID, cell.Row.SessionID, cell.Row.SequenceNumber, cellPart, quantity)
}

func concept6A1MappingClass(entry *Concept6A1TransmitterMapEntry, cell concept6A1SourceCell) string {
	if entry != nil && strings.TrimSpace(entry.ObservedCellID) != "" && entry.ObservedCellID == cell.CellID {
		return Concept6A1MappingExact
	}
	if cell.PCI != nil && cell.ChannelID != "" && cell.FrequencyGHz != nil {
		return Concept6A1MappingDeterministic
	}
	return Concept6A1MappingUnresolved
}

func concept6A1BuildCell(row Concept6A1SignalCollectorRow, location concept6A1LocationState, pointState concept6A1PointState, manifest Concept6A1CampaignManifest) (concept6A1SourceCell, bool) {
	if row.Source != "mobile_network" || row.Payload["record_type"] != "cell" {
		return concept6A1SourceCell{}, false
	}
	technology := strings.ToLower(strings.TrimSpace(row.Payload["technology"]))
	if technology != "lte" && technology != "nr" {
		return concept6A1SourceCell{Row: row, Payload: row.Payload, Technology: technology, Location: location, Point: pointState.Annotation, PointActive: pointState.UntilMS >= row.EpochMS}, true
	}
	registered, registeredKnown := concept6A1Bool(row.Payload["registered"])
	channelID, channelRaw := concept6A1Channel(row.Payload, technology)
	frequency, _ := concept6A1Frequency(row.Payload)
	bandwidth, _ := concept6A1Bandwidth(row.Payload, technology)
	return concept6A1SourceCell{
		Row: row, Payload: row.Payload, Location: location, Point: pointState.Annotation, PointActive: pointState.UntilMS >= row.EpochMS,
		Technology: technology, Registered: registered, RegisteredKnown: registeredKnown, Connection: strings.ToUpper(strings.TrimSpace(row.Payload["connection_status"])),
		CellID: concept6A1CellIdentifier(row.Payload, technology), PCI: func() *int {
			value, ok := concept6A1PayloadInteger(row.Payload, "pci")
			if ok {
				return value
			}
			return nil
		}(), PLMN: strings.TrimSpace(row.Payload["plmn"]),
		Band: strings.TrimSpace(row.Payload["band"]), FrequencyGHz: frequency, BandwidthMHz: bandwidth, ChannelID: channelID, ChannelRaw: channelRaw, GroupKey: concept6A1CellGroupKey(row, row.Payload),
	}, true
}

func concept6A1CellIsServing(cell concept6A1SourceCell) bool {
	return cell.RegisteredKnown && cell.Registered && (cell.Connection == "PRIMARY_SERVING" || cell.Connection == "SECONDARY_SERVING")
}

func concept6A1LocationForCell(cell concept6A1SourceCell) concept6A1LocationState {
	location := cell.Location
	if cell.Payload["last_location"] == "true" {
		if parsed := concept6A1LocationFromRow(cell.Row); parsed.Available {
			location = parsed
		}
	}
	return location
}

func concept6A1Motion(location concept6A1LocationState, manifest Concept6A1CampaignManifest) string {
	if location.SpeedMPS != nil {
		if *location.SpeedMPS <= 0.5 {
			return "stationary"
		}
		return "moving"
	}
	return strings.TrimSpace(manifest.Measurement.DefaultMotionState)
}

func concept6A1NeighborIDs(group []concept6A1SourceCell, current concept6A1SourceCell) []string {
	ids := make([]string, 0, len(group))
	seen := map[string]struct{}{}
	for _, candidate := range group {
		if candidate.CellID == "" || candidate.CellID == current.CellID || !candidate.RegisteredKnown || candidate.Registered {
			continue
		}
		if _, exists := seen[candidate.CellID]; exists {
			continue
		}
		seen[candidate.CellID] = struct{}{}
		ids = append(ids, candidate.CellID)
	}
	sort.Strings(ids)
	return ids
}

func concept6A1RawIdentifiers(payload map[string]string) map[string]string {
	identifiers := map[string]string{}
	for _, key := range []string{
		"cell_id", "nci", "pci", "plmn", "tac", "enb_id", "gnb_id", "enb", "gnb",
		"earfcn", "nrarfcn", "band", "frequency_mhz", "bandwidth", "bandwidth_mhz",
		"cell_timestamp_ms", "registered", "connection_status",
	} {
		if value := strings.TrimSpace(payload[key]); value != "" {
			identifiers[key] = value
		}
	}
	return identifiers
}

func concept6A1QualityForManifest(manifest Concept6A1CampaignManifest, export Concept6A1SignalCollectorExport) Concept6A1QualityReport {
	timestampSkewRows, elapsedOrderIssues := 0, 0
	for _, issue := range export.Issues {
		switch issue.Code {
		case "timestamp_epoch_mismatch":
			timestampSkewRows++
		case "elapsed_realtime_not_monotonic":
			elapsedOrderIssues++
		}
	}
	return Concept6A1QualityReport{
		RawFormat: Concept6A1CollectorFormat, RawSHA256: export.RawSHA256, RawBytes: export.RawBytes, RawRows: export.DataRowCount,
		ReceiverHeightKnown: manifest.Receiver.HeightAGLM != nil && manifest.Receiver.HeightSource != CanonicalRFHeightUnknown,
		TimestampSkewRows:   timestampSkewRows, ElapsedRealtimeOrderIssues: elapsedOrderIssues,
		ExclusionReasons: map[string]int{}, Issues: append([]Concept6A1ImportIssue(nil), export.Issues...),
		Notes: []string{"Raw Signal Collector bytes are not rewritten; the SHA-256 checksum is the immutable input identity.", "Rows with absent frequency, bandwidth, receiver-height provenance, location, or LOS/outdoor annotations remain explicit readiness failures."},
	}
}

func concept6A1Increment(mapValue map[string]int, key string) {
	if strings.TrimSpace(key) != "" {
		mapValue[key]++
	}
}

// ImportConcept6A1SignalCollector imports the selected V6 export without
// choosing a serving cell from signal strength and without filling missing
// frequency, bandwidth, height, or geometry semantics.
func ImportConcept6A1SignalCollector(raw []byte, manifest Concept6A1CampaignManifest, transmitterMap Concept6A1TransmitterMap) (Concept6A1ImportResult, error) {
	if validationError := ValidateConcept6A1CampaignManifest(manifest); validationError != "" {
		return Concept6A1ImportResult{}, fmt.Errorf("campaign manifest: %s", validationError)
	}
	if validationError := ValidateConcept6A1TransmitterMap(transmitterMap); validationError != "" {
		return Concept6A1ImportResult{}, fmt.Errorf("transmitter map: %s", validationError)
	}
	export, err := ParseConcept6A1SignalCollector(raw)
	if err != nil {
		return Concept6A1ImportResult{}, err
	}
	quality := concept6A1QualityForManifest(manifest, export)
	annotations := concept6A1PointAnnotations(manifest)
	locations := map[string]concept6A1LocationState{}
	points := map[string]concept6A1PointState{}
	allCells := make([]concept6A1SourceCell, 0)
	for _, row := range export.Rows {
		if row.Source == "location" && row.Payload["record_type"] == "fix" {
			location := concept6A1LocationState{}
			if lat, latOK := concept6A1PayloadNumber(row.Payload, "latitude"); latOK {
				if lon, lonOK := concept6A1PayloadNumber(row.Payload, "longitude"); lonOK && finiteCoordinate(*lon, *lat) {
					location.Lat, location.Lon, location.Available = lat, lon, true
				}
			}
			location.AccuracyM, _ = concept6A1PayloadNumber(row.Payload, "horizontal_accuracy_m")
			location.SpeedMPS, _ = concept6A1PayloadNumber(row.Payload, "speed_mps")
			location.EpochMS = row.EpochMS
			locations[row.SessionID] = location
		}
		if row.Source == "session" && row.Payload["record_type"] == "survey_point" {
			label := strings.TrimSpace(row.Payload["label"])
			annotation, ok := annotations[label]
			if !ok {
				annotation = Concept6A1PointAnnotation{Label: label, FixedPointID: "unannotated-point", SiteID: "unassigned-site", RouteID: "unassigned-route", PointWindowSeconds: manifest.Measurement.FixedPointWindowSeconds, LOSState: string(PropagationLOSUnknown)}
			}
			window := annotation.PointWindowSeconds
			if window <= 0 {
				window = manifest.Measurement.FixedPointWindowSeconds
			}
			points[row.SessionID] = concept6A1PointState{Annotation: annotation, UntilMS: row.EpochMS + int64(window)*1000}
		}
		if row.Source != "mobile_network" || row.Payload["record_type"] != "cell" {
			continue
		}
		location := locations[row.SessionID]
		if parsed := concept6A1LocationFromRow(row); parsed.Available {
			location = parsed
		}
		cell, ok := concept6A1BuildCell(row, location, points[row.SessionID], manifest)
		if !ok {
			continue
		}
		allCells = append(allCells, cell)
	}
	quality.ParsedRows = len(export.Rows)
	quality.CellRows = len(allCells)
	groups := map[string][]concept6A1SourceCell{}
	for _, cell := range allCells {
		groups[cell.GroupKey] = append(groups[cell.GroupKey], cell)
	}
	for key := range groups {
		sort.SliceStable(groups[key], func(i, j int) bool {
			if groups[key][i].CellID == groups[key][j].CellID {
				return groups[key][i].Row.LineNumber < groups[key][j].Row.LineNumber
			}
			return groups[key][i].CellID < groups[key][j].CellID
		})
		servingIDs := map[string]struct{}{}
		for _, cell := range groups[key] {
			if concept6A1CellIsServing(cell) && cell.CellID != "" {
				servingIDs[cell.CellID] = struct{}{}
			}
		}
		if len(servingIDs) > 1 {
			quality.AmbiguousServingGroups++
		}
	}
	for _, cell := range allCells {
		if concept6A1CellIsServing(cell) {
			quality.RegisteredCellRows++
			location := concept6A1LocationForCell(cell)
			if location.Available && location.AccuracyM != nil && *location.AccuracyM <= *manifest.Coordinate.MaxAccuracyM {
				quality.ValidCoordinates++
			} else if location.Available {
				quality.PoorPositionRows++
			} else {
				quality.MissingCoordinates++
			}
			if cell.FrequencyGHz != nil {
				quality.ValidFrequencyRows++
			} else {
				quality.MissingFrequencyRows++
			}
			if cell.CellID != "" || cell.PCI != nil {
				quality.ServingIdentityKnown++
			}
			if len(concept6A1RawQuantityValues(cell)) == 0 {
				quality.MissingMeasurementRows++
			}
		} else {
			quality.NeighborCellRows++
		}
	}
	// Build the canonical rows in a second pass so imported metadata and the
	// raw-source identity stay together without making the canonical 6A schema
	// depend on a specific collector.
	importedRows := make([]Concept6A1ImportedObservation, 0, quality.ValidMeasurementRows*3)
	quality.FixedPointGroups = nil
	for _, cell := range allCells {
		if !concept6A1CellIsServing(cell) {
			continue
		}
		location := concept6A1LocationForCell(cell)
		entry := concept6A1MapEntryForCell(transmitterMap, cell.PLMN, cell.CellID)
		mappingClass := concept6A1MappingClass(entry, cell)
		for _, quantity := range concept6A1RawQuantityValues(cell) {
			observation := CanonicalRFValidationObservation{
				ObservationID: concept6A1ObservationID(manifest, cell, quantity.Quantity), CampaignID: manifest.CampaignID, CampaignVersion: manifest.CampaignVersion,
				SiteID: "unassigned-site", SessionID: cell.Row.SessionID, Timestamp: cell.Row.TimestampISOUTC,
				RxHeightM: manifest.Receiver.HeightAGLM, RxHeightSource: manifest.Receiver.HeightSource, Technology: concept6A1CanonicalTechnology(cell.Technology),
				FrequencyGHz: cell.FrequencyGHz, Band: cell.Band, BandwidthMHz: cell.BandwidthMHz, ChannelID: cell.ChannelID,
				ServingCellID: cell.CellID, ServingPCI: cell.PCI, Quantity: quantity.Quantity, ValueDB: quantity.Value,
				QuantityDefinition: "Signal Collector V6 " + quantity.SourceField, DeviceID: manifest.Device.PseudonymousID, DeviceModel: manifest.Device.Model,
				AntennaID: manifest.Receiver.AntennaID, AntennaBasis: manifest.Receiver.AntennaBasis, CalibrationID: manifest.Receiver.CalibrationID,
				CalibrationState: manifest.Receiver.CalibrationState, MotionState: concept6A1Motion(location, manifest), SamplingMethod: "signal_collector_txt_v6",
				AggregationMethod: manifest.Measurement.AggregationMethod, SampleCount: 1, Provenance: "signal_collector_txt_v6:" + export.RawSHA256,
				LOSState: string(PropagationLOSUnknown), Outdoor: nil, ResourceSemantics: "source_declared_cell_snapshot; raw_channel_and_bandwidth_retained",
				InterferenceContextComplete: func() *bool { value := manifest.Measurement.NeighborContextComplete; return &value }(), NeighborCellIDs: concept6A1NeighborIDs(groups[cell.GroupKey], cell),
			}
			if entry != nil {
				observation.TransmitterID = entry.ATOMCellID
				observation.SiteID = entry.SiteID
			}
			if cell.PointActive {
				observation.SiteID = cell.Point.SiteID
				observation.LOSState = cell.Point.LOSState
				if observation.LOSState == "" {
					observation.LOSState = string(PropagationLOSUnknown)
				}
				observation.LOSSource = cell.Point.LOSSource
				observation.Outdoor = cell.Point.Outdoor
			}
			poorPosition := false
			if location.Available && location.AccuracyM != nil {
				accuracy := *location.AccuracyM
				if accuracy <= *manifest.Coordinate.MaxAccuracyM {
					observation.Lat, observation.Lon = location.Lat, location.Lon
				} else {
					poorPosition = true
					observation.QualityFlags = append(observation.QualityFlags, "poor_position_accuracy")
				}
			} else if location.Available {
				observation.Lat, observation.Lon = location.Lat, location.Lon
			}
			if observation.Lat == nil || observation.Lon == nil {
				observation.QualityFlags = append(observation.QualityFlags, "coordinates_unusable_for_geometry")
			}
			if observation.FrequencyGHz == nil {
				observation.QualityFlags = append(observation.QualityFlags, "frequency_missing")
			}
			if observation.BandwidthMHz == nil && (quantity.Quantity == CanonicalRFQuantityRSRPDBm || canonicalRFNeedInterference(quantity.Quantity)) {
				observation.QualityFlags = append(observation.QualityFlags, "bandwidth_missing")
			}
			imported := Concept6A1ImportedObservation{Observation: observation, RawLine: cell.Row.LineNumber, RawCellID: cell.CellID, RawPLMN: cell.PLMN, RawPCI: cell.PCI, RawChannel: cell.ChannelRaw, RawIdentifiers: concept6A1RawIdentifiers(cell.Payload), SourceField: quantity.SourceField, MappingClass: mappingClass, LocationAccuracyM: location.AccuracyM, PoorPosition: poorPosition}
			if cell.PointActive {
				imported.FixedPointID, imported.RouteID = cell.Point.FixedPointID, cell.Point.RouteID
			}
			switch observation.MotionState {
			case "stationary":
				quality.StationaryRows++
			case "moving":
				quality.MovingRows++
			default:
				quality.UnclassifiedMotionRows++
			}
			importedRows = append(importedRows, imported)
		}
	}
	quality.ValidMeasurementRows = len(importedRows)
	groupStats := map[string]*Concept6A1FixedPointGroup{}
	sessionSets := map[string]map[string]struct{}{}
	for _, imported := range importedRows {
		if imported.FixedPointID == "" {
			continue
		}
		group, ok := groupStats[imported.FixedPointID]
		if !ok {
			group = &Concept6A1FixedPointGroup{FixedPointID: imported.FixedPointID, SiteID: imported.Observation.SiteID, RouteID: imported.RouteID}
			groupStats[imported.FixedPointID] = group
			sessionSets[imported.FixedPointID] = map[string]struct{}{}
		}
		group.Rows++
		sessionSets[imported.FixedPointID][imported.Observation.SessionID] = struct{}{}
	}
	for _, group := range groupStats {
		group.Sessions = len(sessionSets[group.FixedPointID])
		quality.FixedPointGroups = append(quality.FixedPointGroups, *group)
	}
	sort.SliceStable(quality.FixedPointGroups, func(i, j int) bool {
		return quality.FixedPointGroups[i].FixedPointID < quality.FixedPointGroups[j].FixedPointID
	})
	dataset := CanonicalRFValidationDataset{SchemaVersion: CanonicalRFValidationSchemaVersion, DatasetID: manifest.CampaignID, DatasetVersion: manifest.CampaignVersion, SourceType: manifest.SourceType, SourceCitation: manifest.Collector.Name + " " + manifest.Collector.Version + " export", License: manifest.Collector.Licensing, Observations: make([]CanonicalRFValidationObservation, 0, len(importedRows)), Transmitters: Concept6A1CanonicalTransmitters(transmitterMap)}
	for _, imported := range importedRows {
		dataset.Observations = append(dataset.Observations, imported.Observation)
	}
	return Concept6A1ImportResult{Export: export, Dataset: dataset, Observations: importedRows, Quality: quality}, nil
}

func concept6A1ReadinessKey(quantity string, frequency *float64) string {
	if frequency == nil {
		return quantity + "@unknown"
	}
	return fmt.Sprintf("%s@%.6g", quantity, *frequency)
}

func concept6A1AppendBlocker(readiness *Concept6A1QuantityReadiness, blocker string) {
	for _, existing := range readiness.Blockers {
		if existing == blocker {
			return
		}
	}
	readiness.Blockers = append(readiness.Blockers, blocker)
}

func Concept6A1ApplyValidationQuality(quality *Concept6A1QualityReport, observations []Concept6A1ImportedObservation, response CanonicalRFValidationResponse, sourceType string) {
	if quality == nil {
		return
	}
	quality.ApplicableUMaObservations = response.Counts.Applicable
	quality.CensoredObservations = response.Counts.Censored
	if quality.ExclusionReasons == nil {
		quality.ExclusionReasons = map[string]int{}
	}
	byID := map[string]Concept6A1ImportedObservation{}
	for _, imported := range observations {
		byID[imported.Observation.ObservationID] = imported
	}
	readiness := map[string]*Concept6A1QuantityReadiness{}
	for _, result := range response.Observations {
		key := concept6A1ReadinessKey(result.Quantity, func() *float64 {
			if result.FrequencyGHz == 0 {
				return nil
			}
			value := result.FrequencyGHz
			return &value
		}())
		row, ok := readiness[key]
		if !ok {
			row = &Concept6A1QuantityReadiness{Quantity: result.Quantity}
			if result.FrequencyGHz != 0 {
				value := result.FrequencyGHz
				row.FrequencyGHz = &value
			}
			readiness[key] = row
		}
		row.ObservedRows++
		switch result.Status {
		case CanonicalRFStatusApplicable:
			row.Applicable++
		case CanonicalRFStatusCensored:
			row.Censored++
		case CanonicalRFStatusInsufficientMetadata:
			row.InsufficientMetadata++
		case CanonicalRFStatusInapplicable:
			row.Inapplicable++
		case CanonicalRFStatusQuantityIncompatible:
			row.QuantityIncompatible++
		case CanonicalRFStatusUnresolvedTransmitter:
			row.UnresolvedTransmitter++
		case CanonicalRFStatusDeterministicMismatch:
			row.DeterministicMismatch++
		}
		if result.ExclusionReason != "" && result.Status != CanonicalRFStatusApplicable {
			concept6A1Increment(quality.ExclusionReasons, result.ExclusionReason)
		}
		if imported, found := byID[result.ObservationID]; found {
			switch result.MatchingMethod {
			case "explicit_id_or_mapping":
				if imported.MappingClass == Concept6A1MappingExact {
					quality.ExactMappings++
				}
			case "pci_channel_frequency":
				quality.DeterministicMappings++
			case "opt_in_geographic_candidate":
				quality.GeographicCandidateMappings++
			default:
				if result.Status == CanonicalRFStatusUnresolvedTransmitter {
					quality.UnresolvedMappings++
				}
			}
		}
	}
	quality.QuantityReadiness = make([]Concept6A1QuantityReadiness, 0, len(readiness))
	for _, row := range readiness {
		if row.Applicable == 0 {
			concept6A1AppendBlocker(row, "no applicable observations")
		}
		if row.InsufficientMetadata > 0 {
			concept6A1AppendBlocker(row, "insufficient metadata remains")
		}
		if row.UnresolvedTransmitter > 0 {
			concept6A1AppendBlocker(row, "transmitter mapping is unresolved")
		}
		if row.DeterministicMismatch > 0 {
			concept6A1AppendBlocker(row, "deterministic identity or geometry mismatch")
		}
		if row.Quantity == CanonicalRFQuantitySINRDB || row.Quantity == CanonicalRFQuantityRSRQDB || row.Quantity == CanonicalRFQuantityRSSIDBm {
			concept6A1AppendBlocker(row, "interference/radio-quality context is not automatically complete")
		}
		row.SuitableForValidation = row.Applicable > 0 && row.InsufficientMetadata == 0 && row.UnresolvedTransmitter == 0 && row.DeterministicMismatch == 0 && row.QuantityIncompatible == 0
		if row.Quantity == CanonicalRFQuantitySINRDB || row.Quantity == CanonicalRFQuantityRSRQDB || row.Quantity == CanonicalRFQuantityRSSIDBm {
			row.SuitableForValidation = row.SuitableForValidation && row.Censored == 0
		}
		quality.QuantityReadiness = append(quality.QuantityReadiness, *row)
	}
	sort.SliceStable(quality.QuantityReadiness, func(i, j int) bool {
		left, right := concept6A1ReadinessKey(quality.QuantityReadiness[i].Quantity, quality.QuantityReadiness[i].FrequencyGHz), concept6A1ReadinessKey(quality.QuantityReadiness[j].Quantity, quality.QuantityReadiness[j].FrequencyGHz)
		return left < right
	})
	for _, row := range quality.QuantityReadiness {
		if row.Quantity == CanonicalRFQuantityRSRPDBm && row.SuitableForValidation {
			quality.SuitableForRSRPValidation = true
		}
		if row.Quantity == CanonicalRFQuantityReceivedPowerDBm && row.SuitableForValidation {
			quality.SuitableForReceivedPower = true
		}
		if row.Quantity == CanonicalRFQuantitySINRDB && row.SuitableForValidation {
			quality.SuitableForSINRValidation = true
		}
		if row.Quantity == CanonicalRFQuantityRSRQDB && row.SuitableForValidation {
			quality.SuitableForRSRQValidation = true
		}
	}
	quality.SuitableForCalibration = false
	if sourceType == Concept6A1SourceTypeSynthetic {
		quality.Notes = append(quality.Notes, "This is a controlled dry-run; it is not field evidence and is not a calibration study.")
	} else {
		quality.Notes = append(quality.Notes, "Concept 6A.1 reports uncalibrated validation readiness only; calibration_active remains false.")
	}
}

func EvaluateConcept6A1SignalCollector(ctx context.Context, raw []byte, manifest Concept6A1CampaignManifest, transmitterMap Concept6A1TransmitterMap, buildings *BuildingIndex) (Concept6A1CampaignEvaluation, error) {
	imported, err := ImportConcept6A1SignalCollector(raw, manifest, transmitterMap)
	if err != nil {
		return Concept6A1CampaignEvaluation{}, err
	}
	request := CanonicalRFValidationRequest{SchemaVersion: CanonicalRFValidationSchemaVersion, Dataset: imported.Dataset, Options: CanonicalRFValidationOptions{
		SchemaVersion: CanonicalRFValidationSchemaVersion, Buildings: buildings, BuildingsAvailable: buildings != nil, AllowGeographicCandidateMatch: false,
		Strategy:           CanonicalRFValidationStrategy{Method: "spatial_blocks", SpatialCellSizeM: CanonicalRFValidationDefaultCellM, MinimumSeparationM: CanonicalRFValidationDefaultSeparationM, PrimaryHoldout: true},
		IncludePredictions: true, CalibrationRequested: false, DeclaredScope: "concept-6a1-campaign-readiness",
	}}
	response, err := EvaluateCanonicalRFValidation(ctx, request)
	if err != nil {
		return Concept6A1CampaignEvaluation{}, err
	}
	Concept6A1ApplyValidationQuality(&imported.Quality, imported.Observations, response, manifest.SourceType)
	return Concept6A1CampaignEvaluation{Import: imported, Validation: response}, nil
}
