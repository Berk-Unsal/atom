package raytracer

import (
	"context"
	"sync"
	"time"
)

// NetworkOptimizationTiming is an opt-in, request-local audit collector. It is
// deliberately separate from scientific responses and fingerprints. Phases can
// overlap (RF subsystem timings are nested within candidate evaluations).
type NetworkOptimizationTiming struct {
	mu                sync.Mutex
	Phases            map[string]time.Duration
	Events            []NetworkOptimizationTimingEvent
	Evaluations       []time.Duration
	States            map[string]int
	Proposals         int
	Feasible          int
	Infeasible        int
	Pareto            int
	FeasibleArchive   int
	ScoredCandidates  int
	ParetoCandidates  int
	RankedCandidates  int
	CellMemoHits      int
	CellMemoMisses    int
	SpatialQueries    int
	SpatialCandidates int
	SpatialMax        int
	DetailedSpatial   bool
}

type NetworkOptimizationTimingEvent struct {
	Phase      string
	Pass       int
	Coordinate int
	Elapsed    time.Duration
}

type networkOptimizationTimingKey struct{}

func WithNetworkOptimizationTiming(ctx context.Context, timing *NetworkOptimizationTiming) context.Context {
	return context.WithValue(ctx, networkOptimizationTimingKey{}, timing)
}

func optimizationTiming(ctx context.Context) *NetworkOptimizationTiming {
	timing, _ := ctx.Value(networkOptimizationTimingKey{}).(*NetworkOptimizationTiming)
	return timing
}

// NetworkOptimizationTimingFromContext retrieves an optional collector for the
// HTTP handler. Read counters only after optimizer workers have joined.
func NetworkOptimizationTimingFromContext(ctx context.Context) *NetworkOptimizationTiming {
	return optimizationTiming(ctx)
}

func timeOptimizationPhase(ctx context.Context, phase string) func() {
	return optimizationTiming(ctx).Measure(phase)
}

// Measure records wall time once, including when called by a deferred cleanup.
func (timing *NetworkOptimizationTiming) Measure(phase string) func() {
	if timing == nil {
		return func() {}
	}
	start := time.Now()
	var once sync.Once
	return func() {
		once.Do(func() {
			timing.mu.Lock()
			defer timing.mu.Unlock()
			if timing.Phases == nil {
				timing.Phases = make(map[string]time.Duration)
			}
			timing.Phases[phase] += time.Since(start)
		})
	}
}

func timeOptimizationStep(ctx context.Context, phase string, pass, coordinate int) func() {
	timing := optimizationTiming(ctx)
	if timing == nil {
		return func() {}
	}
	start := time.Now()
	var once sync.Once
	return func() {
		once.Do(func() {
			timing.Events = append(timing.Events, NetworkOptimizationTimingEvent{phase, pass, coordinate, time.Since(start)})
		})
	}
}

func recordOptimizationSpatialQuery(ctx context.Context, candidates int) {
	timing := optimizationTiming(ctx)
	if timing == nil || !timing.DetailedSpatial {
		return
	}
	timing.mu.Lock()
	defer timing.mu.Unlock()
	timing.SpatialQueries++
	timing.SpatialCandidates += candidates
	if candidates > timing.SpatialMax {
		timing.SpatialMax = candidates
	}
}

func timedNetworkCandidate(ctx context.Context, req NetworkOptimizationRequest, azimuths []float64, buildings *BuildingIndex, prepared *PreparedNetworkOptimizationContext) (NetworkOptimizationStats, error) {
	timing := optimizationTiming(ctx)
	if timing == nil {
		return networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
	}
	if timing.States == nil {
		timing.States = make(map[string]int)
	}
	timing.Proposals++
	start := time.Now()
	stats, err := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
	timing.Evaluations = append(timing.Evaluations, time.Since(start))
	if err == nil {
		timing.States[networkSearchStateKey(req.Towers, azimuths)]++
		if len(OptimizationConstraintViolations(stats, req.Optimization.Constraints)) == 0 {
			timing.Feasible++
		} else {
			timing.Infeasible++
		}
	}
	return stats, err
}
