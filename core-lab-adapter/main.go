package main

import (
	"encoding/json"
	"errors"
	"hash/fnv"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	maxEvents               = 80
	maxClusterTowerIDs      = 64
	maxTowerIDBytes         = 128
	maxScenarioRequestBytes = 64 << 10
)

var functionNames = []string{"NRF", "AMF", "SMF", "UPF", "UDM", "UDR", "AUSF", "PCF", "NSSF"}

var sourceProbeCache struct {
	sync.Mutex
	expiresAt time.Time
	source    string
}

type adapterState struct {
	mu        sync.RWMutex
	scenario  string
	events    []coreEvent
	startedAt time.Time
}

type coreFunction struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	LatencyMS int    `json:"latency_ms"`
	LoadPct   int    `json:"load_pct"`
	Message   string `json:"message"`
}

type coreEvent struct {
	ID        string `json:"id"`
	Stage     string `json:"stage"`
	Severity  string `json:"severity"`
	Message   string `json:"message"`
	Source    string `json:"source"`
	Timestamp string `json:"timestamp"`
}

type scenarioRequest struct {
	Scenario        string   `json:"scenario"`
	ClusterTowerIDs []string `json:"cluster_tower_ids"`
	NetworkTech     string   `json:"network_tech"`
}

type topologyPoint struct {
	Lon float64
	Lat float64
}

func main() {
	state := &adapterState{
		scenario:  "normal",
		startedAt: time.Now().UTC(),
	}
	state.seedEvents("normal", nil)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})
	mux.HandleFunc("/status", state.handleStatus)
	mux.HandleFunc("/topology", state.handleTopology)
	mux.HandleFunc("/sessions", state.handleSessions)
	mux.HandleFunc("/events", state.handleEvents)
	mux.HandleFunc("/scenario", state.handleScenario)

	addr := ":" + getenv("PORT", "8090")
	log.Printf("A.T.O.M Core Lab adapter listening on %s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("run adapter: %v", err)
	}
}

