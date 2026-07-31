package main

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func registerCoverageSurfaceRoute(router *gin.Engine, datasets *datasetRuntime) {
	router.POST("/api/coverage-surface", func(c *gin.Context) {
		var input raytracer.CoverageSurfaceRequestInput
		if !bindJSON(c, &input, "coverage surface") {
			return
		}
		if input.StaticSimulationRequestInput.MissingRequiredCoordinates() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tower_lon and tower_lat are required"})
			return
		}
		req := input.ToRequest()
		if validationError := validateSimulationRequest(req.Simulation); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		if validationError := raytracer.ValidateCoverageSurfaceRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		response, err := raytracer.GenerateCoverageSurfaceContext(c.Request.Context(), req, currentBuildingIndex(datasets))
		if err != nil {
			writeRFResponse(c, response, err)
			return
		}
		switch strings.ToLower(strings.TrimSpace(c.Query("f"))) {
		case "csv":
			writeCoverageSurfaceCSV(c, response.Grid)
		case "geojson":
			c.Header("Content-Type", "application/geo+json")
			c.JSON(http.StatusOK, response.Contours)
		case "geotiff", "tif", "tiff":
			payload, encodeErr := raytracer.EncodeCoverageGeoTIFF(response.Grid)
			if encodeErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "coverage raster export failed"})
				return
			}
			c.Header("Content-Type", "image/tiff")
			c.Header("Content-Disposition", `attachment; filename="coverage-surface.tif"`)
			c.Data(http.StatusOK, "image/tiff", payload)
		default:
			c.JSON(http.StatusOK, response)
		}
	})
}

func writeCoverageSurfaceCSV(c *gin.Context, grid raytracer.CoverageRasterGrid) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="coverage-surface.csv"`)
	c.Status(http.StatusOK)
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{"longitude", "latitude", "signal_dbm"})
	for row := 0; row < grid.Height; row++ {
		latitude := grid.Bounds[1] + float64(row)/float64(grid.Height-1)*(grid.Bounds[3]-grid.Bounds[1])
		for column := 0; column < grid.Width; column++ {
			value := grid.Values[row*grid.Width+column]
			if value == grid.NoDataValue {
				continue
			}
			longitude := grid.Bounds[0] + float64(column)/float64(grid.Width-1)*(grid.Bounds[2]-grid.Bounds[0])
			_ = writer.Write([]string{
				strconv.FormatFloat(longitude, 'f', 7, 64), strconv.FormatFloat(latitude, 'f', 7, 64), strconv.FormatFloat(value, 'f', 1, 64),
			})
		}
	}
	writer.Flush()
}
