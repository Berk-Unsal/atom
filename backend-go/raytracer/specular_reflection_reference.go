package raytracer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

const (
	SpecularReflectionReferenceSchemaVersion = 1
	SpecularReflectionReferenceModelID       = "single_bounce_specular_reflection_reference_v1"
	SpecularReflectionReferenceModelVersion  = "v1"
	SpecularReflectionReferenceReadiness     = "reference_only"
	SpecularReflectionReferenceP2040Revision = MaterialReferenceRevision
	SpecularReflectionReferenceP525Revision  = "ITU-R P.525-5 (2024-11)"
)

const (
	SpecularReflectionStatusApplicable   = "applicable_reference"
	SpecularReflectionStatusQualified    = "qualified_reference"
	SpecularReflectionStatusInapplicable = "inapplicable"

	SpecularReflectionMaterialInterface = "interface"
	SpecularReflectionMaterialSlab      = "finite_slab"

	SpecularReflectionTerrainSurveyed = "surveyed_or_dataset_terrain"
	SpecularReflectionTerrainFlat     = "flat_ground_relative_datum"

	SpecularReflectionVisibilityVisible = "visible"
	SpecularReflectionVisibilityBlocked = "blocked"
	SpecularReflectionVisibilityUnknown = "unknown"
)

// SpecularReflectionVectorInput is a metric vector. It is intentionally kept
// separate from the geographic Point type so image geometry can never be
// accidentally performed in longitude/latitude degrees.
type SpecularReflectionVectorInput struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// SpecularReflectionPositionInput accepts either an explicit local ENU point
// (x/y/z or enu) or a WGS84 point (lon/lat plus z/height at the endpoint).
// coordinates is accepted as a compact [x,y,z] or [lon,lat,z] wire form.
type SpecularReflectionPositionInput struct {
	X           *float64                       `json:"x,omitempty"`
	Y           *float64                       `json:"y,omitempty"`
	Z           *float64                       `json:"z,omitempty"`
	Lon         *float64                       `json:"lon,omitempty"`
	Lat         *float64                       `json:"lat,omitempty"`
	Coordinates []float64                      `json:"coordinates,omitempty"`
	ENU         *SpecularReflectionVectorInput `json:"enu,omitempty"`
}

type SpecularReflectionFrameInput struct {
	Mode   string                           `json:"mode,omitempty"`
	Origin *SpecularReflectionPositionInput `json:"origin,omitempty"`
}

type SpecularReflectionAntennaInput struct {
	Mode                  string   `json:"mode"`
	AbsoluteGainDBi       *float64 `json:"absolute_gain_dbi,omitempty"`
	GainDBi               *float64 `json:"gain_dbi,omitempty"`
	PatternID             string   `json:"pattern_id,omitempty"`
	BoresightAzimuthDeg   *float64 `json:"boresight_azimuth_deg,omitempty"`
	BoresightElevationDeg *float64 `json:"boresight_elevation_deg,omitempty"`
	BeamWidthDeg          *float64 `json:"beam_width_deg,omitempty"`
	ApertureM             *float64 `json:"aperture_m,omitempty"`
	Assumption            string   `json:"assumption,omitempty"`
}

type SpecularReflectionEndpointInput struct {
	Position SpecularReflectionPositionInput `json:"position"`
	HeightM  *float64                        `json:"height_m,omitempty"`
	Antenna  *SpecularReflectionAntennaInput `json:"antenna"`
}

type SpecularReflectionPolygonContextInput struct {
	Vertices []SpecularReflectionPositionInput `json:"vertices"`
	Role     string                            `json:"role,omitempty"`
}

type SpecularReflectionFacadeInput struct {
	Start              SpecularReflectionPositionInput        `json:"start"`
	End                SpecularReflectionPositionInput        `json:"end"`
	SegmentStart       *SpecularReflectionPositionInput       `json:"segment_start,omitempty"`
	SegmentEnd         *SpecularReflectionPositionInput       `json:"segment_end,omitempty"`
	PlanePoint         *SpecularReflectionPositionInput       `json:"plane_point,omitempty"`
	OutwardNormal      *SpecularReflectionVectorInput         `json:"outward_normal,omitempty"`
	NormalProvenance   string                                 `json:"normal_provenance,omitempty"`
	GeometryProvenance string                                 `json:"geometry_provenance"`
	BaseZ              *float64                               `json:"base_z,omitempty"`
	TopZ               *float64                               `json:"top_z,omitempty"`
	HeightProvenance   string                                 `json:"height_provenance,omitempty"`
	ReflectingObjectID string                                 `json:"reflecting_object_id,omitempty"`
	PolygonContext     *SpecularReflectionPolygonContextInput `json:"polygon_context,omitempty"`
}

