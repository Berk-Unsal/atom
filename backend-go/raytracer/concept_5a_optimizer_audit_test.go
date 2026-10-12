package raytracer

// Concept 5A is intentionally implemented as a diagnostic test harness. The
// default search below mirrors the current production optimizer, but all
// knobs, traces, exhaustive oracles, and JSON writers live in _test.go so the
// production optimizer and RF contract remain untouched.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

const concept5AAuditVersion = `concept-5a-audit-v1`

type concept5ASearchOptions struct {
	Label          string    `json:"label"`
	Passes         int       `json:"passes,omitempty"`
	UntilStable    bool      `json:"until_stable,omitempty"`
	MaxPasses      int       `json:"max_passes,omitempty"`
	StepDeg        float64   `json:"azimuth_step_deg"`
	CellOrder      []int     `json:"cell_order_indices"`
	CellOrderIDs   []string  `json:"cell_order_ids,omitempty"`
	StartAzimuths  []float64 `json:"start_azimuths,omitempty"`
	StartMode      string    `json:"start_mode,omitempty"`
	Memoize        bool      `json:"memoize,omitempty"`
	SearchBehavior string    `json:"search_behavior,omitempty"`
}

type concept5AUpdate struct {
	Pass                    int       `json:"pass"`
	CellIndex               int       `json:"cell_index"`
	CellID                  string    `json:"cell_id"`
	PreviousConfiguration   []float64 `json:"previous_configuration"`
	ChosenConfiguration     []float64 `json:"chosen_configuration"`
	PreviousStateKey        string    `json:"previous_state_key"`
	ChosenStateKey          string    `json:"chosen_state_key"`
	CandidateCount          int       `json:"candidate_count"`
	ChosenAzimuthDeg        float64   `json:"chosen_azimuth_deg"`
	ChosenScore             float64   `json:"chosen_score"`
	PreviousScoreKnown      bool      `json:"previous_score_known"`
	PreviousScore           float64   `json:"previous_score,omitempty"`
	ScoreDelta              float64   `json:"score_delta,omitempty"`
	ChosenFeasible          bool      `json:"chosen_feasible"`
	Changed                 bool      `json:"changed"`
	RequestedEvaluationsEnd int       `json:"requested_evaluations_end"`
}

type concept5ASearchResult struct {
	Options                      concept5ASearchOptions
	ScenarioFingerprint          string
	SearchFingerprint            string
	BaselineAzimuths             []float64
	FinalAzimuths                []float64
	BaselineStats                NetworkOptimizationStats
	FinalStats                   NetworkOptimizationStats
	RecommendedStats             NetworkOptimizationStats
	RecommendedID                string
	EvaluatedCandidates          int
	UniqueStateCount             int
	DuplicateRequestedStates     int
	CacheHits                    int
	EvaluatedStateSetFingerprint string
	PassesExecuted               int
	Termination                  string
	FixedPoint                   bool
	RepeatedStateCount           int
	CycleDetected                bool
	CycleLength                  int
	StateTrace                   []string
	Updates                      []concept5AUpdate
	Pareto                       []NetworkParetoSolution
	Evaluated                    []networkOptimizationCandidate
}

type concept5AExhaustiveCandidate struct {
	Key       string
	Azimuths  []float64
	Stats     NetworkOptimizationStats
	Utilities OptimizationUtilities
	Score     float64
	Feasible  bool
}

type concept5AExhaustiveOracle struct {
	CandidateCount             int
	FeasibleCandidateCount     int
	BestKey                    string
	BestScore                  float64
	BestStats                  NetworkOptimizationStats
	ParetoKeys                 []string
	ParetoCandidateCount       int
	ProductionRecommendedKey   string
	ProductionRecommendedScore float64
	ScoreRegret                float64
	RecommendationRecovered    bool
	ParetoRecall               float64
	ParetoPrecision            float64
	DiscoveredParetoKeys       []string
	MissedParetoKeys           []string
	UnexpectedParetoKeys       []string
	Search                     concept5ASearchResult
}

type concept5ASyntheticPoint struct {
	Score      float64            `json:"score"`
	Feasible   bool               `json:"feasible"`
	Objectives map[string]float64 `json:"objectives,omitempty"`
}

type concept5ASyntheticFixture struct {
	Name     string                             `json:"name"`
	Values   []int                              `json:"values"`
	Points   map[string]concept5ASyntheticPoint `json:"points"`
	Start    []int                              `json:"start"`
	Expected map[string]any                     `json:"expected"`
}

type concept5ASyntheticRun struct {
	Fixture           string   `json:"fixture"`
	Start             []int    `json:"start"`
	Final             []int    `json:"final"`
	Score             float64  `json:"score"`
	Feasible          bool     `json:"feasible"`
	GlobalBest        []int    `json:"global_best,omitempty"`
	GlobalBestScore   float64  `json:"global_best_score"`
	RecoveredGlobal   bool     `json:"recovered_global"`
	ParetoKeys        []string `json:"pareto_keys,omitempty"`
	Trace             []string `json:"trace"`
	StrictTiePolicy   string   `json:"strict_tie_policy"`
	FeasibilityPolicy string   `json:"feasibility_policy"`
}

type concept5AProductionSnapshot struct {
	ScenarioFingerprint string                     `json:"scenario_fingerprint"`
	ScenarioSchema      string                     `json:"scenario_schema_version"`
	OptimizationRunID   string                     `json:"optimization_run_id"`
	BaselineAzimuths    []float64                  `json:"baseline_azimuths"`
	OptimizedAzimuths   []float64                  `json:"optimized_azimuths"`
	BaselineScore       float64                    `json:"baseline_score"`
	OptimizedScore      float64                    `json:"optimized_score"`
	BaselineRaw         OptimizationRawMetrics     `json:"baseline_raw_metrics"`
	OptimizedRaw        OptimizationRawMetrics     `json:"optimized_raw_metrics"`
	RecommendedID       string                     `json:"recommended_id"`
	ParetoIDs           []string                   `json:"pareto_ids"`
	ParetoScores        []float64                  `json:"pareto_scores"`
	ParetoRawMetrics    []OptimizationRawMetrics   `json:"pareto_raw_metrics"`
	Domain              OptimizationDomainMetadata `json:"optimization_domain"`
	Outcome             OptimizationOutcome        `json:"optimization_outcome"`
	RFContract          RFContractMetadata         `json:"rf_contract"`
}

func defaultConcept5AOptions(req NetworkOptimizationRequest) concept5ASearchOptions {
	order := make([]int, len(req.Towers))
	ids := make([]string, len(req.Towers))
	for index, tower := range req.Towers {
		order[index] = index
		ids[index] = tower.ID
	}
	return concept5ASearchOptions{
		Label:          `production-default`,
		Passes:         2,
		StepDeg:        10,
		CellOrder:      order,
		CellOrderIDs:   ids,
		StartMode:      `request_azimuths_normalized`,
		SearchBehavior: `fixed_pass_coordinate_descent`,
	}
}

func concept5AAngleCount(step float64) int {
	if step <= 0 || math.IsNaN(step) || math.IsInf(step, 0) {
		return 0
	}
	return int(math.Round(360 / step))
}

func concept5AStateFingerprint(keys []string) string {
	ordered := append([]string(nil), keys...)
	sort.Strings(ordered)
	serialized, _ := json.Marshal(ordered)
	digest := sha256.Sum256(serialized)
	return `concept-5a-states-` + hex.EncodeToString(digest[:8])
}

func concept5ASearchFingerprint(req NetworkOptimizationRequest, options concept5ASearchOptions, starts []float64) string {
	identity := struct {
		Version             string             `json:"version"`
		ScenarioFingerprint string             `json:"scenario_fingerprint"`
		StepDeg             float64            `json:"azimuth_step_deg"`
		Passes              int                `json:"passes"`
		UntilStable         bool               `json:"until_stable"`
		MaxPasses           int                `json:"max_passes"`
		CellOrder           []int              `json:"cell_order"`
		StartAzimuths       []float64          `json:"start_azimuths"`
		Memoize             bool               `json:"memoize"`
		ObjectiveConfig     OptimizationConfig `json:"objective_config"`
		RFProfile           CellRFProfile      `json:"rf_profile"`
	}{
		Version:             concept5AAuditVersion,
		ScenarioFingerprint: NetworkScenarioFingerprint(req),
		StepDeg:             options.StepDeg,
		Passes:              options.Passes,
		UntilStable:         options.UntilStable,
		MaxPasses:           options.MaxPasses,
		CellOrder:           append([]int(nil), options.CellOrder...),
		StartAzimuths:       append([]float64(nil), starts...),
		Memoize:             options.Memoize,
		ObjectiveConfig:     req.Optimization,
		RFProfile:           req.RFProfile,
	}
	serialized, _ := json.Marshal(identity)
	digest := sha256.Sum256(serialized)
	return `concept-5a-search-` + hex.EncodeToString(digest[:12])
}

