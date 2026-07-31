package raytracer

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

const (
	DefaultPathSampleSpacingM = 10.0
	MinPathSampleSpacingM     = 2.0
	MaxPathSampleSpacingM     = 100.0
	MaxPathProfileSamples     = 2500
)

type PathEndpointInput struct {
	Lon *float64 `json:"lon"`
	Lat *float64 `json:"lat"`
}

type PropagationFidelityInput struct {
	BuildingLossMode                    string   `json:"building_loss_mode"`
	DiffractionModel                    string   `json:"diffraction_model"`
	DefaultWallMaterial                 string   `json:"default_wall_material"`
	ClutterSpecificAttenuationDBPerKM   *float64 `json:"clutter_specific_attenuation_db_per_km"`
	VegetationDepthM                    *float64 `json:"vegetation_depth_m"`
	VegetationSpecificAttenuationDBPerM *float64 `json:"vegetation_specific_attenuation_db_per_m"`
	GasSpecificAttenuationDBPerKM       *float64 `json:"gas_specific_attenuation_db_per_km"`
	RainSpecificAttenuationDBPerKM      *float64 `json:"rain_specific_attenuation_db_per_km"`
	ShadowSigmaDB                       *float64 `json:"shadow_sigma_db"`
}

type PathProfileRequestInput struct {
	Transmitter         PathEndpointInput        `json:"transmitter"`
	Receiver            PathEndpointInput        `json:"receiver"`
	SampleSpacingM      *float64                 `json:"sample_spacing_m"`
	ModelProfile        string                   `json:"model_profile"`
	AzimuthDeg          *float64                 `json:"azimuth"`
	CalibrationOffsetDB *float64                 `json:"calibration_offset_db"`
	RFProfile           *CellRFProfileInput      `json:"rf_profile"`
	Fidelity            PropagationFidelityInput `json:"fidelity"`
}

type PropagationFidelity struct {
	BuildingLossMode                    string  `json:"building_loss_mode"`
	DiffractionModel                    string  `json:"diffraction_model"`
	DefaultWallMaterial                 string  `json:"default_wall_material"`
	ClutterSpecificAttenuationDBPerKM   float64 `json:"clutter_specific_attenuation_db_per_km"`
	VegetationDepthM                    float64 `json:"vegetation_depth_m"`
	VegetationSpecificAttenuationDBPerM float64 `json:"vegetation_specific_attenuation_db_per_m"`
	GasSpecificAttenuationDBPerKM       float64 `json:"gas_specific_attenuation_db_per_km"`
	RainSpecificAttenuationDBPerKM      float64 `json:"rain_specific_attenuation_db_per_km"`
	ShadowSigmaDB                       float64 `json:"shadow_sigma_db"`
}

type PathProfileRequest struct {
	Transmitter         Point               `json:"transmitter"`
	Receiver            Point               `json:"receiver"`
	SampleSpacingM      float64             `json:"sample_spacing_m"`
	ModelProfile        string              `json:"model_profile"`
	AzimuthDeg          float64             `json:"azimuth"`
	CalibrationOffsetDB float64             `json:"calibration_offset_db"`
	RFProfile           CellRFProfile       `json:"rf_profile"`
	Fidelity            PropagationFidelity `json:"fidelity"`
}

type PathProfileSample struct {
	DistanceM             float64 `json:"distance_m"`
	Lon                   float64 `json:"lon"`
	Lat                   float64 `json:"lat"`
	TerrainElevationM     float64 `json:"terrain_elevation_m"`
	TerrainAvailable      bool    `json:"terrain_available"`
	BuildingHeightM       float64 `json:"building_height_m"`
	BuildingID            string  `json:"building_id,omitempty"`
	BuildingMaterial      string  `json:"building_material,omitempty"`
	BuildingHeightSource  string  `json:"building_height_source,omitempty"`
	ObstructionElevationM float64 `json:"obstruction_elevation_m"`
	LineOfSightElevationM float64 `json:"line_of_sight_elevation_m"`
	FresnelRadiusM        float64 `json:"fresnel_radius_m"`
	ClearanceM            float64 `json:"clearance_m"`
}

type PathObstruction struct {
	Kind            string  `json:"kind"`
	DistanceM       float64 `json:"distance_m"`
	ClearanceM      float64 `json:"clearance_m"`
	HeightAboveLOSM float64 `json:"height_above_los_m"`
	BuildingID      string  `json:"building_id,omitempty"`
	Material        string  `json:"material,omitempty"`
}

