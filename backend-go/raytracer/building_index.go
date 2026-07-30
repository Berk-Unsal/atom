package raytracer

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"strings"

	"github.com/tidwall/rtree"
)

const MaxBuildingDatasetBytes int64 = 512 << 20

type Bounds struct {
	MinLon float64 `json:"minLon"`
	MinLat float64 `json:"minLat"`
	MaxLon float64 `json:"maxLon"`
	MaxLat float64 `json:"maxLat"`
}

type BuildingFootprint struct {
	ID                    string            `json:"id"`
	Tags                  map[string]string `json:"tags"`
	Weight                float64           `json:"weight"`
	DemandWeight          float64           `json:"demandWeight"`
	ResidentialDemand     float64           `json:"residentialDemand"`
	DensityScore          float64           `json:"densityScore"`
	NearbyBuildings       int               `json:"nearbyBuildings"`
	NearbyResidential     int               `json:"nearbyResidentialBuildings"`
	WeightReason          string            `json:"weightReason"`
	WeightConfidence      string            `json:"weightConfidence"`
	ResidentialReason     string            `json:"residentialReason"`
	ResidentialConfidence string            `json:"residentialConfidence"`
	Bounds                Bounds            `json:"bounds"`
	Vertices              []Point           `json:"vertices"`
}

type BuildingIndex struct {
	tree       rtree.RTreeG[*BuildingFootprint]
	footprints []*BuildingFootprint
}

type BuildingIndexStats struct {
	FootprintCount int    `json:"footprintCount"`
	TreeCount      int    `json:"treeCount"`
	SourcePath     string `json:"sourcePath,omitempty"`
}

type BuildingDemandSummary struct {
	SourcePath                   string             `json:"source_path,omitempty"`
	TotalBuildings               int                `json:"total_buildings"`
	DemandWeightedBuildings      int                `json:"demand_weighted_buildings"`
	ResidentialWeightedBuildings int                `json:"residential_weighted_buildings"`
	DensityWeightedBuildings     int                `json:"density_weighted_buildings"`
	AvgDemandWeight              float64            `json:"avg_demand_weight"`
	MaxDemandWeight              float64            `json:"max_demand_weight"`
	AvgResidentialDemand         float64            `json:"avg_residential_demand"`
	MaxResidentialDemand         float64            `json:"max_residential_demand"`
	AvgDensityScore              float64            `json:"avg_density_score"`
	MaxDensityScore              float64            `json:"max_density_score"`
	TagCoveragePct               map[string]float64 `json:"tag_coverage_pct"`
	DataQuality                  string             `json:"data_quality"`
}