func runConcept5ASearch(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, options concept5ASearchOptions) (concept5ASearchResult, error) {
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	if options.StepDeg <= 0 {
		options.StepDeg = 10
	}
	if len(options.CellOrder) == 0 {
		options = defaultConcept5AOptions(req)
	}
	if len(options.CellOrderIDs) != len(req.Towers) {
		options.CellOrderIDs = make([]string, len(req.Towers))
		for index, tower := range req.Towers {
			options.CellOrderIDs[index] = tower.ID
		}
	}
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return concept5ASearchResult{}, err
	}
	if _, err := NormalizeAvailableOptimizationPriorities(req.Optimization.Objectives, prepared.ObjectiveAvailability); err != nil {
		return concept5ASearchResult{}, err
	}
	starts := make([]float64, len(req.Towers))
	if len(options.StartAzimuths) == len(req.Towers) {
		for index, value := range options.StartAzimuths {
			starts[index] = normalizeDegrees(value)
		}
	} else {
		for index, tower := range req.Towers {
			starts[index] = normalizeDegrees(tower.AzimuthDeg)
		}
	}
	options.StartAzimuths = append([]float64(nil), starts...)
	result := concept5ASearchResult{
		Options:             options,
		ScenarioFingerprint: NetworkScenarioFingerprint(req),
		SearchFingerprint:   concept5ASearchFingerprint(req, options, starts),
		BaselineAzimuths:    append([]float64(nil), starts...),
		StateTrace:          []string{azimuthKey(starts)},
		Evaluated:           make([]networkOptimizationCandidate, 0, len(req.Towers)*72+2),
	}
	azimuths := append([]float64(nil), starts...)
	cache := make(map[string]NetworkOptimizationStats)
	seenStates := make(map[string]struct{})
	requestedKeys := make(map[string]struct{})
	evaluate := func(candidateAzimuths []float64) (NetworkOptimizationStats, error) {
		if err := ctx.Err(); err != nil {
			return NetworkOptimizationStats{}, err
		}
		key := azimuthKey(candidateAzimuths)
		result.EvaluatedCandidates++
		if _, exists := requestedKeys[key]; exists {
			result.DuplicateRequestedStates++
		}
		requestedKeys[key] = struct{}{}
		seenStates[key] = struct{}{}
		if options.Memoize {
			if cached, exists := cache[key]; exists {
				result.CacheHits++
				result.Evaluated = append(result.Evaluated, networkOptimizationCandidate{Azimuths: append([]float64(nil), candidateAzimuths...), Stats: cached})
				return cached, nil
			}
		}
		breakdown, evalErr := networkCoverageScoreBreakdownPreparedContext(ctx, req, candidateAzimuths, buildings, prepared)
		if evalErr != nil {
			return NetworkOptimizationStats{}, evalErr
		}
		if options.Memoize {
			cache[key] = breakdown
		}
		result.Evaluated = append(result.Evaluated, networkOptimizationCandidate{Azimuths: append([]float64(nil), candidateAzimuths...), Stats: breakdown})
		return breakdown, nil
	}

	baselineBreakdown, err := evaluate(azimuths)
	if err != nil {
		return concept5ASearchResult{}, err
	}
	result.BaselineStats, err = scoreNetworkOptimization(baselineBreakdown, req.Optimization, prepared.ObjectiveAvailability)
	if err != nil {
		return concept5ASearchResult{}, err
	}
	stateSeenAt := map[string]int{azimuthKey(azimuths): 0}
	passLimit := options.Passes
	if options.UntilStable {
		passLimit = options.MaxPasses
		if passLimit <= 0 {
			passLimit = 8
		}
	}
	if passLimit <= 0 {
		passLimit = 2
	}
	if options.StepDeg > 360 {
		options.StepDeg = 360
	}
	candidateCount := concept5AAngleCount(options.StepDeg)
	for pass := 0; pass < passLimit; pass++ {
		passStartKey := azimuthKey(azimuths)
		for _, towerIndex := range options.CellOrder {
			if towerIndex < 0 || towerIndex >= len(req.Towers) {
				return concept5ASearchResult{}, fmt.Errorf(`invalid Concept 5A cell order index %d`, towerIndex)
			}
			before := append([]float64(nil), azimuths...)
			previousKey := azimuthKey(before)
			bestAzimuth := azimuths[towerIndex]
			bestScore := math.Inf(-1)
			bestFeasible := false
			previousScore := 0.0
			previousScoreKnown := false
			if cached, exists := cache[previousKey]; exists {
				previousScore = optimizationObjectiveScoreWithAvailability(cached, req.Optimization, prepared.ObjectiveAvailability)
				previousScoreKnown = true
			}
			for candidate := 0; candidate < candidateCount; candidate++ {
				testAzimuths := append([]float64(nil), azimuths...)
				testAzimuths[towerIndex] = normalizeDegrees(float64(candidate) * options.StepDeg)
				breakdown, evalErr := evaluate(testAzimuths)
				if evalErr != nil {
					return concept5ASearchResult{}, evalErr
				}
				score := optimizationObjectiveScoreWithAvailability(breakdown, req.Optimization, prepared.ObjectiveAvailability)
				feasible := len(OptimizationConstraintViolations(breakdown, req.Optimization.Constraints)) == 0
				if (feasible && (!bestFeasible || score > bestScore)) || (!bestFeasible && !feasible && score > bestScore) {
					bestScore = score
					bestAzimuth = testAzimuths[towerIndex]
					bestFeasible = feasible
				}
			}
			azimuths[towerIndex] = bestAzimuth
			chosenKey := azimuthKey(azimuths)
			update := concept5AUpdate{
				Pass:                    pass + 1,
				CellIndex:               towerIndex,
				CellID:                  req.Towers[towerIndex].ID,
				PreviousConfiguration:   before,
				ChosenConfiguration:     append([]float64(nil), azimuths...),
				PreviousStateKey:        previousKey,
				ChosenStateKey:          chosenKey,
				CandidateCount:          candidateCount,
				ChosenAzimuthDeg:        azimuths[towerIndex],
				ChosenScore:             bestScore,
				PreviousScoreKnown:      previousScoreKnown,
				PreviousScore:           previousScore,
				ChosenFeasible:          bestFeasible,
				Changed:                 normalizeDegrees(before[towerIndex]) != normalizeDegrees(azimuths[towerIndex]),
				RequestedEvaluationsEnd: result.EvaluatedCandidates,
			}
			if previousScoreKnown {
				update.ScoreDelta = bestScore - previousScore
			}
			result.Updates = append(result.Updates, update)
			result.StateTrace = append(result.StateTrace, chosenKey)
			if previous, found := stateSeenAt[chosenKey]; found {
				result.RepeatedStateCount++
				cycleLength := len(result.StateTrace) - 1 - previous
				if cycleLength > 1 && !result.CycleDetected {
					result.CycleDetected = true
					result.CycleLength = cycleLength
				}
			}
			stateSeenAt[chosenKey] = len(result.StateTrace) - 1
		}
		result.PassesExecuted++
		fixedPoint := passStartKey == azimuthKey(azimuths)
		if fixedPoint {
			result.FixedPoint = true
		}
		if options.UntilStable && fixedPoint {
			result.Termination = `converged_fixed_point`
			break
		}
		if options.UntilStable && pass == passLimit-1 {
			result.Termination = `max_passes_without_fixed_point`
		}
	}
	if result.Termination == `` {
		if options.UntilStable {
			result.Termination = `converged_fixed_point`
		} else {
			result.Termination = `fixed_pass_count`
		}
	}
	result.FinalAzimuths = append([]float64(nil), azimuths...)
	finalBreakdown, err := evaluate(azimuths)
	if err != nil {
		return concept5ASearchResult{}, err
	}
	result.FinalStats, err = scoreNetworkOptimization(finalBreakdown, req.Optimization, prepared.ObjectiveAvailability)
	if err != nil {
		return concept5ASearchResult{}, err
	}
	result.Pareto = networkParetoFrontier(result.Evaluated, req.Towers, req.Optimization, prepared.ObjectiveAvailability)
	if len(result.Pareto) > 0 {
		result.RecommendedID = result.Pareto[0].ID
		result.RecommendedStats = result.Pareto[0].Stats
	} else {
		result.RecommendedStats = result.FinalStats
	}
	result.UniqueStateCount = len(seenStates)
	result.EvaluatedStateSetFingerprint = concept5AStateFingerprint(mapKeys(seenStates))
	return result, nil
}

func mapKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func concept5ASearchView(result concept5ASearchResult) map[string]any {
	return map[string]any{
		`label`:                           result.Options.Label,
		`algorithm`:                       `network_coordinate_descent`,
		`scenario_fingerprint`:            result.ScenarioFingerprint,
		`search_fingerprint`:              result.SearchFingerprint,
		`options`:                         result.Options,
		`baseline_azimuths`:               result.BaselineAzimuths,
		`final_azimuths`:                  result.FinalAzimuths,
		`baseline_stats`:                  result.BaselineStats,
		`final_stats`:                     result.FinalStats,
		`recommended_id`:                  result.RecommendedID,
		`recommended_stats`:               result.RecommendedStats,
		`pareto_ids`:                      concept5AParetoIDs(result.Pareto),
		`evaluated_candidates`:            result.EvaluatedCandidates,
		`unique_states`:                   result.UniqueStateCount,
		`duplicate_requested_states`:      result.DuplicateRequestedStates,
		`cache_hits`:                      result.CacheHits,
		`production_cache_behavior`:       !result.Options.Memoize,
		`evaluated_state_set_fingerprint`: result.EvaluatedStateSetFingerprint,
		`passes_executed`:                 result.PassesExecuted,
		`termination`:                     result.Termination,
		`fixed_point`:                     result.FixedPoint,
		`repeated_state_count`:            result.RepeatedStateCount,
		`cycle_detected`:                  result.CycleDetected,
		`cycle_length`:                    result.CycleLength,
		`state_trace`:                     result.StateTrace,
		`accepted_update_trace`:           result.Updates,
	}
}

func concept5AParetoIDs(frontier []NetworkParetoSolution) []string {
	ids := make([]string, 0, len(frontier))
	for _, solution := range frontier {
		ids = append(ids, solution.ID)
	}
	return ids
}

func concept5AParetoDominates(left, right concept5AExhaustiveCandidate, objectiveIDs []string, availability map[string]OptimizationObjectiveAvailability) bool {
	betterOrEqual := true
	strictlyBetter := false
	for _, id := range objectiveIDs {
		if status, exists := availability[id]; exists && !status.Available {
			continue
		}
		leftValue := concept5AObjectiveUtility(left.Utilities, id)
		rightValue := concept5AObjectiveUtility(right.Utilities, id)
		if leftValue < rightValue {
			return false
		}
		if leftValue > rightValue {
			strictlyBetter = true
		}
	}
	return betterOrEqual && strictlyBetter
}