type SpecularReflectionLinkBudgetInput struct {
	PtConductedDBm         *float64 `json:"pt_conducted_dbm"`
	TxGainDBi              *float64 `json:"tx_gain_dbi,omitempty"`
	RxGainDBi              *float64 `json:"rx_gain_dbi,omitempty"`
	TxPatternAttenuationDB float64  `json:"tx_pattern_attenuation_db,omitempty"`
	RxPatternAttenuationDB float64  `json:"rx_pattern_attenuation_db,omitempty"`
	SystemLossDB           float64  `json:"system_loss_db,omitempty"`
	PolarizationLossDB     float64  `json:"polarization_loss_db,omitempty"`
	CalibrationDB          float64  `json:"calibration_db,omitempty"`
}

type SpecularReflectionMaterialInput struct {
	Mode                string                         `json:"mode,omitempty"`
	ReflectionMode      string                         `json:"reflection_mode,omitempty"`
	MaterialSource      string                         `json:"material_source"`
	MaterialID          string                         `json:"material_id,omitempty"`
	UserMaterial        *MaterialReferenceUserMaterial `json:"user_material,omitempty"`
	IncidentMedium      MaterialReferenceMedium        `json:"incident_medium"`
	ExitMedium          MaterialReferenceMedium        `json:"exit_medium"`
	ThicknessM          *float64                       `json:"thickness_m,omitempty"`
	ThicknessProvenance string                         `json:"thickness_provenance,omitempty"`
	PhaseCoherence      string                         `json:"phase_coherence,omitempty"`
	Provenance          string                         `json:"provenance,omitempty"`
}

type SpecularReflectionTerrainInput struct {
	Mode       string `json:"mode"`
	Provenance string `json:"provenance,omitempty"`
}

// SpecularReflectionObstacleInput is a diagnostics-only obstruction contract.
// It is also useful for controlled tests because it avoids pretending that a
// city-wide dataset is available for a synthetic local ENU fixture.
type SpecularReflectionObstacleInput struct {
	ID        string                            `json:"id"`
	Polygon   []SpecularReflectionPositionInput `json:"polygon"`
	BaseZ     *float64                          `json:"base_z"`
	TopZ      *float64                          `json:"top_z"`
	Reflector bool                              `json:"reflector,omitempty"`
}

type SpecularReflectionReferenceRequest struct {
	SchemaVersion   int                               `json:"schema_version"`
	FrequencyGHz    float64                           `json:"frequency_ghz"`
	CoordinateFrame SpecularReflectionFrameInput      `json:"coordinate_frame,omitempty"`
	Tx              SpecularReflectionEndpointInput   `json:"tx"`
	Rx              SpecularReflectionEndpointInput   `json:"rx"`
	Facade          SpecularReflectionFacadeInput     `json:"facade"`
	Material        SpecularReflectionMaterialInput   `json:"material"`
	Polarization    string                            `json:"polarization"`
	Terrain         SpecularReflectionTerrainInput    `json:"terrain"`
	LinkBudget      SpecularReflectionLinkBudgetInput `json:"link_budget"`
	RMSRoughnessM   *float64                          `json:"rms_roughness_m,omitempty"`
	Obstructions    []SpecularReflectionObstacleInput `json:"obstructions,omitempty"`
}

type SpecularReflectionENUPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type SpecularReflectionNormalOutput struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type SpecularReflectionGeographicOrigin struct {
	Lon float64 `json:"lon"`
	Lat float64 `json:"lat"`
	Z   float64 `json:"z"`
}

type SpecularReflectionLocalFrameOutput struct {
	CoordinateSystem     string                             `json:"coordinate_system"`
	Mode                 string                             `json:"mode"`
	Projection           string                             `json:"projection"`
	Origin               SpecularReflectionGeographicOrigin `json:"origin"`
	OriginENU            SpecularReflectionENUPoint         `json:"origin_enu"`
	OriginProvenance     string                             `json:"origin_provenance"`
	TransformDescription string                             `json:"transform_description"`
}

