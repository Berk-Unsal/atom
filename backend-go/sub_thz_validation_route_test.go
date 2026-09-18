package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSubTHZValidationRouteIsolatedContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerSubTHZValidationRoute(router)
	body := `{"schema_version":1,"operation":"compare_models","model_ids":["p525_fspl"],"campaigns":[{"schema_version":1,"campaign_id":"route-campaign","frequency_range_ghz":{"min_ghz":140,"max_ghz":140},"provenance":{"source_type":"synthetic_controlled"},"measurements":[{"measurement_id":"m-1","frequency_ghz":140,"measurement_quantity":"path_loss","measured_path_loss_db":101.39094384872776,"antenna_gain_embedded":true,"cable_loss_embedded":true,"calibration_applied":true,"directionality":"synthesized_omnidirectional","antenna_comparison_basis":"synthesized_omnidirectional_path_loss","geometry":{"direct_3d_distance_m":20}}]}]}`
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sub-thz-validation", strings.NewReader(body)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "validation-") {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}

	invalid := strings.Replace(body, `"direct_3d_distance_m":20`, `"direct_3d_distance_m":0`, 1)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sub-thz-validation", strings.NewReader(invalid)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid campaign status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestSubTHZValidationRouteIsRFProtected(t *testing.T) {
	if _, protected := expensiveRFRoutes["/api/sub-thz-validation"]; !protected {
		t.Fatal("measurement validation route is missing RF protection")
	}
}
