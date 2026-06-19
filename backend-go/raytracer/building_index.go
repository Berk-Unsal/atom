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
	ID            string            `json:"id"`
	Kind          string            `json:"kind"`
	Tags          map[string]string `json:"tags"`
	AttenuationDB float64           `json:"attenuationDb"`
	Bounds        Bounds            `json:"bounds"`
	Vertices      []Point           `json:"vertices"`
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
				ID:            id,
				Kind:          kind,
				Tags:          tags,
				AttenuationDB: attenuation,
				Bounds:        bounds,
				Vertices:      ring,
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
