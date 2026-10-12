package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestStatusReflectsScenarioOverlay(t *testing.T) {
	state := &adapterState{scenario: "upf_degraded"}
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	recorder := httptest.NewRecorder()

	state.handleStatus(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, `"state":"scenario_running"`) {
		t.Fatalf("body = %s, want scenario_running", body)
	}
	if !strings.Contains(body, `"name":"UPF"`) || !strings.Contains(body, `"status":"degraded"`) {
		t.Fatalf("body = %s, want degraded UPF", body)
	}
}

func TestTopologyIncludesDirectXnFor5GNeighborPair(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	req := httptest.NewRequest(http.MethodGet, "/topology?network_tech=5g&cluster_tower_ids=101,102&cluster_tower_locations=101:32.8541:39.9208%3B102:32.8548:39.9211", nil)
	recorder := httptest.NewRecorder()

	state.handleTopology(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode topology: %v", err)
	}
	if !hasEdge(payload, "Xn-C", "direct_xn", "active") || !hasEdge(payload, "Xn-U", "direct_xn", "active") {
		t.Fatalf("payload = %s, want active direct Xn-C and Xn-U edges", recorder.Body.String())
	}
}

func TestTopologyUsesN2FallbackWhenXnUnavailable(t *testing.T) {
	state := &adapterState{scenario: "xn_unavailable"}
	req := httptest.NewRequest(http.MethodGet, "/topology?network_tech=5g&cluster_tower_ids=101,102", nil)
	recorder := httptest.NewRecorder()

	state.handleTopology(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode topology: %v", err)
	}
	if !hasEdge(payload, "N2", "ng_fallback", "down") {
		t.Fatalf("payload = %s, want down N2 fallback edge", recorder.Body.String())
	}
}

func TestUpfDegradedAffectsN3NotXnControl(t *testing.T) {
	state := &adapterState{scenario: "upf_degraded"}
	req := httptest.NewRequest(http.MethodGet, "/topology?network_tech=5g&cluster_tower_ids=101,102", nil)
	recorder := httptest.NewRecorder()

	state.handleTopology(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", recorder.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode topology: %v", err)
	}
	if !hasEdge(payload, "N3", "direct_core", "degraded") {
		t.Fatalf("payload = %s, want degraded N3 edge", recorder.Body.String())
	}
	if !hasEdge(payload, "Xn-C", "direct_xn", "active") {
		t.Fatalf("payload = %s, want active Xn-C control edge", recorder.Body.String())
	}
}

func TestTopologyRejectsTooManyTowerIDs(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	towerIDs := sequentialTowerIDs(maxClusterTowerIDs + 1)
	req := httptest.NewRequest(http.MethodGet, "/topology?network_tech=5g&cluster_tower_ids="+strings.Join(towerIDs, ","), nil)
	recorder := httptest.NewRecorder()

	state.handleTopology(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status code = %d, body = %s; want 400", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "no more than 64 IDs") {
		t.Fatalf("body = %s, want tower count error", recorder.Body.String())
	}
}

func TestTopologyRejectsOversizedTowerID(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	overlongID := strings.Repeat("a", policyMaxTowerIDBytes+1)
	req := httptest.NewRequest(http.MethodGet, "/topology?network_tech=5g&cluster_tower_ids="+overlongID, nil)
	recorder := httptest.NewRecorder()

	state.handleTopology(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status code = %d, body = %s; want 400", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "at most 128 bytes") {
		t.Fatalf("body = %s, want tower ID length error", recorder.Body.String())
	}
}

func TestSessionsDeduplicateTowerIDsBeforeAllocation(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	req := httptest.NewRequest(http.MethodGet, "/sessions?network_tech=5g&cluster_tower_ids=101,101,102", nil)
	recorder := httptest.NewRecorder()

	state.handleSessions(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, body = %s; want 200", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		SessionCount int `json:"session_count"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode sessions: %v", err)
	}
	if payload.SessionCount != 4 {
		t.Fatalf("session count = %d, want 4 for two unique towers", payload.SessionCount)
	}
}

func hasEdge(payload map[string]any, iface string, routeType string, status string) bool {
	edges, ok := payload["edges"].([]any)
	if !ok {
		return false
	}
	for _, item := range edges {
		edge, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if edge["interface"] == iface && edge["route_type"] == routeType && edge["status"] == status {
			return true
		}
	}
	return false
}

func TestScenarioRejectsUnknownScenario(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	req := httptest.NewRequest(http.MethodPost, "/scenario", strings.NewReader(`{"scenario":"unknown"}`))
	recorder := httptest.NewRecorder()

	state.handleScenario(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status code = %d, want 400", recorder.Code)
	}
}

