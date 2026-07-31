package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
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

var (
	appVersion   = "dev"
	buildCommit  = "unknown"
	modelVersion = "fspl-walls-2p5d-v3"
)

func main() {
	datasetPack, datasetErr := loadRuntimeDataset()
	datasets := newDatasetRuntime(datasetPack, datasetErr, os.Getenv("ATOM_DATASETS_ROOT"))
	experiments := newExperimentManager(modelVersion, envInt("EXPERIMENT_WORKERS", 1), envInt("EXPERIMENT_QUEUE_SIZE", defaultExperimentQueueSize))
	buildingIndex := raytracer.EmptyBuildingIndex()
	buildingStats := raytracer.BuildingIndexStats{SourcePath: "not found"}
	var towers []raytracer.TowerStation
	towerGeoJSONPath := "not found"
	if datasetErr != nil {
		log.Printf("dataset pack unavailable: %v", datasetErr)
	} else {
		buildingIndex = datasetPack.BuildingIndex
		buildingStats = datasetPack.BuildingStats
		towers = datasetPack.Towers
		towerGeoJSONPath = datasetPack.TowerPath
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

	log.Printf("tower store ready: %d cells loaded from %s", len(towers), towerGeoJSONPath)
	distPath := getenv("FRONTEND_DIST_PATH", filepath.Clean("../frontend-react/dist"))
	indexPath := filepath.Join(distPath, "index.html")
	frontendReady := fileExists(indexPath)
	router := gin.New()
	trustedProxies := splitCommaSeparated(os.Getenv("TRUSTED_PROXIES"))
	if err := router.SetTrustedProxies(trustedProxies); err != nil {
		log.Fatalf("configure trusted proxies: %v", err)
	}
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(securityHeaders(trustedProxies), requireHTTPS(envBool("REQUIRE_HTTPS", false), trustedProxies))
	router.Use(limitRequestBody(maxRequestBodyBytes))
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-API-Key"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/healthz", func(c *gin.Context) {
		pack := datasets.Current()
		currentBuildingStats := raytracer.BuildingIndexStats{}
		currentDemandSummary := raytracer.BuildingDemandSummary{}
		buildingCount := 0
		towerCount := 0
		if pack != nil {
			currentBuildingStats = pack.BuildingStats
			currentBuildingStats.SourcePath = ""
			currentDemandSummary = pack.BuildingIndex.DemandSummary("")
			buildingCount = pack.BuildingIndex.Len()
			towerCount = len(pack.Towers)
		}
		c.JSON(http.StatusOK, gin.H{
			"status":          "ok",
			"backend":         "static-in-memory",
			"buildingIndex":   currentBuildingStats,
			"buildingDemand":  currentDemandSummary,
			"rtreeFootprints": buildingCount,
			"towerCount":      towerCount,
		})
	})
	router.GET("/readyz", runtimeReadinessHandler(datasets, frontendReady))
	rfLimiter := newRFRequestLimiterWithBudget(
		envInt("MAX_CONCURRENT_RF_REQUESTS", 2),
		envInt("MAX_CONCURRENT_RF_REQUESTS_PER_CLIENT", defaultRFClientLimit),
		envInt("RF_REQUESTS_PER_MINUTE", defaultRFRequestsPerMinute),
	)
	router.Use(protectExpensiveRFRoutes(
		rfLimiter,
		time.Duration(envInt("RF_REQUEST_TIMEOUT_SECONDS", int(defaultRFRequestTimeout/time.Second)))*time.Second,
		strings.TrimSpace(os.Getenv("RF_API_KEY")),
	))
	buildingAPIKey := strings.TrimSpace(os.Getenv("BUILDINGS_API_KEY"))
	buildingLimiter := newRFRequestLimiterWithBudget(
		envInt("MAX_CONCURRENT_BUILDING_DOWNLOADS", defaultBuildingDownloadCapacity),
		envInt("MAX_CONCURRENT_BUILDING_DOWNLOADS_PER_CLIENT", defaultBuildingDownloadClientLimit),
		envInt("BUILDING_DOWNLOADS_PER_MINUTE", defaultBuildingDownloadsPerMinute),
	)
	buildingFeatureLimiter := newRFRequestLimiterWithBudget(
		envInt("MAX_CONCURRENT_BUILDING_FEATURE_QUERIES", 4),
		envInt("MAX_CONCURRENT_BUILDING_FEATURE_QUERIES_PER_CLIENT", 2),
		envInt("BUILDING_FEATURE_QUERIES_PER_MINUTE", 120),
	)
	buildingCacheControl := buildingDatasetCacheControl(buildingAPIKey != "")
	router.GET("/api/meta", func(c *gin.Context) {
		response := gin.H{
			"application_version":    appVersion,
			"build_commit":           buildCommit,
			"model_version":          modelVersion,
			"supported_technologies": []string{"4g", "5g", "6g-research"},
		}
		if pack := datasets.Current(); pack != nil {
			response["dataset"] = pack.Manifest
		}
		c.JSON(http.StatusOK, response)
	})
	router.GET("/api/towers", serveRuntimeTowerGeoJSON(datasets))
	router.GET(
		"/api/buildings",
		requireBuildingAPIKey(buildingAPIKey),
		buildingLimiter.middlewareFor("building dataset download"),
		func(c *gin.Context) {
			pack := datasets.Current()
			if pack == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "building dataset is not configured"})
				return
			}
			etag := strongETag(pack.Manifest.SHA256[pack.Manifest.Files.Buildings])
			if etag != "" && etagMatches(c.GetHeader("If-None-Match"), etag) {
				setBuildingCacheHeaders(c, etag, buildingCacheControl)
				c.Status(http.StatusNotModified)
				return
			}
			serveBuildingGeoJSON(pack.BuildingPath, etag, buildingCacheControl)(c)
		},
	)
	router.GET("/api/buildings/summary", func(c *gin.Context) {
		pack := datasets.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		c.JSON(http.StatusOK, pack.BuildingIndex.DemandSummary(""))
	})
	registerBuildingFeatureRoutes(
		router,
		datasets,
		requireBuildingAPIKey(buildingAPIKey),
		buildingFeatureLimiter.middlewareFor("bounded building feature query"),
	)
	registerDatasetRoutes(router, datasets, strings.TrimSpace(os.Getenv("DATASET_ADMIN_API_KEY")))
	registerExperimentRoutes(router, experiments, datasets)
	registerPathProfileRoute(router, datasets)
	registerCoverageSurfaceRoute(router, datasets)
	router.POST("/api/analyze-sector", func(c *gin.Context) {
		var input raytracer.StaticSimulationRequestInput
		if !bindJSON(c, &input, "sector analysis") {
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
		payload, runErr := raytracer.AnalyzeSectorContext(c.Request.Context(), req, currentBuildingIndex(datasets))
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/simulate", func(c *gin.Context) {
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
		payload, runErr := raytracer.SimulateStaticRaysContext(c.Request.Context(), req, currentBuildingIndex(datasets))
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/optimize-azimuth", func(c *gin.Context) {
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
		payload, runErr := raytracer.OptimizeAzimuthContext(c.Request.Context(), req, currentBuildingIndex(datasets))
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/optimize-network", func(c *gin.Context) {
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
		payload, runErr := raytracer.OptimizeNetworkContext(c.Request.Context(), req, currentBuildingIndex(datasets))
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/evaluate-network", func(c *gin.Context) {
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
		payload, runErr := raytracer.EvaluateNetworkContext(c.Request.Context(), req, currentBuildingIndex(datasets))
		writeRFResponse(c, payload, runErr)
	})
	router.POST("/api/coverage-gaps", func(c *gin.Context) {
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
		payload, runErr := raytracer.FindCoverageGapsContext(c.Request.Context(), req, currentBuildingIndex(datasets))
		writeRFResponse(c, payload, runErr)
	})
	registerInterferenceRouteProvider(router, func() *raytracer.BuildingIndex { return currentBuildingIndex(datasets) })
	registerRecommendationRouteProvider(router, func() (*raytracer.BuildingIndex, []raytracer.TowerStation) {
		pack := datasets.Current()
		if pack == nil {
			return raytracer.EmptyBuildingIndex(), nil
		}
		return pack.BuildingIndex, pack.Towers
	})
	registerMeasurementRouteProvider(router, func() *raytracer.BuildingIndex { return currentBuildingIndex(datasets) })
	registerCoreLabRoutes(router)
	registerFrontendRoutes(router, distPath, indexPath, frontendReady)

	addr := net.JoinHostPort(getenv("BIND_ADDRESS", "127.0.0.1"), getenv("PORT", "8080"))
	log.Printf("A.T.O.M API listening on %s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := runHTTPServer(server); err != nil {
		log.Fatalf("run server: %v", err)
	}
}

