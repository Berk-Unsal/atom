package raytracer

import (
	"math"
	"runtime"
	"sort"
	"sync"
)

const ReceiverSensitivity = -115.0 // dBm
const AntennaGainDBi = 25.0
const SegmentStepMeters = 25.0

type StaticSimulationRequest struct {
	TowerLon     float64 `json:"tower_lon"`
	TowerLat     float64 `json:"tower_lat"`
	Rays         int     `json:"rays"`
	RadiusMeters float64 `json:"radius_m"`
	FrequencyGHz float64 `json:"frequency_ghz"`
	TxPowerDBm   float64 `json:"tx_power_dbm"`
	AzimuthDeg   float64 `json:"azimuth"`
	BeamWidthDeg float64 `json:"beam_width"`
}

type RayFeatureCollection struct {
	Type     string       `json:"type"`
	Features []RayFeature `json:"features"`
}

type StaticSimulationResponse struct {
	GeoJSON RayFeatureCollection `json:"geojson"`
	Stats   SimulationStats      `json:"stats"`
}

type AzimuthOptimizationResponse struct {
	OptimalAzimuth float64 `json:"optimal_azimuth"`
}

type SimulationStats struct {
	BlockedPct float64 `json:"blocked_pct"`
	AvgRxDBm   float64 `json:"avg_rx_dbm"`
	MinRangeM  float64 `json:"min_range_m"`
	MaxRangeM  float64 `json:"max_range_m"`
}

type RayFeature struct {
	Type       string        `json:"type"`
	Properties RayProperties `json:"properties"`
	Geometry   LineGeometry  `json:"geometry"`
}

type RayProperties struct {
	AngleDeg        float64 `json:"angle_deg"`
	RayIndex        int     `json:"ray_index"`
	SegmentIndex    int     `json:"segment_index"`
	SignalDBm       float64 `json:"signal_dbm"`
	SignalStartDBm  float64 `json:"signal_start_dbm"`
	SignalEndDBm    float64 `json:"signal_end_dbm"`
	PathLossDB      float64 `json:"path_loss_db"`
	WallLossDB      float64 `json:"wall_loss_db"`
	IsBlocked       bool    `json:"is_blocked"`
	DistanceMeters  float64 `json:"distance_m"`
	SegmentStartM   float64 `json:"segment_start_m"`
	SegmentEndM     float64 `json:"segment_end_m"`
	HitBuildingID   string  `json:"hit_building_id,omitempty"`
	CandidateChecks int     `json:"candidate_checks"`
}

type LineGeometry struct {
	Type        string      `json:"type"`
	Coordinates [][]float64 `json:"coordinates"`
}

func NormalizeStaticSimulationRequest(req *StaticSimulationRequest) {
	if req.Rays == 0 {
		req.Rays = 60
	}
	if req.RadiusMeters == 0 {
		req.RadiusMeters = 400
	}
	if req.FrequencyGHz == 0 {
		req.FrequencyGHz = 28
	}
	if req.TxPowerDBm == 0 {
		req.TxPowerDBm = 30
	}
	req.AzimuthDeg = normalizeDegrees(req.AzimuthDeg)
	if req.BeamWidthDeg == 0 {
		req.BeamWidthDeg = 120
	}
	if req.BeamWidthDeg < 10 {
		req.BeamWidthDeg = 10
	}
	if req.BeamWidthDeg > 360 {
		req.BeamWidthDeg = 360
	}
}

func SimulateStaticRays(req StaticSimulationRequest, buildings *BuildingIndex) StaticSimulationResponse {
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	rayFeatures := make([][]RayFeature, req.Rays)
	terminals := make([]rayTerminal, req.Rays)

	workerCount := runtime.NumCPU()
	if req.Rays < workerCount {
		workerCount = req.Rays
	}
	if workerCount < 1 {
		workerCount = 1
	}

	jobs := make(chan int)
	var waitGroup sync.WaitGroup
	waitGroup.Add(workerCount)

	for worker := 0; worker < workerCount; worker++ {
		go func() {
			defer waitGroup.Done()
			for index := range jobs {
				angle := BeamAngleForIndex(req.AzimuthDeg, req.BeamWidthDeg, req.Rays, index)
				rayFeatures[index], terminals[index] = simulateSegmentedRay(origin, index, angle, req, buildings)
			}
		}()
	}

	for index := 0; index < req.Rays; index++ {
		jobs <- index
	}
	close(jobs)
	waitGroup.Wait()

	features := make([]RayFeature, 0, req.Rays*int(math.Ceil(req.RadiusMeters/SegmentStepMeters)))
	for _, segments := range rayFeatures {
		features = append(features, segments...)
	}

	sort.SliceStable(features, func(i, j int) bool {
		if features[i].Properties.AngleDeg == features[j].Properties.AngleDeg {
			return features[i].Properties.SegmentIndex < features[j].Properties.SegmentIndex
		}
		return features[i].Properties.AngleDeg < features[j].Properties.AngleDeg
	})

	geojson := RayFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
	return StaticSimulationResponse{
		GeoJSON: geojson,
		Stats:   CalculateSimulationStats(terminals),
	}
}