func concept5AObjectiveUtility(utilities OptimizationUtilities, id string) float64 {
	switch id {
	case `demand`:
		return utilities.Demand
	case `residential`:
		return utilities.Residential
	case `coverage`:
		return utilities.Coverage
	case `overlap`:
		return utilities.Overlap
	case radioQualityOptimizationObjectiveID:
		return utilities.RadioQuality
	default:
		return 0
	}
}

func concept5AEnabledObjectiveIDs(config OptimizationConfig) []string {
	ids := make([]string, 0, len(config.Objectives))
	for _, objective := range config.Objectives {
		if objective.Weight > 0 {
			ids = append(ids, objective.ID)
		}
	}
	return ids
}

func concept5AIndependentPareto(candidates []concept5AExhaustiveCandidate, config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability) []concept5AExhaustiveCandidate {
	objectiveIDs := concept5AEnabledObjectiveIDs(config)
	frontier := make([]concept5AExhaustiveCandidate, 0)
	for index, candidate := range candidates {
		if !candidate.Feasible {
			continue
		}
		dominated := false
		for competitorIndex, competitor := range candidates {
			if index == competitorIndex || !competitor.Feasible {
				continue
			}
			if concept5AParetoDominates(competitor, candidate, objectiveIDs, availability) {
				dominated = true
				break
			}
		}
		if !dominated {
			frontier = append(frontier, candidate)
		}
	}
	sort.SliceStable(frontier, func(left, right int) bool {
		if frontier[left].Score == frontier[right].Score {
			return frontier[left].Key < frontier[right].Key
		}
		return frontier[left].Score > frontier[right].Score
	})
	return frontier
}

func concept5AExhaustiveRF(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, step float64, search concept5ASearchResult) (concept5AExhaustiveOracle, error) {
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return concept5AExhaustiveOracle{}, err
	}
	if _, err := NormalizeAvailableOptimizationPriorities(req.Optimization.Objectives, prepared.ObjectiveAvailability); err != nil {
		return concept5AExhaustiveOracle{}, err
	}
	count := concept5AAngleCount(step)
	candidates := make([]concept5AExhaustiveCandidate, 0)
	azimuths := make([]float64, len(req.Towers))
	var enumerate func(int) error
	enumerate = func(index int) error {
		if index == len(azimuths) {
			breakdown, evalErr := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
			if evalErr != nil {
				return evalErr
			}
			scored, scoreErr := scoreNetworkOptimization(breakdown, req.Optimization, prepared.ObjectiveAvailability)
			if scoreErr != nil {
				return scoreErr
			}
			candidates = append(candidates, concept5AExhaustiveCandidate{
				Key:       azimuthKey(azimuths),
				Azimuths:  append([]float64(nil), azimuths...),
				Stats:     scored,
				Utilities: NormalizeOptimizationObjectives(scored),
				Score:     scored.Score,
				Feasible:  len(OptimizationConstraintViolations(breakdown, req.Optimization.Constraints)) == 0,
			})
			return nil
		}
		for candidate := 0; candidate < count; candidate++ {
			azimuths[index] = normalizeDegrees(float64(candidate) * step)
			if err := enumerate(index + 1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := enumerate(0); err != nil {
		return concept5AExhaustiveOracle{}, err
	}
	feasibleCount := 0
	best := concept5AExhaustiveCandidate{}
	bestSet := false
	for _, candidate := range candidates {
		if !candidate.Feasible {
			continue
		}
		feasibleCount++
		if !bestSet || candidate.Score > best.Score || (candidate.Score == best.Score && candidate.Key < best.Key) {
			best = candidate
			bestSet = true
		}
	}
	oracles := concept5AIndependentPareto(candidates, req.Optimization, prepared.ObjectiveAvailability)
	oracleKeys := make([]string, 0, len(oracles))
	for _, candidate := range oracles {
		oracleKeys = append(oracleKeys, candidate.Key)
	}
	searchCandidates := make(map[string]concept5AExhaustiveCandidate, len(search.Evaluated))
	for _, candidate := range search.Evaluated {
		key := azimuthKey(candidate.Azimuths)
		if _, exists := searchCandidates[key]; exists {
			continue
		}
		scored, scoreErr := scoreNetworkOptimization(candidate.Stats, req.Optimization, prepared.ObjectiveAvailability)
		if scoreErr != nil {
			continue
		}
		searchCandidates[key] = concept5AExhaustiveCandidate{
			Key:       key,
			Azimuths:  append([]float64(nil), candidate.Azimuths...),
			Stats:     candidate.Stats,
			Utilities: NormalizeOptimizationObjectives(scored),
			Score:     scored.Score,
			Feasible:  len(OptimizationConstraintViolations(candidate.Stats, req.Optimization.Constraints)) == 0,
		}
	}
	discovered := make([]concept5AExhaustiveCandidate, 0, len(searchCandidates))
	for _, candidate := range searchCandidates {
		discovered = append(discovered, candidate)
	}
	discoveredFrontier := concept5AIndependentPareto(discovered, req.Optimization, prepared.ObjectiveAvailability)
	discoveredKeys := make([]string, 0, len(discoveredFrontier))
	for _, candidate := range discoveredFrontier {
		discoveredKeys = append(discoveredKeys, candidate.Key)
	}
	intersection := make(map[string]struct{})
	for _, key := range discoveredKeys {
		for _, oracleKey := range oracleKeys {
			if key == oracleKey {
				intersection[key] = struct{}{}
			}
		}
	}
	missed := make([]string, 0)
	for _, key := range oracleKeys {
		if _, exists := intersection[key]; !exists {
			missed = append(missed, key)
		}
	}
	unexpected := make([]string, 0)
	for _, key := range discoveredKeys {
		if _, exists := intersection[key]; !exists {
			unexpected = append(unexpected, key)
		}
	}
	productionScore := 0.0
	for _, candidate := range candidates {
		if candidate.Key == search.RecommendedID {
			productionScore = candidate.Score
			break
		}
	}
	recall := 0.0
	if len(oracleKeys) > 0 {
		recall = float64(len(intersection)) / float64(len(oracleKeys))
	}
	precision := 0.0
	if len(discoveredKeys) > 0 {
		precision = float64(len(intersection)) / float64(len(discoveredKeys))
	}
	return concept5AExhaustiveOracle{
		CandidateCount:             len(candidates),
		FeasibleCandidateCount:     feasibleCount,
		BestKey:                    best.Key,
		BestScore:                  best.Score,
		BestStats:                  best.Stats,
		ParetoKeys:                 oracleKeys,
		ParetoCandidateCount:       len(oracleKeys),
		ProductionRecommendedKey:   search.RecommendedID,
		ProductionRecommendedScore: productionScore,
		ScoreRegret:                best.Score - productionScore,
		RecommendationRecovered:    bestSet && search.RecommendedID == best.Key,
		ParetoRecall:               recall,
		ParetoPrecision:            precision,
		DiscoveredParetoKeys:       discoveredKeys,
		MissedParetoKeys:           missed,
		UnexpectedParetoKeys:       unexpected,
		Search:                     search,
	}, nil
}

func concept5AExhaustiveView(oracle concept5AExhaustiveOracle) map[string]any {
	return map[string]any{
		`candidate_count`:                             oracle.CandidateCount,
		`feasible_candidate_count`:                    oracle.FeasibleCandidateCount,
		`global_best_key`:                             oracle.BestKey,
		`global_best_score`:                           oracle.BestScore,
		`global_best_stats`:                           oracle.BestStats,
		`recommended_raw_metric_delta_vs_global_best`: concept5ARawMetricDelta(oracle.BestStats, oracle.Search.RecommendedStats),
		`true_pareto_keys`:                            oracle.ParetoKeys,
		`true_pareto_count`:                           oracle.ParetoCandidateCount,
		`production_recommended_key`:                  oracle.ProductionRecommendedKey,
		`production_recommended_score`:                oracle.ProductionRecommendedScore,
		`score_regret`:                                oracle.ScoreRegret,
		`recommendation_recovered`:                    oracle.RecommendationRecovered,
		`discovered_pareto_keys`:                      oracle.DiscoveredParetoKeys,
		`discovered_pareto_count`:                     len(oracle.DiscoveredParetoKeys),
		`pareto_intersection_count`:                   oracle.ParetoCandidateCount - len(oracle.MissedParetoKeys),
		`pareto_recall`:                               oracle.ParetoRecall,
		`pareto_precision`:                            oracle.ParetoPrecision,
		`missed_true_pareto_keys`:                     oracle.MissedParetoKeys,
		`unexpected_discovered_pareto_keys`:           oracle.UnexpectedParetoKeys,
		`search`:                                      concept5ASearchView(oracle.Search),
	}
}

func concept5AMakeProductionSnapshot(response NetworkOptimizationResponse) concept5AProductionSnapshot {
	baselineAzimuths := []float64(nil)
	baselineRaw := OptimizationRawMetrics{}
	baselineScore := 0.0
	if response.Baseline != nil {
		for _, cell := range response.Baseline.CellConfigurations {
			baselineAzimuths = append(baselineAzimuths, cell.AzimuthDeg)
		}
		baselineRaw = response.Baseline.Stats.RawMetrics
		baselineScore = response.Baseline.Stats.Score
	}
	optimizedAzimuths := make([]float64, 0, len(response.OptimizedTowers))
	for _, tower := range response.OptimizedTowers {
		optimizedAzimuths = append(optimizedAzimuths, tower.OptimalAzimuth)
	}
	paretoIDs := make([]string, 0, len(response.ParetoFrontier))
	paretoScores := make([]float64, 0, len(response.ParetoFrontier))
	paretoRaw := make([]OptimizationRawMetrics, 0, len(response.ParetoFrontier))
	for _, solution := range response.ParetoFrontier {
		paretoIDs = append(paretoIDs, solution.ID)
		paretoScores = append(paretoScores, solution.Score)
		paretoRaw = append(paretoRaw, solution.Stats.RawMetrics)
	}
	return concept5AProductionSnapshot{
		ScenarioFingerprint: response.ScenarioFingerprint,
		ScenarioSchema:      response.ScenarioSchemaVersion,
		OptimizationRunID:   response.OptimizationRunID,
		BaselineAzimuths:    baselineAzimuths,
		OptimizedAzimuths:   optimizedAzimuths,
		BaselineScore:       baselineScore,
		OptimizedScore:      response.Stats.Score,
		BaselineRaw:         baselineRaw,
		OptimizedRaw:        response.Stats.RawMetrics,
		RecommendedID:       response.Optimization.RecommendedSolutionID,
		ParetoIDs:           paretoIDs,
		ParetoScores:        paretoScores,
		ParetoRawMetrics:    paretoRaw,
		Domain:              response.OptimizationDomain,
		Outcome:             response.Optimization,
		RFContract:          response.RFContract,
	}
}

func concept5ATestPoint(center Point, widthMeters, heightMeters float64) []Point {
	latScale := 111_320.0
	lonScale := 111_320.0 * math.Cos(center.Lat*math.Pi/180)
	if math.Abs(lonScale) < 1e-9 {
		lonScale = 1e-9
	}
	dLon := widthMeters / 2 / lonScale
	dLat := heightMeters / 2 / latScale
	return []Point{
		{Lon: center.Lon - dLon, Lat: center.Lat - dLat},
		{Lon: center.Lon + dLon, Lat: center.Lat - dLat},
		{Lon: center.Lon + dLon, Lat: center.Lat + dLat},
		{Lon: center.Lon - dLon, Lat: center.Lat + dLat},
	}
}

func concept5ATestBuilding(id string, center Point, demand, residential float64) *BuildingFootprint {
	vertices := concept5ATestPoint(center, 8, 8)
	bounds, _ := BoundsFromPoints(vertices)
	return &BuildingFootprint{
		ID:                id,
		Tags:              map[string]string{"source": "concept-5a-controlled"},
		HeightMeters:      8,
		HeightSource:      HeightSourceExplicitLegacy,
		Material:          "concrete",
		Weight:            demand,
		DemandWeight:      demand,
		ResidentialDemand: residential,
		DensityScore:      demand,
		Bounds:            bounds,
		Vertices:          vertices,
	}
}

func concept5AControlledFixture(cellCount int) (NetworkOptimizationRequest, *BuildingIndex) {
	origin := Point{Lon: 32.8500, Lat: 39.9200}
	request := NetworkOptimizationRequest{
		Rays:         12,
		RadiusMeters: 190,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 90,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{
			{ID: "demand", Weight: 25},
			{ID: "residential", Weight: 25},
			{ID: "coverage", Weight: 25},
			{ID: "overlap", Weight: 25},
		}},
	}
	for index := 0; index < cellCount; index++ {
		bearing := float64(index) * 360 / float64(cellCount)
		point := DestinationPoint(origin, bearing, 65)
		request.Towers = append(request.Towers, NetworkTowerRequest{
			ID:         fmt.Sprintf("fixture-cell-%d", index+1),
			TowerLon:   point.Lon,
			TowerLat:   point.Lat,
			AzimuthDeg: normalizeDegrees(bearing + 20),
		})
	}
	footprints := make([]*BuildingFootprint, 0, cellCount*4+4)
	for index, tower := range request.Towers {
		center := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		for offset := 0; offset < 3; offset++ {
			bearing := float64(index)*360/float64(cellCount) + float64(offset-1)*24
			point := DestinationPoint(center, bearing, 42+float64(offset)*20)
			footprints = append(footprints, concept5ATestBuilding(
				fmt.Sprintf("fixture-demand-%d-%d", index, offset),
				point,
				float64(1+offset),
				float64(offset%2),
			))
		}
	}
	for index := 0; index < 4; index++ {
		point := DestinationPoint(origin, float64(index)*90+45, 88)
		footprints = append(footprints, concept5ATestBuilding(fmt.Sprintf("fixture-shared-%d", index), point, 2, 1))
	}
	return request, NewBuildingIndex(footprints)
}

func concept5AExhaustiveFixture(caseName string) (NetworkOptimizationRequest, *BuildingIndex) {
	origin := Point{Lon: 32.8500, Lat: 39.9200}
	second := DestinationPoint(origin, 180, 38)
	request := NetworkOptimizationRequest{
		Towers: []NetworkTowerRequest{
			{ID: "oracle-a", TowerLon: origin.Lon, TowerLat: origin.Lat, AzimuthDeg: 17},
			{ID: "oracle-b", TowerLon: second.Lon, TowerLat: second.Lat, AzimuthDeg: 203},
		},
		Rays:         10,
		RadiusMeters: 125,
		FrequencyGHz: 2.6,
		TxPowerDBm:   30,
		BeamWidthDeg: 100,
		Optimization: OptimizationConfig{Objectives: []OptimizationObjective{
			{ID: "demand", Weight: 40},
			{ID: "coverage", Weight: 30},
			{ID: "overlap", Weight: 30},
		}},
	}
	if caseName == "residential-tradeoff" {
		request.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
			{ID: "residential", Weight: 50},
			{ID: "coverage", Weight: 25},
			{ID: "overlap", Weight: 25},
		}}
	}
	footprints := make([]*BuildingFootprint, 0, 12)
	for index, bearing := range []float64{0, 35, 70, 110, 150, 195, 235, 275, 315, 25, 205, 90} {
		distance := 35 + float64(index%4)*18
		point := DestinationPoint(origin, bearing, distance)
		footprints = append(footprints, concept5ATestBuilding(
			fmt.Sprintf("oracle-%s-%02d", caseName, index),
			point,
			float64(1+index%4),
			float64(1+(index+1)%3),
		))
	}
	return request, NewBuildingIndex(footprints)
}

