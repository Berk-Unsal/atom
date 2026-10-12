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
	SubTHZAtmosphericReferenceModelID         = "sub_thz_atmospheric_reference_v1"
	SubTHZAtmosphericReferenceDescription     = "Opt-in, non-canonical terrestrial atmospheric reference ledger using P.525-5, P.676-13, P.838-3, and local-fog P.840-9 terms"
	SubTHZAtmosphericReferenceFrequencyMinGHz = 1.0
	SubTHZAtmosphericReferenceFrequencyMaxGHz = 1000.0
	MaxSubTHZReferenceDistanceM               = 100000.0
	P5255Reference                            = "ITU-R P.525-5"
	P67613Reference                           = "ITU-R P.676-13"
	P8383Reference                            = "ITU-R P.838-3"
	P8409Reference                            = "ITU-R P.840-9"
	P8378Reference                            = "ITU-R P.837-8"
	P5255ReferenceURL                         = "https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.525-5-202411-I!!PDF-E.pdf"
	P67613ReferenceURL                        = "https://www.itu.int/rec/R-REC-P.676-13-202208-I/en"
	P8383ReferenceURL                         = "https://www.itu.int/rec/R-REC-P.838-3-200503-I/en"
	P8409ReferenceURL                         = "https://www.itu.int/rec/R-REC-P.840-9-202308-I/en"
	P8378ReferenceURL                         = "https://www.itu.int/rec/R-REC-P.837-8-201707-I/en"
)

// SubTHZReferencePointInput deliberately carries height in the reference
// request. The path-profile endpoint has its own RF profile defaults; this
// endpoint must not inherit those defaults silently.
type SubTHZReferencePointInput struct {
	Lon     *float64 `json:"lon"`
	Lat     *float64 `json:"lat"`
	HeightM *float64 `json:"height_m"`
}

type SubTHZReferenceAtmosphereInput struct {
	Enabled               *bool    `json:"enabled"`
	PressureHPA           *float64 `json:"pressure_hpa"`
	TemperatureK          *float64 `json:"temperature_k"`
	WaterVapourDensityGM3 *float64 `json:"water_vapour_density_g_m3"`
}

type SubTHZReferenceRainInput struct {
	Enabled             *bool    `json:"enabled"`
	RainRateMMH         *float64 `json:"rain_rate_mm_h"`
	Polarization        string   `json:"polarization"`
	PolarizationTiltDeg *float64 `json:"polarization_tilt_deg"`
}

type SubTHZReferenceLocalFogInput struct {
	Enabled               *bool    `json:"enabled"`
	LiquidWaterDensityGM3 *float64 `json:"liquid_water_density_g_m3"`
	TemperatureK          *float64 `json:"temperature_k"`
}

type SubTHZReferenceLinkBudgetInput struct {
	ConductedTxPowerDBm    *float64 `json:"conducted_tx_power_dbm"`
	TxGainDBi              *float64 `json:"tx_gain_dbi"`
	RxGainDBi              *float64 `json:"rx_gain_dbi"`
	TxPatternAttenuationDB *float64 `json:"tx_pattern_attenuation_db"`
	SystemLossDB           *float64 `json:"system_loss_db"`
	PolarizationLossDB     *float64 `json:"polarization_loss_db"`
	CalibrationOffsetDB    *float64 `json:"calibration_offset_db"`
}

type SubTHZAtmosphericReferenceRequestInput struct {
	FrequencyGHz *float64                        `json:"frequency_ghz"`
	Transmitter  SubTHZReferencePointInput       `json:"transmitter"`
	Receiver     SubTHZReferencePointInput       `json:"receiver"`
	Atmosphere   SubTHZReferenceAtmosphereInput  `json:"atmosphere"`
	Rain         SubTHZReferenceRainInput        `json:"rain"`
	LocalFog     SubTHZReferenceLocalFogInput    `json:"local_fog"`
	LinkBudget   *SubTHZReferenceLinkBudgetInput `json:"link_budget"`
}

type SubTHZReferencePoint struct {
	Location Point   `json:"location"`
	HeightM  float64 `json:"height_m"`
}

type SubTHZReferenceAtmosphere struct {
	Enabled               bool    `json:"enabled"`
	PressureHPA           float64 `json:"pressure_hpa"`
	TemperatureK          float64 `json:"temperature_k"`
	WaterVapourDensityGM3 float64 `json:"water_vapour_density_g_m3"`
}

type SubTHZReferenceRain struct {
	Enabled             bool    `json:"enabled"`
	RainRateMMH         float64 `json:"rain_rate_mm_h"`
	Polarization        string  `json:"polarization"`
	PolarizationTiltDeg float64 `json:"polarization_tilt_deg"`
}

type SubTHZReferenceLocalFog struct {
	Enabled               bool    `json:"enabled"`
	LiquidWaterDensityGM3 float64 `json:"liquid_water_density_g_m3"`
	TemperatureK          float64 `json:"temperature_k"`
	TemperatureSource     string  `json:"temperature_source"`
}

type SubTHZReferenceLinkBudget struct {
	ConductedTxPowerDBm    float64 `json:"conducted_tx_power_dbm"`
	TxGainDBi              float64 `json:"tx_gain_dbi"`
	RxGainDBi              float64 `json:"rx_gain_dbi"`
	TxPatternAttenuationDB float64 `json:"tx_pattern_attenuation_db"`
	SystemLossDB           float64 `json:"system_loss_db"`
	PolarizationLossDB     float64 `json:"polarization_loss_db"`
	CalibrationOffsetDB    float64 `json:"calibration_offset_db"`
}

type SubTHZAtmosphericReferenceRequest struct {
	FrequencyGHz float64                    `json:"frequency_ghz"`
	Transmitter  SubTHZReferencePoint       `json:"transmitter"`
	Receiver     SubTHZReferencePoint       `json:"receiver"`
	Atmosphere   SubTHZReferenceAtmosphere  `json:"atmosphere"`
	Rain         SubTHZReferenceRain        `json:"rain"`
	LocalFog     SubTHZReferenceLocalFog    `json:"local_fog"`
	LinkBudget   *SubTHZReferenceLinkBudget `json:"link_budget,omitempty"`
}

