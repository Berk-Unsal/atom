package raytracer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestStreamingBuildingFeaturesMatchIndependentDecode(t *testing.T) {
	// Missing/null fields must not inherit the previous feature's ID, tags or
	// geometry. Later decoding must not mutate already published footprints.
	const polygon = `{"type":"Polygon","coordinates":[[[32,39],[33,39],[33,40],[32,39]]]}`
	const multi = `{"type":"MultiPolygon","coordinates":[[[[34,39],[35,39],[35,40],[34,39]]],[[[36,39],[37,39],[37,40],[36,39]]]]}`
	cases := map[string]string{
		"missing fields":   `[{"id":"first","properties":{"HEIGHT":12,"building":"YES","custom":{"a":true}},"geometry":` + polygon + `},{"geometry":` + multi + `},{"id":0},{},{"properties":{"building:levels":2},"geometry":` + polygon + `}]`,
		"null fields":      `[{"id":"first","properties":{"weight":9,"height":27},"geometry":` + polygon + `},null,{"id":null,"properties":null,"geometry":null},{"geometry":` + polygon + `},{"properties":{"custom":null,"flag":false,"values":[1,"x"]},"geometry":` + polygon + `}]`,
		"partial geometry": `[{"id":42,"properties":{"material":"brick"},"geometry":` + polygon + `},{"geometry":{"type":"Polygon"}},{"geometry":{"coordinates":[[[32,39],[33,39],[33,40],[32,39]]]}},{"geometry":{"type":null,"coordinates":null}},{"id":"last","properties":{},"geometry":` + multi + `}]`,
	}
	for name, features := range cases {
		t.Run(name, func(t *testing.T) {
			data := []byte(`{"type":"FeatureCollection","features":` + features + `}`)
			var independentlyDecoded featureCollection
			if err := json.Unmarshal(data, &independentlyDecoded); err != nil {
				t.Fatal(err)
			}
			var expected []*BuildingFootprint
			for i, f := range independentlyDecoded.Features {
				expected = appendFeatureFootprints(expected, f, i)
			}
			path := filepath.Join(t.TempDir(), "features.geojson")
			if err := os.WriteFile(path, data, 0o600); err != nil {
				t.Fatal(err)
			}
			index, _, err := LoadBuildingIndexFromGeoJSON(path)
			if err != nil {
				t.Fatal(err)
			}
			if actual := index.Footprints(); !reflect.DeepEqual(actual, expected) {
				t.Fatalf("streamed footprints differ from independent decode:\nactual: %#v\nexpected: %#v", actual, expected)
			}
		})
	}
}

func TestStreamingBuildingFeaturesRejectInvalidJSON(t *testing.T) {
	for _, data := range []string{
		`{"type":"FeatureCollection","features":[{"geometry":`,
		`{"type":"FeatureCollection","features":{}}`,
		`{"type":"FeatureCollection","features":[{"properties":42}]}`,
		`{"type":"FeatureCollection","features":[{"geometry":{"type":42}}]}`,
		`{"type":"FeatureCollection","features":[]} {}`,
		`{"type":"Polygon","features":[]}`,
	} {
		t.Run(data, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "invalid.geojson")
			if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, _, err := LoadBuildingIndexFromGeoJSON(path); err == nil {
				t.Fatal("accepted invalid GeoJSON")
			}
		})
	}
}

func TestLoadBuildingIndexDefaultsMissingDemandWeightToZero(t *testing.T) {
	path := filepath.Join(t.TempDir(), "buildings.geojson")
	geojson := `{
		"type": "FeatureCollection",
		"features": [{
			"type": "Feature",
			"id": "generic-building",
			"properties": {"building": "yes", "weight": 42},
			"geometry": {
				"type": "Polygon",
				"coordinates": [[[32,39],[32.001,39],[32.001,39.001],[32,39.001],[32,39]]]
			}
		}]
	}`
	if err := os.WriteFile(path, []byte(geojson), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	index, _, err := LoadBuildingIndexFromGeoJSON(path)
	if err != nil {
		t.Fatalf("load building index: %v", err)
	}
	footprints := index.Footprints()
	if len(footprints) != 1 {
		t.Fatalf("footprints = %d, want 1", len(footprints))
	}
	if footprints[0].Weight != 42 {
		t.Fatalf("weight = %.1f, want 42", footprints[0].Weight)
	}
	if footprints[0].DemandWeight != 0 {
		t.Fatalf("missing demand_weight default = %.1f, want 0", footprints[0].DemandWeight)
	}
	if footprints[0].ResidentialDemand != 0 {
		t.Fatalf("missing residential_demand default = %.1f, want 0", footprints[0].ResidentialDemand)
	}
	if footprints[0].DensityScore != 0 {
		t.Fatalf("missing density_score default = %.1f, want 0", footprints[0].DensityScore)
	}
}

func TestLoadBuildingIndexRejectsOversizedDatasetBeforeDecoding(t *testing.T) {
	path := filepath.Join(t.TempDir(), "oversized.geojson")
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}
	if err := file.Truncate(MaxBuildingDatasetBytes + 1); err != nil {
		file.Close()
		t.Fatalf("truncate fixture: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close fixture: %v", err)
	}
	if _, _, err := LoadBuildingIndexFromGeoJSON(path); err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("error = %v, want dataset size rejection", err)
	}
}
