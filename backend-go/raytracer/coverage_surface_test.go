package raytracer

import (
	"context"
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateCoverageSurfaceProducesRasterAndContours(t *testing.T) {
	profile := DefaultCellRFProfile("4g", 2.6, 43, 100, 360, 0, 0, 0)
	profile.HorizontalPatternID = "omni"
	response, err := GenerateCoverageSurfaceContext(context.Background(), CoverageSurfaceRequest{
		Simulation: StaticSimulationRequest{
			TowerLon: 32.85, TowerLat: 39.92, Rays: 24, RadiusMeters: 100, FrequencyGHz: 2.6,
			TxPowerDBm: 43, AzimuthDeg: 0, BeamWidthDeg: 360, RFProfile: profile,
		},
		CellSizeMeters: 25,
		ThresholdsDBm:  []float64{-100, -80},
	}, EmptyBuildingIndex())
	if err != nil {
		t.Fatalf("generate surface: %v", err)
	}
	if response.Grid.Width != 9 || response.Grid.Height != 9 || response.Stats.ValidCellCount == 0 {
		t.Fatalf("grid = %dx%d valid=%d", response.Grid.Width, response.Grid.Height, response.Stats.ValidCellCount)
	}
	if response.Grid.Values[4*response.Grid.Width+4] == SurfaceNoDataValue {
		t.Fatal("tower-center grid cell should contain a signal value")
	}
	if response.Contours.Type != "FeatureCollection" {
		t.Fatalf("contours type = %q", response.Contours.Type)
	}
}

func TestCoverageSurfaceGridLimit(t *testing.T) {
	request := CoverageSurfaceRequest{Simulation: StaticSimulationRequest{RadiusMeters: 5000}, CellSizeMeters: 10, ThresholdsDBm: []float64{-100}}
	if validation := ValidateCoverageSurfaceRequest(request); validation == "" {
		t.Fatal("expected surface cell limit validation")
	}
}

func TestEncodeCoverageGeoTIFFRoundTripsThroughTerrainReader(t *testing.T) {
	grid := CoverageRasterGrid{
		CRS: "OGC:CRS84", Bounds: []float64{32, 39, 32.02, 39.02}, Width: 3, Height: 3,
		CellSizeMeters: 1000, NoDataValue: SurfaceNoDataValue, RowOrder: "south-to-north",
		Values: []float64{-90, -89, -88, -80, -79, -78, -70, -69, -68},
	}
	payload, err := EncodeCoverageGeoTIFF(grid)
	if err != nil {
		t.Fatalf("encode GeoTIFF: %v", err)
	}
	path := filepath.Join(t.TempDir(), "surface.tif")
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatalf("write GeoTIFF: %v", err)
	}
	terrain, err := LoadGeoTIFFTerrain(path, "EPSG:4326")
	if err != nil {
		t.Fatalf("load exported GeoTIFF: %v", err)
	}
	value, ok := terrain.Elevation(Point{Lon: 32.01, Lat: 39.01})
	if !ok || math.Abs(value-(-79)) > 0.01 {
		t.Fatalf("center value = %.2f, ok=%v", value, ok)
	}
}