func registerRecommendationRoute(router *gin.Engine, buildingIndex *raytracer.BuildingIndex, towers []raytracer.TowerStation, middleware ...gin.HandlerFunc) {
	registerRecommendationRouteProvider(router, func() (*raytracer.BuildingIndex, []raytracer.TowerStation) {
		return buildingIndex, towers
	}, middleware...)
}

func registerRecommendationRouteProvider(router *gin.Engine, provider func() (*raytracer.BuildingIndex, []raytracer.TowerStation), middleware ...gin.HandlerFunc) {
	handler := func(c *gin.Context) {
		var input raytracer.SiteRecommendationRequestInput
		if !bindJSON(c, &input, "site recommendation") {
			return
		}
		if input.MissingRequiredTowerFields() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "each tower must include id, tower_lon, and tower_lat"})
			return
		}
		req := input.ToRequest()
		if validationError := raytracer.ValidateSiteRecommendationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		buildingIndex, towers := provider()
		payload, runErr := raytracer.RecommendSitesContext(c.Request.Context(), req, towers, buildingIndex)
		writeRFResponse(c, payload, runErr)
	}
	router.POST("/api/recommend-sites", append(middleware, handler)...)
}

func registerMeasurementRoute(router *gin.Engine, buildingIndex *raytracer.BuildingIndex, middleware ...gin.HandlerFunc) {
	registerMeasurementRouteProvider(router, func() *raytracer.BuildingIndex { return buildingIndex }, middleware...)
}