type LossComponent struct {
	ID        string  `json:"id"`
	Label     string  `json:"label"`
	LossDB    float64 `json:"loss_db"`
	Enabled   bool    `json:"enabled"`
	Method    string  `json:"method"`
	Reference string  `json:"reference,omitempty"`
	Note      string  `json:"note,omitempty"`
}

type PathLossBudget struct {
	Components          []LossComponent `json:"components"`
	TotalMedianLossDB   float64         `json:"total_median_loss_db"`
	RxDBmP50            float64         `json:"rx_dbm_p50"`
	RxDBmP90Reliability float64         `json:"rx_dbm_p90_reliability"`
	RxDBmUpper90        float64         `json:"rx_dbm_upper_90"`
	ShadowSigmaDB       float64         `json:"shadow_sigma_db"`
	Definition          string          `json:"definition"`
}

type ModelApplicability struct {
	ProfileID           string  `json:"profile_id"`
	Reference           string  `json:"reference"`
	FrequencyMinGHz     float64 `json:"frequency_min_ghz"`
	FrequencyMaxGHz     float64 `json:"frequency_max_ghz"`
	FrequencyApplicable bool    `json:"frequency_applicable"`
	Implementation      string  `json:"implementation"`
	Note                string  `json:"note"`
}

type PathProfileResponse struct {
	DistanceM           float64             `json:"distance_m"`
	Classification      string              `json:"classification"`
	MinimumClearanceM   float64             `json:"minimum_clearance_m"`
	MinimumFresnelRatio float64             `json:"minimum_fresnel_ratio"`
	DominantObstruction *PathObstruction    `json:"dominant_obstruction,omitempty"`
	Samples             []PathProfileSample `json:"samples"`
	Terrain             TerrainMetadata     `json:"terrain"`
	LossBudget          PathLossBudget      `json:"loss_budget"`
	Applicability       ModelApplicability  `json:"applicability"`
	RFProfile           CellRFProfile       `json:"rf_profile"`
	Fidelity            PropagationFidelity `json:"fidelity"`
}

func (input PathProfileRequestInput) ToRequest() PathProfileRequest {
	frequency := float64(DefaultFrequencyGHz)
	if input.RFProfile != nil && input.RFProfile.FrequencyGHz != nil {
		frequency = *input.RFProfile.FrequencyGHz
	}
	defaults := DefaultCellRFProfile(NetworkTechnologyForFrequency(frequency), frequency, DefaultTxPowerDBm, DefaultRadiusMeters, DefaultBeamWidthDeg, 0, 0, 0)
	profile := input.RFProfile.WithDefaults(defaults)
	model := strings.ToLower(strings.TrimSpace(input.ModelProfile))
	if model == "" {
		model = DefaultPathModelProfile(profile.FrequencyGHz)
	}
	fidelity := PropagationFidelity{
		BuildingLossMode:                    cleanChoice(input.Fidelity.BuildingLossMode, "screen-diffraction"),
		DiffractionModel:                    cleanChoice(input.Fidelity.DiffractionModel, "single-knife-edge"),
		DefaultWallMaterial:                 cleanChoice(input.Fidelity.DefaultWallMaterial, "concrete"),
		ClutterSpecificAttenuationDBPerKM:   valueOr(input.Fidelity.ClutterSpecificAttenuationDBPerKM, 0),
		VegetationDepthM:                    valueOr(input.Fidelity.VegetationDepthM, 0),
		VegetationSpecificAttenuationDBPerM: valueOr(input.Fidelity.VegetationSpecificAttenuationDBPerM, 0),
		GasSpecificAttenuationDBPerKM:       valueOr(input.Fidelity.GasSpecificAttenuationDBPerKM, 0),
		RainSpecificAttenuationDBPerKM:      valueOr(input.Fidelity.RainSpecificAttenuationDBPerKM, 0),
		ShadowSigmaDB:                       valueOr(input.Fidelity.ShadowSigmaDB, 0),
	}
	return PathProfileRequest{
		Transmitter:    Point{Lon: valueOr(input.Transmitter.Lon, 0), Lat: valueOr(input.Transmitter.Lat, 0)},
		Receiver:       Point{Lon: valueOr(input.Receiver.Lon, 0), Lat: valueOr(input.Receiver.Lat, 0)},
		SampleSpacingM: valueOr(input.SampleSpacingM, DefaultPathSampleSpacingM),
		ModelProfile:   model, AzimuthDeg: normalizeDegrees(valueOr(input.AzimuthDeg, 0)),
		CalibrationOffsetDB: valueOr(input.CalibrationOffsetDB, 0), RFProfile: profile, Fidelity: fidelity,
	}
}

