package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func TestBuildingFeatureRouteRequiresBoundedBBoxAndReturnsGeoJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	index := raytracer.NewBuildingIndex([]*raytracer.BuildingFootprint{{
		ID: "building-1", Tags: map[string]string{"building": "office"}, HeightMeters: 18, HeightSource: "height", Material: "glass",
		Bounds:   raytracer.Bounds{MinLon: 32.84, MinLat: 39.91, MaxLon: 32.85, MaxLat: 39.92},
		Vertices: []raytracer.Point{{Lon: 32.84, Lat: 39.91}, {Lon: 32.85, Lat: 39.91}, {Lon: 32.85, Lat: 39.92}, {Lon: 32.84, Lat: 39.92}, {Lon: 32.84, Lat: 39.91}},
	}})
	runtime := newDatasetRuntime(&raytracer.DatasetPack{
		Manifest: raytracer.DatasetManifest{Bounds: []float64{32.7, 39.8, 33, 40.1}}, BuildingIndex: index,
	}, nil, "")
	router := gin.New()
	registerBuildingFeatureRoutes(router, runtime)

	missing := httptest.NewRecorder()
	router.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/collections/buildings/items", nil))
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("missing bbox status = %d", missing.Code)
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/collections/buildings/items?bbox=32.83,39.90,32.86,39.93&limit=10", nil))
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/geo+json" {
		t.Fatalf("response = %d %q %s", response.Code, response.Header().Get("Content-Type"), response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"numberMatched":1`) || !strings.Contains(response.Body.String(), `"height_m":18`) {
		t.Fatalf("unexpected response: %s", response.Body.String())
	}
}

func TestBuildingFeatureRouteExportsCSV(t *testing.T) {
	gin.SetMode(gin.TestMode)
	index := raytracer.NewBuildingIndex([]*raytracer.BuildingFootprint{{
		ID: "b1", Tags: map[string]string{"building": "house"}, HeightMeters: 9, HeightSource: "default", Material: "unknown",
		Bounds:   raytracer.Bounds{MinLon: 32.84, MinLat: 39.91, MaxLon: 32.85, MaxLat: 39.92},
		Vertices: []raytracer.Point{{Lon: 32.84, Lat: 39.91}, {Lon: 32.85, Lat: 39.91}, {Lon: 32.85, Lat: 39.92}, {Lon: 32.84, Lat: 39.91}},
	}})
	runtime := newDatasetRuntime(&raytracer.DatasetPack{Manifest: raytracer.DatasetManifest{Bounds: []float64{32.7, 39.8, 33, 40.1}}, BuildingIndex: index}, nil, "")
	router := gin.New()
	registerBuildingFeatureRoutes(router, runtime)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/collections/buildings/items?bbox=32.83,39.90,32.86,39.93&f=csv", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Header().Get("Content-Type"), "text/csv") || !strings.Contains(response.Body.String(), "POLYGON") {
		t.Fatalf("CSV response = %d %q %s", response.Code, response.Header().Get("Content-Type"), response.Body.String())
	}
}

func TestBuildingFeatureRouteRejectsOversizedBBox(t *testing.T) {
	_, err := parseBuildingFeatureBBox("32,39,34,41")
	if err == nil || !strings.Contains(err.Error(), "must not exceed") {
		t.Fatalf("error = %v", err)
	}
}