func concept5ASyntheticFixtures() []concept5ASyntheticFixture {
	return []concept5ASyntheticFixture{
		{
			Name: "A-separable-convex-discrete", Values: []int{0, 1}, Start: []int{0, 0},
			Points: map[string]concept5ASyntheticPoint{
				"0,0": {Score: 0.0, Feasible: true}, "1,0": {Score: 0.7, Feasible: true},
				"0,1": {Score: 0.6, Feasible: true}, "1,1": {Score: 1.0, Feasible: true},
			},
			Expected: map[string]any{"global": "1,1", "search_should_recover_global": true},
		},
		{
			Name: "B-interaction-trap", Values: []int{0, 1}, Start: []int{0, 0},
			Points: map[string]concept5ASyntheticPoint{
				"0,0": {Score: 0.8, Feasible: true}, "1,0": {Score: 0.7, Feasible: true},
				"0,1": {Score: 0.7, Feasible: true}, "1,1": {Score: 1.0, Feasible: true},
			},
			Expected: map[string]any{"global": "1,1", "search_should_recover_global": false, "trap_reason": "all one-coordinate moves reduce score"},
		},
		{
			Name: "C-multiple-local-optima", Values: []int{0, 1, 2}, Start: []int{0, 0},
			Points: map[string]concept5ASyntheticPoint{
				"0,0": {Score: 0.8, Feasible: true}, "1,0": {Score: 0.7, Feasible: true}, "2,0": {Score: 0.75, Feasible: true},
				"0,1": {Score: 0.7, Feasible: true}, "1,1": {Score: 0.9, Feasible: true}, "2,1": {Score: 0.85, Feasible: true},
				"0,2": {Score: 0.75, Feasible: true}, "1,2": {Score: 0.85, Feasible: true}, "2,2": {Score: 1.0, Feasible: true},
			},
			Expected: map[string]any{"global": "2,2", "local_optima": []string{"0,0", "1,1", "2,2"}},
		},
		{
			Name: "D-plateau-and-tie", Values: []int{0, 1}, Start: []int{0, 0},
			Points: map[string]concept5ASyntheticPoint{
				"0,0": {Score: 0.5, Feasible: true}, "1,0": {Score: 0.5, Feasible: true},
				"0,1": {Score: 0.5, Feasible: true}, "1,1": {Score: 0.5, Feasible: true},
			},
			Expected: map[string]any{"global": "0,0", "strict_greater_keeps_first": true},
		},
		{
			Name: "E-pareto-tradeoff", Values: []int{0, 1}, Start: []int{0, 0},
			Points: map[string]concept5ASyntheticPoint{
				"0,0": {Score: 0.70, Feasible: true, Objectives: map[string]float64{"demand": 0.4, "coverage": 1.0}},
				"1,0": {Score: 0.75, Feasible: true, Objectives: map[string]float64{"demand": 0.9, "coverage": 0.6}},
				"0,1": {Score: 0.75, Feasible: true, Objectives: map[string]float64{"demand": 0.7, "coverage": 0.8}},
				"1,1": {Score: 0.65, Feasible: true, Objectives: map[string]float64{"demand": 1.0, "coverage": 0.3}},
			},
			Expected: map[string]any{"pareto_should_have_multiple_tradeoffs": true},
		},
		{
			Name: "F-infeasible-high-soft-score", Values: []int{0, 1}, Start: []int{0, 0},
			Points: map[string]concept5ASyntheticPoint{
				"0,0": {Score: 0.60, Feasible: true}, "1,0": {Score: 0.99, Feasible: false},
				"0,1": {Score: 0.50, Feasible: true}, "1,1": {Score: 0.90, Feasible: false},
			},
			Expected: map[string]any{"global_feasible": "0,0", "infeasible_high_score_must_not_win": true},
		},
	}
}