type SpecularReflectionBasisOutput struct {
	TE                   SpecularReflectionNormalOutput `json:"te"`
	TM                   SpecularReflectionNormalOutput `json:"tm"`
	NormalIncidenceBasis bool                           `json:"normal_incidence_basis"`
	Convention           string                         `json:"convention"`
	MagnitudesEquivalent bool                           `json:"magnitudes_equivalent"`
}

type SpecularReflectionGeometryOutput struct {
	LocalFrame               SpecularReflectionLocalFrameOutput `json:"local_frame"`
	TxENU                    SpecularReflectionENUPoint         `json:"tx_enu"`
	RxENU                    SpecularReflectionENUPoint         `json:"rx_enu"`
	FacadeStartENU           SpecularReflectionENUPoint         `json:"facade_start_enu"`
	FacadeEndENU             SpecularReflectionENUPoint         `json:"facade_end_enu"`
	PlanePointENU            SpecularReflectionENUPoint         `json:"plane_point_enu"`
	PlaneNormal              SpecularReflectionNormalOutput     `json:"plane_normal"`
	MirroredTxENU            *SpecularReflectionENUPoint        `json:"mirrored_tx_enu,omitempty"`
	ReflectionPointENU       *SpecularReflectionENUPoint        `json:"reflection_point_enu,omitempty"`
	ImageIntersectionT       *float64                           `json:"image_intersection_t,omitempty"`
	SegmentParameter         *float64                           `json:"segment_parameter,omitempty"`
	SegmentDistanceFromLineM *float64                           `json:"segment_distance_from_line_m,omitempty"`
	D1M                      *float64                           `json:"d1_m,omitempty"`
	D2M                      *float64                           `json:"d2_m,omitempty"`
	TotalPathLengthM         *float64                           `json:"total_reflected_path_length_m,omitempty"`
	ImagePathLengthM         *float64                           `json:"image_path_length_m,omitempty"`
	ImagePathDifferenceM     *float64                           `json:"image_path_difference_m,omitempty"`
	IncidenceAngleDeg        *float64                           `json:"incidence_angle_deg,omitempty"`
	ReflectionAngleDeg       *float64                           `json:"reflection_angle_deg,omitempty"`
	AngleConvention          string                             `json:"angle_convention"`
	SpecularEqualityError    *float64                           `json:"specular_equality_error,omitempty"`
	Basis                    *SpecularReflectionBasisOutput     `json:"te_tm_basis,omitempty"`
	VerticalExtentStatus     string                             `json:"vertical_extent_status"`
	BaseZ                    *float64                           `json:"base_z,omitempty"`
	TopZ                     *float64                           `json:"top_z,omitempty"`
}

type SpecularReflectionFacadeOutput struct {
	GeometryProvenance        string                             `json:"geometry_provenance"`
	NormalProvenance          string                             `json:"normal_provenance"`
	HeightProvenance          string                             `json:"height_provenance,omitempty"`
	BaseZ                     *float64                           `json:"base_z,omitempty"`
	TopZ                      *float64                           `json:"top_z,omitempty"`
	AvailableHorizontalLeftM  *float64                           `json:"available_horizontal_left_m,omitempty"`
	AvailableHorizontalRightM *float64                           `json:"available_horizontal_right_m,omitempty"`
	AvailableVerticalBelowM   *float64                           `json:"available_vertical_below_m,omitempty"`
	AvailableVerticalAboveM   *float64                           `json:"available_vertical_above_m,omitempty"`
	FresnelZoneScaleM         *float64                           `json:"fresnel_zone_scale_m,omitempty"`
	FiniteReflectorEvidence   string                             `json:"finite_reflector_evidence"`
	FacadeExtentKnown         bool                               `json:"facade_extent_known"`
	Roughness                 *SpecularReflectionRoughnessOutput `json:"roughness,omitempty"`
	DiffuseScatteringModelled bool                               `json:"diffuse_scattering_modelled"`
}

type SpecularReflectionRoughnessOutput struct {
	RMSRoughnessM          *float64 `json:"rms_roughness_m,omitempty"`
	RoughnessParameter     *float64 `json:"roughness_parameter,omitempty"`
	SmoothSurfaceCriterion string   `json:"smooth_surface_criterion"`
	SpecularityStatus      string   `json:"specularity_status"`
	SpecularityEvidence    string   `json:"specularity_evidence"`
}

