package raytracer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/cmplx"
	"sort"
	"strings"
)

const (
	MaterialReferenceSchemaVersion = 1
	MaterialReferenceModelID       = "p2040_material_slab_reference_v1"
	MaterialReferenceModelVersion  = "v1"
	MaterialReferenceRevision      = "ITU-R P.2040-4 (2025-09)"
	MaterialReferenceURL           = "https://www.itu.int/rec/R-REC-P.2040-4-202509-I/en"
	MaterialReferencePDFURL        = "https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf"
	MaterialReferenceHeuristicDB   = 80.0
	MaterialReferenceNumericFloor  = "below_numeric_floor"
)

const (
	MaterialSourceP2040 = "p2040_reference"
	MaterialSourceUser  = "user_defined"

	MaterialPropertySourceP2040        = "p2040_reference"
	MaterialPropertySourceMeasured     = "measured"
	MaterialPropertySourceManufacturer = "manufacturer"
	MaterialPropertySourceUserDeclared = "user_declared"
	MaterialPropertySourceInferred     = "inferred"
	MaterialPropertySourceUnknown      = "unknown"

	MaterialPolarizationTE = "TE"
	MaterialPolarizationTM = "TM"

	MaterialReferenceStatusApplicable                  = "applicable"
	MaterialReferenceStatusMaterialFrequencyOutOfRange = "material_frequency_out_of_range"
	MaterialReferenceStatusBelowNumericFloor           = "below_numeric_floor"
	MaterialReferenceStatusPowerBalanceWarning         = "power_balance_warning"
)

// MaterialReferenceComplexInput uses a positive imaginary loss magnitude.
// The evaluator applies P.2040's exp(-jωt) convention as εr' - j εr”.
type MaterialReferenceComplexInput struct {
	Real          float64 `json:"real"`
	ImaginaryLoss float64 `json:"imaginary_loss"`
}

type MaterialReferenceUserMaterial struct {
	Name                        string                         `json:"name"`
	PropertySource              string                         `json:"property_source"`
	ReferenceTable              string                         `json:"reference_table,omitempty"`
	FrequencyRangeGHz           []float64                      `json:"frequency_range_ghz,omitempty"`
	RelativePermittivity        *float64                       `json:"relative_permittivity,omitempty"`
	ConductivitySPerM           *float64                       `json:"conductivity_s_per_m,omitempty"`
	LossTangent                 *float64                       `json:"loss_tangent,omitempty"`
	ComplexRelativePermittivity *MaterialReferenceComplexInput `json:"complex_relative_permittivity,omitempty"`
	ProvenanceNote              string                         `json:"provenance_note,omitempty"`
}

type MaterialReferenceMedium struct {
	Name                 string  `json:"name"`
	RelativePermittivity float64 `json:"relative_permittivity"`
	ConductivitySPerM    float64 `json:"conductivity_s_per_m"`
	PropertySource       string  `json:"property_source"`
	ProvenanceNote       string  `json:"provenance_note,omitempty"`
}

type MaterialReferenceGeometryContext struct {
	IncidenceAngleSource   string `json:"incidence_angle_source,omitempty"`
	FacadeNormalProvenance string `json:"facade_normal_provenance,omitempty"`
	IntersectionsDetected  int    `json:"intersections_detected,omitempty"`
	SelectedInteractionID  string `json:"selected_interaction_id,omitempty"`
}

type MaterialReferenceRequest struct {
	SchemaVersion       int                               `json:"schema_version"`
	FrequencyGHz        float64                           `json:"frequency_ghz"`
	MaterialSource      string                            `json:"material_source"`
	MaterialID          string                            `json:"material_id,omitempty"`
	UserMaterial        *MaterialReferenceUserMaterial    `json:"user_material,omitempty"`
	ThicknessM          *float64                          `json:"thickness_m"`
	ThicknessProvenance string                            `json:"thickness_provenance,omitempty"`
	IncidenceAngle      float64                           `json:"incidence_angle_deg"`
	Polarization        string                            `json:"polarization"`
	IncidentMedium      MaterialReferenceMedium           `json:"incident_medium"`
	ExitMedium          MaterialReferenceMedium           `json:"exit_medium"`
	GeometryContext     *MaterialReferenceGeometryContext `json:"geometry_context,omitempty"`
}

