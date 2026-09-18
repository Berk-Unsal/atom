package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

func TestSubTHZReferenceRouteRequiresExplicitAtmosphereAndGeometry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	runtime := newDatasetRuntime(&raytracer.DatasetPack{BuildingIndex: raytracer.EmptyBuildingIndex()}, nil, "")
	registerSubTHZReferenceRoute(router, runtime)

	body := []byte(`{"frequency_ghz":140,"transmitter":{"lon":0,"lat":0,"height_m":25},"receiver":{"lon":0.000898311,"lat":0,"height_m":1.5}}`)
	req := httptest.NewRequest(http.MethodPost, "/api/sub-thz-reference", bytes.NewReader(body))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
}

func TestSubTHZReferenceRouteReturnsAuditableResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	runtime := newDatasetRuntime(&raytracer.DatasetPack{BuildingIndex: raytracer.EmptyBuildingIndex()}, nil, "")
	registerSubTHZReferenceRoute(router, runtime)

	payload := map[string]any{
		"frequency_ghz": 140,
		"transmitter":   map[string]any{"lon": 0, "lat": 0, "height_m": 25},
		"receiver":      map[string]any{"lon": 0.000898311, "lat": 0, "height_m": 1.5},
		"atmosphere":    map[string]any{"enabled": true, "pressure_hpa": 1013.25, "temperature_k": 288.15, "water_vapour_density_g_m3": 7.5},
		"rain":          map[string]any{"enabled": false},
		"local_fog":     map[string]any{"enabled": false},
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/sub-thz-reference", bytes.NewReader(encoded))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var response raytracer.SubTHZAtmosphericReferenceResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.ReferenceModelID != raytracer.SubTHZAtmosphericReferenceModelID || response.ExperimentFingerprint == "" {
		t.Fatalf("response identity = %q fingerprint=%q", response.ReferenceModelID, response.ExperimentFingerprint)
	}
	if response.Obstruction.DatasetAvailable || response.Obstruction.BuildingIntersectionPresent {
		t.Fatalf("empty dataset obstruction = %+v", response.Obstruction)
	}
	if response.Total.ReceiverThreshold || response.Total.CanonicalNetwork {
		t.Fatalf("canonical boundary leaked into response: %+v", response.Total)
	}
}

func TestP1411ReferenceRouteReturnsSideBySideCandidates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	runtime := newDatasetRuntime(&raytracer.DatasetPack{BuildingIndex: raytracer.EmptyBuildingIndex()}, nil, "")
	registerSubTHZP1411ReferenceRoute(router, runtime)

	payload := map[string]any{
		"frequency_ghz":    140,
		"transmitter":      map[string]any{"lon": 0, "lat": 0, "height_m": 25},
		"receiver":         map[string]any{"lon": 0, "lat": 0.000898311, "height_m": 1.5},
		"morphology":       "urban_high_rise",
		"rooftop_relation": "both_below_rooftop",
		"los_state":        "los",
		"provenance": map[string]any{
			"frequency_ghz": "user_declared", "distance_m": "geometry_derived", "tx_height_m": "user_declared", "rx_height_m": "user_declared",
			"morphology": "user_declared", "rooftop_relation": "user_declared", "los_state": "user_declared",
		},
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/sub-thz-p1411-reference", bytes.NewReader(encoded))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var response raytracer.P1411ReferenceResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.ReferenceModelID != raytracer.P1411ReferenceModelID || response.Revision != raytracer.P1411ReferenceRevision || len(response.Candidates) != 3 || len(response.ApplicableCandidates) != 1 || response.ApplicableCandidates[0] != "p1411_below_rooftop_los_v1" || response.Fingerprint == "" {
		t.Fatalf("P.1411 response identity/applicability = %+v", response)
	}
	if response.Candidates[0].P525Comparison.IncludedInP1411Median || response.Candidates[0].ExternalAtmosphericComposition.IncludedInP1411Median || response.Candidates[0].Model.WallLossDB != 0 {
		t.Fatalf("alternative terms crossed boundary: %+v", response.Candidates[0])
	}
}

func TestP1411ReferenceRouteRequiresExplicitOptionalComparisonInputs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	runtime := newDatasetRuntime(&raytracer.DatasetPack{BuildingIndex: raytracer.EmptyBuildingIndex()}, nil, "")
	registerSubTHZP1411ReferenceRoute(router, runtime)

	body := []byte(`{"frequency_ghz":140,"transmitter":{"lon":0,"lat":0,"height_m":25},"receiver":{"lon":0,"lat":0.000898311,"height_m":1.5},"morphology":"urban_high_rise","rooftop_relation":"both_below_rooftop","los_state":"los","provenance":{"morphology":"user_declared","rooftop_relation":"user_declared","los_state":"user_declared"},"atmospheric_reference":{"frequency_ghz":140,"transmitter":{"lon":0,"lat":0,"height_m":25},"receiver":{"lon":0,"lat":0.000898311,"height_m":1.5},"atmosphere":{"enabled":true,"pressure_hpa":1013.25,"temperature_k":288.15,"water_vapour_density_g_m3":7.5},"rain":{"enabled":true},"local_fog":{"enabled":false}}}`)
	req := httptest.NewRequest(http.MethodPost, "/api/sub-thz-p1411-reference", bytes.NewReader(body))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
}