func (input SubTHZAtmosphericReferenceRequestInput) ToRequest() SubTHZAtmosphericReferenceRequest {
	atmosphereEnabled := true
	if input.Atmosphere.Enabled != nil {
		atmosphereEnabled = *input.Atmosphere.Enabled
	}
	rainEnabled := false
	if input.Rain.Enabled != nil {
		rainEnabled = *input.Rain.Enabled
	}
	fogEnabled := false
	if input.LocalFog.Enabled != nil {
		fogEnabled = *input.LocalFog.Enabled
	}
	polarization := strings.ToLower(strings.TrimSpace(input.Rain.Polarization))
	if polarization == "" {
		polarization = "circular"
	}
	polarizationTilt := valueOr(input.Rain.PolarizationTiltDeg, defaultRainPolarizationTilt(polarization))
	localFogTemperature := valueOr(input.LocalFog.TemperatureK, valueOr(input.Atmosphere.TemperatureK, 0))
	localFogTemperatureSource := "request.local_fog.temperature_k"
	if input.LocalFog.TemperatureK == nil && input.Atmosphere.TemperatureK != nil {
		localFogTemperatureSource = "request.atmosphere.temperature_k"
	}
	if input.LocalFog.TemperatureK == nil && input.Atmosphere.TemperatureK == nil {
		localFogTemperatureSource = "unavailable"
	}

	request := SubTHZAtmosphericReferenceRequest{
		FrequencyGHz: valueOr(input.FrequencyGHz, 0),
		Transmitter: SubTHZReferencePoint{
			Location: Point{Lon: valueOr(input.Transmitter.Lon, 0), Lat: valueOr(input.Transmitter.Lat, 0)},
			HeightM:  valueOr(input.Transmitter.HeightM, 0),
		},
		Receiver: SubTHZReferencePoint{
			Location: Point{Lon: valueOr(input.Receiver.Lon, 0), Lat: valueOr(input.Receiver.Lat, 0)},
			HeightM:  valueOr(input.Receiver.HeightM, 0),
		},
		Atmosphere: SubTHZReferenceAtmosphere{
			Enabled:               atmosphereEnabled,
			PressureHPA:           valueOr(input.Atmosphere.PressureHPA, 0),
			TemperatureK:          valueOr(input.Atmosphere.TemperatureK, 0),
			WaterVapourDensityGM3: valueOr(input.Atmosphere.WaterVapourDensityGM3, 0),
		},
		Rain: SubTHZReferenceRain{
			Enabled:             rainEnabled,
			RainRateMMH:         valueOr(input.Rain.RainRateMMH, 0),
			Polarization:        polarization,
			PolarizationTiltDeg: polarizationTilt,
		},
		LocalFog: SubTHZReferenceLocalFog{
			Enabled:               fogEnabled,
			LiquidWaterDensityGM3: valueOr(input.LocalFog.LiquidWaterDensityGM3, 0),
			TemperatureK:          localFogTemperature,
			TemperatureSource:     localFogTemperatureSource,
		},
	}
	if input.LinkBudget != nil {
		request.LinkBudget = &SubTHZReferenceLinkBudget{
			ConductedTxPowerDBm:    valueOr(input.LinkBudget.ConductedTxPowerDBm, 0),
			TxGainDBi:              valueOr(input.LinkBudget.TxGainDBi, 0),
			RxGainDBi:              valueOr(input.LinkBudget.RxGainDBi, 0),
			TxPatternAttenuationDB: valueOr(input.LinkBudget.TxPatternAttenuationDB, 0),
			SystemLossDB:           valueOr(input.LinkBudget.SystemLossDB, 0),
			PolarizationLossDB:     valueOr(input.LinkBudget.PolarizationLossDB, 0),
			CalibrationOffsetDB:    valueOr(input.LinkBudget.CalibrationOffsetDB, 0),
		}
	}
	return request
}

func ValidateSubTHZAtmosphericReferenceRequest(input SubTHZAtmosphericReferenceRequestInput, request SubTHZAtmosphericReferenceRequest) string {
	if input.FrequencyGHz == nil {
		return "frequency_ghz is required"
	}
	if input.Transmitter.Lon == nil || input.Transmitter.Lat == nil || input.Transmitter.HeightM == nil {
		return "transmitter lon, lat, and height_m are required"
	}
	if input.Receiver.Lon == nil || input.Receiver.Lat == nil || input.Receiver.HeightM == nil {
		return "receiver lon, lat, and height_m are required"
	}
	if request.FrequencyGHz < SubTHZAtmosphericReferenceFrequencyMinGHz || request.FrequencyGHz > SubTHZAtmosphericReferenceFrequencyMaxGHz || !finiteNumber(request.FrequencyGHz) {
		return fmt.Sprintf("frequency_ghz must be between %.0f and %.0f", SubTHZAtmosphericReferenceFrequencyMinGHz, SubTHZAtmosphericReferenceFrequencyMaxGHz)
	}
	for label, point := range map[string]SubTHZReferencePoint{"transmitter": request.Transmitter, "receiver": request.Receiver} {
		if !finiteInRange(point.Location.Lon, -180, 180) || !finiteInRange(point.Location.Lat, -90, 90) {
			return label + " coordinates are invalid"
		}
		if !finiteInRange(point.HeightM, 0, 10000) {
			return label + ".height_m must be between 0 and 10000"
		}
	}
	distance := ApproxDistanceMeters(request.Transmitter.Location, request.Receiver.Location)
	if !finiteInRange(distance, 0.01, MaxSubTHZReferenceDistanceM) {
		return fmt.Sprintf("reference path distance must be between 0.01 and %.0f metres", MaxSubTHZReferenceDistanceM)
	}
	if request.Atmosphere.Enabled {
		if input.Atmosphere.PressureHPA == nil || input.Atmosphere.TemperatureK == nil || input.Atmosphere.WaterVapourDensityGM3 == nil {
			return "atmosphere pressure_hpa, temperature_k, and water_vapour_density_g_m3 are required when atmosphere.enabled is true"
		}
		if !finiteInRange(request.Atmosphere.PressureHPA, 300, 1100) {
			return "atmosphere.pressure_hpa must be between 300 and 1100"
		}
		if !finiteInRange(request.Atmosphere.TemperatureK, 180, 330) {
			return "atmosphere.temperature_k must be between 180 and 330"
		}
		if !finiteInRange(request.Atmosphere.WaterVapourDensityGM3, 0, 100) {
			return "atmosphere.water_vapour_density_g_m3 must be between 0 and 100"
		}
	}
	if request.Rain.Enabled {
		if input.Rain.Enabled == nil || !*input.Rain.Enabled || input.Rain.RainRateMMH == nil {
			return "rain.enabled and rain_rate_mm_h are required when rain is enabled"
		}
		if !finiteInRange(request.Rain.RainRateMMH, 0, 500) {
			return "rain.rain_rate_mm_h must be between 0 and 500"
		}
		if !oneOf(request.Rain.Polarization, "horizontal", "vertical", "circular", "linear") {
			return "rain.polarization must be horizontal, vertical, circular, or linear"
		}
		if !finiteInRange(request.Rain.PolarizationTiltDeg, 0, 90) {
			return "rain.polarization_tilt_deg must be between 0 and 90"
		}
	}
	if request.LocalFog.Enabled {
		if input.LocalFog.Enabled == nil || !*input.LocalFog.Enabled || input.LocalFog.LiquidWaterDensityGM3 == nil {
			return "local_fog.enabled and liquid_water_density_g_m3 are required when local fog is enabled"
		}
		if !finiteInRange(request.LocalFog.LiquidWaterDensityGM3, 0, 5) {
			return "local_fog.liquid_water_density_g_m3 must be between 0 and 5"
		}
		if !finiteInRange(request.LocalFog.TemperatureK, 180, 330) {
			return "local_fog.temperature_k must be supplied or atmosphere.temperature_k must be between 180 and 330"
		}
	}
	if request.LinkBudget != nil {
		values := []float64{
			request.LinkBudget.ConductedTxPowerDBm,
			request.LinkBudget.TxGainDBi,
			request.LinkBudget.RxGainDBi,
			request.LinkBudget.TxPatternAttenuationDB,
			request.LinkBudget.SystemLossDB,
			request.LinkBudget.PolarizationLossDB,
			request.LinkBudget.CalibrationOffsetDB,
		}
		for _, value := range values {
			if !finiteNumber(value) {
				return "link_budget values must be finite"
			}
		}
	}
	return ""
}

type SubTHZReferenceComponentStatus struct {
	ID                       string   `json:"id"`
	Label                    string   `json:"label"`
	Enabled                  bool     `json:"enabled"`
	Included                 bool     `json:"included"`
	Applicability            string   `json:"applicability"`
	Reference                string   `json:"reference"`
	ReferenceURL             string   `json:"reference_url"`
	AdditiveToFSPL           bool     `json:"additive_to_fspl"`
	ExistingTermsNotIncluded []string `json:"existing_terms_not_included"`
	DoubleCountingBoundary   string   `json:"double_counting_boundary"`
	Note                     string   `json:"note"`
}