type MaterialReferenceCoefficientSet struct {
	A float64 `json:"a"`
	B float64 `json:"b"`
	C float64 `json:"c"`
	D float64 `json:"d"`
}

type MaterialReferencePreset struct {
	MaterialID        string                          `json:"material_id"`
	Name              string                          `json:"name"`
	ReferenceTable    string                          `json:"reference_table"`
	FrequencyRangeGHz [2]float64                      `json:"frequency_range_ghz"`
	Coefficients      MaterialReferenceCoefficientSet `json:"coefficients"`
	PropertySource    string                          `json:"property_source"`
}

// These are the Table 3 rows used by the reference evaluator. Duplicate
// material classes remain separate IDs so an overlapping or different
// frequency row can never be selected silently.
var p2040MaterialPresets = []MaterialReferencePreset{
	{MaterialID: "concrete_1_100", Name: "Concrete", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{1, 100}, Coefficients: MaterialReferenceCoefficientSet{A: 5.24, B: 0, C: 0.0462, D: 0.7822}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "concrete_110_330", Name: "Concrete", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{110, 330}, Coefficients: MaterialReferenceCoefficientSet{A: 5.17, B: 0, C: 0.0145, D: 1.09}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "brick_1_40", Name: "Brick", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{1, 40}, Coefficients: MaterialReferenceCoefficientSet{A: 3.91, B: 0, C: 0.0238, D: 0.16}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "brick_110_330", Name: "Brick", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{110, 330}, Coefficients: MaterialReferenceCoefficientSet{A: 4.15, B: 0, C: 0.0006, D: 1.5712}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "plasterboard_1_100", Name: "Plasterboard", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{1, 100}, Coefficients: MaterialReferenceCoefficientSet{A: 2.73, B: 0, C: 0.0085, D: 0.9395}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "plasterboard_110_330", Name: "Plasterboard", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{110, 330}, Coefficients: MaterialReferenceCoefficientSet{A: 2.56, B: 0, C: 0.0001, D: 1.7799}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "plasterboard_100_400", Name: "Plasterboard", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{100, 400}, Coefficients: MaterialReferenceCoefficientSet{A: 2.65, B: 0, C: 0.0002, D: 1.598}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "wood_0p001_100", Name: "Wood", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{0.001, 100}, Coefficients: MaterialReferenceCoefficientSet{A: 1.99, B: 0, C: 0.0047, D: 1.0718}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "wood_110_330", Name: "Wood", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{110, 330}, Coefficients: MaterialReferenceCoefficientSet{A: 1.82, B: 0, C: 0.004, D: 1.0761}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "wood_100_400", Name: "Wood", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{100, 400}, Coefficients: MaterialReferenceCoefficientSet{A: 2.1183, B: 0, C: 0.0055, D: 1.1113}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "glass_0p1_100", Name: "Glass", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{0.1, 100}, Coefficients: MaterialReferenceCoefficientSet{A: 6.31, B: 0, C: 0.0036, D: 1.3394}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "glass_220_450", Name: "Glass", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{220, 450}, Coefficients: MaterialReferenceCoefficientSet{A: 5.79, B: 0, C: 0.0004, D: 1.658}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "glass_100_400", Name: "Glass", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{100, 400}, Coefficients: MaterialReferenceCoefficientSet{A: 6.5767, B: 0, C: 0.0012, D: 1.4697}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "clear_acrylic_110_330", Name: "Clear acrylic", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{110, 330}, Coefficients: MaterialReferenceCoefficientSet{A: 2.58, B: 0, C: 0.0001, D: 1.6524}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "ceiling_board_1_100", Name: "Ceiling board", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{1, 100}, Coefficients: MaterialReferenceCoefficientSet{A: 1.48, B: 0, C: 0.0011, D: 1.075}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "ceiling_board_220_450", Name: "Ceiling board", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{220, 450}, Coefficients: MaterialReferenceCoefficientSet{A: 1.52, B: 0, C: 0.0029, D: 1.029}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "ceiling_board_100_400", Name: "Ceiling board", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{100, 400}, Coefficients: MaterialReferenceCoefficientSet{A: 1.2567, B: 0, C: 0.00013, D: 1.454}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "chipboard_1_100", Name: "Chipboard", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{1, 100}, Coefficients: MaterialReferenceCoefficientSet{A: 2.58, B: 0, C: 0.0217, D: 0.78}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "chipboard_100_200", Name: "Chipboard", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{100, 200}, Coefficients: MaterialReferenceCoefficientSet{A: 2.16, B: 0, C: 0.0023, D: 1.359}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "plywood_1_40", Name: "Plywood", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{1, 40}, Coefficients: MaterialReferenceCoefficientSet{A: 2.71, B: 0, C: 0.33, D: 0}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "plywood_110_330", Name: "Plywood", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{110, 330}, Coefficients: MaterialReferenceCoefficientSet{A: 1.94, B: 0, C: 0.0067, D: 0.9982}, PropertySource: MaterialPropertySourceP2040},
	{MaterialID: "plywood_100_400", Name: "Plywood", ReferenceTable: "Table 3", FrequencyRangeGHz: [2]float64{100, 400}, Coefficients: MaterialReferenceCoefficientSet{A: 2.17, B: 0, C: 0.0063, D: 1.045}, PropertySource: MaterialPropertySourceP2040},
}

