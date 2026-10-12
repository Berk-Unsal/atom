package raytracer

import (
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestHGTTerrainControlledFixture(t *testing.T) {
	path := filepath.Join(t.TempDir(), "N39E032.hgt")
	data := make([]byte, 1201*1201*2)
	put := func(row, column int, value int16) {
		binary.BigEndian.PutUint16(data[(row*1201+column)*2:], uint16(value))
	}
	put(0, 0, 100)
	put(0, 1, 200)
	put(1, 0, 300)
	put(1, 1, 400)
	put(2, 2, -12)
	put(3, 3, -32768)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write HGT fixture: %v", err)
	}

	model, err := LoadHGTTerrain(path, "EPSG:4326")
	if err != nil {
		t.Fatalf("load HGT fixture: %v", err)
	}
	metadata := model.Metadata()
	if metadata.Format != "hgt" || metadata.Width != 1201 || metadata.Height != 1201 || metadata.Bounds[0] != 32 || metadata.Bounds[1] != 39 || metadata.Bounds[2] != 33 || metadata.Bounds[3] != 40 {
		t.Fatalf("HGT metadata = %+v", metadata)
	}

	hgt := model.(*hgtTerrain)
	resolution := 1.0 / 1200
	value, ok := hgt.Sample(Point{Lon: 32 + resolution*0.5, Lat: 40 - resolution*0.5}, TerrainInterpolationBilinear)
	if !ok || math.Abs(value-250) > 1e-9 {
		t.Fatalf("bilinear HGT sample = %v, %v; want 250, true", value, ok)
	}
	value, ok = hgt.Sample(Point{Lon: 32 + resolution*2, Lat: 40 - resolution*2}, TerrainInterpolationNearest)
	if !ok || value != -12 {
		t.Fatalf("negative nearest HGT sample = %v, %v; want -12, true", value, ok)
	}
	if _, ok := hgt.Sample(Point{Lon: 32 + resolution*3, Lat: 40 - resolution*3}, TerrainInterpolationNearest); ok {
		t.Fatal("HGT no-data posting was returned as valid")
	}
	if _, ok := hgt.Elevation(Point{Lon: 33.01, Lat: 39.5}); ok {
		t.Fatal("outside HGT tile was returned as valid")
	}
	if err := hgt.Close(); err != nil {
		t.Fatalf("close HGT fixture: %v", err)
	}
	if _, ok := hgt.Elevation(Point{Lon: 32, Lat: 40}); ok {
		t.Fatal("closed HGT returned a sample")
	}
}

func TestHGTTerrainRequiresExplicitCRSAndStandardSize(t *testing.T) {
	if width, height, resolution, err := hgtDimensions(int64(3601 * 3601 * 2)); err != nil || width != 3601 || height != 3601 || math.Abs(resolution-1.0/3600.0) > 1e-15 {
		t.Fatalf("1-arc-second HGT dimensions = %d x %d at %.12f, err=%v", width, height, resolution, err)
	}
	path := filepath.Join(t.TempDir(), "N39E032.hgt")
	if err := os.WriteFile(path, make([]byte, 2), 0o600); err != nil {
		t.Fatalf("write invalid HGT fixture: %v", err)
	}
	if _, err := LoadHGTTerrain(path, ""); err == nil {
		t.Fatal("HGT without CRS declaration loaded")
	}
	if _, err := LoadHGTTerrain(path, "EPSG:4326"); err == nil {
		t.Fatal("invalid HGT size loaded")
	}
	if _, err := LoadHGTTerrain(filepath.Join(t.TempDir(), "terrain.hgt"), "EPSG:4326"); err == nil {
		t.Fatal("HGT without a tile filename loaded")
	}
}