func OptimizeAzimuth(req StaticSimulationRequest, buildings *BuildingIndex) AzimuthOptimizationResponse {
	NormalizeStaticSimulationRequest(&req)
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}

	type sweepResult struct {
		azimuth float64
		score   float64
	}

	candidateCount := 36
	results := make([]sweepResult, candidateCount)
	jobs := make(chan int)
	workerCount := runtime.NumCPU()
	if workerCount > candidateCount {
		workerCount = candidateCount
	}
	if workerCount < 1 {
		workerCount = 1
	}

	var waitGroup sync.WaitGroup
	waitGroup.Add(workerCount)
	for worker := 0; worker < workerCount; worker++ {
		go func() {
			defer waitGroup.Done()
			for index := range jobs {
				testAzimuth := float64(index * 10)
				testReq := req
				testReq.AzimuthDeg = testAzimuth
				score := CoverageAreaScore(origin, testReq, buildings)
				results[index] = sweepResult{
					azimuth: testAzimuth,
					score:   score,
				}
			}
		}()
	}

	for index := 0; index < candidateCount; index++ {
		jobs <- index
	}
	close(jobs)
	waitGroup.Wait()

	best := results[0]
	for _, result := range results[1:] {
		if result.score > best.score {
			best = result
		}
	}
	return AzimuthOptimizationResponse{
		OptimalAzimuth: best.azimuth,
	}
}

func CoverageAreaScore(origin Point, req StaticSimulationRequest, buildings *BuildingIndex) float64 {
	total := 0.0
	for index := 0; index < req.Rays; index++ {
		angle := BeamAngleForIndex(req.AzimuthDeg, req.BeamWidthDeg, req.Rays, index)
		terminal := simulateRayTerminal(origin, index, angle, req, buildings)
		total += terminal.distanceMeters * terminal.distanceMeters
	}
	return total
}

func BeamAngleForIndex(azimuthDeg float64, beamWidthDeg float64, rayCount int, index int) float64 {
	if rayCount <= 0 {
		return normalizeDegrees(azimuthDeg)
	}
	startAngle := azimuthDeg - beamWidthDeg/2
	angleStep := beamWidthDeg / float64(rayCount)
	return normalizeDegrees(startAngle + float64(index)*angleStep)
}

func simulateSegmentedRay(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) ([]RayFeature, rayTerminal) {
	return simulateSegmentedRayInternal(origin, rayIndex, angle, req, buildings, true)
}

func simulateRayTerminal(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) rayTerminal {
	_, terminal := simulateSegmentedRayInternal(origin, rayIndex, angle, req, buildings, false)
	return terminal
}

