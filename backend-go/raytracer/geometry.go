package raytracer

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"strconv"
	"strings"
)

const (
	SpeedOfLightMetersPerSecond = 299_792_458.0
	EarthRadiusMeters           = 6_371_000.0
)

type Point struct {
	Lon float64 `json:"lon" bson:"lon"`
	Lat float64 `json:"lat" bson:"lat"`
}

type Obstacle struct {
	ID            string  `json:"id"`
	Kind          string  `json:"kind"`
	AttenuationDB float64 `json:"attenuationDb"`
	Vertices      []Point `json:"vertices"`
}

type RayResult struct {
	AngleDeg        float64  `json:"angleDeg"`
	DistanceMeters  float64  `json:"distanceMeters"`
	PathLossDB      float64  `json:"pathLossDb"`
	ReceivedPowerDB float64  `json:"receivedPowerDbm"`
	Blocked         bool     `json:"blocked"`
	Intersections   int      `json:"intersections"`
	Obstacles       []string `json:"obstacles"`
	End             Point    `json:"end"`
}

func FreeSpacePathLossAtOneMeter(frequencyGHz float64) float64 {
	frequencyHz := frequencyGHz * 1_000_000_000
	return 20 * math.Log10((4*math.Pi*frequencyHz)/SpeedOfLightMetersPerSecond)
}

func LogDistancePathLoss(distanceMeters float64, frequencyGHz float64, pathLossExponent float64, attenuationDB float64) float64 {
	distance := math.Max(distanceMeters, 1)
	return FreeSpacePathLossAtOneMeter(frequencyGHz) + 10*pathLossExponent*math.Log10(distance) + attenuationDB
}

func TraceRay(origin Point, angleDeg float64, frequencyGHz float64, txPowerDBm float64, maxDistanceMeters float64, obstacles []Obstacle) RayResult {
	end := DestinationPoint(origin, angleDeg, maxDistanceMeters)
	totalAttenuation := 0.0
	hitKinds := make([]string, 0, 4)

	for _, obstacle := range obstacles {
		if LineIntersectsPolygon(origin, end, obstacle.Vertices) {
			totalAttenuation += obstacle.AttenuationDB
			hitKinds = append(hitKinds, obstacle.Kind)
		}
	}

	pathLossExponent := 2.0
	if len(hitKinds) > 0 {
		pathLossExponent = 4.5
	}

	pathLoss := LogDistancePathLoss(maxDistanceMeters, frequencyGHz, pathLossExponent, totalAttenuation)
	return RayResult{
		AngleDeg:        normalizeDegrees(angleDeg),
		DistanceMeters:  maxDistanceMeters,
		PathLossDB:      pathLoss,
		ReceivedPowerDB: txPowerDBm - pathLoss,
		Blocked:         len(hitKinds) > 0,
		Intersections:   len(hitKinds),
		Obstacles:       hitKinds,
		End:             end,
	}
}

func DestinationPoint(origin Point, bearingDeg float64, distanceMeters float64) Point {
	bearing := bearingDeg * math.Pi / 180
	lat1 := origin.Lat * math.Pi / 180
	lon1 := origin.Lon * math.Pi / 180
	angularDistance := distanceMeters / EarthRadiusMeters

	lat2 := math.Asin(math.Sin(lat1)*math.Cos(angularDistance) + math.Cos(lat1)*math.Sin(angularDistance)*math.Cos(bearing))
	lon2 := lon1 + math.Atan2(
		math.Sin(bearing)*math.Sin(angularDistance)*math.Cos(lat1),
		math.Cos(angularDistance)-math.Sin(lat1)*math.Sin(lat2),
	)

	return Point{
		Lon: normalizeLongitude(lon2 * 180 / math.Pi),
		Lat: lat2 * 180 / math.Pi,
	}
}

func LineIntersectsPolygon(a Point, b Point, polygon []Point) bool {
	if len(polygon) < 3 {
		return false
	}
	if PointInPolygon(a, polygon) || PointInPolygon(b, polygon) {
		return true
	}

	for i := range polygon {
		next := (i + 1) % len(polygon)
		if SegmentsIntersect(a, b, polygon[i], polygon[next]) {
			return true
		}
	}
	return false
}

func SegmentsIntersect(p1 Point, p2 Point, q1 Point, q2 Point) bool {
	o1 := orientation(p1, p2, q1)
	o2 := orientation(p1, p2, q2)
	o3 := orientation(q1, q2, p1)
	o4 := orientation(q1, q2, p2)

	if o1 != o2 && o3 != o4 {
		return true
	}
	return o1 == 0 && onSegment(p1, q1, p2) ||
		o2 == 0 && onSegment(p1, q2, p2) ||
		o3 == 0 && onSegment(q1, p1, q2) ||
		o4 == 0 && onSegment(q1, p2, q2)
}

func PointInPolygon(point Point, polygon []Point) bool {
	inside := false
	j := len(polygon) - 1
	for i := range polygon {
		pi := polygon[i]
		pj := polygon[j]
		intersects := ((pi.Lat > point.Lat) != (pj.Lat > point.Lat)) &&
			(point.Lon < (pj.Lon-pi.Lon)*(point.Lat-pi.Lat)/(pj.Lat-pi.Lat)+pi.Lon)
		if intersects {
			inside = !inside
		}
		j = i
	}
	return inside
}

func AttenuationForTags(tags map[string]string) (string, float64, bool) {
	building := strings.ToLower(tags["building"])
	natural := strings.ToLower(tags["natural"])

	switch building {
	case "concrete", "industrial":
		return "building:" + building, 35, true
	case "office", "glass":
		return "building:" + building, 20, true
	}

	switch natural {
	case "tree_row", "forest":
		return "natural:" + natural, 8, true
	}

	if building != "" && building != "no" {
		return "building:" + building, 25, true
	}
	return "", 0, false
}