func (state *adapterState) handleStatus(w http.ResponseWriter, _ *http.Request) {
	snapshot := state.snapshot()
	mode := getenv("CORE_LAB_MODE", "open5gs")
	source := emulatorSource()
	functions := buildFunctions(snapshot.scenario, source)
	labState := "connected"
	if source == "disconnected" {
		labState = "disconnected"
	}
	if snapshot.scenario != "normal" && labState == "connected" {
		labState = "scenario_running"
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"mode":       mode,
		"state":      labState,
		"source":     source,
		"scenario":   snapshot.scenario,
		"functions":  functions,
		"message":    statusMessage(snapshot.scenario, source),
		"updated_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func (state *adapterState) handleTopology(w http.ResponseWriter, r *http.Request) {
	snapshot := state.snapshot()
	networkTech := strings.TrimSpace(r.URL.Query().Get("network_tech"))
	if !is5GNetworkTech(networkTech) {
		writeJSON(w, http.StatusOK, map[string]any{
			"mode":            "not_applicable",
			"state":           "not_applicable",
			"message":         "5G Core Lab applies only to 5G mmWave.",
			"nodes":           []map[string]any{},
			"edges":           []map[string]any{},
			"route_decisions": []map[string]any{},
		})
		return
	}
	towers, validationError := parseTowerIDs(r.URL.Query().Get("cluster_tower_ids"))
	if validationError != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": validationError})
		return
	}
	towerLocations := parseTowerLocations(r.URL.Query().Get("cluster_tower_locations"), towers)
	nodes := make([]map[string]any, 0, len(functionNames)+len(towers))
	edges := make([]map[string]any, 0, 16+len(towers)*4)
	routeDecisions := make([]map[string]any, 0, len(towers))
	for _, towerID := range towers {
		gnbID := "gNB-" + towerID
		nodes = append(nodes, map[string]any{"id": gnbID, "type": "gNB", "status": "mapped", "tower_id": towerID})
		n3Status := "active"
		n3Reason := "PDU session user-plane traffic anchored on UPF"
		if snapshot.scenario == "upf_degraded" {
			n3Status = "degraded"
			n3Reason = "UPF degraded; user-plane session traffic is impaired"
		}
		edges = append(edges,
			topologyEdge(gnbID, "AMF", "N2", "control", "active", "ng_fallback", "gNB control-plane signaling to AMF"),
			topologyEdge(gnbID, "UPF", "N3", "user", n3Status, "direct_core", n3Reason),
		)
	}
	for index := 0; index < len(towers)-1; index++ {
		from := "gNB-" + towers[index]
		to := "gNB-" + towers[index+1]
		routeType, status, reason := routeDecisionForPair(towers[index], towers[index+1], towerLocations, snapshot.scenario)
		routeDecisions = append(routeDecisions, map[string]any{
			"from":       from,
			"to":         to,
			"route_type": routeType,
			"status":     status,
			"reason":     reason,
		})
		if routeType == "direct_xn" {
			edges = append(edges,
				topologyEdge(from, to, "Xn-C", "control", status, routeType, reason),
				topologyEdge(from, to, "Xn-U", "user", status, routeType, "handover forwarding user plane over direct Xn"),
			)
			continue
		}
		if routeType == "ng_fallback" {
			edges = append(edges,
				topologyEdge(from, "AMF", "N2", "control", status, routeType, reason),
				topologyEdge("AMF", to, "N2", "control", status, routeType, "AMF forwards coordination when direct Xn is unavailable"),
			)
			continue
		}
		edges = append(edges, topologyEdge(from, to, "Xn-C", "control", "down", routeType, reason))
	}
	for _, fn := range buildFunctions(snapshot.scenario, emulatorSource()) {
		nodes = append(nodes, map[string]any{"id": fn.Name, "type": "core_function", "status": fn.Status})
	}
	edges = append(edges,
		topologyEdge("AMF", "AUSF", "Nausf", "control", "active", "core_service", "authentication service discovery"),
		topologyEdge("AUSF", "UDM", "Nudm", "control", coreInterfaceStatus(snapshot.scenario, "UDM"), "core_service", "subscriber data lookup"),
		topologyEdge("AMF", "SMF", "Nsmf", "control", "active", "core_service", "session management selection"),
		topologyEdge("SMF", "UPF", "N4", "control", coreInterfaceStatus(snapshot.scenario, "UPF"), "core_service", "UPF session control"),
		topologyEdge("SMF", "PCF", "Npcf", "control", coreInterfaceStatus(snapshot.scenario, "PCF"), "core_service", "policy lookup"),
		topologyEdge("SMF", "UDM", "Nudm", "control", coreInterfaceStatus(snapshot.scenario, "UDM"), "core_service", "subscriber session data lookup"),
		topologyEdge("AMF", "NRF", "Nnrf", "control", "active", "core_service", "network function discovery"),
	)
	writeJSON(w, http.StatusOK, map[string]any{
		"state":           "connected",
		"network_tech":    "5g",
		"scenario":        snapshot.scenario,
		"nodes":           nodes,
		"edges":           edges,
		"route_decisions": routeDecisions,
	})
}

