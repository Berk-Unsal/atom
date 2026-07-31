package raytracer

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

const (
	MaxTerrainMetadataBytes = 64 << 20
	maxTerrainBlockBytes    = 128 << 20
	terrainBlockCacheSize   = 32
)

type TerrainMetadata struct {
	Available      bool      `json:"available"`
	Source         string    `json:"source,omitempty"`
	Format         string    `json:"format,omitempty"`
	CRS            string    `json:"crs,omitempty"`
	Width          int       `json:"width,omitempty"`
	Height         int       `json:"height,omitempty"`
	Bounds         []float64 `json:"bounds,omitempty"`
	ResolutionXDeg float64   `json:"resolution_x_deg,omitempty"`
	ResolutionYDeg float64   `json:"resolution_y_deg,omitempty"`
	NoData         *float64  `json:"nodata,omitempty"`
	Limitations    []string  `json:"limitations,omitempty"`
}

type TerrainModel interface {
	Elevation(Point) (float64, bool)
	Metadata() TerrainMetadata
}

type tiffEntry struct {
	tag         uint16
	valueType   uint16
	count       uint32
	valueOffset uint32
	inline      [4]byte
}

type geoTIFFTerrain struct {
	file            *os.File
	order           binary.ByteOrder
	width           int
	height          int
	bitsPerSample   int
	sampleFormat    int
	compression     int
	predictor       int
	pixelBytes      int
	tileWidth       int
	tileHeight      int
	rowsPerStrip    int
	blockOffsets    []uint64
	blockByteCounts []uint64
	originX         float64
	originY         float64
	scaleX          float64
	scaleY          float64
	pixelIsPoint    bool
	nodata          *float64
	metadata        TerrainMetadata
	cacheMu         sync.Mutex
	cache           map[int][]byte
	cacheOrder      []int
}