func LoadBuildingIndexFromGeoJSON(path string) (*BuildingIndex, BuildingIndexStats, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, BuildingIndexStats{SourcePath: path}, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, BuildingIndexStats{SourcePath: path}, err
	}
	if info.Size() > MaxBuildingDatasetBytes {
		return nil, BuildingIndexStats{SourcePath: path}, fmt.Errorf("building dataset exceeds %d MiB", MaxBuildingDatasetBytes>>20)
	}
	if !info.Mode().IsRegular() {
		return nil, BuildingIndexStats{SourcePath: path}, errors.New("building dataset must be a regular file")
	}

	decoder := json.NewDecoder(bufio.NewReaderSize(file, 1<<20))
	start, err := decoder.Token()
	if err != nil || start != json.Delim('{') {
		return nil, BuildingIndexStats{SourcePath: path}, errors.New("expected GeoJSON object")
	}
	collectionType := ""
	featureIndex := 0
	footprints := make([]*BuildingFootprint, 0, 1024)
	for decoder.More() {
		keyToken, tokenErr := decoder.Token()
		if tokenErr != nil {
			return nil, BuildingIndexStats{SourcePath: path}, tokenErr
		}
		key, ok := keyToken.(string)
		if !ok {
			return nil, BuildingIndexStats{SourcePath: path}, errors.New("invalid GeoJSON object field")
		}
		switch key {
		case "type":
			if err := decoder.Decode(&collectionType); err != nil {
				return nil, BuildingIndexStats{SourcePath: path}, err
			}
		case "features":
			arrayStart, arrayErr := decoder.Token()
			if arrayErr != nil || arrayStart != json.Delim('[') {
				return nil, BuildingIndexStats{SourcePath: path}, errors.New("GeoJSON features must be an array")
			}
			for decoder.More() {
				var feature feature
				if err := decoder.Decode(&feature); err != nil {
					return nil, BuildingIndexStats{SourcePath: path}, err
				}
				footprints = appendFeatureFootprints(footprints, feature, featureIndex)
				featureIndex++
			}
			if _, err := decoder.Token(); err != nil {
				return nil, BuildingIndexStats{SourcePath: path}, err
			}
		default:
			if err := skipJSONValue(decoder); err != nil {
				return nil, BuildingIndexStats{SourcePath: path}, err
			}
		}
	}
	if _, err := decoder.Token(); err != nil {
		return nil, BuildingIndexStats{SourcePath: path}, err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, BuildingIndexStats{SourcePath: path}, errors.New("unexpected content after GeoJSON object")
	}
	if collectionType != "FeatureCollection" {
		return nil, BuildingIndexStats{SourcePath: path}, errors.New("expected GeoJSON FeatureCollection")
	}

	index := NewBuildingIndex(footprints)
	return index, BuildingIndexStats{
		FootprintCount: len(footprints),
		TreeCount:      index.Len(),
		SourcePath:     path,
	}, nil
}

func appendFeatureFootprints(footprints []*BuildingFootprint, feature feature, featureIndex int) []*BuildingFootprint {
	tags := feature.StringProperties()
	weight := feature.FloatProperty("weight", 1.0)
	if weight <= 0 {
		weight = 1.0
	}
	demandWeight := feature.FloatProperty("demand_weight", 0)
	if demandWeight < 0 {
		demandWeight = 0
	}
	residentialDemand := feature.FloatProperty("residential_demand", 0)
	if residentialDemand < 0 {
		residentialDemand = 0
	}
	densityScore := feature.FloatProperty("density_score", 0)
	if densityScore < 0 {
		densityScore = 0
	}
	nearbyBuildings := int(math.Round(feature.FloatProperty("nearby_buildings", 0)))
	if nearbyBuildings < 0 {
		nearbyBuildings = 0
	}
	nearbyResidential := int(math.Round(feature.FloatProperty("nearby_residential_buildings", 0)))
	if nearbyResidential < 0 {
		nearbyResidential = 0
	}
	weightReason := strings.TrimSpace(feature.StringProperty("weight_reason", "generic"))
	if weightReason == "" {
		weightReason = "generic"
	}
	weightConfidence := strings.TrimSpace(feature.StringProperty("weight_confidence", "none"))
	if weightConfidence == "" {
		weightConfidence = "none"
	}
	residentialReason := strings.TrimSpace(feature.StringProperty("residential_reason", "none"))
	if residentialReason == "" {
		residentialReason = "none"
	}
	residentialConfidence := strings.TrimSpace(feature.StringProperty("residential_confidence", "none"))
	if residentialConfidence == "" {
		residentialConfidence = "none"
	}

	rings := feature.Geometry.OuterRings()
	for ringIndex, ring := range rings {
		bounds, ok := BoundsFromPoints(ring)
		if !ok {
			continue
		}

		id := feature.IDOrIndex(featureIndex)
		if len(rings) > 1 {
			id = fmt.Sprintf("%s-%d", id, ringIndex)
		}

		footprints = append(footprints, &BuildingFootprint{
			ID:                    id,
			Tags:                  tags,
			Weight:                weight,
			DemandWeight:          demandWeight,
			ResidentialDemand:     residentialDemand,
			DensityScore:          densityScore,
			NearbyBuildings:       nearbyBuildings,
			NearbyResidential:     nearbyResidential,
			WeightReason:          weightReason,
			WeightConfidence:      weightConfidence,
			ResidentialReason:     residentialReason,
			ResidentialConfidence: residentialConfidence,
			Bounds:                bounds,
			Vertices:              ring,
		})
	}
	return footprints
}

func skipJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		for decoder.More() {
			if _, err := decoder.Token(); err != nil {
				return err
			}
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
	case '[':
		for decoder.More() {
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
	default:
		return errors.New("invalid JSON delimiter")
	}
	_, err = decoder.Token()
	return err
}

func NewBuildingIndex(footprints []*BuildingFootprint) *BuildingIndex {
	index := &BuildingIndex{
		footprints: make([]*BuildingFootprint, 0, len(footprints)),
	}

	for _, footprint := range footprints {
		if footprint == nil || !footprint.Bounds.Valid() {
			continue
		}
		index.footprints = append(index.footprints, footprint)
		index.tree.Insert(footprint.Bounds.Min(), footprint.Bounds.Max(), footprint)
	}

	return index
}

func EmptyBuildingIndex() *BuildingIndex {
	return NewBuildingIndex(nil)
}

func (idx *BuildingIndex) Len() int {
	if idx == nil {
		return 0
	}
	return idx.tree.Len()
}

func (idx *BuildingIndex) Footprints() []*BuildingFootprint {
	if idx == nil {
		return nil
	}
	return idx.footprints
}

func (idx *BuildingIndex) SearchBounds(bounds Bounds) []*BuildingFootprint {
	if idx == nil || !bounds.Valid() {
		return nil
	}

	candidates := make([]*BuildingFootprint, 0, 16)
	idx.tree.Search(bounds.Min(), bounds.Max(), func(_ [2]float64, _ [2]float64, footprint *BuildingFootprint) bool {
		candidates = append(candidates, footprint)
		return true
	})
	return candidates
}

func (idx *BuildingIndex) SearchRay(origin Point, end Point) []*BuildingFootprint {
	return idx.SearchBounds(BoundsFromSegment(origin, end))
}

func (idx *BuildingIndex) DemandSummary(sourcePath string) BuildingDemandSummary {
	summary := BuildingDemandSummary{
		SourcePath:     sourcePath,
		TagCoveragePct: make(map[string]float64),
		DataQuality:    "sparse",
	}
	if idx == nil || len(idx.footprints) == 0 {
		return summary
	}

	summary.TotalBuildings = len(idx.footprints)
	tagHits := map[string]int{
		"building:levels": 0,
		"height":          0,
		"amenity":         0,
		"shop":            0,
		"office":          0,
		"name":            0,
	}
	totalDemandWeight := 0.0
	totalResidentialDemand := 0.0
	totalDensityScore := 0.0
	for _, footprint := range idx.footprints {
		if footprint.DemandWeight > 0 {
			summary.DemandWeightedBuildings++
			totalDemandWeight += footprint.DemandWeight
			summary.MaxDemandWeight = math.Max(summary.MaxDemandWeight, footprint.DemandWeight)
		}
		if footprint.ResidentialDemand > 0 {
			summary.ResidentialWeightedBuildings++
			totalResidentialDemand += footprint.ResidentialDemand
			summary.MaxResidentialDemand = math.Max(summary.MaxResidentialDemand, footprint.ResidentialDemand)
		}
		if footprint.DensityScore >= 25 {
			summary.DensityWeightedBuildings++
		}
		totalDensityScore += footprint.DensityScore
		summary.MaxDensityScore = math.Max(summary.MaxDensityScore, footprint.DensityScore)
		for tag := range tagHits {
			if meaningfulTagValue(footprint.Tags[tag]) {
				tagHits[tag]++
			}
		}
	}
	if summary.DemandWeightedBuildings > 0 {
		summary.AvgDemandWeight = math.Round((totalDemandWeight/float64(summary.DemandWeightedBuildings))*100) / 100
	}
	if summary.ResidentialWeightedBuildings > 0 {
		summary.AvgResidentialDemand = math.Round((totalResidentialDemand/float64(summary.ResidentialWeightedBuildings))*100) / 100
	}
	summary.MaxDemandWeight = math.Round(summary.MaxDemandWeight*100) / 100
	summary.MaxResidentialDemand = math.Round(summary.MaxResidentialDemand*100) / 100
	summary.AvgDensityScore = math.Round((totalDensityScore/float64(summary.TotalBuildings))*100) / 100
	summary.MaxDensityScore = math.Round(summary.MaxDensityScore*100) / 100
	for tag, count := range tagHits {
		summary.TagCoveragePct[tag] = math.Round((float64(count)/float64(summary.TotalBuildings))*10000) / 100
	}

	weightedPct := float64(summary.DemandWeightedBuildings+summary.ResidentialWeightedBuildings) / float64(summary.TotalBuildings) * 100
	switch {
	case weightedPct >= 10:
		summary.DataQuality = "good"
	case weightedPct >= 3:
		summary.DataQuality = "moderate"
	default:
		summary.DataQuality = "sparse"
	}
	return summary
}

