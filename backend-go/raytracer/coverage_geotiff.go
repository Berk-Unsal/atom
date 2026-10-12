package raytracer

import (
	"bytes"
	"encoding/binary"
	"errors"
	"math"
	"strconv"
)

type tiffOutputEntry struct {
	tag       uint16
	valueType uint16
	count     uint32
	value     uint32
}

func EncodeCoverageGeoTIFF(grid CoverageRasterGrid) ([]byte, error) {
	if grid.Width < 2 || grid.Height < 2 || len(grid.Bounds) != 4 || len(grid.Values) != grid.Width*grid.Height {
		return nil, errors.New("coverage grid is not a valid raster")
	}
	const entryCount = 15
	ifdOffset := uint32(8)
	extraOffset := ifdOffset + 2 + entryCount*12 + 4
	pixelScaleOffset := extraOffset
	tiepointOffset := pixelScaleOffset + 3*8
	geoKeyOffset := tiepointOffset + 6*8
	geoKeyValues := []uint16{
		1, 1, 0, 3,
		1024, 0, 1, 2,
		1025, 0, 1, 2,
		2048, 0, 1, 4326,
	}
	nodata := append([]byte(strconv.FormatFloat(grid.NoDataValue, 'f', -1, 64)), 0)
	nodataOffset := geoKeyOffset + uint32(len(geoKeyValues)*2)
	pixelOffset := nodataOffset + uint32(len(nodata))
	if pixelOffset%4 != 0 {
		pixelOffset += 4 - pixelOffset%4
	}
	pixelBytes := uint32(grid.Width * grid.Height * 4)
	entries := []tiffOutputEntry{
		{256, 4, 1, uint32(grid.Width)},
		{257, 4, 1, uint32(grid.Height)},
		{258, 3, 1, 32},
		{259, 3, 1, 1},
		{262, 3, 1, 1},
		{273, 4, 1, pixelOffset},
		{277, 3, 1, 1},
		{278, 4, 1, uint32(grid.Height)},
		{279, 4, 1, pixelBytes},
		{284, 3, 1, 1},
		{339, 3, 1, 3},
		{33550, 12, 3, pixelScaleOffset},
		{33922, 12, 6, tiepointOffset},
		{34735, 3, uint32(len(geoKeyValues)), geoKeyOffset},
		{42113, 2, uint32(len(nodata)), nodataOffset},
	}
	buffer := bytes.NewBuffer(make([]byte, 0, int(pixelOffset+pixelBytes)))
	buffer.WriteString("II")
	_ = binary.Write(buffer, binary.LittleEndian, uint16(42))
	_ = binary.Write(buffer, binary.LittleEndian, ifdOffset)
	_ = binary.Write(buffer, binary.LittleEndian, uint16(len(entries)))
	for _, entry := range entries {
		_ = binary.Write(buffer, binary.LittleEndian, entry.tag)
		_ = binary.Write(buffer, binary.LittleEndian, entry.valueType)
		_ = binary.Write(buffer, binary.LittleEndian, entry.count)
		_ = binary.Write(buffer, binary.LittleEndian, entry.value)
	}
	_ = binary.Write(buffer, binary.LittleEndian, uint32(0))
	resolutionX := (grid.Bounds[2] - grid.Bounds[0]) / float64(grid.Width-1)
	resolutionY := (grid.Bounds[3] - grid.Bounds[1]) / float64(grid.Height-1)
	for _, value := range []float64{resolutionX, resolutionY, 0} {
		_ = binary.Write(buffer, binary.LittleEndian, value)
	}
	for _, value := range []float64{0, 0, 0, grid.Bounds[0], grid.Bounds[3], 0} {
		_ = binary.Write(buffer, binary.LittleEndian, value)
	}
	for _, value := range geoKeyValues {
		_ = binary.Write(buffer, binary.LittleEndian, value)
	}
	buffer.Write(nodata)
	for buffer.Len() < int(pixelOffset) {
		buffer.WriteByte(0)
	}
	for row := grid.Height - 1; row >= 0; row-- {
		for column := 0; column < grid.Width; column++ {
			value := float32(grid.Values[row*grid.Width+column])
			_ = binary.Write(buffer, binary.LittleEndian, math.Float32bits(value))
		}
	}
	return buffer.Bytes(), nil
}