type SubTHZReferenceGeometry struct {
	HorizontalDistanceM float64 `json:"horizontal_distance_m"`
	SlantDistanceM      float64 `json:"slant_distance_m"`
	PathLengthKM        float64 `json:"path_length_km"`
	TxHeightM           float64 `json:"tx_height_m"`
	RxHeightM           float64 `json:"rx_height_m"`
	HeightDeltaM        float64 `json:"height_delta_m"`
	RainElevationDeg    float64 `json:"rain_path_elevation_deg"`
}

type SubTHZReferenceFSPLLedger struct {
	Status                     string  `json:"status"`
	Reference                  string  `json:"reference"`
	ReferenceURL               string  `json:"reference_url"`
	WavelengthM                float64 `json:"wavelength_m"`
	FSPLDB                     float64 `json:"fspl_db"`
	PresentationEquationFSPLDB float64 `json:"presentation_equation_fspl_db"`
	Equation                   string  `json:"equation"`
	AdditiveComponent          bool    `json:"additive_component"`
	Note                       string  `json:"note"`
}

type SubTHZReferenceGasLedger struct {
	Status                 string  `json:"status"`
	Reference              string  `json:"reference"`
	ReferenceURL           string  `json:"reference_url"`
	PressureHPA            float64 `json:"pressure_hpa"`
	DryPressureHPA         float64 `json:"dry_pressure_hpa"`
	TemperatureK           float64 `json:"temperature_k"`
	WaterVapourDensityGM3  float64 `json:"water_vapour_density_g_m3"`
	WaterVapourPressureHPA float64 `json:"water_vapour_pressure_hpa"`
	OxygenLineDBPerKM      float64 `json:"oxygen_line_db_per_km"`
	DryContinuumDBPerKM    float64 `json:"dry_continuum_db_per_km"`
	DryAirDBPerKM          float64 `json:"dry_air_db_per_km"`
	WaterVapourDBPerKM     float64 `json:"water_vapour_db_per_km"`
	TotalDBPerKM           float64 `json:"total_db_per_km"`
	PathLossDB             float64 `json:"path_loss_db"`
	Included               bool    `json:"included"`
	AdditiveComponent      bool    `json:"additive_component"`
	Method                 string  `json:"method"`
	Note                   string  `json:"note"`
}

type SubTHZReferenceRainLedger struct {
	Status              string  `json:"status"`
	Reference           string  `json:"reference"`
	ReferenceURL        string  `json:"reference_url"`
	RainRateMMH         float64 `json:"rain_rate_mm_h"`
	Polarization        string  `json:"polarization"`
	PolarizationTiltDeg float64 `json:"polarization_tilt_deg"`
	ElevationDeg        float64 `json:"elevation_deg"`
	KH                  float64 `json:"k_h"`
	KV                  float64 `json:"k_v"`
	AlphaH              float64 `json:"alpha_h"`
	AlphaV              float64 `json:"alpha_v"`
	K                   float64 `json:"k"`
	Alpha               float64 `json:"alpha"`
	SpecificDBPerKM     float64 `json:"specific_db_per_km"`
	PathLossDB          float64 `json:"path_loss_db"`
	Included            bool    `json:"included"`
	AdditiveComponent   bool    `json:"additive_component"`
	Method              string  `json:"method"`
	Note                string  `json:"note"`
}

type SubTHZReferenceFogLedger struct {
	Status                string  `json:"status"`
	Reference             string  `json:"reference"`
	ReferenceURL          string  `json:"reference_url"`
	TemperatureK          float64 `json:"temperature_k"`
	TemperatureSource     string  `json:"temperature_source"`
	LiquidWaterDensityGM3 float64 `json:"liquid_water_density_g_m3"`
	KLGivenTemperature    float64 `json:"k_l_db_per_km_per_g_m3"`
	SpecificDBPerKM       float64 `json:"specific_db_per_km"`
	PathLossDB            float64 `json:"path_loss_db"`
	Included              bool    `json:"included"`
	AdditiveComponent     bool    `json:"additive_component"`
	Method                string  `json:"method"`
	Note                  string  `json:"note"`
}

type SubTHZReferenceTotalLedger struct {
	FreeSpaceDB       float64 `json:"free_space_db"`
	GasDB             float64 `json:"gas_db"`
	RainDB            float64 `json:"rain_db"`
	LocalFogDB        float64 `json:"local_fog_db"`
	AtmosphericDB     float64 `json:"atmospheric_db"`
	TotalPathLossDB   float64 `json:"total_path_loss_db"`
	Equation          string  `json:"equation"`
	CanonicalNetwork  bool    `json:"canonical_network_model"`
	ReceiverThreshold bool    `json:"receiver_threshold_applied"`
}

type SubTHZReferenceObstructionStatus struct {
	DatasetAvailable            bool     `json:"building_dataset_available"`
	BuildingIntersectionPresent bool     `json:"building_intersection_present"`
	BuildingIntersectionCount   int      `json:"building_intersection_count"`
	BuildingIDs                 []string `json:"building_ids,omitempty"`
	Effect                      string   `json:"effect"`
	WallLossApplied             bool     `json:"wall_loss_applied"`
	DiffractionApplied          bool     `json:"diffraction_applied"`
	MaterialLossApplied         bool     `json:"material_loss_applied"`
	Note                        string   `json:"note"`
}

type SubTHZReferenceLinkBudgetLedger struct {
	Provided                 bool    `json:"provided"`
	ConductedTxPowerDBm      float64 `json:"conducted_tx_power_dbm"`
	TxGainDBi                float64 `json:"tx_gain_dbi"`
	TxPatternAttenuationDB   float64 `json:"tx_pattern_attenuation_db"`
	SystemLossDB             float64 `json:"system_loss_db"`
	PolarizationLossDB       float64 `json:"polarization_loss_db"`
	RxGainDBi                float64 `json:"rx_gain_dbi"`
	PropagationLossDB        float64 `json:"propagation_loss_db"`
	TotalSignedLossDB        float64 `json:"total_signed_loss_db"`
	CalibrationOffsetDB      float64 `json:"calibration_offset_db"`
	ReceivedPowerDBm         float64 `json:"received_power_dbm"`
	ReceiverThresholdApplied bool    `json:"receiver_threshold_applied"`
	ServiceabilityEvaluated  bool    `json:"serviceability_evaluated"`
	Note                     string  `json:"note"`
}

type SubTHZReferenceApplicability struct {
	Status                   string                           `json:"status"`
	ModelID                  string                           `json:"model_id"`
	FrequencyGHz             float64                          `json:"frequency_ghz"`
	FrequencyInScope         bool                             `json:"frequency_in_scope"`
	FrequencyRangeGHz        [2]float64                       `json:"frequency_range_ghz"`
	Components               []SubTHZReferenceComponentStatus `json:"components"`
	ReferencePathType        string                           `json:"reference_path_type"`
	CanonicalNetworkCoupling bool                             `json:"canonical_network_coupling"`
	Note                     string                           `json:"note"`
}

