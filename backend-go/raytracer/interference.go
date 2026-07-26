package raytracer

import (
	"context"
	"fmt"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
)

const (
	DefaultInterferenceBandwidthLTE = 20.0
	DefaultInterferenceBandwidthNR  = 100.0
	DefaultInterferenceLoadFactor   = 0.7
	DefaultInterferenceNoiseFigure  = 7.0
	DefaultInterferenceSpacingM     = 40.0
	MaxInterferenceSamples          = 3000
	MaxInterferenceDemandFeatures   = 500
	InterferenceRSRPThresholdDBm    = -110.0
	InterferenceSINRThresholdDB     = 0.0
	InterferenceRSRQThresholdDB     = -20.0
)

type InterferenceTowerRequest struct {
	ID         string  `json:"id"`
	TowerLon   float64 `json:"tower_lon"`
	TowerLat   float64 `json:"tower_lat"`
	AzimuthDeg float64 `json:"azimuth"`
}

type InterferenceRequest struct {
	NetworkTech         string                     `json:"network_tech"`
	Towers              []InterferenceTowerRequest `json:"towers"`
	RadiusMeters        float64                    `json:"radius_m"`
	FrequencyGHz        float64                    `json:"frequency_ghz"`
	TxPowerDBm          float64                    `json:"tx_power_dbm"`
	BeamWidthDeg        float64                    `json:"beam_width"`
	BandwidthMHz        float64                    `json:"bandwidth_mhz"`
	LoadFactor          float64                    `json:"load_factor"`
	ReuseFactor         int                        `json:"reuse_factor"`
	NoiseFigureDB       float64                    `json:"noise_figure_db"`
	SampleSpacingM      float64                    `json:"sample_spacing_m"`
	CalibrationOffsetDB float64                    `json:"calibration_offset_db,omitempty"`
}

type InterferenceResponse struct {
	GeoJSON       InterferenceFeatureCollection `json:"geojson"`
	DemandGeoJSON InterferenceFeatureCollection `json:"demand_geojson"`
	Stats         InterferenceStats             `json:"stats"`
	Model         InterferenceModel             `json:"model"`
}

type InterferenceFeatureCollection struct {
	Type     string                `json:"type"`
	Features []InterferenceFeature `json:"features"`
}

type InterferenceFeature struct {
	Type       string                 `json:"type"`
	Properties InterferenceProperties `json:"properties"`
	Geometry   PointGeometry          `json:"geometry"`
}

type InterferenceProperties struct {
	SampleID               string   `json:"sample_id"`
	ServingCellID          string   `json:"serving_cell_id,omitempty"`
	ChannelID              string   `json:"channel_id,omitempty"`
	RSRPDBm                *float64 `json:"rsrp_dbm"`
	SINRDB                 *float64 `json:"sinr_db"`
	RSRQDB                 *float64 `json:"rsrq_db"`
	RSSIDBm                *float64 `json:"rssi_dbm"`
	InterferenceDBm        *float64 `json:"interference_dbm"`
	QualityClass           string   `json:"quality_class"`
	Serviceable            bool     `json:"serviceable"`
	InterferenceLimited    bool     `json:"interference_limited"`
	WallCount              int      `json:"wall_count"`
	StrongestInterfererID  string   `json:"strongest_interferer_id,omitempty"`
	StrongestInterfererDBm *float64 `json:"strongest_interferer_dbm,omitempty"`
	ContributingCells      int      `json:"contributing_cells"`
	BuildingID             string   `json:"building_id,omitempty"`
	DemandWeight           float64  `json:"demand_weight,omitempty"`
	ResidentialDemand      float64  `json:"residential_demand,omitempty"`
	TotalDemand            float64  `json:"total_demand,omitempty"`
	Reason                 string   `json:"reason,omitempty"`
}