func LoadObstaclesFromGeoJSON(path string) ([]Obstacle, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var collection featureCollection
	if err := json.Unmarshal(bytes, &collection); err != nil {
		return nil, err
	}
	if collection.Type != "FeatureCollection" {
		return nil, errors.New("expected GeoJSON FeatureCollection")
	}

	obstacles := make([]Obstacle, 0, len(collection.Features))
	for idx, feature := range collection.Features {
		tags := feature.StringProperties()
		kind, attenuation, ok := AttenuationForTags(tags)
		if !ok {
			continue
		}

		for _, ring := range feature.Geometry.OuterRings() {
			if len(ring) < 3 {
				continue
			}
			obstacles = append(obstacles, Obstacle{
				ID:            feature.IDOrIndex(idx),
				Kind:          kind,
				AttenuationDB: attenuation,
				Vertices:      ring,
			})
		}
	}
	return obstacles, nil
}

func DefaultAnkaraObstacles() []Obstacle {
	return []Obstacle{
		{
			ID:            "kizilay-office-block",
			Kind:          "building:office",
			AttenuationDB: 20,
			Vertices: []Point{
				{Lon: 32.8522, Lat: 39.9195},
				{Lon: 32.8570, Lat: 39.9195},
				{Lon: 32.8570, Lat: 39.9232},
				{Lon: 32.8522, Lat: 39.9232},
			},
		},
		{
			ID:            "sogutozu-industrial",
			Kind:          "building:industrial",
			AttenuationDB: 35,
			Vertices: []Point{
				{Lon: 32.7850, Lat: 39.9070},
				{Lon: 32.7940, Lat: 39.9070},
				{Lon: 32.7940, Lat: 39.9145},
				{Lon: 32.7850, Lat: 39.9145},
			},
		},
		{
			ID:            "odtu-forest-edge",
			Kind:          "natural:forest",
			AttenuationDB: 8,
			Vertices: []Point{
				{Lon: 32.7650, Lat: 39.8850},
				{Lon: 32.7830, Lat: 39.8850},
				{Lon: 32.7830, Lat: 39.8970},
				{Lon: 32.7650, Lat: 39.8970},
			},
		},
	}
}

func normalizeLongitude(lon float64) float64 {
	for lon > 180 {
		lon -= 360
	}
	for lon < -180 {
		lon += 360
	}
	return lon
}

func normalizeDegrees(degrees float64) float64 {
	value := math.Mod(degrees, 360)
	if value < 0 {
		value += 360
	}
	return value
}

func orientation(a Point, b Point, c Point) int {
	const epsilon = 1e-12
	value := (b.Lat-a.Lat)*(c.Lon-b.Lon) - (b.Lon-a.Lon)*(c.Lat-b.Lat)
	if math.Abs(value) < epsilon {
		return 0
	}
	if value > 0 {
		return 1
	}
	return 2
}

func onSegment(a Point, b Point, c Point) bool {
	return b.Lon <= math.Max(a.Lon, c.Lon) &&
		b.Lon >= math.Min(a.Lon, c.Lon) &&
		b.Lat <= math.Max(a.Lat, c.Lat) &&
		b.Lat >= math.Min(a.Lat, c.Lat)
}

type featureCollection struct {
	Type     string    `json:"type"`
	Features []feature `json:"features"`
}

type feature struct {
	ID         any            `json:"id"`
	Properties map[string]any `json:"properties"`
	Geometry   geometry       `json:"geometry"`
}

func (f feature) IDOrIndex(index int) string {
	if f.ID != nil {
		id := strings.TrimSpace(strings.TrimPrefix(strings.TrimSuffix(toString(f.ID), "\""), "\""))
		if id != "" {
			return strings.ReplaceAll(id, " ", "-")
		}
	}
	return "feature-" + strconv.Itoa(index)
}

func (f feature) StringProperties() map[string]string {
	tags := make(map[string]string, len(f.Properties))
	for key, value := range f.Properties {
		tags[strings.ToLower(key)] = strings.ToLower(toString(value))
	}
	return tags
}

type geometry struct {
	Type        string          `json:"type"`
	Coordinates json.RawMessage `json:"coordinates"`
}

func (g geometry) OuterRings() [][]Point {
	switch g.Type {
	case "Polygon":
		var coords [][][]float64
		if json.Unmarshal(g.Coordinates, &coords) != nil || len(coords) == 0 {
			return nil
		}
		return [][]Point{coordinatesToPoints(coords[0])}
	case "MultiPolygon":
		var coords [][][][]float64
		if json.Unmarshal(g.Coordinates, &coords) != nil {
			return nil
		}
		rings := make([][]Point, 0, len(coords))
		for _, polygon := range coords {
			if len(polygon) > 0 {
				rings = append(rings, coordinatesToPoints(polygon[0]))
			}
		}
		return rings
	default:
		return nil
	}
}

func coordinatesToPoints(coords [][]float64) []Point {
	points := make([]Point, 0, len(coords))
	for _, coord := range coords {
		if len(coord) < 2 {
			continue
		}
		points = append(points, Point{Lon: coord[0], Lat: coord[1]})
	}
	if len(points) > 1 && points[0] == points[len(points)-1] {
		points = points[:len(points)-1]
	}
	return points
}

func toString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(typed, 'f', 6, 64), "0"), ".")
	default:
		bytes, _ := json.Marshal(typed)
		return string(bytes)
	}
}
