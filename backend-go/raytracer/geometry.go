package raytracer

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
)

const EarthRadiusMeters = 6_371_000.0

type Point struct {
	Lon float64 `json:"lon" bson:"lon"`
	Lat float64 `json:"lat" bson:"lat"`
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

func PolygonCentroid(polygon []Point) (Point, bool) {
	if len(polygon) < 3 {
		return Point{}, false
	}

	base := polygon[0]
	area := 0.0
	centroidLon := 0.0
	centroidLat := 0.0
	for index := range polygon {
		next := (index + 1) % len(polygon)
		x0 := polygon[index].Lon - base.Lon
		y0 := polygon[index].Lat - base.Lat
		x1 := polygon[next].Lon - base.Lon
		y1 := polygon[next].Lat - base.Lat
		cross := x0*y1 - x1*y0
		area += cross
		centroidLon += (x0 + x1) * cross
		centroidLat += (y0 + y1) * cross
	}

	area *= 0.5
	if math.Abs(area) < 1e-14 {
		return averagePoint(polygon)
	}

	return Point{
		Lon: base.Lon + centroidLon/(6*area),
		Lat: base.Lat + centroidLat/(6*area),
	}, true
}

func averagePoint(points []Point) (Point, bool) {
	if len(points) == 0 {
		return Point{}, false
	}

	totalLon := 0.0
	totalLat := 0.0
	count := 0
	for index, point := range points {
		if index == len(points)-1 && len(points) > 1 && point == points[0] {
			continue
		}
		totalLon += point.Lon
		totalLat += point.Lat
		count++
	}
	if count == 0 {
		return Point{}, false
	}
	return Point{
		Lon: totalLon / float64(count),
		Lat: totalLat / float64(count),
	}, true
}

func BearingDegrees(origin Point, target Point) float64 {
	latRadians := origin.Lat * math.Pi / 180
	dx := (target.Lon - origin.Lon) * math.Cos(latRadians)
	dy := target.Lat - origin.Lat
	return normalizeDegrees(math.Atan2(dx, dy) * 180 / math.Pi)
}

func AngleInBeam(angleDeg float64, azimuthDeg float64, beamWidthDeg float64) bool {
	if beamWidthDeg >= 360 {
		return true
	}
	delta := math.Abs(normalizeDegrees(angleDeg-azimuthDeg+180) - 180)
	return delta <= beamWidthDeg/2
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

func (f feature) FloatProperty(key string, fallback float64) float64 {
	for propertyKey, value := range f.Properties {
		if !strings.EqualFold(propertyKey, key) {
			continue
		}
		switch typed := value.(type) {
		case float64:
			if !math.IsNaN(typed) {
				return typed
			}
		case string:
			parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
			if err == nil && !math.IsNaN(parsed) {
				return parsed
			}
		}
		return fallback
	}
	return fallback
}

func (f feature) StringProperty(key string, fallback string) string {
	for propertyKey, value := range f.Properties {
		if strings.EqualFold(propertyKey, key) {
			return toString(value)
		}
	}
	return fallback
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
