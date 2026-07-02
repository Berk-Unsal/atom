package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
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
	buildingDemandSummary := buildingIndex.DemandSummary(buildingStats.SourcePath)
	log.Printf(
		"building spatial index ready: %d footprints indexed from %s",
		buildingIndex.Len(),
		buildingStats.SourcePath,
	)
	log.Printf(
		"building demand data: %s (%d/%d demand-weighted, avg %.2f, max %.2f)",
		buildingDemandSummary.DataQuality,
		buildingDemandSummary.DemandWeightedBuildings,
		buildingDemandSummary.TotalBuildings,
		buildingDemandSummary.AvgDemandWeight,
		buildingDemandSummary.MaxDemandWeight,
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
			"buildingDemand":  buildingDemandSummary,
			"rtreeFootprints": buildingIndex.Len(),
			"towerCount":      len(towers),
		})
	})
	router.GET("/api/towers", serveGeoJSONFile(towerGeoJSONPath, "ankara_5g_nodes.geojson is not configured"))
	router.GET("/api/buildings", serveBuildingGeoJSON(buildingStats.SourcePath))
	router.GET("/api/buildings/summary", func(c *gin.Context) {
		c.JSON(http.StatusOK, buildingDemandSummary)
	})
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
	router.POST("/api/optimize-network", func(c *gin.Context) {
		var req raytracer.NetworkOptimizationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network optimization JSON: " + err.Error()})
			return
		}
		raytracer.NormalizeNetworkOptimizationRequest(&req)
		if validationError := validateNetworkOptimizationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		c.JSON(http.StatusOK, raytracer.OptimizeNetwork(req, buildingIndex))
	})
	router.POST("/api/evaluate-network", func(c *gin.Context) {
		var req raytracer.NetworkOptimizationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid network evaluation JSON: " + err.Error()})
			return
		}
		raytracer.NormalizeNetworkOptimizationRequest(&req)
		if validationError := validateNetworkOptimizationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		c.JSON(http.StatusOK, raytracer.EvaluateNetwork(req, buildingIndex))
	})
	router.POST("/api/coverage-gaps", func(c *gin.Context) {
		var req raytracer.StaticSimulationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coverage gap JSON: " + err.Error()})
			return
		}
		raytracer.NormalizeStaticSimulationRequest(&req)
		if validationError := validateSimulationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		c.JSON(http.StatusOK, raytracer.FindCoverageGaps(req, buildingIndex))
	})
	registerCoreLabRoutes(router)
	registerFrontendRoutes(router)

	addr := ":" + getenv("PORT", "8080")
	log.Printf("A.T.O.M API listening on %s", addr)
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
	if req.FrequencyGHz <= 0 || req.FrequencyGHz > 300 {
		return "frequency_ghz must be between 0 and 300"
	}
	return ""
}

func validateNetworkOptimizationRequest(req raytracer.NetworkOptimizationRequest) string {
	if len(req.Towers) < 2 || len(req.Towers) > 6 {
		return "towers must contain between 2 and 6 selected towers"
	}
	if req.Rays < 8 || req.Rays > 720 {
		return "rays must be between 8 and 720"
	}
	if req.RadiusMeters < 25 || req.RadiusMeters > 5000 {
		return "radius_m must be between 25 and 5000"
	}
	if req.FrequencyGHz <= 0 || req.FrequencyGHz > 300 {
		return "frequency_ghz must be between 0 and 300"
	}
	for _, tower := range req.Towers {
		if tower.TowerLon < -180 || tower.TowerLon > 180 || tower.TowerLat < -90 || tower.TowerLat > 90 {
			return "each tower must include valid tower_lon and tower_lat coordinates"
		}
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
				"service": "A.T.O.M API",
				"routes":  []string{"/healthz", "/api/towers", "/api/simulate", "/api/optimize-azimuth", "/api/optimize-network", "/api/evaluate-network", "/api/coverage-gaps", "/api/core/status"},
			})
		})
		return
	}

	router.Static("/assets", filepath.Join(distPath, "assets"))
	router.Static("/icon", filepath.Join(distPath, "icon"))
	router.GET("/", serveIndex(indexPath))
	router.NoRoute(serveSPAFallback(distPath, indexPath))
}

func serveIndex(indexPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.File(indexPath)
	}
}

func serveSPAFallback(distPath string, indexPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "api route not found"})
			return
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
			return
		}

		requestedPath := strings.TrimPrefix(c.Request.URL.Path, "/")
		if requestedPath != "" {
			staticPath := filepath.Join(distPath, filepath.Clean(requestedPath))
			if strings.HasPrefix(staticPath, filepath.Clean(distPath)+string(os.PathSeparator)) {
				if info, err := os.Stat(staticPath); err == nil && !info.IsDir() {
					c.File(staticPath)
					return
				}
			}
		}
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
