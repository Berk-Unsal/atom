package raytracer

import (
	"context"
	"fmt"
	"math"
	"sort"
)

const (
	DefaultSurfaceCellSizeMeters = 25.0
	MinSurfaceCellSizeMeters     = 10.0
	MaxSurfaceCellSizeMeters     = 250.0
	MaxSurfaceCells              = 100_000
	MaxSurfaceThresholds         = 10
	SurfaceNoDataValue           = -9999.0
)

type CoverageSurfaceRequestInput struct {
	StaticSimulationRequestInput
	CellSizeMeters *float64  `json:"cell_size_m"`
	ThresholdsDBm  []float64 `json:"thresholds_dbm"`
}

type CoverageSurfaceRequest struct {
	Simulation     StaticSimulationRequest
	CellSizeMeters float64
	ThresholdsDBm  []float64
}

type CoverageSurfaceResponse struct {
	Grid     CoverageRasterGrid       `json:"grid"`
	Contours SurfaceFeatureCollection `json:"contours"`
	Stats    CoverageSurfaceStats     `json:"stats"`
	Model    CoverageSurfaceModel     `json:"model"`
}

type CoverageRasterGrid struct {
	CRS            string    `json:"crs"`
	Bounds         []float64 `json:"bounds"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	CellSizeMeters float64   `json:"cell_size_m"`
	NoDataValue    float64   `json:"nodata"`
	RowOrder       string    `json:"row_order"`
	Values         []float64 `json:"values"`
}

type CoverageSurfaceStats struct {
	CellCount      int       `json:"cell_count"`
	ValidCellCount int       `json:"valid_cell_count"`
	MinimumDBm     *float64  `json:"min_dbm"`
	MaximumDBm     *float64  `json:"max_dbm"`
	ThresholdsDBm  []float64 `json:"thresholds_dbm"`
}

type CoverageSurfaceModel struct {
	Type        string   `json:"type"`
	Assumptions []string `json:"assumptions"`
}

type SurfaceFeatureCollection struct {
	Type     string           `json:"type"`
	Features []SurfaceFeature `json:"features"`
}

type SurfaceFeature struct {
	Type       string                   `json:"type"`
	Properties SurfaceFeatureProperties `json:"properties"`
	Geometry   LineGeometry             `json:"geometry"`
}

type SurfaceFeatureProperties struct {
	ThresholdDBm float64 `json:"threshold_dbm"`
	Class        string  `json:"class"`
}

func (input CoverageSurfaceRequestInput) ToRequest() CoverageSurfaceRequest {
	thresholds := append([]float64(nil), input.ThresholdsDBm...)
	if len(thresholds) == 0 {
		thresholds = []float64{-110, -100, -90, -80}
	}
	return CoverageSurfaceRequest{
		Simulation:     input.StaticSimulationRequestInput.ToRequest(),
		CellSizeMeters: valueOr(input.CellSizeMeters, DefaultSurfaceCellSizeMeters),
		ThresholdsDBm:  thresholds,
	}
}

func ValidateCoverageSurfaceRequest(req CoverageSurfaceRequest) string {
	if req.CellSizeMeters < MinSurfaceCellSizeMeters || req.CellSizeMeters > MaxSurfaceCellSizeMeters || math.IsNaN(req.CellSizeMeters) || math.IsInf(req.CellSizeMeters, 0) {
		return "cell_size_m must be between 10 and 250"
	}
	if len(req.ThresholdsDBm) == 0 || len(req.ThresholdsDBm) > MaxSurfaceThresholds {
		return "thresholds_dbm must contain between 1 and 10 values"
	}
	seen := make(map[float64]struct{}, len(req.ThresholdsDBm))
	for _, threshold := range req.ThresholdsDBm {
		if threshold < -180 || threshold > 0 || math.IsNaN(threshold) || math.IsInf(threshold, 0) {
			return "thresholds_dbm values must be finite and between -180 and 0"
		}
		if _, exists := seen[threshold]; exists {
			return "thresholds_dbm values must be unique"
		}
		seen[threshold] = struct{}{}
	}
	width := int(math.Ceil((2*req.Simulation.RadiusMeters)/req.CellSizeMeters)) + 1
	if width <= 0 || width > MaxSurfaceCells || width*width > MaxSurfaceCells {
		return fmt.Sprintf("surface grid exceeds the %d-cell limit; increase cell_size_m or reduce radius_m", MaxSurfaceCells)
	}
	return ""
}

func GenerateCoverageSurfaceContext(ctx context.Context, req CoverageSurfaceRequest, buildings *BuildingIndex) (CoverageSurfaceResponse, error) {
	NormalizeStaticSimulationRequest(&req.Simulation)
	profile := req.Simulation.RFProfile
	if profile.SchemaVersion == 0 {
		profile = DefaultCellRFProfile(NetworkTechnologyForFrequency(req.Simulation.FrequencyGHz), req.Simulation.FrequencyGHz, req.Simulation.TxPowerDBm, req.Simulation.RadiusMeters, req.Simulation.BeamWidthDeg, 0, 0, 0)
	}
	radiusMeters := profile.RadiusMeters
	width := int(math.Ceil((2*radiusMeters)/req.CellSizeMeters)) + 1
	height := width
	effectiveCellSizeMeters := 2 * radiusMeters / float64(width-1)
	origin := Point{Lon: req.Simulation.TowerLon, Lat: req.Simulation.TowerLat}
	latScale := 1.0 / 111_320.0
	lonScale := 1.0 / (111_320.0 * math.Max(1e-9, math.Cos(origin.Lat*math.Pi/180)))
	values := make([]float64, width*height)
	for index := range values {
		values[index] = SurfaceNoDataValue
	}
	minimum, maximum := math.Inf(1), math.Inf(-1)
	validCount := 0
	for row := 0; row < height; row++ {
		y := -radiusMeters + float64(row)*effectiveCellSizeMeters
		for column := 0; column < width; column++ {
			if err := ctx.Err(); err != nil {
				return CoverageSurfaceResponse{}, err
			}
			x := -radiusMeters + float64(column)*effectiveCellSizeMeters
			distanceMeters := math.Hypot(x, y)
			if distanceMeters > radiusMeters {
				continue
			}
			point := Point{Lon: origin.Lon + x*lonScale, Lat: origin.Lat + y*latScale}
			bearing := BearingDegrees(origin, point)
			effectiveAzimuth := profile.EffectiveAzimuth(req.Simulation.AzimuthDeg)
			if profile.HorizontalPatternID != "omni" && !AngleInBeam(bearing, effectiveAzimuth, profile.BeamWidthDeg) {
				continue
			}
			intersections, _, err := wallIntersectionsForSegmentContext(ctx, origin, origin, point, buildings)
			if err != nil {
				return CoverageSurfaceResponse{}, err
			}
			wallLoss := float64(len(intersections)) * PenetrationLossForFrequencyGHz(profile.FrequencyGHz)
			signal := profile.ReceivedPowerDBm(math.Max(distanceMeters, 1), wallLoss, req.Simulation.CalibrationOffsetDB, smallestAngleDifference(bearing, effectiveAzimuth))
			signal = roundOne(signal)
			values[row*width+column] = signal
			minimum, maximum = math.Min(minimum, signal), math.Max(maximum, signal)
			validCount++
		}
	}
	thresholds := append([]float64(nil), req.ThresholdsDBm...)
	sort.Float64s(thresholds)
	bounds := []float64{origin.Lon - radiusMeters*lonScale, origin.Lat - radiusMeters*latScale, origin.Lon + radiusMeters*lonScale, origin.Lat + radiusMeters*latScale}
	grid := CoverageRasterGrid{
		CRS: "OGC:CRS84", Bounds: bounds, Width: width, Height: height, CellSizeMeters: round2(effectiveCellSizeMeters),
		NoDataValue: SurfaceNoDataValue, RowOrder: "south-to-north", Values: values,
	}
	stats := CoverageSurfaceStats{CellCount: len(values), ValidCellCount: validCount, ThresholdsDBm: thresholds}
	if validCount > 0 {
		stats.MinimumDBm, stats.MaximumDBm = floatPointer(roundOne(minimum)), floatPointer(roundOne(maximum))
	}
	return CoverageSurfaceResponse{
		Grid: grid, Contours: surfaceContours(grid, thresholds), Stats: stats,
		Model: CoverageSurfaceModel{Type: "regular_grid_fspl_walls", Assumptions: []string{
			"Grid centers are evaluated with the selected cell profile, antenna horizontal pattern, calibration offset, and material-agnostic frequency wall loss.",
			"Contours use marching-square line segments over valid grid cells; no smoothing or kriging is applied.",
			"The regular surface does not yet apply the point-to-point terrain-profile or environmental sensitivity components.",
		}},
	}, nil
}

func surfaceContours(grid CoverageRasterGrid, thresholds []float64) SurfaceFeatureCollection {
	features := make([]SurfaceFeature, 0)
	for _, threshold := range thresholds {
		for row := 0; row < grid.Height-1; row++ {
			for column := 0; column < grid.Width-1; column++ {
				indices := []int{row*grid.Width + column, row*grid.Width + column + 1, (row+1)*grid.Width + column + 1, (row+1)*grid.Width + column}
				cellValues := []float64{grid.Values[indices[0]], grid.Values[indices[1]], grid.Values[indices[2]], grid.Values[indices[3]]}
				if containsNoData(cellValues, grid.NoDataValue) {
					continue
				}
				points := contourCrossings(grid, row, column, cellValues, threshold)
				for index := 0; index+1 < len(points); index += 2 {
					features = append(features, SurfaceFeature{
						Type: "Feature", Properties: SurfaceFeatureProperties{ThresholdDBm: threshold, Class: surfaceThresholdClass(threshold)},
						Geometry: LineGeometry{Type: "LineString", Coordinates: [][]float64{points[index], points[index+1]}},
					})
				}
			}
		}
	}
	if features == nil {
		features = []SurfaceFeature{}
	}
	return SurfaceFeatureCollection{Type: "FeatureCollection", Features: features}
}

func contourCrossings(grid CoverageRasterGrid, row, column int, values []float64, threshold float64) [][]float64 {
	positions := [][2]float64{{float64(column), float64(row)}, {float64(column + 1), float64(row)}, {float64(column + 1), float64(row + 1)}, {float64(column), float64(row + 1)}}
	points := make([][]float64, 0, 4)
	for edge := 0; edge < 4; edge++ {
		next := (edge + 1) % 4
		left, right := values[edge], values[next]
		if (left < threshold && right >= threshold) || (left >= threshold && right < threshold) {
			fraction := (threshold - left) / (right - left)
			columnPosition := positions[edge][0] + fraction*(positions[next][0]-positions[edge][0])
			rowPosition := positions[edge][1] + fraction*(positions[next][1]-positions[edge][1])
			points = append(points, gridCoordinate(grid, columnPosition, rowPosition))
		}
	}
	if len(points) == 4 {
		center := (values[0] + values[1] + values[2] + values[3]) / 4
		if center >= threshold {
			return [][]float64{points[0], points[3], points[1], points[2]}
		}
	}
	return points
}

func gridCoordinate(grid CoverageRasterGrid, column, row float64) []float64 {
	lon := grid.Bounds[0] + column/float64(grid.Width-1)*(grid.Bounds[2]-grid.Bounds[0])
	lat := grid.Bounds[1] + row/float64(grid.Height-1)*(grid.Bounds[3]-grid.Bounds[1])
	return []float64{lon, lat}
}

func containsNoData(values []float64, noData float64) bool {
	for _, value := range values {
		if value == noData {
			return true
		}
	}
	return false
}

func surfaceThresholdClass(threshold float64) string {
	switch {
	case threshold >= -80:
		return "strong"
	case threshold >= -95:
		return "usable"
	case threshold >= -110:
		return "marginal"
	default:
		return "weak"
	}
}
