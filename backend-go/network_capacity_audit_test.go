package main

// Opt-in capacity measurements. Larger fixtures require a disposable audit copy
// with only MaxNetworkTowers overridden; historical larger-cardinality overrides stay isolated; production now supports eight.
import (
	"ankara-5g-raytracer/raytracer"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

type capacityFixture struct {
	N            int               `json:"n"`
	Frequency    float64           `json:"frequencyGHz"`
	Network      json.RawMessage   `json:"network"`
	Interference json.RawMessage   `json:"interference"`
	Simulations  []json.RawMessage `json:"simulations"`
	Explanation  json.RawMessage   `json:"explanation"`
}

func capacityRSS() int64 {
	b, e := exec.Command("ps", "-o", "rss=", "-p", strconv.Itoa(os.Getpid())).Output()
	if e != nil {
		return -1
	}
	n, _ := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	return n * 1024
}
func capacityCPU() float64 {
	var u syscall.Rusage
	_ = syscall.Getrusage(syscall.RUSAGE_SELF, &u)
	return float64(u.Utime.Sec+u.Stime.Sec) + float64(u.Utime.Usec+u.Stime.Usec)/1e6
}
func TestNetworkCapacityAudit(t *testing.T) {
	if os.Getenv("ATOM_RUN_CAPACITY_AUDIT") != "1" {
		t.Skip("gated full-dataset capacity audit")
	}
	fixtureName := os.Getenv("ATOM_CAPACITY_CASE")
	b, e := os.ReadFile(filepath.Join(os.Getenv("ATOM_CAPACITY_FIXTURES"), fixtureName+".json"))
	if e != nil {
		t.Fatal(e)
	}
	var f capacityFixture
	if e = json.Unmarshal(b, &f); e != nil {
		t.Fatal(e)
	}
	if f.N > raytracer.MaxNetworkTowers {
		t.Fatal("larger fixtures must run in the isolated audit copy")
	}
	pack, e := raytracer.LoadDatasetPack("../data-pipeline")
	if e != nil {
		t.Fatal(e)
	}
	gin.SetMode(gin.TestMode)
	mode := os.Getenv("ATOM_CAPACITY_MODE")
	limiter := newRFRequestLimiter(2)
	timing := &raytracer.NetworkOptimizationTiming{}
	router := gin.New()
	router.Use(limitRequestBody(maxRequestBodyBytes), protectExpensiveRFRoutes(limiter, defaultRFRequestTimeout, ""))
	router.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(raytracer.WithNetworkOptimizationTiming(c.Request.Context(), timing))
		c.Next()
	})
	registerNetworkOptimizationRoute(router, func() *raytracer.BuildingIndex { return pack.BuildingIndex })
	registerInterferenceRoute(router, pack.BuildingIndex)
	router.POST("/api/evaluate-network", func(c *gin.Context) {
		var in raytracer.NetworkOptimizationRequestInput
		if !bindJSON(c, &in, "network") {
			return
		}
		req := in.ToRequest()
		if s := validateNetworkOptimizationRequest(req); s != "" {
			c.JSON(400, gin.H{"error": s})
			return
		}
		v, e := raytracer.EvaluateNetworkContext(c.Request.Context(), req, pack.BuildingIndex)
		writeRFResponse(c, v, e)
	})
	router.POST("/api/simulate", func(c *gin.Context) {
		var in raytracer.StaticSimulationRequestInput
		if !bindJSON(c, &in, "simulation") {
			return
		}
		req := in.ToRequest()
		if s := validateSimulationRequest(req); s != "" {
			c.JSON(400, gin.H{"error": s})
			return
		}
		v, e := raytracer.SimulateStaticRaysContext(c.Request.Context(), req, pack.BuildingIndex)
		writeRFResponse(c, v, e)
	})
	router.POST("/api/explain-network-cell", func(c *gin.Context) {
		var in raytracer.NetworkCellExplanationRequestInput
		if !bindJSON(c, &in, "explanation") {
			return
		}
		req := in.ToRequest()
		if msg := raytracer.ValidateNetworkCellExplanationRequest(req); msg != "" {
			c.JSON(400, gin.H{"error": msg})
			return
		}
		v, e := raytracer.ExplainNetworkCellContext(c.Request.Context(), req, pack.BuildingIndex)
		writeRFResponse(c, v, e)
	})
	output := os.Getenv("ATOM_CAPACITY_OUTPUT")
	if e = os.MkdirAll(output, 0755); e != nil {
		t.Fatal(e)
	}
	rows := []map[string]any{}
	request := func(endpoint string, body []byte, cancelDuring bool) *httptest.ResponseRecorder {
		runtime.GC()
		var before, after runtime.MemStats
		runtime.ReadMemStats(&before)
		rssBefore := capacityRSS()
		sampledRSS := rssBefore
		sampledHeap := before.HeapAlloc
		var mu sync.Mutex
		done := make(chan struct{})
		joined := make(chan struct{})
		go func() {
			defer close(joined)
			ticker := time.NewTicker(200 * time.Millisecond)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					var m runtime.MemStats
					runtime.ReadMemStats(&m)
					rss := capacityRSS()
					mu.Lock()
					if rss > sampledRSS {
						sampledRSS = rss
					}
					if m.HeapAlloc > sampledHeap {
						sampledHeap = m.HeapAlloc
					}
					mu.Unlock()
				}
			}
		}()
		req := httptest.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx, cancel := context.WithCancel(req.Context())
		defer cancel()
		req = req.WithContext(ctx)
		var timer *time.Timer
		if cancelDuring {
			timer = time.AfterFunc(20*time.Millisecond, cancel)
		}
		response := httptest.NewRecorder()
		cpuBefore := capacityCPU()
		start := time.Now()
		router.ServeHTTP(response, req)
		elapsed := time.Since(start).Seconds()
		cpu := capacityCPU() - cpuBefore
		if timer != nil {
			timer.Stop()
		}
		close(done)
		<-joined
		runtime.ReadMemStats(&after)
		rssAfter := capacityRSS()
		if rssAfter > sampledRSS {
			sampledRSS = rssAfter
		}
		if after.HeapAlloc > sampledHeap {
			sampledHeap = after.HeapAlloc
		}
		hash := sha256.Sum256(response.Body.Bytes())
		row := map[string]any{"endpoint": endpoint, "wall_seconds": elapsed, "cpu_seconds": cpu, "status": response.Code, "request_bytes": len(body), "response_bytes": response.Body.Len(), "response_sha256": hex.EncodeToString(hash[:]), "rss_before_bytes": rssBefore, "rss_sampled_max_bytes": sampledRSS, "rss_after_bytes": rssAfter, "heap_before_bytes": before.HeapAlloc, "heap_sampled_max_bytes": sampledHeap, "heap_after_bytes": after.HeapAlloc, "allocation_bytes": after.TotalAlloc - before.TotalAlloc, "rate_remaining": response.Header().Get("RateLimit-Remaining"), "cancelled": cancelDuring, "goroutines_after": runtime.NumGoroutine()}
		if len(limiter.slots) != 0 || limiter.clients["192.0.2.1"].active != 0 {
			t.Fatal("slots leaked")
		}
		if cancelDuring {
			if response.Body.Len() != 0 || ctx.Err() != context.Canceled {
				t.Fatalf("partial cancellation output %s", response.Body)
			}
			row["no_partial_success"] = true
		} else if response.Code != 200 && !(mode == "workflow" && response.Code == 429) {
			t.Fatalf("%s status %d: %s", endpoint, response.Code, response.Body)
		}
		if !cancelDuring {
			if e = os.WriteFile(filepath.Join(output, capacityResponseName(fixtureName, mode, endpoint, len(rows))), response.Body.Bytes(), 0644); e != nil {
				t.Fatal(e)
			}
		}
		rows = append(rows, row)
		return response
	}
	switch mode {
	case "optimize":
		r := request("/api/optimize-network", f.Network, false)
		var v raytracer.NetworkOptimizationResponse
		_ = json.Unmarshal(r.Body.Bytes(), &v)
		rows[0]["proposals"] = timing.Proposals
		rows[0]["unique_states"] = len(timing.States)
		rows[0]["cell_cache_hits"] = timing.CellMemoHits
		rows[0]["cell_cache_misses"] = timing.CellMemoMisses
		rows[0]["pareto_count"] = len(v.ParetoFrontier)
		rows[0]["pareto_states_before_limit"] = timing.ParetoCandidates
		rows[0]["feasible_archive"] = timing.FeasibleArchive
		rows[0]["solutions_returned"] = len(v.ParetoFrontier)
		rows[0]["recommendation"] = v.Optimization.RecommendedSolutionID
		rows[0]["fingerprint"] = v.ScenarioFingerprint
		rows[0]["completion_reason"] = "legacy two passes completed"
		if timing.Proposals != 72*f.N+2 {
			t.Fatalf("unexpected proposal count %d", timing.Proposals)
		}
	case "evaluate":
		request("/api/evaluate-network", f.Network, false)
		for _, sim := range f.Simulations {
			request("/api/simulate", sim, false)
		}
	case "interference":
		r := request("/api/interference", f.Interference, false)
		var v raytracer.InterferenceResponse
		_ = json.Unmarshal(r.Body.Bytes(), &v)
		rows[0]["samples"] = v.Stats.SampleCount
		rows[0]["features"] = len(v.GeoJSON.Features)
		rows[0]["per_serving_cells"] = len(v.Stats.PerServingCell)
		if v.Stats.SampleCount != len(v.GeoJSON.Features) {
			t.Fatal("incomplete samples")
		}
	case "explain":
		request("/api/explain-network-cell", f.Explanation, false)
	case "workflow":
		evaluation := func() bool {
			if request("/api/evaluate-network", f.Network, false).Code == 429 {
				return false
			}
			for _, sim := range f.Simulations {
				if request("/api/simulate", sim, false).Code == 429 {
					return false
				}
			}
			return true
		}
		if evaluation() && request("/api/interference", f.Interference, false).Code != 429 {
			evaluation()
		}
	case "cancel":
		request("/api/optimize-network", f.Network, true)
		request("/api/evaluate-network", f.Network, true)
		request("/api/interference", f.Interference, true)
	default:
		t.Fatal("unknown mode")
	}
	ledger := map[string]any{"n": f.N, "frequency_ghz": f.Frequency, "mode": mode, "rows": rows, "go_version": runtime.Version(), "gomaxprocs": runtime.GOMAXPROCS(0), "cpus": runtime.NumCPU(), "buildings": pack.BuildingIndex.Len(), "deadline_seconds": defaultRFRequestTimeout.Seconds(), "budget_limit": defaultRFRequestsPerMinute, "audit_max_cells": raytracer.MaxNetworkTowers}
	data, _ := json.MarshalIndent(ledger, "", "  ")
	if e = os.WriteFile(filepath.Join(output, fixtureName+"-"+mode+".metrics.json"), data, 0644); e != nil {
		t.Fatal(e)
	}
	t.Logf("CAPACITY_AUDIT %s", fmt.Sprintf("%s/%s", fixtureName, mode))
}

