package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func TestSpatialEvidenceRoutesAreDiagnosticOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pack, err := raytracer.LoadDatasetPack(filepath.Join("raytracer", "testdata", "sample-pack"))
	if err != nil {
		t.Fatalf("load sample pack: %v", err)
	}
	runtime := newDatasetRuntime(pack, nil, "")
	router := gin.New()
	registerSpatialEvidenceRoutes(router, runtime)

	request := httptest.NewRequest(http.MethodGet, "/api/spatial-evidence", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"canonical_activation":"diagnostic_only_not_active"`)) {
		t.Fatalf("summary response = %d %s", response.Code, response.Body.String())
	}

	buildingID := pack.BuildingIndex.Footprints()[0].ID
	request = httptest.NewRequest(http.MethodGet, "/api/spatial-evidence/buildings/"+buildingID, nil)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"canonical_activation":"diagnostic_only_not_active"`)) {
		t.Fatalf("building response = %d %s", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodPost, "/api/spatial-evidence/path-profile", bytes.NewBufferString(`{"transmitter":{"lon":32.85,"lat":39.92},"receiver":{"lon":32.851,"lat":39.92},"requested_spacing_m":10}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"status":"unavailable"`)) {
		t.Fatalf("path response = %d %s", response.Code, response.Body.String())
	}
}
