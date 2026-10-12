package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func TestRFBudgetAdmissionPreservesScientificResponses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	simulationBody := `{"tower_lon":32.85,"tower_lat":39.92,"rays":8,"radius_m":100,"frequency_ghz":2.6,"tx_power_dbm":30,"beam_width":120}`
	networkBody := `{"towers":[{"id":"a","tower_lon":32.85,"tower_lat":39.92,"azimuth":0},{"id":"b","tower_lon":32.851,"tower_lat":39.92,"azimuth":180}],"rays":8,"radius_m":100,"frequency_ghz":2.6,"tx_power_dbm":30,"beam_width":120,"optimization":{"objectives":[{"id":"coverage","weight":100}]}}`
	interferenceBody := `{"network_tech":"4g","towers":[{"id":"a","tower_lon":32.85,"tower_lat":39.92,"azimuth":0},{"id":"b","tower_lon":32.851,"tower_lat":39.92,"azimuth":180}],"frequency_ghz":2.6,"radius_m":100,"bandwidth_mhz":20,"load_factor":0.7,"reuse_factor":1,"noise_figure_db":7,"sample_spacing_m":40}`
	buildings := raytracer.EmptyBuildingIndex()
	for _, endpoint := range []string{"/api/simulate", "/api/evaluate-network", "/api/optimize-network", "/api/interference"} {
		t.Run(endpoint, func(t *testing.T) {
			var expected []byte
			for _, protected := range []bool{false, true} {
				limiter := newRFRequestLimiter(2)
				router := gin.New()
				if protected {
					router.Use(protectExpensiveRFRoutes(limiter, 0, ""))
				}
				body := networkBody
				switch endpoint {
				case "/api/interference":
					body = interferenceBody
					registerInterferenceRoute(router, buildings)
				case "/api/simulate":
					body = simulationBody
					router.POST(endpoint, func(c *gin.Context) {
						var input raytracer.StaticSimulationRequestInput
						if !bindJSON(c, &input, "simulation") {
							return
						}
						response, err := raytracer.SimulateStaticRaysContext(c.Request.Context(), input.ToRequest(), buildings)
						writeRFResponse(c, response, err)
					})
				default:
					router.POST(endpoint, func(c *gin.Context) {
						var input raytracer.NetworkOptimizationRequestInput
						if !bindJSON(c, &input, "network") {
							return
						}
						compute := raytracer.EvaluateNetworkContext
						if endpoint == "/api/optimize-network" {
							compute = raytracer.OptimizeNetworkContext
						}
						response, err := compute(c.Request.Context(), input.ToRequest(), buildings)
						writeRFResponse(c, response, err)
					})
				}
				request := httptest.NewRequest(http.MethodPost, endpoint, strings.NewReader(body))
				request.RemoteAddr = "192.0.2.1:1000"
				request.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != 200 {
					t.Fatalf("status=%d body=%s", response.Code, response.Body)
				}
				if !protected {
					expected = append([]byte(nil), response.Body.Bytes()...)
					continue
				}
				if !bytes.Equal(expected, response.Body.Bytes()) {
					t.Fatal("admission changed scientific output or fingerprints")
				}
				if limiter.clients["192.0.2.1"].ordinarySpent != 1 {
					t.Fatal("internal model evaluations consumed HTTP budget")
				}
			}
		})
	}
}

func TestRFBudgetDenialDiagnostics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := newRFRequestLimiterWithBudget(1, 1, 1)
	var output bytes.Buffer
	limiter.logger = slog.New(slog.NewJSONHandler(&output, nil))
	router := gin.New()
	router.Use(protectExpensiveRFRoutes(limiter, 0, ""))
	router.POST("/api/interference", func(c *gin.Context) { c.Status(204) })
	budgetRequest(router, "/api/interference", "192.0.2.1:1000")
	if output.Len() != 0 {
		t.Fatal("successful admission produced a noisy limiter log")
	}
	budgetRequest(router, "/api/interference", "192.0.2.1:2000")
	var entry map[string]any
	if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
		t.Fatal(err)
	}
	if entry["rate_limit_class"] != "RF analysis" || entry["operation"] != "/api/interference" ||
		entry["request_id"] != float64(2) || entry["allowed"] != false || entry["remaining"] != float64(0) ||
		entry["client_key_hash"] == "" || entry["retry_after_seconds"] != float64(60) {
		t.Fatalf("missing denial diagnostics: %v", entry)
	}
	if strings.Contains(output.String(), "192.0.2.1") {
		t.Fatal("denial log exposed peer address")
	}
}