func DefaultPathModelProfile(frequencyGHz float64) string {
	switch {
	case frequencyGHz <= 6:
		return "terrain-profile"
	case frequencyGHz <= 100:
		return "urban-short-range"
	default:
		return "research-sub-thz"
	}
}

func ValidatePathProfileRequest(input PathProfileRequestInput, request PathProfileRequest) string {
	if input.Transmitter.Lon == nil || input.Transmitter.Lat == nil || input.Receiver.Lon == nil || input.Receiver.Lat == nil {
		return "transmitter and receiver coordinates are required"
	}
	for label, point := range map[string]Point{"transmitter": request.Transmitter, "receiver": request.Receiver} {
		if !finiteInRange(point.Lon, -180, 180) || !finiteInRange(point.Lat, -90, 90) {
			return label + " coordinates are invalid"
		}
	}
	distance := ApproxDistanceMeters(request.Transmitter, request.Receiver)
	if distance < 1 || distance > MaxRadiusMeters {
		return fmt.Sprintf("path distance must be between 1 and %d metres", MaxRadiusMeters)
	}
	if !finiteInRange(request.SampleSpacingM, MinPathSampleSpacingM, MaxPathSampleSpacingM) {
		return fmt.Sprintf("sample_spacing_m must be between %.0f and %.0f", MinPathSampleSpacingM, MaxPathSampleSpacingM)
	}
	if int(math.Ceil(distance/request.SampleSpacingM))+1 > MaxPathProfileSamples {
		return fmt.Sprintf("path profile exceeds the %d-sample limit; increase sample_spacing_m", MaxPathProfileSamples)
	}
	if validationError := ValidateCellRFProfile(request.RFProfile, false); validationError != "" {
		return validationError
	}
	applicability := PathModelApplicability(request.ModelProfile, request.RFProfile.FrequencyGHz)
	if applicability.ProfileID == "" {
		return "model_profile must be terrain-profile, urban-short-range, or research-sub-thz"
	}
	if !applicability.FrequencyApplicable {
		return fmt.Sprintf("model_profile %s applies from %.2f to %.0f GHz", applicability.ProfileID, applicability.FrequencyMinGHz, applicability.FrequencyMaxGHz)
	}
	if !oneOf(request.Fidelity.BuildingLossMode, "screen-diffraction", "penetration", "none") {
		return "fidelity.building_loss_mode must be screen-diffraction, penetration, or none"
	}
	if !oneOf(request.Fidelity.DiffractionModel, "single-knife-edge", "none") {
		return "fidelity.diffraction_model must be single-knife-edge or none"
	}
	if !oneOf(request.Fidelity.DefaultWallMaterial, "concrete", "brick", "glass", "wood", "metal", "unknown") {
		return "fidelity.default_wall_material is unsupported"
	}
	values := []float64{request.Fidelity.ClutterSpecificAttenuationDBPerKM, request.Fidelity.VegetationDepthM, request.Fidelity.VegetationSpecificAttenuationDBPerM, request.Fidelity.GasSpecificAttenuationDBPerKM, request.Fidelity.RainSpecificAttenuationDBPerKM, request.Fidelity.ShadowSigmaDB}
	limits := []float64{100, 5000, 10, 100, 100, 30}
	for index, value := range values {
		if !finiteInRange(value, 0, limits[index]) {
			return "fidelity attenuation and uncertainty values must be finite and within supported ranges"
		}
	}
	return ""
}