func (state *adapterState) handleSessions(w http.ResponseWriter, r *http.Request) {
	snapshot := state.snapshot()
	if !is5GNetworkTech(r.URL.Query().Get("network_tech")) {
		writeJSON(w, http.StatusOK, map[string]any{
			"state":         "not_applicable",
			"message":       "5G Core Lab applies only to 5G mmWave.",
			"sessions":      []map[string]any{},
			"session_count": 0,
		})
		return
	}
	towers, validationError := parseTowerIDs(r.URL.Query().Get("cluster_tower_ids"))
	if validationError != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": validationError})
		return
	}
	if len(towers) == 0 {
		towers = []string{"unmapped"}
	}
	sessions := make([]map[string]any, 0, len(towers)*2)
	for index, towerID := range towers {
		count := 2
		if snapshot.scenario == "registration_storm" {
			count = 6
		}
		if snapshot.scenario == "udm_outage" || snapshot.scenario == "ausf_auth_failure" {
			count = 0
		}
		for sessionIndex := 0; sessionIndex < count; sessionIndex++ {
			sessions = append(sessions, map[string]any{
				"id":         "ue-" + towerID + "-" + strconvLike(index+1) + strconvLike(sessionIndex+1),
				"gNB":        "gNB-" + towerID,
				"slice":      "sst-1/sd-010203",
				"status":     sessionStatus(snapshot.scenario),
				"latency_ms": 12 + index*3 + sessionIndex,
				"throughput": throughputForScenario(snapshot.scenario),
				"scenario":   snapshot.scenario,
				"updated_at": time.Now().UTC().Format(time.RFC3339),
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"state":         "connected",
		"sessions":      sessions,
		"session_count": len(sessions),
	})
}

func (state *adapterState) handleEvents(w http.ResponseWriter, _ *http.Request) {
	snapshot := state.snapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"state":  "connected",
		"events": snapshot.events,
	})
}

func (state *adapterState) handleScenario(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var req scenarioRequest
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxScenarioRequestBytes))
	if err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "scenario request body is too large"})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "could not read request"})
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid scenario JSON"})
		return
	}
	if !isAllowedScenario(req.Scenario) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown scenario: " + req.Scenario})
		return
	}
	towers, validationError := normalizeTowerIDs(req.ClusterTowerIDs)
	if validationError != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": validationError})
		return
	}
	req.ClusterTowerIDs = towers
	state.mu.Lock()
	state.scenario = req.Scenario
	state.seedEventsLocked(req.Scenario, req.ClusterTowerIDs)
	state.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"mode":              getenv("CORE_LAB_MODE", "open5gs"),
		"state":             scenarioState(req.Scenario),
		"source":            emulatorSource(),
		"scenario":          req.Scenario,
		"cluster_tower_ids": req.ClusterTowerIDs,
		"updated_at":        time.Now().UTC().Format(time.RFC3339),
	})
}

type stateSnapshot struct {
	scenario string
	events   []coreEvent
}

func (state *adapterState) snapshot() stateSnapshot {
	state.mu.RLock()
	defer state.mu.RUnlock()
	events := append([]coreEvent(nil), state.events...)
	return stateSnapshot{scenario: state.scenario, events: events}
}

func (state *adapterState) seedEvents(scenario string, towers []string) {
	state.mu.Lock()
	defer state.mu.Unlock()
	state.seedEventsLocked(scenario, towers)
}

func (state *adapterState) seedEventsLocked(scenario string, towers []string) {
	now := time.Now().UTC()
	if len(towers) == 0 {
		towers = []string{"lab"}
	}
	events := []coreEvent{
		newEvent(now.Add(-18*time.Second), "registration", "info", "gNB context accepted by AMF", "AMF"),
		newEvent(now.Add(-14*time.Second), "authentication", "info", "AUSF requested UDM authentication vector", "AUSF"),
		newEvent(now.Add(-9*time.Second), "policy", "info", "PCF returned default data policy", "PCF"),
		newEvent(now.Add(-4*time.Second), "session", "info", "SMF established PDU session and selected UPF", "SMF"),
	}
	switch scenario {
	case "registration_storm":
		events = append(events, newEvent(now, "registration", "warning", "registration burst detected across selected gNBs", "AMF"))
	case "udm_outage":
		events = append(events, newEvent(now, "authentication", "critical", "UDM unavailable; authentication vectors cannot be issued", "UDM"))
	case "ausf_auth_failure":
		events = append(events, newEvent(now, "authentication", "critical", "AUSF rejecting UE authentication requests", "AUSF"))
	case "pcf_policy_degraded":
		events = append(events, newEvent(now, "policy", "warning", "PCF policy latency elevated; default policy fallback active", "PCF"))
	case "upf_degraded":
		events = append(events, newEvent(now, "user-plane", "critical", "UPF packet forwarding degraded for selected cluster", "UPF"))
	case "xn_degraded":
		events = append(events, newEvent(now, "handover", "warning", "Xn degraded; AMF/N2 fallback selected for neighbor coordination", "AMF"))
	case "xn_unavailable":
		events = append(events, newEvent(now, "handover", "critical", "Xn unavailable; handover coordination routed through AMF/N2", "AMF"))
	default:
		events = append(events, newEvent(now, "normal", "info", "Core Lab returned to normal scenario", "NRF"))
	}
	for index, tower := range towers {
		events = append(events, newEvent(now.Add(deterministicEventOffset(scenario, tower, index)), "gNB-map", "info", "Mapped virtual gNB-"+tower+" to selected A.T.O.M tower", "adapter"))
	}
	sort.Slice(events, func(i, j int) bool {
		return events[i].Timestamp > events[j].Timestamp
	})
	if len(events) > maxEvents {
		events = events[:maxEvents]
	}
	state.events = events
}