type SubTHZAtmosphericReferenceResponse struct {
	ReferenceModelID         string                           `json:"reference_model_id"`
	Description              string                           `json:"description"`
	FrequencyGHz             float64                          `json:"frequency_ghz"`
	Transmitter              SubTHZReferencePoint             `json:"transmitter"`
	Receiver                 SubTHZReferencePoint             `json:"receiver"`
	Geometry                 SubTHZReferenceGeometry          `json:"geometry"`
	FSPL                     SubTHZReferenceFSPLLedger        `json:"fspl"`
	Gas                      SubTHZReferenceGasLedger         `json:"gas"`
	Rain                     SubTHZReferenceRainLedger        `json:"rain"`
	LocalFog                 SubTHZReferenceFogLedger         `json:"local_fog"`
	Total                    SubTHZReferenceTotalLedger       `json:"total"`
	Obstruction              SubTHZReferenceObstructionStatus `json:"obstruction"`
	ReferenceLinkBudget      *SubTHZReferenceLinkBudgetLedger `json:"reference_link_budget,omitempty"`
	Applicability            SubTHZReferenceApplicability     `json:"applicability"`
	Assumptions              []string                         `json:"assumptions"`
	Limitations              []string                         `json:"limitations"`
	DoubleCountingBoundaries []string                         `json:"double_counting_boundaries"`
	ExperimentFingerprint    string                           `json:"experiment_fingerprint"`
}