type materialResolvedProperties struct {
	Name                        string
	MaterialID                  string
	Source                      string
	Classification              string
	PropertySource              string
	ReferenceTable              string
	FrequencyRangeGHz           [2]float64
	Coefficients                *MaterialReferenceCoefficientSet
	RelativePermittivity        float64
	ConductivitySPerM           float64
	LossTangent                 float64
	ImaginaryLoss               float64
	ComplexRelativePermittivity complex128
	ProvenanceNote              string
}

type MaterialReferenceComplexOutput struct {
	Real      float64 `json:"real"`
	Imaginary float64 `json:"imaginary"`
	Magnitude float64 `json:"magnitude"`
	PhaseDeg  float64 `json:"phase_deg"`
}

type MaterialReferenceCitation struct {
	Recommendation string   `json:"recommendation"`
	Revision       string   `json:"revision"`
	URL            string   `json:"url"`
	PDFURL         string   `json:"pdf_url"`
	Annex          string   `json:"annex"`
	Sections       []string `json:"sections"`
	Equations      []string `json:"equations"`
	Scope          string   `json:"scope"`
}

type MaterialReferenceMaterialOutput struct {
	MaterialID                  string                           `json:"material_id"`
	Name                        string                           `json:"name"`
	Source                      string                           `json:"source"`
	Classification              string                           `json:"classification"`
	PropertySource              string                           `json:"property_source"`
	ReferenceTable              string                           `json:"reference_table,omitempty"`
	FrequencyRangeGHz           [2]float64                       `json:"frequency_range_ghz,omitempty"`
	Coefficients                *MaterialReferenceCoefficientSet `json:"coefficients,omitempty"`
	RelativePermittivity        *float64                         `json:"relative_permittivity,omitempty"`
	ConductivitySPerM           *float64                         `json:"conductivity_s_per_m,omitempty"`
	LossTangent                 *float64                         `json:"loss_tangent,omitempty"`
	ComplexRelativePermittivity *MaterialReferenceComplexOutput  `json:"complex_relative_permittivity,omitempty"`
	ThicknessM                  float64                          `json:"thickness_m"`
	ThicknessProvenance         string                           `json:"thickness_provenance"`
	ProvenanceNote              string                           `json:"provenance_note,omitempty"`
}

