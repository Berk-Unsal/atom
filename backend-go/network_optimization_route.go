package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

// Shared by production and the gated wall-clock audit, including decoding,
// validation and timeout serialization.
func registerNetworkOptimizationRoute(router *gin.Engine, buildings func() *raytracer.BuildingIndex) {
	router.POST("/api/optimize-network", func(c *gin.Context) {
		started := time.Now()
		timing := raytracer.NetworkOptimizationTimingFromContext(c.Request.Context())
		if timing == nil {
			timing = &raytracer.NetworkOptimizationTiming{}
			c.Request = c.Request.WithContext(raytracer.WithNetworkOptimizationTiming(c.Request.Context(), timing))
		}
		decodeDone := timing.Measure("decode_validation")
		defer decodeDone()
		var input raytracer.NetworkOptimizationRequestInput
		if !bindJSON(c, &input, "network optimization") {
			return
		}
		if input.MissingRequiredTowerFields() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "each tower must include id, tower_lon, and tower_lat"})
			return
		}
		req := input.ToRequest()
		if validationError := validateNetworkOptimizationRequest(req); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		decodeDone()
		payload, runErr := raytracer.OptimizeNetworkContext(c.Request.Context(), req, buildings())
		serializationDone := timing.Measure("response_serialization")
		writeRFResponse(c, payload, runErr)
		serializationDone()
		reason := "complete"
		if errors.Is(runErr, context.DeadlineExceeded) {
			reason = "deadline"
		} else if errors.Is(runErr, context.Canceled) {
			reason = "canceled"
		} else if runErr != nil {
			reason = "error"
		}
		policy := strings.ToLower(strings.TrimSpace(req.SearchPolicy))
		if policy == "" {
			policy = raytracer.LegacyNetworkSearchPolicy
		}
		proposals, uniqueStates := timing.Proposals, len(timing.States)
		if policy != raytracer.LegacyNetworkSearchPolicy {
			// Opt-in policies own their existing state memoization ledger. A
			// canceled run has no completed metadata; don't report false zeros.
			proposals, uniqueStates = -1, -1
			if search := payload.Optimization.Search; search != nil {
				proposals, uniqueStates = search.EvaluationRequests, search.UniqueEvaluations
			}
		}
		deadlineMS := int64(0)
		if deadline, ok := c.Request.Context().Deadline(); ok {
			deadlineMS = deadline.Sub(started).Milliseconds()
		}
		// No payloads, coordinates, geometry or per-candidate production logs.
		slog.Info("network optimization completed", "operation", "optimize_network", "search_policy", policy,
			"selected_cells", len(req.Towers), "candidate_proposals", proposals, "unique_states", uniqueStates,
			"cell_memo_hits", timing.CellMemoHits, "cell_memo_misses", timing.CellMemoMisses,
			"elapsed_ms", time.Since(started).Milliseconds(), "deadline_ms", deadlineMS, "completion_reason", reason)
	})
}
