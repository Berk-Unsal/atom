package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

const maxRequestBodyBytes int64 = 1 << 20

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
	distPath := getenv("FRONTEND_DIST_PATH", filepath.Clean("../frontend-react/dist"))
	indexPath := filepath.Join(distPath, "index.html")
	frontendReady := fileExists(indexPath)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(limitRequestBody(maxRequestBodyBytes))
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
	router.GET("/readyz", readinessHandler(buildingIndex.Len() > 0, len(towers) > 0, frontendReady))
	rfLimiter := newRFRequestLimiter(envInt("MAX_CONCURRENT_RF_REQUESTS", 2))
	router.GET("/api/towers", serveGeoJSONFile(towerGeoJSONPath, "ankara_5g_nodes.geojson is not configured"))
	router.GET("/api/buildings", serveBuildingGeoJSON(buildingStats.SourcePath))
	router.GET("/api/buildings/summary", func(c *gin.Context) {
		c.JSON(http.StatusOK, buildingDemandSummary)
	})
	router.POST("/api/simulate", rfLimiter.middleware(), func(c *gin.Context) {
		var input raytracer.StaticSimulationRequestInput
		if !bindJSON(c, &input, "simulation") {
			return
		}
		if input.MissingRequiredCoordinates() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tower_lon and tower_lat are required"})
			return
		}
		req := input.ToRequest()
		if validationError := validateSimulationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		payload, runErr := raytracer.SimulateStaticRaysContext(c.Request.Context(), req, buildingIndex)
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/optimize-azimuth", rfLimiter.middleware(), func(c *gin.Context) {
		var input raytracer.StaticSimulationRequestInput
		if !bindJSON(c, &input, "optimization") {
			return
		}
		if input.MissingRequiredCoordinates() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tower_lon and tower_lat are required"})
			return
		}
		req := input.ToRequest()
		if validationError := validateSimulationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		payload, runErr := raytracer.OptimizeAzimuthContext(c.Request.Context(), req, buildingIndex)
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/optimize-network", rfLimiter.middleware(), func(c *gin.Context) {
		var input raytracer.NetworkOptimizationRequestInput
		if !bindJSON(c, &input, "network optimization") {
			return
		}
		if input.MissingRequiredTowerFields() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "each tower must include id, tower_lon, and tower_lat"})
			return
		}
		req := input.ToRequest()
		if validationError := validateNetworkOptimizationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		payload, runErr := raytracer.OptimizeNetworkContext(c.Request.Context(), req, buildingIndex)
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/evaluate-network", rfLimiter.middleware(), func(c *gin.Context) {
		var input raytracer.NetworkOptimizationRequestInput
		if !bindJSON(c, &input, "network evaluation") {
			return
		}
		if input.MissingRequiredTowerFields() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "each tower must include id, tower_lon, and tower_lat"})
			return
		}
		req := input.ToRequest()
		if validationError := validateNetworkOptimizationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		payload, runErr := raytracer.EvaluateNetworkContext(c.Request.Context(), req, buildingIndex)
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/coverage-gaps", rfLimiter.middleware(), func(c *gin.Context) {
		var input raytracer.StaticSimulationRequestInput
		if !bindJSON(c, &input, "coverage gap") {
			return
		}
		if input.MissingRequiredCoordinates() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tower_lon and tower_lat are required"})
			return
		}
		req := input.ToRequest()
		if validationError := validateSimulationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		payload, runErr := raytracer.FindCoverageGapsContext(c.Request.Context(), req, buildingIndex)
		writeRFResponse(c, payload, runErr)
	})
	registerInterferenceRoute(router, buildingIndex, rfLimiter.middleware())
	registerCoreLabRoutes(router)
	registerFrontendRoutes(router, distPath, indexPath, frontendReady)

	addr := ":" + getenv("PORT", "8080")
	log.Printf("A.T.O.M API listening on %s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("run server: %v", err)
	}
}