type SpecularReflectionFresnelOutput struct {
	RadiusM                 float64 `json:"radius_m"`
	HorizontalExtentKnown   bool    `json:"horizontal_extent_known"`
	VerticalExtentKnown     bool    `json:"vertical_extent_known"`
	FiniteReflectorEvidence string  `json:"finite_reflector_evidence"`
}

type SpecularReflectionFarFieldOutput struct {
	Status              string   `json:"far_field_status"`
	TxApertureM         *float64 `json:"tx_aperture_m,omitempty"`
	RxApertureM         *float64 `json:"rx_aperture_m,omitempty"`
	TxFarFieldRangeM    *float64 `json:"tx_far_field_range_m,omitempty"`
	RxFarFieldRangeM    *float64 `json:"rx_far_field_range_m,omitempty"`
	TxComparedDistanceM *float64 `json:"tx_compared_distance_m,omitempty"`
	RxComparedDistanceM *float64 `json:"rx_compared_distance_m,omitempty"`
	WavelengthM         float64  `json:"wavelength_m"`
	Comparison          string   `json:"comparison"`
}

type SpecularReflectionEvidenceOutput struct {
	Fresnel  SpecularReflectionFresnelOutput  `json:"fresnel"`
	FarField SpecularReflectionFarFieldOutput `json:"far_field"`
}

type SpecularReflectionLegInterval struct {
	EntryT          float64 `json:"entry_t"`
	ExitT           float64 `json:"exit_t"`
	PositiveLength  bool    `json:"positive_length"`
	VerticalOverlap bool    `json:"vertical_overlap"`
}

type SpecularReflectionLegVisibility struct {
	Status            string                          `json:"status"`
	Evidence          string                          `json:"evidence"`
	BlockingObjectIDs []string                        `json:"blocking_object_ids,omitempty"`
	Reasons           []string                        `json:"reasons,omitempty"`
	Intervals         []SpecularReflectionLegInterval `json:"intervals,omitempty"`
}

type SpecularReflectionVisibilityOutput struct {
	TerrainStatus string                          `json:"terrain_status"`
	Leg1          SpecularReflectionLegVisibility `json:"leg1_visibility"`
	Leg2          SpecularReflectionLegVisibility `json:"leg2_visibility"`
}

type SpecularReflectionCoefficientOutput struct {
	Real             float64  `json:"real"`
	Imaginary        float64  `json:"imaginary"`
	Magnitude        float64  `json:"magnitude"`
	PhaseRad         float64  `json:"phase_rad"`
	PhaseDeg         float64  `json:"phase_deg"`
	PowerFraction    float64  `json:"power_fraction"`
	ReflectionLossDB *float64 `json:"reflection_loss_db,omitempty"`
}

type SpecularReflectionMaterialOutput struct {
	Mode                        string                               `json:"mode"`
	MaterialSource              string                               `json:"material_source"`
	MaterialID                  string                               `json:"material_id,omitempty"`
	Name                        string                               `json:"name,omitempty"`
	P2040Identity               string                               `json:"p2040_identity"`
	PropertySource              string                               `json:"property_source,omitempty"`
	Provenance                  string                               `json:"provenance,omitempty"`
	ThicknessM                  *float64                             `json:"thickness_m,omitempty"`
	ThicknessProvenance         string                               `json:"thickness_provenance,omitempty"`
	PhaseCoherence              string                               `json:"phase_coherence,omitempty"`
	ReflectionCoefficient       *SpecularReflectionCoefficientOutput `json:"reflection_coefficient,omitempty"`
	InterfaceCoefficient        *SpecularReflectionCoefficientOutput `json:"interface_coefficient,omitempty"`
	MultipleInternalReflections bool                                 `json:"multiple_internal_reflections_included"`
}

type SpecularReflectionAntennaOutput struct {
	Mode                     string   `json:"mode"`
	PatternID                string   `json:"pattern_id,omitempty"`
	AbsoluteGainDBi          float64  `json:"absolute_gain_dbi"`
	DepartureAzimuthDeg      *float64 `json:"departure_azimuth_deg,omitempty"`
	DepartureElevationDeg    *float64 `json:"departure_elevation_deg,omitempty"`
	ArrivalLookAzimuthDeg    *float64 `json:"arrival_look_azimuth_deg,omitempty"`
	ArrivalLookElevationDeg  *float64 `json:"arrival_look_elevation_deg,omitempty"`
	PatternAttenuationDB     float64  `json:"pattern_attenuation_db"`
	PatternEligible          bool     `json:"pattern_eligible"`
	PatternEligibilityReason string   `json:"pattern_eligibility_reason"`
	ApertureM                *float64 `json:"aperture_m,omitempty"`
}

