package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBuildingDownloadCachesByContentHashBeforeRateLimiting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	path := filepath.Join(t.TempDir(), "buildings.geojson")
	payload := `{"type":"FeatureCollection","features":[]}`
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	etag := strongETag("ABC123")
	cacheControl := buildingDatasetCacheControl(false)
	router := gin.New()
	router.GET(
		"/api/buildings",
		requireBuildingAPIKey(""),
		serveBuildingNotModified(etag, cacheControl),
		newRFRequestLimiterWithBudget(1, 1, 1).middlewareFor("building dataset download"),
		serveBuildingGeoJSON(path, etag, cacheControl),
	)

	first := httptest.NewRecorder()
	firstRequest := httptest.NewRequest(http.MethodGet, "/api/buildings", nil)
	firstRequest.RemoteAddr = "192.0.2.1:1000"
	router.ServeHTTP(first, firstRequest)
	if first.Code != http.StatusOK || first.Body.String() != payload {
		t.Fatalf("first response status = %d, body = %q", first.Code, first.Body.String())
	}
	if got := first.Header().Get("ETag"); got != `"abc123"` {
		t.Fatalf("ETag = %q", got)
	}
	if got := first.Header().Get("Cache-Control"); got != "public, max-age=3600, must-revalidate" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if got := first.Header().Get("Content-Type"); got != "application/geo+json" {
		t.Fatalf("Content-Type = %q", got)
	}

	cached := httptest.NewRecorder()
	cachedRequest := httptest.NewRequest(http.MethodGet, "/api/buildings", nil)
	cachedRequest.RemoteAddr = "192.0.2.1:1001"
	cachedRequest.Header.Set("If-None-Match", `W/"abc123"`)
	router.ServeHTTP(cached, cachedRequest)
	if cached.Code != http.StatusNotModified || cached.Body.Len() != 0 {
		t.Fatalf("cached response status = %d, body bytes = %d", cached.Code, cached.Body.Len())
	}
	if got := cached.Header().Get("RateLimit-Limit"); got != "" {
		t.Fatalf("conditional response unexpectedly consumed download budget: RateLimit-Limit = %q", got)
	}

	limited := httptest.NewRecorder()
	limitedRequest := httptest.NewRequest(http.MethodGet, "/api/buildings", nil)
	limitedRequest.RemoteAddr = "192.0.2.1:1002"
	router.ServeHTTP(limited, limitedRequest)
	if limited.Code != http.StatusTooManyRequests || !strings.Contains(limited.Body.String(), "budget exceeded") {
		t.Fatalf("limited response status = %d, body = %s", limited.Code, limited.Body.String())
	}
	if got := limited.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("limited Cache-Control = %q", got)
	}
}

func TestBuildingDownloadCanRequireAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	path := filepath.Join(t.TempDir(), "buildings.geojson")
	if err := os.WriteFile(path, []byte(`{"type":"FeatureCollection","features":[]}`), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	etag := strongETag("abc123")
	cacheControl := buildingDatasetCacheControl(true)
	router := gin.New()
	router.GET(
		"/api/buildings",
		requireBuildingAPIKey("correct-key"),
		serveBuildingNotModified(etag, cacheControl),
		newRFRequestLimiterWithBudget(1, 1, 2).middlewareFor("building dataset download"),
		serveBuildingGeoJSON(path, etag, cacheControl),
	)

	unauthorized := httptest.NewRecorder()
	unauthorizedRequest := httptest.NewRequest(http.MethodGet, "/api/buildings", nil)
	unauthorizedRequest.Header.Set("If-None-Match", etag)
	router.ServeHTTP(unauthorized, unauthorizedRequest)
	if unauthorized.Code != http.StatusUnauthorized || unauthorized.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unauthorized status = %d, Cache-Control = %q", unauthorized.Code, unauthorized.Header().Get("Cache-Control"))
	}

	authorized := httptest.NewRecorder()
	authorizedRequest := httptest.NewRequest(http.MethodGet, "/api/buildings", nil)
	authorizedRequest.Header.Set("X-API-Key", "correct-key")
	router.ServeHTTP(authorized, authorizedRequest)
	if authorized.Code != http.StatusOK {
		t.Fatalf("authorized status = %d, body = %s", authorized.Code, authorized.Body.String())
	}
	if got := authorized.Header().Get("Cache-Control"); got != "private, max-age=3600, must-revalidate" {
		t.Fatalf("Cache-Control = %q", got)
	}
}

func TestETagMatchesListsAndWildcard(t *testing.T) {
	etag := `"abc123"`
	tests := []struct {
		header string
		want   bool
	}{
		{header: etag, want: true},
		{header: `"other", W/"abc123"`, want: true},
		{header: "*", want: true},
		{header: `"other"`, want: false},
		{header: "", want: false},
	}
	for _, test := range tests {
		if got := etagMatches(test.header, etag); got != test.want {
			t.Errorf("etagMatches(%q, %q) = %t, want %t", test.header, etag, got, test.want)
		}
	}
}