type MaterialReferenceMediumOutput struct {
	Name                 string  `json:"name"`
	RelativePermittivity float64 `json:"relative_permittivity"`
	ConductivitySPerM    float64 `json:"conductivity_s_per_m"`
	PropertySource       string  `json:"property_source"`
}

type MaterialReferenceGeometryOutput struct {
	FrequencyGHz           float64 `json:"frequency_ghz"`
	WavelengthM            float64 `json:"wavelength_m"`
	IncidenceAngleDeg      float64 `json:"incidence_angle_deg"`
	IncidenceAngleSource   string  `json:"incidence_angle_source"`
	AngleConvention        string  `json:"angle_convention"`
	Polarization           string  `json:"polarization"`
	FacadeNormalProvenance string  `json:"facade_normal_provenance"`
	GeometryMode           string  `json:"geometry_mode"`
}

type MaterialReferenceMediumAngles struct {
	IncidentDeg float64 `json:"incident_deg"`
	SlabDeg     float64 `json:"slab_deg"`
	ExitDeg     float64 `json:"exit_deg"`
}

type MaterialReferenceSlabLedger struct {
	ReflectionCoefficient               *MaterialReferenceComplexOutput `json:"reflection_coefficient,omitempty"`
	TransmissionCoefficient             *MaterialReferenceComplexOutput `json:"transmission_coefficient,omitempty"`
	FirstInterfaceReflectionCoefficient *MaterialReferenceComplexOutput `json:"first_interface_reflection_coefficient,omitempty"`
	InterfaceReflectionPowerFraction    float64                         `json:"interface_reflection_power_fraction"`
	ReflectedPowerFraction              float64                         `json:"reflected_power_fraction"`
	TransmittedPowerFraction            *float64                        `json:"transmitted_power_fraction,omitempty"`
	AbsorbedPowerFraction               *float64                        `json:"absorbed_power_fraction,omitempty"`
	PowerFluxCorrection                 float64                         `json:"power_flux_correction"`
	TransmissionLossDB                  *float64                        `json:"transmission_loss_db,omitempty"`
	LowerBoundTransmissionLossDB        *float64                        `json:"lower_bound_transmission_loss_db,omitempty"`
	NumericState                        string                          `json:"numeric_state"`
	MultipleInternalReflectionsIncluded bool                            `json:"multiple_internal_reflections_included"`
	Angles                              MaterialReferenceMediumAngles   `json:"angles"`
	PropagationConstant                 *MaterialReferenceComplexOutput `json:"propagation_constant,omitempty"`
	NormalPhaseThickness                *MaterialReferenceComplexOutput `json:"normal_phase_thickness,omitempty"`
}

type MaterialReferenceApplicability struct {
	Status                 string     `json:"status"`
	Reasons                []string   `json:"reasons,omitempty"`
	FrequencyRangeGHz      [2]float64 `json:"frequency_range_ghz,omitempty"`
	AngleRangeDeg          [2]float64 `json:"angle_range_deg"`
	SupportedPolarizations []string   `json:"supported_polarizations"`
}

type MaterialReferenceComparison struct {
	HistoricalResearchHeuristicDB    float64  `json:"historical_research_heuristic_db"`
	SlabTransmissionLossDB           *float64 `json:"slab_transmission_loss_db,omitempty"`
	SlabLowerBoundTransmissionLossDB *float64 `json:"slab_lower_bound_transmission_loss_db,omitempty"`
	DifferenceFromHeuristicDB        *float64 `json:"difference_from_heuristic_db,omitempty"`
	Combined                         bool     `json:"combined"`
	Interpretation                   string   `json:"interpretation"`
}