func AnalyzePathProfileContext(ctx context.Context, request PathProfileRequest, terrain TerrainModel, buildings *BuildingIndex) (PathProfileResponse, error) {
	if err := ctx.Err(); err != nil {
		return PathProfileResponse{}, err
	}
	distance := ApproxDistanceMeters(request.Transmitter, request.Receiver)
	if distance <= 0 {
		return PathProfileResponse{}, errors.New("path distance must be positive")
	}
	sampleCount := int(math.Ceil(distance/request.SampleSpacingM)) + 1
	if sampleCount > MaxPathProfileSamples {
		return PathProfileResponse{}, errors.New("path profile sample limit exceeded")
	}
	terrainMeta := TerrainMetadata{Available: false, Limitations: []string{"dataset pack does not include terrain; a zero-metre local datum is used"}}
	if terrain != nil {
		terrainMeta = terrain.Metadata()
	}
	txGround, txTerrainAvailable := terrainElevation(terrain, request.Transmitter)
	rxGround, rxTerrainAvailable := terrainElevation(terrain, request.Receiver)
	txElevation := txGround + request.RFProfile.AntennaHeightM
	rxElevation := rxGround + request.RFProfile.ReceiverHeightM
	bearing := BearingDegrees(request.Transmitter, request.Receiver)
	wavelength := 0.299792458 / request.RFProfile.FrequencyGHz
	samples := make([]PathProfileSample, 0, sampleCount)
	minimumClearance := math.Inf(1)
	minimumFresnelRatio := math.Inf(1)
	maxHeightAboveLOS := math.Inf(-1)
	var dominant *PathObstruction
	obstructingBuildings := make(map[string]*BuildingFootprint)
	for index := 0; index < sampleCount; index++ {
		if index%64 == 0 {
			if err := ctx.Err(); err != nil {
				return PathProfileResponse{}, err
			}
		}
		distanceM := math.Min(float64(index)*request.SampleSpacingM, distance)
		if index == sampleCount-1 {
			distanceM = distance
		}
		point := DestinationPoint(request.Transmitter, bearing, distanceM)
		ground, available := terrainElevation(terrain, point)
		buildingHeight := 0.0
		var building *BuildingFootprint
		if index > 0 && index < sampleCount-1 && buildings != nil {
			building = buildings.BuildingAt(point)
			if building != nil {
				buildingHeight = building.HeightMeters
			}
		}
		obstructionElevation := ground + buildingHeight
		fraction := distanceM / distance
		lineElevation := txElevation + (rxElevation-txElevation)*fraction
		fresnelRadius := 0.0
		if distanceM > 0 && distanceM < distance {
			fresnelRadius = math.Sqrt(wavelength * distanceM * (distance - distanceM) / distance)
		}
		clearance := lineElevation - obstructionElevation
		if index > 0 && index < sampleCount-1 {
			minimumClearance = math.Min(minimumClearance, clearance)
			if fresnelRadius > 0 {
				minimumFresnelRatio = math.Min(minimumFresnelRatio, clearance/fresnelRadius)
			}
			heightAboveLOS := -clearance
			if heightAboveLOS > maxHeightAboveLOS {
				kind := "terrain"
				obstruction := &PathObstruction{Kind: kind, DistanceM: round1(distanceM), ClearanceM: round1(clearance), HeightAboveLOSM: round1(math.Max(heightAboveLOS, 0))}
				if building != nil {
					obstruction.Kind = "building"
					obstruction.BuildingID = building.ID
					obstruction.Material = building.Material
				}
				dominant = obstruction
				maxHeightAboveLOS = heightAboveLOS
			}
			if building != nil && obstructionElevation >= lineElevation {
				obstructingBuildings[building.ID] = building
			}
		}
		sample := PathProfileSample{
			DistanceM: round1(distanceM), Lon: roundCoordinate(point.Lon), Lat: roundCoordinate(point.Lat),
			TerrainElevationM: round1(ground), TerrainAvailable: available,
			BuildingHeightM: round1(buildingHeight), ObstructionElevationM: round1(obstructionElevation),
			LineOfSightElevationM: round1(lineElevation), FresnelRadiusM: round1(fresnelRadius), ClearanceM: round1(clearance),
		}
		if building != nil {
			sample.BuildingID, sample.BuildingMaterial, sample.BuildingHeightSource = building.ID, building.Material, building.HeightSource
		}
		samples = append(samples, sample)
	}
	if math.IsInf(minimumClearance, 1) {
		minimumClearance = math.Min(request.RFProfile.AntennaHeightM, request.RFProfile.ReceiverHeightM)
	}
	if math.IsInf(minimumFresnelRatio, 1) {
		minimumFresnelRatio = 1
	}
	classification := "line-of-sight"
	if maxHeightAboveLOS > 0 && dominant != nil {
		classification = dominant.Kind + "-obstructed"
	} else if minimumFresnelRatio < 0.6 {
		classification = "fresnel-zone-obstructed"
	}
	lossBudget := pathLossBudget(request, distance, bearing, dominant, obstructingBuildings)
	if dominant != nil && dominant.HeightAboveLOSM <= 0 && classification == "line-of-sight" {
		dominant = nil
	}
	if terrain == nil {
		txTerrainAvailable, rxTerrainAvailable = false, false
	}
	if !txTerrainAvailable || !rxTerrainAvailable {
		terrainMeta.Limitations = appendUniqueString(terrainMeta.Limitations, "one or both endpoints fall outside valid terrain pixels; missing elevations use the zero-metre local datum")
	}
	return PathProfileResponse{
		DistanceM: round1(distance), Classification: classification,
		MinimumClearanceM: round1(minimumClearance), MinimumFresnelRatio: round2(minimumFresnelRatio),
		DominantObstruction: dominant, Samples: samples, Terrain: terrainMeta, LossBudget: lossBudget,
		Applicability: PathModelApplicability(request.ModelProfile, request.RFProfile.FrequencyGHz), RFProfile: request.RFProfile, Fidelity: request.Fidelity,
	}, nil
}

