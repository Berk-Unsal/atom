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

func TestOptimizeNetworkRejectsAnInvalidAreaOfInterestBeforeRF(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		name string
		aoi  any
		want string
	}{
		{"two points", [][]float64{{32.84, 39.91}, {32.86, 39.91}}, "aoi must contain at least 3 coordinates"},
		{"out of range", [][]float64{{32.84, 39.91}, {32.86, 95}, {32.85, 39.93}}, "aoi contains an invalid coordinate"},
		{"malformed", [][]float64{{32.84, 39.91}, {32.86}, {32.85, 39.93}}, "aoi contains an invalid coordinate"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			registerNetworkOptimizationRoute(router, func() *raytracer.BuildingIndex { return raytracer.EmptyBuildingIndex() })
			body, _ := json.Marshal(map[string]any{
				"towers": []map[string]any{
					{"id": "a", "tower_lon": 32.85, "tower_lat": 39.92, "azimuth": 90},
					{"id": "b", "tower_lon": 32.851, "tower_lat": 39.92, "azimuth": 270},
				},
				"rays": 72, "radius_m": 400, "frequency_ghz": 28, "tx_power_dbm": 30, "beam_width": 120,
				"optimization": map[string]any{"objectives": []map[string]any{{"id": "coverage", "weight": 100}}},
				"aoi":          tc.aoi,
			})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/optimize-network", bytes.NewReader(body)))
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), tc.want) {
				t.Fatalf("response = %d %s, want 400 %q", response.Code, response.Body, tc.want)
			}
		})
	}
}

// The OpenAPI schema must list exactly the JSON fields AreaOfInterestStats serializes.
func TestOpenAPIDocumentsAreaOfInterest(t *testing.T) {
	data, err := os.ReadFile("../docs/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	spec := string(data)
	block := regexp.MustCompile(`(?ms)^    AreaOfInterestStats:\n(.*?)\n    [A-Za-z]`).FindStringSubmatch(spec)
	if block == nil {
		t.Fatal("AreaOfInterestStats schema missing")
	}
	documented := map[string]bool{}
	for _, match := range regexp.MustCompile(`(?m)^        ([a-z_]+): \{`).FindAllStringSubmatch(block[1], -1) {
		documented[match[1]] = true
	}
	serialized := map[string]bool{}
	fields := reflect.TypeOf(raytracer.AreaOfInterestStats{})
	for index := 0; index < fields.NumField(); index++ {
		serialized[strings.Split(fields.Field(index).Tag.Get("json"), ",")[0]] = true
	}
	if !reflect.DeepEqual(documented, serialized) {
		t.Fatalf("documented %v, serialized %v", documented, serialized)
	}
	for _, needle := range []string{"        area_of_interest: { $ref: \"#/components/schemas/AreaOfInterestStats\" }", "            aoi:\n"} {
		if !strings.Contains(spec, needle) {
			t.Fatalf("OpenAPI missing %q", needle)
		}
	}
}