func buildFunctions(scenario string, source string) []coreFunction {
	functions := make([]coreFunction, 0, len(functionNames))
	for index, name := range functionNames {
		fn := coreFunction{
			Name:      name,
			Status:    "healthy",
			LatencyMS: 8 + index*3,
			LoadPct:   22 + index*4,
			Message:   "nominal",
		}
		if source == "disconnected" {
			fn.Status = "unknown"
			fn.LatencyMS = 0
			fn.LoadPct = 0
			fn.Message = "Open5GS endpoint unavailable"
		}
		applyScenario(&fn, scenario)
		functions = append(functions, fn)
	}
	return functions
}

func applyScenario(fn *coreFunction, scenario string) {
	switch scenario {
	case "registration_storm":
		if fn.Name == "AMF" || fn.Name == "NRF" {
			fn.Status = "degraded"
			fn.LoadPct = 88
			fn.LatencyMS += 45
			fn.Message = "registration burst pressure"
		}
	case "udm_outage":
		if fn.Name == "UDM" || fn.Name == "UDR" {
			fn.Status = "down"
			fn.LoadPct = 0
			fn.LatencyMS = 0
			fn.Message = "subscriber data unavailable"
		}
		if fn.Name == "AUSF" {
			fn.Status = "degraded"
			fn.Message = "authentication vector lookup failing"
		}
	case "ausf_auth_failure":
		if fn.Name == "AUSF" {
			fn.Status = "down"
			fn.LoadPct = 0
			fn.LatencyMS = 0
			fn.Message = "authentication service rejecting requests"
		}
	case "pcf_policy_degraded":
		if fn.Name == "PCF" {
			fn.Status = "degraded"
			fn.LoadPct = 76
			fn.LatencyMS += 80
			fn.Message = "policy response latency elevated"
		}
	case "upf_degraded":
		if fn.Name == "UPF" {
			fn.Status = "degraded"
			fn.LoadPct = 91
			fn.LatencyMS += 110
			fn.Message = "user-plane forwarding degraded"
		}
	case "xn_degraded":
		if fn.Name == "AMF" {
			fn.Status = "degraded"
			fn.LoadPct = 70
			fn.LatencyMS += 32
			fn.Message = "handling N2 fallback coordination"
		}
	case "xn_unavailable":
		if fn.Name == "AMF" {
			fn.Status = "degraded"
			fn.LoadPct = 82
			fn.LatencyMS += 58
			fn.Message = "Xn unavailable; N2 fallback active"
		}
	}
}

func emulatorSource() string {
	sourceProbeCache.Lock()
	defer sourceProbeCache.Unlock()
	if time.Now().Before(sourceProbeCache.expiresAt) && sourceProbeCache.source != "" {
		return sourceProbeCache.source
	}
	source := probeEmulatorSource()
	sourceProbeCache.source = source
	sourceProbeCache.expiresAt = time.Now().Add(3 * time.Second)
	return source
}