func PathModelApplicability(profile string, frequencyGHz float64) ModelApplicability {
	result := ModelApplicability{ProfileID: strings.ToLower(strings.TrimSpace(profile)), Implementation: "inspectable planning approximation; not a complete implementation of the cited Recommendation"}
	switch result.ProfileID {
	case "terrain-profile":
		result.Reference, result.FrequencyMinGHz, result.FrequencyMaxGHz = "ITU-R P.1812-8", 0.03, 6
		result.Note = "Terrain/building profile with free-space loss and explicitly selected single-knife-edge diffraction."
	case "urban-short-range":
		result.Reference, result.FrequencyMinGHz, result.FrequencyMaxGHz = "ITU-R P.1411-9", 0.3, 100
		result.Note = "Short-range outdoor profile with building-screen classification and inspectable additive losses."
	case "research-sub-thz":
		result.Reference, result.FrequencyMinGHz, result.FrequencyMaxGHz = "research planning profile", 100, MaxFrequencyGHz
		result.Note = "Outside P.1812/P.1411 frequency applicability; gas, rain, clutter, and vegetation losses must be supplied explicitly."
	default:
		return ModelApplicability{}
	}
	result.FrequencyApplicable = frequencyGHz >= result.FrequencyMinGHz && frequencyGHz <= result.FrequencyMaxGHz
	return result
}