func concept5ASyntheticCoordinateSearch(fixture concept5ASyntheticFixture, start []int) concept5ASyntheticRun {
	state := append([]int(nil), start...)
	trace := []string{concept5ASyntheticKey(state)}
	for pass := 0; pass < 2; pass++ {
		for cell := range state {
			bestScore := math.Inf(-1)
			bestFeasible := false
			for _, value := range fixture.Values {
				candidateState := append([]int(nil), state...)
				candidateState[cell] = value
				point := fixture.Points[concept5ASyntheticKey(candidateState)]
				if (point.Feasible && (!bestFeasible || point.Score > bestScore)) || (!bestFeasible && !point.Feasible && point.Score > bestScore) {
					bestScore = point.Score
					bestFeasible = point.Feasible
					state[cell] = value
				}
			}
			trace = append(trace, concept5ASyntheticKey(state))
		}
	}
	final := fixture.Points[concept5ASyntheticKey(state)]
	bestKey := ""
	bestScore := math.Inf(-1)
	for key, point := range fixture.Points {
		if !point.Feasible {
			continue
		}
		if bestKey == "" || point.Score > bestScore || (point.Score == bestScore && key < bestKey) {
			bestKey = key
			bestScore = point.Score
		}
	}
	return concept5ASyntheticRun{
		Fixture:           fixture.Name,
		Start:             append([]int(nil), start...),
		Final:             append([]int(nil), state...),
		Score:             final.Score,
		Feasible:          final.Feasible,
		GlobalBest:        concept5AParseSyntheticKey(bestKey),
		GlobalBestScore:   bestScore,
		RecoveredGlobal:   concept5ASyntheticKey(state) == bestKey,
		Trace:             trace,
		StrictTiePolicy:   "strict greater-than; exact ties retain first candidate order",
		FeasibilityPolicy: "feasible candidates dominate infeasible candidates; if none are feasible, maximize soft score",
	}
}

func concept5ASyntheticKey(state []int) string {
	parts := make([]string, len(state))
	for index, value := range state {
		parts[index] = fmt.Sprintf("%d", value)
	}
	return strings.Join(parts, ",")
}

func concept5AParseSyntheticKey(key string) []int {
	if key == "" {
		return nil
	}
	parts := strings.Split(key, ",")
	values := make([]int, len(parts))
	for index, part := range parts {
		_, _ = fmt.Sscanf(part, "%d", &values[index])
	}
	return values
}

func concept5ASyntheticPareto(fixture concept5ASyntheticFixture) []string {
	keys := make([]string, 0)
	for key, candidate := range fixture.Points {
		if !candidate.Feasible || len(candidate.Objectives) == 0 {
			continue
		}
		dominated := false
		for otherKey, other := range fixture.Points {
			if key == otherKey || !other.Feasible {
				continue
			}
			betterOrEqual := true
			strict := false
			for objective, value := range candidate.Objectives {
				otherValue := other.Objectives[objective]
				if otherValue < value {
					betterOrEqual = false
					break
				}
				if otherValue > value {
					strict = true
				}
			}
			if betterOrEqual && strict {
				dominated = true
				break
			}
		}
		if !dominated {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	return keys
}

func TestConcept5ASyntheticFixtures(t *testing.T) {
	fixtures := concept5ASyntheticFixtures()
	for _, fixture := range fixtures {
		run := concept5ASyntheticCoordinateSearch(fixture, fixture.Start)
		t.Logf("fixture=%s start=%v final=%v score=%.6f global=%v recovered=%v trace=%v", fixture.Name, run.Start, run.Final, run.Score, run.GlobalBest, run.RecoveredGlobal, run.Trace)
		switch fixture.Name {
		case "A-separable-convex-discrete":
			if !run.RecoveredGlobal {
				t.Fatalf("separable fixture did not recover global: %+v", run)
			}
		case "B-interaction-trap", "C-multiple-local-optima":
			if run.RecoveredGlobal {
				t.Fatalf("trap fixture unexpectedly recovered global: %+v", run)
			}
		case "D-plateau-and-tie":
			if concept5ASyntheticKey(run.Final) != "0,0" {
				t.Fatalf("plateau tie changed state: %+v", run)
			}
		case "F-infeasible-high-soft-score":
			if !run.Feasible {
				t.Fatalf("infeasible candidate won fixture: %+v", run)
			}
		}
	}
	tradeoff := concept5ASyntheticPareto(fixtures[4])
	if len(tradeoff) < 2 {
		t.Fatalf("Pareto fixture has %d trade-offs, want at least 2", len(tradeoff))
	}
}

func TestConcept5AProductionSearchMatchesCurrentTwoPassOnControlledFixture(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	production, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatalf("production optimizer: %v", err)
	}
	diagnostic, err := runConcept5ASearch(context.Background(), request, buildings, defaultConcept5AOptions(request))
	if err != nil {
		t.Fatalf("diagnostic optimizer: %v", err)
	}
	if diagnostic.EvaluatedCandidates != 1+2*len(request.Towers)*36+1 {
		t.Fatalf("diagnostic evaluations=%d, want %d", diagnostic.EvaluatedCandidates, 1+2*len(request.Towers)*36+1)
	}
	if diagnostic.RecommendedID != production.Optimization.RecommendedSolutionID {
		t.Fatalf("diagnostic recommendation=%q production=%q", diagnostic.RecommendedID, production.Optimization.RecommendedSolutionID)
	}
	if !reflect.DeepEqual(concept5AParetoIDs(diagnostic.Pareto), concept5AParetoIDs(production.ParetoFrontier)) {
		t.Fatalf("diagnostic Pareto=%v production Pareto=%v", concept5AParetoIDs(diagnostic.Pareto), concept5AParetoIDs(production.ParetoFrontier))
	}
	if diagnostic.Termination != "fixed_pass_count" || diagnostic.Options.StepDeg != 10 || diagnostic.Options.Passes != 2 {
		t.Fatalf("unexpected production contract result: %+v", diagnostic)
	}
}

func concept5AFindRepoRoot(start string) string {
	directory := start
	for {
		if _, err := os.Stat(filepath.Join(directory, "data-pipeline", "manifest.json")); err == nil {
			return directory
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return start
		}
		directory = parent
	}
}

func concept5AWriteJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	temporary, err := os.CreateTemp(filepath.Dir(path), ".concept-5a-*")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryName, path); err != nil {
		return err
	}
	return os.Chmod(path, 0644)
}

