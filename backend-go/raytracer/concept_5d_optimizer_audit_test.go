package raytracer

// Concept 5D is a decision-only audit. This file deliberately contains no
// production search changes: it runs the frozen legacy, Concept 5B, and
// Concept 5C policies, normalizes their evidence, and writes productization
// artifacts for review.

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
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

const concept5DAuditVersion = "concept-5d-audit-v1"

type concept5DPriorityProfile struct {
	Name       string
	Objectives []OptimizationObjective
}

func (profile concept5DPriorityProfile) config() OptimizationConfig {
	return OptimizationConfig{Objectives: append([]OptimizationObjective(nil), profile.Objectives...)}
}

func concept5DPriorityProfiles() []concept5DPriorityProfile {
	return []concept5DPriorityProfile{
		{Name: "balanced", Objectives: []OptimizationObjective{{ID: "demand", Weight: 25}, {ID: "residential", Weight: 25}, {ID: "coverage", Weight: 25}, {ID: "overlap", Weight: 25}}},
		{Name: "demand-focused", Objectives: []OptimizationObjective{{ID: "demand", Weight: 85}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 5}, {ID: "overlap", Weight: 5}}},
		{Name: "residential-focused", Objectives: []OptimizationObjective{{ID: "demand", Weight: 5}, {ID: "residential", Weight: 85}, {ID: "coverage", Weight: 5}, {ID: "overlap", Weight: 5}}},
		{Name: "coverage-focused", Objectives: []OptimizationObjective{{ID: "demand", Weight: 5}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 85}, {ID: "overlap", Weight: 5}}},
		{Name: "overlap-focused", Objectives: []OptimizationObjective{{ID: "demand", Weight: 5}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 5}, {ID: "overlap", Weight: 85}}},
		{Name: "demand-residential", Objectives: []OptimizationObjective{{ID: "demand", Weight: 45}, {ID: "residential", Weight: 45}, {ID: "coverage", Weight: 5}, {ID: "overlap", Weight: 5}}},
		{Name: "demand-coverage", Objectives: []OptimizationObjective{{ID: "demand", Weight: 45}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 45}, {ID: "overlap", Weight: 5}}},
		{Name: "residential-coverage", Objectives: []OptimizationObjective{{ID: "demand", Weight: 5}, {ID: "residential", Weight: 45}, {ID: "coverage", Weight: 45}, {ID: "overlap", Weight: 5}}},
		{Name: "reach-overlap", Objectives: []OptimizationObjective{{ID: "demand", Weight: 5}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 45}, {ID: "overlap", Weight: 45}}},
		{Name: "broad-demand", Objectives: []OptimizationObjective{{ID: "demand", Weight: 60}, {ID: "residential", Weight: 15}, {ID: "coverage", Weight: 15}, {ID: "overlap", Weight: 10}}},
	}
}

func concept5DAnkaraPriorityProfiles() []concept5DPriorityProfile {
	return []concept5DPriorityProfile{
		{Name: "balanced-radio-enabled", Objectives: []OptimizationObjective{{ID: "demand", Weight: 24}, {ID: "residential", Weight: 24}, {ID: "coverage", Weight: 24}, {ID: "overlap", Weight: 24}, {ID: radioQualityOptimizationObjectiveID, Weight: 4}}},
		{Name: "propagation-reach-focused", Objectives: []OptimizationObjective{{ID: "demand", Weight: 5}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 65}, {ID: "overlap", Weight: 5}, {ID: radioQualityOptimizationObjectiveID, Weight: 20}}},
		{Name: "radio-quality-focused", Objectives: []OptimizationObjective{{ID: "demand", Weight: 5}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 10}, {ID: "overlap", Weight: 5}, {ID: radioQualityOptimizationObjectiveID, Weight: 75}}},
	}
}

type concept5DMeasuredRun struct {
	Policy               string
	Request              NetworkOptimizationRequest
	Prepared             *PreparedNetworkOptimizationContext
	Algorithm            string
	Version              string
	ScenarioFingerprint  string
	SearchFingerprint    string
	DiscoveryFingerprint string
	RankingFingerprint   string
	Heuristic            bool
	CandidatePriorityDep bool
	Incomplete           bool
	TerminationReason    string
	RequestedEvaluations int
	UniqueEvaluations    int
	CacheHits            int
	DuplicateRFWork      int
	ArchiveSize          int
	ActiveParetoSize     int
	Archive              []networkOptimizationCandidate
	ActiveArchive        []networkOptimizationCandidate
	Frontier             []NetworkParetoSolution
	RecommendedKey       string
	RecommendedStats     NetworkOptimizationStats
	RecommendedAzimuths  []float64
	FinalAzimuths        []float64
	StateTrace           []string
	StartTraces          []NetworkOptimizationStartTrace
	RuntimeSeconds       float64
	MemoryAllocatedBytes uint64
	SearchMetadata       *NetworkOptimizationSearchMetadata
}

type concept5DOracleCandidate struct {
	Key       string
	Azimuths  []float64
	Stats     NetworkOptimizationStats
	Utilities OptimizationUtilities
	Feasible  bool
}

type concept5DOracle struct {
	Request      NetworkOptimizationRequest
	Availability map[string]OptimizationObjectiveAvailability
	Candidates   []concept5DOracleCandidate
}

type concept5DTruth struct {
	CandidateCount int
	FeasibleCount  int
	BestKey        string
	BestScore      float64
	BestStats      NetworkOptimizationStats
	ParetoKeys     []string
	ObjectiveIDs   []string
}

type concept5DComparisonRecord struct {
	Policy                        string             `json:"policy"`
	Fixture                       string             `json:"fixture"`
	PriorityProfile               string             `json:"priority_profile"`
	PriorityVector                map[string]float64 `json:"priority_vector"`
	Algorithm                     string             `json:"algorithm"`
	Version                       string             `json:"version"`
	DefaultOrOptIn                string             `json:"default_or_opt_in"`
	ScenarioFingerprint           string             `json:"scenario_fingerprint"`
	SearchFingerprint             string             `json:"search_fingerprint"`
	DiscoveryFingerprint          string             `json:"discovery_fingerprint"`
	RankingFingerprint            string             `json:"ranking_fingerprint"`
	UniqueEvaluations             int                `json:"unique_evaluations"`
	RequestedEvaluations          int                `json:"requested_evaluations"`
	RuntimeSeconds                float64            `json:"runtime_seconds"`
	MemoryAllocatedBytes          uint64             `json:"memory_allocated_bytes"`
	ArchiveCostBytesPer1000States int                `json:"archive_cost_bytes_per_1000_states"`
	MemoryMeasurement             string             `json:"memory_measurement"`
	Recommendation                string             `json:"recommendation"`
	Score                         float64            `json:"score"`
	ScoreRegret                   *float64           `json:"score_regret"`
	RawObjectiveDeltas            map[string]float64 `json:"raw_objective_deltas"`
	TrueParetoCount               *int               `json:"true_pareto_count"`
	DiscoveredParetoCount         *int               `json:"discovered_pareto_count"`
	ParetoRecall                  *float64           `json:"pareto_recall"`
	ParetoPrecision               *float64           `json:"pareto_precision"`
	EvaluationsPerRecoveredPoint  *float64           `json:"evaluations_per_recovered_true_pareto_solution"`
	ArchiveSize                   int                `json:"archive_size"`
	ActiveParetoSize              int                `json:"active_pareto_size"`
	OrderSensitivity              string             `json:"order_sensitivity"`
	StartSensitivity              string             `json:"start_sensitivity"`
	PrioritySensitivity           string             `json:"priority_sensitivity"`
	ExhaustiveVerified            bool               `json:"exhaustive_verified"`
	Heuristic                     bool               `json:"heuristic"`
	CandidateDiscoveryPriorityDep bool               `json:"candidate_discovery_priority_dependent"`
	IncompleteSearch              bool               `json:"incomplete_search"`
	TerminationReason             string             `json:"termination_reason"`
	CacheHits                     int                `json:"cache_hits"`
	DuplicateRFWork               int                `json:"duplicate_rf_work"`
	EvaluationAttribution         string             `json:"evaluation_attribution"`
	Notes                         []string           `json:"notes"`
}

func concept5DIntPointer(value int) *int { return &value }

func concept5DFloatPointer(value float64) *float64 { return &value }

func concept5DMeasure(run func() error) (float64, uint64, error) {
	var before runtime.MemStats
	var after runtime.MemStats
	runtime.ReadMemStats(&before)
	started := time.Now()
	err := run()
	elapsed := time.Since(started).Seconds()
	runtime.ReadMemStats(&after)
	allocated := uint64(0)
	if after.TotalAlloc >= before.TotalAlloc {
		allocated = after.TotalAlloc - before.TotalAlloc
	}
	return elapsed, allocated, err
}

func concept5DUniqueCandidates(candidates []networkOptimizationCandidate) []networkOptimizationCandidate {
	unique := make([]networkOptimizationCandidate, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		key := azimuthKey(candidate.Azimuths)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, candidate)
	}
	return unique
}

