package main

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

const (
	defaultBuildingFeatureLimit = 1000
	maxBuildingFeatureLimit     = 5000
	maxBuildingQuerySpanMeters  = 50_000
)

func registerBuildingFeatureRoutes(router *gin.Engine, datasets *datasetRuntime, itemMiddleware ...gin.HandlerFunc) {
	router.GET("/api/conformance", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"conformsTo":   []string{},
			"conceptsFrom": []string{"https://www.ogc.org/standards/ogcapi-features/"},
			"note":         "This bounded collection follows selected OGC API Features concepts but does not claim a complete conformance class.",
		})
	})
	router.GET("/api/collections", func(c *gin.Context) {
		pack := datasets.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"collections": []any{buildingCollectionMetadata(pack)},
			"links":       []gin.H{{"rel": "self", "type": "application/json", "href": "/api/collections"}},
		})
	})
	router.GET("/api/collections/buildings", func(c *gin.Context) {
		pack := datasets.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		c.JSON(http.StatusOK, buildingCollectionMetadata(pack))
	})
	itemsHandler := func(c *gin.Context) {
		pack := datasets.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		bounds, err := parseBuildingFeatureBBox(c.Query("bbox"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		limit, err := boundedQueryInteger(c.Query("limit"), defaultBuildingFeatureLimit, 1, maxBuildingFeatureLimit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be an integer between 1 and 5000"})
			return
		}
		offset, err := boundedQueryInteger(c.Query("offset"), 0, 0, 10_000_000)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "offset must be a non-negative integer"})
			return
		}
		collection := pack.BuildingIndex.FeatureCollection(bounds, limit, offset)
		if strings.EqualFold(c.Query("f"), "csv") || strings.Contains(c.GetHeader("Accept"), "text/csv") {
			writeBuildingFeatureCSV(c, collection)
			return
		}
		c.Header("Content-Type", "application/geo+json")
		if offset+collection.NumberReturned < collection.NumberMatched {
			query := c.Request.URL.Query()
			query.Set("offset", strconv.Itoa(offset+collection.NumberReturned))
			c.Header("Link", fmt.Sprintf("</api/collections/buildings/items?%s>; rel=\"next\"", query.Encode()))
		}
		c.JSON(http.StatusOK, collection)
	}
	router.GET("/api/collections/buildings/items", append(itemMiddleware, itemsHandler)...)
}

func buildingCollectionMetadata(pack *raytracer.DatasetPack) gin.H {
	bounds := pack.Manifest.Bounds
	if len(bounds) != 4 {
		bounds = []float64{-180, -90, 180, 90}
	}
	return gin.H{
		"id": "buildings", "title": "Building footprints", "description": "Viewport-bounded building footprints with planning height, material, and demand attributes.",
		"itemType": "feature", "crs": []string{"http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
		"extent": gin.H{"spatial": gin.H{"bbox": [][]float64{bounds}, "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"}},
		"links": []gin.H{
			{"rel": "self", "type": "application/json", "href": "/api/collections/buildings"},
			{"rel": "items", "type": "application/geo+json", "href": "/api/collections/buildings/items{?bbox,limit,offset}"},
			{"rel": "items", "type": "text/csv", "href": "/api/collections/buildings/items{?bbox,limit,offset,f}"},
		},
	}
}

func parseBuildingFeatureBBox(value string) (raytracer.Bounds, error) {
	parts := strings.Split(strings.TrimSpace(value), ",")
	if len(parts) != 4 {
		return raytracer.Bounds{}, fmt.Errorf("bbox is required as minLon,minLat,maxLon,maxLat")
	}
	coordinates := make([]float64, 4)
	for index, part := range parts {
		coordinate, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err != nil {
			return raytracer.Bounds{}, fmt.Errorf("bbox contains an invalid coordinate")
		}
		coordinates[index] = coordinate
	}
	bounds := raytracer.Bounds{MinLon: coordinates[0], MinLat: coordinates[1], MaxLon: coordinates[2], MaxLat: coordinates[3]}
	if !bounds.Valid() || bounds.MinLon < -180 || bounds.MaxLon > 180 || bounds.MinLat < -90 || bounds.MaxLat > 90 {
		return raytracer.Bounds{}, fmt.Errorf("bbox must be valid CRS84 longitude/latitude bounds")
	}
	diagonal := raytracer.ApproxDistanceMeters(
		raytracer.Point{Lon: bounds.MinLon, Lat: bounds.MinLat},
		raytracer.Point{Lon: bounds.MaxLon, Lat: bounds.MaxLat},
	)
	if diagonal > maxBuildingQuerySpanMeters {
		return raytracer.Bounds{}, fmt.Errorf("bbox diagonal must not exceed %d meters", maxBuildingQuerySpanMeters)
	}
	return bounds, nil
}

func boundedQueryInteger(value string, fallback, minimum, maximum int) (int, error) {
	if strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	number, err := strconv.Atoi(value)
	if err != nil || number < minimum || number > maximum {
		return 0, fmt.Errorf("query integer out of range")
	}
	return number, nil
}

func writeBuildingFeatureCSV(c *gin.Context, collection raytracer.BuildingGeoJSONFeatureCollection) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="buildings.csv"`)
	c.Status(http.StatusOK)
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{"id", "geometry_wkt", "building", "name", "amenity", "height_m", "height_source", "material", "demand_weight", "residential_demand", "density_score"})
	for _, feature := range collection.Features {
		properties := feature.Properties
		_ = writer.Write([]string{
			feature.ID, polygonWKT(feature.Geometry.Coordinates), properties.Building, properties.Name, properties.Amenity,
			strconv.FormatFloat(properties.HeightMeters, 'f', -1, 64), properties.HeightSource, properties.Material,
			strconv.FormatFloat(properties.DemandWeight, 'f', -1, 64), strconv.FormatFloat(properties.ResidentialDemand, 'f', -1, 64), strconv.FormatFloat(properties.DensityScore, 'f', -1, 64),
		})
	}
	writer.Flush()
}

func polygonWKT(coordinates [][][]float64) string {
	if len(coordinates) == 0 {
		return "POLYGON EMPTY"
	}
	rings := make([]string, 0, len(coordinates))
	for _, ring := range coordinates {
		points := make([]string, 0, len(ring))
		for _, point := range ring {
			if len(point) >= 2 {
				points = append(points, strconv.FormatFloat(point[0], 'f', -1, 64)+" "+strconv.FormatFloat(point[1], 'f', -1, 64))
			}
		}
		rings = append(rings, "("+strings.Join(points, ", ")+")")
	}
	return "POLYGON (" + strings.Join(rings, ", ") + ")"
}