func simulateSegmentedRayInternal(origin Point, rayIndex int, angle float64, req StaticSimulationRequest, buildings *BuildingIndex, collectFeatures bool) ([]RayFeature, rayTerminal) {
	clearAirLimit := MaxTheoreticalDistanceMeters(req.TxPowerDBm, req.FrequencyGHz, 0)
	castDistance := math.Min(req.RadiusMeters, clearAirLimit)
	wallLossPerIntersection := PenetrationLossForFrequencyGHz(req.FrequencyGHz)

	if castDistance <= 0 {
		return nil, rayTerminal{
			blocked:        false,
			distanceMeters: 0,
			signalDBm:      ReceiverSensitivity,
		}
	}

	var segments []RayFeature
	if collectFeatures {
		segments = make([]RayFeature, 0, int(math.Ceil(castDistance/SegmentStepMeters)))
	}
	terminal := rayTerminal{
		blocked:        false,
		distanceMeters: castDistance,
		signalDBm:      ReceivedPowerDBm(castDistance, req.FrequencyGHz, req.TxPowerDBm, 0),
	}

	segmentIndex := 0
	currentPoint := origin
	cumulativeWallLoss := 0.0
	for startDistance := 0.0; startDistance < castDistance; startDistance += SegmentStepMeters {
		endDistance := math.Min(startDistance+SegmentStepMeters, castDistance)
		start := currentPoint
		nextPoint := DestinationPoint(origin, angle, endDistance)
		startRx := ReceivedPowerDBm(math.Max(startDistance, 1), req.FrequencyGHz, req.TxPowerDBm, cumulativeWallLoss)

		if startDistance > 0 && startRx <= ReceiverSensitivity {
			terminal = rayTerminal{
				blocked:        cumulativeWallLoss > 0,
				distanceMeters: startDistance,
				signalDBm:      startRx,
			}
			break
		}

		intersections, candidateChecks := wallIntersectionsForSegment(origin, start, nextPoint, buildings)
		segmentStartPoint := start
		segmentStartDistance := startDistance
		segmentStartRx := startRx
		rayStopped := false

		for _, intersection := range intersections {
			hitDistance := startDistance + intersection.distanceMeters
			cumulativeWallLoss += wallLossPerIntersection
			wallRx := ReceivedPowerDBm(hitDistance, req.FrequencyGHz, req.TxPowerDBm, cumulativeWallLoss)
			pathLoss := FreeSpacePathLossMetersGHz(hitDistance, req.FrequencyGHz) + cumulativeWallLoss
			isTerminalBlock := wallRx <= ReceiverSensitivity
			if collectFeatures {
				if ApproxDistanceMeters(segmentStartPoint, intersection.point) > 0.01 {
					segments = append(segments, makeRaySegmentFeature(
						segmentStartPoint,
						intersection.point,
						angle,
						rayIndex,
						segmentIndex,
						segmentStartDistance,
						hitDistance,
						segmentStartRx,
						wallRx,
						pathLoss,
						cumulativeWallLoss,
						isTerminalBlock,
						intersection.buildingID,
						candidateChecks,
					))
					segmentIndex++
				}
			}

			if isTerminalBlock {
				terminal = rayTerminal{
					blocked:        true,
					distanceMeters: hitDistance,
					signalDBm:      wallRx,
				}
				rayStopped = true
				break
			}

			segmentStartPoint = intersection.point
			segmentStartDistance = hitDistance
			segmentStartRx = wallRx
		}
		if rayStopped {
			break
		}

		endRx := ReceivedPowerDBm(endDistance, req.FrequencyGHz, req.TxPowerDBm, cumulativeWallLoss)
		if endRx <= ReceiverSensitivity {
			stopDistance := MaxTheoreticalDistanceMeters(req.TxPowerDBm, req.FrequencyGHz, cumulativeWallLoss)
			if stopDistance < segmentStartDistance {
				stopDistance = segmentStartDistance
			}
			stopPoint := DestinationPoint(origin, angle, stopDistance)
			stopRx := ReceivedPowerDBm(stopDistance, req.FrequencyGHz, req.TxPowerDBm, cumulativeWallLoss)
			pathLoss := FreeSpacePathLossMetersGHz(stopDistance, req.FrequencyGHz) + cumulativeWallLoss
			if collectFeatures && ApproxDistanceMeters(segmentStartPoint, stopPoint) > 0.01 {
				segments = append(segments, makeRaySegmentFeature(
					segmentStartPoint,
					stopPoint,
					angle,
					rayIndex,
					segmentIndex,
					segmentStartDistance,
					stopDistance,
					segmentStartRx,
					stopRx,
					pathLoss,
					cumulativeWallLoss,
					cumulativeWallLoss > 0,
					"",
					candidateChecks,
				))
			}

			terminal = rayTerminal{
				blocked:        cumulativeWallLoss > 0,
				distanceMeters: stopDistance,
				signalDBm:      stopRx,
			}
			break
		}

		pathLoss := FreeSpacePathLossMetersGHz(endDistance, req.FrequencyGHz) + cumulativeWallLoss
		if collectFeatures {
			segments = append(segments, makeRaySegmentFeature(
				segmentStartPoint,
				nextPoint,
				angle,
				rayIndex,
				segmentIndex,
				segmentStartDistance,
				endDistance,
				segmentStartRx,
				endRx,
				pathLoss,
				cumulativeWallLoss,
				false,
				"",
				candidateChecks,
			))
			segmentIndex++
		}

		terminal = rayTerminal{
			blocked:        false,
			distanceMeters: endDistance,
			signalDBm:      endRx,
		}
		currentPoint = nextPoint
	}

	return segments, terminal
}

