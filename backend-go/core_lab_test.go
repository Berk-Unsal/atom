package main

import (
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

func TestEnvDurationMSUsesFallbackForInvalidValues(t *testing.T) {
	t.Setenv("CORE_LAB_TIMEOUT_MS", "-10")
	if got := envDurationMS("CORE_LAB_TIMEOUT_MS", time.Second); got != time.Second {
		t.Fatalf("duration = %s, want fallback", got)
	}
}