func TestNetworkCapacityBudgetSeries(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, n := range []int{6, 8, 9, 10, 12} {
		t.Run(strconv.Itoa(n), func(t *testing.T) {
			for _, flow := range []string{"A", "B", "C", "D"} {
				t.Run(flow, func(t *testing.T) {
					limiter := newRFRequestLimiter(2)
					now := time.Date(2026, 10, 3, 16, 0, 0, 0, time.UTC)
					limiter.now = func() time.Time { return now }
					router := gin.New()
					router.Use(protectExpensiveRFRoutes(limiter, defaultRFRequestTimeout, ""))
					for _, p := range []string{"/api/evaluate-network", "/api/simulate", "/api/interference", "/api/optimize-network"} {
						router.POST(p, func(c *gin.Context) { c.Status(204) })
					}
					paths := []string{"/api/evaluate-network"}
					for range n {
						paths = append(paths, "/api/simulate")
					}
					switch flow {
					case "B":
						paths = append(paths, "/api/interference")
					case "C":
						paths = append(append(paths, "/api/interference"), paths...)
					case "D":
						paths[0] = "/api/optimize-network"
					}
					for i, p := range paths {
						r := budgetRequest(router, p, "192.0.2.1:1000")
						want := 204
						if i >= 20 {
							want = 429
						}
						if r.Code != want {
							t.Fatalf("attempt %d status=%d want=%d", i+1, r.Code, want)
						}
					}
				})
			}
		})
	}
}