type buildingIntersection struct {
	distanceMeters float64
	point          Point
	building       *BuildingFootprint
}

type wallIntersection struct {
	distanceMeters float64
	point          Point
	buildingID     string
}

type rayTerminal struct {
	blocked        bool
	distanceMeters float64
	signalDBm      float64
}

func firstBuildingHitForSegment(origin Point, start Point, end Point, buildings *BuildingIndex) (bool, Point, *BuildingFootprint, int) {
	candidates := buildings.SearchRay(start, end)
	closestDistance := math.Inf(1)
	var closestPoint Point
	var closestBuilding *BuildingFootprint

	for _, building := range candidates {
		if PointInPolygon(origin, building.Vertices) {
			continue
		}
		hit, point := SegmentPolygonFirstIntersection(start, end, building.Vertices)
		if !hit {
			continue
		}
		distance := ApproxDistanceMeters(start, point)
		if distance < closestDistance {
			closestDistance = distance
			closestPoint = point
			closestBuilding = building
		}
	}

	return closestBuilding != nil, closestPoint, closestBuilding, len(candidates)
}

func wallIntersectionsForSegment(origin Point, start Point, end Point, buildings *BuildingIndex) ([]wallIntersection, int) {
	candidates := buildings.SearchRay(start, end)
	intersections := make([]wallIntersection, 0, len(candidates))

	for _, building := range candidates {
		if PointInPolygon(origin, building.Vertices) {
			continue
		}

		points := SegmentPolygonIntersections(start, end, building.Vertices)
		for _, point := range points {
			distance := ApproxDistanceMeters(start, point)
			if distance <= 0.05 {
				continue
			}
			intersections = appendUniqueWallIntersection(intersections, wallIntersection{
				distanceMeters: distance,
				point:          point,
				buildingID:     building.ID,
			})
		}
	}

	sort.SliceStable(intersections, func(i, j int) bool {
		return intersections[i].distanceMeters < intersections[j].distanceMeters
	})
	return intersections, len(candidates)
}

func appendUniqueWallIntersection(intersections []wallIntersection, candidate wallIntersection) []wallIntersection {
	for _, existing := range intersections {
		if existing.buildingID != candidate.buildingID {
			continue
		}
		if math.Abs(existing.distanceMeters-candidate.distanceMeters) <= 0.05 {
			return intersections
		}
	}
	return append(intersections, candidate)
}

func makeRaySegmentFeature(
	start Point,
	end Point,
	angle float64,
	rayIndex int,
	segmentIndex int,
	startDistance float64,
	endDistance float64,
	startRx float64,
	endRx float64,
	pathLoss float64,
	wallLoss float64,
	blocked bool,
	hitBuildingID string,
	candidateChecks int,
) RayFeature {
	return RayFeature{
		Type: "Feature",
		Properties: RayProperties{
			AngleDeg:        normalizeDegrees(angle),
			RayIndex:        rayIndex,
			SegmentIndex:    segmentIndex,
			SignalDBm:       math.Round(endRx*10) / 10,
			SignalStartDBm:  math.Round(startRx*10) / 10,
			SignalEndDBm:    math.Round(endRx*10) / 10,
			PathLossDB:      math.Round(pathLoss*10) / 10,
			WallLossDB:      math.Round(wallLoss*10) / 10,
			IsBlocked:       blocked,
			DistanceMeters:  math.Round(endDistance*10) / 10,
			SegmentStartM:   math.Round(startDistance*10) / 10,
			SegmentEndM:     math.Round(endDistance*10) / 10,
			HitBuildingID:   hitBuildingID,
			CandidateChecks: candidateChecks,
		},
		Geometry: LineGeometry{
			Type: "LineString",
			Coordinates: [][]float64{
				{start.Lon, start.Lat},
				{end.Lon, end.Lat},
			},
		},
	}
}

func FreeSpacePathLossMetersGHz(distanceMeters float64, frequencyGHz float64) float64 {
	distance := math.Max(distanceMeters, 1)
	return 20*math.Log10(distance) + 20*math.Log10(frequencyGHz) + 92.45
}