func EvaluateSubTHZAtmosphericReferenceContext(ctx context.Context, request SubTHZAtmosphericReferenceRequest, buildings *BuildingIndex) (SubTHZAtmosphericReferenceResponse, error) {
	if err := ctx.Err(); err != nil {
		return SubTHZAtmosphericReferenceResponse{}, err
	}
	if err := validateSubTHZReferenceRequest(request); err != nil {
		return SubTHZAtmosphericReferenceResponse{}, err
	}
	horizontal := ApproxDistanceMeters(request.Transmitter.Location, request.Receiver.Location)
	heightDelta := request.Receiver.HeightM - request.Transmitter.HeightM
	slant := math.Hypot(horizontal, heightDelta)
	pathKM := slant / 1000
	rainElevation := math.Abs(math.Atan2(heightDelta, math.Max(horizontal, 1e-9)) * 180 / math.Pi)
	geometry := SubTHZReferenceGeometry{
		HorizontalDistanceM: horizontal,
		SlantDistanceM:      slant,
		PathLengthKM:        pathKM,
		TxHeightM:           request.Transmitter.HeightM,
		RxHeightM:           request.Receiver.HeightM,
		HeightDeltaM:        heightDelta,
		RainElevationDeg:    rainElevation,
	}

	wavelength := 299792458.0 / (request.FrequencyGHz * 1e9)
	fspl := 20 * math.Log10(4*math.Pi*slant/wavelength)
	presentationFSPL := 32.4 + 20*math.Log10(request.FrequencyGHz*1000) + 20*math.Log10(pathKM)
	fsplLedger := SubTHZReferenceFSPLLedger{
		Status:                     "included",
		Reference:                  P5255Reference,
		ReferenceURL:               P5255ReferenceURL,
		WavelengthM:                wavelength,
		FSPLDB:                     fspl,
		PresentationEquationFSPLDB: presentationFSPL,
		Equation:                   "Lbf = 20 log10(4 pi d / lambda), with d and lambda in the same units",
		AdditiveComponent:          true,
		Note:                       "The wavelength form is the calculation; the 32.4 dB presentation form is exposed for audit comparison.",
	}

	gasLedger := SubTHZReferenceGasLedger{Status: "disabled", Reference: P67613Reference, ReferenceURL: P67613ReferenceURL, Method: "P.676-13 Annex 1 line-by-line homogeneous terrestrial path", Note: "No gas term is included when atmosphere.enabled is false."}
	if request.Atmosphere.Enabled {
		if request.FrequencyGHz <= SubTHZAtmosphericReferenceFrequencyMaxGHz {
			dryPressure := request.Atmosphere.PressureHPA - request.Atmosphere.WaterVapourDensityGM3*request.Atmosphere.TemperatureK/216.7
			oxygenLine, dryContinuum, waterVapour := p67613ExactSpecificAttenuation(request.FrequencyGHz, dryPressure, request.Atmosphere.TemperatureK, request.Atmosphere.WaterVapourDensityGM3)
			dryAir := oxygenLine + dryContinuum
			total := dryAir + waterVapour
			gasLedger = SubTHZReferenceGasLedger{
				Status: "included", Reference: P67613Reference, ReferenceURL: P67613ReferenceURL,
				PressureHPA: request.Atmosphere.PressureHPA, DryPressureHPA: dryPressure,
				TemperatureK: request.Atmosphere.TemperatureK, WaterVapourDensityGM3: request.Atmosphere.WaterVapourDensityGM3,
				WaterVapourPressureHPA: request.Atmosphere.WaterVapourDensityGM3 * request.Atmosphere.TemperatureK / 216.7,
				OxygenLineDBPerKM:      oxygenLine, DryContinuumDBPerKM: dryContinuum, DryAirDBPerKM: dryAir,
				WaterVapourDBPerKM: waterVapour, TotalDBPerKM: total, PathLossDB: total * pathKM,
				Included: true, AdditiveComponent: true,
				Method: "P.676-13 Annex 1 equations (1)–(10), oxygen and water-vapour line tables plus dry continuum",
				Note:   "Pressure input is total barometric pressure; P.676 dry pressure p is total pressure minus water-vapour partial pressure.",
			}
		} else {
			gasLedger.Status = "out_of_scope"
			gasLedger.Note = "Frequency is outside the implemented P.676-13 reference range."
		}
	}

	rainLedger := SubTHZReferenceRainLedger{
		Status: "disabled", Reference: P8383Reference, ReferenceURL: P8383ReferenceURL,
		Polarization: request.Rain.Polarization, PolarizationTiltDeg: request.Rain.PolarizationTiltDeg,
		ElevationDeg: rainElevation, Method: "P.838-3 gamma_R = k R^alpha", Note: "No rain term is included when rain.enabled is false.",
	}
	if request.Rain.Enabled {
		if request.FrequencyGHz >= 1 && request.FrequencyGHz <= 1000 {
			tilt := request.Rain.PolarizationTiltDeg
			if request.Rain.Polarization == "horizontal" {
				tilt = 0
			} else if request.Rain.Polarization == "vertical" {
				tilt = 90
			} else if request.Rain.Polarization == "circular" {
				tilt = 45
			}
			kH, alphaH, kV, alphaV := p8383LinearCoefficients(request.FrequencyGHz)
			k, alpha := p8383CombinedCoefficients(kH, alphaH, kV, alphaV, rainElevation, tilt)
			specific := 0.0
			if request.Rain.RainRateMMH > 0 {
				specific = k * math.Pow(request.Rain.RainRateMMH, alpha)
			}
			rainLedger = SubTHZReferenceRainLedger{
				Status: "included", Reference: P8383Reference, ReferenceURL: P8383ReferenceURL,
				RainRateMMH: request.Rain.RainRateMMH, Polarization: request.Rain.Polarization,
				PolarizationTiltDeg: tilt, ElevationDeg: rainElevation,
				KH: kH, KV: kV, AlphaH: alphaH, AlphaV: alphaV, K: k, Alpha: alpha,
				SpecificDBPerKM: specific, PathLossDB: specific * pathKM, Included: true, AdditiveComponent: true,
				Method: "P.838-3 equations (1)–(5)",
				Note:   "This is raw homogeneous terrestrial path attenuation; P.837 annual statistics and any effective-path reduction are not applied.",
			}
		} else {
			rainLedger.Status = "out_of_scope"
			rainLedger.Note = "Frequency is outside the P.838-3 1–1000 GHz range."
		}
	}

	fogLedger := SubTHZReferenceFogLedger{
		Status: "disabled", Reference: P8409Reference, ReferenceURL: P8409ReferenceURL,
		TemperatureK: request.LocalFog.TemperatureK, TemperatureSource: request.LocalFog.TemperatureSource,
		LiquidWaterDensityGM3: request.LocalFog.LiquidWaterDensityGM3,
		Method:                "P.840-9 local fog gamma_c = K_l(f,T) rho_l", Note: "No local-fog term is included when local_fog.enabled is false.",
	}
	if request.LocalFog.Enabled {
		if request.FrequencyGHz >= 1 && request.FrequencyGHz <= 200 {
			kl := p8409SpecificAttenuationCoefficient(request.FrequencyGHz, request.LocalFog.TemperatureK)
			specific := kl * request.LocalFog.LiquidWaterDensityGM3
			fogLedger = SubTHZReferenceFogLedger{
				Status: "included", Reference: P8409Reference, ReferenceURL: P8409ReferenceURL,
				TemperatureK: request.LocalFog.TemperatureK, TemperatureSource: request.LocalFog.TemperatureSource,
				LiquidWaterDensityGM3: request.LocalFog.LiquidWaterDensityGM3, KLGivenTemperature: kl,
				SpecificDBPerKM: specific, PathLossDB: specific * pathKM, Included: true, AdditiveComponent: true,
				Method: "P.840-9 local specific attenuation coefficient, not integrated cloud-column attenuation",
				Note:   "The supplied liquid-water density is interpreted as local homogeneous fog density along the terrestrial path.",
			}
		} else {
			fogLedger.Status = "out_of_scope"
			fogLedger.Note = "P.840-9 local-fog sensitivity is limited here to its 1–200 GHz scope."
		}
	}

	gasLoss := gasLedger.PathLossDB
	rainLoss := rainLedger.PathLossDB
	fogLoss := fogLedger.PathLossDB
	atmosphericLoss := gasLoss + rainLoss + fogLoss
	total := SubTHZReferenceTotalLedger{
		FreeSpaceDB: fspl, GasDB: gasLoss, RainDB: rainLoss, LocalFogDB: fogLoss,
		AtmosphericDB: atmosphericLoss, TotalPathLossDB: fspl + atmosphericLoss,
		Equation:         "L_total_reference = FSPL_P.525 + A_gas_P.676 + A_rain_P.838 + A_local_fog_P.840",
		CanonicalNetwork: false, ReceiverThreshold: false,
	}

	obstruction, err := subTHZReferenceObstructionStatus(ctx, request, buildings)
	if err != nil {
		return SubTHZAtmosphericReferenceResponse{}, err
	}
	components := subTHZReferenceComponentStatuses(request)
	status := "applicable"
	for _, component := range components {
		if component.Enabled && component.Applicability != "included" {
			status = "partial"
		}
	}
	if !request.Atmosphere.Enabled && !request.Rain.Enabled && !request.LocalFog.Enabled {
		status = "fspl_only"
	}
	applicability := SubTHZReferenceApplicability{
		Status: status, ModelID: SubTHZAtmosphericReferenceModelID, FrequencyGHz: request.FrequencyGHz,
		FrequencyInScope:  request.FrequencyGHz >= SubTHZAtmosphericReferenceFrequencyMinGHz && request.FrequencyGHz <= SubTHZAtmosphericReferenceFrequencyMaxGHz,
		FrequencyRangeGHz: [2]float64{SubTHZAtmosphericReferenceFrequencyMinGHz, SubTHZAtmosphericReferenceFrequencyMaxGHz},
		Components:        components, ReferencePathType: "homogeneous straight terrestrial Tx-to-Rx path",
		CanonicalNetworkCoupling: false,
		Note:                     "This response is an opt-in reference ledger. It is not dispatched by simulate, coverage, interference, building entry, or optimization.",
	}

	assumptions := []string{
		"The path is homogeneous between the explicit transmitter and receiver endpoints; atmospheric specific attenuation is multiplied by the geometric slant path length.",
		"The P.525 wavelength equation is the calculated free-space baseline; the rounded 32.4 dB presentation equation is reported separately for auditability.",
		"The atmosphere uses the supplied total barometric pressure, temperature, and water-vapour density; no weather dataset is inferred.",
		"Rain uses the supplied instantaneous rain rate and polarization; P.837 annual rain-rate statistics and terrestrial effective-path reduction are not applied.",
		"Local fog uses the supplied liquid-water density as a local terrestrial density; P.840 integrated Earth-space cloud-column attenuation is not used.",
	}
	limitations := []string{
		"No urban excess loss, reflection, scattering, multipath, diffraction, rooftop screening, or material/building-entry loss is predicted.",
		"A building intersection is reported as geometry evidence only; it never contributes wall loss or a receiver penalty in this ledger.",
		"A supplied link budget is an optional reference calculation only; no receiver sensitivity, serviceability, coverage, SINR, RSRP, RSRQ, demand, or optimization score is evaluated.",
		"This implementation does not ingest P.837 statistics, local radiosonde profiles, rain-path reduction factors, or measured channel calibration.",
	}
	doubleCounting := []string{
		"Do not add this total to research_sub_thz, urban_short_range, legacy_fspl_walls, path-profile loss budgets, building-entry loss, diffraction diagnostics, interference, or optimization outputs.",
		"FSPL is the only propagation baseline in this endpoint; gas, rain, and local fog are separate additive atmospheric components and are not hidden inside a canonical model term.",
	}

	response := SubTHZAtmosphericReferenceResponse{
		ReferenceModelID: SubTHZAtmosphericReferenceModelID, Description: SubTHZAtmosphericReferenceDescription,
		FrequencyGHz: request.FrequencyGHz, Transmitter: request.Transmitter, Receiver: request.Receiver,
		Geometry: geometry, FSPL: fsplLedger, Gas: gasLedger, Rain: rainLedger, LocalFog: fogLedger,
		Total: total, Obstruction: obstruction, Applicability: applicability,
		Assumptions: assumptions, Limitations: limitations, DoubleCountingBoundaries: doubleCounting,
	}
	if request.LinkBudget != nil {
		propagationLoss := total.TotalPathLossDB
		totalSignedLoss := propagationLoss + request.LinkBudget.TxPatternAttenuationDB + request.LinkBudget.SystemLossDB + request.LinkBudget.PolarizationLossDB - request.LinkBudget.RxGainDBi - request.LinkBudget.CalibrationOffsetDB
		received := request.LinkBudget.ConductedTxPowerDBm + request.LinkBudget.TxGainDBi - request.LinkBudget.TxPatternAttenuationDB - propagationLoss - request.LinkBudget.SystemLossDB - request.LinkBudget.PolarizationLossDB + request.LinkBudget.RxGainDBi + request.LinkBudget.CalibrationOffsetDB
		response.ReferenceLinkBudget = &SubTHZReferenceLinkBudgetLedger{
			Provided: true, ConductedTxPowerDBm: request.LinkBudget.ConductedTxPowerDBm, TxGainDBi: request.LinkBudget.TxGainDBi,
			TxPatternAttenuationDB: request.LinkBudget.TxPatternAttenuationDB, SystemLossDB: request.LinkBudget.SystemLossDB,
			PolarizationLossDB: request.LinkBudget.PolarizationLossDB, RxGainDBi: request.LinkBudget.RxGainDBi,
			PropagationLossDB: propagationLoss, TotalSignedLossDB: totalSignedLoss, CalibrationOffsetDB: request.LinkBudget.CalibrationOffsetDB,
			ReceivedPowerDBm: received, ReceiverThresholdApplied: false, ServiceabilityEvaluated: false,
			Note: "Reference received power only; no receiver threshold or serviceability decision is made.",
		}
	}
	response.ExperimentFingerprint = subTHZReferenceFingerprint(request)
	return response, nil
}

