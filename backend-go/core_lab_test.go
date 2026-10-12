package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestCoreLabStatusDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/api/core/status", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"state":"disabled"`) {
		t.Fatalf("body = %s, want disabled state", recorder.Body.String())
	}
}

func TestCoreLabStatusDisconnectedWhenAdapterUnreachable(t *testing.T) {
	t.Setenv("CORE_LAB_ENABLED", "true")
	t.Setenv("CORE_LAB_ADAPTER_URL", "http://127.0.0.1:1")
	t.Setenv("CORE_LAB_TIMEOUT_MS", "25")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/api/core/status", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"state":"disconnected"`) {
		t.Fatalf("body = %s, want disconnected state", recorder.Body.String())
	}
}

func TestCoreLabStatusRedactsAdapterResponseBody(t *testing.T) {
	adapter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "secret emulator diagnostic", http.StatusInternalServerError)
	}))
	defer adapter.Close()
	t.Setenv("CORE_LAB_ENABLED", "true")
	t.Setenv("CORE_LAB_ADAPTER_URL", adapter.URL)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/core/status", nil))

	if recorder.Code != http.StatusOK || strings.Contains(recorder.Body.String(), "secret emulator diagnostic") {
		t.Fatalf("status = %d, body = %s; want redacted disconnected response", recorder.Code, recorder.Body.String())
	}
}

func TestCoreLabScenarioRejectsUnknownScenario(t *testing.T) {
	t.Setenv("CORE_LAB_ENABLED", "false")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/api/core/scenario", strings.NewReader(`{"scenario":"fire_drill"}`))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status code = %d, want 400", recorder.Code)
	}
}

func TestCoreLabTopologyNotApplicableForNon5GContext(t *testing.T) {
	t.Setenv("CORE_LAB_ENABLED", "true")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/api/core/topology?network_tech=4g&cluster_tower_ids=1,2", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, `"state":"not_applicable"`) {
		t.Fatalf("body = %s, want not_applicable state", body)
	}
	if !strings.Contains(body, `"route_decisions":[]`) {
		t.Fatalf("body = %s, want empty route decisions", body)
	}
}

func TestCoreLabScenarioAllowsXnFallbackScenarios(t *testing.T) {
	t.Setenv("CORE_LAB_ENABLED", "false")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/api/core/scenario", strings.NewReader(`{"scenario":"xn_unavailable","network_tech":"5g"}`))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"scenario":"xn_unavailable"`) {
		t.Fatalf("body = %s, want xn_unavailable scenario", recorder.Body.String())
	}
}

func TestCoreLabScenarioRequiresConfiguredAPIKey(t *testing.T) {
	t.Setenv("CORE_LAB_ENABLED", "true")
	t.Setenv("CORE_LAB_API_KEY", "")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/api/core/scenario", strings.NewReader(`{"scenario":"normal","network_tech":"5g"}`))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status code = %d, body = %s; want 503", recorder.Code, recorder.Body.String())
	}
}

func TestCoreLabScenarioRejectsInvalidAPIKey(t *testing.T) {
	t.Setenv("CORE_LAB_ENABLED", "true")
	t.Setenv("CORE_LAB_API_KEY", "correct-key")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/api/core/scenario", strings.NewReader(`{"scenario":"normal","network_tech":"5g"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer wrong-key")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status code = %d, body = %s; want 401", recorder.Code, recorder.Body.String())
	}
}

func TestCoreLabScenarioForwardsConfiguredAPIKey(t *testing.T) {
	const apiKey = "correct-key"
	adapter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-API-Key"); got != apiKey {
			t.Errorf("X-API-Key = %q, want %q", got, apiKey)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read body: %v", err)
		}
		if !strings.Contains(string(body), `"scenario":"normal"`) {
			t.Errorf("body = %s, want normal scenario", string(body))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"state":"connected","scenario":"normal"}`))
	}))
	defer adapter.Close()

	t.Setenv("CORE_LAB_ENABLED", "true")
	t.Setenv("CORE_LAB_API_KEY", apiKey)
	t.Setenv("CORE_LAB_ADAPTER_URL", adapter.URL)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCoreLabRoutes(router)

	req := httptest.NewRequest(http.MethodPost, "/api/core/scenario", strings.NewReader(`{"scenario":"normal","network_tech":"5g"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, body = %s; want 200", recorder.Code, recorder.Body.String())
	}
}

func TestEnvDurationMSUsesFallbackForInvalidValues(t *testing.T) {
	t.Setenv("CORE_LAB_TIMEOUT_MS", "-10")
	if got := envDurationMS("CORE_LAB_TIMEOUT_MS", time.Second); got != time.Second {
		t.Fatalf("duration = %s, want fallback", got)
	}
}