type InterferenceStats struct {
	SampleCount              int                       `json:"sample_count"`
	SignalSamples            int                       `json:"signal_samples"`
	ValidSampleCount         int                       `json:"valid_sample_count"`
	NoSignalCount            int                       `json:"no_signal_count"`
	ServiceableSamples       int                       `json:"serviceable_samples"`
	ServiceablePct           float64                   `json:"serviceable_pct"`
	InterferenceLimitedCount int                       `json:"interference_limited_count"`
	InterferenceLimitedPct   float64                   `json:"interference_limited_pct"`
	AvgSINRDB                *float64                  `json:"avg_sinr_db"`
	P10SINRDB                *float64                  `json:"p10_sinr_db"`
	AvgRSRPDBm               *float64                  `json:"avg_rsrp_dbm"`
	P10RSRPDBm               *float64                  `json:"p10_rsrp_dbm"`
	AvgRSRQDB                *float64                  `json:"avg_rsrq_db"`
	P10RSRQDB                *float64                  `json:"p10_rsrq_db"`
	DemandCandidates         int                       `json:"demand_candidates"`
	AffectedDemandBuildings  int                       `json:"affected_demand_buildings"`
	AffectedDemand           float64                   `json:"affected_demand"`
	PerServingCell           []InterferenceCellSummary `json:"per_serving_cell"`
}

type InterferenceCellSummary struct {
	CellID             string  `json:"cell_id"`
	ChannelID          string  `json:"channel_id"`
	ServingSamples     int     `json:"serving_samples"`
	ServiceableSamples int     `json:"serviceable_samples"`
	AvgSINRDB          float64 `json:"avg_sinr_db"`
	AvgRSRPDBm         float64 `json:"avg_rsrp_dbm"`
	AvgRSRQDB          float64 `json:"avg_rsrq_db"`
}

type InterferenceModel struct {
	Type                    string   `json:"type"`
	NetworkTech             string   `json:"network_tech"`
	MeasurementFamily       string   `json:"measurement_family"`
	FrequencyGHz            float64  `json:"frequency_ghz"`
	BandwidthMHz            float64  `json:"bandwidth_mhz"`
	SubcarrierSpacingKHz    float64  `json:"subcarrier_spacing_khz"`
	ResourceBlocks          int      `json:"resource_blocks"`
	NoiseFigureDB           float64  `json:"noise_figure_db"`
	LoadFactor              float64  `json:"load_factor"`
	ReuseFactor             int      `json:"reuse_factor"`
	RequestedSampleSpacingM float64  `json:"requested_sample_spacing_m"`
	EffectiveSampleSpacingM float64  `json:"effective_sample_spacing_m"`
	Assumptions             []string `json:"assumptions"`
}

type interferencePreset struct {
	measurementFamily string
	scsKHz            float64
	resourceBlocks    int
}

type receivedCellSignal struct {
	cellID    string
	channelID string
	rsrpDBm   float64
	wallCount int
}

type gridSample struct {
	point Point
	row   int
	col   int
}

type cellAccumulator struct {
	channelID      string
	servingSamples int
	serviceable    int
	sinrTotal      float64
	rsrpTotal      float64
	rsrqTotal      float64
}

func NormalizeInterferenceRequest(req *InterferenceRequest) {
	req.NetworkTech = strings.ToLower(strings.TrimSpace(req.NetworkTech))
	if req.NetworkTech == "" {
		if req.FrequencyGHz < 10 {
			req.NetworkTech = "4g"
		} else if req.FrequencyGHz < 100 {
			req.NetworkTech = "5g"
		} else {
			req.NetworkTech = "6g"
		}
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = 400
	}
	if req.FrequencyGHz == 0 {
		if req.NetworkTech == "4g" {
			req.FrequencyGHz = 2.6
		} else {
			req.FrequencyGHz = 28
		}
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = 30
	}
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = 120
	}
	if req.BandwidthMHz == 0 {
		if req.NetworkTech == "4g" {
			req.BandwidthMHz = DefaultInterferenceBandwidthLTE
		} else {
			req.BandwidthMHz = DefaultInterferenceBandwidthNR
		}
	}
	if req.LoadFactor == 0 {
		req.LoadFactor = DefaultInterferenceLoadFactor
	}
	if req.ReuseFactor == 0 {
		req.ReuseFactor = 1
	}
	if req.NoiseFigureDB == 0 {
		req.NoiseFigureDB = DefaultInterferenceNoiseFigure
	}
	if req.SampleSpacingM == 0 {
		req.SampleSpacingM = DefaultInterferenceSpacingM
	}
	for index := range req.Towers {
		req.Towers[index].ID = strings.TrimSpace(req.Towers[index].ID)
		req.Towers[index].AzimuthDeg = normalizeDegrees(req.Towers[index].AzimuthDeg)
	}
}