func validateSubTHZReferenceRequest(request SubTHZAtmosphericReferenceRequest) error {
	if !finiteInRange(request.FrequencyGHz, SubTHZAtmosphericReferenceFrequencyMinGHz, SubTHZAtmosphericReferenceFrequencyMaxGHz) {
		return errors.New("frequency_ghz is outside the supported 1–1000 GHz reference range")
	}
	if !finiteInRange(request.Transmitter.Location.Lon, -180, 180) || !finiteInRange(request.Transmitter.Location.Lat, -90, 90) || !finiteInRange(request.Receiver.Location.Lon, -180, 180) || !finiteInRange(request.Receiver.Location.Lat, -90, 90) {
		return errors.New("reference coordinates are invalid")
	}
	if !finiteInRange(request.Transmitter.HeightM, 0, 10000) || !finiteInRange(request.Receiver.HeightM, 0, 10000) {
		return errors.New("reference endpoint heights are invalid")
	}
	distance := ApproxDistanceMeters(request.Transmitter.Location, request.Receiver.Location)
	if !finiteInRange(distance, 0.01, MaxSubTHZReferenceDistanceM) {
		return errors.New("reference path distance is outside the supported range")
	}
	if request.Atmosphere.Enabled {
		if !finiteInRange(request.Atmosphere.PressureHPA, 300, 1100) || !finiteInRange(request.Atmosphere.TemperatureK, 180, 330) || !finiteInRange(request.Atmosphere.WaterVapourDensityGM3, 0, 100) {
			return errors.New("reference atmosphere values are invalid")
		}
	}
	if request.Rain.Enabled && (!finiteInRange(request.Rain.RainRateMMH, 0, 500) || !finiteInRange(request.Rain.PolarizationTiltDeg, 0, 90)) {
		return errors.New("reference rain values are invalid")
	}
	if request.LocalFog.Enabled && (!finiteInRange(request.LocalFog.LiquidWaterDensityGM3, 0, 5) || !finiteInRange(request.LocalFog.TemperatureK, 180, 330)) {
		return errors.New("reference local-fog values are invalid")
	}
	return nil
}

func subTHZReferenceComponentStatuses(request SubTHZAtmosphericReferenceRequest) []SubTHZReferenceComponentStatus {
	gasStatus := "disabled"
	if request.Atmosphere.Enabled {
		gasStatus = "included"
	}
	rainStatus := "disabled"
	if request.Rain.Enabled {
		rainStatus = "included"
	}
	fogStatus := "disabled"
	if request.LocalFog.Enabled {
		if request.FrequencyGHz <= 200 {
			fogStatus = "included"
		} else {
			fogStatus = "out_of_scope"
		}
	}
	return []SubTHZReferenceComponentStatus{
		{ID: "free_space", Label: "P.525 free-space baseline", Enabled: true, Included: true, Applicability: "included", Reference: P5255Reference, ReferenceURL: P5255ReferenceURL, AdditiveToFSPL: true, ExistingTermsNotIncluded: []string{"urban_short_range excess loss", "research_sub_thz wall event", "path-profile environmental sensitivity"}, DoubleCountingBoundary: "Use as the reference baseline exactly once; do not add to another FSPL baseline.", Note: "Wavelength-form free-space calculation."},
		{ID: "atmospheric_gas", Label: "P.676 atmospheric gas", Enabled: request.Atmosphere.Enabled, Included: request.Atmosphere.Enabled, Applicability: gasStatus, Reference: P67613Reference, ReferenceURL: P67613ReferenceURL, AdditiveToFSPL: true, ExistingTermsNotIncluded: []string{"user-supplied path-profile gas dB/km", "canonical research_sub_thz"}, DoubleCountingBoundary: "Add only when the explicit atmosphere block is enabled; never also add a user-supplied gas sensitivity for this same path.", Note: "Dry oxygen and water-vapour terms are reported separately."},
		{ID: "rain", Label: "P.838 rain", Enabled: request.Rain.Enabled, Included: request.Rain.Enabled, Applicability: rainStatus, Reference: P8383Reference, ReferenceURL: P8383ReferenceURL, AdditiveToFSPL: true, ExistingTermsNotIncluded: []string{"P.837 annual availability", "user-supplied path-profile rain dB/km", "canonical network RF"}, DoubleCountingBoundary: "The result is raw instantaneous path attenuation; do not add it to another rain term or reinterpret it as annual availability.", Note: "Polarization and path elevation are explicit."},
		{ID: "local_fog", Label: "P.840 local-fog sensitivity", Enabled: request.LocalFog.Enabled, Included: request.LocalFog.Enabled && request.FrequencyGHz <= 200, Applicability: fogStatus, Reference: P8409Reference, ReferenceURL: P8409ReferenceURL, AdditiveToFSPL: true, ExistingTermsNotIncluded: []string{"P.840 integrated Earth-space cloud column", "cloud statistics", "canonical network RF"}, DoubleCountingBoundary: "Use local liquid-water density only; do not combine with an integrated cloud-column attenuation result.", Note: "Explicitly scoped to local homogeneous terrestrial fog."},
	}
}

func subTHZReferenceObstructionStatus(ctx context.Context, request SubTHZAtmosphericReferenceRequest, buildings *BuildingIndex) (SubTHZReferenceObstructionStatus, error) {
	status := SubTHZReferenceObstructionStatus{
		Effect: "flag_only_no_propagation_loss", WallLossApplied: false, DiffractionApplied: false, MaterialLossApplied: false,
		Note: "Building geometry is an auditable obstruction flag only; this atmospheric reference does not predict wall, diffraction, roof-screen, or material loss.",
	}
	if buildings == nil || buildings.Len() == 0 {
		status.Note = "No building index was available. Atmospheric terms remain evaluable, but building obstruction status is unknown."
		return status, nil
	}
	status.DatasetAvailable = true
	geometry, err := buildPropagationPathGeometryContextWithOptions(ctx, request.Transmitter.Location, request.Receiver.Location, buildings, propagationPathGeometryOptions{
		TxHeightM: request.Transmitter.HeightM, RxHeightM: request.Receiver.HeightM,
	})
	if err != nil {
		return SubTHZReferenceObstructionStatus{}, err
	}
	ids := make(map[string]struct{})
	for _, intersection := range geometry.intersections {
		if intersection.buildingID != "" {
			ids[intersection.buildingID] = struct{}{}
		}
	}
	if tx := buildings.BuildingAt(request.Transmitter.Location); tx != nil {
		ids[tx.ID] = struct{}{}
	}
	if rx := buildings.BuildingAt(request.Receiver.Location); rx != nil {
		ids[rx.ID] = struct{}{}
	}
	buildingIDs := make([]string, 0, len(ids))
	for id := range ids {
		buildingIDs = append(buildingIDs, id)
	}
	sort.Strings(buildingIDs)
	status.BuildingIDs = buildingIDs
	status.BuildingIntersectionCount = len(buildingIDs)
	status.BuildingIntersectionPresent = len(buildingIDs) > 0
	if status.BuildingIntersectionPresent {
		status.Effect = "building_intersection_flagged_no_loss"
	}
	return status, nil
}