type SpecularReflectionAntennasOutput struct {
	Tx SpecularReflectionAntennaOutput `json:"tx"`
	Rx SpecularReflectionAntennaOutput `json:"rx"`
}

type SpecularReflectionSpreadingOutput struct {
	WavelengthM           float64 `json:"wavelength_m"`
	TotalPathLengthM      float64 `json:"total_reflected_path_length_m"`
	FSPLReflectedPathDB   float64 `json:"fspl_reflected_path_db"`
	Formula               string  `json:"formula"`
	TwoLegFSPLComposition bool    `json:"two_leg_fspl_composition"`
}

type SpecularReflectionLinkBudgetOutput struct {
	PtConductedDBm                 float64  `json:"pt_conducted_dbm"`
	TxAbsoluteGainDBi              float64  `json:"tx_absolute_gain_dbi"`
	TxPatternAttenuationDB         float64  `json:"tx_pattern_attenuation_db"`
	RxAbsoluteGainDBi              float64  `json:"rx_absolute_gain_dbi"`
	RxPatternAttenuationDB         float64  `json:"rx_pattern_attenuation_db"`
	SystemLossDB                   float64  `json:"system_loss_db"`
	PolarizationLossDB             float64  `json:"polarization_loss_db"`
	CalibrationDB                  float64  `json:"calibration_db"`
	FSPLReflectedPathDB            float64  `json:"fspl_reflected_path_db"`
	ReflectionPowerTermDB          float64  `json:"reflection_power_term_db"`
	ReflectedPathReferencePowerDBm *float64 `json:"reflected_path_reference_power_dbm,omitempty"`
	Equation                       string   `json:"equation"`
}

type SpecularReflectionApplicability struct {
	Status         string   `json:"status"`
	Reasons        []string `json:"reasons,omitempty"`
	Qualifications []string `json:"qualifications,omitempty"`
}

type SpecularReflectionReferenceResponse struct {
	SchemaVersion                  int                                `json:"schema_version"`
	Model                          string                             `json:"model"`
	ModelID                        string                             `json:"model_id"`
	ModelVersion                   string                             `json:"model_version"`
	Readiness                      string                             `json:"readiness"`
	Promoted                       bool                               `json:"promoted"`
	ProductionCandidate            bool                               `json:"production_candidate"`
	Canonical                      bool                               `json:"canonical"`
	NetworkCoupled                 bool                               `json:"network_coupled"`
	MultipathCombined              bool                               `json:"multipath_combined"`
	CoherentMultipathCombined      bool                               `json:"coherent_multipath_combined"`
	Status                         string                             `json:"status"`
	Applicability                  SpecularReflectionApplicability    `json:"applicability"`
	Geometry                       SpecularReflectionGeometryOutput   `json:"geometry"`
	Facade                         SpecularReflectionFacadeOutput     `json:"facade"`
	Material                       SpecularReflectionMaterialOutput   `json:"material"`
	Visibility                     SpecularReflectionVisibilityOutput `json:"visibility"`
	Antennas                       SpecularReflectionAntennasOutput   `json:"antennas"`
	Spreading                      SpecularReflectionSpreadingOutput  `json:"spreading"`
	LinkBudget                     SpecularReflectionLinkBudgetOutput `json:"link_budget"`
	Evidence                       SpecularReflectionEvidenceOutput   `json:"evidence"`
	DiffuseScatteringModelled      bool                               `json:"diffuse_scattering_modelled"`
	AtmosphereCompositionSupported bool                               `json:"atmosphere_composition_supported"`
	DirectPathCalculated           bool                               `json:"direct_path_calculated"`
	Exclusions                     []string                           `json:"exclusions"`
	Assumptions                    []string                           `json:"assumptions"`
	Limitations                    []string                           `json:"limitations"`
	Fingerprint                    string                             `json:"fingerprint"`
}

