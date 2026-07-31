package raytracer

import (
	"sort"
)

type BuildingGeoJSONFeatureCollection struct {
	Type           string                   `json:"type"`
	Features       []BuildingGeoJSONFeature `json:"features"`
	NumberMatched  int                      `json:"numberMatched"`
	NumberReturned int                      `json:"numberReturned"`
	Limit          int                      `json:"limit"`
	Offset         int                      `json:"offset"`
}

type BuildingGeoJSONFeature struct {
	Type       string                    `json:"type"`
	ID         string                    `json:"id"`
	Properties BuildingFeatureProperties `json:"properties"`
	Geometry   PolygonGeometry           `json:"geometry"`
}

type PolygonGeometry struct {
	Type        string        `json:"type"`
	Coordinates [][][]float64 `json:"coordinates"`
}

type BuildingFeatureProperties struct {
	Building              string  `json:"building,omitempty"`
	Name                  string  `json:"name,omitempty"`
	Amenity               string  `json:"amenity,omitempty"`
	HeightMeters          float64 `json:"height_m"`
	HeightSource          string  `json:"height_source"`
	Material              string  `json:"material"`
	DemandWeight          float64 `json:"demand_weight"`
	ResidentialDemand     float64 `json:"residential_demand"`
	DensityScore          float64 `json:"density_score"`
	WeightConfidence      string  `json:"weight_confidence"`
	ResidentialConfidence string  `json:"residential_confidence"`
}

func (idx *BuildingIndex) FeatureCollection(bounds Bounds, limit, offset int) BuildingGeoJSONFeatureCollection {
	if limit < 1 {
		limit = 1
	}
	if offset < 0 {
		offset = 0
	}
	matched := make([]*BuildingFootprint, 0)
	for _, building := range idx.SearchBounds(bounds) {
		if building != nil && polygonIntersectsBounds(building.Vertices, bounds) {
			matched = append(matched, building)
		}
	}
	sort.SliceStable(matched, func(i, j int) bool { return matched[i].ID < matched[j].ID })
	end := min(len(matched), offset+limit)
	if offset > len(matched) {
		offset = len(matched)
	}
	features := make([]BuildingGeoJSONFeature, 0, end-offset)
	for _, building := range matched[offset:end] {
		features = append(features, buildingGeoJSONFeature(building))
	}
	return BuildingGeoJSONFeatureCollection{
		Type: "FeatureCollection", Features: features, NumberMatched: len(matched),
		NumberReturned: len(features), Limit: limit, Offset: offset,
	}
}

func buildingGeoJSONFeature(building *BuildingFootprint) BuildingGeoJSONFeature {
	ring := make([][]float64, 0, len(building.Vertices)+1)
	for _, point := range building.Vertices {
		ring = append(ring, []float64{point.Lon, point.Lat})
	}
	if len(ring) > 0 && (ring[0][0] != ring[len(ring)-1][0] || ring[0][1] != ring[len(ring)-1][1]) {
		ring = append(ring, append([]float64(nil), ring[0]...))
	}
	return BuildingGeoJSONFeature{
		Type: "Feature", ID: building.ID,
		Properties: BuildingFeatureProperties{
			Building: building.Tags["building"], Name: building.Tags["name"], Amenity: building.Tags["amenity"],
			HeightMeters: building.HeightMeters, HeightSource: building.HeightSource, Material: building.Material,
			DemandWeight: building.DemandWeight, ResidentialDemand: building.ResidentialDemand,
			DensityScore: building.DensityScore, WeightConfidence: building.WeightConfidence,
			ResidentialConfidence: building.ResidentialConfidence,
		},
		Geometry: PolygonGeometry{Type: "Polygon", Coordinates: [][][]float64{ring}},
	}
}

func polygonIntersectsBounds(vertices []Point, bounds Bounds) bool {
	if len(vertices) < 3 || !bounds.Valid() {
		return false
	}
	for _, point := range vertices {
		if pointInBounds(point, bounds) {
			return true
		}
	}
	corners := []Point{
		{Lon: bounds.MinLon, Lat: bounds.MinLat}, {Lon: bounds.MaxLon, Lat: bounds.MinLat},
		{Lon: bounds.MaxLon, Lat: bounds.MaxLat}, {Lon: bounds.MinLon, Lat: bounds.MaxLat},
	}
	for _, corner := range corners {
		if PointInPolygon(corner, vertices) {
			return true
		}
	}
	for index := range vertices {
		next := (index + 1) % len(vertices)
		for edgeIndex := range corners {
			edgeNext := (edgeIndex + 1) % len(corners)
			if hit, _ := SegmentIntersectionPoint(vertices[index], vertices[next], corners[edgeIndex], corners[edgeNext]); hit {
				return true
			}
		}
	}
	return false
}

func pointInBounds(point Point, bounds Bounds) bool {
	return point.Lon >= bounds.MinLon && point.Lon <= bounds.MaxLon && point.Lat >= bounds.MinLat && point.Lat <= bounds.MaxLat
}
