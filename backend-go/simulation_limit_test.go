package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

func TestSimulationValidationEnforcesCombinedFeatureBudget(t *testing.T) {
	base := raytracer.StaticSimulationRequest{
		TowerLon: 32.85, TowerLat: 39.92,
		FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
	}
	tests := []struct {
		name       string
		rays       int
		radius     float64
		wantError  bool
		wantDetail string
	}{
		{name: "frontend maximum", rays: 360, radius: 1500},
		{name: "exact feature limit", rays: 125, radius: 5000},
		{name: "one ray over at maximum radius", rays: 126, radius: 5000, wantError: true, wantDetail: "estimated 25200"},
		{name: "reported worst case", rays: 720, radius: 5000, wantError: true, wantDetail: "estimated 144000"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := base
			req.Rays = test.rays
			req.RadiusMeters = test.radius
			validationError := validateSimulationRequest(req)
			if !test.wantError && validationError != "" {
				t.Fatalf("validation error = %q", validationError)
			}
			if test.wantError && (!strings.Contains(validationError, "25000-feature") || !strings.Contains(validationError, test.wantDetail)) {
				t.Fatalf("validation error = %q", validationError)
			}
		})
	}
}

func TestNetworkValidationEnforcesPerSimulationFeatureBudget(t *testing.T) {
	req := raytracer.NetworkOptimizationRequest{
		Towers: []raytracer.NetworkTowerRequest{
			{ID: "one", TowerLon: 32.85, TowerLat: 39.92},
			{ID: "two", TowerLon: 32.86, TowerLat: 39.93},
		},
		Rays: 720, RadiusMeters: 5000,
		FrequencyGHz: 28, TxPowerDBm: 30, BeamWidthDeg: 120,
	}
	if validationError := validateNetworkOptimizationRequest(req); !strings.Contains(validationError, "25000-feature") {
		t.Fatalf("validation error = %q", validationError)
	}
}

func TestWriteRFResponseReportsActualFeatureOverflow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/overflow", func(c *gin.Context) {
		writeRFResponse(c, struct{}{}, raytracer.ErrSimulationFeatureLimit)
	})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/overflow", nil))
	if recorder.Code != http.StatusUnprocessableEntity || !strings.Contains(recorder.Body.String(), "25000-feature") {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}