func TestRFBudgetProtectedRouteClassification(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for endpoint := range expensiveRFRoutes {
		t.Run(endpoint, func(t *testing.T) {
			limiter := newRFRequestLimiter(2)
			router := gin.New()
			router.Use(protectExpensiveRFRoutes(limiter, 0, ""))
			router.POST(endpoint, func(c *gin.Context) { c.Status(204) })
			response := budgetRequest(router, endpoint, "192.0.2.1:1000")
			if response.Code != 204 || response.Header().Get("RateLimit-Limit") != "20" || response.Header().Get("RateLimit-Remaining") != "19" {
				t.Fatalf("protected route must cost one attempt: %d %v", response.Code, response.Header())
			}
		})
	}
	limiter := newRFRequestLimiter(2)
	router := gin.New()
	router.Use(protectExpensiveRFRoutes(limiter, 0, ""))
	router.POST("/api/core/scenario", func(c *gin.Context) { c.Status(204) })
	router.GET("/api/simulate", func(c *gin.Context) { c.Status(204) })
	response := budgetRequest(router, "/api/core/scenario", "192.0.2.1:1000")
	if response.Header().Get("RateLimit-Limit") != "" {
		t.Fatal("non-RF route consumed RF budget")
	}
	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/simulate", nil))
	if len(limiter.clients) != 0 {
		t.Fatal("unprotected method/route acquired RF budget")
	}
}

func TestRFBudgetEnvironmentConfiguration(t *testing.T) {
	for _, value := range []string{"", "invalid", "0", "-1", " 15 "} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("RF_REQUESTS_PER_MINUTE", value)
			want := 20
			if value == " 15 " {
				want = 15
			}
			limiter := newRFRequestLimiterWithBudget(2, 1, envInt("RF_REQUESTS_PER_MINUTE", defaultRFRequestsPerMinute))
			if limiter.requestsPerMinute != want {
				t.Fatalf("configured budget=%d want=%d", limiter.requestsPerMinute, want)
			}
		})
	}
}

func TestRFBudgetBodyValidationAndAuthenticationOrdering(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := newRFRequestLimiter(2)
	router := gin.New()
	router.Use(limitRequestBody(16), protectExpensiveRFRoutes(limiter, 0, "test-key"))
	router.POST("/api/simulate", func(c *gin.Context) {
		var input map[string]any
		if bindJSON(c, &input, "simulation") {
			c.Status(204)
		}
	})
	for _, attempt := range []struct {
		body, key string
		status    int
		remaining string
	}{
		{`{}`, "", 401, ""}, // Authentication precedes admission.
		{`{"padding":"abcdefghijklmnopqrstuvwxyz"}`, "test-key", 413, "19"}, // Body limit is detected by handler decoding.
		{`{`, "test-key", 400, "18"},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/simulate", strings.NewReader(attempt.body))
		request.RemoteAddr = "192.0.2.1:1000"
		request.Header.Set("X-API-Key", attempt.key)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != attempt.status || response.Header().Get("RateLimit-Remaining") != attempt.remaining {
			t.Fatalf("ordering: status=%d want=%d headers=%v", response.Code, attempt.status, response.Header())
		}
	}
}

