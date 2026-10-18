package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func comparisonSide(towers int) map[string]any {
	list := make([]map[string]any, towers)
	for index := range list {
		list[index] = map[string]any{"id": string(rune('a' + index)), "tower_lon": 32.85 + float64(index)*0.001, "tower_lat": 39.92, "azimuth": 90}
	}
	return map[string]any{"towers": list, "rays": 72, "radius_m": 400, "frequency_ghz": 28, "tx_power_dbm": 30, "beam_width": 120}
}

func TestCompareNetworkRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		name   string
		body   map[string]any
		status int
		want   string
	}{
		{"valid pair", map[string]any{"a": comparisonSide(2), "b": comparisonSide(3)}, http.StatusOK, `"counts"`},
		{"invalid b", map[string]any{"a": comparisonSide(2), "b": comparisonSide(1)}, http.StatusBadRequest, "b: towers must contain between 2 and 8 selected towers"},
		{"invalid a reported first", map[string]any{"a": comparisonSide(9), "b": comparisonSide(1)}, http.StatusBadRequest, "a: towers must contain between 2 and 8 selected towers"},
		{"unknown field", map[string]any{"a": comparisonSide(2), "b": comparisonSide(2), "c": 1}, http.StatusBadRequest, "network comparison"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			registerNetworkComparisonRoute(router, func() *raytracer.BuildingIndex { return raytracer.EmptyBuildingIndex() })
			body, _ := json.Marshal(tc.body)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/compare-network", bytes.NewReader(body)))
			if response.Code != tc.status || !strings.Contains(response.Body.String(), tc.want) {
				t.Fatalf("response = %d %s, want %d containing %q", response.Code, response.Body, tc.status, tc.want)
			}
		})
	}
	if _, protected := expensiveRFRoutes["/api/compare-network"]; !protected {
		t.Fatal("compare-network must cost one protected RF request")
	}
}

// The OpenAPI comparison schema must list exactly the JSON fields the response serializes.
func TestOpenAPIDocumentsNetworkComparison(t *testing.T) {
	data, err := os.ReadFile("../docs/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	spec := string(data)
	if !strings.Contains(spec, "\n  /api/compare-network:\n") {
		t.Fatal("OpenAPI path /api/compare-network missing")
	}
	block := regexp.MustCompile(`(?ms)^    NetworkComparisonResponse:\n(.*?)\n    [A-Za-z]`).FindStringSubmatch(spec)
	if block == nil {
		t.Fatal("NetworkComparisonResponse schema missing")
	}
	documented := map[string]bool{}
	for _, match := range regexp.MustCompile(`(?m)^        ([a-z_]+):`).FindAllStringSubmatch(block[1], -1) {
		documented[match[1]] = true
	}
	serialized := map[string]bool{}
	fields := reflect.TypeOf(raytracer.NetworkComparisonResponse{})
	for index := 0; index < fields.NumField(); index++ {
		serialized[strings.Split(fields.Field(index).Tag.Get("json"), ",")[0]] = true
	}
	if !reflect.DeepEqual(documented, serialized) {
		t.Fatalf("documented %v, serialized %v", documented, serialized)
	}
}