func subTHZReferenceFingerprint(request SubTHZAtmosphericReferenceRequest) string {
	payload := struct {
		ModelID    string                            `json:"model_id"`
		References []string                          `json:"references"`
		Request    SubTHZAtmosphericReferenceRequest `json:"request"`
	}{
		ModelID:    SubTHZAtmosphericReferenceModelID,
		References: []string{P5255Reference, P67613Reference, P8383Reference, P8409Reference},
		Request:    request,
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "sub-thz-reference-invalid"
	}
	digest := sha256.Sum256(encoded)
	return "sub-thz-reference-" + hex.EncodeToString(digest[:])
}

func finiteNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func defaultRainPolarizationTilt(polarization string) float64 {
	switch polarization {
	case "horizontal":
		return 0
	case "vertical":
		return 90
	default:
		return 45
	}
}

type p67613OxygenLine struct {
	F0, A1, A2, A3, A4, A5, A6 float64
}

type p67613WaterLine struct {
	F0, B1, B2, B3, B4, B5, B6 float64
}

var p67613OxygenLines = [...]p67613OxygenLine{
	{50.474214, 0.975, 9.651, 6.690, 0, 2.566, 6.850},
	{50.987745, 2.529, 8.653, 7.170, 0, 2.246, 6.800},
	{51.503360, 6.193, 7.709, 7.640, 0, 1.947, 6.729},
	{52.021429, 14.320, 6.819, 8.110, 0, 1.667, 6.640},
	{52.542418, 31.240, 5.983, 8.580, 0, 1.388, 6.526},
	{53.066934, 64.290, 5.201, 9.060, 0, 1.349, 6.206},
	{53.595775, 124.600, 4.474, 9.550, 0, 2.227, 5.085},
	{54.130025, 227.300, 3.800, 9.960, 0, 3.170, 3.750},
	{54.671180, 389.700, 3.182, 10.370, 0, 3.558, 2.654},
	{55.221384, 627.100, 2.618, 10.890, 0, 2.560, 2.952},
	{55.783815, 945.300, 2.109, 11.340, 0, -1.172, 6.135},
	{56.264774, 543.400, 0.014, 17.030, 0, 3.525, -0.978},
	{56.363399, 1331.800, 1.654, 11.890, 0, -2.378, 6.547},
	{56.968211, 1746.600, 1.255, 12.230, 0, -3.545, 6.451},
	{57.612486, 2120.100, 0.910, 12.620, 0, -5.416, 6.056},
	{58.323877, 2363.700, 0.621, 12.950, 0, -1.932, 0.436},
	{58.446588, 1442.100, 0.083, 14.910, 0, 6.768, -1.273},
	{59.164204, 2379.900, 0.387, 13.530, 0, -6.561, 2.309},
	{59.590983, 2090.700, 0.207, 14.080, 0, 6.957, -0.776},
	{60.306056, 2103.400, 0.207, 14.150, 0, -6.395, 0.699},
	{60.434778, 2438.000, 0.386, 13.390, 0, 6.342, -2.825},
	{61.150562, 2479.500, 0.621, 12.920, 0, 1.014, -0.584},
	{61.800158, 2275.900, 0.910, 12.630, 0, 5.014, -6.619},
	{62.411220, 1915.400, 1.255, 12.170, 0, 3.029, -6.759},
	{62.486253, 1503.000, 0.083, 15.130, 0, -4.499, 0.844},
	{62.997984, 1490.200, 1.654, 11.740, 0, 1.856, -6.675},
	{63.568526, 1078.000, 2.108, 11.340, 0, 0.658, -6.139},
	{64.127775, 728.700, 2.617, 10.880, 0, -3.036, -2.895},
	{64.678910, 461.300, 3.181, 10.380, 0, -3.968, -2.590},
	{65.224078, 274.000, 3.800, 9.960, 0, -3.528, -3.680},
	{65.764779, 153.000, 4.473, 9.550, 0, -2.548, -5.002},
	{66.302096, 80.400, 5.200, 9.060, 0, -1.660, -6.091},
	{66.836834, 39.800, 5.982, 8.580, 0, -1.680, -6.393},
	{67.369601, 18.560, 6.818, 8.110, 0, -1.956, -6.475},
	{67.900868, 8.172, 7.708, 7.640, 0, -2.216, -6.545},
	{68.431006, 3.397, 8.652, 7.170, 0, -2.492, -6.600},
	{68.960312, 1.334, 9.650, 6.690, 0, -2.773, -6.650},
	{118.750334, 940.300, 0.010, 16.640, 0, -0.439, 0.079},
	{368.498246, 67.400, 0.048, 16.400, 0, 0, 0},
	{424.763020, 637.700, 0.044, 16.400, 0, 0, 0},
	{487.249273, 237.400, 0.049, 16.000, 0, 0, 0},
	{715.392902, 98.100, 0.145, 16.000, 0, 0, 0},
	{773.839490, 572.300, 0.141, 16.200, 0, 0, 0},
	{834.145546, 183.100, 0.145, 14.700, 0, 0, 0},
}

var p67613WaterLines = [...]p67613WaterLine{
	{22.235080, 0.107900, 2.144000, 26.380, 0.760, 5.087, 1.000},
	{67.803960, 0.001100, 8.732000, 28.580, 0.690, 4.930, 0.820},
	{119.995940, 0.000700, 8.353000, 29.480, 0.700, 4.780, 0.790},
	{183.310087, 2.273000, 0.668000, 29.060, 0.770, 5.022, 0.850},
	{321.225630, 0.047000, 6.179000, 24.040, 0.670, 4.398, 0.540},
	{325.152888, 1.514000, 1.541000, 28.230, 0.640, 4.893, 0.740},
	{336.227764, 0.001000, 9.825000, 26.930, 0.690, 4.740, 0.610},
	{380.197353, 11.670000, 1.048000, 28.110, 0.540, 5.063, 0.890},
	{390.134508, 0.004500, 7.347000, 21.520, 0.630, 4.810, 0.550},
	{437.346667, 0.063200, 5.048000, 18.450, 0.600, 4.230, 0.480},
	{439.150807, 0.909800, 3.595000, 20.070, 0.630, 4.483, 0.520},
	{443.018343, 0.192000, 5.048000, 15.550, 0.600, 5.083, 0.500},
	{448.001085, 10.410000, 1.405000, 25.640, 0.660, 5.028, 0.670},
	{470.888999, 0.325400, 3.597000, 21.340, 0.660, 4.506, 0.650},
	{474.689092, 1.260000, 2.379000, 23.200, 0.650, 4.804, 0.640},
	{488.490108, 0.252900, 2.852000, 25.860, 0.690, 5.201, 0.720},
	{503.568532, 0.037200, 6.731000, 16.120, 0.610, 3.980, 0.430},
	{504.482692, 0.012400, 6.731000, 16.120, 0.610, 4.010, 0.450},
	{547.676440, 0.978500, 0.158000, 26.000, 0.700, 4.500, 1.000},
	{552.020960, 0.184000, 0.158000, 26.000, 0.700, 4.500, 1.000},
	{556.935985, 497.000000, 0.159000, 30.860, 0.690, 4.552, 1.000},
	{620.700807, 5.015000, 2.391000, 24.380, 0.710, 4.856, 0.680},
	{645.766085, 0.006700, 8.633000, 18.000, 0.600, 4.000, 0.500},
	{658.005280, 0.273200, 7.816000, 32.100, 0.690, 4.140, 1.000},
	{752.033113, 243.400000, 0.396000, 30.860, 0.680, 4.352, 0.840},
	{841.051732, 0.013400, 8.177000, 15.900, 0.330, 5.760, 0.450},
	{859.965698, 0.132500, 8.055000, 30.600, 0.680, 4.090, 0.840},
	{899.303175, 0.054700, 7.914000, 29.850, 0.680, 4.530, 0.900},
	{902.611085, 0.038600, 8.429000, 28.650, 0.700, 5.100, 0.950},
	{906.205957, 0.183600, 5.110000, 24.080, 0.700, 4.700, 0.530},
	{916.171582, 8.400000, 1.441000, 26.730, 0.700, 5.150, 0.780},
	{923.112692, 0.007900, 10.293000, 29.000, 0.700, 5.000, 0.800},
	{970.315022, 9.009000, 1.919000, 25.500, 0.640, 4.940, 0.670},
	{987.926764, 134.600000, 0.257000, 29.850, 0.680, 4.550, 0.900},
	{1780.000000, 17506.000000, 0.952000, 196.300, 2.000, 24.150, 5.000},
}

