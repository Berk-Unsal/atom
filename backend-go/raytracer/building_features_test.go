package raytracer

import "testing"

func TestBuildingFeatureCollectionFiltersSortsAndPages(t *testing.T) {
	index := NewBuildingIndex([]*BuildingFootprint{
		{ID: "b", Tags: map[string]string{"building": "apartments"}, HeightMeters: 12, HeightSource: "height", Material: "brick", Bounds: Bounds{0, 0, 1, 1}, Vertices: []Point{{0, 0}, {1, 0}, {1, 1}, {0, 1}, {0, 0}}},
		{ID: "a", Tags: map[string]string{"building": "office"}, HeightMeters: 9, HeightSource: "default", Material: "unknown", Bounds: Bounds{2, 2, 3, 3}, Vertices: []Point{{2, 2}, {3, 2}, {3, 3}, {2, 3}, {2, 2}}},
		{ID: "c", Tags: map[string]string{"building": "house"}, HeightMeters: 6, HeightSource: "levels", Material: "wood", Bounds: Bounds{0.5, 0.5, 0.7, 0.7}, Vertices: []Point{{0.5, 0.5}, {0.7, 0.5}, {0.7, 0.7}, {0.5, 0.7}, {0.5, 0.5}}},
	})
	collection := index.FeatureCollection(Bounds{MinLon: 0.25, MinLat: 0.25, MaxLon: 0.75, MaxLat: 0.75}, 1, 1)
	if collection.NumberMatched != 2 || collection.NumberReturned != 1 || collection.Features[0].ID != "c" {
		t.Fatalf("collection = %#v", collection)
	}
	if collection.Features[0].Geometry.Coordinates[0][0][0] != collection.Features[0].Geometry.Coordinates[0][len(collection.Features[0].Geometry.Coordinates[0])-1][0] {
		t.Fatal("GeoJSON polygon ring is not closed")
	}
}

func TestPolygonIntersectsBoundsRejectsBoundingBoxFalsePositive(t *testing.T) {
	triangle := []Point{{0, 0}, {2, 0}, {0, 2}, {0, 0}}
	if polygonIntersectsBounds(triangle, Bounds{MinLon: 1.8, MinLat: 1.8, MaxLon: 2, MaxLat: 2}) {
		t.Fatal("query in the triangle bounding-box corner should not intersect the triangle")
	}
}
