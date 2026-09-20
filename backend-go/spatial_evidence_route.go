package main

import (
	"math"
	"net/http"
	"strings"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

type spatialEvidencePathInput struct {
	Transmitter        raytracer.Point `json:"transmitter"`
	Receiver           raytracer.Point `json:"receiver"`
	RequestedSpacingM  float64         `json:"requested_spacing_m"`
	Interpolation      string          `json:"interpolation,omitempty"`
	TxHeightAGLM       *float64        `json:"tx_height_agl_m,omitempty"`
	RxHeightAGLM       *float64        `json:"rx_height_agl_m,omitempty"`
	UncertaintyMarginM *float64        `json:"uncertainty_margin_m,omitempty"`
}

func registerSpatialEvidenceRoutes(router *gin.Engine, datasets *datasetRuntime) {
	router.GET("/api/spatial-evidence", func(c *gin.Context) {
		pack := datasets.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		c.JSON(http.StatusOK, raytracer.SpatialEvidenceSummaryForPack(pack))
	})

	router.GET("/api/spatial-evidence/buildings/:id", func(c *gin.Context) {
		pack := datasets.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		id := strings.TrimSpace(c.Param("id"))
		building := pack.BuildingIndex.BuildingByID(id)
		if building == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "building not found"})
			return
		}
		interpolation := pack.SpatialEvidence.TerrainInterpolation
		sampler, err := raytracer.NewTerrainSampler(pack.Terrain, interpolation)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		base := raytracer.CalculateBuildingBaseElevation(building, sampler, 5)
		ledger := raytracer.BuildingHeightLedgerForWithContext(building, base, nil, raytracer.BuildingHeightEvidenceContext{
			Source: strings.Join(pack.Manifest.Sources, ";"), SourceVersion: pack.Manifest.Version, DatasetID: pack.Manifest.ID,
		})
		c.JSON(http.StatusOK, gin.H{
			"building_id":          id,
			"height_ledger":        ledger,
			"terrain":              raytracer.TerrainDeclarationFromMetadata(pack.TerrainMeta),
			"dataset_id":           pack.Manifest.ID,
			"dataset_version":      pack.Manifest.Version,
			"canonical_activation": "diagnostic_only_not_active",
		})
	})

	router.POST("/api/spatial-evidence/path-profile", func(c *gin.Context) {
		pack := datasets.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		var input spatialEvidencePathInput
		if !bindJSON(c, &input, "spatial evidence path profile") {
			return
		}
		if !spatialEvidencePointValid(input.Transmitter) || !spatialEvidencePointValid(input.Receiver) {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "transmitter and receiver coordinates are invalid"})
			return
		}
		if input.RequestedSpacingM <= 0 {
			input.RequestedSpacingM = 30
		}
		interpolation := input.Interpolation
		if interpolation == "" {
			interpolation = pack.SpatialEvidence.TerrainInterpolation
		}
		if interpolation == "" {
			interpolation = raytracer.TerrainInterpolationBilinear
		}
		interpolation = strings.ToLower(strings.TrimSpace(interpolation))
		if interpolation != raytracer.TerrainInterpolationNearest && interpolation != raytracer.TerrainInterpolationBilinear {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "interpolation must be nearest or bilinear"})
			return
		}
		sampler, err := raytracer.NewTerrainSampler(pack.Terrain, interpolation)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		options := raytracer.DefaultTerrainClearanceOptions()
		options.RequestedSpacingM = input.RequestedSpacingM
		if input.TxHeightAGLM != nil {
			options.TxHeightAGLM = *input.TxHeightAGLM
		}
		if input.RxHeightAGLM != nil {
			options.RxHeightAGLM = *input.RxHeightAGLM
		}
		options.UncertaintyMarginM = input.UncertaintyMarginM
		profile, clearance, err := raytracer.BuildTerrainClearanceProfile(input.Transmitter, input.Receiver, sampler, options)
		if err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"profile":              profile,
			"clearance":            clearance,
			"terrain":              raytracer.TerrainDeclarationFromMetadata(pack.TerrainMeta),
			"dataset":              pack.Manifest,
			"canonical_activation": "diagnostic_only_not_active",
		})
	})
}

func spatialEvidencePointValid(point raytracer.Point) bool {
	return !math.IsNaN(point.Lon) && !math.IsInf(point.Lon, 0) && point.Lon >= -180 && point.Lon <= 180 &&
		!math.IsNaN(point.Lat) && !math.IsInf(point.Lat, 0) && point.Lat >= -90 && point.Lat <= 90
}
