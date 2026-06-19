package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	buildingIndex, buildingStats, err := loadBuildingIndex()
	if err != nil {
		log.Printf("building index unavailable: %v", err)
	}
	log.Printf(
		"building spatial index ready: %d footprints indexed from %s",
		buildingIndex.Len(),
		buildingStats.SourcePath,
	)

	towers, towerGeoJSONPath, err := loadTowers()
	if err != nil {
		log.Printf("tower data unavailable: %v", err)
	}
	log.Printf("tower store ready: %d cells loaded from %s", len(towers), towerGeoJSONPath)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":          "ok",
			"backend":         "static-in-memory",
			"buildingIndex":   buildingStats,
			"rtreeFootprints": buildingIndex.Len(),
			"towerCount":      len(towers),
		})
	})
	router.GET("/api/towers", serveGeoJSONFile(towerGeoJSONPath, "ankara_5g_nodes.geojson is not configured"))
	router.GET("/api/buildings", serveBuildingGeoJSON(buildingStats.SourcePath))
	router.POST("/api/simulate", func(c *gin.Context) {
		var req raytracer.StaticSimulationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation JSON: " + err.Error()})
			return
		}
		raytracer.NormalizeStaticSimulationRequest(&req)
		if validationError := validateSimulationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		c.JSON(http.StatusOK, raytracer.SimulateStaticRays(req, buildingIndex))
	})
	router.POST("/api/optimize-azimuth", func(c *gin.Context) {
		var req raytracer.StaticSimulationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid optimization JSON: " + err.Error()})
			return
		}
		raytracer.NormalizeStaticSimulationRequest(&req)
		if validationError := validateSimulationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		c.JSON(http.StatusOK, raytracer.OptimizeAzimuth(req, buildingIndex))
	})
	registerFrontendRoutes(router)

	addr := ":" + getenv("PORT", "8080")
	log.Printf("Ankara static raytracer API listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("run server: %v", err)
	}
}

func validateSimulationRequest(req raytracer.StaticSimulationRequest) string {
	if req.TowerLon < -180 || req.TowerLon > 180 || req.TowerLat < -90 || req.TowerLat > 90 {
		return "tower_lon and tower_lat must be valid coordinates"
	}
	if req.Rays < 8 || req.Rays > 720 {
		return "rays must be between 8 and 720"
	}
	if req.RadiusMeters < 25 || req.RadiusMeters > 5000 {
		return "radius_m must be between 25 and 5000"
	}
	if req.FrequencyGHz <= 0 || req.FrequencyGHz > 100 {
		return "frequency_ghz must be between 0 and 100"
	}
	return ""
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func registerFrontendRoutes(router *gin.Engine) {
	distPath := getenv("FRONTEND_DIST_PATH", filepath.Clean("../frontend-react/dist"))
	indexPath := filepath.Join(distPath, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		log.Printf("frontend dist not found at %s; serving API only", distPath)
		router.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"service": "mmWave AI Propagation Predictor API",
				"routes":  []string{"/healthz", "/api/towers", "/api/simulate", "/api/optimize-azimuth"},
			})
		})
		return
	}

	router.Static("/assets", filepath.Join(distPath, "assets"))
	router.Static("/icon", filepath.Join(distPath, "icon"))
	router.GET("/", serveIndex(indexPath))
	router.GET("/dashboard", serveIndex(indexPath))
	router.GET("/dashboard/*path", serveIndex(indexPath))
}

func serveIndex(indexPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.File(indexPath)
	}
}

func loadBuildingIndex() (*raytracer.BuildingIndex, raytracer.BuildingIndexStats, error) {
	path := os.Getenv("BUILDINGS_GEOJSON_PATH")
	if path == "" {
		path = firstExistingPath([]string{
			filepath.Clean("../ankara_buildings.geojson"),
			filepath.Clean("../data/ankara_buildings.geojson"),
			filepath.Clean("../data-pipeline/ankara_buildings.geojson"),
			filepath.Clean("ankara_buildings.geojson"),
		})
	}

	if path == "" {
		return raytracer.EmptyBuildingIndex(), raytracer.BuildingIndexStats{
			SourcePath: "not found",
		}, nil
	}

	index, stats, err := raytracer.LoadBuildingIndexFromGeoJSON(path)
	if err != nil {
		return raytracer.EmptyBuildingIndex(), stats, err
	}
	return index, stats, nil
}

func loadTowers() ([]raytracer.TowerStation, string, error) {
	path := os.Getenv("TOWERS_GEOJSON_PATH")
	if path == "" {
		path = firstExistingPath([]string{
			filepath.Clean("../ankara_5g_nodes.geojson"),
			filepath.Clean("../data/ankara_5g_nodes.geojson"),
			filepath.Clean("../data-pipeline/ankara_5g_nodes.geojson"),
			filepath.Clean("ankara_5g_nodes.geojson"),
		})
	}

	if path == "" {
		return nil, "not found", nil
	}

	towers, err := raytracer.LoadTowersFromGeoJSON(path)
	return towers, path, err
}

func firstExistingPath(candidates []string) string {
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return ""
}

func serveBuildingGeoJSON(path string) gin.HandlerFunc {
	return serveGeoJSONFile(path, "ankara_buildings.geojson is not configured")
}

func serveGeoJSONFile(path string, missingMessage string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if path == "" || path == "not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": missingMessage})
			return
		}
		c.File(path)
	}
}