func budgetRequest(router http.Handler, endpoint, peer string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, endpoint, nil)
	request.RemoteAddr = peer
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func TestRFBudgetSixCellWorkflowAndAbuse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := newRFRequestLimiter(2)
	now := time.Date(2026, 10, 3, 16, 0, 0, 0, time.UTC)
	limiter.now = func() time.Time { return now }
	router := gin.New()
	router.Use(protectExpensiveRFRoutes(limiter, 0, ""))
	for _, endpoint := range []string{"/api/evaluate-network", "/api/simulate", "/api/interference"} {
		router.POST(endpoint, func(c *gin.Context) { c.Status(http.StatusNoContent) })
	}
	// The real-browser acceptance test verifies these exact caller sequences.
	evaluation := []string{"/api/evaluate-network"}
	for range 6 {
		evaluation = append(evaluation, "/api/simulate")
	}
	workflow := append(append(append([]string{}, evaluation...), "/api/interference"), evaluation...)
	for index, endpoint := range workflow {
		response := budgetRequest(router, endpoint, "192.0.2.1:1000")
		if response.Code != http.StatusNoContent || response.Header().Get("RateLimit-Remaining") != strconv.Itoa(19-index) {
			t.Fatalf("workflow request %d: status=%d headers=%v", index+1, response.Code, response.Header())
		}
	}
	for attempt := 16; attempt <= 20; attempt++ {
		if response := budgetRequest(router, "/api/simulate", "192.0.2.1:2000"); response.Code != http.StatusNoContent {
			t.Fatalf("allowed request %d: %d", attempt, response.Code)
		}
	}
	for range 3 {
		response := budgetRequest(router, "/api/interference", "192.0.2.1:3000")
		if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") != "60" ||
			response.Header().Get("RateLimit-Remaining") != "0" || response.Header().Get("Cache-Control") != "no-store" ||
			response.Body.String() != `{"error":"RF analysis request budget exceeded; retry after the current rate-limit window"}` {
			t.Fatalf("denial semantics: status=%d headers=%v body=%s", response.Code, response.Header(), response.Body)
		}
	}
	// Denials do not extend the fixed window. The next request at expiry resets it.
	now = now.Add(time.Minute)
	response := budgetRequest(router, "/api/evaluate-network", "192.0.2.1:4000")
	if response.Code != http.StatusNoContent || response.Header().Get("RateLimit-Remaining") != "19" {
		t.Fatalf("reset: status=%d headers=%v", response.Code, response.Header())
	}
}

func TestRFBudgetRetryAfterNeverPrecedesReset(t *testing.T) {
	for _, elapsed := range []time.Duration{time.Nanosecond, 1500 * time.Millisecond, 59*time.Second + time.Nanosecond} {
		t.Run(elapsed.String(), func(t *testing.T) {
			limiter := newRFRequestLimiterWithBudget(1, 1, 1)
			start := time.Date(2026, 10, 3, 16, 0, 0, 0, time.UTC)
			now := start
			limiter.now = func() time.Time { return now }
			release, _, _, _, _ := limiter.acquire("client", "RF analysis")
			release()
			now = start.Add(elapsed)
			_, _, reset, retry, reason := limiter.acquire("client", "RF analysis")
			if reason == "" || reset != retry || time.Duration(retry)*time.Second < time.Minute-elapsed {
				t.Fatalf("premature retry: elapsed=%v reset=%d retry=%d reason=%q", elapsed, reset, retry, reason)
			}
			// Following the header exactly must permit the next request.
			now = now.Add(time.Duration(retry) * time.Second)
			release, _, _, _, reason = limiter.acquire("client", "RF analysis")
			if reason != "" {
				t.Fatalf("retry after advertised expiry denied: %s", reason)
			}
			release()
		})
	}
}

func TestRFBudgetCountsFailuresAndCancellation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, status := range []int{http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusGatewayTimeout, 499} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			limiter := newRFRequestLimiterWithBudget(1, 1, 2)
			router := gin.New()
			router.Use(protectExpensiveRFRoutes(limiter, 0, ""))
			router.POST("/api/simulate", func(c *gin.Context) {
				if status == 499 {
					if c.Request.Context().Err() != context.Canceled {
						t.Error("expected cancelled context")
					}
					return // Matches writeRFResponse's disconnect behavior: no body/status.
				}
				c.Status(status)
			})
			request := httptest.NewRequest(http.MethodPost, "/api/simulate", nil)
			request.RemoteAddr = "192.0.2.1:1000"
			if status == 499 {
				ctx, cancel := context.WithCancel(request.Context())
				cancel()
				request = request.WithContext(ctx)
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			state := limiter.clients["192.0.2.1"]
			if state.ordinarySpent != 1 || state.active != 0 || response.Header().Get("RateLimit-Remaining") != "1" {
				t.Fatalf("failure/cancel must retain charge and release concurrency: state=%+v headers=%v", state, response.Header())
			}
		})
	}
}