func registerMeasurementRouteProvider(router *gin.Engine, provider func() *raytracer.BuildingIndex, middleware ...gin.HandlerFunc) {
	handler := func(c *gin.Context) {
		var input raytracer.MeasurementEvaluationRequestInput
		if !bindJSON(c, &input, "measurement evaluation") {
			return
		}
		req := input.ToRequest()
		if validationError := raytracer.ValidateMeasurementEvaluationRequest(input, req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		payload, runErr := raytracer.EvaluateMeasurementsContext(c.Request.Context(), req, provider())
		writeRFResponse(c, payload, runErr)
	}
	router.POST("/api/measurements/evaluate", append(middleware, handler)...)
}

func registerInterferenceRoute(router *gin.Engine, buildingIndex *raytracer.BuildingIndex, middleware ...gin.HandlerFunc) {
	registerInterferenceRouteProvider(router, func() *raytracer.BuildingIndex { return buildingIndex }, middleware...)
}

func registerInterferenceRouteProvider(router *gin.Engine, provider func() *raytracer.BuildingIndex, middleware ...gin.HandlerFunc) {
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
		payload, runErr := raytracer.AnalyzeInterferenceContext(c.Request.Context(), req, provider())
		writeRFResponse(c, payload, runErr)
	}
	router.POST("/api/interference", append(middleware, handler)...)
}

func registerPathProfileRoute(router *gin.Engine, runtime *datasetRuntime) {
	router.POST("/api/path-profile", func(c *gin.Context) {
		var input raytracer.PathProfileRequestInput
		if !bindJSON(c, &input, "path profile") {
			return
		}
		request := input.ToRequest()
		if validationError := raytracer.ValidatePathProfileRequest(input, request); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		pack := runtime.Current()
		if pack == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dataset unavailable"})
			return
		}
		response, err := raytracer.AnalyzePathProfileContext(c.Request.Context(), request, pack.Terrain, pack.BuildingIndex)
		writeRFResponse(c, response, err)
	})
}

