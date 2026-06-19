package raytracer

import (
	"math"
	"runtime"
	"sort"
	"sync"
)

type StaticSimulationRequest struct {
	TowerLon     float64 `json:"tower_lon"`
	TowerLat     float64 `json:"tower_lat"`
	Rays         int     `json:"rays"`
	RadiusMeters float64 `json:"radius_m"`
	FrequencyGHz float64 `json:"frequency_ghz"`
	TxPowerDBm   float64 `json:"tx_power_dbm"`
}

type RayFeatureCollection struct {
	Type     string       `json:"type"`
	Features []RayFeature `json:"features"`
}

type RayFeature struct {
	Type       string        `json:"type"`
	Properties RayProperties `json:"properties"`
	Geometry   LineGeometry  `json:"geometry"`
}

type RayProperties struct {
	AngleDeg        float64 `json:"angle_deg"`
	SignalDBm       float64 `json:"signal_dbm"`
	PathLossDB      float64 `json:"path_loss_db"`
	IsBlocked       bool    `json:"is_blocked"`
	DistanceMeters  float64 `json:"distance_m"`
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
}

func SimulateStaticRays(req StaticSimulationRequest, buildings *BuildingIndex) RayFeatureCollection {
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	features := make([]RayFeature, req.Rays)

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
				angle := float64(index) * 360 / float64(req.Rays)
				features[index] = simulateStaticRay(origin, angle, req, buildings)
			}
		}()
	}

	for index := 0; index < req.Rays; index++ {
		jobs <- index
	}
	close(jobs)
	waitGroup.Wait()

	sort.SliceStable(features, func(i, j int) bool {
		return features[i].Properties.AngleDeg < features[j].Properties.AngleDeg
	})

	return RayFeatureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
}

func simulateStaticRay(origin Point, angle float64, req StaticSimulationRequest, buildings *BuildingIndex) RayFeature {
	fullEnd := DestinationPoint(origin, angle, req.RadiusMeters)
	end := fullEnd
	blocked := false
	hitID := ""
	attenuation := 0.0
	distanceMeters := req.RadiusMeters
	candidateChecks := 0

	candidates := buildings.SearchRay(origin, fullEnd)
	candidateChecks = len(candidates)
	closestDistance := math.Inf(1)

	for _, building := range candidates {
		hit, point := SegmentPolygonFirstIntersection(origin, fullEnd, building.Vertices)
		if !hit {
			continue
		}
		hitDistance := ApproxDistanceMeters(origin, point)
		if hitDistance < closestDistance {
			closestDistance = hitDistance
			end = point
			blocked = true
			hitID = building.ID
			attenuation = building.AttenuationDB
			distanceMeters = hitDistance
		}
	}

	exponent := 2.0
	if blocked {
		exponent = 4.5
		if attenuation == 0 {
			attenuation = DefaultBuildingAttenuationDB
		}
	}

	pathLoss := LogDistancePathLoss(distanceMeters, req.FrequencyGHz, exponent, attenuation)
	signal := req.TxPowerDBm - pathLoss

	return RayFeature{
		Type: "Feature",
		Properties: RayProperties{
			AngleDeg:        normalizeDegrees(angle),
			SignalDBm:       math.Round(signal*10) / 10,
			PathLossDB:      math.Round(pathLoss*10) / 10,
			IsBlocked:       blocked,
			DistanceMeters:  math.Round(distanceMeters*10) / 10,
			HitBuildingID:   hitID,
			CandidateChecks: candidateChecks,
		},
		Geometry: LineGeometry{
			Type: "LineString",
			Coordinates: [][]float64{
				{origin.Lon, origin.Lat},
				{end.Lon, end.Lat},
			},
		},
	}
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

func ApproxDistanceMeters(a Point, b Point) float64 {
	latMeters := (b.Lat - a.Lat) * 111_320
	lonMeters := (b.Lon - a.Lon) * 111_320 * math.Cos(a.Lat*math.Pi/180)
	return math.Sqrt(latMeters*latMeters + lonMeters*lonMeters)
}