func probeEmulatorSource() string {
	statusURL := strings.TrimSpace(os.Getenv("OPEN5GS_STATUS_URL"))
	metricsURL := strings.TrimSpace(os.Getenv("OPEN5GS_METRICS_URL"))
	if statusURL == "" && metricsURL == "" {
		return "simulated_overlay"
	}
	client := http.Client{Timeout: 800 * time.Millisecond}
	for _, candidate := range []string{statusURL, metricsURL} {
		if candidate == "" {
			continue
		}
		response, err := client.Get(candidate)
		if err == nil && response.Body != nil {
			io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
			response.Body.Close()
		}
		if err == nil && response.StatusCode >= 200 && response.StatusCode < 500 {
			return "open5gs"
		}
	}
	return "disconnected"
}

func deterministicEventOffset(scenario string, towerID string, index int) time.Duration {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(scenario + "\x00" + towerID + "\x00" + strconv.Itoa(index)))
	return time.Duration(hash.Sum32()%1200) * time.Millisecond
}

func statusMessage(scenario string, source string) string {
	if source == "disconnected" {
		return "Core Lab adapter is running, but Open5GS endpoints are unreachable."
	}
	if source == "simulated_overlay" {
		return "Adapter is running without Open5GS endpoint configuration; scenario effects are simulated overlays."
	}
	if scenario != "normal" {
		return "Core Lab scenario is active."
	}
	return "Open5GS lab endpoints are reachable."
}

func newEvent(ts time.Time, stage string, severity string, message string, source string) coreEvent {
	return coreEvent{
		ID:        strings.ReplaceAll(ts.Format("150405.000"), ".", "") + "-" + stage,
		Stage:     stage,
		Severity:  severity,
		Message:   message,
		Source:    source,
		Timestamp: ts.UTC().Format(time.RFC3339Nano),
	}
}

func sessionStatus(scenario string) string {
	switch scenario {
	case "upf_degraded":
		return "degraded"
	case "udm_outage", "ausf_auth_failure":
		return "failed"
	default:
		return "active"
	}
}

func throughputForScenario(scenario string) string {
	if scenario == "upf_degraded" {
		return "reduced"
	}
	return "nominal"
}

func topologyEdge(from string, to string, iface string, plane string, status string, routeType string, reason string) map[string]any {
	return map[string]any{
		"from":       from,
		"to":         to,
		"interface":  iface,
		"plane":      plane,
		"status":     status,
		"route_type": routeType,
		"reason":     reason,
	}
}

func coreInterfaceStatus(scenario string, name string) string {
	switch scenario {
	case "upf_degraded":
		if name == "UPF" {
			return "degraded"
		}
	case "udm_outage":
		if name == "UDM" {
			return "down"
		}
	case "pcf_policy_degraded":
		if name == "PCF" {
			return "degraded"
		}
	}
	return "active"
}

func routeDecisionForPair(left string, right string, locations map[string]topologyPoint, scenario string) (string, string, string) {
	if scenario == "xn_unavailable" {
		return "ng_fallback", "down", "Xn unavailable; handover coordination falls back to AMF over N2"
	}
	if scenario == "xn_degraded" {
		return "ng_fallback", "degraded", "Xn degraded; AMF/N2 fallback selected for reliability"
	}
	if len(locations) > 0 {
		leftLocation, leftOK := locations[left]
		rightLocation, rightOK := locations[right]
		if leftOK && rightOK {
			distanceMeters := approximateDistanceMeters(leftLocation, rightLocation)
			if distanceMeters > 1200 {
				return "ng_fallback", "degraded", "selected gNB distance exceeds Xn neighbor threshold"
			}
			return "direct_xn", "active", "selected 5G gNBs are within Xn neighbor distance"
		}
	}
	return "direct_xn", "active", "selected 5G gNBs are adjacent in the planning cluster"
}

