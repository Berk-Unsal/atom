package main

import (
	"bytes"
	"container/heap"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http/httptest"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unsafe"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

type workflowHarness struct {
	l               *rfRequestLimiter
	router          *gin.Engine
	roots, children atomic.Int64
	hook            func(*gin.Context)
}

func newWorkflowHarness(t *testing.T, timeout time.Duration, key string) *workflowHarness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := &workflowHarness{l: newRFRequestLimiter(2)}
	h.l.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	h.router = gin.New()
	_ = h.router.SetTrustedProxies(nil)
	h.router.Use(limitRequestBody(maxRequestBodyBytes), protectExpensiveRFRoutes(h.l, timeout, key))
	h.router.DELETE("/api/rf-workflows", h.l.cleanupWorkflow)
	for _, endpoint := range []string{"/api/evaluate-network", "/api/optimize-network"} {
		h.router.POST(endpoint, func(c *gin.Context) {
			var input raytracer.NetworkOptimizationRequestInput
			if !bindJSON(c, &input, "network") {
				return
			}
			req := input.ToRequest()
			// Internal accounting tests cover eight; production validation is separately tested on real routes.
			if input.MissingRequiredTowerFields() || len(req.Towers) < 2 || len(req.Towers) > 8 {
				c.AbortWithStatus(400)
				return
			}
			if !prebookRFWorkflow(c, len(req.Towers), input) {
				return
			}
			h.roots.Add(1)
			if h.hook != nil {
				h.hook(c)
				if c.IsAborted() {
					return
				}
			}
			result := raytracer.NetworkOptimizationResponse{}
			for _, v := range req.Towers {
				result.OptimizedTowers = append(result.OptimizedTowers, raytracer.NetworkOptimizedTower{ID: v.ID, OptimalAzimuth: v.AzimuthDeg + 10})
			}
			var optimized *raytracer.NetworkOptimizationResponse
			if c.Request.URL.Path == "/api/optimize-network" {
				optimized = &result
			}
			if !issueRFWorkflow(c, networkRFChildren(input, optimized), "parent", nil) {
				return
			}
			c.JSON(200, result)
		})
	}
	h.router.POST("/api/optimize-azimuth", func(c *gin.Context) {
		var input raytracer.StaticSimulationRequestInput
		if !bindJSON(c, &input, "azimuth") {
			return
		}
		if !prebookRFWorkflow(c, 1, input) {
			return
		}
		h.roots.Add(1)
		child := input
		child.AzimuthDeg = rfPointer(45.0)
		if !issueRFWorkflow(c, []raytracer.StaticSimulationRequestInput{child}, "parent", nil) {
			return
		}
		c.JSON(200, gin.H{"optimal_azimuth": 45})
	})
	for _, endpoint := range []string{"/api/simulate", "/api/analyze-sector"} {
		h.router.POST(endpoint, func(c *gin.Context) {
			var input raytracer.StaticSimulationRequestInput
			if !bindJSON(c, &input, "child") {
				return
			}
			if input.MissingRequiredCoordinates() || validateSimulationRequest(input.ToRequest()) != "" {
				c.AbortWithStatus(400)
				return
			}
			if !verifyRFChild(c, input) {
				return
			}
			h.children.Add(1)
			if h.hook != nil {
				h.hook(c)
				if c.IsAborted() {
					return
				}
			}
			c.JSON(200, gin.H{"ok": true})
		})
	}
	for endpoint := range expensiveRFRoutes {
		if endpoint == "/api/simulate" || endpoint == "/api/analyze-sector" || endpoint == "/api/evaluate-network" || endpoint == "/api/optimize-network" || endpoint == "/api/optimize-azimuth" {
			continue
		}
		h.router.POST(endpoint, func(c *gin.Context) { c.Status(204) })
	}
	t.Cleanup(func() {
		h.l.mu.Lock()
		if h.l.expiryTimer != nil {
			h.l.expiryTimer.Stop()
		}
		h.l.mu.Unlock()
	})
	return h
}
func wfHTTP(h *workflowHarness, path, ip string, body any, headers map[string]string, ctx context.Context) *httptest.ResponseRecorder {
	data, ok := body.([]byte)
	if !ok {
		data, _ = json.Marshal(body)
	}
	method := "POST"
	if path == "/api/rf-workflows" {
		method = "DELETE"
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	req.RemoteAddr = ip + ":1000"
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if ctx != nil {
		req = req.WithContext(ctx)
	}
	out := httptest.NewRecorder()
	h.router.ServeHTTP(out, req)
	return out
}
func wfNetwork(n int) raytracer.NetworkOptimizationRequestInput {
	r := raytracer.NetworkOptimizationRequestInput{Rays: rfPointer(8), RadiusMeters: rfPointer(100.0), FrequencyGHz: rfPointer(2.6), TxPowerDBm: rfPointer(30.0), BeamWidthDeg: rfPointer(120.0), CalibrationOffsetDB: rfPointer(0.0)}
	for i := 0; i < n; i++ {
		r.Towers = append(r.Towers, raytracer.TowerRequestInput{ID: strconv.Itoa(i), TowerLon: rfPointer(32.85 + float64(i)*.001), TowerLat: rfPointer(39.92), AzimuthDeg: rfPointer(float64(i) * 30)})
	}
	return r
}
func wfGrant(t *testing.T, h *workflowHarness, n int, path, ip string) (string, []raytracer.StaticSimulationRequestInput) {
	t.Helper()
	input := wfNetwork(n)
	out := wfHTTP(h, path, ip, input, map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
	if out.Code != 200 {
		t.Fatalf("grant %d: %s", out.Code, out.Body)
	}
	var result raytracer.NetworkOptimizationResponse
	_ = json.Unmarshal(out.Body.Bytes(), &result)
	var optimized *raytracer.NetworkOptimizationResponse
	if path == "/api/optimize-network" {
		optimized = &result
	}
	id := out.Header().Get("RF-Workflow-ID")
	if !validRFWorkflowID(id) {
		t.Fatalf("ID %q", id)
	}
	return id, networkRFChildren(input, optimized)
}
func wfChild(h *workflowHarness, id string, index int, ip string, body any) *httptest.ResponseRecorder {
	return wfHTTP(h, "/api/simulate", ip, body, map[string]string{"RF-Workflow-ID": id, "RF-Workflow-Index": strconv.Itoa(index)}, nil)
}
func wfInvariant(t *testing.T, l *rfRequestLimiter) {
	t.Helper()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.clients) > 4096 || len(l.workflows) != len(l.expiries) || len(l.workflows) > 4096*28 {
		t.Fatal("global bound")
	}
	for _, s := range l.clients {
		if s.ordinarySpent < 0 || s.ordinaryHeld < 0 || s.extraSpent < 0 || s.extraHeld < 0 || s.ordinarySpent+s.ordinaryHeld > l.requestsPerMinute || s.extraSpent+s.extraHeld > 8 || s.workflowCount != len(s.workflowRecords) || s.workflowCount > 28 {
			t.Fatalf("invalid state %+v", s)
		}
	}
	for i, r := range l.expiries {
		if r.heapIndex != i || l.workflows[r.id] != r || r.remaining() < 1 {
			t.Fatal("index/record invariant")
		}
		if i > 0 && l.expiries.Less(i, (i-1)/2) {
			t.Fatal("heap order")
		}
	}
	for _, s := range l.clients {
		ordinary, extra := 0, 0
		for _, r := range s.workflowRecords {
			for i := 0; i < r.count; i++ {
				if r.used&(1<<i) == 0 {
					if r.extraMask&(1<<i) != 0 {
						extra++
					} else {
						ordinary++
					}
				}
			}
		}
		if ordinary != s.ordinaryHeld || extra != s.extraHeld {
			t.Fatal("holds do not reconcile")
		}
	}
}
func TestBoundedWorkflowJourneys(t *testing.T) {
	for _, n := range []int{6, 8} {
		for _, journey := range []string{"eval", "opt", "cycle", "eval_opt", "F"} {
			t.Run(fmt.Sprintf("%d/%s", n, journey), func(t *testing.T) {
				h := newWorkflowHarness(t, time.Minute, "")
				ip := "192.0.2.1"
				run := func(path string) {
					id, children := wfGrant(t, h, n, path, ip)
					for i, input := range children {
						out := wfChild(h, id, i, ip, input)
						if out.Code != 200 {
							t.Fatalf("child%d status%d %s", i, out.Code, out.Body)
						}
						wfInvariant(t, h.l)
					}
				}
				if journey == "opt" {
					run("/api/optimize-network")
				} else {
					run("/api/evaluate-network")
				}
				if journey == "cycle" || journey == "F" {
					if out := wfHTTP(h, "/api/interference", ip, nil, nil, nil); out.Code != 204 {
						t.Fatal(out.Code)
					}
					run("/api/evaluate-network")
				}
				if journey == "eval_opt" || journey == "F" {
					run("/api/optimize-network")
				}
				expected := map[int]map[string][2]int{6: {"eval": {1, 6}, "opt": {1, 6}, "cycle": {7, 8}, "eval_opt": {6, 8}, "F": {14, 8}}, 8: {"eval": {1, 8}, "opt": {1, 8}, "cycle": {11, 8}, "eval_opt": {10, 8}, "F": {20, 8}}}[n][journey]
				s := h.l.clients[ip]
				if s.ordinarySpent != expected[0] || s.extraSpent != expected[1] || s.ordinaryHeld+s.extraHeld != 0 || len(h.l.workflows) != 0 {
					t.Fatalf("got %+v expected%v", s, expected)
				}
				if n == 8 && journey == "F" {
					if out := wfHTTP(h, "/api/interference", ip, nil, nil, nil); out.Code != 429 {
						t.Fatal("postF denial", out.Code)
					}
				}
			})
		}
	}
}
func TestBoundedOrdinaryAndPrebooking(t *testing.T) {
	h := newWorkflowHarness(t, time.Minute, "")
	ip := "192.0.2.1"
	input := networkRFChildren(wfNetwork(2), nil)[0]
	for i := 1; i <= 21; i++ {
		out := wfHTTP(h, "/api/simulate", ip, input, nil, nil)
		want := 200
		if i == 21 {
			want = 429
		}
		if out.Code != want {
			t.Fatal(i, out.Code)
		}
	}
	if h.children.Load() != 20 {
		t.Fatal("ordinary RF count")
	}
	// Consume extra first; leave ordinary residual below a six-child obligation.
	h = newWorkflowHarness(t, time.Minute, "")
	id, children := wfGrant(t, h, 8, "/api/evaluate-network", ip)
	for i, in := range children {
		wfChild(h, id, i, ip, in)
	}
	for i := 0; i < 15; i++ {
		wfHTTP(h, "/api/interference", ip, nil, nil, nil)
	}
	before := h.roots.Load()
	out := wfHTTP(h, "/api/optimize-network", ip, wfNetwork(6), map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
	if out.Code != 429 || h.roots.Load() != before || h.l.clients[ip].ordinarySpent != 17 || h.l.clients[ip].ordinaryHeld != 0 || out.Header().Get("RF-Workflow-ID") != "" {
		t.Fatalf("prebooking %d %+v", out.Code, h.l.clients[ip])
	}
	wfInvariant(t, h.l)
}
func TestBoundedAuthorizationDenials(t *testing.T) {
	for _, kind := range []string{"random", "altered", "foreign", "endpoint", "negative", "out_of_range", "mixed", "version", "missing_index", "duplicate"} {
		t.Run(kind, func(t *testing.T) {
			h := newWorkflowHarness(t, time.Minute, "")
			id, children := wfGrant(t, h, 6, "/api/evaluate-network", "192.0.2.1")
			headers := map[string]string{"RF-Workflow-ID": id, "RF-Workflow-Index": "0"}
			ip, path, want := "192.0.2.1", "/api/simulate", 400
			switch kind {
			case "random":
				headers["RF-Workflow-ID"] = strings.Repeat("a", 32)
				want = 410
			case "altered":
				headers["RF-Workflow-ID"] = id[:31] + "z"
			case "foreign":
				ip = "192.0.2.2"
				want = 403
			case "endpoint":
				path = "/api/analyze-sector"
				want = 403
			case "negative":
				headers["RF-Workflow-Index"] = "-1"
			case "out_of_range":
				headers["RF-Workflow-Index"] = "6"
			case "mixed":
				headers["RF-Workflow"] = "network-maps-v1"
			case "version":
				headers = map[string]string{"RF-Workflow": "future"}
			case "missing_index":
				delete(headers, "RF-Workflow-Index")
			case "duplicate":
				if wfChild(h, id, 0, ip, children[0]).Code != 200 {
					t.Fatal("first")
				}
				want = 409
			}
			before := h.children.Load()
			out := wfHTTP(h, path, ip, children[0], headers, nil)
			if out.Code != want || h.children.Load() != before {
				t.Fatalf("denial %d want%d,RF=%d", out.Code, want, h.children.Load())
			}
			wfInvariant(t, h.l)
		})
	}
}
func TestBoundedPayloadMutationsAndCanonicalization(t *testing.T) {
	changes := map[string]any{"tower_lon": 33.0, "tower_lat": 40.0, "frequency_ghz": 28.0, "rays": 9, "radius_m": 101.0, "tx_power_dbm": 31.0, "beam_width": 121.0, "azimuth": 1.0, "calibration_offset_db": 1.0, "propagation_model": "legacy_fspl_walls", "rf_profile": map[string]any{"antenna_gain_dbi": 20}}
	for field, value := range changes {
		t.Run(field, func(t *testing.T) {
			h := newWorkflowHarness(t, time.Minute, "")
			id, children := wfGrant(t, h, 6, "/api/evaluate-network", "192.0.2.1")
			b, _ := json.Marshal(children[0])
			var body map[string]any
			json.Unmarshal(b, &body)
			body[field] = value
			out := wfChild(h, id, 0, "192.0.2.1", body)
			if out.Code != 400 || h.children.Load() != 0 {
				t.Fatal(out.Code, out.Body)
			}
			s := h.l.clients["192.0.2.1"]
			if s.extraSpent != 1 || s.extraHeld+s.ordinaryHeld != 0 {
				t.Fatalf("mutation accounting %+v", s)
			}
			wfInvariant(t, h.l)
		})
	}
	input := networkRFChildren(wfNetwork(2), nil)[0]
	b, _ := json.Marshal(input)
	var obj map[string]any
	json.Unmarshal(b, &obj)
	reordered, _ := json.Marshal(obj)
	var normalized raytracer.StaticSimulationRequestInput
	json.Unmarshal(reordered, &normalized)
	a, _ := rfChildDigest(input, "/api/simulate", 0)
	c, _ := rfChildDigest(normalized, "/api/simulate", 0)
	if a != c {
		t.Fatal("object order")
	}
	obj["tower_lon"] = json.Number("32.8500")
	reordered, _ = json.Marshal(obj)
	json.Unmarshal(reordered, &normalized)
	c, _ = rfChildDigest(normalized, "/api/simulate", 0)
	if a != c {
		t.Fatal("numeric spelling")
	}
}
func TestBoundedFailures(t *testing.T) {
	for _, root := range []bool{true, false} {
		for _, fault := range []string{"malformed", "oversized", "validation", "internal", "deadline", "cancel"} {
			t.Run(fmt.Sprintf("root=%v/%s", root, fault), func(t *testing.T) {
				h := newWorkflowHarness(t, time.Minute, "")
				ip := "192.0.2.1"
				headers := map[string]string{"RF-Workflow": "network-maps-v1"}
				path := "/api/evaluate-network"
				var body any = wfNetwork(6)
				if !root {
					id, children := wfGrant(t, h, 6, path, ip)
					body = children[0]
					headers = map[string]string{"RF-Workflow-ID": id, "RF-Workflow-Index": "0"}
					path = "/api/simulate"
				}
				var ctx context.Context
				switch fault {
				case "malformed":
					body = []byte("{")
				case "oversized":
					body = []byte(strings.Repeat(" ", int(maxRequestBodyBytes)+1))
				case "validation":
					body = []byte(`{"tower_lon":32.85,"tower_lat":39.92,"rays":-1}`)
				case "internal":
					h.hook = func(c *gin.Context) { c.AbortWithStatus(500) }
				case "deadline":
					h.hook = func(c *gin.Context) {
						<-c.Request.Context().Done()
						writeRFResponse(c, struct{}{}, c.Request.Context().Err())
						c.Abort()
					}
				case "cancel":
					h.hook = func(c *gin.Context) { c.Abort() }
					cancelCtx, cancel := context.WithCancel(context.Background())
					cancel()
					ctx = cancelCtx
				}
				out := wfHTTP(h, path, ip, body, headers, ctx)
				if out.Header().Get("RF-Workflow-ID") != "" || len(h.l.workflows) != 0 {
					t.Fatal("failed request retained grant")
				}
				s := h.l.clients[ip]
				if s.ordinaryHeld+s.extraHeld != 0 || s.ordinarySpent != 1 {
					t.Fatalf("failure %+v status%d", s, out.Code)
				}
				if !root && s.extraSpent != 1 {
					t.Fatal("child charge refunded")
				}
				wfInvariant(t, h.l)
			})
		}
	}
}
func TestBoundedAuthStaleCleanupRestart(t *testing.T) {
	h := newWorkflowHarness(t, time.Minute, "secret")
	out := wfHTTP(h, "/api/evaluate-network", "192.0.2.1", wfNetwork(6), map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
	if out.Code != 401 || len(h.l.clients) != 0 {
		t.Fatal("auth ordering")
	}
	headers := map[string]string{"RF-Workflow": "network-maps-v1", "X-API-Key": "secret"}
	out = wfHTTP(h, "/api/evaluate-network", "192.0.2.1", wfNetwork(6), headers, nil)
	id := out.Header().Get("RF-Workflow-ID")
	if !validRFWorkflowID(id) {
		t.Fatal("grant", out.Code)
	}
	for _, v := range []struct {
		ip, key string
		status  int
	}{{"192.0.2.1", "", 401}, {"192.0.2.2", "secret", 403}, {"192.0.2.1", "secret", 204}, {"192.0.2.1", "secret", 404}} {
		out = wfHTTP(h, "/api/rf-workflows", v.ip, nil, map[string]string{"RF-Workflow-ID": id, "X-API-Key": v.key}, nil)
		if out.Code != v.status {
			t.Fatal(out.Code, v)
		}
	}
	if h.l.clients["192.0.2.1"].ordinarySpent != 1 {
		t.Fatal("cleanup charged/refunded")
	}
	h = newWorkflowHarness(t, time.Minute, "")
	id, children := wfGrant(t, h, 6, "/api/evaluate-network", "192.0.2.1")
	h.l.currentContext = func() rfWorkflowContext { return rfWorkflowContext{Identity: sha256.Sum256([]byte("changed"))} }
	out = wfChild(h, id, 0, "192.0.2.1", children[0])
	if out.Code != 409 || h.children.Load() != 0 || len(h.l.workflows) != 0 {
		t.Fatal("stale")
	}
	restarted := newWorkflowHarness(t, time.Minute, "")
	out = wfChild(restarted, id, 0, "192.0.2.1", children[0])
	if out.Code != 410 || restarted.children.Load() != 0 {
		t.Fatal("restart")
	}
}
func TestBoundedResetExpiryAndRollback(t *testing.T) {
	h := newWorkflowHarness(t, 0, "")
	now := time.Now()
	h.l.now = func() time.Time { return now }
	ip := "192.0.2.1"
	id, children := wfGrant(t, h, 6, "/api/evaluate-network", ip)
	// Valid progress just before reset renews idle; old held obligations carry.
	h.l.mu.Lock()
	now = now.Add(59 * time.Second)
	h.l.mu.Unlock()
	if wfChild(h, id, 0, ip, children[0]).Code != 200 {
		t.Fatal("progress")
	}
	h.l.mu.Lock()
	now = now.Add(2 * time.Second)
	h.l.mu.Unlock()
	if wfChild(h, id, 1, ip, children[1]).Code != 200 {
		t.Fatal("carried child")
	}
	s := h.l.clients[ip]
	if s.ordinarySpent != 0 || s.extraSpent != 1 || s.extraHeld != 4 {
		t.Fatalf("carry %+v", s)
	}
	wfInvariant(t, h.l)
	h.l.mu.Lock()
	now = now.Add(time.Minute)
	h.l.mu.Unlock()
	out := wfChild(h, id, 2, ip, children[2])
	if out.Code != 410 || s.extraHeld != 0 {
		t.Fatal("idle expiry", out.Code)
	}
	wfInvariant(t, h.l)
	h = newWorkflowHarness(t, time.Minute, "")
	id, children = wfGrant(t, h, 6, "/api/evaluate-network", ip)
	wfChild(h, id, 0, ip, children[0])
	h.l.disableWorkflowPolicy()
	s = h.l.clients[ip]
	if s.ordinarySpent != 2 || s.extraHeld+s.ordinaryHeld != 0 || len(h.l.workflows) != 0 {
		t.Fatalf("rollback %+v", s)
	}
	out = wfChild(h, id, 1, ip, children[1])
	if out.Code != 410 {
		t.Fatal("old capability")
	}
	out = wfHTTP(h, "/api/evaluate-network", ip, wfNetwork(6), map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
	if out.Header().Get("RF-Workflow-ID") != "" {
		t.Fatal("rollback issuance")
	}
}
func TestBoundedConcurrentClaimsAndSlots(t *testing.T) {
	h := newWorkflowHarness(t, time.Minute, "")
	ip := "192.0.2.1"
	id, children := wfGrant(t, h, 6, "/api/evaluate-network", ip)
	start, release := make(chan struct{}), make(chan struct{})
	h.hook = func(c *gin.Context) {
		if c.Request.URL.Path == "/api/simulate" {
			close(start)
			<-release
		}
	}
	result := make(chan *httptest.ResponseRecorder, 1)
	go func() { result <- wfChild(h, id, 0, ip, children[0]) }()
	<-start
	out := wfChild(h, id, 0, ip, children[0])
	if out.Code != 409 {
		t.Fatal("duplicate", out.Code)
	}
	out = wfChild(h, id, 1, ip, children[1])
	if out.Code != 429 || out.Header().Get("Retry-After") != "1" {
		t.Fatal("client concurrency", out.Code)
	}
	close(release)
	if (<-result).Code != 200 || h.children.Load() != 1 {
		t.Fatal("concurrent RF")
	}
	if len(h.l.workflows) != 0 || h.l.clients[ip].extraSpent != 2 {
		t.Fatal("busy cleanup")
	}
	wfInvariant(t, h.l)
	h = newWorkflowHarness(t, time.Minute, "")
	var wg sync.WaitGroup
	block := make(chan struct{})
	begun := make(chan struct{}, 2)
	h.hook = func(c *gin.Context) { begun <- struct{}{}; <-block }
	for _, peer := range []string{"192.0.2.1", "192.0.2.2"} {
		wg.Add(1)
		go func(ip string) { defer wg.Done(); wfHTTP(h, "/api/simulate", ip, children[0], nil, nil) }(peer)
	}
	<-begun
	<-begun
	out = wfHTTP(h, "/api/simulate", "192.0.2.3", children[0], nil, nil)
	if out.Code != 429 {
		t.Fatal("global concurrency", out.Code)
	}
	close(block)
	wg.Wait()
	wfInvariant(t, h.l)
}
func TestBoundedStateCapacityHeapAndProperty(t *testing.T) {
	h := newWorkflowHarness(t, time.Minute, "")
	ip := "192.0.2.1"
	id, _ := wfGrant(t, h, 6, "/api/evaluate-network", ip)
	pinned := h.l.clients[ip]
	h.l.mu.Lock()
	for i := 0; i < 5000; i++ {
		h.l.clientState(fmt.Sprintf("peer%d", i), h.l.now())
	}
	if h.l.clients[ip] != pinned || len(h.l.clients) != 4096 {
		t.Fatal("pinned eviction")
	}
	for _, s := range h.l.clients {
		s.active = 1
	}
	h.l.mu.Unlock()
	out := wfHTTP(h, "/api/evaluate-network", "203.0.113.1", wfNetwork(6), map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
	if out.Code != 503 || h.l.overflow.extraHeld != 0 {
		t.Fatal("overflow grant", out.Code)
	}
	h.l.mu.Lock()
	for _, s := range h.l.clients {
		s.active = 0
	}
	h.l.mu.Unlock()
	wfHTTP(h, "/api/rf-workflows", ip, nil, map[string]string{"RF-Workflow-ID": id}, nil)
	wfInvariant(t, h.l)
	h = newWorkflowHarness(t, 0, "")
	now := time.Now()
	h.l.now = func() time.Time { return now }
	rng := rand.New(rand.NewSource(42))
	ids := []string{}
	for i := 0; i < 1500; i++ {
		switch rng.Intn(4) {
		case 0:
			peer := fmt.Sprintf("192.0.2.%d", 1+rng.Intn(32))
			out := wfHTTP(h, "/api/evaluate-network", peer, wfNetwork(2), map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
			if v := out.Header().Get("RF-Workflow-ID"); v != "" {
				ids = append(ids, v)
			}
		case 1:
			if len(ids) > 0 {
				v := ids[rng.Intn(len(ids))]
				h.l.mu.Lock()
				r := h.l.workflows[v]
				if r != nil {
					h.l.retire(r)
				}
				h.l.mu.Unlock()
			}
		case 2:
			h.l.mu.Lock()
			now = now.Add(3 * time.Second)
			h.l.expireDue(now)
			h.l.mu.Unlock()
		case 3:
			wfHTTP(h, "/api/simulate", "198.51.100.1", []byte("{"), map[string]string{"RF-Workflow-ID": strings.Repeat("a", 32), "RF-Workflow-Index": "0"}, nil)
		}
		wfInvariant(t, h.l)
	}
	h.l.mu.Lock()
	now = now.Add(10 * time.Minute)
	h.l.expireDue(now)
	h.l.mu.Unlock()
	wfInvariant(t, h.l)
	if len(h.l.expiries) != 0 {
		t.Fatal("heap leak")
	}
}
func TestBoundedCapabilityAllocationFailure(t *testing.T) {
	h := newWorkflowHarness(t, time.Minute, "")
	h.l.capabilityRandom = func([]byte) (int, error) { return 0, errors.New("injected entropy failure") }
	out := wfHTTP(h, "/api/evaluate-network", "192.0.2.1", wfNetwork(6), map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
	if out.Code != 503 || h.roots.Load() != 0 || len(h.l.workflows) != 0 {
		t.Fatal("allocation fail closed")
	}
	wfInvariant(t, h.l)
}

// Metadata-only worst logical state: no RF execution and no public debug endpoint.
func TestBoundedWorkflowSaturation(t *testing.T) {
	if os.Getenv("ATOM_POLICY_SATURATION") != "1" {
		t.Skip("isolated shipping-runtime metadata saturation opt-in")
	}
	l := newRFRequestLimiter(2)
	l.logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	l.workflows = map[string]*rfWorkflow{}
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	rss := func() int64 {
		data, _ := os.ReadFile("/proc/self/status")
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "VmRSS:") {
				v, _ := strconv.ParseInt(strings.Fields(line)[1], 10, 64)
				return v * 1024
			}
		}
		return 0
	}
	beforeRSS := rss()
	maxHeap := before.HeapAlloc
	now := time.Now()
	for client := 0; client < 4096; client++ {
		s := l.clientState(fmt.Sprintf("peer%d", client), now)
		s.workflowRecords = map[string]*rfWorkflow{}
		for j := 0; j < 28; j++ {
			id := fmt.Sprintf("%032x", client*28+j+1)
			r := &rfWorkflow{id: id, owner: s, count: 1, extraMask: 0, idle: now.Add(time.Minute), absolute: now.Add(2 * time.Minute), heapIndex: -1}
			if j < 8 {
				r.extraMask = 1
				s.extraHeld++
			} else {
				s.ordinaryHeld++
			}
			for k := range r.hashes {
				r.hashes[k] = sha256.Sum256([]byte(id + strconv.Itoa(k)))
			}
			l.workflows[id] = r
			s.workflowRecords[id] = r
			s.workflowCount++
			heap.Push(&l.expiries, r)
		}
		var sample runtime.MemStats
		runtime.ReadMemStats(&sample)
		maxHeap = max(maxHeap, sample.HeapAlloc)
	}
	runtime.GC()
	runtime.ReadMemStats(&after)
	saturatedRSS := rss()
	peak, _ := os.ReadFile("/sys/fs/cgroup/memory.peak")
	current, _ := os.ReadFile("/sys/fs/cgroup/memory.current")
	result := map[string]any{"clients": len(l.clients), "workflows": len(l.workflows), "heap_entries": len(l.expiries), "held_units": 4096 * 28, "record_size_bytes": unsafe.Sizeof(rfWorkflow{}), "go_heap_peak_sampled_bytes": maxHeap, "go_heap_peak_increment_bytes": int64(maxHeap) - int64(before.HeapAlloc), "go_heap_alloc_bytes": after.HeapAlloc, "go_heap_increment_bytes": int64(after.HeapAlloc) - int64(before.HeapAlloc), "rss_bytes": saturatedRSS, "rss_increment_bytes": saturatedRSS - beforeRSS, "cgroup_peak_bytes": strings.TrimSpace(string(peak)), "cgroup_current_bytes": strings.TrimSpace(string(current)), "runtime": runtime.Version(), "GOOS": runtime.GOOS, "GOARCH": runtime.GOARCH}
	events, _ := os.ReadFile("/sys/fs/cgroup/memory.events")
	result["memory_events"] = string(events)
	cpu, _ := os.ReadFile("/sys/fs/cgroup/cpu.max")
	result["cpu_max"] = strings.TrimSpace(string(cpu))
	mem, _ := os.ReadFile("/sys/fs/cgroup/memory.max")
	result["memory_max"] = strings.TrimSpace(string(mem))
	result["gomaxprocs"] = runtime.GOMAXPROCS(0)
	data, _ := json.Marshal(result)
	fmt.Println("POLICY_SATURATION " + string(data))
	if maxHeap-before.HeapAlloc > 256<<20 || saturatedRSS-beforeRSS > 384<<20 {
		t.Fatal("frozen saturation memory gate")
	}
	p, _ := strconv.ParseInt(strings.TrimSpace(string(peak)), 10, 64)
	if p > 768<<20 {
		t.Fatal("frozen cgroup saturation gate")
	}
	l.expireDue(now.Add(3 * time.Minute))
	wfInvariant(t, l)
	if len(l.workflows) != 0 || len(l.expiries) != 0 {
		t.Fatal("saturation cleanup")
	}
}