func ValidateInterferenceRequest(req InterferenceRequest) string {
	if req.NetworkTech != "4g" && req.NetworkTech != "5g" {
		return "network_tech must be 4g or 5g; 6g interference KPIs are not applicable"
	}
	if len(req.Towers) < 2 || len(req.Towers) > 6 {
		return "towers must contain between 2 and 6 selected cells"
	}
	seen := make(map[string]bool, len(req.Towers))
	for _, tower := range req.Towers {
		if validationError := ValidateTowerID(tower.ID); validationError != "" {
			return validationError
		}
		if seen[tower.ID] {
			return "tower ids must be unique"
		}
		seen[tower.ID] = true
		if tower.TowerLon < -180 || tower.TowerLon > 180 || tower.TowerLat < -90 || tower.TowerLat > 90 {
			return "each tower must include valid tower_lon and tower_lat coordinates"
		}
	}
	if req.RadiusMeters < 25 || req.RadiusMeters > 5000 {
		return "radius_m must be between 25 and 5000"
	}
	if req.FrequencyGHz <= 0 || req.FrequencyGHz >= 100 {
		return "frequency_ghz must be between 0 and 100 for interference analysis"
	}
	if req.NetworkTech == "4g" && req.FrequencyGHz >= 10 {
		return "4g interference analysis requires frequency_ghz below 10"
	}
	if req.NetworkTech == "5g" && (req.FrequencyGHz < 10 || req.FrequencyGHz >= 100) {
		return "5g interference analysis requires frequency_ghz from 10 up to 100"
	}
	if req.TxPowerDBm < 0 || req.TxPowerDBm > 60 {
		return "tx_power_dbm must be between 0 and 60"
	}
	if req.BeamWidthDeg < 10 || req.BeamWidthDeg > 360 {
		return "beam_width must be between 10 and 360"
	}
	if _, err := interferencePresetFor(req.NetworkTech, req.BandwidthMHz); err != nil {
		return err.Error()
	}
	if req.LoadFactor <= 0 || req.LoadFactor > 1 {
		return "load_factor must be greater than 0 and no more than 1"
	}
	if req.ReuseFactor != 1 && req.ReuseFactor != 3 {
		return "reuse_factor must be 1 or 3"
	}
	if req.NoiseFigureDB < 0 || req.NoiseFigureDB > 20 {
		return "noise_figure_db must be between 0 and 20"
	}
	if req.SampleSpacingM < 20 || req.SampleSpacingM > 200 {
		return "sample_spacing_m must be between 20 and 200"
	}
	if req.CalibrationOffsetDB < -40 || req.CalibrationOffsetDB > 40 {
		return "calibration_offset_db must be between -40 and 40"
	}
	return ""
}

func AnalyzeInterference(req InterferenceRequest, buildings *BuildingIndex) InterferenceResponse {
	response, _ := AnalyzeInterferenceContext(context.Background(), req, buildings)
	return response
}