func approximateDistanceMeters(left topologyPoint, right topologyPoint) float64 {
	const metersPerDegreeLat = 111320.0
	avgLatRadians := ((left.Lat + right.Lat) / 2) * math.Pi / 180
	dx := (left.Lon - right.Lon) * metersPerDegreeLat * math.Cos(avgLatRadians)
	dy := (left.Lat - right.Lat) * metersPerDegreeLat
	return math.Hypot(dx, dy)
}

func scenarioState(scenario string) string {
	if scenario == "normal" {
		return "connected"
	}
	return "scenario_running"
}

func parseTowerIDs(raw string) ([]string, string) {
	if strings.TrimSpace(raw) == "" {
		return nil, ""
	}
	towers := make([]string, 0, maxClusterTowerIDs)
	seen := make(map[string]struct{}, maxClusterTowerIDs)
	submitted := 0
	for {
		part, remainder, found := strings.Cut(raw, ",")
		if validationError := appendTowerID(&towers, seen, &submitted, part); validationError != "" {
			return nil, validationError
		}
		if !found {
			break
		}
		raw = remainder
	}
	return towers, ""
}

func normalizeTowerIDs(values []string) ([]string, string) {
	towers := make([]string, 0, maxClusterTowerIDs)
	seen := make(map[string]struct{}, maxClusterTowerIDs)
	submitted := 0
	for _, value := range values {
		if validationError := appendTowerID(&towers, seen, &submitted, value); validationError != "" {
			return nil, validationError
		}
	}
	return towers, ""
}

func appendTowerID(towers *[]string, seen map[string]struct{}, submitted *int, raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	(*submitted)++
	if *submitted > maxClusterTowerIDs {
		return "cluster_tower_ids must contain no more than " + strconv.Itoa(maxClusterTowerIDs) + " IDs"
	}
	if len(value) > maxTowerIDBytes {
		return "each cluster tower id must be at most " + strconv.Itoa(maxTowerIDBytes) + " bytes"
	}
	if _, exists := seen[value]; exists {
		return ""
	}
	seen[value] = struct{}{}
	*towers = append(*towers, value)
	return ""
}

func parseTowerLocations(raw string, towerIDs []string) map[string]topologyPoint {
	locations := map[string]topologyPoint{}
	if strings.TrimSpace(raw) == "" || len(towerIDs) == 0 {
		return locations
	}
	allowed := make(map[string]struct{}, len(towerIDs))
	for _, towerID := range towerIDs {
		allowed[towerID] = struct{}{}
	}
	for {
		entry, remainder, found := strings.Cut(raw, ";")
		parts := strings.SplitN(entry, ":", 3)
		if len(parts) != 3 {
			if !found {
				break
			}
			raw = remainder
			continue
		}
		towerID := strings.TrimSpace(parts[0])
		if _, exists := allowed[towerID]; !exists {
			if !found {
				break
			}
			raw = remainder
			continue
		}
		lon, lonErr := strconv.ParseFloat(parts[1], 64)
		lat, latErr := strconv.ParseFloat(parts[2], 64)
		if lonErr == nil && latErr == nil {
			locations[towerID] = topologyPoint{Lon: lon, Lat: lat}
		}
		if !found {
			break
		}
		raw = remainder
	}
	return locations
}

func isAllowedScenario(scenario string) bool {
	switch scenario {
	case "normal", "registration_storm", "udm_outage", "ausf_auth_failure", "pcf_policy_degraded", "upf_degraded", "xn_degraded", "xn_unavailable":
		return true
	default:
		return false
	}
}

func is5GNetworkTech(value string) bool {
	normalized := strings.ToLower(strings.TrimSpace(value))
	return normalized == "" || normalized == "5g" || normalized == "5g_mmwave" || normalized == "5g-mmwave"
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("encode response: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getenv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func strconvLike(value int) string {
	return strconv.Itoa(value)
}