type MaterialReferenceResponse struct {
	SchemaVersion int                             `json:"schema_version"`
	ModelID       string                          `json:"model_id"`
	ModelVersion  string                          `json:"model_version"`
	Status        string                          `json:"status"`
	Readiness     string                          `json:"readiness"`
	Promoted      bool                            `json:"promoted"`
	Reference     MaterialReferenceCitation       `json:"reference"`
	Material      MaterialReferenceMaterialOutput `json:"material"`
	Geometry      MaterialReferenceGeometryOutput `json:"geometry"`
	Media         struct {
		Incident MaterialReferenceMediumOutput `json:"incident"`
		Exit     MaterialReferenceMediumOutput `json:"exit"`
	} `json:"media"`
	Applicability      MaterialReferenceApplicability `json:"applicability"`
	Ledger             *MaterialReferenceSlabLedger   `json:"ledger,omitempty"`
	Comparison         MaterialReferenceComparison    `json:"comparison"`
	PropertyProvenance map[string]string              `json:"property_provenance"`
	Fingerprint        string                         `json:"fingerprint"`
	Assumptions        []string                       `json:"assumptions"`
	Limitations        []string                       `json:"limitations"`
}

func MaterialReferencePresetCatalog() []MaterialReferencePreset {
	result := append([]MaterialReferencePreset(nil), p2040MaterialPresets...)
	return result
}

func MaterialReferenceCitationInfo() MaterialReferenceCitation {
	return MaterialReferenceCitation{
		Recommendation: "ITU-R P.2040-4",
		Revision:       MaterialReferenceRevision,
		URL:            MaterialReferenceURL,
		PDFURL:         MaterialReferencePDFURL,
		Annex:          "Annex 1",
		Sections:       []string{"§2.1.2", "§2.1.4", "§2.2.1", "§2.2.2.1", "§2.2.2.2", "§3, Table 3"},
		Equations:      []string{"(9)–(16)", "(28)–(29)", "(31)–(38)", "(39)–(44)", "(57)–(59)"},
		Scope:          "Plane-wave interface and homogeneous finite-slab reference for non-magnetic isotropic media; not a building-entry or urban propagation model.",
	}
}

func ValidateMaterialReferenceRequest(request MaterialReferenceRequest) string {
	if request.SchemaVersion != MaterialReferenceSchemaVersion {
		return fmt.Sprintf("schema_version must be %d", MaterialReferenceSchemaVersion)
	}
	if !finiteInRange(request.FrequencyGHz, 0.001, 450) {
		return "frequency_ghz must be finite and within 0.001–450 GHz"
	}
	if !oneOf(request.MaterialSource, MaterialSourceP2040, MaterialSourceUser) {
		return "material_source must be p2040_reference or user_defined"
	}
	if request.ThicknessM == nil || !finiteInRange(*request.ThicknessM, 0, 1000) {
		return "thickness_m must be finite and within 0–1000 m"
	}
	if request.ThicknessProvenance != "" && !oneOf(request.ThicknessProvenance, "user_declared", "controlled_reference_fixture") {
		return "thickness_provenance must be user_declared or controlled_reference_fixture"
	}
	if !finiteInRange(request.IncidenceAngle, 0, 89.999999) {
		return "incidence_angle_deg must be finite and in [0, 89.999999]"
	}
	if !oneOf(request.Polarization, MaterialPolarizationTE, MaterialPolarizationTM) {
		return "polarization must be TE or TM"
	}
	if validationError := validateMaterialReferenceMedium(request.IncidentMedium, "incident_medium"); validationError != "" {
		return validationError
	}
	if validationError := validateMaterialReferenceMedium(request.ExitMedium, "exit_medium"); validationError != "" {
		return validationError
	}
	if request.MaterialSource == MaterialSourceP2040 {
		if request.MaterialID == "" {
			return "material_id is required for p2040_reference"
		}
		if request.UserMaterial != nil {
			return "user_material is not allowed for p2040_reference"
		}
	} else {
		if request.UserMaterial == nil {
			return "user_material is required for user_defined"
		}
		if validationError := validateUserMaterial(*request.UserMaterial); validationError != "" {
			return validationError
		}
	}
	if request.GeometryContext != nil {
		source := request.GeometryContext.IncidenceAngleSource
		if source != "" && !oneOf(source, "user_declared", "geometry_derived") {
			return "geometry_context.incidence_angle_source must be user_declared or geometry_derived"
		}
		if source == "geometry_derived" && (strings.TrimSpace(request.GeometryContext.FacadeNormalProvenance) == "" || request.GeometryContext.FacadeNormalProvenance == "unknown") {
			return "geometry-derived incidence angle requires a reliable facade normal provenance"
		}
		if request.GeometryContext.IntersectionsDetected < 0 {
			return "geometry_context.intersections_detected must be non-negative"
		}
	}
	return ""
}