func PenetrationLossForFrequencyGHz(frequencyGHz float64) float64 {
	switch {
	case frequencyGHz < 10:
		return 8
	case frequencyGHz < 100:
		return 30
	default:
		return 80
	}
}

func ReceivedPowerDBm(distanceMeters float64, frequencyGHz float64, txPowerDBm float64, attenuationDB float64) float64 {
	return EffectiveIsotropicRadiatedPowerDBm(txPowerDBm) - FreeSpacePathLossMetersGHz(distanceMeters, frequencyGHz) - attenuationDB
}

func MaxTheoreticalDistanceMeters(txPowerDBm float64, frequencyGHz float64, attenuationDB float64) float64 {
	if frequencyGHz <= 0 {
		return 0
	}
	exponent := (EffectiveIsotropicRadiatedPowerDBm(txPowerDBm) - ReceiverSensitivity - attenuationDB - 20*math.Log10(frequencyGHz) - 92.45) / 20
	return math.Pow(10, exponent)
}

func EffectiveIsotropicRadiatedPowerDBm(txPowerDBm float64) float64 {
	return txPowerDBm + AntennaGainDBi
}

func SegmentPolygonFirstIntersection(a Point, b Point, polygon []Point) (bool, Point) {
	if len(polygon) < 3 {
		return false, Point{}
	}
	if PointInPolygon(a, polygon) {
		return true, a
	}

	found := false
	closestPoint := Point{}
	closestDistance := math.Inf(1)
	for index := range polygon {
		next := (index + 1) % len(polygon)
		hit, point := SegmentIntersectionPoint(a, b, polygon[index], polygon[next])
		if !hit {
			continue
		}
		distance := ApproxDistanceMeters(a, point)
		if distance < closestDistance {
			closestDistance = distance
			closestPoint = point
			found = true
		}
	}
	return found, closestPoint
}

func SegmentPolygonIntersections(a Point, b Point, polygon []Point) []Point {
	if len(polygon) < 3 {
		return nil
	}

	points := make([]Point, 0, 2)
	for index := range polygon {
		next := (index + 1) % len(polygon)
		hit, point := SegmentIntersectionPoint(a, b, polygon[index], polygon[next])
		if !hit {
			continue
		}
		points = appendUniquePoint(points, point)
	}
	return points
}

func appendUniquePoint(points []Point, candidate Point) []Point {
	for _, existing := range points {
		if ApproxDistanceMeters(existing, candidate) <= 0.05 {
			return points
		}
	}
	return append(points, candidate)
}

func SegmentIntersectionPoint(p1 Point, p2 Point, q1 Point, q2 Point) (bool, Point) {
	x1, y1 := p1.Lon, p1.Lat
	x2, y2 := p2.Lon, p2.Lat
	x3, y3 := q1.Lon, q1.Lat
	x4, y4 := q2.Lon, q2.Lat

	denominator := (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
	if math.Abs(denominator) < 1e-14 {
		return false, Point{}
	}

	t := ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denominator
	u := -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denominator
	if t < 0 || t > 1 || u < 0 || u > 1 {
		return false, Point{}
	}

	return true, Point{
		Lon: x1 + t*(x2-x1),
		Lat: y1 + t*(y2-y1),
	}
}

func CalculateSimulationStats(terminals []rayTerminal) SimulationStats {
	if len(terminals) == 0 {
		return SimulationStats{}
	}

	blocked := 0
	totalSignal := 0.0
	minRange := math.Inf(1)
	maxRange := math.Inf(-1)

	for _, terminal := range terminals {
		if terminal.blocked {
			blocked++
		}
		totalSignal += terminal.signalDBm
		minRange = math.Min(minRange, terminal.distanceMeters)
		maxRange = math.Max(maxRange, terminal.distanceMeters)
	}

	return SimulationStats{
		BlockedPct: math.Round((float64(blocked)/float64(len(terminals)))*1000) / 10,
		AvgRxDBm:   math.Round((totalSignal/float64(len(terminals)))*10) / 10,
		MinRangeM:  math.Round(minRange*10) / 10,
		MaxRangeM:  math.Round(maxRange*10) / 10,
	}
}

func ApproxDistanceMeters(a Point, b Point) float64 {
	latMeters := (b.Lat - a.Lat) * 111_320
	lonMeters := (b.Lon - a.Lon) * 111_320 * math.Cos(a.Lat*math.Pi/180)
	return math.Sqrt(latMeters*latMeters + lonMeters*lonMeters)
}