func registerInterferenceRoute(router *gin.Engine, buildingIndex *raytracer.BuildingIndex, middleware ...gin.HandlerFunc) {
	handler := func(c *gin.Context) {
		var input raytracer.InterferenceRequestInput
		if !bindJSON(c, &input, "interference") {
			return
		}
		if input.MissingRequiredTowerFields() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "each tower must include id, tower_lon, and tower_lat"})
			return
		}
		req := input.ToRequest()
		if validationError := raytracer.ValidateInterferenceRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		payload, runErr := raytracer.AnalyzeInterferenceContext(c.Request.Context(), req, buildingIndex)
		writeRFResponse(c, payload, runErr)
	}
	router.POST("/api/interference", append(middleware, handler)...)
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
	if req.TxPowerDBm < 0 || req.TxPowerDBm > 60 {
		return "tx_power_dbm must be between 0 and 60"
	}
	if req.BeamWidthDeg < 10 || req.BeamWidthDeg > 360 {
		return "beam_width must be between 10 and 360"
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
	if req.TxPowerDBm < 0 || req.TxPowerDBm > 60 {
		return "tx_power_dbm must be between 0 and 60"
	}
	if req.BeamWidthDeg < 10 || req.BeamWidthDeg > 360 {
		return "beam_width must be between 10 and 360"
	}
	seenTowerIDs := make(map[string]struct{}, len(req.Towers))
	for _, tower := range req.Towers {
		if tower.ID == "" {
			return "each tower must include a non-empty id"
		}
		if _, exists := seenTowerIDs[tower.ID]; exists {
			return "tower ids must be unique"
		}
		seenTowerIDs[tower.ID] = struct{}{}
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

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func registerFrontendRoutes(router *gin.Engine, distPath string, indexPath string, frontendReady bool) {
	if !frontendReady {
		log.Printf("frontend dist not found at %s; serving API only", distPath)
		router.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"service": "A.T.O.M API",
				"routes":  []string{"/healthz", "/readyz", "/api/towers", "/api/simulate", "/api/optimize-azimuth", "/api/optimize-network", "/api/evaluate-network", "/api/coverage-gaps", "/api/interference", "/api/core/status"},
			})
		})
		return
	}

	router.Static("/assets", filepath.Join(distPath, "assets"))
	router.Static("/icon", filepath.Join(distPath, "icon"))
	router.GET("/", serveIndex(indexPath))
	router.NoRoute(serveSPAFallback(distPath, indexPath))
}

func readinessHandler(buildingsReady bool, towersReady bool, frontendReady bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ready := buildingsReady && towersReady && frontendReady
		statusCode := http.StatusOK
		status := "ready"
		if !ready {
			statusCode = http.StatusServiceUnavailable
			status = "not_ready"
		}
		c.JSON(statusCode, gin.H{
			"status":    status,
			"buildings": buildingsReady,
			"towers":    towersReady,
			"frontend":  frontendReady,
		})
	}
}

func limitRequestBody(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}

func bindJSON(c *gin.Context, destination any, label string) bool {
	if err := c.ShouldBindJSON(destination); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request body exceeds 1 MiB limit"})
			return false
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid " + label + " JSON: " + err.Error()})
		return false
	}
	return true
}

type rfRequestLimiter struct {
	slots chan struct{}
}

func newRFRequestLimiter(capacity int) *rfRequestLimiter {
	return &rfRequestLimiter{slots: make(chan struct{}, capacity)}
}

func (limiter *rfRequestLimiter) middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		select {
		case limiter.slots <- struct{}{}:
			defer func() { <-limiter.slots }()
			c.Next()
		default:
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "RF analysis capacity is busy; retry shortly"})
		}
	}
}

func writeRFResponse[T any](c *gin.Context, payload T, err error) {
	if err == nil {
		c.JSON(http.StatusOK, payload)
		return
	}
	if errors.Is(err, context.Canceled) {
		return
	}
	if errors.Is(err, context.DeadlineExceeded) {
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "RF analysis exceeded its request deadline"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "RF analysis failed"})
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
		c.Header("Cache-Control", "no-store")
		c.Header("Content-Type", "application/geo+json")
		c.Request.Header.Del("If-Modified-Since")
		c.Request.Header.Del("If-None-Match")
		c.File(path)
	}
}