func TestScenarioRejectsUnknownJSONField(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	req := httptest.NewRequest(http.MethodPost, "/scenario", strings.NewReader(`{"scenario":"normal","scenaro":"normal"}`))
	recorder := httptest.NewRecorder()

	state.handleScenario(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status code = %d, body = %s; want 400", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "scenaro") {
		t.Fatalf("body leaked rejected field name: %s", recorder.Body.String())
	}
}

func TestScenarioRejectsTooManyTowerIDsWithoutMutatingState(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	body, err := json.Marshal(scenarioRequest{
		Scenario:        "upf_degraded",
		ClusterTowerIDs: sequentialTowerIDs(maxClusterTowerIDs + 1),
	})
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/scenario", strings.NewReader(string(body)))
	recorder := httptest.NewRecorder()

	state.handleScenario(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status code = %d, body = %s; want 400", recorder.Code, recorder.Body.String())
	}
	if state.snapshot().scenario != "normal" {
		t.Fatalf("scenario changed to %q after rejected request", state.snapshot().scenario)
	}
}

func TestScenarioRejectsOversizedBody(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	body := `{"scenario":"upf_degraded","padding":"` + strings.Repeat("a", maxScenarioRequestBytes) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/scenario", strings.NewReader(body))
	recorder := httptest.NewRecorder()

	state.handleScenario(recorder, req)

	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status code = %d, body = %s; want 413", recorder.Code, recorder.Body.String())
	}
	if state.snapshot().scenario != "normal" {
		t.Fatalf("scenario changed to %q after oversized request", state.snapshot().scenario)
	}
}

func TestScenarioMutationRequiresConfiguredAPIKey(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	handler := requireAPIKey("", http.HandlerFunc(state.handleScenario))
	req := httptest.NewRequest(http.MethodPost, "/scenario", strings.NewReader(`{"scenario":"upf_degraded"}`))
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status code = %d, body = %s; want 503", recorder.Code, recorder.Body.String())
	}
	if state.snapshot().scenario != "normal" {
		t.Fatalf("scenario changed to %q after unauthenticated request", state.snapshot().scenario)
	}
}

func TestScenarioMutationRejectsInvalidAPIKey(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	handler := requireAPIKey("correct-key", http.HandlerFunc(state.handleScenario))
	req := httptest.NewRequest(http.MethodPost, "/scenario", strings.NewReader(`{"scenario":"upf_degraded"}`))
	req.Header.Set("X-API-Key", "wrong-key")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status code = %d, body = %s; want 401", recorder.Code, recorder.Body.String())
	}
	if state.snapshot().scenario != "normal" {
		t.Fatalf("scenario changed to %q after rejected request", state.snapshot().scenario)
	}
}

func TestScenarioMutationAcceptsBearerAPIKey(t *testing.T) {
	state := &adapterState{scenario: "normal"}
	handler := requireAPIKey("correct-key", http.HandlerFunc(state.handleScenario))
	req := httptest.NewRequest(http.MethodPost, "/scenario", strings.NewReader(`{"scenario":"upf_degraded"}`))
	req.Header.Set("Authorization", "Bearer correct-key")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status code = %d, body = %s; want 200", recorder.Code, recorder.Body.String())
	}
	if state.snapshot().scenario != "upf_degraded" {
		t.Fatalf("scenario = %q, want upf_degraded", state.snapshot().scenario)
	}
}

func TestProbeEmulatorSourceRejectsClientErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()
	t.Setenv("OPEN5GS_STATUS_URL", server.URL)
	t.Setenv("OPEN5GS_METRICS_URL", "")

	if source := probeEmulatorSource(); source != "disconnected" {
		t.Fatalf("source = %q, want disconnected for HTTP 401", source)
	}
}

func TestEmulatorSourceServesStaleCacheDuringRefresh(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(entered)
		<-release
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	t.Setenv("OPEN5GS_STATUS_URL", server.URL)
	t.Setenv("OPEN5GS_METRICS_URL", "")

	sourceProbeCache.Lock()
	sourceProbeCache.source = "open5gs"
	sourceProbeCache.expiresAt = time.Now().Add(-time.Second)
	sourceProbeCache.refreshing = false
	sourceProbeCache.Unlock()

	refreshed := make(chan string, 1)
	go func() { refreshed <- emulatorSource() }()
	<-entered
	started := time.Now()
	if source := emulatorSource(); source != "open5gs" {
		t.Fatalf("source = %q, want stale open5gs value", source)
	}
	if elapsed := time.Since(started); elapsed > 100*time.Millisecond {
		t.Fatalf("stale cache lookup took %s while refresh was in flight", elapsed)
	}
	close(release)
	if source := <-refreshed; source != "open5gs" {
		t.Fatalf("refreshed source = %q, want open5gs", source)
	}
}

func sequentialTowerIDs(count int) []string {
	towerIDs := make([]string, count)
	for index := range towerIDs {
		towerIDs[index] = strconv.Itoa(index + 1)
	}
	return towerIDs
}
