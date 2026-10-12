package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

// Gated: production Ankara runs can take minutes before the runtime correction.
// Inputs are exact buildNetworkOptimizationPayload outputs, never reduced by
// this harness. A zero deadline is allowed ONLY in this controlled audit.
func TestNetworkOptimizationDeadlineWallClockAudit(t *testing.T) {
	if os.Getenv("ATOM_RUN_DEADLINE_AUDIT") != "1" {
		t.Skip("set ATOM_RUN_DEADLINE_AUDIT=1 and ATOM_DEADLINE_FIXTURES")
	}
	pack, err := raytracer.LoadDatasetPack("../data-pipeline")
	if err != nil {
		t.Fatal(err)
	}
	buildings := pack.BuildingIndex
	if os.Getenv("ATOM_DEADLINE_SYNTHETIC") == "1" {
		buildings = raytracer.EmptyBuildingIndex()
	}
	gin.SetMode(gin.TestMode)
	for _, fixture := range strings.Split(os.Getenv("ATOM_DEADLINE_CASES"), ",") {
		t.Run(fixture, func(t *testing.T) {
			body, err := os.ReadFile(filepath.Join(os.Getenv("ATOM_DEADLINE_FIXTURES"), fixture+".json"))
			if err != nil {
				t.Fatal(err)
			}
			seconds, _ := strconv.ParseFloat(os.Getenv("ATOM_DEADLINE_SECONDS"), 64)
			limiter := newRFRequestLimiter(2)
			timing := &raytracer.NetworkOptimizationTiming{DetailedSpatial: true}
			var cancellationAt time.Time
			var deadlineAt time.Time
			router := gin.New()
			router.Use(limitRequestBody(maxRequestBodyBytes))
			var admissionDone func()
			router.Use(func(c *gin.Context) {
				c.Request = c.Request.WithContext(raytracer.WithNetworkOptimizationTiming(c.Request.Context(), timing))
				admissionDone = timing.Measure("request_admission")
				c.Next()
			})
			if os.Getenv("ATOM_DEADLINE_UNPROTECTED") != "1" {
				router.Use(protectExpensiveRFRoutes(limiter, time.Duration(seconds*float64(time.Second)), ""))
			}
			router.Use(func(c *gin.Context) {
				admissionDone()
				ctx := c.Request.Context()
				deadlineAt, _ = ctx.Deadline()
				observed := make(chan struct{})
				stop := context.AfterFunc(ctx, func() {
					if ctx.Err() == context.DeadlineExceeded {
						cancellationAt = time.Now()
					}
					close(observed)
				})
				c.Next()
				if !stop() {
					<-observed
				}
			})
			registerNetworkOptimizationRoute(router, func() *raytracer.BuildingIndex { return buildings })
			request := httptest.NewRequest(http.MethodPost, "/api/optimize-network", bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			started := time.Now()
			router.ServeHTTP(response, request)
			elapsed := time.Since(started)
			expectedStatus := http.StatusOK
			if strings.HasPrefix(fixture, "pathological-") && seconds > 0 {
				expectedStatus = http.StatusGatewayTimeout
			}
			if configured, err := strconv.Atoi(os.Getenv("ATOM_DEADLINE_EXPECT_STATUS")); err == nil {
				expectedStatus = configured
			}
			if response.Code != expectedStatus {
				t.Fatalf("status=%d expected=%d body=%s", response.Code, expectedStatus, response.Body)
			}
			state := limiter.clients["192.0.2.1"]
			if len(limiter.slots) != 0 || (state != nil && state.active != 0) {
				t.Fatal("RF slots leaked")
			}
			var result raytracer.NetworkOptimizationResponse
			if response.Code == 200 {
				if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
			} else if response.Code != 504 || response.Body.String() != `{"error":"RF analysis exceeded its request deadline"}` {
				t.Fatalf("unexpected response %d %s", response.Code, response.Body)
			}
			samples := append([]time.Duration(nil), timing.Evaluations...)
			sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
			distribution := map[string]float64{}
			if len(samples) > 0 {
				for key, q := range map[string]float64{"min": 0, "median": .5, "p90": .9, "p95": .95, "max": 1} {
					distribution[key] = float64(samples[int(float64(len(samples)-1)*q)]) / float64(time.Millisecond)
				}
			}
			phases := map[string]float64{}
			for key, value := range timing.Phases {
				phases[key] = float64(value) / float64(time.Millisecond)
			}
			hash := sha256.Sum256(response.Body.Bytes())
			requestHash := sha256.Sum256(body)
			row := map[string]any{
				"stage": os.Getenv("ATOM_DEADLINE_STAGE"), "case": fixture, "buildings": buildings.Len(), "status": response.Code,
				"elapsed_ms": float64(elapsed) / float64(time.Millisecond), "deadline_seconds": seconds,
				"candidate_proposals": timing.Proposals, "unique_states": len(timing.States), "rf_evaluations": len(timing.Evaluations),
				"duplicate_network_aggregations": len(timing.Evaluations) - len(timing.States), "cell_memo_hits": timing.CellMemoHits, "cell_memo_misses": timing.CellMemoMisses, "feasible": timing.Feasible, "infeasible": timing.Infeasible,
				"pareto_returned": timing.Pareto, "pareto_candidates": timing.ParetoCandidates, "ranked_candidates": timing.RankedCandidates, "feasible_archive": timing.FeasibleArchive, "scored_candidates": timing.ScoredCandidates, "phases_ms": phases, "candidate_ms": distribution, "steps": timing.Events,
				"spatial_queries": timing.SpatialQueries, "spatial_candidates": timing.SpatialCandidates, "spatial_max": timing.SpatialMax,
				"response_sha256": hex.EncodeToString(hash[:]), "request_sha256": hex.EncodeToString(requestHash[:]),
				"scenario_fingerprint": result.ScenarioFingerprint, "recommended": result.Optimization.RecommendedSolutionID, "domain": result.OptimizationDomain,
				"go_version": runtime.Version(), "cpus": runtime.NumCPU(), "gomaxprocs": runtime.GOMAXPROCS(0),
				"rate_remaining": response.Header().Get("RateLimit-Remaining"), "goroutines_after": runtime.NumGoroutine(),
			}
			if !cancellationAt.IsZero() {
				row["cancellation_at_ms"] = float64(cancellationAt.Sub(started)) / float64(time.Millisecond)
				row["cancellation_latency_ms"] = float64(started.Add(elapsed).Sub(cancellationAt)) / float64(time.Millisecond)
				row["deadline_at_ms"] = float64(deadlineAt.Sub(started)) / float64(time.Millisecond)
			}
			output, _ := json.Marshal(row)
			t.Logf("DEADLINE_AUDIT %s", output)
			if dir := os.Getenv("ATOM_DEADLINE_OUTPUT"); dir != "" {
				if err := os.MkdirAll(dir, 0755); err != nil {
					t.Fatal(err)
				}
				name := fmt.Sprintf("%s-%s", os.Getenv("ATOM_DEADLINE_STAGE"), fixture)
				if err := os.WriteFile(filepath.Join(dir, name+".metrics.json"), output, 0644); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(dir, name+".response.json"), response.Body.Bytes(), 0644); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}