func AnalyzeInterferenceContext(ctx context.Context, req InterferenceRequest, buildings *BuildingIndex) (InterferenceResponse, error) {
	preset, _ := interferencePresetFor(req.NetworkTech, req.BandwidthMHz)
	samples, effectiveSpacing, err := buildInterferenceGridContext(ctx, req)
	if err != nil {
		return InterferenceResponse{}, err
	}
	features, err := evaluateInterferenceSamplesContext(ctx, req, preset, buildings, samples)
	if err != nil {
		return InterferenceResponse{}, err
	}
	demandFeatures, demandCandidates, affectedDemandBuildings, affectedDemand, err := evaluateDemandInterferenceContext(ctx, req, preset, buildings)
	if err != nil {
		return InterferenceResponse{}, err
	}
	stats := calculateInterferenceStats(req, features, demandCandidates, affectedDemandBuildings, affectedDemand)

	return InterferenceResponse{
		GeoJSON:       InterferenceFeatureCollection{Type: "FeatureCollection", Features: features},
		DemandGeoJSON: InterferenceFeatureCollection{Type: "FeatureCollection", Features: demandFeatures},
		Stats:         stats,
		Model: InterferenceModel{
			Type:                    "deterministic_planning_estimate",
			NetworkTech:             req.NetworkTech,
			MeasurementFamily:       preset.measurementFamily,
			FrequencyGHz:            req.FrequencyGHz,
			BandwidthMHz:            req.BandwidthMHz,
			SubcarrierSpacingKHz:    preset.scsKHz,
			ResourceBlocks:          preset.resourceBlocks,
			NoiseFigureDB:           req.NoiseFigureDB,
			LoadFactor:              req.LoadFactor,
			ReuseFactor:             req.ReuseFactor,
			RequestedSampleSpacingM: req.SampleSpacingM,
			EffectiveSampleSpacingM: roundOne(effectiveSpacing),
			Assumptions: []string{
				"Uniform transmit power across active resource elements.",
				"Only selected co-channel cells inside their configured beam and radius contribute.",
				"FSPL and cumulative frequency-dependent wall-boundary loss are deterministic.",
				"Sidelobes, fading, diffraction, MIMO scheduling, uplink, and adjacent-channel leakage are excluded.",
			},
		},
	}, nil
}

func interferencePresetFor(networkTech string, bandwidthMHz float64) (interferencePreset, error) {
	if networkTech == "4g" {
		resourceBlocks := map[float64]int{1.4: 6, 3: 15, 5: 25, 10: 50, 15: 75, 20: 100}
		if blocks, ok := resourceBlocks[bandwidthMHz]; ok {
			return interferencePreset{measurementFamily: "lte_crs", scsKHz: 15, resourceBlocks: blocks}, nil
		}
		return interferencePreset{}, fmt.Errorf("bandwidth_mhz must be one of 1.4, 3, 5, 10, 15, or 20 for 4g")
	}
	if networkTech == "5g" {
		resourceBlocks := map[float64]int{50: 32, 100: 66, 200: 132, 400: 264}
		if blocks, ok := resourceBlocks[bandwidthMHz]; ok {
			return interferencePreset{measurementFamily: "nr_ss", scsKHz: 120, resourceBlocks: blocks}, nil
		}
		return interferencePreset{}, fmt.Errorf("bandwidth_mhz must be one of 50, 100, 200, or 400 for 5g")
	}
	return interferencePreset{}, fmt.Errorf("network_tech must be 4g or 5g")
}

func buildInterferenceGrid(req InterferenceRequest) ([]gridSample, float64) {
	samples, spacing, _ := buildInterferenceGridContext(context.Background(), req)
	return samples, spacing
}

func buildInterferenceGridContext(ctx context.Context, req InterferenceRequest) ([]gridSample, float64, error) {
	effectiveSpacing := req.SampleSpacingM
	areaEstimate := float64(len(req.Towers)) * math.Pi * req.RadiusMeters * req.RadiusMeters
	minimumSpacing := math.Sqrt(areaEstimate / MaxInterferenceSamples)
	if minimumSpacing > effectiveSpacing {
		effectiveSpacing = minimumSpacing * 1.03
	}

	for attempts := 0; attempts < 5; attempts++ {
		samples, err := generateGridSamplesContext(ctx, req, effectiveSpacing)
		if err != nil {
			return nil, 0, err
		}
		if len(samples) <= MaxInterferenceSamples {
			return samples, effectiveSpacing, nil
		}
		effectiveSpacing *= math.Sqrt(float64(len(samples))/MaxInterferenceSamples) * 1.02
	}

	samples, err := generateGridSamplesContext(ctx, req, effectiveSpacing)
	if err != nil {
		return nil, 0, err
	}
	if len(samples) > MaxInterferenceSamples {
		samples = samples[:MaxInterferenceSamples]
	}
	return samples, effectiveSpacing, nil
}

func generateGridSamples(req InterferenceRequest, spacingMeters float64) []gridSample {
	samples, _ := generateGridSamplesContext(context.Background(), req, spacingMeters)
	return samples
}

