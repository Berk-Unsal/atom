package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

// These handler snapshots are also validated against OpenAPI by
// docs/validate_openapi_test.py. Comparing decoded JSON preserves field types
// without depending on object key order or formatting.
func TestOperationalResponseContractFixtures(t *testing.T) {
	data, err := os.ReadFile("testdata/operational-responses.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name      string          `json:"name"`
		Path      string          `json:"path"`
		Status    int             `json:"status"`
		Body      json.RawMessage `json:"body"`
		Readiness *struct {
			Buildings    bool   `json:"buildings"`
			Towers       bool   `json:"towers"`
			Frontend     bool   `json:"frontend"`
			DatasetError string `json:"dataset_error"`
		} `json:"readiness"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) == 0 {
		t.Fatal("no operational response fixtures")
	}
	gin.SetMode(gin.TestMode)
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			router := gin.New()
			switch fixture.Path {
			case "/readyz":
				if fixture.Readiness == nil {
					t.Fatal("missing readiness inputs")
				}
				input := fixture.Readiness
				router.GET("/readyz", readinessHandler(input.Buildings, input.Towers, input.Frontend, input.DatasetError))
			case "/api/processes/batch-experiment":
				// Discovery needs neither a running job manager nor a dataset.
				registerExperimentRoutes(router, nil, nil)
			default:
				t.Fatalf("unexpected fixture path %q", fixture.Path)
			}
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, fixture.Path, nil))
			if recorder.Code != fixture.Status {
				t.Fatalf("status = %d, want %d", recorder.Code, fixture.Status)
			}
			if got := recorder.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
				t.Fatalf("Content-Type = %q, want application/json; charset=utf-8", got)
			}
			var got, want any
			if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(fixture.Body, &want); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("response = %s, want %s", recorder.Body.Bytes(), fixture.Body)
			}
		})
	}
}