func p67613ExactSpecificAttenuation(frequencyGHz, dryPressureHPA, temperatureK, waterVapourDensityGM3 float64) (oxygenLine, dryContinuum, waterVapour float64) {
	theta := 300 / temperatureK
	e := waterVapourDensityGM3 * temperatureK / 216.7
	for _, line := range p67613OxygenLines {
		width := line.A3 * 1e-4 * (dryPressureHPA*math.Pow(theta, 0.8-line.A4) + 1.1*e*theta)
		width = math.Sqrt(width*width + 2.25e-6)
		delta := (line.A5 + line.A6*theta) * 1e-4 * (dryPressureHPA + e) * math.Pow(theta, 0.8)
		shape := frequencyGHz / line.F0 * ((width-delta*(line.F0-frequencyGHz))/(math.Pow(line.F0-frequencyGHz, 2)+width*width) + (width-delta*(line.F0+frequencyGHz))/(math.Pow(line.F0+frequencyGHz, 2)+width*width))
		strength := line.A1 * 1e-7 * dryPressureHPA * math.Pow(theta, 3) * math.Exp(line.A2*(1-theta))
		oxygenLine += strength * shape
	}
	continuumWidth := 5.6e-4 * (dryPressureHPA + e) * math.Pow(theta, 0.8)
	dryContinuum = frequencyGHz * dryPressureHPA * math.Pow(theta, 2) * (6.14e-5/(continuumWidth*(1+math.Pow(frequencyGHz/continuumWidth, 2))) + 1.4e-12*dryPressureHPA*math.Pow(theta, 1.5)/(1+1.9e-5*math.Pow(frequencyGHz, 1.5)))
	oxygenLine *= 0.1820 * frequencyGHz
	dryContinuum *= 0.1820 * frequencyGHz
	for _, line := range p67613WaterLines {
		width := line.B3 * 1e-4 * (dryPressureHPA*math.Pow(theta, line.B4) + line.B5*e*math.Pow(theta, line.B6))
		width = 0.535*width + math.Sqrt(0.217*width*width+2.1316e-12*line.F0*line.F0/theta)
		shape := frequencyGHz / line.F0 * (width/(math.Pow(line.F0-frequencyGHz, 2)+width*width) + width/(math.Pow(line.F0+frequencyGHz, 2)+width*width))
		strength := line.B1 * 1e-1 * e * math.Pow(theta, 3.5) * math.Exp(line.B2*(1-theta))
		waterVapour += strength * shape
	}
	waterVapour *= 0.1820 * frequencyGHz
	return oxygenLine, dryContinuum, waterVapour
}

type p8383Curve struct{ A, B, C float64 }

var p8383KH = [...]p8383Curve{{-5.33980, -0.10008, 1.13098}, {-0.35351, 1.2697, 0.454}, {-0.23789, 0.86036, 0.15354}, {-0.94158, 0.64552, 0.16817}}
var p8383KV = [...]p8383Curve{{-3.80595, 0.56934, 0.81061}, {-3.44965, -0.22911, 0.51059}, {-0.39902, 0.73042, 0.11899}, {0.50167, 1.07319, 0.27195}}
var p8383AlphaH = [...]p8383Curve{{-0.14318, 1.82442, -0.55187}, {0.29591, 0.77564, 0.19822}, {0.32177, 0.63773, 0.13164}, {-5.37610, -0.96230, 1.47828}, {16.1721, -3.29980, 3.4399}}
var p8383AlphaV = [...]p8383Curve{{-0.07771, 2.3384, -0.76284}, {0.56727, 0.95545, 0.54039}, {-0.20238, 1.1452, 0.26809}, {-48.2991, 0.791669, 0.116226}, {48.5833, 0.791459, 0.116479}}

func p8383CurveValue(frequencyGHz float64, curves []p8383Curve, slope, intercept float64) float64 {
	logFrequency := math.Log10(frequencyGHz)
	sum := 0.0
	for _, curve := range curves {
		sum += curve.A * math.Exp(-math.Pow((logFrequency-curve.B)/curve.C, 2))
	}
	return sum + slope*logFrequency + intercept
}

func p8383LinearCoefficients(frequencyGHz float64) (kH, alphaH, kV, alphaV float64) {
	kH = math.Pow(10, p8383CurveValue(frequencyGHz, p8383KH[:], -0.18961, 0.71147))
	kV = math.Pow(10, p8383CurveValue(frequencyGHz, p8383KV[:], -0.16398, 0.63297))
	alphaH = p8383CurveValue(frequencyGHz, p8383AlphaH[:], 0.67849, -1.95537)
	alphaV = p8383CurveValue(frequencyGHz, p8383AlphaV[:], -0.053739, 0.83433)
	return
}

func p8383CombinedCoefficients(kH, alphaH, kV, alphaV, elevationDeg, polarizationTiltDeg float64) (k, alpha float64) {
	geometryFactor := math.Pow(math.Cos(elevationDeg*math.Pi/180), 2) * math.Cos(2*polarizationTiltDeg*math.Pi/180)
	k = (kH + kV + (kH-kV)*geometryFactor) / 2
	alpha = (kH*alphaH + kV*alphaV + (kH*alphaH-kV*alphaV)*geometryFactor) / (2 * k)
	return
}

func p8409SpecificAttenuationCoefficient(frequencyGHz, temperatureK float64) float64 {
	theta := 300 / temperatureK
	epsilon0 := 77.66 + 103.3*(theta-1)
	epsilon1 := 0.0671 * epsilon0
	epsilon2 := 3.52
	fp := 20.20 - 146*(theta-1) + 316*math.Pow(theta-1, 2)
	fs := 39.8 * fp
	epsilonPrime := (epsilon0-epsilon1)/(1+math.Pow(frequencyGHz/fp, 2)) + (epsilon1-epsilon2)/(1+math.Pow(frequencyGHz/fs, 2)) + epsilon2
	epsilonDoublePrime := frequencyGHz*(epsilon0-epsilon1)/(fp*(1+math.Pow(frequencyGHz/fp, 2))) + frequencyGHz*(epsilon1-epsilon2)/(fs*(1+math.Pow(frequencyGHz/fs, 2)))
	eta := (2 + epsilonPrime) / epsilonDoublePrime
	return 0.819 * frequencyGHz / (epsilonDoublePrime * (1 + eta*eta))
}