func ValidateSpecularReflectionReferenceRequest(request SpecularReflectionReferenceRequest) string {
	if request.SchemaVersion != SpecularReflectionReferenceSchemaVersion {
		return fmt.Sprintf("schema_version must be %d", SpecularReflectionReferenceSchemaVersion)
	}
	if !finiteInRange(request.FrequencyGHz, 0.001, 450) {
		return "frequency_ghz must be finite and within 0.001–450 GHz"
	}
	if !oneOf(strings.ToUpper(strings.TrimSpace(request.Polarization)), MaterialPolarizationTE, MaterialPolarizationTM) {
		return "polarization must be TE or TM; generic H/V is not accepted"
	}
	if !reflectionPositionHasXY(request.Tx.Position) || !reflectionPositionHasXY(request.Rx.Position) {
		return "tx.position and rx.position must provide local ENU x/y or WGS84 lon/lat"
	}
	if !reflectionEndpointHasHeight(request.Tx) || !reflectionEndpointHasHeight(request.Rx) {
		return "tx and rx require an explicit height_m or position z"
	}
	if request.Tx.Antenna == nil || strings.TrimSpace(request.Tx.Antenna.Mode) == "" {
		return "tx.antenna.mode is required"
	}
	if request.Rx.Antenna == nil || strings.TrimSpace(request.Rx.Antenna.Mode) == "" {
		return "rx.antenna.mode is required"
	}
	if request.LinkBudget.PtConductedDBm == nil || !finiteFloat(*request.LinkBudget.PtConductedDBm) {
		return "link_budget.pt_conducted_dbm is required and must be finite"
	}
	for name, value := range map[string]float64{
		"link_budget.tx_pattern_attenuation_db": request.LinkBudget.TxPatternAttenuationDB,
		"link_budget.rx_pattern_attenuation_db": request.LinkBudget.RxPatternAttenuationDB,
		"link_budget.system_loss_db":            request.LinkBudget.SystemLossDB,
		"link_budget.polarization_loss_db":      request.LinkBudget.PolarizationLossDB,
		"link_budget.calibration_db":            request.LinkBudget.CalibrationDB,
	} {
		if !finiteFloat(value) {
			return name + " must be finite"
		}
	}
	if !reflectionPositionHasXY(request.Facade.Start) || !reflectionPositionHasXY(request.Facade.End) {
		return "facade.start and facade.end must provide local ENU x/y or WGS84 lon/lat"
	}
	if strings.TrimSpace(request.Facade.GeometryProvenance) == "" {
		return "facade.geometry_provenance is required"
	}
	if request.Facade.OutwardNormal == nil && (request.Facade.PolygonContext == nil || len(request.Facade.PolygonContext.Vertices) < 3) {
		return "facade.outward_normal or a polygon_context with at least three vertices is required"
	}
	if request.Facade.BaseZ != nil && !finiteFloat(*request.Facade.BaseZ) {
		return "facade.base_z must be finite"
	}
	if request.Facade.TopZ != nil && !finiteFloat(*request.Facade.TopZ) {
		return "facade.top_z must be finite"
	}
	if request.RMSRoughnessM != nil && (!finiteFloat(*request.RMSRoughnessM) || *request.RMSRoughnessM < 0) {
		return "rms_roughness_m must be finite and non-negative"
	}
	if validationError := validateSpecularReflectionAntenna(*request.Tx.Antenna, "tx.antenna", request.LinkBudget.TxGainDBi); validationError != "" {
		return validationError
	}
	if validationError := validateSpecularReflectionAntenna(*request.Rx.Antenna, "rx.antenna", request.LinkBudget.RxGainDBi); validationError != "" {
		return validationError
	}
	materialMode := request.Material.Mode
	if materialMode == "" {
		materialMode = request.Material.ReflectionMode
	}
	if !oneOf(materialMode, SpecularReflectionMaterialInterface, SpecularReflectionMaterialSlab) {
		return "material.mode must be interface or finite_slab"
	}
	if !oneOf(request.Material.MaterialSource, MaterialSourceP2040, MaterialSourceUser) {
		return "material.material_source must be p2040_reference or user_defined; no default material exists"
	}
	if request.Material.MaterialSource == MaterialSourceP2040 && strings.TrimSpace(request.Material.MaterialID) == "" {
		return "material.material_id is required for p2040_reference"
	}
	if request.Material.MaterialSource == MaterialSourceP2040 {
		knownMaterial := false
		for _, preset := range MaterialReferencePresetCatalog() {
			if preset.MaterialID == request.Material.MaterialID {
				knownMaterial = true
				break
			}
		}
		if !knownMaterial {
			return "material.material_id must identify a supported P.2040 Table 3 row"
		}
		if request.Material.UserMaterial != nil {
			return "material.user_material is not allowed for p2040_reference"
		}
	}
	if request.Material.MaterialSource == MaterialSourceUser && request.Material.UserMaterial == nil {
		return "material.user_material is required for user_defined"
	}
	if request.Material.MaterialSource == MaterialSourceUser {
		if validationError := validateUserMaterial(*request.Material.UserMaterial); validationError != "" {
			return "material." + validationError
		}
		if request.Material.UserMaterial.PropertySource == MaterialPropertySourceInferred {
			return "material.user_material.property_source inferred is not accepted; declare P.2040, measured, manufacturer, or user_declared properties"
		}
	}
	if validationError := validateMaterialReferenceMedium(request.Material.IncidentMedium, "material.incident_medium"); validationError != "" {
		return validationError
	}
	if validationError := validateMaterialReferenceMedium(request.Material.ExitMedium, "material.exit_medium"); validationError != "" {
		return validationError
	}
	if materialMode == SpecularReflectionMaterialSlab {
		if request.Material.ThicknessM == nil || !finiteInRange(*request.Material.ThicknessM, 0, 1000) {
			return "material.thickness_m is required and must be finite for finite_slab mode"
		}
		if !oneOf(strings.ToLower(strings.TrimSpace(request.Material.PhaseCoherence)), "coherent", "coherent_total_slab") {
			return "material.phase_coherence must explicitly request coherent or coherent_total_slab for finite_slab mode"
		}
	} else if request.Material.ThicknessM != nil && !finiteFloat(*request.Material.ThicknessM) {
		return "material.thickness_m must be finite when supplied"
	}
	if !oneOf(request.Terrain.Mode, SpecularReflectionTerrainSurveyed, SpecularReflectionTerrainFlat) {
		return "terrain.mode must be surveyed_or_dataset_terrain or flat_ground_relative_datum"
	}
	for index, obstacle := range request.Obstructions {
		if strings.TrimSpace(obstacle.ID) == "" {
			return fmt.Sprintf("obstructions[%d].id is required", index)
		}
		if len(obstacle.Polygon) < 3 {
			return fmt.Sprintf("obstructions[%d].polygon requires at least three points", index)
		}
		if obstacle.BaseZ == nil || obstacle.TopZ == nil || !finiteFloat(*obstacle.BaseZ) || !finiteFloat(*obstacle.TopZ) || *obstacle.TopZ < *obstacle.BaseZ {
			return fmt.Sprintf("obstructions[%d] requires finite base_z <= top_z", index)
		}
	}
	return ""
}

