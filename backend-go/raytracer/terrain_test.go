package raytracer

import (
	"encoding/binary"
	"math"
	"os"
	"testing"
)

func TestGeoTIFFTerrainSamplesEPSG4326Raster(t *testing.T) {
	path := t.TempDir() + "/terrain.tif"
	writeTestGeoTIFF(t, path)
	terrain, err := LoadGeoTIFFTerrain(path, "EPSG:4326")
	if err != nil {
		t.Fatalf("load terrain: %v", err)
	}
	if value, ok := terrain.Elevation(Point{Lon: 32.005, Lat: 39.995}); !ok || math.Abs(value-100) > 0.001 {
		t.Fatalf("first pixel = %v, %v; want 100, true", value, ok)
	}
	if value, ok := terrain.Elevation(Point{Lon: 32.01, Lat: 39.99}); !ok || math.Abs(value-115) > 0.001 {
		t.Fatalf("bilinear center = %v, %v; want 115, true", value, ok)
	}
	if _, ok := terrain.Elevation(Point{Lon: 33, Lat: 40}); ok {
		t.Fatal("out-of-bounds sample unexpectedly succeeded")
	}
	metadata := terrain.Metadata()
	if !metadata.Available || metadata.CRS != "EPSG:4326" || metadata.Width != 2 || metadata.Height != 2 {
		t.Fatalf("metadata = %+v", metadata)
	}
}

func writeTestGeoTIFF(t *testing.T, path string) {
	t.Helper()
	const entryCount = 13
	ifdSize := 2 + entryCount*12 + 4
	scaleOffset := 8 + ifdSize
	tiepointOffset := scaleOffset + 3*8
	geoKeyOffset := tiepointOffset + 6*8
	pixelOffset := geoKeyOffset + 12*2
	data := make([]byte, pixelOffset+4*4)
	order := binary.LittleEndian
	copy(data[:4], []byte{'I', 'I', 42, 0})
	order.PutUint32(data[4:8], 8)
	order.PutUint16(data[8:10], entryCount)
	type entry struct {
		tag, valueType uint16
		count, value   uint32
	}
	entries := []entry{
		{256, 4, 1, 2}, {257, 4, 1, 2}, {258, 3, 1, 32}, {259, 3, 1, 1},
		{262, 3, 1, 1}, {273, 4, 1, uint32(pixelOffset)}, {277, 3, 1, 1},
		{278, 4, 1, 2}, {279, 4, 1, 16}, {317, 3, 1, 1}, {339, 3, 1, 3},
		{33550, 12, 3, uint32(scaleOffset)}, {33922, 12, 6, uint32(tiepointOffset)},
	}
	for index, value := range entries {
		offset := 10 + index*12
		order.PutUint16(data[offset:offset+2], value.tag)
		order.PutUint16(data[offset+2:offset+4], value.valueType)
		order.PutUint32(data[offset+4:offset+8], value.count)
		if value.valueType == 3 && value.count == 1 {
			order.PutUint16(data[offset+8:offset+10], uint16(value.value))
		} else {
			order.PutUint32(data[offset+8:offset+12], value.value)
		}
	}
	// Append GeoKeyDirectoryTag as a fourteenth IFD entry by replacing the optional predictor entry.
	predictorOffset := 10 + 9*12
	order.PutUint16(data[predictorOffset:predictorOffset+2], 34735)
	order.PutUint16(data[predictorOffset+2:predictorOffset+4], 3)
	order.PutUint32(data[predictorOffset+4:predictorOffset+8], 12)
	order.PutUint32(data[predictorOffset+8:predictorOffset+12], uint32(geoKeyOffset))
	for index, value := range []float64{0.01, 0.01, 0} {
		order.PutUint64(data[scaleOffset+index*8:], math.Float64bits(value))
	}
	for index, value := range []float64{0, 0, 0, 32, 40, 0} {
		order.PutUint64(data[tiepointOffset+index*8:], math.Float64bits(value))
	}
	for index, value := range []uint16{1, 1, 0, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326} {
		order.PutUint16(data[geoKeyOffset+index*2:], value)
	}
	for index, value := range []float32{100, 110, 120, 130} {
		order.PutUint32(data[pixelOffset+index*4:], math.Float32bits(value))
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write GeoTIFF fixture: %v", err)
	}
}