func validateMaterialReferenceMedium(medium MaterialReferenceMedium, field string) string {
	if strings.TrimSpace(medium.Name) == "" {
		return field + ".name is required"
	}
	if !finiteInRange(medium.RelativePermittivity, 0.000001, 1e9) {
		return field + ".relative_permittivity must be finite and positive"
	}
	if !finiteInRange(medium.ConductivitySPerM, 0, 1e12) {
		return field + ".conductivity_s_per_m must be finite and non-negative"
	}
	if !validMaterialPropertySource(medium.PropertySource) {
		return field + ".property_source is unsupported"
	}
	return ""
}

func validateUserMaterial(material MaterialReferenceUserMaterial) string {
	if strings.TrimSpace(material.Name) == "" {
		return "user_material.name is required"
	}
	if !validMaterialPropertySource(material.PropertySource) {
		return "user_material.property_source is unsupported"
	}
	if len(material.FrequencyRangeGHz) != 0 {
		if len(material.FrequencyRangeGHz) != 2 || !finiteInRange(material.FrequencyRangeGHz[0], 0.001, 450) || !finiteInRange(material.FrequencyRangeGHz[1], 0.001, 450) || material.FrequencyRangeGHz[0] > material.FrequencyRangeGHz[1] {
			return "user_material.frequency_range_ghz must be a valid two-value range"
		}
	}
	propertyForms := 0
	if material.ComplexRelativePermittivity != nil {
		propertyForms++
	}
	if material.RelativePermittivity != nil || material.ConductivitySPerM != nil || material.LossTangent != nil {
		propertyForms++
	}
	if propertyForms != 1 {
		return "user_material must provide exactly one electrical-property form"
	}
	if material.ComplexRelativePermittivity != nil {
		value := material.ComplexRelativePermittivity
		if !finiteInRange(value.Real, 0.000001, 1e9) || !finiteInRange(value.ImaginaryLoss, 0, 1e9) {
			return "user_material.complex_relative_permittivity is invalid"
		}
		return ""
	}
	if material.RelativePermittivity == nil || !finiteInRange(*material.RelativePermittivity, 0.000001, 1e9) {
		return "user_material.relative_permittivity is required and must be positive"
	}
	if material.ConductivitySPerM != nil && material.LossTangent != nil {
		return "user_material cannot provide both conductivity_s_per_m and loss_tangent"
	}
	if material.ConductivitySPerM == nil && material.LossTangent == nil {
		return "user_material must provide conductivity_s_per_m or loss_tangent explicitly"
	}
	if material.ConductivitySPerM != nil && !finiteInRange(*material.ConductivitySPerM, 0, 1e12) {
		return "user_material.conductivity_s_per_m is invalid"
	}
	if material.LossTangent != nil && !finiteInRange(*material.LossTangent, 0, 1e9) {
		return "user_material.loss_tangent is invalid"
	}
	return ""
}

func validMaterialPropertySource(value string) bool {
	return oneOf(value, MaterialPropertySourceP2040, MaterialPropertySourceMeasured, MaterialPropertySourceManufacturer, MaterialPropertySourceUserDeclared, MaterialPropertySourceInferred, MaterialPropertySourceUnknown)
}

