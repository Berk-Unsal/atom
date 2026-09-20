package raytracer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

const (
	networkParetoArchiveAlgorithm      = "deterministic_pareto_archive_search"
	networkParetoArchiveVersion        = "v1"
	networkParetoArchiveStartPolicy    = "multistart-policy-v1"
	networkParetoArchiveNeighborhood   = "absolute_coordinate_grid_v1"
	networkParetoArchiveQueuePolicy    = "fifo_round_then_insertion_then_state_key_v1"
	networkParetoArchiveSteppingStones = "start_set_plus_archive_admission_v1"
	networkParetoArchiveFeasibility    = "feasible_only_archive;all_deterministic_starts_expand"
	networkParetoArchiveRankingPolicy  = "existing_priority_normalized_composite_score_v1"
	networkParetoArchiveTermination    = "archive_exhausted_or_evaluation_budget_or_expansion_budget_or_round_budget"
)

// networkParetoArchiveEntry is the complete lightweight record needed by the
// exact archive policy. The raw NetworkOptimizationStats remain available in
// candidate; utilities are copied once so discovery never has to score with
// user weights.
type networkParetoArchiveEntry struct {
	candidate     networkOptimizationCandidate
	stateKey      string
	utilities     OptimizationUtilities
	feasible      bool
	admittedOrder int
}

type networkParetoArchiveQueueItem struct {
	entry networkParetoArchiveEntry
	round int
}

type networkParetoArchiveController struct {
	objectiveIDs []string
	active       map[string]networkParetoArchiveEntry
	order        []string
	comparisons  int
	removed      int
}

func newNetworkParetoArchiveController(objectiveIDs []string) *networkParetoArchiveController {
	return &networkParetoArchiveController{
		objectiveIDs: append([]string(nil), objectiveIDs...),
		active:       make(map[string]networkParetoArchiveEntry),
	}
}

// consider applies exact current Pareto semantics to one evaluated candidate.
// Feasible candidates are the only candidates retained in the active archive;
// infeasible candidates stay in the complete evaluated archive and may still
// be one of the deterministic starts expanded by the traversal policy.
func (archive *networkParetoArchiveController) consider(entry networkParetoArchiveEntry) bool {
	if !entry.feasible {
		return false
	}
	if _, exists := archive.active[entry.stateKey]; exists {
		return false
	}
	for _, key := range archive.order {
		competitor, exists := archive.active[key]
		if !exists {
			continue
		}
		archive.comparisons++
		if networkParetoArchiveDominates(competitor, entry, archive.objectiveIDs) {
			return false
		}
	}
	retained := archive.order[:0]
	for _, key := range archive.order {
		competitor, exists := archive.active[key]
		if !exists {
			continue
		}
		archive.comparisons++
		if networkParetoArchiveDominates(entry, competitor, archive.objectiveIDs) {
			delete(archive.active, key)
			archive.removed++
			continue
		}
		retained = append(retained, key)
	}
	archive.order = retained
	archive.active[entry.stateKey] = entry
	archive.order = append(archive.order, entry.stateKey)
	return true
}

func (archive *networkParetoArchiveController) candidates() []networkOptimizationCandidate {
	result := make([]networkOptimizationCandidate, 0, len(archive.order))
	for _, key := range archive.order {
		if entry, ok := archive.active[key]; ok {
			result = append(result, entry.candidate)
		}
	}
	return result
}

func networkParetoArchiveDominates(left, right networkParetoArchiveEntry, objectiveIDs []string) bool {
	if !left.feasible || !right.feasible {
		return false
	}
	strictlyBetter := false
	for _, id := range objectiveIDs {
		leftValue := objectiveUtility(left.utilities, id)
		rightValue := objectiveUtility(right.utilities, id)
		if leftValue < rightValue {
			return false
		}
		if leftValue > rightValue {
			strictlyBetter = true
		}
	}
	return strictlyBetter
}