func validateSimulationRequest(req raytracer.StaticSimulationRequest) string {
	if req.TowerLon < raytracer.MinLongitude || req.TowerLon > raytracer.MaxLongitude || req.TowerLat < raytracer.MinLatitude || req.TowerLat > raytracer.MaxLatitude {
		return "tower_lon and tower_lat must be valid coordinates"
	}
	if req.Rays < raytracer.MinSimulationRays || req.Rays > raytracer.MaxSimulationRays {
		return "rays must be between 8 and 720"
	}
	if req.RadiusMeters < raytracer.MinRadiusMeters || req.RadiusMeters > raytracer.MaxRadiusMeters {
		return "radius_m must be between 25 and 5000"
	}
	if validationError := raytracer.ValidateSimulationFeatureBudget(req.Rays, req.RadiusMeters); validationError != "" {
		return validationError
	}
	if req.FrequencyGHz <= 0 || req.FrequencyGHz > raytracer.MaxFrequencyGHz {
		return "frequency_ghz must be between 0 and 300"
	}
	if req.TxPowerDBm < raytracer.MinTxPowerDBm || req.TxPowerDBm > raytracer.MaxTxPowerDBm {
		return "tx_power_dbm must be between 0 and 60"
	}
	if req.BeamWidthDeg < raytracer.MinBeamWidthDeg || req.BeamWidthDeg > raytracer.MaxBeamWidthDeg {
		return "beam_width must be between 10 and 360"
	}
	if req.CalibrationOffsetDB < raytracer.MinCalibrationOffsetDB || req.CalibrationOffsetDB > raytracer.MaxCalibrationOffsetDB {
		return "calibration_offset_db must be between -40 and 40"
	}
	if req.RFProfile.SchemaVersion != 0 {
		if validationError := raytracer.ValidateCellRFProfile(req.RFProfile, false); validationError != "" {
			return validationError
		}
	}
	return ""
}

func validateNetworkOptimizationRequest(req raytracer.NetworkOptimizationRequest) string {
	if len(req.Towers) < raytracer.MinNetworkTowers || len(req.Towers) > raytracer.MaxNetworkTowers {
		return "towers must contain between 2 and 6 selected towers"
	}
	if req.Rays < raytracer.MinSimulationRays || req.Rays > raytracer.MaxSimulationRays {
		return "rays must be between 8 and 720"
	}
	if req.RadiusMeters < raytracer.MinRadiusMeters || req.RadiusMeters > raytracer.MaxRadiusMeters {
		return "radius_m must be between 25 and 5000"
	}
	if validationError := raytracer.ValidateSimulationFeatureBudget(req.Rays, req.RadiusMeters); validationError != "" {
		return validationError
	}
	if req.FrequencyGHz <= 0 || req.FrequencyGHz > raytracer.MaxFrequencyGHz {
		return "frequency_ghz must be between 0 and 300"
	}
	if req.TxPowerDBm < raytracer.MinTxPowerDBm || req.TxPowerDBm > raytracer.MaxTxPowerDBm {
		return "tx_power_dbm must be between 0 and 60"
	}
	if req.BeamWidthDeg < raytracer.MinBeamWidthDeg || req.BeamWidthDeg > raytracer.MaxBeamWidthDeg {
		return "beam_width must be between 10 and 360"
	}
	if req.CalibrationOffsetDB < raytracer.MinCalibrationOffsetDB || req.CalibrationOffsetDB > raytracer.MaxCalibrationOffsetDB {
		return "calibration_offset_db must be between -40 and 40"
	}
	seenTowerIDs := make(map[string]struct{}, len(req.Towers))
	for _, tower := range req.Towers {
		if validationError := raytracer.ValidateTowerID(tower.ID); validationError != "" {
			return validationError
		}
		if _, exists := seenTowerIDs[tower.ID]; exists {
			return "tower ids must be unique"
		}
		seenTowerIDs[tower.ID] = struct{}{}
		if tower.TowerLon < raytracer.MinLongitude || tower.TowerLon > raytracer.MaxLongitude || tower.TowerLat < raytracer.MinLatitude || tower.TowerLat > raytracer.MaxLatitude {
			return "each tower must include valid tower_lon and tower_lat coordinates"
		}
		profileRadius := req.RadiusMeters
		if tower.RFProfile.SchemaVersion != 0 {
			if validationError := raytracer.ValidateCellRFProfile(tower.RFProfile, false); validationError != "" {
				return fmt.Sprintf("tower %q: %s", tower.ID, validationError)
			}
			profileRadius = tower.RFProfile.RadiusMeters
		}
		if validationError := raytracer.ValidateSimulationFeatureBudget(req.Rays, profileRadius); validationError != "" {
			return fmt.Sprintf("tower %q: %s", tower.ID, validationError)
		}
	}
	if validationError := raytracer.ValidateOptimizationConfig(req.Optimization); validationError != "" {
		return validationError
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

func splitCommaSeparated(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	return values
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
				"routes": []string{
					"/healthz", "/readyz", "/api/meta", "/api/datasets", "/api/datasets/switch", "/api/towers", "/api/buildings", "/api/buildings/summary",
					"/api/conformance", "/api/collections", "/api/collections/buildings", "/api/collections/buildings/items", "/api/path-profile", "/api/coverage-surface", "/api/processes/batch-experiment", "/api/processes/batch-experiment/execution", "/api/jobs/:jobID", "/api/analyze-sector", "/api/simulate", "/api/coverage-gaps", "/api/optimize-azimuth", "/api/evaluate-network",
					"/api/optimize-network", "/api/interference", "/api/recommend-sites", "/api/measurements/evaluate",
					"/api/core/status", "/api/core/topology", "/api/core/sessions", "/api/core/events", "/api/core/scenario",
				},
			})
		})
		return
	}

	router.Static("/assets", filepath.Join(distPath, "assets"))
	router.Static("/icon", filepath.Join(distPath, "icon"))
	router.GET("/", serveIndex(indexPath))
	router.NoRoute(serveSPAFallback(distPath, indexPath))
}