func meaningfulTagValue(value string) bool {
	cleaned := strings.TrimSpace(strings.ToLower(value))
	return cleaned != "" && cleaned != "null" && cleaned != "none" && cleaned != "nan" && cleaned != "no"
}

func BoundsFromSegment(a Point, b Point) Bounds {
	return Bounds{
		MinLon: math.Min(a.Lon, b.Lon),
		MinLat: math.Min(a.Lat, b.Lat),
		MaxLon: math.Max(a.Lon, b.Lon),
		MaxLat: math.Max(a.Lat, b.Lat),
	}
}

func BoundsAroundPoint(center Point, radiusMeters float64) Bounds {
	if radiusMeters < 0 {
		radiusMeters = 0
	}
	latDelta := radiusMeters / 111_320
	cosLat := math.Cos(center.Lat * math.Pi / 180)
	if math.Abs(cosLat) < 1e-9 {
		cosLat = 1e-9
	}
	lonDelta := radiusMeters / (111_320 * cosLat)
	return Bounds{
		MinLon: center.Lon - lonDelta,
		MinLat: center.Lat - latDelta,
		MaxLon: center.Lon + lonDelta,
		MaxLat: center.Lat + latDelta,
	}
}

func BoundsFromPoints(points []Point) (Bounds, bool) {
	if len(points) < 3 {
		return Bounds{}, false
	}

	bounds := Bounds{
		MinLon: math.Inf(1),
		MinLat: math.Inf(1),
		MaxLon: math.Inf(-1),
		MaxLat: math.Inf(-1),
	}
	for _, point := range points {
		if math.IsNaN(point.Lon) || math.IsNaN(point.Lat) {
			continue
		}
		bounds.MinLon = math.Min(bounds.MinLon, point.Lon)
		bounds.MinLat = math.Min(bounds.MinLat, point.Lat)
		bounds.MaxLon = math.Max(bounds.MaxLon, point.Lon)
		bounds.MaxLat = math.Max(bounds.MaxLat, point.Lat)
	}

	return bounds, bounds.Valid()
}

func (b Bounds) Valid() bool {
	return !math.IsInf(b.MinLon, 0) &&
		!math.IsInf(b.MinLat, 0) &&
		!math.IsInf(b.MaxLon, 0) &&
		!math.IsInf(b.MaxLat, 0) &&
		!math.IsNaN(b.MinLon) &&
		!math.IsNaN(b.MinLat) &&
		!math.IsNaN(b.MaxLon) &&
		!math.IsNaN(b.MaxLat) &&
		b.MinLon <= b.MaxLon &&
		b.MinLat <= b.MaxLat
}

func (b Bounds) Min() [2]float64 {
	return [2]float64{b.MinLon, b.MinLat}
}

func (b Bounds) Max() [2]float64 {
	return [2]float64{b.MaxLon, b.MaxLat}
}
