package raytracer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
)

const (
	// LegacyNetworkSearchPolicy is the explicit name for the unchanged
	// two-pass coordinate search used when search_policy is omitted.
	LegacyNetworkSearchPolicy = "legacy_two_pass_coordinate"

	// DeterministicMultiStartCoordinateV1 enables the opt-in bounded
	// multi-start coordinate-descent search.
	DeterministicMultiStartCoordinateV1 = "deterministic_multistart_coordinate_v1"

	// DeterministicParetoArchiveSearchV1 enables the opt-in bounded
	// priority-independent multi-objective archive search.
	DeterministicParetoArchiveSearchV1 = "deterministic_pareto_archive_search_v1"

	DefaultNetworkSearchMaxPasses            = 8
	DefaultNetworkSearchMaxUniqueEvaluations = 5000
	DefaultNetworkSearchMaxExpandedStates    = 128
	DefaultNetworkSearchMaxRounds            = 16
	MaxNetworkSearchMaxPasses                = 64
	MaxNetworkSearchMaxUniqueEvaluations     = 100000
	MaxNetworkSearchMaxExpandedStates        = 5000
	MaxNetworkSearchMaxRounds                = 64

	networkSearchAlgorithm        = "deterministic_coordinate_descent"
	networkSearchVersion          = "v1"
	networkSearchStateKeyVersion  = "network-state-v1"
	networkSearchMultistartPolicy = "baseline_plus_uniform_global_rotations_v1"
	networkSearchAzimuthStepDeg   = 10.0
)

// NetworkOptimizationSearchUpdate records one accepted coordinate move. The
// score fields are the normalized 0-100 score, while the acceptance decision
// uses the existing normalized composite score internally.
type NetworkOptimizationSearchUpdate struct {
	Pass             int     `json:"pass"`
	CellID           string  `json:"cell_id"`
	BeforeAzimuthDeg float64 `json:"before_azimuth_deg"`
	AfterAzimuthDeg  float64 `json:"after_azimuth_deg"`
	BeforeScore      float64 `json:"before_score"`
	AfterScore       float64 `json:"after_score"`
	BeforeFeasible   bool    `json:"before_feasible"`
	AfterFeasible    bool    `json:"after_feasible"`
	StateFingerprint string  `json:"state_fingerprint"`
}

// NetworkOptimizationStartTrace makes each deterministic start auditable
// without exposing RF internals or relying on wall-clock metadata.
type NetworkOptimizationStartTrace struct {
	StartID              string                            `json:"start_id"`
	StartingAzimuths     []float64                         `json:"starting_azimuths"`
	Passes               int                               `json:"passes"`
	AcceptedUpdates      []NetworkOptimizationSearchUpdate `json:"accepted_updates"`
	RequestedEvaluations int                               `json:"requested_evaluations"`
	UniqueEvaluations    int                               `json:"unique_evaluations"`
	CacheHits            int                               `json:"cache_hits"`
	FinalAzimuths        []float64                         `json:"final_azimuths"`
	FinalScore           float64                           `json:"final_score"`
	FinalFeasible        bool                              `json:"final_feasible"`
	TerminationReason    string                            `json:"termination_reason"`
	StateTrace           []string                          `json:"state_trace"`
}