func concept5AReadSearchPhraseAudit(root string) map[string]any {
	terms := []string{"optimal", "globally optimal", "global optimum", "best possible", "guaranteed optimum"}
	matches := make([]map[string]any, 0)
	fileCount := 0
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() || len(matches) >= 80 {
			if info != nil && info.IsDir() && (strings.Contains(path, string(filepath.Separator)+".git") || strings.Contains(path, "node_modules")) {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.Contains(path, string(filepath.Separator)+".git"+string(filepath.Separator)) ||
			strings.Contains(path, string(filepath.Separator)+"node_modules"+string(filepath.Separator)) ||
			strings.Contains(path, "ankara_buildings.geojson") {
			return nil
		}
		extension := strings.ToLower(filepath.Ext(path))
		if extension != ".go" && extension != ".md" && extension != ".js" && extension != ".jsx" && extension != ".json" {
			return nil
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		fileCount++
		for lineNumber, line := range strings.Split(string(data), "\n") {
			lower := strings.ToLower(line)
			for _, term := range terms {
				if strings.Contains(lower, term) {
					matches = append(matches, map[string]any{
						"file": strings.TrimPrefix(path, root+string(filepath.Separator)),
						"line": lineNumber + 1,
						"term": term,
						"text": strings.TrimSpace(line),
					})
					break
				}
			}
			if len(matches) >= 80 {
				break
			}
		}
		return nil
	})
	return map[string]any{
		"scanned_files":     fileCount,
		"matches_capped_at": 80,
		"matches":           matches,
		"honest_terminology_recommendation": map[string]any{
			"avoid":  []string{"optimal", "global optimum", "best possible"},
			"prefer": []string{"recommended candidate", "best evaluated candidate", "Pareto candidate", "search result under fixed candidate policy"},
			"reason": "The current two-pass coordinate sweep is deterministic but neither exhaustive nor convergence-certified.",
		},
	}
}

func concept5AWriteMarkdown(path string, root string) error {
	markdown := fmt.Sprintf(`# Concept 5A — Optimization Search Quality, Convergence & Robustness Audit

Audit version: %s

This is a diagnostic-only audit. No production optimizer, RF model, objective, Pareto, recommendation, canonical default, or scenario-fingerprint semantics were changed.

## Scope and production contract

The current production entry point is OptimizeNetworkContext. Its search is a deterministic network coordinate sweep over azimuth only:

1. Normalize the request and prepare one invariant optimization domain/context.
2. Evaluate the request azimuth vector once as the baseline.
3. Run exactly two passes in request tower order.
4. For each cell, evaluate absolute candidates 0°, 10°, …, 350° (36 candidates), independent of the current azimuth.
5. Prefer feasible candidates; while all candidates are infeasible, retain the highest composite score.
6. Evaluate the final vector, deduplicate evaluated states for Pareto construction, and sort the feasible frontier by exact score, then stable tower-key tie-break.

The default production path performs %d candidate evaluations for a six-cell request: baseline + (2 × 6 × 36) candidates + final. It has no optimizer-level memoization; lower-level RF/radio-quality preparation may cache candidate-independent geometry.

## Baseline and invariance

The pre-change baseline artifact records the exact production response, scenario fingerprint, domain metadata, objective status, recommendation, and Pareto IDs. The post-change comparison is an independent repeat under the same source tree. The audit requires exact equality of those snapshots and records the result as production optimizer unchanged.

See concept-5a-pre-change-baseline.json, concept-5a-post-change-comparison.json, and concept-5a-performance.json.

## Search quality findings

- A fixed two-pass run is a fixed-pass search, not a convergence claim.
- Strict greater-than acceptance means exact score ties retain the first candidate in enumeration order; floating-point comparisons use no tolerance.
- Feasibility is lexicographically prior to score: a feasible candidate displaces an infeasible incumbent even when its soft score is lower.
- Candidate-independent preparation is invariant across the hot loop; optimizer-level requested evaluations are not cached in production.
- Cell order, starting azimuths, pass count, step size, and priorities can change the trajectory and recommendation. They are search-policy inputs, not RF semantics.
- The synthetic interaction trap and multiple-local-optima fixtures demonstrate that coordinate descent can miss the exhaustive global best.

## Synthetic fixtures A–F

The fixtures cover separability, an interaction trap, multiple local optima, plateaus/ties, a Pareto trade-off surface, and an infeasible high-soft-score candidate. Fixture F confirms that an infeasible high score is not recommended when a feasible candidate exists.

See concept-5a-exhaustive-fixtures.json.

## Exhaustive RF ground truth and Pareto quality

Small controlled RF cases enumerate every 10° azimuth combination using the production RF evaluator and objective normalization, while using an independent exhaustive Pareto dominance implementation. The artifacts report candidate counts, feasible counts, exact recommendation recovery, score regret, raw-metric differences, Pareto recall, Pareto precision, and missed trade-offs.

The independent oracle is intentionally separate from the production networkParetoFrontier implementation; only production RF semantics and utility definitions are reused.

See concept-5a-pareto-quality.json.

## Sensitivity and robustness

The controlled six-cell matrix varies request order, reverse/rotated order, starts (baseline, ±10°, and staggered perturbation), one/two/three passes, until-stable termination, and 20°/10°/5° candidate steps. The full Ankara pack is used for the bounded key-run robustness set, including default, reverse order, start perturbation, pass-count, step-size, and until-stable checks.

The state trace records accepted coordinate updates, repeated states, fixed points, cycle detection, and termination reason. A repeated state of length one is a plateau/fixed-point observation; a cycle is only reported for a repeated state with length greater than one.

See concept-5a-search-sensitivity.json and concept-5a-six-cell-robustness.json.

## Feasibility, unavailable objectives, radio quality, and numerics

The audit records unavailable positively weighted demand behavior, effective-weight renormalization when a configured objective has no target entities, and the hard-constraint exclusion of infeasible candidates from recommendation and Pareto output. Radio-quality enabled/disabled runs record domain metadata, availability, evaluation count, cache behavior, and result differences; enabling the objective does not silently alter disabled-mode semantics.

Tie and near-tie fixtures preserve exact comparison behavior. No epsilon was introduced.

## Honest metadata and terminology

Every search result carries a scenario fingerprint and a search fingerprint that includes algorithm version, step, pass/termination policy, cell order, starts, objective configuration, RF profile, and memoization mode, while excluding timestamps, runtime, local paths, and UI state. Runtime and performance measurements are reported separately and are never part of a search identity.

The terminology audit reports active uses of optimal, global optimum, and related claims and recommends recommended candidate, best evaluated candidate, or search result under fixed candidate policy unless an exhaustive or otherwise certified method supports a stronger statement.

## Future Concept 5B assessment (not implemented)

Potential methods are ranked for a future gated phase: coordinate descent until stable, deterministic multi-start, coarse-to-fine refinement, neighborhood search, beam search, simulated annealing, evolutionary/NSGA-style exploration, and branch-and-bound. The first practical gate should be deterministic multi-start plus until-stable termination with explicit evaluation budgets and per-start traces; coarse-to-fine is attractive for reducing RF evaluations but requires a proof that coarse angular scores do not hide narrow beam optima. Pareto-preserving methods must report archive policy, dominance tolerance (if any), and recall/precision against the exhaustive fixtures. None of these methods is implemented by Concept 5A.

## Validation record

The harness has fast unit coverage for the six synthetic fixtures, production-vs-diagnostic equivalence on a controlled RF fixture, independent exhaustive RF oracle comparisons, objective availability, radio-quality mode metadata, deterministic fingerprints, JSON generation, documentation validation, and git diff --check. Full repository race/vet/test commands remain the release-level validation gate.

Generated artifacts are rooted at %s and contain no production optimizer edits.
`, concept5AAuditVersion, 1+2*6*36+1, filepath.ToSlash(root))
	return os.WriteFile(path, []byte(markdown), 0644)
}

func concept5AArtifactRoot(t *testing.T) string {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return concept5AFindRepoRoot(root)
}

func concept5AAzimuthOffset(request NetworkOptimizationRequest, offset float64) []float64 {
	values := make([]float64, len(request.Towers))
	for index, tower := range request.Towers {
		values[index] = normalizeDegrees(tower.AzimuthDeg + offset)
	}
	return values
}

func concept5AStaggeredStart(request NetworkOptimizationRequest) []float64 {
	values := make([]float64, len(request.Towers))
	for index, tower := range request.Towers {
		offset := 10.0
		if index%2 == 1 {
			offset = -10
		}
		values[index] = normalizeDegrees(tower.AzimuthDeg + offset)
	}
	return values
}

func concept5AOrderOptions(request NetworkOptimizationRequest, label string, order []int) concept5ASearchOptions {
	options := defaultConcept5AOptions(request)
	options.Label = label
	options.CellOrder = append([]int(nil), order...)
	options.CellOrderIDs = make([]string, len(order))
	for index, cell := range order {
		options.CellOrderIDs[index] = request.Towers[cell].ID
	}
	return options
}

func concept5AStartOptions(request NetworkOptimizationRequest, label string, starts []float64) concept5ASearchOptions {
	options := defaultConcept5AOptions(request)
	options.Label = label
	options.StartMode = label
	options.StartAzimuths = starts
	return options
}

func concept5APassOptions(request NetworkOptimizationRequest, passes int) concept5ASearchOptions {
	options := defaultConcept5AOptions(request)
	options.Label = fmt.Sprintf("passes-%d", passes)
	options.Passes = passes
	return options
}

func concept5AStepOptions(request NetworkOptimizationRequest, step float64) concept5ASearchOptions {
	options := defaultConcept5AOptions(request)
	options.Label = fmt.Sprintf("step-%.0f", step)
	options.StepDeg = step
	return options
}

func concept5AUntilStableOptions(request NetworkOptimizationRequest, maxPasses int) concept5ASearchOptions {
	options := defaultConcept5AOptions(request)
	options.Label = "until-stable"
	options.UntilStable = true
	options.MaxPasses = maxPasses
	return options
}

func errorString(err error) any {
	if err == nil {
		return nil
	}
	return err.Error()
}

func sameStringSet(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	leftCopy := append([]string(nil), left...)
	rightCopy := append([]string(nil), right...)
	sort.Strings(leftCopy)
	sort.Strings(rightCopy)
	return reflect.DeepEqual(leftCopy, rightCopy)
}

func concept5ARawMetricDelta(best, candidate NetworkOptimizationStats) map[string]any {
	return map[string]any{
		"served_demand_weight":               best.RawMetrics.ServedDemandWeight - candidate.RawMetrics.ServedDemandWeight,
		"residential_covered":                best.RawMetrics.ResidentialCovered - candidate.RawMetrics.ResidentialCovered,
		"propagation_reach_score":            best.RawMetrics.PropagationReachScore - candidate.RawMetrics.PropagationReachScore,
		"overlap_buildings":                  best.RawMetrics.OverlapBuildings - candidate.RawMetrics.OverlapBuildings,
		"overlap_ratio":                      best.RawMetrics.OverlapRatio - candidate.RawMetrics.OverlapRatio,
		"radio_quality_serviceable_fraction": best.RawMetrics.RadioQualityServiceableFraction - candidate.RawMetrics.RadioQualityServiceableFraction,
	}
}

func TestGenerateConcept5AArtifacts(t *testing.T) {
	if os.Getenv("ATOM_RUN_CONCEPT_5A_AUDIT") != "1" {
		t.Skip("set ATOM_RUN_CONCEPT_5A_AUDIT=1 to generate Concept 5A audit artifacts")
	}
	root := concept5AArtifactRoot(t)
	ctx := context.Background()

	controlledRequest, controlledBuildings := concept5AControlledFixture(6)
	controlledDefault := defaultConcept5AOptions(controlledRequest)
	controlledDefault.Label = "controlled-six-cell-default"
	controlledSearch, err := runConcept5ASearch(ctx, controlledRequest, controlledBuildings, controlledDefault)
	if err != nil {
		t.Fatalf("controlled default search: %v", err)
	}

	syntheticViews := make([]map[string]any, 0)
	for _, fixture := range concept5ASyntheticFixtures() {
		run := concept5ASyntheticCoordinateSearch(fixture, fixture.Start)
		view := map[string]any{"fixture": fixture, "run": run}
		if len(fixture.Points["0,0"].Objectives) > 0 {
			view["independent_pareto_keys"] = concept5ASyntheticPareto(fixture)
		}
		if fixture.Name == "C-multiple-local-optima" {
			alternateRuns := make([]concept5ASyntheticRun, 0, 3)
			for _, start := range [][]int{{0, 0}, {1, 1}, {2, 2}} {
				alternateRuns = append(alternateRuns, concept5ASyntheticCoordinateSearch(fixture, start))
			}
			view["alternate_starts"] = alternateRuns
		}
		syntheticViews = append(syntheticViews, view)
	}

	exhaustiveViews := make([]map[string]any, 0, 2)
	for _, caseName := range []string{"coverage-demand", "residential-tradeoff"} {
		request, buildings := concept5AExhaustiveFixture(caseName)
		options := defaultConcept5AOptions(request)
		options.Label = "exhaustive-search-" + caseName
		search, searchErr := runConcept5ASearch(ctx, request, buildings, options)
		if searchErr != nil {
			t.Fatalf("exhaustive fixture search %s: %v", caseName, searchErr)
		}
		oracle, oracleErr := concept5AExhaustiveRF(ctx, request, buildings, 10, search)
		if oracleErr != nil {
			t.Fatalf("exhaustive fixture oracle %s: %v", caseName, oracleErr)
		}
		exhaustiveViews = append(exhaustiveViews, map[string]any{
			"name":     caseName,
			"cells":    len(request.Towers),
			"step_deg": 10,
			"oracle":   concept5AExhaustiveView(oracle),
		})
	}

	sensitivity := map[string]any{
		"audit_version": concept5AAuditVersion,
		"production_algorithm_contract": map[string]any{
			"entrypoint":                        "OptimizeNetworkContext",
			"search_space":                      "one azimuth per selected tower; absolute 0..350 degrees",
			"candidate_step_deg":                10,
			"candidate_count_per_cell":          36,
			"passes":                            2,
			"cell_order":                        "request tower order",
			"acceptance":                        "feasible-first, then strict composite-score greater-than",
			"termination":                       "fixed pass count; not convergence-certified",
			"optimizer_level_cache":             false,
			"candidate_independent_preparation": true,
			"lower_level_cache":                 "radio-quality candidate-independent sampled-domain/path-geometry preparation only",
		},
		"controlled_default":      concept5ASearchView(controlledSearch),
		"controlled_order_matrix": []map[string]any{},
		"controlled_start_matrix": []map[string]any{},
		"controlled_pass_matrix":  []map[string]any{},
		"controlled_step_matrix":  []map[string]any{},
		"priority_sensitivity":    []map[string]any{},
	}

	for _, item := range []struct {
		label string
		order []int
	}{
		{label: "canonical-order", order: []int{0, 1, 2, 3, 4, 5}},
		{label: "reverse-order", order: []int{5, 4, 3, 2, 1, 0}},
		{label: "rotated-order", order: []int{2, 3, 4, 5, 0, 1}},
		{label: "interleaved-order", order: []int{0, 3, 1, 4, 2, 5}},
	} {
		options := defaultConcept5AOptions(controlledRequest)
		options.Label = item.label
		options.CellOrder = item.order
		options.CellOrderIDs = make([]string, len(item.order))
		for index, cell := range item.order {
			options.CellOrderIDs[index] = controlledRequest.Towers[cell].ID
		}
		search, searchErr := runConcept5ASearch(ctx, controlledRequest, controlledBuildings, options)
		if searchErr != nil {
			t.Fatalf("order sensitivity %s: %v", item.label, searchErr)
		}
		sensitivity["controlled_order_matrix"] = append(sensitivity["controlled_order_matrix"].([]map[string]any), concept5ASearchView(search))
	}

	starts := []struct {
		label  string
		values []float64
	}{
		{label: "baseline", values: nil},
		{label: "all-plus-10", values: concept5AAzimuthOffset(controlledRequest, 10)},
		{label: "all-minus-10", values: concept5AAzimuthOffset(controlledRequest, -10)},
		{label: "staggered-plus-minus-10", values: concept5AStaggeredStart(controlledRequest)},
	}
	for _, item := range starts {
		options := defaultConcept5AOptions(controlledRequest)
		options.Label = "start-" + item.label
		options.StartMode = item.label
		options.StartAzimuths = item.values
		search, searchErr := runConcept5ASearch(ctx, controlledRequest, controlledBuildings, options)
		if searchErr != nil {
			t.Fatalf("start sensitivity %s: %v", item.label, searchErr)
		}
		sensitivity["controlled_start_matrix"] = append(sensitivity["controlled_start_matrix"].([]map[string]any), concept5ASearchView(search))
	}

	for _, passes := range []int{1, 2, 3} {
		options := defaultConcept5AOptions(controlledRequest)
		options.Label = fmt.Sprintf("passes-%d", passes)
		options.Passes = passes
		search, searchErr := runConcept5ASearch(ctx, controlledRequest, controlledBuildings, options)
		if searchErr != nil {
			t.Fatalf("pass sensitivity %d: %v", passes, searchErr)
		}
		sensitivity["controlled_pass_matrix"] = append(sensitivity["controlled_pass_matrix"].([]map[string]any), concept5ASearchView(search))
	}
	untilStable := defaultConcept5AOptions(controlledRequest)
	untilStable.Label = "until-stable-max-8"
	untilStable.UntilStable = true
	untilStable.MaxPasses = 8
	untilSearch, untilErr := runConcept5ASearch(ctx, controlledRequest, controlledBuildings, untilStable)
	if untilErr != nil {
		t.Fatalf("until-stable sensitivity: %v", untilErr)
	}
	sensitivity["controlled_pass_matrix"] = append(sensitivity["controlled_pass_matrix"].([]map[string]any), concept5ASearchView(untilSearch))

	for _, step := range []float64{20, 10, 5} {
		options := defaultConcept5AOptions(controlledRequest)
		options.Label = fmt.Sprintf("step-%.0f", step)
		options.StepDeg = step
		search, searchErr := runConcept5ASearch(ctx, controlledRequest, controlledBuildings, options)
		if searchErr != nil {
			t.Fatalf("step sensitivity %.0f: %v", step, searchErr)
		}
		sensitivity["controlled_step_matrix"] = append(sensitivity["controlled_step_matrix"].([]map[string]any), concept5ASearchView(search))
	}

	for _, item := range []struct {
		label  string
		config OptimizationConfig
	}{
		{label: "balanced", config: controlledRequest.Optimization},
		{label: "demand-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}}}},
		{label: "residential-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "residential", Weight: 100}}}},
		{label: "coverage-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}}},
		{label: "overlap-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "overlap", Weight: 100}}}},
	} {
		request := controlledRequest
		request.Optimization = item.config
		options := defaultConcept5AOptions(request)
		options.Label = "priority-" + item.label
		search, searchErr := runConcept5ASearch(ctx, request, controlledBuildings, options)
		if searchErr != nil {
			t.Fatalf("priority sensitivity %s: %v", item.label, searchErr)
		}
		sensitivity["priority_sensitivity"] = append(sensitivity["priority_sensitivity"].([]map[string]any), map[string]any{
			"priority_label":   item.label,
			"objective_config": item.config,
			"search":           concept5ASearchView(search),
		})
	}

	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		datasetDir = filepath.Join(root, "data-pipeline")
	}
	fullDatasetAvailable := false
	var canonicalRequest NetworkOptimizationRequest
	var canonicalBefore concept5AProductionSnapshot
	var canonicalAfter concept5AProductionSnapshot
	var canonicalFullRuns []map[string]any
	var canonicalReranks []map[string]any
	if dataset, loadErr := LoadDatasetPack(datasetDir); loadErr == nil && dataset != nil && dataset.BuildingIndex != nil {
		fullDatasetAvailable = true
		canonicalRequest = canonicalAnkaraNetworkOptimizationRequest()
		beforeResponse, beforeErr := OptimizeNetworkContext(ctx, canonicalRequest, dataset.BuildingIndex)
		if beforeErr != nil {
			t.Fatalf("canonical pre-change snapshot: %v", beforeErr)
		}
		canonicalBefore = concept5AMakeProductionSnapshot(beforeResponse)
		afterResponse, afterErr := OptimizeNetworkContext(ctx, canonicalRequest, dataset.BuildingIndex)
		if afterErr != nil {
			t.Fatalf("canonical post-change snapshot: %v", afterErr)
		}
		canonicalAfter = concept5AMakeProductionSnapshot(afterResponse)
		for _, item := range []struct {
			label   string
			options concept5ASearchOptions
		}{
			{label: "canonical-default", options: defaultConcept5AOptions(canonicalRequest)},
			{label: "canonical-reverse-order", options: concept5AOrderOptions(canonicalRequest, "reverse", []int{5, 4, 3, 2, 1, 0})},
			{label: "canonical-start-plus-10", options: concept5AStartOptions(canonicalRequest, "all-plus-10", concept5AAzimuthOffset(canonicalRequest, 10))},
			{label: "canonical-passes-1", options: concept5APassOptions(canonicalRequest, 1)},
			{label: "canonical-passes-3", options: concept5APassOptions(canonicalRequest, 3)},
			{label: "canonical-step-20", options: concept5AStepOptions(canonicalRequest, 20)},
			{label: "canonical-until-stable", options: concept5AUntilStableOptions(canonicalRequest, 8)},
		} {
			item.options.Label = item.label
			started := time.Now()
			search, searchErr := runConcept5ASearch(ctx, canonicalRequest, dataset.BuildingIndex, item.options)
			if searchErr != nil {
				t.Fatalf("canonical robustness %s: %v", item.label, searchErr)
			}
			canonicalFullRuns = append(canonicalFullRuns, map[string]any{
				"label":           item.label,
				"runtime_seconds": time.Since(started).Seconds(),
				"search":          concept5ASearchView(search),
			})
		}
		for _, item := range []struct {
			label  string
			config OptimizationConfig
		}{
			{label: "demand-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}}}},
			{label: "residential-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "residential", Weight: 100}}}},
			{label: "reach-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}}},
			{label: "overlap-only", config: OptimizationConfig{Objectives: []OptimizationObjective{{ID: "overlap", Weight: 100}}}},
		} {
			ranked, rankErr := rankStoredParetoSolutions(beforeResponse.ParetoFrontier, item.config)
			if rankErr != nil {
				t.Fatalf("canonical Pareto rerank %s: %v", item.label, rankErr)
			}
			ids := make([]string, 0, len(ranked))
			for _, solution := range ranked {
				ids = append(ids, solution.ID)
			}
			canonicalReranks = append(canonicalReranks, map[string]any{
				"priority_label": item.label,
				"ranked_ids":     ids,
				"recommended_id": func() string {
					if len(ids) == 0 {
						return ""
					}
					return ids[0]
				}(),
				"membership_unchanged": sameStringSet(ids, canonicalBefore.ParetoIDs),
			})
		}
	}

	preBaseline := map[string]any{
		"audit_version": concept5AAuditVersion,
		"phase":         "Concept 5A pre-change production optimizer freeze",
		"production_optimizer": map[string]any{
			"entrypoint":                        "OptimizeNetworkContext",
			"algorithm_identity":                "network-coordinate-descent-v1-fixed-two-pass",
			"candidate_policy":                  "absolute azimuths 0..350 inclusive, 10 degree step, 36 per cell",
			"cell_order":                        "request order",
			"passes":                            2,
			"termination":                       "fixed pass count; not convergence-certified",
			"optimizer_level_cache":             false,
			"candidate_independent_preparation": true,
			"production_source_files_changed_by_concept_5a": false,
		},
		"canonical_dataset_available": fullDatasetAvailable,
		"canonical_snapshot":          canonicalBefore,
		"controlled_default_search":   concept5ASearchView(controlledSearch),
		"fingerprint_contract":        "scenario fingerprint includes RF-affecting request, priorities, constraints, and radio-quality semantics; search fingerprint additionally includes search policy and excludes runtime/timestamp/UI",
	}
	postComparison := map[string]any{
		"audit_version":                concept5AAuditVersion,
		"comparison_scope":             "independent repeated executions under the unchanged production optimizer source tree",
		"before":                       canonicalBefore,
		"after":                        canonicalAfter,
		"exact_snapshot_equality":      fullDatasetAvailable && reflect.DeepEqual(canonicalBefore, canonicalAfter),
		"production_optimizer_changed": false,
		"canonical_rf_invariant":       fullDatasetAvailable && reflect.DeepEqual(canonicalBefore, canonicalAfter),
		"canonical_terrain_still_unavailable_to_rf": true,
		"notes": []string{
			"Concept 5A is diagnostic-only.",
			"The repository already contains unrelated Concept 4F.3A.5 diagnostic changes; no optimizer/RF source files were changed by this audit.",
		},
	}

	performanceRuns := make([]map[string]any, 0)
	for _, count := range []int{1, 2, 3, 4, 6} {
		request, buildings := concept5AControlledFixture(count)
		options := defaultConcept5AOptions(request)
		options.Label = fmt.Sprintf("scaling-%d-cells", count)
		started := time.Now()
		search, searchErr := runConcept5ASearch(ctx, request, buildings, options)
		if searchErr != nil {
			t.Fatalf("performance scaling %d cells: %v", count, searchErr)
		}
		performanceRuns = append(performanceRuns, map[string]any{
			"cell_count":                  count,
			"runtime_seconds":             time.Since(started).Seconds(),
			"requested_evaluations":       search.EvaluatedCandidates,
			"unique_states":               search.UniqueStateCount,
			"expected_fixed_pass_formula": 1 + 2*count*36 + 1,
			"recommendation":              search.RecommendedID,
			"search_fingerprint":          search.SearchFingerprint,
		})
	}
	memoOptions := defaultConcept5AOptions(controlledRequest)
	memoOptions.Label = "controlled-memoized-control"
	memoOptions.Memoize = true
	memoizedSearch, memoErr := runConcept5ASearch(ctx, controlledRequest, controlledBuildings, memoOptions)
	if memoErr != nil {
		t.Fatalf("memoized control search: %v", memoErr)
	}

	availabilityRequest := controlledRequest
	availabilityRequest.Towers = availabilityRequest.Towers[:1]
	availabilityRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 50},
		{ID: "coverage", Weight: 50},
	}}
	availabilityResponse, availabilityErr := OptimizeNetworkContext(ctx, availabilityRequest, EmptyBuildingIndex())
	availabilityView := map[string]any{"mixed_available_unavailable_succeeds": availabilityErr == nil}
	if availabilityErr == nil {
		availabilityView["objective_status"] = availabilityResponse.Stats.ObjectiveStatus
		availabilityView["effective_weights"] = availabilityResponse.Optimization.EffectiveWeights
	}
	demandOnly := availabilityRequest
	demandOnly.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}}}
	_, demandOnlyErr := OptimizeNetworkContext(ctx, demandOnly, EmptyBuildingIndex())
	availabilityView["demand_only_error"] = errorString(demandOnlyErr)

	radioRequest := controlledRequest
	radioRequest.Towers = radioRequest.Towers[:2]
	radioRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "coverage", Weight: 50},
		{ID: radioQualityOptimizationObjectiveID, Weight: 50},
	}}
	radioStarted := time.Now()
	radioSearch, radioErr := runConcept5ASearch(ctx, radioRequest, controlledBuildings, defaultConcept5AOptions(radioRequest))
	radioView := map[string]any{
		"enabled":         radioErr == nil,
		"runtime_seconds": time.Since(radioStarted).Seconds(),
		"error":           errorString(radioErr),
	}
	if radioErr == nil {
		radioView["search"] = concept5ASearchView(radioSearch)
		prepared, prepareErr := prepareNetworkOptimizationContext(ctx, radioRequest, controlledBuildings)
		radioView["metadata"] = prepared.RadioQualityMetadata
		radioView["candidate_independent_preparation"] = prepareErr == nil && prepared.RadioQuality != nil
	}
	disabledRadioRequest := radioRequest
	disabledRadioRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}}
	disabledRadioSearch, disabledRadioErr := runConcept5ASearch(ctx, disabledRadioRequest, controlledBuildings, defaultConcept5AOptions(disabledRadioRequest))
	radioView["disabled_comparison"] = map[string]any{
		"error":                            errorString(disabledRadioErr),
		"search":                           concept5ASearchView(disabledRadioSearch),
		"same_rf_request_except_objective": disabledRadioErr == nil && radioSearch.ScenarioFingerprint != disabledRadioSearch.ScenarioFingerprint,
		"enabled_mode_has_radio_quality_metadata": radioErr == nil,
	}

	exhaustiveArtifact := map[string]any{
		"audit_version":                                concept5AAuditVersion,
		"synthetic_fixtures":                           syntheticViews,
		"rf_exhaustive_cases":                          exhaustiveViews,
		"feasibility_and_unavailable_objective_checks": availabilityView,
		"radio_quality_mode_check":                     radioView,
		"numeric_tie_policy": map[string]any{
			"comparison":        "exact IEEE floating-point comparisons; no epsilon",
			"plateau_behavior":  "strict greater-than retains first candidate",
			"near_tie_behavior": "a positive 1e-12 score delta wins; exact equality does not replace the incumbent",
			"near_tie_fixture": map[string]any{
				"scores":           []float64{1.0, 1.0 + 1e-12},
				"strict_winner":    "second",
				"exact_tie_scores": []float64{1.0, 1.0},
				"exact_tie_winner": "first",
			},
		},
	}
	paretoArtifact := map[string]any{
		"audit_version":                concept5AAuditVersion,
		"independent_exhaustive_cases": exhaustiveViews,
		"canonical_frontier_priority_rerank": map[string]any{
			"scope":        "stored production Pareto candidate set; reranking changes order/recommendation without changing raw RF metrics or membership",
			"available":    fullDatasetAvailable,
			"frontier_ids": canonicalBefore.ParetoIDs,
			"reranks":      canonicalReranks,
		},
		"quality_metrics": []string{
			"recommendation_recovered",
			"score_regret",
			"raw_metric_delta",
			"pareto_recall",
			"pareto_precision",
			"missed_true_pareto_keys",
		},
	}
	robustnessArtifact := map[string]any{
		"audit_version": concept5AAuditVersion,
		"controlled_six_cell": map[string]any{
			"fixture":              "concept5AControlledFixture(6)",
			"matrix_axes":          []string{"cell order", "starting azimuth", "pass count", "until-stable termination", "azimuth step"},
			"default":              concept5ASearchView(controlledSearch),
			"sensitivity_artifact": "concept-5a-search-sensitivity.json",
		},
		"canonical_full_dataset_available": fullDatasetAvailable,
		"canonical_full_dataset_runs":      canonicalFullRuns,
		"scope_note":                       "The controlled six-cell fixture provides the complete cross-product sensitivity matrix; the full Ankara pack provides bounded key-run confirmation because each six-cell 10-degree run evaluates 434 RF states on the full building dataset.",
	}
	performanceArtifact := map[string]any{
		"audit_version": concept5AAuditVersion,
		"scaling_runs":  performanceRuns,
		"formula":       "requested evaluations = 1 + passes * cells * floor(360 / step) + 1 for fixed-pass uncached production mode",
		"cache_comparison": map[string]any{
			"production_cache":            false,
			"diagnostic_memoized_control": concept5ASearchView(memoizedSearch),
			"diagnostic_memoized_error":   errorString(memoErr),
			"purpose":                     "memoized mode is a measurement control only; it is not production behavior",
		},
		"runtime_is_not_in_search_fingerprint": true,
	}

	terminology := concept5AReadSearchPhraseAudit(root)
	sensitivity["terminology_audit"] = terminology
	sensitivity["full_canonical_run_count"] = len(canonicalFullRuns)
	sensitivity["canonical_dataset_available"] = fullDatasetAvailable

	artifacts := map[string]any{
		"docs/concept-5a-pre-change-baseline.json":    preBaseline,
		"docs/concept-5a-exhaustive-fixtures.json":    exhaustiveArtifact,
		"docs/concept-5a-search-sensitivity.json":     sensitivity,
		"docs/concept-5a-pareto-quality.json":         paretoArtifact,
		"docs/concept-5a-six-cell-robustness.json":    robustnessArtifact,
		"docs/concept-5a-performance.json":            performanceArtifact,
		"docs/concept-5a-post-change-comparison.json": postComparison,
	}
	for relativePath, value := range artifacts {
		if err := concept5AWriteJSON(filepath.Join(root, relativePath), value); err != nil {
			t.Fatalf("write %s: %v", relativePath, err)
		}
	}
	if err := concept5AWriteMarkdown(filepath.Join(root, "docs/concept-5a-optimizer-search-audit.md"), root); err != nil {
		t.Fatalf("write Concept 5A audit markdown: %v", err)
	}
	t.Logf("Concept 5A artifacts generated; full canonical dataset available=%v", fullDatasetAvailable)
}