func validateSpecularReflectionAntenna(antenna SpecularReflectionAntennaInput, field string, gainFallback *float64) string {
	mode := strings.ToLower(strings.TrimSpace(antenna.Mode))
	if !oneOf(mode, "isotropic", "omni", "directional", "existing_4g1") {
		return field + ".mode must be isotropic, omni, directional, or existing_4g1"
	}
	gain, ok := specularReflectionAntennaGain(antenna)
	if !ok && gainFallback != nil {
		gain, ok = *gainFallback, true
	}
	if !ok || !finiteFloat(gain) {
		return field + ".absolute_gain_dbi is required and must be finite"
	}
	if antenna.ApertureM != nil && (!finiteFloat(*antenna.ApertureM) || *antenna.ApertureM <= 0) {
		return field + ".aperture_m must be finite and positive when supplied"
	}
	for name, value := range map[string]*float64{
		"boresight_azimuth_deg":   antenna.BoresightAzimuthDeg,
		"boresight_elevation_deg": antenna.BoresightElevationDeg,
		"beam_width_deg":          antenna.BeamWidthDeg,
	} {
		if value != nil && !finiteFloat(*value) {
			return field + "." + name + " must be finite"
		}
	}
	if antenna.BeamWidthDeg != nil && (*antenna.BeamWidthDeg <= 0 || *antenna.BeamWidthDeg > 360) {
		return field + ".beam_width_deg must be in (0, 360]"
	}
	if (mode == "directional" || mode == "existing_4g1") && (antenna.BoresightAzimuthDeg == nil || antenna.BoresightElevationDeg == nil) {
		return field + ".boresight_azimuth_deg and boresight_elevation_deg are required for directional modes"
	}
	return ""
}

