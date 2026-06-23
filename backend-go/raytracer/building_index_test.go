package raytracer

import (
	"os"
	"path/filepath"
	"testing"
)

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
}