func resolveMaterialReferenceProperties(request MaterialReferenceRequest) (materialResolvedProperties, string, error) {
	if request.MaterialSource == MaterialSourceP2040 {
		var preset *MaterialReferencePreset
		for index := range p2040MaterialPresets {
			if p2040MaterialPresets[index].MaterialID == request.MaterialID {
				preset = &p2040MaterialPresets[index]
				break
			}
		}
		if preset == nil {
			return materialResolvedProperties{}, "", fmt.Errorf("material_id %q is not a supported P.2040 Table 3 row", request.MaterialID)
		}
		resolved := materialResolvedProperties{
			Name: preset.Name, MaterialID: preset.MaterialID, Source: MaterialSourceP2040, Classification: "reference_material",
			PropertySource: preset.PropertySource, ReferenceTable: preset.ReferenceTable, FrequencyRangeGHz: preset.FrequencyRangeGHz,
			Coefficients: &preset.Coefficients,
		}
		if request.FrequencyGHz < preset.FrequencyRangeGHz[0] || request.FrequencyGHz > preset.FrequencyRangeGHz[1] {
			return resolved, MaterialReferenceStatusMaterialFrequencyOutOfRange, nil
		}
		resolved.RelativePermittivity = preset.Coefficients.A * math.Pow(request.FrequencyGHz, preset.Coefficients.B)
		resolved.ConductivitySPerM = preset.Coefficients.C * math.Pow(request.FrequencyGHz, preset.Coefficients.D)
		resolved.ImaginaryLoss = 17.98 * resolved.ConductivitySPerM / request.FrequencyGHz
		resolved.LossTangent = resolved.ImaginaryLoss / resolved.RelativePermittivity
		resolved.ComplexRelativePermittivity = complex(resolved.RelativePermittivity, -resolved.ImaginaryLoss)
		resolved.ProvenanceNote = "P.2040-4 Table 3 row; εr' and σ derived from equations (57)–(59) without extrapolation."
		return resolved, MaterialReferenceStatusApplicable, nil
	}

	user := request.UserMaterial
	resolved := materialResolvedProperties{
		Name: user.Name, MaterialID: "user_assumption", Source: MaterialSourceUser, Classification: "user_assumption",
		PropertySource: user.PropertySource, ReferenceTable: user.ReferenceTable, ProvenanceNote: user.ProvenanceNote,
	}
	if len(user.FrequencyRangeGHz) == 2 {
		resolved.FrequencyRangeGHz = [2]float64{user.FrequencyRangeGHz[0], user.FrequencyRangeGHz[1]}
		if request.FrequencyGHz < resolved.FrequencyRangeGHz[0] || request.FrequencyGHz > resolved.FrequencyRangeGHz[1] {
			return resolved, MaterialReferenceStatusMaterialFrequencyOutOfRange, nil
		}
	}
	if user.ComplexRelativePermittivity != nil {
		resolved.RelativePermittivity = user.ComplexRelativePermittivity.Real
		resolved.ImaginaryLoss = user.ComplexRelativePermittivity.ImaginaryLoss
		resolved.ConductivitySPerM = resolved.ImaginaryLoss * request.FrequencyGHz / 17.98
		resolved.LossTangent = resolved.ImaginaryLoss / resolved.RelativePermittivity
	} else {
		resolved.RelativePermittivity = *user.RelativePermittivity
		switch {
		case user.ConductivitySPerM != nil:
			resolved.ConductivitySPerM = *user.ConductivitySPerM
			resolved.ImaginaryLoss = 17.98 * resolved.ConductivitySPerM / request.FrequencyGHz
			resolved.LossTangent = resolved.ImaginaryLoss / resolved.RelativePermittivity
		case user.LossTangent != nil:
			resolved.LossTangent = *user.LossTangent
			resolved.ImaginaryLoss = resolved.RelativePermittivity * resolved.LossTangent
			resolved.ConductivitySPerM = 0.05563 * resolved.RelativePermittivity * resolved.LossTangent * request.FrequencyGHz
		}
	}
	resolved.ComplexRelativePermittivity = complex(resolved.RelativePermittivity, -resolved.ImaginaryLoss)
	return resolved, MaterialReferenceStatusApplicable, nil
}