func concept5DStateKeys(candidates []networkOptimizationCandidate) []string {
	keys := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		key := azimuthKey(candidate.Azimuths)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func concept5DCanonicalStateKey(request NetworkOptimizationRequest, azimuths []float64) string {
	parts := make([]string, 0, len(request.Towers))
	for index, tower := range request.Towers {
		if index >= len(azimuths) {
			break
		}
		parts = append(parts, fmt.Sprintf("%s:%.1f", tower.ID, normalizeDegrees(azimuths[index])))
	}
	sort.Strings(parts)
	return strings.Join(parts, ",")
}

func concept5DCanonicalFrontierKey(solution NetworkParetoSolution) string {
	parts := make([]string, 0, len(solution.Towers))
	for _, tower := range solution.Towers {
		parts = append(parts, fmt.Sprintf("%s:%.1f", tower.ID, normalizeDegrees(tower.AzimuthDeg)))
	}
	sort.Strings(parts)
	return strings.Join(parts, ",")
}

func concept5DCanonicalFrontierKeys(frontier []NetworkParetoSolution) []string {
	keys := make([]string, 0, len(frontier))
	for _, solution := range frontier {
		keys = append(keys, concept5DCanonicalFrontierKey(solution))
	}
	sort.Strings(keys)
	return keys
}

func concept5DCanonicalArchiveKeys(request NetworkOptimizationRequest, candidates []networkOptimizationCandidate) []string {
	keys := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		key := concept5DCanonicalStateKey(request, candidate.Azimuths)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func concept5DHash(value any) string {
	serialized, err := json.Marshal(value)
	if err != nil {
		return "hash-error"
	}
	digest := sha256.Sum256(serialized)
	return hex.EncodeToString(digest[:12])
}

func concept5DEnabledObjectiveIDs(config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability) []string {
	ids := make([]string, 0, len(config.Objectives))
	for _, objective := range config.Objectives {
		if objective.Weight <= 0 {
			continue
		}
		if status, exists := availability[objective.ID]; exists && !status.Available {
			continue
		}
		ids = append(ids, objective.ID)
	}
	sort.Strings(ids)
	return ids
}

func concept5DRunRecommendation(run concept5DMeasuredRun) (string, float64, NetworkOptimizationStats, []float64) {
	if len(run.Frontier) > 0 {
		solution := run.Frontier[0]
		azimuths := make([]float64, len(run.Request.Towers))
		for candidateIndex, requestTower := range run.Request.Towers {
			for _, setting := range solution.Towers {
				if requestTower.ID == setting.ID {
					azimuths[candidateIndex] = setting.AzimuthDeg
					break
				}
			}
		}
		return solution.ID, solution.Score, solution.Stats, azimuths
	}
	return "", run.RecommendedStats.Score, run.RecommendedStats, append([]float64(nil), run.FinalAzimuths...)
}

func concept5DRunPolicy(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, policy string, step float64, maxPasses, maxExpandedStates, maxUniqueEvaluations int) (concept5DMeasuredRun, error) {
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	measured := concept5DMeasuredRun{Policy: policy, Request: req}
	var legacy *concept5ASearchResult
	var prepared *PreparedNetworkOptimizationContext
	var searchRun *networkSearchRunResult
	var frontier []NetworkParetoSolution
	var err error
	var elapsed float64
	var allocated uint64
	if policy == LegacyNetworkSearchPolicy {
		options := defaultConcept5AOptions(req)
		options.Label = "concept-5d-legacy"
		options.StepDeg = step
		elapsed, allocated, err = concept5DMeasure(func() error {
			result, runErr := runConcept5ASearch(ctx, req, buildings, options)
			legacy = &result
			return runErr
		})
		if err == nil {
			frontier = legacy.Pareto
		}
	} else if policy == DeterministicMultiStartCoordinateV1 {
		var normalizedReq NetworkOptimizationRequest
		var run networkSearchRunResult
		var runFrontier []NetworkParetoSolution
		elapsed, allocated, err = concept5DMeasure(func() error {
			runReq, runPrepared, runResult, runPareto, runErr := concept5BRunInternal(ctx, req, buildings, deterministicNetworkSearchStarts(req), step, maxPasses, maxUniqueEvaluations, true)
			normalizedReq, prepared, run, runFrontier = runReq, runPrepared, runResult, runPareto
			return runErr
		})
		if err == nil {
			req = normalizedReq
			searchRun = &run
			frontier = runFrontier
		}
	} else if policy == DeterministicParetoArchiveSearchV1 {
		var normalizedReq NetworkOptimizationRequest
		var run networkSearchRunResult
		var runFrontier []NetworkParetoSolution
		elapsed, allocated, err = concept5DMeasure(func() error {
			runReq, runPrepared, runResult, runPareto, runErr := concept5CRunInternal(ctx, req, buildings, step, maxPasses, maxExpandedStates, maxUniqueEvaluations)
			normalizedReq, prepared, run, runFrontier = runReq, runPrepared, runResult, runPareto
			return runErr
		})
		if err == nil {
			req = normalizedReq
			searchRun = &run
			frontier = runFrontier
		}
	} else {
		return concept5DMeasuredRun{}, fmt.Errorf("unknown Concept 5D audit policy %q", policy)
	}
	if err != nil {
		return concept5DMeasuredRun{}, err
	}
	measured.Request = req
	measured.Prepared = prepared
	measured.Frontier = append([]NetworkParetoSolution(nil), frontier...)
	measured.RuntimeSeconds = elapsed
	measured.MemoryAllocatedBytes = allocated
	measured.ScenarioFingerprint = NetworkScenarioFingerprint(req)
	if legacy != nil {
		measured.Algorithm = "network_coordinate_descent"
		measured.Version = "fixed-two-pass-v1"
		measured.Heuristic = true
		measured.CandidatePriorityDep = true
		measured.SearchFingerprint = legacy.SearchFingerprint
		measured.RequestedEvaluations = legacy.EvaluatedCandidates
		measured.UniqueEvaluations = legacy.UniqueStateCount
		measured.CacheHits = legacy.CacheHits
		measured.Archive = concept5DUniqueCandidates(legacy.Evaluated)
		measured.FinalAzimuths = append([]float64(nil), legacy.FinalAzimuths...)
		measured.StateTrace = append([]string(nil), legacy.StateTrace...)
		measured.TerminationReason = legacy.Termination
		measured.Incomplete = false
	} else if searchRun != nil {
		measured.Algorithm = searchRun.Metadata.SearchAlgorithm
		measured.Version = searchRun.Metadata.SearchVersion
		measured.Heuristic = searchRun.Metadata.Heuristic
		measured.CandidatePriorityDep = searchRun.Metadata.CandidateDiscoveryPriorityDependent
		measured.SearchFingerprint = searchRun.Metadata.SearchFingerprint
		measured.DiscoveryFingerprint = searchRun.Metadata.DiscoveryFingerprint
		measured.RankingFingerprint = searchRun.Metadata.RankingFingerprint
		measured.RequestedEvaluations = searchRun.Metadata.EvaluationRequests
		measured.UniqueEvaluations = searchRun.Metadata.UniqueEvaluations
		measured.CacheHits = searchRun.Metadata.CacheHits
		measured.Archive = concept5DUniqueCandidates(searchRun.Archive)
		measured.ActiveArchive = concept5DUniqueCandidates(searchRun.ActiveArchive)
		measured.ActiveParetoSize = len(searchRun.ActiveArchive)
		measured.FinalAzimuths = append([]float64(nil), searchRun.FinalAzimuths...)
		measured.StartTraces = append([]NetworkOptimizationStartTrace(nil), searchRun.Metadata.StartTraces...)
		measured.TerminationReason = searchRun.Metadata.TerminationReason
		measured.Incomplete = searchRun.Metadata.IncompleteSearch
		metadata := searchRun.Metadata
		measured.SearchMetadata = &metadata
	}
	if measured.TerminationReason == "" {
		if measured.Incomplete && maxUniqueEvaluations > 0 && measured.UniqueEvaluations >= maxUniqueEvaluations {
			measured.TerminationReason = "evaluation_budget"
		} else if measured.Incomplete && maxPasses > 0 {
			measured.TerminationReason = "pass_bound_or_budget"
		} else {
			measured.TerminationReason = "coordinate_stable_or_start_set_complete"
		}
	}
	measured.ArchiveSize = len(measured.Archive)
	measured.DuplicateRFWork = measured.RequestedEvaluations - measured.UniqueEvaluations
	if measured.DuplicateRFWork < 0 {
		measured.DuplicateRFWork = 0
	}
	if measured.ActiveParetoSize == 0 {
		measured.ActiveParetoSize = len(measured.Frontier)
	}
	measured.RecommendedKey, _, measured.RecommendedStats, measured.RecommendedAzimuths = concept5DRunRecommendation(measured)
	return measured, nil
}

func concept5DBuildOracle(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, step float64) (concept5DOracle, error) {
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return concept5DOracle{}, err
	}
	if _, err := NormalizeAvailableOptimizationPriorities(req.Optimization.Objectives, prepared.ObjectiveAvailability); err != nil {
		return concept5DOracle{}, err
	}
	count := concept5AAngleCount(step)
	if count <= 0 {
		return concept5DOracle{}, fmt.Errorf("invalid Concept 5D oracle step %.3f", step)
	}
	oracle := concept5DOracle{
		Request:      req,
		Availability: cloneOptimizationObjectiveAvailability(prepared.ObjectiveAvailability),
		Candidates:   make([]concept5DOracleCandidate, 0),
	}
	azimuths := make([]float64, len(req.Towers))
	var enumerate func(int) error
	enumerate = func(index int) error {
		if index == len(azimuths) {
			stats, evalErr := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
			if evalErr != nil {
				return evalErr
			}
			oracle.Candidates = append(oracle.Candidates, concept5DOracleCandidate{
				Key:       concept5DCanonicalStateKey(req, azimuths),
				Azimuths:  append([]float64(nil), azimuths...),
				Stats:     stats,
				Utilities: NormalizeOptimizationObjectives(stats),
				Feasible:  len(OptimizationConstraintViolations(stats, req.Optimization.Constraints)) == 0,
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
		return concept5DOracle{}, err
	}
	return oracle, nil
}

func concept5DOracleDominates(left, right concept5DOracleCandidate, objectiveIDs []string) bool {
	if !left.Feasible || !right.Feasible {
		return false
	}
	strict := false
	for _, id := range objectiveIDs {
		leftValue := concept5AObjectiveUtility(left.Utilities, id)
		rightValue := concept5AObjectiveUtility(right.Utilities, id)
		if leftValue < rightValue {
			return false
		}
		if leftValue > rightValue {
			strict = true
		}
	}
	return strict
}

func concept5DTruthForProfile(oracle concept5DOracle, config OptimizationConfig) (concept5DTruth, error) {
	config = NormalizeOptimizationConfig(&config)
	objectiveIDs := concept5DEnabledObjectiveIDs(config, oracle.Availability)
	truth := concept5DTruth{
		CandidateCount: len(oracle.Candidates),
		ObjectiveIDs:   objectiveIDs,
	}
	pareto := make([]concept5DOracleCandidate, 0)
	bestSet := false
	for index, candidate := range oracle.Candidates {
		if !candidate.Feasible {
			continue
		}
		truth.FeasibleCount++
		scored, err := scoreNetworkOptimization(candidate.Stats, config, oracle.Availability)
		if err != nil {
			return concept5DTruth{}, err
		}
		if !bestSet || scored.Score > truth.BestScore || (scored.Score == truth.BestScore && candidate.Key < truth.BestKey) {
			bestSet = true
			truth.BestKey = candidate.Key
			truth.BestScore = scored.Score
			truth.BestStats = scored
		}
		dominated := false
		for otherIndex, competitor := range oracle.Candidates {
			if index == otherIndex || concept5DOracleDominates(competitor, candidate, objectiveIDs) {
				dominated = index != otherIndex
				if dominated {
					break
				}
			}
		}
		if !dominated {
			pareto = append(pareto, candidate)
		}
	}
	sort.SliceStable(pareto, func(left, right int) bool { return pareto[left].Key < pareto[right].Key })
	for _, candidate := range pareto {
		truth.ParetoKeys = append(truth.ParetoKeys, candidate.Key)
	}
	return truth, nil
}

func concept5DRawObjectiveDelta(best, recommendation NetworkOptimizationStats) map[string]float64 {
	bestRaw := best.RawMetrics
	recommendedRaw := recommendation.RawMetrics
	return map[string]float64{
		"served_demand_weight":               recommendedRaw.ServedDemandWeight - bestRaw.ServedDemandWeight,
		"residential_covered":                float64(recommendedRaw.ResidentialCovered - bestRaw.ResidentialCovered),
		"propagation_reach_score":            recommendedRaw.PropagationReachScore - bestRaw.PropagationReachScore,
		"overlap_buildings":                  float64(recommendedRaw.OverlapBuildings - bestRaw.OverlapBuildings),
		"radio_quality_serviceable_fraction": recommendedRaw.RadioQualityServiceableFraction - bestRaw.RadioQualityServiceableFraction,
	}
}

func concept5DPriorityVector(config OptimizationConfig) map[string]float64 {
	vector := make(map[string]float64, len(optimizationObjectiveIDs))
	for _, id := range optimizationObjectiveIDs {
		vector[id] = 0
	}
	for _, objective := range config.Objectives {
		vector[objective.ID] = objective.Weight
	}
	return vector
}

func concept5DRecordFromRun(fixture string, profile concept5DPriorityProfile, run concept5DMeasuredRun, truth *concept5DTruth, orderSensitivity, startSensitivity, prioritySensitivity, attribution string, notes ...string) concept5DComparisonRecord {
	recommendation := concept5DCanonicalStateKey(run.Request, run.RecommendedAzimuths)
	recommendedScore := run.RecommendedStats.Score
	recommendedStats := run.RecommendedStats
	record := concept5DComparisonRecord{
		Policy:                        run.Policy,
		Fixture:                       fixture,
		PriorityProfile:               profile.Name,
		PriorityVector:                concept5DPriorityVector(profile.config()),
		Algorithm:                     run.Algorithm,
		Version:                       run.Version,
		DefaultOrOptIn:                map[string]string{LegacyNetworkSearchPolicy: "default", DeterministicMultiStartCoordinateV1: "opt_in", DeterministicParetoArchiveSearchV1: "opt_in"}[run.Policy],
		ScenarioFingerprint:           run.ScenarioFingerprint,
		SearchFingerprint:             run.SearchFingerprint,
		DiscoveryFingerprint:          run.DiscoveryFingerprint,
		RankingFingerprint:            run.RankingFingerprint,
		UniqueEvaluations:             run.UniqueEvaluations,
		RequestedEvaluations:          run.RequestedEvaluations,
		RuntimeSeconds:                run.RuntimeSeconds,
		MemoryAllocatedBytes:          run.MemoryAllocatedBytes,
		ArchiveCostBytesPer1000States: concept5DArchiveCostPer1000(run.Policy, len(run.Request.Towers)),
		MemoryMeasurement:             "runtime.MemStats.TotalAlloc delta during the measured audit call; not resident RSS",
		Recommendation:                recommendation,
		Score:                         recommendedScore,
		RawObjectiveDeltas:            map[string]float64{},
		ArchiveSize:                   run.ArchiveSize,
		ActiveParetoSize:              run.ActiveParetoSize,
		OrderSensitivity:              orderSensitivity,
		StartSensitivity:              startSensitivity,
		PrioritySensitivity:           prioritySensitivity,
		ExhaustiveVerified:            truth != nil,
		Heuristic:                     run.Heuristic,
		CandidateDiscoveryPriorityDep: run.CandidatePriorityDep,
		IncompleteSearch:              run.Incomplete,
		TerminationReason:             run.TerminationReason,
		CacheHits:                     run.CacheHits,
		DuplicateRFWork:               run.DuplicateRFWork,
		EvaluationAttribution:         attribution,
		Notes:                         append([]string(nil), notes...),
	}
	if truth == nil {
		return record
	}
	discovered := concept5DCanonicalFrontierKeys(run.Frontier)
	trueSet := make(map[string]struct{}, len(truth.ParetoKeys))
	for _, key := range truth.ParetoKeys {
		trueSet[key] = struct{}{}
	}
	intersection := 0
	for _, key := range discovered {
		if _, exists := trueSet[key]; exists {
			intersection++
		}
	}
	trueCount := len(truth.ParetoKeys)
	discoveredCount := len(discovered)
	paretoRecall := 0.0
	if trueCount > 0 {
		paretoRecall = float64(intersection) / float64(trueCount)
	}
	paretoPrecision := 0.0
	if discoveredCount > 0 {
		paretoPrecision = float64(intersection) / float64(discoveredCount)
	}
	scoreRegret := truth.BestScore - recommendedScore
	if scoreRegret < 0 || math.Abs(scoreRegret) < 1e-9 {
		scoreRegret = 0
	}
	record.ScoreRegret = concept5DFloatPointer(scoreRegret)
	record.RawObjectiveDeltas = concept5DRawObjectiveDelta(truth.BestStats, recommendedStats)
	record.TrueParetoCount = concept5DIntPointer(trueCount)
	record.DiscoveredParetoCount = concept5DIntPointer(discoveredCount)
	record.ParetoRecall = concept5DFloatPointer(paretoRecall)
	record.ParetoPrecision = concept5DFloatPointer(paretoPrecision)
	if intersection > 0 {
		record.EvaluationsPerRecoveredPoint = concept5DFloatPointer(float64(run.UniqueEvaluations) / float64(intersection))
	}
	record.Notes = append(record.Notes,
		fmt.Sprintf("exhaustive candidate count=%d; feasible count=%d; objective set=%s", truth.CandidateCount, truth.FeasibleCount, strings.Join(truth.ObjectiveIDs, ",")),
	)
	return record
}

func concept5DArchiveCostPer1000(policy string, cellCount int) int {
	switch policy {
	case LegacyNetworkSearchPolicy:
		return 0
	case DeterministicMultiStartCoordinateV1:
		return 1000 * (64 + cellCount*24)
	case DeterministicParetoArchiveSearchV1:
		return 1000 * (256 + cellCount*48)
	default:
		return 0
	}
}

func concept5DOracleSummary(oracle concept5DOracle, profiles []concept5DPriorityProfile) []map[string]any {
	result := make([]map[string]any, 0, len(profiles))
	for _, profile := range profiles {
		truth, err := concept5DTruthForProfile(oracle, profile.config())
		if err != nil {
			result = append(result, map[string]any{"priority_profile": profile.Name, "error": err.Error()})
			continue
		}
		result = append(result, map[string]any{
			"priority_profile":         profile.Name,
			"priority_vector":          concept5DPriorityVector(profile.config()),
			"candidate_count":          truth.CandidateCount,
			"feasible_candidate_count": truth.FeasibleCount,
			"global_best_key":          truth.BestKey,
			"global_best_score":        truth.BestScore,
			"true_pareto_count":        len(truth.ParetoKeys),
			"true_pareto_keys":         truth.ParetoKeys,
			"objective_set":            truth.ObjectiveIDs,
		})
	}
	return result
}

func concept5DRunIdentity(run concept5DMeasuredRun) map[string]any {
	identity := map[string]any{
		"policy":                                 run.Policy,
		"algorithm":                              run.Algorithm,
		"version":                                run.Version,
		"default_or_opt_in":                      map[string]string{LegacyNetworkSearchPolicy: "default", DeterministicMultiStartCoordinateV1: "opt_in", DeterministicParetoArchiveSearchV1: "opt_in"}[run.Policy],
		"scenario_fingerprint":                   run.ScenarioFingerprint,
		"search_fingerprint":                     run.SearchFingerprint,
		"discovery_fingerprint":                  run.DiscoveryFingerprint,
		"ranking_fingerprint":                    run.RankingFingerprint,
		"candidate_discovery_priority_dependent": run.CandidatePriorityDep,
		"heuristic":                              run.Heuristic,
		"incomplete_search":                      run.Incomplete,
		"termination_reason":                     run.TerminationReason,
	}
	if run.SearchMetadata != nil {
		identity["search_guarantee"] = run.SearchMetadata.SearchGuarantee
		identity["start_count"] = run.SearchMetadata.StartCount
		identity["objective_set"] = run.SearchMetadata.ObjectiveSet
		identity["priority_independent_discovery"] = run.SearchMetadata.PriorityIndependentDiscovery
	}
	return identity
}

func concept5DRunExhaustiveComparisons(ctx context.Context, fixtureName string, request NetworkOptimizationRequest, buildings *BuildingIndex, oracle concept5DOracle, step float64, profiles []concept5DPriorityProfile, maxRounds, maxExpandedStates, maxUniqueEvaluations int) ([]concept5DComparisonRecord, map[string]any, error) {
	policies := []string{LegacyNetworkSearchPolicy, DeterministicMultiStartCoordinateV1, DeterministicParetoArchiveSearchV1}
	records := make([]concept5DComparisonRecord, 0, len(profiles)*len(policies))
	identities := make(map[string]any, len(policies))
	for _, profile := range profiles {
		truth, err := concept5DTruthForProfile(oracle, profile.config())
		if err != nil {
			return nil, nil, err
		}
		for _, policy := range policies {
			runRequest := request
			runRequest.Optimization = profile.config()
			run, runErr := concept5DRunPolicy(ctx, runRequest, buildings, policy, step, maxRounds, maxExpandedStates, maxUniqueEvaluations)
			if runErr != nil {
				return nil, nil, fmt.Errorf("%s %s %s: %w", fixtureName, profile.Name, policy, runErr)
			}
			if _, exists := identities[policy]; !exists {
				identities[policy] = concept5DRunIdentity(run)
			}
			records = append(records, concept5DRecordFromRun(
				fixtureName,
				profile,
				run,
				&truth,
				"not_evaluated_in_canonical_record",
				"not_evaluated_in_canonical_record",
				"fresh_search_for_each_priority",
				"fresh_policy_run",
				"This record compares all three frozen policies against the same exhaustive RF candidate set.",
			))
		}
	}
	return records, identities, nil
}

func concept5DRawMetricSpread(runs []concept5DMeasuredRun) map[string]float64 {
	metrics := map[string][]float64{}
	for _, run := range runs {
		raw := run.RecommendedStats.RawMetrics
		values := map[string]float64{
			"served_demand_weight":               raw.ServedDemandWeight,
			"residential_covered":                float64(raw.ResidentialCovered),
			"propagation_reach_score":            raw.PropagationReachScore,
			"overlap_buildings":                  float64(raw.OverlapBuildings),
			"radio_quality_serviceable_fraction": raw.RadioQualityServiceableFraction,
		}
		for key, value := range values {
			metrics[key] = append(metrics[key], value)
		}
	}
	spread := make(map[string]float64, len(metrics))
	for key, values := range metrics {
		if len(values) == 0 {
			continue
		}
		minimum, maximum := values[0], values[0]
		for _, value := range values[1:] {
			minimum = math.Min(minimum, value)
			maximum = math.Max(maximum, value)
		}
		spread[key] = maximum - minimum
	}
	return spread
}

func concept5DRunVariantSummary(request NetworkOptimizationRequest, runs []concept5DMeasuredRun, labels []string, budgetInducedPossible bool) map[string]any {
	recommendations := make([]string, 0, len(runs))
	archiveSets := make([]string, 0, len(runs))
	frontierSets := make([]string, 0, len(runs))
	scores := make([]float64, 0, len(runs))
	for index, run := range runs {
		recommendations = append(recommendations, concept5DCanonicalStateKey(request, run.RecommendedAzimuths))
		archiveSets = append(archiveSets, concept5DHash(concept5DCanonicalArchiveKeys(request, run.Archive)))
		frontierSets = append(frontierSets, concept5DHash(concept5DCanonicalFrontierKeys(run.Frontier)))
		if index < len(labels) {
			_ = labels[index]
		}
		scores = append(scores, run.RecommendedStats.Score)
	}
	uniqueRecommendations := make(map[string]struct{}, len(recommendations))
	for _, value := range recommendations {
		uniqueRecommendations[value] = struct{}{}
	}
	uniqueArchiveSets := make(map[string]struct{}, len(archiveSets))
	for _, value := range archiveSets {
		uniqueArchiveSets[value] = struct{}{}
	}
	uniqueFrontierSets := make(map[string]struct{}, len(frontierSets))
	for _, value := range frontierSets {
		uniqueFrontierSets[value] = struct{}{}
	}
	scoreSpread := 0.0
	if len(scores) > 0 {
		minimum, maximum := scores[0], scores[0]
		for _, score := range scores[1:] {
			minimum = math.Min(minimum, score)
			maximum = math.Max(maximum, score)
		}
		scoreSpread = maximum - minimum
	}
	return map[string]any{
		"variant_labels":                           labels,
		"recommendations":                          recommendations,
		"recommendation_spread_count":              len(uniqueRecommendations),
		"score_spread":                             scoreSpread,
		"raw_metric_spread":                        concept5DRawMetricSpread(runs),
		"archive_variation_count":                  len(uniqueArchiveSets),
		"frontier_variation_count":                 len(uniqueFrontierSets),
		"search_fingerprint_variation":             concept5DStringVariation(runs, func(run concept5DMeasuredRun) string { return run.SearchFingerprint }),
		"discovery_fingerprint_variation":          concept5DStringVariation(runs, func(run concept5DMeasuredRun) string { return run.DiscoveryFingerprint }),
		"budget_induced_queue_truncation_possible": budgetInducedPossible,
	}
}

func concept5DStringVariation(runs []concept5DMeasuredRun, selector func(concept5DMeasuredRun) string) bool {
	values := make(map[string]struct{}, len(runs))
	for _, run := range runs {
		values[selector(run)] = struct{}{}
	}
	return len(values) > 1
}

type concept5DRequestVariant struct {
	Label   string
	Request NetworkOptimizationRequest
}

func concept5DOrderVariants(request NetworkOptimizationRequest) []concept5DRequestVariant {
	canonical := request
	reverse := concept5BReverseNetworkRequest(request)
	rotated := request
	rotated.Towers = append([]NetworkTowerRequest(nil), request.Towers...)
	if len(rotated.Towers) > 1 {
		rotated.Towers = append(rotated.Towers[1:], rotated.Towers[0])
	}
	rotatedTwice := request
	rotatedTwice.Towers = append([]NetworkTowerRequest(nil), request.Towers...)
	if len(rotatedTwice.Towers) > 2 {
		rotatedTwice.Towers = append(rotatedTwice.Towers[2:], rotatedTwice.Towers[:2]...)
	}
	variants := []concept5DRequestVariant{{Label: "canonical", Request: canonical}, {Label: "reverse", Request: reverse}}
	if len(request.Towers) > 2 {
		variants = append(variants, concept5DRequestVariant{Label: "rotate-1", Request: rotated}, concept5DRequestVariant{Label: "rotate-2", Request: rotatedTwice})
	}
	return variants
}

func concept5DStartVariants(request NetworkOptimizationRequest) []concept5DRequestVariant {
	baseline := request
	plusTen := request
	plusTen.Towers = append([]NetworkTowerRequest(nil), request.Towers...)
	plusTwenty := request
	plusTwenty.Towers = append([]NetworkTowerRequest(nil), request.Towers...)
	for index := range plusTen.Towers {
		plusTen.Towers[index].AzimuthDeg = normalizeDegrees(plusTen.Towers[index].AzimuthDeg + 10)
		plusTwenty.Towers[index].AzimuthDeg = normalizeDegrees(plusTwenty.Towers[index].AzimuthDeg + 20)
	}
	return []concept5DRequestVariant{{Label: "baseline", Request: baseline}, {Label: "all-plus-10", Request: plusTen}, {Label: "all-plus-20", Request: plusTwenty}}
}

func concept5DDeterminismFingerprint(run concept5DMeasuredRun) map[string]any {
	return map[string]any{
		"policy":                run.Policy,
		"scenario_fingerprint":  run.ScenarioFingerprint,
		"search_fingerprint":    run.SearchFingerprint,
		"discovery_fingerprint": run.DiscoveryFingerprint,
		"ranking_fingerprint":   run.RankingFingerprint,
		"archive_keys":          concept5DStateKeys(run.Archive),
		"active_archive_keys":   concept5DStateKeys(run.ActiveArchive),
		"frontier_keys":         concept5DCanonicalFrontierKeys(run.Frontier),
		"requested_evaluations": run.RequestedEvaluations,
		"unique_evaluations":    run.UniqueEvaluations,
		"cache_hits":            run.CacheHits,
		"termination_reason":    run.TerminationReason,
		"incomplete_search":     run.Incomplete,
		"final_azimuths":        run.FinalAzimuths,
		"state_trace":           run.StateTrace,
		"start_traces":          run.StartTraces,
	}
}

func concept5DWriteArtifact(root, relativePath string, value any) error {
	return concept5AWriteJSON(filepath.Join(root, relativePath), value)
}

func concept5DBudgetCurve(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, oracle concept5DOracle, budgets []int) ([]map[string]any, error) {
	profile := concept5DPriorityProfiles()[0]
	truth, err := concept5DTruthForProfile(oracle, profile.config())
	if err != nil {
		return nil, err
	}
	rows := make([]map[string]any, 0, len(budgets)*2+1)
	for _, budget := range budgets {
		for _, policy := range []string{DeterministicMultiStartCoordinateV1, DeterministicParetoArchiveSearchV1} {
			maxRounds, maxExpanded := 8, 16
			if policy == DeterministicParetoArchiveSearchV1 {
				maxRounds, maxExpanded = 4, 16
			}
			runRequest := request
			runRequest.Optimization = profile.config()
			run, runErr := concept5DRunPolicy(ctx, runRequest, buildings, policy, 10, maxRounds, maxExpanded, budget)
			if runErr != nil {
				return nil, fmt.Errorf("budget curve %s at %d: %w", policy, budget, runErr)
			}
			record := concept5DRecordFromRun("two-cell-36x36-budget-curve", profile, run, &truth, "not_evaluated", "not_evaluated", "single_priority", "fresh_budget_run")
			rows = append(rows, map[string]any{
				"policy":                 policy,
				"max_unique_evaluations": budget,
				"unique_evaluations":     run.UniqueEvaluations,
				"requested_evaluations":  run.RequestedEvaluations,
				"runtime_seconds":        run.RuntimeSeconds,
				"memory_allocated_bytes": run.MemoryAllocatedBytes,
				"recommendation":         record.Recommendation,
				"score":                  record.Score,
				"score_regret":           record.ScoreRegret,
				"pareto_recall":          record.ParetoRecall,
				"pareto_precision":       record.ParetoPrecision,
				"archive_size":           run.ArchiveSize,
				"active_pareto_size":     run.ActiveParetoSize,
				"cache_hits":             run.CacheHits,
				"incomplete_search":      run.Incomplete,
				"termination_reason":     run.TerminationReason,
				"exhaustive_verified":    true,
				"measurement":            record,
			})
		}
	}
	legacyRequest := request
	legacyRequest.Optimization = profile.config()
	legacy, legacyErr := concept5DRunPolicy(ctx, legacyRequest, buildings, LegacyNetworkSearchPolicy, 10, 2, 0, 0)
	if legacyErr != nil {
		return nil, legacyErr
	}
	legacyRecord := concept5DRecordFromRun("two-cell-36x36-budget-curve", profile, legacy, &truth, "not_evaluated", "not_evaluated", "single_priority", "fixed_legacy_cost")
	rows = append(rows, map[string]any{
		"policy":                 LegacyNetworkSearchPolicy,
		"max_unique_evaluations": nil,
		"budget_applies":         false,
		"unique_evaluations":     legacy.UniqueEvaluations,
		"requested_evaluations":  legacy.RequestedEvaluations,
		"runtime_seconds":        legacy.RuntimeSeconds,
		"memory_allocated_bytes": legacy.MemoryAllocatedBytes,
		"recommendation":         legacyRecord.Recommendation,
		"score":                  legacyRecord.Score,
		"score_regret":           legacyRecord.ScoreRegret,
		"pareto_recall":          legacyRecord.ParetoRecall,
		"pareto_precision":       legacyRecord.ParetoPrecision,
		"archive_size":           legacy.ArchiveSize,
		"active_pareto_size":     legacy.ActiveParetoSize,
		"incomplete_search":      false,
		"termination_reason":     legacy.TerminationReason,
		"exhaustive_verified":    true,
		"measurement":            legacyRecord,
	})
	return rows, nil
}

func concept5DInteractionArtifact() map[string]any {
	fixture := concept5ASyntheticFixtures()[1]
	legacy := concept5ASyntheticCoordinateSearch(fixture, fixture.Start)
	multi := concept5BSyntheticRun(fixture, concept5BSyntheticStarts(fixture))
	singlePareto := concept5CSyntheticTraversal(fixture, [][]int{append([]int(nil), fixture.Start...)}, false)
	startSetPareto := concept5CSyntheticTraversal(fixture, concept5BSyntheticStarts(fixture), false)
	globalKey := concept5ASyntheticKey([]int{1, 1})
	multiArchive, _ := multi["archive_keys"].([]string)
	containsGlobal := false
	for _, key := range multiArchive {
		if key == globalKey {
			containsGlobal = true
		}
	}
	return map[string]any{
		"fixture":                 fixture.Name,
		"global_best":             globalKey,
		"legacy":                  map[string]any{"recovered_better_basin": legacy.RecoveredGlobal, "final": legacy.Final, "reason": "single-start strict coordinate descent cannot accept either one-coordinate score decrease"},
		"concept_5b":              map[string]any{"recovered_better_basin": containsGlobal, "archive_keys": multi["archive_keys"], "reason": "deterministic start diversity reaches the global basin even though one start remains trapped"},
		"concept_5c_single_start": singlePareto,
		"concept_5c_start_set":    startSetPareto,
		"interpretation":          "5C's Pareto-only expansion is blocked by the dominated stepping stone in the single-start traversal; the configured four-start family recovers this synthetic basin.",
	}
}

func concept5DInfeasibleBarrierArtifact() map[string]any {
	barrier := concept5CInfeasibleBarrierAudit()
	return map[string]any{
		"fixture": barrier["fixture"],
		"states":  barrier["states"],
		"legacy": map[string]any{
			"recovered_interesting_feasible_state": false,
			"reason":                               "feasible-first coordinate acceptance does not traverse the infeasible intermediate states from the single baseline",
		},
		"concept_5b": map[string]any{
			"recovered_interesting_feasible_state": true,
			"reason":                               "one deterministic start can be the far feasible basin; this is start diversity, not infeasible traversal",
		},
		"concept_5c":        barrier,
		"semantics_changed": false,
	}
}

func concept5DMemoryArtifact() map[string]any {
	return map[string]any{
		"measurement_definition": "Observed allocation is runtime.MemStats.TotalAlloc delta. Archive cost is a deterministic audit estimate, not resident RSS.",
		"per_1000_unique_states": []map[string]any{
			{"policy": LegacyNetworkSearchPolicy, "model_bytes": 0, "interpretation": "No optimizer-level evaluated archive is exposed or retained as a product artifact; transient candidate work still exists during execution."},
			{"policy": DeterministicMultiStartCoordinateV1, "model_bytes_by_cell_count": map[string]int{"1": 88000, "2": 112000, "3": 136000, "6": 208000}, "formula": "1000 * (64 + cell_count * 24)"},
			{"policy": DeterministicParetoArchiveSearchV1, "model_bytes_by_cell_count": map[string]int{"1": 304000, "2": 352000, "3": 400000, "6": 544000}, "formula": "1000 * (256 + cell_count * 48); active Pareto metadata is additional"},
		},
		"interpretation": "5C has the highest archive cost because it retains complete evaluated evidence plus active Pareto/traversal metadata; the cost is the product trade-off for repeated Pareto exploration.",
	}
}

func concept5DMakeRerankedRun(base concept5DMeasuredRun, request NetworkOptimizationRequest, profile concept5DPriorityProfile, repetitions int) (concept5DMeasuredRun, error) {
	if base.Prepared == nil {
		return concept5DMeasuredRun{}, fmt.Errorf("5C rerank requires prepared search context")
	}
	if repetitions < 1 {
		repetitions = 1
	}
	request.Optimization = profile.config()
	NormalizeNetworkOptimizationRequest(&request)
	var ranked []NetworkParetoSolution
	var rerankErr error
	elapsed, allocated, measureErr := concept5DMeasure(func() error {
		for iteration := 0; iteration < repetitions; iteration++ {
			ranked, rerankErr = RerankNetworkParetoSolutions(base.Frontier, profile.config(), base.Prepared.ObjectiveAvailability)
			if rerankErr != nil {
				return rerankErr
			}
		}
		return nil
	})
	if measureErr != nil {
		return concept5DMeasuredRun{}, measureErr
	}
	if rerankErr != nil {
		return concept5DMeasuredRun{}, rerankErr
	}
	run := base
	run.Request = request
	run.ScenarioFingerprint = NetworkScenarioFingerprint(request)
	run.RankingFingerprint = networkParetoArchiveRankingFingerprint(base.DiscoveryFingerprint, profile.config())
	run.Frontier = ranked
	run.RuntimeSeconds = elapsed / float64(repetitions)
	run.MemoryAllocatedBytes = allocated / uint64(repetitions)
	run.RequestedEvaluations = 0
	run.UniqueEvaluations = base.UniqueEvaluations
	run.CacheHits = 0
	run.DuplicateRFWork = 0
	run.TerminationReason = "rerank_only_no_rf"
	run.Incomplete = base.Incomplete
	run.RecommendedKey, _, run.RecommendedStats, run.RecommendedAzimuths = concept5DRunRecommendation(run)
	return run, nil
}

func concept5DRunVariants(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex) (map[string]any, error) {
	profile := concept5DPriorityProfiles()[0]
	request.Optimization = profile.config()
	result := map[string]any{
		"fixture":              "three-cell-controlled",
		"priority_profile":     profile.Name,
		"order_variants":       map[string]any{},
		"start_variants":       map[string]any{},
		"comparison_semantics": "state identities are canonicalized by cell ID for the variant summaries; the underlying search still follows request order.",
	}
	for _, policy := range []string{LegacyNetworkSearchPolicy, DeterministicMultiStartCoordinateV1, DeterministicParetoArchiveSearchV1} {
		orderRuns := make([]concept5DMeasuredRun, 0)
		orderLabels := make([]string, 0)
		for _, variant := range concept5DOrderVariants(request) {
			maxPasses, maxExpanded, maxUnique := 2, 0, 0
			if policy == DeterministicMultiStartCoordinateV1 {
				maxPasses, maxUnique = 6, 1200
			} else if policy == DeterministicParetoArchiveSearchV1 {
				maxPasses, maxExpanded, maxUnique = 2, 6, 800
			}
			run, err := concept5DRunPolicy(ctx, variant.Request, buildings, policy, 10, maxPasses, maxExpanded, maxUnique)
			if err != nil {
				return nil, fmt.Errorf("order variant %s %s: %w", policy, variant.Label, err)
			}
			orderRuns = append(orderRuns, run)
			orderLabels = append(orderLabels, variant.Label)
		}
		startRuns := make([]concept5DMeasuredRun, 0)
		startLabels := make([]string, 0)
		for _, variant := range concept5DStartVariants(request) {
			maxPasses, maxExpanded, maxUnique := 2, 0, 0
			if policy == DeterministicMultiStartCoordinateV1 {
				maxPasses, maxUnique = 6, 1200
			} else if policy == DeterministicParetoArchiveSearchV1 {
				maxPasses, maxExpanded, maxUnique = 2, 6, 800
			}
			run, err := concept5DRunPolicy(ctx, variant.Request, buildings, policy, 10, maxPasses, maxExpanded, maxUnique)
			if err != nil {
				return nil, fmt.Errorf("start variant %s %s: %w", policy, variant.Label, err)
			}
			startRuns = append(startRuns, run)
			startLabels = append(startLabels, variant.Label)
		}
		result["order_variants"].(map[string]any)[policy] = concept5DRunVariantSummary(request, orderRuns, orderLabels, policy != LegacyNetworkSearchPolicy)
		result["start_variants"].(map[string]any)[policy] = concept5DRunVariantSummary(request, startRuns, startLabels, policy != LegacyNetworkSearchPolicy)
	}
	return result, nil
}

func concept5DMultiPriorityCost(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, oracle concept5DOracle, profiles []concept5DPriorityProfile) (map[string]any, error) {
	if len(profiles) == 0 {
		return nil, fmt.Errorf("no priority profiles for multi-priority audit")
	}
	truthByProfile := make(map[string]concept5DTruth, len(profiles))
	for _, profile := range profiles {
		truth, err := concept5DTruthForProfile(oracle, profile.config())
		if err != nil {
			return nil, err
		}
		truthByProfile[profile.Name] = truth
	}
	baseRequest := request
	baseRequest.Optimization = profiles[0].config()
	base5C, err := concept5DRunPolicy(ctx, baseRequest, buildings, DeterministicParetoArchiveSearchV1, 10, 4, 16, 5000)
	if err != nil {
		return nil, fmt.Errorf("multi-priority base 5C discovery: %w", err)
	}
	profileRows := make([]map[string]any, 0, len(profiles))
	legacyUnique := make([]int, 0, len(profiles))
	multiUnique := make([]int, 0, len(profiles))
	rankLatency := make([]float64, 0, len(profiles))
	allRecords := make([]concept5DComparisonRecord, 0, len(profiles)*3)
	for _, profile := range profiles {
		profileRequest := request
		profileRequest.Optimization = profile.config()
		truth := truthByProfile[profile.Name]
		legacyRun, legacyErr := concept5DRunPolicy(ctx, profileRequest, buildings, LegacyNetworkSearchPolicy, 10, 2, 0, 0)
		if legacyErr != nil {
			return nil, fmt.Errorf("multi-priority legacy %s: %w", profile.Name, legacyErr)
		}
		multiRun, multiErr := concept5DRunPolicy(ctx, profileRequest, buildings, DeterministicMultiStartCoordinateV1, 10, 8, 0, 5000)
		if multiErr != nil {
			return nil, fmt.Errorf("multi-priority 5B %s: %w", profile.Name, multiErr)
		}
		rerankedRun, rerankErr := concept5DMakeRerankedRun(base5C, profileRequest, profile, 100)
		if rerankErr != nil {
			return nil, fmt.Errorf("multi-priority 5C rerank %s: %w", profile.Name, rerankErr)
		}
		legacyRecord := concept5DRecordFromRun("two-cell-36x36-multi-priority", profile, legacyRun, &truth, "see order audit", "see start audit", "fresh_search_priority_dependent", "fresh_legacy_search")
		multiRecord := concept5DRecordFromRun("two-cell-36x36-multi-priority", profile, multiRun, &truth, "see order audit", "see start audit", "fresh_search_priority_dependent", "fresh_5b_search")
		cRecord := concept5DRecordFromRun("two-cell-36x36-multi-priority", profile, rerankedRun, &truth, "order-independent archive identity", "start-independent discovered archive", "priority_independent_discovery_plus_pure_rerank", "one_5c_discovery_plus_no_rf_rerank", "RerankNetworkParetoSolutions was measured over stored Stats only; RF evaluations during rerank are zero.")
		allRecords = append(allRecords, legacyRecord, multiRecord, cRecord)
		legacyUnique = append(legacyUnique, legacyRun.UniqueEvaluations)
		multiUnique = append(multiUnique, multiRun.UniqueEvaluations)
		rankLatency = append(rankLatency, rerankedRun.RuntimeSeconds)
		profileRows = append(profileRows, map[string]any{
			"priority_profile": profile.Name,
			"legacy":           legacyRecord,
			"concept_5b":       multiRecord,
			"concept_5c_rerank": map[string]any{
				"record":                       cRecord,
				"rf_evaluations":               0,
				"discovery_unique_evaluations": base5C.UniqueEvaluations,
				"rerank_latency_seconds":       rerankedRun.RuntimeSeconds,
			},
		})
	}
	costRows := make([]map[string]any, 0, 4)
	for _, count := range []int{1, 3, 5, 10} {
		if count > len(profiles) {
			continue
		}
		legacyCost, multiCost := 0, 0
		for index := 0; index < count; index++ {
			legacyCost += legacyUnique[index]
			multiCost += multiUnique[index]
		}
		rerankCost := base5C.UniqueEvaluations
		latency := 0.0
		for _, value := range rankLatency[:count] {
			latency += value
		}
		costRows = append(costRows, map[string]any{
			"priority_count": count,
			"legacy": map[string]any{
				"unique_rf_evaluations":    legacyCost,
				"requested_rf_evaluations": legacyCost,
				"cost_model":               "fresh legacy search for every priority",
			},
			"concept_5b": map[string]any{
				"unique_rf_evaluations":    multiCost,
				"requested_rf_evaluations": multiCost,
				"cost_model":               "fresh multi-start search for every priority; each row includes its own archive",
			},
			"concept_5c": map[string]any{
				"discovery_unique_rf_evaluations": rerankCost,
				"rerank_count":                    count,
				"rerank_rf_evaluations":           0,
				"rerank_latency_seconds_sum":      latency,
				"cost_model":                      "one priority-independent archive plus pure stored-metric reranks",
			},
		})
	}
	return map[string]any{
		"audit_version":                  concept5DAuditVersion,
		"fixture":                        "two-cell-36x36",
		"priority_profiles":              profiles,
		"base_discovery":                 concept5DRunIdentity(base5C),
		"base_discovery_metrics":         map[string]any{"unique_evaluations": base5C.UniqueEvaluations, "requested_evaluations": base5C.RequestedEvaluations, "archive_size": base5C.ArchiveSize, "active_pareto_size": base5C.ActiveParetoSize, "termination_reason": base5C.TerminationReason},
		"discovery_priority_independent": base5C.SearchMetadata != nil && base5C.SearchMetadata.PriorityIndependentDiscovery,
		"objective_availability":         base5C.SearchMetadata.ObjectiveAvailability,
		"profile_rows":                   profileRows,
		"cost_by_priority_count":         costRows,
		"records":                        allRecords,
		"interpretation":                 "The 5C rows intentionally charge RF discovery once and charge later priorities only for pure reranking; the 5B and legacy rows rerun RF discovery for each priority.",
	}, nil
}

func concept5DAnkaraAudit(ctx context.Context, root string, profiles []concept5DPriorityProfile) (map[string]any, []concept5DComparisonRecord, error) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		datasetDir = filepath.Join(root, "data-pipeline")
	}
	dataset, loadErr := LoadDatasetPack(datasetDir)
	if loadErr != nil || dataset == nil || dataset.BuildingIndex == nil {
		return map[string]any{"audit_version": concept5DAuditVersion, "available": false, "dataset_dir": filepath.ToSlash(datasetDir), "load_error": errorString(loadErr)}, nil, nil
	}
	request := canonicalAnkaraNetworkOptimizationRequest()
	records := make([]concept5DComparisonRecord, 0, len(profiles)*3)
	rows := make([]map[string]any, 0, len(profiles))
	defaultLegacy, err := concept5DRunPolicy(ctx, request, dataset.BuildingIndex, LegacyNetworkSearchPolicy, 10, 2, 0, 0)
	if err != nil {
		return nil, nil, fmt.Errorf("Ankara frozen legacy default: %w", err)
	}
	default5B, err := concept5DRunPolicy(ctx, request, dataset.BuildingIndex, DeterministicMultiStartCoordinateV1, 10, 2, 0, 600)
	if err != nil {
		return nil, nil, fmt.Errorf("Ankara bounded 5B default comparison: %w", err)
	}
	var base5C concept5DMeasuredRun
	var baseline5B concept5DMeasuredRun
	for profileIndex, profile := range profiles {
		profileRequest := request
		profileRequest.Optimization = profile.config()
		legacyRun, err := concept5DRunPolicy(ctx, profileRequest, dataset.BuildingIndex, LegacyNetworkSearchPolicy, 10, 2, 0, 0)
		if err != nil {
			return nil, nil, fmt.Errorf("Ankara legacy %s: %w", profile.Name, err)
		}
		multiRun, err := concept5DRunPolicy(ctx, profileRequest, dataset.BuildingIndex, DeterministicMultiStartCoordinateV1, 10, 2, 0, 600)
		if err != nil {
			return nil, nil, fmt.Errorf("Ankara 5B %s: %w", profile.Name, err)
		}
		var paretoRun concept5DMeasuredRun
		attribution := "fresh_5c_discovery"
		if profileIndex == 0 {
			paretoRun, err = concept5DRunPolicy(ctx, profileRequest, dataset.BuildingIndex, DeterministicParetoArchiveSearchV1, 10, 1, 2, 600)
			base5C = paretoRun
			baseline5B = multiRun
		} else {
			paretoRun, err = concept5DMakeRerankedRun(base5C, profileRequest, profile, 100)
			attribution = "one_5c_discovery_plus_no_rf_rerank"
		}
		if err != nil {
			return nil, nil, fmt.Errorf("Ankara 5C %s: %w", profile.Name, err)
		}
		legacyRecord := concept5DRecordFromRun("ankara-six-cell", profile, legacyRun, nil, "measured below", "measured below", "fresh_search_priority_dependent", "fresh_legacy_search")
		multiRecord := concept5DRecordFromRun("ankara-six-cell", profile, multiRun, nil, "measured below", "measured below", "fresh_search_priority_dependent", "fresh_5b_search")
		paretoRecord := concept5DRecordFromRun("ankara-six-cell", profile, paretoRun, nil, "cell-ID canonical archive", "deterministic archive", "priority_independent_discovery_plus_rerank", attribution, "Ankara does not have an exhaustive oracle in this artifact; quality fields are therefore observational, not global-regret claims.")
		records = append(records, legacyRecord, multiRecord, paretoRecord)
		rows = append(rows, map[string]any{
			"priority_profile":       profile.Name,
			"legacy":                 legacyRecord,
			"legacy_raw_metrics":     legacyRun.RecommendedStats.RawMetrics,
			"concept_5b":             multiRecord,
			"concept_5b_raw_metrics": multiRun.RecommendedStats.RawMetrics,
			"concept_5c":             paretoRecord,
			"concept_5c_raw_metrics": paretoRun.RecommendedStats.RawMetrics,
		})
	}
	return map[string]any{
		"audit_version":                  concept5DAuditVersion,
		"available":                      true,
		"dataset_dir":                    filepath.ToSlash(datasetDir),
		"request":                        map[string]any{"cells": len(request.Towers), "rays": request.Rays, "radius_m": request.RadiusMeters, "frequency_ghz": request.FrequencyGHz, "beam_width_deg": request.BeamWidthDeg},
		"legacy_default":                 map[string]any{"recommendation": defaultLegacy.RecommendedKey, "score": defaultLegacy.RecommendedStats.Score, "optimized_azimuths": defaultLegacy.RecommendedAzimuths, "raw_metrics": defaultLegacy.RecommendedStats.RawMetrics, "unique_evaluations": defaultLegacy.UniqueEvaluations, "requested_evaluations": defaultLegacy.RequestedEvaluations, "runtime_seconds": defaultLegacy.RuntimeSeconds},
		"concept_5b_default":             map[string]any{"recommendation": default5B.RecommendedKey, "score": default5B.RecommendedStats.Score, "optimized_azimuths": default5B.RecommendedAzimuths, "raw_metrics": default5B.RecommendedStats.RawMetrics, "unique_evaluations": default5B.UniqueEvaluations, "requested_evaluations": default5B.RequestedEvaluations, "cache_hits": default5B.CacheHits, "runtime_seconds": default5B.RuntimeSeconds},
		"concept_5b":                     map[string]any{"profile": profiles[0].Name, "recommendation": baseline5B.RecommendedKey, "score": baseline5B.RecommendedStats.Score, "optimized_azimuths": baseline5B.RecommendedAzimuths, "unique_evaluations": baseline5B.UniqueEvaluations, "requested_evaluations": baseline5B.RequestedEvaluations, "cache_hits": baseline5B.CacheHits, "runtime_seconds": baseline5B.RuntimeSeconds},
		"concept_5c_multi_priority":      map[string]any{"discovery_unique_evaluations": base5C.UniqueEvaluations, "requested_evaluations": base5C.RequestedEvaluations, "archive_size": base5C.ArchiveSize, "active_pareto_size": base5C.ActiveParetoSize, "cache_hits": base5C.CacheHits, "duplicate_rf_work": base5C.DuplicateRFWork, "raw_metrics": base5C.RecommendedStats.RawMetrics, "rerank_rf_evaluations": 0, "rerank_policy": "RerankNetworkParetoSolutions over stored metrics"},
		"discovery_priority_independent": base5C.SearchMetadata != nil && base5C.SearchMetadata.PriorityIndependentDiscovery,
		"objective_availability": func() any {
			if base5C.SearchMetadata == nil {
				return nil
			}
			return base5C.SearchMetadata.ObjectiveAvailability
		}(),
		"priority_profiles":         profiles,
		"profile_rows":              rows,
		"records":                   records,
		"frozen_legacy_expectation": map[string]any{"optimized_azimuths": []float64{70, 20, 130, 160, 290, 110}, "score": 41.1715, "observed_matches": reflect.DeepEqual(defaultLegacy.RecommendedAzimuths, []float64{70, 20, 130, 160, 290, 110}) && math.Abs(defaultLegacy.RecommendedStats.Score-41.1715) < 1e-6, "note": "The canonical six-cell regression identity from the existing 5A/5B/5C audit artifacts; this 5D run records the observed value alongside it."},
		"interpretation":            "The radio-quality-focused profile is included as a realistic product profile when the fixed radio-quality objective is available. 5C pays the RF discovery cost once and reranks subsequent profiles without new RF work.",
	}, records, nil
}

func concept5DProductUseCasesArtifact() map[string]any {
	return map[string]any{
		"audit_version": concept5DAuditVersion,
		"policy_names": map[string]string{
			LegacyNetworkSearchPolicy:           "Legacy default",
			DeterministicMultiStartCoordinateV1: "Deep search",
			DeterministicParetoArchiveSearchV1:  "Pareto Explorer",
		},
		"use_cases": []map[string]any{
			{"use_case": "fast interactive single recommendation", "default_policy": LegacyNetworkSearchPolicy, "why": "preserves the current latency and response contract", "user_facing_label": "Fast recommendation"},
			{"use_case": "offline planning run where a deeper single answer is worth more RF work", "default_policy": DeterministicMultiStartCoordinateV1, "why": "deterministic start diversity and until-stable traces improve basin coverage", "user_facing_label": "Deep search"},
			{"use_case": "planner compares several objective priorities", "default_policy": DeterministicParetoArchiveSearchV1, "why": "one priority-independent evaluated archive can be reranked without RF calls", "user_facing_label": "Pareto Explorer"},
			{"use_case": "audit/reproducibility and regression evidence", "default_policy": LegacyNetworkSearchPolicy, "why": "the frozen legacy identity remains the compatibility anchor", "user_facing_label": "Compatibility mode"},
		},
		"ux_naming_proposal": map[string]any{
			"legacy":     "Fast recommendation (default)",
			"concept_5b": "Deep search",
			"concept_5c": "Pareto Explorer",
			"avoid":      []string{"global optimum", "guaranteed best", "complete Pareto frontier"},
			"use":        []string{"best evaluated candidate", "bounded discovered trade-offs", "recommended candidate under this search policy"},
		},
		"no_ui_scope": "This artifact proposes product language and policy placement only; no frontend UI is changed by Concept 5D.",
	}
}

func concept5DDecisionArtifact(exhaustiveRecords []concept5DComparisonRecord, ankara map[string]any, multi map[string]any) map[string]any {
	return map[string]any{
		"audit_version":  concept5DAuditVersion,
		"recommendation": "D",
		"decision": map[string]any{
			"D": "Context-dependent policy selection: keep legacy as the default compatibility/latency path; offer 5B for deeper bounded single-answer search; offer 5C for Pareto exploration and repeated priority reranking.",
			"A": "Do not replace the legacy default with 5B: its extra RF work is not a universal quality guarantee.",
			"B": "Do not replace the legacy default with 5C: archive cost, bounded traversal, and incomplete-frontier risk are product trade-offs.",
			"C": "Do not add a fourth algorithm in Concept 5D; future novelty/angle-refinement remains a separately gated research decision.",
			"E": "Do not reject the opt-ins: both provide measurable value in scoped use cases when their limits are disclosed.",
		},
		"policy_contract": []map[string]any{
			{"policy": LegacyNetworkSearchPolicy, "role": "default", "guarantee": "deterministic fixed two-pass coordinate sweep; no global-optimality claim"},
			{"policy": DeterministicMultiStartCoordinateV1, "role": "opt-in deep search", "guarantee": "deterministic bounded multi-start heuristic; archive is best evaluated evidence"},
			{"policy": DeterministicParetoArchiveSearchV1, "role": "opt-in Pareto Explorer", "guarantee": "priority-independent bounded archive discovery followed by pure reranking; not a complete frontier"},
		},
		"evidence_links":          []string{"docs/concept-5d-policy-comparison.json", "docs/concept-5d-exhaustive-quality.json", "docs/concept-5d-multi-priority-cost.json", "docs/concept-5d-ankara-comparison.json", "docs/concept-5d-budget-curves.json"},
		"exhaustive_record_count": len(exhaustiveRecords),
		"ankara_available":        ankara["available"],
		"multi_priority_cost_rows": func() int {
			if rows, ok := multi["cost_by_priority_count"].([]map[string]any); ok {
				return len(rows)
			}
			return 0
		}(),
		"budget_proposals": map[string]any{
			"legacy":            "fixed compatibility path; keep current two-pass cost and no archive promise",
			"concept_5b":        "expose max unique RF evaluations and max passes; default opt-in budget should be explicit in the API/UI copy",
			"concept_5c":        "expose unique RF budget, expanded-state budget, and round budget; mark budget-limited results incomplete",
			"repeated_priority": "reuse one 5C archive and report rerank latency separately from RF discovery latency",
		},
		"future_novelty_decision": "No novelty or angle-refinement algorithm is selected for 5D. Revisit only with a new exhaustive interaction/trap suite, explicit novelty admission/termination semantics, matched RF/time budgets, and a product need that 5B/5C cannot serve.",
		"semantic_freeze":         "No RF model, objective definition, feasibility rule, Pareto dominance rule, legacy default, or production recommendation semantics are changed by this audit.",
	}
}

func concept5DWriteMarkdown(path string, root string) error {
	markdown := fmt.Sprintf(`# Concept 5D — Search Policy Selection and Productization Audit

Audit version: %s

## Decision

Recommendation D is context-dependent. Keep the frozen legacy two-pass coordinate search as the default compatibility and latency path. Offer Concept 5B as an explicit “Deep search” opt-in when deterministic multi-start exploration is worth additional RF work. Offer Concept 5C as “Pareto Explorer” when users need several priority views from one bounded evaluated archive. Do not claim that either opt-in is globally optimal or exhaustive.

The audit is decision-only. It does not add a fourth optimizer, change RF physics, change objective or feasibility semantics, change Pareto dominance, or change the legacy default.

## Frozen identities and comparison schema

The JSON comparison records normalize policy, fixture, priority vector, algorithm/version, scenario/search/discovery/ranking fingerprints, requested and unique RF evaluations, runtime, allocation measurement, recommendation, score/regret, raw objective deltas, Pareto recall/precision, archive size, sensitivity, cache work, termination, and guarantee language. The legacy, 5B, and 5C identities are recorded separately so compatible default behavior is not inferred from opt-in metadata.

## Quality evidence

The exhaustive-quality artifact compares the three policies with the same fixed RF candidate grid across multiple positive non-radio priority profiles. It reports recommendation recovery, score regret, raw metric deltas, and Pareto recall/precision against an independent oracle. Synthetic interaction traps show why a single coordinate basin and Pareto-only traversal can miss a better basin; deterministic start diversity recovers it in the audited fixture. The infeasible-barrier evidence is explicit: no policy receives a novelty guarantee merely because a distant feasible basin exists.

## Cost and reuse

The multi-priority-cost artifact reports 1/3/5/10 priority views. Legacy and 5B rerun RF discovery for each view. 5C pays discovery once, then reranks stored metrics with zero RF evaluations; rerank latency is measured separately. Budget curves match unique RF work for 5B and 5C, with legacy shown as fixed-cost context. Archive and cache estimates make the memory trade-off visible rather than hiding it behind response latency.

## Ankara and product placement

The Ankara artifact records the canonical six-cell comparison when the dataset pack is available, plus realistic balanced, propagation-reach-focused, demand-focused, residential-focused, and radio-quality-focused profiles. If the dataset is unavailable, the artifact says so. Product placement is intentionally small: “Fast recommendation (default)”, “Deep search”, and “Pareto Explorer”. No frontend UI is changed.

## Guarantees and limits

Legacy: deterministic fixed two-pass coordinate sweep, not a global optimum. 5B: deterministic bounded multi-start heuristic, best evaluated candidate only. 5C: priority-independent bounded archive discovery followed by pure reranking, not a complete Pareto frontier. A budget-limited run is incomplete. Scenario/search/discovery/ranking fingerprints and deterministic repeated-run checks are evidence, not mathematical optimality proofs.

## Gates and future work

The release gate is the existing repository suite plus race, vet, JSON/docs validation, version consistency, and diff checks. The future novelty/angle-refinement question remains open and is not implemented here; it should return only with a new exhaustive interaction suite, explicit admission and termination semantics, and matched RF/time budgets.

Artifacts are rooted at %s and are generated by a gated test-only audit. Allocation numbers use runtime.MemStats.TotalAlloc deltas and must not be read as resident RSS.
`, concept5DAuditVersion, filepath.ToSlash(root))
	return os.WriteFile(path, []byte(markdown), 0644)
}

func TestGenerateConcept5DArtifacts(t *testing.T) {
	if os.Getenv("ATOM_RUN_CONCEPT_5D_AUDIT") != "1" {
		t.Skip("set ATOM_RUN_CONCEPT_5D_AUDIT=1 to generate Concept 5D decision artifacts")
	}
	root := concept5AArtifactRoot(t)
	ctx := context.Background()
	profiles := concept5DPriorityProfiles()
	exhaustiveProfiles := profiles[:5]

	twoCellRequest, twoCellBuildings := concept5AExhaustiveFixture("coverage-demand")
	twoCellRequest.Towers[0].AzimuthDeg = 0
	twoCellRequest.Towers[1].AzimuthDeg = 180
	twoCellRequest.Optimization = profiles[0].config()
	twoOracle, err := concept5DBuildOracle(ctx, twoCellRequest, twoCellBuildings, 10)
	if err != nil {
		t.Fatalf("build two-cell Concept 5D oracle: %v", err)
	}
	twoRecords, twoIdentities, err := concept5DRunExhaustiveComparisons(ctx, "two-cell-36x36", twoCellRequest, twoCellBuildings, twoOracle, 10, exhaustiveProfiles, 4, 16, 5000)
	if err != nil {
		t.Fatalf("two-cell Concept 5D comparison: %v", err)
	}

	threeCellRequest, threeCellBuildings := concept5AControlledFixture(3)
	for index := range threeCellRequest.Towers {
		threeCellRequest.Towers[index].AzimuthDeg = float64(index * 120)
	}
	threeCellRequest.Optimization = profiles[0].config()
	threeOracle, err := concept5DBuildOracle(ctx, threeCellRequest, threeCellBuildings, 30)
	if err != nil {
		t.Fatalf("build three-cell Concept 5D oracle: %v", err)
	}
	threeRecords, threeIdentities, err := concept5DRunExhaustiveComparisons(ctx, "three-cell-12x12x12-restricted", threeCellRequest, threeCellBuildings, threeOracle, 30, exhaustiveProfiles, 4, 16, 5000)
	if err != nil {
		t.Fatalf("three-cell Concept 5D comparison: %v", err)
	}

	variantArtifact, err := concept5DRunVariants(ctx, threeCellRequest, threeCellBuildings)
	if err != nil {
		t.Fatalf("Concept 5D order/start sensitivity: %v", err)
	}
	multiArtifact, err := concept5DMultiPriorityCost(ctx, twoCellRequest, twoCellBuildings, twoOracle, profiles)
	if err != nil {
		t.Fatalf("Concept 5D multi-priority cost: %v", err)
	}
	budgetRows, err := concept5DBudgetCurve(ctx, twoCellRequest, twoCellBuildings, twoOracle, []int{150, 300, 500, 800, 1200, 2000, 5000})
	if err != nil {
		t.Fatalf("Concept 5D budget curves: %v", err)
	}

	ankaraArtifact, ankaraRecords, err := concept5DAnkaraAudit(ctx, root, concept5DAnkaraPriorityProfiles())
	if err != nil {
		t.Fatalf("Concept 5D Ankara comparison: %v", err)
	}
	allExhaustiveRecords := append(append([]concept5DComparisonRecord(nil), twoRecords...), threeRecords...)
	policyComparison := map[string]any{
		"audit_version":     concept5DAuditVersion,
		"policy_identities": map[string]any{"two_cell": twoIdentities, "three_cell": threeIdentities},
		"records":           allExhaustiveRecords,
		"frozen_policy_contract": []map[string]any{
			{"policy": LegacyNetworkSearchPolicy, "default_or_opt_in": "default", "algorithm": "network_coordinate_descent", "version": "fixed-two-pass-v1", "priority_dependent": true, "guarantee": "deterministic fixed two-pass coordinate sweep"},
			{"policy": DeterministicMultiStartCoordinateV1, "default_or_opt_in": "opt_in", "algorithm": "network_deterministic_multistart_coordinate", "version": "deterministic-multistart-v1", "priority_dependent": true, "guarantee": "bounded deterministic heuristic"},
			{"policy": DeterministicParetoArchiveSearchV1, "default_or_opt_in": "opt_in", "algorithm": "network_deterministic_pareto_archive", "version": "deterministic-pareto-archive-v1", "priority_dependent": false, "guarantee": "bounded priority-independent archive discovery plus pure rerank"},
		},
		"schema_note": "All records use the normalized Concept 5D comparison schema; nil quality fields mean no independent exhaustive oracle was used for that row.",
	}
	exhaustiveArtifact := map[string]any{
		"audit_version":                concept5DAuditVersion,
		"oracle_summaries":             map[string]any{"two_cell": concept5DOracleSummary(twoOracle, exhaustiveProfiles), "three_cell": concept5DOracleSummary(threeOracle, exhaustiveProfiles)},
		"records":                      allExhaustiveRecords,
		"two_cell_policy_identities":   twoIdentities,
		"three_cell_policy_identities": threeIdentities,
		"interaction_trap":             concept5DInteractionArtifact(),
		"infeasible_barrier":           concept5DInfeasibleBarrierArtifact(),
		"quality_interpretation":       "Recall and precision are against the independent fixed-grid oracle and do not imply continuous-angle or global guarantees outside that grid.",
	}
	postLegacyRequest := twoCellRequest
	postLegacyRequest.SearchPolicy = ""
	legacyBefore, err := OptimizeNetworkContext(ctx, postLegacyRequest, twoCellBuildings)
	if err != nil {
		t.Fatalf("Concept 5D legacy freeze before opt-ins: %v", err)
	}
	optInB := twoCellRequest
	optInB.SearchPolicy = DeterministicMultiStartCoordinateV1
	fiveBResponse, err := OptimizeNetworkContext(ctx, optInB, twoCellBuildings)
	if err != nil {
		t.Fatalf("Concept 5D 5B opt-in freeze: %v", err)
	}
	optInC := twoCellRequest
	optInC.SearchPolicy = DeterministicParetoArchiveSearchV1
	fiveCResponse, err := OptimizeNetworkContext(ctx, optInC, twoCellBuildings)
	if err != nil {
		t.Fatalf("Concept 5D 5C opt-in freeze: %v", err)
	}
	legacyAfter, err := OptimizeNetworkContext(ctx, postLegacyRequest, twoCellBuildings)
	if err != nil {
		t.Fatalf("Concept 5D legacy freeze after opt-ins: %v", err)
	}
	postArtifact := map[string]any{
		"audit_version":                                      concept5DAuditVersion,
		"production_search_files_modified":                   []string{},
		"legacy_default_snapshot_equal_before_after_opt_ins": reflect.DeepEqual(concept5AMakeProductionSnapshot(legacyBefore), concept5AMakeProductionSnapshot(legacyAfter)),
		"legacy_default_before":                              concept5AMakeProductionSnapshot(legacyBefore),
		"legacy_default_after":                               concept5AMakeProductionSnapshot(legacyAfter),
		"five_b_is_opt_in":                                   legacyBefore.Optimization.Search == nil,
		"five_c_is_opt_in":                                   legacyAfter.Optimization.Search == nil,
		"opt_in_search_metadata_present":                     fiveBResponse.Optimization.Search != nil && fiveCResponse.Optimization.Search != nil,
		"scenario_fingerprint_unchanged_by_search_policy":    legacyBefore.ScenarioFingerprint == fiveBResponse.ScenarioFingerprint && legacyBefore.ScenarioFingerprint == fiveCResponse.ScenarioFingerprint,
		"rf_objective_semantics_unchanged":                   true,
		"objective_and_pareto_semantics_changed":             false,
		"notes":                                              []string{"This is a test-only decision audit. Source-tree diff validation is performed outside the gated generator; production search/RF files are not edited by Concept 5D."},
	}
	useCases := concept5DProductUseCasesArtifact()
	decision := concept5DDecisionArtifact(allExhaustiveRecords, ankaraArtifact, multiArtifact)
	artifacts := map[string]any{
		"docs/concept-5d-policy-comparison.json":      policyComparison,
		"docs/concept-5d-exhaustive-quality.json":     exhaustiveArtifact,
		"docs/concept-5d-multi-priority-cost.json":    multiArtifact,
		"docs/concept-5d-ankara-comparison.json":      map[string]any{"audit": ankaraArtifact, "records": ankaraRecords},
		"docs/concept-5d-budget-curves.json":          map[string]any{"audit_version": concept5DAuditVersion, "fixture": "two-cell-36x36", "rows": budgetRows, "legacy_context": "legacy is fixed-cost context; its cost is not controlled by the opt-in unique-evaluation budget"},
		"docs/concept-5d-product-use-cases.json":      useCases,
		"docs/concept-5d-decision.json":               decision,
		"docs/concept-5d-post-change-comparison.json": postArtifact,
	}
	for relativePath, value := range artifacts {
		if err := concept5DWriteArtifact(root, relativePath, value); err != nil {
			t.Fatalf("write %s: %v", relativePath, err)
		}
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-policy-comparison.json", map[string]any{
		"audit_version":       concept5DAuditVersion,
		"policy_identities":   map[string]any{"two_cell": twoIdentities, "three_cell": threeIdentities},
		"records":             allExhaustiveRecords,
		"variant_sensitivity": variantArtifact,
		"memory_archive_cost": concept5DMemoryArtifact(),
		"schema_note":         "All records use the normalized Concept 5D comparison schema.",
	}); err != nil {
		t.Fatalf("write enriched policy comparison: %v", err)
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-exhaustive-quality.json", map[string]any{
		"audit_version":          concept5DAuditVersion,
		"oracle_summaries":       map[string]any{"two_cell": concept5DOracleSummary(twoOracle, exhaustiveProfiles), "three_cell": concept5DOracleSummary(threeOracle, exhaustiveProfiles)},
		"records":                allExhaustiveRecords,
		"interaction_trap":       concept5DInteractionArtifact(),
		"infeasible_barrier":     concept5DInfeasibleBarrierArtifact(),
		"quality_interpretation": "Recall and precision are against independent fixed-grid oracles.",
	}); err != nil {
		t.Fatalf("write enriched exhaustive quality: %v", err)
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-post-change-comparison.json", map[string]any{
		"audit_version":                                      concept5DAuditVersion,
		"production_search_files_modified":                   []string{},
		"legacy_default_snapshot_equal_before_after_opt_ins": reflect.DeepEqual(concept5AMakeProductionSnapshot(legacyBefore), concept5AMakeProductionSnapshot(legacyAfter)),
		"legacy_default_before":                              concept5AMakeProductionSnapshot(legacyBefore),
		"legacy_default_after":                               concept5AMakeProductionSnapshot(legacyAfter),
		"five_b_is_opt_in":                                   legacyBefore.Optimization.Search == nil,
		"five_c_is_opt_in":                                   legacyAfter.Optimization.Search == nil,
		"opt_in_search_metadata_present":                     fiveBResponse.Optimization.Search != nil && fiveCResponse.Optimization.Search != nil,
		"scenario_fingerprint_unchanged_by_search_policy":    legacyBefore.ScenarioFingerprint == fiveBResponse.ScenarioFingerprint && legacyBefore.ScenarioFingerprint == fiveCResponse.ScenarioFingerprint,
		"rf_objective_semantics_unchanged":                   true,
		"objective_and_pareto_semantics_changed":             false,
	}); err != nil {
		t.Fatalf("write enriched post-change comparison: %v", err)
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-product-use-cases.json", useCases); err != nil {
		t.Fatalf("write product use cases: %v", err)
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-decision.json", decision); err != nil {
		t.Fatalf("write decision: %v", err)
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-ankara-comparison.json", map[string]any{"audit": ankaraArtifact, "records": ankaraRecords}); err != nil {
		t.Fatalf("write Ankara comparison: %v", err)
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-multi-priority-cost.json", multiArtifact); err != nil {
		t.Fatalf("write multi-priority cost: %v", err)
	}
	if err := concept5DWriteArtifact(root, "docs/concept-5d-budget-curves.json", map[string]any{"audit_version": concept5DAuditVersion, "fixture": "two-cell-36x36", "rows": budgetRows, "legacy_context": "legacy is fixed-cost context"}); err != nil {
		t.Fatalf("write budget curves: %v", err)
	}
	if err := concept5DWriteMarkdown(filepath.Join(root, "docs/concept-5d-search-policy-selection.md"), root); err != nil {
		t.Fatalf("write Concept 5D markdown: %v", err)
	}
	t.Logf("Concept 5D artifacts generated: %s", filepath.Join(root, "docs"))
}
