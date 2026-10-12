package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
	"time"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func TestNetworkOptimizationDeadlineCancelsAndReleasesAdmission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := newRFRequestLimiter(1)
	router := gin.New()
	router.Use(protectExpensiveRFRoutes(limiter, 10*time.Millisecond, ""))
	registerNetworkOptimizationRoute(router, func() *raytracer.BuildingIndex { return raytracer.EmptyBuildingIndex() })
	router.POST("/api/evaluate-network", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	body := map[string]any{"towers": []map[string]any{
		{"id": "a", "tower_lon": 32.85, "tower_lat": 39.92, "azimuth": 90},
		{"id": "b", "tower_lon": 32.851, "tower_lat": 39.92, "azimuth": 90},
	}, "rays": 360, "radius_m": 1500, "frequency_ghz": 28, "tx_power_dbm": 30, "beam_width": 120,
		"optimization": map[string]any{"objectives": []map[string]any{{"id": "coverage", "weight": 100}}}}
	encoded, _ := json.Marshal(body)
	before := runtime.NumGoroutine()
	started := time.Now()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/optimize-network", bytes.NewReader(encoded))
	router.ServeHTTP(response, request)
	if response.Code != 504 || response.Body.String() != `{"error":"RF analysis exceeded its request deadline"}` {
		t.Fatalf("timeout produced partial/invalid response: %d %s", response.Code, response.Body)
	}
	if time.Since(started) > time.Second {
		t.Fatal("deadline failed to stop deep work promptly")
	}
	if response.Header().Get("RateLimit-Remaining") != "19" || len(limiter.slots) != 0 || limiter.clients["192.0.2.1"].active != 0 {
		t.Fatal("deadline changed accounting or leaked slot")
	}
	if after := runtime.NumGoroutine(); after > before {
		t.Fatalf("workers survived synchronous response: before=%d after=%d", before, after)
	}
	// A subsequent protected request proves cancellation released both slots.
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/evaluate-network", nil))
	if response.Code != http.StatusNoContent || response.Header().Get("RateLimit-Remaining") != "18" {
		t.Fatalf("slot not reusable: %d %s", response.Code, response.Body)
	}
}

func TestRFDeadlineDefaultConfigurationAndRouteOwnership(t *testing.T) {
	if defaultRFRequestTimeout != 60*time.Second {
		t.Fatal("interactive RF deadline changed")
	}
	for _, value := range []string{"", "invalid", "0", "-1", " 90 "} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("RF_REQUEST_TIMEOUT_SECONDS", value)
			seconds := envInt("RF_REQUEST_TIMEOUT_SECONDS", int(defaultRFRequestTimeout/time.Second))
			want := 60
			if value == " 90 " {
				want = 90
			}
			if seconds != want {
				t.Fatalf("seconds=%d want=%d", seconds, want)
			}
			for _, endpoint := range []string{"/api/simulate", "/api/evaluate-network", "/api/optimize-network", "/api/optimize-azimuth"} {
				router := gin.New()
				router.Use(protectExpensiveRFRoutes(newRFRequestLimiter(1), time.Duration(seconds)*time.Second, ""))
				router.POST(endpoint, func(c *gin.Context) {
					deadline, ok := c.Request.Context().Deadline()
					remaining := time.Until(deadline)
					if !ok || remaining > time.Duration(want)*time.Second || remaining < time.Duration(want)*time.Second-time.Second {
						t.Errorf("%s deadline=%v remaining=%s", endpoint, ok, remaining)
					}
					c.Status(204)
				})
				router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, endpoint, nil))
			}
		})
	}
}
