package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func TestPathProfileRouteReturnsInspectableProfile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	runtime := newDatasetRuntime(&raytracer.DatasetPack{
		BuildingIndex: raytracer.EmptyBuildingIndex(),
		TerrainMeta:   raytracer.TerrainMetadata{Available: false},
	}, nil, "")
	router := gin.New()
	registerPathProfileRoute(router, runtime)
	body := []byte(`{"transmitter":{"lon":32.85,"lat":39.92},"receiver":{"lon":32.851,"lat":39.92},"sample_spacing_m":10}`)
	request := httptest.NewRequest(http.MethodPost, "/api/path-profile", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, expected := range [][]byte{[]byte(`"classification"`), []byte(`"loss_budget"`), []byte(`"applicability"`), []byte(`"samples"`)} {
		if !bytes.Contains(response.Body.Bytes(), expected) {
			t.Fatalf("body missing %s: %s", expected, response.Body.String())
		}
	}
}