func networkParetoArchiveObjectiveIDs(config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability) []string {
	// Keep the production Pareto contract: every objective that exists in the
	// fixed domain participates when available. User weights are ranking inputs,
	// and omission/zero weight must not silently remove a discovery dimension.
	_ = config
	ids := make([]string, 0, len(optimizationObjectiveIDs))
	for _, id := range optimizationObjectiveIDs {
		status, exists := availability[id]
		if exists && !status.Available {
			continue
		}
		ids = append(ids, id)
	}
	return ids
}

func networkParetoArchiveEntryForCandidate(candidate networkOptimizationCandidate, config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability, admittedOrder int) networkParetoArchiveEntry {
	return networkParetoArchiveEntry{
		candidate:     candidate,
		stateKey:      networkSearchStateKeyFromCandidate(candidate),
		utilities:     NormalizeOptimizationObjectives(candidate.Stats),
		feasible:      len(OptimizationConstraintViolations(candidate.Stats, config.Constraints)) == 0,
		admittedOrder: admittedOrder,
	}
}

func networkSearchStateKeyFromCandidate(candidate networkOptimizationCandidate) string {
	// The request tower list is not stored on a candidate. azimuthKey is the
	// stable request-order identity used by the public Pareto solution and is
	// sufficient here because the controller is scoped to one request.
	return azimuthKey(candidate.Azimuths)
}

func networkParetoArchiveQueueSort(queue []networkParetoArchiveQueueItem) {
	sort.SliceStable(queue, func(left, right int) bool {
		if queue[left].round != queue[right].round {
			return queue[left].round < queue[right].round
		}
		if queue[left].entry.admittedOrder != queue[right].entry.admittedOrder {
			return queue[left].entry.admittedOrder < queue[right].entry.admittedOrder
		}
		return queue[left].entry.stateKey < queue[right].entry.stateKey
	})
}

// priorityIndependentNetworkScenarioIdentity deliberately excludes objective
// weights, search policy, and all other ranking-only inputs.
func priorityIndependentNetworkScenarioIdentity(req NetworkOptimizationRequest, objectiveIDs []string, availability map[string]OptimizationObjectiveAvailability) any {
	normalized := req
	NormalizeNetworkOptimizationRequest(&normalized)
	towers := append([]NetworkTowerRequest(nil), normalized.Towers...)
	sort.SliceStable(towers, func(left, right int) bool { return towers[left].ID < towers[right].ID })
	availabilityCopy := make(map[string]OptimizationObjectiveAvailability, len(availability))
	for _, id := range optimizationObjectiveIDs {
		if status, ok := availability[id]; ok {
			availabilityCopy[id] = status
		}
	}
	return struct {
		SchemaVersion       string                                       `json:"schema_version"`
		Towers              []NetworkTowerRequest                        `json:"towers"`
		Rays                int                                          `json:"rays"`
		RadiusMeters        float64                                      `json:"radius_m"`
		FrequencyGHz        float64                                      `json:"frequency_ghz"`
		TxPowerDBm          float64                                      `json:"tx_power_dbm"`
		BeamWidthDeg        float64                                      `json:"beam_width_deg"`
		CalibrationOffsetDB float64                                      `json:"calibration_offset_db"`
		RFProfile           CellRFProfile                                `json:"rf_profile"`
		Constraints         OptimizationConstraints                      `json:"constraints"`
		ObjectiveSet        []string                                     `json:"objective_set"`
		Availability        map[string]OptimizationObjectiveAvailability `json:"objective_availability"`
	}{
		SchemaVersion:       ScenarioFingerprintSchemaVersion,
		Towers:              towers,
		Rays:                normalized.Rays,
		RadiusMeters:        normalized.RadiusMeters,
		FrequencyGHz:        normalized.FrequencyGHz,
		TxPowerDBm:          normalized.TxPowerDBm,
		BeamWidthDeg:        normalized.BeamWidthDeg,
		CalibrationOffsetDB: normalized.CalibrationOffsetDB,
		RFProfile:           normalized.RFProfile,
		Constraints:         normalized.Optimization.Constraints,
		ObjectiveSet:        append([]string(nil), objectiveIDs...),
		Availability:        availabilityCopy,
	}
}