// NetworkOptimizationSearchMetadata describes discovery, caching, and
// stopping behavior for the opt-in heuristic. It deliberately distinguishes
// a discovered/archive Pareto set from any global-optimality claim.
type NetworkOptimizationSearchMetadata struct {
	SearchPolicy                        string                          `json:"search_policy"`
	Policy                              string                          `json:"policy"`
	SearchAlgorithm                     string                          `json:"search_algorithm"`
	SearchVersion                       string                          `json:"search_version"`
	Heuristic                           bool                            `json:"heuristic"`
	Exhaustive                          bool                            `json:"exhaustive"`
	GloballyOptimal                     bool                            `json:"globally_optimal"`
	SearchGuarantee                     string                          `json:"search_guarantee"`
	MultistartPolicy                    string                          `json:"multistart_policy"`
	StartCount                          int                             `json:"start_count"`
	CompletedStartCount                 int                             `json:"completed_start_count"`
	StartTraces                         []NetworkOptimizationStartTrace `json:"start_traces"`
	EvaluationRequests                  int                             `json:"evaluation_requests"`
	UniqueEvaluations                   int                             `json:"unique_evaluations"`
	CacheHits                           int                             `json:"cache_hits"`
	EvaluatedArchiveSize                int                             `json:"evaluated_archive_size"`
	ArchiveSize                         int                             `json:"archive_size"`
	FeasibleArchiveSize                 int                             `json:"feasible_archive_size"`
	ParetoSize                          int                             `json:"pareto_size"`
	CandidateDiscoveryPriorityDependent bool                            `json:"candidate_discovery_priority_dependent"`
	IncompleteSearch                    bool                            `json:"incomplete_search"`
	SearchFingerprint                   string                          `json:"search_fingerprint"`
	MaxPasses                           int                             `json:"max_passes"`
	MaxUniqueEvaluations                int                             `json:"max_unique_evaluations"`
	AzimuthStepDeg                      float64                         `json:"azimuth_step_deg"`
	StateKeyVersion                     string                          `json:"state_key_version"`
	// The following fields are populated only by the Concept 5C policy. They
	// are omitted for legacy and Concept 5B responses so those contracts stay
	// byte-for-byte compatible at the JSON boundary.
	DiscoveryFingerprint         string                                       `json:"discovery_fingerprint,omitempty"`
	RankingFingerprint           string                                       `json:"ranking_fingerprint,omitempty"`
	PriorityIndependentDiscovery bool                                         `json:"priority_independent_discovery,omitempty"`
	ObjectiveSet                 []string                                     `json:"objective_set,omitempty"`
	ObjectiveAvailability        map[string]OptimizationObjectiveAvailability `json:"objective_availability,omitempty"`
	StartPolicy                  string                                       `json:"start_policy,omitempty"`
	NeighborhoodPolicy           string                                       `json:"neighborhood_policy,omitempty"`
	QueuePolicy                  string                                       `json:"queue_policy,omitempty"`
	SteppingStonePolicy          string                                       `json:"stepping_stone_policy,omitempty"`
	FeasibilityPolicy            string                                       `json:"feasibility_policy,omitempty"`
	TerminationReason            string                                       `json:"termination_reason,omitempty"`
	BudgetComplete               bool                                         `json:"budget_complete,omitempty"`
	MaxExpandedStates            int                                          `json:"max_expanded_states,omitempty"`
	MaxSearchRounds              int                                          `json:"max_search_rounds,omitempty"`
	ExpandedStates               int                                          `json:"expanded_states,omitempty"`
	SearchRounds                 int                                          `json:"search_rounds,omitempty"`
	ActiveParetoSize             int                                          `json:"active_pareto_size,omitempty"`
	RemovedDominatedCount        int                                          `json:"removed_dominated_count,omitempty"`
	NeighborRequests             int                                          `json:"neighbor_requests,omitempty"`
	DuplicateEdgeCount           int                                          `json:"duplicate_edge_count,omitempty"`
	DominanceComparisons         int                                          `json:"dominance_comparisons,omitempty"`
	ArchiveGrowth                []NetworkOptimizationArchiveRound            `json:"archive_growth,omitempty"`
}