func pathLossBudget(request PathProfileRequest, distance, bearing float64, dominant *PathObstruction, buildings map[string]*BuildingFootprint) PathLossBudget {
	profile := request.RFProfile
	horizontalOffset := smallestAngleDifference(bearing, profile.EffectiveAzimuth(request.AzimuthDeg))
	freeSpace := FreeSpacePathLossMetersGHz(profile.SlantDistanceMeters(distance), profile.FrequencyGHz)
	pattern := profile.PatternAttenuationDB(distance, horizontalOffset)
	diffraction := 0.0
	if request.Fidelity.DiffractionModel == "single-knife-edge" && request.Fidelity.BuildingLossMode != "penetration" && dominant != nil {
		diffraction = KnifeEdgeLossDB(dominant.HeightAboveLOSM, dominant.DistanceM, distance-dominant.DistanceM, profile.FrequencyGHz)
	}
	wallLoss := 0.0
	materials := make([]string, 0, len(buildings))
	if request.Fidelity.BuildingLossMode == "penetration" {
		ids := make([]string, 0, len(buildings))
		for id := range buildings {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			material := buildings[id].Material
			if material == "unknown" {
				material = request.Fidelity.DefaultWallMaterial
			}
			materials = append(materials, material)
			wallLoss += MaterialPenetrationLossDB(material, profile.FrequencyGHz)
		}
	}
	distanceKM := distance / 1000
	clutter := request.Fidelity.ClutterSpecificAttenuationDBPerKM * distanceKM
	vegetation := request.Fidelity.VegetationDepthM * request.Fidelity.VegetationSpecificAttenuationDBPerM
	gas := request.Fidelity.GasSpecificAttenuationDBPerKM * distanceKM
	rain := request.Fidelity.RainSpecificAttenuationDBPerKM * distanceKM
	calibrationLoss := -request.CalibrationOffsetDB
	components := []LossComponent{
		{ID: "free-space", Label: "Free-space path loss", LossDB: round2(freeSpace), Enabled: true, Method: "distance/frequency FSPL"},
		{ID: "antenna-pattern", Label: "Antenna pattern", LossDB: round2(pattern), Enabled: pattern != 0, Method: profile.HorizontalPatternID + " + " + profile.VerticalPatternID},
		{ID: "system", Label: "System loss", LossDB: round2(profile.SystemLossDB), Enabled: profile.SystemLossDB != 0, Method: "per-cell RF profile"},
		{ID: "wall-penetration", Label: "Material penetration", LossDB: round2(wallLoss), Enabled: request.Fidelity.BuildingLossMode == "penetration" && len(buildings) > 0, Method: "planning material multiplier", Reference: "ITU-R P.2040", Note: strings.Join(materials, ", ")},
		{ID: "diffraction", Label: "Knife-edge diffraction", LossDB: round2(diffraction), Enabled: request.Fidelity.DiffractionModel == "single-knife-edge" && diffraction > 0, Method: "single dominant edge", Reference: "ITU-R P.526"},
		{ID: "clutter", Label: "Clutter", LossDB: round2(clutter), Enabled: request.Fidelity.ClutterSpecificAttenuationDBPerKM > 0, Method: "user-supplied dB/km sensitivity"},
		{ID: "vegetation", Label: "Vegetation", LossDB: round2(vegetation), Enabled: request.Fidelity.VegetationDepthM > 0 && request.Fidelity.VegetationSpecificAttenuationDBPerM > 0, Method: "user-supplied depth × dB/m sensitivity"},
		{ID: "atmospheric-gas", Label: "Atmospheric gas", LossDB: round2(gas), Enabled: request.Fidelity.GasSpecificAttenuationDBPerKM > 0, Method: "user-supplied specific attenuation", Reference: "ITU-R P.676"},
		{ID: "rain", Label: "Rain", LossDB: round2(rain), Enabled: request.Fidelity.RainSpecificAttenuationDBPerKM > 0, Method: "user-supplied specific attenuation", Reference: "ITU-R P.838"},
		{ID: "calibration", Label: "Calibration correction", LossDB: round2(calibrationLoss), Enabled: request.CalibrationOffsetDB != 0, Method: "signed project calibration offset"},
	}
	total := freeSpace + pattern + profile.SystemLossDB + wallLoss + diffraction + clutter + vegetation + gas + rain + calibrationLoss
	rxP50 := profile.TxPowerDBm + profile.AntennaGainDBi - total
	margin := 1.2815515655446004 * request.Fidelity.ShadowSigmaDB
	return PathLossBudget{
		Components: components, TotalMedianLossDB: round2(total), RxDBmP50: round2(rxP50),
		RxDBmP90Reliability: round2(rxP50 - margin), RxDBmUpper90: round2(rxP50 + margin), ShadowSigmaDB: round2(request.Fidelity.ShadowSigmaDB),
		Definition: "P50 is the median planning estimate; p90_reliability is the one-sided 90% lower received-power bound under the selected zero-mean Gaussian shadow sigma.",
	}
}

func KnifeEdgeLossDB(heightAboveLOS, distanceFromTx, distanceToRx, frequencyGHz float64) float64 {
	if heightAboveLOS <= 0 || distanceFromTx <= 0 || distanceToRx <= 0 || frequencyGHz <= 0 {
		return 0
	}
	wavelength := 0.299792458 / frequencyGHz
	v := heightAboveLOS * math.Sqrt(2*(distanceFromTx+distanceToRx)/(wavelength*distanceFromTx*distanceToRx))
	if v <= -0.78 {
		return 0
	}
	return math.Max(0, 6.9+20*math.Log10(math.Sqrt(math.Pow(v-0.1, 2)+1)+v-0.1))
}

func MaterialPenetrationLossDB(material string, frequencyGHz float64) float64 {
	multiplier := map[string]float64{"wood": 0.35, "glass": 0.55, "brick": 0.8, "concrete": 1, "unknown": 1, "metal": 1.35}[strings.ToLower(strings.TrimSpace(material))]
	if multiplier == 0 {
		multiplier = 1
	}
	return PenetrationLossForFrequencyGHz(frequencyGHz) * multiplier
}

func terrainElevation(terrain TerrainModel, point Point) (float64, bool) {
	if terrain == nil {
		return 0, false
	}
	return terrain.Elevation(point)
}

func cleanChoice(value, fallback string) string {
	cleaned := strings.ToLower(strings.TrimSpace(value))
	if cleaned == "" {
		return fallback
	}
	return cleaned
}

func round1(value float64) float64          { return math.Round(value*10) / 10 }
func round2(value float64) float64          { return math.Round(value*100) / 100 }
func roundCoordinate(value float64) float64 { return math.Round(value*1e7) / 1e7 }

func appendUniqueString(values []string, candidate string) []string {
	for _, value := range values {
		if value == candidate {
			return values
		}
	}
	return append(values, candidate)
}