func readinessHandler(buildingsReady bool, towersReady bool, frontendReady bool, datasetErrors ...string) gin.HandlerFunc {
	datasetError := ""
	if len(datasetErrors) > 0 {
		if strings.TrimSpace(datasetErrors[0]) != "" {
			datasetError = "dataset unavailable"
		}
	}
	return func(c *gin.Context) {
		ready := buildingsReady && towersReady && frontendReady
		statusCode := http.StatusOK
		status := "ready"
		if !ready {
			statusCode = http.StatusServiceUnavailable
			status = "not_ready"
		}
		c.JSON(statusCode, gin.H{
			"status":        status,
			"buildings":     buildingsReady,
			"towers":        towersReady,
			"frontend":      frontendReady,
			"dataset_error": datasetError,
		})
	}
}

func runtimeReadinessHandler(runtime *datasetRuntime, frontendReady bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		pack := runtime.Current()
		buildingsReady := pack != nil && pack.BuildingIndex != nil && pack.BuildingIndex.Len() > 0
		towersReady := pack != nil && len(pack.Towers) > 0
		datasetError := runtime.LoadError()
		readinessHandler(buildingsReady, towersReady, frontendReady, datasetError)(c)
	}
}

func currentBuildingIndex(runtime *datasetRuntime) *raytracer.BuildingIndex {
	if pack := runtime.Current(); pack != nil && pack.BuildingIndex != nil {
		return pack.BuildingIndex
	}
	return raytracer.EmptyBuildingIndex()
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
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return rejectJSON(c, label, err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			err = errors.New("multiple JSON values")
		}
		return rejectJSON(c, label, err)
	}
	return true
}

func rejectJSON(c *gin.Context, label string, err error) bool {
	var maxBytesError *http.MaxBytesError
	if errors.As(err, &maxBytesError) {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request body exceeds 1 MiB limit"})
		return false
	}
	log.Printf("rejected invalid %s JSON: %v", label, err)
	c.JSON(http.StatusBadRequest, gin.H{"error": "invalid " + label + " JSON"})
	return false
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
	if errors.Is(err, raytracer.ErrSimulationFeatureLimit) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": "simulation response exceeded the " + strconv.Itoa(raytracer.MaxSimulationResponseFeatures) + "-feature limit; reduce rays or radius_m",
		})
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

func serveRuntimeTowerGeoJSON(runtime *datasetRuntime) gin.HandlerFunc {
	return func(c *gin.Context) {
		pack := runtime.Current()
		if pack == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "tower dataset is not configured"})
			return
		}
		serveGeoJSONFile(pack.TowerPath, "tower dataset is not configured")(c)
	}
}