// MarshalJSON keeps the legacy and 5B metadata shape unchanged while making
// the 5C budget outcome explicit even when the search was incomplete.
func (metadata NetworkOptimizationSearchMetadata) MarshalJSON() ([]byte, error) {
	type metadataAlias NetworkOptimizationSearchMetadata
	raw, err := json.Marshal(metadataAlias(metadata))
	if err != nil {
		return nil, err
	}
	if metadata.SearchPolicy != DeterministicParetoArchiveSearchV1 || metadata.BudgetComplete {
		return raw, nil
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	fields["budget_complete"] = json.RawMessage("false")
	return json.Marshal(fields)
}

// NetworkOptimizationArchiveRound records deterministic archive growth for
// Concept 5C. It contains counts only; RF internals remain in the private
// evaluated-state ledger and are never retained in response metadata.
type NetworkOptimizationArchiveRound struct {
	Round                 int `json:"round"`
	TotalEvaluated        int `json:"total_evaluated"`
	FeasibleEvaluated     int `json:"feasible_evaluated"`
	ActiveParetoSize      int `json:"active_pareto_size"`
	RemovedDominatedCount int `json:"removed_dominated_count"`
	QueuedExpansions      int `json:"queued_expansions"`
	ExpandedStates        int `json:"expanded_states"`
	CacheHits             int `json:"cache_hits"`
}

type networkSearchStartSpec struct {
	ID       string
	Azimuths []float64
}

type networkSearchRunOptions struct {
	MaxPasses            int
	MaxUniqueEvaluations int
	MaxExpandedStates    int
	Memoize              bool
	StepDeg              float64
	Starts               []networkSearchStartSpec
}

type networkSearchRunResult struct {
	Archive       []networkOptimizationCandidate
	ActiveArchive []networkOptimizationCandidate
	Baseline      networkOptimizationCandidate
	FinalAzimuths []float64
	Metadata      NetworkOptimizationSearchMetadata
}

type networkSearchStateCell struct {
	ID         string  `json:"id"`
	AzimuthDeg float64 `json:"azimuth_deg"`
}

type networkSearchEvaluationLedger struct {
	Cache                map[string]networkOptimizationCandidate
	Archive              []networkOptimizationCandidate
	ArchiveByState       map[string]networkOptimizationCandidate
	EvaluationRequests   int
	UniqueEvaluations    int
	CacheHits            int
	MaxUniqueEvaluations int
	Memoize              bool
}

func normalizeNetworkSearchPolicy(policy string) string {
	policy = strings.ToLower(strings.TrimSpace(policy))
	if policy == "" {
		return LegacyNetworkSearchPolicy
	}
	return policy
}

// ValidateNetworkOptimizationSearchOptions validates the opt-in discovery
// controls without changing the legacy optimizer's default behavior.
func ValidateNetworkOptimizationSearchOptions(req NetworkOptimizationRequest) string {
	switch normalizeNetworkSearchPolicy(req.SearchPolicy) {
	case LegacyNetworkSearchPolicy, DeterministicMultiStartCoordinateV1:
	case DeterministicParetoArchiveSearchV1:
	default:
		return fmt.Sprintf("search_policy must be %q, %q, or %q", LegacyNetworkSearchPolicy, DeterministicMultiStartCoordinateV1, DeterministicParetoArchiveSearchV1)
	}
	if req.MaxSearchPasses < 0 {
		return "max_search_passes must be non-negative"
	}
	if req.MaxSearchPasses > MaxNetworkSearchMaxPasses {
		return fmt.Sprintf("max_search_passes must be at most %d", MaxNetworkSearchMaxPasses)
	}
	if req.MaxUniqueEvaluations < 0 {
		return "max_unique_evaluations must be non-negative"
	}
	if req.MaxUniqueEvaluations > MaxNetworkSearchMaxUniqueEvaluations {
		return fmt.Sprintf("max_unique_evaluations must be at most %d", MaxNetworkSearchMaxUniqueEvaluations)
	}
	if req.MaxExpandedStates < 0 {
		return "max_expanded_states must be non-negative"
	}
	if req.MaxExpandedStates > MaxNetworkSearchMaxExpandedStates {
		return fmt.Sprintf("max_expanded_states must be at most %d", MaxNetworkSearchMaxExpandedStates)
	}
	if req.MaxSearchRounds < 0 {
		return "max_search_rounds must be non-negative"
	}
	if req.MaxSearchRounds > MaxNetworkSearchMaxRounds {
		return fmt.Sprintf("max_search_rounds must be at most %d", MaxNetworkSearchMaxRounds)
	}
	return ""
}

func normalizedNetworkSearchBudgets(req NetworkOptimizationRequest) (int, int) {
	maxPasses := req.MaxSearchPasses
	if maxPasses == 0 {
		maxPasses = DefaultNetworkSearchMaxPasses
	}
	maxEvaluations := req.MaxUniqueEvaluations
	if maxEvaluations == 0 {
		maxEvaluations = DefaultNetworkSearchMaxUniqueEvaluations
	}
	return maxPasses, maxEvaluations
}

func deterministicNetworkSearchStarts(req NetworkOptimizationRequest) []networkSearchStartSpec {
	baseline := make([]float64, len(req.Towers))
	for index, tower := range req.Towers {
		baseline[index] = normalizeDegrees(tower.AzimuthDeg)
	}
	offsets := []struct {
		id     string
		offset float64
	}{
		{id: "baseline", offset: 0},
		{id: "uniform-90", offset: 90},
		{id: "uniform-180", offset: 180},
		{id: "uniform-270", offset: 270},
	}
	starts := make([]networkSearchStartSpec, 0, len(offsets))
	for _, offset := range offsets {
		azimuths := make([]float64, len(baseline))
		for index, azimuth := range baseline {
			azimuths[index] = normalizeDegrees(azimuth + offset.offset)
		}
		starts = append(starts, networkSearchStartSpec{ID: offset.id, Azimuths: azimuths})
	}
	return starts
}

func networkSearchStateKey(towers []NetworkTowerRequest, azimuths []float64) string {
	cells := make([]networkSearchStateCell, 0, len(towers))
	for index, tower := range towers {
		if index >= len(azimuths) {
			break
		}
		cells = append(cells, networkSearchStateCell{
			ID:         tower.ID,
			AzimuthDeg: roundFloat(normalizeDegrees(azimuths[index]), 6),
		})
	}
	sort.SliceStable(cells, func(i, j int) bool {
		if cells[i].ID == cells[j].ID {
			return cells[i].AzimuthDeg < cells[j].AzimuthDeg
		}
		return cells[i].ID < cells[j].ID
	})
	serialized, err := json.Marshal(cells)
	if err != nil {
		return networkSearchStateKeyVersion + "-unknown"
	}
	digest := sha256.Sum256(serialized)
	return networkSearchStateKeyVersion + "-" + hex.EncodeToString(digest[:12])
}

func networkSearchCandidateAngles(step float64) []float64 {
	if step <= 0 || math.IsNaN(step) || math.IsInf(step, 0) {
		step = networkSearchAzimuthStepDeg
	}
	count := int(math.Round(360 / step))
	if count < 1 {
		count = 1
	}
	angles := make([]float64, 0, count)
	for index := 0; index < count; index++ {
		angles = append(angles, normalizeDegrees(float64(index)*step))
	}
	return angles
}

func networkSearchFingerprint(req NetworkOptimizationRequest, starts []networkSearchStartSpec, step float64, maxPasses int, maxUniqueEvaluations int) string {
	cellOrder := make([]string, 0, len(req.Towers))
	for _, tower := range req.Towers {
		cellOrder = append(cellOrder, tower.ID)
	}
	startIdentity := make([]struct {
		ID       string    `json:"id"`
		Azimuths []float64 `json:"azimuths"`
	}, 0, len(starts))
	for _, start := range starts {
		startIdentity = append(startIdentity, struct {
			ID       string    `json:"id"`
			Azimuths []float64 `json:"azimuths"`
		}{ID: start.ID, Azimuths: append([]float64(nil), start.Azimuths...)})
	}
	identity := struct {
		Policy               string             `json:"policy"`
		Algorithm            string             `json:"algorithm"`
		Version              string             `json:"version"`
		MultistartPolicy     string             `json:"multistart_policy"`
		ScenarioFingerprint  string             `json:"scenario_fingerprint"`
		CellOrder            []string           `json:"cell_order"`
		Starts               any                `json:"starts"`
		AzimuthStepDeg       float64            `json:"azimuth_step_deg"`
		CandidateGrid        []float64          `json:"candidate_grid"`
		AcceptancePolicy     string             `json:"acceptance_policy"`
		TerminationPolicy    string             `json:"termination_policy"`
		MaxPasses            int                `json:"max_passes"`
		MaxUniqueEvaluations int                `json:"max_unique_evaluations"`
		ObjectiveConfig      OptimizationConfig `json:"objective_config"`
		RFProfile            CellRFProfile      `json:"rf_profile"`
		StateKeyVersion      string             `json:"state_key_version"`
	}{
		Policy:               DeterministicMultiStartCoordinateV1,
		Algorithm:            networkSearchAlgorithm,
		Version:              networkSearchVersion,
		MultistartPolicy:     networkSearchMultistartPolicy,
		ScenarioFingerprint:  NetworkScenarioFingerprint(req),
		CellOrder:            cellOrder,
		Starts:               startIdentity,
		AzimuthStepDeg:       step,
		CandidateGrid:        networkSearchCandidateAngles(step),
		AcceptancePolicy:     "feasible_first_then_strict_composite_score",
		TerminationPolicy:    "coordinate_stable_or_repeated_state_or_budget_or_max_passes",
		MaxPasses:            maxPasses,
		MaxUniqueEvaluations: maxUniqueEvaluations,
		ObjectiveConfig:      req.Optimization,
		RFProfile:            req.RFProfile,
		StateKeyVersion:      networkSearchStateKeyVersion,
	}
	serialized, err := json.Marshal(identity)
	if err != nil {
		return "network-search-unknown"
	}
	digest := sha256.Sum256(serialized)
	return "network-search-" + hex.EncodeToString(digest[:16])
}

func (ledger *networkSearchEvaluationLedger) evaluate(ctx context.Context, req NetworkOptimizationRequest, azimuths []float64, buildings *BuildingIndex, prepared *PreparedNetworkOptimizationContext) (networkOptimizationCandidate, bool, error) {
	key := networkSearchStateKey(req.Towers, azimuths)
	ledger.EvaluationRequests++
	if ledger.Memoize {
		if candidate, ok := ledger.Cache[key]; ok {
			ledger.CacheHits++
			return candidate, false, nil
		}
	}
	if ledger.UniqueEvaluations >= ledger.MaxUniqueEvaluations {
		return networkOptimizationCandidate{}, true, nil
	}
	breakdown, err := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
	if err != nil {
		return networkOptimizationCandidate{}, false, err
	}
	ledger.UniqueEvaluations++
	candidate := networkOptimizationCandidate{Azimuths: append([]float64(nil), azimuths...), Stats: breakdown}
	if ledger.Memoize {
		ledger.Cache[key] = candidate
	}
	if _, exists := ledger.ArchiveByState[key]; !exists {
		ledger.ArchiveByState[key] = candidate
		ledger.Archive = append(ledger.Archive, candidate)
	}
	return candidate, false, nil
}

func networkSearchScoredCandidate(candidate networkOptimizationCandidate, config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability) (NetworkOptimizationStats, bool, error) {
	scored, err := scoreNetworkOptimization(candidate.Stats, config, availability)
	if err != nil {
		return NetworkOptimizationStats{}, false, err
	}
	return scored, len(OptimizationConstraintViolations(candidate.Stats, config.Constraints)) == 0, nil
}

func runNetworkDeterministicMultiStartSearch(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex, prepared *PreparedNetworkOptimizationContext, options networkSearchRunOptions) (networkSearchRunResult, error) {
	if len(options.Starts) == 0 {
		options.Starts = deterministicNetworkSearchStarts(req)
	}
	if options.MaxPasses <= 0 {
		options.MaxPasses = DefaultNetworkSearchMaxPasses
	}
	if options.MaxUniqueEvaluations <= 0 {
		options.MaxUniqueEvaluations = DefaultNetworkSearchMaxUniqueEvaluations
	}
	if options.StepDeg <= 0 || math.IsNaN(options.StepDeg) || math.IsInf(options.StepDeg, 0) {
		options.StepDeg = networkSearchAzimuthStepDeg
	}
	ledger := &networkSearchEvaluationLedger{
		Cache:                make(map[string]networkOptimizationCandidate),
		ArchiveByState:       make(map[string]networkOptimizationCandidate),
		MaxUniqueEvaluations: options.MaxUniqueEvaluations,
		Memoize:              options.Memoize,
	}
	config := req.Optimization
	result := networkSearchRunResult{}
	result.Metadata = NetworkOptimizationSearchMetadata{
		SearchPolicy:                        DeterministicMultiStartCoordinateV1,
		Policy:                              DeterministicMultiStartCoordinateV1,
		SearchAlgorithm:                     networkSearchAlgorithm,
		SearchVersion:                       networkSearchVersion,
		Heuristic:                           true,
		Exhaustive:                          false,
		GloballyOptimal:                     false,
		SearchGuarantee:                     "heuristic_local_search",
		MultistartPolicy:                    networkSearchMultistartPolicy,
		StartCount:                          len(options.Starts),
		StartTraces:                         make([]NetworkOptimizationStartTrace, 0, len(options.Starts)),
		MaxPasses:                           options.MaxPasses,
		MaxUniqueEvaluations:                options.MaxUniqueEvaluations,
		AzimuthStepDeg:                      options.StepDeg,
		StateKeyVersion:                     networkSearchStateKeyVersion,
		CandidateDiscoveryPriorityDependent: true,
	}
	result.Metadata.SearchFingerprint = networkSearchFingerprint(req, options.Starts, options.StepDeg, options.MaxPasses, options.MaxUniqueEvaluations)

	stopAllStarts := false
	for _, start := range options.Starts {
		if err := ctx.Err(); err != nil {
			return networkSearchRunResult{}, err
		}
		trace := NetworkOptimizationStartTrace{
			StartID:          start.ID,
			StartingAzimuths: append([]float64(nil), start.Azimuths...),
			AcceptedUpdates:  []NetworkOptimizationSearchUpdate{},
			StateTrace:       []string{},
		}
		startRequests := ledger.EvaluationRequests
		startUnique := ledger.UniqueEvaluations
		startCacheHits := ledger.CacheHits
		current, budgetReached, err := ledger.evaluate(ctx, req, start.Azimuths, buildings, prepared)
		if err != nil {
			return networkSearchRunResult{}, err
		}
		if budgetReached {
			trace.TerminationReason = "evaluation_budget"
			trace.FinalAzimuths = append([]float64(nil), start.Azimuths...)
			trace.RequestedEvaluations = ledger.EvaluationRequests - startRequests
			trace.UniqueEvaluations = ledger.UniqueEvaluations - startUnique
			trace.CacheHits = ledger.CacheHits - startCacheHits
			result.Metadata.StartTraces = append(result.Metadata.StartTraces, trace)
			result.Metadata.IncompleteSearch = true
			break
		}
		if result.Metadata.StartCount == 1 && len(result.Archive) == 1 {
			result.Baseline = current
		}
		currentAzimuths := append([]float64(nil), current.Azimuths...)
		currentScored, currentFeasible, err := networkSearchScoredCandidate(current, config, prepared.ObjectiveAvailability)
		if err != nil {
			return networkSearchRunResult{}, err
		}
		trace.StateTrace = append(trace.StateTrace, networkSearchStateKey(req.Towers, currentAzimuths))
		seenStates := map[string]struct{}{trace.StateTrace[0]: {}}
		stopCurrentStart := false

		for pass := 1; pass <= options.MaxPasses; pass++ {
			trace.Passes = pass
			passAccepted := false
			for towerIndex, tower := range req.Towers {
				best := current
				bestScored := currentScored
				bestScore := currentScored.CompositeScore
				bestFeasible := currentFeasible
				bestAzimuths := append([]float64(nil), currentAzimuths...)
				budgetForPass := false
				for _, candidateAngle := range networkSearchCandidateAngles(options.StepDeg) {
					if err := ctx.Err(); err != nil {
						return networkSearchRunResult{}, err
					}
					testAzimuths := append([]float64(nil), currentAzimuths...)
					testAzimuths[towerIndex] = candidateAngle
					candidate, exhausted, evaluateErr := ledger.evaluate(ctx, req, testAzimuths, buildings, prepared)
					if evaluateErr != nil {
						return networkSearchRunResult{}, evaluateErr
					}
					if exhausted {
						budgetForPass = true
						break
					}
					candidateScored, candidateFeasible, scoreErr := networkSearchScoredCandidate(candidate, config, prepared.ObjectiveAvailability)
					if scoreErr != nil {
						return networkSearchRunResult{}, scoreErr
					}
					candidateScore := candidateScored.CompositeScore
					if (candidateFeasible && (!bestFeasible || candidateScore > bestScore)) || (!bestFeasible && !candidateFeasible && candidateScore > bestScore) {
						best = candidate
						bestScored = candidateScored
						bestScore = candidateScore
						bestFeasible = candidateFeasible
						bestAzimuths = testAzimuths
					}
				}
				if budgetForPass {
					trace.TerminationReason = "evaluation_budget"
					result.Metadata.IncompleteSearch = true
					stopAllStarts = true
					break
				}
				if networkSearchStateKey(req.Towers, bestAzimuths) == networkSearchStateKey(req.Towers, currentAzimuths) {
					continue
				}
				beforeAzimuth := currentAzimuths[towerIndex]
				beforeScored := currentScored
				beforeFeasible := currentFeasible
				current = best
				currentAzimuths = bestAzimuths
				currentScored = bestScored
				currentFeasible = bestFeasible
				passAccepted = true
				stateKey := networkSearchStateKey(req.Towers, currentAzimuths)
				trace.AcceptedUpdates = append(trace.AcceptedUpdates, NetworkOptimizationSearchUpdate{
					Pass:             pass,
					CellID:           tower.ID,
					BeforeAzimuthDeg: normalizeDegrees(beforeAzimuth),
					AfterAzimuthDeg:  normalizeDegrees(currentAzimuths[towerIndex]),
					BeforeScore:      roundFloat(beforeScored.Score, 4),
					AfterScore:       roundFloat(currentScored.Score, 4),
					BeforeFeasible:   beforeFeasible,
					AfterFeasible:    currentFeasible,
					StateFingerprint: stateKey,
				})
				trace.StateTrace = append(trace.StateTrace, stateKey)
				if _, repeated := seenStates[stateKey]; repeated {
					trace.TerminationReason = "repeated_state"
					result.Metadata.IncompleteSearch = true
					stopCurrentStart = true
					break
				}
				seenStates[stateKey] = struct{}{}
			}
			if stopAllStarts || stopCurrentStart {
				break
			}
			if !passAccepted {
				trace.TerminationReason = "coordinate_stable"
				break
			}
			if pass == options.MaxPasses {
				trace.TerminationReason = "max_passes"
				result.Metadata.IncompleteSearch = true
				break
			}
		}
		if trace.TerminationReason == "" {
			trace.TerminationReason = "coordinate_stable"
		}
		trace.FinalAzimuths = append([]float64(nil), currentAzimuths...)
		trace.FinalScore = roundFloat(currentScored.Score, 4)
		trace.FinalFeasible = currentFeasible
		trace.RequestedEvaluations = ledger.EvaluationRequests - startRequests
		trace.UniqueEvaluations = ledger.UniqueEvaluations - startUnique
		trace.CacheHits = ledger.CacheHits - startCacheHits
		result.Metadata.StartTraces = append(result.Metadata.StartTraces, trace)
		if trace.TerminationReason != "evaluation_budget" {
			result.Metadata.CompletedStartCount++
		}
		result.FinalAzimuths = append([]float64(nil), currentAzimuths...)
		if stopAllStarts {
			break
		}
	}

	if len(result.Baseline.Azimuths) == 0 && len(options.Starts) > 0 {
		if baseline, ok := ledger.ArchiveByState[networkSearchStateKey(req.Towers, options.Starts[0].Azimuths)]; ok {
			result.Baseline = baseline
		}
	}
	result.Archive = append([]networkOptimizationCandidate(nil), ledger.Archive...)
	result.Metadata.EvaluationRequests = ledger.EvaluationRequests
	result.Metadata.UniqueEvaluations = ledger.UniqueEvaluations
	result.Metadata.CacheHits = ledger.CacheHits
	result.Metadata.EvaluatedArchiveSize = len(result.Archive)
	result.Metadata.ArchiveSize = len(result.Archive)
	for _, candidate := range result.Archive {
		if len(OptimizationConstraintViolations(candidate.Stats, config.Constraints)) == 0 {
			result.Metadata.FeasibleArchiveSize++
		}
	}
	return result, nil
}

// OptimizeNetworkMultiStartContext runs the opt-in search and reuses the
// production RF evaluator, objective normalization, feasibility rules, and
// Pareto implementation used by the legacy response path.
func OptimizeNetworkMultiStartContext(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex) (NetworkOptimizationResponse, error) {
	if validationError := ValidateNetworkOptimizationSearchOptions(request); validationError != "" {
		return NetworkOptimizationResponse{}, fmt.Errorf("%s", validationError)
	}
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	if normalizeNetworkSearchPolicy(req.SearchPolicy) != DeterministicMultiStartCoordinateV1 {
		return NetworkOptimizationResponse{}, fmt.Errorf("search_policy must be %q", DeterministicMultiStartCoordinateV1)
	}
	scenarioFingerprint := NetworkScenarioFingerprint(req)
	config := req.Optimization
	if validationError := ValidateOptimizationConfig(config); validationError != "" {
		return NetworkOptimizationResponse{}, fmt.Errorf("%s", validationError)
	}
	if buildings == nil {
		buildings = EmptyBuildingIndex()
	}
	prepared, prepareErr := prepareNetworkOptimizationContext(ctx, req, buildings)
	if prepareErr != nil {
		return NetworkOptimizationResponse{}, prepareErr
	}
	if _, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability); weightErr != nil {
		return NetworkOptimizationResponse{}, weightErr
	}
	maxPasses, maxUniqueEvaluations := normalizedNetworkSearchBudgets(req)
	search, searchErr := runNetworkDeterministicMultiStartSearch(ctx, req, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            maxPasses,
		MaxUniqueEvaluations: maxUniqueEvaluations,
		Memoize:              true,
		StepDeg:              networkSearchAzimuthStepDeg,
		Starts:               deterministicNetworkSearchStarts(req),
	})
	if searchErr != nil {
		return NetworkOptimizationResponse{}, searchErr
	}
	if len(search.Baseline.Azimuths) == 0 {
		return NetworkOptimizationResponse{}, fmt.Errorf("deterministic multi-start search did not evaluate its baseline state")
	}
	baselineAzimuths := append([]float64(nil), search.Baseline.Azimuths...)
	baselineStats, scoreErr := scoreNetworkOptimization(search.Baseline.Stats, config, prepared.ObjectiveAvailability)
	if scoreErr != nil {
		return NetworkOptimizationResponse{}, scoreErr
	}
	frontier := networkParetoFrontier(search.Archive, req.Towers, config, prepared.ObjectiveAvailability)
	search.Metadata.ParetoSize = len(frontier)
	recommendedAzimuths := []float64(nil)
	recommendedStats := baselineStats
	recommended := len(frontier) > 0
	recommendedSolutionID := ""
	if recommended {
		recommendedAzimuths = azimuthsForParetoSolution(frontier[0], req.Towers)
		recommendedSolutionID = frontier[0].ID
		if candidateStats, found := networkCandidateStats(search.Archive, recommendedAzimuths); found {
			recommendedStats, scoreErr = scoreNetworkOptimization(candidateStats, config, prepared.ObjectiveAvailability)
			if scoreErr != nil {
				return NetworkOptimizationResponse{}, scoreErr
			}
		}
	} else if len(search.FinalAzimuths) > 0 {
		if candidateStats, found := networkCandidateStats(search.Archive, search.FinalAzimuths); found {
			recommendedStats, scoreErr = scoreNetworkOptimization(candidateStats, config, prepared.ObjectiveAvailability)
			if scoreErr != nil {
				return NetworkOptimizationResponse{}, scoreErr
			}
		}
	}
	demandSummary := buildings.DemandSummary("")
	baselineStats.DataQuality = demandSummary.DataQuality
	recommendedStats.DataQuality = demandSummary.DataQuality
	baselineViolations := OptimizationConstraintViolations(baselineStats, config.Constraints)
	violations := OptimizationConstraintViolations(recommendedStats, config.Constraints)
	normalizedWeights, weightErr := NormalizeAvailableOptimizationPriorities(config.Objectives, prepared.ObjectiveAvailability)
	if weightErr != nil {
		return NetworkOptimizationResponse{}, weightErr
	}
	configuredPriorities := configuredOptimizationPriorities(config.Objectives)
	optimized, optimizedErr := optimizedTowerResults(ctx, req, recommendedAzimuths, buildings)
	if optimizedErr != nil {
		return NetworkOptimizationResponse{}, optimizedErr
	}
	responseAzimuths := append([]float64(nil), search.FinalAzimuths...)
	if len(recommendedAzimuths) == len(req.Towers) {
		responseAzimuths = recommendedAzimuths
	}
	return NetworkOptimizationResponse{
		OptimizedTowers:       optimized,
		Stats:                 recommendedStats.rounded(),
		OptimizationDomain:    prepared.DomainMetadata,
		OptimizationRunID:     NetworkOptimizationRunID(req),
		RequestDefaults:       networkRequestDefaults(req),
		EffectiveCellProfiles: effectiveCellRFProfiles(req, responseAzimuths),
		RFContract:            rfContractForProfile(&req.RFProfile, req.CalibrationOffsetDB),
		ScenarioFingerprint:   scenarioFingerprint,
		ScenarioSchemaVersion: ScenarioFingerprintSchemaVersion,
		Baseline: &NetworkOptimizationSolution{
			CellConfigurations:   networkOptimizationCellConfigurations(req, baselineAzimuths),
			Parameters:           networkOptimizationParameters(req),
			Stats:                baselineStats.rounded(),
			ConstraintsSatisfied: len(baselineViolations) == 0,
			Violations:           baselineViolations,
		},
		Optimization: OptimizationOutcome{
			Objectives: config.Objectives, ConfiguredPriorities: configuredPriorities, NormalizedWeights: normalizedWeights, EffectiveWeights: normalizedWeights,
			ObjectiveStatus: recommendedStats.ObjectiveStatus, Constraints: config.Constraints,
			ObjectiveScore: math.Round(LegacyOptimizationObjectiveScore(recommendedStats, config)*10) / 10,
			CompositeScore: roundFloat(recommendedStats.CompositeScore, 6), Score: roundFloat(recommendedStats.Score, 4),
			RecommendedSolutionID: recommendedSolutionID,
			ConstraintsSatisfied:  len(violations) == 0, Recommended: recommended, Violations: violations,
			AdjustedParameters: []string{"azimuth"},
			RadioQuality:       radioQualityOptimizationMetadataPointer(prepared.RadioQualityMetadata),
			Search:             &search.Metadata,
		},
		ParetoFrontier: frontier,
	}, nil
}