func networkParetoArchiveDiscoveryFingerprint(req NetworkOptimizationRequest, starts []networkSearchStartSpec, objectiveIDs []string, availability map[string]OptimizationObjectiveAvailability, step float64, maxUniqueEvaluations, maxExpandedStates, maxRounds int) string {
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
		Policy               string                                       `json:"policy"`
		Algorithm            string                                       `json:"algorithm"`
		Version              string                                       `json:"version"`
		Scenario             any                                          `json:"scenario"`
		CellOrder            []string                                     `json:"cell_order"`
		Starts               any                                          `json:"starts"`
		Neighborhood         string                                       `json:"neighborhood"`
		CandidateGrid        []float64                                    `json:"candidate_grid"`
		ObjectiveSet         []string                                     `json:"objective_set"`
		Availability         map[string]OptimizationObjectiveAvailability `json:"objective_availability"`
		QueuePolicy          string                                       `json:"queue_policy"`
		SteppingStonePolicy  string                                       `json:"stepping_stone_policy"`
		MaxUniqueEvaluations int                                          `json:"max_unique_evaluations"`
		MaxExpandedStates    int                                          `json:"max_expanded_states"`
		MaxRounds            int                                          `json:"max_rounds"`
		StateKeyVersion      string                                       `json:"state_key_version"`
	}{
		Policy:               DeterministicParetoArchiveSearchV1,
		Algorithm:            networkParetoArchiveAlgorithm,
		Version:              networkParetoArchiveVersion,
		Scenario:             priorityIndependentNetworkScenarioIdentity(req, objectiveIDs, availability),
		CellOrder:            cellOrder,
		Starts:               startIdentity,
		Neighborhood:         networkParetoArchiveNeighborhood,
		CandidateGrid:        networkSearchCandidateAngles(step),
		ObjectiveSet:         append([]string(nil), objectiveIDs...),
		Availability:         availability,
		QueuePolicy:          networkParetoArchiveQueuePolicy,
		SteppingStonePolicy:  networkParetoArchiveSteppingStones,
		MaxUniqueEvaluations: maxUniqueEvaluations,
		MaxExpandedStates:    maxExpandedStates,
		MaxRounds:            maxRounds,
		StateKeyVersion:      networkSearchStateKeyVersion,
	}
	serialized, err := json.Marshal(identity)
	if err != nil {
		return "network-discovery-unknown"
	}
	digest := sha256.Sum256(serialized)
	return "network-discovery-" + hex.EncodeToString(digest[:16])
}

func networkParetoArchiveRankingFingerprint(discoveryFingerprint string, config OptimizationConfig) string {
	identity := struct {
		DiscoveryFingerprint string                  `json:"discovery_fingerprint"`
		RankingPolicy        string                  `json:"ranking_policy"`
		Objectives           []OptimizationObjective `json:"objectives"`
	}{
		DiscoveryFingerprint: discoveryFingerprint,
		RankingPolicy:        networkParetoArchiveRankingPolicy,
		Objectives:           append([]OptimizationObjective(nil), config.Objectives...),
	}
	serialized, err := json.Marshal(identity)
	if err != nil {
		return "network-ranking-unknown"
	}
	digest := sha256.Sum256(serialized)
	return "network-ranking-" + hex.EncodeToString(digest[:16])
}

