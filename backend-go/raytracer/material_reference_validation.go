package raytracer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

// MaterialCharacterizationRecord is a deliberately separate adapter contract
// for a measured coupon/slab result. It is not a MeasurementCampaign and is
// never mixed into propagation-model RMSE, radio quality, or readiness gates.
type MaterialCharacterizationRecord struct {
	SchemaVersion              int                      `json:"schema_version"`
	RecordID                   string                   `json:"record_id"`
	MaterialRequest            MaterialReferenceRequest `json:"material_request"`
	MeasuredTransmissionLossDB float64                  `json:"measured_transmission_loss_db"`
	MeasuredPowerFraction      *float64                 `json:"measured_power_fraction,omitempty"`
	MeasurementSource          string                   `json:"measurement_source"`
	MeasurementProvenance      string                   `json:"measurement_provenance"`
	MeasurementNotes           []string                 `json:"measurement_notes,omitempty"`
}

type MaterialReferenceValidationResult struct {
	SchemaVersion               int      `json:"schema_version"`
	RecordID                    string   `json:"record_id"`
	ModelID                     string   `json:"model_id"`
	ModelVersion                string   `json:"model_version"`
	Status                      string   `json:"status"`
	MeasuredTransmissionLossDB  float64  `json:"measured_transmission_loss_db"`
	PredictedTransmissionLossDB *float64 `json:"predicted_transmission_loss_db,omitempty"`
	ResidualDB                  *float64 `json:"residual_db,omitempty"`
	MeasurementSource           string   `json:"measurement_source"`
	MeasurementProvenance       string   `json:"measurement_provenance"`
	Readiness                   string   `json:"readiness"`
	Promoted                    bool     `json:"promoted"`
	Fingerprint                 string   `json:"fingerprint"`
	Reference                   string   `json:"reference"`
	Assumptions                 []string `json:"assumptions"`
	Limitations                 []string `json:"limitations"`
}

func ValidateMaterialCharacterizationRecord(record MaterialCharacterizationRecord) string {
	if record.SchemaVersion != MaterialReferenceSchemaVersion {
		return fmt.Sprintf("schema_version must be %d", MaterialReferenceSchemaVersion)
	}
	if strings.TrimSpace(record.RecordID) == "" {
		return "record_id is required"
	}
	if !finiteFloat(record.MeasuredTransmissionLossDB) || record.MeasuredTransmissionLossDB < 0 {
		return "measured_transmission_loss_db must be finite and non-negative"
	}
	if record.MeasuredPowerFraction != nil && (!finiteFloat(*record.MeasuredPowerFraction) || *record.MeasuredPowerFraction < 0 || *record.MeasuredPowerFraction > 1) {
		return "measured_power_fraction must be finite and in [0, 1]"
	}
	if strings.TrimSpace(record.MeasurementSource) == "" {
		return "measurement_source is required"
	}
	if strings.TrimSpace(record.MeasurementProvenance) == "" {
		return "measurement_provenance is required"
	}
	if validationError := ValidateMaterialReferenceRequest(record.MaterialRequest); validationError != "" {
		return "material_request: " + validationError
	}
	return ""
}

func EvaluateP2040MaterialCharacterizationRecord(ctx context.Context, record MaterialCharacterizationRecord) (MaterialReferenceValidationResult, error) {
	if validationError := ValidateMaterialCharacterizationRecord(record); validationError != "" {
		return MaterialReferenceValidationResult{}, fmt.Errorf("material characterization: %s", validationError)
	}
	reference, err := EvaluateMaterialReferenceContext(ctx, record.MaterialRequest)
	if err != nil {
		return MaterialReferenceValidationResult{}, err
	}
	result := MaterialReferenceValidationResult{
		SchemaVersion:              MaterialReferenceSchemaVersion,
		RecordID:                   record.RecordID,
		ModelID:                    MaterialReferenceModelID,
		ModelVersion:               MaterialReferenceModelVersion,
		Status:                     reference.Status,
		MeasuredTransmissionLossDB: record.MeasuredTransmissionLossDB,
		MeasurementSource:          record.MeasurementSource,
		MeasurementProvenance:      record.MeasurementProvenance,
		Readiness:                  "reference_only",
		Promoted:                   false,
		Fingerprint:                materialCharacterizationFingerprint(record, reference.Fingerprint),
		Reference:                  MaterialReferenceRevision,
		Assumptions: []string{
			"The record is a declared material/slab characterization result, not a propagation campaign sample.",
			"Residual is measured transmission loss minus the isolated P.2040 slab reference loss.",
		},
		Limitations: []string{
			"No material characterization result is promoted into canonical propagation, research_sub_thz, radio quality, or optimizer behavior.",
			"Measured values remain user-supplied evidence; no campaign or fabricated measurement is created by this adapter.",
		},
	}
	if reference.Ledger == nil || reference.Ledger.TransmissionLossDB == nil {
		return result, nil
	}
	predicted := *reference.Ledger.TransmissionLossDB
	residual := record.MeasuredTransmissionLossDB - predicted
	result.PredictedTransmissionLossDB = &predicted
	result.ResidualDB = &residual
	return result, nil
}

func materialCharacterizationFingerprint(record MaterialCharacterizationRecord, referenceFingerprint string) string {
	type stableRecord struct {
		SchemaVersion              int      `json:"schema_version"`
		ModelID                    string   `json:"model_id"`
		ReferenceFingerprint       string   `json:"reference_fingerprint"`
		RecordID                   string   `json:"record_id"`
		MeasuredTransmissionLossDB float64  `json:"measured_transmission_loss_db"`
		MeasuredPowerFraction      *float64 `json:"measured_power_fraction,omitempty"`
		MeasurementSource          string   `json:"measurement_source"`
		MeasurementProvenance      string   `json:"measurement_provenance"`
	}
	payload := stableRecord{MaterialReferenceSchemaVersion, MaterialReferenceModelID, referenceFingerprint, record.RecordID, record.MeasuredTransmissionLossDB, record.MeasuredPowerFraction, record.MeasurementSource, record.MeasurementProvenance}
	encoded, _ := json.Marshal(payload)
	hash := sha256.Sum256(encoded)
	return "material-characterization-" + hex.EncodeToString(hash[:])
}
