package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

func TestInterferenceRouteRejectsMalformedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerInterferenceRoute(router, raytracer.EmptyBuildingIndex())
	req := httptest.NewRequest(http.MethodPost, "/api/interference", strings.NewReader(`{"network_tech":`))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "invalid interference JSON") {
		t.Fatalf("body = %q, want malformed JSON error", recorder.Body.String())
	}
}

func TestInterferenceRouteRejects6G(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerInterferenceRoute(router, raytracer.EmptyBuildingIndex())
	body := `{
		"network_tech":"6g",
		"towers":[
			{"id":"a","tower_lon":32.85,"tower_lat":39.92},
			{"id":"b","tower_lon":32.86,"tower_lat":39.93}
		],
		"frequency_ghz":140,
		"radius_m":400,
		"bandwidth_mhz":400,
		"load_factor":0.7,
		"reuse_factor":1,
		"noise_figure_db":7,
		"sample_spacing_m":40
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/interference", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "not applicable") {
		t.Fatalf("body = %q, want not-applicable error", recorder.Body.String())
	}
}

func TestInterferenceRoutePreservesExplicitZeroNoiseFigure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerInterferenceRoute(router, raytracer.EmptyBuildingIndex())
	body := `{
		"network_tech":"4g",
		"towers":[
			{"id":"a","tower_lon":32.85,"tower_lat":39.92,"azimuth":90},
			{"id":"b","tower_lon":32.851,"tower_lat":39.92,"azimuth":90}
		],
		"frequency_ghz":2.6,
		"radius_m":100,
		"tx_power_dbm":0,
		"beam_width":120,
		"bandwidth_mhz":20,
		"load_factor":0.7,
		"reuse_factor":1,
		"noise_figure_db":0,
		"sample_spacing_m":40
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/interference", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Model raytracer.InterferenceModel `json:"model"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Model.NoiseFigureDB != 0 {
		t.Fatalf("noise figure = %.1f, want 0", payload.Model.NoiseFigureDB)
	}
}

func TestRequestBodyLimitReturns413(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(limitRequestBody(32))
	registerInterferenceRoute(router, raytracer.EmptyBuildingIndex())
	req := httptest.NewRequest(http.MethodPost, "/api/interference", strings.NewReader(`{"network_tech":"5g","padding":"abcdefghijklmnopqrstuvwxyz"}`))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestRFRequestLimiterReturns429WhenBusy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	limiter := newRFRequestLimiter(1)
	limiter.slots <- struct{}{}
	router.POST("/busy", limiter.middleware(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	req := httptest.NewRequest(http.MethodPost, "/busy", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusTooManyRequests || recorder.Header().Get("Retry-After") != "1" {
		t.Fatalf("status = %d, Retry-After = %q", recorder.Code, recorder.Header().Get("Retry-After"))
	}
}

func TestReadinessRequiresAllRuntimeAssets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/readyz", readinessHandler(true, false, true))
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
}

func TestGeoJSONRouteUsesJSONMediaTypeAndDisablesCaching(t *testing.T) {
	gin.SetMode(gin.TestMode)
	path := filepath.Join(t.TempDir(), "towers.geojson")
	if err := os.WriteFile(path, []byte(`{"type":"FeatureCollection","features":[]}`), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	router := gin.New()
	router.GET("/api/towers", serveGeoJSONFile(path, "missing"))
	req := httptest.NewRequest(http.MethodGet, "/api/towers", nil)
	req.Header.Set("If-Modified-Since", "Wed, 15 Jul 2026 00:00:00 GMT")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/geo+json" {
		t.Fatalf("Content-Type = %q", contentType)
	}
	if cacheControl := recorder.Header().Get("Cache-Control"); cacheControl != "no-store" {
		t.Fatalf("Cache-Control = %q", cacheControl)
	}
}
