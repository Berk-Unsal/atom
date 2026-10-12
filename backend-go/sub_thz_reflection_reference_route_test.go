package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

func TestSubTHZReflectionReferenceRouteReturnsIsolatedLedger(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	runtime := newDatasetRuntime(&raytracer.DatasetPack{BuildingIndex: raytracer.EmptyBuildingIndex()}, nil, "")
	registerSubTHZReflectionReferenceRoute(router, runtime)
	payload := map[string]any{
		"schema_version": 1, "frequency_ghz": 140, "coordinate_frame": map[string]any{"mode": "local_enu"},
		"tx": map[string]any{"position": map[string]any{"x": 50, "y": -50, "z": 10}, "antenna": map[string]any{"mode": "isotropic", "absolute_gain_dbi": 0}},
		"rx": map[string]any{"position": map[string]any{"x": 50, "y": 50, "z": 10}, "antenna": map[string]any{"mode": "isotropic", "absolute_gain_dbi": 0}},
		"facade": map[string]any{
			"start": map[string]any{"x": 0, "y": -10, "z": 0}, "end": map[string]any{"x": 0, "y": 10, "z": 0}, "plane_point": map[string]any{"x": 0, "y": 0, "z": 0},
			"outward_normal": map[string]any{"x": 1, "y": 0, "z": 0}, "geometry_provenance": "controlled_reference_fixture", "normal_provenance": "user_declared", "height_provenance": "controlled_reference_fixture", "base_z": 0, "top_z": 20,
		},
		"material": map[string]any{
			"mode": "interface", "material_source": "user_defined", "user_material": map[string]any{"name": "epsilon 4", "property_source": "user_declared", "relative_permittivity": 4, "conductivity_s_per_m": 0},
			"incident_medium": map[string]any{"name": "air", "relative_permittivity": 1, "conductivity_s_per_m": 0, "property_source": "user_declared"},
			"exit_medium":     map[string]any{"name": "air", "relative_permittivity": 1, "conductivity_s_per_m": 0, "property_source": "user_declared"},
		},
		"polarization": "TE", "terrain": map[string]any{"mode": "flat_ground_relative_datum", "provenance": "controlled_reference_fixture"}, "link_budget": map[string]any{"pt_conducted_dbm": 30},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/sub-thz-reflection-reference", bytes.NewReader(body)))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var response raytracer.SpecularReflectionReferenceResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.ModelID != raytracer.SpecularReflectionReferenceModelID || response.Readiness != "reference_only" || response.Canonical || response.NetworkCoupled || response.MultipathCombined || response.LinkBudget.ReflectedPathReferencePowerDBm == nil {
		t.Fatalf("isolated response identity/boundary = %+v", response)
	}
	if response.Spreading.TwoLegFSPLComposition || response.DirectPathCalculated {
		t.Fatalf("composition boundary leaked: %s", recorder.Body.String())
	}
}

func TestSubTHZReflectionReferenceRouteRejectsGenericPolarization(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerSubTHZReflectionReferenceRoute(router, newDatasetRuntime(&raytracer.DatasetPack{BuildingIndex: raytracer.EmptyBuildingIndex()}, nil, ""))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/sub-thz-reflection-reference", strings.NewReader(`{"schema_version":1,"frequency_ghz":140,"polarization":"H"}`)))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestSubTHZReflectionReferenceRouteIsRFProtected(t *testing.T) {
	if _, protected := expensiveRFRoutes["/api/sub-thz-reflection-reference"]; !protected {
		t.Fatal("reflection reference route is missing RF protection")
	}
}