func generateGridSamplesContext(ctx context.Context, req InterferenceRequest, spacingMeters float64) ([]gridSample, error) {
	minLon := req.Towers[0].TowerLon
	minLat := req.Towers[0].TowerLat
	meanLat := 0.0
	for _, tower := range req.Towers {
		meanLat += tower.TowerLat
		minLon = math.Min(minLon, tower.TowerLon)
		minLat = math.Min(minLat, tower.TowerLat)
	}
	meanLat /= float64(len(req.Towers))
	latStep := spacingMeters / 111_320
	lonScale := math.Max(math.Cos(meanLat*math.Pi/180), 0.05)
	lonStep := spacingMeters / (111_320 * lonScale)
	originLon := minLon - req.RadiusMeters/(111_320*lonScale) - lonStep
	originLat := minLat - req.RadiusMeters/111_320 - latStep
	radiusSteps := int(math.Ceil(req.RadiusMeters/spacingMeters)) + 1

	unique := make(map[string]gridSample)
	for towerIndex, tower := range req.Towers {
		if towerIndex%4 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		centerCol := int(math.Round((tower.TowerLon - originLon) / lonStep))
		centerRow := int(math.Round((tower.TowerLat - originLat) / latStep))
		for row := centerRow - radiusSteps; row <= centerRow+radiusSteps; row++ {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			for col := centerCol - radiusSteps; col <= centerCol+radiusSteps; col++ {
				point := Point{Lon: originLon + float64(col)*lonStep, Lat: originLat + float64(row)*latStep}
				if ApproxDistanceMeters(Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, point) > req.RadiusMeters {
					continue
				}
				key := fmt.Sprintf("%d:%d", row, col)
				unique[key] = gridSample{point: point, row: row, col: col}
			}
		}
	}

	samples := make([]gridSample, 0, len(unique))
	for _, sample := range unique {
		samples = append(samples, sample)
	}
	sort.Slice(samples, func(i, j int) bool {
		if samples[i].row == samples[j].row {
			return samples[i].col < samples[j].col
		}
		return samples[i].row < samples[j].row
	})
	return samples, nil
}

func evaluateInterferenceSamples(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, samples []gridSample) []InterferenceFeature {
	features, _ := evaluateInterferenceSamplesContext(context.Background(), req, preset, buildings, samples)
	return features
}

func evaluateInterferenceSamplesContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, samples []gridSample) ([]InterferenceFeature, error) {
	features := make([]InterferenceFeature, len(samples))
	jobs := make(chan int)
	workerCount := runtime.NumCPU()
	if workerCount > 4 {
		workerCount = 4
	}
	if workerCount > len(samples) {
		workerCount = len(samples)
	}
	if workerCount < 1 {
		workerCount = 1
	}

	var waitGroup sync.WaitGroup
	waitGroup.Add(workerCount)
	for worker := 0; worker < workerCount; worker++ {
		go func() {
			defer waitGroup.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case index, ok := <-jobs:
					if !ok {
						return
					}
					feature, err := makeInterferenceFeatureContext(ctx, req, preset, buildings, samples[index].point, fmt.Sprintf("grid-%d", index+1))
					if err != nil {
						return
					}
					features[index] = feature
				}
			}
		}()
	}
	for index := range samples {
		select {
		case <-ctx.Done():
			close(jobs)
			waitGroup.Wait()
			return nil, ctx.Err()
		case jobs <- index:
		}
	}
	close(jobs)
	waitGroup.Wait()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return features, nil
}

func makeInterferenceFeature(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point, sampleID string) InterferenceFeature {
	feature, _ := makeInterferenceFeatureContext(context.Background(), req, preset, buildings, point, sampleID)
	return feature
}

func makeInterferenceFeatureContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point, sampleID string) (InterferenceFeature, error) {
	properties, err := evaluateInterferencePointContext(ctx, req, preset, buildings, point)
	if err != nil {
		return InterferenceFeature{}, err
	}
	properties.SampleID = sampleID
	return InterferenceFeature{
		Type:       "Feature",
		Properties: properties,
		Geometry:   PointGeometry{Type: "Point", Coordinates: []float64{point.Lon, point.Lat}},
	}, nil
}

func evaluateInterferencePoint(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point) InterferenceProperties {
	properties, _ := evaluateInterferencePointContext(context.Background(), req, preset, buildings, point)
	return properties
}

func evaluateInterferencePointContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex, point Point) (InterferenceProperties, error) {
	signals := make([]receivedCellSignal, 0, len(req.Towers))
	rePowerOffsetDB := 10 * math.Log10(12*float64(preset.resourceBlocks))
	for index, tower := range req.Towers {
		if err := ctx.Err(); err != nil {
			return InterferenceProperties{}, err
		}
		origin := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		distance := ApproxDistanceMeters(origin, point)
		if distance > req.RadiusMeters {
			continue
		}
		if !AngleInBeam(BearingDegrees(origin, point), tower.AzimuthDeg, req.BeamWidthDeg) {
			continue
		}
		intersections, _, err := wallIntersectionsForSegmentContext(ctx, origin, origin, point, buildings)
		if err != nil {
			return InterferenceProperties{}, err
		}
		wallCount := len(intersections)
		carrierRxDBm := ReceivedPowerDBm(distance, req.FrequencyGHz, req.TxPowerDBm+req.CalibrationOffsetDB, float64(wallCount)*PenetrationLossForFrequencyGHz(req.FrequencyGHz))
		if carrierRxDBm <= ReceiverSensitivity {
			continue
		}
		signals = append(signals, receivedCellSignal{
			cellID:    tower.ID,
			channelID: fmt.Sprintf("CH-%d", index%req.ReuseFactor+1),
			rsrpDBm:   carrierRxDBm - rePowerOffsetDB,
			wallCount: wallCount,
		})
	}

	if len(signals) == 0 {
		return InterferenceProperties{QualityClass: "no_signal"}, nil
	}
	sort.SliceStable(signals, func(i, j int) bool { return signals[i].rsrpDBm > signals[j].rsrpDBm })
	serving := signals[0]
	servingMW := DBmToMilliwatts(serving.rsrpDBm)
	noiseDBm := ThermalNoisePerREDBm(preset.scsKHz, req.NoiseFigureDB)
	noiseMW := DBmToMilliwatts(noiseDBm)
	interferenceMW := 0.0
	strongestInterfererID := ""
	strongestInterfererDBm := math.Inf(-1)
	contributingCells := 1
	for _, signal := range signals[1:] {
		if signal.channelID != serving.channelID {
			continue
		}
		loadedMW := DBmToMilliwatts(signal.rsrpDBm) * req.LoadFactor
		interferenceMW += loadedMW
		contributingCells++
		loadedDBm := MilliwattsToDBm(loadedMW)
		if loadedDBm > strongestInterfererDBm {
			strongestInterfererDBm = loadedDBm
			strongestInterfererID = signal.cellID
		}
	}

	sinrDB := 10 * math.Log10(servingMW/(noiseMW+interferenceMW))
	rssiMW := 12 * float64(preset.resourceBlocks) * (servingMW + interferenceMW + noiseMW)
	rssiDBm := MilliwattsToDBm(rssiMW)
	rsrqDB := 10 * math.Log10(float64(preset.resourceBlocks)*servingMW/rssiMW)
	interferenceDBm := MilliwattsToDBm(interferenceMW)
	serviceable := serving.rsrpDBm >= InterferenceRSRPThresholdDBm && sinrDB >= InterferenceSINRThresholdDB && rsrqDB >= InterferenceRSRQThresholdDB
	interferenceLimited := serving.rsrpDBm >= InterferenceRSRPThresholdDBm && (sinrDB < InterferenceSINRThresholdDB || rsrqDB < InterferenceRSRQThresholdDB)

	properties := InterferenceProperties{
		ServingCellID:       serving.cellID,
		ChannelID:           serving.channelID,
		RSRPDBm:             floatPointer(roundOne(serving.rsrpDBm)),
		SINRDB:              floatPointer(roundOne(sinrDB)),
		RSRQDB:              floatPointer(roundOne(rsrqDB)),
		RSSIDBm:             floatPointer(roundOne(rssiDBm)),
		QualityClass:        interferenceQualityClass(serving.rsrpDBm, sinrDB, rsrqDB),
		Serviceable:         serviceable,
		InterferenceLimited: interferenceLimited,
		WallCount:           serving.wallCount,
		ContributingCells:   contributingCells,
	}
	if interferenceMW > 0 {
		properties.InterferenceDBm = floatPointer(roundOne(interferenceDBm))
		properties.StrongestInterfererID = strongestInterfererID
		properties.StrongestInterfererDBm = floatPointer(roundOne(strongestInterfererDBm))
	}
	return properties, nil
}