func normalizedNetworkParetoArchiveBudgets(req NetworkOptimizationRequest) (maxExpandedStates, maxRounds, maxUniqueEvaluations int) {
	maxExpandedStates = req.MaxExpandedStates
	if maxExpandedStates == 0 {
		maxExpandedStates = DefaultNetworkSearchMaxExpandedStates
	}
	maxRounds = req.MaxSearchRounds
	if maxRounds == 0 {
		maxRounds = req.MaxSearchPasses
	}
	if maxRounds == 0 {
		maxRounds = DefaultNetworkSearchMaxRounds
	}
	maxUniqueEvaluations = req.MaxUniqueEvaluations
	if maxUniqueEvaluations == 0 {
		maxUniqueEvaluations = DefaultNetworkSearchMaxUniqueEvaluations
	}
	return maxExpandedStates, maxRounds, maxUniqueEvaluations
}

func runNetworkDeterministicParetoArchiveSearch(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex, prepared *PreparedNetworkOptimizationContext, options networkSearchRunOptions) (networkSearchRunResult, error) {
	if len(options.Starts) == 0 {
		options.Starts = deterministicNetworkSearchStarts(req)
	}
	if options.MaxUniqueEvaluations <= 0 {
		options.MaxUniqueEvaluations = DefaultNetworkSearchMaxUniqueEvaluations
	}
	if options.MaxPasses <= 0 {
		options.MaxPasses = DefaultNetworkSearchMaxRounds
	}
	if options.StepDeg <= 0 || math.IsNaN(options.StepDeg) || math.IsInf(options.StepDeg, 0) {
		options.StepDeg = networkSearchAzimuthStepDeg
	}
	maxExpandedStates := options.MaxExpandedStates
	if maxExpandedStates <= 0 {
		maxExpandedStates = DefaultNetworkSearchMaxExpandedStates
	}
	objectiveIDs := networkParetoArchiveObjectiveIDs(req.Optimization, prepared.ObjectiveAvailability)
	controller := newNetworkParetoArchiveController(objectiveIDs)
	ledger := &networkSearchEvaluationLedger{
		Cache:                make(map[string]networkOptimizationCandidate),
		ArchiveByState:       make(map[string]networkOptimizationCandidate),
		MaxUniqueEvaluations: options.MaxUniqueEvaluations,
		Memoize:              true,
	}
	result := networkSearchRunResult{}
	discoveryFingerprint := networkParetoArchiveDiscoveryFingerprint(req, options.Starts, objectiveIDs, prepared.ObjectiveAvailability, options.StepDeg, options.MaxUniqueEvaluations, maxExpandedStates, options.MaxPasses)
	result.Metadata = NetworkOptimizationSearchMetadata{
		SearchPolicy:                        DeterministicParetoArchiveSearchV1,
		Policy:                              DeterministicParetoArchiveSearchV1,
		SearchAlgorithm:                     networkParetoArchiveAlgorithm,
		SearchVersion:                       networkParetoArchiveVersion,
		Heuristic:                           true,
		Exhaustive:                          false,
		GloballyOptimal:                     false,
		SearchGuarantee:                     "bounded_multiobjective_local_search",
		MultistartPolicy:                    networkSearchMultistartPolicy,
		StartCount:                          len(options.Starts),
		StartTraces:                         make([]NetworkOptimizationStartTrace, 0, len(options.Starts)),
		CandidateDiscoveryPriorityDependent: false,
		SearchFingerprint:                   discoveryFingerprint,
		DiscoveryFingerprint:                discoveryFingerprint,
		PriorityIndependentDiscovery:        true,
		ObjectiveSet:                        append([]string(nil), objectiveIDs...),
		ObjectiveAvailability:               cloneOptimizationObjectiveAvailability(prepared.ObjectiveAvailability),
		StartPolicy:                         networkParetoArchiveStartPolicy,
		NeighborhoodPolicy:                  networkParetoArchiveNeighborhood,
		QueuePolicy:                         networkParetoArchiveQueuePolicy,
		SteppingStonePolicy:                 networkParetoArchiveSteppingStones,
		FeasibilityPolicy:                   networkParetoArchiveFeasibility,
		TerminationReason:                   "",
		BudgetComplete:                      false,
		MaxPasses:                           options.MaxPasses,
		MaxExpandedStates:                   maxExpandedStates,
		MaxSearchRounds:                     options.MaxPasses,
		AzimuthStepDeg:                      options.StepDeg,
		StateKeyVersion:                     networkSearchStateKeyVersion,
	}

	queue := make([]networkParetoArchiveQueueItem, 0, len(options.Starts))
	queued := make(map[string]struct{})
	expanded := make(map[string]struct{})
	evaluatedStarts := make(map[string]struct{}, len(options.Starts))
	startAccounting := make(map[string]struct {
		requests  int
		unique    int
		cacheHits int
	}, len(options.Starts))
	admittedOrder := 0
	enqueue := func(entry networkParetoArchiveEntry, round int) {
		if _, exists := queued[entry.stateKey]; exists {
			return
		}
		if _, exists := expanded[entry.stateKey]; exists {
			return
		}
		queued[entry.stateKey] = struct{}{}
		queue = append(queue, networkParetoArchiveQueueItem{entry: entry, round: round})
	}
	for _, start := range options.Starts {
		if err := ctx.Err(); err != nil {
			return networkSearchRunResult{}, err
		}
		beforeRequests := ledger.EvaluationRequests
		beforeUnique := ledger.UniqueEvaluations
		beforeCacheHits := ledger.CacheHits
		candidate, exhausted, err := ledger.evaluate(ctx, req, start.Azimuths, buildings, prepared)
		if err != nil {
			return networkSearchRunResult{}, err
		}
		if exhausted {
			result.Metadata.TerminationReason = "evaluation_budget"
			result.Metadata.IncompleteSearch = true
			break
		}
		if len(result.Baseline.Azimuths) == 0 {
			result.Baseline = candidate
		}
		evaluatedStarts[start.ID] = struct{}{}
		startAccounting[start.ID] = struct {
			requests  int
			unique    int
			cacheHits int
		}{
			requests:  ledger.EvaluationRequests - beforeRequests,
			unique:    ledger.UniqueEvaluations - beforeUnique,
			cacheHits: ledger.CacheHits - beforeCacheHits,
		}
		entry := networkParetoArchiveEntryForCandidate(candidate, req.Optimization, prepared.ObjectiveAvailability, admittedOrder)
		admittedOrder++
		_ = controller.consider(entry)
		// All deterministic starts are expansion seeds, even if one is already
		// dominated by another start. This is the explicit start-set diversity
		// stepping-stone policy, not a weighted-score decision.
		enqueue(entry, 0)
		result.Metadata.CompletedStartCount++
		result.FinalAzimuths = append([]float64(nil), candidate.Azimuths...)
	}
	if result.Metadata.TerminationReason == "evaluation_budget" {
		result.Metadata.IncompleteSearch = true
	}
	result.Metadata.StartTraces = make([]NetworkOptimizationStartTrace, 0, len(options.Starts))
	for _, start := range options.Starts {
		if _, evaluated := evaluatedStarts[start.ID]; !evaluated {
			continue
		}
		key := networkSearchStateKey(req.Towers, start.Azimuths)
		candidate, exists := ledger.ArchiveByState[key]
		trace := NetworkOptimizationStartTrace{
			StartID:              start.ID,
			StartingAzimuths:     append([]float64(nil), start.Azimuths...),
			AcceptedUpdates:      []NetworkOptimizationSearchUpdate{},
			FinalAzimuths:        append([]float64(nil), start.Azimuths...),
			RequestedEvaluations: startAccounting[start.ID].requests,
			UniqueEvaluations:    startAccounting[start.ID].unique,
			CacheHits:            startAccounting[start.ID].cacheHits,
			TerminationReason:    "enqueued",
			StateTrace:           []string{key},
		}
		if exists {
			trace.FinalFeasible = len(OptimizationConstraintViolations(candidate.Stats, req.Optimization.Constraints)) == 0
		}
		result.Metadata.StartTraces = append(result.Metadata.StartTraces, trace)
	}

	appendGrowth := func(round int, queuedExpansions int) {
		feasible := 0
		for _, candidate := range ledger.Archive {
			if len(OptimizationConstraintViolations(candidate.Stats, req.Optimization.Constraints)) == 0 {
				feasible++
			}
		}
		result.Metadata.ArchiveGrowth = append(result.Metadata.ArchiveGrowth, NetworkOptimizationArchiveRound{
			Round:                 round,
			TotalEvaluated:        len(ledger.Archive),
			FeasibleEvaluated:     feasible,
			ActiveParetoSize:      len(controller.active),
			RemovedDominatedCount: controller.removed,
			QueuedExpansions:      queuedExpansions,
			ExpandedStates:        len(expanded),
			CacheHits:             ledger.CacheHits,
		})
	}

	for round := 0; len(queue) > 0 && result.Metadata.TerminationReason == ""; round++ {
		if round >= options.MaxPasses {
			result.Metadata.TerminationReason = "max_rounds"
			result.Metadata.IncompleteSearch = true
			break
		}
		batch := make([]networkParetoArchiveQueueItem, 0, len(queue))
		remaining := queue[:0]
		for _, item := range queue {
			if item.round == round {
				batch = append(batch, item)
			} else {
				remaining = append(remaining, item)
			}
		}
		queue = remaining
		networkParetoArchiveQueueSort(batch)
		for _, item := range batch {
			if _, alreadyExpanded := expanded[item.entry.stateKey]; alreadyExpanded {
				continue
			}
			if len(expanded) >= maxExpandedStates {
				result.Metadata.TerminationReason = "max_expanded_states"
				result.Metadata.IncompleteSearch = true
				break
			}
			expanded[item.entry.stateKey] = struct{}{}
			result.FinalAzimuths = append([]float64(nil), item.entry.candidate.Azimuths...)
			for towerIndex := range req.Towers {
				for _, angle := range networkSearchCandidateAngles(options.StepDeg) {
					if err := ctx.Err(); err != nil {
						return networkSearchRunResult{}, err
					}
					testAzimuths := append([]float64(nil), item.entry.candidate.Azimuths...)
					testAzimuths[towerIndex] = angle
					key := networkSearchStateKey(req.Towers, testAzimuths)
					result.Metadata.NeighborRequests++
					_, wasEvaluated := ledger.ArchiveByState[key]
					if wasEvaluated {
						result.Metadata.DuplicateEdgeCount++
					}
					candidate, exhausted, err := ledger.evaluate(ctx, req, testAzimuths, buildings, prepared)
					if err != nil {
						return networkSearchRunResult{}, err
					}
					if exhausted {
						result.Metadata.TerminationReason = "evaluation_budget"
						result.Metadata.IncompleteSearch = true
						break
					}
					if !wasEvaluated {
						entry := networkParetoArchiveEntryForCandidate(candidate, req.Optimization, prepared.ObjectiveAvailability, admittedOrder)
						admittedOrder++
						if controller.consider(entry) {
							enqueue(entry, round+1)
						}
					}
				}
				if result.Metadata.TerminationReason != "" {
					break
				}
			}
			if result.Metadata.TerminationReason != "" {
				break
			}
		}
		result.Metadata.SearchRounds++
		appendGrowth(round, len(queue))
	}
	if result.Metadata.TerminationReason == "" {
		result.Metadata.TerminationReason = "archive_exhausted"
		result.Metadata.BudgetComplete = true
	}
	if result.Metadata.TerminationReason != "archive_exhausted" {
		result.Metadata.IncompleteSearch = true
	}
	result.Metadata.EvaluationRequests = ledger.EvaluationRequests
	result.Metadata.UniqueEvaluations = ledger.UniqueEvaluations
	result.Metadata.CacheHits = ledger.CacheHits
	result.Metadata.EvaluatedArchiveSize = len(ledger.Archive)
	result.Metadata.ArchiveSize = len(ledger.Archive)
	result.Metadata.MaxUniqueEvaluations = options.MaxUniqueEvaluations
	result.Metadata.FeasibleArchiveSize = 0
	for _, candidate := range ledger.Archive {
		if len(OptimizationConstraintViolations(candidate.Stats, req.Optimization.Constraints)) == 0 {
			result.Metadata.FeasibleArchiveSize++
		}
	}
	result.Metadata.RemovedDominatedCount = controller.removed
	result.Metadata.DominanceComparisons = controller.comparisons
	result.Metadata.ExpandedStates = len(expanded)
	result.Metadata.ActiveParetoSize = len(controller.active)
	result.Metadata.BudgetComplete = result.Metadata.TerminationReason == "archive_exhausted"
	result.Archive = append([]networkOptimizationCandidate(nil), ledger.Archive...)
	result.ActiveArchive = controller.candidates()
	result.Metadata.StartTraces = updateParetoArchiveStartTraces(result.Metadata.StartTraces, ledger.Archive, req)
	return result, nil
}