func materialReferenceOutputProperties(properties materialResolvedProperties, thickness float64) MaterialReferenceMaterialOutput {
	output := MaterialReferenceMaterialOutput{
		MaterialID: properties.MaterialID, Name: properties.Name, Source: properties.Source, Classification: properties.Classification,
		PropertySource: properties.PropertySource, ReferenceTable: properties.ReferenceTable, FrequencyRangeGHz: properties.FrequencyRangeGHz,
		ThicknessM: thickness, ThicknessProvenance: "user_declared", ProvenanceNote: properties.ProvenanceNote,
	}
	if properties.Coefficients != nil {
		coefficients := *properties.Coefficients
		output.Coefficients = &coefficients
	}
	if properties.RelativePermittivity > 0 {
		relativePermittivity := properties.RelativePermittivity
		conductivity := properties.ConductivitySPerM
		lossTangent := properties.LossTangent
		output.RelativePermittivity = &relativePermittivity
		output.ConductivitySPerM = &conductivity
		output.LossTangent = &lossTangent
	}
	complexOutput := materialReferenceComplexOutput(properties.ComplexRelativePermittivity)
	if properties.RelativePermittivity > 0 {
		output.ComplexRelativePermittivity = &complexOutput
	}
	return output
}

func materialReferenceComplexOutput(value complex128) MaterialReferenceComplexOutput {
	return MaterialReferenceComplexOutput{Real: real(value), Imaginary: imag(value), Magnitude: cmplx.Abs(value), PhaseDeg: math.Atan2(imag(value), real(value)) * 180 / math.Pi}
}

func materialReferenceMediumComplex(medium MaterialReferenceMedium, frequencyGHz float64) complex128 {
	return complex(medium.RelativePermittivity, -17.98*medium.ConductivitySPerM/frequencyGHz)
}

func materialReferenceFingerprint(request MaterialReferenceRequest) string {
	property := request.UserMaterial
	type stableRequest struct {
		SchemaVersion       int                               `json:"schema_version"`
		ModelID             string                            `json:"model_id"`
		Revision            string                            `json:"revision"`
		FrequencyGHz        float64                           `json:"frequency_ghz"`
		MaterialSource      string                            `json:"material_source"`
		MaterialID          string                            `json:"material_id"`
		UserMaterial        *MaterialReferenceUserMaterial    `json:"user_material,omitempty"`
		ThicknessM          float64                           `json:"thickness_m"`
		ThicknessProvenance string                            `json:"thickness_provenance"`
		AngleDeg            float64                           `json:"incidence_angle_deg"`
		Polarization        string                            `json:"polarization"`
		IncidentMedium      MaterialReferenceMedium           `json:"incident_medium"`
		ExitMedium          MaterialReferenceMedium           `json:"exit_medium"`
		Geometry            *MaterialReferenceGeometryContext `json:"geometry_context,omitempty"`
	}
	payload := stableRequest{MaterialReferenceSchemaVersion, MaterialReferenceModelID, MaterialReferenceRevision, request.FrequencyGHz, request.MaterialSource, request.MaterialID, property, *request.ThicknessM, request.ThicknessProvenance, request.IncidenceAngle, request.Polarization, request.IncidentMedium, request.ExitMedium, request.GeometryContext}
	encoded, _ := json.Marshal(payload)
	hash := sha256.Sum256(encoded)
	return "material-reference-" + hex.EncodeToString(hash[:])
}

func materialReferenceComplexFinite(value complex128) bool {
	return finiteFloat(real(value)) && finiteFloat(imag(value))
}

func finiteFloat(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func materialReferenceSortedPresetIDs() []string {
	ids := make([]string, 0, len(p2040MaterialPresets))
	for _, preset := range p2040MaterialPresets {
		ids = append(ids, preset.MaterialID)
	}
	sort.Strings(ids)
	return ids
}

// Keep the context parameter in the exported evaluator contract so a future
// geometry-backed facade adapter can be cancelled like the other RF tools.
var errMaterialReferenceContext = errors.New("material reference evaluation cancelled")

func checkMaterialReferenceContext(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return errors.Join(errMaterialReferenceContext, ctx.Err())
	default:
		return nil
	}
}