func capacityResponseName(fixture, mode, endpoint string, index int) string {
	name := fixture + "-" + mode + strings.TrimPrefix(endpoint, "/api/")
	if endpoint == "/api/simulate" {
		name += fmt.Sprintf("-%d", index)
	}
	return name + ".response.json"
}

func TestNetworkCapacityProductionValidation(t *testing.T) {
	if os.Getenv("ATOM_CAPACITY_FIXTURES") == "" {
		t.Skip("inventory fixtures required")
	}
	if raytracer.MaxNetworkTowers != 8 {
		t.Skip("production cap check applies only to unmodified checkout")
	}
	rows := []map[string]any{}
	for _, n := range []int{6, 8, 10, 12} {
		b, e := os.ReadFile(filepath.Join(os.Getenv("ATOM_CAPACITY_FIXTURES"), fmt.Sprintf("%d-28.json", n)))
		if e != nil {
			t.Fatal(e)
		}
		var f capacityFixture
		_ = json.Unmarshal(b, &f)
		var in raytracer.NetworkOptimizationRequestInput
		_ = json.Unmarshal(f.Network, &in)
		req := in.ToRequest()
		var inter raytracer.InterferenceRequestInput
		_ = json.Unmarshal(f.Interference, &inter)
		networkError := validateNetworkOptimizationRequest(req)
		interError := raytracer.ValidateInterferenceRequest(inter.ToRequest())
		if (n <= 8) != (networkError == "") || (n <= 8) != (interError == "") {
			t.Fatalf("validation mismatch N=%d network=%s interference=%s", n, networkError, interError)
		}
		configs := make([]raytracer.NetworkOptimizationCellConfiguration, n)
		explanationError := raytracer.ValidateNetworkCellExplanationRequest(raytracer.NetworkCellExplanationRequest{SolutionID: "audit", CellID: req.Towers[0].ID, Baseline: &raytracer.NetworkOptimizationSolution{CellConfigurations: configs}, Solution: &raytracer.NetworkParetoSolution{Towers: make([]raytracer.ParetoTowerSetting, n)}})
		recError := raytracer.ValidateSiteRecommendationRequest(raytracer.SiteRecommendationRequest{NetworkTech: "5g", Network: req})
		buildingError := raytracer.ValidateBuildingEntryAnalysisRequest(raytracer.BuildingEntryAnalysisRequest{Network: req})
		rows = append(rows, map[string]any{"n": n, "network_error": networkError, "interference_error": interError, "explanation_error": explanationError, "recommendations_error": recError, "building_entry_error": buildingError})
	}
	if out := os.Getenv("ATOM_CAPACITY_OUTPUT"); out != "" {
		data, _ := json.MarshalIndent(rows, "", "  ")
		if e := os.WriteFile(filepath.Join(out, "production-validation.metrics.json"), data, 0644); e != nil {
			t.Fatal(e)
		}
	}
}