func updateParetoArchiveStartTraces(traces []NetworkOptimizationStartTrace, archive []networkOptimizationCandidate, req NetworkOptimizationRequest) []NetworkOptimizationStartTrace {
	byKey := make(map[string]networkOptimizationCandidate, len(archive))
	for _, candidate := range archive {
		byKey[networkSearchStateKey(req.Towers, candidate.Azimuths)] = candidate
	}
	for index := range traces {
		key := networkSearchStateKey(req.Towers, traces[index].StartingAzimuths)
		if candidate, ok := byKey[key]; ok {
			scored, err := scoreNetworkOptimization(candidate.Stats, req.Optimization)
			if err == nil {
				traces[index].FinalScore = roundFloat(scored.Score, 4)
			}
		}
	}
	return traces
}

func cloneOptimizationObjectiveAvailability(source map[string]OptimizationObjectiveAvailability) map[string]OptimizationObjectiveAvailability {
	if source == nil {
		return nil
	}
	clone := make(map[string]OptimizationObjectiveAvailability, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

// networkParetoFrontierFromActiveArchive applies existing priority ranking
// only after the priority-independent archive has been constructed.
func networkParetoFrontierFromActiveArchive(candidates []networkOptimizationCandidate, towers []NetworkTowerRequest, config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability, objectiveIDs []string) []NetworkParetoSolution {
	frontier := make([]NetworkParetoSolution, 0, len(candidates))
	for _, candidate := range candidates {
		if len(OptimizationConstraintViolations(candidate.Stats, config.Constraints)) > 0 {
			continue
		}
		scored, err := scoreNetworkOptimization(candidate.Stats, config, availability)
		if err != nil {
			continue
		}
		settings := make([]ParetoTowerSetting, 0, len(towers))
		for towerIndex, tower := range towers {
			if towerIndex < len(candidate.Azimuths) {
				settings = append(settings, ParetoTowerSetting{ID: tower.ID, AzimuthDeg: normalizeDegrees(candidate.Azimuths[towerIndex])})
			}
		}
		frontier = append(frontier, NetworkParetoSolution{
			ID:             azimuthKey(candidate.Azimuths),
			Towers:         settings,
			Stats:          scored.rounded(),
			ObjectiveScore: math.Round(LegacyOptimizationObjectiveScore(candidate.Stats, config)*10) / 10,
			CompositeScore: roundFloat(scored.CompositeScore, 6),
			Score:          roundFloat(scored.Score, 4),
			Explanation:    fmt.Sprintf("Feasible non-dominated evaluated state across %s; priorities rank this discovered trade-off after search.", joinObjectiveIDs(objectiveIDs)),
		})
	}
	// The response contract exposes at most 25 solutions. Select that bounded
	// view by stable state identity before applying priority ranking so changing
	// weights can reorder the discovered view but cannot change its membership.
	if len(frontier) > 25 {
		sort.SliceStable(frontier, func(left, right int) bool { return frontier[left].ID < frontier[right].ID })
		frontier = frontier[:25]
	}
	sort.SliceStable(frontier, func(left, right int) bool {
		if frontier[left].Score == frontier[right].Score {
			return paretoTowerKey(frontier[left]) < paretoTowerKey(frontier[right])
		}
		return frontier[left].Score > frontier[right].Score
	})
	if frontier == nil {
		frontier = []NetworkParetoSolution{}
	}
	return frontier
}

func joinObjectiveIDs(ids []string) string {
	if len(ids) == 0 {
		return "no available objectives"
	}
	result := ids[0]
	for _, id := range ids[1:] {
		result += ", " + id
	}
	return result
}

// RerankNetworkParetoSolutions is a pure operation over stored Pareto
// solution metrics. It performs no RF evaluation and intentionally preserves
// frontier membership.
func RerankNetworkParetoSolutions(frontier []NetworkParetoSolution, config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability) ([]NetworkParetoSolution, error) {
	ranked := append([]NetworkParetoSolution(nil), frontier...)
	for index := range ranked {
		stats, err := scoreNetworkOptimization(ranked[index].Stats, config, availability)
		if err != nil {
			return nil, err
		}
		ranked[index].Stats = stats.rounded()
		ranked[index].ObjectiveScore = math.Round(LegacyOptimizationObjectiveScore(stats, config)*10) / 10
		ranked[index].CompositeScore = roundFloat(stats.CompositeScore, 6)
		ranked[index].Score = roundFloat(stats.Score, 4)
	}
	sort.SliceStable(ranked, func(left, right int) bool {
		if ranked[left].Score == ranked[right].Score {
			return paretoTowerKey(ranked[left]) < paretoTowerKey(ranked[right])
		}
		return ranked[left].Score > ranked[right].Score
	})
	return ranked, nil
}

func OptimizeNetworkParetoArchiveContext(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex) (NetworkOptimizationResponse, error) {
	if validationError := ValidateNetworkOptimizationSearchOptions(request); validationError != "" {
		return NetworkOptimizationResponse{}, fmt.Errorf("%s", validationError)
	}
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	if normalizeNetworkSearchPolicy(req.SearchPolicy) != DeterministicParetoArchiveSearchV1 {
		return NetworkOptimizationResponse{}, fmt.Errorf("search_policy must be %q", DeterministicParetoArchiveSearchV1)
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
	maxExpandedStates, maxRounds, maxUniqueEvaluations := normalizedNetworkParetoArchiveBudgets(req)
	search, searchErr := runNetworkDeterministicParetoArchiveSearch(ctx, req, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            maxRounds,
		MaxUniqueEvaluations: maxUniqueEvaluations,
		MaxExpandedStates:    maxExpandedStates,
		Memoize:              true,
		StepDeg:              networkSearchAzimuthStepDeg,
		Starts:               deterministicNetworkSearchStarts(req),
	})
	if searchErr != nil {
		return NetworkOptimizationResponse{}, searchErr
	}
	if len(search.Baseline.Azimuths) == 0 {
		return NetworkOptimizationResponse{}, fmt.Errorf("deterministic Pareto archive search did not evaluate its baseline state")
	}
	baselineAzimuths := append([]float64(nil), search.Baseline.Azimuths...)
	baselineStats, scoreErr := scoreNetworkOptimization(search.Baseline.Stats, config, prepared.ObjectiveAvailability)
	if scoreErr != nil {
		return NetworkOptimizationResponse{}, scoreErr
	}
	frontier := networkParetoFrontierFromActiveArchive(search.ActiveArchive, req.Towers, config, prepared.ObjectiveAvailability, search.Metadata.ObjectiveSet)
	search.Metadata.ParetoSize = len(frontier)
	search.Metadata.ActiveParetoSize = len(search.ActiveArchive)
	search.Metadata.RankingFingerprint = networkParetoArchiveRankingFingerprint(search.Metadata.DiscoveryFingerprint, config)
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
