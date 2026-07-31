package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func TestCoverageSurfaceRouteReturnsCompactRasterAndGeoTIFF(t *testing.T) {
	gin.SetMode(gin.TestMode)
	runtime := newDatasetRuntime(&raytracer.DatasetPack{BuildingIndex: raytracer.EmptyBuildingIndex()}, nil, "")
	router := gin.New()
	registerCoverageSurfaceRoute(router, runtime)
	body := `{"tower_lon":32.85,"tower_lat":39.92,"radius_m":100,"frequency_ghz":2.6,"tx_power_dbm":43,"beam_width":360,"cell_size_m":25,"thresholds_dbm":[-100,-80]}`
	jsonResponse := httptest.NewRecorder()
	router.ServeHTTP(jsonResponse, httptest.NewRequest(http.MethodPost, "/api/coverage-surface", strings.NewReader(body)))
	if jsonResponse.Code != http.StatusOK || !strings.Contains(jsonResponse.Body.String(), `"grid"`) || !strings.Contains(jsonResponse.Body.String(), `"contours"`) {
		t.Fatalf("JSON surface = %d %s", jsonResponse.Code, jsonResponse.Body.String())
	}
	tiffResponse := httptest.NewRecorder()
	router.ServeHTTP(tiffResponse, httptest.NewRequest(http.MethodPost, "/api/coverage-surface?f=geotiff", strings.NewReader(body)))
	if tiffResponse.Code != http.StatusOK || tiffResponse.Header().Get("Content-Type") != "image/tiff" || !strings.HasPrefix(tiffResponse.Body.String(), "II") {
		t.Fatalf("TIFF surface = %d %q", tiffResponse.Code, tiffResponse.Header().Get("Content-Type"))
	}
}
