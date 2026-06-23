package raytracer

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"strings"

	"github.com/tidwall/rtree"
)

const DefaultBuildingAttenuationDB = 30.0

type Bounds struct {
	MinLon float64 `json:"minLon"`
	MinLat float64 `json:"minLat"`
	MaxLon float64 `json:"maxLon"`
	MaxLat float64 `json:"maxLat"`
}

type BuildingFootprint struct {
	ID               string            `json:"id"`
	Kind             string            `json:"kind"`
	Tags             map[string]string `json:"tags"`
	Weight           float64           `json:"weight"`
	DemandWeight     float64           `json:"demandWeight"`
	WeightReason     string            `json:"weightReason"`
	WeightConfidence string            `json:"weightConfidence"`
	AttenuationDB    float64           `json:"attenuationDb"`
	Bounds           Bounds            `json:"bounds"`
	Vertices         []Point           `json:"vertices"`
}

type BuildingIndex struct {
	tree       rtree.RTreeG[*BuildingFootprint]
	footprints []*BuildingFootprint
}

type BuildingIndexStats struct {
	FootprintCount int    `json:"footprintCount"`
	TreeCount      int    `json:"treeCount"`
	SourcePath     string `json:"sourcePath"`
}

type BuildingDemandSummary struct {
	SourcePath              string             `json:"source_path"`
	TotalBuildings          int                `json:"total_buildings"`
	DemandWeightedBuildings int                `json:"demand_weighted_buildings"`
	AvgDemandWeight         float64            `json:"avg_demand_weight"`
	MaxDemandWeight         float64            `json:"max_demand_weight"`
	TagCoveragePct          map[string]float64 `json:"tag_coverage_pct"`
	DataQuality             string             `json:"data_quality"`
}

func LoadBuildingIndexFromGeoJSON(path string) (*BuildingIndex, BuildingIndexStats, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, BuildingIndexStats{SourcePath: path}, err
	}

	var collection featureCollection
	if err := json.Unmarshal(bytes, &collection); err != nil {
		return nil, BuildingIndexStats{SourcePath: path}, err
	}
	if collection.Type != "FeatureCollection" {
		return nil, BuildingIndexStats{SourcePath: path}, errors.New("expected GeoJSON FeatureCollection")
	}

	footprints := make([]*BuildingFootprint, 0, len(collection.Features))
	for featureIndex, feature := range collection.Features {
		tags := feature.StringProperties()
		kind, attenuation := buildingKindAndAttenuation(tags)
		weight := feature.FloatProperty("weight", 1.0)
		if weight <= 0 {
			weight = 1.0
		}
		demandWeight := feature.FloatProperty("demand_weight", 0)
		if demandWeight < 0 {
			demandWeight = 0
		}
		weightReason := strings.TrimSpace(feature.StringProperty("weight_reason", "generic"))
		if weightReason == "" {
			weightReason = "generic"
		}
		weightConfidence := strings.TrimSpace(feature.StringProperty("weight_confidence", "none"))
		if weightConfidence == "" {
			weightConfidence = "none"
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
				ID:               id,
				Kind:             kind,
				Tags:             tags,
				Weight:           weight,
				DemandWeight:     demandWeight,
				WeightReason:     weightReason,
				WeightConfidence: weightConfidence,
				AttenuationDB:    attenuation,
				Bounds:           bounds,
				Vertices:         ring,
			})
		}
	}

	index := NewBuildingIndex(footprints)
	return index, BuildingIndexStats{
		FootprintCount: len(footprints),
		TreeCount:      index.Len(),
		SourcePath:     path,
	}, nil
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
	for _, footprint := range idx.footprints {
		if footprint.DemandWeight > 0 {
			summary.DemandWeightedBuildings++
			totalDemandWeight += footprint.DemandWeight
			summary.MaxDemandWeight = math.Max(summary.MaxDemandWeight, footprint.DemandWeight)
		}
		for tag := range tagHits {
			if meaningfulTagValue(footprint.Tags[tag]) {
				tagHits[tag]++
			}
		}
	}
	if summary.DemandWeightedBuildings > 0 {
		summary.AvgDemandWeight = math.Round((totalDemandWeight/float64(summary.DemandWeightedBuildings))*100) / 100
	}
	summary.MaxDemandWeight = math.Round(summary.MaxDemandWeight*100) / 100
	for tag, count := range tagHits {
		summary.TagCoveragePct[tag] = math.Round((float64(count)/float64(summary.TotalBuildings))*10000) / 100
	}

	weightedPct := float64(summary.DemandWeightedBuildings) / float64(summary.TotalBuildings) * 100
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

func buildingKindAndAttenuation(tags map[string]string) (string, float64) {
	if kind, attenuation, ok := AttenuationForTags(tags); ok {
		return kind, attenuation
	}

	if building := strings.TrimSpace(tags["building"]); building != "" && building != "no" {
		return "building:" + strings.ToLower(building), DefaultBuildingAttenuationDB
	}
	return "building", DefaultBuildingAttenuationDB
}