func reflectionPositionHasXY(position SpecularReflectionPositionInput) bool {
	if position.ENU != nil && finiteFloat(position.ENU.X) && finiteFloat(position.ENU.Y) {
		return true
	}
	if position.X != nil && position.Y != nil && finiteFloat(*position.X) && finiteFloat(*position.Y) {
		return true
	}
	if position.Lon != nil && position.Lat != nil && finiteInRange(*position.Lon, -180, 180) && finiteInRange(*position.Lat, -90, 90) {
		return true
	}
	return len(position.Coordinates) >= 2 && finiteFloat(position.Coordinates[0]) && finiteFloat(position.Coordinates[1])
}

func reflectionPositionHasHeight(position SpecularReflectionPositionInput) bool {
	if position.ENU != nil && finiteFloat(position.ENU.Z) {
		return true
	}
	if position.Z != nil && finiteFloat(*position.Z) {
		return true
	}
	return len(position.Coordinates) >= 3 && finiteFloat(position.Coordinates[2])
}

func reflectionEndpointHasHeight(endpoint SpecularReflectionEndpointInput) bool {
	return (endpoint.HeightM != nil && finiteFloat(*endpoint.HeightM)) || reflectionPositionHasHeight(endpoint.Position)
}

func specularReflectionAntennaGain(antenna SpecularReflectionAntennaInput) (float64, bool) {
	if antenna.AbsoluteGainDBi != nil {
		return *antenna.AbsoluteGainDBi, true
	}
	if antenna.GainDBi != nil {
		return *antenna.GainDBi, true
	}
	return 0, false
}

func specularReflectionCoefficientOutput(value complex128) SpecularReflectionCoefficientOutput {
	power := cmplxAbsSquared(value)
	phase := math.Atan2(imag(value), real(value))
	var loss *float64
	if power > math.SmallestNonzeroFloat64 && finiteFloat(power) {
		candidate := -10 * math.Log10(power)
		if finiteFloat(candidate) {
			loss = &candidate
		}
	}
	return SpecularReflectionCoefficientOutput{
		Real: real(value), Imaginary: imag(value), Magnitude: math.Sqrt(power),
		PhaseRad: phase, PhaseDeg: phase * 180 / math.Pi, PowerFraction: power, ReflectionLossDB: loss,
	}
}

func cmplxAbsSquared(value complex128) float64 {
	return real(value)*real(value) + imag(value)*imag(value)
}

func specularReflectionFingerprint(request SpecularReflectionReferenceRequest) string {
	stable := struct {
		SchemaVersion   int                               `json:"schema_version"`
		ModelID         string                            `json:"model_id"`
		FrequencyGHz    float64                           `json:"frequency_ghz"`
		CoordinateFrame SpecularReflectionFrameInput      `json:"coordinate_frame"`
		Tx              SpecularReflectionEndpointInput   `json:"tx"`
		Rx              SpecularReflectionEndpointInput   `json:"rx"`
		Facade          SpecularReflectionFacadeInput     `json:"facade"`
		Material        SpecularReflectionMaterialInput   `json:"material"`
		Polarization    string                            `json:"polarization"`
		Terrain         SpecularReflectionTerrainInput    `json:"terrain"`
		LinkBudget      SpecularReflectionLinkBudgetInput `json:"link_budget"`
		RoughnessM      *float64                          `json:"rms_roughness_m,omitempty"`
		Obstructions    []SpecularReflectionObstacleInput `json:"obstructions,omitempty"`
	}{
		SpecularReflectionReferenceSchemaVersion, SpecularReflectionReferenceModelID, request.FrequencyGHz,
		request.CoordinateFrame, request.Tx, request.Rx, request.Facade, request.Material,
		strings.ToUpper(strings.TrimSpace(request.Polarization)), request.Terrain, request.LinkBudget,
		request.RMSRoughnessM, request.Obstructions,
	}
	encoded, _ := json.Marshal(stable)
	hash := sha256.Sum256(encoded)
	return "specular-reflection-reference-" + hex.EncodeToString(hash[:])
}
