package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSubTHZMaterialReferenceRouteIsolatedContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerSubTHZMaterialReferenceRoute(router)
	body := `{"schema_version":1,"frequency_ghz":140,"material_source":"p2040_reference","material_id":"glass_100_400","thickness_m":0.01,"thickness_provenance":"controlled_reference_fixture","incidence_angle_deg":0,"polarization":"TE","incident_medium":{"name":"air","relative_permittivity":1,"conductivity_s_per_m":0,"property_source":"user_declared"},"exit_medium":{"name":"air","relative_permittivity":1,"conductivity_s_per_m":0,"property_source":"user_declared"}}`
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sub-thz-material-reference", strings.NewReader(body)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "p2040_material_slab_reference_v1") || !strings.Contains(response.Body.String(), "reference_material") {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}

	invalid := strings.Replace(body, `"polarization":"TE"`, `"polarization":"horizontal"`, 1)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sub-thz-material-reference", strings.NewReader(invalid)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid polarization status=%d body=%s", response.Code, response.Body.String())
	}

	missingThickness := strings.Replace(body, `,"thickness_m":0.01`, "", 1)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sub-thz-material-reference", strings.NewReader(missingThickness)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "thickness_m") {
		t.Fatalf("missing thickness status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestSubTHZMaterialReferenceOutOfRangeIsAuditable200(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerSubTHZMaterialReferenceRoute(router)
	body := `{"schema_version":1,"frequency_ghz":60,"material_source":"p2040_reference","material_id":"brick_1_40","thickness_m":0.2,"incidence_angle_deg":0,"polarization":"TE","incident_medium":{"name":"air","relative_permittivity":1,"property_source":"user_declared"},"exit_medium":{"name":"air","relative_permittivity":1,"property_source":"user_declared"}}`
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sub-thz-material-reference", strings.NewReader(body)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "material_frequency_out_of_range") || strings.Contains(response.Body.String(), "\"ledger\"") {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestSubTHZMaterialReferenceRouteIsRFProtected(t *testing.T) {
	if _, protected := expensiveRFRoutes["/api/sub-thz-material-reference"]; !protected {
		t.Fatal("material reference route is missing RF protection")
	}
}