func LoadGeoTIFFTerrain(path, declaredCRS string) (TerrainModel, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	fail := func(cause error) (TerrainModel, error) {
		file.Close()
		return nil, cause
	}
	header := make([]byte, 8)
	if _, err := io.ReadFull(file, header); err != nil {
		return fail(fmt.Errorf("read GeoTIFF header: %w", err))
	}
	var order binary.ByteOrder
	switch string(header[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return fail(errors.New("GeoTIFF byte order is invalid"))
	}
	if order.Uint16(header[2:4]) != 42 {
		return fail(errors.New("only classic TIFF/COG terrain files are supported"))
	}
	entries, err := readTIFFEntries(file, order, uint64(order.Uint32(header[4:8])))
	if err != nil {
		return fail(err)
	}
	if _, exists := entries[34264]; exists {
		return fail(errors.New("rotated GeoTIFF model transformations are not supported; provide a north-up EPSG:4326 COG"))
	}
	width, err := requiredTIFFInt(file, order, entries, 256, "ImageWidth")
	if err != nil {
		return fail(err)
	}
	height, err := requiredTIFFInt(file, order, entries, 257, "ImageLength")
	if err != nil {
		return fail(err)
	}
	if width <= 0 || height <= 0 {
		return fail(errors.New("GeoTIFF dimensions must be positive"))
	}
	bits := optionalTIFFInt(file, order, entries, 258, 8)
	samplesPerPixel := optionalTIFFInt(file, order, entries, 277, 1)
	if samplesPerPixel != 1 {
		return fail(errors.New("terrain GeoTIFF must contain exactly one sample per pixel"))
	}
	sampleFormat := optionalTIFFInt(file, order, entries, 339, 1)
	if !supportedTerrainSample(bits, sampleFormat) {
		return fail(fmt.Errorf("unsupported GeoTIFF terrain sample: %d-bit format %d", bits, sampleFormat))
	}
	compression := optionalTIFFInt(file, order, entries, 259, 1)
	if compression != 1 && compression != 8 && compression != 32946 {
		return fail(fmt.Errorf("unsupported GeoTIFF compression %d; use none or DEFLATE", compression))
	}
	predictor := optionalTIFFInt(file, order, entries, 317, 1)
	if predictor != 1 && predictor != 2 {
		return fail(fmt.Errorf("unsupported GeoTIFF predictor %d; floating-point predictor 3 must be converted", predictor))
	}
	if predictor == 2 && sampleFormat == 3 {
		return fail(errors.New("horizontal differencing is only supported for integer terrain samples"))
	}
	scales, err := requiredTIFFFloats(file, order, entries, 33550, "ModelPixelScaleTag")
	if err != nil || len(scales) < 2 || scales[0] <= 0 || scales[1] <= 0 {
		return fail(errors.New("GeoTIFF requires positive ModelPixelScaleTag values"))
	}
	tiepoints, err := requiredTIFFFloats(file, order, entries, 33922, "ModelTiepointTag")
	if err != nil || len(tiepoints) < 6 {
		return fail(errors.New("GeoTIFF requires a ModelTiepointTag"))
	}
	crs, pixelIsPoint, err := geoTIFFCRS(file, order, entries, declaredCRS)
	if err != nil {
		return fail(err)
	}
	originX := tiepoints[3] - tiepoints[0]*scales[0]
	originY := tiepoints[4] + tiepoints[1]*scales[1]
	terrain := &geoTIFFTerrain{
		file:          file,
		order:         order,
		width:         width,
		height:        height,
		bitsPerSample: bits,
		sampleFormat:  sampleFormat,
		compression:   compression,
		predictor:     predictor,
		pixelBytes:    bits / 8,
		originX:       originX,
		originY:       originY,
		scaleX:        scales[0],
		scaleY:        scales[1],
		pixelIsPoint:  pixelIsPoint,
		cache:         make(map[int][]byte),
	}
	if nodataEntry, exists := entries[42113]; exists {
		if text, textErr := tiffASCII(file, order, nodataEntry); textErr == nil {
			if value, parseErr := strconv.ParseFloat(strings.TrimSpace(strings.TrimRight(text, "\x00")), 64); parseErr == nil {
				terrain.nodata = &value
			}
		}
	}
	if tileOffsets, exists := entries[324]; exists {
		terrain.tileWidth = optionalTIFFInt(file, order, entries, 322, 0)
		terrain.tileHeight = optionalTIFFInt(file, order, entries, 323, 0)
		if terrain.tileWidth <= 0 || terrain.tileHeight <= 0 {
			return fail(errors.New("tiled GeoTIFF requires TileWidth and TileLength"))
		}
		terrain.blockOffsets, err = tiffUnsignedValues(file, order, tileOffsets)
		if err != nil {
			return fail(err)
		}
		counts, exists := entries[325]
		if !exists {
			return fail(errors.New("tiled GeoTIFF requires TileByteCounts"))
		}
		terrain.blockByteCounts, err = tiffUnsignedValues(file, order, counts)
	} else {
		offsets, exists := entries[273]
		if !exists {
			return fail(errors.New("GeoTIFF requires tile or strip offsets"))
		}
		terrain.rowsPerStrip = optionalTIFFInt(file, order, entries, 278, height)
		terrain.blockOffsets, err = tiffUnsignedValues(file, order, offsets)
		if err != nil {
			return fail(err)
		}
		counts, exists := entries[279]
		if !exists {
			return fail(errors.New("strip GeoTIFF requires StripByteCounts"))
		}
		terrain.blockByteCounts, err = tiffUnsignedValues(file, order, counts)
	}
	if err != nil {
		return fail(err)
	}
	if len(terrain.blockOffsets) == 0 || len(terrain.blockOffsets) != len(terrain.blockByteCounts) {
		return fail(errors.New("GeoTIFF block offsets and byte counts are inconsistent"))
	}
	limitations := []string{"north-up EPSG:4326 rasters only", "single-band integer or IEEE floating-point samples", "none/DEFLATE compression; predictor 1 or integer predictor 2"}
	terrain.metadata = TerrainMetadata{
		Available: true, Source: filepath.Base(path), Format: "cog-geotiff", CRS: crs,
		Width: width, Height: height,
		Bounds:         []float64{originX, originY - float64(height)*scales[1], originX + float64(width)*scales[0], originY},
		ResolutionXDeg: scales[0], ResolutionYDeg: scales[1], NoData: terrain.nodata, Limitations: limitations,
	}
	return terrain, nil
}

func (terrain *geoTIFFTerrain) Metadata() TerrainMetadata { return terrain.metadata }

func (terrain *geoTIFFTerrain) Elevation(point Point) (float64, bool) {
	column := (point.Lon - terrain.originX) / terrain.scaleX
	row := (terrain.originY - point.Lat) / terrain.scaleY
	if !terrain.pixelIsPoint {
		column -= 0.5
		row -= 0.5
	}
	if column < 0 || row < 0 || column > float64(terrain.width-1) || row > float64(terrain.height-1) {
		return 0, false
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

func (terrain *geoTIFFTerrain) pixel(column, row int) (float64, bool) {
	blockIndex, localColumn, localRow, blockWidth, blockHeight := terrain.blockLocation(column, row)
	block, err := terrain.block(blockIndex, blockWidth, blockHeight)
	if err != nil {
		return 0, false
	}
	offset := (localRow*blockWidth + localColumn) * terrain.pixelBytes
	if offset < 0 || offset+terrain.pixelBytes > len(block) {
		return 0, false
	}
	value := terrain.decodeSample(block[offset : offset+terrain.pixelBytes])
	if math.IsNaN(value) || math.IsInf(value, 0) || terrain.nodata != nil && value == *terrain.nodata {
		return 0, false
	}
	return value, true
}

func (terrain *geoTIFFTerrain) blockLocation(column, row int) (index, localColumn, localRow, width, height int) {
	if terrain.tileWidth > 0 {
		tilesAcross := (terrain.width + terrain.tileWidth - 1) / terrain.tileWidth
		tileX, tileY := column/terrain.tileWidth, row/terrain.tileHeight
		return tileY*tilesAcross + tileX, column % terrain.tileWidth, row % terrain.tileHeight, terrain.tileWidth, terrain.tileHeight
	}
	strip := row / terrain.rowsPerStrip
	rows := min(terrain.rowsPerStrip, terrain.height-strip*terrain.rowsPerStrip)
	return strip, column, row % terrain.rowsPerStrip, terrain.width, rows
}

func (terrain *geoTIFFTerrain) block(index, width, height int) ([]byte, error) {
	terrain.cacheMu.Lock()
	defer terrain.cacheMu.Unlock()
	if cached, exists := terrain.cache[index]; exists {
		return cached, nil
	}
	if index < 0 || index >= len(terrain.blockOffsets) {
		return nil, errors.New("GeoTIFF block index is out of range")
	}
	compressedSize := terrain.blockByteCounts[index]
	if compressedSize == 0 || compressedSize > maxTerrainBlockBytes {
		return nil, errors.New("GeoTIFF block byte count is invalid")
	}
	compressed := make([]byte, int(compressedSize))
	if _, err := terrain.file.ReadAt(compressed, int64(terrain.blockOffsets[index])); err != nil {
		return nil, err
	}
	expected := width * height * terrain.pixelBytes
	if expected <= 0 || expected > maxTerrainBlockBytes {
		return nil, errors.New("GeoTIFF decoded block size is invalid")
	}
	decoded := compressed
	if terrain.compression == 8 || terrain.compression == 32946 {
		reader, err := zlib.NewReader(bytes.NewReader(compressed))
		if err != nil {
			return nil, err
		}
		decoded, err = io.ReadAll(io.LimitReader(reader, int64(expected)+1))
		reader.Close()
		if err != nil {
			return nil, err
		}
	}
	if len(decoded) < expected {
		return nil, errors.New("GeoTIFF block is shorter than its decoded dimensions")
	}
	decoded = decoded[:expected]
	if terrain.predictor == 2 {
		undoHorizontalPredictor(decoded, width, height, terrain.pixelBytes, terrain.order)
	}
	if len(terrain.cacheOrder) >= terrainBlockCacheSize {
		delete(terrain.cache, terrain.cacheOrder[0])
		terrain.cacheOrder = terrain.cacheOrder[1:]
	}
	terrain.cache[index] = decoded
	terrain.cacheOrder = append(terrain.cacheOrder, index)
	return decoded, nil
}

func (terrain *geoTIFFTerrain) decodeSample(data []byte) float64 {
	switch terrain.sampleFormat {
	case 2:
		switch terrain.bitsPerSample {
		case 8:
			return float64(int8(data[0]))
		case 16:
			return float64(int16(terrain.order.Uint16(data)))
		case 32:
			return float64(int32(terrain.order.Uint32(data)))
		}
	case 3:
		if terrain.bitsPerSample == 32 {
			return float64(math.Float32frombits(terrain.order.Uint32(data)))
		}
		return math.Float64frombits(terrain.order.Uint64(data))
	default:
		switch terrain.bitsPerSample {
		case 8:
			return float64(data[0])
		case 16:
			return float64(terrain.order.Uint16(data))
		case 32:
			return float64(terrain.order.Uint32(data))
		}
	}
	return math.NaN()
}

func readTIFFEntries(reader io.ReaderAt, order binary.ByteOrder, offset uint64) (map[uint16]tiffEntry, error) {
	countBytes := make([]byte, 2)
	if _, err := reader.ReadAt(countBytes, int64(offset)); err != nil {
		return nil, err
	}
	count := int(order.Uint16(countBytes))
	if count <= 0 || count > 4096 {
		return nil, errors.New("GeoTIFF IFD entry count is invalid")
	}
	data := make([]byte, count*12)
	if _, err := reader.ReadAt(data, int64(offset)+2); err != nil {
		return nil, err
	}
	entries := make(map[uint16]tiffEntry, count)
	for index := 0; index < count; index++ {
		value := data[index*12 : (index+1)*12]
		entry := tiffEntry{tag: order.Uint16(value[0:2]), valueType: order.Uint16(value[2:4]), count: order.Uint32(value[4:8]), valueOffset: order.Uint32(value[8:12])}
		copy(entry.inline[:], value[8:12])
		entries[entry.tag] = entry
	}
	return entries, nil
}

func tiffData(reader io.ReaderAt, entry tiffEntry) ([]byte, error) {
	sizes := map[uint16]uint64{1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8}
	size, exists := sizes[entry.valueType]
	if !exists || entry.count == 0 || uint64(entry.count) > MaxTerrainMetadataBytes/size {
		return nil, errors.New("GeoTIFF tag value is invalid or unsupported")
	}
	length := size * uint64(entry.count)
	if length <= 4 {
		return append([]byte(nil), entry.inline[:length]...), nil
	}
	data := make([]byte, int(length))
	_, err := reader.ReadAt(data, int64(entry.valueOffset))
	return data, err
}

func tiffUnsignedValues(reader io.ReaderAt, order binary.ByteOrder, entry tiffEntry) ([]uint64, error) {
	data, err := tiffData(reader, entry)
	if err != nil {
		return nil, err
	}
	values := make([]uint64, entry.count)
	for index := range values {
		switch entry.valueType {
		case 1:
			values[index] = uint64(data[index])
		case 3:
			values[index] = uint64(order.Uint16(data[index*2:]))
		case 4:
			values[index] = uint64(order.Uint32(data[index*4:]))
		default:
			return nil, errors.New("GeoTIFF integer tag type is unsupported")
		}
	}
	return values, nil
}

func tiffFloatValues(reader io.ReaderAt, order binary.ByteOrder, entry tiffEntry) ([]float64, error) {
	data, err := tiffData(reader, entry)
	if err != nil {
		return nil, err
	}
	values := make([]float64, entry.count)
	for index := range values {
		switch entry.valueType {
		case 11:
			values[index] = float64(math.Float32frombits(order.Uint32(data[index*4:])))
		case 12:
			values[index] = math.Float64frombits(order.Uint64(data[index*8:]))
		case 5:
			numerator := order.Uint32(data[index*8:])
			denominator := order.Uint32(data[index*8+4:])
			if denominator == 0 {
				return nil, errors.New("GeoTIFF rational denominator is zero")
			}
			values[index] = float64(numerator) / float64(denominator)
		default:
			return nil, errors.New("GeoTIFF floating-point tag type is unsupported")
		}
	}
	return values, nil
}

func tiffASCII(reader io.ReaderAt, _ binary.ByteOrder, entry tiffEntry) (string, error) {
	if entry.valueType != 2 {
		return "", errors.New("GeoTIFF ASCII tag has the wrong type")
	}
	data, err := tiffData(reader, entry)
	return string(data), err
}

func requiredTIFFInt(reader io.ReaderAt, order binary.ByteOrder, entries map[uint16]tiffEntry, tag uint16, label string) (int, error) {
	entry, exists := entries[tag]
	if !exists {
		return 0, fmt.Errorf("GeoTIFF requires %s", label)
	}
	values, err := tiffUnsignedValues(reader, order, entry)
	if err != nil || len(values) == 0 || values[0] > math.MaxInt {
		return 0, fmt.Errorf("GeoTIFF %s is invalid", label)
	}
	return int(values[0]), nil
}

func optionalTIFFInt(reader io.ReaderAt, order binary.ByteOrder, entries map[uint16]tiffEntry, tag uint16, fallback int) int {
	entry, exists := entries[tag]
	if !exists {
		return fallback
	}
	values, err := tiffUnsignedValues(reader, order, entry)
	if err != nil || len(values) == 0 || values[0] > math.MaxInt {
		return fallback
	}
	return int(values[0])
}

func requiredTIFFFloats(reader io.ReaderAt, order binary.ByteOrder, entries map[uint16]tiffEntry, tag uint16, label string) ([]float64, error) {
	entry, exists := entries[tag]
	if !exists {
		return nil, fmt.Errorf("GeoTIFF requires %s", label)
	}
	return tiffFloatValues(reader, order, entry)
}

func geoTIFFCRS(reader io.ReaderAt, order binary.ByteOrder, entries map[uint16]tiffEntry, declaredCRS string) (string, bool, error) {
	crsCode := 0
	pixelIsPoint := false
	if directory, exists := entries[34735]; exists {
		values, err := tiffUnsignedValues(reader, order, directory)
		if err != nil || len(values) < 4 {
			return "", false, errors.New("GeoTIFF GeoKeyDirectoryTag is invalid")
		}
		keyCount := int(values[3])
		if len(values) < 4+keyCount*4 {
			return "", false, errors.New("GeoTIFF GeoKeyDirectoryTag is truncated")
		}
		for index := 0; index < keyCount; index++ {
			key := values[4+index*4 : 8+index*4]
			if key[1] != 0 || key[2] != 1 {
				continue
			}
			switch key[0] {
			case 1025:
				pixelIsPoint = key[3] == 2
			case 2048, 3072:
				crsCode = int(key[3])
			}
		}
	}
	declared := strings.ToUpper(strings.TrimSpace(declaredCRS))
	if crsCode != 0 && crsCode != 4326 {
		return "", false, fmt.Errorf("GeoTIFF EPSG:%d is unsupported; convert terrain to EPSG:4326", crsCode)
	}
	if crsCode == 0 && declared != "EPSG:4326" {
		return "", false, errors.New("terrain layer CRS must be EPSG:4326 when GeoTIFF geokeys are absent")
	}
	return "EPSG:4326", pixelIsPoint, nil
}

func supportedTerrainSample(bits, sampleFormat int) bool {
	if sampleFormat == 3 {
		return bits == 32 || bits == 64
	}
	return (sampleFormat == 1 || sampleFormat == 2) && (bits == 8 || bits == 16 || bits == 32)
}

func undoHorizontalPredictor(data []byte, width, height, bytesPerSample int, order binary.ByteOrder) {
	rowBytes := width * bytesPerSample
	for row := 0; row < height; row++ {
		base := row * rowBytes
		for column := 1; column < width; column++ {
			current := base + column*bytesPerSample
			previous := current - bytesPerSample
			switch bytesPerSample {
			case 1:
				data[current] += data[previous]
			case 2:
				order.PutUint16(data[current:], order.Uint16(data[current:])+order.Uint16(data[previous:]))
			case 4:
				order.PutUint32(data[current:], order.Uint32(data[current:])+order.Uint32(data[previous:]))
			}
		}
	}
}
