package raytracer

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

var hgtTileName = regexp.MustCompile(`(?i)^([ns])(\d{1,2})([ew])(\d{3})(?:\.hgt)?$`)

// hgtTerrain reads the standard Shuttle Radar Topography Mission posting
// layout: signed, big-endian int16 samples, ordered north-to-south and
// west-to-east. HGT has no self-describing CRS or datum metadata; those
// declarations are deliberately supplied by the dataset manifest.
type hgtTerrain struct {
	file       *os.File
	width      int
	height     int
	resolution float64
	west       float64
	north      float64
	nodata     *float64
	metadata   TerrainMetadata
	fileMu     syncFileLock
}

// syncFileLock is kept local to the adapter so closing a short-lived
// diagnostic model cannot race an in-flight ReadAt. Dataset packs normally
// keep the model open for the lifetime of the pack.
type syncFileLock struct {
	mu sync.RWMutex
}

func LoadHGTTerrain(path, declaredCRS string) (TerrainModel, error) {
	if strings.ToUpper(strings.TrimSpace(declaredCRS)) != "EPSG:4326" {
		return nil, errors.New("HGT terrain layer CRS must be declared as EPSG:4326")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	fail := func(cause error) (TerrainModel, error) {
		_ = file.Close()
		return nil, cause
	}
	name := strings.ToLower(filepath.Base(path))
	match := hgtTileName.FindStringSubmatch(name)
	if len(match) != 5 {
		return fail(errors.New("HGT filename must encode a tile such as N39E032.hgt"))
	}
	latitude, err := strconv.Atoi(match[2])
	if err != nil || latitude > 90 {
		return fail(errors.New("HGT filename has an invalid latitude"))
	}
	longitude, err := strconv.Atoi(match[4])
	if err != nil || longitude > 180 {
		return fail(errors.New("HGT filename has an invalid longitude"))
	}
	if match[1] == "s" {
		latitude = -latitude
	}
	if match[3] == "w" {
		longitude = -longitude
	}
	info, err := file.Stat()
	if err != nil {
		return fail(fmt.Errorf("stat HGT: %w", err))
	}
	width, height, resolution, err := hgtDimensions(info.Size())
	if err != nil {
		return fail(err)
	}
	nodata := -32768.0
	terrain := &hgtTerrain{
		file:       file,
		width:      width,
		height:     height,
		resolution: resolution,
		west:       float64(longitude),
		north:      float64(latitude + 1),
		nodata:     &nodata,
	}
	terrain.metadata = TerrainMetadata{
		Available:          true,
		Status:             TerrainStatusAvailable,
		Source:             filepath.Base(path),
		Format:             "hgt",
		CRS:                "EPSG:4326",
		Kind:               TerrainKindDEMUnspecified,
		ElevationReference: "integer-metre postings; source vertical datum must be declared by the dataset layer",
		VerticalDatum:      "unspecified",
		VerticalDatumKind:  VerticalDatumUnknown,
		Width:              width,
		Height:             height,
		Bounds:             []float64{float64(longitude), float64(latitude), float64(longitude) + 1, float64(latitude) + 1},
		ResolutionXDeg:     resolution,
		ResolutionYDeg:     resolution,
		RasterType:         "hgt-posting-north-to-south",
		Interpolation:      TerrainInterpolationBilinear,
		NoData:             terrain.nodata,
		Limitations: []string{
			"HGT has no embedded CRS or vertical-datum metadata; caller declarations are mandatory",
			"standard signed big-endian int16 postings with a one-cell overlap at tile edges",
		},
	}
	terrain.metadata.ResolutionXM, terrain.metadata.ResolutionYM = geographicResolutionMeters(terrain.metadata)
	return terrain, nil
}

func hgtDimensions(size int64) (int, int, float64, error) {
	const sampleBytes = int64(2)
	for _, dimension := range []int{3601, 1201} {
		if size == int64(dimension)*int64(dimension)*sampleBytes {
			return dimension, dimension, 1 / float64(dimension-1), nil
		}
	}
	return 0, 0, 0, fmt.Errorf("unsupported HGT size %d bytes; expected 3601x3601 or 1201x1201 signed int16 postings", size)
}

func (terrain *hgtTerrain) Metadata() TerrainMetadata {
	if terrain == nil {
		return TerrainMetadata{Available: false, Status: TerrainStatusUnavailable, Kind: TerrainKindDEMUnspecified, VerticalDatumKind: VerticalDatumUnknown}
	}
	return terrain.metadata
}

func (terrain *hgtTerrain) Elevation(point Point) (float64, bool) {
	return terrain.Sample(point, TerrainInterpolationBilinear)
}

func (terrain *hgtTerrain) Sample(point Point, interpolation string) (float64, bool) {
	if terrain == nil {
		return 0, false
	}
	column := (point.Lon - terrain.west) / terrain.resolution
	row := (terrain.north - point.Lat) / terrain.resolution
	const epsilon = 1e-9
	if column < -epsilon || row < -epsilon || column > float64(terrain.width-1)+epsilon || row > float64(terrain.height-1)+epsilon {
		return 0, false
	}
	column = math.Max(0, math.Min(float64(terrain.width-1), column))
	row = math.Max(0, math.Min(float64(terrain.height-1), row))
	if normalizeInterpolation(interpolation) == TerrainInterpolationNearest {
		return terrain.pixel(int(math.Round(column)), int(math.Round(row)))
	}
	left, top := int(math.Floor(column)), int(math.Floor(row))
	right, bottom := min(left+1, terrain.width-1), min(top+1, terrain.height-1)
	values := [4]float64{}
	positions := [4][2]int{{left, top}, {right, top}, {left, bottom}, {right, bottom}}
	for index, position := range positions {
		value, ok := terrain.pixel(position[0], position[1])
		if !ok {
			return 0, false
		}
		values[index] = value
	}
	x, y := column-float64(left), row-float64(top)
	topValue := values[0]*(1-x) + values[1]*x
	bottomValue := values[2]*(1-x) + values[3]*x
	return topValue*(1-y) + bottomValue*y, true
}

func (terrain *hgtTerrain) pixel(column, row int) (float64, bool) {
	if column < 0 || column >= terrain.width || row < 0 || row >= terrain.height {
		return 0, false
	}
	terrain.fileMu.mu.RLock()
	defer terrain.fileMu.mu.RUnlock()
	if terrain.file == nil {
		return 0, false
	}
	data := make([]byte, 2)
	offset := int64(row*terrain.width+column) * 2
	if _, err := terrain.file.ReadAt(data, offset); err != nil {
		return 0, false
	}
	value := float64(int16(binary.BigEndian.Uint16(data)))
	if terrain.nodata != nil && value == *terrain.nodata {
		return 0, false
	}
	return value, true
}

func (terrain *hgtTerrain) Close() error {
	if terrain == nil {
		return nil
	}
	terrain.fileMu.mu.Lock()
	defer terrain.fileMu.mu.Unlock()
	if terrain.file == nil {
		return nil
	}
	file := terrain.file
	terrain.file = nil
	return file.Close()
}