func TestRFBudgetConcurrentAttemptsAndCapacityDenials(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := newRFRequestLimiterWithBudget(1, 1, 20)
	release, _, _, _, reason := limiter.acquire("192.0.2.1", "RF analysis")
	if reason != "" {
		t.Fatal(reason)
	}
	var group sync.WaitGroup
	for range 19 {
		group.Go(func() {
			_, _, _, _, reason := limiter.acquire("192.0.2.1", "RF analysis")
			if !strings.Contains(reason, "already running") {
				t.Errorf("duplicate admission: %q", reason)
			}
		})
	}
	group.Wait()
	release()
	release() // Release is idempotent.
	_, _, _, _, reason = limiter.acquire("192.0.2.1", "RF analysis")
	if !strings.Contains(reason, "budget exceeded") || limiter.clients["192.0.2.1"].active != 0 {
		t.Fatalf("concurrent attempts bypassed/corrupted budget: %s", reason)
	}
	// A global-capacity denial also consumes an attempt, but releases active state.
	router := gin.New()
	router.POST("/job", limiter.middleware(), func(c *gin.Context) { t.Error("busy handler executed") })
	limiter.slots <- struct{}{}
	response := budgetRequest(router, "/job", "198.51.100.2:1000")
	<-limiter.slots
	state := limiter.clients["198.51.100.2"]
	if response.Code != 429 || !strings.Contains(response.Body.String(), "capacity is busy") || state.ordinarySpent != 1 || state.active != 0 {
		t.Fatalf("global rejection accounting: state=%+v status=%d body=%s", state, response.Code, response.Body)
	}
}

func TestRFBudgetClientIPPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, trusted := range []bool{false, true} {
		t.Run(strconv.FormatBool(trusted), func(t *testing.T) {
			router := gin.New()
			proxies := []string(nil)
			if trusted {
				proxies = []string{"127.0.0.1"}
			}
			if err := router.SetTrustedProxies(proxies); err != nil {
				t.Fatal(err)
			}
			limiter := newRFRequestLimiterWithBudget(1, 1, 1)
			router.POST("/job", limiter.middleware(), func(c *gin.Context) { c.Status(204) })
			for index, forwarded := range []string{"192.0.2.1", "198.51.100.2"} {
				request := httptest.NewRequest(http.MethodPost, "/job", nil)
				request.RemoteAddr = "127.0.0.1:" + strconv.Itoa(1000+index)
				request.Header.Set("X-Forwarded-For", forwarded)
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				want := 204
				if !trusted && index == 1 {
					want = 429
				}
				if response.Code != want {
					t.Fatalf("trusted=%v attempt=%d status=%d want=%d", trusted, index, response.Code, want)
				}
			}
		})
	}
}

func TestRFBudgetIPv4AndIPv6Identity(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	if err := router.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	limiter := newRFRequestLimiterWithBudget(1, 1, 1)
	router.POST("/job", limiter.middleware(), func(c *gin.Context) { c.Status(204) })
	for _, attempt := range []struct {
		peer   string
		status int
	}{
		{"192.0.2.1:1000", 204},
		{"[::ffff:192.0.2.1]:2000", 429}, // IPv4-mapped IPv6 is the same normalized IP.
		{"127.0.0.1:1000", 204},
		{"[::1]:1000", 204}, // Native IPv6 and IPv4 loopback are distinct identities.
		{"[::1]:2000", 429},
	} {
		if response := budgetRequest(router, "/job", attempt.peer); response.Code != attempt.status {
			t.Fatalf("peer %s: status=%d want=%d", attempt.peer, response.Code, attempt.status)
		}
	}
}