func evaluateDemandInterference(req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex) ([]InterferenceFeature, int, int, float64) {
	features, candidates, affectedCount, affectedDemand, _ := evaluateDemandInterferenceContext(context.Background(), req, preset, buildings)
	return features, candidates, affectedCount, affectedDemand
}

func evaluateDemandInterferenceContext(ctx context.Context, req InterferenceRequest, preset interferencePreset, buildings *BuildingIndex) ([]InterferenceFeature, int, int, float64, error) {
	if buildings == nil {
		return []InterferenceFeature{}, 0, 0, 0, nil
	}
	affected := make([]InterferenceFeature, 0)
	candidates := 0
	affectedDemand := 0.0
	demandCandidates, err := interferenceDemandCandidatesContext(ctx, req, buildings)
	if err != nil {
		return nil, 0, 0, 0, err
	}
	for index, building := range demandCandidates {
		if index%64 == 0 {
			select {
			case <-ctx.Done():
				return nil, 0, 0, 0, ctx.Err()
			default:
			}
		}
		if building == nil || (building.DemandWeight <= 0 && building.ResidentialDemand <= 0) {
			continue
		}
		centroid, ok := PolygonCentroid(building.Vertices)
		if !ok || !pointInsideAnyTowerRadius(req, centroid) {
			continue
		}
		candidates++
		feature, err := makeInterferenceFeatureContext(ctx, req, preset, buildings, centroid, "demand-"+building.ID)
		if err != nil {
			return nil, 0, 0, 0, err
		}
		if feature.Properties.Serviceable {
			continue
		}
		totalDemand := building.DemandWeight + building.ResidentialDemand
		feature.Properties.BuildingID = building.ID
		feature.Properties.DemandWeight = roundOne(building.DemandWeight)
		feature.Properties.ResidentialDemand = roundOne(building.ResidentialDemand)
		feature.Properties.TotalDemand = roundOne(totalDemand)
		feature.Properties.Reason = "radio quality below RSRP, SINR, or RSRQ service threshold"
		affectedDemand += totalDemand
		affected = append(affected, feature)
	}

	sort.SliceStable(affected, func(i, j int) bool {
		if affected[i].Properties.TotalDemand == affected[j].Properties.TotalDemand {
			return pointerValue(affected[i].Properties.SINRDB) < pointerValue(affected[j].Properties.SINRDB)
		}
		return affected[i].Properties.TotalDemand > affected[j].Properties.TotalDemand
	})
	affectedCount := len(affected)
	if affectedCount > MaxInterferenceDemandFeatures {
		affected = affected[:MaxInterferenceDemandFeatures]
	}
	return affected, candidates, affectedCount, roundOne(affectedDemand), nil
}

func interferenceDemandCandidates(req InterferenceRequest, buildings *BuildingIndex) []*BuildingFootprint {
	candidates, _ := interferenceDemandCandidatesContext(context.Background(), req, buildings)
	return candidates
}

func interferenceDemandCandidatesContext(ctx context.Context, req InterferenceRequest, buildings *BuildingIndex) ([]*BuildingFootprint, error) {
	if buildings == nil {
		return nil, nil
	}
	byID := make(map[string]*BuildingFootprint)
	for towerIndex, tower := range req.Towers {
		if towerIndex%4 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		origin := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		for buildingIndex, building := range buildings.SearchBounds(BoundsAroundPoint(origin, req.RadiusMeters)) {
			if buildingIndex%64 == 0 {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
			}
			if building != nil && building.ID != "" {
				byID[building.ID] = building
			}
		}
	}
	ids := make([]string, 0, len(byID))
	for id := range byID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	result := make([]*BuildingFootprint, 0, len(ids))
	for _, id := range ids {
		result = append(result, byID[id])
	}
	return result, nil
}
